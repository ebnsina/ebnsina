---
title: 'Bitrate ladder'
subtitle: 'একটা ফাইল কেন সবার জন্য যথেষ্ট নয়, rendition ladder কীভাবে ডিজাইন করবেন, fixed ladder-এর অপচয়, per-title encoding আর convex hull, আর keyframe alignment ছাড়া কেন পুরো ladder অকেজো।'
chapter: 5
level: 'intermediate'
readingTime: '২২ মিনিট'
topics:
  [
    'bitrate ladder',
    'renditions',
    'per-title encoding',
    'convex hull',
    'keyframe alignment',
    'bits per pixel'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

আগের চ্যাপ্টারে আপনি একটা transcoding pipeline দাঁড় করিয়েছেন — সোর্স ফাইল ঢুকছে, decode হচ্ছে, filter হচ্ছে, encode হয়ে বেরোচ্ছে। কিন্তু ওখানে একটা প্রশ্ন ইচ্ছে করেই ঝুলিয়ে রাখা হয়েছিল: **encoder-কে ঠিক কোন সেটিংসে চালাবেন?** 1080p না 480p? 5 Mbps না 800 kbps?

উত্তরটা হলো — সবগুলোই। একটাই সোর্স থেকে আপনি একাধিক আউটপুট বানাবেন, প্রতিটা আলাদা resolution আর bitrate-এ, আর player চলার সময় নিজে বেছে নেবে কোনটা এই মুহূর্তে চালানো সম্ভব। এই আউটপুটগুলোর প্রতিটাকে বলে **rendition**, আর পুরো সেটটাকে বলে **bitrate ladder**।

এই চ্যাপ্টার ladder ডিজাইনের চ্যাপ্টার। আর ladder ডিজাইনের সবচেয়ে গুরুত্বপূর্ণ কথাটা হলো — ladder কোনো স্থির টেবিল নয়। একটা টেবিল কপি করে সব কনটেন্টে বসিয়ে দিলে সেটা কাজ করবে, কিন্তু আপনি একই সাথে ব্যান্ডউইথ নষ্ট করবেন আর কিছু দর্শককে দরকারের চেয়ে খারাপ ছবি দেখাবেন। কেন — সেটাই এই চ্যাপ্টারের মূল বিষয়।

## গল্পে বুঝি

ফেজ শহরের কারুয়িন মহল্লায় ফাতিমা আল-ফিহরির একটা দর্জির দোকান। শুরুর দিকে অর্ডার আসত একটা করে — একজন খদ্দের আসত, ফাতিমা তার মাপ নিতেন, কাপড় কেটে জামা বানিয়ে দিতেন। মাপ নিখুঁত, খদ্দের খুশি।

তারপর একদিন বাগদাদের এক বণিক এসে বললেন — "আমার কাফেলার দুইশো লোকের জন্য একই নকশার জোব্বা চাই, আগামী মাসে।" ফাতিমা দুইশো জনের মাপ নিতে পারবেন না; তারা কেউ শহরেই নেই। তাই তিনি অন্য পথ ধরলেন: একই নকশা তিনটে মাপে কাটলেন — ছোট, মাঝারি, বড়। কাফেলার লোক এসে যার যেটা লাগে নিয়ে যাবে। **এক নকশা, কয়েকটা মাপ** — এটাই ladder-এর মূল ভাবনা। ফাতিমা জানেন না কে আসবে, তাই তিনি সবার জন্য একটা বানান না, বরং কয়েকটা বানিয়ে রাখেন যাতে যে-ই আসুক তার কাছাকাছি একটা পায়।

কিন্তু কয়টা মাপ? ফাতিমা প্রথমে ভেবেছিলেন দুটোই যথেষ্ট — ছোট আর বড়। ফল হলো ভয়াবহ: মাঝারি গড়নের লোকগুলো হয় ঢোলা জোব্বায় হারিয়ে গেল, নয়তো টান-টান জামায় হাঁসফাঁস করল। তারপর তিনি উল্টো দিকে গেলেন — এগারোটা মাপ কাটলেন, প্রতিটার মধ্যে আধ ইঞ্চির ফারাক। এবার ফিট চমৎকার, কিন্তু কাপড় কাটতে কাটতে মাস পেরিয়ে গেল, গুদাম ভরে গেল, আর খদ্দের দোকানে ঢুকে এগারোটা মাপের মধ্যে কোনটা নেবে বুঝতেই পারল না। **অনেক বেশি মাপ মানে অনেক বেশি খরচ, অথচ ফিটের উন্নতি সামান্য।** শেষে তিনি পাঁচটায় থামলেন, আর মাপগুলো এমনভাবে বসালেন যে পাশাপাশি দুটোর মধ্যে ফারাকটা চোখে পড়ার মতো — কিন্তু এতটা নয় যে মাঝখানে পড়া লোক কষ্ট পায়।

এরপর এল আসল শিক্ষা। পরের বছর দুটো অর্ডার একসাথে এল। একটা সাদামাটা সুতির জোব্বা — সোজা কাট, কোনো নকশা নেই। আরেকটা সমরকন্দের বিয়ের পোশাক — জরির কাজ, ভাঁজ, কারুকাজ করা হাতা। ফাতিমার সহকারী একই কাপড়ের হিসাব দুটোতেই বসিয়ে দিয়েছিল: প্রতিটা মাপে সাড়ে চার গজ। সাদা জোব্বায় সাড়ে চার গজে অর্ধেক কাপড় কেটে ফেলে দিতে হলো — সোজা কাপড়ে অত লাগেই না। আর বিয়ের পোশাকে সাড়ে চার গজে ভাঁজগুলো ফোটেনি, জরির কাজ অসম্পূর্ণ রয়ে গেল। **একই হিসাব দুই রকম কাজে বসালে একদিকে অপচয়, আরেকদিকে ঘাটতি।** ফাতিমা তখন নিয়ম বদলালেন — কাপড়ের হিসাব আর নকশার কঠিনতা দেখে ঠিক হবে, আগে থেকে লেখা টেবিল দেখে নয়। সাদা জোব্বায় মাপপ্রতি তিন গজ, বিয়ের পোশাকে ছয়।

আর সবশেষে একটা জিনিস, যেটা ভুল হলে বাকি সবকিছু অর্থহীন। কাফেলার লোকেরা মাঝপথে জামা বদলায় — সকালের রোদে হালকা মাপ, রাতের ঠান্ডায় ভারী। তাই ফাতিমা প্রতিটা মাপে **একই জায়গায় সেলাইয়ের গাঁট** রেখেছিলেন — কাঁধে, কোমরে, হাঁটুতে, ঠিক একই বিন্দুতে। ফলে যে কেউ যেকোনো গাঁটে গিয়ে এক মাপ থেকে আরেক মাপে বদলাতে পারে, জোড়টা মিলে যায়। একবার এক শিক্ষানবিশ একটা মাপে গাঁটগুলো একটু সরিয়ে বসিয়েছিল — অল্প, দুই আঙুল। ফল: ওই মাপ থেকে অন্য কোনো মাপে যাওয়া গেল না, বদলাতে গেলেই সেলাই ছিঁড়ে যায়। গোটা সেট বাতিল করে আবার কাটতে হলো।

মিলিয়ে নিই: এক নকশার কয়েকটা মাপ হলো **bitrate ladder**, প্রতিটা মাপ হলো একটা **rendition**, খদ্দেরের গড়ন হলো দর্শকের **available bandwidth**, দুটো মাপের মাঝের ফারাক হলো **rung spacing**, এগারো মাপের অপচয় হলো **অতিরিক্ত rung-এর storage আর encoding খরচ**, সব কনটেন্টে একই কাপড়ের হিসাব বসানো হলো **fixed ladder**, নকশার কঠিনতা দেখে হিসাব বদলানো হলো **per-title encoding**, সাদা জোব্বা বনাম বিয়ের পোশাক হলো **easy বনাম complex content**, আর প্রতিটা মাপে একই জায়গায় সেলাইয়ের গাঁট হলো **aligned keyframe** — যেটা ছাড়া দর্শক এক rendition থেকে আরেকটায় সরতেই পারে না।

## এক ফাইল কেন সবার জন্য যথেষ্ট নয়

ধরুন আপনি সিদ্ধান্ত নিলেন — সবাইকে একটাই ফাইল দেবেন, 1080p, 5 Mbps। খুব সরল, খুব সস্তা। তারপর বাস্তব দর্শকদের দিকে তাকান:

| দর্শক                                  | কার্যকর bandwidth | 5 Mbps ফাইলে কী হয়                                     |
| -------------------------------------- | ----------------- | ------------------------------------------------------- |
| ফাইবার কানেকশন, ডেস্কটপ                | 200 Mbps          | চলে, কিন্তু তার স্ক্রিন আরও ভালো ছবি নিতে পারত          |
| অফিসের শেয়ার্ড ওয়াইফাই               | 8 Mbps            | চলে, কিন্তু margin নেই — একটা hiccup-এই buffering       |
| মোবাইল 4G, ভালো সিগনাল                 | 6 Mbps            | ঠিক প্রান্তে, ট্রেন টানেলে ঢুকলেই থেমে যায়             |
| মোবাইল 3G বা ভিড়ের সময়ের সেল টাওয়ার | 1.2 Mbps          | কখনোই চলবে না — অনন্ত buffering                         |
| ৫ ইঞ্চি ফোন, ভালো নেটওয়ার্ক           | 50 Mbps           | চলে, কিন্তু 1080p-র বেশিরভাগ পিক্সেল ওই স্ক্রিনে অদৃশ্য |

দুই দিক থেকেই ক্ষতি। নিচের দিকে দর্শক ভিডিও দেখতেই পারছে না। উপরের দিকে আপনি হয় মান কম দিচ্ছেন, নয় অকারণে বাইট পাঠাচ্ছেন। আর মাঝখানে সবচেয়ে বাজে অবস্থা — যেখানে কোনোভাবে চলে, কিন্তু নেটওয়ার্কের সামান্য ওঠানামাতেই থেমে যায়।

এখানে একটা সংখ্যা মনে রাখা দরকার, কারণ পুরো ইন্ডাস্ট্রি এটার উপর দাঁড়িয়ে: **দর্শক যত না কম রেজোলিউশন ঘৃণা করে, তার চেয়ে অনেক বেশি ঘৃণা করে buffering।** যে দর্শক ৭২০p-তে নির্বিঘ্নে দেখতে পারত, তাকে 1080p দিয়ে তিনবার থামানো মানে তাকে হারানো। তাই ladder-এর মূল উদ্দেশ্য "সবচেয়ে ভালো ছবি" নয় — **প্রতিটা দর্শককে তার নেটওয়ার্ক যতটুকু নিরাপদে বইতে পারে, ততটুকুর সবচেয়ে ভালো ছবি**।

<Callout type="info">

Ladder থাকা মানেই adaptive streaming নয়। Ladder হলো সোর্স-সাইডের প্রস্তুতি — কয়েকটা rendition বানিয়ে রাখা। সেগুলো থেকে player কীভাবে চলতে চলতে বেছে নেয়, সেটাই ABR, আর সেটা চ্যাপ্টার ৭-এর বিষয়। এই চ্যাপ্টারে আমরা শুধু ঠিক করছি — কী কী বানাব, আর কেন ঠিক ওগুলোই।

</Callout>

## Ladder-এর গঠন: resolution আর bitrate-এর জোড়া

একটা rendition মূলত তিনটে সংখ্যার সমষ্টি: resolution, target bitrate, আর codec profile/level। একটা সাধারণ H.264 ladder দেখতে এরকম:

| Rung | Resolution | Bitrate   | Profile  | কাকে লক্ষ্য করে                   |
| ---- | ---------- | --------- | -------- | --------------------------------- |
| 1    | 416x234    | 200 kbps  | baseline | খুব দুর্বল মোবাইল নেটওয়ার্ক      |
| 2    | 640x360    | 500 kbps  | main     | 3G, ভিড়ের সময়ের সেল টাওয়ার     |
| 3    | 768x432    | 900 kbps  | main     | দুর্বল 4G                         |
| 4    | 960x540    | 1600 kbps | main     | সাধারণ মোবাইল, দুর্বল ব্রডব্যান্ড |
| 5    | 1280x720   | 3000 kbps | main     | সাধারণ ব্রডব্যান্ড, ট্যাবলেট      |
| 6    | 1920x1080  | 5000 kbps | high     | ভালো ব্রডব্যান্ড, টিভি            |
| 7    | 1920x1080  | 7500 kbps | high     | ফাইবার, বড় স্ক্রিন               |

এখানে দুটো জিনিস লক্ষ করার মতো। এক, resolution আর bitrate সবসময় একসাথে বাড়ে — কারণ বেশি পিক্সেল বেশি বিট চায়। দুই, উপরের দুটো rung-এ resolution একই কিন্তু bitrate আলাদা — একই 1080p, দুই মানে।

### কেন ঠিক ওই জোড়াগুলোই: bits per pixel

Resolution-bitrate জোড়া বাছার পেছনের হিসাবটা একটা সংখ্যায় ধরা যায় — **bits per pixel per frame**, সংক্ষেপে BPP:

```text
BPP = bitrate / (width x height x fps)

720p @ 3000 kbps, 30fps:
  3_000_000 / (1280 x 720 x 30) = 0.108 bpp

1080p @ 5000 kbps, 30fps:
  5_000_000 / (1920 x 1080 x 30) = 0.080 bpp

360p @ 500 kbps, 30fps:
  500_000 / (640 x 360 x 30) = 0.072 bpp
```

H.264-এ সাধারণ ক্যামেরা-ধারণ করা কনটেন্টে ব্যবহারযোগ্য BPP মোটামুটি **0.05 থেকে 0.15**-এর মধ্যে থাকে। এর নিচে নামলে blocking আর mosquito noise স্পষ্ট হয়ে ওঠে; এর উপরে উঠলে দর্শক পার্থক্য প্রায় দেখতেই পায় না, শুধু বাইট বাড়ে।

এই সংখ্যাটা থেকেই ladder ডিজাইনের সবচেয়ে দরকারি নিয়মটা বেরোয়:

<Callout type="tip">

**Bitrate কমাতে হলে resolution-ও কমান।** 1080p-কে 800 kbps-এ চাপালে BPP দাঁড়ায় 0.013 — encoder তখন পুরো ফ্রেমজুড়ে বড় বড় ব্লক আর ধোঁয়াটে টেক্সচার বানাতে বাধ্য হয়। সেই একই 800 kbps-এ 480p এনকোড করলে BPP হয় 0.065, ছবি পরিষ্কার, আর player সেটাকে স্ক্রিনে বড় করে দেখালে ফলাফল **চাপা-দেওয়া 1080p-র চেয়ে ভালো দেখায়**। কম পিক্সেল কিন্তু পরিষ্কার, সবসময় বেশি পিক্সেল কিন্তু ভাঙা-র চেয়ে ভালো।

</Callout>

### Rung-এর মধ্যে দূরত্ব

পাশাপাশি দুটো rung-এর bitrate অনুপাত সাধারণত **1.5x থেকে 2x** রাখা হয়। কারণ দুটো:

- **খুব কাছাকাছি হলে (1.2x)** — দর্শক দুটোর পার্থক্য দেখতেই পাবে না, অথচ আপনি একটা বাড়তি rendition-এর encoding আর storage খরচ দিচ্ছেন। আর player-ও দুটোর মধ্যে অকারণে ওঠানামা করবে।
- **খুব দূরে হলে (3x)** — নেটওয়ার্ক একটু খারাপ হলে player-কে এক লাফে অনেক নিচে নামতে হয়, দর্শক হঠাৎ ঝাপসা ছবি দেখে। আবার নেটওয়ার্ক ভালো হলেও উপরে উঠতে সাহস পায় না, কারণ পরের ধাপটা অনেক দামি।

`ladder[n+1] / ladder[n] ≈ 1.6` মোটামুটি একটা ভালো ডিফল্ট।

## Fixed ladder আর তার অপচয়

উপরের টেবিলটা একটা **fixed ladder** — সব কনটেন্টে একই। এটা জনপ্রিয়, কারণ সরল: একটা কনফিগ, একটা preset, প্রতিটা আপলোডে একই কাজ। কিন্তু এটা একটা নীরব ধারণার উপর দাঁড়িয়ে আছে — **সব ভিডিও এনকোড করতে সমান কষ্ট**। এটা সত্যি নয়, এমনকি কাছাকাছিও নয়।

দুটো ভিডিও ভাবুন, দুটোই ১০ মিনিট, দুটোই 1080p30:

- **A** — ইবনে সিনার একটা লেকচার রেকর্ডিং। স্থির ক্যামেরা, স্থির ব্যাকগ্রাউন্ড, একজন মানুষ কথা বলছেন। ফ্রেমের ৯৫% অংশ পরের ফ্রেমে হুবহু একই। motion estimation-এর কাজ প্রায় নেই।
- **B** — সমরকন্দের একটা ঘোড়দৌড়। দ্রুত প্যানিং ক্যামেরা, ধুলো, ঘাসের টেক্সচার, দর্শকের ভিড়, প্রতি সেকেন্ডে কাট। প্রতিটা ফ্রেম কার্যত নতুন।

এখন ধরুন ladder বলছে 1080p rung-এ 5000 kbps:

- ভিডিও A এই bitrate-এ কার্যত **transparent** — সোর্সের সাথে পার্থক্য চোখে ধরা যায় না। এটা 1800 kbps-এও প্রায় একই দেখাত। মানে আপনি প্রতিটা দর্শকের প্রতি সেকেন্ডে **তিন গুণ বেশি বাইট** পাঠাচ্ছেন, কোনো লাভ ছাড়াই। CDN বিল সরাসরি তিন গুণ।
- ভিডিও B এই bitrate-এ **স্পষ্টভাবে খারাপ** — দ্রুত মুভমেন্টে ব্লক ভেঙে যাচ্ছে, ঘাসের টেক্সচার ধুয়ে গেছে। এর 8000 kbps দরকার ছিল।

একই ladder, একটায় ৩x অপচয়, আরেকটায় দৃশ্যমান ঘাটতি। আর এটা প্রান্তিক কোনো ঘটনা নয় — যেকোনো সাধারণ ভিডিও লাইব্রেরিতে কনটেন্টের কঠিনতা সহজেই **৫-৬ গুণ** পর্যন্ত ভিন্ন হয়।

<Callout type="warning">

Fixed ladder-এর অপচয়টা invisible, কারণ কিছুই "ভাঙে" না। ভিডিও চলে, দর্শক অভিযোগ করে না, ড্যাশবোর্ড সবুজ। শুধু প্রতি মাসে CDN-এর বিলটা যা হওয়া উচিত ছিল তার দ্বিগুণ আসে, আর কেউ সেটার সাথে encoding সিদ্ধান্তের সম্পর্ক খুঁজে বের করে না। এটাই স্ট্রিমিং প্ল্যাটফর্মের সবচেয়ে বড় নীরব খরচ।

</Callout>

## Per-title encoding আর convex hull

সমাধানটা ধারণাগতভাবে সহজ: **প্রতিটা টাইটেলের জন্য ladder আলাদা করে হিসাব করুন।** ২০১৫-১৬ সালে Netflix এটাকে জনপ্রিয় করে, নাম দেয় per-title encoding। পরে আরও সূক্ষ্ম রূপ এসেছে — per-shot, per-scene — কিন্তু ভাবনাটা এক।

### আসল প্রশ্নটা কী

প্রতিটা (resolution, bitrate) জোড়ার একটা মান আছে, যেটা আমরা কোনো objective metric দিয়ে মাপতে পারি — সাধারণত **VMAF** (Netflix-এর তৈরি perceptual quality metric, 0–100), অথবা PSNR/SSIM। এখন একটা নির্দিষ্ট bitrate-এ, ধরুন 1500 kbps, প্রশ্ন হলো: **কোন resolution-এ এনকোড করলে সবচেয়ে ভালো VMAF পাব?**

উত্তরটা সবসময় "সবচেয়ে বড় resolution" নয়। কম bitrate-এ 1080p ভয়ানক দেখায় (BPP খুব কম), 540p পরিষ্কার দেখায়। কিন্তু bitrate বাড়াতে থাকলে একটা বিন্দুতে গিয়ে 540p আর উন্নতি করে না — সে তার সীমায় পৌঁছে গেছে, বাড়তি বিট দিয়ে সে আর কিছু করতে পারছে না — আর ওখান থেকে 720p এগিয়ে যায়। তারপর আরেকটা বিন্দুতে 1080p 720p-কে ছাড়িয়ে যায়।

### Convex hull

প্রতিটা resolution-এর জন্য যদি bitrate বনাম quality-র একটা curve আঁকেন, আপনি কয়েকটা curve পাবেন যারা একে অন্যকে কেটে যায়। প্রতিটা bitrate-এ **সবচেয়ে উপরের curve**-টাই সেখানে সঠিক resolution। এই "সবার উপরের অংশ"গুলো জোড়া দিলে যে বাইরের সীমারেখাটা পাওয়া যায়, সেটাই **convex hull** — এবং আপনার ladder-এর প্রতিটা rung ওই hull-এর উপর বসা উচিত।

<Mermaid
title="Convex hull: which resolution wins at which bitrate"
code={`graph LR
  B1["300 kbps"] --> R1["360p wins<br/>1080p would be unwatchable"]
  B2["900 kbps"] --> R2["480p wins<br/>360p has saturated"]
  B3["1800 kbps"] --> R3["720p wins<br/>480p has saturated"]
  B4["3500 kbps"] --> R4["1080p wins<br/>720p has saturated"]
  R1 --> H["Convex hull<br/>= the ladder"]
  R2 --> H
  R3 --> H
  R4 --> H`}
/>

গল্পের ভাষায়: convex hull হলো ফাতিমার সেই আবিষ্কার যে কত গজ কাপড় লাগবে সেটা নকশার কঠিনতা থেকে বেরোয়, আগে থেকে লেখা টেবিল থেকে নয়। সহজ কনটেন্টের hull বাঁ দিকে সরে যায় (কম bitrate-এই উঁচু resolution জিতে যায়), কঠিন কনটেন্টের hull ডান দিকে সরে (উঁচু resolution-এ যেতে অনেক বেশি bitrate লাগে)।

### বাস্তবে কীভাবে হিসাব করবেন

সবচেয়ে নিখুঁত পদ্ধতি — প্রতিটা (resolution, CRF) জোড়ায় সত্যিই এনকোড করে VMAF মাপা — খুব দামি। একটা টাইটেলে ৫টা resolution × ৮টা CRF = ৪০টা পূর্ণ এনকোড, তারপর ৪০ বার VMAF হিসাব। বাস্তবে তিনটে স্তরের সমাধান ব্যবহার হয়:

**১. Complexity probe (সবচেয়ে সস্তা, সবচেয়ে বেশি ব্যবহৃত)।** সোর্স থেকে কয়েকটা প্রতিনিধিত্বমূলক অংশ নিয়ে (যেমন ৬টা ১০-সেকেন্ডের টুকরো, পুরো ভিডিওজুড়ে ছড়ানো) একটা fixed-CRF এনকোড চালান। ফলাফলের bitrate-টাই কনটেন্টের কঠিনতার সরাসরি পরিমাপ — CRF মান ধরে রাখা মানে quality ধরে রাখা, তাই যত bits লাগল ততটাই কঠিন। তারপর সেই কঠিনতা দিয়ে base ladder-কে scale করুন।

**২. আংশিক hull।** কয়েকটা resolution × কয়েকটা CRF-এ শুধু probe অংশগুলো এনকোড করে VMAF মাপুন, তারপর curve গুলো interpolate করে hull বের করুন। খরচ মাঝারি, ফল বেশ ভালো।

**৩. পূর্ণ per-shot optimisation।** ভিডিওকে shot-এ ভেঙে প্রতিটা shot-এর জন্য আলাদা hull। সবচেয়ে ভালো ফল, সবচেয়ে বেশি খরচ, আর packaging জটিল হয়। বড় স্ট্রিমিং সার্ভিস ছাড়া এটা যুক্তিসঙ্গত নয়।

<Callout type="tip">

শুরু করুন পদ্ধতি ১ দিয়ে। শুধু complexity probe দিয়ে ladder scale করলেই সাধারণত মোট ব্যান্ডউইথে **২০–৩০% সাশ্রয়** পাওয়া যায়, আর ইমপ্লিমেন্টেশন এক সপ্তাহের কাজ। পূর্ণ convex hull আরও ৫–১০% দেয়, কিন্তু খরচ আর জটিলতা দশ গুণ। সস্তা কাজটা আগে করুন — এই ট্র্যাকের প্রতিটা চ্যাপ্টারেই এই কথাটা ফিরে আসবে।

</Callout>

## কয়টা rung যথেষ্ট

ফাতিমার এগারো মাপের ভুলটা এখানে সংখ্যায় আসে। প্রতিটা বাড়তি rung-এর দাম:

- **Encoding খরচ** — CPU সময়, সরাসরি লিনিয়ার। ৭ rung মানে ৭ বার এনকোড।
- **Storage খরচ** — প্রতিটা rendition আলাদা করে থাকে, চিরকাল।
- **Origin আর CDN cache চাপ** — একই কনটেন্টের বেশি ভ্যারিয়েন্ট মানে প্রতিটার cache hit rate কম। এটা প্রায়ই উপেক্ষা করা হয়, অথচ জনপ্রিয় কনটেন্টে এটাই সবচেয়ে বড় প্রভাব।
- **Player-এর সিদ্ধান্তের গোলমাল** — খুব কাছাকাছি rung থাকলে ABR অকারণে ওঠানামা করে।

আর লাভ? প্রতিটা বাড়তি rung শুধু ততটুকুই দেয় যতটুকু bandwidth-এর সেই সংকীর্ণ ব্যান্ডে দর্শক আছে।

ব্যবহারিক নির্দেশনা:

| পরিস্থিতি                                       | rung সংখ্যা | কারণ                                                          |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------- |
| শুধু ডেস্কটপ, নিয়ন্ত্রিত নেটওয়ার্ক (intranet) | 2–3         | bandwidth-এর বৈচিত্র্য কম                                     |
| সাধারণ ওয়েব VOD                                | 5–6         | মোবাইল থেকে ফাইবার — পুরো পরিসর কভার করতে হয়                 |
| বৈশ্বিক দর্শক, উন্নয়নশীল বাজারসহ               | 6–8         | নিচের দিকে আরও rung দরকার, কারণ ওখানেই বেশিরভাগ দর্শক         |
| Live স্ট্রিমিং                                  | 3–5         | কম, কারণ প্রতিটা rung real-time-এ এনকোড করতে হয় — CPU-ই সীমা |
| 4K সহ premium VOD                               | 7–9         | উপরে আরও দুটো rung, তবে সেগুলো অল্প দর্শকের জন্য              |

<Callout type="info">

নিচের rung গুলো বাদ দেওয়ার প্রলোভন কড়াভাবে প্রতিরোধ করুন। "আমাদের দর্শকদের তো ভালো নেট আছে" — এই ধারণা ড্যাশবোর্ড থেকেই আসে, আর ড্যাশবোর্ডে শুধু তারাই আছে যারা **সফলভাবে ভিডিও চালাতে পেরেছে**। যাদের নেট 400 kbps, তারা আপনার সবচেয়ে নিচু rung 800 kbps হলে ভিডিও চালাতেই পারে না, তাই তারা অ্যানালিটিক্সেও নেই। survivorship bias-এর সবচেয়ে দামি রূপ।

</Callout>

## Audio: ladder জুড়ে একবারই

চ্যাপ্টার ১-এ দেখেছেন, স্টেরিও অডিও ভিডিওর তুলনায় প্রায় হাজার ভাগের এক ভাগ। 128 kbps AAC আর 5000 kbps ভিডিও পাশাপাশি রাখলে অডিও মোট বাইটের ২.৫%। তাই:

**প্রতিটা rung-এর জন্য আলাদা অডিও এনকোড করবেন না।** একবার এনকোড করুন, আর সব rendition ওই একই অডিও ব্যবহার করুক। এটা শুধু খরচ বাঁচায় না — packaging-ও সরল করে, কারণ ভিডিও rendition বদলালে অডিও stream অবিচ্ছিন্ন থাকতে পারে।

সাধারণ অভ্যাস:

- **এক অডিও rendition** — 128 kbps AAC-LC stereo, 48 kHz। ৯০% ক্ষেত্রে এটাই যথেষ্ট।
- **দুটো, যদি খুব নিচু rung থাকে** — 64 kbps HE-AAC শুধু সবচেয়ে নিচের এক-দুটো ভিডিও rung-এর সাথে। কারণ 200 kbps মোট বাজেটে 128 kbps অডিও ভিডিওর ঘাড়ে বসে যায়।
- **আলাদা, যদি সত্যিই দরকার** — 5.1 surround বা Dolby Atmos, শুধু premium rung-এ।

<Callout type="warning">

অডিও নিয়ে যে বাগগুলো আসে সেগুলো প্রায় কখনোই bitrate-এর নয়, **timing**-এর। rendition বদলানোর সময় অডিও-ভিডিও সিঙ্ক নষ্ট হওয়া, বা ladder-এর দুটো rendition-এ অডিওর segment boundary আলাদা জায়গায় পড়া — এগুলোই আসল সমস্যা। ladder জুড়ে একটাই অডিও রাখলে এই শ্রেণির বাগ পুরোপুরি বাদ যায়, যা নিজেই যথেষ্ট কারণ।

</Callout>

## Keyframe alignment — যেটা ছাড়া পুরো ladder অকেজো

এটাই এই চ্যাপ্টারের সবচেয়ে গুরুত্বপূর্ণ অপারেশনাল নিয়ম, আর সবচেয়ে বেশি ভাঙা নিয়ম।

চ্যাপ্টার ২-তে দেখেছেন — একটা encoded stream-এ কিছু ফ্রেম **keyframe** (I-frame / IDR), যেগুলো নিজে থেকেই সম্পূর্ণ, আগের কোনো ফ্রেমের উপর নির্ভর করে না। বাকি ফ্রেমগুলো (P, B) আগের/পরের ফ্রেম থেকে predict করা হয়। মানে **decoder একটা stream-এ শুধু keyframe থেকেই ঢুকতে পারে।**

এখন ভাবুন player 720p থেকে 1080p-তে যেতে চায়, ভিডিওর ১২.৪ সেকেন্ড অবস্থানে। সে 1080p rendition থেকে ওই অবস্থানের segment টা নামায় আর decoder-এ দেয়। যদি ওই segment-এর শুরুতে keyframe না থাকে, decoder-এর হাতে এমন P-frame এসে পড়ে যারা এমন ফ্রেমের উপর নির্ভর করে যা সে কখনো দেখেনি। ফলাফল — সবুজ-গোলাপি ব্লকের বিকৃতি, অথবা কয়েক সেকেন্ড কালো, অথবা decoder error।

তাই নিয়ম:

<Callout type="warning">

**ladder-এর প্রতিটা rendition-এ keyframe ঠিক একই টাইমস্ট্যাম্পে বসতে হবে, এবং প্রতিটা segment একটা keyframe দিয়ে শুরু হতে হবে।** এটা "ভালো হলে ভালো" নয় — এটা না মানলে rendition বদল কাজ করবে না, আর সেটাই ladder-এর একমাত্র উদ্দেশ্য ছিল।

</Callout>

### ভাঙে কীভাবে

- **Scene-change detection চালু রেখে।** Encoder ডিফল্টভাবে দৃশ্য বদলালে সেখানে keyframe বসায় — যেটা quality-র জন্য চমৎকার, কিন্তু প্রতিটা rendition একটু ভিন্ন সিদ্ধান্ত নিলে alignment ভেঙে যায়। ladder এনকোডে **হয় scene-cut বন্ধ করুন, নয় প্রতিটা rendition-কে একই cut list দিন**।
- **rendition-প্রতি ভিন্ন GOP length।** কেউ ভাবে নিচু rung-এ ছোট GOP দিলে ভালো, উঁচুতে বড়। এতে কিছু keyframe মিলবে, বেশিরভাগ মিলবে না।
- **ভিন্ন frame rate।** নিচু rung-কে 30fps থেকে 15fps-এ নামানো একটা সাধারণ কৌশল, কিন্তু তখন GOP-কে ফ্রেম সংখ্যায় নয়, **সময়ে** ভাবতে হবে — 15fps-এ 2 সেকেন্ড মানে ৩০ ফ্রেম, 30fps-এ ৬০ ফ্রেম।
- **VFR সোর্স।** ফ্রেমের সময় অনিয়মিত হলে ফ্রেম-গোনা GOP অসম সময়ে পড়ে। চ্যাপ্টার ১-এর নির্দেশ মেনে ingest-এই CFR-এ normalise করুন।

### সঠিক সেটআপ

একটা fixed GOP ঠিক করুন, সেকেন্ডে — সাধারণত ২ সেকেন্ড — আর সেটা segment duration-এর সাথে মেলান (বা তার ভগ্নাংশ রাখুন)। তারপর প্রতিটা rendition-এ একই সেটিং।

```bash
# The three flags that matter, identical on every rendition:
#   -g            GOP length in frames (2s x fps)
#   -keyint_min   forbid the encoder from placing keyframes early
#   -sc_threshold disable scene-cut keyframe insertion

ffmpeg -i ibn-sina-lecture.mp4 \
  -c:v libx264 -preset medium \
  -g 60 -keyint_min 60 -sc_threshold 0 \
  -force_key_frames "expr:gte(t,n_forced*2)" \
  -s 1280x720 -b:v 3000k -maxrate 3300k -bufsize 6000k \
  -c:a aac -b:a 128k -ar 48000 \
  out-720p.mp4
```

`-force_key_frames "expr:gte(t,n_forced*2)"` লাইনটাই সবচেয়ে নির্ভরযোগ্য — এটা ফ্রেম সংখ্যা নয়, **সময়** ধরে keyframe বসায়, তাই ভিন্ন frame rate-এর rendition গুলোতেও একই টাইমস্ট্যাম্পে পড়ে।

<Mermaid
title="Aligned keyframes make rendition switching possible"
code={`graph TD
  subgraph T["Timeline, keyframe every 2s"]
    A["0s"] --> B["2s"] --> C["4s"] --> D["6s"]
  end
  subgraph L["1080p rendition"]
    L1["IDR"] --> L2["IDR"] --> L3["IDR"] --> L4["IDR"]
  end
  subgraph M["720p rendition"]
    M1["IDR"] --> M2["IDR"] --> M3["IDR"] --> M4["IDR"]
  end
  subgraph S["480p rendition"]
    S1["IDR"] --> S2["IDR"] --> S3["IDR"] --> S4["IDR"]
  end
  C -.->|"player may switch here<br/>on any rendition"| M3`}
/>

### যাচাই করবেন কীভাবে

alignment ঠিক আছে কি না, সেটা অনুমান করবেন না — মাপুন। প্রতিটা rendition-এ keyframe-এর টাইমস্ট্যাম্পের তালিকা বের করে মিলিয়ে দেখুন:

```bash
# List keyframe timestamps for one rendition
ffprobe -v error -select_streams v:0 \
  -show_entries frame=pts_time,key_frame \
  -of csv=p=0 out-720p.mp4 \
  | awk -F, '$2 == 1 { print $1 }' > kf-720p.txt

# Do the same for every rung, then diff them. Any difference is a bug.
diff kf-720p.txt kf-1080p.txt
```

এই যাচাইটা আপনার encoding pipeline-এর CI-তে থাকা উচিত। এটা এমন একটা বাগ যা একবার প্রোডাকশনে গেলে ধরা পড়ে দর্শকের "মাঝে মাঝে স্ক্রিন সবুজ হয়ে যায়" অভিযোগ থেকে — যেটা ডিবাগ করা যন্ত্রণাদায়ক।

## একটা per-title ladder generator

নিচের ইমপ্লিমেন্টেশনে এই চ্যাপ্টারের সবকিছু একসাথে: complexity probe থেকে কনটেন্টের কঠিনতা বের করা, সেই কঠিনতা দিয়ে base ladder scale করা, BPP-র সীমা মেনে resolution বাছা (convex hull-এর ব্যবহারিক রূপ), অতিরিক্ত কাছাকাছি rung ছেঁটে ফেলা, keyframe/GOP সেটিং সব rung-এ এক রাখা, আর অডিও একবারই যোগ করা।

```typescript
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceInfo {
	width: number;
	height: number;
	fpsNum: number;
	fpsDen: number;
	durationSeconds: number;
}

/**
 * Output of a fixed-CRF probe encode over sampled slices of the source.
 *
 * Holding CRF constant holds *quality* constant, so the bitrate the encoder
 * needed is a direct measure of how hard the content is to compress. A talking
 * head lands low, an action sequence lands high.
 */
export interface ComplexityProbe {
	/** CRF used for the probe. Must be identical across all titles. */
	crf: number;
	/** Resolution the probe was encoded at. */
	probeWidth: number;
	probeHeight: number;
	/** Mean bitrate the probe produced, in bits per second. */
	probeBitrate: number;
	/** Seconds of source actually sampled, for sanity checks. */
	sampledSeconds: number;
}

export interface Rung {
	name: string;
	width: number;
	height: number;
	/** Average target bitrate, bits per second. */
	bitrate: number;
	/** Peak allowed bitrate. Caps the VBV buffer so no segment spikes. */
	maxrate: number;
	/** VBV buffer size, bits. */
	bufsize: number;
	profile: 'baseline' | 'main' | 'high';
	fps: number;
	/** GOP length in frames, derived from the shared keyframe interval. */
	gopFrames: number;
	bitsPerPixel: number;
}

export interface LadderOptions {
	/** Keyframe interval in seconds. Identical for every rung, non-negotiable. */
	keyframeIntervalSeconds: number;
	/** Minimum ratio between adjacent rungs. Below this, the rung is pruned. */
	minRungRatio: number;
	/** Never emit a rung above this bitrate, whatever complexity says. */
	maxBitrate: number;
	/** Never emit a rung below this bitrate; it would be unwatchable. */
	minBitrate: number;
	/** Do not upscale past the source resolution. */
	allowUpscale: boolean;
	maxRungs: number;
}

export const DEFAULT_OPTIONS: LadderOptions = {
	keyframeIntervalSeconds: 2,
	minRungRatio: 1.35,
	maxBitrate: 9_000_000,
	minBitrate: 145_000,
	allowUpscale: false,
	maxRungs: 7
};

// ---------------------------------------------------------------------------
// Candidate resolutions
// ---------------------------------------------------------------------------

/**
 * Usable bits-per-pixel-per-frame window for H.264 on camera content.
 *
 * Below minBpp the encoder can only produce blocking and smeared texture;
 * above maxBpp the extra bits buy no visible improvement. Choosing a
 * resolution therefore means choosing the largest frame whose bpp at the
 * target bitrate still sits inside this window -- which is the practical,
 * cheap approximation of walking the convex hull.
 */
const MIN_BPP = 0.045;
const MAX_BPP = 0.155;

interface Candidate {
	name: string;
	width: number;
	height: number;
	profile: 'baseline' | 'main' | 'high';
	/** Halve the frame rate at the very bottom to buy back bits. */
	halveFps: boolean;
}

const CANDIDATES: Candidate[] = [
	{ name: '234p', width: 416, height: 234, profile: 'baseline', halveFps: true },
	{ name: '360p', width: 640, height: 360, profile: 'main', halveFps: false },
	{ name: '432p', width: 768, height: 432, profile: 'main', halveFps: false },
	{ name: '540p', width: 960, height: 540, profile: 'main', halveFps: false },
	{ name: '720p', width: 1280, height: 720, profile: 'main', halveFps: false },
	{ name: '1080p', width: 1920, height: 1080, profile: 'high', halveFps: false },
	{ name: '1440p', width: 2560, height: 1440, profile: 'high', halveFps: false },
	{ name: '2160p', width: 3840, height: 2160, profile: 'high', halveFps: false }
];

/**
 * A reference ladder for content of average complexity, in bits per second.
 * Complexity scaling moves the whole thing up or down.
 */
const REFERENCE_BITRATES: number[] = [
	200_000, 500_000, 900_000, 1_600_000, 3_000_000, 5_000_000, 8_000_000, 14_000_000
];

// ---------------------------------------------------------------------------
// Complexity
// ---------------------------------------------------------------------------

/**
 * Bitrate a fixed-CRF probe produces on *average* content at the probe
 * resolution. Calibrate this once against your own library; it is the single
 * number the whole per-title system pivots on.
 */
const REFERENCE_PROBE_BITRATE = 1_400_000; // at 720p, CRF 23

/**
 * Complexity factor: 1.0 is average, 0.4 is a static talking head, 2.5 is
 * a fast-motion action sequence.
 */
export function complexityFactor(probe: ComplexityProbe): number {
	if (probe.sampledSeconds < 5) {
		// Too little signal to trust. Fall back to average rather than guess.
		console.warn(`[ladder] probe sampled only ${probe.sampledSeconds}s, assuming average`);
		return 1;
	}

	// Normalise the probe to the reference resolution. Bitrate scales roughly
	// with the square root of pixel count at constant quality, not linearly --
	// doubling the pixels does not double the bits, because detail correlates.
	const probePixels = probe.probeWidth * probe.probeHeight;
	const referencePixels = 1280 * 720;
	const resolutionAdjust = Math.sqrt(referencePixels / probePixels);

	const normalised = probe.probeBitrate * resolutionAdjust;
	const factor = normalised / REFERENCE_PROBE_BITRATE;

	// Clamp. A factor outside this range almost always means a broken probe
	// (black frames, a still image, a corrupt slice) rather than real content.
	return Math.min(3.0, Math.max(0.35, factor));
}

// ---------------------------------------------------------------------------
// Ladder construction
// ---------------------------------------------------------------------------

function bitsPerPixel(bitrate: number, width: number, height: number, fps: number): number {
	return bitrate / (width * height * fps);
}

/**
 * Pick the largest candidate whose bpp at this bitrate is still acceptable.
 *
 * Walking downward from the largest frame is the point: at 900 kbps a 1080p
 * encode has bpp 0.014 and looks broken, while a 480p encode has bpp 0.065 and
 * looks clean. Fewer pixels done well beat more pixels done badly, every time.
 */
function chooseResolution(
	bitrate: number,
	source: SourceInfo,
	sourceFps: number,
	options: LadderOptions
): Candidate | null {
	for (let i = CANDIDATES.length - 1; i >= 0; i--) {
		const candidate = CANDIDATES[i];

		if (!options.allowUpscale && candidate.height > source.height) continue;

		const fps = candidate.halveFps ? sourceFps / 2 : sourceFps;
		const bpp = bitsPerPixel(bitrate, candidate.width, candidate.height, fps);

		if (bpp >= MIN_BPP) return candidate;
	}
	return null;
}

/** Drop rungs that sit too close to their neighbour to be worth encoding. */
function pruneCloseRungs(rungs: Rung[], minRatio: number): Rung[] {
	const kept: Rung[] = [];

	for (const rung of rungs) {
		const previous = kept[kept.length - 1];
		if (!previous) {
			kept.push(rung);
			continue;
		}

		const ratio = rung.bitrate / previous.bitrate;
		const sameResolution = rung.width === previous.width && rung.height === previous.height;

		// Two rungs at the same resolution need a wider gap to earn their place:
		// viewers cannot see a small bitrate bump when the frame size is equal.
		const required = sameResolution ? minRatio * 1.25 : minRatio;

		if (ratio >= required) kept.push(rung);
	}

	return kept;
}

export function buildLadder(
	source: SourceInfo,
	probe: ComplexityProbe,
	options: LadderOptions = DEFAULT_OPTIONS
): { rungs: Rung[]; complexity: number } {
	const sourceFps = source.fpsNum / source.fpsDen;
	const complexity = complexityFactor(probe);

	const rungs: Rung[] = [];

	for (const reference of REFERENCE_BITRATES) {
		const scaled = Math.round(reference * complexity);
		const bitrate = Math.min(options.maxBitrate, scaled);

		if (bitrate < options.minBitrate) continue;

		const candidate = chooseResolution(bitrate, source, sourceFps, options);
		if (!candidate) continue;

		const fps = candidate.halveFps ? sourceFps / 2 : sourceFps;
		const bpp = bitsPerPixel(bitrate, candidate.width, candidate.height, fps);

		// Above MAX_BPP the bits are wasted: cap them back down rather than
		// paying for quality nobody can see.
		const finalBitrate =
			bpp > MAX_BPP ? Math.round(MAX_BPP * candidate.width * candidate.height * fps) : bitrate;

		rungs.push({
			name: candidate.name,
			width: candidate.width,
			height: candidate.height,
			bitrate: finalBitrate,
			// 110% cap plus a 2s buffer is the standard VBV shape: it lets the
			// encoder spend on hard moments without any single segment spiking
			// past what the player budgeted for.
			maxrate: Math.round(finalBitrate * 1.1),
			bufsize: Math.round(finalBitrate * 2),
			profile: candidate.profile,
			fps,
			gopFrames: Math.round(fps * options.keyframeIntervalSeconds),
			bitsPerPixel: bitsPerPixel(finalBitrate, candidate.width, candidate.height, fps)
		});
	}

	const pruned = pruneCloseRungs(rungs, options.minRungRatio).slice(0, options.maxRungs);

	if (pruned.length === 0) {
		throw new Error('ladder: no viable rungs, check source dimensions and probe');
	}

	return { rungs: pruned, complexity };
}

// ---------------------------------------------------------------------------
// Audio: encoded once, shared by every rung
// ---------------------------------------------------------------------------

export interface AudioRendition {
	name: string;
	bitrate: number;
	codec: 'aac-lc' | 'he-aac';
	channels: number;
	sampleRate: number;
}

export function audioRenditions(rungs: Rung[]): AudioRendition[] {
	const renditions: AudioRendition[] = [
		{ name: 'audio-128k', bitrate: 128_000, codec: 'aac-lc', channels: 2, sampleRate: 48_000 }
	];

	// When the bottom rung is very tight, 128 kbps of audio eats the video's
	// budget alive. Add one low rendition just for those rungs.
	const lowest = rungs[0];
	if (lowest && lowest.bitrate < 400_000) {
		renditions.unshift({
			name: 'audio-64k',
			bitrate: 64_000,
			codec: 'he-aac',
			channels: 2,
			sampleRate: 48_000
		});
	}

	return renditions;
}

// ---------------------------------------------------------------------------
// Encoder arguments -- keyframe settings identical on every rung
// ---------------------------------------------------------------------------

export function ffmpegArgs(
	input: string,
	rung: Rung,
	audio: AudioRendition,
	options: LadderOptions
): string[] {
	return [
		'-i',
		input,
		'-c:v',
		'libx264',
		'-preset',
		'medium',
		'-profile:v',
		rung.profile,
		'-s',
		`${rung.width}x${rung.height}`,
		'-r',
		String(rung.fps),
		'-b:v',
		String(rung.bitrate),
		'-maxrate',
		String(rung.maxrate),
		'-bufsize',
		String(rung.bufsize),

		// The alignment contract. These three must be byte-identical across
		// every rung, or switching between renditions produces garbage.
		'-g',
		String(rung.gopFrames),
		'-keyint_min',
		String(rung.gopFrames),
		'-sc_threshold',
		'0',
		// Force by *time*, not frame count, so rungs at different frame rates
		// still land their keyframes on the same timestamps.
		'-force_key_frames',
		`expr:gte(t,n_forced*${options.keyframeIntervalSeconds})`,

		'-c:a',
		'aac',
		'-b:a',
		String(audio.bitrate),
		'-ar',
		String(audio.sampleRate),
		'-ac',
		String(audio.channels),

		`out-${rung.name}.mp4`
	];
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function mbps(bits: number): string {
	return (bits / 1_000_000).toFixed(3);
}

export function report(source: SourceInfo, result: { rungs: Rung[]; complexity: number }): void {
	console.log(`source        ${source.width}x${source.height} @ ${source.fpsNum}/${source.fpsDen}`);
	console.log(`complexity    ${result.complexity.toFixed(2)}x average`);
	console.log('rung      resolution   bitrate    bpp     fps    gop');

	let totalStorageBits = 0;
	for (const rung of result.rungs) {
		totalStorageBits += rung.bitrate * source.durationSeconds;
		console.log(
			`${rung.name.padEnd(9)} ${`${rung.width}x${rung.height}`.padEnd(12)} ` +
				`${mbps(rung.bitrate).padEnd(10)} ${rung.bitsPerPixel.toFixed(3)}   ` +
				`${rung.fps.toFixed(2).padEnd(6)} ${rung.gopFrames}`
		);
	}

	console.log(`storage       ${(totalStorageBits / 8 / 1024 ** 3).toFixed(2)} GB for all rungs`);
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const lecture: SourceInfo = {
	width: 1920,
	height: 1080,
	fpsNum: 30000,
	fpsDen: 1001,
	durationSeconds: 3600
};

// A static lecture: the probe barely spent any bits.
const lectureProbe: ComplexityProbe = {
	crf: 23,
	probeWidth: 1280,
	probeHeight: 720,
	probeBitrate: 620_000,
	sampledSeconds: 60
};

// A horse race in Samarkand: constant motion, the probe spent heavily.
const raceProbe: ComplexityProbe = {
	crf: 23,
	probeWidth: 1280,
	probeHeight: 720,
	probeBitrate: 3_100_000,
	sampledSeconds: 60
};

report(lecture, buildLadder(lecture, lectureProbe));
report(lecture, buildLadder(lecture, raceProbe));
```

## যা এই ইমপ্লিমেন্টেশনকে প্রোডাকশন-রেডি করে

- **Probe-এর resolution normalise করা** — probe যেকোনো resolution-এ চলতে পারে, কিন্তু complexity factor সবসময় একই reference-এ হিসাব হয়, তাই বিভিন্ন pipeline-এর probe তুলনীয় থাকে
- **Complexity clamp করা** — কালো ফ্রেম, স্থির ছবি বা ভাঙা slice-এর probe অবাস্তব সংখ্যা দেয়; clamp সেটাকে একটা হাস্যকর ladder বানাতে দেয় না
- **BPP-র দুই দিকেই সীমা** — নিচের সীমা ভাঙা ছবি ঠেকায়, উপরের সীমা অদৃশ্য quality-র জন্য টাকা খরচ ঠেকায়
- **Same-resolution rung-এ কড়া pruning** — একই frame size-এ সামান্য bitrate পার্থক্য দর্শক দেখে না, তাই সেখানে বেশি ফারাক দাবি করা হয়
- **Keyframe সময় ধরে force করা** — ফ্রেম সংখ্যা নয়, `t` ধরে; ফলে অর্ধেক frame rate-এর নিচু rung-ও একই টাইমস্ট্যাম্পে keyframe পায়
- **VBV constraint প্রতিটা rung-এ** — `maxrate`/`bufsize` ছাড়া average bitrate ঠিক থাকলেও একটা কঠিন segment এত বড় হতে পারে যে player-এর buffer শূন্য হয়ে যায়
- **অডিও একবার, ladder-নির্ভর নয়** — শুধু যখন সবচেয়ে নিচের rung সত্যিই সংকীর্ণ, তখনই একটা বাড়তি low-bitrate অডিও যোগ হয়

<div class="takeaways">

### মূল শেখা

- একটা ফাইল কখনোই সবার জন্য যথেষ্ট নয় — ladder-এর কাজ সবচেয়ে ভালো ছবি দেওয়া নয়, **প্রতিটা দর্শকের নেটওয়ার্ক যতটুকু নিরাপদে বইতে পারে তার সবচেয়ে ভালো ছবি** দেওয়া
- Resolution আর bitrate একসাথে চলে; **bits per pixel** (H.264-এ মোটামুটি 0.05–0.15) হলো সেই সংখ্যা যা বলে দেয় কোন জোড়াটা যুক্তিসঙ্গত
- কম bitrate-এ কম resolution সবসময় জেতে — পরিষ্কার 480p চাপা-দেওয়া 1080p-র চেয়ে ভালো দেখায়
- Fixed ladder ধরে নেয় সব কনটেন্ট এনকোড করতে সমান কষ্ট, যা সত্যি নয়; ফল একদিকে ৩x অপচয়, আরেকদিকে দৃশ্যমান ঘাটতি — আর কিছুই "ভাঙে" না বলে কেউ ধরতে পারে না
- **Per-title encoding** কনটেন্টের কঠিনতা মেপে ladder scale করে; একটা সস্তা fixed-CRF probe-ই সাধারণত ২০–৩০% ব্যান্ডউইথ বাঁচায়
- **Convex hull** হলো সেই ভাবনা যে প্রতিটা bitrate-এ একটা নির্দিষ্ট resolution জেতে, আর ladder-এর প্রতিটা rung ওই জেতা বিন্দুগুলোর উপর বসা উচিত
- পাশাপাশি rung-এর অনুপাত 1.5x–2x রাখুন; বেশি কাছাকাছি হলে অপচয়, বেশি দূরে হলে দর্শক হঠাৎ ঝাপসা ছবি দেখে
- নিচের rung বাদ দেবেন না — যারা সেগুলো ছাড়া ভিডিও চালাতেই পারে না, তারা আপনার অ্যানালিটিক্সেও নেই
- অডিও একবার এনকোড করে পুরো ladder-এ শেয়ার করুন; অডিওর আসল বাগ bitrate-এর নয়, timing-এর
- **Aligned keyframe ছাড়া ladder-টাই অর্থহীন** — প্রতিটা rendition-এ keyframe একই টাইমস্ট্যাম্পে, প্রতিটা segment keyframe দিয়ে শুরু, scene-cut বন্ধ, আর CI-তে ffprobe দিয়ে যাচাই

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Netflix** ২০১৫-এ per-title encoding প্রকাশ করে দেখিয়েছিল একই VMAF-এ গড়ে ২০% পর্যন্ত কম bitrate সম্ভব, আর পরে সেটাকে per-shot পর্যায়ে নিয়ে গেছে — প্রতিটা shot-এর নিজস্ব convex hull
- **Apple**-এর HLS authoring specification সরাসরি বলে দেয় প্রতিটা variant-এ keyframe একই জায়গায় থাকতে হবে এবং segment duration সমান হতে হবে; তাদের `mediastreamvalidator` টুল ঠিক এই অসঙ্গতিগুলোই ধরে
- **YouTube** আপলোডের পর প্রথমে একটা দ্রুত নিচু ladder প্রকাশ করে, তারপর ব্যাকগ্রাউন্ডে ভালো codec আর উঁচু rung যোগ করতে থাকে — জনপ্রিয় ভিডিওতে বেশি খরচ, অজনপ্রিয়তে কম
- **Mux, Cloudflare Stream, AWS MediaConvert**-এর মতো সার্ভিসগুলোতে "auto" ladder মানেই কোনো না কোনো রূপের per-title বিশ্লেষণ; নিজে ladder লিখলে আপনি ওই সিদ্ধান্তটাই হাতে নিচ্ছেন
- **Twitch**-এর মতো live প্ল্যাটফর্মে rung সংখ্যা কম রাখা হয় এবং pass-through rung ব্যবহার হয় (broadcaster-এর মূল stream-কেই সবচেয়ে উঁচু rung ধরা), কারণ real-time-এ প্রতিটা বাড়তি rung সরাসরি CPU খরচ

</div>
