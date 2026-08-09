---
title: 'Health Checks'
subtitle: 'Active vs passive detection, failure threshold, graceful draining — মৃত backend-গুলোকে rotation-এর বাইরে রাখা।'
chapter: 3
level: 'beginner'
readingTime: '8 মিনিট'
topics: ['health checks', 'HAProxy', 'nginx', 'active', 'passive', 'connection draining']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা আল-ফিহরির একটা বড় কাপড় সেলাইয়ের কারখানা, লম্বা লাইনে সারি সারি কারিগর বসে কাজ করছে। ফাতিমা নিজে supervisor — তার একটাই দায়িত্ব, লাইনটা যেন কখনো থমকে না যায়। প্রতি কয়েক মিনিট পরপর সে লাইন ধরে হেঁটে যায় আর প্রতিটা কারিগরকে জিজ্ঞেস করে, "সব ঠিক আছে? একটা শেষ করা টুকরো দেখাও তো।" কেউ যদি সাড়া দিতে না পারে বা টুকরোটা এগিয়ে দিতে না পারে, ফাতিমা তাকে সঙ্গে সঙ্গে লাইন থেকে সরিয়ে দেয় — তার কাজ বাকিদের মধ্যে ভাগ করে দেয়।

কিন্তু ফাতিমা শুধু জিজ্ঞেস করেই থেমে থাকে না। কাজ করতে করতে সে আসল output-এর দিকেও চোখ রাখে। কোনো একজন কারিগর যদি একের পর এক বাতিল হওয়া, এলোমেলো সেলাই বের করতে থাকে, ফাতিমা কিছু না বলেই চুপচাপ তার কাজটা অন্য কারো হাতে তুলে দেয়। আর যাকে সরিয়ে দেওয়া হয়েছিল সে যখন আবার সুস্থ হয়ে ভালো টুকরো দেখাতে পারে, ফাতিমা তাকে আবার লাইনে ফিরিয়ে আনে।

গল্পটাই আসলে **health check**। ফাতিমা হলো **load balancer**, প্রতিটা কারিগর একটা **backend**। প্রতি কয়েক মিনিটে "সব ঠিক আছে?" জিজ্ঞেস করাটা হলো **active** health check — LB নিজে থেকে একটা health endpoint-এ probe পাঠায়। আর কাজের মধ্যে বাতিল টুকরো খেয়াল করাটা হলো **passive** health check — আসল request ব্যর্থ হচ্ছে দেখে ধরা। যে কারিগর সাড়া দিতে পারে না বা reject বের করে তাকে লাইন থেকে সরানো মানে backend-টাকে **rotation** থেকে বাদ দেওয়া, আর সুস্থ হওয়ার পর ফিরিয়ে আনা মানে আবার rotation-এ যোগ করা। বাস্তবে HAProxy বা nginx ঠিক এই দুটো উপায়েই মৃত backend চিনে সরিয়ে রাখে — active probe ধীর অবনতি ধরে, passive detection হঠাৎ failure ধরে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা হাসপাতালের triage system: একজন নার্স নিয়মিত প্রতিটা room চেক করে দেখে রোগী stable আছে কিনা (active check)। কিন্তু নার্স তখনই সঙ্গে সঙ্গে খেয়াল করে যদি চিকিৎসা চলাকালীন কোনো রোগীর অবস্থা খারাপ হয় (passive detection)। আপনার দুটোই দরকার — নির্ধারিত check ধীর অবনতি ধরে, real-time observation হঠাৎ failure ধরে।

</Callout>

## Passive Health Checks

Passive check live request-এর ফলাফল দেখে failure শনাক্ত করে। কোনো backend error দিলে বা timeout হলে, LB সেটাকে down মার্ক করে।

**nginx:**

```nginx
upstream backend {
    server 10.0.0.10:3000 max_fails=3 fail_timeout=30s;
    server 10.0.0.11:3000 max_fails=3 fail_timeout=30s;
}
```

