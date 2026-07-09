---
title: 'Normalization'
subtitle: '1NF, 2NF, 3NF — তিনটা নিয়ম যা একই ডেটাকে দুবার রেকর্ড হওয়া থেকে ঠেকায়। এদের উপেক্ষা করুন, আর ডেটা সিঙ্ক থেকে সরে যাওয়ার সাথে সাথে আপনার স্কিমা ভেতর থেকে পচতে থাকবে।'
chapter: 4
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['data-modeling', 'normalization', '1nf', '2nf', '3nf']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Normalization শুনতে একটা একাডেমিক শব্দের মতো যা ইঞ্জিনিয়ারিং বাস্তবতার সাথে ঠিক মেলে না। আসলে তা নয়। তিনটা normal form একটা স্কিমায় করা তিনটা আলাদা ভুল বর্ণনা করে, যার প্রত্যেকটা একই বিপর্যয় ঘটায়: একই fact একাধিক জায়গায় গিয়ে বসে, আর সময়ের সাথে সেই কপিগুলো সিঙ্ক থেকে সরে যায়।

এই চ্যাপ্টারটা হলো কর্মজীবী ইঞ্জিনিয়ারের normalization — তিনটা নিয়ম, প্রত্যেকটা কী ঠেকায়, আর কখন (chapter 5) আপনি ইচ্ছাকৃতভাবে এগুলো ভাঙেন।

<Callout type="info">

**বাস্তব-জীবনের উদাহরণ**

একটা সুসংগঠিত recipe বই যেখানে প্রতিটা উপকরণ একবার করে আসে — "butter"-কে "unsalted butter"-এ বদলান একটা জায়গায়, প্রতিটা recipe-তে নয়।

</Callout>

## normalization যে রোগটা ঠেকায়

এই টেবিলটা দেখুন:

```
order_id | customer_name | customer_email      | product_name  | product_price
---------|---------------|---------------------|---------------|---------------
1001     | Sumayya       | sumayya@example.com | Notebook      | 12.00
1002     | Aisha         | aisha@example.com   | Pen Set       | 8.00
1003     | Sumayya       | sumayya@example.com | Notebook      | 12.00
1004     | Sumayya       | SUMAYYA@example.com | Notebook      | 13.00
```

তিনটা সমস্যা লুকিয়ে আছে:

1. **Sumayya-র email তিনবার রেকর্ড হয়েছে।** সে যখন এটা বদলায়, প্রতিটা row আপনাকে আপডেট করতে হবে। একটা মিস করলেই → drift।
2. **Notebook-এর দাম দুবার 12.00, একবার 13.00 হিসেবে রেকর্ড হয়েছে।** কোনটা ঠিক? হয়তো row 1004-এ একটা typo। হয়তো order-এর মাঝে দাম বদলেছে। স্কিমা বলতে পারে না।
3. **Sumayya-র নাম আলাদা case-এ একাধিকবার আসে।** "Sumayya" বনাম অন্য casing। "customer অনুযায়ী order" aggregate করতে ম্যানুয়াল cleanup লাগে।

un-normalized স্কিমা এমনই দেখতে। প্রতিটা ডুপ্লিকেট একটা ভবিষ্যৎ bug।

সমাধান: **প্রতিটা fact ঠিক একটা জায়গায় থাকে।** এটাই normalization।

## 1NF — atomic column, কোনো repeating group নেই

**First Normal Form:** প্রতিটা column একটা মাত্র value ধরে, কোনো list বা structure নয়। প্রতিটা row একটা flat tuple।

খারাপ:

```
user_id | name  | phone_numbers
--------|-------|-----------------------
1       | Sumayya | 555-1234, 555-5678
2       | Aisha | 555-9999
```

`phone_numbers` হলো একটা column-এ ঠেসে ঢোকানো একটা list। "এই phone-ওয়ালা user" query করতে `LIKE '%555-1234%'` লাগে — ধীর, error-prone (substring match হয়), প্রতি number-এ কোনো validation নেই।

