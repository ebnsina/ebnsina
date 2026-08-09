---
title: 'স্ট্রিমিংয়ের জন্য packaging'
subtitle: 'Segmentation-এর ট্রেড-অফ, HLS playlist আর DASH MPD-র প্রতিটা লাইন আসলে কী বলে, CMAF কীভাবে দুটোকে এক সেট segment-এ মেলায়, byte-range addressing, common encryption আর DRM, আর caption ও একাধিক অডিও ট্র্যাক।'
chapter: 6
level: 'intermediate'
readingTime: '২৪ মিনিট'
topics:
  [
    'segmentation',
    'HLS',
    'DASH',
    'CMAF',
    'byte-range',
    'common encryption',
    'DRM',
    'captions',
    'audio tracks'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

আগের চ্যাপ্টার শেষে আপনার হাতে ছয়-সাতটা encoded rendition — প্রতিটা আলাদা resolution আর bitrate-এ, প্রতিটায় keyframe ঠিক একই টাইমস্ট্যাম্পে। কিন্তু এই ফাইলগুলো এখনো **স্ট্রিমযোগ্য নয়**। player-কে যদি সাতটা MP4-এর একটা তালিকা ধরিয়ে দেন, সে জানে না কোনটা নেবে, জানে না কোথা থেকে শুরু করবে, আর মাঝপথে rendition বদলাতে গেলে তাকে পুরো ফাইল আবার নামাতে হবে।

**Packaging** হলো সেই ধাপ যা encoded rendition গুলোকে player-এর পড়ার মতো একটা কাঠামোয় সাজায়। মূলত দুটো কাজ:

1. প্রতিটা rendition-কে ছোট ছোট **segment**-এ কাটা, যাতে player এক এক টুকরো করে নামাতে পারে আর টুকরোর সীমানায় rendition বদলাতে পারে।
2. একটা **manifest** লেখা — একটা টেক্সট ফাইল যা player-কে বলে দেয় কী কী rendition আছে, প্রতিটার bitrate আর resolution কত, আর প্রতিটার segment গুলো কোন URL-এ।

Packaging-এ কোনো re-encoding নেই। বিট একই থাকে, শুধু নতুন করে মোড়ানো হয় — এই কারণেই packaging দ্রুত, সস্তা, আর প্রায়ই on-the-fly করা যায়।

## গল্পে বুঝি

বাগদাদের বায়তুল হিকমার নকল-বিভাগে আল-বিরুনি একটা বিশাল গ্রন্থ নকল করার দায়িত্ব পেলেন — সাতশো পাতার একটা জ্যোতির্বিদ্যার সংকলন। প্রথমে তিনি যা করলেন সেটাই স্বাভাবিক: পুরো গ্রন্থটা এক টুকরো লম্বা চামড়ার খাতায় বাঁধিয়ে ফেললেন। এক খণ্ড, সাতশো পাতা, বিশাল ওজন।

সমস্যাটা ধরা পড়ল প্রথম পাঠকের হাতেই। কর্ডোবা থেকে আসা এক ছাত্র শুধু ত্রয়োদশ অধ্যায়টা পড়তে চেয়েছিল। কিন্তু গোটা খণ্ড এক বাঁধাই — সে পুরোটা কোলে তুলে না নিলে ওই অধ্যায়ে পৌঁছাতেই পারে না। আর যখন তার হাত ব্যথা করতে শুরু করল আর সে হালকা কাগজে লেখা সস্তা সংস্করণটায় যেতে চাইল, তাকে আবার শুরু থেকে শুরু করতে হলো, কারণ দুই সংস্করণের বাঁধাই এক জায়গায় ভাগ হয়নি।

আল-বিরুনি তখন পদ্ধতি বদলালেন। তিনি গোটা গ্রন্থটাকে **কুররাসা**-য় ভাগ করলেন — ছোট ছোট বাঁধাই, প্রতিটায় আট পাতা, আর প্রতিটা কুররাসা সবসময় একটা অধ্যায়ের শুরু থেকে শুরু হয়, মাঝখান থেকে নয়। পাঠক এখন শুধু যে কয়টা কুররাসা দরকার সেগুলোই নেয়। কুররাসা কত পাতার হবে সেটা নিয়ে তিনি অনেক ভেবেছিলেন। দুই পাতার কুররাসা বানিয়ে দেখলেন — পাঠক দ্রুত শুরু করতে পারে, কিন্তু তিনশো কুররাসার হিসাব রাখতে গিয়ে তালিকা-খাতাটাই গ্রন্থের সমান মোটা হয়ে গেল, আর কেরানিকে তিনশোবার তাক থেকে জিনিস আনতে হলো। চল্লিশ পাতার কুররাসা বানিয়ে দেখলেন — হিসাব সহজ, কিন্তু পাঠককে প্রথম বাক্যটা পড়তে অনেকক্ষণ অপেক্ষা করতে হয়, আর সংস্করণ বদলাতে চাইলে চল্লিশ পাতা শেষ না হওয়া পর্যন্ত অপেক্ষা। শেষে তিনি আটে থামলেন — যথেষ্ট ছোট যে শুরু করা দ্রুত, যথেষ্ট বড় যে হিসাব বাড়াবাড়ি নয়।

এরপর দরকার হলো একটা **ফিহরিস্ত** — সূচিপত্র। কিন্তু আল-বিরুনি দুটো আলাদা ফিহরিস্ত বানালেন। প্রথমটা ছোট, এক পাতার, দরজার পাশে ঝোলানো: "এই গ্রন্থের তিনটে সংস্করণ আছে — মোটা চামড়ায় দামি, মাঝারি কাগজে সাধারণ, পাতলা কাগজে সস্তা; প্রত্যেকটার ওজন এই, ভাষা আরবি।" পাঠক এই তালিকা দেখে ঠিক করে কোন সংস্করণে যাবে। দ্বিতীয় ফিহরিস্ত প্রতিটা সংস্করণের নিজের — সেখানে ওই সংস্করণের সব কুররাসার ক্রম, প্রতিটার তাক নম্বর, আর প্রতিটার পাতা সংখ্যা।

তারপর এল অনুবাদ। একই গ্রন্থ ফারসি আর লাতিনে অনুবাদ হলো, আর অন্ধ পাঠকদের জন্য পাশে একটা পাঠ্য-সংস্করণও রাখা হলো। আল-বিরুনি এগুলোর জন্য নতুন করে গোটা গ্রন্থ নকল করেননি — মূল কুররাসার পাশাপাশি অনুবাদের আলাদা কুররাসা রেখেছেন, একই অধ্যায়সীমায় কাটা, আর দরজার তালিকায় লিখে দিয়েছেন কোনটা কোন ভাষার। পাঠক আরবি লেখা নিয়ে ফারসি ব্যাখ্যা পড়তে পারে।

আর সবশেষে খলিফার একটা নির্দেশ এল: এই গ্রন্থের কিছু অধ্যায় শুধু অনুমোদিত পণ্ডিতরা পড়তে পারবেন। আল-বিরুনি তখন ওই কুররাসাগুলো একটা তালাবদ্ধ সিন্দুকে রাখলেন, আর চাবিটা রাখলেন **সম্পূর্ণ আলাদা একটা দপ্তরে** — যে দপ্তর প্রথমে পাঠকের পরিচয়পত্র দেখে, তারপর চাবি দেয়। মজার ব্যাপার হলো, তালার নকশা আর সিন্দুকের গড়ন সবার জন্য একই; শুধু কে চাবি পাবে সেই নিয়মটা দপ্তরভেদে আলাদা। আর কোন গ্রন্থে তালা লাগবে সেটা ঠিক করেছিলেন গ্রন্থকার আর পৃষ্ঠপোষক — নকলনবিশ নয়।

মিলিয়ে নিই: এক বাঁধাইয়ের সাতশো পাতা হলো **progressive download**, আট পাতার কুররাসা হলো **segment**, কুররাসার আকার বাছার টানাপোড়েন হলো **segment duration-এর ট্রেড-অফ**, প্রতিটা কুররাসা অধ্যায়ের শুরু থেকে শুরু হওয়া হলো **প্রতিটা segment keyframe দিয়ে শুরু**, দরজার তালিকা হলো **master playlist / MPD**, প্রতিটা সংস্করণের নিজের ফিহরিস্ত হলো **media playlist**, তিনটে সংস্করণ হলো **rendition**, অনুবাদ আর পাঠ্য-সংস্করণ হলো **alternate audio track আর caption**, তালাবদ্ধ সিন্দুক হলো **common encryption**, আলাদা দপ্তরের চাবি হলো **DRM license server**, আর "তালার নকশা এক, চাবির নিয়ম আলাদা" — ঠিক এটাই CENC-এর মূল ধারণা।

## Segmentation

Segment হলো একটা rendition-এর কয়েক সেকেন্ডের টুকরো, যেটা নিজে থেকে ডিকোড করা শুরু করা যায়। তিনটে নিয়ম মানতেই হবে:

- **প্রতিটা segment একটা keyframe দিয়ে শুরু হবে।** নইলে player সেই segment থেকে শুরু করতেই পারবে না।
- **প্রতিটা rendition-এ segment সীমানা একই টাইমস্ট্যাম্পে পড়বে।** এটাই আগের চ্যাপ্টারের keyframe alignment-এর সরাসরি ফল।
- **Segment-এর দৈর্ঘ্য যথাসম্ভব সমান।** অসম দৈর্ঘ্য player-এর buffer হিসাব আর ABR সিদ্ধান্ত দুটোই বিভ্রান্ত করে।

### Segment duration-এর ট্রেড-অফ

এটাই packaging-এর সবচেয়ে গুরুত্বপূর্ণ একক সিদ্ধান্ত, কারণ এই একটা সংখ্যা একসাথে startup time, latency, CDN দক্ষতা আর encoding দক্ষতা — সবকিছুকে টানে।

| Segment duration | সুবিধা                                                            | অসুবিধা                                                                     |
| ---------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1–2 সেকেন্ড      | দ্রুত startup, দ্রুত rendition switch, live-এ কম latency          | অনেক বেশি HTTP request, manifest মোটা, keyframe ঘনঘন বলে encoding দক্ষতা কম |
| 4 সেকেন্ড        | ভারসাম্য — বেশিরভাগ VOD-এর ডিফল্ট                                 | live latency এখনো মোটামুটি বেশি                                             |
| 6–10 সেকেন্ড     | কম request, ভালো compression (কম keyframe), CDN cache-এ কম object | startup ধীর, switch ধীর, live latency অনেক বেশি                             |

কারণগুলো একটু খুলে বলা দরকার:

**Startup time।** player প্রথম ফ্রেম দেখানোর আগে অন্তত একটা segment (প্রায়ই দুটো) নামায়। ১০ সেকেন্ডের segment মানে প্রথম বাইট থেকে প্রথম ছবি পর্যন্ত ১০ সেকেন্ডের ডেটা নামানো — ধীর কানেকশনে এটা কয়েক সেকেন্ডের দৃশ্যমান দেরি।

**Switching latency।** player যখন ঠিক করে rendition বদলাবে, সে চলতি segment শেষ হওয়ার আগে বদলাতে পারে না (বা বদলালে যা নামানো হয়েছে তা ফেলে দিতে হয়)। বড় segment মানে সিদ্ধান্ত আর কার্যকর হওয়ার মধ্যে বড় ব্যবধান — নেটওয়ার্ক পড়ে গেলে player তত দেরিতে প্রতিক্রিয়া দেখায়।

**Encoding দক্ষতা।** প্রতিটা segment keyframe দিয়ে শুরু, আর keyframe হলো stream-এর সবচেয়ে দামি ফ্রেম — একটা I-frame সহজেই একটা P-frame-এর ২০-৫০ গুণ বড়। ২ সেকেন্ডের segment মানে ১০ সেকেন্ডের চেয়ে পাঁচ গুণ বেশি keyframe, যা একই quality-তে সহজেই **৫–১৫% বেশি bitrate** চায়।

**HTTP overhead আর CDN।** ২ ঘণ্টার সিনেমা, ৬ rendition, ২ সেকেন্ডের segment = ২১,৬০০টা ফাইল। ১০ সেকেন্ডে = ৪,৩২০টা। প্রতিটা object আলাদা করে CDN-এ cache হয়, আলাদা করে expire হয়, আর প্রতিটার জন্য আলাদা request।

<Callout type="tip">

ব্যবহারিক ডিফল্ট: **VOD-এ ৪ সেকেন্ড, live-এ ২ সেকেন্ড**, আর দুটোই keyframe interval-এর গুণিতক (২ সেকেন্ড GOP হলে ৪ সেকেন্ড segment = ঠিক ২টা GOP)। এই মিলটা জরুরি — segment duration যদি GOP-এর গুণিতক না হয়, packager হয় segment-এর ভেতরে বাড়তি keyframe খোঁজে, নয় segment-এর দৈর্ঘ্য অসম হয়ে যায়।

</Callout>

<Callout type="warning">

Segment duration পরে বদলানো কঠিন। ইতিমধ্যে প্যাকেজ করা লাইব্রেরিতে duration বদলাতে হলে প্রতিটা টাইটেল আবার প্যাকেজ করতে হয় (re-encode লাগে না, কিন্তু পুরো লাইব্রেরিতে হাঁটতে হয়), আর CDN-এর সব cached object অকেজো হয়ে যায়। শুরুতেই ভেবে ঠিক করুন।

</Callout>

## HLS: দুই স্তরের playlist

HLS (HTTP Live Streaming, Apple-এর তৈরি) হলো সবচেয়ে বেশি ব্যবহৃত স্ট্রিমিং ফরম্যাট, মূলত কারণ iOS-এ কার্যত এটাই একমাত্র পথ। এর manifest হলো `.m3u8` — একটা সাধারণ UTF-8 টেক্সট ফাইল, প্রতিটা লাইন হয় একটা tag (`#EXT` দিয়ে শুরু) নয় একটা URI।

HLS-এ দুই স্তর: **master playlist** (variant গুলোর তালিকা) আর **media playlist** (একটা variant-এর segment তালিকা)।

<Mermaid
title="HLS two-level playlist structure"
code={`graph TD
  M["master.m3u8<br/>lists every variant"] --> V1["1080p/index.m3u8"]
  M --> V2["720p/index.m3u8"]
  M --> V3["480p/index.m3u8"]
  M --> A1["audio/ar/index.m3u8"]
  M --> A2["audio/fa/index.m3u8"]
  M --> S1["subs/ar/index.m3u8"]
  V2 --> G1["seg-00001.m4s"]
  V2 --> G2["seg-00002.m4s"]
  V2 --> G3["seg-00003.m4s"]`}
/>

### Master playlist

```m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS

# --- Alternate audio renditions -------------------------------------------
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac-128k",NAME="Arabic",LANGUAGE="ar",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="audio/ar/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac-128k",NAME="Persian",LANGUAGE="fa",DEFAULT=NO,AUTOSELECT=YES,CHANNELS="2",URI="audio/fa/index.m3u8"

# --- Subtitles -------------------------------------------------------------
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Arabic",LANGUAGE="ar",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="subs/ar/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI="subs/en/index.m3u8"

# --- Video variants, lowest first -----------------------------------------
#EXT-X-STREAM-INF:BANDWIDTH=628000,AVERAGE-BANDWIDTH=500000,CODECS="avc1.4d401e,mp4a.40.2",RESOLUTION=640x360,FRAME-RATE=29.970,AUDIO="aac-128k",SUBTITLES="subs"
360p/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=1888000,AVERAGE-BANDWIDTH=1600000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=960x540,FRAME-RATE=29.970,AUDIO="aac-128k",SUBTITLES="subs"
540p/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=3428000,AVERAGE-BANDWIDTH=3000000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1280x720,FRAME-RATE=29.970,AUDIO="aac-128k",SUBTITLES="subs"
720p/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=5628000,AVERAGE-BANDWIDTH=5000000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=1920x1080,FRAME-RATE=29.970,AUDIO="aac-128k",SUBTITLES="subs"
1080p/index.m3u8

# --- I-frame only playlists, for scrubbing thumbnails ----------------------
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=180000,CODECS="avc1.4d401e",RESOLUTION=640x360,URI="360p/iframe.m3u8"
```

লাইন ধরে ধরে কী বলছে:

- **`#EXTM3U`** — ফাইলের প্রথম লাইন, বাধ্যতামূলক। না থাকলে এটা m3u8 নয়।
- **`#EXT-X-VERSION:7`** — কোন সংস্করণের ফিচার ব্যবহার হচ্ছে। ৭ মানে fragmented MP4 segment সমর্থিত (নইলে শুধু MPEG-TS)।
- **`#EXT-X-INDEPENDENT-SEGMENTS`** — প্রতিটা segment স্বাধীনভাবে ডিকোডযোগ্য, অর্থাৎ প্রতিটা keyframe দিয়ে শুরু। player এটা দেখে জানে যেকোনো segment সীমানায় নিরাপদে switch করা যাবে। এটাই আগের চ্যাপ্টারের alignment চুক্তির লিখিত ঘোষণা।
- **`#EXT-X-MEDIA`** — একটা alternate rendition ঘোষণা করে যা ভিডিওর অংশ নয়: অডিও ট্র্যাক, subtitle, বা closed caption। `GROUP-ID` দিয়ে গুচ্ছ বাঁধা হয়, আর ভিডিও variant তার `AUDIO=`/`SUBTITLES=` অ্যাট্রিবিউটে সেই গুচ্ছের নাম বলে দেয়।
- **`BANDWIDTH`** — এই variant-এর **সর্বোচ্চ** peak bitrate, আর এটাই player-এর ABR সিদ্ধান্তের প্রধান ইনপুট। **`AVERAGE-BANDWIDTH`** গড়। দুটোই দেওয়া উচিত: peak না দিলে player একটা কঠিন segment-এ হঠাৎ আটকে যেতে পারে, গড় না দিলে player অকারণে রক্ষণশীল হয়।
- **`CODECS`** — RFC 6381 ফরম্যাটে সঠিক codec, profile আর level। `avc1.4d401f` মানে H.264 Main profile, level 3.1। **এটা ভুল বা অনুপস্থিত হলে player ওই variant-টাই বাদ দিয়ে দেয়**, কারণ সে জানে না ডিভাইস ডিকোড করতে পারবে কি না। HLS-এর সবচেয়ে সাধারণ "একটা rendition কেন কাজ করছে না" বাগ এটাই।
- **`RESOLUTION` আর `FRAME-RATE`** — player এগুলো দেখে স্ক্রিনের চেয়ে বড় rendition বাছা এড়াতে পারে।
- **`#EXT-X-I-FRAME-STREAM-INF`** — শুধু keyframe নিয়ে একটা আলাদা playlist, যেটা scrub করার সময় দ্রুত প্রিভিউ দেখাতে ব্যবহার হয়।

<Callout type="info">

Master playlist-এ variant-এর **ক্রম গুরুত্বপূর্ণ**। বেশিরভাগ player প্রথম variant দিয়ে শুরু করে, তারপর মাপজোক করে ওঠানামা করে। সবচেয়ে উঁচুটা প্রথমে রাখলে ধীর কানেকশনের দর্শক প্রথম কয়েক সেকেন্ড buffering দেখে; সবচেয়ে নিচুটা প্রথমে রাখলে ভালো কানেকশনের দর্শক প্রথম কয়েক সেকেন্ড ঝাপসা ছবি দেখে। প্রচলিত অভ্যাস — নিচ থেকে দ্বিতীয় বা তৃতীয় variant-টা প্রথমে রাখা, যাতে দুই দিকেই ক্ষতি কম হয়।

</Callout>

### Media playlist (VOD)

```m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MAP:URI="init.mp4"

#EXTINF:4.004,
seg-00001.m4s
#EXTINF:4.004,
seg-00002.m4s
#EXTINF:4.004,
seg-00003.m4s
#EXTINF:2.669,
seg-00004.m4s
#EXT-X-ENDLIST
```

- **`#EXT-X-TARGETDURATION:4`** — কোনো segment এর চেয়ে লম্বা নয় (উপরের দিকে গোল করা পূর্ণসংখ্যা)। player এটা দিয়ে buffer আর live playlist-এর reload সময় হিসাব করে।
- **`#EXT-X-MEDIA-SEQUENCE:0`** — playlist-এর প্রথম segment-এর ক্রমিক নম্বর। VOD-এ সবসময় ০; live-এ প্রতিবার সবচেয়ে পুরনো segment বাদ পড়লে এটা বাড়ে, আর player এই সংখ্যা দেখেই বোঝে সে কতটা পিছিয়ে পড়েছে।
- **`#EXT-X-PLAYLIST-TYPE:VOD`** — এই playlist আর কখনো বদলাবে না, player একবার নামিয়ে ক্যাশ করে রাখতে পারে।
- **`#EXT-X-MAP:URI="init.mp4"`** — **initialization segment**। fMP4 ব্যবহার করলে codec configuration (SPS/PPS, track মেটাডেটা) আলাদা একটা ছোট ফাইলে থাকে, প্রতিটা segment-এ নয়। player যেকোনো segment ডিকোড করার আগে এটা একবার নামায়। MPEG-TS-এ এই ট্যাগ লাগে না, কারণ TS-এ configuration প্রতিটা segment-এই পুনরাবৃত্তি হয় — যেটা সরল, কিন্তু অপচয়।
- **`#EXTINF:4.004,`** — পরের segment-এর সঠিক দৈর্ঘ্য, সেকেন্ডে। ভগ্নাংশ লক্ষ করুন: 29.97 fps-এ ১২০ ফ্রেম মানে ঠিক ৪ নয়, 4.004 সেকেন্ড। এটাকে ৪ লিখে দিলে দুই ঘণ্টার সিনেমায় প্রায় চার সেকেন্ডের drift জমে।
- **`#EXT-X-ENDLIST`** — stream শেষ। live playlist-এ এই লাইনটা থাকে না, আর player তার অনুপস্থিতি দেখেই বোঝে playlist আবার নামাতে হবে।

<Callout type="warning">

`#EXTINF`-এর মান রাউন্ড করবেন না। player এই মানগুলো যোগ করে টাইমলাইন বানায়, আর seek করার সময় ওই যোগফল ধরে segment খোঁজে। প্রতিটা segment-এ ০.০০৪ সেকেন্ডের ভুল দুই ঘণ্টা পরে কয়েক সেকেন্ডের ভুল seek-এ পরিণত হয়। packager-কে সবসময় সঠিক duration লিখতে দিন।

</Callout>

## DASH: MPD-র কাঠামো

DASH (MPEG-DASH) একই সমস্যার একটা ISO স্ট্যান্ডার্ড সমাধান। এর manifest হলো একটা XML ফাইল — **MPD** (Media Presentation Description)। HLS-এর দুই-ফাইল কাঠামোর বদলে DASH সবকিছু একটা ফাইলে রাখে, একটা নেস্টেড শ্রেণিবিন্যাসে:

```text
MPD
 └─ Period            একটা সময়সীমা (সাধারণত পুরো ভিডিও; বিজ্ঞাপনের জন্য একাধিক)
     └─ AdaptationSet একটা মিডিয়া টাইপ + ভাষা (সব ভিডিও rendition একসাথে, বা এক ভাষার অডিও)
         └─ Representation  একটা rendition (একটা resolution/bitrate জোড়া)
             └─ SegmentTemplate  segment-এর URL কীভাবে বানাতে হবে তার নিয়ম
```

মূল ধারণাগত পার্থক্যটা এখানেই: HLS প্রতিটা segment-এর URL আলাদা করে **তালিকা করে**, DASH বেশিরভাগ সময় একটা **টেমপ্লেট** দেয় আর player নিজে URL বানিয়ে নেয়। দুই ঘণ্টার ভিডিওতে এতে manifest-এর আকার কয়েকশো KB থেকে কয়েক KB-তে নেমে আসে।

```xml
<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"
     profiles="urn:mpeg:dash:profile:isoff-live:2011"
     type="static"
     mediaPresentationDuration="PT1H58M23.4S"
     minBufferTime="PT4S">

  <Period id="main" start="PT0S">

    <!-- Video: every rendition lives in one AdaptationSet, because the
         player is allowed to switch freely between them. -->
    <AdaptationSet id="1" contentType="video" mimeType="video/mp4"
                   segmentAlignment="true" startWithSAP="1"
                   par="16:9" maxFrameRate="30000/1001">

      <SegmentTemplate
        timescale="90000"
        duration="360360"
        startNumber="1"
        initialization="$RepresentationID$/init.mp4"
        media="$RepresentationID$/seg-$Number%05d$.m4s" />

      <Representation id="360p"  codecs="avc1.4d401e" width="640"  height="360"  bandwidth="500000"  />
      <Representation id="540p"  codecs="avc1.4d401f" width="960"  height="540"  bandwidth="1600000" />
      <Representation id="720p"  codecs="avc1.4d401f" width="1280" height="720"  bandwidth="3000000" />
      <Representation id="1080p" codecs="avc1.640028" width="1920" height="1080" bandwidth="5000000" />
    </AdaptationSet>

    <!-- Audio: one AdaptationSet per language, because the player must not
         switch between languages on its own. -->
    <AdaptationSet id="2" contentType="audio" mimeType="audio/mp4"
                   lang="ar" segmentAlignment="true" startWithSAP="1">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="main"/>
      <SegmentTemplate timescale="48000" duration="192192" startNumber="1"
        initialization="audio/ar/init.mp4"
        media="audio/ar/seg-$Number%05d$.m4s" />
      <Representation id="audio-ar" codecs="mp4a.40.2" audioSamplingRate="48000" bandwidth="128000">
        <AudioChannelConfiguration
          schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/>
      </Representation>
    </AdaptationSet>

    <AdaptationSet id="3" contentType="audio" mimeType="audio/mp4"
                   lang="fa" segmentAlignment="true" startWithSAP="1">
      <SegmentTemplate timescale="48000" duration="192192" startNumber="1"
        initialization="audio/fa/init.mp4"
        media="audio/fa/seg-$Number%05d$.m4s" />
      <Representation id="audio-fa" codecs="mp4a.40.2" audioSamplingRate="48000" bandwidth="128000"/>
    </AdaptationSet>

    <!-- Subtitles as a separate, tiny AdaptationSet. -->
    <AdaptationSet id="4" contentType="text" mimeType="application/mp4" lang="en">
      <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
      <SegmentTemplate timescale="1000" duration="4004" startNumber="1"
        initialization="subs/en/init.mp4"
        media="subs/en/seg-$Number%05d$.m4s" />
      <Representation id="subs-en" codecs="stpp" bandwidth="1000"/>
    </AdaptationSet>

  </Period>
</MPD>
```

গুরুত্বপূর্ণ বিন্দুগুলো:

- **`segmentAlignment="true"`** — একই AdaptationSet-এর সব Representation-এ segment সীমানা মিলে যায়। HLS-এর `EXT-X-INDEPENDENT-SEGMENTS`-এর সমতুল্য ঘোষণা।
- **`startWithSAP="1"`** — প্রতিটা segment একটা Stream Access Point (কার্যত keyframe) দিয়ে শুরু।
- **`timescale` আর `duration`** — সময় ভগ্নাংশে নয়, পূর্ণসংখ্যা tick-এ। `timescale="90000"` মানে প্রতি সেকেন্ডে ৯০০০০ tick, আর `duration="360360"` মানে ঠিক 4.004 সেকেন্ড। চ্যাপ্টার ১-এর rational timing-এর নিয়মটাই এখানে ফিরে এসেছে — float নয়, ভগ্নাংশ।
- **`$RepresentationID$` আর `$Number%05d$`** — টেমপ্লেট ভেরিয়েবল। player নিজে প্রতিস্থাপন করে URL বানায়।
- **এক AdaptationSet মানে "এদের মধ্যে অবাধে switch করা যাবে"।** তাই সব ভিডিও rendition একসাথে, কিন্তু প্রতিটা ভাষার অডিও আলাদা — player যেন নিজে থেকে আরবি থেকে ফারসিতে চলে না যায়।
- **`type="static"`** VOD, **`type="dynamic"`** live। live-এ `SegmentTemplate`-এ `duration`-এর বদলে প্রায়ই একটা `SegmentTimeline` থাকে, যা প্রতিটা segment-এর সঠিক দৈর্ঘ্য গোনে।

### HLS বনাম DASH

| দিক              | HLS                      | DASH                             |
| ---------------- | ------------------------ | -------------------------------- |
| Manifest         | টেক্সট m3u8, দুই স্তর    | XML MPD, এক ফাইল, নেস্টেড        |
| Segment তালিকা   | সাধারণত স্পষ্ট তালিকা    | সাধারণত টেমপ্লেট                 |
| iOS/Safari       | নেটিভ সমর্থন             | নেটিভ সমর্থন নেই                 |
| Android/ব্রাউজার | JS player দিয়ে (hls.js) | JS player দিয়ে (dash.js, shaka) |
| DRM              | FairPlay                 | Widevine, PlayReady              |
| স্ট্যান্ডার্ড    | Apple-এর RFC 8216        | ISO/IEC 23009-1                  |
| নমনীয়তা         | কম, কিন্তু সরল           | বেশি, কিন্তু জটিল                |

আগে এই পার্থক্যটা দামি ছিল — Apple ডিভাইসের জন্য HLS, বাকি সবার জন্য DASH, মানে **দুই সেট segment**, দ্বিগুণ storage, দ্বিগুণ CDN cache, দ্বিগুণ প্যাকেজিং সময়। CMAF ঠিক এই সমস্যাটাই সমাধান করে।

## CMAF: এক সেট segment, দুই manifest

CMAF (Common Media Application Format) কোনো নতুন প্রোটোকল নয়। এটা একটা **সাধারণ segment ফরম্যাট** — ISOBMFF-ভিত্তিক fragmented MP4-এর একটা কড়াভাবে সংজ্ঞায়িত উপসেট, যেটা HLS আর DASH দুটোই পড়তে পারে।

আগে যা লাগত:

```text
/1080p/hls/seg-00001.ts     ← MPEG-TS, শুধু HLS পড়ে
/1080p/dash/seg-00001.m4s   ← fMP4, শুধু DASH পড়ে
```

CMAF-এ:

```text
/1080p/init.mp4
/1080p/seg-00001.m4s        ← একই ফাইল, দুটোই পড়ে
master.m3u8                  ← HLS manifest, এই segment গুলোর দিকে দেখায়
manifest.mpd                 ← DASH manifest, একই segment গুলোর দিকে দেখায়
```

সুবিধাগুলো আর্থিক দিক থেকেই সবচেয়ে স্পষ্ট:

- **অর্ধেক storage।** একই কনটেন্টের দুই কপি রাখতে হয় না।
- **দ্বিগুণ কার্যকর CDN cache।** সবচেয়ে বড় লাভ এটাই। আগে iOS দর্শক আর Android দর্শক আলাদা object চাইত, তাই একই কনটেন্টের cache দুই ভাগে ভাগ হয়ে যেত। এখন দুজনেই একই URL চায় — cache hit rate সরাসরি বাড়ে, origin-এ চাপ কমে।
- **এক প্যাকেজিং পাস।** manifest দুটো লেখা সস্তা; segment দুবার লেখা দামি।

<Callout type="tip">

**নতুন কিছু বানালে CMAF দিয়েই শুরু করুন।** HLS-এ এর জন্য `#EXT-X-VERSION:7` আর `#EXT-X-MAP` দরকার, যা iOS 10 (২০১৬) থেকে সমর্থিত — কার্যত সব সক্রিয় ডিভাইস। MPEG-TS segment এখন শুধু পুরনো লিগ্যাসি সিস্টেমের জন্যই যুক্তিসঙ্গত।

</Callout>

DRM-এর দিক থেকে একটা সূক্ষ্মতা আছে, যেটা প্রায়ই মানুষকে ভোগায়: CMAF দুটো encryption মোড সংজ্ঞায়িত করে — `cenc` (AES-CTR) আর `cbcs` (AES-CBC with pattern)। Widevine আর PlayReady ঐতিহাসিকভাবে `cenc` ব্যবহার করত, FairPlay শুধু `cbcs`। মানে সত্যিকারের এক-সেট-segment পেতে হলে **`cbcs` বাছতে হবে**, যা এখন তিনটে DRM সিস্টেমই সমর্থন করে। ভুল মোড বাছলে আপনি CMAF ব্যবহার করেও দুই সেট segment-এ ফিরে যাবেন।

## Byte-range addressing

Segment মানে সবসময় আলাদা ফাইল নয়। HTTP-র `Range` হেডার ব্যবহার করে একটাই বড় ফাইলের ভেতরের নির্দিষ্ট অংশ চাওয়া যায়, আর manifest সেই অংশগুলোকেই segment হিসেবে ঘোষণা করতে পারে।

```m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:4
#EXT-X-MAP:URI="1080p.mp4",BYTERANGE="1024@0"

#EXTINF:4.004,
#EXT-X-BYTERANGE:2508112@1024
1080p.mp4
#EXTINF:4.004,
#EXT-X-BYTERANGE:2431004@2509136
1080p.mp4
#EXTINF:4.004,
#EXT-X-BYTERANGE:2622880
1080p.mp4
#EXT-X-ENDLIST
```

`BYTERANGE:2508112@1024` মানে "১০২৪ বাইট offset থেকে ২৫০৮১১২ বাইট নাও"। offset বাদ দিলে (তৃতীয় segment) মানে "আগেরটার ঠিক পরে থেকে"।

কখন এটা ভালো:

- **কম object সংখ্যা।** ২১,৬০০টা ফাইলের বদলে ৬টা ফাইল। object storage-এ per-object খরচ আর তালিকা করার সময় দুটোই নাটকীয়ভাবে কমে।
- **ব্যাকআপ, মুছে ফেলা, সরানো সহজ।** একটা টাইটেল মুছতে ৬টা DELETE, ২১,৬০০টা নয়।
- **VOD-এ আদর্শ**, কারণ পুরো ফাইলটা আগে থেকেই আছে।

কখন খারাপ:

- **Live-এ কাজে লাগে না** — ফাইলটা তো এখনো লেখা হচ্ছে।
- **CDN-এর আচরণ বৈচিত্র্যময়।** কিছু CDN range request ভালোভাবে cache করে (একবার পুরো object টেনে নিয়ে টুকরো সার্ভ করে), কিছু প্রতিটা range আলাদা করে origin-এ পাঠায়। আপনার CDN কী করে সেটা **পরীক্ষা করে দেখতে হবে**, ডকুমেন্টেশনে বিশ্বাস করে নয়।
- **কিছু পুরনো player-এ বাগ আছে**, বিশেষ করে seek করার সময়।

<Callout type="info">

মিশ্র কৌশলও প্রচলিত: সবচেয়ে জনপ্রিয় rendition গুলো আলাদা ফাইলে (সর্বোচ্চ CDN দক্ষতা), আর কম ব্যবহৃত rendition গুলো byte-range-এ (কম object)। জটিলতা বাড়ে, তাই শুধু তখনই করুন যখন object সংখ্যা সত্যিই খরচের একটা বড় অংশ হয়ে দাঁড়িয়েছে।

</Callout>

## Encryption আর DRM

এখানে দুটো আলাদা জিনিস আছে, আর মানুষ নিয়মিত গুলিয়ে ফেলে:

- **Encryption** — segment-এর বাইটগুলো একটা key দিয়ে এনক্রিপ্ট করা। এটা প্রযুক্তি, আর এটা সরল।
- **DRM** — সেই key কে পাবে, কী শর্তে পাবে, আর ডিভাইস সেই key নিয়ে কী করতে পারবে সেই নিয়ন্ত্রণ। এটা প্রযুক্তির চেয়ে বেশি **চুক্তি আর ব্যবসা**।

### Common Encryption (CENC)

ISO/IEC 23001-7 স্ট্যান্ডার্ডের মূল ধারণাটা চমৎকার: **একবার এনক্রিপ্ট করো, সব DRM সিস্টেম যেন সেটা পড়তে পারে।** segment-এর বাইট এনক্রিপশন সব DRM-এ এক (AES-128, `cenc` বা `cbcs` মোডে)। শুধু **key কীভাবে পৌঁছাবে** সেই অংশটা DRM-ভেদে আলাদা।

গল্পের ভাষায়: সিন্দুক আর তালার নকশা সবার জন্য এক; শুধু চাবির দপ্তর আলাদা।

manifest-এ এটা এভাবে দেখা যায় — একই কনটেন্ট, তিনটে DRM সিস্টেমের জন্য তিনটে key-অর্জনের পথ:

```xml
<ContentProtection
  schemeIdUri="urn:mpeg:dash:mp4protection:2011"
  value="cbcs"
  cenc:default_KID="a7e61c37-3f1b-4d2c-9b8e-4f1a2c3d4e5f"/>

<!-- Widevine -->
<ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed">
  <cenc:pssh>AAAAW3Bzc2gAAAAA7e+LqXnWSs6jyCfc1R0h7QAAADsIARIQ...</cenc:pssh>
</ContentProtection>

<!-- PlayReady -->
<ContentProtection schemeIdUri="urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95">
  <cenc:pssh>AAACJnBzc2gAAAAAmgTweZhAQoarkuZb4Ihflw...</cenc:pssh>
</ContentProtection>
```

HLS-এ একই জিনিস অনেক সরল দেখায়:

```m3u8
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://ibn-sina-lecture-key-id",KEYFORMAT="com.apple.streamingkeydelivery",KEYFORMATVERSIONS="1"
```

### Key delivery কীভাবে কাজ করে

<Mermaid
title="DRM key delivery"
code={`sequenceDiagram
  participant P as "Player"
  participant C as "CDN"
  participant A as "App backend"
  participant L as "License server"
  P->>C: "GET manifest"
  C-->>P: "manifest with key id and pssh"
  P->>P: "CDM generates license request"
  P->>A: "POST license request plus session token"
  A->>A: "check entitlement: subscription, geo, device limit"
  A->>L: "forward request with policy"
  L-->>A: "license: content key plus usage rules"
  A-->>P: "license"
  P->>P: "CDM decrypts inside a secure path"
  P->>C: "GET encrypted segments"
  C-->>P: "segments"`}
/>

মূল বিষয়গুলো:

- **CDM** (Content Decryption Module) হলো ডিভাইসের ভেতরের সেই অংশ যা license বোঝে আর ডিক্রিপ্ট করে — ব্রাউজারে Widevine, Apple-এ FairPlay, Windows/Xbox-এ PlayReady। এটা ব্রাউজার বা OS-এর অংশ, আপনার কোডের নয়।
- **Entitlement যাচাই আপনার ব্যাকএন্ডে হয়, license server-এ নয়।** license server শুধু key দেয়; "এই ব্যবহারকারীর সাবস্ক্রিপশন সক্রিয় কি না", "এই দেশে এই কনটেন্ট দেখানোর অধিকার আছে কি না", "একসাথে কয়টা ডিভাইসে চলছে" — এসব সিদ্ধান্ত আপনার।
- **ডিক্রিপশন কখনোই JavaScript-এ হয় না।** এটাই DRM-এর পুরো মানে — key আর ডিক্রিপ্ট করা ফ্রেম অ্যাপ্লিকেশন কোডের নাগালের বাইরে, একটা secure path-এ থাকে।
- **Robustness level** নির্ধারণ করে ডিভাইসটা কতটা নিরাপদ — Widevine L1 মানে হার্ডওয়্যার-সমর্থিত secure path, L3 মানে শুধু সফটওয়্যার। স্টুডিওর চুক্তিতে প্রায়ই লেখা থাকে HD বা 4K শুধু L1 ডিভাইসে দেওয়া যাবে, আর L3-তে 480p-র বেশি নয়।

<Callout type="warning">

**DRM প্রযুক্তিগত সিদ্ধান্তের আগে ব্যবসায়িক সিদ্ধান্ত।** নিজের বানানো কনটেন্ট বা ব্যবহারকারীর আপলোড করা ভিডিওতে DRM প্রায় কখনোই দরকার নেই — signed URL, token authentication আর short-lived AES-128 encryption সাধারণত যথেষ্ট। DRM লাগে যখন **কনটেন্টের মালিক অন্য কেউ** আর চুক্তিতে লেখা আছে। খরচটাও ঠিক তখনই যুক্তিসঙ্গত: তিনটে DRM সিস্টেমের লাইসেন্স, একটা license server (নিজে চালানো বা কেনা), তিনটে প্ল্যাটফর্মে আলাদা প্লেব্যাক টেস্ট, আর নতুন এক শ্রেণির বাগ যা শুধু নির্দিষ্ট ডিভাইস মডেলে ঘটে।

</Callout>

DRM-এর হালকা বিকল্প, বাড়তে থাকা কড়াকড়ির ক্রমে:

| পদ্ধতি                       | কী ঠেকায়                                   | খরচ                          |
| ---------------------------- | ------------------------------------------- | ---------------------------- |
| Signed/expiring URL          | সরাসরি লিঙ্ক শেয়ার করা                     | প্রায় শূন্য                 |
| Referrer/origin যাচাই        | অন্য সাইটে embed করা                        | প্রায় শূন্য                 |
| AES-128 (HLS `#EXT-X-KEY`)   | সাধারণ ডাউনলোডার; key তবু JS-এ দৃশ্যমান     | কম                           |
| Widevine L3 / সফটওয়্যার DRM | নৈমিত্তিক কপি করা                           | মাঝারি                       |
| L1 + hardware secure path    | স্ক্রিন ক্যাপচার সহ পেশাদার পাইরেসি (আংশিক) | বেশি, আর স্টুডিও চুক্তি লাগে |

## Caption আর একাধিক অডিও ট্র্যাক

### Caption

তিনটে পথ আছে, আর নির্বাচনটা গুরুত্বপূর্ণ:

**১. WebVTT sidecar** — সবচেয়ে সরল আর সবচেয়ে বেশি ব্যবহৃত। একটা `.vtt` ফাইল, এবং HLS-এ প্রায়ই সেটাকেও segment করা হয়।

```text
WEBVTT

00:00:04.000 --> 00:00:07.500
আজকের আলোচনা: গ্রহের গতিপথ নির্ণয়

00:00:08.100 --> 00:00:12.400 line:90% align:center
আল-বিরুনির পর্যবেক্ষণ থেকে আমরা শুরু করব
```

**২. Embedded CEA-608/708** — ভিডিও stream-এর ভেতরেই caption ডেটা বসানো, সম্প্রচার ঐতিহ্য থেকে আসা। সুবিধা: ট্র্যাক আলাদা করে সিঙ্ক করার সমস্যা নেই। অসুবিধা: বদলাতে হলে re-encode লাগে, আর স্টাইলিং সীমিত।

**৩. IMSC1/TTML in fMP4** — DASH-এর পছন্দ, `stpp` codec হিসেবে ঘোষিত। বেশি ক্ষমতাসম্পন্ন (অবস্থান, রঙ, ruby টেক্সট), কিন্তু ভারী।

<Callout type="tip">

`FORCED=YES` অ্যাট্রিবিউটটা প্রায়ই ভুল বোঝা হয়। Forced subtitle মানে "শুধু সেই অংশগুলোর অনুবাদ যেগুলো মূল ভাষার দর্শকেরও পড়া দরকার" — যেমন আরবি সিনেমায় হঠাৎ ফারসিতে বলা একটা সংলাপ। এটা caption অফ থাকলেও দেখানো হয়। এটাকে সাধারণ subtitle track হিসেবে চিহ্নিত করলে দর্শক হয় কিছুই বোঝে না, নয় দুই সেট subtitle একসাথে দেখে।

</Callout>

### একাধিক অডিও ট্র্যাক

আগের চ্যাপ্টারে দেখেছেন — অডিও পুরো ladder জুড়ে একবারই এনকোড হয়। কিন্তু **ভাষা বা মিক্স আলাদা হলে সেটা আলাদা ট্র্যাক**, ladder-এর অংশ নয়। সাধারণ বিন্যাস:

- ভাষা: আরবি (মূল), ফারসি (ডাব), ইংরেজি (ডাব)
- বর্ণনা: audio description ট্র্যাক (দৃষ্টিপ্রতিবন্ধী দর্শকের জন্য)
- মিক্স: stereo আর 5.1

HLS-এ এগুলো `#EXT-X-MEDIA:TYPE=AUDIO` লাইন, একই `GROUP-ID`-তে। DASH-এ প্রতিটা ভাষা আলাদা `AdaptationSet`, `lang` অ্যাট্রিবিউট সহ।

তিনটে নিয়ম, যেগুলো ভাঙলে সমস্যা:

- **প্রতিটা অডিও ট্র্যাকের segment সীমানা ভিডিওর সাথে মিলতে হবে।** না মিললে ট্র্যাক বদলানোর সময় ফাঁক বা ওভারল্যাপ তৈরি হয়।
- **ঠিক একটা ট্র্যাকে `DEFAULT=YES` থাকবে।** একাধিক থাকলে player-ভেদে আচরণ আলাদা হয়, আর কোনোটাতে না থাকলে কিছু player কোনো অডিওই বাজায় না।
- **`AUTOSELECT=YES` মানে "ডিভাইসের ভাষা সেটিং-এর সাথে মিললে নিজে বেছে নাও"।** পুরো ভাষার তালিকায় এটা `YES` রাখা যুক্তিসঙ্গত, কিন্তু audio description ট্র্যাকে কখনোই নয় — নইলে হঠাৎ কেউ ধারাবিবরণী শুনতে শুরু করবে।

## একটা HLS packager আর parser

নিচের ইমপ্লিমেন্টেশনে দুই দিকই আছে — segment-এর তালিকা থেকে বৈধ master ও media playlist লেখা, আর একটা playlist পার্স করে তার কাঠামো ফিরে পাওয়া। parser-টা যাচাইয়ের কাজেও লাগে: চ্যাপ্টার ৫-এর alignment চুক্তি সত্যিই মানা হয়েছে কি না, সেটা এখানেই ধরা পড়ে।

```typescript
// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface Segment {
	uri: string;
	/** Exact duration in seconds. Never round this: players sum it to seek. */
	duration: number;
	/** Optional byte range into a larger file: [length, offset]. */
	byteRange?: { length: number; offset?: number };
	/** Discontinuity before this segment, e.g. an ad break or a source change. */
	discontinuity?: boolean;
}

export interface MediaPlaylist {
	version: number;
	targetDuration: number;
	mediaSequence: number;
	playlistType: 'VOD' | 'EVENT' | null;
	initSegmentUri?: string;
	independentSegments: boolean;
	segments: Segment[];
	ended: boolean;
}

export interface Variant {
	uri: string;
	/** Peak bitrate. This is what the ABR algorithm actually compares against. */
	bandwidth: number;
	averageBandwidth?: number;
	/** RFC 6381 codec string. Wrong or missing means the player skips this variant. */
	codecs: string;
	width: number;
	height: number;
	frameRate?: number;
	audioGroup?: string;
	subtitleGroup?: string;
}

export interface AlternateRendition {
	type: 'AUDIO' | 'SUBTITLES' | 'CLOSED-CAPTIONS';
	groupId: string;
	name: string;
	language: string;
	uri?: string;
	isDefault: boolean;
	autoselect: boolean;
	forced?: boolean;
	channels?: string;
}

export interface MasterPlaylist {
	version: number;
	independentSegments: boolean;
	variants: Variant[];
	renditions: AlternateRendition[];
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function quote(value: string): string {
	return `"${value.replace(/"/g, '')}"`;
}

