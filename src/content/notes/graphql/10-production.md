---
title: 'Production hardening এবং self-host'
subtitle: "Depth limit, complexity limit, persisted query, error sanitisation, federation, আর পুরো self-hosted nginx deploy। 'আমার laptop-এ চলে' আর 'বৈরী internet-এ টিকে থাকে' — এই দুইয়ের মাঝের সবকিছু।"
chapter: 10
level: 'advanced'
readingTime: '16 মিনিট'
topics: ['graphql', 'security', 'performance', 'federation', 'nginx', 'deployment']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

internet-এ exposed একটা GraphQL endpoint একটা শক্তিশালী primitive — client তোমার schema-র যেকোনো কিছু চাইতে পারে। এটাই পুরো pitch আর এটাই threat model। এই chapter সেই lever-গুলো ঘুরে দেখায় যেগুলো তোমাকে টানতে হবে একটা domain-কে port 4000-এ point করে ঘুমাতে যাওয়ার আগে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

GraphQL production-hardening করা অনেকটা একটা prototype আর একটা production গাড়ির পার্থক্যের মতো — একই আকৃতি, কিন্তু reliability-র সম্পূর্ণ ভিন্ন মান।

</Callout>

## গল্পে বুঝি

কর্ডোবার বিশাল লাইব্রেরির প্রধান লাইব্রেরিয়ান ফাতিমা একটা মজার ব্যবস্থা চালু করেছিলেন — সামনে একটা অনুসন্ধান ডেস্ক, যেখানে যে কেউ এসে ঠিক যা চায় তা-ই চাইতে পারে: "এই বইয়ের লেখক, তার আরেকটা বই, সেটার অনুবাদক, তার শিক্ষক, তার শিক্ষকের বই…"। নমনীয়, কিন্তু বিপজ্জনকও। একদিন এক দুষ্টু পাঠক এমন একটা অনুরোধ লিখল যেটা "বন্ধুর বন্ধুর বন্ধুর…" এভাবে অসীমভাবে চেন হয়ে গেল — একটা মাত্র চিরকুট, অথচ পুরো লাইব্রেরির কর্মীরা তা জোগাড় করতেই সারাদিন আটকে গেল। বাকি সবাই লাইনে দাঁড়িয়ে রইল।

তাই ফাতিমা কিছু ঘরোয়া নিয়ম টাঙিয়ে দিলেন। এক, কোনো অনুরোধ কত স্তর গভীরে যেতে পারবে তার একটা সীমা — "বন্ধুর বন্ধু" পর্যন্ত ঠিক আছে, তার বেশি নয়। আর কোনো একটা চিরকুট সব মিলিয়ে কতটা ভারী হতে পারে (দশ হাজার বইয়ের তালিকা এক অনুরোধে নয়) তারও একটা ওজনসীমা। দুই, একজন পাঠক মিনিটে কয়টা চিরকুট জমা দিতে পারবে তা বেঁধে দিলেন, যাতে একজন এসে ডেস্ক দখল করে না রাখে। তিন, অচেনা লোকদের হাতে পুরো ভেতরের ক্যাটালগ-ম্যাপ আর দিলেন না — কোথায় কী তাক আছে তা কর্মীরা জানে, বাইরের কেউ নয়। আর চার, সবচেয়ে বেশি জিজ্ঞেস করা প্রশ্নগুলোর (আজকের নতুন বই, জনপ্রিয় লেখক) উত্তর আগেই লিখে ডেস্কের সামনে ঝুলিয়ে রাখলেন — বারবার তাক পর্যন্ত হাঁটতে হয় না।

এই নিয়মগুলোই আসলে GraphQL-এর production hardening। "বন্ধুর বন্ধু" পর্যন্ত গভীরতার সীমা হলো **query depth limit**, আর এক চিরকুটের সর্বোচ্চ ওজন হলো **complexity limit** — এই দুটো মিলে অসীম-nested বা বিশাল-চওড়া abusive query আটকায়। মিনিটে কয়টা চিরকুট — সেটাই **rate limiting**, একজন client যেন পুরো server দখল না করে। ভেতরের ক্যাটালগ-ম্যাপ লুকিয়ে রাখা হলো production-এ **introspection disable** করা — attacker যেন পুরো schema টেনে না নেয়। আর ঝুলিয়ে রাখা রেডি উত্তরগুলো হলো **caching**, যাতে ঘনঘন লাগা answer বারবার হিসাব করতে না হয়। বাস্তবে ঠিক এভাবেই একটা internet-facing GraphQL endpoint সুরক্ষিত হয়: নমনীয়তা রাখো, কিন্তু চারপাশে house-rules বসাও — নইলে একটা দুষ্টু query-ই তোমার পুরো server ধসিয়ে দেবে।

