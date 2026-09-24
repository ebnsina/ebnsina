---
title: 'Versioning ও Evolution'
subtitle: 'বিদ্যমান client না ভেঙে আপনার API-কে বিকশিত করুন — URL versioning, header versioning, backward compatibility, আর deprecation strategy।'
chapter: 5
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['versioning', 'backward compatibility', 'deprecation', 'API evolution']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনাদের স্কুলে ক্লাস সিক্সের গণিত বই এবার নতুন সংস্করণে ছাপা হয়েছে। আগের সংস্করণ যাদের কেনা, তাদের বই তো আর হঠাৎ অচল হয়ে যায়নি — স্যার ক্লাসে অধ্যায় ধরে ধরে পড়ান, আর পুরনো বইয়ের ছাত্ররাও দিব্যি ক্লাস ফলো করতে পারে। কারণ নতুন সংস্করণে পুরনো অধ্যায়গুলোর নম্বর বদলানো হয়নি; আগের ১ থেকে ১২ ঠিক আগের মতোই আছে, শুধু শেষে দুটো নতুন অধ্যায় জুড়ে দেওয়া হয়েছে। ফাতিমা নতুন বই কিনেছে, খোয়ারিজমির কাছে পুরনোটা — দুজনেই একই ক্লাস করতে পারছে।

তবে স্কুল একদিনে দুই সংস্করণই সমান্তরালে চালিয়ে যাবে না। কিছুদিন দুটোই চলে, কিন্তু বছরের শুরুতেই স্যার ঘোষণা দিয়ে দেন — "সামনের বছর থেকে পুরনো সংস্করণ আর সাপোর্ট করা হবে না, সবাই নতুনটা জোগাড় করে নিও।" আগেভাগে এই নোটিশ দেওয়ার কারণ একটাই: যাতে ছাত্ররা সময় নিয়ে বই বদলে নিতে পারে, কেউ যেন হঠাৎ এসে দেখে তার বই দিয়ে আর ক্লাস চলছে না।

এই পুরো ব্যাপারটাই আসলে **API versioning ও evolution**। নতুন সংস্করণে পুরনো অধ্যায় নম্বর অটুট রেখে শুধু নতুন অধ্যায় যোগ করাটা হলো **backward compatible** পরিবর্তন — পুরনো client (খোয়ারিজমির বই) না ভেঙেই v2 আনা। অধ্যায় নম্বর ওলটপালট করে দিলে সেটাই হতো **breaking change**, তখন পুরনো বই দিয়ে ক্লাস ফলো করা যেত না। আর আগেভাগে নোটিশ দিয়ে পুরনো সংস্করণ তুলে দেওয়াটাই **deprecation** — ঘোষণা, সময়, তারপর retire। বাস্তবে Stripe বা GitHub-এর মতো API ঠিক এভাবেই v1 আর v2 কিছুদিন একসাথে চালায়, deprecation নোটিশ দেয়, তারপর পুরনোটা বন্ধ করে — যাতে কারও অ্যাপ হঠাৎ ভেঙে না পড়ে।

## Version কেন করবেন?

API বিকশিত হয়। আপনাকে ফিল্ড rename করতে, response format বদলাতে, বা endpoint সরাতে হবে। একটি versioning strategy ছাড়া প্রতিটি পরিবর্তন বিদ্যমান client ভাঙার ঝুঁকি তৈরি করে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ফোনের OS আপডেটের মতো — পুরনো version কিছুদিন কাজ করতে থাকে, কিন্তু নতুন ফিচার শুধু v2-তে। নির্মাতা রাতারাতি সবার অ্যাপ ভাঙে না; তারা ধীরে ধীরে deprecate করে।

</Callout>

## Versioning Strategy

### 1. URL Path Versioning

সবচেয়ে প্রচলিত আর সবচেয়ে দৃশ্যমান পদ্ধতি:

```typescript
// Version in the URL path
GET / api / v1 / users;
GET / api / v2 / users;

// Express implementation
import v1Router from './routes/v1';
import v2Router from './routes/v2';

app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);

// routes/v1/users.ts
router.get('/users', async (req, res) => {
	const users = await db.users.find();
	// v1 returns flat structure
	res.json(
		users.map((u) => ({
			id: u.id,
			name: u.name,
			email: u.email
		}))
	);
});

// routes/v2/users.ts
router.get('/users', async (req, res) => {
	const users = await db.users.find();
	// v2 returns envelope with split name
	res.json({
		data: users.map((u) => ({
			id: u.id,
			firstName: u.firstName,
			lastName: u.lastName,
			email: u.email,
			createdAt: u.createdAt
		})),
		meta: { total: users.length }
	});
});
```

**সুবিধা:** বোঝা সহজ, URL-এ দৃশ্যমান, route করা সহজ
**অসুবিধা:** কোড ডুপ্লিকেট হয়, অনেক version maintain করা কঠিন

### 2. Header Versioning

Version একটি custom header বা Accept header-এ নির্দিষ্ট করা হয়:

```typescript
// Custom header
GET /api/users
X-API-Version: 2

// Accept header (content negotiation)
GET /api/users
Accept: application/vnd.myapi.v2+json

// Implementation
app.get("/api/users", async (req, res) => {
  const version = getApiVersion(req);
  const users = await db.users.find();

  if (version === 1) {
    return res.json(formatUsersV1(users));
  }

  res.json(formatUsersV2(users));
});

function getApiVersion(req: express.Request): number {
  // Check custom header first
  const headerVersion = req.headers["x-api-version"];
  if (headerVersion) return Number(headerVersion);

  // Check Accept header
  const accept = req.headers.accept || "";
  const match = accept.match(/application\/vnd\.myapi\.v(\d+)\+json/);
  if (match) return Number(match[1]);

  // Default to latest
  return 2;
}
```

**সুবিধা:** পরিচ্ছন্ন URL, কোড ডুপ্লিকেশন নেই
**অসুবিধা:** কম দৃশ্যমান, browser-এ টেস্ট করা কঠিন

### 3. Query Parameter Versioning

```typescript
// Version in query string
GET /api/users?version=2

// Simple but not recommended for production APIs
```

**সুবিধা:** টেস্টিংয়ের জন্য version বদলানো সহজ
**অসুবিধা:** query param-এ বিষয় জট পাকায়, caching সমস্যা

<Callout type="tip">

**কোন Strategy বেছে নেবেন?**

- public API-এর জন্য **URL versioning** সেরা ডিফল্ট পছন্দ — এটা স্পষ্ট, cacheable, আর বোঝা সহজ
- **Header versioning** internal API-তে আর পরিচ্ছন্ন URL চাইলে ভালো কাজ করে
- **Query parameter versioning** দ্রুত prototype-এর জন্য ঠিক আছে, production-এর জন্য নয়
- বেশিরভাগ বড় API (Stripe, GitHub, Twilio) URL versioning ব্যবহার করে

</Callout>

## Backward-Compatible পরিবর্তন

প্রতিটি পরিবর্তনে নতুন version লাগে না। এই পরিবর্তনগুলো backward-compatible:

```typescript
// SAFE — Adding new fields (clients ignore unknown fields)
// v1 response
{ "id": 1, "name": "Rahim" }

// Updated response — still compatible with v1 clients
{ "id": 1, "name": "Rahim", "avatar": "https://..." }

// SAFE — Adding new endpoints
GET /api/users/:id/preferences  // New endpoint, does not affect existing ones

// SAFE — Adding optional query parameters
GET /api/users?include=orders  // New filter, existing calls without it still work

// SAFE — Making a required field optional
// Before: name was required
// After: name is optional with a default

// BREAKING — Removing a field
{ "id": 1, "name": "Rahim" }  // "email" was here before, clients depend on it

// BREAKING — Renaming a field
{ "id": 1, "full_name": "Rahim" }  // Was "name", clients break

// BREAKING — Changing a field's type
{ "id": "user_1" }  // Was a number, now a string

// BREAKING — Removing an endpoint
// DELETE /api/legacy-users  — clients still call this
```

