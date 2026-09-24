---
title: 'Search ও Ranking'
subtitle: 'Inverted index, analysis ও tokenisation, BM25 relevance, indexing pipeline ও freshness lag, facet, আর text relevance ছাড়িয়ে ranking।'
chapter: 17
level: 'advanced'
readingTime: '২৮ মিনিট'
topics:
  ['search', 'inverted index', 'tokenisation', 'BM25', 'ranking', 'faceting', 'indexing pipeline']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

বইয়ের বাজারে একজন দালাল, যার কাছে বইয়ের তালিকা নেই — আছে শব্দের তালিকা। প্রতিটা শব্দের নিচে লেখা কোন কোন বইয়ে সেটা আছে। বই খোঁজা মানে বই দেখা নয়, শব্দের কার্ড দেখা।

</Callout>

## গল্পে বুঝি

কর্ডোবার বইয়ের বাজারে রুশদের একটা ছোট চৌকি আছে। তার নিজের কোনো বই নেই, সে কেবল খুঁজে দেয়। বাজারে আটশো দোকান, প্রতিটায় গড়ে দুশো বই — কেউ এসে "জ্যামিতির বই চাই" বললে সব দোকানে হেঁটে হেঁটে খোঁজা অসম্ভব। তাই রুশদ বছরের পর বছর ধরে একটা কাঠের বাক্সে কার্ড বানিয়েছে, আর কার্ডগুলো সাজানো আছে **বইয়ের নামে নয়, শব্দের নামে**। "হিন্দাসা" শব্দের কার্ডটা টানলে তার পেছনে লেখা: বই ১২, বই ৪৭, বই ২০৩। "নুজুম" কার্ডে লেখা: বই ৪৭, বই ৮৮। কেউ যখন বলে "হিন্দাসা আর নুজুম দুটোই আছে এমন বই চাই", রুশদ দুটো কার্ড টেনে মিলিয়ে দেখে — বই ৪৭। এক নিমেষে। এই উল্টো করে সাজানো কার্ডবাক্সই হলো **inverted index**, আর প্রতিটা কার্ডের পেছনের তালিকা হলো **posting list**।

কিন্তু কার্ড বানানোর সময় রুশদকে একটা কঠিন সিদ্ধান্ত নিতে হয়েছিল: কোনটাকে "শব্দ" ধরা হবে? বইয়ের নামে লেখা আছে "আল-হিন্দাসা", কেউ খুঁজতে এসে বলে "হিন্দাসা"। কেউ লেখে "কিতাব", কেউ "কিতাবুল"। কেউ শুরুতে বড় হরফ দেয়, কেউ দেয় না। রুশদ তাই একটা নিয়ম বানাল: কার্ড বানানোর সময় সে সব শব্দ থেকে "আল-" ছেঁটে ফেলে, সব হরফ এক মাপে লেখে, আর "এবং", "থেকে", "এর" জাতীয় শব্দগুলোর কার্ডই বানায় না — ওগুলো এত বইয়ে আছে যে কার্ডটা কোনো কাজেই লাগে না। সবচেয়ে জরুরি নিয়মটা হলো: **খদ্দের যখন খুঁজতে আসে, তখনও ঠিক একই কাটাছেঁড়া তার কথার উপরও চালাতে হবে** — নইলে কার্ড আর প্রশ্ন কোনোদিন মিলবে না। এই কাটাছেঁড়ার নিয়মগুলোই হলো **analysis** ও **tokenisation**, আর বাদ দেওয়া শব্দগুলো **stop word**।

তারপর এলো সবচেয়ে সূক্ষ্ম প্রশ্ন — মিলে যাওয়া দশটা বইয়ের মধ্যে কোনটা আগে দেখাবে? রুশদ অভিজ্ঞতা থেকে তিনটা নিয়ম বের করেছে। এক, যে বইয়ে শব্দটা যত বেশিবার আছে, সেটা তত বেশি ওই বিষয়ের। দুই, যে শব্দ **কম বইয়ে** আছে সেটা বেশি দামি — "কিতাব" শব্দটা প্রায় সব বইয়ে আছে, তাই ওটা দিয়ে কিছুই আলাদা করা যায় না, কিন্তু "আস্তুরলাব" মাত্র নয়টা বইয়ে আছে, তাই ওটা সোনার মতো। তিন, একটা মোটা বইয়ে যেকোনো শব্দ এমনিতেই বেশিবার আসবে, তাই মোটা বইয়ের গণনাকে কিছুটা ছোট করে দেখতে হবে, নইলে সব খোঁজে ওই মোটা বইটাই আগে আসবে। এই তিনটা নিয়ম — বারবার আসা, বিরল হওয়া, আর দৈর্ঘ্য সমন্বয় — একসাথে বসালেই আপনি কার্যত **BM25** পেয়ে গেছেন।

