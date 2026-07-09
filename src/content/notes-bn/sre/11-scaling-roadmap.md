---
title: 'Scaling & Distributed Systems — 8-Week Companion Roadmap'
subtitle: 'শূন্য থেকে scalable system ডিজাইন, বিল্ড আর অপারেট করা পর্যন্ত। দিনে 1–2 ঘণ্টা, 8 সপ্তাহ, 8টি বাস্তব project, 5টি case study, mini-YouTube capstone।'
chapter: 11
level: 'beginner'
readingTime: '25 মিনিট'
topics: ['scaling', 'distributed systems', 'roadmap', 'capstone', 'system design']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জগতের উদাহরণ**

একটা construction schedule — প্রতি সপ্তাহের কাজ আগের সপ্তাহের উপর নির্ভর করে, foundation জমাট বাঁধার আগে আপনি ছাদ ঢালতে পারবেন না, আর শেষের capstone-টা শুধু তখনই অর্থপূর্ণ কারণ তার নিচের সবকিছু মজবুত।

</Callout>

## এই roadmap-টা কী

একটা দ্বিতীয় 8-সপ্তাহের plan, fullstack-to-SRE roadmap-এর পরিপূরক। SRE roadmap যেখানে production **অপারেট** করার উপর মনোযোগ দেয় (SLO, on-call, postmortem), এটা সেখানে যে scalable system-গুলো আপনি অপারেট করবেন সেগুলো **বিল্ড** করার উপর মনোযোগ দেয়: networking primitive, load balancing, replication, caching, queue, distributed-systems theory, container, observability, আর একটা বাস্তব capstone।

আপনার gap-এর সাথে যেটা মেলে সেই roadmap বেছে নিন। অনেক learner এগুলো ক্রমান্বয়ে চালায় — আগে scaling দিয়ে system বিল্ড করে, পরে SRE দিয়ে সেটা অপারেট করে।

```
8 weeks   ·   8 real projects   ·   5+ case studies   ·   1–2 h/day
```

<Callout type="info">

**Pacing**

এই roadmap সপ্তাহে 15–18 ঘণ্টার বদলে দিনে 1–2 ঘণ্টা গতিতে সাজানো। এটা SRE roadmap-এর চেয়ে নরম আর একটা full-time job-এর পরে সন্ধ্যায় পড়ার জন্য বানানো। কোনো project লম্বা হলে একটা সপ্তাহ বাড়ানোর জন্য প্রস্তুত থাকুন; সেটা ঠিক আছে — schedule মেনে চলার চেয়ে গভীরতা বেশি গুরুত্বপূর্ণ।

</Callout>

## সূচিপত্র

```
Phase 1 — Foundation (Weeks 1–2)
  W01  How the internet & servers actually work
  W02  Load balancing, reverse proxies & failover

Phase 2 — Core Scaling Concepts (Weeks 3–5)
  W03  Databases, replication & sharding
  W04  Caching strategies & message queues
  W05  Distributed systems theory

Phase 3 — Real-World Scaling (Weeks 6–8)
  W06  Containers, horizontal scaling & service discovery
  W07  Observability, resilience & failure patterns
  W08  Capstone — design & build a real scalable system
```

---

## Phase 1 — Foundation (Weeks 1–2)

### Week 01 — internet আর server আসলে কীভাবে কাজ করে

**Topics**

- DNS resolution — কীভাবে একটা hostname একটা IP address হয়ে ওঠে
- TCP/IP handshake — কীভাবে দুটো মেশিন একটা connection স্থাপন করে
- HTTP/1.1 vs HTTP/2 vs HTTP/3 — কী বদলাল আর কেন
- একটা server process আসলে কী — socket, file descriptor, accept loop
- Linux fundamentals — process, thread, file I/O, networking tool (netstat, ss, curl, dig)
- Blocking vs non-blocking I/O — কেন Node.js 10k connection সামলায় আর Apache আটকে যায়

**Key concepts**

`TCP 3-way handshake` · `DNS TTL` · `OSI model` · `file descriptors` · `epoll / kqueue` · `keep-alive` · `TLS termination`

**Resources**

