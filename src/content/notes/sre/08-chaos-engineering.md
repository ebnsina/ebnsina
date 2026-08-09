---
title: 'Chaos Engineering'
subtitle: 'Netflix Simian Army থেকে Chaos Mesh পর্যন্ত hypothesis-driven failure injection, বাস্তব experiment আর একটা safety harness সহ।'
chapter: 8
level: 'advanced'
readingTime: '16 মিনিট'
topics: ['chaos engineering', 'Chaos Mesh', 'Gremlin', 'fault injection', 'gameday']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জগতের উদাহরণ**

একটা vaccine trial — আপনি ইচ্ছাকৃতভাবে threat-এর একটা নিয়ন্ত্রিত, দুর্বল করা সংস্করণ ঢুকিয়ে দেখেন system কীভাবে সাড়া দেয়, যাতে আসল জিনিসটা আঘাত করলে আপনি আগে থেকেই জানেন সেটা টিকে যাবে।

</Callout>

## গল্পে বুঝি

শহরের বিদ্যুৎ কন্ট্রোল রুমে আজ একটা planned resilience test। বড় স্ক্রিনে পুরো গ্রিডের ম্যাপ — সব সাবস্টেশন সবুজ, শহর ঝলমল করছে। প্রধান প্রকৌশলী ফাতিমা আল-ফিহরি বললেন, "কাগজে-কলমে আমাদের backup path আছে, একটা সাবস্টেশন বসে গেলে পাশেরগুলো নাকি লোড টেনে নেবে। কিন্তু বাস্তবে কেউ কখনো পরীক্ষা করে দেখেনি।" আসল ঝড়ের রাতে সেটা কাজ করবে কিনা, সেই ভরসাটা তো কেবল কাগজে। তাই আজ সবাই সজাগ থাকতে থাকতে, নিয়ন্ত্রিত অবস্থায় তারা ইচ্ছাকৃতভাবে একটা সচল সাবস্টেশন ট্রিপ করাবেন — দেখতে চান গ্রিড সত্যিই নিজে থেকে বিদ্যুৎ ঘুরিয়ে দেয় কিনা, শহর জ্বলতে থাকে কিনা।

ইবনে সিনা হাত রাখলেন সুইচে, kill switch হাতের নাগালে রেখে একটা সাবস্টেশন ট্রিপ করালেন। এক মুহূর্ত দম বন্ধ — তারপর ম্যাপে দেখা গেল লোড আপনাআপনি পাশের লাইনে সরে গেল, শহরের একটা বাতিও নিভল না। failover সত্যিই কাজ করে, প্রমাণ হলো। কিন্তু আল-খোয়ারিজমি একটা প্যানেলে লাল ওঠানামা দেখে থমকে গেলেন — একটা রিরুট লাইন প্রায় তার সীমার শেষ প্রান্তে গরম হয়ে উঠছে। এই দুর্বল লাইনটা আসল ঝড়ে নীরবে পুড়ে গিয়ে পুরো এলাকা অন্ধকার করে দিত, অথচ স্বাভাবিক দিনে কেউ টেরই পেত না। তারা পরীক্ষা থামিয়ে লাইনটা মেরামত করলেন — কোনো সত্যিকারের blackout হওয়ার আগেই।

এই পুরো গল্পটাই আসলে **chaos engineering**। সজাগ তদারকির মধ্যে একটা সচল সাবস্টেশন ইচ্ছাকৃতভাবে ট্রিপ করানো হলো আসল, চালু system-এ একটা controlled failure inject করা; গ্রিড নিজে থেকে বিদ্যুৎ ঘুরিয়ে শহর জ্বালিয়ে রাখল মানে redundancy আর failover সত্যিই কাজ করে সেটা verify করা; আর সেই লুকানো দুর্বল লাইন খুঁজে পাওয়া মানে আসল outage-এর আগেই hidden weakness ধরে ফেলা। বাস্তবে Netflix ঠিক এই কাজটাই করে তাদের **Chaos Monkey** দিয়ে — production-এ এলোমেলোভাবে চালু server বন্ধ করে দেয়, যাতে আসল crash আসার আগেই প্রমাণ হয় system সেটা সামলাতে পারে।

