-- The Cultured Human: database for personal family archives and the marketplace.
--
-- Written for Supabase (Postgres 15+ with its auth and storage schemas): auth.users holds
-- sign-ins, auth.uid() and auth.email() describe the signed-in person. Every table has row-level
-- security, so the browser talks to the database directly with the public anon key and still sees
-- only what it is allowed to. The rules mirror public/scripts/app-core.js; keep the two in step.
-- backend/test.sql checks them; backend/README.md explains how to run it.

create extension if not exists pgcrypto;

create type person_role as enum ('family_edit', 'family_view', 'beloved', 'legacy');
create type entry_kind as enum ('story', 'memory', 'wisdom', 'steady', 'letter');
create type audience_type as enum ('private', 'family', 'people', 'date', 'passed');
create type media_kind as enum ('audio', 'video', 'photo', 'document');
create type legacy_state as enum ('active', 'checking', 'asking', 'reported', 'passed');
create type review_status as enum ('pending', 'published', 'rejected');
create type listing_role as enum ('maker', 'host', 'storyteller');
create type listing_status as enum ('pending', 'published', 'paused');
create type booking_status as enum ('requested', 'quoted', 'accepted', 'paid', 'completed', 'cancelled');

-- ---------- people and their archives ----------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table moderators (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- The people an owner shares with. user_id is filled in when that person signs in with the email.
create table people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  email text not null check (position('@' in email) > 1),
  role person_role not null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner_id, email),
  check (user_id is null or user_id <> owner_id)
);
create index people_user on people (user_id);

create table legacy (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  quiet_months int not null default 12 check (quiet_months between 3 and 60),
  wait_days int not null default 30 check (wait_days between 7 and 90),
  last_seen_at timestamptz not null default now(),
  state legacy_state not null default 'active',
  reported_by uuid references auth.users (id),
  wait_ends_at timestamptz,
  passed_at timestamptz
);

create table entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind entry_kind not null,
  title text not null check (length(title) between 1 and 120),
  prompt text,
  teller text,
  for_whom text,
  place text,
  open_when text,
  body text check (length(body) <= 50000),
  audience audience_type not null default 'private',
  audience_people uuid[] not null default '{}',
  release_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (audience <> 'date' or (release_at is not null and cardinality(audience_people) > 0)),
  check (audience <> 'people' or cardinality(audience_people) > 0)
);
create index entries_owner on entries (owner_id, created_at);

-- Files live in the private "archive" storage bucket at <owner_id>/<entry_id>/<file>.
create table media (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind media_kind not null,
  name text not null,
  mime text not null,
  size bigint not null check (size >= 0),
  path text not null unique,
  created_at timestamptz not null default now(),
  check (path like owner_id::text || '/' || entry_id::text || '/%')
);

create table weekly_elders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  relation text,
  phone text,
  day int not null check (day between 0 and 6),
  idx int not null default 0,
  answered int not null default 0,
  asked_at timestamptz,
  sign_as text,
  -- The owner says this person agreed to get the question from the site's WhatsApp number.
  auto_send boolean not null default false,
  created_at timestamptz not null default now()
);

create table roots (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'
);

-- ---------- places and what families share about them ----------
create table places (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  region text not null,
  lat double precision not null,
  lng double precision not null
);

create table place_contributions (
  id uuid primary key default gen_random_uuid(),
  place_slug text references places (slug),
  suggested_place text,
  kind text not null check (length(kind) <= 40),
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 5000),
  credit text not null check (length(credit) between 1 and 80),
  -- For words and sayings: the word in its own script, and how it is said.
  script text check (script is null or length(script) <= 120),
  pronunciation text check (pronunciation is null or length(pronunciation) <= 120),
  -- Weeks since content/prompts.json "start", when this answers that week's question.
  prompt_week int check (prompt_week is null or prompt_week >= 0),
  -- The person confirmed it is theirs to share and follows the community guidelines.
  consent boolean not null default false check (consent),
  status review_status not null default 'pending',
  -- Why a moderator did not publish it, or removed it. Shown only to the person who shared it.
  review_note text check (review_note is null or length(review_note) <= 300),
  -- The last status the notifier emailed about (backend/notify), so nobody is told twice.
  notified_status review_status,
  submitted_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (place_slug is not null or suggested_place is not null)
);

