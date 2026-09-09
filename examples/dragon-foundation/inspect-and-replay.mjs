import {
  Project,
  buildPipeline,
  production,
  sceneHash,
  writeArtifact,
  sha256,
  bakeProgram,
  programSchema,
} from '../../dist/index.js';
import { createCanvas, loadImage } from '../../dist/native.js';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';
const root = fileURLToPath(new URL('.', import.meta.url)),
  p = await Project.open(root),
  scene = await p.scene(),
  render = await p.render();
await writeArtifact(join(root, 'output', 'study.png'), render.png);
const cold = await p.renderer.render(scene, root, { cache: false });
await p.exportScene(join(root, 'portable', 'scene.json'));
const portable = await Project.open(join(root, 'portable', 'scene.json'));
const graph = scene.metadata.pipeline_foundation;
if (graph.nodes.some((n) => n.source || !n.code || Object.keys(n.inputs).length))
  throw new Error('Expected a code-only, input-free study');
const fresh = await mkdtemp(join(tmpdir(), 'rtistree-foundation-'));
await writeFile(
  join(fresh, 'scene.json'),
  JSON.stringify({ version: 1, canvas: scene.canvas, layers: [] }),
);
const rebuilt = await Project.open(join(fresh, 'scene.json'));
await buildPipeline(rebuilt, graph);
const replay = await rebuilt.render();
let rejection;
try {
  await production(p, {
    action: 'select',
    session: 'foundation',
    candidate: 'climb-masses-value',
    expected_hash: sceneHash(scene),
  });
} catch (e) {
  rejection = e.message;
}
if (!rejection) throw new Error('A failed foundation should not pass the gate');
const diagnostic = await bakeProgram(
  root,
  programSchema.parse({
    source: 'programs/study.js',
    asset_id: 'construction',
    width: 1600,
    height: 1000,
    seed: 49,
    parameters: { pose: 'climb', mode: 'construction', revision: 2 },
    reason: 'Inspect the actual construction landmarks',
    timeout_ms: 30000,
  }),
  {},
);
await writeArtifact(
  join(root, 'output', 'construction.png'),
  await readFile(join(root, diagnostic.asset.source)),
);
const mirror = await sharp(render.png).flop().png().toBuffer(),
  thumb = await sharp(render.png).resize(240, 150).png().toBuffer();
await writeArtifact(join(root, 'output', 'mirrored.png'), mirror);
await writeArtifact(join(root, 'output', 'thumbnail.png'), thumb);
const sheet = createCanvas(1280, 510),
  ctx = sheet.getContext('2d');
ctx.fillStyle = '#ededed';
ctx.fillRect(0, 0, 1280, 510);
ctx.drawImage(await loadImage(render.png), 0, 28, 512, 320);
ctx.drawImage(await loadImage(mirror), 520, 28, 512, 320);
ctx.drawImage(await loadImage(thumb), 1036, 84, 240, 150);
ctx.fillStyle = '#343434';
ctx.font = '18px Rtistree-inter';
ctx.fillText('Current study', 16, 28);
ctx.fillText('Mirrored inspection', 536, 28);
ctx.fillText('Thumbnail', 1046, 60);
ctx.font = '20px Rtistree-display';
ctx.fillText('Needs revision', 20, 390);
ctx.font = '16px Rtistree-inter';
ctx.fillText(
  'Local separation improved. Shoulder construction and muscle masses remain unconvincing.',
  20,
  426,
);
ctx.fillText(
  'No colour, landscape, fire or surface texture. Foundation gate remains failed.',
  20,
  456,
);
await writeArtifact(join(root, 'output', 'inspection.png'), sheet.toBuffer('image/png'));
const status = await production(p, { action: 'status', session: 'foundation' });
const report = {
  cold_identical: render.png.equals(cold.png),
  portable_identical: render.png.equals((await portable.render()).png),
  code_only_rebuild_identical: render.png.equals(replay.png),
  png_hash: sha256(render.png),
  artistic_status: 'needs_revision',
  stage_complete: status.complete,
  selection_rejected: rejection,
  readiness: status.readiness,
  diagnostic_recipe: diagnostic.asset.recipe,
  image_inputs: 0,
  no_image_generation: true,
  dimensional_method: '2D curves, masks and grayscale fields; no 3D scene or renderer',
};
await writeArtifact(join(root, 'output', 'audit.json'), JSON.stringify(report, null, 2) + '\n');
const folder = (await readdir(join(root, 'studio')))[0],
  session = join(root, 'studio', folder, 'sessions', 'foundation');
await writeArtifact(
  join(root, 'output', 'poses.png'),
  await readFile(join(session, 'poses-comparison.png')),
);
await writeArtifact(
  join(root, 'output', 'revisions.png'),
  await readFile(join(session, 'foundation-comparison.png')),
);
// Persist the current work in progress for cloning the example without its ignored development journal.
await writeArtifact(join(root, 'scene.json'), JSON.stringify(scene, null, 2) + '\n');
await p.rebase();
console.log(JSON.stringify(report, null, 2));
if (
  !report.cold_identical ||
  !report.portable_identical ||
  !report.code_only_rebuild_identical ||
  status.complete
)
  process.exitCode = 1;