- Hussein Nasser — _Fundamentals of Networking_ (YouTube)
- roadmap.sh/devops
- Linux Journey — linuxjourney.com (free)
- _High Performance Browser Networking_ — Ilya Grigorik (free online)

**Case study — Cloudflare কীভাবে সেকেন্ডে 100M+ request সামলায়**

তারা epoll ব্যবহার করে প্রতি CPU core-এ একটা single event loop চালায়, thread context switching পুরোপুরি এড়িয়ে চলে, আর edge-এ TLS terminate করে। আপনি Nginx চালালে একই নীতি প্রযোজ্য — এটা একই non-blocking architecture ব্যবহার করে।

**Weekly project — শূন্য থেকে Mini HTTP server**

যেকোনো language-এ (Node.js, Python, Go) একটা basic HTTP server বানান যেটা block না করে concurrent connection সামলায়। এটা আপনাকে বুঝতে বাধ্য করে Nginx আসলে under the hood কী করে।

1. একটা TCP socket খুলুন, port 8080-এ bind করুন, connection-এর জন্য listen করুন
2. একটা raw HTTP GET request parse করুন (method, path, header)
3. একটা valid HTTP/1.1 response দিয়ে সাড়া দিন (status line + header + body)
4. 100টি concurrent connection সামলান — কোথায় ভাঙে মাপুন
5. keep-alive support যোগ করুন — tcpdump-এ connection reuse লক্ষ্য করুন
6. `wrk` দিয়ে আপনার server বনাম Nginx benchmark করুন — req/sec পার্থক্য রেকর্ড করুন

**Deliverable:** কাজ করা HTTP server + benchmark report (আপনার server বনাম Nginx req/sec)।

**Lab (Thu–Fri)**

```bash
# Provision 2 Hetzner CX11 VMs (~€4/mo each). SSH in.
ss -tlnp                           # observe what's listening on every port
dig google.com                     # trace the full DNS resolution chain
curl -v https://example.com        # read every line of the TLS handshake
# Deploy your project to VM1, hit it from VM2
```

---

### Week 02 — Load balancing, reverse proxy আর failover

**Topics**

- একটা reverse proxy কী — TLS offloading, compression, routing
- Load balancing algorithm — round robin, least connections, IP hash, weighted
- Active vs passive health check — HAProxy কীভাবে একটা dead backend শনাক্ত করে
- Session persistence (sticky session) — কখন আর কেন এড়াবেন
- keepalived + VRRP — network layer-এ Virtual IP failover
- Connection draining — live request না ফেলে একটা node সরানো

**Key concepts**

`VIP / virtual IP` · `VRRP` · `upstream pool` · `active-passive HA` · `connection draining` · `layer 4 vs layer 7 LB` · `PROXY protocol`

**Resources**

- Hussein Nasser — HAProxy series (YouTube)
- HAProxy official docs
- Nginx upstream module docs
- keepalived.org — user guide

**Case study — GitHub-এর 24-ঘণ্টার outage (2018)**

একটা network partition primary আর replica database-কে ভিন্ন করে দিয়েছিল। HAProxy health check খুব ধীরে fail করেছিল, শনাক্ত হওয়ার আগে কয়েক মিনিট ধরে degraded node-এ traffic route করছিল। fix: health check interval 500ms-এ কমানো + circuit breaker যোগ করা। ঠিক সেই pattern যেটা আপনি এই সপ্তাহে বিল্ড করছেন।

**Weekly project — Production-grade streaming node failover**

একটা বাস্তব failover setup আবার বিল্ড করুন। সবকিছু মাপুন আর switchover-এর সময় zero dropped request লক্ষ্য রাখুন।

1. একটা 3য় VM-এ HAProxy install করুন। Node 01-কে primary, Node 02-কে backup হিসেবে configure করুন
2. একটা custom health check script লিখুন যেটা stream process যাচাই করে (শুধু TCP port নয়)
3. health check interval 500ms, rise=2, fall=3 সেট করুন
4. Node 01 আর 02-এ keepalived install করুন। shared VIP assign করুন। HAProxy-কে VIP-এ point করুন।
5. `wrk` load test চালান (`-t4 -c100 -d60s`)। test-এর মাঝখানে Node 01 kill করুন। failed request রেকর্ড করুন।
6. failover-এর সময় zero request fail না হওয়া পর্যন্ত tune করুন। আপনার final failover time ms-এ document করুন।