-- Visitors who are signed in can report something published; moderators decide.
create table contribution_reports (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references place_contributions (id) on delete cascade,
  reported_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null check (reason in ('private', 'hostile', 'wrong', 'not-theirs', 'spam', 'other')),
  note text check (note is null or length(note) <= 500),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (contribution_id, reported_by)
);

-- ---------- makers, hosts and storytellers ----------
create table listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role listing_role not null,
  place_slug text not null references places (slug),
  name text not null check (length(name) between 1 and 80),
  summary text not null check (length(summary) between 1 and 600),
  languages text[] not null default '{}',
  link text check (link is null or link ~ '^https://'),
  -- Shown on the listing, for example "From ₹2,500 a session". The real price is quoted per request.
  price_note text check (price_note is null or length(price_note) <= 80),
  status listing_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id),
  requested_by uuid not null default auth.uid() references auth.users (id),
  message text not null check (length(message) between 1 and 5000),
  -- Set by the maker, host or storyteller. The platform fee is kept separate so families see both.
  price_paise bigint check (price_paise >= 0),
  -- Always platform_fee(price_paise), set by guard_booking(), never by a browser.
  platform_fee_paise bigint check (platform_fee_paise >= 0),
  -- The maker's note with their quote, or why they can't take it on.
  reply text check (reply is null or length(reply) <= 2000),
  status booking_status not null default 'requested',
  -- Filled in by the payment webhook (service role only), never by a browser.
  payment_ref text,
  -- The last status the notifier emailed about (backend/notify).
  notified_status booking_status,
  created_at timestamptz not null default now()
);

-- Where the two sides of an accepted booking can reach each other. Never readable directly; only
-- booking_contacts() hands an email out, and only to the other side of an accepted booking.
create table contacts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  updated_at timestamptz not null default now()
);

-- "We have this too": families from the same place recognising what someone shared.
create table contribution_echoes (
  contribution_id uuid not null references place_contributions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contribution_id, user_id)
);
-- Counts only, so visitors see how many families recognise something but never who.
create view contribution_echo_counts as
  select contribution_id, count(*)::int as echoes from contribution_echoes group by contribution_id;

-- ---------- helpers ----------
-- security definer so policies can ask about people and legacy without recursing into RLS.
create function my_person(owner uuid) returns people
language sql stable security definer set search_path = public as $$
  select * from people where owner_id = owner and user_id = auth.uid() limit 1;
$$;

create function is_passed(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from legacy where owner_id = owner and state = 'passed');
$$;

-- The same rule as canSee() in app-core.js. "Only me" stays private forever.
create function can_see_entry(e entries) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  p people;
begin
  if auth.uid() is null then return false; end if;
  if e.owner_id = auth.uid() or e.created_by = auth.uid() then return true; end if;
  p := my_person(e.owner_id);
  if p.id is null then return false; end if;
  return case e.audience
    when 'private' then false
    when 'family' then p.role in ('family_edit', 'family_view') or (is_passed(e.owner_id) and p.role in ('beloved', 'legacy'))
    when 'people' then p.id = any (e.audience_people)
    when 'date' then e.release_at <= now() and p.id = any (e.audience_people)
    when 'passed' then is_passed(e.owner_id) and (cardinality(e.audience_people) = 0 or p.id = any (e.audience_people))
  end;
end;
$$;

create function can_add_to(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner = auth.uid() or coalesce((my_person(owner)).role = 'family_edit', false);
$$;

create function entry_visible(entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_see_entry(e) from entries e where e.id = entry), false);
$$;

create function entry_editable(entry uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from entries e where e.id = entry and (e.owner_id = auth.uid() or e.created_by = auth.uid()));
$$;

-- Storage paths are <owner_id>/<entry_id>/<file>. Used by the storage policies below.
create function can_read_object(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from media m where m.path = can_read_object.path and entry_visible(m.entry_id));
$$;

