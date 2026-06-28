---
title: 'Reliability Culture & SRE Org Design'
subtitle: 'Staff+ SRE work, embedding, charters, blame-aware orgs, mentoring, sustainable on-call. The non-technical lever that makes or breaks every reliability program.'
chapter: 19
level: 'mastery'
readingTime: '26 min'
topics: ['org design', 'staff SRE', 'culture', 'embedding', 'charters', 'on-call', 'mentoring']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A hospital's safety culture — checklists and blameless reviews exist because smart people still make mistakes under pressure.

</Callout>

## Why this is the chapter that scales you

You can be the best Postgres tuner in the company and the org will still produce outages, burn out engineers, and miss SLOs — if the culture, charter, and org structure are wrong. The senior IC who graduates to Staff+ SRE spends most of their effort here, not at the keyboard.

This chapter is the org-design playbook the SRE-leadership canon points at: Google's SRE book, Will Larson's writing, Charity Majors' essays, and what real SRE teams at Stripe, Cloudflare, Shopify, and Datadog actually do.

## The four SRE org shapes

Every SRE program ends up shaped like one of these. Each has tradeoffs.

### 1. Centralized SRE (Google original model)

```
   Product Eng                Product Eng                Product Eng
       │                          │                          │
       └─────────── pages ───────┴────── pages ──────────────┘
                                  ▼
                              SRE team
                       (owns oncall for everything)
```

Pros: deep operational expertise, consistent standards, central authority.
Cons: silo'd from product, becomes a bottleneck, culture of "throw it over the wall."

### 2. Embedded SRE (Google modern + Stripe)

```
   Team A (3-6 product eng)   ←   1 SRE embedded for 6-12 months
   Team B (3-6 product eng)   ←   1 SRE embedded
   Team C (3-6 product eng)   ←   1 SRE embedded
                              ▲
              Foundation SRE team operates the platform layer
              (K8s, CI/CD, observability stack, IDP)
```

Pros: SRE knowledge transfers, product team learns to operate, no silo.
Cons: needs many SREs, churn risk when SRE rotates out.

### 3. Platform Engineering ("you build it, you run it" + golden paths)

```
   Product teams own everything — including pager.
                              ▲
              Platform team owns the substrate:
              IDP, observability, CI/CD, deploy pipeline,
              "golden paths" that make doing the right thing easy.
```

Pros: full ownership, no central bottleneck, scales to thousands of engineers.
Cons: requires very mature product engineers, long onboarding, real risk of "everyone solves the same problem differently."

### 4. SRE Consulting (small-org variant)

```
   Most product eng own pager.
                              ▲
              Tiny SRE team (2-3 people) consults on:
              SLO design, postmortems, incident retros, scaling reviews,
              hard-mode debugging.
```

Pros: works at 50-200 engineer scale, low overhead.
Cons: SRE recommendations get ignored without authority; works best with strong tech leadership backing.

### Picking the shape

```
Engineers <  100        — Consulting model.
100 < Eng  <  500       — Platform Eng + small SRE consulting wing.
500 < Eng  < 2000       — Embedded SRE per critical surface + Foundation/Platform.
Eng > 2000              — Whatever Google says + your scale-specific tweaks.
```

There is no "one right answer." There is a "right for your stage." Re-evaluate every couple years.

## The SRE charter — write it down

Every SRE team needs a one-page charter. Without it, you become whatever broken thing the org pushes onto you.

```markdown
# Payments SRE Charter (v2)

## Mission

Ensure payments services hit 99.99% SLO with on-call burden < X pages/week,
while enabling product to ship at current pace.

## What we own

- SLO definition + monitoring for all payment services.
- Production readiness reviews for new payment services.
- Pager for: payment-api, payment-worker, ledger-db.
- Postmortem facilitation for any payment Sev-2+.
- Toil tracking + automation projects on the above services.

## What we do NOT own

- Feature development.
- Database query optimization for product features (we consult, not implement).
- 1st-line on-call for non-payment services (escalate to product team).

## How we engage

- 6-month embedding rotations into payment teams.
- Production readiness gate for any new service moving to prod.
- "Return the pager" if SLO is missed 2 quarters in a row.

## Toil cap

50% of team time on toil. If exceeded for 2 quarters, scope or headcount.

## Authority

- Block production launches missing PRR criteria.
- Page product team if their service violates SLO during their on-call shift.
- Veto deploys during error-budget exhaustion.

## Disputes

Escalation path: SRE Lead → Engineering Director → CTO.
```

The most important section is "What we do NOT own." Without it, you'll absorb every operational job nobody wants.

## Production Readiness Review (PRR) — the gate that protects you

The single highest-leverage process in mature SRE orgs. A new service does not move to prod (or to SRE on-call ownership) until it passes PRR.

Sample checklist:

