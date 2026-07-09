---
title: 'How Search Works'
subtitle: 'Inverted index, tokenization, TF-IDF, BM25 — Postgres full-text থেকে Elasticsearch পর্যন্ত প্রতিটা search engine-এর পেছনের মেকানিক্স।'
chapter: 1
level: 'beginner'
readingTime: '9 মিনিট'
topics: ['inverted index', 'tokenization', 'TF-IDF', 'BM25', 'full-text search', 'relevance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা বইয়ের পেছনের index: "database"-এর উল্লেখ খুঁজতে প্রতিটা পৃষ্ঠা পড়ার বদলে আপনি index-এ যান, "database: pages 12, 47, 203" পান, আর সরাসরি সেখানে চলে যান। একটা inverted index হলো ঠিক সেই স্ট্রাকচারটাই — প্রতিটা শব্দ থেকে সেই ডকুমেন্টগুলোতে একটা ম্যাপিং যেখানে শব্দটা আছে — আপনার কালেকশনের প্রতিটা ডকুমেন্টের জন্য বানানো।

</Callout>

## The Inverted Index

একটা database query row স্ক্যান করে। একটা search engine একটা inverted index ব্যবহার করে: term থেকে document ID-এর একটা ম্যাপ।

```
Document 1: "fast database queries"
Document 2: "optimizing database performance"
Document 3: "fast query optimization"

Inverted index:
  "fast"       → [1, 3]
  "database"   → [1, 2]
  "queries"    → [1]
  "optimizing" → [2]
  "performance"→ [2]
  "query"      → [3]
  "optimization"→[3]
```

Query "database fast": `database → [1, 2]` আর `fast → [1, 3]`-এর intersection বের করুন → document 1। কোনো স্ক্যানিং লাগে না।

## Tokenization এবং Normalization

Indexing-এর আগে টেক্সটকে token-এ প্রসেস করা হয়:

```
Input: "The FASTEST Database Queries!"

1. Lowercase:       "the fastest database queries!"
2. Tokenize:        ["the", "fastest", "database", "queries"]
3. Remove stopwords: ["fastest", "database", "queries"]
4. Stem/lemmatize:  ["fast", "databas", "queri"]  ← root forms
   (or keep: "fastest", "database", "queries")
```

**Stemming** শব্দগুলোকে root form-এ নামিয়ে আনে (running → run, databases → databas)। নিখুঁত না হলেও ভ্যারিয়েন্ট ধরতে পারে।

**Lemmatization** dictionary form-এ নামিয়ে আনে (running → run, better → good)। বেশি নিখুঁত কিন্তু ধীর।

**Stopwords** (the, a, is, at) search-এ কোনো সাহায্য না করে শুধু noise যোগ করে — index করার আগে ফিল্টার করা হয়।

একই pipeline query-এর সময়েও চলে: search term-টা একই normalization-এর মধ্য দিয়ে যায়, যাতে "DATABASES" সেই ডকুমেন্টগুলো খুঁজে পায় যেগুলো "databas"-এর অধীনে index করা।

## একটা Minimal Inverted Index বানানো

```typescript
class InvertedIndex {
	private index = new Map<string, Set<number>>();
	private documents = new Map<number, string>();
	private nextId = 0;

	private tokenize(text: string): string[] {
		return text
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.split(/\s+/)
			.filter((t) => t.length > 2); // naive stopword removal
	}

	add(document: string): number {
		const id = this.nextId++;
		this.documents.set(id, document);

		for (const token of this.tokenize(document)) {
			if (!this.index.has(token)) this.index.set(token, new Set());
			this.index.get(token)!.add(id);
		}
		return id;
	}

	search(query: string): string[] {
		const tokens = this.tokenize(query);
		if (tokens.length === 0) return [];

		// Intersection of posting lists for AND semantics
		let results: Set<number> | null = null;

		for (const token of tokens) {
			const posting = this.index.get(token) ?? new Set<number>();
			results =
				results === null ? new Set(posting) : new Set([...results].filter((id) => posting.has(id)));
		}

		return [...(results ?? [])].map((id) => this.documents.get(id)!);
	}
}

const idx = new InvertedIndex();
idx.add('fast database queries');
idx.add('optimizing database performance');
idx.add('fast query optimization');

idx.search('database fast'); // → ["fast database queries"]
idx.search('database'); // → ["fast database queries", "optimizing database performance"]
```

এটাই প্রতিটা search engine-এর মূল — বাকিটা হলো relevance ranking, scalability আর ফিচার।

## Relevance: TF-IDF

সব ম্যাচিং ডকুমেন্ট সমানভাবে relevant না। "database" ১০ বার উল্লেখ করা একটা ডকুমেন্ট একবার উল্লেখ করা ডকুমেন্টের চেয়ে বেশি relevant। কিন্তু "the" প্রতিটা ডকুমেন্টে থাকে — এর উপস্থিতি relevance-এর কোনো সিগন্যাল দেয় না।

**TF (Term Frequency):** এই ডকুমেন্টে term-টা কতবার আসে?

```
TF("database", doc1) = 1/3 = 0.33   (1 occurrence, 3 words)
TF("database", doc2) = 1/4 = 0.25
```

**IDF (Inverse Document Frequency):** সব ডকুমেন্ট জুড়ে term-টা কতটা বিরল?

```
IDF("database") = log(3 / 2) = 0.18   (3 docs total, 2 contain "database")
IDF("fast")     = log(3 / 2) = 0.18
IDF("the")      = log(3 / 3) = 0       (in every doc → zero signal)
```

**TF-IDF score:**

```
score(doc1, "database") = TF × IDF = 0.33 × 0.18 = 0.059
```

সব query term জুড়ে TF-IDF score-এর যোগফল দিয়ে ডকুমেন্টগুলো rank করা হয়।

## BM25 (Better Matching 25)

আধুনিক search engine-গুলো BM25 ব্যবহার করে — TF-IDF-এর উপর একটা উন্নতি যা document length-এর তারতম্য হ্যান্ডল করে:

```
BM25(q, d) = Σ IDF(qi) × (TF(qi, d) × (k1 + 1)) / (TF(qi, d) + k1 × (1 - b + b × |d| / avgdl))

k1 = 1.2 to 2.0   (term frequency saturation — prevents very high TF from dominating)
b = 0.75           (length normalization — longer docs don't get unfair advantage)
avgdl = average document length
```

সহজ ভাষায়: BM25 সেই ডকুমেন্টগুলোকে বেশি score দেয় যেখানে:

- term-টা ঘন ঘন আসে (তবে diminishing returns-সহ)
- ডকুমেন্টটা গড়ের তুলনায় ছোট (একটা ছোট ডকুমেন্ট যেখানে "database" দুবার আছে সেটা একটা লম্বা ডকুমেন্টের চেয়ে বেশি ফোকাসড যেখানে দুবার আছে)

Elasticsearch, Meilisearch, Typesense আর Postgres FTS সবাই BM25 বা এর কোনো ভ্যারিয়েন্ট ব্যবহার করে।

## Postgres Full-Text Search যা করে

Postgres-এর একটা বিল্ট-ইন full-text search ইমপ্লিমেন্টেশন আছে:

```sql
-- Create tsvector (the inverted index representation)
SELECT to_tsvector('english', 'The fastest database queries for production systems');
-- 'databas':3 'fastest':2 'product':6 'queri':4 'system':7
-- (positions preserved for phrase search)

-- Create tsquery (normalized query)
SELECT to_tsquery('english', 'database & fast');
-- 'databas' & 'fast'

-- Match
SELECT to_tsvector('english', 'fast database queries') @@ to_tsquery('english', 'database');
-- t

-- Rank results
SELECT title, ts_rank(search_vector, query) AS rank
FROM articles, to_tsquery('english', 'database') query
WHERE search_vector @@ query
ORDER BY rank DESC;
```

```sql
-- Index for performance
CREATE INDEX articles_search_idx ON articles USING GIN(search_vector);

-- Generated column keeps index in sync automatically
ALTER TABLE articles
ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) STORED;
```

Postgres FTS আপনার বিদ্যমান Postgres ডেটার উপর সাধারণ search-এর জন্য চমৎকার। এতে typo tolerance, faceting, synonym handling আর relevance tuning-এর মতো ফিচার নেই যেগুলো ডেডিকেটেড search engine দেয়।

## Phrase Search এবং Proximity

সাধারণ token ম্যাচিংয়ের বাইরে — "database performance"-কে একটা phrase হিসেবে খুঁজে পাওয়া, শুধু এমন ডকুমেন্ট না যেখানে দুটো শব্দই যেকোনো জায়গায় আছে:

```sql
-- Phrase search (tokens must be adjacent)
SELECT title FROM articles
WHERE search_vector @@ phraseto_tsquery('english', 'database performance');

-- Proximity search (within N words)
SELECT title FROM articles
WHERE search_vector @@ to_tsquery('english', 'database <3> performance');
-- "database" within 3 positions of "performance"
```

এই কারণেই `tsvector`-এ position স্টোর করা হয় — এগুলো phrase আর proximity query সম্ভব করে।

## Fuzzy Search

typo থাকা সত্ত্বেও ম্যাচ করা ("databse" → "database"):

```sql
-- Postgres pg_trgm: trigram similarity
CREATE EXTENSION pg_trgm;

SELECT title, similarity(title, 'databse queries') AS sim
FROM articles
WHERE similarity(title, 'databse queries') > 0.3
ORDER BY sim DESC;

-- GiST index for performance
CREATE INDEX articles_title_trgm ON articles USING GIST(title gist_trgm_ops);
```

Trigram টেক্সটকে ৩-অক্ষরের সিকোয়েন্সে ভাগ করে ("dat", "ata", "tab", "aba", ...) আর overlap তুলনা করে। ৮০% শেয়ার্ড trigram থাকা একটা স্ট্রিংকে similar ধরা হয়।

ডেডিকেটেড search engine-গুলো fuzzy matching ভালো হ্যান্ডল করে — Meilisearch আর Typesense-এ configurable distance-সহ বিল্ট-ইন typo tolerance আছে।

## The Search Pipeline

প্রতিটা search engine মূলত এই pipeline-টাই:

```
Input text
    ↓
Tokenize (split into words)
    ↓
Normalize (lowercase, remove punctuation)
    ↓
Filter stopwords
    ↓
Stem / lemmatize
    ↓
Index terms → inverted index (at index time)
    OR
Match terms → retrieve posting lists (at query time)
    ↓
Rank results (BM25, TF-IDF, custom scoring)
    ↓
Apply filters (facets, ranges)
    ↓
Paginate and return
```

এই pipeline বোঝা ব্যাখ্যা করে কেন ডেডিকেটেড search engine আছে: প্রতিটা ধাপ configure, tune আর extend করা যায় — language-specific analyzer, custom token filter, synonym expansion, field অনুযায়ী boosting, document-level scoring signal (popularity, recency)। Postgres বেসিকগুলো কভার করে; Elasticsearch আর Meilisearch পুরো pipeline-টা এক্সপোজ করে।
