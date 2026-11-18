-- The Cultured Human: database for family accounts and the marketplace.
--
-- Written for Supabase (Postgres 15+ with its auth schema): auth.users holds sign-ins and
-- auth.uid() returns the signed-in user. Every table has row-level security, so the browser can
-- talk to the database directly with the public anon key and still only see what it is allowed to.
-- backend/test.sql checks the rules against a stand-in for Supabase's auth schema.

create extension if not exists pgcrypto;

create type member_role as enum ('owner', 'editor', 'viewer');
create type entry_kind as enum ('story', 'memory', 'wisdom', 'steady', 'letter');
create type review_status as enum ('pending', 'published', 'rejected');
create type listing_role as enum ('maker', 'host', 'storyteller');
create type listing_status as enum ('pending', 'published', 'paused');
create type booking_status as enum ('requested', 'quoted', 'accepted', 'paid', 'completed', 'cancelled');

-- ---------- people ----------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table moderators (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- ---------- families and their archives ----------
create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  created_by uuid not null default auth.uid() references auth.users (id),
  -- If no owner has signed in for this long, legacy contacts become owners. Null means never.
  inactivity_months int check (inactivity_months between 6 and 120),
  created_at timestamptz not null default now()
);

create table family_members (
  family_id uuid not null references families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role member_role not null default 'viewer',
  -- Looks after the archive when the owners no longer can.
  legacy_contact boolean not null default false,
  last_seen_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role member_role not null default 'editor' check (role <> 'owner'),
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid not null default auth.uid() references auth.users (id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days'
);

create table roots_generations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  position int not null check (position between 0 and 11),
  label text not null check (length(label) <= 40),
  place text check (length(place) <= 60),
  years text check (length(years) <= 20),
  detail text check (length(detail) <= 120),
  unique (family_id, position)
);

create table archive_entries (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  kind entry_kind not null,
  prompt text,
  title text not null check (length(title) between 1 and 120),
  teller text,
  for_whom text,
  place text,
  open_when text,
  -- Letters can be held back from everyone but their author until this moment.
  release_at timestamptz check (release_at is null or kind = 'letter'),
  body text check (length(body) <= 50000),
  -- Paths in the private "archive" storage bucket, always under "<family_id>/".
  photo_path text,
  audio_path text,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index archive_entries_family on archive_entries (family_id, created_at);

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
  status review_status not null default 'pending',
  submitted_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (place_slug is not null or suggested_place is not null)
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
  platform_fee_paise bigint check (platform_fee_paise >= 0),
  status booking_status not null default 'requested',
  -- Filled in by the payment webhook (service role only), never by a browser.
  payment_ref text,
  created_at timestamptz not null default now()
);

-- ---------- helpers ----------
-- security definer so policies can ask about membership without recursing into their own table.
create function is_member(f uuid, min_role member_role default 'viewer') returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from family_members m
    where m.family_id = f and m.user_id = auth.uid()
      and case min_role
        when 'viewer' then true
        when 'editor' then m.role in ('editor', 'owner')
        when 'owner' then m.role = 'owner'
      end
  );
$$;

create function is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from moderators where user_id = auth.uid());
$$;

