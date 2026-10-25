---
title: 'প্লেয়ার অ্যানালিটিক্স ও QoE'
subtitle: 'প্লেয়ারের প্রতিটা মুহূর্ত মাপা — VST, রিবাফার, EBVS-এর নিখুঁত সংজ্ঞা, একটা টেস্ট করা ট্র্যাকার, সেশন ইভেন্ট মডেল, CMCD দিয়ে CDN লগের সাথে জোড়া লাগানো, আর ড্যাশবোর্ডে কোন গড়টা মিথ্যা বলে।'
chapter: 11
level: 'advanced'
readingTime: '২৪ মিনিট'
topics: ['qoe', 'video analytics', 'video start time', 'rebuffer ratio', 'cmcd', 'media capabilities', 'sendbeacon']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

মিরপুর স্টেডিয়ামের প্রেস বক্সে বসে আছেন স্কোরার বিরুনি। তার সামনে একটা মোটা স্কোরবুক, প্রতিটা পাতায় ছোট ছোট ঘর। মাঠে যা-ই ঘটুক, প্রতিটা বলের জন্য তিনি একটা দাগ দেন: ডট বল হলে একটা বিন্দু, চার হলে "৪", ওয়াইড হলে আলাদা চিহ্ন, উইকেট হলে "W" আর পাশে কীভাবে আউট। পাশের চেয়ারে বসা নতুন স্কোরার রুশদ একবার জিজ্ঞেস করে, "শুধু রানটা লিখে রাখলেই তো হয়, এত ঝামেলা কেন?" বিরুনি হাসেন: "ম্যাচ শেষে কোচ জানতে চাইবেন কোন ওভারে রান আটকে গিয়েছিল, কোন বোলারের বলে ডট বেশি, বৃষ্টিতে খেলা থামার আগে আর পরে রান রেট কত ছিল। শুধু মোট রান দিয়ে এর একটারও উত্তর হয় না।"

বিরুনির কিছু কড়া নিয়ম আছে। বৃষ্টিতে খেলা থামলে সেই সময়টা তিনি ওভারের হিসাবে ঢোকান না; ওটা "খেলা বন্ধ", "ধীর খেলা" নয়। ওয়াইড বল বৈধ বলের গোনায় পড়ে না, কিন্তু রান হিসেবে আলাদা লেখা থাকে। আর প্রতি ওভার শেষে তিনি প্রেস বক্সের ডিজিটাল স্কোরবোর্ডে একটা সারাংশ পাঠান, যাতে খেলার মাঝখানে বিদ্যুৎ চলে গেলেও শেষ ওভার পর্যন্ত হিসাব হারায় না। একবার একটা ম্যাচ বৃষ্টিতে প্রথম বল হওয়ার আগেই বাতিল হয়েছিল। রুশদ বলেছিল, "কিছুই তো হয়নি, লেখার কী আছে?" বিরুনি স্কোরবুকে লিখলেন "ম্যাচ পরিত্যক্ত, বল হয়নি", কারণ মৌসুম শেষে কতগুলো ম্যাচ শুরুই হয়নি, সেটাও একটা হিসাব।

ম্যাচের পর বোর্ডের অ্যানালিস্ট ফাতিমা সব মাঠের স্কোরবুক একসাথে করে দেখেন। তিনি কখনো "প্রতি ম্যাচের রান রেটের গড়" নেন না; তিনি নেন "সব ম্যাচের মোট রান ভাগ মোট ওভার", কারণ পাঁচ ওভারের একটা বৃষ্টি-ছোট ম্যাচ আর পঞ্চাশ ওভারের পূর্ণ ম্যাচকে সমান ওজন দিলে ছবিটা ভুল হয়।

মিলিয়ে নিই: প্রতিটা বলের দাগ হলো প্লেয়ারের **ইভেন্ট** (`playing`, `waiting`, `seeking`), আর পুরো স্কোরবুকটা একটা **সেশন**। বৃষ্টিতে থামা সময়কে "ধীর খেলা" না ধরা হলো **seek বা pause-কে রিবাফার না গোনা**। ওভার শেষে স্কোরবোর্ডে সারাংশ পাঠানো হলো **heartbeat**, যাতে পেজ হঠাৎ বন্ধ হলেও শেষ অবস্থাটা হারায় না। প্রথম বলের আগেই পরিত্যক্ত ম্যাচ লিখে রাখা হলো **EBVS** (exit before video start): শুরু না হওয়াও একটা মাপার জিনিস। আর ফাতিমার "মোট রান ভাগ মোট ওভার" হলো **ratio of sums**, যা "প্রতি সেশনের অনুপাতের গড়" থেকে আলাদা এবং সঠিক। বাস্তবে প্রতিটা বড় ভিডিও প্ল্যাটফর্ম ঠিক এভাবেই প্লেয়ার থেকে ইভেন্ট তুলে, সেশনে গুছিয়ে, ড্যাশবোর্ডে দেখায় কোন দেশে, কোন CDN-এ, কোন ডিভাইসে অভিজ্ঞতা খারাপ।

## এই চ্যাপ্টার কোথা থেকে শুরু

**ভিডিও** ট্র্যাকের [কোয়ালিটি ও মনিটরিং](/notes/video/10-quality-and-monitoring) চ্যাপ্টার বলে কোন QoE মেট্রিক গুরুত্বপূর্ণ আর কেন, সেশনকে একক ধরা, নমুনায়ন, cardinality, আর একটা collector ও SLO aggregator। [প্লেব্যাক ও ABR](/notes/video/07-playback-and-abr) বলে কোন পাঁচটা সংখ্যা ফেরত পাঠাতেই হবে। এখানে সেগুলো আবার বলা হবে না।

