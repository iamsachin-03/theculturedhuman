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
  ...readdirSync(join(PUBLIC, 'places')).filter((f) => f.endsWith('.html')).map((f) => `places/${f}`),
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

test('the navigation is built around the platform and marks the current page', () => {
  const html = read('marketplace.html');
  const nav = html.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/)[0];
  const labels = [...nav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1].replace('&amp;', '&'));
  assert.deepEqual(labels, ['Trace Your Roots', 'Family Archive', 'Places', 'Stories', 'Keepsakes', 'Journeys', 'The Commons', 'Plans']);
  assert.match(nav, /<a href="\/marketplace.html" aria-current="page">/);
  assert.equal((nav.match(/aria-current/g) || []).length, 1);
  assert.match(html, /<a class="account-link" href="\/app.html" data-account-link>Sign in<\/a>/);
});

test('the homepage has four sections and leads to the archive', () => {
  const main = read('index.html').match(/<main id="main">([\s\S]*)<\/main>/)[1];
  assert.equal((main.match(/<section\b/g) || []).length, 4);
  assert.match(main, /href="\/app.html">Start your family archive/);
  for (const href of ['/trace.html', '/places/', '/journal/']) assert.ok(main.includes(`href="${href}"`), href);
});

test('the app page carries its backend settings, loads its scripts in order and is not indexed', () => {
  const html = read('app.html');
  const site = JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url), 'utf8'));
  const meta = html.match(/<meta name="tch-backend" content="([^"]*)">/);
  assert.ok(meta, 'backend meta tag');
  assert.deepEqual(JSON.parse(meta[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')), site.backend);
  const scripts = [...html.matchAll(/<script src="\/scripts\/([\w-]+)\.js" defer><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['site', 'app-core', 'app-store-local', 'app-store-supabase', 'app']);
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.ok(!read('sitemap.xml').includes('/app.html'));
  assert.ok(!read('index.html').includes('tch-backend'), 'only the app page carries the settings');
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

test('the marketplace is honest that there is no checkout', () => {
  const html = read('marketplace.html');
  assert.match(html, /No online checkout yet/);
  assert.doesNotMatch(html, /add to cart|checkout now|buy now/i);
});

test('every enquiry form field has a label and the form says how details are used', () => {
  let forms = 0;
  for (const page of pages) {
    const html = read(page);
    for (const [form] of html.matchAll(/<form class="enquiry"[\s\S]*?<\/form>/g)) {
      forms++;
      for (const [, id] of form.matchAll(/<(?:input|select|textarea) id="([^"]+)"/g)) {
        assert.match(form, new RegExp(`<label for="${id}">`), `${page}: #${id} has no label`);
      }
      assert.match(form, /only to reply to you/, `${page}: missing privacy note`);
    }
  }
  assert.ok(forms >= 7, `expected at least 7 enquiry forms, found ${forms}`);
});

test('articles with offers end with a "Bring this home" block', () => {
  const html = read('journal/madhubani-painting.html');
  assert.match(html, /Bring this home/);
  assert.match(html, /<a class="offer-card" href="\/commission.html">/);
});

test('every place has a page, a point on the roots map and a contribution form that names it', () => {
  const index = read('places/index.html');
  const list = JSON.parse(read('places/places.json'));
  assert.ok(list.length >= 7);
  for (const p of list) {
    const html = read(`places/${p.slug}.html`);
    assert.match(index, new RegExp(`<a href="${p.path}" aria-label="${p.name}">`), p.slug);
    assert.match(html, new RegExp(`<input type="hidden" name="place" value="${p.name}">`), p.slug);
    assert.match(html, /What families from here carry/);
  }
});

test('directories with nobody listed invite the first people instead of showing an empty list', () => {
  for (const [page, anchor] of [['marketplace.html', 'makers'], ['journeys.html', 'hosts'], ['family-stories.html', 'storytellers']]) {
    assert.match(read(page), new RegExp(`<div class="empty-state">[^]*?href="/join.html#${anchor}"`), page);
  }
  assert.match(read('join.html'), /id="makers"[^]*id="hosts"[^]*id="storytellers"/);
});
