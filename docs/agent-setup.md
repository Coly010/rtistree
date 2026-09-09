# Connect an agent

Rtistree provides a CLI, an MCP server and a TypeScript SDK. The engine renders locally;
your host supplies the model and any vision capability.

## MCP over stdio

Install Rtistree in a project and create a scene using the [quickstart](getting-started.md).
Use this configuration shape in an MCP client that accepts `mcpServers`:

```json
{
  "mcpServers": {
    "rtistree": {
      "command": "node",
      "args": [
        "/absolute/path/to/my-art/node_modules/rtistree/dist/cli.js",
        "serve",
        "/absolute/path/to/my-art/scene.json"
      ]
    }
  }
}
```

Replace both paths with real absolute paths. Use an absolute path to your Node executable
if the host does not inherit your terminal's PATH. Configuration location and field wrappers
vary by client; the underlying command is always `node <cli.js> serve <scene>`.
The server writes protocol messages only to stdout.

On connection, the client receives concise art-direction instructions. The full versioned
guide is available as the `rtistree://guides/art-direction` resource and through `studioHelp`.
Some clients do not automatically expose server instructions or resources to the model;
in that case, explicitly tell the agent to call `studioHelp` first.

Example task:

> Read Rtistree's art-direction guide, inspect this project and render it. Create one
> representative asset before expanding the family. Compare its silhouette and grayscale
> values, inspect it at the intended display size, and record technical, functional and
> visual findings separately. Revise failed criteria before exporting.

The server exposes inspection, rendering, crop inspection, typed edits, undo/redo, verification,
critiques, program execution, pipelines and staged production. Rendering tools return PNG image
content; use a vision-capable agent to judge appearance. Structured inspection alone cannot
establish that an image looks good.

## CLI agents

```sh
npx rtistree art-guide
npx rtistree inspect scene.json
npx rtistree render scene.json -o review.png
npx rtistree studio-help
```

Read the JSON guide, open the rendered image, then choose a focused edit. Do not substitute a
successful `verify` result for visual review. CLI command details are in the [reference](cli-reference.md).

## SDK hosts

```js
import { rtistreeAgentInstructions, artDirectionGuide, Project } from 'rtistree';

const project = await Project.open('./scene.json');
const image = await project.render();
// Include rtistreeAgentInstructions in your host's agent instructions.
// Expose artDirectionGuide and image.png to the agent through your host's tools.
```

These exports contain guidance; importing them does not automatically insert anything into
an external agent's context. The host must perform that integration. The renderer has no
built-in model client, API key handling or automatic visual critic.

## Trust and review

Run only painting programs and recipes you trust. The JavaScript VM is not a security sandbox.
Normal rendering does not execute recipes. Keep an agent's access scoped to the intended
project, and inspect its proposed changes and outputs as appropriate to your workflow.

The [art-direction workflow](agent-art-workflow.md) documents sample selection, connected
construction, ground contact and existing production review gates. It makes lessons available;
it does not guarantee model compliance or artistic quality.
