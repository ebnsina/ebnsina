---
title: 'Event-Driven আর্কিটেকচার ও CQRS'
subtitle: 'Log-কে সত্যের উৎস বানানো, event sourcing, read model, cross-service workflow-এর জন্য saga, outbox প্যাটার্ন আর event schema-র ইভোলিউশন।'
chapter: 16
level: 'advanced'
readingTime: '২৮ মিনিট'
topics:
  ['event-driven', 'event sourcing', 'CQRS', 'saga', 'outbox', 'schema evolution', 'projections']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা বাঁধানো খাতা যেখানে কেবল নিচে নতুন লাইন যোগ হয়, কোনো লাইন কাটা যায় না। দেয়ালে ঝোলানো কয়েকটা সারাংশ বোর্ড সেই খাতা থেকেই বানানো — বোর্ড পুড়ে গেলে খাতা থেকে আবার বানিয়ে নেওয়া যায়, কিন্তু খাতা পুড়লে কিছুই আর ফেরত আসে না।

</Callout>

## গল্পে বুঝি

বাগদাদের বায়তুল হিকমাহর নকলখানায় একটা বাঁধানো মোটা খাতা আছে, যাকে সবাই বলে "আসল খাতা"। সেখানে প্রধান লেখক সিনা প্রতিটা ঘটনা এক লাইনে লিখে রাখেন, তারিখ আর ক্রমিক নম্বর সহ: "৪১২ — বিরুনি জ্যামিতির পাণ্ডুলিপি ধার নিলেন", "৪১৩ — রাজি চিকিৎসাশাস্ত্রের নকলের ফরমায়েশ দিলেন", "৪১৪ — বিরুনি পাণ্ডুলিপি ফেরত দিলেন"। খাতার একটাই নিয়ম, আর সেটা কঠোর: **কোনো লাইন কাটা যাবে না, বদলানো যাবে না, শুধু নিচে নতুন লাইন যোগ হবে।** ভুল হলেও নয় — ভুল হলে নিচে আরেকটা লাইন লিখতে হবে, "৪১৫ — ৪১৩ নম্বর ফরমায়েশ বাতিল"। এই কেবল-যোগ-হওয়া খাতাটাই হলো **append-only log**, আর নকলখানায় সত্য বলতে ওই খাতাটাকেই বোঝায় — বাকি সবকিছু ওখান থেকেই বানানো।

কিন্তু কেউ যদি জানতে চায় "এখন বিরুনির কাছে কয়টা পাণ্ডুলিপি আছে?", তখন প্রতিবার পুরো খাতা গোড়া থেকে পড়া অসম্ভব। তাই দেয়ালে কয়েকটা আলাদা বোর্ড ঝোলানো আছে, আর প্রতিটা বোর্ডের দায়িত্বে একজন করে কেরানি। এক কেরানি শুধু "কার কাছে কী আছে" বোর্ডটা রাখে, আরেকজন "কোন বিষয়ে কয়টা বই আছে", তৃতীয়জন "এ মাসে কে কতবার এসেছে"। প্রত্যেকে খাতার নতুন লাইনগুলো পড়ে নিজের বোর্ড হালনাগাদ করে। মজার ব্যাপার হলো, তিনটা বোর্ড তিন রকম করে সাজানো — কারণ তিন রকম প্রশ্নের উত্তর দিতে হয়। আর কোনো বোর্ডে ভুল ধরা পড়লে বা নতুন কোনো বোর্ড বানাতে হলে, কেরানি বোর্ডটা মুছে খাতার প্রথম লাইন থেকে আবার পড়ে গোটা বোর্ড নতুন করে বানিয়ে ফেলতে পারে। লেখা যায় শুধু খাতায়, পড়া হয় শুধু বোর্ড থেকে — এই বিভাজনটাই **CQRS**, আর বোর্ডগুলোই **read model** বা **projection**।

তৃতীয় সমস্যাটা এসেছিল রানারদের নিয়ে। ফরমায়েশ এলে খাতায় লেখার পাশাপাশি একজন রানারকে দিয়ে কর্ডোবার নকলখানায় খবর পাঠাতে হয়। শুরুতে সিনা খাতায় লিখে তারপর রানারকে ডাকতেন। কিন্তু একদিন খাতায় লেখার পরপরই তিনি অজ্ঞান হয়ে পড়লেন — খাতায় ফরমায়েশ আছে, রানার যায়নি, কর্ডোবা কিছুই জানে না। উল্টো ঘটনাও ঘটল আরেকদিন: রানার রওনা দিয়েছে, কিন্তু কালি ফুরিয়ে যাওয়ায় খাতায় লাইনটা লেখা হয়নি। সমাধান এলো দরজার পাশে একটা কাঠের বাক্স বসিয়ে: এখন নিয়ম হলো খাতায় লাইন লেখা আর বাক্সে চিরকুট ফেলা — **এই দুটো একই কলমের এক টানে, একসাথে** হয়। দুটোই হবে, নয়তো দুটোর কোনোটাই না। রানার আলাদা লোক, সে শুধু বাক্স থেকে চিরকুট তুলে নিয়ে যায়, আর ফিরে এসে চিরকুটে "পৌঁছেছে" ছাপ মারে। রানার ঘুমিয়ে পড়লে চিরকুট বাক্সেই পড়ে থাকে, পরে যায় — হারায় না। এই বাক্সটাই **outbox pattern**।

চতুর্থ ব্যাপারটা সবচেয়ে জটিল। একটা পাণ্ডুলিপি বিক্রির কাজে তিনটা দপ্তর জড়িত: কোষাগার টাকা নেবে, ভাণ্ডার বই সরাবে, আর ডাকঘর পাঠাবে। তিনটা আলাদা দপ্তর, একটা সাধারণ খাতা নেই, তাই "সব একসাথে হবে নয়তো কিছুই হবে না" এমন কোনো জাদু নেই। তাই নকলখানা একটা কাজের ধাপ-তালিকা বানাল, আর **প্রতিটা ধাপের পাশে তার উল্টো ধাপটাও লিখে রাখল**: টাকা নেওয়ার উল্টো হলো টাকা ফেরত, বই সরানোর উল্টো হলো বই ফিরিয়ে রাখা। কোনো ধাপে আটকে গেলে যে ধাপগুলো হয়ে গেছে সেগুলোর উল্টো ধাপ উল্টো ক্রমে চালানো হয়। মনে রাখবেন, টাকা ফেরত দেওয়া মানে "টাকা নেওয়াটা কখনো হয়নি" নয় — খাতায় দুটো লাইনই থাকে। এটাই **saga**, আর উল্টো ধাপগুলো হলো **compensating transaction**।

আর শেষে, বছরের পর বছর খাতার লাইনের ধরন বদলেছে। আগে লেখা হতো "বিরুনি বই নিলেন", পরে যোগ হলো কোন তাকের বই, আরও পরে কত দিনের জন্য। কিন্তু ১০ বছর আগের লাইনগুলোও তো খাতায় আছেই, আর নতুন কেরানিকে সেগুলোও পড়তে হয়। তাই নকলখানার নিয়ম হলো: নতুন ঘর যোগ করা যাবে, কিন্তু পুরনো ঘরের মানে বদলানো যাবে না, আর কোনো ঘর মুছে ফেলা যাবে না — পুরনো লাইনে ঘরটা না থাকলে কেরানি একটা ধরে-নেওয়া মান বসিয়ে নেবে। এটাই **event schema evolution**।

মিলিয়ে নিই: বাঁধানো খাতা হলো **append-only event log** এবং **source of truth**; দেয়ালের বোর্ডগুলো **read model / projection**; খাতা থেকে বোর্ড নতুন করে বানানো হলো **replay**; লেখা আর পড়ার পথ আলাদা রাখা হলো **CQRS**; দরজার পাশের কাঠের বাক্স হলো **outbox**; উল্টো ধাপসহ বহু-দপ্তরের কাজ হলো **saga** ও **compensating transaction**; আর লাইনের ধরন বদলানোর নিয়মগুলো হলো **schema evolution**। বাস্তবে Kafka, Debezium, Kafka Streams আর Temporal ঠিক এই পাঁচটা ধারণার উপরেই দাঁড়ানো।

## Event-driven মানে কী, আর কী নয়

Event-driven আর্কিটেকচারকে অনেকে "queue ব্যবহার করা" ভেবে ফেলে। পার্থক্যটা সূক্ষ্ম কিন্তু গুরুত্বপূর্ণ, আর সেটা বার্তার **অর্থে**।

একটা **command** হলো নির্দেশ: "এই পেমেন্টটা নাও"। প্রেরক জানে কে এটা করবে, এবং সাধারণত ফলাফল জানতে চায়। একটা **event** হলো ঘোষণা: "পেমেন্ট গৃহীত হয়েছে"। প্রেরক জানে না কে শুনছে, কতজন শুনছে, বা তারা কী করবে — এবং সে জানতে চায়ও না।

