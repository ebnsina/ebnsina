---
title: 'Memory Management ও Virtual Memory'
subtitle: 'প্রতিটা process ভাবে সে একটা বিশাল, private memory-র মালিক। কার্নেল আর MMU দুষ্প্রাপ্য physical RAM-এর উপর সেই illusion টিকিয়ে রাখে।'
chapter: 5
level: 'advanced'
readingTime: '15 মিনিট'
topics: ['virtual memory', 'paging', 'tlb']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

হাইসামের একটা বিশাল গুদাম-দোকান আছে, যেখানে হাজার হাজার তাক আর অগুনতি জিনিস। কিন্তু ক্রেতাকে সে কখনো পুরো গুদামের নকশা দেখায় না — তাতে সবাই বিভ্রান্ত হয়ে যেত, আর একজন আরেকজনের জিনিসে হাত দিত। তাই প্রতিটা ক্রেতাকে সে একটা করে সহজ, নিজস্ব লকার-ম্যাপ ধরিয়ে দেয় — ১, ২, ৩, ৪ এভাবে সাজানো নম্বর। প্রতিটা ক্রেতার কাছে মনে হয় পুরো গুদামটা যেন তারই, আর তার জিনিসগুলো পরিপাটি করে ১ থেকে সাজানো।

আসল ম্যাজিকটা লুকিয়ে আছে হাইসামের হাতে থাকা একটা মাস্টার খাতায়। ক্রেতা এসে বলে "আমার ৩ নম্বর লকারের জিনিসটা দিন" — সে খাতা খুলে দেখে, এই ক্রেতার ৩ নম্বর আসলে গুদামের একদম পেছনের সারির ৯১৭ নম্বর তাকে। ক্রেতা কখনো সেই আসল নম্বর জানেও না। আর কিছু জিনিস মাসের পর মাস কেউ চায় না; সেগুলো তাক জ্যাম করে রাখে। তাই হাইসাম সেসব দূরের একটা back-store গুদামে সরিয়ে দেয়, খাতায় টুকে রাখে "এটা এখন পেছনের ঘরে"। কেউ হঠাৎ চাইলে লোক পাঠিয়ে সেটা আবার সামনে এনে তাকে বসায় — একটু সময় লাগে, কিন্তু জায়গা বাঁচে।

এই গল্পটাই আসলে **virtual memory**। প্রতিটা ক্রেতার নিজস্ব ১-২-৩ লকার-ম্যাপ হলো প্রতিটা process-এর নিজের **virtual address space** — সবাই ভাবে বিশাল, private memory তারই। মাস্টার খাতা হলো **page table**, আর "আপনার ৩ = আসল ৯১৭" এই অনুবাদটাই **virtual-to-physical translation**; গুদামের আসল তাকগুলো হলো **physical memory** (RAM)। আর অব্যবহৃত জিনিস দূরের back-store-এ সরিয়ে রাখা, দরকার হলে ফিরিয়ে আনা — এটাই **paging/swap to disk**। বাস্তবে আপনার লিনাক্স মেশিনে ঠিক এভাবেই কার্নেল আর MMU প্রতিটা program-কে যা আছে তার চেয়ে বেশি memory-র illusion দেয়, আর RAM ভরে গেলে কম-ব্যবহৃত page ডিস্কে swap করে জায়গা বানায়।

## Virtual vs Physical Memory

আপনার program যখন `0x7fff_1234` address পড়ে, সেটা একটা **virtual address**। এটা physical RAM chip-এর ভেতরের location নয়। প্রতিটা process-এর নিজের virtual address space থাকে, আর কার্নেল প্রতিটা process-এর virtual address-কে RAM-এর **physical address**-এ map করে।

এই indirection তিনটা গুরুত্বপূর্ণ জিনিস কিনে দেয়:

- **Isolation** — process A-র `0x1000` address আর process B-র `0x1000` ভিন্ন physical memory-তে map করে। তারা একে অন্যকে দেখতে পারে না।
- **প্রাচুর্যের illusion** — প্রতিটা process-কে একটা বিশাল, দেখতে-contiguous address space দেওয়া যায় যদিও physical RAM ছোট আর খণ্ডিত।
- **Flexibility** — memory সরানো, share করা, disk-এ swap করা, বা lazily allocate করা যায়, সবই program-এর কাছে transparent।

এই translation প্রতিটা single memory access-এ hardware-এ **MMU** (Memory Management Unit) করে, কার্নেলের সেট আপ করা table ব্যবহার করে।

## Paging

Memory নির্দিষ্ট-আকারের chunk-এ পরিচালিত হয় যাদের বলে **page** — x86-এ প্রায় সবসময় **4 KB**। Physical RAM সমান আকারের **page frame**-এ বিভক্ত। MMU virtual page-কে physical frame-এ map করে।

একটা virtual address দুই অংশে বিভক্ত হয়:

```text
 virtual address (simplified)
+---------------------+-------------+
|    page number      |   offset    |
+---------------------+-------------+
    used to look up        added to
    the frame              the frame base
```

উঁচু bit-গুলো একটা page নির্বাচন করে; MMU সেটাকে একটা frame-এ translate করে; নিচু **offset** bit-গুলো page-এর ভেতরে index করে আর অপরিবর্তিত পাস হয়ে যায়। যেহেতু page নির্দিষ্ট-আকারের, যেকোনো virtual page যেকোনো physical frame-এ যেতে পারে — contiguous physical memory-র দরকার নেই। এটা সেই external fragmentation দূর করে যা পুরনো segment-ভিত্তিক scheme-কে জর্জরিত করত।

## Page Table