চতুর্থ ঝামেলাটা ছিল সময়ের। রুশদ কার্ডবাক্স হালনাগাদ করে দিনে একবার, সন্ধ্যায়। ফলে সকালে যে বই বাজারে এসেছে, দুপুরে কেউ সেটা খুঁজলে পায় না — যদিও বইটা দোকানে বসেই আছে। একদিন এক ক্রেতা রেগে গেল, কারণ সে নিজের চোখে বইটা দেখে এসেছে অথচ দালাল বলছে "নেই"। তখন রুশদ দুটো ব্যবস্থা করল: বড় কাজটা আগের মতোই সন্ধ্যায় হবে, কিন্তু নতুন বই এলে সাথে সাথে একটা ছোট "আজকের কার্ড" বাক্সে চিরকুট পড়বে, আর খোঁজার সময় সে দুটো বাক্সেই দেখবে। আর দোকান থেকে বই বিক্রি হয়ে গেলে কার্ড খুঁজে মোছার বদলে সে একটা "বাতিল" চিরকুট রাখে, ফলাফল দেখানোর সময় বাদ দিয়ে দেয়। দিনে একবারের এই পিছিয়ে থাকাটাই **freshness lag**, ছোট বাক্সটা **real-time index**, আর বাতিলের চিরকুট হলো **tombstone**।

আর শেষে — খদ্দেররা কেবল বিষয় ধরে খোঁজে না। কেউ বলে "শুধু ফারসি বই", কেউ বলে "একশো দিরহামের নিচে", কেউ বলে "পুরনো নয়, নতুন নকল"। রুশদ তাই আলাদা কয়েকটা ছোট বোর্ড রাখে যেখানে ভাষা-ভিত্তিক, দাম-ভিত্তিক, অবস্থা-ভিত্তিক গণনা লেখা থাকে, আর ফলাফল দেওয়ার সময় বলে দেয় "ফারসিতে ১২টা, আরবিতে ৩১টা"। এগুলোই **facet**। আর সবশেষে, দুটো বই সমান মানানসই হলে সে কাছের দোকানেরটা আগে বলে, বা যে দোকানদার নির্ভরযোগ্য তারটা — এটাই **text relevance ছাড়িয়ে ranking**।

মিলিয়ে নিই: শব্দ ধরে সাজানো কার্ডবাক্স হলো **inverted index**; কার্ডের পেছনের তালিকা **posting list**; শব্দ ছাঁটাই ও একরূপ করার নিয়ম **analysis/tokenisation**; বাদ দেওয়া অতি-সাধারণ শব্দ **stop word**; বারবার আসা + বিরলতা + দৈর্ঘ্য সমন্বয় মিলে **BM25**; সন্ধ্যার হালনাগাদ আর দুপুরের ফাঁক হলো **freshness lag**; বাতিলের চিরকুট **tombstone**; আর ছোট বোর্ডগুলো **facet**। Elasticsearch, Lucene, Meilisearch বা Typesense — সবাই ঠিক এই কাঠামোতেই দাঁড়ানো।

## কেন ডেটাবেসের LIKE যথেষ্ট নয়

প্রায় প্রতিটা প্রজেক্টে search শুরু হয় `WHERE title LIKE '%astrolabe%'` দিয়ে, আর তিন মাস পরে সেটাই সবচেয়ে বড় সমস্যা হয়ে দাঁড়ায়। কারণগুলো আলাদা করে দেখলে পুরো chapter-টার প্রয়োজনীয়তা পরিষ্কার হয়ে যায়।

**গতি।** `LIKE '%x%'` কোনো B-tree index ব্যবহার করতে পারে না — শুরুতে wildcard থাকায় index-এর ক্রম অকেজো। ফলে প্রতিটা query একটা full table scan। দশ লাখ row-তে সেটা সেকেন্ডে গিয়ে ঠেকে।

**মিলের মান।** `LIKE` হয় মেলে, নয় মেলে না। "astrolabes" খুঁজলে "astrolabe" মিলবে না। বানান ভুল হলে কিছুই মিলবে না। আর মিলে গেলেও কোনটা বেশি প্রাসঙ্গিক সেটা বলার কোনো উপায় নেই।

**ক্রম।** ফলাফলের ক্রম হবে যেভাবে ডেটাবেস row ফেরত দেয় — অর্থাৎ কার্যত এলোমেলো। ব্যবহারকারীর কাছে খারাপ ক্রম মানে "সার্চ কাজ করে না"।

**বহু-শর্তের প্রশ্ন।** "জ্যামিতির বই, ফারসি ভাষায়, ২০০ দিরহামের নিচে, সাথে প্রতিটা ভাষায় কয়টা আছে সেই গণনা" — SQL-এ এটা সম্ভব, কিন্তু প্রতিটা facet-এর জন্য আলাদা aggregate query চালাতে হবে, আর সেগুলোও scan করবে।

