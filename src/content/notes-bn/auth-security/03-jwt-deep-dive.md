---
title: 'JWT Deep Dive'
subtitle: 'Structure, signing algorithm, validation rule, আর যে সাধারণ ভুলগুলো JWT-কে insecure করে তোলে।'
chapter: 3
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['JWT', 'RS256', 'HS256', 'JWKS', 'token validation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা notarized document: যে কেউ এটা পড়তে পারে, private key ছাড়া কেউ notary-র seal নকল করতে পারে না, আর notary-র public record যে কাউকে seal-টা আসল কিনা verify করতে দেয়। JWT একইভাবে কাজ করে — পড়ার যোগ্য, tamper-evident, আর public key থাকা যে কারো দ্বারা verifiable।

</Callout>

## গল্পে বুঝি

ইবনে সিনা কনসার্টের গেটে দাঁড়িয়ে। হাতে একটা কাগজের রিস্টব্যান্ড — তার উপর ছাপা তার নাম, সিট ক্লাস "VIP", আর "রাত ১১টা পর্যন্ত বৈধ"। ব্যান্ডের গায়ে একটা চকচকে hologram seal, যেটা আয়োজকদের নিজস্ব মেশিন ছাড়া কেউ নকল করতে পারে না। গেটের দারোয়ান আল-খোয়ারিজমি ব্যান্ডটা এক নজর দেখেই বুঝে যায় — নামটা পড়া যাচ্ছে, ক্লাস দেখা যাচ্ছে, seal-টা আসল। অফিসে ফোন করে "এই লোকটা কি সত্যিই VIP?" জিজ্ঞেস করার দরকার হয় না; সব তথ্য তো ব্যান্ডেই লেখা আর seal-টাই প্রমাণ করছে এটা আয়োজকদের দেওয়া, কেউ ঘষামাজা করেনি।

কেউ যদি চালাকি করে ব্যান্ডে "General" কেটে "VIP" লিখে দিতে চায়, তাহলে seal-টা ফেটে যায় বা মিলে না — জালিয়াতি সঙ্গে সঙ্গে ধরা পড়ে। আবার রাত ১১টা বাজার পর ওই একই ব্যান্ড দেখালেও আল-খোয়ারিজমি ঢুকতে দেবে না, কারণ ছাপার গায়েই মেয়াদ শেষ হওয়ার সময় লেখা। আর যেহেতু ব্যান্ডে যা লেখা তা যে কেউ পড়ে ফেলতে পারে, আয়োজকরা কখনোই সেখানে গোপন কিছু (যেমন কারো পাসওয়ার্ড) লেখে না।

এই রিস্টব্যান্ডটাই আসলে একটা **JWT**। ব্যান্ডে ছাপা নাম-সিট ক্লাস-মেয়াদ হলো token-এর **claims** (readable তথ্য), hologram seal হলো **signature** — cryptographic প্রমাণ যে কেউ tamper করেনি। দারোয়ানের অফিসে ফোন না করে এক নজরে যাচাই করাটাই **stateless verification**: server database lookup ছাড়াই শুধু signature দেখে token verify করে। ছাপার গায়ে লেখা সময়টা হলো **expiry** (`exp`), আর "যে কেউ পড়তে পারে বলে গোপন কিছু লিখি না" — এটাই মনে রাখার নিয়ম, payload encrypted নয়। বাস্তবে ঠিক এভাবেই একটা API একটা login token verify করে — প্রতিটা request-এ user-কে আবার database-এ খুঁজতে না গিয়ে শুধু signature আর claims দেখেই সিদ্ধান্ত নেয়।

## Structure

একটা JWT হলো তিনটা base64url-encoded JSON object যা dot দিয়ে জোড়া লাগানো:

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.signature
```

**Header** — algorithm আর token type:

```json
{ "alg": "RS256", "typ": "JWT" }
```

**Payload** — claim (user data + metadata):

```json
{
	"sub": "user_123", // subject — user ID
	"iss": "https://auth.yourapp.com", // issuer
	"aud": "api", // audience
	"iat": 1700000000, // issued at (Unix timestamp)
	"exp": 1700003600, // expires at
	"role": "admin", // custom claim
	"email": "user@example.com"
}
```

**Signature** — cryptographic প্রমাণ যে header+payload-এ tamper করা হয়নি।

payload **encrypted নয়** — যে কেউ এটা base64-decode করতে পারে। JWT claim-এ secret রাখবেন না।

## Signing Algorithm

**HS256 (HMAC-SHA256):** Symmetric — একই secret sign আর verify করে।

```typescript
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!; // same secret everywhere

const token = jwt.sign({ sub: userId, role: 'user' }, SECRET, {
	algorithm: 'HS256',
	expiresIn: '1h',
	issuer: 'https://auth.yourapp.com',
	audience: 'api'
});

const payload = jwt.verify(token, SECRET, {
	algorithms: ['HS256'],
	issuer: 'https://auth.yourapp.com',
	audience: 'api'
});
```

সমস্যা: token validate করা প্রতিটা service-এর secret দরকার। আপনার 10টা service থাকলে, secret 10 জায়গায় থাকে। একটা breach signing key-টা expose করে দেয়।

**RS256 (RSA-SHA256):** Asymmetric — private key sign করে, public key verify করে।

```typescript
import { createPrivateKey, createPublicKey } from 'crypto';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';

// Auth service only — has private key
const privateKey = createPrivateKey(process.env.JWT_PRIVATE_KEY!);

async function issueToken(userId: string, role: string): Promise<string> {
	return new SignJWT({ sub: userId, role })
		.setProtectedHeader({ alg: 'RS256' })
		.setIssuedAt()
		.setIssuer('https://auth.yourapp.com')
		.setAudience('api')
		.setExpirationTime('1h')
		.sign(privateKey);
}

// Any service — only needs public key (or JWKS URL)
const JWKS = createRemoteJWKSet(new URL('https://auth.yourapp.com/.well-known/jwks.json'));

async function verifyToken(token: string) {
	const { payload } = await jwtVerify(token, JWKS, {
		issuer: 'https://auth.yourapp.com',
		audience: 'api',
		algorithms: ['RS256']
	});
	return payload;
}
```

**ES256 (ECDSA P-256):** RS256-এর মতোই asymmetric, কিন্তু signature ছোট আর verification faster। নতুন system-এর জন্য RS256-এর বদলে এটা prefer করুন।

```typescript
// Generate a P-256 key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
	namedCurve: 'P-256'
});
```

## JWKS Endpoint

JSON Web Key Set endpoint service-গুলোকে current public key স্বয়ংক্রিয়ভাবে fetch করতে দেয়। এটা প্রতিটা service-এর config update না করেই key rotation সম্ভব করে:

```typescript
import { exportJWK, generateKeyPair } from 'jose';

