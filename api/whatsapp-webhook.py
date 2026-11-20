"""WhatsApp webhook: set its callback URL to https://<site>/api/whatsapp-webhook with the verify token
WHATSAPP_VERIFY_TOKEN, and subscribe to "messages". Answers to the weekly question are kept in the
asker's archive (backend/whatsapp/replies.py)."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.web import Response, http, log_error, wsgi  # noqa: E402
from backend.whatsapp.replies import config, handle, signed, verify  # noqa: E402


def get(req):
    challenge = verify(req.query, config(os.environ).get('verify_token'))
    if challenge is None:
        return Response('Not verified.', 403, {'content-type': 'text/plain; charset=utf-8'})
    return Response(challenge, 200, {'content-type': 'text/plain; charset=utf-8'})


def post(req, http=http, now=None):
    cfg = config(os.environ)
    if not cfg['app_secret']:
        return Response.json({'error': 'WhatsApp replies are not set up.'}, 503)
    if not signed(req.body, req.headers.get('x-hub-signature-256'), cfg['app_secret']):
        return Response.json({'error': 'Signature does not match.'}, 401)
    try:
        payload = json.loads(req.body.decode('utf-8'))
    except ValueError:
        return Response.json({'error': 'Not JSON.'}, 400)
    try:
        # A failure answers 500 so Meta sends the message again; messages already kept are skipped.
        return Response.json({'results': handle(payload, cfg, http, now or datetime.now(timezone.utc))})
    except Exception:
        log_error()
        return Response.json({'error': 'Something went wrong.'}, 500)


app = wsgi({'GET': get, 'POST': lambda req: post(req)})
