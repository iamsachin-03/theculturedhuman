import unittest
from datetime import datetime, timezone

from support import FakeHttp, env, load_api
from backend.notify.notifier import booking_email, config, contribution_email, run
from backend.web import Request

SITE = 'https://site.example'
CONTRIBUTIONS = [
    {'id': 'c1', 'title': 'Sasur', 'place_slug': 'mithila', 'status': 'published', 'review_note': None, 'notified_status': None, 'submitted_by': 'u1'},
    {'id': 'c2', 'title': 'Grandma’s lullaby', 'place_slug': None, 'status': 'rejected', 'review_note': 'It names a living person.', 'notified_status': None, 'submitted_by': 'u2'},
    {'id': 'c3', 'title': 'Already told', 'place_slug': 'mithila', 'status': 'published', 'review_note': None, 'notified_status': 'published', 'submitted_by': 'u1'},
]
BOOKINGS = [
    {'id': 'b1', 'status': 'requested', 'notified_status': None, 'requested_by': 'u2', 'listings': {'name': 'Sita Devi', 'user_id': 'u3'}},
    {'id': 'b2', 'status': 'quoted', 'notified_status': 'requested', 'requested_by': 'u2', 'listings': {'name': 'Sita Devi', 'user_id': 'u3'}},
    {'id': 'b3', 'status': 'accepted', 'notified_status': None, 'requested_by': 'u9', 'listings': {'name': 'Sita Devi', 'user_id': 'u3'}},
]
CONTACTS = [{'user_id': 'u1', 'email': 'one@example.com'}, {'user_id': 'u2', 'email': 'two@example.com'}, {'user_id': 'u3', 'email': 'maker@example.com'}]
ENV = {'SUPABASE_URL': 'https://db.example', 'SUPABASE_SERVICE_ROLE_KEY': 'service', 'RESEND_API_KEY': 'key', 'EMAIL_FROM': 'The Cultured Human <hello@site.example>', 'SITE_URL': f'{SITE}/'}


def fake(email_status=200):
    def route(url, method, headers, body):
        if method == 'PATCH':
            return 204, None
        if '/rest/v1/place_contributions?select=' in url:
            return 200, CONTRIBUTIONS
        if '/rest/v1/bookings?select=' in url:
            return 200, BOOKINGS
        if '/rest/v1/contacts' in url:
            return 200, CONTACTS
        if '/rest/v1/places' in url:
            return 200, [{'slug': 'mithila', 'name': 'Mithila'}]
        if 'api.resend.com' in url:
            return email_status, {'id': 'email'}
        return 404, {}
    return FakeHttp(route)


class Notifier(unittest.TestCase):
    def test_emails_say_what_happened_and_where_to_go_next(self):
        published = contribution_email(CONTRIBUTIONS[0], 'Mithila', SITE)
        self.assertRegex(published['subject'], r'Sasur.*Mithila')
        self.assertIn(f'{SITE}/places/mithila.html', published['text'])
        self.assertIn(f'{SITE}/s/c1', published['text'])
        rejected = contribution_email(CONTRIBUTIONS[1], None, SITE)
        self.assertIn('The reason: It names a living person.', rejected['text'])
        self.assertIn('/community-guidelines.html', rejected['text'])
        self.assertIsNone(contribution_email({**CONTRIBUTIONS[0], 'status': 'pending'}, 'Mithila', SITE))
        self.assertEqual(booking_email(BOOKINGS[0], 'Sita Devi', SITE)['to'], 'provider')
        self.assertEqual(booking_email(BOOKINGS[1], 'Sita Devi', SITE)['to'], 'family')
        self.assertEqual(booking_email(BOOKINGS[2], 'Sita Devi', SITE)['to'], 'provider')
        self.assertEqual(booking_email({'status': 'paid'}, 'Sita Devi', SITE)['to'], 'provider')
        self.assertIsNone(booking_email({'status': 'completed'}, 'Sita Devi', SITE))

    def test_a_run_emails_each_change_once_to_the_right_person_and_remembers_it(self):
        http = fake()
        result = run(config(ENV), http, now=datetime(2026, 11, 18, 3, tzinfo=timezone.utc))
        self.assertTrue(result['live'])
        self.assertEqual([(s['id'], s['to']) for s in result['sent']], [
            ('c1', 'one@example.com'), ('c2', 'two@example.com'), ('b1', 'maker@example.com'), ('b2', 'two@example.com'), ('b3', 'maker@example.com'),
        ])
        self.assertEqual(result['failed'], [])
        emails = [c for c in http.calls if 'resend' in c['url']]
        self.assertEqual(len(emails), 5)
        self.assertEqual(emails[0]['body']['to'], ['one@example.com'])
        self.assertEqual(emails[0]['body']['from'], ENV['EMAIL_FROM'])
        patches = [(c['url'].split('/rest/v1/')[1], c['body']['notified_status']) for c in http.calls if c['method'] == 'PATCH']
        self.assertEqual(patches, [
            ('place_contributions?id=eq.c1', 'published'), ('place_contributions?id=eq.c2', 'rejected'),
            ('bookings?id=eq.b1', 'requested'), ('bookings?id=eq.b2', 'quoted'), ('bookings?id=eq.b3', 'accepted'),
        ])
        self.assertIn('created_at=gte.2026-11-04T03%3A00%3A00.000Z', http.calls[0]['url'], 'only the last two weeks are looked at')

    def test_without_an_email_key_nothing_is_sent_and_failed_emails_are_retried(self):
        dry = fake()
        preview = run(config({**ENV, 'RESEND_API_KEY': ''}), dry)
        self.assertFalse(preview['live'])
        self.assertEqual(len(preview['sent']), 5)
        self.assertTrue(all(c['method'] == 'GET' for c in dry.calls))

        broken = fake(email_status=500)
        result = run(config(ENV), broken)
        self.assertEqual(result['sent'], [])
        self.assertEqual(len(result['failed']), 5)
        self.assertFalse(any(c['method'] == 'PATCH' for c in broken.calls))

    def test_the_cron_endpoint_needs_its_secret(self):
        notify = load_api('notify')
        with env(CRON_SECRET=None):
            self.assertEqual(notify.get(Request(), http=fake()).status, 503)
        with env(CRON_SECRET='shh'):
            self.assertEqual(notify.get(Request(headers={'Authorization': 'Bearer nope'}), http=fake()).status, 401)
            with env(SUPABASE_URL=None):
                res = notify.get(Request(headers={'Authorization': 'Bearer shh'}), http=fake())
                self.assertEqual(res.status, 500)
                self.assertRegex(res.json_body()['error'], 'SUPABASE_URL')
            with env(**{k: v for k, v in ENV.items()}):
                res = notify.get(Request(headers={'Authorization': 'Bearer shh'}, query={'dry': '1'}), http=fake())
                self.assertEqual(res.status, 200)
                self.assertEqual(res.json_body()['sent'], 5)


if __name__ == '__main__':
    unittest.main()
