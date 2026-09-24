---
title: 'I/O ও System Calls'
subtitle: 'read আর write আসলে কীভাবে কার্নেলের মধ্য দিয়ে যাত্রা করে — আর একটা thread কীভাবে একসাথে হাজার হাজার connection পাহারা দেয়।'
chapter: 8
level: 'mastery'
readingTime: '16 মিনিট'
topics: ['epoll', 'non-blocking', 'io_uring']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

কিন্দি একটা সরকারি ভূমি অফিসে এসেছে তার জমির পুরনো দলিলের একটা কপি নিতে। সব দলিল রাখা আছে ভেতরের একটা secure রেকর্ড-ভল্টে — মোটা লোহার দরজা, ভেতরে সাজানো তাক। কিন্তু কিন্দি চাইলেই ওই ভল্টে হেঁটে ঢুকে নিজের ফাইল খুঁজে নিতে পারে না; সাধারণ নাগরিকের ওখানে ঢোকা পুরোপুরি নিষেধ। তাকে করতে হয় শুধু একটাই কাজ — কাউন্টারের জানালার সামনে দাঁড়িয়ে একটা অফিসিয়াল অনুরোধ ফর্ম পূরণ করা: কোন দলিল লাগবে, কোন খতিয়ান নম্বর। তারপর সেই ফর্মটা জানালা দিয়ে ভেতরের কেরানির হাতে দেওয়া।

কেরানির কাছেই কেবল ভল্টে ঢোকার অনুমতি আর চাবি আছে। ফর্মটা নিয়ে সে ভেতরে যায়, তাকের ভেতর থেকে ঠিক দলিলটা খুঁজে বের করে, দরকার হলে কপি করে, আবার কাউন্টারে ফিরে এসে কিন্দির হাতে ফলাফলটা তুলে দেয়। কিন্দি এর মধ্যে কিছুই করতে পারে না — সে জানালার সামনে চুপচাপ দাঁড়িয়ে অপেক্ষা করে, যতক্ষণ না কেরানি ফিরে আসে। ভল্ট যদি ব্যস্ত থাকে বা দলিল খুঁজতে সময় লাগে, ততক্ষণ তার লাইনও এগোয় না।

এই গল্পটাই আসলে **system call** আর user/kernel boundary। কিন্দি হলো আপনার user program, secure ভল্টটা হলো hardware আর kernel space যেখানে সরাসরি হাত দেওয়া নিষেধ, কাউন্টারের জানালাটা হলো ঠিক সেই user/kernel boundary, আর অনুমতিপ্রাপ্ত কেরানি হলো kernel নিজে। জানালা দিয়ে দেওয়া অনুরোধ ফর্মটাই একটা syscall — program সরাসরি device ছুঁতে পারে না, তাই সে kernel-কে অনুরোধ করে I/O-টা তার হয়ে করে দিতে। বাস্তবে `read`, `write`, `open` ঠিক এভাবেই কাজ করে: আপনি CPU-কে kernel-এ trap করান, kernel আপনার হয়ে file বা socket থেকে data এনে দেয়। আর জানালার সামনে চুপচাপ অপেক্ষা করাটাই **blocking I/O** — data তৈরি না হওয়া পর্যন্ত আপনার thread ঘুমিয়ে থাকে।

## File Descriptor আর I/O Path

একটা process যে প্রতিটা open file, socket, pipe, বা device ধরে রাখে তাকে একটা ছোট integer দিয়ে বোঝানো হয়: একটা **file descriptor** (fd)। `0`, `1`, `2` প্রথা অনুসারে stdin, stdout, stderr; `open`, `socket`, আর `accept` নতুন fd return করে। fd কার্নেলের রক্ষণাবেক্ষণ করা একটা per-process table-এ index করে, যা underlying kernel object-এ point করে।

সব I/O এই descriptor-এ `read` আর `write`-এর মধ্য দিয়ে প্রবাহিত হয়। আপনি যখন `read(fd, buf, n)` call করেন:

1. CPU কার্নেলে trap করে (একটা system call)।
2. কার্নেল `fd`-এর পেছনের object খুঁজে বের করে।
3. একটা file-এর জন্য, এটা **page cache** (Chapter 7) check করে; একটা hit byte সরাসরি আপনার buffer-এ copy করে। একটা miss disk I/O issue করে।
4. Data kernel space থেকে আপনার `buf`-এ copy হয়, আর call byte count return করে।

Kernel buffer থেকে user buffer-এ সেই copy — আর syscall trap নিজেই — হলো per-call overhead যা কমানো নিয়েই এই অধ্যায়ের বাকি অংশ মূলত।

