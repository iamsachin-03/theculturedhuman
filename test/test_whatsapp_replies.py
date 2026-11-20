import hashlib
import hmac
import json
import unittest
import urllib.parse
from datetime import datetime, timedelta, timezone

from support import FakeHttp, call_wsgi, env, load_api, quiet
from backend.whatsapp.replies import asker, config, file_name, handle, signed, verify

NOW = datetime(2026, 11, 20, 9, 0, tzinfo=timezone.utc)
OWNER = 'aaaaaaaa-0000-0000-0000-000000000001'
CFG = config({'SUPABASE_URL': 'https://db.example', 'SUPABASE_SERVICE_ROLE_KEY': 'service', 'WHATSAPP_TOKEN': 'wa',
              'WHATSAPP_PHONE_NUMBER_ID': '555', 'WHATSAPP_APP_SECRET': 'secret', 'RESEND_API_KEY': 're', 'EMAIL_FROM': 'hi@site'})
VOICE = b'OggS\x00voice'


def voice(mid, sender='919876543210'):
    return {'id': mid, 'from': sender, 'type': 'audio', 'audio': {'id': 'm-' + mid, 'mime_type': 'audio/ogg; codecs=opus', 'voice': True}}


def text(mid, body, sender='919876543210'):
    return {'id': mid, 'from': sender, 'type': 'text', 'text': {'body': body}}


def payload(*msgs):
    return {'object': 'whatsapp_business_account', 'entry': [{'changes': [{'field': 'messages', 'value': {'messages': list(msgs)}}]}]}


class World:
    """Supabase, WhatsApp and Resend, in memory."""

    def __init__(self, elders=None, size=len(VOICE)):
        self.elders = elders if elders is not None else [{'id': 'e1', 'owner_id': OWNER, 'name': 'Nani', 'phone': '98765 43210', 'idx': 3, 'answered': 2,
                                                          'asked_at': '2026-11-19T03:00:00.000Z', 'lang': 'en', 'created_at': '2026-01-01T00:00:00Z'}]
        self.entries, self.media, self.kept, self.uploads, self.sent, self.emails = [], [], [], {}, [], []
        self.size = size
        self.http = FakeHttp(self.route)

    def route(self, url, method, headers, body):
        u = urllib.parse.urlparse(url)
        q = dict(urllib.parse.parse_qsl(u.query))
        if u.path == '/rest/v1/whatsapp_messages' and method == 'GET':
            if 'id' in q:
                return 200, [{'id': k['id']} for k in self.kept if k['id'] == q['id'][3:]]
            since = q['created_at'][4:]
            rows = sorted((k for k in self.kept if k['elder_id'] == q['elder_id'][3:] and k['created_at'] >= since), key=lambda k: k['created_at'], reverse=True)
            return 200, [{'entry_id': k['entry_id']} for k in rows[:1]]
        if u.path == '/rest/v1/whatsapp_messages' and method == 'POST':
            self.kept.append({**body, 'created_at': NOW.strftime('%Y-%m-%dT%H:%M:%S.000Z')})
            return 201, None
        if u.path == '/rest/v1/weekly_elders' and method == 'GET':
            return 200, [dict(e) for e in self.elders if e.get('auto_send', True)]
        if u.path == '/rest/v1/weekly_elders' and method == 'PATCH':
            next(e for e in self.elders if e['id'] == q['id'][3:]).update(body)
            return 204, None
        if u.path == '/rest/v1/entries' and method == 'POST':
            self.entries.append({**body, 'id': f'entry-{len(self.entries) + 1}'})
            return 201, [self.entries[-1]]
        if u.path == '/rest/v1/entries' and method == 'GET':
            return 200, [e for e in self.entries if e['id'] == q['id'][3:]]
        if u.path == '/rest/v1/entries' and method == 'PATCH':
            next(e for e in self.entries if e['id'] == q['id'][3:]).update(body)
            return 204, None
        if u.path == '/rest/v1/media' and method == 'POST':
            self.media.append(body)
            return 201, None
        if u.path == '/rest/v1/profiles':
            return 200, [{'display_name': 'Asha Rao'}]
        if u.netloc == 'graph.facebook.com' and u.path.endswith('/messages'):
            self.sent.append(body)
            return 200, {'messages': [{'id': 'out'}]}
        if u.netloc == 'graph.facebook.com':
            assert headers['authorization'] == 'Bearer wa'
            return 200, {'url': 'https://lookaside.example/' + u.path.rsplit('/', 1)[1], 'mime_type': 'audio/ogg; codecs=opus', 'file_size': self.size}
        if u.netloc == 'lookaside.example':
            assert headers['authorization'] == 'Bearer wa'
            return 200, VOICE
        if u.path.startswith('/storage/v1/object/archive/'):
            assert headers['authorization'] == 'Bearer service'
            self.uploads[urllib.parse.unquote(u.path[len('/storage/v1/object/archive/'):])] = body
            return 200, {'Key': 'ok'}
        if u.path.startswith('/auth/v1/admin/users/'):
            return 200, {'email': 'asha@example.com'}
        if u.netloc == 'api.resend.com':
            self.emails.append(body)
            return 200, {'id': 'mail'}
        return 404, {'url': url}


