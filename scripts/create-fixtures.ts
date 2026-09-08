import { resolve } from 'node:path';
import { loadScene } from '../src/loader.js';
import { defaultRenderer } from '../src/render.js';
import { writeArtifact } from '../src/artifacts.js';
const source = await loadScene(resolve('examples/poster/assets/cover.scene.yaml'));
const render = await defaultRenderer.render(source.scene, source.root);
await writeArtifact(resolve('examples/poster/assets/cover.png'), render.png);
console.log(
  JSON.stringify({
    asset: 'examples/poster/assets/cover.png',
    hash: render.evidence.render.png_hash,
  }),
);
