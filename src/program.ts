import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { TECHNIQUE_VERSION } from './techniques.js';
import { Worker } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import sharp from 'sharp';
import { canonical, localAssetPath, sha256 } from './assets.js';
import { writeArtifact } from './artifacts.js';
import { sceneHash } from './assets.js';
import type { Project } from './project.js';
import { flattenLayers } from './schema.js';
export const PROGRAM_VERSION = 'rtistree-studio/1';
const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/);
export const programSchema = z
  .strictObject({
    source: z.string().min(1).optional(),
    code: z
      .string()
      .min(1)
      .max(256 * 1024)
      .optional(),
    asset_id: name,
    target: name.optional(),
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
    seed: z.number().int().min(0).max(0xffffffff).default(0),
    parameters: z.record(z.string(), z.json()).default({}),
    inputs: z.record(name, name).default({}),
    timeout_ms: z.number().int().min(50).max(30000).default(10000),
    expected_hash: z.string().optional(),
    reason: z.string().min(1).max(4000),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.source) === Boolean(value.code))
      ctx.addIssue({
        code: 'custom',
        message: 'Specify exactly one of source (project-local file) or code (inline JavaScript)',
      });
  });
export type RasterProgram = z.infer<typeof programSchema>;
export interface ProgramRecipe {
  version: typeof PROGRAM_VERSION;
  source: string;
  source_hash: string;
  parameters: Record<string, unknown>;
  width: number;
  height: number;
  seed: number;
  timeout_ms: number;
  inputs: Record<string, { source: string; hash: string }>;
  output_hash: string;
  runtime: { node: string; skia: string; techniques?: string };
}
export async function executeRasterProgram(
  source: string,
  options: Pick<RasterProgram, 'width' | 'height' | 'seed' | 'parameters' | 'timeout_ms'>,
  inputs: Record<string, Buffer> = {},
): Promise<Buffer> {
  options = programSchema.parse({
    width: options.width,
    height: options.height,
    seed: options.seed,
    parameters: options.parameters,
    timeout_ms: options.timeout_ms,
    source: 'inline',
    asset_id: 'output',
    reason: 'Execute',
  });
  if (
    Buffer.byteLength(source) > 256 * 1024 ||
    Buffer.byteLength(canonical(options.parameters)) > 64 * 1024
  )
    throw new Error('Program source/parameters exceed 256 KiB / 64 KiB');
  if (options.width * options.height > 16 * 1024 * 1024)
    throw new Error('Program output exceeds 16 megapixels');
  let pixels = options.width * options.height;
  if (Object.keys(inputs).length > 16) throw new Error('A program accepts at most 16 input images');
  for (const input of Object.values(inputs)) {
    const m = await sharp(input, { limitInputPixels: 32 * 1024 * 1024 }).metadata();
    pixels += m.width! * m.height!;
  }
  if (pixels > 32 * 1024 * 1024) throw new Error('Program inputs/output exceed 32 megapixels');
  const ts = import.meta.url.endsWith('.ts'),
    url = new URL(ts ? './program-worker.ts' : './program-worker.js', import.meta.url).href;
  const bootstrap = ts
    ? `import(${JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href)}).then(({tsImport}) => tsImport(${JSON.stringify(url)}, ${JSON.stringify(import.meta.url)}))`
    : `import(${JSON.stringify(url)})`;
  const png = await new Promise<Buffer>((resolve, reject) => {
    const worker = new Worker(bootstrap, {
      eval: true,
      workerData: { ...options, source, inputs },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Raster program exceeded its wall-clock limit'));
    }, options.timeout_ms + 2000);
    const finish = () => {
      clearTimeout(timer);
      void worker.terminate();
    };
    worker.once('message', (message) => {
      finish();
      if (message.error) reject(new Error(message.error));
      else resolve(Buffer.from(message.png));
    });
    worker.once('error', (error) => {
      finish();
      reject(error);
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Raster worker exited before producing an image (${code})`));
    });
  });
  const metadata = await sharp(png, { limitInputPixels: 16 * 1024 * 1024 }).metadata();
  if (
    metadata.format !== 'png' ||
    metadata.width !== options.width ||
    metadata.height !== options.height
  )
    throw new Error('Program output must encode a PNG with the declared dimensions');
  return png;
}
/** Explicit execution only. Rendering/importing a scene never evaluates its recipes. */
export async function runProgram(project: Project, raw: unknown) {
  const spec = programSchema.parse(raw),
    scene = await project.scene(),
    before = sceneHash(scene);
  if (spec.expected_hash && before !== spec.expected_hash) throw new Error('Stale scene hash');
  const {
    asset,
    recipe_hash: hash,
    output_hash,
  } = await bakeProgram(project.root, spec, scene.assets);
  const commands: unknown[] = [{ type: 'registerAsset', id: spec.asset_id, asset }];
  if (spec.target) {
    const target = flattenLayers(scene.layers).find((l) => l.id === spec.target);
    commands.push(
      target
        ? { type: 'setSource', target: spec.target, source: spec.asset_id }
        : {
            type: 'addLayer',
            layer: {
              id: spec.target,
              type: 'raster',
              source: spec.asset_id,
              bounds: [0, 0, spec.width, spec.height],
            },
          },
    );
  }
  const entry = await project.apply({ commands, reason: spec.reason, expected_hash: before });
  return {
    asset_id: spec.asset_id,
    asset,
    recipe_hash: hash,
    output_hash,
    sequence: entry.sequence,
    scene_hash: entry.after_hash,
  };
}
/** Bake immutable artifacts without changing a scene, for atomic multi-node builds. */
export async function bakeProgram(
  root: string,
  spec: RasterProgram,
  assets: import('./schema.js').Scene['assets'],
) {
  const source = spec.code ?? (await readFile(await localAssetPath(root, spec.source!), 'utf8'));
  const inputs: Record<string, Buffer> = Object.create(null);
  let inputPixels = spec.width * spec.height;
  if (inputPixels > 16 * 1024 * 1024) throw new Error('Program output exceeds 16 megapixels');
  if (
    Buffer.byteLength(source) > 256 * 1024 ||
    Buffer.byteLength(canonical(spec.parameters)) > 64 * 1024
  )
    throw new Error('Program source/parameters exceed 256 KiB / 64 KiB');
  if (Object.keys(spec.inputs).length > 16)
    throw new Error('A program accepts at most 16 input images');
  for (const [key, id] of Object.entries(spec.inputs)) {
    const asset = assets[id];
    if (!asset) throw new Error(`Unknown program input asset ${id}`);
    const bytes = await readFile(await localAssetPath(root, asset.source));
    if (bytes.length > 64 * 1024 * 1024) throw new Error('Program input exceeds 64 MiB');
    if (asset.hash && sha256(bytes) !== asset.hash) throw new Error('Program input hash mismatch');
    const metadata = await sharp(bytes, { limitInputPixels: 32 * 1024 * 1024 }).metadata();
    inputPixels += metadata.width! * metadata.height!;
    if (inputPixels > 32 * 1024 * 1024)
      throw new Error('Program inputs/output exceed 32 megapixels');
    inputs[key] = await sharp(bytes, { limitInputPixels: 32 * 1024 * 1024 })
      .toColourspace('srgb')
      .png()
      .toBuffer();
  }
  const png = await executeRasterProgram(source, spec, inputs);
  const recipe: ProgramRecipe = {
    version: PROGRAM_VERSION,
    source,
    source_hash: sha256(source),
    parameters: spec.parameters,
    width: spec.width,
    height: spec.height,
    seed: spec.seed,
    timeout_ms: spec.timeout_ms,
    inputs: Object.fromEntries(
      Object.entries(inputs).map(([key, bytes]) => [
        key,
        { source: `inputs/${sha256(bytes).slice(7)}.png`, hash: sha256(bytes) },
      ]),
    ),
    output_hash: sha256(png),
    runtime: { node: process.version, skia: '1.0.8', techniques: TECHNIQUE_VERSION },
  };
  const manifest = canonical(recipe),
    hash = sha256(manifest),
    directory = join('recipes', hash.slice(7));
  for (const [key, bytes] of Object.entries(inputs))
    await writeArtifact(join(root, directory, recipe.inputs[key]!.source), bytes);
  await writeArtifact(join(root, directory, 'recipe.json'), manifest);
  const sourcePath = join(directory, 'output.png');
  await writeArtifact(join(root, sourcePath), png);
  const asset = {
    source: sourcePath,
    hash: sha256(png),
    recipe: { source: join(directory, 'recipe.json'), hash },
  };
  return { asset, recipe_hash: hash, output_hash: recipe.output_hash };
}
export async function replayRecipe(root: string, reference: { source: string; hash: string }) {
  const file = await localAssetPath(root, reference.source),
    raw = await readFile(file, 'utf8');
  if (sha256(raw) !== reference.hash) throw new Error('Recipe hash mismatch');
  const recipe = JSON.parse(raw) as ProgramRecipe;
  if (recipe.version !== PROGRAM_VERSION || sha256(recipe.source) !== recipe.source_hash)
    throw new Error('Unsupported or changed program recipe');
  if (recipe.runtime.techniques && recipe.runtime.techniques !== TECHNIQUE_VERSION)
    throw new Error('Recipe requires a different technique version');
  const spec = programSchema.parse({
    width: recipe.width,
    height: recipe.height,
    seed: recipe.seed,
    parameters: recipe.parameters,
    timeout_ms: recipe.timeout_ms,
    source: 'recipe',
    asset_id: 'replay',
    reason: 'Replay',
  });
  const inputs: Record<string, Buffer> = Object.create(null);
  for (const [name, input] of Object.entries(recipe.inputs)) {
    const bytes = await readFile(await localAssetPath(dirname(file), input.source));
    if (sha256(bytes) !== input.hash) throw new Error('Recipe input hash mismatch');
    inputs[name] = bytes;
  }
  const png = await executeRasterProgram(recipe.source, spec, inputs);
  return {
    identical: sha256(png) === recipe.output_hash,
    expected_hash: recipe.output_hash,
    output_hash: sha256(png),
    png,
  };
}
/** Copy a frozen recipe and its local input snapshots without executing code. */
export async function copyRecipe(
  root: string,
  reference: { source: string; hash: string },
  destination: string,
) {
  const path = await localAssetPath(root, reference.source),
    bytes = await readFile(path);
  if (sha256(bytes) !== reference.hash) throw new Error('Recipe hash mismatch');
  const recipe = JSON.parse(bytes.toString()) as ProgramRecipe;
  const directory = join('recipes', reference.hash.slice(7));
  for (const input of Object.values(recipe.inputs)) {
    const contents = await readFile(await localAssetPath(dirname(path), input.source));
    if (sha256(contents) !== input.hash) throw new Error('Recipe input hash mismatch');
    await writeArtifact(join(destination, directory, input.source), contents);
  }
  await writeArtifact(join(destination, directory, 'recipe.json'), bytes);
  return { source: join(directory, 'recipe.json'), hash: reference.hash };
}
