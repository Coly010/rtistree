import { z } from 'zod';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import {
  exportPresetSchema,
  documentSchema,
  documentGeometry,
  lengthMm,
  type PhysicalDocument,
} from './document.js';
import { localAssetPath } from './assets.js';
export const projectConfigSchema = z.strictObject({
  version: z.literal(1),
  scene: z.string().default('scene.yaml'),
  output_dir: z.string().default('output'),
  presets: z.record(z.string(), exportPresetSchema).default({}),
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export function projectPath(root: string, value: string) {
  const path = resolve(root, value),
    rel = relative(root, path);
  if (isAbsolute(value) || rel === '..' || rel.startsWith(`..${sep}`))
    throw new Error('Project paths must stay inside the project directory');
  return path;
}
export async function resolveProject(input: string) {
  let path = await realpath(resolve(input));
  if ((await stat(path)).isDirectory()) path = resolve(path, 'rtistree.yaml');
  if (!path.endsWith('/rtistree.yaml')) {
    try {
      const manifest = resolve(dirname(path), 'rtistree.yaml'),
        config = projectConfigSchema.parse(parse(await readFile(manifest, 'utf8')));
      if ((await localAssetPath(dirname(path), config.scene)) === path)
        return resolveProject(manifest);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    return { file: path };
  }
  const config = projectConfigSchema.parse(parse(await readFile(path, 'utf8'))),
    root = dirname(path);
  let output = projectPath(root, config.output_dir);
  while (true) {
    try {
      const actual = await realpath(output);
      projectPath(root, relative(root, actual));
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      const parent = dirname(output);
      if (parent === output) throw e;
      output = parent;
    }
  }
  const file = await localAssetPath(root, config.scene);
  if (dirname(file) !== root) throw new Error('The scene entry point must be in the project root');
  return { file, config, configFile: path };
}
export async function createProject(
  directory: string,
  options: {
    size?: string;
    orientation?: string;
    ppi?: number;
    bleed?: string;
    outputDir?: string;
  } = {},
) {
  const sizes: Record<string, [number, number]> = {
    A3: [297, 420],
    A4: [210, 297],
    A5: [148, 210],
    Letter: [215.9, 279.4],
  };
  let size = sizes[options.size ?? 'A4'];
  if (!size) {
    const pair = (options.size ?? '').split('x');
    if (pair.length !== 2) throw new Error('Use A3, A4, A5, Letter, or WIDTHxHEIGHT in mm');
    size = pair.map(lengthMm) as [number, number];
  }
  if (options.orientation && !['portrait', 'landscape'].includes(options.orientation))
    throw new Error('Unknown orientation');
  if (options.orientation === 'portrait') size = [Math.min(...size), Math.max(...size)];
  if (options.orientation === 'landscape') size = [Math.max(...size), Math.min(...size)];
  const document: PhysicalDocument = documentSchema.parse({
    width: size[0],
    height: size[1],
    ppi: options.ppi ?? 300,
    bleed: lengthMm(options.bleed ?? '3mm'),
    safe_margin: 5,
  });
  documentGeometry(document);
  const root = resolve(directory),
    output = options.outputDir ?? 'output';
  const outputRelative = relative(root, projectPath(root, output));
  if (
    !outputRelative ||
    [
      'assets',
      'layers',
      'fonts',
      'profiles',
      'history',
      'schemas',
      'programs',
      'recipes',
      'raster',
      'studio',
    ].includes(outputRelative.split(sep)[0]!)
  )
    throw new Error('Choose a dedicated output directory');
  // Exclusive mkdir fails before any write if the destination already exists.
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root);
  for (const dir of [
    'assets',
    'fonts',
    'profiles',
    'layers',
    'history',
    'schemas',
    'programs',
    'recipes',
    'studio',
    output,
  ])
    await mkdir(projectPath(root, dir), { recursive: true });
  const config = projectConfigSchema.parse({
    version: 1,
    scene: 'scene.yaml',
    output_dir: output,
    presets: {
      screen: { format: 'png', ppi: 96 },
      print: { format: 'pdf', colour_space: 'cmyk', minimum_ppi: 150 },
    },
  });
  const canvas = {
    width: Math.round(document.width * 4),
    height: Math.round(document.height * 4),
    background: '#f3efe6',
  };
  const files: Record<string, string> = {
    'rtistree.yaml':
      '# yaml-language-server: $schema=./schemas/project.schema.json\n' + stringify(config),
    'scene.yaml':
      '# yaml-language-server: $schema=./schemas/authoring.schema.json\n' +
      stringify({
        version: 1,
        canvas,
        document,
        include: ['layers/background.yaml', 'layers/content.yaml'],
      }),
    'layers/background.yaml': stringify({
      layers: [
        { id: 'background', type: 'procedural', generator: { type: 'solid', colour: '#f3efe6' } },
      ],
    }),
    'layers/content.yaml': stringify({
      layers: [
        {
          id: 'title',
          type: 'text',
          bounds: [
            canvas.width * 0.1,
            canvas.height * 0.15,
            canvas.width * 0.8,
            canvas.height * 0.5,
          ],
          content: 'A new canvas.',
          style: { font: 'display', size: Math.min(64, canvas.width / 10), colour: '#243d38' },
        },
      ],
    }),
    '.gitignore': `${output}/\nhistory/*.lock\n`,
    'README.md':
      '# Your Rtistree project\n\nEdit scene.yaml and layers/. Assets, fonts and ICC profiles stay local. Read graphics studio-help for the foundation-first art-direction protocol. Author 2D painting code in programs/; use graphics pipeline . pipeline.json and graphics production . request.json for staged art. Cache and candidate records live in studio/.\n\nRun graphics render . --preset screen, graphics export . --format pdf --preset screen, or graphics preflight . --preset print.\n\nBefore CMYK print export, copy your printer/paper ICC profile to profiles/ and set presets.print.profile plus profile_hash in rtistree.yaml. Print preflight rejects a missing profile. Existing scene-file commands remain available.\n',
  };
  for (const name of [
    'project',
    'authoring',
    'fragment',
    'program',
    'pipeline',
    'construction',
    'production',
    'raster-read',
    'raster-write',
  ])
    files[`schemas/${name}.schema.json`] = await readFile(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', 'schemas', `${name}.schema.json`),
      'utf8',
    );
  for (const [name, content] of Object.entries(files))
    await writeFile(resolve(root, name), content, { flag: 'wx' });
  return {
    project: root,
    manifest: resolve(root, 'rtistree.yaml'),
    scene: resolve(root, 'scene.yaml'),
    output: resolve(root, output),
    document,
  };
}
