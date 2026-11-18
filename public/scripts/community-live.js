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
  if (!feeds.length || !window.fetch) return;
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
    return n;
  }

  Array.prototype.forEach.call(feeds, function (box) {
    if (!box.dataset.url) return;
    var q = 'select=id,kind,title,body,credit,place_slug,suggested_place&status=eq.published';
    if (box.dataset.place) q += '&place_slug=eq.' + encodeURIComponent(box.dataset.place) + '&order=created_at';
    else q += '&order=created_at.desc';
    if (box.dataset.kind) q += '&kind=eq.' + encodeURIComponent(box.dataset.kind);
    q += '&limit=' + (Number(box.dataset.limit) || 6);
    var headers = { apikey: box.dataset.key };
    if (/^eyJ/.test(box.dataset.key)) headers.authorization = 'Bearer ' + box.dataset.key;
    Promise.all([getJson(box.dataset.url + '/rest/v1/place_contributions?' + q, headers), placesReady]).then(function (r) {
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
    });
  });
})();
