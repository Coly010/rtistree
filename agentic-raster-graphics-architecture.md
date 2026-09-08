# Agentic Raster Graphics Engine
## Architecture and Design Document

**Status:** Proposed  
**Purpose:** Build a deterministic, agent-operable image creation system that combines declarative composition, raster editing, layered scene structure, and iterative visual verification.

---

## 1. Executive Summary

This project defines an image-generation system in which an LLM agent creates and edits images through a structured intermediate representation rather than relying exclusively on opaque diffusion-based generation.

The central idea is to treat image creation as an **inspectable, editable, iterative engineering process**.

Instead of asking a generative model to produce a final image in one step, the system provides the agent with multiple levels of control:

1. Declarative scene and layout
2. Semantic layers and objects
3. Vector and procedural primitives
4. Region-level raster operations
5. Brush and paint operations
6. Tile-level raster editing
7. Pixel-level editing where necessary

The renderer converts this structured representation into PNG output. A visual verifier inspects the rendered result and feeds targeted critique back to the editing agent, creating an iterative loop:

```text
Intent / References
        ↓
Scene Planning
        ↓
Declarative Scene
        ↓
Initial Raster Representation
        ↓
Agent Raster Editing
        ↓
Renderer
        ↓
PNG
        ↓
Visual Verification
        ↺
```

The long-term objective is not necessarily to replace diffusion models entirely. Instead, the architecture should allow diffusion or other generative systems to be used as optional asset generators or initial visual priors while preserving deterministic editing and composition afterward.

The system should support output that is:

- deterministic
- reproducible
- inspectable
- editable
- layer-aware
- agent-friendly
- incrementally refinable
- suitable for automated verification

---

# 2. Problem Statement

Current image-generation systems are strong at producing visually plausible images from natural-language prompts but weak at precise editing and repeatability.

Typical problems include:

- unwanted changes outside the requested edit region
- inconsistent typography
- poor control over layout
- difficulty preserving subjects between revisions
- weak deterministic reproduction
- no meaningful layer structure
- limited inspectability
- poor verification opportunities
- inability to perform precise surgical edits reliably

Traditional graphics systems solve many of these problems but generally require a human to operate them through GUI tools or low-level APIs.

The proposed system bridges these approaches by exposing a graphics representation designed specifically for LLM agents.

The agent should be able to reason semantically:

> Move the hero object slightly right.

But also descend into local raster detail:

> Add irregular orange highlights to this section of the subject without modifying the surrounding silhouette.

This creates a continuum between layout and painting rather than forcing either a purely vector/declarative or fully generative approach.

---

# 3. Goals

## 3.1 Primary Goals

The system MUST:

- represent images using a structured, persistent scene format
- support semantic layers and objects
- render deterministic PNG output
- allow agents to modify only targeted areas
- support region- and tile-level raster editing
- provide high-leverage painting operations
- allow direct pixel control when required
- expose agent-friendly inspection and editing tools
- support iterative render → inspect → edit workflows
- preserve state between iterations
- provide machine-readable verification evidence
- allow optional use of external/generated assets

## 3.2 Secondary Goals

The system SHOULD:

- support SVG export where possible
- eventually support animation/video-frame rendering
- support reusable components and templates
- support procedural effects
- support compositing and blend modes
- support masks and clipping
- support non-destructive editing
- permit multiple render quality levels
- provide efficient partial renders
- support local high-resolution refinement

## 3.3 Non-Goals

The initial system does NOT need to:

- compete with diffusion models for arbitrary photorealism
- implement Photoshop-level functionality
- support every possible image format
- provide a human GUI
- perform real-time rendering
- directly generate every pixel through LLM output
- solve character consistency through learned image synthesis alone

---

# 4. Core Design Principles

## 4.1 Semantic First, Pixel When Necessary

The system should represent information at the highest useful semantic level.

For example:

```yaml
type: text
role: headline
content: "THEY SAID DEMONS WEREN'T REAL."
```

is preferable to rasterising the headline immediately.

Direct raster or pixel editing should only be used where semantic or procedural representations are insufficient.

---

## 4.2 Progressive Descent

The agent should move down an abstraction ladder only when more precision is required.

