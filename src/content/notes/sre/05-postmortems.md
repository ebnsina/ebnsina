---
title: 'Blameless Postmortems'
subtitle: 'The full template Google, Etsy, and Stripe use, with action-item discipline that prevents the same incident twice.'
chapter: 5
level: 'intermediate'
readingTime: '15 min'
topics: ['postmortem', 'blameless', 'root cause', 'five whys', 'action items']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why blameless

The single most important rule: **the postmortem investigates the system, not the person.**

If engineers fear that incidents will be used against them, they will:

- Hide near-misses (so you never learn from cheap failures)
- Minimize the timeline (so you misunderstand what happened)
- Avoid risky-but-needed work (so velocity dies)

Blame culture turns a $10k learning opportunity into a $1M outage in the future, every time.

```
✗ "Fatima deployed bad code at 14:00 and broke checkout."
✓ "The deployment pipeline allowed an untested config change to reach
   production. The change disabled connection pooling, which had no
   alert. Fatima was the deployer, but the system permitted the failure."
```

Same incident. The first version produces a fired engineer. The second version produces three durable fixes that prevent the next one.

<Callout type="info">

**Real-World Analogy**

Aviation safety reports are anonymous and immune from prosecution by FAA design. Pilots report near-misses freely, the system gets safer, and the airline industry has a fatality rate that decreases every decade. SRE postmortems use the same logic.

</Callout>

## The full postmortem template

This is the structure used (with minor variations) at Google, Stripe, GitHub, Etsy, and Shopify. Copy it verbatim — every field exists for a reason.

```markdown
# Postmortem: [Service] [What broke] — [Date]

**Status**: Draft | In Review | Final
**Author**: [Engineer]
**Reviewers**: [IC, Engineering Manager, Service Owner]
**Date of incident**: 2026-05-03
**Date of postmortem**: 2026-05-10

## TL;DR

One paragraph. What broke, who was affected, how long, and the
single most important action item.

## Impact

- **Duration**: 47 minutes (14:22 - 15:09 UTC)
- **Customer impact**: 12% of checkout requests returned HTTP 503
- **Revenue impact**: ~$42,000 estimated lost orders
- **SLO impact**: Burned 38% of monthly checkout error budget
- **Internal impact**: 6 engineers paged; on-call shift extended 4h

## Detection

- **First symptom (external)**: Customer support tickets at 14:18
- **First alert fired**: 14:22 (CheckoutErrorBudgetFastBurn)
- **Detection gap**: 4 minutes. Alert sensitivity was correct;
  customers happened to notice first because the burn rate took
  ~4 minutes to cross the threshold.

## Timeline (UTC)

14:18 First customer support ticket: "checkout button doing nothing"
14:22 CheckoutErrorBudgetFastBurn fires; @fatima paged
14:24 Fatima declares SEV1, opens #inc-2271, pages IC rotation
14:25 @omar (IC) takes command. @maryam (OL) starts investigation
14:28 Maryam identifies elevated 503 rate from EU pods only
14:31 Hypothesis: connection pool exhaustion (db_connections_inuse
at 50/50 max in EU)
14:35 Omar authorizes pool size bump to 100 in EU canary
14:39 Canary healthy; rolling out to full EU fleet
14:46 Full EU fleet at pool=100; 503 rate dropping
14:51 503 rate back to baseline; entering MONITORING
15:09 IC declares incident RESOLVED after 18min stable

## Root cause

The 14:00 deploy of payment-service v2.14.0 included a config
change that lowered the maximum DB connection pool from 100 to 50,
intended only for the staging environment. The change was promoted
to production through a merge that was reviewed but did not catch
the env-specific value being baked into the default config map.

Under normal traffic, 50 connections were sufficient. At 14:18
the EU region hit a routine traffic spike (marketing email
campaign), demand exceeded pool capacity, and connection acquisition
timeouts cascaded into 503 responses.

## Five whys

1. **Why did checkout 503?**
   DB connection acquisition timed out.

2. **Why did the pool exhaust?**
   Pool size was misconfigured to 50 instead of 100.

3. **Why was it misconfigured?**
   A staging-only override leaked into production via merged config.

4. **Why did the merge succeed without catching it?**
   No automated check that staging-vs-prod config values are
   reasonable. Reviewer relied on memory of normal pool sizes.

5. **Why is there no automated check?**
   Config changes are reviewed as plain YAML diffs without
   schema validation or comparison against historical baselines.

## Contributing factors

- Marketing campaign generated traffic spike at the same hour
- EU region runs hotter on average; was first to saturate
- No alert on db_connections_inuse / db_connections_max ratio
- Runbook mentioned "check connection pool" but did not link to
  the dashboard panel that would show it

## What went well

- Burn-rate alert fired correctly within 4 minutes
- IC role transition was clean (Fatima → Omar without confusion)
- Mitigation took 17 minutes from page to canary fix
- Status page was updated within 12 minutes (under target)

## What went poorly

- Customer noticed before alert fired (4-minute detection gap)
- Connection pool dashboard exists but was not findable in the runbook
- The misconfiguration could have been caught at PR time
- 6 engineers were pulled in; only 3 needed for the response

## Action items

| ID   | Action                                                              | Owner     | Priority | Due        |
| ---- | ------------------------------------------------------------------- | --------- | -------- | ---------- |
| AI-1 | Add OPA policy: prod config pool size must be >= 75                 | @maryam   | P0       | 2026-05-10 |
| AI-2 | Add db_connections_inuse / max alert at 80% saturation              | @omar     | P0       | 2026-05-12 |
| AI-3 | Link runbook step "check pool" to specific Grafana panel            | @fatima   | P1       | 2026-05-17 |
| AI-4 | Pre-deploy check: diff config against last 7d baseline              | @omar     | P1       | 2026-05-24 |
| AI-5 | On-call IC training module on "when to stop paging more responders" | @sre-lead | P2       | 2026-06-15 |

## Lessons learned

- Config changes need the same rigor as code changes (schema +
  policy + baseline comparison).
- Saturation metrics belong on the pager, not just the dashboard.
- Runbook links should be deep links, not "look at Grafana."
```

