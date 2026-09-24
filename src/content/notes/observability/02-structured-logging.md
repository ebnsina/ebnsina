---
title: 'Structured Logging'
subtitle: 'JSON logs, log levels, correlation IDs, Loki দিয়ে log aggregation — এমন logs বানানো যা আপনি সত্যিই প্রোডাকশনে search করতে পারবেন।'
chapter: 2
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['logging', 'pino', 'Loki', 'Promtail', 'correlation ID', 'structured logs', 'journald']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বাগদাদের এক ক্লিনিকে দুজন রেকর্ড-কিপার বসেন। একজন, খোয়ারিজমি, প্রতিটা রোগীর কথা নিজের খাতায় গল্পের মতো লিখে রাখেন — "আজ সকালে একটা অল্পবয়সী লোক কাশতে কাশতে এসেছিল, কিছুক্ষণ বসে ওষুধ নিয়ে চলে গেল।" পড়তে দিব্যি সুন্দর, কিন্তু তিন মাস পর যখন কেউ জানতে চায় "জুলাই মাসে চল্লিশের বেশি বয়সী কতজন কাশির রোগী এসেছিল", তখন খোয়ারিজমিকে খাতার প্রতিটা পৃষ্ঠা এক এক করে পড়তে হয় — কোথাও "অল্পবয়সী", কোথাও "মাঝবয়সী", বয়স কোথাও লেখাই নেই। বের করা কার্যত অসম্ভব।

পাশের টেবিলে সিনা একটা বাঁধা ফর্ম ভরেন — আলাদা আলাদা ঘরে নাম, বয়স, উপসর্গ, সময়। প্রতিটা ঘরের একটা নির্দিষ্ট লেবেল আছে, প্রতিটা তথ্য তার নিজের ঘরে বসে। মাস পেরিয়ে গেলেও ফাতিমা এসে শুধু "উপসর্গ = কাশি আর বয়স &gt; ৪০ আর মাস = জুলাই" বললেই সব মিলে যাওয়া রেকর্ড সঙ্গে সঙ্গে বেরিয়ে আসে — কোনো পৃষ্ঠা হাতড়াতে হয় না।

এই ফর্ম-ভরার কাজটাই আসলে **structured logging**। খোয়ারিজমির গল্পের বাক্য হলো একটা unstructured log line — মানুষ পড়তে পারে, কিন্তু মেশিন খুঁজতে পারে না। আর সিনার লেবেল করা ঘরগুলো হলো নামওয়ালা **field** — মানে প্রতিটা তথ্য key-value pair হয়ে **JSON** রেকর্ডে বসে (`age`, `symptom`, `time`)। ফাতিমার "সব মিলে যাওয়া রেকর্ড টেনে আনা" ঠিক তাই — field ধরে log **filter**, search আর **aggregate** করা। বাস্তবেও তাই: `log.info('a user paid')` লিখলে পরে কিছুই বের করা যায় না, কিন্তু `log.info({ userId, amount, status }, 'payment')` লিখলে Loki বা Elasticsearch-এ সেকেন্ডে সব failed payment গুনে ফেলা যায়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা গোছানো ফাইলিং ক্যাবিনেট বনাম কাগজের স্তূপ: unstructured logs হলো স্তূপ — আপনি জানেন তথ্যটা ওখানে কোথাও আছে, কিন্তু খুঁজে পেতে প্রতিটা পৃষ্ঠা পড়তে হবে। Structured logs হলো ফাইলিং ক্যাবিনেট: প্রতিটা document-এর লেবেল করা field আছে, একটা নির্দিষ্ট জায়গায় গোছানো, সেকেন্ডের মধ্যে বের করে আনা যায়। তথ্য একই; কিন্তু searchability আকাশ-পাতাল আলাদা।

</Callout>

## কেন Structured Logging

Unstructured log:

```
[2024-01-15 10:23:41] ERROR: Payment failed for order ord-123 (user usr-456): card declined
```

এটা থেকে `order_id` বের করতে আপনি regex লেখেন। সেকেন্ডে 10k log line দিয়ে গুণ করুন। এবার হিসাব করুন কতজন আলাদা developer কত আলাদা ফরম্যাটে লিখেছে।

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

প্রতিটা field একটা key-value pair। Query: `{service="order-service"} | json | reason="card_declined" | order_id != ""` — সাথে সাথে, কোনো regex নেই।

## Pino (Node.js)

Pino হলো সবচেয়ে দ্রুত Node.js logger — কম allocation-এ synchronous JSON output:

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

একটা request একাধিক service-এর মধ্য দিয়ে যায়। সব log জুড়ে সেটাকে অনুসরণ করতে ingress-এ একটা ID তৈরি করুন আর সেটা সব জায়গায় propagate করুন।

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

correlation ID টা downstream service-গুলোতে পাঠান:

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

এখন সব service জুড়ে একটা একক query `{correlationId="abc-123"}` সম্পূর্ণ request journey দেখায়।

## Log Levels

level গুলো ধারাবাহিকভাবে ব্যবহার করুন — এরাই ঠিক করে কী store হবে আর কী alert trigger করবে:

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

**প্রোডাকশনে Dynamic log levels:**

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

## Loki দিয়ে Log Aggregation

Loki labels দিয়ে index করে logs store করে (Prometheus-এর মতো, কিন্তু logs-এর জন্য)। Promtail ফাইল বা journald থেকে Loki-তে logs পাঠায়।

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

Bare-metal বা VM deployment-এর জন্য (Docker নয়), logs journald-এ যায়:

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

journald কে Loki-তে forward করুন:

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

## কী Log করবেন

**এগুলো log করুন:**

- Business events (order created, payment charged, user registered)
- সব error সম্পূর্ণ context সহ (user, resource ID, error code, message)
- Slow operations (requests > 1s, queries > 100ms)
- Security events (failed auth, permission denied, অস্বাভাবিক access pattern)
- Service startup আর shutdown

**এগুলো log করবেন না:**

- Password, token, card number (PCI), personal data (GDPR)
- সফল health check (100% noise)
- প্রোডাকশনে debug-level SQL (volume)
- Expected error-এ stacktrace (404, 401)

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
