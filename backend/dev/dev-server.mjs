#!/usr/bin/env node
// A local stand-in for a Supabase project, for development and tests only (never deployed).
// One origin, like Supabase:
//   /auth/v1/*     -> GoTrue (Supabase Auth), which must be running on AUTH_PORT
//   /rest/v1/*     -> PostgREST, which must be running on REST_PORT
//   /storage/v1/*  -> a small file store implemented here, with the same URLs as Supabase Storage
//                     and access decided by the database's can_read_object / can_write_object
// It also catches GoTrue's emails on SMTP_PORT, so magic links can be read at /dev/mail.
// Start everything with backend/dev/start.sh.
// Those links sign anyone in, so it listens on this computer only, answers only requests addressed
// to localhost (which stops DNS-rebinding pages), and lets only pages on localhost read its replies.
import { createServer, request } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, createReadStream, createWriteStream, existsSync, rmSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT || 54321);
const AUTH_PORT = Number(process.env.AUTH_PORT || 9999);
const REST_PORT = Number(process.env.REST_PORT || 3000);
const SMTP_PORT = Number(process.env.SMTP_PORT || 2500);
const HOST = '127.0.0.1';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const MAX_MAIL = 200;
const FILES = process.env.FILES || '/tmp/tch-storage';
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('Set JWT_SECRET to the same secret GoTrue and PostgREST use');

const mail = [];

function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin || !LOCAL.test(origin.replace(/^https?:\/\//, ''))) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, prefer, x-client-info, x-upsert, range, accept-profile, content-profile');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-range, location');
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function proxy(req, res, port, path) {
  const headers = { ...req.headers, host: `localhost:${port}` };
  const up = request({ host: '127.0.0.1', port, path, method: req.method, headers }, (r) => {
    const out = { ...r.headers };
    delete out['access-control-allow-origin'];
    res.writeHead(r.statusCode, out);
    r.pipe(res);
  });
  up.on('error', (e) => send(res, 502, { message: `upstream on port ${port} is not running: ${e.message}` }));
  req.pipe(up);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// Asks the database, as the signed-in user, whether a storage path may be read or written.
function allowed(fn, path, auth, apikey) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ path });
    const up = request(
      { host: '127.0.0.1', port: REST_PORT, path: `/rpc/${fn}`, method: 'POST', headers: { authorization: auth || '', apikey: apikey || '', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      (r) => {
        let data = '';
        r.on('data', (c) => (data += c));
        r.on('end', () => resolve(r.statusCode === 200 && data.trim() === 'true'));
      },
    );
    up.on('error', () => resolve(false));
    up.end(body);
  });
}

function sign(path, exp) {
  return createHmac('sha256', SECRET).update(`${path}:${exp}`).digest('hex');
}

function filePath(objectPath) {
  const p = normalize(join(FILES, objectPath));
  if (!p.startsWith(normalize(FILES) + '/')) throw new Error('bad path');
  return p;
}

