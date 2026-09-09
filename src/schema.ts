import { documentSchema } from './document.js';
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
export const coordinateSchema = {
  space: z.enum(['canvas', 'layer']).optional(),
  reference_size: z.tuple([positive, positive]).optional(),
};
const basicMaskSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('path'),
    d: z.string().min(1).max(100000),
    ...coordinateSchema,
    feather: finite.min(0).max(128).default(0),
    expand: finite.min(-128).max(128).optional(),
    invert: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal('rectangle'),
    bounds: boundsSchema,
    ...coordinateSchema,
    expand: finite.min(-128).max(128).optional(),
    invert: z.boolean().optional(),
    feather: finite.min(0).max(128).default(0),
  }),
  z.strictObject({
    type: z.literal('ellipse'),
    bounds: boundsSchema,
    ...coordinateSchema,
    expand: finite.min(-128).max(128).optional(),
    invert: z.boolean().optional(),
    feather: finite.min(0).max(128).default(0),
  }),
  z.strictObject({
    type: z.literal('polygon'),
    points: z.array(pointSchema).min(3).max(4096),
    ...coordinateSchema,
    expand: finite.min(-128).max(128).optional(),
    invert: z.boolean().optional(),
    feather: finite.min(0).max(128).default(0),
  }),
  z.strictObject({
    type: z.literal('semantic-object'),
    target: idSchema,
    ...coordinateSchema,
    expand: finite.min(-128).max(128).optional(),
    invert: z.boolean().optional(),
    feather: finite.min(0).max(128).default(0),
  }),
]);
export type Mask =
  | z.infer<typeof basicMaskSchema>
  | {
      type: 'combine';
      operation: 'union' | 'intersect' | 'subtract' | 'xor';
      masks: Mask[];
      space?: 'canvas' | 'layer';
      reference_size?: [number, number];
      feather: number;
      expand?: number;
      invert?: boolean;
    }
  | {
      type: 'image';
      source: string;
      bounds: Bounds;
      channel: 'alpha' | 'luma' | 'colour';
      colour?: string;
      tolerance: number;
      space?: 'canvas' | 'layer';
      reference_size?: [number, number];
      feather: number;
      expand?: number;
      invert?: boolean;
    };
export const maskSchema: z.ZodType<Mask> = z.lazy(() =>
  z.union([
    basicMaskSchema,
    z.strictObject({
      type: z.literal('combine'),
      operation: z.enum(['union', 'intersect', 'subtract', 'xor']),
      masks: z.array(maskSchema).min(2).max(16),
      ...coordinateSchema,
      feather: finite.min(0).max(128).default(0),
      expand: finite.min(-128).max(128).optional(),
      invert: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal('image'),
      source: idSchema,
      bounds: boundsSchema,
      channel: z.enum(['alpha', 'luma', 'colour']).default('luma'),
      colour: colourSchema.optional(),
      tolerance: unit.default(0.1),
      ...coordinateSchema,
      feather: finite.min(0).max(128).default(0),
      expand: finite.min(-128).max(128).optional(),
      invert: z.boolean().optional(),
    }),
  ]),
);
export function flattenMasks(mask: Mask | undefined): Mask[] {
  return mask ? [mask, ...(mask.type === 'combine' ? mask.masks.flatMap(flattenMasks) : [])] : [];
}
export function layerMasks(layer: Layer): Mask[] {
  return [
    layer.mask,
    ...layer.operations.map((o) => o.mask),
    ...(layer.regions ?? []).flatMap((r) => r.operations.map((o) => o.mask)),
  ].flatMap(flattenMasks);
}

