import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, createOrder, verifyPayment, handleWebhook, hmac, respond, PaymentError } from '../backend/payments/razorpay.mjs';
import { POST as orderRoute } from '../api/razorpay-order.mjs';
import { POST as webhookRoute } from '../api/razorpay-webhook.mjs';

const BOOKING = '11111111-2222-3333-4444-555555555555';
const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'service', RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'secret', RAZORPAY_WEBHOOK_SECRET: 'hook' };

function fakeFetch({ booking = {}, user = { id: 'family', email: 'fam@example.com' }, razorpayStatus = 200, patched = 1 } = {}) {
  const calls = [];
  const row = { id: BOOKING, status: 'accepted', requested_by: 'family', price_paise: 800000, platform_fee_paise: 80000, payment_order_id: null, listings: { name: 'Sita Devi' }, ...booking };
  const fn = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {} });
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
    if (url.endsWith('/auth/v1/user')) return opts.headers.authorization === 'Bearer good' ? reply(200, user) : reply(401, {});
    if (url.includes('api.razorpay.com/v1/orders')) return reply(razorpayStatus, { id: 'order_123' });
    if (url.includes('/rest/v1/bookings?select=')) return reply(200, [row]);
    if (opts.method === 'PATCH' && url.includes('payment_order_id=eq.')) return reply(200, Array(patched).fill(row));
    if (opts.method === 'PATCH') return reply(204);
    return reply(404, {});
  };
  return { fn, calls };
}