## মূলনীতি

> Chaos Engineering is the discipline of experimenting on a system in order to build confidence in the system's capability to withstand turbulent conditions in production.
> — _Principles of Chaos Engineering_

মূল শব্দটা হলো **discipline**। Chaos engineering মানে "চলো র‍্যান্ডমভাবে জিনিস ভাঙি" নয়। এটা production resilience-এ প্রয়োগ করা scientific method: hypothesize, experiment, measure, learn।

```
1. Define steady state (a quantitative SLI you'll watch)
2. Hypothesize: "If we inject failure F, steady state will hold"
3. Run the experiment in the smallest blast radius that's meaningful
4. Compare measurements before, during, after
5. If the hypothesis broke, fix the system, then re-run
```

## চারটি guardrail (Netflix CRE playbook থেকে)

এগুলো ছাড়া আপনি production-এ নিরাপদে chaos করতে পারবেন না:

```
1. Run in production for accuracy — but only after staging passes
2. Minimize blast radius — start with 1% of one shard, expand slowly
3. Have a kill switch — abort any experiment in <60 seconds
4. Run during business hours — when the team can respond
```

"business hours only" নিয়মটা মানুষকে অবাক করে। মূল কথাটা হলো: যদি আপনার experiment একটা bug ফাঁস করে, আপনি চান team জেগে থাকুক আর তাজা থাকুক, রাত 3am-এ pager-এ ঘুম থেকে উঠে নয়।

<Callout type="warning">

**চারটি guardrail ছাড়া কখনো chaos experiment চালাবেন না।** 2014 সালে Netflix-এ একটা team একটা শুক্রবার বিকেলে DNS failure inject করে বিশ্বব্যাপী streaming tier ফেলে দিয়েছিল। experiment-টার কোনো kill switch ছিল না আর কোনো blast radius limit ছিল না। তাদের experiment নিজে নিজে শেষ হওয়া পর্যন্ত অপেক্ষা করতে হয়েছিল। সেই team হবেন না।

</Callout>

## একটা maturity ladder

"একটা region kill করো" দিয়ে শুরু করবেন না। ছোট থেকে শুরু করুন।

```
Level 1 — Single host failures
  Kill a pod. Block CPU on a node. Fill a disk.
  Goal: prove the orchestrator reschedules cleanly.

Level 2 — Single service degradation
  Add 200ms latency to one upstream call.
  Return errors from 5% of one dependency's responses.
  Goal: prove timeouts and retries work.

Level 3 — Network partitions
  Sever zone A from zone B for 60 seconds.
  Goal: prove zone failover and clock skew handling.

Level 4 — Full region failure
  Block all traffic to one entire region.
  Goal: prove multi-region failover works under load.

Level 5 — Gameday
  All-day exercise simulating a major incident across teams.
  Goal: validate humans + processes, not just systems.
```

level skip করাই হলো সেই উপায় যেভাবে team chaos engineering-কে chaos-এ রূপান্তরিত করে।

## Chaos Mesh দিয়ে বাস্তব experiment

Chaos Mesh হলো Kubernetes-এর জন্য শীর্ষস্থানীয় open-source chaos platform। CNCF graduated। Production-ready।

```yaml
# experiments/checkout-pod-kill.yaml
# Kill 1 of N checkout pods every 30 seconds for 5 minutes
# Steady state: SLO holds (>99.9% success)

apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: checkout-pod-kill-canary
  namespace: chaos-testing
spec:
  action: pod-kill
  mode: fixed
  value: '1'
  duration: '5m'
  selector:
    namespaces:
      - production
    labelSelectors:
      'app': 'checkout'
      'chaos-eligible': 'true' # only pods opted-in
  scheduler:
    cron: '@every 30s'
```

