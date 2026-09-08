import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, symlink, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '../src/native.js';
import { parseScene, type Scene } from '../src/schema.js';
import { defaultRenderer } from '../src/render.js';
import { measureLocality, verifyScene } from '../src/verify.js';
import { Project } from '../src/project.js';
import { loadScene } from '../src/loader.js';
import { applyCommand } from '../src/commands.js';
import { runIterations } from '../src/workflow.js';
import { sceneHash, sha256 } from '../src/assets.js';
import { resolveLayout } from '../src/layout.js';

const root = await mkdtemp(join(tmpdir(), 'rtistree-tests-'));
function scene(layers: unknown[] = [], extra: object = {}): Scene {
  return parseScene({
    version: 1,
    canvas: { width: 64, height: 64, background: '#101820' },
    layers,
    ...extra,
  });
}
const rect = {
  id: 'hero',
  type: 'vector',
  bounds: [8, 8, 48, 48],
  shape: { type: 'rectangle', fill: '#305060' },
};
async function project(input: Scene) {
  const dir = await mkdtemp(join(root, 'project-'));
  const file = join(dir, 'scene.json');
  await writeFile(file, JSON.stringify(input));
  return Project.open(file);
}
const render = (s: Scene) => defaultRenderer.render(s, root);
function pixel(result: Awaited<ReturnType<typeof render>>, x: number, y: number) {
  return [...result.pixels.slice((y * result.width + x) * 4, (y * result.width + x) * 4 + 4)];
}

