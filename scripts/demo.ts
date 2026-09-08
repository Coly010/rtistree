import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadScene } from '../src/loader.js';
import { Project } from '../src/project.js';
import { writeArtifact, writeRender, writeSceneBundle } from '../src/artifacts.js';
import { measureLocality, verificationHeatmap, verifyScene } from '../src/verify.js';
import { runIterations } from '../src/workflow.js';
import type { Patch } from '../src/commands.js';

const source = await loadScene(resolve('examples/poster/scene.yaml'));
const output = join(source.root, 'renders');
await mkdir(output, { recursive: true });
const run = await mkdtemp(join(output, 'run-'));
await writeSceneBundle(source.scene, source.root, join(run, 'scene.json'));
const project = await Project.open(join(run, 'scene.json'));
const before = await project.render(),
  beforeReport = verifyScene(await project.scene(), before);
await writeRender(join(output, 'before.png'), before);
const patch = JSON.parse(await readFile(resolve('examples/poster/refine.json'), 'utf8')) as Patch;
const result = await runIterations(
  project,
  async (observation) => {
    assert.ok(
      observation.verification.issues.every((issue) => issue.message.includes('luma')),
      'Unexpected visual-rule failure',
    );
    return patch;
  },
  { maxIterations: 2 },
);
assert.equal(beforeReport.status, 'fail', 'Benchmark must start with a measured weakness');
assert.equal(result.reason, 'passed');
await writeRender(join(output, 'after.png'), result.render);
const locality = measureLocality(before, result.render, [[755, 610, 56, 84]]);
assert.equal(locality.outside_changed_pixels, 0);
assert.ok(locality.changed_pixels > 0);
const reopened = await Project.open(project.source.file);
assert.deepEqual((await reopened.render()).png, result.render.png);
await reopened.undo('Benchmark: verify rollback reproduces the initial image');
assert.deepEqual((await reopened.render()).png, before.png);
await reopened.redo('Benchmark: verify replay reproduces the final image');
assert.deepEqual((await reopened.render()).png, result.render.png);
await reopened.exportScene(join(run, 'export', 'scene.json'));
const exported = await Project.open(join(run, 'export', 'scene.json'));
assert.deepEqual((await exported.render()).png, result.render.png);
await writeArtifact(
  join(output, 'heatmap.png'),
  await verificationHeatmap(await project.scene(), beforeReport),
);
const evidence = {
  before: { status: beforeReport.status, score: beforeReport.score, issues: beforeReport.issues },
  after: { status: result.verification.status, score: result.verification.score },
  iterations: result.iterations,
  locality,
  reopened_identical: true,
  undo_identical: true,
  redo_identical: true,
  export_identical: true,
  renderer: result.render.evidence.renderer,
  scene_hash: result.render.evidence.scene.hash,
  png_hash: result.render.evidence.render.png_hash,
};
await writeArtifact(join(output, 'benchmark.json'), JSON.stringify(evidence, null, 2) + '\n');
await writeArtifact(resolve('docs/previews/poster.png'), result.render.png);
await writeArtifact(
  resolve('docs/previews/benchmark.json'),
  JSON.stringify(evidence, null, 2) + '\n',
);
const landscape = await Project.open(resolve('examples/landscape/scene.yaml')),
  landscapeRender = await landscape.render();
assert.equal(verifyScene(await landscape.scene(), landscapeRender).status, 'pass');
await writeRender(join(landscape.root, 'renders', 'landscape.png'), landscapeRender);
await writeArtifact(resolve('docs/previews/landscape.png'), landscapeRender.png);
console.log(
  JSON.stringify({ ...evidence, artifacts: output, working_project: project.source.file }, null, 2),
);
