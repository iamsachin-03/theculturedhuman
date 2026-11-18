import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const core = createRequire(import.meta.url)('../public/scripts/app-core.js');
const { canSee, canAdd, canEdit, legacyNext, legacySeen, legacyReport, newLegacy, question, message, whatsappLink, reminder, mediaKind, audienceLabel, QUESTIONS, KINDS } = core;

const now = new Date('2026-11-18T10:00:00Z');
const people = {
  bina: { id: 'p-bina', role: 'family_edit', name: 'Bina' },
  hari: { id: 'p-hari', role: 'family_view', name: 'Hari' },
  farah: { id: 'p-farah', role: 'beloved', name: 'Farah' },
  gopal: { id: 'p-gopal', role: 'legacy', name: 'Gopal' },
};
const entry = (audience, extra = {}) => ({ owner: 'asha', createdBy: 'asha', audience, audiencePeople: [], ...extra });
const visibleTo = (e, passed) => Object.entries(people).filter(([, p]) => canSee(e, 'u-' + p.id, p, passed, now)).map(([k]) => k);

test('the owner and the author always see an entry; strangers never do', () => {
  assert.ok(canSee(entry('private'), 'asha', null, false, now));
  assert.ok(canSee(entry('private', { createdBy: 'bina' }), 'bina', people.bina, false, now));
  assert.ok(!canSee(entry('family'), 'chetan', null, false, now));
  assert.ok(!canSee(entry('family'), null, null, false, now));
});

test('who sees each audience while the owner is here', () => {
  assert.deepEqual(visibleTo(entry('private'), false), []);
  assert.deepEqual(visibleTo(entry('family'), false), ['bina', 'hari']);
  assert.deepEqual(visibleTo(entry('people', { audiencePeople: ['p-farah'] }), false), ['farah']);
  assert.deepEqual(visibleTo(entry('date', { audiencePeople: ['p-farah'], releaseAt: '2036-01-01' }), false), []);
  assert.deepEqual(visibleTo(entry('date', { audiencePeople: ['p-farah'], releaseAt: '2026-11-17' }), false), ['farah']);
  assert.deepEqual(visibleTo(entry('passed'), false), []);
});

test('after the archive is passed on, heirs receive what was left; "Only me" stays private', () => {
  assert.deepEqual(visibleTo(entry('private'), true), []);
  assert.deepEqual(visibleTo(entry('family'), true), ['bina', 'hari', 'farah', 'gopal']);
  assert.deepEqual(visibleTo(entry('passed'), true), ['bina', 'hari', 'farah', 'gopal']);
  assert.deepEqual(visibleTo(entry('passed', { audiencePeople: ['p-farah'] }), true), ['farah']);
  assert.deepEqual(visibleTo(entry('date', { audiencePeople: ['p-farah'], releaseAt: '2036-01-01' }), true), [], 'future dates still wait');
});

test('only the owner and family who can add may add; only owners and authors may edit', () => {
  assert.ok(canAdd('asha', 'asha', null));
  assert.ok(canAdd('asha', 'u-bina', people.bina));
  assert.ok(!canAdd('asha', 'u-hari', people.hari));
  assert.ok(!canAdd('asha', 'u-farah', people.farah));
  assert.ok(canEdit(entry('family', { createdBy: 'u-bina' }), 'u-bina'));
  assert.ok(!canEdit(entry('family'), 'u-bina'));
});

test('silence leads to reminders, then to asking legacy contacts', () => {
  const l = { ...newLegacy('asha', new Date('2026-01-01T00:00:00Z')), quietMonths: 6 };
  assert.equal(legacyNext(l, new Date('2026-06-30T00:00:00Z')).state, 'active');
  assert.equal(legacyNext(l, new Date('2026-07-02T00:00:00Z')).state, 'checking');
  assert.equal(legacyNext(l, new Date('2026-08-02T00:00:00Z')).state, 'asking');
});

