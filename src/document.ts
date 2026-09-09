import { z } from 'zod';
export const documentSchema = z.strictObject({
  width: z.number().positive().max(2000),
  height: z.number().positive().max(2000),
  unit: z.enum(['mm', 'in', 'pt']).default('mm'),
  ppi: z.number().min(36).max(1200).default(300),
  bleed: z.number().min(0).max(100).default(0),
  safe_margin: z.number().min(0).max(100).default(0),
});
export type PhysicalDocument = z.infer<typeof documentSchema>;
export const mmPerUnit = { mm: 1, in: 25.4, pt: 25.4 / 72 };
export function documentGeometry(document: PhysicalDocument) {
  const d = documentSchema.parse(document),
    unit = mmPerUnit[d.unit];
  const trim = [d.width * unit, d.height * unit] as [number, number];
  const bleed = d.bleed * unit,
    safe = d.safe_margin * unit;
  if (safe * 2 >= Math.min(...trim)) throw new Error('Safe margin consumes the trim area');
  const full = trim.map((v) => v + bleed * 2) as [number, number];
  return {
    trim_mm: trim,
    bleed_mm: bleed,
    safe_mm: safe,
    full_mm: full,
    pixels: full.map((v) => Math.round((v * d.ppi) / 25.4)) as [number, number],
    trim_pt: trim.map((v) => (v * 72) / 25.4) as [number, number],
    bleed_pt: (bleed * 72) / 25.4,
  };
}
export function lengthMm(value: string): number {
  const m = /^(\d+(?:\.\d+)?)(mm|in|pt)?$/.exec(value);
  if (!m) throw new Error('Expected a length such as 3mm, 0.125in or 9pt');
  return Number(m[1]) * mmPerUnit[(m[2] ?? 'mm') as keyof typeof mmPerUnit];
}
export const exportPresetSchema = z.strictObject({
  format: z.enum(['png', 'jpeg', 'tiff', 'pdf', 'svg']).default('pdf'),
  colour_space: z.enum(['srgb', 'cmyk']).default('srgb'),
  profile: z.string().optional(),
  profile_hash: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional(),
  intent: z.literal('perceptual').default('perceptual'),
  quality: z.number().int().min(1).max(100).default(90),
  chroma_subsampling: z.enum(['4:4:4', '4:2:0']).default('4:4:4'),
  background: z
    .string()
    .regex(/^#[a-fA-F0-9]{6}$/)
    .default('#ffffff'),
  crop_marks: z.boolean().default(false),
  minimum_ppi: z.number().min(1).max(1200).default(150),
  max_ink: z.number().min(100).max(400).default(300),
  black: z.enum(['profile', 'k-only']).default('k-only'),
  mode: z.enum(['hybrid', 'raster']).default('hybrid'),
  ppi: z.number().min(36).max(1200).optional(),
});
export type ExportPreset = z.infer<typeof exportPresetSchema>;
