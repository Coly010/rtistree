import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Path2D, createCanvas, SvgExportFlag } from './native.js';
import { multiply, identity, exportLayers, resolveLayout, type Matrix } from './layout.js';
import { parseScene, type Scene } from './schema.js';
import { shapePath } from './graphics.js';
import { layoutText, fontStyle, type Renderer } from './render.js';
import { registerFonts, registerProjectFonts } from './assets.js';
const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
function transformation(value: string | undefined): Matrix {
  if (!value) return [...identity];
  let matrix: Matrix = [...identity],
    remaining = value;
  for (const m of value.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)) {
    remaining = remaining.replace(m[0], '');
    const v = m[2]!
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (v.some((n) => !Number.isFinite(n))) throw new Error('Invalid SVG transform');
    let next: Matrix;
    if (m[1] === 'matrix' && v.length === 6) next = v as Matrix;
    else if (m[1] === 'translate' && v.length <= 2) next = [1, 0, 0, 1, v[0]!, v[1] ?? 0];
    else if (m[1] === 'scale' && v.length <= 2) next = [v[0]!, 0, 0, v[1] ?? v[0]!, 0, 0];
    else if (m[1] === 'rotate' && (v.length === 1 || v.length === 3)) {
      const r = (v[0]! * Math.PI) / 180,
        x = v[1] ?? 0,
        y = v[2] ?? 0;
      next = multiply(
        multiply([1, 0, 0, 1, x, y], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]),
        [1, 0, 0, 1, -x, -y],
      );
    } else throw new Error('Unsupported SVG transform');
    matrix = multiply(matrix, next);
  }
  if (remaining.trim()) throw new Error('Unsupported SVG transform');
  return matrix;
}
/** Deliberately closed static geometry subset: reject unsupported features rather than dropping them. */
export function importSvg(xml: string, prefix = 'svg'): Scene {
  if (xml.length > 8 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY|<script|<foreignObject/i.test(xml))
    throw new Error('Unsupported or unsafe SVG input');
  if (XMLValidator.validate(xml) !== true) throw new Error('Invalid SVG XML');
  const tree = new XMLParser({
    ignoreAttributes: false,
    preserveOrder: true,
    parseTagValue: false,
    processEntities: false,
  }).parse(xml);
  const root = tree.find((n: any) => n.svg);
  if (!root) throw new Error('SVG root required');
  const attrs = (node: any) =>
    Object.fromEntries(Object.entries(node[':@'] ?? {}).map(([k, v]) => [k.slice(2), String(v)]));
  const a = attrs(root),
    vb = (a.viewBox ?? '').split(/[ ,]+/).map(Number);
  const number = (value: string | undefined, fallback = 0) => {
    if (value === undefined) return fallback;
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:px)?$/i.test(value))
      throw new Error('SVG subset requires numeric or px lengths');
    return parseFloat(value);
  };
  const width = number(a.width, vb[2]),
    height = number(a.height, vb[3]);
  if (!width || !height) throw new Error('SVG needs width/height or viewBox');
  let count = 0;
  const colour = (v: string | undefined, fallback = '#000000') => {
    if (v === undefined) return fallback;
    if (v === 'none') return '#00000000';
    if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(v)) return v;
    if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('');
    const names: Record<string, string> = {
      black: '#000000',
      white: '#ffffff',
      red: '#ff0000',
      green: '#008000',
      blue: '#0000ff',
      transparent: '#00000000',
    };
    if (names[v]) return names[v];
    throw new Error(`Unsupported SVG colour ${v}`);
  };
  function walk(nodes: any[], inherited: Record<string, string> = {}): any[] {
    const result: any[] = [];
    for (const node of nodes) {
      const tag = Object.keys(node).find((k) => k !== ':@')!;
      if (tag === '#text' || tag === '#comment' || tag.startsWith('?')) continue;
      if (tag === 'title' || tag === 'desc') continue;
      const own = attrs(node),
        at = { ...inherited, ...own };
      if (own.style)
        for (const declaration of own.style.split(';').filter(Boolean)) {
          const [k, v] = declaration.split(':');
          at[k!.trim()] = v!.trim();
        }
      const allowed = new Set([
        'id',
        'fill',
        'stroke',
        'stroke-width',
        'stroke-linecap',
        'stroke-linejoin',
        'stroke-dasharray',
        'stroke-dashoffset',
        'opacity',
        'fill-opacity',
        'stroke-opacity',
        'transform',
        'style',
        'x',
        'y',
        'width',
        'height',
        'rx',
        'ry',
        'cx',
        'cy',
        'r',
        'd',
        'points',
        'x1',
        'x2',
        'y1',
        'y2',
      ]);
      for (const key of Object.keys(at))
        if (!allowed.has(key)) throw new Error(`Unsupported SVG attribute ${key}`);
      const id = `${prefix}${++count}`,
        opacity = number(own.opacity, 1),
        affine = transformation(own.transform);
      const styleKeys = [
        'fill',
        'stroke',
        'stroke-width',
        'stroke-linecap',
        'stroke-linejoin',
        'stroke-dasharray',
        'stroke-dashoffset',
        'fill-opacity',
        'stroke-opacity',
      ];
      const next = Object.fromEntries(
        styleKeys.filter((k) => at[k] !== undefined).map((k) => [k, at[k]!]),
      );
      if (tag === 'g') {
        result.push({
          id,
          type: 'group',
          bounds: [0, 0, width, height],
          opacity,
          affine,
          children: walk(node[tag], next),
        });
        continue;
      }
      const p = new Path2D(tag === 'path' ? at.d : undefined);
      if (tag === 'rect') {
        const x = number(at.x),
          y = number(at.y),
          w = number(at.width),
          h = number(at.height);
        p.roundRect(x, y, w, h, Math.min(number(at.rx), w / 2, h / 2));
      } else if (tag === 'circle' || tag === 'ellipse') {
        const rx = number(at.r ?? at.rx),
          ry = number(at.r ?? at.ry);
        p.ellipse(number(at.cx), number(at.cy), rx, ry, 0, 0, Math.PI * 2);
      } else if (tag === 'line') {
        p.moveTo(number(at.x1), number(at.y1));
        p.lineTo(number(at.x2), number(at.y2));
      } else if (tag === 'polygon' || tag === 'polyline') {
        const points = (at.points ?? '').trim().split(/[ ,]+/).map(Number);
        if (points.length < 4 || points.length % 2 || points.some((v) => !Number.isFinite(v)))
          throw new Error('Invalid SVG points');
        for (let i = 0; i < points.length; i += 2)
          i ? p.lineTo(points[i]!, points[i + 1]!) : p.moveTo(points[i]!, points[i + 1]!);
        if (tag === 'polygon') p.closePath();
      } else if (tag !== 'path')
        throw new Error(
          `Unsupported SVG element ${tag}; import static paths or flatten externally`,
        );
      if (at['fill-opacity'] || at['stroke-opacity'])
        throw new Error('Separate SVG fill/stroke opacity is not supported; use group opacity');
      result.push({
        id,
        type: 'vector',
        bounds: [0, 0, width, height],
        opacity,
        affine,
        shape: {
          type: 'path',
          d: p.toSVGString(),
          fill: colour(at.fill),
          stroke: at.stroke ? colour(at.stroke) : undefined,
          stroke_width: number(at['stroke-width'], 1),
          line_cap: at['stroke-linecap'],
          line_join: at['stroke-linejoin'],
          dash:
            at['stroke-dasharray'] && at['stroke-dasharray'] !== 'none'
              ? at['stroke-dasharray'].split(/[ ,]+/).map(Number)
              : undefined,
          dash_offset: number(at['stroke-dashoffset']),
        },
      });
    }
    return result;
  }
  const layers = walk(root.svg);
  const scene = {
    version: 1,
    canvas: { width: Math.round(width), height: Math.round(height) },
    layers:
      vb.length === 4
        ? [
            {
              id: `${prefix}Root`,
              type: 'group',
              bounds: [0, 0, width, height],
              affine: [
                width / vb[2]!,
                0,
                0,
                height / vb[3]!,
                (-vb[0]! * width) / vb[2]!,
                (-vb[1]! * height) / vb[3]!,
              ],
              children: layers,
            },
          ]
        : layers,
  };
  return parseScene(scene);
}
export async function exportSvg(scene: Scene, root: string, renderer: Renderer) {
  await registerFonts();
  const aliases = (await registerProjectFonts(scene, root)).aliases;
  const { width, height } = scene.canvas,
    parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ];
  parts.push(
    `<rect width="100%" height="100%" fill="${scene.canvas.background.slice(0, 7)}" opacity="${scene.canvas.background.length === 9 ? parseInt(scene.canvas.background.slice(7), 16) / 255 : 1}"/>`,
  );
  // Text becomes exact vector outlines via the native SVG canvas; other complex content is embedded losslessly.
  const requiresComposite = scene.layers.some(
    (l) => l.type === 'adjustment' || l.blend_mode !== 'normal',
  );
  const raster = async (id?: string) => {
    const r = await renderer.render(scene, root, { cache: false, layer: id });
    parts.push(
      `<image width="${width}" height="${height}" href="data:image/png;base64,${r.png.toString('base64')}"/>`,
    );
  };
  if (requiresComposite) await raster();
  else
    for (const n of exportLayers(resolveLayout(scene))) {
      const l = n.layer;
      if (!l.visible) continue;
      if (
        l.type === 'text' &&
        !l.mask &&
        !l.effects.length &&
        !l.operations.length &&
        !l.tiles.length &&
        !l.regions?.length
      ) {
        const canvas = createCanvas(width, height, SvgExportFlag.ConvertTextToPaths),
          ctx = canvas.getContext('2d');
        ctx.setTransform(...n.matrix);
        ctx.globalAlpha = l.opacity;
        const diagnostic = layoutText(ctx, l, n.bounds[2], n.bounds[3], aliases),
          s = l.style!;
        ctx.beginPath();
        ctx.rect(0, 0, n.bounds[2], n.bounds[3]);
        ctx.clip();
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        if (diagnostic.spans)
          diagnostic.spans.forEach((line, i) =>
            line.forEach((span) => {
              ctx.font = fontStyle({ ...l, style: { ...s, weight: span.weight } }, aliases);
              ctx.fillStyle = span.colour;
              ctx.fillText(span.text, span.x, i * s.size * s.line_height);
            }),
          );
        else {
          ctx.font = fontStyle(l, aliases);
          ctx.fillStyle = s.colour;
          diagnostic.lines.forEach((line, i) => {
            const measure = ctx.measureText(line).width,
              x =
                s.align === 'center'
                  ? (n.bounds[2] - measure) / 2
                  : s.align === 'right'
                    ? n.bounds[2] - measure
                    : 0;
            ctx.fillText(line, x, i * s.size * s.line_height);
          });
        }
        let svg = canvas.getContent().toString();
        svg = svg
          .replace(/<\?xml[^>]*>/g, '')
          .replaceAll('id="', `id="${l.id}-`)
          .replaceAll('url(#', `url(#${l.id}-`)
          .replaceAll('href="#', `href="#${l.id}-`);
        parts.push(svg);
        continue;
      }
      if (
        l.type !== 'vector' ||
        l.effects.length ||
        l.mask ||
        l.operations.length ||
        l.tiles.length ||
        l.regions?.length
      ) {
        await raster(l.id);
        continue;
      }
      const s = l.shape!,
        attr = (name: string, value: string | number | undefined) =>
          value === undefined ? '' : ` ${name}="${escape(String(value))}"`;
      parts.push(
        `<path d="${escape(shapePath(l, n.bounds[2], n.bounds[3]).toSVGString())}" transform="matrix(${n.matrix.join(' ')})" opacity="${l.opacity}" fill="${s.fill.slice(0, 7)}" fill-opacity="${s.fill.length === 9 ? parseInt(s.fill.slice(7), 16) / 255 : 1}"${attr('stroke', s.stroke?.slice(0, 7))}${attr('stroke-opacity', s.stroke?.length === 9 ? parseInt(s.stroke.slice(7), 16) / 255 : undefined)}${attr('stroke-width', s.stroke_width)}${attr('stroke-linecap', s.line_cap)}${attr('stroke-linejoin', s.line_join)}${attr('stroke-dasharray', s.dash?.join(' '))}${attr('stroke-dashoffset', s.dash_offset)}/>`,
      );
    }
  parts.push('</svg>');
  return Buffer.from(parts.join('\n'));
}