এই চ্যাপ্টারের কাজ তার নিচের স্তরটা: **ব্রাউজারের কোন ইভেন্ট থেকে ঠিক কোন মুহূর্তে কোন ঘড়ি চালু আর বন্ধ হয়**, কোন ভুলে সংখ্যাগুলো চুপচাপ মিথ্যা বলে, আর প্লেয়ারের ডেটাকে CDN-এর লগের সাথে কীভাবে জোড়া লাগাতে হয়। মেট্রিকের নাম সবাই জানে; সংজ্ঞার এক লাইনের ভুলে দুই কোম্পানির "VST 1.2 সেকেন্ড" সম্পূর্ণ আলাদা জিনিস মাপে।

## মেট্রিকের নিখুঁত সংজ্ঞা

প্রতিটা মেট্রিকের জন্য তিনটা প্রশ্নের উত্তর লিখে রাখতে হয়: ঘড়ি কখন চালু, কখন বন্ধ, আর কোন অবস্থায় গোনা হবে না।

| মেট্রিক | ঘড়ি চালু | ঘড়ি বন্ধ | গোনা হবে না |
| --- | --- | --- | --- |
| **VST** (video start time) | প্লে করার ইচ্ছা: ইউজারের ক্লিক, বা অটোপ্লের চেষ্টা | প্রথম ফ্রেম স্ক্রিনে | প্রি-রোল অ্যাড আলাদা মাপুন; একসাথে মেশালে কোনো দলই কিছু ঠিক করতে পারে না |
| **VSF** (video start failure) | প্লে করার ইচ্ছা | প্রথম ফ্রেমের আগেই এরর | ইউজার নিজে চলে গেলে সেটা VSF নয়, EBVS |
| **EBVS** (exit before video start) | প্লে করার ইচ্ছা | এরর ছাড়াই প্রথম ফ্রেমের আগে সেশন শেষ | যে সেশনে এরর হয়েছে |
| **রিবাফার** | প্রথম ফ্রেমের পরে `waiting`, যখন প্লেয়ার চলছিল | পরের `playing` | seek-এর পরের `waiting`, pause অবস্থা, প্রথম ফ্রেমের আগের অপেক্ষা |
| **রিবাফার রেশিও** | — | — | মোট রিবাফার সময় ভাগ (দেখার সময় + রিবাফার সময়) |
| **রেন্ডিশন সুইচ** | স্ক্রিনে থাকা রেন্ডিশন বদলানো | — | ডাউনলোড হওয়া রেন্ডিশন বদলানো; ওটা স্ক্রিনে আসে কয়েক সেকেন্ড পরে |
| **ড্রপড ফ্রেম** | `getVideoPlaybackQuality()` | — | মোট ফ্রেমের অনুপাত হিসেবে দেখুন, একা সংখ্যা অর্থহীন |

তিনটা ফাঁদ বিশেষভাবে সাধারণ।

**ভুল জায়গা থেকে VST-এর ঘড়ি চালু করা।** অনেক টিম ঘড়ি চালু করে প্লেয়ার লাইব্রেরি তৈরি হওয়ার মুহূর্তে বা `loadstart` ইভেন্টে। কিন্তু ইউজার প্লে চাপার আগে পেজের JavaScript ডাউনলোড, প্লেয়ার লাইব্রেরি পার্স, API কল, এগুলোতেও সময় যায়, আর ইউজার সেই সময়টাও অপেক্ষা করছে। ঘড়ি চালু হবে **ইউজারের ইচ্ছা** থেকে: প্লে বাটনে ক্লিক, অথবা অটোপ্লে হলে যে মুহূর্তে অটোপ্লের চেষ্টা হলো। তাহলে আপনার সংখ্যা ইউজারের অভিজ্ঞতার সাথে মেলে।

**`playing` ইভেন্টকে প্রথম ফ্রেম ধরা।** `playing` মানে প্লেব্যাক শুরু হওয়ার অবস্থায় এসেছে, ফ্রেম আঁকা হয়ে গেছে এমন গ্যারান্টি নয়। `requestVideoFrameCallback` ঠিক সেই মুহূর্তে কলব্যাক দেয় যখন একটা ফ্রেম কম্পোজিশনের জন্য পাঠানো হলো। MDN অনুযায়ী এটা Baseline 2024, অর্থাৎ অক্টোবর ২০২৪ থেকে সব প্রধান ব্রাউজারের নতুন ভার্সনে আছে (২০২৬ সালের অক্টোবর অনুযায়ী; পুরনো ডিভাইসের জন্য MDN-এর কম্প্যাটিবিলিটি টেবিল দেখে নিন)। না থাকলে `playing` দিয়ে কাজ চালান, আর জেনে রাখুন সেটা কয়েক মিলিসেকেন্ড আগে ফায়ার হতে পারে।

**seek-এর অপেক্ষাকে রিবাফার গোনা।** ইউজার টাইমলাইনে টেনে নিয়ে গেলে ব্রাউজার `seeking`, তারপর প্রায়ই `waiting`, তারপর `seeked` আর `playing` দেয়। এই `waiting` নেটওয়ার্কের দোষ নয়, ইউজারের নিজের কাজ। এটা রিবাফারে ঢোকালে যে কনটেন্টে লোকে বেশি স্কিপ করে (লম্বা লেকচার, খেলার হাইলাইট), সেটাকে সবচেয়ে খারাপ দেখাবে, যদিও নেটওয়ার্কে কোনো সমস্যা নেই।

## একটা টেস্ট করা ট্র্যাকার

