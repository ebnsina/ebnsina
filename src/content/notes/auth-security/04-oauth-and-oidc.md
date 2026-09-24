---
title: 'OAuth 2.0 ও OpenID Connect'
subtitle: 'Delegated authorization আর federated identity — user-দের Google password না দিয়েই Google দিয়ে log in করতে দিন।'
chapter: 4
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['OAuth 2.0', 'OIDC', 'authorization code', 'PKCE', 'federated identity']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা hotel key card system: আপনি front desk-এ (authorization server) আপনার ID দেখান, তারা আপনাকে একটা key card (access token) দেয় যা শুধু আপনার room (scoped access) খোলে। hotel restaurant-এর আপনার ID দেখার দরকার নেই — তারা card-টা scan করে। আপনি কখনও সরাসরি restaurant-কে আপনার ID দেন না।

</Callout>

## গল্পে বুঝি

সিনা দামি একটা গাড়ি নিয়ে রেস্টুরেন্টে খেতে এসেছে। সামনে valet parking। এখন সে যদি valet ছেলেটার হাতে তার আসল master key তুলে দেয়, তাহলে ওই ছেলে শুধু গাড়ি পার্ক করাই না — চাইলে glovebox খুলবে, trunk-এ রাখা ল্যাপটপ নেবে, এমনকি গাড়িটা নিয়েই কেটে পড়তে পারবে। সিনা চালাক, তাই সে master key দেয় না। সে দেয় একটা আলাদা valet key — এই চাবি দিয়ে শুধু গাড়ি স্টার্ট আর পার্ক করা যায়, কিন্তু glovebox বা trunk খোলা যায় না। খাওয়া শেষে সিনা চাইলেই ওই valet key বাতিল করে দিতে পারে, master key তো তার পকেটেই থেকে গেছে।

এদিকে valet stand-টা রেস্টুরেন্টের সাথেও পরিচিত। রেস্টুরেন্ট যখন জানতে চায় গাড়িটা কার, valet stand বলে দেয় — "হ্যাঁ, এই গাড়ি 305 নম্বর রুমের অতিথি সিনার।" রেস্টুরেন্টকে সিনার আসল পরিচয়পত্র দেখতে হয় না, valet stand-ই যাচাই করে বলে দেয় সিনা আসলেই সিনা।

গল্পের valet key-টাই হলো **OAuth**: master key (আপনার আসল password) না দিয়েই একটা সীমিত, নির্দিষ্ট scope-এর delegated access দেওয়া — যা আপনি যেকোনো সময় revoke করতে পারেন। আর valet stand-এর "এটা সিনা" বলে vouch করাটাই **OpenID Connect (OIDC)** — OAuth-এর উপরে identity প্রমাণ করা, আপনি আসলে কে সেটা যাচাই করা। বাস্তবে ঠিক এটাই ঘটে যখন আপনি "Login with Google" চাপেন: Google-কে আপনার password না দিয়েই কোনো third-party app-কে আপনার email বা profile-এর মতো সীমিত জিনিসে access দেন (OAuth), আর সেই app জানতে পারে আপনি কে (OIDC) — চাইলে পরে Google account থেকে সেই access তুলে নিতে পারেন।

## OAuth 2.0 কী সমাধান করে

OAuth-এর আগে, একটা third-party app-কে অন্য একটা service-এ আপনার data access করতে দেওয়ার একমাত্র উপায় ছিল তাকে আপনার username আর password দেওয়া। Third-party-টার চিরকালের জন্য full access থাকত, password পরিবর্তন ছাড়া revoke করার কোনো উপায় ছাড়া।

OAuth 2.0 হলো একটা **delegation protocol**: user-রা credential share না করে limited access authorize করে। Access-এর scope explicit, time-limited, এবং revocable।

OAuth 2.0 নিজে শুধু **authorization** handle করে ("এই app আপনার calendar পড়তে পারে")। OpenID Connect (OIDC) এর উপরে **authentication** যোগ করে ("এই user কে")।

## মূল Role

