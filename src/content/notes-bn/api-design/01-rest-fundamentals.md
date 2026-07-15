---
title: 'REST-এর মূল ধারণা'
subtitle: 'RESTful নীতি, HTTP মেথড, স্ট্যাটাস কোড, আর রিসোর্স নেমিং কনভেনশন বুঝে নিন — এগুলোই আধুনিক API-এর মূল ভিত্তি।'
chapter: 1
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['REST', 'HTTP methods', 'status codes', 'resource naming']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

করিম গেল বিদ্যুৎ অফিসে, হাতে তার অ্যাকাউন্ট নম্বর। কাউন্টারে গিয়ে দেখে জানালার পাশে আলাদা আলাদা ছাপানো ফর্ম সাজানো — একটা ফর্ম বিল দেখার জন্য, একটা বিল জমা দেওয়ার জন্য, একটা ঠিকানা বদলানোর জন্য, আর একটা লাইন কাটানোর জন্য। করিম বিল দেখতে চায়, তাই সে "বিল দেখুন" ফর্মটা তুলে নেয়, অ্যাকাউন্ট নম্বর বসিয়ে জমা দেয়। পরের সপ্তাহে বিল জমা দিতে এসে সে "বিল জমা" ফর্ম নেয়, আর ঠিকানা পাল্টানোর দিন নেয় "ঠিকানা পরিবর্তন" ফর্ম — কাজ যা-ই হোক, ফর্মের ধরনটাই বলে দেয় সে ঠিক কী করতে চাইছে।

মজার ব্যাপার হলো, কাউন্টারের কেরানি করিমকে চেনে না, আর চেনার দরকারও নেই। প্রতিটা ফর্মেই যেহেতু অ্যাকাউন্ট নম্বর লেখা থাকে, কেরানি প্রতিবার শুধু হাতের কাগজটা দেখেই কাজ সেরে ফেলে — করিম গতবার কী করে গিয়েছিল সেটা মনে রাখার কোনো ঝামেলা নেই। তাই আজ করিম গেলে যা হয়, কাল রহিম একই ফর্মে একই অ্যাকাউন্ট নম্বর দিলেও ঠিক তা-ই হয়।

এই কাউন্টারটাই আসলে একটা **REST** API। অ্যাকাউন্ট (বা বিল) হলো **resource**, আর প্রতিটা কাজের আলাদা ফর্ম হলো HTTP verb — বিল দেখা **GET**, বিল জমা **POST**, ঠিকানা বদলানো **PUT**, লাইন কাটানো **DELETE**। সব কাজ একই ছাঁচের ফর্মে হওয়াটাই **uniform interface**, আর প্রতিটা ফর্মে অ্যাকাউন্ট নম্বর থাকায় কেরানির আগের কথা মনে না রাখাটাই **stateless** — প্রতিটা request নিজেই স্বয়ংসম্পূর্ণ। বাস্তবে ঠিক এভাবেই, ধরুন, একটা মোবাইল ব্যাংকিং অ্যাপ প্রতিটা লেনদেনে টোকেন আর অ্যাকাউন্ট আইডি পাঠায়, যাতে সার্ভারকে আগের সেশন মনে রাখতে না হয়।

## REST কী?

REST (Representational State Transfer) হলো নেটওয়ার্কড অ্যাপ্লিকেশন ডিজাইন করার একটি আর্কিটেকচারাল স্টাইল। Roy Fielding তাঁর ২০০০ সালের ডক্টরাল ডিজার্টেশনে এটি সংজ্ঞায়িত করেন, এবং এখন এটি web API বানানোর প্রধান পদ্ধতি হয়ে দাঁড়িয়েছে।

REST কোনো protocol নয় — এটি কিছু constraint-এর সেট। একটি API যখন এই constraint-গুলো মেনে চলে, তখন আমরা তাকে RESTful বলি।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা রেস্টুরেন্টের মেনুর মতো — GET মেনু পড়ে, POST অর্ডার দেয়, PUT আপনার অর্ডার বদলায়, DELETE সেটা বাতিল করে। মেনু ঠিক করে দেয় আপনি কী চাইতে পারবেন আর বিনিময়ে কী পাবেন।

</Callout>

## ছয়টি REST Constraint

REST ছয়টি আর্কিটেকচারাল constraint সংজ্ঞায়িত করে:

1. **Client-Server** — ইউজার ইন্টারফেসকে ডেটা স্টোরেজ থেকে আলাদা রাখুন
2. **Stateless** — প্রতিটি request-এ সেটা প্রসেস করার জন্য প্রয়োজনীয় সব তথ্য থাকে
3. **Cacheable** — response-কে নিজেই বলে দিতে হবে সেটা cacheable কিনা
4. **Uniform Interface** — রিসোর্সের সাথে ইন্টারঅ্যাক্ট করার একটি সামঞ্জস্যপূর্ণ উপায়
5. **Layered System** — client বুঝতে পারে না সে সরাসরি সার্ভারের সাথে যুক্ত কিনা
6. **Code on Demand** (ঐচ্ছিক) — সার্ভার client-কে এক্সিকিউটেবল কোড পাঠাতে পারে