নিচের ক্লাসটা যেকোনো প্লেয়ারের সাথে চলে, কারণ এটা শুধু `video` এলিমেন্টের ইভেন্ট শোনে। প্লেয়ার লাইব্রেরি থেকে শুধু একটা জিনিস আলাদা করে খাওয়াতে হয়: কোন রেন্ডিশন স্ক্রিনে আছে। মূল ধারণা হলো একটা ছোট **স্টেট মেশিন**: প্লেয়ার যেকোনো মুহূর্তে একটা অবস্থায় থাকে (`starting`, `playing`, `rebuffering`, `seeking`, `paused`…), আর অবস্থা বদলানোর সময় আগের অবস্থার সময়টা ঠিক খাতায় যোগ হয়।

```typescript
type Phase = 'idle' | 'starting' | 'playing' | 'paused' | 'seeking' | 'rebuffering' | 'ended' | 'failed';

export type QoeEvent = {
	sid: string;
	seq: number;
	type: 'start' | 'heartbeat' | 'end';
	at: number; // ms since play intent
	vstMs: number | null; // video start time, null until first frame
	playMs: number;
	rebufferMs: number;
	rebufferCount: number;
	switches: number;
	bitrate: number; // bps of the rendition on screen
	height: number;
	dropped: number;
	total: number;
	error: string | null;
};

export class QoeTracker {
	private sid = crypto.randomUUID();
	private seq = 0;
	private phase: Phase = 'idle';
	private intentAt = 0;
	private since = 0; // when the current phase began
	private vst: number | null = null;
	private playMs = 0;
	private rebufferMs = 0;
	private rebufferCount = 0;
	private switches = 0;
	private bitrate = 0;
	private error: string | null = null;
	private timer = 0;
	private ended = false;
	private off: Array<() => void> = [];

	constructor(private video: HTMLVideoElement, private endpoint: string, private heartbeatMs = 30_000) {
		this.on(video, 'playing', () => this.onPlaying());
		this.on(video, 'waiting', () => {
			// waiting during a seek or before the first frame is not a rebuffer
			if (this.phase === 'playing') { this.enter('rebuffering'); this.rebufferCount++; }
		});
		this.on(video, 'seeking', () => { if (this.vst !== null) this.enter('seeking'); });
		this.on(video, 'pause', () => { if (this.phase === 'playing') this.enter('paused'); });
		this.on(video, 'ended', () => { this.enter('ended'); this.send('end'); });
		this.on(video, 'error', () => {
			this.error = `media:${video.error?.code ?? 0}`;
			this.enter('failed');
			this.send('end');
		});
		this.on(document, 'visibilitychange', () => {
			// hidden is not the end (the tab may come back), but it may be the last chance to send
			if (document.visibilityState === 'hidden') this.send('heartbeat');
		});
	}

	// Call when the user presses play (or autoplay is attempted): the VST clock starts here.
	intent(): void {
		if (this.phase !== 'idle') return;
		this.intentAt = this.since = performance.now();
		this.phase = 'starting';
		this.send('start');
		this.timer = setInterval(() => this.send('heartbeat'), this.heartbeatMs);
	}

	// Feed from the player library, e.g. hls.js FRAG_CHANGED.
	rendition(bitrate: number): void {
		if (this.bitrate && bitrate !== this.bitrate) this.switches++;
		this.bitrate = bitrate;
	}

	fail(code: string): void {
		this.error = code;
		this.enter('failed');
		this.send('end');
	}

	destroy(): void {
		this.send('end');
		clearInterval(this.timer);
		this.off.forEach((f) => f());
	}

	private onPlaying(): void {
		if (this.vst === null && this.phase === 'starting') {
			// first frame on screen: rVFC is exact where it exists, 'playing' is the fallback
			if ('requestVideoFrameCallback' in this.video) {
				this.video.requestVideoFrameCallback(() => { this.vst = performance.now() - this.intentAt; this.enter('playing'); });
				return;
			}
			this.vst = performance.now() - this.intentAt;
		}
		this.enter('playing');
	}

	private enter(next: Phase): void {
		const now = performance.now();
		if (this.phase === 'playing') this.playMs += now - this.since;
		if (this.phase === 'rebuffering') this.rebufferMs += now - this.since;
		this.phase = next;
		this.since = now;
	}

	private snapshot(type: QoeEvent['type']): QoeEvent {
		this.enter(this.phase); // close the open interval so totals are current
		const q = this.video.getVideoPlaybackQuality();
		return {
			sid: this.sid, seq: this.seq++, type,
			at: Math.round(performance.now() - this.intentAt),
			vstMs: this.vst === null ? null : Math.round(this.vst),
			playMs: Math.round(this.playMs), rebufferMs: Math.round(this.rebufferMs),
			rebufferCount: this.rebufferCount, switches: this.switches,
			bitrate: this.bitrate, height: this.video.videoHeight,
			dropped: q.droppedVideoFrames, total: q.totalVideoFrames,
			error: this.error
		};
	}

	private send(type: QoeEvent['type']): void {
		if (this.phase === 'idle' || this.ended) return;
		if (type === 'end') { this.ended = true; clearInterval(this.timer); }
		const body = JSON.stringify(this.snapshot(type));
		// sendBeacon survives the page going away; fetch keepalive is the fallback
		if (!navigator.sendBeacon(this.endpoint, new Blob([body], { type: 'application/json' }))) {
			fetch(this.endpoint, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
		}
	}

	private on(t: EventTarget, ev: string, fn: () => void): void {
		t.addEventListener(ev, fn);
		this.off.push(() => t.removeEventListener(ev, fn));
	}
}
```

