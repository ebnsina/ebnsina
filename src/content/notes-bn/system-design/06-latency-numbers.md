---
title: 'Latency Numbers ও Percentile'
subtitle: 'যে সংখ্যাগুলো মুখস্থ রাখতে হয়, কেন গড় মিথ্যা বলে, আর fan-out কীভাবে tail latency বিস্ফোরিত করে।'
chapter: 6
level: 'beginner'
readingTime: '১৭ মিনিট'
topics: ['latency', 'percentiles', 'p99', 'tail latency', 'performance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা রেস্টুরেন্টে "গড়ে খাবার আসে ১২ মিনিটে" — শুনতে ভালো। কিন্তু যদি ৯০ জনের খাবার আসে ৫ মিনিটে আর ১০ জনের ৭০ মিনিটে, গড় তবু ১২। সেই ১০ জন আর কখনো ফিরে আসবে না, অথচ ম্যানেজারের রিপোর্টে সব ঠিক দেখাচ্ছে।

</Callout>

## গল্পে বুঝি

বাগদাদের একটা বড় খাবারের দোকান চালান আল-রাযি। দোকানে দশটা টেবিল, রান্নাঘরে চারজন বাবুর্চি।

মাস শেষে হিসাব করে তিনি খুশি: "গড়ে খাবার পরিবেশনে সময় লেগেছে ১১ মিনিট।" কিন্তু ব্যবসা কমছে, আর তিনি বুঝতে পারছেন না কেন।

একদিন তিনি নিজে দরজার পাশে বসে প্রতিটা টেবিলের সময় আলাদা করে লিখলেন। একশোটা অর্ডারের হিসাব সাজিয়ে দেখলেন — সবচেয়ে কম থেকে সবচেয়ে বেশি। **পঞ্চাশতম অর্ডারটা** এসেছে ৭ মিনিটে। **পঁচানব্বইতম** এসেছে ২৮ মিনিটে। আর **নিরানব্বইতম** এসেছে ৫৫ মিনিটে। গড় ১১ মিনিট হলেও, প্রতি একশো খদ্দেরের একজন প্রায় এক ঘণ্টা বসে থেকেছে।

আল-রাযি খোঁজ নিয়ে দেখলেন সেই দেরিগুলোর কারণ: মাছের অর্ডার এলে একজন বাবুর্চিকে বাজারে যেতে হয়, কারণ মাছ আগে থেকে কাটা থাকে না। মাসে মাত্র ২% অর্ডার মাছের, কিন্তু সেই ২%-ই তার সুনাম নষ্ট করছে। **গড় এই সমস্যাটা সম্পূর্ণ লুকিয়ে রেখেছিল**, কারণ ৯৮টা দ্রুত অর্ডার ২টা ভয়াবহ অর্ডারকে চাপা দিয়ে দিচ্ছিল।

এখানেই শেষ নয়। বড় পরিবারগুলো আসে আট-দশজন মিলে, আর তারা সবাই একসাথে খেতে চায় — একজনের খাবার এলেও বাকিরা অপেক্ষা করে। মানে **পুরো টেবিলের অপেক্ষা = সবচেয়ে ধীর থালাটার অপেক্ষা**। ধরুন প্রতিটা থালার আলাদাভাবে ১% সম্ভাবনা আছে ৫৫ মিনিট লাগার। দশটা থালার একটা টেবিলে অন্তত একটা থালা দেরি হওয়ার সম্ভাবনা ১% নয় — প্রায় ১০%। অর্থাৎ **একক থালার p99 হয়ে দাঁড়াল টেবিলের p90**। বড় পরিবারগুলো তাই সবচেয়ে বেশি অসন্তুষ্ট, যদিও রান্নাঘর তাদের সাথে আলাদা কোনো খারাপ ব্যবহার করছে না।

আর আরেকটা জিনিস তিনি খেয়াল করলেন। সন্ধ্যা সাতটা থেকে নয়টা পর্যন্ত রান্নাঘর প্রায় পূর্ণ ক্ষমতায় চলে। তখন একটা অতিরিক্ত অর্ডার এলে অপেক্ষা কয়েক মিনিট বাড়ে না — বাড়ে অনেক বেশি, কারণ লাইন জমতে শুরু করে। দুপুরে যেই অতিরিক্ত অর্ডার ২ মিনিট যোগ করত, সন্ধ্যায় সেটাই ১৫ মিনিট যোগ করে। এটাই **queueing** — ব্যস্ততা যত ১০০%-এর কাছে যায়, অপেক্ষা তত অরৈখিকভাবে বাড়ে।

মিলিয়ে নিই: "গড় ১১ মিনিট" হলো **average**, সাজানো তালিকার পঞ্চাশতম হলো **p50 / median**, পঁচানব্বইতম **p95**, নিরানব্বইতম **p99**, মাছের অর্ডারগুলো হলো **tail** — বিরল কিন্তু ভয়াবহ, দশজনের টেবিল হলো **fan-out** আর তার ফলে খারাপ হওয়া অভিজ্ঞতা হলো **tail latency amplification**, আর সন্ধ্যার ভিড় হলো **queueing at high utilisation**। এই চ্যাপ্টার এই পাঁচটা জিনিসেরই সংখ্যা।

## যে সংখ্যাগুলো মুখস্থ রাখতে হয়

এই টেবিলটা system design-এর গুণ-সারণি। মুখস্থ থাকলে আপনি মিটিংয়ে সঙ্গে সঙ্গে বলতে পারবেন একটা ডিজাইন সম্ভব কিনা।

| অপারেশন                          | সময়            | তুলনায়      |
| -------------------------------- | --------------- | ------------ |
| L1 cache রেফারেন্স               | ১ ns            | ১            |
| শাখা ভুল অনুমান                  | ৩ ns            | ৩            |
| L2 cache রেফারেন্স               | ৪ ns            | ৪            |
| Mutex lock/unlock                | ১৭ ns           | ১৭           |
| মূল মেমরি রেফারেন্স              | ১০০ ns          | ১০০          |
| ১ KB compress (Snappy)           | ২,০০০ ns = ২ µs | ২,০০০        |
| SSD থেকে ৪ KB random read        | ১৫০ µs          | ১,৫০,০০০     |
| মেমরি থেকে ১ MB ক্রমিক পড়া      | ২৫০ µs          | ২,৫০,০০০     |
| একই ডেটাসেন্টারে round trip      | ০.৫ ms          | ৫,০০,০০০     |
| SSD থেকে ১ MB ক্রমিক পড়া        | ১ ms            | ১০,০০,০০০    |
| ডিস্ক seek (ঘূর্ণায়মান)         | ১০ ms           | ১,০০,০০,০০০  |
| ঢাকা থেকে সিঙ্গাপুর round trip   | ~৬০ ms          | ৬,০০,০০,০০০  |
| ঢাকা থেকে ভার্জিনিয়া round trip | ~২৪০ ms         | ২৪,০০,০০,০০০ |

**যদি এক লাইনও মনে না থাকে, এটা রাখুন:** মেমরি ন্যানোসেকেন্ড, SSD মাইক্রোসেকেন্ড, নেটওয়ার্ক মিলিসেকেন্ড। প্রতিটা ধাপে হাজার গুণ।

<Callout type="tip">

সংখ্যাগুলো মানুষের মাপে আনুন। L1 cache-কে ১ সেকেন্ড ধরলে: মেমরি ১০০ সেকেন্ড, SSD read প্রায় ২ দিন, ডেটাসেন্টার round trip প্রায় ৬ দিন, আর ভার্জিনিয়ার round trip প্রায় **৭ বছর**। এই দৃষ্টিভঙ্গি থেকেই বোঝা যায় কেন একটা ক্রস-রিজিয়ন কল লুপের ভেতরে দেওয়া বিপর্যয়।

</Callout>

### এখান থেকে যে ডিজাইন-নিয়মগুলো বের হয়

**নেটওয়ার্ক কলের সংখ্যা কমান, প্রতিটা কল দ্রুত করার চেয়ে।** একটা ৫০ ms কল ১০টা ৫ ms কলের চেয়ে ভালো নয় — কিন্তু ১০টা ৫ ms কল ক্রমান্বয়ে করা মানে ৫০ ms, আর সমান্তরালে করা মানে ৫ ms। **ক্রমিক নাকি সমান্তরাল — এটাই প্রায়ই সবচেয়ে বড় জয়।**

**N+1 query মারাত্মক।** ৫০টা আইটেমের জন্য ৫০টা আলাদা query, প্রতিটা ২ ms — মোট ১০০ ms, যেখানে একটা batch query হয়তো ৩ ms।

**যেখানে ডেটা, সেখানে গণনা।** ১০ লাখ row এনে অ্যাপে ফিল্টার করার চেয়ে ডেটাবেসে ফিল্টার করে ১০০ row আনা হাজার গুণ ভালো।

**দূরত্ব ভৌত সীমা।** আলোর গতি ফাইবারে প্রায় ২,০০,০০০ কিমি/সেকেন্ড। ঢাকা-ভার্জিনিয়া ১৩,০০০ কিমি, যাওয়া-আসা ২৬,০০০ কিমি — মানে ন্যূনতম ১৩০ ms, বাস্তবে রাউটিংয়ের কারণে ২৪০ ms। **কোনো অপটিমাইজেশন এটা কমাতে পারবে না** — শুধু ডেটাকে কাছে নেওয়া যায়।

## কেন গড় মিথ্যা বলে

ধরুন ১০,০০০ রিকোয়েস্টের latency:

```text
9,000 requests  ->    5 ms   (cache hit)
  900 requests  ->   50 ms   (cache miss, db read)
   90 requests  ->  500 ms   (db under contention)
   10 requests  -> 3000 ms   (timeout + retry)

average = (9000*5 + 900*50 + 90*500 + 10*3000) / 10000
        = (45000 + 45000 + 45000 + 30000) / 10000
        = 16.5 ms
```

গড় ১৬.৫ ms — শুনে মনে হবে দুর্দান্ত সিস্টেম। অথচ:

- **p50 = ৫ ms** (অর্ধেক ইউজার এটাই পায়)
- **p95 = ৫০ ms**
- **p99 = ৫০০ ms**
- **p99.9 = ৩,০০০ ms**

গড় ১৬.৫ ms আসলে **কোনো ইউজারের অভিজ্ঞতাই নয়** — কেউই ১৬.৫ ms পায়নি। গড় হলো চারটা সম্পূর্ণ ভিন্ন আচরণের একটা কাল্পনিক মিশ্রণ।

<Callout type="warning">

**গড় latency কখনো একা রিপোর্ট করবেন না।** ন্যূনতম p50, p95, p99 — এবং সাথে সাধারণত p99.9। যদি একটামাত্র সংখ্যা বলতে হয়, p99 বলুন — কারণ সেটাই বলে আপনার সবচেয়ে দুর্ভাগা ইউজারদের কেমন লাগছে।

</Callout>

### Percentile আসলে কী

p99 = ৫০০ ms মানে: **১০০টার মধ্যে ৯৯টা রিকোয়েস্ট ৫০০ ms বা তার কম সময়ে শেষ হয়েছে।**

যা এর মানে নয়: "১% ইউজার ধীর অভিজ্ঞতা পায়"। কারণ একজন ইউজার একটা পেজ খুললে হয়তো ২০টা রিকোয়েস্ট যায়। প্রতিটার ১% সম্ভাবনা ধীর হওয়ার মানে সেই পেজে অন্তত একটা ধীর রিকোয়েস্ট থাকার সম্ভাবনা প্রায় ১৮%। **অর্থাৎ ১% ধীর রিকোয়েস্ট মানে প্রায় ২০% ধীর পেজ লোড।**

আর একজন সক্রিয় ইউজার যদি দিনে ৫০০টা রিকোয়েস্ট করে, তার অন্তত একবার p99-এর ধীরত্ব দেখার সম্ভাবনা কার্যত ১০০%। **p99 কোনো প্রান্তিক ঘটনা নয় — এটা প্রতিটা নিয়মিত ইউজারের রোজকার অভিজ্ঞতা।**

<Mermaid
title="একই গড়, সম্পূর্ণ ভিন্ন অভিজ্ঞতা"
code={`graph LR
  A["avg = 16.5ms"] --> B["p50 = 5ms<br/>অর্ধেক ইউজার খুশি"]
  A --> C["p95 = 50ms<br/>লক্ষণীয় দেরি"]
  A --> D["p99 = 500ms<br/>বিরক্তিকর"]
  A --> E["p99.9 = 3000ms<br/>পরিত্যাগ"]`}
/>

### Percentile যোগ করা যায় না

এটা একটা সূক্ষ্ম কিন্তু গুরুত্বপূর্ণ ভুল। দশটা সার্ভারের প্রত্যেকের p99 আলাদা করে হিসাব করে গড় করলে **পুরো সিস্টেমের p99 পাওয়া যায় না**। একইভাবে, প্রতি মিনিটের p99-এর গড় করে ঘণ্টার p99 পাওয়া যায় না।

সঠিক উপায় হলো **histogram** রাখা — প্রতিটা bucket-এ কতগুলো নমুনা পড়ল তার গণনা। Histogram যোগ করা যায় (bucket-ভিত্তিক গণনা যোগ করুন), তারপর যোগফল থেকে percentile বের করুন। Prometheus, HDR Histogram, DataDog — সবাই এই কারণেই histogram রাখে, কাঁচা percentile নয়।

## Tail latency amplification — সবচেয়ে গুরুত্বপূর্ণ ধারণা

একটা রিকোয়েস্ট যদি উত্তর দেওয়ার জন্য N টা ডাউনস্ট্রিম কল করে এবং **সবগুলোর উত্তর লাগে**, তাহলে সেই রিকোয়েস্ট ততক্ষণ শেষ হয় না যতক্ষণ না সবচেয়ে ধীরটা শেষ হয়।

ধরুন প্রতিটা ডাউনস্ট্রিম কলের ১% সম্ভাবনা আছে ধীর হওয়ার (p99)। তাহলে:

```text
P(all N calls are fast) = 0.99^N
P(at least one is slow) = 1 - 0.99^N

N = 1    ->  1.0%   slow
N = 5    ->  4.9%   slow
N = 10   ->  9.6%   slow
N = 20   -> 18.2%   slow
N = 50   -> 39.5%   slow
N = 100  -> 63.4%   slow
```

**১০০টা shard-এ ছড়ানো একটা query-তে ৬৩% সম্ভাবনা যে অন্তত একটা shard ধীর হবে।** অর্থাৎ ব্যক্তিগত সার্ভিসের p99 হয়ে দাঁড়ায় সমষ্টিগত সার্ভিসের p37। এই কারণেই বড় fan-out সিস্টেমে (search, news feed, microservice-ভারী আর্কিটেকচার) tail latency-ই প্রধান শত্রু।

### এর বিরুদ্ধে যা করা হয়

**Hedged request** — সবচেয়ে কার্যকর কৌশল। p95 সময় পার হয়ে গেলে একই query আরেকটা replica-তেও পাঠান, তারপর যেটা আগে আসে সেটা নিন, অন্যটা বাতিল করুন। মাত্র ৫% অতিরিক্ত লোডে p99 নাটকীয়ভাবে নামে।

**Fan-out কমান** — ১০০টা shard-এর বদলে ১০টা। প্রতিটা shard বড় হবে, কিন্তু tail অনেক ভালো।

**আংশিক উত্তর দিন** — ৫০ ms-এ যা যা এসেছে তাই ফেরত দিন, বাকিটা ছাড়া। search বা feed-এ ইউজার টের পায় না যে দশটার বদলে নয়টা উৎস ব্যবহার হয়েছে।

**প্রতিটা ডাউনস্ট্রিমে timeout দিন এবং সেটা p99-এর কাছাকাছি রাখুন**, p99.9-এর কাছে নয়।

<Callout type="tip">

**একটা সিস্টেমের গতি তার সবচেয়ে ধীর প্রয়োজনীয় অংশের গতি।** তাই "গড়ে দ্রুত" ডাউনস্ট্রিম সার্ভিসের চেয়ে "সবসময় নির্ভরযোগ্যভাবে মাঝারি" সার্ভিস অনেক ভালো। Fan-out সিস্টেমে **পূর্বানুমেয়তা গতির চেয়ে মূল্যবান**।

</Callout>

## Utilisation আর queueing

আরেকটা অরৈখিক সম্পর্ক যা না জানলে ক্ষমতার হিসাব ভুল হয়। সরলীকৃত queueing তত্ত্বে অপেক্ষার সময়:

```text
wait_time ≈ service_time × utilisation / (1 - utilisation)

utilisation 50%  ->  wait = 1.0 × service_time
utilisation 70%  ->  wait = 2.3 × service_time
utilisation 80%  ->  wait = 4.0 × service_time
utilisation 90%  ->  wait = 9.0 × service_time
utilisation 95%  ->  wait = 19.0 × service_time
utilisation 99%  ->  wait = 99.0 × service_time
```

৫০% থেকে ৯০%-এ যেতে ব্যস্ততা বাড়ল ১.৮ গুণ, কিন্তু অপেক্ষা বাড়ল ৯ গুণ। এই কারণেই চ্যাপ্টার ৩-এ বলা হয়েছিল ৬০-৭০% ব্যবহারের বেশি পরিকল্পনা করবেন না। **যে সিস্টেম ৯৫% ব্যস্ত, সেটা "দক্ষ" নয় — সেটা বিপদের মুখে দাঁড়িয়ে আছে।**

## Latency মাপার সঠিক উপায়

নিচের কোডটা তিনটা জিনিস দেয়: একটা histogram-ভিত্তিক latency recorder (যা যোগ করা যায় এবং মেমরিতে বাড়ে না), একটা percentile রিপোর্টার, আর একটা fan-out সিমুলেটর যা দেখায় tail amplification বাস্তবে কেমন দেখায় — এবং hedging কতটা সাহায্য করে।

```typescript
// ---------------------------------------------------------------------------
// Latency measurement that survives production:
//   1. A bucketed histogram — bounded memory, and mergeable across servers.
//   2. Percentile extraction from bucket counts.
//   3. A fan-out simulator showing tail amplification, with and without hedging.
// ---------------------------------------------------------------------------

/**
 * Log-linear buckets: fine resolution where it matters (single-digit ms) and
 * coarse where it does not (multi-second). This is the same idea behind HDR
 * histograms and Prometheus native histograms.
 */
export class LatencyHistogram {
	private readonly bounds: number[];
	private readonly counts: number[];
	private overflow = 0;
	private total = 0;
	private sum = 0;
	private min = Number.POSITIVE_INFINITY;
	private max = 0;

	constructor(readonly name: string) {
		this.bounds = LatencyHistogram.buildBounds();
		this.counts = new Array(this.bounds.length).fill(0);
	}

	private static buildBounds(): number[] {
		const bounds: number[] = [];
		// 0.1ms .. 1ms in 0.1 steps, 1..10 in 1s, 10..100 in 10s, and so on.
		for (let decade = -1; decade <= 4; decade++) {
			const base = Math.pow(10, decade);
			for (let step = 1; step <= 10; step++) {
				bounds.push(Number((base * step).toFixed(4)));
			}
		}
		return [...new Set(bounds)].sort((a, b) => a - b);
	}

	record(ms: number): void {
		this.total++;
		this.sum += ms;
		if (ms < this.min) this.min = ms;
		if (ms > this.max) this.max = ms;

		const idx = this.bucketFor(ms);
		if (idx === -1) this.overflow++;
		else this.counts[idx]++;
	}

	private bucketFor(ms: number): number {
		// Binary search for the first bound >= ms.
		let lo = 0;
		let hi = this.bounds.length - 1;
		if (ms > this.bounds[hi]) return -1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (this.bounds[mid] >= ms) hi = mid;
			else lo = mid + 1;
		}
		return lo;
	}

	/** Histograms merge; percentiles do not. This is the whole point. */
	merge(other: LatencyHistogram): void {
		if (other.bounds.length !== this.bounds.length) {
			throw new Error('cannot merge histograms with different bucket layouts');
		}
		for (let i = 0; i < this.counts.length; i++) this.counts[i] += other.counts[i];
		this.overflow += other.overflow;
		this.total += other.total;
		this.sum += other.sum;
		this.min = Math.min(this.min, other.min);
		this.max = Math.max(this.max, other.max);
	}

	percentile(p: number): number {
		if (this.total === 0) return 0;
		const target = (p / 100) * this.total;
		let seen = 0;
		for (let i = 0; i < this.counts.length; i++) {
			seen += this.counts[i];
			if (seen >= target) return this.bounds[i];
		}
		return this.max;
	}

	get mean(): number {
		return this.total === 0 ? 0 : this.sum / this.total;
	}

	get count(): number {
		return this.total;
	}

	summary(): string {
		const p = (v: number) => `${this.percentile(v).toFixed(1)}ms`;
		return [
			`${this.name}  n=${this.total}`,
			`  mean ${this.mean.toFixed(1)}ms   min ${this.min.toFixed(1)}ms   max ${this.max.toFixed(1)}ms`,
			`  p50 ${p(50)}   p90 ${p(90)}   p95 ${p(95)}   p99 ${p(99)}   p99.9 ${p(99.9)}`,
			this.overflow > 0 ? `  WARNING: ${this.overflow} samples above the top bucket` : ''
		]
			.filter(Boolean)
			.join('\n');
	}
}

// --- A latency model with a realistic tail -------------------------------

export interface LatencyProfile {
	fastMs: number;
	slowMs: number;
	verySlowMs: number;
	slowProbability: number; // e.g. 0.05
	verySlowProbability: number; // e.g. 0.01
}

export function sampleLatency(profile: LatencyProfile, rng: () => number = Math.random): number {
	const r = rng();
	if (r < profile.verySlowProbability) {
		return profile.verySlowMs * (0.8 + rng() * 0.4);
	}
	if (r < profile.verySlowProbability + profile.slowProbability) {
		return profile.slowMs * (0.8 + rng() * 0.4);
	}
	return profile.fastMs * (0.7 + rng() * 0.6);
}

// --- Fan-out simulation --------------------------------------------------

export interface FanoutResult {
	fanout: number;
	histogram: LatencyHistogram;
	hedgedHistogram: LatencyHistogram;
	extraLoadFromHedgingPct: number;
}

/**
 * Simulates a request that must wait for `fanout` parallel downstream calls.
 * The hedged variant fires a second attempt for any call still outstanding at
 * `hedgeAfterMs`, and takes whichever finishes first.
 */
export function simulateFanout(
	fanout: number,
	profile: LatencyProfile,
	iterations: number,
	hedgeAfterMs: number
): FanoutResult {
	const plain = new LatencyHistogram(`fanout=${fanout} plain`);
	const hedged = new LatencyHistogram(`fanout=${fanout} hedged`);
	let hedgeAttempts = 0;
	let totalCalls = 0;

	for (let i = 0; i < iterations; i++) {
		let slowestPlain = 0;
		let slowestHedged = 0;

		for (let call = 0; call < fanout; call++) {
			totalCalls++;
			const first = sampleLatency(profile);
			slowestPlain = Math.max(slowestPlain, first);

			let effective = first;
			if (first > hedgeAfterMs) {
				hedgeAttempts++;
				// Second attempt starts at hedgeAfterMs and runs independently.
				const second = hedgeAfterMs + sampleLatency(profile);
				effective = Math.min(first, second);
			}
			slowestHedged = Math.max(slowestHedged, effective);
		}

		plain.record(slowestPlain);
		hedged.record(slowestHedged);
	}

	return {
		fanout,
		histogram: plain,
		hedgedHistogram: hedged,
		extraLoadFromHedgingPct: (hedgeAttempts / totalCalls) * 100
	};
}

// --- Probability check (the arithmetic from the chapter) -----------------

export function probabilityAtLeastOneSlow(fanout: number, slowProbability: number): number {
	return 1 - Math.pow(1 - slowProbability, fanout);
}

// --- Demo ----------------------------------------------------------------

const profile: LatencyProfile = {
	fastMs: 5,
	slowMs: 50,
	verySlowMs: 500,
	slowProbability: 0.09,
	verySlowProbability: 0.01
};

console.log('--- single call ---');
const single = new LatencyHistogram('single downstream call');
for (let i = 0; i < 200_000; i++) single.record(sampleLatency(profile));
console.log(single.summary());

console.log('\n--- tail amplification ---');
for (const fanout of [1, 5, 10, 20, 50, 100]) {
	const pct = probabilityAtLeastOneSlow(fanout, 0.01) * 100;
	console.log(
		`fanout ${String(fanout).padStart(3)}  ->  ${pct.toFixed(1)}% of requests hit a p99 call`
	);
}

console.log('\n--- hedging ---');
for (const fanout of [1, 10, 50]) {
	const result = simulateFanout(fanout, profile, 50_000, 40);
	console.log(result.histogram.summary());
	console.log(result.hedgedHistogram.summary());
	console.log(`  hedging added ${result.extraLoadFromHedgingPct.toFixed(1)}% extra calls\n`);
}

console.log('--- merging histograms across servers ---');
const serverA = new LatencyHistogram('baghdad-api-1');
const serverB = new LatencyHistogram('baghdad-api-2');
for (let i = 0; i < 50_000; i++) serverA.record(sampleLatency(profile));
for (let i = 0; i < 50_000; i++) serverB.record(sampleLatency({ ...profile, fastMs: 12 }));
const fleet = new LatencyHistogram('fleet total');
fleet.merge(serverA);
fleet.merge(serverB);
console.log(serverA.summary());
console.log(serverB.summary());
console.log(fleet.summary());
```

## মাপার সময় যে ভুলগুলো হয়

**ভুল জায়গায় মাপা।** সার্ভারের ভেতরে মাপলে DNS, TLS, নেটওয়ার্ক আর queueing বাদ পড়ে যায় — অর্থাৎ ইউজারের ব্যথার সিংহভাগ। ক্লায়েন্ট-সাইড মাপও রাখুন (RUM)।

**Coordinated omission।** লোড টেস্টিং টুল যদি ধীর রেসপন্সের সময় নতুন রিকোয়েস্ট পাঠানো বন্ধ করে দেয়, তাহলে ঠিক সবচেয়ে খারাপ মুহূর্তগুলোর নমুনাই বাদ পড়ে যায়, আর p99 কৃত্রিমভাবে ভালো দেখায়। ভালো টুল (wrk2, `hdrhistogram` ভিত্তিক) এটার জন্য সংশোধন করে।

**সব endpoint মিশিয়ে ফেলা।** একটা ৩ ms health check আর একটা ২ সেকেন্ডের রিপোর্ট একই histogram-এ ফেললে দুইটার কোনোটাই বোঝা যায় না। route অনুযায়ী আলাদা করুন।

**শুধু সফল রিকোয়েস্ট গোনা।** timeout হওয়া রিকোয়েস্টগুলো histogram থেকে বাদ পড়লে সবচেয়ে খারাপ কেসগুলোই অদৃশ্য হয়ে যায়। ব্যর্থতাগুলোও রেকর্ড করুন, timeout সীমার মান দিয়ে।

**গড় দিয়ে অ্যালার্ট বসানো।** গড় বাড়ার আগেই ইউজাররা চলে যাওয়া শুরু করবে। p99 আর error rate দিয়ে অ্যালার্ট করুন।

<div class="takeaways">

### মূল শেখা

- মেমরি ন্যানোসেকেন্ড, SSD মাইক্রোসেকেন্ড, নেটওয়ার্ক মিলিসেকেন্ড — প্রতিটা ধাপে প্রায় হাজার গুণ
- আলোর গতি একটা কঠিন সীমা; ক্রস-রিজিয়ন round trip কোনো অপটিমাইজেশনে কমে না, শুধু ডেটা কাছে আনা যায়
- গড় latency একটা কাল্পনিক সংখ্যা যা কারো অভিজ্ঞতা নয়; সবসময় p50, p95, p99 একসাথে দেখুন
- p99 প্রান্তিক ঘটনা নয় — একজন সক্রিয় ইউজার প্রতিদিনই সেটার মুখোমুখি হয়
- Percentile যোগ বা গড় করা যায় না; histogram রাখুন, সেগুলো যোগ করা যায়
- Fan-out-এ tail বিস্ফোরিত হয়: ১% ধীর কল আর ১০০ fan-out মানে ৬৩% রিকোয়েস্ট ধীর
- Hedged request সামান্য অতিরিক্ত লোডে p99 নাটকীয়ভাবে কমায়
- Utilisation ৭০% পেরোলে queueing-এর কারণে অপেক্ষা অরৈখিকভাবে বাড়ে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **SLO ঠিক করার সময়** — endpoint-ভিত্তিক p95/p99 লক্ষ্য বসানো, গড় নয়
- **ড্যাশবোর্ড বানানোর সময়** — route অনুযায়ী histogram, আর p50/p95/p99 একই গ্রাফে যাতে ফারাকটা চোখে পড়ে
- **Microservice আর্কিটেকচার রিভিউতে** — একটা রিকোয়েস্টে কয়টা ডাউনস্ট্রিম কল হচ্ছে গুনে দেখা, এবং tail amplification-এর হিসাব করা
- **Search ও feed সিস্টেমে** — hedged request আর আংশিক উত্তরের নীতি চালু করা
- **ক্ষমতা পরিকল্পনায়** — ৭০% utilisation-এর সীমা মেনে auto-scaling-এর থ্রেশহোল্ড বসানো
- **লোড টেস্টের ফলাফল পড়ার সময়** — coordinated omission হয়েছে কিনা যাচাই করা, নইলে সংখ্যাগুলো মিথ্যা আশ্বাস দেয়

</div>