<Callout type="tip">

Postgres-এর `tsvector` ও GIN index একটা বাস্তব মাঝামাঝি ধাপ — inverted index-ই, শুধু ডেটাবেসের ভেতরে। যতক্ষণ ডকুমেন্ট সংখ্যা কয়েক লাখের মধ্যে আর ranking-এর চাহিদা সাধারণ, ততক্ষণ আলাদা search cluster না চালানোই বুদ্ধিমানের কাজ। আলাদা search engine তখনই আনুন যখন custom ranking, facet, বা কয়েক কোটি ডকুমেন্ট আপনাকে বাধ্য করছে।

</Callout>

## Inverted index-এর গঠন

Forward index হলো স্বাভাবিক দিক: ডকুমেন্ট থেকে শব্দ। Inverted index হলো উল্টো দিক: শব্দ থেকে ডকুমেন্ট। Search-এর পুরো গতিটা এই উল্টে দেওয়া থেকেই আসে।

<Mermaid
title="Forward Index vs Inverted Index"
code={`graph LR
  subgraph Forward
    D1["doc 12"] --> T1["handasa, kitab, uqlidis"]
    D2["doc 47"] --> T2["handasa, nujum, kitab"]
  end
  subgraph Inverted
    W1["handasa"] --> P1["12 tf=4, 47 tf=2"]
    W2["nujum"] --> P2["47 tf=7, 88 tf=3"]
    W3["uqlidis"] --> P3["12 tf=9"]
  end`}
/>

একটা posting list-এ সাধারণত তিনটা জিনিস থাকে:

- **doc id** — কোন ডকুমেন্ট
- **term frequency** — ওই ডকুমেন্টে শব্দটা কতবার (scoring-এর জন্য)
- **positions** — কোন কোন অবস্থানে (phrase query আর proximity-র জন্য)

Position রাখা index-কে বড় করে, কিন্তু "ilm al-nujum" — এই পুরো বাক্যাংশটা খোঁজার একমাত্র উপায় ওটাই। আপনার সিস্টেমে phrase search দরকার কিনা, সেটা index ডিজাইনের সময়েই ঠিক করতে হয়।

আরেকটা কাঠামো লাগে প্রায় সবসময়: **doc store** — doc id থেকে আসল ডকুমেন্টের মেটাডেটা, যা ফলাফল দেখানোর সময় লাগে, আর filter/facet-এর জন্যও লাগে।

## Analysis: text থেকে term

Analysis হলো search-এর সবচেয়ে অবহেলিত ও সবচেয়ে ফলদায়ক অংশ। এখানে একটা ভুল করলে পুরো ranking নিখুঁত হলেও ব্যবহারকারী ফলাফল পাবে না।

ধাপগুলো সাধারণত এই ক্রমে চলে:

1. **Character filter** — HTML ছাঁটা, diacritic সরানো, punctuation একরূপ করা
2. **Tokenizer** — text-কে token-এ ভাঙা (whitespace, বা ভাষা-সচেতন নিয়মে)
3. **Lowercase** — case-insensitive মিলের জন্য
4. **Stop word removal** — অতি-সাধারণ শব্দ বাদ
5. **Stemming বা lemmatisation** — "books" থেকে "book", "running" থেকে "run"
6. **Synonym expansion** — "astrolabe" এর সাথে "usturlab" যোগ

<Callout type="warning">

সবচেয়ে সাধারণ প্রোডাকশন bug: index করার সময় একটা analyzer, query করার সময় আরেকটা। যেমন index-এ stemming চালু কিন্তু query-তে নেই — তখন ব্যবহারকারী "astrolabes" লিখলে index-এ থাকা "astrolab" token-এর সাথে মিলবে না, আর কেউ বুঝবে না কেন। **যেকোনো analyzer পরিবর্তনের পর পুরো index আবার বানাতে হয়**, কারণ পুরনো ডকুমেন্টের token পুরনো নিয়মে বানানো।

</Callout>

Stemming নিয়ে একটা বাস্তব সতর্কতা: আক্রমণাত্মক stemmer শব্দকে এমন গোড়ায় নামিয়ে আনে যে অর্থ হারায় — "university" আর "universal" দুটোই "univers" হয়ে যেতে পারে। ফলে recall বাড়ে, precision কমে। কোনটা বেশি জরুরি সেটা আপনার ডোমেইনের প্রশ্ন: e-commerce-এ precision, legal discovery-তে recall।

## BM25: প্রাসঙ্গিকতার হিসাব

BM25 আজও শিল্পক্ষেত্রের ডিফল্ট, কারণ এটা তিনটা স্বজ্ঞাত ধারণাকে একটা সূত্রে বাঁধে।

