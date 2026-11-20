import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseArgs, placeFile, adopt, list } from '../tools/new-place.mjs';
import { placeMain, placeCards } from '../tools/lib/templates.mjs';

const core = createRequire(import.meta.url)('../public/scripts/app-core.js');

test('suggestions group by place however they are written, and find the place they belong to', () => {
  const groups = core.groupSuggestions([
    { id: '1', suggestedPlace: 'Udupi', status: 'pending' },
    { id: '2', suggestedPlace: ' udupi, Karnataka', status: 'published' },
    { id: '3', suggestedPlace: 'Jorhat', status: 'published' },
    { id: '4', suggestedPlace: '', status: 'pending' },
  ], [{ slug: 'assam', name: 'Assam', aliases: ['assam', 'jorhat'] }]);
  assert.deepEqual(groups.map((g) => [g.name, g.ids, g.published, g.slug, g.match]), [
    ['Udupi', ['1', '2'], 1, 'udupi', null],
    ['Jorhat', ['3'], 1, 'jorhat', 'assam'],
  ]);
  assert.equal(core.placeSlug('Śrīnagar'), 'srinagar');
});

test('a new place needs a name, a region and where it is, and starts with nothing of ours', () => {
  const args = parseArgs(['--name', 'Udupi', '--region', 'Coastal Karnataka', '--lat', '13.34', '--lng', '74.75', '--aliases', 'Manipal, kaup']);
  const { slug, json } = placeFile(args, ['assam']);
  assert.equal(slug, 'udupi');
  assert.deepEqual(json.aliases, ['udupi', 'manipal', 'kaup']);
  assert.equal(json.startedBy, 'families');
  assert.equal(json.image, undefined, 'no photograph until a licensed one is added');
  assert.deepEqual(json.carries, []);
  assert.match(json.intro, /started by families from Udupi/);
  assert.throws(() => placeFile({ ...args, region: '' }), /region/);
  assert.throws(() => placeFile({ ...args, lat: 'north' }), /lat/);
  assert.throws(() => placeFile(args, ['udupi']), /already exists/);
});

test('adopting adds the place to the database and moves only its suggestions', async () => {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    const ok = (body) => ({ ok: true, status: 200, text: async () => (body ? JSON.stringify(body) : '') });
    if (url.includes('select=id,suggested_place')) return ok([{ id: 'a', suggested_place: 'Udupi' }, { id: 'b', suggested_place: 'manipal, Karnataka' }, { id: 'c', suggested_place: 'Mangalore' }]);
    return ok();
  };
  const { slug, json } = placeFile({ name: 'Udupi', region: 'Coastal Karnataka', lat: 13.34, lng: 74.75, aliases: 'manipal' });
  const moved = await adopt({ env: { SUPABASE_URL: 'https://db', SUPABASE_SERVICE_ROLE_KEY: 'service' }, fetch, slug, place: json });
  assert.equal(moved, 2);
  assert.deepEqual(calls[0].body, { slug: 'udupi', name: 'Udupi', region: 'Coastal Karnataka', lat: 13.34, lng: 74.75 });
  assert.ok(calls[2].url.endsWith('place_contributions?id=in.(a,b)'));
  assert.deepEqual(calls[2].body, { place_slug: 'udupi', suggested_place: null });

  const groups = await list({ env: {}, fetch: async () => ({ ok: true, text: async () => JSON.stringify([{ id: 'x', suggested_place: 'Udupi', status: 'published' }]) }), site: { backend: { url: 'https://db', anonKey: 'anon' } }, places: [] });
  assert.equal(groups[0].name, 'Udupi');
});

test('a page started by families has no photograph or stories of ours, and says so', () => {
  const place = { slug: 'udupi', name: 'Udupi', region: 'Coastal Karnataka', intro: 'Started by families.', startedBy: 'families', carries: [], contributions: [], path: '/places/udupi.html' };
  const html = placeMain({ site: { backend: {} }, place, hero: null, carries: [], people: [], form: '' });
  assert.doesNotMatch(html, /place-hero|A beginning, from our stories/);
  assert.match(html, /started because families from Udupi shared/);
  assert.match(html, /data-community-feed[^>]*data-place="udupi"/);
  const card = placeCards([{ ...place, hero: null }]);
  assert.match(card, /place-card--families/);
  assert.match(card, /Started by families/);
});
