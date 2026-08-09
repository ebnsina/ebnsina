---
title: 'ব্যর্থতার জন্য ডিজাইন'
subtitle: 'Timeout ও retry storm, circuit breaker, bulkhead, backpressure ও load shedding, graceful degradation, আংশিক ব্যর্থতায় idempotency, আর blast-radius ভাবনা।'
chapter: 19
level: 'advanced'
readingTime: '২৯ মিনিট'
topics:
  [
    'resilience',
    'timeouts',
    'retries',
    'circuit breaker',
    'bulkhead',
    'backpressure',
    'load shedding',
    'idempotency'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা ব্যস্ত রান্নাঘরে সবচেয়ে বিপজ্জনক জিনিস আগুন নয় — অপেক্ষমাণ অর্ডারের স্তূপ। যে বাবুর্চি "না" বলতে জানে না, তার রান্নাঘরে শেষ পর্যন্ত কেউই খাবার পায় না।

</Callout>

## গল্পে বুঝি

দামেস্কের এক কারওয়ানসরাইয়ে আল-ফারাবির রান্নাঘর। সাধারণ দিনে সব ঠিকঠাক — বাইরের বারান্দায় চল্লিশজন খেতে বসে, ভেতরে ছয়জন কাজ করে, দুটো চুলা, একটা তন্দুর, আর পেছনে ভাণ্ডারঘর। কিন্তু বছরে কয়েকবার এমন দিন আসে যখন একসাথে তিনটা কাফেলা এসে পড়ে, আর তখন যা যা ভাঙে সেগুলোই এই চ্যাপ্টারের পুরো বিষয়।

প্রথম ভাঙন এসেছিল মাছওয়ালাকে নিয়ে। রান্নাঘরের একজন লোক প্রতিদিন সকালে মাছওয়ালার কাছে যায়। একদিন মাছওয়ালা অসুস্থ, দোকান বন্ধ — কিন্তু ছেলেটা দাঁড়িয়ে রইল, কারণ তাকে কেউ বলেনি কতক্ষণ দাঁড়াতে হবে। সে সারাদিন দাঁড়িয়ে রইল, আর ওদিকে রান্নাঘরে একজন লোক কম পড়ে গেল, সেদিনের সব রান্না পিছিয়ে গেল। আল-ফারাবি নিয়ম করলেন: **"যেখানেই যাও, কতক্ষণ দাঁড়াবে সেটা আগে ঠিক করে যাও।"** এটাই **timeout**, আর নিয়মটার আসল মর্ম হলো — timeout না থাকা মানে timeout অসীম, আর অসীম অপেক্ষা মানে আপনার লোক হারিয়ে যাওয়া।

দ্বিতীয় ভাঙন আরও শিক্ষণীয়। মাছওয়ালার দোকান বন্ধ দেখে ছেলেটা ফিরে এলো, আল-ফারাবি বললেন "আবার যাও"। সে গেল, ফিরল, আবার গেল। এদিকে পাশের চারটা রান্নাঘরের ছেলেরাও একই কাজ করছে। মাছওয়ালা যখন দুপুরে একটু সুস্থ হয়ে দোকান খুলল, তখন একসাথে ত্রিশজন দরজায় হুমড়ি খেয়ে পড়ল — সে আবার দোকান বন্ধ করে দিল। অর্থাৎ **যে ব্যবস্থা ফিরে আসতে চাইছিল, বারবার চেষ্টার চাপেই সেটা আবার পড়ে গেল**। এটাই **retry storm**, আর এর সমাধান দুটো: একটু অপেক্ষা করে করে যাওয়া, আর প্রত্যেকে **আলাদা আলাদা সময়ে** যাওয়া — নইলে সবাই একসাথেই পৌঁছাবে। এটাই **exponential backoff** আর **jitter**।

তৃতীয় ব্যবস্থাটা আল-ফারাবি নিজেই আবিষ্কার করলেন। তিনি দেখলেন, মাছওয়ালা যদি পরপর পাঁচবার বন্ধ পাওয়া যায়, তাহলে ষষ্ঠবার যাওয়াটা কেবল সময় নষ্ট। তাই তিনি রান্নাঘরের দরজায় একটা কাঠের ফলক ঝোলালেন: "মাছ — বন্ধ"। ফলক ঝোলানো থাকলে কেউ আর যায়ই না, সাথে সাথে মাছের বদলে ডালের পদ রান্না হয়। প্রতি এক প্রহর পরপর একজনকে **শুধু একবার** পাঠানো হয় দেখতে; সে যদি মাছ নিয়ে ফেরে, ফলক নামিয়ে ফেলা হয়। ফলকটাই **circuit breaker** — খোলা, বন্ধ, আর "একবার দেখে আসি" — এই তিনটা অবস্থা নিয়ে।

চতুর্থ ভাঙনটা সবচেয়ে নির্মম ছিল। একদিন বিয়ের একটা বিশাল অর্ডার এলো, আর রান্নাঘরের ছয়জনই সেটাতে লেগে গেল। ওদিকে বারান্দায় সাধারণ মুসাফিররা বসে আছে, তাদের এক টুকরো রুটিও কেউ দিতে পারছে না, কারণ সবাই ব্যস্ত। একটা বড় কাজ পুরো রান্নাঘরটাকে গিলে ফেলল। আল-ফারাবি তখন লোকজনকে ভাগ করে দিলেন: চারজন কেবল সাধারণ খাবারের জন্য, দুজন কেবল বড় অর্ডারের জন্য, আর **এক দল অন্য দলের লোক ধার নিতে পারবে না**। বড় অর্ডার ডুবলে ডুবুক, মুসাফিররা রুটি পাবেই। এই ভাগ করে দেওয়াই **bulkhead** — জাহাজের খোলে যেমন আলাদা প্রকোষ্ঠ থাকে, একটা ফুটো হলেও পুরো জাহাজ ডোবে না।

পঞ্চম শিক্ষাটা সবচেয়ে গভীর, আর এটাই এই চ্যাপ্টারের হৃদয়। সেই ব্যস্ত দিনে আল-ফারাবি লক্ষ করলেন রুটিওয়ালা ছেলেটা যত দ্রুত ময়দা মাখছে, তন্দুর তত দ্রুত সেঁকতে পারছে না। কাঁচা রুটির ট্রে জমতে জমতে টেবিল ভরে গেল, তারপর মেঝেতে, তারপর কিছু রুটি শুকিয়ে নষ্ট হয়ে গেল — অর্থাৎ **যে কাজটা করা হয়েছিল সেটাও বৃথা গেল**। ছেলেটা কিন্তু কোনো ভুল করেনি, সে দ্রুত কাজ করছিল। ভুলটা ছিল ব্যবস্থায়: দ্রুত অংশকে ধীর অংশের গতিতে বেঁধে দেওয়া হয়নি। আল-ফারাবি একটা ছোট তাক বানিয়ে দিলেন যাতে ঠিক ছয়টা ট্রে ধরে, আর নিয়ম করলেন — তাক ভরা থাকলে ময়দা মাখা বন্ধ, ছেলেটা তখন বরং বাসন ধোবে। এটাই **backpressure**: ধীর অংশ দ্রুত অংশকে থামতে বলছে, আর সেই সংকেতটা পুরো শেকল ধরে পেছন দিকে যাচ্ছে।

আর ষষ্ঠ শিক্ষাটা এসেছিল সেই দিনের সন্ধ্যায়। তিনশো লোক খেতে চাইছে, রান্নাঘর একশোজনের বেশি পারবে না। আল-ফারাবি দুটো পথ দেখলেন। প্রথম পথ: সবাইকে বসিয়ে রাখা, সবাই চার ঘণ্টা অপেক্ষা করবে, খাবার ঠান্ডা হবে, আর শেষে তিনশো জনই অসন্তুষ্ট হয়ে যাবে। দ্বিতীয় পথ: দরজায় দাঁড়িয়ে দুইশো জনকে সাথে সাথে বলে দেওয়া "আজ আর হবে না, পাশের সরাইয়ে যান" — নির্মম শোনায়, কিন্তু একশো জন গরম খাবার পাবে আর দুইশো জন সময় নষ্ট না করে অন্য ব্যবস্থা করতে পারবে। তিনি দ্বিতীয়টা বেছে নিলেন, আর সাথে একটা নিয়ম যোগ করলেন: যারা ইতিমধ্যে টাকা দিয়েছে বা অসুস্থ, তারা আগে। এটাই **load shedding** — এবং এর নিষ্ঠুর সত্যটা হলো, **তাড়াতাড়ি "না" বলা দেরিতে "না" বলার চেয়ে সবার জন্যই ভালো**।

মিলিয়ে নিই: "কতক্ষণ দাঁড়াবে ঠিক করে যাও" হলো **timeout**; একসাথে সবার ফিরে যাওয়া **retry storm**, আর তার ওষুধ **exponential backoff ও jitter**; দরজার কাঠের ফলক **circuit breaker**; লোকজনকে ভাগ করে দেওয়া **bulkhead**; ছয় ট্রের তাক **bounded queue ও backpressure**; দরজায় দাঁড়িয়ে "আজ হবে না" বলা **load shedding**; মাছের বদলে ডাল **graceful degradation**; আর আগুন যেন এক চুলাতেই থাকে সেই ভাবনা **blast-radius thinking**।

## ব্যর্থতা ব্যতিক্রম নয়, ইনপুট

Distributed সিস্টেমে ডিজাইনের সবচেয়ে বড় মানসিক পরিবর্তনটা হলো ব্যর্থতাকে "যা কখনো কখনো হয়" থেকে "যা সবসময় হচ্ছে" হিসেবে দেখা। একশো মেশিনের একটা cluster-এ, প্রতিটার যদি ৯৯.৯ শতাংশ availability হয়, তাহলে যেকোনো মুহূর্তে গড়ে একটা মেশিন খারাপ — অর্থাৎ "সব ঠিক আছে" অবস্থাটাই বিরল।

আরও জরুরি একটা পার্থক্য আছে, যেটা না বুঝলে বাকি সব কৌশল ভুল জায়গায় প্রয়োগ হয়।

**Fail-fast** — সাড়া না পাওয়ার চেয়ে দ্রুত ব্যর্থ হওয়া ভালো, কারণ ব্যর্থতা জানা গেলে বিকল্প নেওয়া যায়।

**Fail-slow হলো সবচেয়ে বিপজ্জনক অবস্থা।** একটা সার্ভিস পুরো মরে গেলে সেটা সহজ — সবাই সাথে সাথে টের পায়, load balancer সরিয়ে দেয়, alert বাজে। কিন্তু একটা সার্ভিস যদি সাড়া দেয় ৩০ সেকেন্ডে, তাহলে সে সবার thread ধরে রাখে, connection pool ভরে ফেলে, আর তার উপরের সব সার্ভিসকে ধীরে ধীরে টেনে নামায়। **ধীর নির্ভরতা মৃত নির্ভরতার চেয়ে বেশি ক্ষতি করে** — এই একটা বাক্যই এই চ্যাপ্টারের অর্ধেক।

## Timeout: সবচেয়ে অবহেলিত সেটিং

প্রতিটা নেটওয়ার্ক কলের timeout থাকতে হবে। এটা আলোচনার বিষয় নয়। কিন্তু কোন সংখ্যা বসাবেন, সেটা আলোচনার বিষয়, আর বেশিরভাগ দল এখানে অনুমান করে।

সঠিক পদ্ধতি হলো নিচের সার্ভিসের latency distribution থেকে শুরু করা। যদি p99 হয় ১২০ ms, তাহলে timeout ১৫০ ms নয় — কারণ তাহলে স্বাভাবিক দিনেও ১ শতাংশের কাছাকাছি request কেটে যাবে। আবার ১০ সেকেন্ডও নয়, কারণ তাহলে timeout-এর কোনো অর্থই থাকল না। সাধারণ নিয়ম: **p99.9-এর কাছাকাছি, একটু উপরে**।

আরও গুরুত্বপূর্ণ ধারণাটা হলো **deadline propagation**। ব্যবহারকারী যদি ২ সেকেন্ডের বেশি অপেক্ষা করতে না চায়, তাহলে সেই ২ সেকেন্ডের বাজেট পুরো শেকল ধরে ভাগ হওয়া উচিত। Gateway ১০০ ms খরচ করে ফেললে trip সার্ভিসের হাতে ১৯০০ ms, সে ২০০ ms খরচ করলে pricing-এর হাতে ১৭০০ ms। প্রতিটা hop নিজের timeout নিজে ঠিক করলে যোগফল ব্যবহারকারীর ধৈর্যের চেয়ে অনেক বড় হয়ে যায়, আর তখন কেউ কারও অপেক্ষার কথা জানে না।

<Callout type="warning">

একটা সাধারণ ফাঁদ: **timeout-এর পরেও কাজটা চলতে থাকে।** ক্লায়েন্ট ৫০০ ms-এ হাল ছেড়ে দিল, কিন্তু সার্ভার সেই request নিয়ে আরও ৩ সেকেন্ড কাজ করে, ডেটাবেসের connection ধরে রাখে, তারপর একটা response পাঠায় যা কেউ পড়বে না। ওভারলোডের সময় এটা আগুনে ঘি ঢালে — সার্ভার তার সব ক্ষমতা এমন কাজে ব্যয় করে যার ফলাফল কেউ চায় না। তাই সার্ভারেও deadline যাচাই করুন এবং সময় পেরিয়ে গেলে কাজটা বাতিল করুন (Go-তে `context`, Node-এ `AbortSignal`)।

</Callout>

## Retry: যা সমস্যা সমাধানও করে, তৈরিও করে

Retry-এর অদ্ভুত ব্যাপারটা হলো — এটা ছোট ব্যর্থতা লুকায় আর বড় ব্যর্থতা বানায়। ক্ষণস্থায়ী নেটওয়ার্ক সমস্যায় একটা retry সোনার মতো কাজ করে। কিন্তু নিচের সার্ভিসটা যখন ওভারলোডেড, তখন retry ঠিক সেই মুহূর্তে ট্রাফিক তিন গুণ করে দেয় যখন সে সবচেয়ে দুর্বল।

চারটা নিয়ম মানলে retry নিরাপদ থাকে।

**এক: কেবল retry-যোগ্য জিনিস retry করুন।** Timeout, connection error, 503, 429 — হ্যাঁ। 400, 401, 404, 422 — কখনোই না; ওগুলো আবার পাঠালে একই উত্তরই আসবে, শুধু খরচ বাড়বে।

**দুই: exponential backoff, এবং jitter বাধ্যতামূলক।** Backoff ছাড়া retry মানে দ্রুত বন্যা। Jitter ছাড়া backoff মানে সব ক্লায়েন্ট একই মুহূর্তে ফিরে আসবে — যাকে বলা হয় thundering herd। সবচেয়ে ভালো কাজ করে **full jitter**: `sleep = random(0, min(cap, base * 2^attempt))`।

**তিন: retry budget রাখুন।** নিয়ম হলো, মোট request-এর একটা নির্দিষ্ট শতাংশের (সাধারণত ১০) বেশি retry হবে না। এই একটা নিয়মই retry storm-কে গাণিতিকভাবে অসম্ভব করে দেয়, কারণ ব্যর্থতার হার যত বাড়ুক, retry ট্রাফিক ১০ শতাংশেই আটকে থাকবে।

**চার: শেকলের এক জায়গাতেই retry করুন।** যদি প্রতিটা স্তর ৩ বার retry করে, তাহলে ৪ স্তরের শেকলে সবচেয়ে নিচের সার্ভিস ৮১টা কল পাবে একটা ব্যবহারকারীর request থেকে। এটা তাত্ত্বিক নয় — এভাবেই বাস্তব outage হয়।

<Mermaid
title="Retry Amplification Across Layers"
code={`graph TD
  U["1 user request"] --> A["Gateway<br/>3 attempts"]
  A --> B["Trip service<br/>3 attempts each"]
  B --> C["Pricing service<br/>3 attempts each"]
  C --> D["Database<br/>81 calls"]`}
/>

## Circuit breaker

Circuit breaker হলো একটা সহজ স্বীকারোক্তি: নিচের সার্ভিসটা যখন ভাঙা, তখন তার কাছে যাওয়াটা দুই দিক থেকেই ক্ষতিকর — আপনার thread আটকে থাকে, আর তার উপর চাপ বাড়ে। তাই কিছুক্ষণের জন্য যাওয়াই বন্ধ।

তিনটা অবস্থা:

- **Closed** — স্বাভাবিক, সব কল যাচ্ছে, ব্যর্থতা গোনা হচ্ছে
- **Open** — ব্যর্থতার হার সীমা ছাড়িয়েছে, তাই সব কল সাথে সাথে ব্যর্থ হচ্ছে (নেটওয়ার্কে যাচ্ছেই না)
- **Half-open** — অপেক্ষার সময় শেষ, তাই অল্প কয়েকটা পরীক্ষামূলক কল যেতে দেওয়া হচ্ছে; সফল হলে closed, ব্যর্থ হলে আবার open

<Mermaid
title="Circuit Breaker States"
code={`stateDiagram-v2
  [*] --> Closed
  Closed --> Open: failure ratio over threshold in window
  Open --> HalfOpen: cool down period elapsed
  HalfOpen --> Closed: probe successes reach threshold
  HalfOpen --> Open: any probe fails`}
/>

<Callout type="tip">

Circuit breaker-এর সবচেয়ে বেশি ভুল হয় **স্কোপে**। পুরো সার্ভিসের জন্য একটা breaker রাখলে একটা খারাপ endpoint পুরো সার্ভিসকে কেটে দেবে। আবার প্রতিটা host-এর জন্য আলাদা breaker রাখলে কোনোটাই যথেষ্ট নমুনা পাবে না। বাস্তবে ভালো কাজ করে **প্রতি নির্ভরতা প্রতি operation** স্কোপ — যেমন `pricing-service:quote-fare`। আর মনে রাখবেন, half-open অবস্থায় একসাথে সব ট্রাফিক ছেড়ে দেবেন না; কয়েকটা probe যেতে দিন, নইলে সদ্য উঠে দাঁড়ানো সার্ভিসটা আবার পড়ে যাবে।

</Callout>

## Resilience toolkit

নিচের কোডটা একসাথে timeout, jitter-সহ retry, retry budget, circuit breaker আর bulkhead বাস্তবায়ন করে — এবং গুরুত্বপূর্ণভাবে, এগুলোকে সঠিক ক্রমে স্তরে স্তরে সাজায়।

<CodeTabs tsFile="resilience.ts" goFile="resilience.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// --- Errors ---
export class TimeoutError extends Error {
	constructor(ms: number) {
		super(`operation timed out after ${ms}ms`);
		this.name = 'TimeoutError';
	}
}

export class CircuitOpenError extends Error {
	constructor(name: string, retryAfterMs: number) {
		super(`circuit ${name} is open, retry in ${retryAfterMs}ms`);
		this.name = 'CircuitOpenError';
	}
}

export class BulkheadFullError extends Error {
	constructor(name: string) {
		super(`bulkhead ${name} is full`);
		this.name = 'BulkheadFullError';
	}
}

// --- Deadline: a budget that travels with the request ---
export class Deadline {
	private constructor(readonly expiresAt: number) {}

	static in(ms: number): Deadline {
		return new Deadline(Date.now() + ms);
	}

	remainingMs(): number {
		return Math.max(0, this.expiresAt - Date.now());
	}

	expired(): boolean {
		return this.remainingMs() === 0;
	}

	/** Reserve a slice for this hop, leaving the rest for downstream calls. */
	slice(fraction: number): number {
		return Math.floor(this.remainingMs() * fraction);
	}
}

// --- Timeout wrapper that actually cancels the work ---
export async function withTimeout<T>(
	ms: number,
	fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	try {
		return await fn(controller.signal);
	} finally {
		clearTimeout(timer);
	}
}

// --- Retry classification ---
export function isRetryable(err: unknown): boolean {
	if (err instanceof TimeoutError) return true;
	if (err instanceof CircuitOpenError) return false; // already shed, do not pile on
	if (err instanceof BulkheadFullError) return false;

	const status = (err as { status?: number }).status;
	if (status === undefined) return true; // network level failure
	if (status === 429 || status === 503 || status === 504) return true;
	return status >= 500 && status < 600;
}

// --- Retry budget: caps retries as a fraction of total traffic ---
export class RetryBudget {
	private attempts = 0;
	private retries = 0;
	private windowStart = Date.now();

	constructor(
		private readonly ratio = 0.1,
		private readonly minRetriesPerSecond = 5,
		private readonly windowMs = 10_000
	) {}

	private roll(): void {
		if (Date.now() - this.windowStart > this.windowMs) {
			this.attempts = 0;
			this.retries = 0;
			this.windowStart = Date.now();
		}
	}

	recordAttempt(): void {
		this.roll();
		this.attempts += 1;
	}

	/**
	 * The budget is what makes retries mathematically safe: no matter how bad
	 * the downstream failure rate gets, retry traffic stays capped at `ratio`
	 * of real traffic, so a struggling service is never tripled.
	 */
	tryConsume(): boolean {
		this.roll();
		const allowance = Math.max(
			this.minRetriesPerSecond * (this.windowMs / 1000),
			this.attempts * this.ratio
		);
		if (this.retries >= allowance) return false;
		this.retries += 1;
		return true;
	}

	get utilisation(): number {
		const allowance = Math.max(
			this.minRetriesPerSecond * (this.windowMs / 1000),
			this.attempts * this.ratio
		);
		return allowance === 0 ? 0 : this.retries / allowance;
	}
}

export interface RetryOptions {
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	budget?: RetryBudget;
	deadline?: Deadline;
}

/** Full jitter: sleep uniformly between 0 and the exponential cap. */
function fullJitterDelay(attempt: number, baseMs: number, capMs: number): number {
	const exponential = Math.min(capMs, baseMs * 2 ** attempt);
	return Math.floor(Math.random() * exponential);
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
	let lastError: unknown;

	for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
		options.budget?.recordAttempt();
		try {
			return await fn();
		} catch (err) {
			lastError = err;

			if (!isRetryable(err)) throw err;
			if (attempt === options.maxAttempts - 1) break;
			if (options.budget && !options.budget.tryConsume()) {
				console.log('[retry] budget exhausted, failing fast');
				break;
			}

			const delay = fullJitterDelay(attempt, options.baseDelayMs, options.maxDelayMs);
			if (options.deadline && options.deadline.remainingMs() < delay) {
				console.log('[retry] not enough deadline left to retry');
				break;
			}
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw lastError;
}

// --- Circuit breaker ---
type BreakerState = 'closed' | 'open' | 'half-open';

export interface BreakerOptions {
	failureRatioThreshold: number; // e.g. 0.5
	minimumThroughput: number; // do not judge on tiny samples
	windowMs: number;
	cooldownMs: number;
	probeSuccessesToClose: number;
	maxConcurrentProbes: number;
}

export class CircuitBreaker {
	private state: BreakerState = 'closed';
	private successes = 0;
	private failures = 0;
	private windowStart = Date.now();
	private openedAt = 0;
	private probeSuccesses = 0;
	private probesInFlight = 0;

	constructor(
		readonly name: string,
		private readonly options: BreakerOptions
	) {}

	private rollWindow(): void {
		if (Date.now() - this.windowStart > this.options.windowMs) {
			this.successes = 0;
			this.failures = 0;
			this.windowStart = Date.now();
		}
	}

	private trip(): void {
		this.state = 'open';
		this.openedAt = Date.now();
		this.probeSuccesses = 0;
		console.log(`[breaker] ${this.name} -> open`);
	}

	private close(): void {
		this.state = 'closed';
		this.successes = 0;
		this.failures = 0;
		this.windowStart = Date.now();
		console.log(`[breaker] ${this.name} -> closed`);
	}

	private transitionIfCooled(): void {
		if (this.state === 'open' && Date.now() - this.openedAt >= this.options.cooldownMs) {
			this.state = 'half-open';
			this.probeSuccesses = 0;
			this.probesInFlight = 0;
			console.log(`[breaker] ${this.name} -> half-open`);
		}
	}

	async execute<T>(fn: () => Promise<T>): Promise<T> {
		this.rollWindow();
		this.transitionIfCooled();

		if (this.state === 'open') {
			const wait = this.options.cooldownMs - (Date.now() - this.openedAt);
			throw new CircuitOpenError(this.name, Math.max(0, wait));
		}

		// In half-open we let only a few probes through. Flooding a service
		// that just came back is how you knock it over a second time.
		if (this.state === 'half-open') {
			if (this.probesInFlight >= this.options.maxConcurrentProbes) {
				throw new CircuitOpenError(this.name, this.options.cooldownMs);
			}
			this.probesInFlight += 1;
		}

		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (err) {
			this.onFailure();
			throw err;
		} finally {
			if (this.state === 'half-open') this.probesInFlight = Math.max(0, this.probesInFlight - 1);
		}
	}

	private onSuccess(): void {
		if (this.state === 'half-open') {
			this.probeSuccesses += 1;
			if (this.probeSuccesses >= this.options.probeSuccessesToClose) this.close();
			return;
		}
		this.successes += 1;
	}

	private onFailure(): void {
		if (this.state === 'half-open') {
			this.trip();
			return;
		}
		this.failures += 1;

		const total = this.successes + this.failures;
		if (total < this.options.minimumThroughput) return;
		if (this.failures / total >= this.options.failureRatioThreshold) this.trip();
	}

	snapshot(): { state: BreakerState; successes: number; failures: number } {
		return { state: this.state, successes: this.successes, failures: this.failures };
	}
}

// --- Bulkhead: bounded concurrency per dependency ---
export class Bulkhead {
	private inFlight = 0;
	private queue: Array<() => void> = [];

	constructor(
		readonly name: string,
		private readonly maxConcurrent: number,
		private readonly maxQueued: number
	) {}

	async execute<T>(fn: () => Promise<T>): Promise<T> {
		if (this.inFlight >= this.maxConcurrent) {
			if (this.queue.length >= this.maxQueued) {
				throw new BulkheadFullError(this.name);
			}
			await new Promise<void>((resolve) => this.queue.push(resolve));
		}

		this.inFlight += 1;
		try {
			return await fn();
		} finally {
			this.inFlight -= 1;
			const next = this.queue.shift();
			if (next) next();
		}
	}

	snapshot(): { inFlight: number; queued: number } {
		return { inFlight: this.inFlight, queued: this.queue.length };
	}
}

// --- Composing them in the correct order ---
export interface ResilientCallOptions {
	deadline: Deadline;
	perAttemptTimeoutMs: number;
	fallback?: () => Promise<unknown>;
}

/**
 * Order matters and is not arbitrary:
 *   bulkhead  -> caps how much of THIS process a dependency can consume
 *   breaker   -> decides whether to call at all
 *   retry     -> repeats the attempt
 *   timeout   -> bounds a single attempt
 * Putting retry outside the breaker means a tripped circuit fails instantly
 * without burning retry budget, which is exactly what you want.
 */
export function resilientCall<T>(
	bulkhead: Bulkhead,
	breaker: CircuitBreaker,
	budget: RetryBudget,
	work: (signal: AbortSignal) => Promise<T>
) {
	return (options: ResilientCallOptions): Promise<T> =>
		bulkhead.execute(() =>
			retry(
				() =>
					breaker.execute(() =>
						withTimeout(Math.min(options.perAttemptTimeoutMs, options.deadline.remainingMs()), work)
					),
				{
					maxAttempts: 3,
					baseDelayMs: 50,
					maxDelayMs: 2_000,
					budget,
					deadline: options.deadline
				}
			)
		);
}

// --- Demo ---
async function demo(): Promise<void> {
	const bulkhead = new Bulkhead('pricing', 20, 50);
	const breaker = new CircuitBreaker('pricing:quote-fare', {
		failureRatioThreshold: 0.5,
		minimumThroughput: 10,
		windowMs: 10_000,
		cooldownMs: 2_000,
		probeSuccessesToClose: 3,
		maxConcurrentProbes: 2
	});
	const budget = new RetryBudget(0.1, 5, 10_000);

	let healthy = false;
	const quoteFare = resilientCall(bulkhead, breaker, budget, async () => {
		if (!healthy) {
			const err = new Error('pricing unavailable') as Error & { status: number };
			err.status = 503;
			throw err;
		}
		return { fareDirham: 42 };
	});

	for (let i = 0; i < 25; i++) {
		try {
			await quoteFare({ deadline: Deadline.in(2_000), perAttemptTimeoutMs: 300 });
		} catch (err) {
			if (i % 8 === 0) console.log(`request ${i}: ${(err as Error).name}`);
		}
	}
	console.log('breaker after failures:', breaker.snapshot());

	healthy = true;
	await new Promise((r) => setTimeout(r, 2_100)); // wait for cooldown

	for (let i = 0; i < 5; i++) {
		try {
			const fare = await quoteFare({ deadline: Deadline.in(2_000), perAttemptTimeoutMs: 300 });
			console.log('recovered:', fare);
		} catch (err) {
			console.log('probe rejected:', (err as Error).name);
		}
	}
	console.log('breaker after recovery:', breaker.snapshot());
}

void demo();
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"sync"
	"time"
)

// --- Errors ---

var ErrBulkheadFull = errors.New("bulkhead is full")

type CircuitOpenError struct {
	Name       string
	RetryAfter time.Duration
}

func (e *CircuitOpenError) Error() string {
	return fmt.Sprintf("circuit %s is open, retry in %s", e.Name, e.RetryAfter)
}

type StatusError struct {
	Status int
	Msg    string
}

func (e *StatusError) Error() string { return fmt.Sprintf("%d: %s", e.Status, e.Msg) }

// --- Retry classification ---

func IsRetryable(err error) bool {
	if err == nil {
		return false
	}
	var open *CircuitOpenError
	if errors.As(err, &open) {
		return false // already shed, do not pile on
	}
	if errors.Is(err, ErrBulkheadFull) {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	var se *StatusError
	if errors.As(err, &se) {
		return se.Status == 429 || se.Status == 503 || se.Status == 504 ||
			(se.Status >= 500 && se.Status < 600)
	}
	return true // network level failure
}

// --- Retry budget ---

type RetryBudget struct {
	mu          sync.Mutex
	attempts    int
	retries     int
	windowStart time.Time
	ratio       float64
	minPerSec   float64
	window      time.Duration
}

func NewRetryBudget(ratio, minPerSec float64, window time.Duration) *RetryBudget {
	return &RetryBudget{
		ratio: ratio, minPerSec: minPerSec,
		window: window, windowStart: time.Now(),
	}
}

func (b *RetryBudget) roll() {
	if time.Since(b.windowStart) > b.window {
		b.attempts, b.retries = 0, 0
		b.windowStart = time.Now()
	}
}

func (b *RetryBudget) RecordAttempt() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.roll()
	b.attempts++
}

func (b *RetryBudget) allowance() float64 {
	return math.Max(b.minPerSec*b.window.Seconds(), float64(b.attempts)*b.ratio)
}

// TryConsume caps retry traffic at `ratio` of real traffic, so a struggling
// dependency is never tripled no matter how bad its failure rate gets.
func (b *RetryBudget) TryConsume() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.roll()
	if float64(b.retries) >= b.allowance() {
		return false
	}
	b.retries++
	return true
}

