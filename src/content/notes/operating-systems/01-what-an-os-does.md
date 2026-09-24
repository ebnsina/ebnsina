---
title: 'একটা Operating System যা করে'
subtitle: 'কার্নেল আপনার প্রোগ্রাম আর hardware-এর মাঝখানে বসে থাকে — প্রতিটা resource-কে protect, share আর arbitrate করে।'
chapter: 1
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['kernel', 'syscall', 'user mode']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ঢাকার একটা বড় শেয়ার্ড অফিস বিল্ডিং। ভেতরে অনেকগুলো ভাড়াটে অফিস — কেউ সফটওয়্যার কোম্পানি, কেউ ট্রাভেল এজেন্সি, কেউ ছোট আমদানি-রপ্তানির ফার্ম। কিন্তু বিল্ডিংয়ের বিদ্যুৎ একটাই লাইন, লিফট মাত্র দুটো, মিটিং রুম গোনা কয়েকটা, আর পানির ট্যাংকও একটাই। এই সীমিত জিনিসগুলো সবাই একসাথে ব্যবহার করে। ম্যানেজার ফারাবি বসেন নিচতলার অফিসে, আর তাঁরই কাজ হলো এই শেয়ার্ড জিনিসগুলো সবার মধ্যে ন্যায্যভাবে ভাগ করে দেওয়া।

কোনো ভাড়াটে সরাসরি বিদ্যুতের তার ধরতে যায় না, নিজে থেকে লিফটের মোটর চালু করে না — সেটা করলে একটার ভুলে পুরো বিল্ডিংয়ের লাইন উড়ে যেত, একজনের মিটিং আরেকজনের রুম দখল করে ভেস্তে যেত। তাই সবাই ফারাবিকে অনুরোধ করে — "একটা মিটিং রুম লাগবে", "লিফটটা একটু পাঠান", "AC-র লাইনটা দেখুন"। ফারাবি ঠিক করেন কে কখন কোন রুম পাবে, লিফট কার তলায় আগে যাবে, আর কেউ যেন আরেকজনের বরাদ্দে হাত না দেয়। ফলে সিনার ট্রাভেল এজেন্সি আর খোয়ারিজমির সফটওয়্যার ফার্ম — দুজনেই মনে করে যেন গোটা বিল্ডিংটা তাদেরই, অথচ ভেতরে সবকিছু শেয়ার হচ্ছে।

এই গল্পটাই আসলে একটা **operating system**। ফারাবি হলো **OS** (বা কার্নেল), ভাড়াটেগুলো হলো চলতে থাকা **process/program**, আর শেয়ার্ড বিদ্যুৎ-লিফট-রুম হলো আসল hardware **resource** — **CPU**, **memory**, device। ভাড়াটেরা তার না ধরে ম্যানেজারকে অনুরোধ করে — এটাই **system call** আর abstraction: প্রোগ্রাম সরাসরি hardware ছোঁয় না, OS-কে অনুরোধ করে কাজ করিয়ে নেয়। আর একজনের ভুলে আরেকজন ভেস্তে না যাওয়াটাই isolation। বাস্তবে ঠিক এভাবেই আপনার ল্যাপটপে browser, music player আর code editor একসাথে চলে — প্রত্যেকে ভাবে গোটা মেশিনটা তার, অথচ OS পর্দার আড়ালে একই CPU আর memory সবার মধ্যে নিরাপদে ভাগ করে দিচ্ছে।

## একটা OS-এর কাজ

Bare hardware বৈরী। এর আছে এক সেট CPU, এক ব্লক physical RAM, একটা disk controller, একটা network card। প্রতিটা প্রোগ্রাম যদি সরাসরি সেগুলো ছুঁতে যেত, তাহলে প্রথম buggy process-টাই দ্বিতীয়টাকে corrupt করে ফেলত, আর একসাথে disk পড়া দুটো প্রোগ্রাম একে অন্যের data এলোমেলো করে দিত।

operating system এই সমস্যা সমাধানের জন্যই আছে। এটা সেই software যা:

- **Abstract** করে hardware-কে পরিষ্কার interface-এ — disk sector-এর বদলে file, network register-এর বদলে socket।
- **Isolate** করে প্রোগ্রামগুলোকে যেন একটা অন্যটার memory পড়তে বা নষ্ট করতে না পারে।
- **Arbitrate** করে shared resource — CPU time, memory, disk bandwidth — ন্যায্যভাবে ও নিরাপদে।

OS বাকি যা কিছু করে, সব এই তিন লক্ষ্যের সেবাতেই।

## কার্নেল

**কার্নেল** হলো OS-এর মূল অংশ — যে অংশটা সবসময় memory-তে থাকে আর hardware-এর উপরে পূর্ণ privilege নিয়ে চলে। Linux-এ এটা একটা বড় single program (একটা "monolithic" কার্নেল) যাতে scheduler, memory manager, file system আর device driver থাকে।

আপনি "the OS" বলতে যা বোঝেন তার বেশিরভাগই _কার্নেল না_। আপনার shell, window manager, `systemd`, `ls`, আর আপনার web browser — এগুলো সাধারণ প্রোগ্রাম। এরা থাকে **user space**-এ আর তাদের হয়ে privileged কাজ করে দিতে কার্নেলকে অনুরোধ করে।

