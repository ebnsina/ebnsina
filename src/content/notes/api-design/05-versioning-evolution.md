---
title: "Versioning & Evolution"
subtitle: "Evolve your API without breaking existing clients — URL versioning, header versioning, backward compatibility, and deprecation strategies."
chapter: 5
level: "intermediate"
readingTime: "10 min"
topics: ["versioning", "backward compatibility", "deprecation", "API evolution"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Version?

APIs evolve. You will need to rename fields, change response formats, or remove endpoints. Without a versioning strategy, every change risks breaking existing clients.

<Callout type="info">

**Real-World Analogy**

Like a phone OS update — the old version still works for a while, but new features are only on v2. The maker doesn't break everyone's apps overnight; they deprecate gradually.

</Callout>

## Versioning Strategies

### 1. URL Path Versioning

The most common and most visible approach:

```typescript
// Version in the URL path
GET /api/v1/users
GET /api/v2/users

// Express implementation
import v1Router from "./routes/v1";
import v2Router from "./routes/v2";

app.use("/api/v1", v1Router);
app.use("/api/v2", v2Router);

// routes/v1/users.ts
router.get("/users", async (req, res) => {
  const users = await db.users.find();
  // v1 returns flat structure
  res.json(users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
  })));
});

// routes/v2/users.ts
router.get("/users", async (req, res) => {
  const users = await db.users.find();
  // v2 returns envelope with split name
  res.json({
    data: users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      createdAt: u.createdAt,
    })),
    meta: { total: users.length },
  });
});
```

**Pros:** Easy to understand, visible in URLs, easy to route
**Cons:** Duplicates code, hard to maintain many versions

### 2. Header Versioning

Version is specified in a custom header or the Accept header:

```typescript
// Custom header
GET /api/users
X-API-Version: 2

// Accept header (content negotiation)
GET /api/users
Accept: application/vnd.myapi.v2+json

// Implementation
app.get("/api/users", async (req, res) => {
  const version = getApiVersion(req);
  const users = await db.users.find();

  if (version === 1) {
    return res.json(formatUsersV1(users));
  }

  res.json(formatUsersV2(users));
});

function getApiVersion(req: express.Request): number {
  // Check custom header first
  const headerVersion = req.headers["x-api-version"];
  if (headerVersion) return Number(headerVersion);

  // Check Accept header
  const accept = req.headers.accept || "";
  const match = accept.match(/application\/vnd\.myapi\.v(\d+)\+json/);
  if (match) return Number(match[1]);

  // Default to latest
  return 2;
}
```

**Pros:** Clean URLs, no code duplication
**Cons:** Less visible, harder to test in browser

### 3. Query Parameter Versioning

```typescript
// Version in query string
GET /api/users?version=2

// Simple but not recommended for production APIs
```

**Pros:** Easy to switch versions for testing
**Cons:** Mixes concerns in query params, caching issues

<Callout type="tip">

**Which Strategy to Choose?**

- **URL versioning** is the best default choice for public APIs — it is explicit, cacheable, and easy to understand
- **Header versioning** works well for internal APIs and when you want clean URLs
- **Query parameter versioning** is fine for quick prototypes but not for production
- Most major APIs (Stripe, GitHub, Twilio) use URL versioning

</Callout>

## Backward-Compatible Changes

Not every change needs a new version. These changes are backward-compatible:

```typescript
// SAFE — Adding new fields (clients ignore unknown fields)
// v1 response
{ "id": 1, "name": "Rahim" }

// Updated response — still compatible with v1 clients
{ "id": 1, "name": "Rahim", "avatar": "https://..." }

// SAFE — Adding new endpoints
GET /api/users/:id/preferences  // New endpoint, does not affect existing ones

// SAFE — Adding optional query parameters
GET /api/users?include=orders  // New filter, existing calls without it still work

// SAFE — Making a required field optional
// Before: name was required
// After: name is optional with a default

// BREAKING — Removing a field
{ "id": 1, "name": "Rahim" }  // "email" was here before, clients depend on it

// BREAKING — Renaming a field
{ "id": 1, "full_name": "Rahim" }  // Was "name", clients break

// BREAKING — Changing a field's type
{ "id": "user_1" }  // Was a number, now a string

// BREAKING — Removing an endpoint
// DELETE /api/legacy-users  — clients still call this
```

## Deprecation Strategy

When you need to retire an old version:

```typescript
// Step 1: Mark endpoints as deprecated with headers
app.use("/api/v1", (req, res, next) => {
  res.set("Deprecation", "true");
  res.set("Sunset", "Sat, 01 Jun 2026 00:00:00 GMT");
  res.set("Link", '</api/v2>; rel="successor-version"');

  // Log deprecated usage for monitoring
  metrics.increment("api.v1.deprecated_call", {
    endpoint: req.path,
    client: req.headers["user-agent"],
  });

  next();
});

// Step 2: Return warnings in response body
function deprecationWrapper(handler: express.RequestHandler): express.RequestHandler {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (typeof body === "object" && body !== null) {
        (body as Record<string, unknown>)._warnings = [
          {
            code: "DEPRECATED_VERSION",
            message: "API v1 is deprecated. Please migrate to v2 by June 2026.",
            docs: "https://docs.myapi.com/migration/v1-to-v2",
          },
        ];
      }
      return originalJson(body);
    };
    handler(req, res, next);
  };
}

// Step 3: After sunset date, return 410 Gone
app.use("/api/v1", (req, res) => {
  res.status(410).json({
    error: {
      code: "VERSION_RETIRED",
      message: "API v1 has been retired. Please use v2.",
      migrationGuide: "https://docs.myapi.com/migration/v1-to-v2",
    },
  });
});
```

## Migration Guide Pattern

Always provide a clear migration guide when introducing a new version:

```typescript
// Document every breaking change
const migrationGuide = {
  from: "v1",
  to: "v2",
  changes: [
    {
      type: "field_renamed",
      endpoint: "GET /users",
      before: { field: "name", type: "string" },
      after: { fields: ["firstName", "lastName"], type: "string" },
      migration: "Split the 'name' field on space, or use the new fields directly",
    },
    {
      type: "response_wrapped",
      endpoint: "ALL",
      before: "Direct array/object response",
      after: "Wrapped in { data, meta } envelope",
      migration: "Access response.data instead of response directly",
    },
    {
      type: "field_type_changed",
      endpoint: "GET /users",
      before: { field: "id", type: "number" },
      after: { field: "id", type: "string", format: "user_<number>" },
      migration: "Update ID comparisons to use string matching",
    },
  ],
};
```

<Callout type="warning">

**Common Versioning Mistakes**

- Versioning too early — you do not need v2 for backward-compatible changes
- Versioning too late — once clients depend on a behavior, it is a contract
- Maintaining too many versions — support at most 2 (current + previous)
- Not monitoring deprecated endpoint usage — you need data to know when it is safe to retire

</Callout>

## Key Takeaways

1. **URL path versioning** is the standard for public APIs — explicit and cacheable
2. **Additive changes are safe** — new fields, new endpoints, new optional parameters
3. **Removing or renaming fields is breaking** — always requires a new version or a migration period
4. **Deprecation is a process** — announce, warn, sunset, then retire
5. **Support at most two versions** at a time to keep maintenance manageable
6. **Monitor deprecated endpoint usage** to know when it is safe to remove old versions