**Term frequency, কিন্তু ক্রমহ্রাসমান।** শব্দটা ডকুমেন্টে ৫ বার থাকা ১ বার থাকার চেয়ে অনেক ভালো, কিন্তু ৫০ বার থাকা ৪৫ বার থাকার চেয়ে প্রায় কিছুই ভালো নয়। BM25-এর `k1` প্যারামিটার এই স্যাচুরেশন নিয়ন্ত্রণ করে (সাধারণত ১.২ থেকে ২.০)।

**Inverse document frequency।** যে term যত কম ডকুমেন্টে আছে, তার ওজন তত বেশি। এটাই "কিতাব" আর "আস্তুরলাব"-এর তফাত।

**দৈর্ঘ্য সমন্বয়।** লম্বা ডকুমেন্টে যেকোনো শব্দ এমনিতেই বেশিবার আসে, তাই গণনাকে গড় দৈর্ঘ্যের সাপেক্ষে স্বাভাবিক করা হয়। `b` প্যারামিটার ঠিক করে সমন্বয়টা কতটা কড়া (সাধারণত ০.৭৫)।

```
IDF(t)   = ln(1 + (N - n_t + 0.5) / (n_t + 0.5))
score(d) = sum over query terms t of
             IDF(t) * (f_td * (k1 + 1))
                    / (f_td + k1 * (1 - b + b * dl_d / avgdl))
```

এখানে `N` মোট ডকুমেন্ট, `n_t` কতগুলো ডকুমেন্টে term আছে, `f_td` ডকুমেন্টে term-এর গণনা, `dl_d` ডকুমেন্টের দৈর্ঘ্য, `avgdl` গড় দৈর্ঘ্য।

<Callout type="info">

`b = 0` দিলে দৈর্ঘ্য সমন্বয় পুরো বন্ধ, `b = 1` দিলে সম্পূর্ণ। ছোট ও প্রায় সমান দৈর্ঘ্যের ডকুমেন্ট (যেমন পণ্যের নাম) হলে `b` কমিয়ে দিন — নইলে দুই শব্দের নাম অন্যায্যভাবে সুবিধা পায়। লম্বা ও অসম দৈর্ঘ্যের ডকুমেন্ট (আর্টিকেল, ডকুমেন্টেশন) হলে ০.৭৫ ভালো শুরু।

</Callout>

## সম্পূর্ণ search engine

নিচের কোডটা একটা কাজ করা search engine — analyzer, inverted index, BM25 scoring, filter, facet, tombstone দিয়ে delete, আর ranking-এ text relevance-এর সাথে business signal মেশানো সহ।

