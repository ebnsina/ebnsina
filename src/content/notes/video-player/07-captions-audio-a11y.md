---
title: 'ক্যাপশন, অডিও ট্র্যাক ও অ্যাক্সেসিবিলিটি'
subtitle: 'WebVTT-এর পুরো সিনট্যাক্স ও স্টাইলিং, TTML/IMSC, ভিডিওর ভেতরে লুকানো CEA-608/708, HLS ও DASH-এ টেক্সট ট্র্যাক, ফোর্সড সাবটাইটেল, একাধিক ভাষা ও অডিও ডেসক্রিপশন, বাংলা ক্যাপশনের ফন্ট ও যুক্তাক্ষরের সমস্যা, আর কিবোর্ড ও স্ক্রিন রিডারে চলা প্লেয়ার কন্ট্রোল।'
chapter: 7
level: 'intermediate'
readingTime: '২২ মিনিট'
topics: ['captions', 'subtitles', 'webvtt', 'imsc', 'cea-608', 'cea-708', 'audio tracks', 'audio description', 'accessibility', 'wcag', 'bangla']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

রাত আটটার খবর। BTV-র স্টুডিওতে সংবাদ পাঠক রাজি খবর পড়ছেন, আর পর্দার নিচের কোণে একটা ছোট বৃত্তে ইশারা ভাষার দোভাষী ফাতিমা একই খবর হাতের ইশারায় বলে যাচ্ছেন। যে দর্শক কানে শোনেন না, তিনি রাজির কথা শোনেন না, কিন্তু ফাতিমাকে দেখে পুরো খবর বোঝেন। ফাতিমার বৃত্তটা ছবিরই অংশ, টিভিতে বন্ধ করা যায় না; যারা দরকার নেই তারাও দেখেন। পাশের চ্যানেলে আবার খবরের সাথে নিচে লেখা ভেসে ওঠে, আর রিমোটের একটা বোতাম দিয়ে সেটা চালু-বন্ধ করা যায়। দুটোরই কাজ এক, কিন্তু একটা পর্দায় সেঁটে দেওয়া, আরেকটা দর্শকের ইচ্ছায়।

পরদিন সকালে লালবাগ কেল্লায় গাইড বিরুনির কাছে চারজন পর্যটক। একজন বাংলায় শুনতে চান, একজন ইংরেজিতে, একজন আরবিতে। বিরুনি তিন ভাষায় একই কাহিনি বলেন, প্রত্যেকে নিজের ভাষাটা শোনেন। দলের চতুর্থজন হাইসাম চোখে দেখেন না। তার জন্য বিরুনি কাহিনির ফাঁকে ফাঁকে যোগ করেন যা চোখে দেখা যাচ্ছে: "সামনে পরী বিবির সমাধি, চারপাশে বারান্দা, মাঝখানে একটা গম্বুজ।" দরবার হলের দেয়ালে একটা ফারসি শিলালিপি আছে; বাংলাভাষী পর্যটক বাকি সব বাংলায় শুনলেও শুধু ওই শিলালিপির অনুবাদটা আলাদা করে পড়ে শোনাতে হয়, কারণ ওটা কেউ নিজে পড়তে পারবেন না। আর বিরুনি যখন ফারসি থেকে বাংলায় অনুবাদ লেখা একটা কার্ড দেন, পুরনো ছাপাখানার কার্ডে যুক্তাক্ষর ভেঙে "ক্ষ" হয়ে যায় "ক্‌ষ", পড়তে কষ্ট।

মিলিয়ে নিই: রাজির কণ্ঠ হলো **মূল অডিও ট্র্যাক**। ফাতিমার পর্দায় সেঁটে থাকা বৃত্ত হলো **ওপেন বা বার্নড-ইন ক্যাপশন**, আর রিমোটে চালু-বন্ধ করা লেখা হলো **ক্লোজড ক্যাপশন** (WebVTT বা ভিডিওর ভেতরে CEA-608/708)। কানে না শোনা দর্শকের জন্য শুধু কথা নয়, শব্দের বর্ণনাও লেখা থাকলে সেটা **SDH বা ক্যাপশন**; শুধু ভাষার অনুবাদ হলে **সাবটাইটেল**। বিরুনির তিন ভাষা হলো **একাধিক অডিও ট্র্যাক**, হাইসামের জন্য দেখা জিনিসের বর্ণনা হলো **অডিও ডেসক্রিপশন**, শুধু শিলালিপির অনুবাদ হলো **ফোর্সড সাবটাইটেল**, আর ভাঙা যুক্তাক্ষরের কার্ড হলো **ফন্ট বা টেক্সট শেপিং ছাড়া রেন্ডার হওয়া বাংলা ক্যাপশন**। বাস্তবে ভালো প্লেয়ার এই সবকটা আলাদা ট্র্যাক হিসেবে চেনে, দর্শককে বেছে নিতে দেয়, আর কিবোর্ড বা স্ক্রিন রিডার দিয়েও সেই বাছাই করা যায়।

## এই চ্যাপ্টার কোথা থেকে শুরু করে