hls.js-এর সাথে জোড়া লাগাতে তিন লাইন যথেষ্ট: প্লে বাটনে `intent()`, স্ক্রিনে রেন্ডিশন বদলালে `rendition()`, আর হাল-ছেড়ে-দেওয়া এরর হলে `fail()`। রেন্ডিশনের জন্য `LEVEL_SWITCHED` নয়, `FRAG_CHANGED` শুনুন: hls.js-এর ডকস অনুযায়ী এটা ফায়ার করে যখন প্লেহেডের নিচের ফ্র্যাগমেন্ট বদলায়, অর্থাৎ যা আসলে স্ক্রিনে।

```typescript
const qoe = new QoeTracker(video, '/qoe');
playButton.addEventListener('click', () => { qoe.intent(); video.play(); });
// FRAG_CHANGED fires when the fragment under the playhead changes: what is on screen
hls.on(Hls.Events.FRAG_CHANGED, (_e, d) => qoe.rendition(hls.levels[d.frag.level].bitrate));
hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) qoe.fail(`hls:${d.details}`); });
```

এই ক্লাসটা চ্যাপ্টার ১২-এর ছোট প্লেয়ারের সাথে একটা হেডলেস Chrome-এ চালিয়ে পরীক্ষা করা হয়েছে: ৩০ সেকেন্ডের টেস্ট ভিডিও, ২ সেকেন্ডের heartbeat, প্লে শুরুর ৩ সেকেন্ড পর বাফারের ভেতরে একটা seek, তারপর `destroy()`। আসল আউটপুট (beacon-এর বডি, ছোট করে):

```text
{"seq":0,"type":"start","at":1,"vstMs":null,"playMs":0,"rebufferMs":0,"rebufferCount":0,"height":0,"total":0}
{"seq":1,"type":"heartbeat","at":2005,"vstMs":406,"playMs":1599,"rebufferMs":0,"rebufferCount":0,"height":360,"total":53}
{"seq":2,"type":"heartbeat","at":4005,"vstMs":406,"playMs":3577,"rebufferMs":0,"rebufferCount":0,"height":720,"total":116}
{"seq":3,"type":"end","at":5533,"vstMs":406,"playMs":5105,"rebufferMs":0,"rebufferCount":0,"height":720,"total":162}
```

লক্ষ করুন: seek-এর অপেক্ষা `rebufferCount`-এ ঢোকেনি, আর `height` 360 থেকে 720-এ উঠেছে, অর্থাৎ ABR উপরের রেন্ডিশনে গেছে। লোকালহোস্টে ব্যান্ডউইথ প্রায় অসীম, তাই VST এখানে ৪০৬ মিলিসেকেন্ড; বাস্তব নেটওয়ার্কে এটা আলাদা হবে।

<Callout type="warning">

**`application/json` টাইপের beacon ক্রস-অরিজিনে ঝামেলা করে।** এটা CORS-safelisted কন্টেন্ট টাইপ নয়, তাই অন্য ডোমেইনে পাঠালে ব্রাউজার preflight চায় বা beacon পাঠাতেই অস্বীকার করতে পারে। সবচেয়ে সহজ সমাধান: collector-কে একই অরিজিনে রাখুন (`/qoe` পাথ, রিভার্স প্রক্সি দিয়ে আসল সার্ভিসে পাঠান)। তাহলে এড-ব্লকারও সাধারণত এটাকে থার্ড-পার্টি ট্র্যাকার ভেবে আটকায় না, আর ডেটা আপনার নিজের সার্ভারেই থাকে।

</Callout>

## সেশন ইভেন্ট মডেল

ট্র্যাকারটা তিন ধরনের ইভেন্ট পাঠায়, আর প্রতিটায় **পুরো সারাংশ** থাকে, শুধু শেষ পরিবর্তন নয়। এটা ইচ্ছাকৃত।

- **`start`** প্লে করার ইচ্ছার মুহূর্তে। এটা না পৌঁছালে সেশনটার অস্তিত্বই জানা যায় না, আর EBVS মাপা অসম্ভব।
- **`heartbeat`** নির্দিষ্ট বিরতিতে (সাধারণত ১০–৬০ সেকেন্ড), আর পেজ লুকানোর মুহূর্তে।
- **`end`** ভিডিও শেষ হলে, এরর হলে, বা প্লেয়ার ধ্বংস হলে।

**প্রতিটা ইভেন্ট পুরো সারাংশ বহন করে বলে** যেকোনো ইভেন্ট হারালেও ক্ষতি সীমিত: পরের ইভেন্টে মোট সংখ্যা ঠিক হয়ে যায়। "এইমাত্র ২০০ মিলিসেকেন্ড রিবাফার হলো" ধরনের ডেল্টা পাঠালে একটা হারানো রিকোয়েস্ট মানে চিরকালের ভুল। আর `seq` নম্বর থাকায় সার্ভার একই ইভেন্ট দুবার পেলে (রিট্রাই, নেটওয়ার্কের পুনরাবৃত্তি) সহজে বাদ দিতে পারে: `(sid, seq)` প্রাইমারি কী।

**সেশন কখন শেষ, সেটা সার্ভার ঠিক করে, প্লেয়ার না।** মোবাইলে ইউজার অ্যাপ সুইচ করে পরে ব্রাউজার বন্ধ করলে কোনো `end` আসে না। MDN-এর পরামর্শ অনুযায়ী শেষ ডেটা পাঠানোর সবচেয়ে নির্ভরযোগ্য মুহূর্ত হলো `visibilitychange` ইভেন্টে `hidden` অবস্থা; `unload` আর `beforeunload` মোবাইলে প্রায়ই ফায়ার করে না আর back/forward cache ভেঙে দেয়, আর `pagehide`-এরও একই নির্ভরযোগ্যতার সমস্যা আছে। তাই ট্র্যাকার লুকানোর সময় একটা heartbeat পাঠায় (`end` নয়, কারণ ইউজার ফিরে আসতে পারে), আর সার্ভার ধরে নেয় যে সেশন থেকে দুটো heartbeat-এর সময় ধরে কিছু আসেনি, সেটা শেষ।

