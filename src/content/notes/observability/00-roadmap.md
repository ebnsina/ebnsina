---
title: "Observability — Roadmap"
subtitle: "Logs with journald, metrics with Prometheus and Grafana, traces with Jaeger and OpenTelemetry."
chapter: 0
level: "beginner"
readingTime: "3 min"
topics: ["roadmap"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

An aircraft's black box, instruments, and GPS combined: the instruments show current state (metrics), the GPS tracks the route (traces), and the black box records everything that happened (logs). A pilot flying without all three is flying blind. In production, observability is how you know what your system is doing — and why it failed.

</Callout>

## What you will learn

You can't fix what you can't see. This track covers the three pillars of observability — logs, metrics, and traces — what each answers and where each falls short. Then the tools: structured logging with Pino and Loki, metrics collection and dashboards with Prometheus and Grafana, distributed tracing with OpenTelemetry and Jaeger, and the alerting practices that catch real problems without burning out the people on call.

## Chapters in this track

1. **The Three Pillars** — logs, metrics, traces, SLOs, and how they fit together
2. **Structured Logging** — JSON logs, correlation IDs, log levels, Loki, LogQL queries
3. **Prometheus & Grafana** — instrumentation, PromQL, dashboards, alerting rules, recording rules
4. **Distributed Tracing** — OpenTelemetry SDK, span propagation, Jaeger, tail-based sampling
5. **Alerting & On-Call** — SLO-based alerting, burn rates, runbooks, incident response, post-mortems