এই পার্থক্যটাই coupling-এর দিক ঘুরিয়ে দেয়। Command-এ প্রেরক গ্রাহকের উপর নির্ভরশীল। Event-এ গ্রাহক প্রেরকের **অতীত ঘটনার** উপর নির্ভরশীল, প্রেরক কারও উপর নয়। ফলে নতুন consumer যোগ করতে producer-এ হাত দিতে হয় না — যেটাই event-driven-এর আসল লাভ।

| দিক          | Command                                | Event                                 |
| ------------ | -------------------------------------- | ------------------------------------- |
| ভাষা         | ভবিষ্যৎ কাল, নির্দেশ (`ChargePayment`) | অতীত কাল, ঘোষণা (`PaymentCaptured`)   |
| গ্রাহক       | ঠিক একজন                               | শূন্য থেকে বহু                        |
| প্রত্যাখ্যান | গ্রাহক ফিরিয়ে দিতে পারে               | ফিরিয়ে দেওয়ার প্রশ্নই নেই, ঘটে গেছে |
| coupling     | প্রেরক গ্রাহককে জানে                   | প্রেরক কাউকে জানে না                  |

<Callout type="warning">

সবচেয়ে সাধারণ ভুল হলো command-কে event-এর নাম দিয়ে পাঠানো — যেমন `OrderShouldBeShipped` নামের একটা "event"। নাম event-এর মতো হলেও ওটা command, কারণ ওখানে ঠিক একজন গ্রাহকই আছে এবং তার ব্যর্থ হওয়াটা প্রেরকের সমস্যা। এভাবে coupling লুকিয়ে ফেলা হয়, কমানো হয় না। নাম অতীত কালে না লিখতে পারলে ধরে নিন ওটা event নয়।

</Callout>

## Log-ই সত্যের উৎস

প্রচলিত সিস্টেমে ডেটাবেসের row-ই সত্য, আর event হলো সেই সত্য বদলানোর পর পাঠানো বিজ্ঞপ্তি। Event-driven সিস্টেমে ব্যাপারটা উল্টে যায়: **event-এর ধারাটাই সত্য**, আর ডেটাবেসের row হলো সেই ধারার একটা সুবিধাজনক সারাংশ।

এই উল্টে যাওয়ার তিনটা ফল আছে, এবং তিনটাই দূরগামী।

**অতীত ফিরে পাওয়া যায়।** Row-এ শুধু বর্তমান অবস্থা থাকে। Log-এ সব অবস্থা থাকে, তাই "গত রমজানের ১৫ তারিখ বিকেলে ভাণ্ডারে কী ছিল" — এই প্রশ্নের উত্তর দেওয়া যায়, যদিও কেউ আগে এই প্রশ্নের কথা ভাবেনি।

**নতুন view পুরনো ডেটাসহ বানানো যায়।** আজ যদি নতুন একটা রিপোর্ট দরকার হয়, log-এর গোড়া থেকে replay করে গত তিন বছরের ডেটাসহ সেই রিপোর্ট বানানো যায়। Row-ভিত্তিক সিস্টেমে আজ থেকে ডেটা জমা শুরু হতো।

**Bug-এর ক্ষতি সারানো যায়।** Projection-এ ভুল হিসাব থাকলে projection মুছে আবার বানিয়ে নিন। Row-ভিত্তিক সিস্টেমে ভুল হিসাব মানে ভুল ডেটা চিরস্থায়ীভাবে বসে গেছে।

<Mermaid
title="Log as the Source of Truth"
code={`graph LR
  CMD["Command Handler<br/>validate, decide"] --> LOG["Append-only Event Log<br/>ordered, immutable"]
  LOG --> P1["Projection: current inventory"]
  LOG --> P2["Projection: borrower history"]
  LOG --> P3["Projection: monthly analytics"]
  LOG --> EXT["Other services<br/>via subscription"]
  P1 --> API["Query API"]
  P2 --> API`}
/>

দামটাও পরিষ্কার হওয়া দরকার। Log-ই সত্য মানে **সব query-ই projection-এর উপর নির্ভরশীল**, আর projection সবসময় সামান্য পিছিয়ে থাকে। "লিখলাম, সাথে সাথে পড়লাম, দেখি না" — এই read-your-writes সমস্যাটা event-driven সিস্টেমে ডিফল্ট আচরণ, ব্যতিক্রম নয়। এর সমাধান UI-তে করতে হয় (আশাবাদী আপডেট), বা লেখার সময় projection version ফেরত দিয়ে পড়ার সময় সেই version পর্যন্ত অপেক্ষা করিয়ে।

## Event store এবং projection

নিচের কোডটা একটা সম্পূর্ণ event store — optimistic concurrency, subscription, এবং checkpoint সহ replay-যোগ্য projection। একটা লাইব্রেরির ধার-ফেরত ডোমেইন ধরে লেখা।

<CodeTabs tsFile="event-store.ts" goFile="event_store.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// --- Event envelope ---
export interface EventEnvelope<T = unknown> {
	globalPosition: number; // position in the whole log
	streamId: string; // e.g. "manuscript-geometry-01"
	streamVersion: number; // position within this stream
	type: string;
	schemaVersion: number;
	payload: T;
	recordedAt: string;
	correlationId: string;
}

export interface AppendCandidate<T = unknown> {
	type: string;
	schemaVersion: number;
	payload: T;
	correlationId: string;
}

export class ConcurrencyError extends Error {
	constructor(streamId: string, expected: number, actual: number) {
		super(`stream ${streamId}: expected version ${expected}, found ${actual}`);
		this.name = 'ConcurrencyError';
	}
}

type Subscriber = (event: EventEnvelope) => void | Promise<void>;

// --- Event store ---
export class EventStore {
	private log: EventEnvelope[] = [];
	private streamVersions = new Map<string, number>();
	private subscribers: Subscriber[] = [];

	/**
	 * Append with optimistic concurrency. expectedVersion is the version the
	 * caller believes the stream is at; -1 means "the stream must not exist".
	 * This single check is what makes concurrent command handling safe without
	 * any distributed lock.
	 */
	async append(
		streamId: string,
		expectedVersion: number,
		candidates: AppendCandidate[]
	): Promise<EventEnvelope[]> {
		const current = this.streamVersions.get(streamId) ?? -1;
		if (current !== expectedVersion) {
			throw new ConcurrencyError(streamId, expectedVersion, current);
		}

		const written: EventEnvelope[] = [];
		let version = current;

		for (const candidate of candidates) {
			version += 1;
			const envelope: EventEnvelope = {
				globalPosition: this.log.length,
				streamId,
				streamVersion: version,
				type: candidate.type,
				schemaVersion: candidate.schemaVersion,
				payload: candidate.payload,
				recordedAt: new Date().toISOString(),
				correlationId: candidate.correlationId
			};
			this.log.push(envelope);
			written.push(envelope);
		}

		this.streamVersions.set(streamId, version);

		for (const envelope of written) {
			for (const sub of this.subscribers) {
				await sub(envelope);
			}
		}
		return written;
	}

	readStream(streamId: string): EventEnvelope[] {
		return this.log.filter((e) => e.streamId === streamId);
	}

	/** Read the whole log from a checkpoint. This is how projections rebuild. */
	readAll(fromPosition = 0, limit = 500): EventEnvelope[] {
		return this.log.slice(fromPosition, fromPosition + limit);
	}

	subscribe(fn: Subscriber): void {
		this.subscribers.push(fn);
	}

	get size(): number {
		return this.log.length;
	}
}

// --- Domain events ---
interface ManuscriptRegistered {
	title: string;
	shelf: string;
}
interface ManuscriptBorrowed {
	borrower: string;
	dueDays: number;
}
interface ManuscriptReturned {
	borrower: string;
	condition: 'good' | 'damaged';
}

// --- Aggregate: decides which events are allowed ---
type ManuscriptState = {
	exists: boolean;
	title: string;
	shelf: string;
	borrowedBy: string | null;
	version: number;
};

const EMPTY_STATE: ManuscriptState = {
	exists: false,
	title: '',
	shelf: '',
	borrowedBy: null,
	version: -1
};

function applyEvent(state: ManuscriptState, event: EventEnvelope): ManuscriptState {
	switch (event.type) {
		case 'ManuscriptRegistered': {
			const p = event.payload as ManuscriptRegistered;
			return {
				...state,
				exists: true,
				title: p.title,
				shelf: p.shelf,
				version: event.streamVersion
			};
		}
		case 'ManuscriptBorrowed': {
			const p = event.payload as ManuscriptBorrowed;
			return { ...state, borrowedBy: p.borrower, version: event.streamVersion };
		}
		case 'ManuscriptReturned':
			return { ...state, borrowedBy: null, version: event.streamVersion };
		default:
			return { ...state, version: event.streamVersion };
	}
}

function rehydrate(events: EventEnvelope[]): ManuscriptState {
	return events.reduce(applyEvent, EMPTY_STATE);
}

// --- Command handlers ---
export class LibraryService {
	constructor(private readonly store: EventStore) {}

