import { validateCritique, type VisualCritic, type VisualCritique } from './critique.js';
import type { Patch } from './commands.js';
import { Project } from './project.js';
import type { RenderResult } from './render.js';
import type { Scene } from './schema.js';
import { verifyRendered, type VerificationReport } from './verify.js';

export interface Observation {
  iteration: number;
  scene: Scene;
  render: RenderResult;
  verification: VerificationReport;
  critique?: VisualCritique;
}
export type EditingAgent = (observation: Observation) => Promise<Patch | null>;
export interface IterationOptions {
  maxIterations?: number;
  maxStalled?: number;
  minimumImprovement?: number;
  stopOnPass?: boolean;
  signal?: AbortSignal;
  critic?: VisualCritic;
  requireCritique?: boolean;
}
/** The agent is injected. This module contains no model credentials or graphics algorithms. */
export async function runIterations(
  project: Project,
  agent: EditingAgent,
  options: IterationOptions = {},
) {
  const max = options.maxIterations ?? 6,
    stallLimit = options.maxStalled ?? 2,
    threshold = options.minimumImprovement ?? 0.01;
  if (!Number.isInteger(max) || max < 0 || max > 100)
    throw new Error('maxIterations must be an integer between 0 and 100');
  if (
    !Number.isInteger(stallLimit) ||
    stallLimit < 1 ||
    !Number.isFinite(threshold) ||
    threshold < 0
  )
    throw new Error('Invalid stopping criteria');
  const observations: { iteration: number; score: number; status: string; scene_hash: string }[] =
    [];
  let stalled = 0,
    previous = -1;
  for (let iteration = 0; iteration <= max; iteration++) {
    options.signal?.throwIfAborted();
    const scene = await project.scene(),
      render = await project.renderer.render(scene, project.root),
      verification = await verifyRendered(scene, project.root, project.renderer, render);
    const critique = options.critic
      ? validateCritique(
          await options.critic({ scene, render, verification, signal: options.signal }),
          scene,
          render,
        )
      : await project.critique();
    if (critique) await project.recordCritique(critique);
    observations.push({
      iteration,
      score: verification.score,
      status: verification.status,
      scene_hash: render.evidence.scene.hash,
    });
    const qualityScore = critique ? (verification.score + critique.score) / 2 : verification.score;
    const result = (reason: string) => ({
      reason,
      iterations: iteration,
      observations,
      render,
      verification,
      critique,
    });
    if (
      (options.stopOnPass ?? true) &&
      verification.status === 'pass' &&
      (!options.requireCritique || !!critique) &&
      (!critique || !critique.issues.some((i) => i.severity === 'high' || i.severity === 'medium'))
    )
      return result('passed');
    if (iteration === max) return result('iteration-budget');
    if (previous >= 0 && qualityScore - previous < threshold) stalled++;
    else stalled = 0;
    if (stalled >= stallLimit) return result('stalled');
    previous = qualityScore;
    const patch = await agent({
      iteration,
      scene,
      render,
      verification,
      critique: critique ?? undefined,
    });
    options.signal?.throwIfAborted();
    if (!patch) return result('agent-finished');
    await project.apply({ ...patch, expected_hash: render.evidence.scene.hash });
  }
  throw new Error('Unreachable iteration state');
}
