---
title: 'Media Source Extensions'
subtitle: 'MediaSource, SourceBuffer, কোডেক স্ট্রিং পড়া, init আর media segment, buffered রেঞ্জ, QuotaExceededError আর ManagedMediaSource — নিজের হাতে বাইট খাইয়ে ভিডিও চালানো।'
chapter: 3
level: 'beginner'
readingTime: '২০ মিনিট'
topics: ['mse', 'mediasource', 'sourcebuffer', 'codec strings', 'fmp4', 'managedmediasource']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

পুরান ঢাকার একটা রুটির দোকানে তন্দুরের সামনে বসে রাজি। পেছনের টেবিলে ফারাবি আটা মেখে লেচি বানায়, বেলে রুটির আকার দেয়, আর একটা একটা করে রাজির হাতে দেয়। রাজির কাজ একটাই: রুটিটা তন্দুরের গায়ে চাপিয়ে দেওয়া, আর পুরোপুরি লেগে না যাওয়া পর্যন্ত পরেরটা না নেওয়া। একসাথে দুইটা রুটি ঠেলে দিলে একটা আরেকটার উপর পড়ে নষ্ট হয়। দিনের প্রথম রুটির আগে অবশ্য আরেকটা কাজ আছে: তন্দুর কোন আঁচে চলবে, তেল-লবণ কেমন, সেটা ঠিক করে নেওয়া। ওটা দিনে একবার, প্রতিটা রুটির আগে না।

তন্দুরের গায়ে জায়গা সীমিত। দোকানের মালিক ফাতিমা নিয়ম করে দিয়েছেন: ক্রেতারা যে রুটি খেয়ে ফেলেছে বা যেগুলো অনেক আগে সেঁকা, সেগুলো তুলে জায়গা খালি করো, তারপর নতুন চাপাও। জায়গা না থাকা অবস্থায় জোর করে রুটি চাপাতে গেলে রাজি সোজা "জায়গা নেই" বলে ফিরিয়ে দেয়। আর ক্রেতা খোয়ারিজমি প্রতিদিন জানতে চায় "এখন কতগুলো তৈরি আছে?" রাজি তন্দুরের দিকে তাকিয়ে বলে "সকাল আটটার পর থেকে সাড়ে আটটা পর্যন্ত যতগুলো চেয়েছিলে, সব তৈরি; নয়টার পরেরগুলো এখনো আসেনি।"

মিলিয়ে নিই: তন্দুর হলো ব্রাউজারের ডিকোডার, রাজি হলো **SourceBuffer**, আর ফারাবি হলো আপনার **JavaScript প্লেয়ার** যে নেটওয়ার্ক থেকে সেগমেন্ট এনে খাওয়ায়। পুরো দোকানটা হলো **MediaSource**। একটা রুটি হাতে দেওয়া হলো **appendBuffer()**, আর রুটি পুরোপুরি লেগে যাওয়ার পর পরেরটা নেওয়া হলো **updateend** ইভেন্টের জন্য অপেক্ষা করা। দিনের শুরুতে আঁচ আর মশলা ঠিক করা হলো **init segment**, প্রতিটা রুটি একেকটা **media segment**। পুরনো রুটি তুলে জায়গা করা হলো **remove()**, "জায়গা নেই" হলো **QuotaExceededError**, আর "আটটা থেকে সাড়ে আটটা তৈরি" হলো **buffered TimeRanges**। বাস্তবে hls.js, dash.js আর Shaka ঠিক এই কাজটাই করে, শুধু অনেক সতর্কতার সাথে; এই চ্যাপ্টারে আমরা হাতে করে করব।

## MSE কী সমস্যার সমাধান করে

