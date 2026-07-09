---
title: 'Reliability Culture ও SRE Org Design'
subtitle: 'Staff+ SRE work, embedding, charters, blame-aware org, mentoring, sustainable on-call। যে non-technical lever প্রতিটা reliability program বানায় বা ভাঙে।'
chapter: 19
level: 'mastery'
readingTime: '26 মিনিট'
topics: ['org design', 'staff SRE', 'culture', 'embedding', 'charters', 'on-call', 'mentoring']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা hospital-এর safety culture — checklist আর blameless review থাকে কারণ smart লোকজনও চাপের মুখে ভুল করে।

</Callout>

## এই chapter কেন আপনাকে scale করে

আপনি company-র সেরা Postgres tuner হতে পারেন আর org তবুও outage তৈরি করবে, engineer-দের burn out করবে, আর SLO মিস করবে — যদি culture, charter আর org structure ভুল হয়। যে senior IC Staff+ SRE-তে graduate করে সে তার বেশিরভাগ effort এখানে ব্যয় করে, keyboard-এ নয়।

এই chapter হলো সেই org-design playbook যেদিকে SRE-leadership canon নির্দেশ করে: Google-এর SRE book, Will Larson-এর লেখা, Charity Majors-এর essay, আর Stripe, Cloudflare, Shopify আর Datadog-এর বাস্তব SRE team-রা আসলে যা করে।

## চারটা SRE org আকার

প্রতিটা SRE program শেষমেশ এগুলোর একটার আকার নেয়। প্রতিটার tradeoff আছে।

### 1. Centralized SRE (Google-এর মূল model)

```
   Product Eng                Product Eng                Product Eng
       │                          │                          │
       └─────────── pages ───────┴────── pages ──────────────┘
                                  ▼
                              SRE team
                       (owns oncall for everything)
```

Pros: deep operational expertise, consistent standard, central authority।
Cons: product থেকে silo'd, একটা bottleneck হয়ে যায়, "throw it over the wall" culture।

### 2. Embedded SRE (Google modern + Stripe)

```
   Team A (3-6 product eng)   ←   1 SRE embedded for 6-12 months
   Team B (3-6 product eng)   ←   1 SRE embedded
   Team C (3-6 product eng)   ←   1 SRE embedded
                              ▲
              Foundation SRE team operates the platform layer
              (K8s, CI/CD, observability stack, IDP)
```

Pros: SRE knowledge transfer হয়, product team operate করতে শেখে, কোনো silo নেই।
Cons: অনেক SRE লাগে, SRE rotate out হলে churn risk।

### 3. Platform Engineering ("you build it, you run it" + golden paths)

```
   Product teams own everything — including pager.
                              ▲
              Platform team owns the substrate:
              IDP, observability, CI/CD, deploy pipeline,
              "golden paths" that make doing the right thing easy.
```

Pros: full ownership, কোনো central bottleneck নেই, হাজার হাজার engineer পর্যন্ত scale করে।
Cons: খুব mature product engineer লাগে, দীর্ঘ onboarding, "সবাই একই সমস্যা ভিন্নভাবে সমাধান করে"-র বাস্তব risk।

### 4. SRE Consulting (small-org variant)

```
   Most product eng own pager.
                              ▲
              Tiny SRE team (2-3 people) consults on:
              SLO design, postmortems, incident retros, scaling reviews,
              hard-mode debugging.
```

Pros: 50-200 engineer scale-এ কাজ করে, low overhead।
Cons: authority ছাড়া SRE recommendation উপেক্ষিত হয়; strong tech leadership backing থাকলে সবচেয়ে ভালো কাজ করে।

### আকার বাছা

```
Engineers <  100        — Consulting model.
100 < Eng  <  500       — Platform Eng + small SRE consulting wing.
500 < Eng  < 2000       — Embedded SRE per critical surface + Foundation/Platform.
Eng > 2000              — Whatever Google says + your scale-specific tweaks.
```

কোনো "একটা সঠিক উত্তর" নেই। একটা "আপনার stage-এর জন্য সঠিক" আছে। প্রতি কয়েক বছরে পুনর্মূল্যায়ন করুন।

## SRE charter — লিখে রাখুন

প্রতিটা SRE team-এর একটা one-page charter লাগে। এটা ছাড়া, org আপনার উপর যে ভাঙাচোরা জিনিস চাপায় আপনি তাই হয়ে যান।

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

সবচেয়ে গুরুত্বপূর্ণ section হলো "What we do NOT own"। এটা ছাড়া, আপনি প্রতিটা operational কাজ শুষে নেবেন যা কেউ চায় না।

## Production Readiness Review (PRR) — যে gate আপনাকে রক্ষা করে

Mature SRE org-এ সবচেয়ে বেশি-leverage-এর process। একটা নতুন service PRR পাস না করা পর্যন্ত prod-এ (বা SRE on-call ownership-এ) যায় না।

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

