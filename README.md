# The Cultured Human

**Wisdom. Culture. Conscious Living.** An independent Indian cultural journal, discovery platform and future curated marketplace.

Live site: <https://theculturedhuman.vercel.app> · Instagram: [@theculturedhuman](https://www.instagram.com/theculturedhuman/)

The site is plain HTML, CSS and a little JavaScript, built by a small Node script with **no dependencies**. Vercel runs the build and serves `public/`.

## Quick start

```bash
npm run dev      # build, then serve at http://localhost:4321
npm run build    # regenerate every page in public/
npm run check    # fail if public/ is out of date or has broken links, missing alt text or unlicensed images
npm test         # unit and site tests (node --test)
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
| `public/assets/register.json` | Every image, with its creator, source, licence and alt text. |
| `public/styles/editorial.css` | The design system: five themes, type scale, spacing and components. |
| `public/scripts/theme-init.js` | Applies the saved theme in `<head>`, before the page paints. |
| `public/scripts/site.js` | Theme picker, mobile menu, quiz and enquiry forms. |
| `public/brand/` | The logo badge at several sizes, the favicon and the phone home-screen icon. `public/site.webmanifest` points to them. |
| `tools/build.mjs` | Builds every page, the journal index, image credits, `sitemap.xml` and `robots.txt`, and checks links and images. |
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

## Themes

Marigold (the default), Haldi, Indigo, Gulmohar and Evening. Haldi takes its turmeric yellow, burnt orange and leaf green from the logo. Each theme is a set of CSS custom properties on `html[data-theme]`. The reader's choice is saved in `localStorage` under `tch-theme` and applied before the first paint, so pages never flash the wrong colours. All text colour pairs meet WCAG AA contrast.

## Deployment

`vercel.json` sets the build command (`npm run build`), the output directory (`public`), a permanent redirect from the retired `/bazaar.html` to `/marketplace.html`, long-lived caching for images and basic security headers.

The `firebase.json`, `.firebaserc` and `firestore.*` files belong to the earlier Firebase project and are not used by the Vercel site.

## Editorial rules

- Never invent facts or quotations. Cite sources, and distinguish history from legend.
- Credit every maker, photographer and community.
- The Bazaar is a preview. Do not add checkout, prices or "buy" buttons until real sellers and payments exist.