```text
+-----------------------------------------------+
|  User space:  shell, browser, your app, libc  |
+-----------------------------------------------+
            |  system calls (the boundary)
+-----------------------------------------------+
|  Kernel:  scheduler, memory, FS, drivers      |
+-----------------------------------------------+
            |  hardware access
+-----------------------------------------------+
|  CPU, RAM, disk, network card                 |
+-----------------------------------------------+
```

## User Mode আর Kernel Mode

যে protection প্রোগ্রামগুলোকে আলাদা রাখে সেটা CPU নিজেই enforce করে। Modern processor কোড চালায় দুটো privilege level-এর একটিতে:

- **Kernel mode** (একে "supervisor" বা ring 0-ও বলে): কোড যেকোনো instruction execute করতে পারে আর যেকোনো memory বা device ছুঁতে পারে।
- **User mode** (ring 3): কোড সীমাবদ্ধ। Privileged instruction — device-এর সাথে কথা বলা, page table বদলানো, CPU থামানো — নিষিদ্ধ আর চেষ্টা করলে কার্নেলে trap করে।

আপনার প্রোগ্রাম user mode-এ চলে। শুধু কার্নেল যা করতে পারে এমন কিছুর দরকার হলে, CPU একটা নিয়ন্ত্রিত দরজা দিয়ে kernel mode-এ switch করে, বিশ্বস্ত kernel code চালায়, তারপর আবার ফিরে আসে। একটা user program কখনো ইচ্ছেমতো kernel code-এ _jump_ করতে পারে না; সে শুধু সুনির্দিষ্ট entry point-এ service চাইতে পারে।

<Callout type="info">

**নোট:** এই hardware enforcement-এর কারণেই একটা segfault পুরো মেশিন নয়, শুধু একটা process crash করায়। CPU illegal access ধরে ফেলে আর কার্নেলকে জানায়, যে অপরাধী process-টাকে kill করে — আর কেবল সেই process-টাকেই।

</Callout>

## System Calls

একটা **system call** হলো user program-এর সেই অনুরোধ যা দিয়ে সে কার্নেলে প্রবেশ করে। privileged কাজ করার এটাই একমাত্র উপায়। file পড়া, memory allocate করা, একটা process তৈরি করা, network packet পাঠানো — সবই system call।

সাধারণ Linux system call:

| Syscall              | যা করে                                     |
| -------------------- | ------------------------------------------ |
| `read` / `write`     | একটা file descriptor-এ বা থেকে byte সরায়  |
| `open` / `close`     | একটা file descriptor নেয় বা ছাড়ে         |
| `fork` / `execve`    | একটা process তৈরি করে / তার program বদলায় |
| `mmap` / `brk`       | memory map করে বা বাড়ায়                  |
| `socket` / `connect` | network communication সেট আপ করে           |

আপনি এগুলো খুব কমই সরাসরি invoke করেন। C library (`glibc`) প্রতিটাকে একটা function-এ মুড়ে দেয়। আপনি যখন `printf` call করেন, শেষ পর্যন্ত সেটা `write` syscall-কে call করে:

```c
#include <unistd.h>

int main(void) {
    const char *msg = "hello\n";
    write(1, msg, 6);   // fd 1 is stdout; this is a real syscall
    return 0;
}
```

যান্ত্রিকভাবে, একটা syscall অনুরোধকৃত service-কে চিহ্নিত করা একটা number একটা register-এ রাখে, argument-গুলো অন্যগুলোতে রাখে, আর একটা বিশেষ instruction (x86-64-এ `syscall`) execute করে। CPU kernel mode-এ switch করে আর কার্নেলের syscall handler-এ jump করে, যা সঠিক function-এ dispatch করে। ফিরে এলে, control result সহ user mode-এ ফিরে আসে।

আপনি এটা `strace` দিয়ে ঘটতে দেখতে পারেন:

```bash
strace -e trace=write ./hello
# write(1, "hello\n", 6) = 6
```

## Resource Manager হিসেবে OS

একটু পিছিয়ে দাঁড়ালে দেখা যায় কার্নেলের কাজ হলো চারটা বড় resource জুড়ে resource management:

- **CPU** — scheduler ঠিক করে প্রতিটা core-এ কোন thread চলবে আর কতক্ষণ (Chapter 4)।
- **Memory** — memory manager প্রতিটা process-কে একটা private virtual address space দেয়, যার পেছনে থাকে shared physical RAM (Chapter 5)।
- **Storage** — file system flat disk block-কে নামওয়ালা, hierarchical file-এ পরিণত করে (Chapter 7)।
- **Devices** — driver আর I/O subsystem network card, disk আর terminal-কে অনেক প্রোগ্রামের মধ্যে multiplex করে (Chapter 8)।

প্রতিটা resource সীমিত ও shared, আর কার্নেল হলো বিশ্বস্ত referee। এই framing-টা মাথায় রাখুন: এই track-এর প্রায় প্রতিটা OS concept আসলে এই প্রশ্নের উত্তর — _"এই এক টুকরো hardware অনেক প্রোগ্রামের মধ্যে নিরাপদে ও ন্যায্যভাবে কীভাবে ভাগ করব?"_
