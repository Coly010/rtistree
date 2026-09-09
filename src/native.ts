// Load Skia without machine-specific fallback fonts. All project fonts are pinned
// packages registered explicitly by assets.ts. Keep this import ahead of Skia use.
process.env.DISABLE_SYSTEM_FONTS_LOAD = '1';
const native = await import('@napi-rs/canvas');
export const { createCanvas, Path2D, PathOp, SvgExportFlag, GlobalFonts, loadImage } = native;
export type { Canvas, SKRSContext2D, Image } from '@napi-rs/canvas';
export type Path2D = import('@napi-rs/canvas').Path2D;