দ্বিতীয় চ্যাপ্টারে আমরা `video.src`-এ সরাসরি একটা MP4 URL দিয়েছিলাম। তাতে ব্রাউজার নিজেই ফাইল নামায়, কিন্তু আপনি ঠিক করতে পারেন না কোন কোয়ালিটি, কোন অংশ, কখন। অ্যাডাপ্টিভ স্ট্রিমিংয়ের পুরো ধারণাটাই হলো প্রতিটা সেগমেন্টের জন্য আলাদা সিদ্ধান্ত নেওয়া। **Media Source Extensions** সেই নিয়ন্ত্রণ দেয়: আপনি বাইট আনবেন, ব্রাউজার শুধু ডিকোড করবে। প্লেয়ারের এই বিভাজনের ছবি আছে [Playback আর ABR](/notes/video/07-playback-and-abr) চ্যাপ্টারে; এখানে আমরা API-টা হাতে-কলমে ধরব।

<Mermaid
title="MSE-র অংশগুলো"
code={`graph LR
  JS["আপনার JS: fetch()"] -->|"ArrayBuffer"| SB1["SourceBuffer (video+audio বা শুধু video)"]
  JS -->|"ArrayBuffer"| SB2["SourceBuffer (audio, ঐচ্ছিক)"]
  SB1 --> MS["MediaSource"]
  SB2 --> MS
  MS -->|"URL.createObjectURL"| V["video এলিমেন্ট"]
  V --> DEC["ডিকোডার ও স্ক্রিন"]`}
/>

## চার ধাপে MSE

```javascript
// 1. Create a MediaSource and attach it to the video element
const video = document.querySelector('video');
const ms = new MediaSource();
video.src = URL.createObjectURL(ms);

// 2. Wait until it is attached and open
ms.addEventListener('sourceopen', async () => {
	URL.revokeObjectURL(video.src);

	// 3. Declare exactly what bytes are coming
	const mime = 'video/mp4; codecs="avc1.64001f, mp4a.40.2"';
	if (!MediaSource.isTypeSupported(mime)) throw new Error(`unsupported: ${mime}`);
	const sb = ms.addSourceBuffer(mime);

	// 4. Append init segment, then media segments, one at a time
	for (const url of ['init.mp4', 'seg000.m4s', 'seg001.m4s']) {
		const buf = await (await fetch(url)).arrayBuffer();
		await append(sb, buf);
	}
	ms.endOfStream();
});

function append(sb, buf) {
	return new Promise((resolve, reject) => {
		sb.addEventListener('updateend', resolve, { once: true });
		sb.addEventListener('error', reject, { once: true });
		sb.appendBuffer(buf);
	});
}
```

চারটা জিনিস খেয়াল করুন:

1. **`sourceopen`-এর আগে কিছু করা যায় না।** MediaSource তখনো `video`-র সাথে যুক্ত হয়নি; `readyState` তখন `"closed"`।
2. **`addSourceBuffer()`-এ পুরো MIME টাইপ আর কোডেক স্ট্রিং দিতে হয়।** শুধু `video/mp4` দিলে চলবে না, ব্রাউজার জানতে চায় ঠিক কোন ডিকোডার লাগবে।
3. **`appendBuffer()` অ্যাসিনক্রোনাস।** এটা সাথে সাথে ফিরে আসে, কিন্তু কাজ শেষ হয় `updateend` ইভেন্টে। কাজ চলার সময় (`sb.updating === true`) আরেকটা `appendBuffer()` ডাকলে `InvalidStateError` আসে। এজন্যই প্রতিটা প্লেয়ারে একটা append কিউ থাকে।
4. **`endOfStream()` বলে "আর কিছু আসবে না"।** তখন ব্রাউজার `duration` ঠিক করে আর শেষে পৌঁছালে `ended` ইভেন্ট দেয়। না ডাকলে ভিডিও শেষে গিয়ে চিরকাল `waiting` অবস্থায় আটকে থাকে।

## কোডেক স্ট্রিং পড়তে শেখা

`avc1.64001f` দেখে অনেকে মনে করে এটা কোনো র‍্যান্ডম আইডি। আসলে এর প্রতিটা অংশের মানে আছে, আর এটা ভুল হলে `addSourceBuffer()` সোজা ফেল করে।

