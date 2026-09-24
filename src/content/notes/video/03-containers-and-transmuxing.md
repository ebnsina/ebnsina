---
title: 'Container আর transmuxing'
subtitle: 'MP4 box, moov atom আর faststart, fragmented MP4, MPEG-TS, WebM, CMAF — আর re-encode না করেই মোড়ক বদলে ফেলার কৌশল।'
chapter: 3
level: 'beginner'
readingTime: '২১ মিনিট'
topics:
  [
    'container',
    'MP4',
    'ISOBMFF',
    'moov atom',
    'faststart',
    'fragmented MP4',
    'MPEG-TS',
    'CMAF',
    'transmuxing'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

ভিডিও নিয়ে কাজ করা মানুষের মধ্যে সবচেয়ে বেশি যে ভুল বোঝাবুঝিটা হয়, সেটা এক বাক্যে বলা যায়: **container আর codec এক জিনিস নয়।**

- **Codec** ঠিক করে pixel কীভাবে bit-এ পরিণত হবে — H.264, HEVC, AV1, AAC, Opus।
- **Container** ঠিক করে ওই bit-গুলো একটা ফাইলে কীভাবে সাজানো থাকবে — MP4, MPEG-TS, WebM, MKV।

একটা `.mp4` ফাইলের ভেতরে H.264 থাকতে পারে, HEVC থাকতে পারে, AV1-ও থাকতে পারে। একই H.264 stream একই সাথে একটা `.mp4`, একটা `.ts` আর একটা `.mkv` ফাইলে থাকতে পারে — bit-গুলো হুবহু এক, শুধু মোড়ক আলাদা। "ফাইলটা MP4, তাই H.264" — এই বাক্যটা যতবার আপনি শুনবেন, ততবার কেউ একটা ভুল ডিবাগিং পথে হাঁটতে যাচ্ছে।

Container-এর কাজ চারটা:

- **Multiplex** — ভিডিও, একাধিক audio track, সাবটাইটেল, সব এক ফাইলে গেঁথে রাখা।
- **Timing** — প্রতিটা sample-এর PTS/DTS আর timescale ধরে রাখা, যাতে সব track মিলে চলে।
- **Index** — "১২ মিনিট ৩০ সেকেন্ডের frame-টা ফাইলের কোন byte-এ" — সেই তালিকা।
- **Metadata** — codec configuration, resolution, ভাষা, colour tag, chapter, thumbnail।

## গল্পে বুঝি

কায়রোর একটা প্রেরণ-ঘর, যেখান থেকে গোটা সাম্রাজ্যে পাণ্ডুলিপি পাঠানো হয়। এর প্রধান হাইসাম। তাঁর ঘরে দুটো আলাদা কাজ হয় — লেখা আর মোড়ানো — আর তিনি নবীন কর্মচারীদের প্রথম দিনেই এই পার্থক্যটা বুঝিয়ে দেন।

লেখার কাজটা করে লিপিকাররা। তারা ঠিক করে পাণ্ডুলিপিটা কোন লিপিতে লেখা হবে — কুফি, নাসখ, নাকি সংক্ষিপ্ত শর্টহ্যান্ড। মোড়ানোর কাজটা করে বাক্সওয়ালারা। তারা কাগজ ছোঁয় না, লিপি বোঝে না; তারা শুধু কাগজগুলো একটা বাক্সে সাজায়, বাক্সের গায়ে একটা তালিকা লাগায়, আর সাথে অনুবাদক আর টীকাকারের কাগজপত্রও একই বাক্সে গুঁজে দেয় যাতে সব একসাথে পৌঁছায়। একই শর্টহ্যান্ডে লেখা পাণ্ডুলিপি কাঠের সিন্দুকে যেতে পারে, চামড়ার থলেতে যেতে পারে, বা ছোট ছোট মোমসিল করা সাচেটে ভাগ হয়েও যেতে পারে। **লিপি এক, মোড়ক আলাদা।**

বাক্সের গায়ের তালিকাটাই আসল কারিগরি। তাতে লেখা থাকে — এই বাক্সে তিনটে জিনিস আছে, মূল পাণ্ডুলিপি ৪১২ পাতা, ফারসি অনুবাদ ৩৮০ পাতা, টীকা ৯১ পাতা; মূলের ২৭০ নম্বর পাতাটা বাক্সের বাঁ দিক থেকে এত ইঞ্চি ভেতরে; আর প্রতিটা পাতা কোন গতিতে পড়তে হবে যাতে অনুবাদের সাথে মেলে। এই তালিকা না থাকলে গ্রন্থাগারিককে ২৭০ নম্বর পাতা খুঁজতে গোটা বাক্স উপুড় করতে হবে।

এখান থেকেই হাইসামের বিখ্যাত ভুলটা হয়েছিল। শুরুর দিকে তাঁর নিয়ম ছিল — কাগজ আগে ভরো, তারপর গুনে গুনে তালিকা বানিয়ে **বাক্সের নিচে** সেঁটে দাও। যুক্তিসঙ্গত, কারণ সব ভরার আগে তো তালিকা লেখা যায় না। কিন্তু কর্ডোবার গ্রন্থাগারিক চিঠি লিখলেন: "আপনার উটের কাফেলা বাক্স নিয়ে আসে ধীরে ধীরে। আমি চাই প্রথম বস্তা পৌঁছানো মাত্র পড়া শুরু করতে। কিন্তু তালিকা তো সবার শেষে আসে — মানে গোটা কাফেলা না পৌঁছানো পর্যন্ত আমি কিছুই খুলতে পারছি না।" হাইসাম নিয়ম বদলালেন: এখন বাক্স ভরার পর তালিকাটা খুলে **সামনে এনে** সাঁটা হয়। কাজটা একটু বাড়তি, কিন্তু এখন প্রথম বস্তাতেই গ্রন্থাগারিক জানে ভেতরে কী আছে আর কোথায় আছে।

দ্বিতীয় সমস্যাটা ভিন্ন। দামেস্কে একটা ধারাবিবরণী পাঠানো হয় — দরবারের ঘটনা যত ঘটছে তত লেখা হচ্ছে, শেষ কবে হবে কেউ জানে না। এখানে "সব ভরে তারপর তালিকা" নীতিটাই অচল, কারণ "সব" বলে কিছু নেই। তাই এই কাজের জন্য আলাদা ব্যবস্থা: প্রতি দশ পাতা জমলেই একটা ছোট মোমসিল করা সাচেট, আর **প্রতিটা সাচেটের গায়ে নিজের ছোট তালিকা** — এই সাচেটে কী আছে, কোন সময়ের ঘটনা। সাচেটগুলো একটার পর একটা পাঠানো হয়, গ্রন্থাগারিক প্রতিটা খুলে সাথে সাথে পড়তে পারে, আর কেউ কোনো বড় তালিকার জন্য অপেক্ষা করে না।

আর সবচেয়ে গুরুত্বপূর্ণ ঘটনাটা ঘটল একদিন সকালে। কর্ডোবার গ্রন্থাগার বলল তারা কাঠের সিন্দুক নিতে পারবে না, শুধু চামড়ার থলে নেবে। হাইসামের সহকারী রাজি হতাশ হয়ে বলল — "তাহলে গোটা পাণ্ডুলিপি আবার নকল করাতে হবে!" হাইসাম হেসে বললেন, "কেন? লিপি তো বদলাচ্ছে না। কাগজগুলো সিন্দুক থেকে বের করো, থলেতে ভরো, নতুন তালিকা লেখো। ছয় মাসের বদলে দুই ঘণ্টার কাজ।" কাগজে একটা আঁচড়ও পড়ল না। **শুধু তখনই এটা চলে যখন গ্রন্থাগার লিপিটা পড়তে পারে** — কেউ যদি বলত "আমাদের এখানে কেউ শর্টহ্যান্ড পড়তে জানে না", তখন আর মোড়ক বদলে কাজ হতো না, সত্যিই নতুন করে লিখতে হতো।

মিলিয়ে নিই: লিপি হলো **codec**, বাক্স বা থলে হলো **container**, বাক্সের গায়ের তালিকা হলো **moov atom** (index আর metadata), কাগজের স্তূপটা হলো **mdat**, তালিকা নিচে থাকা হলো moov-at-the-end সমস্যা আর সামনে এনে সাঁটা হলো **faststart**, নিজের নিজের তালিকাসহ ছোট সাচেট হলো **fragmented MP4** (moof + mdat), অনির্দিষ্টকাল চলা ধারাবিবরণী হলো **live stream**, সিন্দুক থেকে থলেতে কাগজ সরানো হলো **transmuxing**, আর "কেউ শর্টহ্যান্ড পড়তে জানে না" পরিস্থিতিটা হলো সেই ক্ষেত্র যেখানে transmux চলবে না, **transcode** করতেই হবে।

## MP4 / ISOBMFF: সবকিছুই একটা box

MP4-এর আসল নাম ISO Base Media File Format — ISOBMFF। এর গঠন হাস্যকর রকমের সরল: পুরো ফাইলটা **box**-এর (পুরনো নামে atom) একটা ক্রম, আর box-এর ভেতরে box থাকতে পারে।

প্রতিটা box-এর হেডার আট byte:

```text
+--------+--------+---------------------------+
| size   | type   | payload                   |
| 4 byte | 4 char | (size - 8) bytes          |
+--------+--------+---------------------------+

size == 1  -> a 64-bit "largesize" follows the type (16-byte header)
size == 0  -> this box runs to end of file (only legal for the last box)
```

একটা সাধারণ progressive MP4 ফাইলের উপরের স্তর:

```text
[ftyp]  32 bytes      file type and compatible brands
[moov]  184 KB        the index: tracks, timing, sample tables, codec config
[mdat]  412 MB        the actual encoded video and audio samples
```

`moov`-এর ভেতরে আরও গাছ:

```text
moov
 +-- mvhd                 movie header: timescale, duration
 +-- trak (video)
 |    +-- tkhd            track header: id, width, height
 |    +-- mdia
 |         +-- mdhd       media header: this track's timescale
 |         +-- hdlr       handler: 'vide' or 'soun'
 |         +-- minf
 |              +-- stbl  the sample tables
 |                   +-- stsd   sample description: codec fourcc + config
 |                   +-- stts   sample durations
 |                   +-- stss   which samples are sync samples (keyframes)
 |                   +-- stsc   sample-to-chunk mapping
 |                   +-- stsz   sample sizes
 |                   +-- stco   chunk offsets into mdat
 +-- trak (audio)
      +-- ...
```

`stbl`-এর ভেতরের টেবিলগুলোই আসল কাজটা করে। "১২ মিনিট ৩০ সেকেন্ডে seek করো" মানে player: `stts` দেখে সময় থেকে sample নম্বর বের করে, `stss` দেখে তার আগের সবচেয়ে কাছের keyframe খোঁজে, `stsc` আর `stco` দেখে সেই sample কোন chunk-এ আর ফাইলের কোন byte-এ, তারপর সেখান থেকে পড়া শুরু করে।

<Callout type="info">

এই টেবিলগুলোই ব্যাখ্যা করে কেন লম্বা ভিডিওর moov বড় হয়। প্রতিটা sample-এর জন্য আকার আর সময় লিখতে হয় — এক ঘণ্টার 30fps ভিডিওতে এক লাখেরও বেশি ভিডিও sample। moov কয়েক মেগাবাইট হওয়া অস্বাভাবিক নয়, আর সেটা player-কে চালানোর **আগেই** পুরোটা পড়তে হয়।

</Callout>

## moov atom-এর সমস্যা আর faststart

`moov` যেহেতু সব sample-এর আকার আর অবস্থান বর্ণনা করে, সেটা লেখা যায় কেবল সব sample লেখা শেষ হওয়ার পর। তাই স্বাভাবিক muxer-এর আচরণ হলো `mdat` আগে লেখা, `moov` সবার শেষে।

স্থানীয় ফাইলে এতে কিছু যায় আসে না। HTTP-তে progressive playback-এ এটা মারাত্মক:

<Mermaid
title="moov শেষে বনাম moov শুরুতে"
code={`graph TD
  subgraph BAD["moov at the end"]
    B1["Player requests bytes 0..N"] --> B2["Gets ftyp + mdat<br/>no index yet"]
    B2 --> B3["Cannot decode anything"]
    B3 --> B4["Downloads the entire file<br/>or does a range request dance"]
    B4 --> B5["Finally reads moov, then plays"]
  end
  subgraph GOOD["faststart"]
    G1["Player requests bytes 0..N"] --> G2["Gets ftyp + moov<br/>index in hand"]
    G2 --> G3["Knows every sample offset"]
    G3 --> G4["Range-requests only what it needs<br/>playback starts immediately"]
  end`}
/>

সমাধানটা হলো **faststart**: encode শেষ হওয়ার পর `moov`-কে ফাইলের শুরুতে সরানো, আর ভেতরের সব chunk offset নতুন অবস্থান অনুযায়ী ঠিক করে দেওয়া (কারণ moov সামনে এলে mdat পিছিয়ে যায়, আর সব `stco` মান বদলাতে হয়)।

```bash
# during encode
ffmpeg -i source.mov -c:v libx264 -crf 21 -c:a aac -movflags +faststart out.mp4

# on an already-encoded file, no re-encoding at all
ffmpeg -i input.mp4 -c copy -movflags +faststart output.mp4
```

দ্বিতীয় কমান্ডটা লক্ষ করুন — `-c copy`। এটা re-encode নয়, শুধু byte সরানো। এক গিগাবাইটের ফাইলেও কয়েক সেকেন্ড।

<Callout type="warning">

Faststart একটা **অতিরিক্ত pass** — muxer পুরো ফাইল আবার লেখে। মানে ডিস্কে দুই গুণ জায়গা, আর বড় ফাইলে যথেষ্ট সময়। Pipeline ডিজাইন করার সময় এই ধাপটার জন্য জায়গা আর সময় ধরে রাখুন, নইলে ৫০ GB mezzanine-এ ডিস্ক ভরে গিয়ে job ফেল করবে।

</Callout>

## Fragmented MP4

Progressive MP4-এর মূল সীমা হলো — ফাইল শেষ না হলে index লেখা যায় না। Live স্ট্রিমে ফাইল কখনো শেষ হয় না।

**Fragmented MP4** (fMP4) এই সমস্যাটা কাঠামোগতভাবেই সরিয়ে দেয়। একটা বিশাল index-এর বদলে ফাইলটা ভাগ হয় অনেকগুলো ছোট **fragment**-এ, আর প্রতিটা fragment নিজের index নিজে বহন করে:

```text
[ftyp]                       file type
[moov]                       initialisation only:
                             codec config, track layout, NO sample tables
                             (contains an mvex box: "fragments follow")
[moof][mdat]                 fragment 1: its own index + its own samples
[moof][mdat]                 fragment 2
[moof][mdat]                 fragment 3
...
```

গুরুত্বপূর্ণ পার্থক্য: এখানে `moov` আর index নয়, **initialisation segment** — শুধু codec configuration আর track-এর গঠন। প্রতিটা `moof` (movie fragment) বলে দেয় তার পরের `mdat`-এ কয়টা sample, কত আকার, কী timestamp।

এর ফলে:

- **Live সম্ভব হয়** — fragment তৈরি হওয়ামাত্র পাঠানো যায়।
- **প্রতিটা fragment স্বাধীনভাবে fetch করা যায়** — HLS/DASH-এর segment ঠিক এই জিনিস।
- **Low-latency সম্ভব** — CMAF chunk হলো fragment-এরও ছোট টুকরো, যা GOP শেষ হওয়ার আগেই পাঠানো যায়।

সাথে একটা `sidx` (segment index) box থাকতে পারে, যা একটা single-file fMP4-এ byte-range দিয়ে segment খুঁজে দেয় — DASH-এর "SegmentBase" পদ্ধতি এটাই ব্যবহার করে।

## MPEG-TS: সম্প্রচারের উত্তরাধিকার

MPEG-TS তৈরি হয়েছিল স্যাটেলাইট আর কেবলের জন্য, ইন্টারনেটের কথা ভেবে নয়। এর নকশার মূল অনুমান ছিল — **সংকেত হারাতে পারে, দর্শক যেকোনো মুহূর্তে টিউন করতে পারে**।

তাই এর গঠন: গোটা stream ভাগ হয় **১৮৮ byte-এর স্থির packet**-এ। প্রতিটা packet-এ ৪ byte হেডার, যাতে একটা PID (কোন stream-এর অংশ), একটা continuity counter (packet হারিয়েছে কি না), আর কিছু flag।

```text
+-------------------------------------------+
| 4-byte header | 184 bytes payload         |  x N packets
+-------------------------------------------+

PID 0x0000  PAT  program association table
PID 0x1000  PMT  program map: which PID is video, which is audio
PID 0x0100  video elementary stream
PID 0x0101  audio elementary stream
```

স্ট্রাকচারাল টেবিলগুলো (PAT, PMT) stream-এর ভেতরে **বারবার** পাঠানো হয় — কারণ দর্শক মাঝপথে টিউন করলে তার শুরুর তালিকা লাগবে। একই কারণে PCR (program clock reference) দিয়ে ঘড়িও ঘনঘন পাঠানো হয়।

এর দাম হলো **overhead**। ১৮৮ byte-এর মধ্যে ৪ byte হেডার মানে প্রায় ২ শতাংশ; সাথে বারবার পাঠানো টেবিল আর padding মিলিয়ে বাস্তবে MPEG-TS একই কন্টেন্টে fMP4-এর চেয়ে **৫-১০ শতাংশ বড়** হয়।

তাহলে streaming-এ এটা এল কেন? কারণ HLS ২০০৯-এ যখন তৈরি হয়, তখন Apple-এর হার্ডওয়্যার আর টুলচেইন MPEG-TS ভালো জানত, আর TS-এর "যেকোনো জায়গা থেকে শুরু করা যায়" বৈশিষ্ট্যটা segment কাটার জন্য আদর্শ ছিল। এক দশক ধরে HLS মানেই ছিল `.ts` segment। আজ সেটা বদলে গেছে — HLS এখন fMP4 segment সমর্থন করে, আর নতুন সব ডিপ্লয়মেন্ট সেদিকেই যায়।

## WebM আর Matroska

**Matroska** (`.mkv`) একটা নমনীয়, উন্মুক্ত container — কার্যত যেকোনো codec ধরতে পারে, অসংখ্য track, অধ্যায়, সংযুক্তি। **WebM** হলো Matroska-র একটা সংকীর্ণ উপসেট, যা ওয়েবের জন্য তৈরি: ভিডিওতে VP8/VP9/AV1, audio-তে Vorbis/Opus।

WebM-এর জায়গা মূলত ব্রাউজার — বিশেষত সেই সব ক্ষেত্রে যেখানে royalty-free codec দরকার। কিন্তু আধুনিক adaptive streaming-এ এর ভূমিকা কমে গেছে, কারণ AV1 আর VP9 দুটোই এখন MP4/CMAF-এ মোড়া যায়, আর তাতে একটাই packaging পথ রাখা যায়।

## CMAF: অভিসরণ

দশ বছর ধরে প্রতিটা প্ল্যাটফর্ম একই কন্টেন্ট **দুবার** package করত — Apple ডিভাইসের জন্য HLS + MPEG-TS, বাকি সবার জন্য DASH + fMP4। মানে দ্বিগুণ স্টোরেজ, দ্বিগুণ CDN খরচ, দ্বিগুণ cache — এবং একই bit দুই মোড়কে।

**CMAF** (Common Media Application Format) এই অপচয়টা শেষ করে। এটা কোনো নতুন প্রোটোকল নয় — এটা fragmented MP4-এর একটা **কঠোরভাবে সংজ্ঞায়িত রূপ**, যাকে HLS আর DASH দুই manifest-ই নির্দেশ করতে পারে।

<Mermaid
title="CMAF-এর আগে আর পরে"
code={`graph TD
  subgraph BEFORE["Before CMAF"]
    S1["Mezzanine"] --> E1["Encode"]
    E1 --> P1["Package as MPEG-TS"] --> H1["HLS manifest"]
    E1 --> P2["Package as fMP4"] --> D1["DASH manifest"]
    P1 --> C1["CDN copy A"]
    P2 --> C2["CDN copy B"]
  end
  subgraph AFTER["With CMAF"]
    S2["Mezzanine"] --> E2["Encode"]
    E2 --> P3["Package once as CMAF fMP4"]
    P3 --> H2["HLS manifest"]
    P3 --> D2["DASH manifest"]
    P3 --> C3["One CDN copy"]
  end`}
/>

এক সেট segment, দুই manifest, এক CDN cache। স্টোরেজ আর origin খরচ প্রায় অর্ধেক, cache hit rate ভালো। এই কারণেই আজ নতুন কোনো প্ল্যাটফর্ম ডিজাইন করলে ডিফল্ট উত্তর CMAF।

একটাই কাঁটা থেকে যায় — DRM। HLS ঐতিহাসিকভাবে FairPlay-র জন্য `cbcs` encryption mode ব্যবহার করত, DASH ব্যবহার করত `cenc`। CMAF `cbcs`-এ থিতু হয়েছে, আর আজ সব বড় DRM সিস্টেমই সেটা সমর্থন করে — কিন্তু পুরনো ডিভাইস ধরতে চাইলে এখানে পরীক্ষা করে দেখা ছাড়া উপায় নেই।

## Container আর codec: কে কার সাথে চলে

| Container | ভিডিও codec           | Audio codec     | মূল ব্যবহার                        |
| --------- | --------------------- | --------------- | ---------------------------------- |
| MP4       | H.264, HEVC, AV1, VP9 | AAC, Opus, AC-3 | সবকিছু — VOD, download, CMAF       |
| MPEG-TS   | H.264, HEVC           | AAC, AC-3, MP3  | পুরনো HLS, broadcast, contribution |
| WebM      | VP8, VP9, AV1         | Vorbis, Opus    | ব্রাউজার, royalty-free পথ          |
| MKV       | কার্যত সব             | কার্যত সব       | archive, mezzanine, ভোক্তা ফাইল    |
| MOV       | H.264, ProRes, DNxHD  | PCM, AAC        | সম্পাদনা, mezzanine                |

লক্ষ করার মতো: MOV আর MP4 কার্যত একই ফরম্যাট (MP4 এসেছে QuickTime থেকেই), আর সেজন্যই `.mov` ফাইলকে `.mp4`-এ রূপান্তর প্রায়ই কেবল মোড়ক বদল। কিন্তু "প্রায়ই" মানে "সবসময়" নয় — MOV-এর ভেতরে ProRes থাকলে সেটা MP4-এ মুড়ে দিলেও কোনো ব্রাউজার চালাতে পারবে না।

## Transmuxing বনাম transcoding

এই চ্যাপ্টারের সবচেয়ে ব্যবহারিক অংশ এটাই।

**Transcode** — decode করো, তারপর আবার encode করো। Pixel-গুলো নতুন করে তৈরি হয়। মান কমে (generation loss), CPU লাগে প্রচুর, সময় লাগে অনেক।

**Transmux** (বা remux/rewrap) — encoded sample-গুলো যেমন আছে তেমনই তুলে নিয়ে অন্য container-এ বসাও। এক bit-ও পুনরায় encode হয় না। মান হুবহু অপরিবর্তিত, খরচ প্রায় শূন্য।

```bash
# transcode: expensive, lossy, slow
ffmpeg -i input.mkv -c:v libx264 -crf 21 -c:a aac output.mp4

# transmux: cheap, lossless, near-instant
ffmpeg -i input.mkv -c copy output.mp4
```

পার্থক্যটা সংখ্যায় দেখলে সবচেয়ে পরিষ্কার:

```text
one 45-minute 1080p file, H.264 + AAC

transcode to H.264/MP4    ~14 min CPU time    quality: slightly worse
transmux to MP4           ~8 seconds          quality: bit-identical
```

Transmux **যখন সম্ভব**:

- Codec গন্তব্য container সমর্থন করে (H.264 → MP4, TS, MKV সবই ঠিক আছে)।
- Bitstream-এর গঠন গন্তব্যের সাথে সামঞ্জস্যপূর্ণ (নিচে দেখুন)।
- Resolution, frame rate, bitrate — কিছুই বদলানোর দরকার নেই।

Transmux **যখন অসম্ভব**:

- গন্তব্য container ওই codec চেনে না (WebM-এ H.264 বসানো যায় না)।
- Player codec-টাই চালাতে পারে না (গল্পের "কেউ শর্টহ্যান্ড পড়তে জানে না")।
- Resolution বা bitrate বদলাতে হবে — সেটা সংজ্ঞা অনুযায়ীই re-encode।
- Bitstream-এর গঠন বেমানান (নিচেরটাই সবচেয়ে বেশি কামড়ায়)।

<Callout type="warning">

**Annex B বনাম AVCC — transmux-এর সবচেয়ে সাধারণ ফাঁদ।** একই H.264 stream দুই ভাবে লেখা যায়: MPEG-TS ব্যবহার করে **Annex B**, যেখানে প্রতিটা NAL unit-এর আগে `00 00 00 01` start code থাকে; MP4 ব্যবহার করে **AVCC**, যেখানে প্রতিটা NAL-এর আগে তার দৈর্ঘ্য লেখা থাকে, আর SPS/PPS আলাদা করে `avcC` box-এ রাখা হয়।

Pixel এক, encode এক, কিন্তু byte-এর বিন্যাস আলাদা। TS থেকে MP4-এ transmux করার সময় muxer-কে এই রূপান্তরটা করতে হয় (`h264_mp4toannexb`-র উল্টোটা)। FFmpeg এটা নিজে থেকেই করে, কিন্তু হাতে লেখা packager-এ এটাই এক নম্বর বাগ — ফাইলটা তৈরি হয়, আকারও ঠিক, শুধু চলে না।

</Callout>

আরও কয়েকটা জায়গা যেখানে transmux "কাজ করেছে" মনে হয়েও ভাঙে:

- **Timescale-এর অমিল** — TS-এর ঘড়ি 90 kHz, MP4-এ track-প্রতি নিজস্ব timescale। রূপান্তরে ভাগশেষ ফেলে দিলে দীর্ঘ ফাইলে A/V drift হয়।
- **Edit list** — MOV/MP4-এ `elst` box দিয়ে শুরুর দিকে একটা offset দেওয়া যায়। এটা উপেক্ষা করলে audio আর video-র মধ্যে স্থির একটা ফাঁক থেকে যায়।
- **VFR উৎস** — Chapter ১-এর সেই সমস্যা; transmux frame duration হুবহু বহন করে, তাই VFR-এর সমস্যাটাও হুবহু বয়ে নিয়ে যায়।
- **Codec profile আর level** — H.264 High 4:4:4 profile MP4-এ মোড়া যায় বটে, কিন্তু ফোনের হার্ডওয়্যার decoder সেটা চালাবে না।

Transmux-এর ব্যবহারিক জায়গাগুলো তাই খুব নির্দিষ্ট, আর প্রতিটাই মূল্যবান:

- **Ingest normalisation** — MKV বা MOV আপলোড এল, সেটা MP4-এ মুড়ে নিন। বেশিরভাগ ক্ষেত্রে re-encode লাগে না।
- **Packaging** — একই encode থেকে HLS, DASH আর progressive MP4 তৈরি করা মূলত transmux-এর কাজ।
- **Faststart ঠিক করা** — `-c copy -movflags +faststart`।
- **Track বাদ বা যোগ** — অতিরিক্ত audio track ফেলে দেওয়া, বা সাবটাইটেল ঢোকানো।
- **Live থেকে VOD** — লাইভের TS বা fMP4 segment জোড়া দিয়ে একটা VOD ফাইল বানানো, re-encode ছাড়াই।

## একটা MP4 box parser বানানো

কাঠামোটা হাতে-কলমে বোঝার সবচেয়ে ভালো উপায় হলো box গাছটা নিজে হাঁটা। নিচের প্রোগ্রামটা পুরো ফাইল মেমরিতে না তুলে (একটা ৫০ GB mezzanine-এ সেটা করা যাবে না) box-এর হেডার ধরে ধরে এগোয় এবং:

1. উপরের স্তরের box-গুলো তালিকাভুক্ত করে, তাদের আকার আর অবস্থানসহ।
2. `moov` আর `mdat`-এর ক্রম দেখে বলে দেয় ফাইলটা faststart কি না।
3. `moov` গাছে নেমে প্রতিটা track-এর handler, timescale, duration আর codec fourcc বের করে।
4. `mvex` বা `moof` দেখে বলে দেয় ফাইলটা fragmented কি না।
5. `stss` থেকে keyframe সংখ্যা বের করে গড় GOP দৈর্ঘ্য অনুমান করে।

<CodeTabs tsFile="mp4-inspect.ts" goFile="mp4_inspect.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import { open, type FileHandle } from 'node:fs/promises';

// --- Types ---------------------------------------------------------------

interface Box {
	type: string;
	offset: number; // absolute file offset of the box header
	size: number; // total box size, header included
	headerSize: number; // 8, or 16 when a 64-bit largesize is used
	children: Box[];
}

interface TrackInfo {
	id: number;
	handler: string; // 'vide', 'soun', 'text'
	timescale: number;
	durationTicks: number;
	durationSeconds: number;
	codec: string; // the sample-entry fourcc: avc1, hvc1, mp4a, av01
	width: number;
	height: number;
	syncSamples: number; // keyframe count, from stss
	totalSamples: number; // from stsz
}

interface FileReport {
	brands: string[];
	topLevel: Box[];
	faststart: boolean;
	fragmented: boolean;
	movieTimescale: number;
	movieDurationSeconds: number;
	tracks: TrackInfo[];
}

// Boxes whose payload is a list of further boxes. Everything else is a leaf
// we either parse by hand or skip. Descending into a leaf produces garbage,
// so this list is the parser's safety rail.
const CONTAINER_BOXES = new Set([
	'moov',
	'trak',
	'mdia',
	'minf',
	'stbl',
	'edts',
	'dinf',
	'mvex',
	'moof',
	'traf',
	'udta'
]);

// Sample-entry boxes carry a fixed 8-byte preamble before their own children,
// which is why stsd needs special handling rather than generic recursion.
const MAX_DEPTH = 8;

// --- Low-level reading ---------------------------------------------------

async function readAt(handle: FileHandle, offset: number, length: number): Promise<Buffer> {
	const buffer = Buffer.alloc(length);
	const { bytesRead } = await handle.read(buffer, 0, length, offset);
	if (bytesRead < length) {
		throw new Error(`mp4: short read at offset ${offset} (wanted ${length}, got ${bytesRead})`);
	}
	return buffer;
}

/** Reads one box header. Returns null when the box does not fit in the file. */
async function readBoxHeader(
	handle: FileHandle,
	offset: number,
	limit: number
): Promise<Box | null> {
	if (offset + 8 > limit) return null;

	const header = await readAt(handle, offset, 8);
	let size = header.readUInt32BE(0);
	const type = header.subarray(4, 8).toString('latin1');
	let headerSize = 8;

	if (size === 1) {
		// 64-bit largesize follows the type field.
		const large = await readAt(handle, offset + 8, 8);
		const big = large.readBigUInt64BE(0);
		if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('mp4: box larger than 8 EiB');
		size = Number(big);
		headerSize = 16;
	} else if (size === 0) {
		// "To end of file" — legal only for the final box.
		size = limit - offset;
	}

	if (size < headerSize || offset + size > limit) {
		throw new Error(`mp4: box "${type}" at ${offset} declares an impossible size ${size}`);
	}

	return { type, offset, size, headerSize, children: [] };
}

/** Walks a byte range, returning the boxes it contains, recursing where safe. */
async function walkBoxes(
	handle: FileHandle,
	start: number,
	end: number,
	depth = 0
): Promise<Box[]> {
	const boxes: Box[] = [];
	let offset = start;

	while (offset < end) {
		const box = await readBoxHeader(handle, offset, end);
		if (!box) break;

		if (CONTAINER_BOXES.has(box.type) && depth < MAX_DEPTH) {
			box.children = await walkBoxes(
				handle,
				box.offset + box.headerSize,
				box.offset + box.size,
				depth + 1
			);
		}

		boxes.push(box);
		offset = box.offset + box.size;
	}

	return boxes;
}

function findBox(boxes: Box[], type: string): Box | undefined {
	return boxes.find((box) => box.type === type);
}

// --- Leaf-box parsing ----------------------------------------------------

/** ftyp: major brand plus a list of compatible brands. */
async function parseFtyp(handle: FileHandle, box: Box): Promise<string[]> {
	const payload = await readAt(handle, box.offset + box.headerSize, box.size - box.headerSize);
	const brands: string[] = [payload.subarray(0, 4).toString('latin1')];
	for (let i = 8; i + 4 <= payload.length; i += 4) {
		brands.push(payload.subarray(i, i + 4).toString('latin1'));
	}
	return brands;
}

/** mvhd / mdhd share a layout: version, flags, times, timescale, duration. */
async function parseTimescaleBox(
	handle: FileHandle,
	box: Box
): Promise<{ timescale: number; duration: number }> {
	const payload = await readAt(
		handle,
		box.offset + box.headerSize,
		Math.min(box.size - box.headerSize, 32)
	);
	const version = payload.readUInt8(0);

	if (version === 1) {
		// 64-bit creation/modification times push the fields further out.
		return {
			timescale: payload.readUInt32BE(20),
			duration: Number(payload.readBigUInt64BE(24))
		};
	}
	return { timescale: payload.readUInt32BE(12), duration: payload.readUInt32BE(16) };
}

async function parseHandler(handle: FileHandle, box: Box): Promise<string> {
	const payload = await readAt(handle, box.offset + box.headerSize, 12);
	return payload.subarray(8, 12).toString('latin1');
}

async function parseTrackHeader(
	handle: FileHandle,
	box: Box
): Promise<{ id: number; width: number; height: number }> {
	const payload = await readAt(handle, box.offset + box.headerSize, box.size - box.headerSize);
	const version = payload.readUInt8(0);
	const idOffset = version === 1 ? 20 : 12;
	// Width and height are 16.16 fixed point in the final 8 bytes.
	const width = payload.readUInt32BE(payload.length - 8) / 65536;
	const height = payload.readUInt32BE(payload.length - 4) / 65536;
	return { id: payload.readUInt32BE(idOffset), width, height };
}

/**
 * stsd: entry count, then sample entries. The first entry's fourcc is the
 * codec — avc1/avc3 for H.264, hvc1/hev1 for HEVC, av01 for AV1, mp4a for AAC.
 */
async function parseSampleDescription(handle: FileHandle, box: Box): Promise<string> {
	const payload = await readAt(
		handle,
		box.offset + box.headerSize,
		Math.min(box.size - box.headerSize, 24)
	);
	const entryCount = payload.readUInt32BE(4);
	if (entryCount === 0) return 'none';
	return payload.subarray(12, 16).toString('latin1');
}

/** stss lists sync samples. Its absence means every sample is a keyframe. */
async function parseEntryCount(handle: FileHandle, box: Box | undefined): Promise<number> {
	if (!box) return 0;
	const payload = await readAt(handle, box.offset + box.headerSize, 8);
	return payload.readUInt32BE(4);
}

/** stsz: either one uniform size, or a per-sample table. We only need the count. */
async function parseSampleCount(handle: FileHandle, box: Box | undefined): Promise<number> {
	if (!box) return 0;
	const payload = await readAt(handle, box.offset + box.headerSize, 12);
	return payload.readUInt32BE(8);
}

// --- Track assembly ------------------------------------------------------

async function readTrack(handle: FileHandle, trak: Box): Promise<TrackInfo | null> {
	const tkhd = findBox(trak.children, 'tkhd');
	const mdia = findBox(trak.children, 'mdia');
	if (!tkhd || !mdia) return null;

	const mdhd = findBox(mdia.children, 'mdhd');
	const hdlr = findBox(mdia.children, 'hdlr');
	const minf = findBox(mdia.children, 'minf');
	if (!mdhd || !hdlr || !minf) return null;

	const stbl = findBox(minf.children, 'stbl');
	if (!stbl) return null;

	const { id, width, height } = await parseTrackHeader(handle, tkhd);
	const { timescale, duration } = await parseTimescaleBox(handle, mdhd);
	const handler = await parseHandler(handle, hdlr);

	const stsd = findBox(stbl.children, 'stsd');
	const codec = stsd ? await parseSampleDescription(handle, stsd) : 'unknown';

	return {
		id,
		handler,
		timescale,
		durationTicks: duration,
		// Timescale is per track and is NOT the movie timescale — mixing the two
		// up is the classic source of A/V drift after a remux.
		durationSeconds: timescale ? duration / timescale : 0,
		codec,
		width,
		height,
		syncSamples: await parseEntryCount(handle, findBox(stbl.children, 'stss')),
		totalSamples: await parseSampleCount(handle, findBox(stbl.children, 'stsz'))
	};
}

// --- Report --------------------------------------------------------------

async function inspect(path: string): Promise<FileReport> {
	const handle = await open(path, 'r');
	try {
		const { size } = await handle.stat();
		const topLevel = await walkBoxes(handle, 0, size);

		const ftyp = findBox(topLevel, 'ftyp');
		const moov = findBox(topLevel, 'moov');
		const mdat = findBox(topLevel, 'mdat');
		if (!moov) throw new Error('mp4: no moov box — not a valid ISOBMFF file');

		// faststart means the index is readable before the media payload.
		const faststart = !mdat || moov.offset < mdat.offset;

		// Either an mvex box declares fragments, or a moof is physically present.
		const fragmented =
			Boolean(findBox(moov.children, 'mvex')) || Boolean(findBox(topLevel, 'moof'));

		const mvhd = findBox(moov.children, 'mvhd');
		const movie = mvhd ? await parseTimescaleBox(handle, mvhd) : { timescale: 1000, duration: 0 };

		const tracks: TrackInfo[] = [];
		for (const trak of moov.children.filter((box) => box.type === 'trak')) {
			const track = await readTrack(handle, trak);
			if (track) tracks.push(track);
		}

		return {
			brands: ftyp ? await parseFtyp(handle, ftyp) : [],
			topLevel,
			faststart,
			fragmented,
			movieTimescale: movie.timescale,
			movieDurationSeconds: movie.timescale ? movie.duration / movie.timescale : 0,
			tracks
		};
	} finally {
		await handle.close();
	}
}

function megabytes(bytes: number): string {
	return (bytes / 1024 / 1024).toFixed(2);
}

function printReport(report: FileReport): void {
	console.log('--- File ---');
	console.log(`  brands          ${report.brands.join(', ')}`);
	console.log(`  duration        ${report.movieDurationSeconds.toFixed(2)}s`);
	console.log(`  timescale       ${report.movieTimescale}`);
	console.log(`  faststart       ${report.faststart ? 'yes' : 'no  (moov is after mdat)'}`);
	console.log(`  fragmented      ${report.fragmented ? 'yes (fMP4)' : 'no (progressive)'}`);

	console.log('--- Top-level boxes ---');
	for (const box of report.topLevel) {
		console.log(`  ${box.type}  offset ${box.offset}  size ${megabytes(box.size)} MB`);
	}

	console.log('--- Tracks ---');
	for (const track of report.tracks) {
		console.log(`  track ${track.id} [${track.handler}] codec ${track.codec}`);
		console.log(
			`    duration      ${track.durationSeconds.toFixed(2)}s @ timescale ${track.timescale}`
		);
		if (track.handler === 'vide') {
			console.log(`    dimensions    ${track.width}x${track.height}`);
			if (track.syncSamples > 0 && track.durationSeconds > 0) {
				const gop = track.durationSeconds / track.syncSamples;
				console.log(`    keyframes     ${track.syncSamples} of ${track.totalSamples}`);
				console.log(`    average GOP   ${gop.toFixed(2)}s`);
			} else {
				console.log('    keyframes     no stss box — every sample is a sync sample');
			}
		}
	}

	if (!report.faststart && !report.fragmented) {
		console.log('--- Advice ---');
		console.log('  moov sits after mdat: progressive playback will stall.');
		console.log('  Fix without re-encoding:');
		console.log('    ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4');
	}
}

async function main(): Promise<void> {
	const path = process.argv[2] ?? './ibn-sina-lecture.mp4';
	printReport(await inspect(path));
}

main().catch((error) => {
	console.error(`inspect failed: ${error instanceof Error ? error.message : error}`);
	process.exit(1);
});
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
)

