---
title: 'Runbooks & Incident Response'
subtitle: 'মানুষ আসলেই ব্যবহার করবে এমন runbook লেখা, incident commander প্যাটার্ন, আর সত্যিকারের পরিবর্তন আনে এমন post-mortem।'
chapter: 5
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['runbooks', 'incident response', 'post-mortem', 'on-call', 'communication']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

শহরের ফায়ার ব্রিগেডে ফাতিমা আল-ফিহরি ঢোকার প্রথম দিনই একটা কথা শিখেছিলেন — আগুন লাগলে এখানে কেউ মাথা খাটিয়ে নতুন কিছু বানায় না। প্রতিটা ধরনের আগুনের জন্য আগে থেকে লেখা, বহুবার মহড়া দেওয়া একটা ড্রিল-বুক আছে। রাসায়নিক গুদামে আগুন লাগলে বইয়ের পাতায় লেখা থাকে — "আগে ভাল্ব A বন্ধ করো, তারপর তিন তলা খালি করো, তারপর ফোম লাইন খোলো"। কেউ ঘটনাস্থলে দাঁড়িয়ে ভাবে না পরের ধাপ কী; পাতা উল্টে ঠিক পরের ধাপে চলে যায়।

আর প্রতিটা ডাকে একজনই কমান্ডার থাকে — সেদিন ছিলেন ইবনে সিনা। তিনি নিজে হোস ধরেন না; তিনি শুধু নির্দেশ দেন কে কোথায় যাবে, কে ভেতরে ঢুকবে, কখন পিছু হটবে। আরেকজনের কাজ শুধু যোগাযোগ — বাইরের কন্ট্রোল রুম আর আশপাশের ভবনে খবর পৌঁছে দেওয়া, যাতে কমান্ডার আর দলকে বারবার ফোন ধরতে না হয়। এভাবেই রাত ৩টায় ক্লান্ত একটা দলও হুড়োহুড়ি না করে ঠান্ডা মাথায় কাজটা করে ফেলে, কারণ কী করতে হবে তা আগেই লেখা আর অনুশীলন করা আছে।

এই গল্পটাই আসলে **runbook আর incident response**। প্রতিটা আগুনের জন্য আলাদা লেখা ড্রিল-বুক হলো একটা নির্দিষ্ট incident-এর জন্য লেখা **runbook** — ঠিক ধাপ, ঠিক ক্রমে। একজন কমান্ডার সবাইকে দিক দেখাচ্ছেন আর একজন শুধু যোগাযোগ সামলাচ্ছেন — এটাই ঠিকঠাক **incident-response রোল**: incident commander আর communicator। আর মহড়া দেওয়া প্ল্যান মেনে চলা, তাৎক্ষণিক improvisation না করা — এটাই একটা শান্ত, structured incident response। বাস্তবেও তাই: on-call ইঞ্জিনিয়ার চাপের মুহূর্তে নতুন সমাধান আবিষ্কার করে না, লেখা ও drilled runbook খুলে ঠান্ডা মাথায় ধাপে ধাপে এগোয়।

<Callout type="info">

**বাস্তব উদাহরণ**

একটা ER triage protocol: এটা এমন ডাক্তারদের জন্য গাইড নয় যাদের ভাবার সময় আছে — এটা প্রথম পাঁচ মিনিটের জন্য তাৎক্ষণিক, নির্দিষ্ট কিছু action-এর ধারাবাহিকতা, যখন কাউকে critical অবস্থায় আনা হয়। ভালো runbook একই: রাত ৩টায় চাপে থাকা একজন ইঞ্জিনিয়ারের জন্য লেখা যার action নিতে হবে, ভাবতে নয়।

</Callout>

## একটা Runbook-কে কী Usable করে

বেশিরভাগ runbook ফেল করে ভুল বলে নয়, বরং incident-এর সময় আসলে কাজে আসে না বলে:

**অকেজো runbook:**

> "ডেটাবেস unavailable হলে, DR প্রসিডিওর অনুযায়ী সার্ভিস restore করুন আর stakeholder-দের জানান।"

**কাজের runbook:**

````markdown
# Database Unavailable Runbook

**Trigger:** PagerDuty alert "database-primary-down" fires
**Owner:** Database on-call
**Last tested:** 2024-01-15

## First 5 minutes: triage

1. Verify the alert is real (not a flapping monitor):
   ```bash
   psql $DATABASE_URL -c "SELECT 1" 2>&1
   ```
