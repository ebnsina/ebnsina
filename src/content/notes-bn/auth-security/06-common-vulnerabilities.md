---
title: 'Common Auth Vulnerabilities'
subtitle: 'CSRF, session fixation, timing attack, insecure direct object reference — এগুলো কী আর কীভাবে বন্ধ করবেন।'
chapter: 6
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['CSRF', 'session fixation', 'IDOR', 'timing attacks', 'OWASP']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন locksmith-এর শিক্ষা: lock কীভাবে pick করা হয় তা বোঝা চুরি সম্ভব করার জন্য নয় — কোন lock আসলে নিরাপদ তা জানার জন্য। Security engineer-রা defense বানাতে attack pattern পড়ে, exploit নয়।

</Callout>

## গল্পে বুঝি

মিরপুরে ইবনে সিনাদের একটা অ্যাপার্টমেন্ট বিল্ডিং, নিচে একজন দারোয়ান — আল-খোয়ারিজমি। নিয়ম হলো, ভেতরে ঢুকতে হলে রেজিস্টারে নাম মিলিয়ে দারোয়ান একটা ভিজিটর পাস দেবে। কিন্তু এক চালাক লোক আগেভাগেই ইবনে সিনাকে একটা পাস ধরিয়ে দিলো — "ভাই, এটা রেখে দেন, কাজে লাগবে।" ইবনে সিনা কিছু না ভেবে সেটা নিয়েই ভেতরে গেল, আর সেই লোকটার কাছে ওই পাসের হুবহু নকল থেকে যাওয়ায় ইবনে সিনার নামেই সে দিব্যি ঢুকে পড়ল। আরেকদিন একজন অচেনা লোক আল-খোয়ারিজমির হাতে একটা চিরকুট দিলো — "৩-বি ফ্ল্যাটের পার্সেলটা এই লোককে দিয়ে দিন।" চিরকুটে ৩-বি'র বাসিন্দার সিলমোহর দেখে আল-খোয়ারিজমি কিছু যাচাই না করেই পার্সেল দিয়ে দিলো — অথচ চিরকুটটা বাসিন্দা লেখেননি, সিলটা শুধু ধার করা।

আল-খোয়ারিজমির আরেকটা অভ্যাস — কেউ আসল বাসিন্দার নাম বললে সে রেজিস্টারের পাতা উল্টে উল্টে খোঁজে, কয়েক সেকেন্ড লাগে; আর ভুয়া নাম বললে সঙ্গে সঙ্গে "নাই" বলে ফিরিয়ে দেয়। বাইরের একজন শুধু জবাব আসতে কত সময় লাগছে তা মেপেই বুঝে ফেলল কোন কোন নাম আসল। এদিকে ফাতিমা আল-ফিহরি একদিন খেয়াল করলেন, তাঁর ১২-এ ফ্ল্যাটের চাবি দিয়ে পাশের ১২-বি'র দরজাও খুলে যায়, কারণ আল-খোয়ারিজমি শুধু দেখে "ইনি কি বাসিন্দা?" — "এটা কি আপনারই ফ্ল্যাট?" তা কখনো মেলায় না।

এই প্রতিটা ফাঁকই একেকটা auth vulnerability। আগেভাগে চেনা পাস ধরিয়ে দেওয়া = **session fixation** (তাই login-এর সময় session ID regenerate করতে হয়, যাতে আগের পাসটা অকেজো হয়ে যায়)। ধার করা সিল দেখে চিরকুট মেনে নেওয়া = **CSRF**, যেখানে browser নিজেই cookie জুড়ে দেয় বলে forged request বৈধ দেখায় (SameSite cookie বা CSRF token দিয়ে ঠেকান)। নাম যাচাইয়ে সময়ের পার্থক্য = **timing attack**, যা দিয়ে valid email/user enumerate করা যায় (তাই ফলাফল যাই হোক একই সময় নিন, secret মেলাতে `timingSafeEqual`)। আর নিজের চাবিতে পাশের দরজা খুলে যাওয়া = **IDOR/BOLA** — শুধু "logged in কি না" দেখলে হবে না, query-তেই ownership মেলাতে হবে। বাস্তবেও বহু API-তে অন্যের অর্ডার বা ইনভয়েস শুধু URL-এর ID বদলে দেখে ফেলার ঘটনা ঘটেছে; OWASP-এর API Top 10 তালিকায় এই BOLA এখনো এক নম্বর ঝুঁকি।

## Cross-Site Request Forgery (CSRF)

একটা CSRF attack একজন authenticated user-এর browser-কে আপনার server-এ একটা অনিচ্ছাকৃত request পাঠাতে ফাঁদে ফেলে। Browser স্বয়ংক্রিয়ভাবে cookie যোগ করে, তাই request-টা বৈধ দেখায়।

