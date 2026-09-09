import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function publishRelease({
  registryFetch = fetch,
  publish = (tarball) =>
    execFileSync('npm', ['publish', tarball, '--access', 'public', '--provenance'], {
      stdio: 'inherit',
    }),
  directory = '.',
  artifactDirectory = process.env.RUNNER_TEMP,
  tag = process.env.RELEASE_TAG,
} = {}) {
  const { name, version } = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (name !== 'rtistree' || tag !== `v${version}`) {
    throw new Error('Release tag must match the rtistree package version');
  }
  if (!artifactDirectory) throw new Error('RUNNER_TEMP is required');
  const tarball = join(artifactDirectory, `rtistree-${version}.tgz`);
  const integrity = `sha512-${createHash('sha512')
    .update(await readFile(tarball))
    .digest('base64')}`;
  const response = await registryFetch(`https://registry.npmjs.org/rtistree/${version}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (response.ok) {
    const published = await response.json();
    if (published.dist?.integrity !== integrity) {
      throw new Error(
        `rtistree@${version} already exists with different bytes; do not overwrite it`,
      );
    }
    console.log(
      `rtistree@${version} is already published with the checked integrity; nothing to do`,
    );
  } else if (response.status === 404) {
    await publish(tarball);
  } else {
    throw new Error(
      `npm registry check failed: HTTP ${response.status}; publication was not attempted`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await publishRelease();
}
