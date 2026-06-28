---
title: 'Production Readiness Reviews'
subtitle: 'The PRR checklist that prevents 80% of preventable launches-into-fire, with a real launch gate Terraform module.'
chapter: 7
level: 'intermediate'
readingTime: '16 min'
topics: ['PRR', 'launch review', 'runbook', 'production readiness', 'checklist']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A building inspection before occupancy — someone independent checks the structure is safe before people move in.

</Callout>

## Why PRRs exist

A Production Readiness Review (PRR) is a structured checkpoint before SRE accepts the pager for a service. It exists for one reason: **the cost of fixing a missing dashboard at launch is 10x lower than fixing it during a 2am incident.**

PRRs are the most leveraged thing SRE does. One hour of review prevents weeks of pager pain.

## The launch criteria checklist

A PRR is a yes/no checklist. Ambiguity in any item means the launch is blocked until it's resolved.

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

This is a comprehensive list. Tailor it — most services don't need every item, but the team must consciously skip an item, not forget it.

## A worked PRR for a real service

Let's run a PRR for a payment-service launch. The conversation as it would actually happen:

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

That conversation, repeated across the checklist, is the PRR. Every block is a real thing the team would have eventually discovered in a real outage at much higher cost.

## Codifying the checklist as policy

A checklist that humans run is a checklist humans skip. Bake it into deploy tooling.

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

To launch a new service, a team must invoke this module. They cannot create a service in production without an SLO, an alert, a dashboard, and a reachable runbook. The PRR has moved from "checklist" to "compile-time error."

<Callout type="tip">

**Make the right way the easy way.** If your launch tooling enforces 80% of the PRR automatically, the human review can focus on the 20% that requires judgment (capacity, security, customer impact).

</Callout>

## The runbook (the most-skipped item)

Runbooks are the artifact most teams produce worst. A real runbook follows a structured shape:

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

Wait 60s. Confirm latency drops on dashboard.

### 2. If database is the bottleneck (CPU > 80%)

```bash
# Failover to read replica for non-critical reads
kubectl patch configmap payment-config \
  --type merge \
  -p '{"data":{"DB_READ_FROM_REPLICA":"true"}}'
kubectl rollout restart deployment/payment-service
```

### 3. If Stripe is the bottleneck

Enable degraded mode (cash-on-delivery only):

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

The hallmarks: deep links (not "go look at Grafana"), copy-pasteable commands, ordered mitigations from least-risky to most-risky.

## Pre-launch monitoring shift

For SEV-critical launches, schedule extra eyes for the first 48 hours. This is the single highest-leverage tradition in launch ops.

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

PRRs are not one-time. Services drift. Annual recertification:

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

Failed recertification means SRE escalates to the engineering manager. Not punitive — it's the back-pressure that prevents production from rotting silently.

## Stay current

- [Google SRE Book — Launch Coordination Engineering](https://sre.google/sre-book/launch-coordination-checklists/) — the original PRR checklist
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) — pillars + review process
- [Google Cloud Architecture Framework](https://cloud.google.com/architecture/framework) — counterpart to AWS WA
- [12-factor app](https://12factor.net/) — pre-PRR baseline for service hygiene

## Key Takeaways

1. **PRRs catch the most outage causes** at 10x lower cost than at incident time
2. **The checklist must be checked**, not memorized — write it down
3. **Bake the baseline into Terraform** — the right way becomes the only way
4. **Runbooks need deep links and copy-pasteable commands**, not vague pointers
5. **Recertify annually** — services drift, drift causes outages, drift is preventable
