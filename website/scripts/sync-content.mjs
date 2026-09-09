import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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
await mkdir(output, { recursive: true });
const publicDir = resolve(site, 'public');
const preferred = ['getting-started.md', 'agent-setup.md', 'agent-art-workflow.md', 'cli-reference.md', 'scene-format.md', 'studio.md', 'atelier.md', 'production.md'];
async function syncDoc(path) {
  const source = await readFile(path, 'utf8');
  const rel = relative(docs, path).split('\\').join('/');
  const title = source.match(/^# (.+)$/m)?.[1] ?? rel;
  const order = preferred.indexOf(rel);
  const body = source.replace(/^# .+\n/, '').replace(/(!?)\[([^\]]*)\]\(([^\s)]+)\)/g, (match, image, label, href) => {
    if (/^(?:[a-z]+:|#|\/)/i.test(href)) return match;
    const [file, hash] = href.split('#');
    const target = resolve(dirname(path), file);
    const anchor = hash ? `#${hash}` : '';
    const inDocs = relative(docs, target).split('\\').join('/');
    let url;
    if (!inDocs.startsWith('../') && extname(target) === '.md') url = `/docs/${inDocs.replace(/\.md$/, '')}/${anchor}`;
    else if (!inDocs.startsWith('../') && inDocs.startsWith('previews/')) url = `/assets/docs/${inDocs.slice(9)}${anchor}`;
    else url = `${repo}${relative(root, target).split('\\').join('/')}${anchor}`;
    return `${image}[${label}](${url})`;
  });
  const destination = resolve(output, rel);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `---\ntitle: ${JSON.stringify(title)}\nsidebar:\n  order: ${order < 0 ? 50 : order}\neditUrl: ${repo}docs/${rel}\n---\n\n${body}`);
  const raw = resolve(publicDir, 'docs-source', rel);
  await mkdir(dirname(raw), { recursive: true });
  await writeFile(raw, source);
}
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.md')) await syncDoc(path);
  }
}
await walk(docs);
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
