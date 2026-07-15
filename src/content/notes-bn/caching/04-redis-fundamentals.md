---
title: 'Redis Fundamentals'
subtitle: 'ডেটা স্ট্রাকচার, কোর কমান্ড, পার্সিস্টেন্স মোড — প্রোডাকশনে আত্মবিশ্বাসের সাথে Redis চালাতে যা যা দরকার সবকিছু।'
chapter: 4
level: 'intermediate'
readingTime: '18 মিনিট'
topics: ['Redis', 'data structures', 'persistence', 'commands', 'pub/sub']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা সুইস আর্মি নাইফ — শুধু কী-ভ্যালু স্টোর নয়, বরং প্রতিটি নির্দিষ্ট কাজের জন্য গড়া ডেটা স্ট্রাকচারের একটা টুলবক্স।

</Callout>

## গল্পে বুঝি

করিমের একটা মুদি দোকান, আর পেছনে ছোট একটা গুদাম — কিন্তু সে ভয়ানক গোছানো। সবচেয়ে বড় কথা, যা কিছু ঘনঘন লাগে সেসব সে সামনের কাউন্টারেই হাতের নাগালে রাখে, তাই খুঁজতে গুদামে হাঁটতে হয় না, চোখের পলকে বের করে দেয়। কিন্তু প্রতিটা জিনিসের জন্য তার আলাদা রকমের কৌটা-বাক্স আছে, কারণ সব জিনিস তো এক নিয়মে রাখা যায় না। দামি একটা ঘড়ি সে একটামাত্র ছোট বাক্সে আলাদা করে রাখে — একটা লেবেল, একটা জিনিস। খদ্দেরদের অর্ডারের কাগজ সে একটা লম্বা সিরিয়াল ক্লিপে গাঁথে — যেটা আগে ঢুকেছে সেটা আগে বের হবে, লাইন ধরে। ফাতেমার মতো নিয়মিত খদ্দেরদের তথ্য — নাম, ফোন, বাকির হিসাব — সে কাউন্টারের পেছনে একটা ঘরওয়ালা কাঠের র‍্যাকে খোপে খোপে সাজায়, যেন যেকোনো একটা খোপ আলাদা করে খুলে দেখা যায়। যেসব ব্র্যান্ডের মাল সে রাখে তার একটা তালিকা রাখে ঝোলায়, যেখানে প্রতিটা নাম একবারই থাকে, দুবার নয়। আর মাসের সবচেয়ে বেশি বিক্রি হওয়া পণ্যগুলোর একটা মার্কা-দেওয়া তালিকা টাঙিয়ে রাখে, যেখানে সংখ্যা অনুযায়ী উপর থেকে নিচে র‍্যাংক করা।

এত কিছু কাউন্টারে থাকায় করিমের একটা দুশ্চিন্তা — কারেন্ট চলে গেলে বা দোকান বন্ধ করলে কাউন্টারের সব হিসাব তো মাথায় নেই, হারিয়ে যাবে। তাই প্রতিদিন কাজের ফাঁকে সে একটা খাতায় দিনের হিসাব টুকে রাখে, আর দিনশেষে পুরো কাউন্টারের একটা ছবি খাতায় লিখে ফেলে। পরদিন কারেন্ট এলে খাতা দেখে সব আবার সাজিয়ে ফেলা যায় — কিছুই হারায় না।

এই গল্পটাই আসলে **Redis**। কাউন্টার হলো **in-memory** স্টোর — দ্রুত, কিন্তু সবকিছু লেবেল বা **key** ধরে রাখা (**key-value**)। করিমের আলাদা রকমের কৌটা-বাক্সগুলোই Redis-এর **data structure**: একটামাত্র বাক্স = string, সিরিয়াল ক্লিপ = list, খোপওয়ালা র‍্যাক = hash, অনন্য নামের ঝোলা = set, আর মার্কা-দেওয়া র‍্যাংক তালিকা = sorted set। আর দিনশেষে খাতায় হিসাব টুকে রাখাটাই **persistence** — পুরো ছবি টুকে রাখা হলো **RDB** snapshot, আর প্রতিটা লেনদেন সাথে সাথে খাতায় লেখা হলো **AOF** — যাতে কারেন্ট (মানে সার্ভার) গেলেও restart-এর পর ডেটা ফিরে পাওয়া যায়। বাস্তবে session, leaderboard, queue, বা cache — সব এভাবেই Redis-এ সঠিক আকারের data structure-এ রাখা হয়।