	async register(id: string, title: string, shelf: string, correlationId: string): Promise<void> {
		const state = rehydrate(this.store.readStream(id));
		if (state.exists) throw new Error(`manuscript ${id} already registered`);

		await this.store.append(id, state.version, [
			{
				type: 'ManuscriptRegistered',
				schemaVersion: 2,
				payload: { title, shelf } satisfies ManuscriptRegistered,
				correlationId
			}
		]);
	}

	async borrow(id: string, borrower: string, correlationId: string): Promise<void> {
		const state = rehydrate(this.store.readStream(id));
		if (!state.exists) throw new Error(`manuscript ${id} not found`);
		if (state.borrowedBy) throw new Error(`already borrowed by ${state.borrowedBy}`);

		await this.store.append(id, state.version, [
			{
				type: 'ManuscriptBorrowed',
				schemaVersion: 1,
				payload: { borrower, dueDays: 14 } satisfies ManuscriptBorrowed,
				correlationId
			}
		]);
	}

	async giveBack(
		id: string,
		borrower: string,
		condition: 'good' | 'damaged',
		correlationId: string
	): Promise<void> {
		const state = rehydrate(this.store.readStream(id));
		if (state.borrowedBy !== borrower) throw new Error(`${borrower} does not hold ${id}`);

		await this.store.append(id, state.version, [
			{
				type: 'ManuscriptReturned',
				schemaVersion: 1,
				payload: { borrower, condition } satisfies ManuscriptReturned,
				correlationId
			}
		]);
	}
}

// --- Projections ---
export interface Projection {
	readonly name: string;
	checkpoint: number;
	handle(event: EventEnvelope): void;
	reset(): void;
}

/** Read model 1: what is on which shelf, and who holds it. */
export class ShelfProjection implements Projection {
	readonly name = 'shelf-view';
	checkpoint = 0;
	private rows = new Map<string, { title: string; shelf: string; holder: string | null }>();

	handle(event: EventEnvelope): void {
		switch (event.type) {
			case 'ManuscriptRegistered': {
				const p = event.payload as ManuscriptRegistered;
				this.rows.set(event.streamId, { title: p.title, shelf: p.shelf, holder: null });
				break;
			}
			case 'ManuscriptBorrowed': {
				const row = this.rows.get(event.streamId);
				if (row) row.holder = (event.payload as ManuscriptBorrowed).borrower;
				break;
			}
			case 'ManuscriptReturned': {
				const row = this.rows.get(event.streamId);
				if (row) row.holder = null;
				break;
			}
		}
		this.checkpoint = event.globalPosition + 1;
	}

	reset(): void {
		this.rows.clear();
		this.checkpoint = 0;
	}

	onShelf(shelf: string): string[] {
		return [...this.rows.entries()]
			.filter(([, r]) => r.shelf === shelf && r.holder === null)
			.map(([id]) => id);
	}
}

/** Read model 2: borrowing history per person, shaped for a different query. */
export class BorrowerProjection implements Projection {
	readonly name = 'borrower-view';
	checkpoint = 0;
	private counts = new Map<string, { borrowed: number; damaged: number }>();

	handle(event: EventEnvelope): void {
		if (event.type === 'ManuscriptBorrowed') {
			const p = event.payload as ManuscriptBorrowed;
			const row = this.counts.get(p.borrower) ?? { borrowed: 0, damaged: 0 };
			row.borrowed += 1;
			this.counts.set(p.borrower, row);
		}
		if (event.type === 'ManuscriptReturned') {
			const p = event.payload as ManuscriptReturned;
			if (p.condition === 'damaged') {
				const row = this.counts.get(p.borrower) ?? { borrowed: 0, damaged: 0 };
				row.damaged += 1;
				this.counts.set(p.borrower, row);
			}
		}
		this.checkpoint = event.globalPosition + 1;
	}

	reset(): void {
		this.counts.clear();
		this.checkpoint = 0;
	}

	report(): Array<[string, { borrowed: number; damaged: number }]> {
		return [...this.counts.entries()];
	}
}

/**
 * A projection runner. In production each projection runs as its own consumer
 * with its own checkpoint, so a slow projection never blocks a fast one, and
 * a broken projection can be reset and rebuilt on its own.
 */
export class ProjectionRunner {
	constructor(
		private readonly store: EventStore,
		private readonly projection: Projection
	) {}

	catchUp(): number {
		let processed = 0;
		for (;;) {
			const batch = this.store.readAll(this.projection.checkpoint, 200);
			if (batch.length === 0) break;
			for (const event of batch) {
				this.projection.handle(event);
				processed += 1;
			}
		}
		return processed;
	}

	rebuild(): number {
		console.log(`[projection] rebuilding ${this.projection.name} from position 0`);
		this.projection.reset();
		return this.catchUp();
	}
}

// --- Demo ---
async function demo(): Promise<void> {
	const store = new EventStore();
	const library = new LibraryService(store);

	await library.register('manuscript-geometry-01', 'Kitab al-Handasa', 'cordoba-A3', 'req-1001');
	await library.borrow('manuscript-geometry-01', 'al-biruni', 'req-1002');
	await library.giveBack('manuscript-geometry-01', 'al-biruni', 'damaged', 'req-1003');
	await library.borrow('manuscript-geometry-01', 'ibn-al-haytham', 'req-1004');

	const shelf = new ShelfProjection();
	const borrower = new BorrowerProjection();

	new ProjectionRunner(store, shelf).catchUp();
	new ProjectionRunner(store, borrower).catchUp();

	console.log('available on cordoba-A3:', shelf.onShelf('cordoba-A3'));
	console.log('borrower report:', borrower.report());

	// The borrower report was added long after the events were written,
	// yet it has full history — that is the whole point of the log.
	const rebuilt = new ProjectionRunner(store, borrower).rebuild();
	console.log(`rebuilt from ${rebuilt} events`);
}

void demo();
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// --- Event envelope ---

type EventEnvelope struct {
	GlobalPosition int             `json:"globalPosition"`
	StreamID       string          `json:"streamId"`
	StreamVersion  int             `json:"streamVersion"`
	Type           string          `json:"type"`
	SchemaVersion  int             `json:"schemaVersion"`
	Payload        json.RawMessage `json:"payload"`
	RecordedAt     time.Time       `json:"recordedAt"`
	CorrelationID  string          `json:"correlationId"`
}

type AppendCandidate struct {
	Type          string
	SchemaVersion int
	Payload       any
	CorrelationID string
}

type ConcurrencyError struct {
	StreamID string
	Expected int
	Actual   int
}

func (e *ConcurrencyError) Error() string {
	return fmt.Sprintf("stream %s: expected version %d, found %d", e.StreamID, e.Expected, e.Actual)
}

type Subscriber func(EventEnvelope)

// --- Event store ---

type EventStore struct {
	mu          sync.RWMutex
	log         []EventEnvelope
	versions    map[string]int
	subscribers []Subscriber
}

func NewEventStore() *EventStore {
	return &EventStore{versions: make(map[string]int)}
}

// Append uses optimistic concurrency: expectedVersion -1 means the stream
// must not exist yet. This replaces a distributed lock entirely.
func (s *EventStore) Append(streamID string, expectedVersion int, candidates []AppendCandidate) ([]EventEnvelope, error) {
	s.mu.Lock()

	current, ok := s.versions[streamID]
	if !ok {
		current = -1
	}
	if current != expectedVersion {
		s.mu.Unlock()
		return nil, &ConcurrencyError{StreamID: streamID, Expected: expectedVersion, Actual: current}
	}

	written := make([]EventEnvelope, 0, len(candidates))
	version := current

	for _, c := range candidates {
		raw, err := json.Marshal(c.Payload)
		if err != nil {
			s.mu.Unlock()
			return nil, err
		}
		version++
		env := EventEnvelope{
			GlobalPosition: len(s.log),
			StreamID:       streamID,
			StreamVersion:  version,
			Type:           c.Type,
			SchemaVersion:  c.SchemaVersion,
			Payload:        raw,
			RecordedAt:     time.Now().UTC(),
			CorrelationID:  c.CorrelationID,
		}
		s.log = append(s.log, env)
		written = append(written, env)
	}
	s.versions[streamID] = version

	subs := make([]Subscriber, len(s.subscribers))
	copy(subs, s.subscribers)
	s.mu.Unlock()

	for _, env := range written {
		for _, sub := range subs {
			sub(env)
		}
	}
	return written, nil
}

func (s *EventStore) ReadStream(streamID string) []EventEnvelope {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []EventEnvelope{}
	for _, e := range s.log {
		if e.StreamID == streamID {
			out = append(out, e)
		}
	}
	return out
}

func (s *EventStore) ReadAll(from, limit int) []EventEnvelope {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if from >= len(s.log) {
		return nil
	}
	end := from + limit
	if end > len(s.log) {
		end = len(s.log)
	}
	out := make([]EventEnvelope, end-from)
	copy(out, s.log[from:end])
	return out
}

func (s *EventStore) Subscribe(fn Subscriber) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.subscribers = append(s.subscribers, fn)
}

// --- Domain events ---

type ManuscriptRegistered struct {
	Title string `json:"title"`
	Shelf string `json:"shelf"`
}

type ManuscriptBorrowed struct {
	Borrower string `json:"borrower"`
	DueDays  int    `json:"dueDays"`
}

