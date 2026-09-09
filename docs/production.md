# Projects, print production and editing in v0.3

## Start a project

```sh
rtistree project new alpine --size A3 --orientation landscape --ppi 300 --bleed 3mm --output-dir output
rtistree render alpine --preset screen
rtistree preflight alpine --preset print
```

`project new` accepts A3, A4, A5, Letter, or a custom pair such as `160x100` (mm) or `8.5inx11in`. It creates `rtistree.yaml`, a scene with layer fragments, assets/fonts/profiles/history directories, local JSON Schemas, a README and a designated output directory. The destination must be new. Existing scene-file commands remain available; opening a configured entry-point scene also discovers its project settings.

Generated projects start with an sRGB screen preset and a CMYK print preset. Before using the print preset, copy your printer/paper ICC file into `profiles/` and set `presets.print.profile`. Set `profile_hash` to its SHA-256 digest to pin it. CMYK export rejects missing, invalid, changed or non-CMYK profiles. The demo profile is for exercising the pipeline, not a recommendation for a printing process.

Project paths are local to the project root. CLI/MCP renders and artwork exports use `output_dir`; CLI verification and preflight reports use it too. History and critique records remain persistent project state. Explicit CLI `--output` paths override artifact destinations.

## Physical document model

The scene can contain:

```yaml
document:
  width: 160
  height: 100
  unit: mm
  ppi: 300
  bleed: 3
  safe_margin: 6
```

Units are `mm`, `in`, or `pt`; bleed and safe margin use the same unit. Canvas coordinates remain design coordinates. The physical trim dimensions are authoritative and must have substantially the same aspect ratio as the canvas (ratio tolerance 0.002). PDF page boxes use full-precision physical dimensions; rounded raster dimensions do not redefine the trim. Export checks read the PDF back within 0.01 mm of the declared size.

Print rendering applies an outer affine transform, preserving source crops, object-relative paint, direct pixels and palette grids. Effects and mask feathering are scaled to maintain their physical appearance. Unbounded procedural backgrounds extend through the bleed. Other artwork must be authored to extend beyond trim when needed. Crop marks are optional and sit outside the bleed.

The renderer accepts edges up to 8,192 pixels. Print preflight also enforces a 32-megapixel output ceiling and a surface budget based on nesting and retained mask dependencies. Uncached composition releases completed layer surfaces rather than retaining every layer. This supports A3 at 300 ppi: 5,031 by 3,579 pixels with 3 mm bleed, as recorded in [the A3 check](previews/a3-production.json). It is not an unlimited-memory or general tiled renderer.

## Formats and colour

```sh
rtistree export alpine --preset print --format pdf
rtistree export alpine --preset print --format tiff
rtistree export alpine --preset screen --format jpeg
rtistree export alpine --format svg -o alpine/output/artwork.svg
rtistree proof alpine --preset print
rtistree export alpine --format project -o /tmp/alpine-copy/scene.json
```

Known artwork extensions are inferred for `export` and full `render`. Region renders remain PNG. A filename extension must agree with the actual format. Portable scene export keeps its original meaning with `--format project` or a JSON/YAML destination, and copies configured print profiles/presets when exporting a project.

| Format  | Implemented output                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| PNG     | Lossless sRGB, alpha, ICC profile                                                                                                      |
| JPEG    | sRGB or CMYK, quality 1–100, 4:4:4 or 4:2:0, explicit flattening background                                                            |
| TIFF    | 8-bit sRGB or CMYK, lossless LZW, resolution tags and ICC profile                                                                      |
| PDF 1.7 | Exact physical boxes, optional crop marks, sRGB or ICC-managed CMYK, embedded/subset fonts, vector paths and gradients where supported |
| SVG     | Vector geometry and text outlines; losslessly embedded raster fallbacks for compositing/effects                                        |

The pinned Sharp/libvips encoder uses **perceptual** ICC conversion. This is the only accepted rendering intent, and it is recorded in evidence. Imported profiled rasters and TIFFs are explicitly converted to the sRGB working space. Original source bytes remain pinned and unchanged.

For CMYK PDF, raster image streams contain four-channel samples and reference the embedded ICC profile; vector colours are converted through that profile and the document has the corresponding output intent. Pure `#000000` vector text/shapes use K-only black by default; set `black: profile` to use the profile conversion. This policy does not rewrite black inside photographic assets.

