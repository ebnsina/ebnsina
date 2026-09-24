---
title: 'Transactions & Lua Scripting'
subtitle: 'MULTI/EXEC, WATCH দিয়ে optimistic locking, এবং Lua দিয়ে atomic multi-step logic।'
chapter: 7
level: 'advanced'
readingTime: '13 মিনিট'
topics: ['multi', 'lua', 'atomicity']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা একটা ব্যাংকের ক্যাশ কাউন্টারে বসেন। এক গ্রাহক এসে বললেন, "আমার সেভিংস থেকে বিশ হাজার টাকা তুলে সেটা কারেন্ট অ্যাকাউন্টে জমা দিন।" এটা তো একটা কাজ নয় — কয়েক ধাপের কাজ: সেভিংস থেকে টাকা কাটা, তারপর কারেন্টে যোগ করা। ফাতিমা যদি প্রথম ধাপটা করে মাঝপথে থেমে অন্য গ্রাহককে সামলাতে যান, তাহলে হিসাব গোলমাল হয়ে যেতে পারে। তাই তিনি চালাক — আগে একটা স্লিপে পুরো কাজের সব ধাপ লিখে ফেলেন, তারপর কাউন্টারে "এক মিনিট" বলে সব ধাপ একটানা, একসাথে সেরে ফেলেন। এই বিরতিহীন বার্স্টের মধ্যে অন্য কোনো গ্রাহক লাইন ভেঙে ঢুকতে পারে না।

আর কিছু কাজ তো রোজই আসে, যেমন "যদি ব্যালেন্স যথেষ্ট থাকে তবেই লোনের কিস্তি কাটো"। এই জটিল অথচ কমন কাজের জন্য ফাতিমার কাছে একটা সিল-করা নির্দেশনা কার্ড আছে — শুরু থেকে শেষ পর্যন্ত এক দমে ফলো করেন, মাঝে থামেন না, কেউ বাধা দিতে পারে না। আবার টাকা তোলার আগে তিনি একবার দেখে নেন এই ফাঁকে ব্যালেন্সটা বদলে যায়নি তো — বদলে গেলে পুরো লেনদেন বাতিল করে নতুন করে শুরু করেন।

এই গল্পটাই আসলে Redis-এর transaction আর scripting। স্লিপে সব ধাপ লিখে এক বার্স্টে সেরে ফেলা হলো **MULTI/EXEC transaction** — command-গুলো queue হয়, তারপর একসাথে চলে, মাঝে অন্য কারো command interleave করতে পারে না। সিল-করা নির্দেশনা কার্ড এক দমে ফলো করা হলো **atomic Lua script** — পুরো logic server-এ atomically চলে, মাঝে কিছু ঢোকে না। আর টাকা তোলার আগে ব্যালেন্স বদলায়নি কিনা যাচাই করা হলো **WATCH** দিয়ে optimistic locking — watch-করা key বদলে গেলে EXEC বাতিল হয়, তুমি retry করো। বাস্তবে ব্যাংকের ফান্ড ট্রান্সফার, ই-কমার্সের স্টক কমানো, বা টিকিট বুকিং — যেখানে কয়েকটা ধাপ মাঝে কিছু না ঢুকিয়ে একসাথে ঘটতে হবে — ঠিক এভাবেই Redis সামলায়।

একটা single Redis command atomic, কিন্তু আসল অপারেশনের প্রায়ই কয়েকটা command-কে একসাথে ঘটতে হয় যেখানে মাঝে কিছু ঢুকে না পড়ে। Redis দুটো tool দেয়: transaction, যা command গ্রুপ করে, এবং Lua scripting, যা server-এ atomically arbitrary logic চালায়। দুটোই single-threaded core-এর উপর নির্ভর করে — কিন্তু Redis transaction তুমি যে database transaction আশা করো তার থেকে ভিন্ন আচরণ করে, এবং সেই পার্থক্য মানুষকে হোঁচট খাওয়ায়।

## MULTI / EXEC: command গ্রুপ করা

`MULTI` একটা transaction খোলে। এর পরে টাইপ করা command **queued** হয়, execute হয় না, প্রতিটা `QUEUED` reply করে। `EXEC` পুরো batch-টা atomically চালায় — অন্য কোনো client-এর command এদের মাঝে interleave করতে পারে না। `DISCARD` queue-টা ফেলে দেয়।

```text
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> SET account:a 100
QUEUED
127.0.0.1:6379> DECRBY account:a 20
QUEUED
127.0.0.1:6379> INCRBY account:b 20
QUEUED
127.0.0.1:6379> EXEC
1) OK
2) (integer) 80
3) (integer) 20
```

