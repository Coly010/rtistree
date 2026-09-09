import { readFile, readdir, access } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const output = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const errors = [];
let pages = 0;
async function exists(path) { return access(path).then(() => true, () => false); }
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.html')) {
      pages++;
      const html = await readFile(path, 'utf8');
      for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const href = match[1];
        if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue;
        const [location, fragment] = href.split('#');
        const pathname = location.split('?')[0];
        const target = !pathname ? path : pathname.startsWith('/') ? resolve(output, `.${decodeURIComponent(pathname)}`) : resolve(dirname(path), decodeURIComponent(pathname));
        const file = extname(target) ? target : resolve(target, 'index.html');
        if (!(await exists(file))) { errors.push(`${path}: ${href}`); continue; }
        if (fragment && extname(file) === '.html') {
          const targetHtml = file === path ? html : await readFile(file, 'utf8');
          const ids = new Set([...targetHtml.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
          if (!ids.has(decodeURIComponent(fragment))) errors.push(`${path}: missing anchor ${href}`);
        }
      }
    }
  }
}
await walk(output);
if (errors.length) throw new Error(`Broken local links:\n${[...new Set(errors)].join('\n')}`);
console.log(`Checked local page and asset links in ${pages} HTML files.`);

for (const route of ['releasing', 'next-milestone', 'decisions']) {
  for (const base of ['docs', 'docs-source']) {
    if (await exists(resolve(output, base, route)) || await exists(resolve(output, base, `${route}.md`))) {
      throw new Error(`Repository-only documentation leaked into the site: ${base}/${route}`);
    }
  }
}
if (!(await exists(resolve(output, 'docs/changelog/index.html')))) throw new Error('Public changelog is missing');
