import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project, sha256 } from '../../dist/index.js';

const source = dirname(fileURLToPath(import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'rtistree-generated-trial-'));
try {
  for (const name of ['scene.yaml', 'layers', 'assets']) {
    await cp(join(source, name), join(scratch, name), { recursive: true });
  }
  const generation = JSON.parse(await readFile(join(source, 'generation.json'), 'utf8'));
  assert.equal(
    sha256(await readFile(join(scratch, generation.source_file))),
    generation.source_hash,
  );
  const project = await Project.open(join(scratch, 'scene.yaml'));
  const before = await project.render();
  await project.apply(JSON.parse(await readFile(join(source, 'compose.patch.json'), 'utf8')));
  const after = await project.render();
  let photographChanges = 0;
  for (let y = 80; y < 920; y++) {
    for (let x = 680; x < 1520; x++) {
      const index = (y * 1600 + x) * 4;
      if (after.pixels.slice(index, index + 4).some((v, c) => v !== before.pixels[index + c])) {
        photographChanges++;
      }
    }
  }
  assert.equal(photographChanges, 0);
  assert.equal((await project.verify()).status, 'pass');
  assert.ok(after.png.equals(await readFile(join(source, 'output', 'after.png'))));
  console.log(
    JSON.stringify({
      status: 'pass',
      photograph_changed_pixels: photographChanges,
      replay_identical: true,
    }),
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