`chaos-eligible: "true"` label-টাই সেই critical guardrail — service-কে target হওয়ার জন্য স্পষ্টভাবে opt in করতে হবে। কোনো team surprise হয় না।

### Network latency injection

```yaml
# experiments/checkout-db-latency.yaml
# Add 500ms latency to checkout → DB calls
# Hypothesis: timeouts and circuit breakers prevent cascading failure

apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: checkout-db-latency
  namespace: chaos-testing
spec:
  action: delay
  mode: all
  selector:
    namespaces: ['production']
    labelSelectors:
      'app': 'checkout'
  delay:
    latency: '500ms'
    correlation: '0'
    jitter: '100ms'
  direction: to
  target:
    selector:
      namespaces: ['production']
      labelSelectors:
        'app': 'postgres-primary'
  duration: '3m'
```

### Kill switch (chaos-এর সবচেয়ে গুরুত্বপূর্ণ file)

```bash
#!/usr/bin/env bash
# bin/chaos-killswitch
# Stop all chaos experiments immediately. Run during real incidents.

set -euo pipefail

echo "ABORTING all chaos experiments..."

kubectl delete -n chaos-testing podchaos --all --grace-period=0 --force
kubectl delete -n chaos-testing networkchaos --all --grace-period=0 --force
kubectl delete -n chaos-testing iochaos --all --grace-period=0 --force
kubectl delete -n chaos-testing stresschaos --all --grace-period=0 --force
kubectl delete -n chaos-testing timechaos --all --grace-period=0 --force
kubectl delete -n chaos-testing dnschaos --all --grace-period=0 --force

echo "All experiments terminated. Verify no chaos remaining:"
kubectl get all -n chaos-testing
```

এটাকে একটা single command-এ বেঁধে দিন, প্রতিটা chaos experiment doc-এ document করুন, আর link-টা runbook-এ রাখুন।

## Experiment template

প্রতিটা experiment চালানোর আগে document করা হয়। বাস্তব chaos team যে template ব্যবহার করে সেটা এই:

```markdown
# Chaos Experiment: checkout pod kill (1 of 12, every 30s, 5 min)

## Hypothesis

If we kill 1 of 12 checkout pods every 30s for 5 minutes, then
checkout success rate will remain >= 99.5% (10x our normal SLO of 99.9%).

## Steady state

- SLI: `sli:checkout_availability:ratio_rate1m`
- Threshold: > 0.995
- Dashboard: [Grafana link](https://...)

## Blast radius

- 1 of 12 checkout pods at a time (~8% of capacity)
- Production EU region only
- During business hours (10:00-12:00 UTC)

## Abort criteria

- SLI drops below 0.99 for >2 consecutive minutes → run kill switch
- Customer support reports any user-visible issue → run kill switch
- Any P0 incident declared in any service → run kill switch

## Rollback

The experiment is self-terminating after 5 minutes. The kill switch
above terminates immediately if needed. Killed pods are auto-replaced
by the deployment controller (typical replacement time: 8-15s).

## Pre-run checks

- [ ] Steady state confirmed for 30 min prior
- [ ] No active incidents
- [ ] On-call team aware (announced in #sre-chaos)
- [ ] Kill switch tested (in staging) within last 7 days

## Run log

[ filled in during execution ]

## Result

[ filled in after; including hypothesis status, anomalies, action items ]
```

## Gameday: পরের level

একটা gameday হলো একটা পরিকল্পিত, multi-team exercise যেটা একটা জটিল incident simulate করে। আধা দিনের structured chaos।

