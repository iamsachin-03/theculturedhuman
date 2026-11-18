#!/usr/bin/env node
// Builds every HTML page in public/ with no dependencies.
//
//   node tools/build.mjs           write the site
//   node tools/build.mjs --check   change nothing; exit 1 if public/ is stale or broken
//
// Sources:
//   src/pages/*.html        front matter + the page's <main> content
//   content/articles/*.md   journal articles (see content/articles/README.md)
//   content/site.json       navigation, footer, pillars, site URL, enquiry settings
//   content/offers.json     what readers can commission, book or join, with each enquiry form
//   content/places/*.json   place pages: what families from each place carry, and what they have shared
//   content/people.json     makers, hosts and storytellers listed on the platform
//   public/assets/register.json   every image, with its creator and licence
//
// Inside pages, {{img id}}, {{figure id caption="…"}} and {{credit id}} expand
// into responsive images and credit lines drawn from the register.
// {{offer-cards id id …}} lists offers as cards and {{enquiry id}} renders an offer's enquiry form.
// {{directory maker|host|storyteller}} lists people from content/people.json, {{place-cards}} and
// {{roots-map}} show the places.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter, renderMarkdown, wordCount, inline, escapeHtml } from './lib/markdown.mjs';
import * as t from './lib/templates.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const CHECK = process.argv.includes('--check');

const site = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
const register = JSON.parse(readFileSync(join(PUBLIC, 'assets/register.json'), 'utf8'));
const assets = new Map(register.map((a) => [a.id, a]));
const quiz = JSON.parse(readFileSync(join(ROOT, 'content/quiz.json'), 'utf8'));
quiz.forEach((q, i) => {
  if (!q.q || !Array.isArray(q.options) || !(q.answer in q.options) || !q.explain) {
    throw new Error(`content/quiz.json: question ${i + 1} needs q, options, a valid answer index and explain`);
  }
});

const offers = new Map();
for (const [i, o] of JSON.parse(readFileSync(join(ROOT, 'content/offers.json'), 'utf8')).entries()) {
  const where = `content/offers.json: offer ${i + 1}`;
  if (!o.id || !o.label || !o.form?.messageLabel) throw new Error(`${where} needs id, label and form.messageLabel`);
  if (offers.has(o.id)) throw new Error(`${where}: duplicate id "${o.id}"`);
  offers.set(o.id, o);
}

function offer(id, where, { card = false } = {}) {
  const o = offers.get(id);
  if (!o) throw new Error(`${where}: unknown offer "${id}" — add it to content/offers.json first`);
  if (card && !(o.href && o.title && o.summary && o.action && o.image)) {
    throw new Error(`${where}: offer "${id}" needs href, title, summary, action and image to appear as a card`);
  }
  return o;
}

const ROLES = ['maker', 'host', 'storyteller'];
const placesDir = join(ROOT, 'content/places');
const places = readdirSync(placesDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((file) => {
    const where = `content/places/${file}`;
    const p = JSON.parse(readFileSync(join(placesDir, file), 'utf8'));
    for (const key of ['name', 'region', 'image', 'intro']) if (!p[key]) throw new Error(`${where} needs "${key}"`);
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') throw new Error(`${where} needs numeric "lat" and "lng"`);
    if (!Array.isArray(p.aliases) || !p.aliases.length) throw new Error(`${where} needs "aliases" for matching typed place names`);
    for (const [i, c] of (p.carries || []).entries()) {
      if (!c.kind || !c.title || !c.text) throw new Error(`${where}: carries[${i}] needs kind, title and text`);
    }
    for (const [i, c] of (p.contributions || []).entries()) {
      if (!c.kind || !c.title || !c.text || !c.credit) throw new Error(`${where}: contributions[${i}] needs kind, title, text and credit`);
    }
    return { ...p, slug: file.replace(/\.json$/, ''), where, carries: p.carries || [], contributions: p.contributions || [], path: `/places/${file.replace(/\.json$/, '')}.html` };
  });
const placeBySlug = new Map(places.map((p) => [p.slug, p]));

const people = JSON.parse(readFileSync(join(ROOT, 'content/people.json'), 'utf8'));
for (const [i, person] of people.entries()) {
  const where = `content/people.json: entry ${i + 1}`;
  for (const key of ['id', 'name', 'role', 'place', 'summary']) if (!person[key]) throw new Error(`${where} needs "${key}"`);
  if (!ROLES.includes(person.role)) throw new Error(`${where}: role must be one of ${ROLES.join(', ')}`);
  if (!placeBySlug.has(person.place)) throw new Error(`${where}: place "${person.place}" has no file in content/places`);
}
const withPlace = (person) => ({ ...person, placeInfo: placeBySlug.get(person.place) });
const directory = (role) => t.directory(role, people.filter((p) => p.role === role).map(withPlace));

const problems = [];
/** @type {Map<string, string>} absolute output path → file contents */
const outputs = new Map();

function asset(id, where) {
  const a = assets.get(id);
  if (!a) throw new Error(`${where}: unknown image "${id}" — add it to public/assets/register.json first`);
  return a;
}

function walk(dir, ext) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'assets' ? [] : walk(p, ext);
    return p.endsWith(ext) ? [p] : [];
  });
}

