import { escapeHtml as e } from './markdown.mjs';

// The file is twice the display size so the badge stays sharp on high-density screens.
function logo(displaySize) {
  return `<img src="/brand/logo-${displaySize * 2 > 96 ? 192 : 96}.png" width="${displaySize}" height="${displaySize}" alt="" decoding="async">`;
}

export function headBlock({ site, page, image }) {
  const url = site.url + page.path;
  const img = image ? site.url + image.files[1600] : '';
  return [
    `<meta name="theme-color" content="#FBF4E8">`,
    `<link rel="canonical" href="${e(url)}">`,
    `<meta property="og:site_name" content="${e(site.name)}">`,
    `<meta property="og:type" content="${page.type === 'article' ? 'article' : 'website'}">`,
    `<meta property="og:title" content="${e(page.title)}">`,
    `<meta property="og:description" content="${e(page.description)}">`,
    `<meta property="og:url" content="${e(url)}">`,
    `<meta property="og:locale" content="${e(site.locale)}">`,
    img && `<meta property="og:image" content="${e(img)}">`,
    img && `<meta property="og:image:alt" content="${e(image.alt)}">`,
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
    `<link rel="icon" href="/brand/favicon-32.png" type="image/png" sizes="32x32">`,
    `<link rel="icon" href="/brand/logo-192.png" type="image/png" sizes="192x192">`,
    `<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">`,
    `<link rel="manifest" href="/site.webmanifest">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap">`,
    `<link rel="stylesheet" href="/styles/editorial.css">`,
    `<script src="/scripts/theme-init.js"></script>`,
    // Vercel Web Analytics counts visits without cookies; it only answers once switched on for the project.
    site.analytics && site.analytics.vercel && !page.noindex && `<script src="/_vercel/insights/script.js" defer></script>`,
    page.jsonLd && `<script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n');
}

function isActive(href, path, match = []) {
  if (href === '/') return path === '/' || path === '/';
  if (href.endsWith('/')) return path.startsWith(href);
  return path === href || match.includes(path);
}

// Trace your roots and the family archive are one product; its pages share this menu.
const PRODUCT_NAV = {
  roots: {
    label: 'My Roots',
    links: [
      ['/roots', 'How it works'],
      ['/trace', 'Trace your roots'],
      ['/archive', 'Family archive'],
      ['/family-stories', 'Storytellers'],
      ['/roots-kit', 'The Roots Kit'],
    ],
    action: ['/app', 'Open my archive'],
  },
};

export function productNav(product, path) {
  const p = PRODUCT_NAV[product];
  if (!p) throw new Error(`Unknown product "${product}"`);
  return `<nav class="product-nav" aria-label="${e(p.label)}"><div class="container product-nav__inner">
<a class="product-nav__name" href="${p.links[0][0]}">${e(p.label)}</a>
<ul>${p.links.map(([href, label]) => `<li><a href="${href}"${href === path ? ' aria-current="page"' : ''}>${e(label)}</a></li>`).join('')}</ul>
<a class="product-nav__action" href="${p.action[0]}">${e(p.action[1])}</a>
</div></nav>`;
}

export function headerBlock({ site, page }) {
  const links = site.nav
    .map((n) => `<li><a href="${n.href}"${n.href === page.path ? ' aria-current="page"' : isActive(n.href, page.path, n.match) ? ' aria-current="true"' : ''}>${e(n.label)}</a></li>`)
    .join('');
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
<div class="site-header__inner">
<a class="wordmark" href="/" aria-label="${e(site.name)} — home">${logo(44)}<span>${e(site.name)}</span></a>
<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-nav"><svg class="icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg><svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span class="menu-toggle__label">Menu</span></button>
<nav class="primary-nav" id="primary-nav" aria-label="Main"><ul>${links}</ul></nav>
<a class="account-link" href="/app"${page.path === '/app' ? ' aria-current="page"' : ''}>My archive</a>
<label class="theme-picker"><span class="theme-swatch" aria-hidden="true"></span><span>Theme</span>
<select data-theme-picker aria-label="Colour theme">
<option value="marigold">Marigold</option>
<option value="haldi">Haldi</option>
<option value="indigo">Indigo</option>
<option value="gulmohar">Gulmohar</option>
<option value="evening">Evening</option>
</select></label>
</div>
</header>`;
}

export function footerBlock({ site }) {
  const cols = site.footer
    .map((col) => `<div><h2>${e(col.title)}</h2><ul>${col.links
      .map((l) => `<li><a href="${l.href}"${/^https?:/.test(l.href) ? ' rel="noopener"' : ''}>${e(l.label)}</a></li>`)
      .join('')}</ul></div>`)
    .join('\n');
  return `<footer class="site-footer">
<div class="border-weave" aria-hidden="true"></div>
<div class="container site-footer__grid">
<div class="site-footer__brand"><a class="wordmark wordmark--footer" href="/">${logo(96)}<span>${e(site.name)}</span></a><p>${e(site.tagline)} ${e(site.supportingLine)}</p></div>
${cols}
</div>
<div class="container site-footer__bottom"><span>© ${new Date().getFullYear()} ${e(site.name)}. Rooted in India, curious about everywhere.</span><span class="site-footer__legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/community-guidelines">Community guidelines</a><a href="/if-we-close">If we close</a><a href="/credits">Illustrations</a></span></div>
</footer>
<script src="/scripts/site.js" defer></script>`;
}

export function picture(asset, { sizes = '100vw', className = '', eager = false, alt } = {}) {
  return `<img src="${asset.files[1600]}" srcset="${asset.files[800]} 800w, ${asset.files[1600]} 1600w" sizes="${sizes}" width="${asset.width}" height="${asset.height}" alt="${e(alt ?? asset.alt)}"${className ? ` class="${className}"` : ''}${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;
}

const isOriginal = (asset) => asset.source === 'Original illustration';

export function creditLine(asset) {
  if (isOriginal(asset)) return `<span class="credit">Illustration: <a href="/credits">${e(asset.creator)}</a></span>`;
  return `<span class="credit">${asset.kind === 'illustration' ? 'Illustration' : 'Photo'}: <a href="${e(asset.sourceUrl)}" rel="noopener">${e(asset.creator)}</a>, ${e(asset.licence)}${asset.licenceUrl ? ` (<a href="${e(asset.licenceUrl)}" rel="noopener">licence</a>)` : ''}</span>`;
}

export function figure(asset, captionHtml, wide) {
  return `<figure${wide ? ' class="wide"' : ''}>${picture(asset, { sizes: wide ? '(max-width: 1040px) 100vw, 1000px' : '(max-width: 760px) 100vw, 700px' })}<figcaption>${captionHtml}${creditLine(asset)}</figcaption></figure>`;
}

export function storyCard(article, asset, pillarLabel) {
  return `<a class="story-card" href="${article.path}"><div class="story-card__media">${picture(asset, { sizes: '(max-width: 700px) 100vw, 400px' })}</div><span class="eyebrow">${e(pillarLabel)}</span><h3>${e(article.title)}</h3><p>${e(article.description)}</p></a>`;
}

export function offerCard(offer, asset) {
  return `<a class="offer-card" href="${offer.href}"><div class="offer-card__media">${picture(asset, { sizes: '(max-width: 700px) 100vw, 360px', alt: '' })}</div><div class="offer-card__body"><span class="eyebrow">${e(offer.label)}</span><h3>${e(offer.title)}</h3><p>${e(offer.summary)}</p><span class="offer-card__action">${e(offer.action)}</span></div></a>`;
}

/** Every offering, grouped by the steps a family goes through, with the featured one shown large. */
export function productJourney(groups) {
  const tile = (p) => p.featured
    ? `<article class="product-feature"><div class="product-feature__media">${picture(p.asset, { sizes: '(max-width: 860px) 100vw, 560px', alt: '' })}</div><div class="product-feature__body">${p.badge ? `<p class="product-badge">${e(p.badge)}</p>` : ''}<h3><a href="${p.href}">${e(p.name)}</a></h3><p>${e(p.line)}</p><p class="product-price">${e(p.price)}</p><div class="btn-row"><a class="btn" href="${p.cta.href}">${e(p.cta.label)}</a>${p.sample ? `<a class="btn btn--ghost" href="${p.sample.href}">${e(p.sample.label)}</a>` : ''}</div><a class="text-link" href="${p.href}">More about the ${e(p.name.toLowerCase())}</a></div></article>`
    : `<a class="offer-card product-card" href="${p.href}"><div class="offer-card__media">${picture(p.asset, { sizes: '(max-width: 700px) 100vw, 360px', alt: '' })}</div><div class="offer-card__body"><h3>${e(p.name)}</h3><p>${e(p.line)}</p><span class="product-price">${e(p.price)}</span><span class="offer-card__action">Find out more</span></div></a>`;
  return groups.map((g) => {
    const featured = g.items.filter((p) => p.featured);
    const rest = g.items.filter((p) => !p.featured);
    return `<section class="product-group" id="${g.id}" aria-labelledby="${g.id}-title">
<div class="section-head"><p class="eyebrow"><span class="product-group__step">${e(g.step)}</span> ${e(g.eyebrow)}</p><h2 id="${g.id}-title">${e(g.title)}</h2><p>${e(g.intro)}</p></div>
${featured.map(tile).join('')}
${rest.length ? `<div class="offer-grid${rest.length < 3 ? ' offer-grid--few' : ''}">${rest.map(tile).join('')}</div>` : ''}
</section>`;
  }).join('\n');
}

/** The same few facts at the top of every product page: who it is for, what it costs, how it works and what we promise. */
export function atAGlance(p, group) {
  return `<section class="glance" aria-label="${e(p.name)} at a glance">
<div class="container">
<p class="glance__trail"><a href="/offerings">What we offer</a> · <a href="/offerings#${group.id}">${e(group.eyebrow)}</a></p>
<div class="glance__grid">
<dl class="glance__facts">
<div><dt>Who it is for</dt><dd>${e(p.who)}</dd></div>
<div><dt>What it costs</dt><dd>${e(p.price)}</dd></div>
<div><dt>Our promise</dt><dd>${e(p.trust)}</dd></div>
</dl>
<div class="glance__how"><p class="glance__label">How it works</p><ol>${p.steps.map((s) => `<li>${e(s)}</li>`).join('')}</ol>
<div class="btn-row"><a class="btn" href="${p.cta.href}">${e(p.cta.label)}</a>${p.sample ? `<a class="btn btn--ghost" href="${p.sample.href}">${e(p.sample.label)}</a>` : ''}</div></div>
</div>
</div>
</section>`;
}

export function bringHome(cards) {
  return `<section class="bring-home container" aria-labelledby="bring-home-title">
<p class="eyebrow">Bring this home</p>
<h2 id="bring-home-title">From the story to your own life.</h2>
<div class="offer-grid">${cards.join('')}</div>
</section>`;
}

/**
 * An enquiry form. With site.enquiries.endpoint set it posts there; without one,
 * site.js turns the message into an email (site.enquiries.email) or an Instagram message.
 */
export function enquiryForm(site, offer, hidden = {}) {
  const f = offer.form;
  const id = (name) => `enq-${offer.id}-${name}`;
  const field = (name, label, input, hint = '') =>
    `<p class="field${name === 'message' ? ' field--wide' : ''}"><label for="${id(name)}">${label}</label>${hint ? `<span class="field__hint" id="${id(name)}-hint">${e(hint)}</span>` : ''}${input}</p>`;
  const { endpoint = '', email = '' } = site.enquiries || {};
  const fields = [
    field('name', 'Your name', `<input id="${id('name')}" name="name" type="text" autocomplete="name" required>`),
    field('email', 'Email', `<input id="${id('email')}" name="email" type="email" autocomplete="email" required>`),
    field('phone', 'Phone or WhatsApp <span class="field__optional">(optional)</span>', `<input id="${id('phone')}" name="phone" type="tel" autocomplete="tel">`),
    f.organisation &&
      field(
        'organisation',
        `Organisation${f.organisationOptional ? ' <span class="field__optional">(optional)</span>' : ''}`,
        `<input id="${id('organisation')}" name="organisation" type="text" autocomplete="organization"${f.organisationOptional ? '' : ' required'}>`,
      ),
    f.choices &&
      field(
        'choice',
        e(f.choiceLabel),
        `<select id="${id('choice')}" name="${e(f.choiceLabel)}"><option value="">Choose one</option>${f.choices.map((c) => `<option>${e(c)}</option>`).join('')}</select>`,
      ),
    field(
      'message',
      `${e(f.messageLabel)}${f.messageOptional ? ' <span class="field__optional">(optional)</span>' : ''}`,
      `<textarea id="${id('message')}" name="message" rows="5"${f.messageHint ? ` aria-describedby="${id('message')}-hint"` : ''}${f.messageOptional ? '' : ' required'}></textarea>`,
      f.messageHint,
    ),
  ].filter(Boolean);
  return `<form class="enquiry" data-enquiry${endpoint ? ` action="${e(endpoint)}" method="post"` : ''} data-email="${e(email)}" data-dm="${e(site.instagramDm)}" data-handle="${e(site.instagramHandle)}">
<input type="hidden" name="enquiry" value="${e(offer.label)}">
${Object.entries(hidden).map(([k, v]) => `<input type="hidden" name="${e(k)}" value="${e(v)}">\n`).join('')}<div class="enquiry__grid">
${fields.join('\n')}
</div>
<p class="enquiry__trap" aria-hidden="true"><label>Leave this empty <input name="_gotcha" type="text" tabindex="-1" autocomplete="off"></label></p>
<div class="enquiry__footer"><button class="btn" type="submit">Send enquiry</button><p class="enquiry__note">We use your details only to reply to you.</p></div>
<div class="enquiry__status" role="status" aria-live="polite" tabindex="-1"></div>
${endpoint ? '' : `<noscript><p class="enquiry__note">This form needs JavaScript. You can also <a href="${e(site.instagramDm)}" rel="noopener">message ${e(site.instagramHandle)} on Instagram</a>.</p></noscript>`}
</form>`;
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * @param {{ site: any, page: { path: string, title: string, description: string, type?: string, jsonLd?: object, noindex?: boolean, script?: string, product?: string }, image?: any, main: string }} args
 */
export function layout({ site, page, image, main }) {
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(page.title)}</title>
<meta name="description" content="${e(page.description)}">
${page.noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}${/(^|\s)app(\s|$)/.test(page.script || '') ? `<meta name="tch-backend" content="${e(JSON.stringify(site.backend || {}))}">\n<meta name="tch-fee" content="${site.platformFeePercent}">\n` : ''}${headBlock({ site, page, image })}
</head>
<body>
${headerBlock({ site, page })}
<main id="main">
${page.product ? productNav(page.product, page.path) + '\n' : ''}${main.trim()}
</main>
${footerBlock({ site })}
${(page.script || '').split(/\s+/).filter(Boolean).map((name) => `<script src="/scripts/${name}.js" defer></script>\n`).join('')}</body>
</html>
`;
}

export function articleMain({ site, article, hero, bodyHtml, sourcesHtml, related, offers = '' }) {
  const pillar = site.pillars[article.pillar];
  const main = `<article>
<header class="article-header container">
<p class="eyebrow">${e(article.series ? `${article.series} · ${pillar.label}` : pillar.label)}</p>
<h1>${e(article.title)}</h1>
<p class="dek">${e(article.dek)}</p>
<p class="article-meta"><span>${e(article.author)}</span><span><time datetime="${article.date}">${formatDate(article.date)}</time></span><span>${article.readingMinutes} min read</span></p>
</header>
<figure class="article-hero">${picture(hero, { eager: true, sizes: '(max-width: 1140px) 100vw, 1100px' })}<figcaption class="credit">${e(article.heroCaption || hero.subject)}. ${creditLine(hero).replace(/^<span class="credit">|<\/span>$/g, '')}</figcaption></figure>
<div class="prose">
${bodyHtml}
</div>
${sourcesHtml}
</article>
${offers}
${related.length ? `<section class="related container" aria-labelledby="related-title"><h2 id="related-title" class="eyebrow">Keep reading</h2><div class="card-grid">${related.join('')}</div></section>` : ''}
<div class="section"></div>`;
  return main;
}

export function journalMain({ cards }) {
  return `<section class="page-hero">
<div class="container">
<p class="eyebrow">Stories</p>
<h1>Stories of <em>where we come from.</em></h1>
<p class="lede">Researched, sourced and written with care: the crafts, kitchens, ideas and places that families carry with them.</p>
</div>
</section>
<section class="section">
<div class="container card-grid">
${cards.join('\n')}
</div>
</section>
<section class="section section--surface" aria-labelledby="your-story-title">
<div class="container invite">
<div class="invite__card invite__card--accent">
<p class="eyebrow">The Commons</p>
<h2 id="your-story-title">Your family has a story too.</h2>
<p>A word that doesn't translate, a dish made once a year, a song from every wedding. Answer this week's question, and it joins the page of the place it comes from.</p>
<a class="btn btn--light" href="/manch#this-week">See this week's question</a>
</div>
<div class="invite__card">
<p class="eyebrow">My Roots</p>
<h2>Keep the ones only your family knows.</h2>
<p>Some stories aren't for everyone. Record them in your elders' own voices and keep them in a private family archive, shared only with the people you choose.</p>
<a class="text-link" href="/roots">How My Roots works</a>
</div>
</div>
</section>`;
}

export function creditsMain({ assets }) {
  const item = (a) => `<li><img src="${a.files[800]}" alt="" width="96" height="72" loading="lazy" decoding="async"><div><strong>${e(a.subject)}</strong>${a.region ? ` · ${e(a.region)}` : ''}<br>${isOriginal(a) ? 'Original illustration' : `${e(a.creator)} · <a href="${e(a.sourceUrl)}" rel="noopener">${e(a.source)}</a> · ${a.licenceUrl ? `<a href="${e(a.licenceUrl)}" rel="noopener">${e(a.licence)}</a>` : e(a.licence)}`}</div></li>`;
  const originals = assets.filter(isOriginal);
  const others = assets.filter((a) => !isOriginal(a));
  return `<section class="page-hero">
<div class="container">
<p class="eyebrow">Our illustrations</p>
<h1>Drawn for <em>these stories.</em></h1>
<p class="lede">Every picture on The Cultured Human is an original illustration, made for the page or story it sits beside. None of them shows a real, named person or copies a particular artist's work; where a story is about someone, we draw them as they are traditionally pictured.</p>
</div>
</section>
<section class="section">
<div class="container--narrow">
<ul class="credits-list">
${originals.map(item).join('\n')}
</ul>
${others.length ? `<h2 class="credits-heading">Other images</h2>
<p>Used under the licence shown. If you are a creator and something here is wrong, please tell us.</p>
<ul class="credits-list">
${others.map(item).join('\n')}
</ul>` : ''}
</div>
</section>`;
}

const ROLE_LABELS = {
  maker: { one: 'Maker', many: 'Makers', join: 'makers', none: 'No makers are listed here yet.' },
  host: { one: 'Host', many: 'Hosts', join: 'hosts', none: 'No hosts are listed here yet.' },
  storyteller: { one: 'Storyteller', many: 'Storytellers', join: 'storytellers', none: 'No storytellers are listed here yet.' },
};

export function personCard(p) {
  const r = ROLE_LABELS[p.role];
  return `<article class="person-card"><p class="eyebrow">${r.one} · <a href="${p.placeInfo.path}">${e(p.placeInfo.name)}</a></p><h3>${e(p.name)}</h3><p>${e(p.summary)}</p>${p.languages ? `<p class="person-card__meta">Speaks ${e(p.languages.join(', '))}</p>` : ''}${p.link ? `<a class="text-link" href="${e(p.link)}" rel="noopener">See their work</a>` : ''}</article>`;
}

function backendAttrs(site) {
  return site.backend && site.backend.url ? ` data-url="${e(site.backend.url)}" data-key="${e(site.backend.anonKey)}"` : '';
}

/**
 * Everyone with one role, or an honest empty state that invites the first of them. community-live.js
 * adds the makers, hosts and storytellers who have listed themselves in the app and been reviewed.
 */
export function directory(site, role, list) {
  const r = ROLE_LABELS[role];
  const inner = list.length
    ? `<div class="person-grid">${list.map(personCard).join('')}</div>`
    : `<div class="empty-state"><p><strong>${r.none}</strong> The first ${r.join} are being invited now.</p><a class="text-link" href="/app#/offer?role=${role}">List yourself as a ${r.one.toLowerCase()}</a></div>`;
  return `<div class="directory" data-listings data-role="${role}"${backendAttrs(site)}>${inner}</div>`;
}

export function placeCards(places) {
  return `<div class="place-grid">${places
    .map((p) => `<a class="place-card${p.hero ? '' : ' place-card--families'}" href="${p.path}"><div class="place-card__media">${p.hero ? picture(p.hero, { sizes: '(max-width: 700px) 100vw, 320px', alt: '' }) : `<span class="place-card__initial" aria-hidden="true">${e(p.name.slice(0, 1))}</span>`}</div><span class="eyebrow">${e(p.region)}</span><h3>${e(p.name)}</h3><p>${p.startedBy === 'families' ? 'Started by families' : ((n) => `${n} ${n === 1 ? 'thing' : 'things'} families carry`)(p.carries.length + p.contributions.length)}</p></a>`)
    .join('')}</div>`;
}

/** Places drawn by latitude and longitude with no base map: positions are approximate by design. */
export function rootsMap(places) {
  const W = 600, H = 620, west = 68, east = 98, north = 37, south = 6;
  const x = (lng) => Math.round(((lng - west) / (east - west)) * W);
  const y = (lat) => Math.round(((north - lat) / (north - south)) * H);
  const grid = [];
  for (let lng = 70; lng < east; lng += 2) for (let lat = 8; lat < north; lat += 2) grid.push(`<circle cx="${x(lng)}" cy="${y(lat)}" r="1.2"/>`);
  const points = places
    .map((p) => {
      const px = x(p.lng), py = y(p.lat);
      const right = px < W - 90;
      return `<a href="${p.path}" aria-label="${e(p.name)}"><circle class="roots-map__halo" cx="${px}" cy="${py}" r="18"/><circle class="roots-map__dot" cx="${px}" cy="${py}" r="7"/><text x="${right ? px + 16 : px - 16}" y="${py + 6}" text-anchor="${right ? 'start' : 'end'}">${e(p.name)}</text></a>`;
    })
    .join('');
  return `<figure class="roots-map"><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Map of places on The Cultured Human"><g class="roots-map__grid" aria-hidden="true">${grid.join('')}</g>${points}</svg><figcaption>Each point is a place families have traced back to. Positions are approximate.</figcaption></figure>`;
}

/** Signing in to write it is the easy way; the enquiry form stays for people who would rather not. */
function contributeBox(site, slug, form) {
  if (!(site.backend && site.backend.url)) return form;
  return `<div class="contribute-cta">
<a class="btn" href="/app#/contribute${slug ? `?place=${e(slug)}` : ''}">Write it now</a>
<p class="enquiry__note">Sign in with your email, write a few lines and choose how you are credited.</p>
<details class="contribute-other"><summary>Rather not sign in? Send it to us instead</summary>
${form}
</details>
</div>`;
}

const rupees = (n) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
/** A worked example of the fee, from the same percentage the database charges. */
export function feeExample(price, percent) {
  const fee = Math.round(price * percent) / 100;
  return `<dl class="fee-example">
<div><dt>You quote</dt><dd>${rupees(price)}</dd></div>
<div><dt>Platform fee, paid by the family</dt><dd>${rupees(fee)}</dd></div>
<div><dt>The family pays</dt><dd>${rupees(price + fee)}</dd></div>
<div class="fee-example__you"><dt>You receive</dt><dd>${rupees(price)}</dd></div>
</dl>`;
}

/** This week's Commons question. community-live.js replaces the first prompt with the current one. */
export function thisWeek(prompts) {
  const p = prompts.prompts[0];
  return `<div class="this-week" data-this-week>
<p class="eyebrow">This week's question</p>
<p class="this-week__question" data-this-week-text>${e(p.text)}</p>
<p class="this-week__tag" data-this-week-tag${p.hashtag ? '' : ' hidden'}>${p.hashtag ? `#${e(p.hashtag)}` : ''}</p>
<div class="btn-row"><a class="btn btn--light" href="/app#/contribute?week=0" data-this-week-link>Answer it</a><a class="btn btn--light btn--outline" href="/questions">Read the answers</a></div>
<p class="this-week__note">A new question every Monday. Answers are read before they appear, then added to the page of the place they come from, credited the way you choose. <a href="/questions">Past questions</a>.</p>
</div>`;
}

/**
 * Labelled examples of what belongs in a feed, shown until something is published. community-live.js
 * replaces the whole empty state, examples included, with real contributions as soon as there are any.
 */
function feedExamples(examples, { words, kind, limit }) {
  const chosen = examples.filter((x) => (kind ? x.kind === kind : words ? x.kind === 'A word or saying' : x.kind !== 'A word or saying')).slice(0, Math.min(limit, 3));
  if (!chosen.length) return '';
  const place = (x) => `<a class="community-place" href="${e(x.placePath)}">${e(x.placeName)}</a>`;
  const items = chosen.map((x) => words
    ? `<article class="word-chip word-chip--example"><p class="example-tag">Example</p><p class="word-chip__word">${e(x.title)}</p>${x.script ? `<p class="word-chip__script">${e(x.script)}</p>` : ''}<p class="word-chip__meaning">${e(x.body)}</p><p class="word-chip__from">${place(x)}</p></article>`
    : `<article class="carry-card carry-card--example"><p class="example-tag">Example</p><p class="eyebrow">${e(x.kind)}</p><h3>${e(x.title)}</h3>${x.script ? `<p class="word-line"><span class="word-line__script">${e(x.script)}</span></p>` : ''}<p>${e(x.body)}</p><p class="carry-card__credit">${place(x)}</p></article>`);
  return `<div class="community-examples"><p class="community-examples__note">Examples of what belongs here, written by The Cultured Human, not shared by families. They make way for real contributions as they're published.</p><div class="${words ? 'word-wall' : 'carry-grid'}">${items.join('')}</div></div>`;
}

/** What families have shared and moderators have published, read live by community-live.js. */
export function communityFeed({ site, limit = 6, kind, style = 'cards', place, examples = [] }) {
  const words = style === 'words';
  const empty = words
    ? '<p><strong>The first words will appear here.</strong> Add a word from your family that has no translation, and where it comes from.</p><a class="text-link" href="/app#/contribute?kind=A%20word%20or%20saying">Add your word</a>'
    : '<p><strong>Nothing shared yet.</strong> Be the first: answer this week\'s question, or add something to your place.</p><a class="text-link" href="/app#/contribute">Add to a place</a>';
  const backend = backendAttrs(site);
  return `<div class="community-feed community-feed--${words ? 'words' : 'cards'}" data-community-feed data-limit="${limit}"${kind ? ` data-kind="${e(kind)}"` : ''}${place ? ` data-place="${e(place)}"` : ''}${backend}>
<div class="empty-state">${empty}</div>
${place ? '' : feedExamples(examples, { words, kind, limit })}</div>`;
}

/** "N things shared by families from M places", filled in by community-live.js only once there is at least one. */
export function communityCount(site) {
  return `<p class="community-count" data-community-count${backendAttrs(site)} hidden></p>`;
}

/** One contribution, large, with sharing; filled in by community-live.js from ?id=. */
export function sharedContribution(site) {
  return `<div class="shared-item" data-shared${backendAttrs(site)}>
<div class="shared-missing" data-shared-empty><p class="eyebrow">Shared on The Cultured Human</p><h1>Looking for it…</h1><p>If nothing appears, it may have been changed, or removed by the person who shared it.</p><a class="btn" href="/manch">Go to The Commons</a></div>
</div>`;
}

/** Every week's question so far, newest first, with its published answers; filled in by community-live.js. */
export function questionArchive(site) {
  return `<div class="question-archive" data-question-archive${backendAttrs(site)}>
<div class="empty-state"><p><strong>The questions are loading.</strong> A new one arrives every Monday.</p><a class="text-link" href="/manch#this-week">This week's question</a></div>
</div>`;
}

export function placesIndexMain({ site, map, cards, form }) {
  return `<section class="page-hero">
<div class="container">
<p class="eyebrow">Places</p>
<h1>Every family comes <em>from a place.</em></h1>
<p class="lede">Each place here is a page that grows as families add to it: the words, dishes, rituals and memories they carry. Find yours, or add it.</p>
<div class="btn-row"><a class="btn" href="/trace">Trace your roots</a><a class="btn btn--ghost" href="#contribute">Add a place</a></div>
</div>
</section>
<div class="editorial-content">
<section class="places-overview">
${map}
<div>
<div class="section-head"><p class="eyebrow">The first places</p><h2>Start where your family began.</h2><p>These pages begin with what our sourced stories already tell. Everything after that comes from families.</p></div>
${cards}
</div>
</section>
<div class="section-gap"></div>
<section aria-labelledby="latest-title">
<div class="section-head"><p class="eyebrow">Latest from families</p><h2 id="latest-title">Added this week, and before.</h2><p>Everything here was read by a person before it appeared. This week's question is on <a href="/manch#this-week">The Commons</a>.</p></div>
${communityFeed({ site, limit: 6 })}
</section>
<div class="section-gap"></div>
<section class="enquiry-section" id="contribute" aria-labelledby="contribute-title">
<div><p class="eyebrow">Your place is not here?</p><h2 id="contribute-title">Add it.</h2><p>Tell us the town or village, and one thing your family carries from it. When a place has a few contributions, it gets its own page.</p></div>
${contributeBox(site, '', form)}
</section>
</div>`;
}

export function placeMain({ site, place, hero, carries, people, form }) {
  const carry = (c) => {
    const from = c.storyInfo
      ? `<a class="text-link" href="${c.storyInfo.path}">From the story: ${e(c.storyInfo.title)}</a>`
      : c.imageInfo
        ? creditLine(c.imageInfo)
        : '';
    return `<article class="carry-card">${c.imageInfo ? `<div class="carry-card__media">${picture(c.imageInfo, { sizes: '(max-width: 700px) 100vw, 360px' })}</div>` : ''}<p class="eyebrow">${e(c.kind)}</p><h3>${e(c.title)}</h3><p>${e(c.text)}</p>${from}</article>`;
  };
  const shared = place.contributions.length
    ? `<div class="carry-grid">${place.contributions.map((c) => `<article class="carry-card carry-card--shared"><p class="eyebrow">${e(c.kind)}</p><h3>${e(c.title)}</h3><p>${e(c.text)}</p><p class="carry-card__credit">Shared by ${e(c.credit)}</p></article>`).join('')}</div>`
    : `<div class="empty-state"><p><strong>Nothing shared yet.</strong> Be the first family from ${e(place.name)} to add a word, a dish or a memory.</p><a class="text-link" href="#contribute">Add to ${e(place.name)}</a></div>`;
  const listed = people.length
    ? `<div class="person-grid">${people.map(personCard).join('')}</div>`
    : `<div class="empty-state"><p><strong>No makers, hosts or storytellers from ${e(place.name)} are listed yet.</strong> If you make, guide or record here, you could be the first.</p><a class="text-link" href="/app#/offer">List yourself</a></div>`;
  return `<section class="page-hero">
<div class="container">
<p class="eyebrow"><a class="eyebrow--plain" href="/places/">Places</a> · ${e(place.region)}</p>
<h1>${e(place.name)}</h1>
<p class="lede">${e(place.intro)}</p>
<div class="btn-row"><a class="btn" href="#contribute">Add to ${e(place.name)}</a><a class="btn btn--ghost" href="/trace">Trace your roots</a></div>
</div>
</section>
${hero ? `<figure class="place-hero container">${picture(hero, { eager: true, sizes: '(max-width: 1140px) 100vw, 1100px' })}<figcaption class="credit">${e(hero.subject)}. ${creditLine(hero).replace(/^<span class="credit">|<\/span>$/g, '')}</figcaption></figure>` : ''}
<div class="editorial-content">
${carries.length ? `<div class="section-head"><p class="eyebrow">What families from here carry</p><h2>A beginning, from our stories.</h2></div>
<div class="carry-grid">${carries.map(carry).join('')}</div>
<div class="section-gap"></div>` : ''}
<div class="section-head"><p class="eyebrow">Shared by families</p><h2>In their own words.</h2>${place.startedBy === 'families' ? `<p>This page was started because families from ${e(place.name)} shared what they carry. Know a source, a photograph you have the rights to, or something we should add? <a href="#contribute">Tell us</a>.</p>` : ''}</div>
<div class="community-feed" data-community-feed data-limit="100" data-place="${e(place.slug)}"${site.backend && site.backend.url ? ` data-url="${e(site.backend.url)}" data-key="${e(site.backend.anonKey)}"` : ''}>
${shared}
</div>
<div class="section-gap"></div>
<div class="section-head"><p class="eyebrow">People on the platform</p><h2>Makers, hosts and storytellers from ${e(place.name)}.</h2></div>
<div class="directory" data-listings data-place="${e(place.slug)}"${backendAttrs(site)}>${listed}</div>
<div class="section-gap"></div>
<section class="enquiry-section" id="contribute" aria-labelledby="contribute-title">
<div><p class="eyebrow">Add to ${e(place.name)}</p><h2 id="contribute-title">What does your family carry from here?</h2><p>A word with no translation, a dish, a festival as your grandparents kept it, a song, a street that has changed. Everything is read before it appears, and credited the way you choose.</p></div>
${contributeBox(site, place.slug, form)}
</section>
</div>`;
}
