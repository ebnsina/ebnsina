---
title: 'video এলিমেন্টের ভেতরে'
subtitle: 'প্রতিটা অ্যাট্রিবিউট, readyState আর networkState-এর মান, ইভেন্টের পুরো ক্রম, play() প্রমিস আর অটোপ্লে পলিসি — যার উপর প্রতিটা ওয়েব প্লেয়ার দাঁড়িয়ে আছে।'
chapter: 2
level: 'beginner'
readingTime: '১৮ মিনিট'
topics: ['htmlmediaelement', 'video element', 'readystate', 'media events', 'autoplay', 'mediaerror']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

শিল্পকলা একাডেমির মঞ্চে আজ নাটক, আর পর্দার পেছনে স্টেজ ম্যানেজার কিন্দি একটা মোটা খাতা হাতে দাঁড়িয়ে। খাতায় প্রতিটা দৃশ্যের পাশে লেখা কখন কী হবে: "দর্শক বসেছে, আলো কমাও", "পর্দা উঠল", "নায়ক ঢুকেছে, স্পটলাইট", "শেষ সংলাপ, পর্দা নামাও"। কিন্দি নিজে অভিনয় করেন না, আলো জ্বালান না, মিউজিকও বাজান না। তিনি শুধু প্রতিটা মুহূর্তে ঘোষণা করেন এখন কী ঘটেছে, আর যার যার দায়িত্ব যে সে সেই ঘোষণা শুনে কাজ করে। লাইটম্যান রাজি শোনেন "পর্দা উঠল", আলো জ্বালান। সাউন্ডের দায়িত্বে মরিয়ম শোনেন "নায়ক ঢুকেছে", গান চালু করেন।

কিন্দির খাতায় আরেকটা কলাম আছে: মঞ্চ এখন কোন অবস্থায়। "কেউ আসেনি", "সেট সাজানো চলছে", "প্রথম দৃশ্যের জন্য তৈরি", "পুরো নাটকের জন্য তৈরি"। নায়ক যদি দেরি করে, কিন্দি ঘোষণা দেন "অপেক্ষা করছি", আর মিউজিক থামিয়ে রাখা হয়। আর একটা নিয়ম আছে যেটা হলের মালিক বিরুনি বানিয়েছেন: দর্শক নিজে কোনো সাড়া না দিলে, মানে হাততালি না দিলে, জোরে ঢাক বাজিয়ে নাটক শুরু করা যাবে না; চাইলে নিঃশব্দ মূকাভিনয় দিয়ে শুরু করা যায়। কারণ আগে কেউ কেউ হঠাৎ ঢাক বাজিয়ে দর্শককে চমকে দিত।

মিলিয়ে নিই: কিন্দির খাতা আর ঘোষণা হলো `video` এলিমেন্টের **ইভেন্ট** (`loadedmetadata`, `canplay`, `playing`, `ended`), "মঞ্চ এখন কোন অবস্থায়" কলামটা হলো **readyState**, আর সেট সাজানোর লোকজন আসছে কিনা সেটা **networkState**। রাজি আর মরিয়মের মতো ঘোষণা শুনে কাজ করা লোকেরা হলো আপনার **event listener**। নায়ক দেরি করলে "অপেক্ষা করছি" ঘোষণা হলো **waiting** ইভেন্ট। আর বিরুনির নিয়ম হলো ব্রাউজারের **অটোপ্লে পলিসি**: ইউজার কোনো ইন্টারঅ্যাকশন না করলে শব্দসহ ভিডিও শুরু হবে না, কিন্তু **muted** ভিডিও চলতে পারে। বাস্তবে প্রতিটা ওয়েব প্লেয়ার, hls.js থেকে Shaka পর্যন্ত, এই একই খাতা পড়ে কাজ করে।

## HTMLMediaElement: সব প্লেয়ারের ভিত্তি

ব্রাউজারে `video` আর `audio` দুটোই `HTMLMediaElement` থেকে আসে। আপনি hls.js ব্যবহার করুন বা Shaka, শেষ পর্যন্ত ভিডিও চলে এই এলিমেন্টেই। লাইব্রেরি শুধু এর `src`-এ (বা `srcObject`-এ) একটা MediaSource বসিয়ে দেয়। তাই এর আচরণ না জানলে কোনো প্লেয়ারই পুরোপুরি বোঝা যায় না।

