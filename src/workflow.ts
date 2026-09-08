import type { Patch } from './commands.js';
import { Project } from './project.js';
import type { RenderResult } from './render.js';
import type { Scene } from './schema.js';
import { verifyScene, type VerificationReport } from './verify.js';

export interface Observation {
  iteration: number;
  scene: Scene;
  render: RenderResult;
  verification: VerificationReport;
}
export type EditingAgent = (observation: Observation) => Promise<Patch | null>;
export interface IterationOptions {
  maxIterations?: number;
  maxStalled?: number;
  minimumImprovement?: number;
  stopOnPass?: boolean;
  signal?: AbortSignal;
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
      verification = verifyScene(scene, render);
    observations.push({
      iteration,
      score: verification.score,
      status: verification.status,
      scene_hash: render.evidence.scene.hash,
    });
    const result = (reason: string) => ({
      reason,
      iterations: iteration,
      observations,
      render,
      verification,
    });
    if ((options.stopOnPass ?? true) && verification.status === 'pass') return result('passed');
    if (iteration === max) return result('iteration-budget');
    if (previous >= 0 && verification.score - previous < threshold) stalled++;
    else stalled = 0;
    if (stalled >= stallLimit) return result('stalled');
    previous = verification.score;
    const patch = await agent({ iteration, scene, render, verification });
    options.signal?.throwIfAborted();
    if (!patch) return result('agent-finished');
    await project.apply({ ...patch, expected_hash: render.evidence.scene.hash });
  }
  throw new Error('Unreachable iteration state');
}
