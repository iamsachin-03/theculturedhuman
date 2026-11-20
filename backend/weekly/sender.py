"""Sends each person's weekly question on WhatsApp, for the family members who switched on "send it
for me" and said that person agreed. Runs once a day (api/weekly-send.py, a Vercel cron job).
backend/weekly/README.md explains the setup: a WhatsApp Business number, an approved message
template, and the environment variables below. Without the WhatsApp ones it only reports what it
would send.
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from backend.web import iso_utc, supabase

GRAPH = 'https://graph.facebook.com/v21.0'
# Written by tools/build.mjs from public/scripts/app-core.js, so the browser and this agree.
QUESTIONS = json.loads((Path(__file__).parent / 'questions.json').read_text('utf-8'))


def question(n, lang='en'):
    i = n % len(QUESTIONS)
    q = QUESTIONS[i]
    hi = lang == 'hi'
    return {'kind': q['kind'], 'text': q['hi'] if hi else q['text'], 'en': q['text'], 'week': i + 1, 'lang': 'hi' if hi else 'en'}


def weekday_in(time_zone, now):
    """The weekday (0 = Sunday) at `now` in the given IANA time zone."""
    return (now.astimezone(ZoneInfo(time_zone)).weekday() + 1) % 7


def phone_digits(phone, default_country):
    """Digits only, with the country code; a bare 10-digit number gets the default country code."""
    digits = re.sub(r'^00', '', re.sub(r'\D', '', str(phone or '')))
    if len(digits) == 10 and default_country:
        return default_country + digits
    return digits if 11 <= len(digits) <= 15 else ''


def due_today(rows, today):
    """Who gets a question today: switched on, today is their day, a usable number, and no question
    already waiting for an answer (asked_at is cleared when the family member marks it answered or
    skipped)."""
    return [r for r in rows if r.get('auto_send') and r.get('day') == today and not r.get('asked_at') and r.get('phone')]


def template_params(row, owner_name):
    """The template's three parameters, in order: their name, who it is from, the question."""
    first = re.split(r'\s+', str(owner_name or ''))[0]
    sender = (row.get('sign_as') or first or 'your family').strip()
    clean = lambda s: re.sub(r'\s+', ' ', str(s)).strip()
    return [clean(row['name']), clean(sender), clean(question(row['idx'], row.get('lang'))['text'])]


def config(env):
    return {
        'supabase_url': env.get('SUPABASE_URL'),
        'service_key': env.get('SUPABASE_SERVICE_ROLE_KEY'),
        'token': env.get('WHATSAPP_TOKEN'),
        'phone_number_id': env.get('WHATSAPP_PHONE_NUMBER_ID'),
        'template': env.get('WHATSAPP_TEMPLATE') or 'weekly_question',
        'template_lang': env.get('WHATSAPP_TEMPLATE_LANG') or 'en',
        'template_lang_hi': env.get('WHATSAPP_TEMPLATE_LANG_HI') or 'hi',
        'time_zone': env.get('WEEKLY_TIMEZONE') or 'Asia/Kolkata',
        'default_country': env.get('WEEKLY_DEFAULT_COUNTRY', '91'),
    }


def run(cfg, http, now=None, dry_run=False):
    """One day's run. Returns what was sent (or, in a dry run, what would be), and what failed."""
    if not cfg['supabase_url'] or not cfg['service_key']:
        raise RuntimeError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.')
    now = now or datetime.now(timezone.utc)
    live = not dry_run and bool(cfg['token'] and cfg['phone_number_id'])
    db = supabase(cfg['supabase_url'], cfg['service_key'], http)

    today = weekday_in(cfg['time_zone'], now)
    rows = due_today(db(f'weekly_elders?select=id,owner_id,name,phone,day,idx,sign_as,asked_at,auto_send,lang&auto_send=is.true&day=eq.{today}&asked_at=is.null'), today)
    owners = list(dict.fromkeys(r['owner_id'] for r in rows))
    names = {}
    if owners:
        for p in db(f"profiles?select=id,display_name&id=in.({','.join(owners)})"):
            names[p['id']] = p['display_name']

    sent, failed = [], []
    for row in rows:
        to = phone_digits(row['phone'], cfg['default_country'])
        params = template_params(row, names.get(row['owner_id']))
        if not to:
            failed.append({'id': row['id'], 'reason': 'The WhatsApp number is not a full international number.'})
            continue
        if not live:
            sent.append({'id': row['id'], 'to': to, 'params': params, 'dryRun': True})
            continue
        res = http(f"{GRAPH}/{cfg['phone_number_id']}/messages", method='POST',
                   headers={'authorization': f"Bearer {cfg['token']}", 'content-type': 'application/json'},
                   body=json.dumps({
                       'messaging_product': 'whatsapp',
                       'to': to,
                       'type': 'template',
                       'template': {'name': cfg['template'], 'language': {'code': cfg['template_lang_hi'] if row.get('lang') == 'hi' else cfg['template_lang']}, 'components': [{'type': 'body', 'parameters': [{'type': 'text', 'text': t} for t in params]}]},
                   }))
        if not res.ok:
            failed.append({'id': row['id'], 'reason': f'WhatsApp {res.status}: {res.text}'})
            continue
        db(f"weekly_elders?id=eq.{row['id']}", method='PATCH', json_body={'asked_at': iso_utc(now)}, headers={'prefer': 'return=minimal'})
        sent.append({'id': row['id'], 'to': to, 'params': params})
    return {'day': today, 'live': live, 'sent': sent, 'failed': failed}