## Threat model

একটা চতুর বা বৈরী client তিন শ্রেণির ক্ষতি করতে পারে:

1. **depth-এর মাধ্যমে resource exhaustion.** `{ user { posts { author { posts { author { ... } } } } } }` — একটা single query যা এক মিলিয়ন row ছুঁয়ে ফেলে।
2. **complexity-র মাধ্যমে resource exhaustion.** একটা query যা অগভীর কিন্তু চওড়া — `{ users(first: 10000) { posts(first: 1000) { ... } } }` — মিলিয়ন মিলিয়ন resolver call।
3. **introspection-এর মাধ্যমে data exfiltration.** পুরো schema টেনে নেওয়া, তারপর public doc-এ উল্লেখ নেই এমন field খুঁজে বেড়ানো।

তুমি প্রতিটি আলাদাভাবে defend করো। কোনোটাই optional নয়।

## Depth limiting

nesting depth cap করো। বাস্তব legitimate query খুব কমই depth 7 বা 8 ছাড়ায়।

```bash
npm install graphql-depth-limit
```

```js
import depthLimit from 'graphql-depth-limit';

const yoga = createYoga({
	schema,
	validationRules: [depthLimit(10)]
});
```

10-এর চেয়ে গভীর query কোনো resolver চলার আগেই validation-এ fail করে। compute করা সস্তা, খুব কার্যকর। তুমি যে limit বাছবে তা তোমার schema-র উপর নির্ভর করে — এক সপ্তাহ query depth log করো, 99th percentile-এর ঠিক উপরে limit সেট করো।

## Complexity (cost) limiting

depth একা চওড়া query ধরে না। Complexity প্রতিটি field-এ একটা cost দেয়; একটা query-র মোট cost একটা budget-এর নিচে থাকতে হবে।

```bash
npm install graphql-query-complexity
```

```js
import { createComplexityRule, simpleEstimator } from 'graphql-query-complexity';

const yoga = createYoga({
	schema,
	validationRules: [
		createComplexityRule({
			maximumComplexity: 1000,
			estimators: [simpleEstimator({ defaultComplexity: 1 })],
			onComplete: (cost) => {
				/* log to metrics */
			}
		})
	]
});
```

expensive field-গুলোকে schema-তে বেশি cost দিয়ে annotate করো (directive-এর মাধ্যমে) বা custom estimator-এর মাধ্যমে। যে field একটা paginated list return করে সেটা `first` দিয়ে cost scale করে:

```js
const fieldEstimator = ({ args, childComplexity }) => {
	const first = args.first ?? 20;
	return first * (childComplexity || 1);
};
```

এখন `users(first: 1000) { posts(first: 100) { title } }` হলো `1000 * 100 = 100_000` — budget-এর অনেক উপরে, rejected।

## Production-এ introspection disable করো

Introspection হলো সেই জাদু যা GraphiQL-কে চালায়। এটা এমন একটা path-এ একটা public schema dump-ও যা বেশিরভাগ attacker দেখতে জানে।

```js
import { createYoga, useDisableIntrospection } from 'graphql-yoga';

const yoga = createYoga({
	schema,
	graphiql: process.env.NODE_ENV !== 'production',
	plugins: [process.env.NODE_ENV === 'production' ? useDisableIntrospection() : null].filter(
		Boolean
	)
});
```

কিছু team tooling-এর জন্য production-এ introspection চালু রাখে। যদি রাখো, এটা auth-এর পেছনে gate করো — `__schema` allow করার আগে token একটা trusted client (তোমার নিজের frontend, তোমার team-এর IDE) থেকে কিনা verify করো।

## Persisted queries

GraphQL hardening-এর শিখর। arbitrary query গ্রহণ করার বদলে, শুধু query _ID_ গ্রহণ করো যা known query-তে map করে।

flow-টা:

1. build time-এ, তোমার client প্রতিটি GraphQL query extract করে আর তার hash compute করে। `hash → query` map করে আর map-টা server-এ পাঠায়।
2. runtime-এ, client query string-এর বদলে `{ id: "abc123", variables: {...} }` পাঠায়।
3. server ID দিয়ে query lookup করে। Unknown ID reject হয়।

graphql-yoga-তে একটা plugin আছে (`@graphql-yoga/plugin-persisted-operations`):

```js
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations';
import operations from './persisted-operations.json'; // built from your client

const yoga = createYoga({
	schema,
	plugins: [
		usePersistedOperations({
			getPersistedOperation: (key) => operations[key],
			allowArbitraryOperations: process.env.NODE_ENV !== 'production'
		})
	]
});
```

