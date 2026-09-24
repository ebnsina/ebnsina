---
title: 'Self-host'
subtitle: 'outbox pattern আপনার domain transaction আর webhook queue-র মধ্যে সেতু গড়ে। worker pool সেটা drain করে। TLS সহ nginx-এর পেছনে, একটা VPS-এ, অধ্যায় ৯-এর সব operational টুকরো জোড়া দিয়ে।'
chapter: 10
level: 'advanced'
readingTime: '14 মিনিট'
topics: ['webhooks', 'outbox', 'worker pool', 'nginx', 'deployment']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

এই অধ্যায় সবকিছু একসাথে বাঁধে। outbox pattern domain commit-কে webhook delivery-র সাথে সেতু করে। worker pool queue drain করে। Postgres state durably ধরে রাখে। nginx আর systemd সেটা সম্পূর্ণ করে। GraphQL, gRPC, আর WebSockets track-এর মতোই একই operational গড়ন — উপরে ভিন্ন protocol।

শেষে আপনার হাতে একটা single Go binary থাকবে যা producer (event outbox-এ লেখে), worker pool (সেগুলো deliver করে), receiver (আসা webhook verify আর process করে), আর replay-র জন্য একটা ছোট admin UI host করে। Self-hosted। Vendor-neutral।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা self-hosted webhook সিস্টেম অনেকটা একজন অচেনা লোকের হাতে চিঠি তুলে দেওয়ার বদলে একটা professional courier service-এর মতো — নির্ভরযোগ্যতা, receipt, আর escalation path।

</Callout>

## গল্পে বুঝি

সিনার একটা বড় courier-notification অফিস, সারা শহরে গ্রাহকদের কাছে খবরের স্লিপ পাঠানোই কাজ। শুরুর দিকে অফিসের কাউন্টার-কেরানি নিজেই প্রতিটা স্লিপ হাতে নিয়ে গ্রাহকের ঠিকানায় দৌড়ে যেত। কিন্তু ব্যস্ত দিনে এটা বিপর্যয় — কেরানি একটা স্লিপ পৌঁছাতে বেরোলে কাউন্টারে নতুন গ্রাহকদের লম্বা লাইন জমে যায়, পুরো অফিস থমকে দাঁড়ায়। তাই সিনা নিয়ম বদলালেন: এখন থেকে যত স্লিপই পাঠাতে হোক, কেরানি সেটা নিজে না পৌঁছে একটা কেন্দ্রীয় dispatch বাক্সে ফেলে দেবে, আর কাউন্টার ছেড়ে নড়বে না।

সেই বাক্স থেকে স্লিপ তুলে নেওয়ার জন্য আলাদা একদল ডেডিকেটেড রানার আছে — খোয়ারিজমি, ফাতিমা আর তাঁদের দল — যারা সারাদিন ধরে বাক্স থেকে স্লিপ তুলে একের পর এক ঠিকানায় পৌঁছে দেয়, কাউন্টারের কাজ একটুও না আটকে। ম্যানেজার বিরুনি দিনের চাপ দেখে রানার কমান-বাড়ান — সকালের ভিড়ে বেশি রানার রাস্তায় নামান, দুপুরের ঝিমুনিতে কম। কাউন্টার তার নিজের ছন্দে গ্রাহক সামলে যায়, কেউ কখনো স্লিপ পৌঁছানোর জন্য অপেক্ষা করে বসে থাকে না।

এই গল্পটাই আসলে production-এ self-hosted webhook সিস্টেম চালানো। কেরানির নিজে না দৌড়ে প্রতিটা স্লিপ dispatch বাক্সে ফেলা মানে — প্রতিটা notification inline না পাঠিয়ে একটা durable **queue**-তে enqueue করা, যাতে পাঠানোর কাজ main app-কে block না করে (**async**, **background**)। বাক্স থেকে স্লিপ তুলে নেওয়া রানারের দল হলো async **worker** pool। আর দিনের চাপ বুঝে রানার কমানো-বাড়ানোই হলো লোড অনুযায়ী **worker scale** করা। বাস্তবে এই প্যাটার্নই outbox আর worker pool — Postgres-এর queue-তে delivery জমা হয়, worker-রা সেগুলো drain করে, আর traffic বাড়লে আপনি শুধু worker সংখ্যা বাড়িয়ে দেন; Hookdeck বা Svix-এর মতো সার্ভিসগুলোও ঠিক এভাবেই ভেতরে কাজ করে।

## outbox pattern — অনুপস্থিত টুকরো

অধ্যায় ১-এ, একটা নীরব failure ছিল: "producer side-effect-এর পরে, POST পাঠানোর আগে crash করে।" এটা আসল আর এটা ঘটে।

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

সমাধান: webhook পাঠানোর _intent_-টা domain change-এর মতো একই transaction-এ লিখুন। একটা আলাদা process outbox drain করে।

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

