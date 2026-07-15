---
title: 'Postgres Full-Text Search'
subtitle: 'tsvector, GIN index, ranking, highlighting, এবং কখন Postgres search-ই আপনার প্রয়োজনের সব।'
chapter: 2
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['PostgreSQL', 'full-text search', 'tsvector', 'GIN', 'ts_rank', 'ts_headline']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

কর্ডোবার পুরনো লাইব্রেরিতে ফাতিমা আল-ফিহরি নতুন বই তাকে তোলার আগে একটা কাজ করেন — বইয়ের প্রতিটা শব্দ তিনি তার মূল রূপে নামিয়ে আনেন। "দৌড়াচ্ছে", "দৌড়াল", "দৌড়ায়" — তিনটাই তিনি এক জায়গায়, "দৌড়" শব্দের নিচে লিখে রাখেন। আর "এর", "ও", "একটা" — এই ভরাট শব্দগুলো তিনি একদম বাদ দিয়ে দেন, কারণ ওগুলো দিয়ে তো কেউ বই খোঁজে না। শেষমেশ তার হাতে থাকে একটা পরিষ্কার তালিকা: প্রতিটা শব্দ-মূলের পাশে ঠিক কোন কোন বইয়ে সেটা আছে তার লিস্ট।

কেউ এসে যখন কিছু খোঁজেন, ফাতিমা পুরো লাইব্রেরি হাঁটেন না। তিনি খোঁজার শব্দটাকেও মূলে নামান, তারপর তার তালিকা থেকে সোজা সেই বইগুলো বের করেন — আর যে বইয়ে শব্দটা যত বেশিবার, যত বেশি গুরুত্বপূর্ণ জায়গায় আছে, সেটাকেই সবার উপরে সাজিয়ে দেন। মজার ব্যাপার, এই পুরো কাজটা তিনি করেন লাইব্রেরির নিজের পুরনো ক্যাটালগ ঘরেই — খোঁজার জন্য আলাদা নতুন কোনো বিশেষ ভবন তোলার দরকার তার হয় না।

এই গল্পটাই আসলে Postgres full-text search। শব্দকে মূল রূপে নামানোটাই **stemming** (আর মূল রূপগুলোই **lexeme**), ভরাট শব্দ বাদ দেওয়াটাই **stop-word** removal, শব্দ-মূল → বইয়ের সেই তালিকাটাই **tsvector** inverted index, আর সেরা ম্যাচ আগে সাজানোটাই relevance **ranking**। আর সবচেয়ে বড় কথা — ফাতিমা যেমন নিজের ক্যাটালগ ঘরেই সব করেন, তেমনি এই পুরো search আপনার existing **Postgres**-এর ভেতরেই হয়, আলাদা কোনো search engine লাগে না। বাস্তবে GitHub-এর issue search বা অসংখ্য SaaS প্রোডাক্ট ঠিক এভাবেই Elasticsearch ছাড়াই কেবল Postgres দিয়ে "আমার ডেটা সার্চ করো" চাহিদাটা মেটায়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন reference লাইব্রেরিয়ান যিনি কার্ড ক্যাটালগও সামলান: তিনি কালেকশন খুঁটিনাটি চেনেন, বুদ্ধিমত্তার সাথে সার্চ করতে পারেন, আর আপনার আলাদা কোনো বিশেষজ্ঞ লাগে না। Postgres full-text search হলো সেই লাইব্রেরিয়ান — ইতিমধ্যেই আপনার স্ট্যাকে আছে, চালানোর জন্য বাড়তি কোনো সার্ভিস নেই, মেইনটেইন করার কোনো সিঙ্ক নেই। বেশিরভাগ অ্যাপ্লিকেশনের জন্য যথেষ্ট ভালো।

</Callout>

## কখন Postgres FTS যথেষ্ট

Postgres full-text search ব্যবহার করুন যখন:

- আপনার সার্চযোগ্য ডেটা ইতিমধ্যেই Postgres-এ আছে
- আপনার বেসিক keyword search দরকার (typo tolerance না, ML-ভিত্তিক ranking না)
- আপনার real-time facet count-সহ faceted search দরকার নেই
- আপনার document corpus &lt; 10M row
- feature richness-এর চেয়ে অপারেশনাল সরলতা বেশি গুরুত্বপূর্ণ

একটা ডেডিকেটেড search engine (Meilisearch, Elasticsearch) ব্যবহার করুন যখন:

- আপনার আউট-অফ-দ্য-বক্স typo tolerance দরকার
- আপনার count আর filtering-সহ facet দরকার
- বড় corpus-এ high QPS-এ আপনার sub-100ms search দরকার
- আপনার relevance tuning, synonym বা personalization দরকার

