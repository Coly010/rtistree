import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Project,
  buildPipeline,
  production,
  sceneHash,
  createRasterStudio,
  replayRecipe,
  studioDirectory,
} from '../src/index.js';
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rtistree-atelier-'));
  await writeFile(
    join(root, 'scene.json'),
    JSON.stringify({ version: 1, canvas: { width: 32, height: 24 }, layers: [] }),
  );
  return { root, p: await Project.open(join(root, 'scene.json')) };
}
const graph = () => ({
  version: 1,
  id: 'art',
  shared: { red: 30 },
  nodes: [
    {
      id: 'base',
      width: 32,
      height: 24,
      code: 'return art.raster(()=>[parameters.red,30,60,255]);',
      bindings: { red: 'red' },
    },
    {
      id: 'finish',
      target: 'painting',
      width: 32,
      height: 24,
      code: 'return art.input("base");',
      inputs: { base: { node: 'base' } },
    },
    { id: 'independent', width: 4, height: 4, code: 'return art.raster(()=>[100,20,10,255]);' },
  ],
});
test('DAG rebuilds changed nodes and dependants only, pins editable code, and commits atomically', async () => {
  const { p, root } = await fixture();
  const g = graph();
  assert.deepEqual(
    (await buildPipeline(p, g)).nodes.map((n) => n.status),
    ['built', 'built', 'built'],
  );
  assert.equal((await p.history()).length, 1);
  const firstCache = (await buildPipeline(p, g)).nodes;
  const cacheFile = await studioDirectory(p, 'cache', firstCache[0]!.key.slice(7) + '.json');
  const wrongFile = await studioDirectory(p, 'cache', firstCache[2]!.key.slice(7) + '.json');
  await writeFile(cacheFile, await readFile(wrongFile));
  assert.deepEqual(
    (await buildPipeline(p, g)).nodes.map((n) => n.status),
    ['built', 'cached', 'cached'],
  );

  const cached = await buildPipeline(p, g);
  assert.ok(!cached.changed);
  assert.ok(cached.nodes.every((n) => n.status === 'cached'));
  g.shared.red = 90;
  const update = await buildPipeline(p, g);
  assert.deepEqual(
    update.nodes.map((n) => n.status),
    ['built', 'built', 'cached'],
  );
  assert.equal((await p.history()).length, 2);
  assert.ok((await replayRecipe(root, (await p.scene()).assets.art_finish!.recipe!)).identical);
  const before = sceneHash(await p.scene());
  g.shared.red = 180;
  g.nodes[1]!.code = 'throw new Error("failed finish")';
  await assert.rejects(() => buildPipeline(p, g), /failed finish/);
  assert.equal(sceneHash(await p.scene()), before);
  await assert.rejects(
    () =>
      buildPipeline(p, {
        ...graph(),
        nodes: [{ ...graph().nodes[0], inputs: { self: { node: 'base' } } }],
      }),
    /cycle/,
  );
  await assert.rejects(() => buildPipeline(p, graph(), 'sha256:stale'), /Stale/);
  const saved = await p.scene();
  assert.ok(saved.metadata.pipeline_art);
  await assert.rejects(
    () =>
      buildPipeline(p, {
        ...graph(),
        nodes: [{ ...graph().nodes[0], inputs: { self: { asset: 'art_base' } } }],
      }),
    /node reference/,
  );
  await p.exportScene(join(root, 'portable', 'scene.json'));
  assert.deepEqual(
    (await Project.open(join(root, 'portable', 'scene.json'))).source.scene.metadata,
    saved.metadata,
  );
});
test('stages enforce complete hash-bound visual reviews, preserve candidates and reject regressions', async () => {
  const { p, root } = await fixture();
  await buildPipeline(p, graph());
  const plan = {
    id: 'trial',
    brief: 'A warm field',
    stages: [
      {
        id: 'block',
        goal: 'Read shapes',
        criteria: [{ id: 'shapes', description: 'Large shapes read' }],
      },
    ],
  };
  await production(p, { action: 'plan', plan });
  const capture = async (candidate: string) =>
    production(p, {
      action: 'capture',
      session: 'trial',
      candidate,
      expected_hash: sceneHash(await p.scene()),
      crops: [[0, 0, 10, 10]],
    });
  let state = (await capture('first')) as any;
  const first = state.candidates[0];
  await assert.rejects(
    async () =>
      production(p, {
        action: 'select',
        session: 'trial',
        candidate: 'first',
        expected_hash: sceneHash(p.source.scene),
      }),
    /gates/,
  );
  const review = (c: any, quality: number) => ({
    candidate: c.id,
    scene_hash: c.scene_hash,
    png_hash: c.png_hash,
    reviewer: 'test observer',
    method: 'human',
    fidelity: 0.9,
    quality,
    criteria: [{ id: 'shapes', pass: true, evidence: 'Solid fields fill the frame' }],
    strengths: 'Legible field',
    weaknesses: 'Minimal detail',
  });
  await assert.rejects(
    async () =>
      production(p, {
        action: 'review',
        session: 'trial',
        review: { ...review(first, 0.9), png_hash: 'stale' },
      }),
    /Stale/,
  );
  await assert.rejects(
    async () =>
      production(p, {
        action: 'review',
        session: 'trial',
        review: { ...review(first, 0.9), criteria: [] },
      }),
    /every stage/,
  );
  await production(p, { action: 'review', session: 'trial', review: review(first, 0.9) });
  await production(p, {
    action: 'select',
    session: 'trial',
    candidate: 'first',
    expected_hash: sceneHash(await p.scene()),
  });
  const g = graph();
  g.shared.red = 120;
  await buildPipeline(p, g);
  const secondRender = await p.render();
  state = await capture('second');
  await production(p, {
    action: 'review',
    session: 'trial',
    review: review(state.candidates[1], 0.8),
  });
  await assert.rejects(
    async () =>
      production(p, {
        action: 'select',
        session: 'trial',
        candidate: 'second',
        expected_hash: sceneHash(await p.scene()),
      }),
    /regresses/,
  );
  const compare = (await production(p, { action: 'compare', session: 'trial' })) as any;
  assert.ok((await readFile(compare.image)).length > 0);
  await assert.rejects(
    async () =>
      production(p, {
        action: 'advance',
        session: 'trial',
        expected_hash: sceneHash(await p.scene()),
      }),
    /still be/,
  );
  await production(p, {
    action: 'select',
    session: 'trial',
    candidate: 'first',
    expected_hash: sceneHash(await p.scene()),
  });
  assert.equal(sceneHash(await p.scene()), first.scene_hash);
  await p.undo();
  assert.ok((await p.render()).png.equals(secondRender.png));
  await p.redo();
  const done = (await production(p, {
    action: 'advance',
    session: 'trial',
    expected_hash: sceneHash(await p.scene()),
  })) as any;
  assert.ok(done.complete);
});
test('oil techniques are seeded, clip to silhouettes, preserve context and support dry paint', () => {
  const paint = (seed: number, dryness: number) => {
    const a = createRasterStudio(64, 32, seed),
      c = a.canvas(),
      ctx = c.getContext('2d');
    ctx.beginPath();
    ctx.rect(10, 5, 40, 20);
    ctx.clip();
    ctx.globalAlpha = 0.8;
    ctx.translate(1, 0);
    a.techniques.stroke(
      c,
      [
        { x: 0, y: 16 },
        { x: 60, y: 16 },
      ],
      { colour: '#a37248', size: 18, dryness, smoothing: 1 },
    );
    assert.equal(ctx.globalAlpha, 0.8);
    a.techniques.glaze(c, '#aa8844', 0.1);
    return c.toBuffer('image/png');
  };
  assert.ok(paint(4, 0.2).equals(paint(4, 0.2)));
  assert.ok(!paint(4, 0.2).equals(paint(5, 0.2)));
  assert.ok(!paint(4, 0.2).equals(paint(4, 0.8)));
  const a = createRasterStudio(64, 32, 4),
    c = a.canvas();
  a.techniques.stroke(
    c,
    [
      { x: 5, y: 16 },
      { x: 55, y: 16 },
    ],
    { colour: '#a37248', size: 12 },
  );
  assert.equal(a.pixels(c).data[3], 0);
  assert.throws(
    () => a.techniques.stroke(c, [], { colour: '#123456', size: 10, bristles: 100 }),
    /Invalid/,
  );
});
