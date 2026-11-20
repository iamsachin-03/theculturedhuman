import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { run, config, weekdayIn, phoneDigits, dueToday, templateParams } from '../backend/weekly/sender.mjs';
import handler from '../api/weekly-send.mjs';

const core = createRequire(import.meta.url)('../public/scripts/app-core.js');
// 18 Nov 2026 is a Wednesday in India; at 20:00 UTC on the 17th it is already Wednesday there.
const NOW = new Date('2026-11-17T20:00:00Z');
const WED = 3;

const rows = [
  { id: 'e1', owner_id: 'u1', name: 'Nani', phone: '+91 98450 12345', day: WED, idx: 0, sign_as: 'Asha', asked_at: null, auto_send: true },
  { id: 'e2', owner_id: 'u2', name: 'Dada', phone: '9845012345', day: WED, idx: 3, sign_as: '', asked_at: null, auto_send: true },
  { id: 'e3', owner_id: 'u1', name: 'Mama', phone: '12', day: WED, idx: 1, sign_as: 'Asha', asked_at: null, auto_send: true },
];

function fakeFetch({ whatsappStatus = 200 } = {}) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    const reply = (status, body) => ({ ok: status < 300, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
    if (url.includes('/rest/v1/weekly_elders?select=')) return reply(200, rows);
    if (url.includes('/rest/v1/profiles')) return reply(200, [{ id: 'u2', display_name: 'Ravi Kumar' }]);
    if (url.includes('graph.facebook.com')) return reply(whatsappStatus, { messages: [{ id: 'wamid' }] });
    if (opts.method === 'PATCH') return reply(204);
    return reply(404, {});
  };
  return { fn, calls };
}

const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'service', WHATSAPP_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: '555' };

test('the day is counted in India time, and numbers need a country code', () => {
  assert.equal(weekdayIn('Asia/Kolkata', NOW), WED);
  assert.equal(weekdayIn('UTC', NOW), 2);
  assert.equal(phoneDigits('+91 98450-12345', '91'), '919845012345');
  assert.equal(phoneDigits('9845012345', '91'), '919845012345');
  assert.equal(phoneDigits('0044 7700 900123', '91'), '447700900123');
  assert.equal(phoneDigits('9845012345', ''), '');
  assert.equal(phoneDigits('12', '91'), '');
});

test('only switched-on people whose day it is, with no question waiting, are due', () => {
  const due = dueToday([
    ...rows,
    { ...rows[0], id: 'off', auto_send: false },
    { ...rows[0], id: 'waiting', asked_at: '2026-11-11T05:00:00Z' },
    { ...rows[0], id: 'tomorrow', day: 4 },
    { ...rows[0], id: 'nophone', phone: '' },
  ], WED);
  assert.deepEqual(due.map((r) => r.id), ['e1', 'e2', 'e3']);
});

test('the template gets their name, who it is from and the question, on one line each', () => {
  assert.deepEqual(templateParams(rows[0], 'Asha Rao'), ['Nani', 'Asha', core.question(0).text]);
  assert.deepEqual(templateParams(rows[1], 'Ravi Kumar'), ['Dada', 'Ravi', core.question(3).text]);
  assert.equal(templateParams({ ...rows[1], name: 'Big\n  Dada' }, '')[1], 'your family');
  assert.equal(templateParams({ ...rows[1], name: 'Big\n  Dada' }, '')[0], 'Big Dada');
});

test('a live run sends the template, marks each person asked, and reports bad numbers', async () => {
  const { fn, calls } = fakeFetch();
  const result = await run(config(env), { fetch: fn, now: NOW });
  assert.equal(result.live, true);
  assert.deepEqual(result.sent.map((s) => [s.id, s.to]), [['e1', '919845012345'], ['e2', '919845012345']]);
  assert.deepEqual(result.failed.map((f) => f.id), ['e3']);
  const sends = calls.filter((c) => c.url.includes('graph.facebook.com'));
  assert.equal(sends.length, 2);
  assert.equal(sends[0].url, 'https://graph.facebook.com/v21.0/555/messages');
  assert.equal(sends[0].headers.authorization, 'Bearer token');
  assert.deepEqual(sends[1].body.template, { name: 'weekly_question', language: { code: 'en' }, components: [{ type: 'body', parameters: ['Dada', 'Ravi', core.question(3).text].map((text) => ({ type: 'text', text })) }] });
  const marks = calls.filter((c) => c.method === 'PATCH');
  assert.deepEqual(marks.map((m) => [m.url.split('id=eq.')[1], m.body.asked_at]), [['e1', NOW.toISOString()], ['e2', NOW.toISOString()]]);
  assert.ok(calls[0].url.includes('auto_send=is.true') && calls[0].url.includes('day=eq.3') && calls[0].url.includes('asked_at=is.null'));
});

test('without WhatsApp details, or when asked for a dry run, nothing is sent or marked', async () => {
  for (const [cfg, opts] of [[config({ ...env, WHATSAPP_TOKEN: '' }), {}], [config(env), { dryRun: true }]]) {
    const { fn, calls } = fakeFetch();
    const result = await run(cfg, { fetch: fn, now: NOW, ...opts });
    assert.equal(result.live, false);
    assert.equal(result.sent.length, 2);
    assert.ok(result.sent.every((s) => s.dryRun));
    assert.ok(!calls.some((c) => c.url.includes('graph.facebook.com') || c.method === 'PATCH'));
  }
});

test('a WhatsApp refusal is reported and the person is not marked asked', async () => {
  const { fn, calls } = fakeFetch({ whatsappStatus: 400 });
  const result = await run(config(env), { fetch: fn, now: NOW });
  assert.equal(result.sent.length, 0);
  assert.equal(result.failed.length, 3);
  assert.ok(!calls.some((c) => c.method === 'PATCH'));
});

test('the cron endpoint refuses anyone without the secret', async () => {
  const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
  const saved = { ...process.env };
  try {
    delete process.env.CRON_SECRET;
    let r = res(); await handler({ headers: {}, query: {} }, r); assert.equal(r.code, 503);
    process.env.CRON_SECRET = 'cron';
    r = res(); await handler({ headers: { authorization: 'Bearer wrong' }, query: {} }, r); assert.equal(r.code, 401);
    delete process.env.SUPABASE_URL;
    r = res(); await handler({ headers: { authorization: 'Bearer cron' }, query: {} }, r); assert.equal(r.code, 500);
    assert.match(r.body.error, /SUPABASE_URL/);
  } finally {
    process.env = saved;
  }
});
