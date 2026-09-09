# Engine overview

Rtistree is a local TypeScript/Node.js graphics engine with a CLI, SDK and stdio MCP
server. Native CPU Skia renders the scene; Sharp and PDFKit handle artwork exports.
The renderer needs no browser, GPU, model API key or external service. An agent host
supplies its own model, image inspection and visual judgment.

Start with [getting started](getting-started.md) for an installed npm package.
The commands in the development section below require a repository checkout.

## Scene and authoring model

JSON/YAML source scenes can include fragments and parameterized components. The loader
expands them into one validated layer tree. Layers support groups, paths, text,
local image assets, procedural fills, layouts, transforms, masks and adjustments.
Raster operations, sparse palette tiles and promoted regions add focused pixel edits.
See [scene format](scene-format.md) and [editing workflows](evolution.md).

Layer IDs are unique throughout the tree. Assets, fonts and components each have their
own ID map; they do not share the layer-ID namespace. Relative include and asset paths
resolve from the declaring source file and must remain inside the root scene directory.

For painting, trusted JavaScript programs use Canvas, seeded brushes, fields and pixels.
Programs bake to ordinary image assets and pin source, parameters and inputs in recipes.
[Explicit pipelines](atelier.md) rebuild changed dependencies with caching. Rendering and
opening a scene do not execute those programs. The VM is not a security sandbox.

Physical document dimensions and print sampling resolution are separate from design pixels.
[Print production](production.md) covers PNG/JPEG/TIFF/PDF/SVG exports, profiles,
physical page boxes, preflight and soft proofs. The working renderer is 8-bit sRGB;
PDF/X certification, spot colours and overprint are not implemented.

## Editing and persistence

`Project.open(path)` accepts a scene file, `rtistree.yaml` or a configured project directory.
`project.scene()` returns the current resolved state. `project.render()` returns PNG bytes,
pixels and evidence; `project.inspect()` and `project.inspectLayer(id)` return structure.
`project.apply({reason, expected_hash, commands})` validates and commits a typed transaction.
The SDK exports `Project`, `SkiaRenderer`, schemas, command helpers, render/verification
functions, `runProgram`, `buildPipeline`, `production` and the art-direction guide.

Authoring files remain the baseline. Mutations append to
`history/<scene-filename>.operations.jsonl`; journal records include state snapshots,
commands, hashes, timestamps and measured locality. Failed transactions leave the working
scene unchanged. Scoped raster edits compare the final composite before and after and
reject pixels changed outside the allowed area. Structural edits have no general locality promise.

Undo and redo append records. After manual source changes, `rebase` merges disjoint edits
against the retained baseline and reports conflicts without committing. `compact` compresses
journal records while retaining undo/redo; replay still reads the full history. Remove a stale
lock only after confirming its recorded writer is no longer active.

Portable export creates a new baseline with referenced assets, custom fonts, recipes and
configured print profiles. It preserves the current artwork and inline pipeline graph,
but does not copy edit history, critiques or production-session reviews and candidates.

## Agent interface

The [agent setup guide](agent-setup.md) explains CLI, MCP and SDK integration.
MCP tools are:

- Inspection and images: `inspectScene`, `inspectLayer`, `inspectRegion`, `render`, `renderRegion`.
- Editing and history: `apply`, `undo`, `redo`, `history`, `rebase`, `compactHistory`.
- Verification and review: `verify`, `recordCritique`, `readCritique`.
- Painting: `studioHelp`, `runProgram`, `replayProgram`, `readRasterRegion`, `writeRasterRegion`.
- Staged work: `buildPipeline`, `production`.
- Artwork export: `exportArtwork`, `preflight`, `softProof`.

MCP rendering/crop tools return PNG image content. Production capture and comparison return
artifact paths in JSON; the host needs a way to open those images. The MCP server operates
on the project passed to `serve`; project creation, SVG import, portable scene export and
interactive benchmarks are available through the CLI/SDK, not separate MCP tools.

The exported `runIterations(project, editingAgent, options)` supports bounded edit loops.
The injected agent receives the scene, PNG and verifier report and returns a patch or `null`.
An optional `critic` callback supplies visual feedback. `requireCritique: true` requires a
current critique before passing, and unresolved medium/high findings prevent success.
There is no built-in model client or automatic visual critic.

## Evidence and limits

The [art-direction guide](agent-art-workflow.md) separates technical correctness, functional
behaviour and observed visual quality. Production gates enforce declared criteria and hashes;
they cannot authenticate reviewers, judge taste or prove that images were inspected.

PNG writes through the CLI/artifact helper include an evidence sidecar. SDK `render()` returns
evidence in memory; use `writeRender()` to write both files. Same-runtime/platform replay,
undo and portable export are tested. Cross-platform or cross-version byte identity is not promised.

A bounded layer cache reuses unchanged surfaces. Simple pointwise region scenes use a smaller
viewport; antialias-sensitive cases use a full render and exact crop. `cache: false` and
`regionMode: 'full'` request reference paths. Draft downsamples after rendering. A general
dirty-tile compositor, automatic quadtree refinement, a native animation timeline, mesh warp,
smudge and general segmentation remain unimplemented. Procedural programs can still author
individual animation frames, as the [asset trial](https://github.com/Coly010/rtistree/tree/main/examples/warden-asset-trial) demonstrates.

The [poster benchmark](previews/benchmark.json) records 4,704 changed pixels inside a
56 × 84 region and zero outside, with successful replay/undo/export checks. It is recorded
mechanical evidence, not a visual-quality benchmark. The [performance probe](previews/performance.json)
records local timings and cache reuse; it is not a portable speed guarantee.

## Repository development

```sh
git clone https://github.com/Coly010/rtistree.git
cd rtistree
npm ci
npm run check
npm run demo
npm run docs:check
npm run package:check
```

`npm run rtistree -- ...` runs the CLI from source. `npm run schema` regenerates the
schemas. `npm run performance` reruns the cache/timing probe. The demo uses a temporary
working project and writes preview images/evidence without editing the example source scenes.

The [architecture decisions](decisions/001-runtime-and-renderer.md) retain historical
context. The [original proposal](https://github.com/Coly010/rtistree/blob/main/agentic-raster-graphics-architecture.md)
is not an API reference. See [contributing](https://github.com/Coly010/rtistree/blob/main/CONTRIBUTING.md)
for development setup and [releasing](releasing.md) for maintainer release instructions.
