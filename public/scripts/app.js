// The family archive app at /app.html: sign in, keep stories, voices, photographs, videos and
// documents, share them with the people you choose, and decide what is passed on.
// It talks to a Supabase project when one is configured (site.json "backend", or a developer
// override in localStorage "tch-backend", honoured on localhost only); otherwise it runs in preview mode on this device.
(function () {
  var TCH = window.TCH;
  var core = TCH.core;
  var exporter = TCH.archiveExport;
  var exporting = false;
  var Art = window.TCHRootsArt;
  var app = document.querySelector('[data-app]');
  if (!app) return;

  // ---------- which backend ----------
  function backendConfig() {
    var cfg = {};
    if (/[?&]preview\b/.test(location.search)) return cfg;
    try { cfg = JSON.parse(document.querySelector('meta[name="tch-backend"]').content || '{}'); } catch (e) {}
    // The override is for local development only: on the real site, nothing left in localStorage
    // can send someone's sign-in and stories to another server.
    var local = /^(localhost|127\.0\.0\.1)$/;
    try {
      var override = JSON.parse(localStorage.getItem('tch-backend') || 'null');
      if (local.test(location.hostname) && override && override.anonKey && typeof override.url === 'string' && local.test(new URL(override.url).hostname)) cfg = override;
    } catch (e) {}
    return cfg;
  }
  var cfg = backendConfig();
  var sample = /[?&]sample\b/.test(location.search);
  var store = sample ? TCH.stores.sample : cfg.url && cfg.anonKey ? TCH.stores.supabase(cfg) : TCH.stores.local;
  var returnTo = location.origin + location.pathname + (store.mode === 'local' && location.search ? location.search : '');
  var MAX_BYTES = store.mode === 'supabase' ? 50 * 1024 * 1024 : 500 * 1024 * 1024;

  var state = { user: null, legacy: null, people: null, market: false };
  var FEE_PERCENT = Number(document.querySelector('meta[name="tch-fee"]').content);

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

  // Files shared from another app arrive through the service worker (public/sw.js).
  function takeShared() {
    return new Promise(function (resolve) {
      var req = indexedDB.open('tch-shared', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('files', { keyPath: 'id' }); };
      req.onerror = function () { resolve({ files: [], text: '' }); };
      req.onsuccess = function () {
        var tx = req.result.transaction('files', 'readwrite');
        var os = tx.objectStore('files');
        var all = os.getAll();
        all.onsuccess = function () {
          var rows = all.result || [];
          os.clear();
          resolve({
            files: rows.map(function (r) {
              try { return new File([r.blob], r.name, { type: r.type }); } catch (err) { var b = r.blob; b.name = r.name; return b; }
            }),
            text: rows.map(function (r) { return r.text; }).filter(Boolean).join(' '),
          });
        };
        all.onerror = function () { resolve({ files: [], text: '' }); };
      };
    });
  }

  var installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (ev) { ev.preventDefault(); installPrompt = ev; });

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
    ['#/people', 'My people'], ['#/shared', 'Shared with me'], ['#/requests', 'Requests', 'market'], ['#/settings', 'Settings'],
  ];
  function drawNav(route) {
    nav.textContent = '';
    nav.hidden = !state.user;
    if (!state.user) return;
    var ul = h('ul');
    TABS.forEach(function (t) {
      if (t[2] === 'market' && !state.market && route !== 'requests') return;
      var current = t[0] === '#/' ? route === '' : route.indexOf(t[0].slice(2)) === 0;
      ul.appendChild(h('li', null, h('a', { href: t[0], 'aria-current': current ? 'page' : null }, t[1])));
    });
    nav.appendChild(ul);
  }

  function drawNotice() {
    if (sample) {
      notice.hidden = false;
      notice.textContent = '';
      notice.className = 'app-notice app-notice--sample';
      add(notice, [h('strong', null, 'A sample archive. '), 'The Mishra family is invented, so look around freely: nothing here can be changed. ',
        link('/app.html', 'Start your own archive', 'btn btn--small'), ' ', link('/offerings.html', 'Back to what we offer', 'text-link')]);
    } else if (store.mode === 'local') {
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
    [/^entry\/([\w-]+)$/, entryView], [/^roots$/, roots], [/^weekly$/, weekly], [/^interview$/, interview], [/^people$/, people], [/^shared$/, shared],
    [/^shared\/([\w-]+)$/, sharedArchive], [/^settings$/, settings], [/^contribute$/, contribute], [/^moderate$/, moderate],
    [/^offer$/, offer], [/^request$/, requestForm], [/^requests$/, requests], [/^echo$/, echo], [/^report$/, reportForm],
  ];

  // In the sample archive, pages that only add or change things invite people to start their own instead.
  var SAMPLE_STOPS = /^(entry\/new|entry\/[\w-]+\/edit|contribute|offer|request|echo|report|moderate)$/;
  function sampleStop() {
    var h1 = page('In your own archive, this is where you would add it', 'This sample belongs to an invented family, so nothing can be added or changed here. Your own archive is free to start, and private until you choose who sees each entry.');
    add(view, h('div', { class: 'btn-row' }, link('/app.html', 'Start your own archive', 'btn'), link('#/archive', 'Keep looking around', 'btn btn--ghost')));
    return h1;
  }

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
    if (sample && SAMPLE_STOPS.test(r.path)) return sampleStop();
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
  // Sign-in links come back to the app's front page, so the page someone was heading for is kept here.
  var AFTER_SIGNIN = 'tch-after-signin';
  function rememberWanted() {
    try {
      if (parse().path) localStorage.setItem(AFTER_SIGNIN, location.hash);
      else localStorage.removeItem(AFTER_SIGNIN);
    } catch (e) {}
  }
  function restoreWanted() {
    var wanted = null;
    try {
      wanted = localStorage.getItem(AFTER_SIGNIN);
      localStorage.removeItem(AFTER_SIGNIN);
    } catch (e) {}
    if (wanted && /^#\/[\w\/?=&%.-]+$/.test(wanted) && !parse().path) history.replaceState(null, '', location.pathname + location.search + wanted);
  }

  function signin() {
    var why = {
      contribute: ['Add to a place', 'Sign in with your email to write it. It takes a minute, and you choose how you are credited.'],
      offer: ['Offer your work', 'Sign in with your email to create your listing. Families find you through the places you work in.'],
      request: ['Send a request', 'Sign in with your email so they can reply to you. Nothing is charged until you accept a quote.'],
      requests: ['Your requests', 'Sign in with your email to see your requests and quotes.'],
      echo: ['We have this too', 'Sign in with your email to say your family has this too.'],
      report: ['Report this', 'Sign in with your email to report it. It stops one person sending many reports, and nobody else sees who reported.'],
    }[parse().path];
    var h1 = why
      ? page(why[0], why[1])
      : page('Your family archive', 'Keep the stories, voices, photographs and wisdom of your family in one private place, and choose who receives each one, now or later.');
    if (!why) waitingOnDevice().then(function (w) {
      if (!w.old.length || !h1.isConnected) return;
      var lede = view.querySelector('.app-head .lede');
      if (lede) lede.textContent = (w.old.length === 1 ? 'Your story is' : 'Your ' + w.old.length + ' stories are') + ' waiting in this browser. Sign in to keep ' + (w.old.length === 1 ? 'it' : 'them') + ' safe in your private archive, where you can open ' + (w.old.length === 1 ? 'it' : 'them') + ' on any device.';
    });
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
      add(form, h('p', { class: 'app-or' }, h('a', { class: 'btn btn--ghost', href: store.googleUrl(returnTo), onclick: rememberWanted }, 'Continue with Google')));
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      rememberWanted();
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
    var h1 = sample
      ? page('Asha\u2019s family archive', 'Asha keeps her grandmother\u2019s stories here, and her brother Ravi adds his own. This is what an archive looks like after a few weeks.')
      : page('Welcome, ' + firstName(state.user.name) + '.');
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
        link('#/entry/new?kind=memory&narrate=1', 'Narrate an old photo', 'btn btn--ghost'),
        link('#/interview', 'Sit down for an interview', 'btn btn--ghost'),
      ));
      var grid = h('div', { class: 'app-grid' });
      var q = elders[0] ? core.question(elders[0].idx, elders[0].lang) : core.question(0);
      grid.appendChild(h('section', { class: 'app-card app-card--accent' },
        h('p', { class: 'eyebrow' }, elders[0] ? 'This week, for ' + elders[0].name : 'The weekly question'),
        h('h2', null, q.text),
        h('p', null, elders[0] ? 'Send it, then keep their answer here.' : 'One question a week to someone you love. In a year, their life in their own words.'),
        link('#/weekly', elders[0] ? 'Open the weekly question' : 'Start with someone you love', 'text-link'),
      ));
      grid.appendChild(bookCard(mine, files));
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
      var soon = core.upcoming(new Date(), elders, 21)[0];
      if (soon) add(view, occasionCard(soon));
      add(view, grid);
      if (entries.length) {
        add(view, h('h2', { class: 'app-sub' }, 'Recently kept'));
        add(view, h('div', { class: 'app-list' }, entries.slice(0, 4).map(entryCard)));
      }
      return (sample ? Promise.resolve() : offerImport()).then(function () { return h1; });
    });
  }

  function inDays(n) { return n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days'; }
  function occasionCard(o) {
    var teller = o.elder ? '&teller=' + encodeURIComponent(o.elder.name) : '';
    return h('section', { class: 'app-card app-occasion' },
      h('p', { class: 'eyebrow' }, 'Coming up'),
      h('h2', null, o.name + ' is ' + inDays(o.days) + '.'),
      h('p', null, o.kind === 'birthday'
        ? 'Record a birthday message for ' + o.elder.name + ', or ask them a question only they can answer:'
        : 'Festivals are when families sit together. Ask someone while everyone is home:'),
      h('p', { class: 'app-occasion__q' }, o.question),
      h('div', { class: 'btn-row' },
        link('#/entry/new?kind=story&record=audio' + teller + '&prompt=' + encodeURIComponent(o.question), 'Record their answer', 'btn'),
        o.kind === 'birthday' ? link('#/entry/new?kind=letter&forWhom=' + encodeURIComponent(o.elder.name), 'Write ' + o.elder.name + ' a birthday letter', 'btn btn--ghost') : null),
    );
  }
  function bookCard(mine, files) {
    var n = mine.length;
    var goal = core.BOOK_GOAL;
    var ready = n >= goal;
    return h('section', { class: 'app-card app-book' },
      h('p', { class: 'eyebrow' }, 'Your archive'),
      h('h2', null, n ? plural(n, 'entry', 'entries') + ', ' + plural(files, 'file') : 'Nothing kept yet'),
      h('div', { class: 'app-book__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(Math.min(n, goal)), 'aria-label': 'Entries towards a printed family book' },
        h('span', { style: 'width:' + Math.min(100, Math.round((n / goal) * 100)) + '%' })),
      h('p', null, ready
        ? 'Long enough for a family book. Print it at home, or have it bound to give at the next family gathering.'
        : n ? plural(goal - n, 'more entry', 'more entries') + ' and it is long enough to print as a family book.' : 'Every story, saying and photograph you keep becomes a page of your family book.'),
      ready
        ? h('div', { class: 'btn-row' }, link('#/archive', 'Open and print it', 'text-link'), link('/plans.html', 'Have it bound', 'text-link'))
        : link('#/archive', 'Open your archive', 'text-link'),
    );
  }

  // ---------- archive ----------
  function entryCard(e) {
    var kind = core.find(core.KINDS, e.kind);
    var counts = {};
    e.media.forEach(function (m) { counts[m.kind] = (counts[m.kind] || 0) + 1; });
    var names = { audio: 'voice note', video: 'video', photo: 'photograph', document: 'document' };
    var media = Object.keys(counts).map(function (k) { return plural(counts[k], names[k]); }).join(', ');
    var photo = e.media.filter(function (m) { return m.kind === 'photo'; })[0];
    var frame = null;
    if (photo) {
      frame = h('span', { class: 'app-entry__photo' });
      store.mediaUrl(photo).then(function (url) { frame.appendChild(h('img', { src: url, alt: '', loading: 'lazy' })); }).catch(function () { frame.remove(); });
    }
    return h('a', { class: 'app-entry' + (photo ? ' app-entry--photo' : ''), href: '#/entry/' + e.id },
      frame,
      h('span', { class: 'eyebrow' }, kind ? kind.heading : '', counts.audio ? h('span', { class: 'app-entry__voice' }, 'Voice') : null),
      h('h3', null, e.title),
      e.body ? h('p', null, e.body.length > 160 ? e.body.slice(0, 157) + '…' : e.body) : null,
      h('span', { class: 'app-entry__meta' }, [e.teller ? 'Told by ' + e.teller : null, media || null, core.audienceLabel(e, state.people || []), core.formatDate(e.createdAt)].filter(Boolean).join(' · ')),
    );
  }

  function sameName(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
  // Memories of someone are asked for with this question, so they gather on that person's page
  // even when somebody else told them.
  function memoryPrompt(name) { return 'What do you remember about ' + name + '?'; }
  function rememberedName(e) {
    var m = /^What do you remember about (.+)\?$/.exec(e.prompt || '');
    return m ? m[1] : '';
  }
  function aboutPerson(e, name) { return sameName(e.teller, name) || sameName(rememberedName(e), name); }
  function tellers(entries) {
    var list = [];
    entries.forEach(function (e) {
      var name = String(rememberedName(e) || e.teller || '').trim();
      if (!name) return;
      var t = list.filter(function (x) { return sameName(x.name, name); })[0];
      if (t) {
        t.count++;
        if (!/^\p{Lu}/u.test(t.name) && /^\p{Lu}/u.test(name)) t.name = name;
      } else list.push({ name: name, count: 1 });
    });
    return list.sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  }
  function keptBy(entries) {
    var names = [];
    entries.forEach(function (e) {
      var p = state.people.filter(function (x) { return x.userId && x.userId === e.createdBy; })[0];
      var name = e.createdBy === state.user.id ? 'you' : p ? p.name : null;
      if (name && names.indexOf(name) === -1) names.push(name);
    });
    return names.sort(function (a, b) { return (b === 'you') - (a === 'you'); });
  }

  function archive(_, query) {
    var who = query.get('teller');
    if (who) return personPage(who);
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
      var people = tellers(entries.filter(function (e) { return e.owner === state.user.id; }));
      if (people.length) {
        add(view, h('nav', { class: 'app-tellers', 'aria-label': 'The people in these stories' },
          h('span', { class: 'eyebrow' }, 'The people in these stories'),
          h('ul', null, people.map(function (t) { return h('li', null, h('a', { href: '#/archive?teller=' + encodeURIComponent(t.name) }, t.name, h('small', null, String(t.count)))); })),
        ));
      }
      var shown = kind ? entries.filter(function (e) { return e.kind === kind; }) : entries;
      if (!entries.length) {
        add(view, emptyArchive());
      } else if (!shown.length) {
        add(view, h('p', { class: 'empty-state' }, 'Nothing of this kind yet.'));
      } else {
        add(view, h('div', { class: 'app-list' }, shown.map(entryCard)));
      }
      return h1;
    });
  }

  function emptyArchive() {
    return h('section', { class: 'app-card app-welcome' },
      h('img', { class: 'app-welcome__art', src: '/assets/illustrations/family-photo-album-800.jpg', alt: '', width: '800', height: '600', loading: 'lazy' }),
      h('div', null,
        h('h2', null, 'An album waiting for its first page'),
        h('p', null, 'Most families begin with one small thing. Pick whichever is nearest to hand.'),
        h('ul', { class: 'app-welcome__steps' },
          h('li', null, link('#/entry/new?kind=story&record=audio', 'Record a grandparent telling one story', 'text-link'), h('small', null, 'Five minutes on the phone is enough.')),
          h('li', null, link('#/entry/new?kind=memory', 'Keep an old photograph and who is in it', 'text-link'), h('small', null, 'A photo of a photo works.')),
          h('li', null, link('#/entry/new?kind=wisdom', 'Write down a saying only your family uses', 'text-link'), h('small', null, 'The kind nobody outside would understand.'))),
        h('p', { class: 'field__hint' }, 'Everything stays private to you until you choose who can see it.')));
  }

  // Everything told by or about one person, and a way to ask the rest of the family for theirs.
  function personPage(who) {
    return Promise.all([store.entries(), loadPeople()]).then(function (r) {
      var mine = r[0].filter(function (e) { return e.owner === state.user.id && aboutPerson(e, who); });
      var name = mine.length ? tellers(mine).filter(function (t) { return sameName(t.name, who); }).concat([{ name: who }])[0].name : who;
      var by = keptBy(mine);
      var h1 = page(name, mine.length
        ? plural(mine.length, 'story', 'stories') + ' and memories' + (by.length ? ', kept by ' + listNames(by) : '') + '.'
        : 'Nothing kept about ' + name + ' yet.');
      view.querySelector('.app-head').insertBefore(h('p', { class: 'eyebrow' }, h('a', { class: 'eyebrow--plain', href: '#/archive' }, 'My archive'), ' · A person'), h1);
      add(view, h('div', { class: 'app-toolbar' },
        link('#/entry/new?prompt=' + encodeURIComponent(memoryPrompt(name)), 'Add your memory of ' + name, 'btn'),
        link('#/entry/new?teller=' + encodeURIComponent(name) + '&record=audio', 'Keep a story ' + name + ' told', 'btn btn--ghost'),
      ));
      if (mine.length) add(view, h('div', { class: 'app-list' }, mine.map(entryCard)));
      add(view, askFamily(name, true));
      return h1;
    });
  }
  function listNames(names) {
    return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function askText(person, about, url) {
    return firstName(person.name) + ', I am keeping ' + about + '’s stories in our family archive on The Cultured Human. ' +
      'What do you remember about ' + about + '? A story, a saying, the way they laughed. Add yours here, it only takes a few minutes: ' + url;
  }
  /** A panel for asking relatives, by name, to add their own memory of someone. */
  function askFamily(about, open) {
    var url = returnTo + '#/entry/new?owner=' + state.user.id + '&prompt=' + encodeURIComponent(memoryPrompt(about));
    var canAdd = state.people.filter(function (p) { return p.role === 'family_edit'; });
    var viewOnly = state.people.filter(function (p) { return p.role === 'family_view'; });
    var panel = h('section', { class: 'app-card app-ask' },
      h('p', { class: 'eyebrow' }, 'Ask the family'),
      h('h2', null, 'Who else remembers ' + about + '?'),
      h('p', null, 'Every person remembers someone differently. Ask them by name; what they add appears here, with ' + about + '’s other stories.'),
    );
    if (canAdd.length) {
      add(panel, h('ul', { class: 'app-ask__list' }, canAdd.map(function (p) {
        var text = askText(p, about, url);
        return h('li', null, h('strong', null, p.name),
          h('span', { class: 'btn-row' },
            h('a', { class: 'btn btn--small', href: 'https://wa.me/?text=' + encodeURIComponent(text), target: '_blank', rel: 'noopener' }, 'Ask on WhatsApp'),
            h('a', { class: 'btn btn--ghost btn--small', href: 'mailto:' + p.email + '?subject=' + encodeURIComponent('Your memory of ' + about) + '&body=' + encodeURIComponent(text) }, 'Ask by email')));
      })));
    }
    if (viewOnly.length) {
      add(panel, h('p', { class: 'field__hint' }, listNames(viewOnly.map(function (p) { return p.name; })) + (viewOnly.length === 1 ? ' can' : ' can') + ' see what you share but not add to it yet. ',
        button(viewOnly.length === 1 ? 'Let them add too' : 'Let them all add too', function (ev) {
          ev.target.disabled = true;
          viewOnly.reduce(function (pr, p) { return pr.then(function () { return store.savePerson({ id: p.id, name: p.name, email: p.email, role: 'family_edit' }); }); }, Promise.resolve())
            .then(function () { state.people = null; flash = 'They can now add their own memories.'; render(); }).catch(fail);
        }, 'text-link')));
    }
    if (!canAdd.length && !viewOnly.length) {
      add(panel, h('p', null, link('#/people', 'Add a relative who can add their memories', 'text-link')));
    }
    return open ? panel : h('details', { class: 'app-more' }, h('summary', null, 'Ask the family for their memory of ' + about), panel);
  }

  // ---------- one entry ----------
  function mediaBlock(m, editable) {
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
    if (m.kind === 'audio' || m.kind === 'video') wrap.appendChild(transcriptBlock(m, editable));
    return wrap;
  }

  // What is said in a recording, and its English translation: typed by family, or written by
  // speech-to-text (api/transcribe.py, once site.json backend.transcribe is on) and then corrected.
  function transcriptBlock(m, editable) {
    var box = h('div', { class: 'app-transcript' });
    function draw() {
      box.textContent = '';
      if (m.transcript) add(box, [h('h4', null, 'What is said'), h('p', { class: 'app-transcript__text' }, m.transcript)]);
      if (m.translation) add(box, [h('h4', null, 'In English'), h('p', { class: 'app-transcript__text' }, m.translation)]);
      if (m.transcript || m.translation) add(box, h('p', { class: 'field__hint' }, m.transcriptBy === 'machine' ? 'Written by speech-to-text, so it may have mistakes. Correct it if you can.' : 'Typed by the family.'));
      if (!editable) return;
      var actions = h('div', { class: 'btn-row' });
      if (cfg.transcribe && store.mode === 'supabase' && m.transcriptBy !== 'machine' && !m.transcript) {
        add(actions, button('Transcribe and translate it', function (ev) {
          ev.target.disabled = true;
          say('Listening to the recording\u2026 this can take a minute.');
          postJson('/api/transcribe', { media: m.id }, store.accessToken()).then(function (r) {
            if (r.unavailable) throw new Error('Automatic transcripts are not switched on yet.');
            m.transcript = r.transcript; m.translation = r.translation; m.transcriptBy = 'machine';
            say('Done. Read it through and correct anything it misheard.');
            draw();
          }).catch(function (err) { ev.target.disabled = false; fail(err); });
        }, 'btn btn--small'));
      }
      add(actions, button(m.transcript || m.translation ? 'Correct the transcript' : 'Type what is said', edit, 'btn btn--ghost btn--small'));
      add(box, actions);
    }
    function edit() {
      var form = h('form', { class: 'app-transcript__form' });
      var said = h('textarea', { name: 'transcript', rows: '6', maxlength: '100000' });
      said.value = m.transcript || '';
      var english = h('textarea', { name: 'translation', rows: '6', maxlength: '100000' });
      english.value = m.translation || '';
      add(form, [
        field('What is said, in the language it is said in', said, 'Write it as it was spoken, in any script.'),
        field('In English (optional)', english, 'For the people in the family who don\u2019t speak the language.'),
        h('div', { class: 'btn-row' }, button('Save', null, 'btn btn--small', 'submit'), button('Cancel', draw, 'btn btn--ghost btn--small')),
      ]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        store.saveTranscript(m, { transcript: said.value, translation: english.value }).then(function (saved) {
          m.transcript = saved.transcript || ''; m.translation = saved.translation || ''; m.transcriptBy = saved.transcriptBy;
          say('Saved.');
          draw();
        }).catch(fail);
      });
      box.textContent = '';
      box.appendChild(form);
      said.focus();
    }
    draw();
    return box;
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
      var editable = core.canEdit(e, state.user.id) && !sample;
      if (e.media.length) add(view, h('div', { class: 'app-media-list' }, e.media.map(function (m) { return mediaBlock(m, editable); })));
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
      var about = String(rememberedName(e) || e.teller || '').trim();
      if (mineArchive && about) add(actions, link('#/archive?teller=' + encodeURIComponent(about), 'Everything about ' + about, 'text-link'));
      add(view, actions);
      if (mineArchive && about) add(view, askFamily(about, false));
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
      var e = existing || { kind: query.get('kind') || 'story', title: '', body: '', prompt: query.get('prompt') || '', teller: query.get('teller') || '', forWhom: query.get('forWhom') || '', audience: forOther ? 'family' : 'private', audiencePeople: [], media: [] };
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
      var title = h('input', { name: 'title', type: 'text', required: true, maxlength: '120', value: e.title, placeholder: query.get('narrate') ? 'Papa\u2019s wedding, 1974' : null });
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
      var privacy = h('p', { class: 'app-privacy', 'aria-live': 'polite' });
      function sync() {
        peopleBox.hidden = ['people', 'date', 'passed'].indexOf(picked) === -1;
        dateField.hidden = picked !== 'date';
        privacy.textContent = privacyLine();
      }
      function privacyLine() {
        if (forOther) return picked === 'private' ? 'Only you and ' + sharedRow.ownerName + ' will be able to hear or see this.' : 'Only ' + sharedRow.ownerName + '\u2019s family will be able to hear or see this.';
        if (picked === 'private') return 'Only you will be able to hear or see this. Nothing here is ever public.';
        if (picked === 'family') return 'Only the family you have added will be able to hear or see this. Nothing here is ever public.';
        return 'Only the people you choose under \u201cWho can see it\u201d will be able to hear or see this. Nothing here is ever public.';
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
      var camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', onchange: function () { addFiles(camera.files); camera.value = ''; } });
      var picker = h('input', { type: 'file', multiple: true, accept: 'audio/*,video/*,image/*,.opus,.ogg,.m4a,.amr,application/pdf,.doc,.docx,.txt', onchange: function () { addFiles(picker.files); picker.value = ''; } });
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
      var narrate = query.get('narrate') && !existing;
      add(form, h('fieldset', { class: 'app-attach' },
        h('legend', null, narrate ? 'The photograph, and their voice' : 'Voices, videos, photographs and documents'),
        narrate
          ? h('ol', { class: 'app-narrate' },
            h('li', null, 'Photograph the print with ', h('strong', null, 'Take a photo of a print'), ', flat and in daylight, or attach a scan.'),
            h('li', null, 'Sit with the person who remembers it, press ', h('strong', null, 'Record a voice note'), ' and ask: Who is in it? Where was it taken? What happened that day? Who took it?'),
            h('li', null, 'Let them wander. The stories around the photograph are often better than the photograph.'))
          : h('p', { class: 'field__hint' }, 'Old certificates, letters, deeds and photographs of them count too. Up to ' + core.formatBytes(MAX_BYTES) + ' each.'),
        h('div', { class: 'btn-row' }, narrate ? h('label', { class: 'btn app-upload' }, 'Take a photo of a print', camera) : null, recordButton('audio'), recordButton('video'), h('label', { class: 'btn btn--ghost app-upload' }, narrate ? 'Attach a scan' : 'Attach files', picker)),
        privacy, recordStatus, preview, fileList,
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
      if (query.get('shared') && !existing) {
        takeShared().then(function (got) {
          if (query.get('shared') === 'failed' || !got.files.length) { say('Nothing arrived from the other app. Save the file to your phone, then attach it here.', true); return; }
          addFiles(got.files);
          var voice = got.files.some(function (f) { return core.mediaKind(f.type, f.name) === 'audio'; });
          if (!title.value) title.value = voice ? 'A voice note' + (e.teller ? ' from ' + e.teller : '') : 'Shared ' + core.formatDate(new Date().toISOString());
          if (got.text && !body.value) body.value = got.text;
          say(plural(got.files.length, 'file') + ' arrived. Add who told it and a title, then keep it.');
          teller.focus();
        });
      }
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
  function devicePhotos() {
    try { return JSON.parse(localStorage.getItem('tch-roots-photos') || '{}') || {}; } catch (e) { return {}; }
  }
  function hasRoots(saved) { return !!saved && Art.places(Art.fromSaved(saved)).length > 0; }
  function drawn(saved) {
    var s = Art.clean(saved);
    return JSON.stringify([s.name.trim(), s.mode, s.style, s.palette, s.format, Art.places(Art.fromSaved(s))]);
  }
  function sameRoots(a, b) { return drawn(a) === drawn(b); }

  var portraits = 0;
  function portrait(saved) {
    var p = Art.paletteById(saved.palette);
    var data = Art.fromSaved(saved);
    var label = 'Roots portrait: ' + Art.places(data).map(function (g) { return g.label + ', ' + g.place; }).join('; ') + '.';
    var box = h('div', { class: 'app-roots__art', role: 'img', 'aria-label': label, 'data-format': saved.format });
    box.innerHTML = Art.render(data, p.c || Art.siteColours(), { style: saved.style, format: saved.format, lang: saved.lang, idPrefix: 'app-roots' + (++portraits), photos: devicePhotos() });
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
    var q = core.question(elder.idx, elder.lang);
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
      link('#/interview?elder=' + elder.id, 'Sitting with ' + elder.name + '? Interview them', 'btn btn--ghost'),
    ]);
    add(card, [
      h('p', { class: 'eyebrow' }, 'Week ' + (elder.idx + 1) + ' for ' + elder.name + (kind ? ' · ' + kind.heading : '')),
      h('h2', { lang: q.lang }, q.text),
      q.lang !== 'en' ? h('p', { class: 'field__hint' }, q.en) : null,
      h('div', { class: 'app-filters app-lang', role: 'group', 'aria-label': 'Ask in' }, core.LANGUAGES.map(function (l) {
        return h('a', { href: '#/weekly?elder=' + elder.id, lang: l.id, 'aria-current': q.lang === l.id ? 'true' : null, onclick: function (ev) {
          ev.preventDefault();
          if (q.lang !== l.id) store.saveElder({ id: elder.id, lang: l.id }).then(function () { render(); }).catch(fail);
        } }, l.label);
      })),
      h('pre', { class: 'app-message', lang: q.lang }, text),
      elder.askedAt ? h('p', { class: 'field__hint' }, 'Asked on ' + core.formatDate(elder.askedAt) + '.') : null,
      actions,
      autoSendToggle(elder),
      h('details', { class: 'app-howto' },
        h('summary', null, 'When ' + elder.name + ' replies with a voice note'),
        h('p', null, 'On Android, add The Cultured Human to your home screen once. Then, in WhatsApp, press and hold their voice note, tap Share, and choose The Cultured Human: it opens here, ready to keep.'),
        h('p', null, 'On an iPhone or a computer, save the voice note, then tap "Keep their answer" and attach it.'),
        installPrompt ? h('div', { class: 'btn-row' }, button('Add to my home screen', function () {
          installPrompt.prompt();
          installPrompt.userChoice.then(function () { installPrompt = null; render(); });
        }, 'btn btn--small')) : null,
      ),
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

  // ---------- a sit-down interview ----------
  // For when you are with them: one question at a time on screen, a recorder, follow-ups to keep
  // them talking, and each answer kept as its own entry, private until you choose otherwise.
  function interview(_, query) {
    var h1 = page('An interview', 'Sit together somewhere quiet, put the phone between you, and let the questions do the work. Each answer is kept as its own entry, visible only to you until you share it.');
    return store.elders().then(function (elders) {
      var elder = elders.filter(function (e) { return e.id === query.get('elder'); })[0] || null;
      var who = elder ? elder.name : query.get('teller') || '';
      if (!who) return interviewSetup(elders, h1);
      var lang = query.get('lang') || (elder && elder.lang) || 'en';
      var at = Number(query.get('q'));
      if (!(at >= 0)) at = elder ? elder.idx : 0;
      add(view, interviewCard(who, lang, at, elder));
      return h1;
    });
  }

  function interviewSetup(elders, h1) {
    var form = h('form', { class: 'app-card' });
    var name = h('input', { name: 'teller', required: true, maxlength: '80', placeholder: 'Nani, Dad, my aunt\u2026' });
    var lang = options(h('select', { name: 'lang' }), core.LANGUAGES, 'en');
    add(form, [
      h('h2', null, 'Who are you sitting with?'),
      elders.length ? h('div', { class: 'app-filters', role: 'group', 'aria-label': 'People you ask every week' }, elders.map(function (e) {
        return h('a', { href: '#/interview?elder=' + e.id }, e.name);
      })) : null,
      h('div', { class: 'app-form-grid' }, field('Their name', name), field('Ask in', lang, 'They can answer in any language.')),
      h('div', { class: 'btn-row' }, button('Begin', null, 'btn', 'submit')),
      h('details', { class: 'app-howto' }, h('summary', null, 'Before you begin'),
        h('ul', null,
          h('li', null, 'Ask if they are happy to be recorded, and tell them who will hear it.'),
          h('li', null, 'Turn off the fan and the television, and sit close. The phone can lie flat between you.'),
          h('li', null, 'Let silences run. People often say the best thing after a pause.'),
          h('li', null, 'Twenty minutes is plenty for one sitting.'))),
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      location.hash = '#/interview?teller=' + encodeURIComponent(name.value.trim()) + '&lang=' + lang.value;
    });
    add(view, form);
    return h1;
  }

  function interviewCard(who, lang, at, elder) {
    var q = core.question(at, lang);
    var base = '#/interview?' + (elder ? 'elder=' + elder.id : 'teller=' + encodeURIComponent(who)) + '&lang=' + lang + '&q=';
    var card = h('section', { class: 'app-card app-card--accent app-interview' });
    var status = h('p', { class: 'field__hint', 'aria-live': 'polite' });
    var preview = h('div', { class: 'app-record__preview' });
    var recording = null;
    var take = null;
    var recordBtn = button('Start recording', toggle, 'btn');
    var keepBtn = button('Keep this answer', keep, 'btn');
    var againBtn = button('Record again', function () { take = null; preview.textContent = ''; sync(); }, 'btn btn--ghost');
    keepBtn.hidden = againBtn.hidden = true;

    function sync() {
      recordBtn.hidden = !!take;
      keepBtn.hidden = againBtn.hidden = !take;
      recordBtn.textContent = recording ? 'Stop recording' : 'Start recording';
      status.textContent = recording ? 'Recording\u2026 Ask the question out loud, then listen.' : take ? 'Listen back if you like, then keep it.' : '';
    }
    function toggle() {
      if (recording) { recording.stop(); return; }
      if (!navigator.mediaDevices || !window.MediaRecorder) { say('Recording is not supported in this browser.', true); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var chunks = [];
        var rec = new MediaRecorder(stream);
        rec.ondataavailable = function (ev) { if (ev.data.size) chunks.push(ev.data); };
        rec.onstop = function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          var type = rec.mimeType || 'audio/webm';
          var ext = /mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
          var blob = new Blob(chunks, { type: type });
          var fileName = core.safeFileName(who) + '-week-' + q.week + '.' + ext;
          try { take = new File([blob], fileName, { type: type }); } catch (err) { take = blob; take.name = fileName; }
          recording = null;
          preview.textContent = '';
          preview.appendChild(h('audio', { controls: true, src: URL.createObjectURL(blob), 'aria-label': 'Their answer' }));
          sync();
        };
        rec.start();
        recording = rec;
        sync();
      }).catch(function () { say('We could not use your microphone. Check the browser permission.', true); });
    }
    function keep() {
      keepBtn.disabled = true;
      store.saveEntry({ owner: state.user.id, kind: q.kind, title: q.text.length > 120 ? q.text.slice(0, 117) + '\u2026' : q.text, prompt: q.text, teller: who, body: '', audience: 'private', audiencePeople: [] })
        .then(function (saved) {
          say('Saving the recording\u2026');
          return store.addMedia(saved, take, take.name).then(function () { return saved; });
        })
        .then(function () {
          return elder ? store.saveElder({ id: elder.id, idx: at + 1, answered: elder.answered + 1, askedAt: null }) : null;
        })
        .then(function () { flash = 'Kept, visible only to you. Here is the next one.'; location.hash = base + (at + 1); })
        .catch(fail).then(function () { keepBtn.disabled = false; });
    }

    add(card, [
      h('p', { class: 'eyebrow' }, 'With ' + who + ' \u00b7 question ' + q.week + ' of ' + core.QUESTIONS.length),
      h('h2', { class: 'app-interview__q', lang: q.lang }, q.text),
      q.lang !== 'en' ? h('p', { class: 'field__hint' }, q.en) : null,
      h('div', { class: 'btn-row' }, recordBtn, keepBtn, againBtn),
      status, preview,
      h('details', { class: 'app-howto' }, h('summary', null, 'If they stop, ask'),
        h('ul', { lang: q.lang }, core.FOLLOW_UPS[q.lang].map(function (f) { return h('li', null, f); }))),
      h('div', { class: 'btn-row' },
        link(base + (at + 1), 'Skip to the next question', 'btn btn--ghost btn--small'),
        link('#/archive?teller=' + encodeURIComponent(who), 'See what you kept from ' + who, 'text-link')),
    ]);
    return card;
  }

  /** Only offered once the site's WhatsApp sender is set up (site.json backend.weeklyAuto). */
  function autoSendToggle(elder) {
    if (!cfg.weeklyAuto || store.mode !== 'supabase' || !elder.phone) return null;
    var box = h('input', { type: 'checkbox', checked: !!elder.autoSend, onchange: function () {
      store.saveElder({ id: elder.id, autoSend: box.checked }).then(function () {
        flash = box.checked ? 'The question will be sent for you every ' + DAYS[elder.day] + ' morning.' : 'You will send the question yourself again.';
        render();
      }).catch(fail);
    } });
    return h('div', { class: 'app-auto' },
      h('label', { class: 'app-check' }, box, ' Send it for me every ' + DAYS[elder.day] + ' morning. ' + elder.name + ' has agreed to get it from The Cultured Human\'s WhatsApp number.'),
      h('p', { class: 'field__hint' }, elder.autoSend
        ? 'Each new question goes out on its day, once the last one is answered or skipped. ' + (cfg.whatsappReplies
          ? elder.name + ' can simply reply with a voice note: it lands in your archive, kept as Only me, and the next question waits for next week.'
          : 'The message asks ' + elder.name + ' to send the answer to you, not to us.')
        : 'Until then, send it yourself with the button above.'),
    );
  }

  function elderForm(open) {
    var form = h('form', { class: 'app-card' });
    var name = h('input', { name: 'name', required: true, maxlength: '40' });
    var relation = h('input', { name: 'relation', placeholder: 'Nani, Dad, my aunt…' });
    var phone = h('input', { name: 'phone', type: 'tel', autocomplete: 'off' });
    var day = options(h('select', { name: 'day' }), DAYS.map(function (d, i) { return { id: String(i), label: d }; }), String(new Date().getDay()));
    var signAs = h('input', { name: 'signAs', value: firstName(state.user.name) });
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var bMonth = options(h('select', { name: 'birthMonth', 'aria-label': 'Month' }), [{ id: '', label: 'Month' }].concat(MONTHS.map(function (m, i) { return { id: ('0' + (i + 1)).slice(-2), label: m }; })), '');
    var bDay = options(h('select', { name: 'birthDay', 'aria-label': 'Day' }), [{ id: '', label: 'Day' }].concat(Array.from({ length: 31 }, function (_, i) { var d = ('0' + (i + 1)).slice(-2); return { id: d, label: String(i + 1) }; })), '');
    var birthday = h('span', { class: 'app-inline' }, bDay, bMonth);
    var lang = options(h('select', { name: 'lang' }), core.LANGUAGES, 'en');
    add(form, [
      h('h2', null, open ? 'Who would you like to ask?' : 'Ask someone else too'),
      h('div', { class: 'app-form-grid' },
        field('Their name', name), field('Who are they to you? (optional)', relation),
        field('Their WhatsApp number (optional)', phone, cfg.weeklyAuto && store.mode === 'supabase'
          ? 'With the country code. It stays in your archive. It opens WhatsApp on your phone, or, if you switch on sending for you, the question is sent to it.'
          : 'With the country code. It stays in your archive and is only used to open WhatsApp on your phone.'),
        field('Which day?', day), field('Ask in', lang, 'They can answer in any language.'), field('Sign the message as', signAs),
        field('Their birthday (optional)', birthday, 'Just the day and month. We remind you a few days before.'),
      ),
      h('div', { class: 'btn-row' }, button('Start the weekly question', null, 'btn', 'submit')),
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      store.saveElder({ name: name.value.trim(), relation: relation.value.trim(), phone: phone.value.trim(), day: Number(day.value), signAs: signAs.value.trim(), lang: lang.value, birthday: bMonth.value && bDay.value ? bMonth.value + '-' + bDay.value : '' })
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
        h('p', null, 'One zip file with every story, photograph, recording and document, and a page that opens in any browser without the internet. Keep it anywhere.'),
        h('div', { class: 'btn-row' }, button('Download everything', exportAll, 'btn'), link('/if-we-close.html', 'Our promise if we ever close', 'text-link')),
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

  function exportAll() {
    if (exporting) return;
    exporting = true;
    say('Preparing your copy\u2026');
    Promise.all([store.entries(), loadPeople(true), store.elders(), store.legacy()]).then(function (r) {
      var archive = {
        owner: { name: state.user.name, email: state.user.email }, legacy: r[3], people: r[1], weekly: r[2],
        entries: r[0].filter(function (e) { return e.owner === state.user.id; }), exportedAt: new Date().toISOString(),
      };
      var files = exporter.layout(archive.entries);
      var fetched = {};
      return files.reduce(function (p, f, i) {
        return p.then(function () {
          say('Copying file ' + (i + 1) + ' of ' + files.length + '\u2026');
          return store.mediaUrl(f.media)
            .then(function (url) { return fetch(url); })
            .then(function (res) { if (!res.ok) throw new Error(res.status); return res.arrayBuffer(); })
            .then(function (buf) { fetched[f.path] = new Uint8Array(buf); }, function () {});
        });
      }, Promise.resolve()).then(function () {
        var parts = exporter.build(archive, files, fetched);
        var a = h('a', { href: URL.createObjectURL(new Blob(parts, { type: 'application/zip' })), download: 'family-archive-' + archive.exportedAt.slice(0, 10) + '.zip' });
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
        var missing = files.length - Object.keys(fetched).length;
        say(missing ? 'Your copy has been downloaded, but ' + plural(missing, 'file') + ' could not be copied. Try again later, or open them from the archive.' : 'Your copy has been downloaded: open \u201cStart here\u201d inside it.', !!missing);
      });
    }).catch(fail).then(function () { exporting = false; });
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

  // Entries already brought over (or declined) are remembered by id, so stories answered on the
  // home page later are still offered. Before ids were kept, one flag covered everything.
  function handledIds() {
    try { return JSON.parse(localStorage.getItem('tch-imported-ids') || 'null'); } catch (e) { return null; }
  }
  function markHandled(ids) {
    try {
      localStorage.setItem('tch-imported-ids', JSON.stringify(ids));
      localStorage.setItem('tch-imported', '1');
    } catch (e) {}
  }
  function waitingOnDevice() {
    var legacyDone = false;
    try { legacyDone = localStorage.getItem('tch-imported') === '1'; } catch (e) {}
    var weeklyOld = null;
    if (!legacyDone) try { weeklyOld = JSON.parse(localStorage.getItem('tch-weekly') || 'null'); } catch (e) {}
    return readOldArchive().then(function (old) {
      var handled = handledIds();
      if (!handled) {
        handled = legacyDone ? old.map(function (o) { return o.id; }) : [];
        if (legacyDone) markHandled(handled);
      }
      return {
        handled: handled,
        old: old.filter(function (o) { return handled.indexOf(o.id) === -1; }),
        elders: weeklyOld && Array.isArray(weeklyOld.elders) ? weeklyOld.elders : [],
        from: weeklyOld && weeklyOld.from,
      };
    });
  }

  function offerImport() {
    return waitingOnDevice().then(function (w) {
      var old = w.old;
      var elders = w.elders;
      if (!old.length && !elders.length) return;
      var fromHome = old.length && old.every(function (o) { return /^home-/.test(o.id); });
      var done = function () { markHandled(w.handled.concat(old.map(function (o) { return o.id; }))); };
      var card = h('section', { class: 'app-card app-import' },
        h('h2', null, fromHome ? (old.length === 1 ? 'Keep the story you wrote' : 'Keep the stories you wrote') : 'Bring over what you kept on this device'),
        h('p', null, fromHome
          ? 'You answered ' + plural(old.length, 'question') + ' on the home page in this browser. Add ' + (old.length === 1 ? 'it' : 'them') + ' to your archive? ' + (old.length === 1 ? 'It stays' : 'They stay') + ' private until you share ' + (old.length === 1 ? 'it' : 'them') + '.'
          : 'Before accounts, this browser kept ' + [old.length ? plural(old.length, 'archive entry', 'archive entries') : null, elders.length ? plural(elders.length, 'person', 'people') + ' you ask the weekly question' : null].filter(Boolean).join(' and ') + '. Add them to your archive? They will be private until you share them.'),
      );
      var row = h('div', { class: 'btn-row' });
      add(row, [
        button(fromHome ? 'Keep ' + (old.length === 1 ? 'it' : 'them') : 'Bring them over', function () {
          row.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
          importOld(old, elders, w.from).then(function () {
            done();
            flash = fromHome ? 'Kept in your archive. Nothing was deleted from this device.' : 'Brought over. Nothing was deleted from this device.';
            render();
          }).catch(fail);
        }),
        button('Not now', function () { done(); card.remove(); }, 'btn btn--ghost'),
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

  // ---------- adding to a place ----------
  var placeList = null;
  function loadPlaces() {
    if (placeList) return Promise.resolve(placeList);
    return fetch('/places/places.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
      .then(function (list) { placeList = list; return list; });
  }
  // ?week=W answers the question of week W since content/prompts.json "start".
  function loadWeek(w) {
    if (w === null || !/^\d+$/.test(w)) return Promise.resolve(null);
    return fetch('/community/prompts.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (data) {
        if (!data || !data.prompts.length) return null;
        return { week: Number(w), prompt: data.prompts[Number(w) % data.prompts.length] };
      });
  }
  function placeName(list, c) {
    var p = list.filter(function (x) { return x.slug === c.placeSlug; })[0];
    return p ? p.name : c.suggestedPlace ? c.suggestedPlace + ' (a new place)' : c.placeSlug;
  }
  var REVIEW = { pending: 'Waiting to be read', published: 'Published', rejected: 'Not published' };
  var WORD = core.CONTRIBUTION_KINDS[0];

  function contribute(_, query) {
    var editId = query.get('edit');
    return Promise.all([loadPlaces(), store.myContributions(), store.isModerator(), editId ? store.contribution(editId) : null]).then(function (r) {
      var list = r[0];
      var sent = r[1];
      var editing = r[3];
      if (editId && !editing) throw new Error('That is not something you shared, or it has been deleted.');
      return loadWeek(editing ? (editing.promptWeek === null ? null : String(editing.promptWeek)) : query.get('week')).then(function (week) {
        var prompt = week && week.prompt;
        var wantKind = editing ? editing.kind : prompt ? prompt.kind : query.get('kind');
        if (core.CONTRIBUTION_KINDS.indexOf(wantKind) < 0) wantKind = core.CONTRIBUTION_KINDS[0];
        var chosen = list.filter(function (p) { return p.slug === (editing ? editing.placeSlug : query.get('place')); })[0];
        var h1 = editing
          ? page('Change what you shared', 'Once you save it, it is read again before it appears.')
          : page(chosen ? 'Add to ' + chosen.name : 'Add to a place', 'A word with no translation, a dish, a festival as your grandparents kept it, a song, a street that has changed. Everything is read before it appears, and credited the way you choose.');
        if (prompt) {
          add(view, h('div', { class: 'app-card app-prompt' },
            h('p', { class: 'eyebrow' }, editing ? 'Your answer to the question' : 'Answering this week\'s question'),
            h('p', { class: 'app-prompt__text' }, prompt.text),
            prompt.hashtag && !editing ? h('p', { class: 'field__hint' }, 'Sharing it on Instagram too? Use #' + prompt.hashtag + ' and tag @theculturedhuman.') : null));
        }
        var form = h('form', { class: 'app-card app-form app-contribute' });
        var place = options(h('select', { name: 'place' }),
          [{ id: '?', label: 'Choose a place' }].concat(list.map(function (p) { return { id: p.slug, label: p.name }; }), [{ id: '', label: 'Somewhere else' }]),
          chosen ? chosen.slug : editing ? '' : '?');
        var other = h('input', { name: 'suggestedPlace', maxlength: 120, value: editing && editing.suggestedPlace || '' });
        var otherField = field('Which place?', other, 'A town, village or region. When a place has a few contributions, it gets its own page.');
        function showOther() { otherField.hidden = place.value !== ''; }
        place.addEventListener('change', showOther);
        showOther();
        var kind = options(h('select', { name: 'kind' }), core.CONTRIBUTION_KINDS.map(function (k) { return { id: k, label: k }; }), wantKind);
        var title = h('input', { name: 'title', required: true, maxlength: 120, value: editing ? editing.title : '' });
        var script = h('input', { name: 'script', maxlength: 120, value: editing && editing.script || '' });
        var pronunciation = h('input', { name: 'pronunciation', maxlength: 120, value: editing && editing.pronunciation || '' });
        var scriptField = field('The word in its own script (optional)', script, 'For example ঠাকুমা, ಅಜ್ಜಿ or ਨਾਨੀ.');
        var sayField = field('How it is said (optional)', pronunciation, 'Spell it the way it sounds, for example "THAA-koo-maa".');
        var body = h('textarea', { name: 'body', rows: 8, required: true, maxlength: 5000 });
        body.value = editing ? editing.body : '';
        var credit = h('input', { name: 'credit', required: true, maxlength: 80, value: editing ? editing.credit : state.user.name || '' });
        var consent = h('input', { type: 'checkbox', name: 'consent', required: true });
        var bodyField = field('Tell us about it', body, 'What it means, how your family says it, makes it or keeps it, and where you heard it.', true);
        function showWord() {
          var word = kind.value === WORD;
          scriptField.hidden = !word;
          sayField.hidden = !word;
          title.previousElementSibling.textContent = word ? 'For example the word itself, written in English letters.' : 'For example the name of the dish or the song.';
          bodyField.querySelector('.field__hint').textContent = word
            ? 'What it means, when your family says it, and where you heard it.'
            : 'What it is, how your family makes it or keeps it, and where you learnt it.';
        }
        add(form, [
          h('div', { class: 'app-form-grid' },
            field('Place', place),
            otherField,
            field('What are you adding?', kind),
            field('Title', title, ' '),
            scriptField,
            sayField,
            bodyField,
            field('How should we credit you?', credit, 'It appears with your words, for example "Anita, whose grandmother was from Jorhat".', true)),
          h('label', { class: 'app-check app-consent' }, consent,
            h('span', null, 'This is mine to share: my own words or my family\'s, with nothing private about someone who has not agreed. It follows the ',
              h('a', { href: '/community-guidelines.html', target: '_blank', rel: 'noopener' }, 'community guidelines'), '.')),
          store.mode === 'local' ? h('p', { class: 'field__hint' }, 'Preview mode: this stays in this browser and nobody reads it.') : null,
          h('div', { class: 'btn-row' },
            h('button', { type: 'submit', class: 'btn' }, editing ? 'Save and send to be read' : 'Send it to be read'),
            editing ? link('#/contribute', 'Cancel', 'btn btn--ghost') : null),
          h('p', { class: 'field__hint' }, 'You can change or delete it later. How we use what you share: ', link('/privacy.html', 'privacy'), '.'),
        ]);
        kind.addEventListener('change', showWord);
        showWord();
        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var btn = form.querySelector('[type="submit"]');
          btn.disabled = true;
          Promise.resolve().then(function () {
            if (place.value === '?') throw new Error('Please choose the place, or pick "Somewhere else" and name it.');
            var fields = {
              placeSlug: place.value, suggestedPlace: other.value, kind: kind.value, title: title.value, body: body.value, credit: credit.value,
              script: script.value, pronunciation: pronunciation.value, promptWeek: editing ? editing.promptWeek : week ? week.week : null, consent: consent.checked,
            };
            return editing ? store.updateContribution(editing.id, fields) : store.contribute(fields);
          }).then(function () {
            flash = editing ? 'Saved. It will be read again before it appears.' : 'Thank you. It will appear once it has been read. We will email you when it does.';
            if (editing) { location.hash = '#/contribute'; return null; }
            return render();
          }).catch(fail).then(function () { btn.disabled = false; });
        });
        add(view, form);
        if (sent.length && !editing) {
          add(view, h('h2', { class: 'app-sub' }, 'What you have shared'));
          add(view, h('div', { class: 'app-list' }, sent.map(function (c) { return sentCard(c, list); })));
        }
        if (r[2]) add(view, h('p', null, link('#/moderate', 'Read contributions waiting to be published', 'text-link')));
        return h1;
      });
    });
  }

  function sentCard(c, places) {
    function remove() {
      if (!confirm('Delete "' + c.title + '"? It will be removed from the site and cannot be brought back.')) return;
      store.deleteContribution(c.id).then(function () {
        flash = '"' + c.title + '" is deleted.';
        return render();
      }).catch(fail);
    }
    return h('article', { class: 'app-card app-sent' },
      h('p', { class: 'eyebrow' }, c.kind + ' · ' + placeName(places, c)),
      h('h3', null, c.status === 'published' && store.mode !== 'local' ? link('/s/' + c.id, c.title) : c.title),
      h('p', { class: 'app-sent__status app-sent__status--' + c.status }, REVIEW[c.status] || c.status),
      c.status === 'rejected' && c.reviewNote ? h('p', { class: 'app-sent__note' }, h('strong', null, 'Why: '), c.reviewNote) : null,
      c.status === 'rejected' ? h('p', { class: 'field__hint' }, 'You can change it and send it again.') : null,
      h('div', { class: 'btn-row' }, link('#/contribute?edit=' + c.id, 'Change', 'btn btn--ghost btn--small'), button('Delete', remove, 'btn btn--ghost btn--small')));
  }

  function safeBack(back, fallback) {
    return back && /^\/(?!\/)[\w\/.#?=&-]*$/.test(back) ? back : fallback;
  }

  function reportForm(_, query) {
    var id = query.get('c') || '';
    var back = safeBack(query.get('back'), '/manch.html');
    var h1 = page('Report this', 'Tell us what is wrong. A moderator reads every report, and the person who shared it is not told who reported it.');
    var form = h('form', { class: 'app-card app-form' });
    var list = h('fieldset', { class: 'app-reasons' }, h('legend', null, 'What is wrong?'));
    core.REPORT_REASONS.forEach(function (r, i) {
      add(list, h('label', { class: 'app-check' }, h('input', { type: 'radio', name: 'reason', value: r.id, required: i === 0 }), ' ' + r.label));
    });
    var note = h('textarea', { name: 'note', rows: 4, maxlength: 500 });
    add(form, [
      list,
      field('Anything we should know (optional)', note, 'Needed for "It is wrong" and "Something else".', true),
      h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn' }, 'Send report'), h('a', { href: back, class: 'btn btn--ghost' }, 'Cancel')),
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var picked = form.querySelector('[name="reason"]:checked');
      Promise.resolve().then(function () {
        return store.report(id, { reason: picked ? picked.value : '', note: note.value });
      }).then(function () {
        view.textContent = '';
        var done = page('Thank you', 'A moderator will read it. If it breaks the community guidelines, it will be taken down.');
        add(view, h('p', null, h('a', { href: back, class: 'btn' }, 'Go back')));
        done.focus();
      }).catch(fail);
    });
    add(view, form);
    return h1;
  }

  function contributionReview(c, places, extra) {
    return h('article', { class: 'app-card app-review' },
      h('p', { class: 'eyebrow' }, c.kind + ' · ' + placeName(places, c)),
      h('h2', null, c.title),
      c.script || c.pronunciation ? h('p', { class: 'app-review__word' }, [c.script, c.pronunciation ? '"' + c.pronunciation + '"' : null].filter(Boolean).join(' · ')) : null,
      h('p', { class: 'app-review__body' }, c.body),
      h('p', { class: 'carry-card__credit' }, 'Shared by ' + c.credit + (c.createdAt ? ', ' + core.formatDate(c.createdAt) : '')),
      extra);
  }

  // Asks why before anything is left unpublished or taken down; the person who shared it sees the reason.
  function askReason(onDone, label) {
    var box = h('form', { class: 'app-reason' });
    var note = h('textarea', { rows: 2, maxlength: 300, required: true });
    add(box, [
      field('Why? The person who shared it will see this.', note, 'For example "It names a neighbour who has not agreed" or "Please say where you heard it".', true),
      h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn' }, label)),
    ]);
    box.addEventListener('submit', function (ev) { ev.preventDefault(); onDone(note.value); });
    return box;
  }

  // Contributions for places without a page. Ones that belong to an existing place move in one click;
  // a new place needs its page built, with the command shown.
  function moderateSuggestions(places, groups) {
    if (!groups.length) return;
    add(view, h('h2', { class: 'app-sub' }, 'Places families have suggested'));
    add(view, h('p', { class: 'field__hint' }, 'Contributions for places that have no page yet. Publishing them shows them in The Commons; moving them puts them on a place page.'));
    add(view, h('div', { class: 'app-list' }, groups.map(function (g) {
      var match = places.filter(function (p) { return p.slug === g.match; })[0];
      function move(slug, label) {
        return function () {
          store.adoptSuggestion(g.ids, slug).then(function (n) {
            flash = plural(n, 'contribution') + ' moved to ' + label + '.';
            return render();
          }).catch(fail);
        };
      }
      var command = 'npm run new-place -- --name "' + g.name.replace(/"/g, '') + '" --region "…" --lat … --lng …';
      return h('article', { class: 'app-card app-suggestion' },
        h('p', { class: 'eyebrow' }, plural(g.ids.length, 'contribution') + ' · ' + g.published + ' published'),
        h('h3', null, g.name),
        g.names.length > 1 ? h('p', { class: 'field__hint' }, 'Written as ' + g.names.join(', ')) : null,
        match
          ? [h('p', null, g.name + ' is part of ' + match.name + '.'), h('div', { class: 'btn-row' }, button('Move to ' + match.name, move(match.slug, match.name)))]
          : [h('p', null, 'To give ' + g.name + ' its own page, run this in the project, then deploy:'), h('pre', { class: 'app-command' }, h('code', null, command)),
            h('p', { class: 'field__hint' }, 'It writes content/places/' + g.slug + '.json and, with the service key set, moves these contributions to the new page.')]);
    })));
  }

  function moderate() {
    var h1 = page('To read', 'Publish what families and makers have sent so it appears on the site, or leave it unpublished with a reason. Check it is theirs to share and contains nothing private about someone else.');
    return store.isModerator().then(function (yes) {
      if (!yes) {
        add(view, h('p', null, 'Only moderators can read contributions before they are published.'));
        return h1;
      }
      return Promise.all([loadPlaces(), store.pendingContributions(), store.pendingListings(), store.bookingsToSettle(), store.pendingReports(), store.suggestedPlaces(), store.recentlyPublished()]).then(function (r) {
        var places = r[0];
        moderateFeatured(places, r[6]);
        moderateSuggestions(places, core.groupSuggestions(r[5], places));
        if (r[4].length) {
          add(view, h('h2', { class: 'app-sub' }, 'Reported'));
          add(view, h('div', { class: 'app-list' }, r[4].map(function (item) {
            var c = item.contribution;
            var holder = h('div');
            function keep() {
              store.resolveReports(c.id).then(function () { flash = '"' + c.title + '" stays up.'; return render(); }).catch(fail);
            }
            function takeDown() {
              holder.textContent = '';
              holder.appendChild(askReason(function (note) {
                store.reviewContribution(c.id, 'rejected', note).then(function () { return store.resolveReports(c.id); }).then(function () {
                  flash = '"' + c.title + '" is taken down.';
                  return render();
                }).catch(fail);
              }, 'Take it down'));
              holder.querySelector('textarea').focus();
            }
            add(holder, h('div', { class: 'btn-row' }, button('Take it down', takeDown), button('Keep it up', keep, 'btn btn--ghost')));
            return contributionReview(c, places, [
              h('ul', { class: 'app-reports' }, item.reports.map(function (rep) {
                var reason = core.REPORT_REASONS.filter(function (x) { return x.id === rep.reason; })[0];
                return h('li', null, h('strong', null, reason ? reason.label : rep.reason), rep.note ? ': ' + rep.note : '');
              })),
              holder,
            ]);
          })));
        }
        moderateMarket(places, r[2], r[3]);
        if (!r[1].length) {
          add(view, h('p', { class: 'app-empty' }, 'Nothing is waiting. Everything sent has been read.'));
          return h1;
        }
        add(view, h('h2', { class: 'app-sub' }, 'Contributions'));
        add(view, h('div', { class: 'app-list' }, r[1].map(function (c) {
          var holder = h('div');
          function publish() {
            store.reviewContribution(c.id, 'published').then(function () { flash = '"' + c.title + '" is published.'; return render(); }).catch(fail);
          }
          function decline() {
            holder.textContent = '';
            holder.appendChild(askReason(function (note) {
              store.reviewContribution(c.id, 'rejected', note).then(function () { flash = '"' + c.title + '" will not be published.'; return render(); }).catch(fail);
            }, 'Do not publish'));
            holder.querySelector('textarea').focus();
          }
          add(holder, h('div', { class: 'btn-row' }, button('Publish', publish), button('Do not publish', decline, 'btn btn--ghost')));
          return contributionReview(c, places, holder);
        })));
        return h1;
      });
    });
  }

  // What is featured shows first on The Commons, the home page and its place page.
  function moderateFeatured(places, list) {
    if (!list.length) return;
    var featured = list.filter(function (c) { return c.featuredAt; });
    var box = h('details', { class: 'app-more app-featured' },
      h('summary', null, 'Featured on The Commons (' + featured.length + ')'),
      h('p', { class: 'field__hint' }, 'Featured contributions are shown first on The Commons, the home page and their place\u2019s page. Choose one or two a week that others will want to answer.'));
    add(box, h('ul', { class: 'app-featured__list' }, list.map(function (c) {
      return h('li', null,
        h('span', null, h('strong', null, c.title), ' \u00b7 ' + placeName(places, c) + ' \u00b7 ' + c.credit),
        button(c.featuredAt ? 'Stop featuring' : 'Feature', function () {
          store.featureContribution(c.id, !c.featuredAt).then(function () {
            flash = c.featuredAt ? '"' + c.title + '" is no longer featured.' : '"' + c.title + '" is featured.';
            return render();
          }).catch(fail);
        }, c.featuredAt ? 'btn btn--small' : 'btn btn--ghost btn--small'));
    })));
    add(view, box);
  }

  // ---------- makers, hosts and storytellers ----------
  var LISTING_STATUS = { pending: 'Being read: not public yet', published: 'Public', paused: 'Not public' };
  function roleLabel(id) { var r = core.listingRole(id); return r ? r.label : id; }
  function listingCard(l, places) {
    var p = places.filter(function (x) { return x.slug === l.placeSlug; })[0];
    return h('article', { class: 'app-card app-listing' },
      h('p', { class: 'eyebrow' }, roleLabel(l.role) + ' · ' + (p ? p.name : l.placeSlug)),
      h('h2', null, l.name),
      h('p', null, l.summary),
      l.languages.length ? h('p', { class: 'app-listing__meta' }, 'Speaks ' + l.languages.join(', ')) : null,
      l.priceNote ? h('p', { class: 'app-listing__meta' }, l.priceNote) : null,
      l.link ? h('p', { class: 'app-listing__meta' }, h('a', { href: l.link, rel: 'noopener nofollow' }, 'See their work')) : null);
  }
  function money(b, side) {
    if (b.pricePaise == null) return null;
    var fee = b.feePaise != null ? b.feePaise : core.platformFee(b.pricePaise, FEE_PERCENT);
    return h('dl', { class: 'app-quote' },
      h('div', null, h('dt', null, side === 'provider' ? 'Your price' : side === 'moderator' ? 'Their price (pay them this)' : 'Their price'), h('dd', null, core.formatRupees(b.pricePaise))),
      h('div', null, h('dt', null, 'Platform fee (' + FEE_PERCENT + '%)'), h('dd', null, core.formatRupees(fee))),
      h('div', { class: 'app-quote__total' }, h('dt', null, 'Total'), h('dd', null, core.formatRupees(b.pricePaise + fee))));
  }

  function offer(_, query) {
    return Promise.all([loadPlaces(), store.myListings()]).then(function (r) {
      var places = r[0];
      var mine = r[1];
      var editing = mine.filter(function (l) { return l.id === query.get('edit'); })[0] || null;
      var h1 = page(editing ? 'Edit your listing' : 'Offer your work', 'Makers, hosts and storytellers list themselves here. Families find you on the page of the place you work in, and send you requests. You set your price; the ' + FEE_PERCENT + '% platform fee is added on top and shown separately.');
      if (mine.length && !editing) {
        add(view, h('h2', { class: 'app-sub' }, 'Your listings'));
        add(view, h('div', { class: 'app-list' }, mine.map(function (l) {
          var card = listingCard(l, places);
          add(card, [
            h('p', { class: 'app-sent__status app-sent__status--' + (l.status === 'published' ? 'published' : l.status === 'paused' ? 'rejected' : 'pending') }, LISTING_STATUS[l.status] || l.status),
            h('div', { class: 'btn-row' }, link('#/offer?edit=' + l.id, 'Edit', 'btn btn--ghost'), link('#/requests', 'Requests to you', 'text-link')),
          ]);
          return card;
        })));
        add(view, h('h2', { class: 'app-sub' }, 'Add another listing'));
      }
      var start = editing || { role: core.listingRole(query.get('role')) ? query.get('role') : 'maker', placeSlug: '', name: state.user.name || '', summary: '', languages: [], link: '', priceNote: '' };
      var form = h('form', { class: 'app-card app-form app-offer' });
      var role = options(h('select', { name: 'role' }), core.LISTING_ROLES.map(function (x) { return { id: x.id, label: x.label + ': ' + x.what }; }), start.role);
      var place = options(h('select', { name: 'place', required: true }), [{ id: '', label: 'Choose a place' }].concat(places.map(function (p) { return { id: p.slug, label: p.name }; })), start.placeSlug);
      var name = h('input', { name: 'name', required: true, maxlength: 80, value: start.name });
      var summary = h('textarea', { name: 'summary', rows: 6, required: true, maxlength: 600 });
      summary.value = start.summary;
      var languages = h('input', { name: 'languages', maxlength: 200, value: start.languages.join(', ') });
      var priceNote = h('input', { name: 'priceNote', maxlength: 80, value: start.priceNote || '' });
      var site = h('input', { name: 'link', type: 'url', maxlength: 300, value: start.link || '', placeholder: 'https://' });
      add(form, [
        h('div', { class: 'app-form-grid' },
          field('What do you offer?', role),
          field('Where do you work?', place, 'Your listing appears on this place\'s page. Not listed? Add your place first from Add to a place.'),
          field('Name families will see', name, 'Your own name, or your studio\'s.'),
          field('Languages you speak', languages, 'Separated by commas, for example Maithili, Hindi, English.'),
          field('What you offer', summary, 'What you make or do, the tradition it comes from, how long it usually takes, and anything a family should know before asking.', true),
          field('Price guide (optional)', priceNote, 'For example "From ₹2,500 a session" or "Paintings from ₹6,000". You quote the real price for each request.'),
          field('Link to your work (optional)', site, 'Instagram, a website or a portfolio.')),
        h('p', { class: 'field__hint' }, 'A person reads every listing, and every change, before it is public. ' + (store.mode === 'local' ? 'Preview mode: this stays in this browser and nobody reads it.' : '')),
        h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn' }, editing ? 'Save and send to be read' : 'Send my listing to be read'), editing ? link('#/offer', 'Cancel', 'btn btn--ghost') : null),
      ]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        Promise.resolve().then(function () {
          return store.saveListing({ id: editing && editing.id, role: role.value, placeSlug: place.value, name: name.value, summary: summary.value, languages: languages.value, priceNote: priceNote.value, link: site.value });
        }).then(function () {
          state.market = true;
          flash = 'Thank you. Your listing will be public once a person has read it. You can see its status here.';
          if (editing) location.hash = '#/offer';
          else return render();
        }).catch(fail).then(function () { btn.disabled = false; });
      });
      add(view, form);
      return h1;
    });
  }

  var ASK_HINT = {
    maker: 'What you would like made, for whom, any size or deadline, and what it should remember: a place, a family name, a story.',
    host: 'Where your family comes from, what you already know (a village, a family name, an old photograph), when you might travel and who is coming.',
    storyteller: 'Who you would like recorded, where they live, the language they are most at ease in, and what you hope to keep.',
  };
  function requestForm(_, query) {
    return Promise.all([loadPlaces(), store.listing(query.get('listing') || '')]).then(function (r) {
      var l = r[1];
      if (!l || l.status !== 'published') {
        var h0 = page('Send a request', null);
        add(view, h('p', null, 'This listing is not available. ', link('/journeys.html', 'Find a host', 'text-link'), ' · ', link('/marketplace.html', 'Find a maker', 'text-link')));
        return h0;
      }
      var h1 = page('Ask ' + l.name, 'Tell them what you would like. They reply with a price; the ' + FEE_PERCENT + '% platform fee is added on top and shown separately. Nothing is charged until you accept.');
      add(view, listingCard(l, r[0]));
      var form = h('form', { class: 'app-card app-form app-request' });
      var message = h('textarea', { name: 'message', rows: 8, required: true, maxlength: 5000 });
      add(form, [
        field('Your request', message, ASK_HINT[l.role] || '', true),
        h('p', { class: 'field__hint' }, 'Your email is shared with them only if you accept their quote.'),
        h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn' }, (core.listingRole(l.role) || {}).ask || 'Send request')),
      ]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        Promise.resolve().then(function () { return store.requestBooking(l.id, message.value); }).then(function () {
          state.market = true;
          flash = 'Sent. ' + l.name + ' will reply here with a price.';
          location.hash = '#/requests';
        }).catch(fail).then(function () { btn.disabled = false; });
      });
      add(view, form);
      return h1;
    });
  }

  function bookingCard(b, places, opts) {
    var l = b.listing || { name: 'A listing', role: '', placeSlug: '' };
    var p = places.filter(function (x) { return x.slug === l.placeSlug; })[0];
    var side = opts.side || b.side;
    var card = h('article', { class: 'app-card app-booking', 'data-booking': b.id },
      h('p', { class: 'eyebrow' }, (side === 'provider' ? 'Request to ' : roleLabel(l.role) + ' · ') + l.name + (p ? ' · ' + p.name : '')),
      h('p', { class: 'app-sent__status app-sent__status--' + (b.status === 'cancelled' ? 'rejected' : /paid|completed|accepted/.test(b.status) ? 'published' : 'pending') }, (core.BOOKING_STATUS[b.status] || {})[side === 'moderator' ? 'provider' : side] || b.status),
      h('p', { class: 'app-booking__message' }, b.message),
      money(b, side),
      b.reply ? h('p', { class: 'app-booking__reply' }, h('strong', null, l.name + ': '), b.reply) : null,
      h('p', { class: 'field__hint' }, 'Sent ' + core.formatDate(b.createdAt)));
    function act(change, done) {
      return function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        store.updateBooking(b.id, change).then(function () { flash = done; return render(); }).catch(fail);
      };
    }
    if (side === 'provider' && (b.status === 'requested' || b.status === 'quoted')) {
      var form = h('form', { class: 'app-form app-quote-form' });
      var rupees = h('input', { name: 'rupees', inputmode: 'decimal', required: true, value: b.pricePaise != null ? String(b.pricePaise / 100) : '' });
      var reply = h('textarea', { name: 'reply', rows: 3, maxlength: 2000 });
      reply.value = b.reply || '';
      var preview = h('p', { class: 'field__hint', 'aria-live': 'polite' });
      function showFee() {
        try {
          var q = core.quote({ rupees: rupees.value });
          var fee = core.platformFee(q.pricePaise, FEE_PERCENT);
          preview.textContent = 'You receive ' + core.formatRupees(q.pricePaise) + '. The family pays ' + core.formatRupees(q.pricePaise + fee) + ', including the ' + FEE_PERCENT + '% platform fee.';
        } catch (e) { preview.textContent = 'You receive your full price. The ' + FEE_PERCENT + '% platform fee is added on top for the family.'; }
      }
      rupees.addEventListener('input', showFee);
      showFee();
      add(form, [
        h('div', { class: 'app-form-grid' },
          field('Your price in rupees', rupees),
          field('A note with your quote (optional)', reply, 'What is included, how long it takes, and any questions.', true)),
        preview,
        h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn' }, b.status === 'quoted' ? 'Update quote' : 'Send quote'),
          button('I can\'t take this on', function () { act({ status: 'cancelled', reply: reply.value.trim() || null }, 'Done. The family will see that you can\'t take this on.')(); }, 'btn btn--ghost')),
      ]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var q;
        try { q = core.quote({ rupees: rupees.value, reply: reply.value }); } catch (e) { return fail(e); }
        act({ quote: q }, 'Quote sent. The family will see it here.')();
      });
      add(card, form);
    }
    if (side === 'family' && b.status === 'quoted') {
      add(card, h('div', { class: 'btn-row' },
        button('Accept ' + core.formatRupees(b.pricePaise + b.feePaise), act({ status: 'accepted' }, 'Accepted. You can pay below, and you can now reach ' + l.name + ' directly.')),
        button('Decline', act({ status: 'cancelled' }, 'Declined.'), 'btn btn--ghost')));
    }
    if (side === 'family' && b.status === 'accepted') {
      var payBtn = button('Pay ' + core.formatRupees(b.pricePaise + b.feePaise) + ' securely', function () { payOnline(b, l, payBtn); });
      add(card, h('div', { class: 'app-pay' },
        h('div', { class: 'btn-row' }, payBtn),
        h('p', { class: 'field__hint' }, 'By UPI, card or net banking, through Razorpay. ' + l.name + ' receives ' + core.formatRupees(b.pricePaise) + '; the rest is our ' + FEE_PERCENT + '% fee.')));
    }
    if (side === 'family' && b.status === 'requested') {
      add(card, h('div', { class: 'btn-row' }, button('Cancel request', act({ status: 'cancelled' }, 'Request cancelled.'), 'btn btn--ghost')));
    }
    if (/^(accepted|paid|completed)$/.test(b.status)) {
      var box = h('div', { class: 'app-contacts' });
      add(card, box);
      store.bookingContacts(b.id).then(function (rows) {
        add(box, rows.map(function (c) {
          return h('p', null, (c.side === 'provider' ? 'Reach ' : 'The family: ') + c.name + ' at ', c.email ? h('a', { href: 'mailto:' + c.email }, c.email) : 'their email is not on file');
        }));
      }).catch(function () {});
    }
    if (opts.settle) add(card, opts.settle);
    return card;
  }

  function postJson(url, body, token) {
    return fetch(url, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}),
      body: JSON.stringify(body),
    }).then(function (res) {
      var json = /json/.test(res.headers.get('content-type') || '') ? res.json() : Promise.resolve(null);
      return json.then(function (data) {
        if (!data) return { unavailable: true };
        if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
        return data;
      });
    });
  }
  var checkoutReady = null;
  function loadCheckout() {
    if (!checkoutReady) {
      checkoutReady = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = resolve;
        s.onerror = function () { checkoutReady = null; reject(new Error('The payment window could not load. Check your connection and try again.')); };
        document.head.appendChild(s);
      });
    }
    return checkoutReady;
  }
  // Razorpay Checkout when the site's payment function has keys; otherwise the manual payment link.
  function payOnline(b, l, btn) {
    var token = store.accessToken ? store.accessToken() : null;
    btn.disabled = true;
    postJson('/api/razorpay-order', { bookingId: b.id }, token).then(function (order) {
      if (order.unavailable || order.dryRun) {
        flash = 'Online payment is not switched on yet. We will email you a secure payment link for ' + core.formatRupees(b.pricePaise + b.feePaise) + ' instead.';
        return render();
      }
      return loadCheckout().then(function () {
        return new Promise(function (resolve, reject) {
          var rz = new window.Razorpay({
            key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
            name: 'The Cultured Human', description: order.name + (order.testMode ? ' (test payment)' : ''),
            prefill: { email: order.email }, theme: { color: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#28594B' },
            handler: function (resp) {
              postJson('/api/razorpay-order', { bookingId: b.id, orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }, token).then(resolve, reject);
            },
            modal: { ondismiss: function () { resolve(null); } },
          });
          rz.on('payment.failed', function (r) { reject(new Error((r.error && r.error.description) || 'The payment did not go through. Nothing was charged.')); });
          rz.open();
        });
      }).then(function (done) {
        if (!done) return null;
        flash = 'Paid. Thank you! ' + l.name + ' has been told and can begin.';
        return render();
      });
    }).catch(fail).then(function () { btn.disabled = false; });
  }

  function requests() {
    var h1 = page('Requests', 'Requests you have sent to makers, hosts and storytellers, and requests families have sent you.');
    return Promise.all([loadPlaces(), store.myBookings(), store.myListings()]).then(function (r) {
      var places = r[0];
      var sent = r[1].filter(function (b) { return b.side === 'family'; });
      var received = r[1].filter(function (b) { return b.side === 'provider'; });
      if (r[2].length) {
        add(view, h('h2', { class: 'app-sub' }, 'Requests to you'));
        add(view, received.length
          ? h('div', { class: 'app-list' }, received.map(function (b) { return bookingCard(b, places, {}); }))
          : h('p', { class: 'app-empty' }, r[2].some(function (l) { return l.status === 'published'; }) ? 'No requests yet. Share your place\'s page so families can find you.' : 'Requests will appear here once your listing is public.'));
      }
      add(view, h('h2', { class: 'app-sub' }, 'Requests you sent'));
      add(view, sent.length
        ? h('div', { class: 'app-list' }, sent.map(function (b) { return bookingCard(b, places, {}); }))
        : h('p', { class: 'app-empty' }, 'None yet. Find a ', link('/marketplace.html', 'maker', 'text-link'), ', a ', link('/journeys.html', 'host', 'text-link'), ' or a ', link('/family-stories.html', 'storyteller', 'text-link'), ' on the page of your family\'s place.'));
      add(view, h('p', null, link('#/offer', r[2].length ? 'Your listings' : 'Are you a maker, host or storyteller? Offer your work', 'text-link')));
      return h1;
    });
  }

  function echo(_, query) {
    var id = query.get('c') || '';
    var back = safeBack(query.get('back'), '/manch.html');
    var h1 = page('We have this too', null);
    return store.echo(id).then(function () {
      location.replace(back);
      return h1;
    });
  }

  function moderateMarket(places, listings, bookings) {
    if (listings.length) {
      add(view, h('h2', { class: 'app-sub' }, 'Listings to read'));
      add(view, h('div', { class: 'app-list' }, listings.map(function (l) {
        var card = listingCard(l, places);
        card.classList.add('app-review');
        function review(status) {
          return function () {
            store.reviewListing(l.id, status).then(function () {
              flash = status === 'published' ? l.name + ' is public.' : l.name + ' will stay private.';
              return render();
            }).catch(fail);
          };
        }
        add(card, h('div', { class: 'btn-row' }, button('Publish listing', review('published')), button('Not now', review('paused'), 'btn btn--ghost')));
        return card;
      })));
    }
    if (bookings.length) {
      add(view, h('h2', { class: 'app-sub' }, 'Bookings to settle'));
      add(view, h('p', { class: 'field__hint' }, 'Families who pay online are marked paid automatically. Otherwise, send the family a payment link for the total, then record the payment reference here. When the work is done, mark it completed and pay the maker their price.'));
      add(view, h('div', { class: 'app-list' }, bookings.map(function (b) {
        var settle;
        if (b.status === 'accepted') {
          var ref = h('input', { name: 'paymentRef', maxlength: 120 });
          settle = h('form', { class: 'app-form' }, field('Payment reference', ref, 'From the payment link, once the family has paid.'), h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn' }, 'Mark as paid')));
          settle.addEventListener('submit', function (ev) {
            ev.preventDefault();
            if (!ref.value.trim()) return fail(new Error('Please add the payment reference.'));
            store.updateBooking(b.id, { status: 'paid', paymentRef: ref.value.trim() }).then(function () { flash = 'Recorded as paid.'; return render(); }).catch(fail);
          });
        } else {
          settle = h('div', { class: 'btn-row' }, button('Mark as completed', function () {
            store.updateBooking(b.id, { status: 'completed' }).then(function () { flash = 'Marked as completed.'; return render(); }).catch(fail);
          }));
        }
        return bookingCard(b, places, { side: 'moderator', settle: settle });
      })));
    }
  }

  function signedOut() {
    state.user = null;
    state.people = null;
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
      restoreWanted();
      return Promise.all([
        store.touchSeen().then(function (l) { state.legacy = l; }),
        Promise.all([store.myListings(), store.myBookings()]).then(function (r) { state.market = r[0].length + r[1].length > 0; }, function () {}),
      ]);
    }).then(render);
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
