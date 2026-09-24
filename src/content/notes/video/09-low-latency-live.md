---
title: 'Low-Latency লাইভ'
subtitle: 'RTMP ও SRT ingest, ডেডলাইনের নিচে real-time transcoding, latency budget ভেঙে দেখা, LL-HLS ও LL-DASH, WebRTC-র দাম, আর মাঝপথে encoder পড়ে গেলে কী হয়।'
chapter: 9
level: 'advanced'
readingTime: '২৮ মিনিট'
topics:
  [
    'live streaming',
    'RTMP',
    'SRT',
    'LL-HLS',
    'LL-DASH',
    'WebRTC',
    'latency budget',
    'partial segments',
    'failover'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

বাজারের নিলামদার চিৎকার করে দাম বলছে, আর দূরের মহল্লায় সেই দাম পৌঁছাচ্ছে দৌড়ানো লোকের হাতে। লোকটা যদি অপেক্ষা করে দশটা দাম জমিয়ে একসাথে নিয়ে যায় — খবর নিরাপদে পৌঁছায়, কিন্তু দেরিতে। একেকটা দাম আলাদা করে নিয়ে ছুটলে খবর দ্রুত যায়, কিন্তু কেউ একজন হোঁচট খেলেই ফাঁক পড়ে।

</Callout>

## গল্পে বুঝি

বাগদাদের বড় বাজারে ঘোড়ার নিলাম বসেছে। নিলামদার খোয়ারিজমি উঁচু চৌকিতে দাঁড়িয়ে চিৎকার করে দাম হাঁকছেন — "দুইশো! দুইশো দশ! দুইশো বিশ!" — প্রায় প্রতি সেকেন্ডে একটা করে। সমস্যা হলো, শহরের আরও চারটা মহল্লার লোকজনও এই নিলামে অংশ নিতে চায়, কিন্তু তারা বাজারে আসতে পারেনি। তাদের নিজেদের উঠানে একজন করে ঘোষক দাঁড়িয়ে আছেন, আর তাদের কাজ হলো বাজারের দাম হুবহু সেখানে বলা।

প্রথম ব্যবস্থাটা ছিল সহজ। বাজারে একজন লেখক বসে, প্রতি দশ সেকেন্ডে যা যা দাম উঠল সব একটা কাগজে লিখে ফেলে; কাগজ ভরলে সেটা একজন দৌড়বাজের হাতে দেয়; দৌড়বাজ উঠানে গিয়ে ঘোষককে দেয়; ঘোষক পড়ে শোনায়। ব্যবস্থাটা মজবুত — কাগজ হারালে আরেকটা কপি আছে, দৌড়বাজ দেরি করলেও ঘোষক আগের কাগজ পড়তে থাকে। কিন্তু হিসাব করে দেখা গেল উঠানের লোকজন দাম শুনছে প্রায় **আধা মিনিট পরে**। কেন? লেখকের কাগজ ভরতে দশ সেকেন্ড, দৌড়ে যেতে তিন সেকেন্ড, আর ঘোষক নিজে সাবধান বলে হাতে অন্তত দুটো কাগজ জমিয়ে তবেই পড়া শুরু করেন — মানে আরও বিশ সেকেন্ড। **দেরিটা দৌড়ের নয়, দেরিটা অপেক্ষার।** এখানেই আসল শিক্ষা: latency-র বেশিরভাগ অংশ নেটওয়ার্কে যায় না, যায় **বাফারে**।

খোয়ারিজমি তিনটা জিনিস বদলালেন। এক, কাগজ ছোট করলেন — দশ সেকেন্ডের বদলে দুই সেকেন্ড। দুই, লেখককে বললেন কাগজ পুরো ভরার অপেক্ষা না করে **প্রতি আধা সেকেন্ডে যা লেখা হয়েছে সেটুকুই** দৌড়বাজের হাতে ধরিয়ে দিতে, টুকরো টুকরো করে। তিন, ঘোষককে বললেন দুই কাগজ নয়, একটার একটুখানি হাতে এলেই পড়া শুরু করতে। এই তিনটার পরে দেরি নেমে এলো **তিন সেকেন্ডে**। টুকরো করে পাঠানো এই ব্যবস্থাটাই **partial segment**, আর ঘোষকের হাতে কম জমানোই **ছোট player buffer**।

কিন্তু একটা নতুন সমস্যা দেখা দিল। আগে দৌড়বাজ উঠানে গিয়ে জিজ্ঞেস করত "নতুন কাগজ আছে?" — না থাকলে ফিরে আসত, একটু পরে আবার যেত। এখন কাগজ এত ঘনঘন আসে যে এই যাওয়া-আসাতেই সময় নষ্ট। তাই নিয়ম হলো: **ঘোষক গিয়ে দাঁড়িয়ে থাকবে যতক্ষণ না পরের টুকরোটা তৈরি হয়** — জিজ্ঞেস করে ফিরে আসবে না, হাতে জিনিস নিয়েই ফিরবে। এটাই **blocking playlist reload**। আর লেখক কাগজের নিচে একটা লাইন লিখে রাখলেন — "পরের টুকরোটা এই নামে আসবে" — যাতে ঘোষক আগেভাগেই সেটা চাইতে পারে। ওই লাইনটাই **preload hint**।

কিছু ক্ষেত্রে এতেও চলল না। কাছেই এক ধনী ব্যবসায়ীর বাড়ি, যিনি চান নিলামে সরাসরি দর হাঁকতে — মানে তার দর বাজারে পৌঁছাতে হবে **এক সেকেন্ডেরও কম** সময়ে, নাহলে দর দেওয়ার কোনো মানে নেই। তার জন্য খোয়ারিজমি আলাদা ব্যবস্থা করলেন: বাড়ি থেকে বাজার পর্যন্ত সারিবদ্ধ লোক দাঁড় করিয়ে, প্রত্যেকে পরেরজনের কানে সরাসরি চেঁচিয়ে বলে। ভয়ানক দ্রুত। কিন্তু এই সারি ব্যয়বহুল, কেবল একটা বাড়ির জন্য কাজ করে, আর কেউ একজন একটা শব্দ শুনতে না পেলে সেটা আর ফেরত পাওয়া যায় না — সে **পরের শব্দে চলে যায়**, ফাঁকটা রয়ে যায়। এটাই **WebRTC**: সাব-সেকেন্ড, কিন্তু স্কেল ও নির্ভরযোগ্যতার বিনিময়ে।

আর একদিন ঠিক নিলামের মাঝখানে প্রধান দৌড়বাজ পড়ে গিয়ে পা মচকালো। কাগজের ধারা থেমে গেল। ঘোষকের হাতে যে একটুখানি জমা ছিল, সেটুকু পড়ে শেষ করে তিনি চুপ করে দাঁড়িয়ে রইলেন — উঠানের লোকজন ভাবল নিলাম বন্ধ হয়ে গেছে। খোয়ারিজমি এরপর থেকে **দুইজন দৌড়বাজ** রাখতে শুরু করলেন, একই পথে, একই কাগজ; একজন পড়ে গেলে অন্যজনের কাগজ চলতেই থাকে। আর ঘোষককে বললেন — ধারা থামলে চুপ না থেকে যেন বলে "এক মুহূর্ত, খবর আসছে"। প্রথমটা **redundant ingest**, দ্বিতীয়টা **slate** বা fallback।

মিলিয়ে নিই: নিলামদারের চিৎকার হলো **live source**, লেখকের কাগজ **segment**, কাগজের দৈর্ঘ্য **segment duration**, আধা সেকেন্ডের টুকরো **partial segment / CMAF chunk**, দৌড়বাজ **ingest ও ডেলিভারি পথ**, ঘোষকের হাতে জমানো কাগজ **player buffer**, ঘোষকের দাঁড়িয়ে অপেক্ষা **blocking playlist reload**, কাগজের নিচের লাইন **preload hint**, চেঁচানো সারি **WebRTC**, ঘোষকের চুপ হয়ে যাওয়া **rebuffer**, দুইজন দৌড়বাজ **redundant ingest**, আর "খবর আসছে" বলা **fallback slate**। পুরো অধ্যায়টা এই মানচিত্রের প্রকৌশল — বিশেষত এই সত্যটার: **দেরির সিংহভাগ কেউ কোথাও অপেক্ষা করছে বলেই, দূরত্বের কারণে নয়।**

## Live pipeline: শুরু থেকে শেষ

VOD-তে সময়ের চাপ নেই — একটা ফাইল আসে, যত ইচ্ছা সময় নিয়ে এনকোড হয়, তারপর দর্শক দেখে। লাইভে **প্রতিটা ধাপে একটা ডেডলাইন**: এক সেকেন্ডের কনটেন্ট এক সেকেন্ডের কম সময়ে প্রসেস হতেই হবে, নাহলে পিছিয়ে পড়া জমতে থাকবে এবং কখনো ধরা যাবে না।

<Mermaid
title="লাইভ পাইপলাইনের ধাপগুলো"
code={`graph LR
  C["Camera /<br/>OBS encoder"] --> I["Ingest<br/>RTMP / SRT"]
  I --> T["Transcode<br/>ladder, realtime"]
  T --> P["Packager<br/>CMAF chunks"]
  P --> O["Origin"]
  O --> D["CDN"]
  D --> V["Player<br/>buffer"]`}
/>

প্রতিটা তীরের নিচে একটা করে সংখ্যা বসে — কত মিলিসেকেন্ড। সেই সংখ্যাগুলোর যোগফলই **glass-to-glass latency**: ক্যামেরার লেন্সে আলো পড়া থেকে দর্শকের পর্দায় সেই ছবি দেখা পর্যন্ত সময়। বাকি অধ্যায়ের লক্ষ্য এই যোগফল ছোট করা, আর প্রতিটা সংখ্যার পেছনে কী আছে সেটা জানা।

## Ingest: RTMP, SRT আর তাদের পার্থক্য

Ingest হলো এনকোডার থেকে আপনার প্ল্যাটফর্মে স্ট্রিম আসার পথ। এটা প্রায়ই সবচেয়ে অবহেলিত অংশ, অথচ লাইভে ব্যর্থতার সবচেয়ে বড় উৎস — কারণ এই একটামাত্র জায়গা যেখানে আপনার নিয়ন্ত্রণ নেই: অন্য প্রান্তে কারও বাড়ির ইন্টারনেট।

**RTMP** ১৯৯০-এর দশকের Flash-এর প্রোটোকল, আর আশ্চর্যজনকভাবে এখনো ইন্ডাস্ট্রি স্ট্যান্ডার্ড — কারণ OBS থেকে ক্যামেরা পর্যন্ত সবকিছু এটাকে বলতে পারে। TCP-র উপর চলে, তাই প্যাকেট হারালে পুনঃপ্রেরণ হয় আর ডেটা নিখুঁত থাকে। সমস্যা হলো TCP-র congestion control লাইভের জন্য বানানো নয়: নেটওয়ার্ক খারাপ হলে TCP পাঠানো ধীর করে দেয়, ডেটা বাফারে জমতে থাকে, আর ল্যাগ **জমা হতেই থাকে** — একে বলে buffer-bloat। আরেকটা বড় সীমাবদ্ধতা: RTMP-তে H.264 আর AAC-র বাইরে কিছু পাঠানো ব্যবহারিকভাবে কঠিন, মানে HEVC বা AV1 ingest করা যায় না (Enhanced RTMP এটা বদলানোর চেষ্টা করছে)।

**SRT** (Secure Reliable Transport) UDP-র উপর, আর এটাই RTMP-র দুর্বলতাগুলোর সরাসরি জবাব। এটা নিজেই পুনঃপ্রেরণ সামলায় (ARQ), কিন্তু একটা নির্দিষ্ট **latency window**-র মধ্যে: আপনি বলে দেন "সর্বোচ্চ ৪০০ ms দেরি সহ্য করব", আর SRT সেই সময়ের মধ্যে যতটুকু হারানো প্যাকেট উদ্ধার করা যায় করে, বাকিটা ছেড়ে দেয়। ফলে ল্যাগ **সীমাবদ্ধ থাকে, জমে না** — যা লাইভে TCP-র চেয়ে মৌলিকভাবে ভালো আচরণ। উপরন্তু এটা এনক্রিপ্টেড, আর যেকোনো কোডেক বহন করতে পারে।

**RIST** আর **Zixi** একই সমস্যার আরও দুটো সমাধান — RIST একটা খোলা মান, Zixi মালিকানাধীন; দুটোই সম্প্রচার শিল্পে প্রচলিত।

| দিক               | RTMP               | SRT                            | WebRTC ingest (WHIP)    |
| ----------------- | ------------------ | ------------------------------ | ----------------------- |
| ট্রান্সপোর্ট      | TCP                | UDP + ARQ                      | UDP + RTP               |
| খারাপ নেটওয়ার্কে | ল্যাগ জমে          | ল্যাগ সীমাবদ্ধ, মান কমে        | ফ্রেম ড্রপ হয়          |
| কোডেক             | কার্যত H.264 + AAC | যেকোনো                         | H.264 / VP8 / VP9 / AV1 |
| এনক্রিপশন         | নেই (RTMPS আলাদা)  | অন্তর্নির্মিত                  | অন্তর্নির্মিত           |
| সাধারণ latency    | ২-৫ সেকেন্ড        | ০.৩-১ সেকেন্ড (সেটিং অনুযায়ী) | ২০০ ms-এর নিচে          |
| টুলিং সমর্থন      | সর্বত্র            | ভালো, বাড়ছে                   | ব্রাউজার থেকে সরাসরি    |

<Callout type="tip">

Ingest-এর সবচেয়ে দরকারি metric-টা প্রায় কেউ মাপে না: **উৎসে বিটরেটের স্থিতিশীলতা**। একজন স্ট্রিমারের আপলোড যদি ৬ Mbps থেকে ২ Mbps-এ ওঠানামা করে, আপনার ট্রান্সকোডার যতই ভালো হোক দর্শক ঝামেলা দেখবে। ingest-এ প্রতি সেকেন্ডের প্রাপ্ত বিটরেট, RTT আর প্যাকেট লস রেকর্ড করুন — স্ট্রিমারকে দেখানোর জন্যও, আর "ভিডিও খারাপ কেন" প্রশ্নের উত্তরে দোষটা কোথায় সেটা প্রমাণ করার জন্যও।

</Callout>

## Real-time transcoding: ডেডলাইনের নিচে থাকা

লাইভ ট্রান্সকোডিংয়ের নিয়মটা সরল আর নির্মম: **এক সেকেন্ডের ভিডিও এক সেকেন্ডের কম সময়ে এনকোড হতে হবে**, প্রতিটা rung-এর জন্য, প্রতি সেকেন্ডে, স্ট্রিম চলাকালীন পুরো সময়। ১০০x গতির চেয়ে ভালো এনকোডিং VOD-তে মানে দ্রুত ডেলিভারি; লাইভে ১.০x-এর নিচে নামলে মানে ধ্বংস — কারণ পিছিয়ে পড়া কখনো পুষিয়ে নেওয়া যায় না।

এর ফলে VOD-র তুলনায় বেশ কিছু সিদ্ধান্ত উল্টে যায়:

**Preset দ্রুততর হতে হবে।** VOD-তে `slow` বা `veryslow` preset ব্যবহার করে সময় নিয়ে ভালো মান বের করা হয়। লাইভে সাধারণত `veryfast` বা `faster` — আর এর মানে একই মানের জন্য ২০-৩০% বেশি বিটরেট লাগবে। এটা মেনে নেওয়া ছাড়া উপায় নেই।

**Lookahead সীমিত।** ভালো rate control-এর জন্য এনকোডার সামনের কয়েকটা ফ্রেম দেখতে চায়। লাইভে সামনের ফ্রেম মানে বাড়তি latency — প্রতিটা lookahead ফ্রেম সরাসরি glass-to-glass সময়ে যোগ হয়। তাই lookahead ছোট রাখতে হয়, আর তার বদলে rate control-এর মান খারাপ হয়।

**B-frame খরচ করায়।** B-frame পরের ফ্রেম থেকে prediction করে, তাই ডিকোডারকে সেগুলো আগে পেতে হয় — মানে বাড়তি বিলম্ব। সাব-সেকেন্ড লক্ষ্য হলে B-frame বাদ দিতে হয়, বা খুব কম রাখতে হয়।

**CBR প্রায় বাধ্যতামূলক।** VOD-তে VBR ব্যবহার করে সহজ দৃশ্যে বিটরেট কমানো যায়। লাইভে দর্শকের buffer ছোট, আর হঠাৎ বিটরেট লাফালে buffer শুকিয়ে যায়। তাই CBR বা কড়া সীমার VBR।

**GOP গঠন সেগমেন্ট-সীমার সাথে বাঁধা।** প্রতিটা সেগমেন্ট (আর প্রতিটা partial-এর সীমা) একটা keyframe-এ শুরু হতে হবে, আর সব rung-এ keyframe **ঠিক একই জায়গায়** বসতে হবে — নাহলে ABR সুইচ করার সময় ছবি ভেঙে যাবে। মানে GOP দৈর্ঘ্য নির্ধারিত, আর scene-change-এ keyframe বসানোর সুযোগ কম।

<Callout type="warning">

লাইভ ট্রান্সকোডারে সবচেয়ে বিপজ্জনক অবস্থাটা হলো **ধীরে ধীরে পিছিয়ে পড়া**। ১.০২x গতিতে চললে কিছুই ভাঙে না — শুধু প্রতি মিনিটে ১.২ সেকেন্ড করে দেরি জমে। এক ঘণ্টা পরে দর্শক ৭২ সেকেন্ড পিছিয়ে, আর কোনো alert বাজেনি। তাই **encode speed ratio**-কে একটা প্রথম শ্রেণির metric হিসেবে মাপুন এবং ১.১x-এর নিচে নামলেই alert দিন; ল্যাগের সংখ্যা দেখে অপেক্ষা করবেন না।

</Callout>

## Latency budget: সেকেন্ডগুলো আসলে কোথায় যায়

এই অংশটাই অধ্যায়ের কেন্দ্র। মানুষ ধরে নেয় দেরি মানে "নেটওয়ার্ক ধীর"। বাস্তবে একটা সাধারণ HLS স্ট্রিমের ২০-৩০ সেকেন্ড দেরির মধ্যে নেটওয়ার্কের ভাগ হয়তো ২০০ মিলিসেকেন্ড। বাকিটা **কাঠামোগত অপেক্ষা**।

একটা ঐতিহ্যবাহী ৬-সেকেন্ড সেগমেন্টের HLS স্ট্রিম, ধাপে ধাপে:

| ধাপ                         | কত সময়              | কেন                                                |
| --------------------------- | -------------------- | -------------------------------------------------- |
| ক্যামেরা → এনকোডার          | ৫০-১৫০ ms            | সেন্সর, ISP প্রসেসিং, এনকোডারের ইনপুট বাফার        |
| এনকোডার lookahead + B-frame | ১০০-৫০০ ms           | সামনের ফ্রেম না দেখে ভালো এনকোড হয় না             |
| Ingest ট্রান্সপোর্ট         | ১০০-৭০০ ms           | RTMP-তে TCP বাফার, SRT-তে নির্ধারিত latency window |
| Transcode                   | ২০০-৮০০ ms           | ladder-এর সব rung, প্লাস ইনপুট/আউটপুট কিউ          |
| **Segment সম্পূর্ণ হওয়া**  | **৬,০০০ ms**         | সেগমেন্ট লেখা শেষ না হলে প্রকাশই করা যায় না       |
| Origin-এ আপলোড ও প্রকাশ     | ৫০-৩০০ ms            | packager → origin, manifest আপডেট                  |
| CDN প্রথম fetch             | ৩০-২০০ ms            | edge miss → shield → origin                        |
| Manifest পোলিং বিলম্ব       | ০-৬,০০০ ms           | প্লেয়ার শেষ পোল করেছে ঠিক নতুন সেগমেন্টের আগে     |
| **Player buffer**           | **১২,০০০-১৮,০০০ ms** | প্লেয়ার শুরুর আগে ২-৩টা সেগমেন্ট জমায়            |
| ডিকোড ও রেন্ডার             | ৫০-১০০ ms            | ডিকোডার পাইপলাইন                                   |

যোগ করলে ২০-৩০ সেকেন্ড, আর তার **৯০ ভাগের বেশি এসেছে দুটো লাইন থেকে**: সেগমেন্ট সম্পূর্ণ হওয়ার অপেক্ষা আর প্লেয়ারের বাফার। বাকি সব লাইন মিলে এক-দেড় সেকেন্ড।

এখান থেকে সরাসরি একটা সিদ্ধান্ত আসে: **latency কমানোর একমাত্র বড় লিভার হলো "প্রকাশযোগ্য একক" ছোট করা।** সেগমেন্ট ৬ সেকেন্ড থেকে ২ সেকেন্ডে নামালে দুটো লাইনই সংকুচিত হয় — কারণ প্লেয়ারের ৩ সেগমেন্ট মানেও এখন ৬ সেকেন্ড, ১৮ নয়।

কিন্তু সেগমেন্ট ছোট করার নিজস্ব দাম আছে, আর সেটাই partial segment উদ্ভাবনের কারণ:

- প্রতিটা সেগমেন্ট একটা keyframe দিয়ে শুরু হয়, আর keyframe দামি। ২ সেকেন্ড সেগমেন্ট মানে তিনগুণ বেশি keyframe — মানে একই মানে **১৫-২৫% বেশি বিটরেট**।
- রিকোয়েস্টের সংখ্যা তিনগুণ, মানে CDN-এ বেশি ওভারহেড আর প্রতি রিকোয়েস্টের overhead বেশি অনুপাতে।
- ছোট object মানে CDN ক্যাশে বেশি এন্ট্রি, বেশি মেটাডেটা।

**Partial segment এই দ্বন্দ্বটাই ভাঙে**: সেগমেন্টের দৈর্ঘ্য (আর তাই keyframe-এর ব্যবধান) ৬ সেকেন্ডেই রেখে দাও, কিন্তু সেগমেন্টটা তৈরি হওয়ার সাথে সাথে **টুকরো টুকরো করে প্রকাশ করতে থাকো**। keyframe-এর খরচ বাড়ে না, অথচ প্রকাশের একক ২০০-৫০০ ms-এ নেমে আসে।

## LL-HLS: partial segment, blocking reload, preload hint

LL-HLS তিনটা নতুন যন্ত্র যোগ করে, আর তিনটাই latency budget-এর আলাদা লাইন আক্রমণ করে।

**১. Partial segment (`EXT-X-PART`).** একটা ৬-সেকেন্ডের সেগমেন্ট ২০০-৫০০ ms-এর টুকরোয় ভাগ করে, প্রতিটা টুকরো তৈরি হওয়ামাত্র playlist-এ ঘোষণা করা হয়। প্লেয়ার এগুলো আলাদা রিকোয়েস্টে (বা byte-range-এ) নিতে পারে। এটা "সেগমেন্ট সম্পূর্ণ হওয়ার অপেক্ষা"-কে ৬,০০০ ms থেকে ~৪০০ ms-এ নামায়।

**২. Blocking playlist reload.** সাধারণ HLS-এ প্লেয়ার প্রতি কয়েক সেকেন্ডে playlist চায়, আর প্রায়ই পুরনো জিনিসই ফেরত পায় — ওই ব্যর্থ পোলগুলোই "manifest পোলিং বিলম্ব"। LL-HLS-এ প্লেয়ার বলে "আমাকে media sequence 105-এর part 3 দাও", আর **সার্ভার response আটকে রাখে যতক্ষণ না সেই part আসে**। ফলে অপেক্ষার সময়টা শূন্যের কাছে নেমে যায়, আর অপ্রয়োজনীয় রিকোয়েস্টও কমে।

**৩. Preload hint (`EXT-X-PRELOAD-HINT`).** playlist জানিয়ে দেয় পরের part-টার URL কী হবে, তৈরি হওয়ার আগেই। প্লেয়ার সেটা এখনই চেয়ে বসতে পারে; সার্ভার কানেকশন খোলা রেখে বাইট তৈরি হওয়ামাত্র পাঠাতে শুরু করে। এতে রিকোয়েস্ট রাউন্ড-ট্রিপটাও পাইপলাইন থেকে বেরিয়ে যায়।

সাথে দুটো সহায়ক জিনিস: **rendition report** (`EXT-X-RENDITION-REPORT`) — অন্য rung-গুলোর বর্তমান অবস্থা একই playlist-এ জানিয়ে দেওয়া, যাতে ABR সুইচ করার সময় প্লেয়ারকে নতুন playlist আনতে দেরি না হয়; আর **`EXT-X-SERVER-CONTROL`** — যেখানে সার্ভার তার সক্ষমতা ঘোষণা করে।

একটা LL-HLS media playlist দেখতে এরকম:

```text
#EXTM3U
#EXT-X-VERSION:9
#EXT-X-TARGETDURATION:6
#EXT-X-PART-INF:PART-TARGET=0.500
#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.500,HOLD-BACK=9.000
#EXT-X-MEDIA-SEQUENCE:104

#EXTINF:6.000,
seg-00104.m4s

#EXT-X-PART:DURATION=0.500,URI="seg-00105.0.m4s",INDEPENDENT=YES
#EXT-X-PART:DURATION=0.500,URI="seg-00105.1.m4s"
#EXT-X-PART:DURATION=0.500,URI="seg-00105.2.m4s"
#EXTINF:6.000,
seg-00105.m4s

#EXT-X-PART:DURATION=0.500,URI="seg-00106.0.m4s",INDEPENDENT=YES
#EXT-X-PART:DURATION=0.500,URI="seg-00106.1.m4s"
#EXT-X-PRELOAD-HINT:TYPE=PART,URI="seg-00106.2.m4s"

#EXT-X-RENDITION-REPORT:URI="../720p/index.m3u8",LAST-MSN=106,LAST-PART=1
#EXT-X-RENDITION-REPORT:URI="../480p/index.m3u8",LAST-MSN=106,LAST-PART=1
```

কয়েকটা সূক্ষ্ম কিন্তু গুরুত্বপূর্ণ ব্যাপার:

- **`PART-HOLD-BACK`** বলে প্লেয়ার লাইভ প্রান্ত থেকে কতটা পিছিয়ে থাকবে। এটা `PART-TARGET`-এর অন্তত তিনগুণ হতে হয়। এই একটা সংখ্যাই কার্যত আপনার latency লক্ষ্য নির্ধারণ করে দেয় — খুব ছোট করলে দর্শক ঘনঘন rebuffer করবে।
- **`INDEPENDENT=YES`** মানে ওই part একটা keyframe দিয়ে শুরু, তাই সেখান থেকে প্লেব্যাক শুরু করা যায়। সেগমেন্টের প্রথম part-এ এটা থাকে; বাকিগুলোতে থাকে না।
- **পুরনো part বাদ দিতে হয়।** playlist-এ কেবল সাম্প্রতিক কয়েকটা সেগমেন্টের part রাখা হয়; পুরনোগুলোতে শুধু পূর্ণ সেগমেন্টের এন্ট্রি থাকে, নাহলে playlist অসীম বড় হবে।
- **প্রতিটা part-এর জন্য আলাদা ফাইল না বানিয়ে byte-range ব্যবহার করা যায়** (`BYTERANGE` অ্যাট্রিবিউট) — এতে object-এর সংখ্যা কমে, কিন্তু CDN-কে ঠিকমতো range সামলাতে হবে।

<Callout type="warning">

LL-HLS-এর blocking reload আপনার origin-এর জন্য একটা নতুন ধরনের চাপ: **হাজারো খোলা, অপেক্ষমাণ কানেকশন**। প্রতিটা দর্শকের প্রায় সবসময় একটা করে অসমাপ্ত রিকোয়েস্ট ঝুলে থাকে। থ্রেড-প্রতি-রিকোয়েস্ট মডেলের সার্ভার এখানে ধসে পড়বে। এই স্তরটা async/event-driven হতে হবে, আর CDN-কেও origin-এ blocking রিকোয়েস্ট coalescing করতে জানতে হবে — নাহলে দশ হাজার দর্শক মানে origin-এ দশ হাজার ঝুলন্ত কানেকশন।

</Callout>

## LL-DASH: chunked CMAF আর chunked transfer

DASH একই লক্ষ্যে পৌঁছায় ভিন্ন পথে, আর পথটা HTTP-র আরও কাছাকাছি।

মূল ধারণা হলো **chunked CMAF**: একটা CMAF সেগমেন্ট ভেতরে ছোট ছোট `moof`+`mdat` জোড়ায় গঠিত, আর সেগুলো তৈরি হওয়ার সাথে সাথে **HTTP chunked transfer encoding** দিয়ে পাঠানো শুরু করা যায়। প্লেয়ার একটা সেগমেন্টের জন্য রিকোয়েস্ট করে যেটা এখনো লেখা হয়নি; সার্ভার response শুরু করে দেয় আর chunk আসতে থাকলে ঠেলতে থাকে। প্লেয়ার আসছে-এমন বাইট ডিকোড করতে থাকে।

পার্থক্যটা কাঠামোগত: LL-HLS-এ **প্রতিটা part একটা আলাদা অ্যাড্রেসযোগ্য জিনিস** যা manifest-এ ঘোষিত হয়; LL-DASH-এ **সেগমেন্ট একটাই জিনিস, কিন্তু তার response স্ট্রিমিং**। manifest-এ প্রতি part-এর জন্য আপডেট লাগে না — DASH manifest টেমপ্লেট-ভিত্তিক, তাই প্লেয়ার নিজেই সময় থেকে হিসাব করে পরের সেগমেন্টের নাম বের করে।

দুটো অ্যাট্রিবিউট এখানে গুরুত্বপূর্ণ:

- **`availabilityTimeOffset`** — বলে সেগমেন্টটা তার সম্পূর্ণ হওয়ার কত আগেই চাওয়া যাবে। এটাই আসলে "অসমাপ্ত জিনিস চাইতে পারো" বলার উপায়।
- **`ServiceDescription` → `Latency`** — কাঙ্ক্ষিত latency, সর্বনিম্ন ও সর্বোচ্চ সীমা, আর প্লেব্যাকের গতি কতটা বাড়ানো-কমানো যাবে সেটা ঘোষণা করে।

ওই শেষ জিনিসটা — **playback rate adjustment** — কম-প্রচারিত কিন্তু অপরিহার্য। লাইভ প্রান্তের কাছে থাকতে হলে প্লেয়ারকে ক্রমাগত সমন্বয় করতে হয়: বেশি পিছিয়ে পড়লে সে ১.০৫x গতিতে চালিয়ে ধরে ফেলে, আর খুব কাছে চলে এলে ০.৯৭x-এ নেমে buffer জমায়। কানে ধরা পড়ে না, কিন্তু এটাই স্থিতিশীল low-latency প্লেব্যাকের গোপন উপাদান — LL-HLS প্লেয়ারগুলোও একই কৌশল ব্যবহার করে।

```text
LL-DASH-এর মূল অংশটুকু (MPD-র ভেতরে):

  <ServiceDescription id="0">
    <Latency target="3000" min="2000" max="6000"/>
    <PlaybackRate min="0.96" max="1.04"/>
  </ServiceDescription>

  <SegmentTemplate
     media="$RepresentationID$/seg-$Number$.m4s"
     duration="2"
     availabilityTimeOffset="1.8"
     availabilityTimeComplete="false"/>
```

## WebRTC: সাব-সেকেন্ড, আর তার বিনিময়ে যা দিতে হয়

HTTP-ভিত্তিক পথগুলো ভালো করলেও ২ সেকেন্ডের নিচে নামা কঠিন, আর ১ সেকেন্ডের নিচে কার্যত অসম্ভব। কিন্তু কিছু ব্যবহারে **সত্যিই** সাব-সেকেন্ড লাগে: নিলাম, বেটিং, ইন্টারেক্টিভ শো যেখানে দর্শক সরাসরি কথা বলে, রিমোট ক্যামেরা নিয়ন্ত্রণ, ক্লাউড গেমিং। সেখানে WebRTC।

WebRTC ২০০ ms-এর নিচে যেতে পারে কারণ সে HTTP-র স্তরগুলো পুরোপুরি বাদ দেয়: কোনো সেগমেন্ট নেই, কোনো manifest নেই, কোনো CDN ক্যাশ নেই। RTP-র উপরে ফ্রেম সরাসরি UDP-তে ঠেলে দেওয়া হয়, আর প্লেয়ারের বাফার প্রায় শূন্য।

দাম চারটা, আর প্রতিটাই গুরুতর:

**স্কেলিং সম্পূর্ণ আলাদা।** HLS-এ ১০ লাখ দর্শক মানে CDN-এ ১০ লাখ ক্যাশড রিকোয়েস্ট — বেশ সস্তা। WebRTC-তে প্রতিটা দর্শকের একটা করে আলাদা peer connection দরকার, যেটা কোনো একটা সার্ভারে (SFU) টার্মিনেট হয়। স্কেল করতে হলে SFU-র গাছ বানাতে হয়, আর প্রতিটা স্তরে CPU আর ব্যান্ডউইথ খরচ হয়। খরচ দর্শকসংখ্যার সাথে **প্রায় সরলরৈখিকভাবে** বাড়ে, ক্যাশিংয়ের কোনো সুবিধা নেই।

**হারানো ডেটা ফেরে না।** ছোট বাফার মানে পুনঃপ্রেরণের সময় নেই। প্যাকেট হারালে সেটা হারিয়েই যায় — ছবিতে সাময়িক ভাঙন বা ফ্রেম ড্রপ। HLS-এ TCP নীরবে সব উদ্ধার করে নিত।

**ABR অপরিণত।** WebRTC-তে সার্ভার-সাইড bandwidth estimation আছে, কিন্তু HLS/DASH-এর মতো সুপ্রতিষ্ঠিত মাল্টি-রেন্ডিশন ladder নয়। Simulcast আর SVC আছে, কিন্তু সেগুলো জটিল আর কম ব্যাপকভাবে সমর্থিত।

**পরিচালনার ভার বেশি।** ICE, STUN, TURN, NAT ট্রাভার্সাল, DTLS — একটা পুরো নেটওয়ার্কিং স্তর যা আপনাকে চালাতে হবে। প্রতিষ্ঠানের ফায়ারওয়াল UDP আটকে দিলে TURN-এর মাধ্যমে relay করতে হয়, যা খরচ আর latency দুটোই বাড়ায়।

<Callout type="tip">

বাস্তবে সবচেয়ে কার্যকর নকশা প্রায়ই **হাইব্রিড**: বিশাল দর্শকের জন্য LL-HLS/LL-DASH, আর যাদের সত্যিই ইন্টারঅ্যাক্ট করতে হবে (নিলামে দর হাঁকা কয়েকশো জন, বা স্টুডিওতে যুক্ত অতিথি) কেবল তাদের জন্য WebRTC। "সবাইকে সাব-সেকেন্ড দিতে হবে" — এই দাবিটা প্রায় সবসময় পরীক্ষা করলে ভেঙে পড়ে, কারণ ৯৯% দর্শক শুধু দেখছে, কিছু করছে না।

</Callout>

## ত্রিভুজ: latency, scale, cost

এই তিনটার যেকোনো দুটো একসাথে পাওয়া যায়, তিনটা একসাথে নয়। পছন্দটা ইচ্ছাকৃতভাবে করা ভালো, কারণ না করলে ডিফল্ট পছন্দটা এসে বসে যায়।

| পদ্ধতি           | Latency         | স্কেল                 | আপেক্ষিক খরচ | কখন ঠিক                                   |
| ---------------- | --------------- | --------------------- | ------------ | ----------------------------------------- |
| সাধারণ HLS/DASH  | ২০-৩০ সেকেন্ড   | কার্যত সীমাহীন        | সবচেয়ে কম   | সাধারণ সম্প্রচার, দেরিতে কিছু আসে-যায় না |
| Tuned HLS/DASH   | ৬-১০ সেকেন্ড    | কার্যত সীমাহীন        | কম           | খেলা, খবর — টিভির কাছাকাছি থাকা চাই       |
| LL-HLS / LL-DASH | ২-৫ সেকেন্ড     | খুব বড়, origin-এ চাপ | মাঝারি       | বেশিরভাগ "কম latency" চাহিদার সঠিক উত্তর  |
| WebRTC           | ০.২-০.৫ সেকেন্ড | সীমিত, দামি স্কেলিং   | সবচেয়ে বেশি | সত্যিকারের ইন্টারঅ্যাকশন                  |

আর তিনটার সম্পর্কটা মনে রাখার সহজ ভাষ্য: **latency কমানো মানে বাফার কমানো, আর বাফার কমানো মানে ভুলের জন্য জায়গা কমানো।** ২ সেকেন্ডের latency-তে চললে একটা ৫০০ ms-এর নেটওয়ার্ক hiccup সরাসরি rebuffer। ২০ সেকেন্ডে চললে সেটা কেউ টেরই পেত না। তাই low-latency চালু করার আগে প্রশ্নটা হওয়া উচিত: **আমরা কি বেশি rebuffer গ্রহণ করতে রাজি?** যদি না হয়, তাহলে আসলে low-latency চাওয়া হচ্ছে না।

## LL-HLS partial-segment playlist জেনারেটর

নিচের কোডটা LL-HLS-এর সার্ভার-সাইড হৃদয়: একটা রোলিং উইন্ডো যেখানে partial segment জমা হয়, পূর্ণ সেগমেন্টে গুটিয়ে যায়, playlist তৈরি হয়, আর **blocking reload** সামলানো হয় — অর্থাৎ কোনো প্লেয়ার যদি এমন media sequence + part চায় যা এখনো তৈরি হয়নি, তার রিকোয়েস্ট জিনিসটা তৈরি হওয়া পর্যন্ত অপেক্ষা করে।

<CodeTabs tsFile="llhls.ts" goFile="llhls.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// =========================================================================
// LL-HLS media playlist generator with partial segments and blocking reload
// =========================================================================

interface PartialSegment {
	/** Index within the parent segment, starting at 0. */
	index: number;
	uri: string;
	durationSeconds: number;
	/** True when this part starts with a keyframe and is independently decodable. */
	independent: boolean;
	/** Set once the bytes are fully written. */
	complete: boolean;
}

interface Segment {
	/** Media sequence number. Monotonic, never reused. */
	msn: number;
	uri: string;
	targetDurationSeconds: number;
	parts: PartialSegment[];
	/** True once every part is written and the segment file is closed. */
	complete: boolean;
	actualDurationSeconds: number;
}

interface PlaylistConfig {
	/** Nominal segment length. Also the keyframe interval. */
	segmentDurationSeconds: number;
	/** Nominal part length. 0.2-0.5s is the practical range. */
	partTargetSeconds: number;
	/** How many complete segments to keep in the sliding window. */
	windowSize: number;
	/**
	 * How many trailing segments still advertise their individual parts.
	 * Older segments appear as a single EXTINF only, or the playlist grows
	 * without bound.
	 */
	partAdvertiseDepth: number;
	basePath: string;
}

const DEFAULT_CONFIG: PlaylistConfig = {
	segmentDurationSeconds: 6,
	partTargetSeconds: 0.5,
	windowSize: 6,
	partAdvertiseDepth: 3,
	basePath: ''
};

interface RenditionReport {
	uri: string;
	lastMsn: number;
	lastPart: number;
}

/** A player blocked on a part that does not exist yet. */
interface Waiter {
	msn: number;
	part: number;
	resolve: () => void;
	timer: ReturnType<typeof setTimeout>;
}

class LiveMediaPlaylist {
	private segments: Segment[] = [];
	private nextMsn: number;
	private waiters: Waiter[] = [];
	private renditionReports: RenditionReport[] = [];
	/** Bumped whenever a discontinuity is inserted (encoder restart, ad break). */
	private discontinuitySequence = 0;
	private pendingDiscontinuity = false;

	constructor(
		private readonly config: PlaylistConfig = DEFAULT_CONFIG,
		startMsn = 0
	) {
		this.nextMsn = startMsn;
	}

	// --- Ingestion -------------------------------------------------------

	/** Open a new segment. Called when the encoder emits a keyframe. */
	openSegment(): Segment {
		const msn = this.nextMsn++;
		const segment: Segment = {
			msn,
			uri: `${this.config.basePath}seg-${String(msn).padStart(5, '0')}.m4s`,
			targetDurationSeconds: this.config.segmentDurationSeconds,
			parts: [],
			complete: false,
			actualDurationSeconds: 0
		};
		this.segments.push(segment);
		this.trim();
		return segment;
	}

	/**
	 * Append a finished part to the newest segment.
	 *
	 * The part must already be durably readable from the origin before it is
	 * announced. Announcing a part that a player then 404s on is worse than
	 * announcing it 100ms later: the player treats it as a fatal error.
	 */
	appendPart(durationSeconds: number, independent: boolean): PartialSegment {
		const segment = this.segments[this.segments.length - 1];
		if (!segment) throw new Error('appendPart called with no open segment');
		if (segment.complete) throw new Error(`segment ${segment.msn} is already closed`);

		const index = segment.parts.length;
		const part: PartialSegment = {
			index,
			uri: `${this.config.basePath}seg-${String(segment.msn).padStart(5, '0')}.${index}.m4s`,
			durationSeconds,
			// Only the first part of a segment starts on a keyframe.
			independent: index === 0 ? true : independent,
			complete: true
		};

		segment.parts.push(part);
		segment.actualDurationSeconds += durationSeconds;
		this.releaseWaiters();
		return part;
	}

	/** Close the current segment. Called at the next keyframe boundary. */
	closeSegment(): void {
		const segment = this.segments[this.segments.length - 1];
		if (!segment) return;
		segment.complete = true;
		this.releaseWaiters();
	}

	/**
	 * Mark a discontinuity for the next segment.
	 *
	 * Needed whenever timestamps or codec parameters jump: encoder restart,
	 * failover to a backup ingest, or an ad insertion. Without it, players
	 * try to decode across the seam and either stall or show corruption.
	 */
	markDiscontinuity(): void {
		this.pendingDiscontinuity = true;
		this.discontinuitySequence++;
	}

	setRenditionReports(reports: RenditionReport[]): void {
		this.renditionReports = reports;
	}

	// --- Window management -----------------------------------------------

	private trim(): void {
		// Keep windowSize complete segments plus the one being written.
		const maxSegments = this.config.windowSize + 1;
		while (this.segments.length > maxSegments) this.segments.shift();
	}

	private get mediaSequence(): number {
		return this.segments.length > 0 ? this.segments[0].msn : this.nextMsn;
	}

	/** The newest (msn, part) pair a player can currently ask for. */
	tip(): { msn: number; part: number } {
		const segment = this.segments[this.segments.length - 1];
		if (!segment) return { msn: this.nextMsn, part: 0 };
		return { msn: segment.msn, part: Math.max(0, segment.parts.length - 1) };
	}

	// --- Blocking reload -------------------------------------------------

	private isAvailable(msn: number, part: number): boolean {
		const segment = this.segments.find((s) => s.msn === msn);
		if (!segment) {
			// Either already rolled out of the window (available, serve now) or
			// still in the future (must wait).
			return msn < this.mediaSequence;
		}
		if (segment.complete) return true;
		return segment.parts.length > part;
	}

	private releaseWaiters(): void {
		const stillWaiting: Waiter[] = [];
		for (const waiter of this.waiters) {
			if (this.isAvailable(waiter.msn, waiter.part)) {
				clearTimeout(waiter.timer);
				waiter.resolve();
			} else {
				stillWaiting.push(waiter);
			}
		}
		this.waiters = stillWaiting;
	}

	/**
	 * Serve a playlist request, honouring _HLS_msn and _HLS_part.
	 *
	 * The timeout is a safety valve, not a normal path. The spec expects the
	 * server to hold the request; a client that times out will simply retry,
	 * but a request held forever leaks a connection when a stream ends.
	 */
	async serve(
		requestedMsn?: number,
		requestedPart?: number,
		timeoutMs = 10_000
	): Promise<{ body: string; blockedMs: number }> {
		const startedAt = Date.now();

		if (requestedMsn !== undefined) {
			const part = requestedPart ?? 0;

			// Reject requests too far in the future: a client asking for msn+50
			// is buggy or malicious, and holding it would pin a connection.
			const tip = this.tip();
			if (requestedMsn > tip.msn + 2) {
				throw new Error(`requested msn ${requestedMsn} is too far ahead of ${tip.msn}`);
			}

			if (!this.isAvailable(requestedMsn, part)) {
				await new Promise<void>((resolve) => {
					const timer = setTimeout(() => {
						this.waiters = this.waiters.filter((w) => w.resolve !== resolve);
						resolve();
					}, timeoutMs);
					this.waiters.push({ msn: requestedMsn, part, resolve, timer });
				});
			}
		}

		return { body: this.render(), blockedMs: Date.now() - startedAt };
	}

	// --- Rendering -------------------------------------------------------

	render(): string {
		const lines: string[] = [
			'#EXTM3U',
			'#EXT-X-VERSION:9',
			`#EXT-X-TARGETDURATION:${Math.ceil(this.config.segmentDurationSeconds)}`,
			`#EXT-X-PART-INF:PART-TARGET=${this.config.partTargetSeconds.toFixed(3)}`,
			// PART-HOLD-BACK must be at least 3x PART-TARGET. This single number
			// is effectively the latency target the player will aim for.
			'#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,' +
				`PART-HOLD-BACK=${(this.config.partTargetSeconds * 3).toFixed(3)},` +
				`HOLD-BACK=${(this.config.segmentDurationSeconds * 1.5).toFixed(3)}`,
			`#EXT-X-MEDIA-SEQUENCE:${this.mediaSequence}`,
			`#EXT-X-DISCONTINUITY-SEQUENCE:${this.discontinuitySequence}`,
			''
		];

		const partFloor = Math.max(0, this.segments.length - this.config.partAdvertiseDepth);

		this.segments.forEach((segment, position) => {
			if (position >= partFloor) {
				for (const part of segment.parts) {
					const attrs = [`DURATION=${part.durationSeconds.toFixed(3)}`, `URI="${part.uri}"`];
					if (part.independent) attrs.push('INDEPENDENT=YES');
					lines.push(`#EXT-X-PART:${attrs.join(',')}`);
				}
			}

			if (segment.complete) {
				lines.push(`#EXTINF:${segment.actualDurationSeconds.toFixed(3)},`);
				lines.push(segment.uri);
				lines.push('');
			}
		});

		// Hint the part that does not exist yet, so the player can request it
		// now and have the bytes streamed to it the instant they are produced.
		const open = this.segments[this.segments.length - 1];
		if (open && !open.complete) {
			const nextIndex = open.parts.length;
			const hinted = `${this.config.basePath}seg-${String(open.msn).padStart(5, '0')}.${nextIndex}.m4s`;
			lines.push(`#EXT-X-PRELOAD-HINT:TYPE=PART,URI="${hinted}"`);
		}

		for (const report of this.renditionReports) {
			lines.push(
				`#EXT-X-RENDITION-REPORT:URI="${report.uri}",` +
					`LAST-MSN=${report.lastMsn},LAST-PART=${report.lastPart}`
			);
		}

		if (this.pendingDiscontinuity) {
			// Consumed on render so it lands exactly once, at the seam.
			this.pendingDiscontinuity = false;
		}

		return lines.join('\n') + '\n';
	}
}

// --- Demo: drive it like an encoder would --------------------------------

async function demo(): Promise<void> {
	const playlist = new LiveMediaPlaylist({ ...DEFAULT_CONFIG, basePath: '' }, 104);
	const partsPerSegment = Math.round(
		DEFAULT_CONFIG.segmentDurationSeconds / DEFAULT_CONFIG.partTargetSeconds
	);

	// A player blocks on a part that has not been produced yet.
	const pending = playlist.serve(105, 2, 5000);

	for (let segmentIndex = 0; segmentIndex < 2; segmentIndex++) {
		playlist.openSegment();
		for (let part = 0; part < partsPerSegment; part++) {
			playlist.appendPart(DEFAULT_CONFIG.partTargetSeconds, part === 0);
		}
		playlist.closeSegment();
	}

	playlist.setRenditionReports([
		{ uri: '../720p/index.m3u8', lastMsn: 105, lastPart: 11 },
		{ uri: '../480p/index.m3u8', lastMsn: 105, lastPart: 11 }
	]);

	const { body, blockedMs } = await pending;
	console.log(`blocked for ${blockedMs}ms`);
	console.log(body);
}

demo().catch((error) => {
	console.error(`llhls demo failed: ${error instanceof Error ? error.message : error}`);
	process.exit(1);
});
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"fmt"
	"math"
	"strings"
	"sync"
	"time"
)

