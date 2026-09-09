// Exercise published examples directly from Markdown, without modifying recorded trials.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  readFile,
  writeFile,
  mkdtemp,
  mkdir,
  rm,
  symlink,
  readdir,
  access,
} from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { parse as yaml } from 'yaml';
import { Project, patchSchema, production, runProgram, buildPipeline } from '../dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(), 'rtistree-docs-'));
const cli = resolve(root, 'dist/cli.js');
const read = (name) => readFile(resolve(root, name), 'utf8');
const blocks = (markdown, language) =>
  [...markdown.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1]);
const run = (args, cwd = temporary) =>
  JSON.parse(execFileSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' }));
const reference = await read('docs/cli-reference.md');
const help = execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
for (const [, command] of help.matchAll(/^  rtistree ([a-z-]+)/gm)) {
  assert.ok(
    reference.replace(/rtistree@[^\s`]+/g, 'rtistree').includes(`rtistree ${command}`),
    `CLI reference omits ${command}`,
  );
}
async function markdownPaths(directory) {
  const paths = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await markdownPaths(path)));
    else if (entry.name.endsWith('.md')) paths.push(path);
  }
  return paths;
}
const paths = [
  ...(await markdownPaths('docs')),
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
];
for (const entry of await readdir(resolve(root, 'examples'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const path = `examples/${entry.name}/README.md`;
  if (
    await access(resolve(root, path)).then(
      () => true,
      () => false,
    )
  )
    paths.push(path);
}
const docs = await Promise.all(paths.map(async (name) => [name, await read(name)]));
for (const [name, markdown] of docs) {
  for (const body of blocks(markdown, 'json'))
    assert.doesNotThrow(() => JSON.parse(body), `${name}: invalid JSON block`);
  for (const body of blocks(markdown, 'yaml'))
    assert.doesNotThrow(() => yaml(body), `${name}: invalid YAML block`);
  for (const [, href] of markdown.matchAll(/\]\(([^\s)]+)\)/g)) {
    if (/^(?:[a-z]+:|#|\/)/i.test(href)) continue;
    await access(resolve(root, dirname(name), decodeURIComponent(href.split('#')[0])));
  }
}
try {
  const gettingStarted = await read('docs/getting-started.md');
  run(['init', 'my-art']);
  const art = join(temporary, 'my-art');
  const starterPatch = JSON.parse(blocks(gettingStarted, 'json')[0]);
  assert.deepEqual(starterPatch, JSON.parse(await readFile(join(art, 'refine.json'), 'utf8')));
  patchSchema.parse(starterPatch);
  const before = run(['render', 'scene.json', '-o', 'hello.png'], art);
  const project = await Project.open(join(art, 'scene.json'));
  assert.deepEqual(
    (await project.scene()).layers.map((l) => l.id),
    ['disc', 'title'],
  );
  assert.equal(
    (await project.scene()).layers.find((l) => l.id === 'title').content,
    'Hello, Rtistree.',
  );
  const edit = run(['apply', 'scene.json', 'refine.json'], art);
  assert.equal(edit.locality[0].outside_changed_pixels, 0);
  const after = run(['render', 'scene.json', '-o', 'brighter.png'], art);
  assert.notEqual(before.png_hash, after.png_hash);
  run(['undo', 'scene.json'], art);
  const restored = run(['render', 'scene.json', '-o', 'restored.png'], art);
  assert.equal(before.png_hash, restored.png_hash);
  run(['export', 'scene.json', '-o', 'portable/scene.json'], art);
  assert.equal(
    run(['render', 'portable/scene.json', '-o', 'portable.png'], art).png_hash,
    before.png_hash,
  );
  // Run the documented SDK code using this checkout, while package:check covers tarball installation.
  await mkdir(join(art, 'node_modules'));
  await symlink(root, join(art, 'node_modules/rtistree'), 'dir');
  await writeFile(join(art, 'sdk-example.mjs'), blocks(gettingStarted, 'js')[0]);
  execFileSync(process.execPath, ['sdk-example.mjs'], { cwd: art });
  assert.deepEqual(
    await readFile(join(art, 'sdk-output.png')),
    await readFile(join(art, 'hello.png')),
  );

  const studio = await read('docs/studio.md');
  run(['project', 'new', 'study', '--size', '100x100']);
  const study = join(temporary, 'study');
  await writeFile(join(study, 'programs/rubber.js'), blocks(studio, 'js')[0]);
  const request = JSON.parse(blocks(studio, 'json')[0]);
  await writeFile(join(study, 'paint.json'), JSON.stringify(request));
  run(['program', 'study', 'study/paint.json']);
  run(['render', 'study', '-o', 'study/output/rubber.png']);
  assert.equal(run(['program-replay', 'study', 'rubberPaint']).identical, true);
  assert.equal(run(['preflight', 'study', '--preset', 'screen']).status, 'pass');
  const unconfiguredPrint = spawnSync(
    process.execPath,
    [cli, 'preflight', 'study', '--preset', 'print'],
    { cwd: temporary, encoding: 'utf8' },
  );
  assert.equal(unconfiguredPrint.status, 2);
  assert.equal(JSON.parse(unconfiguredPrint.stdout).status, 'fail');

  const atelier = await read('docs/atelier.md');
  const painting = await Project.open(study);
  await writeFile(join(study, 'programs/ground.js'), 'return art.raster(() => [38, 62, 69, 255]);');
  const pipeline = JSON.parse(blocks(atelier, 'json')[0]);
  await buildPipeline(painting, pipeline);
  const plan = JSON.parse(blocks(atelier, 'json')[1]);
  await production(painting, plan);
  const rendered = await painting.render();
  await production(painting, {
    action: 'capture',
    session: 'landscape',
    candidate: 'warm-dawn',
    expected_hash: rendered.evidence.scene.hash,
    crops: [[100, 100, 200, 150]],
  });
  const status = await production(painting, { action: 'status', session: 'landscape' });
  assert.equal(status.readiness[0].eligible, false);
  // Native painting and named-guide examples should compile and execute as printed.
  await runProgram(painting, {
    code: blocks(atelier, 'js')[0],
    asset_id: 'techniqueExample',
    width: 400,
    height: 400,
    seed: 1,
    reason: 'Validate documented technique example',
  });
  const guideCode = blocks(await read('docs/agent-art-workflow.md'), 'js')[0];
  await runProgram(painting, {
    code: `const canvas = art.canvas(); const ctx = canvas.getContext('2d');\n${guideCode}\nreturn canvas;`,
    asset_id: 'guideExample',
    width: 400,
    height: 400,
    seed: 1,
    reason: 'Validate documented construction example',
  });
  console.log(
    'Documentation examples passed: syntax/links, starter/edit/undo/export/SDK, painting/replay, preflight, pipeline, production capture and construction guides.',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
