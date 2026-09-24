---
title: 'Playback আর ABR'
subtitle: 'Player ভেতরে আসলে কী করে — manifest parse, buffer model, MSE ও EME; ABR-এর সিদ্ধান্ত (throughput-based, buffer-based, hybrid) আর naive bandwidth estimation কেন দুলতে থাকে; startup time, seeking, native বনাম JavaScript player, আর যে QoE metric গুলো player-কে ফেরত পাঠাতেই হবে।'
chapter: 7
level: 'advanced'
readingTime: '২৬ মিনিট'
topics:
  [
    'ABR',
    'buffer model',
    'MSE',
    'EME',
    'throughput estimation',
    'startup time',
    'seeking',
    'QoE metrics'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

এতক্ষণে আপনার হাতে সবকিছু আছে যা সার্ভার-সাইডে দরকার — একটা per-title ladder, aligned keyframe, CMAF segment, আর দুই ফরম্যাটের manifest। সেগুলো একটা CDN-এ বসে আছে। এখন প্রশ্নটা উল্টে যায়: **ওগুলো নিয়ে player কী করে?**

এই চ্যাপ্টার player-এর ভেতরের কাজ নিয়ে। আর এখানে একটা কথা শুরুতেই বলা দরকার — এতগুলো চ্যাপ্টারের সমস্ত কাজের ফলাফল শেষ পর্যন্ত একটা লুপের উপর নির্ভর করে, যেটা প্রতি কয়েক সেকেন্ডে একবার চলে আর একটাই প্রশ্নের উত্তর দেয়: **"পরের segment-টা কোন rendition থেকে নামাব?"** এই সিদ্ধান্তটা ভালো হলে দর্শক পরিষ্কার ছবি দেখে আর কখনো থামে না। খারাপ হলে সে হয় অকারণে ঝাপসা ছবি দেখে, নয় প্রতি আধ মিনিটে buffering-এ আটকে যায় — আর আপনার সমস্ত encoding পরিশ্রম অদৃশ্য হয়ে যায়।

## গল্পে বুঝি

বাগদাদের সুক আল-ওয়ারাকিন — কাগজের বাজার। বাজারের মাঝখানে একটা পাথরের চৌবাচ্চা, আর সেই চৌবাচ্চা ভরে রাখার দায়িত্ব **কিন্দি**, শহরের সবচেয়ে পুরনো ভিস্তিওয়ালা। তার কাজটা এক লাইনে বলা যায়: বাজারের কেউ যেন কখনো তেষ্টায় দাঁড়িয়ে থাকতে না হয়। চৌবাচ্চা থেকে সারাদিন ক্রেতা-বিক্রেতা পানি নেয়, একটা মোটামুটি স্থির হারে — আর কিন্দিকে সেই হারে পানি ভরে যেতে হয়।

পানি আসে কুয়ো থেকে, আর কুয়োর পথটা নির্ভরযোগ্য নয়। সকালে ভিড় কম, বালতি ভরতে অল্প সময় লাগে। দুপুরে কুয়োর সামনে লাইন, একই বালতি ভরতে তিন গুণ সময়। আর মাঝে মাঝে কেউ কুয়োর দড়ি ছিঁড়ে ফেলে, তখন বেশ কিছুক্ষণ কিছুই আসে না।

কিন্দির হাতে তিন মাপের বালতি: ছোট, মাঝারি, বড়। বড় বালতি এক ট্রিপে অনেক পানি আনে, কিন্তু ভরতে আর বইতে অনেক সময় নেয়। ছোট বালতি দ্রুত আসে-যায়, কিন্তু প্রতি ট্রিপে সামান্য পানি। প্রতিবার কুয়োয় যাওয়ার আগে তাকে একটাই সিদ্ধান্ত নিতে হয় — **এবার কোন বালতি নেব?**

তার প্রথম নিয়মটা ছিল সরল: গত ট্রিপে কত দ্রুত পানি এনেছি, সেটা দেখে ঠিক করব। গত ট্রিপ দ্রুত হয়েছিল, তাই এবার বড় বালতি। কিন্তু সেই বড় বালতি নিয়ে যেতেই কুয়োয় ভিড় লেগে গেল, ট্রিপটা ধীর হলো — তাই পরের বার সে ভয় পেয়ে ছোট বালতি নিল। ছোট বালতি তো এমনিতেই দ্রুত ফেরে, তাই মাপে দেখা গেল "পথ আবার ভালো", আর সে আবার বড় বালতি নিল। ফলাফল: সারাদিন সে বড় আর ছোটর মধ্যে দুলতে থাকল, কখনো স্থির হলো না। **তার নিজের সিদ্ধান্তই তার পরবর্তী মাপকে বিকৃত করছিল**, আর সে সেটা বুঝতে পারছিল না। বাজারের লোকেরা অভিযোগ করল — একবার প্রচুর পানি, একবার প্রায় শুকনো, কোনো স্থিরতা নেই।

তার দ্বিতীয় নিয়মটা এল অভিজ্ঞতা থেকে, আর সেটা অনেক ভালো কাজ করল: **কুয়োর দিকে না তাকিয়ে চৌবাচ্চার দিকে তাকাও।** চৌবাচ্চা প্রায় ভরা থাকলে সে বড় বালতি নেয় — কারণ ট্রিপটা ধীর হলেও চৌবাচ্চায় যথেষ্ট পানি আছে, লোকে টের পাবে না। চৌবাচ্চা অর্ধেক নেমে গেলে সে মাঝারি নেয়। আর তলানিতে ঠেকলে সে ছোট বালতি নিয়ে ছোটে, কারণ তখন পরিমাণ নয়, **গতিই** একমাত্র জিনিস যা গুরুত্বপূর্ণ। এই নিয়মে সে দিনে গড়ে কম দুলল, কারণ চৌবাচ্চার পানির স্তর ধীরে বদলায় — কুয়োর ভিড়ের মতো সেকেন্ডে সেকেন্ডে লাফায় না।

তবু একটা জায়গায় দ্বিতীয় নিয়মটা কাজ করল না: **দিনের একেবারে শুরুতে**। ভোরবেলা চৌবাচ্চা খালি, নিয়ম বলে ছোট বালতি নাও — কিন্তু তখনো তো সে জানে না আজ কুয়োর অবস্থা কেমন। তাই শুরুতে সে সবসময় মাঝারি বালতি নেয় আর কুয়োর দিকেই তাকায়, আর চৌবাচ্চায় কিছুটা পানি জমার পর ধীরে ধীরে চৌবাচ্চার নিয়মে সরে যায়। বছরের পর বছর পর সে একটা সংকরে থিতু হলো — **শুরুতে কুয়োর মাপ, তারপর চৌবাচ্চার স্তর**, আর দুটোর মধ্যে যেটা বেশি সতর্ক সেটাই মানা।

আর দুটো নিয়ম সে কখনো ভাঙে না। এক, বালতি বদলাতে হলে **ধাপে ধাপে বদলায়** — ছোট থেকে সরাসরি বড় নয়, মাঝারি হয়ে। কারণ এক লাফের ভুল খুব দামি। দুই, **নিচে নামা দ্রুত, উপরে ওঠা ধীর** — চৌবাচ্চা কমতে শুরু করলে সে সাথে সাথে ছোট বালতিতে নামে, কিন্তু চৌবাচ্চা ভরে উঠলে বড় বালতিতে যেতে সে বেশ কিছুক্ষণ অপেক্ষা করে। কারণ একবার চৌবাচ্চা শুকিয়ে গেলে বাজারের লোক যতটা রাগ করে, একটু কম পানি দেখলে ততটা করে না।

মিলিয়ে নিই: বাজারের লোকের পানি নেওয়া হলো **playback**, চৌবাচ্চা হলো **buffer**, চৌবাচ্চায় কত সেকেন্ডের পানি আছে সেটা হলো **buffer level**, কুয়োর পথ হলো **নেটওয়ার্ক**, এক ট্রিপ হলো একটা **segment download**, বালতির মাপ হলো **rendition**, "গত ট্রিপ কত দ্রুত হলো" হলো **throughput estimate**, বড়-ছোটর মধ্যে দোলা হলো **ABR oscillation** — যার কারণ ছিল নিজের সিদ্ধান্তই নিজের মাপকে দূষিত করা, চৌবাচ্চার স্তর দেখে সিদ্ধান্ত হলো **buffer-based ABR**, শুরুতে কুয়োর মাপ আর পরে চৌবাচ্চার স্তর হলো **hybrid ABR**, ভোরবেলার সমস্যা হলো **startup / cold start**, চৌবাচ্চা শুকিয়ে যাওয়া হলো **rebuffering**, আর "নিচে দ্রুত, উপরে ধীর" হলো ABR-এর সেই অসম নিয়ম যা প্রায় প্রতিটা ভালো ইমপ্লিমেন্টেশনে আছে।

## Player আসলে কী করে

একটা adaptive player বাইরে থেকে একটা `video` এলিমেন্ট, ভেতরে পাঁচটা আলাদা কাজ যা সমান্তরালে চলে:

<Mermaid
title="Inside an adaptive player"
code={`graph TD
  M["Manifest loader<br/>parse, refresh on live"] --> A["ABR controller<br/>which rendition next"]
  B["Buffer monitor<br/>how many seconds ahead"] --> A
  T["Throughput estimator<br/>recent download speed"] --> A
  A --> D["Segment loader<br/>HTTP GET, retry, abort"]
  D --> S["SourceBuffer via MSE<br/>appendBuffer"]
  S --> V["video element<br/>decode and render"]
  V --> B
  K["EME / CDM<br/>license and decryption"] -.-> S
  V --> Q["QoE reporter<br/>metrics back to the server"]`}
/>

ধাপে ধাপে:

1. **Manifest নামানো আর parse করা।** কী কী rendition আছে, প্রতিটার bandwidth/codec/resolution কত, segment-এর URL কীভাবে বানাতে হয়।
2. **Codec সমর্থন যাচাই।** প্রতিটা variant-এর `CODECS` স্ট্রিং নিয়ে player ব্রাউজারকে জিজ্ঞেস করে "এটা চালাতে পারবে?" — যেটা পারবে না, সেই variant তালিকা থেকেই বাদ।
3. **প্রথম rendition বাছা** — কোনো মাপ ছাড়াই, কারণ এখনো কিছু নামানো হয়নি।
4. **Init segment আর প্রথম media segment নামানো**, MSE-র মাধ্যমে `SourceBuffer`-এ append করা।
5. **তারপর অনন্ত লুপ:** buffer-এ কত সেকেন্ড আছে দেখো, দরকার হলে পরের segment-এর জন্য rendition বাছো, নামাও, append করো, মাপো, আবার শুরু।

### MSE: Media Source Extensions

ব্রাউজারে adaptive streaming সম্ভব হয়েছে **MSE**-র কারণে। সাধারণ `video src="movie.mp4"` দিলে ব্রাউজার নিজেই সব নিয়ন্ত্রণ করে — আপনি মাঝপথে ফাইল বদলাতে পারেন না। MSE সেই নিয়ন্ত্রণটা JavaScript-কে দেয়:

```javascript
const mediaSource = new MediaSource();
video.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener('sourceopen', async () => {
	// The codec string must match the media exactly, and it is the same
	// RFC 6381 string the manifest declared. A mismatch here fails loudly.
	const sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.4d401f"');

	// The init segment carries codec configuration and must be appended first.
	sourceBuffer.appendBuffer(await fetchBytes('720p/init.mp4'));
	await onUpdateEnd(sourceBuffer);

	// Media segments follow. Each one lands on the timeline at its own
	// timestamps, which is why aligned renditions can be mixed freely.
	sourceBuffer.appendBuffer(await fetchBytes('720p/seg-00001.m4s'));
});
```

মূল বিষয় দুটো:

- **`SourceBuffer`-এ ভিন্ন rendition-এর segment মেশানো যায়** — যতক্ষণ codec এক আর segment গুলো aligned। এটাই ABR-কে সম্ভব করে। 720p-র তিনটে segment-এর পরে 1080p-র একটা segment append করা সম্পূর্ণ বৈধ।
- **`SourceBuffer`-এর নিজস্ব মেমরি সীমা আছে।** অসীম buffer জমানো যায় না; ব্রাউজার `QuotaExceededError` দেয়, আর player-কে পুরনো অংশ `remove()` করে জায়গা বানাতে হয়।

### EME: Encrypted Media Extensions

DRM কনটেন্টে আরেকটা স্তর যোগ হয়। EME হলো সেই API যা player-কে ব্রাউজারের **CDM**-এর সাথে কথা বলতে দেয়:

```javascript
// The browser tells us which key it needs, from the pssh box in the segment.
video.addEventListener('encrypted', async (event) => {
	const session = mediaKeys.createSession('temporary');

	session.addEventListener('message', async (message) => {
		// The license request is an opaque blob. Our backend checks entitlement
		// and forwards it to the license server; we never see the key itself.
		const license = await postLicenseRequest(message.message, sessionToken);
		await session.update(license);
	});

	await session.generateRequest(event.initDataType, event.initData);
});
```

লক্ষ করার মতো ব্যাপার: এই কোডে **কোথাও key নেই, কোথাও ডিক্রিপশন নেই**। JavaScript শুধু একটা অস্বচ্ছ request ব্যাকএন্ডে পাঠায় আর একটা অস্বচ্ছ license ফেরত এনে CDM-কে দেয়। বাকি সবকিছু CDM-এর ভেতরে, secure path-এ। চ্যাপ্টার ৬-এর "চাবি আলাদা দপ্তরে" — এটাই তার কোড-রূপ।

## Buffer model

Player-এর সবচেয়ে গুরুত্বপূর্ণ অভ্যন্তরীণ সংখ্যা হলো **buffer level** — playhead-এর সামনে কত সেকেন্ডের ডিকোডযোগ্য মিডিয়া জমা আছে।

```text
buffer level = buffered.end(playing range) - currentTime
```

এই সংখ্যাটার তিনটে অঞ্চল আছে, আর প্রতিটায় player-এর আচরণ আলাদা হওয়া উচিত:

| অঞ্চল        | Buffer | Player-এর অবস্থা               | সঠিক আচরণ                                          |
| ------------ | ------ | ------------------------------ | -------------------------------------------------- |
| বিপদ         | 0–5s   | যেকোনো মুহূর্তে থেমে যেতে পারে | সবচেয়ে নিচু নিরাপদ rendition, কোনো ঝুঁকি নয়      |
| স্থিতিশীল    | 5–25s  | স্বাভাবিক                      | throughput-এর ভিত্তিতে সাবধানে সিদ্ধান্ত           |
| স্বাচ্ছন্দ্য | 25s+   | নিরাপদ                         | ঝুঁকি নেওয়া যায় — উঁচু rendition চেষ্টা করা যায় |

আর দুটো সীমা ঠিক করতে হয়:

- **Target buffer** (সাধারণত ৩০ সেকেন্ড) — এতটা জমা হলে player নামানো থামিয়ে দেয়। কারণ শুধু মেমরি নয়: বেশি buffer মানে বেশি ডেটা যা দর্শক হয়তো কখনো দেখবেই না (তিন মিনিট পর ভিডিও বন্ধ করে দিলে ওই ডেটার পুরোটাই অপচয়)।
- **Rebuffer threshold** — buffer শূন্য হলে player থেমে যায় (`waiting` ইভেন্ট), আর একটা নির্দিষ্ট পরিমাণ জমা না হওয়া পর্যন্ত আবার শুরু করে না। সাথে সাথে শুরু করলে সে সাথে সাথেই আবার থেমে যাবে — যাকে বলে rebuffer thrashing।

<Callout type="warning">

Buffer level পড়ার সময় `video.buffered` একটা `TimeRanges` — একাধিক অসংলগ্ন টুকরো থাকতে পারে। seek করার পর, বা একটা segment নামাতে ব্যর্থ হওয়ার পর, buffer-এ ফাঁক তৈরি হয়। **শুধু `buffered.end(0)` পড়লে ভুল সংখ্যা পাবেন** — playhead-এর অবস্থান যে range-এ পড়ে, সেই range-এর শেষটা খুঁজে বের করতে হবে। এটা player লেখার সবচেয়ে সাধারণ বাগগুলোর একটা: buffer আসলে খালি অথচ player ভাবছে ৩০ সেকেন্ড জমা আছে।

</Callout>

## ABR-এর সিদ্ধান্ত

এবার মূল লুপ। তিনটে পরিবার আছে।

### ১. Throughput-based

সবচেয়ে স্বজ্ঞাত: সাম্প্রতিক download গুলো কত দ্রুত হয়েছে মাপো, সেটাই ভবিষ্যতের bandwidth ধরে নাও, আর যে rendition-এর bitrate তার চেয়ে নিরাপদভাবে কম সেটা বাছো।

```text
throughput = segment size in bits / download time in seconds
pick highest rendition where rendition.bitrate <= throughput x safetyFactor
```

`safetyFactor` সাধারণত 0.7–0.9 — কারণ ঠিক throughput-এর সমান bitrate বাছলে buffer কখনোই বাড়বে না, আর সামান্য ওঠানামাতেই খালি হয়ে যাবে।

**এটা কেন দোলে**, সেটাই সবচেয়ে গুরুত্বপূর্ণ শিক্ষা, আর গল্পের কিন্দির প্রথম নিয়মটাই এখানে ফিরে আসে। চারটে আলাদা কারণ একসাথে কাজ করে:

**ক. মাপটা আপনার নিজের সিদ্ধান্তে দূষিত।** ছোট segment দ্রুত নামে — শুধু সে ছোট বলেই। TCP-র slow start-এর কারণে একটা ছোট ফাইল কখনো পুরো bandwidth ব্যবহারই করে না, আর connection-এর ওভারহেড তার মোট সময়ের বড় অংশ। তাই নিচু rendition থেকে মাপা throughput **প্রকৃত bandwidth-এর চেয়ে কম** দেখায়, আর player নিচেই আটকে থাকতে পারে। উল্টোদিকে উঁচু rendition-এর বড় segment TCP-কে পুরো গতিতে পৌঁছাতে দেয়, তাই সেখান থেকে মাপা throughput **বেশি** দেখায়। মানে যে সংখ্যাটা দিয়ে আপনি সিদ্ধান্ত নিচ্ছেন, সেটা আপনার আগের সিদ্ধান্তের উপরই নির্ভরশীল।

**খ. একক নমুনার ভয়ানক ভ্যারিয়ান্স।** একটা segment-এর download সময়ে CDN cache miss, DNS, TLS handshake, একটা প্রতিযোগী ডাউনলোড — সবকিছু ঢুকে পড়ে। একটা মাত্র মাপ ধরে সিদ্ধান্ত নেওয়া মানে শব্দকে সংকেত ভাবা।

**গ. প্রতিক্রিয়া আর ফলাফলের মধ্যে দেরি।** সিদ্ধান্ত নেওয়ার পরে সেটার ফল দেখা যায় এক segment পরে। মানে লুপটার ভেতরে একটা lag আছে — আর lag সহ feedback loop-এ gain বেশি হলে সে দুলবে, এটা নিয়ন্ত্রণ তত্ত্বের সাধারণ ফল।

**ঘ. মাঝখানে বসে যাওয়া rendition।** ল্যাডারে যদি 2.8 Mbps আর 3.2 Mbps দুটোই থাকে, আর প্রকৃত bandwidth 3.0-এর আশপাশে ওঠানামা করে, player অবিরাম দুটোর মধ্যে যাবে-আসবে — প্রতিবার দর্শক একটা সূক্ষ্ম quality পরিবর্তন দেখবে। এজন্যই চ্যাপ্টার ৫-এ rung গুলোর মধ্যে ন্যূনতম ফারাক রাখার নিয়ম।

প্রতিকার:

- **Throughput কে smooth করুন**, কাঁচা মাপ ব্যবহার করবেন না। EWMA (exponentially weighted moving average) সবচেয়ে প্রচলিত, আর **দুটো আলাদা EWMA রাখা** (একটা দ্রুত, একটা ধীর) এবং **দুটোর মধ্যে কমটা** নেওয়া একটা চমৎকার কৌশল: নেটওয়ার্ক পড়ে গেলে দ্রুতটা সাথে সাথে ধরে, নেটওয়ার্ক ভালো হলে ধীরটা তাড়াহুড়ো ঠেকায়।
- **Hysteresis** — উপরে ওঠার শর্ত নিচে নামার শর্তের চেয়ে কড়া রাখুন।
- **Switch-এর মধ্যে ন্যূনতম সময়** রাখুন, যাতে প্রতি segment-এ সিদ্ধান্ত না বদলায়।

<Callout type="warning">

গড় নয়, **হারমোনিক গড়** ব্যবহার করুন। থ্রুপুট হলো হার (bits per second), আর হারের সাধারণ গড় ভুল দিক থেকে পক্ষপাতী — একটা ব্যতিক্রমীভাবে দ্রুত download গোটা গড়কে উপরে টেনে নেয়, আর player এমন একটা bandwidth ধরে নেয় যা তার কখনোই ছিল না। হারমোনিক গড় ধীর নমুনাগুলোকে বেশি ওজন দেয়, যা এখানে ঠিক আচরণ: ভুল করলে সতর্ক দিকে ভুল করা ভালো।

</Callout>

### ২. Buffer-based

গল্পের কিন্দির দ্বিতীয় নিয়ম: throughput-এর দিকে তাকিয়ো না, **buffer level-এর দিকে তাকাও**। ২০১৪-১৫-এ Stanford-এর BBA আর পরে BOLA অ্যালগরিদম এই ধারণাটাকে প্রতিষ্ঠিত করে।

যুক্তিটা সূক্ষ্ম কিন্তু শক্তিশালী: **buffer level নিজেই থ্রুপুটের সবচেয়ে ভালো সারাংশ।** Buffer বাড়ছে মানে আপনি যা খরচ করছেন তার চেয়ে দ্রুত পাচ্ছেন — নেটওয়ার্ক ভালো। Buffer কমছে মানে ঠিক উল্টো। আর এই সংকেতটার দুটো বড় সুবিধা:

- **এটা ধীরে বদলায়**, তাই সিদ্ধান্তও স্থিতিশীল হয়।
- **এটা আপনার নিজের সিদ্ধান্তে দূষিত নয়** — buffer-এ কত সেকেন্ড আছে সেটা একটা বস্তুনিষ্ঠ সত্য, আপনি কোন বালতি নিয়েছেন তার উপর নির্ভর করে না।

ব্যবহারিক রূপটা একটা মানচিত্র: buffer level-এর প্রতিটা পরিসরের জন্য একটা সর্বোচ্চ অনুমোদিত rendition।

```text
buffer  0-8s   -> lowest rendition only
buffer  8-16s  -> up to rendition 2
buffer 16-24s  -> up to rendition 3
buffer 24-32s  -> up to rendition 4
buffer 32s+    -> any rendition
```

দুর্বলতা একটাই, কিন্তু সেটা গুরুতর: **শুরুতে buffer শূন্য**, তাই এই নিয়ম বলে সবচেয়ে নিচু rendition দিয়ে শুরু করো — এমনকি ফাইবার কানেকশনেও। দর্শক প্রথম ১৫-২০ সেকেন্ড অকারণে ঝাপসা ছবি দেখে, যা startup-এর সবচেয়ে খারাপ ছাপ।

### ৩. Hybrid — বাস্তবে যা ব্যবহার হয়

প্রতিটা গুরুত্বপূর্ণ player (dash.js, shaka, hls.js, ExoPlayer, AVPlayer) কোনো না কোনো রূপে সংকর:

- **Startup পর্যায়ে** — throughput-নির্ভর, কারণ buffer-এ তথ্য নেই। প্রথম segment-এর মাপই মূল সংকেত।
- **স্থিতিশীল অবস্থায়** — দুটোরই হিসাব করে **যেটা বেশি সতর্ক সেটা নাও**। throughput বলছে rendition 5 চলবে কিন্তু buffer মাত্র ৭ সেকেন্ড? তাহলে buffer-এর কথা শোনো।
- **Buffer বিপদসীমায়** — buffer-এর কথাই চূড়ান্ত, throughput যা-ই বলুক।
- **সবসময়** — hysteresis, ন্যূনতম switch ব্যবধান, আর ধাপে ধাপে উপরে ওঠা।

<Mermaid
title="The ABR decision loop"
code={`graph TD
  S["Segment finished downloading"] --> M["Measure: bytes and elapsed time"]
  M --> E["Update throughput EWMA<br/>fast and slow"]
  E --> B["Read buffer level<br/>from the range under playhead"]
  B --> C{"Buffer below panic level?"}
  C -->|"yes"| L["Force lowest safe rendition"]
  C -->|"no"| T["Candidate from throughput<br/>x safety factor"]
  T --> U["Candidate from buffer map"]
  U --> P["Take the more conservative of the two"]
  P --> H{"Switch allowed?<br/>hysteresis and cooldown"}
  H -->|"no"| K["Keep current rendition"]
  H -->|"yes"| N["Step toward the target,<br/>one rung at a time when going up"]
  L --> D["Download next segment"]
  K --> D
  N --> D
  D --> S`}
/>

## Startup time আর first-segment সমস্যা

**Startup time** — দর্শকের play চাপা থেকে প্রথম ফ্রেম দেখা পর্যন্ত সময় — সব QoE metric-এর মধ্যে দর্শক-ছেড়ে-যাওয়ার সাথে সবচেয়ে দৃঢ়ভাবে সম্পর্কিত। এখানে একটা কঠিন সমস্যা আছে: **প্রথম সিদ্ধান্তটা কোনো তথ্য ছাড়াই নিতে হয়।**

কী কী তথ্য আসলে হাতে আছে:

- **আগের সেশনের throughput**, যদি আপনি সেটা `localStorage`-এ রেখে থাকেন। এটাই সবচেয়ে কাজের সংকেত, আর অনেক player এটা ব্যবহার করে না।
- **`navigator.connection`** (Network Information API) — কিছু ব্রাউজারে `effectiveType` (`4g`, `3g`) আর `downlink` দেয়। মোটা দাগের, কিন্তু কিছুই না থাকার চেয়ে ভালো।
- **স্ক্রিনের আকার** — ৩৬০ পিক্সেল চওড়া ফোনে 1080p দিয়ে শুরু করার কোনো মানেই নেই, নেটওয়ার্ক যত ভালোই হোক।
- **manifest নামাতে কত সময় লাগল** — এটা একটা ছোট নমুনা, কিন্তু সম্পূর্ণ অকেজো নয়।

Startup দ্রুত করার কৌশলগুলো:

- **নিচু rendition দিয়ে শুরু, তারপর দ্রুত উপরে।** প্রথম দুটো segment কম মানে নামিয়ে ছবি দেখানো শুরু করুন, তারপর ২-৩ সেকেন্ডের মধ্যেই উপরে উঠুন। দর্শক প্রথম সেকেন্ডের ঝাপসা ছবি প্রায় মনেই রাখে না, কিন্তু ৪ সেকেন্ডের কালো স্ক্রিন মনে রাখে।
- **কম segment দিয়ে শুরু করুন।** playback শুরু করতে ৩০ সেকেন্ড buffer লাগে না; ২-৪ সেকেন্ডই যথেষ্ট। `MediaSource`-এ append হওয়ার সাথে সাথেই `play()` করুন।
- **সমান্তরালে নামান।** manifest, init segment আর প্রথম media segment ক্রমানুসারে নয়, যতটা সম্ভব একসাথে।
- **Manifest ছোট রাখুন।** তিনশো KB-র একটা DASH MPD ধীর কানেকশনে নিজেই এক সেকেন্ড খেয়ে ফেলে। SegmentTemplate ব্যবহার করুন, তালিকা নয়।
- **DRM-এ license request আগে শুরু করুন।** license আর প্রথম segment সমান্তরালে আনা যায়; ক্রমানুসারে করলে DRM কনটেন্টে startup সহজেই দ্বিগুণ হয়।
- **Preconnect।** `link rel="preconnect"` দিয়ে CDN-এর সাথে TCP+TLS আগেই খুলে রাখুন, প্লেয়ার লোড হওয়ার আগেই।

<Callout type="tip">

Startup time মাপার সময় **প্রথম দৃশ্যমান ফ্রেম** পর্যন্ত মাপুন, `canplay` ইভেন্ট পর্যন্ত নয়। এই দুটোর মধ্যে সহজেই কয়েকশো মিলিসেকেন্ডের পার্থক্য থাকে, আর দর্শক যেটা অনুভব করে সেটা দ্বিতীয়টা। `requestVideoFrameCallback` (যেখানে আছে) এই সংখ্যাটা সঠিকভাবে দেয়।

</Callout>

## Seeking

Seek হলো এমন একটা ঘটনা যেখানে player-এর সব হিসাব একসাথে ভেঙে পড়ে — buffer অকেজো, throughput estimate পুরনো, আর দর্শক এখনই ছবি দেখতে চায়।

কী ঘটে:

1. দর্শক টাইমলাইনে ক্লিক করে, ধরুন ৪৭:১২-তে।
2. Player manifest-এর segment duration যোগ করে বের করে কোন segment-এ ওই সময়টা পড়ে।
3. সে ওই segment থেকে নামায় — এবং **অবশ্যই segment-এর শুরু থেকে**, কারণ কেবল সেখানেই keyframe আছে।
4. পুরনো buffer-এর যে অংশ আর কাজে লাগবে না সেটা `remove()` করে।
5. নতুন segment append হওয়ার পর playback আবার শুরু হয়।

কয়েকটা সূক্ষ্মতা যেগুলো ভুল করলে seek বাজে লাগে:

- **Seek-এ সবসময় নিচু rendition বাছুন**, তারপর দ্রুত উঠুন। দর্শক seek-এর পরে অপেক্ষা করতে সবচেয়ে কম রাজি। এটা কার্যত একটা নতুন startup।
- **চলতি download বাতিল করুন।** seek-এর সময় যে segment নামছিল সেটা এখন অর্থহীন; `AbortController` দিয়ে থামান। না থামালে নতুন segment পুরনোটার সাথে bandwidth-এর জন্য লড়বে, আর seek দ্বিগুণ ধীর লাগবে।
- **বাতিল করা download-কে throughput-এর নমুনা হিসেবে গুনবেন না।** এটা একটা সাধারণ বাগ: অসম্পূর্ণ download থেকে হিসাব করা throughput অর্থহীন, আর সেটা estimator-কে বিষিয়ে দেয়।
- **Seek-এর পরে buffer-এ ফাঁক থাকে।** `buffered` এখন একাধিক range — উপরের সতর্কতাটা এখানেই সবচেয়ে বেশি কামড়ায়।
- **Backward seek সস্তা হতে পারে।** দর্শক যদি এমন জায়গায় ফিরে যায় যা এখনো buffer-এ আছে, কিছুই নামানোর দরকার নেই — কিন্তু player যদি নির্বিচারে buffer পরিষ্কার করে দেয়, সে সেই সুযোগটা নষ্ট করে।

<Callout type="info">

Scrub করার সময় (দর্শক টাইমলাইন ধরে টানছে) প্রতিটা মধ্যবর্তী অবস্থানে seek করা ভয়ানক অপচয় — দর্শক এক সেকেন্ডে বিশটা অবস্থান পার হয়ে যায়। সঠিক আচরণ: টানার সময় শুধু thumbnail প্রিভিউ দেখান (চ্যাপ্টার ৬-এর I-frame playlist বা একটা আলাদা sprite sheet থেকে), আর দর্শক ছেড়ে দিলে তখনই একবার সত্যিকারের seek করুন।

</Callout>

## Native বনাম JavaScript player

প্রতিটা প্ল্যাটফর্মে দুটো পথ, আর কিছু জায়গায় আপনার হাতে পছন্দ নেই।

| প্ল্যাটফর্ম         | Native পথ               | JavaScript পথ          | বাস্তবে কী বাধ্যতামূলক                                                 |
| ------------------- | ----------------------- | ---------------------- | ---------------------------------------------------------------------- |
| iOS Safari (iPhone) | নেটিভ HLS, `video src`  | MSE **নেই**            | নেটিভ HLS বাধ্যতামূলক; ABR-এ আপনার নিয়ন্ত্রণ প্রায় শূন্য             |
| iPadOS Safari       | নেটিভ HLS               | MSE আছে (সাম্প্রতিক)   | দুটোই সম্ভব                                                            |
| macOS Safari        | নেটিভ HLS               | MSE আছে                | দুটোই সম্ভব                                                            |
| Chrome/Firefox/Edge | কিছু ক্ষেত্রে নেটিভ নেই | MSE, hls.js বা dash.js | JS player-ই স্বাভাবিক পছন্দ                                            |
| Android ব্রাউজার    | নেটিভ HLS আংশিক         | MSE আছে                | JS player                                                              |
| Android অ্যাপ       | ExoPlayer/Media3        | —                      | ExoPlayer, আর সেখানে ABR সম্পূর্ণ কনফিগারযোগ্য                         |
| iOS অ্যাপ           | AVPlayer                | —                      | AVPlayer; ABR-এ শুধু কয়েকটা hint (`preferredPeakBitRate`) দেওয়া যায় |
| Smart TV / সেট-টপ   | প্ল্যাটফর্ম-ভেদে ভিন্ন  | প্রায়ই সীমিত MSE      | ডিভাইস-ভেদে পরীক্ষা করা ছাড়া উপায় নেই                                |

সবচেয়ে গুরুত্বপূর্ণ ব্যবহারিক সত্যটা হলো **iPhone**। iOS Safari-তে MSE নেই, তাই সেখানে hls.js চলে না — আপনাকে নেটিভ HLS-এ ফেরত যেতে হয়। এর মানে:

- ABR অ্যালগরিদম Apple-এর, আপনার নয়। আপনি শুধু কয়েকটা ইঙ্গিত দিতে পারেন।
- আপনার manifest-কে Apple-এর authoring নিয়ম কড়াভাবে মানতে হবে, কারণ ভুল হলে player নীরবে variant বাদ দেয়।
- আপনার metric-এর তালিকা ছোট হয়ে যায় — নেটিভ player যা রিপোর্ট করে, তার বাইরে কিছু জানা যায় না।

তাই বাস্তব সিস্টেমে প্রায় সবসময় **দুটো পথ** থাকে: MSE থাকলে JS player, না থাকলে নেটিভ HLS-এ fallback। আর তখন আপনাকে **দুই পথেই আলাদা করে টেস্ট করতে হয়** — একটাতে কাজ করা মানে অন্যটাতে কাজ করা নয়।

## যে QoE metric গুলো ফেরত পাঠাতেই হবে

Player-এর শেষ দায়িত্ব হলো নিজের অভিজ্ঞতার হিসাব ফেরত পাঠানো। এটা ছাড়া আপনি অন্ধ — encoding, packaging, CDN, সব সিদ্ধান্তের ফল এই সংখ্যাগুলোতেই দেখা যায়।

**অপরিহার্য পাঁচটা:**

| Metric                       | কী মাপে                            | কেন গুরুত্বপূর্ণ                                     |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------- |
| **Startup time**             | play চাপা থেকে প্রথম ফ্রেম         | দর্শক-ছেড়ে-যাওয়ার সাথে সবচেয়ে দৃঢ় সম্পর্ক        |
| **Rebuffer ratio**           | মোট থেমে থাকা সময় / মোট দেখা সময় | দর্শক-সন্তুষ্টির একক সবচেয়ে বড় নির্ধারক            |
| **Rebuffer count**           | কতবার থেমেছে                       | দশটা ১-সেকেন্ডের থামা একটা ১০-সেকেন্ডের চেয়ে খারাপ  |
| **গড় bitrate (সময়-ভারিত)** | দেখার সময় ধরে ওজন করা গড়         | quality-র প্রক্সি; startup-এর ঝাপসা অংশ ঢেকে দেয় না |
| **Playback failure rate**    | কত শতাংশ সেশনে ছবিই আসেনি          | সবচেয়ে গুরুতর, অথচ সবচেয়ে কম মনিটর করা             |

**খুব কাজের আরও কয়েকটা:**

- **Switch count আর switch magnitude** — বেশি হলে ABR দুলছে, আর দর্শক সেটা টের পায়।
- **সময়-ভারিত quality distribution** — মোট দেখার সময়ের কত শতাংশ কোন rendition-এ কাটল। "গড় bitrate 2.4 Mbps" লুকিয়ে রাখে যে ২০% সময় সবচেয়ে নিচু rung-এ কেটেছে।
- **Segment download error rate আর retry** — CDN সমস্যার প্রথম লক্ষণ, দর্শক অভিযোগ করার অনেক আগে।
- **DRM license সময় আর ব্যর্থতা** — DRM কনটেন্টে startup-এর সবচেয়ে বড় গোপন খরচ।
- **Seek latency** — seek থেকে আবার ছবি আসা পর্যন্ত।
- **Exit-before-video-start** — কতজন প্রথম ফ্রেম দেখার আগেই চলে গেল। এই সংখ্যাটা startup time-এর প্রকৃত ব্যবসায়িক অনুবাদ।

<Callout type="warning">

Metric অবশ্যই **সেশনের শেষে বা পেজ ছাড়ার সময়ও** পাঠাতে হবে, শুধু নিয়মিত বিরতিতে নয় — নইলে ঠিক সেই সেশনগুলোর ডেটা হারাবেন যেগুলো খারাপ অভিজ্ঞতার কারণে দ্রুত বন্ধ হয়ে গেছে। ফলে আপনার ড্যাশবোর্ডে শুধু সফল সেশনই থাকবে, আর সব সংখ্যা বাস্তবের চেয়ে ভালো দেখাবে। এটা চ্যাপ্টার ৫-এর "নিচু rung বাদ দেবেন না" যুক্তিরই আরেকটা রূপ: আপনার ডেটা আপনাকে শুধু বেঁচে যাওয়াদের কথা বলে।

</Callout>

## একটা ABR controller

নিচের ইমপ্লিমেন্টেশনে সবকিছু একসাথে: দুই-গতির হারমোনিক EWMA থ্রুপুট estimator, buffer level থেকে সরাসরি সীমা, দুই প্রার্থীর মধ্যে সতর্কতরটা বাছা, hysteresis আর cooldown, ধাপে ধাপে উপরে ওঠা, বাতিল হওয়া download উপেক্ষা করা, startup-এর আলাদা আচরণ, আর QoE হিসাব।

<CodeTabs tsFile="abr.ts" goFile="abr.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface Rendition {
	id: string;
	width: number;
	height: number;
	/** Peak bitrate, bits per second. This is what we budget against. */
	bitrate: number;
}

