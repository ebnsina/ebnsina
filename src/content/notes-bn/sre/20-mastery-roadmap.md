---
title: '12-মাসের Mastery Roadmap — Junior SRE → Senior/Staff'
subtitle: 'যে year-long plan 8-week roadmap যেখানে থামে সেখান থেকে তুলে নেয়। Monthly milestone, বাস্তব production project, deep reading, আর যে artifact staff-level capability প্রমাণ করে।'
chapter: 20
level: 'mastery'
readingTime: '30 মিনিট'
topics: ['roadmap', 'career', 'mastery', 'staff SRE', 'year plan', 'depth']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

শুধু চূড়া নয়, পুরো পর্বতমালার একটা মানচিত্র — mastery হলো কোন পথগুলো সংযুক্ত সেটা জানা, শুধু একটা চূড়ায় পৌঁছানো নয়।

</Callout>

## এটা যেখান থেকে তুলে নেয়

8-week roadmap (chapter 0) আপনাকে একজন junior SRE candidate বানিয়েছে: আপনি একটা service build, deploy আর observe করতে পারেন, একটা SLO define করতে পারেন, আর একটা basic incident চালাতে পারেন।

এই roadmap আপনাকে সেখান থেকে বারো মাসে **senior IC, plausible Staff candidate**-এ নেয়। আকারটা ভিন্ন: দীর্ঘ project, বাস্তব production exposure, deeper reading, আর যে artifact (writeup, talk, OSS contribution) level-টা বাহ্যিকভাবে প্রমাণ করে।

```
Year structure
  Months 1-3   — Depth in the four core disciplines
  Months 4-6   — Cross-cutting + on-call mastery
  Months 7-9   — Staff-shaped work (programs, design, mentoring)
  Months 10-12 — Capstone: a public, defensible artifact
```

এটা কাজ করতে হলে আপনার ইতিমধ্যে একটা SRE-adjacent role-এ থাকা বা সেটা pursue করা উচিত। production exposure ছাড়া theory month 4-এর কাছাকাছি plateau করে।

<Callout type="info">

**Pacing**

8-week plan ছিল সপ্তাহে 15-18 ঘণ্টার self-study। এটা ধরে নেয় আপনার একটা SRE day job আছে (~40 hrs/week বাস্তব production work) plus সপ্তাহে 5-8 ঘণ্টা deliberate study। বেশিরভাগ শেখা কাজে ঘটে; সপ্তাহে 8 ঘণ্টা guide করে কোন সমস্যা ধরবেন আর কোন paper পড়বেন।

</Callout>

## Months 1-2 — Linux performance + observability mastery

### Reading

- _Systems Performance_ (Brendan Gregg, 2nd ed) — chapter 1-9 গভীরভাবে।
- _BPF Performance Tools_ (Brendan Gregg) — অন্তত একটা thorough skim, chapter 1-6 deep।
- _Observability Engineering_ (Charity Majors et al) — production lens দিয়ে re-read।

### Skill targets

- মেমরি থেকে 60-second performance triage চালান (এখানে chapter 12)।
- আপনার prod fleet-এর অন্তত তিনটা service-এর জন্য on-CPU আর off-CPU flame graph generate করুন।
- পাঁচটা `bpftrace` one-liner লিখুন যা একটা বাস্তব production প্রশ্ন সমাধান করেছে।

### Production project

আপনার fleet-এ যে slowest-tail-latency service-এ আপনার access আছে সেটা বাছুন। kernel tool দিয়ে p99 তদন্ত করুন। root cause খুঁজুন (lock contention, GC, slow disk, network retransmit — কোনটা তা বের করুন)। তদন্ত আর fix-এর একটা postmortem-style writeup লিখুন।

### Artifact

writeup-টা internally publish করুন। এমন একটা doc-এর লক্ষ্য রাখুন যা আরেকটা team-কে বলায় "দাঁড়াও, আমরাও কি এটা করছি?" — সেটাই senior signal।

---

## Month 3 — Network engineering depth

### Reading

