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
					body: 'Counting unique visitors normally means a cookie or a device fingerprint — both of which the privacy promise rules out, and both of which treat raw IP and user-agent as personal data. Instead, a visitor is identified by a one-way hash derived from their IP, user-agent, and the site domain, salted with a value that rotates every day. The IP and UA are used only long enough to compute location and device, then discarded. Because the salt changes daily the same person cannot be linked across days, and folding in the domain stops any visitor being tracked from one site to another.'
				},
				{
					title: 'High-volume events with instant aggregate reads',
					body: 'Analytics is write-heavy but read-latency-sensitive: millions of raw events must ingest cheaply, yet a dashboard has to answer "visitors this month" instantly. The event store is a columnar OLAP database that compresses repetitive fields aggressively and enforces a retention ceiling, and the counts that dashboards ask for most — pageviews and unique visitors per day — are continuously pre-aggregated into daily rollups so common date ranges never scan the raw table at all.'
				},
				{
					title: 'A sub-1KB tracker that still handles SPAs',
					body: 'A tracking script that bloats a customer\'s page defeats the "fast" selling point, so the embeddable snippet is held under 1KB by a build-time size budget that fails the build if it regresses. It sends data with the browser\'s beacon API (falling back to a keep-alive request), hooks into client-side navigation so single-page apps still register each route change as a pageview, respects Do Not Track, and posts to a deliberately neutral endpoint path so ad-blockers don\'t flag it.'
				},
				{
					title: 'Per-tenant quota enforcement at ingest speed',
					body: 'Every incoming event has to be attributed to a paying tenant and checked against a monthly plan limit — without a database round-trip slowing the hot path. Domain-to-tenant lookups and month-to-date counters are held in memory, seeded once from the transactional database and reconciled back as periodic deltas, so the limit check is effectively free per request. Over-limit traffic can be handled softly (still recorded) or blocked, depending on plan.'
				}
			],
			implementation: [
				{
					title: 'Decoupled ingest path',
					body: 'The collection endpoint accepts and acknowledges every beacon immediately — it never reveals which requests were filtered as bots — then validates, attributes the event, and hands it to a background writer. That writer batches rows and flushes them by size or time interval, and deliberately drops (and counts) events if the store falls behind, so a slow or stalled database can never add latency to the visitor-facing request.'
				},
				{
					title: 'Safe, fast query layer',
					body: 'Dashboard filters are constrained to a known set of dimensions and every value is passed as a bound query parameter, so no user input is ever concatenated into SQL. Unfiltered day-level ranges are answered from the pre-aggregated rollups; hourly or filtered views fall back to the raw events, with gaps in the time series zero-filled so charts stay continuous.'
				},
				{
					title: 'Auth and tenancy',
					body: 'Login sessions keep a high-entropy token on the client but store only its hash on the server, so a database leak exposes no usable sessions; expiry slides on activity and passwords use a memory-hard hash. Signing up provisions the user, their first organization, and ownership in a single transaction, and every subsequent query is scoped to an organization — cross-tenant access simply returns "not found".'
				},
				{
					title: 'Provider-agnostic billing',
					body: 'Payments sit behind a single interface with a real gateway adapter (cards plus local mobile wallets) and a mock adapter for development. Return-from-gateway callbacks are handled idempotently, so a duplicated or replayed callback can\'t double-charge or double-activate, and a card can be tokenized for automatic renewal.'
				}
			],
			stackWhy: [
				{ tech: 'Go', why: 'Lightweight concurrency makes the write-heavy, drop-under-load ingest endpoint natural to build, and it ships as a single dependency-free binary that is trivial to self-host.' },
				{ tech: 'ClickHouse', why: 'A columnar analytics database: high-volume events compress well and aggregate queries over millions of rows stay fast, with continuously-maintained rollups for time series.' },
				{ tech: 'PostgreSQL', why: 'The transactional source of truth for users, organizations, sites, subscriptions, and usage — the data that needs referential integrity and correctness over raw speed.' },
				{ tech: 'SvelteKit', why: 'One server-rendered app spans the dashboard, marketing site, auth, billing, and read API, deployable as a Node service for self-hosting.' },
				{ tech: 'esbuild', why: 'Bundles and minifies the tracking script down to its sub-1KB budget, enforced automatically at build time.' },
				{ tech: 'Turborepo', why: 'A monorepo so one schema change can update the analytics store, the ingest code, and the typed query layer in a single commit.' }
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
					title: 'Making screen-recording permission painless',
					body: "macOS Screen Recording permission is notoriously awkward — it typically forces users to quit and relaunch the app before capture works. SnapKeep triggers the system permission prompt at the right moment on launch and then re-checks authorization every time it comes back to the foreground, so returning from System Settings picks up the newly-granted permission automatically, with no manual restart."
				},
				{
					title: 'Low-latency recording and real-time encoding',
					body: "Screen frames arrive continuously on a background thread and must be encoded to video without ever blocking the UI or dropping behind real time. The recording engine runs entirely off the main thread on its own synchronized queue and deals with the real constraints of hardware H.264 — dimensions rounded to even numbers, a real-time encoding budget, a bounded backlog, and starting the video timeline from the first captured frame before audio is mixed in."
				},
				{
					title: 'One annotation model, identical on screen and export',
					body: 'Every markup tool — pen, marker, arrow, shapes, text, numbered steps, pixelate — is described by a single data model with one shared drawing routine used both for the live editing canvas and the final exported image, guaranteeing what you see is exactly what you save. Pixelate redaction carefully maps between on-screen coordinates and the image\'s true pixel grid so a redacted region can be cropped, downscaled, and re-enlarged into a solid mosaic that can\'t be reversed.'
				},
				{
					title: 'Fully offline OCR and a menubar-only lifecycle',
					body: "Copy-Text extracts text from any capture using Apple's on-device text recognition — no image ever leaves the machine — and reorders the results to match natural reading order. The app lives entirely in the menu bar with no Dock icon, allows only one running instance, and registers truly system-wide keyboard shortcuts so capture fires no matter which app currently has focus."
				}
			],
			implementation: [
				{
					title: 'Concurrency-safe capture pipeline',
					body: "Capture is isolated behind Swift's strict-concurrency model so it can run off the main thread safely. It supports full-display capture that follows the active screen, single-window capture that stays with a window regardless of what's in front of it, and region capture that automatically excludes SnapKeep's own overlay windows from the shot."
				},
				{
					title: 'Video and GIF export',
					body: 'Recordings are written as H.264 MP4 with optional AAC audio, and any finished clip can be re-exported as a looping animated GIF by sampling its frames. A post-recording studio adds preview, trim, automatic silence detection, and on-device speech-to-text captioning.'
				},
				{
					title: 'Database-free local storage',
					body: 'Captures are saved as timestamped PNG/JPEG files in the user\'s Pictures folder and copied to the clipboard immediately. The history view is simply the newest files read back from that folder — there is no database and no network, which keeps the "everything stays on your Mac" promise honest and the storage format completely transparent.'
				},
				{
					title: 'Reproducible builds and one-click distribution',
					body: 'The Xcode project is generated from a declarative spec so it can be recreated cleanly on any machine (Swift 6, hardened runtime, Apple silicon, macOS 14+). Pushing a version tag runs a CI workflow that builds a signed disk image and publishes a GitHub Release. The build isn\'t Apple-notarized yet, so the docs walk users through clearing the quarantine flag on first launch.'
				}
			],
			stackWhy: [
				{ tech: 'Swift 6', why: 'Its compile-time concurrency checking makes the off-main-thread capture and recording pipeline provably data-race-free rather than hopefully so.' },
				{ tech: 'SwiftUI + AppKit', why: 'SwiftUI drives the menu-bar UI and reactive state; AppKit and Core Graphics handle the low-level window and pixel work SwiftUI alone can\'t reach.' },
				{ tech: 'ScreenCaptureKit', why: "Apple's modern capture framework, providing both high-quality stills and live video with the ability to exclude specific windows or apps from a capture." },
				{ tech: 'Vision', why: "On-device text recognition powers Copy-Text with zero network dependency, matching the fully-offline promise." },
				{ tech: 'AVFoundation', why: 'Handles the video encoding, audio, and frame sampling behind MP4 recording and GIF export.' },
				{ tech: 'Global hotkeys', why: 'System-level shortcut registration is the only reliable way to trigger capture regardless of which application is focused.' }
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
					body: 'AI is bring-your-own-key and can never become a hard dependency — the entire product has to remain fully usable with no AI configured at all. A single abstraction picks whichever provider (OpenAI, Anthropic, Gemini, or a local model) is set purely from environment, every AI-powered feature is gated behind a "is AI configured?" check, and the local-model path is treated as keyless so users can run it for free.'
				},
				{
					title: 'Keeping AI output structured and reliable',
					body: 'Generated fixes and content drafts have to render as real UI, not a wall of chat text. Each AI request is given a strict schema the model must fill, so responses come back as validated, typed data rather than prose, and the prompts explicitly forbid jargon and inventing facts about the user\'s business — because the audience is beginners who can\'t tell a hallucination from a real recommendation.'
				},
				{
					title: 'Background crawling without a separate infra tier',
					body: 'Site crawls, daily rank checks, and weekly reports are long-running and scheduled — the kind of work that usually needs a dedicated job server. Here the job workers run inside the same process as the web app, so a single small VPS handles both, guarded against accidentally starting twice during development and degrading gracefully to in-process crawling when no queue backend is available.'
				},
				{
					title: 'Teaching beginners, decoupled from AI',
					body: 'Every issue the audit can find ships with hand-written, plain-language guidance — what it is, why it matters, how to fix it, how hard it is, and how much impact it has. This teaching content always works, with or without AI. When AI is configured it layers a tailored, copy-paste-ready fix on top; when it isn\'t, the manual steps stand on their own.'
				}
			],
			implementation: [
				{
					title: 'Pluggable AI layer with structured output',
					body: 'A small factory returns the configured provider\'s client, and the draft- and fix-generation features both request a schema-constrained response, so what comes back is already parsed and validated against the shape the UI expects — no fragile text-parsing of model output.'
				},
				{
					title: 'Scheduled background job pipeline',
					body: 'Three job types — crawls, rank refreshes, and report generation — run on a shared queue backed by an in-memory store. Recurring work is registered once at startup on cron schedules (a daily rank sweep, a weekly report) in a way that\'s safe to run repeatedly without piling up duplicates.'
				},
				{
					title: 'Crawl → audit → score pipeline',
					body: 'A run marks itself in-progress, fetches pages with a well-behaved crawler (respecting robots rules, discovering the sitemap, and detecting answer-engine signals like AI-crawler policies), applies a battery of rule-based checks, best-effort layers in Core Web Vitals field data, computes a 0–100 health score, and stores the pages and issues it found.'
				},
				{
					title: 'Type-safe server API',
					body: 'The server API is built from feature-co-located endpoints validated at the boundary, rather than scattered controllers. Every query is scoped to the caller\'s organization and every mutation checks write permission first, so multi-tenant isolation is enforced consistently by construction.'
				},
				{
					title: 'A schema modeling the whole SEO domain',
					body: 'The database schema captures the full domain: the multi-tenant core, the site → crawl → page/issue hierarchy, keywords with historical rank snapshots for trend charts, competitors, content briefs, cached analysis, and Google account tokens stored encrypted at rest — with database-level constraints enforcing per-organization uniqueness.'
				}
			],
			stackWhy: [
				{ tech: 'SvelteKit + Svelte 5', why: 'A single full-stack app with a type-safe server API, so there\'s no separate backend service to build and deploy.' },
				{ tech: 'Drizzle + PostgreSQL', why: 'A type-safe schema whose types flow straight into validation, and a relational model that fits the site/crawl/keyword hierarchy naturally.' },
				{ tech: 'TanStack AI', why: 'A provider-agnostic AI layer, which is what lets AI stay bring-your-own-key, optional, and swappable between vendors with schema-validated output.' },
				{ tech: 'BullMQ + Redis', why: 'Durable background crawls, rank refreshes, and schedulers — run in-process for single-VPS simplicity, but able to be split out to scale later.' },
				{ tech: 'Zod', why: 'One validator guards every external input — API requests and AI responses alike — so bad data is rejected at the edge.' },
				{ tech: 'Tailwind CSS 4', why: 'A token-driven design system for a consistent flat UI, with rich typography for the rendered content previews.' }
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
					body: 'Hand-building 49 bespoke pages would inevitably drift apart in look and behavior and become a maintenance burden. Instead, every tool is described declaratively — its input fields plus a pure function that turns those inputs into typed result widgets (a stat, a table, a chart series) — and one generic shell renders them all uniformly. Adding a tool is a matter of describing it and dropping it into the catalog, not building another page.'
				},
				{
					title: 'Fully client-side privacy',
					body: 'The promise is no accounts, no servers, and nothing leaving your machine. Every calculation lives in pure, framework-independent logic modules that run in the browser; there is no backend to send data to, and the whole site is prerendered to static files, so there is nowhere for user input to go even in principle.'
				},
				{
					title: 'SEO for a static tool site',
					body: 'For people to discover these tools on Google, each one needs its own crawlable page with a unique title and description. The build enumerates every tool and emits a real, individually-titled HTML file per tool ahead of time, so search engines index 49 distinct landing pages rather than one JavaScript shell.'
				},
				{
					title: 'Heavy formatter libraries without bundle bloat',
					body: "The developer formatters lean on genuinely large parsing libraries. If they all shipped up front, the whole site would load slowly for someone who only wanted a tip calculator. Each heavy library is instead loaded on demand, the first time its tool is actually opened, so the base download stays tiny and users only pay for what they use."
				}
			],
			implementation: [
				{
					title: 'Central tool registry',
					body: 'A single catalog collects every tool definition and exposes helpers for grouping by category, surfacing featured tools, and instant client-side search across titles, descriptions, and keywords. That one catalog is the source of truth that drives routing, navigation, search, and which pages get prerendered.'
				},
				{
					title: 'Declarative schema with escape hatches',
					body: 'A tool can be described three ways: a standard calculator (input fields plus a compute function), a reversible text transform (e.g. minify ↔ beautify), or — for the handful that don\'t fit a form, like the scientific calculator and the unit and color converters — a fully custom component. The common cases stay effortless without boxing in the exceptions.'
				},
				{
					title: 'Static prerendering',
					body: 'The entire site is prerendered ahead of time. The tool and category routes each derive their full list of pages from the central catalog, telling the build exactly what to generate, and category URLs are constrained to the known set of categories so invalid paths never render.'
				},
				{
					title: 'Shared UI and pure-logic testing',
					body: 'The shared shell seeds each tool\'s inputs from its declared defaults and recomputes results reactively as the user types, splitting the output into stat cards and table/chart blocks with reusable renderers. Because the calculation logic is pure and separated from the UI, it\'s covered by fast unit tests, with a separate browser test suite for the components.'
				}
			],
			stackWhy: [
				{ tech: 'SvelteKit + Svelte 5', why: 'File-based routing with per-page prerender control, plus fine-grained reactivity that makes live-recomputing calculators trivial to build.' },
				{ tech: 'adapter-static', why: 'Emits pure static HTML/JS with no server: instant loads, hosting that\'s cheap anywhere, and a client-only privacy guarantee that\'s structural rather than promised.' },
				{ tech: 'Tailwind CSS 4', why: 'One theme system gives all 49 tools consistent per-category theming without hand-written CSS per page.' },
				{ tech: 'TypeScript', why: 'Typed contracts for tools, fields, and results make the declarative catalog safe and self-documenting, so a new tool has to conform to compile.' },
				{ tech: 'On-demand formatters', why: 'Real parsing libraries give correct output for the developer tools, loaded lazily so they never weigh down the base bundle.' },
				{ tech: 'Vitest + Playwright', why: 'Fast unit tests for the pure calculation logic, plus a browser suite for the interactive components.' }
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
					body: 'Generating an image variant on every request would burn CPU re-encoding the same thing over and over. Each unique variant is built exactly once and then served from a three-tier cache (CDN in front, an in-memory cache, and a persistent store behind it). When many requests ask for the same not-yet-built variant at once, they\'re collapsed into a single build instead of a stampede, and requested widths snap to a fixed ladder so the number of distinct variants — and cache entries — stays bounded.'
				},
				{
					title: 'Tamper-proof signed URLs',
					body: 'An open image-transform endpoint is an abuse magnet: anyone could request endless one-off variants and force an expensive encode each time. Every delivery URL is therefore cryptographically signed over its path and parameters, with parameter order normalized so equivalent URLs verify identically, an optional expiry baked into the signature, and constant-time verification that rejects anything unsigned or altered.'
				},
				{
					title: 'Bounding image-engine CPU and memory',
					body: 'The underlying image library is powerful but native and memory-hungry, so unbounded concurrency could exhaust the machine. Simultaneous encodes are capped by a semaphore, the engine is configured for predictable low-memory operation, and upload sizes are limited, keeping the service stable under load rather than letting a burst of large images take it down.'
				},
				{
					title: 'Colour fidelity over naive pipelines',
					body: 'Most image pipelines assume every image is plain sRGB and silently shift the colours of anything wider-gamut. This one reads each image\'s embedded colour profile (Adobe RGB, Display P3, CMYK) and converts it correctly to sRGB before resizing or encoding, and it fixes orientation from photo metadata. An inspection endpoint even quantifies the difference, reporting how far a naive, profile-ignoring render drifts from the colour-managed one.'
				}
			],
			implementation: [
				{
					title: 'Shared transform pipeline',
					body: 'A single core routine runs the full sequence — decode, auto-rotate, colour-convert, resize and fit, encode — offering multiple fit strategies (centre crop, content-aware crop, or contain without upscaling) and modern output formats with metadata stripped. It knows nothing about HTTP or storage, so both the live server and the batch processor reuse exactly the same code.'
				},
				{
					title: 'Visually-lossless auto-quality',
					body: 'Rather than picking a fixed quality number, the encoder searches for the smallest file whose visual similarity to the original stays above a chosen threshold. The similarity and error metrics are computed directly, so every result carries objective, measured quality figures rather than a guess.'
				},
				{
					title: 'Tiered cache and storage abstraction',
					body: 'A size-bounded in-memory cache sits in front of a pluggable persistent store, with local-disk and S3-compatible implementations behind one interface, and original images stored separately. A lookup walks memory, then the persistent tier, then builds on miss — and every response reports which tier served it, so cache behaviour is observable.'
				},
				{
					title: 'Signed delivery and responsive generation',
					body: 'The delivery endpoint picks the best format the browser accepts, sets long-lived immutable caching with proper revalidation, and never returns a re-encode larger than the source. Companion endpoints hand back a signed (optionally time-limited) URL and a full set of signed URLs across the width ladder, ready to paste straight into responsive image markup.'
				},
				{
					title: 'Developer API and self-hosting stack',
					body: 'A keyed developer API is protected by hashed API keys and rate limiting per key or per IP. A one-command container stack wires a CDN cache in front of the app in front of object storage, provisioning the storage bucket automatically on boot, so the whole production-shaped topology runs locally exactly as it would in production.'
				}
			],
			stackWhy: [
				{ tech: 'Go', why: 'A single static binary serves the UI, API, and image delivery, and its concurrency tools are what the request-coalescing, rate-limiting caching design is built on.' },
				{ tech: 'libvips', why: 'A streaming, low-memory image engine with fast thumbnailing, content-aware cropping, and proper colour-profile handling — the exact capabilities the product is built around.' },
				{ tech: 'S3-compatible storage', why: 'One storage client covers AWS, self-hosted MinIO, and other providers, for both originals and the shared variant cache.' },
				{ tech: 'SvelteKit', why: 'Compiles to a static dashboard and playground the Go binary serves directly — a rich UI with no separate runtime in production.' },
				{ tech: 'Docker Compose', why: 'Ships the whole CDN → app → storage topology as a single command, so the caching architecture is reproducible and production-shaped from the first run.' }
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
					body: 'A dedicated media server accepts the incoming feed over RTMP, SRT, or browser WebRTC, but the decision of whether a given stream is allowed to publish belongs to the app, not the media server. The media server calls back into private, secret-guarded endpoints as a stream starts and stops, and those endpoints validate the stream\'s ingest key against the database. For browser publishing, the ingest key never reaches the client at all — it\'s injected by a same-origin server proxy.'
				},
				{
					title: 'Adaptive-bitrate transcoding',
					body: 'To keep playback smooth on any connection, each live feed is transcoded into a three-rung quality ladder (720p/480p/360p) whose segments are aligned so players can switch rungs seamlessly. The same transcode configuration drives both live playback and the seekable video-on-demand recording, and it adapts automatically to sources that carry no audio track.'
				},
				{
					title: 'Long-running media jobs vs a request/response API',
					body: 'A transcode runs for the entire length of a broadcast — completely at odds with a short-lived HTTP request. The system is split into an API service and a separate worker service, coordinated through a durable job queue. Live transcode jobs are allowed to run open-endedly until the broadcaster disconnects, with a read timeout that prevents a job from hanging forever on an input stream that never cleanly ends.'
				},
				{
					title: 'Recording that survives an abrupt kill',
					body: 'Because a live recording is often terminated mid-write when the broadcaster drops, a normal video file — which only becomes valid once its closing index is written — would be left corrupt. Recordings are instead written in a fragmented format that stays playable even if the process is killed at any moment. Truncated, content-free fragments are discarded rather than saved as broken files, and every valid recording is stored as an asset with a thumbnail and a scrubbing preview.'
				}
			],
			implementation: [
				{
					title: 'API / worker split over a shared job queue',
					body: 'The API only ever enqueues work, behind an abstraction so request handlers never couple to the queue directly, while the worker service owns the actual executors: live transcode-and-record, restreaming, video-on-demand processing, clipping, auto-captioning, and webhook delivery. A restream job reports back its handle so toggling "go live off" can cancel the running relay cleanly.'
				},
				{
					title: 'Live progress telemetry',
					body: 'Processing jobs stream their progress — frames, speed, bitrate, percentage — and their logs to the dashboard in real time over a live event channel, with logs persisted so the activity timeline survives even after the job ends. Restreaming is a pure passthrough relay to an external target such as YouTube or Twitch, decrypting the destination credentials only in memory as it connects.'
				},
				{
					title: 'Adaptive playback and object storage',
					body: 'Workers write the quality-ladder output to an origin that a CDN sits in front of in production, and for protected streams every segment URL is rewritten on the fly to carry a signed access token. Recordings, clips, thumbnails, and captions all go to S3-compatible object storage behind a small interface, read back through pre-signed URLs so the media tools can stream directly from storage.'
				},
				{
					title: 'Versioned, layered API',
					body: 'The whole surface is versioned and wrapped in composable middleware for request tracing, recovery, CORS, and timeouts. It authenticates both session tokens and API keys, with a separate token-in-query path so the browser\'s live-event connections can authenticate too, and cleanly separates public and rate-limited auth routes from the authenticated surface.'
				},
				{
					title: 'Real-time events and geo analytics',
					body: 'Every step of the pipeline is recorded and published on a low-latency message bus, fanned out both to dashboards in real time and to dispatchers that deliver signed webhooks and notifications. Viewer quality-of-service beacons feed analytics, and location lookup degrades gracefully to a no-op when no geo database is configured, so the feature is optional rather than required.'
				}
			],
			stackWhy: [
				{ tech: 'Go', why: 'One codebase builds both the API and worker services, and its process control and concurrency tools are a natural fit for supervising long-lived transcode processes with clean cancellation.' },
				{ tech: 'chi', why: 'A lightweight HTTP router whose composable middleware lets session-auth, event-stream auth, rate-limited, and secret-guarded routes all coexist in one clear tree.' },
				{ tech: 'PostgreSQL', why: 'The single source of truth, with type-safe generated queries and managed schema migrations.' },
				{ tech: 'River', why: 'Durable background jobs living in the same database — no extra message broker to run — with open-ended timeouts for live work, retries for webhooks, and cancellation to stop live relays on demand.' },
				{ tech: 'ffmpeg / SRS', why: 'The media server handles multi-protocol ingest and browser-to-RTMP bridging with hooks for authorization; ffmpeg does the adaptive transcode, recording, clipping, and restreaming.' },
				{ tech: 'Redis', why: 'A low-latency message bus carrying stream and progress events, fanned out to live dashboard connections and to webhook and notification dispatchers.' }
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
