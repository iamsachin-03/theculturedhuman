"""Emails people when something they are waiting for happens: what they shared was published (or
not, with the moderator's reason), and each step of a booking. Runs as a daily cron (api/notify.py).
Every email is remembered in notified_status, so nobody is told the same thing twice.
Without RESEND_API_KEY and EMAIL_FROM it only reports what it would send.
"""
import json
import urllib.parse
from datetime import datetime, timedelta, timezone

from backend.web import iso_utc, supabase

RESEND = 'https://api.resend.com/emails'
SIGN_OFF = '\n\nWith thanks,\nThe Cultured Human'


def config(env):
    return {
        'supabase_url': env.get('SUPABASE_URL'),
        'service_key': env.get('SUPABASE_SERVICE_ROLE_KEY'),
        'resend_key': env.get('RESEND_API_KEY'),
        'from': env.get('EMAIL_FROM'),
        'site_url': (env.get('SITE_URL') or 'https://theculturedhuman.com').rstrip('/'),
        # Rows older than this are never emailed about, so turning the notifier on doesn't mail a backlog.
        'lookback_days': float(env.get('NOTIFY_LOOKBACK_DAYS') or 14),
    }


def contribution_email(c, place_name, site_url):
    """The email for a contribution whose status changed, or None when there is nothing to say."""
    on_place = bool(c.get('place_slug') and place_name)
    where = f'the {place_name} page' if on_place else 'The Commons'
    link = f"{site_url}/places/{c['place_slug']}.html" if c.get('place_slug') else f'{site_url}/manch.html'
    if c['status'] == 'published':
        return {
            'subject': f"“{c['title']}” is now on {place_name if on_place else 'The Commons'}",
            'text': f"Thank you for sharing “{c['title']}”. It has been read and is now on {where}:\n{link}\n\n"
            f"Here is its own page, to send to your family:\n{site_url}/s/{c['id']}\n\n"
            f"This week's question is waiting at {site_url}/manch.html#this-week{SIGN_OFF}",
        }
    if c['status'] == 'rejected':
        return {
            'subject': f"About “{c['title']}”",
            'text': f"Thank you for sharing “{c['title']}”. We have not published it this time.\n\n"
            + (f"The reason: {c['review_note']}\n\n" if c.get('review_note') else '')
            + f'You can change it and send it again from what you have shared:\n{site_url}/app.html#/contribute\n\n'
            f'Our community guidelines: {site_url}/community-guidelines.html{SIGN_OFF}',
        }
    return None


def booking_email(b, listing_name, site_url):
    """The email for a booking whose status changed: who it goes to, and what it says."""
    requests = f'{site_url}/app.html#/requests'
    status = b.get('status')
    if status == 'requested':
        return {'to': 'provider', 'subject': f'A new request for {listing_name}', 'text': f'A family has sent a request to {listing_name}. Read it and reply with your price here:\n{requests}{SIGN_OFF}'}
    if status == 'quoted':
        return {'to': 'family', 'subject': f'{listing_name} has replied to your request', 'text': f'{listing_name} has replied with a price. Read it and accept it here:\n{requests}{SIGN_OFF}'}
    if status == 'accepted':
        return {'to': 'provider', 'subject': 'Your quote was accepted', 'text': f"The family accepted your quote for {listing_name}. You can now see each other's email address here:\n{requests}\n\nWe will tell you as soon as they have paid.{SIGN_OFF}"}
    if status == 'paid':
        return {'to': 'provider', 'subject': 'Paid: you can begin', 'text': f'The family has paid for {listing_name}. You can begin the work, and reach them here:\n{requests}{SIGN_OFF}'}
    return None


def run(cfg, http, now=None, dry_run=False):
    """One run. Returns what was sent (or, without an email key or in a dry run, what would be), and what failed."""
    if not cfg['supabase_url'] or not cfg['service_key']:
        raise RuntimeError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed.')
    now = now or datetime.now(timezone.utc)
    live = not dry_run and bool(cfg['resend_key'] and cfg['from'])
    db = supabase(cfg['supabase_url'], cfg['service_key'], http)
    since = urllib.parse.quote(iso_utc(now - timedelta(days=cfg['lookback_days'])), safe='')

    contributions = [c for c in db(f'place_contributions?select=id,title,place_slug,status,review_note,notified_status,submitted_by&status=in.(published,rejected)&created_at=gte.{since}') if c.get('notified_status') != c['status']]
    bookings = [b for b in db(f'bookings?select=id,status,notified_status,requested_by,listings(name,user_id)&status=in.(requested,quoted,accepted,paid)&created_at=gte.{since}') if b.get('notified_status') != b['status'] and b.get('listings')]

    users = list(dict.fromkeys([c['submitted_by'] for c in contributions] + [u for b in bookings for u in (b['requested_by'], b['listings']['user_id'])]))
    emails = {}
    if users:
        for r in db(f"contacts?select=user_id,email&user_id=in.({','.join(users)})"):
            emails[r['user_id']] = r['email']
    places = {}
    if any(c.get('place_slug') for c in contributions):
        for p in db('places?select=slug,name'):
            places[p['slug']] = p['name']

    jobs = [{'table': 'place_contributions', 'row': c, 'to': emails.get(c['submitted_by']), 'mail': contribution_email(c, places.get(c.get('place_slug')), cfg['site_url'])} for c in contributions]
    for b in bookings:
        mail = booking_email(b, b['listings']['name'], cfg['site_url'])
        jobs.append({'table': 'bookings', 'row': b, 'to': emails.get(b['listings']['user_id'] if mail['to'] == 'provider' else b['requested_by']), 'mail': mail})

    def remember(job):
        db(f"{job['table']}?id=eq.{job['row']['id']}", method='PATCH', json_body={'notified_status': job['row']['status']}, headers={'prefer': 'return=minimal'})

    sent, failed = [], []
    for job in jobs:
        item = {'table': job['table'], 'id': job['row']['id'], 'status': job['row']['status'], 'to': job['to'], 'subject': job['mail']['subject']}
        if not live:
            sent.append({**item, 'dryRun': True})
            continue
        if not job['to']:
            # Nobody to tell; remember it anyway so it isn't looked at every day.
            remember(job)
            failed.append({**item, 'reason': 'No email address on file.'})
            continue
        res = http(RESEND, method='POST', headers={'authorization': f"Bearer {cfg['resend_key']}", 'content-type': 'application/json'},
                   body=json.dumps({'from': cfg['from'], 'to': [job['to']], 'subject': job['mail']['subject'], 'text': job['mail']['text']}))
        if not res.ok:
            failed.append({**item, 'reason': f'Email {res.status}: {res.text}'})
            continue
        remember(job)
        sent.append(item)
    return {'live': live, 'sent': sent, 'failed': failed}