export interface DownloadSample {
	renditionId: string;
	bytes: number;
	durationSeconds: number; // wall-clock time the download took
	mediaSeconds: number; // playback time the segment covers
	/** Aborted downloads must never feed the estimator: the ratio is meaningless. */
	aborted: boolean;
}

export interface PlayerState {
	/** Seconds of media buffered ahead of the playhead, in the current range. */
	bufferLevel: number;
	/** Viewport size in CSS pixels, times devicePixelRatio. */
	viewportWidth: number;
	viewportHeight: number;
	/** True until the first frame has been rendered. */
	starting: boolean;
	/** Monotonic clock, milliseconds. */
	now: number;
}

export interface AbrConfig {
	/** Fraction of estimated throughput we are willing to commit to. */
	safetyFactor: number;
	/** Below this buffer, only the lowest rendition is allowed. */
	panicBufferSeconds: number;
	/** Buffer at which any rendition becomes permissible. */
	comfortBufferSeconds: number;
	/** Extra headroom required to move up, as a multiplier. Hysteresis. */
	upSwitchMargin: number;
	/** Minimum time between switches, milliseconds. */
	switchCooldownMs: number;
	/** Half-life of the fast and slow throughput estimators, in samples. */
	fastHalfLife: number;
	slowHalfLife: number;
	/** Never pick a rendition taller than this multiple of the viewport. */
	maxUpscaleFactor: number;
	/** Rendition index to start on before any measurement exists. */
	startupIndexFraction: number;
}

