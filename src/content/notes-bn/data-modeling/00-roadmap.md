---
title: 'Data Modeling — রোডম্যাপ'
subtitle: "দশটি অধ্যায় যা আপনাকে 'primary key জিনিসটা কী' থেকে load-এর নিচে ইচ্ছাকৃত schema design পর্যন্ত নিয়ে যাবে — keys, normalization, denormalization, constraints, multi-tenancy, JSONB, আর zero-downtime evolution।"
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'data-modeling', 'schemas', 'postgres']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## শেষে গিয়ে আপনি কী করতে পারবেন

আপনি এমন Postgres schema design করতে পারবেন যা বাস্তব query pattern-এর সাথে মেলে, এমন keys বাছতে পারবেন যেগুলো সময়ের সাথে টিকে যায়, যেখানে normalize করলে উপকার সেখানে normalize আর যেখানে denormalize করলে লাভ সেখানে denormalize করতে পারবেন, application check-এর বদলে invariant-গুলোকে constraint হিসেবে encode করতে পারবেন, নিজেকে কোণঠাসা না করে time আর tenancy model করতে পারবেন, কখন JSONB তার জায়গা করে নেয় তা ঠিক করতে পারবেন, আর একটা live system-এ zero-downtime schema migration চালাতে পারবেন।

<Callout type="info">

**Prereqs:** আগে **REST API building** শেষ করুন। এই path-এর **Databases self-hosted** আর **Background jobs** track এই অধ্যায়টার ওপর নির্ভর করে — বেশিরভাগ schema-ভুল পরে হয় slow query নয়তো অসম্ভব migration হিসেবে সামনে আসে। Postgres এখানে reference; concept যেকোনো relational database-এই খাটে।

</Callout>

## ১০টি অধ্যায়, ক্রম অনুযায়ী

**Foundations**

1. **What data modeling is** — schema design-এর সাথে, ORM-এর সাথে, আর "চলো একটা table বানাই"-এর তুলনায়
2. **Entities, attributes, relationships** — SQL-এর আগে ER-চিন্তা
3. **Keys** — natural vs surrogate, ULID/UUID/serial, composite, কোনটা কখন খাপ খায়
4. **Normalization** — 1NF, 2NF, 3NF সহজ ভাষায়, উদাহরণ সহ

**বাস্তব দুনিয়ার tradeoff**

5. **Denormalization** — কেন, কখন, আর তার bookkeeping খরচ
6. **Constraints** — NOT NULL, FK, CHECK, UNIQUE, exclusion, generated
7. **Time and soft delete** — timestamps, time zones, history tables, soft-delete-এর ফাঁদ
8. **Multi-tenancy** — single-DB, schema-per-tenant, row-level security

**Production**

9. **JSONB and the schemaless trap** — কখন ব্যবহার করবেন, কখন কামড় দেয়
10. **Schema evolution** — expand/contract, zero-downtime migrations, backfills

## এই track কীভাবে ব্যবহার করবেন

ক্রম অনুযায়ী পড়ুন। প্রথম চারটি অধ্যায় conceptual; ৫ নম্বর থেকে আপনি বাস্তব query pattern-এর বিপরীতে tradeoff ওজন করছেন। শেষ দুটি operational। মোট পড়া: ~৩ ঘণ্টা। একটা আসল Postgres database নিয়ে হাতে-কলমে: একটা লম্বা weekend।

আপনার লাগবে Postgres 15+ আর একটা SQL client (`psql`, DBeaver, TablePlus, নয়তো Postgres extension সহ VS Code)। সবকিছু locally চলে।