## Deprecation Strategy

যখন আপনাকে একটি পুরনো version অবসরে পাঠাতে হবে:

```typescript
// Step 1: Mark endpoints as deprecated with headers
app.use('/api/v1', (req, res, next) => {
	res.set('Deprecation', 'true');
	res.set('Sunset', 'Sat, 01 Jun 2026 00:00:00 GMT');
	res.set('Link', '</api/v2>; rel="successor-version"');

	// Log deprecated usage for monitoring
	metrics.increment('api.v1.deprecated_call', {
		endpoint: req.path,
		client: req.headers['user-agent']
	});

	next();
});

// Step 2: Return warnings in response body
function deprecationWrapper(handler: express.RequestHandler): express.RequestHandler {
	return async (req, res, next) => {
		const originalJson = res.json.bind(res);
		res.json = (body: unknown) => {
			if (typeof body === 'object' && body !== null) {
				(body as Record<string, unknown>)._warnings = [
					{
						code: 'DEPRECATED_VERSION',
						message: 'API v1 is deprecated. Please migrate to v2 by June 2026.',
						docs: 'https://docs.myapi.com/migration/v1-to-v2'
					}
				];
			}
			return originalJson(body);
		};
		handler(req, res, next);
	};
}

// Step 3: After sunset date, return 410 Gone
app.use('/api/v1', (req, res) => {
	res.status(410).json({
		error: {
			code: 'VERSION_RETIRED',
			message: 'API v1 has been retired. Please use v2.',
			migrationGuide: 'https://docs.myapi.com/migration/v1-to-v2'
		}
	});
});
```

## Migration Guide Pattern

নতুন version আনার সময় সবসময় একটি পরিষ্কার migration guide দিন:

```typescript
// Document every breaking change
const migrationGuide = {
	from: 'v1',
	to: 'v2',
	changes: [
		{
			type: 'field_renamed',
			endpoint: 'GET /users',
			before: { field: 'name', type: 'string' },
			after: { fields: ['firstName', 'lastName'], type: 'string' },
			migration: "Split the 'name' field on space, or use the new fields directly"
		},
		{
			type: 'response_wrapped',
			endpoint: 'ALL',
			before: 'Direct array/object response',
			after: 'Wrapped in { data, meta } envelope',
			migration: 'Access response.data instead of response directly'
		},
		{
			type: 'field_type_changed',
			endpoint: 'GET /users',
			before: { field: 'id', type: 'number' },
			after: { field: 'id', type: 'string', format: 'user_<number>' },
			migration: 'Update ID comparisons to use string matching'
		}
	]
};
```

<Callout type="warning">

**সাধারণ Versioning ভুল**

- খুব তাড়াতাড়ি versioning করা — backward-compatible পরিবর্তনের জন্য আপনার v2 লাগে না
- খুব দেরিতে versioning করা — একবার client কোনো behavior-এর ওপর নির্ভর করলে সেটা একটা contract
- খুব বেশি version maintain করা — সর্বোচ্চ ২টি সাপোর্ট করুন (current + previous)
- deprecated endpoint-এর ব্যবহার monitor না করা — কখন retire করা নিরাপদ তা জানতে আপনার ডেটা দরকার

</Callout>

## মূল কথা

1. public API-এর জন্য **URL path versioning** স্ট্যান্ডার্ড — স্পষ্ট আর cacheable
2. **Additive পরিবর্তন নিরাপদ** — নতুন ফিল্ড, নতুন endpoint, নতুন optional parameter
3. **ফিল্ড সরানো বা rename করা breaking** — সবসময় একটি নতুন version বা migration period লাগে
4. **Deprecation একটি প্রক্রিয়া** — ঘোষণা করুন, সতর্ক করুন, sunset করুন, তারপর retire করুন
5. maintenance সামলানোর মতো রাখতে একসাথে **সর্বোচ্চ দুটি version সাপোর্ট করুন**
6. পুরনো version সরানো কখন নিরাপদ তা জানতে **deprecated endpoint-এর ব্যবহার monitor করুন**
