// Place pages: adds what families have shared and a moderator has published since the page was
// built, read straight from the database with the public key. Pending contributions are never
// visible here; the database only returns published ones to visitors.
(function () {
  var box = document.querySelector('[data-shared-by-families]');
  if (!box || !box.dataset.url || !window.fetch) return;
  var url = box.dataset.url + '/rest/v1/place_contributions?select=id,kind,title,body,credit&status=eq.published' +
    '&place_slug=eq.' + encodeURIComponent(box.dataset.place) + '&order=created_at';
  var headers = { apikey: box.dataset.key };
  if (/^eyJ/.test(box.dataset.key)) headers.authorization = 'Bearer ' + box.dataset.key;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  fetch(url, { headers: headers }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
    if (!rows.length) return;
    var grid = box.querySelector('.carry-grid');
    if (!grid) {
      box.textContent = '';
      grid = el('div', 'carry-grid');
      box.appendChild(grid);
    }
    rows.forEach(function (c) {
      var card = el('article', 'carry-card carry-card--shared');
      card.appendChild(el('p', 'eyebrow', c.kind));
      card.appendChild(el('h3', null, c.title));
      String(c.body).split(/\n{2,}/).forEach(function (para) { card.appendChild(el('p', null, para)); });
      card.appendChild(el('p', 'carry-card__credit', 'Shared by ' + c.credit));
      grid.appendChild(card);
    });
  }).catch(function () {});
})();
