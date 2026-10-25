---
title: 'ম্যানিফেস্ট থেকে প্লেব্যাক'
subtitle: 'hls.js, dash.js আর Shaka Player কীভাবে একটা ম্যানিফেস্টকে appendBuffer-এ পরিণত করে — লোডার, প্লেলিস্ট রিফ্রেশ, রেন্ডিশন বাছাই, ট্রান্সমাক্স, কোন কনফিগ আসলে গুরুত্বপূর্ণ, আর কখন Safari-র নেটিভ HLS ভালো।'
chapter: 4
level: 'intermediate'
readingTime: '২০ মিনিট'
topics: ['hls.js', 'dash.js', 'shaka-player', 'manifest', 'stream controller', 'native hls', 'player config']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

সিলেটের একটা বিয়েবাড়িতে বাবুর্চি রুশদ। তার হাতে একটা রেসিপির খাতা, যেটা বরপক্ষ পাঠিয়েছে। খাতায় শুধু রান্নার নিয়ম লেখা না, প্রতিটা উপকরণের পাশে লেখা কোন দোকান থেকে আনতে হবে: "চাল: কালিঘাটের আড়ত, প্রথম বস্তা থেকে", "মাংস: জিন্দাবাজারের কসাই, সকাল নয়টার পর"। আর একটা খাতায় তিন রকম মেনু আছে, অতিথি বেশি হলে সস্তাটা, কম হলে দামিটা। রুশদ নিজে বাজারে যায় না। তার সহকারী হাইসাম খাতা দেখে একটা একটা উপকরণ আনে, রুশদের হাতে দেয়, রুশদ চুলায় চাপায়।

হাইসাম বোকা না। সে দেখে কোন দোকান কত দ্রুত মাল দেয়: জিন্দাবাজারের কসাই আজ দেরি করছে দেখে সে পরের উপকরণ একটু কম দামি মেনুর দোকান থেকে আনে, যাতে চুলা খালি না থাকে। কোনো দোকান বন্ধ পেলে দুই-তিনবার ঘুরে আসে, তারপরও না পেলে রুশদকে খবর দেয়। কিছু উপকরণ আসে কাঁচা অবস্থায়, পুরনো দেশি বস্তায় বাঁধা, যেটা রুশদের চুলায় সরাসরি দেওয়া যায় না; হাইসাম সেগুলো খুলে রুশদের পছন্দের হাঁড়িতে ঢেলে দেয়। আর পাশের বাড়ির বাবুর্চি মরিয়মের কাজ আলাদা: তার মালিক তাকে একটা "সব-জান্তা" সহকারী দিয়েছে যে খাতা দেখে নিজেই সব আনে, সিদ্ধান্তও নিজে নেয়; মরিয়ম জানতেও পারে না কোনটা কোথা থেকে এল।

মিলিয়ে নিই: রেসিপির খাতা হলো **ম্যানিফেস্ট** (`.m3u8` বা `.mpd`), তিন রকম মেনু হলো **রেন্ডিশন বা level**, আর প্রতিটা উপকরণের দোকানের ঠিকানা হলো **সেগমেন্ট URL**। হাইসাম হলো প্লেয়ার লাইব্রেরির **লোডার আর stream controller**, যে ঠিক করে পরের সেগমেন্ট কোনটা আর কোন কোয়ালিটির; দোকানের গতি দেখে মেনু বদলানো হলো **ABR**, আর বন্ধ দোকানে কয়েকবার ঘোরা হলো **রিট্রাই পলিসি**। দেশি বস্তা খুলে হাঁড়িতে ঢালা হলো **ট্রান্সমাক্স** (MPEG-TS থেকে fMP4)। রুশদের চুলা হলো **SourceBuffer**। আর মরিয়মের সব-জান্তা সহকারী হলো **Safari-র নেটিভ HLS**: সব নিজে করে, কিন্তু ভেতরে কী হচ্ছে দেখার উপায় কম। বাস্তবে hls.js, dash.js আর Shaka ঠিক হাইসামের মতো কাজ করে, আর তাদের প্রতিটা কনফিগ হাইসামকে দেওয়া একেকটা নির্দেশ।

