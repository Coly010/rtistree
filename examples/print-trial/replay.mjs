import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project, exportArtwork, sha256 } from '../../dist/index.js';

const source = dirname(fileURLToPath(import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'rtistree-print-replay-'));
try {
  for (const name of ['scene.json', 'rtistree.yaml', 'assets', 'profiles']) {
    await cp(join(source, name), join(scratch, name), { recursive: true });
  }
  const generation = JSON.parse(await readFile(join(source, 'generation.json'), 'utf8'));
  assert.equal(sha256(await readFile(join(scratch, generation.source))), generation.source_hash);
  const project = await Project.open(scratch);
  await project.apply(JSON.parse(await readFile(join(source, 'refine.patch.json'), 'utf8')));
  assert.ok((await project.render()).png.equals(await readFile(join(source, 'output/after.png'))));
  assert.equal((await project.verify()).status, 'pass');
  const output = await exportArtwork(
    project,
    join(scratch, 'output/replay.pdf'),
    project.config.presets.print,
  );
  assert.equal(output.status, 'pass');
  assert.ok(output.inspection.embedded_fonts.length > 0);
  console.log(
    JSON.stringify({ status: 'pass', replay_identical: true, pdf: output.inspection.pages }),
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
