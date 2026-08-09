---
title: 'Blameless Postmortems'
subtitle: 'Google, Etsy, আর Stripe যে full template ব্যবহার করে, সাথে action-item discipline যা একই incident দ্বিতীয়বার আটকায়।'
chapter: 5
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['postmortem', 'blameless', 'root cause', 'five whys', 'action items']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

একটা যাত্রীবাহী বিমান রানওয়েতে নামার মুহূর্তে অল্পের জন্য বড় দুর্ঘটনা থেকে বেঁচে যায়। তদন্ত বোর্ডের প্রধান ফাতিমা আল-ফিহরি প্রথমেই একটা সিদ্ধান্ত জানিয়ে দেন — এই তদন্ত পাইলটকে শাস্তি দেওয়ার জন্য নয়। পাইলট ইবনে সিনাকে ডেকে বলা হয়, "আপনি কী দেখেছেন, কী ভেবেছেন, ঠিক যেমনটা ঘটেছে হুবহু বলুন, কোনো ভয় নেই।" ভয় নেই বলেই ইবনে সিনা লুকান না — তিনি স্বীকার করেন যে চাপের মুখে তিনি ভুল একটা ডায়ালে চোখ রেখেছিলেন, উচ্চতার বদলে অন্য একটা মিটার পড়ে ফেলেছিলেন।

বোর্ড সেই কথাটাকে "পাইলটের অমনোযোগ" বলে ফাইল বন্ধ করে দিতে পারত। কিন্তু ফাতিমা আরও গভীরে খোঁড়েন — আর ককপিটে গিয়ে দেখেন, দুটো জরুরি ডায়াল দেখতে প্রায় একরকম, পাশাপাশি বসানো, চাপের মুহূর্তে যে কোনো পাইলটই গুলিয়ে ফেলতে পারে। মানে সমস্যাটা ইবনে সিনার মাথায় নয়, সমস্যাটা ককপিটের ডিজাইনে। বোর্ড নির্দেশ দেয় — এই দুই ডায়াল আলাদা রঙে, আলাদা জায়গায় বসাতে হবে, যাতে ভবিষ্যতে কোনো পাইলট আর কখনো এই ভুল করতেই না পারে।

এই গল্পটাই আসলে **blameless postmortem**। পাইলটকে শাস্তি না দেওয়া হলো blameless নীতি; একরকম দেখতে ডায়ালের মতো systemic cause খুঁজে বের করা হলো ব্যক্তিকে দোষ না দিয়ে সিস্টেমের root cause ধরা; ককপিট রিডিজাইন করা হলো action items বা systemic fix। আর সবচেয়ে জরুরি — ইবনে সিনা ভয় পাননি বলেই পুরো সত্যিটা বলেছেন, আর সেই সত্যি ছাড়া আসল fix-টাই কখনো বের হতো না। বাস্তবে aviation safety board ঠিক এভাবেই চলে (report anonymous, prosecution থেকে immune), আর SRE-র postmortem হুবহু একই যুক্তি ধার করে — মানুষ নয়, সিস্টেম তদন্ত করো, তাহলেই একই incident দ্বিতীয়বার আটকানো যায়।

## Blameless কেন

সবচেয়ে গুরুত্বপূর্ণ নিয়ম: **postmortem সিস্টেম তদন্ত করে, মানুষ নয়।**

engineer-রা যদি ভয় পায় যে incident তাদের বিরুদ্ধে ব্যবহার হবে, তারা:

- near-miss লুকাবে (তাই তুমি কখনো সস্তা failure থেকে শিখবে না)
- timeline ছোট করবে (তাই তুমি কী হয়েছে সেটা ভুল বুঝবে)
- risky-but-needed কাজ এড়াবে (তাই velocity মরে যায়)

Blame culture একটা $10k-এর শেখার সুযোগকে ভবিষ্যতে একটা $1M outage-এ পরিণত করে, প্রতিবার।

```
✗ "Fatima deployed bad code at 14:00 and broke checkout."
✓ "The deployment pipeline allowed an untested config change to reach
   production. The change disabled connection pooling, which had no
   alert. Fatima was the deployer, but the system permitted the failure."
```

একই incident। প্রথম version একজন বরখাস্ত engineer তৈরি করে। দ্বিতীয় version তিনটা durable fix তৈরি করে যা পরেরটা আটকায়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

Aviation safety report গুলো anonymous আর FAA-র ডিজাইন অনুযায়ী prosecution থেকে immune। Pilot-রা near-miss অবাধে report করে, সিস্টেম নিরাপদ হয়, আর airline industry-র একটা fatality rate আছে যা প্রতি দশকে কমে। SRE postmortem একই logic ব্যবহার করে।

