---
title: '12-Month Mastery Roadmap — Junior SRE → Senior/Staff'
subtitle: 'The year-long plan that picks up where the 8-week roadmap stops. Monthly milestones, real production projects, deep reading, and the artifacts that prove staff-level capability.'
chapter: 20
level: 'mastery'
readingTime: '30 min'
topics: ['roadmap', 'career', 'mastery', 'staff SRE', 'year plan', 'depth']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A map of the mountain range, not just the summit — mastery is knowing which paths connect, not just reaching one peak.

</Callout>

## Where this picks up

The 8-week roadmap (chapter 0) made you a junior SRE candidate: you can build, deploy, and observe a service, define an SLO, and run a basic incident.

This roadmap takes you from there to **senior IC, plausible Staff candidate** in twelve months. The shape is different: longer projects, real production exposure, deeper reading, and artifacts (writeups, talks, OSS contributions) that prove the level externally.

```
Year structure
  Months 1-3   — Depth in the four core disciplines
  Months 4-6   — Cross-cutting + on-call mastery
  Months 7-9   — Staff-shaped work (programs, design, mentoring)
  Months 10-12 — Capstone: a public, defensible artifact
```

You should already be in or pursuing an SRE-adjacent role for this to work. Theory without production exposure plateaus around month 4.

<Callout type="info">

**Pacing**

The 8-week plan was 15-18 hrs/week of self-study. This one assumes you have an SRE day job (~40 hrs/week of real production work) plus 5-8 hrs/week of deliberate study. Most of the learning happens at work; the 8 hrs/week guides which problems to tackle and which papers to read.

</Callout>

## Months 1-2 — Linux performance + observability mastery

### Reading

- _Systems Performance_ (Brendan Gregg, 2nd ed) — chapters 1-9 deeply.
- _BPF Performance Tools_ (Brendan Gregg) — at least a thorough skim, chapters 1-6 deep.
- _Observability Engineering_ (Charity Majors et al) — re-read with production lens.

### Skill targets

- Run the 60-second performance triage from memory (chapter 12 here).
- Generate on-CPU and off-CPU flame graphs for at least three services in your prod fleet.
- Write five `bpftrace` one-liners that solved a real production question.

### Production project

Pick the slowest-tail-latency service in your fleet that you have access to. Investigate p99 with kernel tools. Find the root cause (lock contention, GC, slow disk, network retransmits — find which). Write a postmortem-style writeup of the investigation and the fix.

### Artifact

Publish the writeup internally. Aim for the kind of doc that makes another team go "wait, are we doing that too?" — that is the senior signal.

---

## Month 3 — Network engineering depth

### Reading

- _High Performance Browser Networking_ (Ilya Grigorik, free online) — refresh.
- _TCP/IP Illustrated, Vol 1_ (Stevens) — chapters 17-25 (TCP) deep.
- BGP RFC 4271 (skim, but learn the AS-PATH attribute well).
- 2 Cloudflare engineering blog posts on their L4 LB or network architecture.

### Skill targets

- Read `ss -ti`, `tcpdump`, and `mtr` output and tell a story from each.
- Decrypt a TLS capture in Wireshark using SSLKEYLOGFILE.
- Explain anycast + ECMP at a whiteboard with no notes.

### Production project

Audit cross-AZ data transfer in your largest workload. Find at least one architectural change that cuts it (topology-aware routing, gateway endpoint, regional proximity). Quantify the cost savings.

### Artifact

Internal RFC for the change. Reviewed by the cost owner _and_ a senior network engineer.

---

## Month 4 — Database internals depth

### Reading

- _Database Internals_ (Alex Petrov) — chapters on storage engines, replication, transactions.
- _Designing Data-Intensive Applications_ (Kleppmann) — re-read chapters 5-9 with operator's lens.
- One Postgres or MySQL deep-dive: _PostgreSQL 14 Internals_ (Egor Rogov) is excellent.

### Skill targets

- Read an `EXPLAIN ANALYZE` and predict the plan-flip risk.
- Understand and write a CONCURRENT migration for a 100M-row table.
- Detect a long-running transaction within 60 seconds using `pg_stat_activity`.

### Production project

Take the most-used SQL query in your largest service. Profile it. Add the right index (or remove the wrong one). Measure the impact. Bonus: identify a query whose plan is one statistics update away from disaster, and pin it.

### Artifact

A "DB health" dashboard for one of your services with: top queries by total time, replication lag, connection-pool saturation, vacuum activity, table bloat. Wire alerts on the high-leverage ones.

---

## Month 5 — Distributed systems theory and the papers

### Reading (the real reading list)

