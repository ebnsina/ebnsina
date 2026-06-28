---
title: 'Structured Logging'
subtitle: 'JSON logs, log levels, correlation IDs, log aggregation with Loki — building logs you can actually search in production.'
chapter: 2
level: 'beginner'
readingTime: '10 min'
topics: ['logging', 'pino', 'Loki', 'Promtail', 'correlation ID', 'structured logs', 'journald']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A well-organized filing cabinet vs a pile of papers: unstructured logs are a pile — you know the information is in there somewhere, but finding it requires reading every page. Structured logs are the filing cabinet: every document has labeled fields, filed in a consistent location, retrievable in seconds. Same information; radically different searchability.

</Callout>

## Why Structured Logging

Unstructured log:

```
[2024-01-15 10:23:41] ERROR: Payment failed for order ord-123 (user usr-456): card declined
```

To extract `order_id` from this, you write regex. Multiply by 10k log lines per second. Now count how many different developers wrote how many different formats.

Structured log (JSON):

```json
{
	"level": "error",
	"time": "2024-01-15T10:23:41Z",
	"service": "order-service",
	"order_id": "ord-123",
	"user_id": "usr-456",
	"event": "payment_failed",
	"reason": "card_declined",
	"duration_ms": 234
}
```

Every field is a key-value pair. Query: `{service="order-service"} | json | reason="card_declined" | order_id != ""` — instant, no regex.

## Pino (Node.js)

Pino is the fastest Node.js logger — synchronous JSON output with minimal allocation:

```typescript
import pino from 'pino';

const log = pino({
	level: process.env.LOG_LEVEL ?? 'info',
	base: {
		service: 'order-service',
		version: process.env.GIT_SHA ?? 'dev',
		env: process.env.NODE_ENV
	},
	// In development: pretty-print. In production: raw JSON.
	transport:
		process.env.NODE_ENV === 'development'
			? { target: 'pino-pretty', options: { colorize: true } }
			: undefined
});

export { log };
```

```typescript
// Usage
log.info({ orderId, customerId }, 'Order created');
log.error({ orderId, err: err.message, stack: err.stack }, 'Order creation failed');
log.warn({ queueDepth: 500 }, 'Queue depth high');

// Child logger — inherits context
const reqLog = log.child({ requestId, userId });
reqLog.info({ orderId }, 'Processing order');
// Output: {"requestId":"...","userId":"...","orderId":"...","msg":"Processing order"}
```

## Correlation IDs

A request passes through multiple services. To follow it across all logs, generate one ID at ingress and propagate it everywhere.

```typescript
// Express middleware — generate or propagate correlation ID
import { randomUUID } from 'crypto';

app.use((req, res, next) => {
	const correlationId = (req.headers['x-correlation-id'] as string) ?? randomUUID();
	req.correlationId = correlationId;
	res.setHeader('x-correlation-id', correlationId);

	// Attach to request logger
	req.log = log.child({ correlationId, method: req.method, path: req.path });
	next();
});

// Request handler
app.post('/orders', async (req, res) => {
	req.log.info('Creating order');

	try {
		const order = await createOrder(req.body, req.log);
		req.log.info({ orderId: order.id }, 'Order created');
		res.json(order);
	} catch (err) {
		req.log.error({ err: err.message }, 'Order creation failed');
		res.status(500).json({ error: 'Order creation failed' });
	}
});
```

Pass the correlation ID to downstream services:

```typescript
async function callPaymentService(order: Order, log: Logger) {
	const response = await fetch('http://payment-service/charge', {
		method: 'POST',
		headers: {
			'x-correlation-id': log.bindings().correlationId,
			'content-type': 'application/json'
		},
		body: JSON.stringify(order)
	});
}
```

Now a single query `{correlationId="abc-123"}` across all services shows the complete request journey.

## Log Levels

Use levels consistently — they determine what gets stored and what triggers alerts:

```
ERROR  — unexpected failure requiring investigation; fires an alert
WARN   — degraded state, expected to recover; may fire a low-priority alert
INFO   — significant business events (order created, user registered)
DEBUG  — diagnostic detail; disabled in production, enabled per-request when debugging
TRACE  — everything (query parameters, raw HTTP bodies); never in production
```

