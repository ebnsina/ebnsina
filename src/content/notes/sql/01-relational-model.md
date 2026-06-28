---
title: 'The Relational Model & Basic Queries'
subtitle: 'Tables, rows, columns, types — and the SELECT statement that pulls data back out.'
chapter: 1
level: 'beginner'
readingTime: '14 min'
topics: ['select', 'relational model', 'ddl']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Relational Model

A relational database stores data in **tables** (formally, _relations_). A table is a grid:

- A **row** (or _tuple_) is a single record — one user, one order, one event.
- A **column** (or _attribute_) describes one property every row has — a name, a price, a created timestamp.
- Every column has a **data type** that constrains what values it can hold.

The model dates to Edgar Codd's 1970 paper, and its power comes from a simple idea: data is just sets of rows, and you describe _what_ you want rather than _how_ to fetch it. The database figures out the "how".

A table called `users` might look like this:

| id  | email               | age | created_at          |
| --- | ------------------- | --- | ------------------- |
| 1   | lubna@example.com   | 36  | 2026-01-04 09:12:00 |
| 2   | nusayba@example.com | 41  | 2026-02-18 14:30:00 |
| 3   | harun@example.com   |     | 2026-03-01 08:00:00 |

Notice row 3 has no `age` — that empty cell is a `NULL`, which we'll return to.

## Data Types

Picking the right type matters: it controls storage size, what operations are valid, and how the database sorts and compares values. Common PostgreSQL types:

| Type                   | Use for                                        |
| ---------------------- | ---------------------------------------------- |
| `integer` / `bigint`   | Whole numbers, IDs, counts                     |
| `numeric(p, s)`        | Exact decimals — money, never use `float` here |
| `text` / `varchar(n)`  | Strings                                        |
| `boolean`              | True/false flags                               |
| `date` / `timestamptz` | Dates and timezone-aware timestamps            |
| `uuid`                 | Globally unique identifiers                    |
| `jsonb`                | Semi-structured documents                      |

<Callout type="warning">

**Never store money in floating point.** `float` and `double` can't represent values like `0.1` exactly, so totals drift by fractions of a cent. Use `numeric` (also called `decimal`) for any value where exactness matters.

</Callout>

## Creating a Table (DDL)

Statements that define structure — `CREATE`, `ALTER`, `DROP` — are called **DDL** (Data Definition Language).

```sql
CREATE TABLE users (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      text NOT NULL UNIQUE,
  age        integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Breaking this down:

- `PRIMARY KEY` marks `id` as the unique identifier for each row; it's automatically `NOT NULL` and indexed.
- `GENERATED ALWAYS AS IDENTITY` makes Postgres assign sequential ids for you.
- `NOT NULL` forbids missing values for that column.
- `UNIQUE` forbids two rows sharing the same email.
- `DEFAULT now()` fills `created_at` automatically when you don't supply it.

Inserting rows uses **DML** (Data Manipulation Language):

```sql
INSERT INTO users (email, age) VALUES
  ('lubna@example.com', 36),
  ('nusayba@example.com', 41),
  ('harun@example.com', NULL);
```

## SELECT: Reading Data

The `SELECT` statement is how you ask questions. Its basic shape:

```sql
SELECT email, age
FROM users
WHERE age > 30
ORDER BY age DESC
LIMIT 10;
```

Each clause does one job:

- **`SELECT`** — which columns to return. `SELECT *` returns all of them (handy interactively, but spell out columns in application code so adding a column later doesn't surprise you).
- **`FROM`** — which table to read.
- **`WHERE`** — a filter; only rows where the condition is true come back.
- **`ORDER BY`** — sort order, `ASC` (default) or `DESC`.
- **`LIMIT`** — cap the number of rows returned.

### Filtering with WHERE

`WHERE` conditions combine comparisons with `AND`, `OR`, and `NOT`:

```sql
SELECT * FROM users
WHERE age >= 18 AND age < 65;

SELECT * FROM users
WHERE email LIKE '%@example.com';

SELECT * FROM users
WHERE age IN (36, 41, 50);

SELECT * FROM users
WHERE created_at BETWEEN '2026-01-01' AND '2026-03-31';
```

When you compare a column to a literal — say, "give me everyone younger than 30" — that's `WHERE age &lt; 30` in prose, but inside a code block you'd just write `age < 30` normally. `LIKE` does pattern matching where `%` means "any sequence of characters".

### DISTINCT

`DISTINCT` removes duplicate rows from the result:

```sql
SELECT DISTINCT age FROM users ORDER BY age;
```

This returns each distinct age once. `DISTINCT` applies to the whole selected row, so `SELECT DISTINCT age, email` deduplicates on the _combination_ of both columns.

## NULL Semantics

`NULL` means "unknown" or "absent" — it is _not_ zero, and it is _not_ an empty string. This trips up nearly everyone at first because `NULL` does not behave like a value in comparisons.

Any comparison _with_ `NULL` yields `NULL` (which is treated as "not true"), so:

```sql
SELECT * FROM users WHERE age = NULL;   -- returns ZERO rows, always
SELECT * FROM users WHERE age <> 25;    -- excludes NULL-age rows!
```

To test for null you must use the special `IS` operators:

```sql
SELECT * FROM users WHERE age IS NULL;
SELECT * FROM users WHERE age IS NOT NULL;
```

<Callout type="info">

**`NULL` is contagious in arithmetic too.** `5 + NULL` is `NULL`, and `'hi' || NULL` is `NULL`. Use `COALESCE(age, 0)` to substitute a fallback value when a column might be null — it returns the first non-null argument.

</Callout>

A practical consequence: if you want "everyone whose age is not 25, _including_ people with unknown age", you need to be explicit:

```sql
SELECT * FROM users WHERE age <> 25 OR age IS NULL;
```

## Recap

You now have the foundation: tables hold typed rows, DDL defines them, and `SELECT` with `WHERE` / `ORDER BY` / `LIMIT` reads them back. Keep the `NULL` rules in mind — they're the source of more subtle bugs than any other feature. Next we'll summarize many rows into single answers with aggregation.
