#!/usr/bin/env node
import { buildPipeline } from './pipeline.js';
import { production } from './production-workflow.js';
import { importSvg } from './svg.js';
import { runProgram, replayRecipe } from './program.js';
import { readRasterRegion, writeRasterRegion } from './raster-edit.js';
import { studioReference } from './studio-reference.js';
import { artDirectionGuide } from './art-direction.js';
import { createProject } from './project-config.js';
import { exportArtwork, preflight, softProof } from './export.js';
import { exportPresetSchema } from './document.js';
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { z } from 'zod';
import { BenchmarkSession, briefSchema } from './benchmark.js';
import { Project } from './project.js';
import { boundsSchema, sceneSchema } from './schema.js';
import { commandSchema } from './commands.js';
import { writeArtifact, writeRender } from './artifacts.js';
import { verificationHeatmap } from './verify.js';

const help = `Rtistree — deterministic graphics for agents

  graphics pipeline <project> <pipeline.json>
  graphics production <project> <request.json>
  graphics studio-help
  graphics art-guide  (read before creating artwork; includes trial lessons and a plan template)
  graphics program <project> <program.json>  (execute trusted local JavaScript and bake a raster asset)
  graphics program-replay <project> <asset-id>
  graphics raster-read <project> <request.json>
  graphics raster-write <project> <request.json>
  graphics import-svg <input.svg> -o <scene.json>
  graphics project new <directory> [--size A3] [--orientation landscape] [--ppi 300] [--bleed 3mm] [--output-dir output]
  graphics proof <project-or-scene> --preset print [-o proof.png]
  graphics preflight <project-or-scene> [--preset print]
  graphics export <project-or-scene> --format png|jpeg|tiff|pdf|svg|project [--preset print] [-o file]
  graphics render <scene.yaml> [-o render.png] [--quality draft|preview|final]
  graphics render-region <scene.yaml> <x> <y> <width> <height> [-o region.png]
  graphics inspect <scene.yaml> [--layer <id>]
  graphics inspect-region <scene.yaml> <x> <y> <width> <height>
  graphics apply <scene.yaml> <patch.json>
  graphics undo <scene.yaml>
  graphics redo <scene.yaml>
  graphics history <scene.yaml>
  graphics rebase <scene.yaml>
  graphics compact <scene.yaml>
  graphics critique <scene.yaml> <critique.json>
  graphics benchmark <scene.yaml> <brief.json> <checkpoint-label|finish>
  graphics verify <scene.yaml> [-o report.json] [--heatmap heatmap.png]
  graphics export <scene.yaml> -o <new-project/scene.json>
  graphics schema [--kind scene|command]
  graphics serve <scene.yaml>  (MCP over stdio)

Before creating artwork, read graphics art-guide. Technical verification does not rate artistic quality.
All structured output is JSON. Verification failure exits 2; invalid input exits 1.
Raster scopes, masks and palette tiles default to canvas coordinates; space: layer attaches them to objects. See docs/scene-format.md.
`;
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' },
      size: { type: 'string' },
      orientation: { type: 'string' },
      ppi: { type: 'string' },
      bleed: { type: 'string' },
      'output-dir': { type: 'string' },
      preset: { type: 'string' },
      format: { type: 'string' },
      profile: { type: 'string' },
      'colour-space': { type: 'string' },
      'crop-marks': { type: 'boolean' },
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
  if (command === 'art-guide') {
    print(artDirectionGuide);
    return;
  }
  if (command === 'studio-help') {
    print(studioReference);
    return;
  }
  if (command === 'schema') {
    if (values.kind && !['scene', 'command'].includes(values.kind))
      throw new Error('Unknown schema kind');
    print(
      z.toJSONSchema(values.kind === 'command' ? commandSchema : sceneSchema, { reused: 'ref' }),
    );
    return;
  }
  if (command === 'import-svg') {
    if (!file || !values.output)
      throw new Error('import-svg requires an SVG file and --output scene.json');
    const scene = importSvg(await readFile(file, 'utf8'));
    await writeArtifact(resolve(values.output), JSON.stringify(scene, null, 2) + '\n');
    print({ scene: resolve(values.output) });
    return;
  }
  if (command === 'project') {
    if (file !== 'new' || args.length !== 1) throw new Error('Expected project new <directory>');
    print(
      await createProject(args[0]!, {
        size: values.size,
        orientation: values.orientation,
        ppi: values.ppi ? Number(values.ppi) : undefined,
        bleed: values.bleed,
        outputDir: values['output-dir'],
      }),
    );
    return;
  }
  if (!file) throw new Error('A scene file or project directory is required');
  const project = await Project.open(file);
  if (values.preset && !project.config?.presets[values.preset])
    throw new Error('Unknown project preset');
  const inferredFormat = (
    {
      '.jpg': 'jpeg',
      '.jpeg': 'jpeg',
      '.tif': 'tiff',
      '.tiff': 'tiff',
      '.pdf': 'pdf',
      '.png': 'png',
      '.svg': 'svg',
    } as Record<string, string>
  )[extname(values.output ?? '').toLowerCase()];
  const preset = exportPresetSchema.parse({
    ...project.config?.presets[values.preset ?? ''],
    ...(inferredFormat ? { format: inferredFormat } : {}),
    ...(values.format && values.format !== 'project' ? { format: values.format } : {}),
    ...(values.ppi ? { ppi: Number(values.ppi) } : {}),
    ...(values.profile ? { profile: values.profile, colour_space: 'cmyk' } : {}),
    ...(values['colour-space'] ? { colour_space: values['colour-space'] } : {}),
    ...(values['crop-marks'] ? { crop_marks: true } : {}),
  });
  const region = () => {
    if (args.length !== 4) throw new Error('Expected x y width height');
    return boundsSchema.parse(args.map(Number));
  };
  switch (command) {
    case 'pipeline':
    case 'production':
    case 'program':
    case 'raster-read':
    case 'raster-write': {
      if (args.length !== 1) throw new Error('Expected a request JSON file');
      const request = JSON.parse(await readFile(args[0]!, 'utf8'));
      if (command === 'pipeline') print(await buildPipeline(project, request));
      else if (command === 'production') print(await production(project, request));
      else if (command === 'program') print(await runProgram(project, request));
      else if (command === 'raster-write') print(await writeRasterRegion(project, request));
      else {
        const { render, ...result } = await readRasterRegion(project, request);
        print(result);
      }
      break;
    }
    case 'program-replay': {
      const asset = (await project.scene()).assets[args[0] ?? ''];
      if (args.length !== 1 || !asset?.recipe)
        throw new Error('Expected an asset with a program recipe');
      const { png, ...result } = await replayRecipe(project.root, asset.recipe);
      print(result);
      if (!result.identical) process.exitCode = 2;
      break;
    }
    case 'render':
    case 'render-region': {
      if (
        command === 'render' &&
        (values.preset ||
          values.format ||
          values.ppi ||
          (inferredFormat && inferredFormat !== 'png'))
      ) {
        const screen = {
          ...preset,
          format: values.format ?? inferredFormat ?? (values.preset ? preset.format : 'png'),
        };
        print(
          await exportArtwork(
            project,
            resolve(values.output ?? join(project.outputDirectory, `render.${screen.format}`)),
            screen,
          ),
        );
        break;
      }
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
              join(project.outputDirectory, command === 'render' ? 'render.png' : 'region.png'),
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
        resolve(values.output ?? join(project.outputDirectory, 'inspection.png')),
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
    case 'benchmark': {
      if (args.length !== 2) throw new Error('Expected brief JSON and checkpoint label or finish');
      const brief = briefSchema.parse(JSON.parse(await readFile(args[0]!, 'utf8'))),
        session = new BenchmarkSession(project, brief, 'Interactive agent using CLI');
      print(args[1] === 'finish' ? await session.finish() : await session.checkpoint(args[1]!));
      break;
    }
    case 'rebase': {
      const entry = await project.rebase();
      print({ sequence: entry.sequence, hash: entry.after_hash });
      break;
    }
    case 'compact':
      print(await project.compactHistory());
      break;
    case 'critique':
      if (args.length !== 1) throw new Error('Expected critique JSON');
      print(await project.recordCritique(JSON.parse(await readFile(args[0]!, 'utf8'))));
      break;
    case 'history':
      print((await project.history()).map(({ after, ...entry }) => entry));
      break;
    case 'verify': {
      const report = await project.verify();
      if (values.output || project.config)
        await writeArtifact(
          resolve(values.output ?? join(project.outputDirectory, 'verification.json')),
          JSON.stringify(report, null, 2) + '\n',
        );
      if (values.heatmap)
        await writeArtifact(
          resolve(values.heatmap),
          await verificationHeatmap(await project.scene(), report),
        );
      print(report);
      if (report.status === 'fail') process.exitCode = 2;
      break;
    }
    case 'proof':
      print(
        await softProof(
          project,
          resolve(values.output ?? join(project.outputDirectory, 'proof.png')),
          preset,
        ),
      );
      break;
    case 'preflight': {
      const report = await preflight(project, preset);
      const path = resolve(values.output ?? join(project.outputDirectory, 'preflight.json'));
      await writeArtifact(path, JSON.stringify(report, null, 2) + '\n');
      print({ ...report, report: path });
      if (report.status === 'fail') process.exitCode = 2;
      break;
    }
    case 'export':
      if (values.format !== 'project' && (values.format || values.preset || inferredFormat)) {
        print(
          await exportArtwork(
            project,
            resolve(values.output ?? join(project.outputDirectory, `artwork.${preset.format}`)),
            preset,
          ),
        );
        break;
      }
      if (!values.output) throw new Error('export requires --output');
      if (!['.json', '.yaml', '.yml'].includes(extname(values.output).toLowerCase()))
        throw new Error('Scene bundle output must end in .json or .yaml; use --format for artwork');
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