type ManuscriptReturned struct {
	Borrower  string `json:"borrower"`
	Condition string `json:"condition"` // good | damaged
}

// --- Aggregate ---

type ManuscriptState struct {
	Exists     bool
	Title      string
	Shelf      string
	BorrowedBy string
	Version    int
}

func applyEvent(state ManuscriptState, e EventEnvelope) ManuscriptState {
	switch e.Type {
	case "ManuscriptRegistered":
		var p ManuscriptRegistered
		_ = json.Unmarshal(e.Payload, &p)
		state.Exists = true
		state.Title = p.Title
		state.Shelf = p.Shelf
	case "ManuscriptBorrowed":
		var p ManuscriptBorrowed
		_ = json.Unmarshal(e.Payload, &p)
		state.BorrowedBy = p.Borrower
	case "ManuscriptReturned":
		state.BorrowedBy = ""
	}
	state.Version = e.StreamVersion
	return state
}

func rehydrate(events []EventEnvelope) ManuscriptState {
	state := ManuscriptState{Version: -1}
	for _, e := range events {
		state = applyEvent(state, e)
	}
	return state
}

// --- Command handlers ---

type LibraryService struct {
	store *EventStore
}

func (svc *LibraryService) Register(id, title, shelf, correlationID string) error {
	state := rehydrate(svc.store.ReadStream(id))
	if state.Exists {
		return fmt.Errorf("manuscript %s already registered", id)
	}
	_, err := svc.store.Append(id, state.Version, []AppendCandidate{{
		Type:          "ManuscriptRegistered",
		SchemaVersion: 2,
		Payload:       ManuscriptRegistered{Title: title, Shelf: shelf},
		CorrelationID: correlationID,
	}})
	return err
}

func (svc *LibraryService) Borrow(id, borrower, correlationID string) error {
	state := rehydrate(svc.store.ReadStream(id))
	if !state.Exists {
		return fmt.Errorf("manuscript %s not found", id)
	}
	if state.BorrowedBy != "" {
		return fmt.Errorf("already borrowed by %s", state.BorrowedBy)
	}
	_, err := svc.store.Append(id, state.Version, []AppendCandidate{{
		Type:          "ManuscriptBorrowed",
		SchemaVersion: 1,
		Payload:       ManuscriptBorrowed{Borrower: borrower, DueDays: 14},
		CorrelationID: correlationID,
	}})
	return err
}

func (svc *LibraryService) GiveBack(id, borrower, condition, correlationID string) error {
	state := rehydrate(svc.store.ReadStream(id))
	if state.BorrowedBy != borrower {
		return fmt.Errorf("%s does not hold %s", borrower, id)
	}
	_, err := svc.store.Append(id, state.Version, []AppendCandidate{{
		Type:          "ManuscriptReturned",
		SchemaVersion: 1,
		Payload:       ManuscriptReturned{Borrower: borrower, Condition: condition},
		CorrelationID: correlationID,
	}})
	return err
}

// --- Projections ---

type Projection interface {
	Name() string
	Checkpoint() int
	Handle(EventEnvelope)
	Reset()
}

type shelfRow struct {
	Title  string
	Shelf  string
	Holder string
}

type ShelfProjection struct {
	checkpoint int
	rows       map[string]*shelfRow
}

func NewShelfProjection() *ShelfProjection {
	return &ShelfProjection{rows: make(map[string]*shelfRow)}
}

func (p *ShelfProjection) Name() string    { return "shelf-view" }
func (p *ShelfProjection) Checkpoint() int { return p.checkpoint }

func (p *ShelfProjection) Handle(e EventEnvelope) {
	switch e.Type {
	case "ManuscriptRegistered":
		var d ManuscriptRegistered
		_ = json.Unmarshal(e.Payload, &d)
		p.rows[e.StreamID] = &shelfRow{Title: d.Title, Shelf: d.Shelf}
	case "ManuscriptBorrowed":
		var d ManuscriptBorrowed
		_ = json.Unmarshal(e.Payload, &d)
		if row, ok := p.rows[e.StreamID]; ok {
			row.Holder = d.Borrower
		}
	case "ManuscriptReturned":
		if row, ok := p.rows[e.StreamID]; ok {
			row.Holder = ""
		}
	}
	p.checkpoint = e.GlobalPosition + 1
}

func (p *ShelfProjection) Reset() {
	p.rows = make(map[string]*shelfRow)
	p.checkpoint = 0
}

func (p *ShelfProjection) OnShelf(shelf string) []string {
	out := []string{}
	for id, row := range p.rows {
		if row.Shelf == shelf && row.Holder == "" {
			out = append(out, id)
		}
	}
	return out
}

type borrowerRow struct {
	Borrowed int
	Damaged  int
}

type BorrowerProjection struct {
	checkpoint int
	counts     map[string]*borrowerRow
}

func NewBorrowerProjection() *BorrowerProjection {
	return &BorrowerProjection{counts: make(map[string]*borrowerRow)}
}

func (p *BorrowerProjection) Name() string    { return "borrower-view" }
func (p *BorrowerProjection) Checkpoint() int { return p.checkpoint }

func (p *BorrowerProjection) Handle(e EventEnvelope) {
	switch e.Type {
	case "ManuscriptBorrowed":
		var d ManuscriptBorrowed
		_ = json.Unmarshal(e.Payload, &d)
		p.row(d.Borrower).Borrowed++
	case "ManuscriptReturned":
		var d ManuscriptReturned
		_ = json.Unmarshal(e.Payload, &d)
		if d.Condition == "damaged" {
			p.row(d.Borrower).Damaged++
		}
	}
	p.checkpoint = e.GlobalPosition + 1
}

func (p *BorrowerProjection) row(name string) *borrowerRow {
	if r, ok := p.counts[name]; ok {
		return r
	}
	r := &borrowerRow{}
	p.counts[name] = r
	return r
}

func (p *BorrowerProjection) Reset() {
	p.counts = make(map[string]*borrowerRow)
	p.checkpoint = 0
}

func (p *BorrowerProjection) Report() map[string]borrowerRow {
	out := make(map[string]borrowerRow, len(p.counts))
	for k, v := range p.counts {
		out[k] = *v
	}
	return out
}

// --- Projection runner ---

type ProjectionRunner struct {
	store      *EventStore
	projection Projection
}

func (r *ProjectionRunner) CatchUp() int {
	processed := 0
	for {
		batch := r.store.ReadAll(r.projection.Checkpoint(), 200)
		if len(batch) == 0 {
			return processed
		}
		for _, e := range batch {
			r.projection.Handle(e)
			processed++
		}
	}
}

func (r *ProjectionRunner) Rebuild() int {
	fmt.Printf("[projection] rebuilding %s from position 0\n", r.projection.Name())
	r.projection.Reset()
	return r.CatchUp()
}