## একটা প্লেয়ার লাইব্রেরির ভেতরের অংশগুলো

তিনটা বড় লাইব্রেরির কোডবেস আলাদা, কিন্তু কাঠামো প্রায় একই। ম্যানিফেস্ট থেকে appendBuffer পর্যন্ত পথটা এরকম:

<Mermaid
title="ম্যানিফেস্ট থেকে SourceBuffer"
code={`graph TD
  ML["Manifest loader: master.m3u8 বা .mpd"] --> MP["Parser: level, track, segment তালিকা"]
  MP --> PL["Playlist loader: level প্লেলিস্ট (লাইভে বারবার রিফ্রেশ)"]
  PL --> SC["Stream controller: পরের সেগমেন্ট কোনটা?"]
  ABR["ABR controller: কোন level?"] --> SC
  BUF["Buffer state: সামনে কত সেকেন্ড আছে"] --> SC
  SC --> FL["Fragment loader: HTTP, রিট্রাই, টাইমআউট"]
  FL --> TX["Demux বা transmux (TS থেকে fMP4)"]
  TX --> BC["Buffer controller: append কিউ, back buffer মোছা"]
  BC --> SB["SourceBuffer"]
  FL -.->|"ডাউনলোডের গতি"| ABR`}
/>

1. **Manifest loader ও parser।** প্রথম রিকোয়েস্ট। HLS-এ মাস্টার প্লেলিস্ট থেকে রেন্ডিশনের তালিকা (`#EXT-X-STREAM-INF`, প্রতিটার `BANDWIDTH`, `RESOLUTION`, `CODECS`), DASH-এ MPD থেকে `AdaptationSet` আর `Representation`। ম্যানিফেস্টের ফরম্যাট আছে [স্ট্রিমিংয়ের জন্য packaging](/notes/video/06-packaging-for-streaming) চ্যাপ্টারে।
2. **Playlist loader।** HLS-এ প্রতিটা রেন্ডিশনের নিজের মিডিয়া প্লেলিস্ট আছে, যেটা আলাদা করে আনতে হয়। লাইভ স্ট্রিমে এটা নিয়মিত রিফ্রেশ হয়, মোটামুটি একটা সেগমেন্টের দৈর্ঘ্য পরপর। DASH-এ সাধারণত সব তথ্য এক MPD-তে থাকে, লাইভে সেটা রিফ্রেশ হয় `minimumUpdatePeriod` অনুযায়ী।
3. **Stream controller।** প্লেয়ারের হৃদয়। একটা টাইমার বা ইভেন্ট লুপে প্রতিবার জিজ্ঞেস করে: সামনে বাফার কি লক্ষ্যের চেয়ে কম? তাহলে বর্তমান অবস্থানের পরের সেগমেন্ট কোনটা, কোন level থেকে? তারপর লোড শুরু করে।
4. **ABR controller।** প্রতিটা সেগমেন্টের ডাউনলোডের গতি থেকে ব্যান্ডউইথের অনুমান বানায়, আর stream controller-কে বলে কোন level। অ্যালগরিদম নিয়ে পঞ্চম চ্যাপ্টার।
5. **Fragment loader।** আসল HTTP রিকোয়েস্ট, টাইমআউট, রিট্রাই, আর প্রতিটা রিকোয়েস্টের সময় মাপা।
6. **Demux বা transmux।** fMP4 সেগমেন্ট প্রায় সরাসরি যায়। কিন্তু অনেক পুরনো HLS স্ট্রিম MPEG-TS সেগমেন্টে, যেটা বেশিরভাগ ব্রাউজারের MSE নেয় না। hls.js তখন JavaScript-এ (প্রায়ই একটা Web Worker-এ) TS খুলে fMP4 বানিয়ে দেয়। এটাই **ট্রান্সমাক্স**: কোডেক না বদলে শুধু মোড়ক বদলানো ([Container আর transmuxing](/notes/video/03-containers-and-transmuxing))।
7. **Buffer controller।** তৃতীয় চ্যাপ্টারের append কিউ, `updateend` সামলানো, `QuotaExceededError`, আর back buffer মোছা।

