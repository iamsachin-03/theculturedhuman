// The weekly question: one question a week for an elder, sent by WhatsApp or any message app,
// answered with a voice note and saved into the family archive. A year of questions makes a book.
// State lives in localStorage until family accounts exist. Pure helpers are exported for Node.
(function () {
  var STORAGE = 'tch-weekly';
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

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

  function question(n) {
    var q = QUESTIONS[((n % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length];
    return { kind: q[0], text: q[1], week: (n % QUESTIONS.length) + 1 };
  }

  function message(elder, q, from) {
    var name = elder.name.trim();
    return (name ? name + ', ' : '') + 'this week\'s question' + (from ? ' from ' + from.trim() : '') + ':\n\n' +
      q.text + '\n\n' +
      'Reply whenever you like with a voice note, in whichever language feels right. Take as long as you want.';
  }

  function whatsappLink(phone, text) {
    var digits = String(phone || '').replace(/[^\d]/g, '');
    return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function icsDate(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }
  function icsText(s) { return String(s).replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n'); }

  /** A weekly calendar reminder, in the asker's local time, on the chosen day at 10am. */
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

  function newElder(fields, now) {
    return {
      id: now.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
      name: fields.name.trim(),
      relation: (fields.relation || '').trim(),
      phone: (fields.phone || '').trim(),
      day: Number(fields.day) || 0,
      index: 0,
      answered: 0,
      askedAt: null,
      startedAt: now.toISOString(),
    };
  }

  /** Moves to the next question. Answering counts towards the year; skipping does not. */
  function advance(elder, answered) {
    var next = {};
    Object.keys(elder).forEach(function (k) { next[k] = elder[k]; });
    next.index = elder.index + 1;
    next.answered = elder.answered + (answered ? 1 : 0);
    next.askedAt = null;
    return next;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QUESTIONS: QUESTIONS, question: question, message: message, whatsappLink: whatsappLink, reminder: reminder, newElder: newElder, advance: advance };
    return;
  }

  var root = document.querySelector('[data-weekly]');
  if (!root) return;
  var setup = root.querySelector('[data-weekly-setup]');
  var card = root.querySelector('[data-weekly-card]');
  var status = root.querySelector('[data-weekly-status]');
  var archiveForm = document.querySelector('[data-archive-form]');
  var state = load();
  var pending = null;

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE) || 'null');
      if (s && Array.isArray(s.elders)) return s;
    } catch (e) {}
    return { from: '', elders: [], current: null };
  }
  function save() {
    try { localStorage.setItem(STORAGE, JSON.stringify(state)); } catch (e) {}
  }
  function current() {
    for (var i = 0; i < state.elders.length; i++) if (state.elders[i].id === state.current) return state.elders[i];
    return state.elders[0] || null;
  }
  function replace(elder) {
    state.elders = state.elders.map(function (e) { return e.id === elder.id ? elder : e; });
    save();
  }
  function say(text) { status.textContent = text; }

  setup.querySelector('[name="day"]').value = String(new Date().getDay());
  setup.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = setup.elements;
    var elder = newElder({ name: f.name.value, relation: f.relation.value, phone: f.phone.value, day: f.day.value }, new Date());
    state.from = f.from.value.trim() || state.from;
    state.elders.push(elder);
    state.current = elder.id;
    save();
    setup.reset();
    setup.querySelector('[name="day"]').value = String(new Date().getDay());
    render();
    say('Your first question for ' + elder.name + ' is ready.');
    card.querySelector('h3').focus();
  });
  root.querySelector('[data-weekly-cancel]').addEventListener('click', function () {
    setup.hidden = true;
    card.hidden = false;
  });

  function render() {
    var elder = current();
    setup.hidden = Boolean(elder);
    card.hidden = !elder;
    root.querySelector('[data-weekly-cancel]').hidden = !state.elders.length;
    if (!elder) return;
    var q = question(elder.index);
    var tabs = card.querySelector('[data-weekly-elders]');
    tabs.innerHTML = '';
    tabs.hidden = state.elders.length < 2;
    state.elders.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'weekly__elder';
      b.textContent = e.name;
      b.setAttribute('aria-pressed', String(e.id === elder.id));
      b.addEventListener('click', function () { state.current = e.id; save(); render(); });
      tabs.appendChild(b);
    });
    card.querySelector('[data-weekly-week]').textContent = 'Week ' + q.week + ' of ' + QUESTIONS.length + ' · for ' + elder.name + (elder.relation ? ' (' + elder.relation + ')' : '');
    card.querySelector('h3').textContent = q.text;
    var text = card.querySelector('[data-weekly-message]');
    text.value = message(elder, q, state.from);
    var progress = card.querySelector('[data-weekly-progress]');
    progress.value = elder.answered;
    progress.max = QUESTIONS.length;
    progress.textContent = elder.answered + ' of ' + QUESTIONS.length;
    card.querySelector('[data-weekly-answered]').textContent = elder.answered === 1 ? '1 answer kept' : elder.answered + ' answers kept';
    card.querySelector('[data-weekly-asked]').textContent = elder.askedAt ? 'Sent ' + new Date(elder.askedAt).toLocaleDateString() + '. When the reply comes, save it below.' : '';
    updateLink();
  }

  function updateLink() {
    var elder = current();
    var link = card.querySelector('[data-weekly-whatsapp]');
    link.href = whatsappLink(elder.phone, card.querySelector('[data-weekly-message]').value);
  }
  card.querySelector('[data-weekly-message]').addEventListener('input', updateLink);

  function markAsked() {
    var elder = current();
    elder.askedAt = new Date().toISOString();
    replace(elder);
    render();
  }
  card.querySelector('[data-weekly-whatsapp]').addEventListener('click', markAsked);
  card.querySelector('[data-weekly-copy]').addEventListener('click', function () {
    var text = card.querySelector('[data-weekly-message]').value;
    var done = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject();
    done.then(function () {
      markAsked();
      say('Message copied. Paste it into WhatsApp, a text or an email.');
    }, function () {
      card.querySelector('[data-weekly-message]').select();
      say('Select the message and copy it.');
    });
  });

  // Hands the question to the archive form, so the reply is filed with its question and teller.
  card.querySelector('[data-weekly-save]').addEventListener('click', function () {
    var elder = current();
    var q = question(elder.index);
    var kind = archiveForm.querySelector('[name="kind"]');
    kind.value = q.kind;
    kind.dispatchEvent(new Event('change'));
    var prompt = archiveForm.querySelector('[name="prompt"]');
    if (!Array.prototype.some.call(prompt.options, function (o) { return o.textContent === q.text; })) {
      var o = document.createElement('option');
      o.textContent = q.text;
      prompt.appendChild(o);
    }
    prompt.value = q.text;
    archiveForm.querySelector('[name="teller"]').value = elder.name;
    pending = { id: elder.id, index: elder.index };
    archiveForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    archiveForm.querySelector('[name="title"]').focus({ preventScroll: true });
    say('Add a title, then attach their voice note with "choose a file" and press "Keep it".');
  });

  archiveForm.addEventListener('submit', function () {
    if (!pending || !archiveForm.checkValidity()) return;
    var elder = state.elders.filter(function (e) { return e.id === pending.id; })[0];
    if (elder && elder.index === pending.index) {
      replace(advance(elder, true));
      render();
      say('Kept. Next week\'s question for ' + elder.name + ' is ready.');
    }
    pending = null;
  });

  card.querySelector('[data-weekly-skip]').addEventListener('click', function () {
    replace(advance(current(), false));
    render();
    say('Skipped. Here is another question.');
  });

  card.querySelector('[data-weekly-reminder]').addEventListener('click', function () {
    var elder = current();
    var file = new Blob([reminder(elder, new Date(), location.origin + '/archive.html#weekly')], { type: 'text/calendar' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = 'weekly-question-' + elder.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    say('Open the downloaded file to add a reminder every ' + DAYS[elder.day] + ' to your calendar.');
  });

  card.querySelector('[data-weekly-add]').addEventListener('click', function () {
    setup.hidden = false;
    card.hidden = true;
    root.querySelector('[data-weekly-cancel]').hidden = false;
    setup.querySelector('[name="name"]').focus();
  });

  card.querySelector('[data-weekly-stop]').addEventListener('click', function () {
    var elder = current();
    if (!window.confirm('Stop the weekly question for ' + elder.name + '? Answers already kept stay in your archive.')) return;
    state.elders = state.elders.filter(function (e) { return e.id !== elder.id; });
    state.current = state.elders[0] ? state.elders[0].id : null;
    save();
    render();
    say('Stopped the weekly question for ' + elder.name + '.');
  });

  if (state.from) setup.querySelector('[name="from"]').value = state.from;
  render();
})();