func main() {
	store := NewEventStore()
	library := &LibraryService{store: store}

	must(library.Register("manuscript-geometry-01", "Kitab al-Handasa", "cordoba-A3", "req-1001"))
	must(library.Borrow("manuscript-geometry-01", "al-biruni", "req-1002"))
	must(library.GiveBack("manuscript-geometry-01", "al-biruni", "damaged", "req-1003"))
	must(library.Borrow("manuscript-geometry-01", "ibn-al-haytham", "req-1004"))

	shelf := NewShelfProjection()
	borrower := NewBorrowerProjection()

	(&ProjectionRunner{store: store, projection: shelf}).CatchUp()
	(&ProjectionRunner{store: store, projection: borrower}).CatchUp()

	fmt.Println("available on cordoba-A3:", shelf.OnShelf("cordoba-A3"))
	fmt.Printf("borrower report: %+v\n", borrower.Report())

	rebuilt := (&ProjectionRunner{store: store, projection: borrower}).Rebuild()
	fmt.Printf("rebuilt from %d events\n", rebuilt)
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
```

</div>
</CodeTabs>

<Callout type="tip">

প্রতিটা projection-এর নিজস্ব checkpoint থাকা কেন জরুরি, সেটা একটা বাস্তব দৃশ্যে বোঝা যায়: রাত দুটোয় একটা projection-এর কোডে bug ধরা পড়ল। যদি সব projection একই checkpoint ভাগ করত, ওই একটা projection ঠিক করতে গিয়ে সবগুলোকে থামাতে হতো। আলাদা checkpoint থাকলে আপনি শুধু ভাঙাটাকে reset করে rebuild করবেন, বাকিরা চলতেই থাকবে।

</Callout>

## Outbox প্যাটার্ন

সবচেয়ে ঘন ঘন যে bug event-driven সিস্টেমে ঢোকে, সেটা এক লাইনে বলা যায়: **ডেটাবেসে লেখা আর broker-এ পাঠানো — এই দুটো একসাথে atomic নয়।**

```
// The bug that ships to production more often than any other
await db.orders.insert(order);      // committed
await broker.publish(orderCreated); // process dies here
```

ফল: ডেটাবেসে order আছে, কেউ জানে না। উল্টো ক্রমে লিখলে উল্টো bug: সবাই জানে, ডেটাবেসে কিছু নেই।

Outbox প্যাটার্ন এই দুটো লেখাকে **একই ট্রানজেকশনে** ঢুকিয়ে দেয়। আপনি business row আর একটা `outbox` row একসাথে commit করেন। তারপর একটা আলাদা relay প্রসেস outbox থেকে না-পাঠানো row-গুলো তুলে broker-এ পাঠায় এবং পাঠানো হয়ে গেলে চিহ্ন দেয়।

<Mermaid
title="Transactional Outbox"
code={`sequenceDiagram
  participant S as Service
  participant DB as Database
  participant R as Outbox Relay
  participant B as Broker
  S->>DB: BEGIN
  S->>DB: insert order row
  S->>DB: insert outbox row
  S->>DB: COMMIT
  Note over DB: both rows or neither
  R->>DB: select unpublished outbox rows
  R->>B: publish events
  B-->>R: ack
  R->>DB: mark rows published`}
/>

এখানে একটা জিনিস স্পষ্ট থাকা দরকার: outbox আপনাকে **at-least-once** ডেলিভারি দেয়, exactly-once নয়। Relay broker-এ পাঠানোর পর কিন্তু চিহ্ন দেওয়ার আগে মরে গেলে বার্তাটা আবার যাবে। তাই consumer-কে অবশ্যই idempotent হতে হবে — সাধারণত event id দেখে ডুপ্লিকেট বাদ দিয়ে।

<CodeTabs tsFile="outbox-relay.ts" goFile="outbox_relay.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import { randomUUID } from 'node:crypto';

// --- A tiny transactional store, standing in for Postgres ---
interface OrderRow {
	id: string;
	customer: string;
	city: string;
	amountDirham: number;
	status: 'placed' | 'cancelled';
}

interface OutboxRow {
	id: string;
	aggregateId: string;
	type: string;
	payload: unknown;
	createdAt: number;
	publishedAt: number | null;
	attempts: number;
}

class Database {
	readonly orders = new Map<string, OrderRow>();
	readonly outbox: OutboxRow[] = [];
	private inTransaction = false;

	/**
	 * The point of the whole pattern: business rows and outbox rows are
	 * written inside ONE transaction, so they cannot diverge.
	 */
	transaction<T>(fn: (tx: Transaction) => T): T {
		if (this.inTransaction) throw new Error('nested transaction');
		this.inTransaction = true;
		const staged: Array<() => void> = [];
		const tx: Transaction = {
			insertOrder: (row) => staged.push(() => this.orders.set(row.id, row)),
			insertOutbox: (row) => staged.push(() => this.outbox.push(row))
		};
		try {
			const result = fn(tx);
			staged.forEach((apply) => apply()); // commit
			return result;
		} finally {
			this.inTransaction = false;
		}
	}
}

interface Transaction {
	insertOrder(row: OrderRow): void;
	insertOutbox(row: OutboxRow): void;
}

// --- Broker ---
interface Broker {
	publish(topic: string, eventId: string, payload: unknown): Promise<void>;
}

class FlakyBroker implements Broker {
	readonly delivered: Array<{ eventId: string; payload: unknown }> = [];
	failNext = 0;

	async publish(topic: string, eventId: string, payload: unknown): Promise<void> {
		if (this.failNext > 0) {
			this.failNext -= 1;
			throw new Error(`broker unavailable for ${topic}`);
		}
		this.delivered.push({ eventId, payload });
	}
}

// --- Service writes both rows atomically ---
class OrderService {
	constructor(private readonly db: Database) {}

	placeOrder(customer: string, city: string, amountDirham: number): string {
		const orderId = randomUUID();

		this.db.transaction((tx) => {
			tx.insertOrder({ id: orderId, customer, city, amountDirham, status: 'placed' });
			tx.insertOutbox({
				id: randomUUID(),
				aggregateId: orderId,
				type: 'OrderPlaced',
				payload: { orderId, customer, city, amountDirham },
				createdAt: Date.now(),
				publishedAt: null,
				attempts: 0
			});
		});

		return orderId;
	}
}

// --- Relay drains the outbox ---
class OutboxRelay {
	private stopped = false;

	constructor(
		private readonly db: Database,
		private readonly broker: Broker,
		private readonly batchSize = 50,
		private readonly maxAttempts = 8
	) {}

	/**
	 * Ordering matters: publish first, mark second. If we crash between the
	 * two, the event is delivered twice — which consumers must tolerate.
	 * The reverse order would lose events, which nobody can tolerate.
	 */
	async drainOnce(): Promise<number> {
		const pending = this.db.outbox
			.filter((r) => r.publishedAt === null && r.attempts < this.maxAttempts)
			.slice(0, this.batchSize);

		let published = 0;
		for (const row of pending) {
			try {
				await this.broker.publish(row.type, row.id, row.payload);
				row.publishedAt = Date.now();
				published += 1;
			} catch (err) {
				row.attempts += 1;
				const backoffMs = Math.min(30_000, 2 ** row.attempts * 100);
				console.log(
					`[outbox] ${row.type} ${row.id} failed (attempt ${row.attempts}), retry in ${backoffMs}ms: ${(err as Error).message}`
				);
				break; // preserve ordering: do not skip ahead past a failure
			}
		}
		return published;
	}

	async run(intervalMs = 200): Promise<void> {
		while (!this.stopped) {
			await this.drainOnce();
			await new Promise((r) => setTimeout(r, intervalMs));
		}
	}

	stop(): void {
		this.stopped = true;
	}

	deadLetters(): OutboxRow[] {
		return this.db.outbox.filter((r) => r.publishedAt === null && r.attempts >= this.maxAttempts);
	}
}

// --- Idempotent consumer ---
class ShippingConsumer {
	private seen = new Set<string>();
	readonly shipments: string[] = [];

	handle(eventId: string, payload: { orderId: string; city: string }): void {
		if (this.seen.has(eventId)) {
			console.log(`[shipping] duplicate ${eventId} ignored`);
			return;
		}
		this.seen.add(eventId);
		this.shipments.push(`${payload.orderId} -> ${payload.city}`);
	}
}

// --- Demo ---
async function demo(): Promise<void> {
	const db = new Database();
	const broker = new FlakyBroker();
	const service = new OrderService(db);
	const relay = new OutboxRelay(db, broker);
	const shipping = new ShippingConsumer();

	service.placeOrder('fatima-al-fihri', 'fez', 1200);
	service.placeOrder('al-khwarizmi', 'baghdad', 340);

	broker.failNext = 1; // first drain attempt fails
	console.log('published:', await relay.drainOnce());
	console.log('published:', await relay.drainOnce());

	// Simulate the crash-after-publish case: same event delivered twice
	for (const msg of [...broker.delivered, broker.delivered[0]]) {
		shipping.handle(msg.eventId, msg.payload as { orderId: string; city: string });
	}
	console.log('shipments:', shipping.shipments);
	console.log('dead letters:', relay.deadLetters().length);
}

void demo();
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

// --- Rows ---

type OrderRow struct {
	ID           string
	Customer     string
	City         string
	AmountDirham int
	Status       string
}

type OutboxRow struct {
	ID          string
	AggregateID string
	Type        string
	Payload     map[string]any
	CreatedAt   time.Time
	PublishedAt *time.Time
	Attempts    int
}

// --- A tiny transactional store ---

type Database struct {
	mu     sync.Mutex
	Orders map[string]OrderRow
	Outbox []*OutboxRow
}

func NewDatabase() *Database {
	return &Database{Orders: make(map[string]OrderRow)}
}

type Transaction struct {
	staged []func()
}

func (t *Transaction) InsertOrder(db *Database, row OrderRow) {
	t.staged = append(t.staged, func() { db.Orders[row.ID] = row })
}

func (t *Transaction) InsertOutbox(db *Database, row *OutboxRow) {
	t.staged = append(t.staged, func() { db.Outbox = append(db.Outbox, row) })
}

// Transaction commits business rows and outbox rows together or not at all.
func (db *Database) Transaction(fn func(tx *Transaction)) {
	db.mu.Lock()
	defer db.mu.Unlock()
	tx := &Transaction{}
	fn(tx)
	for _, apply := range tx.staged {
		apply()
	}
}

// --- Broker ---

type Broker interface {
	Publish(topic, eventID string, payload map[string]any) error
}

type FlakyBroker struct {
	mu        sync.Mutex
	Delivered []struct {
		EventID string
		Payload map[string]any
	}
	FailNext int
}

func (b *FlakyBroker) Publish(topic, eventID string, payload map[string]any) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.FailNext > 0 {
		b.FailNext--
		return errors.New("broker unavailable for " + topic)
	}
	b.Delivered = append(b.Delivered, struct {
		EventID string
		Payload map[string]any
	}{eventID, payload})
	return nil
}

// --- Service ---

type OrderService struct {
	db *Database
}

func (s *OrderService) PlaceOrder(customer, city string, amount int) string {
	orderID := uuid.NewString()

	s.db.Transaction(func(tx *Transaction) {
		tx.InsertOrder(s.db, OrderRow{
			ID: orderID, Customer: customer, City: city,
			AmountDirham: amount, Status: "placed",
		})
		tx.InsertOutbox(s.db, &OutboxRow{
			ID:          uuid.NewString(),
			AggregateID: orderID,
			Type:        "OrderPlaced",
			Payload: map[string]any{
				"orderId": orderID, "customer": customer,
				"city": city, "amountDirham": amount,
			},
			CreatedAt: time.Now(),
		})
	})

	return orderID
}

// --- Relay ---

type OutboxRelay struct {
	db          *Database
	broker      Broker
	batchSize   int
	maxAttempts int
	stop        chan struct{}
}

func NewOutboxRelay(db *Database, b Broker) *OutboxRelay {
	return &OutboxRelay{db: db, broker: b, batchSize: 50, maxAttempts: 8, stop: make(chan struct{})}
}

// DrainOnce publishes first and marks second. A crash in between causes a
// duplicate delivery, which consumers must tolerate. The reverse order
// would silently lose events.
func (r *OutboxRelay) DrainOnce() int {
	r.db.mu.Lock()
	pending := []*OutboxRow{}
	for _, row := range r.db.Outbox {
		if row.PublishedAt == nil && row.Attempts < r.maxAttempts {
			pending = append(pending, row)
			if len(pending) >= r.batchSize {
				break
			}
		}
	}
	r.db.mu.Unlock()

	published := 0
	for _, row := range pending {
		if err := r.broker.Publish(row.Type, row.ID, row.Payload); err != nil {
			row.Attempts++
			backoff := time.Duration(1<<uint(row.Attempts)) * 100 * time.Millisecond
			if backoff > 30*time.Second {
				backoff = 30 * time.Second
			}
			fmt.Printf("[outbox] %s %s failed (attempt %d), retry in %s: %v\n",
				row.Type, row.ID, row.Attempts, backoff, err)
			break // preserve ordering
		}
		now := time.Now()
		row.PublishedAt = &now
		published++
	}
	return published
}

func (r *OutboxRelay) Run(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			r.DrainOnce()
		case <-r.stop:
			return
		}
	}
}

func (r *OutboxRelay) Stop() { close(r.stop) }

func (r *OutboxRelay) DeadLetters() []*OutboxRow {
	out := []*OutboxRow{}
	for _, row := range r.db.Outbox {
		if row.PublishedAt == nil && row.Attempts >= r.maxAttempts {
			out = append(out, row)
		}
	}
	return out
}

// --- Idempotent consumer ---

type ShippingConsumer struct {
	seen      map[string]bool
	Shipments []string
}

func NewShippingConsumer() *ShippingConsumer {
	return &ShippingConsumer{seen: make(map[string]bool)}
}

func (c *ShippingConsumer) Handle(eventID string, payload map[string]any) {
	if c.seen[eventID] {
		fmt.Printf("[shipping] duplicate %s ignored\n", eventID)
		return
	}
	c.seen[eventID] = true
	c.Shipments = append(c.Shipments, fmt.Sprintf("%v -> %v", payload["orderId"], payload["city"]))
}

func main() {
	db := NewDatabase()
	broker := &FlakyBroker{}
	service := &OrderService{db: db}
	relay := NewOutboxRelay(db, broker)
	shipping := NewShippingConsumer()

	service.PlaceOrder("fatima-al-fihri", "fez", 1200)
	service.PlaceOrder("al-khwarizmi", "baghdad", 340)

	broker.FailNext = 1
	fmt.Println("published:", relay.DrainOnce())
	fmt.Println("published:", relay.DrainOnce())

	// Simulate crash-after-publish: the first event arrives twice
	msgs := append([]struct {
		EventID string
		Payload map[string]any
	}{}, broker.Delivered...)
	msgs = append(msgs, broker.Delivered[0])

	for _, m := range msgs {
		shipping.Handle(m.EventID, m.Payload)
	}

	fmt.Println("shipments:", shipping.Shipments)
	fmt.Println("dead letters:", len(relay.DeadLetters()))
}
```

</div>
</CodeTabs>

<Callout type="info">

Outbox টেবিল নিজে হাতে relay না করে **Change Data Capture** দিয়েও একই ফল পাওয়া যায়: Debezium ডেটাবেসের replication log পড়ে outbox row-গুলো সরাসরি Kafka-তে পাঠায়। সুবিধা হলো relay প্রসেসটা আপনার নয়, আর ordering ডেটাবেসের log থেকেই আসে। অসুবিধা হলো আরেকটা অবকাঠামো, আর CDC pipeline পিছিয়ে পড়লে সেটা টের পাওয়ার জন্য আলাদা monitoring লাগে।

</Callout>

## Saga: একাধিক সার্ভিসজুড়ে workflow

একটা order-এর জন্য পেমেন্ট নিতে হবে, ইনভেন্টরি ধরে রাখতে হবে, শিপমেন্ট বানাতে হবে — তিনটা আলাদা সার্ভিস, তিনটা আলাদা ডেটাবেস। এখানে একটা ACID ট্রানজেকশন সম্ভব নয়, তাই আপনাকে workflow-কে ছোট ছোট local transaction-এর ধারায় ভাঙতে হবে, আর প্রতিটার জন্য একটা **compensating transaction** লিখতে হবে।

Saga-র দুটো রূপ আছে, আর পছন্দটা গুরুত্বপূর্ণ।

**Choreography** — কোনো কেন্দ্রীয় নিয়ন্ত্রক নেই। প্রতিটা সার্ভিস event শোনে এবং নিজের কাজ করে পরের event ছাড়ে। ছোট workflow-তে চমৎকার: কোড কম, coupling কম। কিন্তু ধাপ বাড়লে "এখন কোথায় আটকে আছে" প্রশ্নের উত্তর কারও কাছে থাকে না, কারণ পুরো flow কোনো এক জায়গায় লেখা নেই।

**Orchestration** — একটা orchestrator ধাপে ধাপে command পাঠায় এবং reply শুনে পরের ধাপ ঠিক করে। Flow-টা একটা জায়গায় স্পষ্ট লেখা থাকে, timeout আর compensation সহজে সামলানো যায়, debugging সহজ। দাম হলো orchestrator নিজেই একটা কম্পোনেন্ট যাকে বাঁচিয়ে রাখতে হয়।

<Callout type="tip">

নিয়মটা সহজ: তিন ধাপ পর্যন্ত choreography, তার বেশি হলে orchestration। "কোন order-টা কোন ধাপে আটকে আছে" — এই প্রশ্নের উত্তর যদি একটা query দিয়ে দিতে না পারেন, তাহলে আপনার orchestration দরকার ছিল।

</Callout>

<Mermaid
title="Saga with Compensation"
code={`sequenceDiagram
  participant O as Orchestrator
  participant P as Payment
  participant I as Inventory
  participant S as Shipping
  O->>P: authorise payment
  P-->>O: authorised
  O->>I: reserve stock
  I-->>O: reserved
  O->>S: create shipment
  S-->>O: FAILED no courier in fez
  O->>I: release stock (compensate)
  O->>P: void authorisation (compensate)
  O-->>O: saga marked compensated`}
/>

নিচে একটা orchestrator যা ধাপ, compensation, retry আর অবস্থার ইতিহাস — সবই ধরে রাখে।

<CodeTabs tsFile="saga.ts" goFile="saga.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
export interface SagaContext {
	sagaId: string;
	data: Record<string, unknown>;
}

export interface SagaStep {
	name: string;
	/** Forward action. Must be idempotent: it can be retried. */
	execute(ctx: SagaContext): Promise<void>;
	/** Undo action. Must also be idempotent, and must never throw fatally. */
	compensate(ctx: SagaContext): Promise<void>;
	retries?: number;
}

export type SagaStatus = 'running' | 'completed' | 'compensating' | 'compensated' | 'stuck';

export interface SagaRecord {
	sagaId: string;
	status: SagaStatus;
	completedSteps: string[];
	failedStep?: string;
	history: string[];
}

export class SagaOrchestrator {
	private readonly records = new Map<string, SagaRecord>();

	constructor(private readonly steps: SagaStep[]) {}

	async run(ctx: SagaContext): Promise<SagaRecord> {
		const record: SagaRecord = {
			sagaId: ctx.sagaId,
			status: 'running',
			completedSteps: [],
			history: []
		};
		this.records.set(ctx.sagaId, record);

		for (const step of this.steps) {
			const ok = await this.executeWithRetry(step, ctx, record);
			if (!ok) {
				record.status = 'compensating';
				record.failedStep = step.name;
				await this.compensate(ctx, record);
				return record;
			}
			record.completedSteps.push(step.name);
			record.history.push(`ok: ${step.name}`);
		}

		record.status = 'completed';
		return record;
	}

	private async executeWithRetry(
		step: SagaStep,
		ctx: SagaContext,
		record: SagaRecord
	): Promise<boolean> {
		const maxAttempts = (step.retries ?? 2) + 1;
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				await step.execute(ctx);
				return true;
			} catch (err) {
				record.history.push(
					`fail(${attempt}/${maxAttempts}): ${step.name} — ${(err as Error).message}`
				);
				if (attempt === maxAttempts) return false;
				await new Promise((r) => setTimeout(r, 2 ** attempt * 50));
			}
		}
		return false;
	}

	/**
	 * Compensation runs in reverse order over the steps that actually
	 * succeeded. A compensation that keeps failing must not block the rest:
	 * we record it and mark the saga stuck for a human to look at.
	 */
	private async compensate(ctx: SagaContext, record: SagaRecord): Promise<void> {
		const done = [...record.completedSteps].reverse();
		let allClean = true;

		for (const name of done) {
			const step = this.steps.find((s) => s.name === name);
			if (!step) continue;
			try {
				await step.compensate(ctx);
				record.history.push(`compensated: ${name}`);
			} catch (err) {
				allClean = false;
				record.history.push(`compensation failed: ${name} — ${(err as Error).message}`);
			}
		}

		record.status = allClean ? 'compensated' : 'stuck';
	}

	inspect(sagaId: string): SagaRecord | undefined {
		return this.records.get(sagaId);
	}
}

