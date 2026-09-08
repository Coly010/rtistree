import { z } from 'zod';

const finite = z.number().finite();
const positive = finite.positive().max(8192);
export const pointSchema = z.tuple([finite, finite]);
export const boundsSchema = z.tuple([finite, finite, positive, positive]);
export type Bounds = z.infer<typeof boundsSchema>;
export const colourSchema = z
  .string()
  .regex(/^#(?:[\da-fA-F]{6}|[\da-fA-F]{8})$/, 'Use #RRGGBB or #RRGGBBAA');
const idSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/);
const unit = finite.min(0).max(1);
export const blendSchema = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'difference',
  'soft-light',
  'hard-light',
]);
export const maskSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('rectangle'),
    bounds: boundsSchema,
    feather: finite.min(0).max(128).default(0),
  }),
  z.strictObject({
    type: z.literal('ellipse'),
    bounds: boundsSchema,
    feather: finite.min(0).max(128).default(0),
  }),
  z.strictObject({
    type: z.literal('polygon'),
    points: z.array(pointSchema).min(3).max(4096),
    feather: finite.min(0).max(128).default(0),
  }),
  z.strictObject({
    type: z.literal('semantic-object'),
    target: idSchema,
    feather: finite.min(0).max(128).default(0),
  }),
]);
export type Mask = z.infer<typeof maskSchema>;
const scope = { bounds: boundsSchema, mask: maskSchema.optional() };
export const rasterOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('fill'), ...scope, colour: colourSchema }),
  z.strictObject({
    type: z.literal('paintStroke'),
    ...scope,
    path: z.array(pointSchema).min(1).max(4096),
    radius: finite.positive().max(256),
    hardness: unit.default(1),
    colour: colourSchema,
    opacity: unit.default(1),
  }),
  z.strictObject({
    type: z.literal('eraseStroke'),
    ...scope,
    path: z.array(pointSchema).min(1).max(4096),
    radius: finite.positive().max(256),
    hardness: unit.default(1),
    opacity: unit.default(1),
  }),
  z.strictObject({ type: z.literal('brightness'), ...scope, amount: finite.min(-1).max(1) }),
  z.strictObject({ type: z.literal('contrast'), ...scope, amount: finite.min(-1).max(1) }),
  z.strictObject({ type: z.literal('saturation'), ...scope, amount: finite.min(-1).max(1) }),
  z.strictObject({ type: z.literal('hueShift'), ...scope, degrees: finite.min(-360).max(360) }),
  z.strictObject({
    type: z.literal('noise'),
    ...scope,
    amount: unit,
    seed: z.number().int().min(0).max(0xffffffff),
  }),
  z.strictObject({ type: z.literal('blur'), ...scope, radius: finite.min(0).max(128) }),
  z.strictObject({
    type: z.literal('colourReplace'),
    ...scope,
    from: colourSchema,
    to: colourSchema,
    tolerance: unit.default(0),
  }),
  z.strictObject({
    type: z.literal('setPixels'),
    ...scope,
    pixels: z
      .array(z.strictObject({ x: z.number().int(), y: z.number().int(), colour: colourSchema }))
      .max(4096),
  }),
]);
export type RasterOperation = z.infer<typeof rasterOperationSchema>;
export const effectSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('blur'), radius: finite.min(0).max(128) }),
]);
export const styleSchema = z.strictObject({
  font: z.enum(['inter', 'display']).default('inter'),
  size: finite.positive().max(1024).default(32),
  weight: z.enum(['regular', 'bold']).default('regular'),
  colour: colourSchema.default('#ffffff'),
  line_height: finite.positive().max(5).default(1.2),
  align: z.enum(['left', 'center', 'right']).default('left'),
});
export const generatorSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('solid'), colour: colourSchema }),
  z.strictObject({
    type: z.literal('gradient'),
    from: colourSchema,
    to: colourSchema,
    angle: finite.default(90),
  }),
  z.strictObject({
    type: z.literal('noise'),
    seed: z.number().int().min(0).max(0xffffffff),
    amount: unit,
    colour: colourSchema.default('#808080'),
  }),
]);
export const paletteSchema = z
  .strictObject({
    bounds: boundsSchema,
    palette: z.record(z.string().length(1), colourSchema),
    pixels: z.array(z.string().min(1).max(256)).min(1).max(256),
  })
  .superRefine((tile, ctx) => {
    if (tile.pixels.some((row) => row.length !== tile.pixels[0]!.length))
      ctx.addIssue({ code: 'custom', message: 'Palette rows must have equal widths' });
    for (const key of new Set(tile.pixels.join('')))
      if (!(key in tile.palette))
        ctx.addIssue({ code: 'custom', message: `Missing palette colour: ${key}` });
  });
