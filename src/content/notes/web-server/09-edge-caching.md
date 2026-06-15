---
title: "Edge Caching with nginx"
subtitle: "proxy_cache, microcaching, stale-while-revalidate, and the cache key rules that turn nginx into a CDN you control."
chapter: 9
level: "intermediate"
readingTime: "12 min"
topics: ["nginx", "caching", "proxy_cache", "microcaching", "cdn"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The fundamental insight

Most of your traffic is the same thing being asked for over and over. The home page, the public product page, the API listing of "top items today." If your backend takes 300ms to render the home page and a thousand users request it per minute, you have spent **5 minutes of CPU per minute of wall clock**. nginx can answer 999 of those requests from RAM in under a millisecond and let the backend regenerate the response only when it changes.

This is **edge caching**. Done right, it cuts backend CPU by an order of magnitude and dramatically improves p99 latency.

<Callout type="info">

**Real-World Analogy**

Edge caching is like a convenience store in your neighborhood versus driving to a warehouse — the same products, but much closer, so the trip takes seconds instead of minutes.

</Callout>

## When caching applies

Cache **responses**, not just files. The cache key is whatever you decide it is — typically the URL plus the request method, optionally minus things that do not affect the response (cookies, query params for tracking, etc.).

Good candidates:

- **Public, non-personalized HTML** — marketing pages, blog posts, public profiles, product pages.
- **Public API responses that change slowly** — listings, leaderboards, "latest N items."
- **Large static-ish responses** — generated images, CSV exports, computed reports.

Bad candidates:

- **Per-user content** — dashboards, account pages, anything that varies by `Cookie` or `Authorization`.
- **Responses with frequent low-volume changes** — cache invalidation outweighs the savings.
- **Mutating endpoints** — POST/PUT/PATCH/DELETE. Never cached by default.

## Setting up a cache zone

Define a cache zone in `nginx.conf` (in the `http` context):

```nginx
proxy_cache_path /var/cache/nginx/main
                 levels=1:2
                 keys_zone=main:10m
                 max_size=1g
                 inactive=24h
                 use_temp_path=off;
```

What each parameter means:

- **path** — `/var/cache/nginx/main`. Where cached responses are stored on disk.
- **levels** — directory hierarchy. `1:2` means a two-level directory tree (`a/bc/`) to avoid millions of files in one folder.
- **keys_zone** — name and size of the shared-memory zone holding cache *keys* (and metadata). 1MB ~ 8000 keys; 10m ~ 80000.
- **max_size** — max disk usage for cached content. Old entries are evicted to make room.
- **inactive** — entries not accessed for this long are deleted regardless of `max_size`.
- **use_temp_path=off** — write directly into the cache directory instead of using a temp dir. Faster on the same filesystem.

Now use it in a location:

```nginx
server {
    location / {
        proxy_cache main;
        proxy_cache_valid 200 302 10m;
        proxy_cache_valid 404 1m;

        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_lock on;
        proxy_cache_revalidate on;

        add_header X-Cache-Status $upstream_cache_status;

        proxy_pass http://app_backend;
    }
}
```

That is the entire cache configuration. nginx now caches successful and 302 responses for 10 minutes, 404s for 1 minute. Below we unpack every line.

## proxy_cache_valid — how long to cache by status

```nginx
proxy_cache_valid 200 302 10m;
proxy_cache_valid 404 1m;
proxy_cache_valid any 30s;
```

The first matching rule wins. You can specify per-status or `any`. Short caches for `404` (in case the resource is created) and `5xx` (do not cache failures for long, but a few seconds prevents a thundering herd) are common patterns.

## Cache-Control headers from the backend

If the backend response carries `Cache-Control: max-age=N`, nginx honors it and overrides `proxy_cache_valid`:

```text
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: public, max-age=300
```

This is usually how you should drive caching: the application decides which responses are safe to cache and for how long, and sets `Cache-Control`. nginx and downstream caches all behave correctly without per-route nginx config.

To **ignore** backend headers and force nginx's own rules:

```nginx
proxy_ignore_headers Cache-Control Expires Set-Cookie;
```

## Cache keys — the most important config

By default, the key is `$scheme$proxy_host$request_uri`. That is fine until it isn't.

Customize it:

```nginx
proxy_cache_key "$scheme$host$request_uri$is_args$args";
```

Now keys include the query string. Without `$args`, `?page=1` and `?page=2` would both hit the same cache entry — disaster.

For per-language sites:

```nginx
proxy_cache_key "$scheme$host$request_uri:$http_accept_language";
```

For a logged-in vs anonymous distinction, where logged-in responses should not be cached at all:

```nginx
proxy_no_cache $http_authorization $cookie_session;
proxy_cache_bypass $http_authorization $cookie_session;
```

`proxy_no_cache` — do not store the response.
`proxy_cache_bypass` — fetch fresh, ignoring any cached entry.

If either variable is non-empty, the request bypasses the cache. So any request with `Authorization:` or a `session=` cookie goes straight to the backend.

## proxy_cache_use_stale — the killer feature

```nginx
proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
```

If the backend fails (timeout, 5xx, refused), serve a **stale** cached entry instead of an error. This single directive is the difference between "the site is up" and "the site has a 502 page" during a backend incident.

`updating` is special: while one request is regenerating the cache entry, *other* concurrent requests are served the stale entry. Without it, every concurrent request would queue waiting for the same regeneration — the *thundering herd*.

## proxy_cache_lock — the single regeneration

```nginx
proxy_cache_lock on;
proxy_cache_lock_timeout 5s;
```

When a cache miss occurs, only one request gets to talk to the backend. Concurrent requests for the same key wait. After the first response arrives and is cached, the waiting requests are served from cache.

Without lock, a thousand concurrent misses for the home page would all hit the backend simultaneously. With lock, one does, and 999 wait briefly.

Combined with `use_stale ... updating`, the lock applies only when there is no stale entry to serve. The pattern is:

- Stale entry exists → serve it, regenerate in the background.
- No stale entry → first request fetches; others wait via lock.

## proxy_cache_revalidate — using ETag and Last-Modified

```nginx
proxy_cache_revalidate on;
```

When a cached entry expires, instead of fetching the full response, nginx sends a conditional `If-Modified-Since` / `If-None-Match` to the backend. If the backend returns `304 Not Modified`, nginx refreshes the cache entry's freshness and serves it. Saves bandwidth and backend CPU on entries that have not actually changed.

For this to help, your backend must respect `If-Modified-Since` / `If-None-Match` and return `304` when applicable. Most frameworks do this automatically for static content; for dynamic content, you have to opt in.

## X-Cache-Status — debugging visibility

```nginx
add_header X-Cache-Status $upstream_cache_status;
```

Now responses include:

```text
X-Cache-Status: HIT
```

Possible values:

- **MISS** — not in cache; fetched from backend.
- **HIT** — served from cache.
- **EXPIRED** — was in cache but expired; fetched fresh.
- **UPDATING** — cache being regenerated; served stale.
- **STALE** — backend failed; served stale.
- **REVALIDATED** — backend returned 304; served from cache.
- **BYPASS** — `proxy_cache_bypass` matched.

Add this header during tuning. Watch the ratio of `HIT` to `MISS` to see whether caching is working. Remove it (or move to a debug-only condition) before exposing to the public — it leaks implementation detail.

## Microcaching — the secret weapon

For dynamic content where even 1-2 seconds of staleness is acceptable:

```nginx
proxy_cache main;
proxy_cache_valid 200 1s;
proxy_cache_lock on;
```

A one-second cache turns a thousand requests-per-second into one request-per-second hitting the backend. The user-visible staleness is at most 1s, which is invisible in practice. For most "dynamic but not personalized" content (news homepages, listing pages, public APIs), this single trick reduces backend load by 99%.

This is what the term *edge caching* really means in production.

## Vary — caching different responses for different clients

Some backends return different bodies based on `Accept-Encoding` (gzip vs identity), `Accept-Language`, or other request headers. The response includes:

```text
Vary: Accept-Encoding, Accept-Language
```

nginx honors `Vary` and stores separate cache entries for each combination. Without `Vary`, nginx might serve a gzipped response to a client that did not send `Accept-Encoding: gzip`, breaking the response.

Be aware: `Vary: User-Agent` is a footgun — every browser version becomes its own cache entry, and the cache is effectively useless. Vary on a few well-defined headers only.

## Purging the cache

Free nginx (open-source) does not include built-in purge. Three workarounds:

**1. Cache-busting URLs.** Easiest, used by every CDN. Append a content hash to URLs (`/assets/app.7f3a2b9.js`); changing the content changes the URL; the old URL stays cached forever but is never requested.

**2. Manual file deletion.** The cache is a directory tree; files are named by hash of the cache key. Use the `nginx-cache-purge` script or compute the key hash manually:

```bash
# Compute the cache file path for a key
KEY="httpsexample.com/api/users"
HASH=$(echo -n "$KEY" | md5sum | awk '{print $1}')
# levels=1:2 → /<last>/<2 before>/<full hash>
echo "/var/cache/nginx/main/${HASH: -1}/${HASH: -3:2}/$HASH"
```

Delete that file, and nginx misses on the next request and refetches.

**3. ngx_cache_purge module** (third-party):

```nginx
location ~ /purge(/.*) {
    allow 127.0.0.1;
    deny all;
    proxy_cache_purge main "$scheme$host$1";
}
```

Then `curl http://localhost/purge/api/users` removes that entry.

For a small site, cache-busting URLs cover 90% of the need. For larger systems, prefer short TTLs over manual purges.

## Inspecting the cache

```bash
# How big is the cache?
sudo du -sh /var/cache/nginx/main

# How many entries?
sudo find /var/cache/nginx/main -type f | wc -l

# Recent cache writes
sudo find /var/cache/nginx/main -type f -mmin -10 -ls
```

Each cached file is the response, prefixed with metadata (status, headers, original key). You can `head -50` one to see what nginx stored.

## When *not* to use proxy_cache

- **Cookies vary the response.** Cache will serve user A's response to user B. Either bypass on `Cookie:`, or strip cookies before caching, or do not cache.
- **CSRF tokens or per-request unique fields** in the response body. Same problem.
- **Backend is fast and CPU-cheap.** The cache adds a layer; if there is nothing to gain, do not add complexity.
- **You need cache invalidation that is harder than TTL.** Build it explicitly with a queue and your backend, not with workarounds in nginx.

## Recap

- `proxy_cache_path` defines a cache zone. `proxy_cache` activates it in a location.
- Cache keys default to the full URL. Customize with `proxy_cache_key` to include or exclude query strings, headers, cookies.
- `proxy_cache_valid` sets per-status TTLs. Backend `Cache-Control` headers override.
- `proxy_cache_use_stale` keeps the site up when the backend fails. `proxy_cache_lock` prevents thundering-herd regeneration.
- `proxy_cache_revalidate` upgrades 304 responses to cache refreshes — saves bandwidth.
- Microcaching (TTL of 1s) cuts dynamic-page load by orders of magnitude.
- Add `X-Cache-Status` header during tuning. Remove it for production.
- For invalidation, prefer cache-busting URLs and short TTLs over manual purge.

Next and final chapter: workers, sendfile, gzip/brotli, security headers, rate limiting — turning a working nginx into a tuned and hardened one.

