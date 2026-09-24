# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm (use `pnpm`, never `npm`/`yarn`)
- **Framework**: SvelteKit (Svelte 5 runes) + `adapter-vercel`, deployed prerendered
- **Content**: mdsvex (Markdown → Svelte) with Shiki highlighting

## Commands

```bash
pnpm dev                     # dev server
pnpm build                   # production build (prerenders all routes — use to catch mdsvex/content errors)
pnpm preview                 # serve the production build
pnpm check                   # svelte-kit sync + svelte-check (type/a11y check; reports COMPLETED N ERRORS M WARNINGS)
pnpm lint                    # prettier --check + eslint
pnpm format                  # prettier --write

pnpm test                    # unit (vitest) then e2e (playwright)
pnpm test:unit               # vitest only
pnpm vitest run <path>       # run a single test file
node scripts/build-manifest.mjs   # rebuild notes manifest after adding/editing note content (see below)
```

**There are currently no tests and no `e2e/` directory**, so `pnpm test` fails on "no test files found" — that is the standing state, not a regression you introduced. The real gates are **`pnpm check`** (expect `0 ERRORS 0 WARNINGS`) and **`pnpm build`** (prerenders every route, so it catches mdsvex/content breakage). `pnpm lint` reports one pre-existing eslint error — `{@html}` in `Seo.svelte`.

If you do add tests: two vitest projects are defined in `vite.config.ts` — `client` (browser, files `*.svelte.{test,spec}.ts`) and `server` (node, other `*.{test,spec}.ts`). `expect.requireAssertions` is on, so every test must assert.

## Critical: configuration lives in vite.config.ts, not svelte.config.js

There is **no `svelte.config.js`** — this project uses the experimental `sveltekit({...})` Vite-plugin config form. All SvelteKit options (`adapter`, `preprocess`/mdsvex, `extensions`, `prerender`, `compilerOptions.experimental.async`, `experimental.remoteFunctions`) are passed inside the `sveltekit()` call in `vite.config.ts`. Editing a `svelte.config.js` will do nothing. `compilerOptions.experimental.async: true` is enabled (top-level `await` / async components are allowed).

## Content pipeline (blog + series + notes)

Markdown content lives in `src/content/blog/*.md`, `src/content/series/<series>/*.md` and `src/content/notes/<category>/*.md`. Reading/loading goes through `src/lib/content.ts`, which uses two layers:

- **`src/lib/content-manifest.json`** — a committed, metadata-only index (frontmatter for every post/part/chapter). Used for all listing/sorting/counting so the client never bundles full content. **Regenerate it with `node scripts/build-manifest.mjs` after adding/editing/removing note or series files** — it scans `src/content/notes/` and `src/content/series/`, parses frontmatter, and preserves the existing `blog` entries.
- **Lazy `import.meta.glob`** — one chunk per file, loaded on demand in `loadPost`/`loadChapter`. Do not eagerly import content; it produces a multi-MB client chunk.

Note frontmatter schema: `title, subtitle, chapter (number), level ("beginner"|"intermediate"|"advanced"|"mastery"), readingTime, topics[]`. Categories are declared in `src/lib/data/categories.ts` (`CATEGORIES` map → `label`/`description`/`group`; `GROUP_ORDER` orders the groups), with their Bangla display strings in `src/lib/data/notes-labels.ts`. A new track needs: the markdown files, a `CATEGORIES` entry (plus a `NOTES_CATEGORIES` entry), and a manifest rebuild — it then flows automatically into the notes roadmap, folders, and badges.

### Series

Multi-part writing lives under `/series`, not `/blog`. A series is a directory of markdown parts (`src/content/series/<slug>/NN-*.md`) plus one entry in `src/lib/data/series.ts` (`SERIES` → `slug`/`title`/`tagline`/`description`/`status`) and a manifest rebuild — nothing else. Parts keep the blog frontmatter shape and add `series` (display title) and `seriesPart` (the ordering key; **ordering is by `seriesPart`, never by date or filename**).