````

এটা ফেরত দিলে: "connection refused" → primary down, চালিয়ে যান
এটা ডেটা ফেরত দিলে → false alarm, acknowledge করে বন্ধ করুন

2. replica available কি না চেক করুন:

   ```bash
   psql $REPLICA_DATABASE_URL -c "SELECT 1" 2>&1
   ```

   হ্যাঁ → Section A-তে যান (replica-তে failover)
   না → Section B-তে যান (ব্যাকআপ থেকে restore)

3. incident খুলুন:
   - PagerDuty: ৫ মিনিটে সাড়া না পেলে secondary-তে escalate করুন
   - Slack: #incidents-এ পোস্ট করুন "Database outage in progress, investigating"
   - Status page: "Investigating"-এ সেট করুন

````

Good runbooks are **imperative** (do this, then this), **specific** (exact commands, not descriptions), and **decision-tree shaped** (if X, do Y; if Z, do W).

## Runbook Structure

```markdown
# [Service Name] [Failure Mode] Runbook

**Severity:** P1 / P2 / P3
**RTO target:** 60 minutes
**Owner:** [Team or rotation]
**Last tested:** [Date] by [Person] — actual RTO: [N] minutes
**Escalation:** If no progress in 30 min, page [name]

## Symptoms
- Alert name and what it means
- What users experience

## Pre-requisites
- Access required (AWS account, SSH keys, kubectl context)
- Tools needed and where to find them

## Diagnostic steps (first 10 minutes)
[Numbered steps with exact commands]

## Resolution paths
### Path A: [Common case]
[Steps]

### Path B: [Alternative]
[Steps]

## Verification
[How to confirm the system is recovered]
[Specific checks to run before declaring resolved]

## Communication templates
**Initial:** "We are investigating [issue]. Updates every 15 minutes."
**Update:** "Root cause identified as [X]. Expected resolution at [time]."
**Resolution:** "Issue resolved at [time]. [N] minutes of impact. Post-mortem to follow."

## Post-incident
- [ ] Update status page to resolved
- [ ] Post timeline in #incidents
- [ ] Open post-mortem within 48 hours
- [ ] Update this runbook if any steps were wrong
````

## Incident Role

স্পষ্ট রোল "too many cooks" সমস্যা ঠেকায়, যেখানে সবাই action নিচ্ছে আর কেউ coordinate করছে না।

**Incident Commander (IC):**

- incident timeline আর সিদ্ধান্তের মালিক
- investigation task delegate করে, নিজে করে না
- বাইরের communication ম্যানেজ করে
- resolve হলে "all clear" ডাকে
- একজন মানুষ — দুজন IC থাকলে, একজনও নেই

**Technical Lead:**

- investigation আর resolution চালায়
- IC-কে findings রিপোর্ট করে
- ownership না হারিয়ে সাহায্য চাইতে পারে

**Communicator:**

- status page, Slack, customer communication আপডেট করে
- technical lead-দের comms-এ context-switch করা থেকে মুক্ত রাখে

**Scribe:**

- রিয়েল টাইমে timeline ডকুমেন্ট করে (timestamp, কী চেষ্টা করা হলো, কী পাওয়া গেল)
- post-mortem-এর জন্য অমূল্য — চাপের মধ্যে স্মৃতি দ্রুত ফিকে হয়

```
[10:02] IC: @alice you're technical lead. @bob you're communicator.
[10:03] alice: checking replication lag
[10:04] alice: primary is up, replica is 47 minutes behind — something's wrong with WAL sender
[10:05] IC: @bob update status page: "Investigating elevated database latency"
[10:06] alice: found it — WAL sender process crashed. restarting.
[10:08] alice: lag recovering — now 35 minutes behind
[10:15] alice: lag at 2 minutes, system recovering normally
[10:22] alice: lag at 10 seconds, application latency back to baseline
[10:25] IC: declaring resolved. @bob update status page. opening post-mortem.
```

## Communication Cadence

incident-এর সময় নীরবতাই সবচেয়ে খারাপ জিনিস। নতুন কিছু না থাকলেও stakeholder-দের আপডেট দিন:

```
T+0:   Acknowledge the incident publicly ("We are aware and investigating")
T+15:  Update with what you know ("Root cause identified as X, working on fix")
T+30:  Update or ETA ("Expected resolution by T+45")
T+45:  Update ("Fix deployed, monitoring recovery")
T+60:  Resolution or escalation ("Resolved" or "Escalating, bringing in [team]")
```

নতুন কিছু না থাকলে: "আমরা এখনো তদন্ত করছি, ১৫ মিনিটে আপডেট।" একটা P1-এর সময় ১৫ মিনিটের বেশি কখনো নীরব থাকবেন না।

## Post-Mortem

একটা blameless post-mortem systemic কারণ খোঁজে, ব্যক্তিগত দোষ নয়। লক্ষ্য শেখা, শাস্তি নয়।

**৪৮ ঘণ্টার মধ্যে লিখুন — এক সপ্তাহ পরে নয়।**

```markdown
# Post-Mortem: Database WAL Sender Crash — 2024-01-22