## সবচেয়ে ছোট সঠিক সেটআপ

### hls.js

hls.js-এর ডকুমেন্টেশনের প্যাটার্ন: আগে hls.js সাপোর্ট আছে কিনা দেখো, না থাকলে নেটিভ HLS।

```javascript
import Hls from 'hls.js';

const video = document.querySelector('video');
const src = 'https://cdn.baytalhikma.org/lectures/42/master.m3u8';

if (Hls.isSupported()) {
	const hls = new Hls({ capLevelToPlayerSize: true });
	hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
		console.log('levels', data.levels.map((l) => `${l.height}p@${Math.round(l.bitrate / 1000)}k`));
	});
	hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => console.log('now level', data.level));
	hls.on(Hls.Events.ERROR, (_e, data) => handleHlsError(hls, data));
	hls.loadSource(src);
	hls.attachMedia(video);
} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
	video.src = src; // native HLS: Safari, iOS
} else {
	showMessage('এই ব্রাউজারে ভিডিওটা চালানো যাচ্ছে না।');
}
```

```text
levels ["240p@400k", "480p@1200k", "720p@2800k", "1080p@5000k"]
now level 1
now level 2
```

(উদাহরণ আউটপুট।) প্রথম সেগমেন্ট level 1 থেকে এসেছে, তারপর গতি ভালো দেখে level 2-তে উঠেছে।

### dash.js

```javascript
import * as dashjs from 'dashjs';

const player = dashjs.MediaPlayer().create();
player.updateSettings({
	streaming: {
		buffer: { bufferTimeDefault: 12, bufferTimeAtTopQuality: 30 }
	}
});
player.on(dashjs.MediaPlayer.events.ERROR, (e) => console.error('dash error', e.error));
player.initialize(video, 'https://cdn.baytalhikma.org/lectures/42/manifest.mpd', true);
```

dash.js-এর ৫ নম্বর ভার্সনে কিছু সেটিংয়ের নাম বদলেছে, যেমন `stableBufferTime` এখন `bufferTimeDefault`, আর ABR কৌশল এখন আলাদা আলাদা নিয়ম (`throughputRule`, `bolaRule`) চালু-বন্ধ করে ঠিক করা হয় (dash.js-এর ৪ থেকে ৫ মাইগ্রেশন গাইড অনুযায়ী, ২০২৬ সালের অক্টোবরে দেখা)। পুরনো ব্লগ পোস্টের কনফিগ কপি করার আগে আপনার ভার্সনের ডকস দেখে নিন।

### Shaka Player

```javascript
import shaka from 'shaka-player';

shaka.polyfill.installAll();
if (!shaka.Player.isBrowserSupported()) throw new Error('unsupported browser');

const player = new shaka.Player();
await player.attach(video);
player.configure({ streaming: { bufferingGoal: 30, bufferBehind: 30 } });
player.addEventListener('error', (e) => console.error('shaka', e.detail.code, e.detail));
await player.load('https://cdn.baytalhikma.org/lectures/42/manifest.mpd'); // .m3u8 works too
```

Shaka একই প্লেয়ারে DASH আর HLS দুটোই চালায়, আর এর এরর অবজেক্টে একটা সংখ্যাসূচক `code` থাকে যার মানে Shaka-র ডকুমেন্টেশনের এরর টেবিলে খুঁজে পাওয়া যায়। ডিবাগিংয়ে এটা খুব কাজে লাগে।

## যে কনফিগগুলো আসলে গুরুত্বপূর্ণ

প্রতিটা লাইব্রেরিতে শতাধিক অপশন আছে, কিন্তু প্রোডাকশনে বেশিরভাগ টিম পাঁচ-ছয়টাই বদলায়। নিচের ডিফল্টগুলো ২০২৬ সালের অক্টোবরে প্রতিটা লাইব্রেরির ডকস থেকে নেওয়া; ভার্সন ভেদে বদলায়, তাই নিজের ভার্সনে মিলিয়ে নিন (hls.js-এ `console.log(Hls.DefaultConfig)` সবচেয়ে নির্ভরযোগ্য উপায়)।

