import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScene } from '../src/schema.js';
import { applyCommand } from '../src/commands.js';
import { Project } from '../src/project.js';
import { SkiaRenderer } from '../src/render.js';
import { measureLocality } from '../src/verify.js';
const root = await mkdtemp(join(tmpdir(), 'rtistree-evolution-'));
const base = () =>
  parseScene({
    version: 1,
    canvas: { width: 96, height: 96 },
    layers: [
      {
        id: 'hero',
        type: 'vector',
        bounds: [8, 8, 32, 32],
        shape: { type: 'rectangle', fill: '#305060' },
      },
      {
        id: 'other',
        type: 'vector',
        bounds: [60, 8, 20, 20],
        shape: { type: 'ellipse', fill: '#ff8800' },
      },
    ],
  });
const renderer = new SkiaRenderer();
const pixel = (r: any, x: number, y: number) => [
  ...r.pixels.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
];
async function project() {
  const dir = await mkdtemp(join(root, 'p-')),
    file = join(dir, 'scene.json');
  await writeFile(file, JSON.stringify(base()));
  return Project.open(file, new SkiaRenderer());
}
test('editing API updates geometry, masks, transforms and individual operations', () => {
  let s = base();
  for (const cmd of [
    { type: 'setShape', target: 'hero', shape: { type: 'ellipse', fill: '#aabbcc' } },
    {
      type: 'setMask',
      target: 'hero',
      mask: { type: 'ellipse', bounds: [0, 0, 32, 32], space: 'layer' },
    },
    { type: 'applyEffect', target: 'hero', effect: { type: 'blur', radius: 2 } },
    { type: 'updateEffect', target: 'hero', index: 0, effect: { type: 'blur', radius: 3 } },
    { type: 'removeEffect', target: 'hero', index: 0 },
    { type: 'setTransform', target: 'hero', transform: { rotation: 20 } },
    { type: 'setZ', target: 'hero', z: 10 },
  ])
    s = applyCommand(s, cmd);
  assert.equal(s.layers[0]!.effects.length, 0);
  assert.equal(s.layers[0]!.transform?.rotation, 20);
  assert.equal(s.layers[0]!.shape?.type, 'ellipse');
  assert.throws(() => applyCommand(s, { type: 'removeEffect', target: 'hero', index: 0 }), /range/);
});
test('object-relative paint follows translation, rotation and resize', async () => {
  let s = applyCommand(base(), {
    type: 'applyRasterOperation',
    target: 'hero',
    operation: { type: 'fill', space: 'layer', bounds: [0, 0, 8, 8], colour: '#ff0000' },
  });
  assert.deepEqual(s.layers[0]!.operations[0]!.reference_size, [32, 32]);
  assert.deepEqual(pixel(await renderer.render(s, root), 10, 10), [255, 0, 0, 255]);
  s = applyCommand(s, { type: 'moveLayer', target: 'hero', x: 40, y: 40 });
  assert.deepEqual(pixel(await renderer.render(s, root), 42, 42), [255, 0, 0, 255]);
  assert.equal(pixel(await renderer.render(s, root), 10, 10)[3], 0);
  s = applyCommand(s, { type: 'resizeLayer', target: 'hero', width: 48, height: 48 });
  assert.deepEqual(pixel(await renderer.render(s, root), 50, 50), [255, 0, 0, 255]);
  s = applyCommand(s, { type: 'setTransform', target: 'hero', transform: { rotation: 90 } });
  assert.deepEqual(pixel(await renderer.render(s, root), 85, 43), [255, 0, 0, 255]);
});
test('object paint gets exact transformed locality validation', async () => {
  const p = await project();
  await p.apply({
    reason: 'Rotate',
    commands: [{ type: 'setTransform', target: 'hero', transform: { rotation: 35 } }],
  });
  const e = await p.apply({
    reason: 'Paint object',
    commands: [
      {
        type: 'applyRasterOperation',
        target: 'hero',
        operation: {
          type: 'paintStroke',
          space: 'layer',
          bounds: [8, 8, 12, 12],
          path: [
            [8, 8],
            [20, 20],
          ],
          radius: 2,
          colour: '#ffffff',
        },
      },
    ],
  });
  assert.equal(e.locality[0]!.outside_changed_pixels, 0);
  assert.ok(e.locality[0]!.changed_pixels > 0);
});
test('operation replacement/removal validates both old and new scopes and survives redo', async () => {
  const p = await project();
  await p.apply({
    reason: 'Paint',
    commands: [
      {
        type: 'applyRasterOperation',
        target: 'hero',
        operation: { type: 'fill', bounds: [10, 10, 5, 5], colour: '#ff0000' },
      },
    ],
  });
  const a = await p.render();
  await p.apply({
    reason: 'Relocate paint',
    commands: [
      {
        type: 'updateRasterOperation',
        target: 'hero',
        index: 0,
        operation: { type: 'fill', bounds: [20, 20, 5, 5], colour: '#00ff00' },
      },
    ],
  });
  const b = await p.render();
  assert.equal(
    measureLocality(a, b, [
      [10, 10, 5, 5],
      [20, 20, 5, 5],
    ]).outside_changed_pixels,
    0,
  );
  await p.apply({
    reason: 'Remove paint',
    commands: [{ type: 'removeRasterOperation', target: 'hero', index: 0 }],
  });
  await p.undo();
  assert.deepEqual((await p.render()).png, b.png);
});
test('layer cache reuses unchanged layers, invalidates masks, and matches cold output', async () => {
  const r = new SkiaRenderer();
  const s = base();
  await r.render(s, root);
  const warm = await r.render(s, root);
  assert.equal(warm.statistics.rasterized_layers, 0);
  const next = applyCommand(s, {
    type: 'setShape',
    target: 'hero',
    shape: { type: 'ellipse', fill: '#ddccee' },
  });
  const hot = await r.render(next, root),
    cold = await r.render(next, root, { cache: false });
  assert.ok(hot.statistics.cached_layers > 0);
  assert.ok(hot.statistics.rasterized_layers > 0);
  assert.deepEqual(hot.png, cold.png);
  const masked = applyCommand(s, {
    type: 'setMask',
    target: 'other',
    mask: { type: 'semantic-object', target: 'hero' },
  });
  await r.render(masked, root);
  const moved = applyCommand(masked, { type: 'moveLayer', target: 'hero', x: 60, y: 8 });
  assert.deepEqual(
    (await r.render(moved, root)).png,
    (await r.render(moved, root, { cache: false })).png,
  );
});
test('promoting a region preserves pixels until edited and refines only that patch', async () => {
  const p = await project(),
    before = await p.render();
  await p.apply({
    reason: 'Allocate detail',
    commands: [
      {
        type: 'promoteRegion',
        target: 'hero',
        region: { id: 'detail', bounds: [16, 16, 12, 12], scale: 4 },
      },
    ],
  });
  assert.deepEqual((await p.render()).png, before.png);
  const e = await p.apply({
    reason: 'Refine detail',
    commands: [
      {
        type: 'updateRegion',
        target: 'hero',
        region: {
          id: 'detail',
          bounds: [16, 16, 12, 12],
          scale: 4,
          operations: [
            {
              type: 'paintStroke',
              bounds: [0, 0, 12, 12],
              path: [
                [1, 1],
                [11, 11],
              ],
              radius: 0.5,
              colour: '#ffffff',
            },
          ],
        },
      },
    ],
  });
  assert.equal(e.locality[0]!.outside_changed_pixels, 0);
  assert.ok(e.locality[0]!.changed_pixels > 0);
  await p.apply({
    reason: 'Return to semantic source',
    commands: [{ type: 'demoteRegion', target: 'hero', id: 'detail' }],
  });
  assert.deepEqual((await p.render()).png, before.png);
});

