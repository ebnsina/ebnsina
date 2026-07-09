---
title: 'Delivery guarantee ও dead-letter queue'
subtitle: 'কিছু event কখনও deliver হয় না। dead-letter queue হলো সেখানে যেখানে তারা যায়, dashboard হলো যেখানে মানুষ তাদের দেখে, আর manual replay হলো আপনি কীভাবে recover করেন। এর কোনোটাই ঐচ্ছিক নয়।'
chapter: 8
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['webhooks', 'dlq', 'delivery', 'alerts', 'replay']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

retry ফুরিয়ে গেলে, কী হয়? বহু সিস্টেমে default হলো "event নীরবে উধাও হয়, customer কয়েক সপ্তাহ পরে টের পায় তাদের integration-এ ফাঁক আছে, support ticket আপনার কাছে এসে পড়ে।" দুই পক্ষের জন্যই এটাই সবচেয়ে খারাপ সম্ভাব্য পরিণতি।

এই অধ্যায়টা হলো recovery-র গল্প। dead-letter queue (DLQ), alerting, manual replay, customer visibility। একবার বানান, রাতে শান্তিতে ঘুমান।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা dead-letter queue অনেকটা একটা post office-এর dead-letter bin-এর মতো — যে চিঠি deliver করা যায়নি তার জন্য, চিরতরে হারানোর বদলে আলাদা করে রাখা হয় পরীক্ষার জন্য।

</Callout>

## Delivery state machine

```
                  ┌─────────┐
                  │ pending │
                  └────┬────┘
                       │ claimed by worker
                       ▼
                  ┌─────────┐
                  │  in     │
                  │ flight  │
                  └────┬────┘
                       │
        ┌──────────────┼──────────────────────┐
        │ 2xx          │ 4xx permanent        │ 5xx/transient
        ▼              ▼                      ▼
   ┌─────────┐   ┌────────┐            ┌────────────┐
   │delivered│   │ failed │            │ retrying   │
   └─────────┘   └───┬────┘            └─────┬──────┘
                     │                       │
                     │             ┌─────────┴─────────┐
                     │             │                   │
                     │       under deadline     past deadline
                     │             │                   │
                     │             ▼                   ▼
                     │       (back to pending)   ┌──────────┐
                     │                           │ expired  │
                     ▼                           └──────────┘
              ┌──────────────┐                       │
              │ dead-letter  │ ◀─────────────────────┘
              └──────────────┘
```

একটা delivery-র পৌঁছাতে পারা তিনটে terminal state:

- **delivered** — receiver 2xx দিয়ে response দিয়েছে, কাজ শেষ।
- **failed (permanent)** — receiver একটা permanent-class error return করেছে।
- **expired** — retry deadline একটা 2xx ছাড়াই পার হয়েছে।

`failed` আর `expired` দুটোই dead-letter queue-তে শেষ হয়। তারা _কেন_-তে ভিন্ন — alerting-এর জন্য গুরুত্বপূর্ণ, storage-এর জন্য নয়।

## DLQ একটা table হিসেবে

একটা state column সহ আপনার delivery queue-র মতোই একই table:

```sql
CREATE TABLE webhook_deliveries (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    subscription_id BIGINT NOT NULL,
    url TEXT NOT NULL,
    body BYTEA NOT NULL,
    headers JSONB NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending','in_flight','delivered','failed','expired')),
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    give_up_at TIMESTAMPTZ NOT NULL,
    last_status INT,
    last_response BYTEA,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX webhook_deliveries_pending ON webhook_deliveries(next_attempt_at)
WHERE state = 'pending';

CREATE INDEX webhook_deliveries_dlq ON webhook_deliveries(updated_at DESC)
WHERE state IN ('failed', 'expired');
```

DLQ শুধু `state IN ('failed', 'expired')`। কোনো আলাদা table নেই — searching, listing, replaying সবই একই table-এ query।