**Deliverable:** wrk benchmark দিয়ে zero-downtime failover প্রমাণ। failover time মিলিসেকেন্ডে document করা।

**Chaos test (Weekend)**

```bash
# Break it deliberately
pkill node                                            # kill Node 01 process — does HAProxy detect within 1s?
poweroff                                              # kill entire Node 01 VM — does VIP move to Node 02?
tc qdisc add dev eth0 root netem delay 200ms          # add latency
dd if=/dev/zero of=/tmp/fill bs=1M                    # fill Node 01 disk to 100% — does your health check catch non-TCP failures?
```

---

## Phase 2 — Core Scaling Concepts (Weeks 3–5)

### Week 03 — Database, replication আর sharding

**Topics**

- Postgres কীভাবে data store করে — heap file, page, B-tree index
- WAL (Write-Ahead Log) — byte level-এ replication কীভাবে কাজ করে
- Read replica — synchronous vs asynchronous replication-এর tradeoff
- Connection pooling — কেন 10,000 Postgres connection performance মেরে ফেলে; PgBouncer কীভাবে সেটা ঠিক করে
- Sharding strategy — range, hash, directory-based
- কখন shard করবেন না — বেশিরভাগ app-এর কখনো লাগে না
- `EXPLAIN ANALYZE` — একটা query plan পড়া, seq scan খুঁজে বের করা

**Key concepts**

`WAL` · `replication lag` · `MVCC` · `connection pooling` · `index scan vs seq scan` · `shard key` · `hot standby` · `VACUUM`

**Resources**

- _DDIA_ — Ch. 3, 5 (storage engine, replication)
- Arpit Bhayani — How Instagram sharded their DB (YouTube)
- Postgres docs — WAL and streaming replication
- Use The Index, Luke — use-the-index-luke.com (free)

**Case study — Instagram কীভাবে PostgreSQL দিয়ে 1 billion user-এ scale করল**

তারা read replica আক্রমণাত্মকভাবে ব্যবহার করে আর connection pooling-এর জন্য PgBouncer দিয়ে বছরের পর বছর একটা single Postgres primary চালিয়েছে। তারা তখনই shard করেছে যখন একটা single machine-এর RAM আর working set ধরে রাখতে পারছিল না। মূল শিক্ষা: sharding বিবেচনা করার আগে replica যোগ করুন আর slow query ঠিক করুন।

**Weekly project — Postgres primary + replica automatic failover সহ**

বাস্তব database replication সেট করুন আর failover-এর সময় কী হয় লক্ষ্য করুন। এটাই প্রতিটা production web app চালায়।

1. 2টি VM-এ Postgres install করুন। VM1-কে primary হিসেবে configure করুন (`pg_hba.conf`, `postgresql.conf`)
2. `pg_basebackup` + streaming replication config দিয়ে VM2-তে WAL stream করুন
3. app-level connection string env var দিয়ে write-কে primary-তে, read-কে replica-তে route করুন
4. দুটোতেই PgBouncer install করুন। `pool_mode=transaction` সেট করুন। connection count কমতে লক্ষ্য করুন।
5. primary failure simulate করুন — `pg_ctl promote` দিয়ে manually replica promote করুন
6. কোনো manual step ছাড়াই promotion automate করতে Patroni install করুন

**Deliverable:** Auto-failover Postgres cluster। সেকেন্ডে 1,000 write-এ replication lag মাপুন।

**Lab**

```sql
-- EXPLAIN ANALYZE a slow query. Add an index. Run again. Record time difference.
EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 42;

-- INSERT 1M rows. Compare seq scan vs index scan timing.
INSERT INTO events (user_id, payload) SELECT (random()*100000)::int, '...' FROM generate_series(1,1000000);

-- Check lag from the replica
SELECT now() - pg_last_xact_replay_timestamp();
```

---

### Week 04 — Caching strategy আর message queue

**Topics**

