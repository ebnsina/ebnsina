---
title: 'Routing & Load Balancing'
subtitle: 'Path matching, header-based routing, weighted split আর health-aware balancing — gateway কীভাবে ঠিক করে প্রতিটা request কোথায় যাবে।'
chapter: 2
level: 'beginner'
readingTime: '13 মিনিট'
topics: ['routing', 'load balancing', 'weighted traffic', 'health checks', 'nginx']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা ব্যস্ত মোড়ের traffic management সিস্টেম — এটা প্রতিটা গাড়ির গন্তব্য পড়ে (URL, header), জানে কোন রাস্তাগুলো ফাঁকা (healthy backend), আর সেই অনুযায়ী প্রতিটা গাড়িকে পাঠায়। কোনো রাস্তা বন্ধ থাকলে (unhealthy instance) সে সেদিকে গাড়ি পাঠানো বন্ধ করে দেয়, কাউকে হাতে করে traffic ঘোরাতে হয় না।

</Callout>

## গল্পে বুঝি

ফাতিমা একটা বড় অফিসের switchboard operator। সারাদিন বাইরে থেকে ফোন আসে, আর প্রতিটা কল সামলাতে তাকে দুটো ধাপ পার করতে হয়। প্রথমে সে শোনে কলার আসলে কী চায় — কেউ বলে "বিল নিয়ে ঝামেলা", কেউ বলে "প্রোডাক্ট কাজ করছে না"। সেই কথা শুনেই সে ঠিক করে কলটা কোন ডিপার্টমেন্টে যাবে — billing হলে billing ডেস্কে, সমস্যা হলে support ডেস্কে। ভুল ডিপার্টমেন্টে দিলে কলার ঘুরপাক খাবে, তাই এই বাছাইটা সে খুব মন দিয়ে করে।

কিন্তু বাছাই করেই কাজ শেষ না। ধরুন support ডিপার্টমেন্টে সিনা, খোয়ারিজমি সহ চারজন এজেন্ট বসে আছে। ফাতিমা তো যেকোনো একজনকে দিতে পারে না — কেউ হয়তো আগের কলে ব্যস্ত। তাই সে বোর্ডের বাতি দেখে বোঝে এই মুহূর্তে কে ফ্রি, আর কলটা সেই ফ্রি এজেন্টের লাইনে জুড়ে দেয়। কোনো এজেন্ট ছুটিতে থাকলে বা লাইন কেটে গেলে সে তাকে বাদ দিয়ে বাকিদের মধ্যে ভাগ করে দেয়।

ফাতিমার এই দুই ধাপই আসলে একটা gateway-র কাজ। কলার কী চায় শুনে কোন ডিপার্টমেন্টে পাঠাবে ঠিক করা — এটাই **routing**: path বা host দেখে gateway ঠিক করে request কোন service-এ যাবে (billing ডেস্ক = billing service, support ডেস্ক = support service)। আর ডিপার্টমেন্টের ভেতর কোন ফ্রি এজেন্টকে দেবে সেটা বেছে নেওয়া — এটাই **load balancing**: একই service-এর কয়েকটা healthy instance-এর মধ্যে request ভাগ করে দেওয়া। বাস্তবে nginx বা Traefik-এর মতো gateway ঠিক এভাবেই কাজ করে — আগে path দেখে সঠিক service বাছে, তারপর সেই service-এর একাধিক instance-এর মধ্যে round-robin বা least-connections দিয়ে traffic ছড়িয়ে দেয়, আর কোনো instance unhealthy হলে তাকে বাদ দিয়ে দেয়।

## Path-Based Routing

সবচেয়ে সাধারণ প্যাটার্ন। URL prefix অনুযায়ী একটা backend সার্ভিসে route করা।

**nginx:**

```nginx
upstream user_service {
    server user-service-1:3001;
    server user-service-2:3001;
}

upstream order_service {
    server order-service-1:3002;
}

server {
    listen 443 ssl;

    location /api/users/ {
        proxy_pass http://user_service/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/orders/ {
        proxy_pass http://order_service/;
        proxy_set_header Host $host;
    }

    location /api/products/ {
        proxy_pass http://product_service/;
    }
}
```

**Traefik (docker-compose label):**

```yaml
services:
  user-service:
    image: user-service:latest
    labels:
      - 'traefik.http.routers.users.rule=PathPrefix(`/api/users`)'
      - 'traefik.http.services.users.loadbalancer.server.port=3001'

  order-service:
    image: order-service:latest
    labels:
      - 'traefik.http.routers.orders.rule=PathPrefix(`/api/orders`)'
      - 'traefik.http.services.orders.loadbalancer.server.port=3002'
```

## Header-Based Routing

request header অনুযায়ী route করা — versioning, A/B test, বা tenant routing-এর জন্য কাজে লাগে।

