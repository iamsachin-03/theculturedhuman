import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { QUESTIONS, question, message, whatsappLink, reminder, newElder, advance } = require('../public/scripts/weekly.js');
const { KINDS } = require('../public/scripts/archive.js');

test('a year of questions, each filed under a kind the archive knows', () => {
  assert.equal(QUESTIONS.length, 52);
  const kinds = new Set(KINDS.map((k) => k.id));
  for (const [kind, text] of QUESTIONS) assert.ok(kinds.has(kind) && /[?.]$/.test(text), text);
  assert.equal(new Set(QUESTIONS.map((q) => q[1])).size, 52, 'no question repeats');
  for (const k of kinds) assert.ok(QUESTIONS.some((q) => q[0] === k), `${k} is asked at least once`);
});

test('questions run in order and start again after a year', () => {
  assert.equal(question(0).week, 1);
  assert.equal(question(51).week, 52);
  assert.deepEqual(question(52), question(0));
});

test('the message greets the elder, asks the question and invites a voice note', () => {
  const text = message({ name: 'Nani' }, question(0), 'Riya');
  assert.match(text, /^Nani, this week's question from Riya:/);
  assert.match(text, /Which story did you love to hear/);
  assert.match(text, /voice note/);
});

test('the WhatsApp link keeps only the digits of the number and encodes the message', () => {
  assert.equal(whatsappLink('+91 98765-43210', 'a & b?'), 'https://wa.me/919876543210?text=a%20%26%20b%3F');
  assert.equal(whatsappLink('', 'hi'), 'https://wa.me/?text=hi');
});

test('the calendar reminder repeats weekly on the chosen day, starting after now', () => {
  const elder = newElder({ name: 'Nana, Sr.', day: 3 }, new Date(2026, 10, 18, 9));
  const ics = reminder(elder, new Date(2026, 10, 18, 11), 'https://example.org/archive.html#weekly');
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=WE/);
  assert.match(ics, /DTSTART:20261125T100000/, 'today at 11am is past 10am, so the first reminder is next Wednesday');
  assert.match(ics, /SUMMARY:Send this week's question to Nana\\, Sr\./);
  assert.ok(ics.split('\r\n').length > 10);
});

test('answering counts towards the year; skipping moves on without counting', () => {
  let e = newElder({ name: 'Nani', day: 0 }, new Date());
  e = advance({ ...e, askedAt: 'x' }, true);
  e = advance(e, false);
  assert.equal(e.index, 2);
  assert.equal(e.answered, 1);
  assert.equal(e.askedAt, null);
});
