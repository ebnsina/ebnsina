---
title: 'API Key Management'
subtitle: 'API key generate করা, store করা, rotate করা, আর revoke করা — machine-to-machine auth-এর পেছনের plumbing।'
chapter: 5
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['API keys', 'HMAC', 'key rotation', 'scopes', 'machine-to-machine']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা server room-এর physical key: যার access দরকার তাদের প্রত্যেককে একটা করে দেন, কার কাছে কোন key আছে তা log রাখেন, আর কেউ company ছেড়ে গেলে তার key ফেরত নেন (revoke) আর দরকার হলে lock বদলে দেন। আপনি কখনও master key দেন না — শুধু নির্দিষ্ট দরজার জন্য scoped copy দেন।

</Callout>

## গল্পে বুঝি

রহিমের একটা ডেলিভারি কোম্পানি। শহরের নানা জায়গায় তার গুদাম, আর মাল টানার জন্য অনেক partner rider। প্রতিটা rider-কে অফিস থেকে একটা কোড দেওয়া ID badge দেওয়া হয় — গেটে ঢোকার সময় badge-টা ছোঁয়ালেই warehouse বুঝে যায় "এটা করিম, আমাদের একজন rider, ওকে ঢুকতে দাও"। মনে রাখবেন, badge-টা কিন্তু কোনো কাস্টমারের পরিচয় না — এটা rider হিসেবে করিমের নিজের সার্ভিসের পরিচয়, যাতে গেটে বারবার নাম-ঠিকানা যাচাই করতে না হয়। আর করিমের badge শুধু মিরপুর আর উত্তরার গুদামে কাজ করে; চট্টগ্রামের গুদামে ছোঁয়ালে গেট খোলে না — কারণ ওর কাজ ওই দুই এলাকাতেই।

একদিন করিমের badge-টা রাস্তায় পড়ে হারিয়ে গেল। সে সঙ্গে সঙ্গে অফিসে ফোন করল। অফিস এক সেকেন্ডে ওই badge নম্বরটা সিস্টেম থেকে বাতিল করে দিল — এখন কেউ ওটা কুড়িয়ে পেয়ে গেটে ছোঁয়ালেও আর ঢুকতে পারবে না। তারপর করিমকে একটা নতুন নম্বরের ফ্রেশ badge ইস্যু করা হলো, কাজ চলতে থাকল আগের মতোই। অফিস আবার নিয়ম করে প্রতি কয়েক মাস পরপর সবার badge বদলে নতুন নম্বর দেয় — যাতে পুরনো কোনো কপি কারো হাতে থেকে গেলেও সেটা আপনা থেকেই অকেজো হয়ে যায়।

এই badge-টাই আসলে **API key**। এটা কোনো end user নয়, একটা সার্ভিস বা অ্যাপকে identify করে (rider = আপনার service)। badge শুধু কিছু গুদামে চলে — সেটাই **scope**, key-কে দরকারি permission-এই সীমাবদ্ধ রাখা। হারানো badge সঙ্গে সঙ্গে বাতিল করা হলো leak হলে **revoke**, আর নিয়ম করে নতুন badge ইস্যু করাটাই **rotate**। বাস্তবে ঠিক এভাবেই Stripe বা Google Maps-এর API key কাজ করে — আপনার server থেকে server-to-server call-এ key পাঠিয়ে "আমি অমুক অ্যাপ" প্রমাণ করেন, key leak হলে dashboard থেকে এক ক্লিকে revoke করে নতুন key নেন।

## কখন API Key ব্যবহার করবেন

API key machine-to-machine (M2M) communication-এর জন্য ভালো কাজ করে যেখানে OAuth flow সম্পূর্ণ করার জন্য কোনো মানুষ জড়িত থাকে না:

- আপনার deployment API call করা CI/CD pipeline
- Third-party integration (Stripe webhook, GitHub Actions)
- আপনার API access করা SDK আর CLI tool
- আপনার infrastructure-এর মধ্যে service-to-service call

User-facing auth-এর জন্য, OAuth/OIDC বা session ব্যবহার করুন। API key user identity বহন করে না — এরা client identity বহন করে।

## Key Generation

Key যেমন হওয়া উচিত:

- অনুমান করা অসম্ভব হওয়ার মতো যথেষ্ট লম্বা (32+ byte randomness)
- শনাক্তকরণের জন্য prefixed (log-এ, secret scanning-এ সাহায্য করে)
- Non-sequential (কোনো timestamp নয়, কোনো incrementing ID নয়)

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

**Prefix convention:** অর্থপূর্ণ prefix ব্যবহার করুন (`sk_` secret key-র জন্য, `pk_` public key-র জন্য, `whsec_` webhook secret-এর জন্য)। GitHub, Stripe, আর Twilio এটা করে — এটা repo-তে secret scanning সম্ভব করে।

```typescript
// GitHub secret scanning pattern example
// stripe_live: sk_live_[0-9a-zA-Z]{24}
// Your API: myapp_sk_[A-Za-z0-9_-]{43}
```

## Storage

শুধু hash store করুন, কখনও plaintext key নয়:

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

Creation-এর পরে key ঠিক একবার দেখান। এরপর, শুধু `keyId` আর name দেখান। এটা GitHub আর AWS কীভাবে access key creation handle করে তার অনুকরণ করে।

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

**Verified key সংক্ষিপ্তভাবে cache করুন** — প্রতিটা request-এ hashing + DB lookup latency যোগ করে। একটা 30-60 second cache নিরাপদ কারণ বেশিরভাগ use case-এ revocation তাৎক্ষণিক হওয়ার দরকার নেই:

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

## Scope

Key-কে ন্যূনতম প্রয়োজনীয় permission-এ scope করুন:

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

Rotation একটা পুরনো key-কে downtime ছাড়াই একটা নতুন দিয়ে প্রতিস্থাপন করে। চ্যালেঞ্জ: আপনি client-কে তাৎক্ষণিক rotate করতে বাধ্য করতে পারেন না।

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

এটা caller-দের পুরনোটা কাজ বন্ধ করার আগে নতুন key-তে update করার জন্য এক সপ্তাহ দেয়। adoption track করতে rotation-এর পরে পুরনো key ব্যবহার হলে একটা warning log করুন।

## Revocation

তাৎক্ষণিক — শুধু key-টা revoked mark করুন:

```typescript
async function revokeApiKey(keyId: string, ownerId: string): Promise<void> {
	const key = await db.apiKeys.findOne({ where: { keyId, ownerId } });
	if (!key) throw new Error('Key not found or not owned by you');

	await db.apiKeys.update(key.id, { revokedAt: new Date() });

	// Purge from cache
	keyCache.delete(key.keyHash);
}
```

## User-দের কাছে Key Management উন্মুক্ত করা

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

## Leaked Key শনাক্ত করা

GitHub-এর secret scanning partner program-এ আপনার key format যোগ করুন অথবা আপনার নিজের detection বানান:

1. একটা স্বতন্ত্র prefix pattern ব্যবহার করুন — automated scanning সম্ভব করে।
2. একটা key যদি অপ্রত্যাশিত IP/country থেকে ব্যবহার হয়, এটা flag করুন আর owner-কে email করুন।
3. Webhook alert বসান: "আপনার key `sk_abc...xyz` গত এক মিনিটে 50টা ভিন্ন IP থেকে 10,000 বার ব্যবহার হয়েছে।"

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
