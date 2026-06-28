---
title: 'Postgres Full-Text Search'
subtitle: 'tsvector, GIN indexes, ranking, highlighting, and when Postgres search is all you need.'
chapter: 2
level: 'beginner'
readingTime: '10 min'
topics: ['PostgreSQL', 'full-text search', 'tsvector', 'GIN', 'ts_rank', 'ts_headline']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A reference librarian who also manages the card catalogue: they know the collection inside out, can search it intelligently, and you don't need a separate specialist. Postgres full-text search is that librarian — already in your stack, no extra service to run, no sync to maintain. Good enough for most applications.

</Callout>

## When Postgres FTS Is Enough

Use Postgres full-text search when:

- Your searchable data is already in Postgres
- You need basic keyword search (not typo tolerance, not ML-based ranking)
- You don't need faceted search with real-time facet counts
- Your document corpus is &lt; 10M rows
- Operational simplicity matters more than search feature richness

Use a dedicated search engine (Meilisearch, Elasticsearch) when:

- You need typo tolerance out of the box
- You need facets with counts and filtering
- You need sub-100ms search at high QPS on large corpora
- You need relevance tuning, synonyms, or personalization

For most SaaS products, Postgres FTS handles the "search my data" use case adequately.

## Schema Design for Search

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

`setweight` assigns importance: 'A' > 'B' > 'C' > 'D'. A match in the title (weight A) scores higher than the same match in the body (weight C). This is how you implement "title matches matter more."

## Basic Search Queries

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

## Handling User Input Safely

User input can't be fed directly into `to_tsquery` — it'll throw on special characters:

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

The recency boost: `1 / (1 + days_old)` gives a recent article a multiplier > 1, an old one &lt; 1. Adjust the denominator to tune decay speed.

## Highlighting (Snippets)

Show users which part of the document matched:

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

`ts_headline` finds the most relevant excerpt and wraps matched terms in your chosen HTML tags.

## Autocomplete

Prefix search for "search as you type":

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

For better autocomplete (typo-tolerant), maintain a separate terms table:

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

## Combining with Filters

FTS integrates naturally with SQL filters:

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

Postgres uses the GIN index for text search and the regular indexes for category/date — the query planner combines them efficiently.

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

For tables with > 1M rows and high query rates, consider using a materialized view with pre-computed search vectors across joined tables, refreshed periodically.

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