pending row-এর ওপর partial index DLQ বাড়লেও queue scan দ্রুত রাখে।

## কী store করবেন

dead-lettered delivery-র জন্য, debug আর replay করার মতো যথেষ্ট capture করুন:

- **পুরো body** — যেমন আছে তেমন re-deliverable।
- **পুরো header** — signature সহ।
- **শেষ response status আর body snippet** — receiver আসলে কী বলল। ~512 byte সাধারণত যথেষ্ট; দীর্ঘ response truncate করুন।
- **শেষ error** — network error বা status text।
- **সব attempt timestamp** — "এটা কখন fail শুরু করল" debug করুন।

high-traffic সিস্টেমের জন্য delivery ID দিয়ে linked একটা আলাদা `webhook_attempts` table মূল্যবান, যেখানে প্রতিটা delivery-র অনেক try থাকতে পারে:

```sql
CREATE TABLE webhook_attempts (
    delivery_id BIGINT NOT NULL REFERENCES webhook_deliveries(id) ON DELETE CASCADE,
    attempt INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    duration_ms INT,
    status INT,
    response_snippet BYTEA,
    error TEXT,
    PRIMARY KEY (delivery_id, attempt)
);
```

এখন operator-রা timeline দেখতে পারে: এই URL-এ ৮টা attempt, এই সময়ে শুরু, ওই সময়ে শেষ, শেষ response ছিল একটা Cloudflare error page সহ একটা 502 Bad Gateway।

## কখন alert দেবেন

তিনটে alerting tier আলাদা করার মতো।

**১. Per-event alert — প্রায় কখনও না।** একটা delivery DLQ-তে যাওয়া স্বাভাবিক noise। এগুলোতে page করবেন না।

**২. Per-subscription alert — failure টানা হলে।** একটা subscription-এর delivery এক ঘণ্টা ধরে DLQ'd হলে, customer-এর endpoint down। customer-কে (আর আপনার support-কে) email দিন:

```
Your webhook endpoint https://customer.com/webhooks has been failing
for 1 hour. The most recent attempts returned 503. We will continue
retrying for 3 days. If your endpoint is down, please fix it.

Last 5 events: [list]
```

১ ঘণ্টায় প্রথম email, ২৪ ঘণ্টায় দ্বিতীয়, expiry-র আগে তৃতীয়। expiry-র পরে, কী হারিয়েছে তার একটা final summary।

**৩. Producer-wide alert — systemic issue-র জন্য।** DLQ rate হঠাৎ অনেক subscription জুড়ে লাফালে, আপনার একটা producer-side bug বা network issue আছে। on-call-কে page করুন।

```yaml
- alert: WebhookDLQRateHigh
  expr: rate(webhook_deliveries_failed_total[5m]) > 10
  for: 10m
  annotations:
    summary: 'Webhook DLQ rate is {{ $value }} per second'
```

এই threshold tune করা per-environment। টাইট শুরু করুন; noise-এর ভিত্তিতে ঢিলে করুন।

## Customer dashboard

Customer-রা delivery attempt-এ visibility ছাড়া তাদের integration debug করতে পারে না। একটা UI বানান যা দেখায়:

- একটা subscription-এ পাঠানো **event-এর list**, state দিয়ে filterable।
- **Per-event detail:** request body, header, সব attempt (timestamp, status, response snippet)।
- **Resend button** — একটা delivery manually replay করুন।
- **Endpoint health summary** — success rate, average latency, current state।

Stripe-এর webhooks dashboard হলো reference। আপনার সেই মসৃণতা দরকার নেই; আপনার function দরকার। এই feature সহ একটা একেবারে সাদামাটা admin page যেকোনো পরিমাণ "view in CloudWatch" plumbing-কে হারায়।

schema এটা সরাসরি সমর্থন করে — এগুলো `webhook_deliveries` আর `webhook_attempts`-এর ওপর query। কোনো special data store নেই।

