---
title: 'Request ও Response ডিজাইন'
subtitle: 'সঠিক header, content negotiation, error format, আর envelope pattern দিয়ে পরিচ্ছন্ন request ও response স্ট্রাকচার ডিজাইন করুন।'
chapter: 3
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['request design', 'response design', 'headers', 'content negotiation', 'error handling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

আল-খোয়ারিজমি নতুন একটা ব্যাংক অ্যাকাউন্ট খুলতে গেল। কাউন্টারের ভদ্রলোক তাকে একটা ছাপানো আবেদন ফর্ম দিলেন — সেখানে ঠিক যতটুকু দরকার ততটুকুই ঘর: নাম, বাবার নাম, NID নম্বর, ঠিকানা, মোবাইল, প্রাথমিক জমার পরিমাণ। প্রতিটা ঘরের পাশে ছোট করে লেখা কোনটা বাধ্যতামূলক, কোনটা ঐচ্ছিক, আর কোন ফরম্যাটে লিখতে হবে (তারিখ দিন-মাস-বছর, টাকার অঙ্ক)। আল-খোয়ারিজমিকে ফর্ম কীভাবে ভরতে হবে সেটা কাউকে জিজ্ঞেস করতে হলো না — ফর্ম দেখেই বুঝে গেল, কারণ সব ঘর পরিষ্কার আর একটা নির্দিষ্ট ক্রমে সাজানো।

ফর্ম জমা দেওয়ার কয়েকদিন পর ব্যাংক থেকে একটা চিঠি এলো — সবসময় একই ছাঁচের চিঠি। উপরে একটা রেজাল্ট কোড: হয় "অনুমোদিত" (সাথে অ্যাকাউন্ট নম্বর), নয়তো "বাতিল"। আল-খোয়ারিজমির বেলায় লেখা ছিল "বাতিল", কিন্তু নিচেই স্পষ্ট কারণ — "NID-এর সাথে দেওয়া জন্মতারিখ মেলেনি"। শুধু গোল গোল "হবে না" নয়, ঠিক কোন ঘরে কী সমস্যা সেটা লেখা, যাতে আল-খোয়ারিজমি ওই ঘরটাই ঠিক করে আবার জমা দিতে পারে।

এই ব্যাপারটাই হলো ভালো **request** আর **response** ডিজাইন। আবেদন ফর্মটাই হলো request — ঠিক যতটুকু দরকার ততগুলো **field**, পরিষ্কার নাম, নির্দিষ্ট ফরম্যাট আর ক্রমে সাজানো (এই চ্যাপ্টারে header, body আর validation)। ফিরতি চিঠিটা হলো response — সবসময় একই **envelope** ছাঁচে, উপরে একটা **status code** (অনুমোদিত মানে 200/201, বাতিল মানে 422), আর ভুল হলে গোল "না" নয়, বরং কোন field-এ কী **error** সেটা স্পষ্ট করে বলা। বাস্তবে bKash বা কোনো ব্যাংকের অ্যাকাউন্ট-খোলার API ঠিক এভাবেই কাজ করে — অ্যাপ পরিষ্কার payload পাঠায়, সার্ভার একই ফরম্যাটে predictable জবাব দেয়, যাতে ইউজার বুঝতে পারে সফল হলো নাকি ঠিক কোথায় ভুল হলো।

## স্ট্রাকচার কেন জরুরি

একটি ভালোভাবে ডিজাইন করা request/response স্ট্রাকচার আপনার API-কে predictable করে তোলে। প্রতিটি endpoint যখন একই pattern মেনে চলে, তখন ডেভেলপাররা docs না পড়েই একটি নতুন endpoint কীভাবে কাজ করে তা আন্দাজ করতে পারে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

সরকারি অফিসে একটা ফর্ম পূরণ করার মতো — ফর্মে required ফিল্ড (header), একটি body (আপনার তথ্য) থাকে, আর বিনিময়ে আপনি স্ট্যাটাস স্ট্যাম্প-সহ একটি রসিদ পান।

</Callout>

## Request ডিজাইন

### Request Header

Header request সম্পর্কিত metadata বহন করে। এগুলোই সবচেয়ে জরুরি:

```typescript
// Common request headers
const headers = {
	// Content type of the request body
	'Content-Type': 'application/json',

	// Authentication
	Authorization: 'Bearer eyJhbGciOi...',

	// Client identification
	'User-Agent': 'MyApp/2.1.0 (iOS 17.2)',

	// Request tracing
	'X-Request-Id': 'req_abc123def456',

	// Idempotency (prevent duplicate operations)
	'Idempotency-Key': 'idem_789xyz',

	// API version
	Accept: 'application/vnd.myapi.v2+json'
};
```

### Idempotency Key

client যখন একটি request retry করে (network timeout ইত্যাদি), তখন idempotency key ডুপ্লিকেট operation ঠেকায়।

```typescript
import { randomUUID } from 'crypto';

// Client side — generate a unique key per operation
async function createPayment(amount: number) {
	const idempotencyKey = randomUUID();

	const response = await fetch('/api/payments', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Idempotency-Key': idempotencyKey
		},
		body: JSON.stringify({ amount, currency: 'BDT' })
	});

	return response.json();
}

// Server side — check for duplicate requests
app.post('/api/payments', async (req, res) => {
	const idempotencyKey = req.headers['idempotency-key'];

	if (idempotencyKey) {
		const existing = await redis.get(`idempotency:${idempotencyKey}`);
		if (existing) {
			return res.status(200).json(JSON.parse(existing));
		}
	}

	const payment = await processPayment(req.body);

	if (idempotencyKey) {
		await redis.set(
			`idempotency:${idempotencyKey}`,
			JSON.stringify(payment),
			'EX',
			86400 // 24 hours
		);
	}

	res.status(201).json(payment);
});
```

### Request Body Validation

সবসময় incoming ডেটা validate করুন। কখনো client-কে বিশ্বাস করবেন না।

```typescript
import { z } from 'zod';

// Define the schema
const CreateUserSchema = z.object({
	name: z.string().min(2).max(100),
	email: z.string().email(),
	role: z.enum(['user', 'admin', 'moderator']).default('user'),
	age: z.number().int().min(13).max(150).optional(),
	tags: z.array(z.string()).max(10).default([])
});

type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Validation middleware
function validate<T>(schema: z.ZodSchema<T>) {
	return (req: express.Request, res: express.Response, next: express.NextFunction) => {
		const result = schema.safeParse(req.body);

		if (!result.success) {
			return res.status(422).json({
				error: 'Validation Error',
				details: result.error.issues.map((issue) => ({
					field: issue.path.join('.'),
					message: issue.message,
					code: issue.code
				}))
			});
		}

		req.body = result.data;
		next();
	};
}

app.post('/api/users', validate(CreateUserSchema), async (req, res) => {
	const user = await db.users.create(req.body);
	res.status(201).json({ data: user });
});
```

<Callout type="warning">

**কখনো Client Input বিশ্বাস করবেন না**

- client-এ validate করলেও সবসময় সার্ভারেও validate করুন
- XSS আর SQL injection ঠেকাতে string sanitize করুন
- array আর string-এর জন্য সর্বোচ্চ সাইজ সেট করুন
- blocklist-এর বদলে allowlist (valid value-এর enum) ব্যবহার করুন

</Callout>

## Response ডিজাইন

### Envelope Pattern

আপনার response-গুলো একটি সামঞ্জস্যপূর্ণ স্ট্রাকচারে মুড়ে দিন যাতে client সবসময় জানে কী আশা করা যায়:

```typescript
// Single resource
{
  "data": {
    "id": "user_42",
    "name": "Fatima Khan",
    "email": "fatima@example.com"
  },
  "meta": {
    "requestId": "req_abc123"
  }
}

// Collection
{
  "data": [
    { "id": "user_1", "name": "Rahim" },
    { "id": "user_2", "name": "Karim" }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "hasMore": true
  }
}

// Error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": [
      { "field": "email", "message": "Must be a valid email address" }
    ]
  },
  "meta": {
    "requestId": "req_def456"
  }
}
```

### Envelope ইমপ্লিমেন্ট করা

```typescript
// Response helper functions
interface ApiResponse<T> {
	data?: T;
	error?: {
		code: string;
		message: string;
		details?: Array<{ field: string; message: string }>;
	};
	meta?: Record<string, unknown>;
}

function success<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
	return { data, meta };
}

function paginated<T>(data: T[], page: number, limit: number, total: number): ApiResponse<T[]> {
	return {
		data,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
			hasMore: page * limit < total
		}
	};
}

function error(
	code: string,
	message: string,
	details?: Array<{ field: string; message: string }>
): ApiResponse<never> {
	return {
		error: { code, message, details }
	};
}

// Usage
app.get('/api/users', async (req, res) => {
	const page = Number(req.query.page) || 1;
	const limit = Number(req.query.limit) || 20;

	const [users, total] = await Promise.all([
		db.users
			.find()
			.skip((page - 1) * limit)
			.limit(limit),
		db.users.count()
	]);

	res.json(paginated(users, page, limit, total));
});

app.get('/api/users/:id', async (req, res) => {
	const user = await db.users.findById(req.params.id);
	if (!user) {
		return res.status(404).json(error('NOT_FOUND', `User ${req.params.id} not found`));
	}
	res.json(success(user));
});
```

## Error Response স্ট্যান্ডার্ড

### সামঞ্জস্যপূর্ণ Error Format

```typescript
// Define error codes as constants
const ErrorCodes = {
	VALIDATION_ERROR: 'VALIDATION_ERROR',
	NOT_FOUND: 'NOT_FOUND',
	UNAUTHORIZED: 'UNAUTHORIZED',
	FORBIDDEN: 'FORBIDDEN',
	CONFLICT: 'CONFLICT',
	RATE_LIMITED: 'RATE_LIMITED',
	INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

// Custom error class
class ApiError extends Error {
	constructor(
		public statusCode: number,
		public code: string,
		message: string,
		public details?: Array<{ field: string; message: string }>
	) {
		super(message);
	}
}

// Global error handler middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
	if (err instanceof ApiError) {
		return res.status(err.statusCode).json({
			error: {
				code: err.code,
				message: err.message,
				details: err.details
			},
			meta: { requestId: req.headers['x-request-id'] }
		});
	}

	// Unexpected errors — never leak internals
	console.error('Unhandled error:', err);
	res.status(500).json({
		error: {
			code: 'INTERNAL_ERROR',
			message: 'An unexpected error occurred'
		},
		meta: { requestId: req.headers['x-request-id'] }
	});
});
```

## Content Negotiation

Content negotiation client-কে জানাতে দেয় সে কোন format চায়:

```typescript
app.get('/api/reports/:id', async (req, res) => {
	const report = await db.reports.findById(req.params.id);
	if (!report) {
		return res.status(404).json(error('NOT_FOUND', 'Report not found'));
	}

	const accept = req.accepts(['json', 'csv', 'xml']);

	switch (accept) {
		case 'json':
			res.type('json').json({ data: report });
			break;
		case 'csv':
			res.type('csv').send(convertToCSV(report));
			break;
		case 'xml':
			res.type('xml').send(convertToXML(report));
			break;
		default:
			res.status(406).json(error('NOT_ACCEPTABLE', 'Supported formats: JSON, CSV, XML'));
	}
});
```

<Callout type="tip">

**Response ডিজাইন চেকলিস্ট**

- সবসময় response একটি envelope-এ মুড়ুন: `{ data, error, meta }`
- ডিবাগিংয়ের জন্য প্রতিটি response-এ একটি `requestId` রাখুন
- সব endpoint জুড়ে সামঞ্জস্যপূর্ণ error code ব্যবহার করুন
- না-থাকা optional ফিল্ডের জন্য `null` রিটার্ন করুন, বাদ দিন, বা default ব্যবহার করুন — একটি strategy বেছে নিয়ে তাতেই লেগে থাকুন
- সব list endpoint-এর জন্য pagination metadata রাখুন
- সঠিক `Content-Type` আর `Cache-Control` header সেট করুন

</Callout>

## Response Header

```typescript
// Common response headers
app.use((req, res, next) => {
	// Request tracing
	const requestId = req.headers['x-request-id'] || randomUUID();
	res.set('X-Request-Id', requestId);

	// Rate limiting info
	res.set('X-RateLimit-Limit', '1000');
	res.set('X-RateLimit-Remaining', '999');
	res.set('X-RateLimit-Reset', '1700003600');

	// Security headers
	res.set('X-Content-Type-Options', 'nosniff');
	res.set('X-Frame-Options', 'DENY');

	// Caching
	res.set('Cache-Control', 'no-store'); // default, override per route

	next();
});

// Cache static data
app.get('/api/countries', (req, res) => {
	res.set('Cache-Control', 'public, max-age=86400'); // Cache 24h
	res.json({ data: countries });
});
```

## মূল কথা

1. Zod-এর মতো একটি schema লাইব্রেরি দিয়ে **সব input validate করুন** — কখনো client ডেটা বিশ্বাস করবেন না
2. সব endpoint জুড়ে সামঞ্জস্যপূর্ণ response স্ট্রাকচারের জন্য **envelope pattern ব্যবহার করুন**
3. **Idempotency key** retry-এর সময় ডুপ্লিকেট operation ঠেকায়
4. machine-readable code আর human-readable message দিয়ে **error response স্ট্যান্ডার্ডাইজ করুন**
5. **Content negotiation** একই endpoint-কে Accept header অনুযায়ী JSON, CSV, বা XML সার্ভ করতে দেয়
6. ডিবাগিং সম্ভব করতে **প্রতিটি response-এ request ID রাখুন**
