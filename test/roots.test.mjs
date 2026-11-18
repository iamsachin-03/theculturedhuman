import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Art = require('../public/scripts/roots-art.js');
const { describe, progressText, depth } = require('../public/scripts/roots.js');
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

const bothSides = {
  me: { label: 'Me', place: 'Bengaluru' },
  sides: [
    { generations: [{ label: 'My mother', place: 'Kolkata' }, { label: "Mother's parents", place: 'Dhaka', years: '1930s' }] },
    { generations: [{ label: 'My father', place: 'Patna' }, { label: "Father's parents", place: '' }, { label: "Father's grandparents", place: 'Darbhanga' }] },
  ],
};

test('every style draws both sides of the family, each place once, in well-formed SVG', () => {
  for (const { id } of Art.STYLES) {
    for (const format of Object.keys(Art.FORMATS)) {
      const svg = Art.render(bothSides, colours, { style: id, format });
      assertWellFormed(svg, `${id}/${format}/sides`);
      for (const place of ['Bengaluru', 'Kolkata', 'Dhaka', 'Patna', 'Darbhanga']) assert.equal(svg.split(`>${place}<`).length, 2, `${id}/${format}: ${place}`);
      assert.match(svg, /MOTHER&#39;S PARENTS · 1930s/, id);
      assert.doesNotMatch(svg, /Add a place to begin/, id);
    }
    const lonely = Art.render({ me: { label: 'Me', place: '' }, sides: [{ generations: [] }, { generations: [] }] }, colours, { style: id });
    assert.match(lonely, /Add a place to begin/, id);
    assertWellFormed(lonely, `${id}/empty sides`);
  }
});

test('each side is capped at four generations', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ label: `G${i}`, place: `Place${i}` }));
  const places = Art.places({ me: { place: 'Home' }, sides: [{ generations: many }, { generations: [] }] }).map((g) => g.place);
  assert.deepEqual(places, ['Home', 'Place0', 'Place1', 'Place2', 'Place3']);
});

test('depth is how far back the deepest place goes, counting gaps and both sides as one', () => {
  assert.equal(depth(bothSides), 4);
  assert.equal(depth({ me: { place: 'Pune' }, sides: [{ generations: [] }, { generations: [] }] }), 1);
  assert.equal(depth(family), 4);
  assert.equal(depth({ generations: [{ place: '' }] }), 0);
  assert.match(describe(bothSides), /^Where I come from: Me, Bengaluru; My mother, Kolkata; Mother's parents, Dhaka \(1930s\); My father, Patna; Father's grandparents, Darbhanga\.$/);
});

test('a saved portrait is cleaned to known fields and capped lengths', () => {
  const messy = {
    name: 'x'.repeat(200), mode: 'sides', extra: '<script>', style: 'nope', palette: 'indigo', format: 'billboard',
    me: { label: 'Me', place: 'Pune', secret: 1 },
    sides: [Array.from({ length: 9 }, () => ({ place: 'Goa' })), 'not a list'],
    generations: 'nonsense',
  };
  const clean = Art.clean(messy);
  assert.deepEqual(Object.keys(clean), ['name', 'mode', 'generations', 'me', 'sides', 'style', 'palette', 'format', 'lang']);
  assert.equal(clean.name.length, 80);
  assert.deepEqual(clean.me, { label: 'Me', place: 'Pune', years: '', detail: '' });
  assert.equal(clean.sides[0].length, Art.MAX_PER_SIDE);
  assert.deepEqual(clean.sides[1], []);
  assert.deepEqual(clean.generations, []);
  assert.deepEqual([clean.style, clean.palette, clean.format], ['roots', 'indigo', 'post']);
  assert.deepEqual(Art.clean(null).mode, 'line');
  assert.deepEqual(Art.fromSaved(messy).sides.map((s) => s.generations.length), [4, 0]);
  assert.deepEqual(Art.fromSaved({ generations: [{ place: 'Agra' }] }), { name: '', generations: [{ label: '', place: 'Agra', years: '', detail: '' }] });
});

