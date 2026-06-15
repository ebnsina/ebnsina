---
title: "Performance & Hardening"
subtitle: "Workers, sendfile, gzip and brotli, security headers, rate limiting, connection limits, body size caps. The dials that turn a working nginx into a fast, defensible one."
chapter: 10
level: "advanced"
readingTime: "14 min"
topics: ["nginx", "performance", "hardening", "rate limiting", "security headers", "tls"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The four levers

A tuned nginx adjusts four things from the defaults:

1. **Workers and connection limits** — match the box's cores and FD budget.
2. **I/O efficiency** — sendfile, tcp_nopush, tcp_nodelay, keepalive.
3. **Compression** — gzip and brotli, ideally precompressed at build time.
4. **Defensive limits** — request size, rate limits, slow-client timeouts, security headers.

Each one is a few lines. Together they turn a default install (which already handles thousands of req/s) into one that handles tens of thousands and refuses obvious abuse.

<Callout type="info">

**Real-World Analogy**

Performance hardening is like tuning a race car — the engine already works, but every deliberate adjustment extracts more speed and reliability from what's already there.

</Callout>

## Workers — one per CPU core

```nginx
worker_processes auto;
worker_rlimit_nofile 65536;
```

`auto` sets `worker_processes` equal to the number of CPU cores. On a 4-core VPS, you get 4 workers, each running its own event loop, each pinned to a different core (effectively).

`worker_rlimit_nofile` raises the per-worker file descriptor limit above the system default of 1024. This must accommodate every active connection plus open backend connections plus open file handles. 65536 is a safe upper bound for most setups.

```nginx
events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}
```

- **`worker_connections`** — max simultaneous connections per worker. Multiplied by `worker_processes`, that is your total cap. 4096 × 4 = 16384 simultaneous connections per box.
- **`multi_accept on`** — accept all available connections on a wakeup, not just one. Marginal but free.
- **`use epoll`** — explicit on Linux. nginx auto-detects, but stating it documents intent.

## sendfile, tcp_nopush, tcp_nodelay

```nginx
http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    server_tokens off;
}
```

- **`sendfile on`** — use the `sendfile()` syscall to ship file bytes directly from the page cache to the socket, skipping userspace. Crucial for static content; saves CPU.
- **`tcp_nopush on`** — combined with sendfile, packs response data into full packets before sending. Reduces packet count.
- **`tcp_nodelay on`** — disables Nagle's algorithm on keepalive connections so small responses are not delayed. Sounds contradictory with `tcp_nopush`, but nginx handles the interaction correctly: `tcp_nopush` for the bulk send, `tcp_nodelay` for the final flush.
- **`keepalive_timeout 65`** — keep idle connections open for 65 seconds. Long enough that the next page navigation reuses the connection; short enough that idle scanners do not tie up FDs.
- **`keepalive_requests 1000`** — close a connection after 1000 requests. Prevents per-connection memory bloat over the very long term.
- **`server_tokens off`** — drop nginx's version from `Server:` headers and error pages. Marginal security but free.

## gzip and brotli

```nginx
http {
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        application/json
        application/javascript
        text/xml
        application/xml
        application/xml+rss
        text/javascript
        image/svg+xml;
}
```

- **`gzip_comp_level 5`** — sweet spot. Level 9 saves a few extra percent but costs significantly more CPU per request.
- **`gzip_min_length 1024`** — do not compress tiny responses; the overhead is not worth it.
- **`gzip_types`** — what to compress. **Do not** compress already-compressed formats: jpg, png, mp4, woff2 — they get larger.
- **`gzip_vary on`** — adds `Vary: Accept-Encoding` so caches handle compressed and uncompressed clients separately.

For brotli (better compression than gzip, slightly more CPU), nginx needs the `ngx_brotli` module, which Debian and Ubuntu now ship as `libnginx-mod-http-brotli-filter`:

```bash
sudo apt install -y libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static
```

Then:

```nginx
brotli on;
brotli_comp_level 5;
brotli_static on;
brotli_types text/plain text/css application/json application/javascript application/xml image/svg+xml;
```

`brotli_static on` and `gzip_static on` look for pre-compressed `.br` and `.gz` files alongside the original (e.g., `app.js.br` next to `app.js`) and serve them when the client supports the encoding. If your build step produces these, nginx never spends CPU compressing — pure savings.

## TLS — modern, fast, safe

Assuming Let's Encrypt certs at `/etc/letsencrypt/live/example.com/`:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;

    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';

    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout 5s;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
}
```

Key points:

- **`http2 on;`** — modern syntax. Old configs say `listen 443 ssl http2;` — same idea.
- **TLS 1.2 + 1.3 only.** TLS 1.0 and 1.1 are deprecated by every browser.
- **Modern cipher list.** This list is the Mozilla "intermediate" recommendation as of writing — covers all current browsers, no weak ciphers.
- **OCSP stapling.** Serves the certificate's revocation status alongside the cert, saving the client a round-trip.
- **HSTS.** Tells browsers "always use HTTPS for this domain for the next 2 years." Be careful — once browsers see HSTS, they remember; if you want to revert to HTTP later, you cannot.

Always have an HTTP→HTTPS redirect:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

## Body size limits

```nginx
http {
    client_max_body_size 10m;
    client_body_buffer_size 128k;
    client_body_timeout 60s;
    client_header_timeout 10s;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;
}
```

- **`client_max_body_size 10m`** — request body capped at 10MB. Increase per location for upload endpoints; decrease everywhere else. Default of 1MB fails for many APIs without warning.
- **`client_body_timeout 60s`** — max time between body bytes from the client. Slow uploads beyond this drop. Tune for your workload.
- **`client_header_timeout 10s`** — max time to read the request headers. Defends against Slowloris.

## Rate limiting

Two layers: per-second rate (smooth flow) and per-burst (allow short spikes).

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api_rl:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login_rl:10m rate=5r/m;

    limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
}
```

