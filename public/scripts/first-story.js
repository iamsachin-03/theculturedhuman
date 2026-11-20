// One question on the home page, answered before anyone signs up. The answer is kept in this
// browser (IndexedDB "tch-archive", the store the archive app already offers to bring over
// at sign-in), then turned into a keepsake card the visitor can save or send.
(function () {
  var box = document.querySelector('[data-first-story]');
  var core = window.TCH && window.TCH.core;
  if (!box || !core || !window.indexedDB) return;

  // The lighter questions, so the first answer comes easily.
  var STARTERS = [0, 3, 1, 2, 5, 7, 8, 9, 13, 15];
  var turn = Math.floor(Date.now() / 86400000) % STARTERS.length;

  var questionEl = box.querySelector('[data-question]');
  var form = box.querySelector('form');
  var teller = form.querySelector('[name="teller"]');
  var text = form.querySelector('[name="text"]');
  var recordBtn = form.querySelector('[data-record]');
  var recordNote = form.querySelector('[data-record-note]');
  var preview = form.querySelector('[data-record-preview]');
  var status = box.querySelector('[data-status]');
  var done = box.querySelector('[data-done]');
  var waiting = box.querySelector('[data-waiting]');
  var audio = null;
  var recorder = null;

  function current() { return core.question(STARTERS[turn % STARTERS.length]); }
  function showQuestion() { questionEl.textContent = current().text; }
  showQuestion();
  box.querySelector('[data-another]').addEventListener('click', function () { turn++; showQuestion(); });

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open('tch-archive', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('entries', { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function kept() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var r = db.transaction('entries', 'readonly').objectStore('entries').getAll();
        r.onsuccess = function () { resolve(r.result || []); };
        r.onerror = function () { resolve([]); };
      });
    }).catch(function () { return []; });
  }
  function keep(entry) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('entries', 'readwrite');
        tx.objectStore('entries').put(entry);
        tx.oncomplete = function () { resolve(entry); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function imported() {
    try { return JSON.parse(localStorage.getItem('tch-imported-ids') || '[]'); } catch (e) { return []; }
  }
  function showWaiting() {
    kept().then(function (list) {
      var handled = imported();
      var n = list.filter(function (e) { return handled.indexOf(e.id) === -1; }).length;
      if (!n || !done.hidden) return;
      waiting.hidden = false;
      waiting.querySelector('[data-count]').textContent = n === 1 ? 'one story' : n + ' stories';
      waiting.querySelector('[data-keep-link]').textContent = n === 1 ? 'Keep it in your archive' : 'Keep them in your archive';
    });
  }
  showWaiting();

  recordBtn.addEventListener('click', function () {
    if (recorder) { recorder.stop(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { say('Recording is not supported in this browser. Write it instead.'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = function (ev) { if (ev.data.size) chunks.push(ev.data); };
      recorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        audio = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        recorder = null;
        recordBtn.textContent = 'Record it again';
        preview.textContent = '';
        var el = document.createElement('audio');
        el.controls = true;
        el.src = URL.createObjectURL(audio);
        el.setAttribute('aria-label', 'Your recording');
        preview.appendChild(el);
        recordNote.textContent = 'Recorded. It is kept with your story.';
      };
      recorder.start();
      recordBtn.textContent = 'Stop recording';
      recordNote.textContent = 'Recording… speak whenever you are ready.';
    }).catch(function () { say('We could not use your microphone. Check the browser permission, or write it instead.'); });
  });

  function say(t) { status.textContent = t || ''; }
  function track(name, data) { if (window.TCH && window.TCH.track) window.TCH.track(name, data); }
  var started = false;
  function start() { if (!started) { started = true; track('First story started'); } }
  text.addEventListener('input', start);
  recordBtn.addEventListener('click', start);

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (recorder) { say('Stop the recording first.'); return; }
    var words = text.value.trim();
    if (!words && !audio) { say('Write a few lines, or record them.'); text.focus(); return; }
    var q = current();
    var who = teller.value.trim();
    var entry = {
      id: 'home-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      kind: q.kind,
      title: titleFor(words, who, q),
      text: words,
      prompt: q.text,
      teller: who,
      createdAt: new Date().toISOString(),
    };
    if (audio) entry.audio = audio;
    keep(entry).then(function () {
      track('First story kept', { voice: !!audio });
      form.hidden = true;
      waiting.hidden = true;
      done.hidden = false;
      done.querySelector('[data-who]').textContent = who ? who + '\u2019s story is' : 'Your story is';
      say('');
      drawCard(entry).then(function (blob) {
        var slot = done.querySelector('[data-card-slot]');
        slot.textContent = '';
        var img = document.createElement('img');
        img.className = 'first-story__img';
        img.width = 1080;
        img.height = 1350;
        img.alt = 'A keepsake card of the question and the answer you wrote';
        img.src = URL.createObjectURL(blob);
        slot.appendChild(img);
        done.querySelector('[data-share]').onclick = function () { shareCard(blob, entry); };
      });
      done.querySelector('h3').focus();
    }).catch(function () { say('This browser would not keep it. Try again, or start your archive to keep it safely.'); });
  });

  box.querySelector('[data-again]').addEventListener('click', function () {
    form.reset();
    audio = null;
    preview.textContent = '';
    recordNote.textContent = '';
    recordBtn.textContent = 'Record it instead';
    turn++;
    showQuestion();
    done.hidden = true;
    form.hidden = false;
    text.focus();
  });

  function titleFor(words, who, q) {
    var first = (words.match(/^[^.!?\n]+[.!?]?/) || [''])[0].trim();
    if (first && first.length <= 90) return first;
    return (who ? who + ': ' : '') + q.text.replace(/\?.*$/, '');
  }

  // ---------- the keepsake card ----------
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function wrap(ctx, str, width, maxLines) {
    var words = String(str).split(/\s+/);
    var lines = [];
    var line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > width && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (last && ctx.measureText(last + '…').width > width) last = last.replace(/\s*\S+$/, '');
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }
  function drawCard(entry) {
    var W = 1080, H = 1350, P = 104;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var serif = '"Cormorant Garamond", Georgia, serif';
    var sans = '"DM Sans", system-ui, sans-serif';
    var fonts = document.fonts ? Promise.all([document.fonts.load('500 80px "Cormorant Garamond"'), document.fonts.load('italic 500 60px "Cormorant Garamond"'), document.fonts.load('400 36px "DM Sans"')]).catch(function () {}) : Promise.resolve();
    var art = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = '/assets/illustrations/keepsake-box-800.jpg';
    });
    return Promise.all([fonts, art]).then(function (r) {
      ctx.fillStyle = cssVar('--page', '#FBF4E8');
      ctx.fillRect(0, 0, W, H);
      if (r[1]) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(40, 40, W - 80, 380);
        ctx.clip();
        var scale = (W - 80) / r[1].width;
        ctx.drawImage(r[1], 40, 40 - (r[1].height * scale - 380) / 2, W - 80, r[1].height * scale);
        ctx.restore();
      }
      ctx.strokeStyle = cssVar('--line', '#E5D4BD');
      ctx.lineWidth = 3;
      ctx.strokeRect(40, 40, W - 80, H - 80);
      ctx.font = '500 58px ' + serif;
      var qLines = wrap(ctx, entry.prompt, W - 2 * P, 3);
      ctx.font = 'italic 500 46px ' + serif;
      var body = entry.text ? '\u201C' + entry.text + '\u201D' : 'A voice note, kept for the family.';
      var bLines = wrap(ctx, body, W - 2 * P, Math.max(2, 9 - qLines.length));
      var blockH = 64 + qLines.length * 64 + 30 + bLines.length * 56;
      var y = 470 + Math.max(40, Math.floor((1090 - 470 - blockH) / 2));
      ctx.fillStyle = cssVar('--accent-ink', '#A5472A');
      ctx.font = '600 28px ' + sans;
      ctx.fillText('A QUESTION, ANSWERED', P, y);
      y += 64;
      ctx.fillStyle = cssVar('--primary', '#28594B');
      ctx.font = '500 58px ' + serif;
      qLines.forEach(function (l) { ctx.fillText(l, P, y); y += 64; });
      y += 30;
      ctx.fillStyle = cssVar('--ink', '#352B26');
      ctx.font = 'italic 500 46px ' + serif;
      bLines.forEach(function (l) { ctx.fillText(l, P, y); y += 56; });
      ctx.fillStyle = cssVar('--muted', '#6E6055');
      ctx.font = '400 32px ' + sans;
      if (entry.teller) ctx.fillText('\u2014 as told by ' + entry.teller, P, 1140);
      ctx.fillStyle = cssVar('--band', '#28594B');
      ctx.fillRect(40, H - 170, W - 80, 130);
      ctx.fillStyle = cssVar('--band-ink', '#FFF5E6');
      ctx.font = '500 44px ' + serif;
      ctx.fillText('What would you ask them?', P, H - 102);
      ctx.font = '400 28px ' + sans;
      ctx.fillText(location.host, P, H - 62);
      return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
    });
  }
  function shareCard(blob, entry) {
    var name = 'a-question-answered.png';
    var file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: entry.prompt + ' ' + location.origin + '/' }).then(function () { track('Keepsake card shared', { how: 'share' }); }, function () {});
      return;
    }
    track('Keepsake card shared', { how: 'download' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
})();
