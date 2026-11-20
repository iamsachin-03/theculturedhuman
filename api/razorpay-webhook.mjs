// Razorpay webhook: set its URL to https://<site>/api/razorpay-webhook, with the events
// order.paid and payment.captured, and the same secret as RAZORPAY_WEBHOOK_SECRET.
import { config, handleWebhook, respond } from '../backend/payments/razorpay.mjs';

export async function POST(request) {
  const body = await request.text();
  return respond(() => handleWebhook(config(process.env), { fetch, body, signature: request.headers.get('x-razorpay-signature') }));
}