```html
<video
	id="player"
	src="https://cdn.baytalhikma.org/lectures/42/720p.mp4"
	poster="https://cdn.baytalhikma.org/lectures/42/poster.jpg"
	preload="metadata"
	controls
	playsinline
	muted
	crossorigin="anonymous"
></video>
```

### অ্যাট্রিবিউটগুলো, একটা একটা করে

| অ্যাট্রিবিউট | কী করে | কখন ভুল হয় |
| --- | --- | --- |
| `src` | ভিডিওর URL, বা MSE-র ক্ষেত্রে `URL.createObjectURL(mediaSource)` | MSE ব্যবহার করলে নিজে `src` বসাবেন না, লাইব্রেরি বসায় |
| `poster` | প্রথম ফ্রেম আসার আগে দেখানো ছবি | না দিলে কালো বাক্স, আর ধীর নেটওয়ার্কে ইউজার ভাবে কিছু ভেঙেছে |
| `preload` | `none`, `metadata` বা `auto`; কতটা আগে থেকে নামাবে তার ইঙ্গিত | এটা শুধু ইঙ্গিত, ব্রাউজার মানতে বাধ্য না; মোবাইলে প্রায়ই উপেক্ষা হয় |
| `controls` | ব্রাউজারের নিজের কন্ট্রোল দেখায় | নিজের UI বানালে বাদ দিন, কিন্তু কিবোর্ড অ্যাক্সেসিবিলিটি নিজে দিতে হবে |
| `playsinline` | iPhone-এ পেজের ভেতরেই চালায়, ফুলস্ক্রিনে লাফ দেয় না | না দিলে iPhone-এ প্লে চাপলেই ফুলস্ক্রিন, যেটা প্রায়ই চাওয়া হয় না |
| `muted` | শব্দ বন্ধ অবস্থায় শুরু | অটোপ্লের জন্য প্রায় বাধ্যতামূলক (নিচে দেখুন) |
| `crossorigin` | অন্য ডোমেইনের ভিডিও CORS দিয়ে আনে | না দিলে ক্যানভাসে ফ্রেম আঁকা বা অন্য ডোমেইনের ক্যাপশন ট্র্যাক কাজ করে না |
| `loop`, `autoplay` | নামেই বোঝা যায় | `autoplay` পলিসির কারণে প্রায়ই চুপচাপ কাজ করে না |

<Callout type="tip">

**`muted` অ্যাট্রিবিউট আর `muted` প্রপার্টি এক জিনিস না।** HTML-এ `muted` লেখা থাকলে শুরুতে প্রপার্টিটা `true` হয়। পরে JavaScript-এ `video.muted = false` করলে শব্দ ফেরে, কিন্তু অ্যাট্রিবিউট থেকেই যায়। অটোপ্লে কাজ করছে না মনে হলে DevTools-এ `video.muted` প্রপার্টিটাই দেখুন।

</Callout>

## readyState: হাতে কতটা ডেটা আছে

`readyState` বলে ব্রাউজারের হাতে এখন কতটা মিডিয়া ডেটা আছে, তাই এখন কী করা সম্ভব। এর পাঁচটা মান:

| মান | নাম | মানে |
| --- | --- | --- |
| 0 | `HAVE_NOTHING` | কিছুই জানা নেই |
| 1 | `HAVE_METADATA` | দৈর্ঘ্য, রেজোলিউশন জানা; কিন্তু দেখানোর মতো ফ্রেম নেই |
| 2 | `HAVE_CURRENT_DATA` | এই মুহূর্তের ফ্রেম আছে, কিন্তু সামনে এগোনোর ডেটা নেই |
| 3 | `HAVE_FUTURE_DATA` | এখনকার ফ্রেম আর অন্তত সামনের একটু ডেটা আছে |
| 4 | `HAVE_ENOUGH_DATA` | ব্রাউজারের হিসাবে না থেমে শেষ পর্যন্ত চালানো যাবে |

খেয়াল রাখার বিষয়: **4 মানে ব্রাউজারের অনুমান, প্রতিশ্রুতি না।** নেটওয়ার্ক হঠাৎ খারাপ হলে 4 থেকে আবার 2-তে নামতে পারে, তখন `waiting` ইভেন্ট আসে। আর MSE-তে "শেষ পর্যন্ত চালানো যাবে" কথাটার মানে দাঁড়ায় "যতটা বাফারে আছে ততটা", কারণ বাকিটা কখন আসবে ব্রাউজার জানে না।

## networkState: নেটওয়ার্কের দিক কী করছে

