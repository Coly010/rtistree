# CLI reference

Installing Rtistree exposes `rtistree` and the compatibility alias `graphics`. In a local npm project, use `npx rtistree`.
Run `rtistree --help` for the complete installed-version reference. Structured results go to
stdout as JSON; errors go to stderr. Failed verification/preflight and non-identical recipe replay exit 2; input/runtime errors exit 1.

## Create a starter

```sh
npx rtistree@latest init my-art
cd my-art
npm install
npm run render
```

The destination must be a new directory. The starter includes a scene, sample patch, SDK example
and npm render scripts. `init` writes starter files without installing dependencies or executing painting programs.

## Inspect and edit

```sh
npx rtistree inspect scene.json
npx rtistree inspect scene.json --layer title
npx rtistree inspect-region scene.json 0 0 100 100
npx rtistree render scene.json -o image.png
npx rtistree render-region scene.json 0 0 100 100 -o crop.png
npx rtistree apply scene.json patch.json
npx rtistree undo scene.json
npx rtistree redo scene.json
npx rtistree history scene.json
```

Coordinates are `x y width height` in canvas pixels. A patch contains a reason and a typed
commands array. Supply the current `expected_hash` when coordinating concurrent edits.
See [scene format](scene-format.md) for command shapes and coordinate rules.

## Verify, review and export

```sh
npx rtistree verify scene.json -o report.json --heatmap heatmap.png
npx rtistree critique scene.json critique.json
npx rtistree export scene.json -o portable/scene.json
npx rtistree export scene.json --format png -o image.png
```

Verification measures configured technical constraints. Critiques are authored after inspecting
images and bound to the current scene. Exports for physical documents and printer profiles are
described in [print production](production.md).

## Studio and production

```sh
npx rtistree art-guide
npx rtistree studio-help
npx rtistree program scene.json program.json
npx rtistree program-replay scene.json asset-id
npx rtistree pipeline scene.json pipeline.json
npx rtistree production scene.json request.json
```

Read [studio](studio.md) for program requests and [staged production](atelier.md) for plans,
candidate captures, reviews and selection. Program execution is for trusted code only.

## Project creation and integration

```sh
npx rtistree project new artwork --size A3 --orientation landscape --ppi 300 --bleed 3mm
npx rtistree schema --kind scene
npx rtistree schema --kind command
npx rtistree serve /absolute/path/to/scene.json
```

The MCP server uses stdio. See [agent setup](agent-setup.md).

## Additional commands

| Command                                                     | Purpose                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npx rtistree rebase scene.json`                            | Merge manual source changes into journaled state; conflicts fail without committing |
| `npx rtistree compact scene.json`                           | Compress history while retaining undo and redo                                      |
| `npx rtistree raster-read scene.json read.json`             | Write an exact crop plus evidence and return an asset descriptor                    |
| `npx rtistree raster-write scene.json write.json`           | Commit an exact-size PNG patch with a required current hash                         |
| `npx rtistree import-svg drawing.svg -o drawing.scene.json` | Import the supported static SVG subset                                              |
| `npx rtistree preflight artwork --preset screen`            | Check physical document/export settings and save a report                           |
| `npx rtistree proof artwork --preset print -o proof.png`    | Make a CMYK round-trip proof; requires a configured ICC profile                     |
| `npx rtistree benchmark scene.json brief.json before`       | Capture a benchmark checkpoint after recording a current critique                   |
| `npx rtistree benchmark scene.json brief.json finish`       | Finish after at least two inspected checkpoints                                     |

Dense request shapes are in [studio](studio.md). Source rebasing, critiques and benchmark
requirements are in [editing workflows](evolution.md). Names such as `patch.json`, `read.json`
and `critique.json` are request files you author, not files created by `init`.

## Options, paths and output

- `--output` / `-o` chooses an artifact path. Explicit paths and request filenames resolve
  from the shell's working directory. Asset/program paths inside requests resolve from the
  artwork project root. Without `-o`, configured projects use `output_dir`; bare scene files
  use a `renders/` directory alongside the scene.
- `render --quality draft|preview|final` controls PNG rendering. Draft halves dimensions
  after rendering; preview and final share the full-quality path. `--layer ID` renders an
  isolated layer on a full-size transparent canvas. `render-region` requires an integer crop
  entirely inside the canvas; default/final quality is an exact full-render crop.
- `inspect-region` also writes `inspection.png` and its evidence unless you supply `-o`.
- Artwork `export` and full `render` accept `--format`, `--preset` and `--ppi`. Known output
  extensions are inferred. Print exports additionally accept `--profile` (project-relative
  ICC file; implies CMYK), `--colour-space srgb|cmyk` and `--crop-marks`. Use `export` for
  print options; a plain PNG `render` with only `--profile` does not select the export path.
- `schema --kind scene` describes a resolved scene. Source scenes with includes/components
  use the packaged `authoring.schema.json`; a patch uses `patch.schema.json`.

JSON is the structured result format; help is plain text and `serve` writes MCP protocol
messages. The npm/npx launcher can print its own installation notices. `verify` and
`preflight` failures, and non-identical `program-replay` results, exit 2. Input/runtime/export
errors exit 1. Warnings alone do not make preflight fail. Program or pipeline build success
only means execution succeeded; it does not establish visual quality.
