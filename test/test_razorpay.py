import base64
import json
import subprocess
import unittest

from support import FakeHttp, call_wsgi, env, load_api
from backend.payments.razorpay import PaymentError, config, create_order, handle_webhook, hmac, respond, verify_payment

BOOKING = '11111111-2222-3333-4444-555555555555'
ENV = {'SUPABASE_URL': 'https://db.example', 'SUPABASE_SERVICE_ROLE_KEY': 'service', 'RAZORPAY_KEY_ID': 'rzp_test_abc', 'RAZORPAY_KEY_SECRET': 'secret', 'RAZORPAY_WEBHOOK_SECRET': 'hook'}


def fake(booking=None, user=None, razorpay_status=200, patched=1):
    row = {'id': BOOKING, 'status': 'accepted', 'requested_by': 'family', 'price_paise': 800000, 'platform_fee_paise': 80000, 'payment_order_id': None, 'listings': {'name': 'Sita Devi'}, **(booking or {})}
    user = user or {'id': 'family', 'email': 'fam@example.com'}

    def route(url, method, headers, body):
        if url.endswith('/auth/v1/user'):
            return (200, user) if headers.get('authorization') == 'Bearer good' else (401, {})
        if 'api.razorpay.com/v1/orders' in url:
            return razorpay_status, {'id': 'order_123'}
        if '/rest/v1/bookings?select=' in url:
            return 200, [row]
        if method == 'PATCH' and 'payment_order_id=eq.' in url:
            return 200, [row] * patched
        if method == 'PATCH':
            return 204, None
        return 404, {}
    return FakeHttp(route)


