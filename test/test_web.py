import unittest
from datetime import datetime, timezone

from support import call_wsgi, quiet
from backend.web import Response, cron_allowed, iso_utc, wsgi


class Web(unittest.TestCase):
    def test_only_the_exact_cron_secret_is_let_in(self):
        self.assertTrue(cron_allowed('Bearer s3cret-value', 's3cret-value'))
        for header in [None, '', 's3cret-value', 'Bearer s3cret-valu', 'Bearer s3cret-value ', 'bearer s3cret-value', 'Bearer ']:
            self.assertFalse(cron_allowed(header, 's3cret-value'), header)
        self.assertFalse(cron_allowed('Bearer ', ''), 'an unset secret lets no one in')
        self.assertFalse(cron_allowed('Bearer None', None))

    def test_times_are_written_the_way_postgres_and_javascript_write_them(self):
        self.assertEqual(iso_utc(datetime(2026, 11, 4, 3, 0, 0, 123456, tzinfo=timezone.utc)), '2026-11-04T03:00:00.123Z')

    def test_the_wsgi_adapter_hides_crashes_and_refuses_other_methods(self):
        def boom(req):
            raise RuntimeError('secret detail')
        app = wsgi({'GET': boom, 'POST': lambda req: Response.json({'got': req.json()}, 201)})
        with quiet():
            status, _, body = call_wsgi(app, 'GET')
        self.assertEqual(status, 500)
        self.assertNotIn('secret detail', body)
        self.assertEqual(call_wsgi(app, 'DELETE')[0], 405)
        status, headers, body = call_wsgi(app, 'POST', body=b'{"a": 1}', headers={'Content-Type': 'application/json'})
        self.assertEqual((status, body), (201, '{"got": {"a": 1}}'))
        self.assertEqual(headers['content-type'], 'application/json; charset=utf-8')


if __name__ == '__main__':
    unittest.main()