বেশিরভাগ SaaS প্রোডাক্টের জন্য Postgres FTS "আমার ডেটা সার্চ করো" ইউজ-কেসটা যথেষ্ট ভালোভাবে হ্যান্ডল করে।

## Search-এর জন্য Schema ডিজাইন

```sql
-- Articles table with generated search vector
CREATE TABLE articles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  author      TEXT,
  tags        TEXT[],
  published_at TIMESTAMPTZ,
  -- Generated tsvector — automatically updated on title/body change
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C')
  ) STORED
);

-- GIN index on the vector
CREATE INDEX articles_search_idx ON articles USING GIN(search_vector);
```

`setweight` গুরুত্ব বরাদ্দ করে: 'A' > 'B' > 'C' > 'D'। title-এ একটা ম্যাচ (weight A) body-তে একই ম্যাচের (weight C) চেয়ে বেশি score পায়। এভাবেই আপনি "title-এর ম্যাচ বেশি গুরুত্বপূর্ণ" ইমপ্লিমেন্ট করেন।

## বেসিক Search Query

```sql
-- Simple keyword search
SELECT id, title, published_at
FROM articles
WHERE search_vector @@ to_tsquery('english', 'database')
ORDER BY published_at DESC
LIMIT 20;

-- Multiple terms (AND)
SELECT id, title
FROM articles
WHERE search_vector @@ to_tsquery('english', 'database & performance')
ORDER BY published_at DESC;

-- Multiple terms (OR)
SELECT id, title
FROM articles
WHERE search_vector @@ to_tsquery('english', 'database | cache')
ORDER BY published_at DESC;

-- Phrase search (adjacent terms)
SELECT id, title
FROM articles
WHERE search_vector @@ phraseto_tsquery('english', 'query optimization');

-- Prefix search (term begins with)
SELECT id, title
FROM articles
WHERE search_vector @@ to_tsquery('english', 'datab:*');
-- Matches: database, databases, databas
```

## User Input নিরাপদে হ্যান্ডল করা

User input সরাসরি `to_tsquery`-তে দেওয়া যায় না — special character-এ এটা throw করবে:

```sql
-- WRONG — crashes on "database & !"
WHERE search_vector @@ to_tsquery('english', user_input)

-- RIGHT — plainto_tsquery normalizes arbitrary input
WHERE search_vector @@ plainto_tsquery('english', user_input)
-- "database performance" → 'databas' & 'perform'

-- websearch_to_tsquery — Google-style syntax (Postgres 11+)
WHERE search_vector @@ websearch_to_tsquery('english', user_input)
-- Supports: "exact phrase", -exclude, OR
-- "database performance" -cache → 'databas' & 'perform' & !'cache'
```

```typescript
// Application code
async function searchArticles(query: string, limit = 20): Promise<Article[]> {
	const result = await db.query(
		`SELECT id, title, published_at,
            ts_rank(search_vector, query) AS rank
     FROM articles,
          websearch_to_tsquery('english', $1) query
     WHERE search_vector @@ query
     ORDER BY rank DESC
     LIMIT $2`,
		[query, limit]
	);
	return result.rows;
}
```

## Ranking

```sql
-- ts_rank: basic ranking by term frequency in document
SELECT title, ts_rank(search_vector, query) AS rank
FROM articles, to_tsquery('english', 'database') query
WHERE search_vector @@ query
ORDER BY rank DESC;

-- ts_rank_cd: considers term proximity (cover density ranking)
SELECT title, ts_rank_cd(search_vector, query) AS rank
FROM articles, to_tsquery('english', 'database & performance') query
WHERE search_vector @@ query
ORDER BY rank DESC;

-- Boost by recency (combine text rank with time signal)
SELECT title,
  ts_rank(search_vector, query) *
  (1.0 / (1 + EXTRACT(EPOCH FROM (NOW() - published_at)) / 86400)) AS boosted_rank
FROM articles, websearch_to_tsquery('english', 'database') query
WHERE search_vector @@ query
ORDER BY boosted_rank DESC
LIMIT 20;
```

Recency boost: `1 / (1 + days_old)` একটা সাম্প্রতিক আর্টিকেলকে একটা multiplier > 1 দেয়, একটা পুরনোটাকে &lt; 1। decay-এর গতি tune করতে denominator অ্যাডজাস্ট করুন।

## Highlighting (Snippet)

ইউজারদের দেখান ডকুমেন্টের কোন অংশ ম্যাচ করল:

```sql
SELECT
  title,
  ts_headline(
    'english',
    body,
    query,
    'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=15, ShortWord=3'
  ) AS snippet
FROM articles, websearch_to_tsquery('english', 'database performance') query
WHERE search_vector @@ query
ORDER BY ts_rank(search_vector, query) DESC
LIMIT 10;
```

```
snippet:
"...optimizing <mark>database</mark> <mark>performance</mark> requires understanding
 how queries are executed and which indexes..."
```

`ts_headline` সবচেয়ে relevant অংশটা খুঁজে বের করে আর ম্যাচ করা term-গুলোকে আপনার বেছে নেওয়া HTML tag-এ মুড়ে দেয়।

## Autocomplete

"টাইপ করার সাথে সাথে সার্চ"-এর জন্য prefix search:

```sql
-- Index for prefix search
CREATE INDEX articles_title_trgm ON articles USING GIN(title gin_trgm_ops);
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Fast prefix autocomplete
SELECT DISTINCT title
FROM articles
WHERE title ILIKE $1 || '%'
ORDER BY title
LIMIT 10;

-- Or using ts_lexize for prefix matching in tsvector
SELECT DISTINCT title
FROM articles
WHERE search_vector @@ to_tsquery('english', $1 || ':*')
LIMIT 10;
```

আরও ভালো autocomplete-এর জন্য (typo-tolerant), একটা আলাদা terms table রাখুন:

```sql
CREATE TABLE search_terms (
  term    TEXT PRIMARY KEY,
  count   INT DEFAULT 1   -- how often searched
);

-- Populate from successful searches
INSERT INTO search_terms (term, count)
VALUES ($1, 1)
ON CONFLICT (term) DO UPDATE SET count = search_terms.count + 1;

-- Autocomplete query
SELECT term
FROM search_terms
WHERE term ILIKE $1 || '%'
ORDER BY count DESC, term
LIMIT 10;
```

## Multi-Language Support

```sql
-- English (default)
to_tsvector('english', 'The database is running')
-- 'databas':2 'run':4

-- French
to_tsvector('french', 'La base de données est rapide')
-- 'base':2 'données':4 'rapid':6

-- Auto-detect language (store language per document)
ALTER TABLE articles ADD COLUMN language regconfig DEFAULT 'english';

-- Dynamic language in vector
ALTER TABLE articles DROP COLUMN search_vector;
ALTER TABLE articles ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector(language, coalesce(title, '') || ' ' || coalesce(body, ''))
  ) STORED;
```

## Filter-এর সাথে সমন্বয়

FTS স্বাভাবিকভাবেই SQL filter-এর সাথে ইন্টিগ্রেট হয়:

```sql
-- Search within a category and date range
SELECT id, title, ts_rank(search_vector, query) AS rank
FROM articles, websearch_to_tsquery('english', $1) query
WHERE search_vector @@ query
  AND category = $2
  AND published_at > NOW() - INTERVAL '30 days'
ORDER BY rank DESC
LIMIT 20;
```

Postgres টেক্সট search-এর জন্য GIN index আর category/date-এর জন্য নিয়মিত index ব্যবহার করে — query planner এগুলোকে দক্ষতার সাথে সমন্বয় করে।

## Performance

```sql
-- Check index usage
EXPLAIN ANALYZE
SELECT id, title FROM articles
WHERE search_vector @@ to_tsquery('english', 'database');

-- Should show: Bitmap Index Scan on articles_search_idx
-- NOT: Seq Scan on articles

-- GIN vs GiST:
-- GIN: faster queries, slower updates, larger index
-- GiST: faster updates, slower queries, smaller index
-- Use GIN for most search workloads (reads >> writes)
```

> 1M row আর high query rate-এর table-এর জন্য, joined table জুড়ে pre-computed search vector-সহ একটা materialized view ব্যবহারের কথা ভাবুন, যা পর্যায়ক্রমে refresh করা হয়।

```sql
-- Materialized view for complex multi-table search
CREATE MATERIALIZED VIEW article_search AS
SELECT
  a.id,
  a.title,
  a.published_at,
  u.name AS author_name,
  setweight(to_tsvector('english', a.title), 'A') ||
  setweight(to_tsvector('english', coalesce(u.name, '')), 'B') ||
  setweight(to_tsvector('english', a.body), 'C') AS search_vector
FROM articles a
LEFT JOIN users u ON u.id = a.author_id;

CREATE INDEX article_search_vector_idx ON article_search USING GIN(search_vector);

-- Refresh after bulk imports or on a schedule
REFRESH MATERIALIZED VIEW CONCURRENTLY article_search;
```
