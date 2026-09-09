import type { Canvas } from './native.js';
import type { BrushPoint } from './raster-studio.js';
export const TECHNIQUE_VERSION = 'rtistree-techniques/1';
export const techniqueCatalog = {
  version: TECHNIQUE_VERSION,
  presets: {
    oil: { bristles: 16, dryness: 0.12, variation: 0.12, opacity: 0.8, taper: 0.4 },
    filbert: { bristles: 22, dryness: 0.04, variation: 0.08, opacity: 0.7, taper: 0.8 },
    scumble: { bristles: 12, dryness: 0.65, variation: 0.17, opacity: 0.28, taper: 0.25 },
    ink: { bristles: 1, dryness: 0, variation: 0, opacity: 1, taper: 0.65 },
  },
  palettes: {
    storm: ['#202e38', '#596568', '#a5a69a', '#ded4b5', '#68533f'],
    earth: ['#222d2b', '#485649', '#85866a', '#b9aa77', '#ddd1a0'],
    ember: ['#252c2b', '#4b6845', '#81a74c', '#bbdc72', '#f0f4bb'],
  },
  methods: {
    stroke:
      'art.techniques.stroke(canvas,points,{preset:"oil"|"filbert"|"scumble"|"ink",size,colour:"#RRGGBB",opacity?,dryness?,variation?,bristles?,taper?,smoothing?}). Smoothing is 0–1 (default 0), blending polylines toward a Catmull-Rom curve. Size is full brush width in current transformed coordinates. Seeded strands follow the path; pressure controls width. Respects context clipping, transforms and composite mode. Opacity is per strand, so overlapping paint accumulates.',
    glaze:
      'art.techniques.glaze(canvas,colour,opacity=.1) fills the canvas through the current clip/transform, using source-over and multiplying existing global alpha.',
    mix: 'art.techniques.mix(colourA,colourB,t) interpolates six-digit sRGB colours (artistic palette mixing, not pigment simulation).',
    atmosphere:
      'art.techniques.atmosphere(colour,haze,distance) mixes toward the haze colour by a clamped 0–1 distance. Apply lower contrast and detail separately in distant forms.',
    weave:
      'art.techniques.weave(canvas,{spacing=3,opacity=.025,colour="#dccca4"}) overlays fine crossed lines in current coordinates. Use sparingly at the final output resolution.',
  },
  guidance:
    'Block in large light/dark masses before brush texture. Follow form with strokes, reserve sharp edges and small marks for focal areas, and use scumble over opaque underpainting. These are reusable 2D techniques, not an automatic illustration system.',
};
type Preset = keyof typeof techniqueCatalog.presets;
export interface PaintOptions {
  preset?: Preset;
  size: number;
  colour: string;
  opacity?: number;
  dryness?: number;
  variation?: number;
  bristles?: number;
  taper?: number;
  smoothing?: number;
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
function rgb(c: string) {
  if (!/^#[\da-f]{6}$/i.test(c)) throw new Error('Technique colours must use #RRGGBB');
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
}
const hex = (c: number[]) =>
  '#' +
  c
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const mix = (a: string, b: string, t: number) => {
  const x = rgb(a),
    y = rgb(b);
  return hex(x.map((v, i) => v + (y[i]! - v) * clamp(t)));
};
export function createTechniques(random: () => number) {
  return {
    mix,
    atmosphere: mix,
    stroke(canvas: Canvas, points: BrushPoint[], options: PaintOptions) {
      const preset = techniqueCatalog.presets[options.preset ?? 'oil'];
      if (!preset) throw new Error('Unknown paint preset');
      const o = { smoothing: 0, ...preset, ...options },
        base = rgb(o.colour);
      if (
        !Number.isFinite(o.size) ||
        o.size <= 0 ||
        o.size > 2048 ||
        !Number.isInteger(o.bristles) ||
        o.bristles < 1 ||
        o.bristles > 64 ||
        [o.opacity, o.dryness, o.variation, o.taper, o.smoothing].some(
          (v) => !Number.isFinite(v) || v < 0 || v > 1,
        ) ||
        points.length > 10000 ||
        points.some((p) => ![p.x, p.y, p.pressure ?? 1].every(Number.isFinite))
      )
        throw new Error('Invalid paint stroke settings');
      if (points.length < 2) return canvas;
      if (o.smoothing > 0) {
        const original = points,
          smooth: BrushPoint[] = [];
        for (let i = 0; i < original.length - 1; i++) {
          const a = original[Math.max(0, i - 1)]!,
            b = original[i]!,
            d = original[i + 1]!,
            e = original[Math.min(original.length - 1, i + 2)]!;
          const steps = Math.max(2, Math.min(64, Math.ceil(Math.hypot(d.x - b.x, d.y - b.y) / 3)));
          for (let k = 0; k < steps; k++) {
            const t = k / steps,
              coordinate = (key: 'x' | 'y') => {
                const v =
                  0.5 *
                  (2 * b[key] +
                    (-a[key] + d[key]) * t +
                    (2 * a[key] - 5 * b[key] + 4 * d[key] - e[key]) * t * t +
                    (-a[key] + 3 * b[key] - 3 * d[key] + e[key]) * t * t * t);
                const linear = b[key] + (d[key] - b[key]) * t;
                return linear + (v - linear) * o.smoothing;
              };
            smooth.push({
              x: coordinate('x'),
              y: coordinate('y'),
              pressure: (b.pressure ?? 1) + ((d.pressure ?? 1) - (b.pressure ?? 1)) * t,
            });
          }
        }
        smooth.push(original.at(-1)!);
        points = smooth;
      }
      const ctx = canvas.getContext('2d');
      ctx.save();
      try {
        const parentAlpha = ctx.globalAlpha;
        for (let b = 0; b < o.bristles; b++) {
          const across = ((b + 0.5) / o.bristles - 0.5) * o.size,
            variation = (random() - 0.5) * o.variation * 255;
          ctx.strokeStyle = hex(base.map((v) => v + variation));
          ctx.lineCap = o.preset === 'ink' ? 'round' : 'butt';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = parentAlpha * o.opacity * (0.65 + random() * 0.35);
          for (let i = 1; i < points.length; i++) {
            const a = points[i - 1]!,
              p = points[i]!,
              length = Math.hypot(p.x - a.x, p.y - a.y);
            if (length < 0.001) continue;
            const nx = -(p.y - a.y) / length,
              ny = (p.x - a.x) / length,
              steps = Math.min(2048, Math.max(1, Math.ceil(length / Math.max(1, o.size * 0.25))));
            for (let k = 0; k < steps; k++) {
              if (random() < o.dryness) continue;
              const t = k / steps,
                u = (k + 1) / steps;
              const pressure = (t: number) =>
                clamp((a.pressure ?? 1) + ((p.pressure ?? 1) - (a.pressure ?? 1)) * t) *
                (1 - o.taper * Math.pow(Math.abs(2 * ((i - 1 + t) / (points.length - 1)) - 1), 3));
              const pa = pressure(t),
                pb = pressure(u);
              ctx.lineWidth = Math.max(
                0.05,
                ((o.size / o.bristles) * (1.15 + random() * 0.7) * (pa + pb)) / 2,
              );
              ctx.beginPath();
              ctx.moveTo(
                a.x + (p.x - a.x) * t + nx * across * pa,
                a.y + (p.y - a.y) * t + ny * across * pa,
              );
              ctx.lineTo(
                a.x + (p.x - a.x) * u + nx * across * pb,
                a.y + (p.y - a.y) * u + ny * across * pb,
              );
              ctx.stroke();
            }
          }
        }
      } finally {
        ctx.restore();
      }
      return canvas;
    },
    glaze(canvas: Canvas, colour: string, opacity = 0.1) {
      rgb(colour);
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
        throw new Error('Invalid glaze opacity');
      const c = canvas.getContext('2d');
      c.save();
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha *= opacity;
      c.fillStyle = colour;
      c.fillRect(0, 0, canvas.width, canvas.height);
      c.restore();
      return canvas;
    },
    weave(canvas: Canvas, options: { spacing?: number; opacity?: number; colour?: string } = {}) {
      const { spacing = 3, opacity = 0.025, colour = '#dccca4' } = options;
      rgb(colour);
      if (
        !Number.isFinite(spacing) ||
        spacing < 1 ||
        !Number.isFinite(opacity) ||
        opacity < 0 ||
        opacity > 1
      )
        throw new Error('Invalid weave settings');
      const c = canvas.getContext('2d');
      c.save();
      c.strokeStyle = colour;
      c.globalAlpha *= opacity;
      c.lineWidth = 0.6;
      c.beginPath();
      for (let x = 0; x < canvas.width; x += spacing) {
        c.moveTo(x, 0);
        c.lineTo(x, canvas.height);
      }
      for (let y = 0; y < canvas.height; y += spacing) {
        c.moveTo(0, y);
        c.lineTo(canvas.width, y);
      }
      c.stroke();
      c.restore();
      return canvas;
    },
  };
}