| প্রশ্ন | hls.js | Shaka | dash.js |
| --- | --- | --- | --- |
| সামনে কতটা বাফার রাখবে | `maxBufferLength` (ডকসে ডিফল্ট ৩০ সেকেন্ড), সর্বোচ্চ সীমা `maxMaxBufferLength` (৬০০) আর বাইটের সীমা `maxBufferSize` | `streaming.bufferingGoal` (ডকসে ডিফল্ট ১০) | `streaming.buffer.bufferTimeDefault`, `bufferTimeAtTopQuality` |
| পেছনে কতটা রাখবে | `backBufferLength` | `streaming.bufferBehind` (ডকসে ডিফল্ট ৩০) | `streaming.buffer.bufferToKeep` |
| কোন কোয়ালিটিতে শুরু | `startLevel` (`-1` মানে প্রথম সেগমেন্টের গতি দেখে স্বয়ংক্রিয়) | `abr.defaultBandwidthEstimate` | ABR-এর প্রাথমিক থ্রুপুট সেটিং |
| প্লেয়ারের সাইজের চেয়ে বড় রেজোলিউশন না নেওয়া | `capLevelToPlayerSize` (ডিফল্ট `false`) | `abr.restrictToElementSize` | `streaming.abr.limitBitrateByPortal` |
| প্রাথমিক ব্যান্ডউইথ অনুমান | `abrEwmaDefaultEstimate` (ডকসে ৫০০ kbps) | `abr.defaultBandwidthEstimate` (ডকসে ৫০০ kbps) | ABR থ্রুপুট সেটিং |
| লো-লেটেন্সি লাইভ | `lowLatencyMode` (ডিফল্ট `true`) | `streaming.lowLatencyMode` | `streaming.delay` ও লো-লেটেন্সি নিয়ম |

dash.js কলামের কিছু নাম (`limitBitrateByPortal`, `bufferToKeep`) পুরনো ৪.x ভার্সন থেকে পরিচিত; ৫.x-এ সেটিং কাঠামো কিছুটা বদলেছে, তাই ব্যবহারের আগে নিজের ভার্সনের সেটিং রেফারেন্সে নামটা মিলিয়ে নিন।

তিনটা সিদ্ধান্ত যা প্রায় সবসময় ঠিক:

- **`capLevelToPlayerSize` চালু করুন।** একটা ৩২০ পিক্সেল চওড়া প্লেয়ারে 1080p নামানো মানে ইউজারের ডেটা আর আপনার CDN-এর টাকা অকারণে খরচ। ডিফল্ট বন্ধ, তাই নিজে চালু করতে হয়।
- **শুরুর অনুমান বাস্তবের কাছাকাছি রাখুন।** ডিফল্ট ৫০০ kbps মানে প্রথম সেগমেন্ট প্রায়ই সবচেয়ে নিচের কোয়ালিটিতে। আপনার দর্শকরা বেশিরভাগ ভালো নেটওয়ার্কে থাকলে এটা বাড়ালে শুরু থেকেই ভালো ছবি আসে; উল্টোটা হলে কমান। ষষ্ঠ চ্যাপ্টারে স্টার্টআপ নিয়ে বিস্তারিত।
- **টিভি আর কম-মেমোরির ডিভাইসে বাফার ছোট রাখুন।** ডিফল্টগুলো ডেস্কটপের কথা ভেবে; স্মার্ট TV-তে `QuotaExceededError` খুব কমন।

## এরর সামলানো: fatal আর non-fatal

প্লেয়ার লাইব্রেরির এরর দুই ধরনের। **non-fatal**: লাইব্রেরি নিজে সামলাচ্ছে (একটা সেগমেন্ট টাইমআউট, রিট্রাই চলছে)। **fatal**: লাইব্রেরি হাল ছেড়ে দিয়েছে, এখন আপনাকে কিছু করতে হবে।