// =========================================================================
// LL-HLS media playlist generator with partial segments and blocking reload
// =========================================================================

type PartialSegment struct {
	Index           int
	URI             string
	DurationSeconds float64
	// Independent means the part starts with a keyframe and is decodable alone.
	Independent bool
}

type Segment struct {
	MSN                   int // media sequence number, monotonic, never reused
	URI                   string
	Parts                 []PartialSegment
	Complete              bool
	ActualDurationSeconds float64
}

type PlaylistConfig struct {
	SegmentDurationSeconds float64 // also the keyframe interval
	PartTargetSeconds      float64 // 0.2-0.5s is the practical range
	WindowSize             int     // complete segments kept in the sliding window
	// PartAdvertiseDepth is how many trailing segments still list their parts.
	// Older segments appear as a single EXTINF, or the playlist grows forever.
	PartAdvertiseDepth int
	BasePath           string
}

var defaultConfig = PlaylistConfig{
	SegmentDurationSeconds: 6,
	PartTargetSeconds:      0.5,
	WindowSize:             6,
	PartAdvertiseDepth:     3,
}

type RenditionReport struct {
	URI      string
	LastMSN  int
	LastPart int
}

// waiter is a player blocked on a part that does not exist yet.
type waiter struct {
	msn    int
	part   int
	notify chan struct{}
}