Virtual page থেকে physical frame-এর mapping থাকে একটা **page table**-এ, process প্রতি একটা। একটা flat table বিশাল হবে (একটা 48-bit address space-এ ট্রিলিয়ন ট্রিলিয়ন page থাকে), তাই বাস্তব system **multi-level page table** ব্যবহার করে — একটা tree। x86-64-এ, address translation চারটা level হেঁটে যায়:

```text
virtual addr -> [L4] -> [L3] -> [L2] -> [L1] -> frame + offset
```

শুধু যে branch-গুলো আসলে ব্যবহৃত হয় সেগুলোই memory খায়, তাই একটা sparse address space-এর খরচ সামান্য। প্রতিটা entry-তে permission bit-ও থাকে — readable, writable, executable, user-accessible — এভাবেই text segment read-only হিসেবে enforce হয় আর read-only memory-তে একটা write ধরা পড়ে।

CPU register `CR3` বর্তমান process-এর page table-এর শীর্ষে point করে। Process-দের মধ্যে একটা context switch `CR3` reload করে, তাৎক্ষণিকভাবে নতুন process-এর memory-র view swap করে দেয়।

## TLB

_প্রতিটা_ memory access-এ একটা চার-level page table হাঁটা ভয়ংকর ধীর হবে — access প্রতি চারটা অতিরিক্ত memory read। সমাধান হলো CPU-র ভেতরের একটা cache যার নাম **TLB** (Translation Lookaside Buffer)। এটা সাম্প্রতিক virtual-to-physical translation cache করে।

- **TLB hit** — translation cache-এ আছে; address মূলত শূন্য অতিরিক্ত সময়ে resolve হয়।
- **TLB miss** — MMU page table হাঁটে, তারপর পরের বারের জন্য result cache করে।

TLB ছোট (শত থেকে কয়েক হাজার entry), তাই ভালো locality বিরাট গুরুত্বপূর্ণ। এ কারণেও context switch ব্যয়বহুল: `CR3` switch করলে TLB-র বেশিরভাগ invalidate হয়, আর নতুন process আবার গরম হওয়ার সময় একগুচ্ছ miss ভোগ করে।

<Callout type="info">

**নোট:** **Huge page** (4 KB-এর বদলে 2 MB বা 1 GB) একটা TLB entry-কে অনেক বেশি memory cover করতে দেয়, database-এর মতো memory-ক্ষুধার্ত workload-এর জন্য TLB miss কমায়। Trade-off হলো মোটা granularity আর সম্ভাব্য অপচয়।

</Callout>

## Page Fault

একটা process যখন এমন একটা virtual page access করে যার page table-এ কোনো valid mapping নেই, তখন MMU একটা **page fault** তোলে — কার্নেলে একটা trap। কার্নেল কেন হলো তা পরীক্ষা করে:

- **Minor fault** — page-টা বৈধ কিন্তু এখনো map করা হয়নি (যেমন, এটা ইতিমধ্যে RAM-এ আছে, শুধু একটা table entry দরকার, বা এটা একটা copy-on-write page যাতে write হচ্ছে)। কার্নেল mapping ঠিক করে আর program resume করে। দ্রুত।
- **Major fault** — page-এর content disk থেকে আনতে হবে (executable থেকে, একটা memory-mapped file থেকে, বা swap area থেকে)। I/O হওয়ার সময় process block করে। ধীর।
- **Invalid fault** — access-টা সত্যিই illegal (একটা null-pointer dereference, read-only memory-তে write)। কার্নেল `SIGSEGV` পাঠায় আর program crash করে। এটাই একটা segmentation fault।

<Callout type="tip">

**টিপ:** `ps` minor আর major fault count দেখায়। উঁচু _major_ fault rate মানে working set RAM-এ আঁটছে না আর system অবিরাম disk-এ আঘাত করছে — thrashing-এর লক্ষণ।

</Callout>

## Demand Paging আর Swapping

কার্নেল ইচ্ছাকৃতভাবে অলস। **Demand paging** মানে একটা page কেবল তখনই physical RAM-এ load হয় যখন সেটা আসলে ছোঁয়া হয়। আপনি যখন একটা 100 MB binary `exec` করেন, কার্নেল আগে থেকে 100 MB পড়ে না — এটা mapping সেট আপ করে আর page fault-কে দিয়ে শুধু সেই page-গুলো টানায় যা program আসলে চালায়। এটা startup দ্রুত করে আর কখনো execute না হওয়া কোড load করা এড়ায়।

Physical RAM ভরে গেলে, কার্নেলকে জায়গা করতে page evict করতে হয়। এটা victim page বাছে (_least-recently-used_ approximate করে) আর:

- Page-টা যদি clean আর একটা file দিয়ে backed হয় (যেমন program code), সেটা কেবল ফেলে দেওয়া হয় — এটা পরে file থেকে আবার পড়া যায়।
- Page-টা যদি dirty হয় (modified anonymous memory), সেটাকে আগে disk-এ **swap** area-তে write করতে হয়।

সেই page পরে ফিরিয়ে আনলে একটা major page fault হয়। Active working set যদি RAM-এর চেয়ে বড় হয়, system তার সব সময় page in আর out করতেই কাটায় — **thrashing** — আর throughput ধসে পড়ে যখন disk আটকে থাকে।

এটাই memory management-এর মৌলিক টানাপোড়েন: virtual memory আপনাকে যা আছে তার চেয়ে বেশি allocate করতে দেয়, কিন্তু আপনার _active_ footprint physical RAM ছাড়িয়ে গেলে performance খাদের কিনারা থেকে পড়ে যায়। পরের অধ্যায় এই shared memory-তে access নিরাপদে coordinate করার দিকে ফেরে: synchronization।