```text
Scene
  ↓
Layer
  ↓
Object
  ↓
Shape / Procedure
  ↓
Region
  ↓
Brush Operation
  ↓
Tile
  ↓
Pixel
```

This prevents expensive low-level representations from being used across the entire image.

---

## 4.3 Non-Destructive Editing

Whenever possible, edits should be represented as transformations or operations rather than destructive rewrites.

Instead of replacing raster data:

```yaml
operation: darken
amount: 0.12
```

should be preferred over rewriting thousands of pixels.

This allows:

- rollback
- inspection
- reproducibility
- operation-level debugging
- simpler agent reasoning

---

## 4.4 Deterministic Rendering

The same scene description and asset inputs MUST render identically under the same renderer version.

Renderer version and asset hashes should be included in verification evidence.

---

## 4.5 Locality

An edit intended for one region should not modify unrelated regions.

Every raster or paint operation should have an explicit scope:

```yaml
bounds: [x, y, width, height]
```

or mask.

This is one of the primary architectural advantages over diffusion-only editing.

---

## 4.6 Agent Ergonomics Over Human Ergonomics

The data format and APIs should optimise for machine reasoning rather than GUI convenience.

Prefer:

```yaml
role: hero-product
align: visual-center
```

over obscure implementation details.

Low-level controls should exist but should not be the default interface.

---

# 5. High-Level Architecture

```text
┌─────────────────────────────┐
│        User Intent          │
│ prompts / refs / assets     │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│       Planning Agent        │
│ composition + strategy      │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│       Scene Document        │
│ layout / layers / objects   │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│     Initial Rasterizer      │
│ vectors/procedural/assets   │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│    Raster Representation    │
│ tiles / regions / layers    │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│       Editing Agent         │
│ semantic + raster edits     │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│          Renderer           │
│ compositing / PNG output    │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│      Visual Verifier        │
│ critique + measurements     │
└─────────────┬───────────────┘
              │
       pass ──┴── fail
                    ↓
                 iterate
```

---

# 6. Core Components

## 6.1 Scene Document

The scene document is the persistent source of truth.

It should describe:

- canvas
- layers
- semantic objects
- geometry
- layout
- assets
- effects
- raster regions
- masks
- edit history
- metadata
- verification targets

Example:

```yaml
version: 1

canvas:
  width: 1080
  height: 1350
  colour_space: srgb
  background: "#0b0b0d"

layers:
  - id: background
    type: procedural
    z: 0

  - id: subject
    type: group
    role: hero
    z: 10

  - id: copy
    type: group
    role: text-content
    z: 20

  - id: grade
    type: adjustment
    z: 100
```

---

## 6.2 Layout Engine

The layout engine handles composition before rasterisation.

It should support:

- absolute positioning
- relative positioning
- padding
- margins
- row/column layouts
- alignment
- distribution
- anchors
- safe areas
- percentage dimensions
- aspect-ratio constraints
- parent-relative coordinates

Example:

```yaml
layout:
  type: horizontal
  gap: 64
  padding: 80

children:
  - id: copy
    width: 45%

  - id: hero
    width: 55%
```

The layout engine should resolve semantic constraints into concrete geometry before rendering.

---

# 7. Layer Model

Layers are first-class entities.

Each layer should support:

```yaml
id:
name:
type:
role:
visible:
opacity:
blend_mode:
z:
bounds:
mask:
children:
effects:
```

Suggested layer types:

- group
- raster
- vector
- text
- procedural
- adjustment
- asset
- generated-asset

Example:

```yaml
- id: demon
  type: group
  role: primary-subject
  opacity: 1
  blend_mode: normal
  children:
    - demon-base
    - demon-shadow
    - demon-fire
    - demon-texture
```

Layers allow an agent to modify lighting, texture, colour, text, atmosphere, etc. independently.

---

# 8. Raster Representation

The raster representation SHOULD NOT store the whole image as raw RGB values unless specifically requested.

Instead, raster data should support multiple representations.

## 8.1 Supported Raster Modes

### Solid

```yaml
mode: solid
colour: "#233044"
```

### Gradient

```yaml
mode: gradient
type: linear
from: "#102030"
to: "#405060"
angle: 45
```