export const DEFAULT_ABR_CONFIG: AbrConfig = {
	safetyFactor: 0.8,
	panicBufferSeconds: 6,
	comfortBufferSeconds: 30,
	upSwitchMargin: 1.25,
	switchCooldownMs: 4_000,
	fastHalfLife: 3,
	slowHalfLife: 12,
	maxUpscaleFactor: 1.3,
	startupIndexFraction: 0.4
};

// ---------------------------------------------------------------------------
// Throughput estimation
// ---------------------------------------------------------------------------

/**
 * Two-speed harmonic EWMA over download throughput.
 *
 * Harmonic, not arithmetic: throughput is a rate, and an arithmetic mean of
 * rates is biased upward by a single unusually fast download -- exactly the
 * error that makes a player commit to bandwidth it never had.
 *
 * Two speeds, and always take the lower: the fast estimator reacts the instant
 * the network degrades, while the slow one stops the player from sprinting
 * upward on one lucky segment. Reacting fast downward and slow upward is not
 * symmetry -- it is the asymmetry of the cost, since a rebuffer hurts far more
 * than a few seconds at a lower rendition.
 */
export class ThroughputEstimator {
	private fastInverse = 0;
	private slowInverse = 0;
	private fastWeight = 0;
	private slowWeight = 0;
	private samples = 0;

