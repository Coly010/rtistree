import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { localAssetPath, sha256 } from './assets.js';
import type { Scene } from './schema.js';
import type { RenderResult } from './render.js';
import { copyRecipe } from './program.js';
export async function writeArtifact(file: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, file);
}
export async function writeRender(file: string, result: RenderResult) {
  if (extname(file).toLowerCase() !== '.png')
    throw new Error('writeRender writes PNG only; use artwork export for other formats');
  await writeArtifact(file, result.png);
  await writeArtifact(`${file}.evidence.json`, JSON.stringify(result.evidence, null, 2) + '\n');
  return {
    image: file,
    evidence: `${file}.evidence.json`,
    ...result.evidence.render,
    statistics: result.statistics,
  };
}

/** Write a fresh baseline with immutable local assets, without any history. */
export async function writeSceneBundle(input: Scene, root: string, file: string) {
  const scene = structuredClone(input);
  for (const asset of Object.values(scene.assets)) {
    if (asset.recipe) asset.recipe = await copyRecipe(root, asset.recipe, dirname(file));
    const source = await localAssetPath(root, asset.source),
      bytes = await readFile(source),
      hash = sha256(bytes);
    if (asset.hash && asset.hash !== hash) throw new Error('Asset changed before export');
    const relative = join('assets', `${hash.slice(7)}${extname(source).toLowerCase()}`);
    await writeArtifact(join(dirname(file), relative), bytes);
    asset.source = relative;
    asset.hash = hash;
  }
  for (const font of Object.values(scene.fonts ?? {})) {
    const source = await localAssetPath(root, font.source),
      bytes = await readFile(source),
      hash = sha256(bytes);
    if (font.hash && font.hash !== hash) throw new Error('Font changed before export');
    const path = join('fonts', `${hash.slice(7)}${extname(source)}`);
    await writeArtifact(join(dirname(file), path), bytes);
    font.source = path;
    font.hash = hash;
  }
  await writeArtifact(file, JSON.stringify(scene, null, 2) + '\n');
}
