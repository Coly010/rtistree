# ADR 002: Composable scene sources with a transactional resolved state

Status: accepted for the MVP.

## Context

An agent-friendly scene should not require one enormous file. Background, copy, products, textures, and assets need independent authoring and inspection. At the same time, a render must consume one unambiguous state, and an edit batch must either commit completely or leave that state unchanged.

## Decision

A root YAML/JSON scene can include fragments containing assets, layers, and more includes. Include paths and asset paths are relative to the declaring file. Includes are expanded depth-first in declaration order; local layers follow included layers. IDs share one namespace, and duplicate IDs, missing references, cycles and path escapes are errors. Fragments cannot replace the canvas or verification rules. Those belong to the root manifest.

The loader normalizes this graph into the canonical scene schema. A single scene file remains supported. Modularity is an authoring concern; the renderer sees a complete, validated scene tree and never performs file inclusion itself.

Persist agent edits in a hash-chained append-only journal alongside the authoring sources. The sources remain the baseline; replaying the journal yields the working state. Each transaction contains a resolved snapshot, command list, reason, source and state hashes, asset hashes, and locality measurements. Undo and redo are also journal entries. Writers take an exclusive project lock, validate the candidate scene, render it, check locality for scoped edits, append the record and synchronize it to disk.

Exporting produces a new flat baseline scene with content-addressed raster assets. This is also the supported way to start a new authoring/history cycle. Export does not rewrite the original fragments. A caller may split an exported baseline into fragments before making new agent edits.

## Consequences

- Projects can be organized by semantic responsibility without coupling the renderer to file layout.
- An edit never partly rewrites several fragments. Rejected patches have no persisted effect.
- History uses complete state snapshots for transparent recovery and deterministic undo; storage is linear in scene size times edit count. Delta compression and content-addressed state snapshots are future optimizations.
- Scene-source changes during an active history are rejected, rather than silently rebased. Restore original sources and export before restructuring an edited project.
- Assets stay external. Export pins hashes, and history records and checks exact asset bytes.
- Include instances are not templates: including the same IDs twice is an error. Parameterized components and namespaced instances are future capabilities.
- Operation/mask/tile bounds use global canvas coordinates. Geometric layer bounds use parent coordinates. This makes raster scope contracts easy to measure, but a later semantic move does not automatically move previous world-space paint operations.
- The final-composite locality guard may reject a child edit beneath a blurred ancestor or a mask dependency. Editing the enclosing composited group is the appropriate alternative. The engine does not silently broaden scope.
