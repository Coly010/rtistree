import { componentsSchema, expandComponents, type Component } from './components.js';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { localAssetPath } from './assets.js';
import { parseScene, type Scene } from './schema.js';

export interface SceneSource {
  scene: Scene;
  root: string;
  file: string;
  files: string[];
}
/** Includes are fragments with {include?, assets?, layers?}; IDs share one namespace. */
export async function loadScene(file: string): Promise<SceneSource> {
  const absolute = await realpath(resolve(file)),
    root = dirname(absolute),
    files: string[] = [],
    active = new Set<string>();
  const components: Record<string, Component> = Object.create(null);
  const fonts: Record<string, unknown> = Object.create(null);
  const assets: Record<string, unknown> = Object.create(null);
  async function read(path: string, isRoot = false): Promise<Record<string, unknown>> {
    const safe = await localAssetPath(root, relative(root, path));
    if (active.has(safe)) throw new Error(`Cyclic scene include: ${relative(root, safe)}`);
    if (files.length >= 128) throw new Error('Scene has too many includes (maximum 128)');
    active.add(safe);
    files.push(safe);
    const raw = await readFile(safe, 'utf8');
    if (raw.length > 8 * 1024 * 1024) throw new Error('Scene file exceeds 8 MiB');
    const doc = parse(raw, { maxAliasCount: 100 }) as Record<string, unknown>;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc))
      throw new Error(`Expected an object in ${safe}`);
    if (!isRoot)
      for (const key of Object.keys(doc))
        if (!['include', 'assets', 'layers', 'components', 'fonts'].includes(key))
          throw new Error(`Unknown fragment field: ${key}`);
    const layers: unknown[] = [];
    if (doc.include !== undefined) {
      if (!Array.isArray(doc.include) || doc.include.some((p) => typeof p !== 'string'))
        throw new Error('include must be a list of relative file paths');
      for (const part of doc.include as string[]) {
        if (part.startsWith('/') || /^[a-z]+:/i.test(part))
          throw new Error('Includes must be relative local paths');
        const fragment = await read(resolve(dirname(safe), part));
        layers.push(...(fragment.layers as unknown[]));
      }
    }
    if (doc.assets !== undefined) {
      if (!doc.assets || typeof doc.assets !== 'object' || Array.isArray(doc.assets))
        throw new Error('assets must be a mapping');
      for (const [id, asset] of Object.entries(
        doc.assets as Record<string, Record<string, unknown>>,
      )) {
        if (Object.hasOwn(assets, id)) throw new Error(`Duplicate asset id across files: ${id}`);
        if (!asset || typeof asset.source !== 'string')
          throw new Error(`Asset ${id} requires a source`);
        if (asset.source.startsWith('/') || /^[a-z]+:/i.test(asset.source))
          throw new Error('Assets must be relative local paths');
        assets[id] = {
          ...asset,
          source: relative(root, resolve(dirname(safe), asset.source)),
          ...(asset.recipe
            ? {
                recipe: {
                  ...(asset.recipe as object),
                  source: relative(
                    root,
                    resolve(dirname(safe), (asset.recipe as { source: string }).source),
                  ),
                },
              }
            : {}),
        };
      }
    }
    if (doc.components) {
      for (const [id, component] of Object.entries(componentsSchema.parse(doc.components))) {
        if (Object.hasOwn(components, id)) throw new Error(`Duplicate component: ${id}`);
        components[id] = component;
      }
    }
    if (doc.fonts) {
      if (typeof doc.fonts !== 'object' || Array.isArray(doc.fonts))
        throw new Error('fonts must be a mapping');
      for (const [id, font] of Object.entries(doc.fonts as Record<string, any>)) {
        if (Object.hasOwn(fonts, id)) throw new Error('Duplicate font');
        if (
          typeof font?.source !== 'string' ||
          font.source.startsWith('/') ||
          /^[a-z]+:/i.test(font.source)
        )
          throw new Error('Font requires a relative source');
        fonts[id] = { ...font, source: relative(root, resolve(dirname(safe), font.source)) };
      }
    }
    if (doc.layers !== undefined) {
      if (!Array.isArray(doc.layers)) throw new Error('layers must be an array');
      layers.push(...doc.layers);
    }
    active.delete(safe);
    const { include: _include, components: _components, ...rest } = doc;
    return { ...rest, layers };
  }
  const document = await read(absolute, true);
  return {
    scene: parseScene({
      ...document,
      assets,
      ...(Object.keys(fonts).length ? { fonts } : {}),
      layers: expandComponents(document.layers as unknown[], components),
    }),
    root,
    file: absolute,
    files,
  };
}
