import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from '../src/mcp.js';
import { Project } from '../src/project.js';
import {
  artDirectionGuide,
  artDirectionResourceUri,
  rtistreeAgentInstructions,
  sceneHash,
} from '../src/index.js';
import { production, productionPlanSchema } from '../src/production-workflow.js';

const exec = promisify(execFile),
  cli = resolve('src/cli.ts');
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'rtistree-interfaces-')),
    file = join(dir, 'scene.json');
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      canvas: { width: 32, height: 32 },
      layers: [
        { id: 'copy', type: 'text', bounds: [2, 2, 28, 28], content: 'A', style: { size: 16 } },
      ],
    }),
  );
  return { dir, file };
}
test('CLI emits valid JSON, exports PNG and reports failures through exit codes', async () => {
  const { dir, file } = await fixture();
  const inspect = await exec(process.execPath, ['--import', 'tsx', cli, 'inspect', file]);
  assert.equal(JSON.parse(inspect.stdout).layers[0].id, 'copy');
  const output = join(dir, 'out.png');
  await exec(process.execPath, ['--import', 'tsx', cli, 'render', file, '-o', output]);
  assert.equal((await readFile(output)).subarray(1, 4).toString(), 'PNG');
  const patch = join(dir, 'patch.json');
  await writeFile(
    patch,
    JSON.stringify({
      reason: 'Make overflow detectable',
      commands: [{ type: 'setText', target: 'copy', content: 'This cannot fit in the tiny box' }],
    }),
  );
  await exec(process.execPath, ['--import', 'tsx', cli, 'apply', file, patch]);
  await assert.rejects(
    () => exec(process.execPath, ['--import', 'tsx', cli, 'verify', file]),
    (error: any) => error.code === 2 && JSON.parse(error.stdout).status === 'fail',
  );
  await assert.rejects(
    () => exec(process.execPath, ['--import', 'tsx', cli, 'nonsense', file]),
    (error: any) => error.code === 1 && JSON.parse(error.stderr).error.includes('Unknown command'),
  );
});
test('MCP discovery, typed edits, PNG crops and verification work through a client', async () => {
  const { file } = await fixture(),
    server = createServer(await Project.open(file)),
    client = new Client({ name: 'test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    // A fresh client receives the core workflow before requesting tools or studioHelp.
    assert.equal(client.getInstructions(), rtistreeAgentInstructions);
    assert.match(
      client.getInstructions()!,
      /technical correctness, functional checks and visual acceptance separately/,
    );
    const resources = await client.listResources();
    assert.ok(resources.resources.some((resource) => resource.uri === artDirectionResourceUri));
    const guide = await client.readResource({ uri: artDirectionResourceUri });
    assert.equal(guide.contents[0]!.mimeType, 'application/json');
    assert.ok('text' in guide.contents[0]!);
    assert.deepEqual(JSON.parse(guide.contents[0]!.text as string), artDirectionGuide);
    const studioHelp = await client.callTool({ name: 'studioHelp', arguments: {} });
    assert.deepEqual(
      JSON.parse((studioHelp.content as any[])[0].text).art_direction,
      artDirectionGuide,
    );
    const list = await client.listTools();
    assert.ok(list.tools.some((tool) => tool.name === 'apply'));
    assert.equal(list.tools.length, 24);
    assert.ok(JSON.stringify(list).length < 100_000, 'Discovery must share repeated schemas');
    assert.ok(list.tools.find((tool) => tool.name === 'apply')!.inputSchema.definitions);
    const result = await client.callTool({ name: 'inspectScene', arguments: {} });
    const inspection = JSON.parse((result.content as any[])[0].text);
    const edit = await client.callTool({
      name: 'apply',
      arguments: {
        patch: {
          expected_hash: inspection.hash,
          reason: 'Use larger copy',
          commands: [{ type: 'setText', target: 'copy', content: 'B' }],
        },
      },
    });
    assert.ok(!edit.isError);
    const crop = await client.callTool({
      name: 'renderRegion',
      arguments: { bounds: [0, 0, 16, 16] },
    });
    assert.ok(
      (crop.content as any[]).some(
        (item) => item.type === 'image' && item.mimeType === 'image/png',
      ),
    );
    const stale = await client.callTool({
      name: 'apply',
      arguments: {
        patch: {
          expected_hash: inspection.hash,
          reason: 'Stale edit',
          commands: [{ type: 'setText', target: 'copy', content: 'C' }],
        },
      },
    });
    assert.equal(stale.isError, true);
    const painted = await client.callTool({
      name: 'runProgram',
      arguments: {
        program: {
          code: 'return art.raster((x,y)=>[x*8,y*8,100,255]);',
          asset_id: 'painted',
          target: 'painted',
          width: 16,
          height: 16,
          reason: 'Exercise inline studio authoring through MCP',
        },
      },
    });
    assert.ok(!painted.isError, JSON.stringify(painted));
    const replayed = await client.callTool({
      name: 'replayProgram',
      arguments: { asset: 'painted' },
    });
    assert.equal(JSON.parse((replayed.content as any[])[0].text).identical, true);
  } finally {
    await client.close();
    await server.close();
  }
});
test('art guide works without a project and its starter plan is accepted by the production API', async () => {
  const result = await exec(process.execPath, ['--import', 'tsx', cli, 'art-guide']);
  assert.deepEqual(JSON.parse(result.stdout), artDirectionGuide);
  const plan = productionPlanSchema.parse(artDirectionGuide.starter_plan);
  assert.equal(plan.stages[0]!.minimum_alternatives, 3);
  assert.equal(plan.stages[0]!.require_references, true);
  assert.ok(
    plan.stages.every((stage) => stage.required_reviewer !== 'human'),
    'The guide must not invent a mandatory human approval for every caller',
  );
  const { file } = await fixture(),
    project = await Project.open(file);
  await production(project, { action: 'plan', plan });
  const hash = sceneHash(await project.scene());
  await production(project, {
    action: 'capture',
    session: plan.id,
    candidate: 'sample',
    expected_hash: hash,
  });
  await assert.rejects(
    () =>
      production(project, {
        action: 'select',
        session: plan.id,
        candidate: 'sample',
        expected_hash: hash,
      }),
    /Visual review required/,
  );
});
test('MCP stdio server starts with protocol-only stdout and closes cleanly', async () => {
  const { file } = await fixture();
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', cli, 'serve', file],
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const response = await client.listTools();
    assert.equal(response.tools.length, 24);
  } finally {
    await client.close();
  }
});