// --- Concrete steps for an order in Fez ---
const paymentStep: SagaStep = {
	name: 'authorise-payment',
	retries: 2,
	async execute(ctx) {
		ctx.data.paymentRef = `auth-${ctx.sagaId.slice(0, 8)}`;
		console.log(`[payment] authorised ${ctx.data.amountDirham} dirham for ${ctx.data.customer}`);
	},
	async compensate(ctx) {
		console.log(`[payment] voiding ${ctx.data.paymentRef}`);
	}
};

const inventoryStep: SagaStep = {
	name: 'reserve-stock',
	retries: 3,
	async execute(ctx) {
		ctx.data.reservationRef = `res-${ctx.sagaId.slice(0, 8)}`;
		console.log(`[inventory] reserved ${ctx.data.sku}`);
	},
	async compensate(ctx) {
		console.log(`[inventory] releasing ${ctx.data.reservationRef}`);
	}
};

const shippingStep: SagaStep = {
	name: 'create-shipment',
	retries: 1,
	async execute(ctx) {
		if (ctx.data.city === 'fez') {
			throw new Error('no courier available in fez');
		}
		console.log(`[shipping] shipment created for ${ctx.data.city}`);
	},
	async compensate() {
		console.log('[shipping] cancelling shipment');
	}
};