| স্ট্রিং | কোডেক | অংশগুলোর মানে |
| --- | --- | --- |
| `avc1.64001f` | H.264 | `64` = প্রোফাইল 100 (High), `00` = কনস্ট্রেইন্ট ফ্ল্যাগ, `1f` = লেভেল 31, মানে 3.1 |
| `avc1.42e01e` | H.264 | `42` = প্রোফাইল 66 (Baseline), `e0` = কনস্ট্রেইন্ট, `1e` = লেভেল 30, মানে 3.0 |
| `mp4a.40.2` | AAC | `40` = MPEG-4 অডিও, `2` = অবজেক্ট টাইপ AAC-LC |
| `mp4a.40.5` | HE-AAC | অবজেক্ট টাইপ 5 = SBR (HE-AAC) |
| `hvc1.1.6.L93.B0` | HEVC | প্রোফাইল স্পেস ও প্রোফাইল 1 (Main), কম্প্যাটিবিলিটি ফ্ল্যাগ, টিয়ার `L` (Main) আর লেভেল 93 (93 ÷ 30 = 3.1), কনস্ট্রেইন্ট `B0` |
| `av01.0.08M.08` | AV1 | প্রোফাইল 0 (Main), লেভেল ইনডেক্স 08 (মানে 4.0), টিয়ার `M` (Main), বিট ডেপথ 08 |
| `opus` | Opus | অতিরিক্ত অংশ নেই |

সংখ্যাগুলো হেক্সাডেসিমাল (H.264-এ) বা নির্দিষ্ট নিয়মে লেখা, তাই কখনো হাতে বানাবেন না। সঠিক উৎস হলো ফাইল নিজেই। `ffprobe` দিয়ে প্রোফাইল আর লেভেল দেখা যায়:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,codec_tag_string,profile,level \
  -of default=nw=1 init.mp4
```

```text
codec_name=h264
codec_tag_string=avc1
profile=High
level=31
```

`profile=High` (100 = `0x64`) আর `level=31` (`0x1f`) মিলিয়ে `avc1.64001f`। কনস্ট্রেইন্ট বাইটটা `ffprobe` সরাসরি দেখায় না; প্যাকেজার (ffmpeg-এর HLS muxer, Shaka Packager, Bento4) সেটা ম্যানিফেস্টের `CODECS` অ্যাট্রিবিউটে নিজেই লেখে। প্লেয়ার সেখান থেকেই পড়ে। তাই প্যাকেজার কোডেক স্ট্রিং ভুল লিখলে সমস্যাটা প্লেয়ারে দেখা দেয়, যদিও দোষ প্যাকেজারের।

<Callout type="warning">

**`hvc1` আর `hev1` দুটো আলাদা।** দুটোই HEVC, কিন্তু প্যারামিটার সেট কোথায় থাকে সেটা আলাদা (`hvc1`-এ init segment-এ, `hev1`-এ প্রতিটা সেগমেন্টের ভেতরে)। Apple-এর ডিভাইস HLS-এ `hvc1` চায়। ffmpeg দিয়ে HEVC প্যাকেজ করলে `-tag:v hvc1` দিতে ভুলবেন না।

</Callout>

## Init segment আর media segment

একটা fragmented MP4 স্ট্রিম দুই ধরনের টুকরায় আসে:

- **Init segment** (`ftyp` + `moov`): কোডেক কনফিগারেশন, ট্র্যাকের তালিকা, টাইমস্কেল। কোনো ফ্রেম নেই। প্রতিটা SourceBuffer-এ শুরুতে একবার, আর কোয়ালিটি বদলালে নতুন রেন্ডিশনের init আবার।
- **Media segment** (`moof` + `mdat`): আসল ফ্রেম। প্রতিটা নিজের টাইমস্ট্যাম্প বহন করে।

এই box-গুলোর ভেতরটা আছে [Container আর transmuxing](/notes/video/03-containers-and-transmuxing) চ্যাপ্টারে। এখানে জানার বিষয় একটাই: **init ছাড়া media segment append করলে ব্রাউজার জানে না কীভাবে ডিকোড করবে, তাই এরর দেয়।** আর রেন্ডিশন বদলালে নতুন init না দিয়ে নতুন রেন্ডিশনের সেগমেন্ট দিলে ডিকোডার ভুল কনফিগারেশনে চলে, ফলে সবুজ ব্লক বা ফ্রিজ।

### পরীক্ষার জন্য নিজের সেগমেন্ট বানানো

যেকোনো ছোট MP4 থেকে ffmpeg দিয়ে fMP4 সেগমেন্ট বানান:

```bash
ffmpeg -i lecture.mp4 -c:v libx264 -profile:v high -level 3.1 \
  -g 48 -keyint_min 48 -sc_threshold 0 -c:a aac -b:a 128k \
  -f hls -hls_time 4 -hls_playlist_type vod \
  -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 \
  -hls_segment_filename 'seg%03d.m4s' index.m3u8