**Severity:** P1 (database latency > 30 seconds for 23 minutes)
**Duration:** 10:02 – 10:25 (23 minutes)
**Impact:** ~1,200 users experienced slow or failed requests
**Authors:** @alice, @bob

## Summary

The WAL sender process on the primary database crashed due to a memory
allocation failure, causing replication lag to build to 47 minutes before
detection. Recovery involved manually restarting the WAL sender process.

## Timeline

| Time  | Event                                   |
| ----- | --------------------------------------- |
| 09:55 | WAL sender process crashes (undetected) |
| 09:55 | Replication lag begins growing          |
| 10:02 | Alert fires: "replica lag > 5 minutes"  |
| 10:02 | On-call @alice paged                    |
| 10:04 | alice identifies crashed WAL sender     |
| 10:06 | WAL sender restarted                    |
| 10:25 | Lag recovered, p99 latency baseline     |

## Root cause

Memory allocation failure in WAL sender caused by OOM condition on primary
database server. The primary was at 94% memory utilization; a spike in
analytical queries pushed it over the limit and the kernel OOM-killed
the WAL sender process.

## Contributing factors

1. No alert for WAL sender process health (only lag was monitored)
2. Analytical queries running on primary (should be on replica)
3. Memory utilization not alerting until 95% (too late)

## What went well

- Runbook covered this exact scenario with correct commands
- IC/technical lead separation worked — no coordination confusion
- Status page updated promptly

## What didn't go well

- 7-minute gap between crash (09:55) and alert (10:02)
- Replica at 47 minutes of lag — much worse RPO than our 15-minute target
- Communicator didn't have status page access initially (3-minute delay)

## Action items

| Action                                               | Owner  | Due    |
| ---------------------------------------------------- | ------ | ------ |
| Alert on WAL sender process count (should be > 0)    | @alice | Jan 29 |
| Move analytical queries to read replica              | @carol | Feb 5  |
| Lower memory alert threshold to 80%                  | @alice | Jan 25 |
| Add status page access for all on-call engineers     | @bob   | Jan 24 |
| Update runbook with memory pressure diagnostic steps | @alice | Jan 29 |
```

## Post-Mortem থেকে পরিবর্তন আনানো

Post-mortem action item তৈরি করে। action item ভুলে যাওয়া হয়। loop-টা বন্ধ করুন:

```
1. Track action items in your project management tool (not just the doc)
2. Assign owners — "team" is not an owner
3. Set specific due dates — "soon" is not a date
4. Review in weekly engineering meeting until all items closed
5. Verify the fix: re-run the drill that exposed the gap
```

যে post-mortem-এ কিছুই বদলায় না সেটা এমন একটা failure-এর ডকুমেন্টেশন যা আবার ঘটবে।

## On-Call Health

ভালো incident response-এর জন্য স্বাস্থ্যকর on-call প্র্যাকটিস দরকার:

```
□ Alert fatigue audit: count pages per week per person
  More than 2-3 pages/week/person = too much noise
□ Runbooks updated within 48 hours of every incident
□ No silent pages — every alert has a runbook
□ On-call rotation covers at least 3 people (no single hero)
□ Post-mortems have specific owners, not "the team"
□ DR drills scheduled on calendar, not just intended
□ On-call engineers compensated fairly (time off, extra pay, or both)
```

On-call থেকে burnout একটা engineering effectiveness সমস্যা। একজন ক্লান্ত ইঞ্জিনিয়ারের হ্যান্ডল করা প্রতিটা incident বেশি সময় নেয়, কম ভালোভাবে resolve হয়, আর খারাপ post-mortem তৈরি করে।
