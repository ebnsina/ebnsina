---
title: 'Authentication vs Authorization'
subtitle: 'দুটো আলাদা প্রশ্ন: আপনি কে, আর আপনাকে কী করার অনুমতি দেওয়া হয়েছে। এদের গুলিয়ে ফেলাই security hole তৈরি হওয়ার কারণ।'
chapter: 1
level: 'beginner'
readingTime: '8 মিনিট'
topics: ['authentication', 'authorization', 'sessions', 'tokens', 'RBAC']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা concert venue: এন্ট্রান্সে ticket scanner যাচাই করে আপনার valid ticket আছে কিনা — সেটা authentication। আপনি যে wristband পান যেখানে লেখা "VIP" বা "General Admission" — সেটা authorization। দুটো আলাদা কাজ, দুটো আলাদা মুহূর্ত, দুজন আলাদা মানুষ সেগুলো করছে।

</Callout>

## মূল পার্থক্য

**Authentication (AuthN):** Identity যাচাই করা। আপনি কি সত্যিই সেই ব্যক্তি যে বলে দাবি করছেন?
**Authorization (AuthZ):** Permission যাচাই করা। আপনাকে কি এটা করার অনুমতি দেওয়া হয়েছে?

এরা ধারাবাহিকভাবে ঘটে। একটা অজানা identity-কে আপনি authorize করতে পারেন না। কিন্তু এরা আলাদা logic সহ আলাদা system। এদের মিশিয়ে ফেললে hole তৈরি হয়: একটা valid session যা এমন access দেয় যা দেওয়ার কথা না, অথবা একটা authorization check যা identity verification পুরোপুরি skip করে।

```typescript
// Authentication: verify the token, extract identity
async function authenticate(req: Request): Promise<User | null> {
	const token = req.headers['authorization']?.slice(7);
	if (!token) return null;

	try {
		const payload = await verifyJWT(token);
		return { id: payload.sub, role: payload.role, email: payload.email };
	} catch {
		return null;
	}
}

// Authorization: check if identity has permission
function authorize(user: User, action: string, resource: string): boolean {
	return permissions[user.role]?.[action]?.includes(resource) ?? false;
}

// Middleware composition — order matters
app.use(async (req, res, next) => {
	const user = await authenticate(req);
	if (!user) return res.status(401).json({ error: 'Unauthenticated' });

	if (!authorize(user, req.method, req.path)) {
		return res.status(403).json({ error: 'Forbidden' });
	}

	req.user = user;
	next();
});
```

status code-গুলো খেয়াল করুন: **401** মানে "আমি জানি না আপনি কে।" **403** মানে "আমি জানি আপনি কে, কিন্তু না।"

## Identity Factor

Authentication system এক বা একাধিক factor যাচাই করে:

| Factor     | এটা কী            | উদাহরণ                 |
| ---------- | ----------------- | ---------------------- |
| Knowledge  | আপনি যা জানেন     | Password, PIN          |
| Possession | আপনার কাছে যা আছে | TOTP app, hardware key |
| Inherence  | আপনি যা           | Fingerprint, face      |
| Location   | আপনি যেখানে       | IP range, geofence     |

MFA (Multi-Factor Authentication)-এর জন্য আলাদা category থেকে দুই বা তার বেশি factor দরকার। দুটো password MFA নয় — দুটোই knowledge factor।

## Sessions vs Tokens

প্রাথমিক credential check-এর পরে authentication state ধরে রাখার দুটো approach:

**Server-side session:**

```typescript
// Login: verify credentials, create session
app.post('/login', async (req, res) => {
	const user = await verifyCredentials(req.body.email, req.body.password);
	if (!user) return res.status(401).json({ error: 'Invalid credentials' });

	// Store session server-side
	req.session.userId = user.id;
	req.session.role = user.role;

	res.json({ ok: true });
});

// Subsequent requests: look up session
app.use(async (req, res, next) => {
	if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

	req.user = await db.users.findById(req.session.userId);
	next();
});
```

**Stateless token (JWT):**

```typescript
// Login: verify credentials, issue token
app.post('/login', async (req, res) => {
	const user = await verifyCredentials(req.body.email, req.body.password);
	if (!user) return res.status(401).json({ error: 'Invalid credentials' });

	// Embed claims in signed token — no server storage
	const token = await signJWT({
		sub: user.id,
		role: user.role,
		email: user.email,
		exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
	});

	res.json({ token });
});
```

