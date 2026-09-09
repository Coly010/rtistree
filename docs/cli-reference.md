# CLI reference

Installing Rtistree exposes `graphics`. In a local npm project, use `npx graphics`.
Run `graphics --help` for the complete installed-version reference. Structured results go to
stdout as JSON; errors go to stderr. Verification failure exits 2; other errors exit 1.

## Inspect and edit

```sh
graphics inspect scene.json
graphics inspect scene.json --layer title
graphics inspect-region scene.json 0 0 100 100
graphics render scene.json -o image.png
graphics render-region scene.json 0 0 100 100 -o crop.png
graphics apply scene.json patch.json
graphics undo scene.json
graphics redo scene.json
graphics history scene.json
```

Coordinates are `x y width height` in canvas pixels. A patch contains a reason and a typed
commands array. Supply the current `expected_hash` when coordinating concurrent edits.
See [scene format](scene-format.md) for command shapes and coordinate rules.

## Verify, review and export

```sh
graphics verify scene.json -o report.json --heatmap heatmap.png
graphics critique scene.json critique.json
graphics export scene.json -o portable/scene.json
graphics export scene.json --format png -o image.png
```

Verification measures configured technical constraints. Critiques are authored after inspecting
images and bound to the current scene. Exports for physical documents and printer profiles are
described in [print production](production.md).

## Studio and production

```sh
graphics art-guide
graphics studio-help
graphics program scene.json program.json
graphics program-replay scene.json asset-id
graphics pipeline scene.json pipeline.json
graphics production scene.json request.json
```

Read [studio](studio.md) for program requests and [staged production](atelier.md) for plans,
candidate captures, reviews and selection. Program execution is for trusted code only.

## Project creation and integration

```sh
graphics project new artwork --size A3 --orientation landscape --ppi 300 --bleed 3mm
graphics schema --kind scene
graphics schema --kind command
graphics serve /absolute/path/to/scene.json
```

The MCP server uses stdio. See [agent setup](agent-setup.md).
