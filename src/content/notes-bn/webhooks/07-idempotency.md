---
title: 'Receiver-এ idempotency'
subtitle: 'At-least-once delivery মানে duplicate। receiver-এর কাজ তবুও exactly once process করা। inbox pattern — dedupe key, atomic claim, idempotent side effect — সেটাই উপায়।'
chapter: 7
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['webhooks', 'idempotency', 'inbox pattern', 'dedup', 'transactions']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

producer acknowledge না পাওয়া পর্যন্ত retry করে। receiver মাঝেমধ্যে processing আর ACK-এর মাঝে crash করে। দুটো behaviour-ই সঠিক। অনিবার্য পরিণতি হলো কিছু webhook deliver হয়, process হয়, আর _তারপর_ producer retry করে কারণ সে ACK কখনও দেখেনি।

receiver-কে সেটা সামলাতে হবে। প্রতিটা event exactly once process করুন, দুবার (বা দশবার) এলেও। এই অধ্যায়টা receiver-এর idempotency গল্প — কোডে ছোট, correctness-এ বড়।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Idempotency অনেকটা একটা elevator button দুবার চাপার মতো — দ্বিতীয় চাপে কিছু হয় না, elevator তবুও একবারই আসে।

</Callout>

## "idempotent" আসলে কী মানে

একটা handler idempotent যদি **একই input-এ দুবার চালালে একবার চালানোর মতোই একই end state তৈরি হয়**।

```
Process(event A) once  ->  state X
Process(event A) twice ->  state X (not X again, just X)
```

কিছু operation স্বাভাবিকভাবেই idempotent:

- একটা value **set করা**: `user.email = 'a@b'` — কতবার set করলেন তা নির্বিশেষে একই end state।
- একটা set-এ **যোগ করা:** `tags.add("blue")` — আগে থেকেই থাকলে no-op।
- ID দিয়ে **delete করা:** `DELETE FROM users WHERE id = 42` — দ্বিতীয়বার কোনো row নেই, একই ফলাফল।

কিছু নয়:

- একটা counter **increment করা:** `views = views + 1` — দুবার চললে, দুবার increment। ভুল।
- unique constraint ছাড়া একটা **row insert করা** — দুটো event, দুটো row।
- একটা **card charge করা** — দুটো event, দুটো charge। মূল পাপ।

non-idempotent operation-এর জন্য, receiver-এর একটা explicit dedupe layer দরকার।

## inbox pattern

আপনি সফলভাবে process করা প্রতিটা event ID track করুন। কাজ করার আগে, check করুন ID-টা দেখেছেন কিনা। দেখে থাকলে, ack করে এগিয়ে যান। না দেখলে, কাজটা করুন আর ID record করুন — atomically।

```sql
CREATE TABLE webhook_inbox (
    event_id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    result JSONB
);
```

receiver flow:

```go
func process(ctx context.Context, event Event) error {
    tx, err := db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // try to insert; if dup, we've seen this event
    _, err = tx.Exec(ctx,
        `INSERT INTO webhook_inbox (event_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        event.ID,
    )
    if err != nil {
        return err
    }

    // check if it's still pending
    var processedAt sql.NullTime
    err = tx.QueryRow(ctx,
        `SELECT processed_at FROM webhook_inbox WHERE event_id = $1 FOR UPDATE`,
        event.ID,
    ).Scan(&processedAt)
    if err != nil {
        return err
    }
    if processedAt.Valid {
        // already processed — return success without re-running side effects
        return tx.Commit()
    }

    // do the actual work
    if err := handleEvent(ctx, tx, event); err != nil {
        return err // tx rolls back; will retry on next delivery
    }

    // mark processed
    _, err = tx.Exec(ctx,
        `UPDATE webhook_inbox SET processed_at = now() WHERE event_id = $1`,
        event.ID,
    )
    if err != nil {
        return err
    }

    return tx.Commit()
}
```

এই গড়ন থেকে তিনটে guarantee:

1. **inbox row insert করা side effect-এর সাথে atomic।** transaction হয় দুটোই commit করে অথবা কোনোটাই না।
2. **Concurrent duplicate delivery `FOR UPDATE`-এ serialize হয়।** প্রথমটা process করে; দ্বিতীয়টা `processed_at IS NOT NULL` দেখে re-run ছাড়াই ack করে।
3. **handler-এর মাঝপথে crash কোনো inbox row রাখে না** (transaction rolled back), তাই পরের delivery কাজটা পরিষ্কারভাবে করে।

এটাই standard inbox pattern। আপনার domain logic-এর চারপাশে ~৩০ লাইন Go।

## "side effect" কী কী অন্তর্ভুক্ত করে

transaction-কে **দৃশ্যমান প্রভাব আছে এমন সবকিছু** মুড়তে হবে:

- DB write (স্পষ্টটা)।
- External API call — এগুলোই ফাঁদ। "একটা confirmation email পাঠাও" এমন webhook Postmark-কে call করছে; email send যদি logic-এ একই transaction-এ থাকে কিন্তু আসলে atomic না হয়, আপনি দুবার email করতে পারেন। External API call করার সময় idempotency key ব্যবহার করুন।
- Outbound webhook fan-out — একই সমস্যা; outbox pattern ব্যবহার করুন (অধ্যায় ১০)।
- File system operation — এগুলোর জন্য filename event ID থেকে derive করুন যাতে re-run একই file overwrite করে।

```go
func handleEvent(ctx context.Context, tx *sql.Tx, event Event) error {
    // DB writes — these are inside the transaction, atomic
    if _, err := tx.Exec(ctx, `UPDATE users SET ...`, ...); err != nil {
        return err
    }

    // External API call — idempotency key tied to event ID
    if err := postmark.Send(postmark.Email{
        IdempotencyKey: event.ID,
        ...
    }); err != nil {
        return err
    }

    // Triggering an outbound webhook — outbox row in same tx
    _, err := tx.Exec(ctx, `INSERT INTO outbox ...`, ...)
    return err
}
```

যেসব External API idempotency key সমর্থন করে না সেগুলোই সবচেয়ে ঝামেলার। Option:

- একটা "check-then-act" ব্যবহার করুন — API দিয়ে check করুন side effect ইতিমধ্যে ঘটেছে কিনা, ঘটলে skip করুন। Race-conditional কিন্তু প্রায়ই গ্রহণযোগ্য।
- call-টা আপনার নিজের একটা outbound webhook-এ সরান; আপনার idempotent processor-এর ওপর ভরসা করুন।
- Duplicate accept করুন আর জোরালোভাবে log করুন।

## Outbound call-এর জন্য idempotency key

অনেক API (Stripe, Postmark, Twilio) একটা `Idempotency-Key` header accept করে। আপনার event ID ব্যবহার করে:

```go
req.Header.Set("Idempotency-Key", event.ID)
```

remote service কোনো একটা window-এর জন্য (সাধারণত ২৪ ঘণ্টা) key-র ওপর dedupe করে। একই key দিয়ে একটা retry আবার charge বা send না করে মূল result ফেরত দেয়। জীবনরক্ষাকারী।

remote call-এ টাকা লাগলে (charge, email send), idempotency key ঐচ্ছিক নয়।

## Dedup window — কতক্ষণ মনে রাখবেন

inbox event-এর সাথে linearly বাড়ে। এক বছর পরে, বিলিয়ন row। দুটো strategy:

**১. পুরনো inbox row expire করুন।** producer-এর max retry window (৩–৫ দিন)-এর চেয়ে পুরনো যেকোনো কিছু delete করা নিরাপদ। এর চেয়ে পুরনো কিছু এলে, তা "current" থেকে এত দূরে যে আপনি নিজের policy ঠিক করতে পারেন (সম্ভবত stale হিসেবে reject)।

```sql
DELETE FROM webhook_inbox WHERE received_at < now() - interval '7 days';
```

প্রতিদিন cron দিয়ে চালান। producer-এর retry deadline-এর চেয়ে আরামসে বড় যেকোনো window-তে ছাঁটুন।

**২. চিরকাল রাখুন।** কেবল low-volume webhook receiver-এর জন্য কার্যকর (কখনও 1M event-এর নিচে)। একটা cleanup job চালানোর চেয়ে সস্তা, আর audit-এর জন্য history পান।

বেশিরভাগ receiver-এর জন্য, ৭–১৪ দিনে expire করাই সঠিক tradeoff।

<Callout type="warn">

**dedup window-কে producer-এর retry deadline-এর চেয়ে ছোট করবেন না।** ২৪ ঘণ্টা পরে row delete করলেন কিন্তু producer ৩ দিন retry করে, তাহলে একই event দ্বিতীয় দিনে আবার process হতে পারে।

</Callout>

## event ID না থাকলে বা অবিশ্বস্ত হলে?

যে receiver producer-এর `event.id`-কে unique বলে বিশ্বাস করে, সে একটা অনুমান করছে। খ্যাতিমান producer-এর সাথে প্রায় সবসময় নিরাপদ; অজানা integration-এর সাথে কম নিরাপদ।

Belt-and-braces: canonical body-র একটা hash থেকে একটা dedup key derive করুন:

```go
key := event.ID
if key == "" {
    h := sha256.Sum256(rawBody)
    key = "body_" + hex.EncodeToString(h[:])
}
```

এখন একটা unique ID ছাড়াও যেকোনো duplicate body dedupable। CPU খরচ করে; producer bug থেকে রক্ষা করে।

## Redis-based dedup নিয়ে

TTL সহ Redis SETNX একটা Postgres table-এর একটা লোভনীয় বিকল্প:

```go
ok, _ := rdb.SetNX(ctx, "inbox:"+event.ID, "1", 7*24*time.Hour).Result()
if !ok {
    return nil // duplicate
}
```

এটা **dedup decision-এর জন্য** কাজ করে কিন্তু **side effect-এর সাথে atomicity-র জন্য** নয়। আপনার কাজ যদি "Postgres update" হয়, Redis SETNX আর Postgres write দুটো সিস্টেমে — আপনি Redis-এ SETNX করতে পারেন, তারপর Postgres commit করার আগে crash করতে পারেন, আর retry-তে Redis বলে "duplicate" আর কাজটা কখনও হয় না।

দুটো pattern Redis-based dedup-কে নিরাপদ করে:

**A. কাজ commit হওয়ার পরে SETNX।** প্রথমে DB কাজটা atomically করুন, তারপর SETNX। retry-তে: কাজটা যদি একটা no-op হয় (upsert-এর কল্যাণে DB layer-এ idempotent), দ্বিতীয় processor SETNX-এ পৌঁছে দেখে সেট আছে, ack করে। কেবল তখনই কাজ করে যখন অন্তর্নিহিত operation নিজেই স্বাভাবিকভাবে idempotent (UPSERT, set-equals-value)।

**B. Two-phase।** শুরুতে একটা short TTL (৫ মিনিট) সহ SETNX; কাজ করুন; success-এ, TTL-টা dedup window পর্যন্ত extend করুন। crash-এ, short TTL expire করে আর পরের delivery পরিষ্কারভাবে retry করে।

Postgres-based inbox সরল। মাপা কারণ না থাকলে সেটাই ব্যবহার করুন।

## Duplicate-এ receiver 200 return করে

একটা duplicate event receiver-এর surface করার মতো **error নয়**। 200 return করুন। producer success দেখে, retry থামায়, এগিয়ে যায়।

```go
if alreadyProcessed {
    w.WriteHeader(http.StatusOK)
    log.Printf("dedup: event %s already processed", event.ID)
    return
}
```

অন্য কিছু return করা (4xx, 5xx) producer-কে retry করতেই থাকতে বাধ্য করে। worst case, producer এমন একটা event-এ আটকে যায় যেটাকে receiver "খারাপ" ভাবছে কিন্তু আসলে একটা re-delivery।

## Ordering — webhooks এর guarantee দেয় না

একটা retry pattern _out-of-order_ delivery তৈরি করে। Event A t=0-এ পাঠানো হয়, fail করে। Event B t=1-এ পাঠানো হয়, succeed করে। Event A t=60-এ retry করে — receiver A-কে B-র _পরে_ দেখে।

আপনি order-এর ওপর নির্ভর করলে ("user.updated-এর আগে user.created আসতে হবে"), আপনার সমস্যা আছে। তিনটে উপায়:

**১. এর ওপর নির্ভর করবেন না।** বেশিরভাগ state-update webhook যেখানে payload পুরো resource, সেখানে ordering গুরুত্বপূর্ণ নয় — arrival order নির্বিশেষে সর্বশেষ event জেতে।

**২. Sequence number।** producer প্রতি resource-এ একটা monotonic `sequence` যোগ করে। receiver কেবল তখনই apply করে যদি `event.sequence > last_seen_for_resource`। Out-of-order event drop হয়।

```go
if event.Sequence <= lastSeen[event.ResourceID] {
    return nil // skip stale event
}
lastSeen[event.ResourceID] = event.Sequence
```

**৩. পূর্বশর্ত আসা পর্যন্ত processing pause করুন।** user 42-এর একটা `user.updated` আসে কিন্তু এখনও কোনো `user.created` নেই — কিছুক্ষণ buffer করুন, তারপর process করুন। জটিল আর error-prone; সাধারণত মূল্য নেই।

Sequence number হলো সেসব resource-এর জন্য সঠিক tool যেখানে order গুরুত্বপূর্ণ। producer-কে সেগুলো event payload-এ অন্তর্ভুক্ত করতে হবে।

## Processing চলাকালীন failure

মাঝপথে throw করা handler আংশিকভাবে commit করা উচিত নয়। উপরের transaction pattern দিয়ে, একটা throw করা error rollback করে — কোনো inbox row নেই, কোনো side effect নেই। পরের delivery শুরু থেকে retry করে।

আপনার handler multi-step কাজ করলে যা মিনিট নেয়, দীর্ঘ transaction lock ধরে রাখে; ভালো:

1. একটা short transaction-এ inbox row insert করুন (claim)।
2. transaction ছাড়া দীর্ঘ কাজটা করুন।
3. একটা দ্বিতীয় short transaction-এ processed mark করুন।

Trade-off: step 2 আর 3-এর মাঝে, একটা crash মানে কাজটা হয়েছে কিন্তু inbox mark হয়নি। পরের delivery কাজটা re-run করে। হয় বিরল duplicate accept করুন অথবা পৃথক operation-এর চারপাশে per-step idempotency key রাখুন।

বেশিরভাগ webhook handler-এর জন্য, কাজটা ছোট (একটা record update, একটা job enqueue)। একটা transaction ঠিক আছে।

## Receiver-side replay

debug করার সময়, আপনি একটা নির্দিষ্ট event _re-process_ করতে চাইতে পারেন। সরলতম পথ: এর inbox row clear করুন, তারপর producer থেকে redelivery ট্রিগার করুন। Receiver-এ এমন কোনো "force re-process" button থাকা উচিত নয় যা inbox bypass করে — ভুলবশত double-process করা খুব সহজ।

## রিক্যাপ

- At-least-once delivery মানে duplicate। Receiver তবুও exactly once process করে।
- Inbox pattern: প্রতি event ID-তে একটা row, side effect-এর সাথে atomic, `FOR UPDATE` concurrent dupe serialize করে।
- **সব** side effect একই transaction-এ মুড়ুন, DB write আর outbound queue row সহ।
- remote service-এ dedupe করতে outbound API call-এ `Idempotency-Key` ব্যবহার করুন।
- producer-এর retry window + buffer-এর চেয়ে পুরনো inbox row expire করুন।
- event ID বিশ্বাসযোগ্য না হলে body hash-এ fall back করুন।
- Redis SETNX একা DB কাজের সাথে atomic নয় — Postgres inbox সরল tool।
- Duplicate-এ 200 return করুন। কখনও error নয়।
- Out-of-order delivery-ই default। order গুরুত্বপূর্ণ হলে sequence number ব্যবহার করুন।
- দীর্ঘ handler: দীর্ঘ transaction এড়াতে হলে "claim → work → mark processed"-এ ভাগ করুন।

পরবর্তী: [Delivery guarantee ও dead-letter queue](/notes/webhooks/08-delivery-dlq) — retry ফুরিয়ে গেলে কী হয়, আর কী করবেন ঠিক করার operator interface।
