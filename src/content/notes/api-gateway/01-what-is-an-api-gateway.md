---
title: "What Is an API Gateway"
subtitle: "The single entry point in front of your services — routing, auth, rate limiting, and transformation without touching your backends."
chapter: 1
level: "beginner"
readingTime: "11 min"
topics: ["api gateway", "reverse proxy", "routing", "cross-cutting concerns"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A hotel concierge — every guest request goes through them. They verify you're a guest (auth), direct you to the right department (routing), won't let one guest monopolize staff time (rate limiting), and handle translation if needed (transformation). The departments never deal with unvetted guests directly.

</Callout>

## The Problem It Solves

Without a gateway, every client talks directly to every service:

```
Mobile app  ──→ User Service :3001
            ──→ Order Service :3002
            ──→ Product Service :3003
            ──→ Payment Service :3004
```

Every service must independently implement auth, rate limiting, logging, CORS, SSL termination. When the auth logic changes, you update ten services. When you add a new service, the mobile app ships a new build to hit the new URL.

With a gateway:

```
Mobile app  ──→ API Gateway :443
                    ├──→ User Service :3001
                    ├──→ Order Service :3002
                    ├──→ Product Service :3003
                    └──→ Payment Service :3004
```

The gateway owns cross-cutting concerns. Services handle business logic only.

## What a Gateway Does

**Routing** — map incoming paths to backend services:
```
GET  /users/*        → user-service
GET  /orders/*       → order-service
POST /payments/*     → payment-service
```

**Authentication** — validate JWT/API key before the request reaches any service. Services trust the gateway and don't re-verify.

**Rate limiting** — cap requests per client, per route, per plan tier.

**SSL termination** — accept HTTPS from clients, forward HTTP internally. Services don't need certificates.

**Request/response transformation** — add headers, strip fields, reshape payloads.

**Load balancing** — distribute traffic across multiple instances of each service.

**Observability** — one place to collect access logs, trace IDs, latency metrics for all traffic.

## Gateway vs Reverse Proxy vs Load Balancer

These terms overlap but have distinct meanings:

| | Reverse Proxy | Load Balancer | API Gateway |
|--|---------------|---------------|-------------|
| Routes by | URL/host | Connection | URL + headers + method |
| Auth | No | No | Yes |
| Rate limiting | No | No | Yes |
| Transforms payloads | Rarely | No | Yes |
| Examples | nginx, Caddy | HAProxy, AWS NLB | Kong, AWS API Gateway, Traefik |

A gateway is a reverse proxy with application-layer awareness. Many tools blur these lines — nginx can do gateway work with plugins, Traefik is a proxy with gateway features built in.

## Self-Hosted vs Managed

**Self-hosted:** Kong, Traefik, Envoy, nginx + Lua. You run the gateway, own the config, pay compute costs. More control, more ops burden.

**Managed:** AWS API Gateway, Google Cloud Endpoints, Azure API Management, Cloudflare API Gateway. Fully managed, per-request pricing, opinionated configuration.

**When managed wins:** Early-stage, small team, AWS-native stack. You get auth, rate limiting, and a dashboard without running anything.

**When self-hosted wins:** High traffic (managed gateways get expensive fast), non-AWS stack, need custom plugins, strict latency requirements.

## A Minimal Gateway in Node.js

Before reaching for Kong or AWS, understand what a gateway actually is — a reverse proxy with middleware:

```typescript
import http from 'http';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({});

const routes: Record<string, string> = {
  '/users':    'http://user-service:3001',
  '/orders':   'http://order-service:3002',
  '/products': 'http://product-service:3003',
};

function matchRoute(path: string): string | null {
  for (const [prefix, target] of Object.entries(routes)) {
    if (path.startsWith(prefix)) return target;
  }
  return null;
}

const gateway = http.createServer((req, res) => {
  // 1. Auth
  const token = req.headers['authorization']?.split(' ')[1];
  if (!verifyJWT(token)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // 2. Rate limiting (simplified)
  const clientIp = req.socket.remoteAddress!;
  if (isRateLimited(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too Many Requests' }));
    return;
  }

  // 3. Route
  const target = matchRoute(req.url ?? '/');
  if (!target) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  // 4. Add internal headers
  req.headers['x-request-id'] = crypto.randomUUID();
  req.headers['x-forwarded-for'] = clientIp;

  // 5. Proxy
  proxy.web(req, res, { target });
});

gateway.listen(3000);
```

Production gateways are this loop — vastly optimized and hardened.