async function demo(): Promise<void> {
	const orchestrator = new SagaOrchestrator([paymentStep, inventoryStep, shippingStep]);

	const failed = await orchestrator.run({
		sagaId: 'saga-fez-0001',
		data: { customer: 'fatima-al-fihri', city: 'fez', sku: 'astrolabe-small', amountDirham: 1200 }
	});
	console.log(failed.status, failed.history);

	const ok = await orchestrator.run({
		sagaId: 'saga-cordoba-0002',
		data: { customer: 'ibn-rushd', city: 'cordoba', sku: 'astrolabe-small', amountDirham: 1200 }
	});
	console.log(ok.status, ok.history);
}

void demo();
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"errors"
	"fmt"
	"time"
)

type SagaContext struct {
	SagaID string
	Data   map[string]any
}

type SagaStep interface {
	Name() string
	Execute(ctx *SagaContext) error
	Compensate(ctx *SagaContext) error
	Retries() int
}

type SagaStatus string

const (
	StatusRunning      SagaStatus = "running"
	StatusCompleted    SagaStatus = "completed"
	StatusCompensating SagaStatus = "compensating"
	StatusCompensated  SagaStatus = "compensated"
	StatusStuck        SagaStatus = "stuck"
)

type SagaRecord struct {
	SagaID         string
	Status         SagaStatus
	CompletedSteps []string
	FailedStep     string
	History        []string
}

type SagaOrchestrator struct {
	steps   []SagaStep
	records map[string]*SagaRecord
}

func NewSagaOrchestrator(steps ...SagaStep) *SagaOrchestrator {
	return &SagaOrchestrator{steps: steps, records: make(map[string]*SagaRecord)}
}

func (o *SagaOrchestrator) Run(ctx *SagaContext) *SagaRecord {
	record := &SagaRecord{SagaID: ctx.SagaID, Status: StatusRunning}
	o.records[ctx.SagaID] = record

	for _, step := range o.steps {
		if !o.executeWithRetry(step, ctx, record) {
			record.Status = StatusCompensating
			record.FailedStep = step.Name()
			o.compensate(ctx, record)
			return record
		}
		record.CompletedSteps = append(record.CompletedSteps, step.Name())
		record.History = append(record.History, "ok: "+step.Name())
	}

	record.Status = StatusCompleted
	return record
}

func (o *SagaOrchestrator) executeWithRetry(step SagaStep, ctx *SagaContext, rec *SagaRecord) bool {
	maxAttempts := step.Retries() + 1
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err := step.Execute(ctx)
		if err == nil {
			return true
		}
		rec.History = append(rec.History,
			fmt.Sprintf("fail(%d/%d): %s - %v", attempt, maxAttempts, step.Name(), err))
		if attempt == maxAttempts {
			return false
		}
		time.Sleep(time.Duration(1<<uint(attempt)) * 50 * time.Millisecond)
	}
	return false
}

// compensate runs in reverse over the steps that actually succeeded.
func (o *SagaOrchestrator) compensate(ctx *SagaContext, rec *SagaRecord) {
	allClean := true

	for i := len(rec.CompletedSteps) - 1; i >= 0; i-- {
		name := rec.CompletedSteps[i]
		var step SagaStep
		for _, s := range o.steps {
			if s.Name() == name {
				step = s
				break
			}
		}
		if step == nil {
			continue
		}
		if err := step.Compensate(ctx); err != nil {
			allClean = false
			rec.History = append(rec.History, "compensation failed: "+name+" - "+err.Error())
			continue
		}
		rec.History = append(rec.History, "compensated: "+name)
	}

	if allClean {
		rec.Status = StatusCompensated
	} else {
		rec.Status = StatusStuck
	}
}

func (o *SagaOrchestrator) Inspect(sagaID string) (*SagaRecord, bool) {
	r, ok := o.records[sagaID]
	return r, ok
}

// --- Concrete steps ---

type PaymentStep struct{}

func (PaymentStep) Name() string { return "authorise-payment" }
func (PaymentStep) Retries() int { return 2 }
func (PaymentStep) Execute(ctx *SagaContext) error {
	ctx.Data["paymentRef"] = "auth-" + ctx.SagaID
	fmt.Printf("[payment] authorised %v dirham for %v\n", ctx.Data["amountDirham"], ctx.Data["customer"])
	return nil
}
func (PaymentStep) Compensate(ctx *SagaContext) error {
	fmt.Printf("[payment] voiding %v\n", ctx.Data["paymentRef"])
	return nil
}

type InventoryStep struct{}

func (InventoryStep) Name() string { return "reserve-stock" }
func (InventoryStep) Retries() int { return 3 }
func (InventoryStep) Execute(ctx *SagaContext) error {
	ctx.Data["reservationRef"] = "res-" + ctx.SagaID
	fmt.Printf("[inventory] reserved %v\n", ctx.Data["sku"])
	return nil
}
func (InventoryStep) Compensate(ctx *SagaContext) error {
	fmt.Printf("[inventory] releasing %v\n", ctx.Data["reservationRef"])
	return nil
}

type ShippingStep struct{}

func (ShippingStep) Name() string { return "create-shipment" }
func (ShippingStep) Retries() int { return 1 }
func (ShippingStep) Execute(ctx *SagaContext) error {
	if ctx.Data["city"] == "fez" {
		return errors.New("no courier available in fez")
	}
	fmt.Printf("[shipping] shipment created for %v\n", ctx.Data["city"])
	return nil
}
func (ShippingStep) Compensate(*SagaContext) error {
	fmt.Println("[shipping] cancelling shipment")
	return nil
}