ঠিক করা:

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE phones (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number  TEXT NOT NULL,
  PRIMARY KEY (user_id, number)
);
```

প্রতিটা phone number নিজের একটা row। "phone দিয়ে user খোঁজো" এখন একটা পরিষ্কার WHERE clause। একটা phone number যোগ করা একটা INSERT। format validate করা প্রতি number-এ প্রযোজ্য।

অন্যান্য 1NF violation:

- Pipe-delimited string: `tags = 'red|fast|new'`। একটা tag টেবিল ব্যবহার করুন বা সাবধানে একটা আসল `tags TEXT[]` array (Postgres-নির্দিষ্ট)।
- Numbered column: `phone_1`, `phone_2`, `phone_3`। list-টা unbounded নয়; phone 4 হলে কী হবে?
- একটা ছোট struct ধরে রাখা single column: `address = '123 Main St, NY, 10001'`। প্রতিটা component নিজের একটা column বা নিজের একটা টেবিল হওয়া উচিত।

ব্যতিক্রম: **JSONB**। Postgres আপনাকে structured ডেটা JSONB হিসেবে store করতে দেয়। সেটা 1NF violation নয় যদি JSONB-কে opaque হিসেবে ধরা হয় (একসাথে stored, একক হিসেবে queried)। এটা violation হয়ে যায় যদি আপনি ভেতরের field-এ filter, index, আর join করতে শুরু করেন — তখন ডেটা column-এ normalize হতে চায়। Chapter 9 এটা বিস্তারিতভাবে কভার করে।

## 2NF — প্রতিটা non-key column _পুরো_ key-এর উপর নির্ভর করে

**Second Normal Form** শুধু তখনই গুরুত্বপূর্ণ যখন আপনার একটা _composite_ primary key থাকে। নিয়মটা: প্রতিটা non-key column পুরো key-এর উপর নির্ভর করতে হবে, key-এর অংশমাত্রের উপর নয়।

একটা course-enrollment টেবিল কল্পনা করুন:

```sql
CREATE TABLE enrollments (
  student_id     BIGINT NOT NULL,
  course_id      BIGINT NOT NULL,
  enrolled_at    TIMESTAMPTZ NOT NULL,
  student_name   TEXT NOT NULL,    -- depends on student_id only
  course_title   TEXT NOT NULL,    -- depends on course_id only
  PRIMARY KEY (student_id, course_id)
);
```

PK হলো `(student_id, course_id)`। কিন্তু:

- `student_name` শুধু `student_id`-এর উপর নির্ভর করে — একই student-এর প্রতিটা enrollment নামটা পুনরাবৃত্তি করে।
- `course_title` শুধু `course_id`-এর উপর নির্ভর করে — একই course-এর প্রতিটা enrollment title-টা পুনরাবৃত্তি করে।
- শুধু `enrolled_at` পুরো `(student_id, course_id)` জোড়ার উপর নির্ভর করে।

একজন student নিজের নাম বদলালে, আপনাকে প্রতিটা enrollment row আপডেট করতে হবে। 2NF বলে: আংশিকভাবে নির্ভরশীল attribute-গুলোকে নিজেদের টেবিলে ভাগ করুন।

ঠিক করা:

```sql
CREATE TABLE students (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE courses  (id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL);

CREATE TABLE enrollments (
  student_id  BIGINT NOT NULL REFERENCES students(id),
  course_id   BIGINT NOT NULL REFERENCES courses(id),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, course_id)
);
```

`students.name` একটা জায়গায় থাকে। student-এর নাম বদলানো একটা row update। `enrollments` শুধু enrollment সম্পর্কেই fact বহন করে।

খেয়াল করুন: surrogate key (chapter 3) দিয়ে, 2NF কদাচিৎ সমস্যা হয় — আপনার single-column `id` PK আংশিকভাবে নির্ভরশীল হতে পারে না। 2NF সমস্যা মূলত তখনই দেখা দেয় যখন আপনি composite natural key ব্যবহার করেন।

## 3NF — non-key column _শুধু_ key-এর উপর নির্ভর করে

**Third Normal Form:** non-key column key-এর উপর, পুরো key-এর উপর, আর key ছাড়া আর কিছুরই উপর নির্ভর করতে হবে না। (ক্লাসিক mnemonic।)

3NF হলো _transitive_ dependency নিয়ে — column A নির্ভর করে column B-এর উপর, যেটা নির্ভর করে PK-এর উপর।

খারাপ:

```sql
CREATE TABLE orders (
  id         BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  customer_country_code TEXT NOT NULL,
  customer_country_name TEXT NOT NULL  -- depends on country_code, not order
);
```

`customer_country_name` নির্ভর করে `customer_country_code`-এর উপর, যেটা নির্ভর করে `customer_id`-এর উপর। country-র _নাম_ একটা fact _country_ সম্পর্কে, _order_ সম্পর্কে নয়। একটা country যদি তার display name বদলায় (এটা ঘটে — "Czech Republic" → "Czechia"), সেই country code-ওয়ালা প্রতিটা order আপডেট করতে হবে।

ঠিক করা: country-রা নিজেদের টেবিল পায়।

```sql
CREATE TABLE countries (
  code CHAR(2) PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE customers (
  id           BIGSERIAL PRIMARY KEY,
  country_code CHAR(2) REFERENCES countries(code),
  ...
);

CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  ...
);
```

এখন `country.name` একবার থাকে। customer-এর country code দিয়ে link করে; order-এর country আসে customer-এর মধ্য দিয়ে।

একটা সূক্ষ্মতর 3NF violation: computed value store করা।

```sql
CREATE TABLE invoices (
  id        BIGSERIAL PRIMARY KEY,
  subtotal  NUMERIC NOT NULL,
  tax_rate  NUMERIC NOT NULL,
  total     NUMERIC NOT NULL  -- = subtotal * (1 + tax_rate)
);
```

`total` নির্ভর করে `subtotal` আর `tax_rate`-এর উপর, সরাসরি PK-এর উপর নয়। আরও খারাপ, এটা drift করতে পারে — কেউ যদি `subtotal` আপডেট করে কিন্তু `total` আপডেট করতে ভুলে যায়, তাহলে আপনার inconsistent ডেটা থাকে।

ঠিক করা: এটা store করবেন না। read-এর সময় compute করুন, বা একটা generated column ব্যবহার করুন:

```sql
CREATE TABLE invoices (
  id        BIGSERIAL PRIMARY KEY,
  subtotal  NUMERIC NOT NULL,
  tax_rate  NUMERIC NOT NULL,
  total     NUMERIC GENERATED ALWAYS AS (subtotal * (1 + tax_rate)) STORED
);
```

Generated column স্বয়ংক্রিয়ভাবে পুনরায় compute করে; database নিশ্চিত করে যে এগুলো drift করতে পারে না।

## marketplace উদাহরণের জন্য normalized স্কিমা

1NF, 2NF, 3NF একসাথে রেখে:

```sql
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  email       CITEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  price_cents BIGINT NOT NULL CHECK (price_cents > 0)
);