export const shapeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('rectangle'),
    fill: colourSchema,
    radius: finite.min(0).max(4096).default(0),
    stroke: colourSchema.optional(),
    stroke_width: finite.min(0).max(256).default(1),
  }),
  z.strictObject({
    type: z.literal('ellipse'),
    fill: colourSchema,
    stroke: colourSchema.optional(),
    stroke_width: finite.min(0).max(256).default(1),
  }),
  z.strictObject({
    type: z.literal('path'),
    d: z.string().min(1).max(100000),
    fill: colourSchema,
    stroke: colourSchema.optional(),
    stroke_width: finite.min(0).max(256).default(1),
  }),
]);
const dimension = z.union([positive, z.string().regex(/^(?:100|\d{1,2})(?:\.\d+)?%$/)]);
export const layoutSchema = z.strictObject({
  type: z.enum(['absolute', 'horizontal', 'vertical']).default('absolute'),
  padding: finite.min(0).max(4096).default(0),
  gap: finite.min(0).max(4096).default(0),
  align: z.enum(['start', 'center', 'end']).default('start'),
});
export const assetSchema = z.strictObject({
  type: z.enum(['image', 'generated-image']).default('image'),
  source: z.string().min(1).max(2048),
  hash: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional(),
});

// Recursion stays in the document; graphics algorithms consume resolved nodes.
export const layerSchema = z.strictObject({
  id: idSchema,
  name: z.string().max(256).optional(),
  role: z.string().max(80).optional(),
  type: z.enum([
    'group',
    'vector',
    'text',
    'asset',
    'generated-asset',
    'procedural',
    'raster',
    'adjustment',
  ]),
  visible: z.boolean().default(true),
  opacity: unit.default(1),
  blend_mode: blendSchema.default('normal'),
  z: finite.default(0),
  bounds: boundsSchema.optional(),
  width: dimension.optional(),
  height: dimension.optional(),
  anchor: z
    .enum(['top-left', 'center', 'top-right', 'bottom-left', 'bottom-right'])
    .default('top-left'),
  transform: z
    .strictObject({
      rotation: finite.default(0),
      scale: z.tuple([finite.positive().max(100), finite.positive().max(100)]).default([1, 1]),
    })
    .optional(),
  layout: layoutSchema.optional(),
  shape: shapeSchema.optional(),
  content: z.string().max(50000).optional(),
  style: styleSchema.optional(),
  source: idSchema.optional(),
  fit: z.enum(['contain', 'cover', 'stretch']).default('contain'),
  generator: generatorSchema.optional(),
  mask: maskSchema.optional(),
  effects: z.array(effectSchema).max(16).default([]),
  operations: z.array(rasterOperationSchema).max(1000).default([]),
  tiles: z.array(paletteSchema).max(4096).default([]),
  get children() {
    return z.array(layerSchema).max(256).default([]);
  },
});
export type Layer = z.infer<typeof layerSchema>;
export const ruleSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('region-luma'),
    bounds: boundsSchema,
    minimum: unit.default(0),
    maximum: unit.default(1),
  }),
  z.strictObject({ type: z.literal('safe-area'), target: idSchema, minimum: finite.min(0) }),
  z.strictObject({ type: z.literal('text-overflow'), target: idSchema }),
  z.strictObject({ type: z.literal('text-equals'), target: idSchema, expected: z.string() }),
  z.strictObject({ type: z.literal('required-role'), role: z.string() }),
  z.strictObject({
    type: z.literal('contrast'),
    target: idSchema,
    against: colourSchema,
    minimum: finite.min(1).max(21).default(4.5),
  }),
  z.strictObject({ type: z.literal('no-overlap'), target: idSchema, other: idSchema }),
]);
export const sceneSchema = z.strictObject({
  version: z.literal(1),
  canvas: z.strictObject({
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
    colour_space: z.literal('srgb').default('srgb'),
    background: colourSchema.default('#00000000'),
  }),
  metadata: z.record(z.string(), z.json()).default({}),
  assets: z.record(idSchema, assetSchema).default({}),
  layers: z.array(layerSchema).max(256),
  verification: z
    .strictObject({ rules: z.array(ruleSchema).max(256).default([]) })
    .default({ rules: [] }),
});
export type Scene = z.infer<typeof sceneSchema>;