### Procedural

```yaml
mode: procedural
generator: noise
seed: 91812
scale: 0.45
amount: 0.12
```

### Palette Raster

```yaml
mode: palette

palette:
  A: "#000000"
  B: "#341611"
  C: "#B64020"
  D: "#F69A42"

pixels:
  - "AAAABBCC"
  - "AABBBCCD"
  - "ABBBCCDD"
```

### Raw Raster

Used only for fine control.

```yaml
mode: rgba
encoding: binary-reference
source: raster://region-123
```

Large raw raster blocks should be stored externally rather than embedded directly in YAML/JSON.

---

# 9. Tile System

The image should be divisible into independently addressable tiles.

Example logical tile grid:

```text
32 × 32 tiles
```

A tile may exist in one of several modes:

```yaml
tile:
  position: [12, 7]
  mode: procedural
```

or:

```yaml
tile:
  position: [12, 7]
  mode: raster
  resolution: [32, 32]
```

Tiles should support promotion and demotion.

Example:

```text
procedural tile
      ↓
needs refinement
      ↓
raster tile
      ↓
needs fine refinement
      ↓
high-resolution raster tile
```

This allows detailed regions to receive additional representation without increasing the cost of the whole scene.

---

# 10. Quadtree / Adaptive Spatial Representation

A quadtree SHOULD be investigated for raster complexity management.

Simple areas can be represented by coarse nodes.

Complex areas can recursively subdivide.

Example:

```yaml
node:
  bounds: [0, 0, 512, 512]
  representation:
    fill: "#253044"

  children:
    - bounds: [256, 128, 128, 128]
      representation:
        type: detailed-region
```

Potential benefits:

- reduced token representation
- reduced storage
- fast locality queries
- selective rendering
- efficient verifier focus
- natural refinement hierarchy

The quadtree should remain an implementation detail unless agent performance benefits from direct exposure.

---

# 11. Painting Operations

Agents should not need to manipulate pixels for most local edits.

The renderer should expose high-level deterministic raster operations.

Initial operation set:

- paintStroke
- eraseStroke
- fill
- gradient
- blur
- sharpen
- smudge
- dodge
- burn
- noise
- grain
- hueShift
- saturation
- brightness
- contrast
- colourReplace
- clone
- warp
- distort
- edgeDarken
- edgeLighten
- alphaMask
- featherMask

Example:

```yaml
operation: paintStroke

layer: demon-fire

path:
  - [411, 292]
  - [416, 297]
  - [422, 308]

brush:
  radius: 7
  hardness: 0.35
  colour: "#f28b39"
  opacity: 0.42
```

A single operation may deterministically affect hundreds or thousands of pixels while requiring minimal agent output.

---

# 12. Masks

Every destructive or raster-level edit SHOULD support masks.

Mask types:

- rectangle
- ellipse
- polygon
- path
- alpha
- semantic-object
- colour-range
- edge-derived
- raster mask

Example:

```yaml
mask:
  type: semantic-object
  target: demon
  feather: 4
```

This allows agents to perform edits such as:

> brighten the demon without modifying the background

without requiring explicit manual pixel boundaries.

---

# 13. Semantic Roles

Objects and layers should include optional semantic roles.

Examples:

- headline
- body-copy
- logo
- CTA
- background
- hero
- hero-product
- primary-subject
- supporting-subject
- atmosphere
- effect
- texture
- foreground
- midground
- background-scene

These roles provide context for agents and verification.

Example:

```yaml
id: headline
type: text
role: headline
```

Verification can then define rules:

```yaml
rule:
  target_role: headline
  minimum_contrast_ratio: 4.5
```

---

# 14. Agent Tool Surface

Agents should primarily interact through semantic tools rather than editing documents manually.

Proposed core commands:

```text
inspectScene()
inspectLayer(id)
inspectRegion(bounds)
render()
renderRegion(bounds)
addLayer(...)
removeLayer(id)
moveLayer(id, ...)
resizeLayer(id, ...)
setOpacity(id, ...)
setBlendMode(id, ...)
setText(id, ...)
setStyle(id, ...)
groupLayers(...)
align(...)
distribute(...)
applyEffect(...)
applyRasterOperation(...)
promoteRegion(...)
replaceTile(...)
undo(...)
redo(...)
```

