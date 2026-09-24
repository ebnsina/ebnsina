---
title: 'Pagination ও Filtering'
subtitle: 'বড় ডেটাসেট দক্ষভাবে সামলাতে cursor ও offset pagination, filtering, sorting, আর field selection ইমপ্লিমেন্ট করুন।'
chapter: 4
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['pagination', 'cursor', 'offset', 'filtering', 'sorting', 'field selection']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমি গেছে জেলা ভূমি অফিসে, তার এলাকার এক দাগের পুরনো রেকর্ড খুঁজতে। অফিসের পেছনের ঘরে লাখ লাখ ফাইল — কেউ তো আর সব ফাইল একসাথে সামনে এনে ঢেলে দেয় না, দিলে টেবিলই ভেঙে পড়বে, খুঁজতেও সারাদিন লেগে যাবে। তাই কেরানি ফাতিমা একবারে এক ট্রে, ধরুন ২০টা ফাইল বের করে হাতে দেয়। খোয়ারিজমি সেই ২০টা দেখে বলে, "পরের ট্রে-টা দেন" — ফাতিমা আবার পরের ২০টা এনে দেয়।

এখানে একটা চালাকি আছে। ফাতিমা প্রতিবার একদম গোড়া থেকে গুনে গুনে আসে না। শেষ ট্রে-র শেষ ফাইলটার গায়ে সে একটা কাগজের স্লিপ গুঁজে রাখে — "এই পর্যন্ত দেখা হয়েছে"। পরের ট্রে চাইলে সে ওই স্লিপের ঠিক পরের ফাইল থেকে টেনে আনে, প্রথম থেকে আবার গোনা লাগে না। খোয়ারিজমি আবার বলতে পারে, "শুধু ২০১৫ সালের, অমুক মৌজার ফাইলগুলো দেন" — তখন ফাতিমা শুধু সেই শর্তে মেলা ফাইলগুলোই বেছে আনে, বাকিগুলো ঘাঁটে না।

এই পুরো ব্যাপারটাই **pagination**। এক ট্রে-তে ২০টা ফাইল দেওয়াটা হলো **limit** — একবারে কতটা রেকর্ড ফেরত আসবে। "প্রথম থেকে ১০০ ফাইল গুনে তারপর দাও" এভাবে গোনাটা **offset** — বড় হলে ধীর, আর মাঝখানে কেউ ফাইল ঢোকালে-সরালে হিসাব এলোমেলো। আর স্লিপ গুঁজে ঠিক ওখান থেকে শুরু করাটাই **cursor** — দ্রুত, আর মাঝপথে রেকর্ড বদলালেও গোলমাল হয় না। শেষে নির্দিষ্ট মৌজা বা সাল দিয়ে বেছে আনাটা হলো **filter** আর **sort**। বাস্তবে ঠিক এভাবেই Facebook-এর নিউজ ফিড বা কোনো e-commerce সাইটের প্রোডাক্ট লিস্ট — সব একসাথে না পাঠিয়ে অল্প অল্প করে, cursor ধরে স্ক্রল অনুযায়ী লোড করে।

## Paginate কেন করবেন?

একটি single response-এ সব record রিটার্ন করা মানে বিপর্যয় ডেকে আনা। ১ কোটি row-এর একটি টেবিল গিগাবাইট মেমরি খেয়ে ফেলবে, serialize করতে কয়েক মিনিট লাগবে, আর সম্ভবত client crash করবে।

Pagination আপনাকে সহজে সামলানো যায় এমন ছোট ছোট ভাগে ডেটা রিটার্ন করতে দেয়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা প্রোডাক্ট ক্যাটালগ ব্রাউজ করার মতো — আপনি একবারে ১০,০০০ পৃষ্ঠা উল্টান না। প্রতি পৃষ্ঠায় ২০টি আইটেম দেখেন, সাথে দাম আর ক্যাটাগরির ফিল্টার আর একটা "next page" বাটন।

</Callout>

## Offset Pagination

সবচেয়ে সহজ পদ্ধতি। client `page` আর `limit` (বা `offset` আর `limit`) পাঠায়।

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

### Offset Pagination-এর সমস্যা

Offset pagination-এ দুটি গুরুতর সমস্যা আছে:

1. **Performance** — `OFFSET 100000` রেজাল্ট রিটার্ন করার আগেও ১,০০,০০০ row স্ক্যান করে
2. **Data drift** — দুই request-এর মাঝে আইটেম insert বা delete হলে আপনি আইটেম skip করতে বা ডুপ্লিকেট পেতে পারেন

```typescript
// Example of data drift
// Page 1: items [1, 2, 3, 4, 5] (limit=5)
// Someone deletes item 2
// Page 2: items [7, 8, 9, 10, 11] — item 6 was skipped!

// The database offset shifted because the total count changed
```

<Callout type="warning">

**কখন Offset Pagination ব্যবহার করবেন না**

- ~100K row-এর বেশি ডেটাসেট (performance খারাপ হয়)
- real-time ডেটা যেখানে আইটেম প্রায়ই insert বা delete হয়
- infinite scroll UI যেখানে consistency গুরুত্বপূর্ণ

এসব ক্ষেত্রে বরং cursor pagination ব্যবহার করুন।

</Callout>

## Cursor Pagination

Cursor pagination পরের batch-এর রেজাল্ট আনতে একটি pointer (সাধারণত একটি ID বা timestamp) ব্যবহার করে। এটা দ্রুত এবং data drift এড়ায়।

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

### Sorting-সহ Cursor Pagination

আপনি যখন কোনো non-unique ফিল্ড (যেমন `createdAt`) দিয়ে sort করেন, তখন একটি compound cursor দরকার:

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

## Offset বনাম Cursor: কখন কোনটা

| বৈশিষ্ট্য              | Offset      | Cursor    |
| ---------------------- | ----------- | --------- |
| সরাসরি page N-এ যাওয়া | হ্যাঁ       | না        |
| scale-এ performance    | খারাপ       | চমৎকার    |
| Data consistency       | drift সম্ভব | স্থিতিশীল |
| ইমপ্লিমেন্টেশন জটিলতা  | সহজ         | মাঝারি    |
| SEO-friendly URL       | হ্যাঁ       | না        |
| Infinite scroll        | সম্ভব       | আদর্শ     |

<Callout type="tip">

**ব্যবহারিক পরামর্শ**

- admin dashboard, backoffice tool, আর ছোট ডেটাসেটের জন্য **offset** ব্যবহার করুন
- user-facing feed, infinite scroll, আর বড় ডেটাসেটের জন্য **cursor** ব্যবহার করুন
- আপনি দুটোই সাপোর্ট করতে পারেন — ডিফল্ট offset রাখুন আর cursor-কে একটি option হিসেবে দিন

</Callout>

## Filtering

client-কে query parameter দিয়ে রেজাল্ট সংকুচিত করতে দিন:

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

client-কে sort order নির্ধারণ করতে দিন:

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

payload সাইজ কমাতে client-কে শুধু প্রয়োজনীয় ফিল্ডগুলোই চাইতে দিন:

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

**Field Selection নিয়ে সিকিউরিটি নোট**

সবসময় ফিল্ডের একটি allowlist ব্যবহার করুন। client-কে কখনো ইচ্ছেমতো ফিল্ড চাইতে দেবেন না — তারা `passwordHash`, `internalNotes`, বা `costPrice`-এর মতো internal ফিল্ডে ঢুকে পড়তে পারে।

</Callout>

## মূল কথা

1. **Offset pagination** সহজ কিন্তু scale-এ খারাপ হয় — admin tool আর ছোট ডেটাসেটের জন্য ব্যবহার করুন
2. **Cursor pagination** দ্রুত আর সামঞ্জস্যপূর্ণ — feed, infinite scroll, আর বড় ডেটাসেটের জন্য ব্যবহার করুন
3. **Compound cursor** (sort value + ID) cursor pagination-এ sorting সামলায়
4. **Filtering**-এ whitelist করা ফিল্ড-সহ query param ব্যবহার করা উচিত
5. descending-এর জন্য `-field` দিয়ে **sorting** একটি পরিচ্ছন্ন, স্ট্যান্ডার্ড pattern
6. **Field selection** payload সাইজ কমায় কিন্তু সিকিউরিটির জন্য অবশ্যই allowlist ব্যবহার করতে হবে
