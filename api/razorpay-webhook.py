"""Razorpay webhook: set its URL to https://<site>/api/razorpay-webhook, with the events order.paid
and payment.captured, and the same secret as RAZORPAY_WEBHOOK_SECRET."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.payments.razorpay import config, handle_webhook, respond  # noqa: E402
from backend.web import http, wsgi  # noqa: E402


def post(req, http=http):
    return respond(lambda: handle_webhook(config(os.environ), http, req.body, req.headers.get('x-razorpay-signature')))


app = wsgi({'POST': lambda req: post(req)})
