import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import type { Project } from './project.js';
import { boundsSchema, flattenLayers } from './schema.js';
import { localAssetPath, sceneHash, sha256 } from './assets.js';
import { writeArtifact, writeRender } from './artifacts.js';

export const rasterReadSchema = z.strictObject({
  bounds: boundsSchema,
  target: z.string().optional(),
});
export const rasterWriteSchema = z.strictObject({
  target: z.string(),
  region_id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/),
  source: z.string(),
  bounds: boundsSchema,
  space: z.enum(['canvas', 'layer']).default('canvas'),
  composite: z.enum(['replace', 'over']).default('replace'),
  expected_hash: z.string(),
  reason: z.string().min(1),
});
export async function readRasterRegion(project: Project, raw: unknown) {
  const options = rasterReadSchema.parse(raw),
    scene = await project.scene();
  const render = await project.renderer.render(scene, project.root, {
    layer: options.target,
    region: options.bounds,
    cache: false,
    regionMode: 'full',
  });
  const path = join(
    project.outputDirectory,
    `region-${render.evidence.render.png_hash.slice(7)}.png`,
  );
  const artifact = await writeRender(path, render);
  return {
    ...artifact,
    asset: { source: relative(project.root, path), hash: render.evidence.render.png_hash },
    scene_hash: sceneHash(scene),
    bounds: options.bounds,
    target: options.target,
    space: 'canvas',
    encoding: 'PNG, straight RGBA on decode; 8-bit sRGB',
    render,
  };
}
export async function writeRasterRegion(project: Project, raw: unknown) {
  const options = rasterWriteSchema.parse(raw),
    scene = await project.scene();
  if (sceneHash(scene) !== options.expected_hash) throw new Error('Stale scene hash');
  if (!options.bounds.every(Number.isInteger))
    throw new Error('Dense patches require integer bounds');
  const bytes = await readFile(await localAssetPath(project.root, options.source));
  if (bytes.length > 64 * 1024 * 1024) throw new Error('Dense patch exceeds 64 MiB');
  const metadata = await sharp(bytes, { limitInputPixels: 16 * 1024 * 1024 }).metadata();
  if (
    metadata.format !== 'png' ||
    metadata.width !== options.bounds[2] ||
    metadata.height !== options.bounds[3]
  )
    throw new Error('Dense patch must be a PNG matching the exact region dimensions');
  const hash = sha256(bytes),
    source = join('raster', `${hash.slice(7)}.png`),
    id = `patch_${hash.slice(7, 39)}`;
  const layer = flattenLayers(scene.layers).find((l) => l.id === options.target);
  if (!layer) throw new Error('Unknown patch target');
  await writeArtifact(join(project.root, source), bytes);
  const entry = await project.apply({
    expected_hash: options.expected_hash,
    reason: options.reason,
    commands: [
      { type: 'registerAsset', id, asset: { source, hash } },
      {
        type: layer.regions?.some((r) => r.id === options.region_id)
          ? 'updateRegion'
          : 'promoteRegion',
        target: options.target,
        region: {
          id: options.region_id,
          source: id,
          bounds: options.bounds,
          space: options.space,
          scale: 1,
          composite: options.composite,
        },
      },
    ],
  });
  return {
    scene_hash: entry.after_hash,
    sequence: entry.sequence,
    locality: entry.locality,
    asset: { source, hash },
    region_id: options.region_id,
  };
}
