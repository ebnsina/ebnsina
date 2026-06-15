---
title: "Reverse Proxy"
subtitle: "nginx in front of your application server. The headers that matter, the timeouts that save you, and the upstream pool that handles failure."
chapter: 7
level: "intermediate"
readingTime: "13 min"
topics: ["reverse proxy", "nginx", "proxy_pass", "upstream", "headers"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What a reverse proxy is

A reverse proxy is a server that accepts a client's request, forwards it to one of several backend servers, and returns the backend's response to the client. The client never knows the backend exists — from its point of view, nginx *is* the server.

```text
   client  ──► nginx (:443) ──► your-app (:8080)
                  ▲
                  │
              TLS, caching, compression,
              rate limiting, routing, logging
```

<Callout type="info">

**Real-World Analogy**

A reverse proxy is like a receptionist who takes all incoming calls and routes them to the right department — callers never dial the engineers directly.

</Callout>

You almost always want one. Reasons:

- **TLS termination** — nginx handles HTTPS; your app speaks plain HTTP. Your app does not need to know about certificates.
- **HTTP/2 and HTTP/3** — nginx exposes modern protocols to the client and translates down to HTTP/1.1 for the backend.
- **Static asset offload** — nginx serves images, JS, CSS directly without bothering the backend.
- **Caching** — nginx can cache backend responses (chapter 9) and serve them from RAM.
- **Rate limiting and connection limits** — protect the backend from abuse.
- **Multiple backends** — load-balance across multiple app servers, take one out of rotation when it fails.
- **Single hostname for many services** — `/api/*` to one backend, `/admin/*` to another, static files served by nginx itself.

This chapter covers the simplest case: one nginx in front of one Go (or Node, or whatever) backend on the same machine.

## The simplest reverse proxy

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
    }
}
```

That is the entire proxy. Every request to nginx is forwarded to `http://127.0.0.1:8080`. The backend's response goes back to the client.

Test:

```bash
# Start your app on :8080
go run main.go &

# Hit nginx
curl -i http://example.com/
# Should see your app's response
```

This works, but it is missing the four important headers and the timeouts. Real configs add about ten more lines.

## The headers your backend actually needs

When nginx forwards a request, the backend sees nginx as the client — `127.0.0.1` as the source address, no idea what hostname the user typed, no idea whether the original was HTTP or HTTPS. To preserve that information, set headers explicitly:

```nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
proxy_set_header X-Forwarded-Port  $server_port;
```

What each does:

- **Host** — the original `Host` header, so the backend knows which domain the user requested. Critical for multi-tenant apps.
- **X-Real-IP** — the client's actual IP, so the backend can log it, rate-limit on it, geolocate it.
- **X-Forwarded-For** — a chain of all proxies the request has traversed. nginx appends to whatever was already there.
- **X-Forwarded-Proto** — `http` or `https`. Lets the backend know the original scheme even though the connection from nginx is HTTP.
- **X-Forwarded-Host / Port** — original hostname and port if differing from `Host` (rare).

Most app frameworks have a "trust the proxy" mode that reads these headers — `app.set('trust proxy', 1)` in Express, `ProxyFix` in Flask, the `httputil.ReverseProxy` in Go.

<Callout type="warn">

**Only trust these headers from your own proxy.**

A request arriving directly from the internet with a forged `X-Real-IP: 1.2.3.4` would let the attacker pretend to be that address. Either make sure the backend is not directly reachable (firewall it; bind to localhost) or configure the backend to only trust forwarded headers from known proxy IPs.

</Callout>

## A complete proxy server block

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 64;
}

server {
    listen 80;
    server_name example.com;

    # Static assets — serve directly, do not bother the backend
    location /assets/ {
        root /var/www/example.com;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://app_backend;

        # Preserve client info
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Use HTTP/1.1 to enable keepalive to the backend
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;

        # Buffering
        proxy_buffering on;
        proxy_buffer_size 16k;
        proxy_buffers 8 16k;
        proxy_busy_buffers_size 32k;
    }
}
```

That is everything you need for a production-ready single-backend proxy.

## upstream — pool of backends

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;
    server 127.0.0.1:8082;

    keepalive 64;
}
```

Three workers on the same box, all running your app. nginx round-robins between them. `keepalive 64` keeps up to 64 idle connections to backends ready for reuse, avoiding the cost of new TCP connections per request.

Other distribution methods:

```nginx
upstream app_backend {
    least_conn;        # send to the worker with fewest active connections
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;
}

upstream app_backend {
    ip_hash;           # hash client IP — same client → same worker
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;
}
```

`least_conn` is usually right for variable-duration requests. `ip_hash` is for sticky sessions (rare and usually a smell — make your app stateless instead).

## Health checks and failover

```nginx
upstream app_backend {
    server 127.0.0.1:8080 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8081 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8082 backup;
}
```

- **`max_fails=3`** — if 3 requests in a row fail to a backend, mark it down.
- **`fail_timeout=30s`** — keep it down for 30 seconds, then try again.
- **`backup`** — only used if all primaries are down.

Note: open-source nginx uses *passive* health checks — it learns a backend is down only by trying to use it and failing. Active health checks (probing `/health` periodically) are an nginx Plus feature, or you bolt it on with a separate process. Most teams accept passive checks.

