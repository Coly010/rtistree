# Changelog

## [0.5.2](https://github.com/Coly010/rtistree/compare/v0.5.1...v0.5.2) (2026-09-09)


### Bug Fixes

* **docs:** align guides and examples with current behavior ([0f73e58](https://github.com/Coly010/rtistree/commit/0f73e583e8a4c5ee0f597e1fa6419f33f43832a1))
* **release:** automate changelogs and publish through npm OIDC ([31f6e78](https://github.com/Coly010/rtistree/commit/31f6e78db8d18e6d62ca9339d4ba635e8d0103cd))
* run source CLI outside the checkout and document agent workflow ([b0ce587](https://github.com/Coly010/rtistree/commit/b0ce5873abf377d42441e42a524fcf43d3b0acf6))

## 0.5.1

- Make `rtistree` the primary CLI executable; retain `graphics` as a compatibility alias.
- Add `rtistree init <directory>` to create a starter scene, sample edit, SDK example and npm render script without copying from node_modules. Existing paths are refused.
- Align the README, npm package and getting-started guide around one tested workflow.

## 0.5.0 — Initial public alpha

- Deterministic JSON/YAML scenes, CPU Skia rendering and portable project exports.
- CLI, TypeScript SDK and MCP server with inspection, focused edits and undo/redo.
- Seeded painting programs, replayable recipes, dependency pipelines and staged art production.
- Versioned art-direction guidance shipped through MCP initialization, resources, CLI and SDK.
- Figure, prop and locomotion checks informed by recorded asset-trial feedback.
- Technical, functional and visual review criteria kept separate.
- MIT license, installation examples, documentation website and package installation checks.

Pre-1.0 APIs may change. Byte-identical rendering is tested on the same pinned runtime
and platform; cross-platform byte identity is not promised. The engine does not include
an LLM or an automatic artistic-quality judge.
