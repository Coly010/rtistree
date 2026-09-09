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
      for (const match of html.matchAll(/(?:href|src)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
        const href = match[1];
        if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue;
        const target = href.startsWith('/') ? resolve(output, `.${decodeURIComponent(href)}`) : resolve(dirname(path), decodeURIComponent(href));
        if (!(await exists(extname(target) ? target : resolve(target, 'index.html')))) errors.push(`${path}: ${href}`);
      }
    }
  }
}
await walk(output);
if (errors.length) throw new Error(`Broken local links:\n${[...new Set(errors)].join('\n')}`);
console.log(`Checked local page and asset links in ${pages} HTML files.`);
