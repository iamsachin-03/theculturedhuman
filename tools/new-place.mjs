#!/usr/bin/env node
// Gives a place that families have suggested its own page.
//   npm run new-place -- --list
//   npm run new-place -- --name "Udupi" --region "Coastal Karnataka" --lat 13.34 --lng 74.75 [--aliases "manipal,kaup"] [--intro "…"]
// Writes content/places/<slug>.json for a page started by families: no photograph and no facts of
// ours until someone sources them, only what families share. Then run `npm run build` and deploy.
// With SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set, it also adds the place to the database and
// moves the contributions that suggested it onto the new page. --list works with the public key
// (published suggestions only) or the service key (every suggestion waiting for a place).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = createRequire(import.meta.url)('../public/scripts/app-core.js');

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

/** The content/places/<slug>.json for a page families started. Throws on anything missing. */
export function placeFile(args, existing = []) {
  const name = String(args.name || '').trim();
  if (!name) throw new Error('Give the place a --name.');
  const region = String(args.region || '').trim();
  if (!region) throw new Error('Give a --region, for example "Coastal Karnataka".');
  const lat = Number(args.lat);
  const lng = Number(args.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Give --lat and --lng as numbers, from any map.');
  const slug = core.placeSlug(args.slug || name);
  if (!slug) throw new Error('Give a --slug in English letters.');
  if (existing.includes(slug)) throw new Error(`content/places/${slug}.json already exists.`);
  const aliases = [...new Set([core.placeKey(name), ...String(args.aliases || '').split(',').map(core.placeKey)].filter(Boolean))];
  return {
    slug,
    json: {
      name,
      region,
      lat,
      lng,
      startedBy: 'families',
      intro: String(args.intro || '').trim() || `This page was started by families from ${name}. Everything on it is what they have shared.`,
      aliases,
      carries: [],
      contributions: [],
    },
  };
}

function database(env, fetch) {
  return async (path, opts = {}) => {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: { apikey: env.key, authorization: `Bearer ${env.key}`, 'content-type': 'application/json', ...(opts.headers || {}) },
      body: opts.json ? JSON.stringify(opts.json) : undefined,
    });
    if (!res.ok) throw new Error(`Database ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

/** Adds the place to the database and moves every suggestion for it onto the page. */
export async function adopt({ env, fetch, slug, place }) {
  const db = database({ SUPABASE_URL: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY }, fetch);
  await db('places?on_conflict=slug', { method: 'POST', json: { slug, name: place.name, region: place.region, lat: place.lat, lng: place.lng }, headers: { prefer: 'resolution=merge-duplicates,return=minimal' } });
  const waiting = await db('place_contributions?select=id,suggested_place&place_slug=is.null');
  const keys = new Set(place.aliases);
  const ids = waiting.filter((c) => keys.has(core.placeKey(c.suggested_place))).map((c) => c.id);
  if (ids.length) await db(`place_contributions?id=in.(${ids.join(',')})`, { method: 'PATCH', json: { place_slug: slug, suggested_place: null }, headers: { prefer: 'return=minimal' } });
  return ids.length;
}

export async function list({ env, fetch, site, places }) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || (site.backend && site.backend.anonKey);
  const url = env.SUPABASE_URL || (site.backend && site.backend.url);
  if (!url || !key) throw new Error('No database is configured in content/site.json.');
  const rows = await database({ SUPABASE_URL: url, key }, fetch)('place_contributions?select=id,suggested_place,status&place_slug=is.null&status=neq.rejected');
  return core.groupSuggestions(rows.map((c) => ({ id: c.id, suggestedPlace: c.suggested_place, status: c.status })), places);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = join(ROOT, 'content/places');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const places = files.map((f) => ({ slug: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
  if (args.list) {
    const site = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
    const groups = await list({ env: process.env, fetch, site, places });
    if (!groups.length) return console.log('No suggested places are waiting.');
    for (const g of groups) console.log(`${g.name}: ${g.ids.length} (${g.published} published)${g.match ? ` — already part of ${g.match}; move them from the moderate page` : ''}`);
    return;
  }
  const { slug, json } = placeFile(args, places.map((p) => p.slug));
  const file = join(dir, `${slug}.json`);
  if (existsSync(file)) throw new Error(`${file} already exists.`);
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`Wrote content/places/${slug}.json.`);
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const moved = await adopt({ env: process.env, fetch, slug, place: json });
    console.log(`Added ${json.name} to the database and moved ${moved} contribution${moved === 1 ? '' : 's'} to it.`);
  } else {
    console.log('Next: npm run build, run backend/places.sql in Supabase, then move the contributions from the moderate page.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
