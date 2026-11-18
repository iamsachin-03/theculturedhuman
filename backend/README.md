# Backend for family accounts and the marketplace

The website works today without a server. Trace your roots and the family archive keep everything in the visitor's browser, and forms go to email or Instagram. This folder holds the database for the next step: family accounts, shared archives, moderated place contributions, and listings and bookings for makers, hosts and storytellers.

It is written for [Supabase](https://supabase.com), which provides Postgres, sign-in and file storage, but it is plain Postgres apart from `auth.users` and `auth.uid()`.

| File | What it is |
| --- | --- |
| `schema.sql` | Tables, row-level security rules and the functions behind invitations and legacy hand-over |
| `test.sql` | 31 checks of the access rules: strangers, relatives, held letters, legacy contacts, moderation, bookings |
| `test.sh` | Runs `test.sql` against a throwaway local database |

## What the rules guarantee

- **Archives are private.** Only members of a family can read its archive. Anonymous visitors cannot read archives at all.
- **Relatives join by invitation only**, using a one-time token that expires after 30 days. They join as editors and can add entries, but cannot edit other people's entries or make themselves owners.
- **Letters can wait.** A letter with a `release_at` date is hidden from everyone but its author until that date.
- **Legacy contacts.** An owner can name members as legacy contacts and set `inactivity_months`. A daily scheduled job (`promote_legacy_contacts()`, which browsers cannot call) makes legacy contacts owners once no owner has signed in for that long.
- **Place contributions and listings are moderated.** Whatever a browser sends, they start as `pending` and only people in `moderators` can publish them.
- **Bookings keep money honest.** The maker, host or storyteller sets the price and the platform fee separately. Families can only accept or cancel. Only the payment provider's webhook, running with the service key, can mark a booking paid.

## Connecting it

1. Create a Supabase project (choose the Mumbai region for users in India).
2. In the SQL editor, run `schema.sql`.
3. Create a private storage bucket called `archive`, with a policy that allows access to paths starting `<family_id>/` only when `is_member(family_id)` is true.
4. Schedule `select promote_legacy_contacts();` daily (Supabase's `pg_cron` extension).
5. Insert the places from `content/places/*.json` into `places`, and add your account to `moderators`.
6. Put the project URL and the public anon key in `content/site.json`. The browser code that signs people in and syncs the local archive is the next piece of work. The archive's saved-copy format (`family-archive.json`) already matches these tables, so existing archives can be uploaded.
7. For payments, use a marketplace product that splits each payment between the maker and the platform (for example Razorpay Route in India), and set `payment_ref` and `status = 'paid'` from its webhook.

## Running the tests

With Postgres 15 or later installed locally:

```bash
backend/test.sh                        # if your user can create databases
PSQL="sudo -u postgres psql" backend/test.sh
```
