import json
import subprocess
import unittest
from datetime import datetime, timezone

from support import ROOT, FakeHttp, env, load_api
from backend.weekly.sender import config, due_today, phone_digits, question, run, template_params, weekday_in
from backend.web import Request

# 18 Nov 2026 is a Wednesday in India; at 20:00 UTC on the 17th it is already Wednesday there.
NOW = datetime(2026, 11, 17, 20, tzinfo=timezone.utc)
WED = 3
ROWS = [
    {'id': 'e1', 'owner_id': 'u1', 'name': 'Nani', 'phone': '+91 98450 12345', 'day': WED, 'idx': 0, 'sign_as': 'Asha', 'asked_at': None, 'auto_send': True},
    {'id': 'e2', 'owner_id': 'u2', 'name': 'Dada', 'phone': '9845012345', 'day': WED, 'idx': 3, 'sign_as': '', 'asked_at': None, 'auto_send': True},
    {'id': 'e3', 'owner_id': 'u1', 'name': 'Mama', 'phone': '12', 'day': WED, 'idx': 1, 'sign_as': 'Asha', 'asked_at': None, 'auto_send': True},
]
ENV = {'SUPABASE_URL': 'https://db.example', 'SUPABASE_SERVICE_ROLE_KEY': 'service', 'WHATSAPP_TOKEN': 'token', 'WHATSAPP_PHONE_NUMBER_ID': '555'}


def fake(whatsapp_status=200):
    def route(url, method, headers, body):
        if '/rest/v1/weekly_elders?select=' in url:
            return 200, ROWS
        if '/rest/v1/profiles' in url:
            return 200, [{'id': 'u2', 'display_name': 'Ravi Kumar'}]
        if 'graph.facebook.com' in url:
            return whatsapp_status, {'messages': [{'id': 'wamid'}]}
        if method == 'PATCH':
            return 204, None
        return 404, {}
    return FakeHttp(route)


class WeeklySender(unittest.TestCase):
    def test_the_questions_are_the_ones_the_browser_asks(self):
        script = "const c=require('./public/scripts/app-core.js');console.log(JSON.stringify([0,3,-1,1000].map(n=>c.question(n))))"
        browser = json.loads(subprocess.run(['node', '-e', script], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
        self.assertEqual([question(n) for n in (0, 3, -1, 1000)], browser)

    def test_the_day_is_counted_in_india_time_and_numbers_need_a_country_code(self):
        self.assertEqual(weekday_in('Asia/Kolkata', NOW), WED)
        self.assertEqual(weekday_in('UTC', NOW), 2)
        self.assertEqual(phone_digits('+91 98450-12345', '91'), '919845012345')
        self.assertEqual(phone_digits('9845012345', '91'), '919845012345')
        self.assertEqual(phone_digits('0044 7700 900123', '91'), '447700900123')
        self.assertEqual(phone_digits('9845012345', ''), '')
        self.assertEqual(phone_digits('12', '91'), '')

    def test_only_switched_on_people_whose_day_it_is_with_no_question_waiting_are_due(self):
        due = due_today(ROWS + [
            {**ROWS[0], 'id': 'off', 'auto_send': False},
            {**ROWS[0], 'id': 'waiting', 'asked_at': '2026-11-11T05:00:00Z'},
            {**ROWS[0], 'id': 'tomorrow', 'day': 4},
            {**ROWS[0], 'id': 'nophone', 'phone': ''},
        ], WED)
        self.assertEqual([r['id'] for r in due], ['e1', 'e2', 'e3'])

    def test_the_template_gets_their_name_who_it_is_from_and_the_question(self):
        self.assertEqual(template_params(ROWS[0], 'Asha Rao'), ['Nani', 'Asha', question(0)['text']])
        self.assertEqual(template_params(ROWS[1], 'Ravi Kumar'), ['Dada', 'Ravi', question(3)['text']])
        self.assertEqual(template_params({**ROWS[1], 'name': 'Big\n  Dada'}, '')[1], 'your family')
        self.assertEqual(template_params({**ROWS[1], 'name': 'Big\n  Dada'}, '')[0], 'Big Dada')

    def test_a_live_run_sends_the_template_marks_each_person_asked_and_reports_bad_numbers(self):
        http = fake()
        result = run(config(ENV), http, now=NOW)
        self.assertTrue(result['live'])
        self.assertEqual([(s['id'], s['to']) for s in result['sent']], [('e1', '919845012345'), ('e2', '919845012345')])
        self.assertEqual([f['id'] for f in result['failed']], ['e3'])
        sends = [c for c in http.calls if 'graph.facebook.com' in c['url']]
        self.assertEqual(len(sends), 2)
        self.assertEqual(sends[0]['url'], 'https://graph.facebook.com/v21.0/555/messages')
        self.assertEqual(sends[0]['headers']['authorization'], 'Bearer token')
        self.assertEqual(sends[1]['body']['template'], {'name': 'weekly_question', 'language': {'code': 'en'}, 'components': [{'type': 'body', 'parameters': [{'type': 'text', 'text': t} for t in ['Dada', 'Ravi', question(3)['text']]]}]})
        marks = [(c['url'].split('id=eq.')[1], c['body']['asked_at']) for c in http.calls if c['method'] == 'PATCH']
        self.assertEqual(marks, [('e1', '2026-11-17T20:00:00.000Z'), ('e2', '2026-11-17T20:00:00.000Z')])
        first = http.calls[0]['url']
        self.assertTrue('auto_send=is.true' in first and 'day=eq.3' in first and 'asked_at=is.null' in first)

    def test_without_whatsapp_details_or_in_a_dry_run_nothing_is_sent_or_marked(self):
        for cfg, dry in [(config({**ENV, 'WHATSAPP_TOKEN': ''}), False), (config(ENV), True)]:
            http = fake()
            result = run(cfg, http, now=NOW, dry_run=dry)
            self.assertFalse(result['live'])
            self.assertEqual(len(result['sent']), 2)
            self.assertTrue(all(s['dryRun'] for s in result['sent']))
            self.assertFalse(any('graph.facebook.com' in c['url'] or c['method'] == 'PATCH' for c in http.calls))

    def test_a_whatsapp_refusal_is_reported_and_the_person_is_not_marked_asked(self):
        http = fake(whatsapp_status=400)
        result = run(config(ENV), http, now=NOW)
        self.assertEqual(result['sent'], [])
        self.assertEqual(len(result['failed']), 3)
        self.assertFalse(any(c['method'] == 'PATCH' for c in http.calls))

    def test_the_cron_endpoint_refuses_anyone_without_the_secret(self):
        weekly = load_api('weekly-send')
        with env(CRON_SECRET=None):
            self.assertEqual(weekly.get(Request(), http=fake()).status, 503)
        with env(CRON_SECRET='cron'):
            self.assertEqual(weekly.get(Request(headers={'Authorization': 'Bearer wrong'}), http=fake()).status, 401)
            with env(SUPABASE_URL=None):
                res = weekly.get(Request(headers={'Authorization': 'Bearer cron'}), http=fake())
                self.assertEqual(res.status, 500)
                self.assertRegex(res.json_body()['error'], 'SUPABASE_URL')


if __name__ == '__main__':
    unittest.main()
