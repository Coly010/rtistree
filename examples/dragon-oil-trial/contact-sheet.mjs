import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createCanvas, loadImage } from '../../dist/native.js';
import { registerFonts } from '../../dist/assets.js';
import { writeArtifact } from '../../dist/index.js';
const root = fileURLToPath(new URL('.', import.meta.url));
await registerFonts();
const sheet = createCanvas(1200, 870),
  ctx = sheet.getContext('2d');
ctx.fillStyle = '#20292b';
ctx.fillRect(0, 0, 1200, 870);
const labels = [
  ['thumbnails-0', 'Selected thumbnail'],
  ['blockin-0', 'Value block-in'],
  ['form-0', 'Form and lighting'],
  ['materials-0', 'Materials'],
  ['finish-0', 'Final painting'],
];
for (const [i, [name, label]] of labels.entries()) {
  const png = await loadImage(await readFile(join(root, 'output', name + '.png'))),
    x = (i % 3) * 400,
    y = Math.floor(i / 3) * 430;
  ctx.drawImage(png, x + 8, y + 28, 384, 256);
  ctx.fillStyle = '#e7e1cd';
  ctx.font = '19px Rtistree-inter';
  ctx.fillText(label, x + 12, y + 316);
}
ctx.font = '20px Rtistree-display';
ctx.fillText('A 2D painting trial', 820, 525);
ctx.font = '16px Rtistree-inter';
for (const [i, line] of [
  'Hand-authored paths and paint',
  'No image generation or 3D',
  'Seven preserved candidates',
  'Code-only rebuild: identical',
].entries())
  ctx.fillText(line, 820, 566 + i * 28);
await writeArtifact(join(root, 'output', 'stages.png'), sheet.toBuffer('image/png'));
const studio = await readdir(join(root, 'studio'));
await writeArtifact(
  join(root, 'output', 'thumbnails.png'),
  await readFile(
    join(root, 'studio', studio[0], 'sessions', 'dragon', 'thumbnails-comparison.png'),
  ),
);
