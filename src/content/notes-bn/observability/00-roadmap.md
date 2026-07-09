---
title: 'Observability — রোডম্যাপ'
subtitle: 'journald দিয়ে logs, Prometheus আর Grafana দিয়ে metrics, Jaeger আর OpenTelemetry দিয়ে traces।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা এয়ারক্রাফটের ব্ল্যাক বক্স, ইন্সট্রুমেন্ট আর GPS একসাথে মিলিয়ে ভাবুন: ইন্সট্রুমেন্টগুলো বর্তমান অবস্থা দেখায় (metrics), GPS রুট ট্র্যাক করে (traces), আর ব্ল্যাক বক্স যা যা ঘটেছে সব রেকর্ড করে রাখে (logs)। এই তিনটার কোনোটা ছাড়া একজন পাইলট মানে চোখ বন্ধ করে ওড়া। প্রোডাকশনে observability হলো সেই জিনিস যা দিয়ে আপনি জানেন আপনার সিস্টেম কী করছে — আর কেন ফেইল করল।

</Callout>

## আপনি যা শিখবেন

যা দেখতে পান না, তা ঠিকও করতে পারবেন না। এই ট্র্যাকে observability-র তিন স্তম্ভ — logs, metrics, আর traces — নিয়ে আলোচনা আছে, প্রতিটা কোন প্রশ্নের উত্তর দেয় আর কোথায় কম পড়ে যায়। এরপর টুলগুলো: Pino আর Loki দিয়ে structured logging, Prometheus আর Grafana দিয়ে metrics সংগ্রহ ও dashboard, OpenTelemetry আর Jaeger দিয়ে distributed tracing, এবং সেই alerting practice যা on-call মানুষজনকে পুড়িয়ে না ফেলে আসল সমস্যা ধরে ফেলে।

## এই ট্র্যাকের অধ্যায়গুলো

1. **The Three Pillars** — logs, metrics, traces, SLOs, আর এগুলো কীভাবে একসাথে কাজ করে
2. **Structured Logging** — JSON logs, correlation IDs, log levels, Loki, LogQL queries
3. **Prometheus & Grafana** — instrumentation, PromQL, dashboards, alerting rules, recording rules
4. **Distributed Tracing** — OpenTelemetry SDK, span propagation, Jaeger, tail-based sampling
5. **Alerting & On-Call** — SLO-based alerting, burn rates, runbooks, incident response, post-mortems
