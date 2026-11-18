import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Art = require('../public/scripts/roots-art.js');
const { describe, progressText } = require('../public/scripts/roots.js');
const colours = { page: '#fff', surface: '#fff', primary: '#000', accent: '#c00', accentInk: '#a00', gold: '#fc0', ink: '#111', muted: '#555', line: '#ddd' };

const family = {
  name: 'the Rao family',
  generations: [
    { label: 'Me', place: 'Pune', years: 'now', detail: 'learning Konkani' },
    { label: 'My parents', place: '' },
    { label: 'My grandparents', place: 'Udupi', years: '1950s', detail: 'ran a small hotel' },
    { label: 'My great-grandparents', place: 'Kundapura', years: '1920s' },
  ],
};

// Tags must nest and close, or the browser refuses to rasterise the download.
function assertWellFormed(svg, where) {
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) stack.push(m[2]);
    else assert.equal(stack.pop(), m[2], `${where}: </${m[2]}> closes the wrong tag`);
  }
  assert.deepEqual(stack, [], `${where}: unclosed tags`);
}

test('the roots portrait shows each place, youngest first, and skips empty generations', () => {
  const svg = Art.render(family, colours);
  assert.match(svg, /^<svg[^>]+viewBox="0 0 1080 1350"/);
  assert.match(svg, /The roots of the Rao family/);
  assert.ok(svg.indexOf('Pune') < svg.indexOf('Udupi'));
  assert.doesNotMatch(svg, /MY PARENTS/);
  assert.match(svg, /MY GRANDPARENTS · 1950s/);
});

test('every style and size draws every place in well-formed SVG', () => {
  for (const { id } of Art.STYLES) {
    for (const format of Object.keys(Art.FORMATS)) {
      const { w, h } = Art.FORMATS[format];
      for (const data of [family, { generations: [] }, { generations: family.generations.slice(0, 1) }]) {
        const svg = Art.render(data, colours, { style: id, format });
        const where = `${id}/${format}/${data.generations.length}`;
        assert.match(svg, new RegExp(`^<svg[^>]+viewBox="0 0 ${w} ${h}"`), where);
        assertWellFormed(svg, where);
        for (const g of Art.places(data)) assert.ok(svg.includes(g.place), `${where}: ${g.place} missing`);
      }
    }
  }
});

test('the river runs from the oldest place down to you', () => {
  const svg = Art.render(family, colours, { style: 'river' });
  assert.ok(svg.indexOf('Kundapura') < svg.indexOf('Udupi') && svg.indexOf('Udupi') < svg.indexOf('Pune'));
});

test('two portraits on one page never share element ids', () => {
  const a = Art.render(family, colours, { style: 'rings', idPrefix: 'a' });
  const b = Art.render(family, colours, { style: 'rings', idPrefix: 'b' });
  const ids = (svg) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids(a).length > 0);
  assert.equal(ids(a).filter((id) => ids(b).includes(id)).length, 0);
});

test('unknown styles, sizes and colours fall back to the defaults', () => {
  assert.equal(Art.render(family, colours, { style: 'nope', format: 'nope' }), Art.render(family, colours));
  assert.equal(Art.styleById('nope').id, 'roots');
  assert.equal(Art.paletteById('nope').id, 'site');
});

test('every fixed palette has all the colours a portrait uses', () => {
  for (const p of Art.PALETTES.filter((x) => x.c)) {
    for (const k of ['page', 'primary', 'accent', 'accentInk', 'gold', 'muted', 'line', 'night', 'nightInk', 'water']) assert.match(p.c[k], /^#[0-9A-F]{6}$/i, `${p.id}.${k}`);
  }
});

test('typed text is escaped in every style, so it cannot inject markup', () => {
  for (const { id } of Art.STYLES) {
    const svg = Art.render({ name: '<b>x</b>', generations: [{ label: 'Me', place: '<script>alert(1)</script>', detail: '"quoted" & more' }, { label: 'My parents', place: 'A&B' }] }, colours, { style: id });
    assert.doesNotMatch(svg, /<script>|<b>/, id);
    assert.match(svg, /&lt;script&gt;/, id);
  }
});

test('an empty portrait invites the reader to begin, and the description says so', () => {
  for (const { id } of Art.STYLES) assert.match(Art.render({ generations: [] }, colours, { style: id }), /Add a place to begin/, id);
  assert.match(describe({ generations: [] }), /Add a place to begin/);
  assert.equal(describe({ generations: [{ label: 'Me', place: 'Kochi' }] }), 'Where I come from: Me, Kochi.');
});

test('the encouragement grows with each generation and stops changing after six', () => {
  const lines = [0, 1, 2, 3, 4, 5, 6].map(progressText);
  assert.equal(new Set(lines).size, 7);
  assert.equal(progressText(9), progressText(6));
});