```nginx
# Route by API version header
map $http_x_api_version $backend {
    "v2"     "http://api-v2:3000";
    default  "http://api-v1:3000";
}

server {
    location /api/ {
        proxy_pass $backend;
    }
}
```

```typescript
// Kong plugin or custom middleware: route by tenant
function tenantRouter(req: Request): string {
	const tenantId = req.headers['x-tenant-id'];

	// Enterprise tenants get dedicated instances
	if (enterpriseTenants.has(tenantId)) {
		return `http://enterprise-cluster-${tenantId}:3000`;
	}

	return 'http://shared-cluster:3000';
}
```

## Load Balancing Algorithm

একবার একটা route ম্যাচ হলে, gateway ঠিক করে কোন backend instance request-টা সামলাবে।

**Round robin** — request সমানভাবে ভাগ হয়, একটা করে:

```nginx
upstream backend {
    server backend-1:3000;
    server backend-2:3000;
    server backend-3:3000;
    # default: round-robin
}
```

**Least connections** — যে instance-এ সবচেয়ে কম active request আছে সেখানে পাঠানো। request-এর সময়কাল আলাদা আলাদা হলে এটা ভালো:

```nginx
upstream backend {
    least_conn;
    server backend-1:3000;
    server backend-2:3000;
    server backend-3:3000;
}
```

**IP hash** — একই client সবসময় একই backend-এ যায় (session affinity):

```nginx
upstream backend {
    ip_hash;
    server backend-1:3000;
    server backend-2:3000;
}
```

**Weighted** — বেশি capacity-র instance-এ বেশি traffic পাঠানো:

```nginx
upstream backend {
    server backend-1:3000 weight=3;  # 3x traffic
    server backend-2:3000 weight=1;
}
```

## Health Checks

gateway-কে অবশ্যই unhealthy backend-এ traffic পাঠানো নিজে থেকেই বন্ধ করতে হবে।

**Passive health check** (nginx-এ default) — N বার পরপর failure হলে একটা backend-কে unhealthy চিহ্নিত করা:

```nginx
upstream backend {
    server backend-1:3000 max_fails=3 fail_timeout=30s;
    server backend-2:3000 max_fails=3 fail_timeout=30s;
}
```

**Active health check** (nginx Plus / open-source বিকল্প):

```nginx
# nginx Plus
upstream backend {
    zone backend 64k;
    server backend-1:3000;
    server backend-2:3000;

    health_check interval=5s fails=2 passes=2 uri=/health;
}
```

**Traefik health check:**

```yaml
services:
  api:
    labels:
      - 'traefik.http.services.api.loadbalancer.healthcheck.path=/health'
      - 'traefik.http.services.api.loadbalancer.healthcheck.interval=10s'
      - 'traefik.http.services.api.loadbalancer.healthcheck.timeout=3s'
```

আপনার backend-এর `/health` endpoint-এর উচিত নিজের dependency-গুলো যাচাই করা:

```typescript
app.get('/health', async (req, res) => {
	try {
		await db.query('SELECT 1'); // verify DB connection
		await redis.ping(); // verify cache connection
		res.json({ status: 'ok' });
	} catch (err) {
		res.status(503).json({ status: 'degraded', error: err.message });
	}
});
```

## Weighted Traffic Split (Canary Deploy)

পুরো rollout-এর আগে নতুন version-এ traffic-এর একটা ছোট শতাংশ পাঠানো:

```nginx
upstream stable {
    server api-v1-1:3000;
    server api-v1-2:3000;
}

upstream canary {
    server api-v2-1:3000;
}

# Split: 95% stable, 5% canary
split_clients "${remote_addr}${request_uri}" $backend_pool {
    5%   canary;
    *    stable;
}

server {
    location /api/ {
        proxy_pass http://$backend_pool;
    }
}
```

**Kong / Traefik weighted service:**

```yaml
# Traefik weighted round-robin
http:
  services:
    weighted:
      weighted:
        services:
          - name: stable
            weight: 95
          - name: canary
            weight: 5
```

## Timeout

প্রতিটা route-এর explicit timeout থাকা উচিত। এগুলো ছাড়া একটা ধীর backend অনির্দিষ্টকাল ধরে connection আটকে রাখে:

```nginx
location /api/ {
    proxy_pass http://notes;

    proxy_connect_timeout 2s;    # time to establish connection
    proxy_send_timeout    10s;   # time to send request
    proxy_read_timeout    30s;   # time to receive response

    # Return 504 if backend doesn't respond in time
}
```

timeout-কে আপনার SLO-র সাথে মিলিয়ে নিন। যে route-এর 200ms-এ সাড়া দেওয়ার কথা সেখানে 30 সেকেন্ডের timeout মানে সমস্যা ধরার আগে 30 সেকেন্ড ধরে খারাপ user experience।