**Attack-টা:**

```html
<!-- On attacker.com -->
<form action="https://yourbank.com/transfer" method="POST" id="f">
	<input name="to" value="attacker-account" />
	<input name="amount" value="10000" />
</form>
<script>
	document.getElementById('f').submit();
</script>
```

User যদি yourbank.com-এ logged in থাকে, তাদের session cookie স্বয়ংক্রিয়ভাবে পাঠানো হয়।

**Defense 1: SameSite cookie**

```typescript
res.cookie('session', sessionId, {
	httpOnly: true,
	secure: true,
	sameSite: 'strict' // browser won't send cookie on cross-site requests
});
```

`SameSite=Strict` হলো সবচেয়ে শক্ত defense। `Lax` (আধুনিক browser-এ default) top-level GET navigation-এ cookie allow করে কিন্তু POST-এ নয়।

**Defense 2: CSRF token**
যেসব API SameSite-এর উপর নির্ভর করতে পারে না (যেমন পুরনো browser support, subdomain):

```typescript
import crypto from 'crypto';

// Generate token tied to session
function generateCsrfToken(sessionId: string): string {
	const secret = process.env.CSRF_SECRET!;
	return crypto.createHmac('sha256', secret).update(sessionId).digest('hex');
}

// Middleware: validate on state-changing requests
function csrfProtection(req: Request, res: Response, next: NextFunction): void {
	if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

	const sessionToken = generateCsrfToken(req.session.id);
	const clientToken = req.headers['x-csrf-token'] as string;

	if (
		!clientToken ||
		!crypto.timingSafeEqual(Buffer.from(sessionToken), Buffer.from(clientToken))
	) {
		return res.status(403).json({ error: 'CSRF token invalid' });
	}

	next();
}

// Expose token to client (embed in page or via endpoint)
app.get('/api/csrf-token', (req, res) => {
	res.json({ token: generateCsrfToken(req.session.id) });
});
```

Client এই token-টা একটা header হিসেবে পাঠায় (যেমন `X-CSRF-Token`)। same-origin policy-র কারণে একজন cross-origin attacker token-টা পড়তে পারে না।

**নোট:** আপনি যদি Authorization header-এ JWT ব্যবহার করেন (cookie নয়), তাহলে আপনার CSRF protection দরকার নেই — attacker cross-origin-এ যা-খুশি header সেট করতে পারে না।

## Session Fixation

একজন attacker user log in করার আগে একটা পরিচিত session ID সেট করে, তারপর login-এর পরে, সেই একই session ID ব্যবহার করে authenticated session-এর ছদ্মবেশ ধারণ করে।

**সমাধান:** সবসময় login-এ session ID regenerate করুন:

```typescript
app.post('/login', async (req, res) => {
	const user = await verifyCredentials(req.body.email, req.body.password);
	if (!user) return res.status(401).json({ error: 'Invalid credentials' });

	// Regenerate session ID — attacker's pre-set ID is now useless
	await new Promise<void>((resolve, reject) => {
		req.session.regenerate((err) => (err ? reject(err) : resolve()));
	});

	req.session.userId = user.id;
	res.json({ ok: true });
});
```

একইভাবে, logout-এ regenerate করুন:

```typescript
app.post('/logout', (req, res) => {
	req.session.destroy(() => {
		res.clearCookie('session');
		res.json({ ok: true });
	});
});
```

## Timing Attack

আপনার login function যদি "wrong password"-এর চেয়ে "user not found"-এর জন্য faster return করে, তাহলে একজন attacker response time মেপে valid email enumerate করতে পারে।

**Attack-টা:**

```
POST /login {"email": "test1@example.com"} → 2ms (user not found — no DB hit)
POST /login {"email": "admin@yourapp.com"} → 120ms (user found, hash compared)
```

**সমাধান:** ফলাফল যাই হোক না কেন সবসময় ব্যয়বহুল operation-টা করুন:

```typescript
const DUMMY_HASH = await argon2.hash('dummy-password');

async function login(email: string, password: string): Promise<User | null> {
	const user = await db.users.findByEmail(email);

	if (!user) {
		// Still compare against a dummy hash — same time cost
		await argon2.verify(DUMMY_HASH, password).catch(() => {});
		return null;
	}

	const valid = await argon2.verify(user.passwordHash, password);
	return valid ? user : null;
}
```

**String comparison timing:** secret compare করার সময় `crypto.timingSafeEqual` ব্যবহার করুন:

```typescript
// WRONG — exits early on first mismatch
if (userToken === expectedToken) ...

// RIGHT — always compares all bytes
if (crypto.timingSafeEqual(
  Buffer.from(userToken),
  Buffer.from(expectedToken),
)) ...
```