- `max_fails=3` — `fail_timeout`-এর মধ্যে 3 বার failure হলে server down মার্ক করে
- `fail_timeout=30s` — failure গোনার window এবং retry করার আগে server কতক্ষণ down থাকে

**সীমাবদ্ধতা:** passive check-এর failure ধরতে আসল traffic দরকার। দুই request-এর মাঝখানে যে server down হয়ে যায় সেটা ততক্ষণ ধরা পড়ে না যতক্ষণ না কোনো user সেটাতে hit করে error পায়। User-এর request ব্যর্থ হয়।

## Active Health Checks

LB একটা schedule অনুযায়ী প্রতিটা backend-এ synthetic request পাঠায়, আসল traffic থেকে স্বাধীনভাবে। ব্যর্থ backend-গুলো আসল request পৌঁছানোর আগেই সরিয়ে ফেলা হয়।

**nginx Plus** (commercial) active health check:

```nginx
upstream backend {
    zone backend 64k;
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
}

server {
    location / {
        proxy_pass http://notes;
        health_check interval=10s fails=3 passes=2 uri=/health;
    }
}
```

**HAProxy** (open source-এ active check built-in):

```
backend api_servers
    option httpchk GET /health HTTP/1.1\r\nHost:\ api.internal

    server s1 10.0.0.10:3000 check inter 10s fall 3 rise 2
    server s2 10.0.0.11:3000 check inter 10s fall 3 rise 2
```

Parameter:

- `inter 10s` — প্রতি 10 সেকেন্ডে check
- `fall 3` — টানা 3 বার failure-এর পর down মার্ক
- `rise 2` — টানা 2 বার success-এর পর up মার্ক (flapping প্রতিরোধ করে)

## Health Endpoint

Backend-কে একটা `/health` endpoint expose করতে হবে যেটা LB কল করতে পারে:

```typescript
// Express
app.get('/health', (req, res) => {
	res.status(200).json({ status: 'ok' });
});
```

একটা basic `/health` যেটা সবসময় 200 return করে সেটা শুধু process crash ধরে। কাজের একটা health check server-এর দরকারি dependency-গুলো যাচাই করে:

```typescript
app.get('/health', async (req, res) => {
	try {
		await db.query('SELECT 1');
		await redis.ping();
		res.status(200).json({ status: 'ok', db: 'ok', cache: 'ok' });
	} catch (err) {
		res.status(503).json({ status: 'error', error: err.message });
	}
});
```

503 LB-কে সংকেত দেয় এই server-কে rotation থেকে সরিয়ে ফেলতে। LB JSON parse করে না — সে শুধু HTTP status code দেখে।

**সাবধান:** database down হলে আর সব server 503 দিলে, LB সব backend সরিয়ে ফেলে। এটা সাধারণত সঠিক (app-টা ভাঙা) কিন্তু এর জন্য পরিকল্পনা রাখুন — কিছু team health-কে `liveness`-এ (process কি বেঁচে আছে?) আর `readiness`-এ (এটা কি traffic serve করতে পারে?) ভাগ করে আর LB-কে readiness ব্যবহার করতে configure করে।

```typescript
// /health/live — always 200 while process is up
app.get('/health/live', (req, res) => res.sendStatus(200));

// /health/ready — checks dependencies
app.get('/health/ready', async (req, res) => {
	try {
		await db.query('SELECT 1');
		res.sendStatus(200);
	} catch {
		res.sendStatus(503);
	}
});
```

LB-কে `/health/ready` ব্যবহার করতে configure করুন।

## TCP Health Checks

non-HTTP backend-এর জন্য (database, Redis, custom TCP):

**HAProxy TCP check:**

```
backend postgres
    mode tcp
    option tcp-check
    server db1 10.0.0.10:5432 check
    server db2 10.0.0.11:5432 check
```

HAProxy একটা TCP connection খোলে, সেটা সফল হয় কিনা check করে, আর বন্ধ করে দেয়। কোনো data পাঠায় না — শুধু port খোলা আছে কিনা যাচাই করে।

