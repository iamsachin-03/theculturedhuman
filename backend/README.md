# Backend for family archives and the marketplace

The family archive app at `/app.html` stores each person's archive in a [Supabase](https://supabase.com) project: Postgres for the data, Supabase Auth for sign-in, and Supabase Storage for voice notes, videos, photographs and documents. The browser talks to it directly with the public anon key; row-level security in the database decides what each person can see. Until a project is connected, the app runs in preview mode, keeping everything in the visitor's browser.

| File | What it is |
| --- | --- |
| `schema.sql` | Tables, row-level security rules, the functions behind sharing and passing an archive on, and the storage bucket rules |
| `test.sql` | 53 checks of the access rules: strangers, family, beloved ones, letters with dates, legacy contacts, silence, deleting an account, moderation and bookings |
| `test.sh` | Runs `test.sql` against a throwaway local database |
| `weekly/` | The optional WhatsApp sender for the weekly question ([its README](weekly/README.md)) |
| `dev/start.sh`, `dev/dev-server.mjs` | A local stand-in for a Supabase project, for development and tests only |

## What the rules guarantee

These mirror `public/scripts/app-core.js`, which the app uses to explain the same rules on screen. Keep the two in step.

- **Every archive belongs to one person.** Only the owner and the person who added an entry can change or delete it.
- **Sharing is per entry.** Each entry has an audience: only me, my family, specific people, specific people from a date, or when my archive is passed on.
- **People are added by email.** An owner adds someone as family who can add, family who can view, a beloved one, or a legacy contact. When that person signs in with the email address, `claim_people()` links them. Changing the email address unlinks them.
- **"Only me" stays private forever,** even after an archive is passed on, and entries with a date stay hidden until that date.
- **Relatives cannot hold things back.** Family who can add may add entries to someone else's archive, but only for "only me and the owner" or "the family".
- **Passing an archive on is slow and cancellable.** A legacy contact reports a death with `report_passing()`. The archive is passed on when the waiting period ends (30 days by default), unless the owner signs in first (`touch_seen()`, called on every visit). If the owner is silent for the quiet period (12 months by default), the daily job `legacy_tick()` moves the archive to "checking" (send reminders), then 30 days later to "asking" (ask the legacy contacts). Browsers cannot call `legacy_tick()`.
- **Files follow their entry.** A file can only be read by people who can see its entry, and only uploaded or deleted by people who can edit it.
- **Leaving is complete.** `delete_my_account()` deletes the account, its archive, and what the person added to other archives. The app removes their stored files first.
- **Place contributions and listings are moderated.** Whatever a browser sends, they start as `pending` and only people in `moderators` can publish them.
- **Bookings keep money honest.** The maker, host or storyteller sets the price and the platform fee separately. Families can only accept or cancel. Only the payment provider's webhook, running with the service key, can mark a booking paid.

## Connecting a Supabase project

1. Create a project (choose the Mumbai region for users in India).
2. In the SQL editor, run `schema.sql`. It also creates the private `archive` storage bucket and its rules.
3. Under Authentication, set the Site URL to the site's address and add `https://<your-site>/app.html` to the redirect URLs. Email sign-in links work out of the box; set up your own SMTP sender before launch, because Supabase's built-in sender is rate-limited. To offer Google, enable the Google provider and set `"google": true` below.
4. Under Storage, set the file size limit you want (the app warns above 50 MB).
5. Schedule `select legacy_tick();` daily with the `pg_cron` extension, and send the reminders for archives that have just moved to `checking` or `asking` (an Edge Function or any email service).
6. Insert the places from `content/places/*.json` into `places`, and add your account to `moderators`.
7. Put the project URL and the public anon key in `content/site.json` under `backend`, then rebuild:

   ```json
   "backend": { "provider": "supabase", "url": "https://<project>.supabase.co", "anonKey": "<anon key>", "google": false }
   ```

   The anon key is safe to publish; the access rules protect the data. Never put the service role key in the site.
8. For payments, use a marketplace product that splits each payment between the maker and the platform (for example Razorpay Route in India), and set `payment_ref` and `status = 'paid'` from its webhook.

## Running the tests

With Postgres 15 or later installed locally:

```bash
backend/test.sh                        # if your user can create databases
PSQL="sudo -u postgres psql" backend/test.sh
```

## A local Supabase stand-in

`dev/start.sh` starts a fresh database with `schema.sql`, Supabase Auth ([GoTrue](https://github.com/supabase/auth) binary), [PostgREST](https://postgrest.org) and `dev/dev-server.mjs`, all on `http://localhost:54321` like a Supabase project. The dev server stores files on disk with the same storage URLs as Supabase and the same access rules, and catches sign-in emails so links can be read at `http://localhost:54321/dev/mail`. It needs no Docker:

```bash
AUTH_BIN=/path/to/auth PGRST_BIN=/path/to/postgrest PSQL="sudo -u postgres psql" backend/dev/start.sh
```

It prints an anon key and saves it to `/tmp/tch-anon-key`. Then:

- run the app against it by pasting this into the browser console on the site: `localStorage.setItem('tch-backend', JSON.stringify({ url: 'http://localhost:54321', anonKey: '<anon key>' }))` (remove the item to go back to preview mode);
- run the app's Supabase integration test: `TCH_DEV_BACKEND=http://localhost:54321 TCH_DEV_ANON_KEY=$(cat /tmp/tch-anon-key) npm test`.
