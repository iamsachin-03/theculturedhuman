import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { previewFor, renderShared, fetchShared } from '../backend/share/preview.mjs';
import { GET } from '../api/shared.mjs';

const ID = '3b25faca-0997-489e-8bbd-b5f2a0183e8d';
const word = { id: ID, kind: 'A word or saying', title: 'Thakuma', script: 'ঠাকুমা', body: 'What we called my father\'s mother.', credit: 'Asha <b>', place_slug: 'bengal', suggested_place: null };
const bengal = { slug: 'bengal', name: 'Bengal', image: '/assets/x-1600.jpg', imageAlt: 'A street' };
const html = readFileSync(new URL('../public/shared.html', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('a preview names the contribution, its place and who shared it', () => {
  const p = previewFor(word, bengal, 'The Cultured Human');
  assert.equal(p.title, 'Thakuma (ঠাকুমা) — The Cultured Human');
  assert.equal(p.description, 'A word or saying from Bengal, shared by Asha <b>: What we called my father\'s mother.');
  assert.ok(previewFor({ ...word, body: 'x '.repeat(300) }, null, 'T').description.length <= 200);
});

test('the page gets the preview, its own address and the id, all escaped', () => {
  const out = renderShared(html, { contribution: word, place: bengal, origin: 'https://site.example', siteName: 'The Cultured Human' });
  assert.match(out, /<title>Thakuma \(ঠাকুমা\) — The Cultured Human<\/title>/);
  assert.match(out, /<meta property="og:title" content="Thakuma \(ঠাকুমা\) — The Cultured Human">/);
  assert.match(out, /<meta property="og:description" content="A word or saying from Bengal, shared by Asha &lt;b&gt;: What we called my father&#39;s mother\.">/);
  assert.match(out, new RegExp(`<meta property="og:url" content="https://site.example/s/${ID}">`));
  assert.match(out, /<meta property="og:image" content="https:\/\/site\.example\/assets\/x-1600\.jpg">/);
  assert.match(out, new RegExp(`<link rel="canonical" href="https://site.example/s/${ID}">`));
  assert.match(out, new RegExp(`<meta name="tch-shared-id" content="${ID}">`));
  assert.match(out, /<meta name="robots" content="noindex/);
  assert.equal((out.match(/og:title/g) || []).length, 1);
});

test('only well-formed ids are looked up, and only published ones', async () => {
  let asked = null;
  const fetch = async (url, opts) => { asked = { url, opts }; return { ok: true, json: async () => [word] }; };
  assert.equal(await fetchShared({ url: 'https://db', key: 'anon', id: 'x;drop', fetch }), null);
  assert.equal(asked, null);
  assert.deepEqual(await fetchShared({ url: 'https://db', key: 'eyJanon', id: ID, fetch }), word);
  assert.match(asked.url, /status=eq\.published&id=eq\.3b25faca/);
  assert.equal(asked.opts.headers.authorization, 'Bearer eyJanon');
});

test('/s/<id> is rewritten to the function, which answers 404 for anything unknown', async () => {
  assert.deepEqual(vercel.rewrites, [{ source: '/s/:id', destination: '/api/shared?id=:id' }]);
  assert.match(vercel.functions['api/shared.mjs'].includeFiles, /public\/shared\.html/);
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => [] });
  try {
    const missing = await GET(new Request(`https://site.example/api/shared?id=${ID}`));
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Looking for it/);
    globalThis.fetch = async () => ({ ok: true, json: async () => [word] });
    const found = await GET(new Request(`https://site.example/s/${ID}`));
    assert.equal(found.status, 200);
    assert.match(found.headers.get('cache-control'), /s-maxage/);
    const body = await found.text();
    assert.match(body, /og:image" content="https:\/\/site\.example\/assets\/.*-1600\.jpg/);
    assert.match(body, /<title>Thakuma/);
  } finally {
    globalThis.fetch = saved;
  }
});