সুবিধাগুলো একসাথে জমে ওঠে:

- **ছোট request** — client একটা 4 KB query-র বদলে একটা 64-byte hash পাঠায়।
- **কোনো depth/complexity attack surface নেই** — প্রতিটি গৃহীত query তুমি নিজে লিখেছ।
- **`GET` হিসেবে cacheable** — query ID URL-এর অংশ; nginx আর CDN নিরাপদে cache করতে পারে।
- **schema usage tracking** — তুমি জানো কোন query live; deprecation concrete হয়।

public API-র জন্য persisted query একটা কঠিন প্রয়োজন। internal বা first-party-র জন্য, এটা একটা জমতে থাকা win যা তোমাকে depth/complexity limit বাড়াতে দেয়।

## Error sanitisation

production-এ `errors[]`-এ stack trace, SQL string, বা internal identifier ফাঁস কোরো না।

```js
import { useMaskedErrors } from '@envelop/core';

const yoga = createYoga({
	schema,
	plugins: [
		useMaskedErrors({
			maskError: (error, message) => {
				if (error?.extensions?.code === 'GRAPHQL_VALIDATION_FAILED') return error;
				if (error?.extensions?.exposed) return error;
				// unknown errors: hide
				console.error('Unhandled GraphQL error:', error);
				return new GraphQLError('Internal server error', {
					extensions: { code: 'INTERNAL_SERVER_ERROR' }
				});
			}
		})
	]
});
```

তুমি `extensions.exposed = true` (বা একটা known code) দিয়ে throw করা যেকোনো `GraphQLError` পাস হয়ে যায়। বাকি সব "Internal server error" হয়ে যায়। আসল error তোমার log-এ যায়; client পরিচ্ছন্ন response দেখে।

## Logging এবং observability

প্রতি request-এ তিনটা জিনিস log করার:

1. **Query identity.** persisted query-র জন্য, query ID। arbitrary query-র জন্য, operation name + query string-এর প্রথম 200 char।
2. **Variables (PII redacted সহ).** Variable তোমাকে বলে client কী চেয়েছিল।
3. **Per-field timing.** OpenTelemetry plugin (`@envelop/opentelemetry`) resolver-গুলোকে স্বয়ংক্রিয়ভাবে instrument করে; তুমি প্রতি request-এ একটা flame chart পাও।

self-hosted-এর জন্য, **Loki + Grafana** (log) আর **Tempo** বা **Jaeger** (trace)-এ pipe করো। তিনটাই container-এ চলে, সব free, সব OpenTelemetry support করে। পুরো setup path-এর **Observability** chapter-এ আছে।

Log উদাহরণ:

```
graphql op=GetUser dur=12ms persisted=true user=42 status=ok
graphql op=Search dur=890ms persisted=false user=42 status=err code=COMPLEXITY_EXCEEDED
```

## Federation — এক-অনুচ্ছেদের version

Apollo Federation একাধিক GraphQL service-কে একটা schema-তে compose করতে দেয়। প্রতিটি service graph-এর একটা অংশের মালিক; একটা **router** প্রতিটি field-কে সঠিক service-এ route করে query stitch করে।

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

`{ user(id: 1) { name posts { title } } }`-এর একটা query router-এ hit করে; router `name`-এর জন্য users service call করে, `posts`-এর জন্য posts service call করে, ফলাফল stitch করে।

self-hosted-এর জন্য: **Apollo Router** (Rust binary, ELv2-এর অধীনে free open-source — license পড়ো) বা **Hive Gateway** (আরও permissive)। Federation তখনই অর্থপূর্ণ যখন তোমার আলাদা codebase সহ অনেক team আছে। **এক team-এর জন্য federation একটা overhead** — একটা schema রাখো, resolver code-টাকে domain অনুযায়ী ভাগ করো।

আরেকটা path হলো **schema stitching** — পুরনো, কম rigorous, কিন্তু সরল। graphql-tools এটা দেয়। Apollo আর Hive দুটোই এর ওপার চলে গেছে; শুধু উল্লেখ করছি কারণ কিছু legacy graph এখনো এটা ব্যবহার করে।

## nginx-এর পেছনে graphql-yoga deploy করা

একটা বাস্তব self-hosted setup, একটা fresh VPS-এ:

**1. একটা systemd service হিসেবে চালাও।**

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

**2. এর সামনে nginx।**

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

TLS snippet (`tls-strong.conf`) **TLS & Certificates** track থেকে। body-size limit বিশাল query আটকায়; তুমি যদি GraphQL-এর মাধ্যমে file upload গ্রহণ করো, এটা উপযুক্তভাবে বাড়াও।

**3. Health check.**

