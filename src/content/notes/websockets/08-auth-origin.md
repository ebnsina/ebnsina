---
title: 'Auth, origin, আর rate limits'
subtitle: 'WebSocket handshake সাধারণ HTTP-র মতো দেখায়, যা এদের সাধারণ HTTP আক্রমণ plus কয়েকটা WebSocket-নির্দিষ্ট আক্রমণের শিকার করে। origin verify করুন, handshake-এ authenticate করুন, আর যত level পারেন সব level-এ rate-limit করুন।'
chapter: 8
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['websockets', 'auth', 'origin', 'csrf', 'rate limiting']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বুখারার একটা members-only ক্লাব। সিনা সদস্য, আজ ভেতরে ঢুকতে চান। দরজায় দাঁড়ানো দারোয়ান খোয়ারিজমি ঠিক ঢোকার মুহূর্তেই তাঁর সদস্যপত্রটা দেখে নেয় — কেউ বাইরে থেকে অনলাইনে টিকিট কেটেছে কিনা তাতে কিছু যায় আসে না, আসল যাচাইটা হয় ওই দরজাতেই, ভেতরে পা রাখার আগে। পত্র ঠিক থাকলে দরজা খোলে, আর একবার ঢুকে গেলে সেই দরজা পুরো সন্ধ্যার জন্য খোলা থাকে — বারবার আর পত্র দেখাতে হয় না।

কিন্তু খোয়ারিজমি দুটো জিনিস কড়াভাবে দেখে। এক, নিমন্ত্রণপত্রটা কোন ভবন থেকে এসেছে — যদি দেখে সেটা রাস্তার ওপারের কোনো অচেনা, সন্দেহজনক ঠিকানা থেকে পাঠানো, তাহলে পত্র যত সুন্দরই হোক, সে ঢুকতে দেয় না। দুই, ভেতরে ঢোকার পর ফাতিমা যতই উৎসাহী সদস্য হোন, তিনি একটানা চিৎকার করে স্টাফদের কাছে অনুরোধের পর অনুরোধ ছুড়তে পারেন না — দারোয়ান একটা সীমা বেঁধে দেয়, যাতে একজন হইচইপ্রবণ সদস্য গোটা স্টাফকে নাকাল করে না ফেলে।

এই দরজাই WebSocket security-র গল্প। ঢোকার মুহূর্তে সদস্যপত্র যাচাই করা হলো connection তৈরি হওয়ার সময়েই **authenticate on connect** (token বা session দিয়ে) — পরে নয়, ঠিক handshake-এ। নিমন্ত্রণ কোন ভবন থেকে এসেছে তা মিলিয়ে দেখা হলো **Origin header check** — অচেনা site থেকে আসা cross-site connection reject করা। আর একটানা চিৎকারে সীমা বেঁধে দেওয়াটাই per-connection **message rate limiting** — একটা connected client যেন message flood করে server কে বসিয়ে না দেয়। বাস্তবে ঠিক এভাবেই production WebSocket server চলে: হ্যান্ডশেকেই user যাচাই, `Origin` allow-list দিয়ে CSWSH ঠেকানো, আর প্রতি connection-এ সেকেন্ডে কয়টা message নেওয়া হবে তার rate limit — তিনটাই একসাথে না থাকলে দরজা আসলে খোলা।

একটা WebSocket connection হলো একটা long-lived authenticated channel। handshake হলো traffic ঘণ্টার পর ঘণ্টা বইবার আগে caller-এর identity আর intent verify করার একমাত্র সুযোগ। handshake ভুল করুন আর আপনার বাকি security model নাটক।

এই চ্যাপ্টার production WebSocket আর SSE server-এর জন্য security checklist।

<Callout type="info">

**বাস্তব উদাহরণ**

WebSocket handshake-এ authenticate করা হলো একজন bouncer-এর মতো যে আপনি ভেতরে ঢোকার সময় আপনার ID check করে — online টিকিট কেনার সময় নয়, বরং দরজায়, ভেতরে ঢোকার আগে।

</Callout>

## CSWSH আক্রমণ — origin কেন গুরুত্বপূর্ণ

আপনি যদি cookie-র মাধ্যমে WebSocket connection authenticate করেন (session cookie, first-party browser-এর স্বাভাবিক প্যাটার্ন), origin verification ছাড়া আপনি **Cross-Site WebSocket Hijacking**-এর শিকার।

আক্রমণ:

1. User `example.com`-এ log in করে। একটা session cookie ল্যান্ড করে।
2. User `attacker.com` visit করে।
3. Attacker-এর JavaScript: `new WebSocket("wss://example.com/ws")`। browser `example.com`-এর cookie attach করে।
4. origin check ছাড়া, server accept করে। Attacker-এর কাছে এখন user-এর হয়ে একটা privileged WebSocket।

browser **আসলে** `Origin: https://attacker.com` পাঠায়। server-কে **অবশ্যই** reject করতে হবে যদি origin তার allow-list-এ না থাকে।

```go
c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
    OriginPatterns: []string{"example.com", "*.example.com"},
})
```

`coder/websocket` default অনুযায়ী origin check করে; আপনাকে `OriginPatterns` সঠিকভাবে set করতে হবে। `gorilla/websocket`-এ একটা `CheckOrigin` function লিখতে হয় (default সব অনুমতি দেয় — ভুল করে wide open রেখে দেওয়া সহজ)।

non-browser client-এর জন্য, origin পাঠানো হয় না। Token-only auth (header bearer বা query param) হলো সঠিক পথ; আমরা এরপর সেটা cover করি।

<Callout type="warn">

**`OriginPatterns: []string{"*"}` একটা setting নয়। এটা অপেক্ষমাণ একটা security incident।** সব origin অনুমতি দেওয়া defense পুরোপুরি অক্ষম করে। allow-list আপনার আসল frontend-এ set করুন। flexibility দরকার হলে (preview environment, white-label), সেগুলো configuration হিসেবে pass করুন — কখনো একটা wildcard hardcode করবেন না।

</Callout>

## Authentication — তিনটা প্যাটার্ন

handshake হলো HTTP। Authentication যেকোনো HTTP request-এর মতোই দেখায় — একটা প্যাঁচ সহ: **browser `new WebSocket(url)`-এ custom header set করতে পারে না।** তিনটা প্যাটার্ন এর চারপাশে কাজ করে।

### 1. Cookie-based session

first-party web app-এর জন্য, সবচেয়ে পরিষ্কার প্যাটার্ন। login flow থেকে browser-এর ইতিমধ্যে একটা session cookie আছে; WebSocket সেটা উত্তরাধিকার সূত্রে পায়।

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

origin verification-এর সাথে মিলিত, এটা নিরাপদ আর সহজ। cookie user-কে identify করে; origin verification cross-site অপব্যবহার থামায়।

Cookie auth same-site বা সাবধানে-configured cross-site cookie দাবি করে। pure single-origin app-এর জন্য, default কাজ করে। subdomain-এর জন্য (app.example.com থেকে api.example.com), cookie `Domain=.example.com` আর `SameSite=Lax` বা `SameSite=None` + `Secure` set করুন।

### 2. Query string-এ token

non-browser client-এর (mobile, agent, desktop app) জন্য যারা header pass করতে পারে, elegant প্যাটার্ন হলো upgrade request-এ `Authorization: Bearer <token>`। যে browser পারে না তাদের জন্য, workaround হলো একটা token query parameter:

```js
const token = await getAuthToken();
const ws = new WebSocket(`wss://api.example.com/ws?token=${encodeURIComponent(token)}`);
```

server query পড়ে, token verify করে (JWT, opaque token, যা-ই হোক), upgrade বা reject করে:

```go
token := r.URL.Query().Get("token")
user, err := verifyToken(token)
if err != nil {
    http.Error(w, "unauthorized", http.StatusUnauthorized)
    return
}
```

query string-এর অসুবিধা: token server access log, browser history, third-party metrics, referer header-এ ল্যান্ড করতে পারে। এভাবে প্রশমিত করুন:

- WebSocket-এ বিশেষভাবে scoped **short-lived token** ব্যবহার করে। একটা `/ws-ticket` endpoint থেকে একটা 60-সেকেন্ড token issue করুন, যা client এখানে pass করে। logged হলেও, দরকারি exfiltration-এর আগে এটা expire হয়।
- nginx-এ **query string ছাড়া** WebSocket upgrade log করুন (`log_format` এটা strip করে)।

### 3. Open handshake, প্রথম message হিসেবে auth

handshake accept করুন, client-কে একটা `auth` message পাঠাতে N সেকেন্ড দিন, না দিলে disconnect করুন।

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

এটা query string পুরোপুরি এড়ায়। অসুবিধা: reject করার আগে প্রতিটা connection একটা TCP+TLS+HTTP+WebSocket handshake-এর খরচ নেয়। high-volume অপব্যবহারের জন্য, এটা upgrade-এ reject করার চেয়ে বেশি ব্যয়বহুল।

বেশিরভাগ app-এর জন্য, short TTL সহ query-string token হলো pragmatic উত্তর। pure first-party browser প্রায়ই cookie ব্যবহার করতে পারে। দুটোই ঠিক আছে; দুটো অসামঞ্জস্যপূর্ণভাবে ব্যবহার করা ঠিক নয়।

## Token-ticket প্যাটার্ন

একটা সুন্দর সংশ্লেষণ: client `/auth/ws-ticket`-এ একটা সাধারণ HTTPS call করে, একটা 60-সেকেন্ড-valid token ফেরত পায়, তারপর query-তে সেই token সহ connect করে।

```js
// 1. fetch with normal credentials (cookie, OAuth bearer, etc.)
const { token } = await (await fetch('/auth/ws-ticket')).json();

