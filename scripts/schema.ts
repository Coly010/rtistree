import { z } from 'zod';
import { resolve } from 'node:path';
import { componentsSchema, instanceSchema } from '../src/components.js';
import { critiqueSchema } from '../src/critique.js';
import { briefSchema } from '../src/benchmark.js';
import { sceneSchema, layerSchema } from '../src/schema.js';
import { commandSchema, patchSchema } from '../src/commands.js';
import { writeArtifact } from '../src/artifacts.js';
const include = z.array(z.string().min(1)).max(128).optional();
const authoredLayer: z.ZodType = z.lazy(() =>
  z.union([instanceSchema, layerSchema.extend({ children: z.array(authoredLayer).optional() })]),
);
const authoring = sceneSchema.extend({
  include,
  components: componentsSchema.optional(),
  layers: z.array(authoredLayer).default([]),
});
const fragment = z.strictObject({
  include,
  components: componentsSchema.optional(),
  fonts: sceneSchema.shape.fonts,
  assets: sceneSchema.shape.assets.optional(),
  layers: z.array(authoredLayer).optional(),
});
for (const [name, schema] of Object.entries({
  critique: critiqueSchema,
  brief: briefSchema,
  scene: sceneSchema,
  authoring,
  fragment,
  command: commandSchema,
  patch: patchSchema,
})) {
  await writeArtifact(
    resolve(`schemas/${name}.schema.json`),
    JSON.stringify(z.toJSONSchema(schema, { reused: 'ref' }), null, 2) + '\n',
  );
}
console.log(
  'Generated canonical scene, authoring, fragment, command and patch schemas in schemas/.',
);