-- Whoever creates a family owns it.
create function add_family_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into family_members (family_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end;
$$;
create trigger families_owner after insert on families for each row execute function add_family_owner();

-- Accepting an invitation is the only way to join a family you did not create.
create function accept_invite(invite_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv family_invites;
begin
  select * into inv from family_invites
  where token = invite_token and accepted_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'This invitation has expired or was already used';
  end if;
  insert into family_members (family_id, user_id, role) values (inv.family_id, auth.uid(), inv.role)
  on conflict (family_id, user_id) do nothing;
  update family_invites set accepted_at = now() where id = inv.id;
  return inv.family_id;
end;
$$;

-- Run daily by a scheduled job: hands an archive to its legacy contacts when owners stop signing in.
create function promote_legacy_contacts() returns int
language plpgsql security definer set search_path = public as $$
declare
  promoted int;
begin
  update family_members m set role = 'owner'
  from families f
  where m.family_id = f.id and m.legacy_contact and m.role <> 'owner' and f.inactivity_months is not null
    and not exists (
      select 1 from family_members o
      where o.family_id = f.id and o.role = 'owner'
        and o.last_seen_at > now() - make_interval(months => f.inactivity_months)
    );
  get diagnostics promoted = row_count;
  return promoted;
end;
$$;

create function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger archive_entries_touch before update on archive_entries for each row execute function touch_updated_at();

-- Only moderators publish. Anyone else's insert starts as pending and their edits send it back to review.
create function guard_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then
    if tg_table_name = 'listings' then
      new.status := 'pending';
    else
      new.status := case when tg_op = 'INSERT' then 'pending'::review_status else old.status end;
    end if;
  end if;
  return new;
end;
$$;
create trigger listings_review before insert or update on listings for each row execute function guard_review();
create trigger contributions_review before insert or update on place_contributions for each row execute function guard_review();

-- Families can change only the message and cancel. Prices and payment state belong to the listing
-- owner and the payment webhook.
create function guard_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  select user_id into owner from listings where id = new.listing_id;
  if auth.uid() is null then
    return new;
  end if;
  if new.payment_ref is distinct from old.payment_ref or (new.status in ('paid', 'completed') and new.status is distinct from old.status) then
    raise exception 'Payment status is set by the payment provider';
  end if;
  if auth.uid() <> owner then
    if new.price_paise is distinct from old.price_paise or new.platform_fee_paise is distinct from old.platform_fee_paise
       or (new.status is distinct from old.status and new.status not in ('accepted', 'cancelled')) then
      raise exception 'Only the maker, host or storyteller can quote';
    end if;
  end if;
  return new;
end;
$$;
create trigger bookings_guard before update on bookings for each row execute function guard_booking();

-- ---------- row-level security ----------
alter table profiles enable row level security;
alter table moderators enable row level security;
alter table families enable row level security;
alter table family_members enable row level security;
alter table family_invites enable row level security;
alter table roots_generations enable row level security;
alter table archive_entries enable row level security;
alter table places enable row level security;
alter table place_contributions enable row level security;
alter table listings enable row level security;
alter table bookings enable row level security;

create policy "see own profile and fellow family members" on profiles for select using (
  id = auth.uid() or exists (
    select 1 from family_members a join family_members b on a.family_id = b.family_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy "manage own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());

create policy "members see their family" on families for select using (is_member(id));
create policy "signed-in people create families" on families for insert with check (auth.uid() is not null and created_by = auth.uid());
create policy "owners rename and set legacy rules" on families for update using (is_member(id, 'owner'));
create policy "owners delete" on families for delete using (is_member(id, 'owner'));

create policy "members see each other" on family_members for select using (is_member(family_id));
create policy "owners manage members" on family_members for update using (is_member(family_id, 'owner'));
create policy "owners remove members, anyone can leave" on family_members for delete using (is_member(family_id, 'owner') or user_id = auth.uid());

create policy "editors see invites" on family_invites for select using (is_member(family_id, 'editor'));
create policy "editors invite" on family_invites for insert with check (is_member(family_id, 'editor') and invited_by = auth.uid());
create policy "editors withdraw invites" on family_invites for delete using (is_member(family_id, 'editor'));

create policy "members see roots" on roots_generations for select using (is_member(family_id));
create policy "editors change roots" on roots_generations for all using (is_member(family_id, 'editor')) with check (is_member(family_id, 'editor'));

create policy "members see entries, letters once released" on archive_entries for select using (
  is_member(family_id) and (release_at is null or release_at <= now() or created_by = auth.uid())
);
create policy "editors add entries" on archive_entries for insert with check (is_member(family_id, 'editor') and created_by = auth.uid());
create policy "authors and owners edit" on archive_entries for update using (
  is_member(family_id, 'editor') and (created_by = auth.uid() or is_member(family_id, 'owner'))
);
create policy "authors and owners delete" on archive_entries for delete using (
  is_member(family_id, 'editor') and (created_by = auth.uid() or is_member(family_id, 'owner'))
);

create policy "anyone reads places" on places for select using (true);
create policy "moderators manage places" on places for all using (is_moderator()) with check (is_moderator());

create policy "published contributions are public" on place_contributions for select using (
  status = 'published' or submitted_by = auth.uid() or is_moderator()
);
create policy "signed-in people contribute" on place_contributions for insert with check (auth.uid() is not null and submitted_by = auth.uid());
create policy "moderators review" on place_contributions for update using (is_moderator());

create policy "published listings are public" on listings for select using (status = 'published' or user_id = auth.uid() or is_moderator());
create policy "people manage their own listing" on listings for insert with check (user_id = auth.uid());
create policy "owners and moderators edit listings" on listings for update using (user_id = auth.uid() or is_moderator());
create policy "owners remove listings" on listings for delete using (user_id = auth.uid());

create policy "both sides see a booking" on bookings for select using (
  requested_by = auth.uid() or exists (select 1 from listings l where l.id = listing_id and l.user_id = auth.uid())
);
create policy "families request published listings" on bookings for insert with check (
  requested_by = auth.uid() and status = 'requested' and price_paise is null and payment_ref is null
  and exists (select 1 from listings l where l.id = listing_id and l.status = 'published')
);
create policy "both sides update a booking" on bookings for update using (
  requested_by = auth.uid() or exists (select 1 from listings l where l.id = listing_id and l.user_id = auth.uid())
);

grant usage on schema public to anon, authenticated;
grant select on places, place_contributions, listings to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function accept_invite(uuid) to authenticated;
revoke execute on function promote_legacy_contacts() from public, anon, authenticated;