- **Resource Owner:** যে user data-র মালিক।
- **Client:** যে app access চাইছে (আপনার web app, mobile app)।
- **Authorization Server (AS):** Token issue করে। Google, GitHub, Auth0, বা আপনার নিজের server।
- **Resource Server (RS):** যে API protected data serve করে। Token validate করে।

## Authorization Code Flow

Web app আর mobile app-এর জন্য সবচেয়ে নিরাপদ flow। কখনও URL-এ token expose করে না।

```
1. Client → User: "Please authorize at AS"
2. User → AS: Logs in, grants permission
3. AS → Client: Authorization code (short-lived, single-use)
4. Client → AS: Exchange code + client_secret for tokens
5. AS → Client: Access token + refresh token + ID token
6. Client → RS: Access token in Authorization header
```

**Step 1-2: User-কে authorization server-এ redirect করা**

```typescript
import crypto from 'crypto';

function buildAuthorizationUrl(state: string): string {
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: process.env.OAUTH_CLIENT_ID!,
		redirect_uri: 'https://myapp.com/auth/callback',
		scope: 'openid profile email',
		state // CSRF protection — random value, verified on callback
	});

	return `https://auth.google.com/o/oauth2/v2/auth?${params}`;
}

app.get('/auth/login', (req, res) => {
	const state = crypto.randomBytes(16).toString('hex');
	req.session.oauthState = state; // store for verification
	res.redirect(buildAuthorizationUrl(state));
});
```

**Step 3-4: Callback handle করা আর code exchange করা**

```typescript
app.get('/auth/callback', async (req, res) => {
	const { code, state } = req.query;

	// Verify state to prevent CSRF
	if (state !== req.session.oauthState) {
		return res.status(400).json({ error: 'Invalid state' });
	}

	// Exchange code for tokens
	const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code: code as string,
			redirect_uri: 'https://myapp.com/auth/callback',
			client_id: process.env.OAUTH_CLIENT_ID!,
			client_secret: process.env.OAUTH_CLIENT_SECRET!
		})
	});

	const { access_token, refresh_token, id_token } = await tokenResponse.json();

	// Verify and decode the ID token (OIDC)
	const identity = await verifyIdToken(id_token);

	// Create or update user in your database
	const user = await upsertUser({
		externalId: identity.sub,
		provider: 'google',
		email: identity.email,
		name: identity.name
	});

	req.session.userId = user.id;
	res.redirect('/dashboard');
});
```

## PKCE: Public Client-এর জন্য Authorization Code Flow

Mobile app আর SPA একটা `client_secret` গোপন রাখতে পারে না (এটা bundle-এর মধ্যে থাকে)। PKCE (Proof Key for Code Exchange) secret-কে একটা cryptographic challenge দিয়ে প্রতিস্থাপন করে:

```typescript
function generatePKCE(): { verifier: string; challenge: string } {
	// code_verifier: random 43-128 char string
	const verifier = crypto.randomBytes(32).toString('base64url');

	// code_challenge: SHA-256 of verifier, base64url encoded
	const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

	return { verifier, challenge };
}

// Step 1: include challenge in authorization URL
const { verifier, challenge } = generatePKCE();
sessionStorage.setItem('pkce_verifier', verifier); // store for callback

const params = new URLSearchParams({
	// ...other params...
	code_challenge: challenge,
	code_challenge_method: 'S256'
});

// Step 2: include verifier in token exchange (instead of client_secret)
body: new URLSearchParams({
	grant_type: 'authorization_code',
	code,
	redirect_uri: '...',
	client_id: '...',
	code_verifier: sessionStorage.getItem('pkce_verifier')! // no secret needed
});
```

AS verify করে যে `SHA-256(verifier) === challenge`। যে attacker authorization code intercept করে সে verifier ছাড়া এটা exchange করতে পারে না।

## OpenID Connect: OAuth-এর উপরে Identity

OIDC একটা **ID token** যোগ করে — একটা JWT যাতে user identity claim থাকে। এটাই OAuth (authorization)-কে একটা login system (authentication)-এ পরিণত করে।

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

async function verifyIdToken(idToken: string) {
	const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
		issuer: 'https://accounts.google.com',
		audience: process.env.OAUTH_CLIENT_ID! // MUST match your client_id
	});

	return {
		sub: payload.sub as string, // stable user ID — use this as primary key
		email: payload.email as string,
		name: payload.name as string,
		emailVerified: payload.email_verified as boolean
	};
}
```