// --- Types ---------------------------------------------------------------

type Box struct {
	Type       string
	Offset     int64 // absolute file offset of the box header
	Size       int64 // total box size, header included
	HeaderSize int64 // 8, or 16 when a 64-bit largesize is used
	Children   []Box
}

type TrackInfo struct {
	ID              uint32
	Handler         string // 'vide', 'soun', 'text'
	Timescale       uint32
	DurationTicks   uint64
	DurationSeconds float64
	Codec           string // sample-entry fourcc: avc1, hvc1, mp4a, av01
	Width           float64
	Height          float64
	SyncSamples     uint32 // keyframe count, from stss
	TotalSamples    uint32 // from stsz
}

type FileReport struct {
	Brands               []string
	TopLevel             []Box
	Faststart            bool
	Fragmented           bool
	MovieTimescale       uint32
	MovieDurationSeconds float64
	Tracks               []TrackInfo
}

// containerBoxes are boxes whose payload is a list of further boxes.
// Descending into a leaf produces garbage, so this set is the safety rail.
var containerBoxes = map[string]bool{
	"moov": true, "trak": true, "mdia": true, "minf": true,
	"stbl": true, "edts": true, "dinf": true, "mvex": true,
	"moof": true, "traf": true, "udta": true,
}

const maxDepth = 8

