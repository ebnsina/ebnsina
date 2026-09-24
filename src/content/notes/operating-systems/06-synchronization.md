---
title: 'Synchronization'
subtitle: 'thread যখন data share করে, correctness নির্ভর করে কে কখন কী ছোঁবে তা নিয়ন্ত্রণ করার উপর — lock, signal আর যত্ন দিয়ে।'
chapter: 6
level: 'advanced'
readingTime: '15 মিনিট'
topics: ['mutex', 'semaphore', 'deadlock']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বিরুনির অফিসে একটাই কমন বাথরুম, আর দরজার পাশে একটা হুকে ঝোলে একটাই চাবি। যে চাবিটা নেয়, সে ভেতরে ঢুকে দরজা লক করে দেয় — তাই একসময়ে ভেতরে ঠিক একজনই থাকতে পারে। বাকিরা চাবি হুকে ফিরে না আসা পর্যন্ত বাইরে দাঁড়িয়ে অপেক্ষা করে। খোয়ারিজমি বেরিয়ে চাবি হুকে রাখলে তবেই পরের জন সেটা তুলে ঢুকতে পারে। কেউ চাবি নিয়ে ভেতরে অনন্তকাল বসে থাকলে বাকি পুরো অফিস আটকে যায়।

একই বিল্ডিংয়ের পার্কিং লটে অন্য নিয়ম — গেটে ঝোলে ঠিক পাঁচটা পাস। যতক্ষণ একটা পাস হাতে আছে, একটা গাড়ি ঢুকতে পারে; পাঁচটাই বিলি হয়ে গেলে ষষ্ঠ গাড়িকে গেটে অপেক্ষা করতে হয় যতক্ষণ না কেউ বেরিয়ে পাস ফেরত দেয়। আর একদিন গোলমাল বাঁধল যখন বিরুনি স্টোররুমের চাবি হাতে নিয়ে বাথরুমের চাবির অপেক্ষায়, আর মরিয়ম ততক্ষণে বাথরুমের চাবি নিয়ে স্টোররুমের চাবির অপেক্ষায় — দুজনের কেউই নিজেরটা ছাড়বে না, ফলে দুজনই চিরকালের জন্য আটকা।

গল্পটাই আসলে **synchronization**। বাথরুমের একটামাত্র চাবি হলো **mutex/lock**, আর ভেতরের ঘরটা হলো **critical section** — যেখানে একসময়ে একজনই থাকতে পারে (mutual exclusion); চাবি না রেখে বেরিয়ে গেলে, মানে lock না ছেড়ে দিলে, বাকি সবাই ঝুলে থাকে (এটাই lock ধরে রাখার সেই বিপদ, আর চাবি ভাগাভাগি না করাই **race condition** ঠেকায়)। পার্কিং লটের পাঁচটা পাস হলো একটা **semaphore** — count N, একসাথে N জনকে ঢুকতে দেয়, resource pool যেমন "৫টা database connection" ঠিক এভাবেই কাজ করে। আর দুই চাবি নিয়ে পরস্পরের অপেক্ষায় জমে যাওয়াটাই **deadlock** — বাস্তবে ঠিক এভাবেই দুটো thread দুটো lock উল্টো order-এ ধরলে production সিস্টেম আটকে যায়, তাই সবাইকে একই order-এ lock নিতে বলা হয়।

## Critical Section

Chapter 3 দেখিয়েছে কীভাবে দুটো thread থেকে `counter++` update হারায়। মূল কারণ হলো কয়েকটা instruction যাদের _একসাথে_ atomic দেখাতে হয় সেগুলো interleave হয়ে যায়। কোডের যে অংশটা shared state access করে আর নিজের সাথে concurrently চলতে পারে না তা হলো একটা **critical section**।

সঠিক synchronization নিশ্চিত করে:

- **Mutual exclusion** — একসময়ে critical section-এ সর্বোচ্চ একটা thread।
- **Progress** — section-টা যদি খালি থাকে, একটা অপেক্ষমাণ thread শেষ পর্যন্ত ঢোকে।
- **No starvation** — একটা thread চিরকাল অপেক্ষা করে না যখন অন্যরা বারবার সামনে কেটে যায়।

