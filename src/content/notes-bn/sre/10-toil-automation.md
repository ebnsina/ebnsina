---
title: 'Toil & Automation'
subtitle: 'toil মাপা, 50% cap, আর one-off script থেকে self-healing operator পর্যন্ত automation taxonomy।'
chapter: 10
level: 'advanced'
readingTime: '15 মিনিট'
topics: ['toil', 'automation', 'operators', 'self-healing', 'Kubernetes']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জগতের উদাহরণ**

একটা factory যেটা তার পুনরাবৃত্তিমূলক assembly step-গুলো automate করে যাতে শ্রমিকরা তার বদলে quality control-এ মনোযোগ দিতে পারে।

</Callout>

## Toil: সুনির্দিষ্ট সংজ্ঞা

Google-এর SRE বই toil-কে পাঁচটা বৈশিষ্ট্য দিয়ে সংজ্ঞায়িত করে। একটা task toil যদি সেটা **পাঁচটাই** হয়:

```
1. MANUAL          A human runs it
2. REPETITIVE      It happens again and again
3. AUTOMATABLE     A machine could do it
4. TACTICAL        It is interrupt-driven, not strategic
5. NO ENDURING VALUE  Service is not improved by doing it
```

সাথে আরও একটা ব্যবহারিক test: **service size-এর সাথে linearly scale করে**। যদি আপনার team-এর 10টা service থাকে আর toil-এ সপ্তাহে 1h লাগে, আরও দশটা service মানে আরও সপ্তাহে 1h। সেই linear growth-ই শেষ পর্যন্ত team-কে ডুবিয়ে দেয়।

```typescript
// Examples of toil (kill these)
const toil = [
	'Manually rotating a TLS cert every 90 days',
	'Restarting a pod every Tuesday because it leaks memory',
	"Running 'kubectl scale' before every Black Friday",
	'Creating a Jira ticket after every release',
	'Approving the same routine PR template every day'
];

// Not toil (these are real engineering)
const notToil = [
	'Designing a new caching layer',
	'Investigating a novel production issue',
	'Reviewing capacity for the next quarter',
	'Building a new dashboard for a new feature'
];

// Tricky cases (often misclassified)
const tricky = [
	'Writing a postmortem', // NOT toil — durable learning artifact
	'On-call paging', // NOT toil — interrupt-driven but unavoidable
	'Code reviews', // NOT toil — durable code quality value
	'Standup meetings' // Toil if useless, not if they unblock work
];
```

## Toil মাপা

আপনি যা মাপেন না তা কমাতে পারবেন না। ন্যূনতম কার্যকর instrumentation:

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

একটা বাস্তব quarterly toil report:

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

সেই report-টাই সেই artifact যেটা engineering কাজকে যুক্তিসঙ্গত করে। সংখ্যা ছাড়া, "আমাদের toil কমানো উচিত" কথাটা ফাঁকা বুলি।

<Callout type="tip">

**Toil tracking নিজেই এক ধরনের toil।** একটা ভারী time-tracking tool নয়, একটা সাধারণ Slack bot বা weekly survey ব্যবহার করুন। মাপার কাজটা প্রতি ব্যক্তির প্রতি সপ্তাহে 5 মিনিটের কম লাগা উচিত, নয়তো এটা skip হয়ে যায়।

</Callout>

## automation taxonomy

সব automation সমান নয়। একটা নির্দিষ্ট operation কতটা mature তার একটা hierarchy আছে:

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

ফাঁদটা হলো Level 0 থেকে Level 5-এ লাফ দেওয়া। প্রতিটা level আলাদা bug ধরে। level skip করলে blind spot থেকে যায়।

## একটা worked example: certificate rotation

কীভাবে একটা বাস্তব team এটাকে 18 মাসে Level 0 থেকে Level 5-এ নিয়ে গেল:

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

প্রতিটা level একটা শ্রেণির bug দূর করেছে। প্রথমেই Level 5-এ লাফ দিলে Level 1-3 যে bug-গুলো খুঁজে পেয়েছে সেগুলো লুকিয়ে থাকত।

## একটা Kubernetes operator বানানো (বাস্তব code)

