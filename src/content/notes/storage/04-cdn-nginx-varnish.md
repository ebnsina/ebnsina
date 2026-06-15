---
title: "CDN with nginx and Varnish"
subtitle: "Cache static assets close to users — self-hosted edge caching with nginx proxy_cache and Varnish as a reverse proxy."
chapter: 4
level: "intermediate"
readingTime: "10 min"
topics: ["CDN", "nginx", "Varnish", "caching", "edge caching", "cache invalidation", "HTTP headers"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A chain of convenience stores stocking the most popular products locally: customers don't drive to the central warehouse for a bottle of water. A CDN does the same for files — copies are cached at servers close to users, so a request for an image in Frankfurt doesn't cross the Atlantic to retrieve it from a US origin server.

</Callout>

## How HTTP Caching Works

Before building infrastructure, understand the headers that drive caching:

```
Cache-Control: public, max-age=31536000, immutable
  public       — CDN/proxies may cache (not just browser)
  max-age      — seconds until stale (31536000 = 1 year)
  immutable    — browser: don't revalidate even on reload

Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  stale-while-revalidate — serve stale while fetching fresh in background

ETag: "abc123"
  On re-request: If-None-Match: "abc123"
  Origin sends 304 Not Modified if unchanged (saves bandwidth, not latency)

Vary: Accept-Encoding
  Cache separately per encoding variant (gzip, br, identity)
```

**Content-addressed URLs** eliminate invalidation complexity: `/images/avatar-a3f7b2.webp` — the hash changes when content changes, so files are cached forever.

## nginx as Caching Reverse Proxy

nginx `proxy_cache` turns any nginx instance into a caching layer in front of your origin (MinIO or app server):

```nginx
# /etc/nginx/nginx.conf

# Define cache zone: 1GB RAM index, 10GB disk
proxy_cache_path /var/cache/nginx
  levels=1:2
  keys_zone=assets_cache:100m
  max_size=10g
  inactive=7d
  use_temp_path=off;

proxy_cache_key "$scheme$request_method$host$request_uri";

server {
  listen 80;
  server_name cdn.example.com;

  # Static assets — cache aggressively
  location ~* \.(jpg|jpeg|png|webp|gif|svg|ico|woff2|css|js)$ {
    proxy_pass http://minio:9000;
    proxy_cache assets_cache;
    proxy_cache_valid 200 1y;
    proxy_cache_valid 404 1m;

    proxy_cache_use_stale error timeout updating
      http_500 http_502 http_503 http_504;
    proxy_cache_background_update on;
    proxy_cache_lock on;              # collapse simultaneous requests for same key

    add_header X-Cache-Status $upstream_cache_status;  # HIT / MISS / BYPASS
    add_header Cache-Control "public, max-age=31536000, immutable";

    expires 1y;
  }

  # Dynamic content — short cache or no cache
  location / {
    proxy_pass http://app:3000;
    proxy_cache assets_cache;
    proxy_cache_valid 200 5m;
    proxy_no_cache $http_authorization;   # never cache authenticated requests
    proxy_cache_bypass $http_pragma;
  }
}
```

```bash
# Purge a cached URL
nginx -s reload   # no purge without the commercial module

# With ngx_cache_purge (open source):
location /purge {
  allow 10.0.0.0/8;  # only internal
  deny all;
  proxy_cache_purge assets_cache $scheme$request_method$host$request_uri;
}
```

## Varnish Cache

Varnish is purpose-built for HTTP caching — more powerful than nginx proxy_cache, uses VCL (Varnish Configuration Language):

```bash
# Install
apt install varnish

# /etc/varnish/default.vcl
```

```vcl
vcl 4.1;

backend origin {
  .host = "minio";
  .port = "9000";
  .connect_timeout = 5s;
  .first_byte_timeout = 30s;
  .between_bytes_timeout = 10s;
}

sub vcl_recv {
  # Strip cookies from static assets — cookies prevent caching
  if (req.url ~ "\.(jpg|jpeg|png|webp|gif|svg|ico|woff2|css|js)(\?.*)?$") {
    unset req.http.Cookie;
  }

  # Bypass cache for authenticated requests
  if (req.http.Authorization) {
    return(pass);
  }

  # Normalize Accept-Encoding to reduce cache fragmentation
  if (req.http.Accept-Encoding) {
    if (req.http.Accept-Encoding ~ "br") {
      set req.http.Accept-Encoding = "br";
    } elsif (req.http.Accept-Encoding ~ "gzip") {
      set req.http.Accept-Encoding = "gzip";
    } else {
      unset req.http.Accept-Encoding;
    }
  }
}

sub vcl_backend_response {
  # Cache 200s and 301s for static assets
  if (bereq.url ~ "\.(jpg|jpeg|png|webp|gif|svg|ico|woff2|css|js)(\?.*)?$") {
    set beresp.ttl = 365d;
    set beresp.grace = 1d;
    unset beresp.http.Set-Cookie;
  }

  # Short TTL for HTML
  if (beresp.http.Content-Type ~ "text/html") {
    set beresp.ttl = 5m;
    set beresp.grace = 1h;
  }
}

sub vcl_deliver {
  # Add cache status header for debugging
  if (obj.hits > 0) {
    set resp.http.X-Cache = "HIT";
    set resp.http.X-Cache-Hits = obj.hits;
  } else {
    set resp.http.X-Cache = "MISS";
  }
}
```

```bash
# /etc/varnish/varnish.params
VARNISH_STORAGE=malloc,2g       # 2GB in-memory cache
VARNISH_LISTEN_PORT=6081
```

## Cache Invalidation

**By URL (Varnish PURGE):**

```vcl
# In vcl_recv, allow PURGE method from trusted IPs
sub vcl_recv {
  if (req.method == "PURGE") {
    if (!client.ip ~ purge_acl) {
      return(synth(405, "Not allowed"));
    }
    return(purge);
  }
}

acl purge_acl {
  "localhost";
  "10.0.0.0"/8;
}
```

```typescript
// Purge from application code after updating a file
async function purgeFromCDN(keys: string[]) {
  await Promise.all(keys.map(key =>
    fetch(`http://varnish:6081/${key}`, { method: 'PURGE' })
  ));
}
```

**By tag (Varnish xkey module — more powerful):**

```vcl
# Tag objects with logical group IDs
sub vcl_backend_response {
  # Origin sets: Surrogate-Key: product-123 category-laptops
  if (beresp.http.Surrogate-Key) {
    set beresp.http.xkey = beresp.http.Surrogate-Key;
  }
}
```

```typescript
// Purge all objects tagged with a product ID
async function purgeByTag(tag: string) {
  await fetch(`http://varnish:6081/`, {
    method: 'PURGE',
    headers: { 'xkey-purge': tag },
  });
}