// --- Retry with full jitter ---

type RetryOptions struct {
	MaxAttempts int
	BaseDelay   time.Duration
	MaxDelay    time.Duration
	Budget      *RetryBudget
}

func fullJitterDelay(attempt int, base, cap time.Duration) time.Duration {
	exponential := time.Duration(float64(base) * math.Pow(2, float64(attempt)))
	if exponential > cap {
		exponential = cap
	}
	return time.Duration(rand.Int63n(int64(exponential) + 1))
}

func Retry[T any](ctx context.Context, fn func(context.Context) (T, error), opts RetryOptions) (T, error) {
	var zero T
	var lastErr error

	for attempt := 0; attempt < opts.MaxAttempts; attempt++ {
		if opts.Budget != nil {
			opts.Budget.RecordAttempt()
		}

		result, err := fn(ctx)
		if err == nil {
			return result, nil
		}
		lastErr = err

		if !IsRetryable(err) {
			return zero, err
		}
		if attempt == opts.MaxAttempts-1 {
			break
		}
		if opts.Budget != nil && !opts.Budget.TryConsume() {
			fmt.Println("[retry] budget exhausted, failing fast")
			break
		}

		delay := fullJitterDelay(attempt, opts.BaseDelay, opts.MaxDelay)
		if deadline, ok := ctx.Deadline(); ok && time.Until(deadline) < delay {
			fmt.Println("[retry] not enough deadline left to retry")
			break
		}

		select {
		case <-time.After(delay):
		case <-ctx.Done():
			return zero, ctx.Err()
		}
	}
	return zero, lastErr
}