```typescript
// --- Document model ---
export interface Manuscript {
	id: string;
	title: string;
	body: string;
	language: 'arabic' | 'persian' | 'latin';
	city: string;
	priceDirham: number;
	popularity: number; // 0..1, derived from views and purchases
	createdAt: number; // epoch millis
}

export interface SearchHit {
	id: string;
	score: number;
	textScore: number;
	title: string;
	explanation: string[];
}

export interface SearchResult {
	hits: SearchHit[];
	total: number;
	facets: Record<string, Record<string, number>>;
	tookMs: number;
}

export interface SearchQuery {
	q: string;
	filters?: {
		language?: string[];
		city?: string[];
		maxPriceDirham?: number;
	};
	facetFields?: Array<'language' | 'city'>;
	from?: number;
	size?: number;
}

// --- Analyzer ---
const STOP_WORDS = new Set([
	'al',
	'the',
	'of',
	'and',
	'in',
	'on',
	'a',
	'an',
	'to',
	'fi',
	'wa',
	'min'
]);

const SYNONYMS: Record<string, string[]> = {
	astrolabe: ['usturlab'],
	usturlab: ['astrolabe'],
	geometry: ['handasa'],
	handasa: ['geometry'],
	astronomy: ['nujum'],
	nujum: ['astronomy']
};

/**
 * Very small but honest stemmer. Real systems use Snowball/Porter; the point
 * here is that the SAME function must run at index time and at query time.
 */
function stem(token: string): string {
	for (const suffix of ['iyya', 'ies', 'ing', 'es', 's']) {
		if (token.length > suffix.length + 2 && token.endsWith(suffix)) {
			return token.slice(0, -suffix.length);
		}
	}
	return token;
}

export function analyze(text: string, expandSynonyms = false): string[] {
	const normalised = text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // strip diacritics
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, ' ');

	const tokens: string[] = [];
	for (const raw of normalised.split(/[\s-]+/)) {
		if (!raw) continue;
		if (STOP_WORDS.has(raw)) continue;
		const stemmed = stem(raw);
		tokens.push(stemmed);
		if (expandSynonyms) {
			for (const syn of SYNONYMS[raw] ?? []) tokens.push(stem(syn));
		}
	}
	return tokens;
}

// --- Posting list ---
interface Posting {
	docId: string;
	termFrequency: number;
	positions: number[];
}

// --- The index ---
export class SearchIndex {
	private postings = new Map<string, Posting[]>();
	private docs = new Map<string, Manuscript>();
	private docLengths = new Map<string, number>();
	private deleted = new Set<string>(); // tombstones
	private totalLength = 0;

	private readonly k1 = 1.2;
	private readonly b = 0.75;

	// --- Indexing ---
	index(doc: Manuscript): void {
		if (this.docs.has(doc.id)) this.remove(doc.id);
		this.deleted.delete(doc.id);

		// Title tokens are repeated so that a title match outweighs a body
		// match. This is the poor man's version of per-field boosting.
		const titleTokens = analyze(doc.title);
		const bodyTokens = analyze(doc.body);
		const tokens = [...titleTokens, ...titleTokens, ...titleTokens, ...bodyTokens];

		const perTerm = new Map<string, number[]>();
		tokens.forEach((token, position) => {
			const list = perTerm.get(token) ?? [];
			list.push(position);
			perTerm.set(token, list);
		});

		for (const [term, positions] of perTerm) {
			const list = this.postings.get(term) ?? [];
			list.push({ docId: doc.id, termFrequency: positions.length, positions });
			this.postings.set(term, list);
		}

		this.docs.set(doc.id, doc);
		this.docLengths.set(doc.id, tokens.length);
		this.totalLength += tokens.length;
	}

	/**
	 * Deletion writes a tombstone instead of rewriting every posting list.
	 * Postings are cleaned up lazily during merge/compaction, exactly like
	 * Lucene segments. Search must therefore always filter tombstones.
	 */
	softDelete(docId: string): void {
		if (!this.docs.has(docId)) return;
		this.deleted.add(docId);
	}

	private remove(docId: string): void {
		const length = this.docLengths.get(docId) ?? 0;
		this.totalLength -= length;
		this.docLengths.delete(docId);
		this.docs.delete(docId);
		for (const [term, list] of this.postings) {
			const filtered = list.filter((p) => p.docId !== docId);
			if (filtered.length === 0) this.postings.delete(term);
			else this.postings.set(term, filtered);
		}
	}

	/** Compaction: physically drop tombstoned documents. */
	compact(): number {
		const dropped = this.deleted.size;
		for (const docId of this.deleted) this.remove(docId);
		this.deleted.clear();
		return dropped;
	}

	private get liveDocCount(): number {
		return this.docs.size - this.deleted.size;
	}

	private get averageLength(): number {
		const live = this.liveDocCount;
		return live === 0 ? 1 : this.totalLength / live;
	}

	// --- Scoring ---
	private idf(term: string): number {
		const n = (this.postings.get(term) ?? []).filter((p) => !this.deleted.has(p.docId)).length;
		const N = this.liveDocCount;
		if (n === 0) return 0;
		return Math.log(1 + (N - n + 0.5) / (n + 0.5));
	}

	private bm25(term: string, posting: Posting): number {
		const dl = this.docLengths.get(posting.docId) ?? 1;
		const numerator = posting.termFrequency * (this.k1 + 1);
		const denominator =
			posting.termFrequency + this.k1 * (1 - this.b + (this.b * dl) / this.averageLength);
		return this.idf(term) * (numerator / denominator);
	}

	private passesFilters(doc: Manuscript, filters: SearchQuery['filters']): boolean {
		if (!filters) return true;
		if (
			filters.language &&
			filters.language.length > 0 &&
			!filters.language.includes(doc.language)
		) {
			return false;
		}
		if (filters.city && filters.city.length > 0 && !filters.city.includes(doc.city)) {
			return false;
		}
		if (filters.maxPriceDirham !== undefined && doc.priceDirham > filters.maxPriceDirham) {
			return false;
		}
		return true;
	}

	/**
	 * Final ranking is text relevance combined with business signals.
	 * Keeping the text score separate and visible is what makes ranking
	 * changes debuggable six months later.
	 */
	private finalScore(doc: Manuscript, textScore: number): { score: number; why: string[] } {
		const ageDays = (Date.now() - doc.createdAt) / 86_400_000;
		const freshness = 1 / (1 + ageDays / 180); // half weight after ~6 months
		const popularity = doc.popularity;

		const score = textScore * (1 + 0.35 * popularity + 0.15 * freshness);
		return {
			score,
			why: [
				`text=${textScore.toFixed(3)}`,
				`popularity=${popularity.toFixed(2)}`,
				`freshness=${freshness.toFixed(2)}`
			]
		};
	}

	// --- Search ---
	search(query: SearchQuery): SearchResult {
		const startedAt = Date.now();
		const terms = analyze(query.q, true);
		const scores = new Map<string, number>();

		for (const term of terms) {
			const list = this.postings.get(term);
			if (!list) continue;
			for (const posting of list) {
				if (this.deleted.has(posting.docId)) continue;
				const doc = this.docs.get(posting.docId);
				if (!doc || !this.passesFilters(doc, query.filters)) continue;
				scores.set(posting.docId, (scores.get(posting.docId) ?? 0) + this.bm25(term, posting));
			}
		}

		const scored: SearchHit[] = [];
		for (const [docId, textScore] of scores) {
			const doc = this.docs.get(docId);
			if (!doc) continue;
			const { score, why } = this.finalScore(doc, textScore);
			scored.push({ id: docId, score, textScore, title: doc.title, explanation: why });
		}

		scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

		const from = query.from ?? 0;
		const size = query.size ?? 10;

		return {
			hits: scored.slice(from, from + size),
			total: scored.length,
			facets: this.buildFacets(scored, query),
			tookMs: Date.now() - startedAt
		};
	}

	/**
	 * Facets are computed over the FULL matching set, not the current page.
	 * Counting only the page would show wrong numbers as the user pages.
	 */
	private buildFacets(
		hits: SearchHit[],
		query: SearchQuery
	): Record<string, Record<string, number>> {
		const fields = query.facetFields ?? [];
		const out: Record<string, Record<string, number>> = {};

		for (const field of fields) {
			const counts: Record<string, number> = {};
			for (const hit of hits) {
				const doc = this.docs.get(hit.id);
				if (!doc) continue;
				const value = String(doc[field]);
				counts[value] = (counts[value] ?? 0) + 1;
			}
			out[field] = counts;
		}
		return out;
	}

	stats(): { docs: number; terms: number; tombstones: number; avgLength: number } {
		return {
			docs: this.liveDocCount,
			terms: this.postings.size,
			tombstones: this.deleted.size,
			avgLength: Number(this.averageLength.toFixed(1))
		};
	}
}

// --- Demo ---
function demo(): void {
	const index = new SearchIndex();
	const now = Date.now();

	index.index({
		id: 'ms-001',
		title: 'Kitab al-Handasa',
		body: 'A treatise on handasa and the measurement of land, following Uqlidis.',
		language: 'arabic',
		city: 'baghdad',
		priceDirham: 180,
		popularity: 0.8,
		createdAt: now - 30 * 86_400_000
	});

	index.index({
		id: 'ms-002',
		title: 'Risala fi al-Usturlab',
		body: 'On the construction of the astrolabe and its use for nujum observations.',
		language: 'arabic',
		city: 'cordoba',
		priceDirham: 340,
		popularity: 0.5,
		createdAt: now - 500 * 86_400_000
	});

	index.index({
		id: 'ms-003',
		title: 'Astronomy of the Northern Sky',
		body: 'Latin notes on astronomy, star tables, and the astrolabe.',
		language: 'latin',
		city: 'cordoba',
		priceDirham: 90,
		popularity: 0.2,
		createdAt: now - 5 * 86_400_000
	});

	const result = index.search({
		q: 'astrolabe',
		facetFields: ['language', 'city'],
		size: 5
	});

	console.log(`total=${result.total} took=${result.tookMs}ms`);
	for (const hit of result.hits) {
		console.log(`${hit.score.toFixed(3)}  ${hit.title}  [${hit.explanation.join(' ')}]`);
	}
	console.log('facets:', result.facets);

	const filtered = index.search({
		q: 'astrolabe',
		filters: { language: ['arabic'], maxPriceDirham: 400 }
	});
	console.log(
		'arabic only:',
		filtered.hits.map((h) => h.id)
	);

	index.softDelete('ms-002');
	console.log('after delete:', index.search({ q: 'astrolabe' }).total);
	console.log('compacted:', index.compact(), index.stats());
}

demo();
```

