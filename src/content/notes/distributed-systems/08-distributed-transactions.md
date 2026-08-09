---
title: 'Distributed Transactions'
subtitle: 'Service জুড়ে পরিবর্তন সমন্বয় করা: two-phase commit ও তার blocking সমস্যা, saga, outbox pattern, এবং exactly-once নিয়ে ভুল ধারণা।'
chapter: 8
level: 'mastery'
readingTime: '12 মিনিট'
topics: ['2pc', 'saga', 'outbox']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

মারিয়াম আল-আসতুরলাবি একজন travel agent। এক গ্রাহক তাকে বললেন — সমরকন্দ যাওয়ার একটা ট্রিপ চাই, কিন্তু flight, hotel আর car ভাড়া — তিনটাই একসাথে লাগবে, নইলে কিছুই লাগবে না। একটা পেলে অথচ বাকিটা না পেলে পুরো প্ল্যান ভেস্তে যায়। তাই মারিয়াম তাড়াহুড়ো করে বুকিং না করে আগে তিন জায়গায় ফোন করলেন আর জিজ্ঞেস করলেন, "আপনারা কি সিটটা/রুমটা/গাড়িটা একটু হোল্ড করে রাখতে পারবেন?" — এখনো পাকা বুকিং নয়, শুধু তেন্টেটিভ ধরে রাখা। airline বলল "পারব", hotel বলল "পারব", car কোম্পানিও বলল "পারব"।

তিনজনই যেহেতু হ্যাঁ বলেছে, মারিয়াম এবার আবার তিন জায়গায় ফোন করে বললেন "কনফার্ম করে দিন" — তখনই তিনটা পাকা হলো। কিন্তু ধরো car কোম্পানি প্রথম ফোনেই বলত "নাহ, ওই তারিখে গাড়ি নেই" — তাহলে মারিয়াম flight আর hotel-এর হোল্ডটাও বাতিল করে দিতেন, কারণ তিনটা একসাথে ছাড়া কোনোটারই মানে নেই। আর সবচেয়ে খারাপ পরিস্থিতিটা হলো — তিনজন হ্যাঁ বলে হোল্ড করে বসে আছে, ঠিক তখন মারিয়াম অজ্ঞান হয়ে গেলেন। এখন airline, hotel, car — সবাই সিট/রুম/গাড়ি আটকে রেখে অপেক্ষা করছে, কেউ জানে না কনফার্ম হবে নাকি বাতিল, আর অন্য গ্রাহকদের কাছেও ওগুলো বেচতে পারছে না।

এই পুরো গল্পটাই আসলে **two-phase commit (2PC)**। মারিয়াম হলো **coordinator**, আর flight/hotel/car হলো **participant**। প্রথম দফায় "হোল্ড করতে পারবেন?" জিজ্ঞেস করাটা হলো **prepare** (voting) phase — প্রত্যেকে সম্পদ lock করে হ্যাঁ/না ভোট দেয়। সবাই হ্যাঁ বললে দ্বিতীয় দফায় "কনফার্ম করুন" বলাটা হলো **commit**; একজনও না বললে সব হোল্ড বাতিল করাটা হলো **abort**। আর মারিয়ামের অজ্ঞান হয়ে যাওয়াটাই হলো কুখ্যাত **blocking সমস্যা** — coordinator crash করলে participant-রা lock ধরে আটকে থাকে, নিজেরা সিদ্ধান্ত নিতে পারে না। ঠিক এ কারণেই বাস্তবে independent service জুড়ে 2PC এড়ানো হয়; তার বদলে **saga** ব্যবহার করা হয় — যেখানে প্রতিটা ধাপ আলাদাভাবে বুক হয়, আর কিছু ভেস্তে গেলে compensating action দিয়ে (যেমন বুক করা hotel-টা cancel করে) আগের ধাপগুলো undo করা হয়, কাউকে lock ধরে বসে থাকতে হয় না।

একটি single-database transaction তোমাকে ACID দেয়: এক সেট পরিবর্তন হয় সবগুলো commit হয় নয়তো সবগুলো roll back করে, atomically। যে মুহূর্তে তোমার operation দুটি database, দুটি service, বা একটি database _এবং_ একটি message broker জুড়ে বিস্তৃত হয়, সেই গ্যারান্টি উবে যায় — roll back করার মতো কোনো shared transaction নেই। একটি **distributed transaction** হলো যেকোনো কাজের একক যা একাধিক স্বাধীন সিস্টেম জুড়ে কার্যকর হতে হবে। এই অধ্যায় এমন কাজ নির্ভরযোগ্য করার কৌশলগুলো পর্যালোচনা করে, ক্লাসিক-কিন্তু-ত্রুটিপূর্ণ two-phase commit থেকে বেশিরভাগ production সিস্টেম আসলে যেসব প্যাটার্ন ব্যবহার করে সেগুলো পর্যন্ত।