// --- Circuit breaker ---

type BreakerState string

const (
	StateClosed   BreakerState = "closed"
	StateOpen     BreakerState = "open"
	StateHalfOpen BreakerState = "half-open"
)

type BreakerOptions struct {
	FailureRatioThreshold float64
	MinimumThroughput     int
	Window                time.Duration
	Cooldown              time.Duration
	ProbeSuccessesToClose int
	MaxConcurrentProbes   int
}

type CircuitBreaker struct {
	name string
	opts BreakerOptions

	mu             sync.Mutex
	state          BreakerState
	successes      int
	failures       int
	windowStart    time.Time
	openedAt       time.Time
	probeSuccesses int
	probesInFlight int
}

func NewCircuitBreaker(name string, opts BreakerOptions) *CircuitBreaker {
	return &CircuitBreaker{name: name, opts: opts, state: StateClosed, windowStart: time.Now()}
}

func (cb *CircuitBreaker) rollWindow() {
	if time.Since(cb.windowStart) > cb.opts.Window {
		cb.successes, cb.failures = 0, 0
		cb.windowStart = time.Now()
	}
}

func (cb *CircuitBreaker) trip() {
	cb.state = StateOpen
	cb.openedAt = time.Now()
	cb.probeSuccesses = 0
	fmt.Printf("[breaker] %s -> open\n", cb.name)
}

