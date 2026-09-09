import { readFile, mkdir, realpath } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { z } from 'zod';
import { canonical, localAssetPath, sha256, sceneHash } from './assets.js';
import { writeArtifact } from './artifacts.js';
import { bakeProgram, programSchema, PROGRAM_VERSION } from './program.js';
import { TECHNIQUE_VERSION } from './techniques.js';
import { projectPath } from './project-config.js';
import { flattenLayers, assetSchema } from './schema.js';
import type { Project } from './project.js';
export const studioId = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/);
export const pipelineSchema = z.strictObject({
  version: z.literal(1),
  id: studioId,
  shared: z.record(studioId, z.json()).default({}),
  nodes: z
    .array(
      z.strictObject({
        id: studioId,
        source: z.string().min(1).optional(),
        code: z.string().min(1).max(262144).optional(),
        width: z.number().int().min(1).max(8192),
        height: z.number().int().min(1).max(8192),
        seed: z.number().int().min(0).max(0xffffffff).default(0),
        parameters: z.record(studioId, z.json()).default({}),
        bindings: z.record(studioId, studioId).default({}),
        inputs: z
          .record(
            studioId,
            z.union([z.strictObject({ node: studioId }), z.strictObject({ asset: studioId })]),
          )
          .default({}),
        target: studioId.optional(),
        timeout_ms: z.number().int().min(50).max(30000).default(10000),
      }),
    )
    .min(1)
    .max(32),
});
export type Pipeline = z.infer<typeof pipelineSchema>;
/** Managed state is scoped to the scene entry point and checked against symlink escapes. */
export async function studioDirectory(project: Project, ...parts: string[]) {
  const path = join(
    project.root,
    'studio',
    sha256(relative(project.root, project.source.file)).slice(7, 23),
    ...parts,
  );
  let parent = dirname(path);
  for (;;) {
    try {
      projectPath(project.root, relative(project.root, await realpath(parent)));
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      parent = dirname(parent);
    }
  }
  await mkdir(dirname(path), { recursive: true });
  return path;
}
export async function buildPipeline(project: Project, raw: unknown, expected_hash?: string) {
  const graph = pipelineSchema.parse(raw),
    scene = await project.scene(),
    before = sceneHash(scene);
  if (expected_hash && expected_hash !== before) throw new Error('Stale scene hash');
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (byId.size !== graph.nodes.length) throw new Error('Duplicate pipeline node');
  const targets = graph.nodes.flatMap((n) => (n.target ? [n.target] : []));
  if (new Set(targets).size !== targets.length) throw new Error('Duplicate pipeline target');
  const ordered: Pipeline['nodes'] = [],
    visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error(`Pipeline cycle at ${id}`);
    if (visited.has(id)) return;
    const n = byId.get(id);
    if (!n) throw new Error(`Unknown pipeline dependency ${id}`);
    if (Boolean(n.code) === Boolean(n.source))
      throw new Error('Each node requires exactly one code or source');
    visiting.add(id);
    for (const input of Object.values(n.inputs)) if ('node' in input) visit(input.node);
    visiting.delete(id);
    visited.add(id);
    ordered.push(n);
  }
  graph.nodes.forEach((n) => visit(n.id));
  const assets = { ...scene.assets },
    results: { id: string; status: 'built' | 'cached'; key: string; output_hash: string }[] = [];
  const commands: unknown[] = [];
  const sources = new Map<string, string>();
  const generatedIds = new Set(graph.nodes.map((n) => `${graph.id}_${n.id}`));
  for (const node of graph.nodes) {
    studioId.parse(`${graph.id}_${node.id}`);
    for (const input of Object.values(node.inputs))
      if ('asset' in input && generatedIds.has(input.asset))
        throw new Error('Use a node reference for pipeline-produced inputs');
  }
  for (const node of ordered) {
    const code =
      node.code ?? (await readFile(await localAssetPath(project.root, node.source!), 'utf8'));
    sources.set(node.id, code);
    const parameters = { ...node.parameters };
    for (const [name, key] of Object.entries(node.bindings)) {
      if (!Object.hasOwn(graph.shared, key)) throw new Error(`Missing shared parameter ${key}`);
      parameters[name] = graph.shared[key]!;
    }
    const inputs: Record<string, string> = {},
      hashes: Record<string, string> = {};
    for (const [name, input] of Object.entries(node.inputs)) {
      const id = 'node' in input ? `${graph.id}_${input.node}` : input.asset;
      const asset = assets[id];
      if (!asset) throw new Error(`Unknown pipeline input ${id}`);
      const bytes = await readFile(await localAssetPath(project.root, asset.source));
      if (asset.hash && asset.hash !== sha256(bytes))
        throw new Error('Pipeline input hash mismatch');
      inputs[name] = id;
      hashes[name] = sha256(bytes);
    }
    const asset_id = `${graph.id}_${node.id}`;
    const spec = programSchema.parse({
      code,
      parameters,
      inputs,
      asset_id,
      width: node.width,
      height: node.height,
      seed: node.seed,
      timeout_ms: node.timeout_ms,
      reason: `Build ${graph.id}/${node.id}`,
    });
    const key = sha256(
      canonical({
        code,
        parameters,
        inputs: hashes,
        width: node.width,
        height: node.height,
        seed: node.seed,
        timeout_ms: node.timeout_ms,
        runtime: {
          program: PROGRAM_VERSION,
          techniques: TECHNIQUE_VERSION,
          node: process.version,
          skia: '1.0.8',
        },
      }),
    );
    const cache = await studioDirectory(project, 'cache', key.slice(7) + '.json');
    let asset: z.infer<typeof assetSchema> | undefined;
    try {
      const cached = JSON.parse(
        await readFile(await localAssetPath(project.root, relative(project.root, cache)), 'utf8'),
      );
      if (cached.key !== key) throw new Error('Cache key mismatch');
      asset = assetSchema.parse(cached.asset);
      if (!asset.hash || !asset.recipe) throw new Error('Incomplete cache');
      if (
        sha256(await readFile(await localAssetPath(project.root, asset.source))) !== asset.hash ||
        sha256(await readFile(await localAssetPath(project.root, asset.recipe.source))) !==
          asset.recipe.hash
      )
        throw new Error('Corrupt cache');
      const recipe = JSON.parse(
        await readFile(await localAssetPath(project.root, asset.recipe.source), 'utf8'),
      ) as import('./program.js').ProgramRecipe;
      if (
        recipe.source !== code ||
        recipe.source_hash !== sha256(code) ||
        recipe.output_hash !== asset.hash ||
        recipe.width !== spec.width ||
        recipe.height !== spec.height ||
        recipe.seed !== spec.seed ||
        recipe.timeout_ms !== spec.timeout_ms ||
        canonical(recipe.parameters) !== canonical(parameters)
      )
        throw new Error('Cache recipe does not match the requested program');
      for (const input of Object.values(recipe.inputs))
        if (
          sha256(
            await readFile(
              await localAssetPath(project.root, join(dirname(asset.recipe.source), input.source)),
            ),
          ) !== input.hash
        )
          throw new Error('Corrupt cache input');
    } catch {
      asset = undefined;
    }
    const status = asset ? 'cached' : 'built';
    if (!asset) {
      asset = assetSchema.parse((await bakeProgram(project.root, spec, assets)).asset);
      await writeArtifact(cache, canonical({ key, asset }));
    }
    assets[asset_id] = asset;
    results.push({ id: node.id, status, key, output_hash: asset.hash! });
    if (canonical(scene.assets[asset_id] ?? null) !== canonical(asset))
      commands.push({ type: 'registerAsset', id: asset_id, asset });
  }
  // Preserve authored node order for painter's compositing order, independently of DAG traversal.
  for (const node of graph.nodes)
    if (node.target) {
      const id = `${graph.id}_${node.id}`,
        target = flattenLayers(scene.layers).find((l) => l.id === node.target);
      if (target?.source === id) continue;
      commands.push(
        target
          ? { type: 'setSource', target: node.target, source: id }
          : {
              type: 'addLayer',
              layer: {
                id: node.target,
                type: 'raster',
                source: id,
                bounds: [0, 0, scene.canvas.width, scene.canvas.height],
              },
            },
      );
    }
  // Pin editable inline code and bindings with the scene so candidate restoration restores its build graph.
  const frozen = {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const { source, ...rest } = n;
      return { ...rest, code: sources.get(n.id)! };
    }),
  };
  const next = structuredClone(scene);
  const { applyCommand } = await import('./commands.js');
  let changed = next;
  for (const command of commands) changed = applyCommand(changed, command);
  changed.metadata = {
    ...changed.metadata,
    [`pipeline_${graph.id}`]: JSON.parse(canonical(frozen)),
  };
  if (sceneHash(changed) === before) {
    if (sceneHash(await project.scene()) !== before) throw new Error('Stale scene hash');
    return { pipeline: graph.id, scene_hash: before, nodes: results, changed: false };
  }
  const entry = await project.apply({
    reason: `Rebuild pipeline ${graph.id}`,
    expected_hash: before,
    commands: [{ type: 'restoreScene', scene: changed }],
  });
  return { pipeline: graph.id, scene_hash: entry.after_hash, nodes: results, changed: true };
}
