import { readJournal, compressJournal } from './history-storage.js';
import { mergeSource } from './merge.js';
import { validateCritique, type VisualCritique } from './critique.js';
import { writeArtifact } from './artifacts.js';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { canonical, localAssetPath, sceneHash, sha256 } from './assets.js';
import { writeSceneBundle } from './artifacts.js';
import { applyCommand, commandScopes, patchSchema, type Patch } from './commands.js';
import { flattenResolved, intersects, resolveLayout } from './layout.js';
import { loadScene, type SceneSource } from './loader.js';
import { defaultRenderer, type Renderer, type RenderOptions, type RenderResult } from './render.js';
import { boundsSchema, parseScene, type Bounds, type Scene } from './schema.js';
import { measureLocality, verifyRendered, type LocalityEvidence } from './verify.js';

export interface HistoryEntry {
  sequence: number;
  kind: 'apply' | 'undo' | 'redo' | 'rebase';
  baseline?: Scene;
  font_hashes?: Record<string, string>;
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
  baseline: Scene;
  incoming: Scene;
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
  private async state(allowSourceChange = false): Promise<State> {
    // Re-read authoring files on every request, including long-lived MCP sessions.
    const current = await loadScene(this.source.file),
      sourceHash = sceneHash(current.scene);
    const raw = await readJournal(this.journal);
    if (raw && !raw.endsWith('\n'))
      throw new Error(
        'History has an incomplete final record. Restore the journal from backup before editing.',
      );
    const initial = raw
      ? ((JSON.parse(raw.split('\n')[0]!) as HistoryEntry).baseline ?? current.scene)
      : current.scene;
    const state: State = {
      sourceHash: sceneHash(initial),
      baseline: initial,
      incoming: current.scene,
      scene: initial,
      undo: [],
      redo: [],
      entries: [],
    };
    for (const line of raw.split('\n').filter(Boolean)) {
      const entry = JSON.parse(line) as HistoryEntry;
      const { hash, ...payload } = entry;
      if (sha256(canonical(payload)) !== hash) throw new Error('History integrity check failed');
      if (entry.kind === 'rebase') {
        if (!entry.baseline || sceneHash(entry.baseline) !== entry.source_hash)
          throw new Error('Invalid rebase baseline');
        state.baseline = parseScene(entry.baseline);
        state.sourceHash = entry.source_hash;
      } else if (entry.source_hash !== state.sourceHash)
        throw new Error('History source chain is inconsistent');
      if (
        entry.sequence !== state.entries.length + 1 ||
        entry.previous_hash !== (state.entries.at(-1)?.hash ?? null) ||
        entry.before_hash !== sceneHash(state.scene)
      )
        throw new Error('History chain is inconsistent');
      const after = parseScene(entry.after);
      if (sceneHash(after) !== entry.after_hash) throw new Error('History state hash mismatch');
      if (entry.kind === 'apply' || entry.kind === 'rebase') {
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
    if (!allowSourceChange && state.sourceHash !== sourceHash)
      throw new Error(
        'Authoring files changed after edits were recorded. Run rebase to merge source changes, or restore the original source.',
      );
    const last = state.entries.at(-1);
    if (last) {
      await this.checkAssets(state.scene, last.asset_hashes);
      for (const [id, font] of Object.entries(state.scene.fonts ?? {})) {
        if (
          last.font_hashes &&
          sha256(await readFile(await localAssetPath(this.root, font.source))) !==
            last.font_hashes[`custom:${id}`]
        )
          throw new Error(`Font changed since the recorded edit: ${id}`);
      }
    }
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
    return verifyRendered(scene, this.root, this.renderer);
  }
  async recordCritique(raw: unknown) {
    const scene = await this.scene(),
      render = await this.renderer.render(scene, this.root),
      critique = validateCritique(raw, scene, render);
    await writeArtifact(
      join(
        this.root,
        'verification',
        `${basename(this.source.file)}.${render.evidence.scene.hash.slice(7)}.critique.json`,
      ),
      JSON.stringify(critique, null, 2) + '\n',
    );
    return critique;
  }
  async critique(): Promise<VisualCritique | null> {
    const scene = await this.scene(),
      render = await this.renderer.render(scene, this.root);
    try {
      return validateCritique(
        JSON.parse(
          await readFile(
            join(
              this.root,
              'verification',
              `${basename(this.source.file)}.${render.evidence.scene.hash.slice(7)}.critique.json`,
            ),
            'utf8',
          ),
        ),
        scene,
        render,
      );
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
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
        regions: n.layer.regions?.map((r) => ({
          id: r.id,
          bounds: r.bounds,
          scale: r.scale,
          resolution: [Math.ceil(r.bounds[2] * r.scale), Math.ceil(r.bounds[3] * r.scale)],
        })),
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
      const state = await this.state(kind === 'rebase'),
        beforeHash = sceneHash(state.scene);
      if (patch?.expected_hash && patch.expected_hash !== beforeHash)
        throw new Error('Stale scene hash: inspect again before applying edits');
      let after = state.scene;
      const locality: LocalityEvidence[] = [];
      if (kind === 'rebase') {
        after = parseScene(mergeSource(state.baseline, state.scene, state.incoming));
      } else if (kind === 'apply') {
        for (const command of patch!.commands) {
          const next = applyCommand(after, command),
            scopes = commandScopes(command, after, next);
          if (scopes.length) {
            const evidence = measureLocality(
              await this.renderer.render(after, this.root),
              await this.renderer.render(next, this.root),
              scopes,
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
      if (sourceHash !== (kind === 'rebase' ? sceneHash(state.incoming) : state.sourceHash))
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
        font_hashes: rendered.evidence.fonts,
        ...(kind === 'rebase'
          ? { baseline: state.incoming }
          : state.entries.length === 0
            ? { baseline: state.baseline }
            : {}),
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
  async rebase(reason = 'Merge nonconflicting authoring changes') {
    return this.transaction('rebase', reason);
  }
  async compactHistory() {
    await mkdir(join(this.root, 'history'), { recursive: true });
    const lockPath = `${this.journal}.lock`,
      lock = await open(lockPath, 'wx');
    try {
      await this.state();
      return await compressJournal(this.journal);
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }
  async exportScene(file: string) {
    await writeSceneBundle(await this.scene(), this.root, file);
  }
}
