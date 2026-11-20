#!/usr/bin/env node
// Serves public/ locally the way Vercel does: /journal/ → index.html, unknown paths → 404.html,
// /s/<id> → api/shared.py, /card/<token> → api/card.py, and the Python functions in api/ at /api/<name> (each run through
// tools/run_function.py, so edits apply on the next request). Every response carries the security
// headers from vercel.json. Functions read their settings from the environment, as on Vercel.
//   node tools/serve.mjs [port]
// It listens on this computer only. Set HOST=0.0.0.0 to open it to your network on purpose
// (to try it on a phone, say); anyone on that network can then reach it.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 4321);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 5 * 1024 * 1024;
const PYTHON = process.env.PYTHON || 'python3';
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
const REDIRECTS = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')).redirects.map((r) => [r.source, r.destination]));

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

async function readBody(req, res) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) { plain(res, 413, 'Too large.'); req.destroy(); return null; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Runs api/<name>.py through tools/run_function.py, as Vercel's Python runtime would. */
function runPython(name, request) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [join(ROOT, 'tools/run_function.py'), name], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`api/${name}.py exited with ${code}`));
      try { resolve(JSON.parse(out)); } catch (err) { reject(err); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

async function callFunction(name, req, res, url) {
  if (!existsSync(join(ROOT, 'api', `${name}.py`))) return false;
  const body = await readBody(req, res);
  if (body === null) return true;
  const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'));
  headers.host = /^[\w.-]+(:\d+)?$/.test(req.headers.host || '') ? req.headers.host : `localhost:${PORT}`;
  const reply = await runPython(name, { method: req.method, path: url.pathname, query: url.search.slice(1), headers, body: body.toString('base64') });
  res.writeHead(reply.status, reply.headers);
  res.end(Buffer.from(reply.body, 'base64'));
  return true;
}

async function handle(req, res) {
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return plain(res, 400, 'Bad request.'); }
  const path = url.pathname;
  const share = path.match(/^\/s\/([\w-]+)$/);
  if (share && (await callFunction('shared', req, res, url))) return;
  if (/^\/card\/[\w-]+$/.test(path) && (await callFunction('card', req, res, url))) return;
  const fn = path.match(/^\/api\/([\w-]+)$/);
  if (fn && (await callFunction(fn[1], req, res, url))) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return plain(res, 405, 'Not allowed.');
  }
  // Vercel's cleanUrls: /about.html and /journal/index.html redirect to /about and /journal.
  if (path.endsWith('.html')) {
    const clean = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/(.)\/$/, '$1');
    return res.writeHead(308, { Location: clean + url.search }).end();
  }
  if (REDIRECTS[path]) return res.writeHead(308, { Location: REDIRECTS[path] }).end();
  const found = (await resolve(path)) || (extname(path) ? null : await resolve(path + '.html'));
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
