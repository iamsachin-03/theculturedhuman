// Shared behaviour for every page: theme picker, mobile menu and the Curious Minds quiz.
(function () {
  var THEMES = ['marigold', 'haldi', 'indigo', 'gulmohar', 'evening'];
  var STORAGE_KEY = 'tch-theme';
  var root = document.documentElement;

  function applyTheme(theme) {
    if (THEMES.indexOf(theme) === -1) theme = 'marigold';
    root.setAttribute('data-theme', theme);
    document.querySelectorAll('[data-theme-picker]').forEach(function (el) { el.value = theme; });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(root).getPropertyValue('--page').trim());
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
  }

  applyTheme(root.getAttribute('data-theme'));
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-theme-picker]')) applyTheme(e.target.value);
  });
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY && e.newValue) applyTheme(e.newValue);
  });

  // Named moments counted by Vercel Web Analytics on public pages (custom events need a paid Vercel plan).
  // Never pass anything a visitor wrote, or anything that could identify them.
  var TCH = window.TCH = window.TCH || {};
  TCH.track = function (name, data) {
    if (!document.querySelector('script[src="/_vercel/insights/script.js"]')) return;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    window.va('event', { name: name, data: data });
  };

  // Lets the site receive voice notes and photographs shared from other apps once it is on the home screen.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(function () {});

  var account = document.querySelector('[data-account-link]');
  if (account) {
    try {
      if (localStorage.getItem('tch-signed-in') === '1') account.textContent = 'My archive';
    } catch (e) {}
  }

  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.menu-toggle');
  if (header && toggle) {
    var setOpen = function (open) {
      header.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('.menu-toggle__label').textContent = open ? 'Close' : 'Menu';
    };
    toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    header.querySelectorAll('.primary-nav a').forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });
  }

  document.querySelectorAll('[data-quiz]').forEach(initQuiz);

  function initQuiz(el) {
    var data;
    try { data = JSON.parse(el.querySelector('script[type="application/json"]').textContent); } catch (e) { return; }
    var index = 0;
    var score = 0;
    var progress = el.querySelector('.quiz__progress');
    var question = el.querySelector('.quiz__question');
    var options = el.querySelector('.quiz__options');
    var feedback = el.querySelector('.quiz__feedback');
    var next = el.querySelector('.quiz__next');

    function render() {
      var q = data[index];
      progress.textContent = 'Question ' + (index + 1) + ' of ' + data.length;
      question.textContent = q.q;
      options.innerHTML = '';
      feedback.textContent = '';
      next.hidden = true;
      q.options.forEach(function (label, i) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quiz__option';
        btn.textContent = label;
        btn.addEventListener('click', function () { answer(i); });
        li.appendChild(btn);
        options.appendChild(li);
      });
    }

    function answer(choice) {
      var q = data[index];
      var buttons = options.querySelectorAll('button');
      buttons.forEach(function (b, i) {
        b.disabled = true;
        if (i === q.answer) b.dataset.state = 'correct';
        else if (i === choice) b.dataset.state = 'wrong';
      });
      var right = choice === q.answer;
      if (right) score++;
      feedback.innerHTML = '';
      var strong = document.createElement('strong');
      strong.textContent = right ? 'Correct. ' : 'Not quite. ';
      feedback.appendChild(strong);
      feedback.appendChild(document.createTextNode(q.explain));
      next.textContent = index < data.length - 1 ? 'Next question' : 'See your score';
      next.hidden = false;
      next.focus();
    }

    var finished = false;
    next.addEventListener('click', function () {
      if (finished) {
        finished = false; index = 0; score = 0;
        render();
        options.querySelector('button').focus();
        return;
      }
      if (index < data.length - 1) { index++; render(); options.querySelector('button').focus(); return; }
      finished = true;
      progress.textContent = 'Your score';
      question.textContent = score + ' of ' + data.length + (score === data.length ? ' — a truly curious human.' : ' — every wrong answer is a new thing learned.');
      options.innerHTML = '';
      feedback.textContent = '';
      next.textContent = 'Play again';
    });

    render();
  }

  document.querySelectorAll('form[data-enquiry]').forEach(initEnquiry);

  // Until the site has an inbox (site.json → enquiries.endpoint), an enquiry becomes an
  // email when an address is configured, or a ready-to-paste Instagram message.
  function initEnquiry(form) {
    var status = form.querySelector('.enquiry__status');
    var button = form.querySelector('button[type="submit"]');

    function asText() {
      var lines = [];
      new FormData(form).forEach(function (value, key) {
        if (key === '_gotcha' || !String(value).trim()) return;
        lines.push(key === 'enquiry' ? 'Enquiry: ' + value : key.charAt(0).toUpperCase() + key.slice(1) + ': ' + value);
      });
      return lines.join('\n');
    }

    function show(nodes) {
      status.innerHTML = '';
      nodes.forEach(function (n) { status.appendChild(n); });
      status.focus();
    }

    function el(tag, props, text) {
      var node = document.createElement(tag);
      Object.keys(props || {}).forEach(function (k) { node.setAttribute(k, props[k]); });
      if (text) node.textContent = text;
      return node;
    }

    function fallback() {
      var text = asText();
      var email = form.dataset.email;
      if (email) {
        var subject = form.querySelector('input[name="enquiry"]').value + ' — The Cultured Human';
        window.location.href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
        show([el('p', {}, 'Your email app should open with the message ready to send. If it does not, write to ' + email + '.')]);
        return;
      }
      var box = el('textarea', { readonly: '', 'aria-label': 'Your message' });
      box.value = text;
      var copy = el('button', { type: 'button', class: 'btn btn--ghost' }, 'Copy message');
      var open = el('a', { class: 'btn', href: form.dataset.dm, target: '_blank', rel: 'noopener' }, 'Open Instagram messages');
      var row = el('div', { class: 'btn-row' });
      row.appendChild(open);
      row.appendChild(copy);
      var note = el('p', {}, 'Your message is ready. We do not have an inbox on this site yet, so please send it to ' + form.dataset.handle + ' on Instagram. We read every message.');
      function doCopy() {
        if (!navigator.clipboard) { box.select(); return; }
        navigator.clipboard.writeText(text).then(function () { copy.textContent = 'Copied'; }, function () { box.select(); });
      }
      copy.addEventListener('click', doCopy);
      show([note, box, row]);
      doCopy();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.querySelector('input[name="_gotcha"]').value) return;
      var endpoint = form.getAttribute('action');
      if (!endpoint) { fallback(); return; }
      button.disabled = true;
      button.textContent = 'Sending…';
      fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          var who = form.querySelector('input[name="email"]').value;
          form.reset();
          show([el('p', {}, 'Thank you. We have your enquiry and will reply to ' + who + '.')]);
        })
        .catch(fallback)
        .then(function () { button.disabled = false; button.textContent = 'Send enquiry'; });
    });
  }
})();
