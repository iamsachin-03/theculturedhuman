# The Cultured Human

**What your family knows, kept for the ones who come next.** The Cultured Human is a private family archive: each person signs in to keep their family's stories, voice notes, videos, photographs, sayings and documents, shares each one with the people they choose, and decides what is passed on when they are gone. Around it, an open public side helps everyone trace where they come from: the roots tool, places, stories, keepsakes, journeys and The Commons. It begins in India and welcomes everyone.

Live site: <https://theculturedhuman.vercel.app> · Instagram: [@theculturedhuman](https://www.instagram.com/theculturedhuman/)

The site is plain HTML, CSS and a little JavaScript, built by a small Node script with **no dependencies**. Vercel runs the build and serves `public/`. Signed-in archives are stored in a Supabase project (see [`backend/README.md`](backend/README.md)); until one is connected, the app runs in preview mode in the visitor's browser.

## Quick start

```bash
npm run dev      # build, then serve at http://localhost:4321
npm run build    # regenerate every page in public/
npm run check    # fail if public/ is out of date or has broken links, missing alt text or unlicensed images
npm test         # unit, site and app tests (node --test)
```

Node 18 or newer is all you need. There is nothing to `npm install`.

## How the site is organised

| Path | What it is |
| --- | --- |
| `src/pages/*.html` | Hand-written pages: a short front-matter block, then the page's main content. |
| `content/articles/*.md` | Journal articles in Markdown, with citations. See [`content/articles/README.md`](content/articles/README.md). |
| `content/site.json` | Navigation, footer links, the six editorial pillars, the site URL and where enquiries are sent. |
| `content/offers.json` | What readers can commission, book or join: each offer's card text, page and enquiry form questions. |
| `content/quiz.json` | Questions for the Curious Minds quiz. |
| `content/places/*.json` | One file per place. The build turns each into `/places/<name>.html`, adds it to the roots map and to `/places/places.json`, which the Trace tool uses to link typed places to their pages. `carries` must come from sourced stories; `contributions` are what families sent in, added after review with the credit they chose. |
| `content/people.json` | Makers, hosts and storytellers listed on the platform (`id`, `name`, `role`, `place`, `summary`, optional `languages` and `link`). Empty until the first people are reviewed; pages show an invitation to join instead. |
| `src/pages/app.html`, `public/scripts/app.js` | The signed-in family archive app at `/app.html`: sign in and out, the archive with voice, video, photo and document uploads, the weekly question, the people you share with, archives shared with you, passing your archive on, export and account deletion. Screens are hash routes (`#/archive`, `#/weekly`, `#/people`, …). |
| `public/scripts/app-core.js` | The app's rules, shared with the tests: kinds of entry, the 52 weekly questions, who may see an entry, and how an archive is passed on. `backend/schema.sql` enforces the same rules; keep them in step. |
| `public/scripts/app-store-supabase.js` | The app's connection to Supabase (sign-in by email link or Google, the database and file storage), using `fetch` only. Used when `content/site.json` has a `backend` URL and anon key. |
| `public/scripts/app-store-local.js` | Preview mode: the same app with everything in the browser's IndexedDB and pretend accounts on the device, used when no backend is configured. |
| `backend/` | The database for family archives and the marketplace (Supabase/Postgres), its tested access rules and a local stand-in for development. See [`backend/README.md`](backend/README.md). |
| `public/assets/register.json` | Every image, with its creator, source, licence and alt text. |
| `public/styles/editorial.css` | The design system: five themes, type scale, spacing and components. |
| `public/scripts/theme-init.js` | Applies the saved theme in `<head>`, before the page paints. |
| `public/scripts/site.js` | Theme picker, mobile menu, quiz and enquiry forms. |
| `public/brand/` | The logo badge at several sizes, the favicon and the phone home-screen icon. `public/site.webmanifest` points to them. |
| `tools/build.mjs` | Builds every page, the journal index, the illustrations page, `sitemap.xml` and `robots.txt`, and checks links and images. |
| `public/scripts/roots.js` | The "Trace your roots" tool: draws a family's places as a downloadable portrait. Everything stays in the reader's browser. |
| `tools/roots-example.mjs` | Regenerates `public/brand/roots-example.svg`, the sample portrait shown on the homepage. Run it after changing `roots.js`. |
| `tools/add-commons-asset.mjs` | Downloads a Wikimedia Commons image at two sizes and records its licence in the register. |
| `legacy/bihar-angan/` | Unused code from an earlier project, kept for reference. Not deployed. |

