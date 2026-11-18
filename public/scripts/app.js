// The family archive app at /app.html: sign in, keep stories, voices, photographs, videos and
// documents, share them with the people you choose, and decide what is passed on.
// It talks to a Supabase project when one is configured (site.json "backend", or a developer
// override in localStorage "tch-backend"); otherwise it runs in preview mode on this device.
(function () {
  var TCH = window.TCH;
  var core = TCH.core;
  var Art = window.TCHRootsArt;
  var app = document.querySelector('[data-app]');
  if (!app) return;

  // ---------- which backend ----------
  function backendConfig() {
    var cfg = {};
    if (/[?&]preview\b/.test(location.search)) return cfg;
    try { cfg = JSON.parse(document.querySelector('meta[name="tch-backend"]').content || '{}'); } catch (e) {}
    try {
      var override = JSON.parse(localStorage.getItem('tch-backend') || 'null');
      if (override && override.url && override.anonKey) cfg = override;
    } catch (e) {}
    return cfg;
  }
  var cfg = backendConfig();
  var store = cfg.url && cfg.anonKey ? TCH.stores.supabase(cfg) : TCH.stores.local;
  var returnTo = location.origin + location.pathname + (store.mode === 'local' && location.search ? location.search : '');
  var MAX_BYTES = store.mode === 'supabase' ? 50 * 1024 * 1024 : 500 * 1024 * 1024;

  var state = { user: null, legacy: null, people: null };

  // ---------- tiny DOM helpers ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (tag === 'input' && !(attrs && attrs.type)) el.type = 'text';
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { add(el, c); }); return; }
    el.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  function link(href, text, cls) { return h('a', { href: href, class: cls }, text); }
  function button(text, onclick, cls, type) { return h('button', { type: type || 'button', class: cls || 'btn', onclick: onclick }, text); }
  var fieldCount = 0;
  function field(label, input, hint, wide) {
    var id = input.id || 'f' + (++fieldCount);
    input.id = id;
    var hintEl = hint ? h('span', { class: 'field__hint', id: id + '-hint' }, hint) : null;
    if (hintEl) input.setAttribute('aria-describedby', id + '-hint');
    return h('p', { class: 'field' + (wide ? ' field--wide' : '') }, h('label', { for: id }, label), hintEl, input);
  }
  function options(select, list, value) {
    list.forEach(function (o) {
      var opt = h('option', { value: o.id }, o.label);
      if (o.id === value) opt.selected = true;
      select.appendChild(opt);
    });
    return select;
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  function firstName(name) { return String(name || '').split(/\s+/)[0]; }
  function download(name, text, type) {
    var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type })), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- frame ----------
  var nav = h('nav', { class: 'app-nav', 'aria-label': 'Your archive' });
  var notice = h('p', { class: 'app-notice', hidden: true });
  var status = h('p', { class: 'app-status', role: 'status', 'aria-live': 'polite' });
  var view = h('div', { class: 'app-view' });
  app.textContent = '';
  add(app, [nav, notice, status, view]);

  function say(text, isError) {
    status.textContent = text || '';
    status.classList.toggle('is-error', Boolean(isError));
  }
  function fail(err) {
    say(err && err.message ? err.message : 'Something went wrong. Please try again.', true);
  }

  var TABS = [
    ['#/', 'Home'], ['#/archive', 'My archive'], ['#/weekly', 'Weekly question'],
    ['#/people', 'My people'], ['#/shared', 'Shared with me'], ['#/settings', 'Settings'],
  ];
  function drawNav(route) {
    nav.textContent = '';
    nav.hidden = !state.user;
    if (!state.user) return;
    var ul = h('ul');
    TABS.forEach(function (t) {
      var current = t[0] === '#/' ? route === '' : route.indexOf(t[0].slice(2)) === 0;
      ul.appendChild(h('li', null, h('a', { href: t[0], 'aria-current': current ? 'page' : null }, t[1])));
    });
    nav.appendChild(ul);
  }

  function drawNotice() {
    if (store.mode === 'local') {
      notice.hidden = false;
      notice.textContent = '';
      add(notice, [h('strong', null, 'Preview mode. '), 'No account server is connected yet, so everything stays in this browser on this device, and the accounts here are pretend ones for trying out sharing. Keep a copy from Settings before clearing your browser.']);
    } else {
      notice.hidden = true;
    }
  }

  function page(title, lede) {
    view.textContent = '';
    var h1 = h('h1', { tabindex: '-1' }, title);
    add(view, h('header', { class: 'app-head' }, h1, lede ? h('p', { class: 'lede' }, lede) : null));
    return h1;
  }

  // ---------- routing ----------
  function parse() {
    var raw = location.hash.replace(/^#\/?/, '');
    var q = raw.indexOf('?');
    return { path: q === -1 ? raw : raw.slice(0, q), query: new URLSearchParams(q === -1 ? '' : raw.slice(q + 1)) };
  }

  var routes = [
    [/^$/, home], [/^archive$/, archive], [/^entry\/new$/, editor], [/^entry\/([\w-]+)\/edit$/, editor],
    [/^entry\/([\w-]+)$/, entryView], [/^roots$/, roots], [/^weekly$/, weekly], [/^people$/, people], [/^shared$/, shared],
    [/^shared\/([\w-]+)$/, sharedArchive], [/^settings$/, settings],
  ];

  var rendering = 0;
  var flash = null;
  function render() {
    var r = parse();
    var mine = ++rendering;
    say(flash || '');
    flash = null;
    if (!state.user) {
      drawNav('');
      return signin();
    }
    drawNav(r.path);
    for (var i = 0; i < routes.length; i++) {
      var m = r.path.match(routes[i][0]);
      if (m) {
        return Promise.resolve(routes[i][1](m[1], r.query)).then(function (h1) {
          if (mine === rendering && h1 && h1.focus && document.activeElement === document.body) h1.focus();
        }).catch(fail);
      }
    }
    location.hash = '#/';
  }
  window.addEventListener('hashchange', function () {
    render();
    window.scrollTo(0, 0);
  });

  function loadPeople(force) {
    if (state.people && !force) return Promise.resolve(state.people);
    return store.people().then(function (list) { state.people = list; return list; });
  }

  // ---------- sign in ----------
  function signin() {
    var h1 = page('Your family archive', 'Keep the stories, voices, photographs and wisdom of your family in one private place, and choose who receives each one, now or later.');
    var form = h('form', { class: 'app-card app-signin' });
    var email = h('input', { type: 'email', name: 'email', autocomplete: 'email', required: true });
    var name = h('input', { type: 'text', name: 'name', autocomplete: 'name' });
    add(form, [
      h('img', { class: 'app-signin__art', src: '/assets/illustrations/keepsake-box-800.jpg', width: 800, height: 534, alt: '' }),
      h('h2', null, store.mode === 'local' ? 'Try it on this device' : 'Sign in or create your archive'),
      field('Email', email, store.mode === 'local' ? 'Any address works in preview mode. Sign in as different addresses to see what each person would see.' : 'We will email you a link to sign in. No password to remember.'),
      field('Your name (optional)', name, 'Shown to the people you share with.'),
      h('div', { class: 'btn-row' }, button(store.mode === 'local' ? 'Open my archive' : 'Email me a sign-in link', null, 'btn', 'submit')),
    ]);
    if (store.google) {
      add(form, h('p', { class: 'app-or' }, h('a', { class: 'btn btn--ghost', href: store.googleUrl(returnTo) }, 'Continue with Google')));
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      store.signIn(email.value, name.value, returnTo).then(function (r) {
        if (r && r.sent) {
          form.textContent = '';
          add(form, [h('h2', null, 'Check your email'), h('p', null, 'We sent a sign-in link to ' + email.value.trim() + '. Open it on this device to continue. It may take a minute, and can land in spam.')]);
          return;
        }
        return start();
      }).catch(fail).then(function () { btn.disabled = false; });
    });
    add(view, form);
    if (store.mode === 'local') {
      store.accounts().then(function (list) {
        if (!list.length) return;
        var row = h('div', { class: 'app-accounts' }, h('h2', null, 'Accounts on this device'));
        list.forEach(function (u) {
          row.appendChild(button(u.name + ' (' + u.email + ')', function () {
            store.signIn(u.email).then(start).catch(fail);
          }, 'btn btn--ghost'));
        });
        add(view, row);
      });
    }
    add(view, h('section', { class: 'app-promise' }, h('h2', null, 'What we promise'), h('ul', null,
      h('li', null, 'Your archive is private. Nobody sees an entry unless you share it with them, and "Only me" stays private forever.'),
      h('li', null, 'You decide what is passed on, to whom, and when. Nothing is passed on while you are still visiting.'),
      h('li', null, 'You can download everything, or delete your account, at any time.'),
    )));
    return h1;
  }

  // ---------- home ----------
  function home() {
    var h1 = page('Welcome, ' + firstName(state.user.name) + '.');
    return Promise.all([store.entries(), store.elders(), store.sharedWithMe(), store.roots()]).then(function (r) {
      var entries = r[0];
      var elders = r[1];
      var sharedList = r[2];
      var keptRoots = hasRoots(r[3]) ? Art.clean(r[3]) : null;
      var deviceHasRoots = hasRoots(deviceRoots());
      var mine = entries.filter(function (e) { return e.createdBy === state.user.id || e.owner === state.user.id; });
      var files = mine.reduce(function (n, e) { return n + e.media.length; }, 0);
      add(view, h('div', { class: 'app-quick' },
        link('#/entry/new?kind=story', 'Write a story', 'btn'),
        link('#/entry/new?kind=story&record=audio', 'Record a voice note', 'btn btn--ghost'),
        link('#/entry/new?kind=memory', 'Add photographs or video', 'btn btn--ghost'),
      ));
      var grid = h('div', { class: 'app-grid' });
      var q = elders[0] ? core.question(elders[0].idx) : core.question(0);
      grid.appendChild(h('section', { class: 'app-card app-card--accent' },
        h('p', { class: 'eyebrow' }, elders[0] ? 'This week, for ' + elders[0].name : 'The weekly question'),
        h('h2', null, q.text),
        h('p', null, elders[0] ? 'Send it, then keep their answer here.' : 'One question a week to someone you love. In a year, their life in their own words.'),
        link('#/weekly', elders[0] ? 'Open the weekly question' : 'Start with someone you love', 'text-link'),
      ));
      grid.appendChild(h('section', { class: 'app-card' },
        h('p', { class: 'eyebrow' }, 'Your archive'),
        h('h2', null, mine.length ? plural(mine.length, 'entry', 'entries') + ', ' + plural(files, 'file') : 'Nothing kept yet'),
        h('p', null, mine.length ? 'Stories, wisdom, things for hard days and letters to the future.' : 'Start with one question, one photograph or one saying.'),
        link('#/archive', 'Open your archive', 'text-link'),
      ));
      grid.appendChild(h('section', { class: 'app-card' },
        h('p', { class: 'eyebrow' }, 'Shared with you'),
        h('h2', null, sharedList.length ? plural(sharedList.length, 'archive') : 'Nobody yet'),
        h('p', null, sharedList.length ? sharedList.map(function (s) { return s.ownerName; }).join(', ') : 'When someone adds you to their archive with this email address, it appears here.'),
        link('#/shared', 'See what is shared with you', 'text-link'),
      ));
      grid.appendChild(h('section', { class: 'app-card' },
        h('p', { class: 'eyebrow' }, 'Your roots'),
        h('h2', null, keptRoots ? plural(Art.places(Art.fromSaved(keptRoots)).length, 'place') + ' kept' : deviceHasRoots ? 'Ready to keep' : 'Not traced yet'),
        h('p', null, keptRoots ? 'The places your family has called home, drawn as a portrait.' : deviceHasRoots ? 'You made a roots portrait in this browser. Keep it in your archive.' : 'Draw the places your family has called home as roots, a tree, a river, rings or stars.'),
        link(keptRoots || deviceHasRoots ? '#/roots' : '/trace.html', keptRoots ? 'See your roots' : deviceHasRoots ? 'Keep your roots portrait' : 'Trace your roots', 'text-link'),
      ));
      add(view, grid);
      if (entries.length) {
        add(view, h('h2', { class: 'app-sub' }, 'Recently kept'));
        add(view, h('div', { class: 'app-list' }, entries.slice(0, 4).map(entryCard)));
      }
      return offerImport().then(function () { return h1; });
    });
  }

  // ---------- archive ----------
  function entryCard(e) {
    var kind = core.find(core.KINDS, e.kind);
    var counts = {};
    e.media.forEach(function (m) { counts[m.kind] = (counts[m.kind] || 0) + 1; });
    var names = { audio: 'voice note', video: 'video', photo: 'photograph', document: 'document' };
    var media = Object.keys(counts).map(function (k) { return plural(counts[k], names[k]); }).join(', ');
    return h('a', { class: 'app-entry', href: '#/entry/' + e.id },
      h('span', { class: 'eyebrow' }, kind ? kind.heading : ''),
      h('h3', null, e.title),
      e.body ? h('p', null, e.body.length > 160 ? e.body.slice(0, 157) + '…' : e.body) : null,
      h('span', { class: 'app-entry__meta' }, [e.teller ? 'Told by ' + e.teller : null, media || null, core.audienceLabel(e, state.people || []), core.formatDate(e.createdAt)].filter(Boolean).join(' · ')),
    );
  }

  function archive(_, query) {
    var h1 = page('My archive', 'Everything you have kept, and what others in your family have added to it.');
    var kind = query.get('kind') || '';
    return Promise.all([store.entries(), loadPeople()]).then(function (r) {
      var entries = r[0];
      var filters = h('div', { class: 'app-filters', role: 'group', 'aria-label': 'Show' });
      [{ id: '', heading: 'Everything' }].concat(core.KINDS).forEach(function (k) {
        var n = k.id ? entries.filter(function (e) { return e.kind === k.id; }).length : entries.length;
        filters.appendChild(h('a', { href: '#/archive' + (k.id ? '?kind=' + k.id : ''), 'aria-current': kind === k.id ? 'true' : null }, k.heading + ' (' + n + ')'));
      });
      add(view, h('div', { class: 'app-toolbar' }, link('#/entry/new' + (kind ? '?kind=' + kind : ''), 'Add to the archive', 'btn'), entries.length ? button('Print as a book', function () { window.print(); }, 'btn btn--ghost') : null));
      add(view, filters);
      var shown = kind ? entries.filter(function (e) { return e.kind === kind; }) : entries;
      if (!shown.length) {
        add(view, h('p', { class: 'empty-state' }, entries.length ? 'Nothing of this kind yet.' : 'Nothing kept yet. Start with one question, one photograph or one saying.'));
      } else {
        add(view, h('div', { class: 'app-list' }, shown.map(entryCard)));
      }
      return h1;
    });
  }

  // ---------- one entry ----------
  function mediaBlock(m) {
    var wrap = h('figure', { class: 'app-media app-media--' + m.kind });
    var caption = h('figcaption', null, m.name + ' · ' + core.formatBytes(m.size));
    store.mediaUrl(m).then(function (url) {
      var el;
      if (m.kind === 'audio') el = h('audio', { controls: true, preload: 'metadata', src: url, 'aria-label': 'Voice note: ' + m.name });
      else if (m.kind === 'video') el = h('video', { controls: true, preload: 'metadata', playsinline: true, src: url, 'aria-label': 'Video: ' + m.name });
      else if (m.kind === 'photo') el = h('img', { src: url, alt: m.name, loading: 'lazy' });
      else el = h('a', { class: 'app-doc', href: url, target: '_blank', rel: 'noopener', download: m.name }, 'Open ' + m.name);
      wrap.insertBefore(el, caption);
    }).catch(function () { wrap.insertBefore(h('p', null, 'This file could not be loaded.'), caption); });
    wrap.appendChild(caption);
    return wrap;
  }

  function entryView(id) {
    return Promise.all([store.entry(id), loadPeople()]).then(function (r) {
      var e = r[0];
      if (!e) {
        var h0 = page('Not found', 'This entry does not exist, or it has not been shared with you.');
        add(view, link('#/', 'Back to your archive', 'text-link'));
        return h0;
      }
      var kind = core.find(core.KINDS, e.kind);
      var h1 = page(e.title);
      var mineArchive = e.owner === state.user.id;
      var head = view.querySelector('.app-head');
      head.insertBefore(h('p', { class: 'eyebrow' }, kind ? kind.heading : ''), h1);
      add(head, h('p', { class: 'app-entry__meta' }, [
        e.teller ? 'Told by ' + e.teller : null,
        e.place ? 'In ' + e.place : null,
        e.forWhom ? 'For ' + e.forWhom : null,
        e.openWhen ? 'Open ' + e.openWhen : null,
        mineArchive ? core.audienceLabel(e, state.people) : null,
        'Kept on ' + core.formatDate(e.createdAt),
      ].filter(Boolean).join(' · ')));
      if (e.prompt) add(view, h('p', { class: 'app-prompt' }, e.prompt));
      if (e.body) add(view, h('div', { class: 'app-body' }, e.body.split(/\n{2,}/).map(function (p) { return h('p', null, p); })));
      if (e.media.length) add(view, h('div', { class: 'app-media-list' }, e.media.map(mediaBlock)));
      var actions = h('div', { class: 'btn-row' });
      if (core.canEdit(e, state.user.id)) {
        add(actions, [
          link('#/entry/' + e.id + '/edit', 'Edit', 'btn'),
          button('Delete', function () {
            if (!confirm('Delete "' + e.title + '" and its files? This cannot be undone.')) return;
            store.deleteEntry(e.id).then(function () { location.hash = mineArchive ? '#/archive' : '#/shared/' + e.owner; }).catch(fail);
          }, 'btn btn--ghost'),
        ]);
      }
      add(actions, link(mineArchive ? '#/archive' : '#/shared/' + e.owner, 'Back', 'text-link'));
      add(view, actions);
      return h1;
    });
  }

  // ---------- add or edit an entry ----------
  function editor(id, query) {
    var load = id ? store.entry(id) : Promise.resolve(null);
    return Promise.all([load, loadPeople(), store.sharedWithMe()]).then(function (r) {
      var existing = r[0];
      if (id && (!existing || !core.canEdit(existing, state.user.id))) {
        var h0 = page('Not available', 'Only the person who added this can change it.');
        return h0;
      }
      var owner = existing ? existing.owner : (query.get('owner') || state.user.id);
      var forOther = owner !== state.user.id;
      var sharedRow = r[2].filter(function (s) { return s.owner === owner; })[0];
      if (forOther && (!sharedRow || sharedRow.role !== 'family_edit')) {
        return page('Not available', 'You can only view this archive.');
      }
      var e = existing || { kind: query.get('kind') || 'story', title: '', body: '', prompt: query.get('prompt') || '', teller: query.get('teller') || '', audience: forOther ? 'family' : 'private', audiencePeople: [], media: [] };
      var h1 = page(existing ? 'Edit "' + e.title + '"' : forOther ? 'Add to ' + sharedRow.ownerName + '\'s archive' : 'Add to your archive');
      var form = h('form', { class: 'app-card app-editor' });
      var kind = options(h('select', { name: 'kind' }), core.KINDS, e.kind);
      var prompt = h('select', { name: 'prompt' });
      function fillPrompts() {
        prompt.textContent = '';
        prompt.appendChild(h('option', { value: '' }, 'No question, I will write freely'));
        var list = core.QUESTIONS.filter(function (q) { return q[0] === kind.value; }).map(function (q) { return q[1]; });
        if (e.prompt && list.indexOf(e.prompt) === -1) list.unshift(e.prompt);
        list.forEach(function (t) { var o = h('option', { value: t }, t); if (t === e.prompt) o.selected = true; prompt.appendChild(o); });
      }
      fillPrompts();
      var title = h('input', { name: 'title', type: 'text', required: true, maxlength: '120', value: e.title });
      var body = h('textarea', { name: 'body', rows: '10', maxlength: '50000' });
      body.value = e.body || '';
      var teller = h('input', { name: 'teller', type: 'text', value: e.teller || '' });
      var place = h('input', { name: 'place', type: 'text', value: e.place || '' });
      var forWhom = h('input', { name: 'forWhom', type: 'text', value: e.forWhom || '' });
      var openWhen = h('input', { name: 'openWhen', type: 'text', value: e.openWhen || '', placeholder: 'On your wedding day, when you turn 18…' });
      var letterOnly = field('When should it be opened? (optional)', openWhen, 'A note for the reader. To hold it back until a date, choose that below.');
      kind.addEventListener('change', function () { e.prompt = ''; fillPrompts(); letterOnly.hidden = kind.value !== 'letter'; });
      letterOnly.hidden = e.kind !== 'letter';

      add(form, h('div', { class: 'app-form-grid' },
        field('What is it?', kind),
        field('A question to answer (optional)', prompt),
        field('Title', title, null, true),
        field('In their words', body, 'Write it as it was told. You can also attach a voice note or video below.', true),
        field('Who told it? (optional)', teller),
        field('Where does it come from? (optional)', place),
        field('Who is it for? (optional)', forWhom),
        letterOnly,
      ));

      // Who can see it
      var audience = h('fieldset', { class: 'app-audience' }, h('legend', null, 'Who can see it'));
      var choices = forOther
        ? [{ id: 'private', label: 'Only me and ' + sharedRow.ownerName }, { id: 'family', label: sharedRow.ownerName + '\'s family' }]
        : core.AUDIENCES;
      var picked = e.audience;
      var peopleBox = h('div', { class: 'app-audience__people' });
      var dateInput = h('input', { type: 'date', name: 'releaseAt', value: e.releaseAt ? String(e.releaseAt).slice(0, 10) : '' });
      var dateField = field('Opens on', dateInput, 'They will see it from this day onwards.');
      var hints = {
        private: 'Stays private, even after your archive is passed on.',
        family: 'Everyone you have added as family. Beloved ones and legacy contacts receive it when your archive is passed on.',
        people: 'Only the people you tick.',
        date: 'Only the people you tick, and only from the day you choose.',
        passed: 'Nobody sees it until your archive is passed on. Then the people you tick, or everyone on your list if you tick nobody.',
      };
      choices.forEach(function (a) {
        var input = h('input', { type: 'radio', name: 'audience', value: a.id });
        input.checked = a.id === picked;
        input.addEventListener('change', function () { picked = a.id; sync(); });
        audience.appendChild(h('label', { class: 'app-radio' }, input, h('span', null, h('strong', null, a.label), forOther ? null : h('small', null, hints[a.id]))));
      });
      if (!forOther) {
        if (!state.people.length) {
          peopleBox.appendChild(h('p', { class: 'field__hint' }, 'You have not added anyone yet. ', link('#/people', 'Add the people you share with'), ' first.'));
        }
        state.people.forEach(function (p) {
          var box = h('input', { type: 'checkbox', name: 'audiencePeople', value: p.id });
          box.checked = e.audiencePeople.indexOf(p.id) !== -1;
          peopleBox.appendChild(h('label', { class: 'app-check' }, box, ' ' + p.name + ' (' + core.find(core.ROLES, p.role).label.toLowerCase() + ')'));
        });
        add(audience, [peopleBox, dateField]);
      }
      function sync() {
        peopleBox.hidden = ['people', 'date', 'passed'].indexOf(picked) === -1;
        dateField.hidden = picked !== 'date';
      }
      sync();
      add(form, audience);

      // Files
      var pending = [];
      var removed = [];
      var fileList = h('ul', { class: 'app-files' });
      function drawFiles() {
        fileList.textContent = '';
        e.media.filter(function (m) { return removed.indexOf(m) === -1; }).forEach(function (m) {
          fileList.appendChild(h('li', null, m.name + ' · ' + core.formatBytes(m.size) + ' ', button('Remove', function () { removed.push(m); drawFiles(); }, 'btn btn--ghost btn--small')));
        });
        pending.forEach(function (f, i) {
          fileList.appendChild(h('li', null, (f.name || 'Recording') + ' · ' + core.formatBytes(f.size) + ' (not saved yet) ', button('Remove', function () { pending.splice(i, 1); drawFiles(); }, 'btn btn--ghost btn--small')));
        });
      }
      function addFiles(files) {
        Array.prototype.forEach.call(files, function (f) {
          if (f.size > MAX_BYTES) { say(f.name + ' is larger than ' + core.formatBytes(MAX_BYTES) + ', so it cannot be added yet.', true); return; }
          pending.push(f);
        });
        drawFiles();
      }
      var picker = h('input', { type: 'file', multiple: true, accept: 'audio/*,video/*,image/*,application/pdf,.doc,.docx,.txt', onchange: function () { addFiles(picker.files); picker.value = ''; } });
      var recordStatus = h('p', { class: 'field__hint', 'aria-live': 'polite' });
      var preview = h('div', { class: 'app-record__preview' });
      var recorder = null;
      function recordButton(what) {
        var label = what === 'audio' ? 'Record a voice note' : 'Record a video';
        var b = button(label, function () {
          if (recorder) { recorder.stop(); return; }
          if (!navigator.mediaDevices || !window.MediaRecorder) { say('Recording is not supported in this browser. You can attach a file instead.', true); return; }
          navigator.mediaDevices.getUserMedia(what === 'audio' ? { audio: true } : { audio: true, video: true }).then(function (stream) {
            var chunks = [];
            recorder = new MediaRecorder(stream);
            if (what === 'video') {
              var live = h('video', { muted: true, playsinline: true, autoplay: true, class: 'app-record__live' });
              live.srcObject = stream;
              preview.textContent = '';
              preview.appendChild(live);
            }
            recorder.ondataavailable = function (ev) { if (ev.data.size) chunks.push(ev.data); };
            recorder.onstop = function () {
              stream.getTracks().forEach(function (t) { t.stop(); });
              var type = recorder.mimeType || (what === 'audio' ? 'audio/webm' : 'video/webm');
              var ext = /mp4/.test(type) ? (what === 'audio' ? 'm4a' : 'mp4') : /ogg/.test(type) ? 'ogg' : 'webm';
              var blob = new Blob(chunks, { type: type });
              var file;
              try { file = new File([blob], (what === 'audio' ? 'voice-note-' : 'video-') + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.' + ext, { type: type }); } catch (err) { file = blob; file.name = 'recording.' + ext; }
              recorder = null;
              b.textContent = label;
              preview.textContent = '';
              var url = URL.createObjectURL(blob);
              preview.appendChild(h(what === 'audio' ? 'audio' : 'video', { controls: true, src: url, 'aria-label': 'Your recording' }));
              recordStatus.textContent = 'Recorded. It will be saved with this entry.';
              addFiles([file]);
            };
            recorder.start();
            b.textContent = 'Stop recording';
            recordStatus.textContent = 'Recording… speak whenever you are ready.';
          }).catch(function () { say('We could not use your ' + (what === 'audio' ? 'microphone' : 'camera') + '. Check the browser permission, or attach a file instead.', true); });
        }, 'btn btn--ghost');
        b.setAttribute('data-record', what);
        return b;
      }
      add(form, h('fieldset', { class: 'app-attach' },
        h('legend', null, 'Voices, videos, photographs and documents'),
        h('p', { class: 'field__hint' }, 'Old certificates, letters, deeds and photographs of them count too. Up to ' + core.formatBytes(MAX_BYTES) + ' each.'),
        h('div', { class: 'btn-row' }, recordButton('audio'), recordButton('video'), h('label', { class: 'btn btn--ghost app-upload' }, 'Attach files', picker)),
        recordStatus, preview, fileList,
      ));
      drawFiles();

      add(form, h('div', { class: 'btn-row' }, button(existing ? 'Save changes' : 'Keep it', null, 'btn', 'submit'), link(existing ? '#/entry/' + existing.id : forOther ? '#/shared/' + owner : '#/archive', 'Cancel', 'text-link')));
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (recorder) { say('Stop the recording first.', true); return; }
        var submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        var chosen = Array.prototype.map.call(form.querySelectorAll('[name="audiencePeople"]:checked'), function (c) { return c.value; });
        store.saveEntry({
          id: existing && existing.id, owner: owner, kind: kind.value, title: title.value, body: body.value, prompt: prompt.value,
          teller: teller.value, place: place.value, forWhom: forWhom.value, openWhen: kind.value === 'letter' ? openWhen.value : '',
          audience: picked, audiencePeople: picked === 'family' || picked === 'private' ? [] : chosen,
          releaseAt: picked === 'date' && dateInput.value ? new Date(dateInput.value + 'T00:00:00').toISOString() : null,
        }).then(function (saved) {
          var steps = removed.map(function (m) { return function () { return store.deleteMedia(m); }; })
            .concat(pending.map(function (f, i) {
              return function () { say('Saving file ' + (i + 1) + ' of ' + pending.length + '…'); return store.addMedia(saved, f, f.name); };
            }));
          return steps.reduce(function (p, s) { return p.then(s); }, Promise.resolve()).then(function () {
            say('Kept.');
            location.hash = '#/entry/' + saved.id;
          });
        }).catch(fail).then(function () { submit.disabled = false; });
      });
      add(view, form);
      if (query.get('record') === 'audio') setTimeout(function () { var b = form.querySelector('[data-record="audio"]'); if (b) b.focus(); }, 0);
      return h1;
    });
  }

  // ---------- roots portrait ----------
  var ROOTS_DEVICE = 'tch-roots';
  function deviceRoots() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(ROOTS_DEVICE) || 'null'); } catch (e) {}
    return saved ? Art.clean(saved) : null;
  }
  function hasRoots(saved) { return !!saved && Art.places(Art.fromSaved(saved)).length > 0; }
  function drawn(saved) {
    var s = Art.clean(saved);
    return JSON.stringify([s.name.trim(), s.mode, s.style, s.palette, s.format, Art.places(Art.fromSaved(s))]);
  }
  function sameRoots(a, b) { return drawn(a) === drawn(b); }

  function portrait(saved) {
    var p = Art.paletteById(saved.palette);
    var data = Art.fromSaved(saved);
    var label = 'Roots portrait: ' + Art.places(data).map(function (g) { return g.label + ', ' + g.place; }).join('; ') + '.';
    var box = h('div', { class: 'app-roots__art', role: 'img', 'aria-label': label, 'data-format': saved.format });
    box.innerHTML = Art.render(data, p.c || Art.siteColours(), { style: saved.style, format: saved.format, idPrefix: 'app-roots' });
    return box;
  }

  function openOnRootsPage(saved) {
    try { localStorage.setItem(ROOTS_DEVICE, JSON.stringify(saved)); } catch (e) {}
    location.href = '/trace.html';
  }

  function roots() {
    var h1 = page('My roots', 'The places your family has called home, drawn as a portrait. It is kept in your archive, where only you can see it, so you can open it on any device.');
    return store.roots().then(function (kept) {
      kept = hasRoots(kept) ? Art.clean(kept) : null;
      var device = deviceRoots();
      device = hasRoots(device) ? device : null;
      var differs = device && (!kept || !sameRoots(kept, device));

      function keep() {
        return store.saveRoots(device).then(function () { flash = 'Your roots portrait is kept in your archive.'; render(); }).catch(fail);
      }

      if (kept) {
        var section = h('section', { class: 'app-roots' }, portrait(kept));
        add(section, h('div', { class: 'app-roots__side' },
          h('p', { class: 'eyebrow' }, 'Kept in your archive'),
          h('h2', null, plural(Art.places(Art.fromSaved(kept)).length, 'place')),
          h('p', null, 'Change the places, the style or the colours on the roots page, then come back here to keep the new version.'),
          h('div', { class: 'btn-row' },
            button('Change it on the roots page', function () {
              if (differs && !window.confirm('This browser has a different portrait. Open the one from your archive instead?')) return;
              openOnRootsPage(kept);
            }),
          ),
        ));
        add(view, section);
      }
      if (differs) {
        var card = h('section', { class: 'app-card app-roots__device' },
          h('p', { class: 'eyebrow' }, kept ? 'A newer portrait on this device' : 'On this device'),
          h('h2', null, kept ? 'This browser has a different version' : 'Keep the portrait you made'),
          h('p', null, kept ? 'Keep it to replace the one in your archive.' : 'You made this on the roots page in this browser. Keep it in your archive to open it anywhere.'),
          portrait(device),
          h('div', { class: 'btn-row' }, button(kept ? 'Replace with this version' : 'Keep in my archive', function () {
            if (kept && !window.confirm('Replace the portrait in your archive with this one?')) return;
            keep();
          })),
        );
        add(view, card);
      }
      if (!kept && !device) {
        add(view, h('section', { class: 'app-card' },
          h('h2', null, 'You have not traced your roots yet'),
          h('p', null, 'Add the places your family has called home, from you back to the oldest generation you know, and choose how to draw them: roots, a tree, a river, tree rings or a sky of stars.'),
          link('/trace.html', 'Trace your roots', 'btn'),
        ));
      }
      return h1;
    });
  }

  // ---------- weekly question ----------
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function weekly(_, query) {
    var h1 = page('The weekly question', 'One question a week to a parent, grandparent or anyone you love. They reply with a voice note whenever they like; you keep it here. In a year, their life in their own words.');
    return store.elders().then(function (elders) {
      var current = elders.filter(function (e) { return e.id === query.get('elder'); })[0] || elders[0];
      if (elders.length > 1) {
        add(view, h('div', { class: 'app-filters', role: 'group', 'aria-label': 'Asking' }, elders.map(function (e) {
          return h('a', { href: '#/weekly?elder=' + e.id, 'aria-current': e === current ? 'true' : null }, e.name);
        })));
      }
      if (current) add(view, questionCard(current));
      add(view, elderForm(!current));
      return h1;
    });
  }

  function questionCard(elder) {
    var q = core.question(elder.idx);
    var kind = core.find(core.KINDS, q.kind);
    var from = elder.signAs || firstName(state.user.name);
    var text = core.message(elder.name, q, from);
    var card = h('section', { class: 'app-card app-card--accent app-weekly' });
    var actions = h('div', { class: 'btn-row' });
    if (elder.phone) add(actions, h('a', { class: 'btn', href: core.whatsappLink(elder.phone, text), target: '_blank', rel: 'noopener', onclick: function () { store.saveElder({ id: elder.id, askedAt: new Date().toISOString() }).then(function () { render(); }); } }, 'Send on WhatsApp'));
    add(actions, [
      button('Copy the message', function () {
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { say('Copied. Paste it into any message.'); }, function () { say('Select the message above and copy it.'); });
        store.saveElder({ id: elder.id, askedAt: new Date().toISOString() });
      }, 'btn btn--ghost'),
      link('#/entry/new?kind=' + q.kind + '&prompt=' + encodeURIComponent(q.text) + '&teller=' + encodeURIComponent(elder.name) + '&record=audio', 'Keep their answer', 'btn btn--ghost'),
    ]);
    add(card, [
      h('p', { class: 'eyebrow' }, 'Week ' + (elder.idx + 1) + ' for ' + elder.name + (kind ? ' · ' + kind.heading : '')),
      h('h2', null, q.text),
      h('pre', { class: 'app-message' }, text),
      elder.askedAt ? h('p', { class: 'field__hint' }, 'Asked on ' + core.formatDate(elder.askedAt) + '.') : null,
      actions,
      h('div', { class: 'btn-row' },
        button('They answered, next question', function () { store.saveElder({ id: elder.id, idx: elder.idx + 1, answered: elder.answered + 1, askedAt: null }).then(function () { render(); }).catch(fail); }, 'btn btn--ghost btn--small'),
        button('Skip this one', function () { store.saveElder({ id: elder.id, idx: elder.idx + 1, askedAt: null }).then(function () { render(); }).catch(fail); }, 'btn btn--ghost btn--small'),
        button('Add a weekly reminder to my calendar', function () {
          download('weekly-question-' + core.safeFileName(elder.name) + '.ics', core.reminder(elder, new Date(), returnTo + '#/weekly'), 'text/calendar');
        }, 'btn btn--ghost btn--small'),
        button('Stop asking ' + elder.name, function () {
          if (confirm('Stop the weekly question for ' + elder.name + '? What you kept stays in your archive.')) store.deleteElder(elder.id).then(function () { location.hash = '#/weekly'; render(); }).catch(fail);
        }, 'btn btn--ghost btn--small'),
      ),
      h('p', { class: 'field__hint' }, plural(elder.answered, 'answer') + ' kept so far, every ' + DAYS[elder.day] + '.'),
    ]);
    return card;
  }

  function elderForm(open) {
    var form = h('form', { class: 'app-card' });
    var name = h('input', { name: 'name', required: true, maxlength: '40' });
    var relation = h('input', { name: 'relation', placeholder: 'Nani, Dad, my aunt…' });
    var phone = h('input', { name: 'phone', type: 'tel', autocomplete: 'off' });
    var day = options(h('select', { name: 'day' }), DAYS.map(function (d, i) { return { id: String(i), label: d }; }), String(new Date().getDay()));
    var signAs = h('input', { name: 'signAs', value: firstName(state.user.name) });
    add(form, [
      h('h2', null, open ? 'Who would you like to ask?' : 'Ask someone else too'),
      h('div', { class: 'app-form-grid' },
        field('Their name', name), field('Who are they to you? (optional)', relation),
        field('Their WhatsApp number (optional)', phone, 'With the country code. It stays in your archive and is only used to open WhatsApp on your phone.'),
        field('Which day?', day), field('Sign the message as', signAs),
      ),
      h('div', { class: 'btn-row' }, button('Start the weekly question', null, 'btn', 'submit')),
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      store.saveElder({ name: name.value.trim(), relation: relation.value.trim(), phone: phone.value.trim(), day: Number(day.value), signAs: signAs.value.trim() })
        .then(function (e) { location.hash = '#/weekly?elder=' + e.id; }).catch(fail);
    });
    return open ? form : h('details', { class: 'app-more' }, h('summary', null, 'Ask someone else too'), form);
  }

  // ---------- people ----------
  function inviteText(p) {
    return 'I have added you to my family archive on The Cultured Human, where I keep our stories, voices and photographs. ' +
      'Sign in with ' + p.email + ' at ' + returnTo + ' to see what I share with you.';
  }

  function people() {
    var h1 = page('My people', 'The people you share with. They see only what you choose, and only after they sign in with the email address you add here.');
    return loadPeople(true).then(function (list) {
      if (!list.length) add(view, h('p', { class: 'empty-state' }, 'Nobody yet. Add family, your beloved ones, and at least one legacy contact who can confirm when it is time to pass your archive on.'));
      add(view, h('ul', { class: 'app-people' }, list.map(function (p) {
        var role = core.find(core.ROLES, p.role);
        return h('li', { class: 'app-card app-person' },
          h('h3', null, p.name),
          h('p', null, role.label + ' · ' + p.email),
          h('p', { class: 'field__hint' }, p.userId ? 'Has signed in and can see what you share.' : 'Has not signed in yet.'),
          h('div', { class: 'btn-row' },
            h('a', { class: 'btn btn--small', href: 'mailto:' + p.email + '?subject=' + encodeURIComponent('Our family archive') + '&body=' + encodeURIComponent(inviteText(p)) }, 'Invite by email'),
            h('a', { class: 'btn btn--ghost btn--small', href: 'https://wa.me/?text=' + encodeURIComponent(inviteText(p)), target: '_blank', rel: 'noopener' }, 'Invite on WhatsApp'),
            button('Change', function () { form.replaceWith(personForm(p)); }, 'btn btn--ghost btn--small'),
            button('Remove', function () {
              if (confirm('Remove ' + p.name + '? They will no longer see anything you shared with them.')) store.deletePerson(p.id).then(function () { render(); }).catch(fail);
            }, 'btn btn--ghost btn--small'),
          ),
        );
      })));
      var form = personForm(null);
      add(view, form);
      add(view, h('section', { class: 'app-roles' }, h('h2', null, 'What each choice means'), h('dl', null, core.ROLES.map(function (r) { return [h('dt', null, r.label), h('dd', null, r.hint)]; }))));
      return h1;
    });
  }

  function personForm(p) {
    var form = h('form', { class: 'app-card' });
    var name = h('input', { name: 'name', required: true, maxlength: '80', value: p ? p.name : '' });
    var email = h('input', { name: 'email', type: 'email', required: true, value: p ? p.email : '' });
    var role = options(h('select', { name: 'role' }), core.ROLES, p ? p.role : 'family_view');
    var hint = h('p', { class: 'field__hint' });
    function syncHint() { hint.textContent = core.find(core.ROLES, role.value).hint; }
    role.addEventListener('change', syncHint);
    syncHint();
    add(form, [
      h('h2', null, p ? 'Change ' + p.name : 'Add someone'),
      h('div', { class: 'app-form-grid' }, field('Name', name), field('Email', email, 'They sign in with this address to see what you share.'), field('How are they connected?', role), hint),
      h('div', { class: 'btn-row' }, button(p ? 'Save' : 'Add them', null, 'btn', 'submit'), p ? button('Cancel', function () { render(); }, 'btn btn--ghost') : null),
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      store.savePerson({ id: p && p.id, name: name.value, email: email.value, role: role.value }).then(function (saved) {
        state.people = null;
        say(saved.name + ' is on your list. Send them an invitation so they know to sign in.');
        return render();
      }).catch(fail);
    });
    return form;
  }

  // ---------- shared with me ----------
  var ROLE_SENTENCE = {
    family_edit: 'You are family, and can add to it.',
    family_view: 'You are family.',
    beloved: 'You are one of their beloved ones.',
    legacy: 'You are their legacy contact.',
  };

  function shared() {
    var h1 = page('Shared with me', 'Archives other people have shared with you. You see only what they chose to share.');
    return store.sharedWithMe().then(function (list) {
      if (!list.length) add(view, h('p', { class: 'empty-state' }, 'Nothing yet. When someone adds ' + state.user.email + ' to their archive, it appears here.'));
      add(view, h('div', { class: 'app-grid' }, list.map(function (s) {
        var passed = s.legacy && s.legacy.state === 'passed';
        return h('a', { class: 'app-card app-shared', href: '#/shared/' + s.owner },
          h('p', { class: 'eyebrow' }, passed ? 'Passed on' : 'Shared with you'),
          h('h2', null, s.ownerName + '\'s archive'),
          h('p', null, ROLE_SENTENCE[s.role]),
        );
      })));
      return h1;
    });
  }

  function legacyPanel(s) {
    var l = s.legacy || { state: 'active' };
    var panel = h('section', { class: 'app-card app-legacy' }, h('h2', null, 'As ' + firstName(s.ownerName) + '\'s legacy contact'));
    var texts = {
      active: firstName(s.ownerName) + ' has asked you to confirm when it is time to pass their archive on. If they die, tell us here. Nothing is passed on straight away: we wait, and if ' + firstName(s.ownerName) + ' signs in during that time, it is cancelled.',
      checking: firstName(s.ownerName) + ' has not visited for a while, and we are sending them reminders.',
      asking: firstName(s.ownerName) + ' has not answered our reminders. If you know they have died, please confirm it here.',
      reported: 'Thank you for telling us. The archive will be passed on ' + (l.waitEndsAt ? 'on ' + core.formatDate(l.waitEndsAt) : 'soon') + ', unless ' + firstName(s.ownerName) + ' signs in before then.',
      passed: 'This archive was passed on' + (l.passedAt ? ' on ' + core.formatDate(l.passedAt) : '') + '. Everyone it was left for can now see it.',
    };
    add(panel, h('p', null, texts[l.state] || texts.active));
    if (l.state === 'active' || l.state === 'checking' || l.state === 'asking') {
      add(panel, button('Tell us ' + firstName(s.ownerName) + ' has died', function () {
        if (!confirm('Report that ' + s.ownerName + ' has died? Their archive will be passed on after the waiting period, unless they sign in first.')) return;
        store.reportPassing(s.owner).then(function () { render(); }).catch(fail);
      }, 'btn btn--ghost'));
    }
    if (l.state === 'reported' && store.skipWaiting) {
      add(panel, button('Preview only: skip the waiting period', function () { store.skipWaiting(s.owner).then(function () { render(); }).catch(fail); }, 'btn btn--ghost btn--small'));
    }
    return panel;
  }

  function sharedArchive(owner) {
    return store.sharedWithMe().then(function (list) {
      var s = list.filter(function (x) { return x.owner === owner; })[0];
      if (!s) return page('Not shared with you', 'This archive has not been shared with ' + state.user.email + '.');
      var h1 = page(s.ownerName + '\'s archive', ROLE_SENTENCE[s.role]);
      if (s.role === 'legacy') add(view, legacyPanel(s));
      if (s.role === 'family_edit') add(view, h('div', { class: 'app-toolbar' }, link('#/entry/new?owner=' + owner, 'Add to ' + firstName(s.ownerName) + '\'s archive', 'btn')));
      return store.entries(owner).then(function (entries) {
        if (!entries.length) add(view, h('p', { class: 'empty-state' }, s.role === 'beloved' || s.role === 'legacy' ? 'Nothing has been left for you to see yet. What ' + firstName(s.ownerName) + ' leaves for you appears here on the day they chose, or when their archive is passed on.' : 'Nothing has been shared with you yet.'));
        else add(view, h('div', { class: 'app-list' }, entries.map(entryCard)));
        return h1;
      });
    });
  }

  // ---------- settings ----------
  function settings() {
    var h1 = page('Settings');
    return store.legacy().then(function (l) {
      l = l || { quietMonths: 12, waitDays: 30, state: 'active' };
      var profile = h('form', { class: 'app-card' });
      var name = h('input', { name: 'name', required: true, maxlength: '80', value: state.user.name });
      add(profile, [h('h2', null, 'You'), field('Your name', name, 'Shown to the people you share with.'), h('p', null, 'Signed in as ' + state.user.email + '.'), h('div', { class: 'btn-row' }, button('Save', null, 'btn', 'submit'), button('Sign out', function () { store.signOut().then(signedOut); }, 'btn btn--ghost'))]);
      profile.addEventListener('submit', function (ev) {
        ev.preventDefault();
        store.saveProfile({ name: name.value }).then(function (u) { state.user.name = u.name; say('Saved.'); }).catch(fail);
      });

      var legacy = h('form', { class: 'app-card' });
      var quiet = options(h('select', { name: 'quietMonths' }), [3, 6, 12, 18, 24, 36].map(function (n) { return { id: String(n), label: plural(n, 'month') }; }), String(l.quietMonths));
      var wait = options(h('select', { name: 'waitDays' }), [7, 14, 30, 60, 90].map(function (n) { return { id: String(n), label: plural(n, 'day') }; }), String(l.waitDays));
      add(legacy, [
        h('h2', null, 'Passing your archive on'),
        h('p', null, 'Choose who receives each entry when you add it. Your archive is passed on only when a legacy contact tells us you have died and you do not sign in during the waiting period, or when you have been silent for a long time and a legacy contact confirms it.'),
        h('div', { class: 'app-form-grid' },
          field('If I have not visited for', quiet, 'We send you reminders, then ask your legacy contacts.'),
          field('Wait this long after a report', wait, 'Signing in at any point cancels it.'),
        ),
        h('div', { class: 'btn-row' }, button('Save', null, 'btn', 'submit'), link('#/people', 'Choose your legacy contacts', 'text-link')),
      ]);
      legacy.addEventListener('submit', function (ev) {
        ev.preventDefault();
        store.saveLegacy({ quietMonths: quiet.value, waitDays: wait.value }).then(function () { say('Saved.'); }).catch(fail);
      });

      var data = h('section', { class: 'app-card' }, h('h2', null, 'Your data'),
        h('p', null, 'Download a copy of everything in your archive, including files, as one file you can keep anywhere.'),
        h('div', { class: 'btn-row' }, button('Download a copy', exportAll, 'btn btn--ghost')),
        h('h3', null, 'Delete your account'),
        h('p', null, 'This deletes your archive, every file in it, and what you added to other people\'s archives. It cannot be undone.'),
        h('div', { class: 'btn-row' }, button('Delete my account', function () {
          var typed = prompt('Type DELETE to delete your account and everything in it.');
          if (typed !== 'DELETE') return;
          store.deleteAccount().then(function () { flash = 'Your account and archive have been deleted.'; return signedOut(); }).catch(fail);
        }, 'btn btn--ghost')),
      );
      add(view, [profile, legacy, data]);
      return h1;
    });
  }

  function toDataUrl(url) {
    return fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
      return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { resolve(null); };
        reader.readAsDataURL(blob);
      });
    });
  }

  function exportAll() {
    say('Preparing your copy…');
    Promise.all([store.entries(), loadPeople(true), store.elders(), store.legacy()]).then(function (r) {
      var entries = r[0].filter(function (e) { return e.owner === state.user.id; });
      var media = [];
      entries.forEach(function (e) { e.media.forEach(function (m) { media.push(m); }); });
      return media.reduce(function (p, m, i) {
        return p.then(function () {
          say('Adding file ' + (i + 1) + ' of ' + media.length + '…');
          return store.mediaUrl(m).then(toDataUrl).then(function (d) { m.data = d; }, function () { m.data = null; });
        });
      }, Promise.resolve()).then(function () {
        download('family-archive-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({
          format: 'the-cultured-human-family-archive', version: 2, exportedAt: new Date().toISOString(),
          owner: { name: state.user.name, email: state.user.email }, legacy: r[3], people: r[1], weekly: r[2], entries: entries,
        }, null, 1), 'application/json');
        say('Your copy has been downloaded.');
      });
    }).catch(fail);
  }

  // ---------- bring over the archive kept on this device before accounts ----------
  function readOldArchive() {
    var list = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
    return list.then(function (dbs) {
      if (!dbs.some(function (d) { return d.name === 'tch-archive'; })) return [];
      return new Promise(function (resolve) {
        var req = indexedDB.open('tch-archive', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('entries', { keyPath: 'id' }); };
        req.onerror = function () { resolve([]); };
        req.onsuccess = function () {
          try {
            var r = req.result.transaction('entries', 'readonly').objectStore('entries').getAll();
            r.onsuccess = function () { resolve(r.result || []); };
            r.onerror = function () { resolve([]); };
          } catch (e) { resolve([]); }
        };
      });
    }).catch(function () { return []; });
  }

  function offerImport() {
    var done = false;
    try { done = localStorage.getItem('tch-imported') === '1'; } catch (e) {}
    if (done) return Promise.resolve();
    var weeklyOld = null;
    try { weeklyOld = JSON.parse(localStorage.getItem('tch-weekly') || 'null'); } catch (e) {}
    var elders = weeklyOld && Array.isArray(weeklyOld.elders) ? weeklyOld.elders : [];
    return readOldArchive().then(function (old) {
      if (!old.length && !elders.length) return;
      var card = h('section', { class: 'app-card app-import' },
        h('h2', null, 'Bring over what you kept on this device'),
        h('p', null, 'Before accounts, this browser kept ' + [old.length ? plural(old.length, 'archive entry', 'archive entries') : null, elders.length ? plural(elders.length, 'person', 'people') + ' you ask the weekly question' : null].filter(Boolean).join(' and ') + '. Add them to your archive? They will be private until you share them.'),
      );
      var row = h('div', { class: 'btn-row' });
      add(row, [
        button('Bring them over', function () {
          row.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
          importOld(old, elders, weeklyOld && weeklyOld.from).then(function () {
            try { localStorage.setItem('tch-imported', '1'); } catch (e) {}
            say('Brought over. Nothing was deleted from this device.');
            card.remove();
          }).catch(fail);
        }),
        button('Not now', function () { try { localStorage.setItem('tch-imported', '1'); } catch (e) {} card.remove(); }, 'btn btn--ghost'),
      ]);
      add(card, row);
      view.insertBefore(card, view.children[1] || null);
    });
  }

  function importOld(old, elders, from) {
    var steps = old.map(function (o, i) {
      return function () {
        say('Bringing over ' + (i + 1) + ' of ' + old.length + '…');
        return store.saveEntry({
          kind: core.find(core.KINDS, o.kind) ? o.kind : 'story', title: o.title || 'Untitled', body: o.text || '', prompt: o.prompt || '',
          teller: o.teller || '', place: o.place || '', forWhom: o.forWhom || '', openWhen: o.openWhen || '', audience: 'private', audiencePeople: [],
        }).then(function (saved) {
          var files = [];
          if (o.photo instanceof Blob) files.push([o.photo, 'photograph.' + ((o.photo.type || '').split('/')[1] || 'jpg')]);
          if (o.audio instanceof Blob) files.push([o.audio, 'voice-note.' + (/mp4/.test(o.audio.type) ? 'm4a' : 'webm')]);
          return files.reduce(function (p, f) { return p.then(function () { return store.addMedia(saved, f[0], f[1]); }); }, Promise.resolve());
        });
      };
    }).concat(elders.map(function (e) {
      return function () {
        return store.saveElder({ name: e.name, relation: e.relation || '', phone: e.phone || '', day: Number(e.day) || 0, idx: e.index || 0, answered: e.answered || 0, signAs: from || '' });
      };
    }));
    return steps.reduce(function (p, s) { return p.then(s); }, Promise.resolve());
  }

  function signedOut() {
    state.user = null;
    state.people = null;
    try { localStorage.removeItem('tch-signed-in'); } catch (e) {}
    if (parse().path) {
      location.hash = '#/';
      return Promise.resolve();
    }
    return render();
  }

  // ---------- start ----------
  function start() {
    return store.session().then(function (s) {
      state.user = s ? s.user : null;
      state.people = null;
      if (!state.user) return;
      return store.touchSeen().then(function (l) { state.legacy = l; });
    }).then(function () {
      try {
        if (state.user) localStorage.setItem('tch-signed-in', '1');
        else localStorage.removeItem('tch-signed-in');
      } catch (e) {}
      return render();
    });
  }

  drawNotice();
  var redirect = /access_token=|error_description=/.test(location.hash) ? store.handleRedirect(location.hash) : Promise.resolve();
  redirect.then(function (s) {
    if (s) history.replaceState(null, '', location.pathname + '#/');
  }, function (err) {
    history.replaceState(null, '', location.pathname + '#/');
    say(err.message + ' Please ask for a new sign-in link.', true);
  }).then(start).catch(function (err) {
    fail(err);
    view.textContent = '';
    add(view, h('p', null, 'We could not open your archive. Check your connection and ', h('a', { href: '' }, 'try again'), '.'));
  });
})();