test('CLI init creates a runnable starter and refuses existing paths without changing them', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'rtistree-starter-'));
  const directory = join(parent, 'art with spaces');
  const created = await exec(process.execPath, ['--import', 'tsx', cli, 'init', directory]);
  assert.equal(JSON.parse(created.stdout).directory, directory);
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const engine = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
  assert.equal(manifest.dependencies.rtistree, engine.version);
  assert.equal(manifest.scripts.render, 'rtistree render scene.json -o hello.png');
  const project = await Project.open(join(directory, 'scene.json'));
  assert.equal((await project.render()).width, 640);
  const scene = await readFile(join(directory, 'scene.json'));
  await assert.rejects(
    exec(process.execPath, ['--import', 'tsx', cli, 'init', directory]),
    (error: any) => error.code === 1 && /Destination already exists/.test(error.stderr),
  );
  assert.deepEqual(await readFile(join(directory, 'scene.json')), scene);
  const occupied = join(parent, 'existing-file');
  await writeFile(occupied, 'keep me');
  await assert.rejects(exec(process.execPath, ['--import', 'tsx', cli, 'init', occupied]));
  assert.equal(await readFile(occupied, 'utf8'), 'keep me');
  await assert.rejects(exec(process.execPath, ['--import', 'tsx', cli, 'init']));
  await assert.rejects(
    exec(process.execPath, ['--import', 'tsx', cli, 'init', join(parent, 'unused'), 'extra']),
  );
});