function outFile(path) {
  return join(PUBLIC, path.endsWith('/') ? path + 'index.html' : path);
}

function emit(page, main, imageId) {
  outputs.set(outFile(page.path), t.layout({ site, page, image: assets.get(imageId || site.defaultImage), main }));
}

// ---------- articles ----------
const REQUIRED_ARTICLE = ['title', 'description', 'dek', 'pillar', 'author', 'date', 'heroImage'];
const articleDir = join(ROOT, 'content/articles');
const articles = readdirSync(articleDir)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((file) => {
    const where = `content/articles/${file}`;
    const { data, body } = parseFrontMatter(readFileSync(join(articleDir, file), 'utf8'));
    for (const key of REQUIRED_ARTICLE) if (!data[key]) throw new Error(`${where}: front matter needs "${key}"`);
    if (!site.pillars[data.pillar]) throw new Error(`${where}: pillar "${data.pillar}" is not in content/site.json`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error(`${where}: date must be YYYY-MM-DD`);
    const slug = file.replace(/\.md$/, '');
    return { ...data, slug, where, body, path: `/journal/${slug}.html`, related: data.related || [], hero: asset(data.heroImage, where) };
  })
  .filter((a) => a.draft !== 'true')
  .sort((a, b) => b.date.localeCompare(a.date));

const bySlug = new Map(articles.map((a) => [a.slug, a]));
const card = (a) => t.storyCard(a, a.hero, site.pillars[a.pillar].label);
const offerCards = (ids, where) =>
  ids.map((id) => {
    const o = offer(id, where, { card: true });
    return t.offerCard(o, asset(o.image, where));
  });

for (const article of articles) {
  const [main, sourcesMd = ''] = article.body.split(/^## Sources\s*$/m);
  const rendered = renderMarkdown(main, {
    figure: (id, caption, wide) => t.figure(asset(id, article.where), caption, wide),
  });

  const sources = [...sourcesMd.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => ({ n: Number(m[1]), text: m[2] }));
  for (const n of rendered.footnotes) {
    if (!sources.some((s) => s.n === n)) problems.push(`${article.where}: footnote [^${n}] has no matching entry under "## Sources"`);
  }
  for (const s of sources) {
    if (!rendered.footnotes.has(s.n)) problems.push(`${article.where}: source ${s.n} is never cited in the text`);
  }
  const sourcesHtml = sources.length
    ? `<section class="sources container--narrow" aria-labelledby="sources-title"><h2 id="sources-title">Sources &amp; further reading</h2><ol>${sources
        .map((s) => `<li id="source-${s.n}" value="${s.n}">${inline(s.text)}</li>`)
        .join('')}</ol></section>`
    : '';

  article.readingMinutes = Math.max(1, Math.round(wordCount(main) / 220));
  const related = article.related.map((slug) => {
    const r = bySlug.get(slug);
    if (!r) throw new Error(`${article.where}: related article "${slug}" does not exist`);
    return card(r);
  });

  const page = {
    path: article.path,
    title: `${article.title} — ${site.name}`,
    description: article.description,
    type: 'article',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.description,
      datePublished: article.date,
      dateModified: article.updated || article.date,
      author: { '@type': 'Person', name: article.author },
      publisher: { '@type': 'Organization', name: site.name },
      image: site.url + article.hero.files[1600],
      mainEntityOfPage: site.url + article.path,
    },
  };
  const offersHtml = article.offers?.length ? t.bringHome(offerCards(article.offers, article.where)) : '';
  emit(page, t.articleMain({ site, article, hero: article.hero, bodyHtml: rendered.html, sourcesHtml, related, offers: offersHtml }), article.heroImage);
}

emit(
  {
    path: '/journal/',
    title: `Stories — ${site.name}`,
    description: 'Researched essays and explainers on Indian art, philosophy, food, craft and conscious living from The Cultured Human.',
  },
  t.journalMain({ cards: articles.map(card) }),
  articles[0]?.heroImage,
);
emit(
  {
    path: '/credits.html',
    title: `Image credits — ${site.name}`,
    description: 'Credits and licences for every photograph and artwork used on The Cultured Human.',
  },
  t.creditsMain({ assets: register }),
);

// ---------- places ----------
for (const place of places) {
  const carries = place.carries.map((c) => {
    const story = c.story && bySlug.get(c.story);
    if (c.story && !story) throw new Error(`${place.where}: story "${c.story}" does not exist`);
    return { ...c, storyInfo: story, imageInfo: c.image && asset(c.image, place.where) };
  });
  emit(
    {
      path: place.path,
      title: `${place.name} — Places — ${site.name}`,
      description: `What families from ${place.name} carry with them: ${carries.map((c) => c.title).join(', ')}. Add your family's words, dishes and memories.`,
      script: 'places-live',
    },
    t.placeMain({
      site,
      place,
      hero: asset(place.image, place.where),
      carries,
      people: people.filter((p) => p.place === place.slug).map(withPlace),
      form: t.enquiryForm(site, offer('contribute', place.where), { place: place.name }),
    }),
    place.image,
  );
}
const placeCards = () => t.placeCards(places.map((p) => ({ ...p, hero: asset(p.image, p.where) })));
const rootsMap = () => t.rootsMap(places);
emit(
  {
    path: '/places/',
    title: `Places — ${site.name}`,
    description: 'Every family comes from a place. Explore what families from each place carry with them, and add your own.',
  },
  t.placesIndexMain({ site, map: rootsMap(), cards: placeCards(), form: t.enquiryForm(site, offer('contribute', 'places index'), { place: 'A new place' }) }),
  places[0]?.image,
);
// The places table must hold every place before families can add to it (backend/README.md).
const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`;
outputs.set(
  join(ROOT, 'backend/places.sql'),
  `-- Generated by tools/build.mjs from content/places/*.json. Run it after schema.sql, and again
-- whenever a place is added. It only adds or updates places; it never deletes contributions.
insert into places (slug, name, region, lat, lng) values
${places.map((p) => `  (${[p.slug, p.name, p.region].map(sqlText).join(', ')}, ${Number(p.lat)}, ${Number(p.lng)})`).join(',\n')}
on conflict (slug) do update set name = excluded.name, region = excluded.region, lat = excluded.lat, lng = excluded.lng;
`,
);
outputs.set(
  join(PUBLIC, 'places/places.json'),
  JSON.stringify(places.map((p) => ({ slug: p.slug, name: p.name, path: p.path, aliases: p.aliases }))) + '\n',
);

// ---------- hand-written pages ----------
function attrs(s) {
  const out = {};
  for (const m of s.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) out[m[1]] = m[2] ?? true;
  return out;
}

const pagesDir = join(ROOT, 'src/pages');
for (const file of readdirSync(pagesDir).filter((f) => f.endsWith('.html'))) {
  const where = `src/pages/${file}`;
  const { data, body } = parseFrontMatter(readFileSync(join(pagesDir, file), 'utf8'));
  for (const key of ['title', 'description']) if (!data[key]) throw new Error(`${where}: front matter needs "${key}"`);
  const path = file === 'index.html' ? '/' : `/${file}`;

  const main = body
    .replace(/\{\{(img|figure|credit)\s+([\w-]+)([^}]*)\}\}/g, (_, kind, id, rest) => {
      const a = asset(id, where);
      const opt = attrs(rest);
      if (kind === 'credit') return t.creditLine(a);
      if (kind === 'figure') return t.figure(a, escapeHtml(opt.caption ?? a.subject), Boolean(opt.wide));
      return t.picture(a, { sizes: opt.sizes, className: opt.class, eager: Boolean(opt.eager), alt: opt.alt });
    })
    .replace(/\{\{latest-articles(?:\s+(\d+))?\}\}/g, (_, n) => articles.slice(0, Number(n) || 3).map(card).join('\n'))
    .replace(/\{\{quiz\}\}/g, () => t.quiz(quiz))
    .replace(/\{\{offer-cards\s+([\w\s-]+)\}\}/g, (_, ids) => `<div class="offer-grid">${offerCards(ids.trim().split(/\s+/), where).join('')}</div>`)
    .replace(/\{\{enquiry\s+([\w-]+)\}\}/g, (_, id) => t.enquiryForm(site, offer(id, where)))
    .replace(/\{\{directory\s+(maker|host|storyteller)\}\}/g, (_, role) => directory(role))
    .replace(/\{\{place-cards\}\}/g, placeCards)
    .replace(/\{\{roots-map\}\}/g, rootsMap);
  if (/\{\{/.test(main)) problems.push(`${where}: unrecognised {{…}} placeholder`);

  emit(
    { path, title: data.title, description: data.description, noindex: data.noindex === 'true', script: data.script },
    main,
    data.image,
  );
}

// ---------- sitemap & robots ----------
const indexable = [...outputs.entries()]
  .filter(([file, html]) => file.endsWith('.html') && !relative(PUBLIC, file).startsWith('..') && !html.includes('<meta name="robots" content="noindex'))
  .map(([file]) => '/' + relative(PUBLIC, file).split('\\').join('/').replace(/(^|\/)index\.html$/, '$1'))
  .sort();
outputs.set(
  join(PUBLIC, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable
    .map((p) => `  <url><loc>${escapeHtml(site.url + p)}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
);
outputs.set(join(PUBLIC, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);

// ---------- checks ----------
const registered = new Set(register.flatMap((a) => Object.values(a.files)));
for (const [file, html] of outputs) {
  if (!file.endsWith('.html')) continue;
  const where = relative(ROOT, file);
  const base = '/' + posix.dirname(relative(PUBLIC, file).split('\\').join('/')) + '/';
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) problems.push(`${where}: image without alt text: ${m[0].slice(0, 80)}`);
  }
  for (const m of html.matchAll(/\s(href|src|srcset)="([^"]+)"/g)) {
    const urls = m[1] === 'srcset' ? m[2].split(',').map((s) => s.trim().split(/\s+/)[0]) : [m[2]];
    for (const raw of urls) {
      if (/^(https?:|mailto:|tel:|data:)/.test(raw)) {
        if (m[1] !== 'href' && /^https?:/.test(raw)) {
          problems.push(`${where}: hotlinked image ${raw} — add it to the image library instead`);
        }
        continue;
      }
      const [pathPart, hash] = raw.split('#');
      const clean = pathPart.split('?')[0];
      if (!clean) {
        if (hash && !new RegExp(`id="${hash}"`).test(html)) problems.push(`${where}: link to missing anchor #${hash}`);
        continue;
      }
      const target = posix.normalize(clean.startsWith('/') ? clean : base + clean);
      const onDisk = outFile(target);
      if (!outputs.has(onDisk) && !existsSync(onDisk)) problems.push(`${where}: broken link ${raw}`);
      else if (hash && !hash.startsWith('/') && outputs.has(onDisk) && !new RegExp(`id="${hash}"`).test(outputs.get(onDisk))) {
        problems.push(`${where}: link to missing anchor ${raw}`);
      }
      if (target.startsWith('/assets/') && /\.(jpe?g|png|webp)$/i.test(target) && !registered.has(target)) {
        problems.push(`${where}: ${target} is not in the image register`);
      }
    }
  }
}

function fail() {
  console.error(`\n${problems.length} problem(s):\n` + problems.map((p) => `  • ${p}`).join('\n'));
  process.exit(1);
}
if (problems.length && !CHECK) fail();

// ---------- write or compare ----------
const stray = walk(PUBLIC, '.html').filter((f) => !outputs.has(f));
let changed = 0;
for (const [file, contents] of outputs) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === contents) continue;
  changed++;
  if (CHECK) problems.push(`${relative(ROOT, file)} is out of date — run npm run build`);
  else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
}
for (const f of stray) {
  if (CHECK) problems.push(`${relative(ROOT, f)} has no source in src/pages or content/articles`);
  else rmSync(f);
}

if (problems.length) fail();
console.log(
  CHECK
    ? `OK — ${outputs.size} files are up to date.`
    : `Built ${outputs.size} files (${changed} changed${stray.length ? `, ${stray.length} removed` : ''}), ${articles.length} articles.`,
);
