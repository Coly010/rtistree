import {
  flattenLayers,
  type Scene,
  type Bounds,
  type Mask,
  type RasterOperation,
} from './schema.js';
import { resolveLayout, flattenResolved } from './layout.js';
/** Safe fast path for pointwise composition. Context filters retain the full-render path. */
export function viewportScene(scene: Scene, bounds: Bounds): Scene | null {
  const all = flattenLayers(scene.layers);
  // Skia may choose a different antialiasing path when curves are clipped by a
  // smaller device. Use the original device for those scenes to keep exact bytes.
  if (
    all.some(
      (l) =>
        l.transform ||
        l.source ||
        (l.shape && (l.shape.type !== 'rectangle' || l.shape.radius !== 0 || l.shape.stroke)) ||
        (l.mask && l.mask.type !== 'rectangle' && l.mask.type !== 'semantic-object') ||
        l.operations.some(
          (op) =>
            op.type === 'paintStroke' ||
            op.type === 'eraseStroke' ||
            (op.mask && op.mask.type !== 'rectangle' && op.mask.type !== 'semantic-object'),
        ),
    )
  )
    return null;
  if (flattenResolved(resolveLayout(scene)).some((n) => n.bounds.some((v) => !Number.isInteger(v))))
    return null;
  if (
    all.some(
      (l) =>
        l.effects.length ||
        (l.regions?.length ?? 0) > 0 ||
        l.mask?.feather ||
        l.operations.some(
          (op) =>
            op.type === 'blur' ||
            op.type === 'noise' ||
            op.mask?.feather ||
            ((op.type === 'paintStroke' || op.type === 'eraseStroke') && op.hardness < 1),
        ),
    )
  )
    return null;
  const [x, y, w, h] = bounds,
    result = structuredClone(scene),
    roots = resolveLayout(scene);
  const move = (b: Bounds): Bounds => [b[0] - x, b[1] - y, b[2], b[3]];
  const mask = (m: Mask | undefined) => {
    if (!m || m.space === 'layer') return;
    if ('bounds' in m) m.bounds = move(m.bounds);
    if (m.type === 'polygon') m.points = m.points.map(([px, py]) => [px - x, py - y]);
  };
  for (const layer of flattenLayers(result.layers)) {
    mask(layer.mask);
    for (const op of layer.operations) {
      mask(op.mask);
      if (op.space === 'layer') continue;
      op.bounds = move(op.bounds);
      if ('path' in op) op.path = op.path.map(([px, py]) => [px - x, py - y]);
      if (op.type === 'setPixels')
        op.pixels = op.pixels.map((p) => ({ ...p, x: p.x - x, y: p.y - y }));
    }
    for (const tile of layer.tiles) if (tile.space !== 'layer') tile.bounds = move(tile.bounds);
  }
  result.layers.forEach((layer, i) => {
    layer.bounds = move(roots[i]!.bounds);
    layer.anchor = 'top-left';
    delete layer.width;
    delete layer.height;
    delete layer.aspect_ratio;
    delete layer.grow;
  });
  result.canvas.width = w;
  result.canvas.height = h;
  result.verification.rules = [];
  return result;
}
