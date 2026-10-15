# Template Taxonomy (v1)

A tree-view inspiration explorer for **design.com Instagram post templates** (no-logo templates only).
Search by style, layout, color, imagery and content; the results grow into a color-coded mind map.
Click any design to see similar designs (colors, layout, style, overall), save designs to boards,
or drop an image to find templates with a similar palette.

Stack: Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · shadcn/ui (Base UI) · React Flow (`@xyflow/react`) ·
MiniSearch · Zod · Vitest. No database and no auth in v1.

## Setup

Requires Node.js 20+ and pnpm (or npm).

```bash
pnpm install        # or: npm install
pnpm dev            # http://localhost:3000
pnpm build && pnpm start   # production build + server
```

Quality checks:

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest: query parsing, similarity, colour maths, dataset sanity
pnpm e2e            # headless Chrome smoke flow + screenshots (server must be running)
```

`pnpm e2e` uses `playwright-core` with an installed Chrome. Override with env vars:
`BASE_URL=http://localhost:3000 CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe" SCREENSHOT_DIR=./screenshots SAMPLE_IMAGE=./some.jpg pnpm e2e`.

Works the same on Windows, macOS and Linux (no machine-specific paths).

### Optional: LLM query understanding

The vocabulary parser reads words literally, so vague phrasing ("make it pop", "cosy coffee
shop vibes") falls through to plain keyword matching. With a key configured, the app also asks
an LLM to translate those left-over words into the *same* facet vocabulary, and shows the result
as removable **AI** chips with a one-line reason.

Copy `.env.example` to `.env.local` and point it at any OpenAI-compatible endpoint:
OpenAI, OpenRouter, Groq, DeepSeek, or a local Ollama (`http://localhost:11434/v1`) / LM Studio.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | Endpoint, no trailing slash |
| `LLM_API_KEY` | *(empty)* | Leave empty to keep the feature off |
| `LLM_MODEL` | `gpt-4o-mini` | A small, fast model is plenty |

Without a key nothing changes — `/api/interpret` reports `disabled` and the app behaves exactly
as before. The key stays server-side; the browser only ever calls `/api/interpret`.

## Using the app

- **Search box** (`/` to focus). Words that match the vocabulary become chips automatically:
  `construction bold design` → *Industry: Construction*, *Style: Bold*. Remaining words are fuzzy-searched
  (weighted) across titles, tags, hashtags, description, template text, industry/topic and every
  style/layout/typography/imagery/element value. Autocomplete suggests real vocabulary and tags.
  When the vocabulary cannot explain some of the words, the LLM reads them and adds removable
  **AI** chips with a one-line reason. It only runs when the deterministic parse came up short,
  so ordinary searches stay instant; results are debounced, abortable and cached per query.
- **Quick filters**: Style, Color (swatches, hex, color names, *Background only* vs *Any of the 3 colors*,
  matched by OKLab distance), Layout (with diagrams), Image (photo / illustration / no image, placement, frame shape).
  **More filters** drawer: Industry & topic, Content type, Mood, Typography, Graphic elements, Contains, Tags.
  Every option shows its result count; options with 0 results are greyed out.
- **Tree**: root (your query) → Industry (or Topic when only one industry matches) → layout structure → thumbnails.
  Click a branch to zoom in and fade the rest; the path panel (top-left) shows where you are and offers
  **Search within** (turns the branch into filters). `+N` tiles also search within that group.
  **Shuffle** randomises the order so you see different designs.
- **Similar view**: click a design to center it with four branches (Similar colors / layout / style / Overall match),
  each with a short reason. Toggle **In ‹Industry›** vs **All categories**. Click any thumbnail to re-center;
  the breadcrumb lets you step back.
- **Details panel**: big preview, colors (click to copy hex), layout, typography, imagery, copy ideas, tags.
  Every label is clickable and adds a filter. *Open on design.com* and *Save*.
- **Boards**: *Save* quick-saves to "Saved"; the chevron (or press-and-hold on Save) opens the board picker with
  **+ New board**. A design can be in several boards. **Boards** (top bar) lists boards; opening one shows it
  as a tree grouped by layout or by style.
- **Image search**: click the image button in the search box, or drop an image anywhere. Three dominant colors are
  extracted in the browser (k-means in OKLab on a 72×72 canvas, background = largest cluster) and templates are
  ranked by palette similarity. Nothing is uploaded.
- **Shareable URLs**: the query, filters, colour filter, open design trail, board, scope and shuffle are kept in
  the address bar (`?q=retro+serif&industry=Construction&design=<id>`), so Back/Forward step through searches and
  designs, and links can be bookmarked or shared. A typing run is one history entry. Uploaded images stay local.
- Light/dark toggle in the top bar. `Esc` closes panels.

## Data

All template data comes from **`data/templates.json`** (an array of records). It is validated **at build time**
by `scripts/build-data.ts` (`pnpm data`, run automatically before `pnpm dev` and `pnpm build`) with the Zod schema in
`src/lib/schema.ts`. Invalid records are skipped with a warning. The script writes a minified, content-hashed copy to
`public/data/templates.<hash>.json` (plus `manifest.json`), swapping the 600px thumbnails for the 200px rendering.
The browser downloads that file once (preloaded from the page head, compressed, cached for a year) and the text-search
index is built in a Web Worker (`src/lib/search.worker.ts`), so neither the dataset nor Zod ship in the JS bundle.

Record shape (see `../schema.md` for the full spec and controlled vocabularies):

```jsonc
{
  "templateId": "uuid", "slug": "simple-success-quote-1397283", "category": "Instagram Post",
  "industry": "Personal Development", "topic": "Motivation",
  "name": "Simple Success Quote", "displayTitle": "…", "url": "https://www.design.com/…/details",
  "tags": ["quote"], "hashtags": ["#quote"], "description": "…",
  "colors": [{ "hex": "#F8F5F2", "role": "background", "name": "off-white" }, { "role": "primary", … }, { "role": "accent", … }],
  "style": { "aesthetic": ["minimalist"], "mood": ["calm"], "colorScheme": ["warm"], "texture": "flat", "era": null },
  "typography": { "headline": "…", "accent": null, "body": "…", "fontStyles": ["sans serif"], "case": "mixed", "effects": [] },
  "layout": { "structure": "centered text block", "alignment": "center", "focalPoint": "…", "balance": "symmetrical",
              "whitespace": "airy", "textDensity": "medium", "hierarchy": ["…"] },
  "imagery": { "type": "none", "illustrationStyle": null, "subject": null, "placement": null, "frameShape": null, "count": 0 },
  "elements": ["large faded quotation marks"],
  "content": { "type": "quote", "headline": "…", "subheadline": null, "body": null, "cta": null, "footer": "…",
               "offer": null, "placeholders": [] },
  "previewImage": "https://dynamic.design.com/template/preview/design/<guid>?…",
  "thumbnailImage": "https://dynamic.design.com/template/preview/design/<guid>?…"
}
```

Only templates **without a logo** belong in the file (preview URL has a single GUID; logo templates have a second
GUID and `logoTemplateVersion`). Images load directly from `dynamic.design.com`.

### Replacing the dataset

1. Overwrite `data/templates.json` with the new array (same schema).
2. Run `pnpm test` — `src/lib/data.test.ts` checks it parses, has no logo templates, and prints any
   out-of-vocabulary values (those still work as filters, they just appear as extra options).
3. `pnpm build` (runs `pnpm data` first). Filters, autocomplete and chip detection are generated from the data, so new industries,
   topics, tags and elements appear automatically. Categories in the top bar come from `category`.

`tests/fixtures/templates.fixture.json` is a small fixed set used by the unit tests so they don't depend on the dataset.

## Deployment notes

- `NEXT_PUBLIC_SITE_URL` sets the canonical URL used for Open Graph/Twitter metadata, `robots.txt` and
  `sitemap.xml` (defaults to `https://brandcrowd-visual-search.vercel.app`).
- Security headers (CSP, `frame-ancestors 'none'`, Referrer-Policy, nosniff, Permissions-Policy, HSTS) are
  defined in `src/lib/security-headers.ts` and applied from `next.config.ts`. If template images move
  to another host, add it to `img-src` there.

## Code map

| Path | What |
| --- | --- |
| `src/lib/schema.ts` | Zod schema, controlled vocabularies, `parseTemplates` |
| `scripts/build-data.ts` | Build-time validation + hashed static dataset in `public/data/` |
| `src/lib/data.ts` | `TemplateRepository` interface + static JSON implementation (fetched in the browser) |
| `src/lib/search-client.ts`, `search.worker.ts` | Text index in a Web Worker, with a main-thread fallback |
| `src/lib/facets.ts` | Facet registry, filter state, filtering, option counts |
| `src/lib/query.ts` | Query → chips parsing, synonyms, autocomplete |
| `src/lib/llm.ts` | LLM interpreter: allowed-vocabulary payload, prompt, response sanitising |
| `src/lib/llm-client.ts` | Browser fetch + per-query cache for the interpreter |
| `src/app/api/interpret/route.ts` | `POST /api/interpret` — provider-agnostic OpenAI-compatible call |
| `src/lib/search.ts` | Weighted fuzzy search (MiniSearch) |
| `src/lib/similarity.ts` | Pure similarity scores (colors, layout, style, overall) |
| `src/lib/color.ts` | OKLab, deltaE, palette similarity, k-means palette extraction |
| `src/lib/tree.ts` | Mind-map layout for search/board trees and the similar view |
| `src/lib/url-state.ts` | URL <-> explorer state, history push/replace policy |
| `src/lib/boards.ts` | `BoardStore` interface + localStorage implementation |
| `src/components/explorer/*` | UI (top bar, filters, canvas, details, boards, image drop) |
| `src/components/explorer/use-ai-interpretation.ts` | Debounced, abortable, cached AI interpretation hook |

### Swappable boundaries (for v2)

- **Data**: implement `TemplateRepository` (`all`, `byId`, `categories`) against Supabase and create it in
  `src/components/explorer/explorer-loader.tsx` instead of `fetchTemplateRepository`.
- **Boards**: implement `BoardStore` (`list/create/rename/remove/add/removeItem/toggle/subscribe`) against Supabase
  tables (`boards`, `board_items`) and return it from `getBoardStore()`.

## Similarity model

- **Colors**: role-weighted OKLab distance (background 0.5, primary 0.3, accent 0.2; cross-role matches allowed with a small penalty).
- **Layout**: structure 0.32, alignment 0.14, image type 0.14, image placement 0.14, text amount 0.10, balance 0.08, whitespace 0.08.
- **Style**: Jaccard of aesthetic 0.36, mood 0.18, typography (font styles + case) 0.22, color scheme 0.16, texture 0.08.
- **Overall**: 0.30 colors + 0.30 layout + 0.32 style + 0.08 tag overlap.

## v2 plans

- Grid / masonry browsing mode next to the tree (with adjustable columns).
- Supabase: accounts, boards synced across devices, shared/team boards, share links, board sections.
- Palette export (ASE / CSS / Figma) and moodboard sharing.
- **Embeddings for image search and similarity**: compute CLIP/SigLIP image embeddings for every preview offline
  (e.g. a Python script or Supabase Edge Function), store them in `pgvector`, and query by cosine similarity.
  In the browser, either call an API route that embeds the uploaded image, or run a small model client-side
  (transformers.js). Blend embedding similarity into `overallSimilarity` and the image-search ranking.
- Automatic ingestion of new templates.