## Blocking vs Non-Blocking I/O

Default-এ, descriptor **blocking**। আপনি যদি এমন একটা socket থেকে `read` করেন যাতে এখনো কোনো data নেই, calling thread-কে ঘুমাতে পাঠানো হয় (Chapter 2-এর **blocked** state) যতক্ষণ না data আসে। যুক্তি করা সহজ, কিন্তু এটা প্রতিটা in-flight operation-এ একটা পুরো thread বেঁধে রাখে। Connection প্রতি একটা blocking thread ব্যবহার করা একটা server-এর হাজার হাজার client সামলাতে হাজার হাজার thread লাগে — memory আর context switch-এ ব্যয়বহুল।

একটা descriptor **non-blocking** সেট করলে (`O_NONBLOCK`) ভিন্নভাবে আচরণ করে: operation-টা যদি তাৎক্ষণিকভাবে এগোতে না পারে, syscall ঘুমানোর বদলে সাথে সাথে `EAGAIN` (বা `EWOULDBLOCK`) error দিয়ে return করে।

```c
int flags = fcntl(fd, F_GETFL, 0);
fcntl(fd, F_SETFL, flags | O_NONBLOCK);

ssize_t n = read(fd, buf, sizeof buf);
if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
    // no data right now — go do something else, don't block
}
```

Non-blocking I/O একটা single thread-কে অনেক descriptor জাগল করতে দেয় — কিন্তু কেবল তখনই যদি তার জানার উপায় থাকে _কোন_ descriptor ready, সবগুলোর উপর spin করার বদলে। সেই mechanism হলো I/O multiplexing।

## Multiplexing: select, poll, epoll

I/O multiplexing একটা thread-কে অনেক descriptor-এর অপেক্ষা করতে দেয় আর জানায় কোনগুলো ready হলো। তিন প্রজন্ম:

**`select`** — descriptor-এর একটা bitmask পাস করুন; কার্নেল block করে যতক্ষণ না অন্তত একটা ready হয়, তারপর ready set return করে। `FD_SETSIZE` (সাধারণত 1024) descriptor-এ সীমাবদ্ধ, আর আপনি প্রতিটা call-এ পুরো set আবার তৈরি ও re-scan করেন। Per call O(n)।

**`poll`** — একই ধারণা কিন্তু একটা fixed bitmask-এর বদলে একটা array দিয়ে, 1024 সীমা তুলে দেয়। এখনো O(n): প্রতিটা call পুরো list পাস করে আর কার্নেল সব scan করে, এমনকি যদি শুধু একটা fd ready থাকে। দশ হাজার বেশিরভাগ-idle connection-এ এটা নিছক অপচয়।

**`epoll`** (Linux) — scalable উত্তর। আপনি `epoll_ctl` দিয়ে descriptor-এ interest _একবার_ register করেন; কার্নেল সেই interest set ভেতরে রাখে। `epoll_wait` তারপর কেবল সেই descriptor return করে যেগুলো _আসলে ready_। খরচ _active_ connection সংখ্যার সাথে scale করে, মোট registered সংখ্যার সাথে নয় — O(ready), O(n) নয়।

```c
int ep = epoll_create1(0);

struct epoll_event ev = { .events = EPOLLIN, .data.fd = sock };
epoll_ctl(ep, EPOLL_CTL_ADD, sock, &ev);   // register once

struct epoll_event events[64];
for (;;) {
    int n = epoll_wait(ep, events, 64, -1);  // block until ready
    for (int i = 0; i < n; i++) {
        handle(events[i].data.fd);           // only ready fds
    }
}
```

এ কারণেই `epoll` (আর BSD/macOS-এ সমতুল্য `kqueue`, Windows-এ IOCP) হলো প্রতিটা high-concurrency server-এর মেরুদণ্ড।

<Callout type="info">

**নোট:** `epoll` কেবল **readiness-based** waiting-এ সাহায্য করে — socket আর pipe। সাধারণ disk file মূলত সবসময় "ready", তাই `epoll` disk I/O-তে সাহায্য করে না। সেই ফাঁকটাই `io_uring`-কে অনুপ্রাণিত করেছিল, আংশিকভাবে।

</Callout>

## Edge-Triggered vs Level-Triggered

`epoll` দুটো notification mode দেয়, আর এগুলো গুলিয়ে ফেলা একটা ক্লাসিক bug:

- **Level-triggered (LT)** — default। `epoll_wait` একটা descriptor-কে ready হিসেবে রিপোর্ট করতেই থাকে _যতক্ষণ_ পড়ার মতো data আছে। আপনি যদি buffered data-র শুধু অংশ পড়েন, পরের `epoll_wait` আপনাকে মনে করিয়ে দেয় আরও আছে। ক্ষমাশীল।
- **Edge-triggered (ET)** — আপনাকে কেবল not-ready থেকে ready-তে _transition_-এ notify করা হয়। Data এলে আপনাকে _একবার_ বলা হয়। আপনি যদি সব drain না করেন, _নতুন_ data না আসা পর্যন্ত আপনাকে আবার বলা হবে না।

Edge-triggered-এর নিয়ম: প্রতিটা notification-এ, **`EAGAIN` না পাওয়া পর্যন্ত loop করে read করুন**, যাতে আপনি descriptor পুরোপুরি drain করেন। ET মানে কম wakeup (উঁচু performance) কিন্তু এই disciplined draining দাবি করে; ভুলে গেলে connection নীরবে unread data নিয়ে ঝুলে থাকে।

<Callout type="warning">

**সতর্কতা:** Edge-triggered `epoll`-এ, একটা single non-looping `read` হলো একটা stall হওয়ার অপেক্ষায়। সবসময় `EAGAIN` পর্যন্ত drain করুন। Level-triggered-এ, একটা partial read ক্ষতিকর নয় — আপনাকে কেবল আবার notify করা হবে।

</Callout>

## io_uring

`epoll` থাকলেও, প্রতিটা আলাদা `read`/`write` এখনো একটা পৃথক syscall যার নিজের trap আর data copy আছে। চরম request rate-এ syscall overhead নিজেই bottleneck হয়ে যায়। **`io_uring`** (modern Linux) এটা আক্রমণ করে।

এটা user space আর কার্নেলের মধ্যে দুটো shared ring buffer সেট আপ করে — একটা **submission queue** আর একটা **completion queue** — এমন memory-তে যা দুজনেই দেখতে পায়। Application submission ring-এ I/O request write করে আর কার্নেল completion ring-এ result post করে:

- **Batching** — প্রতিটার জন্য একটা করে syscall-এর বদলে এক (বা শূন্য) syscall দিয়ে অনেক operation submit করা।
- **সত্যিকারের asynchronous** — এটা শুধু socket নয়, disk file-এও কাজ করে, `epoll`-এর ছেড়ে যাওয়া ফাঁক বন্ধ করে।
- **কম overhead** — polled mode-এ কার্নেল কোনো syscall ছাড়াই submission তুলে নিতে পারে।

`io_uring` সরাসরি ব্যবহার করা আরও জটিল আর সাধারণত একটা library-র মাধ্যমে ব্যবহৃত হয়, কিন্তু এটা Linux-এ high-performance I/O-র বর্তমান সীমান্ত প্রতিনিধিত্ব করে।

## এটা কীভাবে Event Loop চালায়

টুকরোগুলো একসাথে রাখুন আর আপনি Node.js, nginx, Redis আর বেশিরভাগ async runtime-এর পেছনের architecture পাবেন: **event loop**।

```text
loop:
  ready = epoll_wait(...)          # block until something happens
  for fd in ready:
      data = read(fd)              # non-blocking, won't stall
      result = handle(data)        # run the right callback / task
      queue writes for ready fds
```

একটা single thread, **non-blocking** descriptor আর হাজার হাজার descriptor-এর অপেক্ষা করতে **`epoll`** ব্যবহার করে, কেবল যেগুলোতে কাজ আছে সেগুলো ছুঁয়ে বিপুল সংখ্যক connection service করে। কোনো thread-per-connection নেই, কোনো হাজার stack নেই, ন্যূনতম context switching। একটা descriptor যখন readiness signal দেয়, loop সংশ্লিষ্ট callback চালায় বা suspended task resume করে (একটা promise, একটা coroutine, একটা async function)।

এটাই পুরো track-এর পুরস্কার। Non-blocking I/O আর multiplexing (এই অধ্যায়) file descriptor আর page cache-এর উপর চড়ে (Chapter 7), scheduler-এর পরিচালিত thread-এ চলে (Chapter 3–4), কার্নেলের map করা virtual memory-র ভেতরে (Chapter 5), সবই সেই system-call boundary-র মধ্য দিয়ে পৌঁছানো যা দিয়ে আপনি Chapter 1-এ শুরু করেছিলেন। একটা high-performance server-এর "ম্যাজিক" কেবল এই OS primitive-গুলো, একসাথে গাঁথা।
