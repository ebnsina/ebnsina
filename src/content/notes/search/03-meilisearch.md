---
title: 'Meilisearch'
subtitle: 'Self-hosting, indexing documents, typo tolerance, faceted search, and keeping Meilisearch in sync with your database.'
chapter: 3
level: 'beginner'
readingTime: '11 min'
topics: ['Meilisearch', 'typo tolerance', 'facets', 'indexing', 'self-hosted', 'sync']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A specialist search consultant hired by the library: they set up a separate, purpose-built card system optimized purely for finding things fast — typo-tolerant, faceted by genre and year, with relevance tuning. The main catalogue (Postgres) remains authoritative; the consultant's system is the search interface layered on top.

</Callout>

## Why Meilisearch

Meilisearch is a Rust-based search engine optimized for developer experience:

- Typo tolerance out of the box (1 typo for 5+ char words by default)
- Sub-100ms search even on millions of documents
- Facets with counts, filter, and sort — all configured per index
- Simple JSON API — no query DSL to learn
- Single binary, easy to self-host

Compared to Elasticsearch: Meilisearch is simpler, faster to set up, but less configurable. Elasticsearch handles petabyte-scale and complex aggregations; Meilisearch handles "search my product catalog" without a PhD in Lucene.

## Running Meilisearch

```bash
# Docker
docker run -d \
  --name meilisearch \
  -p 7700:7700 \
  -e MEILI_MASTER_KEY="your-master-key" \
  -v $(pwd)/meili_data:/meili_data \
  getmeili/meilisearch:latest

# Docker Compose
services:
  meilisearch:
    image: getmeili/meilisearch:latest
    ports: ["7700:7700"]
    environment:
      MEILI_MASTER_KEY: "your-master-key"
      MEILI_ENV: production
      MEILI_DB_PATH: /meili_data
    volumes:
      - meili_data:/meili_data
    restart: unless-stopped
```

```bash
# Verify
curl http://localhost:7700/health
# {"status":"available"}
```

## Creating an Index and Configuring Settings

```typescript
import MeiliSearch from 'meilisearch';

const client = new MeiliSearch({
	host: 'http://localhost:7700',
	apiKey: 'your-master-key'
});

// Create index
const index = client.index('products');

// Configure settings (do this before indexing)
await index.updateSettings({
	// Which fields are searchable and their relative importance
	searchableAttributes: [
		'name', // highest priority
		'brand',
		'description',
		'tags'
	],

	// Which fields can be used to filter/facet
	filterableAttributes: ['category', 'brand', 'price_cents', 'in_stock', 'tags'],

	// Which fields can be sorted
	sortableAttributes: ['price_cents', 'created_at', 'popularity'],

	// Relevance ranking (order matters)
	rankingRules: [
		'words', // documents with more query words rank higher
		'typo', // fewer typos = higher rank
		'proximity', // closer query words = higher rank
		'attribute', // match in searchableAttributes[0] > [1] > [2]
		'sort', // custom sort fields
		'exactness', // exact match > prefix match
		'popularity:desc' // custom ranking field (inject popularity score)
	],

	// Typo tolerance configuration
	typoTolerance: {
		enabled: true,
		minWordSizeForTypos: {
			oneTypo: 5, // allow 1 typo for words >= 5 chars
			twoTypos: 9 // allow 2 typos for words >= 9 chars
		}
	},

	// Stop words (don't index/search these)
	stopWords: ['the', 'a', 'an', 'and', 'or', 'but'],

	// Synonyms
	synonyms: {
		tv: ['television', 'screen'],
		laptop: ['notebook', 'portable computer']
	}
});
```

## Indexing Documents

```typescript
// Index documents (upsert — safe to re-run)
await index.addDocuments(
	[
		{
			id: 'prod-123', // required — Meilisearch's primary key
			name: 'MacBook Pro 14"',
			brand: 'Apple',
			category: 'laptops',
			description: 'M3 chip, 18GB RAM, 512GB SSD',
			price_cents: 199900,
			in_stock: true,
			tags: ['laptop', 'apple', 'pro'],
			popularity: 9500,
			created_at: '2024-01-01T00:00:00Z'
		}
		// ...
	],
	{ primaryKey: 'id' }
);

// Check indexing status
const task = await index.addDocuments(documents);
const status = await client.waitForTask(task.taskUid);
console.log(status.status); // 'succeeded'

// Update single document
await index.updateDocuments([{ id: 'prod-123', price_cents: 189900 }]);

// Delete
await index.deleteDocument('prod-123');
```

## Searching

