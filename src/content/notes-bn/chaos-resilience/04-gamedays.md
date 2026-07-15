---
title: 'GameDays'
subtitle: 'একটা দলের সাথে কীভাবে একটা কাঠামোবদ্ধ chaos experiment চালাবেন — planning, execution, post-mortem, এবং resilience culture গড়া।'
chapter: 4
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['GameDay', 'incident simulation', 'post-mortem', 'runbooks', 'team exercises']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা fire drill: চমক নয় — সবাই জানে এটা হচ্ছে, exit-গুলো আগে থেকে দেখে নেওয়া হয়, আর পরে আপনি লক্ষ করেন কী করতে বেশি সময় লাগল। উদ্দেশ্য মানুষকে ভয় দেখানো নয়; বরং নিশ্চিত করা যে আসল আগুন লাগলে প্রতিক্রিয়াটা অনুশীলন করা muscle memory হবে, প্রথমবারের chaos নয়।

</Callout>

## গল্পে বুঝি

সমুদ্রের ধারের একটা ছোট শহর। প্রতি বছর ঘূর্ণিঝড়ের মৌসুম আসার আগে ইবনে সিনা, শহরের দুর্যোগ-প্রস্তুতি কমিটির প্রধান, একটা দিন আগে থেকেই ঠিক করে রাখেন — আজ পুরো শহর মিলে একটা full-scale ঘূর্ণিঝড় মহড়া হবে। এটা কোনো চমক নয়; সবাই জানে দিনটা কবে। নির্দিষ্ট সময়ে সাইরেন বাজে, পরিবারগুলো তাদের জিনিসপত্র গুছিয়ে নির্ধারিত আশ্রয়কেন্দ্রের দিকে হাঁটতে শুরু করে, স্বেচ্ছাসেবকরা যে যার দায়িত্বে চলে যায় — কেউ গেট সামলায়, কেউ নামের তালিকা মিলিয়ে দেখে সবাই এসে পৌঁছেছে কিনা, কেউ নৌকা প্রস্তুত রাখে।

মহড়া শেষ হওয়ার পর ইবনে সিনা সবাইকে নিয়ে বসেন। আল-খোয়ারিজমি জানায় আশ্রয়কেন্দ্রের একটা গেটের তালা আটকে গিয়েছিল, খুলতে দশ মিনিট লেগেছে। ফাতিমা আল-ফিহরি ধরিয়ে দেন যে বয়স্কদের নামের তালিকাটা কারো কাছেই ছিল না, তাই কে বাকি আছে বোঝা যাচ্ছিল না। কেউ কাউকে দোষ দেয় না — সবাই মিলে নোট করে রাখে কোন জিনিসটা ঠিক করতে হবে, যাতে আসল ঝড় যেদিন আসবে সেদিন এই ভুলগুলো আর না হয়।

এই পরিকল্পিত মহড়াই আসলে একটা **GameDay**। আগে থেকে দিন ঠিক করা মহড়া = নির্ধারিত GameDay; পুরো শহরের একসাথে অনুশীলন = পুরো দলের মিলে incident response চর্চা করা; পরে বসে কী কী ভুল হলো তার পর্যালোচনা = আপনার process আর tooling-এর ফাঁকফোকর খুঁজে বের করা; আর বারবার মহড়া দিয়ে সবার কাজটা মুখস্থ হয়ে যাওয়া = দলের মধ্যে muscle memory গড়ে তোলা। বাস্তবে দমকল বিভাগ, হাসপাতাল আর উপকূলীয় শহরগুলো ঠিক এভাবেই নিয়মিত drill চালায় — কারণ আসল বিপর্যয়ের মুহূর্তটা নতুন কিছু শেখার সময় নয়, চর্চা করা প্রতিক্রিয়া প্রয়োগ করার সময়।

## GameDay কী

একটা GameDay হলো একটা নির্ধারিত chaos engineering exercise যেখানে একটা দল ইচ্ছাকৃতভাবে কিছু ভাঙে আর প্রতিক্রিয়া অনুশীলন করে। ad-hoc experiment-এর বিপরীতে, একটা GameDay হলো একটা কাঠামোবদ্ধ team event:

- Exercise-এর আগে নির্ধারিত scope এবং hypothesis
- নির্দিষ্ট role-এ দলের সদস্যরা (chaos engineer, observer, on-call)
- Experiment চলাকালীন রিয়েল-টাইম যোগাযোগ
- পরে একটা আনুষ্ঠানিক post-mortem

GameDay দুটো জিনিস গড়ে তোলে: টেকনিক্যাল resilience (আপনি আসল দুর্বলতা খুঁজে বের করে fix করেন) এবং team resilience (মানুষ নিরাপদ পরিবেশে incident response অনুশীলন করে)।

