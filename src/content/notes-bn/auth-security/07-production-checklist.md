---
title: 'Auth in Production'
subtitle: 'অপারেশনাল checklist: আসল user-দের কাছে auth ship করার আগে কী verify করবেন, আর পরে কী monitor করবেন।'
chapter: 7
level: 'advanced'
readingTime: '8 মিনিট'
topics: ['production', 'checklist', 'monitoring', 'incident response', 'hardening']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা pre-flight checklist: pilot-রা অভিজ্ঞ বলে এটা এড়িয়ে যায় না — তারা প্রতিবার এটা চালায় কারণ একটা item মিস করার মূল্য বিপর্যয়কর। Auth একই রকম। checklist-টা আছে কারণ এটা ভুল করার পরিণতি হলো আপনার user-দের data অন্য কারো হাতে।

</Callout>

## Implementation Checklist

**Password**

```
□ Passwords hashed with argon2id (m≥19MB, t≥2) or bcrypt (cost≥12)
□ No plaintext passwords anywhere — not in logs, not in emails
□ Dummy hash on failed lookup (prevents timing-based enumeration)
□ timingSafeEqual for all secret comparisons
□ Minimum 8 chars; no forced complexity rules; allow long passphrases
□ Check against HaveIBeenPwned on registration and login
```

**Session ও Token**

```
□ Session IDs regenerated on login and privilege escalation
□ Session IDs not in URLs (use cookies only)
□ httpOnly + Secure + SameSite=Strict on session cookies
□ JWT algorithms explicitly allowlisted (never 'none')
□ JWT issuer, audience, and expiry validated on every request
□ Access tokens short-lived (≤15 minutes)
□ Refresh tokens rotated on use
□ Refresh token revocation on logout and password change
```

**API Key**

```
□ Keys hashed (SHA-256) before storage
□ Keys shown exactly once at creation
□ Keys prefixed for secret-scanning detection
□ Scopes enforced at middleware level
□ Last-used timestamp tracked
□ Key expiry available and enforced
```

**Transport**

```
□ TLS 1.2+ enforced, TLS 1.0/1.1 disabled
□ HSTS header with includeSubDomains
□ Certificate pinning for mobile apps accessing auth endpoints
□ No auth tokens in URLs or query strings
```

**CSRF**

```
□ SameSite=Strict on session cookies, or
□ CSRF token required on all state-changing requests
□ CORS configured to allowlist specific origins (not *)
```

**Authorization**

```
□ Default deny — unknown routes/actions return 403, not 200
□ Ownership enforced in queries (not just middleware)
□ Input validated and allowlisted before DB operations
□ Privilege escalation requires re-authentication
```

## Auth Endpoint-এর জন্য Rate Limiting

Auth endpoint হলো attack-এর target। আপনার general API-র চেয়ে কড়া limit প্রয়োগ করুন:

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Login: 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 5,
	store: new RedisStore({ client: redis }),
	keyGenerator: (req) => `login:${req.ip}`,
	handler: (req, res) => {
		res.status(429).json({
			error: 'Too many login attempts. Try again in 15 minutes.'
		});
	}
});

// Account-level: 10 attempts per hour regardless of IP (prevents distributed attacks)
const accountLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: 10,
	keyGenerator: (req) => `login:account:${req.body.email}`
});

app.post('/login', loginLimiter, accountLimiter, loginHandler);

// Password reset: 3 per hour per email
const resetLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: 3,
	keyGenerator: (req) => `reset:${req.body.email}`
});
```

বারবার fail হওয়ার পরে account সাময়িকভাবে lock করুন — কিন্তু সাবধানে করুন। একটা full lockout বৈধ user-দের বিরুদ্ধে denial-of-service সম্ভব করে। progressive delay prefer করুন:

```typescript
async function recordFailedLogin(userId: string): Promise<number> {
	const key = `login_failures:${userId}`;
	const failures = await redis.incr(key);
	await redis.expire(key, 3600); // reset after 1 hour of no failures
	return failures;
}