```
Architecture
  □ Service diagram, dependencies, failure modes documented
  □ Capacity model (RPS supported, queue depths, fan-out)
  □ Redundancy at every tier (no SPOF)

Observability
  □ RED metrics for every endpoint
  □ USE metrics for every owned resource
  □ Structured logging with trace IDs
  □ Distributed tracing wired
  □ Dashboards: golden signals, infra, business metrics
  □ Runbook for top 5 alerts

Reliability
  □ SLI/SLO defined and approved by stakeholders
  □ Burn-rate alerts wired to PagerDuty
  □ Error budget policy signed
  □ Health checks: liveness vs readiness, correctly distinct
  □ Graceful shutdown < 30s

Operational
  □ Deploy: canary or blue-green, automated rollback
  □ Feature flags for risky changes
  □ Incident runbook (mitigation playbook for top 5 alerts)
  □ Backup + tested restore for any stateful component
  □ DR plan with measured RTO/RPO

Security & compliance
  □ Secrets via vault/KMS, never env vars
  □ Least-privilege IAM/SA
  □ NetworkPolicy (default deny)
  □ Threat model (top 3 attacker scenarios)

People
  □ Owner team identified, alternate owner identified
  □ On-call rotation set up
  □ Runbook reviewed by oncoming on-call engineer
```

A team that's used to "ship and iterate" will resist the PRR. The right reframe: **PRR is the price of getting SRE pager support.** No PRR? Product team carries the pager. Most teams change their mind quickly.

## On-call sustainability

Burnout is the failure mode that ends SRE programs. The signals:

```
- Pages > 2/week per person sustained
- Most pages unactionable (false positives, "ack and ignore")
- After-hours pages > 25% of total
- People declining promotions because "I can't add more on-call"
- High attrition specifically among on-call engineers
```

The senior-team rules of thumb:

```
- Rotation size: minimum 6, ideally 8 people. Smaller = unsustainable.
- One week on, multiple weeks off.
- Any page > 30 min after-hours = comp time the next day.
- Page volume > 2/week sustained = paging is broken; fix the underlying alert.
- Quarterly retro on the rotation: what's noisy, what's missing, what hurts.
```

### The follow-the-sun pattern

```
NA team    — covers Americas business hours (~16 h/day with buffer)
EU team    — covers EMEA business hours
APAC team  — covers APAC business hours

Each pod: 6+ engineers. Each carries pager during their region's hours only.
After-hours = lower-severity escalation only; criticals still escalate immediately.
```

This is the only sustainable on-call shape past ~50 engineers. Smaller orgs do "tag-team" on-call across two timezones with explicit handoff.

### Compensation models

Real-world patterns:

```
- On-call hourly stipend ($N/hour on-call, regardless of pages)
- Per-page bonus (creates wrong incentives — gamed)
- Time-in-lieu (best for sustainability, requires manager support)
- Just include in salary band (assumes the salary actually reflects it)
```

Whichever you pick: be transparent. Engineers compare notes; opaque on-call comp breeds resentment fast.

## Postmortems and blame-aware (not "blameless") culture

"Blameless" became a slogan that confused people. The honest framing: **blame-aware**. We name the systems and processes that failed. We do not hide that humans were involved — but we accept that the system let the human make the mistake.

```
Bad postmortem language:
  "Engineer X ran the wrong command and deleted production."

Good postmortem language:
  "The deploy tool allowed any engineer to run a destructive command
   on prod with no confirmation and no second-eye review. Engineer X
   ran it during the incident; the tool's design made this possible."
```

The action items target the system, not the person. The engineer is named only for _what they did to mitigate_, not for what they "got wrong."

### Postmortem rituals that actually work

```
- Within 48 h of resolution: draft published.
- Within 1 week: cross-team review meeting.
- Within 2 weeks: action items assigned with owners + dates.
- Quarterly: review of action items completion. Public to engineering.
- "Postmortem of the postmortem" once a year — what's not getting done?
```

Action item completion rates below 70% mean the postmortem ritual is theater. Fix the _process_, not the postmortems.

## Career ladders for SRE

A common org failure: SRE has no senior career path because "we hire from infra/SWE." Result: senior SREs leave for SWE roles.

The Staff+ SRE ladder, condensed:

```
Senior SRE (L5-ish)
  - Operates services solo. Owns SLO + on-call for at least one critical service.
  - Drives postmortems. Authors runbooks. Mentors L3-L4.

Staff SRE (L6-ish)
  - Owns reliability strategy for a product area.
  - Runs PRR programs, defines org-wide standards.
  - Identifies systemic failure patterns across teams.

Senior Staff SRE (L7-ish)
  - Cross-org reliability programs (e.g., "cut multi-region cost 30%").
  - Sets the SRE tech strategy.
  - External presence: conferences, papers, hiring brand.

Principal SRE (L8+)
  - Defines what reliability means in this company.
  - Owned outcomes are years long.
  - Counterpart to a VP/C-level on the technical side.
```

The job widens, not narrows, with seniority. A Staff SRE who only fights fires is mis-leveled.

## Mentoring — the highest-leverage IC work

A senior SRE who mentors three other engineers ships more reliability than one who fixes more incidents themselves. The patterns:

```
- Pair on real incidents. Run the IC role for them while they observe.
- Code-review their runbooks, not just their code.
- Expose them to design reviews above their level.
- Sponsor (advocate for their work in rooms they're not in).
- Give them visibility — let them present the team's work upward.
```

Mentoring a junior to the point they can be IC for a Sev-2 takes 6-12 months and is worth more than three years of your own incident heroics.

## Cross-team programs Staff+ SRE owns

The work that justifies the level:

```
- Reliability roadmap. What gets us to 99.99%? Where do we stop investing?
- SLO program. Standardize SLI definitions across services. Roll up to product.
- Incident program. Common severity levels, common postmortem template,
  common metrics tracked org-wide.
- Toil program. Org-wide toil dashboard; quarterly automation OKRs.
- DR program. Schedule + content of DR exercises across the company.
- Capacity program. Quarterly capacity reviews per business line.
- On-call health program. Org-wide page volume, after-hours load, retention.
```

Each is a year-long initiative. Each touches every team. None of them are "fix this one outage."

## Reliability metrics for leadership

The numbers a Staff+ SRE reports to leadership:

```
SLO attainment by service             — green/yellow/red. Trend.
Time spent on toil vs project work    — per team. Trend.
On-call health (pages/week, after-hours %) — per rotation. Trend.
Postmortem action item completion %   — org. Quarterly.
Incidents by severity                 — count, MTTR, MTTD.
Change failure rate                   — % of deploys triggering rollback.
Cost per request (or chosen unit)     — per service. Trend.
```

Notice what's missing: no "uptime %." That's a vanity metric. SLO attainment is the better one — it captures the _user-relevant_ reliability the team committed to.

## Hiring and team composition

A balanced SRE team has roughly:

```
- 1 senior IC who could be staff
- 2-3 mid-IC who carry day-to-day work
- 1-2 junior IC growing into the role
- 1 manager (player-coach in small teams; pure manager past ~6 reports)
```

Hiring filters that actually predict success:

```
- Has run a real on-call rotation (not just "I was on a team that did").
- Can explain a system at multiple altitudes (data flow, single component, single line).
- Reads Jepsen reports for fun. Or Brendan Gregg. Or Tanya Reilly.
- Has written a postmortem you can read.
- Has automated themselves out of a job at least once.
```

The classic hiring trap: hiring "DevOps" engineers who are really CI/CD engineers, then expecting them to do production reliability. Those are different skills. Be honest with yourself about what you're filling.

## Common org pitfalls

1. **No charter, no scope discipline.** SRE absorbs everything operational; can't deliver on anything.
2. **No production readiness gate.** Bad services land on SRE pagers; SRE burns out.
3. **Tiny on-call rotations.** 3-person rotations break a person every quarter.
4. **Postmortems with no action item follow-through.** Same incident next year.
5. **No senior IC ladder.** Senior SREs leave.
6. **Punishing the engineer who rolled back.** They're the hero of the story.
7. **SRE reporting only to engineering.** Without product/leadership exposure, no leverage.
8. **Toil cap not enforced.** Team becomes ops, slowly.

## A real org transformation — one example

A real pattern from a mid-sized SaaS, anonymized:

```
Year 0: 80 engineers, 2 "DevOps" engineers, 1 in-prod outage per week.
        DevOps team handled all alerts, all deploys. Burnout.

Year 1: Hire SRE lead (Staff). Write charter. Convert DevOps to Platform team.
        Establish PRR for new services. SLOs for top 5 services.
        Outages: ~1/2 weeks. Same DevOps headcount, lower burnout.

Year 2: Embedded SRE rotation: 1 SRE embeds with each product area for
        6 months, brings them to ops maturity. Toil program. Quarterly DR.
        Outages: < 1/month. Three SREs total. Product teams own most pagers.

Year 3: Platform Eng team owns golden paths: deploy template, observability
        template, on-call template. Product teams ship via paved roads.
        SRE focuses on cross-cutting + hard-mode incidents. Cost program.
        Outages: rare, short, well-postmortemed. SRE team can take vacations.
```

Three years to "good." Not because the technology was hard — because culture and structure took that long to land.

## Stay current

- [Will Larson — StaffEng](https://staffeng.com/) and [Irrational Exuberance](https://lethain.com/) — eng org structure
- [Charity Majors — charity.wtf](https://charity.wtf/) — modern ops culture writing
- [Lara Hogan — wherewithall.com](https://larahogan.me/) — engineering management
- [Google re:Work](https://rework.withgoogle.com/) — team effectiveness research (psych safety, etc.)

## Key Takeaways

1. **Pick an SRE org shape that fits your stage; revisit annually.**
2. **A written charter is the floor — without one, scope creep destroys the team.**
3. **Production Readiness Review is the highest-leverage gate** — it's why product teams improve.
4. **On-call sustainability is the long-term constraint** — protect rotation size and after-hours load.
5. **Postmortems are blame-aware, not blameless** — name the system, not the person; track action items.
6. **Staff+ SRE work is org-wide programs**, not heroic incident response.
7. **Career ladders for SRE matter** — without them, your seniors leave for SWE.
