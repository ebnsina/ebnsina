---
title: 'OAuth 2.0 & OpenID Connect'
subtitle: 'Delegated authorization and federated identity — let users log in with Google without giving you their Google password.'
chapter: 4
level: 'intermediate'
readingTime: '13 min'
topics: ['OAuth 2.0', 'OIDC', 'authorization code', 'PKCE', 'federated identity']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A hotel key card system: you present your ID to the front desk (the authorization server), they give you a key card (access token) that opens only your room (scoped access). The hotel restaurant doesn't need to see your ID — they scan the card. You never hand your ID directly to the restaurant.

</Callout>

## What OAuth 2.0 Solves

Before OAuth, the only way to let a third-party app access your data on another service was to give it your username and password. The third-party had full access, forever, with no way to revoke it short of changing your password.

OAuth 2.0 is a **delegation protocol**: users authorize limited access without sharing credentials. The scope of access is explicit, time-limited, and revocable.

OAuth 2.0 itself only handles **authorization** ("this app can read your calendar"). OpenID Connect (OIDC) adds **authentication** on top ("this is who the user is").

## Core Roles

- **Resource Owner:** The user who owns the data.
- **Client:** The app requesting access (your web app, mobile app).
- **Authorization Server (AS):** Issues tokens. Google, GitHub, Auth0, or your own server.
- **Resource Server (RS):** The API that serves protected data. Validates tokens.

## Authorization Code Flow

The most secure flow for web apps and mobile apps. Never exposes tokens in URLs.

```
1. Client → User: "Please authorize at AS"
2. User → AS: Logs in, grants permission
3. AS → Client: Authorization code (short-lived, single-use)
4. Client → AS: Exchange code + client_secret for tokens
5. AS → Client: Access token + refresh token + ID token
6. Client → RS: Access token in Authorization header
```

**Step 1-2: Redirect user to authorization server**

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

**Step 3-4: Handle callback and exchange code**

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

## PKCE: Authorization Code Flow for Public Clients

Mobile apps and SPAs can't keep a `client_secret` secret (it's in the bundle). PKCE (Proof Key for Code Exchange) replaces the secret with a cryptographic challenge:

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

The AS verifies that `SHA-256(verifier) === challenge`. An attacker who intercepts the authorization code can't exchange it without the verifier.

## OpenID Connect: Identity on Top of OAuth

OIDC adds an **ID token** — a JWT containing user identity claims. It's what turns OAuth (authorization) into a login system (authentication).

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

**Use `sub` (subject) as your primary key for external users, not email.** Email can change. `sub` is a stable, provider-specific user identifier.

## Discovery Document

OIDC providers publish a discovery document at `/.well-known/openid-configuration`. It tells you where to find the authorization endpoint, token endpoint, JWKS, and supported scopes — so you don't hardcode URLs:

```typescript
async function getProviderConfig(issuer: string) {
	const response = await fetch(`${issuer}/.well-known/openid-configuration`);
	return response.json();
	// Returns: { authorization_endpoint, token_endpoint, jwks_uri, ... }
}

// Cache this — it doesn't change often
const googleConfig = await getProviderConfig('https://accounts.google.com');
```

## Token Types

| Token              | Lifetime       | Purpose                      |
| ------------------ | -------------- | ---------------------------- |
| Authorization code | ~10 minutes    | One-time exchange for tokens |
| Access token       | 1–60 minutes   | Call resource server APIs    |
| Refresh token      | Days–months    | Get new access tokens        |
| ID token           | Same as access | Verify user identity         |

Access tokens should be short-lived. Refresh tokens should be stored securely (httpOnly cookie), rotated on use, and bound to the session.

## Building Your Own Authorization Server

For internal APIs or B2B, you might run your own AS. Libraries like `node-oidc-provider` handle the protocol complexity:

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

For most teams, use a managed AS (Auth0, Clerk, Supabase Auth, AWS Cognito) and focus on your product.

## Common OAuth Mistakes

**Open redirects in redirect_uri:**

```typescript
// WRONG — allows redirecting to attacker.com after auth
redirect_uri: req.query.redirect_uri;

// RIGHT — validate against registered URIs
const allowedRedirects = ['https://myapp.com/auth/callback'];
if (!allowedRedirects.includes(req.query.redirect_uri)) {
	return res.status(400).json({ error: 'Invalid redirect_uri' });
}
```

**Skipping state parameter (CSRF):**
An attacker can initiate an OAuth flow and trick a victim into completing it, binding the victim's session to the attacker's authorization code. Always use `state`.

**Using access tokens as identity:**
Access tokens prove authorization, not identity. Use the ID token (or `userinfo` endpoint) to get the user's identity. Don't decode an opaque access token and trust its contents.

**Storing tokens in localStorage:**
Subject to XSS. Use httpOnly cookies for refresh tokens, memory for access tokens.
