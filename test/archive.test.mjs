import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { KINDS, FORMAT, mergeEntries, parseArchive, groupEntries, inviteMessage } = require('../public/scripts/archive.js');
const { matchPlaces } = require('../public/scripts/roots.js');

const entry = (id, kind, createdAt, extra = {}) => ({ id, kind, title: `Entry ${id}`, createdAt, updatedAt: createdAt, ...extra });

test('the archive keeps stories, moments, wisdom, hard days and letters to the future', () => {
  assert.deepEqual(KINDS.map((k) => k.id), ['story', 'memory', 'wisdom', 'steady', 'letter']);
  for (const k of KINDS) assert.ok(k.prompts.length >= 3, k.id);
});

test('merging a relative\'s copy adds new entries and only replaces ones edited later', () => {
  const mine = [entry('a', 'story', '2026-01-01T00:00:00Z'), entry('b', 'wisdom', '2026-01-02T00:00:00Z')];
  const theirs = [
    entry('a', 'story', '2025-12-01T00:00:00Z', { title: 'older copy' }),
    { ...entry('b', 'wisdom', '2026-01-02T00:00:00Z'), title: 'edited', updatedAt: '2026-02-01T00:00:00Z' },
    entry('c', 'letter', '2026-03-01T00:00:00Z'),
  ];
  const { entries, changed } = mergeEntries(mine, theirs);
  assert.deepEqual(changed.map((e) => e.id), ['b', 'c']);
  assert.deepEqual(entries.map((e) => e.id), ['c', 'b', 'a']);
  assert.equal(entries.find((e) => e.id === 'a').title, 'Entry a');
  assert.equal(entries.find((e) => e.id === 'b').title, 'edited');
});

test('a saved copy is validated, and unexpected fields or media types are dropped', () => {
  const json = JSON.stringify({
    format: FORMAT,
    roots: { name: 'x', generations: [{ label: 'Me', place: 'Kochi' }] },
    entries: [
      { ...entry('a', 'memory', '2026-01-01'), photo: 'data:image/png;base64,AAAA', audio: 'javascript:alert(1)', evil: '<b>' },
      { id: 'b', kind: 'not-a-kind', title: 'x' },
      { id: 'c', kind: 'story', title: '   ' },
    ],
  });
  const { roots, entries } = parseArchive(json);
  assert.equal(roots.generations[0].place, 'Kochi');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].photo, 'data:image/png;base64,AAAA');
  assert.equal(entries[0].audio, undefined);
  assert.equal(entries[0].evil, undefined);
  assert.throws(() => parseArchive('{"entries":[]}'), /not a copy of a family archive/);
});

test('the book groups entries by kind, oldest first, skipping empty kinds', () => {
  const groups = groupEntries([entry('b', 'story', '2026-02-01'), entry('l', 'letter', '2026-01-01'), entry('a', 'story', '2026-01-01')]);
  assert.deepEqual(groups.map((g) => g.kind.id), ['story', 'letter']);
  assert.deepEqual(groups[0].entries.map((e) => e.id), ['a', 'b']);
});

test('the invitation tells a relative how to send their stories back', () => {
  assert.match(inviteMessage('https://example.org/archive.html'), /https:\/\/example\.org\/archive\.html[^]*Save a copy/);
});

test('typed places link to place pages by whole words only', () => {
  const places = [{ slug: 'mithila', aliases: ['mithila', 'darbhanga'] }, { slug: 'gujarat', aliases: ['gujarat', 'patan'] }];
  assert.deepEqual(matchPlaces(['A village near Darbhanga', 'Patna', 'darbhanga'], places).map((p) => p.slug), ['mithila']);
  assert.deepEqual(matchPlaces(['Patan, Gujarat'], places).map((p) => p.slug), ['gujarat']);
  assert.deepEqual(matchPlaces(['', undefined], places), []);
});
