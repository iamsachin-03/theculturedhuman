"""Answers sent back to the site's WhatsApp number go straight into the family member's archive.

Meta calls api/whatsapp-webhook.py with each incoming message. A message is kept only when it comes
from the number of someone a family member asks the weekly question for, with "Send it for me"
switched on (they agreed to hear from this number). The first message after a question becomes a
private entry, under that week's question, told by that person; anything else they send within
twelve hours joins the same entry. The weekly question then moves on, the person gets a short
thank-you, and the family member is emailed when email is set up.
backend/weekly/README.md explains the setup.
"""
import hashlib
import hmac
import json
import re
import urllib.parse
from datetime import timedelta

from backend.web import iso_utc, supabase
from backend.weekly.sender import GRAPH, phone_digits, question

GROUP_HOURS = 12
MAX_BYTES = 50 * 1024 * 1024
EXT = {'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'video/mp4': 'mp4',
       'video/3gpp': '3gp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf'}
KIND = {'audio': 'audio', 'voice': 'audio', 'video': 'video', 'image': 'photo', 'document': 'document'}
THANKS = {
    'en': 'Thank you, {name}. Your answer is kept safely for {owner}.',
    'hi': 'धन्यवाद, {name}। आपका जवाब {owner} के लिए सँभालकर रख लिया गया है।',
}


def config(env):
    return {
        'supabase_url': env.get('SUPABASE_URL'),
        'service_key': env.get('SUPABASE_SERVICE_ROLE_KEY'),
        'token': env.get('WHATSAPP_TOKEN'),
        'phone_number_id': env.get('WHATSAPP_PHONE_NUMBER_ID'),
        'app_secret': env.get('WHATSAPP_APP_SECRET'),
        'verify_token': env.get('WHATSAPP_VERIFY_TOKEN'),
        'default_country': env.get('WEEKLY_DEFAULT_COUNTRY', '91'),
        'resend_key': env.get('RESEND_API_KEY'),
        'from': env.get('EMAIL_FROM'),
        'site_url': (env.get('SITE_URL') or 'https://theculturedhuman.com').rstrip('/'),
    }


def verify(query, verify_token):
    """Meta's subscription check: the challenge to echo back, or None."""
    if verify_token and query.get('hub.mode') == 'subscribe' and hmac.compare_digest(str(query.get('hub.verify_token') or ''), verify_token):
        return str(query.get('hub.challenge') or '')
    return None


def signed(body, header, app_secret):
    """True when X-Hub-Signature-256 is this body signed with the app secret."""
    if not app_secret or not header:
        return False
    expected = 'sha256=' + hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, str(header))


def messages(payload):
    for entry in (payload or {}).get('entry') or []:
        for change in entry.get('changes') or []:
            for m in (change.get('value') or {}).get('messages') or []:
                yield m


def asker(elders, sender, default_country):
    """Of the people with this number, the one asked most recently."""
    mine = [e for e in elders if phone_digits(e.get('phone'), default_country) == sender]
    mine.sort(key=lambda e: (e.get('asked_at') is not None, e.get('asked_at') or '', e.get('created_at') or ''), reverse=True)
    return mine[0] if mine else None


def file_name(kind, mime, sent_at, original=None):
    if original:
        return re.sub(r'[^\w.\- ]', '', original)[:80] or 'file'
    ext = EXT.get((mime or '').split(';')[0].strip(), 'bin')
    label = {'audio': 'voice-note', 'video': 'video', 'photo': 'photo', 'document': 'document'}[kind]
    return f"{label}-{sent_at.strftime('%Y-%m-%d-%H-%M')}.{ext}"