- "Time, Clocks, and the Ordering of Events" — Lamport, 1978.
- "The Part-Time Parliament" or "Paxos Made Simple" — Lamport.
- "In Search of an Understandable Consensus Algorithm" — Raft, Ongaro 2014.
- "Spanner: Google's Globally Distributed Database" — OSDI 2012.
- "Dynamo: Amazon's Highly Available Key-Value Store" — SOSP 2007.
- 2-3 Jepsen reports of databases you operate.

### Skill targets

- Explain Raft to another engineer at a whiteboard with no notes.
- For each system you operate, name CAP/PACELC stance and the consistency model.
- Identify a distributed lock in your codebase that doesn't use fencing tokens.

### Production project

Find a piece of "exactly-once" behavior in your system. Audit whether it's actually idempotent end-to-end. Fix at least one place where it isn't. Prove the fix with a chaos test.

### Artifact

Brown-bag talk at your team or guild on Raft or on the consistency model of one system you operate. Recorded if possible.

---

## Month 6 — On-call mastery + incident command

### Reading

- _Incident Management for Operations_ (Schnepp et al) — a short, dense book.
- _The Field Guide to Understanding Human Error_ (Sidney Dekker) — for postmortem maturity.
- 6 public postmortems from companies bigger than yours (Cloudflare, Stripe, GitHub, AWS).

### Skill targets

- Comfortable as Incident Commander for a Sev-2 with 5+ engineers in the channel.
- Can run an effective postmortem meeting with 10+ attendees.
- Know your rotation's page volume and after-hours percentage by heart.

### Production project

Run a tabletop incident exercise with your team. Pick a realistic scenario from the postmortems you've read; brief the team; play out the incident; debrief on what worked. Repeat quarterly.

### Artifact

Either: write your team's "incident response playbook" if it doesn't exist, OR publish an internal critique of the existing one with proposed changes.

---

## Month 7 — Kubernetes/platform deep dive

### Reading

- _Kubernetes Up & Running_ (3rd ed) — re-read chapters 8+ with operator's lens.
- _Programming Kubernetes_ (Hausenblas, Schimanski) — informers, controllers, CRDs.
- The Kubernetes scheduler design doc.
- Etcd operations docs end to end.

### Skill targets

- Operate (or shadow ops on) a 500+ node cluster.
- Diagnose an apiserver or etcd performance issue using metrics, not guesses.
- Write a small custom controller using controller-runtime.

### Production project

Either:
(a) Lead an etcd tuning / defrag / upgrade exercise on a real cluster.
(b) Write a small operator or admission webhook that solves a real org pain.
(c) Migrate a workload off an opaque managed runtime onto K8s with full observability.

### Artifact

Talk or writeup on the project, with metrics before/after.

---

## Month 8 — Observability program (org-level, not service-level)

### Reading

- _Observability Engineering_ (Majors et al) — chapters 7+ on org adoption.
- OpenTelemetry spec (the parts you actually use).
- Cardinality, exemplars, and the cost-of-observability papers from Honeycomb/Grafana blogs.

### Skill targets

- Define the SLI taxonomy used by 3+ teams in your org consistently.
- Build a "service-level golden signals" template that any team can adopt in a day.
- Cap observability spend with cardinality budgets — and justify the cap.

### Production project

Standardize SLOs across at least 5 services. Roll up to a team-level dashboard. Brief leadership on the rollup quarterly.

### Artifact

A "how SLOs work here" doc that becomes the company's reference. Plus the standardized dashboards.

---

## Month 9 — Cost engineering / FinOps program

### Reading

- _Cloud FinOps_ (J.R. Storment, Mike Fuller).
- AWS Well-Architected Framework — Cost Optimization pillar.
- Vantage / Cast.AI engineering blog posts on real customer optimizations.

### Skill targets

- Compute cost-per-request for at least 3 services.
- Recommend (and quantify) an instance-type or commitment optimization that saves > $50k/year.
- Run a quarterly cost review with engineering leadership.

### Production project

Build a per-team cost allocation dashboard. Drive at least one optimization to completion (rightsizing, Graviton migration, NAT-to-VPC-endpoint, lifecycle policies).

### Artifact

The dashboard, plus a writeup of the optimization with dollar impact.

---

## Months 10-12 — Capstone

The 8-week roadmap ended with a personal capstone (a service you built and operated). The 12-month mastery capstone is shaped differently: it's an org-level program with a public artifact.

### Pick one capstone

**Option A — Resilience program.**
Lead the org's "what would survive a region failure?" assessment. Produce a multi-page report: services audited, gaps found, prioritized fix list, capital investment ask. Run a real region-failover drill on at least one service.

**Option B — Reliability platform.**
Build (or significantly contribute to) the org's golden-path platform: SLO-as-code, on-call-as-code, deploy template, observability template. Demonstrate adoption by 3+ teams.

