// Vercel cron job (see "crons" in vercel.json): once a day, email people about what changed for them.
// Vercel calls it with "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
// Add ?dry=1 to see what would be sent without sending.
import { run, config } from '../backend/notify/notifier.mjs';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'The notifier is not set up yet. See backend/README.md.' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Not allowed.' });
  try {
    const result = await run(config(process.env), { fetch, now: new Date(), dryRun: req.query && req.query.dry === '1' });
    const summary = { live: result.live, sent: result.sent.length, failed: result.failed };
    console.log(JSON.stringify(summary));
    return res.status(result.failed.length && !result.sent.length ? 500 : 200).json(summary);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
