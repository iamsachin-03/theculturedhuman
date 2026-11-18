// Shared rules for the family archive app: kinds of entry, the weekly questions, who may see
// an entry, and how an archive is passed on. The same rules are enforced by the database
// (backend/schema.sql); keep the two in step. Works in the browser (window.TCH.core) and in Node.
(function (root) {
  var KINDS = [
    { id: 'story', label: 'A story or tale', heading: 'Stories and tales' },
    { id: 'memory', label: 'A photograph or video and its memory', heading: 'Moments together' },
    { id: 'wisdom', label: 'Wisdom or a proverb', heading: 'Wisdom and sayings' },
    { id: 'steady', label: 'For hard days', heading: 'For hard days' },
    { id: 'letter', label: 'A letter to the future', heading: 'Letters to the future' },
  ];

  var ROLES = [
    { id: 'family_edit', label: 'Family, can add', hint: 'Sees what you share with family now, and can add their own stories to your archive.' },
    { id: 'family_view', label: 'Family, view only', hint: 'Sees what you share with family now.' },
    { id: 'beloved', label: 'Beloved one', hint: 'Receives what you leave for them on a date you choose, or when your archive is passed on.' },
    { id: 'legacy', label: 'Legacy contact', hint: 'Confirms when it is time to pass your archive on, and looks after it afterwards.' },
  ];

  var AUDIENCES = [
    { id: 'private', label: 'Only me' },
    { id: 'family', label: 'My family' },
    { id: 'people', label: 'Specific people' },
    { id: 'date', label: 'Specific people, on a date' },
    { id: 'passed', label: 'When my archive is passed on' },
  ];

  // Light questions first, so the habit forms before the deeper ones arrive.
  var QUESTIONS = [
    ['story', 'Which story did you love to hear as a child, and who told it?'],
    ['story', 'What did the house you grew up in look, sound and smell like?'],
    ['wisdom', 'Which saying did your elders repeat most, and what did they mean by it?'],
    ['story', 'Which dish takes you straight back home, and who made it best?'],
    ['memory', 'Find an old photograph. Who is in it, and what was happening just outside the frame?'],
    ['story', 'What did a normal day look like when you were ten?'],
    ['steady', 'What do you do when you feel worried? What has always calmed you?'],
    ['story', 'Who was your closest friend when you were young, and what did you get up to?'],
    ['wisdom', 'What is the best advice anyone ever gave you?'],
    ['story', 'How did our family celebrate the most important festival of the year?'],
    ['memory', 'Which photograph of our family do you treasure most, and why?'],
    ['story', 'What did your parents do for a living, and what were they like at work?'],
    ['steady', 'What helped you through the hardest year of your life?'],
    ['story', 'What songs were sung at home, at weddings or at festivals?'],
    ['wisdom', 'What took you longest to learn about people?'],
    ['story', 'What were you told about our family name, or our village?'],
    ['letter', 'What do you hope your grandchildren never lose?'],
    ['story', 'What was school like for you? Which teacher do you remember?'],
    ['steady', 'How did you find courage when you were frightened?'],
    ['story', 'Why did our family move, and what did they bring with them?'],
    ['wisdom', 'Which words or sayings did your elders use that people don\'t say any more?'],
    ['memory', 'Tell me about the happiest day you remember with the whole family together.'],
    ['story', 'How did you meet your husband or wife? Or the person who mattered most to you?'],
    ['steady', 'What reminds you who you are when you doubt yourself?'],
    ['story', 'Was there a ritual our family never skipped? Why did it matter?'],
    ['wisdom', 'What does it mean to you to live a good life?'],
    ['story', 'What games did you play as a child, and what were the rules?'],
    ['letter', 'What would you like to tell a grandchild on the day they leave home?'],
    ['story', 'Which grandparent do you remember best, and what were they like?'],
    ['steady', 'How do you stay kind when the world feels unkind?'],
    ['memory', 'Describe a journey you made that you will never forget.'],
    ['wisdom', 'What is something you were wrong about, and how did you find out?'],
    ['story', 'What did you want to become when you grew up?'],
    ['steady', 'What do you do on a day when everything feels uncertain?'],
    ['story', 'What changed most in the place you grew up during your lifetime?'],
    ['wisdom', 'Which proverb do you think everyone should know?'],
    ['memory', 'Tell me about a meal you shared that you still think about.'],
    ['story', 'What was the bravest thing you ever did?'],
    ['letter', 'What do you want them to know about you that nobody else will remember?'],
    ['steady', 'Who did you turn to when you needed help, and what did they say?'],
    ['story', 'What were the stories or legends about our region that you heard as a child?'],
    ['wisdom', 'What is the secret to staying close as a family?'],
    ['memory', 'Which object in your home carries the most memories? Tell me its story.'],
    ['story', 'What work are you proudest of in your life?'],
    ['steady', 'How did you keep going when something you hoped for didn\'t happen?'],
    ['wisdom', 'What should every young person know about money, work and time?'],
    ['story', 'What did you learn from your mother? And from your father?'],
    ['letter', 'What would you tell them about being human?'],
    ['memory', 'Which festival or celebration with the family do you remember most clearly?'],
    ['wisdom', 'If you could live one year of your life again, which would it be and why?'],
    ['steady', 'What gives you peace now?'],
    ['letter', 'Is there anything you have always wanted to say to the family, but never have?'],
  ];

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // ---------- who may see an entry ----------
  var FAMILY = ['family_edit', 'family_view'];
  var HEIRS = ['beloved', 'legacy'];

  /**
   * Whether `viewer` may see `entry`.
   * `person` is the viewer's row in the owner's people list (null for strangers), and
   * `passed` says whether the owner's archive has been passed on. "Only me" stays private forever.
   */
  function canSee(entry, viewer, person, passed, now) {
    if (!viewer) return false;
    if (entry.owner === viewer || entry.createdBy === viewer) return true;
    if (!person) return false;
    var chosen = entry.audiencePeople || [];
    var named = chosen.indexOf(person.id) !== -1;
    switch (entry.audience) {
      case 'private':
        return false;
      case 'family':
        return FAMILY.indexOf(person.role) !== -1 || (passed && HEIRS.indexOf(person.role) !== -1);
      case 'people':
        return named;
      case 'date':
        return Boolean(entry.releaseAt) && new Date(entry.releaseAt) <= now && named;
      case 'passed':
        return Boolean(passed) && (chosen.length ? named : true);
      default:
        return false;
    }
  }

  function canAdd(ownerId, viewer, person) {
    return ownerId === viewer || Boolean(person && person.role === 'family_edit');
  }

  function canEdit(entry, viewer) {
    return entry.owner === viewer || entry.createdBy === viewer;
  }

  function audienceLabel(entry, people) {
    var names = (entry.audiencePeople || []).map(function (id) {
      var p = find(people || [], id);
      return p ? p.name : null;
    }).filter(Boolean);
    switch (entry.audience) {
      case 'private': return 'Only me';
      case 'family': return 'My family';
      case 'people': return names.length ? 'Shared with ' + names.join(', ') : 'Specific people';
      case 'date': return (names.length ? names.join(', ') : 'Chosen people') + ', on ' + formatDate(entry.releaseAt);
      case 'passed': return 'When passed on' + (names.length ? ', to ' + names.join(', ') : '');
      default: return '';
    }
  }

  // ---------- passing an archive on ----------
  var DAY = 86400000;
  function addMonths(date, months) {
    var d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  /**
   * Moves the legacy state machine forward in time, the way the daily job does.
   * active -> checking (owner silent for the quiet period; reminders are sent)
   * checking -> asking (30 more days of silence; legacy contacts are asked to confirm)
   * reported -> passed, once the waiting period ends without the owner cancelling
   */
  function legacyNext(legacy, now) {
    var l = {};
    Object.keys(legacy).forEach(function (k) { l[k] = legacy[k]; });
    var quietEnds = addMonths(l.lastSeenAt, l.quietMonths || 12);
    if (l.state === 'active' && now >= quietEnds) l.state = 'checking';
    if (l.state === 'checking' && now >= new Date(quietEnds.getTime() + 30 * DAY)) l.state = 'asking';
    if (l.state === 'reported' && l.waitEndsAt && now >= new Date(l.waitEndsAt)) {
      l.state = 'passed';
      l.passedAt = l.waitEndsAt;
    }
    return l;
  }

  /** The owner signing in cancels any check, report or waiting period. Passed archives stay passed. */
  function legacySeen(legacy, now) {
    var l = legacyNext(legacy, now);
    if (l.state === 'passed') return l;
    l.lastSeenAt = now.toISOString();
    l.state = 'active';
    l.reportedBy = null;
    l.waitEndsAt = null;
    return l;
  }

  function legacyReport(legacy, reporter, now) {
    var l = legacyNext(legacy, now);
    if (l.state === 'passed' || l.state === 'reported') return l;
    l.state = 'reported';
    l.reportedBy = reporter;
    l.waitEndsAt = new Date(now.getTime() + (l.waitDays || 30) * DAY).toISOString();
    return l;
  }

  function newLegacy(owner, now) {
    return { owner: owner, quietMonths: 12, waitDays: 30, lastSeenAt: now.toISOString(), state: 'active', reportedBy: null, waitEndsAt: null, passedAt: null };
  }

  // ---------- the weekly question ----------
  function question(n) {
    var i = ((n % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length;
    return { kind: QUESTIONS[i][0], text: QUESTIONS[i][1], week: i + 1 };
  }

  function message(elderName, q, from) {
    var name = (elderName || '').trim();
    return (name ? name + ', ' : '') + 'this week\'s question' + (from ? ' from ' + from.trim() : '') + ':\n\n' +
      q.text + '\n\n' +
      'Reply whenever you like with a voice note, in whichever language feels right. Take as long as you want.';
  }

  function whatsappLink(phone, text) {
    return 'https://wa.me/' + String(phone || '').replace(/[^\d]/g, '') + '?text=' + encodeURIComponent(text);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function icsDate(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function icsText(s) { return String(s).replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n'); }
  var ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  /** A weekly calendar reminder at 10am local time on the chosen day, starting after `now`. */
  function reminder(elder, now, url) {
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
    while (start.getDay() !== elder.day || start <= now) start.setDate(start.getDate() + 1);
    var end = new Date(start.getTime() + 15 * 60000);
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Cultured Human//Weekly question//EN', 'BEGIN:VEVENT',
      'UID:weekly-' + elder.id + '@theculturedhuman',
      'DTSTAMP:' + now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'),
      'DTSTART:' + icsDate(start), 'DTEND:' + icsDate(end), 'RRULE:FREQ=WEEKLY;BYDAY=' + ICS_DAYS[elder.day],
      'SUMMARY:' + icsText('Send this week\'s question to ' + elder.name),
      'DESCRIPTION:' + icsText('Open ' + url + ' to see the question and send it.'),
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText('Weekly question for ' + elder.name), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
  }

  // ---------- small helpers ----------
  function mediaKind(mime, name) {
    mime = mime || '';
    if (mime.indexOf('audio/') === 0 || /\.(opus|ogg|m4a|mp3|wav|aac)$/i.test(name || '')) return 'audio';
    if (mime.indexOf('video/') === 0) return 'video';
    if (mime.indexOf('image/') === 0) return 'photo';
    return 'document';
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function safeFileName(name) {
    return String(name || 'file').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file';
  }

  // The same limits as place_contributions in backend/schema.sql.
  var CONTRIBUTION_KINDS = ['A word or saying', 'A dish or recipe', 'A festival or ritual', 'A song', 'A memory of the place', 'A correction'];
  function contribution(f) {
    var c = {
      placeSlug: String(f.placeSlug || '').trim() || null,
      suggestedPlace: String(f.suggestedPlace || '').trim().slice(0, 120) || null,
      kind: CONTRIBUTION_KINDS.indexOf(f.kind) === -1 ? CONTRIBUTION_KINDS[0] : f.kind,
      title: String(f.title || '').trim(),
      body: String(f.body || '').trim(),
      credit: String(f.credit || '').trim(),
      script: null,
      pronunciation: null,
      promptWeek: /^\d+$/.test(String(f.promptWeek)) ? Number(f.promptWeek) : null,
      consent: f.consent === true,
    };
    if (c.kind === CONTRIBUTION_KINDS[0]) {
      c.script = String(f.script || '').trim() || null;
      c.pronunciation = String(f.pronunciation || '').trim() || null;
    }
    if (c.placeSlug) c.suggestedPlace = null;
    if (!c.placeSlug && !c.suggestedPlace) throw new Error('Please choose the place, or name it.');
    if (!c.title) throw new Error('Please give it a title.');
    if (c.title.length > 120) throw new Error('Please keep the title under 120 characters.');
    if (!c.body) throw new Error('Please write a few lines about it.');
    if (c.body.length > 5000) throw new Error('Please keep it under 5,000 characters.');
    if (!c.credit) throw new Error('Please say how you would like to be credited.');
    if (c.credit.length > 80) throw new Error('Please keep the credit under 80 characters.');
    if (c.script && c.script.length > 120) throw new Error('Please keep the word in its own script under 120 characters.');
    if (c.pronunciation && c.pronunciation.length > 120) throw new Error('Please keep how it is said under 120 characters.');
    if (!c.consent) throw new Error('Please confirm it is yours to share and follows the community guidelines.');
    return c;
  }

  // The same reasons as contribution_reports in backend/schema.sql.
  var REPORT_REASONS = [
    { id: 'private', label: 'It shares something private about a person' },
    { id: 'hostile', label: 'It is unkind or hateful about a person or a community' },
    { id: 'wrong', label: 'It is wrong, and I can say why' },
    { id: 'not-theirs', label: 'It is not theirs to share, for example my own work' },
    { id: 'spam', label: 'It is advertising or spam' },
    { id: 'other', label: 'Something else' },
  ];
  function report(f) {
    var reason = REPORT_REASONS.filter(function (x) { return x.id === f.reason; })[0];
    if (!reason) throw new Error('Please choose what is wrong.');
    var note = String(f.note || '').trim();
    if (note.length > 500) throw new Error('Please keep it under 500 characters.');
    if ((reason.id === 'other' || reason.id === 'wrong') && !note) throw new Error('Please say a little more, so we can check it.');
    return { reason: reason.id, note: note || null };
  }
  function reviewNote(note) {
    var n = String(note || '').trim();
    if (n.length > 300) throw new Error('Please keep the reason under 300 characters.');
    return n || null;
  }

  // ---------- makers, hosts and storytellers ----------
  var LISTING_ROLES = [
    { id: 'maker', label: 'Maker', what: 'Paintings, crafts and keepsakes made to order', ask: 'Ask for a piece' },
    { id: 'host', label: 'Host', what: 'Journeys back to a family\'s town or village', ask: 'Plan a journey' },
    { id: 'storyteller', label: 'Storyteller', what: 'Recording an elder\'s stories, in their language', ask: 'Book a storyteller' },
  ];
  function listingRole(id) { return LISTING_ROLES.filter(function (r) { return r.id === id; })[0] || null; }
  function listing(f) {
    var l = {
      role: String(f.role || ''),
      placeSlug: String(f.placeSlug || '').trim(),
      name: String(f.name || '').trim(),
      summary: String(f.summary || '').trim(),
      languages: String(f.languages || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 8),
      link: String(f.link || '').trim() || null,
      priceNote: String(f.priceNote || '').trim() || null,
    };
    if (!listingRole(l.role)) throw new Error('Please choose what you offer.');
    if (!l.placeSlug) throw new Error('Please choose the place you work in.');
    if (!l.name) throw new Error('Please add the name families will see.');
    if (l.name.length > 80) throw new Error('Please keep the name under 80 characters.');
    if (!l.summary) throw new Error('Please describe what you offer.');
    if (l.summary.length > 600) throw new Error('Please keep the description under 600 characters.');
    if (l.link && !/^https:\/\/\S+\.\S+$/.test(l.link)) throw new Error('Please give a link that starts with https://');
    if (l.priceNote && l.priceNote.length > 80) throw new Error('Please keep the price guide under 80 characters.');
    return l;
  }
  function bookingMessage(text) {
    var m = String(text || '').trim();
    if (!m) throw new Error('Please tell them what you would like.');
    if (m.length > 5000) throw new Error('Please keep it under 5,000 characters.');
    return m;
  }
  /** A quote in rupees as typed ("8,000" or "8000.50") becomes whole paise. */
  function quote(f) {
    var rupees = Number(String(f.rupees || '').replace(/[,\s₹]/g, ''));
    if (!isFinite(rupees) || rupees <= 0) throw new Error('Please enter your price in rupees.');
    if (rupees > 10000000) throw new Error('Please check the price.');
    var reply = String(f.reply || '').trim();
    if (reply.length > 2000) throw new Error('Please keep your note under 2,000 characters.');
    return { pricePaise: Math.round(rupees * 100), reply: reply || null };
  }
  /** The same sum as platform_fee() in schema.sql. */
  function platformFee(paise, percent) { return Math.round(paise * percent / 100); }
  function formatRupees(paise) {
    var r = paise / 100;
    return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  var BOOKING_STATUS = {
    requested: { family: 'Waiting for a quote', provider: 'New request: send a quote' },
    quoted: { family: 'Quote received: accept it to go ahead', provider: 'Quote sent: waiting for the family' },
    accepted: { family: 'Accepted: we will email you a payment link', provider: 'Accepted: you will hear when it is paid' },
    paid: { family: 'Paid', provider: 'Paid: you can begin' },
    completed: { family: 'Completed', provider: 'Completed' },
    cancelled: { family: 'Cancelled', provider: 'Cancelled' },
  };

  var core = {
    LISTING_ROLES: LISTING_ROLES, listingRole: listingRole, listing: listing, bookingMessage: bookingMessage, quote: quote,
    platformFee: platformFee, formatRupees: formatRupees, BOOKING_STATUS: BOOKING_STATUS,
    CONTRIBUTION_KINDS: CONTRIBUTION_KINDS, contribution: contribution, REPORT_REASONS: REPORT_REASONS, report: report, reviewNote: reviewNote,
    KINDS: KINDS, ROLES: ROLES, AUDIENCES: AUDIENCES, QUESTIONS: QUESTIONS, find: find,
    canSee: canSee, canAdd: canAdd, canEdit: canEdit, audienceLabel: audienceLabel,
    newLegacy: newLegacy, legacyNext: legacyNext, legacySeen: legacySeen, legacyReport: legacyReport,
    question: question, message: message, whatsappLink: whatsappLink, reminder: reminder,
    mediaKind: mediaKind, formatBytes: formatBytes, formatDate: formatDate, safeFileName: safeFileName,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  else (root.TCH = root.TCH || {}).core = core;
})(this);
