# ADR 005: Programmable raster authoring with baked, replayable recipes

Status: accepted for v0.4.

The user wants an agent to work like a traditional digital artist, including creating detailed scenes without image-generation models. Additional declarative shapes alone do not provide a practical route to arbitrary textures and painted detail. We therefore add a programmable authoring boundary while retaining the deterministic scene engine.

JavaScript is the authoring language because it can share the existing native Canvas ecosystem and typed SDK. No additional runtime dependency is needed. A synchronous program receives seeded field, brush, sampling, displacement and height-lighting helpers plus a native Canvas context. The agent can implement another algorithm directly when the provided vocabulary is insufficient. The API is available through CLI, SDK and MCP, including inline source and a machine-readable help tool for agents without filesystem access.

Program execution is explicit and produces a baked asset. A recipe pins source text, parameters, seed, input snapshots and output hash. Playback never evaluates project code. This preserves portable scene rendering and the existing history model, and avoids making ordinary scene loading an implicit code-execution boundary. Recipes can be exported and explicitly replayed. A live procedural dependency graph is not introduced in this milestone.

Workers provide cancellation and V8 heap limits; helper allocations and output dimensions are checked separately. The VM is not represented as a security sandbox, because native Canvas objects expose host methods and native allocation is outside V8 accounting. Only trusted code should be executed. A hardened plugin runtime or OS isolation would be a separate design.

Dense region editing uses existing promoted raster regions, extended with explicit `replace` and `over` semantics. Exact-size PNGs carry dense data instead of JSON pixel arrays. Transactions check stale scene hashes and edit locality. Attached patches follow object transforms. The trial found a near-zero pressure gradient failure; a minimum subpixel dab radius fixes it. Region testing also corrected final print-region copy bounds to use the transformed frame.

The artistic evaluation is kept separate from mechanical verification. The wheel trial reproduces its pixels without external image inputs, but still reads as a synthetic illustration. Successful software tests and deterministic replay are not evidence of human-level artistic skill or photographic realism. See [the studio guide](../studio.md) and [trial](../../examples/manual-wheel-trial/README.md).