// Auth service: expose JWKS
let currentKeyPair = await generateKeyPair('ES256', { extractable: true });
let currentKeyId = 'key-2024-01';

app.get('/.well-known/jwks.json', async (req, res) => {
	const publicJwk = await exportJWK(currentKeyPair.publicKey);

	res.json({
		keys: [
			{
				...publicJwk,
				kid: currentKeyId, // key ID — clients use this to pick the right key
				use: 'sig', // intended use: signature verification
				alg: 'ES256'
			}
		]
	});
});

// Sign tokens with kid in header so verifiers know which key to use
async function sign(payload: Record<string, unknown>): Promise<string> {
	return (
		new SignJWT(payload)
			.setProtectedHeader({ alg: 'ES256', kid: currentKeyId })
			// ...
			.sign(currentKeyPair.privateKey)
	);
}
```

**Key rotation:** একটা নতুন key pair generate করুন, পুরনোটার পাশে JWKS-এ যোগ করুন (যাতে পুরনো key দিয়ে sign করা token এখনও validate হয়), তারপর পুরনো token expire হয়ে গেলে পুরনো key সরিয়ে দিন।

## Validation Checklist

শুধু একটা JWT signature verify করাই যথেষ্ট নয়। এই সবগুলো validate করুন:

```typescript
async function validateToken(token: string): Promise<TokenPayload> {
	// 1. Verify signature against JWKS
	const { payload } = await jwtVerify(token, JWKS, {
		// 2. Check algorithm — NEVER allow 'none'
		algorithms: ['ES256', 'RS256'],

		// 3. Verify issuer matches expected auth server
		issuer: 'https://auth.yourapp.com',

		// 4. Verify audience matches this service
		audience: 'api'

		// 5. Expiry (exp) checked automatically by jwtVerify
		// 6. Not-before (nbf) checked automatically by jwtVerify
	});

	// 7. Check required claims exist
	if (!payload.sub) throw new Error('Missing sub claim');
	if (!payload.role) throw new Error('Missing role claim');

	// 8. Optionally check token ID (jti) against a revocation list
	if (payload.jti && (await isRevoked(payload.jti as string))) {
		throw new Error('Token revoked');
	}

	return payload as TokenPayload;
}
```

## "alg: none" Attack

প্রাথমিক JWT library header-এ `"alg": "none"` মেনে নিত, যার মানে কোনো signature দরকার নেই। একজন attacker `alg: none` সেট করে আর কোনো signature না দিয়ে যেকোনো token নকল করতে পারত।

```
// Malicious token with alg:none
eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9.
```

সমাধান: সবসময় allowed algorithm explicit-ভাবে specify করুন এবং কখনও `'none'` include করবেন না।

```typescript
// WRONG — library might accept 'none'
jwt.verify(token, secret);

