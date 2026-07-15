---
title: 'API Authentication'
subtitle: 'API key, OAuth 2.0, JWT token, আর session-based auth দিয়ে আপনার API সুরক্ষিত করুন — কখন কোনটা ব্যবহার করবেন তা বুঝে নিন।'
chapter: 2
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['authentication', 'API keys', 'OAuth 2.0', 'JWT', 'sessions']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ধানমন্ডিতে একটা মেম্বার-অনলি ক্লাব আছে, যেখানে শুধু সদস্যরাই ঢুকতে পারে। প্রতিটি সদস্যের কাছে একটা পার্সোনাল মেম্বারশিপ কার্ড থাকে, আর সেই কার্ডে খোদাই করা থাকে একটা গোপন নম্বর — শুধু ওই সদস্য আর ক্লাবের অফিসই সেটা জানে। করিম সেদিন গেটে কার্ডটা দেখাল, দারোয়ান নম্বরটা মিলিয়ে দেখল আসল সদস্য কিনা, তারপরই ভেতরে ঢুকতে দিল। কিন্তু ভেতরে তো অনেকগুলো রুম — জিম, রেস্টুরেন্ট, লাইব্রেরি। প্রতিটা রুমের সামনে গিয়ে বারবার গোপন নম্বরওয়ালা কার্ড বের করাটা যেমন ঝামেলা, তেমনি ঝুঁকিরও — বারবার দেখালে কেউ নম্বরটা দেখে ফেলতে পারে।

তাই ক্লাব একটা সহজ ব্যবস্থা রাখে। গেটে একবার কার্ড যাচাই হয়ে গেলে ফাতেমা রিসেপশন থেকে হাতে একটা ছোট এন্ট্রি স্ট্যাম্প নিয়ে নেয় — সেটা শুধু ওই দিনটার জন্য বৈধ, রাত হলেই মুছে যায়। এরপর প্রতিটা রুমে সে শুধু হাতের স্ট্যাম্পটা দেখায়, আর গোপন কার্ড বের করতে হয় না। আবার রহিম নিজে সদস্য নয়, কিন্তু তার বন্ধু একজন পুরনো সদস্য তাকে স্পন্সর করে অফিসকে বলে দিয়েছে — "ও শুধু রেস্টুরেন্টে বসবে, আর কোথাও নয়।" অফিস রহিমকে সীমিত অ্যাক্সেসের একটা পাস দেয়, বন্ধুর গোপন কার্ড নম্বর তাকে জানাতে হয় না।

এই পুরো ব্যাপারটাই আসলে **API authentication**। গোপন নম্বরওয়ালা মেম্বারশিপ কার্ড হলো **API key** — server-to-server কল বা কোনো সার্ভিসকে শনাক্ত করতে যেমন Stripe বা OpenAI এর secret key ব্যবহার হয়। দিনের জন্য বৈধ এন্ট্রি স্ট্যাম্প হলো **token/session** (যেমন JWT) — একবার login করে বারবার password না দিয়েই প্রতিটা request-এ সেই short-lived token পাঠানো, যেটার একটা expiry থাকে। আর স্পন্সরের মাধ্যমে সীমিত পাস পাওয়াটা হলো **OAuth** delegation — "Login with Google" এ আপনি Google-কে দিয়ে অ্যাপকে শুধু email-নাম দেখার সীমিত অনুমতি দেন, নিজের Google password কখনো অ্যাপকে দেন না।

## Authentication বনাম Authorization

শুরু করার আগে পার্থক্যটা বুঝে নিন:

- **Authentication** (AuthN) — আপনি কে? নিজের পরিচয় প্রমাণ করা।
- **Authorization** (AuthZ) — আপনি কী করতে পারবেন? পারমিশন চেক করা।

প্রতিটি API request-এ প্রথমে caller-কে authenticate করতে হবে, তারপর চেক করতে হবে সে যে অ্যাকশন চাইছে তার জন্য সে authorized কিনা।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

হোটেলের key card-এর মতো — check-in (login)-এ আপনার ID যাচাই করা হয় আর আপনি একটি key card (token) পান। কার্ডটা আপনার রুম আর পুল খোলে, কিন্তু স্টাফ এরিয়া নয়। হারিয়ে যাওয়া কার্ড সাথে সাথে ডিঅ্যাক্টিভেট করা যায়।

</Callout>

## API Key

