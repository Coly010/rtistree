import { richLayout, type TextSpan } from './rich-text.js';
import { imagePlacement, perspectiveImage } from './graphics.js';
import { viewportScene } from './viewport.js';
import { renderDetail } from './detail.js';
import { createRequire } from 'node:module';
import { createCanvas, Path2D, type Canvas, type SKRSContext2D } from './native.js';
import {
  canonical,
  loadAssets,
  registerFonts,
  registerProjectFonts,
  sceneHash,
  sha256,
} from './assets.js';
import { flattenResolved, resolveLayout, type ResolvedLayer, type Matrix } from './layout.js';
import { applyRasterOperation, maskCanvas, rgba, seededRandom } from './paint.js';
import { coordinateMatrix } from './spatial.js';
import { layerMasks, parseScene, type Bounds, type Layer, type Scene } from './schema.js';

export const RENDERER_VERSION = '0.4.0';
const require = createRequire(import.meta.url);
const canvasVersion = (require('@napi-rs/canvas/package.json') as { version: string }).version;
export interface TextDiagnostic {
  layer: string;
  lines: string[];
  width: number;
  height: number;
  available: [number, number];
  overflow: boolean;
  spans?: TextSpan[][];
}
export interface RenderOptions {
  region?: Bounds;
  quality?: 'draft' | 'preview' | 'final';
  layer?: string;
  cache?: boolean;
  regionMode?: 'auto' | 'full';
  excludeLayers?: string[];
  canvasTransform?: Matrix;
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
    excluded_layers?: string[];
    canvas_transform?: Matrix;
  };
}
export interface RenderResult {
  png: Buffer;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  evidence: RenderEvidence;
  text: TextDiagnostic[];
  statistics: {
    rasterized_layers: number;
    cached_layers: number;
    cache_bytes: number;
    viewport_pixels?: number;
  };
}
export interface Renderer {
  render(scene: Scene, root: string, options?: RenderOptions): Promise<RenderResult>;
}
export function fontStyle(layer: Layer, aliases: Record<string, string> = {}): string {
  const s = layer.style!;
  if (aliases[s.font]) return `${s.size}px "${aliases[s.font]}"`;
  return `${s.size}px "Rtistree-${s.font === 'display' ? 'display' : s.weight === 'bold' ? 'inter-bold' : 'inter'}"`;
}
export function layoutText(
  ctx: SKRSContext2D,
  layer: Layer,
  width: number,
  height: number,
  aliases: Record<string, string> = {},
): TextDiagnostic {
  ctx.font = fontStyle(layer, aliases);
  ctx.letterSpacing = `${layer.style!.tracking ?? 0}px`;
  ctx.fontKerning = layer.style!.kerning === false ? 'none' : 'normal';
  if (layer.runs) {
    const spans = richLayout(ctx, layer, width, (l) => fontStyle(l, aliases)),
      measured = Math.max(0, ...spans.map((line) => line.reduce((a, b) => a + b.width, 0))),
      total = spans.length * layer.style!.size * layer.style!.line_height;
    return {
      layer: layer.id,
      lines: spans.map((l) => l.map((s) => s.text).join('')),
      width: measured,
      height: total,
      available: [width, height],
      overflow: measured > width + 0.5 || total > height + 0.5,
      spans,
    };
  }
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
  private surfaces = new Map<string, { canvas: Canvas; text: TextDiagnostic[]; bytes: number }>();
  private cacheBytes = 0;
  constructor(readonly maxCacheBytes = 128 * 1024 * 1024) {}
  clearCache() {
    this.surfaces.clear();
    this.cacheBytes = 0;
  }
  private remember(key: string, canvas: Canvas, text: TextDiagnostic[]) {
    const bytes = canvas.width * canvas.height * 4;
    if (bytes > this.maxCacheBytes) return;
    if (this.surfaces.has(key)) return;
    while (this.cacheBytes + bytes > this.maxCacheBytes && this.surfaces.size) {
      const oldest = this.surfaces.keys().next().value!;
      this.cacheBytes -= this.surfaces.get(oldest)!.bytes;
      this.surfaces.delete(oldest);
    }
    this.surfaces.set(key, { canvas, text, bytes });
    this.cacheBytes += bytes;
  }

  async render(input: Scene, root: string, options: RenderOptions = {}): Promise<RenderResult> {
    if (options.region && !options.canvasTransform && options.regionMode !== 'full') {
      const original = parseScene(input),
        [x, y, w, h] = options.region;
      if (
        !options.region.every(Number.isInteger) ||
        x < 0 ||
        y < 0 ||
        w <= 0 ||
        h <= 0 ||
        x + w > original.canvas.width ||
        y + h > original.canvas.height
      )
        throw new Error('Render region must be an integer rectangle inside the canvas');
      const viewport = viewportScene(original, options.region);
      if (viewport) {
        const r = await this.render(viewport, root, { ...options, region: undefined });
        return {
          ...r,
          statistics: { ...r.statistics, viewport_pixels: w * h },
          evidence: {
            ...r.evidence,
            scene: { version: 1, hash: sceneHash(original) },
            render: { ...r.evidence.render, region: options.region },
          },
        };
      }
    }
    const scene = parseScene(input),
      bundledFonts = await registerFonts(),
      customFonts = await registerProjectFonts(scene, root),
      fonts = { ...bundledFonts, ...customFonts.hashes },
      assets = await loadAssets(scene, root);
    const { width, height } = scene.canvas,
      nodes = resolveLayout(scene),
      all = flattenResolved(nodes),
      index = new Map(all.map((n) => [n.layer.id, n]));
    const retained = new Set(
      all.flatMap((n) =>
        layerMasks(n.layer).flatMap((m) => (m?.type === 'semantic-object' ? [m.target] : [])),
      ),
    );
    const depth = (nodes: ResolvedLayer[]): number =>
      Math.max(0, ...nodes.map((n) => 1 + depth(n.children)));
    if (
      width *
        height *
        (options.cache === false ? depth(nodes) + retained.size + 5 : all.length + 6) >
      160 * 1024 * 1024
    )
      throw new Error('Scene exceeds the CPU surface budget; reduce canvas size or layer count');
    const coordinates = (v: { space?: 'canvas' | 'layer' }, n: ResolvedLayer) =>
      v.space === 'layer'
        ? coordinateMatrix(v, n)
        : (options.canvasTransform ?? coordinateMatrix(v, n));
    const printableMask = (mask: NonNullable<Layer['mask']>): NonNullable<Layer['mask']> =>
      options.canvasTransform
        ? {
            ...mask,
            space: mask.type === 'semantic-object' ? mask.space : 'layer',
            ...(mask.type === 'combine' ? { masks: mask.masks.map(printableMask) } : {}),
          }
        : mask;
    const operation = (op: Layer['operations'][number]) =>
      options.canvasTransform
        ? { ...op, space: 'layer' as const, ...(op.mask ? { mask: printableMask(op.mask) } : {}) }
        : op;
    const statistics = { rasterized_layers: 0, cached_layers: 0, cache_bytes: 0 };
    const keys = new Map<string, string>();
    const keyFor = (node: ResolvedLayer): string => {
      const existing = keys.get(node.layer.id);
      if (existing) return existing;
      const { children, ...layer } = node.layer;
      const masks = layerMasks(layer as Layer).flatMap((mask) =>
        mask.type === 'semantic-object' ? [keyFor(index.get(mask.target)!)] : [],
      );
      const key = sha256(
        canonical({
          canvasTransform: options.canvasTransform,
          width,
          height,
          layer,
          matrix: node.matrix,
          bounds: node.bounds,
          children: node.children.map(keyFor),
          masks,
          assets: assets.hashes,
          fonts,
          exclude: options.excludeLayers ?? [],
        }),
      );
      keys.set(layer.id, key);
      return key;
    };
    const cache = new Map<string, Canvas>(),
      text: TextDiagnostic[] = [];
    const fresh = () => createCanvas(width, height);
    const lookup = (id: string): Canvas => {
      if (id.startsWith('asset:')) {
        const im = assets.images.get(id.slice(6));
        if (!im) throw new Error('Unknown mask asset');
        const c = createCanvas(im.width, im.height);
        c.getContext('2d').drawImage(im, 0, 0);
        return c;
      }
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
          for (const op of child.layer.operations)
            applyRasterOperation(
              modified,
              operation(op),
              lookup,
              coordinates(op, child),
              op.mask ? coordinates(op.mask, child) : undefined,
            );
          const before = ctx.getImageData(0, 0, width, height),
            after = modified.getContext('2d').getImageData(0, 0, width, height);
          const mask = child.layer.mask
            ? maskCanvas(
                printableMask(child.layer.mask),
                width,
                height,
                lookup,
                coordinates(child.layer.mask, child),
              )
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
          const surface = renderNode(child);
          ctx.drawImage(surface, 0, 0);
          if (options.cache === false && !retained.has(child.layer.id)) {
            cache.delete(child.layer.id);
            surface.width = 1;
            surface.height = 1;
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    const renderNode = (node: ResolvedLayer): Canvas => {
      const hit = cache.get(node.layer.id);
      if (hit) return hit;
      const key = keyFor(node),
        saved = options.cache === false ? undefined : this.surfaces.get(key);
      if (saved) {
        statistics.cached_layers++;
        this.surfaces.delete(key);
        this.surfaces.set(key, saved);
        text.push(...saved.text);
        cache.set(node.layer.id, saved.canvas);
        return saved.canvas;
      }
      statistics.rasterized_layers++;
      const textStart = text.length;
      const layer = node.layer;
      let canvas = fresh();
      let ctx = canvas.getContext('2d');
      if (!layer.visible || options.excludeLayers?.includes(layer.id)) {
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
          ctx.lineCap = shape.line_cap ?? 'butt';
          ctx.lineJoin = shape.line_join ?? 'miter';
          ctx.setLineDash(shape.dash ?? []);
          ctx.lineDashOffset = shape.dash_offset ?? 0;
          if (path) ctx.stroke(path);
          else ctx.stroke();
        }
      }
      if (layer.type === 'text') {
        const diagnostic = layoutText(ctx, layer, w, h, customFonts.aliases);
        text.push(diagnostic);
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.clip();
        ctx.fillStyle = layer.style!.colour;
        ctx.textBaseline = 'top';
        ctx.textAlign = layer.style!.align;
        const x = layer.style!.align === 'center' ? w / 2 : layer.style!.align === 'right' ? w : 0;
        if (diagnostic.spans) {
          ctx.textAlign = 'left';
          diagnostic.spans.forEach((line, i) =>
            line.forEach((span) => {
              ctx.font = fontStyle(
                { ...layer, style: { ...layer.style!, weight: span.weight } },
                customFonts.aliases,
              );
              ctx.fillStyle = span.colour;
              ctx.fillText(span.text, span.x, i * layer.style!.size * layer.style!.line_height);
            }),
          );
        } else
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
        const placement = imagePlacement(layer, image.width, image.height, w, h);
        if (layer.perspective) {
          const local = createCanvas(Math.ceil(w), Math.ceil(h));
          local.getContext('2d').drawImage(image, ...placement.crop, ...placement.destination);
          ctx.drawImage(perspectiveImage(local, layer.perspective), 0, 0, w, h);
        } else ctx.drawImage(image, ...placement.crop, ...placement.destination);
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
        ctx.save();
        if (tile.space === 'layer' || options.canvasTransform)
          ctx.setTransform(...coordinates(tile, node));
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tc, ...tile.bounds);
        ctx.restore();
      }
      for (const op of layer.operations)
        applyRasterOperation(
          canvas,
          operation(op),
          lookup,
          coordinates(op, node),
          op.mask ? coordinates(op.mask, node) : undefined,
        );
      for (const region of layer.regions ?? [])
        renderDetail(canvas, region, node, lookup, assets.images, options.canvasTransform);
      if (layer.mask) {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(
          maskCanvas(
            printableMask(layer.mask),
            width,
            height,
            lookup,
            coordinates(layer.mask, node),
          ),
          0,
          0,
        );
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
      if (options.cache !== false) this.remember(key, canvas, text.slice(textStart));
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
      statistics: { ...statistics, cache_bytes: this.cacheBytes },
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
          ...(options.canvasTransform ? { canvas_transform: options.canvasTransform } : {}),
          ...(options.excludeLayers?.length ? { excluded_layers: options.excludeLayers } : {}),
        },
      },
    };
  }
}
export const defaultRenderer: Renderer = new SkiaRenderer();