	constructor(
		private fastHalfLife: number,
		private slowHalfLife: number
	) {}

	get sampleCount(): number {
		return this.samples;
	}

	addSample(sample: DownloadSample): void {
		// An aborted download tells us nothing: we do not know how much of the
		// elapsed time was spent transferring the bytes we actually received.
		if (sample.aborted) return;
		if (sample.durationSeconds <= 0 || sample.bytes <= 0) return;

		const bitsPerSecond = (sample.bytes * 8) / sample.durationSeconds;
		const inverse = 1 / bitsPerSecond;

		// Weight each sample by the media time it covers, so a 4s segment counts
		// more than a 1s one. Without this, a burst of tiny requests can swamp
		// the estimate.
		const weight = Math.max(sample.mediaSeconds, 0.1);

		const fastAlpha = Math.pow(0.5, 1 / this.fastHalfLife);
		const slowAlpha = Math.pow(0.5, 1 / this.slowHalfLife);

		this.fastInverse = this.fastInverse * fastAlpha + inverse * weight;
		this.fastWeight = this.fastWeight * fastAlpha + weight;

		this.slowInverse = this.slowInverse * slowAlpha + inverse * weight;
		this.slowWeight = this.slowWeight * slowAlpha + weight;

		this.samples++;
	}

	/** Estimated sustainable throughput in bits per second, or null if unknown. */
	estimate(): number | null {
		if (this.samples === 0 || this.fastWeight === 0 || this.slowWeight === 0) return null;

		const fast = this.fastWeight / this.fastInverse;
		const slow = this.slowWeight / this.slowInverse;

		return Math.min(fast, slow);
	}