- Caching কেন থাকে — প্রতিটা engineer-এর যে latency সংখ্যাগুলো জানা উচিত (RAM vs disk vs network)
- Cache-aside, read-through, write-through, write-behind pattern
- Cache invalidation — TTL vs event-driven expiry, thundering herd সমস্যা
- Redis data structure — string, hash, sorted set, pub/sub, stream
- Message queue — producer-কে consumer থেকে decouple করা, backpressure
- Kafka fundamentals — topic, partition, consumer group, offset
- At-least-once vs exactly-once delivery — কখন কোনটা গুরুত্বপূর্ণ

**Key concepts**

`cache-aside` · `TTL` · `thundering herd` · `cache stampede` · `pub/sub` · `Kafka partition` · `consumer group` · `backpressure` · `dead letter queue`

**Resources**

- _DDIA_ — Ch. 11 (stream processing)
- ByteByteGo — caching strategies (YouTube)
- Redis University — RU101 (free)
- Kafka quickstart — kafka.apache.org

**Case study — Twitter-এর timeline কীভাবে কাজ করে**

যখন 10M follower-ওয়ালা একজন celebrity tweet করে, সব 10M timeline-এ synchronously লিখতে কয়েক মিনিট লাগত। Twitter Redis sorted set দিয়ে fan-out-on-read ব্যবহার করে — timeline Redis-এ materialise করা থাকে, প্রতি request-এ পুনরায় গণনা করা হয় না। বিশুদ্ধ caching একটা বিশুদ্ধ scaling সমস্যা সমাধান করছে।

**Weekly project — Redis cache + async analytics queue সহ URL shortener**

ক্লাসিক বাস্তব জগতের project। উচ্চ read:write ratio (caching-এর জন্য নিখুঁত)। background analytics processing (queue-এর জন্য নিখুঁত)। bit.ly আর TinyURL scale-এ ব্যবহার করে।

1. URL shortener API বানান: `POST /shorten` short code ফেরত দেয়, `GET /:code` redirect করে
2. Postgres-এ mapping store করুন। read-এ Redis cache-aside layer যোগ করুন।
3. Benchmark: cache cold বনাম warm-এ p99 latency মাপুন (10–50x উন্নতি আশা করুন)
4. প্রতিটা redirect-এ, একটা "click" event একটা Redis pub/sub channel বা Kafka topic-এ publish করুন
5. একটা consumer লিখুন যেটা click event পড়ে আর একটা আলাদা DB table-এ analytics লেখে
6. cache miss-এ thundering herd ঠেকাতে একটা mutex lock implement করুন

**Deliverable:** URL shortener + benchmark (cache hit vs miss latency) + queue-এর মধ্য দিয়ে বয়ে যাওয়া click analytics।

**Lab**

```bash
# Watch every Redis command in real time while your app runs
redis-cli monitor

# Manually expire a key — observe app behaviour on next request
redis-cli expire mykey 1

# Thundering herd test: restart Redis, hit /api 100 times concurrently — count DB queries
sudo systemctl restart redis && wrk -t8 -c100 -d10s http://localhost/api
```

---

### Week 05 — Distributed systems theory

**Topics**

- Distributed system কেন কঠিন — partial failure, কোনো global clock নেই, message delay
- CAP theorem বাস্তবে — "partition tolerance" প্রতিদিন আসলে কী মানে
- Consistency model — strong, eventual, causal, read-your-own-writes
- Consensus algorithm — Raft কেন আছে আর কোন সমস্যা সমাধান করে
- Distributed transaction — 2-phase commit আর কেন এটা প্রায়ই এড়ানো হয়
- Idempotency — retry করার জন্য নিরাপদ operation ডিজাইন করা
- Vector clock — কেন শুধু timestamp দিয়ে event ordering স্থাপন হয় না

**Key concepts**

`CAP theorem` · `eventual consistency` · `Raft consensus` · `2PC` · `idempotency key` · `vector clock` · `split brain` · `quorum`

**Resources**

- _DDIA_ — Ch. 8, 9 (ধীরে পড়ুন — সবচেয়ে কঠিন chapter)
- Martin Kleppmann — Cambridge lecture series (YouTube, free)
- MIT 6.824 — Lectures 1–4 (YouTube, free)
- raft.github.io — interactive Raft visualisation

