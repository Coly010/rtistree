# ADR 004: Physical documents, colour-managed exports and sequential print rendering

Status: accepted for v0.3. Extends the existing TS/CPU-Skia architecture.

The user requested JPEG, TIFF and physically accurate CMYK PDF output, coherent project creation, practical editing features and a harder generated-asset trial. These are implemented as an export/document layer over the existing deterministic scene engine.

Sharp 0.35.4 / its pinned libvips build handles raster encoding and ICC conversion. PDFKit 0.20.2 produces vector paths, font subsets, gradients and PDF page boxes; pdf-lib 1.17.1 independently reads back exported structures. Fontkit checks actual glyph coverage. Fast XML Parser supports a closed static SVG importer; native Skia PathOps handles path booleans. Versions are pinned in the lockfile.

Physical dimensions remain separate from design/raster pixels. An outer transform scales scene geometry for print while preserving attached coordinates and source pixel grids. Print output is bounded by edge, megapixel and surface budgets. Sequential uncached composition releases surfaces as soon as compositing no longer needs them, retaining semantic mask dependencies. This was selected over introducing a general tile compositor whose clipping/filter equivalence would need a separate validation effort.

Colour conversion occurs at input normalisation and export; the working engine remains 8-bit sRGB. The pinned Sharp source explicitly uses perceptual rendering intent, so other intents are rejected instead of accepted as ineffective settings. CMYK requires an explicit project profile. Assigning an output intent is distinguished from converting raster/vector values. Profiles are hashed, embedded and read back; the demo profile is not a printer recommendation.

Hybrid PDF preserves supported text, vectors, gradients and isolation-free groups. Context-sensitive layers fall back to rasters. Gradient interpolation occurs in the output colour space. Ordinary PDF 1.7 is the delivered format; PDF/X certification, spot colours, overprint and higher-precision working pixels are deliberately not claimed. CMYK soft proofs are ICC round trips and do not simulate a specific paper white or monitor calibration.

`rtistree.yaml` owns the scene entry point, output directory and presets. Source scenes remain independently usable. New projects include local schemas and fragments; portable project exports also copy pinned output profiles. Existing JSON scene export remains available explicitly as `--format project`. Mismatched output extensions are errors.

The print trial revealed two defects that were fixed during implementation: metadata configuration could overwrite the requested CMYK conversion, and mask inversion after erosion expanded the selected foreground instead of shrinking it. Actual-file tests and visual proof inspection cover these cases. The original engine regression suite remains in place, alongside production and editing tests.

See [the production guide](../production.md) for capabilities and operational limits, [the A3 evidence](../previews/a3-production.json), and [the generated-asset print trial](https://github.com/Coly010/rtistree/blob/main/examples/print-trial/README.md).
