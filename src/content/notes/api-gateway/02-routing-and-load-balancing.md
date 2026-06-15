---
title: "Routing & Load Balancing"
subtitle: "Path matching, header-based routing, weighted splits, and health-aware balancing — how the gateway decides where each request goes."
chapter: 2
level: "beginner"
readingTime: "13 min"
topics: ["routing", "load balancing", "weighted traffic", "health checks", "nginx"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A traffic management system at a busy intersection — it reads the destination on every car (URL, headers), knows which roads are clear (healthy backends), and directs each car accordingly. If one road is closed (unhealthy instance), it stops sending cars there without anyone having to manually redirect traffic.

</Callout>

## Path-Based Routing

The most common pattern. Route by URL prefix to a backend service.

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

**Traefik (docker-compose labels):**
```yaml
services:
  user-service:
    image: user-service:latest
    labels:
      - "traefik.http.routers.users.rule=PathPrefix(`/api/users`)"
      - "traefik.http.services.users.loadbalancer.server.port=3001"

  order-service:
    image: order-service:latest
    labels:
      - "traefik.http.routers.orders.rule=PathPrefix(`/api/orders`)"
      - "traefik.http.services.orders.loadbalancer.server.port=3002"
```

## Header-Based Routing

Route by request headers — useful for versioning, A/B tests, or tenant routing.

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

## Load Balancing Algorithms

Once a route is matched, the gateway picks which backend instance handles the request.

**Round robin** — requests distributed evenly, one at a time:
```nginx
upstream backend {
    server backend-1:3000;
    server backend-2:3000;
    server backend-3:3000;
    # default: round-robin
}
```

**Least connections** — send to the instance with fewest active requests. Better when requests have variable duration:
```nginx
upstream backend {
    least_conn;
    server backend-1:3000;
    server backend-2:3000;
    server backend-3:3000;
}
```

**IP hash** — same client always hits the same backend (session affinity):
```nginx
upstream backend {
    ip_hash;
    server backend-1:3000;
    server backend-2:3000;
}
```

**Weighted** — send more traffic to higher-capacity instances:
```nginx
upstream backend {
    server backend-1:3000 weight=3;  # 3x traffic
    server backend-2:3000 weight=1;
}
```

## Health Checks

The gateway must stop sending traffic to unhealthy backends automatically.

**Passive health checks** (default in nginx) — mark a backend unhealthy after N consecutive failures:
```nginx
upstream backend {
    server backend-1:3000 max_fails=3 fail_timeout=30s;
    server backend-2:3000 max_fails=3 fail_timeout=30s;
}
```

**Active health checks** (nginx Plus / open-source alternatives):
```nginx
# nginx Plus
upstream backend {
    zone backend 64k;
    server backend-1:3000;
    server backend-2:3000;

    health_check interval=5s fails=2 passes=2 uri=/health;
}
```

**Traefik health checks:**
```yaml
services:
  api:
    labels:
      - "traefik.http.services.api.loadbalancer.healthcheck.path=/health"
      - "traefik.http.services.api.loadbalancer.healthcheck.interval=10s"
      - "traefik.http.services.api.loadbalancer.healthcheck.timeout=3s"
```

Your backend `/health` endpoint should check its own dependencies:

```typescript
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1'); // verify DB connection
    await redis.ping();          // verify cache connection
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});
```

## Weighted Traffic Splits (Canary Deploys)

Send a small percentage of traffic to a new version before full rollout:

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

## Timeouts

Every route should have explicit timeouts. Without them, a slow backend holds connections indefinitely:

```nginx
location /api/ {
    proxy_pass http://notes;

    proxy_connect_timeout 2s;    # time to establish connection
    proxy_send_timeout    10s;   # time to send request
    proxy_read_timeout    30s;   # time to receive response

    # Return 504 if backend doesn't respond in time
}
```

Match timeouts to your SLOs. A 30-second timeout on a route that should respond in 200ms means 30 seconds of degraded user experience before you detect the problem.