## Insecure Direct Object References (IDOR)

User A একটা ID অনুমান করে বা increment করে User B-এর data access করে।

```
GET /api/orders/12345  → User A's order (they're logged in)
GET /api/orders/12346  → User B's order (oops — just incremented)
```

**সমাধান:** সবসময় query-তে ownership enforce করুন:

```typescript
// WRONG — only checks auth, not ownership
app.get('/api/orders/:id', requireAuth, async (req, res) => {
	const order = await db.orders.findById(req.params.id);
	if (!order) return res.status(404).json({ error: 'Not found' });
	res.json(order);
});

// RIGHT — ownership is part of the query
app.get('/api/orders/:id', requireAuth, async (req, res) => {
	const order = await db.orders.findOne({
		where: { id: req.params.id, userId: req.user.id } // must match both
	});
	if (!order) return res.status(404).json({ error: 'Not found' });
	res.json(order);
});
```

sequential integer-এর বদলে random ID (UUID) ব্যবহার করার কথাও ভাবুন — এগুলো অনুমান করা কঠিন, যদিও ownership check-এর বিকল্প নয়।

## Mass Assignment

একটা bulk assignment operation দিয়ে user-দের যেকোনো field সেট করতে দেওয়া:

```typescript
// WRONG — user can set role: 'admin', isVerified: true, etc.
app.put('/api/users/:id', requireAuth, async (req, res) => {
	await db.users.update(req.params.id, req.body); // uses everything from body
	res.json({ ok: true });
});

// RIGHT — explicit allowlist
app.put('/api/users/:id', requireAuth, async (req, res) => {
	const allowed = ['name', 'bio', 'avatarUrl'];
	const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
	await db.users.update(req.params.id, updates);
	res.json({ ok: true });
});
```

incoming data-র জন্য exact shape define করতে manually filter করার বদলে একটা validation library (Zod, Joi) ব্যবহার করুন।

## JWT Vulnerability (বাস্তবিক)

**Unsigned token মেনে নেওয়া:**

```typescript
// WRONG — 'none' alg accepted
jwt.verify(token, secret); // some libraries accept alg:none by default

// RIGHT — explicit algorithm allowlist
jwt.verify(token, secret, { algorithms: ['HS256'] });
```

**Claim verify না করা:**

```typescript
// WRONG — only checks signature
const payload = jwt.verify(token, secret);
// payload.exp might be in the past
// payload.iss might be a different auth server
// payload.aud might be a different service

// RIGHT — verify all relevant claims
const payload = jwt.verify(token, secret, {
	algorithms: ['HS256'],
	issuer: 'https://auth.yourapp.com',
	audience: 'api'
	// exp checked automatically
});
```

**Long-lived token:**

```typescript
// WRONG — 30-day access token means 30 days of exposure if leaked
jwt.sign({ sub: userId }, secret, { expiresIn: '30d' });

// RIGHT — short access tokens, rotate via refresh
jwt.sign({ sub: userId }, secret, { expiresIn: '15m' });
```

## API-তে Broken Object Level Authorization (BOLA/IDOR)

যে GraphQL আর REST API ID expose করে সেগুলো বিশেষভাবে ঝুঁকিপূর্ণ:

```graphql
# Attacker queries another user's data
query {
	user(id: "another-user-id") {
		email
		creditCards {
			number
		}
	}
}
```

```typescript
// GraphQL resolver — must enforce auth
const resolvers = {
	Query: {
		user: async (_: unknown, { id }: { id: string }, context: Context) => {
			if (!context.user) throw new AuthenticationError('Not authenticated');

			// Only allow users to query themselves, unless admin
			if (id !== context.user.id && context.user.role !== 'admin') {
				throw new ForbiddenError('Not authorized');
			}

			return db.users.findById(id);
		}
	}
};
```

## Security Header

প্রতিটা response-এ এগুলো যোগ করুন:

```typescript
app.use((req, res, next) => {
	// Prevent MIME type sniffing
	res.set('X-Content-Type-Options', 'nosniff');

	// Prevent clickjacking
	res.set('X-Frame-Options', 'DENY');

	// XSS protection (legacy browsers)
	res.set('X-XSS-Protection', '1; mode=block');

	// HTTPS only
	res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

	// Content Security Policy
	res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'");

	// Don't send referrer to external sites
	res.set('Referrer-Policy', 'strict-origin-when-cross-origin');

	next();
});
```

অথবা [Helmet](https://helmetjs.github.io/) ব্যবহার করুন যা যুক্তিসঙ্গত default সেট করে:

```typescript
import helmet from 'helmet';
app.use(helmet());
```