create function can_write_object(path text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := string_to_array(path, '/');
begin
  if array_length(parts, 1) <> 3 or parts[1] !~ '^[0-9a-f-]{36}$' or parts[2] !~ '^[0-9a-f-]{36}$' then
    return false;
  end if;
  return exists (select 1 from entries e where e.id = parts[2]::uuid and e.owner_id = parts[1]::uuid
                 and (e.owner_id = auth.uid() or e.created_by = auth.uid()));
end;
$$;

create function is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from moderators where user_id = auth.uid());
$$;

-- Called after every sign-in: links the people rows that name this person's email.
create function claim_people() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update people set user_id = auth.uid()
  where user_id is null and lower(email) = lower(auth.email()) and owner_id <> auth.uid();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Called by the owner's app on every visit: proves they are still here and cancels any check,
-- report or waiting period. A passed archive stays passed.
create function touch_seen() returns legacy
language plpgsql security definer set search_path = public as $$
declare
  l legacy;
begin
  insert into legacy (owner_id) values (auth.uid()) on conflict (owner_id) do nothing;
  update legacy set last_seen_at = now(), state = 'active', reported_by = null, wait_ends_at = null
  where owner_id = auth.uid() and state <> 'passed'
  returning * into l;
  if l.owner_id is null then
    select * into l from legacy where owner_id = auth.uid();
  end if;
  return l;
end;
$$;

-- A legacy contact reports that the owner has died, or confirms after the reminders went unanswered.
-- The archive is passed on when the waiting period ends, unless the owner signs in first.
create function report_passing(owner uuid) returns legacy
language plpgsql security definer set search_path = public as $$
declare
  l legacy;
begin
  if coalesce((my_person(owner)).role, 'family_view') <> 'legacy' then
    raise exception 'Only a legacy contact can do this';
  end if;
  insert into legacy (owner_id) values (owner) on conflict (owner_id) do nothing;
  update legacy set state = 'reported', reported_by = auth.uid(), wait_ends_at = now() + make_interval(days => wait_days)
  where owner_id = owner and state not in ('passed', 'reported')
  returning * into l;
  if l.owner_id is null then
    select * into l from legacy where owner_id = owner;
  end if;
  return l;
end;
$$;

-- People the owner shares with may read the owner's legacy state, so the app can show it.
create function legacy_for(owner uuid) returns legacy
language sql stable security definer set search_path = public as $$
  select l.* from legacy l where l.owner_id = owner and (owner = auth.uid() or (my_person(owner)).id is not null);
$$;

-- Deletes the signed-in person's account and, through the cascades, their whole archive.
-- The app removes their stored files first, while it still has permission to.
create function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from entries where created_by = auth.uid();
  delete from bookings where requested_by = auth.uid()
    or listing_id in (select id from listings where user_id = auth.uid());
  delete from place_contributions where submitted_by = auth.uid();
  update legacy set reported_by = null where reported_by = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

-- The same steps as legacyNext() in app-core.js. Run daily by a scheduled job (pg_cron), which also
-- sends the reminders for rows that have just become 'checking' or 'asking'.
create function legacy_tick() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  k int;
begin
  update legacy set state = 'checking'
  where state = 'active' and now() >= last_seen_at + make_interval(months => quiet_months);
  get diagnostics k = row_count; n := n + k;
  update legacy set state = 'asking'
  where state = 'checking' and now() >= last_seen_at + make_interval(months => quiet_months) + interval '30 days';
  get diagnostics k = row_count; n := n + k;
  update legacy set state = 'passed', passed_at = wait_ends_at
  where state = 'reported' and now() >= wait_ends_at;
  get diagnostics k = row_count; n := n + k;
  return n;
end;
$$;

create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger entries_touch before update on entries for each row execute function touch_updated_at();

-- Entries keep their owner and author; audiences may only name the owner's own people.
create function guard_entry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.owner_id <> old.owner_id or new.created_by <> old.created_by) then
    raise exception 'An entry cannot move to another archive';
  end if;
  if exists (select 1 from unnest(new.audience_people) a where not exists (select 1 from people p where p.id = a and p.owner_id = new.owner_id)) then
    raise exception 'Entries can only be shared with people in the owner''s list';
  end if;
  -- Relatives adding to someone else's archive cannot hold things back for later.
  if new.owner_id <> new.created_by and new.audience in ('date', 'passed') then
    raise exception 'Only the owner can leave entries for later';
  end if;
  return new;
