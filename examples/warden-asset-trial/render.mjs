import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { bakeProgram, programSchema, Project, writeArtifact } from '../../dist/index.js';
import sharp from 'sharp';
import { walkPose } from './programs/motion.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const mode = process.argv[2] ?? 'foundation';
const revision = Number(process.argv[3] ?? 1);
const source = 'programs/assets.js';
const drawingCode = `const walkPose = ${walkPose.toString()};\n${await readFile(join(root, source), 'utf8')}`;
await mkdir(join(root, 'output'), { recursive: true });
const assets = {},
  items = [];
async function bake(id, parameters) {
  const spec = programSchema.parse({
    code: drawingCode,
    asset_id: id,
    width: 512,
    height: 640,
    seed: 7319,
    parameters,
    reason: 'Procedural game asset trial',
  });
  const result = await bakeProgram(root, spec, {});
  assets[id] = { type: 'image', ...result.asset };
  const png = await readFile(join(root, result.asset.source));
  await writeArtifact(join(root, 'output', id + '.png'), png);
  const item = {
    id,
    file: 'output/' + id + '.png',
    width: 512,
    height: 640,
    pivot: parameters.kind === 'knight' ? [256, 570] : [256, 320],
    parameters,
    recipe: result.asset.recipe,
    hash: result.output_hash,
  };
  items.push(item);
  return item;
}
function text(id, content, bounds, size = 18, color = '#c9d7c9', font = 'inter') {
  return {
    id,
    type: 'text',
    content,
    bounds,
    style: { font, size, colour: color, weight: 'regular' },
  };
}
async function sheet(name, rows, options = {}) {
  const width = 1120,
    height = options.height ?? 170 + rows.length * 350;
  const layers = [
    text('eyebrow', 'RTISTREE  /  ASSET LAB  /  TRIAL 01', [46, 27, 1030, 25], 13, '#9eac99'),
    text('title', options.title ?? 'Verdigris Watch', [43, 58, 1030, 58], 42, '#ebead6', 'display'),
    text(
      'subtitle',
      options.subtitle ?? 'Hand-authored 2D forms · cool steel · aged brass · evergreen cloth',
      [46, 122, 1040, 25],
      15,
      '#a8b9ad',
    ),
  ];
  rows.forEach((row, ri) =>
    row.forEach((id, ci) => {
      const cellWidth = 1028 / row.length,
        x = 46 + ci * cellWidth,
        y = 176 + ri * 350;
      layers.push({
        id: 'panel-' + id,
        type: 'vector',
        shape: { type: 'rectangle', fill: options.background ? '#c1c9b9' : '#233b3c' },
        bounds: [x, y, cellWidth - 12, 326],
      });
      layers.push({
        id: 'img-' + id,
        type: 'asset',
        source: id,
        bounds: [x + (cellWidth - 12 - 236) / 2, y - 4, 236, 295],
        fit: 'contain',
      });
      layers.push(
        text(
          'label-' + id,
          id.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          [x + 15, y + 291, cellWidth - 38, 25],
          14,
          options.background ? '#344a42' : '#d2dccb',
        ),
      );
    }),
  );
  const scene = {
    version: 1,
    canvas: { width, height, background: options.background ?? '#152a2c' },
    assets,
    layers,
  };
  const sceneFile = join(root, name + '.scene.json');
  await writeArtifact(sceneFile, JSON.stringify(scene, null, 2) + '\n');
  const p = await Project.open(sceneFile),
    r = await p.render();
  await writeArtifact(join(root, 'output', name + '.png'), r.png);
  await writeArtifact(
    join(root, 'output', name + '.png.evidence.json'),
    JSON.stringify(r.evidence, null, 2) + '\n',
  );
  return scene;
}
if (mode === 'foundation') {
  for (const stage of ['silhouette', 'values'])
    for (const pose of ['watch', 'stride', 'guard'])
      await bake(`${stage}_${pose}_r${revision}`, { kind: 'knight', pose, stage, revision });
  await sheet(
    'foundation-r' + revision,
    [items.slice(0, 3).map((x) => x.id), items.slice(3).map((x) => x.id)],
    {
      title: 'Foundation / revision ' + revision,
      subtitle:
        'Watch · split stride · raised guard — silhouette and grayscale before surface detail',
      background: '#798b83',
    },
  );
} else if (mode === 'finish') {
  for (const pose of ['watch', 'stride', 'guard'])
    await bake(pose, { kind: 'knight', pose, stage: 'finish', revision });
  for (const kind of ['sword', 'shield', 'axe', 'lantern', 'coffer', 'potion'])
    await bake(kind, { kind, stage: 'finish', revision });
  for (let frame = 0; frame < 8; frame++)
    await bake('walk_' + frame, {
      kind: 'knight',
      pose: 'walk',
      phase: frame / 8,
      stage: 'finish',
      revision,
    });
  await sheet(
    'contact-sheet',
    [
      ['watch', 'stride', 'guard'],
      ['sword', 'shield', 'axe'],
      ['lantern', 'coffer', 'potion'],
    ],
    {
      subtitle:
        'Three character poses + six matching props · original procedural artwork · awaiting review',
    },
  );
  await sheet(
    'walk-sheet',
    [
      ['walk_0', 'walk_1', 'walk_2', 'walk_3'],
      ['walk_4', 'walk_5', 'walk_6', 'walk_7'],
    ],
    {
      title: 'Walk cycle / 8 frames',
      subtitle: 'Fixed pivot · one facing · a limited articulated 2D loop',
    },
  );
  // Atlas assembly copies the studio's rendered pixels without altering their artwork.
  const atlasPixels = Buffer.alloc(2560 * 2560 * 4),
    frames = {};
  for (let i = 0; i < items.length; i++) {
    const x = (i % 5) * 512,
      y = Math.floor(i / 5) * 640;
    const rgba = await sharp(join(root, items[i].file)).ensureAlpha().raw().toBuffer();
    for (let row = 0; row < 640; row++)
      rgba.copy(atlasPixels, ((y + row) * 2560 + x) * 4, row * 512 * 4, (row + 1) * 512 * 4);
    frames[items[i].id] = {
      frame: { x, y, w: 512, h: 640 },
      pivot: items[i].parameters.kind === 'knight' ? [256, 570] : [256, 320],
    };
  }
  await sharp(atlasPixels, { raw: { width: 2560, height: 2560, channels: 4 } })
    .png()
    .toFile(join(root, 'output', 'atlas.png'));
  await writeFile(
    join(root, 'output', 'atlas.json'),
    JSON.stringify(
      {
        image: 'atlas.png',
        width: 2560,
        height: 2560,
        frames,
        animations: {
          walk: {
            fps: 8,
            loop: true,
            facing: 'right',
            travel_per_cycle_px: (2 * 52) / 0.6,
            frames: Array.from({ length: 8 }, (_, i) => 'walk_' + i),
          },
        },
      },
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    join(root, 'manifest.json'),
    JSON.stringify(
      {
        title: 'Verdigris Watch',
        status: 'revision-awaiting-visual-review',
        previous_version: 'failed-user-review',
        visual_pass: false,
        method: 'Rtistree 2D studio programs, no image inputs',
        source,
        shared_sources: ['programs/motion.mjs'],
        seed: 7319,
        items,
      },
      null,
      2,
    ) + '\n',
  );
  // Downsampled grayscale / mirrored sheets aid visual inspection at game scale.
  await sharp(join(root, 'output', 'contact-sheet.png'))
    .resize(560)
    .toFile(join(root, 'output', 'thumbnail.png'));
  await sharp(join(root, 'output', 'watch.png'))
    .flop()
    .grayscale()
    .flatten({ background: '#a3b1a6' })
    .resize(256)
    .toFile(join(root, 'output', 'mirrored-values.png'));
} else throw new Error('Use foundation or finish');
console.log(`Rendered ${mode}, revision ${revision}: ${items.length} assets`);
