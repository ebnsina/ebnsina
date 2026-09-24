---
title: 'CPU Scheduling'
subtitle: 'core-এর চেয়ে বেশি runnable thread থাকলে কার্নেলকে অবিরাম বেছে নিতে হয় পরের বার কে চলবে — দ্রুত আর ন্যায্যভাবে।'
chapter: 4
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['scheduler', 'preemption', 'cfs']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

শহরের একটা ব্যস্ত চেম্বার। ডাক্তার রাজি একজনই, কিন্তু বাইরের বেঞ্চে রোগীর ভিড় — বিরুনি, ফাতিমা, কিন্দি, আরও অনেকে। ডাক্তার তো একজন, একসাথে দুজনকে দেখতে পারেন না; কে আগে ঢুকবে সেই সিদ্ধান্তটা নেন সামনের ডেস্কে বসা সহকারী। সহকারী চাইলে সিরিয়াল ধরে দিতে পারেন — একেকজনকে ঠিক দশ মিনিট, সময় শেষ হলে "বাকিটা পরে দেখব" বলে পরের জনকে ঢুকিয়ে আগের জনকে লাইনের পেছনে পাঠিয়ে দেন। তাতে কেউ ঘণ্টার পর ঘণ্টা বসে থাকে না, প্রত্যেকে একটু একটু করে ডাক্তারের সময় পায়।

কিন্তু হঠাৎ যদি বুকে ব্যথা নিয়ে কেউ আসে, সহকারী তখন সিরিয়াল ভেঙে তাকেই আগে ঢোকান — জরুরি রোগী আগে। আবার কোনো দিন লম্বা লাইন দেখে সহকারী ভাবেন, যাদের কাজ দুই মিনিটেই সারবে (শুধু একটা প্রেসক্রিপশন রিফিল) তাদের আগে ছেড়ে দিলে ভিড়টা দ্রুত হালকা হবে — ছোট কাজ আগে। প্রতিটা নিয়মেই লাভ-ক্ষতি আছে: জরুরি রোগী বারবার এলে সাধারণ রোগী বসেই থাকেন, আর শুধু ছোট কাজ আগে দিতে থাকলে বড় সমস্যা নিয়ে আসা রোগীর পালা কখনো আসে না।

এই চেম্বারটাই আসলে একটা CPU। ডাক্তার রাজি হলো একটামাত্র CPU (বা core), অপেক্ষমাণ রোগীরা হলো ready **process**, আর সহকারীর "কাকে আগে ঢোকাব" সিদ্ধান্তটাই **scheduler**-এর **scheduling** নিয়ম। সিরিয়াল ধরে ঠিক দশ মিনিট করে দেওয়াটা **round-robin**, আর সেই দশ মিনিটই **time slice** (quantum); জরুরি রোগী আগে দেওয়াটা **priority**; ছোট কাজ আগে ছেড়ে দেওয়াটা shortest-job-first। বাস্তবে আপনার laptop-এও ঠিক এটাই ঘটে — শত শত process একটা-দুটো core-এর জন্য অপেক্ষা করে, আর OS-এর scheduler প্রতি কয়েক millisecond-এ ন্যায্যতা আর কাজ-শেষের গতির মধ্যে ভারসাম্য রেখে ঠিক করে পরের বার কে চলবে।

## Scheduling সমস্যা

একটা সাধারণ মেশিনে মুষ্টিমেয় কয়েকটা core কিন্তু শত শত বা হাজার হাজার runnable thread থাকে। **Scheduler** হলো কার্নেলের সেই অংশ যা মুহূর্তে মুহূর্তে ঠিক করে প্রতিটা core-এ কোন thread চলবে আর কতক্ষণ। এটা অবিরাম চলে আর microsecond-এ সিদ্ধান্ত নিতে হয়।

কোনো নিখুঁত schedule নেই, কারণ লক্ষ্যগুলো পরস্পরবিরোধী:

- **Throughput** — যতটা সম্ভব বেশি কাজ শেষ করা।
- **Latency / responsiveness** — interactive event-এ দ্রুত সাড়া দেওয়া (একটা keypress, একটা এসে পৌঁছানো packet)।
- **Fairness** — প্রতিটা thread একটা যুক্তিসঙ্গত ভাগ পায়; কেউ starve হয় না।
- **Efficiency** — scheduling overhead বা context switch-এ সময় নষ্ট না করা।

Throughput-এর জন্য optimize করলে (প্রতিটা job শেষ পর্যন্ত চালানো) responsiveness ক্ষতিগ্রস্ত হয়। Responsiveness-এর জন্য optimize করলে (অবিরাম switch) throughput ক্ষতিগ্রস্ত হয়। বাস্তব scheduler এগুলোর মধ্যে ভারসাম্য রাখে।

## Preemptive vs Cooperative

দুটো মৌলিক model:

- **Cooperative** — একটা thread চলে যতক্ষণ না সে _স্বেচ্ছায়_ yield করে (I/O-তে block করে বা একটা yield function call করে)। সরল, কিন্তু একটা দুষ্ট thread যে কখনো yield করে না সে পুরো system ঝুলিয়ে দেয়।
- **Preemptive** — কার্নেল জোর করে CPU ফিরিয়ে নিতে পারে। একটা hardware **timer interrupt** পর্যায়ক্রমে fire করে; interrupt handler scheduler চালায়, যা আরেকটা thread-এ switch করতে পারে।

Preempt হওয়ার আগে একটা thread যে সময়ের slice পায় তা হলো তার **time quantum** (বা time slice)। Linux আর প্রতিটা modern general-purpose OS preemptive — কোনো একটা program একটা core একচেটিয়া দখল করতে পারে না।

<Callout type="info">

**নোট:** Preemption-এর কারণেই একটা program-এর একটা runaway infinite loop আপনার desktop জমিয়ে দেয় না। program যাই করুক না কেন, timer interrupt CPU টেনে নিয়ে যায়।

</Callout>

## ক্লাসিক Algorithm

building-block algorithm-গুলোর একটা ভ্রমণ:

**First-Come, First-Served (FCFS).** Job-গুলো arrival order-এ, শেষ পর্যন্ত চালানো। সরল আর ক্রমে ন্যায্য, কিন্তু সামনে একটা লম্বা job থাকলে পেছনের সবাইকে অপেক্ষা করায় — _convoy effect_। একটা 10-second job তার পেছনে আটকে থাকা একটা 10-millisecond job-কে block করে দেয়।

**Round Robin (RR).** প্রতিটা thread-কে একটা fixed quantum দাও, তারপর তাকে queue-র পেছনে সরাও। স্বাভাবিকভাবেই ন্যায্য আর responsive। Quantum size একটা trade-off: বেশি বড় হলে এটা FCFS-এর দিকে অবনতি ঘটে; বেশি ছোট হলে context-switch overhead প্রাধান্য পায়।

```text
quantum = 10ms, threads A B C
time:  0    10   20   30   40   50
run:  [A ] [B ] [C ] [A ] [B ] [C ] ...
```

**Priority Scheduling.** প্রতিটা thread-এর একটা priority থাকে; scheduler সবচেয়ে উঁচু priority-র ready thread চালায়। গুরুত্বপূর্ণ কাজের জন্য দারুণ, কিন্তু উঁচু priority-র thread-এর একটা অবিরাম প্রবাহ নিচু priority-দের অনির্দিষ্টকালের জন্য **starve** করতে পারে।

