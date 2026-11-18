// The family archive app's connection to a Supabase project, using fetch only (no client library).
// Sign-in is by emailed link (and Google, when switched on); the database's row-level security
// decides what each person sees, so this file only asks. Files go to the private "archive" bucket.
(function (root) {
  var core = root.TCH.core;
  var SESSION = 'tch-session';

  function create(cfg) {
    var base = String(cfg.url).replace(/\/+$/, '');
    var session = null;
    try { session = JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch (e) {}
    var signed = {};

    function keep(s) {
      session = s;
      try {
        if (s) localStorage.setItem(SESSION, JSON.stringify(s));
        else localStorage.removeItem(SESSION);
      } catch (e) {}
    }

    function fromTokens(t) {
      return {
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: Number(t.expires_at) || Math.floor(Date.now() / 1000) + Number(t.expires_in || 3600),
        user: t.user || (session && session.user) || null,
      };
    }

    function problem(res, body) {
      var msg = body && (body.msg || body.message || body.error_description || body.error);
      if (res.status === 401 || res.status === 403) msg = msg || 'You do not have permission to do that.';
      var err = new Error(msg || 'Something went wrong (' + res.status + '). Please try again.');
      err.status = res.status;
      return err;
    }

    function request(path, opts) {
      opts = opts || {};
      var headers = { apikey: cfg.anonKey };
      Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });
      if (opts.json !== undefined) headers['content-type'] = 'application/json';
      return (opts.auth === false ? Promise.resolve(null) : token()).then(function (t) {
        // Legacy anon keys are JWTs and double as a bearer token; newer sb_publishable_ keys are not.
        if (t || /^eyJ/.test(cfg.anonKey)) headers.authorization = 'Bearer ' + (t || cfg.anonKey);
        return fetch(base + path, {
          method: opts.method || 'GET',
          headers: headers,
          body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.body,
        });
      }).then(function (res) {
        return res.text().then(function (text) {
          var body = null;
          try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
          if (!res.ok) throw problem(res, body);
          return body;
        });
      });
    }

    var refreshing = null;
    function token() {
      if (!session) return Promise.resolve(null);
      if (session.expires_at * 1000 - Date.now() > 60000) return Promise.resolve(session.access_token);
      if (!refreshing) {
        refreshing = request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, json: { refresh_token: session.refresh_token } })
          .then(function (t) { keep(fromTokens(t)); return session.access_token; })
          .catch(function (err) { if (err.status && err.status < 500) keep(null); throw err; })
          .then(function (t) { refreshing = null; return t; }, function (err) { refreshing = null; throw err; });
      }
      return refreshing;
    }

    function rest(path, opts) { return request('/rest/v1/' + path, opts); }
    function rpc(name, args) { return rest('rpc/' + name, { method: 'POST', json: args || {} }); }
    function enc(v) { return encodeURIComponent(v); }
    function me() {
      if (!session || !session.user) throw new Error('Please sign in first.');
      return session.user.id;
    }

    function userOut(u) {
      var meta = u.user_metadata || {};
      return { id: u.id, email: u.email, name: meta.display_name || meta.full_name || meta.name || (u.email || '').split('@')[0] };
    }
    function contributionOut(c) {
      return { id: c.id, placeSlug: c.place_slug, suggestedPlace: c.suggested_place, kind: c.kind, title: c.title, body: c.body, credit: c.credit, status: c.status, createdAt: c.created_at };
    }
    function listingOut(l) {
      return { id: l.id, userId: l.user_id, role: l.role, placeSlug: l.place_slug, name: l.name, summary: l.summary, languages: l.languages || [], link: l.link, priceNote: l.price_note, status: l.status, createdAt: l.created_at };
    }
    function bookingOut(b) {
      var l = b.listings ? listingOut(b.listings) : null;
      return {
        id: b.id, listingId: b.listing_id, listing: l, requestedBy: b.requested_by, message: b.message, pricePaise: b.price_paise,
        feePaise: b.platform_fee_paise, reply: b.reply, status: b.status, createdAt: b.created_at,
        side: l && session && session.user && l.userId === session.user.id ? 'provider' : 'family',
      };
    }
    function personOut(p) { return { id: p.id, owner: p.owner_id, name: p.name, email: p.email, role: p.role, userId: p.user_id }; }
    function legacyOut(l) {
      if (!l || !l.owner_id) return null;
      return { owner: l.owner_id, quietMonths: l.quiet_months, waitDays: l.wait_days, lastSeenAt: l.last_seen_at, state: l.state, reportedBy: l.reported_by, waitEndsAt: l.wait_ends_at, passedAt: l.passed_at };
    }
    function mediaOut(m) { return { id: m.id, entryId: m.entry_id, owner: m.owner_id, kind: m.kind, name: m.name, mime: m.mime, size: m.size, path: m.path, createdAt: m.created_at }; }
    function entryOut(e) {
      return {
        id: e.id, owner: e.owner_id, createdBy: e.created_by, kind: e.kind, title: e.title, prompt: e.prompt || '', teller: e.teller || '',
        forWhom: e.for_whom || '', place: e.place || '', openWhen: e.open_when || '', body: e.body || '', audience: e.audience,
        audiencePeople: e.audience_people || [], releaseAt: e.release_at, createdAt: e.created_at, updatedAt: e.updated_at,
        media: (e.media || []).map(mediaOut).sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt); }),
      };
    }
    function elderOut(e) { return { id: e.id, owner: e.owner_id, name: e.name, relation: e.relation || '', phone: e.phone || '', day: e.day, idx: e.idx, answered: e.answered, askedAt: e.asked_at, signAs: e.sign_as || '', autoSend: !!e.auto_send, createdAt: e.created_at }; }

    function removeFiles(paths) {
      if (!paths.length) return Promise.resolve();
      return request('/storage/v1/object/archive', { method: 'DELETE', json: { prefixes: paths } });
    }

    var store = {
      mode: 'supabase',
      google: Boolean(cfg.google),

      session: function () {
        if (!session) return Promise.resolve(null);
        return token().then(function () {
          if (!session) return null;
          return request('/auth/v1/user').then(function (u) {
            session.user = userOut(u);
            keep(session);
            return rpc('claim_people').then(function () { return { user: session.user }; });
          });
        }).catch(function (err) {
          if (err.status === 401 || err.status === 403) { keep(null); return null; }
          throw err;
        });
      },

      /** Emails a sign-in link that comes back to `returnTo`. New addresses get an account. */
      signIn: function (email, name, returnTo) {
        email = String(email || '').trim();
        if (email.indexOf('@') < 1) return Promise.reject(new Error('Please enter an email address.'));
        var body = { email: email, create_user: true };
        if (name) body.data = { display_name: String(name).trim().slice(0, 80) };
        return request('/auth/v1/otp?redirect_to=' + enc(returnTo), { method: 'POST', auth: false, json: body })
          .then(function () { return { sent: true }; });
      },

      googleUrl: function (returnTo) {
        return base + '/auth/v1/authorize?provider=google&redirect_to=' + enc(returnTo);
      },

      /** Picks up the tokens Supabase puts in the address after a sign-in link or Google. */
      handleRedirect: function (hash) {
        var params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
        if (params.get('error_description') || params.get('error')) {
          return Promise.reject(new Error((params.get('error_description') || params.get('error')).replace(/\+/g, ' ')));
        }
        if (!params.get('access_token')) return Promise.resolve(null);
        keep(fromTokens({
          access_token: params.get('access_token'), refresh_token: params.get('refresh_token'),
          expires_at: params.get('expires_at'), expires_in: params.get('expires_in'),
        }));
        return store.session();
      },

      signOut: function () {
        var done = function () { keep(null); };
        if (!session) return Promise.resolve();
        return request('/auth/v1/logout', { method: 'POST' }).then(done, done);
      },

      saveProfile: function (fields) {
        var name = String(fields.name || '').trim().slice(0, 80);
        return request('/auth/v1/user', { method: 'PUT', json: { data: { display_name: name } } }).then(function (u) {
          session.user = userOut(u);
          keep(session);
          return rest('profiles', { method: 'POST', json: { id: session.user.id, display_name: name || session.user.name }, headers: { prefer: 'resolution=merge-duplicates' } })
            .then(function () { return session.user; });
        });
      },

      touchSeen: function () {
        var user = session && session.user;
        return rpc('claim_people').then(function () { return rpc('touch_seen'); }).then(function (l) {
          if (!user) return legacyOut(l);
          return rest('profiles', { method: 'POST', json: { id: user.id, display_name: user.name }, headers: { prefer: 'resolution=ignore-duplicates' } })
            .catch(function () {}).then(function () { return legacyOut(l); });
        });
      },

      legacy: function () {
        return rest('legacy?owner_id=eq.' + me()).then(function (rows) { return legacyOut(rows[0]); });
      },

      saveLegacy: function (fields) {
        return rest('legacy?owner_id=eq.' + me(), {
          method: 'PATCH', headers: { prefer: 'return=representation' },
          json: { quiet_months: Number(fields.quietMonths), wait_days: Number(fields.waitDays) },
        }).then(function (rows) {
          if (!rows.length) throw new Error('This archive has been passed on and can no longer be changed.');
          return legacyOut(rows[0]);
        });
      },

      people: function () {
        return rest('people?owner_id=eq.' + me() + '&order=name').then(function (rows) { return rows.map(personOut); });
      },

      savePerson: function (p) {
        var row = { name: String(p.name || '').trim(), email: String(p.email || '').trim().toLowerCase(), role: p.role };
        if (!row.name) return Promise.reject(new Error('Please add their name.'));
        if (session.user.email && row.email === session.user.email.toLowerCase()) return Promise.reject(new Error('That is your own email address.'));
        var req = p.id
          ? rest('people?id=eq.' + p.id, { method: 'PATCH', json: row, headers: { prefer: 'return=representation' } })
          : rest('people', { method: 'POST', json: row, headers: { prefer: 'return=representation' } });
        return req.then(function (rows) { return personOut(rows[0]); }, function (err) {
          if (/duplicate|unique/i.test(err.message)) throw new Error('Someone with that email is already on your list.');
          throw err;
        });
      },

      deletePerson: function (id) { return rest('people?id=eq.' + id, { method: 'DELETE' }); },

      entries: function (owner) {
        var id = me();
        owner = owner || id;
        var claimed = owner === id ? Promise.resolve() : rpc('claim_people');
        return claimed.then(function () {
          return rest('entries?select=*,media(*)&owner_id=eq.' + owner + '&order=created_at.desc');
        }).then(function (rows) { return rows.map(entryOut); });
      },

      entry: function (id) {
        return rest('entries?select=*,media(*)&id=eq.' + id).then(function (rows) { return rows[0] ? entryOut(rows[0]) : null; });
      },

      saveEntry: function (f) {
        var row = {
          kind: f.kind, title: String(f.title || '').trim(), prompt: f.prompt || null, teller: f.teller || null, for_whom: f.forWhom || null,
          place: f.place || null, open_when: f.openWhen || null, body: f.body || null, audience: f.audience,
          audience_people: f.audiencePeople || [], release_at: f.audience === 'date' ? f.releaseAt || null : null,
        };
        if (!row.title) return Promise.reject(new Error('Please give it a title.'));
        if ((row.audience === 'people' || row.audience === 'date') && !row.audience_people.length) return Promise.reject(new Error('Please choose who should receive it.'));
        if (row.audience === 'date' && !row.release_at) return Promise.reject(new Error('Please choose the date it opens.'));
        if (!f.id && f.owner) row.owner_id = f.owner;
        var req = f.id
          ? rest('entries?id=eq.' + f.id + '&select=*,media(*)', { method: 'PATCH', json: row, headers: { prefer: 'return=representation' } })
          : rest('entries?select=*,media(*)', { method: 'POST', json: row, headers: { prefer: 'return=representation' } });
        return req.then(function (rows) {
          if (!rows.length) throw new Error('Only the person who added this can change it.');
          return entryOut(rows[0]);
        }, function (err) {
          if (/row-level security/i.test(err.message)) throw new Error('You can only view this archive.');
          throw err;
        });
      },

      deleteEntry: function (id) {
        return rest('media?select=path&entry_id=eq.' + id).then(function (rows) {
          return removeFiles(rows.map(function (r) { return r.path; }));
        }).then(function () { return rest('entries?id=eq.' + id, { method: 'DELETE' }); });
      },

      addMedia: function (entry, file, name) {
        var fileName = name || file.name || 'file';
        var path = entry.owner + '/' + entry.id + '/' + Date.now().toString(36) + '-' + core.safeFileName(fileName);
        var mime = file.type || 'application/octet-stream';
        return request('/storage/v1/object/archive/' + path.split('/').map(enc).join('/'), {
          method: 'POST', body: file, headers: { 'content-type': mime, 'x-upsert': 'false' },
        }).then(function () {
          return rest('media', {
            method: 'POST', headers: { prefer: 'return=representation' },
            json: { entry_id: entry.id, owner_id: entry.owner, kind: core.mediaKind(mime, fileName), name: fileName, mime: mime, size: file.size, path: path },
          }).catch(function (err) { return removeFiles([path]).then(function () { throw err; }); });
        }).then(function (rows) { return mediaOut(rows[0]); });
      },

      mediaUrl: function (m) {
        var hit = signed[m.path];
        if (hit && hit.until > Date.now()) return Promise.resolve(hit.url);
        return request('/storage/v1/object/sign/archive/' + m.path.split('/').map(enc).join('/'), { method: 'POST', json: { expiresIn: 3600 } })
          .then(function (r) {
            var url = base + '/storage/v1' + (r.signedURL || r.signedUrl);
            signed[m.path] = { url: url, until: Date.now() + 50 * 60000 };
            return url;
          });
      },

      deleteMedia: function (m) {
        return rest('media?id=eq.' + m.id, { method: 'DELETE' }).then(function () { return removeFiles([m.path]); });
      },

      sharedWithMe: function () {
        var id = me();
        return rpc('claim_people').then(function () {
          return rest('people?select=id,owner_id,role&user_id=eq.' + id);
        }).then(function (rows) {
          if (!rows.length) return [];
          var owners = rows.map(function (r) { return r.owner_id; });
          return rest('profiles?select=id,display_name&id=in.(' + owners.join(',') + ')').then(function (profiles) {
            return Promise.all(rows.map(function (r) {
              var p = profiles.filter(function (x) { return x.id === r.owner_id; })[0];
              return rpc('legacy_for', { owner: r.owner_id }).then(function (l) {
                return { owner: r.owner_id, ownerName: p ? p.display_name : 'Someone', role: r.role, personId: r.id, legacy: legacyOut(l) };
              });
            }));
          });
        });
      },

      reportPassing: function (owner) {
        return rpc('claim_people').then(function () { return rpc('report_passing', { owner: owner }); }).then(legacyOut);
      },

      elders: function () {
        return rest('weekly_elders?owner_id=eq.' + me() + '&order=created_at').then(function (rows) { return rows.map(elderOut); });
      },

      saveElder: function (f) {
        var row = {};
        var map = { name: 'name', relation: 'relation', phone: 'phone', day: 'day', idx: 'idx', answered: 'answered', askedAt: 'asked_at', signAs: 'sign_as', autoSend: 'auto_send' };
        Object.keys(map).forEach(function (k) { if (k in f) row[map[k]] = f[k]; });
        if ('name' in row && !String(row.name).trim()) return Promise.reject(new Error('Please add their name.'));
        var req = f.id
          ? rest('weekly_elders?id=eq.' + f.id, { method: 'PATCH', json: row, headers: { prefer: 'return=representation' } })
          : rest('weekly_elders', { method: 'POST', json: row, headers: { prefer: 'return=representation' } });
        return req.then(function (rows) { return elderOut(rows[0]); });
      },

      deleteElder: function (id) { return rest('weekly_elders?id=eq.' + id, { method: 'DELETE' }); },

      roots: function () {
        return rest('roots?select=data&owner_id=eq.' + me()).then(function (rows) { return rows[0] ? rows[0].data : null; });
      },

      saveRoots: function (data) {
        return rest('roots?on_conflict=owner_id', { method: 'POST', json: { owner_id: me(), data: data }, headers: { prefer: 'resolution=merge-duplicates,return=minimal' } })
          .then(function () { return data; });
      },

      contribute: function (fields) {
        var c = core.contribution(fields);
        return rest('place_contributions', {
          method: 'POST', headers: { prefer: 'return=representation' },
          json: { place_slug: c.placeSlug, suggested_place: c.suggestedPlace, kind: c.kind, title: c.title, body: c.body, credit: c.credit },
        }).then(function (rows) { return contributionOut(rows[0]); });
      },

      myContributions: function () {
        return rest('place_contributions?submitted_by=eq.' + me() + '&order=created_at.desc').then(function (rows) { return rows.map(contributionOut); });
      },

      isModerator: function () { return rpc('is_moderator').then(function (r) { return r === true; }); },

      pendingContributions: function () {
        return rest('place_contributions?status=eq.pending&order=created_at').then(function (rows) { return rows.map(contributionOut); });
      },

      reviewContribution: function (id, status) {
        if (status !== 'published' && status !== 'rejected') throw new Error('Unknown review: ' + status);
        return rest('place_contributions?id=eq.' + id, { method: 'PATCH', json: { status: status }, headers: { prefer: 'return=representation' } })
          .then(function (rows) {
            if (!rows.length) throw new Error('Only moderators can review contributions.');
            return contributionOut(rows[0]);
          });
      },

      myListings: function () {
        return rest('listings?user_id=eq.' + me() + '&order=created_at').then(function (rows) { return rows.map(listingOut); });
      },

      /** New listings and every edit wait for a moderator before they are public again. */
      saveListing: function (fields) {
        var l = core.listing(fields);
        var row = { role: l.role, place_slug: l.placeSlug, name: l.name, summary: l.summary, languages: l.languages, link: l.link, price_note: l.priceNote };
        var req = fields.id
          ? rest('listings?id=eq.' + fields.id, { method: 'PATCH', json: row, headers: { prefer: 'return=representation' } })
          : rest('listings', { method: 'POST', json: row, headers: { prefer: 'return=representation' } });
        return req.then(function (rows) { return listingOut(rows[0]); });
      },

      deleteListing: function (id) { return rest('listings?id=eq.' + id, { method: 'DELETE' }); },

      listing: function (id) {
        return rest('listings?id=eq.' + enc(id)).then(function (rows) { return rows[0] ? listingOut(rows[0]) : null; });
      },

      requestBooking: function (listingId, message) {
        var m = core.bookingMessage(message);
        return rest('bookings?select=*,listings(*)', { method: 'POST', json: { listing_id: listingId, message: m }, headers: { prefer: 'return=representation' } })
          .then(function (rows) { return bookingOut(rows[0]); }, function (err) {
            if (/row-level security/i.test(err.message)) throw new Error('You can\'t send a request to your own listing.');
            throw err;
          });
      },

      /** Requests you have sent and requests sent to your listings, newest first. */
      myBookings: function () {
        return rest('bookings?select=*,listings(*)&order=created_at.desc').then(function (rows) {
          var id = me();
          return rows.filter(function (b) { return b.requested_by === id || (b.listings && b.listings.user_id === id); }).map(bookingOut);
        });
      },

      updateBooking: function (id, change) {
        var row = {};
        if (change.quote) { row.price_paise = change.quote.pricePaise; row.reply = change.quote.reply; row.status = 'quoted'; }
        if (change.status) row.status = change.status;
        if ('reply' in change) row.reply = change.reply;
        if (change.paymentRef) row.payment_ref = change.paymentRef;
        return rest('bookings?id=eq.' + id + '&select=*,listings(*)', { method: 'PATCH', json: row, headers: { prefer: 'return=representation' } })
          .then(function (rows) {
            if (!rows.length) throw new Error('This request could not be changed.');
            return bookingOut(rows[0]);
          });
      },

      bookingContacts: function (id) { return rpc('booking_contacts', { booking: id }); },

      pendingListings: function () {
        return rest('listings?status=eq.pending&order=created_at').then(function (rows) { return rows.map(listingOut); });
      },

      reviewListing: function (id, status) {
        if (status !== 'published' && status !== 'paused') throw new Error('Unknown review: ' + status);
        return rest('listings?id=eq.' + id, { method: 'PATCH', json: { status: status }, headers: { prefer: 'return=representation' } })
          .then(function (rows) {
            if (!rows.length) throw new Error('Only moderators can review listings.');
            return listingOut(rows[0]);
          });
      },

      /** For moderators: accepted bookings waiting for a payment link, and paid ones to complete. */
      bookingsToSettle: function () {
        return rest('bookings?select=*,listings(*)&status=in.(accepted,paid)&order=created_at').then(function (rows) { return rows.map(bookingOut); });
      },

      myEchoes: function () {
        if (!session) return Promise.resolve([]);
        return rest('contribution_echoes?select=contribution_id&user_id=eq.' + me()).then(function (rows) { return rows.map(function (r) { return r.contribution_id; }); });
      },

      echo: function (contributionId, on) {
        if (on === false) return rest('contribution_echoes?contribution_id=eq.' + enc(contributionId) + '&user_id=eq.' + me(), { method: 'DELETE' });
        return rest('contribution_echoes', { method: 'POST', json: { contribution_id: contributionId }, headers: { prefer: 'resolution=ignore-duplicates,return=minimal' } });
      },

      deleteAccount: function () {
        var id = me();
        return Promise.all([
          rest('media?select=path&owner_id=eq.' + id),
          rest('entries?select=media(path)&created_by=eq.' + id),
        ]).then(function (r) {
          var paths = r[0].map(function (m) { return m.path; });
          r[1].forEach(function (e) { e.media.forEach(function (m) { if (paths.indexOf(m.path) === -1) paths.push(m.path); }); });
          var batches = [];
          for (var i = 0; i < paths.length; i += 100) batches.push(paths.slice(i, i + 100));
          return batches.reduce(function (p, b) { return p.then(function () { return removeFiles(b); }); }, Promise.resolve());
        }).then(function () { return rpc('delete_my_account'); }).then(function () { keep(null); });
      },
    };
    return store;
  }

  (root.TCH.stores = root.TCH.stores || {}).supabase = create;
})(this);