ক্যাপশন দেওয়ার তিনটা পথ (WebVTT সাইডকার, এমবেডেড CEA-608/708, fMP4-এর ভেতরে IMSC), `FORCED=YES`-এর মানে, আর একাধিক অডিও ট্র্যাকের তিনটা নিয়ম (`DEFAULT`, `AUTOSELECT`, সেগমেন্ট সীমানা মেলা) আছে [প্যাকেজিং চ্যাপ্টারে](/notes/video/06-packaging-for-streaming)। এখানে আমরা প্লেয়ারের দিক থেকে দেখব: এই ট্র্যাকগুলো ব্রাউজার আর প্লেয়ার লাইব্রেরিতে কীভাবে পৌঁছায়, কীভাবে দেখানো হয়, কোথায় ভাঙে, আর পুরো প্লেয়ারটা কীভাবে সবার জন্য ব্যবহারযোগ্য করবেন। ক্যাপশন তৈরি করার দিক (অটো ক্যাপশন, ASR) আছে [VOD ট্র্যাকের থাম্বনেইল ও ক্যাপশন চ্যাপ্টারে](/notes/vod/07-thumbnails-captions)।

## শব্দগুলো আগে পরিষ্কার

| শব্দ | মানে | কার জন্য |
| --- | --- | --- |
| সাবটাইটেল | কথোপকথনের লিখিত রূপ, সাধারণত অনুবাদ | যিনি শোনেন কিন্তু ভাষা বোঝেন না |
| ক্যাপশন (ক্লোজড) | কথোপকথন **এবং** গুরুত্বপূর্ণ শব্দ: "[দরজায় কড়া নাড়ার শব্দ]", "[করুণ সুর]", কে বলছে | যিনি শোনেন না বা কম শোনেন |
| SDH | সাবটাইটেলের ফরম্যাটে ক্যাপশনের তথ্য (Subtitles for the Deaf and Hard of hearing) | একই, যেখানে "ক্যাপশন" আলাদা ট্র্যাক টাইপ নেই |
| ফোর্সড সাবটাইটেল | শুধু সেই অংশ যা মূল ভাষার দর্শকেরও পড়া দরকার | সবাই, ক্যাপশন বন্ধ থাকলেও |
| ওপেন / বার্নড-ইন | ছবির পিক্সেলে আঁকা, বন্ধ করা যায় না | সোশ্যাল মিডিয়া ক্লিপ, যেখানে প্লেয়ার নিয়ন্ত্রণে নেই |
| অডিও ডেসক্রিপশন | দৃশ্যের মৌখিক বর্ণনা, আলাদা অডিও ট্র্যাক বা মিক্সে | যিনি দেখেন না বা কম দেখেন |

HTML-এর `track` এলিমেন্টে `kind` অ্যাট্রিবিউটের মানগুলো ঠিক এই ভাগ মেনে চলে: `subtitles`, `captions`, `descriptions` (টেক্সট বর্ণনা, স্ক্রিন রিডার পড়ার জন্য), `chapters`, `metadata`। ভুল `kind` দিলে ব্রাউজারের মেনুতে ভুল নামে দেখায়, আর স্ক্রিন রিডার ব্যবহারকারী ক্যাপশন খুঁজে পান না।

## WebVTT, পুরোটা

### কাঠামো

```text
WEBVTT
Kind: captions
Language: bn

STYLE
::cue(.speaker) {
  color: #ffd166;
}

NOTE বক্তার নাম হলুদে, শব্দের বর্ণনা বন্ধনীতে

intro-1
00:00:01.200 --> 00:00:04.000
<v রাজি><c.speaker>রাজি:</c> আজকের প্রধান খবর।

00:00:04.300 --> 00:00:06.800 line:10% align:center
[পটভূমিতে বৃষ্টির শব্দ]

00:00:07.000 --> 00:00:10.500 position:20% size:40% align:start
<v ফাতিমা>ঢাকায় সকাল থেকে
<i>টানা</i> বৃষ্টি হচ্ছে।
```

যা যা আছে:

- প্রথম লাইন অবশ্যই `WEBVTT`, ফাইল অবশ্যই **UTF-8**। Windows-এর Notepad বা পুরনো এডিটরে সেভ করা ফাইলে BOM বা অন্য এনকোডিং থাকলে বাংলা ভাঙা দেখায়।
- `STYLE` ব্লক (প্রথম কিউর আগে) দিয়ে ফাইলের ভেতরেই স্টাইল। `NOTE` হলো কমেন্ট।
- প্রতিটা কিউ: ঐচ্ছিক আইডি, সময়, তারপর টেক্সট। একটা খালি লাইন কিউ শেষ করে, তাই **কিউর টেক্সটের ভেতরে খালি লাইন রাখা যায় না**।
- সময়ের ফরম্যাট `ঘণ্টা:মিনিট:সেকেন্ড.মিলিসেকেন্ড`, ঘণ্টা ঐচ্ছিক, মিলিসেকেন্ডের আগে **ডট**। SRT-তে কমা থাকে; SRT থেকে রূপান্তরের সময় এটা না বদলালে পুরো ফাইল বাতিল হয়।
- কিউ সেটিং: `line` (উল্লম্ব অবস্থান), `position` আর `size` (আনুভূমিক অবস্থান আর প্রস্থ), `align` (`start`, `center`, `end`, `left`, `right`), `vertical` (`rl`, `lr`, উল্লম্ব লেখার জন্য), আর `region`।
- কিউ টেক্সটের ট্যাগ: `v` (বক্তা), `c` (ক্লাস), `i`, `b`, `u`, `ruby`, `lang`, আর টাইমস্ট্যাম্প ট্যাগ (কারাওকে-ধাঁচের শব্দ-ধরে হাইলাইট)।

