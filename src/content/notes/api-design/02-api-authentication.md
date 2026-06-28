---
title: 'API Authentication'
subtitle: 'Secure your APIs with API keys, OAuth 2.0, JWT tokens, and session-based auth — understand when to use each approach.'
chapter: 2
level: 'beginner'
readingTime: '12 min'
topics: ['authentication', 'API keys', 'OAuth 2.0', 'JWT', 'sessions']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Authentication vs Authorization

Before diving in, understand the difference:

- **Authentication** (AuthN) — Who are you? Proving your identity.
- **Authorization** (AuthZ) — What can you do? Checking permissions.

Every API request must first authenticate the caller, then check if they are authorized to perform the requested action.

<Callout type="info">

**Real-World Analogy**

Like a hotel key card — at check-in (login), you verify your ID and receive a key card (token). The card opens your room and the pool but not the staff area. Lost cards can be deactivated instantly.

</Callout>

## API Keys

The simplest form of authentication. The server generates a unique key, and the client sends it with every request.

```typescript
// Client sends API key in header
const response = await fetch('https://api.example.com/data', {
	headers: {
		'X-API-Key': 'sk_live_abc123def456'
	}
});

// Server validates the key
import express from 'express';

function apiKeyAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
	const apiKey = req.headers['x-api-key'];

	if (!apiKey) {
		return res.status(401).json({ error: 'API key is required' });
	}

	const client = await db.apiKeys.findOne({ key: apiKey, active: true });
	if (!client) {
		return res.status(401).json({ error: 'Invalid API key' });
	}

	// Attach client info for authorization later
	req.client = client;
	next();
}

app.use('/api', apiKeyAuth);
```

<Callout type="warning">

**API Key Security**

- Never embed API keys in frontend JavaScript — anyone can read them
- API keys should be sent in headers, never in URLs (URLs get logged)
- Rotate keys periodically and support multiple active keys during rotation
- Prefix keys with their type: `sk_live_` (secret live), `pk_test_` (public test)

</Callout>

### When to Use API Keys

- Server-to-server communication
- Rate limiting and usage tracking
- Public APIs where you need to identify the caller
- NOT for user-facing authentication (use OAuth/JWT instead)

## JWT (JSON Web Tokens)

JWTs are self-contained tokens that encode user information and a signature. The server does not need to look up a database to validate them.

A JWT has three parts: **Header.Payload.Signature**

```typescript
// JWT structure (base64-decoded)
// Header
{
  "alg": "HS256",
  "typ": "JWT"
}

// Payload (claims)
{
  "sub": "user_42",
  "name": "Karim Hossain",
  "role": "admin",
  "iat": 1700000000,
  "exp": 1700003600  // Expires in 1 hour
}

// Signature
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

### Implementing JWT Auth

```typescript
import jwt from 'jsonwebtoken';
import express from 'express';

const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';

// Login endpoint — issue tokens
app.post('/api/auth/login', async (req, res) => {
	const { email, password } = req.body;

	const user = await db.users.findByEmail(email);
	if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
		return res.status(401).json({ error: 'Invalid credentials' });
	}

	const accessToken = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, {
		expiresIn: ACCESS_TOKEN_TTL
	});

	const refreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, JWT_SECRET, {
		expiresIn: REFRESH_TOKEN_TTL
	});

	// Store refresh token hash in DB for revocation
	await db.refreshTokens.create({
		userId: user.id,
		tokenHash: hashToken(refreshToken),
		expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
	});

	res.json({ accessToken, refreshToken });
});

// Middleware — verify JWT on protected routes
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
	const authHeader = req.headers.authorization;
	if (!authHeader?.startsWith('Bearer ')) {
		return res.status(401).json({ error: 'Missing token' });
	}

	const token = authHeader.slice(7);
	try {
		const payload = jwt.verify(token, JWT_SECRET) as { sub: string; role: string };
		req.user = { id: payload.sub, role: payload.role };
		next();
	} catch (err) {
		if (err instanceof jwt.TokenExpiredError) {
			return res.status(401).json({ error: 'Token expired' });
		}
		return res.status(401).json({ error: 'Invalid token' });
	}
}

