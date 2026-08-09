# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm (use `pnpm`, never `npm`/`yarn`)
- **Framework**: SvelteKit (Svelte 5 runes) + `adapter-vercel`, deployed prerendered
- **3D**: Threlte 8 + three.js
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

There are two vitest projects defined in `vite.config.ts`: `client` (browser, files `*.svelte.{test,spec}.ts`) and `server` (node, other `*.{test,spec}.ts`). `expect.requireAssertions` is on — every test must assert.

## Critical: configuration lives in vite.config.ts, not svelte.config.js

There is **no `svelte.config.js`** — this project uses the experimental `sveltekit({...})` Vite-plugin config form. All SvelteKit options (`adapter`, `preprocess`/mdsvex, `extensions`, `prerender`, `compilerOptions.experimental.async`, `experimental.remoteFunctions`) are passed inside the `sveltekit()` call in `vite.config.ts`. Editing a `svelte.config.js` will do nothing. `compilerOptions.experimental.async: true` is enabled (top-level `await` / async components are allowed).

## Content pipeline (blog + notes)

Markdown content lives in `src/content/blog/*.md` and `src/content/notes/<category>/*.md`. Reading/loading goes through `src/lib/content.ts`, which uses two layers:

- **`src/lib/content-manifest.json`** — a committed, metadata-only index (frontmatter for every post/chapter). Used for all listing/sorting/counting so the client never bundles full content. **Regenerate it with `node scripts/build-manifest.mjs` after adding/editing/removing note files** — it scans `src/content/notes/`, parses frontmatter, and preserves the existing `blog` entries.
- **Lazy `import.meta.glob`** — one chunk per file, loaded on demand in `loadPost`/`loadChapter`. Do not eagerly import content; it produces a multi-MB client chunk.

Note frontmatter schema: `title, subtitle, chapter (number), level ("beginner"|"intermediate"|"advanced"|"mastery"), readingTime, topics[]`. Categories are declared in `src/lib/data/categories.ts` (`CATEGORIES` map → `label`/`description`/`group`; `GROUP_ORDER` orders the groups), with their Bangla display strings in `src/lib/data/notes-labels.ts`. A new track needs: the markdown files, a `CATEGORIES` entry (plus a `NOTES_CATEGORIES` entry), and a manifest rebuild — it then flows automatically into the notes roadmap, folders, and badges.

### Notes are Bangla-only

The notes prose is **Bangla**, served at `/notes` — there is no English catalog and no locale switcher. `src/content/notes/` held English chapters until they were removed in favour of the Bangla ones; a backup of that English tree lives outside the repo. The notes UI chrome resolves through the single string table exported as `t` from `src/lib/data/notes-strings.ts` — there is no i18n/locale layer left. Old `/bn/notes/*` URLs 308-redirect to `/notes/*` via `src/routes/bn/[...rest]/+page.ts` — keep that route while those links are still out there.

The rest of the site (home, blog chrome, projects, `/directory`, footer) stays **English**, and `/directory` uses the English track labels from `categories.ts`.

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

### mdsvex authoring rules (content compiles as Svelte)

Markdown is compiled as Svelte, so in **prose** (outside fenced code blocks) a raw `<`, `>`, `{`, or `}` breaks the build. Use `&lt;`/`&gt;` and avoid/escape curly braces; put anything with those characters (code, JSON, C, SQL) inside triple-backtick fenced blocks where they're safe. Shiki highlighting (`vite.config.ts` → `highlighter`) emits `{@html ...}` and must escape backslashes — see the `escapeSvelte(...).replace(/\\/g, ...)` there. Content components available to chapters: `Callout` (types `info`/`tip`/`warning`), `Diagram`, `CodeTabs` (under `src/lib/components/content/`).

## Notes "journey" gamification

The notes section is a localStorage-backed learning game (no DB):

- **`src/lib/progress.svelte.ts`** — a rune-based store (exported singleton `progress`). Completed chapters are the single source of truth; **XP and ranks are derived** from them (never stored separately). Persists to `localStorage` key `notes-progress-v1`; call `progress.hydrate()` in `onMount` (client-only, to avoid SSR hydration mismatch — gate UI on `progress.ready`). Supports export/import/reset.
- **`src/lib/data/roadmap.ts`** — the 4-level path (Fundamentals → Mastery), mapping content **groups** to levels. Rendered by `Roadmap.svelte` on the notes index.
- **Badges** — `isTrackComplete()` derives a per-track badge (all chapters in a category done); shown via `TrackBadge.svelte` and a "Track mastered" toast in `ChapterComplete.svelte`.

Per-chapter `level` should progress monotonically (beginner→mastery) within a track.

## Projects & case studies

