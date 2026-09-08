import { z } from 'zod';
import { boundsSchema, flattenLayers, type Scene } from './schema.js';
import type { RenderResult } from './render.js';
import type { VerificationReport } from './verify.js';
export const critiqueSchema = z.strictObject({
  scene_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  png_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  reviewer: z.string().min(1).max(200),
  method: z.enum(['vision-agent', 'human']),
  summary: z.string().min(1).max(4000),
  score: z.number().min(0).max(1),
  issues: z
    .array(
      z.strictObject({
        id: z.string(),
        category: z.enum([
          'composition',
          'typography',
          'lighting',
          'texture',
          'semantic',
          'coherence',
        ]),
        severity: z.enum(['high', 'medium', 'low']),
        target: z.string().optional(),
        region: boundsSchema.optional(),
        message: z.string().min(1),
        suggestion: z.string().optional(),
      }),
    )
    .max(100),
});
export type VisualCritique = z.infer<typeof critiqueSchema>;
export type VisualCritic = (input: {
  scene: Scene;
  render: RenderResult;
  verification: VerificationReport;
  intent?: string;
  signal?: AbortSignal;
}) => Promise<VisualCritique>;
export function validateCritique(raw: unknown, scene: Scene, render: RenderResult): VisualCritique {
  const critique = critiqueSchema.parse(raw);
  if (
    critique.scene_hash !== render.evidence.scene.hash ||
    critique.png_hash !== render.evidence.render.png_hash
  )
    throw new Error('Critique is stale: scene and PNG hashes must match the current render');
  for (const issue of critique.issues) {
    if (issue.target && !flattenLayers(scene.layers).some((l) => l.id === issue.target))
      throw new Error('Unknown critique target');
    if (issue.region) {
      const [x, y, w, h] = issue.region;
      if (x < 0 || y < 0 || x + w > scene.canvas.width || y + h > scene.canvas.height)
        throw new Error('Critique issue lies outside the image');
    }
  }
  return critique;
}
