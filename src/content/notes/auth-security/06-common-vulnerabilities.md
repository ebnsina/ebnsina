---
title: 'Common Auth Vulnerabilities'
subtitle: 'CSRF, session fixation, timing attacks, insecure direct object references — what they are and how to close them.'
chapter: 6
level: 'intermediate'
readingTime: '12 min'
topics: ['CSRF', 'session fixation', 'IDOR', 'timing attacks', 'OWASP']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A locksmith's education: understanding how locks are picked isn't to enable burglary — it's to know which locks are actually secure. Security engineers study attack patterns to build defenses, not exploits.

</Callout>

## Cross-Site Request Forgery (CSRF)

A CSRF attack tricks an authenticated user's browser into making an unintended request to your server. The browser automatically includes cookies, so the request looks legitimate.

**The attack:**

```html
<!-- On attacker.com -->
<form action="https://yourbank.com/transfer" method="POST" id="f">
	<input name="to" value="attacker-account" />
	<input name="amount" value="10000" />
</form>
<script>
	document.getElementById('f').submit();
</script>
```

If the user is logged in to yourbank.com, their session cookie is sent automatically.

**Defense 1: SameSite cookies**

```typescript
res.cookie('session', sessionId, {
	httpOnly: true,
	secure: true,
	sameSite: 'strict' // browser won't send cookie on cross-site requests
});
```

`SameSite=Strict` is the strongest defense. `Lax` (the default in modern browsers) allows the cookie on top-level GET navigations but not POST.

**Defense 2: CSRF tokens**
For APIs that can't rely on SameSite (e.g., older browser support, subdomains):

```typescript
import crypto from 'crypto';

// Generate token tied to session
function generateCsrfToken(sessionId: string): string {
	const secret = process.env.CSRF_SECRET!;
	return crypto.createHmac('sha256', secret).update(sessionId).digest('hex');
}

// Middleware: validate on state-changing requests
function csrfProtection(req: Request, res: Response, next: NextFunction): void {
	if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

	const sessionToken = generateCsrfToken(req.session.id);
	const clientToken = req.headers['x-csrf-token'] as string;

	if (
		!clientToken ||
		!crypto.timingSafeEqual(Buffer.from(sessionToken), Buffer.from(clientToken))
	) {
		return res.status(403).json({ error: 'CSRF token invalid' });
	}

	next();
}

// Expose token to client (embed in page or via endpoint)
app.get('/api/csrf-token', (req, res) => {
	res.json({ token: generateCsrfToken(req.session.id) });
});
```

The client sends this token as a header (e.g., `X-CSRF-Token`). A cross-origin attacker can't read the token because of the same-origin policy.

**Note:** If you're using JWT in Authorization headers (not cookies), you don't need CSRF protection — the attacker can't set arbitrary headers cross-origin.

## Session Fixation

An attacker sets a known session ID before the user logs in, then after login, uses that same session ID to impersonate the authenticated session.

**The fix:** Always regenerate the session ID on login:

```typescript
app.post('/login', async (req, res) => {
	const user = await verifyCredentials(req.body.email, req.body.password);
	if (!user) return res.status(401).json({ error: 'Invalid credentials' });

	// Regenerate session ID — attacker's pre-set ID is now useless
	await new Promise<void>((resolve, reject) => {
		req.session.regenerate((err) => (err ? reject(err) : resolve()));
	});

	req.session.userId = user.id;
	res.json({ ok: true });
});
```

Similarly, regenerate on logout:

```typescript
app.post('/logout', (req, res) => {
	req.session.destroy(() => {
		res.clearCookie('session');
		res.json({ ok: true });
	});
});
```

## Timing Attacks

If your login function returns faster for "user not found" than for "wrong password," an attacker can enumerate valid emails by measuring response times.

**The attack:**

```
POST /login {"email": "test1@example.com"} → 2ms (user not found — no DB hit)
POST /login {"email": "admin@yourapp.com"} → 120ms (user found, hash compared)
```

**The fix:** Always do the expensive operation regardless of outcome:

```typescript
const DUMMY_HASH = await argon2.hash('dummy-password');

async function login(email: string, password: string): Promise<User | null> {
	const user = await db.users.findByEmail(email);

	if (!user) {
		// Still compare against a dummy hash — same time cost
		await argon2.verify(DUMMY_HASH, password).catch(() => {});
		return null;
	}

	const valid = await argon2.verify(user.passwordHash, password);
	return valid ? user : null;
}
```

