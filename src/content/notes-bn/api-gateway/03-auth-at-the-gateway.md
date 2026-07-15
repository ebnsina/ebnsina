---
title: 'Auth at the Gateway'
subtitle: 'JWT verification, API key validation, OAuth token introspection — identity একবারই সামলান যাতে আপনার সার্ভিসগুলোকে না করতে হয়।'
chapter: 3
level: 'intermediate'
readingTime: '14 মিনিট'
topics: ['JWT', 'API keys', 'OAuth', 'authentication', 'authorization']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা বিল্ডিংয়ের security ডেস্ক — প্রতিটা visitor সামনের দরজায় একবার ID দেখায়। গার্ড সেটা যাচাই করে, একটা visitor badge দেয় (enriched request header), আর তাকে ভেতরে ঢুকতে দেয়। আলাদা আলাদা অফিস সেই badge-কে বিশ্বাস করে; প্রতিটা মিটিংয়ের জন্য তারা আবার identity যাচাই করে না।

</Callout>

## গল্পে বুঝি

ইবনে সিনা একটা বিশাল গবেষণাকেন্দ্রের নিরাপত্তার দায়িত্বে। ভেতরে অসংখ্য ল্যাব, অফিস আর স্টোররুম — সবগুলোই সংরক্ষিত। শুরুতে প্রতিটা ঘরের দরজায় আলাদা আলাদা গার্ড বসানো ছিল, প্রত্যেকে নিজের মতো করে সবার ID কার্ড, ছবি আর অনুমতিপত্র মিলিয়ে দেখত। ফল হলো — একই লোককে দিনে বিশবার থামতে হতো, কোনো গার্ড আবার যাচাই করতে ভুলে যেত, আর নিয়ম বদলালে প্রত্যেক গার্ডকে আলাদা করে শেখাতে হতো।

ইবনে সিনা পুরোটা বদলে দিলেন। এখন পুরো ভবনে ঢোকার একটাই মূল ফটক, আর সেখানে একটাই নিরাপত্তা চেকপয়েন্ট। ফাতিমা আল-ফিহরি সেখানে একবারই সবার ID পুঙ্খানুপুঙ্খ যাচাই করেন, তারপর হাতে পরিয়ে দেন একটা বিশ্বস্ত ভেতরের রিস্টব্যান্ড — যাতে লেখা থাকে ব্যক্তিটি কে আর কোন কোন এলাকায় সে যেতে পারবে। ভেতরের ল্যাব বা অফিস এবার শুধু রিস্টব্যান্ডটায় একনজর তাকায়, নতুন করে আর ID যাচাই করে না। আর গোটা ভবনটা এমনভাবে বানানো যে ওই একটা চেকপয়েন্ট ছাড়া ভেতরে ঢোকার আর কোনো ফাঁক নেই — জানালা দিয়ে বা পেছনের দরজা দিয়ে কেউ ঢুকে পড়তে পারে না।

এই গল্পটাই gateway-তে centralised auth। মূল ফটকের চেকপয়েন্ট হলো API gateway, যে edge-এ একবারই token যাচাই (authentication) করে। রিস্টব্যান্ডটা হলো সেই verified identity, যেটা gateway header-এ করে backend-এর কাছে পাঠায়। ভেতরের ঘরগুলো আবার ID না দেখা মানে backend service-গুলোকে নিজে নিজে auth reimplement করতে হয় না। আর চেকপয়েন্ট ছাড়া ঢোকার পথ না থাকা মানে backend শুধু gateway থেকে আসা traffic-কেই বিশ্বাস করে — বাইরের কেউ যেন সরাসরি identity header বসিয়ে ঢুকে না পড়ে। বাস্তবেও ঠিক এ কারণেই backend-কে publicly reachable রাখলে mTLS বা shared secret দিয়ে নিশ্চিত করতে হয় যে header-টা সত্যিই gateway থেকেই এসেছে।

## Auth কেন Gateway-তে থাকে

প্রতিটা সার্ভিসে auth বানালে drift তৈরি হয়। Service A HS256 JWT ব্যবহার করে, Service B RS256, Service C token expiry যাচাই করতে ভুলে গেছে। gateway এটা এক জায়গায় নিয়ে আসে:

- signing key আপডেট করার একটাই জায়গা
- token format বদলানোর একটাই জায়গা
- সার্ভিসগুলো header-এ আগেই যাচাই-করা identity পায় — `X-User-Id`, `X-User-Role`

সার্ভিসগুলো এখনো **authorization** করতে পারে (এই user কি এই resource ব্যবহার করতে পারবে?) কিন্তু **authentication** (এটা কি একটা valid user?) থাকে edge-এ।

## JWT Verification

