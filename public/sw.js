// The site's service worker does one thing: it receives files shared to The Cultured Human
// from another app (a WhatsApp voice note, a photograph from the gallery), keeps them in
// IndexedDB "tch-shared", and opens the archive's editor, which picks them up from there.
// It caches nothing, so every page is always fresh from the network.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

function openShared() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open('tch-shared', 1);
    req.onupgradeneeded = function () { req.result.createObjectStore('files', { keyPath: 'id' }); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

function keepShared(files, text) {
  return openShared().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('files', 'readwrite');
      var store = tx.objectStore('files');
      var at = Date.now();
      files.forEach(function (f, i) {
        store.put({ id: at + '-' + i, at: at, name: f.name || 'shared-file', type: f.type || '', blob: f, text: i === 0 ? text : '' });
      });
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/share-target') return;
  event.respondWith(event.request.formData().then(function (data) {
    var files = data.getAll('media').filter(function (f) { return f && typeof f !== 'string' && f.size; });
    var text = [data.get('title'), data.get('text')].filter(Boolean).join(' ').slice(0, 2000);
    return keepShared(files, text).then(function () {
      return Response.redirect('/app.html#/entry/new?shared=' + files.length, 303);
    });
  }).catch(function () {
    return Response.redirect('/app.html#/entry/new?shared=failed', 303);
  }));
});
