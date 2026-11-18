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
  function weekIndex(start, count, now) {
    var weeks = Math.floor((now - Date.parse(start + 'T00:00:00+05:30')) / (7 * DAY));
    return ((weeks % count) + count) % count;
  }
  var week = document.querySelector('[data-this-week]');
  if (week && window.fetch) {
    getJson('/community/prompts.json').then(function (data) {
      if (!data || !data.prompts.length) return;
      var i = weekIndex(data.start, data.prompts.length, Date.now());
      var p = data.prompts[i];
      week.querySelector('[data-this-week-text]').textContent = p.text;
      var tag = week.querySelector('[data-this-week-tag]');
      tag.textContent = p.hashtag ? '#' + p.hashtag : '';
      tag.hidden = !p.hashtag;
      week.querySelector('[data-this-week-link]').href = '/app.html#/contribute?prompt=' + i;
    });
  }

  // ---------- published contributions ----------
  var feeds = document.querySelectorAll('[data-community-feed]');
  var directories = document.querySelectorAll('[data-listings]');
  if ((!feeds.length && !directories.length) || !window.fetch) return;
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
          location.href = '/app.html#/echo?c=' + b.dataset.contribution + '&back=' + encodeURIComponent(location.pathname);
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

  function card(c, places, onPlacePage) {
    var n = el('article', 'carry-card carry-card--shared');
    n.appendChild(el('p', 'eyebrow', c.kind));
    n.appendChild(el('h3', null, c.title));
    if (onPlacePage) String(c.body).split(/\n{2,}/).forEach(function (para) { n.appendChild(el('p', null, para)); });
    else n.appendChild(el('p', null, short(c.body, 220)));
    var credit = el('p', 'carry-card__credit', 'Shared by ' + c.credit);
    if (!onPlacePage) {
      credit.appendChild(document.createTextNode(' · '));
      credit.appendChild(where(c, places));
    }
    n.appendChild(credit);
    n.appendChild(echoButton(c));
    return n;
  }
  function word(c, places) {
    var n = el('article', 'word-chip');
    n.appendChild(el('p', 'word-chip__word', c.title));
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
    var q = 'select=id,kind,title,body,credit,place_slug,suggested_place&status=eq.published';
    if (box.dataset.place) q += '&place_slug=eq.' + encodeURIComponent(box.dataset.place) + '&order=created_at';
    else q += '&order=created_at.desc';
    if (box.dataset.kind) q += '&kind=eq.' + encodeURIComponent(box.dataset.kind);
    q += '&limit=' + (Number(box.dataset.limit) || 6);
    Promise.all([getJson(box.dataset.url + '/rest/v1/place_contributions?' + q, headersFor(box)), placesReady]).then(function (r) {
      var rows = r[0];
      var places = r[1];
      if (!rows || !rows.length) return;
      var words = box.classList.contains('community-feed--words');
      var grid = box.querySelector('.carry-grid, .word-wall');
      if (!grid) {
        box.textContent = '';
        grid = el('div', words ? 'word-wall' : 'carry-grid');
        box.appendChild(grid);
      }
      rows.forEach(function (c) { grid.appendChild(words ? word(c, places) : card(c, places, Boolean(box.dataset.place))); });
      wireEchoes(box);
    });
  });

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
