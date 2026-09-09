# Editing and agent workflows

## Core edit commands

`apply` is still a transaction containing `reason`, optional `expected_hash` and `commands`. The generated [command schema](../schemas/command.schema.json) is authoritative.
The table covers core edits; [print production and editing](production.md) lists the
additional document, path, crop, text and adjustment commands.

| Area             | Commands                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Inputs           | registerAsset, removeAsset, registerFont, removeFont                                                                       |
| Composition      | addLayer, removeLayer, moveLayer, resizeLayer, setGeometry, setTransform, setZ, groupLayers, align, distribute             |
| Appearance       | setShape, setGenerator, setSource, setMask, setLayout, setVisibility, setRole, setOpacity, setBlendMode, setText, setStyle |
| Effects          | applyEffect, updateEffect, removeEffect                                                                                    |
| Raster edits     | applyRasterOperation, updateRasterOperation, removeRasterOperation, replaceTile, removeTile                                |
| Adaptive patches | promoteRegion, updateRegion, demoteRegion                                                                                  |
| Verification     | setVerification                                                                                                            |

Update/removal commands address zero-based indices reported by `inspectLayer`. Promoted regions use stable IDs. Asset/font registration uses project-relative file paths and is validated before commit. Null clears a mask, layout, transform or role. Partial style updates preserve all omitted properties.

## Object-relative painting

```json
{
  "reason": "Add a highlight that follows the product",
  "commands": [
    {
      "type": "applyRasterOperation",
      "target": "product",
      "operation": {
        "type": "paintStroke",
        "space": "layer",
        "bounds": [8, 8, 80, 100],
        "path": [
          [20, 24],
          [35, 72]
        ],
        "radius": 8,
        "hardness": 0.4,
        "colour": "#ffe0ad",
        "opacity": 0.5
      }
    }
  ]
}
```

The command captures the layer's current size in `reference_size`. Moving, scaling or rotating the object carries the paint with it. Direct scene authors can explicitly supply the reference dimensions. The default remains `space: canvas` for backward compatibility. Geometric masks can choose their own space. Semantic masks always sample the target's rendered alpha. Feather radii remain raster-pixel radii.

## Adaptive regions

```json
{
  "type": "promoteRegion",
  "target": "product",
  "region": {
    "id": "surface-detail",
    "space": "layer",
    "bounds": [20, 30, 64, 64],
    "scale": 4,
    "operations": [
      {
        "type": "paintStroke",
        "bounds": [0, 0, 64, 64],
        "path": [
          [4, 12],
          [54, 42]
        ],
        "radius": 0.6,
        "colour": "#f0d7a2"
      }
    ]
  }
}
```

The patch is 256 × 256 samples, but occupies 64 × 64 logical units. Its operations use patch-local coordinates. An optional `source` refers to a registered raster asset for explicit high-resolution content. Maximum patch size is 16 megapixels. Promotion with no source or operations changes nothing; demotion removes the patch and reveals the semantic result. Patches execute after ordinary operations and before the layer mask/opacity.

`SkiaRenderer` caches immutable layer surfaces with a configurable byte budget. `clearCache()` discards them; `render(..., {cache:false})` gives a fresh reference. `statistics` records reuse, rasterization and memory. Region rendering uses a conservative viewport fast path and falls back for curves, transforms, assets and context filters; `regionMode: full` requests the reference path explicitly.

## Pixel measurements and visual review

```yaml
verification:
  rules:
    - { type: pixel-contrast, target: headline, minimum: 4.5, percentile: 0.1 }
    - { type: visible-area, target: product, minimum: 0.7 }
```

Use `Project.verify()` or `verifyRendered(scene, root, renderer)` for these rules. They render the final image with and without a target and sample the target's solid interiors. Occlusion, opacity and background effects therefore influence the measurements. `visible-area` measures detectable contribution, so a shape matching its background can have zero visible contribution even if it is geometrically present.

For visual critique, render and inspect the PNG, then submit:

```json
{
  "scene_hash": "sha256:...",
  "png_hash": "sha256:...",
  "reviewer": "Your vision agent",
  "method": "vision-agent",
  "summary": "The title is readable, but the product competes with the background.",
  "score": 0.65,
  "issues": [
    {
      "id": "separation",
      "category": "composition",
      "severity": "medium",
      "target": "product",
      "message": "The product silhouette is difficult to read.",
      "suggestion": "Reduce background contrast behind it."
    }
  ]
}
```

`rtistree critique scene.yaml critique.json` or the MCP `recordCritique` tool stores it. Stale scene/PNG hashes are rejected. `readCritique` returns only the current critique. A callback of type `VisualCritic` can perform this review in `runIterations`; use `requireCritique: true` to require it for success. Visual and rule scores inform stall detection; unresolved medium/high visual findings prevent a pass. The adapter is provider-neutral and requires the caller to supply the actual vision-capable reviewer. No synthetic review is substituted when one is absent.

## Components and fonts

```yaml
components:
  badge:
    parameters: { label: NEW, colour: '#d9aa72' }
    layers:
      - id: plate
        type: vector
        bounds: [0, 0, 120, 40]
        shape: { type: rectangle, fill: '{{colour}}', radius: 4 }
      - id: label
        type: text
        bounds: [8, 12, 104, 24]
        content: '{{label}}'
        style: { size: 12, align: center }
layers:
  - { use: badge, id: new-badge, bounds: [40, 40, 120, 40] }
  - use: badge
    id: sale-badge
    bounds: [190, 40, 120, 40]
    params: { label: SALE, colour: '#8db1a1' }
```

Components can live in included fragments. Instance children become `new-badge-plate`, `new-badge-label`, etc. Internal semantic mask targets are namespaced as well. Exact `{{parameter}}` substitutions retain value types; embedded substitutions allow scalars. Unknown parameters/components, duplicate IDs and recursive definitions fail validation. Instance placement accepts bounds, transform, role and z. The canonical scene is fully expanded and remains editable.

```yaml
fonts:
  brand-display:
    source: fonts/BrandDisplay.otf
    # Optional hash: sha256: followed by the font file’s 64 hex digest characters
```

Choose `style.font: brand-display`. Fonts are registered under content-based aliases; changing a font file without updating its expected hash fails. History checks custom-font provenance, and exports copy font files. A custom file supplies one face; register a separate ID for another weight. Bundled names are reserved.

Layout supports `aspect_ratio`, positive `grow` weights and `layout.justify: start|center|end|space-between`. Aspect ratio derives height when height is unspecified. Main-axis growth divides space remaining after fixed children and gaps. Existing absolute and percentage layouts continue to work.

## Source changes and compressed history

After changing a source fragment or a component definition:

```sh
npx rtistree rebase scene.yaml
```

This merges disjoint source and agent changes using the retained authoring baseline. Conflicts report paths such as `/layers/headline/style/colour` and leave history untouched. Resolve the conflicting source fields and retry, or export the working scene into a new project. Rebase is audited and undoable. Histories created before baseline retention require their original source to be restored and exported first.

```sh
npx rtistree compact scene.yaml
```

Compaction compresses full records into an immutable gzip archive with a content-hashed pointer, then starts an empty active log. Every undo/redo state remains accessible. It reduces storage; replay still reads all records. Missing/tampered archives fail closed. Do not delete archives referenced by the pointer.

## Interactive benchmarks

`BenchmarkSession` requires visual review before each checkpoint. Briefs describe the objective and optional allowed region; the driver does not contain a solution or choose an edit.

```sh
# Render and record a current critique before the first checkpoint.
npx rtistree benchmark scene.yaml brief.json before
# Inspect, critique, apply edits, then inspect and critique again.
npx rtistree benchmark scene.yaml brief.json after
npx rtistree benchmark scene.yaml brief.json finish
```

The report records actual edit/command counts, rule results, visual scores, locality, uncached equality and self-contained export equality. Token counts are nullable rather than guessed. The [recorded trials](https://github.com/Coly010/rtistree/blob/main/examples/agent-trials/results.json) were performed interactively by the assistant in this task, with self-authored briefs and same-agent visual critique. They establish a usable end-to-end workflow; broader held-out evaluation and independent human review remain future evidence to collect.