func (cb *CircuitBreaker) close() {
	cb.state = StateClosed
	cb.successes, cb.failures = 0, 0
	cb.windowStart = time.Now()
	fmt.Printf("[breaker] %s -> closed\n", cb.name)
}

func (cb *CircuitBreaker) transitionIfCooled() {
	if cb.state == StateOpen && time.Since(cb.openedAt) >= cb.opts.Cooldown {
		cb.state = StateHalfOpen
		cb.probeSuccesses = 0
		cb.probesInFlight = 0
		fmt.Printf("[breaker] %s -> half-open\n", cb.name)
	}
}

func (cb *CircuitBreaker) Execute(fn func() error) error {
	cb.mu.Lock()
	cb.rollWindow()
	cb.transitionIfCooled()

	switch cb.state {
	case StateOpen:
		wait := cb.opts.Cooldown - time.Since(cb.openedAt)
		cb.mu.Unlock()
		return &CircuitOpenError{Name: cb.name, RetryAfter: wait}
	case StateHalfOpen:
		// Only a few probes get through. Flooding a service that just came
		// back is how you knock it over a second time.
		if cb.probesInFlight >= cb.opts.MaxConcurrentProbes {
			cb.mu.Unlock()
			return &CircuitOpenError{Name: cb.name, RetryAfter: cb.opts.Cooldown}
		}
		cb.probesInFlight++
	}
	halfOpen := cb.state == StateHalfOpen
	cb.mu.Unlock()

	err := fn()

	cb.mu.Lock()
	defer cb.mu.Unlock()
	if halfOpen {
		cb.probesInFlight--
	}

	if err == nil {
		cb.onSuccessLocked()
		return nil
	}
	cb.onFailureLocked()
	return err
}