নিচের tool-গুলো এই guarantee enforce করার mechanism।

## Mutex

একটা **mutex** (mutual exclusion lock) হলো মূল কর্মী। একটা thread critical section-এর আগে এটাকে _lock_ করে আর পরে _unlock_ করে। যতক্ষণ একটা thread lock ধরে থাকে, অন্য যে-কেউ সেটা lock করার চেষ্টা করলে block হয় যতক্ষণ না lock ছাড়া হয়।

```c
#include <pthread.h>

pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
int counter = 0;

void increment(void) {
    pthread_mutex_lock(&lock);
    counter++;                  // critical section, now safe
    pthread_mutex_unlock(&lock);
}
```

একসময়ে শুধু একটা thread `lock` আর `unlock`-এর মাঝে থাকতে পারে, তাই increment-টা আর একটা race নয়। খরচ হলো contention: lock-এর অপেক্ষায় থাকা thread কোনো progress করে না। Critical section **ছোট** রাখুন — lock-এর নিচে ন্যূনতম কাজ করুন আর ধরে থাকা অবস্থায় ধীর কিছু (কোনো I/O) নয়।

<Callout type="warning">

**সতর্কতা:** unlock করতে ভুলে যাওয়া — যেমন, তাড়াতাড়ি return করা বা `unlock` পেরিয়ে throw করা — lock চিরকাল ধরে রাখে আর অন্য প্রতিটা thread ঝুলিয়ে দেয়। C++/Rust-এ, RAII বা scope guard exit-এ স্বয়ংক্রিয়ভাবে lock ছাড়ে; C-তে, সতর্ক থাকুন।

</Callout>

## Semaphore

একটা **semaphore** হলো দুটো atomic operation সহ একটা counter: _wait_ (decrement; শূন্যের নিচে গেলে block) আর _post_ (increment; সম্ভবত একটা waiter জাগায়)। এটা mutex-কে generalize করে:

- একটা **binary semaphore** (count 0 বা 1) একটা lock-এর মতো কাজ করে।
- একটা **counting semaphore** (count N) একসাথে N পর্যন্ত thread ঢুকতে দেয় — একটা resource pool-এর জন্য নিখুঁত, যেমন "5টা database connection available।"

Semaphore thread-দের মধ্যে ordering-ও (signaling) coordinate করে, শুধু exclusion নয়। ক্লাসিক ব্যবহার হলো **producer–consumer** queue: একটা semaphore ভরা slot গোনে, আরেকটা খালি slot গোনে, তাই queue খালি হলে consumer block করে আর ভরা হলে producer block করে।

## Condition Variable

একটা mutex data protect করে; একটা **condition variable** একটা thread-কে busy-spin না করে _একটা condition সত্য হওয়ার অপেক্ষা_ করতে দেয়। এটা সবসময় একটা mutex-এর সাথে জোড়া থাকে।

একটা waiter atomically mutex ছেড়ে দেয় আর signal না পাওয়া পর্যন্ত ঘুমায়; একটা signaler এক (বা সব) waiter জাগায়:

```c
pthread_mutex_lock(&lock);
while (queue_is_empty())              // always re-check in a loop
    pthread_cond_wait(&not_empty, &lock);
item = dequeue();
pthread_mutex_unlock(&lock);
```

দুটো নিয়ম যা মানুষকে হোঁচট খাওয়ায়:

- **সবসময় একটা `while` loop-এ wait করুন**, `if`-এ নয়। একটা thread **spuriously** জাগতে পারে বা condition-এর জন্য আরেকটা thread-এর কাছে race হারাতে পারে, তাই তাকে আবার check করতে হয়।
- Mutex wait-এর সময় ছাড়া থাকে আর `cond_wait` return করার আগে আবার নেওয়া হয়, তাই check-then-act নিরাপদ।

## Deadlock: চারটা শর্ত