`MULTI` আর `EXEC`-এর মাঝে, অন্য কোনো client চলে না। উপরের তিনটা command একটা অবিভাজ্য unit হিসেবে execute হয়। এটাই guarantee — এবং পুরো guarantee।

## কেন এগুলো rollback transaction নয়

SQL থেকে আসা, তুমি আশা করো একটা transaction all-or-nothing হবে: যদি কোনো statement fail করে, পুরোটা roll back করে। **Redis এটা করে না।** যদি একটা queued command _execution-এর সময়_ fail করে, অন্য command-গুলো তখনও চলে, এবং কোনো rollback নেই।

```text
127.0.0.1:6379> SET counter "not-a-number"
OK
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> INCR counter        # will fail at EXEC — not an integer
QUEUED
127.0.0.1:6379> SET flag "done"     # this still runs
QUEUED
127.0.0.1:6379> EXEC
1) (error) ERR value is not an integer or out of range
2) OK                                # flag was set despite the error above
```

আলাদা করার মতো দুই ধরনের failure আছে:

- **queue-এর সময় শনাক্ত হওয়া error** (একটা syntactically ভুল command, একটা unknown command) পুরো transaction বাতিল করে — `EXEC` এটা চালাতে অস্বীকার করে। আধুনিক Redis version থেকে এটা চেক করা হয়।
- **run-time-এ শনাক্ত হওয়া error** (যেমন একটা non-numeric value-তে `INCR`) অন্যগুলো বাতিল _করে না_। খারাপ command-টা `EXEC` ফলাফল array-এর ভেতরে একটা error ফেরত দেয়, এবং বাকি সবকিছু তখনও প্রয়োগ হয়।

Redis-এর author এটা ইচ্ছাকৃতভাবে রক্ষা করেন: run-time error প্রায় সবসময় programming bug যা development-এ ধরা পড়তো, এবং rollback বাদ দেওয়া server-কে সরল আর দ্রুত রাখে। ব্যবহারিক শিক্ষা হলো "transaction = safety net" ভাবা বন্ধ করে "transaction = এই command-গুলো একসাথে চলে, isolated, কোনো rollback ছাড়া" ভাবা। যদি একটা step অর্থপূর্ণভাবে fail করতে পারে, তোমাকে নিজেকেই এটা সামলাতে হবে — এবং Lua সাধারণত ভালো ফিট।

<Callout type="warning">

**নোট:** একটা Redis transaction তোমাকে **atomic isolation** (কোনো interleaving নেই) দেয় কিন্তু **atomic rollback নয়**। ধরে নিও না যে একটা fail করা command তার পূর্বসূরিদের undo করে — এটা করে না। যদি তোমার logic-এর সত্যিই conditional step সহ "all or nothing" দরকার হয়, একটা Lua script-এর দিকে যাও, যা তোমাকে কিছু mutate করার আগে condition চেক করে সিদ্ধান্ত নিতে দেয়।

</Callout>

## WATCH: optimistic locking

একটা transaction একা current data-র উপর ভিত্তি করে সিদ্ধান্ত নিতে পারে না, কারণ command-গুলো চলার আগে queue হয়ে যায়। `WATCH` সেই ফাঁকটা **optimistic concurrency control** দিয়ে পূরণ করে: তুমি এক বা একাধিক key watch করো, এগুলো পড়ো, যা দেখলে তার উপর ভিত্তি করে তোমার transaction গড়ো, এবং `EXEC` শুধু তখনই সফল হয় যদি এর মধ্যে কোনো watched key না বদলায়। যদি কোনোটা বদলায়, `EXEC` nil ফেরত দেয় এবং তুমি retry করো।

```text
127.0.0.1:6379> WATCH stock:item42
OK
127.0.0.1:6379> GET stock:item42
"3"
# application logic: 3 > 0, so we may decrement
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> DECR stock:item42
QUEUED
127.0.0.1:6379> EXEC
1) (integer) 2          # success: nobody else touched stock:item42
```

যদি আরেকটা client `WATCH`-এর পর কিন্তু `EXEC`-এর আগে `stock:item42` modify করে, তাহলে `EXEC` `(nil)` ফেরত দেয় এবং কিছুই প্রয়োগ হয় না — তুমি loop করো এবং আবার চেষ্টা করো। এটা "optimistic" কারণ এটা ধরে নেয় conflict বিরল এবং শুধু একটা সত্যিই ঘটলেই একটা খরচ (একটা retry) দেয়, একটা pessimistic lock-এর মতো নয় যা আগেভাগে সবাইকে block করে। এটা low-contention check-then-act sequence-এর জন্য সঠিক tool।

## Lua scripting: server-এ atomic logic

