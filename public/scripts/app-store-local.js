// Preview mode for the family archive app: everything lives in this browser's IndexedDB, and
// "accounts" are pretend ones on this device, so people can try sharing before a real backend
// is connected. It follows exactly the same rules as the database (app-core.js).
(function (root) {
  var core = root.TCH.core;
  var SESSION = 'tch-local-session';
  var STORES = ['users', 'people', 'entries', 'media', 'legacy', 'elders', 'roots'];
  var dbPromise = null;

  function db() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        var req = indexedDB.open('tch-app', 2);
        req.onupgradeneeded = function () {
          STORES.forEach(function (name) {
            if (req.result.objectStoreNames.contains(name)) return;
            req.result.createObjectStore(name, { keyPath: name === 'legacy' || name === 'roots' ? 'owner' : 'id' });
          });
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbPromise;
  }
  function run(name, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(name, mode);
        var result = fn(t.objectStore(name));
        t.oncomplete = function () { resolve(result && 'result' in result ? result.result : result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Could not save on this device. It may be out of space.')); };
      });
    });
  }
  function all(name) { return run(name, 'readonly', function (s) { return s.getAll(); }); }
  function get(name, id) { return run(name, 'readonly', function (s) { return s.get(id); }); }
  function put(name, value) { return run(name, 'readwrite', function (s) { s.put(value); }).then(function () { return value; }); }
  function del(name, id) { return run(name, 'readwrite', function (s) { s.delete(id); }); }
  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function now() { return new Date(); }
  function copy(o) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; }); return c; }

  var me = null;
  try { me = localStorage.getItem(SESSION); } catch (e) {}

  function need() {
    if (!me) throw new Error('Please sign in first.');
    return me;
  }

  function legacyOf(owner) {
    return get('legacy', owner).then(function (l) {
      return l ? core.legacyNext(l, now()) : null;
    });
  }

  function myPerson(owner) {
    return all('people').then(function (list) {
      return list.filter(function (p) { return p.owner === owner && p.userId === me; })[0] || null;
    });
  }

  function withMedia(entries) {
    return all('media').then(function (media) {
      return entries.map(function (e) {
        var c = copy(e);
        c.media = media.filter(function (m) { return m.entryId === e.id; }).map(function (m) {
          var out = copy(m);
          delete out.blob;
          return out;
        });
        return c;
      });
    });
  }

  function claim(user) {
    return all('people').then(function (list) {
      return Promise.all(list.filter(function (p) {
        return !p.userId && p.owner !== user.id && p.email.toLowerCase() === user.email.toLowerCase();
      }).map(function (p) { p.userId = user.id; return put('people', p); }));
    });
  }

  var objectUrls = {};

  var store = {
    mode: 'local',

    session: function () {
      if (!me) return Promise.resolve(null);
      return get('users', me).then(function (u) {
        if (!u) { me = null; return null; }
        return { user: u };
      });
    },

    /** Preview accounts need no email: signing in with an address creates or opens that account here. */
    signIn: function (email, name) {
      email = String(email || '').trim().toLowerCase();
      if (email.indexOf('@') < 1) return Promise.reject(new Error('Please enter an email address.'));
      return all('users').then(function (users) {
        var u = users.filter(function (x) { return x.email === email; })[0];
        if (u) return u;
        return put('users', { id: uid(), email: email, name: (name || '').trim() || email.split('@')[0], createdAt: now().toISOString() });
      }).then(function (u) {
        me = u.id;
        try { localStorage.setItem(SESSION, u.id); } catch (e) {}
        return claim(u).then(function () { return { user: u }; });
      });
    },

    handleRedirect: function () { return Promise.resolve(null); },

    signOut: function () {
      me = null;
      try { localStorage.removeItem(SESSION); } catch (e) {}
      return Promise.resolve();
    },

    accounts: function () { return all('users'); },

    saveProfile: function (fields) {
      return get('users', need()).then(function (u) {
        u.name = String(fields.name || '').trim().slice(0, 80) || u.name;
        return put('users', u);
      });
    },

    touchSeen: function () {
      var owner = need();
      return get('legacy', owner).then(function (l) {
        return put('legacy', core.legacySeen(l || core.newLegacy(owner, now()), now()));
      });
    },

    legacy: function () { return legacyOf(need()); },

    saveLegacy: function (fields) {
      return get('legacy', need()).then(function (l) {
        l = l || core.newLegacy(me, now());
        if (l.state === 'passed') throw new Error('This archive has been passed on and can no longer be changed.');
        l.quietMonths = Math.min(60, Math.max(3, Number(fields.quietMonths) || 12));
        l.waitDays = Math.min(90, Math.max(7, Number(fields.waitDays) || 30));
        return put('legacy', l);
      });
    },

    people: function () {
      var owner = need();
      return all('people').then(function (list) {
        return list.filter(function (p) { return p.owner === owner; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      });
    },

    savePerson: function (p) {
      var owner = need();
      var email = String(p.email || '').trim().toLowerCase();
      return Promise.all([all('people'), get('users', owner), all('users')]).then(function (r) {
        var list = r[0];
        if (email === r[1].email) throw new Error('That is your own email address.');
        if (list.some(function (x) { return x.owner === owner && x.email === email && x.id !== p.id; })) {
          throw new Error('Someone with that email is already on your list.');
        }
        var existing = list.filter(function (x) { return x.id === p.id && x.owner === owner; })[0];
        var row = existing ? copy(existing) : { id: uid(), owner: owner, userId: null, createdAt: now().toISOString() };
        if (existing && existing.email !== email) row.userId = null;
        row.name = String(p.name || '').trim().slice(0, 80);
        row.email = email;
        row.role = p.role;
        if (!row.name) throw new Error('Please add their name.');
        if (!core.find(core.ROLES, row.role)) throw new Error('Please choose how they are connected.');
        var account = r[2].filter(function (u) { return u.email === email; })[0];
        if (!row.userId && account) row.userId = account.id;
        return put('people', row);
      });
    },

    deletePerson: function (id) {
      var owner = need();
      return get('people', id).then(function (p) {
        if (p && (p.owner === owner || p.userId === owner)) return del('people', id);
      });
    },

    /** Entries in `owner`'s archive that the signed-in person may see, newest first. */
    entries: function (owner) {
      var viewer = need();
      owner = owner || viewer;
      return Promise.all([all('entries'), myPerson(owner), legacyOf(owner)]).then(function (r) {
        var passed = Boolean(r[2] && r[2].state === 'passed');
        var visible = r[0].filter(function (e) {
          return e.owner === owner && core.canSee(e, viewer, r[1], passed, now());
        });
        visible.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
        return withMedia(visible);
      });
    },

    entry: function (id) {
      var viewer = need();
      return get('entries', id).then(function (e) {
        if (!e) return null;
        return Promise.all([myPerson(e.owner), legacyOf(e.owner)]).then(function (r) {
          if (!core.canSee(e, viewer, r[0], Boolean(r[1] && r[1].state === 'passed'), now())) return null;
          return withMedia([e]).then(function (list) { return list[0]; });
        });
      });
    },

    saveEntry: function (fields) {
      var viewer = need();
      var load = fields.id ? get('entries', fields.id) : Promise.resolve(null);
      return load.then(function (existing) {
        var owner = existing ? existing.owner : (fields.owner || viewer);
        if (existing && !core.canEdit(existing, viewer)) throw new Error('Only the person who added this can change it.');
        return Promise.all([myPerson(owner), all('people')]).then(function (r) {
          if (!existing && !core.canAdd(owner, viewer, r[0])) throw new Error('You can only view this archive.');
          var e = existing ? copy(existing) : { id: uid(), owner: owner, createdBy: viewer, createdAt: now().toISOString() };
          ['kind', 'title', 'prompt', 'teller', 'forWhom', 'place', 'openWhen', 'body', 'audience'].forEach(function (k) {
            if (k in fields) e[k] = typeof fields[k] === 'string' ? fields[k].trim() : fields[k];
          });
          e.audiencePeople = (fields.audiencePeople || []).filter(function (id) {
            return r[1].some(function (p) { return p.id === id && p.owner === owner; });
          });
          e.releaseAt = e.audience === 'date' ? fields.releaseAt || null : null;
          e.updatedAt = now().toISOString();
          if (!e.title) throw new Error('Please give it a title.');
          if (!core.find(core.KINDS, e.kind)) throw new Error('Please choose what kind of entry this is.');
          if (owner !== e.createdBy && (e.audience === 'date' || e.audience === 'passed')) throw new Error('Only the owner can leave entries for later.');
          if ((e.audience === 'people' || e.audience === 'date') && !e.audiencePeople.length) throw new Error('Please choose who should receive it.');
          if (e.audience === 'date' && !e.releaseAt) throw new Error('Please choose the date it opens.');
          return put('entries', e);
        });
      });
    },

    deleteEntry: function (id) {
      var viewer = need();
      return get('entries', id).then(function (e) {
        if (!e || !core.canEdit(e, viewer)) throw new Error('Only the person who added this can delete it.');
        return all('media').then(function (media) {
          return Promise.all(media.filter(function (m) { return m.entryId === id; }).map(function (m) { return del('media', m.id); }));
        }).then(function () { return del('entries', id); });
      });
    },

    addMedia: function (entry, file, name) {
      var viewer = need();
      if (!core.canEdit(entry, viewer)) return Promise.reject(new Error('Only the person who added this can attach files.'));
      var fileName = name || file.name || 'file';
      return put('media', {
        id: uid(), entryId: entry.id, owner: entry.owner, kind: core.mediaKind(file.type, fileName),
        name: fileName, mime: file.type || 'application/octet-stream', size: file.size, blob: file, createdAt: now().toISOString(),
      }).then(function (m) { var c = copy(m); delete c.blob; return c; });
    },

    mediaUrl: function (m) {
      if (objectUrls[m.id]) return Promise.resolve(objectUrls[m.id]);
      return get('media', m.id).then(function (row) {
        if (!row) throw new Error('This file is missing.');
        objectUrls[m.id] = URL.createObjectURL(row.blob);
        return objectUrls[m.id];
      });
    },

    deleteMedia: function (m) {
      var viewer = need();
      return get('entries', m.entryId).then(function (e) {
        if (!e || !core.canEdit(e, viewer)) throw new Error('Only the person who added this can remove it.');
        return del('media', m.id);
      });
    },

    /** Archives that other people have shared with the signed-in person. */
    sharedWithMe: function () {
      var viewer = need();
      return Promise.all([all('people'), all('users')]).then(function (r) {
        var rows = r[0].filter(function (p) { return p.userId === viewer; });
        return Promise.all(rows.map(function (p) {
          var owner = r[1].filter(function (u) { return u.id === p.owner; })[0];
          return legacyOf(p.owner).then(function (l) {
            return { owner: p.owner, ownerName: owner ? owner.name : 'Someone', role: p.role, personId: p.id, legacy: l };
          });
        }));
      });
    },

    reportPassing: function (owner) {
      var viewer = need();
      return myPerson(owner).then(function (p) {
        if (!p || p.role !== 'legacy') throw new Error('Only a legacy contact can do this.');
        return get('legacy', owner).then(function (l) {
          return put('legacy', core.legacyReport(l || core.newLegacy(owner, now()), viewer, now()));
        });
      });
    },

    /** Preview only: lets people see what heirs receive without waiting a month. */
    skipWaiting: function (owner) {
      return get('legacy', owner).then(function (l) {
        if (!l || l.state !== 'reported') return l;
        l.waitEndsAt = new Date(now().getTime() - 1000).toISOString();
        return put('legacy', core.legacyNext(l, now()));
      });
    },

    elders: function () {
      var owner = need();
      return all('elders').then(function (list) {
        return list.filter(function (e) { return e.owner === owner; }).sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt); });
      });
    },

    saveElder: function (fields) {
      var owner = need();
      var load = fields.id ? get('elders', fields.id) : Promise.resolve(null);
      return load.then(function (existing) {
        var e = existing && existing.owner === owner ? copy(existing) : { id: uid(), owner: owner, idx: 0, answered: 0, askedAt: null, createdAt: now().toISOString() };
        ['name', 'relation', 'phone', 'day', 'idx', 'answered', 'askedAt', 'signAs', 'autoSend'].forEach(function (k) { if (k in fields) e[k] = fields[k]; });
        e.day = Number(e.day) || 0;
        if (!String(e.name || '').trim()) throw new Error('Please add their name.');
        return put('elders', e);
      });
    },

    deleteElder: function (id) {
      var owner = need();
      return get('elders', id).then(function (e) { if (e && e.owner === owner) return del('elders', id); });
    },

    /** The roots portrait kept in this archive, in its saved form (TCHRootsArt.clean), or null. */
    roots: function () {
      var owner = need();
      return get('roots', owner).then(function (r) { return r ? r.data : null; });
    },

    saveRoots: function (data) {
      var owner = need();
      return put('roots', { owner: owner, data: data, updatedAt: now().toISOString() }).then(function () { return data; });
    },

    deleteAccount: function () {
      var owner = need();
      return Promise.all(['entries', 'media', 'people', 'elders'].map(function (name) {
        return all(name).then(function (list) {
          return Promise.all(list.filter(function (x) { return x.owner === owner || (name === 'people' && x.userId === owner); })
            .map(function (x) { return del(name, x.id); }));
        });
      })).then(function () { return del('legacy', owner); })
        .then(function () { return del('roots', owner); })
        .then(function () { return del('users', owner); })
        .then(function () { return store.signOut(); });
    },
  };

  (root.TCH.stores = root.TCH.stores || {}).local = store;
})(this);
