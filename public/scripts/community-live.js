// The Commons, live: this week's question, and what families have shared and a moderator has
// published, read straight from the database with the public key. Pending contributions are never
// visible here; the database only returns published ones to visitors.
(function () {
  var DAY = 24 * 60 * 60 * 1000;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function getJson(url, headers) {
    return fetch(url, headers ? { headers: headers } : undefined).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // ---------- this week's question ----------
  // Weeks since content/prompts.json "start" (a Monday in India). Answers record this number.
  function weekNumber(start, now) {
    return Math.max(0, Math.floor((now - Date.parse(start + 'T00:00:00+05:30')) / (7 * DAY)));
  }
  function weekStart(start, w) {
    return new Date(Date.parse(start + 'T00:00:00+05:30') + w * 7 * DAY);
  }
  var week = document.querySelector('[data-this-week]');
  if (week && window.fetch) {
    getJson('/community/prompts.json').then(function (data) {
      if (!data || !data.prompts.length) return;
      var w = weekNumber(data.start, Date.now());
      var p = data.prompts[w % data.prompts.length];
      week.querySelector('[data-this-week-text]').textContent = p.text;
      var tag = week.querySelector('[data-this-week-tag]');
      tag.textContent = p.hashtag ? '#' + p.hashtag : '';
      tag.hidden = !p.hashtag;
      week.querySelector('[data-this-week-link]').href = '/app.html#/contribute?week=' + w;
    });
  }

  // ---------- published contributions ----------
  var feeds = document.querySelectorAll('[data-community-feed]');
  var directories = document.querySelectorAll('[data-listings]');
  var sharedBox = document.querySelector('[data-shared]');
  var archiveBox = document.querySelector('[data-question-archive]');
  var countBox = document.querySelector('[data-community-count]');
  if ((!feeds.length && !directories.length && !sharedBox && !archiveBox && !countBox) || !window.fetch) return;
  var FIELDS = 'id,kind,title,body,credit,place_slug,suggested_place,script,pronunciation,prompt_week,created_at,status,featured_at';
  var placesReady = getJson('/places/places.json').then(function (list) {
    var bySlug = {};
    (list || []).forEach(function (p) { bySlug[p.slug] = p; });
    return bySlug;
  });

  function short(text, max) {
    var t = String(text).replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
  }
  function where(c, places) {
    var p = places[c.place_slug];
    if (p) {
      var a = el('a', 'community-place', p.name);
      a.href = p.path;
      return a;
    }
    return el('span', 'community-place', c.suggested_place || '');
  }
  function headersFor(box, token) {
    var h = { apikey: box.dataset.key };
    if (token || /^eyJ/.test(box.dataset.key)) h.authorization = 'Bearer ' + (token || box.dataset.key);
    return h;
  }
  // The app keeps its sign-in here. Only a fresh token is used; otherwise the app signs people in.
  function session() {
    try {
      var s = JSON.parse(localStorage.getItem('tch-session') || 'null');
      return s && s.user && s.expires_at * 1000 - Date.now() > 60000 ? s : null;
    } catch (e) { return null; }
  }

  // ---------- "We have this too" ----------
  var echoButtons = [];
  function echoButton(c) {
    var b = el('button', 'echo');
    b.type = 'button';
    b.dataset.contribution = c.id;
    b.setAttribute('aria-pressed', 'false');
    b.dataset.count = '0';
    b.appendChild(el('span', 'echo__label', 'We have this too'));
    b.appendChild(el('span', 'echo__count'));
    echoButtons.push(b);
    return b;
  }
  function paintEcho(b) {
    var n = Number(b.dataset.count);
    b.querySelector('.echo__count').textContent = n ? ' · ' + n + (n === 1 ? ' family' : ' families') : '';
  }
  function wireEchoes(box) {
    if (!echoButtons.length) return;
    var ids = echoButtons.map(function (b) { return b.dataset.contribution; });
    var s = session();
    var counts = getJson(box.dataset.url + '/rest/v1/contribution_echo_counts?contribution_id=in.(' + ids.join(',') + ')', headersFor(box));
    var mine = s ? getJson(box.dataset.url + '/rest/v1/contribution_echoes?select=contribution_id&user_id=eq.' + s.user.id, headersFor(box, s.access_token)) : Promise.resolve([]);
    Promise.all([counts, mine]).then(function (r) {
      var byId = {};
      (r[0] || []).forEach(function (x) { byId[x.contribution_id] = x.echoes; });
      var minePicked = (r[1] || []).map(function (x) { return x.contribution_id; });
      echoButtons.forEach(function (b) {
        b.dataset.count = String(byId[b.dataset.contribution] || 0);
        b.setAttribute('aria-pressed', minePicked.indexOf(b.dataset.contribution) >= 0 ? 'true' : 'false');
        paintEcho(b);
      });
    });
    echoButtons.forEach(function (b) {
      if (b.dataset.wired) return;
      b.dataset.wired = '1';
      b.addEventListener('click', function () {
        var now = session();
        if (!now) {
          location.href = '/app.html#/echo?c=' + b.dataset.contribution + '&back=' + encodeURIComponent(location.pathname + location.search);
          return;
        }
        var on = b.getAttribute('aria-pressed') !== 'true';
        var url = box.dataset.url + '/rest/v1/contribution_echoes' + (on ? '' : '?contribution_id=eq.' + b.dataset.contribution + '&user_id=eq.' + now.user.id);
        var headers = headersFor(box, now.access_token);
        headers['content-type'] = 'application/json';
        headers.prefer = 'resolution=ignore-duplicates,return=minimal';
        b.disabled = true;
        fetch(url, { method: on ? 'POST' : 'DELETE', headers: headers, body: on ? JSON.stringify({ contribution_id: b.dataset.contribution }) : undefined })
          .then(function (res) {
            if (!res.ok) throw new Error(res.status);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.dataset.count = String(Math.max(0, Number(b.dataset.count) + (on ? 1 : -1)));
            paintEcho(b);
          })
          .catch(function () {})
          .then(function () { b.disabled = false; });
      });
    });
  }

  // Served by api/shared.mjs on the live site, so link previews show the contribution itself.
  function permalink(c) { return '/s/' + c.id; }
  function reportLink(c) {
    var a = el('a', 'card-action', 'Report');
    a.href = '/app.html#/report?c=' + c.id + '&back=' + encodeURIComponent(location.pathname + location.search);
    return a;
  }
  function shareTitle(c) { return '"' + c.title + '", shared on The Cultured Human'; }
  // The phone's own share sheet where there is one; otherwise the link is copied.
  function shareButton(c, label) {
    var b = el('button', 'card-action', label || 'Share');
    b.type = 'button';
    b.addEventListener('click', function () {
      var url = location.origin + permalink(c);
      if (navigator.share) { navigator.share({ title: c.title, text: shareTitle(c), url: url }).catch(function () {}); return; }
      copy(url, b);
    });
    return b;
  }
  function copy(text, b) {
    var was = b.textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
      b.textContent = 'Link copied';
    }, function () {
      window.prompt('Copy this link', text);
    }).then(function () { setTimeout(function () { b.textContent = was; }, 2500); });
  }
  function wordLine(c) {
    if (!c.script && !c.pronunciation) return null;
    var p = el('p', 'word-line');
    if (c.script) p.appendChild(el('span', 'word-line__script', c.script));
    if (c.pronunciation) p.appendChild(el('span', 'word-line__say', '"' + c.pronunciation + '"'));
    return p;
  }
  function titleLink(tag, cls, c) {
    var t = el(tag, cls);
    var a = el('a', null, c.title);
    a.href = permalink(c);
    t.appendChild(a);
    return t;
  }

  function card(c, places, onPlacePage) {
    var n = el('article', 'carry-card carry-card--shared' + (c.featured_at ? ' carry-card--featured' : ''));
    if (c.featured_at) n.appendChild(el('p', 'featured-tag', 'Featured'));
    n.appendChild(el('p', 'eyebrow', c.kind));
    n.appendChild(titleLink('h3', null, c));
    var line = wordLine(c);
    if (line) n.appendChild(line);
    if (onPlacePage) String(c.body).split(/\n{2,}/).forEach(function (para) { n.appendChild(el('p', null, para)); });
    else n.appendChild(el('p', null, short(c.body, 220)));
    var credit = el('p', 'carry-card__credit', 'Shared by ' + c.credit);
    if (!onPlacePage) {
      credit.appendChild(document.createTextNode(' · '));
      credit.appendChild(where(c, places));
    }
    n.appendChild(credit);
    var row = el('div', 'card-actions');
    row.appendChild(echoButton(c));
    row.appendChild(shareButton(c));
    row.appendChild(reportLink(c));
    n.appendChild(row);
    return n;
  }
  function word(c, places) {
    var n = el('article', 'word-chip');
    n.appendChild(titleLink('p', 'word-chip__word', c));
    if (c.script) n.appendChild(el('p', 'word-chip__script', c.script));
    if (c.pronunciation) n.appendChild(el('p', 'word-chip__say', '"' + c.pronunciation + '"'));
    n.appendChild(el('p', 'word-chip__meaning', short(c.body, 120)));
    var from = el('p', 'word-chip__from');
    from.appendChild(where(c, places));
    from.appendChild(document.createTextNode(' · ' + c.credit));
    n.appendChild(from);
    n.appendChild(echoButton(c));
    return n;
  }

  Array.prototype.forEach.call(feeds, function (box) {
    if (!box.dataset.url) return;
    var q = 'select=' + FIELDS + '&status=eq.published';
    if (box.dataset.place) q += '&place_slug=eq.' + encodeURIComponent(box.dataset.place) + '&order=featured_at.desc.nullslast,created_at';
    else q += '&order=featured_at.desc.nullslast,created_at.desc';
    if (box.dataset.kind) q += '&kind=eq.' + encodeURIComponent(box.dataset.kind);
    q += '&limit=' + (Number(box.dataset.limit) || 6);
    Promise.all([getJson(box.dataset.url + '/rest/v1/place_contributions?' + q, headersFor(box)), placesReady]).then(function (r) {
      var rows = r[0];
      var places = r[1];
      if (!rows || !rows.length) return;
      var words = box.classList.contains('community-feed--words');
      var grid = box.querySelector(':scope > .carry-grid, :scope > .word-wall');
      if (!grid) {
        box.textContent = '';
        grid = el('div', words ? 'word-wall' : 'carry-grid');
        box.appendChild(grid);
      }
      rows.forEach(function (c) { grid.appendChild(words ? word(c, places) : card(c, places, Boolean(box.dataset.place))); });
      wireEchoes(box);
    });
  });

  if (countBox && countBox.dataset.url) {
    getJson(countBox.dataset.url + '/rest/v1/place_contributions?select=place_slug,suggested_place&status=eq.published&limit=5000', headersFor(countBox)).then(function (rows) {
      if (!rows || !rows.length) return;
      var places = {};
      rows.forEach(function (r) { places[r.place_slug || String(r.suggested_place).toLowerCase()] = true; });
      var n = Object.keys(places).length;
      countBox.textContent = rows.length + (rows.length === 1 ? ' thing' : ' things') + ' shared by families so far, from ' + n + (n === 1 ? ' place.' : ' places.');
      countBox.hidden = false;
    });
  }

  // ---------- one contribution, with sharing ----------
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function wrap(ctx, text, width, maxLines) {
    var words = String(text).replace(/\s+/g, ' ').trim().split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(next).width > width && line) {
        lines.push(line);
        line = words[i];
        if (lines.length === maxLines) break;
      } else line = next;
    }
    if (lines.length < maxLines && line) lines.push(line);
    else if (lines.length === maxLines && i < words.length) {
      var last = lines[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > width) last = last.replace(/\s*\S+$/, '');
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }
  // A portrait card (1080 × 1350, the shape Instagram shows in full) drawn in the page's own colours.
  function drawCard(c, placeName) {
    var W = 1080, H = 1350, P = 96;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var serif = '"Cormorant Garamond", Georgia, serif';
    var sans = '"DM Sans", system-ui, sans-serif';
    var fonts = document.fonts ? Promise.all([document.fonts.load('500 100px "Cormorant Garamond"'), document.fonts.load('400 36px "DM Sans"'), document.fonts.load('600 28px "DM Sans"')]).catch(function () {}) : Promise.resolve();
    var logo = new Promise(function (done) {
      var img = new Image();
      img.onload = function () { done(img); };
      img.onerror = function () { done(null); };
      img.src = '/brand/logo-192.png';
    });
    return Promise.all([fonts, logo]).then(function (r) {
      ctx.fillStyle = cssVar('--page', '#FBF4E8');
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = cssVar('--line', '#E5D4BD');
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 40, W - 80, H - 80);
      var y = P + 20;
      if (r[1]) ctx.drawImage(r[1], P, y - 20, 88, 88);
      ctx.fillStyle = cssVar('--primary', '#28594B');
      ctx.font = '600 28px ' + sans;
      ctx.textBaseline = 'middle';
      ctx.fillText('THE CULTURED HUMAN', P + (r[1] ? 112 : 0), y + 24);
      ctx.textBaseline = 'alphabetic';
      y += 170;
      var top = y - 40;
      ctx.fillStyle = cssVar('--accent-ink', '#A5472A');
      ctx.font = '600 30px ' + sans;
      ctx.fillText(c.kind.toUpperCase(), P, y);
      y += 110;
      ctx.fillStyle = cssVar('--primary', '#28594B');
      ctx.font = '500 104px ' + serif;
      wrap(ctx, c.title, W - 2 * P, 2).forEach(function (l) { ctx.fillText(l, P, y); y += 108; });
      if (c.script) {
        ctx.fillStyle = cssVar('--ink', '#352B26');
        ctx.font = '400 72px ' + serif;
        ctx.fillText(c.script, P, y + 8);
        y += 96;
      }
      if (c.pronunciation) {
        ctx.fillStyle = cssVar('--muted', '#6E6055');
        ctx.font = 'italic 400 38px ' + sans;
        ctx.fillText('"' + c.pronunciation + '"', P, y);
        y += 70;
      }
      y += 30;
      ctx.fillStyle = cssVar('--ink', '#352B26');
      ctx.font = '400 38px ' + sans;
      var room = Math.max(2, Math.floor((1070 - y) / 58));
      wrap(ctx, c.body, W - 2 * P, room).forEach(function (l) { ctx.fillText(l, P, y); y += 58; });
      // Short entries sit in the middle of the space instead of leaving a gap above the credit.
      var shift = Math.floor((1070 - y) / 2);
      if (shift > 20) {
        var block = ctx.getImageData(44, top, W - 88, y - top);
        ctx.fillStyle = cssVar('--page', '#FBF4E8');
        ctx.fillRect(44, top, W - 88, y - top);
        ctx.putImageData(block, 44, top + shift);
      }
      ctx.fillStyle = cssVar('--muted', '#6E6055');
      ctx.font = '400 32px ' + sans;
      wrap(ctx, 'Shared by ' + c.credit + (placeName ? ' · ' + placeName : ''), W - 2 * P, 1).forEach(function (l) { ctx.fillText(l, P, 1130); });
      ctx.fillStyle = cssVar('--band', '#28594B');
      ctx.fillRect(40, H - 200, W - 80, 160);
      ctx.fillStyle = cssVar('--band-ink', '#FFF5E6');
      ctx.font = '500 52px ' + serif;
      ctx.fillText('Where are your roots?', P, H - 122);
      ctx.font = '400 30px ' + sans;
      ctx.fillText('Add yours at ' + location.host, P, H - 74);
      return new Promise(function (done) { canvas.toBlob(done, 'image/png'); });
    });
  }
  function downloadCard(c, placeName, b) {
    var was = b.textContent;
    b.disabled = true;
    b.textContent = 'Making your card…';
    drawCard(c, placeName).then(function (blob) {
      if (!blob) throw new Error('No card');
      var file = typeof File === 'function' ? new File([blob], 'the-cultured-human-' + c.id.slice(0, 8) + '.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: c.title, text: shareTitle(c) + ' ' + location.origin + permalink(c) }).catch(function () {});
      }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'the-cultured-human-' + c.id.slice(0, 8) + '.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }).catch(function () {}).then(function () { b.disabled = false; b.textContent = was; });
  }

  if (sharedBox && sharedBox.dataset.url) {
    var idMeta = document.querySelector('meta[name="tch-shared-id"]');
    var sharedId = new URLSearchParams(location.search).get('id') || (location.pathname.match(/^\/s\/([^/]+)$/) || [])[1] || (idMeta && idMeta.content) || '';
    var empty = sharedBox.querySelector('[data-shared-empty]');
    var missing = function () {
      empty.querySelector('h1').textContent = 'We couldn\'t find that';
    };
    if (!/^[0-9a-f-]{36}$/i.test(sharedId)) missing();
    else {
      var me = session();
      Promise.all([
        getJson(sharedBox.dataset.url + '/rest/v1/place_contributions?select=' + FIELDS + '&id=eq.' + sharedId, headersFor(sharedBox, me && me.access_token)),
        placesReady,
        getJson('/community/prompts.json'),
      ]).then(function (r) {
        var c = r[0] && r[0][0];
        var places = r[1];
        if (!c) return missing();
        var place = places[c.place_slug];
        var placeName = place ? place.name : c.suggested_place || '';
        document.title = c.title + ' — The Cultured Human';
        sharedBox.textContent = '';
        var art = el('article', 'shared-card');
        if (c.status !== 'published') art.appendChild(el('p', 'shared-card__pending', 'Waiting to be read. Only you can see this until it is published.'));
        var eyebrow = el('p', 'eyebrow', c.kind + ' · ');
        eyebrow.appendChild(where(c, places));
        art.appendChild(eyebrow);
        art.appendChild(el('h1', null, c.title));
        if (c.script) art.appendChild(el('p', 'shared-card__script', c.script));
        if (c.pronunciation) art.appendChild(el('p', 'shared-card__say', 'Said "' + c.pronunciation + '"'));
        String(c.body).split(/\n{2,}/).forEach(function (para) { art.appendChild(el('p', 'shared-card__body', para)); });
        art.appendChild(el('p', 'carry-card__credit', 'Shared by ' + c.credit + ' · ' + new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })));
        var data = r[2];
        if (c.prompt_week !== null && data && data.prompts.length) {
          var asked = el('p', 'shared-card__question', 'Answering the question: ');
          var qa = el('a', null, data.prompts[c.prompt_week % data.prompts.length].text);
          qa.href = '/questions.html#week-' + c.prompt_week;
          asked.appendChild(qa);
          art.appendChild(asked);
        }
        var actions = el('div', 'card-actions');
        if (c.status === 'published') {
          actions.appendChild(echoButton(c));
          actions.appendChild(reportLink(c));
        }
        art.appendChild(actions);
        sharedBox.appendChild(art);

        if (c.status === 'published') {
          var share = el('section', 'shared-share');
          share.setAttribute('aria-labelledby', 'share-title');
          var h = el('h2', null, 'Send it to your family');
          h.id = 'share-title';
          share.appendChild(h);
          var row = el('div', 'btn-row');
          var url = location.origin + permalink(c);
          var wa = el('a', 'btn', 'WhatsApp');
          wa.href = 'https://wa.me/?text=' + encodeURIComponent(shareTitle(c) + ' ' + url);
          wa.rel = 'noopener';
          wa.target = '_blank';
          row.appendChild(wa);
          var cardBtn = el('button', 'btn btn--ghost', 'Download a card for Instagram');
          cardBtn.type = 'button';
          cardBtn.addEventListener('click', function () { downloadCard(c, placeName, cardBtn); });
          row.appendChild(cardBtn);
          var copyBtn = el('button', 'btn btn--ghost', 'Copy link');
          copyBtn.type = 'button';
          copyBtn.addEventListener('click', function () { copy(url, copyBtn); });
          row.appendChild(copyBtn);
          if (navigator.share) row.appendChild(shareButton(c, 'More ways to share')).className = 'btn btn--ghost';
          share.appendChild(row);
          share.appendChild(el('p', 'field__hint', 'Posting the card? Tag @theculturedhuman and credit ' + c.credit + '.'));
          sharedBox.appendChild(share);
        }

        var invite = el('section', 'invite__card invite__card--accent shared-invite');
        invite.appendChild(el('p', 'eyebrow', 'Your turn'));
        invite.appendChild(el('h2', null, 'Does your family have this too?'));
        invite.appendChild(el('p', null, 'Say so with "We have this too", or add your own version. Every family remembers it a little differently.'));
        var add = el('a', 'btn btn--light', 'Add yours');
        add.href = '/app.html#/contribute?' + (c.prompt_week !== null ? 'week=' + c.prompt_week : 'kind=' + encodeURIComponent(c.kind) + (c.place_slug ? '&place=' + c.place_slug : ''));
        invite.appendChild(add);
        sharedBox.appendChild(invite);
        wireEchoes(sharedBox);

        if (!c.place_slug) return;
        getJson(sharedBox.dataset.url + '/rest/v1/place_contributions?select=' + FIELDS + '&status=eq.published&place_slug=eq.' + c.place_slug + '&id=neq.' + c.id + '&order=created_at.desc&limit=3', headersFor(sharedBox)).then(function (more) {
          if (!more || !more.length) return;
          var sec = el('section', 'shared-more');
          sec.appendChild(el('h2', null, 'More from ' + placeName));
          var grid = el('div', 'carry-grid');
          more.forEach(function (m) { grid.appendChild(card(m, places, false)); });
          sec.appendChild(grid);
          var all = el('a', 'text-link', 'Everything from ' + placeName);
          all.href = place.path;
          sec.appendChild(all);
          sharedBox.appendChild(sec);
          wireEchoes(sharedBox);
        });
      });
    }
  }

  // ---------- every week's question ----------
  if (archiveBox && archiveBox.dataset.url) {
    getJson('/community/prompts.json').then(function (data) {
      if (!data || !data.prompts.length) return;
      var now = weekNumber(data.start, Date.now());
      var q = 'select=' + FIELDS + '&status=eq.published&prompt_week=gte.0&prompt_week=lte.' + now + '&order=created_at.desc&limit=500';
      return Promise.all([getJson(archiveBox.dataset.url + '/rest/v1/place_contributions?' + q, headersFor(archiveBox)), placesReady]).then(function (r) {
        var byWeek = {};
        (r[0] || []).forEach(function (c) { (byWeek[c.prompt_week] = byWeek[c.prompt_week] || []).push(c); });
        archiveBox.textContent = '';
        for (var w = now; w >= 0; w--) {
          var p = data.prompts[w % data.prompts.length];
          var answers = byWeek[w] || [];
          var sec = el('section', 'question-week');
          sec.id = 'week-' + w;
          sec.appendChild(el('p', 'eyebrow', (w === now ? 'This week · ' : 'Week of ') + weekStart(data.start, w).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })));
          sec.appendChild(el('h2', null, p.text));
          var meta = el('p', 'question-week__meta', answers.length ? answers.length + (answers.length === 1 ? ' answer' : ' answers') : 'No answers yet. Yours could be the first.');
          sec.appendChild(meta);
          if (answers.length) {
            var grid = el('div', 'carry-grid');
            answers.slice(0, 6).forEach(function (c) { grid.appendChild(card(c, r[1], false)); });
            sec.appendChild(grid);
          }
          var answer = el('a', w === now ? 'btn' : 'btn btn--ghost', w === now ? 'Answer this week\'s question' : 'Answer it');
          answer.href = '/app.html#/contribute?week=' + w;
          var row = el('div', 'btn-row');
          row.appendChild(answer);
          sec.appendChild(row);
          archiveBox.appendChild(sec);
        }
        wireEchoes(archiveBox);
        if (location.hash) {
          var target = document.getElementById(location.hash.slice(1));
          if (target) target.scrollIntoView();
        }
      });
    });
  }

  // ---------- makers, hosts and storytellers ----------
  var ROLES = { maker: ['Maker', 'Ask for a piece'], host: ['Host', 'Plan a journey'], storyteller: ['Storyteller', 'Book a storyteller'] };
  function person(l, places) {
    var p = places[l.place_slug];
    var n = el('article', 'person-card person-card--live');
    var eyebrow = el('p', 'eyebrow', (ROLES[l.role] || [l.role])[0] + ' · ');
    if (p) {
      var a = el('a', null, p.name);
      a.href = p.path;
      eyebrow.appendChild(a);
    }
    n.appendChild(eyebrow);
    n.appendChild(el('h3', null, l.name));
    n.appendChild(el('p', null, l.summary));
    if (l.languages && l.languages.length) n.appendChild(el('p', 'person-card__meta', 'Speaks ' + l.languages.join(', ')));
    if (l.price_note) n.appendChild(el('p', 'person-card__meta', l.price_note));
    var row = el('div', 'person-card__actions');
    var ask = el('a', 'btn btn--small', (ROLES[l.role] || [0, 'Send a request'])[1]);
    ask.href = '/app.html#/request?listing=' + l.id;
    row.appendChild(ask);
    if (/^https:\/\//.test(l.link || '')) {
      var work = el('a', 'text-link', 'See their work');
      work.href = l.link;
      work.rel = 'noopener nofollow';
      row.appendChild(work);
    }
    n.appendChild(row);
    return n;
  }
  Array.prototype.forEach.call(directories, function (box) {
    if (!box.dataset.url) return;
    var q = 'select=id,role,place_slug,name,summary,languages,link,price_note&status=eq.published&order=created_at&limit=60';
    if (box.dataset.role) q += '&role=eq.' + encodeURIComponent(box.dataset.role);
    if (box.dataset.place) q += '&place_slug=eq.' + encodeURIComponent(box.dataset.place);
    Promise.all([getJson(box.dataset.url + '/rest/v1/listings?' + q, headersFor(box)), placesReady]).then(function (r) {
      var rows = r[0];
      if (!rows || !rows.length) return;
      var grid = box.querySelector('.person-grid');
      if (!grid) {
        box.textContent = '';
        grid = el('div', 'person-grid');
        box.appendChild(grid);
      }
      rows.forEach(function (l) { grid.appendChild(person(l, r[1])); });
    });
  });
})();