- _High Performance Browser Networking_ (Ilya Grigorik, free online) — refresh।
- _TCP/IP Illustrated, Vol 1_ (Stevens) — chapter 17-25 (TCP) deep।
- BGP RFC 4271 (skim, কিন্তু AS-PATH attribute ভালোভাবে শিখুন)।
- Cloudflare-এর L4 LB বা network architecture নিয়ে 2টা engineering blog post।

### Skill targets

- `ss -ti`, `tcpdump`, আর `mtr`-এর output পড়ুন আর প্রতিটা থেকে একটা গল্প বলুন।
- SSLKEYLOGFILE ব্যবহার করে Wireshark-এ একটা TLS capture decrypt করুন।
- কোনো note ছাড়া whiteboard-এ anycast + ECMP ব্যাখ্যা করুন।

### Production project

আপনার largest workload-এ cross-AZ data transfer audit করুন। অন্তত একটা architectural change খুঁজুন যা এটা কমায় (topology-aware routing, gateway endpoint, regional proximity)। cost saving quantify করুন।

### Artifact

change-এর জন্য Internal RFC। cost owner _আর_ একজন senior network engineer দ্বারা reviewed।

---

## Month 4 — Database internals depth

### Reading

- _Database Internals_ (Alex Petrov) — storage engine, replication, transaction-এর chapter।
- _Designing Data-Intensive Applications_ (Kleppmann) — operator-এর lens দিয়ে chapter 5-9 re-read।
- একটা Postgres বা MySQL deep-dive: _PostgreSQL 14 Internals_ (Egor Rogov) চমৎকার।

### Skill targets

- একটা `EXPLAIN ANALYZE` পড়ুন আর plan-flip risk predict করুন।
- একটা 100M-row table-এর জন্য একটা CONCURRENT migration বুঝুন আর লিখুন।
- `pg_stat_activity` ব্যবহার করে 60 second-এর মধ্যে একটা long-running transaction detect করুন।

### Production project

আপনার largest service-এর most-used SQL query নিন। Profile করুন। সঠিক index যোগ করুন (বা ভুলটা সরান)। impact measure করুন। Bonus: এমন একটা query চিহ্নিত করুন যার plan একটা statistics update দূরত্বে disaster থেকে, আর সেটা pin করুন।

### Artifact

আপনার একটা service-এর জন্য একটা "DB health" dashboard যেখানে: total time অনুযায়ী top query, replication lag, connection-pool saturation, vacuum activity, table bloat। high-leverage-গুলোতে alert wire করুন।

---

## Month 5 — Distributed systems theory আর paper-গুলো

### Reading (আসল reading list)

- "Time, Clocks, and the Ordering of Events" — Lamport, 1978।
- "The Part-Time Parliament" বা "Paxos Made Simple" — Lamport।
- "In Search of an Understandable Consensus Algorithm" — Raft, Ongaro 2014।
- "Spanner: Google's Globally Distributed Database" — OSDI 2012।
- "Dynamo: Amazon's Highly Available Key-Value Store" — SOSP 2007।
- আপনি যে database operate করেন সেগুলোর 2-3টা Jepsen report।

### Skill targets

- কোনো note ছাড়া whiteboard-এ আরেকজন engineer-কে Raft ব্যাখ্যা করুন।
- আপনি operate করা প্রতিটা system-এর জন্য CAP/PACELC stance আর consistency model নাম করুন।
- আপনার codebase-এ একটা distributed lock চিহ্নিত করুন যা fencing token ব্যবহার করে না।

### Production project

আপনার system-এ একটা "exactly-once" behavior খুঁজুন। এটা end-to-end আসলে idempotent কিনা audit করুন। অন্তত একটা জায়গা fix করুন যেখানে এটা নয়। একটা chaos test দিয়ে fix প্রমাণ করুন।

### Artifact

Raft নিয়ে বা আপনি operate করা একটা system-এর consistency model নিয়ে আপনার team বা guild-এ একটা brown-bag talk। সম্ভব হলে recorded।

---

## Month 6 — On-call mastery + incident command

### Reading