**External user-দের জন্য email নয়, `sub` (subject)-কে আপনার primary key হিসেবে ব্যবহার করুন।** Email পরিবর্তন হতে পারে। `sub` হলো একটা stable, provider-specific user identifier।

## Discovery Document

OIDC provider-রা `/.well-known/openid-configuration`-এ একটা discovery document publish করে। এটা আপনাকে বলে দেয় authorization endpoint, token endpoint, JWKS, আর supported scope কোথায় পাবেন — যাতে আপনি URL hardcode না করেন:

```typescript
async function getProviderConfig(issuer: string) {
	const response = await fetch(`${issuer}/.well-known/openid-configuration`);
	return response.json();
	// Returns: { authorization_endpoint, token_endpoint, jwks_uri, ... }
}

// Cache this — it doesn't change often
const googleConfig = await getProviderConfig('https://accounts.google.com');
```

## Token Type

| Token              | Lifetime       | উদ্দেশ্য                       |
| ------------------ | -------------- | ------------------------------ |
| Authorization code | ~10 minute     | Token-এর জন্য এককালীন exchange |
| Access token       | 1–60 minute    | Resource server API call করা   |
| Refresh token      | দিন–মাস        | নতুন access token পাওয়া       |
| ID token           | Access-এর মতোই | User identity verify করা       |

Access token short-lived হওয়া উচিত। Refresh token নিরাপদে store করা উচিত (httpOnly cookie), ব্যবহারে rotate করা, এবং session-এর সাথে bound করা।

## নিজের Authorization Server বানানো

Internal API বা B2B-এর জন্য, আপনি হয়তো আপনার নিজের AS চালাবেন। `node-oidc-provider`-এর মতো library protocol-এর জটিলতা handle করে:

```typescript
import Provider from 'oidc-provider';

const oidc = new Provider('https://auth.yourapp.com', {
	clients: [
		{
			client_id: 'web-app',
			client_secret: process.env.WEB_APP_SECRET,
			redirect_uris: ['https://yourapp.com/auth/callback'],
			grant_types: ['authorization_code', 'refresh_token'],
			scope: 'openid profile email'
		}
	],

	async findAccount(ctx, id) {
		const user = await db.users.findById(id);
		return {
			accountId: id,
			async claims() {
				return { sub: id, email: user.email, name: user.name };
			}
		};
	}
});
```

বেশিরভাগ team-এর জন্য, একটা managed AS (Auth0, Clerk, Supabase Auth, AWS Cognito) ব্যবহার করুন আর আপনার product-এ মনোযোগ দিন।

## সাধারণ OAuth ভুল

**redirect_uri-তে open redirect:**

```typescript
// WRONG — allows redirecting to attacker.com after auth
redirect_uri: req.query.redirect_uri;

// RIGHT — validate against registered URIs
const allowedRedirects = ['https://myapp.com/auth/callback'];
if (!allowedRedirects.includes(req.query.redirect_uri)) {
	return res.status(400).json({ error: 'Invalid redirect_uri' });
}
```

**state parameter এড়িয়ে যাওয়া (CSRF):**
একজন attacker একটা OAuth flow শুরু করে একজন victim-কে এটা সম্পূর্ণ করতে ফাঁদে ফেলতে পারে, victim-এর session-কে attacker-এর authorization code-এর সাথে bind করে। সবসময় `state` ব্যবহার করুন।

**Access token-কে identity হিসেবে ব্যবহার করা:**
Access token authorization প্রমাণ করে, identity নয়। User-এর identity পেতে ID token (বা `userinfo` endpoint) ব্যবহার করুন। একটা opaque access token decode করে তার content-এ বিশ্বাস করবেন না।

**localStorage-এ token store করা:**
XSS-এর শিকার হয়। refresh token-এর জন্য httpOnly cookie, access token-এর জন্য memory ব্যবহার করুন।