**Multi-Level Feedback Queue (MLFQ).** একাধিক priority queue। নতুন thread উঁচুতে শুরু করে। যে thread তার পুরো quantum ব্যবহার করে (CPU-bound) সে নিচে নামানো হয়; যে thread তাড়াতাড়ি block করে (interactive, I/O-bound) সে উঁচুতে থাকে। এটা thread সম্পর্কে আগে থেকে কিছু না জেনেই স্বয়ংক্রিয়ভাবে responsive, interactive কাজকে প্রাধান্য দেয়। পর্যায়ক্রমিক _priority boost_ সবাইকে আবার উপরে তোলে যাতে স্থায়ী starvation না হয়।

## Linux CFS

বহু বছর ধরে Linux-এর default scheduler ছিল **Completely Fair Scheduler (CFS)**। এর ধারণা: fixed time slice-এর বদলে, প্রতিটা thread কত CPU time পেয়েছে তা track করো আর সবসময় সেটাকেই চালাও যে _সবচেয়ে কম_ পেয়েছে।

CFS প্রতিটা thread-এর একটা **virtual runtime** (`vruntime`) রাখে — মোটামুটি ব্যবহৃত CPU time, priority ("nice" value) দিয়ে weighted। সব runnable thread একটা red-black tree-তে `vruntime` অনুসারে সাজানো থাকে। Scheduler সবচেয়ে বাঁ দিকের node বেছে নেয় — সবচেয়ে ছোট `vruntime`-ওয়ালা thread, অর্থাৎ যাকে CPU সবচেয়ে বেশি "পাওনা"। একটা thread চলার সাথে সাথে তার `vruntime` বাড়ে আর সে tree-তে ডান দিকে নেমে যায়, শেষে অন্যদের কাছে ছেড়ে দেয়।

এর প্রভাব হলো, সময়ের সাথে সমান priority-র প্রতিটা thread CPU-র সমান ভাগে converge করে — fairness একটা fixed quantum নয় বরং একটা emergent property হিসেবে। Nice value weighting-কে bias করে: নিচু nice value `vruntime`-কে আরও ধীরে জমায়, তাই thread-টা বড় ভাগ পায়।

<Callout type="tip">

**টিপ:** `nice` আর `renice` একটা process-এর priority সমন্বয় করে। উঁচু nice value (19 পর্যন্ত) মানে "অন্যদের প্রতি সদয় হও" — কম CPU। নিচু value (-20 পর্যন্ত, শুধু root) বেশি দখল করে। সাম্প্রতিক Linux kernel একটা উত্তরসূরি scheduler-এর (EEVDF) দিকে এগিয়েছে, কিন্তু fair-share mental model বহাল থাকে।

</Callout>

## Starvation আর Fairness

**Starvation** হলো যখন একটা thread runnable কিন্তু কখনো CPU পায় না কারণ কিছু না কিছু সবসময় তার চেয়ে উঁচুতে থাকে। বিশুদ্ধ priority scheduling হলো ক্লাসিক অপরাধী।

প্রতিরক্ষা:

- **Aging** — যেসব thread অনেকক্ষণ অপেক্ষা করেছে তাদের priority ধীরে ধীরে বাড়াও, যাতে তারা শেষে উপরে উঠে আসে।
- **Fair-share scheduler** যেমন CFS — গঠনগতভাবে, সবচেয়ে অবহেলিত thread-টাই পরের বার বেছে নেওয়া হয়, তাই কেউ চিরকাল অপেক্ষা করে না।

Fairness আর responsiveness raw throughput-এর সাথে টানাপোড়েনে থাকে, আর প্রতিটা scheduler সেই spectrum-এ একটা বিন্দু বেছে নেয়। এই trade-off বোঝা অনেক পর্যবেক্ষিত আচরণ ব্যাখ্যা করে: কেন একটা batch job আপনার interactive shell ধীর করে দেয়, কেন একটা backup job-কে `nice` করলে সাহায্য হয়, আর কেন উঁচু priority-র কাজের একটা বন্যা বাকি সবকিছুকে হামাগুড়ি দিতে বাধ্য করে।

CPU sharing শেষ করে, পরের অধ্যায় আরেকটা মহান shared resource ধরে: memory।
