"""Vercel cron job (see "crons" in vercel.json): once a day, send the weekly questions that are due.
Vercel calls it with "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
Add ?dry=1 to see what would be sent without sending.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.weekly.sender import config, run  # noqa: E402
from backend.web import Response, cron_allowed, http, log_error, wsgi  # noqa: E402


def get(req, http=http):
    secret = os.environ.get('CRON_SECRET')
    if not secret:
        return Response.json({'error': 'The weekly sender is not set up yet. See backend/weekly/README.md.'}, 503)
    if not cron_allowed(req.headers.get('authorization'), secret):
        return Response.json({'error': 'Not allowed.'}, 401)
    try:
        result = run(config(os.environ), http, dry_run=req.query.get('dry') == '1')
    except Exception as err:
        log_error()
        return Response.json({'error': str(err)}, 500)
    summary = {'day': result['day'], 'live': result['live'], 'sent': len(result['sent']), 'failed': result['failed']}
    print(json.dumps(summary))
    return Response.json(summary, 500 if result['failed'] and not result['sent'] else 200)


app = wsgi({'GET': lambda req: get(req)})
