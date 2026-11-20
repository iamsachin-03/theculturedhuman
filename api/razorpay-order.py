"""POST {bookingId} creates (or reuses) a Razorpay order for the signed-in family's accepted booking.
POST {bookingId, orderId, paymentId, signature} confirms a payment from Razorpay Checkout.
The family's Supabase access token comes in "Authorization: Bearer <token>".
"""
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.payments.razorpay import PaymentError, config, create_order, respond, verify_payment  # noqa: E402
from backend.web import http, wsgi  # noqa: E402


def post(req, http=http):
    def action():
        token = re.sub(r'^Bearer\s+', '', req.headers.get('authorization') or '', flags=re.I)
        try:
            data = req.json()
        except ValueError:
            raise PaymentError(400, 'Send JSON.')
        if not isinstance(data, dict):
            raise PaymentError(400, 'Send JSON.')
        cfg = config(os.environ)
        if data.get('paymentId'):
            return verify_payment(cfg, http, token, data.get('bookingId'), data.get('orderId'), data.get('paymentId'), data.get('signature'))
        return create_order(cfg, http, token, data.get('bookingId'))
    return respond(action)


app = wsgi({'POST': lambda req: post(req)})
