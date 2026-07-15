---
title: 'Observability & Production Gateway'
subtitle: 'Access log, distributed tracing, circuit breaker, আর আসল traffic-এর সামনে gateway বসানোর আগের operational checklist।'
chapter: 6
level: 'advanced'
readingTime: '13 মিনিট'
topics: ['observability', 'tracing', 'circuit breaker', 'Kong', 'production']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনা একটা বিশাল ক্যাম্পাসের প্রধান গেটে দায়িত্বে আছেন। ক্যাম্পাসে ঢোকা-বেরোনোর আর কোনো পথ নেই — ছাত্র, শিক্ষক, ভিজিটর, ডেলিভারির লোক, সবাইকে এই একটাই গেট দিয়ে যেতে হয়। এই সুবিধাটা কাজে লাগিয়ে ইবনে সিনা একটা মোটা খাতা রাখেন — কে কখন ঢুকল, কখন বেরোলো, প্রতিটা এন্ট্রি-এক্সিট খাতায় লেখা। পাশে একটা তালি-বোর্ডও ঝোলানো — ঘণ্টায় কতজন এল, আর প্রতিজন ভেতরে কতক্ষণ কাটাল তার হিসাব।

আর প্রতিটা ভিজিটরকে ঢোকার সময় একটা স্লিপ ধরিয়ে দেন, যাতে একটা ইউনিক ট্র্যাকিং নম্বর স্ট্যাম্প করা থাকে। ভেতরে ভিজিটর কোন বিল্ডিং, কোন রুমে গেল — সেই নম্বর ধরে পুরো পথটা পরে অনুসরণ করা যায়। যেহেতু ব্যতিক্রম ছাড়া প্রত্যেকেই এই একটা বিন্দু পেরিয়ে যায়, ইবনে সিনার গেট থেকেই গোটা ক্যাম্পাসের সব যাতায়াতের একটা সম্পূর্ণ, নিখুঁত ছবি পাওয়া যায়। আল-খোয়ারিজমি বা ফাতিমা আল-ফিহরি ভেতরে কোথায় আটকে গেছেন খুঁজতে হলে আলাদা করে প্রতিটা বিল্ডিংয়ে দৌড়াতে হয় না — গেটের রেকর্ডই যথেষ্ট।

এই একটা গেটই আসলে API **gateway** — যেহেতু সব traffic এই একটা chokepoint দিয়ে যায়, observability-র জন্য এটাই সেরা জায়গা। খাতায় প্রতিটা এন্ট্রি-এক্সিট লেখা হলো request **logs**, ঘণ্টার তালি আর ভিজিটের সময়কাল হলো traffic/**latency**/error **metrics**, আর স্লিপে ট্র্যাকিং নম্বর স্ট্যাম্প করা হলো distributed **trace** শুরু করা। একটা বিন্দু থেকেই পুরো ছবি — logs + metrics + traces মিলে সব API traffic-এর complete **observability**। বাস্তবেও ঠিক তাই: gateway-তে বসানো logging, Prometheus metrics আর OpenTelemetry tracing মিলে production-এ পুরো API traffic-এর একটাই বিশ্বস্ত ভিউ দেয়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

Air traffic control — শুধু প্লেন পরিচালনা (routing) নয়, বরং প্রতিটা ফ্লাইটের একটা রিয়েল-টাইম ছবি বজায় রাখা, সমস্যা আগেভাগে ধরা, আর কিছু ভুল হলে পরিষ্কার procedure থাকা। production-এ gateway হলো API traffic-এর জন্য আপনার ATC।

</Callout>

## Access Logging

gateway-র মধ্য দিয়ে যাওয়া প্রতিটা request যথেষ্ট context সহ log করা উচিত যাতে কী ঘটেছিল তা পুনর্গঠন করা যায়:

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

**Node.js gateway-তে structured log:**

```typescript
import pino from 'pino';

const logger = pino({ level: 'info' });

function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
	const start = Date.now();
	const requestId = req.headers['x-request-id'] as string;

	res.on('finish', () => {
		logger.info({
			requestId,
			method: req.method,
			path: req.path,
			status: res.statusCode,
			userId: req.headers['x-user-id'],
			durationMs: Date.now() - start,
			upstream: req.headers['x-upstream-service'],
			contentLength: res.get('content-length')
		});
	});

	next();
}
```