```typescript
// Basic search
const results = await index.search('macbook pro');
console.log(results.hits);
// [{ id: 'prod-123', name: 'MacBook Pro 14"', ... }]
console.log(results.processingTimeMs); // e.g., 3ms

// With filters and facets
const results = await index.search('laptop', {
	filter: ['category = "laptops"', 'price_cents < 200000', 'in_stock = true'],
	sort: ['price_cents:asc'],
	limit: 20,
	offset: 0,
	facets: ['brand', 'category', 'tags'],
	attributesToHighlight: ['name', 'description'],
	highlightPreTag: '<mark>',
	highlightPostTag: '</mark>',
	attributesToCrop: ['description'],
	cropLength: 100
});

console.log(results.facetDistribution);
// {
//   brand: { Apple: 45, Dell: 23, HP: 18 },
//   category: { laptops: 86 },
//   tags: { laptop: 86, apple: 45, pro: 32 }
// }

// Typo tolerance in action
const results2 = await index.search('macbok pro'); // "macbok" typo
// Still finds MacBook Pro — typo tolerance at work
```

```typescript
// API route
app.get('/search', async (req, res) => {
	const { q = '', category, minPrice, maxPrice, sort = 'popularity:desc', page = 1 } = req.query;

	const filters: string[] = [];
	if (category) filters.push(`category = "${category}"`);
	if (minPrice) filters.push(`price_cents >= ${Number(minPrice) * 100}`);
	if (maxPrice) filters.push(`price_cents <= ${Number(maxPrice) * 100}`);
	filters.push('in_stock = true');

	const results = await index.search(q as string, {
		filter: filters.join(' AND '),
		sort: [sort as string],
		facets: ['brand', 'category'],
		limit: 20,
		offset: (Number(page) - 1) * 20
	});

	res.json({
		hits: results.hits,
		total: results.estimatedTotalHits,
		facets: results.facetDistribution,
		processingTimeMs: results.processingTimeMs
	});
});
```

## Keeping Meilisearch in Sync

Meilisearch is a read-optimized secondary index. Postgres is authoritative. Sync strategies:

**1. Write-through (sync on every write):**

```typescript
async function createProduct(product: Product): Promise<Product> {
	const saved = await db.create(product);

	// Index in Meilisearch (fire-and-forget — ok if it fails, background job retries)
	index
		.addDocuments([productToSearchDoc(saved)])
		.catch((err) => log.error({ err, productId: saved.id }, 'Meilisearch sync failed'));

	return saved;
}
```

Simple but fragile — if Meilisearch is down, the sync is lost.

**2. Outbox pattern (reliable sync):**

```typescript
// On write: record intent to sync
await db.transaction(async (tx) => {
	const product = await tx.create(product);
	await tx.query(
		'INSERT INTO search_sync_queue (entity_type, entity_id, operation) VALUES ($1, $2, $3)',
		['product', product.id, 'upsert']
	);
});

// Background worker: process sync queue
async function processSyncQueue() {
	const batch = await db.query(
		`SELECT * FROM search_sync_queue
     WHERE processed_at IS NULL
     ORDER BY created_at
     LIMIT 100
     FOR UPDATE SKIP LOCKED`
	);

	if (batch.rows.length === 0) return;

	const toUpsert = batch.rows.filter((r) => r.operation === 'upsert');
	const toDelete = batch.rows.filter((r) => r.operation === 'delete');

	if (toUpsert.length > 0) {
		const products = await db.query('SELECT * FROM products WHERE id = ANY($1)', [
			toUpsert.map((r) => r.entity_id)
		]);
		await index.addDocuments(products.rows.map(productToSearchDoc));
	}

	if (toDelete.length > 0) {
		await index.deleteDocuments(toDelete.map((r) => r.entity_id));
	}

	await db.query('UPDATE search_sync_queue SET processed_at = NOW() WHERE id = ANY($1)', [
		batch.rows.map((r) => r.id)
	]);
}

setInterval(processSyncQueue, 5000);
```

**3. Full reindex (scheduled):**

```typescript
async function fullReindex() {
	let offset = 0;
	const batchSize = 1000;

	while (true) {
		const products = await db.query('SELECT * FROM products ORDER BY id LIMIT $1 OFFSET $2', [
			batchSize,
			offset
		]);
		if (products.rows.length === 0) break;

		await index.addDocuments(products.rows.map(productToSearchDoc));
		offset += batchSize;
	}

	log.info({ offset }, 'Full reindex complete');
}

// Run nightly as a safety net
new CronJob('0 2 * * *', fullReindex).start();
```

## Multi-Tenant Search

Separate index per tenant (small tenants) or filter by tenant ID (large tenants):

```typescript
// Small SaaS: one index per tenant
function getTenantIndex(tenantId: string) {
	return client.index(`products_${tenantId}`);
}

// Large SaaS: shared index with tenant filter
const results = await index.search(query, {
	filter: [`tenant_id = "${tenantId}"`]
	// tenant_id must be in filterableAttributes
});
```

Separate indexes provide perfect isolation but multiply operational overhead. Shared index with filter is simpler but requires careful access control (server-side filter injection, never trust client-provided filters).

## Meilisearch API Keys for Frontend

Never expose the master key to clients. Create scoped API keys:

```typescript
const searchKey = await client.createKey({
	description: 'Frontend search — read only',
	actions: ['search'],
	indexes: ['products'],
	expiresAt: null // no expiry for production search key
});

console.log(searchKey.key); // give this to the frontend
```

Frontend can call Meilisearch directly — zero latency from bypassing your backend — while the master key stays server-side.
