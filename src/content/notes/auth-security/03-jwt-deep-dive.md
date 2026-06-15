---
title: "JWT Deep Dive"
subtitle: "Structure, signing algorithms, validation rules, and the common mistakes that make JWTs insecure."
chapter: 3
level: "intermediate"
readingTime: "12 min"
topics: ["JWT", "RS256", "HS256", "JWKS", "token validation"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A notarized document: anyone can read it, no one can forge the notary's seal without the private key, and the notary's public record lets anyone verify the seal is genuine. JWTs work the same way — readable, tamper-evident, and verifiable by anyone with the public key.

</Callout>

## Structure

A JWT is three base64url-encoded JSON objects joined by dots:

```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMDAzNjAwfQ.signature
```

**Header** — algorithm and token type:
```json
{ "alg": "RS256", "typ": "JWT" }
```

**Payload** — claims (user data + metadata):
```json
{
  "sub": "user_123",        // subject — user ID
  "iss": "https://auth.yourapp.com", // issuer
  "aud": "api",             // audience
  "iat": 1700000000,        // issued at (Unix timestamp)
  "exp": 1700003600,        // expires at
  "role": "admin",          // custom claim
  "email": "user@example.com"
}
```

**Signature** — cryptographic proof the header+payload weren't tampered with.

The payload is **not encrypted** — anyone can base64-decode it. Don't put secrets in JWT claims.

## Signing Algorithms

**HS256 (HMAC-SHA256):** Symmetric — same secret signs and verifies.

```typescript
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!; // same secret everywhere

const token = jwt.sign({ sub: userId, role: 'user' }, SECRET, {
  algorithm: 'HS256',
  expiresIn: '1h',
  issuer: 'https://auth.yourapp.com',
  audience: 'api',
});

const payload = jwt.verify(token, SECRET, {
  algorithms: ['HS256'],
  issuer: 'https://auth.yourapp.com',
  audience: 'api',
});
```

Problem: every service that validates tokens needs the secret. If you have 10 services, the secret is in 10 places. One breach exposes the signing key.

**RS256 (RSA-SHA256):** Asymmetric — private key signs, public key verifies.

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
const JWKS = createRemoteJWKSet(
  new URL('https://auth.yourapp.com/.well-known/jwks.json')
);

async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'https://auth.yourapp.com',
    audience: 'api',
    algorithms: ['RS256'],
  });
  return payload;
}
```

**ES256 (ECDSA P-256):** Asymmetric like RS256, but shorter signatures and faster verification. Prefer this over RS256 for new systems.

```typescript
// Generate a P-256 key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
```

## JWKS Endpoint

The JSON Web Key Set endpoint lets services fetch current public keys automatically. This enables key rotation without updating every service's config:

```typescript
import { exportJWK, generateKeyPair } from 'jose';

// Auth service: expose JWKS
let currentKeyPair = await generateKeyPair('ES256', { extractable: true });
let currentKeyId = 'key-2024-01';

app.get('/.well-known/jwks.json', async (req, res) => {
  const publicJwk = await exportJWK(currentKeyPair.publicKey);

  res.json({
    keys: [{
      ...publicJwk,
      kid: currentKeyId, // key ID — clients use this to pick the right key
      use: 'sig',        // intended use: signature verification
      alg: 'ES256',
    }],
  });
});

// Sign tokens with kid in header so verifiers know which key to use
async function sign(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: currentKeyId })
    // ...
    .sign(currentKeyPair.privateKey);
}
```

**Key rotation:** Generate a new key pair, add it to JWKS alongside the old one (so tokens signed with the old key still validate), then after old tokens expire, remove the old key.

## Validation Checklist

Verifying a JWT signature is not enough. Validate all of these:

```typescript
async function validateToken(token: string): Promise<TokenPayload> {
  // 1. Verify signature against JWKS
  const { payload } = await jwtVerify(token, JWKS, {
    // 2. Check algorithm — NEVER allow 'none'
    algorithms: ['ES256', 'RS256'],

    // 3. Verify issuer matches expected auth server
    issuer: 'https://auth.yourapp.com',

    // 4. Verify audience matches this service
    audience: 'api',

    // 5. Expiry (exp) checked automatically by jwtVerify
    // 6. Not-before (nbf) checked automatically by jwtVerify
  });

  // 7. Check required claims exist
  if (!payload.sub) throw new Error('Missing sub claim');
  if (!payload.role) throw new Error('Missing role claim');

  // 8. Optionally check token ID (jti) against a revocation list
  if (payload.jti && await isRevoked(payload.jti as string)) {
    throw new Error('Token revoked');
  }

  return payload as TokenPayload;
}
```

## The "alg: none" Attack

Early JWT libraries accepted `"alg": "none"` in the header, meaning no signature required. An attacker could forge any token by setting `alg: none` and providing no signature.

```
// Malicious token with alg:none
eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9.
```

Fix: always specify allowed algorithms explicitly and never include `'none'`.

```typescript
// WRONG — library might accept 'none'
jwt.verify(token, secret);

// RIGHT — explicit allowlist
jwt.verify(token, secret, { algorithms: ['HS256'] });
// or with jose: algorithms: ['ES256', 'RS256']
```

## The RS256 → HS256 Confusion Attack

If a server uses RS256, it signs with a private key and verifies with the public key. An attacker who knows the public key (it's public!) can craft a token signed with HS256 using the public key as the HMAC secret — then submit it to a server that accepts both algorithms.

Fix: never allow both symmetric and asymmetric algorithms for the same use case. Be explicit.

```typescript
// WRONG — accepts both
algorithms: ['RS256', 'HS256']

// RIGHT — one or the other
algorithms: ['RS256']
```

## Token Lifetime and Refresh

Short-lived access tokens + long-lived refresh tokens:

```typescript
// Issue both on login
async function issueTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await signAccessToken(userId, '15m');  // short-lived
  const refreshToken = await signRefreshToken(userId, '30d'); // long-lived

  // Store refresh token hash in DB for revocation
  await db.refreshTokens.insert({
    tokenHash: hashToken(refreshToken),
    userId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

**Refresh token rotation** (issuing a new refresh token on each use) detects theft: if an attacker uses a stolen refresh token, the legitimate user's next refresh fails, alerting you to a compromise.

## Where to Store Tokens in Browsers

| Storage | XSS | CSRF | Notes |
|---------|-----|------|-------|
| `localStorage` | Vulnerable | Safe | Any script can read it |
| `sessionStorage` | Vulnerable | Safe | Cleared on tab close |
| `httpOnly` cookie | Safe | Vulnerable | JS can't read it; needs CSRF protection |
| Memory (JS variable) | Safe | Safe | Lost on page refresh |

**Recommendation:** `httpOnly`, `Secure`, `SameSite=Strict` cookies for the refresh token. Access token in memory (JS variable), re-fetched from refresh endpoint on page load.

```typescript
// Set refresh token as httpOnly cookie
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,   // not accessible to JS
  secure: true,     // HTTPS only
  sameSite: 'strict', // no cross-site requests
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/auth/refresh', // only sent to refresh endpoint
});
```

