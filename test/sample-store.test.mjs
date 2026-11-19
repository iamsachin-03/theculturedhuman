// The sample archive (/app.html?sample) must answer everything the app asks of a real store,
// show a lived-in archive, and refuse every change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const sandbox = { console, location: {}, Promise, JSON, Date };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const n of ['app-core', 'app-store-local', 'app-store-sample']) {
  vm.runInContext(readFileSync(new URL(`../public/scripts/${n}.js`, import.meta.url), 'utf8'), sandbox);
}
const { local, sample } = sandbox.TCH.stores;

test('the sample archive has every method the real stores have', () => {
  const missing = Object.keys(local).filter((k) => typeof local[k] === 'function' && typeof sample[k] !== 'function');
  assert.deepEqual(missing, []);
  assert.equal(sample.mode, 'sample');
});

test('the sample archive is lived in: entries, photographs, a relative who adds, an elder and roots', async () => {
  const [session, entries, people, elders, roots] = await Promise.all([sample.session(), sample.entries(), sample.people(), sample.elders(), sample.roots()]);
  assert.ok(session.user.id);
  assert.ok(entries.length >= 8 && entries.length < 20, 'some way towards a book, not yet there');
  assert.ok(entries.some((e) => e.media.some((m) => m.kind === 'photo' && m.url.startsWith('/assets/illustrations/'))));
  assert.ok(entries.some((e) => e.createdBy !== session.user.id), 'a relative has added something');
  assert.ok(entries.every((e, i) => i === 0 || entries[i - 1].createdAt >= e.createdAt), 'newest first');
  assert.ok(people.some((p) => p.role === 'family_edit'));
  assert.equal(elders.length, 1);
  assert.ok(roots.generations.length >= 3);
  assert.equal((await sample.entry(entries[0].id)).title, entries[0].title);
});

test('the sample archive refuses every change with an invitation to start your own', async () => {
  for (const name of ['saveEntry', 'deleteEntry', 'savePerson', 'saveElder', 'saveRoots', 'contribute', 'deleteAccount', 'signIn']) {
    await assert.rejects(sample[name]({}), /sample archive[\s\S]*Start your own/, name);
  }
});
