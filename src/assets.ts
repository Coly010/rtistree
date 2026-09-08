import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { GlobalFonts, loadImage, type Image } from './native.js';
import type { Scene } from './schema.js';

export function sha256(data: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(data).digest('hex')}`;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const sceneHash = (scene: Scene) => sha256(canonical(scene));
export async function localAssetPath(root: string, source: string): Promise<string> {
  if (isAbsolute(source) || /^[a-z]+:/i.test(source))
    throw new Error('Assets must be project-relative local files');
  const base = await realpath(root),
    path = await realpath(resolve(base, source));
  const rel = relative(base, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error(`Asset escapes project: ${source}`);
  return path;
}
let fontPromise: Promise<Record<string, string>> | undefined;
export function registerFonts(): Promise<Record<string, string>> {
  return (fontPromise ??= (async () => {
    const require = createRequire(import.meta.url);
    const fonts = [
      ['inter', '@fontsource/inter', 'inter-latin-400-normal.woff'],
      ['inter-bold', '@fontsource/inter', 'inter-latin-700-normal.woff'],
      ['display', '@fontsource/dm-serif-display', 'dm-serif-display-latin-400-normal.woff'],
    ];
    const hashes: Record<string, string> = {};
    for (const [name, pkg, file] of fonts) {
      const path = resolve(dirname(require.resolve(`${pkg}/package.json`)), 'files', file!);
      const bytes = await readFile(path);
      if (!GlobalFonts.register(bytes, `Rtistree-${name}`))
        throw new Error(`Could not load bundled font: ${name}`);
      hashes[name!] = sha256(bytes);
    }
    return hashes;
  })());
}
export interface LoadedAssets {
  images: Map<string, Image>;
  hashes: Record<string, string>;
}
export async function loadAssets(scene: Scene, root: string): Promise<LoadedAssets> {
  const images = new Map<string, Image>(),
    hashes: Record<string, string> = {};
  for (const [id, asset] of Object.entries(scene.assets)) {
    const path = await localAssetPath(root, asset.source),
      bytes = await readFile(path);
    if (bytes.length > 64 * 1024 * 1024) throw new Error(`Asset exceeds 64 MiB: ${id}`);
    // External resources and embedded SVG fonts break the closed-input determinism contract.
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216;
    const webp =
      bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!png && !jpeg && !webp)
      throw new Error(`Asset ${id}: only PNG, JPEG and WebP are supported`);
    const hash = sha256(bytes);
    if (asset.hash && asset.hash !== hash) throw new Error(`Asset hash mismatch: ${id}`);
    const image = await loadImage(bytes);
    if (image.width * image.height > 32 * 1024 * 1024)
      throw new Error(`Asset dimensions too large: ${id}`);
    images.set(id, image);
    hashes[id] = hash;
  }
  return { images, hashes };
}

const projectFonts = new Set<string>();
export async function registerProjectFonts(scene: Scene, root: string) {
  const hashes: Record<string, string> = {},
    aliases: Record<string, string> = {};
  for (const [id, font] of Object.entries(scene.fonts ?? {})) {
    const bytes = await readFile(await localAssetPath(root, font.source)),
      hash = sha256(bytes);
    if (bytes.length > 20 * 1024 * 1024) throw new Error('Font exceeds 20 MiB');
    if (font.hash && font.hash !== hash) throw new Error(`Font hash mismatch: ${id}`);
    const alias = `Rtistree-custom-${hash.slice(7)}`;
    if (!projectFonts.has(hash)) {
      if (!GlobalFonts.register(bytes, alias)) throw new Error(`Invalid font: ${id}`);
      projectFonts.add(hash);
    }
    hashes[`custom:${id}`] = hash;
    aliases[id] = alias;
  }
  return { hashes, aliases };
}
