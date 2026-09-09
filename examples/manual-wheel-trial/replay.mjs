import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Project, copyRecipe, replayRecipe, sha256 } from '../../dist/index.js';

const root = dirname(fileURLToPath(import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'rtistree-wheel-replay-'));
try {
  const scene = JSON.parse(await readFile(join(root, 'final.scene.json'), 'utf8'));
  const outputs = {};
  for (const [id, asset] of Object.entries(scene.assets)) {
    assert.ok(asset.recipe, 'Every image in this trial must have a raster-program recipe');
    const recipe = JSON.parse(await readFile(join(root, asset.recipe.source), 'utf8'));
    assert.equal(
      Object.keys(recipe.inputs).length,
      0,
      'This trial must start with no image inputs',
    );
    const reference = await copyRecipe(root, asset.recipe, scratch);
    const replay = await replayRecipe(scratch, reference);
    assert.equal(replay.identical, true, `Recipe ${id} did not reproduce`);
    assert.equal(replay.output_hash, asset.hash);
    await mkdir(dirname(join(scratch, asset.source)), { recursive: true });
    await writeFile(join(scratch, asset.source), replay.png);
    outputs[id] = replay.output_hash;
  }
  await writeFile(join(scratch, 'scene.json'), JSON.stringify(scene));
  const project = await Project.open(join(scratch, 'scene.json'));
  const image = await project.render({ cache: false });
  assert.ok(image.png.equals(await readFile(join(root, 'output/after.png'))));
  const macro = JSON.parse(await readFile(join(root, 'macro.scene.json'), 'utf8'));
  assert.ok(
    (await project.renderer.render(macro, scratch, { cache: false })).png.equals(
      await readFile(join(root, 'output/macro.png')),
    ),
  );
  const report = {
    status: 'pass',
    image_inputs: 0,
    recipes_rebuilt: Object.keys(outputs).length,
    final_png_hash: sha256(image.png),
    composite_identical: true,
    macro_identical: true,
    outputs,
  };
  await writeFile(join(root, 'output/replay.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