const scope = { ...coordinateSchema, bounds: boundsSchema, mask: maskSchema.optional() };
export const rasterOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('levels'),
    ...scope,
    black: unit.default(0),
    white: unit.default(1),
    gamma: finite.min(0.1).max(10).default(1),
  }),
  z.strictObject({
    type: z.literal('curves'),
    ...scope,
    channel: z.enum(['rgb', 'r', 'g', 'b']).default('rgb'),
    points: z
      .array(z.tuple([unit, unit]))
      .min(2)
      .max(32),
  }),
  z.strictObject({
    type: z.literal('whiteBalance'),
    ...scope,
    temperature: finite.min(-1).max(1),
    tint: finite.min(-1).max(1).default(0),
  }),
  z.strictObject({
    type: z.literal('clone'),
    ...scope,
    source_offset: pointSchema,
    opacity: unit.default(1),
  }),
  z.strictObject({
    type: z.literal('heal'),
    ...scope,
    source_offset: pointSchema,
    opacity: unit.default(1),
  }),

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
export const rasterRegionSchema = z.strictObject({
  id: idSchema,
  ...coordinateSchema,
  bounds: boundsSchema,
  scale: z.number().int().min(1).max(4).default(2),
  source: idSchema.optional(),
  composite: z.enum(['replace', 'over']).optional(),
  operations: z.array(rasterOperationSchema).max(256).default([]),
});
export type RasterRegion = z.infer<typeof rasterRegionSchema>;
export const effectSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('blur'), radius: finite.min(0).max(128) }),
]);
export const styleSchema = z.strictObject({
  font: idSchema.default('inter'),
  size: finite.positive().max(1024).default(32),
  weight: z.enum(['regular', 'bold']).default('regular'),
  colour: colourSchema.default('#ffffff'),
  line_height: finite.positive().max(5).default(1.2),
  align: z.enum(['left', 'center', 'right']).default('left'),
  tracking: finite.min(-20).max(200).optional(),
  kerning: z.boolean().optional(),
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
    ...coordinateSchema,
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
const strokeOptions = {
  line_cap: z.enum(['butt', 'round', 'square']).optional(),
  line_join: z.enum(['miter', 'round', 'bevel']).optional(),
  dash: z.array(finite.min(0).max(10000)).max(32).optional(),
  dash_offset: finite.optional(),
};
export const shapeSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('rectangle'),
    fill: colourSchema,
    radius: finite.min(0).max(4096).default(0),
    stroke: colourSchema.optional(),
    stroke_width: finite.min(0).max(256).default(1),
    ...strokeOptions,
  }),
  z.strictObject({
    type: z.literal('ellipse'),
    fill: colourSchema,
    stroke: colourSchema.optional(),
    stroke_width: finite.min(0).max(256).default(1),
    ...strokeOptions,
  }),
  z.strictObject({
    type: z.literal('path'),
    d: z.string().min(1).max(100000),
    fill: colourSchema,
    stroke: colourSchema.optional(),
    stroke_width: finite.min(0).max(256).default(1),
    ...strokeOptions,
  }),
]);
const dimension = z.union([positive, z.string().regex(/^(?:100|\d{1,2})(?:\.\d+)?%$/)]);
export const layoutSchema = z.strictObject({
  type: z.enum(['absolute', 'horizontal', 'vertical']).default('absolute'),
  justify: z.enum(['start', 'center', 'end', 'space-between']).optional(),
  padding: finite.min(0).max(4096).default(0),
  gap: finite.min(0).max(4096).default(0),
  align: z.enum(['start', 'center', 'end']).default('start'),
});
export const assetSchema = z.strictObject({
  recipe: z
    .strictObject({ source: z.string().min(1), hash: z.string().regex(/^sha256:[a-f0-9]{64}$/) })
    .optional(),
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
  aspect_ratio: finite.positive().max(100).optional(),
  grow: finite.min(0).max(100).optional(),
  height: dimension.optional(),
  anchor: z
    .enum(['top-left', 'center', 'top-right', 'bottom-left', 'bottom-right'])
    .default('top-left'),
  affine: z.tuple([finite, finite, finite, finite, finite, finite]).optional(),
  transform: z
    .strictObject({
      rotation: finite.default(0),
      scale: z.tuple([finite.positive().max(100), finite.positive().max(100)]).default([1, 1]),
    })
    .optional(),
  layout: layoutSchema.optional(),
  shape: shapeSchema.optional(),
  content: z.string().max(50000).optional(),
  runs: z
    .array(
      z.strictObject({
        text: z.string(),
        colour: colourSchema.optional(),
        weight: z.enum(['regular', 'bold']).optional(),
      }),
    )
    .max(256)
    .optional(),
  paragraph_style: idSchema.optional(),
  crop: boundsSchema.optional(),
  focal_point: z.tuple([unit, unit]).optional(),
  perspective: z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]).optional(),
  style: styleSchema.optional(),
  source: idSchema.optional(),
  fit: z.enum(['contain', 'cover', 'stretch']).default('contain'),
  generator: generatorSchema.optional(),
  mask: maskSchema.optional(),
  effects: z.array(effectSchema).max(16).default([]),
  operations: z.array(rasterOperationSchema).max(1000).default([]),
  regions: z.array(rasterRegionSchema).max(256).optional(),
  tiles: z.array(paletteSchema).max(4096).default([]),
  get children() {
    return z.array(layerSchema).max(256).default([]);
  },
});
export type Layer = z.infer<typeof layerSchema>;
export const ruleSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('pixel-contrast'),
    target: idSchema,
    minimum: finite.min(1).max(21).default(4.5),
    percentile: unit.default(0.1),
  }),
  z.strictObject({ type: z.literal('visible-area'), target: idSchema, minimum: unit.default(0.5) }),

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
export const fontSchema = z.strictObject({
  source: z.string().min(1),
  hash: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .optional(),
});
export const sceneSchema = z.strictObject({
  version: z.literal(1),
  canvas: z.strictObject({
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
    colour_space: z.literal('srgb').default('srgb'),
    background: colourSchema.default('#00000000'),
  }),
  document: documentSchema.optional(),
  paragraph_styles: z.record(idSchema, styleSchema).optional(),
  fonts: z.record(idSchema, fontSchema).optional(),
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
  const authored = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const styles = authored.paragraph_styles as Record<string, unknown> | undefined;
  const expandStyles = (raw: unknown): unknown => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const l = raw as Record<string, unknown>;
    return {
      ...l,
      ...(typeof l.paragraph_style === 'string' && styles?.[l.paragraph_style]
        ? { style: { ...(styles[l.paragraph_style] as object), ...(l.style as object) } }
        : {}),
      ...(Array.isArray(l.children) ? { children: l.children.map(expandStyles) } : {}),
    };
  };
  const scene = sceneSchema.parse(
    Array.isArray(authored.layers)
      ? { ...authored, layers: authored.layers.map(expandStyles) }
      : input,
  );
  for (const id of Object.keys(scene.fonts ?? {}))
    if (['inter', 'display', 'inter-bold'].includes(id))
      throw new Error('Cannot replace a bundled font name');
  const all = flattenLayers(scene.layers);
  if (all.length > 256) throw new Error('A scene may contain at most 256 layers');
  const ids = new Set<string>();
  for (const layer of all) {
    if (ids.has(layer.id)) throw new Error(`Duplicate layer id: ${layer.id}`);
    ids.add(layer.id);
    if (
      layer.affine &&
      (layer.transform ||
        Math.abs(layer.affine[0] * layer.affine[3] - layer.affine[1] * layer.affine[2]) < 1e-10)
    )
      throw new Error('Affine transforms must be invertible and cannot combine with transform');
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
      crop: ['asset', 'generated-asset', 'raster'],
      focal_point: ['asset', 'generated-asset', 'raster'],
      perspective: ['asset', 'generated-asset', 'raster'],
      runs: ['text'],
      paragraph_style: ['text'],
    };
    for (const [field, types] of Object.entries(fieldTypes))
      if (layer[field as keyof Layer] !== undefined && !types.includes(layer.type))
        throw new Error(`${layer.id}: ${field} is not valid on a ${layer.type} layer`);
    if (
      layer.type === 'adjustment' &&
      (layer.effects.length ||
        layer.tiles.length ||
        (layer.regions?.length ?? 0) ||
        layer.blend_mode !== 'normal' ||
        layer.transform)
    )
      throw new Error(`${layer.id}: adjustment layers support operations, masks and opacity only`);
    if (layer.type === 'text') {
      if (layer.paragraph_style && !scene.paragraph_styles?.[layer.paragraph_style])
        throw new Error('Unknown paragraph style');
      layer.style = styleSchema.parse({
        ...scene.paragraph_styles?.[layer.paragraph_style ?? ''],
        ...layer.style,
      });
      if (layer.runs && layer.runs.map((r) => r.text).join('') !== layer.content)
        throw new Error('Rich text runs must concatenate exactly to content');
      if (
        !['inter', 'display'].includes(layer.style.font) &&
        !Object.hasOwn(scene.fonts ?? {}, layer.style.font)
      )
        throw new Error(`Unknown font: ${layer.style.font}`);
    }
    const regionIds = new Set<string>();
    for (const region of layer.regions ?? []) {
      if (regionIds.has(region.id)) throw new Error('Duplicate region id');
      regionIds.add(region.id);
      if (region.source && !Object.hasOwn(scene.assets, region.source))
        throw new Error(`Unknown region asset: ${region.source}`);
    }
    if (layer.source && !Object.hasOwn(scene.assets, layer.source))
      throw new Error(`Unknown asset: ${layer.source}`);
  }
  for (const layer of all)
    for (const mask of layerMasks(layer))
      if (
        mask?.type === 'semantic-object' &&
        all.find((target) => target.id === mask.target)?.type === 'adjustment'
      )
        throw new Error('An adjustment layer cannot be used as a semantic alpha mask');
  for (const layer of all) {
    const validateMaskFrame = (mask: Mask | undefined, inherited?: 'canvas' | 'layer') => {
      if (!mask) return;
      const space = mask.space ?? inherited ?? 'canvas';
      if (inherited && mask.space && mask.space !== inherited)
        throw new Error(
          'Combined masks must use one coordinate space; nested masks inherit the parent space',
        );
      if (inherited && mask.reference_size)
        throw new Error('Specify reference_size on the outer combined mask only');
      if (mask.type === 'combine') for (const child of mask.masks) validateMaskFrame(child, space);
    };
    for (const mask of [
      layer.mask,
      ...layer.operations.map((o) => o.mask),
      ...(layer.regions ?? []).flatMap((r) => r.operations.map((o) => o.mask)),
    ])
      validateMaskFrame(mask);
    for (const m of layerMasks(layer)) {
      if (m.type === 'image' && !scene.assets[m.source]) throw new Error('Unknown mask asset');
      if (m.type === 'image' && m.channel === 'colour' && !m.colour)
        throw new Error('Colour-range mask requires colour');
    }
    for (const op of [...layer.operations, ...(layer.regions ?? []).flatMap((r) => r.operations)]) {
      if (op.type === 'levels' && op.black >= op.white)
        throw new Error('Levels black must be less than white');
      if (
        op.type === 'curves' &&
        (op.points[0]![0] !== 0 ||
          op.points.at(-1)![0] !== 1 ||
          op.points.some((p, i) => i > 0 && p[0] <= op.points[i - 1]![0]))
      )
        throw new Error('Curve input knots must increase from 0 to 1');
    }
  }
  const edges = new Map(
    all.map((layer) => [
      layer.id,
      [
        ...layer.children.map((child) => child.id),
        ...layerMasks(layer).flatMap((mask) =>
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