logic জটিল হলে `WATCH` retry অস্বস্তিকর হয়ে যায়। Lua scripting সেটা পুরোপুরি এড়িয়ে যায়: তুমি `EVAL` দিয়ে একটা script পাঠাও, এবং Redis _পুরো script_-টা atomically চালায় — অন্য কোনো command interleave করে না, step-এর মাঝে কোনো network round-trip নেই, এবং script যে value পড়ে তার উপর ভিত্তি করে branch করতে পারে।

```lua
-- Atomic conditional decrement: only if stock remains
-- KEYS[1] = stock key, ARGV[1] = amount to remove
local current = tonumber(redis.call("GET", KEYS[1]))
if current and current >= tonumber(ARGV[1]) then
    return redis.call("DECRBY", KEYS[1], ARGV[1])
else
    return -1            -- signal "not enough stock"
end
```

```text
127.0.0.1:6379> SET stock:item42 5
OK
127.0.0.1:6379> EVAL "local c=tonumber(redis.call('GET',KEYS[1])) if c and c>=tonumber(ARGV[1]) then return redis.call('DECRBY',KEYS[1],ARGV[1]) else return -1 end" 1 stock:item42 2
(integer) 3
127.0.0.1:6379> EVAL "local c=tonumber(redis.call('GET',KEYS[1])) if c and c>=tonumber(ARGV[1]) then return redis.call('DECRBY',KEYS[1],ARGV[1]) else return -1 end" 1 stock:item42 10
(integer) -1
```

call-এর আকার হলো `EVAL script numkeys key [key ...] arg [arg ...]`। key-গুলো `KEYS`-এর মধ্য দিয়ে যায় এবং অন্য parameter `ARGV`-র মধ্য দিয়ে — সব key name `KEYS`-এ রাখো যাতে script Cluster mode-এ (অধ্যায় 8) সঠিকভাবে কাজ করে, যা key দিয়ে route করে।

প্রতিবার script body আবার না পাঠাতে, একবার load করো এবং SHA hash দিয়ে call করো:

```text
127.0.0.1:6379> SCRIPT LOAD "return redis.call('GET', KEYS[1])"
"a5260dd66ce02462c5b5231c727b3f7772c0bcc5"
127.0.0.1:6379> EVALSHA a5260dd66ce02462c5b5231c727b3f7772c0bcc5 1 greeting
"hello"
```

কেন কঠিন কেসের জন্য Lua একটা `WATCH` loop-কে হারায়: পুরো decision-and-mutation একটা atomic, server-side step-এ ঘটে। retry করার কিছু নেই কারণ কিছুই interleave করতে পারে না, এবং কোনো অতিরিক্ত round-trip নেই। আগের safe lock-release (অধ্যায় 6) — token চেক করো, তারপর মিললেই শুধু delete করো — একটা নিখুঁত উদাহরণ: একটা Lua script হিসেবে এটা atomic; আলাদা `GET` তারপর `DEL` command হিসেবে এর একটা race আছে।

<Callout type="info">

**নোট:** যেহেতু একটা script single thread-কে শেষ না হওয়া পর্যন্ত block করে, script ছোট রাখো এবং এদের ভেতরে বড় collection-এর উপর দীর্ঘ loop বা O(N) কাজ এড়াও। একটা slow script প্রতিটা অন্য client-কে থামিয়ে দেয়, ঠিক একটা slow command-এর মতো। Lua হলো _atomic_, _ছোট_ multi-step logic-এর জন্য — batch processing-এর জন্য নয়।

</Callout>

## Redis Functions

নতুন Redis version **Functions** যোগ করে, scripting-এর একটা বিবর্তন। একটা app উড়িয়ে উড়িয়ে script text পাঠানোর বদলে, তুমি server-এ `FUNCTION LOAD` দিয়ে function-এর একটা named library রেজিস্টার করো, তারপর `FCALL` দিয়ে নাম ধরে এদের invoke করো। এটা server-side logic-কে first-class, deployable code হিসেবে ট্রিট করে — versioned, `FUNCTION LIST` দিয়ে তালিকাভুক্ত, এবং dataset-এর সাথে persist/replicate করা — application জুড়ে ছড়ানো ad-hoc string-এর বদলে। atomicity আর execution model `EVAL`-এর মতোই; Functions মূলত সেই logic কীভাবে সংগঠিত আর ship করা হয় তা উন্নত করে।

পুরো অধ্যায়ের মানসিক model: independent command গ্রুপ করতে **MULTI/EXEC** ব্যবহার করো, সরল optimistic check-then-act-এর জন্য **WATCH**, এবং যখনই logic-এর একটা value পড়ে এবং কী লিখবে তা সিদ্ধান্ত নেওয়ার আগে branch করতে হয় তখন **Lua (বা Functions)**।