// When product-123 image changes, purge all its cached representations
await purgeByTag('product-123');
```

## Docker Compose: nginx + Varnish + MinIO

```yaml
services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: supersecretpassword
    volumes:
      - minio_data:/data

  varnish:
    image: varnish:7.4
    ports:
      - "6081:6081"
    volumes:
      - ./varnish/default.vcl:/etc/varnish/default.vcl
    command: varnishd -F -f /etc/varnish/default.vcl -s malloc,2g
    depends_on:
      - minio

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - varnish

volumes:
  minio_data:
```

nginx handles TLS termination, Varnish handles caching, MinIO is origin.

```
Browser → nginx (TLS) → Varnish (cache) → MinIO (origin)
```

## Serving from MinIO Directly with nginx Proxy

Simpler than Varnish for smaller scale:

```nginx
server {
  listen 443 ssl http2;
  server_name cdn.example.com;

  ssl_certificate /etc/letsencrypt/live/cdn.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/cdn.example.com/privkey.pem;

  # Gzip compression
  gzip on;
  gzip_types text/css application/javascript image/svg+xml;
  gzip_min_length 256;

  # Brotli (if module installed)
  brotli on;
  brotli_types text/css application/javascript image/svg+xml;

  proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=minio_cache:50m max_size=5g inactive=30d;

  location / {
    proxy_pass http://minio:9000;
    proxy_cache minio_cache;
    proxy_cache_valid 200 365d;
    proxy_cache_use_stale error timeout updating;
    proxy_cache_background_update on;
    proxy_cache_lock on;

    # Don't forward bucket policy — serve only public bucket
    proxy_set_header Host minio:9000;

    # CORS for browser-direct access
    add_header Access-Control-Allow-Origin "*";
    add_header Access-Control-Allow-Methods "GET, HEAD";

    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Cache-Status $upstream_cache_status;
  }
}
```

## Cache Warming

Pre-populate cache after deploy or cache flush:

```typescript
async function warmCache(keys: string[]) {
  const CDN_BASE = process.env.CDN_URL;
  const CONCURRENCY = 10;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const batch = keys.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(key =>
        fetch(`${CDN_BASE}/${key}`, { method: 'HEAD' })
          .catch(err => console.warn(`Warm failed for ${key}:`, err.message))
      )
    );
  }
}

// After a deploy, warm the most popular assets
const popularKeys = await db.query(
  'SELECT storage_key FROM files ORDER BY access_count DESC LIMIT 500'
);
await warmCache(popularKeys.rows.map(r => r.storage_key));
```

## Monitoring Cache Performance

```bash
# nginx cache stats (requires stub_status module)
curl http://localhost/nginx_status

# Varnish stats
varnishstat -1 -f MAIN.cache_hit,MAIN.cache_miss,MAIN.cache_hitpass

# Hit rate
varnishstat -1 | grep -E "cache_hit|cache_miss"
# MAIN.cache_hit   → total hits since start
# MAIN.cache_miss  → total misses

# Real-time request log
varnishlog -g request -q 'ReqURL ~ "\.jpg$"'
```

```typescript
// Monitor X-Cache-Status header in your app
app.use((req, res, next) => {
  res.on('finish', () => {
    const cacheStatus = res.getHeader('X-Cache-Status');
    if (cacheStatus) {
      metrics.increment(`cdn.${String(cacheStatus).toLowerCase()}`);
    }
  });
  next();
});
```

**Target:** >90% cache hit rate for static assets. If below, check:
- `Vary` header fragmenting the cache by user-agent/cookie
- Short TTLs preventing effective caching
- Cache too small for working set (`max_size`)
- Cookies on asset requests bypassing cache

