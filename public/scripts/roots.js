// "Trace your roots": the form, the style picker and the live portrait. The artwork itself is drawn
// by scripts/roots-art.js. The page UI runs only where [data-trace] exists. Nothing typed here
// leaves the browser.
(function (root) {
  var isNode = typeof module !== 'undefined' && module.exports;
  var Art = isNode ? require('./roots-art.js') : root.TCHRootsArt;

  function has(g) { return g && g.place && g.place.trim(); }

  function describe(data) {
    var gens = Art.places(data);
    if (!gens.length) return 'An empty roots portrait. Add a place to begin.';
    return (data.name ? 'The roots of ' + data.name + ': ' : 'Where I come from: ') + gens.map(function (g) {
      return g.label + ', ' + g.place + (g.years ? ' (' + g.years + ')' : '') + (g.detail ? ', ' + g.detail : '');
    }).join('; ') + '.';
  }

  // Whole-word match, so "Patna" never matches a place aliased "patan".
  function matchPlaces(names, places) {
    var found = [];
    names.forEach(function (name) {
      var typed = ' ' + String(name || '').toLowerCase().replace(/[^a-z\u00c0-\u024f]+/g, ' ') + ' ';
      places.forEach(function (p) {
        if (found.indexOf(p) === -1 && p.aliases.some(function (a) { return typed.indexOf(' ' + a + ' ') !== -1; })) found.push(p);
      });
    });
    return found;
  }

  var PROGRESS = [
    'Add the first place to see your portrait grow.',
    'One place. Every family story starts somewhere.',
    'Two generations. Who came before them?',
    'Three generations: about seventy-five years of your family.',
    'Four generations: about a century. Few people can name this far back.',
    'Five generations deep. That is a rare thing to know.',
    'Six generations. Your roots run further than most.',
  ];

  function progressText(count) { return PROGRESS[Math.min(count, PROGRESS.length - 1)]; }

  /** How many generations back the deepest filled-in place goes; gaps still count, and both sides are one generation each. */
  function deepest(list) {
    for (var i = list.length - 1; i >= 0; i--) if (has(list[i])) return i + 1;
    return 0;
  }

  function depth(data) {
    if (!data.sides) return deepest(data.generations || []);
    var back = Math.max(deepest(data.sides[0].generations), deepest(data.sides[1].generations));
    return back ? back + 1 : (has(data.me) ? 1 : 0);
  }

  if (isNode) {
    module.exports = { describe: describe, matchPlaces: matchPlaces, progressText: progressText, depth: depth };
    return;
  }

  var form = document.querySelector('[data-trace]');
  if (!form || !Art) return;
  var preview = document.querySelector('[data-trace-preview]');
  var progress = document.querySelector('[data-trace-progress]');
  var list = form.querySelector('[data-generations]');
  var addBtn = form.querySelector('[data-add-generation]');
  var lineBox = form.querySelector('[data-line]');
  var sidesBox = form.querySelector('[data-sides]');
  var meBox = form.querySelector('[data-me]');
  var sideBoxes = [form.querySelector('[data-side="0"]'), form.querySelector('[data-side="1"]')];
  var sideAdds = [form.querySelector('[data-add-side="0"]'), form.querySelector('[data-add-side="1"]')];
  var stylesBox = form.querySelector('[data-styles]');
  var palettesBox = form.querySelector('[data-palettes]');
  var formatsBox = form.querySelector('[data-formats]');
  var styleHint = form.querySelector('[data-style-hint]');
  var placeLinks = document.querySelector('[data-place-links]');
  var shareBtn = form.querySelector('[data-share]');
  var STORAGE = 'tch-roots';
  var DEFAULTS = ['Me', 'My parents', 'My grandparents', 'My great-grandparents'];
  var SIDE_DEFAULTS = [
    ['My mother', 'Mother\'s parents', 'Mother\'s grandparents'],
    ['My father', 'Father\'s parents', 'Father\'s grandparents'],
  ];
  var SIDE_EXTRA = ['Mother\'s great-grandparents', 'Father\'s great-grandparents'];
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var counter = 0;
  var places = [];
  var look = { style: 'roots', palette: 'site', format: 'post' };
  var anim = { kind: 'all', start: Date.now(), gen: '' };
  var filledBefore = null;
  var lookBefore = null;
  var thumbTimer = 0;

  function sitePalette() {
    var s = getComputedStyle(document.documentElement);
    function v(n) { return s.getPropertyValue(n).trim(); }
    return { page: v('--page'), surface: v('--surface'), primary: v('--primary'), accent: v('--accent'), accentInk: v('--accent-ink'), gold: v('--accent-2'), ink: v('--ink'), muted: v('--muted'), line: v('--line'), night: v('--footer'), nightInk: v('--footer-ink'), water: v('--primary-2') };
  }

  function colours(id) {
    var p = Art.paletteById(id || look.palette);
    return p.c || sitePalette();
  }

  function choice(name, value, labelHtml, cls) {
    var lab = document.createElement('label');
    lab.className = cls;
    var input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    lab.appendChild(input);
    lab.insertAdjacentHTML('beforeend', labelHtml);
    return lab;
  }

  function buildPicker() {
    Art.STYLES.forEach(function (s) {
      stylesBox.appendChild(choice('roots-style', s.id, '<span class="style-card__art" aria-hidden="true"></span><span class="style-card__name">' + s.name + '</span>', 'style-card'));
    });
    Art.PALETTES.forEach(function (p) {
      var lab = choice('roots-palette', p.id, '<span class="swatch" aria-hidden="true"></span><span class="visually-hidden">' + p.name + '</span>', 'swatch-choice');
      lab.title = p.name;
      palettesBox.appendChild(lab);
    });
    Object.keys(Art.FORMATS).forEach(function (k) {
      var fm = Art.FORMATS[k];
      formatsBox.appendChild(choice('roots-format', fm.id, '<span>' + fm.name + ' <span class="field__optional">' + fm.hint + '</span></span>', 'pill-choice'));
    });
    paintSwatches();
  }

  function paintSwatches() {
    Array.prototype.forEach.call(palettesBox.querySelectorAll('.swatch-choice'), function (lab) {
      var c = colours(lab.querySelector('input').value);
      lab.querySelector('.swatch').style.background = 'linear-gradient(135deg, ' + c.page + ' 0 34%, ' + c.primary + ' 34% 67%, ' + c.accent + ' 67%)';
    });
  }

  function setLook(next) {
    look.style = Art.styleById(next.style).id;
    look.palette = Art.paletteById(next.palette).id;
    look.format = Art.FORMATS[next.format] ? next.format : 'post';
    [['roots-style', look.style], ['roots-palette', look.palette], ['roots-format', look.format]].forEach(function (pair) {
      var input = form.querySelector('input[name="' + pair[0] + '"][value="' + pair[1] + '"]');
      if (input) input.checked = true;
    });
  }

  function readLook() {
    function val(name) { var el = form.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : undefined; }
    setLook({ style: val('roots-style'), palette: val('roots-palette'), format: val('roots-format') });
  }

  function generationRow(g, removable) {
    var n = counter++;
    var fs = document.createElement('fieldset');
    fs.className = 'trace-gen';
    fs.innerHTML =
      '<legend></legend>' +
      '<p class="field"><label for="tg-' + n + '-place">Where they lived</label><input id="tg-' + n + '-place" type="text" data-k="place" maxlength="40" autocomplete="off"></p>' +
      '<p class="field"><label for="tg-' + n + '-years">When <span class="field__optional">(optional)</span></label><input id="tg-' + n + '-years" type="text" data-k="years" maxlength="16" autocomplete="off"></p>' +
      '<p class="field field--wide"><label for="tg-' + n + '-detail">One detail <span class="field__optional">(optional)</span></label><input id="tg-' + n + '-detail" type="text" data-k="detail" maxlength="60" autocomplete="off"></p>';
    fs.querySelector('legend').textContent = g.label;
    fs.dataset.label = g.label;
    fs.dataset.row = String(n);
    ['place', 'years', 'detail'].forEach(function (k) { fs.querySelector('[data-k="' + k + '"]').value = g[k] || ''; });
    var placeholders = { 'Me': ['Bengaluru', 'now', 'learning to cook my mother\'s dal'], 'My parents': ['Patna', '1980s', 'met at a cousin\'s wedding'] };
    var ph = placeholders[g.label];
    if (ph) ['place', 'years', 'detail'].forEach(function (k, i) { fs.querySelector('[data-k="' + k + '"]').placeholder = 'e.g. ' + ph[i]; });
    if (removable) {
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'trace-gen__remove';
      rm.textContent = 'Remove';
      rm.setAttribute('aria-label', 'Remove ' + g.label);
      rm.addEventListener('click', function () {
        var adder = fs.parentNode.parentNode.querySelector('.trace__add');
        fs.remove();
        update();
        adder.focus();
      });
      fs.appendChild(rm);
    }
    return fs;
  }

  function rowsData(box) {
    return Array.prototype.map.call(box.querySelectorAll('.trace-gen'), function (fs) {
      return { row: fs.dataset.row, label: fs.dataset.label, place: fs.querySelector('[data-k="place"]').value, years: fs.querySelector('[data-k="years"]').value, detail: fs.querySelector('[data-k="detail"]').value };
    });
  }

  function mode() {
    var el = form.querySelector('input[name="roots-mode"]:checked');
    return el && el.value === 'sides' ? 'sides' : 'line';
  }

  function readSides() {
    return { me: rowsData(meBox)[0], sides: sideBoxes.map(function (b) { return { generations: rowsData(b) }; }) };
  }

  function read() {
    var name = form.querySelector('[name="family"]').value;
    if (mode() === 'sides') {
      var two = readSides();
      return { name: name, me: two.me, sides: two.sides };
    }
    return { name: name, generations: rowsData(list) };
  }

  /** The generations with a place, each with the key its group carries in the SVG (data-gen). */
  function filledKeys(data) {
    if (!data.sides) {
      return data.generations.filter(has).slice(0, Art.MAX_GENERATIONS).map(function (g, i) { return { row: g.row, key: String(i) }; });
    }
    var out = has(data.me) ? [{ row: data.me.row, key: 'me' }] : [];
    data.sides.forEach(function (side, col) {
      side.generations.filter(has).slice(0, Art.MAX_PER_SIDE).forEach(function (g, i) { out.push({ row: g.row, key: (col ? 'b' : 'a') + i }); });
    });
    return out;
  }

  function art(data, opts) {
    return Art.render(data, colours(opts.palette), opts);
  }

  // Decide what, if anything, should animate in this render: the whole portrait when the look
  // changes, or just the generation whose place was filled in.
  function planAnimation(data) {
    var filled = filledKeys(data);
    var rowsNow = filled.map(function (f) { return f.row; });
    var key = look.style + '|' + look.format + '|' + mode();
    if (lookBefore !== null && key !== lookBefore) anim = { kind: 'all', start: Date.now(), gen: '' };
    else if (filledBefore && rowsNow.length > filledBefore.length) {
      for (var i = 0; i < filled.length; i++) {
        if (filledBefore.indexOf(filled[i].row) === -1) { anim = { kind: 'gen', start: Date.now(), gen: filled[i].key }; break; }
      }
    }
    filledBefore = rowsNow;
    lookBefore = key;
  }

  function applyAnimation() {
    preview.classList.remove('is-drawing');
    if (reduceMotion) return;
    var elapsed = Date.now() - anim.start;
    preview.style.setProperty('--tch-t', -elapsed + 'ms');
    if (anim.kind === 'all' && elapsed < 1900) preview.classList.add('is-drawing');
    if (anim.kind === 'gen' && elapsed < 900) {
      var g = preview.querySelector('.tch-gen[data-gen="' + anim.gen + '"]');
      if (g) g.classList.add('is-new');
    }
  }

  function update() {
    readLook();
    var data = read();
    var count = depth(data);
    planAnimation(data);
    lineBox.hidden = mode() !== 'line';
    sidesBox.hidden = mode() !== 'sides';
    preview.dataset.format = look.format;
    preview.innerHTML = art(data, { style: look.style, palette: look.palette, format: look.format, idPrefix: 'tp' });
    applyAnimation();
    preview.setAttribute('aria-label', describe(data) + ' Drawn in the ' + Art.styleById(look.style).name + ' style.');
    if (progress) {
      var msg = progressText(count);
      if (progress.textContent !== msg) progress.textContent = msg;
      progress.classList.toggle('is-deep', count >= 4);
    }
    if (styleHint) styleHint.textContent = Art.styleById(look.style).hint;
    addBtn.hidden = list.children.length >= Art.MAX_GENERATIONS;
    sideBoxes.forEach(function (b, i) { sideAdds[i].hidden = b.children.length >= Art.MAX_PER_SIDE; });
    save(data.name);
    showPlaces(data);
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(function () { drawThumbs(data); }, 160);
  }

  function strip(g) { return { label: g.label, place: g.place, years: g.years, detail: g.detail }; }

  function save(name) {
    var two = readSides();
    var saved = {
      name: name, mode: mode(), generations: rowsData(list).map(strip),
      me: strip(two.me), sides: two.sides.map(function (s) { return s.generations.map(strip); }),
      style: look.style, palette: look.palette, format: look.format,
    };
    try { localStorage.setItem(STORAGE, JSON.stringify(saved)); } catch (e) {}
  }

  function drawThumbs(data) {
    Array.prototype.forEach.call(stylesBox.querySelectorAll('.style-card'), function (card) {
      var id = card.querySelector('input').value;
      card.querySelector('.style-card__art').innerHTML = art(data, { style: id, palette: look.palette, format: 'post', idPrefix: 'tt' + id });
    });
  }

  function showPlaces(data) {
    if (!placeLinks) return;
    var found = matchPlaces(Art.places(data).map(function (g) { return g.place; }), places);
    placeLinks.hidden = !found.length;
    var ul = placeLinks.querySelector('ul');
    ul.innerHTML = '';
    found.forEach(function (p) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = p.path;
      a.textContent = p.name;
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  function toPng(done) {
    var fm = Art.FORMATS[look.format];
    var svg = art(read(), { style: look.style, palette: look.palette, format: look.format, idPrefix: 'dl' });
    var img = new Image();
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = fm.w;
      canvas.height = fm.h;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(done, 'image/png');
    };
    img.src = url;
  }

  function fileName() { return 'my-roots-' + look.style + (look.format === 'story' ? '-story' : '') + '.png'; }

  function load(data) {
    list.innerHTML = '';
    meBox.innerHTML = '';
    form.querySelector('[name="family"]').value = data.name || '';
    var gens = data.generations && data.generations.length ? data.generations : DEFAULTS.map(function (l) { return { label: l }; });
    gens.forEach(function (g, i) { list.appendChild(generationRow(g, i >= DEFAULTS.length)); });
    var me = data.me || {};
    if (!has(me) && has(gens[0])) me = gens[0];
    meBox.appendChild(generationRow({ label: 'Me', place: me.place, years: me.years, detail: me.detail }, false));
    sideBoxes.forEach(function (box, col) {
      box.innerHTML = '';
      var saved = data.sides && data.sides[col] && data.sides[col].length ? data.sides[col] : SIDE_DEFAULTS[col].map(function (l) { return { label: l }; });
      saved.forEach(function (g, i) { box.appendChild(generationRow(g, i >= SIDE_DEFAULTS[col].length)); });
    });
    form.querySelector('input[name="roots-mode"][value="' + (data.mode === 'sides' ? 'sides' : 'line') + '"]').checked = true;
    setLook({ style: data.style, palette: data.palette, format: data.format });
    filledBefore = null;
    lookBefore = null;
    anim = { kind: 'all', start: Date.now(), gen: '' };
    update();
  }

  buildPicker();

  addBtn.addEventListener('click', function () {
    var row = generationRow({ label: 'Earlier ancestors' }, true);
    list.appendChild(row);
    update();
    row.querySelector('input').focus();
  });
  sideAdds.forEach(function (btn, col) {
    btn.addEventListener('click', function () {
      var row = generationRow({ label: SIDE_EXTRA[col] }, true);
      sideBoxes[col].appendChild(row);
      update();
      row.querySelector('input').focus();
    });
  });
  form.addEventListener('input', update);

  form.querySelector('[data-clear]').addEventListener('click', function () {
    try { localStorage.removeItem(STORAGE); } catch (e) {}
    load({});
    form.querySelector('[name="family"]').focus();
  });

  form.querySelector('[data-download]').addEventListener('click', function () {
    var btn = this;
    toPng(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      btn.textContent = 'Downloaded';
      setTimeout(function () { btn.textContent = 'Download image'; }, 2500);
    });
  });

  // Sharing a file is only offered where the browser supports it (mostly phones).
  if (shareBtn && navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })) {
    shareBtn.hidden = false;
    shareBtn.addEventListener('click', function () {
      toPng(function (blob) {
        navigator.share({
          files: [new File([blob], fileName(), { type: 'image/png' })],
          text: 'Where I come from. Trace yours at ' + location.origin + '/trace.html #theculturedhuman',
        }).catch(function () {});
      });
    });
  }

  function themeChanged() { paintSwatches(); if (look.palette === 'site') { update(); } }
  window.addEventListener('storage', function (e) { if (e.key === 'tch-theme') themeChanged(); });
  new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch (e) {}
  load(saved);

  if (placeLinks && window.fetch) {
    fetch('/places/places.json').then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      places = list;
      showPlaces(read());
    }).catch(function () {});
  }
})(this);
