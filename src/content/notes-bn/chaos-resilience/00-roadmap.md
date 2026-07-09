---
title: 'Chaos ও Resilience — রোডম্যাপ'
subtitle: 'Fault injection, resilience patterns, GameDays, এবং SLO-ভিত্তিক ফিডব্যাক লুপ যা ব্যর্থতাকে শেখার হাতিয়ারে পরিণত করে।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

টিকা (Vaccination): আপনি সিস্টেমকে নিয়ন্ত্রিত, দুর্বল করা সংস্করণের সেই জিনিসের সংস্পর্শে আনেন যা তার ক্ষতি করতে পারত, যাতে আসল আঘাত এলে প্রতিক্রিয়া আগে থেকেই ক্যালিব্রেটেড থাকে। Chaos engineering হলো আপনার সিস্টেমের ইমিউন ট্রেনিং।

</Callout>

## আপনি যা শিখবেন

বেশিরভাগ সিস্টেম কেবল ততটাই resilient যতটা তাদের শেষ incident। Chaos engineering সেটা বদলে দেয়: আপনি দুর্বলতাগুলো খুঁজে বের করেন আপনার নিজের সময়সূচি অনুযায়ী, নিয়ন্ত্রিত পরিস্থিতিতে, অভিজ্ঞ ইঞ্জিনিয়ারদের নজরদারিতে — রাত ৩টায় ইউজারদের ক্ষতি করে নয়। এই ট্র্যাক পুরো প্র্যাকটিসটাই কভার করে: মেন্টাল মডেল, ব্যর্থতা আটকে রাখা resilience patterns, বাস্তবসম্মত fault ইনজেক্ট করার টুল, দলের সাথে কাঠামোবদ্ধ GameDays কীভাবে চালাবেন, এবং SLO ফ্রেমওয়ার্ক যা আপনাকে বলে দেয় পরীক্ষা করার মতো budget আপনার আছে কি না।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **What Is Chaos Engineering** — principles, experiment loop, failure mode taxonomy, prerequisites
2. **Resilience Patterns** — timeouts, retries, circuit breakers, bulkheads, graceful degradation
3. **Fault Injection Tools** — Pumba, `tc`, Chaos Mesh, AWS FIS, application-level injection
4. **GameDays** — planning, roles, exercise চালানো, post-mortems, chaos culture গড়া
5. **Steady State & SLOs** — SLIs, SLOs, error budgets, সেই policy যা reliability-কে engineering সিদ্ধান্তের সাথে জোড়ে