- _Incident Management for Operations_ (Schnepp et al) — একটা short, dense বই।
- _The Field Guide to Understanding Human Error_ (Sidney Dekker) — postmortem maturity-র জন্য।
- আপনার চেয়ে বড় company-র (Cloudflare, Stripe, GitHub, AWS) 6টা public postmortem।

### Skill targets

- channel-এ 5+ engineer সহ একটা Sev-2-র জন্য Incident Commander হিসেবে comfortable।
- 10+ attendee সহ একটা effective postmortem meeting চালাতে পারা।
- আপনার rotation-এর page volume আর after-hours percentage মুখস্থ জানা।

### Production project

আপনার team-এর সাথে একটা tabletop incident exercise চালান। আপনার পড়া postmortem থেকে একটা realistic scenario বাছুন; team-কে brief করুন; incident-টা play out করুন; কী কাজ করল তা নিয়ে debrief করুন। quarterly পুনরাবৃত্তি করুন।

### Artifact

হয়: আপনার team-এর "incident response playbook" লিখুন যদি এটা না থাকে, নয়তো: বিদ্যমানটার একটা internal critique proposed change সহ publish করুন।

---

## Month 7 — Kubernetes/platform deep dive

### Reading

- _Kubernetes Up & Running_ (3rd ed) — operator-এর lens দিয়ে chapter 8+ re-read।
- _Programming Kubernetes_ (Hausenblas, Schimanski) — informer, controller, CRD।
- Kubernetes scheduler design doc।
- Etcd operations docs end to end।

### Skill targets

- একটা 500+ node cluster operate করুন (বা ops shadow করুন)।
- অনুমান নয়, metric ব্যবহার করে একটা apiserver বা etcd performance issue diagnose করুন।
- controller-runtime ব্যবহার করে একটা ছোট custom controller লিখুন।

### Production project

হয়:
(a) একটা বাস্তব cluster-এ একটা etcd tuning / defrag / upgrade exercise lead করুন।
(b) একটা ছোট operator বা admission webhook লিখুন যা একটা বাস্তব org pain সমাধান করে।
(c) full observability সহ একটা opaque managed runtime থেকে একটা workload K8s-এ migrate করুন।

### Artifact

project নিয়ে talk বা writeup, before/after metric সহ।

---

## Month 8 — Observability program (org-level, service-level নয়)

### Reading

- _Observability Engineering_ (Majors et al) — org adoption নিয়ে chapter 7+।
- OpenTelemetry spec (আপনি আসলে যে অংশ ব্যবহার করেন)।
- Honeycomb/Grafana blog থেকে cardinality, exemplar, আর cost-of-observability paper।

### Skill targets

- আপনার org-এ 3+ team consistently ব্যবহার করা SLI taxonomy define করুন।
- একটা "service-level golden signals" template বানান যা যেকোনো team একদিনে adopt করতে পারে।
- cardinality budget দিয়ে observability spend cap করুন — আর cap-টা justify করুন।

### Production project

অন্তত 5টা service জুড়ে SLO standardize করুন। একটা team-level dashboard-এ roll up করুন। quarterly leadership-কে rollup-টা brief করুন।

### Artifact

একটা "how SLOs work here" doc যা company-র reference হয়ে যায়। Plus standardized dashboard।

---

## Month 9 — Cost engineering / FinOps program

### Reading

- _Cloud FinOps_ (J.R. Storment, Mike Fuller)।
- AWS Well-Architected Framework — Cost Optimization pillar।
- বাস্তব customer optimization নিয়ে Vantage / Cast.AI engineering blog post।

### Skill targets

- অন্তত 3টা service-এর জন্য cost-per-request compute করুন।
- বছরে > $50k সাশ্রয় করে এমন একটা instance-type বা commitment optimization recommend (আর quantify) করুন।
- engineering leadership-এর সাথে একটা quarterly cost review চালান।

### Production project

একটা per-team cost allocation dashboard বানান। অন্তত একটা optimization completion পর্যন্ত drive করুন (rightsizing, Graviton migration, NAT-to-VPC-endpoint, lifecycle policy)।

### Artifact

