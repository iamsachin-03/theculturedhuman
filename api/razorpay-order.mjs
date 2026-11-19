// POST { bookingId } creates (or reuses) a Razorpay order for the signed-in family's accepted booking.
// POST { bookingId, orderId, paymentId, signature } confirms a payment from Razorpay Checkout.
// The family's Supabase access token comes in "Authorization: Bearer <token>".
import { config, createOrder, verifyPayment, respond, PaymentError } from '../backend/payments/razorpay.mjs';

export async function POST(request) {
  return respond(async () => {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    let input;
    try { input = await request.json(); } catch (e) { throw new PaymentError(400, 'Send JSON.'); }
    const cfg = config(process.env);
    if (input.paymentId) return verifyPayment(cfg, { fetch, token, ...input });
    return createOrder(cfg, { fetch, token, bookingId: input.bookingId });
  });
}