- **`limit_req_zone`** — defines a memory zone for tracking request rates per key. `$binary_remote_addr` keys on the client IP (4 bytes for IPv4, 16 for IPv6 — fits more entries than `$remote_addr`).
- **`zone=api_rl:10m rate=10r/s`** — name `api_rl`, 10MB shared zone, target rate 10 requests per second.
- **`limit_conn_zone`** — same idea for concurrent connections per key.

Apply in a location:

```nginx
server {
    location /api/ {
        limit_req zone=api_rl burst=20 nodelay;
        limit_conn conn_per_ip 10;

        proxy_pass http://app_backend;
    }

    location /login {
        limit_req zone=login_rl burst=3 nodelay;
        proxy_pass http://app_backend;
    }
}
```

- **`burst=20`** — allow a burst of up to 20 requests. After that, requests are queued or rejected.
- **`nodelay`** — when the burst is allowed, do not delay them; reject only after the burst is full.
- **`limit_conn conn_per_ip 10`** — at most 10 concurrent connections from a single client.

A request that exceeds the rate gets `503 Service Unavailable` (configurable to 429):

```nginx
limit_req_status 429;
limit_conn_status 429;
```

`429 Too Many Requests` is the spec-correct status for rate-limited responses.

<Callout type="info">

**Rate limiting on the proxy is the cheapest defense.**

Each rejected request costs nginx a memory-zone lookup (microseconds). The same request hitting your backend would cost a database query, an auth check, and a render — milliseconds. A box being abused becomes orders of magnitude cheaper to protect when nginx absorbs the rejections.

</Callout>