## Distributed Tracing

trace context inject করুন যাতে gateway আর সব downstream সার্ভিসের span একটাই trace-এ দেখা যায়:

```typescript
import { trace, context, propagation } from '@opentelemetry/api';

function tracingMiddleware(req: Request, res: Response, next: NextFunction): void {
	// Extract trace context from incoming request (if any)
	const parentContext = propagation.extract(context.active(), req.headers);

	const tracer = trace.getTracer('api-gateway');
	const span = tracer.startSpan(
		`${req.method} ${req.path}`,
		{ kind: SpanKind.SERVER },
		parentContext
	);

	span.setAttributes({
		'http.method': req.method,
		'http.url': req.originalUrl,
		'http.route': req.route?.path,
		'user.id': req.headers['x-user-id'] as string
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

এটা থাকলে আপনার Jaeger বা Tempo dashboard পুরো request path দেখায়: gateway → service A → database, প্রতিটা hop-এ latency সহ।

## Circuit Breaker

একটা ধীর/ব্যর্থ backend-কে gateway exhaustion পর্যন্ত ছড়িয়ে পড়া থেকে ঠেকান:

```typescript
import CircuitBreaker from 'opossum';

const options = {
	timeout: 3000, // request > 3s = failure
	errorThresholdPercentage: 50, // open circuit if 50% fail
	resetTimeout: 30000 // try again after 30s
};

const breaker = new CircuitBreaker(callBackend, options);

breaker.on('open', () => logger.warn('Circuit breaker OPEN'));
breaker.on('halfOpen', () => logger.info('Circuit breaker HALF-OPEN'));
breaker.on('close', () => logger.info('Circuit breaker CLOSED'));

async function proxyRequest(req: Request, res: Response): Promise<void> {
	try {
		const response = await breaker.fire(req);
		res.status(response.status).json(response.data);
	} catch (err) {
		if (breaker.opened) {
			// Return cached or degraded response
			res.status(503).json({
				error: 'Service temporarily unavailable',
				cached: await getCachedResponse(req.path)
			});
		} else {
			res.status(502).json({ error: 'Bad gateway' });
		}
	}
}
```

## Gateway Metrics

expose আর alert করার মতো গুরুত্বপূর্ণ metric:

```typescript
import { Counter, Histogram, Registry } from 'prom-client';

const registry = new Registry();

const requestCounter = new Counter({
	name: 'gateway_requests_total',
	help: 'Total requests through gateway',
	labelNames: ['method', 'route', 'status', 'upstream'],
	registers: [registry]
});

const latencyHistogram = new Histogram({
	name: 'gateway_request_duration_seconds',
	help: 'Request latency',
	labelNames: ['method', 'route', 'upstream'],
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
	registers: [registry]
});

// Metrics endpoint for Prometheus scraping
app.get('/metrics', async (req, res) => {
	res.set('Content-Type', registry.contentType);
	res.end(await registry.metrics());
});
```

**Alert threshold:**

- Gateway p99 latency > 500ms: upstream তদন্ত করুন
- Error rate (4xx + 5xx) > 5%: on-call-কে page করুন
- Circuit breaker open: সঙ্গে সঙ্গে page
- Rate limit rejection বেড়ে যাওয়া: সম্ভাব্য abuse বা misconfiguration

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

## একটা Gateway বেছে নেওয়া

|               | nginx             | Traefik                     | Kong                     | AWS API Gateway       |
| ------------- | ----------------- | --------------------------- | ------------------------ | --------------------- |
| Config        | Static file       | Dynamic (Docker label, K8s) | Admin API + DB           | Console/Terraform     |
| Auth          | Plugin            | Plugin                      | Built-in                 | Built-in              |
| Rate limiting | Paid (nginx Plus) | Built-in                    | Built-in                 | Built-in              |
| যার জন্য সেরা | High-perf proxy   | Docker/K8s native           | Feature-rich self-hosted | AWS-native serverless |
| Ops-এর ঝামেলা | কম                | কম                          | মাঝারি                   | নেই                   |

nginx বা Traefik দিয়ে শুরু করুন। plugin ecosystem দরকার হলে Kong-এ উঠুন। per-request খরচের চেয়ে ops-এর ঝামেলা বেশি গুরুত্বপূর্ণ হলে managed (AWS/Cloudflare) ব্যবহার করুন।