**Trade-off:**

|             | Sessions                         | Tokens (JWT)                           |
| ----------- | -------------------------------- | -------------------------------------- |
| Revocation  | তাৎক্ষণিক (server record delete) | কঠিন (expiry-র জন্য অপেক্ষা)           |
| Scalability | shared session store দরকার       | Stateless — যেকোনো server validate করে |
| Storage     | Server memory/Redis              | Client (localStorage বা cookie)        |
| Inspection  | কোনটা active server জানে         | Token self-contained                   |

Session invalidate করা সহজ। Token scale করা সহজ। যখন তাৎক্ষণিক revocation দরকার (admin panel, financial app) তখন session ব্যবহার করুন। যখন shared state ছাড়া horizontal scaling দরকার (API, microservice) তখন token ব্যবহার করুন।

## Role-Based Access Control (RBAC)

Role-এ permission assign করুন, user-দের role assign করুন। User-রা সরাসরি permission পায় না।

```typescript
type Role = 'admin' | 'editor' | 'viewer';
type Action = 'read' | 'write' | 'delete';
type Resource = 'posts' | 'users' | 'settings';

const rolePermissions: Record<Role, Partial<Record<Resource, Action[]>>> = {
	admin: {
		posts: ['read', 'write', 'delete'],
		users: ['read', 'write', 'delete'],
		settings: ['read', 'write']
	},
	editor: { posts: ['read', 'write'], users: ['read'] },
	viewer: { posts: ['read'] }
};

function can(role: Role, action: Action, resource: Resource): boolean {
	return rolePermissions[role]?.[resource]?.includes(action) ?? false;
}

// Usage
can('editor', 'delete', 'posts'); // false
can('admin', 'delete', 'posts'); // true
can('viewer', 'read', 'posts'); // true
```

RBAC ততক্ষণ কাজ করে যতক্ষণ role খুব granular না হয় ("editor-but-only-their-own-posts")। সেই পর্যায়ে Attribute-Based Access Control (ABAC)-এ চলে যান যেখানে permission হলো policy যা user, resource, আর environment-এর attribute-এর বিরুদ্ধে evaluate করা হয়।

## Attribute-Based Access Control (ABAC)

```typescript
interface AuthContext {
	user: { id: string; role: string; department: string };
	resource: { ownerId: string; visibility: 'public' | 'private'; classification: string };
	environment: { time: Date; ipAddress: string };
}

type Policy = (ctx: AuthContext) => boolean;

const policies: Record<string, Policy> = {
	'posts:delete': ({ user, resource }) => user.role === 'admin' || user.id === resource.ownerId,

	'documents:read': ({ user, resource }) =>
		resource.visibility === 'public' ||
		user.department === resource.classification ||
		user.role === 'admin'
};

function evaluate(action: string, ctx: AuthContext): boolean {
	const policy = policies[action];
	if (!policy) return false; // deny by default
	return policy(ctx);
}
```

ABAC বেশি expressive কিন্তু এটা নিয়ে ভাবা কঠিন। RBAC audit করা সহজ — প্রতিটা role কী করতে পারে তা আপনি enumerate করতে পারেন। আপনার access pattern আসলে কতটা জটিল তার ভিত্তিতে বেছে নিন।

## সাধারণ ভুল

**Authentication-এর আগে authorization check করা:**

```typescript
// WRONG — user might be null
if (req.user.role !== 'admin') return res.status(403).json(...);

// RIGHT — fail on missing identity first
if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
```

**Verification ছাড়া client থেকে আসা role claim-এ বিশ্বাস করা:**

```typescript
// WRONG — client controls this
const role = req.body.role;
if (role === 'admin') grantAdminAccess();

// RIGHT — role comes from verified token or database
const { role } = req.user; // set by auth middleware from verified JWT
```

**বন্ধ হওয়ার বদলে খোলা অবস্থায় fail করা:**

```typescript
// WRONG — unknown actions grant access
function canAccess(role: string, action: string): boolean {
	if (action === 'admin_only') return role === 'admin';
	return true; // default allow — dangerous
}

// RIGHT — deny by default
function canAccess(role: Role, action: Action, resource: Resource): boolean {
	return rolePermissions[role]?.[resource]?.includes(action) ?? false;
	// undefined → false
}
```
