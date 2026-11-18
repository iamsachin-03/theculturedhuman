import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontMatter, renderMarkdown, inline, escapeHtml } from '../tools/lib/markdown.mjs';

const hooks = { figure: (id, caption, wide) => `<figure data-id="${id}" data-wide="${wide}">${caption}</figure>` };

test('front matter reads scalars, colons in values and inline lists', () => {
  const { data, body } = parseFrontMatter('---\ntitle: A: story\nrelated: [a, b]\n---\nHello');
  assert.equal(data.title, 'A: story');
  assert.deepEqual(data.related, ['a', 'b']);
  assert.equal(body, 'Hello');
});

test('missing front matter is an error', () => {
  assert.throws(() => parseFrontMatter('no front matter'), /front matter/);
});

test('raw HTML is escaped, never rendered', () => {
  assert.equal(inline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml(`"'&`), '&quot;&#39;&amp;');
});

test('inline formatting, links and footnotes', () => {
  const ctx = { footnotes: new Set(), links: [] };
  const html = inline('**bold** and *italic* with [a link](https://example.com)[^2]', ctx);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<a href="https:\/\/example.com" rel="noopener">a link<\/a>/);
  assert.match(html, /href="#source-2"/);
  assert.deepEqual([...ctx.footnotes], [2]);
});

test('blocks: headings, lists, quotes with citations, dividers, figures and callouts', () => {
  const md = [
    '## A heading',
    '',
    'A paragraph',
    'over two lines.',
    '',
    '- one',
    '- two',
    '',
    '> Quoted words.',
    '> — Someone',
    '',
    '---',
    '',
    '{{figure some-image "A caption" wide}}',
    '',
    ':::note Title',
    'Inside the note.',
    ':::',
  ].join('\n');
  const { html } = renderMarkdown(md, hooks);
  assert.match(html, /<h2 id="a-heading">A heading<\/h2>/);
  assert.match(html, /<p>A paragraph over two lines.<\/p>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<blockquote><p>Quoted words.<\/p><cite>— Someone<\/cite><\/blockquote>/);
  assert.match(html, /<hr>/);
  assert.match(html, /<figure data-id="some-image" data-wide="true">A caption<\/figure>/);
  assert.match(html, /<aside class="callout"><strong>Title<\/strong><p>Inside the note.<\/p><\/aside>/);
});