ls
```

```text
index.m3u8  init.mp4  seg000.m4s  seg001.m4s  seg002.m4s  ...
```

`-g 48 -sc_threshold 0` দিয়ে প্রতি ৪৮ ফ্রেমে (২৪ fps-এ ২ সেকেন্ডে) নির্দিষ্টভাবে কীফ্রেম বসানো হয়েছে, যাতে প্রতিটা সেগমেন্ট কীফ্রেম দিয়ে শুরু হয়। এখন একই ফোল্ডারে উপরের JavaScript সহ একটা HTML ফাইল রেখে `python3 -m http.server 8000` চালালেই নিজের MSE প্লেয়ার চলবে। `index.m3u8` এখনো লাগবে না; ম্যানিফেস্ট পড়া চতুর্থ চ্যাপ্টারের বিষয়।

## buffered: কোন সময়টুকু তৈরি

`sb.buffered` (আর `video.buffered`) একটা `TimeRanges`: কোন কোন সময়-খণ্ড এখন ডিকোড করার জন্য তৈরি।

```javascript
function ranges(tr) {
	const out = [];
	for (let i = 0; i < tr.length; i++) out.push(`[${tr.start(i).toFixed(2)}, ${tr.end(i).toFixed(2)}]`);
	return out.join(' ');
}
console.log(ranges(video.buffered), 'current', video.currentTime.toFixed(2));
```

```text
[0.00, 12.01] [20.00, 28.02] current 9.40
```

এখানে দুইটা রেঞ্জ, মাঝে ১২ থেকে ২০ সেকেন্ডের একটা **ফাঁক** (gap)। ইউজার যদি ২০ সেকেন্ডে সিক করে, তারপর আবার ৯-এ ফেরে, এমন হয়। প্লেব্যাক ১২.০১-তে পৌঁছালে থেমে যাবে, কারণ সামনে ডেটা নেই। ভালো প্লেয়ার এই ফাঁক চিনে সেখানকার সেগমেন্ট আগে নামায়। আবার সেগমেন্টের টাইমস্ট্যাম্পে সামান্য অসামঞ্জস্য থাকলে (যেমন একটা শেষ হয় 12.01-এ, পরেরটা শুরু 12.03-এ) ২০ মিলিসেকেন্ডের ছোট ফাঁক তৈরি হয় যেটা ভিডিওকে চিরকাল আটকে রাখতে পারে। hls.js আর Shaka-র মতো লাইব্রেরিতে এজন্য আলাদা "gap jumping" লজিক থাকে, যা ছোট ফাঁক দেখলে `currentTime` সামান্য সামনে ঠেলে দেয়।

## remove() আর QuotaExceededError

ব্রাউজার প্রতিটা SourceBuffer-এ একটা নির্দিষ্ট পরিমাণ মেমোরি দেয়। সীমাটা ব্রাউজার ও ডিভাইস ভেদে আলাদা এবং কোনো স্ট্যান্ডার্ড API দিয়ে জানা যায় না; টিভি আর পুরনো ফোনে অনেক ছোট। সীমা পার হলে `appendBuffer()` সাথে সাথে `QuotaExceededError` ছোড়ে।

ব্রাউজার নিজে কিছু পুরনো ডেটা সরাতে পারে, কিন্তু সবসময় যথেষ্ট না। তাই প্লেয়ার নিজে পেছনের ডেটা (back buffer) মুছে ফেলে:

```javascript
async function appendWithEviction(video, sb, buf, keepBehind = 30) {
	try {
		await append(sb, buf);
	} catch (err) {
		if (err.name !== 'QuotaExceededError') throw err;
		const cut = video.currentTime - keepBehind;
		if (cut <= 0) throw err; // nothing safe to evict; caller should shrink the forward buffer
		await removeRange(sb, 0, cut);
		await append(sb, buf); // one retry
	}
}

