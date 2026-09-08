import { coordinateMatrix, worldScope, type Coordinates } from './spatial.js';
import { z } from 'zod';
import { resolveLayout, flattenResolved } from './layout.js';
import {
  fontSchema,
  assetSchema,
  rasterRegionSchema,
  shapeSchema,
  maskSchema,
  layoutSchema,
  generatorSchema,
  ruleSchema,
  blendSchema,
  boundsSchema,
  effectSchema,
  flattenLayers,
  layerSchema,
  paletteSchema,
  parseScene,
  rasterOperationSchema,
  styleSchema,
  type Layer,
  type Scene,
} from './schema.js';

const target = { target: z.string() };
const stylePatchSchema = z.strictObject({
  font: styleSchema.shape.font.removeDefault().optional(),
  size: styleSchema.shape.size.removeDefault().optional(),
  weight: styleSchema.shape.weight.removeDefault().optional(),
  colour: styleSchema.shape.colour.removeDefault().optional(),
  line_height: styleSchema.shape.line_height.removeDefault().optional(),
  align: styleSchema.shape.align.removeDefault().optional(),
});
const geometryPatchSchema = z.strictObject({
  bounds: layerSchema.shape.bounds,
  width: layerSchema.shape.width,
  height: layerSchema.shape.height,
  anchor: layerSchema.shape.anchor.removeDefault().optional(),
  aspect_ratio: layerSchema.shape.aspect_ratio,
  grow: layerSchema.shape.grow,
});

