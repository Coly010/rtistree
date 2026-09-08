import { sceneHash } from './assets.js';
import { createCanvas } from './native.js';
import { flattenResolved, intersects, resolveLayout } from './layout.js';
import { rgba } from './paint.js';
import type { Renderer, RenderEvidence, RenderResult } from './render.js';
import type { Bounds, Scene } from './schema.js';

export interface Issue {
  id: string;
  category: 'composition' | 'typography' | 'semantic';
  severity: 'high' | 'medium';
  target?: string;
  region?: Bounds;
  message: string;
  measured?: number;
  expected?: number | string;
}
export interface VerificationReport {
  status: 'pass' | 'fail';
  score: number;
  issues: Issue[];
  checks: number;
  evidence: RenderEvidence;
  limitations: string[];
}
export function contrastRatio(a: string, b: string): number {
  const luminance = (colour: string) => {
    const c = rgba(colour)
      .slice(0, 3)
      .map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function verifyScene(
  scene: Scene,
  render: RenderResult,
  pixels?: Map<string, { contrast: number[]; visible: number; samples: number }>,
): VerificationReport {
  if (
    render.evidence.scene.hash !== sceneHash(scene) ||
    render.width !== scene.canvas.width ||
    render.height !== scene.canvas.height ||
    render.evidence.render.region ||
    render.evidence.render.layer ||
    render.evidence.render.excluded_layers?.length
  )
    throw new Error('Verification requires a full-resolution render of this exact scene');
  const all = flattenResolved(resolveLayout(scene)),
    index = new Map(all.map((n) => [n.layer.id, n])),
    issues: Issue[] = [];
  let checks = 0;
  const issue = (value: Omit<Issue, 'id'>) =>
    issues.push({ id: `issue-${issues.length + 1}`, ...value });
  const overflowChecked = new Set<string>();
  function overflow(target: string) {
    if (overflowChecked.has(target)) return;
    overflowChecked.add(target);
    checks++;
    const diagnostic = render.text.find((t) => t.layer === target),
      node = index.get(target)!;
    if (!diagnostic) {
      issue({
        category: 'typography',
        severity: 'high',
        target,
        region: node.worldBounds,
        message: 'Text target is hidden, unrendered, or is not a text layer.',
      });
      return;
    }
    if (diagnostic.overflow)
      issue({
        category: 'typography',
        severity: 'high',
        target,
        region: node.worldBounds,
        message: 'Text exceeds its box and will be clipped.',
        measured: diagnostic.height,
        expected: diagnostic.available[1],
      });
  }
  for (const t of render.text) overflow(t.layer);
  for (const rule of scene.verification.rules) {
    const node = 'target' in rule ? index.get(rule.target)! : undefined;
    if (rule.type === 'text-overflow') {
      overflow(rule.target);
      continue;
    }
    checks++;
    if (rule.type === 'pixel-contrast' || rule.type === 'visible-area') {
      const measured = pixels?.get(rule.target);
      if (!measured)
        issue({
          category: 'composition',
          severity: 'high',
          target: rule.target,
          message: 'This rule requires verifyRendered / Project.verify to measure the composite.',
        });
      else if (rule.type === 'visible-area') {
        if (measured.visible < rule.minimum)
          issue({
            category: 'composition',
            severity: 'high',
            target: rule.target,
            region: node!.worldBounds,
            message: 'Insufficient visible contribution from the target layer.',
            measured: measured.visible,
            expected: rule.minimum,
          });
      } else {
        const ratio =
          measured.contrast[
            Math.min(
              measured.contrast.length - 1,
              Math.floor(rule.percentile * measured.contrast.length),
            )
          ] ?? 1;
        if (!measured.samples || ratio < rule.minimum)
          issue({
            category: 'typography',
            severity: 'high',
            target: rule.target,
            region: node!.worldBounds,
            message: 'Rendered foreground contrast is below the target.',
            measured: ratio,
            expected: rule.minimum,
          });
      }
    }
    if (rule.type === 'region-luma') {
      const [x, y, w, h] = rule.bounds;
      let sum = 0,
        count = 0;
      for (let py = Math.max(0, Math.ceil(y)); py < Math.min(render.height, y + h); py++)
        for (let px = Math.max(0, Math.ceil(x)); px < Math.min(render.width, x + w); px++) {
          const i = (py * render.width + px) * 4;
          sum +=
            (0.2126 * render.pixels[i]! +
              0.7152 * render.pixels[i + 1]! +
              0.0722 * render.pixels[i + 2]!) /
            255;
          count++;
        }
      const luma = count ? sum / count : 0;
      if (!count || luma < rule.minimum || luma > rule.maximum)
        issue({
          category: 'composition',
          severity: 'medium',
          region: rule.bounds,
          message: 'Rendered region luma is outside the requested range.',
          measured: luma,
          expected: luma < rule.minimum ? rule.minimum : rule.maximum,
        });
    }
    if (rule.type === 'safe-area') {
      const [x, y, w, h] = node!.worldBounds,
        margin = Math.min(x, y, scene.canvas.width - x - w, scene.canvas.height - y - h);
      if (margin < rule.minimum)
        issue({
          category: 'composition',
          severity: 'high',
          target: rule.target,
          region: node!.worldBounds,
          message: 'Layer violates the canvas safe area.',
          measured: margin,
          expected: rule.minimum,
        });
    }
    if (rule.type === 'text-equals' && node!.layer.content !== rule.expected)
      issue({
        category: 'semantic',
        severity: 'high',
        target: rule.target,
        region: node!.worldBounds,
        message: 'Text does not match the requested copy.',
        expected: rule.expected,
      });
    if (rule.type === 'required-role' && !all.some((n) => n.layer.role === rule.role && n.visible))
      issue({
        category: 'semantic',
        severity: 'high',
        message: `Missing visible semantic role: ${rule.role}`,
      });
    if (rule.type === 'contrast') {
      const colour = node!.layer.style?.colour ?? node!.layer.shape?.fill;
      if (!colour)
        issue({
          category: 'typography',
          severity: 'high',
          target: rule.target,
          message: 'Contrast rule needs a text or solid vector colour.',
        });
      else {
        const ratio = contrastRatio(colour, rule.against);
        if (ratio < rule.minimum)
          issue({
            category: 'typography',
            severity: 'high',
            target: rule.target,
            region: node!.worldBounds,
            message: 'Declared foreground/background colour contrast is below the target.',
            measured: ratio,
            expected: rule.minimum,
          });
      }
    }
    if (
      rule.type === 'no-overlap' &&
      intersects(node!.worldBounds, index.get(rule.other)!.worldBounds)
    )
      issue({
        category: 'composition',
        severity: 'medium',
        target: rule.target,
        region: node!.worldBounds,
        message: `Layer bounds overlap ${rule.other}.`,
      });
  }
  return {
    status: issues.length ? 'fail' : 'pass',
    score: checks ? Math.max(0, 1 - issues.length / checks) : 1,
    issues,
    checks,
    evidence: render.evidence,
    limitations: [
      'Rule checks do not judge aesthetic quality or semantic image content.',
      'The legacy contrast rule uses declared colours; pixel-contrast measures the rendered composite.',
      'Overlap and safe areas use transformed layer boxes.',
    ],
  };
}
export interface LocalityEvidence {
  changed_pixels: number;
  outside_changed_pixels: number;
  changed_bounds: Bounds | null;
  scopes: Bounds[];
}
export function measureLocality(
  before: RenderResult,
  after: RenderResult,
  scopes: Bounds[],
): LocalityEvidence {
  if (before.width !== after.width || before.height !== after.height)
    throw new Error('Cannot compare images with different dimensions');
  let changed = 0,
    outside = 0,
    minX = before.width,
    minY = before.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < before.height; y++)
    for (let x = 0; x < before.width; x++) {
      const i = (y * before.width + x) * 4;
      if ([0, 1, 2, 3].some((c) => before.pixels[i + c] !== after.pixels[i + c])) {
        changed++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (!scopes.some(([sx, sy, w, h]) => x >= sx && x < sx + w && y >= sy && y < sy + h))
          outside++;
      }
    }
  return {
    changed_pixels: changed,
    outside_changed_pixels: outside,
    changed_bounds: changed ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null,
    scopes,
  };
}
export async function verificationHeatmap(
  scene: Scene,
  report: VerificationReport,
): Promise<Buffer> {
  const canvas = createCanvas(scene.canvas.width, scene.canvas.height),
    ctx = canvas.getContext('2d');
  for (const issue of report.issues)
    if (issue.region) {
      ctx.fillStyle = issue.severity === 'high' ? '#ff454566' : '#ffb02066';
      ctx.fillRect(...issue.region);
      ctx.strokeStyle = '#ff4545';
      ctx.lineWidth = 2;
      ctx.strokeRect(...issue.region);
    }
  return canvas.encode('png');
}

function luminance(pixels: Uint8ClampedArray, i: number) {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(pixels[i]!) +
    0.7152 * channel(pixels[i + 1]!) +
    0.0722 * channel(pixels[i + 2]!)
  );
}
/** Counterfactual renders measure visible contrast and occlusion, including opacity and overlays. */
export async function verifyRendered(
  scene: Scene,
  root: string,
  renderer: Renderer,
  full?: RenderResult,
): Promise<VerificationReport> {
  const render = full ?? (await renderer.render(scene, root)),
    measurements = new Map<string, { contrast: number[]; visible: number; samples: number }>();
  const targets = new Set(
    scene.verification.rules.flatMap((rule) =>
      rule.type === 'pixel-contrast' || rule.type === 'visible-area' ? [rule.target] : [],
    ),
  );
  for (const target of targets) {
    const without = await renderer.render(scene, root, { excludeLayers: [target] }),
      isolated = await renderer.render(scene, root, { layer: target });
    let maximum = 0;
    for (let i = 3; i < isolated.pixels.length; i += 4)
      maximum = Math.max(maximum, isolated.pixels[i]!);
    let total = 0,
      visible = 0;
    const contrast: number[] = [];
    for (let i = 0; i < isolated.pixels.length; i += 4) {
      if (!maximum || isolated.pixels[i + 3]! < maximum * 0.9) continue;
      total++;
      const delta = Math.max(
        ...[0, 1, 2, 3].map((c) => Math.abs(render.pixels[i + c]! - without.pixels[i + c]!)),
      );
      if (delta < 2) continue;
      visible++;
      const a = luminance(render.pixels, i),
        b = luminance(without.pixels, i);
      contrast.push((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
    }
    contrast.sort((a, b) => a - b);
    measurements.set(target, {
      contrast,
      visible: total ? visible / total : 0,
      samples: contrast.length,
    });
  }
  const report = verifyScene(scene, render, measurements);
  report.limitations.push(
    'Pixel contrast compares the final composite with the target omitted, sampling solid glyph/shape interiors. It is not an accessibility certification.',
  );
  return report;
}