function removeRange(sb, start, end) {
	return new Promise((resolve) => {
		sb.addEventListener('updateend', resolve, { once: true });
		sb.remove(start, end);
	});
}
```

`QuotaExceededError` আসে `appendBuffer()`-এর সিনক্রোনাস throw হিসেবে, ইভেন্ট হিসেবে না। উপরের `append()` ফাংশনে `appendBuffer` প্রমিসের executor-এর ভেতরে ডাকা, তাই সেই throw সরাসরি প্রমিসকে reject করে আর এখানে `catch`-এ ধরা পড়ে।

hls.js-এর `backBufferLength` আর Shaka-র `bufferBehind` কনফিগ এই কাজটাই করে। চতুর্থ চ্যাপ্টারে সেগুলো দেখব।

## mode, timestampOffset আর বাকি কয়েকটা নিয়ন্ত্রণ

**`sb.mode`** দুইটা মান নেয়:

- **`"segments"`** (fMP4-এর ডিফল্ট): প্রতিটা সেগমেন্টের ভেতরের টাইমস্ট্যাম্প মেনে টাইমলাইনে বসানো হয়। যে ক্রমেই append করুন, প্রতিটা নিজের জায়গায় যায়।
- **`"sequence"`**: টাইমস্ট্যাম্প উপেক্ষা করে append-এর ক্রমে একটার পর একটা বসানো। টাইমস্ট্যাম্প ছাড়া ফরম্যাট (যেমন কাঁচা ADTS AAC) বা কৃত্রিমভাবে জোড়া লাগানো ক্লিপে কাজে লাগে।

**`sb.timestampOffset`**: পরের append-গুলোর সব টাইমস্ট্যাম্পে এই সংখ্যাটা যোগ হয়। দুইটা আলাদা ভিডিও জোড়া লাগাতে (যেমন একটা অ্যাড, তারপর মূল কন্টেন্ট, যার দুটোই শূন্য থেকে শুরু) এটা লাগে। নবম চ্যাপ্টারে অ্যাড বসানোর সময় এটা আবার আসবে।

**`sb.abort()`**: চলমান append বাতিল করে। সিক করার সময় পুরনো অবস্থানের অর্ধেক-নামা সেগমেন্ট ফেলে দিতে কাজে লাগে।

**`ms.duration`**: ম্যানিফেস্ট থেকে মোট দৈর্ঘ্য জানা থাকলে আগেই বসিয়ে দিন, যাতে সিক বার শুরু থেকেই সঠিক দৈর্ঘ্য দেখায়। SourceBuffer আপডেট চলার সময় এটা বদলানো যায় না।

## ManagedMediaSource: ব্রাউজার যখন ঠিক করে কখন নামাবেন

ক্লাসিক MSE-তে কখন কতটা নামাবেন, সব সিদ্ধান্ত আপনার। মোবাইলে এর একটা দাম আছে: অপ্রয়োজনে বেশি নামালে ব্যাটারি আর ডেটা খরচ হয়, আর ব্রাউজার জানে না আপনি কী করছেন। **ManagedMediaSource** এই সমস্যার উত্তর। MDN অনুযায়ী (২০২৬ সালের অক্টোবরে দেখা), এটা `MediaSource`-এরই একটা সংস্করণ যেখানে:

- ব্রাউজার যেকোনো সময় বাফার থেকে ডেটা সরিয়ে দিতে পারে (মেমোরি বা হার্ডওয়্যারের সীমার কারণে), আর সরালে `bufferedchange` ইভেন্ট দিয়ে জানায়।
- `streaming` প্রপার্টি বলে এখন নামানো উচিত কিনা; `startstreaming` আর `endstreaming` ইভেন্ট দিয়ে ব্রাউজার আপনাকে "এখন নামাও" বা "যথেষ্ট হয়েছে" বলে।
- Safari-তে `sourceopen` তখনই আসে যখন `video.disableRemotePlayback = true` করা থাকে, অথবা AirPlay-এর জন্য একটা বিকল্প HLS `source` দেওয়া থাকে।

```javascript
const MS = window.ManagedMediaSource ?? window.MediaSource;
const ms = new MS();
if (MS === window.ManagedMediaSource) video.disableRemotePlayback = true;
video.src = URL.createObjectURL(ms);