func (cb *CircuitBreaker) onSuccessLocked() {
	if cb.state == StateHalfOpen {
		cb.probeSuccesses++
		if cb.probeSuccesses >= cb.opts.ProbeSuccessesToClose {
			cb.close()
		}
		return
	}
	cb.successes++
}

func (cb *CircuitBreaker) onFailureLocked() {
	if cb.state == StateHalfOpen {
		cb.trip()
		return
	}
	cb.failures++
	total := cb.successes + cb.failures
	if total < cb.opts.MinimumThroughput {
		return
	}
	if float64(cb.failures)/float64(total) >= cb.opts.FailureRatioThreshold {
		cb.trip()
	}
}

func (cb *CircuitBreaker) State() BreakerState {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	return cb.state
}

// --- Bulkhead ---

type Bulkhead struct {
	name  string
	slots chan struct{}
	queue chan struct{}
}

func NewBulkhead(name string, maxConcurrent, maxQueued int) *Bulkhead {
	return &Bulkhead{
		name:  name,
		slots: make(chan struct{}, maxConcurrent),
		queue: make(chan struct{}, maxQueued),
	}
}

func (b *Bulkhead) Execute(ctx context.Context, fn func() error) error {
	select {
	case b.slots <- struct{}{}:
		defer func() { <-b.slots }()
		return fn()
	default:
	}

	select {
	case b.queue <- struct{}{}:
		defer func() { <-b.queue }()
	default:
		return ErrBulkheadFull
	}

	select {
	case b.slots <- struct{}{}:
		defer func() { <-b.slots }()
		return fn()
	case <-ctx.Done():
		return ctx.Err()
	}
}

// --- Composition ---

// ResilientCall layers the primitives in the order that matters:
//   bulkhead -> caps how much of this process one dependency can consume
//   retry    -> repeats the attempt, spending budget
//   breaker  -> decides whether to call at all
//   timeout  -> bounds a single attempt
func ResilientCall[T any](
	ctx context.Context,
	bulkhead *Bulkhead,
	breaker *CircuitBreaker,
	budget *RetryBudget,
	perAttempt time.Duration,
	work func(context.Context) (T, error),
) (T, error) {
	var out T
	err := bulkhead.Execute(ctx, func() error {
		result, err := Retry(ctx, func(c context.Context) (T, error) {
			var inner T
			breakerErr := breaker.Execute(func() error {
				attemptCtx, cancel := context.WithTimeout(c, perAttempt)
				defer cancel()
				v, err := work(attemptCtx)
				inner = v
				return err
			})
			return inner, breakerErr
		}, RetryOptions{
			MaxAttempts: 3,
			BaseDelay:   50 * time.Millisecond,
			MaxDelay:    2 * time.Second,
			Budget:      budget,
		})
		out = result
		return err
	})
	return out, err
}

type Fare struct{ FareDirham int }

