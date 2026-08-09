---
title: 'Processes'
subtitle: 'একটা চলমান প্রোগ্রামই একটা process — নিজের address space, নিজের resource, জন্ম থেকে মৃত্যু পর্যন্ত কার্নেল যাকে ট্র্যাক করে।'
chapter: 2
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['process', 'fork', 'exec']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনার একটা কারুশিল্পের কারখানা আছে, যেখানে অনেক কারিগর একসাথে কাজ করে। কিন্তু সবাই একটা খোলা হলঘরে বসে না — প্রতিটা কারিগরের জন্য আলাদা দেয়াল-ঘেরা একটা ব্যক্তিগত বুথ, নিজের ওয়ার্কবেঞ্চ, নিজের যন্ত্রপাতি। আল-খোয়ারিজমি তার বুথে বসে একটা কাজ করছে, পাশের বুথে ইবনে আল-হাইসাম আরেকটা। দুজনের মাঝে পুরু দেয়াল — আল-খোয়ারিজমি চাইলেও ইবনে আল-হাইসামের বুথে হাত ঢুকিয়ে তার কাঁচামাল বা যন্ত্র ছুঁতে পারে না, এমনকি ভেতরে কী চলছে দেখতেও পারে না। প্রতিটা বুথে যেকোনো এক মুহূর্তে একটাই চলমান কাজ।

কেউ যদি নতুন একটা কাজের বরাত দেয়, ইবনে সিনা একটা খালি বুথ বরাদ্দ করে, সেখানে নতুন কাঁচামাল আর নকশা সাজিয়ে কারিগরকে বসিয়ে দেয় — নতুন একটা চলমান কাজ শুরু। একটা বুথের কারিগর যদি ভুল করে হাতুড়ি ফেলে দেয়, সেই গোলমাল তার বুথেই আটকে থাকে; পাশের বুথের কাজ নির্বিঘ্নে চলতে থাকে।

এই গল্পটাই আসলে **process**। প্রতিটা দেয়াল-ঘেরা ব্যক্তিগত বুথ হলো একটা process, যার নিজের **address space** আছে; বুথের দেয়ালগুলোই হলো **memory isolation** — এক process আরেক process-এর memory সরাসরি পড়তে বা নষ্ট করতে পারে না, কিছু share করতে হলে কার্নেলের মধ্যস্থতা লাগে। আর বুথে চলা কাজটাই হলো executing **program**। বাস্তবে আপনার মেশিনে ব্রাউজার আর মিউজিক প্লেয়ার একসাথে চললে দুটো আলাদা process — একটা crash করলেও অন্যটা টিকে থাকে, ঠিক পাশের বুথ অক্ষত থাকার মতোই।

## একটা Process কী

একটা **process** হলো execution-এ থাকা একটা program। disk-এ থাকা program শুধু byte — একটা executable file। আপনি যখন সেটা run করেন, কার্নেল একটা process তৈরি করে: memory, open file, CPU time-এর একটা slice আর একটা identity নিয়ে একটা জীবন্ত instance।

একটা process-এর মূল বৈশিষ্ট্য হলো **isolation**। প্রতিটাই বিশ্বাস করে মেশিনটা কেবল তারই। এটা অন্য process-এর memory দেখতে পারে না, আর ভুলবশত সেটা corrupt-ও করতে পারে না। এই illusion দুটো জিনিস থেকে তৈরি: একটা private virtual address space (Chapter 5) আর একটা কার্নেল যে প্রতিটা shared resource-এর মধ্যস্থতা করে।

প্রতিটা process-এর একটা unique **PID** (process ID) আর একটা parent থাকে। প্রথম process, `init` বা `systemd` (PID 1), বাকি সবকিছুর পূর্বপুরুষ।

## Address Space

প্রতিটা process একটা private virtual address space পায়। ধারণাগতভাবে এটা কয়েকটা region-এ সাজানো:

```text
high addresses
+------------------+
|      stack       |  grows down; locals, call frames
|        |         |
|        v         |
|                  |
|        ^         |
|        |         |
|       heap       |  grows up; malloc / new
+------------------+
|   bss / data     |  globals (zeroed / initialized)
+------------------+
|       text       |  the program code (read-only)
+------------------+
low addresses
```

- **text** — machine instruction, read-only আর executable হিসেবে চিহ্নিত।
- **data / bss** — global আর static variable।
- **heap** — `malloc` থেকে আসা dynamic memory, উঁচু address-এর দিকে বাড়ে।
- **stack** — function call frame আর local, নিচু address-এর দিকে বাড়ে।

এই address-গুলো _virtual_। দুটো process দুজনেই `0x400000` address ব্যবহার করতে পারে আর কার্নেল প্রতিটাকে ভিন্ন physical RAM-এ map করে।

## Process Control Block

কার্নেলকে প্রতিটা process ট্র্যাক করতে হয়। এটা যা জানে সব একটা per-process structure-এ রাখে — **Process Control Block (PCB)**। Linux-এ এটা `struct task_struct`। এতে থাকে:

- PID আর parent PID।
- Process state (running, sleeping, ইত্যাদি)।
- Saved CPU register, যাতে process-টা pause আর resume করা যায়।
- তার address space-এর (page table) একটা pointer।
- file descriptor table (open file, socket)।
- Scheduling info, priority, আর accounting (ব্যবহৃত CPU time)।

কার্নেল যখন এক process থেকে আরেকটায় switch করে, তখন সে বর্তমান register-গুলো PCB-তে save করে আর পরের process-এর register load করে — একটা **context switch**।

## Process State

একটা process একটা ছোট state machine-এর মধ্য দিয়ে চলে:

| State       | মানে                                               |
| ----------- | -------------------------------------------------- |
| **Running** | এই মুহূর্তে একটা CPU-তে চলছে                       |
| **Ready**   | চলার জন্য প্রস্তুত, একটা CPU খালি হওয়ার অপেক্ষায় |
| **Blocked** | একটা event-এর অপেক্ষায় (disk read, network, lock) |
| **Zombie**  | শেষ, কিন্তু তার exit status এখনো সংগ্রহ করা হয়নি  |

একটা সাধারণ জীবন: একটা process **ready**, scheduler সেটা চালায় (**running**), সে একটা file পড়তে চায় আর disk সাড়া না দেওয়া পর্যন্ত **blocked** হয়ে যায়, তারপর আবার **ready** হয়। বেশিরভাগ process তাদের জীবনের বেশিরভাগ সময় blocked থাকে, running না।

<Callout type="tip">

**টিপ:** `ps` output-এ `STAT` column এগুলো দেখায়। `R` হলো running/ready, `S` হলো sleeping (interruptible block), `D` হলো uninterruptible sleep (সাধারণত disk I/O), আর `Z` হলো একটা zombie।

</Callout>

## Process তৈরি: fork আর exec

Unix একটা ইচ্ছাকৃতভাবে বিভক্ত design দিয়ে process তৈরি করে: `fork` একটা copy বানায়, `exec` program-টা বদলে দেয়।

`fork` একটা প্রায় হুবহু child process তৈরি করে। এটা **দুবার** return করে — একবার parent-এ (child-এর PID return করে) আর একবার child-এ (0 return করে):

```c
#include <unistd.h>
#include <stdio.h>

int main(void) {
    pid_t pid = fork();
    if (pid == 0) {
        printf("child\n");      // child path
    } else {
        printf("parent of %d\n", pid);  // parent path
    }
    return 0;
}
```

child, parent-এর address space-এর একটা copy পায়। কার্নেল সব memory শারীরিকভাবে copy করে না — এটা **copy-on-write** ব্যবহার করে: parent আর child একই physical page share করে যতক্ষণ না একটা write করে, তখন সেই page-টা duplicate হয়। Forking সস্তা।

`exec` (`execve` syscall) বর্তমান process image-কে একটা নতুন program দিয়ে বদলে দেয়। PID একই থাকে, কিন্তু text, data, heap আর stack ফেলে দেওয়া হয় আর নতুন executable থেকে আবার তৈরি হয়:

```c
execlp("ls", "ls", "-l", NULL);
// if this returns, it failed; otherwise we are now 'ls'
```

আদর্শ pattern হলো **fork তারপর exec**: parent fork করে, child নতুন program exec করে, আর parent চলতেই থাকে। আপনার shell আপনার টাইপ করা প্রতিটা command-এর জন্য ঠিক এটাই করে।

## wait, Zombie, আর Orphan

একটা child শেষ হলে, সে পুরোপুরি অদৃশ্য হয় না। কার্নেল তার exit status রেখে দেয় যাতে parent সেটা পড়তে পারে। parent সেটা `wait` (বা `waitpid`) দিয়ে সংগ্রহ করে:

```c
int status;
pid_t child = fork();
if (child == 0) {
    return 42;          // child exits with code 42
}
waitpid(child, &status, 0);   // parent reaps it
```

দুই ধরনের failure:

- একটা **zombie** হলো একটা শেষ হওয়া child যার parent `wait` call করেনি। এটা process table-এ শুধু একটা slot ধরে রাখে, কিন্তু যে program reap না করে অবিরাম fork করে সে সেই slot-গুলো leak করে। সমাধান হলো সবসময় child-দের জন্য `wait` করা।
- একটা **orphan** হলো একটা child যার parent আগে exit করে। কার্নেল এটাকে PID 1-এ **reparent** করে, যে পর্যায়ক্রমে তার child-দের reap করে। Orphan ক্ষতিকর নয়; zombie-ই হলো যে leak-টা খেয়াল রাখতে হয়।

<Callout type="info">

**নোট:** একটা zombie-কে `kill` দিয়ে kill করা যায় না — সে তো ইতিমধ্যেই মৃত। প্রতিকার হলো _parent_-কে দিয়ে `wait` call করানো, অথবা parent-কে terminate করা যাতে zombie-টা PID 1-এ reparent হয়ে reap হয়।

</Callout>

Process-কে isolated unit হিসেবে বোঝার পর, পরের অধ্যায় দেখবে একটা process-এর _ভেতরে_ execution-এর একাধিক flow চালানো: thread।