	reset(): void {
		this.fastInverse = this.slowInverse = 0;
		this.fastWeight = this.slowWeight = 0;
		this.samples = 0;
	}
}

// ---------------------------------------------------------------------------
// QoE accounting
// ---------------------------------------------------------------------------

export interface QoeReport {
	startupTimeMs: number | null;
	rebufferCount: number;
	rebufferSeconds: number;
	rebufferRatio: number;
	watchedSeconds: number;
	averageBitrate: number;
	switchCount: number;
	downloadErrors: number;
	/** Fraction of watched time spent on each rendition. */
	qualityDistribution: Record<string, number>;
}

export class QoeTracker {
	private startedAt: number | null = null;
	private startupTimeMs: number | null = null;
	private rebufferCount = 0;
	private rebufferSeconds = 0;
	private rebufferStartedAt: number | null = null;
	private watchedSeconds = 0;
	private bitrateSeconds = 0;
	private switchCount = 0;
	private downloadErrors = 0;
	private perRendition = new Map<string, number>();

	markPlayRequested(now: number): void {
		this.startedAt = now;
	}

	markFirstFrame(now: number): void {
		// Measure to the first *rendered* frame, not to canplay. The gap between
		// them is easily a few hundred milliseconds, and the viewer feels the
		// second one.
		if (this.startedAt !== null && this.startupTimeMs === null) {
			this.startupTimeMs = now - this.startedAt;
		}
	}

	markStall(now: number): void {
		if (this.rebufferStartedAt !== null) return; // already stalled
		this.rebufferStartedAt = now;
		this.rebufferCount++;
	}

	markResume(now: number): void {
		if (this.rebufferStartedAt === null) return;
		this.rebufferSeconds += (now - this.rebufferStartedAt) / 1000;
		this.rebufferStartedAt = null;
	}

	markPlayed(seconds: number, rendition: Rendition): void {
		this.watchedSeconds += seconds;
		this.bitrateSeconds += rendition.bitrate * seconds;
		this.perRendition.set(rendition.id, (this.perRendition.get(rendition.id) ?? 0) + seconds);
	}

	markSwitch(): void {
		this.switchCount++;
	}

	markDownloadError(): void {
		this.downloadErrors++;
	}

	report(): QoeReport {
		const distribution: Record<string, number> = {};
		for (const [id, seconds] of this.perRendition) {
			distribution[id] = this.watchedSeconds > 0 ? seconds / this.watchedSeconds : 0;
		}

		const total = this.watchedSeconds + this.rebufferSeconds;

		return {
			startupTimeMs: this.startupTimeMs,
			rebufferCount: this.rebufferCount,
			rebufferSeconds: this.rebufferSeconds,
			rebufferRatio: total > 0 ? this.rebufferSeconds / total : 0,
			watchedSeconds: this.watchedSeconds,
			averageBitrate: this.watchedSeconds > 0 ? this.bitrateSeconds / this.watchedSeconds : 0,
			switchCount: this.switchCount,
			downloadErrors: this.downloadErrors,
			qualityDistribution: distribution
		};
	}
}

// ---------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------

export interface Decision {
	rendition: Rendition;
	reason: string;
	switched: boolean;
}

export class AbrController {
	private readonly ladder: Rendition[];
	private readonly estimator: ThroughputEstimator;
	private currentIndex: number;
	private lastSwitchAt = -Infinity;

	constructor(
		ladder: Rendition[],
		private config: AbrConfig = DEFAULT_ABR_CONFIG,
		/** Throughput remembered from a previous session, if any. */
		priorThroughput?: number
	) {
		if (ladder.length === 0) throw new Error('abr: ladder must not be empty');

		// Ascending by bitrate: index 0 is the safest rendition.
		this.ladder = [...ladder].sort((a, b) => a.bitrate - b.bitrate);
		this.estimator = new ThroughputEstimator(config.fastHalfLife, config.slowHalfLife);

		this.currentIndex = priorThroughput
			? this.highestAffordable(priorThroughput * config.safetyFactor)
			: Math.min(
					this.ladder.length - 1,
					Math.floor(this.ladder.length * config.startupIndexFraction)
				);
	}

