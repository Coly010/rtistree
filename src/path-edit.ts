import { z } from 'zod';
import { pointSchema } from './schema.js';
export const pathSegmentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('move'), to: pointSchema }),
  z.strictObject({ type: z.literal('line'), to: pointSchema }),
  z.strictObject({ type: z.literal('quadratic'), control: pointSchema, to: pointSchema }),
  z.strictObject({
    type: z.literal('cubic'),
    control1: pointSchema,
    control2: pointSchema,
    to: pointSchema,
  }),
  z.strictObject({ type: z.literal('close') }),
]);
export function pathData(segments: z.infer<typeof pathSegmentSchema>[]) {
  if (segments[0]?.type !== 'move') throw new Error('A path must start with move');
  return segments
    .map((s) =>
      s.type === 'move'
        ? `M${s.to.join(' ')}`
        : s.type === 'line'
          ? `L${s.to.join(' ')}`
          : s.type === 'quadratic'
            ? `Q${s.control.join(' ')} ${s.to.join(' ')}`
            : s.type === 'cubic'
              ? `C${s.control1.join(' ')} ${s.control2.join(' ')} ${s.to.join(' ')}`
              : 'Z',
    )
    .join(' ');
}
