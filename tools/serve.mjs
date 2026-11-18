#!/usr/bin/env node
// Serves public/ locally the way Vercel does: /journal/ → index.html, unknown paths → 404.html.
//   node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 4321);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const REDIRECTS = { '/bazaar.html': '/marketplace.html', '/journal/index.html': '/journal/' };

async function resolve(urlPath) {
  const safe = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let file = join(PUBLIC, safe);
  if (!file.startsWith(PUBLIC)) return null;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (REDIRECTS[path]) {
    res.writeHead(308, { Location: REDIRECTS[path] }).end();
    return;
  }
  const found = await resolve(path);
  const file = found || join(PUBLIC, '404.html');
  res.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(PORT, () => console.log(`The Cultured Human → http://localhost:${PORT}`));
