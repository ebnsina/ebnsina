---
title: 'Consensus: Raft & Paxos'
subtitle: 'Failure সত্ত্বেও একদল মেশিন কীভাবে একটি একক মানে একমত হয়: leader election, log replication, এবং Raft-এর একটি পূর্ণ walkthrough।'
chapter: 6
level: 'advanced'
readingTime: '13 মিনিট'
topics: ['consensus', 'raft', 'paxos']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সাগরে সাত-আটটা মাছ ধরার নৌকার একটা বহর। মাছের ঝাঁক কোন দিকে সেটা নিয়ে সবার আন্দাজ আলাদা, রেডিওর সিগন্যালও থেকে থেকে কেটে যায় — কেউ একটা কথা বলল তো অর্ধেক নৌকা শুনতেই পেল না। তবু সবাইকে একটাই স্পটে জাল ফেলতে হবে, নইলে বহর ছড়িয়ে গিয়ে জাল প্যাঁচ লাগবে আর ধরা মাছও কম। তাই তারা একটা নিয়ম বানাল: একটা নৌকাকে লিড ধরা হবে, সে-ই স্পট প্রস্তাব করবে। এবারের লিড ইবনে রুশদের নৌকা — সে রেডিওতে হাঁক দিল, "উত্তর-পুবের চরের কাছে জাল ফেলি।"

কিন্তু ইবনে রুশদ একা বললেই স্পট চূড়ান্ত হয় না। বাকিরা শুনে "রাজি" সিগন্যাল ফেরত পাঠায়, আর অর্ধেকের বেশি নৌকা রাজি হলে তবেই স্পটটা পাকা — আল-বিরুনি আর দুই-একটা নৌকা রেডিও রেঞ্জের বাইরে থাকলেও বাকিদের সংখ্যাগরিষ্ঠতা থাকায় সিদ্ধান্ত আটকায় না। এবার ধরো ঝড়ে ইবনে রুশদের নৌকা রেঞ্জের বাইরে হারিয়ে গেল, হাঁক থামল। কিছুক্ষণ কারও হাঁক না পেয়ে আল-খোয়ারিজমির নৌকা নিজেকে নতুন লিড ঘোষণা করে, বাকিদের রাজি করিয়ে বহর আবার চলতে থাকে। আর প্রতিটা নৌকা রাজি-হওয়া স্পটটা নিজের লগবইয়ে একই ক্রমে টুকে রাখে — পরে মিলিয়ে দেখলে সবার খাতা এক।

এই গল্পটাই **consensus**। প্রতিটা নৌকা একেকটা **node**, লিড নৌকা হলো নির্বাচিত **leader**, আর "অর্ধেকের বেশি রাজি" হলো **quorum** (majority) — তাই কয়েকটা নৌকা অকেজো থাকলেও সিদ্ধান্ত আটকায় না। লিড হারিয়ে গেলে নতুন লিড বেছে নেওয়াটাই **leader re-election**, আর সবার লগবইয়ে একই ক্রমে স্পট টুকে রাখাটাই **replicated log**। বাস্তবে **Raft** ঠিক এভাবেই কাজ করে — একজন leader, majority quorum, আর replicated log — আর etcd, ZooKeeper, Consul-এর মতো সিস্টেম এই algorithm-এর উপরই দাঁড়িয়ে; Paxos একই সমস্যা আগে সমাধান করলেও Raft বোঝা সহজ বলে নতুন সিস্টেমগুলো এটাকেই বেছে নেয়।

**Consensus** হলো একদল মেশিনকে একটি একক মানে — বা, আরও দরকারিভাবে, একটি একক order করা মানের ক্রমে — একমত করানোর সমস্যা, এমনকি যখন সেই মেশিনগুলোর কিছু crash করে আর network message drop করে। এটা নির্ভরযোগ্য distributed system-এর স্পন্দিত হৃদয়: leader election, distributed lock, configuration management, এবং গত অধ্যায়ের strongly consistent (CP) store সবই ছদ্মবেশে consensus। এই অধ্যায় সমস্যাটা ব্যাখ্যা করে আর Raft-এর মধ্য দিয়ে হাঁটে, যে algorithm-টা বোধগম্য হওয়ার জন্য ডিজাইন করা।

