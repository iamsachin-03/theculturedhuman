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
    page.jsonLd && `<script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n');
}

function isActive(href, path) {
  if (href === '/') return path === '/' || path === '/index.html';
  if (href.endsWith('/')) return path.startsWith(href);
  return path === href;
}

export function headerBlock({ site, page }) {
  const links = site.nav
    .map((n) => `<li><a href="${n.href}"${isActive(n.href, page.path) ? ' aria-current="page"' : ''}>${e(n.label)}</a></li>`)
    .join('');
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
<div class="site-header__inner">
<a class="wordmark" href="/" aria-label="${e(site.name)} — home">${logo(44)}<span>${e(site.name)}</span></a>
<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-nav"><svg class="icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg><svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg><span class="menu-toggle__label">Menu</span></button>
<nav class="primary-nav" id="primary-nav" aria-label="Main"><ul>${links}</ul></nav>
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
<div class="container site-footer__bottom"><span>© ${new Date().getFullYear()} ${e(site.name)}. Rooted in India, curious about everywhere.</span><span>Images are credited on our <a href="/credits.html">image credits</a> page.</span></div>
</footer>
<script src="/scripts/site.js" defer></script>`;
}

export function picture(asset, { sizes = '100vw', className = '', eager = false, alt } = {}) {
  return `<img src="${asset.files[1600]}" srcset="${asset.files[800]} 800w, ${asset.files[1600]} 1600w" sizes="${sizes}" width="${asset.width}" height="${asset.height}" alt="${e(alt ?? asset.alt)}"${className ? ` class="${className}"` : ''}${eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}>`;
}

export function creditLine(asset) {
  return `<span class="credit">Photo: <a href="${e(asset.sourceUrl)}" rel="noopener">${e(asset.creator)}</a>, ${e(asset.licence)}${asset.licenceUrl ? ` (<a href="${e(asset.licenceUrl)}" rel="noopener">licence</a>)` : ''}</span>`;
}

export function figure(asset, captionHtml, wide) {
  return `<figure${wide ? ' class="wide"' : ''}>${picture(asset, { sizes: wide ? '(max-width: 1040px) 100vw, 1000px' : '(max-width: 760px) 100vw, 700px' })}<figcaption>${captionHtml}${creditLine(asset)}</figcaption></figure>`;
}

export function storyCard(article, asset, pillarLabel) {
  return `<a class="story-card" href="${article.path}"><div class="story-card__media">${picture(asset, { sizes: '(max-width: 700px) 100vw, 400px' })}</div><span class="eyebrow">${e(pillarLabel)}</span><h3>${e(article.title)}</h3><p>${e(article.description)}</p></a>`;
}

export function quiz(questions) {
  return `<div class="quiz" data-quiz>
<script type="application/json">${JSON.stringify(questions).replace(/</g, '\\u003c')}</script>
<p class="quiz__progress" aria-live="polite"></p>
<h3 class="quiz__question">Six questions on India's arts, food and ideas</h3>
<ul class="quiz__options"></ul>
<p class="quiz__feedback" aria-live="polite"></p>
<div class="quiz__actions"><button class="btn quiz__next" type="button" hidden>Next question</button></div>
<noscript><p>This quiz needs JavaScript. You can still explore every story in <a href="/journal/">the journal</a>.</p></noscript>
</div>`;
}

export function offerCard(offer, asset) {
  return `<a class="offer-card" href="${offer.href}"><div class="offer-card__media">${picture(asset, { sizes: '(max-width: 700px) 100vw, 360px', alt: '' })}</div><div class="offer-card__body"><span class="eyebrow">${e(offer.label)}</span><h3>${e(offer.title)}</h3><p>${e(offer.summary)}</p><span class="offer-card__action">${e(offer.action)}</span></div></a>`;
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
export function enquiryForm(site, offer) {
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
<div class="enquiry__grid">
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
 * @param {{ site: any, page: { path: string, title: string, description: string, type?: string, jsonLd?: object, noindex?: boolean, script?: string }, image?: any, main: string }} args
 */
export function layout({ site, page, image, main }) {
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(page.title)}</title>
<meta name="description" content="${e(page.description)}">
${page.noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}${headBlock({ site, page, image })}
</head>
<body>
${headerBlock({ site, page })}
<main id="main">
${main.trim()}
</main>
${footerBlock({ site })}
${page.script ? `<script src="/scripts/${page.script}.js" defer></script>
` : ''}</body>
</html>
`;
}

export function articleMain({ site, article, hero, bodyHtml, sourcesHtml, related, offers = '' }) {
  const pillar = site.pillars[article.pillar];
  const main = `<article>
<header class="article-header container">
<a class="eyebrow eyebrow--plain" href="${pillar.href}">${e(article.series ? `${article.series} · ${pillar.label}` : pillar.label)}</a>
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
</section>`;
}

export function creditsMain({ assets }) {
  const items = assets
    .map((a) => `<li><img src="${a.files[800]}" alt="" width="96" height="72" loading="lazy" decoding="async"><div><strong>${e(a.subject)}</strong>${a.region ? ` · ${e(a.region)}` : ''}<br>${e(a.creator)} · <a href="${e(a.sourceUrl)}" rel="noopener">${e(a.source)}</a> · ${a.licenceUrl ? `<a href="${e(a.licenceUrl)}" rel="noopener">${e(a.licence)}</a>` : e(a.licence)}</div></li>`)
    .join('\n');
  return `<section class="page-hero">
<div class="container">
<p class="eyebrow">Image credits</p>
<h1>The people behind <em>the pictures.</em></h1>
<p class="lede">Every image on The Cultured Human is credited to its creator and used under the licence shown. If you are a creator and something here is wrong, please tell us.</p>
</div>
</section>
<section class="section">
<div class="container--narrow">
<ul class="credits-list">
${items}
</ul>
</div>
</section>`;
}
