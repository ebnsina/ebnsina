---
title: "How Search Works"
subtitle: "Inverted indexes, tokenization, TF-IDF, BM25 — the mechanics behind every search engine from Postgres full-text to Elasticsearch."
chapter: 1
level: "beginner"
readingTime: "9 min"
topics: ["inverted index", "tokenization", "TF-IDF", "BM25", "full-text search", "relevance"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A book's index at the back: instead of reading every page to find mentions of "database," you flip to the index, find "database: pages 12, 47, 203," and jump straight there. An inverted index is that same structure — a mapping from every word to the documents containing it — built for every document in your collection.

</Callout>

## The Inverted Index

A database query scans rows. A search engine uses an inverted index: a map from terms to document IDs.

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

Query "database fast": find intersection of `database → [1, 2]` and `fast → [1, 3]` → document 1. No scanning needed.

## Tokenization and Normalization

Before indexing, text is processed into tokens:

```
Input: "The FASTEST Database Queries!"

1. Lowercase:       "the fastest database queries!"
2. Tokenize:        ["the", "fastest", "database", "queries"]
3. Remove stopwords: ["fastest", "database", "queries"]
4. Stem/lemmatize:  ["fast", "databas", "queri"]  ← root forms
   (or keep: "fastest", "database", "queries")
```

**Stemming** reduces words to root forms (running → run, databases → databas). Imprecise but catches variants.

**Lemmatization** reduces to dictionary form (running → run, better → good). More accurate but slower.

**Stopwords** (the, a, is, at) add noise without aiding search — filtered before indexing.

The same pipeline runs at query time: the search term goes through the same normalization so "DATABASES" finds documents indexed under "databas".

## Building a Minimal Inverted Index

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
      .filter(t => t.length > 2);   // naive stopword removal
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
      results = results === null
        ? new Set(posting)
        : new Set([...results].filter(id => posting.has(id)));
    }

    return [...(results ?? [])].map(id => this.documents.get(id)!);
  }
}

const idx = new InvertedIndex();
idx.add("fast database queries");
idx.add("optimizing database performance");
idx.add("fast query optimization");

idx.search("database fast");   // → ["fast database queries"]
idx.search("database");        // → ["fast database queries", "optimizing database performance"]
```

This is the core of every search engine — the rest is relevance ranking, scalability, and features.

## Relevance: TF-IDF

All matching documents are not equally relevant. A document mentioning "database" 10 times is more relevant than one mentioning it once. But "the" appears in every document — its presence doesn't signal relevance.

**TF (Term Frequency):** how often does the term appear in this document?
```
TF("database", doc1) = 1/3 = 0.33   (1 occurrence, 3 words)
TF("database", doc2) = 1/4 = 0.25
```

**IDF (Inverse Document Frequency):** how rare is this term across all documents?
```
IDF("database") = log(3 / 2) = 0.18   (3 docs total, 2 contain "database")
IDF("fast")     = log(3 / 2) = 0.18
IDF("the")      = log(3 / 3) = 0       (in every doc → zero signal)
```

**TF-IDF score:**
```
score(doc1, "database") = TF × IDF = 0.33 × 0.18 = 0.059
```

Documents are ranked by their TF-IDF score sum across all query terms.

## BM25 (Better Matching 25)

Modern search engines use BM25 — an improvement over TF-IDF that handles document length variation:

```
BM25(q, d) = Σ IDF(qi) × (TF(qi, d) × (k1 + 1)) / (TF(qi, d) + k1 × (1 - b + b × |d| / avgdl))

k1 = 1.2 to 2.0   (term frequency saturation — prevents very high TF from dominating)
b = 0.75           (length normalization — longer docs don't get unfair advantage)
avgdl = average document length
```

In plain terms: BM25 gives higher scores to documents where:
- The term appears frequently (but with diminishing returns)
- The document is shorter relative to average (a short doc mentioning "database" twice is more focused than a long doc mentioning it twice)

Elasticsearch, Meilisearch, Typesense, and Postgres FTS all use BM25 or a variant.

## What Postgres Full-Text Search Does

Postgres has a built-in full-text search implementation:

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

Postgres FTS is excellent for simple search on existing Postgres data. It lacks features like typo tolerance, faceting, synonym handling, and the relevance tuning that dedicated search engines provide.

## Phrase Search and Proximity

Beyond simple token matching — finding "database performance" as a phrase, not just documents containing both words anywhere:

```sql
-- Phrase search (tokens must be adjacent)
SELECT title FROM articles
WHERE search_vector @@ phraseto_tsquery('english', 'database performance');

-- Proximity search (within N words)
SELECT title FROM articles
WHERE search_vector @@ to_tsquery('english', 'database <3> performance');
-- "database" within 3 positions of "performance"
```

This is why positions are stored in `tsvector` — they enable phrase and proximity queries.

## Fuzzy Search

Matching despite typos ("databse" → "database"):

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

Trigrams split text into 3-character sequences ("dat", "ata", "tab", "aba", ...) and compare overlap. A string with 80% shared trigrams is considered similar.

Dedicated search engines handle fuzzy matching better — Meilisearch and Typesense have built-in typo tolerance with configurable distance.

## The Search Pipeline

Every search engine is fundamentally this pipeline:

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

Understanding this pipeline explains why dedicated search engines exist: each step can be configured, tuned, and extended — language-specific analyzers, custom token filters, synonym expansion, boosting by field, document-level scoring signals (popularity, recency). Postgres covers the basics; Elasticsearch and Meilisearch expose the full pipeline.

