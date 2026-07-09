---
title: 'GraphQL Building — রোডম্যাপ'
subtitle: "দশটি অধ্যায় যা 'একটা query তো নিছক একটা string' থেকে শুরু করে batched resolver, auth, subscription আর depth limit সহ nginx-এর পিছনে বসানো একটা self-hosted GraphQL server পর্যন্ত নিয়ে যায়।"
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'graphql', 'schema', 'resolvers', 'dataloader', 'federation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## শেষে গিয়ে আপনি যা করতে পারবেন

আপনি একটা সত্যিকারের GraphQL schema ডিজাইন করতে পারবেন, একটা self-hosted server চালাতে পারবেন (Node-এর উপর graphql-yoga — একই প্যাটার্ন Go-এর `gqlgen` আর Python-এর Strawberry-তেও অনুবাদ হয়), আপনার প্রথম ভার্সনটা কেন ধীর সেটা ব্যাখ্যা করতে পারবেন আর DataLoader দিয়ে সেটা ঠিক করতে পারবেন, resolver context-এ authentication যুক্ত করতে পারবেন, WebSockets-এর উপর subscription পাঠাতে পারবেন, আর গোটা জিনিসটা nginx-এর পিছনে এমন depth ও complexity limit সহ deploy করতে পারবেন যা একটা বৈরী ক্লায়েন্টের সামনেও টিকে থাকে।

<Callout type="info">

**Prereqs:** আগে **REST API building** শেষ করুন। GraphQL কিন্তু HTTP-এর বিকল্প নয় — এটা HTTP-এর উপরেই চলে। আপনার basic Node (বা আপনি যে ভাষাই বেছে নিন) জানা থাকা উচিত আর query করার জন্য একটা Postgres database থাকা উচিত। deployment অধ্যায়ের জন্য **Web Server Fundamentals** track-টা সহায়ক।

</Callout>

## ১০টি অধ্যায়, ক্রম অনুসারে

**Foundations**

1. **GraphQL কী আর কখন ব্যবহার করবেন** — query language বনাম API style, বনাম REST
2. **Schema-first design** — types, queries, mutations, scalars, nullability
3. **আপনার প্রথম server চালানো** — graphql-yoga end-to-end, ৬০ লাইনে
4. **Resolvers আর execution tree** — একটা query কীভাবে কল-এ পরিণত হয়

**ক্লাসিক সমস্যাগুলো**

5. **N+1 সমস্যা** — কেন আপনার প্রথম GraphQL server REST-এর চেয়ে 50× ধীর
6. **DataLoader** — batching আর per-request caching যা আসলেই এটা ঠিক করে
7. **Mutations, input types, validation** — লেখালেখি ঠিকভাবে করা
8. **Authentication আর authorization** — context, field-level check, directive

**Production**

9. **WebSockets-এর উপর Subscriptions** — graphql-ws দিয়ে realtime ঠিকভাবে করা
10. **Production hardening আর self-host** — depth/complexity limit, persisted queries, federation-এর ওভারভিউ, nginx-এর পিছনে

## এই track কীভাবে ব্যবহার করবেন

ক্রম অনুসারে পড়ুন। শুরুর অধ্যায়গুলো ধারণাগত; ৩ নম্বর অধ্যায় থেকে আপনি সত্যিকারের server চালাচ্ছেন আর সেগুলোতে curl করছেন। ৬ নম্বর অধ্যায়ে পৌঁছাতে পৌঁছাতে DataLoader-এর উল্লেখ নেই এমন যেকোনো GraphQL আর্টিকেল নিয়ে আপনার সন্দেহপ্রবণ হওয়া উচিত। মোট পড়ার সময়: ~২.৫ ঘণ্টা। হাতে-কলমে সময়, প্রথমবার পুরোটা বানাতে: একটা লম্বা উইকেন্ড।

deployment অধ্যায়ের জন্য আপনার লাগবে Node 20+, Postgres, আর একটা VPS-এর দিকে পয়েন্ট করা একটা domain। বাকি সব কিছু `localhost`-এ চলে।