একটা **deadlock** হলো যখন একগুচ্ছ thread সবাই block, প্রত্যেকে এমন একটা resource-এর অপেক্ষায় যা অন্য একটা ধরে আছে — চিরকাল। পাঠ্যপুস্তকের কেস: thread 1 lock A ধরে আছে আর B চায়; thread 2 B ধরে আছে আর A চায়। কেউই এগোতে পারে না।

Deadlock-এর জন্য একসাথে এই **চারটাই** শর্ত দরকার (Coffman condition):

1. **Mutual exclusion** — resource share করা যায় না।
2. **Hold and wait** — একটা thread একটা resource ধরে রেখে আরেকটার অপেক্ষা করে।
3. **No preemption** — resource জোর করে কেড়ে নেওয়া যায় না।
4. **Circular wait** — thread-দের একটা cycle যেখানে প্রত্যেকে পরেরটার অপেক্ষায়।

**যেকোনো একটা** ভাঙুন আর deadlock অসম্ভব হয়ে যায়।

## Prevention আর Avoidance

**Prevention** চারটা শর্তের একটাকে গঠনগতভাবে আক্রমণ করে:

- **Lock ordering** circular wait ভাঙে — সবচেয়ে ব্যবহারিক কৌশল। সব lock-এর উপর একটা global order সংজ্ঞায়িত করুন আর সবসময় সেই order-এ সেগুলো নিন। সবাই যদি B-র আগে A নেয়, A↔B cycle কখনো তৈরি হতে পারে না।
- **No hold-and-wait** — সব প্রয়োজনীয় lock একসাথে নিন, বা সব না পেলে সবকিছু ছেড়ে দিয়ে আবার চেষ্টা করুন (`trylock`)।
- **Timeout** preemption approximate করে — যে thread একটা deadline-এর মধ্যে একটা lock নিতে পারে না সে পিছিয়ে যায় আর আবার চেষ্টা করে, একটা সম্ভাব্য cycle ভাঙে।

**Avoidance** আরও dynamic: system resource request track করে আর এমন যেকোনো allocation প্রত্যাখ্যান করে যা একটা unsafe state-এ _নিয়ে যেতে পারে_ (Banker's algorithm)। এটা বেশিরভাগই তাত্ত্বিক আগ্রহের বিষয় — বাস্তব system প্রবলভাবে disciplined lock ordering আর timeout-এর উপর নির্ভর করে।

<Callout type="tip">

**টিপ:** যখন দুটো lock একসাথে ধরতে হয়, সবসময় order document করুন আর মেনে চলুন। বেশিরভাগ production deadlock কেবল দুটো code path যা একই দুটো lock উল্টো order-এ ধরে।

</Callout>

## Atomic আর Lock-Free Code

সরল operation-এর জন্য, একটা lock নেওয়া অতিরিক্ত। Modern CPU **atomic instruction** দেয় যা read-modify-write একটা অবিভাজ্য step হিসেবে করে। একটা `fetch_and_add` কোনো lock ছাড়াই atomically একটা counter increment করে:

```c
#include <stdatomic.h>

atomic_int counter = 0;
atomic_fetch_add(&counter, 1);   // atomic, no mutex needed
```

মূল primitive হলো **compare-and-swap (CAS)**: "এই memory যদি এখনো X-এর সমান হয়, তাহলে এটাকে Y সেট করো, atomically; সফল হলে জানাও।" Lock-free data structure CAS retry loop থেকে তৈরি। এগুলো lock-এর blocking আর contention এড়ায় কিন্তু কুখ্যাতভাবে ঠিকভাবে করা কঠিন — memory ordering, ABA problem, আর সূক্ষ্ম visibility নিয়ম hand-rolled lock-free code-কে বিশেষজ্ঞদের কাজ বানায়। Counter আর flag-এর জন্য atomic-এর দিকে হাত বাড়ান; নিজের lock-free queue লেখার আগে প্রমাণিত library structure-এর দিকে হাত বাড়ান।

Shared memory নিয়ন্ত্রণে আসার পর, পরের অধ্যায় shared persistent storage-এর দিকে ফেরে: file system।