// --- Low-level reading ---------------------------------------------------

func readAt(reader io.ReaderAt, offset int64, length int) ([]byte, error) {
	buffer := make([]byte, length)
	if _, err := reader.ReadAt(buffer, offset); err != nil {
		return nil, fmt.Errorf("mp4: short read at offset %d: %w", offset, err)
	}
	return buffer, nil
}

// readBoxHeader parses one box header, or returns io.EOF when none fits.
func readBoxHeader(reader io.ReaderAt, offset, limit int64) (Box, error) {
	if offset+8 > limit {
		return Box{}, io.EOF
	}

	header, err := readAt(reader, offset, 8)
	if err != nil {
		return Box{}, err
	}

	size := int64(binary.BigEndian.Uint32(header[0:4]))
	boxType := string(header[4:8])
	headerSize := int64(8)

	switch size {
	case 1:
		// 64-bit largesize follows the type field.
		large, err := readAt(reader, offset+8, 8)
		if err != nil {
			return Box{}, err
		}
		size = int64(binary.BigEndian.Uint64(large))
		headerSize = 16
	case 0:
		// "To end of file" — legal only for the final box.
		size = limit - offset
	}

	if size < headerSize || offset+size > limit {
		return Box{}, fmt.Errorf("mp4: box %q at %d declares an impossible size %d", boxType, offset, size)
	}

	return Box{Type: boxType, Offset: offset, Size: size, HeaderSize: headerSize}, nil
}

