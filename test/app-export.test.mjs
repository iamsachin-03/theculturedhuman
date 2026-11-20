import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';

const exporter = createRequire(import.meta.url)('../public/scripts/app-export.js');

const archive = {
  owner: { name: 'Asha Mishra', email: 'asha@example.org' },
  people: [{ id: 'p1', name: 'Ravi', role: 'family_edit' }],
  weekly: [], legacy: { quietMonths: 12, waitDays: 30 },
  remembrances: [{ id: 'r1', name: 'Nanaji <3', relation: 'Grandfather', diedOn: '03-12', bornOn: '', bornYear: 1931, diedYear: 2011 }],
  exportedAt: '2026-11-20T10:00:00.000Z',
  entries: [
    {
      id: 'e2', kind: 'memory', title: 'Nani & the <script>alert(1)</script> wall', teller: 'Nani', place: 'Darbhanga', audience: 'family',
      audiencePeople: [], createdAt: '2026-10-02T00:00:00.000Z', body: 'First line.\n\nSecond <b>line</b>.',
      media: [
        { id: 'm1', name: 'Wall.jpg', kind: 'photo', mime: 'image/jpeg', url: 'blob:x' },
        { id: 'm2', name: 'wall.jpg', kind: 'photo', mime: 'image/jpeg' },
        { id: 'm3', name: 'Nani sings.m4a', kind: 'audio', mime: 'audio/mp4', transcript: 'मछली <i>समुंदर</i>', translation: 'The fish, the sea' },
      ],
    },
    { id: 'e1', kind: 'story', title: 'नानी की कहानी', audience: 'private', audiencePeople: [], createdAt: '2026-09-01T00:00:00.000Z', body: 'Once.', media: [] },
  ],
};

function unzip(parts) {
  const dir = mkdtempSync(join(tmpdir(), 'tch-export-'));
  const file = join(dir, 'copy.zip');
  writeFileSync(file, Buffer.concat(parts.map((p) => Buffer.from(p))));
  const script = 'import json,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint(json.dumps({i.filename: z.read(i).decode("utf-8", "replace") for i in z.infolist()}))';
  return JSON.parse(execFileSync('python3', ['-c', script, file], { encoding: 'utf8' }));
}

test('crc32 matches zlib', () => {
  for (const text of ['', 'a', 'The Cultured Human', 'नानी'.repeat(500)]) {
    const bytes = new TextEncoder().encode(text);
    assert.equal(exporter.crc32(bytes), crc32(bytes));
  }
});

test('every file gets its own readable path, oldest entry first, with no clashes', () => {
  const files = exporter.layout(archive.entries);
  assert.deepEqual(files.map((f) => f.path), [
    'files/002-nani-the-script-alert-1-script-wall/wall.jpg',
    'files/002-nani-the-script-alert-1-script-wall/2-wall.jpg',
    'files/002-nani-the-script-alert-1-script-wall/nani-sings.m4a',
  ]);
});

test('the copy is a valid zip with a page to open, archive.json and every file that could be read', () => {
  const files = exporter.layout(archive.entries);
  const fetched = { [files[0].path]: new Uint8Array([1, 2, 3]), [files[2].path]: new TextEncoder().encode('audio') };
  const out = unzip(exporter.build(archive, files, fetched));
  const top = 'family-archive-2026-11-20/';
  assert.deepEqual(Object.keys(out).sort(), [top + 'Start here.html', top + 'archive.json', top + files[0].path, top + files[2].path].sort());

  const data = JSON.parse(out[top + 'archive.json']);
  assert.equal(data.format, 'the-cultured-human-family-archive');
  assert.deepEqual(data.entries.map((e) => e.id), ['e1', 'e2']);
  const media = data.entries[1].media;
  assert.deepEqual(media.map((m) => [m.file, !!m.missing]), files.map((f, i) => [f.path, i === 1]));
  assert.ok(media.every((m) => !('url' in m) && !('data' in m)));

  const page = out[top + 'Start here.html'];
  assert.match(page, /Asha Mishra’s family archive/);
  assert.match(page, /नानी की कहानी/);
  assert.match(page, /<img src="files\/002-nani-the-script-alert-1-script-wall\/wall\.jpg"/);
  assert.match(page, /<audio controls preload="none" src="files\/002-nani-the-script-alert-1-script-wall\/nani-sings\.m4a"/);
  assert.match(page, /This file could not be copied: wall\.jpg/);
  assert.match(page, /Ravi — Family, can add/);
  assert.ok(page.includes('<p class="said">मछली &lt;i&gt;समुंदर&lt;/i&gt;</p><p class="note">In English: The fish, the sea</p>'), 'transcripts are on the page, escaped');
  assert.ok(page.includes('<li><strong>Nanaji &lt;3</strong>, Grandfather (1931–2011). Remembered on 12 March.</li>'), 'the people remembered are on the page');
  assert.equal(data.remembrances[0].diedOn, '03-12');
  assert.doesNotMatch(page, /<script|<b>/);
});

test('an empty archive still makes a copy someone can open', () => {
  const out = unzip(exporter.build({ ...archive, entries: [], people: [] }, [], {}));
  assert.equal(Object.keys(out).length, 2);
});