// RIGHT — explicit allowlist
jwt.verify(token, secret, { algorithms: ['HS256'] });
// or with jose: algorithms: ['ES256', 'RS256']
```

## RS256 → HS256 Confusion Attack

একটা server যদি RS256 ব্যবহার করে, এটা private key দিয়ে sign করে আর public key দিয়ে verify করে। যে attacker public key জানে (এটা তো public!) সে public key-কে HMAC secret হিসেবে ব্যবহার করে HS256 দিয়ে sign করা একটা token তৈরি করতে পারে — তারপর এটা এমন একটা server-এ submit করতে পারে যা দুটো algorithm-ই মেনে নেয়।

সমাধান: একই use case-এর জন্য কখনও symmetric আর asymmetric দুটো algorithm-ই allow করবেন না। Explicit হন।

```typescript
// WRONG — accepts both
algorithms: ['RS256', 'HS256'];

// RIGHT — one or the other
algorithms: ['RS256'];
```

## Token Lifetime ও Refresh

Short-lived access token + long-lived refresh token:

```typescript
// Issue both on login
async function issueTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
	const accessToken = await signAccessToken(userId, '15m'); // short-lived
	const refreshToken = await signRefreshToken(userId, '30d'); // long-lived

	// Store refresh token hash in DB for revocation
	await db.refreshTokens.insert({
		tokenHash: hashToken(refreshToken),
		userId,
		expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
	});

	return { accessToken, refreshToken };
}

// Refresh endpoint
app.post('/auth/refresh', async (req, res) => {
	const { refreshToken } = req.body;

	const tokenHash = hashToken(refreshToken);
	const stored = await db.refreshTokens.findByHash(tokenHash);

	if (!stored || stored.expiresAt < new Date()) {
		return res.status(401).json({ error: 'Invalid refresh token' });
	}

	// Rotate: invalidate old, issue new
	await db.refreshTokens.delete(stored.id);
	const tokens = await issueTokens(stored.userId);

	res.json(tokens);
});
```

**Refresh token rotation** (প্রতিবার ব্যবহারে একটা নতুন refresh token issue করা) চুরি detect করে: একজন attacker চুরি করা refresh token ব্যবহার করলে, বৈধ user-এর পরবর্তী refresh fail করে, যা আপনাকে একটা compromise সম্পর্কে সতর্ক করে।

## Browser-এ কোথায় Token Store করবেন

| Storage              | XSS        | CSRF       | Note                                        |
| -------------------- | ---------- | ---------- | ------------------------------------------- |
| `localStorage`       | Vulnerable | নিরাপদ     | যেকোনো script এটা পড়তে পারে                |
| `sessionStorage`     | Vulnerable | নিরাপদ     | tab close-এ মুছে যায়                       |
| `httpOnly` cookie    | নিরাপদ     | Vulnerable | JS এটা পড়তে পারে না; CSRF protection দরকার |
| Memory (JS variable) | নিরাপদ     | নিরাপদ     | page refresh-এ হারিয়ে যায়                 |

**সুপারিশ:** refresh token-এর জন্য `httpOnly`, `Secure`, `SameSite=Strict` cookie। Access token memory-তে (JS variable), page load-এ refresh endpoint থেকে আবার fetch করা।

```typescript
// Set refresh token as httpOnly cookie
res.cookie('refreshToken', refreshToken, {
	httpOnly: true, // not accessible to JS
	secure: true, // HTTPS only
	sameSite: 'strict', // no cross-site requests
	maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
	path: '/auth/refresh' // only sent to refresh endpoint
});
```