### পেজ থেকে স্টাইল

```css
video::cue {
  font-family: 'Hind Siliguri', 'Noto Sans Bengali', sans-serif;
  font-size: 1.1em;
  line-height: 1.5;
  background: rgb(0 0 0 / 0.75);
  color: #fff;
}
video::cue(.speaker) { color: #ffd166; }
video::cue(i) { font-style: italic; }
```

`::cue`-এ সব CSS প্রপার্টি চলে না, শুধু একটা ছোট তালিকা: `color`, `opacity`, `visibility`, `text-decoration`, `text-shadow`, `background`, `outline`, `font` পরিবার, `line-height`, `white-space`, `ruby-position`, `text-combine-upright`। `padding`, `border-radius`, অবস্থান কিছুই না। এর বেশি নিয়ন্ত্রণ চাইলে নেটিভ রেন্ডারিং বাদ দিয়ে নিজে HTML-এ আঁকতে হবে (নিচে আছে)।

<Callout type="warning">

দর্শক নিজের ক্যাপশন স্টাইল বেছে নিতে পারেন (OS-এর অ্যাক্সেসিবিলিটি সেটিংসে বড় ফন্ট, হলুদ টেক্সট, অস্বচ্ছ ব্যাকগ্রাউন্ড)। অনেক ব্রাউজার আর প্ল্যাটফর্মে এই ব্যবহারকারী-পছন্দ আপনার `::cue` স্টাইলের উপরে বসে, আর বসাই উচিত। আপনার ব্র্যান্ডের রঙ ক্যাপশনে চাপিয়ে দেওয়ার চেষ্টা করবেন না; নিজে HTML-এ আঁকলে ব্যবহারকারীকে ফন্ট সাইজ আর রঙ বদলানোর একটা মেনু দিন।

</Callout>

### সাধারণ `video` এলিমেন্টে

```html
<video controls crossorigin="anonymous" src="https://media.baytalhikma.org/v/7f3a/720p.mp4">
  <track kind="captions" srclang="bn" label="বাংলা (ক্যাপশন)" src="/v/7f3a/bn.vtt" default>
  <track kind="subtitles" srclang="en" label="English" src="/v/7f3a/en.vtt">
  <track kind="chapters" srclang="bn" src="/v/7f3a/chapters.vtt">
</video>
```

ভিডিও আর VTT আলাদা অরিজিনে থাকলে `crossorigin` অ্যাট্রিবিউট আর VTT সার্ভারে CORS হেডার, **দুটোই** লাগে। না থাকলে ব্রাউজার নীরবে ট্র্যাক লোড করে না, কনসোলে শুধু একটা লাইন।

### JavaScript থেকে ট্র্যাক নিয়ন্ত্রণ

প্রতিটা ট্র্যাকের তিনটা `mode`: `showing` (দেখাও), `hidden` (লোড করো, ইভেন্ট দাও, কিন্তু আঁকো না), `disabled` (কিছুই না)। `hidden` খুব কাজের: কিউ ইভেন্ট পাবেন কিন্তু নিজে আঁকবেন।

```js
const tracks = [...video.textTracks];
tracks.forEach((t) => console.log(t.kind, t.language, t.label, t.mode));

const bn = tracks.find((t) => t.language === 'bn');
bn.mode = 'hidden';
bn.addEventListener('cuechange', () => {
  const cue = bn.activeCues[0];
  overlay.textContent = cue ? cue.text.replace(/<[^>]+>/g, '') : '';
});
```

```text
captions bn বাংলা (ক্যাপশন) showing
subtitles en English disabled
chapters bn  disabled
```

## TTML আর IMSC

TTML হলো XML-ভিত্তিক টাইমড টেক্সট ফরম্যাট, আর **IMSC** (IMSC1 Text ও Image প্রোফাইল) হলো স্ট্রিমিংয়ের জন্য তার একটা সংকীর্ণ প্রোফাইল। ব্রডকাস্ট আর বড় স্টুডিও ডেলিভারিতে (আর DASH-এ) এটাই প্রচলিত, কারণ অবস্থান, রঙ, রুবি টেক্সট আর রিজিয়ন অনেক নির্ভুলভাবে বলা যায়। DASH-এ এটা সাধারণত fMP4-এর ভেতরে `stpp` কোডেক হিসেবে আসে।

ব্রাউজার TTML নিজে বোঝে না। তাই JS প্লেয়ার পার্স করে হয় নেটিভ `VTTCue`-তে রূপান্তর করে (অবস্থানের কিছু তথ্য হারিয়ে), নয় নিজে HTML-এ আঁকে। hls.js-এ এর জন্য `enableIMSC1` (ডিফল্ট চালু), Shaka আর dash.js-ও বোঝে। আপনার নিজের লাইব্রেরি নিয়ে নিশ্চিত হওয়ার সবচেয়ে সহজ উপায়: একটা IMSC ট্র্যাকসহ টেস্ট স্ট্রিম চালিয়ে `video.textTracks` প্রিন্ট করা।

## ভিডিওর ভেতরে লুকানো CEA-608/708

টিভি সম্প্রচার থেকে আসা কনটেন্টে ক্যাপশন প্রায়ই আলাদা ফাইলে থাকে না, থাকে H.264 বা HEVC বিটস্ট্রিমের ভেতরে, প্রতিটা ফ্রেমের সাথে SEI মেসেজে। একে বলে CEA-608 (পুরনো, অ্যানালগ যুগের) আর CEA-708 (ডিজিটাল)।