```typescript
// Stateless means every request is self-contained
// BAD — relies on server remembering state
fetch('/api/next-page');

// GOOD — request contains all needed info
fetch('/api/products?page=3&limit=20', {
	headers: {
		Authorization: 'Bearer eyJhbGciOi...'
	}
});
```

## HTTP মেথড

HTTP মেথড (যাকে verb-ও বলা হয়) একটি রিসোর্সের ওপর কী অ্যাকশন করতে হবে তা নির্ধারণ করে:

| Method | কাজ                      | Idempotent | Safe  | Body আছে |
| ------ | ------------------------ | ---------- | ----- | -------- |
| GET    | রিসোর্স পড়া             | হ্যাঁ      | হ্যাঁ | না       |
| POST   | রিসোর্স তৈরি করা         | না         | না    | হ্যাঁ    |
| PUT    | পুরো রিসোর্স রিপ্লেস করা | হ্যাঁ      | না    | হ্যাঁ    |
| PATCH  | রিসোর্স আংশিক আপডেট করা  | না         | না    | হ্যাঁ    |
| DELETE | রিসোর্স মুছে ফেলা        | হ্যাঁ      | না    | ঐচ্ছিক   |

```typescript
// GET — Retrieve a list of users
const response = await fetch('/api/users');
const users = await response.json();

// POST — Create a new user
const newUser = await fetch('/api/users', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		name: 'Rahim Ahmed',
		email: 'rahim@example.com'
	})
});

// PUT — Replace entire user resource
await fetch('/api/users/42', {
	method: 'PUT',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		name: 'Rahim Ahmed',
		email: 'rahim.ahmed@example.com',
		role: 'admin'
	})
});

// PATCH — Update only the email
await fetch('/api/users/42', {
	method: 'PATCH',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		email: 'rahim.new@example.com'
	})
});

// DELETE — Remove a user
await fetch('/api/users/42', { method: 'DELETE' });
```

<Callout type="warning">

**PUT বনাম PATCH নিয়ে গোলমাল**

PUT পুরো রিসোর্সটাকে রিপ্লেস করে। আপনি যদি শুধু `{ name: "Rahim" }` দিয়ে একটি user-কে PUT করেন, তাহলে email আর role ফিল্ডগুলো হারিয়ে যাবে। PATCH শুধু আপনার পাঠানো ফিল্ডগুলোই আপডেট করে। সত্যিকার অর্থে পুরো রিপ্লেসমেন্ট না চাইলে বেশিরভাগ API-তে আপডেটের জন্য PATCH ব্যবহার করাই ভালো।

</Callout>

## HTTP স্ট্যাটাস কোড

স্ট্যাটাস কোড client-কে জানায় কী ঘটেছে। এগুলো ক্যাটাগরি অনুযায়ী গ্রুপ করা:

### 2xx — সফল

```typescript
// 200 OK — Request succeeded (GET, PUT, PATCH)
// 201 Created — New resource was created (POST)
// 204 No Content — Success but nothing to return (DELETE)

app.post('/api/users', async (req, res) => {
	const user = await db.users.create(req.body);
	res.status(201).json(user); // 201, not 200
});

app.delete('/api/users/:id', async (req, res) => {
	await db.users.delete(req.params.id);
	res.status(204).send(); // No body needed
});
```

### 4xx — Client Error

```typescript
// 400 Bad Request — Invalid input
// 401 Unauthorized — Not authenticated
// 403 Forbidden — Authenticated but not authorized
// 404 Not Found — Resource does not exist
// 409 Conflict — Conflicts with current state
// 422 Unprocessable Entity — Valid JSON but semantic errors
// 429 Too Many Requests — Rate limited

app.get('/api/users/:id', async (req, res) => {
	const user = await db.users.findById(req.params.id);
	if (!user) {
		return res.status(404).json({
			error: 'Not Found',
			message: `User ${req.params.id} does not exist`
		});
	}
	res.json(user);
});
```

### 5xx — Server Error

```typescript
// 500 Internal Server Error — Something broke on the server
// 502 Bad Gateway — Upstream service failed
// 503 Service Unavailable — Server is overloaded or in maintenance

app.get('/api/reports', async (req, res) => {
	try {
		const report = await generateReport();
		res.json(report);
	} catch (error) {
		console.error('Report generation failed:', error);
		res.status(500).json({
			error: 'Internal Server Error',
			message: 'Failed to generate report'
		});
	}
});
```

<Callout type="tip">

**স্ট্যাটাস কোডের কিছু সাধারণ নিয়ম**

- সফল POST-এর জন্য **201** ব্যবহার করুন, 200 নয়
- যখন কোনো body রিটার্ন করছেন না, তখন DELETE-এর জন্য **204** ব্যবহার করুন
- না-পাওয়া রিসোর্সের জন্য **404** ব্যবহার করুন, খালি body-সহ 200 নয়
- JSON valid কিন্তু ডেটা validation-এ fail করলে **422** ব্যবহার করুন
- body-তে error message দিয়ে কখনো **200** রিটার্ন করবেন না — এতে স্ট্যাটাস কোডের পুরো উদ্দেশ্যই মাটি হয়

