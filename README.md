# Rtistree

**Programmable graphics for AI agents.** Create reproducible artwork, inspect the result,
refine individual parts, and export usable assets with built-in art-direction guidance.

[Documentation](https://rtistree.dev/docs/getting-started/) · [Examples](https://rtistree.dev/examples/) · [Contributing](CONTRIBUTING.md)

Rtistree is a local Node.js graphics engine with a CLI, TypeScript SDK and MCP server.
JSON/YAML scenes retain structure; seeded painting programs bake to replayable raster assets.
Edits have history and undo. PNG, JPEG, TIFF, PDF, SVG and portable projects are outputs.
Rendering uses native CPU Skia and requires no model API key, browser or GPU.

**Public alpha · v0.5.1 · MIT.** APIs may change before 1.0. Technical checks do not judge artistic quality.

![Poster rendered by Rtistree](https://raw.githubusercontent.com/Coly010/rtistree/main/docs/previews/poster.png)

## Make your first image

Requires **Node.js 22+** and npm. Linux and macOS are covered by CI.

```sh
npx rtistree@latest init my-art
cd my-art
npm install
npm run render
```

Open **hello.png**. The starter includes an editable scene, a sample local edit,
an SDK example and npm scripts. `init` creates a new directory and refuses existing paths.

To brighten the disc and then undo the edit:

```sh
npx rtistree apply scene.json refine.json
npx rtistree render scene.json -o brighter.png
npx rtistree undo scene.json
```

Follow the [getting-started guide](https://rtistree.dev/docs/getting-started/) for a walkthrough
of the files, image comparisons, undo, portable export and SDK usage.

For an existing Node project, use `npm install rtistree`. The primary executable is
**`rtistree`**; **`graphics` remains a compatibility alias**. `npx rtistree --help` lists commands.
Structured output is JSON. Verification failures exit 2; other errors exit 1.

## Use with an agent

Read the included guidance before creating artwork:

```sh
npx rtistree art-guide
npx rtistree serve /absolute/path/to/my-art/scene.json
```

The second command starts the MCP server over stdio. See [agent setup](docs/agent-setup.md)
for a client configuration and SDK integration.

MCP clients receive concise instructions during initialization and can read the full guide
through `studioHelp` or `rtistree://guides/art-direction`. CLI agents use `rtistree art-guide`;
SDK hosts can expose `rtistreeAgentInstructions` and `artDirectionGuide`.

The guide covers representative samples, silhouettes, connected anatomy, prop perspective,
ground contact and separate technical, functional and visual acceptance. Availability does
not guarantee that every client supplies the guidance or every model follows it.

## Learn the engine

- [Getting started](docs/getting-started.md) and [CLI reference](docs/cli-reference.md)
- [Agent setup](docs/agent-setup.md) and [art-direction workflow](docs/agent-art-workflow.md)
- [Scene format](docs/scene-format.md) and [programmable studio](docs/studio.md)
- [Staged production](docs/atelier.md) and [print/export](docs/production.md)
- [Recorded asset trial](examples/warden-asset-trial/README.md)
- [Architecture and evidence](docs/engine-overview.md), [changelog](CHANGELOG.md), [release process](docs/releasing.md)

The npm package includes a small runnable starter, documentation and schemas. Larger trials
live in the GitHub repository; clone it to reproduce them.

## Development

```sh
git clone https://github.com/Coly010/rtistree.git
cd rtistree
npm ci
npm run check
npm run demo
npm run package:check
```

For website development and contribution guidance, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Limits and trust

Byte-identical replay is tested on the same pinned runtime and platform; cross-platform
Skia byte identity is not promised. The working renderer is 8-bit sRGB. Print exports do
not claim PDF/X certification, spot colours or overprint.

Programs and recipes execute trusted JavaScript. The VM is **not a security sandbox**;
normal rendering only reads baked assets. See [SECURITY.md](SECURITY.md).

Rtistree includes neither an LLM nor an automatic visual critic. An agent or human must
inspect the images and author honest reviews.

## License

Copyright © 2026 Colum Ferry. [MIT](LICENSE). Fonts and dependencies retain their own
licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