| মান | নাম | মানে |
| --- | --- | --- |
| 0 | `NETWORK_EMPTY` | এখনো কোনো সোর্স নেই |
| 1 | `NETWORK_IDLE` | সোর্স আছে, কিন্তু এই মুহূর্তে কিছু নামাচ্ছে না |
| 2 | `NETWORK_LOADING` | ডেটা নামাচ্ছে |
| 3 | `NETWORK_NO_SOURCE` | কোনো ব্যবহারযোগ্য সোর্স পাওয়া যায়নি |

MSE-ভিত্তিক প্লেয়ারে networkState প্রায় অর্থহীন, কারণ নামানোর কাজটা ব্রাউজার না, আপনার JavaScript করছে। তখন নেটওয়ার্কের আসল অবস্থা জানতে হয় লাইব্রেরির ইভেন্ট থেকে।

## ইভেন্টের পুরো ক্রম

একটা ভিডিও লোড হয়ে চলা শুরু করা পর্যন্ত ইভেন্টগুলো মোটামুটি এই ক্রমে আসে:

<Mermaid
title="লোড থেকে প্লে পর্যন্ত ইভেন্ট"
code={`sequenceDiagram
  participant U as "ইউজার"
  participant V as "video এলিমেন্ট"
  V->>V: "loadstart (নামানো শুরু)"
  V->>V: "durationchange"
  V->>V: "loadedmetadata (readyState 1)"
  V->>V: "loadeddata (readyState 2, প্রথম ফ্রেম)"
  V->>V: "canplay (readyState 3)"
  V->>V: "canplaythrough (readyState 4)"
  U->>V: "প্লে চাপল"
  V->>V: "play (প্লে চাওয়া হয়েছে)"
  V->>V: "playing (আসলে চলছে)"
  V->>V: "timeupdate (চলতে চলতে বারবার)"
  V->>V: "waiting (ডেটা ফুরিয়েছে)"
  V->>V: "playing (আবার চলছে)"
  V->>V: "ended"`}
/>

প্রতিটার অর্থ:

| ইভেন্ট | কখন আসে | কী কাজে লাগে |
| --- | --- | --- |
| `loadstart` | নতুন সোর্স লোড শুরু | স্টার্টআপ টাইমার শুরু করুন |
| `loadedmetadata` | দৈর্ঘ্য আর মাপ জানা | `duration`, `videoWidth` পড়ুন, সিক বার আঁকুন |
| `loadeddata` | প্রথম ফ্রেম ডিকোড হয়েছে | পোস্টার সরিয়ে প্রথম ফ্রেম দেখানো যায় |
| `canplay` | চালানো যাবে, তবে হয়তো একটু পরে থামবে | স্পিনার সরান |
| `canplaythrough` | ব্রাউজারের অনুমানে না থেমে চলবে | খুব বেশি ভরসা করবেন না |
| `play` | `play()` ডাকা হয়েছে বা অটোপ্লে চেষ্টা | শুধু ইচ্ছা, এখনো চলছে না |
| `playing` | আসলে ফ্রেম এগোচ্ছে | **স্টার্টআপ টাইম এখানে শেষ**, স্পিনার লুকান |
| `waiting` | ডেটার অভাবে থেমেছে | রিবাফারিং শুরু, স্পিনার দেখান |
| `stalled` | কিছুক্ষণ ধরে নতুন ডেটা আসছে না | নেটওয়ার্ক সমস্যার আগাম সংকেত |
| `seeking` / `seeked` | ইউজার সিক শুরু ও শেষ করল | সিক লেটেন্সি মাপুন |
| `timeupdate` | চলার সময় নিয়মিত (মোটামুটি প্রতি ১৫ থেকে ২৫০ মিলিসেকেন্ডে, ব্রাউজার ভেদে) | সিক বার আপডেট; ফ্রেম-নিখুঁত কাজে ব্যবহার করবেন না |
| `pause` | থামানো হয়েছে | |
| `ratechange`, `volumechange` | গতি বা ভলিউম বদলেছে | UI সিঙ্ক রাখুন |
| `ended` | শেষ পর্যন্ত চলেছে | পরের ভিডিও, "আবার দেখুন" |
| `error` | কিছু ভেঙেছে | `video.error` পড়ুন |

<Callout type="warning">