export function flattenLayers(layers: Layer[]): Layer[] {
  return layers.flatMap((layer) => [layer, ...flattenLayers(layer.children)]);
}

export function parseScene(input: unknown): Scene {
  const scene = sceneSchema.parse(input);
  const all = flattenLayers(scene.layers);
  if (all.length > 256) throw new Error('A scene may contain at most 256 layers');
  const ids = new Set<string>();
  for (const layer of all) {
    if (ids.has(layer.id)) throw new Error(`Duplicate layer id: ${layer.id}`);
    ids.add(layer.id);
    if (layer.type !== 'group' && layer.children.length)
      throw new Error(`Only group layers can have children: ${layer.id}`);
    const required = (
      {
        vector: 'shape',
        text: 'content',
        asset: 'source',
        'generated-asset': 'source',
        procedural: 'generator',
      } as Partial<Record<Layer['type'], keyof Layer>>
    )[layer.type];
    if (required && layer[required] === undefined)
      throw new Error(`${layer.id}: ${layer.type} requires ${required}`);
    const fieldTypes: Partial<Record<keyof Layer, Layer['type'][]>> = {
      shape: ['vector'],
      content: ['text'],
      style: ['text'],
      generator: ['procedural'],
      source: ['asset', 'generated-asset', 'raster'],
      layout: ['group'],
    };
    for (const [field, types] of Object.entries(fieldTypes))
      if (layer[field as keyof Layer] !== undefined && !types.includes(layer.type))
        throw new Error(`${layer.id}: ${field} is not valid on a ${layer.type} layer`);
    if (
      layer.type === 'adjustment' &&
      (layer.effects.length ||
        layer.tiles.length ||
        layer.blend_mode !== 'normal' ||
        layer.transform)
    )
      throw new Error(`${layer.id}: adjustment layers support operations, masks and opacity only`);
    if (layer.type === 'text') layer.style = styleSchema.parse(layer.style ?? {});
    if (layer.source && !Object.hasOwn(scene.assets, layer.source))
      throw new Error(`Unknown asset: ${layer.source}`);
  }
  for (const layer of all)
    for (const mask of [layer.mask, ...layer.operations.map((op) => op.mask)])
      if (
        mask?.type === 'semantic-object' &&
        all.find((target) => target.id === mask.target)?.type === 'adjustment'
      )
        throw new Error('An adjustment layer cannot be used as a semantic alpha mask');
  const edges = new Map(
    all.map((layer) => [
      layer.id,
      [
        ...layer.children.map((child) => child.id),
        ...[layer.mask, ...layer.operations.map((op) => op.mask)].flatMap((mask) =>
          mask?.type === 'semantic-object' ? [mask.target] : [],
        ),
      ],
    ]),
  );
  const done = new Set<string>(),
    active = new Set<string>();
  function visit(id: string) {
    if (!ids.has(id)) throw new Error(`Unknown mask target: ${id}`);
    if (active.has(id)) throw new Error(`Cyclic layer/mask dependency: ${id}`);
    if (done.has(id)) return;
    active.add(id);
    for (const next of edges.get(id)!) visit(next);
    active.delete(id);
    done.add(id);
  }
  for (const id of ids) visit(id);
  for (const rule of scene.verification.rules) {
    if (rule.type === 'region-luma') {
      const [x, y, w, h] = rule.bounds;
      if (
        x < 0 ||
        y < 0 ||
        x + w > scene.canvas.width ||
        y + h > scene.canvas.height ||
        rule.minimum > rule.maximum
      )
        throw new Error('Region luma rules need bounds inside the canvas and minimum <= maximum');
    }
    if ('target' in rule && !ids.has(rule.target))
      throw new Error(`Unknown verification target: ${rule.target}`);
    if ('other' in rule && !ids.has(rule.other))
      throw new Error(`Unknown verification target: ${rule.other}`);
  }
  return scene;
}
