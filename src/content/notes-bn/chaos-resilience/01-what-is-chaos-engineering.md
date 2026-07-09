---
title: 'What Is Chaos Engineering'
subtitle: 'ইউজাররা টের পাওয়ার আগেই দুর্বলতা খুঁজে বের করতে ইচ্ছাকৃতভাবে failure ইনজেক্ট করা — এবং কেন সেরাটার আশায় বসে থাকার চেয়ে নিয়ন্ত্রিত experiment ভালো।'
chapter: 1
level: 'beginner'
readingTime: '8 মিনিট'
topics: ['chaos engineering', 'resilience', 'fault injection', 'steady state', 'GameDays']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

বিক্রির আগে একটা গাড়ির crash testing: আপনি নিয়ন্ত্রিত পরিস্থিতিতে ইচ্ছাকৃতভাবে সেটাকে দেয়ালে ধাক্কা দেন, দেখতে কী ভাঙে। কাস্টমারের অফিস যাওয়ার পথে আপনি সেটা জানতে চান না। Chaos engineering ডিস্ট্রিবিউটেড সিস্টেমের জন্য একই কাজ করে — আপনার নিজের এনভায়রনমেন্টে নিয়ন্ত্রিত failure, production-এ চমক নয়।

</Callout>

## মূল সমস্যা

ডিস্ট্রিবিউটেড সিস্টেম এমন সব উপায়ে fail করে যা পুরোপুরি আগে থেকে আন্দাজ করা অসম্ভব। একটা database replica পিছিয়ে পড়ে আর clients টাইম আউট হয়। একটা network partition আপনার cluster-এর অর্ধেককে বিশ্বাস করায় যে সে-ই primary। একটা dependency খালি body নিয়ে 200 OK রিটার্ন করে। একটা memory leak শুধু সাত দিন uptime-এর পর load-এর নিচে সামনে আসে।

আপনি যেসব scenario কল্পনা করেছেন তার জন্য test লিখতে পারেন। যেগুলো করেননি তার জন্য পারেন না। Chaos engineering আপনার কল্পনার বাইরের scenario-গুলো খুঁজে বের করে সিস্টেমের আসল failure পরিস্থিতিতে তার প্রকৃত আচরণ প্রোব করে।

## Chaos Engineering-এর Principles

Netflix-এর মূল chaos engineering principles, সংক্ষেপে:

**1. Steady state সংজ্ঞায়িত করুন।** "কাজ করছে" দেখতে কেমন? পরিমাপযোগ্য ভাষায় সংজ্ঞায়িত করুন: 99th percentile latency &lt; 200ms, error rate &lt; 0.5%, checkout completion rate > 98%। এটাই আপনার baseline hypothesis।

**2. Hypothesize করুন যে failure-এর নিচেও steady state বজায় থাকে।** Failure ইনজেক্ট করার আগে বলুন আপনি কী আশা করছেন: "যদি আমরা একটা app server kill করি, steady state বজায় থাকবে কারণ N+1 capacity লোড সামলে নেবে।"

**3. বাস্তবসম্মত failure ইনজেক্ট করুন।** এলোমেলো chaos নয় — টার্গেটেড experiment যা আপনার সিস্টেমের প্রকৃত failure mode প্রতিফলিত করে: server crash, network latency, disk full, dependency timeout।

**4. আপনার hypothesis ভুল প্রমাণের চেষ্টা করুন।** Experiment চালান আর মাপুন। যদি steady state ভেঙে যায়, আপনি একটা আসল দুর্বলতা পেয়েছেন। যদি টিকে থাকে, আপনি আপনার resilience অনুমান validate করেছেন।

**5. Production-এ চালান।** Staging-এ production-এর traffic pattern, production-এর data volume, বা production-এর dependency থাকে না। Staging দিয়ে শুরু করুন, কিন্তু আসল মূল্য আসে production experiment থেকে (যথাযথ নিরাপত্তা ব্যবস্থাসহ)।

## Chaos Engineering যা নয়

এটা **এলোমেলো ধ্বংস** নয় — experiment ইচ্ছাকৃত, scoped, এবং reversible। আপনি এলোমেলোভাবে service kill করছেন না; আপনি নির্দিষ্ট hypothesis পরীক্ষা করছেন।

এটা **bug-এর জন্য testing** নয় — unit এবং integration test পরিচিত failure mode কভার করে। Chaos engineering অজানা failure mode এবং emergent আচরণ এক্সপ্লোর করে।

এটা **একবারের ইভেন্ট** নয় — এটা একটা continuous practice। সিস্টেম বদলায়; experiment-কেও তাল মিলিয়ে চলতে হয়।

## Experiment Loop

