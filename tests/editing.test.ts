import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { parseScene, SkiaRenderer, applyCommand, Project, importSvg } from '../src/index.js';
import { exportSvg } from '../src/svg.js';
const renderer = new SkiaRenderer();
const pixel = (r: Awaited<ReturnType<SkiaRenderer['render']>>, x: number, y: number) => [
  ...r.pixels.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
];
const base = (operations: unknown[] = [], mask?: unknown) =>
  parseScene({
    version: 1,
    canvas: { width: 32, height: 32 },
    layers: [
      {
        id: 'target',
        type: 'vector',
        shape: { type: 'rectangle', fill: '#808080' },
        bounds: [0, 0, 32, 32],
        operations,
        mask,
      },
    ],
  });
test('mask algebra and grow/shrink operate on alpha and reject recursive dependencies', async () => {
  const scene = base([], {
    type: 'combine',
    operation: 'subtract',
    masks: [
      { type: 'rectangle', bounds: [2, 2, 28, 28] },
      { type: 'rectangle', bounds: [10, 10, 12, 12] },
    ],
  });
  const r = await renderer.render(scene, process.cwd());
  assert.equal(pixel(r, 4, 4)[3], 255);
  assert.equal(pixel(r, 16, 16)[3], 0);
  const grown = await renderer.render(
    base([], { type: 'rectangle', bounds: [10, 10, 5, 5], expand: 2 }),
    process.cwd(),
  );
  assert.equal(pixel(grown, 8, 10)[3], 255);
  assert.equal(pixel(grown, 7, 10)[3], 0);
  const shrunk = await renderer.render(
    base([], { type: 'rectangle', bounds: [10, 10, 8, 8], expand: -2 }),
    process.cwd(),
  );
  assert.equal(pixel(shrunk, 10, 12)[3], 0);
  assert.equal(pixel(shrunk, 12, 12)[3], 255);
  assert.throws(
    () =>
      base([], {
        type: 'combine',
        operation: 'union',
        masks: [
          { type: 'semantic-object', target: 'target' },
          { type: 'rectangle', bounds: [0, 0, 2, 2] },
        ],
      }),
    /Cyclic/,
  );
});
test('imported luminance mask, crop/focal positioning and projective sampling work together', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rtistree-image-edit-'));
  const pixels = Buffer.alloc(16 * 16 * 3);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) pixels.set(x < 8 ? [255, 0, 0] : [0, 0, 255], (y * 16 + x) * 3);
  await writeFile(
    join(root, 'image.png'),
    await sharp(pixels, { raw: { width: 16, height: 16, channels: 3 } })
      .png()
      .toBuffer(),
  );
  await writeFile(
    join(root, 'mask.png'),
    await sharp({ create: { width: 16, height: 16, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer(),
  );
  let scene = parseScene({
    version: 1,
    canvas: { width: 32, height: 32 },
    assets: { image: { source: 'image.png' }, mask: { source: 'mask.png' } },
    layers: [
      {
        id: 'image',
        type: 'asset',
        source: 'image',
        bounds: [0, 0, 32, 32],
        crop: [8, 0, 8, 16],
        fit: 'stretch',
        mask: { type: 'image', source: 'mask', bounds: [0, 0, 32, 32] },
      },
    ],
  });
  let r = await renderer.render(scene, root);
  assert.deepEqual(pixel(r, 16, 16), [0, 0, 255, 255]);
  scene = applyCommand(scene, {
    type: 'setPerspective',
    target: 'image',
    corners: [
      [8, 0],
      [24, 0],
      [32, 32],
      [0, 32],
    ],
  });
  r = await renderer.render(scene, root);
  assert.equal(pixel(r, 1, 1)[3], 0);
  assert.deepEqual(pixel(r, 16, 16), [0, 0, 255, 255]);
});
test('levels, curves, white balance and cloning preserve scopes and undo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rtistree-adjust-')),
    file = join(root, 'scene.json');
  const scene = base([{ type: 'fill', bounds: [0, 0, 8, 8], colour: '#204060' }]);
  await writeFile(file, JSON.stringify(scene));
  const project = await Project.open(file),
    before = await project.render();
  await project.apply({
    reason: 'Clone sampled patch and adjust it',
    commands: [
      {
        type: 'applyRasterOperation',
        target: 'target',
        operation: { type: 'clone', bounds: [16, 0, 8, 8], source_offset: [-16, 0] },
      },
      {
        type: 'applyRasterOperation',
        target: 'target',
        operation: { type: 'levels', bounds: [16, 0, 8, 8], black: 0, white: 1, gamma: 2 },
      },
    ],
  });
  const after = await project.render();
  assert.ok(pixel(after, 20, 4)[0]! > 32);
  assert.deepEqual(pixel(after, 10, 10), pixel(before, 10, 10));
  await project.undo();
  assert.ok((await project.render()).png.equals(before.png));
  assert.throws(
    () =>
      base([
        {
          type: 'curves',
          bounds: [0, 0, 4, 4],
          points: [
            [0, 0],
            [0, 1],
            [1, 1],
          ],
        },
      ]),
    /knots/,
  );
  const curve = await renderer.render(
    base([
      {
        type: 'curves',
        bounds: [0, 0, 4, 4],
        points: [
          [0, 1],
          [1, 0],
        ],
      },
    ]),
    root,
  );
  assert.equal(pixel(curve, 1, 1)[0], 127);
});
test('path booleans preserve editable paths and stroke options survive SVG interchange', async () => {
  let scene = parseScene({
    version: 1,
    canvas: { width: 64, height: 64 },
    layers: [
      {
        id: 'a',
        type: 'vector',
        bounds: [0, 0, 32, 32],
        shape: { type: 'rectangle', fill: '#ff0000' },
      },
      {
        id: 'b',
        type: 'vector',
        bounds: [16, 0, 32, 32],
        shape: { type: 'rectangle', fill: '#ff0000' },
      },
    ],
  });
  scene = applyCommand(scene, {
    type: 'booleanPath',
    targets: ['a', 'b'],
    id: 'result',
    operation: 'subtract',
  });
  assert.equal(scene.layers.length, 1);
  const r = await renderer.render(scene, process.cwd());
  assert.equal(pixel(r, 8, 8)[3], 255);
  assert.equal(pixel(r, 24, 8)[3], 0);
  const imported = importSvg(
    '<svg width="64" height="64"><g transform="translate(8 4)"><rect width="20" height="20" fill="#336699" stroke="#000000" stroke-dasharray="2 3"/></g></svg>',
  );
  assert.deepEqual(
    pixel(await renderer.render(imported, process.cwd()), 18, 14),
    [51, 102, 153, 255],
  );
  const svg = (await exportSvg(imported, process.cwd(), renderer)).toString();
  assert.ok(svg.includes('<svg'));
  assert.throws(
    () => importSvg('<svg width="10" height="10"><image href="https://example.com/a.png"/></svg>'),
    /Unsupported/,
  );
});
test('rich text, tracking and paragraph styles produce editable runs and SVG text outlines', async () => {
  let scene = parseScene({
    version: 1,
    canvas: { width: 240, height: 120 },
    layers: [
      {
        id: 'text',
        type: 'text',
        bounds: [5, 5, 220, 100],
        content: 'Hello world',
        style: { size: 24, colour: '#000000' },
      },
    ],
  });
  scene = applyCommand(scene, {
    type: 'setTextRuns',
    target: 'text',
    runs: [
      { text: 'Hello ', colour: '#ff0000' },
      { text: 'world', weight: 'bold' },
    ],
  });
  scene = applyCommand(scene, {
    type: 'setStyle',
    target: 'text',
    style: { tracking: 2, kerning: false },
  });
  const r = await renderer.render(scene, process.cwd());
  assert.equal(r.text[0]!.spans![0]!.length, 3);
  assert.ok(r.text[0]!.width > 120);
  const svg = (await exportSvg(scene, process.cwd(), renderer)).toString();
  assert.ok(svg.includes('<path'));
  assert.ok(!svg.includes('data:image/png'));
});