"ship and iterate"-এ অভ্যস্ত একটা team PRR-এ resist করবে। সঠিক reframe: **PRR হলো SRE pager support পাওয়ার দাম।** PRR নেই? Product team pager বহন করে। বেশিরভাগ team দ্রুত মত পাল্টায়।

## On-call sustainability

Burnout হলো সেই failure mode যা SRE program শেষ করে দেয়। লক্ষণ:

```
- Pages > 2/week per person sustained
- Most pages unactionable (false positives, "ack and ignore")
- After-hours pages > 25% of total
- People declining promotions because "I can't add more on-call"
- High attrition specifically among on-call engineers
```

Senior-team rule of thumb:

```
- Rotation size: minimum 6, ideally 8 people. Smaller = unsustainable.
- One week on, multiple weeks off.
- Any page > 30 min after-hours = comp time the next day.
- Page volume > 2/week sustained = paging is broken; fix the underlying alert.
- Quarterly retro on the rotation: what's noisy, what's missing, what hurts.
```

### Follow-the-sun pattern

```
NA team    — covers Americas business hours (~16 h/day with buffer)
EU team    — covers EMEA business hours
APAC team  — covers APAC business hours

Each pod: 6+ engineers. Each carries pager during their region's hours only.
After-hours = lower-severity escalation only; criticals still escalate immediately.
```

~50 engineer-এর পরে এটাই একমাত্র sustainable on-call আকার। ছোট org-রা explicit handoff সহ দুই timezone জুড়ে "tag-team" on-call করে।

### Compensation model

বাস্তব pattern:

```
- On-call hourly stipend ($N/hour on-call, regardless of pages)
- Per-page bonus (creates wrong incentives — gamed)
- Time-in-lieu (best for sustainability, requires manager support)
- Just include in salary band (assumes the salary actually reflects it)
```

যেটাই বাছুন: transparent থাকুন। Engineer-রা note মেলায়; অস্বচ্ছ on-call comp দ্রুত resentment জন্মায়।

## Postmortem আর blame-aware (blameless নয়) culture

"Blameless" একটা slogan হয়ে গেল যা লোকজনকে বিভ্রান্ত করল। সৎ framing: **blame-aware**। আমরা যে system আর process fail করেছে সেগুলোর নাম করি। আমরা লুকাই না যে human জড়িত ছিল — কিন্তু আমরা মেনে নিই যে system-ই human-কে ভুল করতে দিয়েছে।

```
Bad postmortem language:
  "Engineer X ran the wrong command and deleted production."

Good postmortem language:
  "The deploy tool allowed any engineer to run a destructive command
   on prod with no confirmation and no second-eye review. Engineer X
   ran it during the incident; the tool's design made this possible."
```

Action item system-কে target করে, ব্যক্তিকে নয়। Engineer-এর নাম শুধু _তারা mitigate করতে যা করেছে_ তার জন্য উল্লেখ হয়, তারা যা "ভুল করেছে" তার জন্য নয়।

### যে postmortem ritual আসলে কাজ করে

```
- Within 48 h of resolution: draft published.
- Within 1 week: cross-team review meeting.
- Within 2 weeks: action items assigned with owners + dates.
- Quarterly: review of action items completion. Public to engineering.
- "Postmortem of the postmortem" once a year — what's not getting done?
```

70%-এর নিচে action item completion rate মানে postmortem ritual একটা theater। _process_ ফিক্স করুন, postmortem নয়।

## SRE-র জন্য career ladder

একটা common org failure: SRE-র কোনো senior career path নেই কারণ "আমরা infra/SWE থেকে hire করি"। ফল: senior SRE-রা SWE role-এর জন্য চলে যায়।

Staff+ SRE ladder, সংক্ষিপ্ত:

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

seniority-র সাথে কাজ প্রশস্ত হয়, সংকুচিত হয় না। যে Staff SRE শুধু আগুন নেভায় সে mis-leveled।

## Mentoring — সবচেয়ে বেশি-leverage-এর IC work

যে senior SRE তিনজন অন্য engineer-কে mentor করে সে যে নিজে বেশি incident ফিক্স করে তার চেয়ে বেশি reliability ship করে। Pattern:

```
- Pair on real incidents. Run the IC role for them while they observe.
- Code-review their runbooks, not just their code.
- Expose them to design reviews above their level.
- Sponsor (advocate for their work in rooms they're not in).
- Give them visibility — let them present the team's work upward.
```

একজন junior-কে এই পর্যায়ে mentor করা যেখানে সে একটা Sev-2-র জন্য IC হতে পারে তাতে 6-12 মাস লাগে আর এটা আপনার নিজের তিন বছরের incident heroics-এর চেয়ে বেশি মূল্যবান।

