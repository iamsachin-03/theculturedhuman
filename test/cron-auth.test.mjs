import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cronAllowed } from '../backend/cron-auth.mjs';
import notify from '../api/notify.mjs';
import weekly from '../api/weekly-send.mjs';

test('only the exact cron secret is let in', () => {
  assert.equal(cronAllowed('Bearer s3cret-value', 's3cret-value'), true);
  for (const header of [undefined, '', 's3cret-value', 'Bearer s3cret-valu', 'Bearer s3cret-value ', 'bearer s3cret-value', 'Bearer ']) {
    assert.equal(cronAllowed(header, 's3cret-value'), false, String(header));
  }
  assert.equal(cronAllowed('Bearer ', ''), false, 'an unset secret lets no one in');
  assert.equal(cronAllowed('Bearer undefined', undefined), false);
});

test('the cron endpoints refuse a wrong secret before doing anything', async () => {
  const before = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'right';
  try {
    for (const handler of [notify, weekly]) {
      let status;
      const res = { status(s) { status = s; return this; }, json() { return this; } };
      await handler({ headers: { authorization: 'Bearer wrong' }, query: {} }, res);
      assert.equal(status, 401);
    }
  } finally {
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
});
