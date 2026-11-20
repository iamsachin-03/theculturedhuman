"""Private cards: GET /card/<token> (rewritten to api/card.py) plays one recording, or shows one
photograph, from a family archive to someone without an account. The owner makes the card in the
app; the link works until it expires or they withdraw it. Read with the service key, but only the
card's own recording and the words around it ever leave the database.
"""
import re
import urllib.parse

from backend.share.preview import esc
from backend.web import iso_utc, supabase

TOKEN = re.compile(r'^[0-9a-f]{64}$')
SIGNED_FOR = 6 * 60 * 60


def config(env):
    return {'supabase_url': env.get('SUPABASE_URL'), 'service_key': env.get('SUPABASE_SERVICE_ROLE_KEY')}


def fetch_card(cfg, token, http, now):
    """The card with its recording and a link to play it, or None when there is no such live card."""
    if not TOKEN.match(str(token or '')) or not cfg['supabase_url'] or not cfg['service_key']:
        return None
    db = supabase(cfg['supabase_url'], cfg['service_key'], http)
    rows = db('cards?select=id,owner_id,note,expires_at,views,'
              'media:media_id(name,kind,mime,path,transcript,translation),entry:entry_id(title,teller)'
              f'&token=eq.{token}&revoked_at=is.null&expires_at=gt.{urllib.parse.quote(iso_utc(now))}')
    if not rows or not rows[0].get('media'):
        return None
    card = rows[0]
    owner = db(f"profiles?select=display_name&id=eq.{card['owner_id']}")
    card['from'] = owner[0]['display_name'] if owner else ''
    signed = http(f"{cfg['supabase_url']}/storage/v1/object/sign/archive/{urllib.parse.quote(card['media']['path'])}", method='POST',
                  headers={'apikey': cfg['service_key'], 'authorization': f"Bearer {cfg['service_key']}", 'content-type': 'application/json'},
                  body=f'{{"expiresIn": {SIGNED_FOR}}}')
    if not signed.ok:
        raise RuntimeError(f'Storage {signed.status}: {signed.text}')
    card['src'] = cfg['supabase_url'] + '/storage/v1' + signed.json()['signedURL']
    db(f"cards?id=eq.{card['id']}", 'PATCH', {'views': card['views'] + 1}, {'prefer': 'return=minimal'})
    return card


def first_name(name):
    return (str(name or '').strip().split() or [''])[0]


def date(iso):
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', str(iso or ''))
    months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return f'{int(m.group(3))} {months[int(m.group(2)) - 1]} {m.group(1)}' if m else ''


def paragraphs(text):
    return ''.join(f'<p>{esc(p)}</p>' for p in re.split(r'\n{2,}', str(text).strip()) if p.strip())


PAGE = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{title}</title>
<meta property="og:title" content="{og}">
<meta property="og:description" content="Shared privately from a family archive on The Cultured Human.">
<link rel="icon" href="/brand/favicon-32.png" type="image/png" sizes="32x32">
<style>
  body {{ margin: 0; background: #f6f1e7; color: #2b2622; font: 400 17px/1.65 Georgia, 'Times New Roman', serif; }}
  main {{ max-width: 34rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }}
  .card {{ background: #fffdf8; border: 1px solid #e3d9c6; outline: 1px solid #c9a96a; outline-offset: -10px; padding: 2.5rem 1.75rem; text-align: center; }}
  .eyebrow {{ font: 600 12px/1.3 system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #7a6f63; margin: 0; }}
  h1 {{ font-weight: 500; font-size: 2rem; line-height: 1.15; color: #1f3b2f; margin: .8rem 0 .4rem; }}
  .teller {{ font-style: italic; margin: 0 0 1.4rem; }}
  .note {{ border-left: 3px solid #c9a96a; text-align: left; padding: .2rem 0 .2rem 1rem; margin: 0 0 1.6rem; }}
  audio, video, img {{ width: 100%; border-radius: 4px; }}
  .said {{ text-align: left; margin-top: 1.6rem; }}
  .said h2 {{ font: 600 12px/1.3 system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #7a6f63; margin: 1.2rem 0 .3rem; }}
  .said p {{ white-space: pre-wrap; margin: 0 0 .6rem; }}
  footer {{ font: 13px/1.5 system-ui, sans-serif; color: #7a6f63; text-align: center; margin-top: 1.5rem; }}
  footer a {{ color: inherit; }}
</style>
</head>
<body>
<main>
{body}
</main>
</body>
</html>
'''


def render(card):
    m, e = card['media'], card.get('entry') or {}
    who = first_name(card['from'])
    if m['kind'] == 'audio':
        player = f'<audio controls preload="metadata" src="{esc(card["src"])}"></audio>'
    elif m['kind'] == 'video':
        player = f'<video controls playsinline preload="metadata" src="{esc(card["src"])}"></video>'
    else:
        player = f'<img src="{esc(card["src"])}" alt="{esc(e.get("title") or m["name"])}">'
    said = ''
    if m.get('transcript'):
        said += f'<h2>What is said</h2>{paragraphs(m["transcript"])}'
    if m.get('translation'):
        said += f'<h2>In English</h2>{paragraphs(m["translation"])}'
    body = (
        '<article class="card">'
        f'<p class="eyebrow">From {esc(who + chr(8217) + "s" if who else "a")} family archive</p>'
        f'<h1>{esc(e.get("title") or m["name"])}</h1>'
        + (f'<p class="teller">Told by {esc(e["teller"])}</p>' if e.get('teller') else '<p class="teller"></p>')
        + (f'<div class="note">{paragraphs(card["note"])}</div>' if card.get('note') else '')
        + player
        + (f'<div class="said">{said}</div>' if said else '')
        + '</article>'
        f'<footer><p>Shared privately with you{" by " + esc(card["from"]) if card["from"] else ""}. Please keep the link in the family. '
        f'It stops working on {esc(date(card["expires_at"]))}.</p>'
        '<p><a href="/">The Cultured Human</a> keeps families\u2019 stories, voices and photographs, privately.</p></footer>'
    )
    title = f'{e.get("title") or m["name"]} — a family {"voice note" if m["kind"] == "audio" else "video" if m["kind"] == "video" else "photograph"}'
    return PAGE.format(title=esc(title), og=esc(f'A family {"voice note" if m["kind"] == "audio" else "recording"}, shared privately'), body=body)


GONE = PAGE.format(title='This card is no longer here', og='A private family card', body=(
    '<article class="card"><p class="eyebrow">A private family card</p><h1>This card is no longer here.</h1>'
    '<p>It may have expired, or the person who shared it withdrew it. Ask them to send a new one.</p></article>'
    '<footer><p><a href="/">The Cultured Human</a></p></footer>'))