func main() {
	bulkhead := NewBulkhead("pricing", 20, 50)
	breaker := NewCircuitBreaker("pricing:quote-fare", BreakerOptions{
		FailureRatioThreshold: 0.5,
		MinimumThroughput:     10,
		Window:                10 * time.Second,
		Cooldown:              2 * time.Second,
		ProbeSuccessesToClose: 3,
		MaxConcurrentProbes:   2,
	})
	budget := NewRetryBudget(0.1, 5, 10*time.Second)

	healthy := false
	quoteFare := func() (Fare, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		return ResilientCall(ctx, bulkhead, breaker, budget, 300*time.Millisecond,
			func(context.Context) (Fare, error) {
				if !healthy {
					return Fare{}, &StatusError{Status: 503, Msg: "pricing unavailable"}
				}
				return Fare{FareDirham: 42}, nil
			})
	}

	for i := 0; i < 25; i++ {
		if _, err := quoteFare(); err != nil && i%8 == 0 {
			fmt.Printf("request %d: %v\n", i, err)
		}
	}
	fmt.Println("breaker after failures:", breaker.State())

	healthy = true
	time.Sleep(2100 * time.Millisecond)

	for i := 0; i < 5; i++ {
		fare, err := quoteFare()
		if err != nil {
			fmt.Println("probe rejected:", err)
			continue
		}
		fmt.Printf("recovered: %+v\n", fare)
	}
	fmt.Println("breaker after recovery:", breaker.State())
}
```

</div>
</CodeTabs>

## Backpressure এবং load shedding

এই দুটোকে একসাথে বোঝা দরকার, কারণ এরা একই সমস্যার দুই দিক: **আসা কাজ করার ক্ষমতার চেয়ে বেশি**।

**Backpressure** হলো ভেতরের দিকের সমাধান — ধীর অংশ দ্রুত অংশকে থামতে বলে, আর সেই সংকেত শেকল ধরে পেছনে যায়। এটার একমাত্র পূর্বশর্ত হলো **সীমাবদ্ধ queue**। Unbounded queue মানে কোনো backpressure নেই, কারণ সংকেত দেওয়ার কোনো উপায়ই নেই — শুধু মেমরি ভরে যায়, latency বাড়ে, তারপর প্রসেস মারা যায়।

**Load shedding** হলো বাইরের দিকের সমাধান — যখন থামতে বলার কেউ নেই (ইন্টারনেটের ব্যবহারকারীকে থামতে বলা যায় না), তখন কিছু কাজ ইচ্ছাকৃতভাবে ফিরিয়ে দেওয়া।

<Mermaid
title="Bounded Queue Turns Overload Into a Decision"
code={`graph LR
  IN["Incoming requests<br/>1200 rps"] --> Q["Bounded queue<br/>capacity 200"]
  Q -->|has room| W["Workers<br/>800 rps capacity"]
  Q -->|full or too old| SHED["Shed: 503 with Retry-After<br/>fast, cheap, honest"]
  W --> OUT["Completed"]`}
/>

Load shedding-এর তিনটা নিয়ম বাস্তবে সবচেয়ে বেশি কাজে দেয়।

**এক: shed করাটা সস্তা হতে হবে।** যদি প্রত্যাখ্যান করতেও ডেটাবেসে যেতে হয়, তাহলে shedding নিজেই ওভারলোড বাড়াবে। প্রত্যাখ্যান হবে প্রবেশপথে, কোনো I/O ছাড়া।

**দুই: queue-র দৈর্ঘ্য নয়, queue-তে অপেক্ষার বয়স দেখুন।** একটা request যদি ইতিমধ্যে ৩ সেকেন্ড queue-তে বসে থাকে আর ক্লায়েন্টের timeout ২ সেকেন্ড, তাহলে সেটা প্রসেস করা সম্পূর্ণ অপচয় — ফলাফল কেউ পাবে না। এই ধারণাটাই CoDel অ্যালগরিদমের ভিত্তি, আর প্রোডাকশনে এটা দৈর্ঘ্য-ভিত্তিক সীমার চেয়ে অনেক ভালো কাজ করে।

**তিন: সব ট্রাফিক সমান নয়।** Health check, পেমেন্ট কনফার্মেশন, আর চলমান রাইডের অবস্থান আপডেট — এগুলো সবার শেষে shed হবে। নতুন সার্চ, সুপারিশ, অ্যানালিটিক্স — এগুলো সবার আগে। শ্রেণি অনুযায়ী shedding করলে ওভারলোডের মধ্যেও সিস্টেমটা "কাজ করছে" মনে হয়।

<Callout type="warning">

**Queue দিয়ে ওভারলোড সমাধান হয় না, শুধু দেরি হয়।** যদি গড় আগমন হার গড় সেবার হারের চেয়ে বেশি হয়, তাহলে queue যত বড়ই হোক, সেটা ভরবেই — শুধু সময় লাগবে বেশি, আর ততক্ষণে latency অসহনীয় হয়ে যাবে। Queue কেবল **স্পাইক** শোষণের জন্য, ক্ষমতার ঘাটতি পূরণের জন্য নয়। বড় queue দেখলে প্রশ্ন করুন: এটা কি স্পাইক শোষণ করছে, নাকি একটা ক্ষমতার সমস্যা লুকিয়ে রাখছে?

</Callout>

## Adaptive shedding, idempotency সহ

<CodeTabs tsFile="load-shedding.ts" goFile="load_shedding.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// --- Request classification ---
export type Priority = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY_ORDER: Priority[] = ['low', 'normal', 'high', 'critical'];

export interface IncomingRequest {
	id: string;
	route: string;
	priority: Priority;
	enqueuedAt: number;
	clientTimeoutMs: number;
	idempotencyKey?: string;
}

export class ShedError extends Error {
	constructor(
		readonly reason: 'queue-full' | 'too-old' | 'priority-shed',
		readonly retryAfterMs: number
	) {
		super(`request shed: ${reason}`);
		this.name = 'ShedError';
	}
}

/**
 * CoDel-inspired admission control. The signal is not queue LENGTH but the
 * time requests spend waiting: a request that has already waited longer than
 * its client will wait is pure waste, and processing it makes things worse.
 */
export class AdmissionController {
	private queue: IncomingRequest[] = [];
	private recentSojournMs: number[] = [];
	private overloadedSince: number | null = null;
	private shedLevel = 0; // index into PRIORITY_ORDER: shed everything below

	constructor(
		private readonly capacity = 200,
		private readonly targetSojournMs = 100,
		private readonly intervalMs = 500
	) {}

	admit(req: IncomingRequest): void {
		if (this.queue.length >= this.capacity) {
			throw new ShedError('queue-full', 1_000);
		}

		const minimumPriority = PRIORITY_ORDER[this.shedLevel];
		if (PRIORITY_ORDER.indexOf(req.priority) < PRIORITY_ORDER.indexOf(minimumPriority)) {
			throw new ShedError('priority-shed', 2_000);
		}

		this.queue.push(req);
	}

	/** Called by workers to pick the next piece of useful work. */
	next(now = Date.now()): IncomingRequest | null {
		while (this.queue.length > 0) {
			const req = this.queue.shift();
			if (!req) return null;

			const waited = now - req.enqueuedAt;
			this.recordSojourn(waited, now);

			// Drop work whose result nobody is waiting for any more.
			if (waited >= req.clientTimeoutMs) {
				console.log(`[shed] dropping ${req.id}, waited ${waited}ms of ${req.clientTimeoutMs}ms`);
				continue;
			}
			return req;
		}
		return null;
	}

	private recordSojourn(waited: number, now: number): void {
		this.recentSojournMs.push(waited);
		if (this.recentSojournMs.length > 200) this.recentSojournMs.shift();

		if (waited > this.targetSojournMs) {
			if (this.overloadedSince === null) this.overloadedSince = now;
			else if (now - this.overloadedSince > this.intervalMs) {
				this.raiseShedLevel();
				this.overloadedSince = now;
			}
		} else {
			this.overloadedSince = null;
			this.lowerShedLevel();
		}
	}

	private raiseShedLevel(): void {
		// Never shed critical traffic: that level is the floor.
		if (this.shedLevel < PRIORITY_ORDER.length - 1) {
			this.shedLevel += 1;
			console.log(`[shed] level up: now rejecting below ${PRIORITY_ORDER[this.shedLevel]}`);
		}
	}

	private lowerShedLevel(): void {
		if (this.shedLevel > 0) {
			this.shedLevel -= 1;
		}
	}

	stats(): { queued: number; shedLevel: Priority; p95SojournMs: number } {
		const sorted = [...this.recentSojournMs].sort((a, b) => a - b);
		const p95 = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length * 0.95)];
		return {
			queued: this.queue.length,
			shedLevel: PRIORITY_ORDER[this.shedLevel],
			p95SojournMs: p95
		};
	}
}

// --- Idempotency under partial failure ---
type IdempotencyState =
	| { status: 'in-progress'; startedAt: number }
	| { status: 'completed'; response: unknown; completedAt: number };

export class IdempotencyStore {
	private entries = new Map<string, IdempotencyState>();

	constructor(private readonly leaseMs = 30_000) {}

	/**
	 * The three cases that matter:
	 *  - unseen key    -> we claim it and do the work
	 *  - completed key -> replay the stored response, do NOT redo the work
	 *  - in-progress   -> another attempt is running; tell the caller to wait
	 * The third case is the one people forget, and it is exactly what happens
	 * when a client retries after a timeout while the original still runs.
	 */
	async run<T>(key: string, work: () => Promise<T>): Promise<T> {
		const existing = this.entries.get(key);

		if (existing?.status === 'completed') {
			console.log(`[idempotency] replaying stored response for ${key}`);
			return existing.response as T;
		}

		if (existing?.status === 'in-progress') {
			if (Date.now() - existing.startedAt < this.leaseMs) {
				const err = new Error('request already in progress') as Error & { status: number };
				err.status = 409;
				throw err;
			}
			console.log(`[idempotency] lease expired for ${key}, taking over`);
		}

		this.entries.set(key, { status: 'in-progress', startedAt: Date.now() });

		try {
			const result = await work();
			this.entries.set(key, { status: 'completed', response: result, completedAt: Date.now() });
			return result;
		} catch (err) {
			// Failure must release the key, or a transient error would poison
			// this idempotency key forever.
			this.entries.delete(key);
			throw err;
		}
	}

	sweep(retentionMs = 86_400_000): number {
		const cutoff = Date.now() - retentionMs;
		let removed = 0;
		for (const [key, state] of this.entries) {
			if (state.status === 'completed' && state.completedAt < cutoff) {
				this.entries.delete(key);
				removed += 1;
			}
		}
		return removed;
	}
}

// --- Graceful degradation ---
export interface FareQuote {
	fareDirham: number;
	source: 'live-pricing' | 'cached' | 'static-estimate';
	confident: boolean;
}

/**
 * Degradation is a product decision expressed in code: what is the worst
 * answer that is still better than an error page? Ordering the fallbacks
 * explicitly makes that decision visible and reviewable.
 */
export async function quoteFareDegrading(
	livePricing: () => Promise<number>,
	cache: () => Promise<number | null>,
	distanceKm: number
): Promise<FareQuote> {
	try {
		return { fareDirham: await livePricing(), source: 'live-pricing', confident: true };
	} catch {
		const cached = await cache().catch(() => null);
		if (cached !== null) {
			return { fareDirham: cached, source: 'cached', confident: true };
		}
		// Last resort: a formula the client can be told is an estimate.
		return {
			fareDirham: Math.round(12 + distanceKm * 4),
			source: 'static-estimate',
			confident: false
		};
	}
}

// --- Demo ---
async function demo(): Promise<void> {
	const admission = new AdmissionController(200, 100, 200);
	const now = Date.now();

	// A burst: 400 requests arrive, workers can only drain slowly
	let shed = 0;
	for (let i = 0; i < 400; i++) {
		const priority: Priority =
			i % 10 === 0 ? 'critical' : i % 3 === 0 ? 'high' : i % 2 === 0 ? 'normal' : 'low';
		try {
			admission.admit({
				id: `req-${i}`,
				route: '/trips',
				priority,
				enqueuedAt: now - (i < 150 ? 400 : 10), // early ones waited too long
				clientTimeoutMs: 2_000
			});
		} catch {
			shed += 1;
		}
	}
	console.log(`admitted=${400 - shed} shed=${shed}`, admission.stats());

	let processed = 0;
	let dropped = 0;
	for (;;) {
		const req = admission.next(now + 2_500);
		if (!req) break;
		processed += 1;
	}
	dropped = 400 - shed - processed;
	console.log(`processed=${processed} dropped-as-stale=${dropped}`);

	// Idempotency: the same key retried after a timeout
	const store = new IdempotencyStore();
	const charge = () => store.run('trip-9f2c-charge', async () => ({ chargedDirham: 42 }));
	console.log(await charge());
	console.log(await charge()); // replayed, not charged twice

	// Degradation
	console.log(
		await quoteFareDegrading(
			async () => {
				throw new Error('pricing down');
			},
			async () => null,
			7.5
		)
	);
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
	"sort"
	"sync"
	"time"
)

// --- Priorities ---

type Priority int

const (
	PriorityLow Priority = iota
	PriorityNormal
	PriorityHigh
	PriorityCritical
)

func (p Priority) String() string {
	return [...]string{"low", "normal", "high", "critical"}[p]
}

type IncomingRequest struct {
	ID             string
	Route          string
	Priority       Priority
	EnqueuedAt     time.Time
	ClientTimeout  time.Duration
	IdempotencyKey string
}

type ShedReason string

const (
	ReasonQueueFull    ShedReason = "queue-full"
	ReasonTooOld       ShedReason = "too-old"
	ReasonPriorityShed ShedReason = "priority-shed"
)

type ShedError struct {
	Reason     ShedReason
	RetryAfter time.Duration
}

func (e *ShedError) Error() string { return "request shed: " + string(e.Reason) }

// AdmissionController is CoDel-inspired: the control signal is how long
// requests WAIT, not how many are queued. Work whose client has already
// given up is pure waste and must be dropped, not processed.
type AdmissionController struct {
	mu              sync.Mutex
	queue           []IncomingRequest
	sojourns        []time.Duration
	overloadedSince time.Time
	shedLevel       Priority

	capacity      int
	targetSojourn time.Duration
	interval      time.Duration
}

func NewAdmissionController(capacity int, target, interval time.Duration) *AdmissionController {
	return &AdmissionController{
		capacity: capacity, targetSojourn: target, interval: interval,
		shedLevel: PriorityLow,
	}
}

func (a *AdmissionController) Admit(req IncomingRequest) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if len(a.queue) >= a.capacity {
		return &ShedError{Reason: ReasonQueueFull, RetryAfter: time.Second}
	}
	if req.Priority < a.shedLevel {
		return &ShedError{Reason: ReasonPriorityShed, RetryAfter: 2 * time.Second}
	}

	a.queue = append(a.queue, req)
	return nil
}

func (a *AdmissionController) Next(now time.Time) (IncomingRequest, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()

	for len(a.queue) > 0 {
		req := a.queue[0]
		a.queue = a.queue[1:]

		waited := now.Sub(req.EnqueuedAt)
		a.recordSojournLocked(waited, now)

		if waited >= req.ClientTimeout {
			fmt.Printf("[shed] dropping %s, waited %s of %s\n", req.ID, waited, req.ClientTimeout)
			continue
		}
		return req, true
	}
	return IncomingRequest{}, false
}

func (a *AdmissionController) recordSojournLocked(waited time.Duration, now time.Time) {
	a.sojourns = append(a.sojourns, waited)
	if len(a.sojourns) > 200 {
		a.sojourns = a.sojourns[1:]
	}

	if waited > a.targetSojourn {
		if a.overloadedSince.IsZero() {
			a.overloadedSince = now
		} else if now.Sub(a.overloadedSince) > a.interval {
			a.raiseShedLevelLocked()
			a.overloadedSince = now
		}
		return
	}

	a.overloadedSince = time.Time{}
	if a.shedLevel > PriorityLow {
		a.shedLevel--
	}
}

func (a *AdmissionController) raiseShedLevelLocked() {
	// Critical traffic is the floor and is never shed.
	if a.shedLevel < PriorityCritical {
		a.shedLevel++
		fmt.Printf("[shed] level up: now rejecting below %s\n", a.shedLevel)
	}
}

func (a *AdmissionController) Stats() (queued int, level Priority, p95 time.Duration) {
	a.mu.Lock()
	defer a.mu.Unlock()
	sorted := append([]time.Duration{}, a.sojourns...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	if len(sorted) > 0 {
		p95 = sorted[int(float64(len(sorted))*0.95)]
	}
	return len(a.queue), a.shedLevel, p95
}

// --- Idempotency under partial failure ---

type idempotencyState struct {
	inProgress  bool
	startedAt   time.Time
	response    any
	completedAt time.Time
}

var ErrInProgress = errors.New("request already in progress")

type IdempotencyStore struct {
	mu      sync.Mutex
	entries map[string]*idempotencyState
	lease   time.Duration
}

func NewIdempotencyStore(lease time.Duration) *IdempotencyStore {
	return &IdempotencyStore{entries: make(map[string]*idempotencyState), lease: lease}
}

// Run handles the three cases that matter: unseen key (claim and work),
// completed key (replay stored response), and in-progress key (another
// attempt is running, which is exactly what a client retry after a timeout
// looks like).
func (s *IdempotencyStore) Run(key string, work func() (any, error)) (any, error) {
	s.mu.Lock()
	existing, ok := s.entries[key]

	if ok && !existing.inProgress {
		s.mu.Unlock()
		fmt.Printf("[idempotency] replaying stored response for %s\n", key)
		return existing.response, nil
	}
	if ok && existing.inProgress && time.Since(existing.startedAt) < s.lease {
		s.mu.Unlock()
		return nil, ErrInProgress
	}

	s.entries[key] = &idempotencyState{inProgress: true, startedAt: time.Now()}
	s.mu.Unlock()

	result, err := work()

	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		// Release the key so a transient error does not poison it forever.
		delete(s.entries, key)
		return nil, err
	}
	s.entries[key] = &idempotencyState{response: result, completedAt: time.Now()}
	return result, nil
}

func (s *IdempotencyStore) Sweep(retention time.Duration) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	cutoff := time.Now().Add(-retention)
	removed := 0
	for key, state := range s.entries {
		if !state.inProgress && state.completedAt.Before(cutoff) {
			delete(s.entries, key)
			removed++
		}
	}
	return removed
}

// --- Graceful degradation ---

type FareSource string

const (
	SourceLive     FareSource = "live-pricing"
	SourceCached   FareSource = "cached"
	SourceEstimate FareSource = "static-estimate"
)

type FareQuote struct {
	FareDirham int
	Source     FareSource
	Confident  bool
}

// QuoteFareDegrading makes the product decision explicit: what is the worst
// answer that is still better than an error page?
func QuoteFareDegrading(
	live func() (int, error),
	cached func() (int, bool),
	distanceKm float64,
) FareQuote {
	if fare, err := live(); err == nil {
		return FareQuote{FareDirham: fare, Source: SourceLive, Confident: true}
	}
	if fare, ok := cached(); ok {
		return FareQuote{FareDirham: fare, Source: SourceCached, Confident: true}
	}
	return FareQuote{
		FareDirham: int(12 + distanceKm*4),
		Source:     SourceEstimate,
		Confident:  false,
	}
}

func main() {
	admission := NewAdmissionController(200, 100*time.Millisecond, 200*time.Millisecond)
	now := time.Now()

	shed := 0
	for i := 0; i < 400; i++ {
		priority := PriorityLow
		switch {
		case i%10 == 0:
			priority = PriorityCritical
		case i%3 == 0:
			priority = PriorityHigh
		case i%2 == 0:
			priority = PriorityNormal
		}

		enqueuedAt := now.Add(-10 * time.Millisecond)
		if i < 150 {
			enqueuedAt = now.Add(-400 * time.Millisecond)
		}

		err := admission.Admit(IncomingRequest{
			ID: fmt.Sprintf("req-%d", i), Route: "/trips",
			Priority: priority, EnqueuedAt: enqueuedAt,
			ClientTimeout: 2 * time.Second,
		})
		if err != nil {
			shed++
		}
	}

	queued, level, p95 := admission.Stats()
	fmt.Printf("admitted=%d shed=%d queued=%d level=%s p95=%s\n", 400-shed, shed, queued, level, p95)

	processed := 0
	for {
		_, ok := admission.Next(now.Add(2500 * time.Millisecond))
		if !ok {
			break
		}
		processed++
	}
	fmt.Printf("processed=%d dropped-as-stale=%d\n", processed, 400-shed-processed)

	store := NewIdempotencyStore(30 * time.Second)
	charge := func() (any, error) {
		return store.Run("trip-9f2c-charge", func() (any, error) {
			return map[string]int{"chargedDirham": 42}, nil
		})
	}
	fmt.Println(charge())
	fmt.Println(charge()) // replayed, not charged twice

	fmt.Printf("%+v\n", QuoteFareDegrading(
		func() (int, error) { return 0, errors.New("pricing down") },
		func() (int, bool) { return 0, false },
		7.5,
	))
}
```

