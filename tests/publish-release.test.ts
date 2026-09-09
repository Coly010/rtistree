import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { publishRelease } from '../scripts/publish-release.mjs';

test('release publishing checks identity and registry integrity before publishing', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'rtistree-publish-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ name: 'rtistree', version: '0.5.2' }),
  );
  const bytes = Buffer.from('checked tarball fixture');
  const tarball = join(directory, 'rtistree-0.5.2.tgz');
  await writeFile(tarball, bytes);
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  let published = 0;
  const options = {
    directory,
    artifactDirectory: directory,
    tag: 'v0.5.2',
    publish: async (path: string) => {
      assert.equal(path, tarball);
      published++;
    },
  };
  const registry =
    (status: number, body = {}) =>
    async (url: string) => {
      assert.equal(url, 'https://registry.npmjs.org/rtistree/0.5.2');
      return new Response(JSON.stringify(body), { status });
    };
  await assert.rejects(publishRelease({ ...options, tag: 'v0.5.1' }), /tag must match/);
  await assert.rejects(publishRelease({ ...options, registryFetch: registry(503) }), /HTTP 503/);
  await assert.rejects(
    publishRelease({
      ...options,
      registryFetch: async () => {
        throw new Error('network unavailable');
      },
    }),
    /network unavailable/,
  );
  await assert.rejects(
    publishRelease({
      ...options,
      registryFetch: registry(200, { dist: { integrity: 'different' } }),
    }),
    /different bytes/,
  );
  await publishRelease({ ...options, registryFetch: registry(200, { dist: { integrity } }) });
  assert.equal(published, 0);
  await publishRelease({ ...options, registryFetch: registry(404) });
  assert.equal(published, 1);
});
