import { z } from 'zod';
export const componentSchema = z.strictObject({
  parameters: z.record(z.string(), z.json()).default({}),
  layers: z.array(z.record(z.string(), z.unknown())).min(1),
});
export type Component = z.infer<typeof componentSchema>;
export const componentsSchema = z.record(z.string(), componentSchema);
export const instanceSchema = z.strictObject({
  use: z.string(),
  id: z.string(),
  params: z.record(z.string(), z.json()).default({}),
  bounds: z
    .tuple([z.number(), z.number(), z.number().positive(), z.number().positive()])
    .optional(),
  role: z.string().optional(),
  z: z.number().optional(),
  transform: z.unknown().optional(),
});
function substitute(value: unknown, params: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const exact = value.match(/^\{\{([\w-]+)\}\}$/);
    if (exact) {
      if (!Object.hasOwn(params, exact[1]!))
        throw new Error(`Missing component parameter: ${exact[1]}`);
      return params[exact[1]!];
    }
    return value.replace(/\{\{([\w-]+)\}\}/g, (_, key: string) => {
      if (!Object.hasOwn(params, key)) throw new Error(`Missing component parameter: ${key}`);
      const v = params[key];
      if (typeof v === 'object') throw new Error('Only scalar parameters can be interpolated');
      return String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, params));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, params)]));
  return value;
}
function namespace(layers: Record<string, unknown>[], prefix: string) {
  const ids = new Map<string, string>();
  const collect = (list: Record<string, unknown>[]) => {
    for (const l of list) {
      if (typeof l.id === 'string') ids.set(l.id, `${prefix}-${l.id}`);
      if (Array.isArray(l.children)) collect(l.children);
    }
  };
  collect(layers);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [
          k,
          (k === 'id' || k === 'target') && typeof x === 'string' && ids.has(x)
            ? ids.get(x)
            : walk(x),
        ]),
      );
    return v;
  };
  return walk(layers) as Record<string, unknown>[];
}
export function expandComponents(
  input: unknown[],
  definitions: Record<string, Component>,
  stack: string[] = [],
): unknown[] {
  if (stack.length > 24) throw new Error('Component expansion is too deep');
  return input.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('Layer must be an object');
    const layer = raw as Record<string, unknown>;
    if ('use' in layer) {
      const instance = instanceSchema.parse(layer),
        component = definitions[instance.use];
      if (!component) throw new Error(`Unknown component: ${instance.use}`);
      if (stack.includes(instance.use)) throw new Error('Cyclic component use');
      for (const key of Object.keys(instance.params))
        if (!Object.hasOwn(component.parameters, key))
          throw new Error(`Unknown component parameter: ${key}`);
      const expanded = expandComponents(
        substitute(component.layers, { ...component.parameters, ...instance.params }) as unknown[],
        definitions,
        [...stack, instance.use],
      );
      const { use, params, ...attrs } = instance;
      return {
        ...attrs,
        type: 'group',
        children: namespace(expanded as Record<string, unknown>[], instance.id),
      };
    }
    return {
      ...layer,
      ...(Array.isArray(layer.children)
        ? { children: expandComponents(layer.children, definitions, stack) }
        : {}),
    };
  });
}
