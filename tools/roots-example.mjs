#!/usr/bin/env node
// Writes public/brand/roots-example.svg: a sample "Trace your roots" portrait, drawn with the
// same renderer as the page and the Haldi palette. The family in it is invented.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const Art = createRequire(import.meta.url)(join(ROOT, 'public/scripts/roots-art.js'));
const haldi = Art.paletteById('haldi').c;

const example = {
  name: '',
  generations: [
    { label: 'Me', place: 'Bengaluru', years: 'now', detail: "learning my grandmother's recipes" },
    { label: 'My parents', place: 'Patna', years: '1980s', detail: "met at a cousin's wedding" },
    { label: 'My grandparents', place: 'Darbhanga', years: '1950s', detail: 'painted the walls for every wedding' },
    { label: 'My great-grandparents', place: 'A village near Madhubani', years: '1920s', detail: 'farmed, and sang in Maithili' },
  ],
};

writeFileSync(join(ROOT, 'public/brand/roots-example.svg'), Art.render(example, haldi, { style: 'roots', idPrefix: 'ex' }) + '\n');
console.log('Wrote public/brand/roots-example.svg');
