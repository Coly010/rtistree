import { Project, buildPipeline, writeArtifact } from '../../dist/index.js';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const stage = process.argv[2] ?? 'paint',
  revision = Number(process.argv[3] ?? 0);
const p = await Project.open(join(root, 'scene.json'));
await buildPipeline(p, {
  version: 1,
  id: 'portrait',
  nodes: [
    {
      id: 'painting',
      target: 'painting',
      source: 'programs/portrait.js',
      width: 1400,
      height: 1050,
      seed: 2020,
      parameters: { stage, revision },
      timeout_ms: 30000,
    },
  ],
});
await writeArtifact(join(root, 'output', `${stage}-${revision}.png`), (await p.render()).png);
console.log(`Rendered ${stage}-${revision}`);
