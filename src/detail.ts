import { createCanvas, type Canvas, type Image } from './native.js';
import { multiply, type ResolvedLayer, type Matrix } from './layout.js';
import { coordinateMatrix, inverse, worldScope } from './spatial.js';
import { applyRasterOperation, pixelBounds } from './paint.js';
import type { RasterRegion } from './schema.js';

/** Supersample only promoted patches. The semantic surface stays the source. */
export function renderDetail(
  surface: Canvas,
  region: RasterRegion,
  node: ResolvedLayer,
  lookup: (id: string) => Canvas,
  images: Map<string, Image>,
  canvasTransform?: Matrix,
): void {
  if (!region.operations.length && !region.source) return;
  const [x, y, w, h] = region.bounds,
    scale = region.scale;
  const matrix = multiply(
    region.space === 'layer'
      ? coordinateMatrix(region, node)
      : (canvasTransform ?? coordinateMatrix(region, node)),
    [1, 0, 0, 1, x, y],
  );
  const rw = Math.ceil(w * scale),
    rh = Math.ceil(h * scale);
  if (rw * rh > 16 * 1024 * 1024) throw new Error('Promoted region exceeds 16 megapixels');
  const patch = createCanvas(rw, rh),
    ctx = patch.getContext('2d');
  const toPatch = multiply([scale, 0, 0, scale, 0, 0], inverse(matrix));
  ctx.setTransform(...toPatch);
  ctx.drawImage(surface, 0, 0);
  ctx.resetTransform();
  if (region.source) {
    if (region.composite !== 'over') ctx.clearRect(0, 0, rw, rh);
    ctx.drawImage(images.get(region.source)!, 0, 0, rw, rh);
  }
  const localLookup = (id: string) => {
    const c = createCanvas(rw, rh),
      cc = c.getContext('2d');
    cc.setTransform(...toPatch);
    cc.drawImage(lookup(id), 0, 0);
    return c;
  };
  for (const op of region.operations)
    applyRasterOperation(
      patch,
      {
        ...op,
        space: 'layer',
        ...(op.mask
          ? { mask: { ...op.mask, space: op.mask.type === 'semantic-object' ? 'canvas' : 'layer' } }
          : {}),
      },
      localLookup,
      [scale, 0, 0, scale, 0, 0],
      [scale, 0, 0, scale, 0, 0],
    );
  const edited = createCanvas(surface.width, surface.height),
    out = edited.getContext('2d');
  out.drawImage(surface, 0, 0);
  out.setTransform(...matrix);
  out.beginPath();
  out.rect(0, 0, w, h);
  out.clip();
  out.clearRect(0, 0, w, h);
  out.drawImage(patch, 0, 0, w, h);
  const bounds = pixelBounds(worldScope([0, 0, w, h], matrix), surface.width, surface.height);
  if (bounds)
    surface.getContext('2d').putImageData(out.getImageData(...bounds), bounds[0], bounds[1]);
}
