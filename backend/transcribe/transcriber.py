"""Writes down what is said in a voice note or video kept in a family archive, and translates it into
English when it was said in another language. Runs only when someone who may edit the entry asks
(api/transcribe.py), and acts with their sign-in, so the database's own rules decide what they may
read and change. The recording is sent to OpenAI's speech-to-text API for this and nothing else.
"""
import json
import re
import urllib.parse
import uuid

OPENAI = 'https://api.openai.com/v1'
# OpenAI's limit for one file.
MAX_BYTES = 25 * 1024 * 1024
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')


class TranscribeError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def config(env):
    return {
        'supabase_url': env.get('SUPABASE_URL'),
        'anon_key': env.get('SUPABASE_ANON_KEY'),
        'openai_key': env.get('OPENAI_API_KEY'),
        'model': env.get('TRANSCRIBE_MODEL') or 'whisper-1',
        'openai_url': (env.get('OPENAI_BASE_URL') or OPENAI).rstrip('/'),
    }


def multipart(fields, filename, mime, data):
    """A multipart/form-data body with text fields and one file, and its content type."""
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    safe = re.sub(r'[^\w.-]', '_', filename) or 'recording'
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + data + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    return b''.join(parts), f'multipart/form-data; boundary={boundary}'


def is_english(language):
    return str(language or '').strip().lower() in ('english', 'en')


def transcribe(cfg, token, media_id, http):
    if not cfg['openai_key'] or not cfg['supabase_url'] or not cfg['anon_key']:
        raise TranscribeError(503, 'Automatic transcripts are not switched on yet.')
    if not token:
        raise TranscribeError(401, 'Please sign in again.')
    if not UUID.match(str(media_id or '')):
        raise TranscribeError(400, 'Which recording?')
    base = cfg['supabase_url']
    as_user = {'apikey': cfg['anon_key'], 'authorization': f'Bearer {token}'}

    def rest(path, method='GET', body=None, prefer=None):
        headers = {**as_user, 'content-type': 'application/json'}
        if prefer:
            headers['prefer'] = prefer
        res = http(f'{base}/rest/v1/{path}', method=method, headers=headers, body=json.dumps(body) if body is not None else None)
        if res.status == 401:
            raise TranscribeError(401, 'Please sign in again.')
        if not res.ok:
            raise RuntimeError(f'Database {res.status}: {res.text}')
        return res.json()

    rows = rest(f'media?id=eq.{media_id}&select=id,kind,name,mime,size,path,transcript_by')
    if not rows:
        raise TranscribeError(404, 'That recording is not in an archive you can see.')
    m = rows[0]
    if m['kind'] not in ('audio', 'video'):
        raise TranscribeError(400, 'Only voice notes and videos can be transcribed.')
    if m.get('transcript_by') == 'machine':
        raise TranscribeError(409, 'This recording has already been transcribed. You can correct the transcript by hand.')
    if m['size'] > MAX_BYTES:
        raise TranscribeError(413, 'This recording is too long to transcribe automatically (over 25 MB). You can type the transcript instead.')
    # A change that changes nothing, to learn whether the database lets this person edit it.
    if not rest(f'media?id=eq.{media_id}', 'PATCH', {'transcript_by': m.get('transcript_by')}, 'return=representation'):
        raise TranscribeError(403, 'Only the person who added this, or the archive\'s owner, can transcribe it.')

    signed = http(f"{base}/storage/v1/object/sign/archive/{urllib.parse.quote(m['path'])}", method='POST',
                  headers={**as_user, 'content-type': 'application/json'}, body=json.dumps({'expiresIn': 600}))
    if not signed.ok:
        raise RuntimeError(f'Storage {signed.status}: {signed.text}')
    link = signed.json().get('signedURL') or signed.json().get('signedUrl')
    audio = http(f'{base}/storage/v1{link}', timeout=60)
    if not audio.ok:
        raise RuntimeError(f'Storage {audio.status}')

    def speech(endpoint, model, response_format):
        body, content_type = multipart({'model': model, 'response_format': response_format}, m['name'], m['mime'], audio.content)
        res = http(f"{cfg['openai_url']}/audio/{endpoint}", method='POST', headers={'authorization': f"Bearer {cfg['openai_key']}", 'content-type': content_type}, body=body, timeout=120)
        if not res.ok:
            raise RuntimeError(f'OpenAI {res.status}: {res.text}')
        return res.json()

    whisper = cfg['model'] == 'whisper-1'
    heard = speech('transcriptions', cfg['model'], 'verbose_json' if whisper else 'json')
    transcript = (heard.get('text') or '').strip()
    language = heard.get('language') or ''
    translation = ''
    if transcript and not (whisper and is_english(language)):
        # Only whisper-1 translates into English.
        translation = (speech('translations', 'whisper-1', 'json').get('text') or '').strip()
        if translation == transcript:
            translation = ''
    rest(f'media?id=eq.{media_id}', 'PATCH', {'transcript': transcript, 'translation': translation, 'transcript_by': 'machine'}, 'return=minimal')
    return {'transcript': transcript, 'translation': translation, 'language': language}