ms.addEventListener('sourceopen', () => {
	const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.64001f, mp4a.40.2"');
	ms.addEventListener?.('startstreaming', () => resumeFetching());
	ms.addEventListener?.('endstreaming', () => pauseFetching());
	sb.addEventListener('bufferedchange', (e) => {
		// The browser evicted or added ranges; re-check what needs refetching
		console.log('removed', e.removedRanges?.length ?? 0);
	});
});
```

MDN এটাকে এখনো পরীক্ষামূলক আর সীমিত সাপোর্টের ফিচার বলছে, আর এটাই সেই API যা iPhone-এ MSE-ভিত্তিক প্লেয়ার চালানো সম্ভব করেছে। কোন ব্রাউজারের কোন ভার্সনে আছে, সেটা MDN-এর compatibility টেবিলে মিলিয়ে নিন। hls.js আর Shaka-র নতুন ভার্সন এটা নিজেরাই শনাক্ত করে ব্যবহার করে।

## Worker-এ MSE

বড় প্লেয়ারে মেইন থ্রেড ব্যস্ত থাকলে (ভারী UI, অ্যাড SDK) append দেরিতে হয় আর রিবাফারিং বাড়ে। এর সমাধান হিসেবে কিছু ব্রাউজার **dedicated worker**-এর ভেতরে `MediaSource` বানাতে দেয়। worker থেকে `mediaSource.handle` (একটা `MediaSourceHandle`) `postMessage` দিয়ে মেইন থ্রেডে পাঠানো হয়, আর মেইন থ্রেড সেটা `video.srcObject`-এ বসায়:

```javascript
// worker.js
const ms = new MediaSource();
postMessage({ handle: ms.handle }, [ms.handle]);
ms.addEventListener('sourceopen', () => {
	/* addSourceBuffer and appendBuffer here, off the main thread */
});