## Consensus সমস্যা

একটি সঠিক consensus algorithm-কে চারটি বৈশিষ্ট্য মেটাতে হবে:

- **Agreement:** কোনো দুটি non-faulty node ভিন্ন মানে সিদ্ধান্ত নেয় না।
- **Validity (integrity):** যে মান সিদ্ধান্ত হলো তা আসলে কোনো node প্রস্তাব করেছিল — সিস্টেম কোনো মান বানিয়ে ফেলতে পারে না।
- **Termination:** প্রতিটি non-faulty node অবশেষে সিদ্ধান্ত নেয় (এটা চিরকাল ঝুলে থাকে না)।
- **Fault tolerance:** কিছু node crash করলেও উপরের সবগুলো টেকে।

এই সবকিছু অর্জন করা সত্যিই কঠিন। অধ্যায় ২-এর FLP ফলাফল মনে করো: একটি সম্পূর্ণ asynchronous network-এ যেখানে একটিমাত্র node-ও crash করতে পারে, _কোনো_ algorithm safety ও termination দুটোই গ্যারান্টি করতে পারে না। ব্যবহারিক algorithm এটা এড়ায় এই ধরে নিয়ে যে network বেশিরভাগ সময় সময়মতো (timeout ব্যবহার করে) যাতে তারা সবসময় _safe_ থাকে (কখনো দুটি ভিন্ন মানে সিদ্ধান্ত নেয় না) আর network ঠিকঠাক আচরণ করলে _অবশেষে_ terminate করে।

## Quorum এবং কেন একটি বিজোড় সংখ্যা দরকার

Consensus algorithm একটি **majority quorum** ব্যবহার করে অগ্রগতি করে: যেকোনো সিদ্ধান্তে অর্ধেকের বেশি node-এর সম্মতি লাগে। যেহেতু একই দলের যেকোনো দুটি majority-কে অন্তত একটি node ভাগ করতেই হবে, দুটি সাংঘর্ষিক সিদ্ধান্ত কখনো দুটোই একটি majority জোগাড় করতে পারে না — সেই ভাগ করা node-কে দুটোর জন্যই ভোট দিতে হতো, যা সে করতে অস্বীকার করে। এটাই agreement গ্যারান্টি করে।

N node-এর একটি majority একটি _সংখ্যালঘুর_ failure সহ্য করে:

| Node (N) | দরকারি majority | সহ্য করা failure |
| -------- | --------------- | ---------------- |
| 3        | 2               | 1                |
| 5        | 3               | 2                |
| 7        | 4               | 3                |

খেয়াল করো 4 node শুধু 1 failure সহ্য করে — 3-এর সমান — তাই cluster প্রায় সবসময় একটি **বিজোড় সংখ্যায়** আকার দেওয়া হয়। একটি partition-এর সংখ্যালঘু পক্ষ একটি majority গঠন করতে পারে না, তাই এটা থামে; এটাই ঠিক সেই CP আচরণ যা সিস্টেমকে তার brain ভাগ করা থেকে রক্ষা করে।

## Raft: যে consensus তুমি অনুসরণ করতে পারো

Raft সুস্পষ্টভাবে Paxos-এর চেয়ে বোঝা সহজ হওয়ার জন্য ডিজাইন করা হয়েছিল, একইসাথে সমান সক্ষম। এটা consensus-কে তিন টুকরোয় ভাগ করে: **leader election**, **log replication**, এবং **safety**। প্রতিটি node যেকোনো সময় তিনটি অবস্থার একটিতে থাকে:

- **Follower:** নিষ্ক্রিয়; leader ও candidate-কে সাড়া দেয়।
- **Candidate:** একটি node যে leader হওয়ার চেষ্টা করছে।
- **Leader:** একক node যে বর্তমান term-এর সব client request সামলায়।

### Term: cluster-এর জন্য logical time

