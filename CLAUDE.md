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

Note frontmatter schema: `title, subtitle, chapter (number), level ("beginner"|"intermediate"|"advanced"|"mastery"), readingTime, topics[]`. Categories are declared in `src/lib/data/categories.ts` (`CATEGORIES` map → `label`/`description`/`group`; `GROUP_ORDER` orders the groups). A new track needs: the markdown files, a `CATEGORIES` entry, and a manifest rebuild — it then flows automatically into the notes roadmap, folders, and badges.

### mdsvex authoring rules (content compiles as Svelte)

Markdown is compiled as Svelte, so in **prose** (outside fenced code blocks) a raw `<`, `>`, `{`, or `}` breaks the build. Use `&lt;`/`&gt;` and avoid/escape curly braces; put anything with those characters (code, JSON, C, SQL) inside triple-backtick fenced blocks where they're safe. Shiki highlighting (`vite.config.ts` → `highlighter`) emits `{@html ...}` and must escape backslashes — see the `escapeSvelte(...).replace(/\\/g, ...)` there. Content components available to chapters: `Callout` (types `info`/`tip`/`warning`), `Diagram`, `CodeTabs` (under `src/lib/components/content/`).

## Notes "journey" gamification

The notes section is a localStorage-backed learning game (no DB):

- **`src/lib/progress.svelte.ts`** — a rune-based store (exported singleton `progress`). Completed chapters are the single source of truth; **XP and ranks are derived** from them (never stored separately). Persists to `localStorage` key `notes-progress-v1`; call `progress.hydrate()` in `onMount` (client-only, to avoid SSR hydration mismatch — gate UI on `progress.ready`). Supports export/import/reset.
- **`src/lib/data/roadmap.ts`** — the 4-level path (Fundamentals → Mastery), mapping content **groups** to levels. Rendered by `Roadmap.svelte` on the notes index.
- **Badges** — `isTrackComplete()` derives a per-track badge (all chapters in a category done); shown via `TrackBadge.svelte` and a "Track mastered" toast in `ChapterComplete.svelte`.

Per-chapter `level` should progress monotonically (beginner→mastery) within a track.

## 3D (Threlte) — must be guarded

3D is mounted conditionally via `src/lib/three/enabled.ts` (`threeEnabled()` = viewport ≥768px AND not `prefers-reduced-motion`). `Hero.svelte` and `PageBanner.svelte` lazy-import their canvases only when enabled, so phones/reduced-motion render zero canvases. Keep this gating when adding 3D. Canvases use `dpr={[1, 1.75]}` and point clouds sampled from geometry (`MeshSurfaceSampler`).

## Design system & theming

`src/routes/layout.css` is the single source of truth. Runtime brand vars (`--bg/--fg/--accent/--brand-accent`, plus `--accent-hex` consumed by three.js) are defined on `:root` / `:root.dark` and exposed as Tailwind v4 tokens via `@theme inline` (so `text-accent`, `bg-bg` are theme-aware). Fonts: display/serif = Bricolage Grotesque, sans = Epilogue, mono = Geist Mono, **pixel = Geist Pixel** (self-hosted from the `geist` package at `static/fonts/`, used for the gamified notes UI via `font-pixel`). Card colors come from `src/lib/colors.ts` (`cardColor(i)` cyclic, `colorFor(key)` stable hash) — do not tint card colors by mixing with `--bg` (muddies hues); use the full-hue gradient pattern in `.glass-card`.

Brand/visual constraints: no neon/glow; minimal cards; geometric type with a cherry/burgundy accent.

## Icons

Never use emoji in UI. Use icon components from **`@lucide/svelte`** (e.g. `import { Trophy } from '@lucide/svelte'` → `<Trophy size={14} strokeWidth={3} color="var(--bg)" />`); they inherit `currentColor`. Do not hand-roll inline `<svg>` icons either — prefer the Lucide component so icons stay consistent.

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