</div>
</CodeTabs>

## আংশিক ব্যর্থতায় idempotency

Distributed সিস্টেমের একটা কঠিন সত্য: **timeout মানে "হয়নি" নয়, timeout মানে "জানি না"।** আপনার পেমেন্ট request টাইমআউট করেছে মানে হতে পারে (ক) request পৌঁছায়নি, (খ) পৌঁছেছে ও সফল হয়েছে কিন্তু response হারিয়েছে, (গ) পৌঁছেছে ও এখনও চলছে।

এই অনিশ্চয়তার একমাত্র বাস্তব উত্তর হলো idempotency key — ক্লায়েন্ট প্রতিটা যৌক্তিক অপারেশনের জন্য একটা key তৈরি করে, আর retry-তে **একই key** পাঠায়। সার্ভার key দেখে ঠিক করে: নতুন কাজ, নাকি আগের ফলাফল ফিরিয়ে দেওয়া।

চারটা জিনিস প্রায়ই ভুল হয়।

**Key ক্লায়েন্ট বানাবে, সার্ভার নয়।** সার্ভার বানালে প্রতিটা retry-তে নতুন key তৈরি হবে, আর পুরো ব্যবস্থাটাই অর্থহীন।

**In-progress অবস্থা সামলাতে হবে।** ক্লায়েন্ট টাইমআউট করে আবার পাঠাল, অথচ প্রথমটা এখনও চলছে — তখন দুটো একসাথে চালানো সবচেয়ে খারাপ ফল। উপরের কোডে এজন্যই lease সহ `in-progress` অবস্থা আছে।