```typescript
// Good level usage
log.error({ err, orderId }, 'Payment service unreachable'); // alert
log.warn({ queueDepth, threshold }, 'Queue depth approaching limit'); // investigate soon
log.info({ orderId, total }, 'Order confirmed'); // business event
log.debug({ sql, params }, 'Executing query'); // dev only

// Common mistake: ERROR for expected failures
log.error('Order not found'); // NOT_FOUND is normal — use warn or info
log.info({ orderId }, 'Order not found, returning 404'); // correct
```

**Dynamic log levels in production:**

```typescript
// Change level at runtime without restart
process.on('SIGUSR1', () => {
	if (log.level === 'info') {
		log.level = 'debug';
		log.info('Debug logging enabled');
	} else {
		log.level = 'info';
		log.info('Debug logging disabled');
	}
});
```

## Log Aggregation with Loki

Loki stores logs indexed by labels (like Prometheus, but for logs). Promtail ships logs from files or journald to Loki.

```yaml
# docker-compose.yml
services:
  loki:
    image: grafana/loki:latest
    ports: ['3100:3100']
    command: -config.file=/etc/loki/loki.yml
    volumes:
      - ./loki.yml:/etc/loki/loki.yml
      - loki-data:/loki

  promtail:
    image: grafana/promtail:latest
    volumes:
      - /var/log:/var/log # host logs
      - /var/run/docker.sock:/var/run/docker.sock
      - ./promtail.yml:/etc/promtail/config.yml
    command: -config.file=/etc/promtail/config.yml
```

```yaml
# promtail.yml — ship Docker container logs
server:
  http_listen_port: 9080

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        target_label: container
      - source_labels: ['__meta_docker_container_label_service']
        target_label: service
    pipeline_stages:
      - json:
          expressions:
            level: level
            correlation_id: correlationId
      - labels:
          level:
          correlation_id:
```

## journald (systemd services)

For bare-metal or VM deployments (not Docker), logs go to journald:

```bash
# All logs from a service
journalctl -u order-service -f

# Logs since yesterday
journalctl -u order-service --since yesterday

# JSON output (for parsing)
journalctl -u order-service -o json | jq '.MESSAGE | fromjson | select(.level == "error")'

# Filter by time range
journalctl -u order-service --since "2024-01-15 10:00:00" --until "2024-01-15 11:00:00"
```

Forward journald to Loki:

```yaml
# promtail.yml — journald source
scrape_configs:
  - job_name: journal
    journal:
      max_age: 12h
      labels:
        job: systemd-journal
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: unit
```

## Loki Queries (LogQL)

```
# All errors from order-service
{service="order-service"} |= "error"

# Parse JSON and filter
{service="order-service"} | json | level="error"

# Filter by specific field
{service="order-service"} | json | order_id="ord-123"

# Count errors per minute
count_over_time({service="order-service"} | json | level="error" [1m])

# Rate of errors
rate({service="order-service"} | json | level="error" [5m])

# Top error reasons
{service="order-service"} | json | level="error"
  | line_format "{{.reason}}"
  | topk(10, count_over_time[1h])
```

## What to Log

**Log these:**

- Business events (order created, payment charged, user registered)
- All errors with full context (user, resource ID, error code, message)
- Slow operations (requests > 1s, queries > 100ms)
- Security events (failed auth, permission denied, unusual access patterns)
- Service startup and shutdown

**Don't log these:**

- Passwords, tokens, card numbers (PCI), personal data (GDPR)
- Successful health checks (100% noise)
- Debug-level SQL in production (volume)
- Stacktraces on expected errors (404, 401)

```typescript
// Sanitize sensitive data before logging
function sanitizeOrder(order: Order) {
	return {
		...order,
		paymentMethod: { last4: order.paymentMethod.cardNumber.slice(-4) }
		// never log full card number
	};
}

log.info({ order: sanitizeOrder(order) }, 'Order created');
```
