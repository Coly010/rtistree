#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { Project } from './project.js';
import { boundsSchema, sceneSchema } from './schema.js';
import { commandSchema } from './commands.js';
import { writeArtifact, writeRender } from './artifacts.js';
import { verificationHeatmap } from './verify.js';

const help = `Rtistree — deterministic graphics for agents

  graphics render <scene.yaml> [-o render.png] [--quality draft|preview|final]
  graphics render-region <scene.yaml> <x> <y> <width> <height> [-o region.png]
  graphics inspect <scene.yaml> [--layer <id>]
  graphics inspect-region <scene.yaml> <x> <y> <width> <height>
  graphics apply <scene.yaml> <patch.json>
  graphics undo <scene.yaml>
  graphics redo <scene.yaml>
  graphics history <scene.yaml>
  graphics verify <scene.yaml> [-o report.json] [--heatmap heatmap.png]
  graphics export <scene.yaml> -o <new-project/scene.json>
  graphics schema [--kind scene|command]
  graphics serve <scene.yaml>  (MCP over stdio)

All structured output is JSON. Verification failure exits 2; invalid input exits 1.
Raster scopes, masks and palette tiles use canvas coordinates. See docs/scene-format.md.
`;
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      quality: { type: 'string' },
      layer: { type: 'string' },
      heatmap: { type: 'string' },
      kind: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, file, ...args] = positionals;
  if (values.help || !command) {
    process.stdout.write(help);
    return;
  }
  const print = (value: unknown) => process.stdout.write(JSON.stringify(value, null, 2) + '\n');
  if (command === 'schema') {
    if (values.kind && !['scene', 'command'].includes(values.kind))
      throw new Error('Unknown schema kind');
    print(z.toJSONSchema(values.kind === 'command' ? commandSchema : sceneSchema));
    return;
  }
  if (!file) throw new Error('A scene file is required');
  const project = await Project.open(file);
  const region = () => {
    if (args.length !== 4) throw new Error('Expected x y width height');
    return boundsSchema.parse(args.map(Number));
  };
  switch (command) {
    case 'render':
    case 'render-region': {
      const quality = values.quality ?? 'final';
      if (!['draft', 'preview', 'final'].includes(quality))
        throw new Error('Unknown render quality');
      const result = await project.render({
        quality: quality as 'final',
        region: command === 'render-region' ? region() : undefined,
        layer: values.layer,
      });
      print(
        await writeRender(
          resolve(
            values.output ??
              join(project.root, 'renders', command === 'render' ? 'render.png' : 'region.png'),
          ),
          result,
        ),
      );
      break;
    }
    case 'inspect':
      print(values.layer ? await project.inspectLayer(values.layer) : await project.inspect());
      break;
    case 'inspect-region': {
      const { render, ...inspection } = await project.inspectRegion(region());
      const artifact = await writeRender(
        resolve(values.output ?? join(project.root, 'renders', 'inspection.png')),
        render,
      );
      print({ ...inspection, artifact });
      break;
    }
    case 'apply': {
      if (args.length !== 1) throw new Error('Expected a patch JSON file');
      const entry = await project.apply(JSON.parse(await readFile(args[0]!, 'utf8')));
      print({ sequence: entry.sequence, hash: entry.after_hash, locality: entry.locality });
      break;
    }
    case 'undo':
    case 'redo': {
      const entry = await project[command]();
      print({ sequence: entry.sequence, hash: entry.after_hash });
      break;
    }
    case 'history':
      print((await project.history()).map(({ after, ...entry }) => entry));
      break;
    case 'verify': {
      const report = await project.verify();
      if (values.output)
        await writeArtifact(resolve(values.output), JSON.stringify(report, null, 2) + '\n');
      if (values.heatmap)
        await writeArtifact(
          resolve(values.heatmap),
          await verificationHeatmap(await project.scene(), report),
        );
      print(report);
      if (report.status === 'fail') process.exitCode = 2;
      break;
    }
    case 'export':
      if (!values.output) throw new Error('export requires --output');
      await project.exportScene(resolve(values.output));
      print({ scene: resolve(values.output) });
      break;
    case 'serve': {
      const { serve } = await import('./mcp.js');
      await serve(project);
      break;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
main().catch((error) => {
  process.stderr.write(
    JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) + '\n',
  );
  process.exitCode = 1;
});