test('an invite link carries the whole portrait and who sent it, and nothing else', () => {
  const saved = { name: 'शर्मा परिवार', mode: 'sides', me: { label: 'Me', place: 'Jaipur' }, sides: [[{ label: 'My mother', place: 'Ajmer', years: '1960s', detail: 'taught Urdu' }], []], style: 'river', palette: 'kantha', format: 'story', generations: [{ label: 'Me', place: 'Jaipur' }] };
  const packed = Art.pack(saved, 'Asha');
  assert.match(packed, /^[\w-]+$/);
  const { saved: back, from } = Art.unpack(packed);
  assert.equal(from, 'Asha');
  assert.deepEqual(back, { ...Art.clean(saved), generations: [] });
  const line = Art.unpack(Art.pack({ generations: [{ label: 'Me', place: 'Pune' }] }));
  assert.deepEqual(line.saved.generations, [{ label: 'Me', place: 'Pune', years: '', detail: '' }]);
  assert.equal(line.from, '');
  const full = () => ({ label: 'x'.repeat(60), place: 'y'.repeat(80), years: 'z'.repeat(40), detail: 'w'.repeat(120) });
  const biggest = Art.pack({ name: 'n'.repeat(80), mode: 'sides', me: full(), sides: [[full(), full(), full(), full()], [full(), full(), full(), full()]] }, 'f'.repeat(60));
  assert.ok(biggest.length < 5000, `the largest possible portrait still fits in a link (${biggest.length})`);
  for (const bad of ['', 'not-base64!', Buffer.from('{"v":2}').toString('base64url'), Buffer.from('[1,2]').toString('base64url'), Buffer.from('nope').toString('base64url')]) {
    assert.equal(Art.unpack(bad), null, bad);
  }
});

test('the portrait can be worded in Hindi, without spacing Devanagari letters apart', () => {
  const hi = { generations: [{ label: Art.LABELS.hi.line[0], place: 'जयपुर', years: 'अब' }, { label: Art.LABELS.hi.line[1], place: 'Ajmer' }] };
  for (const { id } of Art.STYLES) {
    const svg = Art.render(hi, colours, { style: id, lang: 'hi' });
    assertWellFormed(svg, `${id}/hi`);
    assert.match(svg, /मेरी जड़ें/, id);
    assert.match(svg, /हर कोई कहीं से आता है · @theculturedhuman/, id);
    assert.doesNotMatch(svg, /Where I come from|Everyone comes from/, id);
    for (const m of svg.matchAll(/<text[^>]*letter-spacing="([^"]+)"[^>]*>(?:<tspan[^>]*>|<textPath[^>]*>)([^<]*)/g)) {
      if (/[\u0900-\u097F]/.test(m[2])) assert.equal(m[1], '0', `${id}: ${m[2]}`);
    }
    const empty = Art.render({ name: 'राव परिवार', generations: [] }, colours, { style: id, lang: 'hi' });
    assert.match(empty, /राव परिवार की जड़ें/, id);
    assert.match(empty, /शुरू करने के लिए एक जगह जोड़ें।/, id);
  }
  assert.match(Art.render(hi, colours, { lang: 'xx' }), /Where I come from/);
  assert.equal(Art.clean({ lang: 'hi' }).lang, 'hi');
  assert.equal(Art.clean({ lang: 'fr' }).lang, 'en');
  assert.equal(Art.unpack(Art.pack({ lang: 'hi' })).saved.lang, 'hi');
  for (const lang of Object.keys(Art.LABELS)) {
    const l = Art.LABELS[lang];
    assert.equal(l.line.length, 4, lang);
    assert.deepEqual(l.sides.map((s) => s.length), [3, 3], lang);
    assert.ok(l.earlier && l.me && l.sideExtra.length === 2, lang);
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