Projects live in `src/lib/data/projects.ts` (`projects: Project[]`). A project with a `caseStudy` field renders a write-up at `/projects/[slug]` (`src/routes/projects/[slug]/+page.svelte`); its cards link there. A `CaseStudy` has `summary`, `problem`, `challenges[]`, `implementation[]`, `stackWhy[]`, `features[]`, and `status`.

**Write case studies as engineering narrative, not code walkthroughs.** Each `challenges`/`implementation` entry should read problem → approach → tradeoff: open with _why it was hard_, then the conceptual approach. Do **not** name code-level identifiers — no function/method/API names, file names, or literal call signatures (e.g. `buildAdapter()`, `navigator.sendBeacon`, `loadOrBuild`, `on_publish`). Keep the genuinely meaningful architecture/tech terms (columnar OLAP store, HMAC-signed URLs, ICC→sRGB, fragmented MP4, adaptive-bitrate ladder). `stackWhy` explains _why this tech fits the problem_, not which API was called. This is what the reader — a hiring manager or peer, not someone reading the source — actually cares about.

## 3D (Threlte) — must be guarded

3D is mounted conditionally via `src/lib/three/enabled.ts` (`threeEnabled()` = viewport ≥768px AND not `prefers-reduced-motion`). `Hero.svelte` and `PageBanner.svelte` lazy-import their canvases only when enabled, so phones/reduced-motion render zero canvases. Keep this gating when adding 3D. Canvases use `dpr={[1, 1.75]}` and point clouds sampled from geometry (`MeshSurfaceSampler`).

## Design system & theming

`src/routes/layout.css` is the single source of truth. Runtime brand vars (`--bg/--fg/--accent/--brand-accent`, plus `--accent-hex` consumed by three.js) are defined on `:root` / `:root.dark` and exposed as Tailwind v4 tokens via `@theme inline` (so `text-accent`, `bg-bg` are theme-aware). Fonts: display/serif = Bricolage Grotesque, sans = Epilogue, mono = Geist Mono, **pixel = Geist Pixel** (self-hosted from the `geist` package at `static/fonts/`, used for the gamified notes UI via `font-pixel`). **Coloured surfaces are aurora gradients.** `src/lib/colors.ts` holds eight aurora themes; `auroraAt(i)` (cyclic) / `auroraFor(key)` (stable hash) return an inline style setting `--au-1/2/3` (bloom lights), `--au-b1/b2/b3` (base sweep), `--aa` (angle) and `--ax/--ay` (light origin). Put that style on an element carrying `.aurora-surface` (paints the gradient) or `.glass-card` (same, plus white ink and a pinned dark `--bg`). The layer stack lives in those classes, **not** in a custom property — a `var()` inside a custom property resolves against the element it was declared on, so a `--aurora-bg` var would give every card the `:root` fallback. Used by post/project cards, notes folders, roadmap level cards + track avatars, chapter rows and case-study panels. `catColor`/`catFor` (flat categorical hues) remain for the three.js accents and small markers.

**Lightning CSS gotcha:** never hand-write a `-webkit-` alias next to a standard property — Lightning CSS then prunes the _standard_ one and only the prefixed version ships (this silently killed the header's `backdrop-filter`). Write the standard property alone and let it prefix from browserslist. (Same family of problem as the `corner-shape` `@supports` gate above.)

The header (`Header.svelte`) is transparent at rest so it blends into the hero, and fades in a blurred surface once scrolled — painted by a `::before` so nav text is never inside a filtered layer. It has no bottom rule in either state.

Brand/visual constraints: no neon/glow; minimal cards; geometric type with a cherry/burgundy accent.

## Icons

Never use emoji in UI. Icons are **Hugeicons**, always reached through the single wrapper `src/lib/components/Icon.svelte`:

```svelte
import Icon from '$lib/components/Icon.svelte';
<Icon name="trophy" size={14} strokeWidth={3} color="var(--bg)" />
```

`Icon.svelte` holds the whole icon set as a `name → Hugeicons glyph` map, so a role is registered once and every call site stays terse. **To use a new icon, add a role to that map** — do not import from `@hugeicons/core-free-icons` at a call site, and do not hand-roll inline `<svg>`. Colour defaults to `currentColor`.

## Conventions

- Svelte 5 runes only (`$props`, `$state`, `$derived`, `$effect`). When a value reads a prop, make it `$derived` (svelte-check flags `state_referenced_locally`).
- SEO via the shared `src/lib/components/Seo.svelte` (uses `page` from `$app/state`); wired into every route. `sitemap.xml` and `rss.xml` are prerendered endpoints.
- Routes are `prerender = true`; `prerender.handleHttpError`/`handleMissingId` are set to `'warn'`.

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