hls.js-এর ডকুমেন্টেশনের সুপারিশ করা প্যাটার্ন:

```javascript
let lastMediaRecovery = 0;

function handleHlsError(hls, data) {
	if (!data.fatal) return; // hls.js is already retrying
	switch (data.type) {
		case Hls.ErrorTypes.MEDIA_ERROR: {
			// Decode or buffer problem: rebuild the MediaSource, at most every 5 s
			const now = Date.now();
			if (now - lastMediaRecovery > 5000) {
				lastMediaRecovery = now;
				hls.recoverMediaError();
				return;
			}
			break;
		}
		case Hls.ErrorTypes.NETWORK_ERROR:
			// All retries exhausted. Restarting in a tight loop just hammers the CDN.
			console.error('network gave up', data.details, data.response?.code);
			break;
	}
	hls.destroy();
	showMessage('ভিডিওটা এখন চালানো যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।');
}
```

`data.details` সবচেয়ে কাজের ফিল্ড। এটা বলে ঠিক কী হয়েছে, যেমন `manifestLoadError`, `levelLoadTimeOut`, `fragLoadError`, `bufferAppendError`, `bufferStalledError`। `data.response?.code`-এ HTTP স্ট্যাটাস থাকে। প্রোডাকশনে এই দুইটা অ্যানালিটিক্সে পাঠান; এগারো নম্বর চ্যাপ্টারে দেখব কীভাবে।

hls.js-এর ডকস নেটওয়ার্ক এরর সাথে সাথে আবার চালু করতে নিষেধ করে, কারণ সব রিট্রাই শেষ হওয়ার পরেই fatal আসে, আর তখন তাৎক্ষণিক আবার চেষ্টা মানে লুপে লোড। রিট্রাইয়ের সংখ্যা ও সময় বদলাতে হলে `manifestLoadPolicy`, `playlistLoadPolicy` আর `fragLoadPolicy` কনফিগ বদলান।

<Callout type="tip">

**ইউজারকে টেকনিক্যাল এরর দেখাবেন না।** `fragLoadError` বা `Shaka error 1001` ইউজারের কাছে অর্থহীন। ইউজারকে সাধারণ ভাষায় বলুন কী হয়েছে আর কী করতে পারে, আর আসল কোডটা অ্যানালিটিক্সে পাঠান।

</Callout>

## Safari-র নেটিভ HLS: কখন সেটাই ভালো

Safari আর iOS-এ hls.js এখন `ManagedMediaSource` দিয়ে চলতে পারে, কিন্তু অনেক ক্ষেত্রে নেটিভ HLS এখনো ভালো পছন্দ:

| নেটিভ HLS ভালো যখন | hls.js বা Shaka ভালো যখন |
| --- | --- |
| AirPlay দরকার (নেটিভে কোনো বাড়তি কাজ নেই) | ABR নিজের মতো টিউন করতে চান |
| FairPlay DRM (নেটিভ পথ সবচেয়ে পরীক্ষিত) | প্রতিটা সেগমেন্টের টাইমিং আর এরর অ্যানালিটিক্সে চান |
| ব্যাটারি আর গরম হওয়া বড় চিন্তা | সব প্ল্যাটফর্মে একই আচরণ চান |
| Picture-in-Picture আর লক-স্ক্রিন কন্ট্রোল | কাস্টম অ্যাড বা লো-লেটেন্সি লজিক |

hls.js-এর ডকস অনুযায়ী (২০২৬ সালের অক্টোবরে দেখা), hls.js ডিফল্টে `ManagedMediaSource` তখনই ব্যবহার করে যখন সাধারণ `MediaSource` নেই, মানে iPhone-এ। macOS আর iPadOS-এ, যেখানে দুটোই আছে, `preferManagedMediaSource: true` দিলে hls.js থেকেই AirPlay সম্ভব। AirPlay-এর জন্য ভিডিওর ভেতরে একটা বিকল্প HLS `source` রাখতে হয়; AirPlay বাছলে Safari MediaSource বন্ধ করে দূরের ডিভাইসে নেটিভ HLS চালায়, আর hls.js নিজেকে আলাদা করে নেয়।