graphql-yoga default-এ `/health` expose করে। nginx এটা probe করতে পারে:

```nginx
upstream graphql {
  server 127.0.0.1:4000 max_fails=3 fail_timeout=10s;
  keepalive 32;
}
```

multi-instance-এর জন্য, ভিন্ন port-এ একাধিক Node process চালাও (প্রতি CPU core-এ একটা বা তার কাছাকাছি), প্রতিটি upstream-এ। nginx round-robin করে।

## Multi-process — Node-এর একটা core

Node single-threaded। প্রতি process-এ সর্বোচ্চ এক CPU core। production Node service একাধিক process চালায় — প্রতি core-এ একটা, nginx upstream-এর পেছনে:

```js
import cluster from 'node:cluster';
import os from 'node:os';

if (cluster.isPrimary) {
	for (let i = 0; i < os.cpus().length; i++) cluster.fork();
} else {
	// start server (use a port from env, e.g. 4000 + WORKER_INDEX)
	startServer();
}
```

অথবা cluster বাদ দাও: systemd (`graphql@.service` template)-এর মাধ্যমে N port-এ N কপি চালাও, nginx-কে সবগুলোতে point করো। পরেরটা horizontally scale করে (পরে তুমি কিছু worker আরেকটা box-এ সরাতে পারো)।

## Edge-এ caching

Persisted query GraphQL-কে `GET`-able আর cacheable করে তোলে। nginx `proxy_cache`:

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

public query (no auth) 30 সেকেন্ডের জন্য cache হয়; একই client cached response পায়। Auth token cache key-র অংশ হয়ে যায় — ভিন্ন user ভিন্ন cache পায়। **Web Server Fundamentals**-এর **edge caching** chapter-এ পুরো pattern আছে।

## Backup এবং migration

graph stateless; database নয়। **databases self-hosted** track `pg_dump`, point-in-time recovery, আর migration-এর গল্প cover করে। production-এ যাওয়ার আগে এটা ধরো।

<Callout type="info">

**Cost-of-ownership বাস্তবতা।** $10/month-এর একটা VPS-এ একটা self-hosted GraphQL server persisted query enabled থাকলে সহজেই মাসে কয়েক কোটি query সামলায়। managed service থেকে দূরে থাকার cost discipline টাকায় আর নিজের system চালানোর muscle memory — দুই দিকেই লাভ দেয়।

</Callout>

## একটা pre-launch checklist

একটা domain point করার আগে:

- [ ] Depth limit সেট করা (সাধারণত ≤ 10)।
- [ ] Complexity limit সেট করা, paginated estimator সহ।
- [ ] production-এ introspection disabled (বা auth-gated)।
- [ ] first-party client-এর জন্য persisted query enabled; prod-এ arbitrary op disabled।
- [ ] Error masking on; শুধু known error ফাঁস হয়।
- [ ] CSRF prevention header on (`graphql-yoga` default-এ এটা করে)।
- [ ] `login` আর অন্যান্য expensive mutation-এ rate limiting।
- [ ] `Restart=on-failure` সহ systemd unit।
- [ ] TLS + strong cipher suite সহ nginx reverse proxy।
- [ ] subscription থাকলে WebSocket Upgrade header আর দীর্ঘ `proxy_read_timeout`।
- [ ] Log journal বা Loki-তে piped।
- [ ] OpenTelemetry trace enabled।
- [ ] nginx probe সহ Health check `/health`।
- [ ] CI-তে DB backup + migration runner।

box-এর অর্ধেক unchecked থাকলে তুমি ready নও। একটা দিন খরচ করো। internet ধৈর্য ধরবে না।

## সারসংক্ষেপ

- Depth আর complexity limit — public exposure-এর আগে must-have।
- gate না করলে production-এ introspection disable করো।
- Persisted query সবচেয়ে শক্তিশালী hardening lever; একটা build step থাকলেই এটা গ্রহণ করো।
- Error mask করো। আসলগুলো log-এ যায়, client-এ নয়।
- Federation আলাদা codebase সহ অনেক team-এর জন্য। এক team: একটা schema-ই ঠিক আছে।
- systemd + nginx + একাধিক Node process দিয়ে চালাও। WebSocket-এর দীর্ঘ timeout দরকার।
- TLS, cache, observability — সব আগের path track থেকে।
- Pre-launch checklist নয়তো এটা তোমাকে কামড়াবে।

এটাই পুরো Backend Engineering Path-এর GraphQL track। path-এর পরবর্তী topic: [gRPC building](/notes/grpc) — যখন REST আর GraphQL সঠিক আকৃতি নয় আর তুমি service-এর মধ্যে একটা typed RPC চাও।