Raft time-কে **term**-এ ভাগ করে, ধারাবাহিকভাবে সংখ্যায়িত। প্রতিটি term একটি election দিয়ে শুরু হয়। একটি term হলো একটি logical clock (অধ্যায় ৭) যা node-কে বাসি তথ্য শনাক্ত করতে দেয়: প্রতিটি message তার প্রেরকের term বহন করে, আর যেকোনো node যেটা একটি উচ্চতর term দেখে তা তাৎক্ষণিকভাবে follower-এ নেমে গিয়ে সেটা গ্রহণ করে। প্রতি term-এ সর্বোচ্চ একজন leader নির্বাচিত হয়।

### Leader election

প্রতিটি follower একটি randomized **election timeout** চালায় (ধরো, 150–300ms)। একটি leader-এর কথা না শুনে এতটা সময় গেলে, সে সন্দেহ করে leader মৃত আর একটি election শুরু করে:

```text
1. Follower increments its term and becomes a Candidate.
2. It votes for itself and sends RequestVote RPCs to all other nodes.
3. Each node grants its vote to the first valid candidate it sees in that
   term (one vote per term), provided the candidate's log is at least as
   up to date as its own.
4. If the candidate collects votes from a majority, it becomes Leader.
5. If it hears from a legitimate leader (equal or higher term) first,
   it steps back down to Follower.
6. If nobody wins (split vote), the term ends with no leader; the
   randomized timeouts make a repeat split unlikely, and a new election
   starts.
```

**Randomized** timeout হলো সেই কৌশল যা split vote-কে বিরল রাখে: node একসাথে time out হওয়ার সম্ভাবনা কম, তাই সাধারণত একজন candidate একটু এগিয়ে থেকে পরিষ্কারভাবে জেতে।

### Heartbeat

নির্বাচিত হওয়ার পর, leader সব follower-কে পর্যায়ক্রমিক **heartbeat** পাঠায় (খালি `AppendEntries` message)। Heartbeat follower-দের election timeout reset করে, নতুন election দমন করে। যে মুহূর্তে heartbeat থামে — leader crash বা partition — একটি follower time out করে আর election চক্র আবার শুরু হয়। এটা অধ্যায় ২-এর সেই একই slow-বনাম-dead timeout: একটি সুস্থ-কিন্তু-ধীর leader ভুলভাবে প্রতিস্থাপিত হতে পারে, যা Raft সহ্য করে কারণ term নিশ্চিত করে পুরনো leader পুনরায় সংযুক্ত হওয়া মাত্রই নেমে যায়।

### Log replication

Client request হলো leader-এর **log**-এ যুক্ত করা command। Leader-এর কাজ তার log, order-এ, একটি majority-তে replicate করা:

```text
1. Client sends a command to the leader.
2. Leader appends it to its own log as a new (uncommitted) entry.
3. Leader sends AppendEntries (with the new entry) to all followers.
4. When a majority have written the entry to their logs, the leader marks
   it COMMITTED and applies it to its state machine.
5. Leader returns success to the client and tells followers (via the next
   AppendEntries) that the entry is committed, so they apply it too.
```

প্রতিটি entry তার index আর যে term-এ এটা তৈরি হয়েছিল তা দিয়ে শনাক্ত হয়। `AppendEntries`-এ নতুনগুলোর _আগের_ entry-র index ও term থাকে; একটি follower request প্রত্যাখ্যান করে যদি সেখানে তার log না মেলে। এই **consistency check** leader-কে divergence শনাক্ত ও মেরামত করতে দেয় পিছনের দিকে হেঁটে log গুলো একমত হওয়া পর্যন্ত, তারপর follower-এর সাংঘর্ষিক লেজ overwrite করে। যেহেতু সব entry leader-এর মধ্য দিয়ে একটি order-এ প্রবাহিত হয়, প্রতিটি replica-র log একই ক্রমে converge করে — একটি linearizable, replicated state machine।

### Safety

উপরের বৈশিষ্ট্যগুলো নিজে থেকে যথেষ্ট নয়; Raft কিছু restriction যোগ করে যাতে একটি নবনির্বাচিত leader কখনো একটি committed entry মুছতে না পারে:

- **Election restriction:** একটি node শুধু সেই candidate-কে ভোট দেয় যার log অন্তত তার নিজের মতো up to date। এটা গ্যারান্টি দেয় যে বিজয়ী ইতিমধ্যে প্রতিটি committed entry ধরে রেখেছে, তাই একটি leadership পরিবর্তনে কোনো committed data হারায় না।
- **Commit rule:** একটি leader একটি entry-কে committed হিসেবে তখনই গোনে যখন এটা একটি majority-তে সংরক্ষিত _এবং_ leader-এর বর্তমান term-এর অন্তর্গত। এই সূক্ষ্ম নিয়ম একটি বিরল দৃশ্যপট প্রতিরোধ করে যেখানে একটি majority-তে replicate হওয়া একটি entry অন্যথায় একটি পরের leader দ্বারা overwrite হতে পারত।

<Callout type="info">

**নোট:** Raft বিমূর্ত consensus সমস্যাকে একটি _replicated log_-এ পরিণত করে। "log-এর পরের entry"-তে বারবার একমত হওয়া প্রতিটি node-এ একটি অভিন্ন state machine চালানোর সমতুল্য। এই **replicated state machine** প্যাটার্ন হলো etcd, Consul, আর CockroachDB যেভাবে strongly consistent storage দেয় যার উপর lock, leader election, ও configuration নির্ভর করে।

</Callout>

## Paxos-এর সাথে সংক্ষিপ্ত তুলনা

Paxos, Leslie Lamport-এর প্রবর্তিত, ছিল প্রথম প্রমাণিত-সঠিক consensus algorithm এবং এখনো তাত্ত্বিক ভিত্তি। **Basic Paxos** একটি দলকে একটি দুই-দফা বিনিময়ের মাধ্যমে একটি _একক_ মানে একমত হতে দেয়: একটি _prepare_ দফা যাতে একটি proposer একটি proposal number দাবি করে আর ইতিমধ্যে গৃহীত যেকোনো মান জানে, আর একটি _accept_ দফা যাতে সে node-দের তার মান গ্রহণ করতে বলে। Quorum ঠিক Raft-এর মতোই agreement গ্যারান্টি করে।

কিন্তু একটি মানে একমত হওয়া খুব কমই তুমি যা চাও — তুমি মানের একটি _log_ চাও, যার জন্য **Multi-Paxos** লাগে, আর সেই সম্প্রসারণ কুখ্যাতভাবে অসম্পূর্ণভাবে বর্ণিত। বাস্তবে পার্থক্যগুলো:

- **বোধগম্যতা:** Raft এর চারপাশে ডিজাইন করা হয়েছিল; Paxos কুখ্যাতভাবে শেখানো ও সঠিকভাবে বাস্তবায়ন করা কঠিন।
- **Leadership:** Raft-এর একটি শক্তিশালী, সুস্পষ্ট leader একটি first-class ধারণা হিসেবে আছে। Multi-Paxos একটি leader-কে একটি optimization হিসেবে জুড়ে দেয়, কম পরিষ্কারভাবে।
- **সমতুল্যতা:** তারা একই failure সহ্য করে আর একই গ্যারান্টি দেয়। Raft ক্ষমতায় "ভালো" নয় — এটা ভালোভাবে _বর্ণিত_, এজন্যই বেশিরভাগ নতুন সিস্টেম এটা বেছে নেয়।

<Callout type="tip">

**ব্যবহারিক পরামর্শ:** production-এর জন্য কখনো শূন্য থেকে consensus বাস্তবায়ন কোরো না। সূক্ষ্ম safety bug কোণে লুকিয়ে থাকে — split vote, log repair, commit rule — আর সেগুলো শুধু বিরল failure timing-এ ধরা দেয়। একটি যুদ্ধ-পরীক্ষিত বাস্তবায়নের উপর গড়ো (etcd, ZooKeeper, Consul) আর তোমার প্রচেষ্টা সেটা সঠিকভাবে ব্যবহার করায় খরচ করো।

</Callout>