নেটিভ HLS-এর দাম হলো দৃশ্যমানতা। কোন level চলছে সেটা সরাসরি জানার API নেই; `video.videoHeight` বদলাতে দেখে অনুমান করতে হয়। এরর হলে শুধু `MediaError` কোড আর একটা অস্পষ্ট বার্তা। তাই নেটিভ HLS ব্যবহার করলে সার্ভারের দিকে (CDN লগে) বেশি নজর রাখতে হয়।

<Callout type="warning">

**Chrome-এও এখন নেটিভ HLS আছে।** Chrome ধাপে ধাপে নিজস্ব HLS প্লেব্যাক চালু করেছে (Mux-এর স্ট্যাটাস পেজ অনুযায়ী Chrome 141-এ কিছু ইউজারের জন্য, 142 থেকে ডিফল্ট; ২০২৬ সালের অক্টোবরে Chrome 155-এ `canPlayType('application/vnd.apple.mpegurl')` "maybe" ফেরত দেয়)। তাই "`canPlayType` হ্যাঁ বললে এটা Safari" ধরে নেওয়া এখন ভুল, আর উপরের ক্রমটা, আগে hls.js তারপর নেটিভ, আরও জরুরি: নইলে Chrome-এ আপনার সব কনফিগ, ABR টিউনিং আর অ্যানালিটিক্স চুপচাপ বাদ পড়ে যায়। chromestatus.com-এ বর্তমান অবস্থা মিলিয়ে নিন।

</Callout>

## DevTools-এ লাইব্রেরিকে কাজ করতে দেখা

hls.js-এ ডিবাগ লগ চালু করুন:

```javascript
const hls = new Hls({ debug: true });
```

কনসোলে প্রতিটা সিদ্ধান্ত দেখা যাবে (উদাহরণ, সংক্ষিপ্ত):

```text
[log] > [manifest-loader]: Loading master playlist https://cdn.baytalhikma.org/lectures/42/master.m3u8
[log] > [level-controller]: manifest loaded, 4 level(s) found, first bitrate: 1200000
[log] > [stream-controller]: Loading fragment 0 of [0-312] level 1, cc: 0
[log] > [buffer-controller]: Appending init segment
[log] > [abr-controller]: switch to level 2 (estimated bw 3.9 Mbps)
[log] > [stream-controller]: Loading fragment 1 of [0-312] level 2
```

Shaka-তে ডিবাগ বিল্ড (`shaka-player.compiled.debug.js`) আর `shaka.log.setLevel(shaka.log.Level.DEBUG)` একই কাজ করে। dash.js-এ `player.updateSettings({ debug: { logLevel: dashjs.Debug.LOG_LEVEL_DEBUG } })`। (প্রতিটার সঠিক নাম নিজের ভার্সনের ডকসে মিলিয়ে নিন।)

