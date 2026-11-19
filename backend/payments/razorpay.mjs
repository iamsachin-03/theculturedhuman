// Online payment for accepted quotes, through Razorpay.
// 1. The family's browser asks createOrder() for an order for its accepted booking (price + platform fee).
// 2. Razorpay Checkout takes the payment in the browser.
// 3. verifyPayment() checks Checkout's signature straight away, and the webhook (handleWebhook) confirms
//    it independently; either marks the booking paid with the payment id. Both are idempotent.
// Without RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET nothing is charged: createOrder() answers
// { dryRun: true } and the app falls back to the moderator emailing a payment link.
import { createHmac, timingSafeEqual } from 'node:crypto';

const RAZORPAY = 'https://api.razorpay.com/v1';

export function config(env) {
  return {
    supabaseUrl: env.SUPABASE_URL,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
  };
}

export class PaymentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function hmac(secret, text) {
  return createHmac('sha256', secret).update(text).digest('hex');
}
export function sameSignature(expected, given) {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(given || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function database(cfg, fetch) {
  if (!cfg.supabaseUrl || !cfg.serviceKey) throw new PaymentError(503, 'Payments are not set up yet.');
  return async (path, opts = {}) => {
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
      method: opts.method || 'GET',
      headers: { apikey: cfg.serviceKey, authorization: `Bearer ${cfg.serviceKey}`, 'content-type': 'application/json', ...(opts.headers || {}) },
      body: opts.json ? JSON.stringify(opts.json) : undefined,
    });
    if (!res.ok) throw new Error(`Database ${res.status}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

async function signedInUser(cfg, fetch, token) {
  if (!token) throw new PaymentError(401, 'Please sign in first.');
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, { headers: { apikey: cfg.serviceKey, authorization: `Bearer ${token}` } });
  if (!res.ok) throw new PaymentError(401, 'Please sign in again.');
  return res.json();
}

const UUID = /^[0-9a-f-]{36}$/i;

/** The family's accepted booking, checked against who is asking. */
async function payableBooking(db, bookingId, userId) {
  if (!UUID.test(String(bookingId || ''))) throw new PaymentError(400, 'Unknown booking.');
  const [b] = await db(`bookings?select=id,status,requested_by,price_paise,platform_fee_paise,payment_order_id,listings(name)&id=eq.${bookingId}`);
  if (!b || b.requested_by !== userId) throw new PaymentError(404, 'Unknown booking.');
  return b;
}

/**
 * An order for an accepted booking. Reuses the booking's order if it already has one.
 * @param {{ token: string, bookingId: string }} req
 */
export async function createOrder(cfg, { fetch, token, bookingId }) {
  const db = database(cfg, fetch);
  const user = await signedInUser(cfg, fetch, token);
  const b = await payableBooking(db, bookingId, user.id);
  if (b.status === 'paid' || b.status === 'completed') throw new PaymentError(409, 'This booking is already paid.');
  if (b.status !== 'accepted' || b.price_paise == null) throw new PaymentError(409, 'Accept the quote first.');
  const amount = Number(b.price_paise) + Number(b.platform_fee_paise || 0);
  const summary = { amount, currency: 'INR', name: (b.listings && b.listings.name) || 'Your booking', email: user.email || '' };
  if (!cfg.keyId || !cfg.keySecret) return { dryRun: true, ...summary };
  let orderId = b.payment_order_id;
  if (!orderId) {
    const res = await fetch(`${RAZORPAY}/orders`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount, currency: 'INR', receipt: `booking-${b.id.slice(0, 8)}`, notes: { booking_id: b.id } }),
    });
    if (!res.ok) throw new PaymentError(502, `Razorpay ${res.status}: ${await res.text()}`);
    orderId = (await res.json()).id;
    await db(`bookings?id=eq.${b.id}`, { method: 'PATCH', json: { payment_order_id: orderId }, headers: { prefer: 'return=minimal' } });
  }
  return { dryRun: false, keyId: cfg.keyId, orderId, testMode: cfg.keyId.startsWith('rzp_test_'), ...summary };
}

async function markPaid(db, orderId, paymentId) {
  const rows = await db(`bookings?payment_order_id=eq.${encodeURIComponent(orderId)}&status=eq.accepted`, {
    method: 'PATCH', json: { status: 'paid', payment_ref: paymentId }, headers: { prefer: 'return=representation' },
  });
  return rows.length > 0;
}

/** Checkout's success handler sends its signature here, so the family sees "paid" straight away. */
export async function verifyPayment(cfg, { fetch, token, bookingId, orderId, paymentId, signature }) {
  if (!cfg.keySecret) throw new PaymentError(503, 'Online payment is not switched on.');
  const db = database(cfg, fetch);
  const user = await signedInUser(cfg, fetch, token);
  const b = await payableBooking(db, bookingId, user.id);
  if (!orderId || b.payment_order_id !== orderId) throw new PaymentError(400, 'This payment is for a different order.');
  if (!sameSignature(hmac(cfg.keySecret, `${orderId}|${paymentId}`), signature)) throw new PaymentError(400, 'The payment could not be verified.');
  const changed = await markPaid(db, orderId, paymentId);
  return { paid: true, changed };
}

/**
 * Razorpay's webhook (order.paid or payment.captured). The raw body must be passed unparsed,
 * because the signature is over the exact bytes.
 */
export async function handleWebhook(cfg, { fetch, body, signature }) {
  if (!cfg.webhookSecret) throw new PaymentError(503, 'RAZORPAY_WEBHOOK_SECRET is not set.');
  if (!sameSignature(hmac(cfg.webhookSecret, body), signature)) throw new PaymentError(401, 'Bad signature.');
  const event = JSON.parse(body);
  const payment = event.payload && event.payload.payment && event.payload.payment.entity;
  if (!['order.paid', 'payment.captured'].includes(event.event) || !payment || !payment.order_id) return { ignored: event.event };
  const changed = await markPaid(database(cfg, fetch), payment.order_id, payment.id);
  return { paid: true, changed };
}

/** Wraps an action for a Web-standard Vercel function: JSON in, JSON out, friendly errors. */
export async function respond(action) {
  try {
    return Response.json(await action());
  } catch (err) {
    if (err instanceof PaymentError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