## Redis আসলে কী

Redis হলো একটা ইন-মেমরি ডেটা স্ট্রাকচার সার্ভার। শুধু কী-ভ্যালু স্টোর নয় — এটা Strings, Lists, Sets, Sorted Sets, Hashes, Streams আরও অনেক কিছু বোঝে। এটা গুরুত্বপূর্ণ: সঠিক ডেটা স্ট্রাকচার অ্যাপ্লিকেশন-লেভেলের লজিক কমিয়ে দেয় এবং round trip কমায়।

কমান্ড এক্সিকিউশনের জন্য এটা single-threaded, যার ফলে লেটেন্সি হয় predictable এবং কোনো locking লাগে না। একটা মাত্র Redis instance সাধারণ হার্ডওয়্যারে সেকেন্ডে প্রায় ১০০,০০০ (~100,000) অপারেশন সামলাতে পারে।

## কোর ডেটা স্ট্রাকচার

### Strings

সবচেয়ে সরল টাইপ। টেক্সট, নাম্বার, বা বাইনারি ডেটা 512MB পর্যন্ত রাখে। atomic increment/decrement-ও সাপোর্ট করে।

```bash
SET user:1:name "Fatima"
GET user:1:name           # "Fatima"
SET counter 0
INCR counter              # 1
INCRBY counter 10         # 11
SETNX user:1:name "Omar"  # 0 — key exists, no-op
SETEX session:abc 3600 "data"  # set with TTL in one command
```

```typescript
import { createClient } from 'redis';

const redis = createClient({ url: 'redis://localhost:6379' });
await redis.connect();

await redis.set('user:1:name', 'Fatima');
await redis.setEx('session:abc', 3600, JSON.stringify(sessionData));

const name = await redis.get('user:1:name');
const count = await redis.incr('counter');
```

### Hashes

একটা key-এর ভেতরে field → value-এর একটা map। JSON-এ সিরিয়ালাইজ না করেই অবজেক্ট রাখার জন্য একদম উপযুক্ত।

```bash
HSET user:1 name "Fatima" email "fatima@example.com" age 30
HGET user:1 name           # "Fatima"
HGETALL user:1             # { name, email, age }
HINCRBY user:1 age 1       # 31
HDEL user:1 age
```

```typescript
await redis.hSet('user:1', {
	name: 'Fatima',
	email: 'fatima@example.com',
	age: '30'
});

const user = await redis.hGetAll('user:1');
// { name: 'Fatima', email: 'fatima@example.com', age: '30' }
```

**Hash বনাম JSON string:** Hashes দিয়ে পুরো অবজেক্ট deserialize না করেই আলাদা আলাদা field আপডেট করা যায়। যখন আপনি প্রায়ই অবজেক্টের অংশবিশেষ আপডেট করেন, তখন hashes ব্যবহার করুন। আর যখন সবসময় পুরো অবজেক্ট পড়েন, তখন JSON strings ব্যবহার করুন।

### Lists

সাজানো ক্রম (ordered sequences)। যেকোনো প্রান্ত থেকে push/pop করা যায়। queue, activity feed, এবং job list-এ ব্যবহৃত হয়।

```bash
RPUSH jobs "job:1" "job:2" "job:3"   # push to right (tail)
LPOP jobs                             # pop from left (head) → "job:1"
LRANGE jobs 0 -1                      # all elements
LLEN jobs                             # length

# Blocking pop — waits up to 30s for an element
BLPOP jobs 30
```

```typescript
// Simple job queue
async function enqueue(job: Job): Promise<void> {
	await redis.rPush('jobs', JSON.stringify(job));
}

async function dequeue(): Promise<Job | null> {
	// Block for up to 5 seconds waiting for a job
	const result = await redis.blPop('jobs', 5);
	if (!result) return null;
	return JSON.parse(result.element);
}
```