## Timeouts — the difference between slow and dead

Timeouts are the most underused tool in a proxy config. Default values are too generous. Set them to match your application's actual SLOs.

```nginx
proxy_connect_timeout 5s;    # max time to establish TCP connection to backend
proxy_send_timeout    60s;   # max time between bytes sent to backend
proxy_read_timeout    60s;   # max time between bytes received from backend
```

For typical APIs:

- `proxy_connect_timeout` — 1–5 seconds. If you cannot reach the backend in 5s, it is down.
- `proxy_read_timeout` — match your slowest expected response. APIs: 30–60s. Long-running uploads: more.

When a timeout expires, nginx returns `504 Gateway Timeout` to the client. The backend's request, if still in flight, continues — the backend has no idea nginx gave up. Long-running backend work that needs to outlive the client should be triggered as a job, not handled in-band.

Send-timeout matters for large uploads. If a client uploads slowly, `proxy_send_timeout` controls how long nginx waits for the next byte from the *client*. Too short and slow uploads fail; too long and Slowloris attacks tie up workers.

## Buffering — what nginx does with the response

```nginx
proxy_buffering on;
proxy_buffer_size 16k;
proxy_buffers 8 16k;
```

By default, nginx buffers the backend's entire response in memory (or to disk if it is large), then sends it to the client at the client's pace. This protects the backend from slow clients — your Go server does not have a goroutine waiting on a 3G mobile reader.

Disable buffering for streaming endpoints:

```nginx
location /events {
    proxy_pass http://app_backend;
    proxy_buffering off;            # forward bytes immediately
    proxy_cache off;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_read_timeout 24h;         # SSE may stay open for a long time
}
```

For Server-Sent Events, WebSockets, or gRPC streaming, buffering ruins the streaming behavior — turn it off.

## WebSocket proxying

```nginx
location /ws {
    proxy_pass http://app_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;          # long-lived connection
    proxy_buffering off;
}
```

The `Upgrade: websocket` and `Connection: upgrade` headers are essential — without them, nginx tries to handle the response as plain HTTP. The 24-hour read timeout handles idle WebSocket connections without dropping them.

## Path rewriting

Two common patterns:

**Strip a prefix before forwarding:**

```nginx
location /api/ {
    proxy_pass http://app_backend/;   # note the trailing slash
}
```

A request to `/api/users` is forwarded to `/users`. The trailing slash on `proxy_pass` says "rewrite the matched location prefix to this." Without the trailing slash, the full original path is kept.

**Keep the path, but proxy to a sub-path:**

```nginx
location /api/ {
    proxy_pass http://app_backend;    # no trailing slash
}
```

Request `/api/users` becomes `http://notes/api/users`. The backend sees the full path.

This is the single most common nginx footgun. Trailing-slash rules in `proxy_pass` change behavior. When in doubt, write a small test.

## Setting upstream-related variables

A frequently useful pattern: tell the backend what request ID it is handling, so logs across nginx and the app can be correlated.

```nginx
http {
    map $http_x_request_id $req_id {
        default $request_id;          # nginx-generated UUID
        ~.      $http_x_request_id;   # use the one from the client if present
    }

    log_format main '$remote_addr "$request" $status [$req_id] $upstream_response_time';

    server {
        # ...
        location / {
            proxy_pass http://app_backend;
            proxy_set_header X-Request-ID $req_id;
            add_header X-Request-ID $req_id always;
        }
    }
}
```

Now every log line, both nginx access log and your app's logs, has a shared `$req_id` you can grep on.

## Testing the whole thing

```bash
# 1. Start backend
go run main.go &

# 2. Reload nginx
sudo nginx -t && sudo systemctl reload nginx

# 3. Hit it
curl -i -H 'Host: example.com' http://localhost/

# 4. Watch both logs
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log

# 5. Kill the backend, re-curl
kill %1
curl -i -H 'Host: example.com' http://localhost/
# Should get 502 Bad Gateway from nginx
```

If you get the 502 cleanly when the backend is down, your timeouts and upstream are correct.

## Common mistakes

- **Missing `proxy_set_header Host $host`.** Backend serves the wrong virtual host (or the default).
- **Default `proxy_read_timeout` of 60s on long-running APIs.** Reports of "the page just hangs and then errors" trace back here.
- **Buffering on for streaming endpoints.** SSE clients see no events until the response ends.
- **Trailing-slash confusion in `proxy_pass`.** Manifests as 404s from the backend with weird paths.
- **Backend reachable directly from the internet.** Always firewall it (or bind to `127.0.0.1`) so headers cannot be forged.

## Recap

- A reverse proxy fronts your application server with TLS, HTTP/2, caching, and routing.
- Always set `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`. Lock the backend so these can be trusted.
- Use `upstream` blocks even for one backend — gives you keepalive and health checks for free.
- Set explicit timeouts (`connect`, `read`, `send`). Defaults are too generous.
- Disable buffering for streaming and WebSocket endpoints. Add `Upgrade` and `Connection` headers for WebSockets.
- Trailing slashes in `proxy_pass` change behavior — test before deploying.

Next chapter: making sense of the logs both nginx and your app produce — formats, fields, and the queries you will run a thousand times.

