# Scene format v1

The examples in this document are the implemented format. The original proposal is exploratory; unsupported fields are rejected, not silently interpreted. Generate machine-readable schemas with `npm run schema` or `rtistree schema`.

The [production guide](production.md) describes v0.3 physical documents, exports, affine and perspective transforms, extended masks, adjustments, path commands and typography.

The [studio guide](studio.md) describes v0.4 programmable assets and dense editing. Assets may carry a `recipe: {source, hash}` reference to a frozen program manifest. Promoted regions accept `composite: replace|over` (default replacement). Programs are executed explicitly and baked; scenes never execute referenced recipes while rendering.

## Files and assets

Root documents contain `version: 1`, `canvas`, `layers` and/or `include`, optional `assets`, `metadata`, and `verification: {rules: [...]}`. Fragments contain `include`, `assets`, `fonts`, `components` and `layers`. JSON and YAML can be mixed. There can be at most 128 included documents and 256 total layers.

```yaml
assets:
  portrait:
    type: image # or generated-image; provenance category only
    source: ./assets/portrait.png
    hash: sha256:... # optional on input; checked when supplied
```

PNG, JPEG, WebP and TIFF assets are supported. ICC-tagged input is normalised to sRGB. The separate `import-svg` command converts a closed static geometry subset into scene layers. No URL loading or external resource resolution is permitted. Asset paths must resolve inside the root scene directory, including after symlink resolution. File size is limited to 64 MiB and decoded dimensions to 32 megapixels. Large rasters belong in binary image files, not YAML arrays.

## Coordinates and layout

`canvas` uses integer `width` and `height`, each from 1 to 8192, `colour_space: srgb`, and a `#RRGGBB` or `#RRGGBBAA` background. A conservative total-surface memory budget can reject large scenes with many retained layers. Physical document dimensions are separate from these design pixels.

Geometry uses `bounds: [x, y, width, height]` **relative to the parent**. Omitted bounds fill the parent's content area. A layer may override dimensions using numeric `width`/`height` or percentages, and `anchor` can be `top-left`, `center`, `top-right`, `bottom-left`, or `bottom-right`. Rotation is in degrees about the box center; scale is a positive `[x, y]` pair. Parent transforms apply to descendants.

```yaml
- id: product-row
  type: group
  bounds: [40, 40, 944, 500]
  layout: { type: horizontal, padding: 24, gap: 32, align: center }
  children:
    - id: left
      type: vector
      width: 50%
      height: 320
      shape: { type: rectangle, fill: '#f2ce94', radius: 8 }
    - id: right
      type: vector
      width: 50%
      height: 320
      shape: { type: ellipse, fill: '#638379' }
```

Flow layouts support horizontal/vertical directions, padding, gaps and cross-axis start/center/end alignment. Percentages on the flow axis use space remaining after padding and gaps. Flow layout overrides child positions and anchors. Direct move/resize/alignment commands require an absolute-layout parent; change the authoring layout to control flow sizing. An optional `aspect_ratio` derives height from width when height is omitted. Positive `grow` weights share remaining flow space; `justify` supports start, center, end and space-between. Automatic asset dimensions and arbitrary constraints are not implemented.

**Masks, paint paths, raster scopes, pixel locations and palette tiles default to canvas coordinates.** Set `space: layer` and a `reference_size` to attach them to an object. Commands capture the reference size automatically; movement, rotation and resizing then transform the edit. This explicit separation permits exact locality measurements. Layer masks use the rendered alpha of the target layer for `semantic-object`; hidden targets have empty alpha.

## Layers

Common fields: `id`, `name`, `role`, `visible`, `opacity`, `blend_mode`, `z`, `bounds`, `transform`, `mask`, `effects`, `operations`, `tiles`. Children are embedded layer objects on a `group`, not string references. Positive `z` paints later among siblings. Equal values preserve declaration order.

| Type                    | Required or relevant fields                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| group                   | `children`, optional `layout`                                                             |
| vector                  | `shape`                                                                                   |
| text                    | `content`, optional `style`                                                               |
| asset / generated-asset | `source` asset ID; `fit: contain`, `cover`, or `stretch`                                  |
| procedural              | `generator`                                                                               |
| raster                  | optional `source` asset ID, `tiles`, `operations`; initially transparent without a source |
| adjustment              | `operations`, optional mask and opacity; operates on already composed siblings            |

Shapes are `rectangle` (optional radius), `ellipse`, or `path` with SVG path data in `d`. All require `fill`; transparent fill is `#00000000`. Optional `stroke` and `stroke_width` add an outline. Paths use local coordinates in the layer's box; they are not automatically normalized to that box.

Text is retained as semantic content. It wraps at whitespace and respects explicit newlines. `style` supports `font: inter|display`, `size`, `weight: regular|bold`, `colour`, `line_height` as a multiplier, and `align: left|center|right`. `display` uses DM Serif Display regular; its bold variant is not supplied. Text is clipped to its box, and the verifier reports overflow. Bundled Latin fonts provide reproducible typography; a custom font can be registered in the scene fonts map and selected by its ID.

