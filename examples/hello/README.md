# Your first Rtistree project

Run these commands inside a project created by `npx rtistree@latest init my-art`.
If you are reading this in the repository’s `examples/hello` directory, create a project
first: these are template files, and `init` supplies the package.json and npm scripts.

```sh
npm install
npm run render
```

Open `hello.png`. `scene.json` defines the disc and title; `refine.json` is a sample local edit.

## Refine and undo

```sh
npx rtistree apply scene.json refine.json
npx rtistree render scene.json -o brighter.png
npx rtistree undo scene.json
npx rtistree render scene.json -o restored.png
```

`restored.png` should match `hello.png` byte for byte on the same runtime and platform.
The edit journal lives in `history/`; keep it with the scene to retain your current edits.

## SDK

Run `npm run render:sdk` to execute `render.mjs` and create `sdk-output.png`.

[Getting started](https://rtistree.dev/docs/getting-started/) · [Agent setup](https://rtistree.dev/docs/agent-setup/)
