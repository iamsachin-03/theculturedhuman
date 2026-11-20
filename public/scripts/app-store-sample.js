// A sample family archive, opened with /app.html?sample, so visitors can look around a lived-in
// archive before they start their own. The family is invented. Everything is read-only and kept
// in memory; nothing is saved and nothing leaves the browser. The one real thing is an optional voice
// note, recorded with its speaker's consent (content/sample-voice-note.json, tools/lib/sample-voice.mjs).
(function (root) {
  var core = root.TCH.core;
  var NO = 'This is a sample archive, so nothing here can be changed. Start your own archive to keep your family\u2019s stories.';
  var DAY = 86400000;
  function ago(days) { return new Date(Date.now() - days * DAY).toISOString(); }
  function art(id) { return '/assets/illustrations/' + id + '-1600.jpg'; }

  var ASHA = 'sample-asha';
  var RAVI = 'sample-ravi';
  var user = { id: ASHA, email: 'asha@example.org', name: 'Asha Mishra' };
  var people = [
    { id: 'p-anaya', owner: ASHA, name: 'Anaya', email: 'anaya@example.org', role: 'beloved', userId: null, createdAt: ago(60) },
    { id: 'p-meera', owner: ASHA, name: 'Meera Mishra', email: 'meera@example.org', role: 'family_view', userId: 'sample-meera', createdAt: ago(60) },
    { id: 'p-ravi', owner: ASHA, name: 'Ravi Mishra', email: 'ravi@example.org', role: 'family_edit', userId: RAVI, createdAt: ago(60) },
    { id: 'p-sunil', owner: ASHA, name: 'Sunil Mishra', email: 'sunil@example.org', role: 'legacy', userId: null, createdAt: ago(58) },
  ];
  var elders = [
    { id: 'el-nani', owner: ASHA, name: 'Nani', relation: 'Grandmother', phone: '', day: 0, idx: 6, answered: 5, askedAt: ago(3), birthday: '03-12', createdAt: ago(45) },
  ];
  // Nanaji's remembrance day is always a few days away, so the sample shows how one comes round.
  var soon = new Date(Date.now() + 9 * 86400000);
  var remembered = [
    { id: 'rm-nanaji', owner: ASHA, name: 'Nanaji', relation: 'Grandfather', diedOn: ('0' + (soon.getMonth() + 1)).slice(-2) + '-' + ('0' + soon.getDate()).slice(-2), bornOn: '', bornYear: 1931, diedYear: 2011, createdAt: ago(45) },
  ];
  var memory = function (name) { return 'What do you remember about ' + name + '?'; };
  var voice = (function () {
    var el = root.document && root.document.getElementById('tch-sample-voice');
    try { return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; }
  })();
  var entries = [
    {
      id: 'kosi-flood', kind: 'story', title: 'How Nani crossed the Kosi in the flood year', teller: 'Nani', place: 'Darbhanga',
      prompt: core.question(0).text, audience: 'family', createdBy: ASHA, createdAt: ago(40),
      body: 'The water came up to the second step of the verandah that year. Nani was nine. Her father put her and her little brother in the big brass cooking pot and walked them across, the pot floating in front of him, singing so they would not be afraid.\n\nShe still hums the song when it rains. She says she does not remember the words, only that it was about a fish who wanted to see the sea.\n\nOn the other side, a family they did not know gave them puffed rice and a dry sari each. Nani says that is why we never send anyone away from our door hungry.',
    },
    {
      id: 'kohbar', kind: 'memory', title: 'The kohbar wall at Mama\u2019s wedding', teller: 'Nani', place: 'Darbhanga', audience: 'family', createdBy: ASHA, createdAt: ago(33),
      body: 'Nani painted the kohbar for every wedding in the family, the lotus, the bamboo, the fish and the parrots. For Mama\u2019s wedding she started three days early because her hands were slower by then. The women sang while she painted and nobody was allowed to watch the bride\u2019s side of the wall until it was done.',
      media: [{ id: 'm-kohbar', name: 'The kohbar wall, painted by Nani.jpg', kind: 'photo', type: 'image/jpeg', size: 412000, url: art('kohbar-wall') }],
    },
    {
      id: 'chadar', kind: 'wisdom', title: 'Jitna chadar, utna pair', teller: 'Nani', audience: 'family', createdBy: ASHA, createdAt: ago(26),
      prompt: core.question(2).text,
      body: 'Stretch your legs only as far as the sheet goes. Nani said it whenever anyone wanted something the family could not afford, and once to my father when he wanted to buy a scooter on loan. He bought it anyway. She never let him forget.',
    },
    {
      id: 'pickle', kind: 'story', title: 'Her mango pickle', prompt: memory('Nani'), audience: 'family', createdBy: RAVI, createdAt: ago(20),
      body: 'Every May the whole roof was covered in cut raw mangoes drying on old saris. We were paid one rupee a day to keep the crows away. Nani measured the mustard oil by the sound it made when she poured it. I have tried to make it twice in Pune and it is never right. Asha, ask her about the oil.',
    },
    {
      id: 'exams', kind: 'steady', title: 'What Nana said before every exam', teller: 'Nana', audience: 'family', createdBy: ASHA, createdAt: ago(18),
      body: '\u201cYou have already done the work. Today you only have to show them.\u201d He said it to all of us, every exam, even when we had very clearly not done the work.',
    },
    {
      id: 'summer-1998', kind: 'memory', title: 'Nani and me, the summer of 1998', prompt: memory('Nani'), audience: 'family', createdBy: ASHA, createdAt: ago(12),
      body: 'The summer Mummy was in hospital I stayed with Nani for two months. She taught me to tell the time by the shadow of the neem tree and let me sleep on the roof. This is the closest picture I have of how it felt.',
      media: [{ id: 'm-summer', name: 'Nani and me.jpg', kind: 'photo', type: 'image/jpeg', size: 388000, url: art('three-generations-story') }],
    },
    {
      id: 'anaya-letter', kind: 'letter', title: 'For Anaya, when you leave home', forWhom: 'Anaya', openWhen: 'When you leave home',
      audience: 'date', audiencePeople: ['p-anaya'], releaseAt: '2040-06-01T00:00:00.000Z', createdBy: ASHA, createdAt: ago(9),
      body: 'My darling, by the time you read this you will be packing a bag I will have told you is too heavy. Take the pickle anyway.\n\nYour great-grandmother crossed a river in a cooking pot. Whatever you are worried about, you come from people who float.',
    },
    {
      id: 'leaving-darbhanga', kind: 'story', title: 'Why the family left Darbhanga', teller: 'Nani', place: 'Darbhanga', audience: 'private', createdBy: ASHA, createdAt: ago(5),
      prompt: core.question(5).text,
      body: 'Nani told this one slowly, and asked me to keep it to myself for now. I have.',
    },
    {
      id: 'guests', kind: 'wisdom', title: 'Nani\u2019s rule for guests', teller: 'Nani', audience: 'family', createdBy: ASHA, createdAt: ago(2),
      body: 'Water first, before they ask. Then ask about their mother. Only then ask why they have come.',
    },
  ].concat(voice ? [{
    id: 'voice-note', kind: 'story', title: voice.title, teller: voice.teller, place: voice.place, audience: 'family', createdBy: ASHA, createdAt: ago(1),
    body: voice.transcript + '\n\nThis voice is real. ' + voice.speaker + ' recorded it on ' + core.formatDate(voice.recordedOn) +
      ' and agreed to it playing in this sample (' + voice.consent + '). Everything else in this archive is invented.',
    media: [{ id: 'm-voice', name: voice.title + '.' + voice.url.split('.').pop(), kind: 'audio', type: voice.type, size: voice.size, url: voice.url }],
  }] : []).map(function (e) {
    var out = { owner: ASHA, prompt: '', teller: '', place: '', forWhom: '', openWhen: '', audiencePeople: [], releaseAt: null, media: [] };
    Object.keys(e).forEach(function (k) { out[k] = e[k]; });
    out.updatedAt = out.createdAt;
    out.media = out.media.map(function (m) { var c = {}; Object.keys(m).forEach(function (k) { c[k] = m[k]; }); c.entryId = out.id; return c; });
    return out;
  });
  var raviArchive = [
    {
      id: 'ravi-scooter', owner: RAVI, kind: 'story', title: 'Papa\u2019s scooter', teller: 'Papa', place: 'Patna', prompt: '', forWhom: '', openWhen: '',
      audience: 'family', audiencePeople: [], releaseAt: null, createdBy: RAVI, createdAt: ago(15), updatedAt: ago(15), media: [],
      body: 'The one Nani told him not to buy. It carried four of us to every wedding for eleven years.',
    },
  ];
  var roots = {
    name: 'The Mishra family',
    generations: [
      { label: 'Me', place: 'Bengaluru', years: 'now', detail: 'keeping Nani\u2019s stories' },
      { label: 'My parents', place: 'Patna', years: '1980s', detail: 'one scooter, four passengers' },
      { label: 'My grandparents', place: 'Darbhanga', years: '1950s', detail: 'painted the kohbar for every wedding' },
      { label: 'My great-grandparents', place: 'A village on the Kosi', years: '1930s', detail: 'crossed the river in a brass pot' },
    ],
  };

  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function ok(x) { return Promise.resolve(copy(x)); }
  function no() { return Promise.reject(new Error(NO)); }
  function newest(list) { return list.slice().sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }); }

  var store = {
    mode: 'sample',
    session: function () { return ok({ user: user }); },
    accounts: function () { return ok([user]); },
    signOut: function () { location.href = '/offerings.html'; return new Promise(function () {}); },
    touchSeen: function () { return ok(core.newLegacy(ASHA, new Date())); },
    legacy: function () { return ok(core.newLegacy(ASHA, new Date())); },
    people: function () { return ok(people.slice().sort(function (a, b) { return a.name.localeCompare(b.name); })); },
    entries: function (owner) { return ok(newest(!owner || owner === ASHA ? entries : owner === RAVI ? raviArchive : [])); },
    entry: function (id) { return ok(entries.concat(raviArchive).filter(function (e) { return e.id === id; })[0] || null); },
    mediaUrl: function (m) { return m.url ? Promise.resolve(m.url) : Promise.reject(new Error('This file is missing.')); },
    sharedWithMe: function () { return ok([{ owner: RAVI, ownerName: 'Ravi Mishra', role: 'family_edit', personId: 'r-asha', legacy: null }]); },
    elders: function () { return ok(elders); },
    remembrances: function () { return ok(remembered); },
    roots: function () { return ok(roots); },
    myContributions: function () { return ok([]); },
    contribution: function () { return ok(null); },
    isModerator: function () { return ok(false); },
    pendingContributions: function () { return ok([]); },
    recentlyPublished: function () { return ok([]); },
    pendingReports: function () { return ok([]); },
    suggestedPlaces: function () { return ok([]); },
    myListings: function () { return ok([]); },
    listing: function () { return ok(null); },
    myBookings: function () { return ok([]); },
    bookingContacts: function () { return ok([]); },
    pendingListings: function () { return ok([]); },
    bookingsToSettle: function () { return ok([]); },
    myEchoes: function () { return ok([]); },
  };
  ['signIn', 'handleRedirect', 'saveProfile', 'saveLegacy', 'savePerson', 'deletePerson', 'saveEntry', 'deleteEntry', 'addMedia', 'deleteMedia', 'saveTranscript',
    'reportPassing', 'skipWaiting', 'saveElder', 'deleteElder', 'saveRemembrance', 'deleteRemembrance', 'saveRoots', 'contribute', 'updateContribution', 'deleteContribution', 'report',
    'adoptSuggestion', 'resolveReports', 'reviewContribution', 'featureContribution', 'saveListing', 'deleteListing', 'requestBooking',
    'updateBooking', 'reviewListing', 'echo', 'deleteAccount'].forEach(function (name) { store[name] = no; });

  (root.TCH.stores = root.TCH.stores || {}).sample = store;
})(typeof window !== 'undefined' ? window : globalThis);