**আছে কিনা দেখুন:**

```bash
ffprobe -hide_banner news.mp4 2>&1 | grep -i "closed captions"
```

```text
Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1920x1080, Closed Captions, 4500 kb/s, 25 fps
```

(উদাহরণ।) স্ট্রিম বর্ণনায় `Closed Captions` লেখা থাকলে ভিডিওর ভেতরে ক্যাপশন আছে।

**বের করে আনুন (ffmpeg-এর `movie` সোর্সের `subcc` আউটপুট দিয়ে):**

```bash
ffmpeg -hide_banner -f lavfi -i "movie=news.mp4[out0+subcc]" -map 0:1 news-cc.srt
```

**HLS-এ প্লেয়ারকে জানানো:** প্লেয়ার নিজে খোঁজে না, ম্যানিফেস্টে বলে দিতে হয়।

```text
#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="English CC",LANGUAGE="en",INSTREAM-ID="CC1",DEFAULT=NO,AUTOSELECT=YES
#EXT-X-STREAM-INF:BANDWIDTH=4800000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",CLOSED-CAPTIONS="cc"
1080p/index.m3u8
```

ভিডিওতে ক্যাপশন না থাকলে ভেরিয়েন্টে `CLOSED-CAPTIONS=NONE` লিখুন। এটা ছাড়া Safari-র প্লেয়ার ধরে নিতে পারে ক্যাপশন থাকতে পারে, আর মেনুতে একটা খালি অপশন দেখায়।

hls.js ডিফল্টে এমবেডেড ক্যাপশন পার্স করে (`enableCEA708Captions` চালু) আর `video.textTracks`-এ যোগ করে।

<Callout type="danger">

**বাংলা ক্যাপশন CEA-608-এ দেওয়া যায় না।** ৬০৮-এর অক্ষর তালিকা উত্তর আমেরিকান লাতিন অক্ষর আর কয়েকটা ইউরোপীয় বিশেষ অক্ষরে সীমাবদ্ধ। ৭০৮ নীতিগতভাবে আরো অক্ষর সমর্থন করে, কিন্তু প্লেয়ার আর ডিভাইসে তার বাস্তবায়ন অসম, আর বাংলা যুক্তাক্ষর ঠিকভাবে দেখানোর উপর ভরসা করার মতো নয়। বাংলা, আরবি বা যেকোনো অ-লাতিন ভাষার জন্য **WebVTT বা IMSC সাইডকার** ব্যবহার করুন।

</Callout>

## HLS আর DASH-এ টেক্সট ট্র্যাক

### HLS

সাবটাইটেল ট্র্যাক হলো `TYPE=SUBTITLES` মিডিয়া, যার নিজের একটা মিডিয়া প্লেলিস্ট থাকে, আর সেই প্লেলিস্ট সেগমেন্ট করা WebVTT ফাইলের তালিকা:

```text
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="বাংলা",LANGUAGE="bn",DEFAULT=YES,AUTOSELECT=YES,URI="subs/bn/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="বাংলা (SDH)",LANGUAGE="bn",CHARACTERISTICS="public.accessibility.transcribes-spoken-dialog,public.accessibility.describes-music-and-sound",URI="subs/bn-sdh/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="বাংলা (ফোর্সড)",LANGUAGE="bn",FORCED=YES,URI="subs/bn-forced/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="subs/en/index.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",SUBTITLES="subs",CLOSED-CAPTIONS=NONE
720p/index.m3u8
```

`CHARACTERISTICS` হলো Apple-এর UTI-ধাঁচের ট্যাগ, যা দিয়ে প্লেয়ার বোঝে এটা SDH ট্র্যাক। Apple ডিভাইসে OS-এর অ্যাক্সেসিবিলিটি সেটিং "Closed Captions + SDH" চালু থাকলে প্লেয়ার নিজে এই ট্র্যাকটা পছন্দ করে।

সেগমেন্ট করা WebVTT ফাইলের প্রতিটায় একটা `X-TIMESTAMP-MAP` হেডার থাকে, যা VTT-র সময়কে ভিডিওর MPEG-TS বা fMP4 টাইমস্ট্যাম্পের সাথে মেলায়। এটা ভুল হলে ক্যাপশন পুরোটা কয়েক সেকেন্ড আগে বা পরে সরে যায়, আর সবচেয়ে বেশি দেখা যায় লাইভে বা ভিডিও রি-এনকোডের পর। VOD-এর ক্যাপশন সিঙ্ক সমস্যার প্রথম সন্দেহ এটা।

### DASH

DASH-এ প্রতিটা ভাষা একটা `AdaptationSet`, আর ট্র্যাকের ভূমিকা `Role` দিয়ে:

```xml
<AdaptationSet contentType="text" mimeType="application/mp4" codecs="stpp" lang="bn">
  <Role schemeIdUri="urn:mpeg:dash:role:2011" value="caption"/>
  <Representation id="bn-cc" bandwidth="2000">
    <SegmentTemplate media="text/bn/$Number$.m4s" initialization="text/bn/init.mp4" duration="6" startNumber="1"/>
  </Representation>
</AdaptationSet>
<AdaptationSet contentType="text" mimeType="text/vtt" lang="en">
  <Role schemeIdUri="urn:mpeg:dash:role:2011" value="subtitle"/>
  <Representation id="en-sub" bandwidth="500">
    <BaseURL>text/en.vtt</BaseURL>
  </Representation>
</AdaptationSet>
```