function getBackoffMs(failures: number): number {
	if (failures < 3) return 0;
	if (failures < 6) return 5_000; // 5s after 3rd failure
	if (failures < 10) return 30_000; // 30s after 6th
	return 300_000; // 5 min after 10th
}
```

## কী Log করবেন

প্রতিটা auth event incident তদন্ত করার মতো যথেষ্ট context সহ log করা উচিত:

```typescript
interface AuthEvent {
	event:
		| 'login_success'
		| 'login_failure'
		| 'logout'
		| 'password_change'
		| 'api_key_created'
		| 'api_key_revoked'
		| 'token_refresh'
		| 'permission_denied'
		| 'suspicious_activity';
	userId?: string;
	email?: string;
	ipAddress: string;
	userAgent: string;
	timestamp: Date;
	metadata?: Record<string, unknown>;
}

async function logAuthEvent(event: AuthEvent): Promise<void> {
	// Structured log — shipped to your log aggregator
	logger.info(event);

	// Also store in DB for user-facing "recent activity" feature
	await db.authEvents.insert(event);
}
```

**কীসের উপর alert দেবেন:**

- একটা single account-এর জন্য একাধিক failed login (credential stuffing)
- গত 30 দিনে না-দেখা নতুন country/IP থেকে successful login
- Revocation-এর পরে token ব্যবহার
- API key একটা সংক্ষিপ্ত window-তে স্বাভাবিকের 10x rate-এ ব্যবহার
- Password change বা email change (user-কে সাথে সাথে notify করুন)
- অস্বাভাবিক সময়ে admin account login

## Password Reset Flow

এখানকার সাধারণ ভুলগুলো account takeover-এর দিকে নিয়ে যায়:

```typescript
// Step 1: Request reset
app.post('/auth/reset-password/request', resetLimiter, async (req, res) => {
  const { email } = req.body;
  const user = await db.users.findByEmail(email);

  // Always respond identically — don't confirm email existence
  res.json({ message: 'If that email exists, a reset link has been sent.' });

  if (!user) return; // don't send email, but don't reveal this

  // Generate short-lived, single-use token
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');

  await db.passwordResets.insert({
    userId: user.id,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    usedAt: null,
  });

  await sendEmail(user.email, 'Password Reset', `
    Click this link to reset your password (expires in 15 minutes):
    https://yourapp.com/reset-password?token=${token}
  `);
});

// Step 2: Apply reset
app.post('/auth/reset-password/confirm', async (req, res) => {
  const { token, newPassword } = req.body;

  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = await db.passwordResets.findOne({
    where: { tokenHash: hash, usedAt: null },
  });

  if (!reset || reset.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }

  const passwordHash = await argon2.hash(newPassword);

  // Transaction: update password + mark token used + invalidate all sessions
  await db.transaction(async (tx) => {
    await tx.users.update(reset.userId, { passwordHash });
    await tx.passwordResets.update(reset.id, { usedAt: new Date() });
    await tx.sessions.deleteAll({ userId: reset.userId }); // force re-login everywhere
    await tx.refreshTokens.deleteAll({ userId: reset.userId });
  });

  await logAuthEvent({ event: 'password_change', userId: reset.userId, ... });
  await notifyPasswordChanged(reset.userId); // email user about the change

  res.json({ ok: true });
});
```

**গুরুত্বপূর্ণ নিয়ম:**

- Token single-use (redemption-এ `usedAt` mark করুন)
- Token দ্রুত expire হয় (15 minute)
- Reset সমস্ত বিদ্যমান session invalidate করে
- User পরিবর্তন সম্পর্কে notify হয় (তাদের account takeover detect করতে দেয়)
- Response timing email আছে কিনা তা প্রকাশ করে না

## Incident Response

যখন আপনি একটা compromise detect করেন:

```typescript
async function lockAccount(userId: string, reason: string): Promise<void> {
	await db.transaction(async (tx) => {
		// Prevent new logins
		await tx.users.update(userId, { lockedAt: new Date(), lockReason: reason });

		// Invalidate all active sessions
		await tx.sessions.deleteAll({ userId });

		// Revoke all refresh tokens
		await tx.refreshTokens.deleteAll({ userId });

		// Don't revoke API keys yet — might need audit trail
		// Mark for review instead
		await tx.apiKeys.update({ userId }, { requiresReview: true });
	});

	await notifyUser(userId, 'Your account has been temporarily locked. Contact support.');
	await alertSecurityTeam({ userId, reason });
}
```

Playbook:

1. Anomaly detect → account lock
2. verified channel-এ (email, SMS) user-কে notify করুন
3. compromise-এর scope-এর জন্য log audit করুন
4. unlock-এ password reset + MFA re-enrollment বাধ্যতামূলক করুন
5. Post-mortem: attacker কীভাবে ঢুকল?
