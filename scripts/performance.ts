import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { SkiaRenderer } from '../src/render.js';
import { parseScene } from '../src/schema.js';
import { applyCommand } from '../src/commands.js';
import { writeArtifact } from '../src/artifacts.js';
const scene = parseScene({
  version: 1,
  canvas: { width: 1024, height: 1024 },
  layers: Array.from({ length: 16 }, (_, i) => ({
    id: `tile-${i}`,
    type: 'procedural',
    bounds: [(i % 4) * 256, Math.floor(i / 4) * 256, 256, 256],
    generator: { type: 'gradient', from: '#182c43', to: '#d4bb83', angle: i * 11 },
  })),
});
const renderer = new SkiaRenderer(),
  root = process.cwd();
async function measured(input: typeof scene, options = {}) {
  const start = performance.now(),
    render = await renderer.render(input, root, options);
  return { render, ms: performance.now() - start };
}
const cold = await measured(scene),
  warm = await measured(scene),
  edited = applyCommand(scene, {
    type: 'setGenerator',
    target: 'tile-5',
    generator: { type: 'gradient', from: '#264744', to: '#ecc697', angle: 90 },
  }),
  incremental = await measured(edited),
  fresh = await measured(edited, { cache: false });
assert.ok(incremental.render.png.equals(fresh.render.png));
assert.equal(incremental.render.statistics.rasterized_layers, 1);
assert.equal(incremental.render.statistics.cached_layers, 15);
const region = await measured(edited, { region: [256, 256, 128, 128] }),
  fullRegion = await measured(edited, { region: [256, 256, 128, 128], regionMode: 'full' });
assert.ok(region.render.png.equals(fullRegion.render.png));
await writeArtifact(
  resolve('docs/previews/performance.json'),
  JSON.stringify(
    {
      scene: [1024, 1024],
      layers: 16,
      cold_ms: cold.ms,
      warm_ms: warm.ms,
      incremental_ms: incremental.ms,
      fresh_ms: fresh.ms,
      incremental_statistics: incremental.render.statistics,
      viewport_ms: region.ms,
      full_crop_ms: fullRegion.ms,
      viewport_statistics: region.render.statistics,
      incremental_identical: true,
      region_identical: true,
      note: 'Single local measurements, including PNG encoding; not a throughput guarantee.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({ incremental: incremental.render.statistics, region: region.render.statistics }),
);
