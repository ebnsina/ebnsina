---
title: 'Pagination & Filtering'
subtitle: 'Implement cursor and offset pagination, filtering, sorting, and field selection to handle large datasets efficiently.'
chapter: 4
level: 'intermediate'
readingTime: '12 min'
topics: ['pagination', 'cursor', 'offset', 'filtering', 'sorting', 'field selection']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Paginate?

Returning all records in a single response is a recipe for disaster. A table with 10 million rows would consume gigabytes of memory, take minutes to serialize, and probably crash the client.

Pagination lets you return data in manageable chunks.

<Callout type="info">

**Real-World Analogy**

Like browsing a product catalog — you don't flip through all 10,000 pages at once. You see 20 items per page with filters for price, category, and a "next page" button.

</Callout>

## Offset Pagination

The simplest approach. The client sends `page` and `limit` (or `offset` and `limit`).

```typescript
// Client request
// GET /api/products?page=3&limit=20

// Server implementation
app.get('/api/products', async (req, res) => {
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
	const offset = (page - 1) * limit;

	const [products, total] = await Promise.all([
		db.products.find().skip(offset).limit(limit),
		db.products.count()
	]);

	res.json({
		data: products,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
			hasMore: page * limit < total
		}
	});
});
```

### Offset Pagination Problems

Offset pagination has two critical issues:

1. **Performance** — `OFFSET 100000` still scans 100,000 rows before returning results
2. **Data drift** — If items are inserted or deleted between requests, you may skip or duplicate items

```typescript
// Example of data drift
// Page 1: items [1, 2, 3, 4, 5] (limit=5)
// Someone deletes item 2
// Page 2: items [7, 8, 9, 10, 11] — item 6 was skipped!

// The database offset shifted because the total count changed
```

<Callout type="warning">

**When NOT to Use Offset Pagination**

- Datasets larger than ~100K rows (performance degrades)
- Real-time data where items are frequently inserted or deleted
- Infinite scroll UIs where consistency matters

Use cursor pagination instead for these cases.

</Callout>

## Cursor Pagination

Cursor pagination uses a pointer (usually an ID or timestamp) to fetch the next batch of results. It is faster and avoids data drift.

```typescript
// Client request
// GET /api/products?limit=20
// GET /api/products?limit=20&after=prod_abc123

// Server implementation
app.get('/api/products', async (req, res) => {
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
	const after = req.query.after as string | undefined;

	// Build query
	const query: Record<string, unknown> = {};
	if (after) {
		// Decode the cursor
		const cursor = decodeCursor(after);
		query._id = { $gt: cursor.id };
	}

	const products = await db.products
		.find(query)
		.sort({ _id: 1 })
		.limit(limit + 1); // Fetch one extra to check if there are more

	const hasMore = products.length > limit;
	if (hasMore) products.pop(); // Remove the extra item

	const endCursor =
		products.length > 0 ? encodeCursor({ id: products[products.length - 1]._id }) : null;

	res.json({
		data: products,
		meta: {
			hasMore,
			endCursor,
			limit
		}
	});
});

// Cursor encoding/decoding
function encodeCursor(data: Record<string, unknown>): string {
	return Buffer.from(JSON.stringify(data)).toString('base64url');
}

function decodeCursor(cursor: string): Record<string, unknown> {
	return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
}
```

### Cursor Pagination with Sorting

When you sort by a non-unique field (like `createdAt`), you need a compound cursor:

```typescript
app.get('/api/products', async (req, res) => {
	const limit = Math.min(100, Number(req.query.limit) || 20);
	const after = req.query.after as string | undefined;
	const sortField = 'createdAt';

	const query: Record<string, unknown> = {};
	if (after) {
		const cursor = decodeCursor(after);
		// Compound cursor: sort field + unique tiebreaker
		query.$or = [
			{ [sortField]: { $gt: cursor.sortValue } },
			{ [sortField]: cursor.sortValue, _id: { $gt: cursor.id } }
		];
	}

	const products = await db.products
		.find(query)
		.sort({ [sortField]: 1, _id: 1 })
		.limit(limit + 1);

	const hasMore = products.length > limit;
	if (hasMore) products.pop();

	const last = products[products.length - 1];
	const endCursor = last ? encodeCursor({ sortValue: last[sortField], id: last._id }) : null;

	res.json({
		data: products,
		meta: { hasMore, endCursor }
	});
});
```