**Option C — Public technical artifact.**
A long-form blog post, conference talk, or open-source contribution that crystallizes a deep technical lesson from the year. The bar: another senior SRE in the world reads it and learns something.

**Option D — Mentorship program.**
Take 2-3 junior engineers from "knows the basics" to "can run an incident solo" over the three months. Document the program so it can be repeated.

### What the capstone proves

A staff-track SRE doesn't get there by being the best individual debugger. They get there by _making other people more reliable_ — through programs, platforms, mentoring, or external knowledge transfer. The capstone is your proof you can do that.

### Artifact

External: a blog post, talk, OSS PR list, conference proposal accepted.
Internal: a doc that lives on past you. The kind of doc the next person who joins the team gets pointed at.

---

## Throughout the year — habits that compound

### Weekly

- Read one engineering blog post or postmortem deeply (Cloudflare, Stripe, GitHub, AWS, Honeycomb, Linkedin Eng all publish gold).
- Skim Hacker News + lobste.rs for what your peers are reading.
- Spend 30 minutes on your runbooks/postmortems — improve one of them.

### Monthly

- One paper reading session. One technical book chapter session.
- A retro on what the month's incidents taught you.
- A 1:1 with someone senior in another org for perspective.

### Quarterly

- DR drill on a real service.
- On-call health retro for your rotation.
- Update your "what I'd improve if I were Staff today" list.

### Yearly

- Re-read the SRE Book + SRE Workbook. Yes, again. You'll see new things.
- Submit at least one conference talk proposal.
- Take real vacation. Burned-out SREs make terrible long-term ICs.

---

## Where to plug into the community

Senior IC growth requires external pressure. The communities that push you:

- **SREcon** (USENIX) — the conference. If you can attend or watch the talks, do.
- **CNCF events** — KubeCon, Linkerd Summit, etc.
- **Local SRE meetups** — variable quality, but you'll meet your peers.
- **Discord/Slack communities**: SRE Discord, Kubernetes Slack, Honeycomb Pollinators.
- **Twitter/Mastodon/Bluesky**: follow Charity Majors, Brendan Gregg, Tanya Reilly, Will Larson, Aphyr (Jepsen), Kelsey Hightower, Lorin Hochstein.
- **Open-source contributions** — Prometheus, OpenTelemetry, Cilium, Kubernetes itself. Even small docs PRs build context.

The pattern: you go from consumer of SRE knowledge to producer. By month 12 you should be the source someone else is reading.

---

## Anti-patterns to avoid in this year

1. **Reading without building.** Theory rots without production application.
2. **Building without reading.** You'll re-derive everything — slowly.
3. **Optimizing for ticket count.** Closing 200 routine tickets in a year proves nothing.
4. **Avoiding the on-call rotation to "focus on projects."** You learn most from the pager.
5. **Going solo.** Mentors + study buddies are a 2-3x multiplier on growth.
6. **Burnout.** A year of 80% deliberate effort beats 6 months of 120%.

---

## What "mastery" actually means at month 12

Honest framing — what should be true if the year went well:

- You can debug a production outage at any layer — kernel, network, database, app — without escalation in most cases.
- You can design a new service end-to-end (SLOs, capacity, observability, on-call) and defend the design in review.
- You can run an incident as IC for any severity, with any team.
- You've shipped at least one cross-cutting program that other teams use.
- You have an opinion on every chapter of the SRE Workbook — and can defend it.
- Your name is the one people put on a doc when they want it read seriously.

You are not "done." The next 5-10 years are about depth in 1-2 areas (DBs, networking, distributed-systems design, SRE leadership) and the breadth to coordinate across the whole stack. But you are now operating at senior, plausibly Staff, level. The career path opens up here.

## Stay current

- [USENIX SREcon](https://www.usenix.org/srecon) — yearly state-of-the-practice talks
- [Google SRE books](https://sre.google/books/) — reread these every 18 months; you notice new things
- [Papers We Love](https://paperswelove.org/) — keep one paper in flight at all times
- [CNCF TOC radar](https://github.com/cncf/toc) — what's graduating, what's deprecating

## Key Takeaways

1. **The year is paced for someone in a real SRE role** — production exposure is the foundation.
2. **Each month has a depth target + production project + artifact** — reading alone doesn't move the needle.
3. **Months 7-9 are the staff-shaped pivot** — programs, platforms, mentoring.
4. **The capstone proves leverage** — making other people more reliable, not just being the best debugger.
5. **External community pressure** is what turns competent IC into senior IC.
6. **Sustainable pace beats heroics** — 5-8 hours of deliberate study per week, every week, for 52 weeks.