The implementation may serialise these operations into patches against the scene document.

---

# 15. Inspection API

The agent should be able to request both visual and structural information.

Example:

```json
{
  "scene": {
    "canvas": [1080, 1350],
    "layers": [...]
  },
  "render": "artifact://preview.png",
  "selected_region": {
    "bounds": [320, 180, 420, 540],
    "preview": "artifact://region.png"
  }
}
```

Region inspection should optionally return:

- neighbouring layers
- dominant colours
- local contrast
- edges
- masks
- semantic objects intersecting region
- local raster representation
- verifier findings

---

# 16. Rendering Pipeline

Recommended pipeline:

```text
Scene Parse
   ↓
Validation
   ↓
Layout Resolution
   ↓
Vector / Text Rasterisation
   ↓
Asset Resolution
   ↓
Procedural Rendering
   ↓
Raster Operations
   ↓
Layer Compositing
   ↓
Adjustment Layers
   ↓
Colour Conversion
   ↓
PNG Encoding
```

---

# 17. Renderer Technology

The renderer should be implemented behind an abstraction.

Potential implementations:

- Skia
- Canvas
- Cairo
- SVG + rasterisation
- custom GPU renderer
- WebGPU
- headless browser rendering

For an MVP, a CPU-based rendering path is preferable if it provides:

- deterministic output
- straightforward setup
- text rendering
- raster composition
- masking
- blur
- transforms
- image loading

The architecture should not couple the scene format directly to a single renderer.

---

# 18. Asset Model

Assets should be externally referenced.

Example:

```yaml
assets:
  book-cover:
    type: image
    source: "./assets/book.png"
    hash: "sha256:..."
```

Supported future asset sources may include:

- local files
- user uploads
- generated images
- stock/reference assets
- SVG
- 3D renders
- previous scene outputs

Generated assets SHOULD be treated as inputs rather than final compositions.

---

# 19. Hybrid Diffusion / Generative Integration

Diffusion or other image-generation models should be optional.

Recommended use:

```text
Prompt / reference
        ↓
Generative asset model
        ↓
Generated subject/background asset
        ↓
Structured scene
        ↓
Agent-controlled compositing
        ↓
Raster refinement
        ↓
Verification
```

The agent should retain control after generation.

Examples:

- generate fantasy background, then compose typography deterministically
- generate character asset, then refine lighting locally
- generate texture, then mask and blend it
- generate a rough scene, then convert regions to editable raster layers

The system should measure how much of the final result can progressively move from opaque generation toward deterministic agentic editing.

---

# 20. Verification Architecture

Verification should be treated as a core subsystem, not a final screenshot check.

The verifier should consume:

- rendered image
- scene structure
- requested intent
- reference images if present
- semantic roles
- verification rules
- prior verifier results

Verifier output should be structured.

Example:

```yaml
status: fail

issues:
  - id: issue-17
    category: composition
    severity: high
    target: hero
    region: [430, 190, 370, 600]
    message: "Primary subject lacks separation from background."

  - id: issue-18
    category: typography
    severity: medium
    target: headline
    message: "Headline competes visually with hero."
```

---

# 21. Verification Categories

Suggested initial categories:

## Composition

- hierarchy
- subject prominence
- balance
- negative space
- safe margins
- overlap
- object crowding

## Typography

- readability
- contrast
- clipping
- text overflow
- hierarchy
- line breaks

## Visual Quality

- muddy regions
- aliasing
- obvious tile boundaries
- unexpected seams
- overly uniform texture
- artefacts

## Semantic Accuracy

- requested objects present
- requested text correct
- subject relationships correct
- colour/lighting instructions followed

## Local Coherence

- lighting continuity
- edge continuity
- texture consistency
- shadow direction
- object boundary integrity

---

# 22. Verification Heatmaps

Verifier output SHOULD support spatial importance / error heatmaps.

Example concept:

```text
Full image
   ↓
Verifier identifies problem region
   ↓
Region promoted for detailed inspection
   ↓
Agent receives:
  - crop
  - raster data
  - intersecting objects
  - issue description
   ↓
Agent edits region only
```

