# ADR 001: TypeScript control plane and native CPU Skia renderer

Status: accepted for the MVP. Later extensions and superseded limitations are documented in [ADR 003](003-editing-refinement-and-agent-validation.md).

## Context

The architecture proposal suggests TypeScript and a Canvas-style renderer. This is not a requirement. The implementation needs reproducible text, paths, assets, masks, compositing, raster operations, and an ergonomic agent interface. It does not need a browser, interactive GUI, or GPU. The user explicitly authorized choosing any suitable language and ecosystem.

## Decision

Use TypeScript on Node.js 22+, with native Skia supplied by `@napi-rs/canvas`. Use Zod for runtime validation and typed commands, YAML/JSON for authoring, and the official MCP TypeScript SDK for stdio agent tools. Keep renderer, verifier, and agent decisions separate. Use ordinary modules in one package, rather than prematurely publishing a monorepo of packages.

TypeScript serves the structured data and agent-facing control plane. CPU Skia supplies the expensive graphics primitives in native code. Pixel adjustments currently use typed arrays in TypeScript; that is the first candidate for profiling-driven native optimization.

This is **not a WebGL implementation**. There is no browser, DOM, canvas element, GPU driver requirement, or browser automation in the rendering path. The native package offers a familiar Canvas 2D API, which is an API shape rather than a browser dependency.

## Alternatives considered

| Alternative                 | Strength                                  | Reason not selected initially                                                                                                                        |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python + Pillow/Cairo       | Mature image analysis and raster tooling  | More integration work to unify paths, font layout, compositing and the chosen typed command surface; remains reasonable for verification extensions. |
| Rust + Skia/tiny-skia       | Tight memory control and efficient pixels | Larger build/distribution surface before proving the agent representation. A native raster kernel can be added behind the same API.                  |
| Browser Canvas/WebGL/WebGPU | Interactive previews and GPU throughput   | Browser/driver variation and setup add complexity to a CPU-first, headless engine.                                                                   |
| SVG + rasterization         | Excellent vector composition              | Local raster editing, operation history and tiles still need a separate raster subsystem.                                                            |

## Consequences

- Rendering works locally with prebuilt native binaries, bundled fonts and no service credentials.
- Same input bytes, package lock, font bytes, renderer version and runtime/platform produce repeatable PNGs. Cross-platform or cross-version byte identity is not claimed.
- System font loading is disabled by the native adapter. Latin font packages and hashes are explicit dependencies. Applications embedding the SDK should not preload a separate native canvas font registry.
- Region rendering initially composites the full canvas, then crops exact pixels. Draft is a downsampled full render. These are correctness features, not performance optimizations.
- Full-canvas layer surfaces trade memory for simple correct composition. A surface budget rejects oversized scenes. Dirty-tile caches and region-aware kernels are later work.
- An external agent can supply natural-language planning and visual critique through MCP; the engine does not call a particular model provider.

References: [native Canvas/Skia binding](https://github.com/Brooooooklyn/canvas), [Zod validation](https://zod.dev/basics), [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
