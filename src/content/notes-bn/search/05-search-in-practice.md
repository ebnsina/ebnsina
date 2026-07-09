---
title: 'Search in Practice'
subtitle: 'Relevance tuning, synonym, personalization, analytics, এবং সময়ের সাথে search-কে ভালোভাবে চালু রাখার অপারেশনাল প্যাটার্ন।'
chapter: 5
level: 'intermediate'
readingTime: '9 মিনিট'
topics:
  [
    'relevance tuning',
    'synonyms',
    'analytics',
    'A/B testing',
    'search quality',
    'click-through rate'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন নতুন reference লাইব্রেরিয়ান বনাম একজন অভিজ্ঞ লাইব্রেরিয়ান: দুজনেই "database-এর উপর বইটা কোথায়?" উত্তর দিতে পারেন, কিন্তু অভিজ্ঞজন জানেন যে মানুষ যখন "database" চায়, তারা সাধারণত relational database চায়, data warehouse না — আর স্বয়ংক্রিয়ভাবে তাদের সেদিকে গাইড করেন। Search relevance tuning হলো search engine-কে সেটাই শেখানো যা আপনার অভিজ্ঞ লাইব্রেরিয়ান আগে থেকেই জানেন।

</Callout>

## Search Quality মাপা

যা মাপেন না তা উন্নত করতে পারবেন না। ট্র্যাক করুন:

**Click-through rate (CTR):** কত শতাংশ search একটা click-এ পরিণত হয়?

```typescript
// Log search events
async function trackSearch(query: string, userId: string, results: SearchResult[]) {
	await db.query(
		`INSERT INTO search_events (query, user_id, result_ids, searched_at)
     VALUES ($1, $2, $3, NOW())`,
		[query, userId, results.map((r) => r.id)]
	);
}

// Log click events
async function trackClick(query: string, userId: string, clickedId: string, position: number) {
	await db.query(
		`INSERT INTO search_clicks (query, user_id, clicked_id, position, clicked_at)
     VALUES ($1, $2, $3, $4, NOW())`,
		[query, userId, clickedId, position]
	);
}

// CTR query
const ctr = await db.query(`
  SELECT
    e.query,
    COUNT(DISTINCT e.id) AS searches,
    COUNT(DISTINCT c.id) AS clicks,
    COUNT(DISTINCT c.id)::float / COUNT(DISTINCT e.id) AS ctr
  FROM search_events e
  LEFT JOIN search_clicks c ON c.query = e.query
    AND c.user_id = e.user_id
    AND c.clicked_at > e.searched_at
    AND c.clicked_at < e.searched_at + INTERVAL '5 minutes'
  WHERE e.searched_at > NOW() - INTERVAL '7 days'
  GROUP BY e.query
  HAVING COUNT(DISTINCT e.id) > 10
  ORDER BY ctr ASC  -- lowest CTR = worst performing queries
  LIMIT 50
`);
```

কম CTR-এর query-গুলো আপনার সবচেয়ে খারাপ পারফর্মার — ইউজার সার্চ করে, result দেখে, কিছুতেই click করে না। এগুলোই ফিক্স করার সবচেয়ে বেশি মূল্যবান query।

**Mean Reciprocal Rank (MRR):** click করা result কতটা উপরে?

```typescript
// MRR = average of (1 / position of first click)
const mrr = await db.query(`
  SELECT AVG(1.0 / c.position) AS mrr
  FROM search_clicks c
  WHERE c.clicked_at > NOW() - INTERVAL '7 days'
    AND c.position <= 10
`);
// MRR of 1.0 = always clicking first result
// MRR of 0.5 = average first click at position 2
```

**Zero-results rate:** কত শতাংশ search কোনো result দেয় না?

```typescript
const zeroResults = await db.query(`
  SELECT
    query,
    COUNT(*) AS searches
  FROM search_events
  WHERE result_count = 0
    AND searched_at > NOW() - INTERVAL '7 days'
  GROUP BY query
  ORDER BY searches DESC
  LIMIT 50
`);
```

Zero-results query-গুলো ফাঁক প্রকাশ করে: অনুপস্থিত প্রোডাক্ট, অনুপস্থিত synonym, অথবা খুব নির্দিষ্ট query যেগুলোর fuzzy matching দরকার।

## Synonym

ইউজার বলে "couch," আপনার আছে "sofa।" ইউজার বলে "laptop," আপনার আছে "notebook computer।"

```typescript
// Meilisearch synonyms
await index.updateSettings({
  synonyms: {
    'couch': ['sofa', 'settee', 'loveseat'],
    'laptop': ['notebook', 'portable computer'],
    'tv': ['television', 'monitor', 'screen'],
    'cellphone': ['mobile', 'smartphone', 'phone'],
  },
});

// Elasticsearch synonyms (more powerful — supports one-way and multi-way)
// In analyzer settings:
filter: {
  synonym_filter: {
    type: 'synonym',
    synonyms: [
      'couch, sofa, settee => couch',          // normalize to one term
      'laptop, notebook, portable computer',   // multi-way (bidirectional)
      'tv => television, tv',                  // expand tv to both
    ],
  },
},
```

Analytics থেকে synonym বানান — ইউজাররা যদি ঘন ঘন X সার্চ করে আর Y-এর একটা result-এ click করে, তাহলে X আর Y synonym হতে পারে।

## Query Rules (Curated Result)

ব্যবসায়িকভাবে curate করা result যা নির্দিষ্ট query-এর জন্য relevance override করে:

```typescript
// Meilisearch query rules
// Pin a specific product to position 1 for "macbook"
// (not directly supported in Meilisearch — use result boosting)

// Elasticsearch — pin documents at the top of results
const results = await es.search({
	index: 'products',
	query: {
		pinned: {
			ids: ['prod-123', 'prod-456'], // always first
			organic: {
				multi_match: {
					query: 'macbook',
					fields: ['name^3', 'description']
				}
			}
		}
	}
});
```

একটা database table-এ query rule ইমপ্লিমেন্ট করুন:

```sql
CREATE TABLE search_rules (
  id         UUID PRIMARY KEY,
  query      TEXT NOT NULL,       -- exact query to match
  action     TEXT NOT NULL,       -- 'pin', 'boost', 'hide', 'redirect'
  target_ids TEXT[],              -- for pin/boost/hide
  redirect   TEXT,                -- for redirect action
  priority   INT DEFAULT 0
);

-- When searching for "macbook" → pin prod-123 to top
INSERT INTO search_rules (query, action, target_ids)
VALUES ('macbook', 'pin', ARRAY['prod-123']);
```

## Personalization

ইউজারের আচরণের উপর ভিত্তি করে result boost করুন:

```typescript
async function personalizedSearch(userId: string, query: string) {
	// Get user's preferred categories based on purchase history
	const preferences = await db.query(
		`SELECT category, COUNT(*) AS count
     FROM orders
     JOIN order_items USING (order_id)
     JOIN products USING (product_id)
     WHERE user_id = $1
       AND created_at > NOW() - INTERVAL '90 days'
     GROUP BY category
     ORDER BY count DESC
     LIMIT 5`,
		[userId]
	);

	// Build category boost function
	const categoryBoosts = preferences.rows.map((p, i) => ({
		filter: { term: { category: p.category } },
		weight: 3 - i * 0.5 // 3x, 2.5x, 2x, 1.5x, 1x
	}));

	return es.search({
		index: 'products',
		query: {
			function_score: {
				query: {
					multi_match: {
						query,
						fields: ['name^3', 'description']
					}
				},
				functions: [
					...categoryBoosts,
					// Also boost recently viewed
					{
						filter: { terms: { id: await getRecentlyViewed(userId) } },
						weight: 1.5
					}
				],
				score_mode: 'multiply',
				boost_mode: 'multiply'
			}
		}
	});
}
```

Personalization শক্তিশালী কিন্তু latency যোগ করে (প্রতি search-এ বাড়তি DB query)। ইউজার preference কয়েক মিনিটের জন্য cache করুন।

## A/B Testing Relevance

কোন ranking ভালো তা অনুমান করবেন না — মাপুন:

```typescript
// Assign users to variants
function getSearchVariant(userId: string): 'control' | 'treatment' {
	const hash = parseInt(createHash('md5').update(userId).digest('hex').slice(0, 8), 16);
	return hash % 2 === 0 ? 'control' : 'treatment';
}

// Search with variant-specific settings
async function abSearch(userId: string, query: string) {
	const variant = getSearchVariant(userId);

	const searchParams =
		variant === 'control'
			? { rankingRules: ['words', 'typo', 'proximity', 'attribute', 'exactness'] }
			: { rankingRules: ['words', 'typo', 'attribute', 'proximity', 'exactness'] };
	// Treatment: attribute before proximity — test if it improves CTR

	const results = await index.search(query, searchParams);

	// Log variant for analysis
	await trackSearch(query, userId, results.hits, { variant });

	return results;
}

// After 1 week: compare CTR between control and treatment
const comparison = await db.query(`
  SELECT
    variant,
    COUNT(DISTINCT e.id) AS searches,
    COUNT(DISTINCT c.id) AS clicks,
    COUNT(DISTINCT c.id)::float / COUNT(DISTINCT e.id) AS ctr
  FROM search_events e
  LEFT JOIN search_clicks c ON c.query = e.query AND c.user_id = e.user_id
  GROUP BY variant
`);
```

## "No Results" হ্যান্ডল করা

কখনো একটা ফাঁকা "no results" পেজ দেখাবেন না:

```typescript
async function searchWithFallback(query: string) {
	// First: exact search
	let results = await index.search(query, {
		filter: ['in_stock = true']
	});

	if (results.hits.length > 0) return { results, mode: 'exact' };

	// Fallback 1: relax filters
	results = await index.search(query, {});
	if (results.hits.length > 0) return { results, mode: 'relaxed_filters' };

	// Fallback 2: fuzzy / partial terms
	const tokens = query.split(' ').filter((t) => t.length > 3);
	if (tokens.length > 1) {
		results = await index.search(tokens.slice(0, 2).join(' '));
		if (results.hits.length > 0) return { results, mode: 'partial_query' };
	}

	// Fallback 3: popular items in the queried category
	const popularItems = await db.query(
		'SELECT * FROM products WHERE in_stock = true ORDER BY popularity DESC LIMIT 20'
	);

	return {
		results: { hits: popularItems.rows },
		mode: 'popular_fallback',
		suggestions: await getSuggestions(query)
	};
}
```

## Operational Checklist

```
□ Index monitoring: track index size, doc count, search latency
□ Zero-results monitoring: alert if > 10% of queries return 0 results
□ Sync monitoring: alert if Meilisearch lags database by > 5 minutes
□ Weekly: review bottom 50 queries by CTR
□ Monthly: review zero-results query list → add synonyms or missing products
□ After deploys: verify search still returns expected results (smoke test)
□ Search analytics dashboard: CTR, MRR, zero-results rate, query volume
```

```typescript
// Smoke test after deploy
async function searchSmokeTest() {
	const testCases = [
		{ query: 'laptop', expectedMinResults: 10 },
		{ query: 'macbook pro', expectedFirstId: 'prod-123' },
		{ query: 'iphone', expectedCategory: 'phones' }
	];

	for (const tc of testCases) {
		const results = await index.search(tc.query, { limit: 1 });
		if (results.hits.length < (tc.expectedMinResults ?? 1)) {
			throw new Error(`Search smoke test failed: "${tc.query}" returned too few results`);
		}
	}
}
```