class Razorpay(unittest.TestCase):
    def assertPaymentError(self, status, fn, message=None):
        with self.assertRaises(PaymentError) as caught:
            fn()
        self.assertEqual(caught.exception.status, status)
        if message:
            self.assertRegex(str(caught.exception), message)

    def test_without_keys_nothing_is_charged_and_the_total_is_right(self):
        http = fake()
        order = create_order(config({**ENV, 'RAZORPAY_KEY_ID': '', 'RAZORPAY_KEY_SECRET': ''}), http, 'good', BOOKING)
        self.assertEqual(order, {'dryRun': True, 'amount': 880000, 'currency': 'INR', 'name': 'Sita Devi', 'email': 'fam@example.com'})
        self.assertFalse(any('razorpay' in c['url'] for c in http.calls))

    def test_an_order_is_created_once_for_the_price_plus_the_fee(self):
        http = fake()
        order = create_order(config(ENV), http, 'good', BOOKING)
        self.assertEqual(order['orderId'], 'order_123')
        self.assertTrue(order['testMode'])
        rp = next(c for c in http.calls if 'razorpay' in c['url'])
        self.assertEqual(rp['body'], {'amount': 880000, 'currency': 'INR', 'receipt': 'booking-11111111', 'notes': {'booking_id': BOOKING}})
        self.assertEqual(rp['headers']['authorization'], 'Basic ' + base64.b64encode(b'rzp_test_abc:secret').decode())
        self.assertEqual(next(c for c in http.calls if c['method'] == 'PATCH')['body'], {'payment_order_id': 'order_123'})

        again = fake(booking={'payment_order_id': 'order_old'})
        self.assertEqual(create_order(config(ENV), again, 'good', BOOKING)['orderId'], 'order_old')
        self.assertFalse(any('razorpay' in c['url'] for c in again.calls), 'an existing order is reused')

    def test_only_the_family_can_pay_only_once_a_quote_is_accepted_and_only_once(self):
        cfg = config(ENV)
        self.assertPaymentError(401, lambda: create_order(cfg, fake(), '', BOOKING))
        self.assertPaymentError(401, lambda: create_order(cfg, fake(), 'bad', BOOKING))
        self.assertPaymentError(404, lambda: create_order(cfg, fake(user={'id': 'someone-else'}), 'good', BOOKING))
        self.assertPaymentError(409, lambda: create_order(cfg, fake(booking={'status': 'quoted'}), 'good', BOOKING), 'Accept the quote')
        self.assertPaymentError(409, lambda: create_order(cfg, fake(booking={'status': 'paid'}), 'good', BOOKING), 'already paid')
        self.assertPaymentError(400, lambda: create_order(cfg, fake(), 'good', 'x;drop'))
        self.assertPaymentError(502, lambda: create_order(cfg, fake(razorpay_status=500), 'good', BOOKING))

    def test_checkouts_signature_must_match_before_a_booking_is_marked_paid(self):
        cfg = config(ENV)
        good = dict(token='good', booking_id=BOOKING, order_id='order_123', payment_id='pay_9', signature=hmac('secret', 'order_123|pay_9'))
        http = fake(booking={'payment_order_id': 'order_123'})
        self.assertEqual(verify_payment(cfg, http, **good), {'paid': True, 'changed': True})
        patch = next(c for c in http.calls if c['method'] == 'PATCH')
        self.assertIn('payment_order_id=eq.order_123&status=eq.accepted', patch['url'])
        self.assertEqual(patch['body'], {'status': 'paid', 'payment_ref': 'pay_9'})
        self.assertPaymentError(400, lambda: verify_payment(cfg, fake(booking={'payment_order_id': 'order_123'}), **{**good, 'signature': 'forged'}), 'could not be verified')
        self.assertPaymentError(400, lambda: verify_payment(cfg, fake(booking={'payment_order_id': 'order_other'}), **good), 'different order')

    def test_the_webhook_checks_the_signature_over_the_raw_body_and_is_safe_to_repeat(self):
        cfg = config(ENV)
        body = json.dumps({'event': 'order.paid', 'payload': {'payment': {'entity': {'id': 'pay_9', 'order_id': 'order_123'}}}}).encode()
        http = fake()
        self.assertEqual(handle_webhook(cfg, http, body, hmac('hook', body)), {'paid': True, 'changed': True})
        self.assertEqual(http.calls[0]['body'], {'status': 'paid', 'payment_ref': 'pay_9'})
        self.assertEqual(handle_webhook(cfg, fake(patched=0), body, hmac('hook', body)), {'paid': True, 'changed': False})
        self.assertPaymentError(401, lambda: handle_webhook(cfg, http, body, hmac('hook', body + b' ')))
        self.assertPaymentError(503, lambda: handle_webhook(config({**ENV, 'RAZORPAY_WEBHOOK_SECRET': ''}), http, body, 'x'))
        other = json.dumps({'event': 'refund.created', 'payload': {}}).encode()
        self.assertEqual(handle_webhook(cfg, http, other, hmac('hook', other)), {'ignored': 'refund.created'})

    def test_signatures_are_the_same_hex_hmac_node_computed(self):
        script = "const c=require('crypto');console.log(c.createHmac('sha256','secret').update('order_123|pay_9').digest('hex'))"
        node = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True).stdout.strip()
        self.assertEqual(hmac('secret', 'order_123|pay_9'), node)
        self.assertEqual(hmac('secret', b'order_123|pay_9'), node)

    def test_the_routes_answer_json_with_friendly_errors(self):
        order = load_api('razorpay-order')
        webhook = load_api('razorpay-webhook')
        with env(SUPABASE_URL=None):
            status, _, body = call_wsgi(order.app, 'POST', '/api/razorpay-order', body=json.dumps({'bookingId': BOOKING}).encode())
            self.assertEqual(status, 503)
            self.assertRegex(json.loads(body)['error'], 'not set up')
        status, _, _ = call_wsgi(order.app, 'POST', '/api/razorpay-order', body=b'not json')
        self.assertEqual(status, 400)
        self.assertEqual(call_wsgi(order.app, 'GET', '/api/razorpay-order')[0], 405)
        with env(RAZORPAY_WEBHOOK_SECRET='hook'):
            status, _, _ = call_wsgi(webhook.app, 'POST', '/api/razorpay-webhook', body=b'{}', headers={'X-Razorpay-Signature': 'nope'})
            self.assertEqual(status, 401)

        def boom():
            raise RuntimeError('boom')
        res = respond(boom)
        self.assertEqual(res.status, 500)
        self.assertNotIn('boom', res.body.decode())

        def conflict():
            raise PaymentError(409, 'x')
        self.assertEqual(respond(conflict).status, 409)


if __name__ == '__main__':
    unittest.main()