`sendBeacon`-এর একটা সীমা আছে: MDN অনুযায়ী কিউতে থাকা মোট ডেটা ৬৪ KiB পর্যন্ত। একটা সারাংশ ইভেন্ট কয়েকশো বাইট, তাই সমস্যা হয় না; কিন্তু প্রতিটা সেগমেন্টের বিস্তারিত লগ এভাবে পাঠাতে গেলে `sendBeacon` চুপচাপ `false` দেবে। কোড সেই অবস্থায় `fetch` + `keepalive`-এ পড়ে যায়।

<Mermaid
title="প্লেয়ার থেকে ড্যাশবোর্ড পর্যন্ত"
code={`graph LR
  P["Player + QoeTracker"] -->|"start / heartbeat / end"| C["/qoe on own origin"]
  P -->|"segment requests + CMCD sid"| E["CDN edge"]
  C --> DB["PostgreSQL or ClickHouse: qoe_events"]
  E -->|"access logs with sid"| DB
  DB --> S["sessions view: last event per sid"]
  S --> D["Dashboard: percentiles, ratio of sums, by CDN / country / device"]`}
/>

## সার্ভারে: সেশন থেকে সংখ্যা

collector কীভাবে ইভেন্ট নেয় আর জমা করে সেটা [ভিডিও ট্র্যাকের চ্যাপ্টার ১০](/notes/video/10-quality-and-monitoring)-এ আছে। এখানে শুধু টেবিল আর সেই কুয়েরিগুলো, যেখানে ভুল করা সবচেয়ে সহজ। PostgreSQL দিয়ে দেখানো হলো; লাখো সেশনে গেলে ClickHouse একই SQL প্রায় হুবহু চালায়।

```sql
CREATE TABLE qoe_events (
  sid            uuid        NOT NULL,
  seq            int         NOT NULL,
  type           text        NOT NULL,
  vst_ms         int,
  play_ms        int         NOT NULL,
  rebuffer_ms    int         NOT NULL,
  rebuffer_count int         NOT NULL,
  switches       int         NOT NULL,
  height         int         NOT NULL,
  dropped        int         NOT NULL,
  total          int         NOT NULL,
  error          text,
  cdn            text,       -- added by the collector from request context
  country        text,
  received_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sid, seq)      -- duplicate beacons are dropped with ON CONFLICT DO NOTHING
);

-- one row per session: its latest snapshot
CREATE VIEW sessions AS
SELECT DISTINCT ON (sid) *
FROM qoe_events
ORDER BY sid, seq DESC;
```

এখন চারটা প্রধান সংখ্যা। লক্ষ করুন কোনটা কোন সেশন থেকে আসে।

```sql
-- finished sessions only: nothing heard for 2 minutes
WITH s AS (
  SELECT * FROM sessions WHERE received_at < now() - interval '2 minutes'
)
SELECT
  count(*)                                                        AS attempts,
  -- VST percentiles over sessions that actually started
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY vst_ms)            AS vst_p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY vst_ms)            AS vst_p95,
  -- failures and exits are shares of ALL attempts, not of started sessions
  avg((vst_ms IS NULL AND error IS NOT NULL)::int)                AS vsf_rate,
  avg((vst_ms IS NULL AND error IS NULL)::int)                    AS ebvs_rate,
  -- ratio of sums, not average of per-session ratios
  sum(rebuffer_ms)::float / nullif(sum(play_ms + rebuffer_ms), 0) AS rebuffer_ratio,
  sum(dropped)::float / nullif(sum(total), 0)                     AS dropped_frame_ratio
FROM s;
```

`percentile_cont` NULL মান বাদ দেয়, তাই VST স্বাভাবিকভাবেই শুধু শুরু হওয়া সেশনের উপর হয়। কিন্তু VSF আর EBVS **সব চেষ্টার** উপর, কারণ যারা শুরুই করতে পারেনি, তারাই এখানে আসল খবর।

<Callout type="danger">

**অনুপাতের গড় আর গড়ের অনুপাত আলাদা সংখ্যা।** ধরুন একজন ১০ সেকেন্ড দেখে চলে গেল, যার ৫ সেকেন্ড আটকে ছিল (৫০%), আর আরেকজন এক ঘণ্টা দেখল একটাও আটকানো ছাড়া (০%)। প্রতি সেশনের অনুপাতের গড় বলে ২৫%, যা দেখে মনে হয় সার্ভিস ভয়ংকর। মোট আটকে থাকা সময় ভাগ মোট সময় বলে ০.১৪%। দুটোই "সঠিক", কিন্তু প্রশ্ন আলাদা: প্রথমটা "গড় সেশন কেমন ছিল", দ্বিতীয়টা "দেখা সময়ের কত ভাগ নষ্ট হলো"। ড্যাশবোর্ডে কোনটা দেখাচ্ছেন সেটা লেবেলে লিখুন, আর দুটোকে কখনো এক গ্রাফে মেশাবেন না।

</Callout>

**গড় নয়, পার্সেন্টাইল।** VST-এর গড় একটা ৪০ সেকেন্ডের সেশন দিয়ে লাফিয়ে ওঠে, আবার ১০০০টা দ্রুত সেশনের পেছনে খারাপ অভিজ্ঞতা লুকিয়ে ফেলে। p50 বলে সাধারণ ইউজার কেমন আছে, p95 বলে খারাপ দিকের প্রতি বিশজনে একজন কেমন আছে। SLO সাধারণত p95 বা p90-এর উপর লেখা হয়।

