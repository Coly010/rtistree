import { create } from 'fontkit';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { localAssetPath, sha256 } from './assets.js';
import { flattenLayers, type Scene } from './schema.js';
export async function inspectFonts(scene: Scene, root: string) {
  const results = [];
  for (const layer of flattenLayers(scene.layers)) {
    if (layer.type !== 'text' || !layer.visible) continue;
    const s = layer.style!;
    for (const run of layer.runs ?? [{ text: layer.content!, weight: s.weight }]) {
      const weight = run.weight ?? s.weight,
        custom = scene.fonts?.[s.font],
        pkg = s.font === 'display' ? '@fontsource/dm-serif-display' : '@fontsource/inter';
      const file = custom
        ? await localAssetPath(root, custom.source)
        : resolve(
            dirname(createRequire(import.meta.url).resolve(`${pkg}/package.json`)),
            'files',
            s.font === 'display'
              ? 'dm-serif-display-latin-400-normal.woff'
              : `inter-latin-${weight === 'bold' ? 700 : 400}-normal.woff`,
          );
      const bytes = await readFile(file);
      if (custom?.hash && sha256(bytes) !== custom.hash) throw new Error('Font hash mismatch');
      const font = create(bytes);
      if (!('hasGlyphForCodePoint' in font))
        throw new Error('Font collections must be split into individual font files');
      const missing = [
        ...new Set(
          [...run.text].filter(
            (c) => !/[\r\n\t]/.test(c) && !font.hasGlyphForCodePoint(c.codePointAt(0)!),
          ),
        ),
      ];
      results.push({ layer: layer.id, font: s.font, weight, hash: sha256(bytes), missing });
    }
  }
  return results;
}