</Callout>

## The full postmortem template

এটা সেই structure যা (সামান্য variation সহ) Google, Stripe, GitHub, Etsy, আর Shopify-তে ব্যবহার হয়। হুবহু copy করো — প্রতিটা field একটা কারণে আছে।

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

## Action item discipline (যে অংশটা আসলে গুরুত্বপূর্ণ)

এমন action item সহ একটা postmortem যা কখনো ship হয় না, সেটা কোনো postmortem না থাকার চেয়ে খারাপ — এটা team-কে শেখায় যে postmortem হচ্ছে থিয়েটার।

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

AI completion rate-কে একটা SRE team metric হিসেবে track করো। Healthy team তাদের বলা due date-এর মধ্যে P0/P1 action item-এর 80%+ ship করে। 50%-এর নিচে মানে postmortem decorative।

<Callout type="warning">

**"improve documentation" action item থেকে সাবধান।** এটা সবচেয়ে সাধারণ AI আর সবচেয়ে কম কাজের। যদি একমাত্র fix হয় "ভালো docs লেখো," তাহলে আসল root cause সম্ভবত "আমরা মানুষের উপর নির্ভর করেছি এমন একটা জিনিস মনে রাখতে যা সিস্টেমের enforce করা উচিত।" এর বদলে code/config/policy fix-এর জন্য push করো।

</Callout>

## The postmortem review meeting

একটা 60-মিনিটের meeting, incident-এর 2 সপ্তাহের মধ্যে scheduled, attendees:

```
- Author (presents)
- IC and OL from the incident
- Service owner and engineering manager
- One person from a different team (fresh-eyes critic)
- SRE team lead (to ensure rigor)
```

fresh-eyes critic হচ্ছে গোপন উপাদান। তারা "দাঁড়াও, এটা আদৌ কেন আছে?" ধরনের প্রশ্ন করে যা team সমস্যার এত কাছে থাকে যে নিজেরা জিজ্ঞেস করতে পারে না।

meeting-টা incident নিয়ে আবার তর্ক করার জন্য নয়। এটা এর জন্য:

1. timeline আর root cause validate করা
2. action items approve করা (sizing, owners, dates)
3. সাম্প্রতিক postmortem জুড়ে কোনো pattern শনাক্ত করা

## Postmortem জুড়ে learning aggregate করা

আলাদা postmortem নির্দিষ্ট incident আটকায়। Aggregated postmortem incident-এর শ্রেণী আটকায়।

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

এভাবেই তুমি ধরতে পারো যে, যেমন, তোমার 40% incident আসে একটা third-party DNS provider failure থেকে আর তোমার DNS resilience-এ একটা project হিসেবে বিনিয়োগ করা দরকার, আরেকটা runbook entry হিসেবে নয়।

## Public vs internal postmortems

একটা public postmortem (তোমার ব্লগ বা status page-এ প্রকাশিত) একটা শক্তিশালী trust-building tool, কিন্তু এটা একটা আলাদা document।

```
INTERNAL                          PUBLIC
- All technical detail            - High-level what + impact
- Specific dollar figures         - "Affected ~12% of users"
- Names of engineers              - No individual names
- Internal tool names             - Generic descriptions
- All five whys                   - Top-level cause + key fix
- Full action items               - "We are addressing X, Y, Z"
```

Cloudflare-এর public postmortem গুলো gold standard — তোমার প্রথমটা publish করার আগে 2-3টা পড়ো।

## Stay current

- [Google SRE Book — Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) — blameless framing
- [Google's postmortem template](https://sre.google/workbook/postmortem-culture/#example-postmortem) — এটা copy করো
- [danluu/post-mortems](https://github.com/danluu/post-mortems) — public postmortem reading library
- [Etsy debriefing facilitation guide](https://extfiles.etsy.com/DebriefingFacilitationGuide.pdf) — meeting কীভাবে চালাবে

## Key Takeaways

1. **Blameless নয়তো worthless** — ভয়, পরের incident আটকাতে দরকারি data ধ্বংস করে
2. **Template non-optional** — এটা প্রতিবার একই field capture করে যাতে সেগুলো aggregate হয়
3. **Action items অবশ্যই sized, owned, dated, আর tracked** — নয়তো postmortem decorative ছিল
4. **Review meeting-এ একজন fresh-eyes critic** যা খুঁজে পায় team তার এত কাছে থাকে যে দেখতে পায় না
5. **ত্রৈমাসিকভাবে aggregate করো** — যেসব incident-শ্রেণীর একটা project দরকার, patch নয়, সেগুলো ধরতে
