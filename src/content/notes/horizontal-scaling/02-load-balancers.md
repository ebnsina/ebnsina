---
title: 'Load Balancers'
subtitle: 'Layer 4 vs Layer 7, algorithms, health checks, connection draining — the mechanics of distributing traffic across instances.'
chapter: 2
level: 'intermediate'
readingTime: '10 min'
topics: ['load balancer', 'L4', 'L7', 'round robin', 'health checks', 'connection draining']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A maitre d' at a restaurant with multiple dining rooms: they don't let all guests rush to the same room while others sit empty. They direct each party to an available room with capacity, check that rooms are actually open (health checks), and when a room needs to close, they stop seating new guests but let current diners finish (connection draining).

</Callout>

## Layer 4 vs Layer 7

**Layer 4 (TCP/UDP):** Routes based on IP address and port. Fast, minimal overhead, blind to HTTP content.

**Layer 7 (HTTP/HTTPS):** Routes based on HTTP headers, URLs, cookies, and body content. Smarter routing but more overhead.

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

Most production setups use L7. nginx, HAProxy, AWS ALB, and Traefik are all L7. AWS NLB is L4.

**When to use L4:**

- Non-HTTP protocols (gRPC in raw TCP mode, database proxies)
- Extreme performance requirements (1M+ connections/second)
- When you need to preserve client IP through TLS termination

## Algorithms

**Round Robin** — distribute requests sequentially across backends. Simple, works well when requests are similar in cost.

```nginx
upstream backend {
    server backend-1:3000;
    server backend-2:3000;
    server backend-3:3000;
    # default: round robin — 1→2→3→1→2→3...
}
```

**Least Connections** — send to the backend with fewest active connections. Better when request duration varies widely (some requests take 10ms, some take 5s).

```nginx
upstream backend {
    least_conn;
    server backend-1:3000;
    server backend-2:3000;
}
```

**Weighted Round Robin** — send proportionally more traffic to higher-capacity instances. Useful when instances have different hardware specs.

```nginx
upstream backend {
    server backend-1:3000 weight=3;  # gets 75% of traffic
    server backend-2:3000 weight=1;  # gets 25% of traffic
}
```

**IP Hash** — route the same client IP to the same backend. Provides soft session affinity (not recommended as a solution to stateful apps — see previous chapter).

```nginx
upstream backend {
    ip_hash;
    server backend-1:3000;
    server backend-2:3000;
}
```

**Random** — pick a backend at random. Statistically equivalent to round robin at scale, but simpler to implement and avoids coordinating state across load balancer instances.

## Health Checks

The load balancer must stop sending traffic to unhealthy backends automatically.

**Passive health checks** (all open-source nginx) — mark a backend unhealthy after N consecutive failures:

```nginx
upstream backend {
    server backend-1:3000 max_fails=3 fail_timeout=30s;
    # After 3 failures within 30s: backend removed
    # After 30s with no requests: re-included and checked again
}
```

**Active health checks** (nginx Plus, HAProxy, Traefik) — proactively probe backends:

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

Design your health check to reflect actual readiness. An instance that's up but can't reach the database shouldn't receive traffic.

## Connection Draining

When you remove a backend (deploy, scale down), in-flight requests must complete. Connection draining (or "deregistration delay") holds the backend in a "draining" state: no new connections sent, existing connections allowed to finish.

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

**Application-side: graceful shutdown must align with drain timeout:**

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

The load balancer handles TLS — backends communicate in plain HTTP on the internal network.

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

**Preserving client IP:** After SSL termination, backends see the load balancer's IP, not the client's. Use `X-Forwarded-For` header:

```typescript
app.set('trust proxy', 1); // trust first proxy (the load balancer)

app.get('/log', (req, res) => {
	const clientIp = req.ip; // reads X-Forwarded-For when trust proxy is set
});
```

## nginx as a Load Balancer — Full Config

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

A single load balancer is a single point of failure. Solutions:

**Active-passive LB pair (traditional):**

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

**Managed load balancers** (AWS ALB, GCP Load Balancing, Cloudflare) handle their own HA internally — the right choice for most teams. Don't build LB HA when a managed service does it for you.
