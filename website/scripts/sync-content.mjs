import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(site, '..');
const repo = 'https://github.com/Coly010/rtistree/blob/main/';
// Standalone Sites snapshots include the synchronized content and licensed assets.
// The main OSS checkout always regenerates them from the canonical sources.
const standalone = await access(resolve(root, 'docs/getting-started.md')).then(() => false, () => true);
if (standalone) {
  for (const file of ['src/content/docs/docs/getting-started.md', 'public/assets/guard.png', 'public/fonts/LICENSE-Inter.txt']) await access(resolve(site, file));
  console.log('Using the synchronized content included in this standalone site snapshot.');
  process.exit(0);
}
const docs = resolve(root, 'docs');
const output = resolve(site, 'src/content/docs/docs');
const publicDir = resolve(site, 'public');
// These directories contain generated content only. Remove stale routes/raw sources.
await rm(output, { recursive: true, force: true });
await rm(resolve(publicDir, 'docs-source'), { recursive: true, force: true });
await mkdir(output, { recursive: true });
const preferred = ['core-concepts.md', 'getting-started.md', 'agent-setup.md', 'agent-art-workflow.md', 'cli-reference.md', 'scene-format.md', 'studio.md', 'atelier.md', 'production.md', 'evolution.md', 'engine-overview.md', 'changelog.md'];
async function syncDoc(path, rel = relative(docs, path).split('\\').join('/')) {
  const source = await readFile(path, 'utf8');
  const title = source.match(/^# (.+)$/m)?.[1] ?? rel;
  const order = preferred.indexOf(rel);
  const body = source.replace(/^# .+\n/, '').replace(/(!?)\[([^\]]*)\]\(([^\s)]+)\)/g, (match, image, label, href) => {
    if (/^(?:[a-z]+:|#|\/)/i.test(href)) return match;
    const [file, hash] = href.split('#');
    const target = resolve(dirname(path), file);
    const anchor = hash ? `#${hash}` : '';
    const inDocs = relative(docs, target).split('\\').join('/');
    let url;
    if (preferred.includes(inDocs) && extname(target) === '.md') url = `/docs/${inDocs.replace(/\.md$/, '')}/${anchor}`;
    else if (!inDocs.startsWith('../') && inDocs.startsWith('previews/')) url = `/assets/docs/${inDocs.slice(9)}${anchor}`;
    else url = `${repo}${relative(root, target).split('\\').join('/')}${anchor}`;
    return `${image}[${label}](${url})`;
  });
  const destination = resolve(output, rel);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `---\ntitle: ${JSON.stringify(title)}\nsidebar:\n  order: ${order < 0 ? 50 : order}\neditUrl: ${repo}${relative(root, path).split('\\').join('/')}\n---\n\n${body}`);
  const raw = resolve(publicDir, 'docs-source', rel);
  await mkdir(dirname(raw), { recursive: true });
  await writeFile(raw, source);
}
// Public docs are opt-in. Maintainer procedures and historical decisions stay in GitHub.
for (const rel of preferred) {
  await syncDoc(rel === 'changelog.md' ? resolve(root, 'CHANGELOG.md') : resolve(docs, rel), rel);
}
await mkdir(resolve(publicDir, 'assets'), { recursive: true });
await cp(resolve(docs, 'previews'), resolve(publicDir, 'assets/docs'), { recursive: true });
for (const name of ['watch', 'guard', 'stride', 'sword', 'shield', 'coffer', 'lantern', 'potion', 'axe', 'contact-sheet']) {
  await cp(resolve(root, `examples/warden-asset-trial/output/${name}.png`), resolve(publicDir, `assets/${name}.png`));
}
await cp(resolve(root, 'examples/warden-asset-trial/rejected-v1/output/contact-sheet.png'), resolve(publicDir, 'assets/rejected-contact-sheet.png'));
await mkdir(resolve(publicDir, 'downloads'), { recursive: true });
await cp(resolve(root, 'examples/warden-asset-trial/output/asset-pack.zip'), resolve(publicDir, 'downloads/verdigris-watch.zip'));
await cp(resolve(root, 'examples/hello'), resolve(publicDir, 'downloads/hello'), { recursive: true, filter: p => !/(?:history|\.png|\.evidence\.json)/.test(p) });
await mkdir(resolve(publicDir, 'fonts'), { recursive: true });
for (const weight of ['400', '700']) await cp(resolve(root, `node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.woff2`), resolve(publicDir, `fonts/inter-latin-${weight}-normal.woff2`));
await cp(resolve(root, 'licenses/Inter-OFL.txt'), resolve(publicDir, 'fonts/LICENSE-Inter.txt'));
console.log('Synced canonical docs, trial assets, starter files and licensed fonts.');

for (const style of ['normal', 'italic']) await cp(resolve(root, `node_modules/@fontsource/dm-serif-display/files/dm-serif-display-latin-400-${style}.woff2`), resolve(publicDir, `fonts/dm-serif-display-latin-400-${style}.woff2`));
await cp(resolve(root, 'licenses/DM-Serif-Display-OFL.txt'), resolve(publicDir, 'fonts/LICENSE-DM-Serif-Display.txt'));
