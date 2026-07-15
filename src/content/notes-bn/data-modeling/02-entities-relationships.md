---
title: 'Entities, attributes, relationships'
subtitle: 'SQL-এর আগে, ORM-এর আগে, box আর line আঁকুন। ER-চিন্তা হলো বিশ মিনিট যা এক বছরের refactoring বাঁচায়।'
chapter: 2
level: 'beginner'
readingTime: '11 মিনিট'
topics: ['data-modeling', 'er-diagrams', 'relationships', 'cardinality']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Data modeling-এ সবচেয়ে সস্তা debugging tool হলো একটা পেন্সিল। `CREATE TABLE` লেখার আগে একটা sketch আঁকুন — জিনিসের জন্য box, তাদের মধ্যে line, দিকের জন্য arrowhead, cardinality-র জন্য শব্দ। বিশ মিনিট sketching এমন দ্ব্যর্থতা বের করে আনে যা দুই মাসের code ঠিক করতে পারে না।

এই অধ্যায় হলো entity আর relationship-এ ভাবার জন্য যে ছোট vocabulary দরকার, সাথে relationship-এর চারটা shape যা বাস্তব model-এর ৯৫% cover করে।

<Callout type="info">

**বাস্তব জগতের উপমা**

বাস্তব জীবনে একটা social network — মানুষ (entities) যারা "একসাথে কাজ করে" বা "বিবাহিত" এমন relationship দিয়ে যুক্ত।

</Callout>

## গল্পে বুঝি

কর্ডোবার একটা স্কুলের অফিসে ফাতিমা আল-ফিহরি একটা মোটা খাতা খুলে বসেছেন। খাতার প্রথম অংশে তিনি লিখছেন প্রতিটা ছাত্রের কথা — কার নাম আল-খোয়ারিজমি, রোল কত, বয়স কত। আরেকটা অংশে লিখছেন স্কুলের ক্লাসগুলোর কথা — কোন ক্লাস, কোন ঘরে বসে। দুটো আলাদা তালিকা, দুই রকমের "জিনিস" যা অফিস আলাদা করে মনে রাখতে চায়।

কিন্তু আসল কাজ শুরু হয় তৃতীয় খাতায়। সেখানে ফাতিমা আল-ফিহরি লিখে রাখছেন কে কোন ক্লাসে "ভর্তি" — ইবনে সিনা গণিতেও আছে, দর্শনেও আছে; আবার গণিত ক্লাসে ইবনে সিনার পাশে আরও তিরিশজন ছাত্র। এক ক্লাসে অনেক ছাত্র, আবার এক ছাত্র অনেক ক্লাসে। তাই ছাত্র আর ক্লাসকে এক তালিকায় গুঁজে দেওয়া যায় না; ওই "ভর্তি" সম্পর্কটাই আলাদা করে লিখে রাখতে হয়।

এই তিন খাতাই আসলে data model। ছাত্র আর ক্লাস হলো দুটো **entity** — অফিস যে "জিনিস" নিয়ে জানে। প্রতিটা ছাত্রের নাম, রোল আর বয়স হলো তার **attribute** (property)। "ভর্তি" হলো ছাত্র আর ক্লাসের মধ্যেকার **relationship**। আর যেহেতু এক ক্লাসে অনেক ছাত্র (one-to-many) এবং এক ছাত্র অনেক ক্লাসে (মিলিয়ে many-to-many), সেটাই এই relationship-এর **cardinality**। বাস্তবে ঠিক এভাবেই একটা school management system কাজ করে — `students` আর `classes` দুটো table, আর মাঝে একটা enrollment table যা কে কোন ক্লাসে আছে তা ধরে রাখে।

## Vocabulary

**Entity** — system যে জিনিসটা সম্পর্কে জানে। _User_, _Order_, _Listing_, _Comment_। SQL-এ, সাধারণত একটা table।

**Attribute** — একটা entity-র একটা property। _email_, _name_, _created_at_। SQL-এ, একটা column।

**Relationship** — দুটো entity কীভাবে সম্পর্কিত। _এক user-এর অনেক order._ _একটা listing এক seller-এর._ SQL-এ, foreign key (নয়তো একটা join table)।

**Cardinality** — এক দিকের কতগুলো অন্য দিকের কতগুলোর সাথে সম্পর্কিত। চারটা shape:

| Cardinality | উদাহরণ                                                                              |
| ----------- | ----------------------------------------------------------------------------------- |
| 1 : 1       | একটা `user`-এর ঠিক একটা `user_settings` row থাকে                                    |
| 1 : N       | একটা `user`-এর অনেক `orders`; প্রতিটা order-এর এক `user`                            |
| N : 1       | 1 : N-এর উল্টো                                                                      |
| N : M       | একটা `user` অনেক `listings` favorite করে; প্রতিটা listing অনেক `users` favorite করে |

এটাই পুরো vocabulary। পাঁচটা term।

## এটা আঁকা

দুটো ব্যবহারিক notation।

**ER diagram (formal).** ভেতরে attribute সহ box; মাঝে cardinality-র জন্য crow's-foot symbol সহ line।

**Mermaid (in-code).** Markdown-বান্ধব:

```
erDiagram
  USER ||--o{ ORDER : places
  USER ||--o{ LISTING : sells
  LISTING ||--o{ ORDER : "ordered as"
  USER }o--o{ LISTING : favorites
```

পড়ুন: `||--o{` হলো one-to-many; `}o--o{` হলো many-to-many। Arrow-গুলো গুরুত্বপূর্ণ নয় — প্রতি প্রান্তের symbol-ই আসল।

**Whiteboard sketch (সবচেয়ে দ্রুত).** শুধু box, line, আর "1" বা "N" label। কোনো tooling লাগে না। ৮০% design আলোচনার জন্য, আপনি আসলে এটাই ব্যবহার করেন।

একটা বাছুন আর ধারাবাহিকভাবে ব্যবহার করুন। Sketch হলো _আপনার_ জন্য আর যাদের সাথে design করছেন তাদের জন্য। এটা deliverable নয়; এটা একটা চিন্তার সহায়ক।

## Entity চেনা — পরীক্ষা

কোনো কিছু entity নাকি attribute তা জানার দুটো উপায়।

**পরীক্ষা ১: এর কি নিজস্ব জীবন আছে?** একজন user log in করে, email পায়, তার settings আছে। স্বাধীন অস্তিত্ব → entity। একজন user-এর _birthday_-র settings নেই বা email পায় না; এটা নিছক user-এর সাথে সংযুক্ত একটা তারিখ → attribute।

**পরীক্ষা ২: এর কি নিজস্ব children থাকবে?** একটা _address_-কে user-এর একটা attribute মনে হয়। কিন্তু যদি এক user-এর একাধিক address থাকে (shipping, billing)? এখন `address`-এর নিজস্ব children আছে — এটা একটা entity (`addresses` table) `user_id` foreign key সহ।

সন্দেহ হলে, attribute হিসেবে শুরু করুন। পরে entity-তে উন্নীত করা একটা এক-ধাপের migration; একটা entity-কে attribute-এ নামানো কদাচিৎ সঠিক পদক্ষেপ।

## চারটা shape

### 1 : 1 — কম ব্যবহার করা হয়

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, ...);
CREATE TABLE user_settings (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  ...
);
```

`user_settings.user_id` একই সাথে primary key _এবং_ foreign key। প্রতিটা user-এর `user_settings`-এ ঠিক একটা row। কেন ভাগ করবেন:

- **Performance / row width।** ৩০ column-এর একটা `users` table যার একটা হলো একটা 50KB JSON blob যা কদাচিৎ query হয় — blob-টাকে আলাদা table-এ ভাগ করুন।
- **Optionality।** Settings শুধু user settings page খোলার পরই থাকে। একটা row থাকা/না-থাকা state-এর সংকেত দেয়।
- **আলাদা access pattern।** Settings প্রতি session-এ একবার পড়া হয়; user identity প্রতিটা request-এ পড়া হয়।

বেশিরভাগ 1:1 relationship একটা লক্ষণ যে আপনার শুধু parent table-এ column যোগ করা উচিত। তিনটা কারণের একটা খাটলেই কেবল আলাদা table-এর দিকে হাত বাড়ান।

### 1 : N — কাজের ঘোড়া

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, ...);
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  buyer_id BIGINT NOT NULL REFERENCES users(id),
  ...
);
```

Foreign key থাকে "many" দিকে। এক user, অনেক order।

সিদ্ধান্তের বিন্দুগুলো:

- **`ON DELETE` আচরণ।** ইচ্ছাকৃতভাবে বাছুন (অধ্যায় ৬ এটা cover করে)।
- **Indexed?** হ্যাঁ — foreign key সবসময় index করুন। `CREATE INDEX ON orders(buyer_id);`। এটা ছাড়া, "user 42-র সব order খোঁজো" হলো একটা full table scan।
- **Required নাকি optional?** `NOT NULL` বলে প্রতিটা order-এর একটা buyer থাকতেই হবে। Nullable বলে কিছু order buyer-হীন ("guest checkout")। স্পষ্ট থাকুন।