নতুন flow:

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

transaction commit হলে, charge আর outbox row দুটোই durable। না হলে, কোনোটাই না। কোনো half-state নেই।

একটা আলাদা worker pending outbox row পড়ে আর per-subscription `webhook_deliveries` row তৈরি করে:

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

এই fan-out worker প্রতি কয়েক সেকেন্ডে চালান, অথবা low-latency event flow-এর জন্য একটা Postgres notification (`pg_notify`) দিয়ে trigger করান।

pattern-টা guarantee দেয়: প্রতিটা committed domain change ঠিক একটা outbox row তৈরি করে, যা প্রতি subscription-এ ঠিক একটা delivery তৈরি করে, যা ack বা DLQ পর্যন্ত retried হয়। কোনো event loss নেই, কোনো double-fan-out নেই (`SKIP LOCKED` প্লাস `fanned_out_at` flag এটা idempotent রাখে)।

## পূর্ণ worker pool

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

এটাই worker। আগের অধ্যায়গুলোতে বানানো framework-এর চারপাশে ~৫০ লাইন।

N worker-এর pool: `for i := 0; i &lt; runtime.NumCPU()*8; i++ { go workers[i].Run(ctx) }`। Network-bound কাজের জন্য, CPU-র চেয়ে বেশি worker ঠিক আছে। per-receiver concurrency limit-এ cap করুন (অধ্যায় ৬) যাতে আপনি এক customer-কে হাতুড়ি না মারেন।

## Postgres tuning

Webhook delivery queue-heavy। তিনটে tunable গুরুত্বপূর্ণ:

**১. `FOR UPDATE SKIP LOCKED` হলো আপনার primitive।** ইতিমধ্যে কভার করা। এটা বিনামূল্যে, হাজার হাজার worker-এ scale করে।

**২. Hot query-র জন্য partial index।**

```sql
CREATE INDEX webhook_deliveries_pending ON webhook_deliveries(next_attempt_at)
WHERE state = 'pending';
```

pending-deliveries scan হলো সিস্টেমের সবচেয়ে hot query। একটা partial index লক্ষ লক্ষ `delivered` row থাকলেও এটা দ্রুত রাখে।

**৩. deliveries table-এ aggressively vacuum করুন।** UPDATE-heavy table bloat করে। প্রতি রাতে cron `VACUUM ANALYZE webhook_deliveries`। সত্যিকার উঁচু throughput-এর জন্য, table partitioning ভেবে দেখুন (প্রতিদিন এক partition; row delete করার বদলে পুরনো partition drop করুন)।

path-এ পরের **DB self-hosted** track-এর জন্য: delivery table হলো "Postgres-এর ভেতরে queue"-র canonical উদাহরণ — limit-এ পৌঁছানো হয় ~10K deliveries/sec-এ, বেশিরভাগ app-এর অনেক পরে। এর বাইরে, RabbitMQ বা Redis হলো upgrade।

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

single binary host করে:

- receiver endpoint আর admin UI-র জন্য HTTP server।
- fan-out worker আর N delivery worker-এর জন্য background goroutine।
- Prometheus-এর জন্য `/metrics`।
- orchestrator probe-এর জন্য `/healthz`, `/readyz`।

উঁচু throughput-এর জন্য, আলাদা service-এ ভাগ করুন (একটা receiver-এর জন্য, একটা delivery worker-এর জন্য) — একই binary, ভিন্ন `--mode` flag। মাপা প্রয়োজন না হওয়া পর্যন্ত: এক process-ই রাখুন।

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

receiver path-এর size limit টাইট (1 MiB) — webhook body ছোট। বড় limit abuse ডেকে আনে।

## Per-subscription delivery isolation

per-subscription throttling ছাড়া একটা worker pool একজন খারাপ customer-এর ধীর endpoint-কে সব worker দখল করতে দেয়। 32 worker আর একজন customer যে response দিতে ৩০ সেকেন্ড নেয়:

- 32 worker সবাই customer X-এর জন্য অপেক্ষায় আটকে।
- অন্য customer-দের delivery জমতে থাকে।
- Queue depth বাড়ে; alert fire করে।

সমাধান: per-subscription concurrency cap। subscription ID দিয়ে keyed একটা semaphore ব্যবহার করুন:

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

এক subscription-এ 5 concurrent delivery যেকোনো যুক্তিসঙ্গত receiver-এর জন্য যথেষ্ট। 6তমটা অন্য subscription block না করে অপেক্ষা করে।

## একই binary-তে receiver

আপনি যদি webhook-ও পান (third party থেকে — Stripe, GitHub, ইত্যাদি), একই service receiver host করতে পারে:

```go
mux.HandleFunc("/webhooks/stripe", stripeHandler(stripeSecret))
mux.HandleFunc("/webhooks/github", githubHandler(githubSecret))
```