`value="caption"` বনাম `value="subtitle"` ঠিক রাখুন; প্লেয়ারের মেনু আর স্বয়ংক্রিয় বাছাই দুটোই এর উপর নির্ভর করে। ফোর্সড সাবটাইটেলের জন্য DASH-এর নতুন সংস্করণে আলাদা একটা রোল মান আছে; আপনার প্লেয়ার কোনটা বোঝে, ডকস দেখে নিশ্চিত হোন।

## প্লেয়ার লাইব্রেরিতে ট্র্যাক বাছাই

```js
// hls.js
hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
  hls.subtitleTracks.forEach((t, i) => console.log(i, t.lang, t.name, t.forced ? 'forced' : ''));
});
hls.subtitleTrack = 0;     // -1 turns subtitles off
hls.subtitleDisplay = true;

// Shaka
await player.load(url);
player.selectTextLanguage('bn');
player.setTextTrackVisibility(true);
console.table(player.getTextTracks().map((t) => ({ lang: t.language, kind: t.kind, role: t.roles.join() })));
```

আর শুরুতেই ঠিক ট্র্যাক বাছার জন্য পছন্দ জানিয়ে রাখুন: hls.js-এ `subtitlePreference` (ডিফল্টে সেট না থাকলে hls.js ডিফল্ট বা ফোর্সড ট্র্যাক ছাড়া সাবটাইটেল চালু করে না), Shaka-তে `preferredTextLanguage`। দর্শক একবার ক্যাপশন চালু করলে সেটা মনে রাখুন (`localStorage`-এ), প্রতিটা ভিডিওতে আবার খুঁজতে বাধ্য করবেন না।

## একাধিক অডিও ট্র্যাক আর অডিও ডেসক্রিপশন

HLS-এ অডিও ট্র্যাক হলো `TYPE=AUDIO` মিডিয়া। অডিও ডেসক্রিপশন ট্র্যাক চেনানো হয় `CHARACTERISTICS="public.accessibility.describes-video"` দিয়ে:

```text
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="বাংলা",LANGUAGE="bn",DEFAULT=YES,AUTOSELECT=YES,URI="audio/bn/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="العربية",LANGUAGE="ar",AUTOSELECT=YES,URI="audio/ar/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="বাংলা (অডিও বর্ণনা)",LANGUAGE="bn",AUTOSELECT=NO,CHARACTERISTICS="public.accessibility.describes-video",URI="audio/bn-ad/index.m3u8"
```

hls.js-এর `audioPreference` কনফিগ এই `characteristics` দিয়েও মেলাতে পারে, তাই যে দর্শক অডিও বর্ণনা চান তাকে শুরু থেকেই সেটা দেওয়া যায়:

```js
const hls = new Hls({
  audioPreference: { lang: 'bn', characteristics: 'public.accessibility.describes-video' },
});
hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
  hls.audioTracks.forEach((t, i) => console.log(i, t.lang, t.name, t.characteristics ?? ''));
});
```

DASH-এ অডিও বর্ণনা সাধারণত `Role` বা `Accessibility` বর্ণনাকারী দিয়ে চিহ্নিত হয়, আর কোন স্কিম ব্যবহার হবে সেটা প্ল্যাটফর্মভেদে আলাদা (DVB, DASH-IF)। আপনার টার্গেট প্লেয়ারের ডকস দেখে মেলান।

<Callout type="tip">

অডিও ট্র্যাক বদলানো সাবটাইটেল বদলানোর মতো তাৎক্ষণিক নয়: প্লেয়ারকে নতুন অডিও সেগমেন্ট নামাতে হয় আর SourceBuffer-এ অডিও বদলাতে হয়। বদলানোর মুহূর্তে এক মুহূর্ত নীরবতা বা ছোট রিবাফার স্বাভাবিক। কোডেক বদলালে (স্টেরিও AAC থেকে 5.1 E-AC-3) কিছু ব্রাউজারে `SourceBuffer.changeType()` লাগে, যা [MSE চ্যাপ্টারে](/notes/video-player/03-media-source-extensions) আছে।

</Callout>

## বাংলা ক্যাপশন: ফন্ট, শেপিং, লাইনের দৈর্ঘ্য

বাংলা লেখা ঠিকভাবে দেখাতে তিনটা জিনিস লাগে: একটা বাংলা ফন্ট, একটা টেক্সট শেপিং ইঞ্জিন (যা যুক্তাক্ষর আর কার-চিহ্ন ঠিক জায়গায় বসায়), আর UTF-8। ডেস্কটপ আর মোবাইল ব্রাউজারে তিনটাই সাধারণত আছে। সমস্যা হয় স্মার্ট TV, সেট-টপ বক্স আর কিছু পুরনো মিডিয়া স্ট্যাকে:

- **বাংলা ফন্ট নেই**: অক্ষরের জায়গায় খালি বাক্স (যাকে "টোফু" বলে)।
- **শেপিং নেই বা দুর্বল**: "ক্ষ" দেখায় "ক্‌ষ", "কি"-র ই-কার অক্ষরের পরে বসে, রেফ ভুল জায়গায়।
- **ভুল এনকোডিং**: পুরো লেখা অর্থহীন চিহ্ন।

