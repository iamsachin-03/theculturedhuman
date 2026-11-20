import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

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

test('a contribution names a place, has a title, words, a credit and consent, within the database limits', () => {
  const ok = { placeSlug: 'assam', title: 't', body: 'b', credit: 'c', consent: true };
  const c = core.contribution({ placeSlug: 'assam', suggestedPlace: 'ignored', kind: 'A song', title: ' Bihu ', body: 'Sung in April.', credit: 'Anita', script: 'ignored', promptWeek: 3, consent: true });
  assert.deepEqual(c, { placeSlug: 'assam', suggestedPlace: null, kind: 'A song', title: 'Bihu', body: 'Sung in April.', credit: 'Anita', script: null, pronunciation: null, promptWeek: 3, consent: true });
  assert.equal(core.contribution({ suggestedPlace: 'Jorhat', kind: 'made up', title: 't', body: 'b', credit: 'c', consent: true }).kind, core.CONTRIBUTION_KINDS[0]);
  const word = core.contribution({ ...ok, kind: 'A word or saying', script: ' ਨਾਨੀ ', pronunciation: 'NAA-nee', promptWeek: 'x' });
  assert.deepEqual([word.script, word.pronunciation, word.promptWeek], ['ਨਾਨੀ', 'NAA-nee', null]);
  assert.throws(() => core.contribution({ ...ok, consent: false }), /yours to share/);
  assert.throws(() => core.contribution({ ...ok, consent: 'yes' }), /yours to share/);
  assert.throws(() => core.contribution({ ...ok, kind: 'A word or saying', script: 'x'.repeat(121) }), /own script/);
  assert.throws(() => core.contribution({ ...ok, placeSlug: '' }), /choose the place/);
  assert.throws(() => core.contribution({ ...ok, title: '' }), /title/);
  assert.throws(() => core.contribution({ ...ok, body: 'x'.repeat(5001) }), /5,000/);
  assert.throws(() => core.contribution({ ...ok, credit: '' }), /credited/);
});

test('reports need a known reason, and a note when the reason needs explaining', () => {
  assert.deepEqual(core.report({ reason: 'spam', note: ' ' }), { reason: 'spam', note: null });
  assert.deepEqual(core.report({ reason: 'wrong', note: 'It means uncle' }), { reason: 'wrong', note: 'It means uncle' });
  assert.throws(() => core.report({ reason: 'wrong' }), /a little more/);
  assert.throws(() => core.report({ reason: 'because' }), /what is wrong/);
  const schema = readFileSync(new URL('../backend/schema.sql', import.meta.url), 'utf8');
  const inSchema = schema.match(/reason text not null check \(reason in \(([^)]*)\)\)/)[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(core.REPORT_REASONS.map((r) => r.id), inSchema, 'the same reasons as the database');
  assert.equal(core.reviewNote('  '), null);
  assert.throws(() => core.reviewNote('x'.repeat(301)), /300/);
});

test('listings need a role, a place, a name and a description, and links must be https', () => {
  const ok = core.listing({ role: 'host', placeSlug: 'mithila', name: ' Ravi ', summary: 'Village walks', languages: 'Maithili, Hindi,, ', priceNote: 'From ₹2,500 a day' });
  assert.deepEqual(ok, { role: 'host', placeSlug: 'mithila', name: 'Ravi', summary: 'Village walks', languages: ['Maithili', 'Hindi'], link: null, priceNote: 'From ₹2,500 a day' });
  assert.throws(() => core.listing({ ...ok, role: 'seller' }), /what you offer/);
  assert.throws(() => core.listing({ ...ok, placeSlug: '' }), /place/);
  assert.throws(() => core.listing({ ...ok, link: 'http://example.com' }), /https/);
  assert.throws(() => core.listing({ ...ok, summary: 'x'.repeat(601) }), /600/);
});

test('quotes are typed in rupees and kept in paise, with the fee added on top', () => {
  assert.deepEqual(core.quote({ rupees: '₹8,000', reply: ' Two weeks ' }), { pricePaise: 800000, reply: 'Two weeks' });
  assert.equal(core.quote({ rupees: '1250.5' }).pricePaise, 125050);
  assert.throws(() => core.quote({ rupees: '0' }), /price/);
  assert.throws(() => core.quote({ rupees: 'eight' }), /price/);
  assert.equal(core.platformFee(800000, 10), 80000);
  assert.equal(core.platformFee(125055, 10), 12506);
  assert.equal(core.formatRupees(880000), '₹8,800');
  assert.equal(core.formatRupees(12345678), '₹1,23,456.78');
  assert.throws(() => core.bookingMessage('  '), /what you would like/);
});

test('upcoming birthdays and festivals come soonest first, and only within the window', () => {
  const today = new Date(2026, 11, 20);
  const list = core.upcoming(today, [{ name: 'Nani', birthday: '12-23' }, { name: 'Dada', birthday: '' }], 21);
  assert.deepEqual(list.map((x) => [x.name, x.days]), [['Nani\u2019s birthday', 3], ['Christmas', 5]]);
  const jan = core.upcoming(new Date(2027, 0, 1), [], 21);
  assert.deepEqual(jan.map((x) => [x.name, x.days]), [['Makar Sankranti, Pongal and Magh Bihu', 13]]);
  assert.equal(core.upcoming(new Date(2027, 2, 15), [], 10)[0].name, 'Holi', 'moon festivals use the next listed date');
  assert.deepEqual(core.upcoming(new Date(2026, 11, 20), [{ name: 'Nani', birthday: '12-19' }], 21).filter((x) => x.kind === 'birthday'), [], 'a birthday just passed waits for next year');
  for (const o of core.OCCASIONS) {
    assert.ok(o.question.endsWith('?'), o.name);
    if (o.dates) for (const d of o.dates) assert.match(d, /^\d{4}-\d{2}-\d{2}$/, o.name);
    else assert.match(o.md, /^\d{2}-\d{2}$/, o.name);
  }
});

test('every festival that follows the moon has dates listed at least a year ahead', () => {
  const yearAhead = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  for (const o of core.OCCASIONS.filter((x) => x.dates)) {
    assert.ok(o.dates.every((d, i) => /^\d{4}-\d{2}-\d{2}$/.test(d) && (i === 0 || d > o.dates[i - 1])), `${o.name} dates are in order`);
    assert.ok(o.dates.at(-1) >= yearAhead, `${o.name} needs dates beyond ${o.dates.at(-1)}: add the next years to OCCASIONS in app-core.js`);
  }
});
