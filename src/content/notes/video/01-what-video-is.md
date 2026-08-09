---
title: 'ভিডিও আসলে কী'
subtitle: 'Frame, resolution, frame rate, colour space, chroma subsampling — আর যে raw-bitrate হিসাবটা প্রমাণ করে দেয় compression কোনো অপশন নয়, বাধ্যবাধকতা।'
chapter: 1
level: 'beginner'
readingTime: '২০ মিনিট'
topics:
  [
    'frames',
    'resolution',
    'frame rate',
    'colour space',
    'chroma subsampling',
    'raw bitrate',
    'PTS DTS'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

একটা ভিডিও ফাইল "চলমান কোনো জিনিস" নয়। এটা হলো **একগাদা স্থির ছবি, যার সাথে একটা ঘড়ি বাঁধা** — সাথে এক বা একাধিক audio track, আর দুটোকে মিলিয়ে রাখার মতো যথেষ্ট metadata। এই ট্র্যাকের বাকি সবকিছু — codec, container, ladder, manifest, CDN — আসলে ওই সংজ্ঞাটার তৈরি করা একটামাত্র সমস্যার সমাধান: কাঁচা ছবির স্তূপ ভয়ংকর রকমের বড়।

একটা uncompressed ভিডিও স্ট্রিমকে পুরোপুরি বর্ণনা করতে চারটা সংখ্যাই যথেষ্ট:

- **Resolution** — প্রতি frame-এ কত pixel (1920×1080 মানে প্রায় ২০ লাখ ৭৩ হাজার)।
- **Frame rate** — সেকেন্ডে কত frame (24, 25, 30, 60...)।
- **Bit depth** — প্রতিটা colour sample কত bit-এ লেখা (সাধারণত 8-bit, HDR-এ 10-bit)।
- **Colour sampling** — প্রতি pixel-এ কতগুলো colour sample রাখা হচ্ছে (নিচে chroma subsampling দেখুন)।

এই চারটা গুণ করলেই raw bitrate পাওয়া যায়। একবার সেই গুণটা করে ফেললে গোটা ভিডিও ইন্ডাস্ট্রি হঠাৎ যুক্তিসঙ্গত মনে হতে শুরু করে।

<Mermaid
title="আলো থেকে playable ফাইল পর্যন্ত"
code={`graph LR
  L["Light<br/>on a sensor"] --> P["Pixels<br/>RGB samples"] --> Y["YCbCr<br/>+ subsampling"] --> E["Encoder<br/>compression"] --> C["Container<br/>+ audio + timing"]`}
/>

## গল্পে বুঝি

বুখারার একটা পুঁথি-চিত্রশালা। উস্তাদ ফাতিমা আল-ফিহরির কর্মশালায় খলিফার ছেলের জন্য একটা অদ্ভুত জিনিস বানানোর ফরমায়েশ এসেছে — এমন একটা কাঠের বাক্স যার ভেতরে ছোট ছোট আঁকা কার্ড এক এক করে সরে যাবে, আর দেখলে মনে হবে একটা ঘোড়া সত্যিই ছুটছে। ফাতিমা বসে হিসাব করলেন। ঘোড়াটা তিন সেকেন্ড ছুটবে। চোখকে ধোঁকা দিতে হলে সেকেন্ডে অন্তত পঁচিশটা কার্ড লাগবে। মানে পঁচাত্তরটা কার্ড আঁকতে হবে — যার প্রতিটাই একেকটা সম্পূর্ণ স্থির ছবি। বাক্সটা যত জোরে ঘুরবে, ঘোড়া তত মসৃণ ছুটবে; আস্তে ঘুরলে ঝাঁকুনি লাগবে। কার্ডের সংখ্যা নয়, **প্রতি সেকেন্ডে কয়টা কার্ড** — এটাই আসল প্যারামিটার।

কার্ড কত সূক্ষ্ম হবে, সেটাও ঠিক করতে হলো। ফাতিমা প্রতিটা কার্ডে সরু কালির জাল টেনে খোপ কাটেন — ছোট কার্ডে আড়াআড়ি চল্লিশটা খোপ, বড় কার্ডে একশো ষাটটা। প্রতিটা খোপে একটামাত্র রঙ বসে। খোপ যত বেশি, ঘোড়ার কেশর তত স্পষ্ট, আর আঁকার খরচ তত বেশি। এই খোপের জালটাই ছবির সূক্ষ্মতা ঠিক করে দেয়।

এবার শ্রমবণ্টন। ফাতিমার কর্মশালায় দুই ধরনের কারিগর। একদল হলো **রেখা-কারিগর** — তারা কয়লা দিয়ে প্রতিটা খোপে আলো-ছায়ার মাত্রা বসায়: এই খোপ কতটা উজ্জ্বল, ওই খোপ কতটা অন্ধকার। আরেক দল **রঙ-কারিগর** — তারা উপরে রঙ চাপায়। বছরের পর বছর কাজ করে ফাতিমা একটা জিনিস লক্ষ করেছেন: খদ্দের রেখা-কারিগরের সামান্য ভুলও ধরে ফেলে — ঘোড়ার পায়ের ছায়া একটু এদিক-ওদিক হলেই চোখে লাগে। কিন্তু রঙ-কারিগর যদি চারটা খোপে আলাদা আলাদা রঙ না বসিয়ে গোটা ২×২ খোপের চৌকোয় একটাই রঙ বুলিয়ে দেয়, কেউ টেরই পায় না। তাই তিনি নিয়ম করলেন — রেখার কাজ প্রতিটা খোপে আলাদা, রঙের কাজ চার খোপে একবার। মজুরি অর্ধেকে নেমে এল, ঘোড়া দেখতে আগের মতোই রইল।

শুধু একটা জায়গায় নিয়মটা ভেঙে পড়ল। খলিফার ছেলে চাইল ঘোড়ার গায়ে লাল কালিতে তার নাম লেখা থাকুক, কালো জিনের উপর। চার খোপে একটা রঙ বুলিয়ে দিতেই লেখাটা ঘোলাটে হয়ে গেল, অক্ষরের কিনারা রক্তাক্ত দাগের মতো ছড়িয়ে পড়ল। ফাতিমাকে ওই কার্ডগুলোর জন্য আলাদা নিয়ম করতে হলো — সেখানে রঙ-কারিগরও প্রতিটা খোপে আলাদা রঙ বসাবে।

তারপর এল ক্রমের ঝামেলা। কার্ডগুলো আঁকা শেষ হলে সহকারী আল-বিরুনি প্রতিটার পেছনে সংখ্যা লিখে দেয় — "এই কার্ডটা বাক্সে ছাব্বিশ নম্বরে দেখাবে"। কিন্তু কর্মশালায় আঁকার ক্রম আলাদা: কিছু কার্ড এমন যে তার আগের **আর** পরের কার্ড দুটো সামনে না থাকলে আঁকাই যায় না। তাই আল-বিরুনি প্রতিটা কার্ডের পেছনে দুটো সংখ্যা লেখেন — একটা "কত নম্বরে দেখাবে", আরেকটা "কত নম্বরে আঁকতে হবে"। দুটো সংখ্যা মেলে না, আর সেটা ভুল নয়, ইচ্ছাকৃত।

শেষে বাক্সের গায়ে একটা ছোট তামার ফলক লাগানো হলো, তাতে লেখা — কোন রঙের সেট ব্যবহার হয়েছে (সমরকন্দের নীল নাকি কর্ডোবার নীল), কালি কতটা গাঢ় করে গোলানো হয়েছে, আর রেখা-কারিগরের মাত্রাগুলো কোন হিসাবে বসানো। এই ফলক ছাড়া অন্য শহরের কারিগর বাক্সটা খুলে কার্ড দেখলে রঙগুলো ঠিকঠাক বুঝবে না। আর সবচেয়ে বাজে ব্যাপার — একবার এক শিক্ষানবিশ ভুল ফলক লাগিয়ে দিয়েছিল। কার্ডগুলো ছিল নিখুঁত, ফলকে লেখা ছিল ভুল পিগমেন্টের নাম। কায়রোতে বাক্সটা খুলে সবাই বলল "ঘোড়াটা কেমন ফ্যাকাশে দেখাচ্ছে" — অথচ কার্ডে কোনো ভুল ছিল না, ভুল ছিল শুধু গায়ে লেখা কাগজে।

মিলিয়ে নিই: প্রতিটা আঁকা কার্ড হলো একটা **frame**, সেকেন্ডে কয়টা কার্ড সরবে সেটা **frame rate**, কার্ডের কালির জালে কয়টা খোপ সেটা **resolution**, প্রতিটা খোপে কতগুলো আলাদা মাত্রা বসানো যায় সেটা **bit depth**, রেখা-কারিগরের আলো-ছায়ার কাজ হলো **luma (Y)**, রঙ-কারিগরের কাজ হলো **chroma (Cb, Cr)**, চার খোপে একবার রঙ বোলানো হলো **4:2:0 chroma subsampling** আর প্রতি খোপে আলাদা রঙ হলো **4:4:4**, লাল লেখা ঘোলাটে হয়ে যাওয়াটাই সেই ক্লাসিক sharp coloured edge সমস্যা, কার্ডের পেছনের "কত নম্বরে দেখাবে" হলো **PTS** আর "কত নম্বরে আঁকতে হবে" হলো **DTS**, আর বাক্সের গায়ের তামার ফলক হলো **colour metadata** — primaries, transfer আর matrix। ভুল ফলকের ফ্যাকাশে ঘোড়াটাই বাস্তবের সবচেয়ে ঘনঘন ঘটা বাগ: pixel ঠিক, tag ভুল।

## যে হিসাবটা compression-কে বাধ্যতামূলক করে দেয়

বাগদাদে রেকর্ড করা এক ঘণ্টার একটা লেকচার ধরুন — 1080p, 30fps, 8-bit, আর প্রতিটা pixel-এর জন্য সম্পূর্ণ রঙের তথ্য (4:4:4, pixel-প্রতি তিনটে sample):

```text
pixels per frame   = 1920 x 1080            = 2,073,600
samples per frame  = 2,073,600 x 3          = 6,220,800
bits per frame     = 6,220,800 x 8          = 49,766,400  (~6.2 MB)
bits per second    = 49,766,400 x 30        = 1,492,992,000  (~1.5 Gbps)
one hour           = 1.5 Gbps x 3600        = ~672 GB
```

এক ঘণ্টার 1080p ভিডিওর জন্য প্রায় **৬৭২ গিগাবাইট**। একজন দর্শকের ভালো ব্রডব্যান্ড লাইনে হয়তো ২৫ Mbps আছে। মানে আপনি বাজেটের প্রায় ষাট গুণ উপরে। এখানে পৃথিবীর সেরা CDN-ও আপনাকে বাঁচাতে পারবে না — তথ্য ফেলে দিতেই হবে, এবং এমনভাবে ফেলতে হবে যেটা মানুষের চোখ ক্ষমা করে দেয়। পরের চ্যাপ্টারটা পুরোটাই সেই নিয়ে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Raw ভিডিও হলো এমন একটা লাইব্রেরি যেখানে প্রতিটা বই আর্কাইভাল কাগজে পূর্ণ রঙে ছাপা, আর প্রতি পাঠকের জন্য আলাদা এক কপি। Compression হলো সেই সিদ্ধান্ত — সাদাকালোয় ছাপো, আগের পাতার সাথে একটা শব্দ বদলালে গোটা পাতা আবার না ছেপে আগেরটাই ব্যবহার করো, আর যে খুঁটিনাটি কেউ পড়েই না সেটা বাদ দাও — কিন্তু গল্পটা হুবহু একই রাখো।

</Callout>

## Resolution, aspect ratio, আর "চৌকো"-র দুই মানে

Resolution মানে pixel-এ প্রস্থ × উচ্চতা। প্রচলিত ধাপগুলো:

| নাম        | Resolution | Pixel    | 1080p-র তুলনায় |
| ---------- | ---------- | -------- | --------------- |
| 240p       | 426×240    | ১.০ লাখ  | 0.05×           |
| 360p       | 640×360    | ২.৩ লাখ  | 0.11×           |
| 480p       | 854×480    | ৪.১ লাখ  | 0.20×           |
| 720p       | 1280×720   | ৯.২ লাখ  | 0.44×           |
| 1080p      | 1920×1080  | ২০.৭ লাখ | 1.00×           |
| 1440p      | 2560×1440  | ৩৬.৯ লাখ | 1.78×           |
| 2160p (4K) | 3840×2160  | ৮২.৯ লাখ | 4.00×           |

খেয়াল করুন resolution দ্বিগুণ করলে pixel চার গুণ হয়। 1080p থেকে 4K-তে যাওয়া মানে চার গুণ বেশি ডেটা, আর সেজন্যই ladder-এ উপরের ধাপগুলো এত দামি।

দুটো aspect ratio গুরুত্বপূর্ণ, আর মানুষ নিয়মিত এ দুটো গুলিয়ে ফেলে:

- **PAR** (pixel aspect ratio) — একটা pixel নিজে দেখতে কেমন। আধুনিক কন্টেন্টে এটা 1:1, অর্থাৎ চৌকো। পুরনো broadcast ফরম্যাটে ছিল না।
- **DAR** (display aspect ratio) — পুরো ছবিটা দেখতে কেমন। DAR = PAR × (storage width ÷ storage height)।

একটা ফাইল যদি 720×480 হিসেবে সংরক্ষিত থাকে আর তার PAR হয় 32:27, তাহলে DAR দাঁড়ায় 16:9 — অর্থাৎ player-কে দেখানোর সময় ছবিটা টেনে চওড়া করতে হবে। এটা ভুল হলে পর্দায় সবাইকে লম্বা আর সরু দেখায়। পুরনো ফুটেজ ingest করার সময় শুরুতেই square pixel-এ normalise করে নিন — গোটা transcoding pipeline-এর ভেতর দিয়ে PAR metadata টেনে নিয়ে যাওয়া বাগের একটা নির্ভরযোগ্য উৎস।

## Frame rate, আর 29.97 কোথা থেকে এল

Frame rate মানে সেকেন্ডে কয়টা ছবি। সিনেমা থিতু হয়েছে 24-এ, ইউরোপীয় broadcast 25-এ, উত্তর আমেরিকার broadcast 30-এ — কেবল সেটা আসলে 30 নয়, **30000/1001 = 29.97**। সাদাকালো টেলিভিশনে রঙ যোগ করার সময় colour subcarrier-এর জন্য জায়গা বানাতে গিয়ে এই কারচুপিটা করতে হয়েছিল, আর সেটা আর কখনো ঠিক করা হয়নি। এর কুৎসিত আত্মীয় 23.976 আর 59.94-ও একই জায়গা থেকে আসা।

এই কারণেই ভিডিওর timing প্রকাশ করা হয় **rational number** হিসেবে, float হিসেবে নয়। একটা **timebase** ঠিক করে দেয় ঘড়ির একক (যেমন MPEG-TS-এ 1/90000, বা 1/30000), আর প্রতিটা frame ওই এককে integer timestamp বহন করে।

কেন এত গুরুত্বপূর্ণ, সেটা হিসাব করলেই পরিষ্কার:

```text
30000/1001 fps -> frame duration = 1001/30000 s exactly

as a float:      0.0333666666666666...  (never exact in binary)
error per frame: ~1e-17 s  (looks harmless)

but timestamps accumulate:
  108,000 frames (1 hour) x rounding drift
  -> audio and video visibly separate on long assets

as a rational, in a 1/30000 timebase:
  frame n PTS = n * 1001   (integer, exact, forever)
```

Float-এ সেকেন্ড হিসেবে timestamp রাখলে ভুলটা জমতে থাকে, আর দীর্ঘ কন্টেন্টে একসময় ঠোঁট নড়া আর কথার শব্দ চোখে পড়ার মতো আলাদা হয়ে যায়।

প্রতিটা frame দুটো timestamp বহন করে:

- **PTS** (presentation timestamp) — কখন _দেখাতে_ হবে।
- **DTS** (decode timestamp) — কখন _decode_ করতে হবে।

দুটো আলাদা হয় কারণ কিছু frame এমন frame থেকে predict করা হয় যেগুলো playback-এর ক্রমে পরে আসে — তাই decoder-কে পরের frame-গুলো আগে পাঠাতে হয়। গল্পের আল-বিরুনির দুই সংখ্যার ব্যাপারটা এখানেই। কেন এমন হয়, চ্যাপ্টার ২-তে বিস্তারিত আছে।

<Callout type="warning">

**Constant বনাম variable frame rate**

স্ক্রিন রেকর্ডার আর ফোন প্রায়ই **VFR** (variable frame rate) তৈরি করে — যখন কিছু বদলায় তখনই একটা frame আসে, নইলে নয়। বেশিরভাগ encoding আর packaging টুল ধরে নেয় ইনপুট **CFR**। একটা segmenter-এ VFR ঢুকিয়ে দিলে segment-এর দৈর্ঘ্য এলোমেলো হয়ে যায়, আর সেটা পরে adaptive switching ভেঙে দেয়। Ingest-এর সময়েই CFR-এ normalise করে নিন।

</Callout>

## রঙ: RGB, YCbCr, আর চোখ যা খেয়াল করে না তা ফেলে দেওয়া

সেন্সর আর স্ক্রিন **RGB**-তে ভাবে। Codec প্রায় কখনোই ভাবে না। Codec আগে **YCbCr**-এ রূপান্তর করে নেয়, যেটা ছবিটাকে ভাগ করে ফেলে:

- **Y (luma)** — উজ্জ্বলতা, কার্যত frame-টার একটা সাদাকালো সংস্করণ।
- **Cb, Cr (chroma)** — নীল-পার্থক্য আর লাল-পার্থক্য, অর্থাৎ রঙের অংশটুকু।

কারণটা জীববিজ্ঞানের। মানুষের চোখে rod cell (উজ্জ্বলতা) cone cell-এর (রঙ) চেয়ে অনেক বেশি, তাই উজ্জ্বলতার খুঁটিনাটি হারালে আমরা যত দ্রুত ধরে ফেলি, রঙের খুঁটিনাটি হারালে তার ধারেকাছেও না। দুটোকে আলাদা করে ফেললে encoder তার bit-গুলো ঠিক সেখানেই খরচ করতে পারে যেখানে চোখ তাকিয়ে আছে।

**Chroma subsampling** হলো সেই সুযোগটার ব্যবহার। এটা লেখা হয় `J:a:b` নামের তিন অংশের অনুপাতে, যা একটা 4×2 pixel ব্লকের উপর প্রযোজ্য:

| Notation | কত chroma sample রাখা হয় | 4:4:4-এর তুলনায় ডেটা | সাধারণ ব্যবহার                        |
| -------- | ------------------------- | --------------------- | ------------------------------------- |
| 4:4:4    | প্রতি pixel-এ পূর্ণ       | 100%                  | mastering, screen content, chroma key |
| 4:2:2    | আড়াআড়িভাবে অর্ধেক       | 67%                   | broadcast, professional intermediate  |
| 4:2:0    | দুই দিকেই অর্ধেক          | 50%                   | কার্যত সব streaming delivery          |

4:2:0 রঙের তথ্যের **তিন-চতুর্থাংশ** ফেলে দেয়, আর ক্যামেরায় তোলা কন্টেন্টে দর্শক সেটা টেরই পায় না। H.264, HEVC, VP9 আর AV1 — সবার delivery profile-এ এটাই ডিফল্ট। আগের হিসাবটা 4:2:0 দিয়ে আবার করুন, pixel-প্রতি sample ৩ থেকে নেমে ১.৫ হয়ে যাবে — এক ঘণ্টার raw ফাইল ৬৭২ GB থেকে নেমে ৩৩৬ GB। এখনো অবাস্তব, কিন্তু encoder চালু হওয়ার আগেই এটা বিনামূল্যে পাওয়া ২× লাভ।

```text
4:4:4  Y Y Y Y      Cb Cb Cb Cb      3.0 samples/pixel
       Y Y Y Y      Cr Cr Cr Cr

4:2:2  Y Y Y Y      Cb    Cb         2.0 samples/pixel
       Y Y Y Y      Cr    Cr

4:2:0  Y Y Y Y      Cb                1.5 samples/pixel
       Y Y Y Y      Cr    (one chroma pair per 2x2 luma block)
```

<Callout type="tip">

4:2:0 মুখ আর প্রাকৃতিক দৃশ্যে প্রায় অদৃশ্য, আর ধারালো রঙিন কিনারায় _খুব_ দৃশ্যমান — কালোর উপর লাল লেখা, UI-এর স্ক্রিনশট, burn-in করা সাবটাইটেল। গল্পের ঘোলাটে লাল লেখাটা ঠিক এই জিনিস। আপনার প্ল্যাটফর্মে যদি স্ক্রিন রেকর্ডিং বা স্লাইড ডেক থাকে, সেটাই একমাত্র ক্ষেত্র যেখানে 4:2:2 বা বাড়তি bitrate-এর দাম সত্যিই উশুল হয়।

</Callout>

## Bit depth, colour primaries, আর HDR metadata-র ফাঁদ

**Bit depth** মানে প্রতি sample কত bit। 8-bit দেয় প্রতি component-এ ২৫৬টা ধাপ, 10-bit দেয় ১০২৪টা। এমনকি SDR কন্টেন্টেও 10-bit-এ encode করলে gradient-এ **banding** কমে (আকাশ, ধীরে কালোয় মিলিয়ে যাওয়া দৃশ্য), কারণ encoder-এর হাতে মাঝামাঝি মানগুলো বেশি থাকে — আর প্রায়ই এতে বাড়তি bitrate লাগেই না।

Depth ছাড়াও একটা stream তিন টুকরো colour metadata বহন করে, আর তিনটাই pixel-এর সাথে সাথে ভ্রমণ করতে হয়:

- **Primaries** — সংখ্যাগুলো আসলে কোন লাল, কোন সবুজ আর কোন নীল বোঝাচ্ছে (HD-তে BT.709, UHD/HDR-এ BT.2020)।
- **Transfer characteristics** — সংরক্ষিত মান থেকে আলোতে যাওয়ার বক্ররেখা (SDR-এ BT.709 gamma, HDR-এ PQ বা HLG)।
- **Matrix coefficients** — RGB থেকে YCbCr-এ রূপান্তরে ঠিক কোন হিসাবটা ব্যবহার হয়েছে।

আরেকটা কম আলোচিত কিন্তু সমান বিপজ্জনক ফিল্ড হলো **range**: limited range (luma 16–235) নাকি full range (0–255)। Limited range ডেটাকে full range ধরে decode করলে কালো ধূসর হয়ে যায় আর সাদা পুড়ে যায়।

এগুলো হারিয়ে গেলে বা ভুল লেখা থাকলে ছবিটা জোরে চিৎকার করে ভাঙে না। শুধু দেখতে ভুল লাগে — ফ্যাকাশে, অতিরিক্ত উজ্জ্বল, বা ধূসর আর সমতল। **Tag-only** বাগ — যেখানে pixel ঠিক আছে কিন্তু metadata অন্য কথা বলছে — "এই একটা rendition-এ রঙটা কেমন যেন লাগছে" ধরনের টিকিটের সবচেয়ে বড় একক কারণ।

<Callout type="warning">

Metadata কখনো "ঠিক করে দিতে" গিয়ে অনুমান করবেন না। একটা ফাইলে transfer tag না থাকা আর ভুল transfer tag থাকা — দুটোর মধ্যে দ্বিতীয়টা অনেক বেশি ক্ষতিকর, কারণ প্রথমটায় player যুক্তিসঙ্গত ডিফল্ট নেয়, দ্বিতীয়টায় সে আত্মবিশ্বাসের সাথে ভুল করে। Ingest-এ tag পরীক্ষা করুন, আর অনিশ্চিত হলে অনুমান নয়, ফাইলটা কোয়ারান্টিনে পাঠান।

</Callout>

## Audio, সংক্ষেপে

Audio-র গঠন একই, শুধু নামগুলো আলাদা:

- **Sample rate** — সেকেন্ডে কত sample (ভিডিও ইন্ডাস্ট্রির মান 48 kHz; 44.1 kHz এসেছে CD-র উত্তরাধিকার থেকে)।
- **Bit depth** — প্রতি sample 16-bit বা 24-bit।
- **Channel** — ১ (mono), ২ (stereo), ৬ (5.1)।

48 kHz / 16-bit raw stereo হলো `48000 x 16 x 2 = 1.536 Mbps` — ভিডিওর প্রায় হাজার ভাগের এক ভাগ। এই কারণেই গোটা bitrate ladder জুড়ে audio-কে সাধারণত একটা নির্দিষ্ট 128 kbps-এ ছেড়ে দেওয়া হয়, আর এই কারণেই কোনো audio বাগ _bandwidth_ সমস্যা হওয়ার চেয়ে _timing_ সমস্যা হওয়ার সম্ভাবনা অনেক বেশি।

## একটা raw-video analyzer বানানো

উপরের সবকিছু হাড়ে হাড়ে বোঝার সবচেয়ে ভালো উপায় হলো uncompressed frame নিয়ে সরাসরি কাজ করা। নিচের প্রোগ্রামটা একটা **Y4M** ফাইল পড়ে — এটা অসম্ভব সরল একটা container যা raw YCbCr frame-গুলোকে একটা টেক্সট হেডার দিয়ে মুড়ে রাখে, আর টুল থেকে টুলে raw ভিডিও পাঠানোর আদর্শ উপায় — তারপর:

1. হেডার parse করে resolution, frame rate (rational হিসেবে), chroma format আর colour range বের করে।
2. Raw আকার আর প্রতি frame-এর আকার হিসাব করে, সাথে একটা target bitrate-এর জন্য কত compression লাগবে সেটাও।
3. প্রতিটা frame ঘুরে গড় luma আর আগের frame-এর সাথে পার্থক্যের একটা স্কোর বের করে।
4. একটা নির্বাচিত frame-কে YCbCr 4:2:0 থেকে RGB-তে রূপান্তর করে, chroma upsample করে।
5. Scene-change candidate রিপোর্ট করে — যেটা ঠিক সেই সংকেত যা দেখে encoder keyframe বসায়।

```typescript
import { open, type FileHandle } from 'node:fs/promises';

// --- Types ---------------------------------------------------------------

type ChromaFormat = '420' | '422' | '444' | 'mono';

interface Y4MHeader {
	width: number;
	height: number;
	fpsNum: number;
	fpsDen: number;
	parNum: number;
	parDen: number;
	interlace: string;
	chroma: ChromaFormat;
	headerLength: number; // bytes consumed, including the trailing newline
}

interface FrameStats {
	index: number;
	ptsTicks: number; // exact, in the 1/fpsNum timebase
	ptsSeconds: number; // for display only, never for arithmetic
	averageLuma: number;
	/** Mean absolute luma difference against the previous frame, 0-255. */
	deltaFromPrevious: number;
	isSceneChangeCandidate: boolean;
}

interface Rgb {
	r: number;
	g: number;
	b: number;
}

// A scene cut is a large, abrupt luma discontinuity. Encoders use a similar
// heuristic to decide "stop predicting, start a fresh keyframe here".
const SCENE_CHANGE_THRESHOLD = 18;

// --- Header parsing ------------------------------------------------------

const CHROMA_BY_TAG: Record<string, ChromaFormat> = {
	'420': '420',
	'420jpeg': '420',
	'420mpeg2': '420',
	'420paldv': '420',
	'422': '422',
	'444': '444',
	mono: 'mono'
};

/** Y4M headers are ASCII: `YUV4MPEG2 W1920 H1080 F30000:1001 Ip A1:1 C420\n` */
function parseY4MHeader(buffer: Buffer): Y4MHeader {
	const newline = buffer.indexOf(0x0a);
	if (newline === -1) throw new Error('Y4M: no header terminator found');

	const line = buffer.subarray(0, newline).toString('ascii');
	const [magic, ...params] = line.split(' ');
	if (magic !== 'YUV4MPEG2') throw new Error(`Y4M: bad magic "${magic}"`);

	const header: Y4MHeader = {
		width: 0,
		height: 0,
		fpsNum: 25,
		fpsDen: 1,
		parNum: 1,
		parDen: 1,
		interlace: 'p',
		chroma: '420', // the spec's default when no C tag is present
		headerLength: newline + 1
	};

	for (const param of params) {
		const tag = param[0];
		const value = param.slice(1);
		switch (tag) {
			case 'W':
				header.width = parseInt(value, 10);
				break;
			case 'H':
				header.height = parseInt(value, 10);
				break;
			case 'F': {
				// Kept as numerator and denominator: 30000/1001 must stay exact.
				const [num, den] = value.split(':');
				header.fpsNum = parseInt(num, 10);
				header.fpsDen = parseInt(den, 10);
				break;
			}
			case 'A': {
				const [num, den] = value.split(':');
				header.parNum = parseInt(num, 10);
				header.parDen = parseInt(den, 10);
				break;
			}
			case 'I':
				header.interlace = value;
				break;
			case 'C': {
				const chroma = CHROMA_BY_TAG[value];
				if (!chroma) throw new Error(`Y4M: unsupported chroma "${value}"`);
				header.chroma = chroma;
				break;
			}
			// 'X' is a vendor extension tag; ignoring unknown tags is required
			// by the spec and keeps us forward-compatible.
		}
	}

	if (!header.width || !header.height) throw new Error('Y4M: missing W or H');
	if (!header.fpsDen) throw new Error('Y4M: zero frame-rate denominator');
	return header;
}

// --- Geometry ------------------------------------------------------------

interface PlaneGeometry {
	lumaSize: number;
	chromaWidth: number;
	chromaHeight: number;
	chromaSize: number;
	frameSize: number;
}

function planeGeometry(header: Y4MHeader): PlaneGeometry {
	const lumaSize = header.width * header.height;

	// Subsampling divisors, horizontal and vertical.
	const divisors: Record<ChromaFormat, [number, number]> = {
		'420': [2, 2],
		'422': [2, 1],
		'444': [1, 1],
		mono: [0, 0]
	};

	const [hDiv, vDiv] = divisors[header.chroma];
	if (hDiv === 0) {
		return { lumaSize, chromaWidth: 0, chromaHeight: 0, chromaSize: 0, frameSize: lumaSize };
	}

	// Odd dimensions round up, so a 1921-wide 4:2:0 frame has 961 chroma columns.
	const chromaWidth = Math.ceil(header.width / hDiv);
	const chromaHeight = Math.ceil(header.height / vDiv);
	const chromaSize = chromaWidth * chromaHeight;

	return {
		lumaSize,
		chromaWidth,
		chromaHeight,
		chromaSize,
		frameSize: lumaSize + chromaSize * 2 // Y + Cb + Cr
	};
}

// --- Aspect ratio --------------------------------------------------------

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/** DAR = PAR x storage ratio, reduced to lowest terms for display. */
function displayAspectRatio(header: Y4MHeader): string {
	const num = header.width * header.parNum;
	const den = header.height * header.parDen;
	const divisor = gcd(num, den) || 1;
	return `${num / divisor}:${den / divisor}`;
}

// --- Bitrate arithmetic --------------------------------------------------

interface BitrateReport {
	fps: number;
	frameBytes: number;
	rawBitsPerSecond: number;
	rawBytesPerHour: number;
	samplesPerPixel: number;
}

function bitrateReport(header: Y4MHeader, geometry: PlaneGeometry): BitrateReport {
	const fps = header.fpsNum / header.fpsDen;
	const samplesPerPixel = geometry.frameSize / geometry.lumaSize;
	const rawBitsPerSecond = geometry.frameSize * 8 * fps;

	return {
		fps,
		frameBytes: geometry.frameSize,
		rawBitsPerSecond,
		rawBytesPerHour: (rawBitsPerSecond / 8) * 3600,
		samplesPerPixel
	};
}

/** How hard must the encoder work to hit a delivery bitrate? */
function compressionRatio(report: BitrateReport, targetBitsPerSecond: number): number {
	return report.rawBitsPerSecond / targetBitsPerSecond;
}

// --- Colour conversion ---------------------------------------------------

function clamp8(value: number): number {
	return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

/**
 * BT.709 limited-range YCbCr -> RGB.
 *
 * "Limited range" means luma occupies 16-235 and chroma 16-240 rather than the
 * full 0-255. Decoding limited-range data with a full-range matrix is the
 * classic washed-out-blacks bug, so the range must be known, not assumed.
 */
function ycbcrToRgb(y: number, cb: number, cr: number, fullRange: boolean): Rgb {
	const yScaled = fullRange ? y : ((y - 16) * 255) / 219;
	const cbScaled = fullRange ? cb - 128 : ((cb - 128) * 255) / 224;
	const crScaled = fullRange ? cr - 128 : ((cr - 128) * 255) / 224;

	return {
		r: clamp8(yScaled + 1.5748 * crScaled),
		g: clamp8(yScaled - 0.1873 * cbScaled - 0.4681 * crScaled),
		b: clamp8(yScaled + 1.8556 * cbScaled)
	};
}

/**
 * Convert one frame to a packed RGB buffer.
 *
 * At 4:2:0 chroma sits at quarter resolution, so each chroma sample is reused
 * by a 2x2 block of pixels. This nearest-neighbour upsample is what "throwing
 * away three quarters of the colour" actually looks like on the way back out.
 */
function frameToRgb(
	frame: Buffer,
	header: Y4MHeader,
	geometry: PlaneGeometry,
	fullRange: boolean
): Buffer {
	const { width, height } = header;
	const { lumaSize, chromaWidth, chromaSize } = geometry;
	const rgb = Buffer.alloc(width * height * 3);

	const cbOffset = lumaSize;
	const crOffset = lumaSize + chromaSize;

	for (let row = 0; row < height; row++) {
		const chromaRow = header.chroma === '420' ? row >> 1 : row;
		for (let col = 0; col < width; col++) {
			const chromaCol = header.chroma === '444' ? col : col >> 1;
			const chromaIndex = chromaRow * chromaWidth + chromaCol;

			const y = frame[row * width + col];
			const cb = chromaSize ? frame[cbOffset + chromaIndex] : 128;
			const cr = chromaSize ? frame[crOffset + chromaIndex] : 128;

			const { r, g, b } = ycbcrToRgb(y, cb, cr, fullRange);
			const out = (row * width + col) * 3;
			rgb[out] = r;
			rgb[out + 1] = g;
			rgb[out + 2] = b;
		}
	}

	return rgb;
}

// --- Frame statistics ----------------------------------------------------

function averageLuma(frame: Buffer, lumaSize: number): number {
	let total = 0;
	for (let i = 0; i < lumaSize; i++) total += frame[i];
	return total / lumaSize;
}

/**
 * Mean absolute difference over the luma plane, sampled on a stride.
 *
 * Sampling every 8th pixel is ~8x cheaper than a full comparison and tracks
 * the full-resolution result closely enough for cut detection. Full-precision
 * differencing on a 4K stream is dominated by memory bandwidth, not maths.
 */
function lumaDelta(current: Buffer, previous: Buffer, lumaSize: number, stride = 8): number {
	let total = 0;
	let count = 0;
	for (let i = 0; i < lumaSize; i += stride) {
		total += Math.abs(current[i] - previous[i]);
		count++;
	}
	return count === 0 ? 0 : total / count;
}

// --- Frame reading -------------------------------------------------------

/**
 * Each frame is preceded by a `FRAME` marker line, which may carry per-frame
 * parameters. Returns null at clean end of file.
 */
async function readFrame(
	handle: FileHandle,
	position: number,
	frameSize: number
): Promise<{ frame: Buffer; nextPosition: number } | null> {
	// The marker is short; read a small window and find its terminator.
	const markerWindow = Buffer.alloc(64);
	const { bytesRead } = await handle.read(markerWindow, 0, 64, position);
	if (bytesRead === 0) return null;

	const newline = markerWindow.indexOf(0x0a);
	if (newline === -1) throw new Error('Y4M: malformed FRAME marker');
	if (markerWindow.subarray(0, 5).toString('ascii') !== 'FRAME') {
		throw new Error('Y4M: expected FRAME marker, stream is desynchronised');
	}

	const dataStart = position + newline + 1;
	const frame = Buffer.alloc(frameSize);
	const read = await handle.read(frame, 0, frameSize, dataStart);
	if (read.bytesRead < frameSize) return null; // truncated trailing frame

	return { frame, nextPosition: dataStart + frameSize };
}

// --- Orchestration -------------------------------------------------------

interface AnalysisResult {
	header: Y4MHeader;
	geometry: PlaneGeometry;
	bitrate: BitrateReport;
	frames: FrameStats[];
	sceneChanges: number[];
	durationSeconds: number;
}

async function analyze(path: string, maxFrames = Infinity): Promise<AnalysisResult> {
	const handle = await open(path, 'r');
	try {
		const headerWindow = Buffer.alloc(512);
		await handle.read(headerWindow, 0, 512, 0);
		const header = parseY4MHeader(headerWindow);
		const geometry = planeGeometry(header);
		const bitrate = bitrateReport(header, geometry);

		const frames: FrameStats[] = [];
		const sceneChanges: number[] = [];
		let previous: Buffer | null = null;
		let position = header.headerLength;
		let index = 0;

		while (index < maxFrames) {
			const next = await readFrame(handle, position, geometry.frameSize);
			if (!next) break;

			const delta = previous ? lumaDelta(next.frame, previous, geometry.lumaSize) : 0;
			const isSceneChangeCandidate = index > 0 && delta > SCENE_CHANGE_THRESHOLD;
			if (isSceneChangeCandidate) sceneChanges.push(index);

			frames.push({
				index,
				// Integer ticks in a 1/fpsNum timebase stay exact for 29.97.
				ptsTicks: index * header.fpsDen,
				ptsSeconds: (index * header.fpsDen) / header.fpsNum,
				averageLuma: averageLuma(next.frame, geometry.lumaSize),
				deltaFromPrevious: delta,
				isSceneChangeCandidate
			});

			previous = next.frame;
			position = next.nextPosition;
			index++;
		}

		return {
			header,
			geometry,
			bitrate,
			frames,
			sceneChanges,
			durationSeconds: frames.length / bitrate.fps
		};
	} finally {
		await handle.close();
	}
}

// --- Reporting -----------------------------------------------------------

function gigabytes(bytes: number): string {
	return (bytes / 1024 ** 3).toFixed(2);
}

function megabits(bitsPerSecond: number): string {
	return (bitsPerSecond / 1_000_000).toFixed(1);
}

function report(result: AnalysisResult, targetBitsPerSecond: number): void {
	const { header, geometry, bitrate } = result;

	console.log('--- Source ---');
	console.log(`  resolution      ${header.width}x${header.height}`);
	console.log(
		`  frame rate      ${header.fpsNum}/${header.fpsDen} (${bitrate.fps.toFixed(3)} fps)`
	);
	console.log(`  pixel aspect    ${header.parNum}:${header.parDen}`);
	console.log(`  display aspect  ${displayAspectRatio(header)}`);
	console.log(`  chroma          ${header.chroma} (${bitrate.samplesPerPixel} samples/pixel)`);
	console.log(`  interlace       ${header.interlace}`);

	console.log('--- Raw cost ---');
	console.log(`  per frame       ${(geometry.frameSize / 1024 / 1024).toFixed(2)} MB`);
	console.log(`  raw bitrate     ${megabits(bitrate.rawBitsPerSecond)} Mbps`);
	console.log(`  one hour raw    ${gigabytes(bitrate.rawBytesPerHour)} GB`);
	console.log(`  target          ${megabits(targetBitsPerSecond)} Mbps`);
	console.log(`  ratio needed    ${compressionRatio(bitrate, targetBitsPerSecond).toFixed(0)}:1`);

	console.log('--- Content ---');
	console.log(`  frames read     ${result.frames.length}`);
	console.log(`  duration        ${result.durationSeconds.toFixed(2)}s`);
	console.log(`  scene changes   ${result.sceneChanges.length}`);
	for (const index of result.sceneChanges.slice(0, 10)) {
		const frame = result.frames[index];
		console.log(
			`    frame ${index} @ ${frame.ptsSeconds.toFixed(2)}s (delta ${frame.deltaFromPrevious.toFixed(1)})`
		);
	}
}

// --- Entry point ---------------------------------------------------------

async function main(): Promise<void> {
	const path = process.argv[2] ?? './ibn-sina-lecture.y4m';
	const targetMbps = parseFloat(process.argv[3] ?? '5');

	const result = await analyze(path, 300);
	report(result, targetMbps * 1_000_000);

	// Convert one frame out to RGB to prove the colour path end to end.
	const handle = await open(path, 'r');
	try {
		const frame = await readFrame(handle, result.header.headerLength, result.geometry.frameSize);
		if (frame) {
			const rgb = frameToRgb(frame.frame, result.header, result.geometry, false);
			console.log('--- First frame, top-left pixel ---');
			console.log(`  R=${rgb[0]} G=${rgb[1]} B=${rgb[2]}`);
		}
	} finally {
		await handle.close();
	}
}

main().catch((error) => {
	console.error(`analyze failed: ${error instanceof Error ? error.message : error}`);
	process.exit(1);
});
```

## এই ইমপ্লিমেন্টেশনে যা যা প্রোডাকশন-গ্রেড

- **Rational frame rate** — frame rate numerator আর denominator হিসেবেই রাখা, তাই 30000/1001 হুবহু থাকে আর দীর্ঘ ফাইলে timestamp সরে যায় না
- **Integer PTS tick** — timestamp হিসাব হয় timebase-এর integer tick-এ, float সেকেন্ড কেবল প্রিন্ট করার জন্য
- **স্পষ্ট chroma geometry** — plane-এর আকার subsampling অনুপাত থেকে বের করা, বেজোড় dimension-এর জন্য সঠিক rounding সহ; 4:2:0 ধরে নেওয়া হয়নি
- **Range-সচেতন colour conversion** — limited না full range, সেটা প্যারামিটার, অনুমান নয়; সঠিক কালো আর ফ্যাকাশে কালোর পার্থক্য এখানেই
- **Streaming read** — frame এক এক করে buffered reader দিয়ে পড়া, তাই 4K সোর্স মেমরিতে ধরার দরকার নেই
- **Truncation সহনশীল** — শেষে অসম্পূর্ণ frame থাকলে exception নয়, পরিষ্কারভাবে scan শেষ হয়; বাস্তবের ক্যাপচার মাঝপথে কাটা পড়ে
- **Strided differencing** — scene detection পুরো luma plane নয়, নমুনা তুলনা করে, তাই scan CPU-bound না হয়ে I/O-bound থাকে

<div class="takeaways">

### মূল শেখা

- ভিডিও হলো ঘড়ি-বাঁধা স্থির frame-এর স্তূপ; পরের সব সিস্টেমের অস্তিত্বের কারণ একটাই — 1080p30-এ raw frame মানে প্রায় ১.৫ Gbps
- Frame rate সবসময় rational হিসেবে রাখুন (30000/1001), কখনো float নয় — নইলে দীর্ঘ কন্টেন্টে audio আর video আলাদা হয়ে যায়
- Codec RGB-তে নয়, YCbCr-এ কাজ করে, যাতে bit খরচ করা যায় উজ্জ্বলতায় (যা চোখ ধরে) আর কম দেওয়া যায় রঙে (যা চোখ ধরে না)
- 4:2:0 chroma subsampling বিনামূল্যে রঙের তিন-চতুর্থাংশ ফেলে দেয় আর সেটাই delivery-র ডিফল্ট — ব্যতিক্রম শুধু screen content আর ধারালো রঙিন কিনারা
- Colour primaries, transfer curve আর matrix pixel-এর সাথেই ভ্রমণ করতে হবে; tag ভুল হলে pixel ঠিক থেকেও ভিডিও "দেখতে ভুল" লাগে
- PAR আর DAR আলাদা জিনিস; পুরনো ফুটেজ ingest-এর সময়েই square pixel আর CFR-এ normalise করুন, segmenter পর্যন্ত টেনে নিয়ে যাবেন না
- Audio ভিডিওর হাজার ভাগের এক ভাগ ডেটা — তাই audio-র সমস্যা প্রায় সবসময় bandwidth নয়, timing

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **FFmpeg** raw ভিডিও আদান-প্রদানের আদর্শ ফরম্যাট হিসেবে Y4M ব্যবহার করে, আর টুল থেকে টুলে pipe করার সময় ঠিক এই হেডার ফিল্ডগুলোই দেখায়
- **Netflix** SDR delivery-র জন্যও 10-bit-এ encode আর মূল্যায়ন করে, কারণ বাড়তি precision-এ banding কমে অথচ bitrate কার্যত বাড়ে না
- **YouTube** প্রতিটা আপলোডকে encoding ladder-এ পাঠানোর আগে constant frame rate আর square pixel-এ normalise করে নেয়
- **Broadcast workflow**-এ এখনো 4:2:2 আর non-square pixel aspect ratio চলে, আর সেজন্যই ingest pipeline-এ PAR 1:1 ধরে নেওয়া চলে না, স্পষ্টভাবে হ্যান্ডল করতে হয়
- **ভিডিও কল প্ল্যাটফর্ম** (Zoom, Meet) স্ক্রিন শেয়ারের সময় আলাদা encoding প্রোফাইলে যায়, ঠিক এই কারণেই — ক্যামেরার জন্য যা যথেষ্ট, লেখা-ভরা স্ক্রিনের জন্য তা নয়

</div>