type LiveMediaPlaylist struct {
	mu       sync.Mutex
	config   PlaylistConfig
	segments []*Segment
	nextMSN  int
	waiters  []*waiter
	reports  []RenditionReport

	// Bumped whenever a discontinuity is inserted (encoder restart, ad break).
	discontinuitySequence int
}

func NewLiveMediaPlaylist(config PlaylistConfig, startMSN int) *LiveMediaPlaylist {
	return &LiveMediaPlaylist{config: config, nextMSN: startMSN}
}

// --- Ingestion -----------------------------------------------------------

// OpenSegment starts a new segment. Called when the encoder emits a keyframe.
func (p *LiveMediaPlaylist) OpenSegment() {
	p.mu.Lock()
	defer p.mu.Unlock()

	msn := p.nextMSN
	p.nextMSN++
	p.segments = append(p.segments, &Segment{
		MSN: msn,
		URI: fmt.Sprintf("%sseg-%05d.m4s", p.config.BasePath, msn),
	})
	p.trimLocked()
}

// AppendPart adds a finished part to the newest segment.
//
// The part must already be durably readable from the origin before it is
// announced. Announcing a part a player then 404s on is worse than announcing
// it 100ms later: the player treats a 404 as fatal.
func (p *LiveMediaPlaylist) AppendPart(durationSeconds float64, independent bool) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.segments) == 0 {
		return fmt.Errorf("AppendPart called with no open segment")
	}
	segment := p.segments[len(p.segments)-1]
	if segment.Complete {
		return fmt.Errorf("segment %d is already closed", segment.MSN)
	}

	index := len(segment.Parts)
	segment.Parts = append(segment.Parts, PartialSegment{
		Index:           index,
		URI:             fmt.Sprintf("%sseg-%05d.%d.m4s", p.config.BasePath, segment.MSN, index),
		DurationSeconds: durationSeconds,
		// Only the first part of a segment starts on a keyframe.
		Independent: index == 0 || independent,
	})
	segment.ActualDurationSeconds += durationSeconds

	p.releaseWaitersLocked()
	return nil
}

