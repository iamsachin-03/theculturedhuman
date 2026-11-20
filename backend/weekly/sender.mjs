// Sends each person's weekly question on WhatsApp, for the family members who switched on
// "send it for me" and said that person agreed. Runs once a day (api/weekly-send.mjs, a Vercel
// cron job). backend/weekly/README.md explains the setup: a WhatsApp Business number, an approved
// message template, and the environment variables below. Without the WhatsApp ones it only
// reports what it would send.
import { createRequire } from 'node:module';

const core = createRequire(import.meta.url)('../../public/scripts/app-core.js');

const GRAPH = 'https://graph.facebook.com/v21.0';

/** The weekday (0 = Sunday) at `now` in the given IANA time zone. */
export function weekdayIn(timeZone, now) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** Digits only, with the country code; a bare 10-digit number gets the default country code. */
export function phoneDigits(phone, defaultCountry) {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^00/, '');
  if (digits.length === 10 && defaultCountry) return defaultCountry + digits;
  return digits.length >= 11 && digits.length <= 15 ? digits : '';
}

/**
 * Who gets a question today: switched on, today is their day, a usable number, and no question
 * already waiting for an answer (asked_at is cleared when the family member marks it answered
 * or skipped).
 */
export function dueToday(rows, today) {
  return rows.filter((r) => r.auto_send && r.day === today && !r.asked_at && r.phone);
}

/** The template's three parameters, in order: their name, who it is from, the question. */
export function templateParams(row, ownerName) {
  const from = (row.sign_as || String(ownerName || '').split(/\s+/)[0] || 'your family').trim();
  const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
  return [clean(row.name), clean(from), clean(core.question(row.idx).text)];
}

export function config(env) {
  return {
    supabaseUrl: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    token: env.WHATSAPP_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    template: env.WHATSAPP_TEMPLATE || 'weekly_question',
    templateLang: env.WHATSAPP_TEMPLATE_LANG || 'en',
    timeZone: env.WEEKLY_TIMEZONE || 'Asia/Kolkata',
    defaultCountry: env.WEEKLY_DEFAULT_COUNTRY ?? '91',
  };
}

/**
 * One day's run. Returns what was sent (or, in a dry run, what would be), and what failed.
 * @param {ReturnType<typeof config>} cfg
 * @param {{ fetch: typeof fetch, now: Date, dryRun?: boolean }} deps
 */
export async function run(cfg, { fetch, now, dryRun = false }) {
  if (!cfg.supabaseUrl || !cfg.serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.');
  const live = !dryRun && Boolean(cfg.token && cfg.phoneNumberId);
  const db = async (path, opts = {}) => {
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: { apikey: cfg.serviceKey, authorization: `Bearer ${cfg.serviceKey}`, 'content-type': 'application/json', ...(opts.headers || {}) },
      body: opts.json ? JSON.stringify(opts.json) : undefined,
    });
    if (!res.ok) throw new Error(`Database ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  const today = weekdayIn(cfg.timeZone, now);
  const rows = dueToday(await db(`weekly_elders?select=id,owner_id,name,phone,day,idx,sign_as,asked_at,auto_send&auto_send=is.true&day=eq.${today}&asked_at=is.null`), today);
  const owners = [...new Set(rows.map((r) => r.owner_id))];
  const names = {};
  if (owners.length) {
    for (const p of await db(`profiles?select=id,display_name&id=in.(${owners.join(',')})`)) names[p.id] = p.display_name;
  }

  const sent = [];
  const failed = [];
  for (const row of rows) {
    const to = phoneDigits(row.phone, cfg.defaultCountry);
    const params = templateParams(row, names[row.owner_id]);
    if (!to) { failed.push({ id: row.id, reason: 'The WhatsApp number is not a full international number.' }); continue; }
    if (!live) { sent.push({ id: row.id, to, params, dryRun: true }); continue; }
    const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: cfg.template, language: { code: cfg.templateLang }, components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] },
      }),
    });
    if (!res.ok) { failed.push({ id: row.id, reason: `WhatsApp ${res.status}: ${await res.text()}` }); continue; }
    await db(`weekly_elders?id=eq.${row.id}`, { method: 'PATCH', json: { asked_at: now.toISOString() }, headers: { prefer: 'return=minimal' } });
    sent.push({ id: row.id, to, params });
  }
  return { day: today, live, sent, failed };
}
