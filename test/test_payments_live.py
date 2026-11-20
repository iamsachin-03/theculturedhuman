"""Pays for a booking end to end against a running local stand-in (backend/dev/start.sh): a family
signs in for real, asks the Python function for an order, and a signed Razorpay webhook marks the
booking paid. Skipped unless the stand-in's details are given:
    TCH_DEV_BACKEND=http://localhost:54321 TCH_DEV_ANON_KEY=$(cat /tmp/tch-anon-key) \\
    TCH_DEV_SERVICE_KEY=$(cat /tmp/tch-service-key) npm run test:py
"""
import json
import os
import re
import time
import unittest
import urllib.error
import urllib.request

from support import call_wsgi, env, load_api, quiet
from backend.payments.razorpay import hmac
from backend.web import http, supabase

URL = os.environ.get('TCH_DEV_BACKEND')
ANON = os.environ.get('TCH_DEV_ANON_KEY')
SERVICE = os.environ.get('TCH_DEV_SERVICE_KEY')
RETURN = 'http://localhost:4321/app.html'


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def sign_in(email):
    """A real session for a new user: ask for a link, read it from the stand-in's mailbox, follow it."""
    res = http(f'{URL}/auth/v1/otp?redirect_to={RETURN}', method='POST', headers={'apikey': ANON, 'content-type': 'application/json'}, body=json.dumps({'email': email, 'create_user': True}))
    assert res.ok, res.text
    link = None
    for _ in range(40):
        mail = http(f'{URL}/dev/mail').json()
        link = next((m['link'] for m in reversed(mail) if email in m['to']), None)
        if link:
            break
        time.sleep(0.1)
    assert link, f'a sign-in email reached {email}'
    try:
        urllib.request.build_opener(_NoRedirect).open(link)
    except urllib.error.HTTPError as err:
        location = err.headers['Location']
    token = re.search(r'access_token=([^&]+)', location).group(1)
    user = http(f'{URL}/auth/v1/user', headers={'apikey': ANON, 'authorization': f'Bearer {token}'}).json()
    return token, user['id']


@unittest.skipUnless(URL and ANON and SERVICE, 'set TCH_DEV_BACKEND, TCH_DEV_ANON_KEY and TCH_DEV_SERVICE_KEY to run against backend/dev/start.sh')
class PaymentsLive(unittest.TestCase):
    def setUp(self):
        self.db = supabase(URL, SERVICE, http)
        run = str(int(time.time() * 1000))
        self.token, self.family = sign_in(f'family-{run}@example.org')
        _, maker = sign_in(f'maker-{run}@example.org')
        place = self.db('places?select=slug&limit=1')[0]['slug']
        listing = self.db('listings', method='POST', headers={'prefer': 'return=representation'}, json_body={'user_id': maker, 'role': 'maker', 'place_slug': place, 'name': 'Test Maker', 'summary': 'A listing made by the payments test.', 'status': 'published'})[0]
        booking = self.db('bookings', method='POST', headers={'prefer': 'return=representation'}, json_body={'listing_id': listing['id'], 'requested_by': self.family, 'message': 'Please make us a family tree.'})[0]
        self.db(f"bookings?id=eq.{booking['id']}", method='PATCH', json_body={'price_paise': 500000, 'platform_fee_paise': 50000, 'status': 'accepted'})
        self.booking = booking['id']
        self.order = load_api('razorpay-order')
        self.webhook = load_api('razorpay-webhook')
        self.env = {'SUPABASE_URL': URL, 'SUPABASE_SERVICE_ROLE_KEY': SERVICE, 'RAZORPAY_KEY_ID': None, 'RAZORPAY_KEY_SECRET': None, 'RAZORPAY_WEBHOOK_SECRET': 'test-webhook-secret'}

    def ask_for_order(self, token):
        status, _, body = call_wsgi(self.order.app, 'POST', '/api/razorpay-order', headers={'Authorization': f'Bearer {token}'}, body=json.dumps({'bookingId': self.booking}).encode())
        return status, json.loads(body)

    def send_webhook(self, body, signature):
        status, _, text = call_wsgi(self.webhook.app, 'POST', '/api/razorpay-webhook', headers={'X-Razorpay-Signature': signature}, body=body)
        return status, json.loads(text)

    def booking_row(self):
        return self.db(f'bookings?select=status,payment_ref,payment_order_id&id=eq.{self.booking}')[0]

    def test_the_family_gets_an_order_for_the_price_plus_the_fee_and_strangers_do_not(self):
        with quiet(), env(**self.env):
            status, order = self.ask_for_order(self.token)
            self.assertEqual(status, 200)
            self.assertEqual((order['dryRun'], order['amount'], order['name']), (True, 550000, 'Test Maker'))
            self.assertEqual(self.ask_for_order('forged')[0], 401)
            stranger, _ = sign_in(f'stranger-{time.time_ns()}@example.org')
            self.assertEqual(self.ask_for_order(stranger)[0], 404)

    def test_a_signed_webhook_marks_the_booking_paid_once_and_a_forged_one_is_refused(self):
        order_id = f'order_live_{time.time_ns()}'
        self.db(f'bookings?id=eq.{self.booking}', method='PATCH', json_body={'payment_order_id': order_id})
        body = json.dumps({'event': 'order.paid', 'payload': {'payment': {'entity': {'id': 'pay_live', 'order_id': order_id}}}}).encode()
        with quiet(), env(**self.env):
            self.assertEqual(self.send_webhook(body, 'forged')[0], 401)
            self.assertEqual(self.booking_row()['status'], 'accepted')
            self.assertEqual(self.send_webhook(body, hmac('test-webhook-secret', body)), (200, {'paid': True, 'changed': True}))
            self.assertEqual(self.booking_row()['status'], 'paid')
            self.assertEqual(self.booking_row()['payment_ref'], 'pay_live')
            self.assertEqual(self.send_webhook(body, hmac('test-webhook-secret', body)), (200, {'paid': True, 'changed': False}))
            self.assertEqual(self.ask_for_order(self.token)[1]['error'], 'This booking is already paid.')


if __name__ == '__main__':
    unittest.main()