```typescript
// Gateway middleware — runs before every proxied request
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// For RS256: fetch public keys from JWKS endpoint
const JWKS = createRemoteJWKSet(new URL('https://auth.yourapp.com/.well-known/jwks.json'));

async function verifyJWT(req: Request, res: Response, next: NextFunction) {
	const authHeader = req.headers['authorization'];
	if (!authHeader?.startsWith('Bearer ')) {
		return res.status(401).json({ error: 'Missing token' });
	}

	const token = authHeader.slice(7);

	try {
		const { payload } = await jwtVerify(token, JWKS, {
			issuer: 'https://auth.yourapp.com',
			audience: 'api'
		});

		// Forward verified identity to backend services
		req.headers['x-user-id'] = payload.sub as string;
		req.headers['x-user-role'] = payload.role as string;
		req.headers['x-user-email'] = payload.email as string;

		// Remove raw JWT — services don't need it
		delete req.headers['authorization'];

		next();
	} catch (err) {
		return res.status(401).json({ error: 'Invalid token' });
	}
}
```

**Backend service** — শুধু header পড়ে, কোনো crypto নেই:

```typescript
app.get('/api/orders', (req, res) => {
	const userId = req.headers['x-user-id'];
	const role = req.headers['x-user-role'];

	// No JWT parsing — gateway already verified
	const orders = await db.orders.findByUser(userId);
	res.json(orders);
});
```

## API Key Auth

machine-to-machine বা developer API access-এর জন্য:

```typescript
interface ApiKey {
	id: string;
	hashedKey: string;
	ownerId: string;
	scopes: string[];
	rateLimit: number; // requests per minute
}

async function verifyApiKey(req: Request, res: Response, next: NextFunction) {
	const key = (req.headers['x-api-key'] as string) ?? (req.query.api_key as string);

	if (!key) {
		return res.status(401).json({ error: 'API key required' });
	}

	// Hash the incoming key and compare against stored hashes
	// Never store plaintext API keys
	const keyHash = hashApiKey(key);
	const apiKey = await db.apiKeys.findByHash(keyHash);

	if (!apiKey) {
		return res.status(401).json({ error: 'Invalid API key' });
	}

	// Forward identity
	req.headers['x-owner-id'] = apiKey.ownerId;
	req.headers['x-scopes'] = apiKey.scopes.join(',');

	// Apply key-specific rate limit
	req.rateLimit = apiKey.rateLimit;

	next();
}

function hashApiKey(key: string): string {
	return crypto.createHash('sha256').update(key).digest('hex');
}
```

## OAuth Token Introspection

যখন token opaque হয় (self-contained JWT নয়), তখন gateway সেগুলো validate করতে auth server-কে কল করে:

```typescript
async function introspectToken(token: string): Promise<TokenInfo | null> {
	const response = await fetch('https://auth.yourapp.com/oauth/introspect', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
		},
		body: new URLSearchParams({ token })
	});

	const data = await response.json();
	if (!data.active) return null;

	return {
		sub: data.sub,
		scope: data.scope,
		exp: data.exp
	};
}

// Cache introspection results — don't call auth server on every request
const introspectCached = memoize(introspectToken, {
	ttl: 30_000, // 30s cache — balance freshness vs load
	keyFn: (token) => token
});
```

## Route-Level Auth Policy

আলাদা আলাদা route-এর আলাদা আলাদা requirement থাকে:

```typescript
type AuthPolicy =
	| { type: 'public' }
	| { type: 'jwt'; roles?: string[] }
	| { type: 'api-key'; scopes?: string[] }
	| { type: 'any' }; // jwt or api-key

const routePolicies: Array<{ pattern: RegExp; method?: string; policy: AuthPolicy }> = [
	{ pattern: /^\/health$/, policy: { type: 'public' } },
	{ pattern: /^\/api\/public\//, policy: { type: 'public' } },
	{ pattern: /^\/api\/admin\//, policy: { type: 'jwt', roles: ['admin'] } },
	{ pattern: /^\/api\/v1\//, policy: { type: 'any' } }
];

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
	const policy = routePolicies.find((r) => r.pattern.test(req.path))?.policy ?? { type: 'jwt' }; // default: require JWT

	if (policy.type === 'public') return next();

	// ... check based on policy type
}
```

## Identity নিরাপদে Forward করা

Backend সার্ভিসগুলোর উচিত এই header-গুলো শুধু gateway থেকেই বিশ্বাস করা — external client থেকে নয়। আপনার internal network topology নিশ্চিত করুক যাতে external client সরাসরি এই header সেট করতে না পারে:

```typescript
// Strip any x-user-* headers from the original request
// before applying gateway-set values
function sanitizeInternalHeaders(req: Request): void {
	const internal = ['x-user-id', 'x-user-role', 'x-user-email', 'x-owner-id'];
	for (const header of internal) {
		delete req.headers[header];
	}
}

// Apply in order: sanitize first, then set from verified token
app.use(sanitizeInternalHeaders);
app.use(verifyJWT);
```

আপনার সার্ভিসগুলো যদি publicly reachable হয় (শুধু gateway দিয়ে নয়), তবুও তাদের যাচাই করতে হবে এই header-গুলো একটা trusted source থেকে এসেছে কিনা — gateway request sign করতে mTLS বা একটা shared internal secret ব্যবহার করুন।
