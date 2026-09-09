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
