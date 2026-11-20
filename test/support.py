"""Helpers for the Python tests: the repository on the import path, api/ modules loaded by file
(their names have dashes), a fake HTTP client that records calls, and a WSGI caller."""
import importlib.util
import io
import json
import os
import sys
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.web import Reply  # noqa: E402


def load_api(name):
    spec = importlib.util.spec_from_file_location(f'api_{name.replace("-", "_")}', ROOT / 'api' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeHttp:
    """Answers with route(url, method, headers, body) -> (status, body); remembers every call."""

    def __init__(self, route):
        self.route = route
        self.calls = []

    def __call__(self, url, method='GET', headers=None, body=None):
        parsed = json.loads(body) if body else None
        self.calls.append({'url': url, 'method': method, 'headers': headers or {}, 'body': parsed})
        status, data = self.route(url, method, headers or {}, parsed)
        return Reply(status, '' if data is None else json.dumps(data))


def call_wsgi(app, method='GET', path='/', query='', headers=None, body=b''):
    """Runs a WSGI app once; returns (status, headers, body text)."""
    environ = {
        'REQUEST_METHOD': method, 'PATH_INFO': path, 'QUERY_STRING': query,
        'CONTENT_LENGTH': str(len(body)), 'wsgi.input': io.BytesIO(body), 'wsgi.url_scheme': 'https',
        'HTTP_HOST': 'site.example',
    }
    for k, v in (headers or {}).items():
        environ['HTTP_' + k.upper().replace('-', '_')] = v
    got = {}

    def start_response(status, response_headers):
        got['status'] = int(status.split()[0])
        got['headers'] = {k.lower(): v for k, v in response_headers}

    out = b''.join(app(environ, start_response))
    return got['status'], got['headers'], out.decode('utf-8')


@contextmanager
def env(**values):
    """Sets (or, with None, removes) environment variables for the duration of a block."""
    saved = dict(os.environ)
    try:
        for k, v in values.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        yield
    finally:
        os.environ.clear()
        os.environ.update(saved)


@contextmanager
def quiet():
    """Swallows what a function logs (tracebacks on purpose-made failures, run summaries)."""
    with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
        yield
