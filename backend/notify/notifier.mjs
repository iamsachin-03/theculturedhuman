// Emails people when something they are waiting for happens: what they shared was published (or not,
// with the moderator's reason), and each step of a booking. Runs as a daily cron (api/notify.mjs).
// Every email is remembered in notified_status, so nobody is told the same thing twice.
// Without RESEND_API_KEY and EMAIL_FROM it only reports what it would send.

const RESEND = 'https://api.resend.com/emails';
const DAY = 24 * 60 * 60 * 1000;

export function config(env) {
  return {
    supabaseUrl: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    resendKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
    siteUrl: (env.SITE_URL || 'https://theculturedhuman.com').replace(/\/$/, ''),
    // Rows older than this are never emailed about, so turning the notifier on doesn't mail a backlog.
    lookbackDays: Number(env.NOTIFY_LOOKBACK_DAYS || 14),
  };
}

const SIGN_OFF = '\n\nWith thanks,\nThe Cultured Human';

/** The email for a contribution whose status changed, or null when there is nothing to say. */
export function contributionEmail(c, placeName, siteUrl) {
  const where = c.place_slug && placeName ? `the ${placeName} page` : 'The Commons';
  const link = c.place_slug ? `${siteUrl}/places/${c.place_slug}.html` : `${siteUrl}/manch.html`;
  if (c.status === 'published') {
    return {
      subject: `“${c.title}” is now on ${c.place_slug && placeName ? placeName : 'The Commons'}`,
      text: `Thank you for sharing “${c.title}”. It has been read and is now on ${where}:\n${link}\n\n`
        + `Here is its own page, to send to your family:\n${siteUrl}/shared.html?id=${c.id}\n\n`
        + `This week's question is waiting at ${siteUrl}/manch.html#this-week${SIGN_OFF}`,
    };
  }
  if (c.status === 'rejected') {
    return {
      subject: `About “${c.title}”`,
      text: `Thank you for sharing “${c.title}”. We have not published it this time.\n\n`
        + (c.review_note ? `The reason: ${c.review_note}\n\n` : '')
        + `You can change it and send it again from what you have shared:\n${siteUrl}/app.html#/contribute\n\n`
        + `Our community guidelines: ${siteUrl}/community-guidelines.html${SIGN_OFF}`,
    };
  }
  return null;
}

/** The email for a booking whose status changed: who it goes to, and what it says. */
export function bookingEmail(b, listingName, siteUrl) {
  const requests = `${siteUrl}/app.html#/requests`;
  switch (b.status) {
    case 'requested':
      return { to: 'provider', subject: `A new request for ${listingName}`, text: `A family has sent a request to ${listingName}. Read it and reply with your price here:\n${requests}${SIGN_OFF}` };
    case 'quoted':
      return { to: 'family', subject: `${listingName} has replied to your request`, text: `${listingName} has replied with a price. Read it and accept it here:\n${requests}${SIGN_OFF}` };
    case 'accepted':
      return { to: 'provider', subject: `Your quote was accepted`, text: `The family accepted your quote for ${listingName}. You can now see each other's email address here:\n${requests}\n\nWe will email the family a payment link.${SIGN_OFF}` };
    default:
      return null;
  }
}

/**
 * One run. Returns what was sent (or, without an email key or in a dry run, what would be), and what failed.
 * @param {ReturnType<typeof config>} cfg
 * @param {{ fetch: typeof fetch, now?: Date, dryRun?: boolean }} deps
 */
export async function run(cfg, { fetch, now = new Date(), dryRun = false }) {
  if (!cfg.supabaseUrl || !cfg.serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.');
  const live = !dryRun && Boolean(cfg.resendKey && cfg.from);
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
  const since = encodeURIComponent(new Date(now.getTime() - cfg.lookbackDays * DAY).toISOString());

  const contributions = (await db(`place_contributions?select=id,title,place_slug,status,review_note,notified_status,submitted_by&status=in.(published,rejected)&created_at=gte.${since}`))
    .filter((c) => c.notified_status !== c.status);
  const bookings = (await db(`bookings?select=id,status,notified_status,requested_by,listings(name,user_id)&status=in.(requested,quoted,accepted)&created_at=gte.${since}`))
    .filter((b) => b.notified_status !== b.status && b.listings);

  const users = new Set(contributions.map((c) => c.submitted_by));
  for (const b of bookings) { users.add(b.requested_by); users.add(b.listings.user_id); }
  const emails = {};
  if (users.size) for (const r of await db(`contacts?select=user_id,email&user_id=in.(${[...users].join(',')})`)) emails[r.user_id] = r.email;
  const places = {};
  if (contributions.some((c) => c.place_slug)) for (const p of await db('places?select=slug,name')) places[p.slug] = p.name;

  const jobs = [
    ...contributions.map((c) => ({ table: 'place_contributions', row: c, to: emails[c.submitted_by], mail: contributionEmail(c, places[c.place_slug], cfg.siteUrl) })),
    ...bookings.map((b) => {
      const mail = bookingEmail(b, b.listings.name, cfg.siteUrl);
      return { table: 'bookings', row: b, to: emails[mail.to === 'provider' ? b.listings.user_id : b.requested_by], mail };
    }),
  ];

  const sent = [];
  const failed = [];
  const remember = (job) => db(`${job.table}?id=eq.${job.row.id}`, { method: 'PATCH', json: { notified_status: job.row.status }, headers: { prefer: 'return=minimal' } });
  for (const job of jobs) {
    const item = { table: job.table, id: job.row.id, status: job.row.status, to: job.to, subject: job.mail.subject };
    if (!live) { sent.push({ ...item, dryRun: true }); continue; }
    if (!job.to) {
      // Nobody to tell; remember it anyway so it isn't looked at every day.
      await remember(job);
      failed.push({ ...item, reason: 'No email address on file.' });
      continue;
    }
    const res = await fetch(RESEND, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.resendKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to: [job.to], subject: job.mail.subject, text: job.mail.text }),
    });
    if (!res.ok) { failed.push({ ...item, reason: `Email ${res.status}: ${await res.text()}` }); continue; }
    await remember(job);
    sent.push(item);
  }
  return { live, sent, failed };
}
