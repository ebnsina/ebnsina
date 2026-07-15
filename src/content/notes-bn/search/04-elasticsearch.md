---
title: 'Elasticsearch'
subtitle: 'Mapping, analyzer, Query DSL, aggregation, এবং একটা production cluster চালানো — যখন Meilisearch যথেষ্ট নয়।'
chapter: 4
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['Elasticsearch', 'mappings', 'analyzers', 'Query DSL', 'aggregations', 'cluster']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা আল-ফিহরি একটা জাতীয় লাইব্রেরি নেটওয়ার্কের প্রধান। এক সময় পুরো দেশের সব বইয়ের একটাই কেন্দ্রীয় ক্যাটালগ ছিল, এক বিল্ডিংয়ে রাখা। কিন্তু বইয়ের সংখ্যা কোটি ছাড়িয়ে গেল, এক বিল্ডিংয়ে আর জায়গা হয় না, একটা খোঁজ করতে গেলেই ঘণ্টার পর ঘণ্টা লেগে যায়। তাই ফাতিমা ক্যাটালগটাকে ভেঙে দেশের নানা শাখা লাইব্রেরিতে ছড়িয়ে দিলেন — বাগদাদের শাখায় এক টুকরো, কর্ডোবায় আরেক টুকরো, সমরকন্দে আরেক টুকরো। প্রতিটা শাখা পুরো ক্যাটালগের একটা করে অংশ ধরে রাখে।

এখন কেউ যখন কোনো বই খোঁজে, ফাতিমার অফিস সেই খোঁজটা একসাথে সব শাখায় পাঠিয়ে দেয়। প্রতিটা শাখা নিজের অংশটুকু একই সময়ে খুঁজে দেখে, আর সবার ফলাফল এক জায়গায় জড়ো করে পাঠকের হাতে তুলে দেওয়া হয়। শুধু "এই বইটা কোথায়" — এতটুকুই নয়; ইবনে সিনা যখন জানতে চান "গোটা দেশে দশক অনুযায়ী প্রতিটা বিষয়ে কত বই আছে", তখনও প্রতিটা শাখা নিজের অংশে হিসাব কষে, আর সেই হিসাবগুলো মিলিয়ে বিশাল একটা রিপোর্ট বেরিয়ে আসে। কিন্তু এত শাখা, এত সমন্বয় সামলাতে আল-খোয়ারিজমিকে অনেক কর্মী নিয়োগ দিতে হয়, নিয়ম-কানুন বেঁধে দিতে হয় — একটা বইয়ের দোকানের চেয়ে এটা চালানো ঢের ভারী কাজ।

এই গল্পটাই আসলে **Elasticsearch**। ক্যাটালগ ভেঙে নানা শাখায় ছড়িয়ে দেওয়াটাই index-কে **shard**-এ ভাগ করে অনেক **node**-এ রাখা (**distributed**), খোঁজ একসাথে সব শাখায় পাঠিয়ে ফলাফল মিলিয়ে দেওয়াটাই **distributed** search, আর দশক-বিষয় অনুযায়ী হিসাবগুলোই **aggregation**/**analytics**। কিন্তু এত শাখা সামলানোর কর্মী-সমন্বয়ের বোঝাটাই বাস্তবে Elasticsearch চালানোর operational ভার — একটা single binary টুলের চেয়ে অনেক বেশি খাটুনি। বাস্তবে ঠিক এভাবেই কোটি কোটি log আর event-এর উপর analytics চালানো হয় — ELK stack (Elasticsearch, Logstash, Kibana) দিয়ে বড় বড় কোম্পানি তাদের সার্ভারের log খুঁজে আর বিশ্লেষণ করে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা বিশ্ববিদ্যালয়ের গবেষণা লাইব্রেরি বনাম একটা বইয়ের দোকান: বইয়ের দোকান (Meilisearch) দ্রুত, ব্রাউজিংয়ের জন্য সুসংগঠিত, বেশিরভাগ search-এর জন্য ভালো। গবেষণা লাইব্রেরির (Elasticsearch) বিশেষায়িত ক্যাটালগিং, বিষয়ভিত্তিক লাইব্রেরিয়ান, ক্রস-রেফারেন্সিং, জটিল aggregation আছে, আর পুরো একাডেমিক corpus হ্যান্ডল করে। বেশি শক্তিশালী, চালানো বেশি জটিল, সঠিকভাবে configure করার জন্য বেশি কিছু।

</Callout>

## কখন Elasticsearch ব্যবহার করবেন

- কোটি কোটি ডকুমেন্টে full-text search
- জটিল aggregation (histogram, geo-distance, nested object)
- Log আর event analytics (Elastic stack: ELK)
- custom analyzer-সহ multi-language search
- জটিল relevance tuning (function scoring, scripted scoring)
- Percolator (reverse search: স্টোর করা query-এর সাথে ডকুমেন্ট ম্যাচ করা)

প্রোডাক্ট search-এর জন্য Meilisearch, analytics আর petabyte-scale-এর জন্য Elasticsearch।

## Elasticsearch চালানো

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

## Mapping (Schema)

Meilisearch-এর বিপরীতে, Elasticsearch production ব্যবহারের জন্য explicit mapping দাবি করে। Dynamic mapping (auto-detection) type conflict আর দুর্বল performance-এর কারণ হয়।

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

## Document Indexing করা

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

## Aggregation

Meilisearch-এর উপর কিলার ফিচার — search result-এর উপর জটিল analytics:

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

- প্রতিটা data node: production-এর জন্য ন্যূনতম 32GB RAM (ES ডিফল্টে JVM heap-এর জন্য 50% ব্যবহার করে)
- JVM heap: `-Xms16g -Xmx16g` (সর্বোচ্চ 32GB — এর বেশি হলে G1GC pause বাড়ে)
- SSD storage: ES I/O-নিবিড়

log index-এর জন্য **Index lifecycle management (ILM)**:

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

## Meilisearch এবং Elasticsearch-এর মধ্যে বেছে নেওয়া

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
