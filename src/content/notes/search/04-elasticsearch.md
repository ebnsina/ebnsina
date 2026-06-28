---
title: 'Elasticsearch'
subtitle: "Mappings, analyzers, the Query DSL, aggregations, and running a production cluster — for when Meilisearch isn't enough."
chapter: 4
level: 'intermediate'
readingTime: '12 min'
topics: ['Elasticsearch', 'mappings', 'analyzers', 'Query DSL', 'aggregations', 'cluster']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A university research library vs a bookstore: the bookstore (Meilisearch) is fast, well-organized for browsing, good for most searches. The research library (Elasticsearch) has specialized cataloguing, subject librarians, cross-referencing, complex aggregations, and handles the full academic corpus. More powerful, more complex to operate, more to configure correctly.

</Callout>

## When to Use Elasticsearch

- Full-text search on billions of documents
- Complex aggregations (histograms, geo-distance, nested objects)
- Log and event analytics (Elastic stack: ELK)
- Multi-language search with custom analyzers
- Complex relevance tuning (function scoring, scripted scoring)
- Percolator (reverse search: match documents against stored queries)

Meilisearch for product search, Elasticsearch for analytics and petabyte-scale.

## Running Elasticsearch

```yaml
# docker-compose.yml — single node for development
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.12.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false # disable for dev; MUST enable in production
      - ES_JAVA_OPTS=-Xms2g -Xmx2g
    ports:
      - '9200:9200'
    volumes:
      - es_data:/usr/share/elasticsearch/data
    ulimits:
      memlock:
        soft: -1
        hard: -1
```

```bash
# Verify
curl http://localhost:9200/_cluster/health?pretty
```

## Mappings (Schema)

Unlike Meilisearch, Elasticsearch requires explicit mappings for production use. Dynamic mappings (auto-detection) cause type conflicts and poor performance.

```typescript
import { Client } from '@elastic/elasticsearch';

const es = new Client({ node: 'http://localhost:9200' });

// Create index with mappings
await es.indices.create({
	index: 'products',
	body: {
		settings: {
			number_of_shards: 3,
			number_of_replicas: 1,
			analysis: {
				analyzer: {
					product_analyzer: {
						type: 'custom',
						tokenizer: 'standard',
						filter: ['lowercase', 'asciifolding', 'english_stop', 'english_stemmer']
					},
					autocomplete_analyzer: {
						type: 'custom',
						tokenizer: 'standard',
						filter: ['lowercase', 'autocomplete_filter']
					},
					autocomplete_search_analyzer: {
						type: 'custom',
						tokenizer: 'standard',
						filter: ['lowercase']
					}
				},
				filter: {
					english_stop: { type: 'stop', stopwords: '_english_' },
					english_stemmer: { type: 'stemmer', language: 'english' },
					autocomplete_filter: {
						type: 'edge_ngram', // prefix n-grams for autocomplete
						min_gram: 2,
						max_gram: 20
					}
				}
			}
		},
		mappings: {
			properties: {
				id: { type: 'keyword' }, // exact match, no analysis
				name: {
					type: 'text',
					analyzer: 'product_analyzer',
					fields: {
						autocomplete: {
							// sub-field for autocomplete
							type: 'text',
							analyzer: 'autocomplete_analyzer',
							search_analyzer: 'autocomplete_search_analyzer'
						},
						keyword: { type: 'keyword' } // sub-field for exact/sort
					}
				},
				brand: { type: 'keyword' },
				category: { type: 'keyword' },
				description: { type: 'text', analyzer: 'product_analyzer' },
				tags: { type: 'keyword' },
				price_cents: { type: 'integer' },
				in_stock: { type: 'boolean' },
				popularity: { type: 'integer' },
				created_at: { type: 'date' },
				location: {
					type: 'geo_point' // geographic coordinates
				}
			}
		}
	}
});
```

## Indexing Documents

```typescript
// Single document
await es.index({
	index: 'products',
	id: 'prod-123',
	document: {
		id: 'prod-123',
		name: 'MacBook Pro 14"',
		brand: 'Apple',
		category: 'laptops',
		description: 'M3 chip, 18GB RAM, 512GB SSD',
		tags: ['laptop', 'apple', 'pro'],
		price_cents: 199900,
		in_stock: true,
		popularity: 9500,
		created_at: '2024-01-01T00:00:00Z'
	}
});

// Bulk indexing (preferred for large imports)
const operations = documents.flatMap((doc) => [
	{ index: { _index: 'products', _id: doc.id } },
	doc
]);

const { errors, items } = await es.bulk({ operations });
if (errors) {
	const failed = items.filter((i) => i.index?.error);
	console.error('Bulk index errors:', failed);
}
```

## Query DSL