// CloseSegment finishes the current segment at the next keyframe boundary.
func (p *LiveMediaPlaylist) CloseSegment() {
	p.mu.Lock()
	defer p.mu.Unlock()

	if len(p.segments) == 0 {
		return
	}
	p.segments[len(p.segments)-1].Complete = true
	p.releaseWaitersLocked()
}

// MarkDiscontinuity records a timestamp or codec discontinuity.
//
// Needed whenever timestamps or codec parameters jump: encoder restart,
// failover to a backup ingest, or ad insertion. Without it players decode
// across the seam and either stall or show corruption.
func (p *LiveMediaPlaylist) MarkDiscontinuity() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.discontinuitySequence++
}

func (p *LiveMediaPlaylist) SetRenditionReports(reports []RenditionReport) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.reports = reports
}

// --- Window management ---------------------------------------------------

func (p *LiveMediaPlaylist) trimLocked() {
	max := p.config.WindowSize + 1 // window plus the segment being written
	for len(p.segments) > max {
		p.segments = p.segments[1:]
	}
}

func (p *LiveMediaPlaylist) mediaSequenceLocked() int {
	if len(p.segments) == 0 {
		return p.nextMSN
	}
	return p.segments[0].MSN
}

// Tip is the newest (msn, part) pair a player can currently ask for.
func (p *LiveMediaPlaylist) Tip() (int, int) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.segments) == 0 {
		return p.nextMSN, 0
	}
	segment := p.segments[len(p.segments)-1]
	part := len(segment.Parts) - 1
	if part < 0 {
		part = 0
	}
	return segment.MSN, part
}

