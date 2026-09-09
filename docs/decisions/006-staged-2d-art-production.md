# 006 — Staged 2D art production

Accepted: 2026-09-09.

Keep the CPU Skia/TypeScript engine and its native Canvas and pixel escape hatches. Do not introduce a 3D renderer or image-generation dependency. Build an agent-operated production workflow around the existing painter.

A production plan defines a brief and ordered stages, each with visible acceptance criteria. Candidates freeze the scene, its build graph, the composite, thumbnail, optional detail crops and technical report. An observer supplies hash-bound brief-fidelity and artistic-quality ratings plus evidence for every stage criterion. Technical verification remains separate: an empty rule set is reported as such, and a successful render does not prove good art. Selection restores a candidate through an undoable scene transaction. Advancement requires the selected candidate to remain the current scene. Scores are stage-relative, subjective observations, not calibrated universal art metrics.

Editable raster programs form an explicit DAG. Each node subscribes to named shared parameters and image dependencies. Build keys include exact source, parameters, dimensions, seed, frozen input hashes, runtime and technique version. Unchanged nodes reuse verified outputs; dependants rebuild when their input content changes. A failed node cannot partially update the scene. Rendering never executes code. Builds pin the actual executed source in scene metadata, so candidate selection and portable export retain editable recipes as well as baked pixels.

Keep reusable methods at the technique level: bristle strokes, pressure, dry paint, glazing, scumbling, palette interpolation, atmospheric colour and weave. Subject anatomy and composition belong to authored artwork, not dragon-specific engine commands. Existing raw Canvas paths, arbitrary pixel fields, masks and warps remain available.

Tradeoffs: this is an agent-operated atelier, not a prompt-to-art generator. The caller must plan, draw, inspect and judge. Local worker execution remains trusted-code execution, not a security sandbox. Bristle strokes approximate digital paint; they do not simulate pigment chemistry or wet paint. Cached outputs and candidate journals have no automatic garbage collector yet. Session review state stays local; portable scene export preserves the selected art and inline build graph, not all rejected candidates and reviews.
