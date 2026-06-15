---
title: "Self-host"
subtitle: "The outbox pattern bridges your domain transactions and the webhook queue. The worker pool drains it. Behind nginx with TLS, on a VPS, with all the operational pieces from chapter 9 wired in."
chapter: 10
level: "advanced"
readingTime: "14 min"
topics: ["webhooks", "outbox", "worker pool", "nginx", "deployment"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

This chapter ties everything together. The outbox pattern bridges domain commits to webhook deliveries. The worker pool drains the queue. Postgres holds state durably. nginx and systemd round it out. Same operational shape as the GraphQL, gRPC, and WebSockets tracks — different protocol on top.

By the end you have a single Go binary that hosts the producer (write events to outbox), the worker pool (deliver them), the receiver (verify and process incoming webhooks), and a small admin UI for replay. Self-hosted. Vendor-neutral.

<Callout type="info">

**Real-World Analogy**

A self-hosted webhook system is like a professional courier service versus handing a letter to a stranger — reliability, receipts, and escalation paths.

</Callout>

## The outbox pattern — the missing piece

In chapter 1, one silent failure was: "producer crashes after the side-effect, before sending the POST." This is real and it happens.

```go
// THIS IS BROKEN
func ChargeCustomer(customerID string, amount int) error {
    if err := db.Charge(customerID, amount); err != nil {
        return err
    }
    // process crashes here -- charge is committed, webhook never sent
    return webhooks.Send("payment.succeeded", chargeData)
}
```

The fix: write the *intent* to send the webhook into the same transaction as the domain change. A separate process drains the outbox.

```sql
CREATE TABLE webhook_outbox (
    id BIGSERIAL PRIMARY KEY,
    aggregate_id TEXT NOT NULL, -- e.g. "charge_42"
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    api_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    fanned_out_at TIMESTAMPTZ
);

CREATE INDEX webhook_outbox_pending ON webhook_outbox(created_at)
WHERE fanned_out_at IS NULL;
```

The new flow:

```go
func ChargeCustomer(ctx context.Context, customerID string, amount int) error {
    tx, _ := db.BeginTx(ctx, nil)
    defer tx.Rollback()

    if _, err := tx.Exec(ctx, `INSERT INTO charges ...`, ...); err != nil {
        return err
    }

    // outbox row in the SAME transaction
    payload, _ := json.Marshal(chargeData)
    if _, err := tx.Exec(ctx,
        `INSERT INTO webhook_outbox (aggregate_id, event_type, payload, api_version)
         VALUES ($1, $2, $3, $4)`,
        "charge_"+chargeID, "payment.succeeded", payload, "2026-05-01",
    ); err != nil {
        return err
    }

    return tx.Commit()
}
```

If the transaction commits, both the charge and the outbox row are durable. If it doesn't, neither is. No half-states.

A separate worker reads pending outbox rows and creates per-subscription `webhook_deliveries` rows:

```go
func fanOut(ctx context.Context) error {
    rows, _ := db.QueryContext(ctx, `
        SELECT id, aggregate_id, event_type, payload, api_version
        FROM webhook_outbox
        WHERE fanned_out_at IS NULL
        ORDER BY created_at
        LIMIT 100
        FOR UPDATE SKIP LOCKED
    `)
    defer rows.Close()

    for rows.Next() {
        var ob OutboxRow
        rows.Scan(&ob.ID, &ob.AggregateID, &ob.EventType, &ob.Payload, &ob.APIVersion)

        // find subscriptions interested in this event type
        subs, _ := loadSubscriptions(ctx, ob.EventType)

        tx, _ := db.BeginTx(ctx, nil)
        for _, sub := range subs {
            ev := buildEvent(ob, sub)
            body, _ := json.Marshal(ev)

            tx.Exec(ctx, `
                INSERT INTO webhook_deliveries (event_id, subscription_id, url, body,
                    state, next_attempt_at, give_up_at)
                VALUES ($1, $2, $3, $4, 'pending', now(), now() + interval '72 hours')
            `, ev.ID, sub.ID, sub.URL, body)
        }
        tx.Exec(ctx, `UPDATE webhook_outbox SET fanned_out_at = now() WHERE id = $1`, ob.ID)
        tx.Commit()
    }
    return nil
}
```

Run this fan-out worker every few seconds, or have it triggered by a Postgres notification (`pg_notify`) for low-latency event flow.

The pattern guarantees: every committed domain change generates exactly one outbox row, which generates exactly one delivery per subscription, which is retried until ack or DLQ. No event loss, no double-fan-out (the `SKIP LOCKED` plus the `fanned_out_at` flag keep it idempotent).

## The full worker pool

```go
type Worker struct {
    db         *sql.DB
    httpClient *http.Client
    metrics    *Metrics
    id         int
}

func (w *Worker) Run(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        default:
        }

        delivery, err := w.claim(ctx)
        if err != nil {
            log.Error(err)
            time.Sleep(time.Second)
            continue
        }
        if delivery == nil {
            time.Sleep(500 * time.Millisecond)
            continue
        }

        w.deliver(ctx, delivery)
    }
}

func (w *Worker) claim(ctx context.Context) (*Delivery, error) {
    // FOR UPDATE SKIP LOCKED claim — see chapter 6
}

func (w *Worker) deliver(ctx context.Context, d *Delivery) {
    start := time.Now()
    sub, _ := loadSubscription(ctx, d.SubscriptionID)
    sigHeader := sign(d.Body, sub.Secret, time.Now())

    req, _ := http.NewRequestWithContext(ctx, "POST", d.URL, bytes.NewReader(d.Body))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("X-Webhook-ID", d.EventID)
    req.Header.Set("X-Webhook-Signature", sigHeader)

    resp, err := w.httpClient.Do(req)
    duration := time.Since(start)
    decision := classify(resp, err)

    w.recordAttempt(ctx, d, resp, err, duration)

    switch {
    case decision.Success:
        w.markDelivered(ctx, d.ID)
        w.metrics.Attempt(d.EventType, "success", duration)
    case decision.Permanent:
        w.markFailed(ctx, d.ID, err)
        w.metrics.Attempt(d.EventType, "permanent_fail", duration)
    case time.Now().After(d.GiveUpAt):
        w.markExpired(ctx, d.ID)
        w.metrics.Attempt(d.EventType, "permanent_fail", duration)
    default:
        delay := pickDelay(d.Attempts+1, decision.RetryAfter)
        w.scheduleRetry(ctx, d.ID, delay)
        w.metrics.Attempt(d.EventType, "transient_fail", duration)
    }
}
```

That is the worker. ~50 lines around the framework you build out in earlier chapters.

Pool of N workers: `for i := 0; i &lt; runtime.NumCPU()*8; i++ { go workers[i].Run(ctx) }`. For network-bound work, more workers than CPUs is fine. Cap at the per-receiver concurrency limit (chapter 6) so you don't hammer one customer.

## Postgres tuning

Webhook delivery is queue-heavy. Three tunables matter:

**1. `FOR UPDATE SKIP LOCKED` is your primitive.** Already covered. It's free, it scales to thousands of workers.

**2. Partial indexes for hot queries.**

```sql
CREATE INDEX webhook_deliveries_pending ON webhook_deliveries(next_attempt_at)
WHERE state = 'pending';
```

The pending-deliveries scan is the hottest query in the system. A partial index keeps it fast even with millions of `delivered` rows.

**3. Vacuum aggressively on the deliveries table.** UPDATE-heavy tables bloat. Cron `VACUUM ANALYZE webhook_deliveries` nightly. For really high throughput, consider table partitioning (one partition per day; drop old partitions instead of deleting rows).

For the **DB self-hosted** track later in the path: the delivery table is the canonical example of "queue inside Postgres" — reaching the limits is at ~10K deliveries/sec, well past most apps. Beyond that, RabbitMQ or Redis are the upgrade.

## systemd unit

```ini
# /etc/systemd/system/webhooks.service
[Unit]
Description=webhooks producer + worker
After=network.target postgresql.service

[Service]
Type=simple
User=app
WorkingDirectory=/opt/webhooks
EnvironmentFile=/etc/webhooks/env
ExecStart=/opt/webhooks/bin/server
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

LimitNOFILE=65536

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

The single binary hosts:

- HTTP server for the receiver endpoint and admin UI.
- Background goroutines for the fan-out worker and N delivery workers.
- `/metrics` for Prometheus.
- `/healthz`, `/readyz` for orchestrator probes.

For higher throughput, split into separate services (one for receiver, one for delivery workers) — same binary, different `--mode` flags. Until measured needed: keep it one process.

## nginx config

```nginx
upstream webhooks_backend {
    server 127.0.0.1:8090;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name webhooks.example.com;

    ssl_certificate /etc/letsencrypt/live/webhooks.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/webhooks.example.com/privkey.pem;
    include /etc/nginx/snippets/tls-strong.conf;

    client_max_body_size 1m;

    # incoming webhooks (receiver)
    location /webhooks/ {
        proxy_pass http://webhooks_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 30s;
    }

    # admin UI (auth-gated by middleware)
    location /admin/ {
        proxy_pass http://webhooks_backend;
        proxy_set_header Host $host;
    }

    # Prometheus, internal only
    location /metrics {
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://webhooks_backend;
    }

    location / { return 404; }
}
```

The receiver path size limit is tight (1 MiB) — webhook bodies are small. Larger limits invite abuse.

## Per-subscription delivery isolation

A worker pool with no per-subscription throttling lets one bad customer's slow endpoint hog all workers. With 32 workers and one customer that takes 30 seconds to respond:

- 32 workers all stuck waiting on customer X.
- Other customers' deliveries queue up.
- Queue depth grows; alerts fire.

Solution: per-subscription concurrency cap. Use a semaphore keyed by subscription ID:

```go
type SubLimiter struct {
    mu  sync.Mutex
    sem map[int64]chan struct{}
}

func (l *SubLimiter) Acquire(subID int64, max int) <-chan struct{} {
    l.mu.Lock()
    defer l.mu.Unlock()
    if l.sem[subID] == nil {
        l.sem[subID] = make(chan struct{}, max)
    }
    return l.sem[subID]
}

// in worker:
ch := limiter.Acquire(d.SubscriptionID, 5)
ch <- struct{}{}
defer func() { <-ch }()
// proceed with delivery
```

5 concurrent deliveries to one subscription is enough for any reasonable receiver. The 6th waits without blocking other subscriptions.

## Receiver in the same binary

If you also receive webhooks (from third parties — Stripe, GitHub, etc.), the same service can host the receiver:

```go
mux.HandleFunc("/webhooks/stripe", stripeHandler(stripeSecret))
mux.HandleFunc("/webhooks/github", githubHandler(githubSecret))
```

Each handler does the verify-then-enqueue pattern from chapter 5. Combined with the outbox pattern, your service becomes a clean integration hub: third-party event arrives → verified → enqueued → processed by your domain code, which writes to outbox → fan-out → your subscribers receive.

## Backups and disaster recovery

The webhook tables are operational state — losing them loses event history and pending deliveries. Two layers:

**1. Postgres backups.** Continuous WAL archiving + nightly base backups. Standard Postgres ops; covered in **DB self-hosted** track.

**2. Outbox is the source of truth.** A disaster scenario: the deliveries table is lost. Replay from outbox: re-fan-out every outbox row, re-create deliveries, retry from scratch. Customers get duplicates; their idempotency handles it. No data loss.

For really paranoid setups, mirror the outbox to S3 or another offsite store. Recover by replaying from the mirror. Most apps don't need this.

## Cost reality

For a self-hosted webhook system handling ~100K deliveries/day:

- $20/month VPS (4 GB RAM, 2 vCPU) for the service.
- $10/month VPS for Postgres (or co-located if traffic is light).
- Free Let's Encrypt TLS.
- Free Loki + Prometheus + Grafana (also self-hosted).

Total ~$30/month. Hosted webhook services (Hookdeck, Svix) charge $50–500/month for similar volume. Build vs buy is a real choice; once you've built it, you have something you understand top to bottom.

## Pre-launch checklist

Before customers send real traffic:

- [ ] Outbox pattern wired into every domain commit that should emit events.
- [ ] Fan-out worker running, replicates outbox rows to per-subscription deliveries.
- [ ] Worker pool sized appropriately, with per-subscription concurrency caps.
- [ ] HMAC signing on every delivery, with shared-secret rotation supported.
- [ ] Verify and dedupe on every receiver endpoint.
- [ ] Retry policy: exponential + jitter, 72-hour deadline, classifier handles 4xx/5xx correctly.
- [ ] DLQ + alerts at the right thresholds (per-subscription, producer-wide).
- [ ] Customer dashboard with list, detail, attempts, resend.
- [ ] Audit log on all admin/customer replay actions.
- [ ] Prometheus metrics, Grafana dashboard, OpenTelemetry traces.
- [ ] systemd unit with restart on failure.
- [ ] nginx with TLS + tight body size limit + appropriate timeouts.
- [ ] Postgres tuned: partial indexes, regular VACUUM, backups verified.
- [ ] Documented contract: retry window, at-least-once, signing scheme, dashboard URL.

Half unchecked? Not yet. The good news: webhooks rarely break in dramatic ways once correctly deployed; the boring ops work pays off.

## Recap

- Outbox pattern: domain commit + outbox row in one transaction. Bridges to delivery queue.
- Fan-out worker creates per-subscription `webhook_deliveries` rows from outbox.
- Worker pool with `FOR UPDATE SKIP LOCKED` claim, per-subscription concurrency caps.
- Postgres partial indexes on hot queue scans. Vacuum and partition for high throughput.
- systemd unit, nginx with HTTPS + tight limits, env-driven config.
- Single binary hosts producer, workers, receiver, admin UI. Split when measured.
- Outbox is the disaster-recovery source of truth. Re-fan-out replays.
- Per-subscription concurrency caps prevent one bad customer from starving the rest.
- Self-hosted cost ~$30/month for moderate volume.

That is the full Backend Engineering Path's webhooks track. Next topic in the path: [Data modeling](/notes/data-modeling) — designing schemas, choosing keys, normalising and denormalising for the kinds of queries you actually run.

