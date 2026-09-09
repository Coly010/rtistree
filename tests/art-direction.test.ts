import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveConstruction,
  createRasterStudio,
  Project,
  buildPipeline,
  production,
  sceneHash,
} from '../src/index.js';
test('moving construction landmarks updates all dependent handles and curves without changing unrelated points', () => {
  const spec = {
    points: {
      shoulder: [10, 20],
      wrist: { anchor: 'shoulder', offset: [30, -10] },
      tip: { anchor: 'wrist', offset: [40, 20] },
      fixed: [200, 100],
    },
    paths: {
      wing: [
        { op: 'M', to: 'shoulder' },
        { op: 'Q', control: 'wrist', to: 'tip' },
      ],
    },
  };
  const a = resolveConstruction(spec);
  spec.points.shoulder = [20, 35];
  const b = resolveConstruction(spec);
  assert.deepEqual(a.points.tip, [80, 30]);
  assert.deepEqual(b.points.tip, [90, 45]);
  assert.deepEqual(b.points.fixed, a.points.fixed);
  assert.equal(b.paths.wing, 'M20 35 Q50 25 90 45');
  assert.throws(() => resolveConstruction({ points: { a: 'b', b: 'a' } }), /cycle/);
  assert.throws(() => resolveConstruction({ points: { a: 'missing' } }), /Unknown/);
  assert.throws(
    () =>
      resolveConstruction({
        points: { a: [1000000, 0] },
        paths: { p: [{ op: 'M', to: { anchor: 'a', offset: [1, 0] } }] },
      }),
    /range/,
  );
  const art = createRasterStudio(16, 16, 0);
  assert.deepEqual(art.guides({ points: { anchor: [2, 3] } }).points.anchor, [2, 3]);
});
test('foundation reviews cannot erase blockers with scores, skip alternatives, or self-certify a human gate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rtistree-direction-'));
  await writeFile(
    join(root, 'scene.json'),
    JSON.stringify({ version: 1, canvas: { width: 24, height: 24 }, layers: [] }),
  );
  const p = await Project.open(join(root, 'scene.json'));
  const build = async (red: number) =>
    buildPipeline(p, {
      version: 1,
      id: 'test',
      nodes: [
        {
          id: 'base',
          target: 'paint',
          code: 'return art.raster(()=>[parameters.red,30,30,255]);',
          parameters: { red },
          width: 24,
          height: 24,
        },
      ],
    });
  const state = async () => (await production(p, { action: 'status', session: 'study' })) as any;
  const capture = async (candidate: string, revision?: any) =>
    production(p, {
      action: 'capture',
      session: 'study',
      candidate,
      expected_hash: sceneHash(await p.scene()),
      ...(revision ? { revision } : {}),
    });
  const select = async (candidate: string) =>
    production(p, {
      action: 'select',
      session: 'study',
      candidate,
      expected_hash: sceneHash(await p.scene()),
    });
  await production(p, {
    action: 'plan',
    plan: {
      id: 'study',
      brief: 'Check foundation',
      references: [],
      stages: [
        {
          id: 'foundation',
          goal: 'A good drawing',
          require_references: true,
          minimum_alternatives: 2,
          required_reviewer: 'human',
          criteria: [{ id: 'structure', description: 'Connected structure' }],
        },
      ],
    },
  });
  await build(30);
  await capture('first');
  let c = (await state()).candidates[0];
  const review = (candidate: any, overrides: any = {}) => ({
    candidate: candidate.id,
    scene_hash: candidate.scene_hash,
    png_hash: candidate.png_hash,
    reviewer: 'test fixture',
    method: 'vision-agent',
    fidelity: 1,
    quality: 1,
    criteria: [{ id: 'structure', pass: true, evidence: 'Visible chain' }],
    strengths: 'Readable',
    weaknesses: 'Needs a real human judgment',
    ...overrides,
  });
  await assert.rejects(
    () =>
      production(p, {
        action: 'review',
        session: 'study',
        review: review(c, {
          issues: [
            {
              criterion: 'structure',
              severity: 'blocking',
              observation: 'Detached joint',
              correction: 'Move elbow',
            },
          ],
        }),
      }),
    /blocking issue/,
  );
  await production(p, {
    action: 'review',
    session: 'study',
    review: review(c, {
      criteria: [{ id: 'structure', pass: false, evidence: 'Detached joint' }],
      issues: [
        {
          criterion: 'structure',
          severity: 'blocking',
          observation: 'Detached joint',
          correction: 'Move elbow',
        },
      ],
    }),
  });
  await assert.rejects(() => select('first'), /alternatives|Human|blocking/);
  await build(80);
  await capture('second');
  await build(120);
  await capture('revised', { parent: 'first', hypothesis: 'Reconnect the joint' });
  c = (await state()).candidates.find((v: any) => v.id === 'revised');
  await assert.rejects(
    () => production(p, { action: 'review', session: 'study', review: review(c) }),
    /declared parent/,
  );
  await production(p, {
    action: 'review',
    session: 'study',
    review: review(c, {
      comparison: { parent: 'first', verdict: 'unchanged', evidence: 'No visible improvement' },
    }),
  });
  await assert.rejects(() => select('revised'), /visibly improve/);
  await production(p, {
    action: 'review',
    session: 'study',
    review: review(c, {
      comparison: { parent: 'first', verdict: 'improved', evidence: 'Joint now meets the limb' },
    }),
  });
  await assert.rejects(() => select('revised'), /Human review/);
  // This is a synthetic test reviewer, not a claim of actual human feedback on artwork.
  await production(p, {
    action: 'review',
    session: 'study',
    review: review(c, {
      method: 'human',
      comparison: { parent: 'first', verdict: 'improved', evidence: 'Joint now meets the limb' },
    }),
  });
  assert.equal(
    (await state()).candidates.find((v: any) => v.id === 'revised').review_history.length,
    3,
  );
  await assert.rejects(() => select('revised'), /Reference study/);
  const study = {
    action: 'study',
    session: 'study',
    reference: {
      id: 'ref',
      source: 'local anatomy study',
      observation: 'Visible elbow then wrist',
      application: 'Connect the forearm',
    },
  };
  await production(p, study);
  await assert.rejects(() => production(p, study), /unique/);
  await select('revised');
  assert.ok(
    (
      (await production(p, {
        action: 'advance',
        session: 'study',
        expected_hash: sceneHash(await p.scene()),
      })) as any
    ).complete,
  );
});
