import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { networkInterfaces } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4300 + Math.floor(Math.random() * 600);
let server;

function get(path, { method = 'GET', host = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host, port: PORT, path, method, timeout: 2000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  server = spawn(process.execPath, [join(ROOT, 'tools/serve.mjs'), String(PORT)], { env: { ...process.env, HOST: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve) => server.stdout.once('data', resolve));
});
after(() => server.kill());

test('a malformed address is turned away and the server keeps running', async () => {
  assert.equal((await get('/%E0%A4%A')).status, 404);
  assert.equal((await get('/')).status, 200);
});

test('nothing outside public/ can be read, however the path is written', async () => {
  for (const path of ['/../package.json', '/..%2f..%2fpackage.json', '/%2e%2e/vercel.json', '/%2e%2e%5cvercel.json', '/scripts/%00', '/.git/config']) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.ok(!res.body.includes('"scripts"') && !res.body.includes('"crons"'), path);
  }
});

test('pages only answer GET and HEAD, and carry the production security headers', async () => {
  assert.equal((await get('/', { method: 'POST' })).status, 405);
  assert.equal((await get('/', { method: 'DELETE' })).status, 405);
  const res = await get('/app.html');
  assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(res.headers['x-frame-options'], 'DENY');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
});

test('it listens on this computer only', async () => {
  const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
  if (!lan) return;
  await assert.rejects(get('/', { host: lan.address }));
});