// 2. open websocket with the short-lived token
const ws = new WebSocket(`wss://api.example.com/ws?ticket=${token}`);
```

Server side-এ, `/auth/ws-ticket` একটা short-lived token mint করে (signed JWT বা TTL সহ Redis-এ random opaque token)। WebSocket handler token verify করে, নিশ্চিত করে এটা একবার ব্যবহৃত (Redis `SET ... NX EX` বা single-use JWT), এগিয়ে যায়।

এই প্যাটার্ন WebSocket-কে আপনার main auth system থেকে decouple করে, ticket scope audit করা সহজ করে, আর long-lived-token-in-query-string ঝুঁকি এড়ায়।

## Authorization — তারা কী করতে পারে

Authentication উত্তর দেয় "আপনি কে"। Authorization উত্তর দেয় "আপনি কী করতে পারেন"। WebSockets-এর জন্য, তিন layer।

**1. handshake-এ।** reject করুন যদি user realtime feature আদৌ ব্যবহার করার অনুমতি না পায় (WebSocket access ছাড়া free tier, banned account)।

**2. room/topic subscription-এ।** client যখন `{type: "join", room: "engineering"}` পাঠায়, check করুন user `engineering`-এর member কিনা। না হলে subscription reject করুন।

**3. Per-message।** client যখন elevated effect সহ একটা message পাঠায় (কাউকে kick করা, একটা message edit করা), act করার ঠিক আগে permission আবার check করুন।

প্রতিটা layer আলাদা error ধরে। Auth-only-at-handshake মানে promotion/demotion-এর পর আপনি কখনো re-check করেন না। Per-message-only সঠিক কিন্তু slow। দুটো layer, plus ঘণ্টা-দীর্ঘ connection-এর জন্য session-এর periodic re-validation, হলো production উত্তর।

## Rate limiting

WebSocket connection তিন ক্যাটাগরির অপব্যবহার আমন্ত্রণ করে, প্রতিটার নিজের limit দরকার।

**1. Per-IP connection rate.** একই IP কত ঘন ঘন একটা নতুন WebSocket খুলতে পারে তা limit করুন। naive flooding থামায়।

```nginx
limit_req_zone $binary_remote_addr zone=ws:10m rate=10r/s;