### Sets

সাজানো নয় এমন অনন্য (unique) member। দ্রুত membership check, union, intersection।

```bash
SADD tags:post:1 "typescript" "backend" "redis"
SISMEMBER tags:post:1 "redis"   # 1 (true)
SISMEMBER tags:post:1 "golang"  # 0 (false)
SMEMBERS tags:post:1            # all members
SCARD tags:post:1               # count: 3

# Set operations
SUNION tags:post:1 tags:post:2  # union
SINTER tags:post:1 tags:post:2  # intersection
```

### Sorted Sets

Sets-এর মতোই, তবে প্রতিটি member-এর একটা score (float) থাকে। member-গুলো score অনুযায়ী সাজানো থাকে। leaderboard, rate limiting, এবং priority queue-তে ব্যবহৃত হয়।

```bash
ZADD leaderboard 1500 "fatima" 1200 "omar" 1800 "maryam"
ZRANK leaderboard "fatima"           # rank (0-indexed): 1
ZREVRANK leaderboard "maryam"        # top rank: 0
ZRANGE leaderboard 0 2 WITHSCORES  # top 3
ZINCRBY leaderboard 50 "fatima"      # fatima score → 1550
```

```typescript
// Rate limiter using sorted set
async function isRateLimited(userId: string, limit: number, windowMs: number): Promise<boolean> {
	const now = Date.now();
	const windowStart = now - windowMs;
	const key = `ratelimit:${userId}`;

	await redis
		.multi()
		.zRemRangeByScore(key, '-inf', windowStart) // remove old entries
		.zAdd(key, { score: now, value: `${now}` }) // add current request
		.expire(key, Math.ceil(windowMs / 1000)) // auto-cleanup
		.exec();

	const count = await redis.zCard(key);
	return count > limit;
}
```

## Expiration

তৈরির সময়েই TTL সেট করুন, অথবা পরে যোগ করুন:

```bash
SET session:abc "data" EX 3600     # seconds
SET session:abc "data" PX 3600000  # milliseconds
EXPIRE session:abc 3600            # set TTL on existing key
TTL session:abc                    # seconds remaining (-1 = no TTL, -2 = gone)
PERSIST session:abc                # remove TTL, make permanent
```

<Callout type="tip">

**cache key-এ সবসময় একটা TTL সেট করুন।** একমাত্র ব্যতিক্রম হলো ইচ্ছাকৃতভাবে persistent রাখা ডেটা। যে cache কখনো expire হয় না, সেটা একটা memory leak।

</Callout>

## Transaction দিয়ে Atomic Operation

`MULTI`/`EXEC` কমান্ডগুলোকে একটা atomic block-এ একত্র করে। সব কমান্ড চলবে, নয়তো একটাও চলবে না — তবে SQL-এর বিপরীতে, আলাদা কোনো কমান্ডে error হলে rollback হয় না।

```typescript
async function transferPoints(from: string, to: string, points: number): Promise<void> {
	const multi = redis.multi();
	multi.decrBy(`points:${from}`, points);
	multi.incrBy(`points:${to}`, points);
	await multi.exec();
}
```

শর্তসাপেক্ষ লজিকের জন্য `WATCH` ব্যবহার করুন:

```typescript
async function compareAndSwap(key: string, expected: string, next: string): Promise<boolean> {
	await redis.watch(key);

	const current = await redis.get(key);
	if (current !== expected) {
		await redis.unwatch();
		return false;
	}

	const result = await redis.multi().set(key, next).exec();

	return result !== null; // null means WATCH key changed — transaction aborted
}
```

## Pub/Sub

Redis সরল fanout use case-এর জন্য একটা message broker হিসেবে কাজ করতে পারে।

```typescript
// Publisher
const publisher = createClient();
await publisher.connect();
await publisher.publish('notifications', JSON.stringify({ userId: '123', msg: 'Hello' }));

// Subscriber
const subscriber = createClient();
await subscriber.connect();
await subscriber.subscribe('notifications', (message) => {
	const data = JSON.parse(message);
	console.log('Received:', data);
});
```