```
1. Define steady state metrics
   → Latency p99, error rate, throughput, business metric (conversions, etc.)

2. Form a hypothesis
   → "If the payment service latency increases to 500ms,
      checkout still completes because we have a 2s timeout
      and the circuit breaker opens to return cached prices"

3. Design minimal blast radius experiment
   → Inject 500ms latency on 5% of payment service calls
   → Monitor for 15 minutes
   → Abort if error rate exceeds 1%

4. Run and observe
   → Did steady state hold?
   → What was the actual behavior vs hypothesized?

5. Learn and fix
   → If hypothesis failed: fix the weakness, re-run
   → If hypothesis held: document the validated resilience, increase scope
```

## Failure Mode Taxonomy

আপনার সিস্টেমের প্রকৃত failure mode-এর চারপাশে experiment সাজান:

**Infrastructure failures:**

- Server crash / OOM kill
- Disk full
- Network partition (split brain)
- AZ failure simulation
- DNS resolution failures

**Dependency failures:**

- Downstream service timeout
- Downstream service returning 500
- Downstream service returning corrupted data
- Third-party API rate limiting (429)
- Database connection exhaustion

**Resource exhaustion:**

- CPU saturation
- Memory pressure
- Thread pool / connection pool exhaustion
- File descriptor limits

**Latency injection:**

- Slow response (but not timeout) from dependency
- High variance latency (some requests slow, most fast)
- Packet loss causing TCP retransmits

## ছোট থেকে শুরু: Blast Radius

একটা experiment-এর blast radius হলো আপনার সিস্টেমের কতটুকু প্রভাবিত হতে পারে। সম্ভব সবচেয়ে ছোট scope দিয়ে শুরু করুন আর আত্মবিশ্বাস গড়ার সাথে সাথে বাড়ান।

```
Small blast radius (start here):
  → Single instance in a development environment
  → 1% of traffic to one endpoint
  → One non-critical dependency

Larger blast radius (after building experience):
  → One availability zone
  → 10% of production traffic
  → A critical dependency

Full production experiments (with mature practices):
  → Entire region failover
  → Primary database failure
  → Core service outage
```

## শুরু করার আগে Pre-Requisites

Chaos engineering আপনার সিস্টেম সম্পর্কে যা কিছু ইতিমধ্যে সত্য তা বাড়িয়ে তোলে। যদি monitoring না থাকে, কী ভাঙল আপনি জানবেন না। যদি runbook না থাকে, কীভাবে ঠিক করবেন জানবেন না।

**সর্বনিম্ন কার্যকর ভিত্তি:**

```
□ Metrics and dashboards for your steady state indicators
□ Alerting that fires before users notice
□ Ability to immediately abort an experiment
□ On-call engineer available during experiment window
□ Runbooks for common failure scenarios
□ Clear rollback procedure for the experiment
```

আপনার প্রথম experiment-গুলো অফিস চলাকালীন চালান, রাত ২টায় নয়। আপনি চান অভিজ্ঞ ইঞ্জিনিয়াররা নজর রাখুক।

## মানবিক দিক

Chaos engineering প্রায়ই কেবল টেকনিক্যাল নয়, সাংগঠনিক সমস্যাও উন্মোচন করে:

- "Runbook বলে service X restart করতে, কিন্তু command-টা কোথায় ডকুমেন্ট করা কেউ জানে না"
- "Alert fire করল কিন্তু on-call-এ থাকা কেউ জানত না এটা তার দায়িত্ব"
- "আমরা ভেবেছিলাম আমাদের circuit breaker আছে, কিন্তু সেটা ভুলভাবে কনফিগার করা ছিল"

এই আবিষ্কারগুলো টেকনিক্যাল fix-এর মতোই মূল্যবান। Chaos engineering কেবল সিস্টেম নয়, দলের জন্যও একটা শেখার হাতিয়ার।

## প্রথম Experiment

সবচেয়ে সহজ কাজের experiment: আপনার application-এর একটা instance kill করুন আর যাচাই করুন traffic পরিষ্কারভাবে সরে যায় কি না:

```bash
# 1. Document steady state first
# Confirm: current p99 latency, error rate, all instances healthy

# 2. Kill one instance
kill -9 $(pgrep -f "node server.js" | head -1)
# or: docker kill <container-id>
# or: aws ec2 terminate-instances --instance-ids i-xxx

# 3. Watch your load balancer health checks
# → Unhealthy instance should be removed within 30s
# → Traffic should redistribute to remaining instances

# 4. Measure steady state indicators for 5 minutes
# → Did error rate spike? For how long?
# → Did latency increase? By how much?
# → Did your alert fire? How quickly?

# 5. Restore the instance
# → Bring the instance back up
# → Verify it re-joins the load balancer pool

# 6. Document findings
```

এটা আপনাকে বলে: আপনার health check কাজ করে কি না, traffic failover হতে কতক্ষণ লাগে, আপনার alerting instance হারানো ধরতে পারে কি না। সম্ভবত এমন কিছু পাবেন যা আপনি আশা করেননি।
