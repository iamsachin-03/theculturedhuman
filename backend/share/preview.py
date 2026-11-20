"""Link previews for /s/<id>: WhatsApp, LinkedIn and others read the page without running scripts,
so the function behind /s/<id> (api/shared.py) fills in the title, description and picture of the
contribution before sending public/shared.html. Only published contributions are read, with the
public key, so nothing here can reveal anything the site doesn't already show.
"""
import re

UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
_ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}


def esc(s):
    return re.sub(r'[&<>"\']', lambda m: _ESCAPES[m.group(0)], str(s))


def fetch_shared(url, key, id, http):
    if not UUID.match(str(id or '')) or not url or not key:
        return None
    headers = {'apikey': key}
    if key.startswith('eyJ'):
        headers['authorization'] = f'Bearer {key}'
    res = http(f'{url}/rest/v1/place_contributions?select=id,kind,title,body,credit,place_slug,suggested_place,script&status=eq.published&id=eq.{id}', headers=headers)
    if not res.ok:
        return None
    rows = res.json() or []
    return rows[0] if rows else None


def short(text, limit):
    t = re.sub(r'\s+', ' ', str(text)).strip()
    return re.sub(r'\s+\S*$', '', t[: limit - 1]) + '…' if len(t) > limit else t


def preview_for(c, place, site_name):
    """What the preview says: "Thakuma (ঠাকুমা)", "A word or saying from Bengal, shared by Asha: …"."""
    place_name = place['name'] if place else (c.get('suggested_place') or '')
    title = f"{c['title']}{' (' + c['script'] + ')' if c.get('script') else ''} — {site_name}"
    description = short(f"{c['kind']}{' from ' + place_name if place_name else ''}, shared by {c['credit']}: {c['body']}", 200)
    return {'title': title, 'description': description}


def _set_meta(html, attr, name, value):
    pattern = re.compile(f'<meta {attr}="{re.escape(name)}" content="[^"]*">')
    tag = f'<meta {attr}="{name}" content="{esc(value)}">'
    if pattern.search(html):
        return pattern.sub(lambda m: tag, html, count=1)
    return html.replace('</head>', f'{tag}\n</head>', 1)


def render_shared(html, contribution, place, origin, site_name):
    """public/shared.html with this contribution's preview, address and id filled in."""
    url = f"{origin}/s/{contribution['id']}"
    p = preview_for(contribution, place, site_name)
    out = re.sub(r'<title>[^<]*</title>', lambda m: f"<title>{esc(p['title'])}</title>", html, count=1)
    out = _set_meta(out, 'name', 'description', p['description'])
    out = _set_meta(out, 'property', 'og:title', p['title'])
    out = _set_meta(out, 'property', 'og:description', p['description'])
    out = _set_meta(out, 'property', 'og:url', url)
    out = _set_meta(out, 'property', 'og:type', 'article')
    if place and place.get('image'):
        out = _set_meta(out, 'property', 'og:image', origin + place['image'])
        out = _set_meta(out, 'property', 'og:image:alt', place.get('imageAlt') or place['name'])
    out = re.sub(r'<link rel="canonical" href="[^"]*">', lambda m: f'<link rel="canonical" href="{esc(url)}">', out, count=1)
    return out.replace('</head>', f'<meta name="tch-shared-id" content="{esc(contribution["id"])}">\n</head>', 1)