<Callout type="warning">

**Redis Pub/Sub-এ কোনো persistence নেই।** একজন subscriber disconnected থাকা অবস্থায় পাঠানো message হারিয়ে যায়। নির্ভরযোগ্য messaging-এর জন্য Redis Streams বা একটা যথাযথ message queue (Kafka, RabbitMQ) ব্যবহার করুন।

</Callout>

## Persistence

Redis ইন-মেমরি হলেও দুটো persistence মোড সাপোর্ট করে:

**RDB (Redis Database Backup)** — পুরো dataset-এর পর্যায়ক্রমিক snapshot ডিস্কে রাখে। দ্রুত restart। ঝুঁকি: শেষ snapshot-এর পর হওয়া পরিবর্তনগুলো হারানো।

```bash
# redis.conf
save 900 1      # snapshot if ≥1 key changed in 900s
save 300 10     # snapshot if ≥10 keys changed in 300s
save 60 10000   # snapshot if ≥10000 keys changed in 60s
```

**AOF (Append Only File)** — প্রতিটি write কমান্ড লগ করে। বেশি durable। বড় ফাইল, ধীর restart।

```bash
appendonly yes
appendfsync everysec   # fsync every second (good balance)
# appendfsync always   # fsync every write (slowest, most durable)
# appendfsync no       # let OS decide (fastest, least durable)
```

**কোনটা ব্যবহার করবেন:**

|                | RDB                 | AOF                   |
| -------------- | ------------------- | --------------------- |
| Recovery speed | দ্রুত               | ধীর                   |
| Data loss      | কয়েক মিনিট পর্যন্ত | ১ সেকেন্ড পর্যন্ত     |
| File size      | ছোট                 | বড়                   |
| Use case       | Cache               | Session store, queues |

শুধুমাত্র cache-এর জন্য RDB ঠিক আছে — কয়েক মিনিটের cache হারানো মেনে নেওয়া যায়, কারণ এটা DB থেকে আবার populate হয়ে যায়। session বা queue-এর জন্য AOF ব্যবহার করুন, অথবা persistence পুরোপুরি বন্ধ রেখে restart-এ state হারানো মেনে নিন।

## Key Design

ভালো Redis key design collision ঠেকায় এবং debugging সহজ করে:

```
service:entity:id:field
catalog:product:123
auth:session:abc123
ratelimit:api:user:456
leaderboard:weekly:scores
```

**key ছোট রাখুন** — Redis key-গুলো মেমরিতে রাখে। লক্ষ লক্ষ key-এর ক্ষেত্রে `u:1` বনাম `user:1` অনেক পার্থক্য গড়ে দেয়।

**একই লজিক্যাল অবজেক্টের জন্য অতিরিক্ত key ব্যবহার করবেন না** — একই user অবজেক্টের জন্য ২০টা আলাদা string key-এর চেয়ে একটা Hash ভালো।

```typescript
// Bad: 20 keys per user
await redis.set(`user:${id}:name`, name);
await redis.set(`user:${id}:email`, email);
// ...

// Good: 1 hash per user
await redis.hSet(`user:${id}`, { name, email, age: String(age) });
```

## Monitoring

```bash
redis-cli INFO stats        # hits, misses, evictions
redis-cli INFO memory       # used_memory, maxmemory
redis-cli MONITOR           # real-time command stream (dev only)
redis-cli --latency         # latency histogram
redis-cli --hotkeys         # top accessed keys (requires maxmemory-policy LFU)
```

যে key মেট্রিকগুলো নজরে রাখবেন:

- `keyspace_hits` / `keyspace_misses` → hit ratio
- `evicted_keys` → নন-জিরো হলে বুঝবেন আপনার cache আকারে ছোট পড়েছে
- `used_memory` বনাম `maxmemory` → কতটা headroom আছে
- `connected_clients` → connection pool-এর স্বাস্থ্য
- `blocked_clients` → queue-এর গভীরতা (BLPOP-এর অপেক্ষা)
