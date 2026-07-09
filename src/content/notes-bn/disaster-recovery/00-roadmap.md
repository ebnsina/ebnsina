---
title: 'Disaster Recovery — রোডম্যাপ'
subtitle: 'RTO আর RPO, pg_dump আর WAL-G ব্যাকআপ, restore drill, multi-region replication, আর রাত ৩টায় কাজ করে এমন runbook।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব উদাহরণ**

ইন্স্যুরেন্স: দরকার হওয়ার আগেই কিনে রাখেন, আশা করেন কখনো ব্যবহার করতে হবে না, আর যখন সত্যিই দরকার পড়ে তখন পলিসিটা কতটা ভালো তার উপরই নির্ভর করে আপনি রিকভার করতে পারবেন কি না। একটা disaster recovery প্ল্যান হলো আপনার অপারেশনাল ইন্স্যুরেন্স — এর মূল্য পুরোপুরি নির্ভর করে টেস্ট করলে সেটা আসলেই কাজ করে কি না তার উপর।

</Callout>

## যা শিখবেন

বেশিরভাগ ইঞ্জিনিয়ার disaster recovery নিয়ে ভুলভাবে ভাবেন: এমন কিছু যা একবার সেটআপ করে রেখে আশা করা হয় কখনো দরকার পড়বে না। এই ট্র্যাক এটাকে একটা প্র্যাকটিস হিসেবে দেখে — মাপা যায় এমন টার্গেট, নিয়মিত drill, আর প্রতিটা incident-এর পর যেগুলো আরও ভালো হয় এমন runbook দিয়ে। আপনি শিখবেন কীভাবে RTO/RPO বিজনেস বাস্তবতা থেকে বের করতে হয় (আন্দাজে নয়), WAL-G দিয়ে continuous backup চালু করতে হয়, দরকার পড়ার আগেই একটা শিডিউলে restore টেস্ট করতে হয়, region জুড়ে streaming replication সেটআপ করতে হয়, আর চাপের মধ্যে থাকা একজন ইঞ্জিনিয়ার আসলেই অনুসরণ করতে পারবে এমন runbook লিখতে হয়।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **RTO, RPO, এবং এরা আসলে কী বোঝায়** — বিজনেস ইমপ্যাক্ট থেকে টার্গেট বের করা, recovery tier, কেন untested প্ল্যান ফেল করে
2. **Backup Strategies** — snapshot-এর জন্য pg_dump, continuous PITR-এর জন্য WAL-G, retention policy, 3-2-1 রুল
3. **Restore Drills** — অটোমেটেড সাপ্তাহিক verification, পূর্ণ DR simulation, runbook স্ট্রাকচার, RTO টাইমিং
4. **Multi-Region Replication** — streaming replication, sync vs async, অটোমেটেড failover-এর জন্য Patroni, cross-region আর্কিটেকচার
5. **Runbooks & Incident Response** — runbook স্ট্রাকচার, incident-এর রোল, communication cadence, blameless post-mortem
