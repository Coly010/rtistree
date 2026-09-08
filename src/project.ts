import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { canonical, localAssetPath, sceneHash, sha256 } from './assets.js';
import { writeSceneBundle } from './artifacts.js';
import { applyCommand, commandScope, patchSchema, type Patch } from './commands.js';
import { flattenResolved, intersects, resolveLayout } from './layout.js';
import { loadScene, type SceneSource } from './loader.js';
import { defaultRenderer, type Renderer, type RenderOptions, type RenderResult } from './render.js';
import { boundsSchema, parseScene, type Bounds, type Scene } from './schema.js';
import { measureLocality, verifyScene, type LocalityEvidence } from './verify.js';

export interface HistoryEntry {
  sequence: number;
  kind: 'apply' | 'undo' | 'redo';
  reason: string;
  timestamp: string;
  source_hash: string;
  before_hash: string;
  after_hash: string;
  previous_hash: string | null;
  commands: Patch['commands'];
  asset_hashes: Record<string, string>;
  after: Scene;
  locality: LocalityEvidence[];
  hash: string;
}
interface State {
  sourceHash: string;
  scene: Scene;
  undo: Scene[];
  redo: Scene[];
  entries: HistoryEntry[];
}
function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}
export class Project {
  private constructor(
    readonly source: SceneSource,
    readonly renderer: Renderer = defaultRenderer,
  ) {}
  static async open(file: string, renderer: Renderer = defaultRenderer): Promise<Project> {
    return new Project(await loadScene(file), renderer);
  }
  get root() {
    return this.source.root;
  }
  get journal() {
    return join(this.root, 'history', `${basename(this.source.file)}.operations.jsonl`);
  }
  private async state(): Promise<State> {
    // Re-read authoring files on every request, including long-lived MCP sessions.
    const current = await loadScene(this.source.file),
      sourceHash = sceneHash(current.scene);
    let raw = '';
    try {
      raw = await readFile(this.journal, 'utf8');
    } catch (error) {
      if (!missing(error)) throw error;
    }
    if (raw && !raw.endsWith('\n'))
      throw new Error(
        'History has an incomplete final record. Restore the journal from backup before editing.',
      );
    const state: State = { sourceHash, scene: current.scene, undo: [], redo: [], entries: [] };
    for (const line of raw.split('\n').filter(Boolean)) {
      const entry = JSON.parse(line) as HistoryEntry;
      const { hash, ...payload } = entry;
      if (sha256(canonical(payload)) !== hash) throw new Error('History integrity check failed');
      if (entry.source_hash !== sourceHash)
        throw new Error(
          'Authoring files changed after edits were recorded. Restore the original authoring files, export the working scene, then start a new history.',
        );
      if (
        entry.sequence !== state.entries.length + 1 ||
        entry.previous_hash !== (state.entries.at(-1)?.hash ?? null) ||
        entry.before_hash !== sceneHash(state.scene)
      )
        throw new Error('History chain is inconsistent');
      const after = parseScene(entry.after);
      if (sceneHash(after) !== entry.after_hash) throw new Error('History state hash mismatch');
      if (entry.kind === 'apply') {
        state.undo.push(state.scene);
        state.redo = [];
      } else if (entry.kind === 'undo') {
        const previous = state.undo.pop();
        if (!previous || sceneHash(previous) !== entry.after_hash)
          throw new Error('Invalid undo record');
        state.redo.push(state.scene);
      } else if (entry.kind === 'redo') {
        const next = state.redo.pop();
        if (!next || sceneHash(next) !== entry.after_hash) throw new Error('Invalid redo record');
        state.undo.push(state.scene);
      } else throw new Error('Unknown history record');
      state.scene = after;
      state.entries.push(entry);
    }
    const last = state.entries.at(-1);
    if (last) await this.checkAssets(state.scene, last.asset_hashes);
    return state;
  }
  private async checkAssets(scene: Scene, expected: Record<string, string>) {
    if (!expected) throw new Error('History record is missing asset provenance');
    for (const [id, asset] of Object.entries(scene.assets)) {
      const bytes = await readFile(await localAssetPath(this.root, asset.source));
      if (sha256(bytes) !== expected[id])
        throw new Error(
          `Asset changed since the recorded edit: ${id}. Restore the original asset to reproduce this history.`,
        );
    }
  }
  async scene(): Promise<Scene> {
    return (await this.state()).scene;
  }
  async history(): Promise<HistoryEntry[]> {
    return (await this.state()).entries;
  }
  async render(options: RenderOptions = {}): Promise<RenderResult> {
    return this.renderer.render(await this.scene(), this.root, options);
  }
  async verify() {
    const scene = await this.scene();
    return verifyScene(scene, await this.renderer.render(scene, this.root));
  }
  async inspect() {
    const state = await this.state(),
      nodes = flattenResolved(resolveLayout(state.scene));
    return {
      version: state.scene.version,
      hash: sceneHash(state.scene),
      canvas: state.scene.canvas,
      source_files: (await loadScene(this.source.file)).files,
      assets: state.scene.assets,
      history: { entries: state.entries.length, undo: state.undo.length, redo: state.redo.length },
      layers: nodes.map((n) => ({
        id: n.layer.id,
        type: n.layer.type,
        role: n.layer.role,
        visible: n.visible,
        opacity: n.layer.opacity,
        bounds: n.bounds,
        world_bounds: n.worldBounds,
        children: n.children.map((c) => c.layer.id),
        operations: n.layer.operations.length,
        tiles: n.layer.tiles.length,
      })),
    };
  }
  async inspectLayer(id: string) {
    const scene = await this.scene(),
      node = flattenResolved(resolveLayout(scene)).find((n) => n.layer.id === id);
    if (!node) throw new Error(`Unknown layer: ${id}`);
    return { layer: node.layer, bounds: node.bounds, world_bounds: node.worldBounds };
  }
  async inspectRegion(raw: Bounds) {
    const bounds = boundsSchema.parse(raw),
      scene = await this.scene(),
      render = await this.renderer.render(scene, this.root, { region: bounds });
    const counts = new Map<string, number>();
    let total = 0,
      sum = 0;
    for (let i = 0; i < render.pixels.length; i += 4) {
      if (!render.pixels[i + 3]) continue;
      const rgb = [0, 1, 2].map((c) => Math.min(255, Math.round(render.pixels[i + c]! / 32) * 32));
      const key = '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
      sum +=
        (0.2126 * render.pixels[i]! +
          0.7152 * render.pixels[i + 1]! +
          0.0722 * render.pixels[i + 2]!) /
        255;
      total++;
    }
    return {
      bounds,
      layers: flattenResolved(resolveLayout(scene))
        .filter((n) => intersects(bounds, n.worldBounds))
        .map((n) => ({ id: n.layer.id, role: n.layer.role, bounds: n.worldBounds })),
      dominant_colours: [...counts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([colour, pixels]) => ({ colour, pixels })),
      mean_luma: total ? sum / total : 0,
      render,
    };
  }
  private async transaction(
    kind: HistoryEntry['kind'],
    reason: string,
    patch?: Patch,
  ): Promise<HistoryEntry> {
    await mkdir(join(this.root, 'history'), { recursive: true });
    const lockPath = `${this.journal}.lock`;
    let lock;
    try {
      lock = await open(lockPath, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error(
          `Project is locked: ${lockPath}. If a writer crashed, remove this lock only after confirming no writer is active.`,
        );
      throw error;
    }
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, created: new Date().toISOString() }));
      const state = await this.state(),
        beforeHash = sceneHash(state.scene);
      if (patch?.expected_hash && patch.expected_hash !== beforeHash)
        throw new Error('Stale scene hash: inspect again before applying edits');
      let after = state.scene;
      const locality: LocalityEvidence[] = [];
      if (kind === 'apply') {
        for (const command of patch!.commands) {
          const next = applyCommand(after, command),
            scope = commandScope(command);
          if (scope) {
            const evidence = measureLocality(
              await this.renderer.render(after, this.root),
              await this.renderer.render(next, this.root),
              [scope],
            );
            if (evidence.outside_changed_pixels)
              throw new Error(
                `Edit rejected: ${evidence.outside_changed_pixels} pixels changed outside its scope. Target the enclosing group after its effects, or remove the dependent mask.`,
              );
            locality.push(evidence);
          }
          after = next;
        }
      } else {
        const next = kind === 'undo' ? state.undo.at(-1) : state.redo.at(-1);
        if (!next) throw new Error(`Nothing to ${kind}`);
        after = next;
      }
      // Validate renderability and pin asset provenance before committing.
      const rendered = await this.renderer.render(after, this.root);
      await this.checkAssets(after, rendered.evidence.assets);
      const sourceNow = await loadScene(this.source.file),
        sourceHash = sceneHash(sourceNow.scene);
      if (sourceHash !== state.sourceHash) throw new Error('Source changed during transaction');
      if (state.entries[0] && state.entries[0].source_hash !== sourceHash)
        throw new Error('Source changed during transaction');
      const payload: Omit<HistoryEntry, 'hash'> = {
        sequence: state.entries.length + 1,
        kind,
        reason,
        timestamp: new Date().toISOString(),
        source_hash: sourceHash,
        before_hash: beforeHash,
        after_hash: sceneHash(after),
        previous_hash: state.entries.at(-1)?.hash ?? null,
        commands: patch?.commands ?? [],
        asset_hashes: rendered.evidence.assets,
        after,
        locality,
      };
      const entry = { ...payload, hash: sha256(canonical(payload)) };
      const journal = await open(this.journal, 'a');
      try {
        await journal.writeFile(JSON.stringify(entry) + '\n');
        await journal.sync();
      } finally {
        await journal.close();
      }
      return entry;
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
  async apply(raw: unknown): Promise<HistoryEntry> {
    const patch = patchSchema.parse(raw);
    return this.transaction('apply', patch.reason, patch);
  }
  async undo(reason = 'Undo the previous edit') {
    return this.transaction('undo', reason);
  }
  async redo(reason = 'Redo the previous edit') {
    return this.transaction('redo', reason);
  }
  async exportScene(file: string) {
    await writeSceneBundle(await this.scene(), this.root, file);
  }
}
