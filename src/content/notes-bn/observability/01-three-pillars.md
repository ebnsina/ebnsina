---
title: 'Observability-র তিন স্তম্ভ'
subtitle: "Logs, metrics, আর traces — প্রতিটা আপনাকে কী বলে, কোথায় কম পড়ে যায়, আর 'কী নষ্ট হয়েছে আর কেন' এর উত্তর দিতে এরা কীভাবে একসাথে কাজ করে।"
chapter: 1
level: 'beginner'
readingTime: '8 মিনিট'
topics: ['observability', 'logs', 'metrics', 'traces', 'SLO', 'alerting']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন ডাক্তারের ডায়াগনস্টিক টুলগুলো ভাবুন: metrics হলো vitals monitor (হার্ট রেট, ব্লাড প্রেশার — কিছু একটা যে গণ্ডগোল হয়েছে সেটা সাথে সাথে বুঝে যান)। Logs হলো রোগীর symptom journal (কখন কী ঘটেছে তার বিস্তারিত বিবরণ)। Traces হলো MRI — ভেতরে ঠিক কী ঘটছে আর সমস্যাটা কোথায়, তা এরা দেখিয়ে দেয়। তিনটাই দরকার; আলাদা আলাদাভাবে প্রতিটা যথেষ্ট নয়।

</Callout>

## Logs

Logs হলো আলাদা আলাদা event: নির্দিষ্ট একটা সময়ে কিছু একটা ঘটেছে।

```
2024-01-15T10:23:41Z ERROR payment failed order_id=ord-123 reason="card_declined" user_id=usr-456
2024-01-15T10:23:42Z INFO  order cancelled order_id=ord-123
```

**Logs কোন প্রশ্নের উত্তর দেয়:** "কী ঘটেছে?" Logs আপনাকে গল্পটা দেয় — যে ঘটনাক্রমে ফেইলিওরটা হলো তার ধারাবাহিকতা।

**Logs কোথায় ফেইল করে:** ভলিউম আর search। সেকেন্ডে 10k req প্রসেস করা একটা সিস্টেম ঘণ্টায় লক্ষ লক্ষ log line তৈরি করে। সেই স্রোতের মধ্যে নির্দিষ্ট error খুঁজে বের করতে ভালো টুলিং (Loki, Elasticsearch) আর ভালো structure (JSON, ফ্রিফর্ম টেক্সট নয়) দরকার।

**Structured logging (এটাই করুন):**

```typescript
import pino from 'pino';

const log = pino({
	level: process.env.LOG_LEVEL || 'info',
	base: { service: 'order-service', version: process.env.GIT_SHA }
});

// NOT this:
console.log(`Order ${orderId} failed: ${err.message}`);

// This:
log.error({ orderId, userId, err: err.message, code: err.code }, 'Order creation failed');
```

Structured logs হলো JSON — search করা যায়, filter করা যায়, aggregate করা যায়। ফ্রিফর্ম টেক্সট log থেকে কোনো কাজের তথ্য বের করতে regex লাগে।

## Metrics

Metrics হলো সময়ের সাথে নেওয়া সংখ্যাগত পরিমাপ।

```
http_requests_total{method="POST", path="/orders", status="500"} 142
http_request_duration_seconds{p99} 0.847
order_processing_queue_depth 234
```

**Metrics কোন প্রশ্নের উত্তর দেয়:** "এই মুহূর্তে কি কিছু ভুল হচ্ছে?" ইউজার রিপোর্ট করার আগেই incident ধরে ফেলার উপায় হলো metrics। error rate হঠাৎ বেড়ে যাওয়া, throughput কমে যাওয়া, queue depth বাড়তে থাকা — metrics এগুলো রিয়েল টাইমে ধরে ফেলে।

**Metrics কোথায় ফেইল করে:** এরা আপনাকে বলে _যে_ কিছু একটা ভুল হচ্ছে, কিন্তু _কেন_ তা নয়। `/orders`-এ error rate হঠাৎ বেড়ে গেলে সেটা বলে যে একটা সমস্যা আছে; logs বলে error-টা কী; traces বলে কোন service সেটা ঘটাচ্ছে।

**চারটা golden signal** (Google SRE):

- **Latency** — request কত সময় নেয় (success latency আর error latency আলাদা করে দেখুন)
- **Traffic** — কত চাহিদা (requests/sec, messages/sec)
- **Errors** — ফেইল হওয়া request-এর হার
- **Saturation** — সিস্টেম কতটা ভর্তি (queue depth, CPU, memory, connection pool)

## Traces

Traces একটা একক request কে অনুসরণ করে যখন সেটা একাধিক service-এর মধ্য দিয়ে যায়।

