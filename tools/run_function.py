#!/usr/bin/env python3
"""Runs one Python function from api/ for tools/serve.mjs, the way Vercel would.

Reads the request as JSON on stdin ({method, path, query, headers, body}, body in base64) and
writes the response as JSON on stdout ({status, headers, body}, body in base64).
    python3 tools/run_function.py <name> < request.json
"""
import base64
import importlib.util
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    name = sys.argv[1]
    if not re.fullmatch(r'[\w-]+', name):
        raise SystemExit('bad function name')
    spec = importlib.util.spec_from_file_location('api_function', ROOT / 'api' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    real_stdout, sys.stdout = sys.stdout, sys.stderr
    try:
        spec.loader.exec_module(module)
    finally:
        sys.stdout = real_stdout

    req = json.load(sys.stdin)
    body = base64.b64decode(req.get('body') or '')
    environ = {
        'REQUEST_METHOD': req['method'], 'PATH_INFO': req['path'], 'QUERY_STRING': req.get('query', ''),
        'CONTENT_LENGTH': str(len(body)), 'wsgi.input': io.BytesIO(body), 'wsgi.url_scheme': 'http',
    }
    for k, v in req.get('headers', {}).items():
        key = k.upper().replace('-', '_')
        if key in ('CONTENT_TYPE', 'CONTENT_LENGTH'):
            if key == 'CONTENT_TYPE':
                environ[key] = v
        else:
            environ['HTTP_' + key] = v

    got = {}

    def start_response(status, headers):
        got['status'] = int(status.split()[0])
        got['headers'] = dict(headers)

    real_stdout, sys.stdout = sys.stdout, sys.stderr
    try:
        out = b''.join(module.app(environ, start_response))
    finally:
        sys.stdout = real_stdout
    json.dump({'status': got['status'], 'headers': got['headers'], 'body': base64.b64encode(out).decode()}, sys.stdout)


if __name__ == '__main__':
    main()
