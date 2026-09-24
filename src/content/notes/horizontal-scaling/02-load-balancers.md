---
title: 'Load Balancers'
subtitle: 'Layer 4 বনাম Layer 7, algorithm, health check, connection draining — একাধিক instance জুড়ে ট্রাফিক বিতরণের কারিগরি।'
chapter: 2
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['load balancer', 'L4', 'L7', 'round robin', 'health checks', 'connection draining']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একাধিক ডাইনিং রুম আছে এমন রেস্তোরাঁর একজন maitre d': তারা সব অতিথিকে একই রুমে হুড়মুড় করে ঢুকতে দেয় না যখন বাকি রুমগুলো খালি পড়ে থাকে। তারা প্রতিটা দলকে একটা খালি জায়গাওয়ালা রুমে পাঠায়, যাচাই করে যে রুমগুলো আসলেই খোলা আছে (health check), এবং যখন একটা রুম বন্ধ করতে হয়, তখন নতুন অতিথি বসানো বন্ধ করে দেয় কিন্তু এখনকার অতিথিদের খাওয়া শেষ করতে দেয় (connection draining)।

</Callout>

## গল্পে বুঝি

শহরের রেলস্টেশনের সামনে একটা টাক্সি-স্ট্যান্ড, আর সেখানে দাঁড়িয়ে আছেন ডিসপ্যাচার খোয়ারিজমি। ট্রেন থেকে নামা যাত্রীরা একটা জায়গাতেই এসে জড়ো হয়, কিন্তু কেউ নিজে থেকে ট্যাক্সি বেছে নেয় না — খোয়ারিজমি প্রতিটা যাত্রীকে হাত দেখিয়ে পরের খালি ট্যাক্সিতে তুলে দেন। কোনো ট্যাক্সি একা বসে থাকে না, আবার একটা ট্যাক্সির ঘাড়েই সব যাত্রীর ভিড় জমে না।

সাধারণ দিনে তিনি সহজভাবেই ভাগ করেন — এক নম্বর গাড়ি, তারপর দুই, তারপর তিন, তারপর আবার এক নম্বর, ঘুরে ঘুরে ক্রম মেনে। কিন্তু ভিড়ের সময় তিনি লক্ষ করেন কোন ট্যাক্সির সামনে সবচেয়ে ছোট লাইন — লম্বা দূরত্বের ভাড়া পাওয়া গাড়িটা ফিরতে দেরি করবে, তাই পরের যাত্রীকে তিনি হালকা-চাপে থাকা গাড়িটায় পাঠান। আবার সিনার গাড়িটার ইঞ্জিন যদি হঠাৎ বিগড়ে যায়, খোয়ারিজমি সঙ্গে সঙ্গে ওই গাড়িতে আর যাত্রী পাঠানো বন্ধ করে দেন — নয়তো যাত্রী গিয়ে আটকে বসে থাকবে। ভিড় বাড়লে ফাতিমা আরও কয়েকটা নতুন ট্যাক্সি স্ট্যান্ডে যোগ করেন, আর একই ডিসপ্যাচার নির্দ্বিধায় সবগুলোর মধ্যে যাত্রী ছড়িয়ে দিতে থাকেন।

এই ডিসপ্যাচারই হলো **load balancer**, প্রতিটা ট্যাক্সি একেকটা **backend** server, আর যাত্রী তুলে দেওয়ার নিয়মটাই algorithm। ঘুরে ঘুরে ক্রম মেনে পাঠানো হলো **round-robin**, আর যে গাড়ির লাইন সবচেয়ে ছোট তাকে পাঠানো হলো **least-connections**। বিগড়ে যাওয়া গাড়িকে বাদ দেওয়াটাই **health check** ফেল করা backend সরিয়ে দেওয়া, আর নতুন ট্যাক্সি যোগ করাটাই horizontal scale। বাস্তবে nginx, HAProxy বা AWS ALB ঠিক এভাবেই কাজ করে — একটা এন্ট্রি-পয়েন্টে ট্রাফিক এসে জমা হয়, load balancer সেটা সুস্থ backend-গুলোর মধ্যে বিলি করে, আর server যোগ করলেই সেই একই load balancer বাড়তি চাপ সামলে নেয়।

## Layer 4 বনাম Layer 7

**Layer 4 (TCP/UDP):** IP address এবং port-এর ভিত্তিতে route করে। দ্রুত, কম overhead, HTTP content সম্পর্কে অন্ধ।