**Case study — Amazon DynamoDB paper (2007)**

Amazon ইচ্ছাকৃতভাবে eventual consistency বেছে নিয়েছিল। একটা shopping cart-এর জন্য, একটা সামান্য বাসি cart দেখানো একটা error দেখানোর চেয়ে ভালো। এটা প্রতিটা eventually-consistent database-এর blueprint হয়ে উঠল। CAP কোনো ত্রুটি নয় — এটা tradeoff সহ একটা ইচ্ছাকৃত design choice।

**Weekly project — conflict resolution সহ distributed counter**

একটা counter বানান যেটা একাধিক node একসাথে increment করতে পারে। split-brain সমস্যা সমাধান করুন। এটা প্রতিটা distributed database-এর ভেতরের মূল সমস্যা।

1. একটা counter service-এর 3টি instance আলাদা port-এ চালান
2. তিনটা থেকে একসাথে increment করুন — inconsistency লক্ষ্য করুন আর document করুন
3. timestamp দিয়ে last-write-wins implement করুন — লক্ষ্য করুন কেন clock skew এটা ভাঙে
4. একটা CRDT G-Counter implement করুন — প্রতিটা node তার নিজের count track করে, read-এ merge করে
5. একটা distributed lock হিসেবে Redis `SETNX` দিয়ে leader election implement করুন
6. `iptables` দিয়ে network partition simulate করুন — node 1 আর 2-এর মধ্যে traffic block করুন, behaviour লক্ষ্য করুন

**Deliverable:** এমন Counter যেটা concurrent write-এ consistent থাকে আর একটা simulated network partition-এ টিকে যায়।

**Conceptual exercise — theory-heavy সপ্তাহ, এগুলোও করুন**

- raft.github.io খেলুন — একটা leader elect করুন, সেটাকে kill করুন, automatic re-election দেখুন
- আপনার streaming platform-এর CAP tradeoff কাগজে আঁকুন — কোথায় consistency বেছে নিলেন? কোথায় availability?
- একটা 1-পৃষ্ঠার "consistency contract" লিখুন — আপনার system-এ কোন data বাসি হতে পারে? কোনটা কখনো নয়?

---

## Phase 3 — Real-World Scaling (Weeks 6–8)

### Week 06 — Container, horizontal scaling আর service discovery

**Topics**

- Container কেন আছে — environment consistency, isolation, দ্রুত startup
- Docker internals — Linux namespace, cgroup, union filesystem (overlayfs)
- Stateless vs stateful service — কেন stateless horizontally scale করে আর stateful করে না
- multi-service local development-এর জন্য Docker Compose
- Service discovery — IP ephemeral হলে service-গুলো কীভাবে একে অপরকে খুঁজে পায়
- Kubernetes core concept — pod, deployment, service, ingress
- Horizontal Pod Autoscaler — CPU বা custom metric-এর উপর ভিত্তি করে scaling

**Key concepts**

`Linux namespaces` · `cgroups` · `stateless service` · `service discovery` · `sidecar pattern` · `HPA` · `rolling deploy` · `readiness probe`

**Resources**

- TechWorld with Nana — Docker full course (YouTube)
- labs.play-with-docker.com (free browser playground)
- kubernetes.io — interactive tutorials (free)
- Ivan Velichko — Container networking from scratch (blog)

**Case study — Spotify কীভাবে Kubernetes-এ গেল (2018)**

300+ engineering team একে অপরের উপর পা না ফেলে স্বাধীনভাবে deploy করছে। Kubernetes তাদের প্রতি team-এ isolated namespace আর zero downtime সহ rolling deployment দিল। কঠিন অংশটা Kubernetes নিজে ছিল না — সেটা ছিল আগে তাদের service-গুলোকে stateless করা। এটাই সবসময় পূর্বশর্ত।

**Weekly project — k3s-এ auto-scaling সহ containerised multi-node app**

Week 4-এর URL shortener নিন আর সেটাকে একটা load balancer-এর পেছনে একাধিক container হিসেবে চালান, load-এর নিচে automatically scale করান।

