---
title: 'Production Readiness Reviews'
subtitle: 'যে PRR চেকলিস্ট প্রতিরোধযোগ্য launch-into-fire-এর 80% ঠেকিয়ে দেয়, একটি বাস্তব launch gate Terraform module সহ।'
chapter: 7
level: 'intermediate'
readingTime: '16 মিনিট'
topics: ['PRR', 'launch review', 'runbook', 'production readiness', 'checklist']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জগতের উদাহরণ**

occupancy-র আগে একটা building inspection — মানুষজন ঢোকার আগে কোনো নিরপেক্ষ কেউ যাচাই করে দেখে যে structure-টা নিরাপদ।

</Callout>

## PRR কেন থাকে

Production Readiness Review (PRR) হলো একটা structured checkpoint, যেটা SRE কোনো service-এর pager গ্রহণ করার আগে হয়। এটা একটা কারণেই থাকে: **launch-এর সময় একটা missing dashboard ঠিক করার খরচ, 2am-এর incident-এর সময় সেটা ঠিক করার খরচের চেয়ে 10x কম।**

PRR হলো SRE যা করে তার মধ্যে সবচেয়ে leveraged জিনিস। এক ঘণ্টার review কয়েক সপ্তাহের pager-যন্ত্রণা ঠেকিয়ে দেয়।

## launch criteria checklist

একটা PRR হলো yes/no checklist। যেকোনো item-এ অস্পষ্টতা মানে launch block, যতক্ষণ না সেটা সমাধান হচ্ছে।

```markdown
# PRR: [Service Name] — [Owner Team] — [Launch Date]

## 1. Architecture

- [ ] Architecture diagram exists and is current
- [ ] All dependencies documented (services, databases, external APIs)
- [ ] Failure mode for each dependency documented
- [ ] Single points of failure identified and accepted (or eliminated)

## 2. Reliability

- [ ] SLI defined and measurable in production
- [ ] SLO target agreed by product + SRE, written down
- [ ] Error budget policy signed off
- [ ] Capacity plan completed (Little's Law math + headroom)
- [ ] Load test passed at expected launch traffic + 2x

## 3. Observability

- [ ] RED metrics for every endpoint
- [ ] USE metrics for every infrastructure component
- [ ] Structured logging with correlation IDs
- [ ] Distributed tracing for at least the critical path
- [ ] Dashboard exists, linked from the runbook
- [ ] Cardinality budget reviewed (no unbounded labels)

## 4. Alerting

- [ ] Symptom-based alerts on SLO burn rate
- [ ] Every alert has a linked runbook
- [ ] Alert threshold tested in staging (false-positive rate under 5%)
- [ ] Escalation path defined in PagerDuty

## 5. Deploy + Rollback

- [ ] CI runs unit + integration + smoke tests
- [ ] Deploy is automated (no manual steps)
- [ ] Canary stage with at least 5% traffic for 30 min
- [ ] Rollback is one command and tested
- [ ] Database migrations are forward + backward compatible

## 6. Security

- [ ] Secrets in vault, not in env or repo
- [ ] mTLS or equivalent for service-to-service auth
- [ ] AuthZ rules reviewed by security team
- [ ] Dependency vulnerability scan clean
- [ ] PII handling reviewed (if applicable)

## 7. Operations

- [ ] Runbook exists with at least: alert→diagnosis→mitigation
- [ ] On-call rotation populated and acknowledges service ownership
- [ ] Backup + restore tested in the last 90 days (if stateful)
- [ ] DR runbook exists (RTO + RPO documented and tested)
- [ ] Cost forecasted for steady-state and 10x scale

## 8. Launch

- [ ] Feature flag exists for emergency disable
- [ ] Status page entry created
- [ ] Customer support team trained on common questions
- [ ] Post-launch monitoring shift assigned (extra eyes for 48h)
```

এটা একটা বিস্তৃত list। এটাকে নিজের প্রয়োজন অনুযায়ী সাজিয়ে নিন — বেশিরভাগ service-এর প্রতিটা item লাগে না, কিন্তু team-কে সচেতনভাবে কোনো item skip করতে হবে, ভুলে গিয়ে বাদ দিলে চলবে না।

## একটা বাস্তব service-এর জন্য একটা worked PRR

চলুন একটা payment-service launch-এর জন্য একটা PRR চালাই। বাস্তবে যেমনটা হতো ঠিক তেমন কথোপকথন:

```
SRE:  "Walk me through the deploy."
DEV:  "We git push to main, GitHub Actions builds, deploys to staging,
       runs smoke tests, then rolls to production."
SRE:  "What if smoke tests pass and prod is broken?"
DEV:  "We... have not actually tested rollback. We'd revert the commit
       and redeploy."
SRE:  "How long does that take?"
DEV:  "Maybe 8-10 minutes for the full pipeline."
SRE:  "BLOCKED. Rollback must be one command and complete in under
       2 minutes. Add `kubectl rollout undo` to your runbook,
       test it Monday, then we re-review."
```

সেই কথোপকথন, পুরো checklist জুড়ে বারবার করলে সেটাই হলো PRR। প্রতিটা block আসলে একটা বাস্তব জিনিস, যেটা team শেষ পর্যন্ত একটা বাস্তব outage-এ অনেক বেশি খরচে আবিষ্কার করত।

## checklist-কে policy হিসেবে codify করা

যে checklist মানুষ চালায়, সে checklist মানুষ skip করে। এটাকে deploy tooling-এর ভেতরে bake করে দিন।

```hcl
# terraform/modules/service/main.tf
# A real internal module that enforces PRR baseline at infrastructure level

variable "service_name" { type = string }
variable "owner_team"   { type = string }
variable "slo_target"   { type = number }  # e.g., 0.999
variable "runbook_url"  { type = string }

# Enforce SLO is realistic
locals {
  validate_slo = var.slo_target > 0.99 && var.slo_target < 0.99999 ? null : (
    file("ERROR: slo_target must be between 0.99 and 0.99999")
  )
}

# Mandatory: PagerDuty service must exist
resource "pagerduty_service" "this" {
  name              = var.service_name
  escalation_policy = data.pagerduty_escalation_policy.team.id
  alert_creation    = "create_alerts_and_incidents"
}

# Mandatory: SLO recording rules
resource "kubernetes_manifest" "slo_rules" {
  manifest = yamldecode(templatefile("${path.module}/slo-rules.yaml.tpl", {
    service_name = var.service_name
    slo_target   = var.slo_target
  }))
}

# Mandatory: burn-rate alerts wired to PagerDuty
resource "kubernetes_manifest" "burn_alerts" {
  manifest = yamldecode(templatefile("${path.module}/burn-alerts.yaml.tpl", {
    service_name      = var.service_name
    slo_target        = var.slo_target
    pagerduty_service = pagerduty_service.this.id
    runbook_url       = var.runbook_url
  }))
}

# Mandatory: dashboard provisioned
resource "grafana_dashboard" "service" {
  config_json = templatefile("${path.module}/dashboard.json.tpl", {
    service_name = var.service_name
  })
  folder = data.grafana_folder.team.id
}

# Mandatory: runbook URL must respond 200
data "http" "runbook_check" {
  url = var.runbook_url

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "runbook_url ${var.runbook_url} returned ${self.status_code}"
    }
  }
}
```

নতুন একটা service launch করতে হলে, team-কে এই module invoke করতেই হবে। একটা SLO, একটা alert, একটা dashboard, আর একটা reachable runbook ছাড়া তারা production-এ কোনো service তৈরি করতে পারবে না। PRR "checklist" থেকে "compile-time error"-এ চলে এসেছে।

<Callout type="tip">

**সঠিক পথটাকেই সহজ পথ বানান।** যদি আপনার launch tooling PRR-এর 80% automatically enforce করে, তাহলে human review সেই 20%-এ মনোযোগ দিতে পারে যেখানে বিচারবুদ্ধি লাগে (capacity, security, customer impact)।

</Callout>

## runbook (সবচেয়ে বেশি skip হওয়া item)

Runbook হলো সেই artifact যেটা বেশিরভাগ team সবচেয়ে খারাপভাবে বানায়। একটা বাস্তব runbook একটা structured shape মেনে চলে:

````markdown
# Runbook: payment-service / PaymentLatencyHigh

## Alert

PaymentLatencyHigh — p99 latency > 500ms for 5 minutes.

## Severity

SEV2 if duration < 30 min. SEV1 if revenue impact > $1k/min.

## Owner

Team: payments-platform
Slack: #payments-oncall
PagerDuty: payments-primary

## What this means for users

Checkout still works but feels slow. Cart abandonment may rise.

## Diagnostic steps

