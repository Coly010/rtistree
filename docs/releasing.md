# Release process

Rtistree uses Release Please to prepare version and changelog updates, and npm trusted
publishing to publish from GitHub Actions. The repository is `Coly010/rtistree`, the npm
package is `rtistree`, and the website is `https://rtistree.dev`.

## Everyday releases

1. Merge changes into `main` using Conventional Commit messages. For squash merges, use
   a conventional PR title; that title becomes the commit message.
2. The **Release** workflow opens or updates a release PR with the next version,
   `CHANGELOG.md`, both package lockfiles, and the README and website version labels.
3. Review the generated notes and the **Graphics engine** and **Documentation website**
   checks on that PR. Release PRs stay open until a maintainer decides to ship.
4. Merge the release PR. The same workflow creates the `vX.Y.Z` tag and GitHub release,
   validates the tagged source and packaged installation, then publishes the tested
   tarball to npm with provenance. It also attaches that tarball to the GitHub release.

There is no npm token or personal access token in this flow. GitHub supplies a short-lived
OIDC identity that npm checks against the configured repository and workflow.

### Commit messages and versions

| Commit                            | Example                                            | Version change                          |
| --------------------------------- | -------------------------------------------------- | --------------------------------------- |
| `fix:`                            | `fix: preserve layer opacity when undoing an edit` | Patch: 0.5.1 → 0.5.2                    |
| `feat:`                           | `feat: add palette extraction`                     | Minor: 0.5.1 → 0.6.0                    |
| Breaking change (`!`)             | `feat!: replace the scene coordinate format`       | Minor before 1.0; major from 1.0 onward |
| `docs:`, `ci:`, `chore:`, `test:` | `docs: explain sprite export`                      | No release on their own                 |

Use a `BREAKING CHANGE:` footer to explain migration steps for breaking changes.
The largest applicable change determines the release version. Do not edit versions by hand
for a routine release. Releases continue to use normal `0.x.y` versions on npm's `latest`
tag while the project is a public alpha; this does not claim a stable 1.0 API.

The manifest starts at the already-published 0.5.1. `bootstrap-sha` bounds the initial
history scan at that tag. Older non-conventional commit messages are not automatically
converted into changelog entries. Once the first automated release is merged, normal
release history takes over.

## Trusted publisher setup

The npm package owner configures this once in the package's settings:

- Provider: GitHub Actions
- Repository owner: `Coly010`
- Repository: `rtistree`
- Workflow filename: `release.yml`
- Environment: leave blank (the workflow does not use a GitHub environment)
- Permission: publish

Alternatively, with an authenticated npm owner account and 2FA:

```sh
npx --yes npm@11.19.1 trust list rtistree
npx --yes npm@11.19.1 trust github rtistree --repository Coly010/rtistree --file release.yml --allow-publish --yes
```

The workflow uses Node.js 24, npm 11.19.1, a GitHub-hosted runner and `id-token: write`.
No `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or enablement variable is required. A trust mismatch
fails publication visibly rather than silently skipping it.

In GitHub **Settings → Actions → General → Workflow permissions**, enable **Allow GitHub
Actions to create and approve pull requests**. GitHub bundles creation and approval in
one setting; this workflow creates release PRs but does not approve or merge them.
The repository's default workflow permission can remain read-only.

Bot-created PRs and releases do not trigger ordinary workflows when using `GITHUB_TOKEN`.
The Release workflow explicitly dispatches both validation workflows on the release PR
branch and publishes in a dependent job when a release is created. This avoids needing a
long-lived GitHub token just to trigger CI.

See the [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
and [Release Please documentation](https://github.com/googleapis/release-please-action).

## Recovering a failed release

A GitHub release can exist while npm publication is still running or has failed. Check the
**Release** workflow before announcing availability. Correct the account/trust problem, then
use **Actions → Release → Run workflow**, select `main`, and enter the existing tag in the
`tag` input. Leave the tag blank to refresh the release PR instead.

The retry checks that the tag matches the package, has a published GitHub release and belongs
to `main`. It rebuilds and tests the tarball. If npm already has that version, the workflow
only skips publication when its integrity matches the checked tarball; a mismatch or registry
error fails. Never delete/reuse a published version to fix package contents: ship a new version.
A failed publish can also be retried by rerunning failed jobs from its original workflow run.

## Local validation

```sh
npm ci
npm run check
npm run format:check
npm run docs:check
npm run package:check
npm ci --prefix website
npm run build --prefix website
```

The package check installs the actual tarball in a temporary project and exercises the CLI,
starter, rendering, SDK and MCP guide. It retains the checked archive for the publish job.
Large trial assets stay in the repository; only the small hello example ships in the package.

## Website deployment

The website is an Astro/Starlight static build in `website/`. `docs/` is the source of truth;
the content sync script publishes an explicit list of current user guides plus the changelog,
remaps repository links and copies curated assets. Maintainer procedures and historical proposals/
decisions remain in the repository. Removed generated routes and raw source copies are deleted
during synchronization. Generated files are ignored by Git but included in a standalone Sites source snapshot.

`npm run build --prefix website` produces `website/dist`. The `website.yml` workflow validates
and uploads that static artifact. **npm releases do not deploy the live website.** Publish the
validated website through the Sites flow when documentation or the displayed version changes.
Keep the existing project ID in `website/.openai/hosting.json` when redeploying.