authentication-এর সবচেয়ে সহজ রূপ। সার্ভার একটি ইউনিক key তৈরি করে, আর client প্রতিটি request-এর সাথে সেটা পাঠায়।

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

**API Key সিকিউরিটি**

- কখনো frontend JavaScript-এ API key রাখবেন না — যে কেউ পড়ে ফেলতে পারবে
- API key header-এ পাঠানো উচিত, কখনো URL-এ নয় (URL log হয়ে যায়)
- key নিয়মিত rotate করুন এবং rotation চলাকালীন একাধিক active key সাপোর্ট করুন
- key-এর আগে টাইপ যুক্ত করুন: `sk_live_` (secret live), `pk_test_` (public test)

</Callout>

### কখন API Key ব্যবহার করবেন

- Server-to-server communication
- Rate limiting আর usage tracking
- Public API যেখানে caller-কে শনাক্ত করতে হবে
- ইউজার-ফেসিং authentication-এর জন্য নয় (তখন OAuth/JWT ব্যবহার করুন)

## JWT (JSON Web Tokens)

JWT হলো self-contained token যা ইউজার ইনফরমেশন আর একটি signature এনকোড করে রাখে। এগুলো validate করতে সার্ভারকে database-এ খুঁজতে হয় না।

একটি JWT-এর তিনটি অংশ থাকে: **Header.Payload.Signature**

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

### JWT Auth ইমপ্লিমেন্ট করা

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

**JWT Best Practice**

- access token স্বল্পমেয়াদি রাখুন (৫-১৫ মিনিট)
- নতুন access token পেতে refresh token (৭-৩০ দিন) ব্যবহার করুন
- refresh token-এর hash database-এ রাখুন যাতে সেগুলো revoke করতে পারেন
- JWT payload-এ কখনো sensitive ডেটা রাখবেন না — এটা base64-এনকোডেড, encrypted নয়
- microservices-এর জন্য `RS256` (asymmetric) ব্যবহার করুন যাতে service-গুলো secret না জেনেই token verify করতে পারে

</Callout>

## OAuth 2.0

OAuth 2.0 হলো delegated authorization-এর একটি ফ্রেমওয়ার্ক। এটা ইউজারদের password শেয়ার না করেই third-party অ্যাপকে তাদের অ্যাকাউন্টে সীমিত access দিতে দেয়।

### Authorization Code Flow

web অ্যাপ্লিকেশনের জন্য এটাই সবচেয়ে প্রচলিত flow:

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

সনাতন পদ্ধতি — সার্ভার session ডেটা রাখে, client একটি session ID cookie রাখে।

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

## সঠিক পদ্ধতি বেছে নেওয়া

| পদ্ধতি    | কীসের জন্য সেরা                | Stateless? | Scalability |
| --------- | ------------------------------ | ---------- | ----------- |
| API Key   | Server-to-server, public API   | হ্যাঁ      | High        |
| JWT       | SPA, mobile app, microservices | হ্যাঁ      | High        |
| Session   | সনাতন web app, SSR             | না         | Medium      |
| OAuth 2.0 | Third-party access, SSO        | নির্ভর করে | High        |

<Callout type="tip">

**সিদ্ধান্ত নেওয়ার গাইড**

- একটি public API বানাচ্ছেন? **API key** দিয়ে শুরু করুন
- একটি SPA বা mobile app বানাচ্ছেন? refresh token-সহ **JWT** ব্যবহার করুন
- server-rendered web app বানাচ্ছেন? Redis-সহ **session** পরীক্ষিত ও নির্ভরযোগ্য
- "Login with Google/GitHub" দরকার? **OAuth 2.0** Authorization Code flow
- microservices? **RS256-সহ JWT** — service-গুলো shared secret ছাড়াই verify করে

</Callout>

## মূল কথা

1. **Authentication পরিচয় প্রমাণ করে**, authorization পারমিশন চেক করে — এরা আলাদা বিষয়
2. **API key** সহজ, কিন্তু কেবল server-to-server বা public API consumer শনাক্ত করার জন্যই উপযুক্ত
3. **JWT** stateless আর scalable, তবে স্বল্প expiry + refresh token rotation দরকার
4. **OAuth 2.0** authorization delegate করে — ইউজার password শেয়ার না করেই আপনার অ্যাপকে পারমিশন দেয়
5. **Session** stateful কিন্তু ইমপ্লিমেন্ট করা সহজ এবং revoke করাও সহজ
