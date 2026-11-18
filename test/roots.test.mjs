import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { renderRoots, describe } = createRequire(import.meta.url)('../public/scripts/roots.js');
const colours = { page: '#fff', surface: '#fff', primary: '#000', accent: '#c00', accentInk: '#a00', gold: '#fc0', ink: '#111', muted: '#555', line: '#ddd' };

test('the portrait shows each place, youngest first, and skips empty generations', () => {
  const svg = renderRoots({ name: 'the Rao family', generations: [{ label: 'Me', place: 'Pune' }, { label: 'My parents', place: '' }, { label: 'My grandparents', place: 'Udupi', years: '1950s' }] }, colours);
  assert.match(svg, /^<svg[^>]+viewBox="0 0 1080 1350"/);
  assert.match(svg, /The roots of the Rao family/);
  assert.ok(svg.indexOf('Pune') < svg.indexOf('Udupi'));
  assert.doesNotMatch(svg, /MY PARENTS/);
  assert.match(svg, /MY GRANDPARENTS · 1950s/);
});

test('typed text is escaped, so it cannot inject markup', () => {
  const svg = renderRoots({ generations: [{ label: 'Me', place: '<script>alert(1)</script>' }] }, colours);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
});

test('an empty portrait invites the reader to begin, and the description says so', () => {
  assert.match(renderRoots({ generations: [] }, colours), /Add a place to begin/);
  assert.match(describe({ generations: [] }), /Add a place to begin/);
  assert.equal(describe({ generations: [{ label: 'Me', place: 'Kochi' }] }), 'Where I come from: Me, Kochi.');
});
