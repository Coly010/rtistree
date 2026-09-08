import { createRequire } from 'node:module';
import { createCanvas, Path2D, type Canvas, type SKRSContext2D } from './native.js';
import { loadAssets, registerFonts, sceneHash, sha256 } from './assets.js';
import { flattenResolved, resolveLayout, type ResolvedLayer } from './layout.js';
import { applyRasterOperation, maskCanvas, rgba, seededRandom } from './paint.js';
import { parseScene, type Bounds, type Layer, type Scene } from './schema.js';

export const RENDERER_VERSION = '0.1.0';
const require = createRequire(import.meta.url);
const canvasVersion = (require('@napi-rs/canvas/package.json') as { version: string }).version;
export interface TextDiagnostic {
  layer: string;
  lines: string[];
  width: number;
  height: number;
  available: [number, number];
  overflow: boolean;
}
export interface RenderOptions {
  region?: Bounds;
  quality?: 'draft' | 'preview' | 'final';
  layer?: string;
}
export interface RenderEvidence {
  renderer: {
    name: string;
    version: string;
    backend: string;
    node: string;
    platform: string;
    arch: string;
  };
  scene: { version: 1; hash: string };
  assets: Record<string, string>;
  fonts: Record<string, string>;
  render: {
    width: number;
    height: number;
    colour_space: 'srgb';
    quality: string;
    region?: Bounds;
    layer?: string;
    png_hash: string;
  };
}
export interface RenderResult {
  png: Buffer;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  evidence: RenderEvidence;
  text: TextDiagnostic[];
}
export interface Renderer {
  render(scene: Scene, root: string, options?: RenderOptions): Promise<RenderResult>;
}
export function fontStyle(layer: Layer): string {
  const s = layer.style!;
  return `${s.size}px "Rtistree-${s.font === 'display' ? 'display' : s.weight === 'bold' ? 'inter-bold' : 'inter'}"`;
}
export function layoutText(
  ctx: SKRSContext2D,
  layer: Layer,
  width: number,
  height: number,
): TextDiagnostic {
  ctx.font = fontStyle(layer);
  const lines: string[] = [];
  for (const paragraph of layer.content!.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  const measured = Math.max(0, ...lines.map((line) => ctx.measureText(line).width)),
    total = lines.length * layer.style!.size * layer.style!.line_height;
  return {
    layer: layer.id,
    lines,
    width: measured,
    height: total,
    available: [width, height],
    overflow: measured > width + 0.5 || total > height + 0.5,
  };
}
export class SkiaRenderer implements Renderer {
  async render(input: Scene, root: string, options: RenderOptions = {}): Promise<RenderResult> {
    const scene = parseScene(input),
      fonts = await registerFonts(),
      assets = await loadAssets(scene, root);
    const { width, height } = scene.canvas,
      nodes = resolveLayout(scene),
      all = flattenResolved(nodes),
      index = new Map(all.map((n) => [n.layer.id, n]));
    if (width * height * (all.length + 6) > 128 * 1024 * 1024)
      throw new Error('Scene exceeds the CPU surface budget; reduce canvas size or layer count');
    const cache = new Map<string, Canvas>(),
      text: TextDiagnostic[] = [];
    const fresh = () => createCanvas(width, height);
    const lookup = (id: string): Canvas => {
      const n = index.get(id);
      if (!n) throw new Error(`Unknown layer: ${id}`);
      return renderNode(n);
    };
    const compose = (target: Canvas, children: ResolvedLayer[]) => {
      const ctx = target.getContext('2d');
      for (const child of [...children].sort((a, b) => a.layer.z - b.layer.z)) {
        if (!child.layer.visible) continue;
        if (child.layer.type === 'adjustment') {
          const modified = fresh();
          modified.getContext('2d').drawImage(target, 0, 0);
          for (const op of child.layer.operations) applyRasterOperation(modified, op, lookup);
          const before = ctx.getImageData(0, 0, width, height),
            after = modified.getContext('2d').getImageData(0, 0, width, height);
          const mask = child.layer.mask
            ? maskCanvas(child.layer.mask, width, height, lookup)
                .getContext('2d')
                .getImageData(0, 0, width, height).data
            : undefined;
          for (let i = 0; i < before.data.length; i += 4) {
            const amount = (child.layer.opacity * (mask?.[i + 3] ?? 255)) / 255;
            const oldA = before.data[i + 3]! / 255,
              newA = after.data[i + 3]! / 255,
              alpha = oldA * (1 - amount) + newA * amount;
            for (let c = 0; c < 3; c++)
              before.data[i + c] = alpha
                ? (before.data[i + c]! * oldA * (1 - amount) + after.data[i + c]! * newA * amount) /
                  alpha
                : 0;
            before.data[i + 3] = alpha * 255;
          }
          ctx.putImageData(before, 0, 0);
        } else {
          ctx.globalCompositeOperation =
            child.layer.blend_mode === 'normal' ? 'source-over' : child.layer.blend_mode;
          ctx.drawImage(renderNode(child), 0, 0);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    const renderNode = (node: ResolvedLayer): Canvas => {
      const hit = cache.get(node.layer.id);
      if (hit) return hit;
      const layer = node.layer;
      let canvas = fresh();
      let ctx = canvas.getContext('2d');
      if (!layer.visible) {
        cache.set(layer.id, canvas);
        return canvas;
      }
      const w = node.bounds[2],
        h = node.bounds[3];
      ctx.save();
      ctx.setTransform(...node.matrix);
      if (layer.type === 'vector') {
        const shape = layer.shape!;
        ctx.fillStyle = shape.fill;
        ctx.beginPath();
        let path: Path2D | undefined;
        if (shape.type === 'rectangle')
          ctx.roundRect(0, 0, w, h, Math.min(shape.radius, w / 2, h / 2));
        if (shape.type === 'ellipse') ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        if (shape.type === 'path') path = new Path2D(shape.d);
        if (path) ctx.fill(path);
        else ctx.fill();
        if (shape.stroke) {
          ctx.strokeStyle = shape.stroke;
          ctx.lineWidth = shape.stroke_width;
          if (path) ctx.stroke(path);
          else ctx.stroke();
        }
      }
      if (layer.type === 'text') {
        const diagnostic = layoutText(ctx, layer, w, h);
        text.push(diagnostic);
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.fillStyle = layer.style!.colour;
        ctx.textBaseline = 'top';
        ctx.textAlign = layer.style!.align;
        const x = layer.style!.align === 'center' ? w / 2 : layer.style!.align === 'right' ? w : 0;
        diagnostic.lines.forEach((line, i) =>
          ctx.fillText(line, x, i * layer.style!.size * layer.style!.line_height),
        );
      }
      if (
        layer.type === 'asset' ||
        layer.type === 'generated-asset' ||
        (layer.type === 'raster' && layer.source)
      ) {
        const image = assets.images.get(layer.source!)!;
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        const scale =
          layer.fit === 'cover'
            ? Math.max(w / image.width, h / image.height)
            : Math.min(w / image.width, h / image.height);
        const dw = layer.fit === 'stretch' ? w : image.width * scale,
          dh = layer.fit === 'stretch' ? h : image.height * scale;
        ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
      if (layer.type === 'procedural') {
        const generator = layer.generator!;
        if (generator.type === 'solid') ctx.fillStyle = generator.colour;
        if (generator.type === 'gradient') {
          const a = (generator.angle * Math.PI) / 180,
            dx = Math.cos(a),
            dy = Math.sin(a),
            span = Math.abs(w * dx) + Math.abs(h * dy);
          const gradient = ctx.createLinearGradient(
            w / 2 - (dx * span) / 2,
            h / 2 - (dy * span) / 2,
            w / 2 + (dx * span) / 2,
            h / 2 + (dy * span) / 2,
          );
          gradient.addColorStop(0, generator.from);
          gradient.addColorStop(1, generator.to);
          ctx.fillStyle = gradient;
        }
        if (generator.type === 'noise') {
          const noise = createCanvas(Math.ceil(w), Math.ceil(h)),
            nc = noise.getContext('2d'),
            data = nc.createImageData(noise.width, noise.height),
            random = seededRandom(generator.seed),
            colour = rgba(generator.colour);
          for (let i = 0; i < data.data.length; i += 4) {
            const n = (random() * 2 - 1) * generator.amount * 255;
            for (let c = 0; c < 3; c++) data.data[i + c] = colour[c]! + n;
            data.data[i + 3] = colour[3];
          }
          nc.putImageData(data, 0, 0);
          ctx.drawImage(noise, 0, 0, w, h);
        } else ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
      if (layer.type === 'group') compose(canvas, node.children);
      // Effects precede scoped edits so blur cannot leak an edit beyond its scope.
      for (const effect of layer.effects) {
        const next = fresh(),
          c = next.getContext('2d');
        c.filter = `blur(${effect.radius}px)`;
        c.drawImage(canvas, 0, 0);
        canvas = next;
      }
      ctx = canvas.getContext('2d');
      for (const tile of layer.tiles) {
        const tw = tile.pixels[0]!.length,
          th = tile.pixels.length,
          tc = createCanvas(tw, th),
          t = tc.getContext('2d'),
          data = t.createImageData(tw, th);
        tile.pixels.forEach((row, y) =>
          [...row].forEach((key, x) => data.data.set(rgba(tile.palette[key]!), 4 * (y * tw + x))),
        );
        t.putImageData(data, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tc, ...tile.bounds);
        ctx.imageSmoothingEnabled = true;
      }
      for (const op of layer.operations) applyRasterOperation(canvas, op, lookup);
      if (layer.mask) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskCanvas(layer.mask, width, height, lookup), 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (layer.opacity !== 1) {
        const next = fresh(),
          c = next.getContext('2d');
        c.globalAlpha = layer.opacity;
        c.drawImage(canvas, 0, 0);
        canvas = next;
      }
      cache.set(layer.id, canvas);
      return canvas;
    };
    let output = fresh();
    if (options.layer) output = lookup(options.layer);
    else {
      const ctx = output.getContext('2d');
      ctx.fillStyle = scene.canvas.background;
      ctx.fillRect(0, 0, width, height);
      compose(output, nodes);
    }
    if (options.region) {
      const [x, y, w, h] = options.region;
      if (
        !options.region.every(Number.isInteger) ||
        x < 0 ||
        y < 0 ||
        w <= 0 ||
        h <= 0 ||
        x + w > width ||
        y + h > height
      )
        throw new Error('Render region must be an integer rectangle inside the canvas');
      const crop = createCanvas(w, h);
      crop.getContext('2d').putImageData(output.getContext('2d').getImageData(x, y, w, h), 0, 0);
      output = crop;
    }
    const quality = options.quality ?? 'final';
    if (quality === 'draft') {
      const draft = createCanvas(
        Math.max(1, Math.ceil(output.width / 2)),
        Math.max(1, Math.ceil(output.height / 2)),
      );
      draft.getContext('2d').drawImage(output, 0, 0, draft.width, draft.height);
      output = draft;
    }
    const png = await output.encode('png');
    return {
      png,
      pixels: output.getContext('2d').getImageData(0, 0, output.width, output.height).data,
      width: output.width,
      height: output.height,
      text,
      evidence: {
        renderer: {
          name: 'rtistree-skia',
          version: RENDERER_VERSION,
          backend: `@napi-rs/canvas@${canvasVersion}`,
          node: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        scene: { version: 1, hash: sceneHash(scene) },
        assets: assets.hashes,
        fonts,
        render: {
          width: output.width,
          height: output.height,
          colour_space: 'srgb',
          quality,
          region: options.region,
          layer: options.layer,
          png_hash: sha256(png),
        },
      },
    };
  }
}
export const defaultRenderer: Renderer = new SkiaRenderer();