test('strict schema rejects unknown fields, duplicate IDs, dangling and cyclic masks', () => {
  assert.throws(() => parseScene({ ...scene(), surprise: true }), /Unrecognized/);
  assert.throws(() => scene([rect, rect]), /Duplicate/);
  assert.throws(
    () => scene([{ ...rect, mask: { type: 'semantic-object', target: 'missing' } }]),
    /Unknown mask/,
  );
  assert.throws(
    () => scene([{ ...rect, mask: { type: 'semantic-object', target: 'hero' } }]),
    /Cyclic/,
  );
  assert.throws(() => scene([{ id: 'broken', type: 'text' }]), /requires content/);
  assert.throws(
    () =>
      scene([
        {
          id: 'tile',
          type: 'raster',
          tiles: [{ bounds: [0, 0, 4, 4], palette: { A: '#ffffff' }, pixels: ['AB'] }],
        },
      ]),
    /Missing palette/,
  );
});
test('seeded rendering is byte identical and includes asset/font/runtime provenance', async () => {
  const s = scene([
    {
      id: 'noise',
      type: 'procedural',
      generator: { type: 'noise', seed: 78, amount: 0.2, colour: '#678abc' },
    },
  ]);
  const a = await render(s),
    b = await render(s);
  assert.deepEqual(a.png, b.png);
  assert.deepEqual(a.evidence, b.evidence);
  assert.equal(Object.keys(a.evidence.fonts).length, 3);
  const different = structuredClone(s);
  (different.layers[0]!.generator as { seed: number }).seed++;
  assert.notDeepEqual((await render(different)).png, a.png);
});
test('transformed group, opacity and blend modes compose', async () => {
  const s = scene([
    {
      id: 'g',
      type: 'group',
      bounds: [16, 16, 32, 32],
      opacity: 0.5,
      children: [
        {
          id: 'child',
          type: 'vector',
          bounds: [0, 0, 16, 16],
          shape: { type: 'rectangle', fill: '#ffffff' },
        },
      ],
    },
  ]);
  const out = await render(s);
  assert.deepEqual(pixel(out, 0, 0), [16, 24, 32, 255]);
  assert.ok(pixel(out, 20, 20)[0]! > 100);
  const screen = scene([{ ...rect, blend_mode: 'screen' }]);
  assert.ok(pixel(await render(screen), 20, 20)[0]! > 48);
});
test('row layout percentages account for gaps and padding', () => {
  const s = scene([
    {
      id: 'row',
      type: 'group',
      layout: { type: 'horizontal', padding: 4, gap: 4 },
      children: [
        { ...rect, id: 'a', bounds: undefined, width: '50%' },
        { ...rect, id: 'b', bounds: undefined, width: '50%' },
      ],
    },
  ]);
  const nodes = resolveLayout(s)[0]!.children;
  assert.deepEqual(
    nodes.map((n) => n.bounds),
    [
      [4, 4, 26, 56],
      [34, 4, 26, 56],
    ],
  );
});
test('region render equals a crop of the complete composite including blur context', async () => {
  const s = scene([{ ...rect, effects: [{ type: 'blur', radius: 4 }] }]),
    full = await render(s),
    crop = await defaultRenderer.render(s, root, { region: [7, 9, 13, 17] });
  for (let y = 0; y < 17; y++)
    for (let x = 0; x < 13; x++) assert.deepEqual(pixel(crop, x, y), pixel(full, x + 7, y + 9));
  await assert.rejects(
    () => defaultRenderer.render(s, root, { region: [-1, 0, 20, 20] }),
    /inside the canvas/,
  );
});
test('brightness, blur, soft brushes and direct pixels preserve exact edit locality', async () => {
  const before = scene([rect]);
  for (const operation of [
    { type: 'brightness', amount: 0.25 },
    { type: 'blur', radius: 8 },
    {
      type: 'paintStroke',
      path: [
        [0, 0],
        [64, 64],
      ],
      radius: 15,
      hardness: 0.1,
      colour: '#ff6c40',
    },
    {
      type: 'setPixels',
      pixels: [
        { x: 21, y: 21, colour: '#ffffff' },
        { x: 0, y: 0, colour: '#ffffff' },
      ],
    },
  ]) {
    const next = applyCommand(before, {
      type: 'applyRasterOperation',
      target: 'hero',
      operation: { ...operation, bounds: [20, 20, 8, 8] },
    });
    const delta = measureLocality(await render(before), await render(next), [[20, 20, 8, 8]]);
    assert.equal(delta.outside_changed_pixels, 0);
    if (operation.type !== 'blur') assert.ok(delta.changed_pixels > 0);
  }
});
test('semantic masks restrict editing to target alpha', async () => {
  const before = scene([
    rect,
    {
      id: 'circle',
      type: 'vector',
      bounds: [16, 16, 32, 32],
      shape: { type: 'ellipse', fill: '#ffffff' },
      z: -1,
    },
  ]);
  const after = applyCommand(before, {
    type: 'applyRasterOperation',
    target: 'hero',
    operation: {
      type: 'fill',
      bounds: [0, 0, 64, 64],
      colour: '#ff0000',
      mask: { type: 'semantic-object', target: 'circle' },
    },
  });
  const a = await render(before),
    b = await render(after);
  assert.deepEqual(pixel(a, 8, 8), pixel(b, 8, 8));
  assert.deepEqual(pixel(b, 32, 32), [255, 0, 0, 255]);
});
test('palette tiles preserve palette colours and scoped pixels', async () => {
  const s = scene([
    {
      id: 'tile',
      type: 'raster',
      tiles: [
        { bounds: [8, 8, 16, 16], palette: { A: '#ff0000', B: '#00ff00' }, pixels: ['AB', 'BA'] },
      ],
    },
  ]);
  const out = await render(s);
  assert.deepEqual(pixel(out, 10, 10), [255, 0, 0, 255]);
  assert.deepEqual(pixel(out, 20, 10), [0, 255, 0, 255]);
});
test('multi-file scenes compose in include order and rebase fragment assets', async () => {
  const dir = await mkdtemp(join(root, 'include-'));
  await mkdir(join(dir, 'parts'));
  await writeFile(
    join(dir, 'parts', 'background.yaml'),
    'layers:\n  - id: background\n    type: procedural\n    generator: {type: solid, colour: "#abcdef"}\n',
  );
  await writeFile(
    join(dir, 'parts', 'foreground.json'),
    JSON.stringify({
      assets: { texture: { source: 'texture.png' } },
      layers: [{ id: 'texture', type: 'asset', source: 'texture' }],
    }),
  );
  await writeFile(
    join(dir, 'scene.json'),
    JSON.stringify({
      version: 1,
      canvas: { width: 64, height: 64 },
      include: ['parts/background.yaml', 'parts/foreground.json'],
      layers: [rect],
    }),
  );
  const result = await loadScene(join(dir, 'scene.json'));
  assert.deepEqual(
    result.scene.layers.map((l) => l.id),
    ['background', 'texture', 'hero'],
  );
  assert.equal(result.scene.assets.texture!.source, 'parts/texture.png');
  await writeFile(join(dir, 'parts', 'cycle.yaml'), 'include: [../scene.json]\n');
  await writeFile(
    join(dir, 'scene.json'),
    JSON.stringify({
      version: 1,
      canvas: { width: 64, height: 64 },
      include: ['parts/cycle.yaml'],
    }),
  );
  await assert.rejects(() => loadScene(join(dir, 'scene.json')), /Cyclic scene include/);
});
test('asset hashes are enforced and traversal/symlink escapes are rejected', async () => {
  const image = createCanvas(2, 2);
  image.getContext('2d').fillRect(0, 0, 2, 2);
  const png = await image.encode('png');
  await writeFile(join(root, 'asset.png'), png);
  const s = scene([{ id: 'asset', type: 'asset', source: 'test' }], {
    assets: { test: { source: 'asset.png', hash: sha256(png) } },
  });
  assert.equal((await render(s)).evidence.assets.test, sha256(png));
  s.assets.test!.hash = 'sha256:' + '0'.repeat(64);
  await assert.rejects(() => render(s), /hash mismatch/);
  const sub = join(root, 'contained');
  await mkdir(sub);
  await symlink(join(root, 'asset.png'), join(sub, 'escape.png'));
  const escaped = scene([], { assets: { test: { source: 'escape.png' } } });
  await assert.rejects(() => defaultRenderer.render(escaped, sub), /escapes project/);
});
test('transactions persist across reopening, and undo/redo reproduce exact output', async () => {
  const p = await project(scene([rect])),
    initial = await p.render();
  const entry = await p.apply({
    reason: 'Light the hero locally',
    expected_hash: initial.evidence.scene.hash,
    commands: [
      {
        type: 'applyRasterOperation',
        target: 'hero',
        operation: { type: 'brightness', amount: 0.2, bounds: [20, 20, 8, 8] },
      },
    ],
  });
  assert.equal(entry.locality[0]!.outside_changed_pixels, 0);
  const reopened = await Project.open(p.source.file),
    changed = await reopened.render();
  assert.notDeepEqual(initial.png, changed.png);
  await reopened.undo();
  assert.deepEqual((await reopened.render()).png, initial.png);
  await reopened.redo();
  assert.deepEqual((await reopened.render()).png, changed.png);
  assert.equal((await reopened.history()).length, 3);
});
test('failed batches and stale edits leave no partial mutation', async () => {
  const p = await project(scene([rect])),
    hash = sceneHash(await p.scene());
  await assert.rejects(
    () =>
      p.apply({
        reason: 'Bad batch',
        commands: [
          { type: 'setOpacity', target: 'hero', opacity: 0.2 },
          { type: 'setText', target: 'hero', content: 'invalid' },
        ],
      }),
    /text layer/,
  );
  assert.equal(sceneHash(await p.scene()), hash);
  assert.equal((await p.history()).length, 0);
  await assert.rejects(
    () =>
      p.apply({
        reason: 'Stale',
        expected_hash: 'old',
        commands: [{ type: 'setOpacity', target: 'hero', opacity: 0.5 }],
      }),
    /Stale/,
  );
});
test('locality guard rejects edits leaking through an ancestor blur', async () => {
  const p = await project(
    scene([
      { id: 'group', type: 'group', effects: [{ type: 'blur', radius: 4 }], children: [rect] },
    ]),
  );
  await assert.rejects(
    () =>
      p.apply({
        reason: 'Must stay local',
        commands: [
          {
            type: 'applyRasterOperation',
            target: 'hero',
            operation: { type: 'fill', bounds: [20, 20, 8, 8], colour: '#ffffff' },
          },
        ],
      }),
    /outside its scope/,
  );
  assert.equal((await p.history()).length, 0);
});
test('history detects tampering and edits to authoring sources', async () => {
  const p = await project(scene([rect]));
  await p.apply({
    reason: 'Edit',
    commands: [{ type: 'setOpacity', target: 'hero', opacity: 0.5 }],
  });
  await writeFile(p.source.file, JSON.stringify(scene([{ ...rect, opacity: 0.8 }])));
  await assert.rejects(() => p.scene(), /Authoring files changed/);
  const q = await project(scene([rect]));
  await q.apply({
    reason: 'Edit',
    commands: [{ type: 'setOpacity', target: 'hero', opacity: 0.5 }],
  });
  await writeFile(
    q.journal,
    (await readFile(q.journal, 'utf8')).replace('"reason":"Edit"', '"reason":"Tampered"'),
  );
  await assert.rejects(() => q.scene(), /integrity/);
});
test('verification reports real overflow and declared contrast without mutating scenes', async () => {
  const s = scene(
    [
      {
        id: 'copy',
        type: 'text',
        bounds: [4, 4, 15, 10],
        content: 'OVERFLOW',
        style: { size: 24, colour: '#111111' },
      },
    ],
    {
      verification: {
        rules: [{ type: 'contrast', target: 'copy', against: '#101820', minimum: 4.5 }],
      },
    },
  );
  const before = sceneHash(s),
    report = verifyScene(s, await render(s));
  assert.equal(report.status, 'fail');
  assert.ok(report.issues.some((i) => i.message.includes('clipped')));
  assert.ok(report.issues.some((i) => i.message.includes('contrast')));
  assert.equal(sceneHash(s), before);
});
test('bounded agent loop improves measured region luma while preserving unrelated pixels', async () => {
  const p = await project(
      scene([rect], {
        verification: { rules: [{ type: 'region-luma', bounds: [20, 20, 8, 8], minimum: 0.55 }] },
      }),
    ),
    before = await p.render();
  const result = await runIterations(p, async (observation) => {
    assert.equal(observation.verification.status, 'fail');
    return {
      reason: 'Increase measured subject lighting',
      commands: [
        {
          type: 'applyRasterOperation',
          target: 'hero',
          operation: { type: 'brightness', bounds: [20, 20, 8, 8], amount: 0.4 },
        },
      ],
    };
  });
  assert.equal(result.reason, 'passed');
  assert.equal(result.iterations, 1);
  assert.equal(measureLocality(before, result.render, [[20, 20, 8, 8]]).outside_changed_pixels, 0);
});
test('iteration budget prevents endless ineffective refinement', async () => {
  const p = await project(
    scene([rect], { verification: { rules: [{ type: 'required-role', role: 'missing' }] } }),
  );
  const result = await runIterations(
    p,
    async () => ({
      reason: 'No improvement',
      commands: [{ type: 'setOpacity', target: 'hero', opacity: 1 }],
    }),
    { maxIterations: 1 },
  );
  assert.equal(result.reason, 'iteration-budget');
  assert.equal(result.iterations, 1);
});
test('new edit after undo clears redo without erasing audit history', async () => {
  const p = await project(scene([rect]));
  await p.apply({ reason: 'A', commands: [{ type: 'setOpacity', target: 'hero', opacity: 0.5 }] });
  await p.undo();
  await p.apply({ reason: 'B', commands: [{ type: 'setOpacity', target: 'hero', opacity: 0.8 }] });
  await assert.rejects(() => p.redo(), /Nothing to redo/);
  assert.equal((await p.history()).length, 3);
});
test('export creates a self-contained project with pinned raster assets', async () => {
  const p = await project(scene([]));
  const png = await createCanvas(2, 2).encode('png');
  await writeFile(join(p.root, 'test.png'), png);
  await writeFile(
    p.source.file,
    JSON.stringify(
      scene([{ id: 'image', type: 'asset', source: 'test' }], {
        assets: { test: { source: 'test.png' } },
      }),
    ),
  );
  const before = await p.render(),
    destination = join(root, 'exported', 'scene.json');
  await p.exportScene(destination);
  const exported = await Project.open(destination);
  assert.deepEqual((await exported.render()).png, before.png);
  assert.ok((await exported.scene()).assets.test!.hash);
});