প্রতিকার, সহজ থেকে কঠিন:

1. **VTT ফাইল UTF-8 (BOM ছাড়া) নিশ্চিত করুন**: `file -I bn.vtt` (macOS) বা `file -i bn.vtt` (Linux) চালালে `charset=utf-8` আসা উচিত।
2. **`::cue`-এ বাংলা ফন্ট পরিবার দিন** আর পেজে সেই ওয়েব ফন্ট লোড করুন। কিছু ব্রাউজারে `::cue` ওয়েব ফন্ট মানে, কিছুতে মানে না।
3. **নেটিভ রেন্ডারিং বাদ দিয়ে নিজে আঁকুন**: কিউগুলো HTML-এর একটা `div`-এ বসান, যেখানে আপনার নিজের ওয়েব ফন্ট আর ব্রাউজারের পূর্ণ শেপিং কাজ করে। hls.js-এ `renderTextTracksNatively: false` দিলে সে ট্র্যাক `video`-তে যোগ না করে `NON_NATIVE_TEXT_TRACKS_FOUND` আর `CUES_PARSED` ইভেন্টে আপনাকে কিউ দেয়।
4. **যে ডিভাইসে কিছুই চলে না** (খুব পুরনো TV অ্যাপ), সেখানে শেষ উপায় হলো বার্নড-ইন সাবটাইটেলের একটা আলাদা রেন্ডিশন, যা বন্ধ করা যায় না। এটা খরচসাপেক্ষ, শুধু নির্দিষ্ট ডিভাইসের জন্য।

```js
const hls = new Hls({ renderTextTracksNatively: false });
const box = document.querySelector('.captions');   // positioned over the video, uses the page's Bangla font
let cues = [];

hls.on(Hls.Events.CUES_PARSED, (_, d) => { if (d.type === 'subtitles') cues = cues.concat(d.cues); });
video.addEventListener('timeupdate', () => {
  const t = video.currentTime;
  box.textContent = cues.filter((c) => t >= c.startTime && t < c.endTime).map((c) => c.text).join('\n');
});
```

`timeupdate` সেকেন্ডে চার-পাঁচবার আসে, যা ক্যাপশনের জন্য যথেষ্ট নির্ভুল; আর শব্দ-ধরে হাইলাইট চাইলে `requestVideoFrameCallback` ব্যবহার করুন। `textContent` ব্যবহার করুন, `innerHTML` নয়: ক্যাপশন ফাইল বাইরের উৎস থেকে আসতে পারে, আর এতে HTML ঢুকিয়ে দেওয়া যায়।

**লাইনের দৈর্ঘ্য।** ইংরেজি ক্যাপশনে প্রচলিত গাইডলাইন হলো প্রতি লাইনে মোটামুটি ৩২ থেকে ৪২ অক্ষর আর দুই লাইন। বাংলায় অক্ষর গোনা বিভ্রান্তিকর, কারণ একটা দৃশ্যমান যুক্তাক্ষর কয়েকটা ইউনিকোড কোড পয়েন্ট। পর্দায় চওড়া দিয়ে ভাবুন: দুই লাইন, প্রতিটা ভিডিও প্রস্থের মোটামুটি দুই-তৃতীয়াংশের মধ্যে, আর পড়ার জন্য যথেষ্ট সময় (একটা কিউ খুব কম সময় দেখালে কেউ পড়তে পারেন না)। আর বাংলায় `line-height` বাড়ান (উপরের CSS-এ ১.৫), নইলে উপরে-নিচে কার-চিহ্ন কেটে যায়।

## প্লেয়ার কন্ট্রোলের অ্যাক্সেসিবিলিটি

ক্যাপশন দেওয়া মানেই অ্যাক্সেসিবল প্লেয়ার নয়। কিবোর্ড ছাড়া মাউস ব্যবহার করতে পারেন না এমন দর্শক, বা স্ক্রিন রিডার ব্যবহারকারী, যদি প্লে বাটনেই পৌঁছাতে না পারেন, ক্যাপশন অর্থহীন।

### WCAG-এর যে মানদণ্ডগুলো সরাসরি প্রযোজ্য

WCAG 2.2 থেকে (W3C-র প্রকাশিত রেকমেন্ডেশন অনুযায়ী, ২০২৬ সালের অক্টোবরে যাচাই করা):