func walkBoxes(reader io.ReaderAt, start, end int64, depth int) ([]Box, error) {
	var boxes []Box
	offset := start

	for offset < end {
		box, err := readBoxHeader(reader, offset, end)
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, err
		}

		if containerBoxes[box.Type] && depth < maxDepth {
			children, err := walkBoxes(reader, box.Offset+box.HeaderSize, box.Offset+box.Size, depth+1)
			if err != nil {
				return nil, err
			}
			box.Children = children
		}

		boxes = append(boxes, box)
		offset = box.Offset + box.Size
	}

	return boxes, nil
}

func findBox(boxes []Box, boxType string) *Box {
	for i := range boxes {
		if boxes[i].Type == boxType {
			return &boxes[i]
		}
	}
	return nil
}

// --- Leaf-box parsing ----------------------------------------------------

// parseFtyp returns the major brand followed by the compatible brands.
func parseFtyp(reader io.ReaderAt, box *Box) ([]string, error) {
	payload, err := readAt(reader, box.Offset+box.HeaderSize, int(box.Size-box.HeaderSize))
	if err != nil {
		return nil, err
	}

	brands := []string{string(payload[0:4])}
	for i := 8; i+4 <= len(payload); i += 4 {
		brands = append(brands, string(payload[i:i+4]))
	}
	return brands, nil
}