## Manual replay

Operator-দের (আর customer-দের, auth সহ) একটা "এটা আবার পাঠাও" button দরকার। Implementation:

```sql
UPDATE webhook_deliveries
SET state = 'pending',
    next_attempt_at = now(),
    give_up_at = now() + interval '72 hours',
    attempts = 0,
    last_error = NULL
WHERE id = $1
  AND state IN ('failed', 'expired', 'delivered');
```

state reset করে deadline bump করলে delivery-টা queue-তে ফিরে যায়। Worker-রা পরের scan-এ এটা তুলে নেয়।

`attempts = 0` reset করুন যাতে backoff নতুন করে শুরু হয়। নাহলে একটা manually-replayed delivery "wait 1 hour"-এ শুরু হয় কারণ আগের attempt count রয়ে গেছে।

customer-driven replay-এর জন্য, button-টাও rate-limit করুন: প্রতি subscription-এ প্রতি মিনিটে 100 replay যথেষ্ট; limit ছাড়া, একজন customer আপনার UI দিয়ে নিজের integration DDoS করতে পারে।

## Bulk replay

systemic failure-এর জন্য (একটা deploy bug 50K event DLQ'd করেছে), individual replay অবাস্তব। একটা bulk replay tool:

```sql
UPDATE webhook_deliveries
SET state = 'pending', next_attempt_at = now() + (random() * interval '5 minutes'),
    give_up_at = now() + interval '72 hours', attempts = 0
WHERE id IN (
  SELECT id FROM webhook_deliveries
  WHERE state IN ('failed', 'expired')
    AND created_at >= '2026-05-04 12:00:00'
    AND created_at <  '2026-05-04 14:00:00'
);
```

দুটো গুরুত্বপূর্ণ বিস্তারিত:

- **`next_attempt_at` ৫ মিনিট জুড়ে random-ভাবে ছড়িয়ে দিন।** নাহলে 50K replay একই মুহূর্তে queue-তে আঘাত করে worker-দের কাবু করে ফেলে।
- **একটা fresh `give_up_at` set করুন।** অতীতের deadline stale।

Bulk replay একটা ইচ্ছাকৃত operator action হওয়া উচিত, admin auth-এর পেছনে gated। প্রতিটা bulk replay log করুন (operator, count, criteria, time)। এটা webhook ops-এর "এক extra step সহ rm -rf"।

<Callout type="warn">

**Replay বিনামূল্যে নয়।** একটা bulk replay এমন POST তৈরি করে যা customer-রা আবার পায়। তাদের dedup logic (অধ্যায় ৭) correctness সামলায়; তাদের rate limit volume নাও সামলাতে পারে। replay করার আগে জানান — "আমরা গতকালের event redeliver করছি, একটা spike আশা করুন" — বিশেষ করে কয়েক হাজারের বেশি event-এর যেকোনো replay-র জন্য।

</Callout>

## Subscription-level pause

একটা subscription যখন একদিন ধরে টানা DLQ'ing করছে, retry করতে থাকা ক্ষতিকর — queue capacity পোড়াচ্ছে, সম্ভবত customer-এর bandwidth-ও। এটা pause করুন:

```sql
UPDATE webhook_subscriptions SET state = 'paused' WHERE id = $1;
```

Worker-রা paused subscription skip করে:

```sql
SELECT * FROM webhook_deliveries d
JOIN webhook_subscriptions s ON s.id = d.subscription_id
WHERE d.state = 'pending' AND s.state = 'active'
  AND d.next_attempt_at <= now()
ORDER BY d.next_attempt_at;
```

DLQ নতুন event সহ বাড়তেই থাকে, কিন্তু আর কোনো retry fire করে না। customer endpoint ঠিক করে, "resume"-এ চাপ দেয়, আর queue drain হয়।

একটা safety: pause থাকাকালীন emit হওয়া event-ও এখনও enqueue হওয়া উচিত (যাতে resume ধরে ফেলতে পারে)। subscription state-এর ভিত্তিতে enqueue skip করবেন না — সেটা নীরব data loss।

## At-least-once vs exactly-once vs at-most-once

তিনটে delivery semantics, যার মধ্যে কেবল দুটো অর্জনযোগ্য।

- **At-most-once** — event শূন্য বা একবার deliver হয়। সহজ: শুধু retry করবেন না। অকেজো: একটা network blip event হারায়।
- **At-least-once** — event এক বা একাধিকবার deliver হয়। Webhooks default-এ এটাই। Receiver dedupe করে।
- **Exactly-once** — event ঠিক একবার deliver হয়। producer আর receiver-এর মধ্যে একটা coordinated commit ছাড়া অসম্ভব, যা webhooks (HTTP POST)-এর নেই।

কিছু সিস্টেম exactly-once দাবি করে; তারা মানে "idempotent processing সহ at-least-once," যা সাজিয়ে-গুছিয়ে একই জিনিস। এর বিরুদ্ধে লড়বেন না। at-least-once delivery, আর idempotent receiver (অধ্যায় ৭) বানান।

## দীর্ঘমেয়াদী storage

DLQ entry চিরকাল বাঁচা উচিত নয়। দুটো retention strategy:

**১. Time-based।** ৩০ বা ৯০ দিন পরে delete করুন। বেশিরভাগ operator কেবল সাম্প্রতিক event debug করে।

**২. Cold storage-এ সরান।** X দিনের চেয়ে পুরনো DLQ entry একটা JSON file বা S3-তে export করুন। Postgres space খালি করুন; audit trail সংরক্ষণ করুন।

বেশিরভাগ টিম ৯০ দিনে একটা shred সহ time-based ব্যবহার করে। ৬ মাস আগের event নিয়ে customer dispute ব্যতিক্রম আর সাধারণত এমনিতেও অমীমাংসিত (তাদের data-ও চলে গেছে)।

## Contract প্রকাশ করা

প্রতিটা webhook subscription-এ document করুন:

- "আমরা ৭২ ঘণ্টা পর্যন্ত retry করি।"
- "আমরা at-least-once deliver করি; দয়া করে আপনার handler-কে `id` field-এ idempotent করুন।"
- "Permanent failure dead-lettered হয় আর আপনার dashboard-এ দৃশ্যমান।"
- "৭২ ঘণ্টা পরে, undelivered event expired mark হয়।"

Customer-রা একটা প্রতিশ্রুতির ভিত্তিতে আপনার webhook-এ sign up করেছে। প্রতিশ্রুতিই হলো contract। এটা মানুন; document করুন; support-কে সেটা দেখাতে দিন।

## রিক্যাপ

- তিনটে terminal state: delivered, failed (permanent), expired (সময় শেষ)।
- DLQ একটা state column, একটা আলাদা system নয়।
- পুরো body + header + শেষ response + per-attempt history store করুন। Replay-এর জন্য সবটা লাগে।
- টানা failure-এ per-subscription, systemic issue-তে producer-wide alert দিন। কখনও per-event নয়।
- Customer dashboard বাধ্যতামূলক: list, detail, resend button।
- Bulk replay synchronised storm এড়াতে `next_attempt_at` ছড়ায়; admin auth-এর পেছনে gated।
- চিরস্থায়ীভাবে fail করা subscription pause করুন; ঠিক হলে resume করুন।
- At-least-once-ই অর্জনযোগ্য semantics। Receiver dedupe করে।
- DLQ ৩০–৯০ দিন রাখুন, তারপর delete বা archive করুন।
- Contract প্রকাশ্যে document করুন।

পরবর্তী: [Observability ও replay](/notes/webhooks/09-observability) — dashboard, metric, trace, আর পূর্ণ operator UI।