**ব্যর্থ হলে key ছেড়ে দিতে হবে।** নইলে একটা ক্ষণস্থায়ী ত্রুটি ওই key-কে চিরতরে বিষিয়ে দেবে, আর ক্লায়েন্ট কখনো সফল হতে পারবে না।

**ফলাফল সংরক্ষণ করতে হবে, শুধু "হয়ে গেছে" নয়।** ক্লায়েন্ট retry-তে আসল response আশা করে (charge id, trip id), শুধু 200 নয়।

<Callout type="tip">

Idempotency-র সবচেয়ে শক্তিশালী রূপটা কোডে নয়, ডেটাবেসে: একটা unique constraint। `UNIQUE (idempotency_key)` থাকলে দুটো সমান্তরাল retry-র একটা অবধারিতভাবে ব্যর্থ হবে, কোনো lock ছাড়াই, কোনো race ছাড়াই। অ্যাপ্লিকেশন স্তরের যাচাই সবসময় race-প্রবণ; ডেটাবেসের constraint নয়।

</Callout>

## Blast radius: ক্ষতির পরিধি ভাবা

এতক্ষণের সব কৌশল একটা request বা একটা নির্ভরতার কথা বলে। Blast-radius ভাবনা আরও উপরের স্তরে: **একটা জিনিস ভাঙলে কতজন ব্যবহারকারী ক্ষতিগ্রস্ত হবে?**

**Cell-based architecture।** ব্যবহারকারীদের স্বাধীন "cell"-এ ভাগ করুন, প্রতিটা cell-এর নিজের সম্পূর্ণ stack। একটা cell ভাঙলে ব্যবহারকারীর একটা ভগ্নাংশ ক্ষতিগ্রস্ত হয়, সবাই নয়। AWS তাদের বেশিরভাগ সার্ভিস এভাবেই চালায়।

**Shuffle sharding।** প্রতিটা গ্রাহককে সব node-এর একটা এলোমেলো উপসেট দিন। ৮টা node আর প্রতি গ্রাহকের ২টা হলে ২৮টা সম্ভাব্য জোড়া — অর্থাৎ একটা "বিষাক্ত" গ্রাহক যে ২টা node নষ্ট করে, সে অন্য গ্রাহকদের সামান্য অংশকেই স্পর্শ করে। এটা অত্যন্ত সস্তা এবং অসাধারণ কার্যকর।

**পর্যায়ক্রমে deploy।** এক অঞ্চল, এক cell, এক শতাংশ ব্যবহারকারী — তারপর থামুন, metric দেখুন, তারপর এগোন। বেশিরভাগ outage-এর কারণ hardware নয়, deploy।

**নির্ভরতার দিক দেখুন।** Control plane যেন data plane-এর উপর নির্ভর না করে, আর গুরুত্বপূর্ণ পথ যেন কম গুরুত্বপূর্ণ সার্ভিসের উপর নির্ভর না করে। "লগইন করতে গেলে সুপারিশ সার্ভিস লাগে" — এই ধরনের নির্ভরতাই ছোট ঘটনাকে বড় outage বানায়।

<Callout type="warning">

সবচেয়ে বড় blast radius সাধারণত লুকিয়ে থাকে **যা সবাই ভাগ করে** তার মধ্যে: একটাই config সার্ভিস, একটাই auth সার্ভিস, একটাই DNS zone, একটাই feature flag ব্যবস্থা। এগুলো ছোট, নিরীহ দেখতে, আর এগুলোই সবচেয়ে বড় outage বানায়। প্রতিটার জন্য একটা প্রশ্ন করুন: এটা যদি এখন ৫ মিনিটের জন্য মিথ্যা উত্তর দেয়, কী হবে? উত্তরটা "সব বন্ধ" হলে সেখানে ক্যাশ, ডিফল্ট মান, বা স্থানীয় fallback দরকার।

</Callout>

<div class="takeaways">

### মূল শেখা

- ধীর নির্ভরতা মৃত নির্ভরতার চেয়ে বেশি ক্ষতিকর — মৃত সার্ভিস সবাই টের পায়, ধীর সার্ভিস নীরবে সবার thread খেয়ে ফেলে
- প্রতিটা নেটওয়ার্ক কলে timeout, আর timeout আসবে নিচের সার্ভিসের p99.9 থেকে; deadline পুরো শেকল ধরে propagate করুন এবং সার্ভারেও deadline যাচাই করুন
- Retry-তে চারটা নিয়ম বাধ্যতামূলক: শুধু retry-যোগ্য error, full jitter সহ exponential backoff, retry budget, আর শেকলের এক জায়গাতেই retry
- Circuit breaker-এর স্কোপ হবে প্রতি নির্ভরতা প্রতি operation, আর half-open অবস্থায় শুধু কয়েকটা probe যাবে
- Bulkhead একটা নির্ভরতাকে পুরো প্রসেস গিলে ফেলা থেকে আটকায় — সীমাবদ্ধ concurrency ছাড়া একটা ধীর নির্ভরতাই যথেষ্ট
- Backpressure-এর পূর্বশর্ত হলো bounded queue; unbounded queue মানে backpressure নেই, শুধু বিলম্বিত মৃত্যু
- Load shedding-এ queue-র দৈর্ঘ্য নয়, **অপেক্ষার বয়স** দেখুন, প্রত্যাখ্যান সস্তা রাখুন, আর শ্রেণি অনুযায়ী shed করুন — critical সবার শেষে
- Timeout মানে "হয়নি" নয়, "জানি না" — তাই ক্লায়েন্ট-জেনারেটেড idempotency key, in-progress অবস্থা, ব্যর্থতায় key মুক্তি, আর সংরক্ষিত response লাগবে
- Blast radius কমান cell, shuffle sharding আর পর্যায়ক্রমে deploy দিয়ে; সবচেয়ে বড় ঝুঁকি সেই ছোট সার্ভিসগুলোতে যা সবাই ভাগ করে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **AWS** shuffle sharding-কে Route 53 ও অন্যান্য সার্ভিসে ব্যবহার করে, আর প্রায় সব সার্ভিস cell-based — একটা cell-এর ব্যর্থতা গ্রাহকের একটা ভগ্নাংশে সীমিত থাকে
- **Netflix**-এর Hystrix circuit breaker ও bulkhead ধারণাটাকে জনপ্রিয় করেছিল; এখন Resilience4j ও Envoy-র outlier detection একই কাজ করে
- **Google SRE** retry budget-এর নিয়মটা প্রকাশ করেছে: retry ট্রাফিক মোট ট্রাফিকের ১০ শতাংশে বাঁধা, যা retry storm-কে অসম্ভব করে
- **Facebook**-এর CoDel-ভিত্তিক admission control queue-তে অপেক্ষার সময় দেখে shed করে, দৈর্ঘ্য দেখে নয়
- **Stripe** ও অন্যান্য পেমেন্ট API idempotency key বাধ্যতামূলক করে এবং সংরক্ষিত response ফিরিয়ে দেয় — কারণ পেমেন্টে "জানি না" অবস্থাটা প্রতিদিন ঘটে
- **Envoy** ও **Istio** timeout, retry (budget সহ), circuit breaking ও outlier detection অ্যাপ্লিকেশন কোডের বাইরে সরিয়ে নেয়, ফলে নিয়মগুলো ভাষা-নিরপেক্ষভাবে প্রয়োগ হয়

</div>
