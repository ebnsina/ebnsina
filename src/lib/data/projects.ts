import type { IconName } from '$lib/components/Icon.svelte';

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
	/** Glyph shown on the project card. */
	icon: IconName;
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
		title: 'Alchemist',
		slug: 'alchemist',
		icon: 'film',
		description:
			'Video transcoding and delivery. Upload once and get an adaptive stream that plays on any phone, on any connection, with signed playback and per-minute billing.',
		year: 2026,
		stack: ['Go', 'ffmpeg', 'PostgreSQL', 'ClickHouse', 'S3'],
		featured: true,
		order: 1,
		caseStudy: {
			summary:
				'A video platform that turns one upload into an adaptive-bitrate stream, encodes in parallel without visible seams, and only spends compute on the renditions people actually watch.',
			problem:
				'Course creators, publishers and product teams in Bangladesh need video that starts fast on a cheap phone over a patchy mobile connection, and they pay for every minute of encoding and every gigabyte served. Alchemist takes a single upload and produces an adaptive stream that starts at the smallest size and climbs as the connection allows, with playback links that expire and a library that is protected from casual copying.',
			challenges: [
				{
					title: 'Parallel encoding without quality seams',
					body: 'Splitting a long video into chunks is the only way to encode it quickly, but chunks encoded independently tend to pump: the quality visibly jumps at every boundary. Each chunk is encoded with constant-quality rate control capped by a buffer limit, never per-chunk average bitrate, on a fixed two-second keyframe interval shared by every rendition with scene-cut keyframes disabled. Because every rendition lines up on the same boundaries, chunks stitch back together and players switch sizes mid-stream without a re-encode.'
				},
				{
					title: 'Only paying to encode what gets watched',
					body: 'Encoding every size up front wastes compute on renditions nobody requests. Encoding ladders are data rather than code, and the default mobile ladder encodes its smallest sizes immediately while the higher ones are deferred: the first request for them queues the work, deduplicated so a thousand viewers trigger one encode. The tradeoff is that the high-quality master has to be kept for as long as the video exists.'
				},
				{
					title: 'Protecting a library without real DRM',
					body: 'Customers selling courses need more than an unguessable URL. Segments are encrypted with common encryption and a key licence, with the opening seconds left in the clear so playback starts without waiting on the licence. Links can be bound to a single viewer and a watermark label, with a per-viewer device cap and origin locking on top. It is honest encryption, not studio DRM, and the documentation says so.'
				},
				{
					title: 'Importing whole libraries safely',
					body: 'Moving to a new host means pulling hundreds of videos from wherever they live now. Import accepts a URL, a CSV, another hosting provider or a customer’s own bucket. Because fetching arbitrary URLs from inside the network is a classic server-side request forgery hole, every fetch is checked against private address ranges and re-checked after each redirect.'
				}
			],
			implementation: [
				{
					title: 'Chunked pipeline on a job queue',
					body: 'Upload, probe, split, encode, package and publish are separate background jobs, so a crash resumes at the failed stage instead of starting over. Each chunk encode gets one thread, and concurrency follows the container’s real CPU limit rather than the host’s core count.'
				},
				{
					title: 'Viewer analytics off the playback path',
					body: 'Player heartbeats land in a columnar analytics store through a buffered, non-blocking batch writer that drops rows rather than ever slowing a viewer down. Since that store has no row-level security, every query goes through one place that always scopes by organisation.'
				},
				{
					title: 'Stable identities for changing files',
					body: 'A video can have its file replaced, be trimmed in the built-in studio, or gain captions and chapters while its id, embed code and analytics stay the same, so a link printed in a course never breaks.'
				}
			],
			stackWhy: [
				{
					tech: 'Go',
					why: 'Long-running media jobs, a playback server and an API in one statically-linked binary that is easy to run on a few machines.'
				},
				{
					tech: 'ffmpeg + a packager',
					why: 'The industry-standard encoder for the ladder, and a dedicated packager for adaptive streaming and encryption, with perceptual quality scoring to check the output.'
				},
				{
					tech: 'PostgreSQL',
					why: 'Videos, ladders, jobs and billing need transactions and row-level tenant isolation; the job queue lives in the same database.'
				},
				{
					tech: 'ClickHouse',
					why: 'Viewing heartbeats are high-volume and append-only, exactly what a columnar store aggregates cheaply.'
				},
				{
					tech: 'S3-compatible storage',
					why: 'Masters and renditions go to object storage, so compute and storage scale independently.'
				}
			],
			features: [
				'Resumable multipart uploads and bulk import from other hosts',
				'Adaptive streaming with a mobile-first ladder and on-demand high renditions',
				'Signed, expiring playback with encryption, watermark labels and device caps',
				'Captions, chapters, trims and file replacement that keep the same video id',
				'A branded embeddable player, webhooks and nested folders',
				'Per-video viewer analytics and per-minute billing'
			],
			status: 'Built · pre-launch'
		}
	},
	{
		title: 'Yayın',
		slug: 'yayin',
		icon: 'broadcast',
		description:
			'Live streaming on your own channel. Go live from OBS or a browser, reach viewers as adaptive HLS, and find the recording already waiting as a video.',
		year: 2026,
		stack: ['Go', 'MediaMTX', 'ffmpeg', 'S3'],
		featured: true,
		order: 2,
		caseStudy: {
			summary:
				'A live-streaming service that accepts any common encoder, transcodes to an adaptive stream in real time, and turns every broadcast into an on-demand video without a re-upload.',
			problem:
				'Teachers, churches and small broadcasters want their own channel instead of a platform that owns the audience. Yayın gives each channel a stream key: point OBS or a webcam at it, viewers get an adaptive stream, and when the broadcast ends the recording flows straight into the video library.',
			challenges: [
				{
					title: 'Accepting any encoder without trusting it',
					body: 'Broadcasters arrive over RTMP from OBS, SRT from hardware encoders, or WHIP from a browser. A dedicated media server terminates all three, but the decision about whether a stream key may publish belongs to the application: the media server asks the API for permission on every publish, and only the local transcoder is allowed to read a stream back.'
				},
				{
					title: 'Live transcoding that never corrupts a segment',
					body: 'A single lost packet during live transcoding can corrupt a segment for every viewer at once. The transcoder reads the feed over TCP rather than UDP, produces two renditions with short segments, and is stopped with an interrupt rather than killed, so the playlist is always finalised cleanly.'
				},
				{
					title: 'Broadcasts that die without saying goodbye',
					body: 'Encoders crash, laptops sleep and networks drop, so "the stream ended" is rarely announced. A reaper sweeps every minute: a broadcast with no new segment for two minutes is over, a requested stop gets a short grace period, and half-started streams are cleaned up. Live segments are only removed once the recording is safely stored.'
				}
			],
			implementation: [
				{
					title: 'Recording without a re-upload',
					body: 'When a broadcast ends, its recording is handed to the on-demand video pipeline as a background job that retries for up to a day, so an outage never loses a recording, and the broadcaster never uploads the same hours twice.'
				},
				{
					title: 'Plans that depend on each other',
					body: 'Live streaming builds on the video platform underneath it, so a channel can only be switched on when that dependency is active. The account layer enforces the relationship rather than each product checking it.'
				}
			],
			stackWhy: [
				{
					tech: 'MediaMTX',
					why: 'One media server that speaks RTMP, SRT and WHIP and can defer authorisation to the application.'
				},
				{
					tech: 'ffmpeg',
					why: 'Real-time transcoding to adaptive HLS with predictable, short segments.'
				},
				{
					tech: 'Go',
					why: 'The permission hooks, reaper and job hand-off are small concurrent services that fit naturally in the same binary as the rest of the platform.'
				},
				{
					tech: 'S3-compatible storage',
					why: 'Live segments and finished recordings share the object store the video library already uses.'
				}
			],
			features: [
				'Stream keys per channel over RTMP, SRT or browser WHIP',
				'Adaptive HLS playback with short segments',
				'Automatic recording into the video library',
				'Crash-tolerant clean-up of abandoned broadcasts',
				'Usage-based plans enforced by the account layer'
			],
			status: 'Built · pre-launch'
		}
	},
	{
		title: 'Seyr',
		slug: 'seyr',
		icon: 'chart',
		description:
			'Privacy-first web analytics: no cookies, no consent banner, no stored addresses, and every number an exact count rather than a sample.',
		year: 2026,
		stack: ['Go', 'PostgreSQL', 'JavaScript'],
		featured: true,
		order: 3,
		caseStudy: {
			summary:
				'Cookieless site analytics that counts unique visitors without being able to follow any one of them, reported in the business’s own time zone.',
			problem:
				'Site owners want to know which pages people read and where they came from, without cookie banners or handing visitor data to an ad company. Seyr reports pages, referrers, countries and devices with exact counts, and is built so that even someone holding the database cannot reconstruct who visited.',
			challenges: [
				{
					title: 'Counting visitors without tracking them',
					body: 'Unique visitors normally mean a cookie or a fingerprint. Instead, a visitor is a truncated one-way hash of the site, the address and the browser, salted with a random value that lives only in memory and rolls over every day. The same person produces a different identifier tomorrow, and no raw address is ever stored, so there is nothing to link across days, even from a full copy of the table.'
				},
				{
					title: 'Keeping fake traffic out',
					body: 'An open collection endpoint invites spam. The collector only accepts hits for the registered domain and its subdomains, rate-limits each address, and classifies bots with the same parser the rest of the platform uses, so bot traffic is labelled consistently everywhere.'
				},
				{
					title: 'Days that match the business',
					body: 'A report that splits days at midnight UTC is wrong for a shop in Dhaka. Every report buckets by the organisation’s own time zone, and range limits keep a single query bounded.'
				}
			],
			implementation: [
				{
					title: 'Tenant isolation in the database',
					body: 'Sites, hits and shared dashboards sit behind row-level security keyed on the signed-in account, so a missing filter in application code returns nothing rather than someone else’s data.'
				},
				{
					title: 'A tiny, respectful script',
					body: 'The embeddable script is small and inline-friendly, honours Do Not Track and ignores local development, so installing it costs nothing measurable and never counts the site’s own developers.'
				}
			],
			stackWhy: [
				{
					tech: 'Go',
					why: 'A fast, concurrent collector in the same binary as the dashboard API and the rest of the platform.'
				},
				{
					tech: 'PostgreSQL',
					why: 'Exact counts, row-level tenant isolation and per-site retention without running a second datastore.'
				},
				{
					tech: 'Vanilla JavaScript',
					why: 'The tracker has no dependencies, so it stays small enough to never be the reason a page is slow.'
				}
			],
			features: [
				'Cookieless, address-free unique visitor counting',
				'Pages, referrers, countries and devices with exact counts',
				'Custom events and period-over-period comparisons',
				'Shareable dashboards by link',
				'Per-site retention and data export'
			],
			status: 'Built · pre-launch'
		}
	},
	{
		title: 'Ulak',
		slug: 'ulak',
		icon: 'link',
		description:
			'Short links on your own domain, with a readable address and a QR code for every link, with click counts that tell you which poster or SMS worked.',
		year: 2026,
		stack: ['Go', 'PostgreSQL'],
		featured: true,
		order: 4,
		caseStudy: {
			summary:
				'A branded link shortener built for links that get printed, read aloud and typed back in, with domain verification that keeps checking after day one.',
			problem:
				'Businesses put links on posters, SMS campaigns and packaging, then have no idea which one worked, and a random short code is hard to type from a printed flyer. Ulak serves short links from the customer’s own domain, generates a QR code for each, and counts clicks per link so every channel can be measured.',
			challenges: [
				{
					title: 'Proving a domain is really yours',
					body: 'Serving links from a customer’s domain means verifying ownership and that the domain actually points at the service. Verification uses a DNS TXT record plus a resolution check, and a nightly sweep re-checks every domain, pausing (not deleting) any that stop resolving, and notifying the owner.'
				},
				{
					title: 'Slugs people can read aloud',
					body: 'A short code copied from paper fails if it contains characters that look alike. Generated slugs use an alphabet with the ambiguous characters removed and retry on collision, and a reserved-word list stops a custom slug from shadowing a real route.'
				},
				{
					title: 'Links that can change after printing',
					body: 'Once a poster is printed its link cannot change, but its destination might need to. Redirects are temporary rather than permanent, so browsers never cache the old destination and a link can be repointed at any time.'
				}
			],
			implementation: [
				{
					title: 'Honest click counts',
					body: 'Bots are flagged at the moment a click is recorded, so reporting is a simple filter rather than a heuristic applied at query time, and older rows were backfilled with the same rule.'
				},
				{
					title: 'Expiry in local time',
					body: 'Links can expire, and expiry is set in the organisation’s own time zone, so "ends Friday night" means Friday night for the business.'
				}
			],
			stackWhy: [
				{
					tech: 'Go',
					why: 'Redirects are latency-sensitive; a compiled service answers them in microseconds.'
				},
				{
					tech: 'PostgreSQL',
					why: 'Links, domains and clicks with row-level tenant isolation, unique constraints for slugs, and the verification sweep’s state.'
				}
			],
			features: [
				'Custom domains with ongoing DNS verification',
				'Readable generated slugs or custom ones',
				'A QR code for every link',
				'UTM parameters, tags and time-zone-aware expiry',
				'Per-link click analytics with bot filtering'
			],
			status: 'Built · pre-launch'
		}
	},
	{
		title: 'Hafif',
		slug: 'hafif',
		icon: 'image',
		description:
			'Image delivery. Keep images where they already are and request any size and format from a signed URL, resized and cached on the fly.',
		year: 2026,
		stack: ['Go', 'libvips'],
		featured: true,
		order: 5,
		caseStudy: {
			summary:
				'An on-the-fly image service that resizes and re-encodes from signed URLs, caches aggressively, and cannot be turned into an open proxy.',
			problem:
				'Product photos and article images are often far larger than the phone that shows them. Hafif lets a site keep its originals where they are and ask for the size and format each page needs. The image is fetched, resized, re-encoded to a modern format and cached, so the next visitor gets it instantly.',
			challenges: [
				{
					title: 'Not becoming an open proxy',
					body: 'A service that fetches any URL and returns an image is an abuse magnet. It only fetches from an exact allow-list of hosts with no wildcards, and every URL is HMAC-signed over the key, the transform and the source, so nobody can mint new transforms or point it at someone else’s images.'
				},
				{
					title: 'Caching that is safe forever',
					body: 'Because a different image or transform always means a different URL, every result can be cached for a year. Format negotiation varies on what the browser accepts, conditional requests return "not modified", and the disk cache writes to a temporary file and renames it, so a reader never sees a half-written image.'
				},
				{
					title: 'Keeping the machine up',
					body: 'Image decoding is memory-hungry, and one enormous upload can take a server down. The image engine runs behind a concurrency cap with a hard dimension ceiling, and phone photos are rotated from their orientation metadata before resizing.'
				}
			],
			implementation: [
				{
					title: 'Separate control and data planes',
					body: 'The image server is its own binary that knows nothing about accounts; it asks the account service for permission with a token. That keeps the hot path small and lets image serving scale on its own machines.'
				}
			],
			stackWhy: [
				{
					tech: 'Go',
					why: 'A small, fast data-plane binary with predictable memory use under concurrent load.'
				},
				{
					tech: 'libvips',
					why: 'Streaming, low-memory image processing that is far faster than general-purpose libraries for resize-and-encode work.'
				}
			],
			features: [
				'Width, height, quality, format and fit from the URL',
				'WebP, AVIF, JPEG and PNG output with browser negotiation',
				'HMAC-signed URLs with key rotation',
				'Year-long caching with atomic disk writes',
				'Usage metering per organisation'
			],
			status: 'API complete · console in progress'
		}
	},
	{
		title: 'Dukkan',
		slug: 'dukkan',
		icon: 'storefront',
		description:
			'An online shop built around how selling already works in Bangladesh: cash on delivery, courier booking, every district and thana, and a ledger that reconciles.',
		year: 2026,
		stack: ['Go', 'PostgreSQL', 'S3'],
		featured: true,
		order: 6,
		caseStudy: {
			summary:
				'Commerce for cash-on-delivery markets: couriers, settlements and a double-entry ledger, with a path from a single shop to a multi-seller marketplace.',
			problem:
				'Most online selling in Bangladesh is cash on delivery through a courier, and the hard part is not the storefront. It is knowing whether the courier’s settlement matches the orders. Dukkan runs the shop, books couriers against all 64 districts and their thanas, and keeps the books straight; adding a second seller turns the same shop into a marketplace with commission and payouts.',
			challenges: [
				{
					title: 'Money that has to reconcile',
					body: 'Every amount is an integer in the smallest unit, shown with South Asian digit grouping. Behind it sits a double-entry ledger (courier and gateway receivables, bank, per-seller payables, commission) that rejects an unbalanced entry before it ever reaches the database.'
				},
				{
					title: 'Checking courier settlements',
					body: 'Couriers pay out in bulk and report in spreadsheets whose columns vary. Settlement reports are matched by column header, parsed without floating point, and the gap between what the courier paid and what matched orders account for is shown plainly, with parcels left unpaid too long flagged for follow-up.'
				},
				{
					title: 'Never overselling',
					body: 'Stock is only claimed at checkout, never while browsing: it moves from available to reserved, and a cancelled order returns it, so two customers cannot buy the last item.'
				}
			],
			implementation: [
				{
					title: 'Each shop’s own payment and SMS accounts',
					body: 'Payments go through each shop’s own merchant account rather than a shared one, and SMS is sent through a pluggable gateway, because there is no single SMS provider every business uses.'
				},
				{
					title: 'Photos served at the right size',
					body: 'Product images are stored once and delivered through the platform’s image service, so storefronts load quickly on phones without the seller resizing anything.'
				}
			],
			stackWhy: [
				{
					tech: 'Go',
					why: 'A large domain (catalogue, orders, couriers, ledger, payouts) kept in one type-checked codebase.'
				},
				{
					tech: 'PostgreSQL',
					why: 'Money and stock need transactions, constraints and row-level isolation between shops.'
				},
				{
					tech: 'S3-compatible storage',
					why: 'Product photos live in object storage and are served through the image service.'
				}
			],
			features: [
				'Cash on delivery with courier booking across every district and thana',
				'Double-entry ledger and courier settlement reconciliation',
				'Catalogue with variants, CSV import and coupons',
				'Marketplace mode with commission and seller payouts',
				'Custom storefront domains and printable receipts',
				'Staff roles kept separate from money settings'
			],
			status: 'Built · pre-launch'
		}
	},
	{
		title: 'Majlis',
		slug: 'majlis',
		icon: 'chalkboard',
		description:
			'Webinars for large rooms. The audience joins with a short code, no account or download, and can chat, ask, upvote and answer polls in time with the talk.',
		year: 2026,
		stack: ['Go', 'WebSockets', 'PostgreSQL'],
		featured: true,
		order: 7,
		caseStudy: {
			summary:
				'An interactive webinar room for hundreds of people that avoids a media server entirely, and keeps polls in sync with a stream that runs seconds behind.',
			problem:
				'A class or a town hall of a few hundred people needs everyone to hear the host and be able to take part without installing anything. Majlis lets the audience join with a six-character code, and gives them chat, questions with upvotes and live polls; the recording lands in the video library afterwards.',
			challenges: [
				{
					title: 'Scale without a media server',
					body: 'Two-way video for hundreds of people needs a costly selective forwarding server. Majlis deliberately has no audience video: the host’s broadcast rides the live-streaming pipeline, and all interaction travels over WebSockets. The tradeoff is that viewers are several seconds behind the host.'
				},
				{
					title: 'Polls that arrive before the host says them',
					body: 'With viewers seconds behind, a poll launched live would appear before the audience has heard the question. Every message records both wall-clock time and position in the talk, and polls are held back by the room’s measured lag: the median of recent player reports, clamped to a sane range because browsers cannot be trusted.'
				},
				{
					title: 'One slow reader must not stall the room',
					body: 'The socket hub never blocks on a client: a reader that falls behind misses messages rather than slowing everyone down, and presence is counted from open connections, which is what plans are sold on.'
				}
			],
			implementation: [
				{
					title: 'Fair questions',
					body: 'One vote per person is enforced by a unique constraint in the database rather than by the client, and questions are kept separate from chat with optional moderation.'
				}
			],
			stackWhy: [
				{
					tech: 'WebSockets',
					why: 'Chat, questions and polls need low-latency fan-out to hundreds of clients without the cost of media servers.'
				},
				{
					tech: 'Go',
					why: 'A non-blocking hub handling many long-lived connections with little memory each.'
				},
				{
					tech: 'PostgreSQL',
					why: 'Rooms, questions and votes with constraints that make fairness a database guarantee.'
				}
			],
			features: [
				'Join with a six-character code: no account, no download',
				'Chat, questions with upvotes and moderated Q&A',
				'Live polls synchronised to the stream delay',
				'Recording saved to the video library',
				'Presence counts per room'
			],
			status: 'In development'
		}
	},
	{
		title: 'Seher',
		slug: 'seher',
		icon: 'wallet',
		description:
			'One account, one wallet and one bill for a family of products, with tenant isolation enforced by the database and a ledger that cannot drift.',
		year: 2026,
		stack: ['Go', 'PostgreSQL', 'SvelteKit'],
		featured: true,
		order: 8,
		caseStudy: {
			summary:
				'The account platform underneath every product: organisations, a prepaid wallet in taka, subscriptions, API keys and notifications, in a modular monolith built to be split later.',
			problem:
				'Running several products as separate SaaS means separate logins, separate bills and separate security models. Seher gives a business one account, one set of organisations and one wallet: top up once, switch products on, and each product charges for what it uses, with plain, published prices.',
			challenges: [
				{
					title: 'Tenant isolation in the database, not the app',
					body: 'Application-level filtering is one forgotten clause away from a data leak. Every organisation-scoped table (more than a hundred of them) has row-level security keyed on the account set for that transaction, and the application role sees zero rows without it. API keys resolve to an account too, so machines get exactly the same isolation as people.'
				},
				{
					title: 'A wallet that cannot go wrong',
					body: 'Money is stored as integers in the smallest unit, and every balance change is a ledger entry. The wallet row is locked for the duration of a debit, so two concurrent charges can never both pass the balance check.'
				},
				{
					title: 'Subscriptions people can predict',
					body: 'The wallet is charged before access is granted, and price and period are copied onto the subscription so a later price change never touches existing customers. Renewals are a sweep over due dates, dated from the due date so a late sweep gives nothing away; a renewal that cannot be paid suspends access rather than deleting anything.'
				},
				{
					title: 'Payments that cannot be replayed',
					body: 'Gateway callbacks are validated against the exact transaction they name, and a payment can leave the pending state only once, so a duplicated or forged callback cannot credit a wallet twice.'
				}
			],
			implementation: [
				{
					title: 'A monolith with seams',
					body: 'Each product reaches the others only through small interfaces it declares itself, so any product can move into its own service later with only that interface changing. Tokens are already verified through a published key set rather than a shared secret.'
				},
				{
					title: 'Everything a team needs around it',
					body: 'Members and roles, API keys, per-device sessions, an audit log, and a notification bell pushed over WebSockets, built once and shared by every product.'
				}
			],
			stackWhy: [
				{
					tech: 'Go',
					why: 'One binary for every product keeps deployment to a handful of machines simple.'
				},
				{
					tech: 'PostgreSQL',
					why: 'Row-level security is the tenant boundary, and the same database carries the ledger and the job queue.'
				},
				{
					tech: 'SvelteKit',
					why: 'One server-rendered console, marketing site and documentation for every product.'
				}
			],
			features: [
				'One account and wallet across every product',
				'Prepaid balance in taka with a full ledger',
				'Predictable subscriptions with dependency rules between products',
				'Organisations, roles, API keys and per-device sessions',
				'Real-time notifications and an audit log'
			],
			status: 'Built · pre-launch'
		}
	},
	{
		title: 'SnapKeep',
		slug: 'snapkeep',
		icon: 'aperture',
		description:
			'A native macOS screenshot and screen-recording tool. Capture, annotate, and keep, fully on-device with no accounts, cloud, or telemetry.',
		year: 2026,
		stack: ['Swift 6', 'SwiftUI', 'ScreenCaptureKit', 'Vision'],
		url: 'https://github.com/ebnsina/SnapKeep/releases',
		featured: false,
		order: 9,
		caseStudy: {
			summary:
				'A native macOS capture tool (region/window/full-screen screenshots, screen recording, annotation, and on-device OCR) that never touches the network.',
			problem:
				'Privacy-conscious Mac users and creators want fast capture, annotation, and short screen recordings without sending anything to the cloud. SnapKeep does it all on-device: no accounts, no telemetry, no cost. A menubar utility that captures, annotates, and keeps.',
			challenges: [
				{
					title: 'Making screen-recording permission painless',
					body: 'macOS Screen Recording permission is notoriously awkward: it typically forces users to quit and relaunch the app before capture works. SnapKeep triggers the system permission prompt at the right moment on launch and then re-checks authorization every time it comes back to the foreground, so returning from System Settings picks up the newly-granted permission automatically, with no manual restart.'
				},
				{
					title: 'Low-latency recording and real-time encoding',
					body: 'Screen frames arrive continuously on a background thread and must be encoded to video without ever blocking the UI or dropping behind real time. The recording engine runs entirely off the main thread on its own synchronized queue and deals with the real constraints of hardware H.264: dimensions rounded to even numbers, a real-time encoding budget, a bounded backlog, and starting the video timeline from the first captured frame before audio is mixed in.'
				},
				{
					title: 'One annotation model, identical on screen and export',
					body: "Every markup tool (pen, marker, arrow, shapes, text, numbered steps, pixelate) is described by a single data model with one shared drawing routine used both for the live editing canvas and the final exported image, guaranteeing what you see is exactly what you save. Pixelate redaction carefully maps between on-screen coordinates and the image's true pixel grid so a redacted region can be cropped, downscaled, and re-enlarged into a solid mosaic that can't be reversed."
				},
				{
					title: 'Fully offline OCR and a menubar-only lifecycle',
					body: "Copy-Text extracts text from any capture using Apple's on-device text recognition (no image ever leaves the machine) and reorders the results to match natural reading order. The app lives entirely in the menu bar with no Dock icon, allows only one running instance, and registers truly system-wide keyboard shortcuts so capture fires no matter which app currently has focus."
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
					body: 'Captures are saved as timestamped PNG/JPEG files in the user\'s Pictures folder and copied to the clipboard immediately. The history view is simply the newest files read back from that folder. There is no database and no network, which keeps the "everything stays on your Mac" promise honest and the storage format completely transparent.'
				},
				{
					title: 'Reproducible builds and one-click distribution',
					body: "The Xcode project is generated from a declarative spec so it can be recreated cleanly on any machine (Swift 6, hardened runtime, Apple silicon, macOS 14+). Pushing a version tag runs a CI workflow that builds a signed disk image and publishes a GitHub Release. The build isn't Apple-notarized yet, so the docs walk users through clearing the quarantine flag on first launch."
				}
			],
			stackWhy: [
				{
					tech: 'Swift 6',
					why: 'Its compile-time concurrency checking makes the off-main-thread capture and recording pipeline provably data-race-free rather than hopefully so.'
				},
				{
					tech: 'SwiftUI + AppKit',
					why: "SwiftUI drives the menu-bar UI and reactive state; AppKit and Core Graphics handle the low-level window and pixel work SwiftUI alone can't reach."
				},
				{
					tech: 'ScreenCaptureKit',
					why: "Apple's modern capture framework, providing both high-quality stills and live video with the ability to exclude specific windows or apps from a capture."
				},
				{
					tech: 'Vision',
					why: 'On-device text recognition powers Copy-Text with zero network dependency, matching the fully-offline promise.'
				},
				{
					tech: 'AVFoundation',
					why: 'Handles the video encoding, audio, and frame sampling behind MP4 recording and GIF export.'
				},
				{
					tech: 'Global hotkeys',
					why: 'System-level shortcut registration is the only reliable way to trigger capture regardless of which application is focused.'
				}
			],
			features: [
				'Region, window, full-screen, and recapture-last capture with freeze-frame overlay, live dimensions, and a magnifier loupe',
				'Screen recording to H.264 MP4 or animated GIF, with a post-recording Studio (trim, captions, silence detection)',
				'Annotation editor: pen, marker, arrow, shapes, text, numbered steps, pixelate/redact, undo/redo',
				'On-device Vision OCR, Beautify (gradient backdrop, padding, shadow), and pin-to-desktop',
				'Menubar history grid (click to copy, drag out, pin/reveal/share/delete) plus native sharing',
				'100% local: no network calls, no telemetry, no accounts'
			],
			status: 'Released v0.1.2 · GitHub Releases (not yet notarized)'
		}
	},
	{
		title: 'SEOMaster',
		slug: 'seomaster',
		icon: 'trendUp',
		description:
			'An all-in-one SEO SaaS that guides a zero-visitor site toward ranking on Google, built for non-technical users, teaching as it works.',
		year: 2026,
		stack: ['SvelteKit', 'Drizzle', 'PostgreSQL', 'TanStack AI'],
		featured: false,
		order: 10,
		caseStudy: {
			summary:
				'An SEO SaaS that audits a site, scores it, and teaches non-technical owners exactly what to fix, with a provider-agnostic, fully optional AI fix assistant.',
			problem:
				'Beginner site owners have zero-visitor sites and no idea how to rank on Google. SEOMaster audits a site and then explains, in plain language, what is wrong and exactly how to fix it, turning raw SEO data into do-this-next guidance instead of dashboards non-technical users cannot interpret.',
			challenges: [
				{
					title: 'AI that is provider-agnostic and fully optional',
					body: 'AI is bring-your-own-key and can never become a hard dependency. The entire product has to remain fully usable with no AI configured at all. A single abstraction picks whichever provider (OpenAI, Anthropic, Gemini, or a local model) is set purely from environment, every AI-powered feature is gated behind a "is AI configured?" check, and the local-model path is treated as keyless so users can run it for free.'
				},
				{
					title: 'Keeping AI output structured and reliable',
					body: "Generated fixes and content drafts have to render as real UI, not a wall of chat text. Each AI request is given a strict schema the model must fill, so responses come back as validated, typed data rather than prose, and the prompts explicitly forbid jargon and inventing facts about the user's business, because the audience is beginners who can't tell a hallucination from a real recommendation."
				},
				{
					title: 'Background crawling without a separate infra tier',
					body: 'Site crawls, daily rank checks, and weekly reports are long-running and scheduled: the kind of work that usually needs a dedicated job server. Here the job workers run inside the same process as the web app, so a single small VPS handles both, guarded against accidentally starting twice during development and degrading gracefully to in-process crawling when no queue backend is available.'
				},
				{
					title: 'Teaching beginners, decoupled from AI',
					body: "Every issue the audit can find ships with hand-written, plain-language guidance: what it is, why it matters, how to fix it, how hard it is, and how much impact it has. This teaching content always works, with or without AI. When AI is configured it layers a tailored, copy-paste-ready fix on top; when it isn't, the manual steps stand on their own."
				}
			],
			implementation: [
				{
					title: 'Pluggable AI layer with structured output',
					body: "A small factory returns the configured provider's client, and the draft- and fix-generation features both request a schema-constrained response, so what comes back is already parsed and validated against the shape the UI expects, with no fragile text-parsing of model output."
				},
				{
					title: 'Scheduled background job pipeline',
					body: "Three job types (crawls, rank refreshes, and report generation) run on a shared queue backed by an in-memory store. Recurring work is registered once at startup on cron schedules (a daily rank sweep, a weekly report) in a way that's safe to run repeatedly without piling up duplicates."
				},
				{
					title: 'Crawl → audit → score pipeline',
					body: 'A run marks itself in-progress, fetches pages with a well-behaved crawler (respecting robots rules, discovering the sitemap, and detecting answer-engine signals like AI-crawler policies), applies a battery of rule-based checks, best-effort layers in Core Web Vitals field data, computes a 0–100 health score, and stores the pages and issues it found.'
				},
				{
					title: 'Type-safe server API',
					body: "The server API is built from feature-co-located endpoints validated at the boundary, rather than scattered controllers. Every query is scoped to the caller's organization and every mutation checks write permission first, so multi-tenant isolation is enforced consistently by construction."
				},
				{
					title: 'A schema modeling the whole SEO domain',
					body: 'The database schema captures the full domain: the multi-tenant core, the site → crawl → page/issue hierarchy, keywords with historical rank snapshots for trend charts, competitors, content briefs, cached analysis, and Google account tokens stored encrypted at rest, with database-level constraints enforcing per-organization uniqueness.'
				}
			],
			stackWhy: [
				{
					tech: 'SvelteKit + Svelte 5',
					why: "A single full-stack app with a type-safe server API, so there's no separate backend service to build and deploy."
				},
				{
					tech: 'Drizzle + PostgreSQL',
					why: 'A type-safe schema whose types flow straight into validation, and a relational model that fits the site/crawl/keyword hierarchy naturally.'
				},
				{
					tech: 'TanStack AI',
					why: 'A provider-agnostic AI layer, which is what lets AI stay bring-your-own-key, optional, and swappable between vendors with schema-validated output.'
				},
				{
					tech: 'BullMQ + Redis',
					why: 'Durable background crawls, rank refreshes, and schedulers, run in-process for single-VPS simplicity, but able to be split out to scale later.'
				},
				{
					tech: 'Zod',
					why: 'One validator guards every external input (API requests and AI responses alike), so bad data is rejected at the edge.'
				},
				{
					tech: 'Tailwind CSS 4',
					why: 'A token-driven design system for a consistent flat UI, with rich typography for the rendered content previews.'
				}
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
		icon: 'toolbox',
		description:
			'A fast, free, fully static collection of 49 calculators and tools (financial, health, math, everyday, and developer) that all run in the browser.',
		year: 2026,
		stack: ['SvelteKit', 'Svelte 5', 'Tailwind', 'TypeScript'],
		featured: false,
		order: 11,
		caseStudy: {
			summary:
				'49 single-purpose calculators and tools across five categories, driven by one declarative registry and prerendered to static HTML that runs entirely in the browser.',
			problem:
				'Everyday users and developers want quick, single-purpose utilities without accounts, ads, or sending data to a server. UtilsLab is a free collection of 49 tools (financial, health, math, everyday, and developer) where everything runs client-side and every page is prerendered for instant loads.',
			challenges: [
				{
					title: 'Scaling to 49 tools with a consistent UX',
					body: 'Hand-building 49 bespoke pages would inevitably drift apart in look and behavior and become a maintenance burden. Instead, every tool is described declaratively: its input fields plus a pure function that turns those inputs into typed result widgets (a stat, a table, a chart series), and one generic shell renders them all uniformly. Adding a tool is a matter of describing it and dropping it into the catalog, not building another page.'
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
					body: 'The developer formatters lean on genuinely large parsing libraries. If they all shipped up front, the whole site would load slowly for someone who only wanted a tip calculator. Each heavy library is instead loaded on demand, the first time its tool is actually opened, so the base download stays tiny and users only pay for what they use.'
				}
			],
			implementation: [
				{
					title: 'Central tool registry',
					body: 'A single catalog collects every tool definition and exposes helpers for grouping by category, surfacing featured tools, and instant client-side search across titles, descriptions, and keywords. That one catalog is the source of truth that drives routing, navigation, search, and which pages get prerendered.'
				},
				{
					title: 'Declarative schema with escape hatches',
					body: "A tool can be described three ways: a standard calculator (input fields plus a compute function), a reversible text transform (e.g. minify ↔ beautify), or, for the handful that don't fit a form (like the scientific calculator and the unit and color converters), a fully custom component. The common cases stay effortless without boxing in the exceptions."
				},
				{
					title: 'Static prerendering',
					body: 'The entire site is prerendered ahead of time. The tool and category routes each derive their full list of pages from the central catalog, telling the build exactly what to generate, and category URLs are constrained to the known set of categories so invalid paths never render.'
				},
				{
					title: 'Shared UI and pure-logic testing',
					body: "The shared shell seeds each tool's inputs from its declared defaults and recomputes results reactively as the user types, splitting the output into stat cards and table/chart blocks with reusable renderers. Because the calculation logic is pure and separated from the UI, it's covered by fast unit tests, with a separate browser test suite for the components."
				}
			],
			stackWhy: [
				{
					tech: 'SvelteKit + Svelte 5',
					why: 'File-based routing with per-page prerender control, plus fine-grained reactivity that makes live-recomputing calculators trivial to build.'
				},
				{
					tech: 'adapter-static',
					why: "Emits pure static HTML/JS with no server: instant loads, hosting that's cheap anywhere, and a client-only privacy guarantee that's structural rather than promised."
				},
				{
					tech: 'Tailwind CSS 4',
					why: 'One theme system gives all 49 tools consistent per-category theming without hand-written CSS per page.'
				},
				{
					tech: 'TypeScript',
					why: 'Typed contracts for tools, fields, and results make the declarative catalog safe and self-documenting, so a new tool has to conform to compile.'
				},
				{
					tech: 'On-demand formatters',
					why: 'Real parsing libraries give correct output for the developer tools, loaded lazily so they never weigh down the base bundle.'
				},
				{
					tech: 'Vitest + Playwright',
					why: 'Fast unit tests for the pure calculation logic, plus a browser suite for the interactive components.'
				}
			],
			features: [
				'Financial: mortgage, loan, compound interest, sales tax, ROI, savings goal, with amortization tables and charts',
				'Health & fitness: BMI, calorie, body fat, BMR, ideal weight, water intake, running pace',
				'Math: scientific calculator, percentage, fraction, quadratic solver, statistics',
				'Everyday: age, tip, discount, unit converter, color converter',
				'Developer: Base64/URL/HTML encode, JSON/CSS/JS/HTML/SQL/Markdown formatters, hash, JWT, UUID, timestamp, and more',
				'Instant client-side search, per-category theming, and reversible text tools with live recomputation'
			],
			status: 'Production-ready static build'
		}
	}
];