## Two-phase commit (2PC)

পাঠ্যবইয়ের উত্তর হলো **two-phase commit**, যা একটি **coordinator** আনে যেটা participant-দের দুটি দফার মধ্য দিয়ে চালায়:

```text
Phase 1 — PREPARE (voting):
  Coordinator -> all participants: "prepare to commit"
  Each participant does the work, locks resources, writes to its log,
    and replies YES (I can commit) or NO (I must abort).

Phase 2 — COMMIT / ABORT (decision):
  If ALL voted YES -> Coordinator -> all: "commit"
  If ANY voted NO  -> Coordinator -> all: "abort"
  Participants act, release locks, and acknowledge.
```

একবার একটি participant দফা ১-এ YES ভোট দিলে, এটা _প্রতিশ্রুতি_ দিয়েছে যে জিজ্ঞেস করলে commit করবে — এটাকে তার lock ধরে রেখে অপেক্ষা করতে হবে, নিজে সিদ্ধান্ত নিতে অক্ষম। সেই প্রতিশ্রুতিই 2PC-র মারাত্মক দুর্বলতার উৎস।

### Blocking সমস্যা

ধরো প্রতিটি participant YES ভোট দিয়েছে, আর তারপর দফা-২ সিদ্ধান্ত পাঠানোর আগে **coordinator crash করে**। প্রতিটি participant এখন আটকে গেছে: এটা commit করতে পারে না (হয়তো কেউ NO ভোট দিয়েছিল) আর abort করতে পারে না (হয়তো সবাই YES ভোট দিয়েছিল আর coordinator ইতিমধ্যে কাউকে commit করতে বলেছে)। এটাকে তার lock ধরে রেখে **block** করতে হবে, coordinator সেরে ওঠার অপেক্ষায়। ততক্ষণ পর্যন্ত, lock করা row গুলো অন্য সবার কাছে অনুপলব্ধ।

```text
P1: voted YES  -> locked, waiting...
P2: voted YES  -> locked, waiting...
Coordinator: [CRASHED]   <- nobody can safely proceed
```

এটা coordinator-কে একটি single point of failure বানায় যা সিস্টেম জমিয়ে দিতে পারে। তাই 2PC একটি **CP** protocol (অধ্যায় ৫): এটা availability-র বিনিময়ে consistency রক্ষা করে, আর একটি coordinator failure participant-দের অনির্দিষ্টকালের জন্য আটকে রাখতে পারে। (Three-phase commit blocking কমায় কিন্তু round যোগ করে আর তারপরও partition-এ fail করে, তাই এটা খুব কমই ব্যবহৃত হয়।)

<Callout type="warning">

**Service জুড়ে 2PC এড়াও।** এর synchronous locking প্রতিটি participant-এর availability জোড়া লাগায় — পুরো transaction ততটাই available যতটা _সবচেয়ে কম_ available service, আর একটি coordinator crash lock ধরে থাকা সবাইকে block করে। এটা একটি একক দৃঢ়ভাবে-জোড়া সিস্টেমের ভেতরে গ্রহণযোগ্য (যেমন একটি distributed database-এর internal commit) কিন্তু স্বাধীন microservice সমন্বয়ের জন্য বাজে।

</Callout>

## Saga

যেহেতু 2PC service-থেকে-service কাজের জন্য খুব ভঙ্গুর, বেশিরভাগ সিস্টেম **saga** ব্যবহার করে। একটি saga একটি বড় distributed transaction-কে **local** transaction-এর একটি ক্রমে ভাঙে, প্রত্যেকটি তার নিজের service-এ স্বাধীনভাবে commit করা। কোনো global lock নেই। একটি ধাপ fail করলে, saga **compensating transaction** চালায় যা সম্পন্ন ধাপগুলোকে semantically পূর্বাবস্থায় নেয় — কোনো rollback নেই, শুধু ইচ্ছাকৃত "undo" action।

