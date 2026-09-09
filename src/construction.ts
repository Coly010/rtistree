import { z } from 'zod';
const pair = z.tuple([
  z.number().finite().min(-1e6).max(1e6),
  z.number().finite().min(-1e6).max(1e6),
]);
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/);
const point = z.union([pair, id, z.strictObject({ anchor: id, offset: pair })]);
export const constructionSchema = z.strictObject({
  points: z.record(id, point),
  paths: z
    .record(
      id,
      z
        .array(
          z.discriminatedUnion('op', [
            z.strictObject({ op: z.literal('M'), to: point }),
            z.strictObject({ op: z.literal('L'), to: point }),
            z.strictObject({ op: z.literal('Q'), control: point, to: point }),
            z.strictObject({ op: z.literal('C'), control1: point, control2: point, to: point }),
            z.strictObject({ op: z.literal('Z') }),
          ]),
        )
        .min(1)
        .max(4096),
    )
    .default({}),
});
/** Resolve a named 2D construction graph. Moving an anchor updates every dependent guide. */
export function resolveConstruction(raw: unknown) {
  const spec = constructionSchema.parse(raw),
    points: Record<string, [number, number]> = Object.create(null),
    visiting = new Set<string>();
  if (Object.keys(spec.points).length > 4096 || Object.keys(spec.paths).length > 256)
    throw new Error('Construction exceeds 4096 points / 256 paths');
  type Ref = z.infer<typeof point>;
  const resolve = (ref: Ref): [number, number] => {
    if (Array.isArray(ref)) return [...ref];
    if (typeof ref === 'object') {
      const a = named(ref.anchor);
      const value: [number, number] = [a[0] + ref.offset[0], a[1] + ref.offset[1]];
      if (value.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6))
        throw new Error('Resolved construction coordinate exceeds range');
      return value;
    }
    return named(ref);
  };
  const named = (name: string): [number, number] => {
    if (Object.hasOwn(points, name)) return points[name]!;
    if (visiting.has(name)) throw new Error(`Construction cycle at ${name}`);
    if (!Object.hasOwn(spec.points, name)) throw new Error(`Unknown construction point ${name}`);
    visiting.add(name);
    const p = resolve(spec.points[name]!);
    visiting.delete(name);
    if (p.some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6))
      throw new Error('Resolved construction coordinate exceeds range');
    return (points[name] = p);
  };
  Object.keys(spec.points).forEach(named);
  const xy = (ref: Ref) => resolve(ref).join(' ');
  const paths = Object.fromEntries(
    Object.entries(spec.paths).map(([id, segments]) => {
      if (segments[0]!.op !== 'M') throw new Error('Construction paths must start with M');
      return [
        id,
        segments
          .map((s) => {
            switch (s.op) {
              case 'M':
              case 'L':
                return `${s.op}${xy(s.to)}`;
              case 'Q':
                return `Q${xy(s.control)} ${xy(s.to)}`;
              case 'C':
                return `C${xy(s.control1)} ${xy(s.control2)} ${xy(s.to)}`;
              case 'Z':
                return 'Z';
            }
          })
          .join(' '),
      ];
    }),
  );
  return { points, paths };
}