CREATE TABLE orders (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL REFERENCES products(id),
  quantity    INT NOT NULL CHECK (quantity > 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents > 0),
  PRIMARY KEY (order_id, product_id)
);
```

প্রতিটা fact ঠিক একটা জায়গায় থাকে:

- User identity → `users`।
- Product info → `products`।
- order header → `orders`।
- কী কেনা হয়েছিল → `order_items`।

খেয়াল করুন `order_items.unit_price_cents` **ইচ্ছাকৃতভাবে denormalized** — আপনি ভাবতে পারেন "দাম তো `products`-এ আছে, ডুপ্লিকেট করব কেন?" কারণ order হলো একটা ঐতিহাসিক রেকর্ড। order-এর পরে product-এর দাম বদলালেও, order-এর এখনো প্রতিফলিত করা উচিত customer কী পরিশোধ করেছিল। আমরা chapter 5-এ এতে ফিরে আসব।

## যখন normalization আপনার প্রয়োজনের সাথে সংঘর্ষে জড়ায়

তিনটা সৎ টানাপোড়েন:

**1. JOIN CPU আর read খরচ করে।** কঠোর 3NF মানে প্রতিটা query অনেক টেবিল join করে। hot read path-এর জন্য, এটা বাস্তব performance-এর ব্যাপার। যেখানে measure করেন সেখানে denormalize করুন (chapter 5)।

**2. কিছু ডেটা ঐতিহাসিক হওয়া দরকার।** "এই order-এর সময় user-এর address কী ছিল?" খাঁটি-3NF বলে "user-এর বর্তমান address দেখো" — কিন্তু order-এর পর থেকে address বদলে গেছে। জরুরি ডেটা order-এর ভেতরেই snapshot করুন।

**3. মডেলকে load-এর নিচে বিকশিত হতে হয়।** একটা hot টেবিলে একটা column যোগ করা সস্তা; একটা টেবিলকে তিনটায় ভাগ করা একটা বড় migration। বাস্তবসম্মত স্কিমা প্রায়ই চলতি অবস্থায় কিছু 3NF violation রেখে দেয়।

এগুলো normalization এড়ানোর কারণ নয়। এগুলো হলো _কেন_ আপনি ভাঙছেন সেটা জানার কারণ, যখন ভাঙছেন।

<Callout type="tip">

**Default হিসেবে 3NF। ইচ্ছাকৃতভাবে ভাঙুন।** বেশিরভাগ স্কিমা 3NF-এ শুরু হওয়া উচিত। যখন আপনি এমন একটা read প্যাটার্ন measure করেন যা অতিরিক্ত খরচ করে, সেই নির্দিষ্ট column denormalize করুন। বৃদ্ধাঙ্গুষ্ঠের নিয়ম: slow query plan না দেখা পর্যন্ত কখনো denormalize করবেন না।

</Callout>

## উচ্চতর normal form নিয়ে কী

**4NF, 5NF, 6NF, BCNF** বাস্তব আর একাডেমিক। এরা multi-valued dependency আর join dependency ঘিরে edge case সামলায়। বাস্তবে:

- ৯৯% স্কিমার শুধু 1NF, 2NF, 3NF দরকার।
- আপনি যদি নিজেকে এমন একটা জটিল অবস্থায় পান যা 3NF সামলাতে পারে না, প্রায় সবসময়ই আপনার একটা ভুল-শনাক্ত করা entity আছে (chapter 2) — সেটা ঠিক করলে 4NF/5NF-এর দুশ্চিন্তা মিটে যায়।
- BCNF মূলত "কঠোরতর 3NF" — একই intuition, বাস্তবে কদাচিৎ গুরুত্বপূর্ণ।

একজন senior ইঞ্জিনিয়ার যদি বলেন "এটা একটা 4NF violation," দশবারের মধ্যে নয়বার তার মানে "তোমার একটা polymorphic relationship আছে যেটা ভাগ করা উচিত।" এটাকে design feedback হিসেবে নিন, normalization theorem হিসেবে নয়।

## সবচেয়ে সংক্ষিপ্ত সারাংশ

- **1NF**: প্রতিটা cell একটা value ধরে।
- **2NF**: প্রতিটা non-key column _পুরো_ key-এর উপর নির্ভর করে।
- **3NF**: প্রতিটা non-key column শুধু key-এর উপর নির্ভর করে, আরেকটা column-এর উপর নয়।

এক বাক্যে: _প্রতিটা fact ঠিক একটা জায়গায় থাকে, তার primary key দিয়ে শনাক্ত করা।_

## একটা normalization workflow

একটা নতুন টেবিল ডিজাইন করার সময়, জিজ্ঞেস করুন:

1. **কোনো column কি একটা list, comma-separated, বা numbered (1NF)?** একটা child টেবিলে ভাগ করুন।
2. **PK কি composite, আর কোনো column কি এর অংশমাত্রের উপর নির্ভর করে (2NF)?** সেই column-কে নিজের টেবিলে সরান।
3. **কোনো non-key column কি এই row ছাড়া অন্য কিছু বর্ণনা করে (3NF)?** সেটাকে সেই জিনিসের টেবিলে সরান।
4. **কোনো column কি অন্যগুলো থেকে computable?** একটা generated column ব্যবহার করুন বা read-এর সময় compute করুন।

এই চারটা প্রশ্নে বিশ সেকেন্ড ship করার আগেই বেশিরভাগ violation ধরে ফেলে।

## রিক্যাপ

- Normalization ডুপ্লিকেট fact দূর করে। ডুপ্লিকেট → drift → bug।
- 1NF: atomic column। কোনো list নেই, comma-separated নেই, numbered column নেই।
- 2NF: composite PK-তে, প্রতিটা non-key column পুরো PK-এর উপর নির্ভর করে।
- 3NF: কোনো transitive dependency নেই। Country-র নাম country-তে থাকে, order-এ নয়।
- Generated column drift করতে পারে এমন computed value store করা এড়ায়।
- ৯৯% স্কিমার শুধু 1NF–3NF দরকার। উচ্চতর form = ভুল-শনাক্ত করা entity।
- Default হিসেবে 3NF; measurement দাবি করলে ইচ্ছাকৃতভাবে ভাঙুন।

পরবর্তী: [Denormalization](/notes/data-modeling/05-denormalization) — কখন, কেন, আর যে bookkeeping এটা বাধ্য করে।