</Callout>

## রিসোর্স নেমিং কনভেনশন

ভালো রিসোর্স নেমিং API ডিজাইনের সবচেয়ে গুরুত্বপূর্ণ অংশ। URL-এ রিসোর্স (noun) থাকা উচিত, অ্যাকশন (verb) নয়।

```typescript
// BAD — verbs in URLs
GET / getUsers;
POST / createUser;
PUT / updateUser / 42;
DELETE / deleteUser / 42;

// GOOD — nouns with HTTP methods providing the action
GET / users; // List all users
POST / users; // Create a user
GET / users / 42; // Get a specific user
PUT / users / 42; // Replace a user
PATCH / users / 42; // Update a user
DELETE / users / 42; // Delete a user
```

### নেমিংয়ের নিয়ম

1. **Plural noun ব্যবহার করুন** — `/users`, `/user` নয়
2. **kebab-case ব্যবহার করুন** — `/order-items`, `/orderItems` নয়
3. **সম্পর্কের জন্য nest করুন** — `/users/42/orders` (user 42-এর অধীন orders)
4. **কম গভীরে রাখুন** — সর্বোচ্চ ২-৩ লেভেল nesting
5. **ফিল্টারিংয়ের জন্য query param ব্যবহার করুন** — `/users?role=admin&active=true`

```typescript
// Nested resources — relationships
GET  /users/42/orders          // All orders by user 42
GET  /users/42/orders/7        // Order 7 of user 42
POST /users/42/orders          // Create order for user 42

// Avoid deep nesting — flatten when possible
// BAD
GET /users/42/orders/7/items/3/reviews

// GOOD — use top-level with query params
GET /reviews?order_item_id=3
GET /order-items/3/reviews
```

<Callout type="warning">

**সাধারণ নেমিং ভুল**

- verb ব্যবহার করা: `GET /users/:id`-এর বদলে `/getUser`
- অসামঞ্জস্যপূর্ণ pluralization: `/user/42/orders` বনাম `/products`
- URL-এ CamelCase: `/order-items`-এর বদলে `/orderItems`
- Trailing slash-এর অসামঞ্জস্য: কিছু endpoint-এ `/`, কিছুতে নেই

</Callout>

## সবকিছু একসাথে জোড়া লাগানো

Express দিয়ে একটি RESTful রিসোর্স ডেফিনিশনের সম্পূর্ণ উদাহরণ এখানে:

```typescript
import express from 'express';

const router = express.Router();

// GET /api/products — List products with filtering
router.get('/products', async (req, res) => {
	const { category, min_price, max_price, page = 1, limit = 20 } = req.query;

	const filters: Record<string, unknown> = {};
	if (category) filters.category = category;
	if (min_price) filters.price = { $gte: Number(min_price) };
	if (max_price) filters.price = { ...filters.price, $lte: Number(max_price) };

	const products = await db.products
		.find(filters)
		.skip((Number(page) - 1) * Number(limit))
		.limit(Number(limit));

	const total = await db.products.count(filters);

	res.json({
		data: products,
		meta: { page: Number(page), limit: Number(limit), total }
	});
});

// GET /api/products/:id — Get a single product
router.get('/products/:id', async (req, res) => {
	const product = await db.products.findById(req.params.id);
	if (!product) {
		return res.status(404).json({ error: 'Product not found' });
	}
	res.json({ data: product });
});

// POST /api/products — Create a product
router.post('/products', async (req, res) => {
	const product = await db.products.create(req.body);
	res.status(201).json({ data: product });
});

// PATCH /api/products/:id — Update a product
router.patch('/products/:id', async (req, res) => {
	const product = await db.products.findByIdAndUpdate(req.params.id, req.body, { new: true });
	if (!product) {
		return res.status(404).json({ error: 'Product not found' });
	}
	res.json({ data: product });
});

// DELETE /api/products/:id — Delete a product
router.delete('/products/:id', async (req, res) => {
	const deleted = await db.products.findByIdAndDelete(req.params.id);
	if (!deleted) {
		return res.status(404).json({ error: 'Product not found' });
	}
	res.status(204).send();
});

export default router;
```

## মূল কথা

1. **REST হলো কিছু constraint-এর সেট**, protocol নয় — statelessness, uniform interface, আর cacheability এর মূল ধারণা
2. **HTTP মেথড CRUD-এ ম্যাপ করে** — GET পড়ে, POST তৈরি করে, PUT/PATCH আপডেট করে, DELETE মুছে ফেলে
3. **স্ট্যাটাস কোড ফলাফল জানায়** — সঠিক পরিস্থিতিতে সঠিক কোড ব্যবহার করুন
4. **URL রিসোর্স রিপ্রেজেন্ট করে** — plural noun, kebab-case, আর অগভীর nesting ব্যবহার করুন
5. **প্রতিটি request নিজেই স্বয়ংসম্পূর্ণ হতে হবে** — request-এর মধ্যে কোনো server-side session state থাকবে না
