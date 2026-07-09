---
title: 'SRE-দের জন্য Distributed Systems Theory'
subtitle: 'CAP, PACELC, FLP, Raft, Paxos, gossip, vector clocks, CRDTs, fencing tokens। যে theory ব্যাখ্যা করে আপনার distributed system কেন যেভাবে ভাঙে সেভাবে ভাঙে।'
chapter: 15
level: 'mastery'
readingTime: '32 মিনিট'
topics:
  [
    'distributed systems',
    'CAP',
    'Raft',
    'Paxos',
    'consensus',
    'CRDT',
    'vector clock',
    'fencing tokens'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

time zone জুড়ে ছড়ানো একটা team coordinate করা — সম্মতি পেতে বেশি সময় লাগে, partial failure স্বাভাবিক, আর আপনি সেগুলোর চারপাশে design করেন।

</Callout>

## SRE-level-এ theory কেন গুরুত্বপূর্ণ

আপনি consensus নিয়ে না ভেবেই বছরের পর বছর একটা single-node service চালাতে পারেন। যেদিন আপনি দ্বিতীয় একটা region, একটা leader election, বা একটা read replica যোগ করেন, সেদিন distributed-systems theory আর academic থাকে না — এটা প্রতিটা "এটা হতেই পারে না" outage-এর ব্যাখ্যা হয়ে যায়।

এই chapter হলো সেই working theory যা একজন senior SRE design review আর incident retro-তে reference করে। এটা paper পড়া, consistency claim নিয়ে vendor-দের সাথে তর্ক করা, আর একটা system ভাঙার আগেই তার failure mode predict করার জন্য যথেষ্ট।

## Distributed computing-এর আটটা fallacy

L. Peter Deutsch-এর classic — এর প্রতিটাই আপনার ship করা কোনো না কোনো বাস্তব outage-এর কারণ:

```
1. The network is reliable.
2. Latency is zero.
3. Bandwidth is infinite.
4. The network is secure.
5. Topology doesn't change.
6. There is one administrator.
7. Transport cost is zero.
8. The network is homogeneous.
```

মুখস্থ করুন। প্রথম তিনটা ~70% distributed bug ব্যাখ্যা করে। প্রতিটা "আমরা শুধু একটা retry যোগ করব" সিদ্ধান্ত #1 (এটা আপনার message দুই দিকেই হারাতে পারে) আর #2 (retry-টা original-এর সাথে race করতে পারে)-এর বিপরীতে যাচাই করতে হবে।

## CAP — আমাদের industry-র সবচেয়ে বেশি ভুল-উদ্ধৃত theorem

Eric Brewer-এর CAP theorem বলে: একটা network _Partition_-এর উপস্থিতিতে একটা system-কে Consistency আর Availability-র মধ্যে বাছতে হবে। এটুকুই।

common ভুল-উদ্ধৃতি: "তিনটার মধ্যে দুটো বাছুন।" সেটা ভুল। Network partition হয়। আপনি "no partition" বাছার সুযোগ পান না। আপনি partition-এর _সময়ে_ C-নাকি-A বাছার সুযোগ পান।

```
Partition occurs.
                    ┌─→ keep accepting writes (AP). Risk: divergent state.
Choose: ──────────┤
                    └─→ stop serving requests (CP). Risk: downtime.

When the partition heals, AP systems must reconcile divergent writes.
CP systems just resume.
```

### বাস্তব উদাহরণ

| System                        | Choice                              | Partition-এর সময় behavior                             |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------ |
| etcd, Consul, ZooKeeper       | CP                                  | Minority দিক read-only হয়ে যায়                       |
| Cassandra, DynamoDB (default) | AP                                  | দুই দিকই write নেয়; পরে LWW বা merge                  |
| Postgres (single primary)     | CP                                  | Standby promote হতে পারে; ভুল সামলালে split-brain risk |
| Spanner (TrueTime)            | "CP-ish, with bounded availability" | যে write TrueTime quorum পায় না সেটা refuse করে       |

## PACELC — আরও কাজের framework

Daniel Abadi-র extension। সম্পূর্ণ tradeoff-টা:

```
If a Partition happens:  Choose Availability or Consistency  (the CAP part)
Else (normal operation): Choose Latency or Consistency       (the EL part)

Example labels:
  Cassandra  AP / EL — sacrifices C in partition AND latency for C in normal ops.
  HBase      CP / EC — picks consistency in both cases.
  DynamoDB   AP / EL — same as Cassandra by default; can be tuned.
  Spanner    CP / EC — picks consistency always; pays latency cost.
```

PACELC বেশি কাজের framework কারণ বেশিরভাগ সময় system _partitioned নয়_। latency-vs-consistency-র পছন্দটা প্রতিদিনের। CAP পছন্দটা quarter-এ একবারের।

## FLP impossibility — কেন consensus algorithm-এর অদ্ভুত timeout থাকে

Fischer-Lynch-Paterson (1985): একটা সম্পূর্ণ asynchronous distributed system-এ, এমনকি একটা node crash করতে পারলেও কোনো deterministic consensus algorithm safety আর liveness দুটোই guarantee করতে পারে না।

অনুবাদ: timeout ছাড়া আপনি "এই node ধীর"-কে "এই node মৃত" থেকে আলাদা করতে পারবেন না। প্রতিটা বাস্তব consensus protocol (Paxos, Raft, ZAB) এই impossibility-কে **partial synchrony assumption** (শেষমেশ message কোনো delay-এর মধ্যে পৌঁছয়) আর **failure detector** (timeout) যোগ করে ভাঙে।

এই কারণেই প্রতিটা Raft cluster-এ tune করার মতো heartbeat timeout থাকে, আর প্রতিটা "split-brain" incident report-এ clock skew উল্লেখ থাকে।

## Consensus — 2 মিনিটে Raft

Raft হলো প্রথমে শেখার algorithm। Paxos পুরনো আর power-এ সমান কিন্তু সঠিকভাবে implement করা কঠিন। Raft হলো etcd, Consul, CockroachDB, TiKV-র ভিত্তি।

```
Roles:        Leader (one), Followers (many), Candidate (briefly).
Term:         Monotonically increasing election epoch.
Log:          Append-only sequence of commands.

Election:
  - Followers expect a heartbeat from the leader.
  - If none arrives within election timeout (~150-300 ms randomized),
    a follower becomes a Candidate, increments term, requests votes.
  - A candidate that wins majority becomes the new Leader.

Replication:
  - Client sends command to Leader.
  - Leader appends to its log, sends AppendEntries to Followers.
  - Once majority of Followers have persisted the entry, it's committed.
  - Leader applies it and tells the client "ok."
  - Followers apply on next heartbeat.

Safety guarantee: at most one Leader per term; committed entries never lost.
```

### SRE-দের কাছে কেন এটা গুরুত্বপূর্ণ

- **Cluster size = 2f+1.** একটা 3-node cluster 1টা failure সহ্য করে। 5-node 2টা সহ্য করে। জোড়-সংখ্যার cluster আপনাকে কোনো extra fault tolerance দেয় না — একটা 4-node cluster এখনও মাত্র 1টা failure সহ্য করে (দুই ক্ষেত্রেই majority = 3 লাগে) কিন্তু disagreement risk দ্বিগুণ করে।
- **Quorum write (f+1) node-এর সবচেয়ে ধীরটার উপর block করে।** এক node-এর একটা slow disk আপনার write latency অর্ধেক করে দেয়। similar disk performance-ওয়ালা node জুড়ে replica ছড়ান।
- **Geo-distributed Raft নিষ্ঠুর।** প্রতিটা commit quorum-এর সবচেয়ে ধীর member-এ এক round trip। Atlanta + Frankfurt + Tokyo = ~150 ms commit latency floor।
- **Leader pinning.** etcd/CockroachDB আপনাকে Raft leader এক region-এ pin করতে দেয় যাতে সেই region থেকে read local হয়। minority region-গুলো শুধু write-এ WAN cost দেয়।

### Raft system-এর চারপাশে operational page

```
- "etcd cluster lost quorum" — usually network partition or 2/3 disks slow.
- "leader changed N times in 5 minutes" — flaky network, not a bug.
- "Raft snapshot lag growing" — applier slower than incoming traffic.
  Tune snapshot frequency or scale CPU on followers.
```

## Linearizability vs serializability vs strong consistency

শব্দগুলোর মানে ভিন্ন। এগুলো গুলিয়ে ফেলাই হলো consistency mis-spec করার উপায়।

```
Linearizability       — single-object real-time order. Each read sees the
                        most recent write or later. Per-key.

Serializability       — multi-object: the result of concurrent transactions
                        is equivalent to *some* serial order.

Strict Serializability= Linearizable + Serializable. (What Spanner gives you.)

Snapshot Isolation    — each transaction sees a consistent snapshot at start.
                        Allows write skew. (Postgres SERIALIZABLE level
                        actually gives Serializable Snapshot Isolation, SSI.)

Read Committed        — you only see committed data. (Default in Postgres.)
                        Allows non-repeatable reads.

Eventual Consistency  — converges if writes stop. No order guarantees.
```

সৎ framing: 99% feature-এর Read Committed plus read-after-write UX-এর জন্য একটা sticky-write rule দরকার। বাকি 1% (financial ledger, inventory)-এর Serializable দরকার। আপনি কোনটা চালাচ্ছেন সেটা জানা subtle data bug ঠেকায়।

### যে anomaly-গুলো আপনার চেনা উচিত

```
Dirty read       — read uncommitted data. (Read Committed prevents this.)
Non-repeatable   — read same row twice in a transaction, get different values.
Phantom          — read returns a different set of rows on retry.
Lost update      — two writers each read, modify, write. Last writer wins,
                   first writer's change vanishes.
Write skew       — two transactions read disjoint sets, write disjoint sets,
                   but together violate an invariant.
```

write skew-এর "doctors on call" উদাহরণ:

```sql
-- Invariant: at least one doctor on call.
-- Both transactions check, both see 2 doctors, both let their doctor leave.
-- Result: zero on call.
BEGIN;
SELECT count(*) FROM oncall WHERE shift = 'tonight';  -- returns 2
-- (other transaction does the same)
UPDATE oncall SET on_call = false WHERE doctor_id = 1;
COMMIT;
```

Snapshot Isolation এটা ঠেকায় না। SSI ঠেকায়। explicit `SELECT ... FOR UPDATE`-ও ঠেকায়।

## Vector clocks — কী কার আগে ঘটেছে জানা

distributed event-এর জন্য একটা logical clock। প্রতিটা node নিজের জন্য একটা counter আর প্রতিটা peer-এর সর্বশেষ দেখা counter রাখে। দুটো event তুলনা করুন:

```
Event A's vector: { N1: 5, N2: 3, N3: 7 }
Event B's vector: { N1: 4, N2: 3, N3: 8 }

Is A → B?  No: A.N1 (5) > B.N1 (4).
Is B → A?  No: B.N3 (8) > A.N3 (7).
Conclusion: A and B are concurrent. Application must merge.
```

যারা ব্যবহার করে: Riak, Cassandra (অনেকটা), DynamoDB (ভেতরে vector version), Git (অনেকটা — commit-এর DAG)।

SRE-প্রাসঙ্গিকতা: যখন একটা system-এর docs-এ "vector clocks" দেখবেন, application layer-এ conflict resolution সামলানোর জন্য প্রস্তুত থাকুন। DB আপনাকে দুটো version হাতে ধরিয়ে জিজ্ঞেস করবে কোনটা জিতবে।

## CRDTs — যে conflict-resolution জিজ্ঞেস করে না

Conflict-free Replicated Data Types: এমন data structure যেখানে concurrent update সবসময় একই result-এ merge হয়, order যাই হোক। কোনো coordination লাগে না।

```
G-Counter (grow-only counter):
  Each replica tracks its own count: { N1: 5, N2: 3 }
  Merge = element-wise max.
  Total = sum.

LWW-Element-Set (last-writer-wins set):
  Each element tagged with timestamp. Merge by max timestamp.

OR-Set (observed-remove set):
  Each add is tagged with a unique ID. Removes only remove observed IDs.
  Lets you concurrently add and remove the same element correctly.
```

যারা ব্যবহার করে: Redis Enterprise (region জুড়ে CRDT), Riak, Riverbed, collaborative editor (Yjs, Automerge)।

catch: CRDT আপনার data model-কে constrain করে। আপনি সহজে একটা relational `JOIN`-কে CRDT করতে পারবেন না। ভালো খবর: shopping cart, presence state, social graph, document editing আর KV counter — সবারই natural CRDT representation আছে।

## Gossip — স্কেলে eventual consistency

Gossip protocol random pairwise exchange দিয়ে state ছড়ায়। প্রতিটা node পর্যায়ক্রমে একটা random peer বাছে, state exchange করে আর merge করে। O(log N) round-এর পর cluster converge করে।

```
Used by:   Cassandra (cluster membership), Consul (gossip layer),
           Serf, Hashicorp's product line, Bitcoin's peer discovery.

Properties:
  - Fast: O(log N) convergence.
  - Robust: no central coordinator.
  - Bandwidth-stable: each node sends a fixed amount per round.
  - Eventually consistent only.

When you'd choose gossip:
  - Cluster membership (who's alive)
  - Service discovery (where is foo?)
  - Failure detection (Phi-accrual is the clever variant)
```

আপনি gossip protocol লেখেন না; আপনি সেগুলো operate করেন। সমস্যার লক্ষণ: node cluster-এ "blipping" (timeout খুব aggressive), বা একটা node সত্যিই মরে যাওয়ার পরও stale state ঝুলে থাকা (timeout খুব loose)।

## Idempotency, exactly-once, আর আমাদের বলা মিথ্যাগুলো

"Exactly-once delivery" একটা marketing claim। সত্যিটা:

```
At-most-once   — fire and forget. Message may be lost.
At-least-once  — retry until ack. Message may be delivered multiple times.
"Exactly-once" — at-least-once delivery + idempotent receiver = effective once.
```

receiver-ই কাজটা করছে। এই কারণেই প্রতিটা queue/event-bus README idempotency-তে জোর দেয়:

```typescript
// Bad: not idempotent. Retried delivery double-charges.
async function processOrder(msg) {
	await charge(msg.userId, msg.amount);
}

// Good: dedupe by message ID.
async function processOrder(msg) {
	const inserted = await db.insertOrIgnore('processed_messages', { id: msg.id });
	if (!inserted) return; // already processed
	await charge(msg.userId, msg.amount);
}
```

Kafka-র "exactly once" হলো at-least-once delivery + producer transaction + idempotent consumer। এটা শুধু Kafka-র ভেতরে কাজ করে। আপনি যেই মুহূর্তে অন্য কিছুতে write করবেন, dedup logic-এর মালিক আপনি।

## Fencing tokens — zombie writer ঠেকানো

classic Martin Kleppmann উদাহরণ: একটা process একটা distributed lock ধরে, GC 30 second pause করে, lock expire হয়, আরেকটা process দখল নেয়, তারপর original-টা জেগে ওঠে আর তবুও write করে। দুজনেই ভাবে তারা lock ধরে আছে। Data corrupt হয়।

```
Fix: every lock acquisition returns a monotonically increasing token.
The storage layer rejects writes with a token < the highest seen.
```

```typescript
const token = await lockManager.acquire('resource'); // returns 17
// ... later, after GC pause ...
await storage.write({ key, value, token });
// storage layer: "I've already seen token 23 from process B. Reject 17."
```

যারা ব্যবহার করে: Spanner (token হিসেবে timestamp), Chubby, আধুনিক S3 conditional write (`If-Match`), HDFS NameNode generation ID। আপনার distributed lock provider যদি fencing token ফেরত না দেয়, সেটা safe না — ব্যস।

## Time আর clocks — নীরব ঘাতক

Server clock drift করে। NTP এগুলো ~10–100 ms-এর মধ্যে রাখে। region জুড়ে clock skew second হতে পারে। "timestamp দিয়ে ordering"-এর প্রতিটা assumption সন্দেহজনক।

```
- "Last writer wins" by wall clock — unsafe across regions.
- "Token expires at clock+5s" — can expire instantly on a slow-clock node.
- "Cache invalidate at exact time" — depends on synchronized clocks.

Fixes:
  - Logical clocks (Lamport, vector) for ordering events.
  - Hybrid Logical Clock (HLC) — combines logical + physical, used by CockroachDB.
  - Google's TrueTime — bounded uncertainty (typically <7 ms) using GPS + atomic clocks.
    Used by Spanner. The cluster waits out the uncertainty window before committing.
```

যখন একটা system "globally consistent timestamps" claim করে দেখবেন, জিজ্ঞেস করুন: TrueTime? HLC? নাকি তারা NTP-তে ভরসা করছে? উত্তরটা আপনাকে failure mode বলে দেয়।

## Coordination-avoidance patterns

বাস্তবে theory। senior-SRE mantra: **coordination হলো scale-এর শত্রু।** যেখানেই এড়াতে পারেন, এড়ান।

```
- Sharded counters instead of locking a single row.
- Append-only event logs instead of mutable state.
- CRDTs for things that naturally merge.
- Optimistic concurrency control (compare-and-swap) instead of locks.
- Sagas instead of distributed transactions.
- Read-your-writes via session stickiness instead of synchronous replication.
```

দুই লাইনের নিয়ম: যখনই নিজেকে একটা lock যোগ করতে দেখবেন, জিজ্ঞেস করুন "এর বদলে কি এটাকে commutative বা idempotent করা যায়?" যদি হ্যাঁ, সেটাই করুন।

## Partial failure — distsys-এর সংজ্ঞায়ক বৈশিষ্ট্য

একটা single-node system-এ জিনিস হয় কাজ করে নয়তো করে না। একটা distributed system-এ অর্ধেক dependency up আর অর্ধেক down, আর যে অর্ধেক up সেটা সবসময় জানে না কোনটা কোনটা।

যে pattern-গুলো partial failure contain করে:

```
- Timeouts on every RPC. No exceptions. (No timeout = crash later.)
- Bulkheads: per-dependency thread pools / connection pools.
  A slow dependency can't drain the whole app's threads.
- Circuit breakers: stop calling a dep that's been failing for N seconds.
- Hedged requests: send to two replicas, take the first response.
- Backpressure: when downstream slows, slow your accept rate.
  (Don't queue infinitely.)
- Load shedding: when at saturation, return 503 fast — don't let
  requests pile up.
```

এই pattern-গুলোর জন্যই senior team design doc-এ "Bulkhead" আর "CircuitBreaker" noun হিসেবে লেখে, verb হিসেবে নয়।

## যত্ন করে পড়ার মতো paper (ক্রম অনুযায়ী)

একজন senior SRE যে reading list আসলে পড়েছে, শুধু নাম শোনেনি:

```
1. "Time, Clocks, and the Ordering of Events"     — Lamport, 1978
2. "The Byzantine Generals Problem"               — Lamport, 1982
3. "Impossibility of Distributed Consensus..."    — FLP, 1985
4. "The Part-Time Parliament" (or "Paxos Made Simple") — Lamport
5. "In Search of an Understandable Consensus Algorithm" — Raft, Ongaro 2014
6. "Spanner: Google's Globally Distributed DB"    — OSDI 2012
7. "Dynamo: Amazon's Highly Available Key-Value Store" — SOSP 2007
8. "Conflict-free Replicated Data Types"          — Shapiro et al, 2011
9. "Designing Data-Intensive Applications"        — Kleppmann (book)
10. "Jepsen reports"                              — Aphyr.com
```

Jepsen report-গুলো অবশ্যপাঠ্য — এগুলো field-এর empirical reality check। Jepsen test একটা vendor-কে লজ্জা দেওয়ার পর অনেকে নীরবে bug ফিক্স করেছে।

## SRE-level-এর common theory ভুল

1. **CAP-কে একটা static label হিসেবে treat করা** partition-এর সময় একটা behavior-এর বদলে।
2. **যেকোনো retry/timeout policy-তে ধরে নেওয়া network reliable + latency zero।**
3. **"আমরা Kafka ব্যবহার করছি, তাই exactly-once।"** শুধু Kafka-র ভেতরে। বাইরে, আপনি dedupe করেন।
4. **"আমরা আমাদের system চিনি" বলে Raft-কে custom leader election দিয়ে replace করা।** এটা খারাপ হয়। etcd ব্যবহার করুন।
5. **region জুড়ে wall-clock ordering-এ ভরসা করা।** logical বা hybrid clock ব্যবহার করুন।
6. **fencing token ছাড়া lock।** এক লাইন, অসীম ঝামেলা।
7. **"safety-র জন্য" synchronous replication** — না বুঝে যে এটা আপনার tail latency দ্বিগুণ করে।

## আপডেটেড থাকুন

- [Papers We Love](https://paperswelove.org/) — curated systems paper + talk
- [The Morning Paper archive (Adrian Colyer)](https://blog.acolyer.org/) — paper-a-day summary
- [Aphyr — Jepsen](https://jepsen.io/analyses) — adversarial distributed-systems testing
- [Murat Demirbas — Metadata](https://muratbuffalo.blogspot.com/) — distsys research blog

## মূল শিক্ষা

1. **CAP হলো partition-এর সময় behavior নিয়ে; PACELC প্রতিদিনের tradeoff যোগ করে।**
2. **FLP বলে আপনি slow-কে dead থেকে আলাদা করতে পারবেন না** — প্রতিটা consensus protocol workaround হিসেবে timeout ব্যবহার করে।
3. **Raft হলো প্রথমে জানার consensus algorithm**, আর `2f+1` হলো cluster sizing rule।
4. **Linearizability ≠ serializability ≠ snapshot isolation** — আপনার feature-এর আসলে যেটা লাগে সেটা বাছুন।
5. **Idempotency-ই একমাত্র আসল "exactly once"** — pipe নয়, receiver design করুন।
6. **Fencing token-ই একমাত্র safe distributed lock।**
7. **Clock মিথ্যা বলে; ordering গুরুত্বপূর্ণ হলে logical, hybrid বা TrueTime ব্যবহার করুন।**