## Indexing pipeline এবং freshness lag

Search index কখনোই primary store নয় — এটা সবসময় একটা derived view, তাই দুটো প্রশ্ন সবসময় থাকে: **কতটা পিছিয়ে আছে**, আর **পিছিয়ে গেলে কীভাবে টের পাবেন**।

<Mermaid
title="Indexing Pipeline"
code={`graph LR
  DB["Primary Store<br/>Postgres"] -->|CDC or outbox| Q["Index Queue"]
  Q --> W["Indexer Workers<br/>enrich, analyze"]
  W --> RT["Real-time segment<br/>seconds old"]
  W --> BULK["Bulk segment<br/>rebuilt nightly"]
  RT --> S["Search API"]
  BULK --> S
  DB -.->|periodic reconciliation| REC["Reconciler<br/>find drift"]
  REC --> Q`}
/>

একটা নির্ভরযোগ্য pipeline-এর চারটা বৈশিষ্ট্য থাকে।

**Idempotent indexing।** একই ডকুমেন্ট দুবার index হলে ফল একই হতে হবে। Document id দিয়ে upsert করলে এটা আপনা-আপনি পাওয়া যায়।

**Version guard।** পুরনো বার্তা দেরিতে এসে নতুন ডেটাকে চাপা দিয়ে দিতে পারে। তাই প্রতিটা ডকুমেন্টের সাথে একটা version রাখুন এবং ছোট version এলে বাদ দিন। এটা আসলে চ্যাপ্টার ১৫-এর fencing token-এরই আরেক রূপ।

