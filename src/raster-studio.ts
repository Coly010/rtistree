import { resolveConstruction } from './construction.js';
import { createTechniques } from './techniques.js';
import { createCanvas, Path2D, type Canvas } from './native.js';

export type RGBA = [number, number, number, number];
export interface PixelSurface {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export type EdgeMode = 'transparent' | 'clamp' | 'repeat';
export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const repeat = (x: number, period: number) => ((x % period) + period) % period;
export function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Coordinate-addressed noise is independent of traversal order. */
export function noise2D(x: number, y: number, seed = 0): number {
  const hash = (a: number, b: number) => {
    let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = smoothstep(0, 1, x - ix),
    fy = smoothstep(0, 1, y - iy);
  return mix(
    mix(hash(ix, iy), hash(ix + 1, iy), fx),
    mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx),
    fy,
  );
}
export function fbm(x: number, y: number, seed = 0, octaves = 5) {
  if (!Number.isInteger(octaves) || octaves < 1 || octaves > 12)
    throw new Error('Noise octaves must be 1–12');
  let value = 0,
    weight = 0.5,
    sum = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise2D(x, y, seed + i * 1013) * weight;
    sum += weight;
    weight *= 0.5;
    x *= 2;
    y *= 2;
  }
  return value / sum;
}
/** Pixel centres are integer coordinates; interpolate premultiplied colour to avoid dark fringes. */
export function sample(
  s: PixelSurface,
  x: number,
  y: number,
  edge: EdgeMode = 'transparent',
): RGBA {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0, 0, 0];
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    dx = x - x0,
    dy = y - y0;
  const out: RGBA = [0, 0, 0, 0];
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      let xx = x0 + i,
        yy = y0 + j;
      if (edge === 'repeat') {
        xx = repeat(xx, s.width);
        yy = repeat(yy, s.height);
      } else if (edge === 'clamp') {
        xx = clamp(xx, 0, s.width - 1);
        yy = clamp(yy, 0, s.height - 1);
      } else if (xx < 0 || yy < 0 || xx >= s.width || yy >= s.height) continue;
      const p = (yy * s.width + xx) * 4,
        w = (i ? dx : 1 - dx) * (j ? dy : 1 - dy),
        alpha = s.data[p + 3]! / 255;
      for (let c = 0; c < 3; c++) out[c]! += s.data[p + c]! * alpha * w;
      out[3] += alpha * w;
    }
  if (out[3]) for (let c = 0; c < 3; c++) out[c]! /= out[3];
  out[3] *= 255;
  return out;
}
export interface BrushPoint {
  x: number;
  y: number;
  pressure?: number;
}
export interface BrushOptions {
  radius: number;
  colour: string;
  hardness?: number;
  opacity?: number;
  spacing?: number;
  scatter?: number;
}
export type Vector3 = [number, number, number];
const normalise = (v: Vector3): Vector3 => {
  const length = Math.hypot(...v);
  if (!length || !Number.isFinite(length)) throw new Error('Expected a finite nonzero vector');
  return v.map((n) => (n === 0 ? 0 : n / length)) as Vector3;
};
export function heightNormal(
  height: (x: number, y: number) => number,
  x: number,
  y: number,
  strength = 1,
  step = 1,
): Vector3 {
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(strength))
    throw new Error('Invalid height-field sampling settings');
  return normalise([
    (-(height(x + step, y) - height(x - step, y)) * strength) / (2 * step),
    (-(height(x, y + step) - height(x, y - step)) * strength) / (2 * step),
    1,
  ]);
}
export function lightSurface(
  normal: Vector3,
  base: RGBA,
  options: {
    light?: Vector3;
    ambient?: number;
    diffuse?: number;
    specular?: number;
    shininess?: number;
  } = {},
): RGBA {
  const n = normalise(normal),
    l = normalise(options.light ?? [-0.5, -0.6, 1]),
    backlight = l[2] === -1,
    half: Vector3 = backlight ? [0, 0, 1] : normalise([l[0], l[1], l[2] + 1]);
  const dot = (a: Vector3, b: Vector3) =>
    Math.max(
      0,
      a.reduce((sum, v, i) => sum + v * b[i]!, 0),
    );
  const diffuse = (options.ambient ?? 0.2) + (options.diffuse ?? 0.8) * dot(n, l),
    specular = backlight
      ? 0
      : 255 * (options.specular ?? 0.1) * Math.pow(dot(n, half), options.shininess ?? 32);
  return [
    clamp(base[0] * diffuse + specular, 0, 255),
    clamp(base[1] * diffuse + specular, 0, 255),
    clamp(base[2] * diffuse + specular, 0, 255),
    base[3],
  ];
}
/** A synchronous authoring API. Programs return one Canvas; scene playback uses its baked PNG. */
export function createRasterStudio(
  width: number,
  height: number,
  seed: number,
  inputs: Record<string, Canvas> = {},
) {
  let allocated = Object.values(inputs).reduce((n, c) => n + c.width * c.height, 0);
  const random = randomGenerator(seed);
  const canvas = (w = width, h = height): Canvas => {
    if (
      ![w, h].every((v) => Number.isInteger(v) && v > 0 && v <= 8192) ||
      w * h + allocated > 32 * 1024 * 1024
    )
      throw new Error(
        'Studio surface allocation exceeds 8192-pixel / 32-megapixel cumulative budget',
      );
    allocated += w * h;
    return createCanvas(w, h);
  };
  const pixels = (c: Canvas): PixelSurface => ({
    width: c.width,
    height: c.height,
    data: c.getContext('2d').getImageData(0, 0, c.width, c.height).data,
  });
  const put = (c: Canvas, p: PixelSurface) => {
    if (c.width !== p.width || c.height !== p.height || p.data.length !== p.width * p.height * 4)
      throw new Error('Pixel buffer dimensions disagree');
    const ctx = c.getContext('2d'),
      image = ctx.createImageData(p.width, p.height);
    image.data.set(p.data);
    ctx.putImageData(image, 0, 0);
    return c;
  };
  const raster = (fn: (x: number, y: number) => RGBA, w = width, h = height) => {
    const c = canvas(w, h),
      ctx = c.getContext('2d'),
      p = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const value = fn(x, y),
          offset = (y * w + x) * 4;
        if (!value || value.length !== 4 || value.some((v) => !Number.isFinite(v)))
          throw new Error('Raster callback must return four finite 0–255 channels');
        p.data.set(value, offset);
      }
    ctx.putImageData(p, 0, 0);
    return c;
  };
  const warp = (
    source: Canvas,
    coordinates: (x: number, y: number) => [number, number],
    edge: EdgeMode = 'transparent',
    w = source.width,
    h = source.height,
  ) => {
    const p = pixels(source);
    return raster(
      (x, y) => {
        const [u, v] = coordinates(x, y);
        return sample(p, u, v, edge);
      },
      w,
      h,
    );
  };
  const brush = (c: Canvas, points: BrushPoint[], options: BrushOptions) => {
    if (
      !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(options.colour) ||
      Object.entries(options).some(([key, value]) => key !== 'colour' && !Number.isFinite(value))
    )
      throw new Error('Brush expects a hex colour and finite numeric settings');
    const { radius, colour } = options,
      hardness = clamp(options.hardness ?? 0.5),
      opacity = clamp(options.opacity ?? 1),
      spacing = Math.max(0.02, options.spacing ?? 0.15),
      scatter = Math.max(0, options.scatter ?? 0);
    if (
      !Number.isFinite(radius) ||
      radius <= 0 ||
      radius > 1024 ||
      points.some((p) => !Number.isFinite(p.x + p.y + (p.pressure ?? 1)))
    )
      throw new Error('Invalid brush stroke');
    const ctx = c.getContext('2d');
    ctx.save();
    const dab = (x: number, y: number, pressure: number) => {
      const r = radius * clamp(pressure);
      if (r < 0.01) return;
      x += (random() - 0.5) * scatter * radius;
      y += (random() - 0.5) * scatter * radius;
      ctx.globalAlpha = opacity * clamp(pressure);
      if (hardness >= 0.999) ctx.fillStyle = colour;
      else {
        const g = ctx.createRadialGradient(x, y, r * hardness, x, y, r);
        g.addColorStop(0, colour);
        g.addColorStop(1, colour.length === 9 ? colour.slice(0, 7) + '00' : colour + '00');
        ctx.fillStyle = g;
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (points[0]) dab(points[0].x, points[0].y, points[0].pressure ?? 1);
    let next = radius * spacing;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!,
        length = Math.hypot(b.x - a.x, b.y - a.y);
      while (next <= length) {
        const t = next / length;
        dab(mix(a.x, b.x, t), mix(a.y, b.y, t), mix(a.pressure ?? 1, b.pressure ?? 1, t));
        next += radius * spacing;
      }
      next -= length;
    }
    ctx.restore();
    return c;
  };
  return {
    width,
    height,
    seed,
    techniques: createTechniques(random),
    guides: resolveConstruction,
    path: (data: string) => new Path2D(data),
    canvas,
    pixels,
    put,
    raster,
    warp,
    sample,
    brush,
    random,
    clamp,
    mix,
    smoothstep,
    repeat,
    normal: heightNormal,
    light: lightSurface,
    noise: (x: number, y: number, salt = 0) => noise2D(x, y, seed ^ salt),
    fbm: (x: number, y: number, octaves = 5, salt = 0) => fbm(x, y, seed ^ salt, octaves),
    polar: (x: number, y: number, cx = 0, cy = 0) => ({
      radius: Math.hypot(x - cx, y - cy),
      angle: Math.atan2(y - cy, x - cx),
    }),
    input: (name: string) => {
      if (!Object.hasOwn(inputs, name)) throw new Error(`Unknown input ${name}`);
      return inputs[name]!;
    },
    displace: (
      source: Canvas,
      field: (x: number, y: number) => [number, number],
      amount = 1,
      edge: EdgeMode = 'transparent',
    ) =>
      warp(
        source,
        (x, y) => {
          const [dx, dy] = field(x, y);
          return [x + dx * amount, y + dy * amount];
        },
        edge,
      ),
    blur: (source: Canvas, radius: number) => {
      if (!Number.isFinite(radius) || radius < 0 || radius > 128)
        throw new Error('Blur radius must be 0–128');
      const result = canvas(source.width, source.height),
        ctx = result.getContext('2d');
      ctx.filter = `blur(${radius}px)`;
      ctx.drawImage(source, 0, 0);
      return result;
    },
  };
}
export type RasterStudio = ReturnType<typeof createRasterStudio>;