// --- Blocking reload -----------------------------------------------------

func (p *LiveMediaPlaylist) isAvailableLocked(msn, part int) bool {
	for _, segment := range p.segments {
		if segment.MSN != msn {
			continue
		}
		if segment.Complete {
			return true
		}
		return len(segment.Parts) > part
	}
	// Either already rolled out of the window (serve now) or still in the
	// future (must wait).
	return msn < p.mediaSequenceLocked()
}

func (p *LiveMediaPlaylist) releaseWaitersLocked() {
	remaining := p.waiters[:0]
	for _, w := range p.waiters {
		if p.isAvailableLocked(w.msn, w.part) {
			close(w.notify)
		} else {
			remaining = append(remaining, w)
		}
	}
	p.waiters = remaining
}

// Serve answers a playlist request, honouring _HLS_msn and _HLS_part.
//
// The timeout is a safety valve, not a normal path. The spec expects the
// server to hold the request; a client that times out simply retries, but a
// request held forever leaks a connection when the stream ends.
func (p *LiveMediaPlaylist) Serve(requestedMSN, requestedPart int, timeout time.Duration) (string, time.Duration, error) {
	startedAt := time.Now()

	if requestedMSN >= 0 {
		p.mu.Lock()

		// Reject requests too far ahead: a client asking for msn+50 is buggy or
		// malicious, and holding it would pin a connection.
		tipMSN := p.nextMSN - 1
		if requestedMSN > tipMSN+2 {
			p.mu.Unlock()
			return "", 0, fmt.Errorf("requested msn %d too far ahead of %d", requestedMSN, tipMSN)
		}

		if !p.isAvailableLocked(requestedMSN, requestedPart) {
			w := &waiter{msn: requestedMSN, part: requestedPart, notify: make(chan struct{})}
			p.waiters = append(p.waiters, w)
			p.mu.Unlock()

			select {
			case <-w.notify:
			case <-time.After(timeout):
				p.mu.Lock()
				remaining := p.waiters[:0]
				for _, other := range p.waiters {
					if other != w {
						remaining = append(remaining, other)
					}
				}
				p.waiters = remaining
				p.mu.Unlock()
			}
		} else {
			p.mu.Unlock()
		}
	}

	return p.Render(), time.Since(startedAt), nil
}

