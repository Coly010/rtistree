import { createRequire } from 'node:module';
import { buildPipeline, pipelineSchema } from './pipeline.js';
import { production, productionRequestSchema } from './production-workflow.js';
import { exportArtwork, preflight, softProof } from './export.js';
import { exportPresetSchema } from './document.js';
import { critiqueSchema } from './critique.js';
import { programSchema, runProgram, replayRecipe } from './program.js';
import { studioReference } from './studio-reference.js';
import {
  artDirectionGuide,
  artDirectionResourceUri,
  rtistreeAgentInstructions,
} from './art-direction.js';
import {
  rasterReadSchema,
  rasterWriteSchema,
  readRasterRegion,
  writeRasterRegion,
} from './raster-edit.js';
import {
  ListToolsRequestSchema,
  type Tool,
  type ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js';
import { McpServer, type ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { join } from 'node:path';
import { patchSchema } from './commands.js';
import { boundsSchema } from './schema.js';
import { writeRender } from './artifacts.js';
import type { Project } from './project.js';
import type { RenderResult } from './render.js';

const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
});
const image = (render: RenderResult) => ({
  type: 'image' as const,
  data: render.png.toString('base64'),
  mimeType: 'image/png',
});
export function createServer(project: Project): McpServer {
  const server = new McpServer(
    { name: 'rtistree', version: createRequire(import.meta.url)('../package.json').version },
    { instructions: rtistreeAgentInstructions },
  );
  server.registerResource(
    'art-direction',
    artDirectionResourceUri,
    {
      title: 'Rtistree art direction and trial lessons',
      description:
        'Read before creating artwork: representative samples, subject-specific construction and motion checks, separate acceptance axes, calibration failures and a production plan template.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(artDirectionGuide) },
      ],
    }),
  );
  const definitions: Tool[] = [];
  // Share recursive definitions in discovery while retaining SDK runtime validation.
  function registerTool<Args extends z.ZodRawShape>(
    name: string,
    config: { description: string; inputSchema: Args; annotations: ToolAnnotations },
    callback: ToolCallback<Args>,
  ) {
    definitions.push({
      name,
      description: config.description,
      annotations: config.annotations,
      inputSchema: z.toJSONSchema(z.object(config.inputSchema), {
        reused: 'ref',
        target: 'draft-7',
        io: 'input',
      }) as Tool['inputSchema'],
    });
    return server.registerTool(name, config, callback);
  }
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const mutate = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  registerTool(
    'buildPipeline',
    {
      description:
        'Before creating artwork, read studioHelp for construction and review guidance. Explicitly execute trusted local 2D painting code in a dependency graph. Reuse unchanged nodes and atomically commit all changed outputs. Graph code and parameters are retained in scene metadata. Build success is not a visual-quality pass. Native code is not sandboxed.',
      inputSchema: { pipeline: pipelineSchema, expected_hash: z.string().optional() },
      annotations: { ...mutate, openWorldHint: true },
    },
    async ({ pipeline, expected_hash }) =>
      json(await buildPipeline(project, pipeline, expected_hash)),
  );
  registerTool(
    'production',
    {
      description:
        'Plan stages, capture image candidates and detail crops, record human/vision reviews, compare, restore the best candidate with undo, and advance gated stages. Reviews require actual visual observation; technical checks do not rate art. Read studioHelp first.',
      inputSchema: { request: productionRequestSchema },
      annotations: mutate,
    },
    async ({ request }) => json(await production(project, request)),
  );
  registerTool(
    'studioHelp',
    {
      description:
        'Read before creating artwork: representative samples, reference study, distinct poses, connected construction, shared perspective, functional motion checks, observed visual review, targeted revision and blocking defects. Includes trial lessons, a starter production plan, named 2D guides, the raster API and trusted-code limits.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => json(studioReference),
  );
  registerTool(
    'runProgram',
    {
      description:
        'Before creating artwork, read studioHelp for construction and review guidance. Execute a trusted local JavaScript raster program with seeded studio helpers; bake and pin its output, recipe and input snapshots, optionally update a target layer. Successful execution is not a visual-quality pass. Native worker isolation is not a security sandbox; only run code you trust. Scene rendering never executes programs.',
      inputSchema: { program: programSchema },
      annotations: { ...mutate, openWorldHint: true },
    },
    async ({ program }) => json(await runProgram(project, program)),
  );
  registerTool(
    'replayProgram',
    {
      description:
        'Explicitly re-execute a trusted baked asset recipe and compare output hashes. This runs local code, not a security sandbox.',
      inputSchema: { asset: z.string() },
      annotations: { ...mutate, openWorldHint: true },
    },
    async ({ asset }) => {
      const reference = (await project.scene()).assets[asset]?.recipe;
      if (!reference) throw new Error('Asset has no recipe');
      const { png, ...result } = await replayRecipe(project.root, reference);
      return json(result);
    },
  );
  registerTool(
    'readRasterRegion',
    {
      description:
        'Read an exact canvas-space PNG region of the composite or isolated layer, with a scene hash for subsequent dense edits.',
      inputSchema: { request: rasterReadSchema },
      annotations: mutate,
    },
    async ({ request }) => {
      const { render, ...result } = await readRasterRegion(project, request);
      return { content: [...json(result).content, image(render)] };
    },
  );
  registerTool(
    'writeRasterRegion',
    {
      description:
        'Atomically replace or composite a dense local PNG patch into a layer, with exact dimensions, stale-scene protection, locality validation and undo. Layer-space patches follow later object transforms.',
      inputSchema: { request: rasterWriteSchema },
      annotations: mutate,
    },
    async ({ request }) => json(await writeRasterRegion(project, request)),
  );
  registerTool(
    'inspectScene',
    {
      description:
        'Inspect semantic layers, resolved bounds, scene hash and undo state. Start here before editing.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => json(await project.inspect()),
  );
  registerTool(
    'inspectLayer',
    {
      description:
        'Inspect one layer including its semantic source, masks, effects, raster operations and tiles.',
      inputSchema: { id: z.string() },
      annotations: readOnly,
    },
    async ({ id }) => json(await project.inspectLayer(id)),
  );
  registerTool(
    'inspectRegion',
    {
      description:
        'Return an exact PNG crop, intersecting layers, quantized dominant colours and mean luma. Coordinates are canvas pixels.',
      inputSchema: { bounds: boundsSchema },
      annotations: readOnly,
    },
    async ({ bounds }) => {
      const { render, ...region } = await project.inspectRegion(bounds);
      return { content: [...json(region).content, image(render)] };
    },
  );
  registerTool(
    'render',
    {
      description:
        'Render the current persisted scene and return a PNG image, artifact paths and deterministic evidence.',
      inputSchema: { quality: z.enum(['draft', 'preview', 'final']).default('preview') },
      annotations: mutate,
    },
    async ({ quality }) => {
      const render = await project.render({ quality });
      const artifact = await writeRender(
        join(project.outputDirectory, `${render.evidence.render.png_hash.slice(7)}.png`),
        render,
      );
      return { content: [...json(artifact).content, image(render)] };
    },
  );
  registerTool(
    'renderRegion',
    {
      description:
        'Render an exact crop with full compositing context. No approximation at crop edges.',
      inputSchema: { bounds: boundsSchema },
      annotations: readOnly,
    },
    async ({ bounds }) => {
      const render = await project.render({ region: bounds });
      return { content: [...json(render.evidence).content, image(render)] };
    },
  );
  registerTool(
    'apply',
    {
      description:
        'Atomically apply typed semantic or raster commands. Include the inspected expected_hash to reject stale edits and a reason for the audit log. Raster commands are rejected if any final pixel outside their bounds changes. Prefer semantic edits to pixels.',
      inputSchema: { patch: patchSchema },
      annotations: mutate,
    },
    async ({ patch }) => {
      try {
        const entry = await project.apply(patch);
        return json({
          sequence: entry.sequence,
          scene_hash: entry.after_hash,
          locality: entry.locality,
        });
      } catch (error) {
        return {
          isError: true,
          ...json({ error: error instanceof Error ? error.message : String(error) }),
        };
      }
    },
  );
  registerTool(
    'undo',
    {
      description: 'Undo the last transaction; record the reversal in append-only history.',
      inputSchema: {},
      annotations: mutate,
    },
    async () => {
      const entry = await project.undo();
      return json({ scene_hash: entry.after_hash });
    },
  );
  registerTool(
    'redo',
    {
      description: 'Redo the last undone transaction; new edits clear the redo branch.',
      inputSchema: {},
      annotations: mutate,
    },
    async () => {
      const entry = await project.redo();
      return json({ scene_hash: entry.after_hash });
    },
  );
  registerTool(
    'verify',
    {
      description:
        'Return measured scene-rule findings and render provenance. Does not assess aesthetic quality; inspect the image for visual critique.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => json(await project.verify()),
  );
  registerTool(
    'history',
    {
      description:
        'Read the audit trail with reasons, scene hashes, commands and measured edit locality.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => json((await project.history()).map(({ after, ...entry }) => entry)),
  );
  registerTool(
    'recordCritique',
    {
      description:
        'Record a human or vision-agent critique of the actual current image, with exact scene/PNG hashes. Findings can block the iterative pass condition.',
      inputSchema: { critique: critiqueSchema },
      annotations: mutate,
    },
    async ({ critique }) => json(await project.recordCritique(critique)),
  );
  registerTool(
    'readCritique',
    {
      description:
        'Read the critique for the current scene/render, or null if it has not been reviewed.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => json(await project.critique()),
  );
  registerTool(
    'rebase',
    {
      description:
        'Merge nonconflicting manual source changes into the working scene; conflicting paths are reported without committing.',
      inputSchema: {},
      annotations: mutate,
    },
    async () => {
      const e = await project.rebase();
      return json({ hash: e.after_hash });
    },
  );
  registerTool(
    'compactHistory',
    {
      description: 'Compress the full audit trail while retaining every undo/redo state.',
      inputSchema: {},
      annotations: mutate,
    },
    async () => json(await project.compactHistory()),
  );
  registerTool(
    'exportArtwork',
    {
      description:
        'Export PNG, JPEG, TIFF, or physically sized PDF into the project output directory with profile and geometry read-back validation.',
      inputSchema: { name: z.string().regex(/^[a-zA-Z0-9_-]+$/), options: exportPresetSchema },
      annotations: mutate,
    },
    async ({ name, options }) =>
      json(
        await exportArtwork(
          project,
          join(project.outputDirectory, `${name}.${options.format}`),
          options,
        ),
      ),
  );
  registerTool(
    'softProof',
    {
      description: 'Create an sRGB preview of a round-trip through the project CMYK ICC profile.',
      inputSchema: { options: exportPresetSchema },
      annotations: mutate,
    },
    async ({ options }) =>
      json(await softProof(project, join(project.outputDirectory, 'proof.png'), options)),
  );
  registerTool(
    'preflight',
    {
      description:
        'Inspect physical print geometry, source image resolution and ICC requirements before export.',
      inputSchema: { options: exportPresetSchema },
      annotations: readOnly,
    },
    async ({ options }) => json(await preflight(project, options)),
  );
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: definitions }));
  return server;
}
export async function serve(project: Project) {
  await createServer(project).connect(new StdioServerTransport());
}
