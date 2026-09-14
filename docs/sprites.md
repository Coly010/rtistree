# Pixel art, sprites and spritesheets

Rtistree can author small raster assets and package them as a sprite set. The
sprite workflow is deliberately split into two jobs:

1. draw and inspect each frame as an ordinary Rtistree scene or studio asset;
2. describe the frames, pivots and animation timing in a `sprites` manifest and
   export a deterministic atlas for the game or other runtime to consume.

This keeps the artwork editable and reviewable while making the delivery format
boring and portable. Rtistree is an asset authoring and verification tool here;
it is not a game engine, a runtime animation system or an automatic animation
critic.

## Choose the pixel-art contract

Use the optional `pixel_art` scene contract when the image is meant to be read
as pixels rather than as a smoothly sampled illustration. A pixel-art scene
should declare its palette policy and grid scale, then keep the following
invariants visible to the agent and reviewer:

- coordinates and frame dimensions are integer pixels;
- colour choices come from the declared palette, including transparency;
- `scale` is an integer multiplier from a tile's authored grid to its
  scene-pixel bounds;
- atlas sampling uses nearest-neighbour filtering;
- frame canvases and pivots are stable across an animation;
- strict mode rejects transforms, rotation and blur on the scene's pixel-art
  layers and checks tile geometry and declared palette membership.

The contract does not make a weak drawing good. It makes common production
mistakes detectable and makes an intentional one-pixel edit auditable. Keep
the intended game display size in the brief and inspect the result at that size
as well as zoomed in.

For small, deliberately indexed marks, palette tiles are the compact scene
primitive:

```yaml
- id: lantern
  type: raster
  tiles:
    - bounds: [8, 8, 10, 6]
      palette:
        .: '#00000000'
        a: '#f2be81'
        b: '#b75c40'
      pixels:
        - '....aa....'
        - '...abba...'
        - '..abbbba..'
        - '..abbbba..'
        - '...abba...'
        - '....aa....'
```

Rows must be equal in width and every key must exist in the palette. Palette
tiles are limited to 256 × 256 and are scaled with nearest-neighbour sampling.
Use `replaceTile` for an auditable tile-sized revision. For dense or generated
frames, use the studio's `art.raster`, `art.pixels` and `art.put` APIs instead;
those bake ordinary PNG assets with a replayable recipe.

The complete scene and command shapes are in [scene format](scene-format.md).
Run `rtistree schema --kind scene` or `rtistree schema --kind command` against
the installed version rather than copying a stale schema from a blog post.

## Build a sprite set

Start with one representative character frame and one representative prop.
Record the intended facing, ground line, display scale, palette, silhouette and
pivot before multiplying the set. A useful frame brief says what must remain
stable (for example, the foot contact point) and what changes (for example,
the lifted leg).

The scene's `sprites` manifest is the delivery description for a set. Each
`frames[id].bounds` is a canvas rectangle selecting source pixels. The exporter
writes a JSON manifest in which each output `frames[id]` records:

- the frame rectangle in the atlas;
- the original canvas `source` rectangle;
- the pixel pivot or origin used by the game;
- optional duration and tags such as `idle`, `contact` or `recovery`;
- animation order and loop behaviour; use tags to carry labels such as facing.

Atlas placement is deterministic. The same frame inputs and atlas settings
produce the same packed image and metadata on the same pinned runtime. Keep
the atlas image and its metadata together; the metadata is part of the asset,
not an optional comment for the viewer.

Export the set with the installed command:

```sh
npx rtistree sprites scene.json -o output/sprites.png --manifest output/sprites.json
```

The command accepts a scene or configured project containing the sprite
manifest. Use `npx rtistree sprites --help` and the installed schema/help
output for the exact options in the release you are using. The PNG path must
end in `.png` and the manifest path in `.json`. The export produces an atlas
image plus machine-readable frame and animation metadata. Frames are not
trimmed or rotated. `padding`, `extrusion`, `power_of_two` and `max_width`
control packing; edge extrusion copies the frame's edge pixels and the
remaining padding stays transparent.

The same export is available through the SDK as `exportSpriteSheet(project,
output, options)` and through the MCP `exportSprites` tool. SDK callers should
retain the returned atlas and metadata as release artifacts; MCP callers should
expose the result to the agent so it can inspect the actual image and not only
the JSON. The MCP tool writes `<name>.png` and `<name>.json` into the configured
project output directory.

## Review an animation before shipping it

Technical validity and animation quality are separate gates. For each set,
check the following in order:

1. Render every frame and inspect a contact sheet at the intended display size.
2. Confirm frame dimensions, alpha margins, palette use, atlas rectangles and
   pivots against the manifest.
3. Play a complete loop against a ground marker. Inspect contact, passing and
   recovery frames, then inspect the loop boundary.
4. Check that the subject's silhouette, weight, facing and prop ownership read
   consistently. For walking, planted feet should remain coherent against the
   ground while lifted feet recover in the travel direction.
5. Record technical, functional and visual results separately. A set can have
   reproducible PNGs and valid metadata while still being rejected for weak
   posing, muddy silhouettes or a broken loop.

`rtistree verify` can check declared technical constraints and scoped changes;
it cannot watch a loop, judge a silhouette or prove that a reviewer looked at
the image. Keep the rendered frames, contact sheet, atlas, manifest and any
rejected revision together so a later agent can compare against the actual
parent rather than trusting a summary.

## Existing example

The [Verdigris Watch asset trial](https://github.com/Coly010/rtistree/tree/main/examples/warden-asset-trial)
is the reference end-to-end example. It draws 17 transparent sprites, bakes an
eight-frame walk cycle, records fixed pivots and 8 fps playback metadata, packs
an atlas, and provides a small viewer for stepping through the loop. Its
`render.mjs` and `verify.mjs` intentionally keep atlas assembly and motion
checks visible, so the example also documents what the first-class export is
meant to make less bespoke.

The trial is evidence of a reproducible workflow, not a claim that every image
is production-quality. Read its review and inspect the actual frames before
using it as a visual reference.

For the smallest strict-pixel example, see
[`examples/pixel-sprite-lab`](https://github.com/Coly010/rtistree/tree/main/examples/pixel-sprite-lab).
It uses four 16 × 16 palette-tile frames, a fixed `[8, 14]` pivot, 120 ms
durations, a `walk_right` animation, one-pixel padding and one-pixel edge
extrusion. Its verifier checks source-to-atlas pixels, palette use, fixed
pivots and deterministic cold export.

## Scope and limits

The sprite workflow is a neutral asset format. It does not add a dependency on
Godot, Unity, Phaser or another game engine, and it does not promise a native
timeline, inverse kinematics, automatic retargeting, palette optimisation or
automatic visual approval. A renderer or game project can consume the atlas and
metadata through its own adapter.

For a broader view of the agent protocol, read [art direction for agents](agent-art-workflow.md),
then [programmable digital art](studio.md) for seeded frame generation and
[production](production.md) for general image export.