// parseTimescaleBox handles mvhd and mdhd, which share a layout.
func parseTimescaleBox(reader io.ReaderAt, box *Box) (uint32, uint64, error) {
	length := int(box.Size - box.HeaderSize)
	if length > 32 {
		length = 32
	}
	payload, err := readAt(reader, box.Offset+box.HeaderSize, length)
	if err != nil {
		return 0, 0, err
	}

	if payload[0] == 1 {
		// 64-bit creation/modification times push the fields further out.
		return binary.BigEndian.Uint32(payload[20:24]), binary.BigEndian.Uint64(payload[24:32]), nil
	}
	return binary.BigEndian.Uint32(payload[12:16]), uint64(binary.BigEndian.Uint32(payload[16:20])), nil
}

func parseHandler(reader io.ReaderAt, box *Box) (string, error) {
	payload, err := readAt(reader, box.Offset+box.HeaderSize, 12)
	if err != nil {
		return "", err
	}
	return string(payload[8:12]), nil
}

func parseTrackHeader(reader io.ReaderAt, box *Box) (uint32, float64, float64, error) {
	payload, err := readAt(reader, box.Offset+box.HeaderSize, int(box.Size-box.HeaderSize))
	if err != nil {
		return 0, 0, 0, err
	}

	idOffset := 12
	if payload[0] == 1 {
		idOffset = 20
	}

	// Width and height are 16.16 fixed point in the final 8 bytes.
	n := len(payload)
	width := float64(binary.BigEndian.Uint32(payload[n-8:n-4])) / 65536
	height := float64(binary.BigEndian.Uint32(payload[n-4:n])) / 65536
	return binary.BigEndian.Uint32(payload[idOffset : idOffset+4]), width, height, nil
}