একটা operator হলো canonical Level 5 automation। এখানে Go-তে controller-runtime দিয়ে একটা skeleton আছে — একই library kubebuilder generate করে।

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

এর shape — observe, reconcile, update status, requeue — হলো universal pattern। একবার কোনো team একটা operator লিখে ফেললে, তারা অনেকগুলো লিখতে পারে। Operator cron job, script, আর human SRE intervention-কে declarative resource দিয়ে প্রতিস্থাপন করে।

<Callout type="info">

**Operator শুধু K8s-এর জন্য নয়।** একই control-loop pattern Crossplane, terraform-controller, বা AWS Controllers for Kubernetes (ACK)-এর মাধ্যমে cloud resource-এর জন্যও কাজ করে। pattern-টা framework-এর চেয়ে বেশি টেকে।

</Callout>

## Self-service platform (org-level lever)

সবচেয়ে বড় toil হ্রাস একক task automate করা থেকে আসে না। সেগুলো আসে product team-কে self-service tooling দেওয়া থেকে, যাতে SRE আর loop-এ না থাকে।

```typescript
// A real internal developer platform (IDP) capability list
const idpCapabilities = {
	serviceCreation: 'create-service my-new-svc → repo + CI + LB + dashboard',
	envProvisioning: 'spin up isolated env per PR, auto-tear-down',
	secretRotation: 'self-service via vault UI, audit logged',
	dnsManagement: 'self-service in hosted zone, with policy guardrails',
	databaseProvisioning: 'request via PR with review-bot SRE LGTM',
	capacityBumps: '/scale checkout 50→100 in Slack, auto-applied',
	deploys: 'GitHub Actions, no manual approvals for non-critical',
	dashboardCreation: 'templated, generated from service.yaml',
	alertCreation: 'templated, generated from SLO definition',
	certificates: "fully automated, cert-manager + Let's Encrypt"
};
```

যে metric track করবেন: **routine SRE request-এর কত % এর একটা self-service path আছে।** 90%+ লক্ষ্য রাখুন। বাকি 10% হলো সত্যিকারের অভিনব case যেগুলো human judgment থেকে উপকৃত হয়।

## কখন automate করবেন না

উল্টো দিকে, কিছু toil manual থাকাই উচিত:

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

সিদ্ধান্তের নিয়ম: **automation cost (build + maintain) &lt; toil cost (hours × rate × frequency × time horizon)**। অঙ্কটা কষুন।

## Anti-toil culture

সাংস্কৃতিক দিকটা technical দিকের মতোই গুরুত্বপূর্ণ। বাস্তব team এমন practice গড়ে তোলে:

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

সাংস্কৃতিক সমর্থন ছাড়া, metric-গুলো সাজানো শোভা হয়ে দাঁড়ায়।

## আপডেটেড থাকুন

- [Google SRE Book — Eliminating Toil](https://sre.google/sre-book/eliminating-toil/) — সংজ্ঞা
- [Kubernetes Operator pattern](https://kubernetes.io/docs/concepts/extend-kubernetes/operator/) — কখন automation একটা controller-এ থাকা উচিত
- [Operator SDK](https://sdk.operatorframework.io/) — আধুনিক scaffolding
- [Backstage](https://backstage.io/) — internal developer platform reference

## মূল কথাগুলো

1. **Toil সুনির্দিষ্টভাবে সংজ্ঞায়িত** — পাঁচটা বৈশিষ্ট্য, সবগুলো লাগবে
2. **প্রতি quarter-এ মাপুন** একটা সাধারণ weekly survey দিয়ে; সময়ের সাথে trend track করুন
3. **automation ladder বেয়ে উঠুন** (0 → 5) — level skip করলে bug লুকিয়ে থাকে
4. **Operator হলো অনেক পুনরাবৃত্ত K8s task-এর Level 5 endpoint**
5. **Self-service IDP পুরো toil শ্রেণি দূর করে** SRE-কে loop থেকে সরিয়ে
6. **কিছু toil manual থাকাই উচিত** — automation cost > toil cost একটা বাস্তব সীমারেখা