Three routes: `/series` (all series, each collapsed to a cover plus the first few parts), `/series/<slug>` (the full ordered index), `/series/<slug>/<part>` (the article — `SeriesPager` for prev/next, `SeriesNav` for the whole index below it). Series parts are **not** listed on `/blog`; each series shows there as a single aurora strip linking into `/series`. They are also excluded from `/blog/tags/*`, so a part renders its tags as plain pills rather than links.

Parts are Bangla prose, so the article sets `lang="bn"` like a notes chapter; the surrounding chrome (`/series`, the landing header, the pager) stays English.

Moving a post into a series changes its URL, so add the old slug to `MOVED_POSTS` in `series.ts` — `/blog/[slug]` builds those as 308 redirects (prerendered, same mechanism as the `/bn/*` ones). RSS carries posts and series parts in one date-sorted feed.

A part still in progress carries `draft: true`; drafts are filtered out of every listing and out of `entries()`, so they never prerender. `SeriesMeta.plannedParts` then makes the counts read "5 of 17 parts" instead of implying the series is finished — set it while a series is `status: 'ongoing'`.

### Content facts must be verified, never recalled

**Any claim in content that can go stale must be checked against a live source before it is written** — platform rules and fees (Fiverr levels, Upwork JSS/Connects, payout channels), pricing, API/library behaviour, job-market conditions, tax and regulatory rules. Model training data is old by definition; a confidently wrong threshold is worse than no number.

The rules:

- Verify against the **primary source** (the platform's own help/docs page, the vendor's pricing page) rather than a blog post summarising it. Use `ctx7` for library/API docs, WebSearch/WebFetch for everything else.
- When a specific number or threshold goes in the prose, **date it** ("২০২৬ সালের মাঝামাঝি অনুযায়ী") and tell the reader to confirm it at the source, since it moves.
- If it can't be verified, describe the **mechanism** generically instead of stating a figure. Don't invent statistics, and frame illustrative numbers as illustrative ("মোটামুটি", "আনুমানিক").
- The same applies to outline stubs — don't bake an unverified figure into a bullet that will later be written up as fact.

### Notes are Bangla-only

The notes prose is **Bangla**, served at `/notes` — there is no English catalog and no locale switcher. `src/content/notes/` held English chapters until they were removed in favour of the Bangla ones; a backup of that English tree lives outside the repo. The notes UI chrome resolves through the single string table exported as `t` from `src/lib/data/notes-strings.ts` — there is no i18n/locale layer left. Old `/bn/notes/*` URLs 308-redirect to `/notes/*` via `src/routes/bn/[...rest]/+page.ts` — keep that route while those links are still out there.

The rest of the site (home, blog chrome, projects, `/directory`, footer) stays **English**, and `/directory` uses the English track labels from `categories.ts`.

### Global ⌘K search

