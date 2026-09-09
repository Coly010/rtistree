import { artDirectionGuide } from './art-direction.js';
import { techniqueCatalog } from './techniques.js';
/** Also available to remote agents which cannot read local documentation files. */
export const studioReference = {
  version: 'rtistree-studio/1',
  techniques: techniqueCatalog,
  art_direction: artDirectionGuide,
  production:
    'Use buildPipeline for explicit dependency-aware atomic builds. Node inputs reference nodes or registered assets; bindings subscribe to shared parameters. Graphs are pinned in scene metadata. Use production plan/capture/review/compare/select/advance for stage gates, immutable candidates and undoable selection. Ratings must come from viewing images. Native Canvas and raw pixels remain available.',
  contract:
    'Synchronous JavaScript body receives art and parameters and returns one Canvas of the declared width/height. Use runProgram with exactly one of code or project-local source. Baked PNGs and recipes are immutable; editing code requires explicit execution. Source/parameters/seed and frozen sRGB PNG inputs are recorded. No image-generation model is involved.',
  execution:
    'Only execute trusted code. Worker/VM isolation is not a security sandbox. API does not offer filesystem/network imports. Math.random uses the seeded RNG; Date/performance are absent. Canvas native allocations are not covered by the V8 heap limit.',
  limits: {
    output_megapixels: 16,
    inputs: 16,
    helper_cumulative_megapixels: 32,
    edge: 8192,
    source_kib: 256,
    parameters_kib: 64,
    timeout_ms: [50, 30000],
    v8_heap_mib: 256,
  },
  api: {
    guides:
      'art.guides({points:{name:[x,y] | "otherName" | {anchor:"otherName",offset:[dx,dy]}},paths:{name:[{op:"M"|"L",to:pointRef}|{op:"Q",control:pointRef,to:pointRef}|{op:"C",control1:pointRef,control2:pointRef,to:pointRef}|{op:"Z"}]}}) returns {points,paths}. Paths are SVG path strings for art.path. References resolve recursively; cycles and missing points fail. Use joint landmarks and shared handles to edit construction coherently.',
    canvas:
      'art.canvas(width=art.width,height=art.height) → Canvas; use canvas.getContext("2d") for paths, transforms, gradients, compositing and text. art.path(svgPathData) returns a native Path2D for fill/stroke/clip. Bundled fonts: Rtistree-inter, Rtistree-inter-bold, Rtistree-display.',
    raster:
      'art.raster((x,y)=>[r,g,b,a], width?, height?) → Canvas; integer pixel-centre coordinates, four finite 0–255 channels, straight 8-bit sRGB RGBA.',
    pixels:
      'art.pixels(canvas) → {width,height,data:Uint8ClampedArray}. art.put(canvas,pixels) replaces its complete buffer. Semi-transparent samples pass through native premultiplied storage.',
    input:
      'art.input(name) → mutable Canvas copy of a frozen input asset named in the request inputs mapping.',
    brush:
      'art.brush(canvas,[{x,y,pressure?},...],{radius,colour:"#RRGGBB[AA]",hardness?,opacity?,spacing?,scatter?}) → canvas. Pressure affects radius/alpha; opacity is per dab; spacing is a fraction of radius. Uses current context transform.',
    noise:
      'art.noise(x,y,salt=0) → seeded interpolated value noise in 0–1. art.fbm(x,y,octaves=5,salt=0) → normalised octave sum. art.random() → deterministic sequential RNG.',
    coordinates:
      'art.polar(x,y,cx=0,cy=0) → {radius,angle}; art.repeat(value,period); art.clamp(value,min=0,max=1); art.mix(a,b,t); art.smoothstep(a,b,value).',
    sample:
      'art.sample(pixelSurface,x,y,edge="transparent") → RGBA. Bilinear premultiplied interpolation; edge is transparent, clamp or repeat.',
    warp: 'art.warp(canvas,(x,y)=>[sourceX,sourceY],edge="transparent",width?,height?) → new Canvas. Inverse coordinate mapping supports arbitrary 2D warps and repetition.',
    displace:
      'art.displace(canvas,(x,y)=>[dx,dy],amount=1,edge="transparent") → new Canvas, samples source at x+dx*amount,y+dy*amount.',
    blur: 'art.blur(canvas,radius) → new Canvas; radius 0–128, transparent boundary.',
    lighting:
      'art.normal(heightFn,x,y,strength=1,step=1) → surface normal from central differences. art.light(normal,[r,g,b,a],{light:[x,y,z]?,ambient?,diffuse?,specular?,shininess?}) → RGBA using Lambert diffuse and Blinn–Phong specular, viewer along +Z. Artistic 2.5D shading, not ray tracing.',
  },
  example:
    'return art.raster((x,y) => { const n=art.fbm(x/35,y/35); return [35+n*40,40+n*35,45+n*30,255]; });',
  edits:
    'readRasterRegion reads exact canvas-space PNG pixels and a scene hash. writeRasterRegion consumes an exact-size project-local PNG and that expected_hash, with replace/over semantics and canvas/layer coordinates. Layer-space patches capture reference dimensions and follow transforms. Patches follow target effects/operations and precede its mask/opacity; ancestor effects can change appearance; locality guards reject outward leakage.',
};
