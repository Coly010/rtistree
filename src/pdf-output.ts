import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createCanvas } from './native.js';
import { registerFonts, registerProjectFonts, localAssetPath } from './assets.js';
import { exportLayers, resolveLayout, type ResolvedLayer } from './layout.js';
import { layoutText, type Renderer } from './render.js';
import { type Scene } from './schema.js';
import { type ExportPreset } from './document.js';
import { printScene } from './print-scene.js';
const alpha = (hex: string) => (hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1);
export async function makePdf(
  scene: Scene,
  root: string,
  renderer: Renderer,
  preset: ExportPreset,
  profile?: { path: string; bytes: Buffer },
) {
  const prepared = printScene(scene, preset.ppi),
    g = prepared.geometry,
    mark = preset.crop_marks ? 18 : 0;
  const pageSize = g.full_mm.map((v) => (v * 72) / 25.4 + 2 * mark) as [number, number];
  const doc = new PDFDocument({
    autoFirstPage: false,
    pdfVersion: '1.7',
    compress: true,
    info: {
      Title: 'Rtistree artwork',
      Creator: 'Rtistree',
      CreationDate: new Date(0),
      ModDate: new Date(0),
    },
  });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (b) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.addPage({ size: pageSize, margin: 0 });
  const page = (doc as any).page;
  page.dictionary.data.TrimBox = [
    mark + g.bleed_pt,
    mark + g.bleed_pt,
    mark + g.bleed_pt + g.trim_pt[0],
    mark + g.bleed_pt + g.trim_pt[1],
  ];
  page.dictionary.data.BleedBox = [mark, mark, pageSize[0] - mark, pageSize[1] - mark];
  let icc: any;
  if (profile) {
    icc = doc.ref({ N: 4 });
    icc.end(profile.bytes);
    const intent = doc.ref({
      Type: 'OutputIntent',
      S: 'GTS_PDFX',
      OutputConditionIdentifier: new String('Project ICC profile'),
      Info: new String('ICC-managed CMYK output; PDF/X conformance not asserted'),
      DestOutputProfile: icc,
    });
    intent.end(undefined);
    (doc as any)._root.data.OutputIntents = [intent];
  }
  let maximumInk = 0;
  const colourCache = new Map<string, PDFKit.Mixins.ColorValue>();
  async function colour(hex: string) {
    if (preset.colour_space !== 'cmyk') return hex.slice(0, 7);
    if (preset.black === 'k-only' && hex.slice(0, 7).toLowerCase() === '#000000')
      return [0, 0, 0, 100] as [number, number, number, number];
    if (colourCache.has(hex)) return colourCache.get(hex)!;
    const { data } = await sharp({
      create: { width: 1, height: 1, channels: 3, background: hex.slice(0, 7) },
    })
      .withIccProfile(profile!.path)
      .toColourspace('cmyk')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const c = [...data].map((v) => (v / 255) * 100) as [number, number, number, number];
    maximumInk = Math.max(
      maximumInk,
      c.reduce((a, b) => a + b, 0),
    );
    colourCache.set(hex, c);
    return c;
  }
  async function raster(png: Buffer, x: number, y: number, w: number, h: number) {
    if (preset.colour_space === 'srgb') {
      doc.image(png, x, y, { width: w, height: h });
      return;
    }
    const source = sharp(png),
      meta = await source.metadata();
    const alpha = meta.hasAlpha
      ? await sharp(png).extractChannel('alpha').raw().toBuffer()
      : undefined;
    const { data, info } = await source
      .removeAlpha()
      .withIccProfile(profile!.path)
      .toColourspace('cmyk')
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4)
      maximumInk = Math.max(
        maximumInk,
        ((data[i]! + data[i + 1]! + data[i + 2]! + data[i + 3]!) / 255) * 100,
      );
    let smask: any;
    if (alpha) {
      smask = doc.ref({
        Type: 'XObject',
        Subtype: 'Image',
        Width: info.width,
        Height: info.height,
        ColorSpace: 'DeviceGray',
        BitsPerComponent: 8,
      });
      smask.end(alpha);
    }
    const ref = doc.ref({
      Type: 'XObject',
      Subtype: 'Image',
      Width: info.width,
      Height: info.height,
      ColorSpace: ['ICCBased', icc],
      BitsPerComponent: 8,
      ...(smask ? { SMask: smask } : {}),
    });
    ref.end(data);
    const name = `Rt${Object.keys(page.xobjects).length}`;
    page.xobjects[name] = ref;
    doc
      .save()
      .transform(w, 0, 0, -h, x, y + h)
      .addContent(`/${name} Do`)
      .restore();
  }
  await registerFonts();
  const aliases = (await registerProjectFonts(scene, root)).aliases;
  const fontPath = async (n: ResolvedLayer) => {
    const s = n.layer.style!,
      custom = scene.fonts?.[s.font];
    if (custom) return readFile(await localAssetPath(root, custom.source));
    const pkg = s.font === 'display' ? '@fontsource/dm-serif-display' : '@fontsource/inter',
      filename =
        s.font === 'display'
          ? 'dm-serif-display-latin-400-normal.woff'
          : `inter-latin-${s.weight === 'bold' ? 700 : 400}-normal.woff`;
    return readFile(
      resolve(
        dirname(createRequire(import.meta.url).resolve(`${pkg}/package.json`)),
        'files',
        filename,
      ),
    );
  };
  const vectorIds: string[] = [],
    rasterIds: string[] = [];
  const simple = (n: ResolvedLayer) =>
    (['text', 'vector'].includes(n.layer.type) ||
      (n.layer.type === 'procedural' && n.layer.generator?.type !== 'noise')) &&
    !n.layer.mask &&
    !n.layer.effects.length &&
    !n.layer.operations.length &&
    !n.layer.tiles.length &&
    !n.layer.regions?.length &&
    n.layer.blend_mode === 'normal';
  // Any adjustment or backdrop blend needs the composite. Ordinary top-level layers remain separate.
  const hybrid =
    preset.mode === 'hybrid' &&
    !scene.layers.some((l) => l.type === 'adjustment' || l.blend_mode !== 'normal');
  const sx = g.trim_pt[0] / scene.canvas.width,
    sy = g.trim_pt[1] / scene.canvas.height;
  doc
    .save()
    .rect(mark, mark, pageSize[0] - 2 * mark, pageSize[1] - 2 * mark)
    .clip();
  const backgroundAlpha = alpha(scene.canvas.background);
  const background =
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(scene.canvas.background.slice(i, i + 2), 16) * backgroundAlpha +
            parseInt(preset.background.slice(i, i + 2), 16) * (1 - backgroundAlpha),
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  doc
    .rect(mark, mark, pageSize[0] - 2 * mark, pageSize[1] - 2 * mark)
    .fill(await colour(background));
  if (!hybrid) {
    const r = await renderer.render(prepared.scene, root, { cache: false, ...prepared.options });
    await raster(r.png, mark, mark, pageSize[0] - mark * 2, pageSize[1] - mark * 2);
    rasterIds.push(...scene.layers.map((l) => l.id));
  } else
    for (const n of exportLayers(resolveLayout(scene))) {
      if (!n.layer.visible) continue;
      const l = n.layer;
      if (!simple(n)) {
        const r = await renderer.render(prepared.scene, root, {
          cache: false,
          ...prepared.options,
          layer: l.id,
        });
        await raster(r.png, mark, mark, pageSize[0] - 2 * mark, pageSize[1] - 2 * mark);
        rasterIds.push(l.id);
        continue;
      }
      vectorIds.push(l.id);
      doc
        .save()
        .translate(mark + g.bleed_pt, mark + g.bleed_pt)
        .scale(sx, sy)
        .transform(...n.matrix)
        .opacity(l.opacity);
      const w = n.bounds[2],
        h = n.bounds[3];
      if (l.type === 'procedural') {
        const auto = scene.layers.includes(l) && !l.bounds && !l.width && !l.height,
          x = auto ? -g.bleed_pt / sx : 0,
          y = auto ? -g.bleed_pt / sy : 0,
          dw = auto ? w + (2 * g.bleed_pt) / sx : w,
          dh = auto ? h + (2 * g.bleed_pt) / sy : h;
        const gen = l.generator!;
        if (gen.type === 'solid')
          doc
            .fillOpacity(l.opacity * alpha(gen.colour))
            .rect(x, y, dw, dh)
            .fill(await colour(gen.colour));
        else if (gen.type === 'gradient') {
          const angle = (gen.angle * Math.PI) / 180,
            dx = Math.cos(angle),
            dy = Math.sin(angle),
            span = Math.abs(dw * dx) + Math.abs(dh * dy);
          const gradient = doc
            .linearGradient(
              x + dw / 2 - (dx * span) / 2,
              y + dh / 2 - (dy * span) / 2,
              x + dw / 2 + (dx * span) / 2,
              y + dh / 2 + (dy * span) / 2,
            )
            .stop(0, (await colour(gen.from)) as string, alpha(gen.from))
            .stop(1, (await colour(gen.to)) as string, alpha(gen.to));
          doc.rect(x, y, dw, dh).fill(gradient);
        }
      } else if (l.shape) {
        const s = l.shape;
        doc.fillColor(await colour(s.fill), l.opacity * alpha(s.fill));
        if (s.dash?.length) doc.addContent(`[${s.dash.join(' ')}] ${s.dash_offset ?? 0} d`);
        if (s.type === 'rectangle') doc.roundedRect(0, 0, w, h, Math.min(s.radius, w / 2, h / 2));
        else if (s.type === 'ellipse') doc.ellipse(w / 2, h / 2, w / 2, h / 2);
        else doc.path(s.d);
        if (s.stroke)
          doc
            .lineWidth(s.stroke_width)
            .lineCap(s.line_cap ?? 'butt')
            .lineJoin(s.line_join ?? 'miter')
            .strokeColor(await colour(s.stroke), l.opacity * alpha(s.stroke))
            .fillAndStroke();
        else doc.fill();
      } else {
        const ctx = createCanvas(1, 1).getContext('2d'),
          layout = layoutText(ctx, l, w, h, aliases),
          s = l.style!;
        doc
          .rect(0, 0, w, h)
          .clip()
          .font(await fontPath(n))
          .fontSize(s.size)
          .fillColor(await colour(s.colour), l.opacity * alpha(s.colour));
        for (let i = 0; i < layout.lines.length; i++) {
          if (layout.spans) {
            for (const span of layout.spans[i]!) {
              const node = { ...n, layer: { ...l, style: { ...s, weight: span.weight } } };
              doc
                .font(await fontPath(node))
                .fontSize(s.size)
                .fillColor(await colour(span.colour), l.opacity * alpha(span.colour))
                .text(span.text, span.x, i * s.size * s.line_height, {
                  lineBreak: false,
                  baseline: 'top',
                  characterSpacing: s.tracking ?? 0,
                  features: (s.kerning === false
                    ? { kern: false }
                    : ['kern']) as unknown as PDFKit.Mixins.TextOptions['features'],
                });
            }
          } else {
            const line = layout.lines[i]!,
              width = ctx.measureText(line).width,
              x = s.align === 'center' ? (w - width) / 2 : s.align === 'right' ? w - width : 0;
            doc.text(line, x, i * s.size * s.line_height, {
              lineBreak: false,
              baseline: 'top',
              characterSpacing: s.tracking ?? 0,
              features: (s.kerning === false
                ? { kern: false }
                : ['kern']) as unknown as PDFKit.Mixins.TextOptions['features'],
            });
          }
        }
      }
      doc.restore();
    }
  doc.restore();
  if (mark) {
    doc.strokeColor(preset.colour_space === 'cmyk' ? [0, 0, 0, 100] : '#000000').lineWidth(0.25);
    const x0 = mark + g.bleed_pt,
      x1 = x0 + g.trim_pt[0],
      y0 = mark + g.bleed_pt,
      y1 = y0 + g.trim_pt[1];
    for (const x of [x0, x1]) {
      doc
        .moveTo(x, 2)
        .lineTo(x, mark - 3)
        .moveTo(x, pageSize[1] - mark + 3)
        .lineTo(x, pageSize[1] - 2);
    }
    for (const y of [y0, y1])
      doc
        .moveTo(2, y)
        .lineTo(mark - 3, y)
        .moveTo(pageSize[0] - mark + 3, y)
        .lineTo(pageSize[0] - 2, y);
    doc.stroke();
  }
  doc.end();
  return {
    bytes: await completed,
    vector_layers: vectorIds,
    raster_layers: rasterIds,
    geometry: g,
    maximum_ink_percent: maximumInk,
  };
}
