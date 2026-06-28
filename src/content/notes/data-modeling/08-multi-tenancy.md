---
title: 'Multi-tenancy'
subtitle: 'Three architectures for serving many customers from one app: single database with a tenant column, schema per tenant, or a database per tenant. Each has a different cost curve.'
chapter: 8
level: 'intermediate'
readingTime: '12 min'
topics: ['data-modeling', 'multi-tenancy', 'rls', 'isolation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A multi-tenant app is one where many customers (tenants) share the same application code, but each customer's data is isolated from others. Slack, Notion, Linear, GitHub Organisations — all multi-tenant. The decision of _how_ to isolate happens at the data layer, and it's hard to reverse later.

This chapter is the three architectures, when each fits, and the gotchas that haunt every one.

<Callout type="info">

**Real-World Analogy**

An apartment building where each tenant has their own space but shares the same plumbing and electricity.

</Callout>

## The three architectures

|                       | Single DB, tenant column            | Schema-per-tenant               | DB-per-tenant                |
| --------------------- | ----------------------------------- | ------------------------------- | ---------------------------- |
| Tenants share         | one table                           | one database, separate schemas  | nothing                      |
| Isolation             | row-level                           | schema-level                    | physical                     |
| Onboarding cost       | INSERT                              | CREATE SCHEMA + tables          | provision DB                 |
| Backup granularity    | all tenants together                | per schema (pg_dump)            | per database                 |
| Query complexity      | every query needs `WHERE tenant_id` | search_path or schema-qualified | none (each DB is one tenant) |
| Per-tenant migrations | impossible — all on same shape      | possible                        | trivial                      |
| Scale ceiling (rows)  | tens of millions per tenant ok      | a few hundred tenants           | thousands of tenants         |
| Cost per tenant       | $0                                  | small                           | large                        |

Most modern SaaS uses single-DB with a tenant column. It's the cheapest, simplest, and scales remarkably far. The other two are special cases.

## Pattern 1: single DB, `tenant_id` column

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

Every tenant-scoped table has a `tenant_id`. Every query filters by it:

```sql
SELECT * FROM issues WHERE tenant_id = $1 AND project_id = $2;
```

### Why include `tenant_id` on every child table

You might think: "issues already join through `projects.tenant_id`. Why duplicate?"

Three reasons:

1. **Indexing.** A `(tenant_id, created_at)` index supports "list this tenant's recent issues" without joining.
2. **Sharding readiness.** If you ever shard by tenant, every row needs the tenant marker on it.
3. **Defense in depth.** A bug that joins wrong is a data leak. `WHERE tenant_id = $1` repeated everywhere is a redundancy that catches mistakes.

The cost: every INSERT must set it. A FK constraint helps:

```sql
CREATE TABLE issues (
  ...
  tenant_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  FOREIGN KEY (tenant_id, project_id) REFERENCES projects(tenant_id, project_id)
);
```

Composite FK ensures `issues.tenant_id` matches the parent project's `tenant_id`. Now you can't insert a tenant-mismatched issue even by accident.

### Querying every tenant scope

The repeating `WHERE tenant_id = $1` is the boring-but-critical part. Two strategies for not forgetting it:

**A. Repository / data-access layer.** Every query goes through a function that takes `tenantID` as the first argument:

```go
func (r *IssueRepo) List(ctx context.Context, tenantID int64) ([]*Issue, error) {
    rows, err := r.db.QueryContext(ctx,
        `SELECT id, project_id, title FROM issues WHERE tenant_id = $1`,
        tenantID,
    )
    ...
}
```

If `tenantID` is the first arg of every method, code review catches anything that doesn't have it.

**B. Row-Level Security (Postgres-specific).** Postgres can enforce the filter automatically.

```sql
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON issues
  USING (tenant_id = current_setting('app.tenant_id')::bigint);
```

Set `app.tenant_id` per request:

```go
db.Exec("SET LOCAL app.tenant_id = $1", tenantID)
```

Now `SELECT * FROM issues` automatically filters to that tenant. Forget the WHERE clause and you still only see your tenant's data.

**RLS is the strongest guarantee but adds operational complexity:** you need to set the GUC at the start of every connection, plus ensure superuser/admin paths bypass it correctly. For most teams, repository discipline is enough; reach for RLS when stakes are high (HIPAA, financial data) or you can't trust every SQL writer.

<Callout type="warn">

**The biggest single-DB risk is cross-tenant leaks via JOIN.** A query that joins on `project_id` without including `tenant_id` can return another tenant's rows if the IDs collide (which they will if you use `BIGSERIAL`). Always include `tenant_id` in JOIN conditions, or wrap them in RLS.

</Callout>

### Per-tenant indexes

A common pattern: indexes prefixed with `tenant_id`.

```sql
CREATE INDEX issues_tenant_created ON issues(tenant_id, created_at DESC);
CREATE INDEX issues_tenant_status ON issues(tenant_id, status);
```

This lets queries like `WHERE tenant_id = X ORDER BY created_at` use index ordering. Without the prefix, the index covers the whole table; with it, you get fast per-tenant scans.

For very large multi-tenant tables, consider **partitioning by tenant range** or by hash:

```sql
CREATE TABLE issues (..., tenant_id BIGINT NOT NULL, ...) PARTITION BY HASH (tenant_id);

CREATE TABLE issues_p0 PARTITION OF issues FOR VALUES WITH (MODULUS 8, REMAINDER 0);
CREATE TABLE issues_p1 PARTITION OF issues FOR VALUES WITH (MODULUS 8, REMAINDER 1);
-- ... up to p7
```

Postgres splits the data across partitions. Queries with `WHERE tenant_id = X` only scan one partition. Helps when one big table holds ~100M+ rows.

## Pattern 2: schema-per-tenant

Each tenant has their own Postgres _schema_ (namespace) inside the same database.

```sql
CREATE SCHEMA tenant_cordoba;
CREATE TABLE tenant_cordoba.issues (id BIGSERIAL PRIMARY KEY, ...);

CREATE SCHEMA tenant_globex;
CREATE TABLE tenant_globex.issues (id BIGSERIAL PRIMARY KEY, ...);
```

To query the right one, set the search path per request:

```go
db.Exec(`SET search_path TO tenant_cordoba, public`)
db.Query(`SELECT * FROM issues`) // hits tenant_cordoba.issues
```

Pros:

- Strong isolation. SQL queries can't accidentally reach another tenant.
- Per-schema `pg_dump` for backups, exports, GDPR-style data extraction.
- Per-tenant data shapes (rare but possible — feature-flagged columns).

Cons:

- **Schema migrations are N times the work.** Adding a column means iterating every schema. Tooling helps; complexity grows.
- **Connection pool considerations.** Search path is a session setting; pools need careful handling.
- **Hard limit on tenant count.** Postgres handles thousands of schemas, but at some point catalog overhead bites.
- **Cross-tenant analytics get harder.** "Total issues across all tenants" needs UNION ALL across schemas.

Used by some Postgres-heavy products (Supabase, Citus). Right when:

- Each tenant is large (mid-market B2B, not consumer SaaS).
- Compliance requires demonstrable per-tenant isolation.
- Tenant count is &lt; ~1000.

## Pattern 3: database-per-tenant

Each tenant gets a separate Postgres database (or even a separate cluster).

Pros:

- Hardest possible isolation. No SQL can cross databases without explicit FDW (foreign data wrapper).
- Per-tenant scaling. Big tenant gets a bigger DB; small tenants share a small one.
- Per-tenant restore from backup is trivial.
- Compliance and data residency: customer can host their own DB; your app connects.

Cons:

- **Operational cost is high.** Provisioning, monitoring, backing up, upgrading N databases.
- **Migrations are even more work** than schema-per-tenant.
- **Cross-tenant queries are essentially impossible.** Analytics need a separate aggregation layer.
- **Cost per tenant is real.** Postgres has overhead per database (memory, file descriptors). Free tier customers + DB-per-tenant doesn't work economically.

Right when:

- B2B with very large customers (each tenant is a meaningful enterprise account).
- Strict isolation requirements (banking, healthcare for some jurisdictions).
- Tenants pay enough to cover the per-tenant DB cost.

## Hybrid patterns

Real systems often mix:

- **Single DB by default; DB-per-tenant for premium customers.** Free and pro tiers share; enterprise tier gets isolation. Stripe, Auth0 do variants of this.
- **Single DB sharded by tenant range.** Tenants 1–10000 on cluster A; 10001–20000 on cluster B. Looks like single-DB but scales horizontally.
- **Schema-per-tenant for hot data; single-DB for cold data.** Rare, complicated.

If you are starting fresh, start single-DB with `tenant_id`. Migrate up if and when scale or compliance demands.

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

The first is one row. The second is a few hundred milliseconds. The third can be minutes. The cost compounds at signup volume.

## The biggest design pitfall: forgetting `tenant_id` early

Adding `tenant_id` to a table that already has data is painful:

1. Add nullable column.
2. Backfill — for existing data, _what tenant does it belong to?_
3. NOT NULL constraint.
4. Update every query.
5. Add indexes.

Step 2 is the killer. If you started single-tenant and converted, every existing row has to be assigned to a tenant. That's a project, not a migration.

The lesson: **if there's any chance you'll be multi-tenant, design for it from day one.** Even if there's only one tenant for the first year, having `tenant_id` everywhere means converting to multi-tenant is just code (add new tenant rows, route requests). Without it, the conversion is a database transformation.

## Tenant deletion (right to be forgotten)

Single-DB: a series of DELETEs scoped to `tenant_id`. Mild.

Schema-per-tenant: `DROP SCHEMA tenant_cordoba CASCADE`. Clean.

DB-per-tenant: `DROP DATABASE tenant_cordoba`. Cleanest.

For compliance-heavy industries, the "drop the whole schema/db" cleanup story is a real selling point.

## Recap

- Three architectures: single DB with `tenant_id`, schema-per-tenant, DB-per-tenant.
- Default: single DB with `tenant_id`. Cheapest, simplest, scales surprisingly far.
- Always include `tenant_id` on every tenant-scoped table — even children. Defense in depth, sharding-ready.
- Use composite FKs to prevent tenant mismatch.
- RLS for the strongest single-DB guarantee; repository discipline is usually enough.
- Prefix indexes with `tenant_id` for fast per-tenant scans.
- Schema-per-tenant for isolation and per-tenant exports; expect migration complexity.
- DB-per-tenant for enterprise-only or strict compliance; expect ops overhead.
- Hybrid (single + DB-per-tenant for top tier) is real and common.
- Design for multi-tenancy from day one. Adding `tenant_id` later is a project.

Next: [JSONB and the schemaless trap](/notes/data-modeling/09-jsonb) — when to use JSONB and when it bites.
