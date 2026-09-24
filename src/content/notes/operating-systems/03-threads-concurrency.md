---
title: 'Threads ও Concurrency'
subtitle: 'একটা address space share করা execution-এর একাধিক flow — দ্রুত, শক্তিশালী, আর শৃঙ্খলা ছাড়া বিপজ্জনক।'
chapter: 3
level: 'intermediate'
readingTime: '14 মিনিট'
topics: ['threads', 'context switch', 'race condition']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

খোয়ারিজমির রেস্তোরাঁয় আজ প্রচুর অর্ডার। একটা খাবার একা একজন রাঁধুনিকে দিয়ে বানালে সন্ধ্যা পার হয়ে যেত, তাই সে একই রান্নাঘরের একই লম্বা কাউন্টারে চারজন রাঁধুনিকে একসাথে কাজে লাগাল। চারজনই একই তাক থেকে মশলা নেয়, একই ঝুড়ি থেকে সবজি তোলে, একই চুলার পাশে দাঁড়িয়ে রাঁধে। আলাদা করে কারো নিজের গুদাম নেই — সবকিছু হাতের নাগালে, সবার জন্য এক। ফলে চারজন মিলে একসাথে চারটা কাজ এগিয়ে নেয়, রান্না অনেক দ্রুত হয়।

কিন্তু গণ্ডগোলটা বাধল একটা মুহূর্তে। সিনা আর হাইসাম — দুজনেই একই সেকেন্ডে একই কড়াইয়ের দিকে হাত বাড়াল, একজন তাতে তেল ঢালতে, আরেকজন তাতে পেঁয়াজ ছাড়তে। কে আগে, কে পরে তার কোনো নিয়ম কেউ ঠিক করে দেয়নি, তাই কোনদিন তেল আগে পড়ে, কোনদিন পেঁয়াজ — ফলাফল প্রতিবার এলোমেলো, একটা রান্না নষ্ট। এর পাশের বাড়িতেই আরেকটা রেস্তোরাঁ, যেখানে প্রত্যেক রাঁধুনির আলাদা দেয়াল-ঘেরা কামরা, নিজের নিজের মশলা — সেখানে এমন ধাক্কাধাক্কি হয় না, কিন্তু একজনের জিনিস আরেকজনকে দিতে হলে দরজা খুলে হেঁটে যেতে হয়, খরচও বেশি।

এই এক রান্নাঘরের গল্পটাই আসলে **thread** আর **shared memory**। একটা রেস্তোরাঁ (মানে একটা **process**) আর তার ভেতরের প্রত্যেক রাঁধুনি একেকটা thread — সবাই একই কাউন্টার আর একই মশলার তাক, অর্থাৎ process-এর একই shared memory ভাগ করে নেয়। নতুন রাঁধুনি ডাকা নতুন রেস্তোরাঁ খোলার চেয়ে ঢের সস্তা — thread তৈরি করা process তৈরির চেয়ে হালকা, ঠিক সে কারণেই। কিন্তু দুজন একই কড়াই একসাথে ধরার মতো, দুটো thread যখন একই shared data একই মুহূর্তে ছোঁয় আর কে আগে তার কোনো নিশ্চয়তা থাকে না — সেটাই **race condition**, আর ফলাফল অপ্রত্যাশিত। বাস্তবে দুটো thread একই `counter++` চালালে গুনতি হারিয়ে যাওয়া থেকে শুরু করে ব্যাংকের ব্যালেন্স ভুল হয়ে যাওয়া পর্যন্ত সবই এই একই কারণে ঘটে — তাই thread নিয়ে কাজ করলে mutex বা atomic দিয়ে একসাথে "একই কড়াই" ছোঁয়া ঠেকাতে হয়।

## Thread vs Process

একটা process-এ execution-এর একাধিক **thread** থাকতে পারে। প্রতিটা thread-এর নিজের stack, নিজের program counter, আর নিজের register state থাকে — তাই প্রতিটা কোডের ভিন্ন অংশ চালাতে পারে। কিন্তু একটা process-এর সব thread **একই address space share করে**: একই heap, একই global, একই open file descriptor।

সেই sharing-ই পুরো উদ্দেশ্য আর পুরো বিপদ।

|                         | Process                     | Thread                        |
| ----------------------- | --------------------------- | ----------------------------- |
| Address space           | Private                     | ভাইদের সাথে shared            |
| তৈরির খরচ               | বেশি                        | কম                            |
| Communication           | Pipe, socket, shared memory | শুধু shared memory read/write |
| Isolation               | শক্তিশালী                   | একটা process-এর ভেতরে নেই     |
| একটা crash প্রভাবিত করে | শুধু নিজেকে                 | পুরো process-কে               |

Isolation আর fault containment চাইলে একাধিক **process** ব্যবহার করুন। যখন task-গুলোর সস্তায় data share করা দরকার আর আপনি মেনে নেন যে একটায় bug হলে সব corrupt হতে পারে, তখন একাধিক **thread** ব্যবহার করুন।

## User vs Kernel Thread

Thread দুই স্তরে implement করা যায়:

- **Kernel thread** কার্নেল scheduler-এর কাছে পরিচিত। প্রতিটা স্বাধীনভাবে schedule হয় আর ভিন্ন CPU core-এ চলতে পারে। সত্যিকারের parallelism সম্ভব। Linux-এর pthread হলো kernel thread — প্রতিটা একটা schedulable `task_struct`-এ map করে।
- **User thread** (green thread, fiber, goroutine, coroutine) user space-এ একটা runtime দ্বারা schedule হয়, কার্নেলের কাছে অদৃশ্য। এগুলো তৈরি ও switch করা অত্যন্ত সস্তা, কিন্তু কার্নেল শুধু সেই একটা underlying thread দেখে যার উপর এরা চলে।