```typescript
// Multi-field text search
const results = await es.search({
	index: 'products',
	query: {
		multi_match: {
			query: 'macbook pro',
			fields: ['name^3', 'brand^2', 'description'], // ^N = boost
			type: 'best_fields',
			fuzziness: 'AUTO' // typo tolerance
		}
	},
	from: 0,
	size: 20
});

// Boolean query with filters
const results = await es.search({
	index: 'products',
	query: {
		bool: {
			must: [
				{
					multi_match: {
						query: 'laptop',
						fields: ['name^3', 'description']
					}
				}
			],
			filter: [
				{ term: { category: 'laptops' } },
				{ term: { in_stock: true } },
				{ range: { price_cents: { lte: 200000 } } }
			],
			should: [
				{ term: { tags: 'pro' } } // boost if "pro" tag matches
			],
			boost: 1.0
		}
	},
	sort: [{ _score: 'desc' }, { popularity: 'desc' }]
});

console.log(results.hits.hits.map((h) => h._source));
console.log(results.hits.total.value); // total matching docs
```

## Aggregations

The killer feature over Meilisearch — complex analytics on search results:

```typescript
const results = await es.search({
	index: 'products',
	query: {
		bool: {
			must: [{ match: { category: 'laptops' } }],
			filter: [{ term: { in_stock: true } }]
		}
	},
	aggs: {
		// Facet counts
		brands: {
			terms: { field: 'brand', size: 20 }
		},

		// Price histogram
		price_ranges: {
			range: {
				field: 'price_cents',
				ranges: [
					{ to: 50000, key: 'under_500' },
					{ from: 50000, to: 100000, key: '500_to_1000' },
					{ from: 100000, to: 200000, key: '1000_to_2000' },
					{ from: 200000, key: 'over_2000' }
				]
			}
		},

		// Statistics
		price_stats: {
			stats: { field: 'price_cents' }
		},

		// Date histogram for charts
		sales_over_time: {
			date_histogram: {
				field: 'created_at',
				calendar_interval: 'month'
			}
		}
	},
	size: 20 // still return documents too
});

console.log(results.aggregations?.brands);
// { buckets: [{ key: 'Apple', doc_count: 45 }, { key: 'Dell', doc_count: 23 }] }
```

## Autocomplete

```typescript
// Using the edge_ngram field configured in mappings
const suggestions = await es.search({
	index: 'products',
	query: {
		match: {
			'name.autocomplete': {
				query: 'macb', // prefix
				operator: 'and'
			}
		}
	},
	_source: ['name', 'brand'],
	size: 10
});

// Or using completion suggester (faster, purpose-built for autocomplete)
// Requires 'completion' field type in mapping
```

## Production Cluster

```yaml
# 3-node cluster configuration (each node's elasticsearch.yml)
cluster.name: production-search

# Node 1:
node.name: es-node-1
node.roles: [master, data]
network.host: 10.0.0.10
discovery.seed_hosts: ['10.0.0.10', '10.0.0.11', '10.0.0.12']
cluster.initial_master_nodes: ['es-node-1', 'es-node-2', 'es-node-3']

# Enable security
xpack.security.enabled: true
xpack.security.transport.ssl.enabled: true
```

Sizing:

- Each data node: 32GB RAM minimum for production (ES uses 50% for JVM heap by default)
- JVM heap: `-Xms16g -Xmx16g` (max 32GB — beyond that G1GC pauses increase)
- SSD storage: ES is I/O intensive

**Index lifecycle management (ILM)** for log indices:

```typescript
// Automatically move indices through hot → warm → cold → delete
await es.ilm.putLifecycle({
	name: 'logs-policy',
	policy: {
		phases: {
			hot: {
				actions: {
					rollover: { max_size: '50gb', max_age: '7d' }
				}
			},
			warm: {
				min_age: '7d',
				actions: {
					shrink: { number_of_shards: 1 },
					forcemerge: { max_num_segments: 1 },
					allocate: { require: { box_type: 'warm' } }
				}
			},
			cold: {
				min_age: '30d',
				actions: { freeze: {} }
			},
			delete: {
				min_age: '90d',
				actions: { delete: {} }
			}
		}
	}
});
```

## Choosing Between Meilisearch and Elasticsearch

```
Use Meilisearch when:
  ✓ Product/content search with typo tolerance
  ✓ Faceted navigation
  ✓ < 100M documents
  ✓ Simple ops (single binary)
  ✓ Fast setup

Use Elasticsearch when:
  ✓ Log analytics (ELK stack)
  ✓ Billions of documents
  ✓ Complex aggregations (geo, date histograms, nested)
  ✓ Custom analyzers per language
  ✓ Percolator / reverse search
  ✓ Multi-index searches
```