| মানদণ্ড | লেভেল | প্লেয়ারের জন্য মানে |
| --- | --- | --- |
| 1.2.2 Captions (Prerecorded) | A | রেকর্ড করা ভিডিওর কথাসহ অংশে ক্যাপশন |
| 1.2.3 Audio Description or Media Alternative | A | অডিও বর্ণনা বা পূর্ণ টেক্সট বিকল্প |
| 1.2.4 Captions (Live) | AA | লাইভেও ক্যাপশন |
| 1.2.5 Audio Description (Prerecorded) | AA | অডিও বর্ণনা ট্র্যাক |
| 1.4.2 Audio Control | A | তিন সেকেন্ডের বেশি নিজে থেকে বাজলে থামানো বা ভলিউম কমানোর উপায় |
| 2.1.1 Keyboard | A | সব কন্ট্রোল কিবোর্ডে চলে |
| 2.1.2 No Keyboard Trap | A | প্লেয়ারে ঢুকে কিবোর্ড ফোকাস আটকে যায় না |
| 2.2.2 Pause, Stop, Hide | A | নিজে চলা ভিডিও (যেমন হিরো ব্যাকগ্রাউন্ড) থামানো যায় |
| 2.4.7 Focus Visible | AA | কোন বাটনে ফোকাস আছে চোখে দেখা যায় |
| 2.4.11 Focus Not Obscured (Minimum) | AA | ফোকাস করা কন্ট্রোল অন্য কিছুর নিচে পুরো ঢেকে যায় না |
| 2.5.8 Target Size (Minimum) | AA | টাচ লক্ষ্য অন্তত ২৪×২৪ CSS পিক্সেল (বা যথেষ্ট ফাঁকা জায়গা) |
| 4.1.2 Name, Role, Value | A | প্রতিটা কন্ট্রোলের নাম, ভূমিকা আর অবস্থা স্ক্রিন রিডার পায় |
| 2.3.3 Animation from Interactions | AAA | ইন্টারঅ্যাকশনে চলা অ্যানিমেশন বন্ধ করা যায় |

### বাস্তবে

```html
<div class="player" role="region" aria-label="ভিডিও প্লেয়ার: বায়তুল হিকমার ইতিহাস">
  <video id="v" playsinline></video>
  <div class="controls">
    <button id="play" aria-label="চালান"><svg aria-hidden="true" focusable="false"><use href="#i-play"/></svg></button>
    <input id="seek" type="range" min="0" max="1250" step="1" value="0"
           aria-label="সময়" aria-valuetext="০ মিনিট ০ সেকেন্ড, মোট ২০ মিনিট ৫০ সেকেন্ড">
    <button id="cc" aria-pressed="false" aria-label="ক্যাপশন">CC</button>
    <button id="mute" aria-pressed="false" aria-label="শব্দ বন্ধ"><svg aria-hidden="true" focusable="false"><use href="#i-volume"/></svg></button>
    <button id="fs" aria-label="ফুলস্ক্রিন"><svg aria-hidden="true" focusable="false"><use href="#i-fullscreen"/></svg></button>
  </div>
</div>
```

যা যা দরকার:

- **নেটিভ এলিমেন্ট ব্যবহার করুন**: `button` আর `input type="range"` নিজে থেকেই কিবোর্ডে চলে আর স্ক্রিন রিডারে ঠিক ভূমিকা বলে। `div`-এ ক্লিক হ্যান্ডলার বসালে সব আবার নিজে বানাতে হয়।
- **আইকন-বাটনে নাম দিন** (`aria-label`), আর টগলে অবস্থা (`aria-pressed`)। প্লে/পজ বাটনের লেবেল অবস্থা অনুযায়ী বদলান।
- **সিক বারে `aria-valuetext`** দিন মানুষের ভাষায়, নইলে স্ক্রিন রিডার "৭৪৭" পড়ে, যার কোনো মানে নেই। এটা `Intl` দিয়ে বানান, হাতে লিখে নয়।
- **ফোকাস দৃশ্যমান রাখুন**: `outline: none` দেবেন না, আর অটো-হাইড কন্ট্রোল ফোকাস থাকা অবস্থায় লুকাবেন না।
- **কিবোর্ড শর্টকাট** (স্পেস প্লে/পজ, বাম-ডান ৫ সেকেন্ড, `f` ফুলস্ক্রিন, `c` ক্যাপশন, `m` মিউট) শুধু তখন যখন প্লেয়ারে ফোকাস আছে, নইলে পেজের অন্য ইনপুটে টাইপ করা ভাঙে।
- **অটোপ্লে শব্দসহ নয়**, আর `prefers-reduced-motion` চালু থাকলে প্রিভিউ বা ব্যাকগ্রাউন্ড ভিডিও নিজে থেকে চালাবেন না।

```js
const fmt = new Intl.DurationFormat('bn', { style: 'long' });   // check support, see note below
function valueText(t, total) {
  const d = (s) => ({ minutes: Math.floor(s / 60), seconds: Math.floor(s % 60) });
  return `${fmt.format(d(t))}, মোট ${fmt.format(d(total))}`;
}
seek.setAttribute('aria-valuetext', valueText(video.currentTime, video.duration));

if (matchMedia('(prefers-reduced-motion: reduce)').matches) heroVideo.removeAttribute('autoplay');
```

`Intl.DurationFormat` তুলনামূলক নতুন API; আপনার টার্গেট ব্রাউজারে আছে কিনা MDN-এ দেখে নিন, না থাকলে `Intl.NumberFormat` দিয়ে মিনিট আর সেকেন্ড আলাদা করে ফরম্যাট করুন।

<Mermaid
title="Where a caption can be lost on its way to the screen"
code={`graph LR
  F["Caption file or SEI data"] --> M["Manifest declares it?"]
  M -->|"no"| X1["Player never sees the track"]
  M -->|"yes"| P["Player parses format"]
  P -->|"unsupported"| X2["Track missing from menu"]
  P --> T["TextTrack or app overlay"]
  T --> R["Renderer: font and shaping"]
  R -->|"no Bangla font"| X3["Boxes or broken conjuncts"]
  R --> S["Visible, in sync, readable"]`}