**ভাগ করে দেখুন।** একটা মোট সংখ্যা প্রায় কখনো কাজের নয়। একই কুয়েরি `GROUP BY cdn`, `country`, প্লেয়ার ভার্সন, ডিভাইস শ্রেণি ধরে চালান। "VST p95 বেড়েছে" কোনো কাজ দেয় না; "বাংলাদেশে মোবাইল ডেটায়, CDN B-তে, গতকাল থেকে VST p95 দ্বিগুণ" দিয়ে কাজ শুরু করা যায়।

## CMCD: প্লেয়ার আর CDN-কে এক সুতোয় বাঁধা

প্লেয়ারের বিকনগুলো বলে **কী** হয়েছে ("সেশন X-এ ১৮:০২-এ রিবাফার")। CDN-এর লগ বলে **কেন** হতে পারে ("ওই সেগমেন্ট MISS ছিল, origin থেকে আনতে ৩ সেকেন্ড")। কিন্তু দুটোকে জোড়া লাগানোর মতো কোনো সাধারণ চাবি না থাকলে আপনি শুধু সময় আর IP মিলিয়ে আন্দাজ করবেন, যা NAT-এর পেছনে হাজার ইউজারের দেশে কাজ করে না।

**CMCD** (Common Media Client Data, CTA-5004) সেই চাবি। প্লেয়ার প্রতিটা ম্যানিফেস্ট আর সেগমেন্ট রিকোয়েস্টের সাথে কয়েকটা ছোট কী-ভ্যালু পাঠায়, হয় query string-এ (`CMCD=` প্যারামিটার) নয়তো চারটা হেডারে। নিচের তালিকা SVTA-র Common Media Library-র সোর্স থেকে যাচাই করা (২০২৬ সালের অক্টোবর অনুযায়ী; চূড়ান্ত সংজ্ঞার জন্য CTA-5004 স্পেক দেখুন)।

| কী | অর্থ | হেডার |
| --- | --- | --- |
| `sid` | সেশন আইডি; প্লেয়ারের বিকনের `sid`-এর সাথে একই রাখুন | `CMCD-Session` |
| `cid` | কনটেন্ট আইডি | `CMCD-Session` |
| `sf` | স্ট্রিমিং ফরম্যাট (`h` = HLS, `d` = DASH) | `CMCD-Session` |
| `st` | স্ট্রিম টাইপ (`v` = VOD, `l` = লাইভ) | `CMCD-Session` |
| `v` | CMCD ভার্সন | `CMCD-Session` |
| `br` | এই অবজেক্টের এনকোডেড বিটরেট (kbps) | `CMCD-Object` |
| `d` | অবজেক্টের দৈর্ঘ্য (ms) | `CMCD-Object` |
| `ot` | অবজেক্ট টাইপ: `m` ম্যানিফেস্ট, `v` ভিডিও, `a` অডিও, `av` মাক্সড, `i` init, `tt` টাইমড টেক্সট, `k` কী | `CMCD-Object` |
| `tb` | এই ট্র্যাকের সবচেয়ে উঁচু বিটরেট | `CMCD-Object` |
| `bl` | বাফার লেংথ (ms) | `CMCD-Request` |
| `dl` | ডেডলাইন: এই অবজেক্ট না এলে কত ms পরে বাফার ফুরাবে | `CMCD-Request` |
| `mtp` | প্লেয়ারের মাপা থ্রুপুট (kbps) | `CMCD-Request` |
| `nor` | পরের অবজেক্টের পাথ (CDN আগেভাগে আনতে পারে) | `CMCD-Request` |
| `su` | স্টার্টআপ বা seek-এর পর জরুরি রিকোয়েস্ট | `CMCD-Request` |
| `bs` | বাফার খালি হয়ে গিয়েছিল | `CMCD-Status` |
| `rtp` | প্লেয়ার যত থ্রুপুট চায় | `CMCD-Status` |

একটা সেগমেন্ট রিকোয়েস্ট query মোডে এমন দেখায় (উদাহরণ):

```text
GET /v/42/v1/seg_007.m4s?CMCD=bl%3D11800%2Cbr%3D2500%2Cd%3D4000%2Cmtp%3D18400%2Cot%3Dav%2Csf%3Dh%2Csid%3D%2245f4227c-19cb-4bae-b6a9-65cc3c83338c%22%2Cst%3Dv
```

দুটো মোডের প্রতিটার একটা দাম আছে, আর দুটোই CDN-এর দিক থেকে চোখে পড়ে না এমন ক্ষতি করতে পারে।

- **Query মোড ক্যাশ কী ভাঙতে পারে।** প্রতিটা ইউজারের `sid` আলাদা, তাই CDN যদি পুরো query string ক্যাশ কী-তে রাখে, প্রতিটা ইউজারের প্রতিটা সেগমেন্ট আলাদা অবজেক্ট হয়ে যায়, আর হিট রেশিও প্রায় শূন্যে নামে। CDN-এ `CMCD` প্যারামিটারকে ক্যাশ কী থেকে বাদ দিতে হবে ([CDN ট্র্যাকের ক্যাশ কী চ্যাপ্টার](/notes/cdn/04-cache-keys))।
- **হেডার মোড CORS preflight ডাকে।** `CMCD-*` কাস্টম হেডার, তাই সেগমেন্ট যদি পেজের থেকে আলাদা অরিজিনে থাকে (প্রায় সবসময় তাই), ব্রাউজার প্রতিটা নতুন URL-এ আগে একটা `OPTIONS` রিকোয়েস্ট পাঠাবে। CDN-কে `Access-Control-Allow-Headers`-এ এই চারটা হেডার দিতে হবে, আর preflight-এর ক্যাশিং (`Access-Control-Max-Age`) ঠিক না থাকলে স্টার্টআপে একটা পুরো রাউন্ড ট্রিপ বাড়ে।

