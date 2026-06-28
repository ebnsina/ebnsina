---
title: 'CDN with OpenResty & Gcore'
description: 'Every layer explained — from BGP routing to Lua hooks, cache headers to origin auth — and how to extend each one.'
date: 2026-05-13
tags:
  ['cdn', 'openresty', 'nginx', 'lua', 'gcore', 'caching', 'security', 'rust', 'pingora', 'devops']
minutesRead: 69
---

<script>
	import CdnPlayground from '$lib/components/content/CdnPlayground.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

Every layer explained — from BGP routing to Lua hooks, cache headers to origin auth — and how to extend each one.

---

## Prerequisites — What You Need to Know First

Each concept below is framed as: _what problem forced us to build this thing?_ If you've shipped a fullstack app, you've already bumped into most of these problems. You just might not have known the name for the solution.

### How a browser fetches a page — and why each step costs time

**The problem:** you have a server with files on it. A user in another country wants one of those files. You can't just teleport bytes — they travel through physical cables at roughly two-thirds the speed of light. Every step between "user types URL" and "page loads" adds latency, and most of those steps involve a round-trip across that physical distance.

Here's what actually happens when you type a URL:

1. **DNS lookup.** Browser doesn't know the IP for `example.com`. It asks a DNS resolver (your ISP's, or 8.8.8.8). That resolver may ask several other servers in a chain before getting an answer. Result: an IP address like `93.184.216.34`. This adds ~20–120ms on a cold lookup — though results are cached, so repeat visits skip this.
2. **TCP handshake.** Browser opens a connection to that IP. This is a three-message exchange (SYN → SYN-ACK → ACK). You can't skip it — it's how TCP establishes that both sides are ready. Costs one round-trip. London to New York = ~80ms.
3. **TLS handshake.** For HTTPS, browser and server negotiate encryption keys. Another 1–2 round-trips. This is why HTTPS used to feel slower than HTTP — though TLS 1.3 cut it to one round-trip.
4. **HTTP request.** Browser finally sends `GET /index.html`. Server processes it, sends back the HTML.
5. **Parse and repeat.** Browser reads the HTML, finds 30 references to CSS, JS, images, fonts. Each one triggers another fetch (though HTTP/2 multiplexes them over the same connection).

> **Why CDN matters here:** Steps 1–3 are proportional to physical distance. A user in Dhaka to a server in Virginia: ~140ms per round-trip, multiplied by several handshake steps, before a single byte of your page arrives. A CDN PoP in Singapore is ~20ms from Dhaka. Same handshakes, 7× faster. **The CDN doesn't make your server faster — it moves the conversation closer to the user.**

### Why we need DNS — instead of just using IP addresses

**The problem:** your server has an IP address like `93.184.216.34`. You could tell users "go to `93.184.216.34`". But what happens when you move to a new server? New IP. Everyone who bookmarked the old one is broken. What if you need to serve users from different servers in different countries? One IP can only point to one place.

DNS solves this by being an indirection layer. `example.com` is just a name — the DNS record behind it can point to any IP, any time, and you can change it without users knowing. CDNs use DNS in two ways:

- **CNAME delegation.** You set `cdn.example.com CNAME customer.gcore.com`. Now Gcore's DNS controls what IP users get. They can update it to point at different PoPs without you touching anything. You gave up control of one DNS record in exchange for Gcore routing users intelligently.
- **GeoDNS.** Gcore's nameserver looks at where the DNS query comes from and returns a different IP per region — Singapore IP for Asian users, Frankfurt IP for European users. It's a blunt tool (DNS is cached, so if a user's resolver is in the wrong region, they get the wrong IP), but it works for simpler setups.

### Why we need a reverse proxy — instead of exposing the app directly

**The problem:** you have a Node.js app running on port 3000. The simplest thing is to open port 3000 to the world and let users hit it directly. Let's think through why that's a bad idea:

- Your app runs as your user (or worse, root). A bug that leaks a file path now exposes your entire filesystem to the internet.
- Node can't serve files efficiently. Every `res.sendFile()` goes through the JS runtime. nginx serves static files directly from OS cache — orders of magnitude faster.
- TLS certificates. Node can handle HTTPS, but certificate renewal, OCSP stapling, session resumption — all fiddly. nginx has solved these once, correctly.
- You're running 4 Node processes for CPU parallelism. How does a user request get distributed across them? Node can't listen on the same port twice without a proxy.
- One slow database query holds up that Node process. No timeout, no circuit breaker — just a hung connection eating memory.

A **reverse proxy** sits in front of your app and handles all of this. It's "reverse" because the proxy is on the server side (not the client side like a VPN). The user never talks to your app directly — they talk to the proxy, which forwards only what it can't handle itself.

```
Without:  Browser  ──►  Node.js :3000  (raw, no TLS, no compression, no caching)

With:     Browser  ──►  nginx :443  ──►  Node.js :3000
                        │
                        ├─ handles TLS (cert renewal, session cache)
                        ├─ serves /static/* directly from disk
                        ├─ gzip/brotli compresses responses
                        ├─ rate limits abusive IPs
                        ├─ caches responses (never touches Node for repeat requests)
                        └─ load-balances across 4 Node workers
```

_nginx does the infrastructure work. Node does the business logic. Each does what it's best at._

A CDN edge node is this same pattern, globalised: instead of one nginx in front of one app server, you have hundreds of nginx instances in cities around the world, all caching your app's responses and serving them locally.

### Why we need cache headers — instead of the CDN just guessing

**The problem:** the CDN has your response. Should it cache it? For how long? A product page changes every time inventory updates. A profile picture changes when the user uploads a new one. A JavaScript file never changes (you've hashed its filename). The CDN has no way to know which is which — unless you tell it.

Cache headers are your app's instructions to every cache in the chain (browser, CDN, intermediate proxies). The CDN reads them and obeys:

- `Cache-Control: public, max-age=3600` — "any cache may store this for 1 hour." CDN caches it, browser caches it.
- `Cache-Control: private` — "only the browser may cache this, not shared caches." Use for logged-in pages — different users see different content, so the CDN must not serve one user's page to another.
- `Cache-Control: no-store` — "don't cache this anywhere, ever." Use for bank statements, auth tokens.
- `ETag: "abc123"` — a fingerprint (hash) of the response body. When the CDN's cached copy expires, it asks the origin "is `abc123` still current?" Origin says `304 Not Modified` (no body) if yes. This saves re-downloading the whole response when nothing changed.

> **Why not cache everything forever?** If you cache a page for a year and update your prices tomorrow, users see stale prices for a year. If you never cache, every user hits your origin — you need a server powerful enough to handle 100% of traffic with no help. Cache headers let you express exactly the right tradeoff per response type: long for things that never change, short for things that do.

### Why we use nginx — instead of Node.js/Express for everything

**The problem:** Node.js is great at running JavaScript and talking to databases. But it's single-threaded, garbage-collected, and not designed for high-concurrency I/O at the network level. Try serving 10,000 simultaneous connections on a Node server — it struggles. Each connection holds memory, and GC pauses affect all of them at once.

nginx is written in C, runs one worker per CPU core, and uses a non-blocking event loop. It never spawns a thread per connection — instead, it registers all sockets with the OS (via `epoll` on Linux) and processes whichever ones have data ready. While waiting for your slow Node app to respond, nginx is simultaneously serving 5,000 other requests from its cache. It can handle 50,000+ concurrent connections on modest hardware.

You've probably already used nginx this way — `serve dist/` for your React build, `proxy_pass` to `localhost:3000` for your API. OpenResty is exactly that nginx, extended: a Lua scripting engine is baked in so you can write custom logic (auth, routing, rate limiting) that runs inside the nginx process — not in a separate app server that nginx has to make an extra network call to reach.

### Why we use Lua — instead of JavaScript or Python in OpenResty

**The problem:** you want to add custom logic to nginx. Option A: write a C module. Fast, but C is dangerous — a bug causes a segfault that crashes the whole server. Option B: run a sidecar Node.js service and have nginx proxy to it for auth decisions. Correct, but adds a network hop for every request. Option C: embed a scripting language directly into the nginx process.

Lua was chosen because it's tiny (~150KB), extremely fast (LuaJIT, the JIT compiler used here, often matches C speed), and was designed from the start to be embedded in other programs. It has a cooperative coroutine model that fits perfectly with nginx's event loop — each request gets its own coroutine, and when that coroutine does I/O (Redis lookup, HTTP call), it yields, letting nginx process other requests. No threads, no blocking, no GC pressure.

You don't need to know Lua deeply. The syntax is close enough to JavaScript or Python to read on first encounter:

```lua
-- Variables and types
local x      = 10          -- number
local name   = "world"     -- string
local active = true        -- boolean
local empty  = nil         -- null/None equivalent

-- String concat uses .. not +
print("Hello, " .. name)   -- "Hello, world"

-- Conditionals (no braces, uses then/end)
if x > 5 then
  print("big")
elseif x == 5 then
  print("medium")
else
  print("small")
end

-- Loops
for i = 1, 3 do print(i) end    -- prints 1, 2, 3  (1-indexed, not 0)

-- Functions
local function add(a, b) return a + b end

-- Tables: Lua's only data structure — works as both array and dict
local arr  = { "a", "b", "c" }
local dict = { host = "localhost", port = 6379 }
print(arr[1])        -- "a"  (1-indexed!)
print(dict.host)     -- "localhost"
print(dict["port"])  -- 6379  (both syntaxes work)
```

> **Key differences from JS/Python to watch for:** **1-indexed arrays** — `arr[1]` is the first element, not `arr[0]`. **`~=` means not-equal** — not `!==`. **`local` is mandatory** for scoped variables — omitting it makes the variable global, a common bug. **`and`/`or`/`not`** instead of `&&`/`||`/`!`. **No `null`** — it's `nil`.

### Why we use Redis — instead of a plain in-memory variable

**The problem:** you want to rate limit users. Easy — keep a counter in memory: `const counts = {}`. But nginx runs 8 worker processes (one per CPU core). Each worker has its own memory. A user can send 8 requests simultaneously — one to each worker — and each worker's counter only sees 1 request. Your "limit of 10 per second" becomes "limit of 80 per second" without you realising.

Even within one process: your counter resets every time the process restarts. Restart nginx for a config change, and all rate limit state is gone — every user gets a fresh counter.

Redis is an in-memory key-value store that lives in a separate process (or separate server). All nginx workers talk to it. All PoPs can talk to it. It's the single source of truth for shared state: rate limit counters, distributed locks, session tokens, cache invalidation signals. You've probably already used Redis for sessions or job queues in Node apps. Same tool, same role — just now it's at the CDN layer, not the application layer.

OpenResty's `lua_shared_dict` solves the multi-worker problem within one machine (all workers share one dict via shared memory, with atomic operations). Redis solves it across machines.

### Why we use anycast — instead of just GeoDNS

**The problem:** GeoDNS routes users based on where their DNS resolver is located. But a user in Tokyo might use Google's DNS resolver at `8.8.8.8`, which is in the US — so GeoDNS thinks they're American and routes them to a US PoP. Also, DNS records are cached — if you need to failover (your Singapore PoP crashes), you have to wait for TTL to expire before the new IP propagates. That's minutes of downtime.

Anycast works differently. Multiple physical servers in different cities all advertise the same IP address to internet routers using BGP (the protocol routers use to exchange "I can reach these IPs" information). When your packet arrives at any internet exchange, the router picks the path with the fewest hops to that IP — which in practice means the geographically nearest PoP. If Singapore goes down, its BGP announcement disappears within seconds, and routers automatically route to the next nearest PoP. No DNS TTL to wait for. No resolver-location guessing. Failover in seconds, not minutes.

---

## What a CDN Is and Why

Think of a CDN like a chain of local convenience stores. Your main warehouse (the _origin server_) is in New York. Without a CDN, every customer — whether they're in Tokyo, Lagos, or Berlin — has to order directly from that New York warehouse. It takes days (or in internet terms, hundreds of milliseconds). A CDN opens mini-stores in Tokyo, Lagos, and Berlin that each stock copies of your most popular items. Most customers get served immediately from the store down the street.

<Mermaid
title="CDN edge: hit fast, miss to origin"
code={`graph LR
  C["Client"] --> E["CDN Edge<br/>PoP"]
  E -->|"cache hit"| C
  E -->|"cache miss"| O["Origin Server"]
  O --> E`}
/>

There are two moving parts:

- **A distributed cache.** Many servers ("edges" or "points of presence" — PoPs) scattered across cities. Each holds copies of files pulled from your origin on first request.
- **A routing mechanism.** A way to send each user to the nearest edge. Production CDNs use _anycast BGP_ — many machines share one IP, and internet routers deliver each packet to the topologically closest one. Simpler CDNs use GeoDNS — return a different IP based on the resolver's geography.

```
user (Dhaka)  ──►  edge PoP (Singapore) ──miss──►  origin (Virginia)
                                         ◄─────────
                       [stores copy]
user (Dhaka)  ──►  edge PoP (Singapore) ──hit──►  ✓  served from local cache
user (Berlin) ──►  edge PoP (Frankfurt) ──hit──►  ✓  own independent cache
```

_Each PoP caches independently. Frankfurt doesn't share Singapore's copy — it fetches its own on first European request._

### Why it matters

| Benefit                     | Why it happens                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------- |
| **Latency drops 5–15×**     | Most web latency is physics — bytes crossing oceans. Edges cut the distance.           |
| **Origin offload 95–99%**   | Only cache misses reach your server. 1% of traffic, 1% of the load.                    |
| **Survives origin outages** | Edges serve stale copies while origin is down (`stale-if-error`).                      |
| **Absorbs DDoS**            | Anycast spreads attack traffic across all PoPs. 100 Gbps ÷ 150 PoPs = ~0.67 Gbps each. |
| **Cheaper bandwidth**       | CDN egress is pre-bought at bulk. Origin egress (AWS, colo) is expensive per-GB.       |

---

## OpenResty — Architecture

OpenResty is **nginx recompiled with LuaJIT built in**. Think of nginx as a very fast post office sorting machine — it receives letters (HTTP requests), knows exactly where to route them, but can't read or modify the content. LuaJIT is a scriptwriter you hire to sit next to the machine. At any point in the sorting process, the machine can pause and ask the scriptwriter: "what should I do with this one?" The scriptwriter can read the letter, modify it, look up a database, and tell the machine what to do next — all without slowing anything down because the scriptwriter works on many letters at once.

> "The Lua code you write looks synchronous. The I/O underneath is entirely asynchronous, multiplexed across thousands of connections by nginx's event loop."

### The nginx request phases

Every HTTP request moves through these phases in order. OpenResty lets you attach Lua code to any of them. Think of phases like stages on an assembly line — each stage has a specific job, and you can add custom workers at any stage:

| Phase                  | What it does                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `set_by_lua`           | Compute nginx variables. First to run. Use to derive config values from request data.                               |
| `rewrite_by_lua`       | URL rewriting, redirects, early auth. First place you can make outbound calls (Redis, etc.).                        |
| `access_by_lua`        | Auth, rate limiting, WAF. Request is blocked here until Lua returns. Block bad traffic before it touches origin.    |
| `content_by_lua`       | Generate a response directly from Lua. Bypasses proxy_pass. Use for health checks, API gateways, dynamic responses. |
| `proxy_pass`           | nginx's built-in upstream proxying. This is where proxy_cache operates — serve from disk or fetch from origin.      |
| `header_filter_by_lua` | Modify response headers before they leave. Add X-Cache, strip sensitive headers, inject Cache-Control overrides.    |
| `body_filter_by_lua`   | Modify the response body in streaming chunks. Use for HTML injection, minification, or partial assembly.            |
| `log_by_lua`           | Post-response logging. Runs after client gets reply — never blocks. Push metrics to Redis, emit structured logs.    |

> **Concurrency model:** All Lua code runs in one OS thread per nginx worker — but many requests are in flight at once. While your Lua code waits for a Redis reply, nginx's event loop serves other connections. This only works if you use `lua-resty-*` APIs (which use nginx's non-blocking cosocket). A regular blocking call (like `os.execute`) freezes the entire worker.

### nginx proxy_cache — how disk caching works

Imagine a library that photocopies books. The first person who requests a book gets the original (slow — origin fetch). The librarian makes a photocopy and keeps it on a special fast shelf. Every subsequent request for that same book gets the photocopy from the shelf instantly — no original needed. `proxy_cache` is that shelf. The "fast shelf" is your NVMe disk; there's also a "front pocket" (Lua shared dict in RAM) for the absolute hottest items.

```nginx
# nginx.conf — Cache zone: allocate disk + RAM
# 10GB on disk, 100MB key index in RAM, evict after 1 day of inactivity
proxy_cache_path /var/cache/nginx
  levels=1:2
  keys_zone=cdn_cache:100m
  max_size=10g
  inactive=1d
  use_temp_path=off;
```

```nginx
# nginx.conf — Edge server block: full cache config
server {
  listen 443 ssl http2;
  server_name cdn.example.com;

  ssl_certificate     /etc/ssl/cdn.crt;
  ssl_certificate_key /etc/ssl/cdn.key;
  ssl_protocols       TLSv1.2 TLSv1.3;
  ssl_session_cache   shared:SSL:10m;

  lua_shared_dict cdn_ram  256m;  # hot objects in RAM (~100ns access)
  lua_shared_dict ratelims  16m;
  lua_shared_dict locks      1m;

  location / {
    access_by_lua_file /etc/openresty/lua/access.lua;

    proxy_cache            cdn_cache;
    proxy_cache_key        "$scheme$host$uri$is_args$args";
    proxy_cache_valid      200 206  1h;     # 200/206 cached 1 hour
    proxy_cache_valid      301 302  10m;
    proxy_cache_valid      404      1m;
    proxy_cache_use_stale  error timeout updating;
    proxy_cache_background_update on;      # stale-while-revalidate
    proxy_cache_lock       on;             # single-flight: one origin fetch per key
    proxy_cache_lock_timeout 5s;

    proxy_pass         http://origin_upstream;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;

    header_filter_by_lua_file /etc/openresty/lua/headers.lua;
    log_by_lua_file           /etc/openresty/lua/log.lua;

    add_header X-Cache-Status $upstream_cache_status always;
  }

  # Purge endpoint — restricted to internal IPs only
  location /__purge {
    allow 10.0.0.0/8;
    deny  all;
    content_by_lua_file /etc/openresty/lua/purge.lua;
  }
}
```

> **`$upstream_cache_status` values:** `HIT` — served from disk cache instantly. `MISS` — fetched from origin, now cached. `EXPIRED` — was stale, re-fetched from origin. `STALE` — stale but served anyway (origin unreachable). `UPDATING` — stale served while background refresh runs. `BYPASS` — cache skipped (e.g. `no-store` header).

#### Two-tier cache: RAM first, disk second

For the hottest objects (homepage, top product pages), check a RAM dictionary before touching disk. RAM access is ~100ns vs ~1ms for disk — 10,000× faster. Like checking your shirt pocket before walking to the filing cabinet.

```lua
-- /etc/openresty/lua/content.lua — two-tier lookup
local ram  = ngx.shared.cdn_ram
local lock = require("resty.lock"):new("locks", { timeout = 10 })
local key  = ngx.var.uri

-- Tier 1: RAM (100ns)
local val, flags = ram:get(key)
if val then
  ngx.header["X-Cache"]       = "RAM-HIT"
  ngx.header["Content-Type"]  = ngx.decode_base64(flags)
  ngx.print(val)
  return
end

-- Acquire lock so only ONE coroutine fetches origin for a cold key.
-- All other concurrent requests for the same URL wait here.
-- (Without this, 1000 users hitting a cold URL = 1000 origin requests.)
local elapsed, err = lock:lock(key)
if not elapsed then
  return ngx.exec("@proxy")  -- fall through on lock error
end

-- Check RAM again — another worker may have populated it while we waited
val, flags = ram:get(key)
if val then
  lock:unlock()
  ngx.print(val)
  return
end

-- Tier 2: let nginx handle disk cache + origin fetch
lock:unlock()
return ngx.exec("@proxy")
```

### Key resty modules

| Module                | What it does              | Why you need it                                                                                  |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| `resty.redis`         | Non-blocking Redis client | Shared state across workers: rate limits, session tokens, distributed locks, cache invalidation. |
| `resty.lock`          | Shared-dict mutex         | Single-flight protection within a process — prevent thundering herd on cold keys.                |
| `resty.limit.traffic` | Token bucket rate limiter | Per-IP or per-key rate limits using shared dict. Atomically safe under worker concurrency.       |
| `resty.http`          | Non-blocking HTTP client  | Make outbound HTTP calls from Lua (to auth servers, APIs) without blocking the event loop.       |
| `resty.jwt`           | JWT sign/verify           | Validate signed tokens at the edge — no round-trip to your auth service per request.             |
| `resty.lrucache`      | Per-worker LRU dict       | Faster than shared dict (no IPC). Use for tiny frequently-read config (JWK sets, feature flags). |

```lua
-- /etc/openresty/lua/access.lua — rate limit + JWT
local limit_traffic = require "resty.limit.traffic"
local jwt           = require "resty.jwt"

-- Rate limiting
-- Like a bouncer with a clicker: 20 people per second max, burst of 20 ok.
local lim = limit_traffic.new("ratelims", 20, 20)
local ip  = ngx.var.binary_remote_addr
local delay, err = lim:incoming(ip, true)

if not delay then
  if err == "rejected" then
    ngx.status = 429
    ngx.header["Retry-After"] = "1"
    ngx.say("rate limited")
    return ngx.exit(429)
  end
end

-- JWT verification for /private/ paths
if ngx.var.uri:sub(1, 9) == "/private/" then
  local auth = ngx.var.http_authorization
  if not auth or not auth:match("^Bearer ") then
    return ngx.exit(401)
  end

  local token   = auth:sub(8)
  local ok, obj = pcall(jwt.verify, jwt, os.getenv("JWT_SECRET"), token)
  if not ok or not obj.verified then
    return ngx.exit(401)
  end

  ngx.req.set_header("X-User-Id", obj.payload.sub)
end
```

---

## Gcore CDN — Network & API

Gcore operates 130+ PoPs across six continents on a private backbone. It's a _pull_ CDN by default — it fetches from your origin on cache miss, never requires you to push files manually. Think of Gcore as a franchise owner who builds convenience stores (PoPs) all over the world and restocks them automatically whenever a store runs out of something a customer asks for.

### PoP topology & anycast routing

Gcore uses **anycast BGP**: one IP address is announced from all PoPs simultaneously. Internet routers deliver your packets to the PoP with the fewest BGP hops — which in practice means the geographically closest one. No DNS tricks, no resolver-location guessing. Routing happens at the packet level, sub-millisecond. It's like every taxi in the city having the same phone number — the dispatcher automatically connects you to the nearest available cab.

```
Client                BGP routing               PoP served
─────────────────────────────────────────────────────────────
Dhaka      ──►  45.xxx.xxx.xxx (anycast)  ──►  Singapore
Berlin     ──►  45.xxx.xxx.xxx (same IP)  ──►  Frankfurt
São Paulo  ──►  45.xxx.xxx.xxx (same IP)  ──►  São Paulo
Nairobi    ──►  45.xxx.xxx.xxx (same IP)  ──►  Johannesburg
```

_One IP, many physical destinations. BGP delivers each packet to the nearest PoP automatically._

> **Origin shielding:** You can designate one PoP as a **shield**. All other PoPs that miss their local cache fetch from the shield PoP, not directly from your origin. The shield aggregates misses from all regions, achieving a much higher hit rate. Your origin only sees one IP (the shield) — dramatically less traffic, and one point to secure. Like a regional distribution centre that all the mini-stores restock from, rather than each store calling the factory.

### Rules engine

Gcore's rules engine evaluates conditions on every request before deciding how to cache or route it. First match wins. Configure in the dashboard or API:

| Condition       | Example use                                |
| --------------- | ------------------------------------------ |
| Path pattern    | `/assets/*` → cache 1 year, immutable      |
| Cookie presence | `session=*` → bypass cache, pass to origin |
| Request header  | `Accept: image/webp` → serve WebP variant  |
| Country code    | Country = CN → route to Asia origin pool   |
| File extension  | `.mp4`, `.wasm` → long TTL, large slab     |
| Query param     | `?nocache=1` → bypass cache for testing    |

```json
// Gcore API — Set rules via REST
PATCH /cdn/resources/{resource_id}/rules
Authorization: APIKey your-gcore-api-key

{
  "rules": [
    {
      "name": "static-assets-immutable",
      "conditions": [{ "type": "path", "value": "/assets/*" }],
      "actions": [
        { "type": "set_response_header",
          "name": "Cache-Control",
          "value": "public, max-age=31536000, immutable" },
        { "type": "cache_ttl", "value": 31536000 }
      ]
    },
    {
      "name": "bypass-authenticated",
      "conditions": [{ "type": "cookie", "name": "session", "operator": "exists" }],
      "actions": [{ "type": "cache_bypass" }, { "type": "proxy_to_origin" }]
    }
  ]
}
```

### API — purge, prefetch, stats

Integrate purge and prefetch into your deploy pipeline so the CDN cache is always in sync with your code. Think of purge as "throwing out expired inventory" and prefetch as "pre-stocking stores before the rush."

```bash
# Purge specific URLs
curl -X DELETE https://api.gcore.com/cdn/resources/{id}/cache \
  -H "Authorization: APIKey $GCORE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"urls": ["/index.html", "/assets/main.css"]}'

# Purge by path pattern
curl -X DELETE https://api.gcore.com/cdn/resources/{id}/cache \
  -H "Authorization: APIKey $GCORE_API_KEY" \
  -d '{"patterns": ["/assets/*"]}'
```

```bash
# Prefetch — warm caches before traffic hits
# Push assets to all PoPs right after deploy
# Users get HIT on first request instead of MISS
curl -X POST https://api.gcore.com/cdn/resources/{id}/prefetch \
  -H "Authorization: APIKey $GCORE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "paths": [
      "/assets/main.abc123.js",
      "/assets/vendor.def456.js",
      "/assets/style.ghi789.css"
    ]
  }'
```

```bash
# Stats — hit rate, bandwidth, requests
curl "https://api.gcore.com/cdn/resources/{id}/statistics" \
  -H "Authorization: APIKey $GCORE_API_KEY" \
  -G \
  --data-urlencode "granularity=1h" \
  --data-urlencode "from=2024-01-01T00:00:00Z" \
  --data-urlencode "to=2024-01-02T00:00:00Z" \
  --data-urlencode "metrics=requests,hit_requests,bandwidth,origin_bandwidth"

# Response includes:
# {
#   "cache_hit_ratio": 0.97,         ← 97% of requests served from edge
#   "total_requests": 12400000,
#   "origin_requests": 372000,       ← only 3% reached your server
#   "bandwidth_saved_gb": 8240
# }
```

> **Deploy integration pattern:** Build → upload hashed assets → deploy app → **purge only HTML files** (assets don't need purging — hashed filenames make them immutable) → prefetch new HTML into all PoPs. Asset cache stays warm across deploys. HTML is always fresh.

---

## Building the Full Stack

Gcore handles global distribution and DDoS absorption. OpenResty handles custom logic at your origin shield. Together: Gcore is the outer shell facing the world; OpenResty is the intelligent middle layer; your app server is the brain that only sees the tiny fraction of traffic that neither layer could serve from cache.

```
User (anywhere)
     │  anycast BGP
     ▼
Gcore PoP  (130+ locations)
┌─────────────────────────────────────────────┐
│  Rules engine → Cache check                 │
│  DDoS mitigation · TLS 1.3 termination      │
└──────────────────┬──────────────────────────┘
                   │ cache MISS only (~3% of traffic)
                   ▼
OpenResty  (your origin shield)
┌─────────────────────────────────────────────┐
│  access.lua    (auth, rate limit, WAF)       │
│  proxy_cache   (disk cache — NVMe)           │
│  lua_shared_dict (RAM cache — hot keys)      │
│  resty.redis   (distributed state)           │
│  headers.lua   (header rewrite)              │
└──────────────────┬──────────────────────────┘
                   │ cache MISS only (~0.1% of traffic)
                   ▼
Origin  (app server / S3 / database)
Never receives direct public traffic.
```

_Gcore absorbs ~97% of requests. OpenResty converts most of the remaining 3% to cache hits. Origin sees under 0.1% of public traffic._

### Gcore resource config

```json
// Gcore API — Create CDN resource pointing to OpenResty shield
POST /cdn/resources
{
  "cname": "cdn.example.com",
  "origin_group": {
    "origins": [{
      "source": "shield.example.com:443",
      "enabled": true,
      "protocol": "HTTPS",
      "weight": 100
    }]
  },
  "options": {
    "edge_cache_settings": { "enabled": true, "default_value": "3600" },
    "origin_protocol": "HTTPS",
    "ssl_enabled": true,
    "http2_enabled": true,
    "gzip_on": true,
    "brotli_compression": { "enabled": true },
    "stale_error_enabled": true,
    "stale_updating_enabled": true,
    "host_header": { "enabled": true, "field_value": "cdn.example.com" }
  }
}
```

### Lock down the origin — Gcore secret header

If your shield's IP leaks (DNS history, SSL cert transparency logs), an attacker can hit it directly and bypass all your CDN security. Fix: Gcore sends a secret header to your shield; OpenResty rejects anyone that doesn't have it. Like a VIP backstage pass — no pass, no entry, even if you know the address.

```lua
-- access.lua — reject requests not from Gcore
local GCORE_SECRET = os.getenv("GCORE_ORIGIN_SECRET")
local remote       = ngx.var.remote_addr

-- Allow loopback (health checks, internal tools)
if remote ~= "127.0.0.1" and remote ~= "::1" then
  local token = ngx.var.http_x_gcore_auth
  if not token or token ~= GCORE_SECRET then
    ngx.log(ngx.WARN, "rejected non-Gcore request from ", remote)
    return ngx.exit(403)
  end
end
```

### Complete OpenResty config

```nginx
# nginx.conf — Full origin shield
user  nginx;
worker_processes auto;
worker_rlimit_nofile 65535;

events {
  worker_connections 10240;
  use epoll;
  multi_accept on;
}

http {
  include      mime.types;
  default_type application/octet-stream;

  log_format json escape=json
    '{"time":"$time_iso8601","method":"$request_method",'
    '"uri":"$uri","status":$status,"cache":"$upstream_cache_status",'
    '"bytes":$body_bytes_sent,"rt":$request_time,"ip":"$remote_addr"}';
  access_log /var/log/nginx/access.log json buffer=64k flush=5s;

  upstream origin {
    server app.internal:3000;
    keepalive 64;
    keepalive_requests 1000;
    keepalive_timeout  60s;
  }

  proxy_cache_path /var/cache/nginx
    levels=1:2
    keys_zone=shield:200m
    max_size=50g
    inactive=7d
    use_temp_path=off;

  lua_shared_dict hot     512m;
  lua_shared_dict ratelims 32m;
  lua_shared_dict locks     2m;

  lua_package_path "/etc/openresty/lua/?.lua;;";
  init_by_lua_file /etc/openresty/lua/init.lua;

  server {
    listen 443 ssl http2;
    server_name shield.example.com;

    ssl_certificate     /etc/ssl/shield.crt;
    ssl_certificate_key /etc/ssl/shield.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:SSL:50m;
    ssl_session_timeout 1d;

    location / {
      access_by_lua_file        /etc/openresty/lua/access.lua;

      proxy_cache               shield;
      proxy_cache_key           "$scheme$host$uri$is_args$args";
      proxy_cache_valid         200 206  1h;
      proxy_cache_valid         301 302  5m;
      proxy_cache_valid         404      30s;
      proxy_cache_use_stale     error timeout updating;
      proxy_cache_background_update on;
      proxy_cache_lock          on;
      proxy_cache_lock_timeout  10s;

      proxy_pass                http://origin;
      proxy_http_version        1.1;
      proxy_set_header          Connection "";
      proxy_set_header          Host $host;
      proxy_set_header          X-Real-IP $remote_addr;

      header_filter_by_lua_file /etc/openresty/lua/headers.lua;
      log_by_lua_file           /etc/openresty/lua/log.lua;
      add_header X-Cache        $upstream_cache_status always;
    }

    location /__purge {
      allow  10.0.0.0/8;
      deny   all;
      content_by_lua_file /etc/openresty/lua/purge.lua;
    }

    location /health {
      access_log off;
      return 200 "ok\n";
    }
  }
}
```

---

## Features to Add & Improve

### 1. Brotli compression at the shield

Gcore can compress responses, but if your shield compresses first, Gcore caches the compressed bytes — saving bandwidth between shield and PoP too. Like shrinking parcels before loading them onto the delivery truck.

Never compress images or video (already compressed). Only compress text: HTML, CSS, JS, JSON, SVG.

```nginx
# nginx.conf — Brotli + gzip at shield
# Requires ngx_brotli (compile with --add-module=ngx_brotli)
brotli           on;
brotli_static    on;          # serve pre-compressed .br files if present
brotli_comp_level 6;
brotli_types     text/html text/css application/javascript
                 application/json text/xml image/svg+xml
                 application/wasm font/woff2;

gzip             on;
gzip_static      on;
gzip_comp_level  6;
gzip_vary        on;           # adds Vary: Accept-Encoding to cache key
gzip_types       text/html text/css application/javascript
                 application/json text/xml image/svg+xml;
```

### 2. Image optimization at the edge

Serve WebP to browsers that support it, AVIF to those that support AVIF, and the original JPEG/PNG to everything else — all from the same URL, automatically. Like a pharmacy that gives you the right pill format (tablet, liquid, chewable) based on who's asking, without changing the prescription.

```lua
-- rewrite_by_lua — route image to imgproxy based on Accept
local uri    = ngx.var.uri
local accept = ngx.var.http_accept or ""

if uri:match("%.(jpe?g|png)$") then
  local w   = ngx.var.arg_w or "original"
  local fmt = "webp"
  if accept:find("image/avif") then fmt = "avif" end

  -- imgproxy handles resize + reformat on the fly
  local imgproxy = string.format(
    "http://imgproxy.internal/insecure/w:%s/f:%s/plain/https://origin.internal%s",
    w, fmt, uri
  )
  return ngx.exec("@imgproxy", { imgproxy_url = imgproxy })
end
```

### 3. Signed URLs

Protect paid or private content (PDFs, videos) with time-limited URLs. The edge validates the signature without touching your origin — no auth API call per download. Like a ticket with a hologram: the door staff check it instantly, no need to call the box office for every customer.

```lua
-- access.lua — signed URL validation
-- URL format: /private/file.pdf?expires=1716300000&sig=hexmac
local expires = tonumber(ngx.var.arg_expires)
local sig     = ngx.var.arg_sig

if not expires or not sig then return ngx.exit(403) end

-- Reject after expiry
if ngx.time() > expires then
  ngx.status = 410
  ngx.say("link expired")
  return ngx.exit(410)
end

-- HMAC-SHA256(path + "?" + expires) must match sig
local SECRET  = os.getenv("SIGNED_URL_SECRET")
local hmac    = require "resty.hmac"
local h       = hmac:new(SECRET, hmac.ALGOS.SHA256)
h:update(ngx.var.uri .. "?" .. expires)
local expected = h:final(nil, true)   -- hex

if expected ~= sig then
  ngx.log(ngx.WARN, "bad signature: ", ngx.var.uri)
  return ngx.exit(403)
end
```

### 4. Geo-routing and A/B testing at the edge

Route Chinese users to an Asia server, EU users to an EU server — without JavaScript, without any code in your app, purely at the edge. Also split traffic for A/B tests: send 10% of users to a variant, 90% to control, stably by IP hash. Like a traffic officer who checks your number plate and waves you to the right lane before you even reach the junction.

```lua
-- rewrite_by_lua — geo-routing + A/B split
-- Gcore injects X-Geoip-Country-Code on every request
local country = ngx.var.http_x_geoip_country_code or "US"

local origin_map = {
  CN = "http://origin-asia.internal",
  HK = "http://origin-asia.internal",
  DE = "http://origin-eu.internal",
  FR = "http://origin-eu.internal",
  GB = "http://origin-eu.internal",
}
local origin = origin_map[country] or "http://origin-us.internal"

-- Stable A/B bucket: same user always gets same variant
-- (hash of IP → 0-99, send bucket 0-9 to variant = 10%)
local bucket = ngx.crc32_long(ngx.var.remote_addr) % 100

ngx.var.upstream_url = origin
ngx.req.set_header("X-Country",   country)
ngx.req.set_header("X-AB-Bucket", bucket < 10 and "variant" or "control")
```

### 5. Background cache refresh (stale-while-revalidate)

Serve the stale object immediately, then fetch a fresh copy in the background. The user never waits for revalidation. Like a hotel that gives you a fresh towel from the stack immediately, while housekeeping quietly restocks the wardrobe behind the scenes.

```lua
-- Background refresh via ngx.timer.at
local function refresh(premature, key, url)
  if premature then return end
  local httpc = require("resty.http").new()
  local res   = httpc:request_uri(url, { method = "GET", timeout = 5000 })
  if res and res.status == 200 then
    local ttl = parse_max_age(res.headers["cache-control"]) or 60
    ngx.shared.hot:set(key, res.body, ttl,
      ngx.encode_base64(res.headers["content-type"]))
  end
end

-- In content handler: serve stale, schedule refresh if near expiry
local val, flags = ngx.shared.hot:get(key)
if val then
  if (ngx.shared.hot:ttl(key) or 999) < 10 then
    -- Fire-and-forget: returns immediately, runs after response sent
    ngx.timer.at(0, refresh, key, ngx.var.scheme.."://"..ngx.var.host..ngx.var.uri)
  end
  ngx.print(val)
  return
end
```

### 6. Real-time analytics in log_by_lua

After every response, push structured metrics to Redis — request count, cache status, bytes, country. Aggregate per minute, expose to Prometheus, view in Grafana. No external analytics service needed; the CDN itself generates the data. Like a shop assistant who tallies sales on a notepad after each customer leaves, not during the transaction.

```lua
-- log_by_lua — per-minute metrics to Redis
local redis  = require "resty.redis.pool"
local r      = redis:new()
r:connect("redis.internal", 6379)

local minute  = math.floor(ngx.time() / 60) * 60
local cache   = ngx.var.upstream_cache_status or "BYPASS"
local bytes   = ngx.var.body_bytes_sent
local country = ngx.var.http_x_geoip_country_code or "XX"

r:init_pipeline()
r:hincrby("cdn:req:"  .. minute,  "total",  1)
r:hincrby("cdn:req:"  .. minute,  cache,    1)
r:hincrby("cdn:bytes:" .. minute, "out",    bytes)
r:hincrby("cdn:geo:"  .. country, "reqs",   1)
r:expire("cdn:req:"  .. minute, 7200)
r:expire("cdn:bytes:" .. minute, 7200)
r:commit_pipeline()
r:close()
```

---

## Security at Every Layer

Security lives at the edge because the edge sees every request before origin does. Cheapest checks run first — if you can reject a bad request in 1 microsecond, don't spend 10 milliseconds on WAF pattern matching first. Think of it like airport security: ID check before the scanner, scanner before the gate, gate before the plane. Early and cheap.

```
# access_by_lua cascade — cheapest gates first:
#
# 1. Gcore secret check        ~1μs   (string compare)
# 2. IP blocklist              ~10μs  (shared dict lookup)
# 3. Rate limit                ~50μs  (atomic counter)
# 4. WAF pattern match         ~200μs (regex)
# 5. JWT / signed-URL verify   ~1ms   (HMAC)
#
# proxy_cache lookup           ~1ms   (disk read)
# origin fetch (on miss)       ~50–500ms (network)

# Tight timeouts — kill application-layer DDoS (Slowloris)
client_header_timeout  5s;
client_body_timeout   10s;
keepalive_timeout     30s;
proxy_read_timeout    30s;
```

### WAF — block common attack patterns

A WAF is a pattern matcher that reads each URL and rejects ones that look like attacks. Like a librarian who spots someone trying to borrow a book with a fake card — they check a list of known fraud patterns before handing anything over.

```lua
-- access.lua — targeted WAF rules
local rules = {
  { name="sqli", re=[[(?i)\bunion\s+select\b]],         where="uri" },
  { name="sqli", re=[[(?i)'?\s*or\s+1\s*=\s*1]],        where="uri" },
  { name="xss",  re=[[(?i)<\s*script\b]],               where="uri" },
  { name="xss",  re=[[(?i)javascript:\s*]],             where="uri" },
  { name="pt",   re=[[(?i)\.\.(/|%2f)]],                where="uri" },  -- path traversal
  { name="bot",  re=[[(?i)(sqlmap|nikto|masscan|nmap)]], where="ua"  },
  { name="shell",re=[[;\s*(rm|wget|curl|bash)\s]],      where="uri" },
}

local uri = ngx.unescape_uri(ngx.var.request_uri)
local ua  = ngx.var.http_user_agent or ""

for _, rule in ipairs(rules) do
  local hay = rule.where == "ua" and ua or uri
  if ngx.re.find(hay, rule.re, "jo") then
    ngx.log(ngx.WARN, "WAF [", rule.name, "] blocked: ", uri:sub(1, 100))
    ngx.status = 403
    ngx.say("request blocked")
    return ngx.exit(403)
  end
end
```

### Distributed rate limiting via Redis

Local shared-dict rate limits only count requests hitting _one worker_. Across 8 workers and multiple machines, an attacker gets 8× the limit. Redis gives you one global counter. Like a single bouncer tracking the whole guest list, not each bouncer having their own separate count.

```lua
-- Global rate limit — Redis sliding window
local redis = require "resty.redis.pool"
local r     = redis:new()
r:set_timeout(100)  -- 100ms max — rate limit must be fast
r:connect("redis.internal", 6379)

local key   = "rl:" .. ngx.var.binary_remote_addr
local limit = 500   -- 500 req/min per IP
local window = 60

r:init_pipeline()
r:incr(key)
r:expire(key, window)
local res = r:commit_pipeline()
r:close()

local count = res[1]
if count > limit then
  ngx.header["Retry-After"] = window
  ngx.status = 429
  ngx.say("rate limit exceeded")
  return ngx.exit(429)
end

ngx.header["X-RateLimit-Remaining"] = math.max(0, limit - count)
```

### Network-layer DDoS — what Gcore handles

Application-layer rules (rate limiting, WAF) stop HTTP floods and scraping bots. Volumetric network attacks — terabits of SYN floods, UDP amplification — saturate your NIC before any Lua code runs. That layer is Gcore's job, not yours:

- **Anycast spreading.** A 1 Tbps attack across 150 PoPs = ~7 Gbps each — filterable at PoP level.
- **BGP blackholing.** Null-route attacking ASNs at BGP level in seconds.
- **SYN cookies.** Kernel-level SYN flood defence, always on at Gcore's edge.
- **Scrubbing centres.** At volumetric threshold, traffic reroutes through scrubbing; clean packets forwarded to your shield.

> **Know your layer:** Volumetric DDoS lives at Layer 3/4 (network). Application DDoS (Slowloris, HTTP flood, credential stuffing) lives at Layer 7 (HTTP). OpenResty defends Layer 7. Gcore defends Layer 3/4. Don't try to handle terabit floods from Lua — that's like trying to stop a flood with a mop. Use the infrastructure built for it.

---

## Cache Headers — Reference

Cache headers are the contract between your origin and every cache in the chain — browser, CDN edge, origin shield. Think of them as food labels: they tell the cache how long the content is safe to serve and under what conditions.

| Header                                    | Controls                              | Notes                                                                                                   |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Cache-Control: public, max-age=N`        | Cache anywhere for N seconds          | Use for anonymous content. N=31536000 + `immutable` for hashed assets.                                  |
| `Cache-Control: s-maxage=N`               | CDN TTL, overrides max-age            | Different TTL for browser vs CDN. Browser caches 60s, CDN caches 3600s.                                 |
| `Cache-Control: private`                  | Browser only — no CDN caching         | For authenticated pages. CDN passes through; browser may cache.                                         |
| `Cache-Control: no-store`                 | Cache nothing, anywhere               | Sensitive data (tokens, PII). Browser doesn't even store it.                                            |
| `Cache-Control: stale-while-revalidate=N` | Serve stale, refresh in background    | Keeps hit rate high. Users never wait for revalidation.                                                 |
| `Cache-Control: stale-if-error=N`         | Serve stale N seconds on origin error | Keeps CDN serving if origin goes down. Essential for availability.                                      |
| `ETag: "fingerprint"`                     | Object version identifier             | Edge sends `If-None-Match` on revalidation; origin returns 304 (no body) if unchanged. Saves bandwidth. |
| `Vary: Accept-Encoding`                   | Separate cached copy per encoding     | Always set when serving gzip/brotli. Without it, compressed bytes served to non-compressed clients.     |
| `Vary: Accept`                            | Separate copy per Accept header       | For WebP/AVIF image variants. Fragments cache — normalize Accept before using it as key.                |
| `Surrogate-Key` / `Cache-Tag`             | Tag objects for batch purge           | Tag all product pages as `product:123`; purge them all in one API call.                                 |

### Decision tree — which Cache-Control to send

```
Is the response different per user? (has session cookie, auth header)
├─ YES → private, no-store
└─ NO  →
   Is the filename content-hashed? (app.8a3f.js, vendor.d9c1.css)
   ├─ YES → public, max-age=31536000, immutable
   └─ NO  →
      Is it an HTML page?
      ├─ YES → public, max-age=60, s-maxage=300, stale-while-revalidate=60
      └─ NO  →
         Is it an API response?
         ├─ Rarely changes → public, max-age=60, s-maxage=3600
         └─ Changes often  → public, max-age=5, s-maxage=30
```

> **The golden rule:** Hash static asset filenames at build time (`main.8a3f9c.js`). Cache them `max-age=31536000, immutable` — they can never go stale because a new deploy produces a new filename. HTML keeps its name (`index.html`), so cache it short and **purge on deploy**. Two settings cover 99% of sites.

---

## Building a CDN Edge with Pingora + Rust

**Why would you use this instead of OpenResty?** OpenResty is nginx + Lua — battle-tested, widely deployed, but you're working within nginx's constraints. The config language is declarative and clunky for complex logic. Lua is dynamically typed — a typo in a variable name creates a silent global variable bug. Debugging is hard. There's no type checker, no compiler errors.

Pingora is Cloudflare's open-source Rust framework for building proxy servers. Instead of configuring a server, you write a Rust program that _is_ the server. You get: the Rust type system (if it compiles, a whole class of bugs is gone), async/await for concurrency (same performance as nginx's event loop), full access to any Rust crate (the ecosystem is enormous), and the ability to express complex routing logic as normal code — not config file gymnastics.

Cloudflare replaced their nginx-based infrastructure with Pingora and reported significantly better connection reuse and memory usage at scale.

> **OpenResty vs Pingora — when to pick which:** **OpenResty:** you need a production CDN fast, the logic isn't too complex, your team knows Lua or nginx config, and you want a proven system with 10+ years of deployment history. **Pingora:** you want type safety, complex business logic at the edge, full Rust ecosystem access, or you're building a custom proxy product (not just a CDN config). Pingora requires knowing Rust — the learning curve is real.

### Why Rust — instead of Go, Node, or Python

- **No garbage collector.** GC pauses are unpredictable. In a proxy serving millions of req/s, a 10ms GC pause causes a latency spike visible to users. Rust manages memory at compile time — no runtime pauses, ever.
- **Memory safety without GC.** Rust's borrow checker prevents use-after-free, data races, and buffer overflows at compile time. A proxy that handles raw HTTP bytes from untrusted internet users needs this — C proxies have had decades of CVEs from exactly these bugs.
- **Zero-cost abstractions.** Async/await in Rust compiles to the same code as hand-written state machines. You write readable concurrent code; you get C-level performance.
- **Explicit everything.** Error handling is forced (no exceptions). Types are explicit. Nothing is implicit. For infrastructure code that must be correct, this is a feature, not a burden.

### Pingora architecture

Pingora gives you a trait called `ProxyHttp`. You implement the methods you care about — each one is a hook at a specific point in the request lifecycle. Same phase model as nginx/OpenResty, expressed as Rust async functions instead of config directives.

```toml
# Cargo.toml
[package]
name = "cdn-edge"
version = "0.1.0"
edition = "2021"

[dependencies]
pingora         = { version = "0.3", features = ["proxy"] }
pingora-cache   = "0.3"
pingora-limits  = "0.3"
tokio           = { version = "1", features = ["full"] }
async-trait     = "0.1"
bytes           = "1"
http            = "1"
```

```rust
// src/main.rs — minimal edge proxy
use async_trait::async_trait;
use pingora::prelude::*;
use pingora::proxy::{http_proxy_service, ProxyHttp, Session};

pub struct CdnEdge {
    origin_addr: String,
}

#[async_trait]
impl ProxyHttp for CdnEdge {
    type CTX = ();
    fn new_ctx(&self) -> Self::CTX { () }

    // Pick which backend server to forward to.
    // Equivalent to nginx's `proxy_pass` / upstream selection.
    async fn upstream_peer(
        &self,
        _session: &mut Session,
        _ctx: &mut Self::CTX,
    ) -> Result<Box<HttpPeer>> {
        let peer = HttpPeer::new(
            self.origin_addr.as_str(),
            false,
            self.origin_addr.clone(),
        );
        Ok(Box::new(peer))
    }

    // Modify the request before it goes to origin.
    // Equivalent to nginx's proxy_set_header directives + rewrite_by_lua.
    async fn upstream_request_filter(
        &self,
        _session: &mut Session,
        upstream_request: &mut pingora::http::RequestHeader,
        _ctx: &mut Self::CTX,
    ) -> Result<()> {
        upstream_request.insert_header("X-Edge-Auth", "secret-token")?;
        Ok(())
    }

    // Modify the response before sending to client.
    // Equivalent to header_filter_by_lua.
    async fn response_filter(
        &self,
        _session: &mut Session,
        upstream_response: &mut pingora::http::ResponseHeader,
        _ctx: &mut Self::CTX,
    ) -> Result<()> {
        upstream_response.insert_header("X-Served-By", "cdn-edge-rust")?;
        Ok(())
    }

    // Runs after response is sent. Equivalent to log_by_lua.
    async fn logging(
        &self,
        session: &mut Session,
        _error: Option<&pingora::Error>,
        _ctx: &mut Self::CTX,
    ) {
        let req  = session.req_header();
        let resp = session.response_written();
        println!(
            "{} {} → {}",
            req.method,
            req.uri,
            resp.map(|r| r.status.as_u16()).unwrap_or(0)
        );
    }
}

fn main() {
    let mut server = Server::new(None).unwrap();
    server.bootstrap();

    let edge = CdnEdge {
        origin_addr: "127.0.0.1:9000".to_string(),
    };

    let mut proxy = http_proxy_service(&server.configuration, edge);
    proxy.add_tcp("0.0.0.0:8080");

    server.add_service(proxy);
    server.run_forever();
}
```

### In-memory cache with TTL

```rust
// src/cache.rs
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};
use bytes::Bytes;

#[derive(Clone)]
pub struct CachedResponse {
    pub status:  u16,
    pub headers: Vec<(String, String)>,
    pub body:    Bytes,
    pub expires: Instant,
}

#[derive(Clone, Default)]
pub struct EdgeCache {
    inner: Arc<RwLock<HashMap<String, CachedResponse>>>,
}

impl EdgeCache {
    pub fn get(&self, key: &str) -> Option<CachedResponse> {
        let map = self.inner.read().unwrap();
        map.get(key).and_then(|entry| {
            if entry.expires > Instant::now() {
                Some(entry.clone())
            } else {
                None
            }
        })
    }

    pub fn set(&self, key: String, response: CachedResponse) {
        self.inner.write().unwrap().insert(key, response);
    }

    pub fn purge(&self, key: &str) {
        self.inner.write().unwrap().remove(key);
    }

    pub fn ttl_from_headers(headers: &[(String, String)]) -> Option<Duration> {
        for (name, value) in headers {
            if name.to_lowercase() == "cache-control" {
                for part in value.split(',') {
                    let part = part.trim();
                    if let Some(secs) = part.strip_prefix("max-age=") {
                        if let Ok(n) = secs.trim().parse::<u64>() {
                            return Some(Duration::from_secs(n));
                        }
                    }
                }
            }
        }
        None
    }
}
```

### Token bucket rate limiter

**Why not just check a counter in a HashMap?** Same reason as in the OpenResty section — multiple async tasks run concurrently. Without synchronisation, two tasks check the counter simultaneously, both see "9 &lt; 10", both proceed, counter becomes 11. Rust's type system makes this impossible to ignore: a plain `HashMap` is not `Send + Sync`, so the compiler refuses to share it across async tasks. You're forced to use a `Mutex` or an atomic — and the right choice becomes obvious.

```rust
// src/ratelimit.rs — token bucket, thread-safe
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

struct Bucket {
    tokens:      f64,
    last_refill: Instant,
}

pub struct RateLimiter {
    buckets:        Mutex<HashMap<String, Bucket>>,
    capacity:       f64,
    refill_per_sec: f64,
}

impl RateLimiter {
    pub fn new(capacity: f64, refill_per_sec: f64) -> Self {
        Self {
            buckets: Mutex::new(HashMap::new()),
            capacity,
            refill_per_sec,
        }
    }

    pub fn check(&self, key: &str) -> bool {
        let mut map = self.buckets.lock().unwrap();
        let now     = Instant::now();

        let bucket = map.entry(key.to_string()).or_insert(Bucket {
            tokens:      self.capacity,
            last_refill: now,
        });

        let elapsed     = now.duration_since(bucket.last_refill).as_secs_f64();
        bucket.tokens   = (bucket.tokens + elapsed * self.refill_per_sec)
                            .min(self.capacity);
        bucket.last_refill = now;

        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}
```

### OpenResty vs Pingora — side by side

| Concern                      | OpenResty (Lua)                                   | Pingora (Rust)                                               |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| Request phase hook           | `access_by_lua_file path.lua` in nginx.conf       | `async fn request_filter()` method on your struct            |
| Shared state across requests | `lua_shared_dict` (shared memory between workers) | `Arc<Mutex<...>>` or `Arc<RwLock<...>>` on the server struct |
| HTTP client (calling origin) | `resty.http` (non-blocking cosocket)              | Built into Pingora's upstream connection pool                |
| Error handling               | Check `if err then ... end` — easy to forget      | `Result<T>` — compiler forces you to handle errors           |
| Type safety                  | None — a typo creates a silent nil                | Full — wrong type is a compile error                         |
| Disk cache                   | `proxy_cache` built into nginx                    | Implement yourself with `pingora-cache` or write to disk     |
| Config vs code               | Mix of nginx config + Lua files                   | Pure Rust — one language, one toolchain                      |
| Ecosystem maturity           | 10+ years, huge deployment base, many tutorials   | Newer (open-sourced 2024), growing fast                      |
| Learning curve               | nginx config + basic Lua                          | Rust ownership, async/await, trait system                    |

> **Which should you learn first?** Start with OpenResty. The concepts are identical — phases, caching, rate limiting, origin auth — and you'll be productive faster. Once those mental models are solid, Pingora lets you express the same ideas with stronger guarantees. The Rust learning curve is steep but pays off for complex edge logic or any system where correctness is critical.

---

_Further experiments: add WebSocket proxying through OpenResty, try Gcore edge compute (JS at the PoP), add OpenTelemetry tracing from edge to origin, implement cache warming scripts for regional PoPs, benchmark Brotli level 11 vs level 6 for your specific content mix. For Pingora: add TLS termination with `pingora-rustls`, implement a proper LRU disk cache, build a load balancer with health checks._

---

## Interactive Playground

See the concepts move. No setup — everything runs in the browser.

<CdnPlayground />
