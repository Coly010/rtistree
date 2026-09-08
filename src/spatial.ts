import {
  identity,
  multiply,
  transformedBounds,
  type Matrix,
  type ResolvedLayer,
} from './layout.js';
import type { Bounds } from './schema.js';
export interface Coordinates {
  space?: 'canvas' | 'layer';
  reference_size?: [number, number];
}
export function coordinateMatrix(value: Coordinates, node: ResolvedLayer): Matrix {
  if (value.space !== 'layer') return identity;
  const [w, h] = value.reference_size ?? [node.bounds[2], node.bounds[3]];
  return multiply(node.matrix, [node.bounds[2] / w, 0, 0, node.bounds[3] / h, 0, 0]);
}
export function inverse(m: Matrix): Matrix {
  const d = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(d) < 1e-12) throw new Error('Singular paint transform');
  return [
    m[3] / d,
    -m[1] / d,
    -m[2] / d,
    m[0] / d,
    (m[2] * m[5] - m[3] * m[4]) / d,
    (m[1] * m[4] - m[0] * m[5]) / d,
  ];
}
export function point(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
export function worldScope(bounds: Bounds, m: Matrix): Bounds {
  const b = transformedBounds(
    multiply(m, [1, 0, 0, 1, bounds[0], bounds[1]]),
    bounds[2],
    bounds[3],
  );
  const x = Math.floor(b[0]),
    y = Math.floor(b[1]);
  return [x, y, Math.ceil(b[0] + b[2]) - x, Math.ceil(b[1] + b[3]) - y];
}