1. আপনার URL shortener-এর জন্য একটা Dockerfile লিখুন। locally build আর run করুন।
2. `docker-compose.yml` লিখুন: 3টি app replica + Nginx LB + Redis + Postgres
3. নিশ্চিত করুন Nginx replica-গুলোর মধ্যে request বণ্টন করে (API response-এ hostname যোগ করুন)
4. app-কে সত্যিকারের stateless করুন — যেকোনো local session/state Redis-এ সরান
5. k3s cluster-এ (3টি VM) deploy করুন। Deployment + Service YAML file লিখুন।
6. metrics-server install করুন। HPA configure করুন: 50% CPU-এর উপরে 1–5 pod scale করুন। load test চালান, scale হতে দেখুন।

**Deliverable:** k3s-এ app। HPA scaling প্রমাণ: load test-এর সময় `kubectl get pods` বাড়ছে তার screenshot।

**Lab**

```bash
docker stats                                        # watch CPU/memory per container during load test
docker exec -it container bash                      # explore the container filesystem
kubectl rollout restart deployment/app              # observe zero-downtime rolling restart
```

---

### Week 07 — Observability, resilience আর failure pattern

**Topics**

- observability-র 3টি pillar — metric, log, distributed trace
- RED method — Rate, Errors, Duration (যেকোনো service-এর জন্য track করার সঠিক metric)
- Prometheus data model — time series, label, PromQL query
- Grafana dashboard — real time-এ system health visualise করা
- Circuit breaker pattern — cascading failure ঠেকাতে fail fast
- exponential backoff আর jitter সহ retry — কেন সাধারণ retry জিনিস খারাপ করে
- Bulkhead pattern — failure isolate করা যাতে একটা খারাপ service সব মেরে না ফেলে
- SLO, SLA, error budget — Google কীভাবে reliability মাপে

**Key concepts**

`RED method` · `SLO / SLA / SLI` · `p99 latency` · `circuit breaker` · `exponential backoff` · `jitter` · `bulkhead` · `error budget` · `chaos engineering`

**Resources**

- Grafana Labs — free tutorials (grafana.com/tutorials)
- Prometheus docs — prometheus.io
- _Site Reliability Engineering_ — Google (free online)
- Netflix Tech Blog — chaos engineering articles

**Case study — Netflix কীভাবে Chaos Engineering উদ্ভাবন করল**

2010 সালে Netflix "Chaos Monkey" বানাল — একটা tool যেটা randomly production server kill করে। ভাবনাটা: যদি আপনার system random production failure-এ টিকে যায়, আপনার কখনো surprise outage হবে না। তারা এখন "Chaos Kong" চালায় যেটা পুরো AWS availability zone kill করে। অন্তর্দৃষ্টি: আপনার system resilient কিনা তা আপনি শুধু তখনই জানেন যখন সেটা আসল failure-এ টিকে যায়।

**Weekly project — full observability stack + structured chaos test**

আপনার URL shortener পুরোপুরি instrument করুন, একটা Grafana dashboard বানান, alert সেট করুন, তারপর ইচ্ছাকৃতভাবে system ভাঙুন আর real time-এ সবকিছু লক্ষ্য করুন।

1. আপনার app-এ Prometheus client যোগ করুন। `/metrics` expose করুন: request count, latency histogram, active connection
2. Prometheus deploy করুন। আপনার app থেকে প্রতি 15s-এ scrape configure করুন।
3. Grafana deploy করুন। dashboard বানান: req/sec, p50/p95/p99 latency, error rate, DB pool usage
4. alert rule লিখুন: `error_rate > 1%` 2 মিনিট ধরে থাকলে fire করুন। একটা Slack webhook-এ route করুন।
5. Chaos 1: load-test-এর মাঝখানে Redis container kill করুন। circuit breaker কি open হয়? alert কি fire করে?
6. Chaos 2: Postgres-এ 500ms latency যোগ করুন (`tc netem`)। p99 কি spike করে? একটা post-mortem doc লিখুন।

**Deliverable:** chaos-এর সময় Grafana dashboard screenshot। Alert fire করার প্রমাণ। Post-mortem doc (কী fail করল, কেন, কী ঠিক করলেন)।