test('required roles respect hidden ancestors', async () => {
  const s = scene(
    [{ id: 'hidden', type: 'group', visible: false, children: [{ ...rect, role: 'hero' }] }],
    { verification: { rules: [{ type: 'required-role', role: 'hero' }] } },
  );
  assert.equal(verifyScene(s, await render(s)).status, 'fail');
});
test('verification rejects mismatched scenes and draft/crop renders', async () => {
  const s = scene([rect]);
  assert.throws(
    () => verifyScene(scene([]), { ...({} as any), evidence: { scene: { hash: 'different' } } }),
    /exact scene/,
  );
  const draft = await defaultRenderer.render(s, root, { quality: 'draft' });
  assert.throws(() => verifyScene(s, draft), /full-resolution/);
});
test('adjustment layers mix scoped changes by opacity and mask', async () => {
  const initial = scene([rect]),
    next = scene([
      rect,
      {
        id: 'grade',
        type: 'adjustment',
        opacity: 0.5,
        mask: { type: 'rectangle', bounds: [20, 20, 4, 4] },
        operations: [{ type: 'brightness', amount: 0.4, bounds: [16, 16, 16, 16] }],
      },
    ]);
  const a = await render(initial),
    b = await render(next);
  assert.equal(measureLocality(a, b, [[20, 20, 4, 4]]).outside_changed_pixels, 0);
  assert.ok(pixel(b, 21, 21)[0]! > pixel(a, 21, 21)[0]!);
});
test('history refuses changed asset bytes even without an author-supplied hash', async () => {
  const p = await project(scene([]));
  const image = createCanvas(2, 2);
  await writeFile(join(p.root, 'image.png'), await image.encode('png'));
  await writeFile(
    p.source.file,
    JSON.stringify(
      scene([{ id: 'image', type: 'asset', source: 'asset' }], {
        assets: { asset: { source: 'image.png' } },
      }),
    ),
  );
  await p.apply({
    reason: 'Record input asset',
    commands: [{ type: 'setOpacity', target: 'image', opacity: 0.5 }],
  });
  image.getContext('2d').fillRect(0, 0, 2, 2);
  await writeFile(join(p.root, 'image.png'), await image.encode('png'));
  await assert.rejects(() => p.render(), /Asset changed since/);
});
