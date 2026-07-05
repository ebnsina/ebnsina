/** A titled block of prose used for challenge / implementation sections. */
export type CaseStudySection = { title: string; body: string };

/** One row of the "why this stack" rationale table. */
export type StackReason = { tech: string; why: string };

export type CaseStudy = {
	/** One-liner shown under the case-study title. */
	summary: string;
	/** The problem the project solves, and for whom. */
	problem: string;
	/** Genuine engineering challenges and how they were addressed. */
	challenges: CaseStudySection[];
	/** Concrete implementation highlights. */
	implementation: CaseStudySection[];
	/** Why each core technology was chosen. */
	stackWhy: StackReason[];
	/** Notable shipped capabilities. */
	features: string[];
	/** Current state, e.g. "In development", "Released". */
	status?: string;
};

export type Project = {
	title: string;
	/** URL slug for the case-study page at /projects/<slug>. */
	slug: string;
	description: string;
	year: number;
	role?: string;
	stack: string[];
	/** Live/deployed or distribution URL, when one exists. */
	url?: string;
	repo?: string;
	featured?: boolean;
	order: number;
	/** Full technical write-up; when present the card links to /projects/<slug>. */
	caseStudy?: CaseStudy;
};

export const projects: Project[] = [
	{
		title: 'seyr',
		slug: 'seyr',
		description:
			'Privacy-first, cookieless web analytics — a fast, GDPR/CCPA-friendly alternative to Google Analytics with a sub-1KB tracker and multi-tenant billing.',
		year: 2026,
		stack: ['SvelteKit', 'Go', 'ClickHouse', 'PostgreSQL'],
		featured: true,
		order: 3,
		caseStudy: {
			summary:
				'Cookieless, no-PII web analytics with a sub-1KB tracker, a columnar event store, and multi-tenant billing — a self-hostable alternative to Google Analytics.',
			problem:
				'Site owners want per-site traffic insight without cookie banners, consent friction, or handing visitor data to a third party. seyr delivers fast aggregate dashboards while storing no cookies and no personal data — GDPR/CCPA-friendly by design — for small-to-mid operators and multi-site agencies.',
			challenges: [
				{
					title: 'Identifying visitors without cookies or PII',
					body: 'With no durable client id and raw IP/UA both counting as PII, the Go ingestor derives visitor_id = hash64(dailySalt | ip | ua | domain), consuming IP and UA transiently to compute geo/device then discarding them. The salt rotates every UTC day so a visitor cannot be linked across days, and folding the domain into the hash blocks cross-site correlation.'
				},
				{
					title: 'High-volume events with instant aggregate reads',
					body: 'Every pageview and event lands in ClickHouse as a partitioned MergeTree using LowCardinality/FixedString encodings and a TTL retention ceiling. A daily AggregatingMergeTree rollup and materialized view pre-aggregate pageviews and uniqState(visitor_id), so unfiltered date ranges skip the raw table entirely.'
				},
				{
					title: 'A sub-1KB tracker that still handles SPAs',
					body: 'The embeddable script is built by esbuild to an IIFE with a build-time size guard, importing only a zod-free config subpath. It uses navigator.sendBeacon with a fetch keepalive fallback, patches history.pushState/replaceState for SPA pageviews, honors DNT, and posts to a neutral /i path whose filename avoids ad-blocker trigger words.'
				},
				{
					title: 'Per-tenant quota enforcement at ingest speed',
					body: 'Beacons must resolve to a tenant and count against a monthly quota without touching Postgres on the hot path. A TTL cache resolves domain→site/org/limit (with negative caching of unknown domains) and an in-memory month-to-date counter — seeded from Postgres, flushed as deltas — keeps limit checks O(1), with soft/block modes for over-limit traffic.'
				}
			],
			implementation: [
				{
					title: 'Decoupled Go ingest path',
					body: 'POST /i always replies 202 (never leaking which UAs or domains are filtered), runs a two-layer bot filter, validates, resolves the site, records usage, and hands the row to a single-goroutine batcher. The buffer flushes by size or interval and drops-and-counts on saturation, so a slow ClickHouse never stalls request latency.'
				},
				{
					title: 'Parameterized read path with rollup fallback',
					body: 'The dashboard maps a whitelist of filter keys to columns and binds every value as a ClickHouse query parameter — no user input is ever interpolated into SQL. Unfiltered daily ranges are served from the events_daily rollup via uniqMerge, falling back to raw events for hourly/filtered queries with WITH FILL gap-zeroing.'
				},
				{
					title: 'Auth and tenancy in SvelteKit',
					body: 'Sessions store a high-entropy token client-side while the DB persists only its SHA-256 (the raw token is never stored), with sliding renewal and argon2 passwords. Signup atomically creates the user, first org, and owner membership; every query is org-scoped and cross-org access 404s.'
				},
				{
					title: 'Provider-agnostic billing with idempotent callbacks',
					body: 'A PaymentProvider interface fronts an SSLCommerz adapter (cards + bKash/Nagad/Rocket) and a mock adapter for dev. Gateway redirects are handled session-independently and idempotently — a finalized payment short-circuits — before activating the subscription and optionally storing a tokenized card for auto-renew.'
				}
			],
			stackWhy: [
				{ tech: 'Go', why: 'Cheap goroutines and channels make the single-owner in-memory batcher and drop-on-saturation design natural for the write-hot beacon endpoint, shipping as a lean static binary.' },
				{ tech: 'ClickHouse', why: 'A columnar OLAP store so high-volume events compress well and aggregate queries over millions of rows stay fast, with materialized-view rollups for time series.' },
				{ tech: 'PostgreSQL', why: 'The transactional source of truth for users, orgs, sites, subscriptions, and usage counters — data that needs referential integrity.' },
				{ tech: 'SvelteKit', why: 'One SSR app covering dashboard, marketing, auth, billing, and the read API, deployed via the Node adapter for self-hosting.' },
				{ tech: 'esbuild', why: 'Minifies and bundles the tracker to an IIFE under 1KB with a build-time size guard.' },
				{ tech: 'Turborepo', why: 'A pnpm monorepo so a schema change touches the ClickHouse DDL, the Go insert, and the TypeScript query in one commit.' }
			],
			features: [
				'Cookieless, no-PII tracking with daily-rotating visitor hashing and a sub-1KB SPA-aware script',
				'Dashboards for visitors, pageviews, bounce rate, and duration with page/source/country/browser/OS/device breakdowns',
				'Custom event tracking with key/value props surfaced as ranked conversions',
				'Multi-tenant orgs with roles and public shareable dashboards via token',
				'Plan-based monthly event limits enforced at ingest (soft/block modes)',
				'SSLCommerz billing with idempotent callbacks, tokenized auto-renew, and bot/AI-scraper filtering'
			],
			status: 'Feature-complete pre-release · self-hostable'
		}
	},
	{
		title: 'SnapKeep',
		slug: 'snapkeep',
		description:
			'A native macOS screenshot and screen-recording tool — capture, annotate, and keep, fully on-device with no accounts, cloud, or telemetry.',
		year: 2026,
		stack: ['Swift 6', 'SwiftUI', 'ScreenCaptureKit', 'Vision'],
		url: 'https://github.com/ebnsina/SnapKeep/releases',
		featured: false,
		order: 5,
		caseStudy: {
			summary:
				'A native macOS capture tool — region/window/full-screen screenshots, screen recording, annotation, and on-device OCR — that never touches the network.',
			problem:
				'Privacy-conscious Mac users and creators want fast capture, annotation, and short screen recordings without sending anything to the cloud. SnapKeep does it all on-device: no accounts, no telemetry, no cost — a menubar utility that captures, annotates, and keeps.',
			challenges: [
				{
					title: 'Wrangling ScreenCaptureKit permissions',
					body: "macOS Screen Recording (TCC) permission is notoriously finicky and usually forces a relaunch. SnapKeep touches SCShareableContent on launch to reliably surface the native prompt, then re-checks authorization every time the app is foregrounded, so returning from System Settings clears the prompt without a manual restart."
				},
				{
					title: 'Low-latency recording and real-time encoding',
					body: 'ScreenCaptureKit delivers SCStream frames on a private queue that must feed an AVAssetWriter off the main thread, so the recording engine is marked @unchecked Sendable and synchronizes on its own queue. It handles real encoder constraints — even width/height for H.264, real-time expectation, a bounded queue depth, and establishing the writer timeline from the first video sample before appending audio.'
				},
				{
					title: 'One annotation model, identical on screen and export',
					body: 'Every tool — pen, marker, arrow, shapes, text, numbered steps, pixelate — is modeled as a single value type with a shared render(in:) used by both the live canvas and the final export, so what you see is what you save. Pixelate redaction handles the point-space to base-pixel coordinate conversion to crop, downscale, and re-upscale a region into a mosaic.'
				},
				{
					title: 'Fully offline OCR and a menubar-only lifecycle',
					body: "Copy-Text OCR uses Vision's VNRecognizeTextRequest entirely on-device, sorting observations to restore reading order. The app runs as an LSUIElement MenuBarExtra with no dock presence, enforces a single running instance, and registers truly system-wide hotkeys via Carbon so capture fires regardless of focus."
				}
			],
			implementation: [
				{
					title: 'GPU capture pipeline as an actor',
					body: 'The capture engine is a Swift actor built on SCScreenshotManager, supporting full-display (mouse-following), single-window (desktop-independent filter), and region capture that excludes SnapKeep’s own windows. Sendable primitives — display id and scale — are passed into the actor to avoid sending non-Sendable NSScreen.'
				},
				{
					title: 'Video and GIF export',
					body: 'Recordings write H.264 MP4 with optional 48kHz AAC audio; a GIF exporter converts a finished clip to a looping animation by sampling frames with AVAssetImageGenerator. A post-recording Studio adds preview, trim, silence detection, and Speech-framework caption transcription.'
				},
				{
					title: 'Database-free local storage',
					body: 'Captures are written as timestamped PNG/JPEG to ~/Pictures/SnapKeep and copied to the clipboard. The history model is an @Observable @MainActor store that simply reloads the newest files from that directory — no database, no network — backing the menubar history grid.'
				},
				{
					title: 'XcodeGen project and DMG distribution',
					body: 'project.yml generates the single macOS app target (Swift 6, hardened runtime, arm64, macOS 14+); a bootstrap script runs xcodegen and builds the release .app. Pushing a v* tag triggers a GitHub Actions workflow that builds a DMG and publishes a Release. Not notarized yet, so the README documents the quarantine-removal step.'
				}
			],
			stackWhy: [
				{ tech: 'Swift 6', why: 'Strict concurrency (actors, Sendable) is used directly to make the capture actor and off-main recording callbacks memory-safe.' },
				{ tech: 'SwiftUI + AppKit', why: 'SwiftUI drives the MenuBarExtra UI and observable state; AppKit and Core Graphics handle the window-level and rendering work SwiftUI cannot.' },
				{ tech: 'ScreenCaptureKit', why: 'The modern macOS 14+ capture API providing both SCScreenshotManager stills and SCStream video with per-window/app exclusion filters.' },
				{ tech: 'Vision', why: 'On-device text recognition for Copy-Text OCR with no network dependency, matching the offline promise.' },
				{ tech: 'AVFoundation / ImageIO', why: 'AVAssetWriter and AVAssetImageGenerator for MP4 encoding and GIF frame sampling.' },
				{ tech: 'Carbon hotkeys', why: 'RegisterEventHotKey is the reliable way to register truly system-wide global shortcuts regardless of focus.' }
			],
			features: [
				'Region, window, full-screen, and recapture-last capture with freeze-frame overlay, live dimensions, and a magnifier loupe',
				'Screen recording to H.264 MP4 or animated GIF, with a post-recording Studio (trim, captions, silence detection)',
				'Annotation editor: pen, marker, arrow, shapes, text, numbered steps, pixelate/redact, undo/redo',
				'On-device Vision OCR, Beautify (gradient backdrop, padding, shadow), and pin-to-desktop',
				'Menubar history grid — click to copy, drag out, pin/reveal/share/delete — plus native sharing',
				'100% local: no network calls, no telemetry, no accounts'
			],
			status: 'Released v0.1.2 · GitHub Releases (not yet notarized)'
		}
	},
	{
		title: 'SEOMaster',
		slug: 'seomaster',
		description:
			'An all-in-one SEO SaaS that guides a zero-visitor site toward ranking on Google — built for non-technical users, teaching as it works.',
		year: 2026,
		stack: ['SvelteKit', 'Drizzle', 'PostgreSQL', 'TanStack AI'],
		featured: false,
		order: 4,
		caseStudy: {
			summary:
				'An SEO SaaS that audits a site, scores it, and teaches non-technical owners exactly what to fix — with a provider-agnostic, fully optional AI fix assistant.',
			problem:
				'Beginner site owners have zero-visitor sites and no idea how to rank on Google. SEOMaster audits a site and then explains, in plain language, what is wrong and exactly how to fix it — turning raw SEO data into do-this-next guidance instead of dashboards non-technical users cannot interpret.',
			challenges: [
				{
					title: 'AI that is provider-agnostic and fully optional',
					body: 'AI is bring-your-own-key and must never be a hard dependency — the whole app has to work without it. A single buildAdapter() switch selects an OpenAI/Anthropic/Gemini/Ollama adapter purely from env, and an isAiConfigured() gate guards every call site, with Ollama special-cased as keyless.'
				},
				{
					title: 'Keeping AI output structured and reliable',
					body: 'Generated fixes and content drafts must render as UI, not free text. Both AI features pass a Zod outputSchema to TanStack AI’s chat(), which resolves to a parsed, typed object, and the system prompts explicitly forbid jargon and invented business facts.'
				},
				{
					title: 'Background crawling without a separate infra tier',
					body: 'Crawls, daily rank sweeps, and weekly reports are long-running and periodic. BullMQ workers are started in-process from hooks.server.ts so a single node build VPS runs the server and jobs together — guarded against HMR double-start and degrading to in-process crawling when Redis is absent.'
				},
				{
					title: 'Teaching beginners, decoupled from AI',
					body: 'Every audit issue carries structured plain-language guidance — what it is, why it matters, how to fix, difficulty, impact — stored as content keyed by issue code. This manual guidance always works; the AI fix assistant layers a tailored copy-paste version on top when configured, and falls back to the manual steps when not.'
				}
			],
			implementation: [
				{
					title: 'TanStack AI adapter factory with structured chat()',
					body: 'buildAdapter() returns the configured provider’s chat adapter; draft and fix generation call chat({ adapter, messages, outputSchema }) with Zod schemas so results come back typed and validated (no streaming — it resolves to the parsed object).'
				},
				{
					title: 'BullMQ job pipeline',
					body: 'Three queues — crawl, rank-refresh, reports — use lazily-instantiated Queue singletons over a shared ioredis connection. Recurring work is registered idempotently at boot via upsertJobScheduler cron patterns: a daily rank sweep and a weekly report.'
				},
				{
					title: 'Crawl → audit → score pipeline',
					body: 'A run flips the crawl row to running, fetches pages via a polite crawler (robots.txt, sitemap discovery, llms.txt and AI-crawler-block detection), runs rule-based findings, best-effort adds PageSpeed Core Web Vitals, computes a 0–100 health score, and persists pages and issue rows.'
				},
				{
					title: 'Svelte 5 remote functions as the server API',
					body: 'Feature-co-located *.remote.ts files use $app/server query/command/form with Zod validators instead of +page.server.ts. Every tenant query scopes by organizationId and mutations gate on write access.'
				},
				{
					title: 'Drizzle schema modeling the SEO domain',
					body: 'The schema covers the multi-tenant core, site → crawl → page/issue, keyword → rank snapshots for trends, competitors, content briefs, cached analysis snapshots, and AES-256-GCM-encrypted Google OAuth tokens, with pgEnums and unique indexes enforcing per-org uniqueness.'
				}
			],
			stackWhy: [
				{ tech: 'SvelteKit + Svelte 5', why: 'Fullstack with experimental remote functions as the type-safe server API, avoiding a separate backend.' },
				{ tech: 'Drizzle + PostgreSQL', why: 'Type-safe schema whose inferred types are shared with Zod, a relational fit for the multi-tenant site/crawl/keyword model.' },
				{ tech: 'TanStack AI', why: 'Provider-agnostic so AI stays BYOK and optional, unlocked to any vendor, with Zod-schema structured output.' },
				{ tech: 'BullMQ + Redis', why: 'Durable background crawls, rank refreshes, and cron schedulers, run in-process for single-VPS simplicity but extractable to scale.' },
				{ tech: 'Zod', why: 'One Standard-Schema validator passed directly to remote functions and to AI outputSchema, validating all external input at the boundary.' },
				{ tech: 'Tailwind CSS 4', why: 'A token-driven flat design system, with the typography plugin for rendered content previews.' }
			],
			features: [
				'Automated site audit: crawl, rule-based findings, and a 0–100 health score with Core Web Vitals',
				'One-click AI fix assistant with a copy-paste fix per issue and an always-available manual fallback',
				'Keyword tracking with rank snapshots and trends from Search Console, plus daily rank sweeps',
				'Content briefs and AI draft scaffolds (title, meta, outline) targeting search intent',
				'Competitor gap analysis and internal-link analysis (orphan pages, link opportunities)',
				'Answer-engine readiness (llms.txt, AI-crawler blocking) and encrypted Google integration with weekly emails'
			],
			status: 'Active development · self-hostable (Docker + Node adapter)'
		}
	},
	{
		title: 'UtilsLab',
		slug: 'utilslab',
		description:
			'A fast, free, fully static collection of 49 calculators and tools — financial, health, math, everyday, and developer — that all run in the browser.',
		year: 2026,
		stack: ['SvelteKit', 'Svelte 5', 'Tailwind', 'TypeScript'],
		featured: false,
		order: 6,
		caseStudy: {
			summary:
				'49 single-purpose calculators and tools across five categories, driven by one declarative registry and prerendered to static HTML that runs entirely in the browser.',
			problem:
				'Everyday users and developers want quick, single-purpose utilities without accounts, ads, or sending data to a server. UtilsLab is a free collection of 49 tools — financial, health, math, everyday, and developer — where everything runs client-side and every page is prerendered for instant loads.',
			challenges: [
				{
					title: 'Scaling to 49 tools with a consistent UX',
					body: 'Hand-building 49 bespoke pages would diverge in look and behavior. A single declarative Tool model lets calculators declare fields plus a pure compute(inputs) that returns typed result widgets (stat/table/series), which one generic shell renders uniformly — adding a tool is import-and-append to the registry.'
				},
				{
					title: 'Fully client-side privacy',
					body: 'The site promises no accounts, no servers, and no data leaving your machine. All logic lives in pure, framework-agnostic engine modules run in the browser; there is no backend, and adapter-static with prerender emits only static assets.'
				},
				{
					title: 'SEO for a static tool site',
					body: 'Each tool needs a crawlable, uniquely-titled page. The [slug] route’s load returns serializable metadata used for per-page title and description tags, while entries enumerates every slug so the static adapter prerenders a real HTML file per tool.'
				},
				{
					title: 'Heavy formatter libraries without bundle bloat',
					body: 'Formatters depend on large parsers — js-beautify, terser, sql-formatter, marked. Each is loaded via dynamic import() inside the tool’s transform, so it is code-split per route and only downloaded when that tool is actually used.'
				}
			],
			implementation: [
				{
					title: 'Central tool registry and metadata',
					body: 'registry.ts imports all tool definitions and exposes them as a TOOLS array plus a by-slug map and helpers for category grouping, featured tools, and client-side search over title/description/keywords. This single catalog drives routing, navigation, search, and prerender entries.'
				},
				{
					title: 'Declarative schema with escape hatches',
					body: 'The Tool interface supports three modes: standard calculators (fields + compute), string→string text transforms with reversible inverses (e.g. minify ↔ beautify), and a custom-component escape hatch for tools that don’t fit the generic form, like the scientific calculator and unit/color converters.'
				},
				{
					title: 'Static prerendering via adapter-static',
					body: 'The layout sets prerender = true site-wide; the tool and category routes each export an entries generator derived from the registry, telling the adapter exactly which dynamic routes to emit. A route param matcher constrains /[category] to known category ids.'
				},
				{
					title: 'Shared UI and pure-logic testing',
					body: 'The shell seeds reactive $state inputs from field defaults and derives results with $derived, splitting them into stat cards and table/chart blocks via reusable result renderers. The pure engine math is isolated and covered by Vitest, with a separate Playwright browser project for component tests.'
				}
			],
			stackWhy: [
				{ tech: 'SvelteKit + Svelte 5', why: 'File-based routing with per-route prerender control, and fine-grained runes ($state/$derived) that make live-recomputing calculators trivial.' },
				{ tech: 'adapter-static', why: 'Emits pure static HTML/JS with no server — instant loads, cheap hosting anywhere, and the client-only privacy guarantee.' },
				{ tech: 'Tailwind CSS 4', why: 'One theme system drives consistent per-category colors across all 49 tools without bespoke CSS.' },
				{ tech: 'TypeScript', why: 'Typed Tool/Field/Result contracts make the declarative registry safe and self-documenting, so new tools conform at compile time.' },
				{ tech: 'Lazy formatters', why: 'Real parsers (js-beautify, terser, sql-formatter, marked) give correct output, loaded on demand so they don’t tax the base bundle.' },
				{ tech: 'Vitest + Playwright', why: 'Fast node unit tests for the pure engine math plus a browser project for real component tests.' }
			],
			features: [
				'Financial: mortgage, loan, compound interest, sales tax, ROI, savings goal — with amortization tables and charts',
				'Health & fitness: BMI, calorie, body fat, BMR, ideal weight, water intake, running pace',
				'Math: scientific calculator, percentage, fraction, quadratic solver, statistics',
				'Everyday: age, tip, discount, unit converter, color converter',
				'Developer: Base64/URL/HTML encode, JSON/CSS/JS/HTML/SQL/Markdown formatters, hash, JWT, UUID, timestamp, and more',
				'Instant client-side search, per-category theming, and reversible text tools with live recomputation'
			],
			status: 'Production-ready static build'
		}
	},
	{
		title: 'Image Optimizer',
		slug: 'image-optimizer',
		description:
			'A self-hosted image service — resize, convert, and compress on the fly from cacheable, signed URLs, with a dashboard, developer API, and one-command Docker stack.',
		year: 2026,
		stack: ['Go', 'libvips', 'S3', 'SvelteKit'],
		featured: true,
		order: 2,
		caseStudy: {
			summary:
				'An imgix/Cloudinary-style image service in a single Go binary — on-the-fly resize/convert/compress, HMAC-signed URLs, a three-tier cache, and objective quality metrics.',
			problem:
				'Developers and teams want a Cloudinary-style workflow — modern formats, responsive picture sets, colour-accurate output — without a SaaS bill or vendor lock-in. Image Optimizer runs as one Go binary plus a one-command Docker stack, distinguished by real colour management and objective, measured quality on every result.',
			challenges: [
				{
					title: 'On-the-fly transforms without re-processing',
					body: 'Rendering a variant per request would re-run libvips constantly. Each unique variant is built exactly once and reused across a three-tier cache (CDN → in-memory LRU → persistent tier-2); concurrent requests for the same variant are coalesced with singleflight, and arbitrary widths snap to a fixed ladder to keep the cache-key space small.'
				},
				{
					title: 'Tamper-proof signed URLs',
					body: 'An unsigned on-the-fly endpoint can be abused to mint unlimited unique variants and force an expensive encode each time. URLs are signed with HMAC-SHA256 over the path plus a canonical, sorted query (so parameter order never matters), with an optional expiry folded into the signed material and constant-time verification that fails closed.'
				},
				{
					title: 'Bounding libvips CPU and memory',
					body: 'govips is cgo over native libvips, so unbounded concurrency risks resource exhaustion. libvips starts once with a small operation cache and per-op concurrency of 1, a buffered semaphore caps simultaneous encodes, and uploads are capped to bound per-request memory.'
				},
				{
					title: 'Colour fidelity over naive pipelines',
					body: 'Most pipelines assume sRGB and shift wide-gamut colours. The pipeline applies EXIF auto-orientation, then converts any embedded ICC profile (Adobe RGB, P3, CMYK) to sRGB before resize/encode; an inspect endpoint quantifies the difference by reporting mean ΔE between managed and profile-ignored renders.'
				}
			],
			implementation: [
				{
					title: 'Shared vips transform pipeline',
					body: 'The core package runs decode → auto-rotate → ICC→sRGB → resize/fit → encode, mapping fit modes to libvips crop strategies (centre, content-aware attention, or no-upscale contain) and encoding AVIF/WebP/progressive JPEG/PNG with metadata stripped. It is free of HTTP/storage concerns, so both the server and the batch worker reuse it.'
				},
				{
					title: 'Visually-lossless AutoQuality',
					body: 'AutoQuality binary-searches encoder quality for the smallest file whose SSIM versus the reference stays at or above a target (default 0.99). SSIM/PSNR/RMSE/ΔE are implemented in pure Go, so every result carries objective quality metrics.'
				},
				{
					title: 'Tiered cache and storage abstraction',
					body: 'A byte-bounded, goroutine-safe LRU fronts a tier-2 Store interface with disk (sharded gob files, atomic writes) and S3 implementations, while masters sit behind a separate interface. loadOrBuild walks memory → tier-2 → build and reports the serving tier via an X-Cache header.'
				},
				{
					title: 'Signed delivery and responsive generation',
					body: 'The delivery endpoint negotiates format from Accept, sets immutable cache headers with ETag/304 support, and never serves a re-encode larger than the source. Companion endpoints publish a signed (optionally time-boxed) URL and emit signed srcset URLs across the width ladder for ready-to-paste picture markup.'
				},
				{
					title: 'Developer API and Docker/CDN stack',
					body: 'Routing uses Go 1.22+ ServeMux method+wildcard patterns; a file-backed, hashed API-key store and token-bucket rate limiting (per key or IP) protect the API. Docker Compose wires nginx (CDN cache) → app → MinIO, auto-creating the bucket as storage boots.'
				}
			],
			stackWhy: [
				{ tech: 'Go', why: 'A single static binary serves UI, API, and delivery, with concurrency primitives (singleflight, semaphores, rate limiting) the caching design leans on directly.' },
				{ tech: 'libvips (govips)', why: 'A streaming, low-memory image engine with a fast thumbnail op, attention-based smart crop, and proper ICC handling — the features the product is built around.' },
				{ tech: 'S3 SDK v2', why: 'One S3-compatible client covers AWS, MinIO, and GCS for both masters and the shared tier-2 variant cache.' },
				{ tech: 'SvelteKit', why: 'Compiles to a static SPA the Go binary serves directly, giving a rich playground/dashboard with no separate Node runtime in production.' },
				{ tech: 'Docker Compose', why: 'Delivers the whole CDN → app → storage topology as one command, so the caching architecture is reproducible and production-shaped.' }
			],
			features: [
				'AVIF/WebP/JPEG/PNG with Accept-based content negotiation',
				'Content-aware smart crop and EXIF auto-orientation',
				'ICC→sRGB colour management with a ΔE inspector',
				'Visually-lossless auto-quality with SSIM/PSNR/RMSE/ΔE metrics',
				'HMAC-signed, optionally time-boxed URLs with immutable caching and 304s',
				'Responsive picture/srcset generation, LQIP placeholders, batch processing, and a keyed developer API'
			],
			status: 'Self-hostable reference implementation'
		}
	},
	{
		title: 'Livestreams',
		slug: 'livestreams',
		description:
			'A self-hosted live-streaming platform — go live over RTMP, SRT, or the browser, with automatic adaptive-quality playback, recording, and one-click restreaming to YouTube and Twitch.',
		year: 2026,
		stack: ['Go', 'ffmpeg', 'PostgreSQL', 'HLS'],
		featured: true,
		order: 1,
		caseStudy: {
			summary:
				'A self-hostable live-video platform — multi-protocol go-live, adaptive-quality playback, crash-safe recording, and one-click restreaming — that you own instead of renting from Mux or Livepeer.',
			problem:
				'Self-hosters and small teams want to own their live-streaming platform instead of paying a managed provider like Mux or Livepeer. Livestreams lets creators go live over RTMP, SRT, or straight from the browser, then automatically transcodes to adaptive quality, records every session, and restreams to third-party platforms — all self-hosted, driving a clean dashboard.',
			challenges: [
				{
					title: 'Multi-protocol ingest without trusting the client',
					body: 'SRS terminates RTMP/SRT and bridges browser WebRTC→RTMP, but authorization is driven by the app rather than SRS. SRS posts on_publish/on_unpublish/on_hls hooks to internal endpoints guarded by a shared secret, which validate the per-stream ingest key against Postgres; for WHIP the key never leaves the server via a same-origin proxy.'
				},
				{
					title: 'Adaptive-bitrate HLS transcoding with ffmpeg',
					body: 'A builder programmatically assembles the ffmpeg argument vector for a 3-rung ABR ladder (720p/480p/360p) using the split + scale + var_stream_map pattern with aligned GOPs. The same builder serves live (event playlist) and VOD (seekable), and omits audio maps when the source has no audio stream.'
				},
				{
					title: 'Long-running media jobs vs a request/response API',
					body: 'ffmpeg processes run for the whole session — incompatible with a short HTTP request. The system splits into an API binary and a worker binary coordinated through the River Postgres-backed queue; live workers override the default timeout to run until the publisher disconnects, and an 8s read-timeout prevents jobs hanging on RTMP inputs that don’t EOF cleanly.'
				},
				{
					title: 'Recording that survives an abrupt kill',
					body: 'Because the read-timeout kills ffmpeg mid-write, no normal MP4 trailer is written, so recordings are muxed as fragmented MP4 (frag_keyframe + empty_moov) and stay valid even when terminated. Header-only fragments under 64 KiB are skipped rather than saved as broken files, and valid recordings are uploaded and registered as assets with a thumbnail and seek-preview storyboard.'
				}
			],
			implementation: [
				{
					title: 'API / worker split over a shared River queue',
					body: 'The API wires an insert-only River client behind an Enqueuer interface so handlers never import River directly, while the worker registers the executors: live transcode+recording, restream, VOD, clip, Whisper captions, and webhook delivery. Restream jobs return their River job id so a go-live-off toggle can cancel the running relay.'
				},
				{
					title: 'ffmpeg pipeline with live progress telemetry',
					body: 'VOD and clip jobs run ffmpeg with -progress pipe:1, parse each block into frame/fps/speed/bitrate/percent, and stream throttled telemetry and log lines over SSE, persisting logs so the timeline survives the job. The restream worker is a pure -c copy passthrough to an external RTMP/RTMPS target, decrypting the destination key on the fly.'
				},
				{
					title: 'HLS output and object storage',
					body: 'Workers write the ABR tree to a local HLS dir served as a dev origin (CDN-fronted in prod), with on-the-fly playlist rewriting that appends a signed token to every child URI for protected content. Recordings, VOD, clips, thumbnails, and captions go to MinIO/S3 through a small storage interface, read back via presigned URLs so ffmpeg streams directly from object storage.'
				},
				{
					title: 'Versioned REST API on chi',
					body: 'Everything sits under /v1 with layered chi middleware (request id, real IP, recoverer, CORS, timeout). Auth accepts JWT and lsk_ API keys, with a separate query-token path so EventSource can authorize SSE; public and rate-limited auth routes are grouped distinctly from the authenticated surface.'
				},
				{
					title: 'Real-time events and GeoIP analytics',
					body: 'Every pipeline step is persisted to stream_events and published to Redis pub/sub, fanned out to dashboards over SSE and to dispatchers for signed webhooks and notifications. Viewer QoS beacons feed analytics, and a GeoIP resolver degrades to a no-op when no MaxMind DB is configured.'
				}
			],
			stackWhy: [
				{ tech: 'Go', why: 'One module builds both the API and worker binaries; goroutines and exec.CommandContext fit supervising long-lived ffmpeg processes with clean cancellation.' },
				{ tech: 'chi', why: 'A lightweight net/http router whose composable middleware groups let header-auth, SSE query-token auth, rate-limited, and secret-guarded routes coexist in one tree.' },
				{ tech: 'PostgreSQL (pgx + sqlc)', why: 'The single source of truth, with sqlc generating type-safe queries and goose handling migrations.' },
				{ tech: 'River', why: 'Durable background jobs on the same Postgres — no extra broker — with per-job timeout overrides, retry/backoff for webhooks, and cancellation to stop live relays.' },
				{ tech: 'ffmpeg / SRS', why: 'SRS handles multi-protocol ingest and WebRTC→RTMP bridging with HTTP hooks for auth; ffmpeg does the ABR transcode, recording, clipping, and restreaming.' },
				{ tech: 'Redis', why: 'A low-latency pub/sub carrying stream and transcode-progress events, fanned out to SSE clients and webhook/notification dispatchers.' }
			],
			features: [
				'RTMP/SRT ingest with per-stream keys and publish hooks, plus browser go-live over WebRTC/WHIP',
				'Automatic adaptive HLS (720p/480p/360p) from a built-in, CDN-frontable origin with signed-token playback',
				'Crash-safe fragmented-MP4 recording, VOD upload/transcode, and clip cutting with thumbnails and storyboards',
				'Restream/simulcast to YouTube/Twitch/any RTMP target with OAuth account linking',
				'Live transcode progress and activity timeline over SSE, plus QoS and GeoIP analytics',
				'Multi-tenant orgs with roles, JWT + API keys, signed webhooks with redelivery, and Whisper auto-captions'
			],
			status: 'Advanced work-in-progress · deployment-ready'
		}
	}
];
