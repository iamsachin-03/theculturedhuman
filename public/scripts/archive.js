// The family archive: stories, photo memories, wisdom, things for hard days and letters to the
// future. Until family accounts exist, entries live in this browser's IndexedDB, with photos and
// voice notes stored as Blobs. The pure helpers are exported for Node so they can be tested.
(function () {
  var FORMAT = 'the-cultured-human-archive';

  var KINDS = [
    {
      id: 'story', label: 'A story or tale', heading: 'Stories and tales',
      prompts: [
        'Where did you grow up, and what did the house look like?',
        'What did your parents do for a living?',
        'What did a normal day look like when you were ten?',
        'Which dish takes you straight back home, and who made it best?',
        'How did our family celebrate the most important festival of the year?',
        'Why did our family move, and what did they bring with them?',
        'How did you meet your husband or wife?',
        'Was there a ritual our family never skipped?',
        'What were you told about our family name, or our village?',
        'Which story did you love to hear as a child?',
      ],
    },
    {
      id: 'memory', label: 'A photograph and its memory', heading: 'Moments together',
      prompts: [
        'Who is in this picture, and what was happening just outside it?',
        'What was said that day that you still remember?',
        'Why does this picture matter to you?',
      ],
    },
    {
      id: 'wisdom', label: 'Wisdom or a proverb', heading: 'Wisdom and sayings',
      prompts: [
        'Which saying did your elders repeat most, and what did they mean by it?',
        'What is the best advice you were ever given?',
        'What took you longest to learn?',
        'Which words or sayings did your elders use that people don\'t say any more?',
      ],
    },
    {
      id: 'steady', label: 'For hard days', heading: 'For hard days',
      prompts: [
        'What do you do when you feel lost?',
        'What helped you through the hardest year of your life?',
        'How do you calm yourself before something frightening?',
        'What reminds you who you are when you doubt yourself?',
        'How do you stay kind when the world is unkind?',
      ],
    },
    {
      id: 'letter', label: 'A letter to the future', heading: 'Letters to the future',
      prompts: [
        'What do you hope they never lose?',
        'What would you tell them about being human?',
        'What do you want them to know about you that nobody else will remember?',
        'What do you wish your grandchildren knew about where we come from?',
      ],
    },
  ];
  var TEXT_FIELDS = ['kind', 'prompt', 'title', 'teller', 'forWhom', 'place', 'openWhen', 'text', 'createdAt', 'updatedAt'];

  function kindOf(id) {
    for (var i = 0; i < KINDS.length; i++) if (KINDS[i].id === id) return KINDS[i];
    return null;
  }

  function stamp(e) { return e.updatedAt || e.createdAt || ''; }

  /** Combine two lists of entries by id. An incoming entry replaces one only if it was edited later. */
  function mergeEntries(existing, incoming) {
    var byId = {};
    existing.forEach(function (e) { byId[e.id] = e; });
    var changed = [];
    incoming.forEach(function (e) {
      var current = byId[e.id];
      if (!current || stamp(e) > stamp(current)) {
        byId[e.id] = e;
        changed.push(e);
      }
    });
    var entries = Object.keys(byId).map(function (k) { return byId[k]; });
    entries.sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    return { entries: entries, changed: changed };
  }

  /** Read a saved copy. Media stays as data URLs; anything unexpected is dropped rather than trusted. */
  function parseArchive(json) {
    var data = JSON.parse(json);
    if (!data || data.format !== FORMAT || !Array.isArray(data.entries)) {
      throw new Error('This file is not a copy of a family archive from The Cultured Human.');
    }
    var entries = data.entries.filter(function (e) {
      return e && typeof e.id === 'string' && kindOf(e.kind) && typeof e.title === 'string' && e.title.trim();
    }).map(function (e) {
      var out = { id: e.id };
      TEXT_FIELDS.forEach(function (k) { if (typeof e[k] === 'string') out[k] = e[k].slice(0, 20000); });
      if (typeof e.photo === 'string' && e.photo.indexOf('data:image/') === 0) out.photo = e.photo;
      if (typeof e.audio === 'string' && e.audio.indexOf('data:audio/') === 0) out.audio = e.audio;
      return out;
    });
    var roots = data.roots && Array.isArray(data.roots.generations) ? data.roots : null;
    return { roots: roots, entries: entries };
  }

  /** Entries grouped by kind, oldest first within each group, as they read in a book. */
  function groupEntries(entries) {
    return KINDS.map(function (k) {
      return {
        kind: k,
        entries: entries.filter(function (e) { return e.kind === k.id; })
          .sort(function (a, b) { return (a.createdAt || '').localeCompare(b.createdAt || ''); }),
      };
    }).filter(function (g) { return g.entries.length; });
  }

  function inviteMessage(url) {
    return 'I\'m keeping our family\'s stories, sayings and photographs in one place, so the ones who come after us have them too. ' +
      'Would you add yours? Open ' + url + ', add a story or record a voice note, then tap "Save a copy" and send me the file.';
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { KINDS: KINDS, FORMAT: FORMAT, mergeEntries: mergeEntries, parseArchive: parseArchive, groupEntries: groupEntries, inviteMessage: inviteMessage };
    return;
  }

  var app = document.querySelector('[data-archive]');
  if (!app) return;
  var form = app.querySelector('[data-archive-form]');
  var list = app.querySelector('[data-archive-list]');
  var status = app.querySelector('[data-archive-status]');
  var voiceStatus = form.querySelector('[data-voice-status]');
  var voicePreview = form.querySelector('[data-voice-preview]');
  var recordBtn = form.querySelector('[data-record]');
  var kindSelect = form.querySelector('[name="kind"]');
  var promptSelect = form.querySelector('[name="prompt"]');
  var pendingAudio = null;
  var recorder = null;
  var objectUrls = [];

  // ---------- storage ----------
  var dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        var req = indexedDB.open('tch-archive', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('entries', { keyPath: 'id' }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbPromise;
  }
  function tx(mode, work) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction('entries', mode);
        var result = work(t.objectStore('entries'));
        t.oncomplete = function () { resolve(result && 'result' in result ? result.result : undefined); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }
  function all() { return tx('readonly', function (s) { return s.getAll(); }); }
  function put(entries) { return tx('readwrite', function (s) { entries.forEach(function (e) { s.put(e); }); }); }
  function remove(id) { return tx('readwrite', function (s) { s.delete(id); }); }

  function toDataUrl(blob) {
    return new Promise(function (resolve) {
      if (!blob) return resolve(undefined);
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.readAsDataURL(blob);
    });
  }
  function toBlob(dataUrl) {
    return dataUrl ? fetch(dataUrl).then(function (r) { return r.blob(); }) : Promise.resolve(null);
  }

  function say(message) {
    status.textContent = message;
  }

  // ---------- form ----------
  function fillPrompts() {
    var kind = kindOf(kindSelect.value) || KINDS[0];
    promptSelect.innerHTML = '<option value="">My own words</option>';
    kind.prompts.forEach(function (p) {
      var o = document.createElement('option');
      o.textContent = p;
      promptSelect.appendChild(o);
    });
    form.querySelectorAll('[data-only]').forEach(function (el) {
      el.hidden = el.getAttribute('data-only').split(' ').indexOf(kind.id) === -1;
    });
  }
  KINDS.forEach(function (k) {
    var o = document.createElement('option');
    o.value = k.id;
    o.textContent = k.label;
    kindSelect.appendChild(o);
  });
  kindSelect.addEventListener('change', fillPrompts);
  fillPrompts();

  function setAudio(blob) {
    pendingAudio = blob;
    if (blob) {
      var url = URL.createObjectURL(blob);
      objectUrls.push(url);
      voicePreview.src = url;
      voicePreview.hidden = false;
    } else {
      voicePreview.removeAttribute('src');
      voicePreview.hidden = true;
    }
  }

  if (!navigator.mediaDevices || !window.MediaRecorder) {
    recordBtn.hidden = true;
    voiceStatus.textContent = 'Recording isn\'t available in this browser. You can choose a recording from your phone instead.';
  } else {
    recordBtn.addEventListener('click', function () {
      if (recorder && recorder.state === 'recording') {
        recorder.stop();
        return;
      }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          setAudio(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
          recordBtn.textContent = 'Record again';
          voiceStatus.textContent = 'Recorded. Listen back below, then save the story.';
        };
        recorder.start();
        recordBtn.textContent = 'Stop recording';
        voiceStatus.textContent = 'Recording…';
      }).catch(function () {
        voiceStatus.textContent = 'The microphone could not be used. Check the browser\'s permission, or choose a recording instead.';
      });
    });
  }
  form.querySelector('[data-audio-file]').addEventListener('change', function () {
    if (this.files[0]) {
      setAudio(this.files[0]);
      voiceStatus.textContent = 'Recording added: ' + this.files[0].name;
    }
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (recorder && recorder.state === 'recording') recorder.stop();
    var f = form.elements;
    var now = new Date().toISOString();
    var entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      kind: kindSelect.value,
      prompt: f.prompt.value,
      title: f.title.value.trim(),
      teller: f.teller.value.trim(),
      forWhom: f.forWhom.value.trim(),
      place: f.place.value.trim(),
      openWhen: kindSelect.value === 'letter' ? f.openWhen.value.trim() : '',
      text: f.text.value.trim(),
      photo: f.photo.files[0] || null,
      audio: pendingAudio,
      createdAt: now,
      updatedAt: now,
    };
    put([entry]).then(function () {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      form.reset();
      fillPrompts();
      setAudio(null);
      if (recordBtn) recordBtn.textContent = 'Record';
      voiceStatus.textContent = 'Ask first if you may record.';
      say('Saved "' + entry.title + '".');
      return refresh();
    }).catch(function () {
      say('This browser could not save the story. If it is in private mode, try a normal window.');
    });
  });

  // ---------- list ----------
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function formatDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; }
  }

  function entryCard(e) {
    var card = el('article', 'archive-entry');
    var kind = kindOf(e.kind);
    card.appendChild(el('p', 'eyebrow', e.kind === 'letter' && e.openWhen ? 'Open ' + e.openWhen : kind.label));
    card.appendChild(el('h4', '', e.title));
    var meta = [e.teller && 'From ' + e.teller, e.forWhom && 'for ' + e.forWhom, e.place, formatDate(e.createdAt)].filter(Boolean).join(' · ');
    card.appendChild(el('p', 'archive-entry__meta', meta));
    if (e.prompt) card.appendChild(el('p', 'archive-entry__prompt', e.prompt));
    if (e.photo) {
      var img = el('img');
      var url = URL.createObjectURL(e.photo);
      objectUrls.push(url);
      img.src = url;
      img.alt = 'Photograph: ' + e.title;
      card.appendChild(img);
    }
    (e.text || '').split(/\n{2,}/).filter(Boolean).forEach(function (para) { card.appendChild(el('p', 'archive-entry__text', para)); });
    if (e.audio) {
      var audio = el('audio');
      var aurl = URL.createObjectURL(e.audio);
      objectUrls.push(aurl);
      audio.controls = true;
      audio.src = aurl;
      audio.setAttribute('aria-label', 'Voice note: ' + e.title);
      card.appendChild(audio);
    }
    var del = el('button', 'archive-entry__delete', 'Delete');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete "' + e.title + '"');
    del.addEventListener('click', function () {
      if (!window.confirm('Delete "' + e.title + '"? This cannot be undone unless you saved a copy.')) return;
      remove(e.id).then(refresh).then(function () { say('Deleted "' + e.title + '".'); });
    });
    card.appendChild(del);
    return card;
  }

  function refresh() {
    return all().then(function (entries) {
      objectUrls.forEach(function (u) { URL.revokeObjectURL(u); });
      objectUrls = [];
      list.innerHTML = '';
      var groups = groupEntries(entries);
      if (!groups.length) {
        list.appendChild(el('p', 'archive-list__empty', 'Nothing kept yet. Start with one question, one photograph or one saying.'));
      }
      groups.forEach(function (g) {
        var section = el('section', 'archive-group');
        section.appendChild(el('h3', '', g.kind.heading));
        g.entries.forEach(function (e) { section.appendChild(entryCard(e)); });
        list.appendChild(section);
      });
      app.querySelector('[data-archive-count]').textContent = entries.length === 1 ? '1 thing kept' : entries.length + ' things kept';
      return entries;
    });
  }

  function showRoots() {
    var box = app.querySelector('[data-archive-roots]');
    var roots = null;
    try { roots = JSON.parse(localStorage.getItem('tch-roots') || 'null'); } catch (e) {}
    var gens = roots && roots.generations ? roots.generations.filter(function (g) { return g.place && g.place.trim(); }) : [];
    box.innerHTML = '';
    if (!gens.length) {
      box.appendChild(el('p', '', 'Begin with the places your family has lived.'));
      var a = el('a', 'text-link', 'Trace your roots');
      a.href = '/trace.html';
      box.appendChild(a);
      return;
    }
    var ul = el('ul', 'archive__roots-list');
    gens.forEach(function (g) {
      var li = el('li');
      li.appendChild(el('span', '', g.label));
      li.appendChild(document.createTextNode(' ' + g.place));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    var edit = el('a', 'text-link', 'Edit your roots');
    edit.href = '/trace.html';
    box.appendChild(edit);
  }

  // ---------- tools ----------
  app.querySelector('[data-archive-export]').addEventListener('click', function () {
    all().then(function (entries) {
      return Promise.all(entries.map(function (e) {
        return Promise.all([toDataUrl(e.photo), toDataUrl(e.audio)]).then(function (media) {
          var out = {};
          Object.keys(e).forEach(function (k) { out[k] = e[k]; });
          out.photo = media[0];
          out.audio = media[1];
          return out;
        });
      }));
    }).then(function (entries) {
      var roots = null;
      try { roots = JSON.parse(localStorage.getItem('tch-roots') || 'null'); } catch (e) {}
      var file = new Blob([JSON.stringify({ format: FORMAT, version: 1, savedAt: new Date().toISOString(), roots: roots, entries: entries })], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = 'family-archive.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      say('Copy saved as family-archive.json. Keep it somewhere safe, or send it to a relative.');
    });
  });

  app.querySelector('[data-archive-import]').addEventListener('change', function () {
    var input = this;
    var file = input.files[0];
    if (!file) return;
    file.text().then(function (text) {
      var parsed = parseArchive(text);
      return Promise.all(parsed.entries.map(function (e) {
        return Promise.all([toBlob(e.photo), toBlob(e.audio)]).then(function (media) {
          e.photo = media[0];
          e.audio = media[1];
          return e;
        });
      })).then(function (incoming) {
        return all().then(function (existing) {
          var merged = mergeEntries(existing, incoming);
          return put(merged.changed).then(function () { return merged.changed.length; });
        });
      }).then(function (count) {
        var hasRoots = false;
        try { hasRoots = Boolean(localStorage.getItem('tch-roots')); } catch (e) {}
        if (parsed.roots && !hasRoots) {
          try { localStorage.setItem('tch-roots', JSON.stringify(parsed.roots)); } catch (e) {}
          showRoots();
        }
        say(count ? 'Added ' + count + (count === 1 ? ' entry' : ' entries') + ' from the copy.' : 'Everything in that copy is already in your archive.');
        return refresh();
      });
    }).catch(function (err) {
      say(err && err.message && err.message.indexOf('The Cultured Human') !== -1 ? err.message : 'That file could not be read.');
    }).then(function () { input.value = ''; });
  });

  app.querySelector('[data-archive-invite]').addEventListener('click', function () {
    var text = inviteMessage(location.origin + '/archive.html');
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () {});
      return;
    }
    var copied = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject();
    copied.then(function () {
      say('Invitation copied. Paste it into WhatsApp, a message or an email.');
    }, function () {
      say(text);
    });
  });

  app.querySelector('[data-archive-print]').addEventListener('click', function () { window.print(); });

  showRoots();
  refresh();
})();
