import json
import unittest
import urllib.parse
from datetime import datetime, timezone

from support import ROOT, FakeHttp, env, load_api, quiet
from backend.cards.card import config, fetch_card, render
from backend.web import Request

NOW = datetime(2026, 11, 20, 9, 0, tzinfo=timezone.utc)
TOKEN = 'a' * 64
CFG = config({'SUPABASE_URL': 'https://db.example', 'SUPABASE_SERVICE_ROLE_KEY': 'service'})


def card_row(**media):
    return {'id': 'c1', 'owner_id': 'o1', 'note': 'For Mamaji, <with love>', 'expires_at': '2026-12-20T09:00:00.000Z', 'views': 2,
            'media': {'name': 'song.m4a', 'kind': 'audio', 'mime': 'audio/mp4', 'path': 'o1/e1/song.m4a', 'transcript': 'मछली जल की रानी है', 'translation': 'The fish is queen of the water', **media},
            'entry': {'title': 'Nani sings', 'teller': 'Nani'}}


def fake(rows):
    def route(url, method, headers, body):
        u = urllib.parse.urlparse(url)
        if u.path == '/rest/v1/cards' and method == 'GET':
            q = dict(urllib.parse.parse_qsl(u.query))
            assert q['revoked_at'] == 'is.null' and q['expires_at'] == 'gt.2026-11-20T09:00:00.000Z' and q['token'] == f'eq.{TOKEN}'
            return 200, rows
        if u.path == '/rest/v1/cards' and method == 'PATCH':
            return 204, None
        if u.path == '/rest/v1/profiles':
            return 200, [{'display_name': 'Asha Rao'}]
        if u.path.startswith('/storage/v1/object/sign/archive/'):
            return 200, {'signedURL': '/object/sign/archive/o1/e1/song.m4a?token=s'}
        return 404, {}
    return FakeHttp(route)


class Card(unittest.TestCase):
    def test_a_live_card_plays_its_recording_and_counts_the_play(self):
        http = fake([card_row()])
        card = fetch_card(CFG, TOKEN, http, NOW)
        self.assertEqual(card['src'], 'https://db.example/storage/v1/object/sign/archive/o1/e1/song.m4a?token=s')
        self.assertEqual(card['from'], 'Asha Rao')
        self.assertEqual(http.calls[-1]['body'], {'views': 3})
        page = render(card)
        self.assertIn("From Asha’s family archive", page)
        self.assertIn('<audio controls preload="metadata" src="https://db.example/storage/v1/object/sign/archive/o1/e1/song.m4a?token=s">', page)
        self.assertIn('For Mamaji, &lt;with love&gt;', page)
        self.assertIn('<h2>In English</h2><p>The fish is queen of the water</p>', page)
        self.assertIn('stops working on 20 December 2026', page)
        self.assertIn('noindex', page)

    def test_photographs_and_videos(self):
        self.assertIn('<img src=', render({**card_row(kind='photo', transcript=None, translation=None), 'src': 'x', 'from': ''}))
        self.assertIn('<video controls', render({**card_row(kind='video'), 'src': 'x', 'from': 'Asha'}))

    def test_bad_tokens_expired_or_withdrawn_cards_show_nothing(self):
        self.assertIsNone(fetch_card(CFG, 'short', fake([card_row()]), NOW))
        self.assertIsNone(fetch_card(CFG, TOKEN, fake([]), NOW))
        self.assertIsNone(fetch_card(config({}), TOKEN, fake([card_row()]), NOW))

    def test_card_links_are_rewritten_to_the_function(self):
        vercel = json.loads((ROOT / 'vercel.json').read_text())
        self.assertIn({'source': '/card/:token', 'destination': '/api/card?token=:token'}, vercel['rewrites'])

    def test_the_endpoint(self):
        api = load_api('card')
        with env(SUPABASE_URL='https://db.example', SUPABASE_SERVICE_ROLE_KEY='service'):
            res = api.get(Request(path=f'/card/{TOKEN}'), fake([card_row()]), NOW)
            self.assertEqual(res.status, 200)
            self.assertEqual(res.headers['cache-control'], 'private, no-store')
            self.assertEqual(api.get(Request(path=f'/card/{TOKEN}'), fake([]), NOW).status, 404)
            with quiet():
                self.assertEqual(api.get(Request(path=f'/card/{TOKEN}'), FakeHttp(lambda *a: (500, {})), NOW).status, 503)


if __name__ == '__main__':
    unittest.main()
