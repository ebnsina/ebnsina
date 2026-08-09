---
title: 'Observability ও SLO'
subtitle: 'Metric, log ও trace কোনটা কীসের জন্য, RED ও USE method, SLI/SLO/error budget, উপসর্গে alert করা, আর বাস্তব সংকেত থেকে capacity planning।'
chapter: 18
level: 'advanced'
readingTime: '২৭ মিনিট'
topics:
  [
    'observability',
    'metrics',
    'tracing',
    'RED method',
    'USE method',
    'SLO',
    'error budget',
    'alerting'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা হাসপাতালে তিন রকম কাগজ থাকে: দেয়ালের বোর্ডে আজকের মোট সংখ্যা, প্রতিটা রোগীর ফাইলে ঘটনার বিবরণ, আর একজন রোগীর দরজায়-দরজায় ঘোরার সময়সূচি। তিনটাই দরকার, আর তিনটা তিন প্রশ্নের উত্তর দেয়।

</Callout>

## গল্পে বুঝি

বাগদাদের বিমারিস্তানের প্রধান আল-রাজি। হাসপাতালটা বড় — অভ্যর্থনা, পরীক্ষা কক্ষ, ওষুধখানা, ওয়ার্ড, আর পেছনে রান্নাঘর। প্রতিদিন কয়েকশো রোগী আসে, আর আল-রাজির সবচেয়ে বড় সমস্যা কোনো একজন রোগীকে সারিয়ে তোলা নয় — সমস্যা হলো **পুরো হাসপাতালটা ঠিকমতো চলছে কিনা সেটা টের পাওয়া**, যখন তিনি নিজে প্রতিটা ঘরে দাঁড়িয়ে থাকতে পারেন না।

তিনি তিন রকম কাগজ চালু করলেন। প্রথমটা দেয়ালের বড় বোর্ড: প্রতি ঘণ্টায় কেউ একজন গিয়ে কয়েকটা সংখ্যা লিখে দেয় — এই ঘণ্টায় কতজন এলো, কতজনকে ফিরিয়ে দিতে হলো, গড়ে কতক্ষণ লাগল, আর কতগুলো বিছানা খালি আছে। বোর্ডে কোনো নাম নেই, কোনো গল্প নেই, শুধু সংখ্যা। আল-রাজি দূর থেকে এক নজরে দেখলেই বুঝে যান আজ স্বাভাবিক কিনা। বোর্ড সস্তা — লিখতে দুই মিনিট, রাখতে এক পাতা, আর ছয় মাসের বোর্ড পাশাপাশি রাখলে প্রবণতাও দেখা যায়। কিন্তু বোর্ড কখনো বলতে পারে না **কেন** আজ গড় সময় বেড়ে গেল। এই বোর্ডটাই **metrics**।

দ্বিতীয় কাগজ হলো রোগীর ফাইল। প্রতিটা রোগীর জন্য আলাদা, আর সেখানে ঘটনার বিবরণ লেখা থাকে: "সকাল নয়টায় জ্বর ১০৩, দশটায় ওষুধ দেওয়া হলো, ওষুধখানায় দারুচিনি ফুরিয়ে গেছে বলে বিকল্প দেওয়া হলো"। ফাইল পড়লে ঠিক কী হয়েছে জানা যায়, কিন্তু ফাইল ব্যয়বহুল — তিনশো রোগীর তিনশো ফাইল, আর কোনো একটা প্রশ্নের উত্তর পেতে হলে ফাইল খুঁজে বের করতে হয়। আল-রাজি তাই নিয়ম করলেন, ফাইলে শুধু গুরুত্বপূর্ণ ঘটনা লেখা হবে, আর প্রতিটা লাইনের শুরুতে রোগীর নম্বর থাকবে যাতে খোঁজা যায়। এই ফাইলগুলোই **logs**।

তৃতীয় কাগজটা আল-রাজি সবার শেষে চালু করলেন, আর সেটাই সবচেয়ে কাজে দিল। একদিন এক রোগী অভিযোগ করল যে তার পুরো দিন লেগে গেছে। বোর্ড বলছে গড় সময় স্বাভাবিক, ফাইল বলছে চিকিৎসা ঠিকই হয়েছে — তাহলে সময় গেল কোথায়? তখন তিনি প্রতিটা রোগীর হাতে একটা ছোট কাগজ ধরিয়ে দেওয়ার নিয়ম করলেন, আর প্রতিটা দরজায় দায়িত্বপ্রাপ্ত লোক সেই কাগজে ছাপ মারে: কখন ঢুকল, কখন বেরোল। দিনশেষে ওই এক টুকরো কাগজ দেখলেই বোঝা যায় — অভ্যর্থনায় ৪ মিনিট, পরীক্ষায় ১১ মিনিট, **ওষুধখানায় ৩ ঘণ্টা**, ওয়ার্ডে ২০ মিনিট। সমস্যা কোথায় সেটা আর অনুমান করতে হয় না, দেখা যায়। এই কাগজটাই **trace**, আর প্রতিটা দরজার ছাপ হলো একেকটা **span**।

কিন্তু সবচেয়ে বড় পরিবর্তনটা এলো যখন আল-রাজি ঘণ্টা বাজানোর নিয়ম বদলালেন। আগে নিয়ম ছিল — কোনো চুলা নিভে গেলে ঘণ্টা, কোনো লণ্ঠন ফুরালে ঘণ্টা, ওষুধখানার একজন কর্মী অনুপস্থিত থাকলে ঘণ্টা। ফলে দিনে ত্রিশবার ঘণ্টা বাজত, সবাই অভ্যস্ত হয়ে গিয়েছিল, আর যেদিন সত্যিই বিপদ হলো সেদিন কেউ দৌড়ে এলো না। তিনি নতুন নিয়ম করলেন: **ঘণ্টা বাজবে কেবল তখনই যখন রোগী কষ্ট পাচ্ছে** — অর্থাৎ অপেক্ষার সময় সীমা ছাড়িয়ে গেলে, বা ফিরিয়ে দেওয়া রোগীর সংখ্যা বেড়ে গেলে। একটা চুলা নিভে গেলে সেটা তালিকায় উঠবে, ঘণ্টা বাজবে না — কারণ পাশে আরও তিনটা চুলা আছে, রোগীর কিছু আসে-যায় না। এটাই **উপসর্গে alert করা, কারণে নয়**।

আর শেষে তিনি একটা লিখিত প্রতিশ্রুতি দিলেন শহরের গভর্নরকে: "মাসের অন্তত ৯৯ ভাগ রোগীকে এক ঘণ্টার মধ্যে দেখা হবে।" এতে দুটো জিনিস হলো। এক, "ভালো চলছে" কথাটার একটা সংখ্যা দাঁড়াল। দুই — আর এটাই মজার — তিনি হিসাব করে দেখলেন মাসে দশ হাজার রোগীর মধ্যে একশো জনকে দেরিতে দেখা যেতেই পারে, প্রতিশ্রুতি ভাঙবে না। এই একশোটা হলো তার হাতে থাকা **বাজেট**। মাসের প্রথম সপ্তাহে যদি নব্বইটা খরচ হয়ে যায়, তিনি নতুন কোনো পরীক্ষা-নিরীক্ষা চালু করা বন্ধ রাখেন আর স্থিতিশীলতায় মন দেন। আর যদি মাস শেষে বাজেটের অর্ধেকও খরচ না হয়, তিনি বোঝেন যে তিনি অতিরিক্ত সাবধান — নতুন কিছু চেষ্টা করার সুযোগ আছে। এটাই **SLO** আর **error budget**।

মিলিয়ে নিই: দেয়ালের বোর্ড হলো **metrics** (সস্তা, সমষ্টিগত, "কিছু একটা ভুল" বলে); রোগীর ফাইল হলো **logs** (ব্যয়বহুল, বিস্তারিত, "কী ঘটেছে" বলে); দরজায়-ছাপ-মারা কাগজ হলো **distributed trace** আর প্রতিটা ছাপ **span** ("সময় কোথায় গেল" বলে); ঘণ্টার নতুন নিয়ম হলো **symptom-based alerting**; গভর্নরকে দেওয়া প্রতিশ্রুতি হলো **SLO**, তার পরিমাপ **SLI**, আর একশোটা দেরির অনুমতি হলো **error budget**। Prometheus, Loki, OpenTelemetry আর Google-এর SRE বই — সবাই ঠিক এই পাঁচটার কথাই বলে।

## তিনটা স্তম্ভ, তিনটা আলাদা প্রশ্ন

Metric, log আর trace-কে "তিনটা স্তম্ভ" বলা হয়, কিন্তু বেশি কাজের ভাবনা হলো — তিনটা তিন ধরনের প্রশ্নের উত্তর দেয়, আর ভুল হাতিয়ার দিয়ে প্রশ্ন করলে খরচ বিস্ফোরিত হয়।

|          | Metrics                             | Logs                        | Traces                  |
| -------- | ----------------------------------- | --------------------------- | ----------------------- |
| প্রশ্ন   | কিছু কি ভুল?                        | কী ঘটেছিল?                  | সময় কোথায় গেল?        |
| আকার     | সংখ্যা, নির্দিষ্ট সময়ে             | ঘটনার বিবরণ                 | সংযুক্ত span-এর গাছ     |
| খরচ      | অতি সস্তা, cardinality-র সাথে বাড়ে | ভলিউমের সাথে সরলরৈখিক, দামি | sampling ছাড়া খুব দামি |
| ধরে রাখা | মাস থেকে বছর                        | দিন থেকে সপ্তাহ             | ঘণ্টা থেকে দিন          |
| ভালো কাজ | dashboard, alert, trend             | debugging, audit            | latency-র উৎস খোঁজা     |

<Callout type="warning">

Metrics-এর একমাত্র বিপদ হলো **cardinality**। একটা metric-এ label হিসেবে user id বা request id বসালে প্রতিটা আলাদা মান একটা নতুন time series তৈরি করে — দশ লাখ ব্যবহারকারী মানে দশ লাখ series, আর আপনার Prometheus মেমরি শেষ করে মারা যাবে। নিয়ম: label-এর সম্ভাব্য মানের সংখ্যা যদি আগে থেকে গোনা না যায়, সেটা metric-এ যাবে না, log-এ যাবে।

</Callout>

Trace-এর ক্ষেত্রে খরচ সামলানোর হাতিয়ার হলো **sampling**, আর এখানে একটা সূক্ষ্ম পছন্দ আছে। **Head sampling**-এ শুরুতেই ঠিক হয় এই request-টা রাখা হবে কিনা (যেমন ১ শতাংশ) — সস্তা, কিন্তু ধীর বা ব্যর্থ request গুলোই বাদ পড়ে যেতে পারে। **Tail sampling**-এ পুরো trace জমা করে শেষে সিদ্ধান্ত হয় — সব error আর সব ধীর request রাখা হয়, বাকিদের ১ শতাংশ। খরচ বেশি, কিন্তু যেগুলো আসলে দরকার সেগুলোই থাকে।

## RED এবং USE

Dashboard বানানোর সময় সবচেয়ে বড় ভুল হলো "যা যা মাপা যায় সব দেখানো"। ফল হয় চল্লিশটা গ্রাফের একটা পাতা, যেটা দেখে কেউ কোনো সিদ্ধান্ত নিতে পারে না। দুটো প্রতিষ্ঠিত কাঠামো এই সমস্যাটা সমাধান করে, আর দুটো দুই ধরনের জিনিসের জন্য।

**RED — প্রতিটা সার্ভিসের জন্য** (অর্থাৎ যা request গ্রহণ করে):

- **Rate** — প্রতি সেকেন্ডে কত request
- **Errors** — তার কত ভাগ ব্যর্থ
- **Duration** — কত সময় লাগছে, distribution হিসেবে (p50, p95, p99)

**USE — প্রতিটা রিসোর্সের জন্য** (CPU, ডিস্ক, connection pool, thread pool, queue):

- **Utilization** — কত শতাংশ সময় ব্যস্ত
- **Saturation** — কতটা কাজ অপেক্ষায় আছে (queue depth, run queue)
- **Errors** — রিসোর্স-স্তরের ত্রুটি (packet drop, disk error, pool timeout)

এই দুটো একসাথে ব্যবহার করলে debugging-এর একটা স্বাভাবিক পথ তৈরি হয়: RED বলে **কোন সার্ভিস** ভুগছে, USE বলে **কোন রিসোর্স** সেটার কারণ।

<Callout type="tip">

Saturation-কে utilization-এর চেয়ে বেশি গুরুত্ব দিন। ৮৫ শতাংশ CPU utilization নিজে কোনো সমস্যা নয় — এটা ভালো ব্যবহারের লক্ষণও হতে পারে। কিন্তু run queue-তে অপেক্ষমাণ thread-এর সংখ্যা বাড়তে থাকা মানে কাজ জমছে, আর latency অবধারিতভাবে বাড়বে। প্রায় সব সিস্টেমে **saturation আগে বাড়ে, latency পরে** — তাই saturation-ই আপনার সবচেয়ে ভালো আগাম সংকেত।

</Callout>

## গড় মিথ্যা বলে

Latency-র ব্যাপারে একটা কথা মনে রাখা দরকার: গড় প্রায় সবসময় বিভ্রান্তিকর। কারণ latency-র distribution কখনো সুষম নয় — বেশিরভাগ request দ্রুত, আর একটা লম্বা লেজ ধীর।

ধরুন ১০০টা request-এর ৯৯টা ১০ ms-এ শেষ, একটা ৫ সেকেন্ড। গড় দাঁড়ায় ৬০ ms — শুনতে চমৎকার, অথচ একজন ব্যবহারকারী ৫ সেকেন্ড বসে ছিল।

আরও গুরুত্বপূর্ণ একটা ব্যাপার আছে, যা অনেকে ভাবে না: একটা পেজ যদি ১০টা backend কল করে, আর প্রতিটার p99 ১ সেকেন্ড হয়, তাহলে পেজটার অন্তত একটা কল ধীর হওয়ার সম্ভাবনা প্রায় ১০ শতাংশ। অর্থাৎ **সার্ভিসের p99 মানে পেজের p90**। ফ্যান-আউট যত বাড়ে, লেজের প্রভাব তত বড় হয়। তাই যেসব সার্ভিসের উপর অনেক কিছু নির্ভর করে, তাদের লেজ কড়াভাবে বেঁধে রাখতে হয়।

আর percentile নিয়ে একটা কারিগরি সতর্কতা: **percentile গড় করা যায় না**। দশটা সার্ভারের p99 আলাদা করে হিসাব করে সেগুলোর গড় নিলে যে সংখ্যাটা পাবেন, সেটা কোনো অর্থবহ জিনিস নয়। সঠিক উপায় হলো histogram bucket-গুলো যোগ করে তারপর percentile বের করা — Prometheus-এর `histogram_quantile` ঠিক এই কাজটাই করে।

## Metrics স্তর, RED সহ

নিচের কোডটা একটা কাজ করা metrics লাইব্রেরি — counter, gauge, histogram (bucket সহ), RED middleware, আর Prometheus-এর text format-এ exposition।

```typescript
// --- Label handling ---
export type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
	const keys = Object.keys(labels).sort();
	return keys.map((k) => `${k}="${labels[k]}"`).join(',');
}

/**
 * Cardinality guard. Every distinct label combination is a separate time
 * series; letting user ids or request ids in here is the single most common
 * way to take down a metrics backend.
 */
class CardinalityGuard {
	private seen = new Map<string, Set<string>>();

	constructor(private readonly maxSeriesPerMetric = 2000) {}

	allow(metric: string, key: string): boolean {
		const set = this.seen.get(metric) ?? new Set<string>();
		if (set.has(key)) return true;
		if (set.size >= this.maxSeriesPerMetric) {
			console.warn(`[metrics] cardinality limit hit for ${metric}, dropping series ${key}`);
			return false;
		}
		set.add(key);
		this.seen.set(metric, set);
		return true;
	}
}

const guard = new CardinalityGuard();

// --- Counter: only goes up ---
export class Counter {
	private values = new Map<string, number>();

	constructor(
		readonly name: string,
		readonly help: string
	) {}

	inc(labels: Labels = {}, by = 1): void {
		const key = labelKey(labels);
		if (!guard.allow(this.name, key)) return;
		this.values.set(key, (this.values.get(key) ?? 0) + by);
	}

	expose(): string {
		const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
		for (const [key, value] of this.values) {
			lines.push(key ? `${this.name}{${key}} ${value}` : `${this.name} ${value}`);
		}
		return lines.join('\n');
	}
}

// --- Gauge: goes up and down ---
export class Gauge {
	private values = new Map<string, number>();

	constructor(
		readonly name: string,
		readonly help: string
	) {}

	set(value: number, labels: Labels = {}): void {
		const key = labelKey(labels);
		if (!guard.allow(this.name, key)) return;
		this.values.set(key, value);
	}

	add(delta: number, labels: Labels = {}): void {
		const key = labelKey(labels);
		if (!guard.allow(this.name, key)) return;
		this.values.set(key, (this.values.get(key) ?? 0) + delta);
	}

	expose(): string {
		const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
		for (const [key, value] of this.values) {
			lines.push(key ? `${this.name}{${key}} ${value}` : `${this.name} ${value}`);
		}
		return lines.join('\n');
	}
}

// --- Histogram: cumulative buckets, the right shape for latency ---
interface HistogramSeries {
	counts: number[]; // one per bucket boundary
	sum: number;
	count: number;
}

export class Histogram {
	private series = new Map<string, HistogramSeries>();

	constructor(
		readonly name: string,
		readonly help: string,
		readonly buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
	) {}

	observe(value: number, labels: Labels = {}): void {
		const key = labelKey(labels);
		if (!guard.allow(this.name, key)) return;

		const entry = this.series.get(key) ?? {
			counts: new Array(this.buckets.length).fill(0),
			sum: 0,
			count: 0
		};

		for (let i = 0; i < this.buckets.length; i++) {
			if (value <= this.buckets[i]) entry.counts[i] += 1;
		}
		entry.sum += value;
		entry.count += 1;
		this.series.set(key, entry);
	}

	/**
	 * Quantile from cumulative buckets, with linear interpolation inside the
	 * matching bucket. This is exactly why percentiles must be computed from
	 * buckets and never averaged across instances.
	 */
	quantile(q: number, labels: Labels = {}): number {
		const entry = this.series.get(labelKey(labels));
		if (!entry || entry.count === 0) return NaN;

		const target = q * entry.count;
		let previousCount = 0;
		let previousBound = 0;

		for (let i = 0; i < this.buckets.length; i++) {
			const cumulative = entry.counts[i];
			if (cumulative >= target) {
				const bucketCount = cumulative - previousCount;
				if (bucketCount === 0) return this.buckets[i];
				const ratio = (target - previousCount) / bucketCount;
				return previousBound + ratio * (this.buckets[i] - previousBound);
			}
			previousCount = cumulative;
			previousBound = this.buckets[i];
		}
		return this.buckets[this.buckets.length - 1];
	}

	expose(): string {
		const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
		for (const [key, entry] of this.series) {
			const prefix = key ? `,${key}` : '';
			for (let i = 0; i < this.buckets.length; i++) {
				lines.push(`${this.name}_bucket{le="${this.buckets[i]}"${prefix}} ${entry.counts[i]}`);
			}
			lines.push(`${this.name}_bucket{le="+Inf"${prefix}} ${entry.count}`);
			lines.push(key ? `${this.name}_sum{${key}} ${entry.sum}` : `${this.name}_sum ${entry.sum}`);
			lines.push(
				key ? `${this.name}_count{${key}} ${entry.count}` : `${this.name}_count ${entry.count}`
			);
		}
		return lines.join('\n');
	}
}

// --- Registry ---
export class Registry {
	private collectors: Array<{ expose(): string }> = [];

	register<T extends { expose(): string }>(collector: T): T {
		this.collectors.push(collector);
		return collector;
	}

	scrape(): string {
		return this.collectors.map((c) => c.expose()).join('\n') + '\n';
	}
}

// --- RED instrumentation for an HTTP-like service ---
export const registry = new Registry();

export const requestsTotal = registry.register(
	new Counter('http_requests_total', 'Total HTTP requests')
);
export const requestDuration = registry.register(
	new Histogram('http_request_duration_seconds', 'Request duration in seconds')
);
export const inFlight = registry.register(
	new Gauge('http_requests_in_flight', 'Requests currently being served')
);

interface RequestLike {
	method: string;
	route: string; // the ROUTE PATTERN, never the raw path
}

/**
 * Note that we label with the route pattern (/trips/:id), not the raw path
 * (/trips/9f2c...). Labelling with raw paths is the classic cardinality
 * explosion: one series per trip id.
 */
export async function observeRequest<T>(req: RequestLike, handler: () => Promise<T>): Promise<T> {
	const labels = { method: req.method, route: req.route };
	const startedAt = process.hrtime.bigint();
	inFlight.add(1, labels);

	let status = '200';
	try {
		const result = await handler();
		return result;
	} catch (err) {
		status = err instanceof RangeError ? '400' : '500';
		throw err;
	} finally {
		const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
		inFlight.add(-1, labels);
		requestsTotal.inc({ ...labels, status });
		requestDuration.observe(seconds, labels);
	}
}

// --- USE instrumentation for a resource pool ---
export const poolInUse = registry.register(
	new Gauge('db_pool_connections_in_use', 'Connections currently checked out')
);
export const poolWaiting = registry.register(
	new Gauge('db_pool_waiters', 'Callers waiting for a connection (saturation)')
);
export const poolTimeouts = registry.register(
	new Counter('db_pool_timeouts_total', 'Checkout attempts that timed out')
);

export class InstrumentedPool {
	private inUse = 0;
	private waiting = 0;

	constructor(private readonly size: number) {}

	async acquire(timeoutMs: number): Promise<() => void> {
		if (this.inUse < this.size) {
			this.inUse += 1;
			poolInUse.set(this.inUse, { pool: 'primary' });
			return () => this.release();
		}

		this.waiting += 1;
		poolWaiting.set(this.waiting, { pool: 'primary' });

		const acquired = await this.waitForSlot(timeoutMs);
		this.waiting -= 1;
		poolWaiting.set(this.waiting, { pool: 'primary' });

		if (!acquired) {
			poolTimeouts.inc({ pool: 'primary' });
			throw new Error('pool checkout timed out');
		}
		this.inUse += 1;
		poolInUse.set(this.inUse, { pool: 'primary' });
		return () => this.release();
	}

	private release(): void {
		this.inUse -= 1;
		poolInUse.set(this.inUse, { pool: 'primary' });
	}

	private waitForSlot(timeoutMs: number): Promise<boolean> {
		return new Promise((resolve) => {
			const deadline = Date.now() + timeoutMs;
			const check = () => {
				if (this.inUse < this.size) return resolve(true);
				if (Date.now() >= deadline) return resolve(false);
				setTimeout(check, 5);
			};
			check();
		});
	}
}

// --- Demo ---
async function demo(): Promise<void> {
	const routes = ['/trips/:id', '/drivers/:id/location', '/search'];

	for (let i = 0; i < 500; i++) {
		const route = routes[i % routes.length];
		await observeRequest({ method: 'GET', route }, async () => {
			// Most requests are fast, a few are very slow: the usual shape
			const ms = i % 97 === 0 ? 900 + Math.random() * 400 : 8 + Math.random() * 30;
			await new Promise((r) => setTimeout(r, Math.min(ms, 5)));
			requestDuration.observe(ms / 1000, { method: 'GET', route });
			return null;
		});
	}

	for (const route of routes) {
		const labels = { method: 'GET', route };
		console.log(
			`${route}  p50=${requestDuration.quantile(0.5, labels).toFixed(3)}s` +
				`  p95=${requestDuration.quantile(0.95, labels).toFixed(3)}s` +
				`  p99=${requestDuration.quantile(0.99, labels).toFixed(3)}s`
		);
	}
}

void demo();
```

## Trace: সময় কোথায় গেল

Metric বলে "checkout ধীর"। Trace বলে "checkout-এর ৮৪০ ms-এর মধ্যে ৭১০ ms গেছে pricing সার্ভিসে, আর তার ভেতরে ৬৮০ ms গেছে একটা N+1 query-তে"।

Trace-এর গঠন সরল: একটা **trace id** পুরো request-এর সাথে ভ্রমণ করে, আর প্রতিটা কাজের একক একটা **span** — যার নিজের id আছে, একটা parent span id আছে, শুরু ও শেষের সময় আছে, আর কিছু attribute আছে।

<Mermaid
title="A Distributed Trace"
code={`gantt
  title Trace 7f3a... total 840ms
  dateFormat X
  axisFormat %L
  section api-gateway
  handle request        :0, 840
  section trip-service
  create trip           :30, 800
  section pricing
  quote fare            :80, 790
  section db
  select surge rows     :110, 680
  section notify
  push to rider         :800, 835`}
/>

সবচেয়ে গুরুত্বপূর্ণ কারিগরি অংশটা হলো **context propagation** — trace id আর parent span id প্রতিটা নেটওয়ার্ক কলের সাথে পাঠাতে হবে, নইলে trace ভেঙে টুকরো হয়ে যায়। W3C `traceparent` header এখন মান, আর এর গঠন এমন:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             |  |                                |                |
          version  trace-id (16 bytes)       span-id (8 bytes)  flags
```

```typescript
// --- Minimal W3C trace context ---
export interface SpanContext {
	traceId: string;
	spanId: string;
	sampled: boolean;
}

function randomHex(bytes: number): string {
	const chars = '0123456789abcdef';
	let out = '';
	for (let i = 0; i < bytes * 2; i++) {
		out += chars[Math.floor(Math.random() * 16)];
	}
	return out;
}

export function startTrace(sampled: boolean): SpanContext {
	return { traceId: randomHex(16), spanId: randomHex(8), sampled };
}

export function childSpan(parent: SpanContext): SpanContext {
	return { traceId: parent.traceId, spanId: randomHex(8), sampled: parent.sampled };
}

export function encodeTraceparent(ctx: SpanContext): string {
	return `00-${ctx.traceId}-${ctx.spanId}-${ctx.sampled ? '01' : '00'}`;
}

export function decodeTraceparent(header: string | undefined): SpanContext | null {
	if (!header) return null;
	const parts = header.split('-');
	if (parts.length !== 4 || parts[0] !== '00') return null;
	const [, traceId, spanId, flags] = parts;
	if (traceId.length !== 32 || spanId.length !== 16) return null;
	return { traceId, spanId, sampled: flags === '01' };
}

/**
 * Propagation is the whole game. An incoming request either continues an
 * existing trace or starts a new one, and every outgoing call must carry
 * a child span id under the SAME trace id.
 */
export function continueOrStart(incoming: string | undefined, sampleRate: number): SpanContext {
	const parent = decodeTraceparent(incoming);
	if (parent) return childSpan(parent);
	return startTrace(Math.random() < sampleRate);
}

// The single most valuable habit: put the trace id in every log line.
export function logWithTrace(
	ctx: SpanContext,
	message: string,
	fields: Record<string, unknown> = {}
) {
	console.log(
		JSON.stringify({
			level: 'info',
			traceId: ctx.traceId,
			spanId: ctx.spanId,
			message,
			...fields
		})
	);
}

const ctx = continueOrStart(undefined, 1);
logWithTrace(ctx, 'trip requested', { rider: 'al-biruni', city: 'samarkand' });
console.log('outgoing header:', encodeTraceparent(childSpan(ctx)));
```

<Callout type="tip">

তিনটা স্তম্ভের আসল শক্তি আলাদাভাবে নয়, **সংযোগে**। প্রতিটা log লাইনে trace id বসান, প্রতিটা metric-এ exemplar হিসেবে trace id যুক্ত করুন। তখন dashboard-এ p99-এর একটা স্পাইক দেখে সরাসরি সেই ধীর request-টার trace-এ যাওয়া যায়, আর সেখান থেকে সেই request-এর log লাইনগুলোতে। এই তিন ধাপের যাত্রাটাই observability-র আসল সংজ্ঞা।

</Callout>

## SLI, SLO এবং error budget

এখানেই observability প্রকৌশল থেকে সিদ্ধান্তে রূপ নেয়।

**SLI (Service Level Indicator)** — একটা পরিমাপ, প্রায় সবসময় "ভালো ঘটনা ভাগ মোট ঘটনা" আকারে। যেমন: ২০০ ms-এর মধ্যে সফলভাবে সার্ভ হওয়া request-এর অনুপাত।

**SLO (Service Level Objective)** — সেই SLI-এর জন্য একটা লক্ষ্য, একটা নির্দিষ্ট সময়-জানালায়। যেমন: ৩০ দিনে ৯৯.৯ শতাংশ।

**Error budget** — ১ বিয়োগ SLO। ৯৯.৯ শতাংশ মানে ০.১ শতাংশ ব্যর্থ হওয়ার অনুমতি — ৩০ দিনে প্রায় ৪৩ মিনিট। এটাই আপনার হাতে থাকা খরচযোগ্য পরিমাণ।

Error budget-এর ধারণাটা এত শক্তিশালী কেন? কারণ এটা "রিলায়েবিলিটি বনাম গতি" নিয়ে চিরকালীন ঝগড়াটাকে একটা সংখ্যায় নামিয়ে আনে। বাজেট বাকি থাকলে দ্রুত ছাড়ুন, ঝুঁকি নিন। বাজেট শেষ হয়ে গেলে নতুন feature থামিয়ে নির্ভরযোগ্যতায় ফিরুন। কেউ আর অনুভূতি দিয়ে তর্ক করে না।

| SLO    | মাসে অনুমোদিত downtime |
| ------ | ---------------------- |
| ৯৯%    | ৭ ঘণ্টা ১৮ মিনিট       |
| ৯৯.৫%  | ৩ ঘণ্টা ৩৯ মিনিট       |
| ৯৯.৯%  | ৪৩ মিনিট ৪৯ সেকেন্ড    |
| ৯৯.৯৫% | ২১ মিনিট ৫৪ সেকেন্ড    |
| ৯৯.৯৯% | ৪ মিনিট ২২ সেকেন্ড     |

<Callout type="warning">

১০০ শতাংশ SLO লেখা মানে আপনি SLO বোঝেননি। ১০০ শতাংশ মানে error budget শূন্য, অর্থাৎ কোনো deploy করা যাবে না, কোনো পরীক্ষা করা যাবে না, আর প্রথম ব্যর্থতাতেই আপনি লক্ষ্যচ্যুত। তাছাড়া আপনার নিচের স্তরগুলো (cloud provider, DNS, নেটওয়ার্ক) নিজেরাই ১০০ শতাংশ দেয় না। SLO সবসময় ১০০-এর নিচে হবে, এবং **ব্যবহারকারীর কাছে গ্রহণযোগ্য সবচেয়ে নিচু সংখ্যাটাই** সঠিক সংখ্যা — বেশি নয়, কারণ প্রতিটা বাড়তি নয়ের দাম প্রায় দশ গুণ।

</Callout>

## Burn rate: কখন ঘুম ভাঙাবেন

সহজ alert — "error budget ৯০ শতাংশ শেষ" — একটা বড় সমস্যা রাখে: যখন সেটা বাজে, ততক্ষণে ক্ষতি হয়ে গেছে। আবার "৫ মিনিটে error rate ১ শতাংশ ছাড়িয়েছে" ধরনের alert অতিরিক্ত সংবেদনশীল, রাতে অকারণে ডাকে।

**Burn rate** এই দুটোর মাঝখানে দাঁড়ায়। Burn rate হলো — আপনি বাজেট কত গুণ দ্রুত খরচ করছেন। Burn rate ১ মানে ঠিক এমন গতিতে খরচ হচ্ছে যে মাসের শেষে বাজেট ঠিক ফুরাবে। Burn rate ১৪.৪ মানে ৩০ দিনের বাজেট মাত্র ২ দিনে শেষ হয়ে যাবে।

Google-এর সুপারিশকৃত কাঠামো হলো **multi-window, multi-burn-rate**:

| জরুরিতা     | Burn rate | দীর্ঘ জানালা | ছোট জানালা | মানে              |
| ----------- | --------- | ------------ | ---------- | ----------------- |
| Page (এখনই) | ১৪.৪      | ১ ঘণ্টা      | ৫ মিনিট    | ২ দিনে বাজেট শেষ  |
| Page        | ৬         | ৬ ঘণ্টা      | ৩০ মিনিট   | ৫ দিনে বাজেট শেষ  |
| Ticket      | ৩         | ১ দিন        | ২ ঘণ্টা    | ১০ দিনে বাজেট শেষ |
| Ticket      | ১         | ৩ দিন        | ৬ ঘণ্টা    | ধীর ক্ষয়         |

দুটো জানালা একসাথে লাগে কেন? দীর্ঘ জানালা নিশ্চিত করে সমস্যাটা যথেষ্ট বড়, আর ছোট জানালা নিশ্চিত করে সমস্যাটা **এখনও চলছে** — নইলে সমস্যা মিটে যাওয়ার পরেও এক ঘণ্টা ধরে alert বাজতে থাকবে।

```typescript
// --- SLO definition ---
export interface SloDefinition {
	name: string;
	objective: number; // e.g. 0.999
	windowDays: number; // e.g. 30
}

export interface AlertRule {
	severity: 'page' | 'ticket';
	burnRate: number;
	longWindowMinutes: number;
	shortWindowMinutes: number;
}

export const DEFAULT_RULES: AlertRule[] = [
	{ severity: 'page', burnRate: 14.4, longWindowMinutes: 60, shortWindowMinutes: 5 },
	{ severity: 'page', burnRate: 6, longWindowMinutes: 360, shortWindowMinutes: 30 },
	{ severity: 'ticket', burnRate: 3, longWindowMinutes: 1440, shortWindowMinutes: 120 },
	{ severity: 'ticket', burnRate: 1, longWindowMinutes: 4320, shortWindowMinutes: 360 }
];

// --- A rolling window of good/bad event counts, one bucket per minute ---
export class EventWindow {
	private good: number[] = [];
	private bad: number[] = [];

	constructor(private readonly capacityMinutes: number) {}

	record(minute: number, good: number, bad: number): void {
		this.good[minute % this.capacityMinutes] = good;
		this.bad[minute % this.capacityMinutes] = bad;
	}

	/** Sum the last N minutes ending at `now`. */
	ratio(now: number, minutes: number): { total: number; badRatio: number } {
		let good = 0;
		let bad = 0;
		for (let i = 0; i < minutes; i++) {
			const slot = (now - i) % this.capacityMinutes;
			if (slot < 0) continue;
			good += this.good[slot] ?? 0;
			bad += this.bad[slot] ?? 0;
		}
		const total = good + bad;
		return { total, badRatio: total === 0 ? 0 : bad / total };
	}
}

export class SloEvaluator {
	constructor(
		private readonly slo: SloDefinition,
		private readonly window: EventWindow,
		private readonly rules: AlertRule[] = DEFAULT_RULES
	) {}

	private get errorBudget(): number {
		return 1 - this.slo.objective;
	}

	/**
	 * Burn rate = observed error ratio divided by the ratio that would exactly
	 * exhaust the budget over the full SLO window. A burn rate of 1 means you
	 * will finish the month with exactly zero budget left.
	 */
	burnRate(now: number, windowMinutes: number): number {
		const { badRatio } = this.window.ratio(now, windowMinutes);
		return badRatio / this.errorBudget;
	}

	budgetRemaining(now: number): number {
		const totalMinutes = this.slo.windowDays * 24 * 60;
		const { badRatio } = this.window.ratio(now, totalMinutes);
		return 1 - badRatio / this.errorBudget;
	}

	/**
	 * A rule fires only when BOTH windows are burning. The long window proves
	 * the problem is significant; the short window proves it is still happening,
	 * so the alert resolves quickly once the incident ends.
	 */
	evaluate(now: number): Array<{ rule: AlertRule; longBurn: number; shortBurn: number }> {
		const firing: Array<{ rule: AlertRule; longBurn: number; shortBurn: number }> = [];

		for (const rule of this.rules) {
			const longBurn = this.burnRate(now, rule.longWindowMinutes);
			const shortBurn = this.burnRate(now, rule.shortWindowMinutes);
			if (longBurn >= rule.burnRate && shortBurn >= rule.burnRate) {
				firing.push({ rule, longBurn, shortBurn });
			}
		}
		return firing;
	}

	/** Days until the budget is gone at the current burn rate. */
	timeToExhaustionDays(now: number, windowMinutes = 60): number {
		const burn = this.burnRate(now, windowMinutes);
		if (burn <= 0) return Infinity;
		return (this.budgetRemaining(now) * this.slo.windowDays) / burn;
	}
}

// --- Demo: a calm month, then a bad hour ---
function demo(): void {
	const slo: SloDefinition = { name: 'trip-api-availability', objective: 0.999, windowDays: 30 };
	const window = new EventWindow(30 * 24 * 60);
	const evaluator = new SloEvaluator(slo, window);

	// 20 days of normal traffic: 6000 requests a minute, 2 failures
	for (let minute = 0; minute < 20 * 24 * 60; minute++) {
		window.record(minute, 5998, 2);
	}

	let now = 20 * 24 * 60;
	console.log(`budget remaining: ${(evaluator.budgetRemaining(now) * 100).toFixed(1)}%`);
	console.log('firing:', evaluator.evaluate(now).length);

	// A bad hour: 4% of requests fail
	for (let i = 0; i < 60; i++) {
		window.record(now + i, 5760, 240);
	}
	now += 60;

	console.log(`1h burn rate: ${evaluator.burnRate(now, 60).toFixed(1)}x`);
	console.log(`5m burn rate: ${evaluator.burnRate(now, 5).toFixed(1)}x`);
	console.log(`budget remaining: ${(evaluator.budgetRemaining(now) * 100).toFixed(1)}%`);
	console.log(`exhausted in: ${evaluator.timeToExhaustionDays(now).toFixed(2)} days`);

	for (const { rule, longBurn, shortBurn } of evaluator.evaluate(now)) {
		console.log(
			`ALERT ${rule.severity}: burn ${rule.burnRate}x threshold, ` +
				`long=${longBurn.toFixed(1)}x short=${shortBurn.toFixed(1)}x`
		);
	}
}

demo();
```

## উপসর্গে alert করুন, কারণে নয়

Alert-এর মান বিচারের একটাই মাপকাঠি আছে: **এই alert-টা বাজলে একজন মানুষকে এখনই কিছু করতে হবে কি?** উত্তর "না" হলে ওটা alert নয়, ওটা একটা dashboard-এর লাইন।

কারণ-ভিত্তিক alert-এর সমস্যা তিনটা। এক, বেশিরভাগ কারণ ব্যবহারকারীকে স্পর্শ করে না — একটা replica পড়ে গেলে বাকি পাঁচটা কাজ চালায়। দুই, কারণের সংখ্যা অসীম, তাই আপনি কখনো সব কারণ ধরতে পারবেন না, অথচ চেষ্টা করতে গিয়ে শত শত alert বানাবেন। তিন, alert-এর সংখ্যা বাড়লে **alert fatigue** আসে, আর তখন আসল alert-টাও উপেক্ষিত হয়।

উপসর্গ-ভিত্তিক alert উল্টো দিক থেকে আসে: SLO ভাঙছে কিনা সেটাই একমাত্র প্রশ্ন। কারণ যাই হোক — CPU, ডিস্ক, bug, উপরের সার্ভিস — ফলাফল এক এবং সেটাই ধরা পড়ে।

তাহলে কারণের সংকেতগুলো কি ফেলে দেবেন? না। ওগুলো **diagnostic** হিসেবে dashboard-এ থাকবে, alert-এ নয়। Alert বলবে "কী ভুল", dashboard বলবে "কেন"।

<Callout type="tip">

প্রতিটা page-করা alert-এর সাথে একটা runbook link বাধ্যতামূলক করুন — কোথায় দেখতে হবে, কী কী সাধারণ কারণ, প্রথম তিনটা পদক্ষেপ কী। রাত তিনটায় যে মানুষটা জেগে উঠছে সে হয়তো এই সার্ভিসটা কখনো দেখেনি। Runbook ছাড়া alert মানে "কাউকে জাগিয়ে ধাঁধা ধরিয়ে দেওয়া"।

</Callout>

## বাস্তব সংকেত থেকে capacity planning

Capacity planning-কে অনেকে অনুমানের খেলা ভাবে, অথচ আপনার কাছে যদি ঠিক তিনটা সংখ্যা থাকে, তাহলে এটা প্রায় যান্ত্রিক কাজ হয়ে যায়।

**এক: প্রতি ইউনিট কাজের খরচ।** এক সেকেন্ডে একটা request সার্ভ করতে কত CPU, কত মেমরি, কত DB connection লাগে। এটা load test থেকে নয়, প্রোডাকশনের metric থেকে বের করুন — `CPU seconds / requests` একটা চমৎকার সরল অনুপাত।

**দুই: প্রকৃত peak, গড় নয়।** দৈনিক peak, সাপ্তাহিক peak, আর মৌসুমি peak আলাদা। আপনার পরিকল্পনা peak-এর জন্য, আর peak-এর ভেতরের ছোট স্পাইকের জন্য headroom সহ।

**তিন: বৃদ্ধির হার।** গত ছয় মাসের ট্রাফিকের প্রবণতা। সরলরৈখিক না সূচকীয়, সেটা দেখেই ঠিক হয় আপনি তিন মাস না তিন সপ্তাহ পরে দেয়ালে ধাক্কা খাবেন।

এরপর হিসাবটা সোজা:

```
required_capacity = peak_rate * growth_factor * cost_per_unit / target_utilization
```

`target_utilization` সাধারণত ০.৬ থেকে ০.৭ রাখা হয়। কেন ১.০ নয়? কারণ (ক) একটা instance/AZ পড়ে গেলে বাকিদের সেই ভার নিতে হবে, (খ) queueing theory অনুযায়ী utilization ১-এর দিকে গেলে latency দ্রুত বিস্ফোরিত হয় — ৮০ শতাংশে গিয়ে অপেক্ষার সময় দ্বিগুণ হয়, ৯০ শতাংশে চার গুণ, ৯৫-এ ভয়াবহ। এই অ-রৈখিকতাই কারণ যে "আরেকটু চেপে চালাই" প্রায় সবসময় খারাপ সিদ্ধান্ত।

<Callout type="info">

Autoscaling capacity planning-কে বাতিল করে না, শুধু প্রতিক্রিয়ার সময়টা ছোট করে। কারণ scale up-এর নিজস্ব দেরি আছে — instance বুট, container pull, JIT warm-up, connection pool ভরা। স্পাইক যদি সেই দেরির চেয়ে দ্রুত আসে, autoscaler দেরিতে পৌঁছাবে। তাই দুটোই লাগে: spike শোষণের জন্য headroom, আর প্রবণতা সামলানোর জন্য autoscaling।

</Callout>

<div class="takeaways">

### মূল শেখা

- Metric বলে "কিছু ভুল", log বলে "কী ঘটেছে", trace বলে "সময় কোথায় গেল" — তিনটাই লাগে, আর তিনটাকে trace id দিয়ে জুড়ে দিলেই আসল observability
- Metric-এ কখনো unbounded label (user id, request id, raw path) দেবেন না; route pattern ব্যবহার করুন এবং একটা cardinality guard রাখুন
- RED সার্ভিসের জন্য (rate, errors, duration), USE রিসোর্সের জন্য (utilization, saturation, errors) — saturation-ই সবচেয়ে ভালো আগাম সংকেত
- গড় latency মিথ্যা বলে; percentile ব্যবহার করুন, আর percentile কখনো গড় করবেন না — histogram bucket যোগ করে হিসাব করুন
- ফ্যান-আউট লেজকে বড় করে: ১০টা কলের প্রতিটার p99 ১ সেকেন্ড হলে পেজের ১০ শতাংশ ধীর হবে
- SLO কখনো ১০০ শতাংশ নয়; error budget হলো ঝুঁকি নেওয়ার অনুমতিপত্র, আর সেটা শেষ হলে feature থামিয়ে স্থিতিশীলতায় ফেরার নিয়ম
- Multi-window multi-burn-rate alert ব্যবহার করুন — দীর্ঘ জানালা গুরুত্ব প্রমাণ করে, ছোট জানালা প্রমাণ করে ঘটনাটা এখনও চলছে
- উপসর্গে alert করুন, কারণে নয়; প্রতিটা page-এর সাথে runbook বাধ্যতামূলক
- Capacity planning তিনটা সংখ্যার কাজ: প্রতি-ইউনিট খরচ, প্রকৃত peak, আর বৃদ্ধির হার — আর target utilization ০.৬–০.৭ রাখুন, কারণ latency utilization-এর সাথে অ-রৈখিকভাবে বাড়ে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Prometheus** pull-ভিত্তিক metric সংগ্রহ করে এবং `histogram_quantile` দিয়ে bucket থেকে percentile বের করে — instance-জুড়ে percentile গড় করার ভুলটা এভাবেই এড়ানো হয়
- **OpenTelemetry** এখন trace, metric ও log-এর সাধারণ মান; W3C `traceparent` header দিয়ে context propagation ভাষা ও ভেন্ডর-নিরপেক্ষভাবে চলে
- **Google SRE** দল error budget-কে প্রকৌশল ও প্রোডাক্টের মধ্যে চুক্তি হিসেবে ব্যবহার করে: বাজেট শেষ মানে feature freeze
- **Grafana** ও **Datadog** exemplar সমর্থন করে, ফলে একটা latency স্পাইক থেকে সরাসরি সেই ধীর request-এর trace-এ যাওয়া যায়
- **Honeycomb** high-cardinality event-এর উপর জোর দেয় — যেখানে metric-এর সীমা শেষ, সেখানে প্রতি-request wide event দিয়ে অজানা প্রশ্নের উত্তর খোঁজা হয়
- **Netflix** ও **Uber** tail sampling ব্যবহার করে: সব error আর সব ধীর trace রাখা হয়, বাকিদের একটা ছোট অংশ

</div>
