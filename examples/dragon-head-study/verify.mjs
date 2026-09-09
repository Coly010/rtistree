import {
  Project,
  buildPipeline,
  production,
  sceneHash,
  sha256,
  writeArtifact,
} from '../../dist/index.js';
import { createCanvas, loadImage } from '../../dist/native.js';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const root = fileURLToPath(new URL('.', import.meta.url));
const project = await Project.open(root),
  scene = await project.scene(),
  render = await project.render();
const graph = scene.metadata.pipeline_portrait;
if (graph.nodes.some((n) => n.source || !n.code || Object.keys(n.inputs).length))
  throw new Error('Expected frozen input-free code');
const cold = await project.renderer.render(scene, root, { cache: false });
await project.exportScene(join(root, 'portable', 'scene.json'));
const portable = await Project.open(join(root, 'portable', 'scene.json'));
const scratch = await mkdtemp(join(tmpdir(), 'rtistree-head-study-'));
await writeFile(
  join(scratch, 'scene.json'),
  JSON.stringify({ version: 1, canvas: scene.canvas, layers: [] }),
);
const rebuilt = await Project.open(join(scratch, 'scene.json'));
await buildPipeline(rebuilt, graph);
const replay = await rebuilt.render();
await writeArtifact(join(root, 'output', 'study.png'), render.png);
const mirror = await sharp(render.png).flop().png().toBuffer();
const gray = await sharp(render.png).grayscale().png().toBuffer();
await writeArtifact(join(root, 'output', 'mirrored.png'), mirror);
await writeArtifact(join(root, 'output', 'grayscale.png'), gray);
await writeArtifact(
  join(root, 'output', 'thumbnail.png'),
  await sharp(render.png).resize(280, 210).png().toBuffer(),
);
const sheet = createCanvas(1400, 425),
  ctx = sheet.getContext('2d');