```
Trace: ord-request-abc123 (total: 847ms)
  ├─ API Gateway            12ms
  ├─ Order Service          820ms
  │   ├─ Validate input      5ms
  │   ├─ Payment Service    750ms   ← the bottleneck
  │   │   ├─ DB query        20ms
  │   │   └─ Stripe API     730ms   ← Stripe is slow
  │   └─ Save order          15ms
  └─ Response               15ms
```

**Traces কোন প্রশ্নের উত্তর দেয়:** "সময়টা কোথায় যাচ্ছে?" একটা microservices সিস্টেমে যেখানে একটা request-এ 10টা service জড়িত, সেখানে একটা trace ঠিক দেখিয়ে দেয় কোন service বা operation-টা ধীর।

**Traces কোথায় ফেইল করে:** sampling। high throughput-এ 100% trace সংগ্রহ করা ব্যয়বহুল। বেশিরভাগ সিস্টেম trace-এর 1-10% sample করে, যার মানে বিরল error হয়তো ধরাই পড়ল না। head-based sampling (ingress-এ সিদ্ধান্ত নিন) বা tail-based sampling (trace বাফার করুন, error ঘটেছিল কিনা তার ভিত্তিতে সম্পূর্ণ হওয়ার পরে সিদ্ধান্ত নিন) ব্যবহার করুন।

## এরা কীভাবে একসাথে কাজ করে

একটা incident-এর workflow:

1. **Metrics alert fire করে** — `/api/orders`-এ error rate 5 মিনিট ধরে > 5%
2. **Dashboard দেখুন** — কোন নির্দিষ্ট error code? latency distribution কেমন? কখন শুরু হলো?
3. **Logs search করুন** — আসল error message খুঁজুন। Stack trace। কী ফেইল করছে?
4. **একটা trace টানুন** — একটা ফেইল হওয়া request খুঁজুন। কোন service error return করল? কোন downstream call ফেইল করল?
5. **ঠিক করুন আর যাচাই করুন** — fix deploy করুন। metrics baseline-এ ফিরে আসতে দেখুন।

এই তিনটা ছাড়া: metrics বলে আগুন লেগেছে কিন্তু কোথায় তা নয়। Logs আলাদা আলাদা আগুন দেখায় কিন্তু প্যাটার্ন নয়। Traces পথটা দেখায় কিন্তু incident কখন শুরু হলো তা নয়।

## SLOs: The North Star

টুল বাছাই করার আগে ঠিক করুন আপনি কীসের জন্য পরিমাপ করছেন।

**SLI (Service Level Indicator):** আপনি যা পরিমাপ করেন।

```
Request success rate = successful_requests / total_requests
Request latency P99 = 99th percentile response time
```

**SLO (Service Level Objective):** লক্ষ্য।

```
Success rate: 99.9% over 30 days
P99 latency: < 500ms
```

**Error budget:** SLO কতটুকু ফেইলিওর মেনে নেয়।

```
99.9% success → 0.1% allowed failures
In 30 days (43,200 minutes): 43.2 minutes of downtime budget
```

SLO alerting-কে যুক্তিসঙ্গত করে: alert করুন যখন error budget খুব দ্রুত পুড়ছে, যেকোনো error ঘটলেই নয়।

```yaml
# Prometheus alert based on error budget burn rate
alert: HighErrorBudgetBurn
expr: |
  (
    rate(http_requests_total{status=~"5.."}[1h])
    /
    rate(http_requests_total[1h])
  ) > 0.001   # burning 1% per hour = budget exhausted in ~4 days
severity: warning
```

## আপনার Stack বাছাই করা

একটা small-to-medium প্রোডাকশন সিস্টেমের জন্য একটা বাস্তবসম্মত stack:

```
Logs:    Loki + Promtail (self-hosted) or Datadog Logs
Metrics: Prometheus + Grafana (self-hosted) or Datadog Metrics
Traces:  Jaeger or Tempo (self-hosted) or Datadog APM

Instrumentation: OpenTelemetry SDKs (vendor-neutral)
```

OpenTelemetry-ই আসল চাবি: OTel SDK দিয়ে একবার instrument করুন, যেকোনো backend-এ export করুন। সরাসরি Datadog বা Jaeger-এ instrument করবেন না — backend বদলালে আবার নতুন করে instrument করতে হবে না।

```typescript
// Instrument once with OpenTelemetry
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
	traceExporter: new OTLPTraceExporter({
		url: 'http://otel-collector:4318/v1/traces' // collector routes to Jaeger/Tempo
	})
});

sdk.start();
// Now switch to Datadog by changing the collector config, not the app code
```

সামনের অধ্যায়গুলো প্রতিটা স্তম্ভ গভীরভাবে কভার করে: Loki দিয়ে structured logging, Prometheus আর Grafana দিয়ে metrics, এবং OpenTelemetry আর Jaeger দিয়ে distributed tracing।
