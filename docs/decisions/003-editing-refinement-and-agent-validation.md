# ADR 003: Attached edits, adaptive patches, measured verification, and source rebasing

Status: accepted. Extends ADR 001 and supersedes the MVP limitations in ADR 002.

## Delivery order

The user requested: complete the editing API; attach paint to objects; add adaptive refinement and faster rendering; improve verification; improve authoring; then run unscripted agent trials. Implementation and validation followed that order.

## Editing and coordinates

Commands now cover registering/removing assets and fonts; shape, generator, geometry, transform, mask, layout, source, visibility, role and stacking changes; verification rules; and update/removal of individual effects, operations and tiles. Partial style changes preserve unspecified fields. The first interactive trial uncovered a Zod-default regression here; a focused regression test now covers it.

Raster operations, geometric masks, palette tiles and promoted regions accept `space: canvas|layer`. Omission preserves v1 canvas behavior. Commands capture a `reference_size` for layer-relative data. The renderer combines the object's current world transform with its size relative to that reference. Movement, rotation and resizing therefore move its paint. Authors writing files directly should supply `reference_size` when paint must scale with later source edits.

The locality contract is the integer enclosing rectangle of the transformed scope. The painter additionally clips to the transformed footprint. Replacing/removing operations measures the union of the old and new scopes. Parent effects and mask dependencies can still cause scope rejection; edits never silently broaden the permitted area.

## Adaptive detail and rendering

A layer can contain independently addressable promoted regions. Each has an ID, bounds, scale from 1–4, optional external raster source, and a list of patch-local operations. Promotion without a source or edits changes no pixels. Detailed patches are derived from the current semantic surface, supersampled locally, edited, and composited back. Demotion restores the underlying semantic result. Upsampling an imported raster does not invent missing source detail; new paint can use the finer sampling grid.

A bounded LRU cache stores immutable layer surfaces and text diagnostics. Keys cover resolved geometry, descendant/mask dependencies, source content, assets, fonts, and omitted-layer options. Edits invalidate affected surfaces while unchanged layers are reused. This is incremental layer rasterization; a general dirty-tile compositor is still future work.

A viewport fast path allocates region-sized surfaces for simple pointwise scenes. Curves, transforms, raster assets, context filters, promoted patches and other antialias-sensitive cases use full-canvas rendering and an exact crop. Testing demonstrated that clipping a rotated rectangle or ellipse on a smaller Skia device can change boundary pixels, so those cases deliberately retain the original device. `regionMode: full` and `cache: false` expose reference paths for equivalence tests. Draft remains a downsampled render.

## Verification and critique

`pixel-contrast` compares the actual composite to a counterfactual render with the target omitted, sampling solid glyph/shape interiors. `visible-area` measures how much of the target contributes to the final image. These account for opacity and overlying content; the existing declared-colour rule remains separately available. They are engineering measurements with documented sampling limits, not an accessibility certification or an aesthetic score.

Visual critique is an explicit external input from a vision-capable agent or human, bound to both scene and PNG hashes. It contains a reviewer, summary, severity-tagged findings and score. A typed callback integrates a critic into the bounded edit loop; MCP/CLI tools allow an interactive agent to inspect and record its own critique. Unresolved medium/high findings prevent a visual pass. The renderer has no model-provider dependency or credentials. A particular model service is not silently installed or called.

## Authoring and history

Components are file-level parameterized templates. Expansion namespaces instance child IDs and internal mask references, validates parameters, and rejects recursion. The canonical document remains a resolved layer tree. Rebase can propagate nonconflicting template/source edits into working state; instance editing does not write a template back automatically.

Custom font files are project-local, hashed, registered under content-based aliases and copied during export. Layout adds aspect ratios, proportional growth and main-axis justification.

New history records retain the authoring baseline. `rebase` performs a three-way merge of that baseline, the agent's working scene and current authored sources. ID-bearing layer arrays merge by identity. Conflicting paths are errors, not guesses; successful rebases are audited and undoable. Older v0.1 histories without a retained baseline require restoring/exporting their original source before using this workflow.

`compact` compresses the full journal into an immutable gzip archive and starts an appendable active log. A content-hashed pointer and duplicate-record checks make the pointer/log transition recoverable after a crash. Full undo/redo is retained. Compression reduces disk use but does not yet eliminate full replay in memory.

## Agent trials and limits of evidence

Three interactive trials were completed after the engineering work: a reading-club poster using an asset, a marsh illustration from primitives, and local refinement of a supplied rough pear raster. The assistant inspected initial PNGs, recorded findings, chose corrections after inspection, and inspected final PNGs. The benchmark driver contains no corrective patches. Saved audits capture the actual edits, including the caption bug and subsequent repair.

These are same-agent authoring and critique, not blinded or independent human evaluations. The briefs were authored in this task; they are not a held-out test set. Token usage is recorded as unavailable because the host did not expose it. Mechanical results include pixel locality, cold/cache equality and self-contained export equality. This is evidence that the workflow can be exercised end to end, not evidence of general artistic superiority.