function attributes(pairs: Array<[string, string | number | undefined]>): string {
	return pairs
		.filter(([, value]) => value !== undefined && value !== '')
		.map(([key, value]) => `${key}=${value}`)
		.join(',');
}

export function writeMaster(playlist: MasterPlaylist): string {
	const lines: string[] = ['#EXTM3U', `#EXT-X-VERSION:${playlist.version}`];

	if (playlist.independentSegments) {
		lines.push('#EXT-X-INDEPENDENT-SEGMENTS');
	}

	for (const rendition of playlist.renditions) {
		lines.push(
			'#EXT-X-MEDIA:' +
				attributes([
					['TYPE', rendition.type],
					['GROUP-ID', quote(rendition.groupId)],
					['NAME', quote(rendition.name)],
					['LANGUAGE', quote(rendition.language)],
					['DEFAULT', rendition.isDefault ? 'YES' : 'NO'],
					['AUTOSELECT', rendition.autoselect ? 'YES' : 'NO'],
					['FORCED', rendition.forced === undefined ? undefined : rendition.forced ? 'YES' : 'NO'],
					['CHANNELS', rendition.channels ? quote(rendition.channels) : undefined],
					['URI', rendition.uri ? quote(rendition.uri) : undefined]
				])
		);
	}

	// Lowest variant first is the safe default: a slow viewer starts playing
	// immediately instead of buffering on a rendition they cannot sustain.
	const ordered = [...playlist.variants].sort((a, b) => a.bandwidth - b.bandwidth);

	for (const variant of ordered) {
		lines.push(
			'#EXT-X-STREAM-INF:' +
				attributes([
					['BANDWIDTH', variant.bandwidth],
					['AVERAGE-BANDWIDTH', variant.averageBandwidth],
					['CODECS', quote(variant.codecs)],
					['RESOLUTION', `${variant.width}x${variant.height}`],
					['FRAME-RATE', variant.frameRate?.toFixed(3)],
					['AUDIO', variant.audioGroup ? quote(variant.audioGroup) : undefined],
					['SUBTITLES', variant.subtitleGroup ? quote(variant.subtitleGroup) : undefined]
				])
		);
		lines.push(variant.uri);
	}

	return lines.join('\n') + '\n';
}