Modern runtime প্রায়ই একটা **M:N** model ব্যবহার করে — অনেক user-level task একটা ছোট pool-এর kernel thread-এ multiplex করা। Go-র goroutine হলো ক্লাসিক উদাহরণ: লক্ষ লক্ষ goroutine মুষ্টিমেয় কয়েকটা OS thread-এ চলে।

<Callout type="info">

**নোট:** শুধু kernel thread-ই আপনাকে core জুড়ে সত্যিকারের parallelism দেয়। User thread আপনাকে concurrency দেয় — interleaved progress — কিন্তু তাদের একটা যদি একটা blocking syscall করে, runtime-কে আরেকটা kernel thread-এ hand off করতে হয় নইলে তার উপরের সব user thread আটকে যায়।

</Callout>

## Context Switching

কার্নেল যখন একটা CPU-কে এক thread থেকে আরেকটায় সরায়, তখন সে একটা **context switch** করে:

1. বর্তমান thread-এর register (program counter আর stack pointer সহ) তার kernel structure-এ save করে।
2. পরের thread-এর saved register load করে।
3. যদি একটা _ভিন্ন_ process-এর thread-এ switch করা হয়, তাহলে page table-ও switch করে, যা **TLB**-এর অংশ flush করে দেয় (Chapter 5)।

একই process-এর thread-দের মধ্যে switch, process-দের মধ্যেকার switch-এর চেয়ে সস্তা, কারণ address space বদলায় না। তবুও, context switch বিনামূল্যে নয় — প্রতিটার খরচ microsecond, সাথে cache আর TLB pollution-এর indirect খরচ। যে system খুব ঘন ঘন switch করে (per core প্রতি second-এ হাজার হাজার বার, `vmstat`-এ উঁচু `cs` হিসেবে দেখা যায়) সে কাজ করার বদলে state এদিক-ওদিক করতেই আসল সময় খরচ করে।

## State Share করা

যেহেতু thread memory share করে, তাদের মধ্যে data পাঠানো একটা variable-এ লেখার মতোই সহজ, যা দুজনেই দেখতে পায়:

```c
int counter = 0;   // shared by all threads

void *worker(void *arg) {
    for (int i = 0; i < 1000000; i++) {
        counter++;     // looks atomic — it is NOT
    }
    return NULL;
}
```

এটাও ঠিক সেই জায়গা যেখানে জিনিস ভুল হয়ে যায়।

## Race Condition

`counter++` একটা operation নয়। CPU-কে করতে হয়:

```text
1. load counter from memory into a register
2. add 1 to the register
3. store the register back to counter
```

দুটো thread যদি একই সময়ে এটা চালায়, তাদের step interleave হতে পারে:

```text
Thread A: load counter (0)
Thread B: load counter (0)
Thread A: add 1  -> 1
Thread B: add 1  -> 1
Thread A: store 1
Thread B: store 1      <-- one increment lost
```

দুটো thread-ই `counter++` চালিয়েছে, কিন্তু ফলাফল 1, 2 নয়। এটাই একটা **race condition**: outcome নির্ভর করে operation কীভাবে interleave হয় তার অপ্রত্যাশিত timing-এর উপর। উপরের দুই-thread program-টা চালান আর final count প্রায় কখনোই 2,000,000 হয় না।

Race গুলো ভয়ংকর কারণ কোডটা দেখতে _সঠিক_ আর সাধারণত _কাজও করে_ — যতক্ষণ না scheduler ভুল মুহূর্তে interleave করে বসে, প্রায়ই কেবল load-এর সময় বা একটা দ্রুততর মেশিনে।

কোডের যে shared অংশটা interleave হওয়া চলবে না তাকে **critical section** বলে। এটাকে protect করতে synchronization লাগে — mutex, atomic, আর Chapter 6-এর tool।

<Callout type="warning">

**সতর্কতা:** একাধিক thread যে data ছোঁয়, যেখানে অন্তত একটা thread write করে, সেটাই একটা সম্ভাব্য race। "আমার মেশিনে তো কাজ করেছিল" concurrency bug-এর জন্য অর্থহীন — এগুলো timing-নির্ভর আর production-এ দশ লক্ষে একবার দেখা দিতে পারে।

</Callout>

## Thread Pool

Task প্রতি একটা করে thread তৈরি করা পরিষ্কার শোনায় কিন্তু scale করে না। Thread-এর memory খরচ হয় (প্রতিটার একটা stack লাগে, প্রায়ই megabyte-এর address space) আর creation/teardown overhead। দশ হাজার spawn করুন আর আপনি context switch-এ ডুবে যাবেন।

একটা **thread pool** এটা ঠিক করে। আপনি আগে থেকে নির্দিষ্ট সংখ্যক worker thread তৈরি করেন — CPU-bound কাজের জন্য প্রায়ই মোটামুটি CPU core সংখ্যার সমান — আর একটা shared queue-এর মাধ্যমে তাদের task খাওয়ান:

```text
        +-----------------+
tasks ->|   work queue    |
        +-----------------+
           |    |    |
        +----+ +----+ +----+
        | W1 | | W2 | | W3 |   <- fixed pool of worker threads
        +----+ +----+ +----+
```

Worker-রা task টেনে নেয়, চালায়, আর পরেরটার জন্য loop করে ফিরে আসে। এটা concurrency-তে সীমা টানে, thread পুনর্ব্যবহার করে, আর context-switch rate সহনীয় রাখে। Web server, database connection pool, আর language runtime সবাই এই pattern ব্যবহার করে।

এরপর আমরা দেখব কার্নেল এই সব ready thread-এর মধ্যে _কোনটা_ আসলে একটা CPU পায় তা কীভাবে ঠিক করে: scheduling।
