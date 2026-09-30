import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.txt':'text/plain; charset=utf-8', '.png':'image/png', '.mp4':'video/mp4' };
export function createSiteServer(directory = root) {
  const base = resolve(directory);
  return createServer(async (req,res) => {
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const path = resolve(base, '.' + pathname);
      if (!path.startsWith(base + sep) || pathname.includes('\0')) { res.writeHead(403); res.end('Forbidden'); return; }
      if (!(await stat(path)).isFile()) { res.writeHead(404); res.end('Not found'); return; }
      const bytes = await readFile(path);
      res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 7942);
  createSiteServer().listen(port, '127.0.0.1', () => console.log(`JAD MetaBench: http://localhost:${port}`));
}