**`play` আর `playing` গুলিয়ে ফেলা QoE মাপার সবচেয়ে কমন ভুল।** `play` আসে যখন প্লে চাওয়া হয়েছে; ভিডিও তখনো হয়তো ডেটার অপেক্ষায়। স্টার্টআপ টাইম মাপুন প্লে চাপা থেকে প্রথম `playing` পর্যন্ত, `play` পর্যন্ত না।

</Callout>

## একটা ইভেন্ট লগার

কোনো প্লেয়ারের আচরণ বুঝতে চাইলে প্রথম কাজ: সব ইভেন্ট সময়সহ লগ করা। এই স্নিপেট যেকোনো পেজের কনসোলে চালানো যায়:

```javascript
const v = document.querySelector('video');
const t0 = performance.now();
const events = [
	'loadstart', 'durationchange', 'loadedmetadata', 'loadeddata', 'canplay',
	'canplaythrough', 'play', 'playing', 'waiting', 'stalled', 'seeking',
	'seeked', 'pause', 'ended', 'error', 'emptied', 'abort', 'suspend', 'ratechange'
];
for (const name of events) {
	v.addEventListener(name, () => {
		const ms = (performance.now() - t0).toFixed(0).padStart(6);
		console.log(
			`${ms} ms  ${name.padEnd(15)} rs=${v.readyState} ns=${v.networkState} ` +
				`t=${v.currentTime.toFixed(2)} buf=${bufferedAhead(v).toFixed(1)}s`
		);
	});
}
function bufferedAhead(el) {
	for (let i = 0; i < el.buffered.length; i++) {
		if (el.buffered.start(i) <= el.currentTime && el.currentTime <= el.buffered.end(i)) {
			return el.buffered.end(i) - el.currentTime;
		}
	}
	return 0;
}
```

একটা ধীর নেটওয়ার্কে (DevTools-এ Network throttling "Slow 4G") চালালে আউটপুট মোটামুটি এরকম (উদাহরণ):

```text
     4 ms  loadstart       rs=0 ns=2 t=0.00 buf=0.0s
   412 ms  durationchange  rs=0 ns=2 t=0.00 buf=0.0s
   413 ms  loadedmetadata  rs=1 ns=2 t=0.00 buf=0.0s
   980 ms  loadeddata      rs=2 ns=2 t=0.00 buf=1.9s
   981 ms  canplay         rs=3 ns=2 t=0.00 buf=1.9s
  2104 ms  play            rs=3 ns=2 t=0.00 buf=4.1s
  2131 ms  playing         rs=3 ns=2 t=0.00 buf=4.1s
  9870 ms  waiting         rs=2 ns=2 t=7.71 buf=0.0s
 11240 ms  playing         rs=3 ns=2 t=7.71 buf=2.0s
```

এই লগ পড়লেই গল্প বোঝা যায়: মেটাডেটা ৪১৩ মিলিসেকেন্ডে, প্রথম ফ্রেম ৯৮০-তে, ইউজার প্লে চেপেছে ২১০৪-এ আর ২৭ মিলিসেকেন্ডের মধ্যে চলা শুরু। তারপর ৭.৭১ সেকেন্ডে বাফার শূন্য, দেড় সেকেন্ডের মতো রিবাফারিং। নেটওয়ার্ক ভিডিওর বিটরেট টানতে পারছে না।

## MediaError: কী ভেঙেছে

`error` ইভেন্ট এলে `video.error` একটা `MediaError` অবজেক্ট, যার `code` চারটার একটা:

| কোড | নাম | সাধারণ কারণ |
| --- | --- | --- |
| 1 | `MEDIA_ERR_ABORTED` | ইউজার বা কোড নামানো বাতিল করেছে |
| 2 | `MEDIA_ERR_NETWORK` | আগে পাওয়া যাচ্ছিল, এখন নেটওয়ার্ক ফেল |
| 3 | `MEDIA_ERR_DECODE` | ডেটা এসেছে কিন্তু ডিকোড করা যায়নি; ভাঙা সেগমেন্ট বা অসমর্থিত প্রোফাইল |
| 4 | `MEDIA_ERR_SRC_NOT_SUPPORTED` | সোর্সটাই ব্যবহারযোগ্য না; 404, ভুল MIME টাইপ, অসমর্থিত কন্টেইনার বা কোডেক |

কোডের পাশাপাশি `video.error.message` পড়ুন। এটা ব্রাউজার-নির্ভর একটা টেক্সট, কিন্তু প্রায়ই আসল কারণ বলে দেয়, যেমন কোন কোডেক অসমর্থিত। কোড 4 সবচেয়ে বিভ্রান্তিকর: শুনে মনে হয় ফরম্যাট সমস্যা, কিন্তু প্রায়ই আসলে একটা সাধারণ 404 বা CORS ব্লক।