test('a report starts the waiting period; the owner returning cancels it; then it passes', () => {
  let l = newLegacy('asha', now);
  l = legacyReport(l, 'gopal', now);
  assert.equal(l.state, 'reported');
  assert.equal(new Date(l.waitEndsAt).getTime() - now.getTime(), 30 * 86400000);
  assert.equal(legacySeen(l, new Date(now.getTime() + 86400000)).state, 'active', 'signing in cancels');
  const passed = legacyNext(l, new Date(now.getTime() + 31 * 86400000));
  assert.equal(passed.state, 'passed');
  assert.equal(legacySeen(passed, new Date(now.getTime() + 40 * 86400000)).state, 'passed', 'passed stays passed');
  assert.equal(legacyReport(passed, 'gopal', now).state, 'passed');
});

test('a year of weekly questions across every kind', () => {
  assert.equal(QUESTIONS.length, 52);
  assert.equal(new Set(QUESTIONS.map((q) => q[1])).size, 52);
  for (const k of KINDS) assert.ok(QUESTIONS.some((q) => q[0] === k.id), k.id);
  assert.deepEqual(question(52), question(0));
  assert.match(message('Nani', question(0), 'Riya'), /^Nani, this week's question from Riya:\n\nWhich story/);
  assert.equal(whatsappLink('+91 98765-43210', 'a & b?'), 'https://wa.me/919876543210?text=a%20%26%20b%3F');
  const ics = reminder({ id: 'x', name: 'Nana, Sr.', day: 3 }, new Date(2026, 10, 18, 11), 'https://example.org/app.html');
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=WE/);
  assert.match(ics, /DTSTART:20261125T100000/);
  assert.match(ics, /SUMMARY:Send this week's question to Nana\\, Sr\./);
});

test('files are sorted into voice, video, photo and document', () => {
  assert.equal(mediaKind('audio/ogg', 'a.ogg'), 'audio');
  assert.equal(mediaKind('', 'PTT-2026.opus'), 'audio');
  assert.equal(mediaKind('video/mp4', 'v.mp4'), 'video');
  assert.equal(mediaKind('image/jpeg', 'p.jpg'), 'photo');
  assert.equal(mediaKind('application/pdf', 'deed.pdf'), 'document');
});

test('audience labels name the people', () => {
  const list = Object.values(people);
  assert.equal(audienceLabel(entry('people', { audiencePeople: ['p-farah'] }), list), 'Shared with Farah');
  assert.equal(audienceLabel(entry('passed'), list), 'When passed on');
  assert.match(audienceLabel(entry('date', { audiencePeople: ['p-farah'], releaseAt: '2036-01-01' }), list), /^Farah, on 1 January 2036$/);
});

test('a contribution names a place, has a title, words and a credit, within the database limits', () => {
  const c = core.contribution({ placeSlug: 'assam', suggestedPlace: 'ignored', kind: 'A song', title: ' Bihu ', body: 'Sung in April.', credit: 'Anita' });
  assert.deepEqual(c, { placeSlug: 'assam', suggestedPlace: null, kind: 'A song', title: 'Bihu', body: 'Sung in April.', credit: 'Anita' });
  assert.equal(core.contribution({ suggestedPlace: 'Jorhat', kind: 'made up', title: 't', body: 'b', credit: 'c' }).kind, core.CONTRIBUTION_KINDS[0]);
  assert.throws(() => core.contribution({ title: 't', body: 'b', credit: 'c' }), /choose the place/);
  assert.throws(() => core.contribution({ placeSlug: 'assam', body: 'b', credit: 'c' }), /title/);
  assert.throws(() => core.contribution({ placeSlug: 'assam', title: 't', body: 'x'.repeat(5001), credit: 'c' }), /5,000/);
  assert.throws(() => core.contribution({ placeSlug: 'assam', title: 't', body: 'b', credit: '' }), /credited/);
});