test('without keys nothing is charged: the order is a dry run with the right total', async () => {
  const { fn, calls } = fakeFetch();
  const order = await createOrder(config({ ...env, RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' }), { fetch: fn, token: 'good', bookingId: BOOKING });
  assert.deepEqual(order, { dryRun: true, amount: 880000, currency: 'INR', name: 'Sita Devi', email: 'fam@example.com' });
  assert.ok(!calls.some((c) => c.url.includes('razorpay')));
});

test('an order is created once for the family\'s accepted booking, for the price plus the fee', async () => {
  const { fn, calls } = fakeFetch();
  const order = await createOrder(config(env), { fetch: fn, token: 'good', bookingId: BOOKING });
  assert.equal(order.orderId, 'order_123');
  assert.equal(order.testMode, true);
  const rp = calls.find((c) => c.url.includes('razorpay'));
  assert.deepEqual(rp.body, { amount: 880000, currency: 'INR', receipt: 'booking-11111111', notes: { booking_id: BOOKING } });
  assert.equal(rp.headers.authorization, `Basic ${Buffer.from('rzp_test_abc:secret').toString('base64')}`);
  assert.deepEqual(calls.find((c) => c.method === 'PATCH').body, { payment_order_id: 'order_123' });

  const again = fakeFetch({ booking: { payment_order_id: 'order_old' } });
  assert.equal((await createOrder(config(env), { fetch: again.fn, token: 'good', bookingId: BOOKING })).orderId, 'order_old');
  assert.ok(!again.calls.some((c) => c.url.includes('razorpay')), 'an existing order is reused');
});

test('only the family can pay, only once a quote is accepted, and only once', async () => {
  const cfg = config(env);
  await assert.rejects(createOrder(cfg, { fetch: fakeFetch().fn, token: '', bookingId: BOOKING }), (e) => e.status === 401);
  await assert.rejects(createOrder(cfg, { fetch: fakeFetch().fn, token: 'bad', bookingId: BOOKING }), (e) => e.status === 401);
  await assert.rejects(createOrder(cfg, { fetch: fakeFetch({ user: { id: 'someone-else' } }).fn, token: 'good', bookingId: BOOKING }), (e) => e.status === 404);
  await assert.rejects(createOrder(cfg, { fetch: fakeFetch({ booking: { status: 'quoted' } }).fn, token: 'good', bookingId: BOOKING }), /Accept the quote/);
  await assert.rejects(createOrder(cfg, { fetch: fakeFetch({ booking: { status: 'paid' } }).fn, token: 'good', bookingId: BOOKING }), /already paid/);
  await assert.rejects(createOrder(cfg, { fetch: fakeFetch().fn, token: 'good', bookingId: 'x;drop' }), (e) => e.status === 400);
  await assert.rejects(createOrder(cfg, { fetch: fakeFetch({ razorpayStatus: 500 }).fn, token: 'good', bookingId: BOOKING }), (e) => e.status === 502);
});

test('Checkout\'s signature must match before a booking is marked paid', async () => {
  const cfg = config(env);
  const good = { token: 'good', bookingId: BOOKING, orderId: 'order_123', paymentId: 'pay_9', signature: hmac('secret', 'order_123|pay_9') };
  const { fn, calls } = fakeFetch({ booking: { payment_order_id: 'order_123' } });
  assert.deepEqual(await verifyPayment(cfg, { fetch: fn, ...good }), { paid: true, changed: true });
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.ok(patch.url.includes('payment_order_id=eq.order_123&status=eq.accepted'));
  assert.deepEqual(patch.body, { status: 'paid', payment_ref: 'pay_9' });
  await assert.rejects(verifyPayment(cfg, { fetch: fakeFetch({ booking: { payment_order_id: 'order_123' } }).fn, ...good, signature: 'forged' }), /could not be verified/);
  await assert.rejects(verifyPayment(cfg, { fetch: fakeFetch({ booking: { payment_order_id: 'order_other' } }).fn, ...good }), /different order/);
});

test('the webhook checks Razorpay\'s signature over the raw body, and is safe to repeat', async () => {
  const cfg = config(env);
  const body = JSON.stringify({ event: 'order.paid', payload: { payment: { entity: { id: 'pay_9', order_id: 'order_123' } } } });
  const { fn, calls } = fakeFetch();
  assert.deepEqual(await handleWebhook(cfg, { fetch: fn, body, signature: hmac('hook', body) }), { paid: true, changed: true });
  assert.deepEqual(calls[0].body, { status: 'paid', payment_ref: 'pay_9' });
  assert.deepEqual(await handleWebhook(cfg, { fetch: fakeFetch({ patched: 0 }).fn, body, signature: hmac('hook', body) }), { paid: true, changed: false });
  await assert.rejects(handleWebhook(cfg, { fetch: fn, body, signature: hmac('hook', body + ' ') }), (e) => e.status === 401);
  await assert.rejects(handleWebhook(config({ ...env, RAZORPAY_WEBHOOK_SECRET: '' }), { fetch: fn, body, signature: 'x' }), (e) => e.status === 503);
  const other = JSON.stringify({ event: 'refund.created', payload: {} });
  assert.deepEqual(await handleWebhook(cfg, { fetch: fn, body: other, signature: hmac('hook', other) }), { ignored: 'refund.created' });
});

test('the routes answer JSON with friendly errors', async () => {
  const saved = { ...process.env };
  delete process.env.SUPABASE_URL;
  let res = await orderRoute(new Request('https://site/api/razorpay-order', { method: 'POST', body: JSON.stringify({ bookingId: BOOKING }) }));
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /not set up/);
  res = await orderRoute(new Request('https://site/api/razorpay-order', { method: 'POST', body: 'not json' }));
  assert.equal(res.status, 400);
  process.env.RAZORPAY_WEBHOOK_SECRET = 'hook';
  res = await webhookRoute(new Request('https://site/api/razorpay-webhook', { method: 'POST', body: '{}', headers: { 'x-razorpay-signature': 'nope' } }));
  assert.equal(res.status, 401);
  Object.assign(process.env, saved);
  if (!saved.RAZORPAY_WEBHOOK_SECRET) delete process.env.RAZORPAY_WEBHOOK_SECRET;
  res = await respond(() => { throw new Error('boom'); });
  assert.equal(res.status, 500);
  assert.doesNotMatch(JSON.stringify(await res.json()), /boom/);
  assert.equal((await respond(() => { throw new PaymentError(409, 'x'); })).status, 409);
});