	get current(): Rendition {
		return this.ladder[this.currentIndex];
	}

	onDownload(sample: DownloadSample): void {
		this.estimator.addSample(sample);
	}

	/** Highest index whose bitrate fits inside the given budget. */
	private highestAffordable(budget: number): number {
		let index = 0;
		for (let i = 0; i < this.ladder.length; i++) {
			if (this.ladder[i].bitrate <= budget) index = i;
		}
		return index;
	}

	/**
	 * Highest index the buffer alone permits.
	 *
	 * The buffer is the better signal precisely because it is not contaminated
	 * by our own choice: how many seconds are queued is an objective fact,
	 * whereas measured throughput depends on which rendition we picked last.
	 */
	private bufferCeiling(bufferLevel: number): number {
		const { panicBufferSeconds, comfortBufferSeconds } = this.config;

		if (bufferLevel <= panicBufferSeconds) return 0;
		if (bufferLevel >= comfortBufferSeconds) return this.ladder.length - 1;

		const span = comfortBufferSeconds - panicBufferSeconds;
		const progress = (bufferLevel - panicBufferSeconds) / span;
		return Math.floor(progress * (this.ladder.length - 1));
	}

	/** Do not fetch pixels the display cannot show. */
	private viewportCeiling(state: PlayerState): number {
		const limit = state.viewportHeight * this.config.maxUpscaleFactor;
		let index = 0;
		for (let i = 0; i < this.ladder.length; i++) {
			if (this.ladder[i].height <= limit) index = i;
		}
		return index;
	}

	decide(state: PlayerState): Decision {
		const throughput = this.estimator.estimate();
		const previousIndex = this.currentIndex;

		// --- Panic: the buffer decides, nothing else matters ------------------
		if (!state.starting && state.bufferLevel <= this.config.panicBufferSeconds) {
			this.currentIndex = 0;
			const switched = previousIndex !== 0;
			if (switched) this.lastSwitchAt = state.now;
			return {
				rendition: this.current,
				reason: `buffer ${state.bufferLevel.toFixed(1)}s below panic level`,
				switched
			};
		}

		// --- No measurement yet: hold the startup choice ----------------------
		if (throughput === null) {
			return { rendition: this.current, reason: 'no throughput samples yet', switched: false };
		}

		// --- Two candidates, take the more conservative -----------------------
		const budget = throughput * this.config.safetyFactor;
		const throughputCeiling = this.highestAffordable(budget);
		const bufferCeiling = state.starting
			? this.ladder.length - 1 // during startup the buffer is empty by definition
			: this.bufferCeiling(state.bufferLevel);
		const viewportCeiling = this.viewportCeiling(state);

		let target = Math.min(throughputCeiling, bufferCeiling, viewportCeiling);

		// --- Hysteresis and cooldown, but only when moving up -----------------
		if (target > this.currentIndex) {
			const cooling = state.now - this.lastSwitchAt < this.config.switchCooldownMs;
			const nextBitrate = this.ladder[this.currentIndex + 1].bitrate;
			const hasHeadroom = budget >= nextBitrate * this.config.upSwitchMargin;

			if (cooling || !hasHeadroom) {
				return {
					rendition: this.current,
					reason: cooling ? 'up-switch on cooldown' : 'insufficient headroom to move up',
					switched: false
				};
			}

			// Step one rung at a time. A single jump from the bottom to the top
			// commits to a bitrate we have no evidence the network can sustain.
			target = this.currentIndex + 1;
		}

		const switched = target !== this.currentIndex;
		if (switched) {
			this.currentIndex = target;
			this.lastSwitchAt = state.now;
		}

		return {
			rendition: this.current,
			reason:
				`throughput ${(throughput / 1e6).toFixed(2)} Mbps, ` +
				`buffer ${state.bufferLevel.toFixed(1)}s, ` +
				`ceilings t=${throughputCeiling} b=${bufferCeiling} v=${viewportCeiling}`,
			switched
		};
	}

