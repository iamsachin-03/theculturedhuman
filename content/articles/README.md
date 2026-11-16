# Writing a journal article

Each `.md` file in this folder becomes a page at `/journal/<file-name>.html`. Run `npm run build` to publish it locally, then commit both the Markdown file and the generated page.

## Front matter

```yaml
---
title: From wedding walls to the world: the story of Madhubani painting
description: One or two sentences for search engines and link previews (about 150 characters).
dek: The italic standfirst under the headline.
pillar: culture            # culture, wisdom, food-travel, conscious-living, better-self or curious-minds
series: Living Heritage    # optional
author: The Cultured Human editors
date: 2026-11-16           # YYYY-MM-DD
updated: 2026-12-01        # optional
heroImage: madhubani-kohbar-arti-kumari   # an id from public/assets/register.json
heroCaption: A kohbar painting by Arti Kumari
related: [regional-food-cultures, indian-philosophical-traditions]   # optional, other file names
draft: true                # optional; drafts are not published
---
```

## Body

- `## Heading` and `### Subheading`
- Paragraphs, `**bold**`, `*italic*`, `[links](https://…)` and `- lists`
- Quotes: lines starting with `> `. A final line starting with `> — ` becomes the citation.
- `---` on its own line draws the ornamental divider.
- Images: `{{figure asset-id "Caption"}}`, or add `wide` after the caption. The alt text and photo credit come from the image register automatically.
- Callouts: `:::note Title`, then the text, then `:::` on its own line.
- Citations: write `[^1]` in the text and add a numbered list under a final `## Sources` heading. The build fails if a citation has no source or a source is never cited.

## Rules we keep

- Never invent a fact or a quotation. Every claim that is not common knowledge needs a source.
- Only quote someone if you can cite where the quotation appears.
- Use only images that are in `public/assets/register.json`, with their creator and licence. Add new ones with `node tools/add-commons-asset.mjs`.
