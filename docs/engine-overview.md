# Rtistree

A deterministic raster graphics engine that agents can inspect, edit, verify, and replay. A persistent scene is the source of truth; PNG, JPEG, TIFF, PDF and SVG are outputs.

Version 0.4 adds a programmable digital-art studio: seeded raster programs, pressure brushes, texture fields, warps, displacement, height-field lighting and dense regional edits. Programs bake to pinned assets with portable, replayable recipes; normal rendering never executes code. See the [studio guide](studio.md), [decision](decisions/005-programmable-digital-art.md) and [wheel trial made without image generation](../examples/manual-wheel-trial/README.md).

TypeScript provides the scene schema, transactions, CLI, and MCP tool server. The next-stage implementation includes attached painting, adaptive patches, incremental layer rendering, visual critique and source rebasing. **Native CPU Skia** performs rendering through `@napi-rs/canvas`. No browser, WebGL, GPU, model API key, or external service is required.

![Poster rendered by Rtistree](previews/poster.png)

## Print production and new projects

Version 0.3 adds physical documents, ICC-managed CMYK exports, embedded PDF fonts/vector geometry, project creation, source crops/perspective, mask algebra, tonal adjustments, clone/heal, path booleans and richer typography. See the [production guide](production.md), [recorded decisions](decisions/004-print-production-and-projects.md) and [masked generated-asset print trial](../examples/print-trial/README.md).

```sh
graphics project new artwork --size A3 --orientation landscape --ppi 300 --bleed 3mm
graphics render artwork --preset screen
# Configure the printer/paper ICC profile in rtistree.yaml before CMYK export.
graphics preflight artwork --preset print
graphics export artwork --preset print --format pdf
```

Print PDFs encode exact trim/bleed dimensions and are reopened for validation. PDF/X certification, spot colours and overprint are not claimed. The engine remains an 8-bit sRGB working renderer with explicit colour-managed output.

## Run it

Requires Node.js 22 or newer. Dependencies and bundled fonts are pinned in `package-lock.json`.

```sh
npm ci
npm run build
npm test
npm run demo
```

The demo renders a poster, measures an underlit region, applies a local correction, and checks replay, undo, redo, and a self-contained export. It writes before/after images and evidence into `examples/poster/renders/`, plus a landscape into `examples/landscape/renders/`. Every demo run uses a fresh working project and leaves the example's authoring files untouched.

The recorded poster benchmark changes **4,704 pixels inside a 56 × 84 region, zero pixels outside**, improves rule verification from fail to pass, and reproduces identical PNG bytes after reopen, undo/redo, and export. This establishes mechanical correctness, not a general measure of artistic quality. See [recorded evidence](previews/benchmark.json).

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

The [poster example](../examples/poster/scene.yaml) uses this format. [Scene format documentation](scene-format.md) describes coordinates, layout, operations, and validation.

## Agent interface

Art-direction guidance ships with the engine. MCP clients receive concise rules
at connection time and can read the full versioned guide through `studioHelp` or
the `rtistree://guides/art-direction` resource. CLI agents use `graphics art-guide`
without opening a project. SDK hosts can include `rtistreeAgentInstructions` in
their agent context and expose `artDirectionGuide`.

The guide includes representative-sample workflows, connected figure construction,
shared prop perspective, ground-contact animation checks, lessons from failed
asset trials and a starter production plan using existing review gates. Technical,
functional and visual acceptance are separate. This makes the knowledge available
to new agents; it does not guarantee that every client presents it or every model
follows it. See [the agent workflow](agent-art-workflow.md).

Start the MCP server with a scene:

```sh
node dist/cli.js serve /absolute/path/to/scene.yaml
```

Configure an MCP client to launch `node`, with the absolute path to `dist/cli.js`, `serve`, and the absolute scene path as arguments. Transport is stdio; the server writes only protocol messages to stdout.

Tools: `inspectScene`, `inspectLayer`, `inspectRegion`, `render`, `renderRegion`, `apply`, `undo`, `redo`, `verify`, `history`, `recordCritique`, `readCritique`, `rebase`, `compactHistory`, `exportArtwork`, `preflight`, `softProof`, `studioHelp`, `runProgram`, `replayProgram`, `readRasterRegion`, `writeRasterRegion`. Image tools return PNG image content so a vision-capable agent can inspect the result. `apply` advertises a typed command schema and requires an explanation. Supply the scene hash returned by inspection to reject stale edits.

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

The SDK also exposes `Project`, `SkiaRenderer`, `parseScene`, layout and verification functions, and `runIterations(project, editingAgent, options)`. The injected agent receives the scene, PNG, and verifier report and returns a patch or `null`. Iteration budgets, stale-state checks, stall thresholds, and cancellation bound the loop. An optional typed `critic` callback adds visual feedback; `requireCritique: true` requires a current critique before passing, and unresolved medium/high findings prevent success. Model choice and vision critique stay outside the renderer; there is no built-in LLM or diffusion service.

## Persistence and reproducibility

Authoring fragments remain intact. Successful mutations append a transaction to `history/<scene-filename>.operations.jsonl`. Each record stores its commands, reason, full resolved state, previous-record hash, input/output scene hashes, asset hashes, and measured locality. Reads replay this journal over the original scene. Undo/redo append records rather than deleting history. Full state snapshots favor correctness and recovery over storage efficiency in this MVP.