**Chaos commands reference — এগুলো দিয়ে failure inject করুন**

```bash
tc qdisc add dev eth0 root netem delay 200ms        # add network latency
tc qdisc add dev eth0 root netem loss 10%           # drop 10% of packets
dd if=/dev/zero of=/tmp/fill bs=1M                  # fill disk until full
stress --cpu 4 --timeout 60                         # spike CPU, watch HPA scale
iptables -A INPUT -p tcp --dport 5432 -j DROP       # simulate DB unreachable
```

---

### Week 08 — Capstone: একটা বাস্তব scalable system ডিজাইন আর বিল্ড করুন

**Topics**

- Back-of-envelope estimation — ডিজাইনের আগে storage, bandwidth, QPS গণনা করা
- API gateway pattern — edge-এ rate limiting, auth, routing
- Read-heavy vs write-heavy system — ভিন্ন সমস্যার জন্য ভিন্ন architecture
- Database selection — কখন SQL, NoSQL, time-series, graph ব্যবহার করবেন
- CQRS pattern — high-scale read-এর জন্য আলাদা read আর write model
- Cost optimisation — যে বাস্তব constraint বাস্তব architecture সিদ্ধান্ত গড়ে

**Key concepts**

`back-of-envelope` · `QPS estimation` · `API gateway` · `rate limiting` · `fan-out` · `CQRS` · `event sourcing`

**Resources**

- _System Design Interview_ Vol.1 — Alex Xu (book)
- system-design-primer — github.com/donnemartin (free)
- High Scalability — highscalability.com (real case studies)
- _DDIA_ — Ch. 1–2 (এখন আবার পড়ুন — সব খাপে খাপে বসে যায়)

**Case study — Twitch কীভাবে 8 million concurrent viewer সামলায়**

ingest (RTMP)-কে delivery (HLS) থেকে আলাদা করে। worker pool জুড়ে সমান্তরালে transcode করে। global CDN মানে viewer edge থেকে টানে, origin থেকে নয়। Chat video থেকে স্বাধীনভাবে rate-limited। প্রতিটা component স্বাধীনভাবে scale করে — এটা আপনার domain, আর এটা ঠিক সেই architecture যেটা আপনি নিচের capstone-এ বিল্ড করছেন।

---

## Capstone project — একটা mini YouTube বিল্ড করুন

week 1–7-এর প্রতিটা concept একত্রিত করে। একটা বাস্তব video upload + streaming platform। খেলনা নয় — এটাকে আসল traffic সামলানোর জন্য ডিজাইন করুন।

### Component 1 — Upload service

- multipart upload-এর মাধ্যমে video গ্রহণ করুন
- raw file MinIO-তে (S3-compatible) store করুন
- Kafka-তে `video.uploaded` event publish করুন
- সাথে সাথে job ID ফেরত দিন (async response)

### Component 2 — Transcoding worker

- Kafka থেকে `video.uploaded` consume করুন
- FFmpeg দিয়ে 360p / 720p-তে transcode করুন
- segment-গুলো আবার MinIO-তে upload করুন
- Postgres-এ job status update করুন

### Component 3 — API + serving layer

- `GET /video/:id` — HLS playlist serve করুন
- Redis-এ playlist + metadata cache করুন
- metadata query-র জন্য Postgres read replica
- Nginx সরাসরি `.ts` segment file serve করে

### Component 4 — Infrastructure

- সব service Docker Compose-এ
- API replica-র সামনে HAProxy
- Prometheus + Grafana monitoring
- Chaos: job-এর মাঝখানে transcoding worker kill করুন

### Deliverables — কী বিল্ড আর document করবেন

- কাজ করা demo: একটা video upload করুন, transcode-এর জন্য অপেক্ষা করুন, browser-এ চালিয়ে দেখুন
- Architecture diagram যা সব component, data flow, আর failure mode দেখায়
- Load test: quality খারাপ হওয়ার আগে কত concurrent viewer?
- Failure test: job-এর মাঝখানে transcoding worker মারা যায় — এটা কি Kafka offset থেকে retry করে?
- Scale plan: 10,000 concurrent viewer-এ পৌঁছাতে কীভাবে তা দেখানো back-of-envelope