export function writeMedia(playlist: MediaPlaylist): string {
	// TARGETDURATION must be the ceiling of the longest segment. Getting this
	// wrong makes players mis-size their buffer and, on live, reload too slowly.
	const longest = playlist.segments.reduce((max, s) => Math.max(max, s.duration), 0);
	const target = Math.max(playlist.targetDuration, Math.ceil(longest));

	const lines: string[] = [
		'#EXTM3U',
		`#EXT-X-VERSION:${playlist.version}`,
		`#EXT-X-TARGETDURATION:${target}`,
		`#EXT-X-MEDIA-SEQUENCE:${playlist.mediaSequence}`
	];

	if (playlist.playlistType) lines.push(`#EXT-X-PLAYLIST-TYPE:${playlist.playlistType}`);
	if (playlist.independentSegments) lines.push('#EXT-X-INDEPENDENT-SEGMENTS');
	if (playlist.initSegmentUri) lines.push(`#EXT-X-MAP:URI=${quote(playlist.initSegmentUri)}`);

	for (const segment of playlist.segments) {
		if (segment.discontinuity) lines.push('#EXT-X-DISCONTINUITY');
		// Three decimals preserves 4.004 exactly; rounding to 4 accumulates
		// seconds of drift across a feature-length asset.
		lines.push(`#EXTINF:${segment.duration.toFixed(3)},`);
		if (segment.byteRange) {
			const { length, offset } = segment.byteRange;
			lines.push(`#EXT-X-BYTERANGE:${length}${offset === undefined ? '' : `@${offset}`}`);
		}
		lines.push(segment.uri);
	}

	if (playlist.ended) lines.push('#EXT-X-ENDLIST');

	return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Splits an HLS attribute list, respecting quoted values.
 *
 * A naive split on commas breaks on CODECS="avc1.4d401f,mp4a.40.2", which is
 * exactly the attribute you cannot afford to mis-parse.
 */
function parseAttributes(input: string): Record<string, string> {
	const out: Record<string, string> = {};
	let key = '';
	let value = '';
	let inQuotes = false;
	let readingKey = true;

	const commit = () => {
		if (key) out[key.trim()] = value.trim().replace(/^"|"$/g, '');
		key = '';
		value = '';
		readingKey = true;
	};

	for (const char of input) {
		if (char === '"') {
			inQuotes = !inQuotes;
			value += char;
		} else if (char === '=' && readingKey && !inQuotes) {
			readingKey = false;
		} else if (char === ',' && !inQuotes) {
			commit();
		} else if (readingKey) {
			key += char;
		} else {
			value += char;
		}
	}
	commit();

	return out;
}

export function parseMedia(text: string): MediaPlaylist {
	const lines = text.split('\n').map((l) => l.trim());

	const playlist: MediaPlaylist = {
		version: 1,
		targetDuration: 0,
		mediaSequence: 0,
		playlistType: null,
		independentSegments: false,
		segments: [],
		ended: false
	};

	if (lines[0] !== '#EXTM3U') throw new Error('hls: missing #EXTM3U header');

	let pendingDuration: number | null = null;
	let pendingRange: Segment['byteRange'] | undefined;
	let pendingDiscontinuity = false;

	for (const line of lines.slice(1)) {
		if (line === '' || (line.startsWith('#') && !line.startsWith('#EXT'))) continue;

		if (line.startsWith('#EXT-X-VERSION:')) {
			playlist.version = parseInt(line.slice(15), 10);
		} else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
			playlist.targetDuration = parseInt(line.slice(22), 10);
		} else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
			playlist.mediaSequence = parseInt(line.slice(22), 10);
		} else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) {
			playlist.playlistType = line.slice(21) as 'VOD' | 'EVENT';
		} else if (line === '#EXT-X-INDEPENDENT-SEGMENTS') {
			playlist.independentSegments = true;
		} else if (line.startsWith('#EXT-X-MAP:')) {
			playlist.initSegmentUri = parseAttributes(line.slice(11)).URI;
		} else if (line === '#EXT-X-DISCONTINUITY') {
			pendingDiscontinuity = true;
		} else if (line.startsWith('#EXTINF:')) {
			pendingDuration = parseFloat(line.slice(8).split(',')[0]);
		} else if (line.startsWith('#EXT-X-BYTERANGE:')) {
			const [length, offset] = line.slice(17).split('@');
			pendingRange = {
				length: parseInt(length, 10),
				offset: offset === undefined ? undefined : parseInt(offset, 10)
			};
		} else if (line === '#EXT-X-ENDLIST') {
			playlist.ended = true;
		} else if (!line.startsWith('#')) {
			if (pendingDuration === null) {
				throw new Error(`hls: segment ${line} has no preceding #EXTINF`);
			}
			playlist.segments.push({
				uri: line,
				duration: pendingDuration,
				byteRange: pendingRange,
				discontinuity: pendingDiscontinuity || undefined
			});
			pendingDuration = null;
			pendingRange = undefined;
			pendingDiscontinuity = false;
		}
	}

	return playlist;
}