// parseSampleDescription returns the first sample entry's fourcc — avc1/avc3
// for H.264, hvc1/hev1 for HEVC, av01 for AV1, mp4a for AAC.
func parseSampleDescription(reader io.ReaderAt, box *Box) (string, error) {
	length := int(box.Size - box.HeaderSize)
	if length > 24 {
		length = 24
	}
	payload, err := readAt(reader, box.Offset+box.HeaderSize, length)
	if err != nil {
		return "", err
	}
	if binary.BigEndian.Uint32(payload[4:8]) == 0 {
		return "none", nil
	}
	return string(payload[12:16]), nil
}

func parseEntryCount(reader io.ReaderAt, box *Box) (uint32, error) {
	if box == nil {
		return 0, nil
	}
	payload, err := readAt(reader, box.Offset+box.HeaderSize, 8)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(payload[4:8]), nil
}

func parseSampleCount(reader io.ReaderAt, box *Box) (uint32, error) {
	if box == nil {
		return 0, nil
	}
	payload, err := readAt(reader, box.Offset+box.HeaderSize, 12)
	if err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(payload[8:12]), nil
}

// --- Track assembly ------------------------------------------------------

func readTrack(reader io.ReaderAt, trak *Box) (TrackInfo, bool) {
	tkhd := findBox(trak.Children, "tkhd")
	mdia := findBox(trak.Children, "mdia")
	if tkhd == nil || mdia == nil {
		return TrackInfo{}, false
	}

	mdhd := findBox(mdia.Children, "mdhd")
	hdlr := findBox(mdia.Children, "hdlr")
	minf := findBox(mdia.Children, "minf")
	if mdhd == nil || hdlr == nil || minf == nil {
		return TrackInfo{}, false
	}

	stbl := findBox(minf.Children, "stbl")
	if stbl == nil {
		return TrackInfo{}, false
	}

	id, width, height, err := parseTrackHeader(reader, tkhd)
	if err != nil {
		return TrackInfo{}, false
	}
	timescale, duration, err := parseTimescaleBox(reader, mdhd)
	if err != nil {
		return TrackInfo{}, false
	}
	handler, err := parseHandler(reader, hdlr)
	if err != nil {
		return TrackInfo{}, false
	}

	codec := "unknown"
	if stsd := findBox(stbl.Children, "stsd"); stsd != nil {
		if value, err := parseSampleDescription(reader, stsd); err == nil {
			codec = value
		}
	}

	syncSamples, _ := parseEntryCount(reader, findBox(stbl.Children, "stss"))
	totalSamples, _ := parseSampleCount(reader, findBox(stbl.Children, "stsz"))

	var seconds float64
	if timescale > 0 {
		// Timescale is per track and is NOT the movie timescale — mixing the two
		// up is the classic source of A/V drift after a remux.
		seconds = float64(duration) / float64(timescale)
	}

	return TrackInfo{
		ID: id, Handler: handler, Timescale: timescale,
		DurationTicks: duration, DurationSeconds: seconds,
		Codec: codec, Width: width, Height: height,
		SyncSamples: syncSamples, TotalSamples: totalSamples,
	}, true
}

