---
title: "Search — Roadmap"
subtitle: "Build an inverted index from scratch. Then self-host Meilisearch or Elasticsearch."
chapter: 0
level: "beginner"
readingTime: "3 min"
topics: ["roadmap"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A book index vs reading every page: without an index, finding "database" means scanning every word. A search engine's inverted index maps every word to the documents containing it — lookup is instant. Understanding that structure is understanding everything that follows: why some queries are fast, why typo tolerance costs something, why facets require special data structures.

</Callout>

## What you will learn

Search is one of the most visible features in any product, and one of the most misunderstood. This track starts from how search engines actually work — inverted indexes, tokenization, BM25 scoring — then covers Postgres full-text search (good enough for most cases), Meilisearch (typo-tolerant, easy to self-host), Elasticsearch (complex aggregations, massive scale), and the practical discipline of measuring and improving search quality over time.

## Chapters in this track

1. **How Search Works** — inverted index, tokenization, TF-IDF, BM25, phrase search
2. **Postgres Full-Text Search** — tsvector, GIN indexes, ranking, highlighting, autocomplete
3. **Meilisearch** — setup, indexing, typo tolerance, facets, keeping in sync with Postgres
4. **Elasticsearch** — mappings, analyzers, Query DSL, aggregations, production cluster
5. **Search in Practice** — relevance tuning, synonyms, A/B testing, analytics, zero-results handling