test('source rebase merges disjoint edits and preserves undo across reopen', async () => {
  const p = await project();
  await p.apply({
    reason: 'Agent shape',
    commands: [{ type: 'setOpacity', target: 'hero', opacity: 0.6 }],
  });
  const incoming = base();
  incoming.layers[1]!.opacity = 0.4;
  await writeFile(p.source.file, JSON.stringify(incoming));
  await assert.rejects(() => p.scene(), /Authoring files changed/);
  await p.rebase();
  const s = await p.scene();
  assert.equal(s.layers[0]!.opacity, 0.6);
  assert.equal(s.layers[1]!.opacity, 0.4);
  const reopened = await Project.open(p.source.file);
  assert.deepEqual(await reopened.scene(), s);
  await reopened.undo();
  assert.equal((await reopened.scene()).layers[1]!.opacity, 1);
  await reopened.redo();
  assert.deepEqual(await reopened.scene(), s);
});
test('source rebase rejects conflicting fields without changing history', async () => {
  const p = await project();
  await p.apply({
    reason: 'Agent shape',
    commands: [{ type: 'setOpacity', target: 'hero', opacity: 0.6 }],
  });
  const incoming = base();
  incoming.layers[0]!.opacity = 0.4;
  await writeFile(p.source.file, JSON.stringify(incoming));
  await assert.rejects(() => p.rebase(), /\/layers\/hero\/opacity/);
  await writeFile(p.source.file, JSON.stringify(base()));
  assert.equal((await p.history()).length, 1);
});
test('compressed history preserves states and can append, undo, redo and compact again', async () => {
  const p = await project();
  await p.apply({ reason: 'A', commands: [{ type: 'setOpacity', target: 'hero', opacity: 0.6 }] });
  await p.apply({ reason: 'B', commands: [{ type: 'setOpacity', target: 'other', opacity: 0.2 }] });
  const before = await p.render();
  const info = await p.compactHistory();
  assert.ok(info.compressed_bytes < info.original_bytes);
  const q = await Project.open(p.source.file);
  assert.deepEqual((await q.render()).png, before.png);
  await q.undo();
  await q.redo();
  await q.compactHistory();
  assert.equal((await q.history()).length, 4);
  assert.deepEqual((await q.render()).png, before.png);
});
test('rendered contrast sees opacity and overlay effects missed by declared colours', async () => {
  const p = await project();
  await p.apply({
    reason: 'Add text test',
    commands: [
      {
        type: 'addLayer',
        layer: {
          id: 'copy',
          type: 'text',
          bounds: [0, 50, 96, 40],
          content: 'TEST',
          opacity: 0.1,
          style: { colour: '#ffffff', size: 24 },
        },
      },
      {
        type: 'setVerification',
        rules: [{ type: 'pixel-contrast', target: 'copy', minimum: 4.5 }],
      },
    ],
  });
  // Transparent background: choose an opaque dark canvas to measure appearance.
  const source = JSON.parse(
    await (await import('node:fs/promises')).readFile(p.source.file, 'utf8'),
  );
  source.canvas.background = '#000000';
  await writeFile(p.source.file, JSON.stringify(source));
  await p.rebase();
  assert.equal((await p.verify()).status, 'fail');
  await p.apply({
    reason: 'Make text readable',
    commands: [{ type: 'setOpacity', target: 'copy', opacity: 1 }],
  });
  assert.equal((await p.verify()).status, 'pass');
});
test('visual critique is bound to scene and PNG hashes', async () => {
  const p = await project(),
    r = await p.render();
  await p.recordCritique({
    scene_hash: r.evidence.scene.hash,
    png_hash: r.evidence.render.png_hash,
    reviewer: 'Test vision reviewer',
    method: 'vision-agent',
    summary: 'Inspect hierarchy',
    score: 0.7,
    issues: [
      {
        id: 'hierarchy',
        category: 'composition',
        severity: 'medium',
        message: 'The secondary element competes with the hero.',
      },
    ],
  });
  assert.ok(await p.critique());
  await p.apply({
    reason: 'Reduce supporting element',
    commands: [{ type: 'setOpacity', target: 'other', opacity: 0.5 }],
  });
  assert.equal(await p.critique(), null);
  await assert.rejects(
    () =>
      p.recordCritique({
        scene_hash: r.evidence.scene.hash,
        png_hash: r.evidence.render.png_hash,
        reviewer: 'Test',
        method: 'human',
        summary: 'Old image',
        score: 1,
        issues: [],
      }),
    /stale/,
  );
});
test('component instances namespace internal references and substitute parameters', async () => {
  const { loadScene } = await import('../src/loader.js');
  const file = join(root, 'components.json');
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      canvas: { width: 96, height: 96 },
      components: {
        badge: {
          parameters: { label: 'NEW', colour: '#ff0000' },
          layers: [
            {
              id: 'shape',
              type: 'vector',
              bounds: [0, 0, 32, 32],
              shape: { type: 'rectangle', fill: '{{colour}}' },
            },
            {
              id: 'label',
              type: 'text',
              bounds: [0, 0, 32, 32],
              content: '{{label}}',
              style: { size: 10 },
              mask: { type: 'semantic-object', target: 'shape' },
            },
          ],
        },
      },
      layers: [
        { id: 'one', use: 'badge', params: { label: 'A' } },
        {
          id: 'two',
          use: 'badge',
          params: { label: 'B', colour: '#0000ff' },
          bounds: [40, 0, 32, 32],
        },
      ],
    }),
  );
  const scene = (await loadScene(file)).scene;
  assert.equal(scene.layers[0]!.children[1]!.content, 'A');
  assert.equal((scene.layers[1]!.children[1]!.mask as any).target, 'two-shape');
  await renderer.render(scene, root);
});
test('custom font is loaded by content hash and survives bundle export', async () => {
  const { copyFile, mkdir } = await import('node:fs/promises');
  const p = await project();
  await mkdir(join(p.root, 'fonts'));
  await copyFile(
    'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff',
    join(p.root, 'fonts', 'custom.woff'),
  );
  await p.apply({
    reason: 'Use custom font',
    commands: [
      { type: 'registerFont', id: 'brand', font: { source: 'fonts/custom.woff' } },
      {
        type: 'addLayer',
        layer: {
          id: 'copy',
          type: 'text',
          content: 'Type',
          style: { font: 'brand', size: 16 },
          bounds: [0, 50, 90, 30],
        },
      },
    ],
  });
  const before = await p.render();
  assert.ok(before.evidence.fonts['custom:brand']);
  const out = join(p.root, 'export', 'scene.json');
  await p.exportScene(out);
  assert.deepEqual((await (await Project.open(out)).render()).png, before.png);
});

