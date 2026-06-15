---
title: "Production hardening and self-host"
subtitle: "Depth limits, complexity limits, persisted queries, error sanitisation, federation, and the full self-hosted nginx deploy. Everything between 'works on my laptop' and 'survives a hostile internet.'"
chapter: 10
level: "advanced"
readingTime: "16 min"
topics: ["graphql", "security", "performance", "federation", "nginx", "deployment"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A GraphQL endpoint exposed to the internet is a powerful primitive — clients can ask for anything in your schema. That is the whole pitch and also the threat model. This chapter walks the levers you need to pull before pointing a domain at port 4000 and going to bed.

<Callout type="info">

**Real-World Analogy**

Production-hardening GraphQL is like the difference between a prototype and a production car — same shape, completely different standards for reliability.

</Callout>

## The threat model

A clever or hostile client can do three categories of damage:

1. **Resource exhaustion via depth.** `{ user { posts { author { posts { author { ... } } } } } }` — a single query that touches a million rows.
2. **Resource exhaustion via complexity.** A query that is shallow but wide — `{ users(first: 10000) { posts(first: 1000) { ... } } }` — millions of resolver calls.
3. **Data exfiltration via introspection.** Pulling the full schema, then probing for fields the public docs don't mention.

You defend each separately. None is optional.

## Depth limiting

Cap nesting depth. Real legitimate queries rarely exceed depth 7 or 8.

```bash
npm install graphql-depth-limit
```

```js
import depthLimit from "graphql-depth-limit";

const yoga = createYoga({
  schema,
  validationRules: [depthLimit(10)],
});
```

Queries deeper than 10 fail validation before any resolver runs. Cheap to compute, very effective. The limit you pick depends on your schema — log query depths for a week, set the limit just above the 99th percentile.

## Complexity (cost) limiting

Depth alone doesn't catch wide queries. Complexity assigns a cost to each field; a query's total cost must stay under a budget.

```bash
npm install graphql-query-complexity
```

```js
import { createComplexityRule, simpleEstimator } from "graphql-query-complexity";

const yoga = createYoga({
  schema,
  validationRules: [
    createComplexityRule({
      maximumComplexity: 1000,
      estimators: [simpleEstimator({ defaultComplexity: 1 })],
      onComplete: (cost) => { /* log to metrics */ },
    }),
  ],
});
```

Annotate expensive fields with higher cost in the schema (via directives) or via custom estimators. A field that returns a paginated list scales cost by `first`:

```js
const fieldEstimator = ({ args, childComplexity }) => {
  const first = args.first ?? 20;
  return first * (childComplexity || 1);
};
```

Now `users(first: 1000) { posts(first: 100) { title } }` is `1000 * 100 = 100_000` — well over budget, rejected.

## Disable introspection in production

Introspection is the magic that powers GraphiQL. It is also a public schema dump on a path most attackers know to look at.

```js
import { createYoga, useDisableIntrospection } from "graphql-yoga";

const yoga = createYoga({
  schema,
  graphiql: process.env.NODE_ENV !== "production",
  plugins: [
    process.env.NODE_ENV === "production" ? useDisableIntrospection() : null,
  ].filter(Boolean),
});
```

Some teams keep introspection on in production for tooling. If you do, gate it behind auth — verify the token is from a trusted client (your own frontend, your team's IDE) before allowing `__schema`.

## Persisted queries

The pinnacle of GraphQL hardening. Instead of accepting arbitrary queries, only accept query *IDs* that map to known queries.

The flow:
1. At build time, your client extracts every GraphQL query and computes its hash. Maps `hash → query` and ships the map to the server.
2. At runtime, clients send `{ id: "abc123", variables: {...} }` instead of the query string.
3. Server looks up the query by ID. Unknown IDs are rejected.

graphql-yoga has a plugin (`@graphql-yoga/plugin-persisted-operations`):

```js
import { usePersistedOperations } from "@graphql-yoga/plugin-persisted-operations";
import operations from "./persisted-operations.json"; // built from your client

const yoga = createYoga({
  schema,
  plugins: [
    usePersistedOperations({
      getPersistedOperation: (key) => operations[key],
      allowArbitraryOperations: process.env.NODE_ENV !== "production",
    }),
  ],
});
```

The benefits compound:

- **Smaller requests** — clients send a 64-byte hash, not a 4 KB query.
- **No depth/complexity attack surface** — every accepted query was authored by you.
- **Cacheable as `GET`** — query ID is part of the URL; nginx and CDN can cache safely.
- **Schema usage tracking** — you know which queries are live; deprecation is concrete.

For public APIs, persisted queries are a hard requirement. For internal or first-party, they are a compounding win that lets you raise depth/complexity limits.

## Error sanitisation

In production, do not leak stack traces, SQL strings, or internal identifiers in `errors[]`.

```js
import { useMaskedErrors } from "@envelop/core";

const yoga = createYoga({
  schema,
  plugins: [
    useMaskedErrors({
      maskError: (error, message) => {
        if (error?.extensions?.code === "GRAPHQL_VALIDATION_FAILED") return error;
        if (error?.extensions?.exposed) return error;
        // unknown errors: hide
        console.error("Unhandled GraphQL error:", error);
        return new GraphQLError("Internal server error", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      },
    }),
  ],
});
```

Any `GraphQLError` you throw with `extensions.exposed = true` (or a known code) passes through. Anything else becomes "Internal server error." Real errors go to your logs; clients see clean responses.

## Logging and observability

Three things to log per request:

1. **Query identity.** For persisted queries, the query ID. For arbitrary queries, the operation name + first 200 chars of the query string.
2. **Variables (with PII redacted).** Variables tell you what the client asked for.
3. **Per-field timings.** OpenTelemetry plugin (`@envelop/opentelemetry`) instruments resolvers automatically; you get a flame chart per request.

For self-hosted, pipe to **Loki + Grafana** (logs) and **Tempo** or **Jaeger** (traces). All three run in containers, all are free, all support OpenTelemetry. The full setup is in the path's **Observability** chapter.

Log examples:

```
graphql op=GetUser dur=12ms persisted=true user=42 status=ok
graphql op=Search dur=890ms persisted=false user=42 status=err code=COMPLEXITY_EXCEEDED
```

## Federation — the one-paragraph version

Apollo Federation lets multiple GraphQL services compose into one schema. Each service owns part of the graph; a **router** stitches queries by routing each field to the right service.

```graphql
# users service
type User @key(fields: "id") {
  id: ID!
  name: String!
}

# posts service — extends User without owning it
extend type User @key(fields: "id") {
  id: ID! @external
  posts: [Post!]!
}

type Post @key(fields: "id") {
  id: ID!
  title: String!
  author: User!
}
```

A query for `{ user(id: 1) { name posts { title } } }` hits the router; the router calls users service for `name`, calls posts service for `posts`, stitches the result.

For self-hosted: **Apollo Router** (Rust binary, free open-source under ELv2 — read the license) or **Hive Gateway** (more permissive). Federation makes sense when you have many teams with separate codebases. **For one team, federation is overhead** — keep one schema, split the resolver code by domain.

The other path is **schema stitching** — older, less rigorous, but simpler. graphql-tools provides it. Both Apollo and Hive moved past it; mention only because some legacy graphs still use it.

## Deploying graphql-yoga behind nginx

A real self-hosted setup, on a fresh VPS:

**1. Run as a systemd service.**

```ini
# /etc/systemd/system/graphql.service
[Unit]
Description=GraphQL API
After=network.target postgresql.service

[Service]
Type=simple
User=app
WorkingDirectory=/opt/graphql
EnvironmentFile=/etc/graphql/env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now graphql
journalctl -u graphql -f
```

**2. nginx in front of it.**

```nginx
upstream graphql {
  server 127.0.0.1:4000;
  keepalive 32;
}

server {
  listen 443 ssl http2;
  server_name api.example.com;

  ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
  include /etc/nginx/snippets/tls-strong.conf;

  client_max_body_size 1m;

  location /graphql {
    proxy_pass http://graphql;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket upgrade
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  location / { return 404; }
}

map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}
```

The TLS snippet (`tls-strong.conf`) is from the **TLS & Certificates** track. The body-size limit prevents giant queries; if you accept file uploads through GraphQL, raise it appropriately.

**3. Health check.**

graphql-yoga exposes `/health` by default. nginx can probe it:

```nginx
upstream graphql {
  server 127.0.0.1:4000 max_fails=3 fail_timeout=10s;
  keepalive 32;
}
```

For multi-instance, run multiple Node processes (one per CPU core or thereabouts) on different ports, each in upstream. nginx round-robins.

## Multi-process — Node has one core

Node is single-threaded. One CPU core max per process. Production Node services run multiple processes — one per core, behind nginx upstream:

```js
import cluster from "node:cluster";
import os from "node:os";

if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) cluster.fork();
} else {
  // start server (use a port from env, e.g. 4000 + WORKER_INDEX)
  startServer();
}
```

Or skip cluster: run N copies via systemd (`graphql@.service` template) on N ports, point nginx at all of them. The latter scales horizontally (you can move some workers to another box later).

## Caching at the edge

Persisted queries make GraphQL `GET`-able and cacheable. nginx `proxy_cache`:

```nginx
proxy_cache_path /var/cache/nginx/graphql levels=1:2 keys_zone=graphql:10m max_size=1g;

location /graphql {
  proxy_cache graphql;
  proxy_cache_methods GET;
  proxy_cache_key "$request_method$request_uri$http_authorization";
  proxy_cache_valid 200 30s;
  proxy_pass http://graphql;
  add_header X-Cache-Status $upstream_cache_status;
}
```

Public queries (no auth) cache for 30 seconds; same client gets the cached response. Auth tokens become part of the cache key — different users get different caches. The **edge caching** chapter of **Web Server Fundamentals** has the full pattern.

## Backups and migrations

The graph is stateless; the database is not. The **databases self-hosted** track covers `pg_dump`, point-in-time recovery, and the migration story. Reach for it before you go to production.

<Callout type="info">

**Cost-of-ownership reality.** A self-hosted GraphQL server on a $10/month VPS handles tens of millions of queries per month easily, with persisted queries enabled. The cost discipline of staying off managed services pays in both money and the muscle memory of operating your own systems.

</Callout>

## A pre-launch checklist

Before pointing a domain:

- [ ] Depth limit set (≤ 10 typically).
- [ ] Complexity limit set, with paginated estimators.
- [ ] Introspection disabled in production (or auth-gated).
- [ ] Persisted queries enabled for first-party clients; arbitrary ops disabled in prod.
- [ ] Error masking on; only known errors leak.
- [ ] CSRF prevention header on (`graphql-yoga` does this by default).
- [ ] Rate limiting on `login` and other expensive mutations.
- [ ] systemd unit with `Restart=on-failure`.
- [ ] nginx reverse proxy with TLS + strong cipher suite.
- [ ] WebSocket Upgrade headers and long `proxy_read_timeout` if subscriptions.
- [ ] Logs piped to journal or Loki.
- [ ] OpenTelemetry traces enabled.
- [ ] Health check `/health` with nginx probes.
- [ ] DB backups + migration runner in CI.

If half the boxes are unchecked, you are not ready. Spend the day. The internet will not be patient.

## Recap

- Depth and complexity limits — must-have before public exposure.
- Disable introspection in production unless gated.
- Persisted queries are the strongest hardening lever; adopt them as soon as you have a build step.
- Mask errors. Real ones go to logs, not to clients.
- Federation is for many teams with separate codebases. One team: one schema is fine.
- Run with systemd + nginx + multiple Node processes. WebSockets need long timeouts.
- TLS, cache, observability — all from the earlier path tracks.
- Pre-launch checklist or it bites you.

That is the full Backend Engineering Path's GraphQL track. Next topic in the path: [gRPC building](/notes/grpc) — when REST and GraphQL are not the right shape and you want a typed RPC across services.