export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('registerFont'), id: z.string(), font: fontSchema }),
  z.strictObject({ type: z.literal('removeFont'), id: z.string() }),
  z.strictObject({ type: z.literal('promoteRegion'), ...target, region: rasterRegionSchema }),
  z.strictObject({ type: z.literal('updateRegion'), ...target, region: rasterRegionSchema }),
  z.strictObject({ type: z.literal('demoteRegion'), ...target, id: z.string() }),

  z.strictObject({ type: z.literal('registerAsset'), id: z.string(), asset: assetSchema }),
  z.strictObject({ type: z.literal('removeAsset'), id: z.string() }),
  z.strictObject({ type: z.literal('setShape'), ...target, shape: shapeSchema }),
  z.strictObject({ type: z.literal('setGenerator'), ...target, generator: generatorSchema }),
  z.strictObject({
    type: z.literal('setTransform'),
    ...target,
    transform: layerSchema.shape.transform.unwrap().nullable(),
  }),
  z.strictObject({ type: z.literal('setMask'), ...target, mask: maskSchema.nullable() }),
  z.strictObject({ type: z.literal('setLayout'), ...target, layout: layoutSchema.nullable() }),
  z.strictObject({ type: z.literal('setGeometry'), ...target, geometry: geometryPatchSchema }),
  z.strictObject({
    type: z.literal('setSource'),
    ...target,
    source: z.string(),
    fit: layerSchema.shape.fit.removeDefault().optional(),
  }),
  z.strictObject({ type: z.literal('setVisibility'), ...target, visible: z.boolean() }),
  z.strictObject({ type: z.literal('setRole'), ...target, role: z.string().nullable() }),
  z.strictObject({ type: z.literal('setZ'), ...target, z: z.number().finite() }),
  z.strictObject({ type: z.literal('setVerification'), rules: z.array(ruleSchema).max(256) }),
  z.strictObject({
    type: z.literal('updateEffect'),
    ...target,
    index: z.number().int().min(0),
    effect: effectSchema,
  }),
  z.strictObject({ type: z.literal('removeEffect'), ...target, index: z.number().int().min(0) }),
  z.strictObject({
    type: z.literal('updateRasterOperation'),
    ...target,
    index: z.number().int().min(0),
    operation: rasterOperationSchema,
  }),
  z.strictObject({
    type: z.literal('removeRasterOperation'),
    ...target,
    index: z.number().int().min(0),
  }),
  z.strictObject({ type: z.literal('removeTile'), ...target, index: z.number().int().min(0) }),

  z.strictObject({
    type: z.literal('addLayer'),
    layer: layerSchema,
    parent: z.string().optional(),
  }),
  z.strictObject({ type: z.literal('removeLayer'), ...target }),
  z.strictObject({
    type: z.literal('moveLayer'),
    ...target,
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.strictObject({
    type: z.literal('resizeLayer'),
    ...target,
    width: z.number().positive().max(8192),
    height: z.number().positive().max(8192),
  }),
  z.strictObject({ type: z.literal('setOpacity'), ...target, opacity: z.number().min(0).max(1) }),
  z.strictObject({ type: z.literal('setBlendMode'), ...target, blend_mode: blendSchema }),
  z.strictObject({ type: z.literal('setText'), ...target, content: z.string().max(50000) }),
  z.strictObject({ type: z.literal('setStyle'), ...target, style: stylePatchSchema }),
  z.strictObject({ type: z.literal('applyEffect'), ...target, effect: effectSchema }),
  z.strictObject({
    type: z.literal('applyRasterOperation'),
    ...target,
    operation: rasterOperationSchema,
  }),
  z.strictObject({ type: z.literal('replaceTile'), ...target, tile: paletteSchema }),
  z.strictObject({
    type: z.literal('groupLayers'),
    targets: z.array(z.string()).min(1),
    id: z.string(),
    role: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('align'),
    targets: z.array(z.string()).min(1),
    axis: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom']),
  }),
  z.strictObject({
    type: z.literal('distribute'),
    targets: z.array(z.string()).min(3),
    axis: z.enum(['horizontal', 'vertical']),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export const patchSchema = z.strictObject({
  commands: z.array(commandSchema).min(1).max(100),
  reason: z.string().min(1).max(4000),
  expected_hash: z.string().optional(),
});
export type Patch = z.infer<typeof patchSchema>;
export function findLayer(scene: Scene, id: string): Layer {
  const layer = flattenLayers(scene.layers).find((l) => l.id === id);
  if (!layer) throw new Error(`Unknown layer: ${id}`);
  return layer;
}
function container(scene: Scene, id: string): { siblings: Layer[]; parent?: Layer } {
  function search(siblings: Layer[], parent?: Layer): ReturnType<typeof container> | undefined {
    if (siblings.some((l) => l.id === id)) return { siblings, parent };
    for (const l of siblings) {
      const match = search(l.children, l);
      if (match) return match;
    }
  }
  const result = search(scene.layers);
  if (!result) throw new Error(`Unknown layer: ${id}`);
  return result;
}
export function applyCommand(input: Scene, raw: unknown): Scene {
  const command = commandSchema.parse(raw),
    scene = structuredClone(input);
  const layer = 'target' in command ? findLayer(scene, command.target) : undefined;
  const nodes = flattenResolved(resolveLayout(scene));
  function absolute(target: Layer) {
    const box = nodes.find((n) => n.layer.id === target.id)!.bounds;
    const parent = container(scene, target.id).parent;
    if (parent?.layout && parent.layout.type !== 'absolute')
      throw new Error('Move/resize/alignment require an absolute-layout parent');
    target.bounds = [...box];
    target.anchor = 'top-left';
    delete target.width;
    delete target.height;
    return target.bounds;
  }
  function attach<T extends Coordinates>(value: T): T {
    if (value.space === 'layer' && !value.reference_size) {
      const node = nodes.find((n) => n.layer.id === layer!.id)!;
      value.reference_size = [node.bounds[2], node.bounds[3]];
    }
    if ('mask' in value && value.mask) attach(value.mask as Coordinates);
    return value;
  }
  function replaceAt<T>(items: T[], index: number, value?: T) {
    if (index >= items.length) throw new Error(`Index ${index} is out of range`);
    if (value === undefined) items.splice(index, 1);
    else items[index] = value;
  }
  switch (command.type) {
    case 'promoteRegion':
      if (layer!.regions?.some((r) => r.id === command.region.id))
        throw new Error('Region already exists');
      (layer!.regions ??= []).push(attach(command.region));
      break;
    case 'updateRegion': {
      const i = layer!.regions?.findIndex((r) => r.id === command.region.id) ?? -1;
      if (i < 0) throw new Error('Unknown region');
      layer!.regions![i] = attach(command.region);
      break;
    }
    case 'demoteRegion': {
      const i = layer!.regions?.findIndex((r) => r.id === command.id) ?? -1;
      if (i < 0) throw new Error('Unknown region');
      layer!.regions!.splice(i, 1);
      break;
    }
    case 'registerFont':
      (scene.fonts ??= {})[command.id] = command.font;
      break;
    case 'removeFont':
      if (!Object.hasOwn(scene.fonts ?? {}, command.id)) throw new Error('Unknown font');
      delete scene.fonts![command.id];
      break;
    case 'registerAsset':
      scene.assets[command.id] = command.asset;
      break;
    case 'removeAsset':
      if (!Object.hasOwn(scene.assets, command.id)) throw new Error('Unknown asset');
      delete scene.assets[command.id];
      break;
    case 'setShape':
      layer!.shape = command.shape;
      break;
    case 'setGenerator':
      layer!.generator = command.generator;
      break;
    case 'setTransform':
      if (command.transform) layer!.transform = command.transform;
      else delete layer!.transform;
      break;
    case 'setMask':
      if (command.mask) layer!.mask = attach(command.mask);
      else delete layer!.mask;
      break;
    case 'setLayout':
      if (command.layout) layer!.layout = command.layout;
      else delete layer!.layout;
      break;
    case 'setGeometry':
      Object.assign(layer!, command.geometry);
      break;
    case 'setSource':
      layer!.source = command.source;
      if (command.fit) layer!.fit = command.fit;
      break;
    case 'setVisibility':
      layer!.visible = command.visible;
      break;
    case 'setRole':
      if (command.role !== null) layer!.role = command.role;
      else delete layer!.role;
      break;
    case 'setZ':
      layer!.z = command.z;
      break;
    case 'setVerification':
      scene.verification.rules = command.rules;
      break;
    case 'updateEffect':
      replaceAt(layer!.effects, command.index, command.effect);
      break;
    case 'removeEffect':
      replaceAt(layer!.effects, command.index);
      break;
    case 'updateRasterOperation':
      replaceAt(layer!.operations, command.index, attach(command.operation));
      break;
    case 'removeRasterOperation':
      replaceAt(layer!.operations, command.index);
      break;
    case 'removeTile':
      replaceAt(layer!.tiles, command.index);
      break;

    case 'addLayer': {
      const parent = command.parent ? findLayer(scene, command.parent) : undefined;
      if (parent && parent.type !== 'group') throw new Error('Parent must be a group');
      (parent?.children ?? scene.layers).push(command.layer);
      break;
    }
    case 'removeLayer': {
      const { siblings } = container(scene, command.target);
      siblings.splice(
        siblings.findIndex((l) => l.id === command.target),
        1,
      );
      break;
    }
    case 'moveLayer': {
      const b = absolute(layer!);
      b[0] = command.x;
      b[1] = command.y;
      break;
    }
    case 'resizeLayer': {
      const b = absolute(layer!);
      b[2] = command.width;
      b[3] = command.height;
      break;
    }
    case 'setOpacity':
      layer!.opacity = command.opacity;
      break;
    case 'setBlendMode':
      layer!.blend_mode = command.blend_mode;
      break;
    case 'setText':
      if (layer!.type !== 'text') throw new Error('setText requires a text layer');
      layer!.content = command.content;
      break;
    case 'setStyle':
      if (layer!.type !== 'text') throw new Error('setStyle requires a text layer');
      layer!.style = styleSchema.parse({ ...layer!.style, ...command.style });
      break;
    case 'applyEffect':
      layer!.effects.push(command.effect);
      break;
    case 'applyRasterOperation':
      layer!.operations.push(attach(command.operation));
      break;
    case 'replaceTile': {
      attach(command.tile);
      const tileIndex = layer!.tiles.findIndex((t) =>
        t.bounds.every((v, i) => v === command.tile.bounds[i]),
      );
      if (tileIndex >= 0) layer!.tiles[tileIndex] = command.tile;
      else layer!.tiles.push(command.tile);
      break;
    }
    case 'groupLayers': {
      if (new Set(command.targets).size !== command.targets.length)
        throw new Error('Duplicate group targets');
      const { siblings, parent } = container(scene, command.targets[0]!);
      if (command.targets.some((id) => container(scene, id).siblings !== siblings))
        throw new Error('Grouped layers must be siblings');
      if (parent?.layout && parent.layout.type !== 'absolute')
        throw new Error('Grouping requires an absolute-layout parent');
      const selected = siblings.filter((l) => command.targets.includes(l.id));
      for (const selectedLayer of selected) absolute(selectedLayer);
      const parentNode = parent ? nodes.find((n) => n.layer.id === parent.id) : undefined;
      const bounds = [
        0,
        0,
        parentNode?.bounds[2] ?? scene.canvas.width,
        parentNode?.bounds[3] ?? scene.canvas.height,
      ];
      const group = layerSchema.parse({
        id: command.id,
        type: 'group',
        role: command.role,
        bounds,
        z: Math.min(...selected.map((l) => l.z)),
        children: selected,
      });
      const start = siblings.indexOf(selected[0]!);
      for (let i = siblings.length - 1; i >= 0; i--)
        if (command.targets.includes(siblings[i]!.id)) siblings.splice(i, 1);
      siblings.splice(start, 0, group);
      break;
    }
    case 'align':
    case 'distribute': {
      if (new Set(command.targets).size !== command.targets.length)
        throw new Error('Duplicate targets');
      const selected = command.targets.map((id) => findLayer(scene, id)),
        base = container(scene, selected[0]!.id);
      if (selected.some((l) => container(scene, l.id).siblings !== base.siblings))
        throw new Error('Alignment targets must be siblings');
      const boxes = selected.map(absolute);
      if (command.type === 'align') {
        const horizontal = ['left', 'center', 'right'].includes(command.axis),
          p = horizontal ? 0 : 1,
          s = horizontal ? 2 : 3;
        const lo = Math.min(...boxes.map((b) => b[p]!)),
          hi = Math.max(...boxes.map((b) => b[p]! + b[s]!));
        for (const b of boxes)
          b[p] = ['left', 'top'].includes(command.axis)
            ? lo
            : ['right', 'bottom'].includes(command.axis)
              ? hi - b[s]!
              : (lo + hi - b[s]!) / 2;
      } else {
        const p = command.axis === 'horizontal' ? 0 : 1,
          s = p + 2;
        boxes.sort((a, b) => a[p]! - b[p]!);
        const lo = boxes[0]![p]!,
          hi = boxes.at(-1)![p]! + boxes.at(-1)![s]!,
          gap = (hi - lo - boxes.reduce((sum, b) => sum + b[s]!, 0)) / (boxes.length - 1);
        let cursor = lo;
        for (const b of boxes) {
          b[p] = cursor;
          cursor += b[s]! + gap;
        }
      }
      break;
    }
  }
  return parseScene(scene);
}
export function commandScopes(
  command: Command,
  before: Scene,
  after: Scene,
): import('./schema.js').Bounds[] {
  const scopes: import('./schema.js').Bounds[] = [];
  function add(value: Coordinates & { bounds: import('./schema.js').Bounds }, scene: Scene) {
    const node = flattenResolved(resolveLayout(scene)).find(
      (n) => n.layer.id === ('target' in command ? command.target : ''),
    )!;
    scopes.push(
      value.space === 'layer'
        ? worldScope(value.bounds, coordinateMatrix(value, node))
        : value.bounds,
    );
  }
  if (command.type === 'promoteRegion' || command.type === 'updateRegion')
    add(
      findLayer(after, command.target).regions!.find((r) => r.id === command.region.id)!,
      after,
    );
  if (command.type === 'updateRegion' || command.type === 'demoteRegion') {
    const id = command.type === 'demoteRegion' ? command.id : command.region.id;
    add(
      findLayer(before, command.target).regions!.find((r) => r.id === id)!,
      before,
    );
  }
  if (command.type === 'applyRasterOperation')
    add(findLayer(after, command.target).operations.at(-1)!, after);
  if (command.type === 'updateRasterOperation') {
    add(findLayer(after, command.target).operations[command.index]!, after);
    add(findLayer(before, command.target).operations[command.index]!, before);
  }
  if (command.type === 'replaceTile') add(command.tile, after);
  if (command.type === 'removeRasterOperation')
    add(findLayer(before, command.target).operations[command.index]!, before);
  if (command.type === 'removeTile')
    add(findLayer(before, command.target).tiles[command.index]!, before);
  return scopes;
}