Every HTML file in `public/` is generated. Edit the source in `src/pages/` or `content/`, then run `npm run build` and commit both.

## Publishing

### A new article

1. Create `content/articles/your-slug.md` (copy an existing article for the front matter).
2. Cite every fact that is not common knowledge with `[^n]` and list the sources under `## Sources`.
3. Run `npm run build`. The article appears at `/journal/your-slug.html` and on the journal index and sitemap.

### A new image

Every picture on the site is an original illustration in the house style: warm gouache and coloured pencil on cream paper. Save it in `public/assets/illustrations/` as `<id>-1600.jpg` (full size) and `<id>-800.jpg` (800px on the long side), then add an entry to `public/assets/register.json` with `"kind": "illustration"`, `"source": "Original illustration"`, a subject and alt text. Draw people as they are traditionally pictured rather than as a likeness of a real, named person, and do not copy a particular artist's work. The build refuses any image that is not in the register.

`tools/add-commons-asset.mjs` can still record a freely licensed photograph with its credit, but the site currently uses none.

### Inside a page

- `{{img asset-id}}` inserts a responsive image. Options: `sizes="…"`, `class="…"`, `alt="…"` and `eager`.
- `{{figure asset-id caption="…"}}` inserts an image with its caption and credit.
- `{{credit asset-id}}` inserts only the photo credit.
- `{{quiz}}` inserts the Curious Minds quiz.
- `{{latest-articles 3}}` inserts cards for the newest articles.
- `{{offer-cards commission gifting}}` inserts cards for offers from `content/offers.json`.
- `{{enquiry commission}}` inserts that offer's enquiry form.
- `script: roots` in a page's front matter loads `public/scripts/roots.js` on that page only. List several names separated by spaces (`script: app-core app`) to load more than one, in that order. A page that loads `app` also gets the `backend` settings from `content/site.json` in a `<meta name="tch-backend">` tag.
- `{{directory maker}}`, `{{directory host}}` and `{{directory storyteller}}` list people from `content/people.json`; `{{place-cards}}` and `{{roots-map}}` show the places.

In an article, `offers: [commission, journeys]` in the front matter adds a "Bring this home" block after the sources.

## Enquiries

Every offer page ends with an enquiry form. Where the messages go is set in `content/site.json`:

```json
"enquiries": { "endpoint": "", "email": "" }
```

- **`endpoint`**: the address of a form service (for example Formspree, Basin or Web3Forms) or your own serverless function. Forms post there and readers see a thank-you message. The hidden `_gotcha` field is a spam trap that most form services recognise.
- **`email`**: used only when there is no endpoint. Submitting opens the reader's email app with the message ready to send.
- **Neither set** (the current state): the message is copied for the reader, with a button that opens an Instagram message to `instagramDm`.

Run `npm run build` after changing these settings.

## Accounts

The top menu is What we offer, Places, Stories, The Commons and Plans, with a **My archive** button that leads to `/app.html` (sign-in, if needed, happens there). Every offering is described once in `content/products.json`, which draws the What we offer page (`{{product-journey}}`). To connect real accounts, create a Supabase project and fill in `backend` in `content/site.json`; [`backend/README.md`](backend/README.md) has the steps. Visitors who used the earlier on-device archive or weekly question are offered to bring them into their account the first time they sign in.

## A first story before signing up

The home page opens with one question (`public/scripts/first-story.js`). Visitors can answer it in writing or with a voice note without an account; the answer is kept in their browser's IndexedDB (`tch-archive`) and turned into a keepsake card they can save or send. When they sign in, the archive offers to keep it. Entries already kept or declined are remembered by id in `localStorage` (`tch-imported-ids`), so later answers are still offered.

## Sharing a voice note into the archive

`public/site.webmanifest` declares a share target and `public/sw.js` receives it. On Android, once someone adds the site to their home screen, The Cultured Human appears in WhatsApp's share menu: a shared voice note, photograph or video is kept in IndexedDB (`tch-shared`) and the archive's editor opens with it attached (`#/entry/new?shared=N`). The service worker caches nothing, and `vercel.json` serves it with `no-cache`.

## Birthdays, festivals and the family book