### N : 1 — একই shape, ভিন্ন প্রশ্ন

`N : 1` হলো নিছক `1 : N` many দিক থেকে দেখা। "একটা order এক user-এর" বনাম "এক user-এর অনেক order" একই relationship।

এই framing যে প্রশ্ন সামনে আনে: **child থেকে parent কীভাবে পাই?** Foreign key দিয়ে একটা SQL JOIN। সেটা যদি একটা hot path হয়, তাহলে foreign key index-ই একটা 1ms query আর একটা 1s query-র মধ্যে পার্থক্য।

### N : M — একটা join table লাগে

"Many-to-many"-কে একটা একক foreign key হিসেবে প্রকাশ করার কোনো উপায় নেই। আপনার একটা তৃতীয় table লাগবে।

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, ...);
CREATE TABLE listings (id BIGSERIAL PRIMARY KEY, ...);

CREATE TABLE user_listing_favorites (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
```

Join table:

- দুটো foreign key-এর **composite primary key** নিশ্চিত করে কোনো duplicate favorite নেই।
- **দুই দিকেই `ON DELETE CASCADE`** — user বা listing যেটাই delete হোক, favorite মুছে যায়। সাধারণত সঠিক পছন্দ।
- **প্রায়ই নিজের attribute পায়।** `created_at` স্বাভাবিক। কখনও একটা `note` field। Join table আঠা হিসেবে শুরু হয়ে নিজের একটা entity-তে বড় হয়।

দুটো foreign key-ই index করুন (Postgres কেবল composite PK-র প্রথম column auto-index করে):

```sql
CREATE INDEX ON user_listing_favorites(listing_id);
```

এই index ছাড়া, "এই listing কে favorite করেছে?" হলো একটা full scan।

<Callout type="tip">

**N:M table সবসময় স্পষ্টভাবে নাম দিন।** `user_listing_favorites` `users_listings`-এর চেয়ে ভালো পড়ায়। Verb অন্তর্ভুক্ত করলে intent পরিষ্কার হয় আর একই জোড়ার একাধিক relationship থাকলে ("favorites" vs "blocks" vs "follows") name conflict এড়ানো যায়।

</Callout>

## যখন relationship-এর নিজস্ব attribute দরকার

কখনও relationship নিজেই এমন property রাখে যা কোনো entity-তেই মানায় না।

```sql
CREATE TABLE org_memberships (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      BIGINT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner','admin','member','guest')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by  BIGINT REFERENCES users(id),
  PRIMARY KEY (user_id, org_id)
);
```

`role` `users`-এ মানায় না (এক user-এর ভিন্ন org-এ ভিন্ন role থাকতে পারে) বা `orgs`-এ মানায় না (এক org-এর অনেক role, প্রতি member-এ একটা)। এটা মানায় _membership_-এ — relationship-এর নিজেই।

Join table যখন একটা আসল entity-র মতো মনে হতে শুরু করে, তখন একে নিজের একটা surrogate key দিন (অধ্যায় ৩) আর বাড়তে দিন:

```sql
CREATE TABLE org_memberships (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      BIGINT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);
```

এখন membership-এর নিজের ID আছে, আর unique constraint "কোনো duplicate নেই" বজায় রাখে। দুটো রূপই বৈধ; দ্বিতীয়টা বেশি নমনীয়।

## Polymorphic relationship — সাধারণত একটা গন্ধ

একটা সাধারণ প্রলোভন:

```sql
CREATE TABLE comments (
  id BIGSERIAL PRIMARY KEY,
  commentable_type TEXT NOT NULL,  -- 'post', 'photo', 'video'
  commentable_id   BIGINT NOT NULL,
  body TEXT NOT NULL
);
```

"একটা comment একটা post, একটা photo, বা একটা video-তে যুক্ত হতে পারে।" দেখতে সুন্দর। তিনটা সমস্যা আছে:

1. **কোনো foreign key constraint নেই।** `commentable_type`-এর ওপর নির্ভর করে `commentable_id` আলাদা table-কে reference করে। Row-টা আছে কিনা DB enforce করতে পারে না। Orphan comment জমতে থাকে।
2. **Query করা কঠিন।** "সব comment-করা item"-এর জন্য একাধিক table জুড়ে একটা UNION লাগে, তারপর comments-এ back-join।
3. **Index-গুলো বেঢপ।** একটা `(commentable_type, commentable_id)` index কাজ করে কিন্তু কিছু optimizer সচেতনতা হারায়।

আরও ভালো: প্রতি parent type-এ একটা comment table, নয়তো explicit nullable FK সহ একটা table:

```sql
CREATE TABLE comments (
  id BIGSERIAL PRIMARY KEY,
  body TEXT NOT NULL,
  post_id  BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  photo_id BIGINT REFERENCES photos(id) ON DELETE CASCADE,
  video_id BIGINT REFERENCES videos(id) ON DELETE CASCADE,
  CHECK (
    (post_id IS NOT NULL)::int +
    (photo_id IS NOT NULL)::int +
    (video_id IS NOT NULL)::int = 1
  )
);
```

তিনটা nullable FK; CHECK নিশ্চিত করে ঠিক একটা set আছে। আসল foreign key, আসল cascade আচরণ। সামান্য বেশি column; সঠিক।

খুব dynamic system-এর জন্য (runtime-এ অনেক parent type যোগ হয়), কঠোর app-level check সহ একটা single-table polymorphic design-ই একমাত্র option হতে পারে। কিন্তু একে default হিসেবে এড়িয়ে চলুন।

## Self-referencing relationship

এক user আরেক user-কে follow করে। একটা folder অন্য folder ধারণ করে। একটা reply একটা parent comment-এর। কৌশল: foreign key একই table-কে নির্দেশ করে।

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  ...
);

CREATE TABLE follows (
  follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
```

একই table-কে reference করা দুটো column; CHECK self-follow ঠেকায়।

Tree structure-এর জন্য — subcategory সহ category, comment thread — একটা `parent_id` self-FK হলো সরল shape:

```sql
CREATE TABLE comments (
  id        BIGSERIAL PRIMARY KEY,
  parent_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
  ...
);
```

এটা একটা ক্লাসিক adjacency list। কয়েক হাজার node পর্যন্ত tree-র জন্য ঠিক আছে। গভীরতর বা চওড়া tree path-based বা recursive-CTE pattern থেকে উপকার পায়, যা advanced data-modeling উপাদানে cover করা হয়েছে।

## যে modeling টিপস কাজে দেয়

**Relationship পরিষ্কারভাবে নাম দিন।** একটা listing যখন এক "seller"-এর, তখন `seller_id` `user_id`-র চেয়ে ভালো পড়ায়। একজন user যদি buyer আর seller দুটোই হতে পারে, তাহলে দুই নামই intent জানায়।

**একই table-এ দুটো FK-র আলাদা নাম দরকার।** একটা `order`-এ `buyer_id` আর `seller_id` (দুটোই → `users.id`) হলো standard shape। `user_id` পুনর্ব্যবহার করবেন না।

**FK-কে দুই প্রান্তেই denormalize করবেন না।** একটা সাধারণ ফাঁদ: `users`-এ `latest_order_id` রাখা যাতে orders table query করতে না হয়। এখন আপনার দুটো source of truth আছে যেগুলো সরে যায়। শুধু তখনই denormalize করুন যখন আপনি একটা আসল read-pattern লাভ মাপেন (অধ্যায় ৫)।

**Cardinality সৎ রাখুন।** আপনি যদি একটা relationship-কে 1:1 চিহ্নিত করেন কিন্তু পরে 1:N দরকার হয়, migration কষ্টকর। অস্পষ্ট ক্ষেত্রে default হিসেবে 1:N (বাড়তি table) নিলে আপনি নমনীয়তা পান।

## সারসংক্ষেপ

- পাঁচটা term: entity, attribute, relationship, cardinality, primary key।
- চারটা shape: 1:1, 1:N, N:1, N:M। SQL লেখার আগে এগুলো sketch করুন।
- 1:1 বিরল আর সাধারণত ভুল — আসল কারণ না থাকলে এক table-এ মিলিয়ে ফেলুন।
- 1:N হলো কাজের ঘোড়া। Foreign key many দিকে। সবসময় indexed।
- N:M-এ join table লাগে; composite PK; দুই column-ই index করুন।
- Attribute বাড়ানো join table নিজের ID সহ আসল entity হয়ে যায়।
- Polymorphic FK সাধারণত একটা গন্ধ — একাধিক typed FK পছন্দ করুন।
- Self-reference একটা CHECK দূরত্বে ভাঙা থেকে — `id = parent_id`-এর বিরুদ্ধে পাহারা দিন।
- Naming আর explicit cardinality আপনাকে সবচেয়ে বেশি পুনরায় কাজ থেকে বাঁচায়।

পরবর্তী: [Keys](/notes/data-modeling/03-keys) — এমন identifier বাছা যা সময়ের সাথে টিকে যায়।