// --- Report --------------------------------------------------------------

func inspect(path string) (FileReport, error) {
	file, err := os.Open(path)
	if err != nil {
		return FileReport{}, fmt.Errorf("open %s: %w", path, err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return FileReport{}, err
	}

	topLevel, err := walkBoxes(file, 0, stat.Size(), 0)
	if err != nil {
		return FileReport{}, err
	}

	moov := findBox(topLevel, "moov")
	if moov == nil {
		return FileReport{}, errors.New("mp4: no moov box — not a valid ISOBMFF file")
	}
	mdat := findBox(topLevel, "mdat")

	report := FileReport{TopLevel: topLevel}

	// faststart means the index is readable before the media payload.
	report.Faststart = mdat == nil || moov.Offset < mdat.Offset

	// Either an mvex box declares fragments, or a moof is physically present.
	report.Fragmented = findBox(moov.Children, "mvex") != nil || findBox(topLevel, "moof") != nil

	if ftyp := findBox(topLevel, "ftyp"); ftyp != nil {
		if brands, err := parseFtyp(file, ftyp); err == nil {
			report.Brands = brands
		}
	}

	if mvhd := findBox(moov.Children, "mvhd"); mvhd != nil {
		timescale, duration, err := parseTimescaleBox(file, mvhd)
		if err == nil && timescale > 0 {
			report.MovieTimescale = timescale
			report.MovieDurationSeconds = float64(duration) / float64(timescale)
		}
	}

	for i := range moov.Children {
		if moov.Children[i].Type != "trak" {
			continue
		}
		if track, ok := readTrack(file, &moov.Children[i]); ok {
			report.Tracks = append(report.Tracks, track)
		}
	}

	return report, nil
}

func printReport(report FileReport) {
	fmt.Println("--- File ---")
	fmt.Printf("  brands          %v\n", report.Brands)
	fmt.Printf("  duration        %.2fs\n", report.MovieDurationSeconds)
	fmt.Printf("  timescale       %d\n", report.MovieTimescale)
	if report.Faststart {
		fmt.Println("  faststart       yes")
	} else {
		fmt.Println("  faststart       no  (moov is after mdat)")
	}
	if report.Fragmented {
		fmt.Println("  fragmented      yes (fMP4)")
	} else {
		fmt.Println("  fragmented      no (progressive)")
	}

	fmt.Println("--- Top-level boxes ---")
	for _, box := range report.TopLevel {
		fmt.Printf("  %s  offset %d  size %.2f MB\n", box.Type, box.Offset, float64(box.Size)/1024/1024)
	}

	fmt.Println("--- Tracks ---")
	for _, track := range report.Tracks {
		fmt.Printf("  track %d [%s] codec %s\n", track.ID, track.Handler, track.Codec)
		fmt.Printf("    duration      %.2fs @ timescale %d\n", track.DurationSeconds, track.Timescale)
		if track.Handler != "vide" {
			continue
		}
		fmt.Printf("    dimensions    %.0fx%.0f\n", track.Width, track.Height)
		if track.SyncSamples > 0 && track.DurationSeconds > 0 {
			fmt.Printf("    keyframes     %d of %d\n", track.SyncSamples, track.TotalSamples)
			fmt.Printf("    average GOP   %.2fs\n", track.DurationSeconds/float64(track.SyncSamples))
		} else {
			fmt.Println("    keyframes     no stss box — every sample is a sync sample")
		}
	}

	if !report.Faststart && !report.Fragmented {
		fmt.Println("--- Advice ---")
		fmt.Println("  moov sits after mdat: progressive playback will stall.")
		fmt.Println("  Fix without re-encoding:")
		fmt.Println("    ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4")
	}
}

func main() {
	path := "./ibn-sina-lecture.mp4"
	if len(os.Args) > 1 {
		path = os.Args[1]
	}

	report, err := inspect(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "inspect failed: %v\n", err)
		os.Exit(1)
	}

	printReport(report)
}
```

</div>
</CodeTabs>

## এই ইমপ্লিমেন্টেশনে যা যা প্রোডাকশন-গ্রেড

- **কখনো পুরো ফাইল মেমরিতে নয়** — শুধু box হেডার আর ছোট leaf payload পড়া হয়, তাই ৫০ GB mezzanine-এও একই কোড চলে
- **64-bit largesize সমর্থিত** — `size == 1` মানে ৪ GB-র বেশি box, যা বড় `mdat`-এ স্বাভাবিক; এটা না ধরলে parser বড় ফাইলে ভেঙে পড়ে
- **`size == 0` হ্যান্ডল করা** — "ফাইলের শেষ পর্যন্ত" নিয়মটা বৈধ এবং live-থেকে-লেখা ফাইলে সত্যিই দেখা যায়
- **Container box-এর সাদা তালিকা** — leaf box-এর ভেতরে recursion চালালে র‍্যান্ডম byte box হিসেবে পড়া হয়; স্পষ্ট তালিকা এই শ্রেণির বাগ ঠেকায়
- **Depth সীমা আর আকার যাচাই** — বিকৃত বা ক্ষতিগ্রস্ত ফাইল অসীম recursion বা বিশাল allocation ঘটাতে পারে; দুটোই আটকানো
- **Version-সচেতন parsing** — `mvhd`/`mdhd`/`tkhd`-র version 1-এ ফিল্ডের অবস্থান সরে যায়; ধরে নেওয়ার বদলে version পড়া হয়
- **Track timescale আর movie timescale আলাদা** — এই দুটো গুলিয়ে ফেলাই remux-এর পর A/V drift-এর সবচেয়ে প্রচলিত কারণ
- **কার্যকর পরামর্শ** — faststart না থাকলে টুল শুধু জানায় না, ঠিক করার re-encode-বিহীন কমান্ডটাও দেয়

<div class="takeaways">

### মূল শেখা

- Codec ঠিক করে pixel কীভাবে bit হবে, container ঠিক করে ওই bit ফাইলে কীভাবে সাজবে — `.mp4` এক্সটেনশন দেখে ভেতরের codec অনুমান করা যায় না
- MP4/ISOBMFF পুরোটাই nested box; `moov` হলো index আর metadata, `mdat` হলো আসল sample
- `moov` স্বাভাবিকভাবে ফাইলের শেষে লেখা হয়; HTTP progressive playback-এর জন্য সেটা সামনে আনতে হয় — **faststart**, আর এটা `-c copy` দিয়েই হয়, re-encode ছাড়া
- Fragmented MP4 index-কে ছোট ছোট `moof` টুকরোয় ভাগ করে দেয়, আর সেটাই live, low-latency আর segment-ভিত্তিক delivery-কে সম্ভব করে
- MPEG-TS ১৮৮ byte packet আর বারবার পাঠানো টেবিল নিয়ে সম্প্রচারের জন্য তৈরি; শক্তিশালী কিন্তু ৫-১০% বেশি overhead
- CMAF হলো অভিসরণ — এক সেট fMP4 segment, দুই manifest (HLS ও DASH), এক CDN cache; নতুন ডিজাইনে এটাই ডিফল্ট
- **Transmux হলো মোড়ক বদল, transcode হলো নতুন করে তৈরি** — transmux bit-অভিন্ন, প্রায় বিনামূল্যে, আর ingest ও packaging-এর বড় অংশ আসলে এই কাজ
- Transmux ভাঙে সীমানার জায়গায়: Annex B বনাম AVCC, timescale-এর ভাগশেষ, edit list, আর ডিভাইস-অসমর্থিত profile

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Apple HLS** ২০১৬ থেকে fMP4 segment সমর্থন করে, আর সেই পরিবর্তনটাই CMAF-কে বাস্তব করে তুলেছে — তার আগে প্রতিটা প্ল্যাটফর্মকে TS আর fMP4 দুটোই রাখতে হতো
- **Shaka Packager আর Bento4** মূলত transmux আর encrypt করে, transcode করে না — encode হয়ে যাওয়া stream থেকে HLS, DASH আর CMAF আউটপুট তৈরি করাই তাদের কাজ
- **Mux, Cloudflare Stream, Bunny-র মতো সার্ভিস** আপলোড পেলে প্রথমেই একটা দ্রুত inspect আর transmux ধাপ চালায় — অনেক ফাইলে কোনো re-encode ছাড়াই playable আউটপুট বেরিয়ে যায়
- **OBS আর ffmpeg-এর live রেকর্ডিং** ক্র্যাশ করলে MP4 ফাইলটা নষ্ট হয়ে যায়, কারণ `moov` তখনো লেখা হয়নি — এই কারণেই অভিজ্ঞ স্ট্রিমাররা MKV-তে রেকর্ড করে পরে MP4-তে remux করেন
- **YouTube আর Instagram-এর ingest** MOV, MKV, MP4, TS সব নেয়, কিন্তু ভেতরে প্রথমেই একটা normalisation ধাপ আছে — যেখানে যতটা সম্ভব transmux, আর কেবল প্রয়োজনে transcode

</div>