end;
$$;
create trigger entries_guard before insert or update on entries for each row execute function guard_entry();

-- Changing someone's email unlinks the account it was linked to; they must sign in with the new one.
create function unlink_changed_email() returns trigger
language plpgsql as $$
begin
  if lower(new.email) <> lower(old.email) then new.user_id := null; end if;
  return new;
end;
$$;
create trigger people_email before update on people for each row execute function unlink_changed_email();

-- Only moderators publish. Anyone else's insert starts as pending and their edits send it back to review.
-- Moderation, for every write from a browser (the service role, with no signed-in user, is trusted):
-- listings wait for review after every change; contributions start as pending, and go back to
-- pending when the person who shared them edits what they say.
create function guard_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_moderator() then
    return new;
  end if;
  if tg_table_name = 'listings' then
    new.status := 'pending';
    return new;
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from place_contributions where submitted_by = auth.uid() and created_at > now() - interval '1 day') >= 10 then
      raise exception 'You have shared 10 things today. Thank you! Please come back tomorrow for more.';
    end if;
    new.status := 'pending';
    new.review_note := null;
    new.notified_status := null;
    return new;
  end if;
  if new.submitted_by <> old.submitted_by then raise exception 'This cannot be changed'; end if;
  new.notified_status := old.notified_status;
  if (new.place_slug, new.suggested_place, new.kind, new.title, new.body, new.credit, new.script, new.pronunciation, new.prompt_week)
     is distinct from (old.place_slug, old.suggested_place, old.kind, old.title, old.body, old.credit, old.script, old.pronunciation, old.prompt_week) then
    new.status := 'pending';
    new.review_note := null;
  else
    new.status := old.status;
    new.review_note := old.review_note;
  end if;
  return new;
end;
$$;
create trigger listings_review before insert or update on listings for each row execute function guard_review();
create trigger contributions_review before insert or update on place_contributions for each row execute function guard_review();

-- The platform fee, added on top of the maker's price and shown separately. Must match
-- platformFeePercent in content/site.json (test/site.test.mjs checks).
create function platform_fee(price bigint) returns bigint
language sql immutable as $$
  select round(price * 0.10)::bigint;
$$;

-- A booking moves requested -> quoted -> accepted -> paid -> completed, or is cancelled before it is
-- paid. The maker, host or storyteller quotes; the family accepts; payment is recorded by the payment
-- provider's webhook (no signed-in user) or by a moderator reconciling a payment link.
create function guard_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  if auth.uid() is not null then
    new.notified_status := case when tg_op = 'INSERT' then null else old.notified_status end;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'requested';
    new.price_paise := null;
    new.platform_fee_paise := null;
    new.reply := null;
    new.payment_ref := null;
    return new;
  end if;
  select user_id into owner from listings where id = new.listing_id;
  if auth.uid() is not null and not is_moderator() then
    if new.listing_id <> old.listing_id or new.requested_by <> old.requested_by or new.payment_ref is distinct from old.payment_ref then
      raise exception 'This part of a booking cannot be changed';
    end if;
    if new.status in ('paid', 'completed') and new.status is distinct from old.status then
      raise exception 'Payment status is set by the payment provider';
    end if;
    if new.status = 'cancelled' and new.status is distinct from old.status and old.status not in ('requested', 'quoted', 'accepted') then
      raise exception 'A paid booking cannot be cancelled here';
    end if;
    if auth.uid() = owner then
      if new.message <> old.message then raise exception 'Only the family can change their message'; end if;
      if new.price_paise is distinct from old.price_paise and old.status not in ('requested', 'quoted') then
        raise exception 'The price cannot change once it is accepted';
      end if;
      if new.status is distinct from old.status and new.status not in ('quoted', 'cancelled') then
        raise exception 'Only the family can accept a quote';
      end if;
      if new.status = 'quoted' and (new.price_paise is null or old.status not in ('requested', 'quoted')) then
        raise exception 'Add a price to quote';
      end if;
    else
      if new.price_paise is distinct from old.price_paise or new.reply is distinct from old.reply then
        raise exception 'Only the maker, host or storyteller can quote';
      end if;
      if new.status is distinct from old.status and not (new.status = 'accepted' and old.status = 'quoted') and new.status <> 'cancelled' then
        raise exception 'A quote can only be accepted once it has been given';
      end if;
    end if;
  end if;
  new.platform_fee_paise := case when new.price_paise is null then null else platform_fee(new.price_paise) end;
  return new;
