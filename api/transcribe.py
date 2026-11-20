"""POST /api/transcribe {"media": "<id>"} with the person's sign-in as a Bearer token: writes down what
is said in that recording, and translates it into English. backend/transcribe/transcriber.py."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.transcribe.transcriber import TranscribeError, config, transcribe  # noqa: E402
from backend.web import Request, Response, http, log_error, wsgi  # noqa: E402


def post(req, http=http):
    auth = req.headers.get('authorization', '')
    token = auth[7:] if auth.lower().startswith('bearer ') else ''
    try:
        media = (req.json() or {}).get('media')
    except ValueError:
        return Response.json({'error': 'Which recording?'}, 400)
    try:
        return Response.json(transcribe(config(os.environ), token, media, http))
    except TranscribeError as err:
        return Response.json({'error': str(err)}, err.status)
    except Exception:
        log_error()
        return Response.json({'error': 'The transcript could not be made just now. Please try again later, or type it yourself.'}, 502)


app = wsgi({'POST': lambda req: post(req)})