`SearchPalette.svelte` is mounted once in the root layout and opens from anywhere (⌘K / Ctrl+K, `/`, or the header's `SearchTrigger`); `src/lib/search-ui.svelte.ts` is the shared open/close rune that lets the triggers live in the header. Ranking lives in `src/lib/search.ts`.

The index is **built, not computed at runtime**: `node scripts/build-manifest.mjs` writes `src/lib/search-index.json` in the same pass as the manifest (it already reads every file), giving each row a pre-lowercased, word-deduped haystack of topics, category, slug and every `##`/`###` heading. Title and subtitle are deliberately **excluded** from that haystack — they are scored as their own fields — and words already in them are filtered out, which is a third of the payload. **Rebuild it whenever content changes**, same command as the manifest.

Tracks, projects and top-level pages are added at runtime in `search.ts` from modules the app already has, so the Bangla track labels are never duplicated into the index.

Two properties to preserve when touching this:

- **The index is lazy.** It must stay out of every page's module graph — `import('$lib/search-index.json')` inside `loadRows()` is what keeps the 88 KB (gzipped) chunk off the initial load. It is warmed on trigger hover/focus and on ⌘/Ctrl keydown, so opening rarely waits.
- **Matching is plain `indexOf` over prepared strings** — no search library, no debounce, no index built in the browser. 50 full ranking passes over ~530 rows measure ~1 ms total; keep it that way rather than reaching for fuzzy matching.

Query folding is `NFC` + lowercase, and the build-time word split keeps `\p{M}` so Bangla matras stay attached to their words. English `topics[]`/slugs sit alongside Bangla titles in the haystack on purpose: a reader typing either "caching" or "ক্যাশিং" finds the same track.

### Every notes chapter needs a story section (non-negotiable)

**Each chapter carries one substantial narrative section that teaches the core idea through a concrete, everyday scene before any code or diagram.** The heading is `## গল্পে বুঝি`. This is the house style — a chapter without it does not match the rest of the notes.

Requirements:

- **Multi-paragraph, not a one-line analogy.** A Callout with "it's like a library" does not satisfy this.
- **A concrete setting with named people doing things** — a shop, bazaar, library, post office, kitchen, caravanserai, money-changer's counter. Use the Islamic Golden Age names below.
- **Close with an explicit mapping** from each story element back to the technical term, with the terms in bold — "the counter shelf is the **cache**, the warehouse walk is the **DB query**".
- **The harder the concept, the more the story matters.** Consensus, backpressure and CRDTs need it more than caching does.

The canonical example to match for length, rhythm and mapping style is `src/content/notes/caching/02-cache-strategies.md`.

### Bangla writing rule — NEVER over-translate (applies everywhere)

This governs **all** Bangla output: notes content (`src/content/notes/`), blog posts, and UI strings (`src/lib/data/notes-strings.ts`, `src/lib/data/notes-labels.ts`).

**Keep technical and product terms in English, written in Bangla script (transliterated). Do not invent or reach for a "pure Bangla" equivalent.** A Bangla developer says these words in English — translating them makes the text _harder_ to read, not more native. Bangla supplies the grammar and connective tissue; the terminology stays recognisable.

| Write this                | Not this                   |
| ------------------------- | -------------------------- |
| বিল্ড ও শিপ               | তৈরি ও প্রকাশ              |
| অপারেট ও স্কেল            | পরিচালনা ও স্কেল           |
| ফান্ডামেন্টালস            | মৌলিক ভিত্তি               |
| মাস্টারি                  | পারদর্শিতা                 |
| হরাইজন্টালি স্কেল         | অনুভূমিকভাবে বৃদ্ধি        |
| ইভেন্ট-ড্রিভেন            | ইভেন্ট-চালিত               |
| রিলায়েবিলিটি / সিকিউরিটি | নির্ভরযোগ্যতা / নিরাপত্তা  |
| ল্যাঙ্গুয়েজ              | ভাষা (programming context) |

The test: **read it aloud to a working Bangladeshi developer.** If they would not say that word in that sentence, it is over-translated. When unsure, keep the English term — either in Latin script (`REST`, `API`, `GraphQL`, `Redis`, `XP`) or transliterated (ক্যাশ, লেটেন্সি, ডিপ্লয়, স্কিমা, থ্রুপুট). Acronyms and product names always stay in Latin script.

Ordinary non-technical prose is normal Bangla — this rule is about terminology, not about writing English in Bangla letters.

Code, code comments, identifiers, log strings and `topics[]` arrays stay in **English**. Frontmatter `title`/`subtitle`/`description` are Bangla.

**Blog language: Bangla by default** — write new blog posts in Bangla unless the user explicitly asks for English.

### Example naming (content & code samples)

In examples, placeholder data, and sample identifiers, use names and references from the **Islamic Golden Age** instead of generic "Alice/Bob/Acme/foo". Draw from its scholars and cities — e.g. people: Ibn Sina, Al-Khwarizmi, Ibn al-Haytham, Al-Biruni, Al-Kindi, Al-Razi, Al-Farabi, Ibn Rushd, Omar Khayyam, Fatima al-Fihri, Maryam al-Astrulabi; cities: Baghdad, Cordoba, Damascus, Samarkand, Bukhara, Cairo, Fez. (The site is authored as "Ebn Sina" / Ibn Sina, so this keeps examples on-theme.) This applies to new notes chapters, demo data, usernames, table rows, and request/response samples.

**In Bangla prose, use one short name, never the full scholarly name**: ফাতিমা (not ফাতিমা আল-ফিহরি), সিনা, খোয়ারিজমি, হাইসাম, বিরুনি, কিন্দি, রাজি, ফারাবি, রুশদ, মরিয়ম. All existing content was shortened to these forms. Code samples may keep a real surname where the field needs one (`LastName: "al-Khwarizmi"`).

### mdsvex authoring rules (content compiles as Svelte)

Markdown is compiled as Svelte, so in **prose** (outside fenced code blocks) a raw `<`, `>`, `{`, or `}` breaks the build. Use `&lt;`/`&gt;` and avoid/escape curly braces; put anything with those characters (code, JSON, C, SQL) inside triple-backtick fenced blocks where they're safe. Shiki highlighting (`vite.config.ts` → `highlighter`) emits `{@html ...}` and must escape backslashes — see the `escapeSvelte(...).replace(/\\/g, ...)` there.

Components under `src/lib/components/content/`: `Callout` (types `info`/`tip`/`warning`/`danger`), `CodeTabs`, `Mermaid`, `LevelBadge`, `CdnPlayground`. There is **no mdsvex layout injecting them** — a chapter that uses one imports it itself in a `<script>` block placed directly after the frontmatter.

### Chapter simulators

Some chapters carry a `## হাতে-কলমে: …` section with an interactive simulator plus a graded challenge (`QueueSim` in `performance/01-latency-thinking` is the reference). Each is three files: a pure, seeded, frame-rate-independent sim in `src/lib/<name>-sim.ts` (seeded with `mulberry32` from `rng.ts`), a vitest test that locks the challenge (the naive answer fails, the intended one passes), and a component in `content/` that imports the shared `sim.css`. Numbers in the prose and result text come from the sim, never from memory. Passing awards XP through `progress.complete('challenge', <slug>, <level>)`. The `challenge/` keys count toward XP but not toward the chapter count. Only add one where the concept changes over time (queues, lag, votes). Static topics don't get one.

## Notes "journey" gamification

The notes section is a localStorage-backed learning game (no DB):

- **`src/lib/progress.svelte.ts`** — a rune-based store (exported singleton `progress`). Completed chapters are the single source of truth; **XP and ranks are derived** from them (never stored separately). Persists to `localStorage` key `notes-progress-v1`; call `progress.hydrate()` in `onMount` (client-only, to avoid SSR hydration mismatch — gate UI on `progress.ready`). Supports export/import/reset.
- **`src/lib/data/roadmap.ts`** — the 4-level path (Fundamentals → Mastery), mapping content **groups** to levels. Rendered by `Roadmap.svelte` on the notes index.
- **Badges** — `isTrackComplete()` derives a per-track badge (all chapters in a category done). It surfaces in two places only: the track header (`TrackBadge.svelte` on `/notes/[category]`) and the "Track mastered" toast in `ChapterComplete.svelte`. The notes index used to carry a grid of ~40 badges under the roadmap; it was removed as duplicated information — completion shows inline on the roadmap rows instead. Don't add it back.

The roadmap level titles/blurbs/outcomes rendered on `/notes` come from `t.roadmap[level.n]` in `notes-strings.ts` (Bangla), overlaying the English defaults in `roadmap.ts`.

Per-chapter `level` should progress monotonically (beginner→mastery) within a track.

## Projects & case studies

Projects live in `src/lib/data/projects.ts` (`projects: Project[]`). A project with a `caseStudy` field renders a write-up at `/projects/[slug]` (`src/routes/projects/[slug]/+page.svelte`); its cards link there. A `CaseStudy` has `summary`, `problem`, `challenges[]`, `implementation[]`, `stackWhy[]`, `features[]`, and `status`.

**Write case studies as engineering narrative, not code walkthroughs.** Each `challenges`/`implementation` entry should read problem → approach → tradeoff: open with _why it was hard_, then the conceptual approach. Do **not** name code-level identifiers — no function/method/API names, file names, or literal call signatures (e.g. `buildAdapter()`, `navigator.sendBeacon`, `loadOrBuild`, `on_publish`). Keep the genuinely meaningful architecture/tech terms (columnar OLAP store, HMAC-signed URLs, ICC→sRGB, fragmented MP4, adaptive-bitrate ladder). `stackWhy` explains _why this tech fits the problem_, not which API was called. This is what the reader — a hiring manager or peer, not someone reading the source — actually cares about.

## Heroes

There is no 3D (three.js/Threlte were removed). The home hero and `PageBanner` are centered and full-bleed, pulled up under the sticky header so it blends into them, with a shared `.hero-bg` backdrop (two soft lights, no lines or texture) from `layout.css`. `PageBanner` must be the first element inside `<main>`.

## Design system & theming

`src/routes/layout.css` is the single source of truth. Runtime brand vars (`--bg/--fg/--muted/--rule/--accent/--accent-soft/--accent-solid/--brand-accent/--card-base`) are defined on `:root` / `:root.dark` and exposed as Tailwind v4 tokens via `@theme inline` (so `text-accent`, `bg-bg` are theme-aware). **Palette: Zumurrud** — emerald `--primary` (`#0e7c5a` light / `#34c99a` dark) and brass `--secondary` (`#a8742a` / `#d9a55a`), plus semantic `--success`, `--warning`, `--danger`, `--info`, each with a light and dark value, on cool-neutral greys (`--muted`, `--faint`, `--rule`, `--rule-strong`, `--surface`). All are Tailwind colours too (`text-primary`, `bg-danger`, …). `--accent` and `--accent-solid` alias `--primary`; `--on-accent` is the ink on a solid primary fill. Use the semantic tokens for state (pass = success, fail = danger), never a hand-picked hex. Reskinning the whole site means changing those hex values and nothing else.

**Fonts — PolySans for all text, Space Mono, plus the Bangla face:**

- **PolySans** (static woff2 in `static/fonts/polysans/`, `@font-face` in `layout.css`; Slim 300 / Neutral 400 / Median 500–600 / Bulky 700) fills `--font-sans`, `--font-display` and `--font-serif` — body text and every heading (h1–h3 are forced to 700 = Bulky).
- **Space Mono** (`@fontsource/space-mono`, 400 + 700 only) fills `--font-mono` _and_ `--font-pixel`. The "pixel" role is a leftover name for the numeric/stat type in the notes UI (`font-pixel`); it is plain mono now, not an arcade face.
- **Hind Siliguri** is layered in under `[lang='bn']`, which overrides the text tokens on that subtree and bumps `line-height` to 1.75. Code is explicitly excluded so fenced blocks stay Latin monospace. The notes pages set `lang="bn"` on their wrapper (and `ArticleLayout` takes a `lang` prop) — that attribute is what activates the Bangla face, so keep it on any new notes surface.
- `static/fonts/` still holds `GeistPixel-Square.woff2` and the Oddval faces, and `geist` is still in `dependencies` — all unused leftovers. Don't build on them.

Colour mixes involving `--accent` use **oklab**, never oklch: oklch interpolates hue, and blending the blue (hue 246) toward the warm page (hue 40) swings through red and tints everything pink.

**Corners scale with size**: `rounded-md` chips/checkboxes (0.4rem), `rounded-lg` badges (0.5rem), `rounded-xl` buttons and controls (0.75rem), `rounded-3xl` cards and panels (1.5rem) — tokens `--radius-chip/-badge/-button/-card` on `:root`, aliased in `@theme inline`. Tailwind's preflight zeroes `button`/`input`, so a base-layer rule puts form controls back on the scale. **Buttons** use `.btn` + `.btn-solid`/`.btn-ghost` (46px, mono uppercase, 0.12em tracking, invert to solid on hover); don't hand-roll button styles.

**Type rules.** Every small uppercase label uses the `.eyebrow` class (mono, 0.68rem, 0.16em tracking, muted), and every article-type h1 uses `.title-page`. Both live in `@layer components` in `layout.css` so utilities can still override. Headings are weight 600, never bold. Bengali text is never letter-spaced (a `[lang='bn']` rule forces it off). Don't hand-roll new tracking/size combos.

**Coloured surfaces are aurora gradients.** `src/lib/colors.ts` holds eight aurora themes; `auroraAt(i)` (cyclic) / `auroraFor(key)` (stable hash) return an inline style setting `--au-1/2/3` (bloom lights), `--au-b1/b2/b3` (base sweep), `--aa` (angle) and `--ax/--ay` (light origin). Put that style on an element carrying `.aurora-surface` (paints the gradient) or `.glass-card` (same, plus white ink and a pinned dark `--bg`). The layer stack lives in those classes, **not** in a custom property — a `var()` inside a custom property resolves against the element it was declared on, so a `--aurora-bg` var would give every card the `:root` fallback. Current users: `SeriesNav` and the `/directory` notes folders only. Post/project cards, series strips and tool kits are flat `.surface` / `.media-card` panels (tinted fill, no border, no gradient) — keep them that way. The notes roadmap and chapter rows were deliberately flattened off aurora — they are type and whitespace now, so don't reintroduce gradient bars there.

`catColor(i)` / `catFor(key)` (an emerald ramp at constant lightness steps) return flat hexes for small markers — the track page tints its badge with `catColor()`, the project page uses `catFor()`.

**Lightning CSS gotcha:** never hand-write a `-webkit-` alias next to a standard property — Lightning CSS then prunes the _standard_ one and only the prefixed version ships (this silently killed the header's `backdrop-filter`). Write the standard property alone and let it prefix from browserslist.

The header (`Header.svelte`) is transparent at rest so it blends into the hero, and fades in a blurred surface once scrolled — painted by a `::before` so nav text is never inside a filtered layer. It has no bottom rule in either state.

Brand/visual constraints: no neon/glow; minimal cards; colour only from the palette tokens.

**Corner radius** — the four tokens above are declared on `:root` in `layout.css`, and Tailwind's `--radius-md/-lg/-xl/-3xl` alias them in `@theme inline`, so markup classes and CSS cannot drift; changing a token re-rounds the whole site. Every element starts at the button radius via a zero-specificity `*` rule in `@layer base`; full-bleed surfaces (html, body, footer, lists, table cells) are exempt. A top-border-only divider or a fill inside a rounded box sets `border-radius: 0` itself.

The card radius is declared on **`.aurora-surface` / `.glass-card` themselves**, not on each component's cover class — so any coloured surface is rounded by construction and a new one can't ship sharp. Components needing a different silhouette (the folder's tab corner, its pocket) override it from their own scoped rule, which wins on specificity.

**Reading progress lives in the TOC rail**, not in a bar across the top — a hairline gauge beside the ticks fills to your position, measured off the article element (so the page header/footer don't count as reading). Below `xl` there is no rail, so the same value traces a conic-gradient ring around the focus button. `ReadingBar.svelte` and its `<ReadingBar />` on the chapter route were deleted; don't reintroduce a top bar.

**Callouts and blockquotes are tinted blocks, not bordered boxes.** `Callout.svelte` sets one `--cl` per type from the palette (`info`, `tip` = success, `warning`, `danger`) and drives fill, title and icon from it; body text stays `--fg` for contrast. The prose blockquote gets the same treatment in `--accent` plus a masked info icon in its left grid column — masked, so it inks itself from `color`. Media cards are frameless: the aurora cover carries the radius, shadow and hover lift, and the copy sits below it on the page.

## Icons

Never use emoji in UI. Icons are **Phosphor** (`phosphor-svelte`, deep imports from `phosphor-svelte/lib/<Name>Icon`), always reached through the single wrapper `src/lib/components/Icon.svelte`:

```svelte
import Icon from '$lib/components/Icon.svelte';
<Icon name="trophy" size={14} weight="bold" color="var(--bg)" />
```

`Icon.svelte` holds the whole icon set as a `name → Phosphor component` map, so a role is registered once and every call site stays terse. **To use a new icon, add a role to that map** — do not import from `phosphor-svelte` at a call site, and do not hand-roll inline `<svg>`. Colour defaults to `currentColor`.

## Conventions

- Svelte 5 runes only (`$props`, `$state`, `$derived`, `$effect`). When a value reads a prop, make it `$derived` (svelte-check flags `state_referenced_locally`).
- SEO via the shared `src/lib/components/Seo.svelte` (uses `page` from `$app/state`); wired into every route. `sitemap.xml` and `rss.xml` are prerendered endpoints.
- The whole site prerenders: `src/routes/+layout.ts` sets `export const prerender = true`, and `prerender.handleHttpError`/`handleMissingId` are `'warn'` in `vite.config.ts`. A dynamic route therefore needs an `entries()` in its `+page.ts` or it never gets built.

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