// ---------------------------------------------------------------------------
// Validation: does this package honour the alignment contract?
// ---------------------------------------------------------------------------

export interface ValidationIssue {
	severity: 'error' | 'warning';
	message: string;
}

/**
 * Cross-checks every media playlist in a package.
 *
 * The critical invariant is that segment boundaries land on the same
 * timestamps in every rendition. If they do not, a player that switches
 * mid-stream receives frames whose reference frames it never decoded, and the
 * picture breaks. This is the single most valuable thing to run in CI.
 */
export function validatePackage(
	master: MasterPlaylist,
	mediaByUri: Map<string, MediaPlaylist>,
	toleranceSeconds = 0.05
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	if (!master.independentSegments) {
		issues.push({
			severity: 'warning',
			message: 'master lacks EXT-X-INDEPENDENT-SEGMENTS; players may refuse to switch mid-segment'
		});
	}

	const timelines = new Map<string, number[]>();

	for (const variant of master.variants) {
		const media = mediaByUri.get(variant.uri);
		if (!media) {
			issues.push({ severity: 'error', message: `variant ${variant.uri} has no media playlist` });
			continue;
		}

		if (!variant.codecs) {
			issues.push({
				severity: 'error',
				message: `variant ${variant.uri} has no CODECS attribute; players will skip it`
			});
		}

		if (variant.averageBandwidth && variant.averageBandwidth > variant.bandwidth) {
			issues.push({
				severity: 'error',
				message: `variant ${variant.uri}: AVERAGE-BANDWIDTH exceeds BANDWIDTH`
			});
		}

		// Cumulative segment start times form this rendition's timeline.
		const starts: number[] = [];
		let elapsed = 0;
		for (const segment of media.segments) {
			starts.push(elapsed);
			elapsed += segment.duration;
		}
		timelines.set(variant.uri, starts);
	}

	const entries = [...timelines.entries()];
	const [referenceUri, reference] = entries[0] ?? ['', []];

	for (const [uri, starts] of entries.slice(1)) {
		if (starts.length !== reference.length) {
			issues.push({
				severity: 'error',
				message: `${uri} has ${starts.length} segments, ${referenceUri} has ${reference.length}`
			});
			continue;
		}

		for (let i = 0; i < starts.length; i++) {
			const drift = Math.abs(starts[i] - reference[i]);
			if (drift > toleranceSeconds) {
				issues.push({
					severity: 'error',
					message:
						`${uri} segment ${i} starts at ${starts[i].toFixed(3)}s but ` +
						`${referenceUri} starts at ${reference[i].toFixed(3)}s ` +
						`(drift ${drift.toFixed(3)}s) -- renditions are not aligned`
				});
				break; // one report per rendition is enough; the rest cascade
			}
		}
	}

	return issues;
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const master: MasterPlaylist = {
	version: 7,
	independentSegments: true,
	renditions: [
		{
			type: 'AUDIO',
			groupId: 'aac-128k',
			name: 'Arabic',
			language: 'ar',
			uri: 'audio/ar/index.m3u8',
			isDefault: true,
			autoselect: true,
			channels: '2'
		},
		{
			type: 'AUDIO',
			groupId: 'aac-128k',
			name: 'Persian',
			language: 'fa',
			uri: 'audio/fa/index.m3u8',
			isDefault: false,
			autoselect: true,
			channels: '2'
		},
		{
			type: 'SUBTITLES',
			groupId: 'subs',
			name: 'English',
			language: 'en',
			uri: 'subs/en/index.m3u8',
			isDefault: false,
			autoselect: true,
			forced: false
		}
	],
	variants: [
		{
			uri: '720p/index.m3u8',
			bandwidth: 3_428_000,
			averageBandwidth: 3_000_000,
			codecs: 'avc1.4d401f,mp4a.40.2',
			width: 1280,
			height: 720,
			frameRate: 29.97,
			audioGroup: 'aac-128k',
			subtitleGroup: 'subs'
		},
		{
			uri: '360p/index.m3u8',
			bandwidth: 628_000,
			averageBandwidth: 500_000,
			codecs: 'avc1.4d401e,mp4a.40.2',
			width: 640,
			height: 360,
			frameRate: 29.97,
			audioGroup: 'aac-128k',
			subtitleGroup: 'subs'
		}
	]
};

console.log(writeMaster(master));

const media: MediaPlaylist = {
	version: 7,
	targetDuration: 4,
	mediaSequence: 0,
	playlistType: 'VOD',
	initSegmentUri: 'init.mp4',
	independentSegments: true,
	segments: [
		{ uri: 'seg-00001.m4s', duration: 4.004 },
		{ uri: 'seg-00002.m4s', duration: 4.004 },
		{ uri: 'seg-00003.m4s', duration: 2.669 }
	],
	ended: true
};

const rendered = writeMedia(media);
const reparsed = parseMedia(rendered);
console.log(`round trip: ${reparsed.segments.length} segments, ended=${reparsed.ended}`);

for (const issue of validatePackage(master, new Map([['720p/index.m3u8', media]]))) {
	console.log(`[${issue.severity}] ${issue.message}`);
}
```

## যা এই ইমপ্লিমেন্টেশনকে প্রোডাকশন-রেডি করে

- **Quote-সচেতন attribute parser** — `CODECS="avc1.4d401f,mp4a.40.2"`-এর ভেতরের কমা দেখে সরল split ভেঙে যায়, আর ঠিক এই attribute-টাই ভুল পার্স করা সবচেয়ে ব্যয়বহুল
- **`TARGETDURATION` নিজে থেকে হিসাব করা** — সবচেয়ে লম্বা segment-এর ceiling, হাতে লেখা মানের উপর ভরসা নয়
- **সঠিক `EXTINF` দৈর্ঘ্য** — তিন দশমিক ঘর, যাতে 4.004 হুবহু থাকে আর দীর্ঘ কনটেন্টে seek drift না জমে
- **Byte-range-এ offset আছে কি না আলাদা করে রাখা** — "offset 0" আর "আগেরটার পরে" HLS-এ দুটো আলাদা নির্দেশ
- **অজানা ট্যাগ উপেক্ষা করা** — নতুন HLS সংস্করণের ট্যাগে parser ভাঙে না, যা forward compatibility-র শর্ত
- **Alignment validator** — প্রতিটা rendition-এর cumulative timeline মিলিয়ে দেখা; এটাই সেই যাচাই যা CI-তে থাকলে "মাঝে মাঝে স্ক্রিন সবুজ হয়ে যায়" শ্রেণির বাগ প্রোডাকশনে পৌঁছায় না
- **`BANDWIDTH` বনাম `AVERAGE-BANDWIDTH` যাচাই** — গড় peak-এর চেয়ে বেশি হলে সেটা packager-এর বাগ, আর player-এর ABR সিদ্ধান্ত সরাসরি ভুল হয়
- **নিচু variant প্রথমে** — ধীর দর্শক buffering-এর বদলে সাথে সাথে চালাতে শুরু করে

<div class="takeaways">

### মূল শেখা

- Packaging মানে re-encode নয় — encoded rendition-কে segment-এ কাটা আর একটা manifest লেখা, যাতে player টুকরো টুকরো নামাতে আর টুকরোর সীমানায় switch করতে পারে
- **Segment duration** packaging-এর একক সবচেয়ে গুরুত্বপূর্ণ সিদ্ধান্ত: ছোট মানে দ্রুত startup আর কম latency কিন্তু বেশি request ও বেশি keyframe; বড় মানে উল্টোটা। VOD-এ ৪ সেকেন্ড, live-এ ২ — আর সবসময় GOP-এর গুণিতক
- HLS-এর দুই স্তর — **master playlist** variant-এর তালিকা, **media playlist** segment-এর তালিকা; `CODECS` ভুল হলে player পুরো variant-টাই বাদ দেয়
- `#EXTINF`-এর দৈর্ঘ্য কখনো রাউন্ড করবেন না; player এগুলো যোগ করেই টাইমলাইন বানায়
- DASH-এর **MPD** একটাই XML — Period → AdaptationSet → Representation → SegmentTemplate; segment-এর URL তালিকা নয়, টেমপ্লেট, তাই manifest অনেক ছোট
- এক AdaptationSet মানে "এদের মধ্যে অবাধে switch করা যাবে" — তাই সব ভিডিও rendition একসাথে, কিন্তু প্রতিটা ভাষার অডিও আলাদা
- **CMAF** এক সেট segment দুই manifest-এ শেয়ার করতে দেয় — অর্ধেক storage, আর তার চেয়ে বড় লাভ দ্বিগুণ কার্যকর CDN cache। `cbcs` encryption মোড বাছুন, নইলে DRM আপনাকে আবার দুই সেটে ফিরিয়ে নেবে
- **Byte-range addressing** object সংখ্যা নাটকীয়ভাবে কমায়, VOD-এ চমৎকার, live-এ অচল, আর CDN-এর আচরণ পরীক্ষা করে দেখতে হয়
- **CENC**-এর মূল ধারণা: বাইট এনক্রিপশন সব DRM-এ এক, শুধু key-অর্জনের পথ আলাদা
- **DRM প্রযুক্তির আগে ব্যবসায়িক সিদ্ধান্ত** — কনটেন্টের মালিক অন্য কেউ হলে আর চুক্তিতে লেখা থাকলে তবেই; নিজের কনটেন্টে signed URL আর short-lived key সাধারণত যথেষ্ট
- Caption আর alternate অডিও ট্র্যাকের segment সীমানাও ভিডিওর সাথে মিলতে হবে, ঠিক একটা ট্র্যাকে `DEFAULT=YES` থাকবে, আর audio description কখনো `AUTOSELECT=YES` নয়

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Apple** HLS-এর স্পেসিফিকেশন (RFC 8216) আর authoring guideline প্রকাশ করে, আর App Store-এ সেলুলার নেটওয়ার্কে দীর্ঘ ভিডিওর জন্য HLS বাধ্যতামূলক — এটাই HLS-কে সর্বব্যাপী করেছে
- **Netflix, Disney+, Prime Video** সবাই CMAF-এ `cbcs` ব্যবহার করে যাতে Widevine, PlayReady আর FairPlay তিনটেই একই segment পড়তে পারে, আর CDN cache ভাগ না হয়
- **Shaka Packager (Google)** আর **Bento4** হলো ওপেন-সোর্স packager যা একই ইনপুট থেকে HLS ও DASH manifest দুটোই লেখে; বেশিরভাগ প্রতিষ্ঠান নিজে packager লেখে না, এদের একটা ব্যবহার করে
- **Mux, Cloudflare Stream, AWS MediaPackage** just-in-time packaging দেয় — segment গুলো CMAF-এ একবারই সংরক্ষিত থাকে, আর manifest-টা request-এর সময় দর্শকের ডিভাইস অনুযায়ী তৈরি হয়
- **Twitch আর YouTube Live** ২ সেকেন্ড বা তার কম segment ব্যবহার করে, আর latency আরও কমাতে chunked transfer + partial segment (LL-HLS/LL-DASH) ব্যবহার করে — যা পরের চ্যাপ্টারগুলোর বিষয়

</div>
