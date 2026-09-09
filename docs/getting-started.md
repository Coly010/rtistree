# Make your first image

Rtistree runs locally on Node.js 22 or newer. It needs no GPU or model API key.
Start in an empty directory:

```sh
mkdir my-art
cd my-art
npm init -y
npm install https://github.com/Coly010/rtistree/releases/download/v0.5.0/rtistree-0.5.0.tgz
```

This installs the checked release tarball from GitHub. npm registry publication is pending;
the installed package and `graphics` executable are the same.

## Render a scene

Save this as `scene.json`:

```json
{
  "version": 1,
  "canvas": { "width": 640, "height": 400, "background": "#14251f" },
  "layers": [
    {
      "id": "disc",
      "type": "vector",
      "bounds": [360, 60, 200, 200],
      "shape": { "type": "ellipse", "fill": "#95b85c" }
    },
    {
      "id": "title",
      "type": "text",
      "bounds": [48, 275, 544, 80],
      "content": "Hello, Rtistree.",
      "style": { "font": "inter", "size": 44, "weight": "bold", "colour": "#edf3e8" }
    }
  ]
}
```

Or copy the same scene from `node_modules/rtistree/examples/hello/scene.json`.

```sh
npx graphics render scene.json -o hello.png
npx graphics inspect scene.json
```

Open `hello.png`: a green disc and a title on a dark background. An adjacent evidence JSON
records the scene hash, dimensions, fonts and renderer/runtime information.

## Change one part

Save this as `refine.json`:

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

```sh
npx graphics apply scene.json refine.json
npx graphics render scene.json -o brighter.png
npx graphics undo scene.json
npx graphics render scene.json -o restored.png
```

The disc becomes brighter. Undo restores the first image. Changes are journaled beside
the scene; the original authoring file remains intact. On the same runtime and platform,
`restored.png` should have the same bytes as `hello.png`.

## Export a portable project

```sh
npx graphics export scene.json -o portable/scene.json
npx graphics render portable/scene.json -o portable.png
```

The export includes referenced assets and fonts. Keep the exported directory together.

## Use the SDK

Save this as `render.mjs` beside `scene.json`:

```js
import { Project } from 'rtistree';
import { writeFile } from 'node:fs/promises';

const project = await Project.open('./scene.json');
const result = await project.render();
await writeFile('sdk-output.png', result.png);
```

Run `node render.mjs`. The SDK and CLI use the same engine.

## Next steps

Read [agent setup](agent-setup.md) to connect an MCP client, or the [scene format](scene-format.md)
to add layers, text, assets and masks. For generated painting programs, use the [studio guide](studio.md).