This reduces both context size and edit risk.

---

# 23. Iterative Agent Workflow

Recommended default workflow:

```text
1. Parse user intent
2. Build semantic scene
3. Render low-cost preview
4. Verify composition
5. Correct layout
6. Promote important regions
7. Add raster detail
8. Render preview
9. Verify local issues
10. Apply targeted corrections
11. Render final
12. Run final verification
13. Export
```

The system should discourage early pixel-level optimisation before composition has stabilised.

---

# 24. Image Representation Lifecycle

An object or region may evolve through representations.

Example:

```text
semantic object
    ↓
rough vector silhouette
    ↓
procedural shading
    ↓
rasterised layer
    ↓
local paint operations
    ↓
fine tile refinement
```

The system should preserve the ability to edit earlier semantic properties where possible.

---

# 25. Data Storage

Suggested project structure:

```text
project/
├── scene.yaml
├── assets/
│   ├── book.png
│   └── background.png
├── raster/
│   ├── layer-demon.bin
│   └── tile-12-7.bin
├── renders/
│   ├── preview-001.png
│   └── final.png
├── verification/
│   ├── pass-001.json
│   └── pass-002.json
└── history/
    └── operations.jsonl
```

Large raster data should NOT be embedded directly into the primary scene document.

The scene should reference it.

---

# 26. Operation Log

Every mutation SHOULD be captured in an append-only operation log.

Example:

```json
{
  "operation": "setOpacity",
  "target": "fire",
  "before": 0.84,
  "after": 0.67,
  "reason": "Fire was overpowering primary subject",
  "iteration": 8
}
```

This provides:

- debugging
- reproducibility
- auditability
- rollback
- learning data
- agent performance analysis

---

# 27. Determinism and Versioning

Every render should record:

```yaml
renderer:
  version: "0.1.0"

scene:
  version: 1

assets:
  hashes: ...

render:
  width: 1080
  height: 1350
  colour_space: srgb
```

Any procedural randomness MUST use explicit seeds.

---

# 28. Performance Strategy

The renderer should support multiple quality levels.

## Draft

Used for composition.

- low resolution
- reduced effects
- approximate blur
- no expensive refinements

## Preview

Used for verification.

- medium/full resolution
- most effects
- representative quality

## Final

Used for export.

- full resolution
- high-quality filtering
- complete effects
- maximum precision

Partial-region rendering should be supported as early as practical.

---

# 29. Token Efficiency

Raw pixel representations can become prohibitively expensive.

Strategies:

- semantic objects first
- procedural fills
- operation-based edits
- palette encoding
- run-length encoding
- tiles
- quadtrees
- region crops
- delta patches
- binary raster references
- only expose detailed raster information for selected areas

The agent should receive the minimum raster context required for the current task.

---

# 30. Suggested Scene Schema

Illustrative example:

```yaml
version: 1

canvas:
  width: 1080
  height: 1350
  colour_space: srgb
  background: "#101014"

assets:
  cover:
    type: image
    source: "./assets/cover.png"

layers:

  - id: background
    type: procedural
    role: background
    generator:
      type: gradient
      from: "#191923"
      to: "#070708"

  - id: glow
    type: vector
    role: effect
    shape:
      type: ellipse
      center: [760, 520]
      size: [500, 500]
      fill: "#f06a2f"
    effects:
      - type: blur
        radius: 100
    opacity: 0.25

  - id: book
    type: asset
    role: hero-product
    source: cover
    transform:
      position: [640, 280]
      size: [320, auto]
      rotation: -4

  - id: headline
    type: text
    role: headline
    content: "THEY SAID DEMONS\nWEREN'T REAL."
    transform:
      position: [80, 120]
      width: 520
    style:
      font: display-bold
      size: 74
      line_height: 0.95

verification:
  rules:
    - type: safe-area
      target: headline
      minimum: 48

    - type: prominence
      target: book
      minimum_score: 0.7
```

---

# 31. API Boundaries

Recommended subsystems:

```text
@graphics/schema
@graphics/layout
@graphics/raster
@graphics/paint
@graphics/render
@graphics/assets
@graphics/verify
@graphics/agent-tools
```

Responsibilities should remain separate.

