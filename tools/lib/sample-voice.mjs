// A real voice for the sample archive (/app.html?sample). It is added only when
// content/sample-voice-note.json exists, records the speaker's consent, and the recording itself
// is in public/assets/sample/. Without that file the sample archive simply has no voice note.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WHERE = 'content/sample-voice-note.json';
const TYPES = { m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav' };

export function readSampleVoice(root) {
  const source = join(root, WHERE);
  if (!existsSync(source)) return null;
  const v = JSON.parse(readFileSync(source, 'utf8'));
  for (const key of ['file', 'title', 'speaker', 'recordedOn', 'transcript']) {
    if (typeof v[key] !== 'string' || !v[key].trim()) throw new Error(`${WHERE}: "${key}" is required`);
  }
  const c = v.consent || {};
  if (c.given !== true || typeof c.how !== 'string' || !c.how.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) {
    throw new Error(`${WHERE}: consent.given must be true, with how it was given (consent.how) and when (consent.date, YYYY-MM-DD)`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.recordedOn)) throw new Error(`${WHERE}: recordedOn must be a date, YYYY-MM-DD`);
  const ext = (v.file.match(/^[a-z0-9-]+\.([a-z0-9]+)$/) || [])[1];
  if (!TYPES[ext]) throw new Error(`${WHERE}: file must be a plain lowercase name ending in ${Object.keys(TYPES).join(', ')}`);
  const audio = join(root, 'public/assets/sample', v.file);
  if (!existsSync(audio)) throw new Error(`${WHERE}: put the recording at public/assets/sample/${v.file}`);
  return {
    title: v.title.trim(), speaker: v.speaker.trim(), teller: (v.teller || v.speaker).trim(), place: (v.place || '').trim(),
    recordedOn: v.recordedOn, transcript: v.transcript.trim(), consent: c.how.trim(), consentDate: c.date,
    url: `/assets/sample/${v.file}`, type: TYPES[ext], size: statSync(audio).size,
  };
}

// The sample archive reads this from the page, so it needs no request of its own.
export function sampleVoiceScript(voice) {
  if (!voice) return '';
  return `<script type="application/json" id="tch-sample-voice">${JSON.stringify(voice).replace(/</g, '\\u003c')}</script>`;
}
