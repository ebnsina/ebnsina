---
title: "HTTP Caching & CDN"
subtitle: "Cache-Control, ETags, and CDN edge caching — the layer that can eliminate your server entirely for static content."
chapter: 8
level: "intermediate"
readingTime: "14 min"
topics: ["Cache-Control", "ETag", "CDN", "edge caching", "HTTP headers"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why HTTP Caching Exists

Every HTTP response can carry instructions about how it should be cached — by browsers, proxies, and CDN edge nodes. When these instructions are set correctly, repeat requests for the same resource never reach your server at all.

The problem it solves: serving the same bytes to millions of users is wasteful. A 500KB JavaScript bundle served from a single origin to 10 million users is 5TB of transfer. HTTP caching means most of those users never contact your origin.

<Callout type="info">

**Real-World Analogy**

A newspaper printer prints 100,000 copies in the morning. Each copy goes to a delivery depot (CDN edge node). Readers pick up from the depot, not the printer. The printer only runs when there's a new edition. HTTP caching is the same: your server is the printer, CDN edges are the depots, and `Cache-Control` tells the depot how long to keep today's edition before discarding it.

</Callout>

## Cache-Control Header

The primary mechanism. Controls who can cache, for how long, and under what conditions.

```http
Cache-Control: public, max-age=31536000, immutable
```

**Key directives:**

| Directive | Meaning |
|-----------|---------|
| `public` | CDNs and proxies can cache this |
| `private` | Only the browser can cache (not CDN) |
| `no-store` | Never cache anywhere |
| `no-cache` | Cache but revalidate before serving |
| `max-age=N` | Fresh for N seconds |
| `s-maxage=N` | CDN freshness (overrides max-age for CDNs) |
| `stale-while-revalidate=N` | Serve stale for N seconds while refreshing |
| `immutable` | Never revalidate during max-age (browser hint) |
| `must-revalidate` | Must contact origin when stale, never serve expired |

```typescript
// Express/Node.js — set cache headers
app.get('/api/products/:id', async (req, res) => {
  const product = await getProduct(req.params.id);

  // Public, 5 minute CDN cache, serve stale for 30s while revalidating
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=30');
  res.json(product);
});

// Immutable assets (content-hashed filenames)
app.use('/assets', express.static('dist/assets', {
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

// Private, user-specific data
app.get('/api/me', authenticate, (req, res) => {
  res.set('Cache-Control', 'private, max-age=60');
  res.json(req.user);
});
```

<Callout type="tip">

**Content-hash your asset filenames.** `app.js?v=1.2.3` is fragile — someone may cache the old file and ignore the version query. `app.a4f8c2b1.js` is the hash of the file content — when the file changes, the URL changes, and browsers fetch fresh automatically. Then you can safely set `max-age=31536000`.

</Callout>

## ETag and Conditional Requests

An ETag is a fingerprint of the response body. On subsequent requests, the browser sends it back; the server validates and either returns fresh data or `304 Not Modified` (no body, saves bandwidth).

```typescript
import { createHash } from 'crypto';

function generateETag(content: string): string {
  return `"${createHash('md5').update(content).digest('hex')}"`;
}

app.get('/api/config', async (req, res) => {
  const config = await getConfig();
  const body = JSON.stringify(config);
  const etag = generateETag(body);

  // Client sends If-None-Match: "abc123" on repeat requests
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end(); // Not Modified — no body sent
  }

  res.set('ETag', etag);
  res.set('Cache-Control', 'public, max-age=60, must-revalidate');
  res.json(config);
});
```

**Last-Modified / If-Modified-Since** — older, timestamp-based equivalent:

```typescript
app.get('/api/posts/:id', async (req, res) => {
  const post = await getPost(req.params.id);
  const lastModified = post.updatedAt.toUTCString();

  if (req.headers['if-modified-since'] === lastModified) {
    return res.status(304).end();
  }

  res.set('Last-Modified', lastModified);
  res.set('Cache-Control', 'public, max-age=300');
  res.json(post);
});
```

## CDN Edge Caching

A CDN places servers (PoPs — points of presence) close to users worldwide. Requests hit the nearest PoP. If the PoP has the response cached, it serves it without ever contacting your origin.

```
User (London) → Cloudflare London PoP → cached response (2ms)
                                       ↓ cache miss
                                       → Your origin (Frankfurt) → 20ms
```

```typescript
// Cloudflare Cache API (Workers)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cacheKey = new Request(request.url, request);
    const cache = caches.default;

    // Check edge cache
    let response = await cache.match(cacheKey);
    if (response) return response;

    // Cache miss — fetch from origin
    response = await fetch(request);

    // Cache the response at the edge
    const responseToCache = new Response(response.body, response);
    responseToCache.headers.set('Cache-Control', 'public, max-age=300');
    await cache.put(cacheKey, responseToCache);

    return response;
  },
};
```

**CDN cache purging** — when content changes, purge the CDN cache:

```typescript
// Cloudflare API purge
async function purgeCloudflare(urls: string[]): Promise<void> {
  await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: urls }),
  });
}

// On product update, purge CDN cache
async function updateProduct(id: string, data: Partial<Product>): Promise<void> {
  await db.products.update(id, data);
  await purgeCloudflare([
    `https://yoursite.com/api/products/${id}`,
    `https://yoursite.com/products/${id}`,
  ]);
}
```

## Vary Header

Tells CDNs to cache different versions based on request headers:

```typescript
// Different response for mobile vs desktop
res.set('Vary', 'User-Agent'); // ⚠️ terrible — too many variations

