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
| `tools/build.mjs` | Builds every page, the journal index, image credits, `sitemap.xml` and `robots.txt`, and checks links and images. |
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

```bash
node tools/add-commons-asset.mjs "File:Example.jpg" --id example-id --dir craft/pottery \
  --alt "What the image shows, for screen readers" --subject "Short title" --region "State"
```

Only use images whose licence allows reuse, and keep their credit. The build refuses any image that is not in the register.

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

The header has a **Sign in** button that becomes **My archive** once someone is signed in on that device. Both lead to `/app.html`. To connect real accounts, create a Supabase project and fill in `backend` in `content/site.json`; [`backend/README.md`](backend/README.md) has the steps. Visitors who used the earlier on-device archive or weekly question are offered to bring them into their account the first time they sign in.

## Themes

Marigold (the default), Haldi, Indigo, Gulmohar and Evening. Haldi takes its turmeric yellow, burnt orange and leaf green from the logo. Each theme is a set of CSS custom properties on `html[data-theme]`. The reader's choice is saved in `localStorage` under `tch-theme` and applied before the first paint, so pages never flash the wrong colours. All text colour pairs meet WCAG AA contrast.

## Deployment

`vercel.json` sets the build command (`npm run build`), the output directory (`public`), a permanent redirect from the retired `/bazaar.html` to `/marketplace.html`, long-lived caching for images and basic security headers.

The `firebase.json`, `.firebaserc` and `firestore.*` files belong to the earlier Firebase project and are not used by the Vercel site.

## Weekly question sender

`api/weekly-send.mjs` can send each person's weekly question on WhatsApp for their family member, once a day from a Vercel cron job. It is off until a WhatsApp Business number, an approved template and a few environment variables are in place; [`backend/weekly/README.md`](backend/weekly/README.md) has the steps.

## Visit counts

The site can count visits with [Vercel Web Analytics](https://vercel.com/docs/analytics), which uses no cookies and stores no personal data, so no consent banner is needed. It is off until both are done:

1. In the Vercel dashboard, open the project, then **Analytics** → **Enable**.
2. In `content/site.json`, set `"analytics": { "vercel": true }`, then build and push.

Every public page then loads `/_vercel/insights/script.js`. Private pages (`noindex`, such as the archive app) never do, and the app's own addresses after `#` are never sent.

## Editorial rules

- Never invent facts or quotations. Cite sources, and distinguish history from legend.
- Credit every maker, photographer and community.
- The Bazaar is a preview. Do not add checkout, prices or "buy" buttons until real sellers and payments exist.