## play() প্রমিস আর অটোপ্লে পলিসি

`video.play()` একটা Promise ফেরত দেয়। চালানো শুরু হলে resolve হয়, না পারলে reject। এটা ধরা বাধ্যতামূলক, কারণ না ধরলে কনসোলে "Uncaught (in promise)" এরর আসে আর আপনার UI ভুল অবস্থায় আটকে থাকে।

```javascript
async function tryPlay(v) {
	try {
		await v.play();
		return 'playing';
	} catch (err) {
		if (err.name === 'NotAllowedError') {
			// Autoplay blocked: retry muted, keep a visible unmute button
			v.muted = true;
			try {
				await v.play();
				return 'playing-muted';
			} catch {
				return 'needs-click';
			}
		}
		if (err.name === 'AbortError') return 'interrupted'; // a new load() or pause() came first
		throw err;
	}
}
```

### অটোপ্লে কখন চলে

MDN-এর অটোপ্লে গাইড (২০২৬ সালের সেপ্টেম্বরে সর্বশেষ আপডেট) অনুযায়ী সাধারণ নিয়ম হলো, ব্রাউজার অটোপ্লে করতে দেয় যদি এর অন্তত একটা সত্যি হয়:

- **শব্দ বন্ধ:** ভিডিও `muted`, বা ভলিউম শূন্য, বা ভিডিওতে কোনো অডিও ট্র্যাকই নেই।
- **ইউজার ইন্টারঅ্যাকশন হয়েছে:** ইউজার এই সাইটে ক্লিক, ট্যাপ বা কি চেপেছে।
- **সাইট অনুমোদিত:** ইউজার ব্রাউজারের সেটিংসে অনুমতি দিয়েছে, বা ব্রাউজার নিজে দেখেছে ইউজার এই সাইটে নিয়মিত মিডিয়া দেখে।
- **iframe-এর ক্ষেত্রে:** `allow="autoplay"` আর `Permissions-Policy: autoplay` দিয়ে অনুমতি দেওয়া।

এর বাইরে শব্দসহ অটোপ্লে প্রায় নিশ্চিতভাবে ব্লক হবে, আর ঠিক কোন শর্তে কোন ব্রাউজার ছাড় দেয় সেটা ব্রাউজার ভেদে আলাদা এবং সময়ের সাথে বদলায়। তাই নিয়ম একটাই: **অটোপ্লে কাজ করবে ধরে নেবেন না; প্রমিসের ফল দেখে UI বানান।** ব্রাউজারের বর্তমান নীতি MDN-এ মিলিয়ে নিন।

নতুন কিছু ব্রাউজারে আগে থেকেই জিজ্ঞেস করা যায়:

```javascript
if ('getAutoplayPolicy' in navigator) {
	const policy = navigator.getAutoplayPolicy('mediaelement'); // or pass the element itself
	// "allowed" | "allowed-muted" | "disallowed"
	if (policy === 'allowed-muted') video.muted = true;
}
```

এটা সব ব্রাউজারে নেই, তাই শুধু এর উপর ভরসা না করে উপরের `tryPlay` প্যাটার্নটাই রাখুন।

<Callout type="info">

**অটোপ্লে মানে ইউজারকে বিরক্ত করার ক্ষমতা না।** শব্দসহ হঠাৎ ভিডিও চালু হওয়া একটা ডার্ক প্যাটার্ন, আর ব্রাউজারের এই নিয়মগুলো সেটা ঠেকাতেই। muted অটোপ্লে করলে আনমিউট বাটনটা স্পষ্ট জায়গায় রাখুন।

</Callout>

## canPlayType: ব্রাউজার কী পারে

`canPlayType()` তিনটা মান ফেরত দেয়: `""` (পারবে না), `"maybe"`, বা `"probably"`। হ্যাঁ, এটা আসলেই এতটা অস্পষ্ট, কারণ কন্টেইনার দেখে কোডেক নিশ্চিত বলা যায় না।

```javascript
const v = document.createElement('video');
console.table({
	mp4: v.canPlayType('video/mp4'),
	'mp4 h264': v.canPlayType('video/mp4; codecs="avc1.64001f, mp4a.40.2"'),
	'mp4 av1': v.canPlayType('video/mp4; codecs="av01.0.08M.08"'),
	hls: v.canPlayType('application/vnd.apple.mpegurl'),
	mse: 'MediaSource' in window,
	mms: 'ManagedMediaSource' in window
});
```

