import { z } from 'zod';
import { resolve } from 'node:path';
import { sceneSchema } from '../src/schema.js';
import { commandSchema, patchSchema } from '../src/commands.js';
import { writeArtifact } from '../src/artifacts.js';
const include = z.array(z.string().min(1)).max(128).optional();
const authoring = sceneSchema.extend({ include, layers: sceneSchema.shape.layers.default([]) });
const fragment = z.strictObject({
  include,
  assets: sceneSchema.shape.assets.optional(),
  layers: sceneSchema.shape.layers.optional(),
});
for (const [name, schema] of Object.entries({
  scene: sceneSchema,
  authoring,
  fragment,
  command: commandSchema,
  patch: patchSchema,
})) {
  await writeArtifact(
    resolve(`schemas/${name}.schema.json`),
    JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n',
  );
}
console.log(
  'Generated canonical scene, authoring, fragment, command and patch schemas in schemas/.',
);
