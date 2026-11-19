import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { headBlock } from '../tools/lib/templates.mjs';

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
  assert.deepEqual(labels, ['My Roots', 'Places', 'Stories', 'Keepsakes', 'Journeys', 'The Commons', 'Plans']);
  assert.match(nav, /<a href="\/marketplace.html" aria-current="page">/);
  assert.equal((nav.match(/aria-current/g) || []).length, 1);
  assert.match(html, /<a class="account-link" href="\/app.html" data-account-link>Sign in<\/a>/);
  assert.doesNotMatch(html, /class="product-nav"/);
});

test('tracing and the archive are one product, My Roots, with its own menu on each of its pages', () => {
  for (const page of ['roots.html', 'trace.html', 'archive.html', 'family-stories.html', 'roots-kit.html']) {
    const html = read(page);
    const nav = html.match(/<nav class="primary-nav"[\s\S]*?<\/nav>/)[0];
    assert.match(nav, /<a href="\/roots.html" aria-current="(page|true)">My Roots<\/a>/, page);
    const sub = html.match(/<nav class="product-nav"[\s\S]*?<\/nav>/);
    assert.ok(sub, `${page}: has the My Roots menu`);
    for (const href of ['/roots.html', '/trace.html', '/archive.html', '/app.html']) assert.ok(sub[0].includes(`href="${href}"`), `${page}: ${href}`);
    assert.equal((sub[0].match(/aria-current="page"/g) || []).length, 1, `${page}: marks itself`);
  }
});

