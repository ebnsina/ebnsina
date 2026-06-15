---
title: "Observability & Production Gateway"
subtitle: "Access logs, distributed tracing, circuit breakers, and the operational checklist before putting a gateway in front of real traffic."
chapter: 6
level: "advanced"
readingTime: "13 min"
topics: ["observability", "tracing", "circuit breaker", "Kong", "production"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Air traffic control — not just directing planes (routing), but maintaining a real-time picture of every flight, detecting problems early, and having clear procedures when something goes wrong. The gateway in production is your ATC for API traffic.

</Callout>

## Access Logging

Every request through the gateway should be logged with enough context to reconstruct what happened:

```nginx
log_format gateway escape=json
  '{'
    '"time":"$time_iso8601",'
    '"method":"$request_method",'
    '"path":"$request_uri",'
    '"status":$status,'
    '"upstream":"$upstream_addr",'
    '"request_time":$request_time,'
    '"upstream_time":"$upstream_response_time",'
    '"request_id":"$request_id",'
    '"user_id":"$http_x_user_id",'
    '"bytes_sent":$bytes_sent'
  '}';

access_log /var/log/nginx/gateway.log gateway;
```

**Structured logs in Node.js gateway:**
```typescript
import pino from 'pino';

const logger = pino({ level: 'info' });

function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] as string;

  res.on('finish', () => {
    logger.info({
      requestId,
      method:        req.method,
      path:          req.path,
      status:        res.statusCode,
      userId:        req.headers['x-user-id'],
      durationMs:    Date.now() - start,
      upstream:      req.headers['x-upstream-service'],
      contentLength: res.get('content-length'),
    });
  });

  next();
}
```

## Distributed Tracing

Inject trace context so spans from the gateway and all downstream services appear in one trace:

```typescript
import { trace, context, propagation } from '@opentelemetry/api';

function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Extract trace context from incoming request (if any)
  const parentContext = propagation.extract(context.active(), req.headers);

  const tracer = trace.getTracer('api-gateway');
  const span = tracer.startSpan(
    `${req.method} ${req.path}`,
    { kind: SpanKind.SERVER },
    parentContext,
  );

  span.setAttributes({
    'http.method':   req.method,
    'http.url':      req.originalUrl,
    'http.route':    req.route?.path,
    'user.id':       req.headers['x-user-id'] as string,
  });

  // Inject trace context into upstream request
  propagation.inject(trace.setSpan(context.active(), span), req.headers);

  res.on('finish', () => {
    span.setAttributes({ 'http.status_code': res.statusCode });
    span.end();
  });

  next();
}
```

With this, your Jaeger or Tempo dashboard shows the full request path: gateway → service A → database, with latency at each hop.

## Circuit Breaker

Prevent a slow/failing backend from cascading to gateway exhaustion:

```typescript
import CircuitBreaker from 'opossum';

const options = {
  timeout: 3000,           // request > 3s = failure
  errorThresholdPercentage: 50,  // open circuit if 50% fail
  resetTimeout: 30000,     // try again after 30s
};

const breaker = new CircuitBreaker(callBackend, options);

breaker.on('open',     () => logger.warn('Circuit breaker OPEN'));
breaker.on('halfOpen', () => logger.info('Circuit breaker HALF-OPEN'));
breaker.on('close',    () => logger.info('Circuit breaker CLOSED'));

async function proxyRequest(req: Request, res: Response): Promise<void> {
  try {
    const response = await breaker.fire(req);
    res.status(response.status).json(response.data);
  } catch (err) {
    if (breaker.opened) {
      // Return cached or degraded response
      res.status(503).json({
        error: 'Service temporarily unavailable',
        cached: await getCachedResponse(req.path),
      });
    } else {
      res.status(502).json({ error: 'Bad gateway' });
    }
  }
}
```

## Gateway Metrics

Key metrics to expose and alert on:

```typescript
import { Counter, Histogram, Registry } from 'prom-client';

const registry = new Registry();

const requestCounter = new Counter({
  name: 'gateway_requests_total',
  help: 'Total requests through gateway',
  labelNames: ['method', 'route', 'status', 'upstream'],
  registers: [registry],
});

const latencyHistogram = new Histogram({
  name: 'gateway_request_duration_seconds',
  help: 'Request latency',
  labelNames: ['method', 'route', 'upstream'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

// Metrics endpoint for Prometheus scraping
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});
```

**Alert thresholds:**
- Gateway p99 latency > 500ms: investigate upstream
- Error rate (4xx + 5xx) > 5%: page on-call
- Circuit breaker open: immediate page
- Rate limit rejections spike: possible abuse or misconfiguration

## Production Checklist

```
□ TLS termination configured with modern cipher suites (TLS 1.2+)
□ HTTP/2 enabled for client connections
□ Timeouts set on all routes (connect, send, read)
□ Health check endpoint for the gateway itself
□ Rate limiting enabled on all public routes
□ Request ID injected on all requests
□ Structured access logs shipping to log aggregator
□ Distributed tracing context propagated
□ Circuit breakers on backends with known instability
□ Graceful shutdown: drain connections before process exit
□ Horizontal scaling tested: multiple gateway instances behind a load balancer
□ Config changes tested in staging before production
```

## Choosing a Gateway

| | nginx | Traefik | Kong | AWS API Gateway |
|--|-------|---------|------|-----------------|
| Config | Static files | Dynamic (Docker labels, K8s) | Admin API + DB | Console/Terraform |
| Auth | Plugin | Plugin | Built-in | Built-in |
| Rate limiting | Paid (nginx Plus) | Built-in | Built-in | Built-in |
| Best for | High-perf proxy | Docker/K8s native | Feature-rich self-hosted | AWS-native serverless |
| Ops burden | Low | Low | Medium | None |

Start with nginx or Traefik. Graduate to Kong when you need the plugin ecosystem. Use managed (AWS/Cloudflare) when ops burden matters more than per-request cost.