Generators: `solid` (`colour`); `gradient` (`from`, `to`, `angle`, with 0° horizontal and 90° vertical); `noise` (`seed`, `amount`, optional base `colour`). Every random generator requires an integer seed. Noise is sampled in a stable row-major order.

Blend modes: normal, multiply, screen, overlay, darken, lighten, difference, soft-light, hard-light. Compositing and colour adjustments use Skia's sRGB path; this is not a linear-light color grading engine.

## Effects, masks and raster operations

Layer effects currently support `{type: blur, radius: 8}`. Rendering order is geometry/children → effects → palette tiles → raster operations → promoted regions → layer mask → opacity → sibling blending. Adjustment layers apply scoped operations to the existing composite, then mix the result by their mask and opacity.

Mask types:

```yaml
mask: { type: rectangle, bounds: [100, 100, 200, 200], feather: 8 }
```

The exact mask type token is **`rectangle`**, alongside `ellipse`, `polygon` (`points: [[x,y], ...]`), and `semantic-object` (`target: layer-id`). All accept `feather` in pixels. The feather is applied before intersection with a raster operation's hard bounds. Semantic mask references are checked for dependency cycles, including parent/child cycles. Adjustment layers cannot be semantic mask targets.

Every raster operation requires a `bounds` rectangle and accepts an optional `mask`. Bounds use half-open canvas pixel coordinates: a pixel at `(x,y)` is in scope when `left <= x < right` and `top <= y < bottom`. Integer bounds are recommended. Filters and soft strokes are hard-clipped to this region, so provide enough padding for a smooth falloff.

| Operation     | Parameters                                                      |
| ------------- | --------------------------------------------------------------- |
| fill          | `colour`; source-over fill                                      |
| paintStroke   | `path`, `radius`, `colour`, optional `opacity`, `hardness`      |
| eraseStroke   | `path`, `radius`, optional `opacity`, `hardness`; removes alpha |
| brightness    | `amount` from −1 to 1; additive channel offset                  |
| contrast      | `amount` from −1 to 1; contrast around the channel midpoint     |
| saturation    | `amount` from −1 to 1; −1 gives monochrome                      |
| hueShift      | `degrees` from −360 to 360                                      |
| noise         | `amount` from 0 to 1, explicit integer `seed`                   |
| blur          | `radius`; samples full layer context, changes only scope        |
| colourReplace | `from`, `to`, optional `tolerance` from 0 to 1                  |
| setPixels     | `pixels: [{x, y, colour}, ...]`; maximum 4096 sparse pixels     |

Brush hardness is implemented by a deterministic Gaussian blur of the stroke. Colour adjustments preserve alpha. `setPixels` replaces RGBA values. Pixels outside bounds are ignored; feathered masks blend premultiplied colors. For transactional edits, the final composite is compared before and after; any changed pixel outside the command's scope rejects the whole transaction. Direct `applyCommand` is a pure structural helper; use `Project.apply` to enforce the rendered locality guarantee.

## Palette tiles

Tiles have canvas bounds, a single-character palette, and rows of keys. Rows must have equal widths, every key must exist, and grids are limited to 256 × 256. Scaling uses nearest-neighbor sampling.

```yaml
- id: detail
  type: raster
  tiles:
    - bounds: [320, 280, 32, 32]
      palette: { A: '#00000000', B: '#f2be81', C: '#b75c40' }
      pixels: ['AABB', 'ABBC', 'BBCC', 'BCCB']
```

`replaceTile` replaces a tile with exactly matching bounds or appends a new one. Transparent tile pixels composite over underlying layer content. Palette tiles remain compact grids. Separately, `promoteRegion`, `updateRegion` and `demoteRegion` manage patches with 1–4× resolution and optional external raster sources; see [evolution](evolution.md).

## Commands and verification

`apply` accepts `{reason, expected_hash?, commands: [...]}`. Commands include add/remove/move/resize layer, set opacity/blend/text/style, group siblings, align/distribute siblings, apply effect, apply raster operation, and replace tile. See `rtistree schema --kind command` for exact fields. Removing referenced mask or verification targets is rejected unless the resulting scene is valid. Grouping can change compositing with interleaved siblings; it is an explicit structural edit without a locality promise.

Verification always checks rendered text overflow. Optional rules cover safe-area, text-overflow, text-equals, required-role, contrast, no-overlap and region-luma. Luma is a mean weighted sRGB channel value in [0,1], not perceptual luminance. `contrast` uses declared foreground and explicit background colours. `pixel-contrast` and `visible-area` use counterfactual rendered samples through `verifyRendered` / `Project.verify`. Geometry checks use transformed bounding boxes, not exact silhouettes. A heatmap marks issue bounds. All reports state these limitations.

`render-region` requires an integer rectangle fully inside the canvas and equals an exact crop of the full render. `draft` halves both output dimensions after rendering; preview and final currently use the same full-quality pipeline. PNG output includes renderer evidence in a sidecar. Canonical scene hashes omit timestamps; history includes timestamps for audit purposes without influencing pixel output.

The [evolution guide](evolution.md) documents the expanded command surface, coordinates, components, fonts, adaptive regions, critiques, rebase, compaction, and agent trials.
