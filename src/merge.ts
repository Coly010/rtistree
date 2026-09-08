import { canonical } from './assets.js';
export class SourceConflict extends Error {
  constructor(readonly paths: string[]) {
    super(`Source rebase conflicts: ${paths.join(', ')}`);
  }
}
/** Preserve disjoint source and agent edits. ID-bearing arrays are merged by identity. */
export function mergeSource(base: unknown, working: unknown, incoming: unknown): unknown {
  const conflicts: string[] = [];
  const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
  function merge(a: any, b: any, c: any, path: string): any {
    if (equal(b, a)) return c;
    if (equal(c, a) || equal(b, c)) return b;
    if ([a, b, c].every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
      const result: Record<string, unknown> = {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(c)])) {
        const v = merge(a[key], b[key], c[key], `${path}/${key}`);
        if (v !== undefined) result[key] = v;
      }
      return result;
    }
    if (
      [a, b, c].every((v) => Array.isArray(v) && v.every((x: any) => x && typeof x.id === 'string'))
    ) {
      const maps = [a, b, c].map((list) => Object.fromEntries(list.map((x: any) => [x.id, x])));
      const order = (list: any[]) => list.filter((x) => maps[0]![x.id]).map((x) => x.id);
      if (!equal(order(b), order(a)) && !equal(order(c), order(a)) && !equal(order(b), order(c))) {
        conflicts.push(`${path}/order`);
        return b;
      }
      const ids = [
        ...new Set((equal(order(b), order(a)) ? [...c, ...b] : [...b, ...c]).map((x: any) => x.id)),
      ];
      return ids
        .map((id) => merge(maps[0]![id], maps[1]![id], maps[2]![id], `${path}/${id}`))
        .filter((v) => v !== undefined);
    }
    conflicts.push(path);
    return b;
  }
  const result = merge(base, working, incoming, '');
  if (conflicts.length) throw new SourceConflict(conflicts);
  return result;
}
