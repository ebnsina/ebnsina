---
title: 'Password Hashing'
subtitle: 'Password-এর জন্য MD5 আর SHA-256 কেন ব্যর্থ হয়, bcrypt আর Argon2 কীভাবে কাজ করে, আর output নিয়ে কী করবেন।'
chapter: 2
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['bcrypt', 'argon2', 'hashing', 'salting', 'password storage']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

time-lock mechanism সহ একটা safe: উদ্দেশ্য শুধু খোলা কঠিন করা নয়, বরং ধীর করা — যাতে সঠিক combination দিয়েও এক মিনিট লাগে। একটা fast lock attacker-কে শুধু কয়েক millisecond দেরি করায়। Password hashing একইভাবে কাজ করে: ইচ্ছাকৃত ধীরগতিই এর feature।

</Callout>

## General-Purpose Hash Function কেন ব্যর্থ হয়

MD5, SHA-1, SHA-256 — এগুলো fast হওয়ার জন্য design করা। একটা আধুনিক GPU প্রতি সেকেন্ডে বিলিয়ন বিলিয়ন SHA-256 hash compute করতে পারে। আপনার database leak হলে, একজন attacker মিনিটের মধ্যে প্রতিটা common password try করতে পারে।

```
SHA-256("password123") = ef92b778... (computed in ~0.000001ms)
```

এখানে speed-ই শত্রু। আপনি এমন একটা function চান যা design-এই ধীর, hardware উন্নত হওয়ার সাথে সাথে সময়ের সাথে tunable, এবং specialized hardware দিয়ে parallelization থেকে immune।

## Salt: Rainbow Table হারানো

Adaptive hashing-এর আগে, মূল defense ছিল salting। একটা **salt** হলো একটা random value যা hash করার আগে password-এর সাথে যোগ করা হয়, এবং hash-এর পাশে store করা হয়:

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

Salting rainbow table (precomputed hash→password lookup) হারায় — একই password-এর জন্যও প্রতিটা user-এর hash unique। কিন্তু SHA-256 এখনও fast। database হাতে থাকা একজন attacker শুধু per-user brute force করে।

## bcrypt

bcrypt salt আর iteration count hash output-এর মধ্যে embed করে। work factor (`rounds`) নির্ধারণ করে প্রতিটা computation কতটা ধীর:

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

rounds=12-তে একটা সাধারণ server-এ bcrypt প্রতি hash-এ ~250ms নেয়। leak হওয়া database brute-force করা attacker-এর জন্য এটা যথেষ্ট ধীর যে যন্ত্রণাদায়ক, কিন্তু login-এর সময় user-রা টের পায় না এতটা fast।

**Round benchmark করা:**

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

এমন একটা round count বাছুন যেখানে প্রতিটা hash-এ 100–300ms লাগে। প্রতি বছর আবার benchmark করুন এবং প্রয়োজনমতো বাড়ান।

**bcrypt-এর সীমাবদ্ধতা:** 72-byte input limit। 72 byte-এর বেশি লম্বা password নীরবে truncate হয়ে যায়। লম্বা passphrase-এর জন্য, প্রথমে SHA-256 দিয়ে pre-hash করুন:

```typescript
async function hashPasswordSafe(password: string): Promise<string> {
	// SHA-256 of password → 32 bytes → base64 → 44 chars — always under bcrypt's 72-byte limit
	const normalized = crypto.createHash('sha256').update(password, 'utf8').digest('base64');
	return bcrypt.hash(normalized, ROUNDS);
}
```

## Argon2

2015 সালের Password Hashing Competition-এর বিজয়ী। bcrypt-এর চেয়ে বেশি tunable — আপনি time cost, memory cost, আর parallelism নিয়ন্ত্রণ করেন:

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

**Argon2 variant:**

- `argon2d`: GPU attack-এ resistant (data-dependent memory access)। Password-এর জন্য ব্যবহার করবেন না — side-channel attack-এ vulnerable।
- `argon2i`: Data-independent memory access। Side-channel-এ resistant। GPU attack-এর বিরুদ্ধে দুর্বল।
- `argon2id`: Hybrid। Password আর KDF-এর জন্য এটাই ব্যবহার করুন।

**bcrypt থেকে মূল পার্থক্য হলো memory cost।** প্রতি hash-এ 64MB দরকার হওয়া মানে একজন attacker-এর প্রতিটা parallel attempt-এর জন্য 64MB GPU VRAM লাগে। High-end GPU-তে ~24GB থাকে — সেটা মাত্র ~375টা parallel attempt, যেখানে সমতুল্য time cost-এ bcrypt-এর জন্য লাগত মিলিয়ন মিলিয়ন।

**Minimum parameter (OWASP 2023):**

- `argon2id` with m=47104 (46MB), t=1, p=1
- অথবা m=19456 (19MB), t=2, p=1
- অথবা bcrypt with cost=10

## Store করা ও Verify করা

bcrypt আর argon2 দুটোই self-contained string তৈরি করে যাতে algorithm, parameter, salt, আর hash থাকে। পুরো string-টা store করুন — আলাদা salt column-এর দরকার নেই:

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

## Login-এ Hash Upgrade করা

আপনার database-এ পুরনো MD5/SHA-1 hash থাকলে, successful login-এ upgrade করুন (সেই মুহূর্তে আপনার কাছে plaintext আছে):

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

যে user কখনও log in করে না তারা তাদের পুরনো hash রেখে দেয় — সেটা গ্রহণযোগ্য। একটা migration deadline-এর পরে সেই account-গুলোর জন্য আপনি password reset বাধ্যতামূলক করতে পারেন।

## যা করবেন না

- **কখনও plaintext password store করবেন না।** কখনও না। "সাময়িকভাবে"ও না।
- **Password-এর জন্য কখনও একা MD5, SHA-1, SHA-256, বা SHA-512 ব্যবহার করবেন না।** এগুলো অনেক fast।
- **কখনও নিজের algorithm বানাবেন না।** bcrypt বা argon2id ব্যবহার করুন।
- **কখনও `===` দিয়ে hash compare করবেন না।** `crypto.timingSafeEqual` বা library-র `verify` function ব্যবহার করুন।
- **যা-খুশি complexity rule চাপাবেন না।** symbol-এর চেয়ে length বেশি গুরুত্বপূর্ণ। লম্বা passphrase-কে অনুমতি দিন। [NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html) কমপক্ষে 8 character-এর সুপারিশ করে, কোনো composition rule নয়, কোনো forced rotation নয়।
