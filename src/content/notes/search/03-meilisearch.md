---
title: 'Meilisearch'
subtitle: 'সেল্ফ-হোস্টিং, ডকুমেন্ট indexing, typo tolerance, faceted search, এবং Meilisearch-কে আপনার ডেটাবেসের সাথে সিঙ্ক রাখা।'
chapter: 3
level: 'beginner'
readingTime: '11 মিনিট'
topics: ['Meilisearch', 'typo tolerance', 'facets', 'indexing', 'self-hosted', 'sync']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

লাইব্রেরির নিয়োগ করা একজন বিশেষজ্ঞ search কনসালট্যান্ট: তিনি একটা আলাদা, বিশেষভাবে বানানো কার্ড সিস্টেম সেট আপ করেন যা শুধুমাত্র দ্রুত জিনিস খুঁজে পাওয়ার জন্য অপ্টিমাইজড — typo-tolerant, genre আর year অনুযায়ী faceted, relevance tuning-সহ। মূল ক্যাটালগ (Postgres) authoritative থাকে; কনসালট্যান্টের সিস্টেমটা তার উপর বসানো search ইন্টারফেস।

</Callout>

## গল্পে বুঝি

সমরকন্দের এক ব্যস্ত দোকানে আল-খোয়ারিজমি নামে এক আশ্চর্য চটপটে সেলসম্যান আছেন। আপনি মুখ খুলে "চিনি..." বলতে না বলতেই তিনি কাউন্টারের সামনে চিনিগুঁড়া চাল আর চিনির প্যাকেট দুটোই নামিয়ে ফেলেছেন — পুরো শব্দটা শেষ হওয়ার অপেক্ষাও করেননি। যত টাইপ করছেন, মানে যত বলছেন, ঠিক সেই মুহূর্তেই তাক থেকে সম্ভাব্য জিনিসগুলো সামনে চলে আসছে।

আরও মজার ব্যাপার — আপনি যদি একটু ভুল করে বলেন "chinigura" কিংবা উচ্চারণ এদিক-ওদিক হয়ে যায়, আল-খোয়ারিজমি বিরক্ত হন না, "বুঝলাম না" বলেও ফিরিয়ে দেন না; তিনি ঠিক ধরে ফেলেন আপনি চিনিগুঁড়া চালই খুঁজছেন আর সেটাই এগিয়ে দেন। আর এসব করতে তাঁকে মাস মাস ট্রেনিং দিতে হয়নি — দোকানের নতুন ছেলেটাও প্রথম দিন থেকেই এভাবে কাজ করতে পারে, কারণ পদ্ধতিটা সহজ। ইবনে সিনা কিংবা ফাতিমা আল-ফিহরি যে-ই আসুক, সবাই সেকেন্ডের মধ্যে জিনিস পেয়ে যায়।

এই দোকানটাই আসলে **Meilisearch**। কথা বলা শুরু করতেই ফলাফল সামনে চলে আসা — এটাই **instant / as-you-type search** (প্রতিটা কি-স্ট্রোকে সাথে সাথে রেজাল্ট)। ভুল বলা শব্দও বুঝে ফেলা — এটাই **typo tolerance**। আর নতুন ছেলেও প্রথম দিনেই পারা — এটাই সহজ setup আর দারুণ ডেভেলপার এক্সপেরিয়েন্স, বেশি কনফিগ ছাড়াই কাজ। সেলসম্যানের গতি হলো Meilisearch-এর হালকা, ঝটপট search। বাস্তবে আপনার অ্যাপ বা সাইটের সার্চ বক্সে ইউজার যখন টাইপ করে আর সাথে সাথে (বানান ভুল হলেও) মিলিয়ে-যাওয়া ফলাফল দেখতে পায়, তখন নেপথ্যে ঠিক এই কাজটাই একটা Meilisearch index করছে।

## কেন Meilisearch

Meilisearch একটা Rust-ভিত্তিক search engine যা ডেভেলপার এক্সপেরিয়েন্সের জন্য অপ্টিমাইজড:

- আউট-অফ-দ্য-বক্স typo tolerance (ডিফল্টে 5+ char শব্দের জন্য 1 typo)
- লক্ষ লক্ষ ডকুমেন্টেও sub-100ms search
- count, filter আর sort-সহ facet — সব index অনুযায়ী configure করা
- সিম্পল JSON API — শেখার জন্য কোনো query DSL নেই
- সিঙ্গেল বাইনারি, সহজে সেল্ফ-হোস্ট করা যায়

Elasticsearch-এর তুলনায়: Meilisearch সহজ, সেট আপ করা দ্রুত, কিন্তু কম configurable। Elasticsearch petabyte-scale আর জটিল aggregation হ্যান্ডল করে; Meilisearch Lucene-এ PhD ছাড়াই "আমার প্রোডাক্ট ক্যাটালগ সার্চ করো" হ্যান্ডল করে।

## Meilisearch চালানো

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

## একটা Index বানানো এবং Settings Configure করা

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

## Document Indexing করা

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

## Meilisearch-কে সিঙ্কে রাখা

Meilisearch একটা read-optimized secondary index। Postgres authoritative। সিঙ্ক স্ট্র্যাটেজি:

**1. Write-through (প্রতিটা write-এ সিঙ্ক):**

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

সহজ কিন্তু ভঙ্গুর — Meilisearch down থাকলে সিঙ্কটা হারিয়ে যায়।

**2. Outbox pattern (নির্ভরযোগ্য সিঙ্ক):**

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

**3. Full reindex (নির্ধারিত সময়ে):**

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

প্রতি tenant-এ আলাদা index (ছোট tenant) অথবা tenant ID দিয়ে filter (বড় tenant):

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

আলাদা index পারফেক্ট আইসোলেশন দেয় কিন্তু অপারেশনাল ওভারহেড বাড়ায়। filter-সহ shared index সহজ কিন্তু সতর্ক access control দরকার (সার্ভার-সাইড filter injection, ক্লায়েন্ট-প্রদত্ত filter কখনো বিশ্বাস করবেন না)।

## Frontend-এর জন্য Meilisearch API Key

master key কখনো ক্লায়েন্টের কাছে এক্সপোজ করবেন না। scoped API key বানান:

```typescript
const searchKey = await client.createKey({
	description: 'Frontend search — read only',
	actions: ['search'],
	indexes: ['products'],
	expiresAt: null // no expiry for production search key
});

console.log(searchKey.key); // give this to the frontend
```

Frontend সরাসরি Meilisearch কল করতে পারে — আপনার backend বাইপাস করায় শূন্য latency — আর master key সার্ভার-সাইডে থাকে।
