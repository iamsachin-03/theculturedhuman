// Drives the app's Supabase connection (app-store-supabase.js) against a running local stand-in
// (backend/dev/start.sh), as several members of one family. Skipped unless TCH_DEV_BACKEND is set:
//   TCH_DEV_BACKEND=http://localhost:54321 TCH_DEV_ANON_KEY=$(cat /tmp/tch-anon-key) npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const URL_ = process.env.TCH_DEV_BACKEND;
const KEY = process.env.TCH_DEV_ANON_KEY;
const skip = !URL_ || !KEY ? 'set TCH_DEV_BACKEND and TCH_DEV_ANON_KEY to run against backend/dev/start.sh' : false;
const RETURN = 'http://localhost:4321/app.html';
const source = ['app-core', 'app-store-supabase'].map((n) => readFileSync(new URL(`../public/scripts/${n}.js`, import.meta.url), 'utf8'));
const run = Date.now().toString(36);

function storeFor() {
  const data = new Map();
  const localStorage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const sandbox = { localStorage, fetch, URLSearchParams, Blob, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const s of source) vm.runInContext(s, sandbox);
  return sandbox.TCH.stores.supabase({ url: URL_, anonKey: KEY });
}

async function signIn(name) {
  const email = `${name.toLowerCase()}-${run}@example.org`;
  const store = storeFor();
  assert.deepEqual(plain(await store.signIn(email, name, RETURN)), { sent: true });
  let link;
  for (let i = 0; i < 40 && !link; i++) {
    const mail = await (await fetch(`${URL_}/dev/mail`)).json();
    link = mail.filter((m) => m.to[0] === email).at(-1)?.link;
    if (!link) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(link, `a sign-in email reached ${email}`);
  const res = await fetch(link, { redirect: 'manual' });
  const location = res.headers.get('location');
  assert.ok(location.startsWith(RETURN + '#'), 'the link returns to the app');
  const session = await store.handleRedirect(location.slice(location.indexOf('#')));
  assert.equal(session.user.email, email);
  await store.saveProfile({ name });
  await store.touchSeen();
  return { store, email, id: session.user.id };
}

const blob = (text, type) => new Blob([text], { type });
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));
const titles = (list) => plain(list).map((e) => e.title).sort();

test('a family shares, receives and passes on an archive through Supabase', { skip }, async () => {
  const asha = await signIn('Asha');
  const bina = await signIn('Bina');
  const farah = await signIn('Farah');
  const gopal = await signIn('Gopal');
  const chetan = await signIn('Chetan');

  // Asha builds her list and her archive.
  const pBina = await asha.store.savePerson({ name: 'Bina', email: bina.email.toUpperCase(), role: 'family_edit' });
  const pFarah = await asha.store.savePerson({ name: 'Farah', email: farah.email, role: 'beloved' });
  await asha.store.savePerson({ name: 'Gopal', email: gopal.email, role: 'legacy' });
  await assert.rejects(asha.store.savePerson({ name: 'Again', email: bina.email, role: 'family_view' }), /already on your list/);
  assert.equal((await asha.store.people()).length, 3);
  assert.equal(pBina.email, bina.email, 'emails are stored in lower case');

  const family = await asha.store.saveEntry({ kind: 'story', title: 'The river at Darbhanga', body: 'Nani told it every monsoon.', audience: 'family', teller: 'Nani' });
  await asha.store.saveEntry({ kind: 'wisdom', title: 'Only for me', audience: 'private' });
  await asha.store.saveEntry({ kind: 'letter', title: 'For Farah', audience: 'people', audiencePeople: [pFarah.id] });
  await asha.store.saveEntry({ kind: 'letter', title: 'For Farah at eighteen', audience: 'date', audiencePeople: [pFarah.id], releaseAt: '2040-01-01T00:00:00.000Z' });
  await asha.store.saveEntry({ kind: 'steady', title: 'When I am gone', audience: 'passed' });
  await assert.rejects(asha.store.saveEntry({ kind: 'letter', title: 'Nobody chosen', audience: 'people', audiencePeople: [] }), /choose who/);

  const voice = await asha.store.addMedia(family, blob('a voice from 1962', 'audio/webm'), 'Nani.webm');
  assert.equal(voice.kind, 'audio');
  assert.ok(voice.path.startsWith(`${asha.id}/${family.id}/`));
  assert.equal((await asha.store.entry(family.id)).media.length, 1);

  // Bina is family who can add.
  const binaShared = await bina.store.sharedWithMe();
  assert.deepEqual(plain(binaShared).map((s) => [s.ownerName, s.role]), [['Asha', 'family_edit']]);
  const seenByBina = await bina.store.entries(asha.id);
  assert.deepEqual(titles(seenByBina), ['The river at Darbhanga']);
  const url = await bina.store.mediaUrl(seenByBina[0].media[0]);
  assert.equal(await (await fetch(url)).text(), 'a voice from 1962');
  const added = await bina.store.saveEntry({ owner: asha.id, kind: 'memory', title: 'Holi, 1998', audience: 'family' });
  assert.equal(added.owner, asha.id);
  await assert.rejects(bina.store.saveEntry({ owner: asha.id, kind: 'letter', title: 'Later', audience: 'passed' }), /later/);
  await bina.store.addMedia(added, blob('photo', 'image/jpeg'), 'holi.jpg');
  assert.ok(titles(await asha.store.entries()).includes('Holi, 1998'), 'the owner sees what family added');

  // Farah sees only what was left for her now; Chetan sees nothing.
  assert.deepEqual(titles(await farah.store.entries(asha.id)), ['For Farah']);
  assert.deepEqual(plain(await chetan.store.entries(asha.id)), []);
  assert.deepEqual(plain(await chetan.store.sharedWithMe()), []);
  await assert.rejects(chetan.store.mediaUrl(voice), /permission|allowed/i);
  await assert.rejects(chetan.store.saveEntry({ owner: asha.id, kind: 'story', title: 'Intruder', audience: 'family' }), /only view/);

  // Gopal reports; Asha's next visit cancels it.
  await assert.rejects(farah.store.reportPassing(asha.id), /legacy contact/);
  assert.equal((await gopal.store.reportPassing(asha.id)).state, 'reported');
  assert.equal((await bina.store.sharedWithMe())[0].legacy.state, 'reported');
  assert.equal((await asha.store.touchSeen()).state, 'active');

  // Settings and the weekly question.
  assert.equal((await asha.store.saveLegacy({ quietMonths: 6, waitDays: 14 })).waitDays, 14);
  const elder = await asha.store.saveElder({ name: 'Nani', phone: '+91 98765 43210', day: 3, signAs: 'Asha' });
  assert.equal((await asha.store.saveElder({ id: elder.id, idx: 1, answered: 1 })).idx, 1);
  assert.equal((await asha.store.elders()).length, 1);
  assert.deepEqual(plain(await bina.store.elders()), [], 'elders are private to their owner');

  // Deleting an entry deletes its files.
  await asha.store.deleteEntry(family.id);
  assert.equal((await fetch(url)).status, 404);

  // Leaving takes Bina's own additions with her and nothing of Asha's.
  await bina.store.deleteAccount();
  const left = titles(await asha.store.entries());
  assert.ok(!left.includes('Holi, 1998'));
  assert.ok(left.includes('Only for me'));
  assert.equal(await bina.store.session(), null);

  await asha.store.signOut();
  assert.equal(await asha.store.session(), null);
});