Hybrid PDF retains supported top-level text, paths, shapes, gradients and isolation-free groups. Effects, masks and context-dependent compositing use raster fallbacks at the document resolution. `mode: raster` explicitly produces a flattened page. Gradient endpoints are converted to the output colour space and interpolated there, so PDF gradients may differ slightly from a per-pixel converted screen raster.

`proof` produces an sRGB PNG after a round trip through the chosen CMYK profile. It is useful for inspecting gamut changes, and does not simulate a calibrated monitor or paper white. TIFF/JPEG ink reporting measures decoded CMYK values. PDF ink reporting samples constituent raster/vector colours; it is not a RIP-based analysis of transparency/overprint interactions. Over-limit ink and low effective ppi appear as warnings.

**PDF/X compliance is not asserted.** Spot colours, overprint, a high-bit-depth working pipeline and printer-specific certification remain future work. Export evidence identifies these limits and never labels an ordinary PDF as certified PDF/X.

## Preflight and evidence

Preflight checks physical geometry, render capacity, output profiles, font glyph coverage, text overflow, safe margins and effective image resolution including crop/fit placement. Perspective placements report that their resolution estimate is pre-warp. Low-resolution sources and safe-margin crossings are warnings; invalid geometry/profiles and missing glyphs are errors. Preflight exits 2 for errors and persists its report.

Each artwork export has a `.evidence.json` containing the scene hash, output hash, resolved settings, ICC hash, backend versions and inspection of the actual encoded bytes. Raster inspection reads format, dimensions, channels, profile and density. PDF inspection reads page boxes, image colour-space declarations, embedded font descriptors and profile streams. This complements visual proof inspection; it does not replace press validation.

## New editing operations

Commands are available through `apply` in the CLI, SDK and MCP. See generated command/patch schemas for complete inputs.

| Command or field                         | Behaviour                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `setDocument`                            | Set or clear physical document settings in history                                 |
| `setCrop`                                | Set a source-pixel rectangle and optional normalised focal point                   |
| `setPerspective`                         | Map an image into four convex local corners using inverse projective sampling      |
| `setAffine`                              | Set an invertible six-number local affine matrix                                   |
| `setPath`                                | Edit move/line/quadratic/cubic/close segments with explicit control points         |
| `booleanPath`                            | Union, intersect, subtract or XOR sibling vector operands into a new editable path |
| `setTextRuns`                            | Styled text spans with colour and regular/bold weight                              |
| `setParagraphStyle`, `useParagraphStyle` | Reuse and update named text styles                                                 |
| `setAdjustmentStack`                     | Replace a non-destructive operation stack with locality validation                 |

Multiple image layers can reference one registered asset. Replacing an asset registration with a new immutable source updates those linked uses; edits to already-pinned bytes are still rejected. Existing alignment and distribution commands remain available.

Shapes support stroke caps, joins, dash arrays and dash offsets. Text styles support tracking and kerning control. Rich runs must concatenate exactly to `content`; `setTextRuns` maintains both. Paragraph styles define shared font/size/colour/spacing values. Custom font files should represent the intended face; a weight flag does not select another face inside a custom font collection.

Masks now support editable SVG-style paths, image alpha/luminance/colour-range selections, and union/intersection/subtraction/XOR. Combined masks use one coordinate space; children inherit the outer space and reference size. The processing order is selection/algebra, inversion, grow/shrink, then feathering. Image masks reference an asset directly, making external segmentation masks usable without a visible mask layer.

New scoped operations are levels, piecewise-linear RGB/channel curves, white balance, clone and heal. Cloning samples a frozen copy of the target using `source_offset`. Healing adds a local mean-colour correction to that cloned texture; this is a deterministic colour-matched clone, not a Poisson or learned healing algorithm. All operate non-destructively through the existing history and scoped-pixel checks.

## SVG interchange and trial

```sh
rtistree import-svg drawing.svg -o drawing.scene.json
rtistree export drawing.scene.json --format svg -o drawing.svg
```

The importer supports static paths, rectangles, circles, ellipses, lines, polygons, polylines, groups, transforms and basic stroke/fill styling. Unsupported elements/attributes, remote resources, scripts and entities are rejected rather than silently dropped. Text, filters and arbitrary CSS are not imported. Exported text is outlined; complex export fallbacks are embedded images. Full round-trip equivalence for arbitrary SVG is not promised.

The [print trial](../examples/print-trial/README.md) generates a ceramic vase/leaf photograph, extracts its silhouette using the new masks, adds a contact shadow and colour adjustment, adapts it to two aspect ratios, and exports CMYK PDF/TIFF/JPEG. The source, exact prompt, edits, critiques, final scenes and output evidence are retained.
