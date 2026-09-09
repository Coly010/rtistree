# First image

From a directory with `rtistree` installed, copy these three files into your project.

```sh
npx graphics render scene.json -o hello.png
npx graphics apply scene.json refine.json
npx graphics render scene.json -o brighter.png
npx graphics undo scene.json
npx graphics render scene.json -o restored.png
```

`restored.png` should match `hello.png` byte for byte on the same runtime and platform.
`render.mjs` demonstrates the SDK; run it with `node render.mjs`.
