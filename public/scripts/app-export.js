// The one-button copy of a family archive: a zip holding every photograph, recording and document
// as itself, a page that opens in any browser without the internet, and archive.json with
// everything in a form another service can read. Files are stored rather than compressed (photos,
// audio and video are compressed already), and there is no zip64, so a copy must stay under 4 GB.
// Works in the browser (window.TCH.archiveExport) and in Node.
(function (root) {
  var core = typeof module !== 'undefined' && module.exports ? require('./app-core.js') : root.TCH.core;
  var LIMIT = 0xffffffff;

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function utf8(text) { return new TextEncoder().encode(text); }

  function dos(date) {
    var y = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
      date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
  }

  // files: [{ name, data: Uint8Array }]. Returns the zip as a list of byte arrays, ready for a Blob.
  function zip(files, when) {
    var stamp = dos(when || new Date());
    var parts = [];
    var central = [];
    var offset = 0;
    if (files.length > 0xffff) throw new Error('Too many files for one copy.');
    files.forEach(function (f) {
      var name = utf8(f.name);
      var crc = crc32(f.data);
      var size = f.data.length;
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, stamp.time, true);
      local.setUint16(12, stamp.date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);

      var entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x0800, true);
      entry.setUint16(10, 0, true);
      entry.setUint16(12, stamp.time, true);
      entry.setUint16(14, stamp.date, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, size, true);
      entry.setUint32(24, size, true);
      entry.setUint16(28, name.length, true);
      entry.setUint32(42, offset, true);
      central.push(new Uint8Array(entry.buffer), name);

      parts.push(new Uint8Array(local.buffer), name, f.data);
      offset += 30 + name.length + size;
      if (offset > LIMIT) throw new Error('This archive is larger than 4 GB, too large for one copy.');
    });
    var centralSize = central.reduce(function (n, p) { return n + p.length; }, 0);
    if (offset + centralSize > LIMIT) throw new Error('This archive is larger than 4 GB, too large for one copy.');
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return parts.concat(central, [new Uint8Array(end.buffer)]);
  }

  // Where each file goes in the copy: one folder per entry, oldest first, names kept readable.
  function layout(entries) {
    var used = {};
    var files = [];
    entries.slice().sort(byDate).forEach(function (e, i) {
      var folder = 'files/' + String(i + 1).padStart(3, '0') + '-' + core.safeFileName(e.title).replace(/\./g, '-').slice(0, 50);
      (e.media || []).forEach(function (m) {
        var name = core.safeFileName(m.name);
        var path = folder + '/' + name;
        for (var n = 2; used[path]; n++) path = folder + '/' + n + '-' + name;
        used[path] = true;
        files.push({ entryId: e.id, mediaId: m.id, media: m, path: path });
      });
    });
    return files;
  }

  function byDate(a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function hrefFor(path) { return path.split('/').map(encodeURIComponent).join('/'); }

  function transcriptHtml(m) {
    return (m.transcript ? '<p class="said">' + esc(m.transcript).replace(/\n/g, '<br>') + '</p>' : '') +
      (m.translation ? '<p class="note">In English: ' + esc(m.translation).replace(/\n/g, '<br>') + '</p>' : '');
  }

  function mediaHtml(m, path, ok) {
    if (!ok) return '<p class="missing">This file could not be copied: ' + esc(m.name) + '</p>' + transcriptHtml(m);
    var src = hrefFor(path);
    var kind = m.kind || core.mediaKind(m.mime || m.type, m.name);
    var caption = '<figcaption>' + esc(m.name) + '</figcaption>';
    switch (kind) {
      case 'photo': return '<figure><img src="' + src + '" alt="' + esc(m.name) + '" loading="lazy">' + caption + '</figure>';
      case 'audio': return '<figure><audio controls preload="none" src="' + src + '"></audio>' + caption + '</figure>' + transcriptHtml(m);
      case 'video': return '<figure><video controls preload="metadata" src="' + src + '"></video>' + caption + '</figure>' + transcriptHtml(m);
      default: return '<p><a href="' + src + '">' + esc(m.name) + '</a></p>';
    }
  }

  function page(archive, files, copied) {
    var people = archive.people || [];
    var byEntry = {};
    files.forEach(function (f) { (byEntry[f.entryId] = byEntry[f.entryId] || []).push(f); });
    var sections = core.KINDS.map(function (k) {
      var list = archive.entries.filter(function (e) { return e.kind === k.id; }).sort(byDate);
      if (!list.length) return '';
      return '<section><h2>' + esc(k.heading) + '</h2>' + list.map(function (e) {
        var meta = [e.teller && 'Told by ' + e.teller, e.place, core.formatDate(e.createdAt), core.audienceLabel(e, people)].filter(Boolean);
        var body = String(e.body || '').split(/\n{2,}/).filter(Boolean).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
        var media = (byEntry[e.id] || []).map(function (f) { return mediaHtml(f.media, f.path, copied[f.path]); }).join('');
        return '<article><h3>' + esc(e.title || 'Untitled') + '</h3><p class="meta">' + esc(meta.join(' · ')) + '</p>' +
          (e.prompt ? '<p class="prompt">' + esc(e.prompt) + '</p>' : '') + body + media + '</article>';
      }).join('') + '</section>';
    }).join('');
    var circle = people.length ? '<section><h2>The people in this archive</h2><ul>' + people.map(function (p) {
      var role = core.ROLES.filter(function (r) { return r.id === p.role; })[0];
      return '<li>' + esc(p.name) + (role ? ' — ' + esc(role.label) : '') + '</li>';
    }).join('') + '</ul></section>' : '';
    var owner = archive.owner && archive.owner.name ? archive.owner.name + '\u2019s family archive' : 'A family archive';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(owner) + '</title><style>' +
      'body{font:17px/1.6 Georgia,serif;color:#2a2420;background:#fbf7f0;margin:0}main{max-width:44rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}' +
      'h1{font-size:2.2rem;line-height:1.15;margin:0 0 .5rem}h2{margin-top:3rem;border-bottom:1px solid #d9cfc0;padding-bottom:.3rem}' +
      'article{margin:2rem 0}h3{margin:0 0 .2rem}.meta,.note,figcaption{color:#6b6157;font:14px/1.5 system-ui,sans-serif}.prompt{font-style:italic}' +
      '.said{white-space:pre-wrap;border-left:3px solid #d9cfc0;padding-left:.8rem}img,video{max-width:100%;height:auto;border-radius:6px}audio{width:100%}figure{margin:1rem 0}.missing{color:#9b2c2c}' +
      '</style></head><body><main><h1>' + esc(owner) + '</h1>' +
      '<p class="note">Copied from The Cultured Human on ' + esc(core.formatDate(archive.exportedAt)) + '. This copy is yours. It opens without the internet, ' +
      'and every photograph, recording and document is in the files folder as itself. archive.json holds everything again, for moving it somewhere else.</p>' +
      sections + circle + '</main></body></html>';
  }

  // archive: { owner, people, weekly, legacy, entries, exportedAt }. fetched: path → Uint8Array, or nothing when a file could not be read.
  function build(archive, files, fetched) {
    var copied = {};
    files.forEach(function (f) { copied[f.path] = !!fetched[f.path]; });
    var paths = {};
    files.forEach(function (f) { paths[f.mediaId] = f.path; });
    var data = {
      format: 'the-cultured-human-family-archive', version: 3, exportedAt: archive.exportedAt,
      owner: archive.owner, legacy: archive.legacy, people: archive.people, weekly: archive.weekly,
      entries: archive.entries.slice().sort(byDate).map(function (e) {
        var out = {};
        Object.keys(e).forEach(function (k) { out[k] = e[k]; });
        out.media = (e.media || []).map(function (m) {
          var c = {};
          Object.keys(m).forEach(function (k) { if (k !== 'url' && k !== 'blob' && k !== 'data') c[k] = m[k]; });
          c.file = paths[m.id];
          if (!copied[paths[m.id]]) c.missing = true;
          return c;
        });
        return out;
      }),
    };
    var top = 'family-archive-' + String(archive.exportedAt).slice(0, 10) + '/';
    var list = [
      { name: top + 'Start here.html', data: utf8(page(archive, files, copied)) },
      { name: top + 'archive.json', data: utf8(JSON.stringify(data, null, 1)) },
    ];
    files.forEach(function (f) { if (fetched[f.path]) list.push({ name: top + f.path, data: fetched[f.path] }); });
    return zip(list, new Date(archive.exportedAt));
  }

  var api = { crc32: crc32, zip: zip, layout: layout, page: page, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.TCH = root.TCH || {}).archiveExport = api;
})(this);