**Reconciliation।** কোনো pipeline কখনো নিখুঁত থাকে না — বার্তা হারায়, worker crash করে, bug ছাড়া হয়। তাই একটা periodic কাজ থাকতে হবে যা primary store আর index-এর মধ্যে পার্থক্য (drift) খুঁজে বের করে এবং শুধু গরমিলগুলো আবার index-এ পাঠায়। সাধারণত `id -> updated_at` বা `id -> checksum` মিলিয়ে দেখা হয়।

**Lag metric।** "সবচেয়ে পুরনো না-index-হওয়া পরিবর্তন কত সেকেন্ড আগের" — এই একটা সংখ্যাই search-এর স্বাস্থ্যের সবচেয়ে ভালো নির্দেশক। Queue-র দৈর্ঘ্য নয়, **বয়স**। কারণ ছোট queue-ও যদি একটা আটকে থাকা বার্তা ধরে রাখে, ব্যবহারকারী পুরনো ফলাফল দেখবে।

<Callout type="warning">

Full reindex-কে কখনো "কখনো দরকার হবে না" ধরে নেবেন না। Analyzer বদলানো, নতুন field যোগ করা, বা mapping ঠিক করা — সবই full reindex চায়। তাই প্রথম দিন থেকেই দুটো জিনিস রাখুন: (১) primary store থেকে পুরো ডেটা ধারাবাহিকভাবে পড়ার একটা উপায়, আর (২) alias ব্যবহার — নতুন index আলাদা নামে বানিয়ে, প্রস্তুত হলে alias সরিয়ে দিন। এতে reindex-এর সময় সার্চ বন্ধ থাকে না এবং rollback এক ধাপে হয়।

</Callout>

## Text relevance ছাড়িয়ে ranking

বাস্তব প্রোডাক্টে খাঁটি BM25 প্রায় কখনোই সঠিক ক্রম দেয় না, কারণ ব্যবহারকারী "সবচেয়ে মিলে যাওয়া" চায় না — চায় "সবচেয়ে কাজের"। তাই text score-এর সাথে business signal মেশাতে হয়।

সাধারণত যেসব signal কাজে লাগে:

- **জনপ্রিয়তা** — ক্লিক, বিক্রি, ধার নেওয়ার হার
- **সতেজতা** — খবর বা লিস্টিং-এ জরুরি, রেফারেন্স ডকুমেন্টে নয়
- **গুণমান** — রেটিং, সম্পূর্ণতা, ছবি আছে কিনা
- **ব্যক্তিগতকরণ** — অবস্থান, ভাষা, আগের আচরণ
- **ব্যবসায়িক নিয়ম** — স্টকে আছে এমন পণ্য আগে, বন্ধ দোকান পরে

দুটো ভুল এখানে বারবার হয়।

**প্রথম ভুল: সব signal একটা যোগফলে মিশিয়ে ফেলা।** তখন ছয় মাস পরে কেউ প্রশ্ন করলে "এই ফলাফলটা কেন উপরে" — উত্তর দেওয়ার উপায় থাকে না। সমাধান হলো text score আলাদা রাখা, প্রতিটা multiplier আলাদা রাখা, আর প্রতিটা hit-এর সাথে একটা explanation ফেরত দেওয়া (উপরের কোডে ঠিক সেটাই করা হয়েছে)।

**দ্বিতীয় ভুল: business signal-কে text-এর উপর প্রাধান্য দেওয়া।** জনপ্রিয়তার ওজন বেশি হয়ে গেলে যেকোনো query-তে সবচেয়ে জনপ্রিয় জিনিসটাই আসে, প্রাসঙ্গিক হোক না হোক। নিরাপদ কাঠামো হলো **গুণক**, যোগ নয়: text score শূন্য হলে জনপ্রিয়তা দিয়েও ডকুমেন্টটা উঠে আসবে না।

বড় সিস্টেমে এই কাজটা দুই ধাপে ভাগ করা হয়: **retrieval** (দ্রুত, সস্তা, হাজার খানেক প্রার্থী বের করা) আর **re-ranking** (ব্যয়বহুল মডেল দিয়ে শীর্ষ কয়েকশটাকে আবার সাজানো)। এই বিভাজনটা গুরুত্বপূর্ণ, কারণ ব্যয়বহুল মডেল কোটি ডকুমেন্টে চালানো যায় না, কিন্তু ২০০টায় চালানো যায়।

<Callout type="tip">

