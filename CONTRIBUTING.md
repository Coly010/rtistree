# Contributing to Rtistree

Bug reports, documentation improvements and focused pull requests are welcome.
For a substantial feature, open an issue describing the use case before implementation.

## Development

Use Node.js 22 or newer and npm:

```sh
npm ci
npm run check
npm run format:check
npm run demo
```

Use `npm run package:check` to build, pack and test an actual installation outside the checkout.
It downloads package dependencies from npm and creates a temporary directory.

For the website, run `npm ci --prefix website` followed by `npm run dev --prefix website`.
Run `npm run build --prefix website` to synchronize the root Markdown docs, example assets
and fonts, and build the complete static site. Edit documentation in `docs/`, not the generated website copies.

## Changes and evidence

Keep changes focused. Include a reproduction for bugs and tests for changed behavior.
For rendering changes, include before/after images, relevant crops and the source scene.
Describe technical, functional and visual checks separately. A successful renderer check
is not evidence of artistic quality. Preserve deterministic seeds and do not silently
replace recorded trial results.

Do not commit credentials, local environment files, dependency folders or temporary renders.
By contributing, you agree that your original contributions are distributed under this
repository's MIT license. Preserve notices for third-party material.

## Commit and PR titles

Use Conventional Commits for changes merged into `main`: `fix: ...` for a bug fix,
`feat: ...` for a feature, and `docs: ...`, `test: ...`, `ci: ...` or `chore: ...` for
maintenance. With squash merging, use this format in the PR title. Mark breaking changes
with `!` and explain the migration in a `BREAKING CHANGE:` footer.

Release Please uses these messages to propose versions and generate the changelog.
Do not bump package versions manually in ordinary contributions. See the
[release process](docs/releasing.md) for maintainer instructions.
