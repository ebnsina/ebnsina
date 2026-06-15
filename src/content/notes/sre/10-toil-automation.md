---
title: "Toil & Automation"
subtitle: "Measuring toil, the 50% cap, and the automation taxonomy from one-off scripts to self-healing operators."
chapter: 10
level: "advanced"
readingTime: "15 min"
topics: ["toil", "automation", "operators", "self-healing", "Kubernetes"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A factory that automates its repetitive assembly steps so workers can focus on quality control instead.

</Callout>

## Toil: the precise definition

Google's SRE book defines toil with five characteristics. A task is toil if it is **all five**:

```
1. MANUAL          A human runs it
2. REPETITIVE      It happens again and again
3. AUTOMATABLE     A machine could do it
4. TACTICAL        It is interrupt-driven, not strategic
5. NO ENDURING VALUE  Service is not improved by doing it
```

Plus one more practical test: **scales linearly with service size**. If your team has 10 services and toil takes 1h/week, ten more services means another 1h/week. That linear growth is what eventually drowns the team.

```typescript
// Examples of toil (kill these)
const toil = [
  "Manually rotating a TLS cert every 90 days",
  "Restarting a pod every Tuesday because it leaks memory",
  "Running 'kubectl scale' before every Black Friday",
  "Creating a Jira ticket after every release",
  "Approving the same routine PR template every day",
];

// Not toil (these are real engineering)
const notToil = [
  "Designing a new caching layer",
  "Investigating a novel production issue",
  "Reviewing capacity for the next quarter",
  "Building a new dashboard for a new feature",
];

// Tricky cases (often misclassified)
const tricky = [
  "Writing a postmortem",      // NOT toil — durable learning artifact
  "On-call paging",            // NOT toil — interrupt-driven but unavoidable
  "Code reviews",              // NOT toil — durable code quality value
  "Standup meetings",          // Toil if useless, not if they unblock work
];
```

## Measuring toil

You cannot reduce what you do not measure. The minimum viable instrumentation:

```
Every SRE logs time weekly in two columns:
  - Toil (with category)
  - Engineering (with project)

Quarterly review:
  - % of team time on toil
  - Top toil categories (rank-ordered)
  - Top toil sources by service
  - Trend over the past 4 quarters
```

A real quarterly toil report:

```
TEAM: payments-platform SRE  Q1 2026

Total team capacity:        4 engineers × 13 weeks × 40h = 2,080h
Time on toil:                  734h  (35%)
Time on engineering:         1,346h  (65%)

Top toil categories:
  1. PagerDuty alert response (low-severity)    218h  (10.5%)
  2. Manual cert rotations                       96h  (4.6%)
  3. Customer support escalations                89h  (4.3%)
  4. Manual capacity bumps for promotions        82h  (3.9%)
  5. Routine config changes from product teams   71h  (3.4%)

Top services contributing toil:
  1. checkout       186h  (mostly category 1, 2)
  2. fraud-engine   142h  (category 3, 4)
  3. payment-gw      98h  (category 5)

Initiatives launched to reduce toil:
  - cert-manager rollout (eliminates category 2):    -96h projected
  - Self-service capacity bumps (eliminates 4):      -82h projected
  - Alert tuning sprint (reduces category 1):        -100h projected

Projected Q2 toil: 22%
```

That report is the artifact that justifies the engineering work. Without numbers, "we should reduce toil" is hand-waving.

<Callout type="tip">

**Toil tracking is itself a form of toil.** Use a simple Slack bot or weekly survey, not a heavyweight time-tracking tool. The measurement should take under 5 minutes per person per week, or it gets skipped.

</Callout>

## The automation taxonomy

Not all automation is equal. There is a hierarchy of how mature a given operation is:

```
Level 0 — No automation
  Engineer runs commands manually each time.

Level 1 — Documented runbook
  Steps are written down. Still manual, but reproducible.

Level 2 — Script
  ./bin/do-the-thing.sh
  Single command. Engineer still triggers it.

Level 3 — Self-service
  Engineer (or product team) clicks a button or runs a CLI.
  No SRE in the loop.

Level 4 — Triggered automation
  System runs it automatically on a schedule or event.

Level 5 — Self-healing
  System detects the problem and runs the remediation
  with no human involvement at all.
```

The trap is jumping from Level 0 to Level 5. Each level catches different bugs. Skipping levels leaves blind spots.

## A worked example: certificate rotation

How a real team moved this from Level 0 to Level 5 over 18 months:

```
Level 0 (the past)
  Engineer SSHes to LB. Runs openssl. Copies new cert into config.
  Restarts LB. Checks dashboard. Forgets some servers. Outage 87 days
  later when a forgotten server's cert expires.

Level 1 (3 months later)
  Wiki page documents the steps. Outages drop from "every 90 days"
  to "every 6 months when the wiki gets out of date."

Level 2 (6 months later)
  ./bin/rotate-cert <hostname>
  Engineer runs it for each LB. Less error, but still reactive.

Level 3 (9 months later)
  Web UI: "Rotate cert for service X." Product team can self-serve.
  SRE off the critical path.

Level 4 (12 months later)
  Cron job runs cert rotation 30 days before expiry on every service
  with a 'auto-rotate: true' label. Slack notification on success/fail.

Level 5 (18 months later)
  cert-manager Kubernetes operator. Watches cert resources.
  Automatically requests new certs from Let's Encrypt before expiry.
  Renews certificates with no human in the loop. Has not caused
  an outage in the 4 years since.
```

Each level eliminated a class of bug. Skipping to Level 5 first would have hidden the bugs that Levels 1-3 found.

## Building a Kubernetes operator (real code)

An operator is the canonical Level 5 automation. Here is a skeleton in Go using controller-runtime — the same library kubebuilder generates.

```go
// internal/controller/databasebackup_controller.go
package controller

import (
	"context"
	"time"

	"github.com/go-logr/logr"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	dbv1 "example.com/operator/api/v1"
)

// DatabaseBackupReconciler watches DatabaseBackup CRs and ensures
// scheduled backups happen, retention is enforced, and freshness
// alerts fire if backups fall behind.
type DatabaseBackupReconciler struct {
	client.Client
	Scheme *runtime.Scheme
	Log    logr.Logger
}

func (r *DatabaseBackupReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := r.Log.WithValues("databasebackup", req.NamespacedName)

	// 1. Fetch the desired state from the cluster
	var backup dbv1.DatabaseBackup
	if err := r.Get(ctx, req.NamespacedName, &backup); err != nil {
		if errors.IsNotFound(err) {
			// CR was deleted; let owned resources GC
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	// 2. Check current state vs desired
	now := time.Now()
	nextRun := backup.Status.LastBackupTime.Add(backup.Spec.Interval.Duration)

	if now.Before(nextRun) {
		// Not time yet; requeue for the difference
		return ctrl.Result{RequeueAfter: nextRun.Sub(now)}, nil
	}

	// 3. Run the backup
	log.Info("triggering backup", "target", backup.Spec.Target)
	job, err := r.createBackupJob(ctx, &backup)
	if err != nil {
		// Update status to surface the failure
		backup.Status.LastError = err.Error()
		_ = r.Status().Update(ctx, &backup)
		return ctrl.Result{RequeueAfter: 5 * time.Minute}, err
	}

	// 4. Update status with result
	backup.Status.LastBackupTime = metav1.Now()
	backup.Status.LastBackupJob = job.Name
	backup.Status.LastError = ""
	if err := r.Status().Update(ctx, &backup); err != nil {
		return ctrl.Result{}, err
	}

	// 5. Enforce retention
	if err := r.pruneOldBackups(ctx, &backup); err != nil {
		log.Error(err, "retention pruning failed")
	}

	// 6. Schedule next reconciliation
	return ctrl.Result{RequeueAfter: backup.Spec.Interval.Duration}, nil
}

func (r *DatabaseBackupReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&dbv1.DatabaseBackup{}).
		Owns(&corev1.PersistentVolumeClaim{}).
		Complete(r)
}
```

The shape — observe, reconcile, update status, requeue — is the universal pattern. Once a team has written one operator, they can write many. Operators replace cron jobs, scripts, and human SRE intervention with declarative resources.

<Callout type="info">

**Operators are not just for K8s.** The same control-loop pattern works for cloud resources via Crossplane, terraform-controller, or AWS Controllers for Kubernetes (ACK). The pattern outlives the framework.

</Callout>

## Self-service platforms (the org-level lever)

The biggest toil reductions don't come from automating individual tasks. They come from giving product teams self-service tooling so SRE is no longer in the loop.

```typescript
// A real internal developer platform (IDP) capability list
const idpCapabilities = {
  serviceCreation:    "create-service my-new-svc → repo + CI + LB + dashboard",
  envProvisioning:    "spin up isolated env per PR, auto-tear-down",
  secretRotation:     "self-service via vault UI, audit logged",
  dnsManagement:      "self-service in hosted zone, with policy guardrails",
  databaseProvisioning: "request via PR with review-bot SRE LGTM",
  capacityBumps:      "/scale checkout 50→100 in Slack, auto-applied",
  deploys:            "GitHub Actions, no manual approvals for non-critical",
  dashboardCreation:  "templated, generated from service.yaml",
  alertCreation:      "templated, generated from SLO definition",
  certificates:       "fully automated, cert-manager + Let's Encrypt",
};
```

The metric to track: **% of routine SRE requests that have a self-service path.** Aim for 90%+. The remaining 10% are the truly novel cases that benefit from human judgment.

## When NOT to automate

Counter-intuitively, some toil should stay manual:

```
1. Tasks that happen fewer than 2x per year
   The automation costs more to build and maintain than the toil it eliminates.

2. Tasks that change frequently
   You'd be re-writing the automation more than running the manual version.

3. Tasks that benefit from human inspection
   E.g., quarterly access review — automating it removes the audit value.

4. Tasks where the failure mode of bad automation is catastrophic
   Mass-deletion scripts. The manual version forces a sanity check.
```

The decision rule: **automation cost (build + maintain) &lt; toil cost (hours × rate × frequency × time horizon)**. Do the math.

## Anti-toil culture

The cultural side is as important as the technical side. Real teams build practices like:

```
- Weekly "toil triage" — 30 min where the team picks one toil category
  to attack that sprint.
- "Toil amnesty" — anyone can flag a recurring task as toil; the team
  must respond with a plan within 2 weeks.
- "Pager retrospective" — every page is reviewed. Each page either:
    a) Fixed at root cause (better)
    b) Tuned out as noise (good)
    c) Documented as expected-rare (acceptable)
- Quarterly toil budget — like an error budget, but for toil. Above 50%,
  features get deferred until toil is reduced.
```

Without the cultural backing, the metrics become decorative.

## Stay current

- [Google SRE Book — Eliminating Toil](https://sre.google/sre-book/eliminating-toil/) — the definition
- [Kubernetes Operator pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/) — when automation belongs in a controller
- [Operator SDK](https://sdk.operatorframework.io/) — modern scaffolding
- [Backstage](https://backstage.io/) — internal developer platform reference

## Key Takeaways

1. **Toil is precisely defined** — five characteristics, all required
2. **Measure quarterly** with a simple weekly survey; track trend over time
3. **Climb the automation ladder** (0 → 5) — skipping levels hides bugs
4. **Operators are the Level 5 endpoint** for many recurring K8s tasks
5. **Self-service IDPs eliminate whole categories of toil** by removing SRE from the loop
6. **Some toil should stay manual** — automation cost > toil cost is a real boundary

