---
title: 'Event-Driven ও Streaming — রোডম্যাপ'
subtitle: 'Pub/sub প্যাটার্ন, Debezium দিয়ে CDC, event sourcing, আর এমন schema evolution যা আপনার consumer-দের ভাঙবে না।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা সংবাদপত্র বনাম একটা ফোন কল: ফোন কল (synchronous request/response) দুই পক্ষেরই তাৎক্ষণিক মনোযোগ দাবি করে। সংবাদপত্র (event stream) একবার তথ্য প্রকাশ করে; পাঠকরা নিজেদের সুবিধামতো সময়ে সেটা পড়ে, আর নতুন পাঠকরা পুরনো সংস্করণেও ফিরে গিয়ে পড়তে পারে। Event-driven সিস্টেম আপনাকে সংবাদপত্রের মডেলটাই দেয় — loose coupling, স্বাধীনভাবে scaling, আর কী ঘটেছিল তার স্থায়ী রেকর্ড।

</Callout>

## আপনি যা শিখবেন

Loosely coupled সিস্টেমগুলো events-এর মাধ্যমে একে অপরের সাথে যোগাযোগ করে। এই ট্র্যাকে থাকবে শব্দভাণ্ডার (events বনাম commands বনাম queries), নির্ভরযোগ্যভাবে events পৌঁছানোর প্যাটার্ন (pub/sub, fan-out, consumer groups), application code না ছুঁয়ে database-এর পরিবর্তন কীভাবে capture করা যায় (Debezium দিয়ে CDC), audit-first সিস্টেমের জন্য event sourcing প্যাটার্ন, আর deploy করা consumer না ভেঙে সময়ের সাথে schema কীভাবে evolve করানো যায়।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **Events vs Commands vs Queries** — ভিন্ন semantics-সহ তিন ধরনের message, CQRS, naming convention
2. **Pub/Sub Patterns** — topics, consumer groups, fan-out, delivery guarantees, Kafka বনাম SNS/SQS
3. **Change Data Capture** — Debezium, logical replication, outbox pattern, slot lag মনিটর করা
4. **Event Sourcing** — append-only event store, aggregates, projections, snapshots, কখন ব্যবহার করবেন
5. **Schema Evolution** — backward compatibility, Schema Registry, Avro, consumer-driven contracts
