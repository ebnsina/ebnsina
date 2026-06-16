---
title: "Normalization"
subtitle: "1NF, 2NF, 3NF — three rules that prevent the same data from being recorded twice. Ignore them and your schema rots from the inside as data drifts out of sync."
chapter: 4
level: "beginner"
readingTime: "12 min"
topics: ["data-modeling", "normalization", "1nf", "2nf", "3nf"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

Normalization sounds like an academic word that maps poorly to engineering reality. It isn't. The three normal forms describe three distinct mistakes you can make in a schema, each of which causes the same disaster: the same fact ends up in multiple places, and over time those copies drift out of sync.

This chapter is the working engineer's normalization — the three rules, what each prevents, and when (chapter 5) you deliberately break them.

<Callout type="info">

**Real-World Analogy**

A well-organized recipe book where each ingredient appears once — change "butter" to "unsalted butter" in one place, not in every recipe.

</Callout>

## The disease normalization prevents

Look at this table:

```
order_id | customer_name | customer_email      | product_name  | product_price
---------|---------------|---------------------|---------------|---------------
1001     | Sumayya       | sumayya@example.com | Notebook      | 12.00
1002     | Aisha         | aisha@example.com   | Pen Set       | 8.00
1003     | Sumayya       | sumayya@example.com | Notebook      | 12.00
1004     | Sumayya       | SUMAYYA@example.com | Notebook      | 13.00
```

Three problems lurking:

1. **Sumayya's email is recorded three times.** When she changes it, you must update every row. Miss one → drift.
2. **Notebook's price is recorded twice as 12.00, once as 13.00.** Which is correct? Maybe a typo on row 1004. Maybe the price changed between orders. The schema can't tell.
3. **Sumayya's name appears multiple times in different cases.** "Sumayya" vs implicit other casings. Aggregating "orders by customer" requires manual cleanup.

This is what un-normalized schemas look like. Every duplicate is a future bug.

The fix: **each fact lives in exactly one place.** That's what normalization is.

## 1NF — atomic columns, no repeating groups

**First Normal Form:** every column holds a single value, not a list or a structure. Every row is a flat tuple.

Bad:

```
user_id | name  | phone_numbers
--------|-------|-----------------------
1       | Sumayya | 555-1234, 555-5678
2       | Aisha | 555-9999
```

`phone_numbers` is a list jammed into one column. Querying "users with this phone" requires `LIKE '%555-1234%'` — slow, error-prone (substring matches), no validation per number.

Fixed:

```sql
CREATE TABLE users (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE phones (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number  TEXT NOT NULL,
  PRIMARY KEY (user_id, number)
);
```

Each phone number is its own row. Query "find user by phone" is now a clean WHERE clause. Adding a phone number is an INSERT. Validating the format applies per number.

Other 1NF violations:

- Pipe-delimited strings: `tags = 'red|fast|new'`. Use a tag table or a real `tags TEXT[]` array (Postgres-specific) with care.
- Numbered columns: `phone_1`, `phone_2`, `phone_3`. The list isn't unbounded; what about phone 4?
- Single column holding a small struct: `address = '123 Main St, NY, 10001'`. Each component should be its own column or its own table.

The exception: **JSONB**. Postgres lets you store structured data as JSONB. That isn't a 1NF violation if the JSONB is treated as opaque (stored together, queried as a unit). It becomes one if you start needing to filter, index, and join on inner fields — at that point the data wants to be normalized into columns. Chapter 9 covers this in detail.

## 2NF — every non-key column depends on the *whole* key

**Second Normal Form** only matters when you have a *composite* primary key. The rule: every non-key column must depend on the entire key, not just part of it.

Imagine a course-enrollments table:

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

The PK is `(student_id, course_id)`. But:

- `student_name` depends on `student_id` alone — every enrollment for the same student repeats the name.
- `course_title` depends on `course_id` alone — every enrollment for the same course repeats the title.
- Only `enrolled_at` depends on the whole `(student_id, course_id)` pair.

If a student renames themselves, you have to update every enrollment row. 2NF says: split the partially-dependent attributes into their own tables.

Fixed:

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

`students.name` lives in one place. Renaming the student is one row update. `enrollments` only carries facts about the enrollment itself.

Note: with surrogate keys (chapter 3), 2NF is rarely an issue — your single-column `id` PK can't be partially dependent on. 2NF problems mostly appear when you use composite natural keys.

## 3NF — non-key columns depend *only* on the key

**Third Normal Form:** non-key columns must depend on the key, the whole key, and nothing but the key. (The classic mnemonic.)

3NF is about *transitive* dependencies — column A depends on column B, which depends on the PK.

Bad:

```sql
CREATE TABLE orders (
  id         BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  customer_country_code TEXT NOT NULL,
  customer_country_name TEXT NOT NULL  -- depends on country_code, not order
);
```

`customer_country_name` depends on `customer_country_code`, which depends on `customer_id`. The country *name* is a fact about the *country*, not about the *order*. If a country changes its display name (this happens — "Czech Republic" → "Czechia"), every order with that country code must be updated.

Fixed: countries get their own table.

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

Now `country.name` lives once. Customer's country links by code; order's country comes through the customer.

A subtler 3NF violation: storing computed values.

```sql
CREATE TABLE invoices (
  id        BIGSERIAL PRIMARY KEY,
  subtotal  NUMERIC NOT NULL,
  tax_rate  NUMERIC NOT NULL,
  total     NUMERIC NOT NULL  -- = subtotal * (1 + tax_rate)
);
```

`total` depends on `subtotal` and `tax_rate`, not directly on the PK. Worse, it can drift — if someone updates `subtotal` but forgets to update `total`, you have inconsistent data.

Fixed: don't store it. Compute on read, or use a generated column:

```sql
CREATE TABLE invoices (
  id        BIGSERIAL PRIMARY KEY,
  subtotal  NUMERIC NOT NULL,
  tax_rate  NUMERIC NOT NULL,
  total     NUMERIC GENERATED ALWAYS AS (subtotal * (1 + tax_rate)) STORED
);
```

Generated columns recompute automatically; the database guarantees they can't drift.

## The normalized schema for the marketplace example

Putting 1NF, 2NF, 3NF together:

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

Each fact lives in exactly one place:
- User identity → `users`.
- Product info → `products`.
- The order header → `orders`.
- What was bought → `order_items`.

Note that `order_items.unit_price_cents` is **deliberately denormalized** — you might think "the price is in `products`, why duplicate?" Because the order is a historical record. If the product price changes after the order, the order should still reflect what the customer paid. We come back to this in chapter 5.

## When normalization conflicts with your needs

Three honest tensions:

**1. JOINs cost CPU and reads.** Strict 3NF means every query joins many tables. For hot read paths, this is real performance. Denormalize where you measure (chapter 5).

**2. Some data needs to be historical.** "What was the user's address at the time of this order?" pure-3NF says "look up the user's current address" — but the address has changed since the order. Snapshot critical data into the order itself.

**3. The model needs to evolve under load.** Adding a column to a hot table is cheap; splitting one table into three is a major migration. Pragmatic schemas often keep some 3NF violations in flight.

These aren't reasons to avoid normalization. They are reasons to know *why* you're breaking it when you break it.

<Callout type="tip">

**Default to 3NF. Break it deliberately.** Most schemas should start at 3NF. When you measure a read pattern that costs too much, denormalize that specific column. The rule of thumb: never denormalize before you've seen the slow query plan.

</Callout>

## What about higher normal forms

**4NF, 5NF, 6NF, BCNF** are real and academic. They handle edge cases around multi-valued dependencies and join dependencies. In practice:

- 99% of schemas only need 1NF, 2NF, 3NF.
- If you find yourself in a knot 3NF can't handle, you almost always have a misidentified entity (chapter 2) — fixing that resolves the 4NF/5NF concern.
- BCNF is essentially "stricter 3NF" — same intuitions, rarely matters in practice.

If a senior engineer says "this is a 4NF violation," nine times out of ten they mean "you've got a polymorphic relationship that should be split." Treat it as design feedback, not a normalization theorem.

## The shortest summary

- **1NF**: each cell holds one value.
- **2NF**: every non-key column depends on the *whole* key.
- **3NF**: every non-key column depends only on the key, not on another column.

In a single sentence: *every fact lives in exactly one place, identified by its primary key.*

## A normalization workflow

When designing a new table, ask:

1. **Is any column a list, comma-separated, or numbered (1NF)?** Split into a child table.
2. **Is the PK composite, and does some column depend on only part of it (2NF)?** Move that column to its own table.
3. **Does any non-key column describe something other than this row (3NF)?** Move it to that thing's table.
4. **Is any column computable from others?** Use a generated column or compute on read.

Twenty seconds of these four questions catches most violations before they ship.

## Recap

- Normalization eliminates duplicate facts. Duplicates → drift → bugs.
- 1NF: atomic columns. No lists, no comma-separated, no numbered columns.
- 2NF: with composite PKs, every non-key column depends on the whole PK.
- 3NF: no transitive dependencies. Country names belong on countries, not orders.
- Generated columns avoid storing computed values that can drift.
- 99% of schemas only need 1NF–3NF. Higher forms = misidentified entities.
- Default to 3NF; break it deliberately when measurements demand.

Next: [Denormalization](/notes/data-modeling/05-denormalization) — when, why, and the bookkeeping it forces.

