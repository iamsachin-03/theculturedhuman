import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const read = (p) => readFileSync(join(PUBLIC, p), 'utf8');
const pages = [
  ...readdirSync(PUBLIC).filter((f) => f.endsWith('.html')),
  ...readdirSync(join(PUBLIC, 'journal')).map((f) => `journal/${f}`),
];

test('the committed site matches its sources and passes every build check', () => {
  execFileSync(process.execPath, [join(ROOT, 'tools/build.mjs'), '--check'], { stdio: 'pipe' });
});

test('every page has the shared head, header, footer and theme script before paint', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<html lang="en-IN">/, page);
    assert.match(html, /<link rel="canonical" href="https:\/\/theculturedhuman\.vercel\.app\//, page);
    assert.match(html, /<meta property="og:title"/, page);
    assert.ok(html.indexOf('/scripts/theme-init.js') < html.indexOf('</head>'), `${page}: theme-init must load in <head>`);
    assert.match(html, /<select data-theme-picker/, page);
    assert.match(html, /class="menu-toggle"[^>]*aria-expanded="false"/, page);
    assert.match(html, /<main id="main">/, page);
    assert.match(html, /<script src="\/scripts\/site\.js" defer><\/script>/, page);
    assert.doesNotMatch(html, /theme-picker\.js|styles\/style\.css|style="/, page);
  }
});

test('the navigation has the nine sections and marks the current page', () => {
  const html = read('culture.html');
  const nav = html.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/)[0];
  const labels = [...nav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1].replace('&amp;', '&'));
  assert.deepEqual(labels, ['Home', 'Explore', 'Indian Culture', 'Wisdom', 'Food & Travel', 'Conscious Living', 'Better Self', 'Bazaar', 'The Commons']);
  assert.match(nav, /<a href="\/culture.html" aria-current="page">/);
  assert.equal((nav.match(/aria-current/g) || []).length, 1);
});

test('every image is local, registered and has alt text', () => {
  const register = JSON.parse(read('assets/register.json'));
  const files = new Set(register.flatMap((a) => Object.values(a.files)));
  for (const page of pages) {
    for (const [img] of read(page).matchAll(/<img\b[^>]*>/g)) {
      const src = img.match(/src="([^"]+)"/)[1];
      // /brand/ holds the site's own logo; the register covers third-party images.
      assert.ok(src.startsWith('/brand/') || files.has(src), `${page}: ${src} is not in the register`);
      assert.match(img, /\salt="/, `${page}: missing alt`);
    }
  }
});

test('every registered image exists on disk and records its creator and licence', () => {
  for (const a of JSON.parse(read('assets/register.json'))) {
    for (const f of Object.values(a.files)) assert.ok(existsSync(join(PUBLIC, f)), `${a.id}: ${f} missing`);
    for (const key of ['creator', 'licence', 'sourceUrl', 'alt']) assert.ok(a[key], `${a.id}: ${key} missing`);
  }
});

test('articles cite their sources and link each footnote to an entry', () => {
  for (const page of pages.filter((p) => p.startsWith('journal/') && p !== 'journal/index.html')) {
    const html = read(page);
    const refs = new Set([...html.matchAll(/href="#source-(\d+)"/g)].map((m) => m[1]));
    assert.ok(refs.size > 0, `${page}: no citations`);
    for (const n of refs) assert.match(html, new RegExp(`<li id="source-${n}"`), `${page}: source ${n} missing`);
    assert.match(html, /"@type":"Article"/, page);
  }
});

test('the marketplace is honest that nothing is for sale yet', () => {
  const html = read('marketplace.html');
  assert.match(html, /does not take orders or payments/);
  assert.doesNotMatch(html, /add to cart|checkout now|buy now/i);
});
