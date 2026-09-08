import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { boundsSchema } from './schema.js';
import { writeArtifact, writeRender } from './artifacts.js';
import { Project } from './project.js';
import { measureLocality } from './verify.js';
import type { VisualCritique } from './critique.js';
export const briefSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  category: z.enum(['poster', 'illustration', 'raster-refinement']),
  prompt: z.string().min(30),
  max_edits: z.number().int().min(1).max(30).default(6),
  allowed_bounds: boundsSchema.optional(),
});
export type BenchmarkBrief = z.infer<typeof briefSchema>;
interface Checkpoint {
  label: string;
  scene_hash: string;
  png_hash: string;
  png: string;
  verification_status: string;
  score: number;
  critique: VisualCritique;
  history_length: number;
  timestamp: string;
  tokens: { input: number; output: number } | null;
}
export class BenchmarkSession {
  constructor(
    readonly project: Project,
    readonly brief: BenchmarkBrief,
    readonly agent: string,
  ) {}
  get directory() {
    return join(this.project.root, 'benchmarks', this.brief.id);
  }
  private get file() {
    return join(this.directory, 'session.json');
  }
  async checkpoints(): Promise<Checkpoint[]> {
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'));
      if (JSON.stringify(saved.brief) !== JSON.stringify(this.brief))
        throw new Error('Benchmark brief changed');
      return saved.checkpoints;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }
  async checkpoint(label: string, tokens: Checkpoint['tokens'] = null) {
    const points = await this.checkpoints();
    if (points.some((p) => p.label === label) || !/^[a-z0-9-]+$/.test(label))
      throw new Error('Checkpoint labels must be unique path-safe words');
    const render = await this.project.render(),
      verification = await this.project.verify(),
      critique = await this.project.critique();
    if (!critique)
      throw new Error('Inspect the PNG and record a visual critique before checkpointing');
    const png = join(this.directory, `${label}.png`);
    await writeRender(png, render);
    points.push({
      label,
      scene_hash: render.evidence.scene.hash,
      png_hash: render.evidence.render.png_hash,
      png,
      verification_status: verification.status,
      score: verification.score,
      critique,
      history_length: (await this.project.history()).length,
      timestamp: new Date().toISOString(),
      tokens,
    });
    await writeArtifact(
      this.file,
      JSON.stringify(
        { brief: this.brief, agent: this.agent, method: 'interactive-agent', checkpoints: points },
        null,
        2,
      ) + '\n',
    );
    return points.at(-1)!;
  }
  async finish() {
    const points = await this.checkpoints();
    if (points.length < 2) throw new Error('Need an inspected before and after checkpoint');
    const first = points[0]!,
      last = points.at(-1)!,
      history = await this.project.history(),
      final = await this.project.render();
    if (
      last.scene_hash !== final.evidence.scene.hash ||
      last.png_hash !== final.evidence.render.png_hash
    )
      throw new Error('Final checkpoint is stale');
    const baseline = first.history_length
      ? history[first.history_length - 1]!.after
      : this.project.source.scene;
    const before = await this.project.renderer.render(baseline, this.project.root);
    if (before.evidence.render.png_hash !== first.png_hash)
      throw new Error('Baseline no longer reproduces');
    const locality = measureLocality(
      before,
      final,
      this.brief.allowed_bounds ? [this.brief.allowed_bounds] : [[0, 0, final.width, final.height]],
    );
    const cold = await this.project.renderer.render(await this.project.scene(), this.project.root, {
      cache: false,
    });
    const exportedFile = join(this.directory, 'export', 'scene.json');
    await this.project.exportScene(exportedFile);
    const exported = await Project.open(exportedFile),
      reproduction = await exported.render();
    const edits = history.slice(first.history_length).filter((e) => e.kind === 'apply');
    const success =
      last.verification_status === 'pass' &&
      !last.critique.issues.some((i) => i.severity === 'medium' || i.severity === 'high') &&
      last.critique.score > first.critique.score &&
      locality.outside_changed_pixels === 0 &&
      edits.length <= this.brief.max_edits &&
      cold.png.equals(final.png) &&
      reproduction.png.equals(final.png);
    const result = {
      status: success ? 'pass' : 'fail',
      brief: this.brief,
      agent: this.agent,
      review_method: 'same-agent visual critique; not independent human evaluation',
      edits: edits.length,
      commands: edits.reduce((sum, e) => sum + e.commands.length, 0),
      tokens: points.every((p) => p.tokens !== null)
        ? points.reduce((sum, p) => sum + p.tokens!.input + p.tokens!.output, 0)
        : null,
      token_note: 'null means the host did not expose token usage',
      critique_before: first.critique.score,
      critique_after: last.critique.score,
      locality,
      cold_identical: cold.png.equals(final.png),
      export_identical: reproduction.png.equals(final.png),
      checkpoints: points.map(({ critique, ...p }) => p),
    };
    await writeArtifact(
      join(this.directory, 'result.json'),
      JSON.stringify(result, null, 2) + '\n',
    );
    return result;
  }
}