/>

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | কীভাবে নিশ্চিত হবেন | সমাধান |
| --- | --- | --- |
| ক্যাপশন মেনুতেই নেই | কনসোলে `[...video.textTracks]`; hls.js-এ `hls.subtitleTracks` | ম্যানিফেস্টে ট্র্যাক ঘোষণা নেই, বা ভেরিয়েন্টে `SUBTITLES="..."` গ্রুপ যুক্ত নেই |
| সাধারণ `video`-তে VTT লোড হয় না | Network প্যানেলে VTT রিকোয়েস্ট; কনসোলে CORS এরর | `video`-তে `crossorigin` আর VTT সার্ভারে CORS হেডার দুটোই দিন |
| পুরো ফাইল বাতিল, কোনো কিউ নেই | ফাইলের প্রথম লাইন আর সময়ের ফরম্যাট দেখুন | প্রথম লাইন `WEBVTT` নয়, বা SRT থেকে কমা রয়ে গেছে |
| ক্যাপশন সারাক্ষণ কয়েক সেকেন্ড আগে বা পরে | একটা পরিচিত কথার সময় ভিডিও আর VTT-তে মিলিয়ে দেখুন | সেগমেন্ট করা VTT-র `X-TIMESTAMP-MAP` ভুল, বা রি-এনকোডে শুরুর টাইমস্ট্যাম্প বদলেছে |
| বাংলায় বাক্স বা ভাঙা যুক্তাক্ষর | একই ফাইল ডেস্কটপ Chrome-এ ঠিক দেখায় কিনা | ডিভাইসে ফন্ট বা শেপিং নেই; নিজে HTML ওভারলেতে আঁকুন (`renderTextTracksNatively: false`) |
| বাংলায় অর্থহীন চিহ্ন | `file -I bn.vtt` | ফাইল UTF-8 নয়; UTF-8-এ (BOM ছাড়া) সেভ করুন |
| টিভি কনটেন্টে ক্যাপশন আছে বলে জানি কিন্তু দেখায় না | `ffprobe`-এ `Closed Captions` আছে কিনা | ম্যানিফেস্টে `TYPE=CLOSED-CAPTIONS` আর ভেরিয়েন্টে `CLOSED-CAPTIONS="cc"` যোগ করুন |
| মেনুতে একটা খালি CC অপশন | ভেরিয়েন্টে `CLOSED-CAPTIONS` অ্যাট্রিবিউট আছে কিনা | এমবেডেড ক্যাপশন না থাকলে `CLOSED-CAPTIONS=NONE` |
| ফোর্সড সাবটাইটেল দেখায় না | ট্র্যাকের `forced` ফ্ল্যাগ | ম্যানিফেস্টে `FORCED=YES`, আর প্লেয়ার ফোর্সড ট্র্যাক স্বয়ংক্রিয়ভাবে চালু করে কিনা ডকস দেখুন |
| দর্শক হঠাৎ ধারাবিবরণী শুনছেন | অডিও ট্র্যাক তালিকায় অডিও বর্ণনার `AUTOSELECT` | অডিও বর্ণনা ট্র্যাকে `AUTOSELECT=NO`, আর `CHARACTERISTICS` দিয়ে চিহ্নিত করুন |
| স্ক্রিন রিডার শুধু "বাটন" বলে | DevTools-এর Accessibility প্যানেলে বাটনের নাম | `aria-label` দিন, বা `div` বাদ দিয়ে `button` |
| কিবোর্ডে প্লেয়ারে ঢোকা যায়, বের হওয়া যায় না | Tab চেপে দেখুন | ফোকাস আটকানো কোড (কাস্টম কিডাউন হ্যান্ডলার) বাদ দিন |

## মূল শিক্ষা

1. **সাবটাইটেল, ক্যাপশন, ফোর্সড, অডিও বর্ণনা চারটা আলাদা জিনিস**, আর `kind`, `Role` বা `CHARACTERISTICS` দিয়ে প্রতিটা ঠিকভাবে চিহ্নিত করা দরকার, নইলে যার দরকার তিনি খুঁজে পান না।
2. **WebVTT: প্রথম লাইন `WEBVTT`, UTF-8, মিলিসেকেন্ডের আগে ডট, কিউর ভেতরে খালি লাইন নয়।**
3. **`::cue` সীমিত**; ব্যবহারকারীর নিজের ক্যাপশন স্টাইল সম্মান করুন, আর বেশি নিয়ন্ত্রণ দরকার হলে নিজে HTML-এ আঁকুন।
4. **CEA-608/708 ভিডিওর ভেতরে থাকে**, ম্যানিফেস্টে ঘোষণা না করলে প্লেয়ার জানে না; আর বাংলার জন্য এগুলো কাজের নয়।
5. **ক্যাপশন সিঙ্ক ভাঙার প্রথম সন্দেহ `X-TIMESTAMP-MAP`**, বিশেষ করে রি-এনকোডের পর।
6. **বাংলা ক্যাপশনে তিনটা জিনিস লাগে: ফন্ট, শেপিং, UTF-8**। TV-তে না থাকলে নিজে HTML ওভারলেতে আঁকুন।
7. **অ্যাক্সেসিবিলিটি মানে শুধু ক্যাপশন নয়**: কিবোর্ড, নাম, দৃশ্যমান ফোকাস, ২৪ পিক্সেলের টাচ লক্ষ্য, শব্দসহ অটোপ্লে নয়। নেটিভ `button` আর `input` দিয়ে শুরু করলে অর্ধেক কাজ ফ্রি।
