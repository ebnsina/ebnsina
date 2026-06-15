---
title: "Chaos Engineering"
subtitle: "Hypothesis-driven failure injection from Netflix Simian Army to Chaos Mesh, with real experiments and a safety harness."
chapter: 8
level: "advanced"
readingTime: "16 min"
topics: ["chaos engineering", "Chaos Mesh", "Gremlin", "fault injection", "gameday"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A vaccine trial — you deliberately introduce a controlled, weakened version of the threat to see how the system responds, so that when the real thing hits, you already know it survives.

</Callout>

## The principle

> Chaos Engineering is the discipline of experimenting on a system in order to build confidence in the system's capability to withstand turbulent conditions in production.
> — *Principles of Chaos Engineering*

The keyword is **discipline**. Chaos engineering is not "let's randomly break things." It is the scientific method applied to production resilience: hypothesize, experiment, measure, learn.

```
1. Define steady state (a quantitative SLI you'll watch)
2. Hypothesize: "If we inject failure F, steady state will hold"
3. Run the experiment in the smallest blast radius that's meaningful
4. Compare measurements before, during, after
5. If the hypothesis broke, fix the system, then re-run
```

## The four guardrails (from the Netflix CRE playbook)

You cannot do chaos in production safely without these:

```
1. Run in production for accuracy — but only after staging passes
2. Minimize blast radius — start with 1% of one shard, expand slowly
3. Have a kill switch — abort any experiment in <60 seconds
4. Run during business hours — when the team can respond
```

The "business hours only" rule surprises people. The point: if your experiment exposes a bug, you want the team awake and fresh, not paged out of bed at 3am.

<Callout type="warning">

**Never run chaos experiments without all four guardrails.** A team that injected DNS failure on a Friday afternoon at Netflix in 2014 took down the streaming tier worldwide. The experiment had no kill switch and no blast radius limit. They had to wait for the experiment to finish on its own. Don't be that team.

</Callout>

## A maturity ladder

Don't start with "kill a region." Start small.

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

Skipping levels is how teams turn chaos engineering into chaos.

## Real experiment with Chaos Mesh

Chaos Mesh is the leading open-source chaos platform for Kubernetes. CNCF graduated. Production-ready.

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
  value: "1"
  duration: "5m"
  selector:
    namespaces:
      - production
    labelSelectors:
      "app": "checkout"
      "chaos-eligible": "true"   # only pods opted-in
  scheduler:
    cron: "@every 30s"
```

The `chaos-eligible: "true"` label is the critical guardrail — services must explicitly opt in to being targeted. No team gets surprised.

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
    namespaces: ["production"]
    labelSelectors:
      "app": "checkout"
  delay:
    latency: "500ms"
    correlation: "0"
    jitter: "100ms"
  direction: to
  target:
    selector:
      namespaces: ["production"]
      labelSelectors:
        "app": "postgres-primary"
  duration: "3m"
```

### Kill switch (the most important file in chaos)

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

Bound it to a single command, document it in every chaos experiment doc, and put the link in the runbook.

## Experiment template

Every experiment is documented before it runs. This is the template real chaos teams use:

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

## Gameday: the next level

A gameday is a planned, multi-team exercise simulating a complex incident. Half a day of structured chaos.

```typescript
// Gameday: simulated multi-region failover
const gameday = {
  scenario: `
    The us-east-1 region is unreachable from us-west-2.
    All traffic must failover to us-west-2 within 5 minutes
    while staying within SLO. Do not modify any code; use only
    operational tooling.
  `,
  injection: "Block VPC peering between us-east-1 and us-west-2",
  duration: "4 hours",
  participants: [
    "SRE team (run the chaos)",
    "Product team for affected services",
    "Customer support (simulated tickets)",
    "Comms team (status page exercise)",
  ],
  observers: ["Director of Engineering", "VP Product"],

  successCriteria: [
    "Failover initiated within 5 min of detection",
    "SLO held within ±5% of baseline during failover",
    "Status page updated within 15 min of incident declaration",
    "Postmortem-grade timeline produced afterward",
  ],
};
```

Gamedays expose process bugs that no automated experiment catches: stale on-call schedules, runbooks pointing to deleted dashboards, the one engineer who knew the failover script being on PTO.

<Callout type="info">

**Real-World Analogy**

Fire departments don't wait for real fires to practice. They run controlled burns and drill weekly. A fire crew that has only ever fought real fires is a crew with a high mortality rate. Gamedays are your controlled burns.

</Callout>

## Chaos in CI (the underrated pattern)

Run small, deterministic chaos on every PR. Catches resilience regressions at code-review time.

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

Now any PR that introduces a regression in retry/timeout handling fails CI. The test catches it before code reaches review.

## What chaos engineering won't tell you

It is not a replacement for:

- **Capacity planning** — chaos doesn't predict load growth
- **Architecture review** — chaos finds known failure modes; architecture review finds unknown ones
- **Postmortem analysis** — chaos validates fixes; it doesn't generate them

Chaos answers "did the fix work?" Postmortems answer "what's broken?" Architecture answers "what could be broken?" You need all three.

## Stay current

- [Principles of Chaos Engineering](https://principlesofchaos.org/) — the manifesto
- [Chaos Mesh docs](https://chaos-mesh.org/docs/) — CNCF graduated, K8s-native
- [LitmusChaos](https://litmuschaos.io/) — alternative CNCF chaos platform
- [Netflix tech blog — chaos](https://netflixtechblog.com/tagged/chaos-engineering) — where the practice was born

## Key Takeaways

1. **Hypothesis-driven**, not "break stuff and see"
2. **Four guardrails are non-negotiable**: prod accuracy, blast limit, kill switch, business hours
3. **Climb the ladder** — pod kill before region kill
4. **Document every experiment** with the template — they accumulate into a resilience knowledge base
5. **Gamedays + chaos in CI** — exercise both humans and code on a regular cadence