test('The Commons asks a weekly question, shows live contributions and a word wall, and links answers to the app', () => {
  const prompts = JSON.parse(read('community/prompts.json'));
  assert.equal(new Date(prompts.start + 'T00:00:00Z').getUTCDay(), 1, 'the weekly cycle starts on a Monday');
  assert.ok(prompts.prompts.length >= 12);
  const kinds = readFileSync(join(PUBLIC, 'scripts/app-core.js'), 'utf8');
  for (const p of prompts.prompts) assert.ok(kinds.includes(`'${p.kind}'`), `${p.text}: "${p.kind}" is a contribution kind`);
  const html = read('manch.html');
  assert.match(html, /id="this-week"[\s\S]*data-this-week-link[^>]*|href="\/app\.html#\/contribute\?week=0"/);
  assert.match(html, /id="words"[\s\S]*data-community-feed[^>]*data-kind="A word or saying"/);
  assert.match(html, /data-community-feed data-limit="6" data-url="https:\/\//);
  assert.match(html, /\/scripts\/community-live\.js/);
  for (const page of pages) {
    const footer = read(page).match(/<footer[\s\S]*<\/footer>/)[0];
    assert.ok(footer.includes('href="/manch.html#this-week"'), `${page}: footer links to this week's question`);
  }
});

test('the homepage has six sections, opens with one question, and leads to the archive and The Commons', () => {
  const main = read('index.html').match(/<main id="main">([\s\S]*)<\/main>/)[1];
  assert.equal((main.match(/<section\b/g) || []).length, 6);
  assert.match(main, /href="#first-story"[\s\S]*id="first-story"[\s\S]*data-first-story/);
  assert.match(main, /data-this-week[\s\S]*data-community-feed data-limit="3"/);
  assert.ok(main.includes('href="/manch.html"') && main.includes('href="/roots.html"'));
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
  assert.deepEqual(scripts, ['site', 'roots-art', 'app-core', 'app-store-local', 'app-store-supabase', 'app']);
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
  for (const [page, role] of [['marketplace.html', 'maker'], ['journeys.html', 'host'], ['family-stories.html', 'storyteller']]) {
    const html = read(page);
    assert.match(html, new RegExp(`<div class="directory" data-listings data-role="${role}" data-url="https://[^"]+" data-key="[^"]+"><div class="empty-state">[^]*?href="/app\\.html#/offer\\?role=${role}"`), page);
    assert.match(html, /\/scripts\/community-live\.js/, page);
  }
  assert.match(read('join.html'), /id="makers"[^]*id="hosts"[^]*id="storytellers"/);
});

test('visit counts are cookie-free, off until switched on, and never on private pages', () => {
  const site = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
  const tag = '<script src="/_vercel/insights/script.js" defer></script>';
  const on = { ...site, analytics: { vercel: true } };
  assert.ok(headBlock({ site: on, page: { title: 'x', path: '/x.html' } }).includes(tag));
  assert.ok(!headBlock({ site: on, page: { title: 'x', path: '/app.html', noindex: true } }).includes(tag));
  assert.ok(!headBlock({ site: { ...site, analytics: { vercel: false } }, page: { title: 'x', path: '/x.html' } }).includes(tag));
  const built = pages.filter((p) => read(p).includes('/_vercel/insights/'));
  assert.deepEqual(built, site.analytics.vercel ? pages.filter((p) => !read(p).includes('noindex')) : []);
});

test('place pages send families to the app to write, keep the enquiry form, and read published contributions', () => {
  const places = JSON.parse(read('places/places.json'));
  const seed = readFileSync(join(ROOT, 'backend/places.sql'), 'utf8');
  for (const p of places) {
    const html = read(`places/${p.slug}.html`);
    assert.match(html, new RegExp(`href="/app\\.html#/contribute\\?place=${p.slug}"`), p.slug);
    assert.match(html, /<details class="contribute-other">[\s\S]*<form/, p.slug);
    assert.match(html, new RegExp(`data-community-feed data-limit="100" data-place="${p.slug}" data-url="https://`), p.slug);
    assert.match(html, /\/scripts\/community-live\.js/, p.slug);
    assert.match(seed, new RegExp(`\\('${p.slug}', `), `backend/places.sql seeds ${p.slug}`);
  }
  assert.match(read('places/index.html'), /href="\/app\.html#\/contribute"/);
  assert.doesNotMatch(read('sitemap.xml'), /places\.json|\.sql/);
});

test('the other sections lead into My Roots and The Commons', () => {
  assert.match(read('places/index.html'), /data-community-feed data-limit="6"[\s\S]*\/scripts\/community-live\.js/);
  assert.match(read('journal/index.html'), /href="\/manch\.html#this-week"[\s\S]*href="\/roots\.html"/);
  assert.match(read('marketplace.html'), /href="\/trace\.html"[\s\S]*href="\/commission\.html"/);
  assert.match(read('journeys.html'), /Trace your roots first[\s\S]*href="\/roots\.html#ask"/);
});

test('the platform fee shown on the site is the one the database charges', () => {
  const site = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
  const schema = readFileSync(join(ROOT, 'backend/schema.sql'), 'utf8');
  const rate = Number(schema.match(/create function platform_fee[\s\S]*?round\(price \* ([\d.]+)\)/)[1]);
  assert.equal(Math.round(rate * 100), site.platformFeePercent);
});

test('makers, hosts and storytellers can list themselves from Join, and the fee shown everywhere is the real one', () => {
  const site = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
  const joinPage = read('join.html');
  for (const role of ['maker', 'host', 'storyteller']) assert.ok(joinPage.includes(`href="/app.html#/offer?role=${role}"`), role);
  assert.match(joinPage, /id="makers"[^]*id="hosts"[^]*id="storytellers"/);
  const fee = (6000 * site.platformFeePercent) / 100;
  assert.ok(joinPage.includes(`<dt>The family pays</dt><dd>₹${(6000 + fee).toLocaleString('en-IN')}</dd>`), 'worked example uses the configured fee');
  for (const page of ['join.html', 'plans.html', 'about.html']) assert.ok(read(page).includes(`${site.platformFeePercent}%`), page);
  assert.doesNotMatch(joinPage + read('plans.html') + read('about.html'), /\{\{/);
});

test('the footer stays short, and every page it dropped is still reachable', () => {
  const footer = read('index.html').match(/<footer[\s\S]*<\/footer>/)[0];
  assert.ok((footer.match(/<li>/g) || []).length <= 14, 'at most 14 footer links');
  const themes = read('journal/index.html').match(/<nav class="theme-links"[\s\S]*?<\/nav>/)[0];
  for (const href of ['/culture.html', '/proverbs.html', '/experiences.html', '/conscious-living.html', '/fitness.html', '/music.html']) assert.ok(themes.includes(`href="${href}"`), href);
  assert.match(read('index.html'), /href="\/credits\.html"/);
});

test('privacy, terms and community guidelines are on every page, and the contribute form points to them', () => {
  for (const page of pages) {
    const bottom = read(page).match(/<div class="container site-footer__bottom">[\s\S]*?<\/div>/)[0];
    for (const href of ['/privacy.html', '/terms.html', '/community-guidelines.html', '/credits.html']) assert.ok(bottom.includes(`href="${href}"`), `${page}: ${href}`);
  }
  const app = readFileSync(join(PUBLIC, 'scripts/app.js'), 'utf8');
  assert.ok(app.includes("'/community-guidelines.html'") && app.includes("'/privacy.html'"));
  assert.ok(read('terms.html').includes(`${JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8')).platformFeePercent}%`), 'terms state the configured fee');
});

test('each contribution has its own page, kept out of search, and past questions have an archive', () => {
  const shared = read('shared.html');
  assert.match(shared, /<meta name="robots" content="noindex/);
  assert.match(shared, /data-shared[^>]*data-url=/);
  assert.doesNotMatch(read('sitemap.xml'), /shared\.html/);
  assert.match(read('questions.html'), /data-question-archive[^>]*data-url=/);
  assert.match(read('manch.html'), /href="\/questions\.html"/);
  for (const page of ['shared.html', 'questions.html']) assert.match(read(page), /<script src="\/scripts\/community-live\.js" defer>/, page);
});
