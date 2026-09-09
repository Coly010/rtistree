import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = await mkdtemp(join(tmpdir(), 'rtistree-package-'));
const artifactDir = resolve(process.env.RTISTREE_PACKAGE_DIR ?? work);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function run(command, args, cwd = work) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache ?? join(tmpdir(), 'rtistree-npm-cache'),
    },
  });
}
try {
  const [pack] = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', artifactDir], root));
  const files = new Set(pack.files.map((file) => file.path));
  for (const required of [
    'dist/cli.js',
    'dist/index.d.ts',
    'dist/art-direction.js',
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'licenses/Inter-OFL.txt',
    'examples/hello/scene.json',
    'docs/getting-started.md',
  ])
    assert.ok(files.has(required), `Missing ${required}`);
  assert.ok(
    ![...files].some((path) => path.startsWith('website/') || /(?:^|\/)\.env/.test(path)),
    'Unexpected website or private files in package',
  );
  await writeFile(join(work, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run(npm, [
    'install',
    '--no-audit',
    '--no-fund',
    '--fetch-retries=0',
    '--fetch-timeout=30000',
    join(artifactDir, pack.filename),
  ]);
  const installed = join(work, 'node_modules/rtistree');
  const cli = join(
    work,
    'node_modules/.bin',
    process.platform === 'win32' ? 'rtistree.cmd' : 'rtistree',
  );
  const graphics = (...args) => run(cli, args);
  assert.match(graphics('--help'), /rtistree init/);
  const legacy = join(
    work,
    'node_modules/.bin',
    process.platform === 'win32' ? 'graphics.cmd' : 'graphics',
  );
  assert.equal(run(legacy, ['--help']), graphics('--help'), 'Legacy alias must still work');
  run(npm, ['exec', '--offline', '--', 'rtistree', 'init', 'hello']);
  const starterManifest = JSON.parse(await readFile(join(work, 'hello/package.json'), 'utf8'));
  assert.equal(starterManifest.dependencies.rtistree, pack.version);
  // Install this unpublished tarball in the generated project; after publication, npm resolves the pinned version.
  run(
    npm,
    ['install', '--no-audit', '--no-fund', join(artifactDir, pack.filename)],
    join(work, 'hello'),
  );
  run(npm, ['run', 'render'], join(work, 'hello'));
  const guide = JSON.parse(graphics('art-guide'));
  assert.equal(guide.version, 'foundation-first/2');
  graphics('render', 'hello/scene.json', '-o', 'before.png');
  graphics('apply', 'hello/scene.json', 'hello/refine.json');
  graphics('render', 'hello/scene.json', '-o', 'after.png');
  const before = await readFile(join(work, 'before.png'));
  const after = await readFile(join(work, 'after.png'));
  assert.deepEqual(
    before,
    await readFile(join(work, 'hello/hello.png')),
    'Generated npm render script must produce the same image',
  );
  assert.notDeepEqual(before, after, 'Documented edit must change the image');
  graphics('undo', 'hello/scene.json');
  graphics('render', 'hello/scene.json', '-o', 'restored.png');
  assert.deepEqual(
    before,
    await readFile(join(work, 'restored.png')),
    'Undo must restore exact PNG',
  );
  graphics('export', 'hello/scene.json', '-o', 'portable/scene.json');
  graphics('render', 'portable/scene.json', '-o', 'portable.png');
  assert.deepEqual(
    before,
    await readFile(join(work, 'portable.png')),
    'Portable export must reproduce',
  );
  run(process.execPath, ['hello/render.mjs']);
  assert.deepEqual(
    before,
    await readFile(join(work, 'hello/sdk-output.png')),
    'SDK must render the same image',
  );
  await writeFile(
    join(work, 'check-mcp.mjs'),
    `
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const client = new Client({ name: 'package-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [${JSON.stringify(join(installed, 'dist/cli.js'))}, 'serve', ${JSON.stringify(join(work, 'hello/scene.json'))}] });
try {
  await client.connect(transport);
  assert.ok(client.getInstructions()?.includes('art'));
  const guide = await client.readResource({ uri: 'rtistree://guides/art-direction' });
  assert.ok(guide.contents.length > 0);
  const tools = await client.listTools();
  assert.ok(tools.tools.some(t => t.name === 'studioHelp'));
} finally { await client.close(); }
`,
  );
  run(process.execPath, ['check-mcp.mjs']);
  console.log(
    JSON.stringify(
      {
        package: pack.filename,
        files: pack.entryCount,
        bytes: pack.size,
        checks: [
          'installed executable and compatibility alias',
          'init and generated project scripts',
          'art guide',
          'render',
          'edit',
          'undo',
          'portable export',
          'SDK',
          'MCP onboarding',
        ],
        artifact: process.env.RTISTREE_PACKAGE_DIR ? join(artifactDir, pack.filename) : 'temporary',
      },
      null,
      2,
    ),
  );
} finally {
  await rm(work, { recursive: true, force: true });
}
