import {
  Project,
  buildPipeline,
  production,
  sceneHash,
  canonical,
  writeArtifact,
  replayRecipe,
} from '../../dist/index.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url)),
  p = await Project.open(root);
const [action, value = '0', stage = 'thumbnails'] = process.argv.slice(2);
const criteria = {
  thumbnails: [
    ['read', 'Flying dragon and fire read at thumbnail size'],
    ['space', 'Silhouette and landscape share a coherent composition'],
  ],
  blockin: [
    ['values', 'Foreground, distant hills and subject separate in value'],
    ['brief', 'Dragon is airborne, fire is green, hills remain legible'],
  ],
  form: [
    ['anatomy', 'Wings, skull, limbs and tail read as connected forms'],
    ['light', 'Painted light gives the creature volume'],
  ],
  materials: [
    ['paint', 'Directional broken paint marks follow forms'],
    ['depth', 'Texture and contrast diminish into the distance'],
  ],
  finish: [
    ['focal', 'Head and green fire remain the primary focal point'],
    ['cohesion', 'Palette and edge treatment unify the painting'],
  ],
};
if (action === 'plan')
  console.log(
    await production(p, {
      action: 'plan',
      plan: {
        id: 'dragon',
        brief:
          'Create a dragon mid flight breathing green fire across a hilly landscape, oil painting style. Hand-authored 2D digital painting; no image generation, stock assets or 3D.',
        stages: Object.entries(criteria).map(([id, rows]) => ({
          id,
          goal: id,
          criteria: rows.map(([id, description]) => ({ id, description })),
          minimum_fidelity: 0.7,
          minimum_quality: 0.7,
        })),
      },
    }),
  );
if (action === 'build') {
  const state = await production(p, { action: 'status', session: 'dragon' });
  if (state.complete || state.plan.stages[state.stage].id !== stage)
    throw new Error(
      'Build requires the matching active stage; use replay.mjs to reproduce the completed trial.',
    );
  const variant = Number(value),
    detail = { thumbnails: 0.12, blockin: 0.3, form: 0.62, materials: 1, finish: 1.25 }[stage],
    width = stage === 'thumbnails' ? 600 : 1500,
    height = stage === 'thumbnails' ? 400 : 1000;
  const nodes = ['landscape', 'dragon', 'fire', 'finish'].map((id, i) => ({
    id,
    target: id,
    width,
    height,
    seed: 2718 + i * 113,
    source: 'programs/painting.js',
    parameters: { pass: id },
    bindings: {
      detail: 'detail',
      ...(id === 'dragon' || id === 'fire' ? { variant: 'variant' } : {}),
    },
    inputs:
      id === 'finish'
        ? { landscape: { node: 'landscape' }, dragon: { node: 'dragon' }, fire: { node: 'fire' } }
        : {},
    timeout_ms: 30000,
  }));
  const graph = { version: 1, id: 'dragon', shared: { variant, detail }, nodes };
  await writeArtifact(join(root, 'pipeline.json'), JSON.stringify(graph, null, 2) + '\n');
  console.log(await buildPipeline(p, graph));
  const candidate = `${stage}-${value}`,
    captured = await production(p, {
      action: 'capture',
      session: 'dragon',
      candidate,
      expected_hash: sceneHash(await p.scene()),
      notes: `Composition ${variant}, brush detail ${detail}`,
      crops:
        stage === 'thumbnails'
          ? []
          : [
              [905, 310, 230, 180],
              [305, 115, 405, 370],
            ],
    });
  await writeArtifact(join(root, 'output', `${candidate}.png`), (await p.render()).png);
  console.log(JSON.stringify(captured));
}
if (action === 'compare')
  console.log(await production(p, { action: 'compare', session: 'dragon' }));
if (action === 'select')
  console.log(
    await production(p, {
      action: 'select',
      session: 'dragon',
      candidate: value,
      expected_hash: sceneHash(await p.scene()),
    }),
  );
if (action === 'advance')
  console.log(
    await production(p, {
      action: 'advance',
      session: 'dragon',
      expected_hash: sceneHash(await p.scene()),
    }),
  );
if (action === 'review')
  console.log(
    await production(p, {
      action: 'review',
      session: 'dragon',
      review: JSON.parse(await readFile(join(root, value), 'utf8')),
    }),
  );
if (action === 'audit') {
  const scene = await p.scene(),
    a = await p.render(),
    b = await p.renderer.render(scene, root, { cache: false }),
    replays = [];
  for (const [id, asset] of Object.entries(scene.assets)) {
    if (asset.recipe) {
      const { png, ...r } = await replayRecipe(root, asset.recipe);
      replays.push({ id, ...r });
    }
  }
  await p.exportScene(join(root, 'portable', 'scene.json'));
  const portable = await Project.open(join(root, 'portable', 'scene.json'));
  const output = await portable.render();
  const audit = {
    cold_identical: a.png.equals(b.png),
    portable_identical: a.png.equals(output.png),
    replays,
    scene_hash: sceneHash(scene),
    png_hash: a.evidence.render.png_hash,
    no_image_generation: true,
    no_external_inputs: true,
  };
  await writeArtifact(join(root, 'output', 'final.png'), a.png);
  await writeArtifact(join(root, 'output', 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
  console.log(audit);
}
