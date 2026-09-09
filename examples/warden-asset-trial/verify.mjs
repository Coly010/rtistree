import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Project, replayRecipe, sha256 } from '../../dist/index.js';
import sharp from 'sharp';
import { walkPose } from './programs/motion.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const atlas = JSON.parse(await readFile(join(root, 'output/atlas.json'), 'utf8'));
const results = [];
for (const item of manifest.items) {
  const bytes = await readFile(join(root, item.file)),
    replay = await replayRecipe(root, item.recipe);
  const recipe = JSON.parse(await readFile(join(root, item.recipe.source), 'utf8'));
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opaque = 0,
    border = 0;
  const box = [512, 640, -1, -1];
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3];
      if (a) {
        opaque++;
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
        if (x === 0 || y === 0 || x === 511 || y === 639) border++;
      }
    }
  const f = atlas.frames[item.id].frame;
  const atlasPixels = await sharp(join(root, 'output/atlas.png'))
    .extract({ left: f.x, top: f.y, width: f.w, height: f.h })
    .ensureAlpha()
    .raw()
    .toBuffer();
  results.push({
    id: item.id,
    motion_source_matches: recipe.source.startsWith(`const walkPose = ${walkPose.toString()};`),
    replay_identical: replay.identical,
    output_hash_matches: sha256(bytes) === item.hash,
    atlas_pixels_identical: atlasPixels.equals(data),
    transparent_margin: border === 0,
    alpha_bounds: box,
    nonempty: opaque > 0 && opaque < 512 * 640,
  });
}
const project = await Project.open(join(root, 'contact-sheet.scene.json'));
const initial = await project.render(),
  cold = await (await Project.open(join(root, 'contact-sheet.scene.json'))).render();
await project.exportScene(join(root, 'portable', 'scene.json'));
const portable = await (await Project.open(join(root, 'portable', 'scene.json'))).render();
const walkHashes = manifest.items.filter((x) => x.id.startsWith('walk_')).map((x) => x.hash);
// Check the actual curve baked into these sprites, independently of frame uniqueness.
const motion = {
  stance_samples: 0,
  recovery_samples: 0,
  max_ground_slip: 0,
  min_recovery_velocity: Infinity,
  minimum_lift: Infinity,
  max_leg_length_error: 0,
};
const dt = 0.00001;
for (let i = 0; i < 1000; i++) {
  const t = (i + 0.5) / 1000,
    a = walkPose(t),
    b = walkPose(t + dt);
  for (const side of ['near', 'far']) {
    const f = a[side],
      next = b[side];
    if (f.contact && next.contact) {
      motion.stance_samples++;
      const worldVelocity = (next.ankle[0] - f.ankle[0]) / dt + a.speed;
      motion.max_ground_slip = Math.max(motion.max_ground_slip, Math.abs(worldVelocity));
      if (f.lift !== 0) throw new Error('Contact foot is not on the ground');
    } else if (!f.contact && !next.contact) {
      motion.recovery_samples++;
      motion.min_recovery_velocity = Math.min(
        motion.min_recovery_velocity,
        (next.ankle[0] - f.ankle[0]) / dt,
      );
      motion.minimum_lift = Math.min(motion.minimum_lift, f.lift);
    }
    const hip = side === 'near' ? a.hipNear : a.hipFar,
      knee = side === 'near' ? a.kneeNear : a.kneeFar;
    for (const length of [
      Math.hypot(knee[0] - hip[0], knee[1] - hip[1]),
      Math.hypot(knee[0] - f.ankle[0], knee[1] - f.ankle[1]),
    ])
      motion.max_leg_length_error = Math.max(
        motion.max_leg_length_error,
        Math.abs(length - a.legLength),
      );
  }
}
motion.pass =
  motion.stance_samples > 0 &&
  motion.recovery_samples > 0 &&
  motion.max_ground_slip < 0.001 &&
  motion.min_recovery_velocity > 0 &&
  motion.minimum_lift > 0 &&
  motion.max_leg_length_error < 0.001;
const audit = {
  status: 'revision-awaiting-visual-review',
  visual_pass: false,
  production_ready: false,
  validation_status: 'blocked-on-visual-quality',
  previous_visual_status: 'failed-user-review',
  motion,
  image_inputs: 0,
  asset_count: results.length,
  unique_walk_frames: new Set(walkHashes).size,
  cold_render_identical: initial.png.equals(cold.png),
  portable_render_identical: initial.png.equals(portable.png),
  contact_sheet_hash: sha256(initial.png),
  results,
  limitations: [
    'One facing only; simplified illustrated forms.',
    'Walk cycle needs user assessment; no locomotion integration or independent animation review.',
    'Replay correctness does not certify visual quality.',
  ],
};
const pass =
  results.every(
    (x) =>
      x.replay_identical &&
      x.motion_source_matches &&
      x.output_hash_matches &&
      x.atlas_pixels_identical &&
      x.transparent_margin &&
      x.nonempty,
  ) &&
  audit.unique_walk_frames === 8 &&
  audit.cold_render_identical &&
  audit.portable_render_identical &&
  motion.pass;
audit.technical_pass = pass;
await writeFile(join(root, 'output/audit.json'), JSON.stringify(audit, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      technical_pass: pass,
      assets: results.length,
      unique_walk_frames: audit.unique_walk_frames,
      cold_identical: audit.cold_render_identical,
      portable_identical: audit.portable_render_identical,
      forward_walk_mechanics: motion.pass,
      visual_pass: false,
    },
    null,
    2,
  ),
);
if (!pass) process.exitCode = 1;
