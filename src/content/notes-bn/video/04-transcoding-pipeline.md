---
title: 'Transcoding pipeline'
subtitle: 'Transcode, transrate আর transsize, filter-এর ক্রম, hardware বনাম software encoder — আর একটা job-ভিত্তিক pipeline যেখানে segment-parallel encoding একটা বড় job-কে হারিয়ে দেয়।'
chapter: 4
level: 'intermediate'
readingTime: '২৪ মিনিট'
topics:
  [
    'transcoding',
    'scaling',
    'filter graph',
    'hardware encoding',
    'job queue',
    'idempotency',
    'retries',
    'parallel encoding'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

আগের তিন চ্যাপ্টারে আপনি জেনেছেন ভিডিও কী, কীভাবে ছোট করা হয়, আর কীভাবে মোড়া হয়। এই চ্যাপ্টার সেই তিনটে জিনিসকে একটা **চালু সিস্টেমে** পরিণত করার কথা — যেখানে ইউজার একটা ফাইল আপলোড করে আর কিছুক্ষণ পর একটা playable ladder তৈরি হয়ে যায়।

এখানেই বিষয়টা ভিডিও ইঞ্জিনিয়ারিং থেকে distributed systems-এর দিকে বাঁক নেয়। কারণ একটা transcode job-এর কয়েকটা বৈশিষ্ট্য একে সাধারণ background job থেকে আলাদা করে দেয়:

- এটা **দীর্ঘ** — মিনিট থেকে ঘণ্টা, সেকেন্ড নয়।
- এটা **ব্যয়বহুল** — একটা worker-এর সব CPU খেয়ে ফেলে, তাই একটা মেশিনে গাদা গাদা job চালানো যায় না।
- এটা **আংশিকভাবে ব্যর্থ হয়** — ৯০ শতাংশ শেষ হওয়ার পর মরে যাওয়া খুবই সম্ভব, আর সেই কাজটুকু ফেলে দেওয়ার খরচ বেশি।
- এটা **ব্যয়বহুলভাবে পুনরাবৃত্ত** — একই job দুবার চালালে টাকা দুবার খরচ হয়, শুধু সময় নয়।

## গল্পে বুঝি

কর্ডোবার একটা রঙ ও দর্জির কর্মশালা, মালিক ফাতিমা আল-ফিহরি। কর্মশালার সামনে একটা কাঠের হুক, তাতে গ্রাহকের ফরমায়েশের কাগজ ঝোলে; পেছনে বারোজন কারিগর কাজ করে; আর গুদামে থাকে **মূল থান** — একেকটা লম্বা, ভারী, উৎকৃষ্ট কাপড়ের রোল, যেটা থেকে সব অর্ডার বানানো হয়।

একদিন সকালে তিনটে অর্ডার এল, আর তিনটেই আলাদা ধরনের কাজ। প্রথম অর্ডারে দামেস্কের এক ব্যবসায়ী লিখেছেন — কাপড়টা তাঁর পছন্দ, কিন্তু তাঁর শহরে রেশমের চল নেই, ওই একই নকশা তুলোয় বুনে দিতে হবে। এটা নতুন করে বুনন, পুরো কাজ আবার শুরু। দ্বিতীয় অর্ডারে বুখারার এক দোকানদার চাইলেন একই মাপ, একই নকশা, শুধু সুতো একটু পাতলা — খরচ কমাতে হবে, দেখতে যতটা সম্ভব একই রাখতে হবে। আর তৃতীয়জন, সমরকন্দের এক দর্জি, চাইলেন হুবহু জিনিস, শুধু অর্ধেক মাপে। ফাতিমা তিন কারিগরকে তিন রকম নির্দেশ দিলেন, কারণ **তিনটে আলাদা কাজ, যদিও গ্রাহক তিনজনই বলেছে "একটু বদলে দিন"**।

তৃতীয় অর্ডারটাতেই সবচেয়ে বড় শিক্ষাটা লুকিয়ে ছিল। নবীন কারিগর আল-রাযি কাপড়ে সোনালি সুতোর কারুকাজ করে, তারপর সেটা কেটে অর্ধেক করল। ফাতিমা দেখে মাথায় হাত দিলেন — কারুকাজের অর্ধেক কাটা পড়েছে, নকশা নষ্ট। "আগে কাটো, তারপর কারুকাজ করো," তিনি বললেন। "উল্টো করলে তুমি এমন সূক্ষ্ম কাজে সময় দাও যেটা পরে কেটে ফেলবে, আর যেটুকু থাকে সেটাও বিকৃত।" **ক্রম ভুল হলে ফল ভুল, যদিও প্রতিটা ধাপ আলাদাভাবে ঠিক।**

কর্মশালায় দুরকম যন্ত্রও আছে। একটা যান্ত্রিক তাঁত — বিদ্যুৎগতিতে চলে, দিনে বিশটা থান নামিয়ে দেয়, কিন্তু নকশার সূক্ষ্মতায় হাতের কাজের ধারেকাছে যায় না, আর যা পারে তার বাইরে কিছু পারেও না। আর আছেন উস্তাদ কারিগররা — অনেক ধীর, অনেক দামি, কিন্তু একই পরিমাণ সুতোয় অনেক সুন্দর কাপড় বোনেন। ফাতিমার নিয়ম সরল: দোকানের সাধারণ মালে যান্ত্রিক তাঁত, আর যে থান হাজারবার নকল হবে বা যেটা দরবারে যাবে, সেটা উস্তাদের হাতে।

সবচেয়ে বড় পরিবর্তনটা এল একটা বিপর্যয়ের পর। এক কারিগর একটা চল্লিশ গজের থান নিয়ে টানা ছয় দিন কাজ করছিল, আর ষষ্ঠ দিনে অসুস্থ হয়ে পড়ল। ছয় দিনের কাজ পড়ে রইল, আর কেউ জানে না ঠিক কোথায় থেমেছে। ফাতিমা এরপর পদ্ধতিই বদলে দিলেন: এখন থেকে কোনো থান একজনকে পুরোটা দেওয়া হবে না। **থানটা আগে নির্দিষ্ট দাগে কেটে দশ টুকরো করা হবে** — আর দাগগুলো এমন জায়গায় পড়বে যেখানে নকশার পুনরাবৃত্তি শেষ হয়, যাতে জোড়া লাগালে সেলাই চোখে না পড়ে। দশজন কারিগর দশ টুকরো নিয়ে একসাথে কাজ করবে, শেষে জোড়া দেওয়া হবে। ছয় দিনের কাজ নেমে এল এক দিনের কিছু বেশিতে, আর কেউ অসুস্থ হলে শুধু তার টুকরোটাই আবার করাতে হয়, গোটা থান নয়।

তবে এই ব্যবস্থার নিজস্ব শৃঙ্খলা লাগল। এক, প্রতিটা কারিগরকে **হুবহু একই নির্দেশ** দিতে হবে — একজন একটু গাঢ় রঙ করলে জোড়ার জায়গায় দাগ ফুটে ওঠে। দুই, কাটার দাগ ঠিক নকশার পুনরাবৃত্তির সীমানায় পড়তে হবে, নইলে জোড়া মিলবে না।

আর হুকের কাগজ নিয়েও একটা নিয়ম হলো। একবার এক গ্রাহক অস্থির হয়ে একই অর্ডার তিনবার পাঠিয়েছিলেন, আর কর্মশালা তিনবার একই জিনিস বানিয়ে ফেলেছিল — তিন গুণ সুতো, তিন গুণ মজুরি, একটাই বিক্রি। এরপর থেকে প্রতিটা কাগজে একটা সিলমোহর নম্বর বসে; নতুন কাগজ এলে কেরানি আগে খাতায় দেখে ওই নম্বর আগে এসেছিল কি না। এসে থাকলে নতুন কাজ শুরু হয় না, আগের ফলটাই দেখিয়ে দেওয়া হয়।

মিলিয়ে নিই: রেশম থেকে তুলোয় নতুন করে বোনা হলো **transcode**, একই মাপে পাতলা সুতো হলো **transrate**, একই কাপড় অর্ধেক মাপে হলো **transsize**, "আগে কাটো তারপর কারুকাজ" হলো **filter order** (আগে scale, তারপর overlay/denoise), যান্ত্রিক তাঁত হলো **hardware encoder** আর উস্তাদ কারিগর হলো **software encoder**, হুকের কাগজ হলো **job queue**, কারিগররা হলো **worker**, সিলমোহর নম্বর হলো **idempotency key**, অসুস্থ কারিগরের কাজ আবার করানো হলো **retry**, থান কেটে দশ টুকরো করা হলো **segment-parallel encoding**, কাটার দাগগুলো হলো **keyframe boundary**, "সবাইকে হুবহু একই নির্দেশ" হলো অভিন্ন encoder সেটিংস, আর শেষে জোড়া দেওয়া হলো **concatenation**।

## তিনটে "trans" অপারেশন

গ্রাহক সবসময় বলে "একটু বদলে দাও"। কিন্তু কারিগরিভাবে তিনটে আলাদা কাজ আছে, আর তিনটের খরচ ভিন্ন:

| অপারেশন        | কী বদলায়              | Decode লাগে? | Re-encode লাগে? | আপেক্ষিক খরচ |
| -------------- | --------------------- | ------------ | --------------- | ------------ |
| **Transcode**  | Codec (H.264 → AV1)   | হ্যাঁ        | হ্যাঁ           | সবচেয়ে বেশি |
| **Transrate**  | Bitrate, codec একই    | হ্যাঁ        | হ্যাঁ           | বেশি         |
| **Transsize**  | Resolution            | হ্যাঁ        | হ্যাঁ           | বেশি         |
| **Transmux**   | শুধু container        | না           | না              | প্রায় শূন্য |

খেয়াল করুন — প্রথম তিনটেই decode + re-encode। পার্থক্যটা উদ্দেশ্যে, খরচে নয়। বাস্তবে একটা ladder তৈরির কাজ তিনটেকেই একসাথে করে: 1080p H.264 mezzanine থেকে 480p HEVC rendition বানানো মানে একই সাথে transcode, transrate আর transsize।

আর চতুর্থ সারিটা মনে রাখার মতো, কারণ **যে কাজটা transmux দিয়ে হয়ে যায় সেটা কখনো transcode করবেন না**। একটা 1080p H.264 উৎস থেকে ladder-এর 1080p H.264 ধাপটা প্রায়ই re-encode না করেই বানানো যায়, যদি bitrate আর GOP গঠন ইতিমধ্যেই উপযুক্ত হয়।

## Scaling আর filter-এর ক্রম

Transsize মানে resolution বদল, আর সেটা করে একটা **scaling algorithm**। বাছাইটা তুচ্ছ নয়:

| Algorithm  | গতি     | মান                        | কখন                         |
| ---------- | ------- | -------------------------- | --------------------------- |
| `nearest`  | দ্রুততম | খারাপ, দাঁতালো কিনারা      | কখনো নয় (thumbnail ছাড়া)   |
| `bilinear` | দ্রুত   | নরম, খুঁটিনাটি হারায়       | preview, দ্রুত pass         |
| `bicubic`  | মাঝারি  | ভালো ভারসাম্য              | সাধারণ ডিফল্ট               |
| `lanczos`  | ধীর     | তীক্ষ্ণ, সামান্য ringing   | downscale, প্রোডাকশন ladder |

ব্যবহারিক নিয়ম: **downscale-এ `lanczos`** (ladder-এ প্রায় সবসময় downscale-ই হয়), আর **upscale করবেনই না** — 480p উৎস থেকে 1080p rendition বানানো মানে bit খরচ করে কোনো নতুন তথ্য না দেওয়া। Ladder-এর উপরের ধাপগুলো উৎসের resolution-এ গিয়ে থেমে যাওয়া উচিত।

আরেকটা জিনিস: **downscale করার আগে সামান্য denoise** প্রায়ই bitrate কমায়, কারণ noise হলো এলোমেলো উচ্চ-কম্পাঙ্ক তথ্য যা encoder-এর সবচেয়ে বেশি bit খায় অথচ চোখে কোনো মূল্য যোগ করে না।

### ক্রমটাই সব

FFmpeg-এ filter-গুলো একটা graph-এ সাজানো থাকে, আর graph-এ ক্রম বদলালে ফলাফল বদলায় — গল্পের সেই "আগে কাটো, তারপর কারুকাজ"।

```bash
# WRONG: watermark drawn at source size, then squashed with the picture
ffmpeg -i source.mov -i logo.png \
  -filter_complex "[0:v][1:v]overlay=W-w-20:20,scale=854:480[v]" \
  -map "[v]" -c:v libx264 -crf 23 out.mp4

# RIGHT: scale first, then draw the watermark at the final size
ffmpeg -i source.mov -i logo.png \
  -filter_complex "[0:v]scale=854:480:flags=lanczos[s];[s][1:v]overlay=W-w-20:20[v]" \
  -map "[v]" -c:v libx264 -crf 23 out.mp4
```

কয়েকটা নির্ভরযোগ্য ক্রম-নিয়ম:

1. **Deinterlace সবার আগে** — interlaced ফুটেজে অন্য কোনো filter চালানোর আগেই `yadif`, নইলে দুটো field মিশে গিয়ে চিরস্থায়ী artifact তৈরি হয়।
2. **Crop, তারপর scale** — যেটুকু ফেলেই দেবেন সেটুকু scale করে লাভ নেই।
3. **Denoise, তারপর scale** — বেশিরভাগ ক্ষেত্রে; scale করার পর noise-এর গঠন বদলে যায়, তখন denoiser কম কার্যকর।
4. **Scale, তারপর overlay/subtitle/watermark** — নইলে লেখা বা লোগো ঘোলাটে বা বিকৃত হয়।
5. **Colour conversion স্পষ্টভাবে, শেষদিকে** — `zscale` বা `colorspace` দিয়ে, আর ফলাফলে সঠিক tag বসিয়ে (চ্যাপ্টার ১-এর mislabelled-metadata ফাঁদ)।
6. **FPS পরিবর্তন সবার শেষে** — frame ফেলে দেওয়ার আগে ওই frame-এ কাজ করা অপচয়।

<Callout type="warning">

একটাই FFmpeg কমান্ডে ladder-এর সব ধাপ তৈরি করতে গেলে (`-filter_complex` + `split`) উৎসটা মাত্র একবার decode হয়, যা বড় সাশ্রয়। কিন্তু এর দাম হলো — একটা ধাপ ব্যর্থ হলে **পুরো কমান্ডটা** ব্যর্থ হয়, আর অগ্রগতি আলাদা করে জানা যায় না। ছোট pipeline-এ এক কমান্ড ভালো; বড় pipeline-এ প্রতিটা rendition আলাদা job — কারণ আংশিক ব্যর্থতা সামলানোর ক্ষমতা decode-এর সাশ্রয়ের চেয়ে দামি।

</Callout>

## Hardware বনাম software encoding

গল্পের যান্ত্রিক তাঁত আর উস্তাদ কারিগর।

**Software encoder** (x264, x265, SVT-AV1) সাধারণ CPU-তে চলে। ধীর, কিন্তু নমনীয় — শত শত প্যারামিটার, চমৎকার rate control, আর একই bitrate-এ সেরা মান।

**Hardware encoder** (NVIDIA NVENC, Intel Quick Sync, AMD VCE, Apple VideoToolbox) হলো সিলিকনে বাঁধানো নির্দিষ্ট বর্তনী। দশ থেকে পঞ্চাশ গুণ দ্রুত, CPU প্রায় ছোঁয় না — কিন্তু নমনীয়তা কম, আর একই bitrate-এ মান কম।

```text
one 10-minute 1080p clip to H.264

x264 veryslow      42 min    quality: reference (best)
x264 medium         6 min    quality: -0.4 VMAF vs veryslow
x264 veryfast       2 min    quality: -2.1 VMAF
NVENC p7 (slow)    38 sec    quality: -1.8 VMAF, ~15% more bitrate for parity
NVENC p1 (fast)    11 sec    quality: -5.0 VMAF
```

সিদ্ধান্তের নিয়মটা আসলে সরল, আর সেটা মানের নয়, **অর্থনীতির**:

- **কন্টেন্ট বহুবার দেখা হবে?** Software। একবার বেশি খরচ করে চিরকাল bandwidth বাঁচবে। একটা জনপ্রিয় ভিডিওতে ১০ শতাংশ কম bitrate মানে লক্ষ লক্ষ delivery-তে ১০ শতাংশ কম CDN বিল।
- **Latency গুরুত্বপূর্ণ?** Hardware। Live, real-time, বা "আপলোডের ৩০ সেকেন্ডের মধ্যে দেখা যেতে হবে" — এখানে অন্য পথ নেই।
- **কন্টেন্ট একবার বা দুবার দেখা হবে?** Hardware। বেশিরভাগ ইউজার-জেনারেটেড ভিডিও এই দলে; এখানে encode-এর খরচই প্রধান খরচ, delivery নয়।
- **অনেকগুলো concurrent stream?** Hardware, কিন্তু **session সীমা খেয়াল করুন** — কনজিউমার GPU-তে একসাথে চালানো NVENC session-এর সংখ্যা ড্রাইভার-স্তরে সীমিত, আর সেটা ক্ষমতা পরিকল্পনায় বড় ধাক্কা দিতে পারে।

বাস্তবে বড় প্ল্যাটফর্মগুলো দুটোই করে: আপলোডের সাথে সাথে hardware দিয়ে একটা দ্রুত playable সংস্করণ, তারপর ভিডিওটা দর্শক পেলে পেছনে software দিয়ে আরও ভালো সংস্করণ — চ্যাপ্টার ২-এ দেখা YouTube-এর প্যাটার্নটাই।

## একটা job-ভিত্তিক pipeline

এখন গঠনটা দেখা যাক। একটা transcoding সার্ভিসের মূল অংশ চারটে: একটা **API** যা job গ্রহণ করে, একটা **queue**, একদল **worker**, আর একটা **state store**।

<Mermaid
title="Transcoding pipeline-এর গঠন"
code={`graph TD
  U["Upload to object storage"] --> API["Ingest API<br/>creates job with idempotency key"]
  API --> DB["Job state store"]
  API --> PROBE["Probe stage<br/>duration, codecs, keyframes"]
  PROBE --> PLAN["Plan stage<br/>ladder rungs + segment boundaries"]
  PLAN --> Q["Task queue"]
  Q --> W1["Worker 1<br/>segment 0..3"]
  Q --> W2["Worker 2<br/>segment 4..7"]
  Q --> W3["Worker 3<br/>segment 8..11"]
  W1 --> S["Segment store"]
  W2 --> S
  W3 --> S
  S --> J["Stitch stage<br/>concat + faststart"]
  J --> PKG["Package stage<br/>CMAF, manifests"]
  PKG --> DONE["Publish + notify"]
  W1 -.->|"heartbeat / progress"| DB
  W2 -.->|"heartbeat / progress"| DB
  W3 -.->|"heartbeat / progress"| DB`}
/>

গুরুত্বপূর্ণ ব্যাপারটা হলো — এটা একটা job নয়, **ধাপের একটা শৃঙ্খল**, আর প্রতিটা ধাপ আলাদাভাবে retry করা যায়। Probe সস্তা, plan সস্তা, encode দামি, stitch সস্তা। Package ব্যর্থ হলে আবার encode করার কোনো কারণ নেই।

### Idempotency

গল্পের সিলমোহর নম্বর। একটা transcode job দুবার চালানো মানে দুবার টাকা খরচ — আর queue-গুলো প্রায় সবসময়ই at-least-once, মানে duplicate অনিবার্য।

Idempotency key বানাতে হবে **ইনপুট থেকে নির্ণায়কভাবে**, ক্লায়েন্টের পাঠানো এলোমেলো id থেকে নয়:

```text
idempotency key = hash(source content hash + normalised job spec)

source content hash : ETag, or a hash of the object
job spec            : ladder definition, codec, filters, container
                      (canonically serialised — key order must be stable)
```

এতে একই ফাইলে একই spec-এর দ্বিতীয় অনুরোধ পুরনো ফলটাই ফেরত পায়, আর spec-এর একটামাত্র প্যারামিটার বদলালে সেটা সঠিকভাবেই নতুন job হয়।

### Retry, lease আর poison job

একটা worker মরতে পারে দুইভাবে — সে জানিয়ে মরতে পারে (process exit), অথবা চুপচাপ মরে যেতে পারে (মেশিন উধাও)। দ্বিতীয়টার জন্য **lease** লাগে: worker একটা task নেওয়ার সময় নির্দিষ্ট সময়ের ইজারা নেয় আর নিয়মিত heartbeat দিয়ে সেটা বাড়ায়। Heartbeat বন্ধ হলে ইজারা ফুরিয়ে যায় আর task আবার queue-তে ফেরে।

Retry-র নিয়ম:

- **Exponential backoff + jitter** — একটা downstream সার্ভিস পড়ে গেলে সব worker একসাথে ঝাঁপিয়ে পড়া উচিত নয়।
- **Attempt-সীমা** — নির্দিষ্টসংখ্যক চেষ্টার পর task **dead-letter**-এ যাবে। একটা ভাঙা ফাইল অসীমবার retry করে আপনার গোটা fleet খেয়ে ফেলতে পারে; একেই বলে poison job।
- **স্থায়ী আর ক্ষণস্থায়ী ব্যর্থতা আলাদা করুন** — "উৎস ফাইল corrupt" retry করে লাভ নেই, "S3 timeout" retry করলেই ঠিক হয়ে যাবে। এই দুটোকে এক করে ফেলা fleet-এর সবচেয়ে বড় অপচয়ের কারণ।

### Progress

দীর্ঘ job-এ progress কোনো বিলাসিতা নয় — এটাই "আটকে গেছে" আর "চলছে" আলাদা করার একমাত্র উপায়। FFmpeg `-progress` দিয়ে key-value লাইন দেয় (`out_time_us`, `frame`, `speed`), যেটা parse করে shard-প্রতি শতাংশ বের করা যায়। Segment-parallel pipeline-এ পুরো job-এর progress হলো segment-গুলোর ভারযুক্ত গড়।

আর progress লেখার সময় **থ্রটল করুন** — প্রতি ফ্রেমে একটা DB write দিলে ভিডিও নয়, আপনার ডেটাবেসই বাধা হয়ে দাঁড়াবে। কয়েক সেকেন্ড অন্তর একবার যথেষ্ট।

## Segment-parallel encoding

গল্পের সেই বিপর্যয়ের পরের সিদ্ধান্ত, আর এটাই আধুনিক transcoding pipeline-এর সবচেয়ে গুরুত্বপূর্ণ কাঠামোগত ধারণা।

একটা এক ঘণ্টার ভিডিও একটা মেশিনে encode করলে সময় লাগে ধরুন ৪০ মিনিট। ওই একই ভিডিওকে ৪০টা টুকরোয় ভেঙে ৪০টা worker-এ দিলে লাগে ১ মিনিট + জোড়া দেওয়ার সময়।

<Mermaid
title="এক বড় job বনাম segment-parallel"
code={`graph LR
  subgraph MONO["One big job"]
    M1["Source 60 min"] --> M2["Single worker<br/>40 min encode"] --> M3["Output"]
  end
  subgraph PAR["Segment-parallel"]
    P1["Source 60 min"] --> P2["Split at keyframes<br/>40 segments"]
    P2 --> P3["40 workers<br/>~1 min each"]
    P3 --> P4["Concat + faststart"]
    P4 --> P5["Output"]
  end`}
/>

সময় কমানো ছাড়াও তিনটে লাভ আছে, আর সেগুলো প্রায়ই বেশি গুরুত্বপূর্ণ:

- **আংশিক retry** — একটা segment ব্যর্থ হলে শুধু সেটাই আবার হয়, ৪০ মিনিটের কাজ নয়।
- **ছোট, অভিন্ন worker** — সব task প্রায় একই আকারের, তাই autoscaling আর ক্ষমতা পরিকল্পনা সহজ। একটা তিন ঘণ্টার ফিল্ম আর একটা তিরিশ সেকেন্ডের ক্লিপ একই মাপের task-এ ভাগ হয়।
- **Spot instance ব্যবহারযোগ্য** — এক মিনিটের task হারানোর ঝুঁকি সস্তা, তাই অনেক কম দামি preemptible মেশিনে কাজ চালানো যায়।

কিন্তু গল্পের শৃঙ্খলাগুলো এখানেও লাগে, আর একটাও ভাঙা যায় না:

**১. ভাগ হতে হবে keyframe-এর সীমানায়।** Keyframe নয় এমন frame থেকে কোনো টুকরো শুরু হতে পারে না, কারণ সে আগের frame-এর উপর নির্ভরশীল। তাই আগে উৎসের keyframe-এর তালিকা বের করতে হয় (`ffprobe` দিয়ে), তারপর সেই সীমানা ধরে ভাগ করতে হয়।

**২. প্রতিটা টুকরোয় হুবহু একই encoder সেটিংস।** একটা segment CRF 21-এ আর পরেরটা CRF 23-এ হলে জোড়ার জায়গায় দৃশ্যমান মানের লাফ দেখা যাবে — গল্পের সেই গাঢ় রঙের দাগ।

**৩. প্রতিটা টুকরো closed GOP-এ শেষ হতে হবে।** কোনো frame যেন পরের segment-এ তাকিয়ে না থাকে, নইলে জোড়ার পর decode ভাঙবে।

**৪. Rate control-এর দৃষ্টিসীমা টুকরোর মধ্যেই সীমাবদ্ধ।** এটাই আসল trade-off: একটা encoder পুরো ফাইল দেখে যতটা ভালো bit বণ্টন করতে পারত, এক মিনিটের টুকরো দেখে ততটা পারে না। তাই segment-parallel encode একই সেটিংসে এক-বড়-job-এর চেয়ে সামান্য বড় বা সামান্য খারাপ হয়। বেশিরভাগ প্ল্যাটফর্ম এই কয়েক শতাংশ খুশি মনে দেয়, কারণ বিনিময়ে যা পাওয়া যায় তা অনেক বড়। যেখানে দেয় না — যেমন প্রিমিয়াম VOD ক্যাটালগ — সেখানে টুকরো বড় রাখা হয় (কয়েক মিনিট) আর আগে একটা analysis pass চালানো হয়।

**৫. Concat হতে হবে re-encode ছাড়া।** জোড়া দেওয়ার ধাপটা transmux, transcode নয় — নইলে সমান্তরাল করার সব লাভ শেষ ধাপে ফেরত চলে যাবে।

```bash
# 1. find the keyframe timestamps in the source
ffprobe -v error -select_streams v:0 -skip_frame nokey \
  -show_entries frame=pkt_pts_time -of csv=p=0 source.mp4

# 2. split on those boundaries, no re-encoding
ffmpeg -i source.mp4 -c copy -f segment -segment_times 60,120,180 \
  -reset_timestamps 1 part-%03d.mp4

# 3. each worker encodes one part with IDENTICAL settings
ffmpeg -i part-007.mp4 -c:v libx264 -crf 21 -g 120 -keyint_min 120 \
  -sc_threshold 0 -c:a aac -b:a 128k enc-007.mp4

# 4. stitch without re-encoding, then move the index to the front
ffmpeg -f concat -safe 0 -i parts.txt -c copy -movflags +faststart final.mp4
```

## Orchestrator

নিচের কোডটা উপরের সব নিয়ম একসাথে বাস্তবায়ন করে: idempotency, keyframe-ভিত্তিক পরিকল্পনা, lease-সহ task claim, backoff-সহ retry, dead-letter, progress সমষ্টিকরণ, আর সব segment শেষ হলে stitch ধাপে উত্তরণ। এখানে queue আর storage ইচ্ছাকৃতভাবে interface-এর পেছনে — বাস্তবে সেগুলো SQS, Redis বা Postgres হবে, কিন্তু orchestration-এর যুক্তিটা একই থাকে।

<CodeTabs tsFile="transcode-orchestrator.ts" goFile="transcode_orchestrator.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import { createHash } from 'node:crypto';

// --- Domain types --------------------------------------------------------

type TaskState = 'pending' | 'running' | 'done' | 'failed';
type JobState = 'planning' | 'encoding' | 'stitching' | 'complete' | 'failed';

interface LadderRung {
	name: string; // '1080p', '720p', ...
	width: number;
	height: number;
	crf: number;
	maxrateBps: number;
}

interface JobSpec {
	sourceUri: string;
	sourceContentHash: string; // ETag or content digest of the source object
	ladder: LadderRung[];
	gopSeconds: number;
	container: 'mp4' | 'cmaf';
}

interface SourceProbe {
	durationSeconds: number;
	videoCodec: string;
	width: number;
	height: number;
	/** Keyframe timestamps in seconds, ascending. Segments may only start here. */
	keyframeTimes: number[];
}

interface SegmentTask {
	id: string;
	jobId: string;
	rung: string;
	index: number;
	startSeconds: number;
	endSeconds: number;
	state: TaskState;
	attempts: number;
	/** Absolute epoch ms after which an unheard-from worker loses the task. */
	leaseExpiresAt: number;
	progress: number; // 0..1
	lastError?: string;
	outputUri?: string;
}

interface Job {
	id: string;
	idempotencyKey: string;
	spec: JobSpec;
	probe?: SourceProbe;
	state: JobState;
	tasks: SegmentTask[];
	createdAt: number;
	outputUri?: string;
}

// --- Policy --------------------------------------------------------------

const MAX_ATTEMPTS = 4;
const LEASE_MS = 90_000;
const BASE_BACKOFF_MS = 5_000;
const TARGET_SEGMENT_SECONDS = 60;

/**
 * Failures split into two families and they must not be treated alike:
 * retrying a corrupt source burns the fleet, while not retrying an S3 blip
 * fails a job that would have succeeded on the next attempt.
 */
class PermanentError extends Error {}
class TransientError extends Error {}

// --- Ports ---------------------------------------------------------------

interface JobStore {
	findByIdempotencyKey(key: string): Promise<Job | null>;
	save(job: Job): Promise<void>;
}

interface TaskQueue {
	push(task: SegmentTask, availableAt: number): Promise<void>;
	/** Returns a task whose availableAt has passed, or null. */
	claim(workerId: string, now: number): Promise<SegmentTask | null>;
}

interface Encoder {
	/** Encodes one time range of the source. onProgress reports 0..1. */
	encodeSegment(
		spec: JobSpec,
		rung: LadderRung,
		sourceUri: string,
		startSeconds: number,
		endSeconds: number,
		onProgress: (fraction: number) => void
	): Promise<string>; // returns the output URI
}

interface Prober {
	probe(sourceUri: string): Promise<SourceProbe>;
}

interface Stitcher {
	/** concat + faststart. This is a transmux: it must never re-encode. */
	stitch(jobId: string, rung: string, segmentUris: string[]): Promise<string>;
}

// --- Idempotency ---------------------------------------------------------

/**
 * The key is derived from the input, not supplied by the caller, so a retried
 * request with the same source and the same spec is recognised as the same
 * job. Canonical serialisation matters: key order must be stable or two
 * identical specs hash differently.
 */
function idempotencyKeyFor(spec: JobSpec): string {
	const canonical = JSON.stringify({
		source: spec.sourceContentHash,
		container: spec.container,
		gop: spec.gopSeconds,
		ladder: [...spec.ladder]
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((rung) => [rung.name, rung.width, rung.height, rung.crf, rung.maxrateBps])
	});
	return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

// --- Planning ------------------------------------------------------------

/**
 * Chooses cut points from the source's actual keyframes, aiming for roughly
 * TARGET_SEGMENT_SECONDS. Cutting anywhere else would produce a segment whose
 * first frame depends on data in the previous segment, which cannot be encoded
 * independently.
 */
function planSegmentBoundaries(probe: SourceProbe, targetSeconds: number): number[] {
	const boundaries: number[] = [0];

	for (const time of probe.keyframeTimes) {
		if (time - boundaries[boundaries.length - 1] >= targetSeconds) {
			boundaries.push(time);
		}
	}

	// A trailing stub shorter than a third of the target is folded into the
	// previous segment; hundreds of two-second tasks cost more in scheduling
	// overhead than they save in wall-clock time.
	const tail = probe.durationSeconds - boundaries[boundaries.length - 1];
	if (boundaries.length > 1 && tail < targetSeconds / 3) {
		boundaries.pop();
	}

	boundaries.push(probe.durationSeconds);
	return boundaries;
}

function buildTasks(job: Job, probe: SourceProbe): SegmentTask[] {
	const boundaries = planSegmentBoundaries(probe, TARGET_SEGMENT_SECONDS);
	const tasks: SegmentTask[] = [];

	for (const rung of job.spec.ladder) {
		// Never upscale: a rung larger than the source spends bits inventing
		// detail that does not exist.
		if (rung.width > probe.width) continue;

		for (let i = 0; i < boundaries.length - 1; i++) {
			tasks.push({
				id: `${job.id}:${rung.name}:${i}`,
				jobId: job.id,
				rung: rung.name,
				index: i,
				startSeconds: boundaries[i],
				endSeconds: boundaries[i + 1],
				state: 'pending',
				attempts: 0,
				leaseExpiresAt: 0,
				progress: 0
			});
		}
	}

	return tasks;
}

// --- Coordinator ---------------------------------------------------------

export class Coordinator {
	constructor(
		private readonly store: JobStore,
		private readonly queue: TaskQueue,
		private readonly prober: Prober
	) {}

	/** Accepts a job, or returns the existing one for an identical request. */
	async submit(spec: JobSpec, now = Date.now()): Promise<Job> {
		const key = idempotencyKeyFor(spec);

		const existing = await this.store.findByIdempotencyKey(key);
		if (existing) return existing; // duplicate submission, not new work

		const job: Job = {
			id: `job_${key.slice(0, 12)}`,
			idempotencyKey: key,
			spec,
			state: 'planning',
			tasks: [],
			createdAt: now
		};
		await this.store.save(job);

		const probe = await this.prober.probe(spec.sourceUri);
		job.probe = probe;
		job.tasks = buildTasks(job, probe);
		job.state = 'encoding';
		await this.store.save(job);

		for (const task of job.tasks) {
			await this.queue.push(task, now);
		}

		return job;
	}

	/** Weighted by segment duration, so long segments count for more. */
	progressOf(job: Job): number {
		let total = 0;
		let completed = 0;

		for (const task of job.tasks) {
			const weight = task.endSeconds - task.startSeconds;
			total += weight;
			completed += weight * (task.state === 'done' ? 1 : task.progress);
		}

		return total === 0 ? 0 : completed / total;
	}

	/**
	 * Reclaims tasks whose worker stopped heart-beating. A worker can die
	 * silently, so absence of a heartbeat is the only reliable signal.
	 */
	async reclaimExpiredLeases(job: Job, now = Date.now()): Promise<number> {
		let reclaimed = 0;

		for (const task of job.tasks) {
			if (task.state !== 'running' || task.leaseExpiresAt > now) continue;

			task.state = 'pending';
			task.progress = 0;
			task.lastError = 'lease expired, worker presumed dead';
			reclaimed++;
			await this.queue.push(task, now);
		}

		if (reclaimed > 0) await this.store.save(job);
		return reclaimed;
	}
}

// --- Worker --------------------------------------------------------------

export class Worker {
	private progressWrittenAt = 0;

	constructor(
		private readonly id: string,
		private readonly store: JobStore,
		private readonly queue: TaskQueue,
		private readonly encoder: Encoder,
		private readonly onProgressPersist: (task: SegmentTask) => Promise<void>
	) {}

	async runOnce(job: Job, now = Date.now()): Promise<boolean> {
		const task = await this.queue.claim(this.id, now);
		if (!task) return false;

		task.state = 'running';
		task.attempts++;
		task.leaseExpiresAt = now + LEASE_MS;
		await this.store.save(job);

		const rung = job.spec.ladder.find((entry) => entry.name === task.rung);
		if (!rung) {
			await this.fail(job, task, new PermanentError(`unknown rung ${task.rung}`), now);
			return true;
		}

		try {
			task.outputUri = await this.encoder.encodeSegment(
				job.spec,
				rung,
				job.spec.sourceUri,
				task.startSeconds,
				task.endSeconds,
				(fraction) => this.reportProgress(task, fraction)
			);
			task.state = 'done';
			task.progress = 1;
			await this.store.save(job);
		} catch (error) {
			await this.fail(job, task, error, now);
		}

		return true;
	}

	/**
	 * Progress writes are throttled: one database write per frame would make the
	 * job store, not the encoder, the bottleneck.
	 */
	private reportProgress(task: SegmentTask, fraction: number): void {
		task.progress = fraction;
		const now = Date.now();
		if (now - this.progressWrittenAt < 3_000) return;
		this.progressWrittenAt = now;
		void this.onProgressPersist(task);
	}

	private async fail(job: Job, task: SegmentTask, error: unknown, now: number): Promise<void> {
		task.lastError = error instanceof Error ? error.message : String(error);

		const permanent = error instanceof PermanentError;
		if (permanent || task.attempts >= MAX_ATTEMPTS) {
			// Dead-letter. An unbounded retry of a broken source would consume the
			// entire fleet — this is the poison-job guard.
			task.state = 'failed';
			job.state = 'failed';
			await this.store.save(job);
			return;
		}

		// Exponential backoff with jitter, so a downstream outage does not cause
		// every worker to retry in lockstep.
		const backoff = BASE_BACKOFF_MS * 2 ** (task.attempts - 1);
		const jitter = Math.floor(Math.random() * backoff * 0.3);

		task.state = 'pending';
		task.progress = 0;
		await this.store.save(job);
		await this.queue.push(task, now + backoff + jitter);
	}
}

// --- Stitching -----------------------------------------------------------

export async function stitchIfReady(
	job: Job,
	stitcher: Stitcher,
	store: JobStore
): Promise<boolean> {
	if (job.state !== 'encoding') return false;
	if (!job.tasks.every((task) => task.state === 'done')) return false;

	job.state = 'stitching';
	await store.save(job);

	const rungs = [...new Set(job.tasks.map((task) => task.rung))];
	const outputs: string[] = [];

	for (const rung of rungs) {
		const uris = job.tasks
			.filter((task) => task.rung === rung)
			.sort((a, b) => a.index - b.index) // order matters; ids sort lexically
			.map((task) => task.outputUri)
			.filter((uri): uri is string => Boolean(uri));

		outputs.push(await stitcher.stitch(job.id, rung, uris));
	}

	job.outputUri = outputs[0];
	job.state = 'complete';
	await store.save(job);
	return true;
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package transcode

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"sort"
	"time"
)

// --- Domain types --------------------------------------------------------

type TaskState string
type JobState string

const (
	TaskPending TaskState = "pending"
	TaskRunning TaskState = "running"
	TaskDone    TaskState = "done"
	TaskFailed  TaskState = "failed"

	JobPlanning  JobState = "planning"
	JobEncoding  JobState = "encoding"
	JobStitching JobState = "stitching"
	JobComplete  JobState = "complete"
	JobFailed    JobState = "failed"
)

type LadderRung struct {
	Name       string `json:"name"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	CRF        int    `json:"crf"`
	MaxrateBps int    `json:"maxrate_bps"`
}

type JobSpec struct {
	SourceURI         string       `json:"-"`
	SourceContentHash string       `json:"source"`
	Ladder            []LadderRung `json:"ladder"`
	GOPSeconds        float64      `json:"gop"`
	Container         string       `json:"container"`
}

type SourceProbe struct {
	DurationSeconds float64
	VideoCodec      string
	Width           int
	Height          int
	// KeyframeTimes are ascending seconds. Segments may only start here.
	KeyframeTimes []float64
}

type SegmentTask struct {
	ID             string
	JobID          string
	Rung           string
	Index          int
	StartSeconds   float64
	EndSeconds     float64
	State          TaskState
	Attempts       int
	LeaseExpiresAt time.Time
	Progress       float64
	LastError      string
	OutputURI      string
}

type Job struct {
	ID             string
	IdempotencyKey string
	Spec           JobSpec
	Probe          *SourceProbe
	State          JobState
	Tasks          []*SegmentTask
	CreatedAt      time.Time
	OutputURI      string
}

// --- Policy --------------------------------------------------------------

const (
	maxAttempts           = 4
	leaseDuration         = 90 * time.Second
	baseBackoff           = 5 * time.Second
	targetSegmentSeconds  = 60.0
	progressWriteInterval = 3 * time.Second
)

// Failures split into two families and they must not be treated alike:
// retrying a corrupt source burns the fleet, while not retrying an S3 blip
// fails a job that would have succeeded on the next attempt.
type PermanentError struct{ Reason string }

func (e *PermanentError) Error() string { return e.Reason }

// --- Ports ---------------------------------------------------------------

type JobStore interface {
	FindByIdempotencyKey(key string) (*Job, error)
	Save(job *Job) error
}

type TaskQueue interface {
	Push(task *SegmentTask, availableAt time.Time) error
	// Claim returns a task whose availableAt has passed, or nil.
	Claim(workerID string, now time.Time) (*SegmentTask, error)
}

type Encoder interface {
	EncodeSegment(
		spec JobSpec, rung LadderRung, sourceURI string,
		startSeconds, endSeconds float64,
		onProgress func(fraction float64),
	) (string, error)
}

type Prober interface {
	Probe(sourceURI string) (SourceProbe, error)
}

type Stitcher interface {
	// Stitch does concat + faststart. This is a transmux: never re-encode.
	Stitch(jobID, rung string, segmentURIs []string) (string, error)
}

// --- Idempotency ---------------------------------------------------------

// IdempotencyKeyFor derives the key from the input rather than trusting a
// caller-supplied id, so a retried request with the same source and the same
// spec is recognised as the same job. The ladder is sorted first: canonical
// serialisation matters, or two identical specs hash differently.
func IdempotencyKeyFor(spec JobSpec) (string, error) {
	canonical := spec
	canonical.Ladder = append([]LadderRung(nil), spec.Ladder...)
	sort.Slice(canonical.Ladder, func(i, j int) bool {
		return canonical.Ladder[i].Name < canonical.Ladder[j].Name
	})

	encoded, err := json.Marshal(canonical)
	if err != nil {
		return "", fmt.Errorf("canonicalise spec: %w", err)
	}

	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])[:32], nil
}

// --- Planning ------------------------------------------------------------

// planSegmentBoundaries chooses cut points from the source's actual keyframes.
// Cutting anywhere else produces a segment whose first frame depends on data in
// the previous segment, which cannot be encoded independently.
func planSegmentBoundaries(probe SourceProbe, targetSeconds float64) []float64 {
	boundaries := []float64{0}

	for _, t := range probe.KeyframeTimes {
		if t-boundaries[len(boundaries)-1] >= targetSeconds {
			boundaries = append(boundaries, t)
		}
	}

	// A trailing stub shorter than a third of the target is folded into the
	// previous segment; hundreds of two-second tasks cost more in scheduling
	// overhead than they save in wall-clock time.
	tail := probe.DurationSeconds - boundaries[len(boundaries)-1]
	if len(boundaries) > 1 && tail < targetSeconds/3 {
		boundaries = boundaries[:len(boundaries)-1]
	}

	return append(boundaries, probe.DurationSeconds)
}

func buildTasks(job *Job, probe SourceProbe) []*SegmentTask {
	boundaries := planSegmentBoundaries(probe, targetSegmentSeconds)
	var tasks []*SegmentTask

	for _, rung := range job.Spec.Ladder {
		// Never upscale: a rung larger than the source spends bits inventing
		// detail that does not exist.
		if rung.Width > probe.Width {
			continue
		}

		for i := 0; i < len(boundaries)-1; i++ {
			tasks = append(tasks, &SegmentTask{
				ID:           fmt.Sprintf("%s:%s:%d", job.ID, rung.Name, i),
				JobID:        job.ID,
				Rung:         rung.Name,
				Index:        i,
				StartSeconds: boundaries[i],
				EndSeconds:   boundaries[i+1],
				State:        TaskPending,
			})
		}
	}

	return tasks
}

// --- Coordinator ---------------------------------------------------------

type Coordinator struct {
	Store  JobStore
	Queue  TaskQueue
	Prober Prober
}

// Submit accepts a job, or returns the existing one for an identical request.
func (c *Coordinator) Submit(spec JobSpec, now time.Time) (*Job, error) {
	key, err := IdempotencyKeyFor(spec)
	if err != nil {
		return nil, err
	}

	if existing, err := c.Store.FindByIdempotencyKey(key); err != nil {
		return nil, err
	} else if existing != nil {
		return existing, nil // duplicate submission, not new work
	}

	job := &Job{
		ID:             "job_" + key[:12],
		IdempotencyKey: key,
		Spec:           spec,
		State:          JobPlanning,
		CreatedAt:      now,
	}
	if err := c.Store.Save(job); err != nil {
		return nil, err
	}

	probe, err := c.Prober.Probe(spec.SourceURI)
	if err != nil {
		job.State = JobFailed
		_ = c.Store.Save(job)
		return nil, fmt.Errorf("probe source: %w", err)
	}

	job.Probe = &probe
	job.Tasks = buildTasks(job, probe)
	job.State = JobEncoding
	if err := c.Store.Save(job); err != nil {
		return nil, err
	}

	for _, task := range job.Tasks {
		if err := c.Queue.Push(task, now); err != nil {
			return nil, err
		}
	}

	return job, nil
}

// ProgressOf is weighted by segment duration, so long segments count for more.
func (c *Coordinator) ProgressOf(job *Job) float64 {
	var total, completed float64

	for _, task := range job.Tasks {
		weight := task.EndSeconds - task.StartSeconds
		total += weight
		if task.State == TaskDone {
			completed += weight
		} else {
			completed += weight * task.Progress
		}
	}

	if total == 0 {
		return 0
	}
	return completed / total
}

// ReclaimExpiredLeases requeues tasks whose worker stopped heart-beating.
// A worker can die silently, so absence of a heartbeat is the only reliable
// signal that its task needs to go back on the queue.
func (c *Coordinator) ReclaimExpiredLeases(job *Job, now time.Time) (int, error) {
	reclaimed := 0

	for _, task := range job.Tasks {
		if task.State != TaskRunning || task.LeaseExpiresAt.After(now) {
			continue
		}

		task.State = TaskPending
		task.Progress = 0
		task.LastError = "lease expired, worker presumed dead"
		reclaimed++

		if err := c.Queue.Push(task, now); err != nil {
			return reclaimed, err
		}
	}

	if reclaimed > 0 {
		if err := c.Store.Save(job); err != nil {
			return reclaimed, err
		}
	}
	return reclaimed, nil
}

// --- Worker --------------------------------------------------------------

type Worker struct {
	ID                string
	Store             JobStore
	Queue             TaskQueue
	Encoder           Encoder
	OnProgressPersist func(task *SegmentTask)

	progressWrittenAt time.Time
}

// RunOnce claims and processes a single task. It reports whether work was done.
func (w *Worker) RunOnce(job *Job, now time.Time) (bool, error) {
	task, err := w.Queue.Claim(w.ID, now)
	if err != nil || task == nil {
		return false, err
	}

	task.State = TaskRunning
	task.Attempts++
	task.LeaseExpiresAt = now.Add(leaseDuration)
	if err := w.Store.Save(job); err != nil {
		return true, err
	}

	rung, ok := findRung(job.Spec.Ladder, task.Rung)
	if !ok {
		return true, w.fail(job, task, &PermanentError{Reason: "unknown rung " + task.Rung}, now)
	}

	outputURI, err := w.Encoder.EncodeSegment(
		job.Spec, rung, job.Spec.SourceURI,
		task.StartSeconds, task.EndSeconds,
		func(fraction float64) { w.reportProgress(task, fraction) },
	)
	if err != nil {
		return true, w.fail(job, task, err, now)
	}

	task.OutputURI = outputURI
	task.State = TaskDone
	task.Progress = 1
	return true, w.Store.Save(job)
}

func findRung(ladder []LadderRung, name string) (LadderRung, bool) {
	for _, rung := range ladder {
		if rung.Name == name {
			return rung, true
		}
	}
	return LadderRung{}, false
}

// reportProgress throttles writes: one database write per frame would make the
// job store, not the encoder, the bottleneck.
func (w *Worker) reportProgress(task *SegmentTask, fraction float64) {
	task.Progress = fraction

	now := time.Now()
	if now.Sub(w.progressWrittenAt) < progressWriteInterval {
		return
	}
	w.progressWrittenAt = now

	if w.OnProgressPersist != nil {
		w.OnProgressPersist(task)
	}
}

func (w *Worker) fail(job *Job, task *SegmentTask, cause error, now time.Time) error {
	task.LastError = cause.Error()

	var permanent *PermanentError
	if errors.As(cause, &permanent) || task.Attempts >= maxAttempts {
		// Dead-letter. An unbounded retry of a broken source would consume the
		// entire fleet — this is the poison-job guard.
		task.State = TaskFailed
		job.State = JobFailed
		return w.Store.Save(job)
	}

	// Exponential backoff with jitter, so a downstream outage does not cause
	// every worker to retry in lockstep.
	backoff := baseBackoff * (1 << (task.Attempts - 1))
	jitter := time.Duration(rand.Int63n(int64(backoff) / 3))

	task.State = TaskPending
	task.Progress = 0
	if err := w.Store.Save(job); err != nil {
		return err
	}
	return w.Queue.Push(task, now.Add(backoff+jitter))
}

// --- Stitching -----------------------------------------------------------

// StitchIfReady advances the job once every segment of every rung is encoded.
func StitchIfReady(job *Job, stitcher Stitcher, store JobStore) (bool, error) {
	if job.State != JobEncoding {
		return false, nil
	}
	for _, task := range job.Tasks {
		if task.State != TaskDone {
			return false, nil
		}
	}

	job.State = JobStitching
	if err := store.Save(job); err != nil {
		return false, err
	}

	byRung := map[string][]*SegmentTask{}
	var order []string
	for _, task := range job.Tasks {
		if _, seen := byRung[task.Rung]; !seen {
			order = append(order, task.Rung)
		}
		byRung[task.Rung] = append(byRung[task.Rung], task)
	}

	var outputs []string
	for _, rung := range order {
		tasks := byRung[rung]
		// Order matters and ids sort lexically, so sort on the numeric index.
		sort.Slice(tasks, func(i, j int) bool { return tasks[i].Index < tasks[j].Index })

		uris := make([]string, 0, len(tasks))
		for _, task := range tasks {
			if task.OutputURI != "" {
				uris = append(uris, task.OutputURI)
			}
		}

		output, err := stitcher.Stitch(job.ID, rung, uris)
		if err != nil {
			job.State = JobFailed
			_ = store.Save(job)
			return false, fmt.Errorf("stitch %s: %w", rung, err)
		}
		outputs = append(outputs, output)
	}

	if len(outputs) > 0 {
		job.OutputURI = outputs[0]
	}
	job.State = JobComplete
	return true, store.Save(job)
}
```

</div>
</CodeTabs>

## এই ইমপ্লিমেন্টেশনে যা যা প্রোডাকশন-গ্রেড

- **ইনপুট থেকে derived idempotency key** — ক্লায়েন্টের পাঠানো id-র উপর ভরসা নয়; একই উৎস + একই spec মানে একই job, তাই duplicate submission-এ দ্বিগুণ বিল আসে না
- **Canonical serialisation** — key হিসাব করার আগে ladder সাজানো হয়, নইলে হুবহু একই spec-এর দুটো ভিন্ন hash হতে পারত
- **Keyframe-ভিত্তিক segment পরিকল্পনা** — কাটা হয় উৎসের আসল keyframe-এ, নির্দিষ্ট সময়ের ব্যবধানে নয়; এটাই স্বাধীনভাবে encode করার একমাত্র বৈধ উপায়
- **Stub segment একীভূত করা** — শেষের সামান্য টুকরো আগেরটার সাথে মিশে যায়, নইলে scheduling overhead সাশ্রয়ের চেয়ে বেশি হয়
- **কখনো upscale নয়** — উৎসের চেয়ে বড় rung বাদ পড়ে যায় পরিকল্পনার সময়েই
- **Lease + heartbeat** — worker চুপচাপ মরে গেলেও task ফেরত আসে; শুধু process exit ধরে থাকা যথেষ্ট নয়
- **স্থায়ী আর ক্ষণস্থায়ী error আলাদা** — corrupt উৎস সাথে সাথে dead-letter-এ, ক্ষণস্থায়ী ব্যর্থতা backoff-সহ retry
- **Jitter-সহ exponential backoff আর attempt-সীমা** — একটা downstream outage-এ পুরো fleet একসাথে ঝাঁপায় না, আর poison job অসীম retry-তে ঢোকে না
- **থ্রটল করা progress লেখা** — প্রতি ফ্রেমে DB write নয়, কয়েক সেকেন্ড অন্তর; নইলে job store-ই বাধা হয়ে দাঁড়ায়
- **সময়-ভারযুক্ত progress** — লম্বা segment বেশি ওজন পায়, তাই শতাংশটা সত্যিকারের অগ্রগতি বোঝায়
- **Stitch হলো transmux** — জোড়ার ধাপে re-encode নেই, নইলে সমান্তরালতার পুরো লাভ শেষ ধাপে ফেরত চলে যেত
- **Segment-এর ক্রম numeric index ধরে** — id lexically সাজালে `part-10` চলে যায় `part-2`-র আগে, আর ভিডিও এলোমেলো হয়ে যায়

<div class="takeaways">

### মূল শেখা

- Transcode (codec বদল), transrate (bitrate বদল) আর transsize (resolution বদল) — তিনটেই decode + re-encode, আর তিনটেই দামি; transmux এদের কেউ নয় এবং প্রায় বিনামূল্যে
- Filter-এর ক্রম ফলাফল বদলে দেয়: deinterlace আগে, crop তারপর scale, scale তারপর overlay, fps সবার শেষে — প্রতিটা ধাপ ঠিক থেকেও ক্রম ভুল হলে আউটপুট ভুল
- Downscale-এ `lanczos`, আর কখনো upscale করবেন না; উৎসের চেয়ে বড় rung শুধু bit খরচ করে, তথ্য দেয় না
- Hardware বনাম software-এর সিদ্ধান্ত মানের নয়, অর্থনীতির: বহুবার দেখা হবে এমন কন্টেন্টে software, latency-চালিত বা একবার-দেখা কন্টেন্টে hardware
- Transcode job দীর্ঘ, দামি আর আংশিকভাবে ব্যর্থ হয় — তাই এটাকে এক টুকরো কাজ নয়, retry-যোগ্য ধাপের শৃঙ্খল হিসেবে ডিজাইন করুন
- Idempotency key উৎস আর spec থেকে derive করুন, ক্লায়েন্টের কাছ থেকে নয় — at-least-once queue-তে duplicate অনিবার্য, আর এখানে duplicate মানে দ্বিগুণ বিল
- Lease আর heartbeat ছাড়া চুপচাপ মরে যাওয়া worker-এর task চিরকাল "running" অবস্থায় ঝুলে থাকে
- স্থায়ী আর ক্ষণস্থায়ী ব্যর্থতা আলাদা করুন, আর attempt-সীমা রাখুন — নইলে একটা ভাঙা ফাইল গোটা fleet খেয়ে ফেলবে
- Segment-parallel encoding সময় কমায়, আংশিক retry দেয়, task-গুলোকে সমান আকারের করে আর spot instance ব্যবহারযোগ্য করে — দাম হলো rate control-এর সীমিত দৃষ্টি, যা সাধারণত কয়েক শতাংশের বেশি নয়
- সব segment-এ **হুবহু একই encoder সেটিংস** আর **keyframe সীমানায় কাটা** — এই দুটোর একটাও ভাঙলে জোড়ার জায়গায় সমস্যা দৃশ্যমান হবে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Netflix** প্রতিটা টাইটেলকে shot-এর সীমানায় ভেঙে হাজার হাজার সমান্তরাল encode চালায়, তারপর জোড়া দেয় — একই কাঠামো, শুধু অনেক বড় স্কেলে, আর প্রতিটা shot-এর জন্য আলাদা bitrate সিদ্ধান্তসহ
- **AWS MediaConvert আর Elemental** "accelerated transcoding" নামে ঠিক এই segment-parallel পদ্ধতিই বিক্রি করে, আর দীর্ঘ ফাইলে এটা wall-clock সময় নাটকীয়ভাবে কমায়
- **YouTube** আপলোডের সাথে সাথে দ্রুত একটা নিম্ন rendition বের করে দেয় যাতে ভিডিওটা তাড়াতাড়ি দেখা যায়, বাকি ladder পেছনে তৈরি হতে থাকে — ব্যবহারকারীর অনুভূত অপেক্ষা আর মোট কাজ দুটো আলাদা জিনিস
- **Mux আর Cloudflare Stream** প্রতিটা আপলোডে content hash থেকে idempotency বজায় রাখে, তাই একই ফাইল দুবার আপলোড করলে দুবার বিল হয় না
- **Twitch-এর মতো live প্ল্যাটফর্ম** hardware encoder আর CBR ব্যবহার করে, কারণ এখানে segment-parallel করার সুযোগই নেই — ভবিষ্যতের ফুটেজ এখনো তৈরিই হয়নি

</div>