end;
$$;
create trigger bookings_guard before insert or update on bookings for each row execute function guard_booking();

-- Keeps the signed-in person's email for booking_contacts() when they list themselves or ask.
create function remember_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(auth.email(), '') <> '' then
    insert into contacts (user_id, email) values (auth.uid(), auth.email())
      on conflict (user_id) do update set email = excluded.email, updated_at = now();
  end if;
  return new;
end;
$$;
create trigger listings_contact after insert on listings for each row execute function remember_contact();
create trigger bookings_contact after insert on bookings for each row execute function remember_contact();
create trigger contributions_contact after insert on place_contributions for each row execute function remember_contact();

-- Once a family accepts a quote, each side can see how to reach the other. Moderators see both.
create function booking_contacts(booking uuid) returns table (side text, name text, email text)
language sql stable security definer set search_path = public as $$
  select x.side, x.name, c.email
  from bookings b
  join listings l on l.id = b.listing_id
  cross join lateral (values
    ('provider', l.name, l.user_id),
    ('family', coalesce((select display_name from profiles where id = b.requested_by), 'The family'), b.requested_by)
  ) as x (side, name, uid)
  left join contacts c on c.user_id = x.uid
  where b.id = booking
    and b.status in ('accepted', 'paid', 'completed')
    and (is_moderator()
      or (x.side = 'provider' and b.requested_by = auth.uid())
      or (x.side = 'family' and l.user_id = auth.uid()));
$$;

-- ---------- row-level security ----------
alter table profiles enable row level security;
alter table moderators enable row level security;
alter table people enable row level security;
alter table legacy enable row level security;
alter table entries enable row level security;
alter table media enable row level security;
alter table weekly_elders enable row level security;
alter table roots enable row level security;
alter table places enable row level security;
alter table place_contributions enable row level security;
alter table listings enable row level security;
alter table bookings enable row level security;
alter table contacts enable row level security;
alter table contribution_echoes enable row level security;
alter table contribution_reports enable row level security;

create policy "see own profile and the people who share with each other" on profiles for select using (
  id = auth.uid()
  or exists (select 1 from people p where p.owner_id = auth.uid() and p.user_id = profiles.id)
  or exists (select 1 from people p where p.owner_id = profiles.id and p.user_id = auth.uid())
);
create policy "create own profile" on profiles for insert with check (id = auth.uid());
create policy "edit own profile" on profiles for update using (id = auth.uid());

create policy "owners see their people, people see their own row" on people for select using (owner_id = auth.uid() or user_id = auth.uid());
create policy "owners add people" on people for insert with check (owner_id = auth.uid() and user_id is null);
create policy "owners change people" on people for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners remove people, people can leave" on people for delete using (owner_id = auth.uid() or user_id = auth.uid());

create policy "owners see their legacy settings" on legacy for select using (owner_id = auth.uid());
create policy "owners create legacy settings" on legacy for insert with check (owner_id = auth.uid() and state = 'active');
-- State changes only happen through touch_seen(), report_passing() and legacy_tick().
create policy "owners change legacy settings" on legacy for update using (owner_id = auth.uid() and state <> 'passed');

create policy "see entries you are allowed to" on entries for select using (can_see_entry(entries));
create policy "owners and family who can add" on entries for insert with check (created_by = auth.uid() and can_add_to(owner_id));
create policy "authors and owners edit" on entries for update using (owner_id = auth.uid() or created_by = auth.uid());
create policy "authors and owners delete" on entries for delete using (owner_id = auth.uid() or created_by = auth.uid());