test('partial style updates preserve font, size, alignment and line-height', () => {
  let scene = parseScene({
    version: 1,
    canvas: { width: 96, height: 96 },
    layers: [
      {
        id: 'text',
        type: 'text',
        content: 'Test',
        style: { font: 'display', size: 17, align: 'center', line_height: 1.6 },
      },
    ],
  });
  scene = applyCommand(scene, { type: 'setStyle', target: 'text', style: { colour: '#eeddcc' } });
  assert.equal(scene.layers[0]!.style!.size, 17);
  assert.equal(scene.layers[0]!.style!.font, 'display');
  assert.equal(scene.layers[0]!.style!.align, 'center');
  assert.equal(scene.layers[0]!.style!.line_height, 1.6);
});

test('viewport rendering is exact and falls back for antialias-sensitive geometry', async () => {
  const s = base();
  s.canvas.background = '#8899aa';
  s.layers[0]!.blend_mode = 'multiply';
  s.layers[0]!.transform = { rotation: 17, scale: [1, 1] };
  s.layers.push(
    parseScene({
      version: 1,
      canvas: { width: 96, height: 96 },
      layers: [
        {
          id: 'text',
          type: 'text',
          bounds: [12, 40, 70, 30],
          content: 'Viewport',
          style: { size: 12 },
        },
      ],
    }).layers[0]!,
  );
  const painted = applyCommand(s, {
      type: 'applyRasterOperation',
      target: 'hero',
      operation: { type: 'brightness', bounds: [14, 14, 12, 12], amount: 0.1 },
    }),
    r = new SkiaRenderer();
  const fast = await r.render(painted, root, { region: [15, 12, 38, 52] }),
    slow = await r.render(painted, root, { region: [15, 12, 38, 52], regionMode: 'full' });
  assert.ok(fast.png.equals(slow.png));
  assert.equal(fast.statistics.viewport_pixels, undefined);
  const simple = structuredClone(painted);
  delete simple.layers[0]!.transform;
  simple.layers[1]!.shape = { type: 'rectangle', fill: '#ff8800', radius: 0, stroke_width: 1 };
  const a = await r.render(simple, root, { region: [15, 12, 38, 52] }),
    b = await r.render(simple, root, { region: [15, 12, 38, 52], regionMode: 'full' });
  assert.ok(a.png.equals(b.png));
  assert.equal(a.statistics.viewport_pixels, 38 * 52);
});

