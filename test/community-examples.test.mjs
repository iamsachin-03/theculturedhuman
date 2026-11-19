import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { communityFeed, communityCount } from '../tools/lib/templates.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const examples = JSON.parse(read('content/community-examples.json')).examples.map((x) => ({ ...x, placeName: x.place, placePath: `/places/${x.place}.html` }));
const site = { backend: { url: 'https://db.example', anonKey: 'anon' } };

test('empty feeds show examples, labelled as written by us and not by families', () => {
  const html = communityFeed({ site, limit: 6, examples });
  assert.match(html, /written by The Cultured Human, not shared by families/);
  assert.equal((html.match(/class="example-tag">Example</g) || []).length, 3);
  assert.doesNotMatch(html, /Shared by|echo|data-id/);
  assert.match(html, /Pitha for Bihu/);
  assert.doesNotMatch(html, /Thakuma/);
});

test('the word wall shows example words, and a kind shows only that kind', () => {
  const words = communityFeed({ site, kind: 'A word or saying', style: 'words', limit: 30, examples });
  assert.match(words, /ঠাকুমা/);
  assert.doesNotMatch(words, /Pitha/);
  assert.match(communityFeed({ site, kind: 'A song', examples }), /^(?![\s\S]*community-examples)/);
});

test('place pages never show examples', () => {
  assert.doesNotMatch(communityFeed({ site, place: 'assam', examples }), /community-examples|Example/);
});

test('the live count stays hidden until community-live.js fills it in', () => {
  assert.match(communityCount(site), /data-community-count data-url="https:\/\/db\.example" data-key="anon" hidden/);
});

test('the built Commons and home pages carry the examples and entry points', () => {
  const manch = read('public/manch.html');
  const home = read('public/index.html');
  assert.match(manch, /data-community-count/);
  assert.match(manch, /word-chip--example/);
  assert.match(home, /class="hero-commons" href="\/manch\.html"/);
  assert.match(home, /carry-card--example/);
});
