#!/usr/bin/env node
// Downloads an image from Wikimedia Commons (1600px and 800px wide) into public/assets/
// and records its licence and attribution in public/assets/register.json.
//
// Usage:
//   node tools/add-commons-asset.mjs "File:Chand Baori, Abaneri.jpg" \
//     --id chand-baori --dir architecture --alt "..." \
//     [--subject "..."] [--region "..."] [--art-form "..."]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = path.join(ROOT, 'public/assets/register.json');
const USER_AGENT = 'TheCulturedHuman/1.0 (https://github.com/iamsachin-03/theculturedhuman)';
const WIDTHS = [1600, 800];
const FREE_LICENCE = /^(CC0|CC BY(-SA)? [\d.]+|Public domain|PD)/i;

function parseArgs(argv) {
  const [title, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith('--')) throw new Error(`Unexpected argument: ${rest[i]}`);
    opts[rest[i].slice(2)] = rest[i + 1];
  }
  for (const required of ['id', 'dir', 'alt']) {
    if (!opts[required]) throw new Error(`Missing --${required}`);
  }
  if (!title || !title.startsWith('File:')) throw new Error('First argument must be a Commons title like "File:Example.jpg"');
  return { title, ...opts };
}

const clean = (html = '') =>
  html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, ' ').trim();

async function imageInfo(title, width) {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', titles: title, prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime', iiurlwidth: String(width),
  });
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Commons API returned ${res.status}`);
  const page = Object.values((await res.json()).query.pages)[0];
  if (!page.imageinfo) throw new Error(`No such file on Commons: ${title}`);
  return page.imageinfo[0];
}

async function download(url, dest) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) {
      await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return;
    }
    if (res.status !== 429 || attempt === 4) throw new Error(`Download failed (${res.status}): ${url}`);
    await new Promise((r) => setTimeout(r, attempt * 5000));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const register = JSON.parse(await fs.readFile(REGISTER, 'utf8').catch(() => '[]'));
  if (register.some((a) => a.id === args.id)) throw new Error(`Asset id "${args.id}" already exists in the register`);

  const dir = path.join(ROOT, 'public/assets', args.dir);
  await fs.mkdir(dir, { recursive: true });

  const files = {};
  let meta;
  let size;
  for (const width of WIDTHS) {
    const info = await imageInfo(args.title, width);
    meta ??= info.extmetadata;
    const ext = info.mime === 'image/png' ? 'png' : 'jpg';
    const rel = `/assets/${args.dir}/${args.id}-${width}.${ext}`;
    await download(info.thumburl || info.url, path.join(ROOT, 'public', rel));
    files[width] = rel;
    size ??= { width: info.thumbwidth || info.width, height: info.thumbheight || info.height };
  }

  const licence = clean(meta.LicenseShortName?.value) || 'Unknown';
  if (!FREE_LICENCE.test(licence)) {
    console.warn(`WARNING: "${licence}" is not a recognised free licence. Review before publishing.`);
  }
  const creator = (clean(meta.Artist?.value) || 'Unknown').replace(/^(.+?)\1$/, '$1');
  const entry = {
    id: args.id,
    files,
    width: size.width,
    height: size.height,
    subject: args.subject || clean(meta.ObjectName?.value) || args.title.replace(/^File:|\.\w+$/g, ''),
    region: args.region || '',
    artForm: args['art-form'] || '',
    creator,
    source: 'Wikimedia Commons',
    sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(args.title.replace(/ /g, '_'))}`,
    licence,
    licenceUrl: meta.LicenseUrl?.value || '',
    attribution: `${creator} / Wikimedia Commons, ${licence}`,
    alt: args.alt,
    usage: /^(CC0|Public domain|PD)/i.test(licence) ? 'Free to use; credit given as courtesy' : 'Free to use with attribution under the stated licence',
    addedAt: new Date().toISOString().slice(0, 10),
  };
  register.push(entry);
  register.sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(REGISTER, JSON.stringify(register, null, 2) + '\n');
  console.log(`Added ${entry.id}: ${entry.attribution}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