```text
Order saga (happy path):
  1. Order service:    create order        (local commit)
  2. Payment service:  charge card         (local commit)
  3. Inventory service: reserve stock      (local commit)
  4. Shipping service: schedule shipment   (local commit)

If step 3 fails:
  Compensate 2: refund the card
  Compensate 1: cancel the order
```

গুরুত্বপূর্ণ মানসিক পরিবর্তন: একটি saga **atomic নয় আর isolated নয়**। এমন মধ্যবর্তী অবস্থা আছে যেখানে order আছে কিন্তু পরিশোধ হয়নি, অন্য transaction-এর কাছে দৃশ্যমান। তোমাকে সেই অবস্থাগুলো গ্রহণযোগ্য হওয়ার মতো ডিজাইন করতে হবে, আর বাইরে দৃশ্যমান প্রভাব আছে এমন প্রতিটি ধাপের জন্য একটি compensating action লিখতে হবে (তুমি একটি charge refund করতে পারো, কিন্তু একটি email un-send করতে পারো না — তাই email-টা শেষে আসার মতো, বা cancelable হওয়ার মতো ডিজাইন করো)।

Saga দুটি সমন্বয় স্বাদে আসে:

|            | Orchestration                                                           | Choreography                                                                           |
| ---------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| নিয়ন্ত্রণ | একটি কেন্দ্রীয় **orchestrator** প্রতিটি service-কে বলে পরে কী করতে হবে | প্রতিটি service event-এ প্রতিক্রিয়া করে ও পরের event ছাড়ে; কোনো কেন্দ্রীয় brain নেই |
| দৃশ্যমানতা | Flow এক জায়গায় সুস্পষ্ট, অনুসরণ ও monitor করা সহজ                     | Flow উদ্ভূত, service জুড়ে ছড়ানো, trace করা কঠিন                                      |
| Coupling   | Service গুলো orchestrator-এর সাথে জোড়া                                 | Service গুলো event schema-র সাথে জোড়া                                                 |
| উপযুক্ত    | জটিল flow, অনেক branch, স্পষ্ট ownership                                | সরল flow, শিথিল coupling, কম ধাপ                                                       |

কোনোটাই সর্বজনীনভাবে ভালো নয়। Orchestration জ্বলে ওঠে যখন workflow জটিল আর তোমার এটা নিয়ে যুক্তি সাজানোর জন্য একটি একক জায়গা দরকার; choreography জ্বলে ওঠে যখন ধাপ সরল আর তুমি ন্যূনতম কেন্দ্রীয় সমন্বয় চাও।

## Outbox pattern

Saga event ছেড়ে এগোয়, যা একটি সূক্ষ্ম কিন্তু হিংস্র bug সামনে আনে। এমন একটি service ভাবো যাকে দুটি জিনিস করতে হবে: তার database-এ একটি row commit করা _এবং_ একটি message broker-এ একটি event publish করা। এগুলো দুটি ভিন্ন সিস্টেম, তাই তারা একটি transaction ভাগ করতে পারে না। তুমি যে order-ই বেছে নাও, মাঝখানে একটি crash তাদের inconsistent রেখে যায়:

```text
  commit DB row, then crash, then... event never published   -> lost event
  publish event, then crash, then... DB commit fails          -> phantom event
```

এটাই **dual-write সমস্যা**, আর যতক্ষণ তুমি দুটি সিস্টেমে আলাদাভাবে লেখো ততক্ষণ এর কোনো সমাধান নেই। **Outbox pattern** critical path-এ _শুধু একটি_ সিস্টেমে লিখে এটা দ্রবীভূত করে। যে একই local database transaction তোমার business data বদলায়, তার ভেতরেই, তুমি event-টাকেও একটি **outbox table**-এ insert করো:

```sql
BEGIN;
  UPDATE orders SET status = 'paid' WHERE id = 42;
  INSERT INTO outbox (event_type, payload)
    VALUES ('OrderPaid', '{"orderId": 42}');
COMMIT;
```

যেহেতু দুটি write-ই একটি ACID transaction-এ, তারা একসাথে সফল বা fail করে — কোনো dual write নেই। একটি আলাদা **relay process** তারপর outbox থেকে নতুন row পড়ে আর broker-এ publish করে, acknowledge হওয়া মাত্রই সেগুলোকে sent চিহ্নিত করে। Relay publish-এর মাঝপথে crash করলে, এটা শুধু restart-এ retry করে; event এখনো নিরাপদে outbox-এ আছে।