// Better: use a normalized hint
res.set('Vary', 'Accept-Encoding'); // compressed vs uncompressed
res.set('Vary', 'Accept');          // JSON vs HTML
```

<Callout type="warning">

**Avoid `Vary: User-Agent`**. User-Agent strings are nearly infinite. CDNs create a separate cache entry per variation — your cache hit ratio plummets. If you need device-specific content, serve it from different URLs or use Client Hints instead.

</Callout>

## Common Caching Patterns

**Static assets (JS, CSS, images):**
```http
Cache-Control: public, max-age=31536000, immutable
```
Cache forever. When the file changes, the URL changes (content hash).

**API responses (cacheable):**
```http
Cache-Control: public, max-age=60, stale-while-revalidate=30
```
Fresh for 1 minute, serve stale for 30 extra seconds while revalidating.

**User-specific API responses:**
```http
Cache-Control: private, max-age=30
```
Browser can cache, CDN cannot.

**Never cache:**
```http
Cache-Control: no-store
```
Mutations, payments, sensitive user data.

**HTML pages (SPA shell):**
```http
Cache-Control: public, max-age=0, must-revalidate
ETag: "abc123"
```
Always revalidate but serve the cached version if ETag matches (304 response).

## Cache-Control Strategy by Resource Type

```typescript
function getCacheHeaders(resource: 'asset' | 'api' | 'html' | 'user-data'): string {
  switch (resource) {
    case 'asset':
      return 'public, max-age=31536000, immutable';
    case 'api':
      return 'public, max-age=60, stale-while-revalidate=30';
    case 'html':
      return 'public, max-age=0, must-revalidate';
    case 'user-data':
      return 'private, max-age=30';
    default:
      return 'no-store';
  }
}
```

## Debugging HTTP Cache

```bash
# Check response headers
curl -I https://yoursite.com/api/products/1

# Check cache status (Cloudflare adds cf-cache-status)
# HIT = served from CDN edge
# MISS = fetched from origin
# EXPIRED = stale, re-fetched
# BYPASS = cache bypassed

# Chrome DevTools → Network → Response Headers → Cache-Control, Age, cf-cache-status
# Age header tells you how old the cached response is (seconds since origin served it)
```

The `Age` header is your best debugging tool. If `Age: 0`, the CDN just fetched from origin. If `Age: 240`, this response has been cached for 4 minutes.