// Refresh endpoint — issue a new access token
app.post('/api/auth/refresh', async (req, res) => {
	const { refreshToken } = req.body;

	try {
		const payload = jwt.verify(refreshToken, JWT_SECRET) as { sub: string; type: string };
		if (payload.type !== 'refresh') {
			return res.status(401).json({ error: 'Invalid token type' });
		}

		// Check if refresh token is still valid in DB
		const stored = await db.refreshTokens.findOne({
			userId: payload.sub,
			tokenHash: hashToken(refreshToken)
		});
		if (!stored) {
			return res.status(401).json({ error: 'Token revoked' });
		}

		const accessToken = jwt.sign({ sub: payload.sub, role: 'user' }, JWT_SECRET, {
			expiresIn: ACCESS_TOKEN_TTL
		});

		res.json({ accessToken });
	} catch {
		res.status(401).json({ error: 'Invalid refresh token' });
	}
});
```

<Callout type="tip">

**JWT Best Practices**

- Keep access tokens short-lived (5-15 minutes)
- Use refresh tokens (7-30 days) to get new access tokens
- Store refresh token hashes in the database so you can revoke them
- Never store sensitive data in the JWT payload — it is base64-encoded, not encrypted
- Use `RS256` (asymmetric) for microservices so services can verify tokens without knowing the secret

</Callout>

## OAuth 2.0

OAuth 2.0 is a framework for delegated authorization. It lets users grant third-party apps limited access to their accounts without sharing passwords.

### The Authorization Code Flow

This is the most common flow for web applications:

```typescript
// Step 1: Redirect user to authorization server
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', 'https://myapp.com/callback');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'openid email profile');
authUrl.searchParams.set('state', generateRandomState()); // CSRF protection

// Redirect: window.location.href = authUrl.toString();

// Step 2: Handle callback — exchange code for tokens
app.get('/callback', async (req, res) => {
	const { code, state } = req.query;

	// Verify state to prevent CSRF
	if (state !== req.session.oauthState) {
		return res.status(403).json({ error: 'Invalid state' });
	}

	// Exchange authorization code for tokens
	const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code: code as string,
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			redirect_uri: 'https://myapp.com/callback',
			grant_type: 'authorization_code'
		})
	});

	const { access_token, refresh_token, id_token } = await tokenResponse.json();

	// Step 3: Use access token to get user info
	const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: { Authorization: `Bearer ${access_token}` }
	}).then((r) => r.json());

	// Create or update user in your database
	const user = await db.users.upsert({
		email: userInfo.email,
		name: userInfo.name,
		googleId: userInfo.id
	});

	// Issue your own JWT
	const jwt = issueJWT(user);
	res.redirect(`/dashboard?token=${jwt}`);
});
```

## Session-Based Authentication

The traditional approach — server stores session data, client stores a session ID cookie.

```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

app.use(
	session({
		store: new RedisStore({ client: redisClient }),
		secret: process.env.SESSION_SECRET!,
		resave: false,
		saveUninitialized: false,
		cookie: {
			secure: true, // HTTPS only
			httpOnly: true, // No JavaScript access
			sameSite: 'strict', // CSRF protection
			maxAge: 24 * 60 * 60 * 1000 // 24 hours
		}
	})
);

// Login — create session
app.post('/api/login', async (req, res) => {
	const { email, password } = req.body;
	const user = await db.users.findByEmail(email);

	if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
		return res.status(401).json({ error: 'Invalid credentials' });
	}

	req.session.userId = user.id;
	req.session.role = user.role;
	res.json({ message: 'Logged in' });
});

// Middleware — check session
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
	if (!req.session.userId) {
		return res.status(401).json({ error: 'Not authenticated' });
	}
	next();
}
```

## Choosing the Right Method

| Method    | Best For                         | Stateless? | Scalability |
| --------- | -------------------------------- | ---------- | ----------- |
| API Keys  | Server-to-server, public APIs    | Yes        | High        |
| JWT       | SPAs, mobile apps, microservices | Yes        | High        |
| Sessions  | Traditional web apps, SSR        | No         | Medium      |
| OAuth 2.0 | Third-party access, SSO          | Depends    | High        |

<Callout type="tip">

**Decision Guide**

- Building a public API? Start with **API keys**
- Building an SPA or mobile app? Use **JWT** with refresh tokens
- Building a server-rendered web app? **Sessions** with Redis are battle-tested
- Need "Login with Google/GitHub"? **OAuth 2.0** Authorization Code flow
- Microservices? **JWT with RS256** — services verify without shared secrets

</Callout>

## Key Takeaways

1. **Authentication proves identity**, authorization checks permissions — they are separate concerns
2. **API keys** are simple but only suitable for server-to-server or identifying public API consumers
3. **JWTs** are stateless and scalable but require short expiry + refresh token rotation
4. **OAuth 2.0** delegates authorization — the user grants your app permission without sharing their password
5. **Sessions** are stateful but simpler to implement and easier to revoke
