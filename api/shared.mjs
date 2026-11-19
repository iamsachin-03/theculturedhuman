// GET /s/<id> (rewritten here by vercel.json): the contribution's page, with a link preview of its own.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchShared, renderShared } from '../backend/share/preview.mjs';

const read = (path) => readFile(join(process.cwd(), path), 'utf8');

export async function GET(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || (url.pathname.match(/^\/s\/([^/]+)$/) || [])[1];
  const [html, siteJson, placesJson] = await Promise.all([read('public/shared.html'), read('content/site.json'), read('public/places/places.json')]);
  const site = JSON.parse(siteJson);
  const backend = site.backend || {};
  let contribution = null;
  try {
    contribution = await fetchShared({ url: process.env.SUPABASE_URL || backend.url, key: process.env.SUPABASE_ANON_KEY || backend.anonKey, id, fetch });
  } catch (err) {
    console.error(err);
  }
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400' };
  if (!contribution) return new Response(html, { status: 404, headers });
  const place = JSON.parse(placesJson).find((p) => p.slug === contribution.place_slug);
  return new Response(renderShared(html, { contribution, place, origin: url.origin, siteName: site.name }), { headers });
}
