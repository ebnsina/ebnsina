---
title: 'Auth at the Gateway'
subtitle: "JWT verification, API key validation, OAuth token introspection — handle identity once so your services don't have to."
chapter: 3
level: 'intermediate'
readingTime: '14 min'
topics: ['JWT', 'API keys', 'OAuth', 'authentication', 'authorization']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A building security desk — every visitor shows ID once at the front door. The guard checks it, issues a visitor badge (enriched request headers), and lets them through. Individual offices trust the badge; they don't re-verify identity for every meeting.

</Callout>

## Why Auth Belongs at the Gateway

Implementing auth in every service creates drift. Service A uses HS256 JWTs, Service B uses RS256, Service C forgot to check token expiry. The gateway centralizes this:

- One place to update signing keys
- One place to change token format
- Services receive pre-verified identity in headers — `X-User-Id`, `X-User-Role`

Services can still do **authorization** (can this user access this resource?) but **authentication** (is this a valid user?) lives at the edge.

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

**Backend service** — just reads headers, no crypto:

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

For machine-to-machine or developer API access:

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

When tokens are opaque (not self-contained JWTs), the gateway calls the auth server to validate them:

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

## Route-Level Auth Policies

Different routes have different requirements:

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

## Forwarding Identity Securely

Backend services must only trust these headers from the gateway — not from external clients. Ensure your internal network topology prevents external clients from setting these headers directly:

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

If your services are publicly reachable (not just via gateway), they must still verify these headers came from a trusted source — use mTLS or a shared internal secret to sign gateway requests.
