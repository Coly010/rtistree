import { z } from 'zod';
import { resolveLayout, flattenResolved } from './layout.js';
import {
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
export const commandSchema = z.discriminatedUnion('type', [
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
  z.strictObject({ type: z.literal('setStyle'), ...target, style: styleSchema.partial() }),
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
  switch (command.type) {
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
      layer!.operations.push(command.operation);
      break;
    case 'replaceTile': {
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
export function commandScope(command: Command) {
  return command.type === 'applyRasterOperation'
    ? command.operation.bounds
    : command.type === 'replaceTile'
      ? command.tile.bounds
      : undefined;
}
