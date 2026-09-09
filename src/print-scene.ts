import { parseScene, flattenLayers, layerMasks, type Scene } from './schema.js';
import { documentGeometry } from './document.js';
import type { Matrix } from './layout.js';
/** Scale geometry through an outer transform; preserve source pixels and edit coordinates. */
export function printScene(input: Scene, ppi?: number) {
  if (!input.document) throw new Error('A physical document is required for print export');
  const document = { ...input.document, ppi: ppi ?? input.document.ppi },
    geometry = documentGeometry(document);
  if (
    Math.abs(input.canvas.width / input.canvas.height - geometry.trim_mm[0] / geometry.trim_mm[1]) >
    0.002
  )
    throw new Error('Canvas and physical trim aspect ratios disagree');
  const scale = (geometry.trim_mm[0] * document.ppi) / 25.4 / input.canvas.width,
    bleed = (geometry.bleed_mm * document.ppi) / 25.4;
  const source = structuredClone(input),
    ids = new Set(flattenLayers(source.layers).map((l) => l.id));
  let wrapper = 'printFrame';
  while (ids.has(wrapper)) wrapper += 'x';
  for (const l of flattenLayers(source.layers)) {
    for (const effect of l.effects) effect.radius *= scale;
    for (const mask of layerMasks(l)) {
      mask.feather *= scale;
      if (mask.expand) mask.expand *= scale;
    }
    for (const op of l.operations) if (op.type === 'blur') op.radius *= scale;
  }
  const canvasTransform: Matrix = [scale, 0, 0, scale, bleed, bleed];
  const scene = parseScene({
    ...source,
    canvas: { ...source.canvas, width: geometry.pixels[0], height: geometry.pixels[1] },
    layers: [
      {
        id: wrapper,
        type: 'group',
        bounds: [0, 0, input.canvas.width, input.canvas.height],
        affine: canvasTransform,
        children: source.layers,
      },
    ],
    verification: { rules: [] },
  });
  // Unbounded procedural backgrounds actually paint into the bleed, without changing their trim geometry.
  for (const layer of scene.layers[0]!.children)
    if (layer.type === 'procedural' && !layer.bounds && !layer.width && !layer.height) {
      layer.bounds = [
        -bleed / scale,
        -bleed / scale,
        geometry.pixels[0] / scale,
        geometry.pixels[1] / scale,
      ];
    }
  return { scene, geometry, scale, bleed, document, options: { canvasTransform } };
}
