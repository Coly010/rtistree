# Producing art in stages

Start with [Art direction for agents](agent-art-workflow.md): reference study, distinct silhouettes, construction, grayscale values and targeted revision. Its protocol is included in CLI/MCP `studioHelp`.

Rtistree provides the tools and records; a human or agent still makes visual decisions. No image-generation service or 3D renderer is required. Start with `rtistree studio-help` for the synchronous painting API and technique catalogue.

## Working sequence

1. Describe the brief and create a production plan. Set stage-specific criteria before making candidates: composition at thumbnail size; value masses at block-in; anatomy and lighting at form; directional paint and depth at materials; focal hierarchy and consistency at finishing. Do not demand finished texture from thumbnails.
2. Author separate painting programs and an editable pipeline JSON. Generate two or three inexpensive compositions by reducing node dimensions. Auto-created raster layers fill the scene canvas, so small assets can serve as previews.
3. Build explicitly, capture each candidate and compare their images. Open the returned PNG and relevant detail crops. Record what you actually see against every criterion.
4. Select an eligible candidate. Selection restores its layers, assets and frozen inline pipeline, and can be undone. A candidate cannot replace an incumbent with a lower fidelity or quality rating. Unreviewed candidates and technical failures cannot be selected.
5. Advance only while the selected scene is still current. Repeat at the next stage and higher resolution. If a criterion fails, make another candidate; do not lower the criterion merely to finish.
6. Export the selected scene and audit a cold render, portable render and recipe replay. Report remaining aesthetic limitations separately from technical checks.

CLI actions also have SDK equivalents (`buildPipeline`, `production`) and MCP tools (`buildPipeline`, `production`). Structured errors stop the operation. Normal rendering reads baked images and never runs program code.

## Editable dependency graph

