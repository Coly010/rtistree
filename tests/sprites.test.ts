import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { exportSpriteSheet, parseScene, Project } from '../src/index.js';
import { createServer } from '../src/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const root = await mkdtemp(join(tmpdir(), 'rtistree-sprites-'));
const exec = promisify(execFile);
const source = {
  version: 1,
  canvas: { width: 4, height: 2, background: '#00000000' },
  pixel_art: {
    scale: 1,
    palette: ['#ff0000', '#00ff00', '#0000ff', '#ffffff'],
  },
  layers: [
    {
      id: 'pixels',
      type: 'raster',
      tiles: [
        {
          bounds: [0, 0, 4, 2],
          palette: { A: '#ff0000', B: '#00ff00', C: '#0000ff', D: '#ffffff' },
          pixels: ['ABCD', 'DCBA'],
        },
      ],
    },
  ],
  sprites: {
    // Authored ordering must not affect deterministic packing.
    frames: {
      walk2: { bounds: [2, 0, 2, 2], pivot: [1, 2], duration: 80, tags: ['walk'] },
      walk1: { bounds: [0, 0, 2, 2], pivot: [1, 2], duration: 70, tags: ['walk'] },
    },
    animations: { walk: { frames: ['walk1', 'walk2'], loop: true } },
    atlas: { padding: 1, extrusion: 1, max_width: 12 },
  },
};

test('strict pixel scenes guard tile grids, palettes and soft transforms', () => {
  assert.throws(
    () =>
      parseScene({
        ...source,
        layers: [{ ...source.layers[0], effects: [{ type: 'blur', radius: 1 }] }],
      }),
    /Strict pixel art/,
  );
  assert.throws(
    () =>
      parseScene({
        ...source,
        pixel_art: { ...source.pixel_art, palette: ['#ff0000'] },
      }),
    /outside pixel_art.palette/,
  );
  assert.throws(
    () =>
      parseScene({
        ...source,
        sprites: { ...source.sprites, animations: { bad: { frames: ['missing'] } } },
      }),
    /unknown frame/,
  );
});

test('sprite export packs exact untrimmed pixels, extrusion, metadata and evidence', async () => {
  const dir = await mkdtemp(join(root, 'project-')),
    file = join(dir, 'scene.json'),
    atlas = join(dir, 'atlas.png'),
    manifest = join(dir, 'atlas.json');
  await writeFile(file, JSON.stringify(source));
  const project = await Project.open(file),
    first = await exportSpriteSheet(project, atlas, { manifest }),
    png = await readFile(atlas),
    json = JSON.parse(await readFile(manifest, 'utf8'));
  assert.equal(first.frames, 2);
  assert.equal(json.format, 'rtistree-sprites@1');
  assert.equal(json.atlas.trimmed, false);
  assert.equal(json.atlas.sampling, 'nearest');
  assert.deepEqual(json.frames.walk1.frame, [2, 2, 2, 2]);
  assert.deepEqual(json.frames.walk1.pivot, [1, 2]);
  assert.equal(json.animations.walk.loop, true);
  const decoded = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [
    ...decoded.data.subarray(
      (y * decoded.info.width + x) * 4,
      (y * decoded.info.width + x) * 4 + 4,
    ),
  ];
  assert.deepEqual(pixel(2, 2), [255, 0, 0, 255], 'first source pixel');
  assert.deepEqual(pixel(1, 2), [255, 0, 0, 255], 'left extrusion repeats exact edge');
  assert.deepEqual(pixel(0, 2), [0, 0, 0, 0], 'padding remains transparent');
  const second = await exportSpriteSheet(project, atlas, { manifest });
  assert.equal(second.evidence.atlas_png_hash, first.evidence.atlas_png_hash);
});

test('strict sprite export rejects rendered colours outside the declared palette', async () => {
  const dir = await mkdtemp(join(root, 'palette-')),
    file = join(dir, 'scene.json');
  await writeFile(
    file,
    JSON.stringify({
      ...source,
      layers: [
        {
          id: 'not-in-palette',
          type: 'procedural',
          generator: { type: 'solid', colour: '#123456' },
        },
      ],
    }),
  );
  const project = await Project.open(file);
  await assert.rejects(() => project.render(), /Rendered pixel outside pixel_art.palette/);
  await assert.rejects(
    () => exportSpriteSheet(project, join(dir, 'atlas.png')),
    /Rendered pixel outside pixel_art.palette/,
  );
});

test('sprite export is available through the CLI and MCP with project-local artifacts', async () => {
  const dir = await mkdtemp(join(root, 'interfaces-')),
    file = join(dir, 'scene.json'),
    cliAtlas = join(dir, 'cli.png'),
    cliManifest = join(dir, 'cli.json');
  await writeFile(file, JSON.stringify(source));
  const cli = resolve('src/cli.ts');
  await exec(process.execPath, [
    '--import',
    'tsx',
    cli,
    'sprites',
    file,
    '-o',
    cliAtlas,
    '--manifest',
    cliManifest,
  ]);
  assert.equal((await readFile(cliAtlas)).subarray(1, 4).toString(), 'PNG');
  assert.equal(JSON.parse(await readFile(cliManifest, 'utf8')).format, 'rtistree-sprites@1');
  const project = await Project.open(file),
    server = createServer(project),
    client = new Client({ name: 'sprites-test', version: '1.0.0' }),
    [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    assert.ok((await client.listTools()).tools.some((tool) => tool.name === 'exportSprites'));
    const result = await client.callTool({ name: 'exportSprites', arguments: { name: 'mcp' } });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse((result.content as { text: string }[])[0]!.text).frames, 2);
  } finally {
    await client.close();
    await server.close();
  }
});
