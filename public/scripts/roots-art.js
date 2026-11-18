// "Trace your roots" artwork: one family's places drawn in the style the reader picks.
// Pure string rendering, shared by the page (scripts/roots.js), tools/roots-example.mjs and the tests.
// System fonts only, because the PNG download rasterises the SVG without the page's web fonts.
(function (root) {
  var SERIF = 'Georgia, \'Times New Roman\', serif';
  var SANS = 'Helvetica, Arial, sans-serif';
  var MAX_GENERATIONS = 6;

  var FORMATS = {
    post: { id: 'post', name: 'Post', hint: '4:5', w: 1080, h: 1350 },
    story: { id: 'story', name: 'Story', hint: '9:16', w: 1080, h: 1920 },
  };

  var STYLES = [
    { id: 'roots', name: 'Roots', hint: 'Roots that grow deeper with every generation, under a tree that fills out as you go.' },
    { id: 'tree', name: 'Tree', hint: 'Your family as a tree: the oldest generation at its base, you at the crown.' },
    { id: 'river', name: 'River', hint: 'A river that starts at the oldest place you know and widens as it runs down to you.' },
    { id: 'rings', name: 'Rings', hint: 'Like the rings of a tree trunk: you at the centre, each generation a ring around you.' },
    { id: 'stars', name: 'Stars', hint: 'A night sky, with your family\'s places joined into one constellation.' },
  ];

  // 'site' follows the page's current theme; the rest are fixed so a portrait looks the same anywhere.
  var PALETTES = [
    { id: 'site', name: 'Site colours' },
    { id: 'haldi', name: 'Haldi', c: { page: '#FFF5D9', surface: '#FFFBEC', primary: '#1E4A27', accent: '#DC4F0E', accentInk: '#A83A07', gold: '#F5B323', ink: '#1C2B1C', muted: '#5A5536', line: '#EDD596', night: '#14281A', nightInk: '#FFF1CF', water: '#5E9EA0' } },
    { id: 'indigo', name: 'Indigo', c: { page: '#F4F0F8', surface: '#FCF9FF', primary: '#42406F', accent: '#AD5C75', accentInk: '#94455E', gold: '#D6A65B', ink: '#2E2839', muted: '#6A6178', line: '#DCD2E8', night: '#1F1D3A', nightInk: '#F3EEFB', water: '#7C8CC4' } },
    { id: 'gulmohar', name: 'Gulmohar', c: { page: '#FFF1E9', surface: '#FFF9F4', primary: '#A34438', accent: '#D17B2E', accentInk: '#944E10', gold: '#E6AD58', ink: '#3B2927', muted: '#765C55', line: '#EFD0C1', night: '#4E2B28', nightInk: '#FFF0E6', water: '#7FA9B0' } },
    { id: 'monsoon', name: 'Monsoon', c: { page: '#EEF4F1', surface: '#F8FBF9', primary: '#1F4E5A', accent: '#3E8E7E', accentInk: '#2A6E60', gold: '#D9B44A', ink: '#1B2E33', muted: '#4F6468', line: '#CFE0DA', night: '#0F2A33', nightInk: '#E8F3EF', water: '#5B9BB0' } },
    { id: 'kantha', name: 'Kantha', c: { page: '#FAF6EF', surface: '#FFFDF8', primary: '#7A1F1F', accent: '#C0392B', accentInk: '#9E2B20', gold: '#D4A24C', ink: '#2B1D1A', muted: '#6B5A52', line: '#E8DCCB', night: '#2A1414', nightInk: '#FBEFE4', water: '#8BA7B5' } },
  ];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function f(n) { return Math.round(n * 10) / 10; }

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
    return '<text x="' + f(x) + '" y="' + f(y) + '" ' + attrs + '>' + lines.map(function (l, i) {
      return '<tspan x="' + f(x) + '" dy="' + (i === 0 ? 0 : lineHeight) + '">' + esc(l) + '</tspan>';
    }).join('') + '</text>';
  }

  // Deterministic, so the artwork doesn't reshuffle on every keystroke.
  function seeded(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function halo(colour, width) {
    return colour ? ' stroke="' + colour + '" stroke-width="' + (width || 8) + '" stroke-linejoin="round" paint-order="stroke"' : '';
  }

  /** A generation's label: small caps "MY PARENTS · 1980s", the place large, one detail in italics. */
  function label(x, y, anchor, g, o) {
    var width = Math.max(180, o.width);
    var kick = (g.label || '').toUpperCase() + (g.years && g.years.trim() ? ' · ' + g.years.trim() : '');
    var kickSize = Math.max(16, Math.min(20, (width / Math.max(kick.length, 1) - 2.5) / 0.66));
    var max = Math.max(9, Math.floor(width / 21));
    var place = wrap(g.place, o.crowded ? max + 2 : max, o.crowded ? 1 : 2);
    var detailMax = Math.floor(width / 12.5);
    var detail = g.detail && g.detail.trim() && !o.tight ? wrap(g.detail, detailMax, o.crowded ? 1 : 2) : [];
    var top = y - (place.length > 1 ? 34 : 14);
    var h = halo(o.halo);
    var a = 'text-anchor="' + anchor + '" ';
    var s = text(x, top - 34, wrap(kick, 40, 1), a + 'font-family="' + SANS + '" font-size="' + f(kickSize) + '" font-weight="700" letter-spacing="' + (kickSize > 17 ? 3 : 1.5) + '" fill="' + o.kicker + '"' + h, 0);
    s += text(x, top + 12, place, a + 'font-family="' + SERIF + '" font-size="44" fill="' + o.place + '"' + h, 46);
    if (detail.length) {
      s += text(x, top + 12 + place.length * 46, detail, a + 'font-family="' + SERIF + '" font-style="italic" font-size="27" fill="' + o.muted + '"' + (o.mutedOpacity ? ' fill-opacity="' + o.mutedOpacity + '"' : '') + h, 32);
    }
    return s;
  }

  function sideLabel(ctx, x, y, side, g, layout, colours) {
    var width = side === 1 ? ctx.W - 78 - x : x - 78;
    return label(x, y, side === 1 ? 'start' : 'end', g, {
      crowded: layout.crowded, tight: layout.tight, width: width, halo: colours.halo,
      place: colours.place, kicker: colours.kicker, muted: colours.muted, mutedOpacity: colours.mutedOpacity,
    });
  }

  /** Evenly spaced rows between top and bottom; a short family sits a little lower so it doesn't look unfinished. */
  function rows(n, top, bottom, maxStep) {
    var step = n > 1 ? Math.min(maxStep, (bottom - top) / (n - 1)) : 0;
    var offset = n > 1 ? Math.max(0, bottom - top - (n - 1) * step) / 3 : (bottom - top) / 3;
    var ys = [];
    for (var i = 0; i < n; i++) ys.push(top + offset + i * step);
    return { ys: ys, step: step, crowded: n > 1 && step < 190, tight: n > 1 && step < 135 };
  }

  function genOpen(i) { return '<g class="tch-gen" data-gen="' + i + '" style="--i:' + i + '">'; }

  function leaf(x, y, rx, ry, angle, fill, opacity) {
    return '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" transform="rotate(' + f(angle) + ' ' + f(x) + ' ' + f(y) + ')" fill="' + fill + '" fill-opacity="' + f(opacity * 100) / 100 + '"/>';
  }

  function grass(ctx, y, x0, x1, count, colour) {
    var R = seeded('grass');
    var s = '';
    for (var i = 0; i < count; i++) {
      var x = x0 + R() * (x1 - x0);
      var hgt = 8 + R() * 10;
      s += '<path d="M' + f(x - 6) + ' ' + f(y) + ' q4 -' + f(hgt * 0.6) + ' 5 -' + f(hgt) + ' M' + f(x) + ' ' + f(y) + ' q1 -' + f(hgt) + ' 4 -' + f(hgt * 1.2) + '" fill="none" stroke="' + colour + '" stroke-width="2.5" stroke-linecap="round" stroke-opacity="0.6"/>';
    }
    return s;
  }

  /** A full little tree: trunk, leafy crown and one blossom for every generation traced. */
  function canopy(ctx, x, baseY, s, blossoms) {
    var c = ctx.c;
    var R = seeded('canopy');
    var trunkH = 78 * s;
    var cy = baseY - trunkH - 30 * s;
    var rad = 58 * s;
    var out = '';
    out += '<path d="M' + f(x - 11 * s) + ' ' + f(baseY) + ' C' + f(x - 6 * s) + ' ' + f(baseY - trunkH * 0.5) + ' ' + f(x - 5 * s) + ' ' + f(baseY - trunkH * 0.8) + ' ' + f(x - 3 * s) + ' ' + f(cy + 10 * s) +
      ' L' + f(x + 3 * s) + ' ' + f(cy + 10 * s) + ' C' + f(x + 5 * s) + ' ' + f(baseY - trunkH * 0.8) + ' ' + f(x + 6 * s) + ' ' + f(baseY - trunkH * 0.5) + ' ' + f(x + 11 * s) + ' ' + f(baseY) + ' Z" fill="' + c.primary + '"/>';
    out += '<path d="M' + f(x) + ' ' + f(baseY - trunkH * 0.65) + ' Q' + f(x - 18 * s) + ' ' + f(cy + 30 * s) + ' ' + f(x - 34 * s) + ' ' + f(cy + 14 * s) + ' M' + f(x) + ' ' + f(baseY - trunkH * 0.75) + ' Q' + f(x + 16 * s) + ' ' + f(cy + 28 * s) + ' ' + f(x + 32 * s) + ' ' + f(cy + 8 * s) + '" fill="none" stroke="' + c.primary + '" stroke-width="' + f(4 * s) + '" stroke-linecap="round"/>';
    [[-30, 8, 42], [32, 4, 40], [0, -26, 46]].forEach(function (b) {
      out += '<circle cx="' + f(x + b[0] * s) + '" cy="' + f(cy + b[1] * s) + '" r="' + f(b[2] * s) + '" fill="' + c.primary + '" fill-opacity="0.16"/>';
    });
    for (var i = 0; i < 52; i++) {
      var a = R() * Math.PI * 2;
      var d = Math.sqrt(R()) * rad;
      out += leaf(x + Math.cos(a) * d * 1.18, cy + Math.sin(a) * d * 0.9, 13 * s, 5.8 * s, R() * 180, c.primary, 0.55 + R() * 0.45);
    }
    for (var k = 0; k < blossoms; k++) {
      var ba = R() * Math.PI * 2;
      var bd = (0.35 + R() * 0.6) * rad;
      var bx = x + Math.cos(ba) * bd * 1.1;
      var by = cy + Math.sin(ba) * bd * 0.85;
      out += '<g class="tch-gen" style="--i:' + k + '"><circle cx="' + f(bx) + '" cy="' + f(by) + '" r="' + f(6.5 * s) + '" fill="' + c.gold + '"/><circle cx="' + f(bx) + '" cy="' + f(by) + '" r="' + f(2.4 * s) + '" fill="' + c.accent + '"/></g>';
    }
    return out;
  }

  // ---------- Roots: the tree above ground, the family below it, deepest = oldest ----------
  function drawRoots(ctx, gens) {
    var c = ctx.c, W = ctx.W, out = ctx.out, R = ctx.rand, cx = W / 2, n = gens.length;
    var s = 0.85 + n * 0.06;
    var groundY = ctx.top + Math.round(140 * s);
    out.push('<defs><linearGradient id="' + ctx.id + 'soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c.accent + '" stop-opacity="0.16"/><stop offset="1" stop-color="' + c.accent + '" stop-opacity="0"/></linearGradient></defs>');
    out.push('<rect x="39" y="' + groundY + '" width="' + (W - 78) + '" height="' + f(ctx.bottom - groundY) + '" fill="url(#' + ctx.id + 'soil)"/>');
    for (var i = 0; i < 70; i++) {
      var sx = 60 + R() * (W - 120);
      var sy = groundY + 12 + Math.pow(R(), 1.6) * (ctx.bottom - groundY - 20);
      out.push('<circle cx="' + f(sx) + '" cy="' + f(sy) + '" r="' + f(1 + R() * 2.4) + '" fill="' + c.accent + '" fill-opacity="' + f((0.1 + R() * 0.2) * 100) / 100 + '"/>');
    }
    out.push(canopy(ctx, cx, groundY, s, n));
    out.push('<line x1="80" y1="' + groundY + '" x2="' + (W - 80) + '" y2="' + groundY + '" stroke="' + c.gold + '" stroke-width="5" stroke-linecap="round"/>');
    out.push(grass(ctx, groundY - 1, 110, W - 110, 16, c.primary));
    if (!n) return groundY + 260;

    var layout = rows(n, groundY + 130, ctx.bottom - (n > 4 ? 40 : 110), 300);
    var pts = gens.map(function (g, i) {
      return { x: cx + (i % 2 === 0 ? -34 : 34) + (R() - 0.5) * 14, y: layout.ys[i], side: i % 2 === 0 ? 1 : -1 };
    });

    function rootlet(x, y, dir, len, w, depth) {
      var ex = x + dir * len;
      var ey = y + len * (0.45 + R() * 0.3);
      var mx = x + dir * len * (0.3 + R() * 0.2);
      out.push('<path d="M' + f(x) + ' ' + f(y) + ' Q' + f(mx) + ' ' + f(y + len * 0.05) + ' ' + f(ex) + ' ' + f(ey) + '" fill="none" stroke="' + c.accent + '" stroke-width="' + f(w) + '" stroke-opacity="' + f((0.28 + depth * 0.12) * 100) / 100 + '" stroke-linecap="round"/>');
      if (depth > 0) {
        rootlet(ex, ey, dir, len * 0.55, w * 0.65, depth - 1);
        rootlet(x + (ex - x) * 0.55, y + (ey - y) * 0.45, dir, len * 0.42, w * 0.6, depth - 1);
      }
    }
    pts.forEach(function (p, i) {
      var len = (130 - Math.min(i, 4) * 10) * (layout.crowded ? 0.5 : 1);
      rootlet(p.x, p.y - 26, -p.side, len, 3.6, 2);
      rootlet(p.x, p.y + 22, -p.side, len * 0.7, 2.6, 1);
    });

    var prev = { x: cx, y: groundY };
    pts.forEach(function (p, i) {
      var my = (prev.y + p.y) / 2;
      out.push('<path class="tch-draw" pathLength="1" style="--d:' + i + '" d="M' + f(prev.x) + ' ' + f(prev.y) + ' C' + f(prev.x) + ' ' + f(my) + ' ' + f(p.x) + ' ' + f(my) + ' ' + f(p.x) + ' ' + f(p.y) + '" fill="none" stroke="' + c.accent + '" stroke-width="' + f(Math.max(4, 13 - i * 1.6)) + '" stroke-linecap="round"/>');
      prev = p;
    });
    var last = pts[pts.length - 1];
    out.push('<path class="tch-draw" pathLength="1" style="--d:' + n + '" d="M' + f(last.x) + ' ' + f(last.y) + ' C' + f(last.x) + ' ' + f(last.y + 40) + ' ' + f(cx + 10) + ' ' + f(last.y + 60) + ' ' + f(cx - 4) + ' ' + f(last.y + 90) + '" fill="none" stroke="' + c.accent + '" stroke-width="3" stroke-linecap="round"/>');

    pts.forEach(function (p, i) {
      var oldest = i === n - 1 && n > 1;
      out.push(genOpen(i));
      out.push('<circle cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="' + (oldest ? 36 : 28) + '" fill="' + c.gold + '" fill-opacity="0.22"/>');
      if (oldest) out.push('<circle cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="27" fill="none" stroke="' + c.accent + '" stroke-width="2" stroke-dasharray="4 5"/>');
      out.push('<circle cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="17" fill="' + c.page + '" stroke="' + c.accent + '" stroke-width="6"/>');
      out.push('<circle cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="6" fill="' + c.gold + '"/>');
      out.push(sideLabel(ctx, p.x + p.side * 58, p.y, p.side, gens[i], layout, { place: c.primary, kicker: c.accentInk, muted: c.muted, halo: c.page }));
      out.push('</g>');
    });
  }

  // ---------- Tree: the oldest at the base of the trunk, you at the crown ----------
  function drawTree(ctx, gens) {
    var c = ctx.c, W = ctx.W, out = ctx.out, cx = W / 2, n = gens.length;
    var groundY = ctx.bottom - 50;
    var layout = rows(n, ctx.top + 190, groundY - 120, 240);
    if (n > 1) {
      var spare = groundY - 120 - layout.ys[n - 1];
      layout.ys = layout.ys.map(function (y) { return y + spare * 0.5; });
    }
    var crownY = (n ? layout.ys[0] : ctx.top + 220) - 70;
    function trunkX(y) { return cx + 12 * Math.sin((y - groundY) / 140); }

    var R = seeded('crown');
    out.push('<ellipse cx="' + cx + '" cy="' + f(crownY) + '" rx="205" ry="152" fill="' + c.primary + '" fill-opacity="0.08"/>');
    out.push('<ellipse cx="' + cx + '" cy="' + f(crownY + 6) + '" rx="150" ry="108" fill="' + c.primary + '" fill-opacity="0.08"/>');
    for (var i = 0; i < 110; i++) {
      var a = R() * Math.PI * 2;
      var d = Math.sqrt(R());
      out.push(leaf(cx + Math.cos(a) * d * 175, crownY + Math.sin(a) * d * 125, 15, 6.5, R() * 180, R() > 0.8 ? c.accent : c.primary, 0.35 + R() * 0.5));
    }

    var left = [];
    var right = [];
    for (var y = crownY + 30; y <= groundY; y += 20) {
      var t = (y - crownY) / (groundY - crownY);
      var w = 10 + 34 * Math.pow(t, 1.3);
      left.push(f(trunkX(y) - w / 2) + ' ' + f(y));
      right.unshift(f(trunkX(y) + w / 2) + ' ' + f(y));
    }
    out.push('<path d="M' + left.concat(right).join(' L') + ' Z" fill="' + c.primary + '"/>');
    [-0.25, 0.05, 0.3].forEach(function (k) {
      var y0 = crownY + 80 + k * 100;
      out.push('<path d="M' + f(trunkX(y0) + k * 14) + ' ' + f(y0) + ' Q' + f(trunkX(y0 + 120) + k * 30) + ' ' + f(y0 + 120) + ' ' + f(trunkX(groundY) + k * 40) + ' ' + f(groundY - 4) + '" fill="none" stroke="' + c.page + '" stroke-opacity="0.22" stroke-width="2"/>');
    });
    [[-150, 5], [-80, 4], [90, 4.5], [160, 3.5], [-20, 3]].forEach(function (r) {
      var bx = trunkX(groundY);
      out.push('<path d="M' + f(bx) + ' ' + f(groundY - 6) + ' Q' + f(bx + r[0] * 0.4) + ' ' + f(groundY + 4) + ' ' + f(bx + r[0]) + ' ' + f(groundY + 22) + '" fill="none" stroke="' + c.primary + '" stroke-width="' + r[1] + '" stroke-linecap="round"/>');
    });
    out.push('<line x1="120" y1="' + groundY + '" x2="' + (W - 120) + '" y2="' + groundY + '" stroke="' + c.gold + '" stroke-width="5" stroke-linecap="round"/>');
    out.push(grass(ctx, groundY - 1, 140, W - 140, 14, c.primary));
    if (!n) return crownY + 260;

    gens.forEach(function (g, i) {
      var side = i % 2 === 0 ? 1 : -1;
      var y = layout.ys[i];
      var tx = trunkX(y);
      var mx = tx + side * 96;
      var my = y - 26;
      out.push('<path class="tch-draw" pathLength="1" style="--d:' + (n - 1 - i) + '" d="M' + f(tx) + ' ' + f(y + 14) + ' Q' + f(tx + side * 42) + ' ' + f(y + 4) + ' ' + f(mx) + ' ' + f(my) + '" fill="none" stroke="' + c.primary + '" stroke-width="8" stroke-linecap="round"/>');
      out.push(genOpen(i));
      for (var k = 0; k < 8; k++) {
        var ang = k * 45 + i * 13;
        var rad = ang * Math.PI / 180;
        out.push(leaf(mx + Math.cos(rad) * 25, my + Math.sin(rad) * 25, 16, 7, ang, c.primary, k % 2 ? 0.7 : 0.95));
      }
      if (i === 0) out.push('<circle cx="' + f(mx) + '" cy="' + f(my) + '" r="44" fill="none" stroke="' + c.accent + '" stroke-width="2" stroke-dasharray="4 5"/>');
      out.push('<circle cx="' + f(mx) + '" cy="' + f(my) + '" r="15" fill="' + c.gold + '" stroke="' + c.accent + '" stroke-width="4"/>');
      out.push('<circle cx="' + f(mx) + '" cy="' + f(my) + '" r="5" fill="' + c.accent + '"/>');
      out.push(sideLabel(ctx, mx + side * 52, my, side, g, layout, { place: c.primary, kicker: c.accentInk, muted: c.muted, halo: c.page }));
      out.push('</g>');
    });
  }

  // ---------- River: from the oldest place at the source down to you at the sea ----------
  function drawRiver(ctx, gens) {
    var c = ctx.c, W = ctx.W, out = ctx.out, cx = W / 2, n = gens.length;
    var srcY = ctx.top + 100;
    var seaY = ctx.bottom - 40;
    out.push('<circle cx="' + (cx + 200) + '" cy="' + f(ctx.top + 30) + '" r="34" fill="' + c.gold + '" fill-opacity="0.9"/>');
    out.push('<path d="M60 ' + f(srcY + 14) + ' Q160 ' + f(srcY - 70) + ' 260 ' + f(srcY - 50) + ' T470 ' + f(srcY - 80) + ' T700 ' + f(srcY - 50) + ' T900 ' + f(srcY - 72) + ' T1020 ' + f(srcY + 14) + ' Z" fill="' + c.primary + '" fill-opacity="0.22"/>');
    out.push('<path d="M60 ' + f(srcY + 16) + ' Q200 ' + f(srcY - 34) + ' 340 ' + f(srcY - 14) + ' T' + cx + ' ' + f(srcY - 6) + ' T760 ' + f(srcY - 30) + ' T1020 ' + f(srcY + 16) + ' Z" fill="' + c.primary + '" fill-opacity="0.42"/>');
    for (var j = 0; j < 4; j++) {
      var wy = seaY - 6 + j * 14;
      var d = 'M80 ' + f(wy);
      for (var x = 80; x < W - 80; x += 60) d += ' q15 -7 30 0 t30 0';
      out.push('<path d="' + d + '" fill="none" stroke="' + c.water + '" stroke-width="3" stroke-linecap="round" stroke-opacity="' + f((0.9 - j * 0.18) * 100) / 100 + '"/>');
    }
    var bx = cx + 230;
    out.push('<path d="M' + (bx - 34) + ' ' + f(seaY - 14) + ' L' + (bx + 34) + ' ' + f(seaY - 14) + ' L' + (bx + 22) + ' ' + f(seaY) + ' L' + (bx - 22) + ' ' + f(seaY) + ' Z" fill="' + c.accent + '"/><path d="M' + bx + ' ' + f(seaY - 16) + ' L' + bx + ' ' + f(seaY - 64) + ' L' + (bx + 28) + ' ' + f(seaY - 22) + ' Z" fill="' + c.gold + '"/>');
    if (!n) {
      out.push('<path d="M' + cx + ' ' + f(srcY) + ' C' + cx + ' ' + f(srcY + 200) + ' ' + (cx - 150) + ' ' + f(srcY + 260) + ' ' + (cx - 150) + ' ' + f((srcY + seaY) / 2) + ' S' + cx + ' ' + f(seaY - 120) + ' ' + cx + ' ' + f(seaY - 10) + '" fill="none" stroke="' + c.water + '" stroke-width="14" stroke-linecap="round" stroke-opacity="0.5"/>');
      return (srcY + seaY) / 2;
    }

    var list = gens.slice().reverse();
    var layout = rows(n, srcY + 120, seaY - 130, 280);
    var pts = list.map(function (g, i) {
      var x = cx + (i % 2 === 0 ? -1 : 1) * 150;
      return { x: x, y: layout.ys[i], side: x < cx ? 1 : -1 };
    });
    var path = [{ x: cx, y: srcY }].concat(pts, [{ x: cx, y: seaY - 12 }]);
    var segs = [];
    for (var k = 1; k < path.length; k++) {
      var a = path[k - 1];
      var b = path[k];
      var my = (a.y + b.y) / 2;
      segs.push({ d: 'M' + f(a.x) + ' ' + f(a.y) + ' C' + f(a.x) + ' ' + f(my) + ' ' + f(b.x) + ' ' + f(my) + ' ' + f(b.x) + ' ' + f(b.y), w: 8 + (k - 1) * (34 / n) });
    }
    segs.forEach(function (sg, k) {
      out.push('<path class="tch-draw" pathLength="1" style="--d:' + k + '" d="' + sg.d + '" fill="none" stroke="' + c.water + '" stroke-width="' + f(sg.w) + '" stroke-linecap="round"/>');
    });
    segs.forEach(function (sg) {
      out.push('<path d="' + sg.d + '" fill="none" stroke="' + c.page + '" stroke-width="' + f(Math.max(2, sg.w * 0.16)) + '" stroke-dasharray="16 22" stroke-linecap="round" stroke-opacity="0.65"/>');
    });
    pts.forEach(function (p, i) {
      var w = 8 + i * (34 / n);
      var hx = p.x + p.side * (w / 2 + 40);
      var y = p.y;
      var youngest = i === n - 1;
      out.push(genOpen(n - 1 - i));
      out.push('<circle cx="' + f(hx) + '" cy="' + f(y - 4) + '" r="' + (youngest ? 42 : 34) + '" fill="' + c.gold + '" fill-opacity="0.22"/>');
      out.push('<path d="M' + f(hx - 23) + ' ' + f(y - 10) + ' L' + f(hx) + ' ' + f(y - 32) + ' L' + f(hx + 23) + ' ' + f(y - 10) + ' Z" fill="' + c.primary + '"/>');
      out.push('<rect x="' + f(hx - 17) + '" y="' + f(y - 11) + '" width="34" height="25" fill="' + c.accent + '"/>');
      out.push('<rect x="' + f(hx - 4) + '" y="' + f(y + 1) + '" width="8" height="13" fill="' + c.gold + '"/>');
      if (youngest) out.push('<path d="M' + f(hx + 12) + ' ' + f(y - 22) + ' L' + f(hx + 12) + ' ' + f(y - 50) + ' L' + f(hx + 32) + ' ' + f(y - 44) + ' L' + f(hx + 12) + ' ' + f(y - 38) + '" fill="' + c.gold + '" stroke="' + c.primary + '" stroke-width="2" stroke-linejoin="round"/>');
      out.push(sideLabel(ctx, hx + p.side * 42, y, p.side, list[i], layout, { place: c.primary, kicker: c.accentInk, muted: c.muted, halo: c.page }));
      out.push('</g>');
    });
  }

  // ---------- Rings: you at the heart of the trunk, each older generation a ring outside ----------
  function wobble(cx, cy, r, amp, phase) {
    var pts = [];
    for (var k = 0; k < 72; k++) {
      var a = (k / 72) * Math.PI * 2;
      var rr = r + amp * Math.sin(a * 3 + phase) + amp * 0.5 * Math.sin(a * 7 + phase * 2);
      pts.push(f(cx + Math.cos(a) * rr) + ' ' + f(cy + Math.sin(a) * rr));
    }
    return 'M' + pts.join(' L') + ' Z';
  }

  function drawRings(ctx, gens) {
    var c = ctx.c, W = ctx.W, out = ctx.out, P = ctx.id, cx = W / 2, n = gens.length;
    var avail = Math.min(W / 2 - 72, (ctx.bottom - ctx.top - 30) / 2);
    var cy = (ctx.top + ctx.bottom) / 2 + 5;
    var r0 = n <= 1 ? Math.min(avail * 0.6, 200) : Math.max(100, Math.min(150, avail - (n - 1) * 110));
    var step = n > 1 ? Math.min(140, (avail - r0) / (n - 1)) : 0;
    var outer = r0 + (n - 1 > 0 ? (n - 1) * step : 0);
    var defs = [];

    for (var k = n - 1; k >= 1; k--) {
      var rIn = r0 + (k - 1) * step;
      var rOut = rIn + step;
      var g = gens[k];
      out.push(genOpen(k));
      out.push('<path d="' + wobble(cx, cy, rOut, 3, k) + '" fill="' + c.page + '"/>');
      out.push('<path d="' + wobble(cx, cy, rOut, 3, k) + '" fill="' + (k % 2 ? c.gold : c.accent) + '" fill-opacity="' + (k % 2 ? 0.22 : 0.1) + '" stroke="' + (k === n - 1 ? c.primary : c.accent) + '" stroke-width="' + (k === n - 1 ? 7 : 2.5) + '" stroke-opacity="' + (k === n - 1 ? 1 : 0.5) + '"/>');
      [0.38, 0.72].forEach(function (t, m) {
        out.push('<path d="' + wobble(cx, cy, rOut - step * t, 2, k * 3 + m) + '" fill="none" stroke="' + c.accent + '" stroke-width="1.3" stroke-opacity="0.13"/>');
      });
      var size = Math.min(32, step * 0.42);
      var topR = rIn + 14;
      var kickR = rIn + 14 + size + 12;
      var botR = rOut - 14;
      defs.push('<path id="' + P + 'rt' + k + '" d="M' + f(cx - topR) + ' ' + f(cy) + ' A' + f(topR) + ' ' + f(topR) + ' 0 0 1 ' + f(cx + topR) + ' ' + f(cy) + '"/>');
      defs.push('<path id="' + P + 'rk' + k + '" d="M' + f(cx - kickR) + ' ' + f(cy) + ' A' + f(kickR) + ' ' + f(kickR) + ' 0 0 1 ' + f(cx + kickR) + ' ' + f(cy) + '"/>');
      defs.push('<path id="' + P + 'rb' + k + '" d="M' + f(cx - botR) + ' ' + f(cy) + ' A' + f(botR) + ' ' + f(botR) + ' 0 0 0 ' + f(cx + botR) + ' ' + f(cy) + '"/>');
      var placeMax = Math.floor((Math.PI * topR * 0.8) / (size * 0.5));
      var kick = (g.label || '').toUpperCase() + (g.years && g.years.trim() ? ' · ' + g.years.trim() : '');
      out.push(onArc(P + 'rt' + k, wrap(g.place, placeMax, 1)[0], 'font-family="' + SERIF + '" font-size="' + f(size) + '" fill="' + c.primary + '"'));
      if (step >= 66) out.push(onArc(P + 'rk' + k, kick, 'font-family="' + SANS + '" font-size="15" font-weight="700" letter-spacing="3" fill="' + c.accentInk + '"'));
      if (g.detail && g.detail.trim() && step >= 60) {
        out.push(onArc(P + 'rb' + k, wrap(g.detail, Math.floor((Math.PI * botR * 0.75) / 9.5), 1)[0], 'font-family="' + SERIF + '" font-style="italic" font-size="20" fill="' + c.muted + '"'));
      }
      out.push('</g>');
    }

    out.push(genOpen(0));
    out.push('<path d="' + wobble(cx, cy, r0, 2.5, 0.5) + '" fill="' + c.primary + '"' + (n === 1 ? ' stroke="' + c.gold + '" stroke-width="6"' : '') + '/>');
    [0.45, 0.75].forEach(function (t, m) {
      out.push('<path d="' + wobble(cx, cy, r0 * t, 1.5, m + 2) + '" fill="none" stroke="' + c.page + '" stroke-width="1.3" stroke-opacity="0.14"/>');
    });
    if (n) {
      var me = gens[0];
      var placeSize = r0 >= 130 ? 40 : 34;
      var lines = wrap(me.place, Math.floor((r0 * 1.5) / (placeSize * 0.5)), 2);
      var meKick = (me.label || '').toUpperCase() + (me.years && me.years.trim() ? ' · ' + me.years.trim() : '');
      var block = 26 + lines.length * (placeSize + 4);
      var ty = cy - block / 2 + 14;
      out.push(text(cx, ty, wrap(meKick, Math.floor(r0 / 7), 1), 'text-anchor="middle" font-family="' + SANS + '" font-size="16" font-weight="700" letter-spacing="3" fill="' + c.gold + '"', 0));
      out.push(text(cx, ty + placeSize + 8, lines, 'text-anchor="middle" font-family="' + SERIF + '" font-size="' + placeSize + '" fill="' + c.page + '"', placeSize + 4));
      if (me.detail && me.detail.trim() && r0 >= 140) {
        out.push(text(cx, ty + placeSize + 8 + lines.length * (placeSize + 4) + 4, wrap(me.detail, Math.floor(r0 / 8), 2), 'text-anchor="middle" font-family="' + SERIF + '" font-style="italic" font-size="21" fill="' + c.page + '" fill-opacity="0.82"', 26));
      }
    }
    out.push('</g>');

    // A new shoot from the outer ring: the family is still growing.
    var sa = -Math.PI / 4;
    var sx = cx + Math.cos(sa) * outer;
    var sy = cy + Math.sin(sa) * outer;
    out.push('<path d="M' + f(sx) + ' ' + f(sy) + ' C' + f(sx + 18) + ' ' + f(sy - 10) + ' ' + f(sx + 30) + ' ' + f(sy - 34) + ' ' + f(sx + 34) + ' ' + f(sy - 62) + '" fill="none" stroke="' + c.primary + '" stroke-width="4" stroke-linecap="round"/>');
    [[0.35, 1], [0.62, -1], [0.9, 1]].forEach(function (l) {
      var lx = sx + 34 * Math.pow(l[0], 0.7);
      var ly = sy - 62 * l[0];
      out.push(leaf(lx + l[1] * 14, ly - 4, 15, 6, l[1] > 0 ? -25 : 205, c.primary, 0.9));
    });
    out.push('<circle cx="' + f(sx + 34) + '" cy="' + f(sy - 66) + '" r="6" fill="' + c.gold + '"/>');
    if (defs.length) out.splice(ctx.defsAt, 0, '<defs>' + defs.join('') + '</defs>');
    return n ? null : cy + r0 + 70;
  }

  function onArc(id, str, attrs) {
    return '<text text-anchor="middle" ' + attrs + '><textPath href="#' + id + '" xlink:href="#' + id + '" startOffset="50%">' + esc(str) + '</textPath></text>';
  }

  // ---------- Stars: the family's places as one constellation in a night sky ----------
  function drawStars(ctx, gens) {
    var c = ctx.c, W = ctx.W, H = ctx.H, out = ctx.out, R = ctx.rand, cx = W / 2, n = gens.length;
    out.push('<defs><radialGradient id="' + ctx.id + 'glow"><stop offset="0" stop-color="' + c.gold + '" stop-opacity="0.55"/><stop offset="1" stop-color="' + c.gold + '" stop-opacity="0"/></radialGradient></defs>');
    [[200, 0.025], [140, 0.025], [80, 0.03]].forEach(function (band) {
      out.push('<ellipse cx="' + cx + '" cy="' + f(H / 2) + '" rx="' + f(H * 0.62) + '" ry="' + band[0] + '" transform="rotate(-58 ' + cx + ' ' + f(H / 2) + ')" fill="' + c.nightInk + '" fill-opacity="' + band[1] + '"/>');
    });
    for (var i = 0; i < 160; i++) {
      out.push('<circle cx="' + f(48 + R() * (W - 96)) + '" cy="' + f(48 + R() * (H - 96)) + '" r="' + f(0.5 + Math.pow(R(), 3) * 2.3) + '" fill="' + c.nightInk + '" fill-opacity="' + f((0.25 + R() * 0.6) * 100) / 100 + '"/>');
    }
    var my = ctx.inset + 96;
    out.push('<circle cx="104" cy="' + my + '" r="24" fill="' + c.gold + '"/><circle cx="116" cy="' + (my - 8) + '" r="21" fill="' + c.night + '"/>');
    if (!n) return (ctx.top + ctx.bottom) / 2;

    var layout = rows(n, ctx.top + 90, ctx.bottom - 70, 260);
    var pts = gens.map(function (g, i) {
      var starSide = i % 2 === 0 ? -1 : 1;
      return { x: cx + starSide * (120 + R() * 110), y: layout.ys[i] + (R() - 0.5) * 30, side: -starSide };
    });
    out.push('<path class="tch-draw" pathLength="1" d="M' + pts.map(function (p) { return f(p.x) + ' ' + f(p.y); }).join(' L') + '" fill="none" stroke="' + c.nightInk + '" stroke-width="2" stroke-opacity="0.5" stroke-linejoin="round"/>');
    pts.forEach(function (p, i) {
      var sz = 15 + i * 2.6;
      out.push(genOpen(i));
      out.push('<circle cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="' + f(sz * 3.4) + '" fill="url(#' + ctx.id + 'glow)"/>');
      out.push('<path d="M' + f(p.x) + ' ' + f(p.y - sz) + ' Q' + f(p.x) + ' ' + f(p.y) + ' ' + f(p.x + sz) + ' ' + f(p.y) + ' Q' + f(p.x) + ' ' + f(p.y) + ' ' + f(p.x) + ' ' + f(p.y + sz) + ' Q' + f(p.x) + ' ' + f(p.y) + ' ' + f(p.x - sz) + ' ' + f(p.y) + ' Q' + f(p.x) + ' ' + f(p.y) + ' ' + f(p.x) + ' ' + f(p.y - sz) + ' Z" fill="' + c.nightInk + '"/>');
      out.push('<circle cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="4" fill="' + c.gold + '"/>');
      if (i === 0) out.push('<circle cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="30" fill="none" stroke="' + c.nightInk + '" stroke-opacity="0.5" stroke-width="1.5" stroke-dasharray="3 5"/>');
      out.push(sideLabel(ctx, p.x + p.side * 46, p.y, p.side, gens[i], layout, { place: c.nightInk, kicker: c.gold, muted: c.nightInk, mutedOpacity: 0.75 }));
      out.push('</g>');
    });
  }

  var RENDERERS = { roots: drawRoots, tree: drawTree, river: drawRiver, rings: drawRings, stars: drawStars };

  function styleById(id) {
    for (var i = 0; i < STYLES.length; i++) if (STYLES[i].id === id) return STYLES[i];
    return STYLES[0];
  }

  function paletteById(id) {
    for (var i = 0; i < PALETTES.length; i++) if (PALETTES[i].id === id) return PALETTES[i];
    return PALETTES[0];
  }

  function complete(c) {
    var out = {};
    for (var k in c) out[k] = c[k];
    out.night = c.night || '#1D2421';
    out.nightInk = c.nightInk || '#F4EADB';
    out.water = c.water || c.primary;
    return out;
  }

  function places(data) {
    return (data.generations || []).filter(function (g) { return g.place && g.place.trim(); }).slice(0, MAX_GENERATIONS);
  }

  /**
   * @param {{ name?: string, generations: { label: string, place: string, years?: string, detail?: string }[] }} data
   *   generations ordered from the youngest to the oldest; entries without a place are skipped
   * @param {{ page: string, surface: string, primary: string, accent: string, accentInk: string, gold: string, ink: string, muted: string, line: string, night?: string, nightInk?: string, water?: string }} colours
   * @param {{ style?: string, format?: 'post' | 'story', idPrefix?: string }} [opts]
   */
  function render(data, colours, opts) {
    opts = opts || {};
    var fmt = FORMATS[opts.format] || FORMATS.post;
    var style = styleById(opts.style).id;
    var c = complete(colours);
    var dark = style === 'stars';
    var ctx = { W: fmt.w, H: fmt.h, c: c, id: (opts.idPrefix || 'tch') + '-', out: [], rand: seeded(style), inset: fmt.h > 1500 ? 150 : 0 };
    var gens = places(data);
    var name = (data.name || '').trim();
    var titleLines = wrap(name ? 'The roots of ' + name : 'Where I come from', 30, 2);
    var bg = dark ? c.night : c.page;
    var ink = dark ? c.nightInk : c.primary;
    var out = ctx.out;

    out.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + ctx.W + ' ' + ctx.H + '" width="' + ctx.W + '" height="' + ctx.H + '">');
    out.push('<rect width="' + ctx.W + '" height="' + ctx.H + '" fill="' + bg + '"/>');
    ctx.defsAt = out.length;
    var y0 = ctx.inset;
    ctx.top = y0 + (titleLines.length > 1 ? 250 : 222);
    ctx.bottom = ctx.H - 130 - ctx.inset * 0.6;
    var inviteY = RENDERERS[style](ctx, gens);
    if (!gens.length) {
      out.push(text(ctx.W / 2, inviteY || (ctx.top + ctx.bottom) / 2, ['Add a place to begin.'], 'text-anchor="middle" font-family="' + SERIF + '" font-style="italic" font-size="40" fill="' + (dark ? c.nightInk : c.muted) + '"' + halo(bg, 10), 0));
    }
    out.push('<rect x="36" y="36" width="' + (ctx.W - 72) + '" height="' + (ctx.H - 72) + '" rx="28" fill="none" stroke="' + (dark ? c.nightInk : c.line) + '" stroke-opacity="' + (dark ? 0.3 : 1) + '" stroke-width="3"/>');
    out.push(text(ctx.W / 2, y0 + 112, ['THE CULTURED HUMAN'], 'text-anchor="middle" font-family="' + SANS + '" font-size="22" font-weight="700" letter-spacing="6" fill="' + (dark ? c.gold : c.accentInk) + '"', 0));
    out.push(text(ctx.W / 2, y0 + (titleLines.length > 1 ? 168 : 186), titleLines, 'text-anchor="middle" font-family="' + SERIF + '" font-size="58" fill="' + ink + '"', 64));
    out.push(text(ctx.W / 2, ctx.H - 82 - ctx.inset * 0.6, ['Everyone comes from somewhere · @theculturedhuman'], 'text-anchor="middle" font-family="' + SANS + '" font-size="21" letter-spacing="1" fill="' + (dark ? c.nightInk : c.muted) + '"' + (dark ? ' fill-opacity="0.75"' : ''), 0));
    out.push('</svg>');
    return out.join('');
  }

  var api = { render: render, STYLES: STYLES, PALETTES: PALETTES, FORMATS: FORMATS, MAX_GENERATIONS: MAX_GENERATIONS, styleById: styleById, paletteById: paletteById, places: places };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TCHRootsArt = api;
})(this);
