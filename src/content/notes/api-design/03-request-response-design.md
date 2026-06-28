---
title: 'Request & Response Design'
subtitle: 'Design clean request and response structures with proper headers, content negotiation, error formats, and envelope patterns.'
chapter: 3
level: 'intermediate'
readingTime: '15 min'
topics: ['request design', 'response design', 'headers', 'content negotiation', 'error handling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Structure Matters

A well-designed request/response structure makes your API predictable. When every endpoint follows the same patterns, developers can guess how a new endpoint works without reading the docs.

<Callout type="info">

**Real-World Analogy**

Like filling out a form at a government office — the form has required fields (headers), a body (your information), and you get back a receipt with a status stamp.

</Callout>

## Request Design

### Request Headers

Headers carry metadata about the request. These are the essential ones:

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

### Idempotency Keys

Idempotency keys prevent duplicate operations when a client retries a request (network timeout, etc.).

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

Always validate incoming data. Never trust the client.

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

**Never Trust Client Input**

- Always validate on the server, even if you validate on the client
- Sanitize strings to prevent XSS and SQL injection
- Set maximum sizes for arrays and strings
- Use allowlists (enum of valid values) instead of blocklists

</Callout>

## Response Design

### The Envelope Pattern

Wrap your responses in a consistent structure so clients always know what to expect:

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

### Implementing the Envelope

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

## Error Response Standards

### Consistent Error Format

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

Content negotiation lets clients specify what format they want:

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

**Response Design Checklist**

- Always wrap responses in an envelope: `{ data, error, meta }`
- Include a `requestId` in every response for debugging
- Use consistent error codes across all endpoints
- Return `null` for missing optional fields, omit them, or use a default — pick one strategy and stick with it
- Include pagination metadata for all list endpoints
- Set proper `Content-Type` and `Cache-Control` headers

</Callout>

## Response Headers

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

## Key Takeaways

1. **Validate all input** with a schema library like Zod — never trust client data
2. **Use an envelope pattern** for consistent response structure across all endpoints
3. **Idempotency keys** prevent duplicate operations on retries
4. **Standardize error responses** with machine-readable codes and human-readable messages
5. **Content negotiation** lets the same endpoint serve JSON, CSV, or XML based on the Accept header
6. **Include request IDs** in every response to make debugging possible
