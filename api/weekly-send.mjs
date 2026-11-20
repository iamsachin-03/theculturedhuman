// Vercel cron job (see "crons" in vercel.json): once a day, send the weekly questions that are due.
// Vercel calls it with "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
// Add ?dry=1 to see what would be sent without sending.
import { run, config } from '../backend/weekly/sender.mjs';
import { cronAllowed } from '../backend/cron-auth.mjs';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'The weekly sender is not set up yet. See backend/weekly/README.md.' });
  if (!cronAllowed(req.headers.authorization, secret)) return res.status(401).json({ error: 'Not allowed.' });
  try {
    const result = await run(config(process.env), { fetch, now: new Date(), dryRun: req.query && req.query.dry === '1' });
    const summary = { day: result.day, live: result.live, sent: result.sent.length, failed: result.failed };
    console.log(JSON.stringify(summary));
    return res.status(result.failed.length && !result.sent.length ? 500 : 200).json(summary);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
