// Shared behaviour for every page: theme picker, mobile menu and the Curious Minds quiz.
(function () {
  var THEMES = ['marigold', 'indigo', 'gulmohar', 'evening'];
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
})();
