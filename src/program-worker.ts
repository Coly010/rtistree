import { parentPort, workerData } from 'node:worker_threads';
import { Script, createContext } from 'node:vm';
import { createCanvas, loadImage, type Canvas } from './native.js';
import { createRasterStudio } from './raster-studio.js';
import { registerFonts } from './assets.js';

try {
  const { source, width, height, seed, parameters, inputs, timeout_ms } = workerData;
  await registerFonts();
  const images: Record<string, Canvas> = Object.create(null);
  for (const [name, bytes] of Object.entries(inputs)) {
    const image = await loadImage(Buffer.from(bytes as Uint8Array)),
      c = createCanvas(image.width, image.height);
    c.getContext('2d').drawImage(image, 0, 0);
    images[name] = c;
  }
  const art = createRasterStudio(width, height, seed, images);
  // Convenience isolation, NOT a security sandbox: native objects expose host methods.
  const context = createContext(
    { art, parameters, Date: undefined, performance: undefined },
    { codeGeneration: { strings: false, wasm: false } },
  );
  new Script('Math.random = art.random; Object.freeze(Math);').runInContext(context);
  const result = new Script(
    `(function(art, parameters) { "use strict";\n${source}\n})(art, parameters)`,
    { filename: 'raster-program.js' },
  ).runInContext(context, { timeout: timeout_ms });
  if (
    !result ||
    result.width !== width ||
    result.height !== height ||
    typeof result.toBuffer !== 'function'
  )
    throw new Error('Program must return a Canvas with the declared dimensions');
  const png = result.toBuffer('image/png');
  parentPort!.postMessage({ png });
} catch (error) {
  parentPort!.postMessage({ error: error instanceof Error ? error.message : String(error) });
}
