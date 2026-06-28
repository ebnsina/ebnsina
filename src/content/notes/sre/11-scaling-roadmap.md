---
title: 'Scaling & Distributed Systems — 8-Week Companion Roadmap'
subtitle: 'Zero to designing, building, and operating scalable systems. 1–2 hrs/day, 8 weeks, 8 real projects, 5 case studies, mini-YouTube capstone.'
chapter: 11
level: 'beginner'
readingTime: '25 min'
topics: ['scaling', 'distributed systems', 'roadmap', 'capstone', 'system design']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A construction schedule — each week's work depends on the last, you can't pour the roof before the foundation cures, and the capstone at the end only makes sense because everything beneath it is solid.

</Callout>

## What this roadmap is

A second 8-week plan, complementary to the fullstack-to-SRE roadmap. Where the SRE roadmap focuses on **operating** production (SLOs, on-call, postmortems), this one focuses on **building** the scalable systems you will operate: networking primitives, load balancing, replication, caching, queues, distributed-systems theory, containers, observability, and a real capstone.

Pick whichever roadmap maps to your gap. Many learners run them sequentially — scaling first to build the system, SRE second to operate it.

```
8 weeks   ·   8 real projects   ·   5+ case studies   ·   1–2 h/day
```

<Callout type="info">

**Pacing**

This roadmap is paced at 1–2 hrs/day instead of 15–18 hrs/week. It is gentler than the SRE roadmap and built around evening study after a full-time job. Expect to extend a week if a project stretches; that is fine — depth beats schedule adherence.

</Callout>

## Contents

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

### Week 01 — How the internet & servers actually work

**Topics**

- DNS resolution — how a hostname becomes an IP address
- TCP/IP handshake — how two machines establish a connection
- HTTP/1.1 vs HTTP/2 vs HTTP/3 — what changed and why
- What a server process actually is — sockets, file descriptors, accept loops
- Linux fundamentals — processes, threads, file I/O, networking tools (netstat, ss, curl, dig)
- Blocking vs non-blocking I/O — why Node.js handles 10k connections and Apache chokes

**Key concepts**

`TCP 3-way handshake` · `DNS TTL` · `OSI model` · `file descriptors` · `epoll / kqueue` · `keep-alive` · `TLS termination`

**Resources**

- Hussein Nasser — _Fundamentals of Networking_ (YouTube)
- roadmap.sh/devops
- Linux Journey — linuxjourney.com (free)
- _High Performance Browser Networking_ — Ilya Grigorik (free online)

**Case study — How Cloudflare handles 100M+ requests/sec**

They run a single event loop per CPU core using epoll, avoid thread context switching entirely, and terminate TLS at the edge. The same principles apply when you run Nginx — it uses the same non-blocking architecture.

**Weekly project — Mini HTTP server from scratch**

Build a basic HTTP server in any language (Node.js, Python, Go) that handles concurrent connections without blocking. Forces you to understand what Nginx actually does under the hood.

1. Open a TCP socket, bind to port 8080, listen for connections
2. Parse a raw HTTP GET request (method, path, headers)
3. Respond with a valid HTTP/1.1 response (status line + headers + body)
4. Handle 100 concurrent connections — measure where it breaks
5. Add keep-alive support — observe connection reuse in tcpdump
6. Benchmark your server vs Nginx using `wrk` — record req/sec difference

**Deliverable:** Working HTTP server + benchmark report (your server vs Nginx req/sec).

**Lab (Thu–Fri)**

```bash
# Provision 2 Hetzner CX11 VMs (~€4/mo each). SSH in.
ss -tlnp                           # observe what's listening on every port
dig google.com                     # trace the full DNS resolution chain
curl -v https://example.com        # read every line of the TLS handshake
# Deploy your project to VM1, hit it from VM2
```

---

### Week 02 — Load balancing, reverse proxies & failover

**Topics**

- What a reverse proxy is — TLS offloading, compression, routing
- Load balancing algorithms — round robin, least connections, IP hash, weighted
- Active vs passive health checks — how HAProxy detects a dead backend
- Session persistence (sticky sessions) — when and why to avoid it
- keepalived + VRRP — Virtual IP failover at the network layer
- Connection draining — removing a node without dropping live requests

**Key concepts**

`VIP / virtual IP` · `VRRP` · `upstream pool` · `active-passive HA` · `connection draining` · `layer 4 vs layer 7 LB` · `PROXY protocol`

**Resources**