hls.js আর Shaka দুটোতেই CMCD একটা কনফিগে চালু হয় (দুটোই ২০২৬ সালের অক্টোবরে তাদের নিজস্ব ডকস আর সোর্স থেকে যাচাই করা)।

```typescript
// hls.js: CMCD is on when the cmcd object is present; query mode by default
const hls = new Hls({
	cmcd: {
		sessionId: qoeSessionId, // the same id your beacons carry
		contentId: 'baytalhikma-lecture-42',
		useHeaders: false
	}
});

// Shaka Player: off by default
player.configure({
	cmcd: { enabled: true, sessionId: qoeSessionId, contentId: 'baytalhikma-lecture-42', useHeaders: false }
});
```

দুটো লাইব্রেরিই এখন `version: 2` সমর্থন করে (CMCD v2), যেখানে প্লেয়ার রিকোয়েস্টের সাথে ডেটা পাঠানো ছাড়াও আলাদা একটা এন্ডপয়েন্টে প্লে-স্টেট, বিটরেট বদল, এররের মতো **ইভেন্ট রিপোর্ট** পাঠাতে পারে। অর্থাৎ CMCD v2 নিজেই একটা মানসম্মত QoE বিকনের কাজ করতে পারে। নতুন সিস্টেম বানালে আগে দেখুন আপনার প্লেয়ার আর CDN কোন ভার্সন কতটা সমর্থন করে; স্পেক আর ইমপ্লিমেন্টেশন দুটোই এখনো নড়ছে।

**জোড়া লাগানোর কুয়েরি।** CDN-এর অ্যাক্সেস লগ থেকে `sid` বের করে আলাদা টেবিলে রাখুন (প্রায় সব CDN query string লগ করতে পারে; হেডার লগ করতে আলাদা কনফিগ লাগে)। তারপর একটা খারাপ সেশনের সব সেগমেন্ট:

```sql
SELECT l.ts, l.path, l.cache_status, l.ttfb_ms, l.bytes, l.pop
FROM cdn_logs l
WHERE l.sid = '45f4227c-19cb-4bae-b6a9-65cc3c83338c'
ORDER BY l.ts;
```

রিবাফারের ঠিক আগের সেগমেন্টগুলোতে যদি `MISS` আর বড় `ttfb_ms` দেখেন, সমস্যা origin বা shield-এ; যদি `HIT` কিন্তু ধীর ডাউনলোড, সমস্যা শেষ মাইলে বা ওই PoP-এ।

## Media Capabilities: মাপার আগে জিজ্ঞেস করা

ড্রপড ফ্রেম বেশি হওয়ার সবচেয়ে সাধারণ কারণ হলো ডিভাইস ওই রেজোলিউশন আর ফ্রেম রেট মসৃণভাবে ডিকোড করতে পারে না, যদিও "সমর্থন করে"। `MediaSource.isTypeSupported` শুধু বলে কোডেক চেনে কিনা। **Media Capabilities API** বলে আরও তিনটা জিনিস: চলবে কিনা (`supported`), ফ্রেম না ফেলে চলবে কিনা (`smooth`), আর ব্যাটারি বাঁচিয়ে চলবে কিনা (`powerEfficient`, সাধারণত হার্ডওয়্যার ডিকোডারের ইঙ্গিত)। MDN অনুযায়ী এটা জানুয়ারি ২০২০ থেকে Baseline।

এটা দিয়ে ABR শুরুর আগেই ল্যাডার থেকে সেই রেন্ডিশনগুলো বাদ দেওয়া যায় যেগুলো এই ডিভাইসে ফ্রেম ফেলবে:

```typescript
async function playableRungs(levels: { width: number; height: number; bitrate: number; codecs: string; fps: number }[]) {
	const checks = await Promise.all(levels.map((l) =>
		navigator.mediaCapabilities.decodingInfo({
			type: 'media-source',
			video: { contentType: `video/mp4; codecs="${l.codecs}"`, width: l.width, height: l.height, bitrate: l.bitrate, framerate: l.fps }
		})
	));
	// keep smooth rungs; never drop to zero, the lowest rung is always allowed
	const ok = levels.filter((_, i) => checks[i].supported && checks[i].smooth);
	return ok.length ? ok : levels.slice(0, 1);
}
```

একটা সতর্কতা: MDN বলে ডিভাইসে প্লেব্যাকের ইতিহাস জমার আগে ব্রাউজার সমর্থিত সব কনফিগকে `smooth` আর `powerEfficient` বলে দেয়। অর্থাৎ নতুন ডিভাইসে এই উত্তর আশাবাদী। তাই এটাকে প্রথম ছাঁকনি ধরুন, আর ড্রপড-ফ্রেম অনুপাত দিয়ে আসল প্রমাণ দেখুন।

## ড্যাশবোর্ডে কী রাখবেন

| প্যানেল | কুয়েরির আকার | কেন |
| --- | --- | --- |
| VST p50 / p95, সময় ধরে | শুরু হওয়া সেশন | স্টার্টআপ খারাপ হচ্ছে কিনা |
| VSF আর EBVS হার | সব চেষ্টা | শুরুই না হওয়া, যা অন্য সব প্যানেলে অদৃশ্য |
| রিবাফার রেশিও (ratio of sums) | সব দেখার সময় | নষ্ট হওয়া দেখার সময় |
| রিবাফার হয়েছে এমন সেশনের অংশ | সব শুরু হওয়া সেশন | কতজন ইউজার অন্তত একবার আটকেছে |
| স্ক্রিনে থাকা উচ্চতার বণ্টন, সময়-ভারিত | দেখার সময় | গড় বিটরেট যা লুকায় |
| এরর, কোড ধরে | এরর সেশন | কোন দল ঠিক করবে |
| উপরের সব, `cdn` / `country` / `device` ধরে | — | কোথায় |