The renderer MUST NOT contain agent decision logic.

The verifier MUST NOT directly mutate scenes.

The agent layer MUST NOT implement graphics algorithms itself.

---

# 32. MVP Architecture

The MVP should prove one thing:

> Can an LLM agent iteratively construct and improve a non-trivial raster image through a deterministic structured graphics interface?

The MVP does not need arbitrary photo generation.

## MVP Scope

Support:

- 512×512 and 1024×1024 canvas
- layers
- text
- rectangles
- ellipses
- paths
- raster images
- gradients
- opacity
- blend modes
- masks
- blur
- transform
- palette-based tiles
- paint strokes
- brightness/contrast/hue operations
- PNG output
- region rendering
- scene inspection
- operation log

---

# 33. MVP Test Subjects

Use deliberately varied benchmark categories.

## Benchmark A: Graphic Design

Create a promotional poster from:

- supplied book cover
- title
- subtitle
- CTA
- background colours

Tests layout and typography.

## Benchmark B: Illustration From Primitives

Create a stylised sunset landscape using:

- shapes
- gradients
- masks
- brush operations

Tests procedural-to-raster workflow.

## Benchmark C: Local Raster Refinement

Provide a rough raster image and ask the agent to:

- add lighting
- improve texture
- increase subject separation
- retain composition

Tests painting behaviour.

## Benchmark D: Hybrid Generation

Use a generated asset as input and ask the system to produce a polished marketing graphic.

Tests hybrid generative + deterministic workflow.

---

# 34. Success Metrics

Do not judge the system only by whether an output "looks good."

Measure:

## Determinism

Can the scene reproduce the same output?

## Edit Locality

How many pixels outside the requested edit region changed?

## Instruction Accuracy

Did requested objects, layout, colours, and text survive?

## Iteration Efficiency

How many render/edit cycles were required?

## Token Cost

How much agent context/output was consumed?

## Representation Efficiency

How much raster data was required?

## Verification Improvement

Did verifier scores improve over iterations?

## Human Preference

Does a human prefer the final result to the initial render?

---

# 35. Key Experimental Question

The most important research question is:

> At what level of abstraction does an LLM become most effective at visual creation?

Potential outcomes may differ by region.

For example:

```text
sky              → procedural
mountain         → vector + raster texture
face             → raster + paint
eye              → high-resolution tile
headline         → semantic text
```

The system should therefore avoid prematurely committing to a single universal representation.

---

# 36. Future Extensions

Potential later capabilities:

- animation keyframes
- video frame export
- motion blur
- vector-to-motion transformations
- depth layers
- normal maps
- lighting layers
- 3D scene integration
- image segmentation
- learned brush tools
- asset generation
- semantic raster extraction
- automatic vectorisation
- reusable scene templates
- scene components
- style systems
- design tokens
- multi-agent visual critique
- temporal verification for video

---

# 37. Relationship to a Video Pipeline

The architecture naturally extends into video.

A future media system could look like:

```text
Media Engine
├── 2D Scene Engine
├── Raster Graphics Engine
├── 3D Scene Engine
├── VFX Engine
├── Audio Engine
├── Motion / Timeline Engine
└── Verification Engine
```

The raster graphics engine can supply:

- title cards
- overlays
- backgrounds
- image compositions
- animated graphics
- intermediate textures
- masks
- VFX mattes
- generated video frames

This lets an agent select the cheapest appropriate medium instead of defaulting to expensive 3D or opaque image generation.

---

# 38. Architectural Risks

## Risk: Raw Pixel Explosion

**Problem:** Agents attempt to represent too much of the image as explicit pixels.

**Mitigation:** enforce progressive abstraction and region promotion.

---

## Risk: Schema Becomes Photoshop

**Problem:** The DSL grows uncontrollably.

**Mitigation:** require each new primitive to demonstrate substantial agent leverage.

---

## Risk: Verification Optimisation Produces Ugly Images

**Problem:** Agents optimise measurable rules rather than aesthetics.

**Mitigation:** combine deterministic checks with vision-based holistic critique.

---

## Risk: Endless Iteration

**Problem:** Agent continually makes tiny changes.

**Mitigation:** iteration budgets, improvement thresholds, and severity-based stopping.

