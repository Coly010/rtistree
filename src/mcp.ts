import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
  const server = new McpServer({ name: 'rtistree', version: '0.1.0' });
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const mutate = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  server.registerTool(
    'inspectScene',
    {
      description:
        'Inspect semantic layers, resolved bounds, scene hash and undo state. Start here before editing.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => json(await project.inspect()),
  );
  server.registerTool(
    'inspectLayer',
    {
      description:
        'Inspect one layer including its semantic source, masks, effects, raster operations and tiles.',
      inputSchema: { id: z.string() },
      annotations: readOnly,
    },
    async ({ id }) => json(await project.inspectLayer(id)),
  );
  server.registerTool(
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
  server.registerTool(
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
        join(project.root, 'renders', `${render.evidence.render.png_hash.slice(7)}.png`),
        render,
      );
      return { content: [...json(artifact).content, image(render)] };
    },
  );
  server.registerTool(
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
  server.registerTool(
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
  server.registerTool(
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
  server.registerTool(
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
  server.registerTool(
    'verify',
    {
      description:
        'Return measured scene-rule findings and render provenance. Does not assess aesthetic quality; inspect the image for visual critique.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => json(await project.verify()),
  );
  server.registerTool(
    'history',
    {
      description:
        'Read the audit trail with reasons, scene hashes, commands and measured edit locality.',
      inputSchema: {},
      annotations: readOnly,
    },
    async () => json((await project.history()).map(({ after, ...entry }) => entry)),
  );
  return server;
}
export async function serve(project: Project) {
  await createServer(project).connect(new StdioServerTransport());
}
