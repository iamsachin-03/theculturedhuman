-- Checks the access rules in schema.sql. Run with backend/test.sh, which creates a throwaway
-- database, adds a minimal stand-in for Supabase's auth schema, loads schema.sql, then runs this.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- Asha, who keeps the archive
  ('00000000-0000-0000-0000-00000000000b'),  -- Bina, her sister, family who can add
  ('00000000-0000-0000-0000-00000000000c'),  -- Chetan, a stranger
  ('00000000-0000-0000-0000-00000000000d'),  -- Devi, a maker
  ('00000000-0000-0000-0000-00000000000e'),  -- Esha, a moderator
  ('00000000-0000-0000-0000-00000000000f'),  -- Farah, Asha's daughter, a beloved one
  ('00000000-0000-0000-0000-000000000010'),  -- Gopal, Asha's friend, her legacy contact
  ('00000000-0000-0000-0000-000000000011');  -- Hari, a cousin, family who can only view
insert into moderators values ('00000000-0000-0000-0000-00000000000e');
insert into places values ('mithila', 'Mithila', 'North Bihar', 26.35, 86.07);

create function as_user(u text, mail text default '') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  perform set_config('request.jwt.claim.email', mail, false);
end;
$$;
create function fails(statement text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end;
$$;
create function check_that(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', what; end if;
  raise notice 'PASS: %', what;
end;
$$;
create function titles() returns text language sql as $$
  select coalesce(string_agg(title, ',' order by title), '') from entries;
$$;
grant execute on function as_user(text, text), fails(text), check_that(boolean, text), titles() to authenticated, anon;

set role authenticated;

-- Asha builds her archive and her circle.
select as_user('00000000-0000-0000-0000-00000000000a', 'asha@example.com');
select touch_seen();
insert into people (id, name, email, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'Bina', 'bina@example.com', 'family_edit'),
  ('aaaaaaaa-0000-0000-0000-00000000000f', 'Farah', 'farah@example.com', 'beloved'),
  ('aaaaaaaa-0000-0000-0000-000000000010', 'Gopal', 'gopal@example.com', 'legacy'),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'Hari', 'hari@example.com', 'family_view');
insert into entries (id, owner_id, kind, title, audience) values
  ('eeeeeeee-0000-0000-0000-000000000001', auth.uid(), 'story', 'family-story', 'family');
insert into entries (owner_id, kind, title, audience) values (auth.uid(), 'wisdom', 'private-note', 'private');
insert into entries (owner_id, kind, title, audience, audience_people) values
  (auth.uid(), 'letter', 'for-farah-now', 'people', '{aaaaaaaa-0000-0000-0000-00000000000f}');
insert into entries (owner_id, kind, title, audience, audience_people, release_at) values
  (auth.uid(), 'letter', 'for-farah-at-18', 'date', '{aaaaaaaa-0000-0000-0000-00000000000f}', now() + interval '10 years'),
  (auth.uid(), 'letter', 'for-farah-yesterday', 'date', '{aaaaaaaa-0000-0000-0000-00000000000f}', now() - interval '1 day');
insert into entries (owner_id, kind, title, audience) values (auth.uid(), 'steady', 'when-im-gone', 'passed');
insert into entries (owner_id, kind, title, audience, audience_people) values
  (auth.uid(), 'letter', 'when-im-gone-farah-only', 'passed', '{aaaaaaaa-0000-0000-0000-00000000000f}');
insert into media (entry_id, owner_id, kind, name, mime, size, path) values
  ('eeeeeeee-0000-0000-0000-000000000001', auth.uid(), 'audio', 'nani.ogg', 'audio/ogg', 1000,
   '00000000-0000-0000-0000-00000000000a/eeeeeeee-0000-0000-0000-000000000001/nani.ogg');
select check_that((select count(*) from entries) = 7, 'owners see every entry in their archive');
update media set transcript = 'Nani sings', transcript_by = 'person' where name = 'nani.ogg';
select check_that((select transcript from media where name = 'nani.ogg') = 'Nani sings', 'owners can write a transcript');
select check_that(fails($$update media set path = 'x' where name = 'nani.ogg'$$), 'nobody can move a file by editing its row');
select check_that(fails($$insert into entries (owner_id, kind, title, audience, audience_people) values (auth.uid(), 'story', 'x', 'people', '{00000000-0000-0000-0000-00000000000c}')$$), 'entries can only be shared with the owner''s own people');
select check_that(fails($$insert into entries (owner_id, kind, title, audience) values (auth.uid(), 'story', 'x', 'date')$$), 'a dated entry needs a date and someone to receive it');
select check_that(fails($$update legacy set state = 'passed'$$), 'owners cannot change the legacy state directly');
select check_that(fails($$insert into people (name, email, role, user_id) values ('X', 'x@example.com', 'family_view', '00000000-0000-0000-0000-00000000000c')$$), 'owners cannot link someone''s account without them signing in');

-- A stranger sees nothing and cannot write.
select as_user('00000000-0000-0000-0000-00000000000c', 'chetan@example.com');
select claim_people();
select check_that(titles() = '', 'strangers see no entries');
select check_that((select count(*) from people) = 0, 'strangers see nobody''s people');
select check_that((select count(*) from media) = 0, 'strangers see no media');
select check_that(not can_read_object('00000000-0000-0000-0000-00000000000a/eeeeeeee-0000-0000-0000-000000000001/nani.ogg'), 'strangers cannot download files');
select check_that(not can_write_object('00000000-0000-0000-0000-00000000000a/eeeeeeee-0000-0000-0000-000000000001/x.ogg'), 'strangers cannot upload files');
select check_that(fails($$insert into entries (owner_id, kind, title) values ('00000000-0000-0000-0000-00000000000a', 'story', 'graffiti')$$), 'strangers cannot write to an archive');
select check_that(fails($$select report_passing('00000000-0000-0000-0000-00000000000a')$$), 'strangers cannot report a passing');
select check_that((legacy_for('00000000-0000-0000-0000-00000000000a')).owner_id is null, 'strangers cannot read the legacy state');

-- Bina signs in with the email Asha added: she sees family entries and can add her own.
select as_user('00000000-0000-0000-0000-00000000000b', 'BINA@example.com');
select check_that(claim_people() = 1, 'signing in with an invited email links the account');
select check_that(titles() = 'family-story', 'family see what is shared with family, and nothing else');
select check_that(can_read_object('00000000-0000-0000-0000-00000000000a/eeeeeeee-0000-0000-0000-000000000001/nani.ogg'), 'family can download files on entries they can see');
insert into entries (id, owner_id, kind, title, audience) values
  ('eeeeeeee-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'story', 'bina-adds', 'family');
select check_that(can_write_object('00000000-0000-0000-0000-00000000000a/eeeeeeee-0000-0000-0000-000000000002/v.mp4'), 'family can attach files to their own entries');
select check_that(not can_write_object('00000000-0000-0000-0000-00000000000a/eeeeeeee-0000-0000-0000-000000000001/v.mp4'), 'family cannot attach files to the owner''s entries');
select check_that(fails($$insert into entries (owner_id, kind, title, audience) values ('00000000-0000-0000-0000-00000000000a', 'letter', 'x', 'passed')$$), 'only the owner can leave entries for later');
update media set transcript = 'changed' where name = 'nani.ogg';
select check_that((select transcript from media where name = 'nani.ogg') = 'Nani sings', 'family cannot change the owner''s transcripts');
update entries set title = 'changed' where title = 'family-story';
select check_that(titles() = 'bina-adds,family-story', 'family cannot edit the owner''s entries');
select check_that(fails($$update people set role = 'legacy' where user_id = auth.uid()$$) or (select role from people where user_id = auth.uid()) = 'family_edit', 'family cannot change their own role');

-- Hari can only view.
select as_user('00000000-0000-0000-0000-000000000011', 'hari@example.com');
select claim_people();
select check_that(titles() = 'bina-adds,family-story', 'view-only family see family entries, including other relatives'' additions');
select check_that(fails($$insert into entries (owner_id, kind, title, audience) values ('00000000-0000-0000-0000-00000000000a', 'story', 'x', 'family')$$), 'view-only family cannot add');

-- Farah, a beloved one, sees only what is meant for her now.
select as_user('00000000-0000-0000-0000-00000000000f', 'farah@example.com');
select claim_people();
select check_that(titles() = 'for-farah-now,for-farah-yesterday', 'beloved ones see entries shared with them now and dated entries whose day has come');

-- Gopal, the legacy contact, reports. The waiting period starts; Asha signing in cancels it.
select as_user('00000000-0000-0000-0000-000000000010', 'gopal@example.com');
select claim_people();
select check_that(titles() = '', 'legacy contacts see nothing while the owner is here');
select check_that((report_passing('00000000-0000-0000-0000-00000000000a')).state = 'reported', 'a legacy contact can report a passing');
select check_that((legacy_for('00000000-0000-0000-0000-00000000000a')).wait_ends_at > now() + interval '29 days', 'a 30-day waiting period begins');
select as_user('00000000-0000-0000-0000-00000000000a', 'asha@example.com');
select check_that((touch_seen()).state = 'active', 'the owner signing in cancels the report');

-- Reported again, and this time the waiting period runs out.
select as_user('00000000-0000-0000-0000-000000000010', 'gopal@example.com');
select report_passing('00000000-0000-0000-0000-00000000000a');
select check_that(fails('select legacy_tick()'), 'browsers cannot run the daily job');
reset role;
update legacy set wait_ends_at = now() - interval '1 minute';
select check_that(legacy_tick() = 1, 'the daily job passes the archive on when the waiting period ends');
set role authenticated;
select as_user('00000000-0000-0000-0000-000000000010', 'gopal@example.com');
select check_that(titles() = 'bina-adds,family-story,when-im-gone', 'after passing, legacy contacts see family entries and those left for everyone');
select as_user('00000000-0000-0000-0000-00000000000f', 'farah@example.com');
select check_that(titles() = 'bina-adds,family-story,for-farah-now,for-farah-yesterday,when-im-gone,when-im-gone-farah-only', 'beloved ones receive what was left for them');
select check_that(position('private-note' in titles()) = 0 and position('for-farah-at-18' in titles()) = 0, '"Only me" stays private, and future dates still wait');
select as_user('00000000-0000-0000-0000-00000000000a', 'asha@example.com');
select check_that((touch_seen()).state = 'passed', 'a passed archive stays passed');

-- Silence: the daily job moves to reminders, then to asking legacy contacts.
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000012');
insert into legacy (owner_id, quiet_months, last_seen_at) values ('00000000-0000-0000-0000-000000000012', 6, now() - interval '6 months 10 days');
select legacy_tick();
select check_that((select state from legacy where owner_id = '00000000-0000-0000-0000-000000000012') = 'checking', 'six months of silence starts the reminders');
update legacy set last_seen_at = now() - interval '8 months' where owner_id = '00000000-0000-0000-0000-000000000012';
select legacy_tick();
select check_that((select state from legacy where owner_id = '00000000-0000-0000-0000-000000000012') = 'asking', 'thirty more days of silence asks the legacy contacts');
set role authenticated;

-- Place contributions are moderated.
select as_user('00000000-0000-0000-0000-00000000000c');
select check_that(fails($$insert into place_contributions (place_slug, kind, title, body, credit) values ('mithila', 'Word', 'No consent', 'x', 'C.')$$), 'nothing is shared without saying it is yours to share');
insert into place_contributions (place_slug, kind, title, body, credit, status, consent, review_note, notified_status) values ('mithila', 'Word', 'Sasur', 'x', 'C.', 'published', true, 'fake', 'published');
select check_that((select status = 'pending' and review_note is null and notified_status is null from place_contributions), 'contributions start as pending, whatever the browser sends');
insert into place_contributions (place_slug, kind, title, body, credit, consent) select 'mithila', 'Word', 'Extra ' || n, 'x', 'C.', true from generate_series(1, 9) n;
select check_that(fails($$insert into place_contributions (place_slug, kind, title, body, credit, consent) values ('mithila', 'Word', 'Eleventh', 'x', 'C.', true)$$), 'ten contributions a day is the limit');
delete from place_contributions where title like 'Extra %';
select check_that((select count(*) from place_contributions) = 1, 'people can delete what they shared');
select as_user('00000000-0000-0000-0000-00000000000e');
update place_contributions set status = 'published';
reset role;
set role anon;
select as_user('', '');
select check_that((select count(*) from place_contributions) = 1, 'published contributions are public');
select check_that(fails($$select * from entries$$), 'anonymous visitors cannot read archives at all');
set role authenticated;

-- Editing sends it back to be read; moderators give reasons; reports reach moderators only.
select as_user('00000000-0000-0000-0000-00000000000c');
select check_that(fails($$update place_contributions set submitted_by = '00000000-0000-0000-0000-00000000000b'$$), 'nobody can hand their contribution to someone else');
update place_contributions set status = 'published', notified_status = null where title = 'Sasur';
select check_that((select status = 'published' and notified_status is null from place_contributions where title = 'Sasur'), 'touching nothing that matters keeps it published, and the browser cannot fake notifications');
update place_contributions set body = 'Father-in-law, in Maithili' where title = 'Sasur';
select check_that((select status from place_contributions where title = 'Sasur') = 'pending', 'an edit goes back to be read');
select as_user('00000000-0000-0000-0000-00000000000e');
update place_contributions set status = 'rejected', review_note = 'Please say where you heard it.';
select as_user('00000000-0000-0000-0000-00000000000c');
select check_that((select review_note from place_contributions) = 'Please say where you heard it.', 'the person who shared it sees why it was not published');
update place_contributions set review_note = null, status = 'published' where title = 'Sasur';
select check_that((select status = 'rejected' and review_note is not null from place_contributions), 'and cannot clear the reason or publish it themselves');
select as_user('00000000-0000-0000-0000-00000000000e');
update place_contributions set status = 'published', review_note = null;
insert into place_contributions (place_slug, kind, title, body, credit, consent, status) values ('mithila', 'Word', 'Moderator word', 'x', 'M.', true, 'published');
update place_contributions set body = 'changed' where title = 'Moderator word';
select check_that((select status from place_contributions where title = 'Moderator word') = 'pending', 'a moderator''s own edits are read again too');
delete from place_contributions where title = 'Moderator word';
update place_contributions set featured_at = now() where title = 'Sasur';
select as_user('00000000-0000-0000-0000-00000000000c');
update place_contributions set featured_at = null where title = 'Sasur';
select check_that((select featured_at is not null from place_contributions where title = 'Sasur'), 'only moderators choose what is featured');
insert into place_contributions (place_slug, kind, title, body, credit, consent, featured_at) values ('mithila', 'Word', 'Self-featured', 'x', 'C.', true, now());
select check_that((select featured_at is null from place_contributions where title = 'Self-featured'), 'nobody features their own contribution');
delete from place_contributions where title = 'Self-featured';
select as_user('00000000-0000-0000-0000-00000000000b');
insert into contribution_reports (contribution_id, reason, note) select id, 'wrong', 'Sasur means father-in-law' from place_contributions;
select check_that(fails($$insert into contribution_reports (contribution_id, reason) select id, 'spam' from place_contributions$$), 'one report per person per contribution');
select check_that(fails($$insert into contribution_reports (contribution_id, reason) select id, 'because' from place_contributions$$), 'reports need a known reason');
select as_user('00000000-0000-0000-0000-00000000000c');
select check_that((select count(*) from contribution_reports) = 0, 'the person reported cannot see who reported them');
select as_user('00000000-0000-0000-0000-00000000000e');
select check_that((select count(*) from contribution_reports) = 1, 'moderators see reports');
update contribution_reports set resolved = true;
select as_user('00000000-0000-0000-0000-00000000000b');
select check_that(fails($$update contribution_reports set resolved = false$$) or (select resolved from contribution_reports), 'only moderators resolve reports');
reset role;
set role anon;
select as_user('', '');
select check_that(fails($$insert into contribution_reports (contribution_id, reason) select id, 'spam' from place_contributions$$), 'visitors must sign in to report');
set role authenticated;

-- A maker lists herself; she is not public until reviewed, and families can then book.
select as_user('00000000-0000-0000-0000-00000000000d', 'devi@example.com');
insert into listings (id, role, place_slug, name, summary, status) values ('33333333-3333-3333-3333-333333333333', 'maker', 'mithila', 'Devi', 'Kohbar paintings', 'published');
select check_that((select status from listings) = 'pending', 'new listings wait for review');
select as_user('00000000-0000-0000-0000-00000000000c');
select check_that((select count(*) from listings) = 0, 'unreviewed listings are not public');
select check_that(fails($$insert into bookings (listing_id, message) values ('33333333-3333-3333-3333-333333333333', 'hello')$$), 'unreviewed listings cannot be booked');
select as_user('00000000-0000-0000-0000-00000000000e');
update listings set status = 'published';
select as_user('00000000-0000-0000-0000-00000000000d', 'devi@example.com');
select check_that(fails($$insert into bookings (listing_id, message) values ('33333333-3333-3333-3333-333333333333', 'me')$$), 'makers cannot book themselves');
select as_user('00000000-0000-0000-0000-00000000000c', 'chetan@example.com');
insert into bookings (listing_id, message, status, price_paise) values ('33333333-3333-3333-3333-333333333333', 'A painting of our village, please', 'accepted', 1);
select check_that((select status = 'requested' and price_paise is null from bookings), 'a new request starts as a request, whatever the browser sends');
select check_that(fails($$update bookings set price_paise = 1$$), 'families cannot set the price');
select check_that(fails($$update bookings set status = 'accepted'$$), 'families cannot accept before there is a quote');
select check_that(fails($$update bookings set status = 'paid'$$), 'nobody can mark a booking paid from a browser');
select check_that((select count(*) from booking_contacts((select id from bookings))) = 0, 'no contact details before a quote is accepted');
select as_user('00000000-0000-0000-0000-00000000000d', 'devi@example.com');
select check_that(fails($$update bookings set status = 'quoted'$$), 'a quote needs a price');
select check_that(fails($$update bookings set message = 'changed'$$), 'makers cannot rewrite the family''s message');
update bookings set price_paise = 800000, platform_fee_paise = 1, reply = 'Two weeks, on handmade paper', status = 'quoted';
select check_that((select platform_fee_paise from bookings) = 80000, 'the platform fee is worked out by the database, not the browser');
select check_that(fails($$update bookings set status = 'accepted'$$), 'makers cannot accept their own quote');
select as_user('00000000-0000-0000-0000-00000000000c', 'chetan@example.com');
update bookings set status = 'accepted';
select check_that((select status from bookings) = 'accepted', 'the maker quotes and the family accepts');
select check_that((select email from booking_contacts((select id from bookings))) = 'devi@example.com'
  and (select count(*) from booking_contacts((select id from bookings))) = 1, 'once accepted, the family sees only the maker''s email');
select as_user('00000000-0000-0000-0000-00000000000d', 'devi@example.com');
select check_that((select email from booking_contacts((select id from bookings))) = 'chetan@example.com', 'and the maker sees only the family''s');
select check_that(fails($$update bookings set price_paise = 1$$), 'the price cannot change once accepted');
select check_that((select count(*) from contacts) = 1, 'people can read only their own contact row');
select as_user('00000000-0000-0000-0000-00000000000c', 'chetan@example.com');
select check_that(fails($$update bookings set payment_order_id = 'order_fake'$$), 'families cannot attach a payment order');
reset role;
select as_user('', '');
update bookings set payment_order_id = 'order_test';
select check_that((select payment_order_id from bookings) = 'order_test', 'the payment function (service key) attaches the order');
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000b');
select check_that((select count(*) from bookings) = 0, 'other people cannot see a booking');
select check_that((select count(*) from booking_contacts((select id from bookings limit 1))) = 0, 'or anyone''s contact details');
select as_user('00000000-0000-0000-0000-00000000000e');
update bookings set status = 'paid', payment_ref = 'link-123';
select check_that((select status from bookings) = 'paid' and (select count(*) from booking_contacts((select id from bookings))) = 2, 'a moderator records a payment and can reach both sides');
select as_user('00000000-0000-0000-0000-00000000000c', 'chetan@example.com');
select check_that(fails($$update bookings set status = 'cancelled'$$), 'a paid booking cannot be cancelled from the browser');

-- Families recognise what others shared; visitors see counts but never who.
select as_user('00000000-0000-0000-0000-00000000000b');
insert into contribution_echoes (contribution_id) select id from place_contributions where status = 'published';
select check_that(fails($$insert into contribution_echoes (contribution_id) select id from place_contributions where status = 'published'$$), 'one echo per person');
select check_that(fails($$insert into contribution_echoes (contribution_id, user_id) select id, '00000000-0000-0000-0000-00000000000c' from place_contributions where status = 'published'$$), 'nobody can echo for someone else');
reset role;
set role anon;
select as_user('', '');
select check_that((select sum(echoes) from contribution_echo_counts) = 1, 'visitors see how many families recognise it');
select check_that(fails($$select * from contribution_echoes$$), 'but not who');
set role authenticated;

-- A roots portrait is the owner's alone.
select as_user('00000000-0000-0000-0000-00000000000a', 'asha@example.com');
insert into roots (data) values ('{"mode": "line", "generations": [{"place": "Pune"}]}');
insert into roots (data) values ('{"mode": "sides"}') on conflict (owner_id) do update set data = excluded.data;
select check_that((select data->>'mode' from roots) = 'sides', 'an owner keeps and replaces their roots portrait');
select as_user('00000000-0000-0000-0000-00000000000b');
select check_that((select count(*) from roots) = 0, 'nobody else can see a roots portrait');
update roots set data = '{}' where owner_id = '00000000-0000-0000-0000-00000000000a';
select check_that(fails($$insert into roots (owner_id, data) values ('00000000-0000-0000-0000-00000000000a', '{}')$$), 'nobody can write into someone else''s roots');
reset role;
select check_that((select data->>'mode' from roots where owner_id = '00000000-0000-0000-0000-00000000000a') = 'sides', 'and nobody else can change it');
set role authenticated;

-- Kept WhatsApp messages are for the webhook alone.
reset role;
insert into weekly_elders (owner_id, name, day, auto_send, phone) values ('00000000-0000-0000-0000-00000000000a', 'Nani', 0, true, '98765 43210');
insert into whatsapp_messages (id, elder_id, entry_id)
  select 'wamid.1', (select id from weekly_elders where name = 'Nani'), (select id from entries where owner_id = '00000000-0000-0000-0000-00000000000a' limit 1);
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000a', 'asha@example.com');
select check_that(fails($$select * from whatsapp_messages$$), 'nobody signed in can read which WhatsApp messages were kept');
select check_that(fails($$insert into whatsapp_messages (id, elder_id, entry_id) values ('x', gen_random_uuid(), gen_random_uuid())$$), 'or add to them');

-- Private cards: only for the owner's own recordings, and only the owner sees or withdraws them.
select as_user('00000000-0000-0000-0000-00000000000a', 'asha@example.com');
insert into entries (kind, title, audience) values ('story', 'Nani sings', 'private');
insert into media (entry_id, owner_id, kind, name, mime, size, path)
  select id, owner_id, 'audio', 'song.m4a', 'audio/mp4', 10, owner_id || '/' || id || '/song.m4a' from entries where title = 'Nani sings';
insert into cards (entry_id, media_id, note) select m.entry_id, m.id, 'For Mamaji' from media m where m.name = 'song.m4a';
select check_that((select count(*) from cards) = 1 and (select length(token) from cards) = 64, 'an owner makes a card with a long random link');
select check_that((select expires_at > now() + interval '29 days' and expires_at < now() + interval '31 days' from cards), 'it lasts thirty days unless chosen otherwise');
select check_that(fails($$insert into cards (entry_id, media_id, expires_at) select m.entry_id, m.id, now() + interval '2 years' from media m where m.name = 'song.m4a'$$), 'but never more than a year');
select check_that(fails($$update cards set token = 'guessable'$$), 'the link cannot be chosen');
select check_that(fails($$update cards set views = 0$$), 'nor the count of plays');
update cards set revoked_at = now();
select check_that((select revoked_at is not null from cards), 'the owner can withdraw it');
select as_user('00000000-0000-0000-0000-00000000000b', 'bina@example.com');
select check_that((select count(*) from cards) = 0, 'nobody else sees the card');
select check_that(fails($$insert into cards (entry_id, media_id) select m.entry_id, m.id from media m where m.name = 'song.m4a'$$)
  or (select count(*) from media where name = 'song.m4a') = 0, 'nor makes cards of someone else''s recordings');
reset role;
select check_that(not exists (select 1 from cards where owner_id = '00000000-0000-0000-0000-00000000000b'), 'nothing was made for them');
set role authenticated;
set role anon;
select check_that(fails($$select * from cards$$), 'visitors cannot list cards');
reset role;
set role authenticated;

-- Leaving takes the whole archive with it.
select as_user('00000000-0000-0000-0000-000000000012', 'quiet@example.com');
insert into entries (kind, title, audience) values ('story', 'A quiet story', 'private');
select delete_my_account();
reset role;
select check_that(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000012')
  and not exists (select 1 from entries where title = 'A quiet story')
  and not exists (select 1 from legacy where owner_id = '00000000-0000-0000-0000-000000000012'), 'deleting an account deletes its archive');
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000b', 'bina@example.com');
select delete_my_account();
select as_user('00000000-0000-0000-0000-00000000000c', 'chetan@example.com');
select delete_my_account();
reset role;
select check_that(not exists (select 1 from entries where created_by = '00000000-0000-0000-0000-00000000000b')
  and exists (select 1 from entries where owner_id = '00000000-0000-0000-0000-00000000000a')
  and not exists (select 1 from bookings), 'leaving removes what you added to other archives, and nothing of theirs');
set role anon;
select check_that(fails($$select delete_my_account()$$), 'anonymous visitors cannot delete anything');

reset role;
\echo 'All access rules hold.'
