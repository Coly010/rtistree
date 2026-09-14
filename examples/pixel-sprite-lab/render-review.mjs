import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('.', import.meta.url));
const output = join(root, 'output');
const atlasPath = join(output, 'sentinel-atlas.png');
const manifestPath = join(output, 'sentinel-atlas.json');

await mkdir(output, { recursive: true });
await exec(process.execPath, [
  join(root, '../../dist/cli.js'),
  'sprites',
  join(root, 'scene.json'),
  '-o',
  atlasPath,
  '--manifest',
  manifestPath,
]);

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const frames = manifest.frames ?? manifest.sprites?.frames;
if (!frames) throw new Error('Sprite manifest did not contain frames');
const ordered = ['walk_0', 'walk_1', 'walk_2', 'walk_3'];
const tile = 16 * 8;
const checker = Buffer.alloc(tile * ordered.length * tile * 4);
for (let y = 0; y < tile; y++)
  for (let x = 0; x < tile * ordered.length; x++) {
    const c = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? 55 : 38;
    const i = (y * tile * ordered.length + x) * 4;
    checker.set([c, c + 8, c + 16, 255], i);
  }
const overlays = [];
for (let index = 0; index < ordered.length; index++) {
  const frame = frames[ordered[index]];
  const rect = frame.frame ?? frame.bounds ?? frame;
  const source = await sharp(atlasPath)
    .extract({
      left: rect.x ?? rect[0],
      top: rect.y ?? rect[1],
      width: rect.w ?? rect[2],
      height: rect.h ?? rect[3],
    })
    .resize(tile, tile, { kernel: 'nearest' })
    .png()
    .toBuffer();
  overlays.push({ input: source, left: index * tile, top: 0 });
}
await sharp(checker, { raw: { width: tile * ordered.length, height: tile, channels: 4 } })
  .composite(overlays)
  .png()
  .toFile(join(output, 'walk-review.png'));
await writeFile(
  join(output, 'review.json'),
  JSON.stringify({ frames: ordered, scale: 8, source: 'sentinel-atlas.png' }, null, 2) + '\n',
);
console.log(`Exported ${atlasPath} and ${join(output, 'walk-review.png')}`);
