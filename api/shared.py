"""GET /s/<id> (rewritten here by vercel.json): the contribution's page, with a link preview of its own."""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.share.preview import fetch_shared, render_shared  # noqa: E402
from backend.web import Response, http, log_error, wsgi  # noqa: E402

HEADERS = {'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400'}


def read(path):
    return (ROOT / path).read_text('utf-8')


def get(req, http=http):
    m = re.match(r'^/s/([^/]+)$', req.path)
    id = req.query.get('id') or (m.group(1) if m else None)
    html = read('public/shared.html')
    site = json.loads(read('content/site.json'))
    backend = site.get('backend') or {}
    contribution = None
    try:
        contribution = fetch_shared(os.environ.get('SUPABASE_URL') or backend.get('url'), os.environ.get('SUPABASE_ANON_KEY') or backend.get('anonKey'), id, http)
    except Exception:
        log_error()
    if not contribution:
        return Response(html, 404, HEADERS)
    place = next((p for p in json.loads(read('public/places/places.json')) if p['slug'] == contribution.get('place_slug')), None)
    return Response(render_shared(html, contribution, place, req.origin, site['name']), 200, HEADERS)


app = wsgi({'GET': lambda req: get(req)})