**Layer 7 (HTTP/HTTPS):** HTTP header, URL, cookie, এবং body content-এর ভিত্তিতে route করে। বুদ্ধিমান routing কিন্তু বেশি overhead।

```
L4 Load Balancer:
  client → LB → backend
  LB sees: src IP, dst port
  Can do: TCP connection distribution
  Cannot do: route /api to one cluster, /static to another

L7 Load Balancer:
  client → LB → backend
  LB sees: HTTP method, URL, headers, cookies
  Can do: path-based routing, header insertion, SSL termination, request rewriting
```

বেশিরভাগ production setup L7 ব্যবহার করে। nginx, HAProxy, AWS ALB, এবং Traefik সবই L7। AWS NLB হলো L4।

**কখন L4 ব্যবহার করবেন:**

- Non-HTTP protocol (raw TCP mode-এ gRPC, database proxy)
- চরম performance-এর প্রয়োজন (1M+ connection/second)
- যখন TLS termination-এর মধ্য দিয়ে client IP সংরক্ষণ করা দরকার

## Algorithm

**Round Robin** — request-গুলো ক্রমানুসারে backend-দের মধ্যে বিতরণ করে। সহজ, ভালো কাজ করে যখন request-গুলোর খরচ প্রায় একই রকম।

```nginx
upstream backend {
    server backend-1:3000;
    server backend-2:3000;
    server backend-3:3000;
    # default: round robin — 1→2→3→1→2→3...
}
```

**Least Connections** — সবচেয়ে কম active connection আছে এমন backend-এ পাঠায়। request duration-এ বড় তারতম্য থাকলে ভালো (কিছু request নেয় 10ms, কিছু নেয় 5s)।

```nginx
upstream backend {
    least_conn;
    server backend-1:3000;
    server backend-2:3000;
}
```

**Weighted Round Robin** — বেশি ক্ষমতাসম্পন্ন instance-এ আনুপাতিকভাবে বেশি ট্রাফিক পাঠায়। instance-গুলোর hardware spec আলাদা হলে কাজে লাগে।

```nginx
upstream backend {
    server backend-1:3000 weight=3;  # gets 75% of traffic
    server backend-2:3000 weight=1;  # gets 25% of traffic
}
```

**IP Hash** — একই client IP-কে একই backend-এ route করে। নরম session affinity দেয় (stateful অ্যাপের সমাধান হিসেবে সুপারিশ করা হয় না — আগের চ্যাপ্টার দেখুন)।

```nginx
upstream backend {
    ip_hash;
    server backend-1:3000;
    server backend-2:3000;
}
```

**Random** — এলোমেলোভাবে একটা backend বেছে নেয়। বড় স্কেলে round robin-এর পরিসংখ্যানগতভাবে সমতুল্য, কিন্তু বাস্তবায়ন সহজ এবং load balancer instance-গুলোর মধ্যে state সমন্বয় করা এড়ায়।

## Health Checks

Load balancer-কে অবশ্যই স্বয়ংক্রিয়ভাবে unhealthy backend-এ ট্রাফিক পাঠানো বন্ধ করতে হবে।

**Passive health check** (সব open-source nginx) — N বার পরপর ব্যর্থ হলে একটা backend-কে unhealthy চিহ্নিত করে:

```nginx
upstream backend {
    server backend-1:3000 max_fails=3 fail_timeout=30s;
    # After 3 failures within 30s: backend removed
    # After 30s with no requests: re-included and checked again
}
```

**Active health check** (nginx Plus, HAProxy, Traefik) — সক্রিয়ভাবে backend-দের probe করে:

```nginx
# nginx Plus
upstream backend {
    zone backend 64k;
    server backend-1:3000;
    server backend-2:3000;
    health_check interval=5s fails=2 passes=2 uri=/health;
    # Every 5s: probe /health
    # 2 consecutive failures → mark unhealthy
    # 2 consecutive passes → mark healthy again
}
```

```yaml
# Traefik health check
services:
  api:
    labels:
      - 'traefik.http.services.api.loadbalancer.healthcheck.path=/health'
      - 'traefik.http.services.api.loadbalancer.healthcheck.interval=10s'
      - 'traefik.http.services.api.loadbalancer.healthcheck.timeout=3s'
```

**Backend /health endpoint:**

```typescript
app.get('/health', async (req, res) => {
	try {
		await Promise.all([
			db.query('SELECT 1'), // database reachable
			redis.ping() // cache reachable
		]);
		res.json({ status: 'ok', uptime: process.uptime() });
	} catch (err) {
		// Return 503 — load balancer will remove this instance
		res.status(503).json({ status: 'degraded', error: String(err) });
	}
});
```

