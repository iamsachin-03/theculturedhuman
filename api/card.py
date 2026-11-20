"""GET /card/<token> (rewritten here by vercel.json): one recording shared privately from a family
archive. backend/cards/card.py."""
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.cards.card import GONE, config, fetch_card, render  # noqa: E402
from backend.web import Response, http, log_error, wsgi  # noqa: E402

HEADERS = {'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow'}


def get(req, http=http, now=None):
    m = re.match(r'^/card/([^/]+)$', req.path)
    token = req.query.get('token') or (m.group(1) if m else None)
    try:
        card = fetch_card(config(os.environ), token, http, now or datetime.now(timezone.utc))
    except Exception:
        log_error()
        return Response(GONE.replace('This card is no longer here.', 'This card cannot be opened just now.', 1), 503, HEADERS)
    if not card:
        return Response(GONE, 404, HEADERS)
    return Response(render(card), 200, HEADERS)


app = wsgi({'GET': lambda req: get(req)})
