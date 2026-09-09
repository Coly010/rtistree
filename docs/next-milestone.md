# Historical proposal: print documents and coherent projects

Status: delivered as the v0.3 milestone. This document retains the original proposal; see [the production guide](production.md) and [ADR 004](decisions/004-print-production-and-projects.md) for the implemented scope, selected backends and explicit limits.

## Recommended order

1. Introduce a project manifest, physical document model, and `rtistree project new` together.
2. Add JPEG, TIFF and physically sized PDF exports, with colour management and output validation.
3. Preserve text and vector geometry in PDF; add practical compositing, selection and path tools.
4. Run a more demanding generated-asset integration trial, including subject extraction or seamless extension, and print the result through the new export pipeline.

The first generated-asset fitting trial is already recorded in [the example](https://github.com/Coly010/rtistree/blob/main/examples/generated-asset-trial/README.md). It uses one built-in image-generation call followed by deterministic Rtistree composition. It establishes asset ingestion, aspect-preserving placement, editable surrounding content and exact preservation of the placed photograph. It does not establish seamless photographic outpainting, segmentation or print readiness.

## Project creation

Syntax proposed at the time (now implemented; use the current production guide):

```sh
rtistree project new alpine --size A3 --orientation landscape --ppi 300 --bleed 3mm --output-dir output
rtistree render alpine --preset screen
rtistree export alpine --preset print
rtistree preflight alpine --preset print
```

Create a project manifest describing the scene entry point, output directory and export presets; a scene referencing layer fragments; `assets/`, `fonts/`, `profiles/`, `layers/`, `history/`, and the designated output directory. Include a useful starter scene, schema references, a short project README, and ignore rules for generated artifacts. Relative paths resolve consistently from the project root. Creating a project must not overwrite an existing one. Existing scene-file commands remain usable.

The output setting must apply to CLI renders, MCP renders, region inspections, exports and reports. The existing `export` command means a portable scene bundle; preserve that meaning explicitly, for example as `--format project`, while adding image/document export options.

## Physical dimensions and print

Keep physical trim dimensions authoritative, independently of pixel dimensions. Support mm, inches and points, bleed, safe margins and a raster sampling resolution. A3 landscape has a 420 by 297 mm trim size. Pixel dimensions necessarily round at a requested ppi; that rounding must not change the PDF's physical trim size. Keep PDF page dimensions at full precision and test read-back within a stated tolerance, such as 0.01 mm.

Record the PDF MediaBox, TrimBox and BleedBox correctly; actually render artwork into the bleed. Offer crop marks as an explicit option outside trim. Report effective ppi of placed source images and whether the requested output resamples them. The file can encode exact size, but downstream printer/viewer scaling remains outside the engine's control.

At the time of this proposal, the schema capped canvas dimensions at 4,096 pixels and the renderer held full-canvas layer surfaces. A3 at 300 ppi is about 4,961 by 3,508 pixels before bleed. Print therefore needs a bounded-memory strategy and expanded dimension support, not merely a new encoder or a higher schema limit. Tiled rendering must retain context for filters and match reference crops.

## Colour and formats

CMYK requires a characterised output condition. Store the printer/paper ICC profile as a hashed project asset, distinguish profile assignment from conversion, record rendering intent, and embed the matching output profile. An RGB working preview with an explicit conversion at export is a sensible first stage; it is not a native CMYK editing engine. Preserve imported profile information and define input conversion explicitly.

For PDF, the output intent describes the printing condition; it does not by itself convert every object to CMYK. A CMYK-only preset must also inspect the emitted image and vector colour spaces. PDF/X-4 is a useful eventual target and permits colour-managed content beyond CMYK; claim compliance only after independent validation. See the [PDF Association's requirements](https://pdfa.org/technical-side-and-requirements-of-pdfx/).

JPEG should expose quality, chroma subsampling, explicit alpha flattening and ICC metadata. TIFF should offer lossless compression, resolution tags and RGB/CMYK output. Writing an 8-bit render into a higher-bit-depth container would not provide a higher-precision editing pipeline. PNG remains the convenient lossless screen output.

Sharp/libvips is a strong candidate for raster encoding and ICC conversion: its documented API includes JPEG/TIFF and profile transformation/attachment. Evaluate the exact pinned build before selecting it. PDF needs a separate writer capable of physical page boxes and appropriate colour objects. See [Sharp output documentation](https://sharp.pixelplumbing.com/api-output/).

A flattened raster PDF is a useful first delivery, with its resolution limits made explicit. The production typography milestone should preserve vector paths and embedded/subset fonts wherever supported, rasterizing effects or groups that require it. It should then address K-only small black text, rich-black policy, total ink coverage and soft proofing. Spot colours and overprint can follow a specific print use case.

Export acceptance checks should reopen actual files to verify format signatures, dimensions, resolution tags, profiles and channels. PDF checks additionally inspect physical boxes, font embedding and image placement resolution. Preflight reports should reference the scene hash, actual output hash, profile hash and export settings. Lossy JPEG needs tolerance-based decoded comparison rather than equality with source pixels.

## Editing features worth adding

Prioritise operations that help an agent integrate and revise real artwork:

- Source crop rectangles, focal-point placement, reusable linked assets, perspective transforms and editable clipping paths.
- Mask algebra, feather/grow/shrink controls, colour-range selection, and a way to import externally generated segmentation masks.
- Levels, curves, white balance and reusable adjustment stacks; then clone/heal tools for local repairs.
- Path booleans, editable control points, stroke joins/caps/dashes, SVG import/export, alignment and distribution.
- Rich text runs, tracking, kerning controls, paragraph styles and stronger font diagnostics.

The generated-image trial exposed one small authoring weakness: the folio used spaces for alignment. Separate aligned objects or tab stops would make that layout more robust. A larger next trial should test a masked photographic subject, matched shadows/colour, and multiple aspect ratios. PSD/AI round-tripping, a GUI toolbox, advanced liquify and automatic image tracing can wait until a concrete workflow justifies their complexity.