The archive's home shows what is coming up within three weeks: the birthday of anyone you ask the weekly question (month and day only, `weekly_elders.birthday`), or a festival from `OCCASIONS` in `public/scripts/app-core.js`, each with a question to ask while the family is together. Fixed-day festivals repeat by themselves; festivals that follow the moon list their dates as published for India: Diwali and Gurpurab to 2035, Holi and Eid to 2031 (further ahead, published dates disagree). Eid's are tentative until the moon is sighted. `npm test` fails a year before any festival runs out of dates, as the reminder to add more. The archive card fills towards `BOOK_GOAL` (20 entries), the point at which the archive is long enough to print as a family book.

## Themes

Marigold (the default), Haldi, Indigo, Gulmohar and Evening. Haldi takes its turmeric yellow, burnt orange and leaf green from the logo. Each theme is a set of CSS custom properties on `html[data-theme]`. The reader's choice is saved in `localStorage` under `tch-theme` and applied before the first paint, so pages never flash the wrong colours. All text colour pairs meet WCAG AA contrast.

## Deployment

`vercel.json` sets the build command (`npm run build`), the output directory (`public`), a permanent redirect from the retired `/bazaar.html` to `/marketplace.html`, long-lived caching for images and basic security headers.

The `firebase.json`, `.firebaserc` and `firestore.*` files belong to the earlier Firebase project and are not used by the Vercel site.

## Adding to a place

Each place page sends families to `/app.html#/contribute?place=<slug>` to write a word, a dish, a festival, a song or a memory and choose their credit. It waits as `pending` until a moderator publishes it at `/app.html#/moderate`; `public/scripts/places-live.js` then shows it on the place page without a rebuild. The enquiry form stays on the page, folded away, for people who would rather not sign in. The database needs `backend/places.sql`, which the build writes from `content/places/*.json` ([steps](backend/README.md#connecting-a-supabase-project)).

Moderators can also feature a published contribution from the moderate page ("Featured on The Commons"). Featured ones show first, with a Featured label, on The Commons, the home page and their place page. Only moderators can feature, and an author's edit sends it back for review unfeatured. Featuring one or two a week gives visitors a strong answer to read first.

When families suggest a place that has no page yet, the moderate page groups the suggestions. `npm run new-place -- --list` shows them; `npm run new-place -- --name "Jorhat" --region "Assam" --lat 26.75 --lng 94.2` writes `content/places/jorhat.json` (marked as started by families, with no photograph yet). With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set it also adds the place to the database and moves the waiting suggestions onto it; otherwise build, re-run `backend/places.sql`, and move them from the moderate page. Suggestions that match an existing place can be moved from the moderate page.

Shared contributions live at `/s/<id>`, served by `api/shared.mjs` so WhatsApp, LinkedIn and others show the contribution in their link preview. Empty Commons and home feeds show a few examples from `content/community-examples.json`, always labelled as written by us; keep them factual.

## Weekly question sender

`api/weekly-send.mjs` can send each person's weekly question on WhatsApp for their family member, once a day from a Vercel cron job. It is off until a WhatsApp Business number, an approved template and a few environment variables are in place; [`backend/weekly/README.md`](backend/weekly/README.md) has the steps.

## Visit counts

The site can count visits with [Vercel Web Analytics](https://vercel.com/docs/analytics), which uses no cookies and stores no personal data, so no consent banner is needed. It is off until both are done:

1. In the Vercel dashboard, open the project, then **Analytics** → **Enable**.
2. In `content/site.json`, set `"analytics": { "vercel": true }`, then build and push.

Every public page then loads `/_vercel/insights/script.js`. Private pages (`noindex`, such as the archive app) never do, and the app's own addresses after `#` are never sent.

## Measuring what matters

Three numbers say whether families find the site and come back:

1. **First-visit save rate**: home-page visitors who keep a first story. In Vercel Web Analytics, compare the `First story kept` event with visits to `/`. `First story started` shows how many begin, and `Keepsake card shared` shows how many send their card on (`how` is `share` or `download`). Custom events need a paid Vercel plan; on the free plan only visits are counted. Events never carry anything a visitor wrote.
2. **Week-2 return**: archives where someone added something in the second week after the first entry.
3. **Relatives per archive**: relatives added, relatives who have signed in, and relatives who have added something themselves.

The second and third come from the database, not from tracking: run [`backend/metrics.sql`](backend/metrics.sql) in the Supabase SQL editor. It reads counts only. Week-2 return counts additions, not visits, which is the stronger signal and needs nothing extra in the archive app.

## Editorial rules

- Never invent facts or quotations. Cite sources, and distinguish history from legend.
- Credit every maker, photographer and community.
- The Bazaar is a preview. Do not add checkout, prices or "buy" buttons until real sellers and payments exist.
