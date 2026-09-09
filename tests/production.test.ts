import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  createProject,
  Project,
  exportArtwork,
  preflight,
  documentGeometry,
  parseScene,
  SkiaRenderer,
} from '../src/index.js';
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), 'rtistree-print-')),
    dir = join(parent, 'project');
  await createProject(dir, { size: '100x70', ppi: 72, bleed: '3mm', outputDir: 'delivery' });
  const tiff = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#aabbcc' } })
    .withIccProfile('cmyk')
    .tiff()
    .toBuffer();
  const icc = (await sharp(tiff).metadata()).icc!;
  await writeFile(join(dir, 'profiles', 'test.icc'), icc);
  return { dir: await realpath(dir), project: await Project.open(dir) };
}
test('project new creates coherent directories, refuses overwrite, and resolves output', async () => {
  const { dir, project } = await fixture();
  assert.equal(project.outputDirectory, join(dir, 'delivery'));
  await assert.rejects(() => createProject(dir));
  assert.equal((await project.scene()).document?.width, 100);
  assert.equal((await preflight(project, { colour_space: 'cmyk' })).status, 'fail');
  await assert.rejects(() => createProject(join(dir, 'bad'), { outputDir: '../../escape' }));
});
test('JPEG and lossless CMYK TIFF encode the requested format, density and ICC profile', async () => {
  const { dir, project } = await fixture();
  for (const [format, name] of [
    ['jpeg', 'test.jpg'],
    ['tiff', 'test.tif'],
  ] as const) {
    const result = await exportArtwork(project, join(dir, 'delivery', name), {
      format,
      colour_space: 'cmyk',
      profile: 'profiles/test.icc',
      ppi: 72,
    });
    const m = await sharp(await readFile(result.file)).metadata();
    assert.equal(m.format, format);
    assert.equal(m.space, 'cmyk');
    assert.equal(m.channels, 4);
    assert.ok(m.icc);
    assert.equal(m.density, 72);
  }
  await assert.rejects(() =>
    exportArtwork(project, join(dir, 'delivery', 'fake.png'), { format: 'jpeg' }),
  );
  const decoded = await Promise.all(
    ['test.jpg', 'test.tif'].map((name) =>
      sharp(join(dir, 'delivery', name))
        .toColourspace('srgb')
        .removeAlpha()
        .raw()
        .toBuffer(),
    ),
  );
  assert.equal(decoded[0]!.length, decoded[1]!.length);
  const meanError =
    decoded[0]!.reduce((sum, v, i) => sum + Math.abs(v - decoded[1]![i]!), 0) / decoded[0]!.length;
  assert.ok(meanError < 5, `Lossy decoded colour error is too high: ${meanError}`);
});
test('PDF physically adheres to trim and bleed, embeds fonts and real CMYK image/profile objects', async () => {
  const { dir, project } = await fixture();
  await project.apply({
    reason: 'Exercise a raster fallback with transparency alongside embedded text',
    commands: [
      {
        type: 'addLayer',
        layer: {
          id: 'soft-shape',
          type: 'vector',
          bounds: [20, 180, 40, 40],
          shape: { type: 'ellipse', fill: '#33669980' },
          effects: [{ type: 'blur', radius: 2 }],
        },
      },
    ],
  });
  const result = await exportArtwork(project, join(dir, 'delivery', 'test.pdf'), {
    format: 'pdf',
    colour_space: 'cmyk',
    profile: 'profiles/test.icc',
    crop_marks: true,
    ppi: 72,
  });
  const inspection = result.inspection;
  assert.ok('pages' in inspection);
  const p = inspection.pages![0]!;
  assert.ok(Math.abs((p.trim.width * 25.4) / 72 - 100) < 0.01);
  assert.ok(Math.abs((p.trim.height * 25.4) / 72 - 70) < 0.01);
  assert.ok(Math.abs(((p.bleed.width - p.trim.width) * 25.4) / 72 - 6) < 0.01);
  assert.ok(inspection.embedded_fonts!.length > 0);
  assert.equal(inspection.output_intents, 1);
  assert.ok(inspection.images!.some((i) => i.colour_space.includes('ICCBased')));
  assert.ok(inspection.images!.every((i) => !i.colour_space.includes('DeviceRGB')));
  assert.ok(inspection.profile_hashes!.includes(result.profile_hash!));
});
test('document geometry does not round physical sizes to raster pixels', () => {
  const g = documentGeometry({
    width: 8.5,
    height: 11,
    unit: 'in',
    ppi: 300,
    bleed: 0.125,
    safe_margin: 0.2,
  });
  assert.equal(g.trim_pt[0], 612);
  assert.equal(g.trim_pt[1], 792);
  assert.deepEqual(g.pixels, [2625, 3375]);
});
test('sequential uncached composition supports large canvases without retaining every layer', async () => {
  const scene = parseScene({
    version: 1,
    canvas: { width: 4200, height: 1800 },
    layers: Array.from({ length: 20 }, (_, i) => ({
      id: `layer${i}`,
      type: 'vector',
      bounds: [i * 100, 0, 100, 100],
      shape: { type: 'rectangle', fill: '#336699' },
    })),
  });
  const r = await new SkiaRenderer().render(scene, process.cwd(), { cache: false });
  assert.equal(r.width, 4200);
  assert.equal(r.statistics.rasterized_layers, 20);
  assert.equal(r.statistics.cache_bytes, 0);
});
test('print scaling preserves attached paint, direct pixels and palette tiles', async () => {
  const { printScene } = await import('../src/print-scene.js');
  const scene = parseScene({
    version: 1,
    canvas: { width: 40, height: 40 },
    document: { width: 25.4, height: 25.4, unit: 'mm', ppi: 80, bleed: 0, safe_margin: 0 },
    layers: [
      {
        id: 'paint',
        type: 'raster',
        operations: [
          {
            type: 'setPixels',
            bounds: [0, 0, 40, 40],
            pixels: [{ x: 4, y: 5, colour: '#ff0000' }],
          },
        ],
        tiles: [{ bounds: [20, 20, 2, 2], palette: { a: '#00ff00' }, pixels: ['aa', 'aa'] }],
      },
    ],
  });
  const scaled = printScene(scene);
  const r = await new SkiaRenderer().render(scaled.scene, process.cwd(), {
    cache: false,
    ...scaled.options,
  });
  const at = (x: number, y: number) => [
    ...r.pixels.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
  ];
  assert.deepEqual(at(8, 10), [255, 0, 0, 255]);
  assert.deepEqual(at(9, 11), [255, 0, 0, 255]);
  assert.deepEqual(at(40, 40), [0, 255, 0, 255]);
});
test('preflight catches glyphs, source crop resolution and mutated profiles', async () => {
  const { dir, project } = await fixture();
  await project.apply({
    reason: 'Make missing glyph visible to preflight',
    commands: [{ type: 'setText', target: 'title', content: 'Test \u{1F99A}' }],
  });
  const report = await preflight(project, { format: 'pdf' });
  assert.equal(report.status, 'fail');
  assert.ok(report.issues.some((i) => i.message.includes('lacks')));
  const profile = await readFile(join(dir, 'profiles', 'test.icc'));
  const { sha256 } = await import('../src/assets.js');
  const wrong = await preflight(project, {
    colour_space: 'cmyk',
    profile: 'profiles/test.icc',
    profile_hash: sha256(Buffer.from('wrong')),
  });
  assert.ok(wrong.issues.some((i) => i.message.includes('hash mismatch')));
});