location /ws {
    limit_req zone=ws burst=20;
    proxy_pass http://app;
    ...
}
```

এটা upgrade attempt cap করে; একটা connection-এ individual message slow করে না।

**2. Per-connection message rate.** একটা connected client message flood করতে পারে। application layer-এ limit করুন:

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

প্রতি connection-এ প্রতি সেকেন্ডে 10 message chat-এর জন্য একটা যুক্তিসঙ্গত default। typing indicator-এর জন্য বেশি, message post করার জন্য কম।

**3. Per-user, per-action।** "User সব connection জুড়ে প্রতি মিনিটে 30টা chat message post করতে পারে।" প্রতি user-action-এ একটা Redis-based counter:

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

এটা একাধিক device জুড়ে gracefully aggregate করে (এক user, দুই laptop দুটোই post করছে)।

## Connection limit

একজন motivated attacker 100,000 WebSocket connection খোলে। idle থাকলেও, তারা file descriptor আর goroutine খরচ করে। দুই layer defence:

**1. Per-IP cap.** একই IP-কে N concurrent connection-এ limit করুন। Redis-এ track করুন:

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

**2. Global cap.** মোট active connection-এর জন্য একটা সাধারণ counter; threshold-এর উপরে হলে reject করুন। OOM-এর আগে শেষ প্রতিরক্ষা লাইন।

সঠিক limit আপনার service-এর উপর নির্ভর করে। Chat: প্রতি IP-তে 5–10, মোট 50K। AI agent control: প্রতি IP-তে 1–2, অনেক কম মোট।

## Input validation

প্রতিটা WebSocket message untrusted input। আক্রমণাত্মকভাবে validate করুন:

- **Maximum message size.** `coder/websocket`-এর `c.SetReadLimit(1024 * 16)` 16 KB-এর বড় message reject করে। Default 32 KB; এটা আপনার আসল maximum-এ নামান।
- **Process করার আগে schema check।** চ্যাপ্টার 4-এর প্যাটার্ন: envelope parse করুন, `type`-এ switch করুন, `data`-কে একটা typed struct-এ decode করুন, প্রতিটা field validate করুন। Handler-এ কোনো raw `map[string]any` নয়।
- **Unknown type reject করুন।** আপনার enum-এর বাইরে একটা `type` field সন্দেহজনক — log আর disconnect করুন, চুপচাপ উপেক্ষা করবেন না।

## Slow handshake-এর মাধ্যমে DoS

কিছু attacker TCP connection খোলে, একটা TLS handshake-এর byte খুব ধীরে পাঠায়, আর কখনো শেষ করে না। প্রতিটা open handshake একটা goroutine আর memory ধরে রাখে।

Defence: **upgrade request-এর read-এ timeout।**

```go
srv := &http.Server{
    Addr:              ":8080",
    Handler:           mux,
    ReadHeaderTimeout: 5 * time.Second,
    IdleTimeout:       2 * time.Minute,
}
```

`ReadHeaderTimeout` হলো slowloris-style আক্রমণের জন্য killer feature — Go handshake-এর জন্য কতক্ষণ অপেক্ষা করে তা bound করে। সবসময় set করুন।

## Logging — কী capture করবেন

প্রতি WebSocket connection-এ, connect আর disconnect-এ log করুন:

```
ws-connect    user=42 ip=10.0.0.5 origin=example.com agent="Mozilla/..."
ws-disconnect user=42 ip=10.0.0.5 dur=37s reason="client gone" code=1006 msgs_in=12 msgs_out=80
```

প্রতি security event-এ, সাথে সাথে log করুন:

```
ws-auth-fail  ip=10.0.0.5 reason="bad token"
ws-rate-limit user=42 action=chat
ws-banned     ip=10.0.0.5 reason="too many connections"
```

এগুলো dashboard আর alert-এর জন্য Loki + Grafana-তে feed করে। এক IP থেকে `ws-auth-fail`-এর একটা spike একটা brute-force প্রচেষ্টা।

## TLS — production-এ `wss://` বাধ্যতামূলক

Bearer token, session cookie, room ID — কোনোটাই `ws://`-এ নিরাপদ নয়। Browser এমনিতেই `https://` page থেকে `ws://`-এ connect করতে অস্বীকার করে। `wss://` ব্যবহার করুন।

path-এর **TLS & Certificates** ট্র্যাকের TLS চ্যাপ্টার এখানে প্রযোজ্য। nginx TLS terminate করে; local app loopback-এ `ws://` বলে। service-to-service connection-এর জন্য mTLS (যখন আপনার WebSocket server আরেকটা internal service-এর পেছনে) gRPC চ্যাপ্টার 9-এর মতোই একই প্যাটার্ন অনুসরণ করে।

## Recap

- upgrade-এ সবসময় `Origin` check করুন। CSWSH হলো CSRF-এর WebSocket সমতুল্য।
- first-party browser-এর জন্য Cookie auth + origin check; cross-origin বা non-browser client-এর জন্য query-string ticket।
- Ticket প্যাটার্ন: একটা real auth endpoint থেকে mint করা short-lived (60s) token, single-use।
- তিন layer-এ authorize করুন: handshake, subscription, per-message।
- Rate limit: per-IP connection, per-connection message, per-user action।
- প্রতি IP আর globally connection cap করুন। আগেই reject করুন।
- প্রতিটা message validate করুন — size limit, schema check, unknown type reject।
- slow-handshake আক্রমণ থেকে রক্ষা করতে `ReadHeaderTimeout` set করুন।
- connect/disconnect/security event log করুন। monitoring-এ feed করুন।
- production-এ শুধু `wss://`। nginx-এ TLS termination, internally mTLS।

পরবর্তী: [Backpressure, reconnects, heartbeats](/notes/websockets/09-backpressure) — slow client আর খারাপ network-এ টিকে থাকা।
