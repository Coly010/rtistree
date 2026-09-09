import { readFile, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { studioDirectory, studioId } from './pipeline.js';
import { canonical, sceneHash, sha256 } from './assets.js';
import { writeArtifact } from './artifacts.js';
import { parseScene, boundsSchema, type Scene } from './schema.js';
import { verifyRendered } from './verify.js';
import { createCanvas, loadImage } from './native.js';
import type { Project } from './project.js';
export const referenceStudySchema = z.strictObject({
  id: studioId,
  source: z.string().min(1).max(2000),
  observation: z.string().min(1).max(2000),
  application: z.string().min(1).max(2000),
});
export const productionPlanSchema = z
  .strictObject({
    id: studioId,
    brief: z.string().min(1).max(8000),
    references: z.array(referenceStudySchema).max(24).optional(),
    stages: z
      .array(
        z.strictObject({
          id: studioId,
          goal: z.string().min(1).max(2000),
          criteria: z
            .array(z.strictObject({ id: studioId, description: z.string().min(1).max(1000) }))
            .min(1)
            .max(20),
          minimum_alternatives: z.number().int().min(1).max(12).optional(),
          require_references: z.boolean().optional(),
          required_reviewer: z.enum(['any', 'human']).optional(),
          minimum_fidelity: z.number().min(0).max(1).default(0.7),
          minimum_quality: z.number().min(0).max(1).default(0.7),
        }),
      )
      .min(1)
      .max(12),
  })
  .superRefine((p, c) => {
    if (
      new Set(p.stages.map((s) => s.id)).size !== p.stages.length ||
      p.stages.some((s) => new Set(s.criteria.map((c) => c.id)).size !== s.criteria.length)
    )
      c.addIssue({ code: 'custom', message: 'Stage and criterion IDs must be unique' });
  });
export const candidateReviewSchema = z.strictObject({
  candidate: studioId,
  scene_hash: z.string(),
  png_hash: z.string(),
  reviewer: z.string().min(1).max(200),
  method: z.enum(['human', 'vision-agent']),
  fidelity: z.number().min(0).max(1),
  quality: z.number().min(0).max(1),
  criteria: z
    .array(
      z.strictObject({ id: studioId, pass: z.boolean(), evidence: z.string().min(1).max(2000) }),
    )
    .max(20),
  strengths: z.string().min(1).max(4000),
  weaknesses: z.string().min(1).max(4000),
  issues: z
    .array(
      z.strictObject({
        criterion: studioId,
        severity: z.enum(['blocking', 'minor']),
        observation: z.string().min(1).max(2000),
        correction: z.string().min(1).max(2000),
      }),
    )
    .max(40)
    .optional(),
  comparison: z
    .strictObject({
      parent: studioId,
      verdict: z.enum(['improved', 'unchanged', 'worse']),
      evidence: z.string().min(1).max(4000),
    })
    .optional(),
});
export const productionRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('plan'), plan: productionPlanSchema }),
  z.strictObject({ action: z.literal('status'), session: studioId }),
  z.strictObject({
    action: z.literal('study'),
    session: studioId,
    reference: referenceStudySchema,
  }),
  z.strictObject({
    action: z.literal('capture'),
    session: studioId,
    candidate: studioId,
    expected_hash: z.string(),
    notes: z.string().max(4000).default(''),
    revision: z
      .strictObject({ parent: studioId, hypothesis: z.string().min(1).max(4000) })
      .optional(),
    crops: z.array(boundsSchema).max(8).default([]),
  }),
  z.strictObject({ action: z.literal('review'), session: studioId, review: candidateReviewSchema }),
  z.strictObject({ action: z.literal('compare'), session: studioId }),
  z.strictObject({
    action: z.literal('select'),
    session: studioId,
    candidate: studioId,
    expected_hash: z.string(),
  }),
  z.strictObject({ action: z.literal('advance'), session: studioId, expected_hash: z.string() }),
]);
type Candidate = {
  id: string;
  stage: string;
  scene_hash: string;
  png_hash: string;
  technical: { status: string; rule_count: number };
  notes: string;
  review?: z.infer<typeof candidateReviewSchema>;
  review_history?: z.infer<typeof candidateReviewSchema>[];
  revision?: { parent: string; hypothesis: string };
};
type Session = {
  version: 1;
  plan: z.infer<typeof productionPlanSchema>;
  stage: number;
  complete: boolean;
  candidates: Candidate[];
  selected: Record<string, string>;
};
/** Explicit stage gates. Visual ratings are supplied by an observer, never inferred from technical tests. */
export async function production(project: Project, raw: unknown) {
  const request = productionRequestSchema.parse(raw),
    id = request.action === 'plan' ? request.plan.id : request.session;
  const file = await studioDirectory(project, 'sessions', id, 'session.json'),
    dir = join(file, '..');
  const lock = await open(file + '.lock', 'wx').catch(() => {
    throw new Error('Production session is busy');
  });
  try {
    let state: Session;
    try {
      state = JSON.parse(await readFile(file, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      if (request.action !== 'plan') throw new Error('Unknown production session');
      state = {
        version: 1,
        plan: request.plan,
        stage: 0,
        complete: false,
        candidates: [],
        selected: {},
      };
      await writeArtifact(file, canonical(state));
      return state;
    }
    if (request.action === 'plan')
      throw new Error('Production plan already exists; use a new ID for a changed brief');
    const stage = state.plan.stages[state.stage]!;
    const gateReasons = (c: Candidate) => {
      const reasons: string[] = [];
      if (c.technical.status !== 'pass') reasons.push('Technical verification failed');
      if (!c.review) reasons.push('Visual review required');
      else {
        if (c.review.fidelity < stage.minimum_fidelity)
          reasons.push('Brief fidelity below the stage threshold');
        if (c.review.quality < stage.minimum_quality)
          reasons.push('Artistic quality below the stage threshold');
        if (!stage.criteria.every((k) => c.review!.criteria.find((v) => v.id === k.id)?.pass))
          reasons.push('Failed stage criteria');
      }
      if (stage.require_references && !state.plan.references?.length)
        reasons.push('Reference study required');
      const alternatives = state.candidates.filter((v) => v.stage === stage.id && !v.revision);
      if (new Set(alternatives.map((v) => v.png_hash)).size < (stage.minimum_alternatives ?? 1))
        reasons.push('More distinct initial alternatives required');
      if (stage.required_reviewer === 'human' && c.review?.method !== 'human')
        reasons.push('Human review required');
      if (c.review?.issues?.some((i) => i.severity === 'blocking'))
        reasons.push('Unresolved blocking issues');
      if (c.revision && c.review?.comparison?.verdict !== 'improved')
        reasons.push('Revision must visibly improve its parent');
      return reasons;
    };
    const eligible = (c: Candidate) => gateReasons(c).length === 0;
    if (request.action === 'status')
      return {
        ...state,
        readiness: state.candidates
          .filter((c) => c.stage === stage.id)
          .map((c) => ({
            candidate: c.id,
            eligible: Boolean(eligible(c)),
            blockers: gateReasons(c),
          })),
      };
    const readCandidate = async (c: Candidate) => {
      const scene = parseScene(JSON.parse(await readFile(join(dir, c.id, 'scene.json'), 'utf8'))),
        png = await readFile(join(dir, c.id, 'image.png'));
      if (sceneHash(scene) !== c.scene_hash || sha256(png) !== c.png_hash)
        throw new Error('Candidate artifact hash mismatch');
      return { scene, png };
    };
    if (request.action === 'study') {
      if (state.complete) throw new Error('Production session is complete');
      if (
        (state.plan.references?.length ?? 0) >= 24 ||
        state.plan.references?.some((r) => r.id === request.reference.id)
      )
        throw new Error('Reference IDs must be unique, with at most 24 studies');
      state.plan.references = [...(state.plan.references ?? []), request.reference];
    } else if (request.action === 'capture') {
      if (state.complete) throw new Error('Production session is complete');
      if (state.candidates.length >= 64)
        throw new Error('Production session supports at most 64 candidates');
      if (state.candidates.some((c) => c.id === request.candidate))
        throw new Error('Candidate IDs are immutable');
      if (request.revision) {
        const parent = state.candidates.find(
          (c) => c.id === request.revision!.parent && c.stage === stage.id,
        );
        if (!parent) throw new Error('Revision parent must belong to the active stage');
        await readCandidate(parent);
      }
      const scene = await project.scene(),
        hash = sceneHash(scene);
      if (hash !== request.expected_hash) throw new Error('Stale scene hash');
      const render = await project.renderer.render(scene, project.root, { cache: false });
      const report = await verifyRendered(scene, project.root, project.renderer, render);
      const path = join(dir, request.candidate);
      // Validate all requested crops before writing any candidate artifacts.
      for (const [x, y, w, h] of request.crops)
        if (
          ![x, y, w, h].every(Number.isInteger) ||
          x < 0 ||
          y < 0 ||
          w < 1 ||
          h < 1 ||
          x + w > render.width ||
          y + h > render.height
        )
          throw new Error('Candidate crop must be integer pixels inside the canvas');
      await writeArtifact(join(path, 'scene.json'), canonical(scene));
      await writeArtifact(join(path, 'image.png'), render.png);
      await writeArtifact(
        join(path, 'thumbnail.png'),
        await sharp(render.png).resize({ width: 480, height: 320, fit: 'inside' }).png().toBuffer(),
      );
      for (const [i, [left, top, width, height]] of request.crops.entries())
        await writeArtifact(
          join(path, `detail-${i + 1}.png`),
          await sharp(render.png).extract({ left, top, width, height }).png().toBuffer(),
        );
      await writeArtifact(join(path, 'technical.json'), canonical(report));
      state.candidates.push({
        id: request.candidate,
        stage: stage.id,
        scene_hash: hash,
        png_hash: sha256(render.png),
        technical: { status: report.status, rule_count: scene.verification.rules.length },
        notes: request.notes,
        ...(request.revision ? { revision: request.revision } : {}),
      });
    } else if (request.action === 'review') {
      const c = state.candidates.find((c) => c.id === request.review.candidate);
      if (!c || c.stage !== stage.id || state.complete)
        throw new Error('Review must address a candidate of the active stage');
      await readCandidate(c);
      if (c.scene_hash !== request.review.scene_hash || c.png_hash !== request.review.png_hash)
        throw new Error('Stale candidate review');
      const keys = request.review.criteria.map((c) => c.id);
      if (
        keys.length !== stage.criteria.length ||
        new Set(keys).size !== keys.length ||
        stage.criteria.some((c) => !keys.includes(c.id))
      )
        throw new Error('Review must address every stage criterion exactly once');
      if (request.review.issues?.some((i) => !stage.criteria.some((k) => k.id === i.criterion)))
        throw new Error('Issue refers to unknown criterion');
      if (
        request.review.issues?.some(
          (i) =>
            i.severity === 'blocking' &&
            request.review.criteria.find((k) => k.id === i.criterion)?.pass,
        )
      )
        throw new Error('A blocking issue cannot have a passing criterion');
      if (c.revision && request.review.comparison?.parent !== c.revision.parent)
        throw new Error('Revision review must compare its declared parent');
      if (!c.revision && request.review.comparison)
        throw new Error('Comparison requires a captured revision');
      c.review_history = [...(c.review_history ?? (c.review ? [c.review] : [])), request.review];
      c.review = request.review;
    } else if (request.action === 'compare') {
      const candidates = state.candidates.filter((c) => c.stage === stage.id);
      if (!candidates.length) throw new Error('No candidates to compare');
      const sheet = createCanvas(960, Math.ceil(candidates.length / 2) * 360),
        ctx = sheet.getContext('2d');
      ctx.fillStyle = '#202329';
      ctx.fillRect(0, 0, sheet.width, sheet.height);
      for (const [i, c] of candidates.entries()) {
        const { png } = await readCandidate(c),
          thumb = await sharp(png)
            .resize({ width: 464, height: 316, fit: 'inside' })
            .png()
            .toBuffer(),
          im = await loadImage(thumb),
          x = (i % 2) * 480 + 8,
          y = Math.floor(i / 2) * 360 + 8;
        ctx.drawImage(im, x + (464 - im.width) / 2, y + (316 - im.height) / 2);
        ctx.fillStyle = '#eeeeee';
        ctx.font = '16px Rtistree-inter';
        ctx.fillText(
          `${c.id} · ${eligible(c) ? 'eligible' : c.review ? 'needs work' : 'unreviewed'}`,
          x,
          y + 340,
        );
      }
      const path = join(dir, `${stage.id}-comparison.png`);
      await writeArtifact(path, sheet.toBuffer('image/png'));
      return {
        image: path,
        stage,
        ranked: candidates
          .slice()
          .sort(
            (a, b) =>
              Number(Boolean(eligible(b))) - Number(Boolean(eligible(a))) ||
              (b.review?.quality ?? -1) - (a.review?.quality ?? -1) ||
              (b.review?.fidelity ?? -1) - (a.review?.fidelity ?? -1),
          ),
        selected: state.selected[stage.id] ?? null,
        gates: candidates.map((c) => ({
          candidate: c.id,
          eligible: Boolean(eligible(c)),
          blockers: gateReasons(c),
        })),
      };
    } else if (request.action === 'select') {
      if (state.complete) throw new Error('Production session is complete');
      const c = state.candidates.find((c) => c.id === request.candidate && c.stage === stage.id);
      if (!c || !eligible(c))
        throw new Error(
          'Candidate has not passed technical, brief and stage quality gates' +
            (c ? ': ' + gateReasons(c).join('; ') : ''),
        );
      const old = state.candidates.find((c) => c.id === state.selected[stage.id]);
      if (
        old?.review &&
        (c.review!.quality < old.review.quality || c.review!.fidelity < old.review.fidelity)
      )
        throw new Error('Candidate regresses against the selected alternative');
      const { scene, png } = await readCandidate(c);
      const check = await project.renderer.render(scene, project.root, { cache: false });
      if (!check.png.equals(png)) throw new Error('Candidate no longer reproduces');
      await project.apply({
        expected_hash: request.expected_hash,
        reason: `Select ${id}/${c.id} for ${stage.id}`,
        commands: [{ type: 'restoreScene', scene }],
      });
      state.selected[stage.id] = c.id;
    } else if (request.action === 'advance') {
      if (state.complete) throw new Error('Production session is already complete');
      const c = state.candidates.find((c) => c.id === state.selected[stage.id]);
      if (!c || !eligible(c)) throw new Error('Select an eligible candidate before advancing');
      const current = sceneHash(await project.scene());
      if (current !== request.expected_hash || current !== c.scene_hash)
        throw new Error('Selected candidate must still be the current scene');
      if (state.stage === state.plan.stages.length - 1) state.complete = true;
      else state.stage++;
    }
    await writeArtifact(file, canonical(state));
    return { ...state, directory: dir };
  } finally {
    await lock.close();
    await unlink(file + '.lock');
  }
}
