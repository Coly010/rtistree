import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { Project } from '../../dist/index.js';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('.', import.meta.url));
const scene = JSON.parse(await readFile(join(root, 'scene.json'), 'utf8'));
const expectedFrames = ['walk_0', 'walk_1', 'walk_2', 'walk_3'];
const expectedPalette = new Set(scene.pixel_art.palette.map((colour) => colour.toLowerCase()));
const temporary = await mkdtemp(join(tmpdir(), 'rtistree-pixel-sprite-'));

async function sprites(target) {
  const atlas = join(target, 'atlas.png');
  const manifest = join(target, 'atlas.json');
  await exec(process.execPath, [
    join(root, '../../dist/cli.js'),
    'sprites',
    join(root, 'scene.json'),
    '-o',
    atlas,
    '--manifest',
    manifest,
  ]);
  return { atlas, manifest: JSON.parse(await readFile(manifest, 'utf8')) };
}

try {
  const first = await sprites(temporary);
  const second = await sprites(temporary + '-cold');
  const frames = first.manifest.frames ?? first.manifest.sprites?.frames;
  const animations = first.manifest.animations ?? first.manifest.sprites?.animations;
  if (!frames || !animations) throw new Error('Sprite manifest must include frames and animations');
  const firstBytes = await readFile(first.atlas);
  const secondBytes = await readFile(second.atlas);
  const atlas = await sharp(firstBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const source = await (
    await Project.open(join(root, 'scene.json'))
  ).render({ quality: 'final', cache: false });
  let paletteOnly = true;
  for (let i = 0; i < atlas.data.length; i += 4) {
    const hex = `#${[0, 1, 2, 3].map((channel) => atlas.data[i + channel].toString(16).padStart(2, '0')).join('')}`;
    if (!expectedPalette.has(hex) && !expectedPalette.has(hex.slice(0, 7))) paletteOnly = false;
  }
  const checks = expectedFrames.map((id) => {
    const frame = frames[id];
    const rect = frame?.frame ?? frame?.bounds ?? frame;
    if (!rect) return { id, present: false };
    const x = rect.x ?? rect[0],
      y = rect.y ?? rect[1],
      w = rect.w ?? rect[2],
      h = rect.h ?? rect[3];
    let opaque = 0,
      border = 0,
      sourcePixelsIdentical = true;
    const [sourceX, sourceY] = scene.sprites.frames[id].bounds;
    for (let row = 0; row < h; row++)
      for (let column = 0; column < w; column++) {
        const atlasOffset = (y + row) * atlas.info.width * 4 + (x + column) * 4;
        const sourceOffset = (sourceY + row) * source.width * 4 + (sourceX + column) * 4;
        const alpha = atlas.data[atlasOffset + 3];
        if (alpha) opaque++;
        if (alpha && (row === 0 || column === 0 || row === h - 1 || column === w - 1)) border++;
        for (let channel = 0; channel < 4; channel++)
          if (atlas.data[atlasOffset + channel] !== source.pixels[sourceOffset + channel])
            sourcePixelsIdentical = false;
      }
    return {
      id,
      present: true,
      pivot: frame.pivot,
      size: [w, h],
      nonempty: opaque > 0,
      transparent_margin: border === 0,
      source_pixels_identical: sourcePixelsIdentical,
    };
  });
  const result = {
    cold_export_identical: firstBytes.equals(secondBytes),
    power_of_two:
      (atlas.info.width & (atlas.info.width - 1)) === 0 &&
      (atlas.info.height & (atlas.info.height - 1)) === 0,
    palette_only: paletteOnly,
    fixed_pivots: checks.every((frame) => JSON.stringify(frame.pivot) === '[8,14]'),
    exact_frame_size: checks.every((frame) => JSON.stringify(frame.size) === '[16,16]'),
    transparent_frame_margins: checks.every((frame) => frame.transparent_margin),
    source_to_atlas_pixels_identical: checks.every((frame) => frame.source_pixels_identical),
    complete_loop:
      JSON.stringify(animations.walk_right?.frames) === JSON.stringify(expectedFrames) &&
      animations.walk_right?.loop === true,
    frames: checks,
  };
  result.technical_pass = Object.entries(result)
    .filter(([key]) => key !== 'frames' && key !== 'technical_pass')
    .every(([, value]) => value === true);
  console.log(JSON.stringify(result, null, 2));
  if (!result.technical_pass) process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
  await rm(temporary + '-cold', { recursive: true, force: true });
}
