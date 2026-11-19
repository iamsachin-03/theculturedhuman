import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, config, contributionEmail, bookingEmail } from '../backend/notify/notifier.mjs';
import handler from '../api/notify.mjs';

const SITE = 'https://site.example';
const contributions = [
  { id: 'c1', title: 'Sasur', place_slug: 'mithila', status: 'published', review_note: null, notified_status: null, submitted_by: 'u1' },
  { id: 'c2', title: 'Grandma’s lullaby', place_slug: null, status: 'rejected', review_note: 'It names a living person.', notified_status: null, submitted_by: 'u2' },
  { id: 'c3', title: 'Already told', place_slug: 'mithila', status: 'published', review_note: null, notified_status: 'published', submitted_by: 'u1' },
];
const bookings = [
  { id: 'b1', status: 'requested', notified_status: null, requested_by: 'u2', listings: { name: 'Sita Devi', user_id: 'u3' } },
  { id: 'b2', status: 'quoted', notified_status: 'requested', requested_by: 'u2', listings: { name: 'Sita Devi', user_id: 'u3' } },
  { id: 'b3', status: 'accepted', notified_status: null, requested_by: 'u9', listings: { name: 'Sita Devi', user_id: 'u3' } },
];
const contacts = [{ user_id: 'u1', email: 'one@example.com' }, { user_id: 'u2', email: 'two@example.com' }, { user_id: 'u3', email: 'maker@example.com' }];

function fakeFetch({ emailStatus = 200 } = {}) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    const reply = (status, body) => ({ ok: status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
    if (opts.method === 'PATCH') return reply(204);
    if (url.includes('/rest/v1/place_contributions?select=')) return reply(200, contributions);
    if (url.includes('/rest/v1/bookings?select=')) return reply(200, bookings);
    if (url.includes('/rest/v1/contacts')) return reply(200, contacts);
    if (url.includes('/rest/v1/places')) return reply(200, [{ slug: 'mithila', name: 'Mithila' }]);
    if (url.includes('api.resend.com')) return reply(emailStatus, { id: 'email' });
    return reply(404, {});
  };
  return { fn, calls };
}

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'service', RESEND_API_KEY: 'key', EMAIL_FROM: 'The Cultured Human <hello@site.example>', SITE_URL: `${SITE}/` };

test('emails say what happened and where to go next', () => {
  const published = contributionEmail(contributions[0], 'Mithila', SITE);
  assert.match(published.subject, /Sasur.*Mithila/);
  assert.ok(published.text.includes(`${SITE}/places/mithila.html`));
  assert.ok(published.text.includes(`${SITE}/shared.html?id=c1`));
  const rejected = contributionEmail(contributions[1], undefined, SITE);
  assert.ok(rejected.text.includes('The reason: It names a living person.'));
  assert.ok(rejected.text.includes('/community-guidelines.html'));
  assert.equal(contributionEmail({ ...contributions[0], status: 'pending' }, 'Mithila', SITE), null);
  assert.equal(bookingEmail(bookings[0], 'Sita Devi', SITE).to, 'provider');
  assert.equal(bookingEmail(bookings[1], 'Sita Devi', SITE).to, 'family');
  assert.equal(bookingEmail(bookings[2], 'Sita Devi', SITE).to, 'provider');
  assert.equal(bookingEmail({ status: 'paid' }, 'Sita Devi', SITE).to, 'provider');
  assert.equal(bookingEmail({ status: 'completed' }, 'Sita Devi', SITE), null);
});

test('a run emails each change once, to the right person, and remembers it', async () => {
  const { fn, calls } = fakeFetch();
  const result = await run(config(env), { fetch: fn, now: new Date('2026-11-18T03:00:00Z') });
  assert.equal(result.live, true);
  assert.deepEqual(result.sent.map((s) => [s.id, s.to]), [
    ['c1', 'one@example.com'], ['c2', 'two@example.com'], ['b1', 'maker@example.com'], ['b2', 'two@example.com'], ['b3', 'maker@example.com'],
  ]);
  assert.equal(result.failed.length, 0);
  const emails = calls.filter((c) => c.url.includes('resend'));
  assert.equal(emails.length, 5);
  assert.deepEqual(emails[0].body.to, ['one@example.com']);
  assert.equal(emails[0].body.from, env.EMAIL_FROM);
  const patches = calls.filter((c) => c.method === 'PATCH');
  assert.deepEqual(patches.map((p) => [p.url.split('/rest/v1/')[1], p.body.notified_status]), [
    ['place_contributions?id=eq.c1', 'published'], ['place_contributions?id=eq.c2', 'rejected'],
    ['bookings?id=eq.b1', 'requested'], ['bookings?id=eq.b2', 'quoted'], ['bookings?id=eq.b3', 'accepted'],
  ]);
  assert.ok(calls[0].url.includes('created_at=gte.2026-11-04'), 'only the last two weeks are looked at');
});

test('without an email key nothing is sent or remembered; failed emails are retried tomorrow', async () => {
  const dry = fakeFetch();
  const preview = await run(config({ ...env, RESEND_API_KEY: '' }), { fetch: dry.fn });
  assert.equal(preview.live, false);
  assert.equal(preview.sent.length, 5);
  assert.ok(!dry.calls.some((c) => c.method !== 'GET'));

  const broken = fakeFetch({ emailStatus: 500 });
  const result = await run(config(env), { fetch: broken.fn });
  assert.equal(result.sent.length, 0);
  assert.equal(result.failed.length, 5);
  assert.ok(!broken.calls.some((c) => c.method === 'PATCH'));
});

test('the cron endpoint needs its secret', async () => {
  const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  delete process.env.CRON_SECRET;
  assert.equal((await handler({ headers: {} }, res())).code, 503);
  process.env.CRON_SECRET = 'shh';
  assert.equal((await handler({ headers: { authorization: 'Bearer nope' } }, res())).code, 401);
  delete process.env.CRON_SECRET;
});
