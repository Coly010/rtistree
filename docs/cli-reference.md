# CLI reference

Installing Rtistree exposes `rtistree` and the compatibility alias `graphics`. In a local npm project, use `npx rtistree`.
Run `rtistree --help` for the complete installed-version reference. Structured results go to
stdout as JSON; errors go to stderr. Verification failure exits 2; other errors exit 1.

## Create a starter

```sh
npx rtistree@latest init my-art
cd my-art
npm install
npm run render
```

The destination must be a new directory. The starter includes a scene, sample patch, SDK example
and npm render scripts. No packages are installed and no code is executed by `init` itself.

## Inspect and edit

```sh
rtistree inspect scene.json
rtistree inspect scene.json --layer title
rtistree inspect-region scene.json 0 0 100 100
rtistree render scene.json -o image.png
rtistree render-region scene.json 0 0 100 100 -o crop.png
rtistree apply scene.json patch.json
rtistree undo scene.json
rtistree redo scene.json
rtistree history scene.json
```

Coordinates are `x y width height` in canvas pixels. A patch contains a reason and a typed
commands array. Supply the current `expected_hash` when coordinating concurrent edits.
See [scene format](scene-format.md) for command shapes and coordinate rules.

## Verify, review and export

```sh
rtistree verify scene.json -o report.json --heatmap heatmap.png
rtistree critique scene.json critique.json
rtistree export scene.json -o portable/scene.json
rtistree export scene.json --format png -o image.png
```

Verification measures configured technical constraints. Critiques are authored after inspecting
images and bound to the current scene. Exports for physical documents and printer profiles are
described in [print production](production.md).

## Studio and production

```sh
rtistree art-guide
rtistree studio-help
rtistree program scene.json program.json
rtistree program-replay scene.json asset-id
rtistree pipeline scene.json pipeline.json
rtistree production scene.json request.json
```

Read [studio](studio.md) for program requests and [staged production](atelier.md) for plans,
candidate captures, reviews and selection. Program execution is for trusted code only.

## Project creation and integration

```sh
rtistree project new artwork --size A3 --orientation landscape --ppi 300 --bleed 3mm
rtistree schema --kind scene
rtistree schema --kind command
rtistree serve /absolute/path/to/scene.json
```

The MCP server uses stdio. See [agent setup](agent-setup.md).
