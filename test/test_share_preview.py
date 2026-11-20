import json
import re
import unittest

from support import ROOT, FakeHttp, call_wsgi, load_api
from backend.share.preview import fetch_shared, preview_for, render_shared

ID = '3b25faca-0997-489e-8bbd-b5f2a0183e8d'
WORD = {'id': ID, 'kind': 'A word or saying', 'title': 'Thakuma', 'script': 'ঠাকুমা', 'body': "What we called my father's mother.", 'credit': 'Asha <b>', 'place_slug': 'bengal', 'suggested_place': None}
BENGAL = {'slug': 'bengal', 'name': 'Bengal', 'image': '/assets/x-1600.jpg', 'imageAlt': 'A street'}
HTML = (ROOT / 'public/shared.html').read_text('utf-8')
VERCEL = json.loads((ROOT / 'vercel.json').read_text('utf-8'))


class SharePreview(unittest.TestCase):
    def test_names_the_contribution_its_place_and_who_shared_it(self):
        p = preview_for(WORD, BENGAL, 'The Cultured Human')
        self.assertEqual(p['title'], 'Thakuma (ঠাকুমা) — The Cultured Human')
        self.assertEqual(p['description'], "A word or saying from Bengal, shared by Asha <b>: What we called my father's mother.")
        self.assertLessEqual(len(preview_for({**WORD, 'body': 'x ' * 300}, None, 'T')['description']), 200)

    def test_page_gets_the_preview_its_address_and_id_all_escaped(self):
        out = render_shared(HTML, WORD, BENGAL, 'https://site.example', 'The Cultured Human')
        self.assertIn('<title>Thakuma (ঠাকুমা) — The Cultured Human</title>', out)
        self.assertIn('<meta property="og:title" content="Thakuma (ঠাকুমা) — The Cultured Human">', out)
        self.assertIn('<meta property="og:description" content="A word or saying from Bengal, shared by Asha &lt;b&gt;: What we called my father&#39;s mother.">', out)
        self.assertIn(f'<meta property="og:url" content="https://site.example/s/{ID}">', out)
        self.assertIn('<meta property="og:image" content="https://site.example/assets/x-1600.jpg">', out)
        self.assertIn(f'<link rel="canonical" href="https://site.example/s/{ID}">', out)
        self.assertIn(f'<meta name="tch-shared-id" content="{ID}">', out)
        self.assertRegex(out, r'<meta name="robots" content="noindex')
        self.assertEqual(out.count('og:title'), 1)

    def test_only_well_formed_published_ids_are_looked_up(self):
        fake = FakeHttp(lambda url, method, headers, body: (200, [WORD]))
        self.assertIsNone(fetch_shared('https://db', 'anon', 'x;drop', fake))
        self.assertEqual(fake.calls, [])
        self.assertEqual(fetch_shared('https://db', 'eyJanon', ID, fake), WORD)
        self.assertRegex(fake.calls[0]['url'], r'status=eq\.published&id=eq\.3b25faca')
        self.assertEqual(fake.calls[0]['headers']['authorization'], 'Bearer eyJanon')

    def test_s_id_is_rewritten_to_the_function_which_answers_404_for_anything_unknown(self):
        self.assertIn({'source': '/s/:id', 'destination': '/api/shared?id=:id'}, VERCEL['rewrites'])
        self.assertRegex(VERCEL['functions']['api/shared.py']['includeFiles'], r'public/shared\.html')
        shared = load_api('shared')
        from backend.web import Request
        missing = shared.get(Request(path='/api/shared', query={'id': ID}, origin='https://site.example'), http=FakeHttp(lambda *a: (200, [])))
        self.assertEqual(missing.status, 404)
        self.assertIn('Looking for it', missing.body.decode())
        found = shared.get(Request(path=f'/s/{ID}', origin='https://site.example'), http=FakeHttp(lambda *a: (200, [WORD])))
        self.assertEqual(found.status, 200)
        self.assertIn('s-maxage', found.headers['cache-control'])
        body = found.body.decode()
        self.assertRegex(body, r'og:image" content="https://site\.example/assets/.*-1600\.jpg')
        self.assertIn('<title>Thakuma', body)

    def test_the_wsgi_app_answers_get_only(self):
        shared = load_api('shared')
        status, headers, _ = call_wsgi(shared.app, 'POST', '/api/shared', f'id={ID}')
        self.assertEqual(status, 405)
        status, headers, body = call_wsgi(shared.app, 'GET', '/api/shared', 'id=not-a-uuid')
        self.assertEqual(status, 404)
        self.assertTrue(headers['content-type'].startswith('text/html'))


if __name__ == '__main__':
    unittest.main()