## Security headers

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'" always;
```

What each prevents:

- **HSTS** — downgrade-to-HTTP attacks.
- **X-Frame-Options: DENY** — clickjacking via framing.
- **X-Content-Type-Options: nosniff** — browser MIME-sniffing turning text into HTML.
- **Referrer-Policy** — leaking the full referer URL to third parties.
- **Permissions-Policy** — blocks geolocation, mic, camera, etc., unless explicitly enabled.
- **Content-Security-Policy** — most powerful and most painful to set up. Restricts where scripts/styles/images can come from. The line above is a starting point; tighten for your app.

The `always` parameter is essential — without it, headers are dropped on error responses.

## ngx_http_realip_module — restoring the client IP

When nginx is behind a CDN or another load balancer, `$remote_addr` is the *upstream proxy*, not the client. Configure nginx to trust `X-Forwarded-For`:

```nginx
set_real_ip_from 10.0.0.0/8;
set_real_ip_from 172.16.0.0/12;
set_real_ip_from 192.168.0.0/16;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
```

`set_real_ip_from` lists trusted proxy networks. Only when a request comes from one of these is the `X-Forwarded-For` chain trusted. `real_ip_recursive on` walks the chain backward until a non-trusted IP is found — that is the actual client.

Now `$remote_addr` shows the real client; rate limiting works correctly on the right key; logs are accurate.

## Connection tuning for high traffic

```nginx
http {
    open_file_cache max=10000 inactive=60s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;
}
```

Caches the result of `stat()` and `open()` for static files in memory, so frequent requests do not pay the syscall cost twice. For a static-heavy server, this alone is a few percent win.

## Putting it all together — production base config

A minimal production-grade `nginx.conf` outline:

```nginx
worker_processes auto;
worker_rlimit_nofile 65536;
pid /run/nginx.pid;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server_tokens off;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;

    client_max_body_size 10m;
    client_body_timeout 60s;
    client_header_timeout 10s;

    open_file_cache max=10000 inactive=60s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss image/svg+xml;

    log_format main_ext escape=json
        '{"time":"$time_iso8601","remote_addr":"$remote_addr",'
        '"request":"$request","status":$status,'
        '"body_bytes_sent":$body_bytes_sent,'
        '"request_time":$request_time,'
        '"upstream_response_time":"$upstream_response_time",'
        '"request_id":"$request_id"}';
    access_log /var/log/nginx/access.log main_ext;
    error_log  /var/log/nginx/error.log warn;

    limit_req_zone $binary_remote_addr zone=api_rl:10m rate=20r/s;
    limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
    limit_req_status  429;
    limit_conn_status 429;

    set_real_ip_from 10.0.0.0/8;
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;

    proxy_cache_path /var/cache/nginx/main
        levels=1:2 keys_zone=main:100m max_size=2g
        inactive=24h use_temp_path=off;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

This is the base. Add per-site `server { ... }` blocks under `sites-available` and symlink to `sites-enabled`.

## Testing performance

```bash
# Simple synthetic load
sudo apt install -y wrk
wrk -t4 -c200 -d30s https://example.com/

# Specific endpoint with custom headers
wrk -t8 -c1000 -d60s -H 'Host: example.com' https://192.0.2.5/api/items

# Loadtest with k6 (chapter 24 of testing track)
k6 run --vus 100 --duration 30s loadtest.js
```

Watch nginx during the test:

```bash
sudo tail -f /var/log/nginx/access.log | jq 'select(.request_time > 0.5)'
sudo tail -f /var/log/nginx/error.log
htop                # check CPU per worker
ss -s              # connection counts
```

Bottlenecks usually appear at predictable points: backend exhaustion (5xx in upstream_status), worker_connections limit (errors in nginx error log), or `worker_rlimit_nofile` (`accept() failed (24: Too many open files)`).

## Recap

- One worker per core. Raise `worker_rlimit_nofile` and `worker_connections`.
- Enable `sendfile`, `tcp_nopush`, `tcp_nodelay`, sane keepalive.
- gzip + brotli, with precompressed assets via `gzip_static` / `brotli_static`.
- TLS 1.2/1.3, modern ciphers, OCSP stapling, HSTS, force-redirect HTTP→HTTPS.
- Cap request body size and slow-client timeouts. `limit_req` and `limit_conn` per IP.
- Set `X-Frame-Options`, `X-Content-Type-Options`, CSP, Permissions-Policy. Always with `always`.
- `set_real_ip_from` so logs and rate-limiting see the real client behind a CDN.
- `wrk` to load-test, `htop` and access logs to find bottlenecks.

This is the end of the Web Server Fundamentals track. You now have a working mental model of HTTP from raw sockets all the way to a hardened production nginx — and can read, modify, and trust your own config.

