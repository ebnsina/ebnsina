---
title: 'কোয়ালিটি ও মনিটরিং'
subtitle: 'PSNR, SSIM ও VMAF কী মাপে আর কী মিস করে, QoE-ই কেন আসল metric, প্লেয়ার instrument করা, ভিডিও সার্ভিসের SLO, এনকোডিং পরিবর্তনের নিরাপদ A/B — আর পুরো ট্র্যাক এক সুতোয়।'
chapter: 10
level: 'mastery'
readingTime: '৩০ মিনিট'
topics:
  [
    'PSNR',
    'SSIM',
    'VMAF',
    'QoE',
    'rebuffer ratio',
    'player telemetry',
    'SLO',
    'error budget',
    'A/B testing'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

কাপড়ের পরিদর্শক থান মেপে বলতে পারেন সুতো ঠিক আছে কিনা। কিন্তু ক্রেতা দোকান থেকে বেরিয়ে গেছে কিনা, সেটা তার মাপকাঠিতে ধরা পড়ে না। ভিডিওতে VMAF হলো থান মাপা, আর QoE হলো ক্রেতা থেকে গেল কিনা।

</Callout>

## গল্পে বুঝি

ফেজ শহরে ফাতিমা আল-ফিহরির একটা বড় তাঁতঘর। সেখানে দিনে শত শত থান কাপড় বোনা হয়, আর প্রতিটা থান বাজারে যাওয়ার আগে পরিদর্শক আল-কিন্দির টেবিল পেরোয়। আল-কিন্দির কাজ একটাই — বলা যে থানটা যথেষ্ট ভালো কিনা। কিন্তু "যথেষ্ট ভালো" মাপতে গিয়ে তিনি বছরের পর বছর ধরে তিনটা আলাদা পদ্ধতি ব্যবহার করেছেন, আর প্রতিটার শেখাটা আলাদা।

প্রথম বছর তার পদ্ধতি ছিল সবচেয়ে সরল আর সবচেয়ে বোকা। তার টেবিলের পাশে ঝোলানো থাকত একটা **আদর্শ থান** — নিখুঁত, মাস্টার তাঁতির বোনা। নতুন থান এলে তিনি দুটো পাশাপাশি রেখে সুতো ধরে ধরে মেলাতেন, আর যত সুতোর অবস্থান আদর্শ থানের সাথে মেলে না তত নম্বর কাটতেন। পদ্ধতিটা নিখুঁতভাবে **হিসাবি** — দুইজন লোক গুনলে একই সংখ্যা পাবে। কিন্তু ফল ছিল আজব: একটা থানে সামান্য এদিক-ওদিক হওয়া হাজারটা সুতোর কারণে খারাপ নম্বর পেত, অথচ চোখে সেটা চমৎকার লাগত; আবার আরেকটা থান, যার মাঝখানে একটাই দগদগে ছেঁড়া দাগ, ভালো নম্বর পেয়ে যেত কারণ বাকি সব সুতো ঠিক জায়গায় ছিল। **আল-কিন্দি এমন কিছু মাপছিলেন যা মানুষ দেখেই না।** এটাই **PSNR**।

দ্বিতীয় বছর তিনি পদ্ধতি বদলালেন। সুতো গোনা বাদ দিয়ে তিনি ছোট ছোট চৌকো জানালা দিয়ে কাপড়ের **বুনটের গঠন** দেখতে শুরু করলেন — এই অংশটার বুনন কি একই রকম ঘন? নকশাটা কি ধারাবাহিক? আলো পড়লে ঝিলিক কি সমান? এটা অনেক ভালো কাজ করল, কারণ মানুষের চোখও আসলে বিন্দু গোনে না, **গঠন** দেখে। কিন্তু এখানেও ফাঁক রয়ে গেল: থানটা যদি সমানভাবে একটু ঝাপসা হয়, গঠন ঠিকই থাকে আর নম্বরও ভালো আসে — অথচ ক্রেতার হাতে সেটা নিস্তেজ লাগে। এটাই **SSIM**।

তৃতীয় বছর ফাতিমা একটা সম্পূর্ণ ভিন্ন কাজ করতে বললেন। তিনি বাজার থেকে চল্লিশজন প্রকৃত ক্রেতাকে ডাকলেন, তাদের সামনে দুইশো থান রাখলেন, আর বললেন প্রত্যেকে প্রতিটা থানকে এক থেকে একশো নম্বর দিতে। তারপর আল-কিন্দি বসে গেলেন সেই নম্বরগুলোর সাথে তার নিজের মাপগুলো মেলাতে — সুতোর হিসাব, বুনটের গঠন, নিস্তেজতা, ঝিলিক, নকশার ধারাবাহিকতা। কয়েক মাস পরে তিনি একটা **ওজন করা তালিকা** বানিয়ে ফেললেন: এই মাপটার গুরুত্ব এতখানি, ওটার এতখানি — আর সব মিলিয়ে যে সংখ্যাটা আসে, সেটা ক্রেতাদের গড় রায়ের প্রায় সমান হয়। এখন আল-কিন্দি চল্লিশজন ক্রেতা না ডেকেই বলে দিতে পারেন তারা কী বলত। এটাই **VMAF** — মেশিন যা মাপতে পারে সেগুলো থেকে মানুষ যা বলত সেটা অনুমান করার একটা শেখানো মডেল।

এই তালিকা তাঁতঘর পাল্টে দিল, আর সেটা যেভাবে পাল্টাল সেটাই আসল গল্প। আগে সব কাপড়ের জন্য একই মানের সুতো আর একই ঘনত্ব ব্যবহার হতো — কারণ কেউ জানত না কোনটায় কতটা লাগে। এখন আল-কিন্দি দেখালেন যে **সাদা মসলিনে** ঘনত্ব একটু কমালেও ক্রেতা টের পায় না, অথচ **জটিল নকশার ব্রোকেডে** একই ছাড় দিলে নম্বর ধসে যায়। ফলে ফাতিমা প্রতিটা কাপড়ের ধরন অনুযায়ী আলাদা ঘনত্ব ঠিক করলেন — সস্তা কাপড়ে সুতো বাঁচল, দামি কাপড়ে মান বাড়ল, আর মোট খরচ কমল। এটাই **per-title encoding**, আর এই সিদ্ধান্তটা VMAF ছাড়া নেওয়াই যেত না।

কিন্তু ছয় মাস পরে ফাতিমা লক্ষ্য করলেন বিক্রি বাড়েনি, বরং কমেছে। অথচ আল-কিন্দির খাতায় গড় নম্বর আগের চেয়ে বেশি। তিনি নিজে দোকানে গিয়ে সারাদিন বসে রইলেন, আর যা দেখলেন তা খাতায় কোথাও ছিল না। ক্রেতা এসে থান চাইছে, দোকানের ছেলে গুদামে খুঁজতে যাচ্ছে, **সাত মিনিট পরে** ফিরছে — ততক্ষণে অর্ধেক ক্রেতা চলে গেছে। যারা থেকেছে, তাদের কাপড় দেখানোর মাঝপথে ছেলেটা আবার গুদামে দৌড়াচ্ছে, কারণ ওই রঙের বাকিটা সামনে নেই — **প্রতি থানে দুইবার করে থেমে যাওয়া**। আর কিছু ক্রেতা যে থান চেয়েছিল সেটা গুদামে খুঁজেই পাওয়া যায়নি, তারা কিছু না কিনেই বেরিয়ে গেছে। ফাতিমা তখন বললেন যে কথাটা এই অধ্যায়ের মূল কথা: **"আল-কিন্দি, তুমি নিখুঁতভাবে মাপছ কাপড়টা কত ভালো। কিন্তু ক্রেতা কাপড়টা দেখতেই পায়নি।"**

তাই তিনি একটা দ্বিতীয় খাতা চালু করলেন, আর সেটা কাপড়ের নয়, **ক্রেতার**। প্রতিটা ক্রেতার জন্য চারটা জিনিস লেখা হয়: দোকানে ঢোকার কত পরে প্রথম থান তার হাতে এলো, দেখানোর মাঝে কতবার আর কত সময় থেমে থাকতে হলো, শেষ পর্যন্ত সে যে মানের কাপড় দেখল তার গড় কত, আর সে কিছু না দেখেই বেরিয়ে গেল কিনা। এই চারটা সংখ্যাই **QoE**: **startup time**, **rebuffer ratio**, **average bitrate delivered**, আর **exit-before-video-start**। আর গিল্ডের কাছে ফাতিমার লিখিত প্রতিশ্রুতি — "একশোজনের অন্তত পঁচানব্বইজন দুই মিনিটের মধ্যে প্রথম থান হাতে পাবে" — সেটাই **SLO**, আর যে পাঁচজনের দেরি হতে পারে সেটাই তার **error budget**।

শেষ কৌশলটা ছিল সবচেয়ে সূক্ষ্ম। নতুন এক ধরনের সুতো এলো, যাতে খরচ কম কিন্তু আল-কিন্দির নম্বর প্রায় একই। পুরো তাঁতঘর সেটায় সরিয়ে দেওয়ার বদলে ফাতিমা **প্রতি বিশজন ক্রেতার একজনকে** নতুন সুতোর কাপড় দেখাতে বললেন, দুই সপ্তাহ ধরে, আর দুই দলের ক্রেতার খাতা আলাদা করে রাখলেন। দুই সপ্তাহ পরে দেখা গেল নতুন সুতোয় নম্বর একই, খরচ কম, কিন্তু **ফেরত আসার হার সামান্য বেশি** — কারণ ধোয়ার পরে রঙ একটু চটে। এক শতাংশ ক্রেতার উপর পরীক্ষা করে জানা গেল যা পুরো তাঁতঘর বদলে ফেললে ছয় মাস পরে জানা যেত। এটাই **A/B টেস্ট**।

মিলিয়ে নিই: সুতো ধরে ধরে আদর্শ থানের সাথে মেলানো হলো **PSNR** (হিসাবি, কিন্তু মানুষ যা দেখে তা নয়); বুনটের গঠন দেখা হলো **SSIM**; চল্লিশজন ক্রেতার রায় থেকে বানানো ওজন করা তালিকা হলো **VMAF**; কাপড়ের ধরন অনুযায়ী আলাদা ঘনত্ব হলো **per-title encoding**; ক্রেতার খাতার চারটা সংখ্যা হলো **QoE metrics**; গিল্ডকে দেওয়া প্রতিশ্রুতি **SLO** আর অনুমোদিত দেরি **error budget**; আর বিশজনে একজনের উপর পরীক্ষা হলো **A/B test**। সবচেয়ে বড় শিক্ষা একটাই: **VMAF বলে আপনি কী পাঠিয়েছেন, QoE বলে দর্শক কী পেয়েছে — আর দ্বিতীয়টা প্রথমটার চেয়ে বেশি গুরুত্বপূর্ণ।**

## দুটো আলাদা প্রশ্ন

ভিডিও কোয়ালিটি নিয়ে বেশিরভাগ বিভ্রান্তির উৎস হলো দুটো সম্পূর্ণ আলাদা প্রশ্নকে একটা শব্দে ঢুকিয়ে দেওয়া।

**প্রশ্ন ১ — এনকোডটা কতটা ভালো?** উৎস ফাইলের তুলনায় আমার এনকোড করা রেন্ডিশনটা কতটা কাছাকাছি? এটা একটা **অফলাইন, নির্ধারণযোগ্য** প্রশ্ন। উত্তর দেয় PSNR, SSIM, VMAF। এটা এনকোডিং সেটিং, ladder ডিজাইন আর কোডেক নির্বাচনের প্রশ্ন।

**প্রশ্ন ২ — দর্শক কী পেল?** সে কি ভিডিও দেখতে পারল? কত দ্রুত শুরু হলো? কতবার আটকাল? সে আসলে কোন rung-এ দেখল? এটা একটা **অনলাইন, পরিসংখ্যানগত** প্রশ্ন যার উত্তর কেবল প্রকৃত দর্শকের ডেটা থেকে আসে। এটাই **QoE** (Quality of Experience)।

দুটোর মধ্যে সম্পর্ক আছে কিন্তু সেটা একমুখী: **ভালো এনকোড ভালো অভিজ্ঞতার প্রয়োজনীয় শর্ত, যথেষ্ট শর্ত নয়।** নিখুঁতভাবে এনকোড করা একটা 4K রেন্ডিশন যদি দর্শকের কাছে পৌঁছাতে ১২ সেকেন্ড লাগে আর মিনিটে দুইবার আটকায়, তাহলে তার VMAF ৯৮ হওয়ায় কারও কিছু আসে-যায় না। উল্টোদিকে, VMAF ৮০-র একটা রেন্ডিশন যা তাৎক্ষণিক শুরু হয় আর কখনো আটকায় না — সেটা দর্শকের কাছে ভালো ভিডিও।

<Mermaid
title="দুটো প্রশ্ন, দুটো মাপার জায়গা"
code={`graph LR
  S["Source"] --> E["Encoder"]
  E --> R["Rendition"]
  R -.->|"PSNR / SSIM / VMAF<br/>offline"| Q1["এনকোড কি ভালো?"]
  R --> C["Packager + CDN"]
  C --> P["Player"]
  P -.->|"startup, rebuffer,<br/>EBVS -- online"| Q2["দর্শক কী পেল?"]`}
/>

## Objective metrics: প্রতিটা কী মাপে, কী মিস করে

তিনটা metric-ই **full-reference**: এরা এনকোড করা ভিডিওকে মূল উৎসের সাথে ফ্রেম-বাই-ফ্রেম তুলনা করে। মানে এদের ব্যবহারের জন্য উৎস ফাইল থাকতেই হবে — যা VOD পাইপলাইনে থাকে, লাইভে থাকে না।

### PSNR

Peak Signal-to-Noise Ratio। এটা মূলত পিক্সেলে-পিক্সেলে গড় বর্গ ত্রুটিকে (MSE) ডেসিবেলে প্রকাশ করা।

```text
MSE  = প্রতিটা পিক্সেলের (source - encoded) এর বর্গের গড়
PSNR = 10 x log10( MAX^2 / MSE )        MAX = 255 (8-bit)

মোটামুটি ব্যাখ্যা:
  40+ dB   চোখে পার্থক্য ধরা কঠিন
  30-40 dB সাধারণ ডেলিভারি মান
  20-30 dB দৃশ্যমান ক্ষতি
```

**কী ভালো:** গণনায় সস্তা, সম্পূর্ণ নির্ধারিত, দশকের পর দশকের তুলনামূলক ডেটা আছে, আর কোডেক ডেভেলপমেন্টে দুটো এনকোডার সেটিং তুলনায় এখনো কাজে লাগে।

**কী মিস করে:** সবচেয়ে গুরুতরভাবে, **এটা জানে না মানুষ কী দেখে**। ছবিটা এক পিক্সেল সরিয়ে দিলে PSNR ধসে যায় যদিও চোখে কোনো পার্থক্য নেই। উল্টোদিকে একটা মুখের উপর ছোট কিন্তু দগদগে blocking artifact PSNR-এ প্রায় অদৃশ্য, অথচ দর্শকের চোখে সবার আগে সেটাই পড়ে। এটা grain বা texture হারিয়ে যাওয়াকে শাস্তি দেয় না, আবার সামান্য উজ্জ্বলতার পরিবর্তনকে অতিরিক্ত শাস্তি দেয়।

### SSIM

Structural Similarity Index। পিক্সেল গোনা বাদ দিয়ে এটা ছোট ছোট জানালায় তিনটা জিনিস তুলনা করে — **luminance** (গড় উজ্জ্বলতা), **contrast** (বিচ্যুতি), আর **structure** (স্থানীয় প্যাটার্নের সহ-সম্পর্ক)। ফলাফল ০ থেকে ১।

**কী ভালো:** মানুষের ধারণার সাথে PSNR-এর চেয়ে অনেক ভালো মেলে, কারণ মানুষের দৃষ্টিও গঠন-সংবেদনশীল। blocking-এর মতো কাঠামোগত ক্ষতি ভালো ধরে।

**কী মিস করে:** সমান blur-এর প্রতি নমনীয় — পুরো ছবিটা একটু ঝাপসা হলে গঠন ঠিকই থাকে, স্কোর নামে না, অথচ দর্শকের কাছে ছবিটা নরম লাগে। সময়ের মাত্রা একেবারেই দেখে না — **frame drop, judder বা flicker** SSIM-এ ধরা পড়ে না, কারণ প্রতিটা ফ্রেম আলাদাভাবে দেখা হয়। আর ভিন্ন কনটেন্ট বা ভিন্ন রেজল্যুশনের মধ্যে SSIM স্কোর তুলনা করা যায় না।

### VMAF

Video Multimethod Assessment Fusion — Netflix-এর তৈরি ও ওপেন-সোর্স করা। মৌলিক ধারণাটা আগের দুটোর থেকে আলাদা: **একটা নিখুঁত সূত্র খোঁজার চেষ্টাই করে না**। বরং এটা কয়েকটা প্রাথমিক metric-কে একসাথে করে একটা **শেখানো মডেল**, যা প্রকৃত মানুষের দেওয়া নম্বরের (subjective MOS study) উপর প্রশিক্ষিত।

এর উপাদানগুলো:

- **VIF** (Visual Information Fidelity) — কয়েকটা স্কেলে কতটা তথ্য টিকে আছে
- **DLM / ADM** (Detail Loss Measure) — বিস্তারিত হারানো আর artifact যোগ হওয়া আলাদা করে দেখে
- **Motion feature** — পাশাপাশি ফ্রেমের মধ্যে গতি; দ্রুত গতির দৃশ্যে মানুষ artifact কম দেখে, তাই এই মাত্রাটা দরকার

এই feature গুলোকে একটা SVM রিগ্রেসর মিলিয়ে ০-১০০ স্কেলে একটা সংখ্যা দেয়, যেখানে **১০০ মানে উৎসের সমান** এবং **প্রায় ৬ পয়েন্ট মানে গড় দর্শকের কাছে "লক্ষণীয় পার্থক্য"**।

গুরুত্বপূর্ণ সূক্ষ্মতা যা প্রায়ই এড়িয়ে যাওয়া হয়:

- **VMAF-এর মডেল দেখার অবস্থার সাথে বাঁধা।** ডিফল্ট মডেল ধরে নেয় ১০৮০p পর্দা, নির্দিষ্ট দূরত্ব থেকে। ফোনের জন্য আলাদা মডেল (`vmaf_4k`, ফোন মডেল) আছে, আর ভুল মডেল ব্যবহার করলে ফলাফল বিভ্রান্তিকর।
- **তুলনা একই রেজল্যুশনে হতে হবে।** ৪৮০p রেন্ডিশনের VMAF মাপতে হলে সেটাকে উৎসের রেজল্যুশনে upscale করে তুলনা করতে হয় — কারণ দর্শকও সেটাকেই upscale করে দেখে। এই ধাপটা ভুলে গেলে সব rung-এর স্কোর অর্থহীন।
- **গড় VMAF বিভ্রান্তিকর।** একটা ভিডিওর গড় ৯৩ হলেও তার ভেতরে ১৫ সেকেন্ডের একটা অংশ ৬০-এ থাকতে পারে — আর দর্শক ঠিক ওই অংশটাই মনে রাখবে। **সর্বনিম্ন VMAF আর নিচের ৫ পার্সেন্টাইল** গড়ের চেয়ে বেশি কাজের।
- **VMAF-কে অপ্টিমাইজ করা যায়, ঠকানোও যায়।** কিছু প্রিপ্রসেসিং (যেমন শার্পনিং) VMAF স্কোর বাড়ায় অথচ দর্শকের কাছে ছবিটা কৃত্রিম লাগে। VMAF একটা proxy — লক্ষ্য নয়।

| Metric | কী দেখে                       | শক্তি                           | অন্ধ জায়গা                                  |
| ------ | ----------------------------- | ------------------------------- | -------------------------------------------- |
| PSNR   | পিক্সেল-স্তরের ত্রুটি         | সস্তা, তুলনীয়, নির্ধারিত       | মানুষ কী দেখে জানে না                        |
| SSIM   | স্থানীয় গঠন                  | blocking ভালো ধরে               | blur-এ নমনীয়, সময়ের মাত্রা নেই             |
| VMAF   | শেখানো মিশ্রণ, MOS-প্রশিক্ষিত | মানুষের রায়ের সবচেয়ে কাছাকাছি | মডেল/দেখার অবস্থার উপর নির্ভরশীল, ঠকানো যায় |

<Callout type="warning">

তিনটার কোনোটাই **rebuffer, startup delay বা ABR সুইচিং** ধরে না — কারণ তিনটাই ফাইল বনাম ফাইল তুলনা করে, দর্শকের সেশন দেখে না। তিনটার স্কোর নিখুঁত হয়েও দর্শক জঘন্য অভিজ্ঞতা পেতে পারে। এই একটা বাক্য মনে রাখলে বাকি অধ্যায়টা সহজ।

</Callout>

## VMAF কীভাবে ladder tuning বদলে দিল

VMAF-এর আগে bitrate ladder ঠিক হতো অনুমান আর ঐতিহ্য দিয়ে: "1080p মানে 5 Mbps, 720p মানে 3 Mbps" — সব কনটেন্টের জন্য একই। VMAF এসে দুটো জিনিস সম্ভব করল, আর দুটোই সরাসরি টাকার সাথে জড়িত।

**এক, per-title encoding।** যদি "যথেষ্ট ভালো"-কে একটা সংখ্যায় প্রকাশ করা যায় (ধরা যাক VMAF ৯৩), তাহলে প্রতিটা কনটেন্টের জন্য আলাদাভাবে জিজ্ঞেস করা যায়: এই ৯৩-এ পৌঁছাতে **এই** ভিডিওর কত বিটরেট লাগে? একটা কথা-বলা মাথার ভিডিও (লেকচার, খবর) ৯৩-এ পৌঁছে যায় 1.5 Mbps-এ; একটা অ্যাকশন দৃশ্য, বা grain-ভরা পুরনো ফিল্ম, ৯৩-এর জন্য চায় 8 Mbps। একই ladder দুটোতেই ব্যবহার করা মানে প্রথমটায় বাইট নষ্ট করা আর দ্বিতীয়টায় দর্শককে ঠকানো।

**দুই, convex hull দিয়ে rung বাছা।** প্রতিটা রেজল্যুশনের জন্য বিভিন্ন বিটরেটে এনকোড করে (রেজল্যুশন, বিটরেট, VMAF) বিন্দুগুলো প্লট করলে দেখা যায় প্রতিটা রেজল্যুশনের একটা কার্যকর পরিসর আছে। কোনো বিটরেটে 720p-র VMAF 1080p-র চেয়ে ভালো হয়, কারণ কম পিক্সেলে বিটগুলো ঘন হয়ে বসে। এই বিন্দুগুলোর **উপরের খামটাই (convex hull)** আপনার সঠিক ladder — প্রতিটা বিটরেটে যে রেজল্যুশনটা সবচেয়ে ভালো VMAF দেয়।

```text
নমুনা: একটা লেকচার ভিডিওর convex hull বিশ্লেষণ

resolution  bitrate   VMAF    hull-এ আছে?
360p        0.4 Mbps   72.1    হ্যাঁ
360p        0.8 Mbps   81.4    না  (480p একই বিটরেটে ভালো)
480p        0.8 Mbps   84.9    হ্যাঁ
480p        1.6 Mbps   90.2    না  (720p ভালো)
720p        1.6 Mbps   92.6    হ্যাঁ
720p        3.0 Mbps   95.1    না  (1080p ভালো)
1080p       3.0 Mbps   96.0    হ্যাঁ
1080p       6.0 Mbps   97.8    হ্যাঁ  (top rung)

নির্বাচিত ladder: 360p@0.4, 480p@0.8, 720p@1.6, 1080p@3.0, 1080p@6.0
ঐতিহ্যবাহী ladder হতো: 360p@0.6, 480p@1.2, 720p@3.0, 1080p@6.0
→ প্রতিটা rung-এ কম বিটরেট, একই VMAF
```

দুটো এনকোডিং কনফিগারেশন তুলনার প্রমিত পদ্ধতি হলো **BD-rate** (Bjontegaard Delta rate): একই মানে পৌঁছাতে গড়ে কত শতাংশ কম বা বেশি বিটরেট লাগছে। "AV1 H.264-এর চেয়ে ৩০% ভালো" — এ ধরনের দাবি প্রায় সবসময় BD-rate-এর ভাষায় বলা, আর সেটা একটা মাত্র বিন্দুতে VMAF তুলনার চেয়ে অনেক বেশি অর্থবহ।

<Callout type="tip">

VMAF চালানো দামি — উৎসের রেজল্যুশনে প্রতিটা ফ্রেম বিশ্লেষণ করতে হয়। ব্যবহারিক নকশা হলো **প্রতিটা এনকোডে VMAF না চালানো**: প্রতিটা কনটেন্টের কয়েকটা প্রতিনিধিত্বমূলক অংশে (সবচেয়ে জটিল দৃশ্যগুলোতে) চালান, ফলাফল থেকে ladder ঠিক করুন, আর তারপর নিয়মিত পাইপলাইনে কেবল **নমুনা** হিসেবে চালান যাতে regression ধরা পড়ে।

</Callout>

## QoE: যেসব metric আসলে গুরুত্বপূর্ণ

এখানেই মাপার জায়গাটা এনকোডার থেকে সরে প্লেয়ারে চলে আসে। পাঁচটা সংখ্যা মূলত পুরো ছবিটা বলে দেয়।

**১. Startup time (join time)।** দর্শক play চাপার পর থেকে প্রথম ফ্রেম দেখা পর্যন্ত সময়। এটাই সবচেয়ে সংবেদনশীল metric — প্রতি এক সেকেন্ড দেরিতে উল্লেখযোগ্য সংখ্যক দর্শক হারায়। ভাঙতে হবে অংশে: manifest fetch, DRM লাইসেন্স, প্রথম সেগমেন্ট fetch, ডিকোডার init। কোন অংশটা দায়ী সেটা না জানলে ঠিক করা যায় না।

**২. Rebuffer ratio।** মোট প্লেব্যাক সময়ের কত ভাগ আটকে থাকা অবস্থায় কাটল। সাধারণত `rebuffer_seconds / (play_seconds + rebuffer_seconds)`। এটাই সন্তুষ্টির সাথে সবচেয়ে দৃঢ়ভাবে সম্পর্কিত metric। দুটো আলাদা জিনিস আলাদা করে মাপুন — **কতবার** আটকাল (frequency) আর **কতক্ষণ** আটকাল (duration); দশটা আধা সেকেন্ডের stall আর একটা পাঁচ সেকেন্ডের stall একই অনুপাত দেয় কিন্তু সম্পূর্ণ আলাদা অভিজ্ঞতা।

**৩. Exit-before-video-start (EBVS)।** কত ভাগ দর্শক play চেপে ভিডিও শুরু হওয়ার আগেই চলে গেল। এটা সবচেয়ে অবহেলিত অথচ সবচেয়ে নির্মম metric — কারণ এই দর্শকরা আপনার বাকি সব metric-এ **অনুপস্থিত**। তারা কখনো প্লেব্যাকে ঢোকেনি, তাই তাদের rebuffer ratio নেই, bitrate নেই। EBVS আলাদাভাবে না মাপলে আপনার সব সংখ্যা বেঁচে যাওয়াদের নিয়ে — যা survivorship bias-এর নিখুঁত উদাহরণ।

**৪. Average bitrate delivered।** দর্শক আসলে কোন rung-এ দেখল, সময়-ভারিত গড়ে। ল্যাডারের উপরের rung থাকলেই দর্শক সেটা পাচ্ছে এমন নয়। এর সাথেই **upshift/downshift-এর হার** দেখুন — ঘনঘন সুইচ নিজেই বিরক্তিকর, আর সাধারণত ABR-এর অস্থিরতার লক্ষণ।

**৫. Play failure rate।** কত ভাগ চেষ্টা কখনো শুরুই হলো না — ভাঙা manifest, DRM ব্যর্থতা, ৪০৩ (মেয়াদোত্তীর্ণ টোকেন), CDN ৫xx, অসমর্থিত কোডেক। এটাকে **কারণ ধরে** ভাগ করা অপরিহার্য, কারণ প্রতিটা কারণের মালিক আলাদা দল।

সহায়ক কিন্তু গৌণ: seek latency, audio-video sync ত্রুটি, subtitle লোড ব্যর্থতা, আর সেশন-প্রতি গড় দেখার সময়।

<Callout type="info">

এই metric গুলোর মধ্যে সম্পর্ক আছে, আর সেটা মাথায় রাখা জরুরি। Startup time কমাতে চাইলে সবচেয়ে সহজ উপায় হলো নিচু rung থেকে শুরু করা — কিন্তু তাতে average bitrate নামে। Rebuffer কমাতে চাইলে সবচেয়ে সহজ উপায় বড় buffer — কিন্তু তাতে startup time বাড়ে আর live latency বাড়ে। **একটা QoE metric একা অপ্টিমাইজ করলে অন্যটা প্রায় সবসময় খারাপ হয়**, তাই সবসময় সেট হিসেবে দেখুন।

</Callout>

## প্লেয়ার instrument করা, আর স্কেলে জড়ো করা

তত্ত্ব সহজ, বাস্তবায়নে কয়েকটা জায়গায় মানুষ হোঁচট খায়।

**সেশনই মূল একক, ইভেন্ট নয়।** একটা প্লেব্যাক সেশনের একটা id থাকবে, আর সব ইভেন্ট সেই id বহন করবে। বিশ্লেষণের প্রায় প্রতিটা প্রশ্নই সেশন-স্তরের ("কত ভাগ সেশনে rebuffer হলো?"), তাই সংগ্রহের সময়ই সেশনে গোছানো থাকা দরকার।

**ইভেন্ট ব্যাচ করুন, ফায়ার-অ্যান্ড-ফরগেট নয়।** প্রতিটা ইভেন্টে একটা করে রিকোয়েস্ট পাঠানো মানে দর্শকের ব্যান্ডউইথ আর ব্যাটারি নষ্ট, আর আপনার collector-এ বিপুল চাপ। কয়েক সেকেন্ডের বাফারে জমিয়ে পাঠান।

**সেশনের শেষটা ধরার ব্যবস্থা রাখুন।** সবচেয়ে দামি ইভেন্টগুলো (দর্শক চলে যাওয়ার আগের মুহূর্ত) ঠিক তখনই ঘটে যখন পেজ বন্ধ হচ্ছে — সাধারণ AJAX রিকোয়েস্ট বাতিল হয়ে যায়। পেজ লুকানো/আনলোড হওয়ার সংকেতে সিঙ্ক্রোনাস beacon পাঠানোর ব্যবস্থা রাখুন, নাহলে আপনার EBVS আর abandonment ডেটা পদ্ধতিগতভাবে ভুল হবে।

**Cardinality-র হিসাব আগে করুন।** অধ্যায় ১৮-এর নিয়মটা এখানে হুবহু খাটে: label-এর সম্ভাব্য মান আগে থেকে গোনা না গেলে সেটা metric-এ যাবে না। ভিডিওতে বিপজ্জনক label গুলো হলো `content_id` (লাখো), `session_id` (কোটি), `device_model` (হাজারো)। নিরাপদ label: `cdn`, `country`, `rendition`, `player_version`, `device_class`, `error_code`। বিস্তারিত ডেটা raw event store-এ যাক, real-time metric-এ নয়।

**নমুনায়ন সতর্কভাবে।** সব সেশনের ১০০% raw event রাখা বিশাল খরচ। ব্যবহারিক নকশা: **সব সেশনের সারাংশ রাখুন** (প্রতি সেশনে একটা রেকর্ড — startup time, rebuffer সময়, ব্যবহৃত bitrate), আর **বিস্তারিত event-stream নমুনা হিসেবে রাখুন** (যেমন ১%) — প্লাস **সব ব্যর্থ সেশনের ১০০%**। ব্যর্থতাগুলোই ডিবাগ করতে হবে, তাই সেগুলো কখনো নমুনায় বাদ দেবেন না।

## QoE collector আর SLO aggregator

নিচের কোডটা দুটো অংশ। প্রথমটা **সেশন aggregator** — প্লেয়ার থেকে আসা কাঁচা ইভেন্ট নিয়ে প্রতি সেশনে একটা QoE সারাংশ তৈরি করে, ইভেন্টের ক্রম আর ফাঁক সামলে। দ্বিতীয়টা **SLO aggregator** — সেই সারাংশগুলো থেকে SLI বের করে, error budget-এর খরচ হিসাব করে, আর burn rate দেখে alert-এর মাত্রা ঠিক করে।

```typescript
// =========================================================================
// Part 1 -- Player telemetry model
// =========================================================================

type PlayerEventType =
	| 'play_intent' // user pressed play
	| 'manifest_loaded'
	| 'first_frame' // playback actually started
	| 'rebuffer_start'
	| 'rebuffer_end'
	| 'rendition_switch'
	| 'seek'
	| 'error'
	| 'ended'
	| 'abandoned'; // page closed or player destroyed

interface PlayerEvent {
	sessionId: string;
	type: PlayerEventType;
	/** Client wall clock, milliseconds. Never trusted for ordering alone. */
	timestampMs: number;
	/** Monotonic counter assigned by the player. Ordering comes from this. */
	sequence: number;
	contentId: string;
	cdn: string;
	country: string;
	deviceClass: 'mobile' | 'desktop' | 'tv' | 'other';
	playerVersion: string;
	/** Present on rendition_switch. */
	bitrateKbps?: number;
	/** Present on error. */
	errorCode?: string;
}

interface SessionSummary {
	sessionId: string;
	contentId: string;
	cdn: string;
	country: string;
	deviceClass: string;
	playerVersion: string;

	/** play_intent -> first_frame. Undefined when playback never started. */
	startupMs?: number;
	startedPlayback: boolean;
	/** Left before the first frame ever rendered. */
	exitedBeforeStart: boolean;
	/** Never started AND reported an error: a play failure, not an abandon. */
	playFailed: boolean;
	failureCode?: string;

	playSeconds: number;
	rebufferSeconds: number;
	rebufferCount: number;
	rebufferRatio: number;

	/** Time-weighted mean of the bitrate actually delivered. */
	averageBitrateKbps: number;
	switchCount: number;
}

// =========================================================================
// Part 2 -- Session aggregation
// =========================================================================

const MAX_PLAUSIBLE_GAP_MS = 30 * 60 * 1000;

/**
 * Fold a session's events into one summary row.
 *
 * Real telemetry is messy: events arrive out of order, clocks drift, and
 * sessions end without a terminal event because the tab was closed. The
 * aggregator must produce a usable row from all of that rather than throwing.
 */
function summariseSession(events: PlayerEvent[]): SessionSummary | null {
	if (events.length === 0) return null;

	// Order by the player's own counter. Wall clock is unreliable: devices
	// resync NTP mid-session and time can jump backwards.
	const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
	const first = ordered[0];

	const summary: SessionSummary = {
		sessionId: first.sessionId,
		contentId: first.contentId,
		cdn: first.cdn,
		country: first.country,
		deviceClass: first.deviceClass,
		playerVersion: first.playerVersion,
		startedPlayback: false,
		exitedBeforeStart: false,
		playFailed: false,
		playSeconds: 0,
		rebufferSeconds: 0,
		rebufferCount: 0,
		rebufferRatio: 0,
		averageBitrateKbps: 0,
		switchCount: 0
	};

	let intentAt: number | undefined;
	let firstFrameAt: number | undefined;
	let rebufferStartedAt: number | undefined;
	let lastPlayingSince: number | undefined;
	let currentBitrate = 0;
	let bitrateWeightedMs = 0;
	let sawError = false;

	const advancePlayTime = (until: number): void => {
		if (lastPlayingSince === undefined) return;
		const delta = until - lastPlayingSince;
		// Guard against clock jumps producing absurd durations.
		if (delta > 0 && delta < MAX_PLAUSIBLE_GAP_MS) {
			summary.playSeconds += delta / 1000;
			bitrateWeightedMs += currentBitrate * delta;
		}
		lastPlayingSince = undefined;
	};

	for (const event of ordered) {
		switch (event.type) {
			case 'play_intent':
				intentAt = event.timestampMs;
				break;

			case 'first_frame':
				firstFrameAt = event.timestampMs;
				summary.startedPlayback = true;
				lastPlayingSince = event.timestampMs;
				break;

			case 'rebuffer_start':
				advancePlayTime(event.timestampMs);
				rebufferStartedAt = event.timestampMs;
				summary.rebufferCount++;
				break;

			case 'rebuffer_end': {
				if (rebufferStartedAt !== undefined) {
					const delta = event.timestampMs - rebufferStartedAt;
					if (delta > 0 && delta < MAX_PLAUSIBLE_GAP_MS) {
						summary.rebufferSeconds += delta / 1000;
					}
					rebufferStartedAt = undefined;
				}
				lastPlayingSince = event.timestampMs;
				break;
			}

			case 'rendition_switch':
				advancePlayTime(event.timestampMs);
				if (currentBitrate !== 0) summary.switchCount++;
				currentBitrate = event.bitrateKbps ?? currentBitrate;
				lastPlayingSince = event.timestampMs;
				break;

			case 'seek':
				// A seek pauses playback briefly but is user-initiated, so it is
				// deliberately NOT counted as a rebuffer.
				advancePlayTime(event.timestampMs);
				lastPlayingSince = event.timestampMs;
				break;

			case 'error':
				sawError = true;
				summary.failureCode = event.errorCode ?? 'unknown';
				advancePlayTime(event.timestampMs);
				break;

			case 'ended':
			case 'abandoned':
				advancePlayTime(event.timestampMs);
				// An unterminated rebuffer at session end still counts: the viewer
				// left *while* buffering, which is the worst possible outcome.
				if (rebufferStartedAt !== undefined) {
					const delta = event.timestampMs - rebufferStartedAt;
					if (delta > 0 && delta < MAX_PLAUSIBLE_GAP_MS) {
						summary.rebufferSeconds += delta / 1000;
					}
					rebufferStartedAt = undefined;
				}
				break;
		}
	}

	// Close out sessions that ended without a terminal event.
	advancePlayTime(ordered[ordered.length - 1].timestampMs);

	if (intentAt !== undefined && firstFrameAt !== undefined) {
		summary.startupMs = Math.max(0, firstFrameAt - intentAt);
	}

	summary.exitedBeforeStart = !summary.startedPlayback && !sawError;
	summary.playFailed = !summary.startedPlayback && sawError;

	const denominator = summary.playSeconds + summary.rebufferSeconds;
	summary.rebufferRatio = denominator > 0 ? summary.rebufferSeconds / denominator : 0;
	summary.averageBitrateKbps =
		summary.playSeconds > 0 ? bitrateWeightedMs / (summary.playSeconds * 1000) : 0;

	return summary;
}

// =========================================================================
// Part 3 -- SLO evaluation
// =========================================================================

interface SloDefinition {
	name: string;
	/** Target as a fraction, e.g. 0.99 for "99% of sessions are good". */
	target: number;
	windowDays: number;
	/** Returns null when the session is not eligible to be judged. */
	evaluate: (session: SessionSummary) => boolean | null;
}

const SLOS: SloDefinition[] = [
	{
		name: 'playback_start_success',
		target: 0.995,
		windowDays: 28,
		// Abandonment is a product signal, not a reliability failure, so an
		// exited-before-start session is excluded rather than counted bad.
		evaluate: (s) => (s.exitedBeforeStart ? null : !s.playFailed)
	},
	{
		name: 'startup_under_2s',
		target: 0.95,
		windowDays: 28,
		evaluate: (s) => (s.startupMs === undefined ? null : s.startupMs <= 2000)
	},
	{
		name: 'rebuffer_ratio_under_0_5pct',
		target: 0.99,
		windowDays: 28,
		// Sessions shorter than 10s are excluded: a single stall dominates the
		// ratio and produces noise that swamps the signal.
		evaluate: (s) => (s.playSeconds < 10 ? null : s.rebufferRatio < 0.005)
	}
];

interface SloResult {
	name: string;
	target: number;
	eligible: number;
	good: number;
	sli: number;
	/** Fraction of the error budget consumed, 0..1+ */
	budgetConsumed: number;
	/** Consumption rate relative to a steady burn over the window. */
	burnRate: number;
	alert: 'none' | 'ticket' | 'page';
}

/**
 * Multi-window burn rate, as used by Google SRE practice.
 *
 * Alerting on "SLI below target right now" is far too noisy. Alerting on the
 * *rate* at which the budget is being spent separates a brief blip from an
 * outage that will exhaust the month's budget by tomorrow.
 */
function evaluateSlo(
	definition: SloDefinition,
	sessions: SessionSummary[],
	windowFraction: number
): SloResult {
	let eligible = 0;
	let good = 0;

	for (const session of sessions) {
		const verdict = definition.evaluate(session);
		if (verdict === null) continue;
		eligible++;
		if (verdict) good++;
	}

	const sli = eligible > 0 ? good / eligible : 1;
	const allowedBadFraction = 1 - definition.target;
	const actualBadFraction = 1 - sli;
	const budgetConsumed = allowedBadFraction > 0 ? actualBadFraction / allowedBadFraction : 0;

	// windowFraction is how much of the SLO window this sample covers.
	// Spending 1% of the budget in 1% of the window is a burn rate of 1.
	const burnRate = windowFraction > 0 ? budgetConsumed / windowFraction : 0;

	let alert: SloResult['alert'] = 'none';
	if (burnRate >= 14.4)
		alert = 'page'; // budget gone in ~2 days
	else if (burnRate >= 3) alert = 'ticket'; // budget gone in ~10 days

	return {
		name: definition.name,
		target: definition.target,
		eligible,
		good,
		sli,
		budgetConsumed,
		burnRate,
		alert
	};
}

// =========================================================================
// Part 4 -- A/B comparison with a guardrail
// =========================================================================

interface VariantStats {
	variant: string;
	sessions: number;
	meanRebufferRatio: number;
	meanStartupMs: number;
	meanBitrateKbps: number;
	playFailureRate: number;
}

function summariseVariant(variant: string, sessions: SessionSummary[]): VariantStats {
	const started = sessions.filter((s) => s.startedPlayback);
	const mean = (values: number[]): number =>
		values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

	return {
		variant,
		sessions: sessions.length,
		meanRebufferRatio: mean(started.map((s) => s.rebufferRatio)),
		meanStartupMs: mean(started.map((s) => s.startupMs ?? 0).filter((value) => value > 0)),
		meanBitrateKbps: mean(started.map((s) => s.averageBitrateKbps)),
		playFailureRate:
			sessions.length === 0 ? 0 : sessions.filter((s) => s.playFailed).length / sessions.length
	};
}

/**
 * Two-proportion z-test on the play failure rate.
 *
 * This is the guardrail, not the goal. An encoding change is shipped for
 * bitrate savings, but it must be *proved* not to have broken playback on
 * some device family -- and that shows up as failures, not as bitrate.
 */
function failureRateRegressed(control: VariantStats, treatment: VariantStats): boolean {
	if (control.sessions < 1000 || treatment.sessions < 1000) return false;

	const pooled =
		(control.playFailureRate * control.sessions + treatment.playFailureRate * treatment.sessions) /
		(control.sessions + treatment.sessions);

	const standardError = Math.sqrt(
		pooled * (1 - pooled) * (1 / control.sessions + 1 / treatment.sessions)
	);
	if (standardError === 0) return false;

	const z = (treatment.playFailureRate - control.playFailureRate) / standardError;
	return z > 2.58; // one-sided, ~99% confidence that treatment is worse
}

// --- Demo ---------------------------------------------------------------

function demo(): void {
	const base = {
		contentId: 'ibn-sina-lecture-04',
		cdn: 'cordoba-cdn',
		country: 'BD',
		deviceClass: 'mobile' as const,
		playerVersion: '4.2.0'
	};

	const events: PlayerEvent[] = [
		{ sessionId: 's-1', type: 'play_intent', timestampMs: 1000, sequence: 1, ...base },
		{ sessionId: 's-1', type: 'manifest_loaded', timestampMs: 1180, sequence: 2, ...base },
		{
			sessionId: 's-1',
			type: 'rendition_switch',
			timestampMs: 1600,
			sequence: 3,
			bitrateKbps: 1600,
			...base
		},
		{ sessionId: 's-1', type: 'first_frame', timestampMs: 1640, sequence: 4, ...base },
		{ sessionId: 's-1', type: 'rebuffer_start', timestampMs: 21640, sequence: 5, ...base },
		{ sessionId: 's-1', type: 'rebuffer_end', timestampMs: 23140, sequence: 6, ...base },
		{
			sessionId: 's-1',
			type: 'rendition_switch',
			timestampMs: 23140,
			sequence: 7,
			bitrateKbps: 800,
			...base
		},
		{ sessionId: 's-1', type: 'ended', timestampMs: 143140, sequence: 8, ...base }
	];

	const summary = summariseSession(events);
	if (!summary) return;

	console.log(
		`session=${summary.sessionId} startup=${summary.startupMs}ms ` +
			`play=${summary.playSeconds.toFixed(1)}s ` +
			`rebuffer=${(summary.rebufferRatio * 100).toFixed(3)}% ` +
			`avg_bitrate=${summary.averageBitrateKbps.toFixed(0)}kbps ` +
			`switches=${summary.switchCount}`
	);

	// One day of a 28-day window.
	for (const definition of SLOS) {
		const result = evaluateSlo(definition, [summary], 1 / definition.windowDays);
		console.log(
			`slo=${result.name} sli=${(result.sli * 100).toFixed(3)}% ` +
				`budget=${(result.budgetConsumed * 100).toFixed(1)}% ` +
				`burn=${result.burnRate.toFixed(2)} alert=${result.alert}`
		);
	}
}

demo();
```

## একটা ভিডিও সার্ভিসের SLO

অধ্যায় ১৮-এর কাঠামোটা এখানে সরাসরি খাটে, শুধু SLI-গুলো ভিডিও-নির্দিষ্ট। একটা ভালো ভিডিও SLO-র তিনটা বৈশিষ্ট্য: এটা **দর্শকের অভিজ্ঞতা** মাপে (সার্ভারের স্বাস্থ্য নয়), এটার **eligibility নিয়ম স্পষ্ট**, আর এটার সাথে একটা **error budget** যুক্ত যার খরচ দেখে সিদ্ধান্ত নেওয়া হয়।

একটা ব্যবহারিক সেট:

| SLO                    | SLI-র সংজ্ঞা                                | লক্ষ্য | কেন এই নিয়ম                                 |
| ---------------------- | ------------------------------------------- | ------ | -------------------------------------------- |
| Playback start success | play intent-এর মধ্যে যতগুলো first frame পেল | ৯৯.৫%  | ব্যবহারকারীর নিজের ছেড়ে যাওয়া বাদ দিতে হবে |
| Startup latency        | যত সেশনে startup ≤ ২ সেকেন্ড                | ৯৫%    | গড় নয়, থ্রেশহোল্ড — লেজটাই দর্শক হারায়    |
| Rebuffer               | যত সেশনে rebuffer ratio &lt; ০.৫%           | ৯৯%    | ১০ সেকেন্ডের কম সেশন বাদ, নাহলে শব্দ প্রবল   |
| Delivered bitrate      | যত সেশনে গড় bitrate প্রাপ্য rung-এর ≥ ৮০%  | ৯০%    | ladder থাকা আর ladder পাওয়া এক জিনিস নয়    |
| Live latency (লাইভে)   | যত সেশনে glass-to-glass ≤ ঘোষিত লক্ষ্য      | ৯৫%    | প্রতিশ্রুতি দিলে সেটা মাপতে হবে              |

কয়েকটা নিয়ম যা এগুলোকে কাজের করে তোলে:

**Eligibility আগে লিখুন, ফল দেখার পরে নয়।** কোন সেশন গোনা হবে না — খুব ছোট সেশন, বট, প্রি-রিলিজ প্লেয়ার সংস্করণ — এটা আগে থেকে ঠিক করে রাখা না থাকলে খারাপ সপ্তাহে সবাই "ওই সেশনগুলো তো গোনা উচিত নয়" বলে তর্ক শুরু করবে।

**Burn rate-এ alert করুন, তাৎক্ষণিক SLI-তে নয়।** ভিডিওতে ট্রাফিক দিনরাত ভীষণ ওঠানামা করে; সন্ধ্যায় p95 startup সবসময় খারাপ। তাৎক্ষণিক থ্রেশহোল্ডে alert দিলে প্রতি সন্ধ্যায় ঘণ্টা বাজবে আর কেউ শুনবে না। বাজেট কত দ্রুত খরচ হচ্ছে — সেই হারটাই সংকেত।

**সবসময় dimension ধরে ভাঙুন।** সামগ্রিক SLI প্রায় সবসময় সবুজ থাকে যখন একটা নির্দিষ্ট CDN, একটা দেশ, বা একটা TV প্ল্যাটফর্ম পুড়ছে। ন্যূনতম ভাগগুলো: CDN, দেশ, device class, player version, আর live বনাম VOD। **Player version-টা বিশেষভাবে গুরুত্বপূর্ণ** — বেশিরভাগ QoE regression আসলে একটা প্লেয়ার রিলিজ থেকে আসে।

**Error budget দিয়ে সিদ্ধান্ত নিন।** বাজেট প্রায় শেষ মানে নতুন ABR টিউনিং বা নতুন কোডেক রোলআউট থামানো, আর স্থিতিশীলতায় মন দেওয়া। মাস শেষে বাজেটের অর্ধেকও খরচ না হলে বুঝতে হবে আপনি অতিরিক্ত রক্ষণশীল — বিটরেট কমিয়ে খরচ বাঁচানোর সুযোগ আছে। **এটাই এনকোডিং দক্ষতা আর রিলায়েবিলিটির মধ্যে দর কষাকষির আনুষ্ঠানিক ভাষা।**

<Callout type="warning">

একটা metric-কে কখনো একা SLO বানাবেন না। "গড় bitrate বাড়াও" নিলে ABR আগ্রাসী হবে আর rebuffer বাড়বে। "rebuffer কমাও" নিলে ABR ভীতু হবে আর সবাই ৪৮০p দেখবে। **অন্তত একটা প্রতিযোগী metric guardrail হিসেবে রাখুন**, নাহলে যে কোনো অপ্টিমাইজেশন অন্য দিক দিয়ে ক্ষতি করে ফিরবে।

</Callout>

## এনকোডিং পরিবর্তন নিরাপদে A/B করা

ধরুন আপনি ladder বদলাতে চান — নতুন per-title মডেল যা গড়ে ১৮% কম বিটরেট ব্যবহার করে, VMAF প্রায় অপরিবর্তিত রেখে। অফলাইন সংখ্যা চমৎকার। এখন প্রশ্ন: বাস্তব দর্শকের উপর ছাড়ার আগে কীভাবে নিশ্চিত হবেন?

**ধাপ ১ — অফলাইনে সিদ্ধান্তের প্রমাণ।** একটা প্রতিনিধিত্বমূলক কনটেন্ট সেটে (অন্তত কয়েকশো শিরোনাম, সব ধরনের — অ্যানিমেশন, খেলা, কথা-বলা মাথা, grain-ভরা ফিল্ম) BD-rate হিসাব করুন। কেবল গড় নয়, **সবচেয়ে খারাপ ১০% শিরোনামে** কী হচ্ছে দেখুন। এখানেই ধরা পড়ে যে অ্যানিমেশনে দারুণ কাজ করা মডেল ক্রীড়া কনটেন্টে ভেঙে পড়ে।

**ধাপ ২ — ছোট পরিসরে বাস্তব দর্শক।** ১-৫% ট্রাফিকে চালান, **সেশন-স্টিকি ভাবে** (একই দর্শক একই ভ্যারিয়েন্টে থাকবে, নাহলে সে মাঝপথে ladder বদলাতে দেখবে) আর **এলোমেলোভাবে বণ্টিত** (কোনো একটা অঞ্চল বা device-এ নয়, নাহলে তুলনাটাই ভুল)।

**ধাপ ৩ — সঠিক metric দেখুন, সঠিক ক্রমে।** এখানেই বেশিরভাগ দল ভুল করে। প্রাথমিক metric হলো খরচ (গড় ডেলিভার করা বিটরেট), কিন্তু **guardrail metric গুলোই সিদ্ধান্ত নেয়**:

- Play failure rate — নতুন কোডেক প্রোফাইল কি কোনো পুরনো ডিভাইসে ডিকোড হচ্ছে না?
- Rebuffer ratio — কম বিটরেট মানে কম rebuffer হওয়ার কথা; না হলে কিছু একটা ভুল
- Startup time — নতুন ladder-এর নিচের rung কি যথেষ্ট নিচু?
- Average delivered bitrate — যদি এটা প্রত্যাশার চেয়ে অনেক কমে যায়, ABR হয়তো ভুল rung বেছে নিচ্ছে
- **দেখার সময় (watch time)** — সবচেয়ে ধীর কিন্তু সবচেয়ে সত্য সংকেত

**ধাপ ৪ — যথেষ্ট সময় দিন।** ভিডিও metric-এ সাপ্তাহিক চক্র প্রবল (সপ্তাহান্তে TV-তে দেখা বাড়ে, সপ্তাহে মোবাইলে)। **অন্তত এক পূর্ণ সপ্তাহ** না চললে আপনি আসলে দিনের পার্থক্য মাপছেন। আর ছোট প্রভাব ধরতে বড় নমুনা লাগে — ০.১% play failure-এর পার্থক্য ধরতে ভ্যারিয়েন্টপ্রতি লাখো সেশন দরকার।

**ধাপ ৫ — ধাপে ধাপে বাড়ান, আর ফেরার পথ রাখুন।** ৫% → ২৫% → ৫০% → ১০০%, প্রতি ধাপে অন্তত কয়েকদিন। রোলব্যাক যেন **কনফিগারেশন বদলে** সম্ভব হয়, নতুন করে এনকোড করে নয় — মানে পুরনো ladder-এর রেন্ডিশনগুলো সম্পূর্ণ রোলআউটের পরেও কিছুদিন রেখে দিন।

<Callout type="tip">

এনকোডিং A/B-তে একটা সূক্ষ্ম ফাঁদ আছে: **নতুন এনকোড শুরুতে CDN-এ cold থাকে**। ট্রিটমেন্ট ভ্যারিয়েন্টের startup time প্রথম কয়েকদিন খারাপ দেখাবে, কারণ ওই বাইটগুলো এখনো কোনো edge-এ নেই — এনকোডিংয়ের কোনো দোষ নয়। হয় পরীক্ষার আগে cache warm করুন, নয়তো প্রথম কয়েকদিনের ডেটা বাদ দিন — কিন্তু সিদ্ধান্তটা **আগে থেকে** লিখে রাখুন।

</Callout>

## পুরো ট্র্যাক এক সুতোয়

দশটা অধ্যায় আসলে একটা করে প্রশ্নের উত্তর, আর প্রশ্নগুলো একটা থেকে আরেকটায় গড়িয়ে গেছে। পেছনে ফিরে দেখলে শৃঙ্খলটা এরকম:

| অধ্যায় | প্রশ্ন                                           | মূল উত্তর                                                                  |
| ------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| ১       | ভিডিও জিনিসটা আসলে কী?                           | ঘড়ি লাগানো স্থিরচিত্রের স্তূপ — আর কাঁচা অবস্থায় সেটা অসম্ভব বড়         |
| ২       | এত বড় জিনিস ছোট হয় কীভাবে?                     | কোডেক — সময় ও স্থানের পুনরাবৃত্তি বাদ, আর চোখ যা ক্ষমা করে তা ফেলে দেওয়া |
| ৩       | ভিডিও, অডিও আর সময় একসাথে থাকে কীভাবে?          | কন্টেইনার; আর remux মানে মোড়ক বদলানো, ভেতরটা নয়                          |
| ৪       | এক ফাইল থেকে অনেক রূপ বানানো হয় কীভাবে?         | ট্রান্সকোডিং পাইপলাইন — decode, filter, encode, package                    |
| ৫       | কোন কোন রূপ বানাব, কত বিটরেটে?                   | Bitrate ladder — আর সেটা কনটেন্ট অনুযায়ী, ঐতিহ্য অনুযায়ী নয়             |
| ৬       | দর্শকের কাছে পাঠানোর জন্য গোছাই কীভাবে?          | সেগমেন্ট ও manifest — HLS/DASH, CMAF                                       |
| ৭       | প্লেয়ার কোনটা কখন নেবে সিদ্ধান্ত নেয় কীভাবে?   | ABR — buffer আর থ্রুপুট দেখে rung বাছা                                     |
| ৮       | কোটি দর্শকের কাছে বাইট পৌঁছাবে কীভাবে, কত খরচে?  | CDN, cache key, shield, multi-CDN — আর egress-ই আসল বিল                    |
| ৯       | এখনই ঘটছে এমন জিনিস কীভাবে দেখাব?                | Live pipeline — আর latency-র বেশিরভাগটাই বাফারে, নেটওয়ার্কে নয়           |
| ১০      | যা পাঠালাম সেটা আসলেই ভালো ছিল কিনা জানব কীভাবে? | VMAF বলে এনকোড কেমন, QoE বলে দর্শক কী পেল — SLO দিয়ে বাঁধুন               |

আর পুরো ট্র্যাকের সবচেয়ে ঘন সারাংশটা তিনটা বাক্যে:

**এক, ভিডিও ইঞ্জিনিয়ারিং মূলত একটা বাজেটের খেলা** — বিট, মিলিসেকেন্ড আর টাকার। প্রতিটা সিদ্ধান্ত (কোডেক, ladder, সেগমেন্টের দৈর্ঘ্য, buffer-এর আকার, CDN কনফিগারেশন) এই তিনটার মধ্যে একটা অদলবদল, আর কোনো বিনামূল্যের সমাধান নেই।

**দুই, প্রতিটা স্তর পরের স্তরের সীমা ঠিক করে দেয়।** ভুল keyframe ব্যবধানে এনকোড করলে সেগমেন্টিং ভাঙবে; ভুল ladder বানালে ABR-এর কিছু করার থাকবে না; ভুল cache key দিলে CDN-এর কিছু করার থাকবে না। তাই বাগগুলো প্রায় সবসময় **উপরের স্তরে দেখা যায় আর নিচের স্তরে জন্মায়**।

**তিন, একমাত্র যে সংখ্যা মিথ্যা বলে না সেটা দর্শকের কাছ থেকে আসে।** VMAF, বিটরেট, hit ratio, encode speed — সবগুলোই দরকারি proxy। কিন্তু "দর্শক কি দেখতে পেল, কত দ্রুত, আর কতবার আটকে?" — এই প্রশ্নের উত্তরই শেষ কথা, আর বাকি সব metric-এর অস্তিত্ব কেবল এই উত্তরটা ভালো করার জন্য।

<div class="takeaways">

### মূল শেখা

- "কোয়ালিটি" আসলে দুটো আলাদা প্রশ্ন — এনকোড কতটা ভালো (offline, VMAF) আর দর্শক কী পেল (online, QoE); দ্বিতীয়টাই শেষ কথা
- PSNR পিক্সেল গোনে, মানুষ কী দেখে জানে না; SSIM গঠন দেখে কিন্তু blur-এ নমনীয় আর সময়ের মাত্রা নেই
- VMAF মানুষের রায়ের উপর প্রশিক্ষিত মডেল — মডেল আর দেখার অবস্থার সাথে মিলিয়ে ব্যবহার করতে হয়, আর গড়ের চেয়ে নিচের পার্সেন্টাইল বেশি কাজের
- VMAF per-title encoding আর convex-hull ladder সম্ভব করেছে — "যথেষ্ট ভালো"-কে সংখ্যায় প্রকাশ করা গেছে বলেই
- পাঁচটা QoE metric মূলত সব বলে: startup time, rebuffer ratio, exit-before-video-start, average delivered bitrate, play failure rate
- EBVS আলাদা করে মাপুন — নাহলে আপনার সব সংখ্যা কেবল যারা টিকে গেছে তাদের নিয়ে, যা নিখুঁত survivorship bias
- Instrumentation-এ সেশনই একক; ইভেন্ট ব্যাচ করুন, সেশনের শেষটা ধরার ব্যবস্থা রাখুন, আর cardinality হিসাব করে label বাছুন
- SLI-তে eligibility নিয়ম আগে লিখুন, burn rate-এ alert করুন, আর CDN/দেশ/device/player version ধরে ভেঙে দেখুন
- একটা QoE metric একা অপ্টিমাইজ করলে অন্যটা খারাপ হয় — সবসময় guardrail সহ চলুন
- এনকোডিং পরিবর্তন A/B করুন সেশন-স্টিকি ও এলোমেলো বণ্টনে, অন্তত এক পূর্ণ সপ্তাহ, আর guardrail metric দিয়ে সিদ্ধান্ত নিন — প্রাথমিক metric দিয়ে নয়

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Netflix** VMAF তৈরি ও ওপেন-সোর্স করেছে, আর সেটার উপর দাঁড়িয়েই per-title ও per-shot এনকোডিং চালু করেছে — যা তাদের গড় ডেলিভারি বিটরেট বড় ব্যবধানে কমিয়েছে
- **YouTube** জনপ্রিয়তার ভিত্তিতে সিদ্ধান্ত নেয় কোন ভিডিও দামি কোডেকে (AV1) পুনরায় এনকোড হবে, কারণ এনকোডিং খরচ একবার আর ডেলিভারি খরচ কোটি বার
- **বড় OTT প্ল্যাটফর্মগুলো** startup time, rebuffer ratio আর play failure-এর উপর SLO রাখে এবং error budget দিয়ে রিলিজের গতি নিয়ন্ত্রণ করে
- **Conviva, Mux, Bitmovin**-এর মতো টুলগুলোর পুরো ব্যবসাই এই QoE সংগ্রহ ও aggregation স্তরটা — কারণ নিজে বানানো সম্ভব হলেও এটা রক্ষণাবেক্ষণ-ভারী
- **যেকোনো দল যারা কোডেক বদলাচ্ছে** (H.264 থেকে HEVC বা AV1) ধাপে ধাপে A/B করে ছাড়ে, আর প্রাথমিক guardrail থাকে play failure rate — কারণ ডিকোডার সমর্থনের ফাঁকই সেখানে সবচেয়ে বড় ঝুঁকি

</div>