## যে cross-team program Staff+ SRE-র মালিক

যে কাজ level-টাকে justify করে:

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

প্রতিটা একটা year-long initiative। প্রতিটা প্রতিটা team-কে স্পর্শ করে। কোনোটাই "এই একটা outage ফিক্স করো" নয়।

## Leadership-এর জন্য reliability metric

যে সংখ্যাগুলো একজন Staff+ SRE leadership-কে report করে:

```
SLO attainment by service             — green/yellow/red. Trend.
Time spent on toil vs project work    — per team. Trend.
On-call health (pages/week, after-hours %) — per rotation. Trend.
Postmortem action item completion %   — org. Quarterly.
Incidents by severity                 — count, MTTR, MTTD.
Change failure rate                   — % of deploys triggering rollback.
Cost per request (or chosen unit)     — per service. Trend.
```

লক্ষ্য করুন কী নেই: কোনো "uptime %" নেই। ওটা একটা vanity metric। SLO attainment ভালোটা — এটা team যে _user-relevant_ reliability-তে committed হয়েছে সেটা ধরে।

## Hiring আর team composition

একটা balanced SRE team-এ প্রায়:

```
- 1 senior IC who could be staff
- 2-3 mid-IC who carry day-to-day work
- 1-2 junior IC growing into the role
- 1 manager (player-coach in small teams; pure manager past ~6 reports)
```

যে hiring filter আসলে success predict করে:

```
- Has run a real on-call rotation (not just "I was on a team that did").
- Can explain a system at multiple altitudes (data flow, single component, single line).
- Reads Jepsen reports for fun. Or Brendan Gregg. Or Tanya Reilly.
- Has written a postmortem you can read.
- Has automated themselves out of a job at least once.
```

classic hiring ফাঁদ: "DevOps" engineer hire করা যারা আসলে CI/CD engineer, তারপর তাদের কাছ থেকে production reliability আশা করা। ওগুলো ভিন্ন skill। আপনি আসলে কী পূরণ করছেন সে ব্যাপারে নিজের সাথে সৎ থাকুন।

## Common org pitfall

1. **কোনো charter নেই, কোনো scope discipline নেই।** SRE সবকিছু operational শুষে নেয়; কিছুতেই deliver করতে পারে না।
2. **কোনো production readiness gate নেই।** খারাপ service SRE pager-এ পড়ে; SRE burn out হয়।
3. **ছোট on-call rotation।** 3-জনের rotation প্রতি quarter-এ একজনকে ভাঙে।
4. **action item follow-through ছাড়া postmortem।** একই incident পরের বছর।
5. **কোনো senior IC ladder নেই।** Senior SRE-রা চলে যায়।
6. **যে engineer rollback করল তাকে শাস্তি দেওয়া।** তারা গল্পের নায়ক।
7. **SRE শুধু engineering-এ report করা।** product/leadership exposure ছাড়া, কোনো leverage নেই।
8. **Toil cap enforce না করা।** Team ধীরে ধীরে ops হয়ে যায়।

## একটা বাস্তব org transformation — একটা উদাহরণ

একটা mid-sized SaaS থেকে একটা বাস্তব pattern, anonymized:

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

"good"-এ পৌঁছতে তিন বছর। technology কঠিন ছিল বলে নয় — কারণ culture আর structure land হতে ওই সময়টা লাগল।

## আপডেটেড থাকুন

- [Will Larson — StaffEng](https://staffeng.com/) আর [Irrational Exuberance](https://lethain.com/) — eng org structure
- [Charity Majors — charity.wtf](https://charity.wtf/) — আধুনিক ops culture-এর লেখা
- [Lara Hogan — wherewithall.com](https://larahogan.me/) — engineering management
- [Google re:Work](https://rework.withgoogle.com/) — team effectiveness research (psych safety, ইত্যাদি)

## মূল শিক্ষা

1. **আপনার stage-এর সাথে মেলে এমন একটা SRE org আকার বাছুন; বছরে একবার revisit করুন।**
2. **একটা লিখিত charter হলো floor — একটা ছাড়া, scope creep team ধ্বংস করে।**
3. **Production Readiness Review হলো সবচেয়ে বেশি-leverage-এর gate** — এই কারণেই product team উন্নত হয়।
4. **On-call sustainability হলো দীর্ঘমেয়াদী constraint** — rotation size আর after-hours load রক্ষা করুন।
5. **Postmortem blame-aware, blameless নয়** — system-এর নাম করুন, ব্যক্তির নয়; action item track করুন।
6. **Staff+ SRE work হলো org-wide program**, heroic incident response নয়।
7. **SRE-র জন্য career ladder গুরুত্বপূর্ণ** — এগুলো ছাড়া, আপনার senior-রা SWE-র জন্য চলে যায়।
