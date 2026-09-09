import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

/** Create a starter in a new directory. Existing paths are never overwritten. */
export async function createStarter(directory: string) {
  const destination = resolve(directory);
  const names = ['scene.json', 'refine.json', 'render.mjs', 'README.md'];
  const templates = await Promise.all(
    names.map(
      async (name) =>
        [name, await readFile(new URL(`../examples/hello/${name}`, import.meta.url))] as const,
    ),
  );
  const { version } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  const manifest = {
    name: 'rtistree-artwork',
    private: true,
    type: 'module',
    scripts: { render: 'rtistree render scene.json -o hello.png', 'render:sdk': 'node render.mjs' },
    dependencies: { rtistree: version },
  };
  // mkdir is exclusive: reject files, directories and symlinks, even empty directories.
  try {
    await mkdir(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new Error(`Destination already exists: ${destination}. Choose a new directory.`);
    throw error;
  }
  for (const [name, contents] of templates)
    await writeFile(join(destination, name), contents, { flag: 'wx' });
  await writeFile(join(destination, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', {
    flag: 'wx',
  });
  await writeFile(
    join(destination, '.gitignore'),
    'node_modules/\nhistory/\n*.png\n*.evidence.json\n',
    { flag: 'wx' },
  );
  return {
    directory: destination,
    files: [...names, 'package.json', '.gitignore'],
    next: ['Change into the created directory', 'npm install', 'npm run render'],
    output: 'hello.png',
  };
}