- Hussein Nasser — HAProxy series (YouTube)
- HAProxy official docs
- Nginx upstream module docs
- keepalived.org — user guide

**Case study — GitHub's 24-hour outage (2018)**

A network partition caused primary and replica databases to diverge. HAProxy health checks failed too slowly, routing traffic to degraded nodes for minutes before detection. The fix: health check interval reduced to 500ms + circuit breakers added. Exactly the pattern you're building this week.

**Weekly project — Production-grade streaming node failover**

Rebuild a real failover setup. Measure everything and target zero dropped requests during switchover.

1. Install HAProxy on a 3rd VM. Configure Node 01 as primary, Node 02 as backup
2. Write a custom health check script that verifies the stream process (not just TCP port)
3. Set health check interval 500ms, rise=2, fall=3
4. Install keepalived on Node 01 and 02. Assign shared VIP. Point HAProxy to the VIP.
5. Run `wrk` load test (`-t4 -c100 -d60s`). Kill Node 01 mid-test. Record failed requests.
6. Tune until zero requests fail during failover. Document your final failover time in ms.

**Deliverable:** Zero-downtime failover proof via wrk benchmark. Failover time documented in milliseconds.

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

### Week 03 — Databases, replication & sharding

**Topics**

- How Postgres stores data — heap files, pages, B-tree indexes
- WAL (Write-Ahead Log) — how replication works at the byte level
- Read replicas — synchronous vs asynchronous replication tradeoffs
- Connection pooling — why 10,000 Postgres connections kills performance; how PgBouncer fixes it
- Sharding strategies — range, hash, directory-based
- When NOT to shard — most apps never need it
- `EXPLAIN ANALYZE` — reading a query plan, spotting seq scans

**Key concepts**

`WAL` · `replication lag` · `MVCC` · `connection pooling` · `index scan vs seq scan` · `shard key` · `hot standby` · `VACUUM`

**Resources**

- _DDIA_ — Ch. 3, 5 (storage engines, replication)
- Arpit Bhayani — How Instagram sharded their DB (YouTube)
- Postgres docs — WAL and streaming replication
- Use The Index, Luke — use-the-index-luke.com (free)

**Case study — How Instagram scaled to 1 billion users with PostgreSQL**

They ran a single Postgres primary for years by using read replicas aggressively and PgBouncer for connection pooling. They only sharded when a single machine's RAM could no longer hold the working set. Key lesson: add replicas and fix slow queries before you consider sharding.

**Weekly project — Postgres primary + replica with automatic failover**

Set up real database replication and observe what happens during failover. This is what every production web app runs.

1. Install Postgres on 2 VMs. Configure VM1 as primary (`pg_hba.conf`, `postgresql.conf`)
2. Stream WAL to VM2 using `pg_basebackup` + streaming replication config
3. Route writes to primary, reads to replica via app-level connection string env var
4. Install PgBouncer on both. Set `pool_mode=transaction`. Observe connection count drop.
5. Simulate primary failure — promote replica manually using `pg_ctl promote`
6. Install Patroni to automate promotion without any manual steps

**Deliverable:** Auto-failover Postgres cluster. Measure replication lag under 1,000 writes/sec.

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

### Week 04 — Caching strategies & message queues

**Topics**

- Why caching exists — latency numbers every engineer should know (RAM vs disk vs network)
- Cache-aside, read-through, write-through, write-behind patterns
- Cache invalidation — TTL vs event-driven expiry, the thundering herd problem
- Redis data structures — strings, hashes, sorted sets, pub/sub, streams
- Message queues — decoupling producers from consumers, backpressure
- Kafka fundamentals — topics, partitions, consumer groups, offsets
- At-least-once vs exactly-once delivery — when each matters

**Key concepts**

`cache-aside` · `TTL` · `thundering herd` · `cache stampede` · `pub/sub` · `Kafka partition` · `consumer group` · `backpressure` · `dead letter queue`

**Resources**

- _DDIA_ — Ch. 11 (stream processing)
- ByteByteGo — caching strategies (YouTube)
- Redis University — RU101 (free)
- Kafka quickstart — kafka.apache.org

**Case study — How Twitter's timeline works**

When a celebrity with 10M followers tweets, writing to all 10M timelines synchronously would take minutes. Twitter uses fan-out-on-read with Redis sorted sets — timelines are materialised in Redis, not recomputed per request. Pure caching solving a pure scaling problem.

**Weekly project — URL shortener with Redis cache + async analytics queue**