A failed batch leaves the scene unchanged. A project lock prevents concurrent writers; an expected scene hash handles stale agents. Incomplete or altered journal records are rejected. If a writer crashes, inspect the PID in the `.lock` file before removing the stale lock. After manual source edits, run `graphics rebase scene.yaml` to merge nonconflicting changes into the working state. Conflicts report exact paths without committing. `graphics compact scene.yaml` compresses history while retaining every undo/redo state. New histories retain their source baseline; legacy histories require restoring/exporting the original source before rebasing. Changed raster asset bytes are also rejected after history exists.

Exports copy raster assets and custom fonts into content-addressed files and pin their hashes. Every PNG has a `.evidence.json` sidecar recording renderer/backend/runtime versions, scene hash, asset hashes, bundled font hashes, dimensions, quality, and PNG hash. Byte identity is tested on the same pinned runtime and platform. Cross-platform Skia byte identity is **not** promised.

## Implemented scope

- JSON/YAML scenes and recursive multi-file composition; strict validation and JSON Schema generation.
- Groups, semantic roles, shapes and SVG-style paths, text wrapping, local PNG/JPEG/WebP assets, gradients, seeded noise, transforms, row/column layouts, anchors, percentages, opacity, and nine blend modes.
- Rectangle, ellipse, polygon and semantic-alpha masks; feathering, layer blur, and adjustment layers.
- Scoped fill, paint/erase strokes, blur, brightness, contrast, saturation, hue shifts, noise, colour replacement, direct pixels, and palette tiles. Binary rasters remain external assets.
- Exact region crops, structural/color inspection, append-only transactions, undo/redo, self-contained export, CLI, and MCP.
- Text overflow, declared contrast, safe-area, overlap, copy/role and region-luma rules, issue heatmaps, measured edit locality, and bounded agent iterations.

The remaining extensions are automatic quadtree subdivision, a general dirty-tile compositor, advanced SVG import, mesh warp/smudge, general segmentation, provider-specific model integrations, learned asset generation, and animation. Draft still downsamples after rendering. Safe pointwise region scenes use smaller viewport surfaces; antialias-sensitive scenes fall back to a full composite and exact crop.

## Next-stage examples and agent trials

See [the new API and workflows](evolution.md) and [ADR 003](decisions/003-editing-refinement-and-agent-validation.md). New features include mutable effects/operations, object-relative paint, promoted patches at 1–4× resolution, layer caching, rendered contrast/visibility rules, hash-bound visual critiques, component instances, custom fonts, source rebasing and compressed history.

Three interactive trials are recorded in [agent-trials/results.json](../examples/agent-trials/results.json), with before/after images, briefs, complete audit snapshots and portable final scenes. Corrections were selected after inspecting the images. The visual scores are same-agent judgments; these are not independent quality evaluations, and token usage was unavailable. All three final scenes passed their configured checks and reproduced after export. The pear trial preserved every checked nonfruit pixel.

```sh
node dist/cli.js render examples/agent-trials/reading-club/final/scene.json -o /tmp/reading-club.png
node dist/cli.js render examples/agent-trials/pear/final/scene.json -o /tmp/pear.png
npm run performance
```

The performance probe records cache counters and local timings in `docs/previews/performance.json`. Its 16-layer edit reuses 15 surfaces and rasterizes one, while matching an uncached render exactly.

See [architecture decisions](decisions/001-runtime-and-renderer.md), [multi-file persistence decision](decisions/002-composable-scenes-and-history.md), and the original [architecture proposal](../agentic-raster-graphics-architecture.md).

## Development

```sh
npm run check
npm run format:check
npm run schema
```

Subsystems are separate modules in `src/`: schema, loader, layout, assets, paint, renderer, commands, project transactions, verification, workflow, CLI and MCP. The `Renderer` interface makes backend replacement independent of scene authoring or agent logic. The original proposal's package boundaries are module boundaries until independent packaging has a concrete benefit.

Bundled fonts are Inter and DM Serif Display from Fontsource, under their bundled SIL Open Font Licenses. They cover Latin text; custom project fonts can supply broader script coverage. Arbitrary system-font fallback remains disabled. Example artwork and book-cover raster are built from this engine's own primitives; regenerate the cover with `node --import tsx scripts/create-fixtures.ts`.

## Staged 2D art production

Dependency-aware painting pipelines, immutable candidate comparisons, hash-bound visual reviews and gated production stages are available through the CLI, SDK and MCP. Seeded oil/filbert/scumble/ink brushes complement native Canvas paths and raw pixels. See [the atelier workflow](atelier.md) and the hand-authored dragon trial in `examples/dragon-oil-trial`. No image-generation or 3D dependency is used.

Read [Art direction for agents](agent-art-workflow.md) before making art. The foundation-first protocol, named 2D construction guides, explicit blocking issues and parent-linked revisions are also discoverable through `graphics studio-help`. The [grayscale dragon study](../examples/dragon-foundation/README.md) demonstrates the process and records its unresolved artistic failures.

The [dragon head lighting experiment](../examples/dragon-head-study/README.md) uses the existing 2D tools for an original head, reflected green fire and two local revisions. It remains below the supplied artistic quality reference; code-only reproduction is verified separately from that verdict.