// --- Rendering -----------------------------------------------------------

func (p *LiveMediaPlaylist) Render() string {
	p.mu.Lock()
	defer p.mu.Unlock()

	var b strings.Builder
	b.WriteString("#EXTM3U\n#EXT-X-VERSION:9\n")
	fmt.Fprintf(&b, "#EXT-X-TARGETDURATION:%d\n", int(math.Ceil(p.config.SegmentDurationSeconds)))
	fmt.Fprintf(&b, "#EXT-X-PART-INF:PART-TARGET=%.3f\n", p.config.PartTargetSeconds)

	// PART-HOLD-BACK must be at least 3x PART-TARGET. This single number is
	// effectively the latency target the player will aim for.
	fmt.Fprintf(&b, "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=%.3f,HOLD-BACK=%.3f\n",
		p.config.PartTargetSeconds*3, p.config.SegmentDurationSeconds*1.5)
	fmt.Fprintf(&b, "#EXT-X-MEDIA-SEQUENCE:%d\n", p.mediaSequenceLocked())
	fmt.Fprintf(&b, "#EXT-X-DISCONTINUITY-SEQUENCE:%d\n\n", p.discontinuitySequence)

	partFloor := len(p.segments) - p.config.PartAdvertiseDepth
	if partFloor < 0 {
		partFloor = 0
	}

	for position, segment := range p.segments {
		if position >= partFloor {
			for _, part := range segment.Parts {
				fmt.Fprintf(&b, "#EXT-X-PART:DURATION=%.3f,URI=%q", part.DurationSeconds, part.URI)
				if part.Independent {
					b.WriteString(",INDEPENDENT=YES")
				}
				b.WriteString("\n")
			}
		}
		if segment.Complete {
			fmt.Fprintf(&b, "#EXTINF:%.3f,\n%s\n\n", segment.ActualDurationSeconds, segment.URI)
		}
	}

	// Hint the part that does not exist yet, so the player can request it now
	// and have bytes streamed to it the instant they are produced.
	if len(p.segments) > 0 {
		open := p.segments[len(p.segments)-1]
		if !open.Complete {
			hinted := fmt.Sprintf("%sseg-%05d.%d.m4s", p.config.BasePath, open.MSN, len(open.Parts))
			fmt.Fprintf(&b, "#EXT-X-PRELOAD-HINT:TYPE=PART,URI=%q\n", hinted)
		}
	}

	for _, report := range p.reports {
		fmt.Fprintf(&b, "#EXT-X-RENDITION-REPORT:URI=%q,LAST-MSN=%d,LAST-PART=%d\n",
			report.URI, report.LastMSN, report.LastPart)
	}

	return b.String()
}

