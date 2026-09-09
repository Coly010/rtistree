import { createCanvas } from './native.js';
import { layoutText } from './render.js';
import { registerFonts, registerProjectFonts } from './assets.js';
import { inspectFonts } from './font-inspection.js';
import { imagePlacement } from './graphics.js';
import { exportSvg } from './svg.js';
import sharp from 'sharp';
import { PDFDocument, PDFName, PDFRawStream, PDFDict, PDFArray, decodePDFRawStream } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { localAssetPath, sceneHash, sha256 } from './assets.js';
import { writeArtifact } from './artifacts.js';
import { flattenResolved, resolveLayout } from './layout.js';
import { exportPresetSchema, documentGeometry, type ExportPreset } from './document.js';
import { printScene } from './print-scene.js';
import { makePdf } from './pdf-output.js';
import type { Project } from './project.js';
import { layerMasks, type Scene, type Layer } from './schema.js';
export async function outputProfile(root: string, preset: ExportPreset) {
  if (preset.colour_space !== 'cmyk') {
    if (preset.profile) throw new Error('An output CMYK profile requires colour_space cmyk');
    return undefined;
  }
  if (!preset.profile)
    throw new Error('CMYK export requires a project-local printer/paper ICC profile');
  const path = await localAssetPath(root, preset.profile),
    bytes = await readFile(path);
  if (
    bytes.length < 128 ||
    bytes.length > 16 * 1024 * 1024 ||
    bytes.toString('ascii', 36, 40) !== 'acsp' ||
    bytes.toString('ascii', 16, 20) !== 'CMYK' ||
    bytes.readUInt32BE(0) !== bytes.length
  )
    throw new Error('Invalid CMYK ICC profile');
  if (preset.profile_hash && preset.profile_hash !== sha256(bytes))
    throw new Error('ICC profile hash mismatch');
  await sharp({ create: { width: 1, height: 1, channels: 3, background: '#808080' } })
    .withIccProfile(path)
    .toColourspace('cmyk')
    .raw()
    .toBuffer();
  return { path, bytes, hash: sha256(bytes) };
}
export async function preflight(project: Project, raw: unknown = {}) {
  const preset = exportPresetSchema.parse(raw),
    scene = await project.scene(),
    issues: { severity: 'error' | 'warning'; message: string; layer?: string }[] = [];
  const error = (message: string) => issues.push({ severity: 'error', message });
  let profile: Awaited<ReturnType<typeof outputProfile>>;
  try {
    profile = await outputProfile(project.root, preset);
  } catch (e) {
    error((e as Error).message);
  }
  const physical = scene.document
    ? documentGeometry({ ...scene.document, ppi: preset.ppi ?? scene.document.ppi })
    : undefined;
  if (preset.format === 'pdf' && !physical) error('PDF requires physical document dimensions');
  if (preset.format === 'png' && preset.colour_space === 'cmyk') error('PNG does not support CMYK');
  const fonts = await inspectFonts(scene, project.root);
  for (const font of fonts)
    if (font.missing.length)
      error(`Layer ${font.layer} font ${font.font} lacks: ${font.missing.join(' ')}`);
  await registerFonts();
  const aliases = (await registerProjectFonts(scene, project.root)).aliases,
    ctx = createCanvas(1, 1).getContext('2d');
  for (const n of flattenResolved(resolveLayout(scene))) {
    if (n.visible && n.layer.type === 'text') {
      const t = layoutText(ctx, n.layer, n.bounds[2], n.bounds[3], aliases);
      if (t.overflow) error(`Text layer ${n.layer.id} overflows its box`);
      if (physical) {
        const margin = physical.safe_mm;
        const [x, y, w, h] = n.worldBounds,
          scaleX = physical.trim_mm[0] / scene.canvas.width,
          scaleY = physical.trim_mm[1] / scene.canvas.height;
        if (
          x * scaleX < margin ||
          y * scaleY < margin ||
          (scene.canvas.width - x - w) * scaleX < margin ||
          (scene.canvas.height - y - h) * scaleY < margin
        )
          issues.push({
            severity: 'warning',
            layer: n.layer.id,
            message: 'Text box crosses the document safe margin',
          });
      }
    }
  }
  const placements = [];
  if (physical) {
    try {
      printScene(scene, preset.ppi);
    } catch (e) {
      error(`Print scene cannot be represented within renderer limits: ${(e as Error).message}`);
    }
    const depth = (layers: Layer[]): number =>
      Math.max(0, ...layers.map((l) => 1 + depth(l.children)));
    const retained = new Set(
      flattenResolved(resolveLayout(scene)).flatMap((n) =>
        layerMasks(n.layer).flatMap((m) => (m.type === 'semantic-object' ? [m.target] : [])),
      ),
    );
    if (
      physical.pixels[0] * physical.pixels[1] * (depth(scene.layers) + retained.size + 6) >
      160 * 1024 * 1024
    )
      error(
        'Print render exceeds the bounded CPU surface budget; lower ppi or simplify nested/mask dependencies',
      );
    if (
      Math.abs(
        scene.canvas.width / scene.canvas.height - physical.trim_mm[0] / physical.trim_mm[1],
      ) > 0.002
    )
      error('Canvas and trim aspect ratios disagree');
    if (
      Math.max(...physical.pixels) > 8192 ||
      physical.pixels[0] * physical.pixels[1] > 32 * 1024 * 1024
    )
      error('Print dimensions exceed the 8192-pixel edge / 32-megapixel export budget');
    for (const n of flattenResolved(resolveLayout(scene))) {
      if (!n.visible || !n.layer.source) continue;
      const asset = scene.assets[n.layer.source]!,
        bytes = await readFile(await localAssetPath(project.root, asset.source));
      if (asset.hash && sha256(bytes) !== asset.hash)
        error(`Asset hash mismatch: ${n.layer.source}`);
      const m = await sharp(bytes).metadata();
      const sx = Math.hypot(n.matrix[0], n.matrix[1]),
        sy = Math.hypot(n.matrix[2], n.matrix[3]);
      const width = (n.bounds[2] * sx * physical.trim_mm[0]) / scene.canvas.width,
        height = (n.bounds[3] * sy * physical.trim_mm[1]) / scene.canvas.height;
      const placement = imagePlacement(n.layer, m.width!, m.height!, n.bounds[2], n.bounds[3]);
      const ppi = Math.min(
        (placement.crop[2] /
          ((placement.destination[2] * sx * physical.trim_mm[0]) / scene.canvas.width)) *
          25.4,
        (placement.crop[3] /
          ((placement.destination[3] * sy * physical.trim_mm[1]) / scene.canvas.height)) *
          25.4,
      );
      if (n.layer.perspective)
        issues.push({
          severity: 'warning',
          layer: n.layer.id,
          message:
            'Effective ppi is a pre-warp estimate; perspective causes spatially varying sampling resolution',
        });
      placements.push({
        layer: n.layer.id,
        source_pixels: [m.width, m.height],
        placed_mm: [width, height],
        effective_ppi: ppi,
        resampled: ppi < (preset.ppi ?? scene.document!.ppi),
      });
      if (ppi < preset.minimum_ppi)
        issues.push({
          severity: 'warning',
          layer: n.layer.id,
          message: `Effective image resolution ${ppi.toFixed(1)} ppi is below ${preset.minimum_ppi}`,
        });
    }
  }
  return {
    status: issues.some((i) => i.severity === 'error') ? 'fail' : 'pass',
    scene_hash: sceneHash(scene),
    preset,
    profile_hash: profile?.hash,
    geometry: physical,
    placements,
    fonts,
    issues,
    conformance: 'PDF/X conformance is not asserted',
  };
}
export async function inspectOutput(bytes: Buffer, format: string) {
  if (format === 'svg') {
    if (!bytes.toString().startsWith('<svg')) throw new Error('Invalid SVG output');
    return { format: 'svg' };
  }
  if (format === 'pdf') {
    if (bytes.toString('ascii', 0, 5) !== '%PDF-') throw new Error('Invalid PDF signature');
    const pdf = await PDFDocument.load(bytes),
      pages = pdf.getPages();
    const images: { width: number; height: number; colour_space: string }[] = [],
      fonts: string[] = [],
      profiles: string[] = [];
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
      const dict =
        obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : undefined;
      if (!dict) continue;
      const kind = dict.get(PDFName.of('Subtype'))?.toString();
      if (kind === '/Image')
        images.push({
          width: Number(dict.get(PDFName.of('Width'))?.toString()),
          height: Number(dict.get(PDFName.of('Height'))?.toString()),
          colour_space: dict.get(PDFName.of('ColorSpace'))?.toString() ?? '',
        });
      if (
        dict.has(PDFName.of('FontFile')) ||
        dict.has(PDFName.of('FontFile2')) ||
        dict.has(PDFName.of('FontFile3'))
      )
        fonts.push(dict.get(PDFName.of('FontName'))?.toString() ?? 'embedded');
      if (obj instanceof PDFRawStream && dict.get(PDFName.of('N'))?.toString() === '4')
        profiles.push(sha256(decodePDFRawStream(obj).decode()));
    }
    const intents = pdf.catalog.lookupMaybe(PDFName.of('OutputIntents'), PDFArray);
    return {
      format: 'pdf',
      pages: pages.map((p) => ({
        media: p.getMediaBox(),
        trim: p.getTrimBox(),
        bleed: p.getBleedBox(),
      })),
      images,
      embedded_fonts: fonts,
      profile_hashes: profiles,
      output_intents: intents?.size() ?? 0,
    };
  }
  const m = await sharp(bytes).metadata();
  if (m.format !== (format === 'jpg' ? 'jpeg' : format))
    throw new Error('Encoded format does not match requested extension');
  return {
    format: m.format,
    width: m.width,
    height: m.height,
    colour_space: m.space,
    channels: m.channels,
    depth: m.depth,
    density: m.density,
    has_alpha: m.hasAlpha,
    profile_hash: m.icc ? sha256(m.icc) : undefined,
  };
}
export async function exportArtwork(project: Project, file: string, raw: unknown = {}) {
  const preset = exportPresetSchema.parse(raw),
    report = await preflight(project, preset);
  if (report.status === 'fail')
    throw new Error(
      report.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('; '),
    );
  const extension = extname(file).toLowerCase();
  if (
    !{
      png: ['.png'],
      jpeg: ['.jpg', '.jpeg'],
      tiff: ['.tif', '.tiff'],
      pdf: ['.pdf'],
      svg: ['.svg'],
    }[preset.format].includes(extension)
  )
    throw new Error('Output extension does not match export format');
  const scene = await project.scene(),
    profile = await outputProfile(project.root, preset);
  let bytes: Buffer,
    details: Record<string, unknown> = {};
  if (preset.format === 'pdf') {
    const result = await makePdf(scene, project.root, project.renderer, preset, profile);
    bytes = result.bytes;
    details = {
      vector_layers: result.vector_layers,
      raster_layers: result.raster_layers,
      maximum_ink_percent: result.maximum_ink_percent,
    };
  } else if (preset.format === 'svg') {
    if (preset.colour_space !== 'srgb') throw new Error('SVG output requires sRGB');
    bytes = await exportSvg(scene, project.root, project.renderer);
  } else {
    const prepared = scene.document ? printScene(scene, preset.ppi) : undefined;
    const rendered = await project.renderer.render(prepared?.scene ?? scene, project.root, {
      cache: false,
      ...prepared?.options,
    });
    let pipeline = sharp(rendered.png);
    if (preset.format === 'jpeg' || preset.colour_space === 'cmyk')
      pipeline = pipeline.flatten({ background: preset.background });
    if (scene.document)
      pipeline = pipeline.withMetadata({ density: preset.ppi ?? scene.document.ppi });
    pipeline = profile ? pipeline.withIccProfile(profile.path) : pipeline.withIccProfile('srgb');
    bytes = await (
      preset.format === 'jpeg'
        ? pipeline.jpeg({ quality: preset.quality, chromaSubsampling: preset.chroma_subsampling })
        : preset.format === 'tiff'
          ? pipeline.tiff({ compression: 'lzw' })
          : pipeline.png()
    ).toBuffer();
    if (profile) {
      const { data } = await sharp(bytes, { ignoreIcc: true })
        .pipelineColourspace('cmyk')
        .toColourspace('cmyk')
        .raw()
        .toBuffer({ resolveWithObject: true });
      let peak = 0;
      for (let i = 0; i < data.length; i += 4)
        peak = Math.max(
          peak,
          ((data[i]! + data[i + 1]! + data[i + 2]! + data[i + 3]!) / 255) * 100,
        );
      details.maximum_ink_percent = peak;
      if (peak > preset.max_ink)
        report.issues.push({
          severity: 'warning',
          message: `Measured ink coverage ${peak.toFixed(1)}% exceeds ${preset.max_ink}%`,
        });
    }
  }
  if (preset.format === 'pdf' && Number(details.maximum_ink_percent) > preset.max_ink)
    report.issues.push({
      severity: 'warning',
      message: `Measured ink coverage ${Number(details.maximum_ink_percent).toFixed(1)}% exceeds ${preset.max_ink}%`,
    });
  const inspection = await inspectOutput(bytes, preset.format);
  if ('width' in inspection) {
    const pixels = report.geometry?.pixels ?? [scene.canvas.width, scene.canvas.height];
    if (inspection.width !== pixels[0] || inspection.height !== pixels[1])
      throw new Error('Raster pixel dimensions failed read-back');
    if (
      scene.document &&
      Math.abs((inspection.density ?? 0) - (preset.ppi ?? scene.document.ppi)) > 1
    )
      throw new Error('Raster density failed read-back');
  }
  if (
    preset.colour_space === 'cmyk' &&
    preset.format !== 'pdf' &&
    'colour_space' in inspection &&
    inspection.colour_space !== 'cmyk'
  )
    throw new Error('Encoder did not produce CMYK pixels');
  if (profile && 'profile_hash' in inspection && inspection.profile_hash !== profile.hash)
    throw new Error('Encoder changed or omitted output profile');
  if (preset.format === 'pdf' && 'pages' in inspection) {
    const g = report.geometry!;
    const trim = inspection.pages![0]!.trim;
    if (
      Math.abs((trim.width * 25.4) / 72 - g.trim_mm[0]) > 0.01 ||
      Math.abs((trim.height * 25.4) / 72 - g.trim_mm[1]) > 0.01
    )
      throw new Error('PDF physical size read-back failed');
    if (profile && !inspection.profile_hashes!.includes(profile.hash))
      throw new Error('PDF profile read-back failed');
  }
  await writeArtifact(file, bytes);
  const evidence = {
    ...report,
    output_hash: sha256(bytes),
    inspection,
    ...details,
    exporter: { sharp: sharp.versions, pdf: 'pdfkit@0.20.2' },
  };
  await writeArtifact(`${file}.evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
  return { file, evidence: `${file}.evidence.json`, ...evidence };
}

/** ICC round-trip preview; monitor/paper simulation and certification are outside this function. */
export async function softProof(project: Project, file: string, raw: unknown = {}) {
  if (extname(file).toLowerCase() !== '.png') throw new Error('Soft proof output must be .png');
  const preset = exportPresetSchema.parse({ ...(raw as object), colour_space: 'cmyk' }),
    report = await preflight(project, preset);
  if (report.status === 'fail') throw new Error(report.issues.map((i) => i.message).join('; '));
  const profile = (await outputProfile(project.root, preset))!,
    scene = await project.scene();
  const prepared = scene.document ? printScene(scene, preset.ppi) : undefined,
    r = await project.renderer.render(prepared?.scene ?? scene, project.root, {
      cache: false,
      ...prepared?.options,
    });
  const cmyk = await sharp(r.png)
    .flatten({ background: preset.background })
    .withIccProfile(profile.path)
    .tiff({ compression: 'lzw' })
    .toBuffer();
  const bytes = await sharp(cmyk).withIccProfile('srgb').png().toBuffer();
  await writeArtifact(file, bytes);
  const evidence = {
    ...report,
    inspection: await inspectOutput(bytes, 'png'),
    output_hash: sha256(bytes),
    method: 'ICC perceptual sRGB -> project CMYK -> sRGB; no paper-white or monitor simulation',
  };
  await writeArtifact(`${file}.evidence.json`, JSON.stringify(evidence, null, 2) + '\n');
  return { file, ...evidence };
}
