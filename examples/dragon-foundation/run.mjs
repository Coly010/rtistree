import { Project, buildPipeline, production, sceneHash, writeArtifact } from '../../dist/index.js';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('.', import.meta.url)),
  p = await Project.open(root);
const [action, name = 'bank', mode = 'value', revision = '0'] = process.argv.slice(2);
if (action === 'plan')
  console.log(
    await production(p, {
      action: 'plan',
      plan: JSON.parse(await readFile(join(root, 'plan.json'), 'utf8')),
    }),
  );
if (action === 'build') {
  const graph = {
    version: 1,
    id: 'foundation',
    nodes: [
      {
        id: 'drawing',
        target: 'drawing',
        source: 'programs/study.js',
        width: 1600,
        height: 1000,
        seed: 49,
        parameters: { pose: name.split('-')[0], mode, revision: Number(revision) },
        timeout_ms: 30000,
      },
    ],
  };
  await buildPipeline(p, graph);
  await writeArtifact(join(root, 'output', name + '-' + mode + '.png'), (await p.render()).png);
  console.log(
    await production(p, {
      action: 'capture',
      session: 'foundation',
      candidate: name + '-' + mode,
      expected_hash: sceneHash(await p.scene()),
      notes: `${name}, ${mode}, revision ${revision}`,
      ...(Number(revision)
        ? {
            revision: {
              parent: Number(revision) >= 2 ? 'climb-revised-value' : 'climb-value',
              hypothesis:
                Number(revision) >= 2
                  ? 'Separate the wing root from the foreleg shoulder, broaden the ribcage and narrow the tail base, and smooth the discontinuities in the grayscale falloff.'
                  : 'Lower the far wing to separate it from the jaw, move the hind ankle clear of the tail, smooth the tail gesture, and replace hard value strips with continuous grayscale form shading.',
            },
          }
        : {}),
      crops:
        mode === 'value'
          ? [
              [860, 240, 310, 250],
              [530, 410, 350, 420],
            ]
          : [],
    }),
  );
}
if (action === 'compare')
  console.log(await production(p, { action: 'compare', session: 'foundation' }));
if (action === 'review')
  console.log(
    await production(p, {
      action: 'review',
      session: 'foundation',
      review: JSON.parse(await readFile(join(root, name), 'utf8')),
    }),
  );
if (action === 'select')
  console.log(
    await production(p, {
      action: 'select',
      session: 'foundation',
      candidate: name,
      expected_hash: sceneHash(await p.scene()),
    }),
  );
if (action === 'advance')
  console.log(
    await production(p, {
      action: 'advance',
      session: 'foundation',
      expected_hash: sceneHash(await p.scene()),
    }),
  );
