---
title: 'REST Fundamentals'
subtitle: 'Understand RESTful principles, HTTP methods, status codes, and resource naming conventions that form the backbone of modern APIs.'
chapter: 1
level: 'beginner'
readingTime: '14 min'
topics: ['REST', 'HTTP methods', 'status codes', 'resource naming']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What is REST?

REST (Representational State Transfer) is an architectural style for designing networked applications. It was defined by Roy Fielding in his 2000 doctoral dissertation and has become the dominant approach for building web APIs.

REST is not a protocol — it is a set of constraints. When an API follows these constraints, we call it RESTful.

<Callout type="info">

**Real-World Analogy**

Like a restaurant menu — GET reads the menu, POST places an order, PUT modifies your order, DELETE cancels it. The menu defines what you can request and what you'll get back.

</Callout>

## The Six REST Constraints

REST defines six architectural constraints:

1. **Client-Server** — Separate the user interface from the data storage
2. **Stateless** — Each request contains all the information needed to process it
3. **Cacheable** — Responses must define themselves as cacheable or not
4. **Uniform Interface** — A consistent way to interact with resources
5. **Layered System** — The client cannot tell if it is connected directly to the server
6. **Code on Demand** (optional) — Servers can send executable code to clients

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

## HTTP Methods

HTTP methods (also called verbs) define the action to perform on a resource:

| Method | Purpose                     | Idempotent | Safe | Has Body |
| ------ | --------------------------- | ---------- | ---- | -------- |
| GET    | Read a resource             | Yes        | Yes  | No       |
| POST   | Create a resource           | No         | No   | Yes      |
| PUT    | Replace a resource entirely | Yes        | No   | Yes      |
| PATCH  | Partially update a resource | No         | No   | Yes      |
| DELETE | Remove a resource           | Yes        | No   | Optional |

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

**PUT vs PATCH Confusion**

PUT replaces the entire resource. If you PUT a user with only `{ name: "Rahim" }`, you will lose the email and role fields. PATCH only updates the fields you send. Most APIs should use PATCH for updates unless you genuinely want full replacement semantics.

</Callout>

## HTTP Status Codes

Status codes tell the client what happened. They are grouped by category:

### 2xx — Success

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

### 4xx — Client Errors

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

### 5xx — Server Errors

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

**Status Code Rules of Thumb**

- Use **201** for successful POST, not 200
- Use **204** for DELETE when you return no body
- Use **404** for missing resources, not a 200 with an empty body
- Use **422** when the JSON is valid but the data fails validation
- Never return a **200** with an error message in the body — that defeats the purpose of status codes

</Callout>

## Resource Naming Conventions

Good resource naming is the most important part of API design. URLs should represent resources (nouns), not actions (verbs).

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

### Naming Rules

1. **Use plural nouns** — `/users`, not `/user`
2. **Use kebab-case** — `/order-items`, not `/orderItems`
3. **Nest for relationships** — `/users/42/orders` (orders belonging to user 42)
4. **Keep it shallow** — max 2-3 levels of nesting
5. **Use query params for filtering** — `/users?role=admin&active=true`

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

**Common Naming Mistakes**

- Using verbs: `/getUser` instead of `GET /users/:id`
- Inconsistent pluralization: `/user/42/orders` vs `/products`
- CamelCase in URLs: `/orderItems` instead of `/order-items`
- Trailing slashes inconsistency: some endpoints with `/`, some without

</Callout>

## Putting It All Together

Here is a complete example of a RESTful resource definition using Express:

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

## Key Takeaways

1. **REST is a set of constraints**, not a protocol — statelessness, uniform interface, and cacheability are the core ideas
2. **HTTP methods map to CRUD** — GET reads, POST creates, PUT/PATCH updates, DELETE removes
3. **Status codes communicate outcomes** — use the right code for the right situation
4. **URLs represent resources** — use plural nouns, kebab-case, and shallow nesting
5. **Every request must be self-contained** — no server-side session state between requests
