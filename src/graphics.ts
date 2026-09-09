import { Path2D, createCanvas, type Canvas, type Image } from './native.js';
import type { Layer, Bounds } from './schema.js';
export function shapePath(layer: Layer, w: number, h: number) {
  const s = layer.shape!;
  const p = new Path2D(s.type === 'path' ? s.d : undefined);
  if (s.type === 'rectangle') p.roundRect(0, 0, w, h, Math.min(s.radius, w / 2, h / 2));
  if (s.type === 'ellipse') p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  return p;
}
export function imagePlacement(layer: Layer, iw: number, ih: number, w: number, h: number) {
  const crop: Bounds = layer.crop ?? [0, 0, iw, ih];
  const [x, y, cw, ch] = crop;
  if (x < 0 || y < 0 || x + cw > iw || y + ch > ih)
    throw new Error('Source crop must lie inside the image');
  const scale = layer.fit === 'cover' ? Math.max(w / cw, h / ch) : Math.min(w / cw, h / ch);
  const dw = layer.fit === 'stretch' ? w : cw * scale,
    dh = layer.fit === 'stretch' ? h : ch * scale;
  const [fx, fy] = layer.focal_point ?? [0.5, 0.5];
  return { crop, destination: [(w - dw) * fx, (h - dh) * fy, dw, dh] as Bounds };
}
/** Inverse projective sampling avoids cracks from triangulated perspective meshes. */
export function perspectiveImage(input: Canvas, quad: NonNullable<Layer['perspective']>): Canvas {
  const [p0, p1, p2, p3] = quad;
  const cross = quad.map((p, i) => {
    const q = quad[(i + 1) % 4]!,
      r = quad[(i + 2) % 4]!;
    return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
  });
  if (
    cross.some((v) => Math.abs(v) < 1e-6) ||
    (!cross.every((v) => v > 0) && !cross.every((v) => v < 0))
  )
    throw new Error('Perspective corners must form a convex nondegenerate quadrilateral');
  const dx1 = p1[0] - p2[0],
    dx2 = p3[0] - p2[0],
    dx3 = p0[0] - p1[0] + p2[0] - p3[0],
    dy1 = p1[1] - p2[1],
    dy2 = p3[1] - p2[1],
    dy3 = p0[1] - p1[1] + p2[1] - p3[1];
  const det = dx1 * dy2 - dx2 * dy1,
    g = (dx3 * dy2 - dx2 * dy3) / det,
    h = (dx1 * dy3 - dx3 * dy1) / det;
  const a = p1[0] - p0[0] + g * p1[0],
    b = p3[0] - p0[0] + h * p3[0],
    c = p0[0],
    d = p1[1] - p0[1] + g * p1[1],
    e = p3[1] - p0[1] + h * p3[1],
    f = p0[1];
  const inverse = [
    e - f * h,
    c * h - b,
    b * f - c * e,
    f * g - d,
    a - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ];
  const output = createCanvas(input.width, input.height),
    ctx = output.getContext('2d'),
    src = input.getContext('2d').getImageData(0, 0, input.width, input.height).data,
    out = ctx.createImageData(input.width, input.height);
  for (let y = 0; y < input.height; y++)
    for (let x = 0; x < input.width; x++) {
      const px = x + 0.5,
        py = y + 0.5,
        den = inverse[6]! * px + inverse[7]! * py + inverse[8]!,
        u = (inverse[0]! * px + inverse[1]! * py + inverse[2]!) / den,
        v = (inverse[3]! * px + inverse[4]! * py + inverse[5]!) / den;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const sx = Math.max(0, Math.min(input.width - 1, u * input.width - 0.5)),
        sy = Math.max(0, Math.min(input.height - 1, v * input.height - 0.5)),
        x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        tx = sx - x0,
        ty = sy - y0;
      const sums = [0, 0, 0, 0];
      for (const [xx, yy, weight] of [
        [x0, y0, (1 - tx) * (1 - ty)],
        [Math.min(x0 + 1, input.width - 1), y0, tx * (1 - ty)],
        [x0, Math.min(y0 + 1, input.height - 1), (1 - tx) * ty],
        [Math.min(x0 + 1, input.width - 1), Math.min(y0 + 1, input.height - 1), tx * ty],
      ]) {
        const j = (yy! * input.width + xx!) * 4,
          alpha = src[j + 3]! / 255;
        for (let k = 0; k < 3; k++) sums[k]! += src[j + k]! * alpha * weight!;
        sums[3]! += alpha * weight!;
      }
      const i = (y * input.width + x) * 4;
      for (let k = 0; k < 3; k++) out.data[i + k] = sums[3] ? sums[k]! / sums[3]! : 0;
      out.data[i + 3] = sums[3]! * 255;
    }
  ctx.putImageData(out, 0, 0);
  return output;
}
