import { createCanvas, type Canvas, type SKRSContext2D } from './native.js';
import { identity, type Matrix } from './layout.js';
import { inverse, point, worldScope } from './spatial.js';
import type { Bounds, Mask, RasterOperation } from './schema.js';

export function rgba(hex: string): [number, number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255,
  ];
}
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export function copyCanvas(source: Canvas): Canvas {
  const result = createCanvas(source.width, source.height);
  result.getContext('2d').drawImage(source, 0, 0);
  return result;
}
export function pixelBounds(bounds: Bounds, width: number, height: number): Bounds | null {
  const x = Math.max(0, Math.ceil(bounds[0])),
    y = Math.max(0, Math.ceil(bounds[1]));
  const right = Math.min(width, Math.ceil(bounds[0] + bounds[2])),
    bottom = Math.min(height, Math.ceil(bounds[1] + bounds[3]));
  return right > x && bottom > y ? [x, y, right - x, bottom - y] : null;
}
export function maskCanvas(
  mask: Mask,
  width: number,
  height: number,
  lookup: (id: string) => Canvas,
  matrix: Matrix = identity,
): Canvas {
  let result = createCanvas(width, height);
  const ctx = result.getContext('2d');
  ctx.fillStyle = '#ffffff';
  if (mask.space === 'layer' && mask.type !== 'semantic-object') ctx.setTransform(...matrix);
  if (mask.type === 'semantic-object') ctx.drawImage(lookup(mask.target), 0, 0);
  else if (mask.type === 'rectangle') ctx.fillRect(...mask.bounds);
  else if (mask.type === 'ellipse') {
    const [x, y, w, h] = mask.bounds;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    mask.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
  if (mask.feather) {
    const blurred = createCanvas(width, height),
      b = blurred.getContext('2d');
    b.filter = `blur(${mask.feather}px)`;
    b.drawImage(result, 0, 0);
    result = blurred;
  }
  return result;
}
function stroke(
  ctx: SKRSContext2D,
  op: Extract<RasterOperation, { type: 'paintStroke' | 'eraseStroke' }>,
) {
  ctx.globalAlpha = op.opacity;
  ctx.fillStyle = op.type === 'paintStroke' ? op.colour : '#ffffff';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = op.radius * 2;
  if (op.hardness < 1) ctx.filter = `blur(${(op.radius * (1 - op.hardness)) / 2}px)`;
  ctx.beginPath();
  op.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (op.path.length === 1) {
    ctx.arc(op.path[0]![0], op.path[0]![1], op.radius, 0, Math.PI * 2);
    ctx.fill();
  } else ctx.stroke();
}
export function applyRasterOperation(
  surface: Canvas,
  op: RasterOperation,
  lookup: (id: string) => Canvas,
  matrix: Matrix = identity,
  maskMatrix: Matrix = matrix,
): void {
  const attached = op.space === 'layer',
    inv = attached ? inverse(matrix) : identity;
  const scope = pixelBounds(
    attached ? worldScope(op.bounds, matrix) : op.bounds,
    surface.width,
    surface.height,
  );
  if (!scope) return;
  const [x, y, w, h] = scope,
    ctx = surface.getContext('2d');
  const original = ctx.getImageData(x, y, w, h),
    after = new Uint8ClampedArray(original.data);
  const mask = op.mask
    ? maskCanvas(op.mask, surface.width, surface.height, lookup, maskMatrix)
        .getContext('2d')
        .getImageData(x, y, w, h).data
    : undefined;
  if (
    op.type === 'paintStroke' ||
    op.type === 'eraseStroke' ||
    op.type === 'fill' ||
    op.type === 'blur'
  ) {
    const edited = copyCanvas(surface),
      c = edited.getContext('2d');
    if (op.type === 'fill') {
      c.fillStyle = op.colour;
      if (attached) c.setTransform(...matrix);
      c.fillRect(...(attached ? op.bounds : scope));
    } else if (op.type === 'blur') {
      c.clearRect(0, 0, edited.width, edited.height);
      c.filter = `blur(${op.radius}px)`;
      c.drawImage(surface, 0, 0);
    } else if (op.type === 'eraseStroke') {
      const brush = createCanvas(surface.width, surface.height);
      const brushContext = brush.getContext('2d');
      if (attached) brushContext.setTransform(...matrix);
      stroke(brushContext, op);
      c.globalCompositeOperation = 'destination-out';
      c.drawImage(brush, 0, 0);
    } else {
      if (attached) c.setTransform(...matrix);
      stroke(c, op);
    }
    after.set(c.getImageData(x, y, w, h).data);
  } else if (op.type === 'setPixels') {
    const pixels = new Map(op.pixels.map((p) => [`${p.x},${p.y}`, p.colour]));
    for (let py = y; py < y + h; py++)
      for (let px = x; px < x + w; px++) {
        const [lx, ly] = point(inv, px + (attached ? 0.5 : 0), py + (attached ? 0.5 : 0));
        const colour = pixels.get(`${Math.floor(lx)},${Math.floor(ly)}`);
        if (colour) after.set(rgba(colour), ((py - y) * w + px - x) * 4);
      }
  } else {
    const random = seededRandom(op.type === 'noise' ? op.seed : 0);
    for (let i = 0; i < after.length; i += 4) {
      const r = after[i]!,
        g = after[i + 1]!,
        b = after[i + 2]!;
      if (op.type === 'brightness')
        for (let c = 0; c < 3; c++) after[i + c] = after[i + c]! + op.amount * 255;
      if (op.type === 'contrast') {
        const f = (1 + op.amount) / (1.001 - op.amount);
        for (let c = 0; c < 3; c++) after[i + c] = (after[i + c]! - 127.5) * f + 127.5;
      }
      if (op.type === 'saturation') {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        for (let c = 0; c < 3; c++) after[i + c] = l + (after[i + c]! - l) * (1 + op.amount);
      }
      if (op.type === 'noise') {
        const n = (random() * 2 - 1) * op.amount * 255;
        for (let c = 0; c < 3; c++) after[i + c] = after[i + c]! + n;
      }
      if (op.type === 'colourReplace') {
        const from = rgba(op.from);
        if (
          Math.max(Math.abs(r - from[0]), Math.abs(g - from[1]), Math.abs(b - from[2])) <=
          op.tolerance * 255
        )
          after.set(rgba(op.to), i);
      }
      if (op.type === 'hueShift') {
        const angle = (op.degrees * Math.PI) / 180,
          u = Math.cos(angle),
          v = Math.sin(angle);
        after[i] =
          (0.213 + 0.787 * u - 0.213 * v) * r +
          (0.715 - 0.715 * u - 0.715 * v) * g +
          (0.072 - 0.072 * u + 0.928 * v) * b;
        after[i + 1] =
          (0.213 - 0.213 * u + 0.143 * v) * r +
          (0.715 + 0.285 * u + 0.14 * v) * g +
          (0.072 - 0.072 * u - 0.283 * v) * b;
        after[i + 2] =
          (0.213 - 0.213 * u - 0.787 * v) * r +
          (0.715 - 0.715 * u + 0.715 * v) * g +
          (0.072 + 0.928 * u + 0.072 * v) * b;
      }
    }
  }
  for (let i = 0; i < after.length; i += 4) {
    const px = x + ((i / 4) % w),
      py = y + Math.floor(i / 4 / w),
      [lx, ly] = point(inv, px + 0.5, py + 0.5);
    const inScope =
      !attached ||
      (lx >= op.bounds[0] &&
        ly >= op.bounds[1] &&
        lx < op.bounds[0] + op.bounds[2] &&
        ly < op.bounds[1] + op.bounds[3]);
    if (!inScope) continue;
    const amount = (mask?.[i + 3] ?? 255) / 255;
    // Interpolate premultiplied colours to avoid halos around transparent masks.
    const oldA = original.data[i + 3]! / 255,
      newA = after[i + 3]! / 255,
      a = oldA * (1 - amount) + newA * amount;
    for (let c = 0; c < 3; c++)
      original.data[i + c] = a
        ? (original.data[i + c]! * oldA * (1 - amount) + after[i + c]! * newA * amount) / a
        : 0;
    original.data[i + 3] = a * 255;
  }
  ctx.putImageData(original, x, y);
}