প্রতিটা handler অধ্যায় ৫-এর verify-then-enqueue pattern করে। outbox pattern-এর সাথে মিলিয়ে, আপনার service একটা পরিচ্ছন্ন integration hub হয়ে ওঠে: third-party event আসে → verified → enqueued → আপনার domain কোড process করে, যা outbox-এ লেখে → fan-out → আপনার subscriber-রা পায়।

## Backup আর disaster recovery

webhook table হলো operational state — সেগুলো হারানো মানে event history আর pending delivery হারানো। দুটো layer:

**১. Postgres backup।** Continuous WAL archiving + প্রতি রাতে base backup। Standard Postgres ops; **DB self-hosted** track-এ কভার করা।

**২. Outbox হলো source of truth।** একটা disaster scenario: deliveries table হারিয়ে গেছে। outbox থেকে replay করুন: প্রতিটা outbox row re-fan-out করুন, delivery re-create করুন, শুরু থেকে retry করুন। Customer-রা duplicate পায়; তাদের idempotency সামলায়। কোনো data loss নেই।

সত্যিকার paranoid setup-এর জন্য, outbox-কে S3 বা আরেকটা offsite store-এ mirror করুন। mirror থেকে replay করে recover করুন। বেশিরভাগ app-এর এটা লাগে না।

## খরচের বাস্তবতা

~100K deliveries/day সামলানো একটা self-hosted webhook সিস্টেমের জন্য:

- service-এর জন্য $20/month VPS (4 GB RAM, 2 vCPU)।
- Postgres-এর জন্য $10/month VPS (বা traffic কম হলে co-located)।
- Free Let's Encrypt TLS।
- Free Loki + Prometheus + Grafana (এগুলোও self-hosted)।

মোট ~$30/month। Hosted webhook service (Hookdeck, Svix) একই volume-এর জন্য $50–500/month নেয়। Build vs buy একটা আসল পছন্দ; একবার বানিয়ে ফেললে, আপনার এমন কিছু থাকে যা আপনি উপর থেকে নিচ পর্যন্ত বোঝেন।

## Pre-launch checklist

Customer-রা আসল traffic পাঠানোর আগে:

- [ ] event emit করা উচিত এমন প্রতিটা domain commit-এ outbox pattern জোড়া।
- [ ] Fan-out worker চলছে, outbox row-কে per-subscription delivery-তে replicate করে।
- [ ] Worker pool যথাযথভাবে sized, per-subscription concurrency cap সহ।
- [ ] প্রতিটা delivery-তে HMAC signing, shared-secret rotation সমর্থিত।
- [ ] প্রতিটা receiver endpoint-এ verify আর dedupe।
- [ ] Retry policy: exponential + jitter, ৭২-ঘণ্টা deadline, classifier 4xx/5xx সঠিকভাবে সামলায়।
- [ ] DLQ + সঠিক threshold-এ alert (per-subscription, producer-wide)।
- [ ] list, detail, attempt, resend সহ customer dashboard।
- [ ] সব admin/customer replay action-এ audit log।
- [ ] Prometheus metric, Grafana dashboard, OpenTelemetry trace।
- [ ] failure-এ restart সহ systemd unit।
- [ ] TLS + টাইট body size limit + যথাযথ timeout সহ nginx।
- [ ] Postgres tuned: partial index, নিয়মিত VACUUM, backup verified।
- [ ] Documented contract: retry window, at-least-once, signing scheme, dashboard URL।

অর্ধেক unchecked? এখনও নয়। সুখবর: সঠিকভাবে deploy করা হলে webhooks নাটকীয়ভাবে খুব কমই ভাঙে; সেই বোরিং ops কাজটাই দাম দেয়।

## রিক্যাপ

- Outbox pattern: domain commit + outbox row এক transaction-এ। delivery queue-র সাথে সেতু।
- Fan-out worker outbox থেকে per-subscription `webhook_deliveries` row তৈরি করে।
- `FOR UPDATE SKIP LOCKED` claim সহ worker pool, per-subscription concurrency cap।
- Hot queue scan-এ Postgres partial index। উঁচু throughput-এর জন্য vacuum আর partition।
- systemd unit, HTTPS + টাইট limit সহ nginx, env-driven config।
- Single binary producer, worker, receiver, admin UI host করে। মাপা হলে ভাগ করুন।
- Outbox হলো disaster-recovery-র source of truth। Re-fan-out replay করে।
- Per-subscription concurrency cap একজন খারাপ customer-কে বাকিদের অভুক্ত রাখা থেকে ঠেকায়।
- Self-hosted খরচ মাঝারি volume-এর জন্য ~$30/month।

এটাই পূর্ণ Backend Engineering Path-এর webhooks track। path-এর পরের topic: [Data modeling](/notes/data-modeling) — schema ডিজাইন করা, key বেছে নেওয়া, আপনি আসলে যে ধরনের query চালান তার জন্য normalise আর denormalise করা।