এর পাশে Network ট্যাব খোলা রাখুন। লগে যা লেখা আর নেটওয়ার্কে যা যাচ্ছে, দুটো মিলিয়ে পড়লে প্রায় যেকোনো প্লেব্যাক সমস্যার প্রথম সূত্র পাওয়া যায়।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | কীভাবে নিশ্চিত হবেন | সমাধান |
| --- | --- | --- |
| `manifestLoadError`, HTTP 0 | Network ট্যাবে ম্যানিফেস্ট রিকোয়েস্ট লাল, কনসোলে CORS এরর | CDN-এ `Access-Control-Allow-Origin` হেডার দিন ([CORS আর ক্যাশিং](/notes/cdn/12-edge-security)) |
| শুধু সবচেয়ে নিচের কোয়ালিটিই চলে | ডিবাগ লগে ব্যান্ডউইথ অনুমান দেখুন; `MANIFEST_PARSED`-এ সব level এসেছে কিনা | কিছু level-এর `CODECS` ব্রাউজার না পারলে বাদ পড়ে; প্রাথমিক অনুমান বাড়ান; `capLevelToPlayerSize` আর ছোট প্লেয়ার মিলে সীমা টানছে কিনা দেখুন |
| ছোট প্লেয়ারেও 1080p নামছে | Network ট্যাবে সেগমেন্টের পাথে রেজোলিউশন | `capLevelToPlayerSize: true` (hls.js), `restrictToElementSize` (Shaka) |
| `bufferAppendError` | `data.details` আর `chrome://media-internals` | সাধারণত কোডেক স্ট্রিং বা ভাঙা সেগমেন্ট; ওই সেগমেন্ট `ffprobe` দিয়ে দেখুন |
| `bufferStalledError` বারবার | Network ট্যাবে সেগমেন্টের সময় সেগমেন্টের দৈর্ঘ্যের চেয়ে বেশি | নেটওয়ার্ক ভিডিওর বিটরেট টানতে পারছে না; ladder-এ নিচের ধাপ আছে কিনা দেখুন; সমস্যা ABR-এর হলে পঞ্চম চ্যাপ্টার |
| ভিডিও চলে, কিন্তু কয়েক মিনিট পর `QuotaExceededError` | স্মার্ট TV বা পুরনো ফোনে | `maxBufferLength`/`bufferingGoal` আর back buffer ছোট করুন |
| Safari-তে চলে, hls.js দিয়ে চলে না | একই স্ট্রিম hls.js-এর ডেমো পেজে চালিয়ে দেখুন | প্রায়ই TS সেগমেন্টে অডিও কোডেক বা টাইমস্ট্যাম্পের সমস্যা যা নেটিভ প্লেয়ার মেনে নেয়; প্যাকেজার ঠিক করুন |
| পুরনো ব্লগের কনফিগ দিয়েছি, কিছু বদলায় না | লাইব্রেরি ভার্সন দেখুন, ডিফল্ট কনফিগ প্রিন্ট করুন | নাম বদলে গেছে (যেমন dash.js ৫-এ `stableBufferTime` থেকে `bufferTimeDefault`); বর্তমান ডকস দেখুন |

## মূল শিক্ষা

1. **সব প্লেয়ার লাইব্রেরির কাঠামো একই:** manifest loader, playlist loader, stream controller, ABR, fragment loader, transmux, buffer controller।
2. **stream controller হলো হৃদয়:** বাফার লক্ষ্যের নিচে নামলে পরের সেগমেন্ট আনে, ABR-এর বলা level থেকে।
3. **hls.js পুরনো TS সেগমেন্টকে fMP4-এ ট্রান্সমাক্স করে**, কারণ বেশিরভাগ ব্রাউজারের MSE TS নেয় না।
4. **পাঁচ-ছয়টা কনফিগ আসলে গুরুত্বপূর্ণ:** সামনের ও পেছনের বাফার, শুরুর level, প্লেয়ার-সাইজ ক্যাপ, প্রাথমিক ব্যান্ডউইথ অনুমান, লো-লেটেন্সি মোড। ডিফল্ট ভার্সন ভেদে বদলায়, নিজের ভার্সনে দেখে নিন।
5. **`capLevelToPlayerSize` প্রায় সবসময় চালু করা উচিত**, অথচ ডিফল্ট বন্ধ।
6. **fatal এরর মানে লাইব্রেরি হাল ছেড়েছে।** মিডিয়া এররে একবার রিকভারি চেষ্টা করুন, নেটওয়ার্ক এররে লুপে আবার চালু করবেন না, আর `details` ও HTTP কোড অ্যানালিটিক্সে পাঠান।
7. **Safari-তে নেটিভ HLS এখনো AirPlay, FairPlay আর ব্যাটারির জন্য প্রায়ই ভালো**, কিন্তু দৃশ্যমানতা কম।
8. **ডিবাগ লগ আর Network ট্যাব পাশাপাশি পড়ুন।** প্লেয়ার যা ভাবছে আর নেটওয়ার্কে যা যাচ্ছে, দুটো মিলিয়েই সমস্যা ধরা পড়ে।