// --- Demo: drive it like an encoder would --------------------------------

func main() {
	playlist := NewLiveMediaPlaylist(defaultConfig, 104)
	partsPerSegment := int(math.Round(defaultConfig.SegmentDurationSeconds / defaultConfig.PartTargetSeconds))

	type served struct {
		body    string
		blocked time.Duration
	}
	result := make(chan served, 1)

	// A player blocks on a part that has not been produced yet.
	go func() {
		body, blocked, err := playlist.Serve(105, 2, 5*time.Second)
		if err != nil {
			fmt.Println("serve failed:", err)
			close(result)
			return
		}
		result <- served{body: body, blocked: blocked}
	}()

	time.Sleep(20 * time.Millisecond) // let the reader register as a waiter

	for segmentIndex := 0; segmentIndex < 2; segmentIndex++ {
		playlist.OpenSegment()
		for part := 0; part < partsPerSegment; part++ {
			if err := playlist.AppendPart(defaultConfig.PartTargetSeconds, part == 0); err != nil {
				fmt.Println("append failed:", err)
				return
			}
		}
		playlist.CloseSegment()
	}

	playlist.SetRenditionReports([]RenditionReport{
		{URI: "../720p/index.m3u8", LastMSN: 105, LastPart: 11},
		{URI: "../480p/index.m3u8", LastMSN: 105, LastPart: 11},
	})

	out, ok := <-result
	if !ok {
		return
	}
	fmt.Printf("blocked for %v\n", out.blocked)
	fmt.Println(out.body)
}
```

</div>
</CodeTabs>

## ব্যর্থতা সামলানো: এনকোডার বা ingest মাঝপথে পড়ে গেলে

VOD-তে ব্যর্থতা মানে একটা কাজ আবার চালানো। লাইভে ব্যর্থতা মানে **দর্শক এখনই দেখছে, এবং এখনই সিদ্ধান্ত নিতে হবে**। কয়েকটা আলাদা পরিস্থিতি, আলাদা জবাব।

**Ingest কানেকশন ছিঁড়ে গেল।** সবচেয়ে সাধারণ, আর সাধারণত স্ট্রিমারের নেটওয়ার্কের দোষ। সঠিক আচরণ: কানেকশন বন্ধ হওয়ামাত্র স্ট্রিম "শেষ" ঘোষণা করবেন না — একটা **grace window** (১০-৩০ সেকেন্ড) রাখুন যার মধ্যে একই stream key নিয়ে আবার যুক্ত হলে সেটাকে একই সেশন ধরা হবে। এই সময়টায় দর্শককে **slate** দেখান (একটা স্থির কার্ড, "সংযোগ ফিরে আসছে") — সেগমেন্ট বন্ধ করে দেবেন না, কারণ ধারা থেমে গেলে প্লেয়ার stall করে আর অনেক প্লেয়ার তারপর সেশন ছেড়ে দেয়।

**পুনঃসংযোগের পরে টাইমস্ট্যাম্প লাফ দেয়।** নতুন এনকোডার সেশন শূন্য থেকে বা অন্য কোনো মান থেকে টাইমস্ট্যাম্প শুরু করতে পারে, আর কোডেক প্যারামিটারও বদলাতে পারে। এখানে **`EXT-X-DISCONTINUITY`** (আর DASH-এ নতুন Period) দিতেই হবে। এটা না দিলে প্লেয়ার সেলাইয়ের জায়গাটা ডিকোড করতে গিয়ে হয় জমে যায়, নয়তো ভাঙা ছবি দেখায় — আর এই বাগটা ধরা কঠিন, কারণ শুধু পুনঃসংযোগের পরেই ঘটে।

**Redundant ingest।** গুরুত্বপূর্ণ ইভেন্টে এনকোডার একই স্ট্রিম দুটো আলাদা পথে (আলাদা ISP, আলাদা রিজিয়ন) পাঠায়। আপনার দিকে দুটোই গ্রহণ করে একটাকে "সক্রিয়" ধরা হয়, অন্যটা গরম-অপেক্ষায়। সক্রিয়টা থামলে সুইচ হয়। সুইচটা যাতে দর্শকের কাছে অদৃশ্য থাকে সেজন্য দুই এনকোডারকে **একই টাইমস্ট্যাম্প আর একই keyframe অবস্থান** ব্যবহার করতে হবে — নাহলে প্রতিটা failover-এ discontinuity লাগবে।

**ট্রান্সকোডার পড়ে গেল।** ট্রান্সকোডার stateful — তার হাতে GOP-র অবস্থা আর rate control-এর ইতিহাস আছে। তাই পুনরায় চালু হওয়া মানে অবধারিতভাবে discontinuity। ব্যবহারিক নকশা হলো **ladder-কে ভাগ করে চালানো** যাতে একটা প্রক্রিয়া পড়লে পুরো ladder না যায়, আর নতুন প্রক্রিয়া শুরু হওয়ার সময় manifest থেকে সেই rung-টা সাময়িকভাবে সরিয়ে দেওয়া (প্লেয়ার তখন অন্য rung-এ চলে যাবে, ভাঙবে না)।

**Origin পড়ে গেল।** LL-HLS-এ এটা বিশেষভাবে খারাপ, কারণ প্রতিটা দর্শকের একটা ঝুলন্ত রিকোয়েস্ট আছে — origin গেলে সবাই একসাথে ফিরে আসে। দুটো origin চালান, দুটোতেই একই সেগমেন্ট লিখুন, আর CDN-কে failover-এর জন্য কনফিগার করুন। সেগমেন্ট immutable বলে দুই origin-এর মধ্যে সমন্বয়ের কোনো প্রয়োজন নেই — কেবল manifest-এর টাইমিং কাছাকাছি রাখতে হবে।

<Callout type="warning">

লাইভে সবচেয়ে খারাপ ব্যর্থতা "ভেঙে পড়া" নয়, **নীরবে খালি থাকা**। ট্রান্সকোডার চলছে, সেগমেন্ট লেখা হচ্ছে, manifest আপডেট হচ্ছে — কিন্তু ছবিটা কালো, বা অডিও নেই, কারণ উৎসেই সমস্যা। কোনো টেকনিক্যাল metric এটা ধরে না। তাই **কনটেন্ট-সচেতন পরীক্ষা** দরকার: কালো ফ্রেম শনাক্তকরণ, নীরবতা শনাক্তকরণ, আর freeze শনাক্তকরণ — এগুলোই আসল দর্শক-প্রভাবী alert।

</Callout>

## চালু করার আগে যে সিদ্ধান্তগুলো নিতে হবে

- **আপনার latency লক্ষ্য কত, আর কেন?** "যত কম তত ভালো" কোনো লক্ষ্য নয়। টিভির সমান (৫-৮ সেকেন্ড), নাকি চ্যাটের সাথে সিঙ্ক (৩ সেকেন্ড), নাকি সত্যিকারের ইন্টারঅ্যাকশন (১ সেকেন্ডের নিচে)? প্রতিটার জন্য সম্পূর্ণ ভিন্ন আর্কিটেকচার।
- **বাড়তি rebuffer কতটা মেনে নেবেন?** কম latency মানে ছোট বাফার মানে বেশি rebuffer। সংখ্যাটা আগে থেকে ঠিক করে নিন, নাহলে চালু করার পরে তর্ক হবে।
- **আপনার origin কি ১০ হাজার ঝুলন্ত কানেকশন সামলাতে পারে?** LL-HLS চালুর আগে এটাই প্রথম লোড-টেস্ট।
- **CDN কি LL-HLS জানে?** blocking reload, chunked transfer pass-through, আর origin-এ রিকোয়েস্ট coalescing — তিনটাই দরকার। না থাকলে low-latency কাগজে থাকবে, বাস্তবে নয়।
- **ব্যর্থতার সময় দর্শক কী দেখবে?** slate, নাকি কালো পর্দা, নাকি error? এটা ইঞ্জিনিয়ারিং সিদ্ধান্ত নয়, প্রোডাক্ট সিদ্ধান্ত — কিন্তু ইঞ্জিনিয়ারিং না করলে ডিফল্টটা হয় সবচেয়ে খারাপ বিকল্প।

<div class="takeaways">

### মূল শেখা

- Glass-to-glass latency-র ৯০ ভাগের বেশি আসে দুটো জায়গা থেকে — সেগমেন্ট সম্পূর্ণ হওয়ার অপেক্ষা আর player buffer; নেটওয়ার্কের ভাগ প্রায় নগণ্য
- Partial segment latency আর keyframe খরচের দ্বন্দ্ব ভাঙে: GOP বড় থাকে, প্রকাশের একক ছোট হয়
- LL-HLS-এর তিনটা যন্ত্র — `EXT-X-PART`, blocking playlist reload, আর preload hint — বাজেটের তিনটা আলাদা লাইন আক্রমণ করে
- LL-DASH একই কাজ করে chunked CMAF + HTTP chunked transfer দিয়ে; `availabilityTimeOffset` হলো "অসমাপ্ত সেগমেন্ট চাওয়া যাবে" বলার উপায়
- লাইভ প্রান্তের কাছে স্থিতিশীল থাকতে প্লেয়ার সূক্ষ্মভাবে প্লেব্যাকের গতি বাড়ায়-কমায় — low-latency প্লেব্যাকের এটাই গোপন উপাদান
- SRT-র latency সীমাবদ্ধ থাকে, RTMP-র TCP বাফারে ল্যাগ জমতে থাকে — খারাপ নেটওয়ার্কে এই পার্থক্যটাই নির্ণায়ক
- লাইভ ট্রান্সকোডিং ১.০x-এর উপরে থাকতেই হবে; encode speed ratio একটা প্রথম শ্রেণির alert, ল্যাগের সংখ্যা নয়
- WebRTC সাব-সেকেন্ড দেয় কিন্তু ক্যাশিংয়ের সব সুবিধা কেড়ে নেয় — খরচ দর্শকসংখ্যার সাথে সরলরৈখিক
- কম latency মানে কম বাফার মানে ভুলের জন্য কম জায়গা; বেশি rebuffer মেনে নিতে না পারলে আসলে কম latency চাওয়া হচ্ছে না
- পুনঃসংযোগ বা failover-এ discontinuity ঘোষণা করুন, আর কালো ফ্রেম/নীরবতা শনাক্ত করুন — নীরব ব্যর্থতাই সবচেয়ে ব্যয়বহুল

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Twitch** RTMP ingest আর ~২-৫ সেকেন্ড latency-তে চলে, কারণ চ্যাট আর স্ট্রিমারের প্রতিক্রিয়া কাছাকাছি সময়ে থাকতে হয়
- **Apple-এর LL-HLS** এখন iOS ও tvOS-এ নেটিভভাবে সমর্থিত, আর বেশিরভাগ বড় প্ল্যাটফর্মের কম-latency পথ এটাই
- **খেলার সম্প্রচারকরা** সাধারণত ৫-৮ সেকেন্ডে থিতু হয় — সোশ্যাল মিডিয়ায় গোলের খবরের আগে ছবি পৌঁছানোই যথেষ্ট, সাব-সেকেন্ড দরকার নেই
- **নিলাম ও বেটিং প্ল্যাটফর্ম** WebRTC ব্যবহার করে, কারণ সেখানে দেরি মানে সরাসরি আর্থিক অন্যায্যতা
- **সম্প্রচার contribution feed** (মাঠ থেকে স্টুডিওতে) SRT বা RIST-এ যায়, কারণ পাবলিক ইন্টারনেটে নিয়ন্ত্রিত latency-সহ নির্ভরযোগ্যতা ওখানেই মেলে

</div>