async function storage(req, res, url) {
  const m = url.pathname.match(/^\/storage\/v1\/object\/(sign\/)?([^/]+)\/?(.*)$/);
  if (!m) return send(res, 404, { message: 'Not found' });
  const [, signed, bucket, rawPath] = m;
  const objectPath = decodeURIComponent(rawPath);
  const key = `${bucket}/${objectPath}`;
  const auth = req.headers.authorization;
  const apikey = req.headers.apikey;

  if (signed && req.method === 'GET') {
    const exp = Number(url.searchParams.get('exp'));
    const token = url.searchParams.get('token') || '';
    const good = sign(key, exp);
    if (!exp || exp < Date.now() / 1000 || token.length !== good.length || !timingSafeEqual(Buffer.from(token), Buffer.from(good))) {
      return send(res, 400, { message: 'Invalid or expired signature' });
    }
    const f = filePath(key);
    if (!existsSync(f)) return send(res, 404, { message: 'Object not found' });
    res.writeHead(200, { 'content-length': statSync(f).size, 'content-type': 'application/octet-stream' });
    return createReadStream(f).pipe(res);
  }
  if (signed && req.method === 'POST') {
    if (!(await allowed('can_read_object', objectPath, auth, apikey))) return send(res, 403, { message: 'Not allowed' });
    const { expiresIn = 3600 } = JSON.parse((await readBody(req)).toString() || '{}');
    const exp = Math.floor(Date.now() / 1000) + Number(expiresIn);
    return send(res, 200, { signedURL: `/object/sign/${bucket}/${encodeURI(objectPath)}?token=${sign(key, exp)}&exp=${exp}` });
  }
  if (req.method === 'POST' && objectPath) {
    if (!(await allowed('can_write_object', objectPath, auth, apikey))) return send(res, 403, { message: 'Not allowed' });
    const f = filePath(key);
    if (existsSync(f) && req.headers['x-upsert'] !== 'true') return send(res, 409, { message: 'The resource already exists' });
    mkdirSync(dirname(f), { recursive: true });
    req.pipe(createWriteStream(f)).on('finish', () => send(res, 200, { Key: key }));
    return;
  }
  if (req.method === 'DELETE' && !objectPath) {
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || '{}');
    const removed = [];
    for (const p of prefixes) {
      if (!(await allowed('can_write_object', p, auth, apikey))) continue;
      rmSync(filePath(`${bucket}/${p}`), { force: true });
      removed.push({ name: p });
    }
    return send(res, 200, removed);
  }
  send(res, 405, { message: 'Not supported by the local stand-in' });
}

createServer(async (req, res) => {
  if (!LOCAL.test(req.headers.host || '')) return send(res, 421, { message: 'This stand-in only answers localhost' });
  cors(req, res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/auth/v1/')) return proxy(req, res, AUTH_PORT, req.url.slice('/auth/v1'.length));
  if (url.pathname.startsWith('/rest/v1/')) return proxy(req, res, REST_PORT, req.url.slice('/rest/v1'.length));
  if (url.pathname.startsWith('/storage/v1/')) return storage(req, res, url).catch((e) => send(res, 500, { message: e.message }));
  if (url.pathname === '/dev/mail') return send(res, 200, mail);
  send(res, 404, { message: 'Not found' });
}).listen(PORT, HOST, () => console.log(`Local Supabase stand-in on http://localhost:${PORT}`));

// ---------- a tiny SMTP sink ----------
function decodeQuotedPrintable(s) {
  return s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

createTcpServer((socket) => {
  let data = false;
  let buffer = '';
  let message = { to: [] };
  socket.write('220 localhost ESMTP\r\n');
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let i;
    while ((i = buffer.indexOf('\r\n')) !== -1) {
      if (data) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end + 5);
        data = false;
        const text = decodeQuotedPrintable(raw);
        const subject = (text.match(/^Subject: (.*)$/m) || [])[1] || '';
        const link = (text.match(/https?:\/\/[^\s"'<>]+verify\?[^\s"'<>]+/) || [])[0] || null;
        mail.push({ to: message.to, subject, link: link && link.replace(/&amp;/g, '&'), at: new Date().toISOString() });
        if (mail.length > MAX_MAIL) mail.splice(0, mail.length - MAX_MAIL);
        message = { to: [] };
        socket.write('250 OK\r\n');
        continue;
      }
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250 localhost\r\n');
      else if (cmd === 'MAIL') socket.write('250 OK\r\n');
      else if (cmd === 'RCPT') { message.to.push((line.match(/<([^>]+)>/) || [])[1]); socket.write('250 OK\r\n'); }
      else if (cmd === 'DATA') { data = true; socket.write('354 End with .\r\n'); }
      else if (cmd === 'QUIT') { socket.write('221 Bye\r\n'); socket.end(); }
      else socket.write('250 OK\r\n');
    }
  });
}).listen(SMTP_PORT, HOST);