Ranking বদলানোর আগে **মাপার ব্যবস্থা** বানান, নইলে আপনি অন্ধকারে টিউন করছেন। ন্যূনতম যা লাগে: click-through rate, প্রথম ক্লিকের গড় অবস্থান, আর শূন্য-ফলাফল query-র হার। শূন্য-ফলাফল query-র তালিকাটা সবচেয়ে দামি জিনিস — ওখানেই আপনার synonym, stemming আর বানান-সংশোধনের কাজের তালিকা লেখা আছে।

</Callout>

## যে ব্যাপারগুলো প্রায়ই ভুল হয়

**Pagination গভীরে গিয়ে ভাঙে।** `from=100000` মানে engine-কে এক লাখ ফলাফল বের করে ফেলে দিতে হবে। তাই গভীর pagination-এর বদলে cursor বা "search after" ব্যবহার করুন, এবং UI-তে গভীর পাতা দেওয়াই বন্ধ করুন — কেউ ৫০০ নম্বর পাতায় যায় না।

**Facet count আর ফলাফল আলাদা filter-এ হিসাব হয়।** ব্যবহারকারী "ফারসি" filter দেওয়ার পর ভাষা facet-এ শুধু ফারসি দেখালে সে আর অন্য ভাষায় যেতে পারবে না। নিয়ম হলো: একটা facet-এর গণনা করার সময় **সেই facet-এর নিজের filter বাদ দিয়ে** বাকি সব filter প্রয়োগ করুন।

**Synonym একমুখী রাখা।** "usturlab" খুঁজলে "astrolabe" পাওয়া যায় কিন্তু উল্টোটা নয় — এমন হলে ব্যবহারকারীর অর্ধেক মিলবে না। দুই দিকেই যোগ করুন, অথবা index-time synonym ব্যবহার করুন।

**বানান ভুল উপেক্ষা করা।** বাস্তব ট্রাফিকের ৫–১০ শতাংশ query-তে বানান ভুল থাকে। শূন্য ফলাফল পেলে edit distance ১ বা ২-এর মধ্যে সংশোধন চেষ্টা করা তুলনামূলক সহজ কাজ, আর এটার প্রভাব সবচেয়ে বড়।

<div class="takeaways">

### মূল শেখা

- Inverted index শব্দ থেকে ডকুমেন্টে যায়; posting list-এ doc id, term frequency আর প্রয়োজনে position থাকে — phrase search-এর জন্য position ছাড়া উপায় নেই
- Index-time আর query-time analyzer **অবিকল এক** হতে হবে; analyzer বদলালে পুরো index আবার বানাতেই হবে
- BM25-এর তিনটা স্তম্ভ: ক্রমহ্রাসমান term frequency (k1), বিরল term-এর বেশি ওজন (IDF), আর দৈর্ঘ্য সমন্বয় (b)
- Delete করতে posting list পুনর্লিখন নয় — tombstone লিখুন, পরে compaction-এ পরিষ্কার করুন
- Facet সবসময় পুরো match set-এর উপর গণনা হবে, বর্তমান পাতার উপর নয়; আর নিজের facet-এর filter নিজের গণনায় প্রয়োগ করবেন না
- Search index সবসময় derived — তাই idempotent indexing, version guard, periodic reconciliation আর **lag-এর বয়স** মাপা বাধ্যতামূলক
- Business signal text score-এর সাথে **গুণ করুন, যোগ করবেন না**, আর প্রতিটা hit-এর সাথে explanation ফেরত দিন যাতে ছয় মাস পরে ranking debug করা যায়
- বড় সিস্টেমে retrieval আর re-ranking আলাদা ধাপ — সস্তা করে হাজার আনুন, দামি করে শীর্ষ দুশো সাজান

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Lucene** (এবং তার উপর Elasticsearch ও OpenSearch) ঠিক এই কাঠামোতেই চলে: immutable segment, tombstone দিয়ে delete, আর background merge
- **Postgres full-text search** (`tsvector` + GIN) কয়েক লাখ ডকুমেন্ট পর্যন্ত আলাদা cluster ছাড়াই যথেষ্ট
- **Algolia** ও **Typesense** latency-কে প্রথম অগ্রাধিকার দেয় এবং typo tolerance ডিফল্ট করে রাখে, কারণ instant-search UI-তে বানান ভুল স্বাভাবিক
- **Amazon** ও **Airbnb** retrieval আর re-ranking আলাদা করে: BM25-জাতীয় সস্তা ধাপে প্রার্থী, তারপর learned model দিয়ে চূড়ান্ত ক্রম
- **Debezium বা outbox** দিয়ে primary store থেকে search index-এ পরিবর্তন পাঠানো এখন প্রচলিত প্যাটার্ন, আর তার পাশে একটা nightly reconciliation প্রায় সবসময় থাকে
- Alias-এর পেছনে নতুন index বানিয়ে atomic swap করা — Elasticsearch-এ এটাই full reindex-এর মানসম্মত পদ্ধতি

</div>
