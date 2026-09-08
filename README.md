# Rtistree

A deterministic raster graphics engine that agents can inspect, edit, verify, and replay. A persistent scene is the source of truth; PNG is an output.

TypeScript provides the scene schema, transactions, CLI, and MCP tool server. **Native CPU Skia** performs rendering through `@napi-rs/canvas`. No browser, WebGL, GPU, model API key, or external service is required.

![Poster rendered by Rtistree](docs/previews/poster.png)

## Run it

Requires Node.js 22 or newer. Dependencies and bundled fonts are pinned in `package-lock.json`.

```sh
npm ci
npm run build
npm test
npm run demo
```

The demo renders a poster, measures an underlit region, applies a local correction, and checks replay, undo, redo, and a self-contained export. It writes before/after images and evidence into `examples/poster/renders/`, plus a landscape into `examples/landscape/renders/`. Every demo run uses a fresh working project and leaves the example's authoring files untouched.

The recorded poster benchmark changes **4,704 pixels inside a 56 × 84 region, zero pixels outside**, improves rule verification from fail to pass, and reproduces identical PNG bytes after reopen, undo/redo, and export. This establishes mechanical correctness, not a general measure of artistic quality. See [recorded evidence](docs/previews/benchmark.json).

Use the executable after building:

```sh
node dist/cli.js render examples/poster/scene.yaml -o /tmp/poster.png
node dist/cli.js inspect examples/poster/scene.yaml
node dist/cli.js inspect-region examples/poster/scene.yaml 755 610 56 84
node dist/cli.js apply examples/poster/scene.yaml examples/poster/refine.json
node dist/cli.js verify examples/poster/scene.yaml
node dist/cli.js render examples/poster/scene.yaml -o /tmp/refined.png
node dist/cli.js undo examples/poster/scene.yaml
node dist/cli.js redo examples/poster/scene.yaml
node dist/cli.js export examples/poster/scene.yaml -o /tmp/rtistree-export/scene.json
```

`npm run graphics -- …` runs the same CLI from source. Installing the package exposes the `graphics` executable. `graphics --help` lists commands. JSON goes to stdout; errors go to stderr. Verification failures exit with code 2, other failures with code 1.

## Compose a project from files

A manifest can reference as many independently authored fragments as needed:

```yaml
version: 1
canvas:
  width: 1024
  height: 1024
  background: '#102c31'
include:
  - layers/background.yaml
  - layers/product.yaml
  - layers/typography.yaml
```

Each fragment contains `layers`, optional `assets`, and optional nested `include` paths. Paths resolve relative to the declaring file and must stay inside the project. Layer and asset IDs share a project namespace. Included layers compose in declaration order, followed by local layers; sibling `z` values determine paint order. Groups preserve hierarchy.

The [poster example](examples/poster/scene.yaml) uses this format. [Scene format documentation](docs/scene-format.md) describes coordinates, layout, operations, and validation.

## Agent interface

Start the MCP server with a scene:

```sh
node dist/cli.js serve /absolute/path/to/scene.yaml
```

Configure an MCP client to launch `node`, with the absolute path to `dist/cli.js`, `serve`, and the absolute scene path as arguments. Transport is stdio; the server writes only protocol messages to stdout.

Tools: `inspectScene`, `inspectLayer`, `inspectRegion`, `render`, `renderRegion`, `apply`, `undo`, `redo`, `verify`, `history`. Image tools return PNG image content so a vision-capable agent can inspect the result. `apply` advertises a typed command schema and requires an explanation. Supply the scene hash returned by inspection to reject stale edits.

```json
{
  "reason": "Brighten the underlit detail without changing the surrounding composition",
  "expected_hash": "sha256:…",
  "commands": [
    {
      "type": "applyRasterOperation",
      "target": "cover",
      "operation": {
        "type": "brightness",
        "bounds": [755, 610, 56, 84],
        "amount": 0.06
      }
    }
  ]
}
```

The SDK also exposes `Project`, `SkiaRenderer`, `parseScene`, layout and verification functions, and `runIterations(project, editingAgent, options)`. The injected agent receives the scene, PNG, and verifier report and returns a patch or `null`. Iteration budgets, stale-state checks, stall thresholds, and cancellation bound the loop. Model choice and vision critique stay outside the renderer; there is no built-in LLM or diffusion service.

## Persistence and reproducibility

Authoring fragments remain intact. Successful mutations append a transaction to `history/<scene-filename>.operations.jsonl`. Each record stores its commands, reason, full resolved state, previous-record hash, input/output scene hashes, asset hashes, and measured locality. Reads replay this journal over the original scene. Undo/redo append records rather than deleting history. Full state snapshots favor correctness and recovery over storage efficiency in this MVP.

A failed batch leaves the scene unchanged. A project lock prevents concurrent writers; an expected scene hash handles stale agents. Incomplete or altered journal records are rejected. If a writer crashes, inspect the PID in the `.lock` file before removing the stale lock. Do not edit authoring sources underneath active history: export the working state into a new project first. If sources were already changed, restore the originals before exporting. Changed raster asset bytes are also rejected after history exists.

Exports copy raster assets into content-addressed files and pin their hashes. Every PNG has a `.evidence.json` sidecar recording renderer/backend/runtime versions, scene hash, asset hashes, bundled font hashes, dimensions, quality, and PNG hash. Byte identity is tested on the same pinned runtime and platform. Cross-platform Skia byte identity is **not** promised.

## Implemented scope

- JSON/YAML scenes and recursive multi-file composition; strict validation and JSON Schema generation.
- Groups, semantic roles, shapes and SVG-style paths, text wrapping, local PNG/JPEG/WebP assets, gradients, seeded noise, transforms, row/column layouts, anchors, percentages, opacity, and nine blend modes.
- Rectangle, ellipse, polygon and semantic-alpha masks; feathering, layer blur, and adjustment layers.
- Scoped fill, paint/erase strokes, blur, brightness, contrast, saturation, hue shifts, noise, colour replacement, direct pixels, and palette tiles. Binary rasters remain external assets.
- Exact region crops, structural/color inspection, append-only transactions, undo/redo, self-contained export, CLI, and MCP.
- Text overflow, declared contrast, safe-area, overlap, copy/role and region-luma rules, issue heatmaps, measured edit locality, and bounded agent iterations.

The design's later phases remain extension points: adaptive quadtrees and high-resolution tile promotion, incremental rendering/caching, SVG export, warp/smudge/clone tools, image segmentation, built-in vision critique, learned asset generation, and animation. Draft currently downsamples a full render; region rendering crops a full composite to preserve exact effects at crop boundaries. The CPU surface budget bounds memory; this implementation favors correctness over throughput.

See [architecture decisions](docs/decisions/001-runtime-and-renderer.md), [multi-file persistence decision](docs/decisions/002-composable-scenes-and-history.md), and the original [architecture proposal](agentic-raster-graphics-architecture.md).

## Development

```sh
npm run check
npm run format:check
npm run schema
```

Subsystems are separate modules in `src/`: schema, loader, layout, assets, paint, renderer, commands, project transactions, verification, workflow, CLI and MCP. The `Renderer` interface makes backend replacement independent of scene authoring or agent logic. The original proposal's package boundaries are module boundaries until independent packaging has a concrete benefit.

Bundled fonts are Inter and DM Serif Display from Fontsource, under their bundled SIL Open Font Licenses. They cover Latin text; broader scripts and arbitrary symbol fallback are not supported yet. Example artwork and book-cover raster are built from this engine's own primitives; regenerate the cover with `node --import tsx scripts/create-fixtures.ts`.