একটা ডেস্কটপ Chromium ব্রাউজারে ফল হতে পারে এরকম (উদাহরণ; আপনার ব্রাউজারে চালিয়ে দেখুন):

```text
mp4        maybe
mp4 h264   probably
mp4 av1    probably
hls        (empty)
mse        true
mms        false
```

এখান থেকেই প্রথম চ্যাপ্টারের সিদ্ধান্তটা নেওয়া হয়: `hls` খালি আর `mse` true, তাই এখানে hls.js চালাতে হবে।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | কীভাবে নিশ্চিত হবেন | সমাধান |
| --- | --- | --- |
| `autoplay` দিয়েছি, কিন্তু চলে না | কনসোলে `NotAllowedError`, বা `video.paused` এখনো `true` | `muted` দিন, `play()` প্রমিস ধরে "প্লে করতে ক্লিক করুন" দেখান |
| iPhone-এ প্লে চাপলেই ফুলস্ক্রিন | iOS Safari-তে টেস্ট | `playsinline` অ্যাট্রিবিউট যোগ করুন |
| কনসোলে "Uncaught (in promise) DOMException: The play() request was interrupted" | `AbortError`; `play()` চলার মাঝে নতুন `load()`, `src` বদল বা `pause()` | প্রমিস ধরুন; একই সময়ে দুইবার সোর্স বদলাবেন না |
| স্পিনার কখনো যায় না, অথচ ভিডিও চলছে | ইভেন্ট লগারে দেখুন `playing` এসেছে কিন্তু UI শুনছে `canplaythrough` | `playing`-এ স্পিনার লুকান, `waiting`-এ দেখান |
| `MEDIA_ERR_SRC_NOT_SUPPORTED`, অথচ ফাইল আছে | Network ট্যাবে স্ট্যাটাস, `Content-Type` আর CORS হেডার দেখুন; `curl -I URL` | 404 ঠিক করুন, সঠিক MIME টাইপ দিন (`video/mp4`, `application/vnd.apple.mpegurl`), CORS হেডার দিন |
| পোস্টারের জায়গায় কালো বাক্স | `poster` URL সরাসরি খুলে দেখুন | পোস্টার দিন; `preload="metadata"` দিলে অনেক ব্রাউজার প্রথম ফ্রেম দেখায় |
| `duration` হলো `Infinity` বা `NaN` | `loadedmetadata`-র আগে পড়ছেন, অথবা এটা লাইভ স্ট্রিম | `loadedmetadata`-র পরে পড়ুন; লাইভে `seekable` রেঞ্জ ব্যবহার করুন |
| অন্য ডোমেইনের ক্যাপশন দেখায় না | কনসোলে CORS এরর | `crossorigin="anonymous"` আর সার্ভারে `Access-Control-Allow-Origin` |

## মূল শিক্ষা

1. **প্রতিটা ওয়েব প্লেয়ার শেষ পর্যন্ত `HTMLMediaElement`-এর উপর চলে।** লাইব্রেরি শুধু ডেটা জোগায়।
2. **readyState বলে হাতে কতটা ডেটা আছে**, আর 4 মানে ব্রাউজারের অনুমান, প্রতিশ্রুতি না।
3. **`play` মানে চাওয়া, `playing` মানে আসলে চলছে।** স্টার্টআপ টাইম মাপুন `playing` পর্যন্ত, স্পিনার নিয়ন্ত্রণ করুন `playing` আর `waiting` দিয়ে।
4. **`play()` একটা প্রমিস; সবসময় ধরুন।** `NotAllowedError` মানে অটোপ্লে ব্লক, `AbortError` মানে মাঝপথে বাধা।
5. **শব্দসহ অটোপ্লে কাজ করবে ধরে নেবেন না।** muted দিয়ে চেষ্টা করুন আর আনমিউট বাটন স্পষ্ট রাখুন। নিয়ম ব্রাউজার ভেদে বদলায়, MDN-এ মিলিয়ে নিন।
6. **`MEDIA_ERR_SRC_NOT_SUPPORTED` প্রায়ই একটা সাধারণ 404 বা CORS সমস্যা।** প্রথমে Network ট্যাব দেখুন।
7. **একটা ইভেন্ট লগার যেকোনো প্লেয়ার বোঝার সবচেয়ে সস্তা টুল।**