---

## Books — কখন পড়বেন

| When      | Book                                                       | How to read                                                                                                                                                                                                                             |
| --------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Week 3–5  | _Designing Data-Intensive Applications_ — Martin Kleppmann | distributed systems-এর সেরা বই। Ch.3 (storage engine) Week 3-এর সাথে, Ch.8–9 (consensus, distributed systems) Week 5-এর সাথে পড়ুন। ঠান্ডা মাথায় cover-to-cover পড়বেন না — lab-এর পাশাপাশি ব্যবহার করুন আর সেটা পুরোপুরি বোধগম্য হবে। |
| Week 8    | _System Design Interview_ Vol.1 — Alex Xu                  | URL shortener, Twitter feed, YouTube, WhatsApp scale-এ ডিজাইনের ব্যবহারিক walkthrough। নিজে একই জিনিস বিল্ড করার পরে পড়ুন — context থাকলে এটা অনেক বেশি কাজের।                                                                         |
| After     | _Site Reliability Engineering_ — Google (free online)      | Google কীভাবে planet scale-এ system অপারেট করে। SLO, error budget, on-call, incident management। production-এ কিছু চালু থাকলে পড়াই সবচেয়ে ভালো।                                                                                       |
| Reference | _The Linux Command Line_ — William Shotts (free online)    | সব lab work-এর জন্য অপরিহার্য। cover-to-cover পড়বেন না — একটা shell command-এ আটকে গেলে reference হিসেবে ব্যবহার করুন।                                                                                                                 |

---

## Daily rhythm — দিনে 1–2 ঘণ্টা

| Days      | Mode              | What to do                                                |
| --------- | ----------------- | --------------------------------------------------------- |
| Mon – Wed | Watch + Read      | দিনে 1টি topic। নোট নিন। হাতে diagram আঁকুন।              |
| Thu – Fri | Build the project | শুধু hands-on। কোনো video নয়। শুধু terminal আর editor।   |
| Weekend   | Break things      | Chaos test। একটা post-mortem লিখুন। সপ্তাহটা review করুন। |

<Callout type="tip">

**দুটো roadmap-ই একটা কাজ করা artifact দিয়ে শেষ হয়।** SRE roadmap (chapter 0) SLO, chaos, আর DR সহ Kubernetes-এ একটা পুরোপুরি observable Go service দিয়ে শেষ হয়। এই roadmap একটা mini-YouTube দিয়ে শেষ হয় যেটা chaos-এ টিকে যায় আর horizontally scale করে। যেকোনোটাই একটা portfolio piece যা নিয়ে interview দেওয়ার মতো। দুটোই পরপর করা মোটামুটি চার মাসের বাস্তব, documented systems work।

</Callout>

## আপডেটেড থাকুন

- [Kubernetes tutorials](https://kubernetes.io/docs/tutorials/) — version-current hands-on
- [AWS Builders' Library](https://aws.amazon.com/builders-library/) — scaling case study
- [High Scalability blog](http://highscalability.com/) — কোম্পানি জুড়ে architecture writeup
- [InfoQ architecture track](https://www.infoq.com/architecture-design/) — বাস্তব scale operator-দের talk

## মূল কথাগুলো

1. **আট সপ্তাহ, দিনে 1–2 ঘণ্টা** — SRE roadmap-এর চেয়ে নরম গতি; একটা job-এর পাশাপাশি চলে
2. **Phase 1 primitive-গুলো বিল্ড করে** (HTTP, LB, failover) যা বাকি সবকিছু ধরে নেয়
3. **Phase 2 core scaling lever-গুলো কভার করে** — replication, caching, queue, distributed-systems theory
4. **Phase 3 এটাকে Kubernetes-এ বসায়**, observe করে, ভাঙে, তারপর capstone ship করে
5. **Mini-YouTube capstone** প্রতিটা আগের সপ্তাহ একত্রিত করে — এটাই portfolio artifact
6. **DDIA lab-এর পাশাপাশি পড়ুন**, ঠান্ডা মাথায় cover-to-cover নয় — context বইটা খুলে দেয়
