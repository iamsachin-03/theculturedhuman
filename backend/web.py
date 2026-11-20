"""What every Python function in api/ shares: outgoing HTTP, the Supabase REST helper, the cron
secret check, and a small WSGI adapter (Vercel runs any module-level WSGI `app`).

Standard library only, like the rest of the repository. Each function takes its HTTP client as an
argument (`http`), so the tests pass a fake one and nothing touches the network.
"""
import base64
import hashlib
import hmac
import json
import sys
import traceback
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus

TIMEOUT = 20


class Reply:
    """An HTTP response: status, body text, and .ok / .json() like fetch's Response."""

    def __init__(self, status, text=''):
        self.status = status
        self.text = text

    @property
    def ok(self):
        return 200 <= self.status < 300

    def json(self):
        return json.loads(self.text) if self.text else None


def http(url, method='GET', headers=None, body=None):
    """Sends one request and returns a Reply; an HTTP error status is a Reply too, not an exception."""
    data = body.encode('utf-8') if isinstance(body, str) else body
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return Reply(res.status, res.read().decode('utf-8'))
    except urllib.error.HTTPError as err:
        return Reply(err.code, err.read().decode('utf-8', 'replace'))


def supabase(url, service_key, http, error=RuntimeError):
    """A function that calls Supabase's REST API as the service role and returns parsed JSON."""

    def db(path, method='GET', json_body=None, headers=None):
        res = http(
            f'{url}/rest/v1/{path}',
            method=method,
            headers={'apikey': service_key, 'authorization': f'Bearer {service_key}', 'content-type': 'application/json', **(headers or {})},
            body=json.dumps(json_body) if json_body is not None else None,
        )
        if not res.ok:
            raise error(f'Database {res.status}: {res.text}')
        return res.json()

    return db


def basic_auth(user, password):
    return 'Basic ' + base64.b64encode(f'{user}:{password}'.encode()).decode()


def cron_allowed(header, secret):
    """True when the header is "Bearer <secret>". Takes the same time however close a wrong guess is."""
    if not secret:
        return False
    digest = lambda s: hashlib.sha256(str(s).encode()).digest()
    return hmac.compare_digest(digest(header or ''), digest(f'Bearer {secret}'))


def iso_utc(moment):
    """2026-11-04T03:00:00.000Z, the form Postgres and JavaScript's toISOString() use."""
    return moment.strftime('%Y-%m-%dT%H:%M:%S.') + f'{moment.microsecond // 1000:03d}Z'


class Request:
    def __init__(self, method='GET', path='/', query=None, headers=None, body=b'', origin='http://localhost'):
        self.method = method
        self.path = path
        self.query = query or {}
        self.headers = {k.lower(): v for k, v in (headers or {}).items()}
        self.body = body
        self.origin = origin

    @classmethod
    def from_environ(cls, environ):
        headers = {k[5:].replace('_', '-').lower(): v for k, v in environ.items() if k.startswith('HTTP_')}
        if environ.get('CONTENT_TYPE'):
            headers['content-type'] = environ['CONTENT_TYPE']
        try:
            length = int(environ.get('CONTENT_LENGTH') or 0)
        except ValueError:
            length = 0
        body = environ['wsgi.input'].read(length) if length else b''
        query = {k: v[0] for k, v in urllib.parse.parse_qs(environ.get('QUERY_STRING', '')).items()}
        scheme = headers.get('x-forwarded-proto') or environ.get('wsgi.url_scheme', 'http')
        host = headers.get('x-forwarded-host') or headers.get('host') or 'localhost'
        return cls(environ.get('REQUEST_METHOD', 'GET'), environ.get('PATH_INFO', '/'), query, headers, body, f'{scheme}://{host}')

    def json(self):
        return json.loads(self.body.decode('utf-8'))


class Response:
    def __init__(self, body, status=200, headers=None):
        self.body = body.encode('utf-8') if isinstance(body, str) else body
        self.status = status
        self.headers = headers or {}

    @classmethod
    def json(cls, data, status=200):
        return cls(json.dumps(data, ensure_ascii=False), status, {'content-type': 'application/json; charset=utf-8'})

    def json_body(self):
        return json.loads(self.body.decode('utf-8'))


def log_error():
    traceback.print_exc(file=sys.stderr)


def wsgi(handlers):
    """A WSGI app from {method: function(Request) -> Response}. Unknown methods get 405."""

    def app(environ, start_response):
        req = Request.from_environ(environ)
        handler = handlers.get(req.method)
        if handler is None:
            res = Response.json({'error': 'Not here.'}, 405)
        else:
            try:
                res = handler(req)
            except Exception:
                log_error()
                res = Response.json({'error': 'Something went wrong.'}, 500)
        reason = HTTPStatus(res.status).phrase if res.status in HTTPStatus._value2member_map_ else ''
        start_response(f'{res.status} {reason}', list(res.headers.items()) + [('content-length', str(len(res.body)))])
        return [res.body]

    return app