	/** A seek invalidates the buffer; the estimator survives, the state does not. */
	onSeek(): void {
		this.currentIndex = Math.min(this.currentIndex, Math.max(0, this.currentIndex - 1));
		this.lastSwitchAt = -Infinity;
	}
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

const ladder: Rendition[] = [
	{ id: '360p', width: 640, height: 360, bitrate: 628_000 },
	{ id: '540p', width: 960, height: 540, bitrate: 1_888_000 },
	{ id: '720p', width: 1280, height: 720, bitrate: 3_428_000 },
	{ id: '1080p', width: 1920, height: 1080, bitrate: 5_628_000 }
];

const controller = new AbrController(ladder, DEFAULT_ABR_CONFIG, 4_000_000);
const qoe = new QoeTracker();

qoe.markPlayRequested(0);
qoe.markFirstFrame(820);

// Simulate a network that starts strong and then collapses on a train.
const network = [9_000_000, 8_400_000, 8_800_000, 1_100_000, 900_000, 1_000_000];
let buffer = 4;
let clock = 1_000;

for (const [index, bandwidth] of network.entries()) {
	const rendition = controller.current;
	const mediaSeconds = 4;
	const bytes = (rendition.bitrate * mediaSeconds) / 8;
	const downloadSeconds = (bytes * 8) / bandwidth;

	controller.onDownload({
		renditionId: rendition.id,
		bytes,
		durationSeconds: downloadSeconds,
		mediaSeconds,
		aborted: false
	});

	buffer += mediaSeconds - downloadSeconds;
	if (buffer < 0) {
		qoe.markStall(clock);
		qoe.markResume(clock + -buffer * 1000);
		buffer = 0;
	}
	qoe.markPlayed(Math.min(mediaSeconds, downloadSeconds), rendition);

	clock += downloadSeconds * 1000;

	const decision = controller.decide({
		bufferLevel: buffer,
		viewportWidth: 1920,
		viewportHeight: 1080,
		starting: index === 0,
		now: clock
	});

	if (decision.switched) qoe.markSwitch();

	console.log(
		`segment ${index}: served ${rendition.id}, buffer ${buffer.toFixed(1)}s -> ` +
			`next ${decision.rendition.id} (${decision.reason})`
	);
}

console.log(qoe.report());
```

</div>
<div class="ct-panel" data-lang="go">

```go
package abr

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

type Rendition struct {
	ID     string
	Width  int
	Height int
	// Bitrate is the peak, in bits per second. This is what we budget against.
	Bitrate int
}

type DownloadSample struct {
	RenditionID     string
	Bytes           int64
	DurationSeconds float64 // wall-clock time the download took
	MediaSeconds    float64 // playback time the segment covers
	// Aborted downloads must never feed the estimator: the ratio is meaningless.
	Aborted bool
}

type PlayerState struct {
	// BufferLevel is seconds of media ahead of the playhead in the current range.
	BufferLevel    float64
	ViewportWidth  int
	ViewportHeight int
	// Starting is true until the first frame has been rendered.
	Starting bool
	// NowMs is a monotonic clock in milliseconds.
	NowMs float64
}

type Config struct {
	SafetyFactor          float64
	PanicBufferSeconds    float64
	ComfortBufferSeconds  float64
	UpSwitchMargin        float64
	SwitchCooldownMs      float64
	FastHalfLife          float64
	SlowHalfLife          float64
	MaxUpscaleFactor      float64
	StartupIndexFraction  float64
}

func DefaultConfig() Config {
	return Config{
		SafetyFactor:         0.8,
		PanicBufferSeconds:   6,
		ComfortBufferSeconds: 30,
		UpSwitchMargin:       1.25,
		SwitchCooldownMs:     4000,
		FastHalfLife:         3,
		SlowHalfLife:         12,
		MaxUpscaleFactor:     1.3,
		StartupIndexFraction: 0.4,
	}
}

// ---------------------------------------------------------------------------
// Throughput estimation
// ---------------------------------------------------------------------------

// ThroughputEstimator is a two-speed harmonic EWMA over download throughput.
//
// Harmonic, not arithmetic: throughput is a rate, and an arithmetic mean of
// rates is biased upward by a single unusually fast download -- exactly the
// error that makes a player commit to bandwidth it never had.
//
// Two speeds, and always take the lower: the fast estimator reacts the instant
// the network degrades, while the slow one stops the player from sprinting
// upward on one lucky segment. Reacting fast downward and slow upward is not
// symmetry -- it is the asymmetry of the cost, since a rebuffer hurts far more
// than a few seconds at a lower rendition.
type ThroughputEstimator struct {
	fastHalfLife float64
	slowHalfLife float64

	fastInverse float64
	slowInverse float64
	fastWeight  float64
	slowWeight  float64
	samples     int
}

func NewThroughputEstimator(fastHalfLife, slowHalfLife float64) *ThroughputEstimator {
	return &ThroughputEstimator{fastHalfLife: fastHalfLife, slowHalfLife: slowHalfLife}
}

func (e *ThroughputEstimator) SampleCount() int { return e.samples }

func (e *ThroughputEstimator) AddSample(s DownloadSample) {
	// An aborted download tells us nothing: we do not know how much of the
	// elapsed time was spent transferring the bytes we actually received.
	if s.Aborted || s.DurationSeconds <= 0 || s.Bytes <= 0 {
		return
	}

	bitsPerSecond := float64(s.Bytes) * 8 / s.DurationSeconds
	inverse := 1 / bitsPerSecond

	// Weight each sample by the media time it covers, so a 4s segment counts
	// more than a 1s one. Without this, a burst of tiny requests can swamp
	// the estimate.
	weight := math.Max(s.MediaSeconds, 0.1)

	fastAlpha := math.Pow(0.5, 1/e.fastHalfLife)
	slowAlpha := math.Pow(0.5, 1/e.slowHalfLife)

	e.fastInverse = e.fastInverse*fastAlpha + inverse*weight
	e.fastWeight = e.fastWeight*fastAlpha + weight
	e.slowInverse = e.slowInverse*slowAlpha + inverse*weight
	e.slowWeight = e.slowWeight*slowAlpha + weight

	e.samples++
}

// Estimate returns sustainable throughput in bits per second, and false if no
// usable sample has been seen yet.
func (e *ThroughputEstimator) Estimate() (float64, bool) {
	if e.samples == 0 || e.fastWeight == 0 || e.slowWeight == 0 {
		return 0, false
	}

	fast := e.fastWeight / e.fastInverse
	slow := e.slowWeight / e.slowInverse

	return math.Min(fast, slow), true
}

func (e *ThroughputEstimator) Reset() {
	e.fastInverse, e.slowInverse = 0, 0
	e.fastWeight, e.slowWeight = 0, 0
	e.samples = 0
}

// ---------------------------------------------------------------------------
// QoE accounting
// ---------------------------------------------------------------------------

type QoeReport struct {
	StartupTimeMs       float64
	HasStartupTime      bool
	RebufferCount       int
	RebufferSeconds     float64
	RebufferRatio       float64
	WatchedSeconds      float64
	AverageBitrate      float64
	SwitchCount         int
	DownloadErrors      int
	QualityDistribution map[string]float64
}

type QoeTracker struct {
	startedAtMs    float64
	hasStarted     bool
	startupTimeMs  float64
	hasStartupTime bool

	rebufferCount     int
	rebufferSeconds   float64
	rebufferStartedAt float64
	stalled           bool

	watchedSeconds float64
	bitrateSeconds float64
	switchCount    int
	downloadErrors int
	perRendition   map[string]float64
}

func NewQoeTracker() *QoeTracker {
	return &QoeTracker{perRendition: make(map[string]float64)}
}

func (q *QoeTracker) MarkPlayRequested(nowMs float64) {
	q.startedAtMs, q.hasStarted = nowMs, true
}

// MarkFirstFrame measures to the first rendered frame, not to canplay. The gap
// between them is easily a few hundred milliseconds, and the viewer feels the
// second one.
func (q *QoeTracker) MarkFirstFrame(nowMs float64) {
	if q.hasStarted && !q.hasStartupTime {
		q.startupTimeMs, q.hasStartupTime = nowMs-q.startedAtMs, true
	}
}

func (q *QoeTracker) MarkStall(nowMs float64) {
	if q.stalled {
		return
	}
	q.stalled, q.rebufferStartedAt = true, nowMs
	q.rebufferCount++
}

func (q *QoeTracker) MarkResume(nowMs float64) {
	if !q.stalled {
		return
	}
	q.rebufferSeconds += (nowMs - q.rebufferStartedAt) / 1000
	q.stalled = false
}

func (q *QoeTracker) MarkPlayed(seconds float64, r Rendition) {
	q.watchedSeconds += seconds
	q.bitrateSeconds += float64(r.Bitrate) * seconds
	q.perRendition[r.ID] += seconds
}

func (q *QoeTracker) MarkSwitch()        { q.switchCount++ }
func (q *QoeTracker) MarkDownloadError() { q.downloadErrors++ }

func (q *QoeTracker) Report() QoeReport {
	distribution := make(map[string]float64, len(q.perRendition))
	for id, seconds := range q.perRendition {
		if q.watchedSeconds > 0 {
			distribution[id] = seconds / q.watchedSeconds
		}
	}

	report := QoeReport{
		StartupTimeMs:       q.startupTimeMs,
		HasStartupTime:      q.hasStartupTime,
		RebufferCount:       q.rebufferCount,
		RebufferSeconds:     q.rebufferSeconds,
		WatchedSeconds:      q.watchedSeconds,
		SwitchCount:         q.switchCount,
		DownloadErrors:      q.downloadErrors,
		QualityDistribution: distribution,
	}

	if total := q.watchedSeconds + q.rebufferSeconds; total > 0 {
		report.RebufferRatio = q.rebufferSeconds / total
	}
	if q.watchedSeconds > 0 {
		report.AverageBitrate = q.bitrateSeconds / q.watchedSeconds
	}

	return report
}

// ---------------------------------------------------------------------------
// The controller
// ---------------------------------------------------------------------------

type Decision struct {
	Rendition Rendition
	Reason    string
	Switched  bool
}

type Controller struct {
	ladder       []Rendition
	config       Config
	estimator    *ThroughputEstimator
	currentIndex int
	lastSwitchAt float64
	hasSwitched  bool
}

func NewController(ladder []Rendition, config Config, priorThroughput float64) (*Controller, error) {
	if len(ladder) == 0 {
		return nil, errors.New("abr: ladder must not be empty")
	}

	// Ascending by bitrate: index 0 is the safest rendition.
	sorted := make([]Rendition, len(ladder))
	copy(sorted, ladder)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Bitrate < sorted[j].Bitrate })

	c := &Controller{
		ladder:    sorted,
		config:    config,
		estimator: NewThroughputEstimator(config.FastHalfLife, config.SlowHalfLife),
	}

	if priorThroughput > 0 {
		c.currentIndex = c.highestAffordable(priorThroughput * config.SafetyFactor)
	} else {
		c.currentIndex = int(float64(len(sorted)) * config.StartupIndexFraction)
		if c.currentIndex >= len(sorted) {
			c.currentIndex = len(sorted) - 1
		}
	}

	return c, nil
}

func (c *Controller) Current() Rendition { return c.ladder[c.currentIndex] }

func (c *Controller) OnDownload(s DownloadSample) { c.estimator.AddSample(s) }

// highestAffordable returns the highest index whose bitrate fits the budget.
func (c *Controller) highestAffordable(budget float64) int {
	index := 0
	for i, r := range c.ladder {
		if float64(r.Bitrate) <= budget {
			index = i
		}
	}
	return index
}

// bufferCeiling returns the highest index the buffer alone permits.
//
// The buffer is the better signal precisely because it is not contaminated by
// our own choice: how many seconds are queued is an objective fact, whereas
// measured throughput depends on which rendition we picked last.
func (c *Controller) bufferCeiling(bufferLevel float64) int {
	if bufferLevel <= c.config.PanicBufferSeconds {
		return 0
	}
	if bufferLevel >= c.config.ComfortBufferSeconds {
		return len(c.ladder) - 1
	}

	span := c.config.ComfortBufferSeconds - c.config.PanicBufferSeconds
	progress := (bufferLevel - c.config.PanicBufferSeconds) / span
	return int(progress * float64(len(c.ladder)-1))
}

// viewportCeiling stops us fetching pixels the display cannot show.
func (c *Controller) viewportCeiling(state PlayerState) int {
	limit := float64(state.ViewportHeight) * c.config.MaxUpscaleFactor
	index := 0
	for i, r := range c.ladder {
		if float64(r.Height) <= limit {
			index = i
		}
	}
	return index
}

func (c *Controller) Decide(state PlayerState) Decision {
	previousIndex := c.currentIndex

	// --- Panic: the buffer decides, nothing else matters ---------------------
	if !state.Starting && state.BufferLevel <= c.config.PanicBufferSeconds {
		c.currentIndex = 0
		switched := previousIndex != 0
		if switched {
			c.lastSwitchAt, c.hasSwitched = state.NowMs, true
		}
		return Decision{
			Rendition: c.Current(),
			Reason:    fmt.Sprintf("buffer %.1fs below panic level", state.BufferLevel),
			Switched:  switched,
		}
	}

	throughput, ok := c.estimator.Estimate()
	if !ok {
		return Decision{Rendition: c.Current(), Reason: "no throughput samples yet"}
	}

	// --- Two candidates, take the more conservative --------------------------
	budget := throughput * c.config.SafetyFactor
	throughputCeiling := c.highestAffordable(budget)

	bufferCeiling := len(c.ladder) - 1 // during startup the buffer is empty by definition
	if !state.Starting {
		bufferCeiling = c.bufferCeiling(state.BufferLevel)
	}

	viewportCeiling := c.viewportCeiling(state)

	target := throughputCeiling
	if bufferCeiling < target {
		target = bufferCeiling
	}
	if viewportCeiling < target {
		target = viewportCeiling
	}

	// --- Hysteresis and cooldown, but only when moving up --------------------
	if target > c.currentIndex {
		cooling := c.hasSwitched && state.NowMs-c.lastSwitchAt < c.config.SwitchCooldownMs
		nextBitrate := float64(c.ladder[c.currentIndex+1].Bitrate)
		hasHeadroom := budget >= nextBitrate*c.config.UpSwitchMargin

		if cooling || !hasHeadroom {
			reason := "insufficient headroom to move up"
			if cooling {
				reason = "up-switch on cooldown"
			}
			return Decision{Rendition: c.Current(), Reason: reason}
		}

		// Step one rung at a time. A single jump from the bottom to the top
		// commits to a bitrate we have no evidence the network can sustain.
		target = c.currentIndex + 1
	}

	switched := target != c.currentIndex
	if switched {
		c.currentIndex = target
		c.lastSwitchAt, c.hasSwitched = state.NowMs, true
	}

	return Decision{
		Rendition: c.Current(),
		Reason: fmt.Sprintf("throughput %.2f Mbps, buffer %.1fs, ceilings t=%d b=%d v=%d",
			throughput/1e6, state.BufferLevel, throughputCeiling, bufferCeiling, viewportCeiling),
		Switched: switched,
	}
}

