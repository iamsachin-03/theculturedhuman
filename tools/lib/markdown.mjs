// A deliberately small Markdown dialect for editorial articles. Raw HTML is escaped,
// so articles cannot break the page layout or inject scripts.
//
// Blocks:  ## / ### headings, paragraphs, - lists, 1. lists, > quotes (a last line
//          starting with "— " becomes the citation), --- dividers,
//          {{figure asset-id "Caption" wide}}, and :::note Title … ::: callouts.
// Inline:  **bold**, *italic*, `code`, [text](url), footnotes [^3] → source 3.

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function parseFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error('Missing front matter (--- block at the top of the file)');
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!kv) throw new Error(`Cannot read front matter line: "${line}"`);
    data[kv[1]] = parseValue(kv[2].trim());
  }
  return { data, body: m[2] };
}

function parseValue(v) {
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
  }
  return unquote(v);
}

function unquote(v) {
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v;
}

export function inline(text, ctx = {}) {
  let s = escapeHtml(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/\[\^(\d+)\]/g, (_, n) => {
    ctx.footnotes?.add(Number(n));
    return `<sup><a href="#source-${n}" aria-label="Source ${n}">${n}</a></sup>`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const external = /^https?:\/\//.test(href);
    ctx.links?.push(href);
    return `<a href="${href}"${external ? ' rel="noopener"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  return s;
}

/**
 * @param {string} md
 * @param {{ figure: (id: string, caption: string, wide: boolean) => string }} hooks
 */
export function renderMarkdown(md, hooks) {
  const ctx = { footnotes: new Set(), links: [] };
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isBlockStart = (l) =>
    /^(#{2,3} |> |- |\d+\. |---\s*$|:::|\{\{figure )/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{2,3}) (.+)$/);
    if (h) {
      const level = h[1].length;
      const id = h[2].toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
      out.push(`<h${level} id="${id}">${inline(h[2], ctx)}</h${level}>`);
      i++;
      continue;
    }

    if (/^---\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    const fig = line.match(/^\{\{figure\s+([\w-]+)\s+"([^"]*)"(\s+wide)?\s*\}\}$/);
    if (fig) {
      out.push(hooks.figure(fig[1], inline(fig[2], ctx), Boolean(fig[3])));
      i++;
      continue;
    }

    const callout = line.match(/^:::note\s*(.*)$/);
    if (callout) {
      const inner = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') inner.push(lines[i++]);
      i++;
      const body = renderMarkdown(inner.join('\n'), hooks);
      body.footnotes.forEach((n) => ctx.footnotes.add(n));
      ctx.links.push(...body.links);
      const title = callout[1] ? `<strong>${inline(callout[1], ctx)}</strong>` : '';
      out.push(`<aside class="callout">${title}${body.html}</aside>`);
      continue;
    }

    if (line.startsWith('> ')) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      let cite = '';
      if (/^— /.test(quote[quote.length - 1] || '')) cite = `<cite>${inline(quote.pop(), ctx)}</cite>`;
      const paras = quote.join('\n').split(/\n\s*\n/).map((p) => `<p>${inline(p.replace(/\n/g, ' '), ctx)}</p>`);
      out.push(`<blockquote>${paras.join('')}${cite}</blockquote>`);
      continue;
    }

    const listMatch = line.match(/^(- |\d+\. )/);
    if (listMatch) {
      const ordered = listMatch[1] !== '- ';
      const items = [];
      const re = ordered ? /^\d+\. / : /^- /;
      while (i < lines.length && re.test(lines[i])) {
        let item = lines[i++].replace(re, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item, ctx)}</li>`);
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '), ctx)}</p>`);
  }

  return { html: out.join('\n'), footnotes: ctx.footnotes, links: ctx.links };
}

export function wordCount(md) {
  return md.replace(/\{\{[^}]+\}\}/g, '').split(/\s+/).filter((w) => /\w/.test(w)).length;
}