## একটা GameDay পরিকল্পনা

**৪-৬ সপ্তাহ আগে:**

```
□ Choose the scenario (what failure are you simulating?)
□ Define steady state and success/failure criteria
□ Identify blast radius and safeguards
□ Book calendar time (2-4 hours, during business hours)
□ Notify stakeholders (customer success, leadership)
□ Prepare rollback procedures
```

**১ সপ্তাহ আগে:**

```
□ Review runbooks for the scenario
□ Confirm monitoring dashboards are ready
□ Test kill switch / abort procedure
□ Brief participating engineers on their roles
□ Prepare communication templates (status page messages, Slack updates)
```

**একটা scenario বেছে নেওয়া:** এমন failure mode বাছুন যা বাস্তবসম্মত কিন্তু যার জন্য আপনি এখনো পুরোপুরি আপনার resilience validate করেননি:

- "আমাদের primary database অনুপলব্ধ হলে কী হয়?"
- "আমাদের payment provider ৫ মিনিট ধরে 500 রিটার্ন করলে কী হয়?"
- "peak traffic-এর সময় তিনটার একটা app server নেমে গেলে কী হয়?"
- "Redis (আমাদের session store) unreachable হলে কী হয়?"

## একটা GameDay-এর সময় Role-গুলো

**Chaos Engineer:** Fault injection চালায়। ঠিক কোন command চালাতে হবে আর কীভাবে থামাতে হবে জানে। শুধু একজন এটা করে — বিভ্রান্তি এড়ায়।

**Incident Commander:** দলের প্রতিক্রিয়া সমন্বয় করে। Escalation আর termination সম্পর্কে সিদ্ধান্ত নেয়। আদর্শভাবে on-call rotation-এর lead।

**Observer(s):** Metrics, dashboard, আর log দেখে। রিয়েল-টাইমে যা দেখে ডকুমেন্ট করে। হস্তক্ষেপ করে না — observe করে আর রিপোর্ট করে।

**Communicator:** Exercise চলাকালীন বাহ্যিক যোগাযোগ সামলায় (status page, Slack, stakeholder update)। একটা drill-এও, যোগাযোগের flow অনুশীলন করুন।

## Experiment চালানো

**৩০ মিনিট আগে:**

```bash
# Verify baseline
# All instances healthy? ✓
# Error rate < 0.1%? ✓
# p99 latency < 200ms? ✓
# Dashboards open? ✓
# Team in #gameday-2024-01 Slack channel? ✓
```

**Experiment শুরু করুন:**

```
[10:00] Chaos Engineer: "Starting experiment. Injecting 500ms latency on payment-service."
[10:00] Observer 1: "Watching payment latency dashboard"
[10:00] Observer 2: "Watching error rate and circuit breaker state"
[10:00] Incident Commander: "Confirmed. Abort condition: error rate > 2% sustained for 2+ minutes"
```

**Experiment চলাকালীন — রিয়েল-টাইম logging:**

```
[10:01] Observer 1: "Payment p99 climbing: 120ms → 680ms"
[10:01] Observer 2: "Checkout error rate: 0.2% (below abort threshold)"
[10:02] Observer 1: "Circuit breaker status: CLOSED"
[10:03] Observer 2: "Error rate: 0.8% — approaching threshold"
[10:04] Observer 1: "Circuit breaker OPEN — payment calls returning 503"
[10:04] Observer 2: "Checkout error rate: 4.2% — EXCEEDED THRESHOLD"
[10:04] Incident Commander: "Abort. Chaos Engineer: stop fault injection now."
[10:04] Chaos Engineer: "Fault injection stopped. tc rules removed."
[10:05] Observer 1: "Payment latency returning to baseline"
[10:06] Observer 2: "Error rate recovering: 1.2% → 0.3%"
[10:07] Incident Commander: "System recovered. Steady state restored."
```

**আপনি যা শিখলেন:** Circuit breaker যেমন ডিজাইন করা হয়েছিল তেমনভাবেই open হলো, কিন্তু open হওয়ার আগে checkout error rate অনেক বেশি spike করল। Threshold (open হওয়ার আগে 50% failure rate) খুব বেশি উদার। Action: threshold 30%-এ নামান।

## Abort Conditions

শুরুর আগেই এগুলো সংজ্ঞায়িত করুন। যে মুহূর্তে কোনো condition পূরণ হয়, সব থামান:

```
Abort conditions for this GameDay:
□ Error rate > 2% sustained for > 2 minutes
□ Any complete loss of a service (0 healthy instances)
□ Customer-visible data corruption
□ Team member requests abort for any reason

Abort procedure:
1. Chaos Engineer runs: ./scripts/chaos-stop.sh
2. Incident Commander: "Aborting GameDay. All hands on recovery."
3. Observer: document timestamp and metrics at abort
4. Normal incident response begins if system doesn't recover in 5 minutes
```

Abort করায় কোনো লজ্জা নেই। আপনি কিছু শিখেছেন: আপনার safety margin আশার চেয়ে টাইট ছিল।

## Post-Mortem

স্মৃতি তাজা থাকতে ৪৮ ঘণ্টার মধ্যে চালান। Blameless — লক্ষ্য সিস্টেমের উন্নতি, দোষ চাপানো নয়।

**গঠন:**

```markdown
## GameDay Post-Mortem: Payment Latency — 2024-01-15

### What we tested

Injected 500ms latency on payment-service for 7 minutes

### Hypothesis

Error rate would remain < 0.5% due to circuit breaker protection

### What happened

- Circuit breaker opened at T+4m (as designed)
- But checkout errors peaked at 4.2% at T+4m before breaker opened
- Recovery was clean once fault injection stopped (< 2 minutes)

### What worked

✓ Circuit breaker opened automatically
✓ Monitoring dashboards showed the issue clearly
✓ System recovered without manual intervention

### What didn't work

✗ Circuit breaker threshold (50% errors) too high — too many users hit errors before it opened
✗ Runbook for "payment degraded" was hard to find (buried in Notion)
✗ Communicator didn't know how to update status page

### Action items

1. Lower circuit breaker error threshold to 30% [Owner: @alice, Due: Jan 22]
2. Move payment runbook to top-level docs [Owner: @bob, Due: Jan 19]
3. Status page update training for all team members [Owner: @carol, Due: Jan 31]
4. Add GameDay for "payment fully down" scenario [Owner: @alice, Due: Feb 15]
```

## একটা Chaos Calendar গড়া

GameDay নিয়মিত চালান — পরিণত দলের জন্য quarterly একটা ভালো cadence, chaos journey-র শুরুর দিকের দলের জন্য monthly।

```
Q1: App server failure (kill N-1 instances)
Q2: Database primary failure (promote replica)
Q3: Third-party payment service outage (circuit breaker + queue fallback)
Q4: Full AZ failure simulation

Between GameDays:
  Monthly: smaller experiments (latency injection on one endpoint)
  Weekly: review chaos metrics (circuit breaker open counts, retry rates)
```

কে কোন role নেবে তা ঘুরিয়ে দিন — সবার chaos engineer, incident commander, আর observer হওয়ার অভিজ্ঞতা থাকা উচিত।

## Hiring Signal হিসেবে Chaos

যেসব দল নিয়মিত GameDay চালায় তারা এমন ইঞ্জিনিয়ারদের আকর্ষণ করে যারা robust সিস্টেমে কাজ করতে চায়। এটা ইঙ্গিত দেয়:

- দল reliability-কে গুরুত্ব সহকারে নেয়
- Failure থেকে শেখা নিরাপদ এবং প্রত্যাশিত
- সিস্টেম আসলে কীভাবে কাজ করে সে সম্পর্কে কৌতূহলী হওয়ার জায়গা আছে

Engineering blog post আর job description-এ GameDay অভিজ্ঞতা অন্তর্ভুক্ত করুন। "আমরা মাসিক chaos exercise চালাই" অভিজ্ঞ reliability engineer-দের কাছে একটা শক্তিশালী signal।

## CI/CD-তে Automated Chaos

পরিণত দলের জন্য, প্রতিটা deployment-এ staging-এর বিপরীতে স্বয়ংক্রিয়ভাবে chaos experiment চালান:

```yaml
# GitHub Actions: chaos test on deployment
- name: Deploy to staging
  run: ./deploy.sh staging

- name: Wait for health checks
  run: ./scripts/wait-healthy.sh staging 120

- name: Run chaos suite
  run: |
    # Kill one instance, verify health
    ./chaos/kill-single-instance.sh staging
    ./chaos/assert-steady-state.sh staging 30

    # Inject 200ms latency, verify circuit breaker
    ./chaos/inject-latency.sh staging 200ms
    ./chaos/assert-steady-state.sh staging 60

    # Restore and verify
    ./chaos/restore.sh staging

- name: Promote to production (only if chaos passed)
  run: ./promote.sh staging production
```

এটা নিশ্চিত করে যে প্রতিটা release ইউজারদের কাছে পৌঁছানোর আগে আপনার পরিচিত failure mode-এর বিপরীতে validate হয়।