```typescript
// Gameday: simulated multi-region failover
const gameday = {
	scenario: `
    The us-east-1 region is unreachable from us-west-2.
    All traffic must failover to us-west-2 within 5 minutes
    while staying within SLO. Do not modify any code; use only
    operational tooling.
  `,
	injection: 'Block VPC peering between us-east-1 and us-west-2',
	duration: '4 hours',
	participants: [
		'SRE team (run the chaos)',
		'Product team for affected services',
		'Customer support (simulated tickets)',
		'Comms team (status page exercise)'
	],
	observers: ['Director of Engineering', 'VP Product'],

	successCriteria: [
		'Failover initiated within 5 min of detection',
		'SLO held within ±5% of baseline during failover',
		'Status page updated within 15 min of incident declaration',
		'Postmortem-grade timeline produced afterward'
	]
};
```

Gameday এমন process bug ফাঁস করে যা কোনো automated experiment ধরতে পারে না: বাসি on-call schedule, deleted dashboard-এ point করা runbook, failover script জানা একমাত্র engineer যে PTO-তে আছে।

<Callout type="info">

**বাস্তব জগতের উদাহরণ**

Fire department আসল আগুনের জন্য practice করার অপেক্ষা করে না। তারা controlled burn চালায় আর সপ্তাহে drill করে। যে fire crew শুধু আসল আগুনের সাথে লড়েছে, সেই crew-এর mortality rate বেশি। Gameday হলো আপনার controlled burn।

</Callout>

## CI-তে chaos (কম গুরুত্ব পাওয়া pattern)

প্রতিটা PR-এ ছোট, deterministic chaos চালান। code-review-এর সময়েই resilience regression ধরে।

```yaml
# .github/workflows/chaos-ci.yml
name: Chaos in CI

on: pull_request

jobs:
  chaos-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Spin up service + dependencies
        run: docker compose up -d

      - name: Wait for healthy state
        run: ./scripts/wait-for-healthy.sh

      - name: Inject DB latency for 60s, run integration tests
        run: |
          docker compose exec postgres tc qdisc add dev eth0 root netem delay 200ms
          npm run test:integration
          docker compose exec postgres tc qdisc del dev eth0 root netem

      - name: Inject 5% error rate from payment-mock
        run: |
          docker compose exec payment-mock toxiproxy-cli toxic add \
            -t error -a rate=0.05 payment
          npm run test:integration
```

এখন retry/timeout handling-এ regression আনা যেকোনো PR CI-তে fail করে। code review-তে পৌঁছানোর আগেই test সেটা ধরে ফেলে।

## chaos engineering আপনাকে যা বলবে না

এটা এগুলোর বিকল্প নয়:

- **Capacity planning** — chaos load growth predict করে না
- **Architecture review** — chaos পরিচিত failure mode খুঁজে পায়; architecture review অজানাগুলো খুঁজে পায়
- **Postmortem analysis** — chaos fix validate করে; সেগুলো তৈরি করে না

Chaos উত্তর দেয় "fix-টা কাজ করেছে কি?" Postmortem উত্তর দেয় "কী ভাঙা?" Architecture উত্তর দেয় "কী ভাঙতে পারত?" আপনার তিনটাই লাগবে।

## আপডেটেড থাকুন

- [Principles of Chaos Engineering](https://principlesofchaos.org/) — manifesto
- [Chaos Mesh docs](https://chaos-mesh.org/docs/) — CNCF graduated, K8s-native
- [LitmusChaos](https://litmuschaos.io/) — বিকল্প CNCF chaos platform
- [Netflix tech blog — chaos](https://netflixtechblog.com/tagged/chaos-engineering) — যেখানে এই practice-এর জন্ম

## মূল কথাগুলো

1. **Hypothesis-driven**, "জিনিস ভেঙে দেখা" নয়
2. **চারটি guardrail non-negotiable**: prod accuracy, blast limit, kill switch, business hours
3. **ladder বেয়ে উঠুন** — region kill-এর আগে pod kill
4. **প্রতিটা experiment document করুন** template দিয়ে — এগুলো জমে একটা resilience knowledge base হয়
5. **Gameday + CI-তে chaos** — নিয়মিত cadence-এ মানুষ আর code দুটোকেই exercise করান