---

## Risk: Destructive Rasterisation

**Problem:** Semantic objects are rasterised too early and become difficult to edit.

**Mitigation:** retain semantic source layers and rasterise as derived output.

---

## Risk: Agent Overuses Fine Detail

**Problem:** Model descends to pixels instead of using higher-level tools.

**Mitigation:** expose tool-cost metadata and prefer high-leverage operations.

---

# 39. Design Decision: PNG Is an Output, Not the Model

The internal representation MUST NOT be designed around PNG.

PNG is an export target.

The project should model a scene and expose renderers.

```text
Scene
 ├── PNG
 ├── SVG
 ├── region preview
 ├── raster asset
 └── future video frame
```

This keeps the representation useful beyond the first implementation.

---

# 40. Recommended Initial Technical Direction

A sensible first implementation is:

```text
TypeScript
   ↓
Scene schema
   ↓
Validation
   ↓
Layout resolver
   ↓
Skia/Canvas-style renderer
   ↓
PNG
```

With raster data stored separately.

Agent interactions should operate through explicit typed commands.

For example:

```ts
applyRasterOperation({
  layer: "subject-light",
  bounds: [412, 288, 120, 190],
  operation: {
    type: "brightness",
    amount: 0.08
  }
})
```

The renderer should initially remain boring, deterministic, and heavily tested.

That is a feature.

---

# 41. Suggested Development Phases

## Phase 1 — Deterministic Scene Renderer

Build:

- schema
- canvas
- layers
- shapes
- text
- assets
- transforms
- PNG rendering

No agent required.

---

## Phase 2 — Agent Tool API

Build:

- inspect
- add/remove
- move
- resize
- style
- render
- region render
- operation history

Prove an LLM can construct a poster.

---

## Phase 3 — Raster Operations

Add:

- paint strokes
- masks
- adjustments
- procedural noise
- blur
- palette tiles

Prove local edits are stable.

---

## Phase 4 — Adaptive Raster Detail

Add:

- tile promotion
- high-resolution local regions
- optional quadtree
- delta raster patches

Measure token efficiency.

---

## Phase 5 — Verification Loop

Add:

- scene rules
- vision critique
- issue regions
- automatic edit iterations
- stopping criteria

---

## Phase 6 — Hybrid Image Generation

Add external/generated assets.

Test:

```text
generation → structured edit → verification
```

---

## Phase 7 — Media Integration

Expose the engine as a reusable subsystem for video, marketing, and other automated creative pipelines.

---

# 42. MVP Exit Criteria

The MVP is successful when an agent can:

1. create a scene from a natural-language request
2. render it
3. inspect the output
4. identify at least one visual weakness
5. make a targeted edit
6. preserve unrelated regions
7. improve the rendered result
8. export a reproducible PNG
9. reproduce the image from stored scene state
10. provide an operation history explaining the transformation

If those ten things work reliably, the underlying architecture is worth expanding.

---

# 43. Core Hypothesis

The project is built around the following hypothesis:

> High-quality agentic image creation does not require an LLM to generate an entire image in one opaque step. A model may achieve better precision, consistency, editability, and control by operating a persistent visual representation at multiple levels of abstraction and iteratively refining only the regions that require additional detail.

The system should be designed to test this hypothesis rather than assume it is true.

That distinction matters.

The project is not initially an attempt to build a better diffusion model.

It is an attempt to build a better **interface between reasoning models and pixels**.

---

# 44. Initial Build Recommendation

The first proof should stay intentionally small.

Build one executable:

```bash
graphics render scene.yaml --output render.png
```

Then expose:

```bash
graphics inspect scene.yaml
graphics render-region scene.yaml x y width height
graphics apply patch.json
graphics verify scene.yaml
```

The first agent benchmark should be a visually demanding poster containing:

- raster asset
- text
- gradients
- semantic hierarchy
- layered effects
- one deliberately rough raster region requiring refinement

Do not begin with photorealistic portrait generation.

That would test the weakest part of the concept first and tell us almost nothing useful about whether the architecture works.

The first milestone is proving that an agent can **see, reason about, alter, and reliably improve a persistent image state**.

Everything else can grow from that.