প্রতিটা নতুন প্লেয়ার ভার্সন রিলিজের পর প্রথম কয়েক ঘণ্টা `GROUP BY player_version` দিয়ে পুরনো আর নতুন পাশাপাশি দেখুন। প্লেয়ারের রিগ্রেশন প্রায় সবসময় প্রথমে VST p95 বা VSF-এ দেখা দেয়।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | কীভাবে নিশ্চিত হবেন | সমাধান |
| --- | --- | --- |
| VST সন্দেহজনকভাবে কম (যেমন ১০০ ms), কিন্তু ইউজাররা ধীর বলছে | কোডে খুঁজুন ঘড়ি কোথায় চালু হয়; ক্লিক থেকে `playing` পর্যন্ত DevTools Performance রেকর্ড করুন | ঘড়ি প্লে করার ইচ্ছা থেকে চালু করুন, লাইব্রেরির `loadstart` থেকে নয় |
| EBVS প্রায় শূন্য, যা অসম্ভব রকম ভালো | মোবাইলে প্লে চাপুন, প্রথম ফ্রেমের আগে অ্যাপ সুইচ করুন; সার্ভারে `start` আছে কিনা দেখুন | `start` ইভেন্ট প্লে-র ইচ্ছার মুহূর্তেই পাঠান; শেষ ধরার জন্য `visibilitychange` ব্যবহার করুন, `unload` নয় |
| লম্বা লেকচারে রিবাফার রেশিও অনেক বেশি, নেটওয়ার্ক ঠিক আছে | একটা সেশনের ইভেন্ট দেখুন: `rebufferCount` seek-এর সময় বাড়ছে কিনা | `seeking` অবস্থায় আসা `waiting` বাদ দিন |
| একই সেশন দুবার গোনা হচ্ছে | `sid, seq` ধরে গ্রুপ করে গুনুন, একটার বেশি সারি আছে কিনা | `(sid, seq)` প্রাইমারি কী আর `ON CONFLICT DO NOTHING` |
| ক্রস-অরিজিন beacon পৌঁছায় না, কোনো এররও নেই | DevTools Network-এ beacon রিকোয়েস্ট দেখুন; `sendBeacon` `false` দিচ্ছে কিনা লগ করুন | collector-কে একই অরিজিনে আনুন, অথবা `text/plain` টাইপ ব্যবহার করুন |
| CMCD চালুর পর CDN হিট রেশিও ধসে পড়েছে | একটা সেগমেন্ট দুবার আনুন, `Age` আর ক্যাশ স্ট্যাটাস হেডার দেখুন ([CDN প্লেবুক](/notes/cdn/14-debugging-playbook)) | `CMCD` প্যারামিটারকে ক্যাশ কী থেকে বাদ দিন |
| CMCD হেডার মোডে স্টার্টআপ ধীর | Network প্যানেলে প্রতিটা সেগমেন্টের আগে `OPTIONS` আছে কিনা | query মোডে যান, অথবা CDN-এ preflight ক্যাশিং ঠিক করুন |
| Safari-তে স্ক্রিনের রেন্ডিশন অজানা | নেটিভ HLS-এ লাইব্রেরির লেভেল ইভেন্ট নেই | `resize` ইভেন্টে `videoWidth`/`videoHeight` পড়ুন; বিটরেটের জায়গায় উচ্চতা দেখান |
| ড্রপড ফ্রেম অনুপাত এক ধরনের ডিভাইসে খুব বেশি | ডিভাইস ধরে ভাগ করুন; ওই ডিভাইসে `decodingInfo` কী বলে দেখুন | ওই ডিভাইসে উঁচু রেন্ডিশন বাদ দিন বা ক্যাপ করুন |

## মূল শিক্ষা

1. **মেট্রিকের নাম যথেষ্ট নয়, সংজ্ঞা লিখে রাখুন:** ঘড়ি কখন চালু, কখন বন্ধ, কোন অবস্থা বাদ।
2. **VST-এর ঘড়ি চালু হয় ইউজারের ইচ্ছা থেকে**, আর বন্ধ হয় প্রথম আঁকা ফ্রেমে (`requestVideoFrameCallback`, না থাকলে `playing`)।
3. **seek, pause আর প্রথম ফ্রেমের আগের অপেক্ষা রিবাফার নয়।** একটা ছোট স্টেট মেশিন এই নিয়মগুলো এক জায়গায় রাখে।
4. **প্রতিটা ইভেন্টে পুরো সারাংশ আর `seq` পাঠান**, যাতে হারানো বা দ্বিগুণ ইভেন্টে ক্ষতি না হয়; সেশন শেষ সার্ভার ঠিক করে।
5. **শেষ ডেটা পাঠান `visibilitychange`-এ**, `sendBeacon` দিয়ে, ৬৪ KiB-এর মধ্যে; collector নিজের অরিজিনে রাখুন।
6. **VSF আর EBVS সব চেষ্টার উপর মাপুন**, শুধু শুরু হওয়া সেশনের উপর নয়।
7. **রিবাফার রেশিও ratio of sums, আর সময়ের মেট্রিকে গড় নয়, পার্সেন্টাইল।**
8. **CMCD-এর `sid` প্লেয়ার আর CDN লগকে জোড়া লাগায়**; query মোডে ক্যাশ কী আর হেডার মোডে CORS preflight সামলাতে হয়।
9. **Media Capabilities প্রথম ছাঁকনি, ড্রপড-ফ্রেম অনুপাত আসল প্রমাণ।**
