---
title: 'Auth, origin, and rate limits'
subtitle: 'WebSocket handshakes look like normal HTTP, which makes them subject to normal HTTP attacks plus a few WebSocket-specific ones. Verify origin, authenticate at the handshake, and rate-limit at every level you can.'
chapter: 8
level: 'intermediate'
readingTime: '12 min'
topics: ['websockets', 'auth', 'origin', 'csrf', 'rate limiting']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A WebSocket connection is a long-lived authenticated channel. The handshake is the only chance to verify the caller's identity and intent before traffic flows for hours. Get the handshake wrong and the rest of your security model is theatre.

This chapter is the security checklist for production WebSocket and SSE servers.

<Callout type="info">

**Real-World Analogy**

Authenticating at the WebSocket handshake is like a bouncer checking your ID when you walk in — not when you buy a ticket online, but at the door, before you're inside.

</Callout>

## The CSWSH attack — why origin matters

If you authenticate WebSocket connections via cookies (session cookies, the natural pattern for first-party browsers), you are vulnerable to **Cross-Site WebSocket Hijacking** without origin verification.

The attack:

1. User logs into `example.com`. A session cookie lands.
2. User visits `attacker.com`.
3. Attacker's JavaScript: `new WebSocket("wss://example.com/ws")`. The browser attaches `example.com`'s cookie.
4. Without origin check, the server accepts. Attacker now has a privileged WebSocket on the user's behalf.

The browser **does** send `Origin: https://attacker.com`. The server **must** reject if the origin is not on its allow-list.

```go
c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
    OriginPatterns: []string{"example.com", "*.example.com"},
})
```

`coder/websocket` checks origin by default; you must set `OriginPatterns` correctly. `gorilla/websocket` requires writing a `CheckOrigin` function (default allows everything — easy to leave wide open by mistake).

For non-browser clients, origin is not sent. Token-only auth (header bearer or query param) is the right path; we cover that next.

<Callout type="warn">

**`OriginPatterns: []string{"*"}` is not a setting. It is a security incident waiting.** Allowing all origins disables the defense entirely. Set the allow-list to your real frontends. If you need flexibility (preview environments, white-labels), pass them as configuration — never hardcode a wildcard.

</Callout>

## Authentication — three patterns

The handshake is HTTP. Authentication looks just like any HTTP request — with one wrinkle: **browsers cannot set custom headers on `new WebSocket(url)`.** Three patterns work around this.

### 1. Cookie-based sessions

For first-party web apps, the cleanest pattern. The browser already has a session cookie from the login flow; the WebSocket inherits it.

```go
func handleWS(w http.ResponseWriter, r *http.Request) {
    sess, err := sessionFromCookie(r)
    if err != nil {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }
    if !sess.Valid() {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }

    c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
        OriginPatterns: []string{"example.com"},
    })
    ...
}
```

Combined with origin verification, this is safe and simple. The cookie identifies the user; origin verification stops cross-site abuse.

Cookie auth requires same-site or carefully-configured cross-site cookies. For pure single-origin apps, defaults work. For subdomains (api.example.com from app.example.com), set cookie `Domain=.example.com` and `SameSite=Lax` or `SameSite=None` + `Secure`.

### 2. Token in query string

For non-browser clients (mobile, agents, desktop apps) that can pass headers, the elegant pattern is `Authorization: Bearer <token>` on the upgrade request. For browsers that cannot, the workaround is a token query parameter:

```js
const token = await getAuthToken();
const ws = new WebSocket(`wss://api.example.com/ws?token=${encodeURIComponent(token)}`);
```

Server reads the query, verifies the token (JWT, opaque token, whatever), upgrades or rejects:

```go
token := r.URL.Query().Get("token")
user, err := verifyToken(token)
if err != nil {
    http.Error(w, "unauthorized", http.StatusUnauthorized)
    return
}
```

The downside of query strings: tokens can land in server access logs, browser history, third-party metrics, referer headers. Mitigate by:

- Using **short-lived tokens** specifically scoped to the WebSocket. Issue a 60-second token from a `/ws-ticket` endpoint, which the client passes here. Even if logged, it expires before useful exfiltration.
- Logging WebSocket upgrades **without query string** in nginx (`log_format` strips it).

### 3. Open handshake, auth as the first message

Accept the handshake, give the client N seconds to send an `auth` message, disconnect if not.

```go
func handleWS(w http.ResponseWriter, r *http.Request) {
    c, _ := websocket.Accept(w, r, &websocket.AcceptOptions{
        OriginPatterns: []string{"example.com"},
    })
    defer c.CloseNow()

    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()

    _, data, err := c.Read(ctx)
    if err != nil {
        c.Close(websocket.StatusPolicyViolation, "auth required")
        return
    }

    user, err := authFromMessage(data)
    if err != nil {
        c.Close(websocket.StatusPolicyViolation, "invalid token")
        return
    }
    // proceed with authenticated session
}
```

This avoids query strings entirely. The downside: every connection costs a TCP+TLS+HTTP+WebSocket handshake before you reject it. For high-volume abuse, this is more expensive than rejecting at the upgrade.

For most apps, query-string tokens with short TTL is the pragmatic answer. Pure first-party browsers can often use cookies. Either is fine; use both inconsistently is not.

## Token-ticket pattern

A nice synthesis: the client makes a normal HTTPS call to `/auth/ws-ticket`, gets back a 60-second-valid token, then connects with that token in the query.

```js
// 1. fetch with normal credentials (cookie, OAuth bearer, etc.)
const { token } = await (await fetch('/auth/ws-ticket')).json();

// 2. open websocket with the short-lived token
const ws = new WebSocket(`wss://api.example.com/ws?ticket=${token}`);
```

Server side, `/auth/ws-ticket` mints a short-lived token (signed JWT or random opaque token in Redis with TTL). The WebSocket handler verifies the token, ensures it's used once (Redis `SET ... NX EX` or single-use JWT), proceeds.

This pattern decouples the WebSocket from your main auth system, makes ticket scope easy to audit, and avoids the long-lived-token-in-query-string risk.

## Authorization — what they can do

Authentication answers "who are you." Authorization answers "what may you do." For WebSockets, three layers.

**1. At the handshake.** Reject if the user is not allowed to use the realtime feature at all (free tier without WebSocket access, banned account).

**2. At room/topic subscription.** When the client sends `{type: "join", room: "engineering"}`, check that the user is a member of `engineering`. Reject the subscription if not.

**3. Per-message.** When the client sends a message with elevated effects (kick someone, edit a message), check the permission again right before acting.

Each layer catches different errors. Auth-only-at-handshake means you never re-check after promotion/demotion. Per-message-only is correct but slow. Both layers, plus periodic re-validation of the session for hours-long connections, is the production answer.

## Rate limiting

WebSocket connections invite three categories of abuse, each needing its own limit.

**1. Per-IP connection rate.** Limit how often the same IP can open a new WebSocket. Stops naive flooding.

```nginx
limit_req_zone $binary_remote_addr zone=ws:10m rate=10r/s;

location /ws {
    limit_req zone=ws burst=20;
    proxy_pass http://app;
    ...
}
```

This caps upgrade attempts; doesn't slow individual messages on a connection.

**2. Per-connection message rate.** A connected client can flood messages. Limit at the application layer:

```go
import "golang.org/x/time/rate"

limiter := rate.NewLimiter(rate.Limit(10), 20) // 10 msg/sec, burst 20

for {
    _, data, err := c.Read(ctx)
    if err != nil {
        return
    }
    if !limiter.Allow() {
        c.Close(websocket.StatusPolicyViolation, "rate limit")
        return
    }
    // handle
}
```

10 messages per second per connection is a reasonable default for chat. Higher for typing indicators, lower for posting messages.

**3. Per-user, per-action.** "User can post 30 chat messages per minute across all their connections." A Redis-based counter per user-action:

```go
ok, _ := rdb.Eval(ctx, `
    local key = KEYS[1]
    local limit = tonumber(ARGV[1])
    local cur = tonumber(redis.call("INCR", key))
    if cur == 1 then redis.call("EXPIRE", key, 60) end
    return cur <= limit
`, []string{"rl:chat:user:42"}, 30).Bool()