Classic real-world project. High read:write ratio (perfect for caching). Background analytics processing (perfect for queues). Used by bit.ly and TinyURL at scale.

1. Build URL shortener API: `POST /shorten` returns short code, `GET /:code` redirects
2. Store mappings in Postgres. Add Redis cache-aside layer on reads.
3. Benchmark: measure p99 latency with cache cold vs warm (expect 10–50x improvement)
4. On every redirect, publish a "click" event to a Redis pub/sub channel or Kafka topic
5. Write a consumer that reads click events and writes analytics to a separate DB table
6. Implement a mutex lock to prevent thundering herd on cache miss

**Deliverable:** URL shortener + benchmark (cache hit vs miss latency) + click analytics flowing through queue.

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

- Why distributed systems are hard — partial failures, no global clock, message delays
- CAP theorem in practice — what "partition tolerance" actually means day-to-day
- Consistency models — strong, eventual, causal, read-your-own-writes
- Consensus algorithms — why Raft exists and what problem it solves
- Distributed transactions — 2-phase commit and why it's often avoided
- Idempotency — designing operations that are safe to retry
- Vector clocks — why timestamps alone don't establish event ordering

**Key concepts**

`CAP theorem` · `eventual consistency` · `Raft consensus` · `2PC` · `idempotency key` · `vector clock` · `split brain` · `quorum`

**Resources**

- _DDIA_ — Ch. 8, 9 (read slowly — the hardest chapters)
- Martin Kleppmann — Cambridge lecture series (YouTube, free)
- MIT 6.824 — Lectures 1–4 (YouTube, free)
- raft.github.io — interactive Raft visualisation

**Case study — Amazon DynamoDB paper (2007)**

Amazon chose eventual consistency deliberately. For a shopping cart, showing a slightly stale cart is better than showing an error. This became the blueprint for every eventually-consistent database. CAP isn't a flaw — it's a deliberate design choice with tradeoffs.

**Weekly project — Distributed counter with conflict resolution**

Build a counter that multiple nodes can increment simultaneously. Solve the split-brain problem. This is the core problem inside every distributed database.

1. Run 3 instances of a counter service on different ports
2. Increment from all 3 simultaneously — observe and document the inconsistency
3. Implement last-write-wins using timestamps — observe why clock skew breaks it
4. Implement a CRDT G-Counter — each node tracks its own count, merge on read
5. Implement leader election using Redis `SETNX` as a distributed lock
6. Simulate network partition using `iptables` — block traffic between node 1 and 2, observe behaviour

**Deliverable:** Counter that stays consistent under concurrent writes and survives a simulated network partition.

**Conceptual exercise — theory-heavy week, also do these**

- Play raft.github.io — elect a leader, kill it, watch automatic re-election
- Draw your streaming platform's CAP tradeoffs on paper — where did you choose consistency? Where availability?
- Write a 1-page "consistency contract" — what data in your system can go stale? What must never?

---

## Phase 3 — Real-World Scaling (Weeks 6–8)

### Week 06 — Containers, horizontal scaling & service discovery

**Topics**

- Why containers exist — environment consistency, isolation, fast startup
- Docker internals — Linux namespaces, cgroups, union filesystems (overlayfs)
- Stateless vs stateful services — why stateless scales horizontally and stateful doesn't
- Docker Compose for multi-service local development
- Service discovery — how services find each other when IPs are ephemeral
- Kubernetes core concepts — pods, deployments, services, ingress
- Horizontal Pod Autoscaler — scaling based on CPU or custom metrics

**Key concepts**

`Linux namespaces` · `cgroups` · `stateless service` · `service discovery` · `sidecar pattern` · `HPA` · `rolling deploy` · `readiness probe`

**Resources**

- TechWorld with Nana — Docker full course (YouTube)
- labs.play-with-docker.com (free browser playground)
- kubernetes.io — interactive tutorials (free)
- Ivan Velichko — Container networking from scratch (blog)

**Case study — How Spotify moved to Kubernetes (2018)**

300+ engineering teams deploying independently without stepping on each other. Kubernetes gave them isolated namespaces per team and rolling deployments with zero downtime. The hard part wasn't Kubernetes itself — it was making their services stateless first. That's always the prerequisite.

**Weekly project — Containerised multi-node app with auto-scaling on k3s**

Take the Week 4 URL shortener and make it run as multiple containers behind a load balancer, scaling automatically under load.

