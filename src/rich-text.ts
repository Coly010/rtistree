import type { SKRSContext2D } from './native.js';
import type { Layer } from './schema.js';
export interface TextSpan {
  text: string;
  x: number;
  width: number;
  colour: string;
  weight: 'regular' | 'bold';
}
export function richLayout(
  ctx: SKRSContext2D,
  layer: Layer,
  width: number,
  font: (layer: Layer) => string,
) {
  const s = layer.style!,
    runs = layer.runs!;
  const slices: { start: number; end: number; run: (typeof runs)[number] }[] = [];
  let cursor = 0;
  for (const run of runs) {
    slices.push({ start: cursor, end: cursor + run.text.length, run });
    cursor += run.text.length;
  }
  const spans = (start: number, end: number) =>
    slices
      .filter((r) => r.start < end && r.end > start)
      .map((r) => {
        const text = layer.content!.slice(Math.max(start, r.start), Math.min(end, r.end)),
          weight = r.run.weight ?? s.weight;
        ctx.font = font({ ...layer, style: { ...s, weight } });
        return {
          text,
          x: 0,
          width: ctx.measureText(text).width,
          colour: r.run.colour ?? s.colour,
          weight,
        };
      });
  const lines: TextSpan[][] = [[]];
  let used = 0,
    pending: TextSpan[] = [];
  for (const match of layer.content!.matchAll(/\n|[^\S\n]+|[^\s]+/g)) {
    if (match[0] === '\n') {
      lines.push([]);
      used = 0;
      pending = [];
      continue;
    }
    const parts = spans(match.index!, match.index! + match[0].length);
    if (/^\s+$/.test(match[0])) {
      pending = parts;
      continue;
    }
    const sum = (items: TextSpan[]) => items.reduce((a, b) => a + b.width, 0),
      pw = used ? sum(pending) : 0;
    if (used && used + pw + sum(parts) > width) {
      lines.push([]);
      used = 0;
      pending = [];
    }
    for (const part of [...(used ? pending : []), ...parts]) {
      part.x = used;
      lines.at(-1)!.push(part);
      used += part.width;
    }
    pending = [];
  }
  for (const line of lines) {
    const length = line.reduce((a, b) => a + b.width, 0),
      offset =
        s.align === 'center' ? (width - length) / 2 : s.align === 'right' ? width - length : 0;
    for (const span of line) span.x += offset;
  }
  return lines;
}
