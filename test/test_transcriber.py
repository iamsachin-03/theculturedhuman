import json
import unittest

from support import FakeHttp, call_wsgi, env, load_api, quiet
from backend.transcribe.transcriber import TranscribeError, config, multipart, transcribe

ID = '11111111-2222-3333-4444-555555555555'
CFG = config({'SUPABASE_URL': 'https://db.example', 'SUPABASE_ANON_KEY': 'anon', 'OPENAI_API_KEY': 'sk-test'})
AUDIO = b'\x00\x01voice'


def fake(row=None, editable=True, language='hindi', said='नानी गाती थीं', english='Nani used to sing'):
    row = {'id': ID, 'kind': 'audio', 'name': 'nani.m4a', 'mime': 'audio/mp4', 'size': 900, 'path': f'owner/entry/nani.m4a', 'transcript_by': None, **(row or {})}

    def route(url, method, headers, body):
        if '/rest/v1/media?id=eq.' in url and method == 'GET':
            return 200, [row]
        if '/rest/v1/media?id=eq.' in url and method == 'PATCH':
            return (200, [row] if editable else []) if headers.get('prefer') == 'return=representation' else (204, None)
        if url.endswith('?token=t'):
            return 200, AUDIO
        if '/storage/v1/object/sign/' in url:
            return 200, {'signedURL': '/object/sign/archive/owner/entry/nani.m4a?token=t'}
        if url.endswith('/audio/transcriptions'):
            return 200, {'text': said, 'language': language}
        if url.endswith('/audio/translations'):
            return 200, {'text': english}
        return 404, {}
    return FakeHttp(route)


class Transcriber(unittest.TestCase):
    def assertRefused(self, status, fn):
        with self.assertRaises(TranscribeError) as caught:
            fn()
        self.assertEqual(caught.exception.status, status)

    def test_it_does_nothing_until_it_is_switched_on_and_asked_properly(self):
        self.assertRefused(503, lambda: transcribe(config({}), 'tok', ID, fake()))
        self.assertRefused(401, lambda: transcribe(CFG, '', ID, fake()))
        self.assertRefused(400, lambda: transcribe(CFG, 'tok', 'x;drop', fake()))

    def test_it_refuses_what_the_person_cannot_see_or_change(self):
        empty = FakeHttp(lambda url, method, headers, body: (200, []))
        self.assertRefused(404, lambda: transcribe(CFG, 'tok', ID, empty))
        self.assertRefused(400, lambda: transcribe(CFG, 'tok', ID, fake({'kind': 'photo'})))
        self.assertRefused(409, lambda: transcribe(CFG, 'tok', ID, fake({'transcript_by': 'machine'})))
        self.assertRefused(413, lambda: transcribe(CFG, 'tok', ID, fake({'size': 30 * 1024 * 1024})))
        http = fake(editable=False)
        self.assertRefused(403, lambda: transcribe(CFG, 'tok', ID, http))
        self.assertFalse(any('openai.com' in c['url'] for c in http.calls), 'nothing is sent to OpenAI for someone who cannot edit')

    def test_a_hindi_voice_note_is_written_down_and_translated_with_the_persons_own_sign_in(self):
        http = fake()
        self.assertEqual(transcribe(CFG, 'tok', ID, http), {'transcript': 'नानी गाती थीं', 'translation': 'Nani used to sing', 'language': 'hindi'})
        db = [c for c in http.calls if 'db.example' in c['url'] and c['method'] != 'GET' or '/rest/v1/' in c['url']]
        self.assertTrue(all(c['headers']['authorization'] == 'Bearer tok' and c['headers']['apikey'] == 'anon' for c in db), 'every database and storage call acts as the person')
        speech = [c for c in http.calls if 'openai.com' in c['url']]
        self.assertEqual([c['url'].rsplit('/', 1)[1] for c in speech], ['transcriptions', 'translations'])
        self.assertIn(AUDIO, speech[0]['body'])
        self.assertIn(b'name="model"\r\n\r\nwhisper-1', speech[0]['body'])
        self.assertEqual(speech[0]['headers']['authorization'], 'Bearer sk-test')
        saved = [c for c in db if c['method'] == 'PATCH'][-1]
        self.assertEqual(saved['body'], {'transcript': 'नानी गाती थीं', 'translation': 'Nani used to sing', 'transcript_by': 'machine'})

    def test_english_is_not_translated_into_english(self):
        http = fake(language='english', said='Nani used to sing')
        self.assertEqual(transcribe(CFG, 'tok', ID, http)['translation'], '')
        self.assertFalse(any(c['url'].endswith('/translations') for c in http.calls))

    def test_the_file_name_cannot_break_out_of_the_form(self):
        body, content_type = multipart({'model': 'whisper-1'}, 'a"\r\nb.m4a', 'audio/mp4', b'x')
        self.assertIn(b'filename="a___b.m4a"', body)
        self.assertTrue(content_type.startswith('multipart/form-data; boundary='))


class TranscribeEndpoint(unittest.TestCase):
    api = load_api('transcribe')

    def test_refusals_come_back_as_a_message_and_the_right_status(self):
        with env(SUPABASE_URL='https://db.example', SUPABASE_ANON_KEY='anon', OPENAI_API_KEY='sk-test'):
            status, _, body = call_wsgi(self.api.app, 'POST', '/api/transcribe', body=json.dumps({'media': ID}).encode())
        self.assertEqual(status, 401)
        self.assertIn('sign in', json.loads(body)['error'])

    def test_a_failure_elsewhere_is_reported_without_details(self):
        broken = FakeHttp(lambda url, method, headers, body: (500, {'secret': 'internal'}))
        req = self.api.Request('POST', '/api/transcribe', headers={'authorization': 'Bearer tok'}, body=json.dumps({'media': ID}).encode())
        with env(SUPABASE_URL='https://db.example', SUPABASE_ANON_KEY='anon', OPENAI_API_KEY='sk-test'), quiet():
            res = self.api.post(req, http=broken)
        self.assertEqual(res.status, 502)
        self.assertNotIn('internal', res.body.decode())


if __name__ == '__main__':
    unittest.main()
