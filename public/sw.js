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

var MAX_FILES = 10;
var MAX_FILE_BYTES = 500 * 1024 * 1024;

// A share from another app arrives with no referrer. A form on some other website could also post
// here, so anything sent from another site is turned away, and only a few media files are kept.
function fromAnotherSite(request) {
  if (!request.referrer) return false;
  try { return new URL(request.referrer).origin !== self.location.origin; } catch (e) { return true; }
}

function isMedia(f) {
  if (!f || typeof f === 'string' || !f.size || f.size > MAX_FILE_BYTES) return false;
  return /^(image|audio|video)\//.test(f.type || '') || (!f.type && /\.(opus|ogg|oga|m4a|mp3|aac|amr|wav|jpe?g|png|webp|heic|mp4|3gp|mov)$/i.test(f.name || ''));
}

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.origin !== self.location.origin || url.pathname !== '/share-target') return;
  if (fromAnotherSite(event.request)) {
    event.respondWith(Response.redirect('/', 303));
    return;
  }
  event.respondWith(event.request.formData().then(function (data) {
    var files = data.getAll('media').filter(isMedia).slice(0, MAX_FILES);
    var text = [data.get('title'), data.get('text')].filter(Boolean).join(' ').slice(0, 2000);
    return keepShared(files, text).then(function () {
      return Response.redirect('/app#/entry/new?shared=' + files.length, 303);
    });
  }).catch(function () {
    return Response.redirect('/app#/entry/new?shared=failed', 303);
  }));
});
