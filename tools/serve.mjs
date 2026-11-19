#!/usr/bin/env node
// Serves public/ locally the way Vercel does: /journal/ → index.html, unknown paths → 404.html,
// /s/<id> → api/shared.mjs, and the Web-standard functions in api/ (GET or POST exports) at /api/<name>.
// Functions read their settings from the environment, as on Vercel.
//   node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
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

async function callFunction(name, req, res, url) {
  let mod;
  try { mod = await import(pathToFileURL(join(ROOT, 'api', `${name}.mjs`)).href); } catch { return false; }
  const handler = mod[req.method];
  if (typeof handler !== 'function') {
    res.writeHead(405, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Not here.' }));
    return true;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = new Request(`http://${req.headers.host}${url.pathname}${url.search}`, {
    method: req.method,
    headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  return true;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  try {
    const share = path.match(/^\/s\/([\w-]+)$/);
    if (share && (await callFunction('shared', req, res, url))) return;
    const fn = path.match(/^\/api\/([\w-]+)$/);
    if (fn && (await callFunction(fn[1], req, res, url))) return;
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Something went wrong.' }));
    return;
  }
  if (REDIRECTS[path]) {
    res.writeHead(308, { Location: REDIRECTS[path] }).end();
    return;
  }
  const found = await resolve(path);
  const file = found || join(PUBLIC, '404.html');
  res.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(PORT, () => console.log(`The Cultured Human → http://localhost:${PORT}`));
