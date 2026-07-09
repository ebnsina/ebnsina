---
title: 'Operating Systems — রোডম্যাপ'
subtitle: 'কার্নেল কীভাবে raw hardware-কে আপনার প্রোগ্রামের নির্ভরযোগ্য process, memory আর file-এ রূপান্তরিত করে।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'operating systems']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## যা যা শিখবেন

আপনি যত প্রোগ্রামই লেখেন, প্রতিটাই একটা operating system-এর উপরে চলে। এটা আপনাকে এমন memory দেয় যা আপনি সরাসরি RAM থেকে allocate করেননি, আপনার কোডকে এমন CPU-তে schedule করে যা আপনি কখনো চাননি, আর এমন file দেখায় যেগুলো আসলে file-ই না। OS বুঝতে পারলে একগাদা রহস্যময় আচরণ — কেন একটা thread আটকে যায়, কেন memory usage হঠাৎ বেড়ে যায়, কেন একটা `fsync` ধীর — সবকিছুই এমন জিনিসে পরিণত হয় যা নিয়ে আপনি reason করতে পারবেন।

এই track একটা modern OS কীভাবে কাজ করে তার mental model তৈরি করে, reference system হিসেবে **Linux** ব্যবহার করে। শেষে গিয়ে আপনি বুঝবেন:

- কার্নেল কীভাবে প্রোগ্রামগুলোকে একে অন্যের থেকে isolate ও protect করে।
- একটা process আর একটা thread আসলে কী, আর CPU তাদের মধ্যে কীভাবে ভাগ হয়।
- virtual memory কীভাবে প্রতিটা প্রোগ্রামকে ভাবায় যে সে পুরো মেশিনের মালিক।
- synchronization, file system আর I/O ভেতরে ভেতরে আসলে কীভাবে কাজ করে।

<Callout type="info">

**নোট:** এর সুফল পেতে আপনাকে kernel code লিখতে হবে না। লক্ষ্য হলো আপনি প্রতিদিন যেসব abstraction ব্যবহার করেন — `fork`, `malloc`, `open`, `epoll` — সেগুলো যেন আর ম্যাজিক মনে না হয়।

</Callout>

## Prerequisites

এই track স্বাভাবিকভাবেই আরও দুটোর সাথে জোড়া মেলে:

- **linux-vps** — shell, process আর `ps`/`top`-এর সাথে স্বাচ্ছন্দ্য থাকলে উদাহরণগুলো concrete হয়ে ওঠে।
- **networking** — socket আর I/O multiplexing (Chapter 8) সরাসরি networking fundamentals-এর উপরে গড়ে ওঠে।

একটু C পড়তে পারার ক্ষমতা কাজে দেয়, কারণ system call C-তে দেখানোই সবচেয়ে সহজ। fluent হতে হবে না — প্রতিটা snippet ব্যাখ্যা করা আছে।

## অধ্যায়গুলো

1. **What an Operating System Does** — কার্নেল, user vs kernel space, system call, আর resource manager হিসেবে OS।
2. **Processes** — process model, address space, PCB, process state, আর `fork`/`exec`/`wait`।
3. **Threads & Concurrency** — thread vs process, context switching, shared state, আর race condition।
4. **CPU Scheduling** — কার্নেল কীভাবে ঠিক করে পরের বার কে চলবে, round-robin থেকে Linux-এর CFS পর্যন্ত।
5. **Memory Management & Virtual Memory** — paging, page table, TLB, page fault, আর swapping।
6. **Synchronization** — mutex, semaphore, condition variable, আর deadlock-এর চারটা শর্ত।
7. **File Systems** — inode, page cache, journaling, আর `fsync` দিয়ে durability।
8. **I/O & System Calls** — blocking vs non-blocking I/O, `epoll`, `io_uring`, আর event loop কীভাবে তৈরি হয়।

এগুলো ক্রমানুসারে পড়ুন। প্রতিটা অধ্যায় ধরে নেয় আগেরগুলোর vocabulary আপনার জানা আছে।
