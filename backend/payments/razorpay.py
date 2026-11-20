"""Online payment for accepted quotes, through Razorpay.
1. The family's browser asks create_order() for an order for its accepted booking (price + platform fee).
2. Razorpay Checkout takes the payment in the browser.
3. verify_payment() checks Checkout's signature straight away, and the webhook (handle_webhook)
   confirms it independently; either marks the booking paid with the payment id. Both are idempotent.
Without RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET nothing is charged: create_order() answers
{"dryRun": true} and the app falls back to the moderator emailing a payment link.
"""
import hashlib
import hmac as _hmac
import json
import re
import urllib.parse

from backend.web import Response, basic_auth, log_error, supabase

RAZORPAY = 'https://api.razorpay.com/v1'
UUID = re.compile(r'^[0-9a-f-]{36}$', re.I)


def config(env):
    return {
        'supabase_url': env.get('SUPABASE_URL'),
        'service_key': env.get('SUPABASE_SERVICE_ROLE_KEY'),
        'key_id': env.get('RAZORPAY_KEY_ID') or '',
        'key_secret': env.get('RAZORPAY_KEY_SECRET') or '',
        'webhook_secret': env.get('RAZORPAY_WEBHOOK_SECRET') or '',
    }


class PaymentError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def hmac(secret, text):
    data = text if isinstance(text, bytes) else str(text).encode()
    return _hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()


def same_signature(expected, given):
    return _hmac.compare_digest(str(expected).encode(), str(given or '').encode())


def _database(cfg, http):
    if not cfg['supabase_url'] or not cfg['service_key']:
        raise PaymentError(503, 'Payments are not set up yet.')
    return supabase(cfg['supabase_url'], cfg['service_key'], http)


def _signed_in_user(cfg, http, token):
    if not token:
        raise PaymentError(401, 'Please sign in first.')
    res = http(f"{cfg['supabase_url']}/auth/v1/user", headers={'apikey': cfg['service_key'], 'authorization': f'Bearer {token}'})
    if not res.ok:
        raise PaymentError(401, 'Please sign in again.')
    return res.json()


def _payable_booking(db, booking_id, user_id):
    """The family's accepted booking, checked against who is asking."""
    if not UUID.match(str(booking_id or '')):
        raise PaymentError(400, 'Unknown booking.')
    rows = db(f'bookings?select=id,status,requested_by,price_paise,platform_fee_paise,payment_order_id,listings(name)&id=eq.{booking_id}')
    b = rows[0] if rows else None
    if not b or b['requested_by'] != user_id:
        raise PaymentError(404, 'Unknown booking.')
    return b


def create_order(cfg, http, token, booking_id):
    """An order for an accepted booking. Reuses the booking's order if it already has one."""
    db = _database(cfg, http)
    user = _signed_in_user(cfg, http, token)
    b = _payable_booking(db, booking_id, user['id'])
    if b['status'] in ('paid', 'completed'):
        raise PaymentError(409, 'This booking is already paid.')
    if b['status'] != 'accepted' or b.get('price_paise') is None:
        raise PaymentError(409, 'Accept the quote first.')
    amount = int(b['price_paise']) + int(b.get('platform_fee_paise') or 0)
    summary = {'amount': amount, 'currency': 'INR', 'name': (b.get('listings') or {}).get('name') or 'Your booking', 'email': user.get('email') or ''}
    if not cfg['key_id'] or not cfg['key_secret']:
        return {'dryRun': True, **summary}
    order_id = b.get('payment_order_id')
    if not order_id:
        res = http(f'{RAZORPAY}/orders', method='POST',
                   headers={'authorization': basic_auth(cfg['key_id'], cfg['key_secret']), 'content-type': 'application/json'},
                   body=json.dumps({'amount': amount, 'currency': 'INR', 'receipt': f"booking-{b['id'][:8]}", 'notes': {'booking_id': b['id']}}))
        if not res.ok:
            raise PaymentError(502, f'Razorpay {res.status}: {res.text}')
        order_id = res.json()['id']
        db(f"bookings?id=eq.{b['id']}", method='PATCH', json_body={'payment_order_id': order_id}, headers={'prefer': 'return=minimal'})
    return {'dryRun': False, 'keyId': cfg['key_id'], 'orderId': order_id, 'testMode': cfg['key_id'].startswith('rzp_test_'), **summary}


def _mark_paid(db, order_id, payment_id):
    rows = db(f"bookings?payment_order_id=eq.{urllib.parse.quote(str(order_id), safe='')}&status=eq.accepted",
              method='PATCH', json_body={'status': 'paid', 'payment_ref': payment_id}, headers={'prefer': 'return=representation'})
    return len(rows or []) > 0


def verify_payment(cfg, http, token, booking_id, order_id, payment_id, signature):
    """Checkout's success handler sends its signature here, so the family sees "paid" straight away."""
    if not cfg['key_secret']:
        raise PaymentError(503, 'Online payment is not switched on.')
    db = _database(cfg, http)
    user = _signed_in_user(cfg, http, token)
    b = _payable_booking(db, booking_id, user['id'])
    if not order_id or b.get('payment_order_id') != order_id:
        raise PaymentError(400, 'This payment is for a different order.')
    if not same_signature(hmac(cfg['key_secret'], f'{order_id}|{payment_id}'), signature):
        raise PaymentError(400, 'The payment could not be verified.')
    return {'paid': True, 'changed': _mark_paid(db, order_id, payment_id)}


def handle_webhook(cfg, http, body, signature):
    """Razorpay's webhook (order.paid or payment.captured). The raw body must be passed unparsed,
    because the signature is over the exact bytes."""
    if not cfg['webhook_secret']:
        raise PaymentError(503, 'RAZORPAY_WEBHOOK_SECRET is not set.')
    if not same_signature(hmac(cfg['webhook_secret'], body), signature):
        raise PaymentError(401, 'Bad signature.')
    event = json.loads(body)
    payment = ((event.get('payload') or {}).get('payment') or {}).get('entity')
    if event.get('event') not in ('order.paid', 'payment.captured') or not payment or not payment.get('order_id'):
        return {'ignored': event.get('event')}
    return {'paid': True, 'changed': _mark_paid(_database(cfg, http), payment['order_id'], payment.get('id'))}


def respond(action):
    """Runs an action for a function: JSON out, friendly errors, no internal detail on a crash."""
    try:
        return Response.json(action())
    except PaymentError as err:
        return Response.json({'error': str(err)}, err.status)
    except Exception:
        log_error()
        return Response.json({'error': 'Something went wrong. Please try again.'}, 500)