<Callout type="info">

**নোট:** Outbox relay **at-least-once** delivery গ্যারান্টি দেয়, exactly-once নয়। Relay একটি event publish করতে পারে আর তা রেকর্ড করার আগে crash করতে পারে, তারপর restart-এর পর একই event আবার publish করতে পারে। এটা অনিবার্য এবং _ঠিক আছে_ — এটা duplicate সমস্যা consumer-এর কাছে ঠেলে দেয়, যেখানে idempotency (নিচে) এটা পরিষ্কারভাবে সামলায়। Relay outbox পড়তে পারে polling করে বা, আরও দক্ষভাবে, database-এর change log অনুসরণ করে (change data capture)।

</Callout>

## Idempotency key

একটি operation **idempotent** যদি এটা দুবার করা একবার করার মতো একই প্রভাব রাখে। at-least-once delivery আর retry-র জগতে, idempotency ঐচ্ছিক নয় — এটাই একমাত্র জিনিস যা তোমার আর double charge-এর মাঝে দাঁড়িয়ে আছে। প্রমিত কৌশল হলো একটি **idempotency key**: caller request-এ একটি unique ID সংযুক্ত করে, আর server রেকর্ড করে কোন key গুলো এটা ইতিমধ্যে process করেছে।

```text
Request carries: Idempotency-Key: 7f3a-...

Server:
  if key already in processed table:
      return the SAVED response   (do NOT re-run the work)
  else:
      do the work, store (key -> result) in the SAME transaction
      return the result
```

Key আর result কাজটার _একই transaction_-এ সংরক্ষণ করতে হবে; নয়তো কাজ করা আর key রেকর্ড করার মাঝে একটি crash duplicate window আবার খুলে দেয়। সঠিকভাবে করলে, একটি retry-হওয়া request চেনা যায় আর মূল ফলাফল ফেরত দেওয়া হয় — request যতবারই আসুক না কেন card ঠিক একবার charge হয়।

## Exactly-once: ভুল ধারণা আর বাস্তবতা

তুমি শুনবে সিস্টেম **exactly-once delivery** বিজ্ঞাপন দিচ্ছে। আক্ষরিক অর্থে নিলে, একটি অনির্ভরযোগ্য network জুড়ে, এটা **অসম্ভব**: প্রেরক কখনো জানতে পারে না একটি হারানো acknowledgment মানে message পৌঁছায়নি নাকি _ack_ হারিয়েছে, তাই তাকে হয় message হারানোর ঝুঁকি নিতে হবে (at-most-once) নয়তো এটা duplicate করার ঝুঁকি নিতে হবে (at-least-once)। wire-এ কোনো তৃতীয় বিকল্প নেই।

যা অর্জনযোগ্য — আর "exactly-once" বাস্তবে যা আসলে বোঝায় — তা হলো **exactly-once _processing_** (_effectively-once_-ও বলা হয়): message একাধিকবার _deliver_ হতে পারে, কিন্তু state-এ তাদের _প্রভাব_ ঠিক একবার ঘটে। রেসিপিটা সবসময় একই:

> **at-least-once delivery** (acknowledge হওয়া পর্যন্ত retry) **+ idempotent processing** (idempotency key দিয়ে deduplication) **= exactly-once প্রভাব।**

তাই সৎ কাঠামোটা হলো: delivery-কে exactly-once বানানোর চেষ্টা বন্ধ করো। Delivery-কে at-least-once ও নির্ভরযোগ্য বানাও, তারপর processing-কে idempotent বানাও। সেই সংমিশ্রণ তোমাকে মানুষ আসলে যা চায় সেই আচরণ দেয়।

<Callout type="tip">

**একটি সুসংগত কৌশল:** প্রতিটি service থেকে নির্ভরযোগ্যভাবে event ছাড়তে **outbox** ব্যবহার করো (at-least-once), cross-service workflow চালাও **saga** প্লাস compensation দিয়ে (কোনো global lock নেই), আর প্রতিটি consumer-কে idempotency key দিয়ে **idempotent** বানাও (যাতে duplicate নিরীহ হয়)। এই তিনজন ভঙ্গুর 2PC-কে এমন একটি ডিজাইন দিয়ে প্রতিস্থাপন করে যা partial failure-এ available থাকে — ঠিক সেই অবস্থান যার উপর অধ্যায় ৯ গড়ে।

</Callout>