আপনার health check-কে এমনভাবে ডিজাইন করুন যাতে এটা আসল readiness প্রতিফলিত করে। যে instance চালু আছে কিন্তু ডেটাবেসে পৌঁছাতে পারছে না, সেটার ট্রাফিক পাওয়া উচিত নয়।

## Connection Draining

যখন আপনি একটা backend সরান (deploy, scale down), তখন চলমান request-গুলোকে শেষ হতে হবে। Connection draining (বা "deregistration delay") backend-টাকে একটা "draining" অবস্থায় ধরে রাখে: কোনো নতুন connection পাঠানো হয় না, বিদ্যমান connection-গুলোকে শেষ হতে দেওয়া হয়।

```
Normal:   [request] → backend
Drain:    [request] → (rejected from this backend) → other backends
          [in-flight] → still running on draining backend → completes → backend removed
```

**AWS ALB deregistration delay:**

```bash
# Set draining timeout (default: 300s)
aws elbv2 modify-target-group-attributes \
  --target-group-arn arn:aws:elasticloadbalancing:... \
  --attributes Key=deregistration_delay.timeout_seconds,Value=30
```

**Application-side: graceful shutdown-কে drain timeout-এর সাথে মিলতে হবে:**

```typescript
// SIGTERM: stop accepting new requests, finish existing ones
process.on('SIGTERM', async () => {
	server.close(async () => {
		// All in-flight requests completed
		await db.end();
		await redis.quit();
		process.exit(0);
	});

	// Timeout: force exit if requests don't drain in time
	setTimeout(() => {
		console.error('Drain timeout, forcing exit');
		process.exit(1);
	}, 25_000); // 25s < ALB's 30s drain window
});
```

## SSL Termination

Load balancer TLS সামলায় — backend-গুলো internal network-এ plain HTTP-তে যোগাযোগ করে।

```nginx
server {
    listen 443 ssl;
    ssl_certificate     /etc/ssl/certs/myapp.crt;
    ssl_certificate_key /etc/ssl/private/myapp.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    location / {
        proxy_pass http://notes;  # plain HTTP to backend
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header Host $host;
    }
}

server {
    listen 80;
    return 301 https://$host$request_uri;  # redirect HTTP to HTTPS
}
```

**Client IP সংরক্ষণ:** SSL termination-এর পর, backend-গুলো load balancer-এর IP দেখে, client-এর নয়। `X-Forwarded-For` header ব্যবহার করুন:

```typescript
app.set('trust proxy', 1); // trust first proxy (the load balancer)

app.get('/log', (req, res) => {
	const clientIp = req.ip; // reads X-Forwarded-For when trust proxy is set
});
```

## Load Balancer হিসেবে nginx — সম্পূর্ণ Config

```nginx
upstream api_servers {
    least_conn;
    server 10.0.1.10:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;  # reuse connections to backends
}

server {
    listen 443 ssl http2;
    server_name api.myapp.com;

    ssl_certificate     /etc/ssl/certs/myapp.crt;
    ssl_certificate_key /etc/ssl/private/myapp.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Timeouts
    proxy_connect_timeout 2s;
    proxy_send_timeout    10s;
    proxy_read_timeout    30s;

    location /health {
        access_log off;   # don't log health check spam
        proxy_pass http://api_servers;
    }

    location / {
        proxy_pass http://api_servers;
        proxy_http_version 1.1;
        proxy_set_header Connection "";          # for keepalive
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;
    }
}
```

## Load Balancer High Availability

একটা মাত্র load balancer হলো একটা single point of failure। সমাধান:

**Active-passive LB pair (প্রথাগত):**

```
Primary LB → active, handles traffic
Backup LB  → passive, monitors primary via heartbeat
If primary fails: backup takes over virtual IP (Keepalived/VRRP)
```

**DNS-based multi-LB:**

```
api.myapp.com → LB-1 (us-east-1a)
             → LB-2 (us-east-1b)
Route53 health checks remove failed LBs automatically
```

**Managed load balancer** (AWS ALB, GCP Load Balancing, Cloudflare) নিজেদের HA ভেতরে ভেতরেই সামলায় — বেশিরভাগ টিমের জন্য সঠিক পছন্দ। যখন একটা managed service আপনার হয়ে কাজটা করে দেয়, তখন নিজে LB HA বানাবেন না।