## Offset vs Cursor: When to Use Each

| Feature                   | Offset         | Cursor    |
| ------------------------- | -------------- | --------- |
| Jump to page N            | Yes            | No        |
| Performance at scale      | Poor           | Excellent |
| Data consistency          | Drift possible | Stable    |
| Implementation complexity | Simple         | Moderate  |
| SEO-friendly URLs         | Yes            | No        |
| Infinite scroll           | Possible       | Ideal     |

<Callout type="tip">

**Practical Advice**

- Use **offset** for admin dashboards, backoffice tools, and small datasets
- Use **cursor** for user-facing feeds, infinite scroll, and large datasets
- You can support both — use offset by default and offer cursor as an option

</Callout>

## Filtering

Let clients narrow down results using query parameters:

```typescript
// GET /api/products?category=electronics&min_price=1000&max_price=50000&in_stock=true

app.get('/api/products', async (req, res) => {
	const { category, min_price, max_price, in_stock, brand, search } = req.query;

	const filters: Record<string, unknown> = {};

	if (category) {
		filters.category = category;
	}

	if (min_price || max_price) {
		filters.price = {};
		if (min_price) filters.price.$gte = Number(min_price);
		if (max_price) filters.price.$lte = Number(max_price);
	}

	if (in_stock !== undefined) {
		filters.inStock = in_stock === 'true';
	}

	if (brand) {
		// Support multiple brands: ?brand=samsung&brand=apple
		const brands = Array.isArray(brand) ? brand : [brand];
		filters.brand = { $in: brands };
	}

	if (search) {
		filters.$text = { $search: search as string };
	}

	const products = await db.products.find(filters).limit(20);
	res.json({ data: products });
});
```

## Sorting

Allow clients to specify sort order:

```typescript
// GET /api/products?sort=price        (ascending)
// GET /api/products?sort=-price       (descending)
// GET /api/products?sort=-createdAt,price  (multiple fields)

function parseSortParam(sort: string | undefined, allowedFields: string[]) {
	if (!sort) return { createdAt: -1 }; // default sort

	const sortObj: Record<string, 1 | -1> = {};

	for (const field of sort.split(',')) {
		const trimmed = field.trim();
		const descending = trimmed.startsWith('-');
		const fieldName = descending ? trimmed.slice(1) : trimmed;

		// Only allow whitelisted fields
		if (allowedFields.includes(fieldName)) {
			sortObj[fieldName] = descending ? -1 : 1;
		}
	}

	return Object.keys(sortObj).length > 0 ? sortObj : { createdAt: -1 };
}

app.get('/api/products', async (req, res) => {
	const sort = parseSortParam(req.query.sort as string, ['price', 'name', 'createdAt', 'rating']);

	const products = await db.products.find().sort(sort).limit(20);
	res.json({ data: products });
});
```

## Field Selection (Sparse Fieldsets)

Let clients request only the fields they need to reduce payload size:

```typescript
// GET /api/products?fields=id,name,price

function parseFields(fields: string | undefined, allowedFields: string[]) {
	if (!fields) return null; // return all fields

	const requested = fields.split(',').map((f) => f.trim());
	const projection: Record<string, 1> = {};

	for (const field of requested) {
		if (allowedFields.includes(field)) {
			projection[field] = 1;
		}
	}

	// Always include id
	projection._id = 1;
	return projection;
}

app.get('/api/products', async (req, res) => {
	const projection = parseFields(req.query.fields as string, [
		'name',
		'price',
		'category',
		'brand',
		'inStock',
		'rating',
		'imageUrl'
	]);

	const query = db.products.find();
	if (projection) query.select(projection);

	const products = await query.limit(20);
	res.json({ data: products });
});
```

<Callout type="warning">

**Security Note on Field Selection**

Always use an allowlist of fields. Never let clients request arbitrary fields — they might access internal fields like `passwordHash`, `internalNotes`, or `costPrice`.

</Callout>

## Key Takeaways

1. **Offset pagination** is simple but degrades at scale — use for admin tools and small datasets
2. **Cursor pagination** is fast and consistent — use for feeds, infinite scroll, and large datasets
3. **Compound cursors** (sort value + ID) handle sorting with cursor pagination
4. **Filtering** should use query params with whitelisted fields
5. **Sorting** with `-field` for descending is a clean, standard pattern
6. **Field selection** reduces payload size but must use an allowlist for security