create policy "media follows its entry" on media for select using (entry_visible(entry_id));
create policy "authors and owners attach media" on media for insert with check (entry_editable(entry_id) and can_write_object(path));
create policy "authors and owners remove media" on media for delete using (entry_editable(entry_id));

create policy "owners only" on weekly_elders for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners only" on roots for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "anyone reads places" on places for select using (true);
create policy "moderators manage places" on places for all using (is_moderator()) with check (is_moderator());

create policy "published contributions are public" on place_contributions for select using (
  status = 'published' or submitted_by = auth.uid() or is_moderator()
);
create policy "signed-in people contribute" on place_contributions for insert with check (auth.uid() is not null and submitted_by = auth.uid());
create policy "moderators review, people edit their own" on place_contributions for update using (is_moderator() or submitted_by = auth.uid());
create policy "people delete their own, moderators anything" on place_contributions for delete using (is_moderator() or submitted_by = auth.uid());

create policy "see your own reports, moderators see all" on contribution_reports for select using (reported_by = auth.uid() or is_moderator());
create policy "report what is published" on contribution_reports for insert with check (
  reported_by = auth.uid() and exists (select 1 from place_contributions c where c.id = contribution_id and c.status = 'published')
);
create policy "moderators resolve reports" on contribution_reports for update using (is_moderator());

create policy "published listings are public" on listings for select using (status = 'published' or user_id = auth.uid() or is_moderator());
create policy "people manage their own listing" on listings for insert with check (user_id = auth.uid());
create policy "owners and moderators edit listings" on listings for update using (user_id = auth.uid() or is_moderator());
create policy "owners remove listings" on listings for delete using (user_id = auth.uid());

create policy "both sides see a booking" on bookings for select using (
  requested_by = auth.uid() or is_moderator() or exists (select 1 from listings l where l.id = listing_id and l.user_id = auth.uid())
);
create policy "families request published listings" on bookings for insert with check (
  requested_by = auth.uid()
  and exists (select 1 from listings l where l.id = listing_id and l.status = 'published' and l.user_id <> auth.uid())
);
create policy "both sides update a booking" on bookings for update using (
  requested_by = auth.uid() or is_moderator() or exists (select 1 from listings l where l.id = listing_id and l.user_id = auth.uid())
);

create policy "your own contact" on contacts for select using (user_id = auth.uid());

create policy "see your own echoes" on contribution_echoes for select using (user_id = auth.uid());
create policy "echo what is published" on contribution_echoes for insert with check (
  user_id = auth.uid() and exists (select 1 from place_contributions c where c.id = contribution_id and c.status = 'published')
);
create policy "take back your echo" on contribution_echoes for delete using (user_id = auth.uid());


grant usage on schema public to anon, authenticated;
grant select on places, place_contributions, listings, contribution_echo_counts to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on contacts, contribution_echo_counts from authenticated;
revoke update on legacy, people from authenticated;
grant update (quiet_months, wait_days) on legacy to authenticated;
grant update (name, email, role) on people to authenticated;
grant execute on function claim_people(), touch_seen(), report_passing(uuid), legacy_for(uuid), delete_my_account(), booking_contacts(uuid) to authenticated;
revoke execute on function booking_contacts(uuid) from public, anon;
revoke execute on function delete_my_account() from public, anon;
revoke execute on function legacy_tick() from public, anon, authenticated;

-- ---------- file storage ----------
-- On Supabase, run this part too: a private bucket whose objects follow the media rules above.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    insert into storage.buckets (id, name, public) values ('archive', 'archive', false) on conflict (id) do nothing;
    create policy "archive: read what you may see" on storage.objects for select to authenticated
      using (bucket_id = 'archive' and can_read_object(name));
    create policy "archive: upload to entries you can edit" on storage.objects for insert to authenticated
      with check (bucket_id = 'archive' and can_write_object(name));
    create policy "archive: delete from entries you can edit" on storage.objects for delete to authenticated
      using (bucket_id = 'archive' and can_write_object(name));
  end if;
end $$;
