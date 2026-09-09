# Programmable digital art in v0.4

The studio is the escape hatch below scene abstractions. An agent can build an image using paths and gradients, paint pressure-sensitive strokes, calculate pixel colours, sample textures, or write a custom image-processing algorithm. No image-generation model is used by these tools.

Scene layers still describe composition. Programs produce ordinary pinned PNG assets and can replace the source of a raster/image layer. Their exact source, seed, parameters, input snapshots and output hash are saved as a recipe. Rendering, inspecting and opening a scene never runs a program. Re-execution is explicit, and existing edits remain undoable.

## First painting

```sh
rtistree project new study --size 100x100
rtistree studio-help
```

Save this as `study/programs/rubber.js`:

```js
const height = (x, y) => 18 * Math.sin(x / 80);
return art.raster((x, y) => {
  const grain = (art.fbm(x / 20, y / 20) - 0.5) * 5;
  return art.light(art.normal(height, x, y), [40 + grain, 47 + grain, 51 + grain, 255], {
    light: [-0.6, -0.4, 1],
    specular: 0.06,
    shininess: 20,
  });
});
```

Save a request as `study/paint.json`:

```json
{
  "source": "programs/rubber.js",
  "asset_id": "rubberPaint",
  "target": "rubber",
  "width": 400,
  "height": 400,
  "seed": 2020,
  "parameters": {},
  "reason": "Paint a curved rubber material using height-field lighting"
}
```

```sh
rtistree program study study/paint.json
rtistree render study -o study/output/rubber.png
rtistree program-replay study rubberPaint
```

Supply exactly one of `source` (a project-local JavaScript file) or `code` (an inline function body). A program receives `art` and `parameters`, runs synchronously and returns one Canvas with the declared dimensions. It cannot import modules through the public API. A new `target` creates a raster layer; an existing target must accept an image source. Omit `target` to register an asset for subsequent mask, region or layer operations. The runner captures the starting scene hash and rejects a concurrent edit before committing.

## Authoring vocabulary

`rtistree studio-help` and the MCP `studioHelp` tool expose the complete signatures and a runnable example. TypeScript consumers can use `RasterStudio` from the SDK.

| API                                             | Purpose                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `canvas`, `getContext('2d')`                    | Native paths, fills, transforms, compositing, gradients and text                |
| `raster`, `pixels`, `put`                       | Arbitrary pixel functions and dense typed-array editing                         |
| `brush`                                         | Round dabs with pressure, hardness, per-dab opacity, spacing and seeded scatter |
| `noise`, `fbm`, `random`                        | Coordinate-addressed textures and repeatable random sequences                   |
| `polar`, `repeat`, `mix`, `clamp`, `smoothstep` | General coordinate and field construction                                       |
| `sample`, `warp`, `displace`                    | Bilinear sampling and arbitrary inverse coordinate mappings                     |
| `normal`, `light`                               | Height-field normals, Lambert diffuse and Blinn–Phong highlights                |
| `blur`                                          | Softening and intermediate layer preparation                                    |
| `input`                                         | A mutable Canvas copy of a named frozen input image                             |

Brush pressure affects radius and alpha. Opacity applies to each dab, so strokes accumulate paint. Spacing is measured as a fraction of the requested radius; scatter is also radius-relative. Brushes use the canvas context's current transform. Dabs below 0.01 pixel radius are omitted to avoid degenerate native gradients. These are round brushes, not a complete simulation of paint, bristles or wet media.

Pixel functions use integer pixel-centre coordinates and four finite 0–255 sRGB channels. Native surfaces store premultiplied alpha: fully transparent hidden RGB is not preserved, and semi-transparent samples can round on conversion. Sampling interpolates premultiplied colour to avoid dark fringes. Edge modes are transparent, clamp or repeat. Warp callbacks map **destination coordinates to source coordinates**. Displacement adds its field to the source sampling coordinates.

Height-field lighting is an artistic 2.5D calculation, with the viewer along positive Z. It does not provide ray-traced reflections, refraction, global illumination, occlusion or cast shadows. Those effects can be painted, approximated in code, or supplied as baked assets from an external traditional graphics tool.

## Dense regional edits

`readRasterRegion` / `rtistree raster-read PROJECT request.json` read a PNG crop of the composite or an isolated layer. The request contains integer canvas-space `bounds` and an optional `target`. The result includes the scene hash and an asset descriptor ready for `registerAsset`.

`writeRasterRegion` / `rtistree raster-write PROJECT request.json` consumes:

```json
{
  "target": "rubber",
  "region_id": "scuff",
  "source": "output/scuff.png",
  "bounds": [40, 60, 80, 80],
  "space": "layer",
  "composite": "over",
  "expected_hash": "sha256:REPLACE_WITH_CURRENT_SCENE_HASH",
  "reason": "Paint a local abrasion without changing the rest of the layer"
}
```

The source must be a project-local PNG matching the region's exact dimensions. `replace` clears/replaces the region, including alpha; `over` composites it onto the previous pixels. The command creates or updates a named promoted region at scale 1 and stores an immutable copy of the PNG. `space: layer` captures reference dimensions, so the patch follows later transforms and resizing. `space: canvas` stays at canvas coordinates. Existing layer masks/effects still apply; locality validation rejects changes leaking outside the declared region. Undo/redo restores the prior image.

For a custom filter, register the descriptor returned by the read, pass that asset to `runProgram.inputs`, calculate the new pixels, and write the returned PNG into a region. Use the latest scene hash returned by each mutation. Canvas-space reads cannot automatically become local-space reads of a rotated object; use canvas-space patch coordinates for a direct read/edit/write round trip.

## Reproducibility and execution limits

Recipes live under `recipes/<hash>/`. Each recipe stores the exact JavaScript source text, source hash, parameters, seed, studio version, Node/Skia versions, frozen input PNG hashes and output hash. Inputs are normalised to sRGB before execution. Portable project export copies the recipe and its input snapshots, without executing them. `program-replay` executes a selected recipe and compares the resulting PNG hash; equality is expected on the same pinned runtime/platform, not universally across machines.

Programs execute only when explicitly requested and must be trusted code. A worker and VM provide convenience isolation and cancellation, **not a security sandbox**: native objects expose host methods. The public API does not expose filesystem/network access, and its `Math.random` is seeded; Date/performance are absent. Do not treat these properties as hostile-code containment.

The runner checks a 16-megapixel output limit, 16 input images, an 8,192-pixel edge, 256 KiB source, 64 KiB parameters, and up to 30 seconds of execution. The parent watchdog allows two additional seconds for worker setup. Studio helper allocations are capped at 32 cumulative megapixels including inputs; V8's heap limit is 256 MiB. Native Canvas buffers and arbitrary allocations made through exposed native objects are outside the V8 accounting, so these limits are not an OS memory quota. Scene rendering retains its separate surface budget.

The studio has no live dependency graph. Changing program code, parameters or an input does not automatically rebake dependent assets. Explicit execution replaces a target source through the existing transaction/history mechanism. If execution or commit fails, the scene is unchanged; a late failed commit can leave unreferenced content-addressed artifacts.

## Trial

The [manual wheel trial](../examples/manual-wheel-trial/README.md) used no model-generated or downloaded imagery. Its eight layers were painted with code, geometry, material fields, text and brushes. Source, recipes, initial/refined images, critiques and replay checks are retained. The result demonstrates a reproducible digital illustration; its visual evaluation explicitly leaves photographic realism unachieved.
