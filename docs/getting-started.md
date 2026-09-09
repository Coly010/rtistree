# Make your first image

Create a small artwork, render it, change one part, and undo that change.
You need **Node.js 22 or newer** and npm. No GPU or model API key is required.

## Create your project

```sh
npx rtistree@latest init my-art
cd my-art
npm install
npm run render
```

If npm asks to install Rtistree for the first command, accept. `init` creates a new
`my-art` directory with a starter scene and a package.json that pins the Rtistree version.
It refuses existing paths, so choose a different name if `my-art` already exists.

Open **hello.png** in the new directory. You should see a green disc and the text
“Hello, Rtistree.” on a dark background. Rendering also writes `hello.png.evidence.json`.

The commands below run from inside `my-art` and use the locally installed package.
The executable is `rtistree`; older installations used `graphics`, which remains an alias.

## Understand the starter

| File           | Purpose                                                 |
| -------------- | ------------------------------------------------------- |
| `scene.json`   | Canvas settings and disc/title layers with editable IDs |
| `refine.json`  | A sample patch that brightens only the disc             |
| `render.mjs`   | The same rendering workflow through the JavaScript SDK  |
| `package.json` | Pinned dependency and the `npm run render` script       |

`npm run render` runs `rtistree render scene.json -o hello.png`.
To inspect the scene's layers and bounds:

```sh
npx rtistree inspect scene.json
```

The starter is deliberately small so you can see what each edit does. Once comfortable,
use the [scene format](scene-format.md) to add shapes, text, images and masks.

## Make a focused edit

The supplied `refine.json` applies a brightness operation to the disc:

```json
{
  "reason": "Brighten the disc while preserving the title and background",
  "commands": [
    {
      "type": "applyRasterOperation",
      "target": "disc",
      "operation": { "type": "brightness", "bounds": [360, 60, 200, 200], "amount": 0.15 }
    }
  ]
}
```

Apply it and save a second image:

```sh
npx rtistree apply scene.json refine.json
npx rtistree render scene.json -o brighter.png
```

Compare **hello.png** and **brighter.png**. Only the disc becomes brighter; the title and
background stay the same. The reason and edit are recorded in `history/`. The authoring
JSON remains intact; the rendered state includes the journaled edits.

## Undo and export

```sh
npx rtistree undo scene.json
npx rtistree render scene.json -o restored.png
```

**restored.png** should match **hello.png** byte for byte on the same runtime and platform.
Use `npx rtistree redo scene.json` if you want to restore the edit again.

Export the current state as a portable project:

```sh
npx rtistree export scene.json -o portable/scene.json
npx rtistree render portable/scene.json -o portable.png
```

The export includes the current resolved scene, referenced assets, fonts and any baked
program recipes. It starts a new baseline: edit history, critiques and production-session
reviews are not copied. Keep the exported directory together.

## Use an agent

Read the built-in art-direction guidance, then follow [agent setup](agent-setup.md)
to connect an MCP client or your own agent host:

```sh
npx rtistree art-guide
```

A useful first task is: “Inspect this scene, render it, and change the disc while preserving
the title and background.” For art creation, ask the agent to inspect silhouettes, values
and intended display size. Technical verification does not establish artistic quality.

## Use the SDK

The starter includes `render.mjs`. Run it with:

```sh
npm run render:sdk
```

Its core is:

```js
import { Project } from 'rtistree';
import { writeFile } from 'node:fs/promises';

const project = await Project.open('./scene.json');
const result = await project.render();
await writeFile('sdk-output.png', result.png);
```

The SDK and CLI use the same engine. For an existing Node project, install with
`npm install rtistree` and import from `rtistree` directly.

## Where next?

- [CLI reference](cli-reference.md) — inspect, edit, render and export commands.
- [Scene format](scene-format.md) — layers, coordinates, assets and effects.
- [Studio](studio.md) — trusted JavaScript painting programs and replayable recipes.
- [Staged production](atelier.md) — compare candidates and record visual review.
