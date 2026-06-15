---
title: "Authentication vs Authorization"
subtitle: "Two different questions: who are you, and what are you allowed to do. Confusing them is how security holes form."
chapter: 1
level: "beginner"
readingTime: "8 min"
topics: ["authentication", "authorization", "sessions", "tokens", "RBAC"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A concert venue: the ticket scanner at the entrance checks you have a valid ticket — that's authentication. The wristband you get says "VIP" or "General Admission" — that's authorization. Two separate jobs, two separate moments, two separate people doing them.

</Callout>

## The Core Distinction

**Authentication (AuthN):** Verify identity. Are you who you claim to be?
**Authorization (AuthZ):** Verify permission. Are you allowed to do this?

They happen in sequence. You can't authorize an unknown identity. But they're separate systems with separate logic. Mixing them creates holes: a valid session that grants access it shouldn't, or an authorization check that skips identity verification entirely.

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

Note the status codes: **401** means "I don't know who you are." **403** means "I know who you are, but no."

## Identity Factors

Authentication systems verify one or more factors:

| Factor | What it is | Example |
|--------|-----------|---------|
| Knowledge | Something you know | Password, PIN |
| Possession | Something you have | TOTP app, hardware key |
| Inherence | Something you are | Fingerprint, face |
| Location | Where you are | IP range, geofence |

MFA (Multi-Factor Authentication) requires two or more factors from different categories. Two passwords is not MFA — both are knowledge factors.

## Sessions vs Tokens

Two approaches to persisting authentication state after the initial credential check:

**Server-side sessions:**
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

**Stateless tokens (JWT):**
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
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  });

  res.json({ token });
});
```

**Trade-offs:**

| | Sessions | Tokens (JWT) |
|--|----------|--------------|
| Revocation | Instant (delete server record) | Hard (wait for expiry) |
| Scalability | Requires shared session store | Stateless — any server validates |
| Storage | Server memory/Redis | Client (localStorage or cookie) |
| Inspection | Server knows what's active | Token is self-contained |

Sessions are easier to invalidate. Tokens are easier to scale. Use sessions when you need instant revocation (admin panels, financial apps). Use tokens when you need horizontal scaling without shared state (APIs, microservices).

## Role-Based Access Control (RBAC)

Assign permissions to roles, assign roles to users. Users don't get permissions directly.

```typescript
type Role = 'admin' | 'editor' | 'viewer';
type Action = 'read' | 'write' | 'delete';
type Resource = 'posts' | 'users' | 'settings';

const rolePermissions: Record<Role, Partial<Record<Resource, Action[]>>> = {
  admin:  { posts: ['read', 'write', 'delete'], users: ['read', 'write', 'delete'], settings: ['read', 'write'] },
  editor: { posts: ['read', 'write'], users: ['read'] },
  viewer: { posts: ['read'] },
};

function can(role: Role, action: Action, resource: Resource): boolean {
  return rolePermissions[role]?.[resource]?.includes(action) ?? false;
}

// Usage
can('editor', 'delete', 'posts')  // false
can('admin', 'delete', 'posts')   // true
can('viewer', 'read', 'posts')    // true
```

RBAC works until roles get too granular ("editor-but-only-their-own-posts"). At that point, move to Attribute-Based Access Control (ABAC) where permissions are policies evaluated against attributes of the user, resource, and environment.

## Attribute-Based Access Control (ABAC)

```typescript
interface AuthContext {
  user: { id: string; role: string; department: string };
  resource: { ownerId: string; visibility: 'public' | 'private'; classification: string };
  environment: { time: Date; ipAddress: string };
}

type Policy = (ctx: AuthContext) => boolean;

const policies: Record<string, Policy> = {
  'posts:delete': ({ user, resource }) =>
    user.role === 'admin' || user.id === resource.ownerId,

  'documents:read': ({ user, resource }) =>
    resource.visibility === 'public' ||
    user.department === resource.classification ||
    user.role === 'admin',
};

function evaluate(action: string, ctx: AuthContext): boolean {
  const policy = policies[action];
  if (!policy) return false; // deny by default
  return policy(ctx);
}
```

ABAC is more expressive but harder to reason about. RBAC is simpler to audit — you can enumerate what each role can do. Pick based on how complex your access patterns actually are.

## Common Mistakes

**Checking authorization before authentication:**
```typescript
// WRONG — user might be null
if (req.user.role !== 'admin') return res.status(403).json(...);

// RIGHT — fail on missing identity first
if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
```

**Trusting client-supplied role claims without verification:**
```typescript
// WRONG — client controls this
const role = req.body.role;
if (role === 'admin') grantAdminAccess();

// RIGHT — role comes from verified token or database
const { role } = req.user; // set by auth middleware from verified JWT
```

**Failing open instead of closed:**
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

