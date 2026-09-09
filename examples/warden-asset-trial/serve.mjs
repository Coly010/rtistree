import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
const root = fileURLToPath(new URL('.', import.meta.url));
const types = {
  '.html': 'text/html',
  '.png': 'image/png',
  '.json': 'application/json',
  '.md': 'text/plain',
  '.zip': 'application/zip',
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/viewer.html' : pathname));
    if (!path.startsWith(resolve(root) + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const bytes = await readFile(path);
    res.writeHead(200, {
      'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
server.listen(Number(process.env.WARDEN_PORT ?? 4178), '127.0.0.1', () =>
  console.log('Asset trial: http://127.0.0.1:' + server.address().port),
);
