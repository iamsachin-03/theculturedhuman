// The sample archive's one real voice is published only with its speaker's consent written down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { readSampleVoice, sampleVoiceScript } from '../tools/lib/sample-voice.mjs';

const good = {
  file: 'nani-sings.m4a', title: 'Nani sings the fish song', speaker: 'Kamla Devi', teller: 'Nani', place: 'Darbhanga',
  recordedOn: '2026-11-21', transcript: 'Machhli boli, samundar dekhna hai…',
  consent: { given: true, how: 'agreed in writing to it playing on the public sample archive', date: '2026-11-21' },
};

function project(note, withAudio = true) {
  const root = mkdtempSync(join(tmpdir(), 'tch-voice-'));
  mkdirSync(join(root, 'content'));
  mkdirSync(join(root, 'public/assets/sample'), { recursive: true });
  if (note) writeFileSync(join(root, 'content/sample-voice-note.json'), JSON.stringify(note));
  if (withAudio) writeFileSync(join(root, 'public/assets/sample/nani-sings.m4a'), 'audio');
  return root;
}

test('no note file means no voice note, and nothing on the page', () => {
  assert.equal(readSampleVoice(project(null)), null);
  assert.equal(sampleVoiceScript(null), '');
});

test('the build refuses a voice without written consent, or without the recording', () => {
  assert.throws(() => readSampleVoice(project({ ...good, consent: undefined })), /consent\.given must be true/);
  assert.throws(() => readSampleVoice(project({ ...good, consent: { ...good.consent, given: 'yes' } })), /consent\.given must be true/);
  assert.throws(() => readSampleVoice(project({ ...good, consent: { ...good.consent, how: '' } })), /consent\.given must be true/);
  assert.throws(() => readSampleVoice(project({ ...good, transcript: '' })), /"transcript" is required/);
  assert.throws(() => readSampleVoice(project({ ...good, file: '../secret.m4a' })), /plain lowercase name/);
  assert.throws(() => readSampleVoice(project(good, false)), /public\/assets\/sample\/nani-sings\.m4a/);
});

test('with consent and the recording, the sample archive shows a real voice note', async () => {
  const voice = readSampleVoice(project({ ...good, transcript: 'Hum </script> gaate the' }));
  assert.equal(voice.url, '/assets/sample/nani-sings.m4a');
  assert.equal(voice.type, 'audio/mp4');
  const tag = sampleVoiceScript(voice);
  assert.doesNotMatch(tag.slice(0, -'</script>'.length), /<\/script>/i);

  const json = tag.match(/>([\s\S]*)<\/script>$/)[1];
  const sandbox = { console, location: {}, Promise, JSON, Date, document: { getElementById: (id) => (id === 'tch-sample-voice' ? { textContent: json } : null) } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const n of ['app-core', 'app-store-sample']) vm.runInContext(readFileSync(new URL(`../public/scripts/${n}.js`, import.meta.url), 'utf8'), sandbox);
  const entry = await sandbox.TCH.stores.sample.entry('voice-note');
  assert.equal(entry.media[0].kind, 'audio');
  assert.equal(entry.media[0].url, '/assets/sample/nani-sings.m4a');
  assert.match(entry.body, /This voice is real\. Kamla Devi recorded it on 21 November 2026 and agreed/);
  assert.match(entry.body, /Hum <\/script> gaate the/);
});
