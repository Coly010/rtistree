# Release process

The repository is `Coly010/rtistree`, the npm package is `rtistree`, and the website's
canonical origin is `https://rtistree.dev`. The package is MIT licensed to Colum Ferry.

## Validate a release

1. Update `package.json`, its lockfile and `CHANGELOG.md` together. Keep the website version
   label and package instructions aligned with the release.
2. Run `npm ci`, `npm run check`, `npm run format:check` and `npm run package:check`.
3. Run `npm ci --prefix website` and `npm run build --prefix website`.
4. Review the tarball inventory, documentation commands and example sources. The package
   intentionally includes only the small hello example; larger trials are repository assets.
5. Commit the validated source and tag the matching version, for example `v0.5.0`.

## First npm publication

The owner must authenticate with `npm login` and complete any npm 2FA challenge.
Confirm `npm whoami` is the intended owner. Build and inspect the package before publishing:

```sh
npm pack
npm publish rtistree-0.5.0.tgz --access public
```

Do not republish a version number. If a command's outcome is uncertain, check the npm
registry before retrying. Never commit npm tokens or configure long-lived tokens in workflows.

## Subsequent releases with trusted publishing

In the npm package settings, configure a GitHub Actions trusted publisher:

- Owner: `Coly010`
- Repository: `rtistree`
- Workflow filename: `release.yml`

After configuring the npm trusted publisher, set the GitHub repository Actions variable
`NPM_TRUSTED_PUBLISHING_ENABLED` to `true`. Without it, release validation runs but npm
publication is skipped. This permits the initial GitHub tarball release before npm sign-in.

The release workflow checks the tag against the package version, validates the engine,
website and packaged installation, then publishes the same checked tarball with provenance.
It runs on publication of a GitHub release. Configure trust before publishing the next release.
For the bootstrap release, publish npm first and let the workflow skip an already-published version.

See https://docs.npmjs.com/trusted-publishers/ for current npm account requirements.

## Website

The website is an Astro/Starlight static build in `website/`. `docs/` is the source of truth;
the content sync script generates Starlight pages, remaps repository links and copies curated
assets. Generated files are ignored by Git but included when preparing a standalone Sites source snapshot.

`npm run build --prefix website` produces `website/dist`. This is portable static output.
The Sites project ID is in `website/.openai/hosting.json`; never replace it on redeployment.
Use the Sites publishing flow to save and deploy the validated source and static archive.
The `website.yml` workflow validates and uploads a deployable static artifact for each change.

Custom-domain DNS must use the exact records returned by the hosting provider. Do not infer
an apex A record from a preview hostname. Confirm domain and TLS status after the DNS change.