## Action item discipline (the part that actually matters)

A postmortem with action items that never ship is worse than no postmortem — it teaches the team that postmortems are theater.

```typescript
// The action item rule set, enforced by tooling

const actionItemRules = {
	format: 'Each AI is a single, owned, dated, sized work item',
	tracking: 'Created in Jira/Linear; tagged with the incident ID',
	sizing: 'Must be smaller than 2 sprints. Bigger? Break it down.',
	staffing: "Owner allocates time in the next sprint, not 'when free'",

	enforcement: {
		'P0 action items': "Block the responsible team's sprint planning",
		'Aging > 30 days': 'Escalates to engineering manager',
		'Aging > 60 days': 'Escalates to director, written justification'
	},

	audit: 'Quarterly review of all action items across postmortems'
};
```

Track AI completion rate as an SRE team metric. Healthy teams ship 80%+ of P0/P1 action items within their stated due date. Below 50% means postmortems are decorative.

<Callout type="warning">

**Beware the "improve documentation" action item.** It is the most common AI and the least useful. If the only fix is "write better docs," the actual root cause is probably "we relied on humans to remember a thing the system should enforce." Push for code/config/policy fixes instead.

</Callout>

## The postmortem review meeting

A 60-minute meeting, scheduled within 2 weeks of the incident, attendees:

```
- Author (presents)
- IC and OL from the incident
- Service owner and engineering manager
- One person from a different team (fresh-eyes critic)
- SRE team lead (to ensure rigor)
```

The fresh-eyes critic is the secret ingredient. They ask "wait, why does that even exist?" questions that the team is too close to the problem to ask themselves.

The meeting is NOT for re-litigating the incident. It is for:

1. Validating the timeline and root cause
2. Approving the action items (sizing, owners, dates)
3. Identifying any patterns across recent postmortems

## Aggregating learning across postmortems

Individual postmortems prevent specific incidents. Aggregated postmortems prevent classes of incidents.

```typescript
// Quarterly postmortem aggregation
type IncidentTag =
	| 'config'
	| 'deploy'
	| 'capacity'
	| 'dependency'
	| 'security'
	| 'data'
	| 'human-error'
	| 'third-party';

interface PostmortemSummary {
	id: string;
	date: Date;
	severity: 'SEV1' | 'SEV2';
	tags: IncidentTag[];
	rootCauseCategory: string;
	durationMin: number;
	actionItemsTotal: number;
	actionItemsCompleted: number;
}

// At quarterly review:
// "We had 12 SEV1/SEV2 incidents this quarter. 7 were tagged 'config'.
//  We need a config-management initiative, not 7 individual fixes."
```

This is how you spot that, e.g., 40% of your incidents come from third-party DNS provider failures and you need to invest in DNS resilience as a project, not as another runbook entry.

## Public vs internal postmortems

A public postmortem (published on your blog or status page) is a powerful trust-building tool, but it is a different document.

```
INTERNAL                          PUBLIC
- All technical detail            - High-level what + impact
- Specific dollar figures         - "Affected ~12% of users"
- Names of engineers              - No individual names
- Internal tool names             - Generic descriptions
- All five whys                   - Top-level cause + key fix
- Full action items               - "We are addressing X, Y, Z"
```

Cloudflare's public postmortems are the gold standard — read 2-3 of them before publishing your first one.

## Stay current

- [Google SRE Book — Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) — blameless framing
- [Google's postmortem template](https://sre.google/workbook/postmortem-culture/#example-postmortem) — copy this
- [danluu/post-mortems](https://github.com/danluu/post-mortems) — public postmortem reading library
- [Etsy debriefing facilitation guide](https://extfiles.etsy.com/DebriefingFacilitationGuide.pdf) — how to run the meeting

## Key Takeaways

1. **Blameless or worthless** — fear destroys the data you need to prevent the next incident
2. **The template is non-optional** — it captures the same fields every time so they aggregate
3. **Action items must be sized, owned, dated, and tracked** — or the postmortem was decorative
4. **A fresh-eyes critic in the review meeting** finds what the team is too close to see
5. **Aggregate quarterly** to spot incident classes that need a project, not a patch