Redis-এর জন্য, আরও নির্দিষ্ট check ব্যবহার করুন:

```
backend redis
    option tcp-check
    tcp-check connect
    tcp-check send PING\r\n
    tcp-check expect string +PONG
    server redis1 10.0.0.10:6379 check
```

## Connection Draining

কোনো backend যখন down করতে হবে (deploy, scale-in), connection সঙ্গে সঙ্গে kill করবেন না। সেগুলো drain করুন:

1. server-কে "draining" মার্ক করুন — তাতে নতুন request routing বন্ধ করুন
2. বিদ্যমান connection-গুলো শেষ হতে দিন
3. একটা timeout-এর পর, shut down করুন

**HAProxy runtime API:**

```bash
# Mark server for drain (no new connections, finish existing)
echo "set server api_servers/s1 state drain" | \
  socat stdio /var/run/haproxy/admin.sock

# Wait for connections to finish (watch until 0)
watch -n1 "echo 'show servers conn api_servers' | socat stdio /var/run/haproxy/admin.sock"

# When 0: take fully down
echo "set server api_servers/s1 state maint" | \
  socat stdio /var/run/haproxy/admin.sock
```

**nginx graceful shutdown:**

```bash
# Reload nginx config (zero-downtime, existing connections finish)
nginx -s reload

# Or full graceful quit (waits for connections)
nginx -s quit
```

**SIGTERM দিয়ে application-side draining:**

```typescript
process.on('SIGTERM', async () => {
	server.close(async () => {
		// stop accepting new connections
		await db.end(); // close DB pool after in-flight requests complete
		process.exit(0);
	});

	// Force exit after 30s if connections don't drain
	setTimeout(() => process.exit(1), 30_000);
});
```

এটাকে Kubernetes `terminationGracePeriodSeconds: 30` আর একটা `preStop` sleep-এর সাথে জোড়া দিন যাতে SIGTERM আসার আগে LB-কে routing বন্ধ করার সময় দেওয়া যায়:

```yaml
lifecycle:
  preStop:
    exec:
      command: ['sleep', '5'] # give LB time to deregister
terminationGracePeriodSeconds: 35
```

## Flapping Prevention

যে server up আর down-এর মধ্যে দোল খায় (network hiccup, intermittent error) সেটা LB-কে বারবার routing বদলাতে বাধ্য করে। `rise` parameter এটা প্রতিরোধ করে:

```
server s1 10.0.0.10:3000 check fall 3 rise 2
```

- **টানা 3 বার failure**-এর পর down
- **টানা 2 বার success**-এর পরই কেবল আবার up

মানে failure-এর পর একটা মাত্র সফল check সঙ্গে সঙ্গে server restore করবে না — এটাকে stability প্রমাণ করতে হবে।

## Health Check Overhead

প্রতিটা active health check একটা আসল HTTP request। 10-টা backend, প্রতি 5s check, আর 3-টা LB instance নিয়ে: 10 × 12/min × 3 = 360 request/min `/health`-এ যায়। সাধারণত নগণ্য, কিন্তু endpoint-টাকে ভারী check থেকে রক্ষা করুন:

```typescript
app.get('/health', async (req, res) => {
	// Don't run expensive checks on every health probe
	// Cache the result for a few seconds
	const cached = healthCache.get('status');
	if (cached) return res.status(cached.code).json(cached.body);

	// ... actual checks ...
});
```

অথবা প্রথম failure-এর জন্য HAProxy-র `fastinter` আর অন্যথায় স্বাভাবিক `inter` ব্যবহার করুন:

```
server s1 10.0.0.10:3000 check inter 30s fastinter 5s downinter 10s
```

- `inter 30s` — healthy: প্রতি 30s check
- `fastinter 5s` — recovery: server আবার up হওয়ার পর প্রতি 5s check (দ্রুত stability নিশ্চিত করা)
- `downinter 10s` — down: প্রতি 10s check (কখন recover হয় শনাক্ত করতে)