def handle(payload, cfg, http, now):
    """Keeps each new message from a known person. Returns what happened to each, for the logs."""
    if not cfg['supabase_url'] or not cfg['service_key']:
        raise RuntimeError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.')
    db = supabase(cfg['supabase_url'], cfg['service_key'], http)
    service = {'apikey': cfg['service_key'], 'authorization': f"Bearer {cfg['service_key']}"}
    graph = {'authorization': f"Bearer {cfg['token']}"}
    results = []
    elders = None
    for m in messages(payload):
        mid = str(m.get('id') or '')
        sender = re.sub(r'\D', '', str(m.get('from') or ''))
        kind = 'text' if m.get('type') == 'text' else KIND.get(m.get('type'))
        if not mid or not sender or not kind:
            results.append({'id': mid, 'kept': False, 'reason': 'not a message we keep'})
            continue
        if db(f'whatsapp_messages?select=id&id=eq.{urllib.parse.quote(mid)}'):
            results.append({'id': mid, 'kept': False, 'reason': 'already kept'})
            continue
        if elders is None:
            elders = db('weekly_elders?select=id,owner_id,name,phone,idx,answered,asked_at,lang,created_at&auto_send=is.true&phone=not.is.null')
        elder = asker(elders, sender, cfg['default_country'])
        if not elder:
            results.append({'id': mid, 'kept': False, 'reason': 'not from anyone asked the weekly question'})
            continue

        meta = None
        if kind != 'text':
            info = http(f"{GRAPH}/{(m.get(m['type']) or {}).get('id')}", headers=graph)
            if not info.ok:
                raise RuntimeError(f'WhatsApp media {info.status}: {info.text}')
            meta = info.json()

        recent = db(f"whatsapp_messages?select=entry_id&elder_id=eq.{elder['id']}&created_at=gte.{urllib.parse.quote(iso_utc(now - timedelta(hours=GROUP_HOURS)))}&order=created_at.desc&limit=1")
        entry = None
        if recent:
            rows = db(f"entries?select=id,owner_id,body&id=eq.{recent[0]['entry_id']}")
            entry = rows[0] if rows else None
        text = (m.get('text') or {}).get('body', '').strip() if kind == 'text' else ((m.get(m['type']) or {}).get('caption') or '').strip()
        new = entry is None
        if new:
            q = question(elder['idx'], elder.get('lang'))
            entry = db('entries', 'POST', {
                'owner_id': elder['owner_id'], 'created_by': elder['owner_id'], 'kind': q['kind'],
                'title': q['text'] if len(q['text']) <= 120 else q['text'][:117] + '…', 'prompt': q['text'], 'teller': elder['name'],
                'body': text, 'audience': 'private',
            }, {'prefer': 'return=representation'})[0]
        elif text:
            body = ((entry.get('body') or '') + '\n\n' + text).strip()
            db(f"entries?id=eq.{entry['id']}", 'PATCH', {'body': body, 'updated_at': iso_utc(now)}, {'prefer': 'return=minimal'})
            entry['body'] = body

        if kind != 'text' and int(meta.get('file_size') or 0) > MAX_BYTES:
            note = 'A file too large to keep (over 50 MB) arrived on WhatsApp; ask for it to be sent another way.'
            db(f"entries?id=eq.{entry['id']}", 'PATCH', {'body': ((entry.get('body') or '') + '\n\n' + note).strip()}, {'prefer': 'return=minimal'})
            kind = 'too large'
        if kind not in ('text', 'too large'):
            got = http(meta['url'], headers=graph, timeout=60)
            if not got.ok:
                raise RuntimeError(f'WhatsApp download {got.status}')
            mime = (meta.get('mime_type') or 'application/octet-stream').split(';')[0].strip()
            name = file_name(kind, mime, now, (m.get('document') or {}).get('filename'))
            path = f"{elder['owner_id']}/{entry['id']}/{mid[-12:]}-{name}".replace(' ', '-')
            up = http(f"{cfg['supabase_url']}/storage/v1/object/archive/{urllib.parse.quote(path)}", method='POST',
                      headers={**service, 'content-type': mime, 'x-upsert': 'true'}, body=got.content, timeout=60)
            if not up.ok:
                raise RuntimeError(f'Storage {up.status}: {up.text}')
            db('media', 'POST', {'entry_id': entry['id'], 'owner_id': elder['owner_id'], 'kind': kind, 'name': name, 'mime': mime, 'size': len(got.content), 'path': path}, {'prefer': 'return=minimal'})

        db('whatsapp_messages', 'POST', {'id': mid, 'elder_id': elder['id'], 'entry_id': entry['id']}, {'prefer': 'return=minimal'})
        if new:
            db(f"weekly_elders?id=eq.{elder['id']}", 'PATCH', {'idx': elder['idx'] + 1, 'answered': elder['answered'] + 1, 'asked_at': None}, {'prefer': 'return=minimal'})
            elder['idx'] += 1
            elder['answered'] += 1
            elder['asked_at'] = None
            thank(cfg, http, db, elder, sender)
            tell_owner(cfg, http, service, elder, entry)
        results.append({'id': mid, 'kept': True, 'entry': entry['id'], 'new': new})
    return results


def owner_name(db, owner_id):
    rows = db(f'profiles?select=display_name&id=eq.{owner_id}')
    return re.split(r'\s+', rows[0]['display_name'].strip())[0] if rows else 'your family'


def thank(cfg, http, db, elder, sender):
    if not cfg['token'] or not cfg['phone_number_id']:
        return
    words = THANKS['hi' if elder.get('lang') == 'hi' else 'en'].format(name=elder['name'], owner=owner_name(db, elder['owner_id']))
    http(f"{GRAPH}/{cfg['phone_number_id']}/messages", method='POST', headers={'authorization': f"Bearer {cfg['token']}", 'content-type': 'application/json'},
         body=json.dumps({'messaging_product': 'whatsapp', 'to': sender, 'type': 'text', 'text': {'body': words}}))


def tell_owner(cfg, http, service, elder, entry):
    if not cfg['resend_key'] or not cfg['from']:
        return
    user = http(f"{cfg['supabase_url']}/auth/v1/admin/users/{elder['owner_id']}", headers=service)
    email = (user.json() or {}).get('email') if user.ok else None
    if not email:
        return
    http('https://api.resend.com/emails', method='POST', headers={'authorization': f"Bearer {cfg['resend_key']}", 'content-type': 'application/json'},
         body=json.dumps({
             'from': cfg['from'], 'to': [email],
             'subject': f"{elder['name']} answered this week's question",
             'text': f"{elder['name']} sent an answer on WhatsApp. It is in your archive, visible only to you until you choose who sees it:\n"
                     f"{cfg['site_url']}/app#/entry/{entry['id']}\n\nWith thanks,\nThe Cultured Human",
         }))
