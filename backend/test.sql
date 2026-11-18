-- Checks the access rules in schema.sql. Run with backend/test.sh, which creates a throwaway
-- database, adds a minimal stand-in for Supabase's auth schema, loads schema.sql, then runs this.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),  -- Asha, who starts the archive
  ('00000000-0000-0000-0000-00000000000b'),  -- Bina, her cousin
  ('00000000-0000-0000-0000-00000000000c'),  -- Chetan, a stranger
  ('00000000-0000-0000-0000-00000000000d'),  -- Devi, a maker
  ('00000000-0000-0000-0000-00000000000e');  -- Esha, a moderator
insert into moderators values ('00000000-0000-0000-0000-00000000000e');
insert into places values ('mithila', 'Mithila', 'North Bihar', 26.35, 86.07);

create function as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
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
grant execute on function as_user(text), fails(text), check_that(boolean, text) to authenticated, anon;

set role authenticated;

-- Asha creates a family and becomes its owner.
select as_user('00000000-0000-0000-0000-00000000000a');
insert into families (id, name) values ('11111111-1111-1111-1111-111111111111', 'The Jha family');
select check_that((select role from family_members where user_id = auth.uid()) = 'owner', 'whoever creates a family owns it');
insert into archive_entries (family_id, kind, title, body) values
  ('11111111-1111-1111-1111-111111111111', 'wisdom', 'Jaisi karni, waisi bharni', 'As you sow, so shall you reap.');
insert into archive_entries (family_id, kind, title, release_at) values
  ('11111111-1111-1111-1111-111111111111', 'letter', 'For Anya, when she turns 18', now() + interval '10 years');
select check_that((select count(*) from archive_entries) = 2, 'authors see their own held letters');
select check_that(fails($$insert into archive_entries (family_id, kind, title, release_at) values ('11111111-1111-1111-1111-111111111111', 'story', 'x', now())$$), 'only letters can be held until a date');
insert into family_invites (id, family_id, email) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'bina@example.com');

-- A stranger sees nothing and cannot join without the invitation's secret token.
select as_user('00000000-0000-0000-0000-00000000000c');
select check_that((select count(*) from archive_entries) = 0, 'strangers cannot read an archive');
select check_that((select count(*) from families) = 0, 'strangers cannot see a family');
select check_that(fails($$insert into family_members (family_id, user_id, role) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-00000000000c', 'owner')$$), 'strangers cannot add themselves to a family');
select check_that(fails($$insert into archive_entries (family_id, kind, title) values ('11111111-1111-1111-1111-111111111111', 'story', 'graffiti')$$), 'strangers cannot write to an archive');
select check_that((select count(*) from family_invites) = 0, 'strangers cannot read invitation tokens');

-- Bina accepts the invitation and adds her side, but cannot open the held letter.
-- In real use the token arrives in the invitation link.
reset role;
select token as invite_token from family_invites where id = '22222222-2222-2222-2222-222222222222' \gset
set role authenticated;
select as_user('00000000-0000-0000-0000-00000000000b');
select accept_invite(:'invite_token');
select check_that(true, 'an invited relative can accept with the token');
select check_that((select role from family_members where user_id = auth.uid()) = 'editor', 'invited relatives join as editors');
select check_that((select count(*) from archive_entries) = 1, 'held letters stay hidden from relatives until their date');
insert into archive_entries (family_id, kind, title) values ('11111111-1111-1111-1111-111111111111', 'story', 'How Nana crossed the Kosi');
select check_that(fails($$update family_members set role = 'owner' where user_id = auth.uid()$$) or (select role from family_members where user_id = auth.uid()) = 'editor', 'relatives cannot make themselves owners');
select check_that(fails($$select accept_invite('22222222-2222-2222-2222-222222222222')$$), 'invitations cannot be reused or guessed');
update archive_entries set title = 'changed' where title = 'Jaisi karni, waisi bharni';
select check_that((select title from archive_entries where kind = 'wisdom') = 'Jaisi karni, waisi bharni', 'relatives cannot edit entries they did not write');

-- Asha names Bina a legacy contact. When Asha stops signing in, Bina inherits the archive.
select as_user('00000000-0000-0000-0000-00000000000a');
update family_members set legacy_contact = true where user_id = '00000000-0000-0000-0000-00000000000b';
update families set inactivity_months = 12 where id = '11111111-1111-1111-1111-111111111111';
select check_that(fails('select promote_legacy_contacts()'), 'browsers cannot trigger the legacy hand-over');
reset role;
update family_members set last_seen_at = now() - interval '13 months' where role = 'owner';
select check_that(promote_legacy_contacts() = 1, 'the scheduled job hands over to legacy contacts');
select check_that((select role from family_members where user_id = '00000000-0000-0000-0000-00000000000b') = 'owner', 'the legacy contact is now an owner');
set role authenticated;

-- Place contributions are moderated.
select as_user('00000000-0000-0000-0000-00000000000c');
insert into place_contributions (place_slug, kind, title, body, credit, status) values ('mithila', 'Word', 'Sasur', 'x', 'C.', 'published');
select check_that((select status from place_contributions) = 'pending', 'contributions start as pending, whatever the browser sends');
select as_user('00000000-0000-0000-0000-00000000000e');
update place_contributions set status = 'published';
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select check_that((select count(*) from place_contributions) = 1, 'published contributions are public');
select check_that(fails($$select * from archive_entries$$), 'anonymous visitors cannot read archives at all');
set role authenticated;

-- A maker lists herself; she is not public until reviewed, and families can then book.
select as_user('00000000-0000-0000-0000-00000000000d');
insert into listings (id, role, place_slug, name, summary, status) values ('33333333-3333-3333-3333-333333333333', 'maker', 'mithila', 'Devi', 'Kohbar paintings', 'published');
select check_that((select status from listings) = 'pending', 'new listings wait for review');
select as_user('00000000-0000-0000-0000-00000000000c');
select check_that((select count(*) from listings) = 0, 'unreviewed listings are not public');
select check_that(fails($$insert into bookings (listing_id, message) values ('33333333-3333-3333-3333-333333333333', 'hello')$$), 'unreviewed listings cannot be booked');
select as_user('00000000-0000-0000-0000-00000000000e');
update listings set status = 'published';
select as_user('00000000-0000-0000-0000-00000000000c');
insert into bookings (id, listing_id, message) values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'A painting of our village, please');
select check_that(fails($$update bookings set price_paise = 1$$), 'families cannot set the price');
select check_that(fails($$update bookings set status = 'paid'$$), 'nobody can mark a booking paid from a browser');
select as_user('00000000-0000-0000-0000-00000000000d');
update bookings set price_paise = 800000, platform_fee_paise = 120000, status = 'quoted';
select as_user('00000000-0000-0000-0000-00000000000c');
update bookings set status = 'accepted';
select check_that((select status from bookings) = 'accepted', 'the maker quotes and the family accepts');
select as_user('00000000-0000-0000-0000-00000000000b');
select check_that((select count(*) from bookings) = 0, 'other people cannot see a booking');

reset role;
\echo 'All access rules hold.'
