---
title: 'Multi-tenancy'
subtitle: 'একটা অ্যাপ থেকে অনেক কাস্টমারকে সার্ভ করার তিনটা আর্কিটেকচার: tenant কলামসহ single database, tenant-প্রতি schema, নাকি tenant-প্রতি database। প্রতিটার cost curve আলাদা।'
chapter: 8
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['data-modeling', 'multi-tenancy', 'rls', 'isolation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমি একটা অ্যাপার্টমেন্ট বিল্ডিং চালান, যেখানে অনেকগুলো আলাদা পরিবার থাকে। সবারই দরকার নিজের জিনিস নিরাপদে রাখা, আর কেউ যেন অন্যের জিনিসে হাত না দেয়। তিনভাবে সাজানো যায়। প্রথম উপায় সবচেয়ে সস্তা — একটাই বড় হল, সবাই একসাথে সেখানে থাকে, তবে প্রতিটা পরিবারের জিনিসে তাদের ফ্ল্যাট নম্বরের ট্যাগ লাগানো, আর নিয়ম হলো নিজের ট্যাগের বাইরে কেউ কারো জিনিস ছোঁবে না। জায়গা কম লাগে, খরচও কম — কিন্তু গোটা নিরাপত্তা ওই একটা নিয়মের উপরই দাঁড়িয়ে। কেউ ভুল করে অন্যের ট্যাগ ধরে ফেললেই গোলমাল।

তাই সিনার পরিবার চাইল আরেকটু আলাদা থাকা — বিল্ডিংয়ের ভেতরেই তাদের নিজস্ব একটা তালাবন্ধ ফ্ল্যাট, চাবি শুধু তাদের কাছে। এখন আর ট্যাগের নিয়মের ভরসায় থাকতে হয় না, দেয়ালই আলাদা করে দেয়। আবার ফাতিমার পরিবার আরও কড়াকড়ি চাইল — তারা নিল একদম আলাদা একটা বাড়ি, নিজের গেট, নিজের সবকিছু। সবচেয়ে নিরাপদ, কিন্তু আলাদা বাড়ির ভাড়া আর দেখভালের খরচও সবচেয়ে বেশি।

এই গল্পটাই আসলে **multi-tenancy**। ট্যাগ লাগানো এক হল = একটা shared table যেখানে `tenant_id` কলাম দিয়ে প্রতিটা tenant-এর ডেটা আলাদা করা হয় (সস্তা, কিন্তু query-র নিয়মের উপর নির্ভরশীল)। প্রতি পরিবারের তালাবন্ধ ফ্ল্যাট = schema-per-tenant, যেখানে দেয়ালই strong isolation দেয়। আর আলাদা বাড়ি = database-per-tenant, সবচেয়ে শক্ত isolation কিন্তু সবচেয়ে খরুচে। যত কড়া আলাদা করা, তত নিরাপদ কিন্তু তত দামি — এটাই isolation-বনাম-cost tradeoff। বাস্তবে Slack, Notion, GitHub-এর মতো SaaS প্রোডাক্ট ঠিক এভাবেই এক কোডবেস থেকে হাজারো কাস্টমারকে সার্ভ করে, আর প্রতিটা কাস্টমার কত বড় তার উপর ভিত্তি করে এই তিনটার একটা বেছে নেয়।

একটা multi-tenant অ্যাপ হলো যেখানে অনেক কাস্টমার (tenant) একই application কোড শেয়ার করে, কিন্তু প্রতিটা কাস্টমারের ডেটা অন্যদের থেকে isolated। Slack, Notion, Linear, GitHub Organisations — সবই multi-tenant। _কীভাবে_ isolate করবেন সেই সিদ্ধান্তটা ডেটা লেয়ারে হয়, আর পরে সেটা রিভার্স করা কঠিন।

এই চ্যাপ্টারটা হলো তিনটা আর্কিটেকচার, কখন কোনটা মানানসই, আর যে gotcha-গুলো প্রতিটাকে তাড়া করে বেড়ায়।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা অ্যাপার্টমেন্ট বিল্ডিং যেখানে প্রতিটা tenant-এর নিজের জায়গা আছে কিন্তু একই plumbing আর বিদ্যুৎ শেয়ার করে।

</Callout>

## তিনটা আর্কিটেকচার

|                      | Single DB, tenant কলাম                | Schema-per-tenant               | DB-per-tenant            |
| -------------------- | ------------------------------------- | ------------------------------- | ------------------------ |
| Tenant যা শেয়ার করে | একটা টেবিল                            | একটা database, আলাদা schema     | কিছুই না                 |
| Isolation            | row-level                             | schema-level                    | physical                 |
| Onboarding খরচ       | INSERT                                | CREATE SCHEMA + টেবিল           | DB provision             |
| Backup granularity   | সব tenant একসাথে                      | schema-প্রতি (pg_dump)          | database-প্রতি           |
| Query complexity     | প্রতি query-তে `WHERE tenant_id` লাগে | search_path বা schema-qualified | নেই (প্রতি DB এক tenant) |
| Per-tenant migration | অসম্ভব — সবাই একই আকৃতিতে             | সম্ভব                           | তুচ্ছ                    |
| Scale সীমা (রো)      | tenant-প্রতি কয়েক কোটি ঠিক আছে       | কয়েকশো tenant                  | হাজার হাজার tenant       |
| Tenant-প্রতি খরচ     | $0                                    | কম                              | বেশি                     |

বেশিরভাগ আধুনিক SaaS একটা tenant কলামসহ single-DB ব্যবহার করে। এটাই সবচেয়ে সস্তা, সবচেয়ে সহজ, আর অসাধারণ দূর পর্যন্ত scale করে। বাকি দুটো special case।

## Pattern 1: single DB, `tenant_id` কলাম

```sql
CREATE TABLE projects (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  BIGINT NOT NULL REFERENCES tenants(id),
  name       TEXT NOT NULL,
  ...
);

CREATE TABLE issues (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  BIGINT NOT NULL,
  project_id BIGINT NOT NULL REFERENCES projects(id),
  ...
);
```

প্রতিটা tenant-scoped টেবিলে একটা `tenant_id` থাকে। প্রতিটা query সেটা দিয়ে filter করে:

```sql
SELECT * FROM issues WHERE tenant_id = $1 AND project_id = $2;
```

### প্রতিটা child টেবিলে `tenant_id` রাখেন কেন

আপনি ভাবতে পারেন: "issues তো ইতিমধ্যে `projects.tenant_id` দিয়ে join হয়। ডুপ্লিকেট করবেন কেন?"

তিনটা কারণ:

1. **Indexing.** একটা `(tenant_id, created_at)` index join না করেই "এই tenant-এর সাম্প্রতিক issue দেখাও" সাপোর্ট করে।
2. **Sharding readiness.** আপনি কখনও tenant দিয়ে shard করলে প্রতিটা row-এ tenant মার্কার লাগবে।
3. **Defense in depth.** যে বাগ ভুল join করে সেটা একটা data leak। সবখানে বারবার `WHERE tenant_id = $1` একটা redundancy যা ভুল ধরে ফেলে।

খরচটা: প্রতিটা INSERT-এ এটা সেট করতে হয়। একটা FK constraint সাহায্য করে:

```sql
CREATE TABLE issues (
  ...
  tenant_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, project_id)
);
```

Composite FK নিশ্চিত করে যে `issues.tenant_id` প্যারেন্ট project-এর `tenant_id`-এর সাথে মেলে। এখন আপনি ভুলেও একটা tenant-mismatched issue insert করতে পারবেন না।

### প্রতিটা tenant scope query করা

বারবার `WHERE tenant_id = $1` লেখাটা বিরক্তিকর-কিন্তু-critical অংশ। এটা না-ভোলার দুটো কৌশল:

**A. Repository / data-access লেয়ার।** প্রতিটা query এমন একটা function দিয়ে যায় যা প্রথম আর্গুমেন্ট হিসেবে `tenantID` নেয়:

```go
func (r *IssueRepo) List(ctx context.Context, tenantID int64) ([]*Issue, error) {
    rows, err := r.db.QueryContext(ctx,
        `SELECT id, project_id, title FROM issues WHERE tenant_id = $1`,
        tenantID,
    )
    ...
}
```

`tenantID` যদি প্রতিটা method-এর প্রথম আর্গুমেন্ট হয়, তাহলে code review যেটাতে সেটা নেই সেটা ধরে ফেলে।

**B. Row-Level Security (Postgres-specific)।** Postgres filter-টা অটোমেটিক enforce করতে পারে।

```sql
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON issues
  USING (tenant_id = current_setting('app.tenant_id')::bigint);
```

প্রতি request-এ `app.tenant_id` সেট করুন:

```go
db.Exec("SET LOCAL app.tenant_id = $1", tenantID)
```

এখন `SELECT * FROM issues` অটোমেটিক সেই tenant-এ filter করে। WHERE clause ভুলে গেলেও আপনি শুধু আপনার tenant-এর ডেটাই দেখবেন।

**RLS হলো সবচেয়ে শক্ত গ্যারান্টি কিন্তু operational জটিলতা যোগ করে:** প্রতিটা connection-এর শুরুতে GUC সেট করতে হয়, প্লাস superuser/admin path যাতে সঠিকভাবে এটা bypass করে সেটা নিশ্চিত করতে হয়। বেশিরভাগ টিমের জন্য repository discipline যথেষ্ট; stake বেশি হলে (HIPAA, financial ডেটা) বা প্রতিটা SQL writer-কে বিশ্বাস করতে না পারলে RLS-এর দিকে যান।

<Callout type="warn">

**single-DB-র সবচেয়ে বড় ঝুঁকি হলো JOIN দিয়ে cross-tenant leak।** যে query `tenant_id` না রেখে `project_id`-এ join করে সেটা অন্য tenant-এর row রিটার্ন করতে পারে যদি ID collide করে (যা করবেই যদি আপনি `BIGSERIAL` ব্যবহার করেন)। JOIN condition-এ সবসময় `tenant_id` রাখুন, বা RLS দিয়ে মুড়ে দিন।

</Callout>

### Per-tenant index

একটা কমন প্যাটার্ন: `tenant_id` দিয়ে prefix করা index।

```sql
CREATE INDEX issues_tenant_created ON issues(tenant_id, created_at DESC);
CREATE INDEX issues_tenant_status ON issues(tenant_id, status);
```

এটা `WHERE tenant_id = X ORDER BY created_at`-এর মতো query-কে index ordering ব্যবহার করতে দেয়। prefix ছাড়া index পুরো টেবিল cover করে; এর সাথে আপনি দ্রুত per-tenant scan পান।

খুব বড় multi-tenant টেবিলের জন্য **tenant range** বা hash দিয়ে **partitioning** ভাবুন:

```sql
CREATE TABLE issues (..., tenant_id BIGINT NOT NULL, ...) PARTITION BY HASH (tenant_id);

CREATE TABLE issues_p0 PARTITION OF issues FOR VALUES WITH (MODULUS 8, REMAINDER 0);
CREATE TABLE issues_p1 PARTITION OF issues FOR VALUES WITH (MODULUS 8, REMAINDER 1);
-- ... up to p7
```

Postgres ডেটা partition-এ ভাগ করে দেয়। `WHERE tenant_id = X` সহ query শুধু একটা partition scan করে। যখন একটা বড় টেবিলে ~100M+ row থাকে তখন সাহায্য করে।

## Pattern 2: schema-per-tenant

প্রতিটা tenant-এর একই database-এর ভেতরে নিজের Postgres _schema_ (namespace) থাকে।

```sql
CREATE SCHEMA tenant_cordoba;
CREATE TABLE tenant_cordoba.issues (id BIGSERIAL PRIMARY KEY, ...);

CREATE SCHEMA tenant_globex;
CREATE TABLE tenant_globex.issues (id BIGSERIAL PRIMARY KEY, ...);
```

ঠিকটা query করতে প্রতি request-এ search path সেট করুন:

```go
db.Exec(`SET search_path TO tenant_cordoba, public`)
db.Query(`SELECT * FROM issues`) // hits tenant_cordoba.issues
```

সুবিধা:

- শক্তিশালী isolation। SQL query ভুলেও অন্য tenant-এ পৌঁছাতে পারে না।
- backup, export, GDPR-স্টাইল ডেটা extraction-এর জন্য schema-প্রতি `pg_dump`।
- Per-tenant ডেটা shape (বিরল কিন্তু সম্ভব — feature-flagged কলাম)।

অসুবিধা:

- **Schema migration N গুণ কাজ।** একটা কলাম যোগ করা মানে প্রতিটা schema-তে iterate করা। tooling সাহায্য করে; জটিলতা বাড়ে।
- **Connection pool বিবেচনা।** Search path একটা session সেটিং; pool-এর সতর্ক হ্যান্ডলিং লাগে।
- **Tenant সংখ্যায় শক্ত সীমা।** Postgres হাজার হাজার schema সামলায়, কিন্তু কোনো এক পর্যায়ে catalog overhead কামড় দেয়।
- **Cross-tenant analytics কঠিন হয়ে যায়।** "সব tenant মিলিয়ে মোট issue"-র জন্য schema জুড়ে UNION ALL লাগে।

কিছু Postgres-heavy প্রোডাক্ট (Supabase, Citus) এটা ব্যবহার করে। ঠিক যখন:

- প্রতিটা tenant বড় (mid-market B2B, consumer SaaS নয়)।
- Compliance-এর জন্য প্রমাণযোগ্য per-tenant isolation দরকার।
- Tenant সংখ্যা ~1000-এর &lt; কম।

## Pattern 3: database-per-tenant

প্রতিটা tenant একটা আলাদা Postgres database (বা এমনকি আলাদা cluster) পায়।

সুবিধা:

- সম্ভাব্য সবচেয়ে শক্ত isolation। explicit FDW (foreign data wrapper) ছাড়া কোনো SQL database পার হতে পারে না।
- Per-tenant scaling। বড় tenant বড় DB পায়; ছোট tenant-রা একটা ছোট DB শেয়ার করে।
- backup থেকে per-tenant restore তুচ্ছ।
- Compliance আর data residency: কাস্টমার নিজের DB host করতে পারে; আপনার অ্যাপ connect করে।

অসুবিধা:

- **Operational খরচ বেশি।** N-টা database provision, monitor, backup, upgrade করা।
- **Migration schema-per-tenant-এর চেয়েও বেশি কাজ।**
- **Cross-tenant query মূলত অসম্ভব।** Analytics-এর জন্য আলাদা aggregation লেয়ার লাগে।
- **Tenant-প্রতি খরচ বাস্তব।** Postgres-এর প্রতিটা database-এ overhead আছে (memory, file descriptor)। Free tier কাস্টমার + DB-per-tenant অর্থনৈতিকভাবে কাজ করে না।

ঠিক যখন:

- খুব বড় কাস্টমারসহ B2B (প্রতিটা tenant একটা অর্থবহ enterprise account)।
- কঠোর isolation প্রয়োজন (banking, কিছু এখতিয়ারে healthcare)।
- Tenant-রা per-tenant DB খরচ পোষানোর মতো যথেষ্ট টাকা দেয়।

## Hybrid প্যাটার্ন

বাস্তব সিস্টেম প্রায়ই মেশায়:

- **ডিফল্টে single DB; premium কাস্টমারের জন্য DB-per-tenant।** Free আর pro tier শেয়ার করে; enterprise tier isolation পায়। Stripe, Auth0 এর ভ্যারিয়েন্ট করে।
- **Tenant range দিয়ে sharded single DB।** Tenant 1–10000 cluster A-তে; 10001–20000 cluster B-তে। দেখতে single-DB-র মতো কিন্তু horizontally scale করে।
- **Hot ডেটার জন্য schema-per-tenant; cold ডেটার জন্য single-DB।** বিরল, জটিল।

আপনি নতুন শুরু করলে `tenant_id` সহ single-DB দিয়ে শুরু করুন। scale বা compliance দাবি করলে তখন উপরে migrate করুন।

## Tenant onboarding flow

Single-DB:

```sql
INSERT INTO tenants(name, plan) VALUES('Cordoba', 'pro') RETURNING id;
-- done
```

Schema-per-tenant:

```sql
CREATE SCHEMA tenant_cordoba;
-- replay schema migrations against the new schema
SELECT migrate_to('tenant_cordoba');
INSERT INTO tenants_meta(name, schema_name) VALUES('Cordoba', 'tenant_cordoba');
```

DB-per-tenant:

```bash
createdb tenant_cordoba
psql tenant_cordoba < schema.sql
# update tenant routing service
```

প্রথমটা একটা row। দ্বিতীয়টা কয়েকশো মিলিসেকেন্ড। তৃতীয়টা মিনিট হতে পারে। signup ভলিউমে খরচটা জমতে থাকে।

## সবচেয়ে বড় ডিজাইন ফাঁদ: শুরুতে `tenant_id` ভুলে যাওয়া

ইতিমধ্যেই ডেটা আছে এমন টেবিলে `tenant_id` যোগ করা যন্ত্রণাদায়ক:

1. Nullable কলাম যোগ করুন।
2. Backfill — বিদ্যমান ডেটার জন্য, _এটা কোন tenant-এর?_
3. NOT NULL constraint।
4. প্রতিটা query আপডেট করুন।
5. Index যোগ করুন।

Step 2-ই killer। আপনি single-tenant দিয়ে শুরু করে convert করে থাকলে প্রতিটা বিদ্যমান row-কে একটা tenant-এ assign করতে হবে। সেটা একটা project, migration নয়।

শিক্ষাটা: **আপনি multi-tenant হবেন এমন সামান্য সম্ভাবনা থাকলেও প্রথম দিন থেকেই সেটার জন্য ডিজাইন করুন।** প্রথম বছর একটাই tenant থাকলেও, সবখানে `tenant_id` থাকা মানে multi-tenant-এ convert করা নিছক কোড (নতুন tenant row যোগ করা, request route করা)। এটা ছাড়া conversion একটা database transformation।

## Tenant deletion (right to be forgotten)

Single-DB: `tenant_id`-এ scoped কয়েকটা DELETE। মৃদু।

Schema-per-tenant: `DROP SCHEMA tenant_cordoba CASCADE`। পরিচ্ছন্ন।

DB-per-tenant: `DROP DATABASE tenant_cordoba`। সবচেয়ে পরিচ্ছন্ন।

Compliance-heavy শিল্পের জন্য "পুরো schema/db drop করে দাও" cleanup গল্পটা একটা আসল selling point।

## রিক্যাপ

- তিনটা আর্কিটেকচার: `tenant_id` সহ single DB, schema-per-tenant, DB-per-tenant।
- ডিফল্ট: `tenant_id` সহ single DB। সবচেয়ে সস্তা, সবচেয়ে সহজ, অবাক করা দূর পর্যন্ত scale করে।
- প্রতিটা tenant-scoped টেবিলে সবসময় `tenant_id` রাখুন — এমনকি child-এও। Defense in depth, sharding-ready।
- Tenant mismatch ঠেকাতে composite FK ব্যবহার করুন।
- সবচেয়ে শক্ত single-DB গ্যারান্টির জন্য RLS; সাধারণত repository discipline-ই যথেষ্ট।
- দ্রুত per-tenant scan-এর জন্য index-কে `tenant_id` দিয়ে prefix করুন।
- Isolation আর per-tenant export-এর জন্য schema-per-tenant; migration জটিলতা আশা করুন।
- Enterprise-only বা কঠোর compliance-এর জন্য DB-per-tenant; ops overhead আশা করুন।
- Hybrid (top tier-এর জন্য single + DB-per-tenant) বাস্তব আর কমন।
- প্রথম দিন থেকে multi-tenancy-র জন্য ডিজাইন করুন। পরে `tenant_id` যোগ করা একটা project।

পরবর্তী: [JSONB আর schemaless ফাঁদ](/notes/data-modeling/09-jsonb) — কখন JSONB ব্যবহার করবেন আর কখন এটা কামড় দেয়।