if !ok {
    sendError(c, "rate limited")
    return
}
```

This gracefully aggregates across multiple devices (one user, two laptops both posting).

## Connection limits

A motivated attacker opens 100,000 WebSocket connections. Even idle, they consume file descriptors and goroutines. Two layers of defence:

**1. Per-IP cap.** Limit the same IP to N concurrent connections. Track in Redis:

```go
n, _ := rdb.Incr(ctx, "wsconn:ip:" + ip).Result()
rdb.Expire(ctx, "wsconn:ip:" + ip, 1*time.Hour) // safety net for crashes
if n > 100 {
    rdb.Decr(ctx, "wsconn:ip:" + ip)
    http.Error(w, "too many connections", 429)
    return
}
defer rdb.Decr(ctx, "wsconn:ip:" + ip)
```

**2. Global cap.** A simple counter for total active connections; reject if above threshold. Last line of defence before OOM.

The right limits depend on your service. Chat: 5–10 per IP, 50K total. AI agent control: 1–2 per IP, much lower total.

## Input validation

Every WebSocket message is untrusted input. Validate aggressively:

- **Maximum message size.** `coder/websocket`'s `c.SetReadLimit(1024 * 16)` rejects messages larger than 16 KB. Default is 32 KB; lower it to your real maximum.
- **Schema check before processing.** Chapter 4's pattern: parse envelope, switch on `type`, decode `data` into a typed struct, validate each field. No raw `map[string]any` in handlers.
- **Reject unknown types.** A `type` field outside your enum is suspicious — log and disconnect, don't silently ignore.

## DoS via slow handshake

Some attackers open TCP connections, send the bytes for a TLS handshake very slowly, and never finish. Each open handshake holds a goroutine and memory.

Defence: **timeouts on the read of the upgrade request.**

```go
srv := &http.Server{
    Addr:              ":8080",
    Handler:           mux,
    ReadHeaderTimeout: 5 * time.Second,
    IdleTimeout:       2 * time.Minute,
}
```

`ReadHeaderTimeout` is the killer feature for slowloris-style attacks — bounds how long Go waits for the handshake. Always set it.

## Logging — what to capture

Per WebSocket connection, log on connect and disconnect:

```
ws-connect    user=42 ip=10.0.0.5 origin=example.com agent="Mozilla/..."
ws-disconnect user=42 ip=10.0.0.5 dur=37s reason="client gone" code=1006 msgs_in=12 msgs_out=80
```

Per security event, log immediately:

```
ws-auth-fail  ip=10.0.0.5 reason="bad token"
ws-rate-limit user=42 action=chat
ws-banned     ip=10.0.0.5 reason="too many connections"
```

These feed Loki + Grafana for dashboards and alerts. A spike in `ws-auth-fail` from one IP is a brute-force attempt.

## TLS — `wss://` is mandatory in production

Bearer tokens, session cookies, room IDs — none of it is safe over `ws://`. Browsers refuse to connect to `ws://` from `https://` pages anyway. Use `wss://`.

The TLS chapter from the path's **TLS & Certificates** track applies. nginx terminates TLS; the local app speaks `ws://` over loopback. mTLS for service-to-service connections (when your WebSocket server is behind another internal service) follows the same pattern as gRPC chapter 9.

## Recap

- Always check `Origin` in the upgrade. CSWSH is the WebSocket equivalent of CSRF.
- Cookie auth + origin check for first-party browsers; query-string ticket for cross-origin or non-browser clients.
- Ticket pattern: short-lived (60s) tokens minted from a real auth endpoint, single-use.
- Authorize at three layers: handshake, subscription, per-message.
- Rate limit: per-IP connections, per-connection messages, per-user actions.
- Cap connections per IP and globally. Reject early.
- Validate every message — size limits, schema checks, reject unknown types.
- Set `ReadHeaderTimeout` to defend against slow-handshake attacks.
- Log connect/disconnect/security events. Feed monitoring.
- `wss://` only in production. TLS termination at nginx, mTLS internally.

Next: [Backpressure, reconnects, heartbeats](/notes/websockets/09-backpressure) — surviving slow clients and bad networks.