ctx.fillStyle = '#171d1b';
ctx.fillRect(0, 0, 1400, 425);
ctx.font = '16px Rtistree-inter';
for (let i = 0; i < 3; i++) {
  ctx.drawImage(
    await loadImage(await readFile(join(root, 'output', `paint-${i}.png`))),
    i * 466,
    38,
    466,
    350,
  );
  ctx.fillStyle = '#d4d9cc';
  ctx.fillText(
    [
      'Initial: regular scales, cable-like fire',
      'Revision 1: smaller eye, turbulent fire',
      'Revision 2: irregular scales, cheek structure',
    ][i],
    i * 466 + 12,
    27,
  );
}
ctx.fillStyle = '#d4d9cc';
ctx.fillText('All three remain below the supplied quality reference.', 12, 412);
await writeArtifact(join(root, 'output', 'revisions.png'), sheet.toBuffer('image/png'));
let status;
try {
  status = await production(project, { action: 'status', session: 'head-study' });
} catch (error) {
  if (error.message !== 'Unknown production session') throw error;
  await production(project, {
    action: 'plan',
    plan: {
      id: 'head-study',
      brief:
        'Focused experiment: an original 2D dragon head illuminated by green fire. Compare with the user-supplied oil-style dragon reference. No image generation, image inputs or 3D.',
      references: [
        {
          id: 'user-quality-reference',
          source: 'User attachment: codex-clipboard-f0aa425f-033d-4528-9aac-7a9453667399.png',
          observation:
            'The reference combines a complex skull and overlapping horns with small sharp focal details, broken painterly edges and green illumination on mouth-facing surfaces.',
          application:
            'Use an open jaw, smaller eye and reflected green light as the focus of a new profile drawing. No reference pixels are used.',
        },
      ],
      stages: [
        {
          id: 'assessment',
          goal: 'Assess this experiment without declaring artistic success from technical validity.',
          required_reviewer: 'human',
          require_references: true,
          minimum_fidelity: 0.8,
          minimum_quality: 0.8,
          criteria: [
            { id: 'subject', description: 'A readable dragon head breathing green fire.' },
            {
              id: 'construction',
              description: 'Convincing skull, jaw hinge, neck transition and horn attachments.',
            },
            {
              id: 'lighting',
              description:
                'Fire illumination describes local form with coherent falloff and shadow.',
            },
            {
              id: 'painting',
              description:
                'Purposeful brushwork and varied edges comparable with the supplied reference.',
            },
          ],
        },
      ],
    },
  });
  const captured = await production(project, {
    action: 'capture',
    session: 'head-study',
    candidate: 'revision-2',
    expected_hash: sceneHash(scene),
    notes:
      'Assessment recorded after the focused drawing/lighting experiment. This is not a retrospectively passed foundation workflow. Two preceding colour revisions are preserved in output/.',
    crops: [[545, 325, 490, 430]],
  });
  const next = await production(project, { action: 'status', session: 'head-study' });
  const candidate = next.candidates.find((c) => c.id === 'revision-2');
  if (!candidate) throw new Error('Missing captured study');
  await production(project, {
    action: 'review',
    session: 'head-study',
    review: {
      candidate: 'revision-2',
      scene_hash: candidate.scene_hash,
      png_hash: candidate.png_hash,
      reviewer: 'Codex visual inspection',
      method: 'vision-agent',
      fidelity: 0.85,
      quality: 0.38,
      criteria: [
        {
          id: 'subject',
          pass: true,
          evidence: 'The profile, horns, open toothed jaw and green flame are legible.',
        },
        {
          id: 'construction',
          pass: false,
          evidence:
            'The cheek plates appear attached to a smooth head; the jaw hinge and horn roots remain schematic.',
        },
        {
          id: 'lighting',
          pass: false,
          evidence:
            'Green accents and a brighter jaw are visible, but much of the neck has broad generic shading and the fire lacks convincing interaction with the mouth.',
        },
        {
          id: 'painting',
          pass: false,
          evidence:
            'Directional marks soften edges, but repeated constructed forms and uniformly treated surfaces remain unlike the reference.',
        },
      ],
      strengths:
        'Smaller eye is less cartoon-like than the first render. Turbulent fire and irregular scales improve specific defects.',
      weaknesses:
        'Below the requested artistic standard. No independent or human pass. One composition; this experiment did not demonstrate the complete foundation-first process.',
      issues: [
        {
          criterion: 'construction',
          severity: 'blocking',
          observation: 'Facial armour and horn roots do not explain the anatomy convincingly.',
          correction:
            'Redraw the large masses and attachment transitions before further detailing.',
        },
        {
          criterion: 'lighting',
          severity: 'blocking',
          observation: 'Surface light is only partially related to the nearby flame.',
          correction: 'Study explicit lit and occluded planes at the mouth and cheek.',
        },
        {
          criterion: 'painting',
          severity: 'blocking',
          observation: 'Procedural surface treatment is too uniform to approach the reference.',
          correction:
            'Use selective, form-specific painting; more global texture is not a solution.',
        },
      ],
    },
  });
}
status = await production(project, { action: 'status', session: 'head-study' });
let selectionRejected = false;
try {
  await production(project, {
    action: 'select',
    session: 'head-study',
    candidate: 'revision-2',
    expected_hash: sceneHash(scene),
  });
} catch (error) {
  if (
    !error.message.startsWith(
      'Candidate has not passed technical, brief and stage quality gates:',
    ) ||
    !error.message.includes('Unresolved blocking issues')
  )
    throw error;
  selectionRejected = true;
}
const audit = {
  cold_identical: render.png.equals(cold.png),
  portable_identical: render.png.equals((await portable.render()).png),
  code_only_rebuild_identical: render.png.equals(replay.png),
  png_hash: sha256(render.png),
  image_inputs: 0,
  method:
    '2D paths, gradients, authored light fields, irregular cells, seeded brush marks and noise-based flame. No image generation or 3D.',
  artistic_status: 'below_target',
  stage_complete: status.complete,
  selection_rejected: selectionRejected,
  readiness: status.readiness,
};
await writeArtifact(join(root, 'output', 'audit.json'), JSON.stringify(audit, null, 2) + '\n');
// Freeze the WIP in the authoring root so clones do not require the ignored journal.
await writeArtifact(join(root, 'scene.json'), JSON.stringify(scene, null, 2) + '\n');
await project.rebase();
console.log(JSON.stringify(audit, null, 2));
if (
  !audit.cold_identical ||
  !audit.portable_identical ||
  !audit.code_only_rebuild_identical ||
  !selectionRejected ||
  status.complete
)
  process.exitCode = 1;
