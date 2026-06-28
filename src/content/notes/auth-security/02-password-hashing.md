---
title: 'Password Hashing'
subtitle: 'Why MD5 and SHA-256 fail for passwords, how bcrypt and Argon2 work, and what to do with the output.'
chapter: 2
level: 'beginner'
readingTime: '10 min'
topics: ['bcrypt', 'argon2', 'hashing', 'salting', 'password storage']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A safe with a time-lock mechanism: the point is not just to make it hard to open, but to make it slow — so even with the right combination, it takes a minute. A fast lock just delays an attacker by milliseconds. Password hashing works the same way: intentional slowness is the feature.

</Callout>

## Why General-Purpose Hash Functions Fail

MD5, SHA-1, SHA-256 — they're designed to be fast. A modern GPU can compute billions of SHA-256 hashes per second. If your database leaks, an attacker can try every common password in minutes.

```
SHA-256("password123") = ef92b778... (computed in ~0.000001ms)
```

Speed is the enemy here. You want a function that's slow by design, tunable over time as hardware improves, and immune to parallelization via specialized hardware.

## Salt: Defeating Rainbow Tables

Before adaptive hashing, the main defense was salting. A **salt** is a random value prepended to the password before hashing, stored alongside the hash:

```typescript
import crypto from 'crypto';

function hashWithSalt(password: string): string {
	const salt = crypto.randomBytes(16).toString('hex'); // random, unique per user
	const hash = crypto
		.createHash('sha256')
		.update(salt + password)
		.digest('hex');
	return `${salt}:${hash}`;
}

function verify(password: string, stored: string): boolean {
	const [salt, hash] = stored.split(':');
	const computed = crypto
		.createHash('sha256')
		.update(salt + password)
		.digest('hex');
	return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}
```

Salting defeats rainbow tables (precomputed hash→password lookups) — each user's hash is unique even for the same password. But SHA-256 is still fast. An attacker with the database just does per-user brute force.

## bcrypt

bcrypt embeds the salt and iteration count into the hash output. The work factor (`rounds`) determines how slow each computation is:

```typescript
import bcrypt from 'bcrypt';

const ROUNDS = 12; // 2^12 iterations — adjust as hardware improves

async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, ROUNDS);
	// Output: "$2b$12$salt22charshere...hash31charshere"
	//          ^   ^  ^                 ^
	//          alg cost salt            hash
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
	// bcrypt extracts salt and cost from the hash string automatically
}
```

At rounds=12, bcrypt takes ~250ms per hash on a typical server. That's slow enough to be painful for an attacker brute-forcing a leaked database, but fast enough that users don't notice during login.

**Benchmark rounds:**

```typescript
import { performance } from 'perf_hooks';

async function benchmarkBcrypt(): Promise<void> {
	for (let rounds = 10; rounds <= 14; rounds++) {
		const start = performance.now();
		await bcrypt.hash('test-password', rounds);
		const ms = (performance.now() - start).toFixed(0);
		console.log(`rounds=${rounds}: ${ms}ms`);
	}
}
// rounds=10: ~65ms
// rounds=11: ~130ms
// rounds=12: ~250ms
// rounds=13: ~500ms
// rounds=14: ~1000ms
```

Pick a round count where each hash takes 100–300ms. Re-benchmark yearly and increase as needed.

**bcrypt limitation:** 72-byte input limit. Passwords longer than 72 bytes are silently truncated. For long passphrases, pre-hash with SHA-256 first:

```typescript
async function hashPasswordSafe(password: string): Promise<string> {
	// SHA-256 of password → 32 bytes → base64 → 44 chars — always under bcrypt's 72-byte limit
	const normalized = crypto.createHash('sha256').update(password, 'utf8').digest('base64');
	return bcrypt.hash(normalized, ROUNDS);
}
```

## Argon2

The winner of the 2015 Password Hashing Competition. More tunable than bcrypt — you control time cost, memory cost, and parallelism:

```typescript
import argon2 from 'argon2';

const ARGON2_OPTIONS = {
	type: argon2.argon2id, // hybrid of argon2i and argon2d
	memoryCost: 65536, // 64 MB RAM required per hash
	timeCost: 3, // 3 iterations
	parallelism: 4 // 4 parallel threads
};

async function hashPassword(password: string): Promise<string> {
	return argon2.hash(password, ARGON2_OPTIONS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return argon2.verify(hash, password);
	// argon2 extracts params from hash string automatically
}
```

**Argon2 variants:**

- `argon2d`: Resistant to GPU attacks (data-dependent memory access). Don't use for passwords — vulnerable to side-channel attacks.
- `argon2i`: Data-independent memory access. Resistant to side-channels. Weaker against GPU attacks.
- `argon2id`: Hybrid. Use this for passwords and KDFs.

**Memory cost is the main differentiator from bcrypt.** Requiring 64MB per hash means an attacker needs 64MB GPU VRAM per parallel attempt. High-end GPUs have ~24GB — that's only ~375 parallel attempts, compared to millions for bcrypt at equivalent time cost.

**Minimum parameters (OWASP 2023):**

- `argon2id` with m=47104 (46MB), t=1, p=1
- or m=19456 (19MB), t=2, p=1
- or bcrypt with cost=10

## Storing and Verifying

Both bcrypt and argon2 produce self-contained strings that include algorithm, parameters, salt, and hash. Store the whole string — you don't need separate salt columns:

```typescript
// Database schema
interface UserRecord {
	id: string;
	email: string;
	passwordHash: string; // the full bcrypt/argon2 output string — ~60-100 chars
	createdAt: Date;
}

// Registration
async function register(email: string, password: string): Promise<void> {
	const passwordHash = await hashPassword(password);
	await db.users.insert({ email, passwordHash });
}

// Login
async function login(email: string, password: string): Promise<User | null> {
	const user = await db.users.findByEmail(email);
	if (!user) {
		// Still hash to prevent timing attacks revealing valid emails
		await dummyHash();
		return null;
	}

	const valid = await verifyPassword(password, user.passwordHash);
	if (!valid) return null;

	return user;
}

// Dummy hash prevents timing-based user enumeration
async function dummyHash(): Promise<void> {
	await argon2
		.verify('$argon2id$v=19$m=65536,t=3,p=4$dummysalt$dummyhash', 'dummy')
		.catch(() => {});
}
```

## Upgrading Hashes on Login

If you have old MD5/SHA-1 hashes in the database, upgrade on successful login (you have the plaintext at that moment):

```typescript
async function loginWithUpgrade(email: string, password: string): Promise<User | null> {
	const user = await db.users.findByEmail(email);
	if (!user) return null;

	let valid = false;

	if (isLegacyHash(user.passwordHash)) {
		// Old MD5/SHA hash — verify the old way
		valid = verifyLegacy(password, user.passwordHash);
		if (valid) {
			// Upgrade to argon2 now that we have plaintext
			const newHash = await hashPassword(password);
			await db.users.update(user.id, { passwordHash: newHash });
		}
	} else {
		valid = await verifyPassword(password, user.passwordHash);
	}

	return valid ? user : null;
}

function isLegacyHash(hash: string): boolean {
	return !hash.startsWith('$2b$') && !hash.startsWith('$argon2');
}
```

Users who never log in keep their old hashes — that's acceptable. You can force a password reset for those accounts after a migration deadline.

## What Not to Do

- **Never store plaintext passwords.** Never. Not even "temporarily."
- **Never use MD5, SHA-1, SHA-256, or SHA-512 alone for passwords.** They're too fast.
- **Never roll your own algorithm.** Use bcrypt or argon2id.
- **Never compare hashes with `===`.** Use `crypto.timingSafeEqual` or the library's `verify` function.
- **Don't enforce arbitrary complexity rules.** Length matters more than symbols. Allow long passphrases. [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) recommends at least 8 characters, no composition rules, no forced rotation.