func main() {
	orchestrator := NewSagaOrchestrator(PaymentStep{}, InventoryStep{}, ShippingStep{})

	failed := orchestrator.Run(&SagaContext{
		SagaID: "saga-fez-0001",
		Data: map[string]any{
			"customer": "fatima-al-fihri", "city": "fez",
			"sku": "astrolabe-small", "amountDirham": 1200,
		},
	})
	fmt.Println(failed.Status, failed.History)

	ok := orchestrator.Run(&SagaContext{
		SagaID: "saga-cordoba-0002",
		Data: map[string]any{
			"customer": "ibn-rushd", "city": "cordoba",
			"sku": "astrolabe-small", "amountDirham": 1200,
		},
	})
	fmt.Println(ok.Status, ok.History)
}
```

</div>
</CodeTabs>

<Callout type="warning">

Compensation মানে "আগেরটা মুছে ফেলা" নয় — বাস্তবে টাকা ফেরত দেওয়া, স্টক ছেড়ে দেওয়া, বা একটা বাতিল-নোটিশ পাঠানো। ব্যবসায়িক দিক থেকেও পার্থক্য আছে: গ্রাহক তার স্টেটমেন্টে দুটো লাইনই দেখবে। তাই saga ডিজাইন করার সময় প্রথমে ব্যবসার লোকদের সাথে "উল্টো ধাপ" নিয়ে কথা বলুন — কিছু ধাপের বাস্তবিক কোনো উল্টো ধাপ নেই (ইমেইল পাঠানো হয়ে গেলে ফেরত আসে না), আর সেই ধাপগুলোকে ইচ্ছাকৃতভাবে workflow-র শেষে রাখতে হয়।

</Callout>

## Event schema-র ইভোলিউশন

Event log অমোচনীয়, তাই আজকের কোডকে তিন বছর আগের event পড়তে হবে। এই একটা বাস্তবতাই schema-র নিয়মগুলো ঠিক করে দেয়।

**নিরাপদ পরিবর্তন:**

- নতুন optional field যোগ করা (পুরনো event-এ default বসবে)
- নতুন event type যোগ করা (পুরনো consumer সেটা উপেক্ষা করবে)
- ঐচ্ছিক field-এর মান সমৃদ্ধ করা

**বিপজ্জনক পরিবর্তন:**

- field মুছে ফেলা বা নাম বদলানো
- field-এর type বদলানো (string থেকে number)
- কোনো field-এর **অর্থ** বদলানো — এটাই সবচেয়ে ভয়ংকর, কারণ কম্পাইলার ধরবে না। `amount` যদি আগে দিরহাম হয়ে থাকে আর আজ থেকে ফালুস হয়, পুরনো event replay করলে হিসাব ১০০ গুণ ভুল হবে, নীরবে।

দুটো কৌশল বাস্তবে কাজ করে।

**Upcasting** — পুরনো version-এর event পড়ার সময় সেটাকে ধাপে ধাপে সর্বশেষ version-এ রূপান্তর করে নেওয়া, তারপর একটাই handler দিয়ে চালানো। ডোমেইন কোড কেবল সর্বশেষ আকৃতি জানে।

**নতুন event type** — অর্থ বদলাতে হলে পুরনোটা বদলাবেন না, `PriceChangedV2` নামে নতুন type ছাড়বেন এবং দুটোই handle করবেন যতক্ষণ পুরনো ডেটা আছে।

```typescript
// --- Versioned payloads for the same logical event ---
interface OrderPlacedV1 {
	orderId: string;
	customer: string;
	amount: number; // ambiguous: which currency?
}

interface OrderPlacedV2 {
	orderId: string;
	customer: string;
	amount: number;
	currency: string; // added, defaulted for old events
}

interface OrderPlacedV3 {
	orderId: string;
	customer: string;
	amountMinor: number; // renamed and rescaled: integer minor units
	currency: string;
	city: string;
}

type Upcaster = (payload: Record<string, unknown>) => Record<string, unknown>;

/**
 * One upcaster per version step. Chaining them means a v1 event only ever
 * needs a v1->v2 and a v2->v3 rule, not a v1->v3 rule that must be rewritten
 * every time a new version appears.
 */
const upcasters: Record<string, Record<number, Upcaster>> = {
	OrderPlaced: {
		1: (p) => ({ ...p, currency: 'dirham' }),
		2: (p) => ({
			orderId: p.orderId,
			customer: p.customer,
			amountMinor: Math.round((p.amount as number) * 100),
			currency: p.currency,
			city: 'unknown'
		})
	}
};

const LATEST_VERSION: Record<string, number> = { OrderPlaced: 3 };

function upcast(
	type: string,
	version: number,
	payload: Record<string, unknown>
): Record<string, unknown> {
	let current = version;
	let result = payload;
	const target = LATEST_VERSION[type] ?? version;

	while (current < target) {
		const step = upcasters[type]?.[current];
		if (!step) {
			throw new Error(`no upcaster for ${type} v${current} -> v${current + 1}`);
		}
		result = step(result);
		current += 1;
	}
	return result;
}

// A five year old event, read by today's handler
const oldEvent = {
	type: 'OrderPlaced',
	schemaVersion: 1,
	payload: { orderId: 'ord-7781', customer: 'al-farabi', amount: 12.5 }
};

const modern = upcast(
	oldEvent.type,
	oldEvent.schemaVersion,
	oldEvent.payload
) as unknown as OrderPlacedV3;
console.log(modern);
// { orderId: 'ord-7781', customer: 'al-farabi', amountMinor: 1250, currency: 'dirham', city: 'unknown' }
```

<Callout type="tip">

Schema registry (Confluent Schema Registry, Avro বা Protobuf সহ) এই নিয়মগুলোকে যন্ত্র দিয়ে জোর করায়: producer নতুন schema register করার চেষ্টা করলে registry compatibility নিয়ম যাচাই করে, বেমানান হলে deploy আটকে দেয়। মানুষের শৃঙ্খলার উপর ভরসা করার চেয়ে এটা অনেক নির্ভরযোগ্য — বিশেষত যখন একই topic-এ পাঁচটা দল লিখছে।

</Callout>

## কখন এই স্থাপত্য বেছে নেবেন না

Event sourcing আর CQRS-এর সবচেয়ে বড় ঝুঁকি হলো এগুলো বুদ্ধিমান দেখায় এবং প্রয়োজনের অনেক আগেই গৃহীত হয়ে যায়।

**CRUD-ই যথেষ্ট যখন** ডোমেইনের ইতিহাস কারও কাজে লাগে না, আর একটাই read pattern আছে। একটা সেটিংস পেজের জন্য event sourcing মানে কেবল বাড়তি জটিলতা।

**শুধু CQRS নিন, event sourcing ছাড়া** — এটা একটা বৈধ ও প্রায়ই সেরা মাঝামাঝি অবস্থান। মূল ডেটা normalised টেবিলেই থাকল, কিন্তু পড়ার জন্য আলাদা denormalised view বানানো হলো। জটিলতা অনেক কম, লাভের বড় অংশটা পাওয়া যায়।

**পুরো event sourcing তখনই** যখন audit trail বাধ্যতামূলক, temporal query দরকার, বা ডোমেইনটাই স্বাভাবিকভাবে ঘটনার ধারা (আর্থিক লেনদেন, ইনভেন্টরি চলাচল, চিকিৎসা রেকর্ড)।

<div class="takeaways">

### মূল শেখা

- Command হলো নির্দেশ (একজন গ্রাহক, প্রত্যাখ্যানযোগ্য), event হলো অতীত কালের ঘোষণা (বহু গ্রাহক, অপরিবর্তনীয়) — নাম অতীত কালে না লিখতে পারলে ওটা event নয়
- Log-কে সত্যের উৎস বানালে অতীত ফিরে পাওয়া যায়, নতুন read model পুরনো ডেটাসহ বানানো যায়, আর projection-এর bug rebuild করে সারানো যায়
- প্রতিটা projection-এর নিজস্ব checkpoint থাকা চাই, যাতে একটা ভাঙলে বাকিরা চলতে থাকে এবং আলাদাভাবে rebuild করা যায়
- Optimistic concurrency (stream version যাচাই) distributed lock ছাড়াই concurrent command নিরাপদ করে
- ডেটাবেসে লেখা আর broker-এ পাঠানো কখনোই atomic নয় — outbox প্যাটার্ন দুটোকে এক ট্রানজেকশনে আনে, আর তার বিনিময়ে consumer-কে idempotent হতেই হয়
- Saga-তে প্রতিটা ধাপের একটা compensating transaction লাগে, compensation উল্টো ক্রমে চলে, আর অপরিবর্তনীয় ধাপ (ইমেইল, SMS) workflow-র শেষে রাখতে হয়
- তিন ধাপের বেশি হলে choreography ছেড়ে orchestration নিন — নইলে "কোথায় আটকে আছে" প্রশ্নের উত্তর কেউ দিতে পারবে না
- Event schema-তে field যোগ করা নিরাপদ, মুছে ফেলা বা **অর্থ বদলানো** বিপজ্জনক; upcaster chain বা নতুন event type দিয়ে ইভোলিউশন সামলান

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Kafka** কার্যত একটা distributed append-only log; retention বাড়িয়ে দিলে সেটাই event store হিসেবে ব্যবহার করা যায়, আর Kafka Streams দিয়ে projection চালানো হয়
- **Debezium** ডেটাবেসের replication log থেকে CDC করে outbox row-গুলো Kafka-তে পাঠায়, ফলে relay কোড নিজে লিখতে হয় না
- **Temporal** ও **AWS Step Functions** orchestration-ভিত্তিক saga চালায় এবং workflow-র state নিজেরাই durable রাখে
- **Stripe**-এর মতো পেমেন্ট সিস্টেমে প্রতিটা balance transaction একটা immutable event; ব্যালেন্স হলো তার projection
- **Confluent Schema Registry** producer-এর নতুন schema deploy আটকে দেয় যদি সেটা compatibility নিয়ম ভাঙে
- **Shopify** ও **Uber** order আর trip-এর মতো long-running workflow-এর জন্য orchestration ব্যবহার করে, কারণ ধাপ ও ব্যর্থতার সংখ্যা choreography-র সীমা ছাড়িয়ে যায়

</div>
