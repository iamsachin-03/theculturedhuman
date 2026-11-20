#!/usr/bin/env node
// Serves public/ locally the way Vercel does: /journal/ → index.html, unknown paths → 404.html,
// /s/<id> → api/shared.mjs, and the Web-standard functions in api/ (GET or POST exports) at /api/<name>.
// Every response carries the security headers from vercel.json. Functions read their settings
// from the environment, as on Vercel.
//   node tools/serve.mjs [port]
// It listens on this computer only. Set HOST=0.0.0.0 to open it to your network on purpose
// (to try it on a phone, say); anyone on that network can then reach it.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, extname, normalize, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 4321);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 5 * 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const REDIRECTS = { '/bazaar.html': '/marketplace.html', '/journal/index.html': '/journal/' };

/** vercel.json's headers for every path, adjusted for plain http on this computer. */
function securityHeaders() {
  const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  const out = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]));
  delete out['Strict-Transport-Security'];
  const local = 'http://localhost:54321 http://127.0.0.1:54321';
  out['Content-Security-Policy'] = out['Content-Security-Policy']
    .replace(/;\s*upgrade-insecure-requests/, '')
    .replace(/(connect-src|img-src|media-src) /g, `$1 ${local} `);
  return out;
}
const SECURITY = securityHeaders();

/** The file under public/ for a URL path, or null. Never anything outside public/, and no dotfiles. */
async function resolve(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0') || /(^|[/\\])\./.test(decoded)) return null;
  let file = join(PUBLIC, normalize(decoded));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + sep)) return null;
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    if (!(await stat(file)).isFile()) return null;
    return file;
  } catch {
    return null;
  }
}

function plain(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
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
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) { plain(res, 413, 'Too large.'); req.destroy(); return true; }
    chunks.push(chunk);
  }
  const host = /^[\w.-]+(:\d+)?$/.test(req.headers.host || '') ? req.headers.host : `localhost:${PORT}`;
  const request = new Request(`http://${host}${url.pathname}${url.search}`, {
    method: req.method,
    headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
  return true;
}

async function handle(req, res) {
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return plain(res, 400, 'Bad request.'); }
  const path = url.pathname;
  const share = path.match(/^\/s\/([\w-]+)$/);
  if (share && (await callFunction('shared', req, res, url))) return;
  const fn = path.match(/^\/api\/([\w-]+)$/);
  if (fn && (await callFunction(fn[1], req, res, url))) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return plain(res, 405, 'Not allowed.');
  }
  if (REDIRECTS[path]) return res.writeHead(308, { Location: REDIRECTS[path] }).end();
  const found = await resolve(path);
  const file = found || join(PUBLIC, '404.html');
  res.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(req.method === 'HEAD' ? undefined : await readFile(file));
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) plain(res, 500, 'Something went wrong.');
    else res.destroy();
  });
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.listen(PORT, HOST, () => console.log(`The Cultured Human → http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`));
