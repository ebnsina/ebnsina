---
title: 'API Key Management'
subtitle: 'Generating, storing, rotating, and revoking API keys — the plumbing behind machine-to-machine auth.'
chapter: 5
level: 'intermediate'
readingTime: '9 min'
topics: ['API keys', 'HMAC', 'key rotation', 'scopes', 'machine-to-machine']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A physical key to a server room: you give one to each person who needs access, log who has which key, and when someone leaves the company you collect (revoke) their key and replace the lock if needed. You never hand out the master key — just copies scoped to specific doors.

</Callout>

## When to Use API Keys

API keys work well for machine-to-machine (M2M) communication where there's no human involved to complete an OAuth flow:

- CI/CD pipelines calling your deployment API
- Third-party integrations (Stripe webhooks, GitHub Actions)
- SDKs and CLI tools accessing your API
- Service-to-service calls within your infrastructure

For user-facing auth, use OAuth/OIDC or sessions. API keys don't carry user identity — they carry client identity.

## Key Generation

Keys should be:

- Long enough to be unguessable (32+ bytes of randomness)
- Prefixed for identification (helps in logs, secret scanning)
- Non-sequential (no timestamps, no incrementing IDs)

```typescript
import crypto from 'crypto';

interface GeneratedKey {
	key: string; // returned to user once — never stored plaintext
	keyId: string; // stored in DB, returned on listing
	hash: string; // stored in DB for verification
}

function generateApiKey(prefix = 'sk'): GeneratedKey {
	const random = crypto.randomBytes(32).toString('base64url'); // 43 chars
	const key = `${prefix}_${random}`; // e.g. sk_abc123...

	// Generate a short ID from first 8 chars (for display, not secret)
	const keyId = `key_${crypto.randomBytes(8).toString('hex')}`;

	// Hash for storage — never store the key itself
	const hash = crypto.createHash('sha256').update(key).digest('hex');

	return { key, keyId, hash };
}
```

**Prefix convention:** Use meaningful prefixes (`sk_` for secret keys, `pk_` for public keys, `whsec_` for webhook secrets). GitHub, Stripe, and Twilio do this — it enables secret scanning in repos.

```typescript
// GitHub secret scanning pattern example
// stripe_live: sk_live_[0-9a-zA-Z]{24}
// Your API: myapp_sk_[A-Za-z0-9_-]{43}
```

## Storage

Store only the hash, never the plaintext key:

```typescript
interface StoredApiKey {
	id: string;
	keyId: string; // non-secret identifier for listing/revocation
	keyHash: string; // SHA-256 of the actual key
	ownerId: string; // user or service that owns this key
	name: string; // human-readable label
	scopes: string[]; // what this key can do
	lastUsedAt: Date | null;
	expiresAt: Date | null;
	createdAt: Date;
}

async function createApiKey(ownerId: string, name: string, scopes: string[]): Promise<string> {
	const { key, keyId, hash } = generateApiKey();

	await db.apiKeys.insert({
		keyId,
		keyHash: hash,
		ownerId,
		name,
		scopes,
		lastUsedAt: null,
		expiresAt: null, // or set based on your policy
		createdAt: new Date()
	});

	// Return the key ONCE — it cannot be retrieved again
	return key;
}
```

Show the key exactly once after creation. After that, only show the `keyId` and name. This mimics how GitHub and AWS handle access key creation.

## Verification

```typescript
async function verifyApiKey(key: string): Promise<StoredApiKey | null> {
	if (!key || !key.startsWith('sk_')) return null;

	const hash = crypto.createHash('sha256').update(key).digest('hex');

	const apiKey = await db.apiKeys.findOne({
		where: { keyHash: hash, revokedAt: null }
	});

	if (!apiKey) return null;

	// Check expiry
	if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

	// Update last used (async, don't block the request)
	db.apiKeys.update(apiKey.id, { lastUsedAt: new Date() }).catch(() => {});

	return apiKey;
}
```

**Cache verified keys briefly** — hashing + DB lookup on every request adds latency. A 30-60 second cache is safe since revocation doesn't need to be instant for most use cases:

```typescript
import LRU from 'lru-cache';

const keyCache = new LRU<string, StoredApiKey | null>({
	max: 1000,
	ttl: 30_000 // 30 seconds
});

async function verifyApiKeyCached(key: string): Promise<StoredApiKey | null> {
	const hash = crypto.createHash('sha256').update(key).digest('hex');

	if (keyCache.has(hash)) return keyCache.get(hash)!;

	const result = await verifyApiKey(key);
	keyCache.set(hash, result);
	return result;
}
```

## Scopes

Scope keys to the minimum required permissions:

```typescript
type Scope = 'read:users' | 'write:users' | 'read:orders' | 'write:orders' | 'admin';

function hasScope(key: StoredApiKey, required: Scope): boolean {
	return key.scopes.includes(required) || key.scopes.includes('admin');
}

// Middleware
app.use('/api/orders', async (req, res, next) => {
	const rawKey = req.headers['x-api-key'] as string;
	const apiKey = await verifyApiKeyCached(rawKey);

	if (!apiKey) return res.status(401).json({ error: 'Invalid API key' });

	const requiredScope: Scope = req.method === 'GET' ? 'read:orders' : 'write:orders';
	if (!hasScope(apiKey, requiredScope)) {
		return res.status(403).json({ error: `Scope required: ${requiredScope}` });
	}

	req.apiKey = apiKey;
	next();
});
```

## Rotation

Rotation replaces an old key with a new one without downtime. The challenge: you can't force the client to rotate instantly.

**Dual-key rotation:**

```typescript
async function rotateApiKey(keyId: string): Promise<{ oldKey: string; newKey: string }> {
	const existing = await db.apiKeys.findByKeyId(keyId);
	if (!existing) throw new Error('Key not found');

	// Issue a new key
	const { key: newKey, hash: newHash, keyId: newKeyId } = generateApiKey();

	await db.apiKeys.insert({
		keyId: newKeyId,
		keyHash: newHash,
		ownerId: existing.ownerId,
		name: `${existing.name} (rotated)`,
		scopes: existing.scopes,
		// Old key expires in 7 days — transition window
		expiresAt: null
	});

	// Mark old key for expiry
	await db.apiKeys.update(existing.id, {
		expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
	});

	return { oldKey: 'see old key id', newKey };
}
```

This gives callers a week to update to the new key before the old one stops working. Log a warning when the old key is used after rotation to track adoption.

## Revocation

Immediate — just mark the key revoked:

```typescript
async function revokeApiKey(keyId: string, ownerId: string): Promise<void> {
	const key = await db.apiKeys.findOne({ where: { keyId, ownerId } });
	if (!key) throw new Error('Key not found or not owned by you');

	await db.apiKeys.update(key.id, { revokedAt: new Date() });

	// Purge from cache
	keyCache.delete(key.keyHash);
}
```

## Exposing Key Management to Users

```typescript
// List keys (never return the key itself)
app.get('/api/keys', requireAuth, async (req, res) => {
	const keys = await db.apiKeys.findAll({
		where: { ownerId: req.user.id, revokedAt: null },
		select: ['keyId', 'name', 'scopes', 'lastUsedAt', 'expiresAt', 'createdAt']
	});
	res.json(keys);
});

// Create key
app.post('/api/keys', requireAuth, async (req, res) => {
	const { name, scopes } = req.body;
	const key = await createApiKey(req.user.id, name, scopes);

	res.status(201).json({
		key, // only time this is returned
		message: 'Store this key — it cannot be retrieved again'
	});
});

// Revoke key
app.delete('/api/keys/:keyId', requireAuth, async (req, res) => {
	await revokeApiKey(req.params.keyId, req.user.id);
	res.json({ ok: true });
});
```

## Detecting Leaked Keys

Add your key format to GitHub's secret scanning partner program or build your own detection:

1. Use a distinct prefix pattern — makes automated scanning possible.
2. If a key is used from an unexpected IP/country, flag it and email the owner.
3. Implement webhook alerts: "Your key `sk_abc...xyz` was used 10,000 times in the last minute from 50 different IPs."

```typescript
async function detectAbusePattern(keyId: string): Promise<void> {
	const recentUsage = await db.keyUsage.countRecentRequests(keyId, '1m');
	const uniqueIps = await db.keyUsage.countUniqueIps(keyId, '1m');

	if (recentUsage > 1000 || uniqueIps > 20) {
		await notifyOwner(keyId, 'Unusual activity detected on your API key');
		await auditLog.record({ event: 'api_key_abuse_suspected', keyId });
	}
}
```