These examples assume an installed package and an existing scene project; see
[the first painting](studio.md#first-painting). Save the graph as `pipeline.json`,
create `programs/ground.js` inside the artwork project, and make that program return
a Canvas of the requested dimensions. For a minimal ground program, use
`return art.raster(() => [38, 62, 69, 255]);`. Source paths inside the graph resolve
from the artwork project root; the CLI request filename resolves from your shell directory.

```json
{
  "version": 1,
  "id": "painting",
  "shared": { "warmth": 0.4 },
  "nodes": [
    {
      "id": "ground",
      "target": "ground",
      "source": "programs/ground.js",
      "width": 1200,
      "height": 800,
      "bindings": { "warmth": "warmth" },
      "seed": 42
    },
    {
      "id": "glaze",
      "target": "glaze",
      "code": "const c=art.input('base'); art.techniques.glaze(c,'#a88152',0.08); return c;",
      "width": 1200,
      "height": 800,
      "inputs": { "base": { "node": "ground" } }
    }
  ]
}
```

`rtistree pipeline my-project pipeline.json` reports `built` or `cached` for each node. An input can instead use `{ "asset": "registered-asset-id" }`. Source and inline code are mutually exclusive. Only subscribed shared parameters enter a node's key. Per-node parameters override nothing implicitly: an explicit binding takes precedence over a parameter of the same name. A changed node whose PNG is identical need not rebuild its dependants. Node array order defines auto-created layer order; dependency order defines execution order. Existing layer geometry is preserved. Changing output resolution changes cache keys. Removing a node does not remove previously authored layers or assets; use normal scene commands for removal.

All node artifacts are baked before one scene transaction. The CLI takes the graph
as the request file directly. To pass a previously inspected `expected_hash`, use
the SDK third argument or MCP’s separate `expected_hash` field. A failed build can leave unused immutable files in the cache, but never a partially updated scene. Identical builds add no history. Use `expected_hash` with the SDK/MCP to reject a scene changed since inspection.

The exact executed graph, including inline source, is stored under `scene.metadata.pipeline_<id>`. After restoring a candidate, use that graph to resume its settings; a working `pipeline.json` file is deliberately not overwritten by selection. Portable export includes the selected graph and registered input assets, so it can rebuild without the original source files.
It does not copy production sessions, rejected candidates, reviews or edit history; retain
the original project if you need those records.

## Production requests

Create a plan with `rtistree production my-project plan.json`:

```json
{
  "action": "plan",
  "plan": {
    "id": "landscape",
    "brief": "A quiet mountain valley at dawn",
    "stages": [
      {
        "id": "thumbnails",
        "goal": "Choose the value composition",
        "minimum_fidelity": 0.7,
        "minimum_quality": 0.7,
        "criteria": [
          { "id": "depth", "description": "Three distance planes read at thumbnail size" }
        ]
      }
    ]
  }
}
```

Use `{ "action": "capture", "session": "landscape", "candidate": "warm-dawn", "expected_hash": "<current scene hash>", "crops": [[100,100,200,150]] }`. The result includes a directory containing the image, thumbnail, scene and requested `detail-N.png` files. Candidate IDs cannot be overwritten. Capture supports up to 8 integer canvas-space crops. Session capacity is 64 candidates.

Use `compare` with the session ID for a labelled contact sheet and ranked reviews. Ranking is eligibility first, then artistic quality, then brief fidelity; it never blends technical and visual scores.

A `review` request includes session and a review object with `candidate`, exact `scene_hash` and `png_hash` from capture, `reviewer`, `method` (`human` or `vision-agent`), `fidelity` and `quality` in 0–1, `strengths`, `weaknesses`, and `criteria: [{id, pass, evidence}]`. Every criterion must be covered exactly once. These fields must be authored after visual inspection; Rtistree does not provide an automatic critic.

Use `select` with session, candidate and current `expected_hash`, then `advance` with session and the resulting scene hash. The final advance marks the session complete. `status` returns the plan, stage, candidates and selections. Session metadata writes are locked; scene writes use the existing journal lock and stale-scene guard. A failure writing session metadata after selection may require repeating selection; the scene transaction remains undoable.

JSON schemas: `schemas/pipeline.schema.json` and `schemas/production.schema.json`.

## Painting techniques and escape hatches

```js
const canvas = art.canvas();
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#263e45';
ctx.fillRect(0, 0, art.width, art.height);
ctx.save();
ctx.clip(art.path('M20 180 Q160 30 300 180 L300 230 L20 230Z'));
art.techniques.stroke(
  canvas,
  [
    { x: 30, y: 170, pressure: 0.3 },
    { x: 130, y: 120, pressure: 1 },
    { x: 260, y: 170, pressure: 0.2 },
  ],
  { preset: 'oil', size: 24, colour: '#c7b685', dryness: 0.25, opacity: 0.6 },
);
art.techniques.glaze(canvas, '#b69357', 0.08);
ctx.restore();
return canvas;
```

`oil`, `filbert`, `scumble` and `ink` presets expose size, bristle count, variation, opacity, dryness and taper. Pressure controls width; overlapping strands accumulate paint. Presets are starting settings, not complete art styles. All methods respect current clipping and transforms, preserve context state and use the seeded RNG. Keep the runtime and technique version pinned for replay.

`art.techniques.mix` interpolates sRGB palette colours. `atmosphere` is the same operation applied toward a haze colour; it does not establish perspective for you. `weave` overlays sparse crossed lines; it should remain subordinate to form. See `examples/technique-study` for an executable swatch sheet.

For anything these helpers cannot express, use `canvas.getContext('2d')`, `art.path(svgPathData)`, pixel buffers, coordinate warps, custom masks and explicit raster edits. No new abstraction is required to paint a new subject.

The user rejected the artistic quality of the first dragon trial. The follow-up in `examples/dragon-foundation` retains failed reviews and stops before decoration. The original trial in `examples/dragon-oil-trial` records three composition candidates, successive stage reviews, editable source and a reproducibility audit. It is one stylized painting trial, not evidence of universal artistic excellence.
