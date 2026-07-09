---
title: 'Capacity ও Cost — রোডম্যাপ'
subtitle: 'First principles থেকে sizing, cloud vs bare metal-এর economics, database cost, redundancy-এর দাম, এবং যে optimization সত্যিকারের টাকা বাঁচায়।'
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

আপনার output volume জানার আগেই একটা factory বানানো: সাইজ খুব ছোট করলে প্রথম দিন থেকেই bottleneck-এ আটকে যাবেন; সাইজ খুব বড় করলে খালি floor space-এ capital পুড়িয়ে ফেলবেন। Capacity planning হলো এটা ঠিকঠাক করার engineering discipline — এবং শেখার সাথে সাথে সেটা adjust করা।

</Callout>

## যা শিখবেন

Cloud bill user count-এর চেয়ে দ্রুত বাড়ে, কারণ team-গুলো এর পেছনের cost model না বুঝেই infrastructure-এর সিদ্ধান্ত নেয়। এই track আপনাকে সচেতন সিদ্ধান্ত নেওয়ার mental model দেয়: request load থেকে কীভাবে resource requirement বের করবেন, কখন managed service নিজের খরচ পুষিয়ে দেয়, প্রতিটা availability tier আসলে কত খরচ করে, এবং একটা বাস্তব AWS bill-এ কোথায় waste লুকিয়ে থাকে।

## এই track-এর chapter-গুলো

1. **Sizing Fundamentals** — request cost model, Little's Law, CPU/memory/IOPS/network estimation
2. **Cloud vs Bare Metal vs VPS** — unit economics, AWS-এর আসল খরচ, কখন কোন model জেতে
3. **Database Cost & Sizing** — IOPS, storage tier, connection pooling, read replica-এর হিসাব
4. **The Cost of Redundancy** — N+1, multi-AZ, active-active — প্রতিটা কী দেয় আর কত খরচ করে
5. **Cost Optimization in Practice** — waste খুঁজে বের করা, rightsizing, reserved instance, FinOps culture
