import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  createRasterStudio,
  sample,
  executeRasterProgram,
  runProgram,
  replayRecipe,
  Project,
  writeRasterRegion,
  readRasterRegion,
  sceneHash,
  heightNormal,
  lightSurface,
} from '../src/index.js';

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'rtistree-studio-'));
  await writeFile(
    join(root, 'scene.json'),
    JSON.stringify({
      version: 1,
      canvas: { width: 64, height: 64 },
      layers: [
        {
          id: 'paint',
          type: 'raster',
          bounds: [0, 0, 64, 64],
          operations: [{ type: 'fill', bounds: [0, 0, 64, 64], colour: '#336699' }],
        },
      ],
    }),
  );
  return { root, p: await Project.open(join(root, 'scene.json')) };
}
test('studio sampling, coordinate warps, seeded textures and pressure brushes preserve their contracts', () => {
  const art = createRasterStudio(16, 16, 42),
    copy = createRasterStudio(16, 16, 42);
  assert.equal(art.noise(2.4, 4.3), copy.noise(2.4, 4.3));
  assert.equal(art.random(), copy.random());
  const source = art.raster((x, y) => [x * 15, y * 15, 20, 255]);
  assert.deepEqual(art.pixels(art.warp(source, (x, y) => [x, y])).data, art.pixels(source).data);
  assert.deepEqual(
    sample(
      { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]) },
      0.5,
      0,
    ),
    [255, 0, 0, 127.5],
  );
  const shifted = art.displace(source, () => [1, 0], 1, 'repeat');
  assert.deepEqual(sample(art.pixels(shifted), 15, 2), [0, 30, 20, 255]);
  const brush = art.canvas();
  art.brush(
    brush,
    [
      { x: 3, y: 8, pressure: 0.2 },
      { x: 12, y: 8, pressure: 1 },
    ],
    { radius: 3, colour: '#ff0000', hardness: 0.5 },
  );
  assert.ok(sample(art.pixels(brush), 10, 8)[3] > sample(art.pixels(brush), 3, 8)[3]);
  assert.doesNotThrow(() =>
    art.brush(
      brush,
      [
        { x: 3, y: 3, pressure: 0.6 },
        { x: 14.3, y: 13.8, pressure: 0 },
      ],
      { radius: 0.71, colour: '#808080', spacing: 0.5 },
    ),
  );
  assert.deepEqual(
    heightNormal(() => 0, 2, 3),
    [0, 0, 1],
  );
  const front = lightSurface([0, 0, 1], [100, 80, 60, 255], { light: [0, 0, 1], specular: 0 }),
    back = lightSurface([0, 0, -1], [100, 80, 60, 255], { light: [0, 0, 1], specular: 0 });
  assert.ok(front[0] > back[0]);
});
test('program execution is seeded and bounded; failure cannot mutate a project', async () => {
  const options = { width: 8, height: 8, seed: 99, parameters: {}, timeout_ms: 1000 };
  const source = 'return art.raster(() => [Math.random()*255,art.random()*255,0,255]);';
  assert.ok(
    (await executeRasterProgram(source, options)).equals(
      await executeRasterProgram(source, options),
    ),
  );
  await assert.rejects(
    () => executeRasterProgram('while(true){}', { ...options, timeout_ms: 50 }),
    /timed out|limit/,
  );
  await assert.rejects(() => executeRasterProgram('return art.canvas(9000,2);', options), /budget/);
  const { root, p } = await project(),
    before = sceneHash(await p.scene());
  await writeFile(join(root, 'broken.js'), 'throw new Error("bad brush");');
  await assert.rejects(
    () =>
      runProgram(p, {
        source: 'broken.js',
        asset_id: 'baked',
        width: 8,
        height: 8,
        reason: 'Attempt invalid program',
      }),
    /bad brush/,
  );
  assert.equal(sceneHash(await p.scene()), before);
  assert.equal((await p.history()).length, 0);
});
test('baked recipes pin source, parameters and inputs, replay after bundle export and survive undo', async () => {
  const { root, p } = await project();
  await writeFile(
    join(root, 'texture.js'),
    'return art.raster((x,y)=>[art.noise(x/3,y/3)*255,parameters.green,0,255]);',
  );
  const first = await runProgram(p, {
    source: 'texture.js',
    asset_id: 'base',
    target: 'paint',
    width: 64,
    height: 64,
    seed: 3,
    parameters: { green: 60 },
    reason: 'Paint texture',
  });
  await writeFile(
    join(root, 'warp.js'),
    'return art.displace(art.input("texture"),(x,y)=>[Math.sin(y/6),0],2,"repeat");',
  );
  const second = await runProgram(p, {
    source: 'warp.js',
    asset_id: 'warped',
    target: 'paint',
    width: 64,
    height: 64,
    inputs: { texture: 'base' },
    reason: 'Warp frozen texture',
  });
  const final = await p.render();
  assert.ok((await replayRecipe(root, second.asset.recipe)).identical);
  await p.undo();
  assert.equal((await p.scene()).layers[0]!.source, 'base');
  await p.redo();
  assert.ok((await p.render()).png.equals(final.png));
  const destination = join(root, 'portable', 'scene.json');
  await p.exportScene(destination);
  const portable = await Project.open(destination),
    recipe = (await portable.scene()).assets.warped!.recipe!;
  assert.ok((await replayRecipe(portable.root, recipe)).identical);
  assert.ok((await portable.render()).png.equals(final.png));
  await writeFile(join(root, first.asset.recipe.source), '{}');
  await assert.rejects(() => replayRecipe(root, first.asset.recipe), /hash mismatch/);
});
test('dense patches distinguish replacement from alpha compositing, enforce dimensions and stale state, and undo exactly', async () => {
  const { root, p } = await project(),
    before = await p.render();
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
  await writeFile(join(root, 'patch.png'), bytes);
  const initialHash = sceneHash(await p.scene());
  const request = {
    target: 'paint',
    region_id: 'detail',
    source: 'patch.png',
    bounds: [10, 10, 8, 8],
    expected_hash: initialHash,
    reason: 'Replace dense patch',
  };
  const entry = await writeRasterRegion(p, request);
  assert.equal(entry.locality[0]!.outside_changed_pixels, 0);
  const replaced = await p.render(),
    offset = (12 * 64 + 12) * 4;
  assert.equal(replaced.pixels[offset + 3], 128);
  await assert.rejects(() => writeRasterRegion(p, request), /Stale/);
  await p.undo();
  assert.ok((await p.render()).png.equals(before.png));
  await writeRasterRegion(p, { ...request, composite: 'over' });
  assert.equal((await p.render()).pixels[offset + 3], 255);
  const read = await readRasterRegion(p, { bounds: [10, 10, 8, 8], target: 'paint' });
  assert.equal(read.render.width, 8);
  assert.equal(read.scene_hash, sceneHash(await p.scene()));
  await assert.rejects(
    () =>
      writeRasterRegion(p, { ...request, bounds: [10, 10, 9, 8], expected_hash: read.scene_hash }),
    /dimensions/,
  );
});
test('dense region patches follow print scaling and preserve the unrelated canvas', async () => {
  const { root, p } = await project();
  await writeFile(
    join(root, 'patch.png'),
    await sharp({ create: { width: 8, height: 8, channels: 4, background: '#ff0000' } })
      .png()
      .toBuffer(),
  );
  await writeRasterRegion(p, {
    target: 'paint',
    region_id: 'detail',
    source: 'patch.png',
    bounds: [10, 10, 8, 8],
    expected_hash: sceneHash(await p.scene()),
    reason: 'Paint print detail',
  });
  await p.apply({
    reason: 'Set twice-resolution print dimensions',
    commands: [
      {
        type: 'setDocument',
        document: { width: 25.4, height: 25.4, unit: 'mm', ppi: 128, bleed: 0, safe_margin: 0 },
      },
    ],
  });
  const { printScene } = await import('../src/print-scene.js');
  const prepared = printScene(await p.scene()),
    r = await p.renderer.render(prepared.scene, root, { cache: false, ...prepared.options });
  const at = (x: number, y: number) => [
    ...r.pixels.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
  ];
  assert.deepEqual(at(24, 24), [255, 0, 0, 255]);
  assert.deepEqual(at(15, 15), [51, 102, 153, 255]);
});
