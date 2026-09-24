---
title: 'Production-এ Redis চালানো'
subtitle: 'Memory, latency, monitoring, security, এবং যেসব ফাঁদ instance ডাউন করে দেয়।'
chapter: 9
level: 'mastery'
readingTime: '14 মিনিট'
topics: ['production', 'monitoring', 'performance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বড় গুদামটার ম্যানেজার ফাতিমা। তার হাতে সেই ক্ষিপ্রগতির কেরানি সিনা — যে সব তথ্য মাথায় গেঁথে রাখে বলে চোখের পলকে যেকোনো জিনিসের হদিস দিয়ে দেয়। কিন্তু সিনার মাথারও তো একটা সীমা আছে। তাই ফাতিমা প্রতিদিন খেয়াল রাখে সিনার মাথায় ঠিক কতটা বোঝা জমেছে — কানায় কানায় ভরে গেলে সিনা আর নতুন কিছু মনে রাখতে পারবে না, উল্টো পুরনো জিনিস গুলিয়ে ফেলবে। তাই ফাতিমা আগে থেকেই একটা সীমা বেঁধে দিয়েছে: বোঝা বেশি হয়ে গেলে সিনা যেন সবচেয়ে পুরনো, কম-দরকারি তথ্যগুলো নিজে থেকেই ঝেড়ে ফেলে দেয়।

সবচেয়ে বড় নিয়মটা ফাতিমা কড়া গলায় সবাইকে বুঝিয়ে দিয়েছে — সিনাকে কখনো একসঙ্গে "গুদামের সব মালের নাম এক নিঃশ্বাসে বলে যাও" টাইপের কাজ দেওয়া যাবে না। কারণ সিনা সেই বিশাল তালিকা আওড়াতে বসলে ততক্ষণ পুরো লাইন থমকে যায়, পেছনের কোনো কাস্টমার এক গ্লাস পানিও পায় না। কারো যদি অনেক তথ্য একসঙ্গে লাগে, সে যেন ছোট ছোট ভাগে সিনার কাছ থেকে নেয়। আর সিনা যদি হঠাৎ অজ্ঞান হয়ে পড়ে? সে ভয়ে ফাতিমা প্রতিদিন সিনার মাথার সব তথ্যের একটা লিখিত কপি খাতায় তুলে রাখে — কেরানি ঘুরে দাঁড়ালেই যেন সব আবার ফিরে পাওয়া যায়।

গল্পটাই আসলে production-এ Redis চালানো। সিনার মাথায় বোঝা মাপাটাই **memory monitoring** (`INFO memory`, fragmentation ratio) আর সীমা বেঁধে দেওয়াটাই **maxmemory + eviction policy**। "সব মাল এক নিঃশ্বাসে বলো" ধরনের কাজ হলো `KEYS`-এর মতো **blocking O(N) command** — single thread বলে ওটা চলাকালীন বাকি সব client থমকে থাকে, তাই ছোট ভাগে `SCAN`/`HSCAN` দিয়ে iterate করতে হয়। আর লিখিত কপি রাখাটাই **backup** (persistence)। বাস্তবে এভাবেই একটা Redis instance-কে দ্রুত, নিরাপদ আর predictable রাখা হয় — cap না বসালে OS একদিন process-টাকেই kill করে দেয়, আর একটা fat-fingered `KEYS *` গোটা সার্ভিসকে সেকেন্ডের জন্য জমিয়ে দিতে পারে।

Development-এ Redis চালানো তুচ্ছ। এটাকে আসল load-এর অধীনে চালানো, যেখানে একটা blocking command হাজারো client-কে থামিয়ে দেয় এবং একটা লাগামছাড়া dataset eviction storm trigger করে, operational শৃঙ্খলা দাবি করে। এই শেষ অধ্যায়টা সেই ব্যবহারিক জ্ঞান যা একটা production Redis-কে দ্রুত, safe, এবং predictable রাখে — কী মাপতে হবে, কী এড়াতে হবে, এবং কীভাবে এটা lock down করতে হবে।

## Memory management আর fragmentation

Redis memory দিয়ে বাঁচে আর মরে। `INFO memory` দেখার প্রথম জায়গা।

```text
127.0.0.1:6379> INFO memory
# Memory
used_memory_human:1.85G          # memory holding your data
used_memory_rss_human:2.10G      # memory the OS sees this process using
mem_fragmentation_ratio:1.14     # rss / used_memory
maxmemory_human:4.00G
maxmemory_policy:allkeys-lru
```

দুটো number সবচেয়ে গুরুত্বপূর্ণ। `used_memory` হলো তোমার ডেটার যা দরকার; `used_memory_rss` হলো OS আসলে process-কে যা দিয়েছে। এদের অনুপাত, `mem_fragmentation_ratio`, গল্পটা বলে:

- **প্রায় 1.0 থেকে 1.5** স্বাস্থ্যকর — allocator থেকে সামান্য overhead।
- **1.5-এর অনেক উপরে** fragmentation নির্দেশ করে: allocator মুক্ত করা memory ধরে রাখে যা এটা ফেরত দিতে পারে না, অনেক varied-size write আর delete-এর পর সাধারণ। `activedefrag yes` দিয়ে active defragmentation এটা ধীরে ধীরে ফিরিয়ে নিতে পারে।
- **1.0-এর নিচে** মানে Redis-কে OS দ্বারা disk-এ swap করা হয়েছে — একটা গুরুতর সমস্যা, কারণ swap microsecond memory access-কে millisecond disk access-এ পরিণত করে এবং Redis-এর পুরো premise ধ্বংস করে। swap disable করো বা `vm.overcommit_memory = 1` সেট করো এবং `maxmemory`-কে physical RAM-এর আরামে নিচে রাখো।

`maxmemory` স্পষ্টভাবে সেট করো (অধ্যায় 3) headroom সহ — Redis-কে কখনো ধরে নিতে দিও না যে এটা সব RAM-এর মালিক, কারণ persistence-এর জন্য fork ভারী write-এর অধীনে সাময়িকভাবে memory দ্বিগুণ করতে পারে।

## Slow command খুঁজে বের করা

যেহেতু core single-threaded, **একটা** slow command প্রতিটা অন্য client-কে দেরি করায়। slow log সেসব command capture করে যা একটা microsecond threshold ছাড়ায়।

```text
127.0.0.1:6379> CONFIG SET slowlog-log-slower-than 10000   # 10ms, in microseconds
OK
127.0.0.1:6379> SLOWLOG GET 2
1) 1) (integer) 14                # entry id
   2) (integer) 1718553600        # timestamp
   3) (integer) 42851             # microseconds taken
   4) 1) "KEYS"                   # the offending command
      2) "user:*"
127.0.0.1:6379> SLOWLOG RESET
OK
```

slow log নিয়মিত পর্যালোচনা করো। সাধারণ অপরাধী হলো বড় collection-এর উপর O(N) command: `KEYS`, বড় `LRANGE`/`SMEMBERS`/`HGETALL`, বড় `ZRANGEBYSCORE`, এবং unbounded `SORT`। `LATENCY` subsystem (`LATENCY LATEST`, `LATENCY DOCTOR`) latency spike আর এদের সম্ভাব্য কারণ track করে এটার পরিপূরক হয়, fork pause আর persistence-এর সময় slow disk সহ।

## Monitor করার মূল metric

`INFO` থেকে এগুলো তোমার monitoring-এ যুক্ত করো এবং trend track করো, শুধু instantaneous value নয়:

| Metric                   | Source                             | কী নজরে রাখবে                    |
| ------------------------ | ---------------------------------- | -------------------------------- |
| Memory used vs maxmemory | `used_memory`, `maxmemory`         | cap-এর কাছে পৌঁছানো              |
| Fragmentation ratio      | `mem_fragmentation_ratio`          | 1.5-এর উপরে, বা 1.0-এর নিচে      |
| Hit rate                 | `keyspace_hits`, `keyspace_misses` | একটা পড়তি cache hit ratio       |
| Evicted keys             | `evicted_keys`                     | বাড়ছে — memory pressure         |
| Expired keys             | `expired_keys`                     | pattern-এ হঠাৎ পরিবর্তন          |
| Connected clients        | `connected_clients`                | `maxclients`-এর কাছে             |
| Blocked clients          | `blocked_clients`                  | আটকে থাকা `BRPOP`/`BLPOP` worker |
| Ops per second           | `instantaneous_ops_per_sec`        | অপ্রত্যাশিত spike                |
| Replication lag          | `master_repl_offset` vs replica    | বাড়ন্ত lag                      |
| Rejected connections     | `rejected_connections`             | nonzero — limit-এ                |

cache hit ratio হলো `keyspace_hits / (keyspace_hits + keyspace_misses)`। একটা পতন প্রায়ই মানে TTL খুব ছোট, working set memory ছাড়িয়ে গেছে, বা eviction hot key ফেলে দিচ্ছে।

## Big key আর O(N) command এড়ানো

একটা production Redis ধ্বংস করার দুটো সবচেয়ে সাধারণ উপায় হলো big key আর blocking command — এবং এরা একে অপরকে বাড়িয়ে তোলে।

- **Big key।** একটা single key যা লক্ষ লক্ষ element ধরে (একটা বিশাল list, set, hash, বা sorted set) বিপজ্জনক: এর উপর যেকোনো O(N) অপারেশন server-কে দীর্ঘ সময় block করে, এবং `DEL` দিয়ে এটা delete করা প্রতিটা element মুক্ত করার সময় block করে। বড় key-এর জন্য `DEL`-এর বদলে `UNLINK` ব্যবহার করো — এটা একটা background thread-এ memory মুক্ত করে। `redis-cli --bigkeys` বা `MEMORY USAGE somekey` দিয়ে big key শিকার করো।
- **স্কেলে O(N) command।** এক মিলিয়ন field সহ একটা hash-এ `HGETALL`, একটা বিশাল set-এ `SMEMBERS`, একটা লম্বা list-এ `LRANGE 0 -1` — প্রতিটা আকারের সমানুপাতে ship করে এবং block করে। বদলে cursor command `HSCAN`, `SSCAN`, `ZSCAN` দিয়ে iterate করো, এবং key design করো যাতে collection bounded থাকে (একটা বিশাল set অনেক key জুড়ে shard করো, stream আর list `MAXLEN`/`LTRIM` দিয়ে cap করো)।

```text
127.0.0.1:6379> MEMORY USAGE leaderboard:global
(integer) 4823120
127.0.0.1:6379> UNLINK leaderboard:global      # non-blocking delete
(integer) 1
```

<Callout type="warning">

**নোট:** production-এর বিরুদ্ধে কখনো `KEYS`, `FLUSHALL`, বা একটা multi-million-element key-এর `DEL` চালিও না। প্রতিটা single thread-কে client time out করার মতো যথেষ্ট দীর্ঘ block করে এবং একটা spurious failover trigger করতে পারে। iterate করতে `SCAN`, বড় key delete করতে `UNLINK`, এবং সবকিছু clear করতেই হলে `FLUSHALL ASYNC` ব্যবহার করো।

</Callout>

## Connection pooling

প্রতিটা অপারেশনের জন্য একটা TCP connection খোলা অপচয়মূলক এবং load-এর অধীনে `maxclients` নিঃশেষ করবে। client-দের একটা **connection pool** ব্যবহার করা উচিত: reused connection-এর একটা fixed সেট যা প্রতি অপারেশনে দেওয়া হয় এবং ফেরত নেওয়া হয়। pool-কে তোমার concurrency-র সাথে মাপো — contention এড়াতে যথেষ্ট connection, server-এর `maxclients`-এর ভালোভাবে নিচে থাকতে যথেষ্ট কম। pool ঠিকভাবে মাপা হয়েছে নিশ্চিত করতে `connected_clients` আর `rejected_connections` নজরে রাখো। throughput-এর জন্য, independent command **pipeline** করো (reply পড়ার আগে অনেকগুলো পাঠাও) network round-trip amortize করতে, যা RESP protocol সস্তা করে।

## Security

Redis ঐতিহাসিকভাবে trusted network-এর জন্য design করা এবং default-এ বিপজ্জনকভাবে উন্মুক্ত। এটা lock down করো।

- **Protected mode আর binding।** default-এ Redis localhost-এ bind করে এবং authentication ছাড়া external connection প্রত্যাখ্যান করে (protected mode)। কখনো Redis সরাসরি internet-এ expose করো না। private interface-এ bind করো এবং এটা একটা firewall-এর পেছনে রাখো।
- **Authentication আর ACL।** একটা strong password সেট করো এবং, আরও ভালো, নির্দিষ্ট command আর key pattern-এ সীমিত user তৈরি করতে **ACL** ব্যবহার করো। একটা cache user-এর `FLUSHALL` বা `CONFIG` চালানোর দরকার নেই।

```text
127.0.0.1:6379> ACL SETUSER appuser on >S3cret-pass ~cache:* +get +set +del
OK
127.0.0.1:6379> ACL WHOAMI
"default"
127.0.0.1:6379> ACL LIST
1) "user default on nopass ~* &* +@all"
2) "user appuser on #... ~cache:* +get +set +del"
```

- **বিপজ্জনক command rename বা disable করো।** `FLUSHALL`, `CONFIG`, `DEBUG`, আর `KEYS`-কে application user-দের জন্য নিষ্ক্রিয় করতে `rename-command` (বা ACL restriction) ব্যবহার করো যাতে একটা compromised app বা একটা fat-fingered query server wipe বা reconfigure করতে না পারে।
- **In transit encrypt করো।** untrusted network পার হওয়া connection-এর জন্য TLS enable করো।

<Callout type="tip">

**নোট:** access control-এর জন্য Redis-কে অন্য যেকোনো datastore-এর মতো ট্রিট করো: ACL দিয়ে প্রতি client-এ least privilege, কোনো internet exposure নেই, secret তোমার secret manager-এ, git-এ commit করা config ফাইলে নয়, এবং app user-দের জন্য বিপজ্জনক command disabled। সবচেয়ে সাধারণ Redis breach হলো একটা public IP-তে bind করা একটা unauthenticated instance — সেই instance হয়ো না।

</Callout>

## সাধারণ ফাঁদ, একত্রিত

পুরো ট্র্যাক থেকে ছেঁকে নেওয়া একটা checklist:

- **কোনো `maxmemory` সেট নেই** — Redis বাড়তে থাকে যতক্ষণ না OS একে kill করে। সবসময় এটা cap করো।
- **ভুল eviction policy** — মূল্যবান ডেটা ধরে থাকা একটা instance-এ `allkeys-lru` তোমার প্রয়োজনীয়টা evict করে। policy-কে role-এর সাথে মেলাও।
- **write দ্বারা TTL মুছে যাওয়া** — একটা key overwrite করার সময় expiry আবার সেট করো (অধ্যায় 3)।
- **Pub/Sub-কে একটা reliable queue হিসেবে ব্যবহার করা** — এটা message হারায়; Streams বা list ব্যবহার করো (অধ্যায় 5, 6)।
- **transaction roll back করে ধরে নেওয়া** — এরা করে না (অধ্যায় 7)।
- **fencing ছাড়া correctness-এর জন্য ব্যবহৃত একটা distributed lock** — pause-এর অধীনে unsafe (অধ্যায় 6)।
- **Big key আর O(N) command** — latency spike-এর শীর্ষ কারণ।
- **একটা single instance-কে durable হিসেবে ট্রিট করা** — role-এর জন্য persistence আর replication configure করো (অধ্যায় 4, 8)।
- **auth ছাড়া Redis expose করা** — ক্লাসিক breach।

এই পুরো ট্র্যাকের সূত্র: Redis দ্রুত আর সরল ঠিক এই কারণে যে এটা পছন্দগুলো তোমার উপর ঠেলে দেয়। এটা তোমার durability প্রয়োজন, তোমার eviction strategy, তোমার consistency প্রয়োজনীয়তা, বা তোমার security posture অনুমান করে না। এটা ভালোভাবে চালানো মূলত সেই পছন্দগুলোর প্রতিটা ইচ্ছাকৃতভাবে নেওয়ার শৃঙ্খলা — এবং যে single thread এই সবকিছু সম্ভব করে তাকে সম্মান করা।
