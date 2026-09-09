// Reconstruct from inline code and parameters alone in a fresh directory.
// No images, source asset files, recipes, cache or history are copied to the build.
import { Project, buildPipeline, sha256, writeArtifact } from '../../dist/index.js';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const selected = JSON.parse(await readFile(join(root, 'portable', 'scene.json'), 'utf8'));
const graph = selected.metadata.pipeline_dragon;
for (const node of graph.nodes) {
  if (!node.code || node.source || Object.values(node.inputs).some((v) => 'asset' in v))
    throw new Error('Expected a code-only self-contained pipeline');
}
const fresh = await mkdtemp(join(tmpdir(), 'rtistree-dragon-code-only-'));
await writeFile(
  join(fresh, 'scene.json'),
  JSON.stringify({ version: 1, canvas: selected.canvas, layers: [] }),
);
const p = await Project.open(join(fresh, 'scene.json'));
const build = await buildPipeline(p, graph),
  render = await p.render();
const expected = await readFile(join(root, 'output', 'final.png'));
const cached = await buildPipeline(p, graph);
const changed = structuredClone(graph);
changed.shared.variant = 1;
const edit = await buildPipeline(p, changed);
await p.undo();
const restored = await p.render();
const report = {
  method: 'Only inline JavaScript and JSON parameters copied into an empty project',
  identical: render.png.equals(expected),
  expected_hash: sha256(expected),
  output_hash: sha256(render.png),
  nodes: build.nodes.map((n) => ({ id: n.id, status: n.status })),
  unchanged_build: cached.nodes.map((n) => ({ id: n.id, status: n.status })),
  composition_edit: edit.nodes.map((n) => ({ id: n.id, status: n.status })),
  undo_identical: restored.png.equals(expected),
};
await writeArtifact(
  join(root, 'output', 'code-only-replay.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(report);
if (!report.identical || !report.undo_identical) process.exitCode = 1;