dashboard, plus dollar impact সহ optimization-এর একটা writeup।

---

## Months 10-12 — Capstone

8-week roadmap একটা personal capstone দিয়ে শেষ হয়েছিল (আপনি build আর operate করা একটা service)। 12-month mastery capstone ভিন্নভাবে আকৃত: এটা একটা public artifact সহ একটা org-level program।

### একটা capstone বাছুন

**Option A — Resilience program.**
org-এর "একটা region failure-এ কী টিকে থাকবে?" assessment lead করুন। একটা multi-page report তৈরি করুন: audited service, পাওয়া gap, prioritized fix list, capital investment ask। অন্তত একটা service-এ একটা বাস্তব region-failover drill চালান।

**Option B — Reliability platform.**
org-এর golden-path platform build করুন (বা উল্লেখযোগ্যভাবে contribute করুন): SLO-as-code, on-call-as-code, deploy template, observability template। 3+ team-এর adoption দিয়ে demonstrate করুন।

**Option C — Public technical artifact.**
একটা long-form blog post, conference talk, বা open-source contribution যা বছরের একটা deep technical lesson crystallize করে। মানদণ্ড: পৃথিবীর আরেকজন senior SRE এটা পড়ে আর কিছু শেখে।

**Option D — Mentorship program.**
2-3 জন junior engineer-কে তিন মাসে "knows the basics" থেকে "can run an incident solo"-তে নিয়ে যান। program-টা document করুন যাতে এটা পুনরাবৃত্তি করা যায়।

### Capstone কী প্রমাণ করে

একজন staff-track SRE সেখানে পৌঁছায় না সেরা individual debugger হয়ে। তারা সেখানে পৌঁছায় _অন্যদের বেশি reliable বানিয়ে_ — program, platform, mentoring, বা external knowledge transfer-এর মাধ্যমে। Capstone হলো আপনি সেটা করতে পারেন তার প্রমাণ।

### Artifact

External: একটা blog post, talk, OSS PR list, accepted conference proposal।
Internal: একটা doc যা আপনার পরেও টিকে থাকে। এমন doc যেদিকে team-এ যোগ দেওয়া পরের ব্যক্তিকে নির্দেশ করা হয়।

---

## সারা বছর জুড়ে — যে habit যৌগিক হয়

### Weekly

- একটা engineering blog post বা postmortem গভীরভাবে পড়ুন (Cloudflare, Stripe, GitHub, AWS, Honeycomb, Linkedin Eng সবাই gold publish করে)।
- আপনার peer-রা কী পড়ছে তার জন্য Hacker News + lobste.rs skim করুন।
- আপনার runbook/postmortem-এ 30 মিনিট ব্যয় করুন — একটা উন্নত করুন।

### Monthly

- একটা paper reading session। একটা technical book chapter session।
- মাসের incident আপনাকে কী শেখাল তার একটা retro।
- perspective-এর জন্য আরেকটা org-এর একজন senior-এর সাথে একটা 1:1।

### Quarterly

- একটা বাস্তব service-এ DR drill।
- আপনার rotation-এর জন্য on-call health retro।
- আপনার "আজ Staff হলে কী উন্নত করতাম" list update করুন।

### Yearly

- SRE Book + SRE Workbook re-read করুন। হ্যাঁ, আবার। আপনি নতুন জিনিস দেখবেন।
- অন্তত একটা conference talk proposal submit করুন।
- সত্যিকারের ছুটি নিন। Burned-out SRE খারাপ দীর্ঘমেয়াদী IC হয়।

---

## Community-তে কোথায় plug in করবেন

Senior IC growth-এর জন্য external pressure লাগে। যে community আপনাকে ঠেলে:

- **SREcon** (USENIX) — the conference। attend করতে বা talk দেখতে পারলে, করুন।
- **CNCF events** — KubeCon, Linkerd Summit, ইত্যাদি।
- **Local SRE meetup** — variable quality, কিন্তু আপনি আপনার peer-দের সাথে দেখা করবেন।
- **Discord/Slack community**: SRE Discord, Kubernetes Slack, Honeycomb Pollinators।
- **Twitter/Mastodon/Bluesky**: Charity Majors, Brendan Gregg, Tanya Reilly, Will Larson, Aphyr (Jepsen), Kelsey Hightower, Lorin Hochstein-কে follow করুন।
- **Open-source contribution** — Prometheus, OpenTelemetry, Cilium, Kubernetes নিজেই। ছোট docs PR-ও context গড়ে।

pattern: আপনি SRE knowledge-এর consumer থেকে producer হন। month 12-এ আপনার সেই source হওয়া উচিত যা আরেকজন পড়ছে।

---

## এই বছরে এড়ানোর মতো anti-pattern

1. **Build না করে reading।** production application ছাড়া theory পচে যায়।
2. **Reading না করে building।** আপনি সবকিছু re-derive করবেন — ধীরে।
3. **Ticket count-এর জন্য optimize করা।** বছরে 200টা routine ticket close করা কিছুই প্রমাণ করে না।
4. **"project-এ focus করতে" on-call rotation এড়ানো।** আপনি pager থেকে সবচেয়ে বেশি শেখেন।
5. **একা চলা।** Mentor + study buddy growth-এ একটা 2-3x multiplier।
6. **Burnout।** 80% deliberate effort-এর এক বছর 120%-এর 6 মাসকে হারায়।

---

## month 12-এ "mastery" আসলে কী মানে

সৎ framing — বছরটা ভালো গেলে যা সত্য হওয়া উচিত:

- আপনি যেকোনো layer-এ একটা production outage debug করতে পারেন — kernel, network, database, app — বেশিরভাগ ক্ষেত্রে escalation ছাড়া।
- আপনি একটা নতুন service end-to-end design করতে পারেন (SLO, capacity, observability, on-call) আর review-এ design defend করতে পারেন।
- আপনি যেকোনো severity-র জন্য, যেকোনো team-এর সাথে IC হিসেবে একটা incident চালাতে পারেন।
- আপনি অন্তত একটা cross-cutting program ship করেছেন যা অন্য team ব্যবহার করে।
- SRE Workbook-এর প্রতিটা chapter নিয়ে আপনার একটা opinion আছে — আর সেটা defend করতে পারেন।
- একটা doc গুরুত্বসহকারে পড়া হোক চাইলে লোকজন যার নাম দেয় সেটা আপনার নাম।

আপনি "done" নন। পরের 5-10 বছর হলো 1-2টা এলাকায় depth (DB, networking, distributed-systems design, SRE leadership) আর পুরো stack জুড়ে coordinate করার breadth নিয়ে। কিন্তু আপনি এখন senior, plausibly Staff, level-এ operate করছেন। career path এখান থেকে খুলে যায়।

## আপডেটেড থাকুন

- [USENIX SREcon](https://www.usenix.org/srecon) — yearly state-of-the-practice talk
- [Google SRE books](https://sre.google/books/) — প্রতি 18 মাসে reread করুন; নতুন জিনিস লক্ষ্য করবেন
- [Papers We Love](https://paperswelove.org/) — সবসময় একটা paper হাতে রাখুন
- [CNCF TOC radar](https://github.com/cncf/toc) — কী graduate করছে, কী deprecate হচ্ছে

## মূল শিক্ষা

1. **বছরটা একটা বাস্তব SRE role-এ থাকা কারো জন্য paced** — production exposure হলো ভিত্তি।
2. **প্রতিটা month-এ একটা depth target + production project + artifact আছে** — শুধু reading needle নাড়ায় না।
3. **Months 7-9 হলো staff-shaped pivot** — program, platform, mentoring।
4. **Capstone leverage প্রমাণ করে** — অন্যদের বেশি reliable বানানো, শুধু সেরা debugger হওয়া নয়।
5. **External community pressure** হলো যা competent IC-কে senior IC-তে পরিণত করে।
6. **Sustainable pace heroics-কে হারায়** — সপ্তাহে 5-8 ঘণ্টা deliberate study, প্রতি সপ্তাহে, 52 সপ্তাহ ধরে।