class Replies(unittest.TestCase):
    def test_a_voice_note_from_nani_becomes_a_private_entry_under_the_question_she_was_asked(self):
        w = World()
        results = handle(payload(voice('wamid.A')), CFG, w.http, NOW)
        self.assertEqual(results, [{'id': 'wamid.A', 'kept': True, 'entry': 'entry-1', 'new': True}])
        [entry] = w.entries
        self.assertEqual((entry['owner_id'], entry['created_by'], entry['teller'], entry['audience']), (OWNER, OWNER, 'Nani', 'private'))
        self.assertEqual(entry['prompt'], entry['title'])
        [m] = w.media
        self.assertEqual((m['kind'], m['mime'], m['size'], m['entry_id']), ('audio', 'audio/ogg', len(VOICE), 'entry-1'))
        self.assertTrue(m['path'].startswith(f'{OWNER}/entry-1/') and m['path'].endswith('voice-note-2026-11-20-09-00.ogg'))
        self.assertEqual(w.uploads[m['path']], VOICE)
        self.assertEqual({k: w.elders[0][k] for k in ('idx', 'answered', 'asked_at')}, {'idx': 4, 'answered': 3, 'asked_at': None})
        self.assertEqual(w.sent[0]['to'], '919876543210')
        self.assertIn('kept safely for Asha', w.sent[0]['text']['body'])
        self.assertEqual(w.emails[0]['to'], ['asha@example.com'])
        self.assertIn('#/entry/entry-1', w.emails[0]['text'])

    def test_more_messages_soon_after_join_the_same_entry_and_the_question_moves_on_once(self):
        w = World()
        handle(payload(voice('wamid.A')), CFG, w.http, NOW)
        handle(payload(text('wamid.B', 'Aur ek baat…'), voice('wamid.C')), CFG, w.http, NOW + timedelta(minutes=5))
        self.assertEqual(len(w.entries), 1)
        self.assertEqual(w.entries[0]['body'], 'Aur ek baat…')
        self.assertEqual(len(w.media), 2)
        self.assertEqual(w.elders[0]['idx'], 4)
        self.assertEqual(len(w.sent), 1)

    def test_meta_sending_the_same_message_twice_keeps_it_once(self):
        w = World()
        handle(payload(voice('wamid.A')), CFG, w.http, NOW)
        again = handle(payload(voice('wamid.A')), CFG, w.http, NOW)
        self.assertEqual(again, [{'id': 'wamid.A', 'kept': False, 'reason': 'already kept'}])
        self.assertEqual((len(w.entries), len(w.media)), (1, 1))

    def test_a_hindi_answer_is_thanked_in_hindi_and_filed_under_the_hindi_question(self):
        w = World()
        w.elders[0]['lang'] = 'hi'
        handle(payload(text('wamid.A', 'बहुत पुरानी बात है')), CFG, w.http, NOW)
        self.assertIn('धन्यवाद, Nani', w.sent[0]['text']['body'])
        self.assertRegex(w.entries[0]['prompt'], r'[\u0900-\u097F]')
        self.assertEqual(w.entries[0]['body'], 'बहुत पुरानी बात है')

    def test_strangers_and_people_who_did_not_agree_are_ignored(self):
        w = World()
        self.assertFalse(handle(payload(voice('wamid.X', sender='15550001111')), CFG, w.http, NOW)[0]['kept'])
        w.elders[0]['auto_send'] = False
        self.assertFalse(handle(payload(voice('wamid.Y')), CFG, w.http, NOW)[0]['kept'])
        self.assertEqual((w.entries, w.sent), ([], []))

    def test_files_over_the_storage_limit_are_noted_but_not_downloaded(self):
        w = World(size=60 * 1024 * 1024)
        self.assertTrue(handle(payload(voice('wamid.A')), CFG, w.http, NOW)[0]['kept'])
        self.assertFalse(any('lookaside' in c['url'] for c in w.http.calls))
        self.assertEqual(w.media, [])
        self.assertIn('too large to keep', w.entries[0]['body'])

    def test_two_people_on_one_number_the_one_asked_most_recently_answers(self):
        elders = [{'id': 'a', 'phone': '+91 98765 43210', 'asked_at': None, 'created_at': '2026-02-01'},
                  {'id': 'b', 'phone': '9876543210', 'asked_at': '2026-11-19T03:00:00Z', 'created_at': '2026-01-01'},
                  {'id': 'c', 'phone': '9876543211', 'asked_at': '2026-11-20T03:00:00Z', 'created_at': '2026-01-01'}]
        self.assertEqual(asker(elders, '919876543210', '91')['id'], 'b')
        self.assertIsNone(asker(elders, '15550001111', '91'))

    def test_file_names(self):
        self.assertEqual(file_name('photo', 'image/jpeg', NOW), 'photo-2026-11-20-09-00.jpg')
        self.assertEqual(file_name('document', 'application/pdf', NOW, 'Kundli (1952)/scan.pdf'), 'Kundli 1952scan.pdf')

    def test_verification_and_signatures(self):
        self.assertEqual(verify({'hub.mode': 'subscribe', 'hub.verify_token': 'v', 'hub.challenge': '42'}, 'v'), '42')
        self.assertIsNone(verify({'hub.mode': 'subscribe', 'hub.verify_token': 'w', 'hub.challenge': '42'}, 'v'))
        self.assertIsNone(verify({'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '42'}, None))
        body = b'{"x":1}'
        good = 'sha256=' + hmac.new(b'secret', body, hashlib.sha256).hexdigest()
        self.assertTrue(signed(body, good, 'secret'))
        self.assertFalse(signed(body + b' ', good, 'secret'))
        self.assertFalse(signed(body, good, None))


class Endpoint(unittest.TestCase):
    def setUp(self):
        self.api = load_api('whatsapp-webhook')

    def test_get_answers_metas_check(self):
        with env(WHATSAPP_VERIFY_TOKEN='v'):
            status, _, body = call_wsgi(self.api.app, query='hub.mode=subscribe&hub.verify_token=v&hub.challenge=123')
            self.assertEqual((status, body), (200, '123'))
            self.assertEqual(call_wsgi(self.api.app, query='hub.mode=subscribe&hub.verify_token=no&hub.challenge=1')[0], 403)

    def test_post_needs_the_secret_and_a_matching_signature(self):
        body = json.dumps(payload(voice('wamid.A'))).encode()
        with env(WHATSAPP_APP_SECRET=None):
            self.assertEqual(call_wsgi(self.api.app, 'POST', body=body)[0], 503)
        with env(WHATSAPP_APP_SECRET='secret'):
            self.assertEqual(call_wsgi(self.api.app, 'POST', headers={'x-hub-signature-256': 'sha256=00'}, body=body)[0], 401)

    def test_post_keeps_a_signed_message(self):
        w = World()
        body = json.dumps(payload(voice('wamid.A'))).encode()
        sig = 'sha256=' + hmac.new(b'secret', body, hashlib.sha256).hexdigest()

        class Req:
            headers = {'x-hub-signature-256': sig}
        Req.body = body
        with env(SUPABASE_URL='https://db.example', SUPABASE_SERVICE_ROLE_KEY='service', WHATSAPP_APP_SECRET='secret', WHATSAPP_TOKEN='wa'):
            res = self.api.post(Req, w.http, NOW)
        self.assertEqual(res.status, 200)
        self.assertTrue(res.json_body()['results'][0]['kept'])

    def test_a_failure_asks_meta_to_send_it_again(self):
        body = json.dumps(payload(voice('wamid.A'))).encode()
        sig = 'sha256=' + hmac.new(b'secret', body, hashlib.sha256).hexdigest()

        class Req:
            headers = {'x-hub-signature-256': sig}
        Req.body = body
        with env(SUPABASE_URL='https://db.example', SUPABASE_SERVICE_ROLE_KEY='service', WHATSAPP_APP_SECRET='secret'), quiet():
            res = self.api.post(Req, FakeHttp(lambda *a: (500, {'message': 'down'})), NOW)
        self.assertEqual(res.status, 500)


if __name__ == '__main__':
    unittest.main()
