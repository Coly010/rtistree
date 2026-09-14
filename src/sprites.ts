import { extname, basename, resolve } from 'node:path';
import { z } from 'zod';
import { createCanvas } from './native.js';
import { writeArtifact } from './artifacts.js';
import { sceneHash, sha256 } from './assets.js';
import { spriteAtlasSchema, type SpriteAtlas, type Sprites } from './schema.js';
import type { Project } from './project.js';

/** Controls the two portable artifacts written by exportSpriteSheet. */
export const spriteSheetOptionsSchema = z.strictObject({
  manifest: z.string().min(1).max(2048).optional(),
  atlas: spriteAtlasSchema.optional(),
});
export type SpriteSheetOptions = z.infer<typeof spriteSheetOptionsSchema>;

type Placement = { id: string; x: number; y: number; width: number; height: number };

function nextPowerOfTwo(value: number) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function packFrames(sprites: Sprites, atlas: SpriteAtlas) {
  const margin = atlas.padding + atlas.extrusion;
  const frames = Object.entries(sprites.frames)
    .map(([id, frame]) => ({
      id,
      width: frame.bounds[2] + margin * 2,
      height: frame.bounds[3] + margin * 2,
    }))
    // The explicit sort means authored object ordering cannot change the atlas.
    .sort((a, b) => b.height - a.height || b.width - a.width || a.id.localeCompare(b.id));
  const widest = Math.max(...frames.map((frame) => frame.width));
  // POT sheets start at the narrowest possible valid power of two. This can
  // fit tall sparse sets that a square-root estimate would wrongly reject.
  const minimum = atlas.power_of_two
    ? widest
    : Math.max(
        widest,
        Math.ceil(Math.sqrt(frames.reduce((sum, frame) => sum + frame.width * frame.height, 0))),
      );
  if (minimum > atlas.max_width) throw new Error('Sprite atlas frames exceed max_width');
  let width = atlas.power_of_two ? nextPowerOfTwo(minimum) : minimum;
  if (width > atlas.max_width) throw new Error('Sprite atlas power-of-two width exceeds max_width');
  while (true) {
    let x = 0,
      y = 0,
      rowHeight = 0,
      usedWidth = 0;
    const placements: Placement[] = [];
    for (const frame of frames) {
      if (x && x + frame.width > width) {
        y += rowHeight;
        x = 0;
        rowHeight = 0;
      }
      if (y + frame.height > 8192) break;
      placements.push({ ...frame, x, y });
      x += frame.width;
      rowHeight = Math.max(rowHeight, frame.height);
      usedWidth = Math.max(usedWidth, x);
    }
    if (placements.length === frames.length) {
      const usedHeight = y + rowHeight;
      const outputWidth = atlas.power_of_two ? width : usedWidth;
      const outputHeight = atlas.power_of_two ? nextPowerOfTwo(usedHeight) : usedHeight;
      if (outputWidth > 8192 || outputHeight > 8192)
        throw new Error('Sprite atlas exceeds 8192 pixels');
      return { placements, width: outputWidth, height: outputHeight };
    }
    const next = atlas.power_of_two
      ? width * 2
      : Math.min(atlas.max_width, Math.max(width + 1, Math.ceil(width * 1.5)));
    if (next > atlas.max_width || next === width)
      throw new Error('Sprite atlas cannot fit within max_width and 8192-pixel height');
    width = next;
  }
}

function copyPixel(
  target: Uint8ClampedArray,
  targetWidth: number,
  targetX: number,
  targetY: number,
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceX: number,
  sourceY: number,
) {
  const to = (targetY * targetWidth + targetX) * 4,
    from = (sourceY * sourceWidth + sourceX) * 4;
  target.set(source.subarray(from, from + 4), to);
}

/**
 * Render declared canvas-frame sprites once and pack their exact RGBA pixels
 * into a deterministic, engine-neutral PNG atlas and JSON manifest. Frames are
 * intentionally not trimmed: their declared bounds and pivots remain stable.
 */
export async function exportSpriteSheet(project: Project, output: string, raw: unknown = {}) {
  const options = spriteSheetOptionsSchema.parse(raw);
  if (extname(output).toLowerCase() !== '.png')
    throw new Error('Sprite atlas output must end in .png');
  const image = resolve(output),
    manifest = resolve(options.manifest ?? output.replace(/\.png$/i, '.json'));
  if (image === manifest)
    throw new Error('Sprite atlas image and manifest must have different paths');
  if (extname(manifest).toLowerCase() !== '.json')
    throw new Error('Sprite atlas manifest must end in .json');
  const scene = await project.scene(),
    sprites = scene.sprites;
  if (!sprites) throw new Error('Scene has no sprites manifest');
  const atlas = spriteAtlasSchema.parse({ ...sprites.atlas, ...options.atlas }),
    packing = packFrames(sprites, atlas),
    render = await project.render({ quality: 'final', cache: false }),
    canvas = createCanvas(packing.width, packing.height),
    context = canvas.getContext('2d'),
    pixels = context.createImageData(packing.width, packing.height),
    records: Record<string, unknown> = {};
  const placements = new Map(packing.placements.map((placement) => [placement.id, placement]));
  for (const [id, frame] of Object.entries(sprites.frames)) {
    const placement = placements.get(id)!;
    const [sourceX, sourceY, width, height] = frame.bounds;
    const x = placement.x + atlas.padding + atlas.extrusion,
      y = placement.y + atlas.padding + atlas.extrusion;
    for (let py = 0; py < height; py++)
      for (let px = 0; px < width; px++)
        copyPixel(
          pixels.data,
          packing.width,
          x + px,
          y + py,
          render.pixels,
          render.width,
          sourceX + px,
          sourceY + py,
        );
    // Copy edge pixels into the extrusion ring. Padding outside this ring stays transparent.
    for (let py = -atlas.extrusion; py < height + atlas.extrusion; py++)
      for (let px = -atlas.extrusion; px < width + atlas.extrusion; px++) {
        if (px >= 0 && py >= 0 && px < width && py < height) continue;
        copyPixel(
          pixels.data,
          packing.width,
          x + px,
          y + py,
          render.pixels,
          render.width,
          sourceX + Math.max(0, Math.min(width - 1, px)),
          sourceY + Math.max(0, Math.min(height - 1, py)),
        );
      }
    records[id] = {
      frame: [x, y, width, height],
      source: frame.bounds,
      pivot: frame.pivot,
      duration: frame.duration,
      tags: frame.tags,
    };
  }
  context.putImageData(pixels, 0, 0);
  const png = await canvas.encode('png'),
    pngHash = sha256(png),
    document = {
      format: 'rtistree-sprites@1',
      image: basename(image),
      size: [packing.width, packing.height],
      frames: records,
      animations: sprites.animations,
      atlas: { ...atlas, packing: 'shelf-v1', trimmed: false, sampling: 'nearest' },
      evidence: {
        scene_hash: sceneHash(scene),
        source_png_hash: render.evidence.render.png_hash,
        atlas_png_hash: pngHash,
      },
    };
  await writeArtifact(image, png);
  await writeArtifact(manifest, JSON.stringify(document, null, 2) + '\n');
  return {
    image,
    manifest,
    width: packing.width,
    height: packing.height,
    frames: Object.keys(records).length,
    animations: Object.keys(sprites.animations).length,
    evidence: document.evidence,
  };
}