// main.js
worker.onmessage = (e) => {
	video.srcObject = e.data.handle;
};
```

MDN এটাকে "Limited availability" বলছে, মানে সব বড় ব্রাউজারে নেই, আর শুধু dedicated worker-এ কাজ করে (shared বা service worker-এ না)। worker-এর ভেতরে `MediaSource.canConstructInDedicatedWorker` দিয়ে আগে পরীক্ষা করে নিন, আর না থাকলে মেইন থ্রেডে ফিরে যান।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | কীভাবে নিশ্চিত হবেন | সমাধান |
| --- | --- | --- |
| `addSourceBuffer` এ `NotSupportedError` | কনসোলে `MediaSource.isTypeSupported(mime)` চালান; `false` আসবে | কোডেক স্ট্রিং ঠিক করুন (`ffprobe` দিয়ে প্রোফাইল ও লেভেল মিলিয়ে); ডিভাইস না পারলে অন্য কোডেকের রেন্ডিশন দিন |
| `InvalidStateError: An attempt was made to use an object that is not, or is no longer, usable` | append-এর আগে `sb.updating` লগ করুন; `true` থাকবে | append কিউ রাখুন, `updateend`-এর পরে পরেরটা |
| `sourceopen` কখনো আসে না (Safari) | `ManagedMediaSource` ব্যবহার করছেন কিনা দেখুন | `video.disableRemotePlayback = true` দিন, বা AirPlay-এর জন্য HLS `source` রাখুন |
| প্রথম append-এই ডিকোড এরর | প্রথমে কোনটা append হয়েছে লগ করুন | init segment আগে append করুন |
| কোয়ালিটি বদলালে সবুজ ব্লক বা ফ্রিজ | রেন্ডিশন বদলের সময় নতুন init append হয়েছে কিনা লগ করুন | নতুন রেন্ডিশনের init আগে append করুন; এনকোডারে কীফ্রেম অ্যালাইনমেন্ট দেখুন ([Bitrate ladder](/notes/video/05-bitrate-ladder)) |
| ভিডিও একটা নির্দিষ্ট সময়ে আটকে যায়, বাফারে ডেটা আছে | `ranges(video.buffered)` লগ করুন; ছোট একটা ফাঁক দেখবেন | সেগমেন্টের টাইমস্ট্যাম্প প্যাকেজারে ঠিক করুন; তাৎক্ষণিক সমাধান হিসেবে ছোট ফাঁক পেরিয়ে `currentTime` ঠেলে দিন |
| লম্বা সেশনের পর `QuotaExceededError` | ধরা এররের `name` লগ করুন; `buffered` রেঞ্জ অনেক বড় | পেছনের বাফার `remove()` করুন; সামনের বাফারের লক্ষ্যও ছোট রাখুন |
| শেষে গিয়ে ভিডিও `waiting` অবস্থায় আটকে, `ended` আসে না | শেষ append-এর পর `ms.readyState` দেখুন; `"open"` থাকবে | শেষ সেগমেন্টের পরে `ms.endOfStream()` ডাকুন |

## মূল শিক্ষা

1. **MSE মানে আপনি বাইট আনবেন, ব্রাউজার ডিকোড করবে।** অ্যাডাপ্টিভ স্ট্রিমিংয়ের সব নিয়ন্ত্রণ এখান থেকে আসে।
2. **`sourceopen`-এর পরে কাজ শুরু, `addSourceBuffer()`-এ পুরো কোডেক স্ট্রিং, আর `endOfStream()` দিয়ে শেষ।**
3. **একবারে একটা append; `updateend`-এর পরে পরেরটা।** প্রতিটা প্লেয়ারের ভেতরে একটা append কিউ থাকে।
4. **কোডেক স্ট্রিং হাতে বানাবেন না।** এর প্রতিটা অংশ প্রোফাইল, লেভেল, টিয়ারের হিসাব; প্যাকেজার থেকে নিন, `ffprobe` দিয়ে মিলিয়ে দেখুন।
5. **init segment আগে, আর রেন্ডিশন বদলালে নতুন init।**
6. **বাফার সীমিত আর সীমাটা অজানা।** `QuotaExceededError` ধরুন আর পেছনের ডেটা `remove()` করুন।
7. **`buffered`-এর ছোট ফাঁক ভিডিও আটকে দেয়।** লাইব্রেরিগুলোর gap jumping এজন্যই।
8. **ManagedMediaSource ব্রাউজারকে নামানোর সিদ্ধান্তে অংশ নিতে দেয়**, আর iPhone-এ MSE-ভিত্তিক প্লেয়ার এর উপর দাঁড়িয়ে। সাপোর্ট এখনো সীমিত, MDN-এ মিলিয়ে নিন।
