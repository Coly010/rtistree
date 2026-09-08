import type { Bounds, Layer, Scene } from './schema.js';

export type Matrix = [number, number, number, number, number, number];
export interface ResolvedLayer {
  layer: Layer;
  visible: boolean;
  bounds: Bounds;
  worldBounds: Bounds;
  matrix: Matrix;
  children: ResolvedLayer[];
}
export const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function transformedBounds(m: Matrix, w: number, h: number): Bounds {
  const points = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].map(([x, y]) => [m[0] * x! + m[2] * y! + m[4], m[1] * x! + m[3] * y! + m[5]]);
  const xs = points.map((p) => p[0]!),
    ys = points.map((p) => p[1]!);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}
export function intersects(a: Bounds, b: Bounds): boolean {
  return a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
}
export function resolveLayout(scene: Scene): ResolvedLayer[] {
  const dimension = (value: number | string | undefined, total: number, fallback: number) =>
    typeof value === 'string' ? (parseFloat(value) / 100) * total : (value ?? fallback);
  function resolve(
    layers: Layer[],
    pw: number,
    ph: number,
    matrix: Matrix,
    layout?: Layer['layout'],
    parentVisible = true,
  ): ResolvedLayer[] {
    const padding = layout?.padding ?? 0,
      gap = layout?.gap ?? 0;
    const w = pw - padding * 2,
      h = ph - padding * 2;
    if (w <= 0 || h <= 0) throw new Error('Layout padding consumes the parent bounds');
    const horizontal = layout?.type === 'horizontal',
      vertical = layout?.type === 'vertical';
    const count = layers.length;
    let cursor = padding;
    // Percentages on the flow axis share space remaining after gaps.
    const aw = w - (horizontal ? gap * Math.max(0, count - 1) : 0),
      ah = h - (vertical ? gap * Math.max(0, count - 1) : 0);
    return layers.map((layer) => {
      const width = dimension(
        layer.width,
        aw,
        layer.bounds?.[2] ?? (horizontal ? aw / Math.max(1, count) : w),
      );
      const height = dimension(
        layer.height,
        ah,
        layer.bounds?.[3] ?? (vertical ? ah / Math.max(1, count) : h),
      );
      if (width <= 0 || height <= 0 || width > 8192 || height > 8192)
        throw new Error(`Invalid resolved size: ${layer.id}`);
      let x = layer.bounds?.[0] ?? padding,
        y = layer.bounds?.[1] ?? padding;
      if (horizontal || vertical) {
        const crossSpace = horizontal ? h - height : w - width;
        const cross =
          padding +
          (layout?.align === 'center' ? crossSpace / 2 : layout?.align === 'end' ? crossSpace : 0);
        if (horizontal) {
          x = cursor;
          y = cross;
          cursor += width + gap;
        } else {
          y = cursor;
          x = cross;
          cursor += height + gap;
        }
      } else if (layer.anchor !== 'top-left') {
        if (layer.anchor === 'center') {
          x += (w - width) / 2;
          y += (h - height) / 2;
        }
        if (layer.anchor.endsWith('right')) x += w - width;
        if (layer.anchor.startsWith('bottom')) y += h - height;
      }
      const rad = ((layer.transform?.rotation ?? 0) * Math.PI) / 180,
        [sx, sy] = layer.transform?.scale ?? [1, 1];
      const rotation: Matrix = [
        Math.cos(rad) * sx,
        Math.sin(rad) * sx,
        -Math.sin(rad) * sy,
        Math.cos(rad) * sy,
        0,
        0,
      ];
      const local = multiply(multiply([1, 0, 0, 1, x + width / 2, y + height / 2], rotation), [
        1,
        0,
        0,
        1,
        -width / 2,
        -height / 2,
      ]);
      const world = multiply(matrix, local);
      return {
        layer,
        visible: parentVisible && layer.visible && layer.opacity > 0,
        bounds: [x, y, width, height],
        worldBounds: transformedBounds(world, width, height),
        matrix: world,
        children: resolve(
          layer.children,
          width,
          height,
          world,
          layer.layout,
          parentVisible && layer.visible && layer.opacity > 0,
        ),
      };
    });
  }
  return resolve(scene.layers, scene.canvas.width, scene.canvas.height, identity);
}
export function flattenResolved(nodes: ResolvedLayer[]): ResolvedLayer[] {
  return nodes.flatMap((node) => [node, ...flattenResolved(node.children)]);
}