1. **Check the dashboard:** [direct deep link](https://grafana.example.com/d/abc/payment-service?from=now-1h)
2. **Identify which endpoint:** Look at the "p99 by endpoint" panel.
3. **Check recent deploys:** `kubectl rollout history deployment/payment-service`
4. **Check upstream dependencies:**
   - Stripe API status: https://status.stripe.com
   - Database CPU: [dashboard panel](https://grafana.example.com/d/db?from=now-1h)
   - Redis hit rate: [panel](https://grafana.example.com/d/redis?panel=4)

## Mitigations (try in order)

### 1. If recent deploy correlates with onset

```bash
kubectl rollout undo deployment/payment-service -n payments
```
````

60s অপেক্ষা করুন। dashboard-এ latency কমেছে কিনা নিশ্চিত করুন।

### 2. If database is the bottleneck (CPU > 80%)

```bash
# Failover to read replica for non-critical reads
kubectl patch configmap payment-config \
  --type merge \
  -p '{"data":{"DB_READ_FROM_REPLICA":"true"}}'
kubectl rollout restart deployment/payment-service
```

### 3. If Stripe is the bottleneck

degraded mode চালু করুন (cash-on-delivery only):

```bash
kubectl patch configmap payment-config \
  --type merge \
  -p '{"data":{"DEGRADED_MODE":"true"}}'
```

## Escalation

- After 15 min unresolved → page payments-secondary
- After 30 min unresolved → page engineering manager
- If revenue > $5k/min impact → page VP Eng

## Last reviewed

2026-04-15 by @alice

````

এর বৈশিষ্ট্যগুলো: deep link (শুধু "গিয়ে Grafana দেখো" নয়), copy-paste করার মতো command, আর least-risky থেকে most-risky পর্যন্ত সাজানো mitigation।

## Pre-launch monitoring shift

SEV-critical launch-এর জন্য, প্রথম 48 ঘণ্টা extra eyes-এর ব্যবস্থা রাখুন। launch ops-এ এটাই একমাত্র সবচেয়ে বেশি leverage-দেওয়া tradition।

```typescript
// Launch monitoring shift schedule
const launchShift = {
  service: "new-checkout-flow",
  launchTime: "2026-05-15 10:00 PT",
  tier1: {
    duration: "T+0 to T+4h",
    staff: ["author", "reviewer", "on-call SRE"],
    activity: "Active monitoring; 5-min dashboard checks",
  },
  tier2: {
    duration: "T+4h to T+24h",
    staff: ["on-call SRE"],
    activity: "Hourly dashboard checks; lower threshold pages",
  },
  tier3: {
    duration: "T+24h to T+48h",
    staff: ["on-call SRE"],
    activity: "Normal on-call; launch tag still active for prioritization",
  },
};
````

## Annual recertification

PRR এককালীন জিনিস নয়। Service drift করে। বার্ষিক recertification:

```bash
# A real CI job that checks PRR compliance
sre-prr-check --service payment-service

# Sample output:
# ✓ SLO defined and recording rules active
# ✓ Burn-rate alerts wired
# ✗ Dashboard returned 404 (was deleted in Grafana cleanup)
# ✓ Runbook URL responsive
# ✗ Last DR drill: 2024-11 (>365 days ago)
# ✗ Backup restore last tested: never
#
# Service payment-service: 4/8 PRR items compliant
# Status: NEEDS RECERTIFICATION
```

recertification ব্যর্থ হওয়া মানে SRE engineering manager-এর কাছে escalate করে। শাস্তিমূলক কিছু নয় — এটা সেই back-pressure যেটা production-কে নীরবে পচে যাওয়া থেকে ঠেকায়।

## আপডেটেড থাকুন

- [Google SRE Book — Launch Coordination Engineering](https://sre.google/sre-book/launch-coordination-checklists/) — মূল PRR checklist
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) — pillars + review process
- [Google Cloud Architecture Framework](https://cloud.google.com/architecture/framework) — AWS WA-এর প্রতিরূপ
- [12-factor app](https://12factor.net/) — service hygiene-এর জন্য pre-PRR baseline

## মূল কথাগুলো

1. **PRR সবচেয়ে বেশি outage-এর কারণ ধরে ফেলে** incident-এর সময়ের চেয়ে 10x কম খরচে
2. **checklist মুখস্থ নয়, চেক করতে হবে** — লিখে রাখুন
3. **baseline-টা Terraform-এ bake করুন** — সঠিক পথই একমাত্র পথ হয়ে ওঠে
4. **Runbook-এ deep link আর copy-paste করার মতো command লাগে**, অস্পষ্ট ইশারা নয়
5. **প্রতি বছর recertify করুন** — service drift করে, drift outage ঘটায়, drift প্রতিরোধযোগ্য