test('a missing history archive fails closed instead of reverting to the source', async () => {
  const { unlink, readFile } = await import('node:fs/promises');
  const p = await project();
  await p.apply({
    reason: 'Record',
    commands: [{ type: 'setOpacity', target: 'hero', opacity: 0.3 }],
  });
  await p.compactHistory();
  const pointer = JSON.parse(await readFile(`${p.journal}.archive.json`, 'utf8'));
  await unlink(join(p.root, 'history', pointer.file));
  await assert.rejects(() => p.scene(), /ENOENT/);
});
test('an unresolved visual critique blocks an otherwise passing edit loop', async () => {
  const { runIterations } = await import('../src/workflow.js');
  const p = await project();
  let calls = 0;
  const result = await runIterations(
    p,
    async () => {
      calls++;
      return {
        reason: 'Quiet the secondary shape',
        commands: [{ type: 'setOpacity', target: 'other', opacity: 0.4 }],
      };
    },
    {
      requireCritique: true,
      critic: async ({ render }) => ({
        scene_hash: render.evidence.scene.hash,
        png_hash: render.evidence.render.png_hash,
        reviewer: 'Test critic',
        method: 'vision-agent',
        summary: calls ? 'Balanced' : 'Competing shapes',
        score: calls ? 0.9 : 0.5,
        issues: calls
          ? []
          : [
              {
                id: 'balance',
                category: 'composition',
                severity: 'medium',
                message: 'Secondary shape competes',
              },
            ],
      }),
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.reason, 'passed');
});