// OnSeek handles a seek: the buffer is invalidated, the estimator survives.
func (c *Controller) OnSeek() {
	if c.currentIndex > 0 {
		c.currentIndex--
	}
	c.hasSwitched = false
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

func Example() {
	ladder := []Rendition{
		{"360p", 640, 360, 628_000},
		{"540p", 960, 540, 1_888_000},
		{"720p", 1280, 720, 3_428_000},
		{"1080p", 1920, 1080, 5_628_000},
	}

	controller, err := NewController(ladder, DefaultConfig(), 4_000_000)
	if err != nil {
		fmt.Printf("abr: %v\n", err)
		return
	}

	qoe := NewQoeTracker()
	qoe.MarkPlayRequested(0)
	qoe.MarkFirstFrame(820)

	// Simulate a network that starts strong and then collapses on a train.
	network := []float64{9_000_000, 8_400_000, 8_800_000, 1_100_000, 900_000, 1_000_000}
	buffer, clock := 4.0, 1000.0

	for index, bandwidth := range network {
		rendition := controller.Current()
		mediaSeconds := 4.0
		bytes := float64(rendition.Bitrate) * mediaSeconds / 8
		downloadSeconds := bytes * 8 / bandwidth

		controller.OnDownload(DownloadSample{
			RenditionID:     rendition.ID,
			Bytes:           int64(bytes),
			DurationSeconds: downloadSeconds,
			MediaSeconds:    mediaSeconds,
		})

		buffer += mediaSeconds - downloadSeconds
		if buffer < 0 {
			qoe.MarkStall(clock)
			qoe.MarkResume(clock + -buffer*1000)
			buffer = 0
		}
		qoe.MarkPlayed(math.Min(mediaSeconds, downloadSeconds), rendition)

		clock += downloadSeconds * 1000

		decision := controller.Decide(PlayerState{
			BufferLevel:    buffer,
			ViewportWidth:  1920,
			ViewportHeight: 1080,
			Starting:       index == 0,
			NowMs:          clock,
		})

		if decision.Switched {
			qoe.MarkSwitch()
		}

		fmt.Printf("segment %d: served %s, buffer %.1fs -> next %s (%s)\n",
			index, rendition.ID, buffer, decision.Rendition.ID, decision.Reason)
	}

	fmt.Printf("%+v\n", qoe.Report())
}
```

</div>
</CodeTabs>

## যা এই ইমপ্লিমেন্টেশনকে প্রোডাকশন-রেডি করে

- **হারমোনিক গড়, সাধারণ গড় নয়** — throughput একটা হার, আর হারের সাধারণ গড় উপরের দিকে পক্ষপাতী; একটা ভাগ্যবান download থেকে player এমন bandwidth ধরে নেয় যা তার কখনো ছিল না
- **দুই গতির estimator, কমটা নেওয়া** — নেটওয়ার্ক পড়লে সাথে সাথে প্রতিক্রিয়া, নেটওয়ার্ক ভালো হলে ধীরে ওঠা; খরচের অসমতাই এই অসমতার কারণ
- **Media time দিয়ে ওজন** — চার সেকেন্ডের segment এক সেকেন্ডেরটার চেয়ে বেশি গোনে, নইলে ছোট request-এর ঝাঁক estimate ডুবিয়ে দেয়
- **বাতিল download বাদ** — অসম্পূর্ণ download-এর ratio অর্থহীন, আর সেটা estimator-কে বিষিয়ে দেয়; seek-এর সময় এটা ঘটে সবচেয়ে বেশি
- **তিনটে আলাদা ceiling** — throughput, buffer, আর viewport; তিনটার মধ্যে সবচেয়ে সতর্কটা মানা হয়
- **অসম switch নিয়ম** — নিচে নামা সাথে সাথে আর নির্বিচারে, উপরে ওঠা cooldown, headroom margin আর এক ধাপে
- **Panic mode buffer-এর হাতে** — বিপদসীমার নিচে throughput যা-ই বলুক, সবচেয়ে নিরাপদ rendition
- **আগের সেশনের throughput দিয়ে শুরু** — cold start-এর সবচেয়ে কাজের সংকেত, অথচ বেশিরভাগ player ব্যবহার করে না
- **QoE-তে quality distribution, শুধু গড় নয়** — "গড় 2.4 Mbps" লুকিয়ে রাখে যে ২০% সময় সবচেয়ে নিচু rung-এ কেটেছে

<div class="takeaways">

### মূল শেখা

- Player মানে পাঁচটা সমান্তরাল কাজ — manifest parse, buffer monitor, throughput estimate, ABR সিদ্ধান্ত, আর MSE-তে append; এর সবকিছুর কেন্দ্রে একটাই প্রশ্ন: পরের segment কোন rendition থেকে
- **MSE** ছাড়া ব্রাউজারে adaptive streaming সম্ভব নয়; aligned segment থাকলে একই `SourceBuffer`-এ ভিন্ন rendition-এর segment অবাধে মেশানো যায়
- **EME**-তে JavaScript কখনো key দেখে না — শুধু একটা অস্বচ্ছ request-response CDM-এর সাথে চালাচালি করে
- **Buffer level** player-এর সবচেয়ে গুরুত্বপূর্ণ সংখ্যা, আর সেটা playhead যে range-এ আছে সেই range থেকে পড়তে হবে — `buffered.end(0)` seek-এর পরে মিথ্যা বলে
- **Naive throughput-based ABR দোলে**, কারণ মাপটা নিজের সিদ্ধান্তেই দূষিত (ছোট segment TCP-র পূর্ণ গতি পায় না), একক নমুনার ভ্যারিয়ান্স বিশাল, আর feedback loop-এ এক segment-এর lag আছে
- **Buffer-based ABR** ভালো কারণ buffer level নিজেই থ্রুপুটের সারাংশ, ধীরে বদলায়, আর নিজের সিদ্ধান্তে দূষিত নয় — কিন্তু startup-এ এটা অকেজো
- বাস্তবের প্রতিটা ভালো player **hybrid**: শুরুতে throughput, তারপর দুটোর মধ্যে সতর্কতরটা, buffer বিপদসীমায় buffer-ই চূড়ান্ত
- **নিচে দ্রুত, উপরে ধীর** — rebuffer-এর খরচ সামান্য কম quality-র খরচের চেয়ে অনেক বেশি, তাই ABR-এর নিয়ম ইচ্ছাকৃতভাবে অসম
- **Startup time**-এর প্রথম সিদ্ধান্তটা তথ্য ছাড়াই নিতে হয়; আগের সেশনের throughput মনে রাখা এখানে সবচেয়ে কাজের কৌশল, আর নিচু rendition দিয়ে শুরু করে দ্রুত ওঠা প্রায় সবসময় সঠিক
- **Seek** কার্যত একটা নতুন startup — চলতি download বাতিল করুন, সেই নমুনা গুনবেন না, নিচু rendition-এ শুরু করুন
- iOS Safari-তে MSE নেই, তাই সেখানে নেটিভ HLS বাধ্যতামূলক আর ABR Apple-এর হাতে; বাস্তব সিস্টেমে দুটো পথই রাখতে ও টেস্ট করতে হয়
- QoE-তে **startup time, rebuffer ratio, rebuffer count, সময়-ভারিত bitrate আর failure rate** — এই পাঁচটা ন্যূনতম, আর সেশন শেষে পাঠাতেই হবে নইলে ডেটায় শুধু সফল সেশনই থাকবে

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **dash.js** ডিফল্টে একটা hybrid rule set চালায় (throughput rule + BOLA), আর ডেভেলপারকে নিজের rule প্লাগ করতে দেয় — ABR পড়ার জন্য সবচেয়ে ভালো ওপেন-সোর্স কোডবেস
- **hls.js** প্রায় সব অ-Apple ব্রাউজারে HLS চালায়, MSE-র উপরে; এর ABR-এ দুই-গতির bandwidth estimator আর abort-on-slow-download কৌশল দুটোই আছে
- **Shaka Player (Google)** HLS আর DASH দুটোই চালায় এবং EME-র জটিলতা লুকিয়ে দেয়, তাই DRM কনটেন্টে এটা সবচেয়ে প্রচলিত পছন্দ
- **ExoPlayer/Media3 (Android)** আর **AVPlayer (iOS)** নেটিভ পথ; ExoPlayer-এ ABR সম্পূর্ণ কনফিগারযোগ্য, AVPlayer-এ শুধু `preferredPeakBitRate`-এর মতো কয়েকটা ইঙ্গিত দেওয়া যায়
- **Netflix, YouTube, Twitch** সবাই নিজেদের ABR চালায় এবং সেশন-স্তরের QoE ডেটা ফেরত নেয়; প্রকাশিত গবেষণাগুলো বারবার দেখায় rebuffer ratio-ই দর্শক ধরে রাখার সবচেয়ে বড় নির্ধারক, গড় bitrate নয়
- **Conviva, Mux Data, Datadog RUM** এই metric গুলোই সংগ্রহ করে — অর্থাৎ নিজে না বানালেও আপনাকে ঠিক এই সংখ্যাগুলোই player থেকে বের করতে হবে

</div>