1. Write a Dockerfile for your URL shortener. Build and run locally.
2. Write `docker-compose.yml`: 3 app replicas + Nginx LB + Redis + Postgres
3. Confirm Nginx distributes requests across replicas (add hostname to API response)
4. Make the app truly stateless — move any local session/state to Redis
5. Deploy to k3s cluster (3 VMs). Write Deployment + Service YAML files.
6. Install metrics-server. Configure HPA: scale 1–5 pods above 50% CPU. Run load test, watch it scale.

**Deliverable:** App on k3s. HPA scaling proof: screenshot of `kubectl get pods` growing during load test.

**Lab**

```bash
docker stats                                        # watch CPU/memory per container during load test
docker exec -it container bash                      # explore the container filesystem
kubectl rollout restart deployment/app              # observe zero-downtime rolling restart
```

---

### Week 07 — Observability, resilience & failure patterns

**Topics**

- The 3 pillars of observability — metrics, logs, distributed traces
- RED method — Rate, Errors, Duration (the right metrics to track for any service)
- Prometheus data model — time series, labels, PromQL queries
- Grafana dashboards — visualising system health in real time
- Circuit breaker pattern — fail fast to prevent cascading failure
- Retry with exponential backoff and jitter — why plain retry makes things worse
- Bulkhead pattern — isolating failures so one bad service can't kill everything
- SLOs, SLAs, error budgets — how Google measures reliability

**Key concepts**

`RED method` · `SLO / SLA / SLI` · `p99 latency` · `circuit breaker` · `exponential backoff` · `jitter` · `bulkhead` · `error budget` · `chaos engineering`

**Resources**

- Grafana Labs — free tutorials (grafana.com/tutorials)
- Prometheus docs — prometheus.io
- _Site Reliability Engineering_ — Google (free online)
- Netflix Tech Blog — chaos engineering articles

**Case study — How Netflix invented Chaos Engineering**

In 2010 Netflix built "Chaos Monkey" — a tool that randomly kills production servers. The idea: if your system survives random production failures, you'll never have a surprise outage. They now run "Chaos Kong" which kills entire AWS availability zones. Insight: you only know your system is resilient after it survives real failure.

**Weekly project — Full observability stack + structured chaos test**

Instrument your URL shortener fully, build a Grafana dashboard, set up alerts, then deliberately break the system and observe everything in real time.

1. Add Prometheus client to your app. Expose `/metrics`: request count, latency histogram, active connections
2. Deploy Prometheus. Configure scrape every 15s from your app.
3. Deploy Grafana. Build dashboard: req/sec, p50/p95/p99 latency, error rate, DB pool usage
4. Write alert rule: fire if `error_rate > 1%` for 2 minutes. Route to Slack webhook.
5. Chaos 1: kill Redis container mid-load-test. Does circuit breaker open? Does alert fire?
6. Chaos 2: add 500ms latency to Postgres (`tc netem`). Does p99 spike? Write a post-mortem doc.

**Deliverable:** Grafana dashboard screenshot during chaos. Alert firing proof. Post-mortem doc (what failed, why, what you fixed).

**Chaos commands reference — inject failure with these**

```bash
tc qdisc add dev eth0 root netem delay 200ms        # add network latency
tc qdisc add dev eth0 root netem loss 10%           # drop 10% of packets
dd if=/dev/zero of=/tmp/fill bs=1M                  # fill disk until full
stress --cpu 4 --timeout 60                         # spike CPU, watch HPA scale
iptables -A INPUT -p tcp --dport 5432 -j DROP       # simulate DB unreachable
```

---

### Week 08 — Capstone: design and build a real scalable system

**Topics**

- Back-of-envelope estimation — calculating storage, bandwidth, QPS before designing
- API gateway pattern — rate limiting, auth, routing at the edge
- Read-heavy vs write-heavy systems — different architectures for different problems
- Database selection — when to use SQL, NoSQL, time-series, graph
- CQRS pattern — separate read and write models for high-scale reads
- Cost optimisation — the real constraint that shapes real architecture decisions

**Key concepts**

`back-of-envelope` · `QPS estimation` · `API gateway` · `rate limiting` · `fan-out` · `CQRS` · `event sourcing`

**Resources**

- _System Design Interview_ Vol.1 — Alex Xu (book)
- system-design-primer — github.com/donnemartin (free)
- High Scalability — highscalability.com (real case studies)
- _DDIA_ — Ch. 1–2 (re-read now — it all clicks)

**Case study — How Twitch handles 8 million concurrent viewers**

