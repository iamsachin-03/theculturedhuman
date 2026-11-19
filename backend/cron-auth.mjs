// Checks the "Authorization: Bearer <CRON_SECRET>" header Vercel sends to cron jobs.
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s) => createHash('sha256').update(String(s)).digest();

/** True when the header carries the secret. Takes the same time however close a wrong guess is. */
export function cronAllowed(header, secret) {
  if (!secret) return false;
  return timingSafeEqual(digest(header || ''), digest(`Bearer ${secret}`));
}
