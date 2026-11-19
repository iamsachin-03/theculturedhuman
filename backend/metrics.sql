-- The three numbers that say whether families come back. Run in the Supabase SQL editor, or
--   psql "$DATABASE_URL" -f backend/metrics.sql
-- Reads counts only; it shows no names, emails or anything anyone wrote.
-- The fourth, how many home-page visitors keep a first story, is in Vercel Web Analytics:
-- the "First story kept" event against home-page visits (README, "Measuring what matters").

-- Week-2 return: of archives started 14 to 90 days ago, the share where someone added
-- something in the second week (days 7 to 13 after the archive's first entry).
with started as (
  select owner_id, min(created_at) as first_at
  from entries group by owner_id
  having min(created_at) between now() - interval '90 days' and now() - interval '14 days'
)
select date_trunc('week', s.first_at)::date as started_week,
       count(*) as archives,
       count(*) filter (where exists (
         select 1 from entries e where e.owner_id = s.owner_id
           and e.created_at >= s.first_at + interval '7 days' and e.created_at < s.first_at + interval '14 days'
       )) as added_in_week_2,
       round(100.0 * count(*) filter (where exists (
         select 1 from entries e where e.owner_id = s.owner_id
           and e.created_at >= s.first_at + interval '7 days' and e.created_at < s.first_at + interval '14 days'
       )) / count(*), 1) as week_2_return_pct
from started s group by 1 order by 1;

-- Relatives per archive: people added, people who have signed in, and people who have added
-- something themselves, for every archive with at least one entry.
with archives as (select distinct owner_id from entries),
per as (
  select a.owner_id,
         (select count(*) from people p where p.owner_id = a.owner_id) as added,
         (select count(*) from people p where p.owner_id = a.owner_id and p.user_id is not null) as joined,
         (select count(distinct e.created_by) from entries e where e.owner_id = a.owner_id and e.created_by <> a.owner_id) as contributing
  from archives a
)
select count(*) as archives,
       round(avg(added), 2) as relatives_added_avg,
       round(avg(joined), 2) as relatives_joined_avg,
       round(avg(contributing), 2) as relatives_adding_avg,
       round(100.0 * count(*) filter (where contributing > 0) / greatest(count(*), 1), 1) as pct_with_a_relative_adding
from per;

-- Weekly activity for the last eight weeks: archives where something was added, and how much.
select date_trunc('week', created_at)::date as week,
       count(distinct owner_id) as active_archives,
       count(*) as entries_added,
       count(*) filter (where created_by <> owner_id) as added_by_relatives
from entries
where created_at > now() - interval '8 weeks'
group by 1 order by 1;
