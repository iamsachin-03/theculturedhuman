// "Trace your roots": draws a family's places as roots growing down from a tree, deepest = oldest.
// renderRoots() is pure so tools/roots-example.mjs can reuse it; the page UI runs only where
// [data-trace] exists. Nothing typed here leaves the browser.
(function (root) {
  var W = 1080;
  var H = 1350;
  var SERIF = 'Georgia, \'Times New Roman\', serif';
  var SANS = 'Helvetica, Arial, sans-serif';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function wrap(text, maxChars, maxLines) {
    var words = String(text).trim().split(/\s+/).filter(Boolean);
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (next.length > maxChars && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var keep = lines[maxLines - 1];
      lines[maxLines - 1] = (keep.length < maxChars ? keep : keep.replace(/\s*\S*$/, '')) + '…';
    }
    return lines.map(function (l) { return l.length > maxChars + 4 ? l.slice(0, maxChars) + '…' : l; });
  }

  function text(x, y, lines, attrs, lineHeight) {
    return '<text x="' + x + '" y="' + y + '" ' + attrs + '>' + lines.map(function (l, i) {
      return '<tspan x="' + x + '" dy="' + (i === 0 ? 0 : lineHeight) + '">' + esc(l) + '</tspan>';
    }).join('') + '</text>';
  }

  /**
   * @param {{ name?: string, generations: { label: string, place: string, years?: string, detail?: string }[] }} data
   *   generations ordered from the youngest (top) to the oldest (bottom); entries without a place are skipped
   * @param {{ page: string, surface: string, primary: string, accent: string, accentInk: string, gold: string, ink: string, muted: string, line: string }} c
   */
  function renderRoots(data, c) {
    var gens = (data.generations || []).filter(function (g) { return g.place && g.place.trim(); }).slice(0, 6);
    var name = (data.name || '').trim();
    var title = name ? 'The roots of ' + name : 'Where I come from';
    var titleLines = wrap(title, 30, 2);
    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">');
    out.push('<rect width="' + W + '" height="' + H + '" fill="' + c.page + '"/>');
    out.push('<rect x="36" y="36" width="' + (W - 72) + '" height="' + (H - 72) + '" rx="28" fill="none" stroke="' + c.line + '" stroke-width="3"/>');
    out.push(text(W / 2, 112, ['THE CULTURED HUMAN'], 'text-anchor="middle" font-family="' + SANS + '" font-size="22" font-weight="700" letter-spacing="6" fill="' + c.accentInk + '"', 0));
    out.push(text(W / 2, titleLines.length > 1 ? 168 : 186, titleLines, 'text-anchor="middle" font-family="' + SERIF + '" font-size="58" fill="' + c.primary + '"', 64));

    var groundY = titleLines.length > 1 ? 352 : 330;
    var cx = W / 2;
    // The tree: you, above ground.
    out.push('<g>');
    out.push('<path d="M' + (cx - 7) + ' ' + groundY + ' L' + (cx - 5) + ' ' + (groundY - 52) + ' L' + (cx + 5) + ' ' + (groundY - 52) + ' L' + (cx + 7) + ' ' + groundY + ' Z" fill="' + c.primary + '"/>');
    [[-30, -70, 30], [28, -72, 30], [0, -98, 34], [-12, -62, 24], [16, -60, 22]].forEach(function (b) {
      out.push('<circle cx="' + (cx + b[0]) + '" cy="' + (groundY + b[1]) + '" r="' + b[2] + '" fill="' + c.primary + '" fill-opacity="' + (b[2] > 28 ? '0.92' : '0.75') + '"/>');
    });
    out.push('<circle cx="' + (cx + 34) + '" cy="' + (groundY - 128) + '" r="16" fill="' + c.gold + '" fill-opacity="0.85"/>');
    out.push('</g>');
    out.push('<line x1="110" y1="' + groundY + '" x2="' + (W - 110) + '" y2="' + groundY + '" stroke="' + c.gold + '" stroke-width="5" stroke-linecap="round"/>');

    if (!gens.length) {
      out.push(text(cx, groundY + 260, ['Add a place to begin.'], 'text-anchor="middle" font-family="' + SERIF + '" font-style="italic" font-size="40" fill="' + c.muted + '"', 0));
    } else {
      var top = groundY + 130;
      var bottom = gens.length > 4 ? H - 230 : H - 300;
      var step = gens.length > 1 ? Math.min(300, (bottom - top) / (gens.length - 1)) : 0;
      // Few generations sit a little lower, so the portrait doesn't look unfinished.
      var offset = Math.max(0, bottom - top - (gens.length - 1) * step) / 3;
      var crowded = step < 190;
      var pts = gens.map(function (g, i) {
        return { x: cx + (i % 2 === 0 ? -34 : 34), y: top + offset + i * step, side: i % 2 === 0 ? 1 : -1 };
      });
      // Main root and fine side roots.
      var d = 'M' + cx + ' ' + groundY;
      var prev = { x: cx, y: groundY };
      pts.forEach(function (p) {
        var my = (prev.y + p.y) / 2;
        d += ' C' + prev.x + ' ' + my + ' ' + p.x + ' ' + my + ' ' + p.x + ' ' + p.y;
        prev = p;
      });
      var last = pts[pts.length - 1];
      d += ' C' + last.x + ' ' + (last.y + 40) + ' ' + (cx + 10) + ' ' + (last.y + 60) + ' ' + (cx - 4) + ' ' + (last.y + 90);
      out.push('<path d="' + d + '" fill="none" stroke="' + c.accent + '" stroke-width="9" stroke-linecap="round"/>');
      pts.forEach(function (p, i) {
        var dir = -p.side;
        var len = (120 - Math.min(i, 4) * 10) * (crowded ? 0.45 : 1);
        out.push('<path d="M' + p.x + ' ' + (p.y - 30) + ' q' + (dir * len * 0.4) + ' 22 ' + (dir * len) + ' 60" fill="none" stroke="' + c.accent + '" stroke-width="3" stroke-opacity="0.55" stroke-linecap="round"/>');
        out.push('<path d="M' + p.x + ' ' + (p.y + 24) + ' q' + (dir * len * 0.3) + ' 18 ' + (dir * len * 0.6) + ' 54" fill="none" stroke="' + c.accent + '" stroke-width="2" stroke-opacity="0.4" stroke-linecap="round"/>');
      });
      pts.forEach(function (p, i) {
        var g = gens[i];
        out.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="17" fill="' + c.page + '" stroke="' + c.accent + '" stroke-width="6"/>');
        out.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="6" fill="' + c.gold + '"/>');
        var right = p.side === 1;
        var tx = right ? p.x + 58 : p.x - 58;
        var anchor = right ? 'start' : 'end';
        var label = (g.label || '').toUpperCase() + (g.years && g.years.trim() ? ' · ' + g.years.trim() : '');
        var place = wrap(g.place, crowded ? 20 : 17, crowded ? 1 : 2);
        var detail = g.detail && g.detail.trim() ? wrap(g.detail, crowded ? 34 : 27, crowded ? 1 : 2) : [];
        var y = p.y - (place.length > 1 ? 34 : 14);
        out.push(text(tx, y - 34, wrap(label, 30, 1), 'text-anchor="' + anchor + '" font-family="' + SANS + '" font-size="20" font-weight="700" letter-spacing="3" fill="' + c.accentInk + '"', 0));
        out.push(text(tx, y + 12, place, 'text-anchor="' + anchor + '" font-family="' + SERIF + '" font-size="44" fill="' + c.primary + '"', 46));
        if (detail.length) {
          out.push(text(tx, y + 12 + place.length * 46, detail, 'text-anchor="' + anchor + '" font-family="' + SERIF + '" font-style="italic" font-size="27" fill="' + c.muted + '"', 32));
        }
      });
    }
    out.push(text(cx, H - 82, ['Everyone comes from somewhere · @theculturedhuman'], 'text-anchor="middle" font-family="' + SANS + '" font-size="21" letter-spacing="1" fill="' + c.muted + '"', 0));
    out.push('</svg>');
    return out.join('');
  }

  function describe(data) {
    var gens = (data.generations || []).filter(function (g) { return g.place && g.place.trim(); });
    if (!gens.length) return 'An empty roots portrait. Add a place to begin.';
    return (data.name ? 'The roots of ' + data.name + ': ' : 'Where I come from: ') + gens.map(function (g) {
      return g.label + ', ' + g.place + (g.years ? ' (' + g.years + ')' : '') + (g.detail ? ', ' + g.detail : '');
    }).join('; ') + '.';
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderRoots: renderRoots, describe: describe };
    return;
  }

  var form = document.querySelector('[data-trace]');
  if (!form) return;
  var preview = document.querySelector('[data-trace-preview]');
  var list = form.querySelector('[data-generations]');
  var addBtn = form.querySelector('[data-add-generation]');
  var STORAGE = 'tch-roots';
  var MAX = 6;
  var DEFAULTS = ['Me', 'My parents', 'My grandparents', 'My great-grandparents'];
  var counter = 0;

  function palette() {
    var s = getComputedStyle(document.documentElement);
    function v(n) { return s.getPropertyValue(n).trim(); }
    return { page: v('--page'), surface: v('--surface'), primary: v('--primary'), accent: v('--accent'), accentInk: v('--accent-ink'), gold: v('--accent-2'), ink: v('--ink'), muted: v('--muted'), line: v('--line') };
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
      rm.addEventListener('click', function () { fs.remove(); update(); addBtn.focus(); });
      fs.appendChild(rm);
    }
    return fs;
  }

  function read() {
    return {
      name: form.querySelector('[name="family"]').value,
      generations: Array.prototype.map.call(list.querySelectorAll('.trace-gen'), function (fs) {
        return { label: fs.dataset.label, place: fs.querySelector('[data-k="place"]').value, years: fs.querySelector('[data-k="years"]').value, detail: fs.querySelector('[data-k="detail"]').value };
      }),
    };
  }

  function update() {
    var data = read();
    preview.innerHTML = renderRoots(data, palette());
    preview.setAttribute('aria-label', describe(data));
    addBtn.hidden = list.children.length >= MAX;
    try { localStorage.setItem(STORAGE, JSON.stringify(data)); } catch (e) {}
  }

  function load(data) {
    list.innerHTML = '';
    form.querySelector('[name="family"]').value = data.name || '';
    var gens = data.generations && data.generations.length ? data.generations : DEFAULTS.map(function (l) { return { label: l }; });
    gens.forEach(function (g, i) { list.appendChild(generationRow(g, i >= DEFAULTS.length)); });
    update();
  }

  addBtn.addEventListener('click', function () {
    var row = generationRow({ label: 'Earlier ancestors' }, true);
    list.appendChild(row);
    update();
    row.querySelector('input').focus();
  });
  form.addEventListener('input', update);

  form.querySelector('[data-clear]').addEventListener('click', function () {
    try { localStorage.removeItem(STORAGE); } catch (e) {}
    load({});
    form.querySelector('[name="family"]').focus();
  });

  form.querySelector('[data-download]').addEventListener('click', function () {
    var btn = this;
    var svg = renderRoots(read(), palette());
    var img = new Image();
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(function (blob) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'my-roots.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        btn.textContent = 'Downloaded';
        setTimeout(function () { btn.textContent = 'Download image'; }, 2500);
      }, 'image/png');
    };
    img.src = url;
  });

  window.addEventListener('storage', function (e) { if (e.key === 'tch-theme') update(); });
  new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; } catch (e) {}
  load(saved);
})(this);
