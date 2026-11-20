// Link previews for /s/<id>: WhatsApp, LinkedIn and others read the page without running scripts,
// so the function behind /s/<id> (api/shared.mjs) fills in the title, description and picture of
// the contribution before sending public/shared.html. Only published contributions are read, with
// the public key, so nothing here can reveal anything the site doesn't already show.
import { escapeHtml as e } from '../../tools/lib/markdown.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchShared({ url, key, id, fetch }) {
  if (!UUID.test(String(id || '')) || !url || !key) return null;
  const res = await fetch(`${url}/rest/v1/place_contributions?select=id,kind,title,body,credit,place_slug,suggested_place,script&status=eq.published&id=eq.${id}`, {
    headers: { apikey: key, ...(/^eyJ/.test(key) ? { authorization: `Bearer ${key}` } : {}) },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

function short(text, max) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
}

/** What the preview says: "Thakuma (ঠাকুমা)", "A word or saying from Bengal, shared by Asha: …". */
export function previewFor(c, place, siteName) {
  const placeName = place ? place.name : c.suggested_place || '';
  const title = `${c.title}${c.script ? ` (${c.script})` : ''} — ${siteName}`;
  const description = short(`${c.kind}${placeName ? ` from ${placeName}` : ''}, shared by ${c.credit}: ${c.body}`, 200);
  return { title, description };
}

function setMeta(html, attr, name, value) {
  const re = new RegExp(`<meta ${attr}="${name}" content="[^"]*">`);
  const tag = `<meta ${attr}="${name}" content="${e(value)}">`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `${tag}\n</head>`);
}

/** public/shared.html with this contribution's preview, address and id filled in. */
export function renderShared(html, { contribution, place, origin, siteName }) {
  const url = `${origin}/s/${contribution.id}`;
  const { title, description } = previewFor(contribution, place, siteName);
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${e(title)}</title>`);
  out = setMeta(out, 'name', 'description', description);
  out = setMeta(out, 'property', 'og:title', title);
  out = setMeta(out, 'property', 'og:description', description);
  out = setMeta(out, 'property', 'og:url', url);
  out = setMeta(out, 'property', 'og:type', 'article');
  if (place && place.image) {
    out = setMeta(out, 'property', 'og:image', origin + place.image);
    out = setMeta(out, 'property', 'og:image:alt', place.imageAlt || place.name);
  }
  out = out.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${e(url)}">`);
  return out.replace('</head>', `<meta name="tch-shared-id" content="${e(contribution.id)}">\n</head>`);
}