Separate ingest (RTMP) from delivery (HLS). Transcode in parallel across worker pools. Global CDN means viewers pull from edge, not origin. Chat is rate-limited independently from video. Each component scales independently — this is your domain, and it's exactly the architecture you're building in the capstone below.

---

## Capstone project — build a mini YouTube

Combines every concept from weeks 1–7. A real video upload + streaming platform. Not a toy — design it to handle actual traffic.

### Component 1 — Upload service

- Accept video via multipart upload
- Store raw file to MinIO (S3-compatible)
- Publish `video.uploaded` event to Kafka
- Return job ID immediately (async response)

### Component 2 — Transcoding worker

- Consume `video.uploaded` from Kafka
- Transcode to 360p / 720p using FFmpeg
- Upload segments back to MinIO
- Update job status in Postgres

### Component 3 — API + serving layer

- `GET /video/:id` — serve HLS playlist
- Cache playlist + metadata in Redis
- Postgres read replica for metadata queries
- Nginx serves `.ts` segment files directly

### Component 4 — Infrastructure

- All services in Docker Compose
- HAProxy in front of API replicas
- Prometheus + Grafana monitoring
- Chaos: kill transcoding worker mid-job

### Deliverables — what to build and document

- Working demo: upload a video, wait for transcode, play it back in a browser
- Architecture diagram showing all components, data flows, and failure modes
- Load test: how many concurrent viewers before quality degrades?
- Failure test: transcoding worker dies mid-job — does it retry from Kafka offset?
- Scale plan: back-of-envelope showing how to reach 10,000 concurrent viewers

---

## Books — when to read them

| When      | Book                                                       | How to read                                                                                                                                                                                                                               |
| --------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Week 3–5  | _Designing Data-Intensive Applications_ — Martin Kleppmann | The best book on distributed systems. Read Ch.3 (storage engines) alongside Week 3, Ch.8–9 (consensus, distributed systems) alongside Week 5. Don't read cover-to-cover cold — use it alongside the labs and it will make complete sense. |
| Week 8    | _System Design Interview_ Vol.1 — Alex Xu                  | Practical walkthroughs of designing URL shorteners, Twitter feeds, YouTube, WhatsApp at scale. Read after you've built similar things yourself — it's far more useful when you have context.                                              |
| After     | _Site Reliability Engineering_ — Google (free online)      | How Google operates systems at planet scale. SLOs, error budgets, on-call, incident management. Best read once you have something running in production.                                                                                  |
| Reference | _The Linux Command Line_ — William Shotts (free online)    | Essential for all the lab work. Don't read cover-to-cover — use it as a reference when you're stuck on a shell command.                                                                                                                   |

---

## Daily rhythm — 1–2 hrs/day

| Days      | Mode              | What to do                                          |
| --------- | ----------------- | --------------------------------------------------- |
| Mon – Wed | Watch + Read      | 1 topic/day. Take notes. Draw diagrams by hand.     |
| Thu – Fri | Build the project | Hands-on only. No videos. Just terminal and editor. |
| Weekend   | Break things      | Chaos tests. Write a post-mortem. Review the week.  |

<Callout type="tip">

**Both roadmaps end with a working artifact.** The SRE roadmap (chapter 0) ends with a fully observable Go service on Kubernetes with SLOs, chaos, and DR. This roadmap ends with a mini-YouTube that survives chaos and scales horizontally. Either is a portfolio piece worth interviewing on. Doing both back-to-back is roughly four months of real, documented systems work.

</Callout>

## Stay current

- [Kubernetes tutorials](https://kubernetes.io/docs/tutorials/) — version-current hands-on
- [AWS Builders' Library](https://aws.amazon.com/builders-library/) — scaling case studies
- [High Scalability blog](http://highscalability.com/) — architecture writeups across companies
- [InfoQ architecture track](https://www.infoq.com/architecture-design/) — talks from real scale operators

## Key Takeaways

1. **Eight weeks, 1–2 hrs/day** — gentler pace than the SRE roadmap; runs alongside a job
2. **Phase 1 builds the primitives** (HTTP, LB, failover) that everything else assumes
3. **Phase 2 covers the core scaling levers** — replication, caching, queues, distributed-systems theory
4. **Phase 3 puts it on Kubernetes**, observes it, breaks it, then ships the capstone
5. **Mini-YouTube capstone** combines every prior week — it is the portfolio artifact
6. **Read DDIA alongside the labs**, not cover-to-cover cold — context unlocks the book