**String comparison timing:** Use `crypto.timingSafeEqual` when comparing secrets:

```typescript
// WRONG — exits early on first mismatch
if (userToken === expectedToken) ...

// RIGHT — always compares all bytes
if (crypto.timingSafeEqual(
  Buffer.from(userToken),
  Buffer.from(expectedToken),
)) ...
```

## Insecure Direct Object References (IDOR)

User A accesses User B's data by guessing or incrementing an ID.

```
GET /api/orders/12345  → User A's order (they're logged in)
GET /api/orders/12346  → User B's order (oops — just incremented)
```

**The fix:** Always enforce ownership in queries:

```typescript
// WRONG — only checks auth, not ownership
app.get('/api/orders/:id', requireAuth, async (req, res) => {
	const order = await db.orders.findById(req.params.id);
	if (!order) return res.status(404).json({ error: 'Not found' });
	res.json(order);
});

// RIGHT — ownership is part of the query
app.get('/api/orders/:id', requireAuth, async (req, res) => {
	const order = await db.orders.findOne({
		where: { id: req.params.id, userId: req.user.id } // must match both
	});
	if (!order) return res.status(404).json({ error: 'Not found' });
	res.json(order);
});
```

Also consider using random IDs (UUIDs) instead of sequential integers — they're harder to guess, though not a substitute for ownership checks.

## Mass Assignment

Allowing users to set any field via a bulk assignment operation:

```typescript
// WRONG — user can set role: 'admin', isVerified: true, etc.
app.put('/api/users/:id', requireAuth, async (req, res) => {
	await db.users.update(req.params.id, req.body); // uses everything from body
	res.json({ ok: true });
});

// RIGHT — explicit allowlist
app.put('/api/users/:id', requireAuth, async (req, res) => {
	const allowed = ['name', 'bio', 'avatarUrl'];
	const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
	await db.users.update(req.params.id, updates);
	res.json({ ok: true });
});
```

Use a validation library (Zod, Joi) to define exact shapes for incoming data rather than filtering manually.

## JWT Vulnerabilities (Practical)

**Accepting unsigned tokens:**

```typescript
// WRONG — 'none' alg accepted
jwt.verify(token, secret); // some libraries accept alg:none by default

// RIGHT — explicit algorithm allowlist
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

**Not verifying claims:**

```typescript
// WRONG — only checks signature
const payload = jwt.verify(token, secret);
// payload.exp might be in the past
// payload.iss might be a different auth server
// payload.aud might be a different service

// RIGHT — verify all relevant claims
const payload = jwt.verify(token, secret, {
	algorithms: ['HS256'],
	issuer: 'https://auth.yourapp.com',
	audience: 'api'
	// exp checked automatically
});
```

**Long-lived tokens:**

```typescript
// WRONG — 30-day access token means 30 days of exposure if leaked
jwt.sign({ sub: userId }, secret, { expiresIn: '30d' });

// RIGHT — short access tokens, rotate via refresh
jwt.sign({ sub: userId }, secret, { expiresIn: '15m' });
```

## Broken Object Level Authorization (BOLA/IDOR) in APIs

GraphQL and REST APIs that expose IDs are especially prone:

```graphql
# Attacker queries another user's data
query {
	user(id: "another-user-id") {
		email
		creditCards {
			number
		}
	}
}
```

```typescript
// GraphQL resolver — must enforce auth
const resolvers = {
	Query: {
		user: async (_: unknown, { id }: { id: string }, context: Context) => {
			if (!context.user) throw new AuthenticationError('Not authenticated');

			// Only allow users to query themselves, unless admin
			if (id !== context.user.id && context.user.role !== 'admin') {
				throw new ForbiddenError('Not authorized');
			}

			return db.users.findById(id);
		}
	}
};
```

## Security Headers

Add these on every response:

```typescript
app.use((req, res, next) => {
	// Prevent MIME type sniffing
	res.set('X-Content-Type-Options', 'nosniff');

	// Prevent clickjacking
	res.set('X-Frame-Options', 'DENY');

	// XSS protection (legacy browsers)
	res.set('X-XSS-Protection', '1; mode=block');

	// HTTPS only
	res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

	// Content Security Policy
	res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'");

	// Don't send referrer to external sites
	res.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	next();
});
```

Or use [Helmet](https://helmetjs.github.io/) which sets sensible defaults:

```typescript
import helmet from 'helmet';
app.use(helmet());
```
