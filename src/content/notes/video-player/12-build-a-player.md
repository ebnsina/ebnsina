---
title: 'শূন্য থেকে একটা প্লেয়ার'
subtitle: 'কোনো লাইব্রেরি ছাড়া, শুধু Media Source Extensions দিয়ে HLS fMP4 চালানো — প্লেলিস্ট পার্সার, append কিউ, বাফার গোল, ABR, রেন্ডিশন বদল, seek, লাইভ রিফ্রেশ, রিট্রাই। প্রতিটা অংশ আসল ব্রাউজারে চালিয়ে পরীক্ষা করা।'
chapter: 12
level: 'mastery'
readingTime: '৩০ মিনিট'
topics: ['mse', 'hls', 'fmp4', 'sourcebuffer', 'abr', 'player from scratch', 'typescript']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

নারায়ণগঞ্জে শীতলক্ষ্যার পাড়ে খোয়ারিজমির নৌকা বানানোর ঘাট। একজন মহাজন অর্ডার দিয়ে গেছেন একটা মাঝারি সাইজের নৌকা, সাথে একটা নকশা: কত হাত লম্বা, কোথায় কত চওড়া, কোন কাঠ। নকশার এক কোণে লেখা, "কাঠ কম পড়লে পাতলা তক্তা চলবে, ভালো সময়ে মোটা।" খোয়ারিজমি প্রথমে নকশা খুলে মাপগুলো পড়েন, তারপর নৌকার মেরুদণ্ড, মানে লম্বা গলুইয়ের কাঠটা বসান। এর উপরেই বাকি সব দাঁড়াবে।

তারপর তক্তা লাগানোর পালা। কাঠ আসে নদীর ওপারের সিনার আড়ত থেকে, নৌকায় করে, একবারে কয়েকটা। খোয়ারিজমির ঘাটে মিস্ত্রি একজনই, রাজি; সে একটা তক্তা পেরেক মেরে শেষ না করে পরেরটা ধরে না, কারণ দুইটা একসাথে ধরলে একটাও ঠিক বসে না। খোয়ারিজমি নজর রাখেন পাড়ে কত তক্তা জমা আছে: বেশি জমলে আড়তে খবর পাঠান আপাতত আর না পাঠাতে, কারণ পাড়ের জায়গা সীমিত; কমে গেলে তাড়া দেন। আড়ত থেকে কাঠ আসতে কত সময় লাগছে সেটাও তিনি খেয়াল করেন। নৌকা দ্রুত এলে মোটা তক্তা আনান, দেরি হলে পাতলাতেই চালান, যাতে রাজির হাত কখনো খালি না থাকে।

মজার ব্যাপার, মহাজন চান নৌকা বানানো শেষ হওয়ার আগেই সেটা পানিতে নামুক। পেছনের দিকটা শেষ হলেই নৌকা ভাসানো হয়, আর সামনের দিকে কাজ চলতে থাকে। একদিন মহাজন বললেন, "মাঝখানের অংশটা আগে দেখতে চাই।" খোয়ারিজমি সাথে সাথে আগের পরিকল্পনা বাদ দিয়ে মাঝখানের তক্তার অর্ডার দিলেন। আরেকদিন আড়তের নৌকা মাঝনদীতে আটকে গেল; খোয়ারিজমি একবার, দুবার অপেক্ষা করে আবার লোক পাঠালেন, কিন্তু আড়ত যখন বলল "ওই কাঠ আমাদের কাছে নেই", তিনি আর লোক পাঠিয়ে সময় নষ্ট করেননি।

মিলিয়ে নিই: মহাজনের নকশা হলো **master playlist**, আর "পাতলা বা মোটা তক্তা" হলো **রেন্ডিশন**। গলুইয়ের কাঠ হলো **init segment**, যা ছাড়া কোনো তক্তা বসে না, আর তক্তাগুলো **media segment**। ঘাটের কাঠামো হলো **MediaSource**, রাজি হলো **SourceBuffer**, আর "একটা শেষ না করে পরেরটা নয়" হলো **`updateend`-এর অপেক্ষা**। পাড়ে জমা তক্তা হলো **বাফার**, "বেশি জমলে থামাও" হলো **বাফার গোল**, আর আড়ত থেকে কাঠ আসার গতি দেখে মোটা-পাতলা ঠিক করা হলো **ABR**। শেষ হওয়ার আগে পানিতে নামানো হলো **append করতে করতে প্লে করা**, মাঝখান দেখতে চাওয়া হলো **seek**, আর আটকে যাওয়া নৌকার জন্য আবার লোক পাঠানো কিন্তু "কাঠ নেই" শুনে থামা হলো **5xx-এ রিট্রাই, 4xx-এ নয়**। hls.js, Shaka বা dash.js ঠিক এই কাজটাই করে, শুধু হাজারটা কোনার ক্ষেত্র সামলে।

## কী বানাচ্ছি, কী বাদ

লক্ষ্য একটা প্লেয়ার যেটা পড়ে পুরোটা মাথায় রাখা যায়, আর যেটা আসলেই চলে। প্রায় ২৫০ লাইন TypeScript, কোনো ডিপেন্ডেন্সি নেই। আগের চ্যাপ্টারগুলোর ধারণা ([video এলিমেন্ট](/notes/video-player/02-the-video-element), [MSE](/notes/video-player/03-media-source-extensions), [বাফার ও ABR](/notes/video-player/05-buffer-and-abr)) এখানে কোডে রূপ নেয়।

| সমর্থন করে | করে না, আর কেন |
| --- | --- |
| HLS master + media playlist | DASH: একই ধারণা, আলাদা পার্সার |
| fMP4 সেগমেন্ট (`EXT-X-MAP`) | MPEG-TS: আগে transmux লাগে ([কন্টেইনার চ্যাপ্টার](/notes/video/03-containers-and-transmuxing)) |
| অডিও-ভিডিও এক সেগমেন্টে (muxed) | আলাদা অডিও গ্রুপ (`EXT-X-MEDIA`): দ্বিতীয় SourceBuffer লাগে |
| VOD আর সাধারণ লাইভ | LL-HLS-এর partial segment আর blocking reload |
| থ্রুপুট-ভিত্তিক ABR | বাফার-ভিত্তিক (BOLA) বা হাইব্রিড |
| seek, রিট্রাই, QuotaExceeded সামলানো | DRM, ক্যাপশন, ডিসকন্টিনিউটি, অ্যাড |

বাদ দেওয়া প্রতিটা জিনিস একটা আলাদা স্তর, যা এই কাঠামোর উপর বসানো যায়। মূল কাঠামো বদলায় না।

## ধাপ ০: একটা টেস্ট ভিডিও

শুরুতে এমন একটা স্ট্রিম লাগবে যেটার প্রতিটা বৈশিষ্ট্য আমরা জানি। `ffmpeg` নিজেই একটা টেস্ট প্যাটার্ন আর একটা টোন বানাতে পারে, তাই কোনো ভিডিও ফাইল লাগে না। নিচের কমান্ড ৩০ সেকেন্ডের দুইটা রেন্ডিশন (360p আর 720p) বানায়, প্রতিটা ৪ সেকেন্ডের fMP4 সেগমেন্টে, আর দুটোর কীফ্রেম একই জায়গায় (`-g 60` আর ৩০ fps মানে প্রতি ২ সেকেন্ডে কীফ্রেম; `-sc_threshold 0` দৃশ্য বদলে বাড়তি কীফ্রেম ঠেকায়)। কীফ্রেম একই জায়গায় থাকা জরুরি, কারণ রেন্ডিশন বদলাতে হয় সেগমেন্টের সীমানায় ([bitrate ladder চ্যাপ্টার](/notes/video/05-bitrate-ladder))।

```bash
ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 30 \
  -filter_complex "[0:v]split=2[a][b];[a]scale=640:360[v360];[b]null[v720]" \
  -map "[v360]" -map 1:a -map "[v720]" -map 1:a \
  -c:v libx264 -profile:v main -preset veryfast -g 60 -keyint_min 60 -sc_threshold 0 \
  -b:v:0 800k -b:v:1 2500k -c:a aac -b:a 128k -ac 2 \
  -f hls -hls_time 4 -hls_playlist_type vod -hls_segment_type fmp4 \
  -hls_segment_filename "v%v/seg_%03d.m4s" \
  -master_pl_name master.m3u8 -var_stream_map "v:0,a:0 v:1,a:1" "v%v/index.m3u8"
```

ffmpeg-এর বানানো আসল master playlist:

```text
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=960030,AVERAGE-BANDWIDTH=936163,RESOLUTION=640x360,CODECS="avc1.4d401e,mp4a.40.2"
v0/index.m3u8

#EXT-X-STREAM-INF:BANDWIDTH=2726810,AVERAGE-BANDWIDTH=2639681,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
v1/index.m3u8
```

আর একটা media playlist-এর শুরু:

```text
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MAP:URI="init_0.mp4"
#EXTINF:4.000000,
seg_000.m4s
#EXTINF:4.000000,
seg_001.m4s
```

একটা জিনিস খেয়াল করুন: দুই রেন্ডিশনের কোডেক স্ট্রিং আলাদা, `avc1.4d401e` আর `avc1.4d401f`। দুটোই H.264 Main প্রোফাইল, কিন্তু শেষের দুই অক্ষর লেভেল (3.0 আর 3.1)। ধাপ ৬-এ এটা গুরুত্বপূর্ণ হবে।

## ধাপ ১: প্লেলিস্ট পার্সার

HLS স্পেক (RFC 8216) বিশাল, কিন্তু একটা প্লেয়ার চালাতে তার সামান্য অংশ লাগে। master playlist থেকে লাগে প্রতিটা `EXT-X-STREAM-INF`-এর `BANDWIDTH`, `CODECS`, `RESOLUTION` আর পরের লাইনের URI। media playlist থেকে লাগে `EXT-X-TARGETDURATION` (লাইভে কত ঘনঘন রিফ্রেশ), `EXT-X-MEDIA-SEQUENCE` (প্রথম সেগমেন্টের নম্বর), `EXT-X-MAP` (init segment), প্রতিটা `EXTINF` আর তার URI, আর `EXT-X-ENDLIST` (এটা থাকলে VOD বা শেষ হওয়া লাইভ)।

দুটো নিয়ম পার্সারকে নিরাপদ রাখে। **URI সবসময় প্লেলিস্টের নিজের URL-এর সাপেক্ষে**, পেজের নয়; `new URL(uri, base)` সেটা ঠিকমতো করে, আপেক্ষিক আর পূর্ণ দুই ধরনের URI-তে। আর **attribute-এর মানে কমা থাকতে পারে** (যেমন `CODECS="avc1.4d401e,mp4a.40.2"`), তাই কমা দিয়ে কাটা যায় না; উদ্ধৃতিচিহ্নের ভেতরটা আলাদা ধরতে হয়।

```typescript
export type Variant = { uri: string; bandwidth: number; codecs: string; resolution?: string };
export type Segment = { uri: string; duration: number; seq: number; start: number };
export type MediaPlaylist = {
	initUri: string;
	segments: Segment[];
	targetDuration: number;
	endList: boolean;
};

const ATTR = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;

export function parseAttrs(line: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [, k, v] of line.matchAll(ATTR)) out[k] = v.replace(/^"|"$/g, '');
	return out;
}

export function parseMaster(text: string, base: string): Variant[] {
	const lines = text.split(/\r?\n/).map((l) => l.trim());
	const variants: Variant[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;
		const a = parseAttrs(lines[i].slice('#EXT-X-STREAM-INF:'.length));
		const uri = lines.slice(i + 1).find((l) => l && !l.startsWith('#'));
		if (!uri || !a.BANDWIDTH || !a.CODECS) continue;
		variants.push({
			uri: new URL(uri, base).href,
			bandwidth: Number(a.BANDWIDTH),
			codecs: a.CODECS,
			resolution: a.RESOLUTION
		});
	}
	return variants.sort((x, y) => x.bandwidth - y.bandwidth);
}

export function parseMedia(text: string, base: string): MediaPlaylist {
	let seq = 0, start = 0, targetDuration = 0, initUri = '', endList = false;
	let pending = -1;
	const segments: Segment[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (line.startsWith('#EXT-X-TARGETDURATION:')) targetDuration = Number(line.split(':')[1]);
		else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) seq = Number(line.split(':')[1]);
		else if (line.startsWith('#EXT-X-MAP:')) initUri = new URL(parseAttrs(line.slice(11)).URI, base).href;
		else if (line.startsWith('#EXTINF:')) pending = parseFloat(line.slice(8));
		else if (line === '#EXT-X-ENDLIST') endList = true;
		else if (line && !line.startsWith('#') && pending >= 0) {
			segments.push({ uri: new URL(line, base).href, duration: pending, seq: seq++, start });
			start += pending;
			pending = -1;
		}
	}
	if (!initUri) throw new Error('playlist has no EXT-X-MAP: only fMP4 is supported');
	return { initUri, segments, targetDuration, endList };
}
```

প্রতিটা সেগমেন্টের সাথে দুইটা হিসাব রাখা হচ্ছে: `seq` (সিকোয়েন্স নম্বর, লাইভে প্লেলিস্ট সরে গেলেও যেটা দিয়ে সেগমেন্ট চেনা যায়) আর `start` (প্লেলিস্টের শুরু থেকে কত সেকেন্ডে, যা দিয়ে seek-এর সময় সেগমেন্ট খোঁজা হয়)। যে প্লেলিস্টে `EXT-X-MAP` নেই সেটা MPEG-TS, আর পার্সার সেটা চুপচাপ ভুল চালানোর বদলে স্পষ্ট এরর দেয়।

## ধাপ ২: ABR-এর নিয়ম

ABR-এর পুরো তত্ত্ব [ভিডিও ট্র্যাকের প্লেব্যাক চ্যাপ্টারে](/notes/video/07-playback-and-abr) আছে। এখানে সবচেয়ে সরল সংস্করণ, দুটো নিয়মসহ যেগুলো ছাড়া প্লেয়ার দুলতে থাকে।

```typescript
// ponytail: throughput-only ABR with a 0.7 safety factor; buffer-aware (BOLA) when it oscillates.
export function pickVariant(variants: Variant[], bps: number, bufferAhead: number, current: number): number {
	let best = 0;
	variants.forEach((v, i) => { if (v.bandwidth <= bps * 0.7) best = i; });
	if (best > current && bufferAhead < 10) return current; // only go up with a cushion
	return best;
}
```

প্রথম নিয়ম: **রেন্ডিশনের বিটরেট মাপা থ্রুপুটের ৭০%-এর নিচে হতে হবে।** মাপা থ্রুপুট শেষ কয়েকটা ডাউনলোডের গড়, আর নেটওয়ার্ক মুহূর্তে মুহূর্তে বদলায়; পুরোটা ব্যবহার করলে প্রথম ঝাঁকুনিতেই বাফার ফুরায়। দ্বিতীয় নিয়ম: **নামা তাৎক্ষণিক, ওঠা সাবধানে।** উপরে যাওয়া হয় শুধু হাতে ১০ সেকেন্ডের বেশি বাফার থাকলে, যাতে ভুল হলেও রিবাফারের আগে নেমে আসার সময় থাকে।

## ধাপ ৩: MediaSource খোলা

```typescript
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MiniPlayer {
	private ms = new MediaSource();
	private sb?: SourceBuffer;
	private variants: Variant[] = [];
	private current = 0;
	private playlist!: MediaPlaylist;
	private nextSeq = 0;
	private initFor = -1;
	private bps = 0;
	private stopped = false;
	private seekTo: number | null = null;
	private ctrl = new AbortController();

	constructor(private video: HTMLVideoElement, private src: string, private bufferGoal = 20) {}

	async load(): Promise<void> {
		const opened = new Promise((r) => this.ms.addEventListener('sourceopen', r, { once: true }));
		this.video.src = URL.createObjectURL(this.ms);
		await opened;
		URL.revokeObjectURL(this.video.src);

		const master = parseMaster(await this.text(this.src), this.src);
		this.variants = master.filter((v) => MediaSource.isTypeSupported(`video/mp4; codecs="${v.codecs}"`));
		if (!this.variants.length) throw new Error('no playable variant: codecs not supported here');

		this.sb = this.ms.addSourceBuffer(`video/mp4; codecs="${this.variants[0].codecs}"`);
		await this.loadPlaylist(0);
		const s = this.playlist.segments;
		// VOD: tell the element how long the video is, or duration stays Infinity and the seek bar only covers the buffer
		if (this.playlist.endList) this.ms.duration = s.reduce((sum, x) => sum + x.duration, 0);
		// live: start three segments behind the edge; VOD: from the top
		this.nextSeq = this.playlist.endList ? s[0].seq : s[Math.max(0, s.length - 3)].seq;

		this.video.addEventListener('seeking', this.onSeeking);
		this.run().catch((e) => this.fail(e));
	}
```

ক্রমটা গুরুত্বপূর্ণ। `sourceopen` লিসেনার **আগে** লাগাতে হয়, তারপর `src` সেট; উল্টো করলে দ্রুত ব্রাউজারে ইভেন্ট আগেই চলে যেতে পারে। `addSourceBuffer` কাজ করে শুধু `sourceopen`-এর পরে। আর কোডেক ছাঁকনিটা (`isTypeSupported`) এখানেই হয়, যাতে ডিভাইস যে রেন্ডিশন চালাতে পারে না সেটা ABR কখনো বেছে না নেয়। শুরু সবসময় সবচেয়ে নিচু রেন্ডিশন থেকে, কারণ শুরুতে থ্রুপুটের কোনো মাপ নেই আর ছোট সেগমেন্ট দ্রুত প্রথম ফ্রেম দেয়।

## ধাপ ৪: একবারে একটা অপারেশন

`SourceBuffer` একসাথে একটাই কাজ করতে পারে। `appendBuffer` বা `remove` ডাকার পর `updating` সত্য থাকে, আর সেই অবস্থায় আরেকটা ডাকলে ব্রাউজার `InvalidStateError` ছোড়ে। সবকিছু তাই একটা ছোট মোড়কের ভেতর দিয়ে যায়, যেটা কাজ শুরু করে `updateend` (সফল) বা `error` (ব্যর্থ) পর্যন্ত অপেক্ষা করে।

```typescript
	private async append(data: ArrayBuffer): Promise<void> {
		try {
			await this.op(() => this.sb!.appendBuffer(data));
		} catch (e) {
			if ((e as DOMException).name !== 'QuotaExceededError') throw e;
			// out of SourceBuffer memory: drop everything 10 s behind the playhead and retry once
			await this.remove(0, Math.max(0, this.video.currentTime - 10));
			await this.op(() => this.sb!.appendBuffer(data));
		}
	}

	private remove(start: number, end: number): Promise<void> {
		return this.op(() => this.sb!.remove(start, end));
	}

	// SourceBuffer allows one operation at a time; wait for updateend before the next.
	private op(fn: () => void): Promise<void> {
		const sb = this.sb!;
		return new Promise((resolve, reject) => {
			const done = () => { sb.removeEventListener('error', fail); resolve(); };
			const fail = () => { sb.removeEventListener('updateend', done); reject(new Error('SourceBuffer error')); };
			sb.addEventListener('updateend', done, { once: true });
			sb.addEventListener('error', fail, { once: true });
			try { fn(); } catch (e) {
				sb.removeEventListener('updateend', done);
				sb.removeEventListener('error', fail);
				reject(e);
			}
		});
	}
```

`QuotaExceededError` আসে যখন ব্রাউজার এই `SourceBuffer`-এর জন্য বরাদ্দ মেমরি শেষ করে ফেলে। এটা ঘটে লম্বা সেশনে, যখন পেছনে দেখা অংশ কখনো মোছা হয় না। সমাধান হলো প্লেহেডের পেছনের পুরনো অংশ মুছে আবার চেষ্টা করা। প্রোডাকশন প্লেয়ার এটা নিয়মিত করে, এরর আসার অপেক্ষা না করে।

## ধাপ ৫: মূল লুপ

পুরো প্লেয়ার একটা লুপ, যেটা প্রতিবার একটা প্রশ্ন করে: "এখন কী করা দরকার?"

```typescript
	private async run(): Promise<void> {
		while (!this.stopped) {
			if (this.seekTo !== null) await this.handleSeek(this.seekTo);

			const ahead = this.bufferAhead();
			if (ahead >= this.bufferGoal) { await sleep(500); continue; }

			const seg = this.playlist.segments.find((s) => s.seq === this.nextSeq);
			if (!seg) {
				if (this.playlist.endList) {
					if (this.ms.readyState === 'open' && !this.sb!.updating) this.ms.endOfStream();
					await sleep(1000);
					continue;
				}
				await sleep((this.playlist.targetDuration * 1000) / 2); // live: wait for the next segment
				await this.loadPlaylist(this.current);
				continue;
			}

			const want = pickVariant(this.variants, this.bps, ahead, this.current);
			if (want !== this.current) { await this.loadPlaylist(want); continue; }

			if (this.initFor !== this.current) await this.appendInit();
			const t0 = performance.now();
			const data = await this.bytes(seg.uri);
			this.sample(data.byteLength, performance.now() - t0);
			await this.append(data);
			this.nextSeq++;
			// live media time does not start at 0: move the playhead onto the first buffered range
			const b = this.video.buffered;
			if (b.length && this.video.currentTime < b.start(0)) this.video.currentTime = b.start(0);
		}
	}

	private bufferAhead(): number {
		const b = this.video.buffered, t = this.video.currentTime;
		for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.1 && t <= b.end(i)) return b.end(i) - t;
		return 0;
	}

	private isBuffered(t: number): boolean {
		const b = this.video.buffered;
		for (let i = 0; i < b.length; i++) if (t >= b.start(i) && t < b.end(i)) return true;
		return false;
	}

	private sample(bytes: number, ms: number): void {
		const bps = (bytes * 8) / Math.max(ms / 1000, 0.001);
		this.bps = this.bps ? 0.7 * this.bps + 0.3 * bps : bps; // EWMA
	}
```

ক্রমটা পড়ুন অগ্রাধিকার হিসেবে: আগে seek, তারপর "বাফার যথেষ্ট কিনা", তারপর "পরের সেগমেন্ট আছে কিনা" (না থাকলে VOD-এ শেষ, লাইভে প্লেলিস্ট রিফ্রেশ), তারপর "রেন্ডিশন বদলাতে হবে কিনা", আর শেষে ডাউনলোড ও append। বাফার গোল ২০ সেকেন্ড: এর বেশি জমলে প্লেয়ার থামে, যাতে ইউজার মাঝপথে চলে গেলে অপ্রয়োজনীয় ডাউনলোডের খরচ না হয়।

VOD-এ `ms.duration` সেট করার লাইনটাও পরীক্ষা থেকে এসেছে। প্রথম সংস্করণে এটা ছিল না, আর ডায়াগনস্টিক স্নিপেট (পরের চ্যাপ্টার) দেখাল `duration: Infinity` আর `seekable` শুধু বাফার করা অংশ পর্যন্ত। অর্থাৎ ব্রাউজারের seek বার ভিডিওর শেষ পর্যন্ত টানাই যেত না। MSE-তে ব্রাউজার দৈর্ঘ্য জানে না যতক্ষণ না আপনি বলেন; প্লেলিস্টের `EXTINF` যোগ করে সেটা বলতে হয়।

থ্রুপুট মাপা হয় EWMA দিয়ে (নতুন মাপের ওজন ৩০%), যাতে একটা ধীর সেগমেন্ট ABR-কে এক ধাক্কায় তলায় না নামায়।

<Callout type="warning">

**লুপের শেষ দুই লাইন প্রথম সংস্করণে ছিল না, আর লাইভ স্ট্রিম তখন আটকে থাকত।** পরীক্ষায় দেখা গেল: লাইভ প্লেলিস্টের শেষ তিন সেগমেন্ট থেকে শুরু করলে বাফার শুরু হয় ৫.৯৭ সেকেন্ডে (কারণ ওই সেগমেন্টগুলোর মিডিয়া টাইমস্ট্যাম্প ০ থেকে শুরু নয়), কিন্তু `currentTime` থাকে ০-তে। প্লেহেড এমন জায়গায় যেখানে কোনো ডেটা নেই, তাই তিন সেকেন্ড পরেও একটা ফ্রেমও আঁকা হয়নি (`totalVideoFrames: 0`)। প্লেহেডকে প্রথম বাফার করা অংশে সরানোর পর একই পরীক্ষায় তিন সেকেন্ডে ৮২টা ফ্রেম। প্রোডাকশনের "লাইভ চালু হয় কিন্তু স্পিনার ঘোরে" অভিযোগের একটা বড় অংশ ঠিক এই সমস্যা।

</Callout>

## ধাপ ৬: রেন্ডিশন বদলানো

```typescript
	private async loadPlaylist(index: number): Promise<void> {
		const v = this.variants[index];
		const pl = parseMedia(await this.text(v.uri), v.uri);
		if (index !== this.current && this.playlist) {
			// ponytail: assumes renditions share segment boundaries (true for one-encoder ladders)
			const now = this.playlist.segments.find((s) => s.seq === this.nextSeq);
			const same = now && pl.segments.find((s) => Math.abs(s.start - now.start) < 0.1);
			if (same) this.nextSeq = same.seq;
		}
		this.playlist = pl;
		this.current = index;
	}

	private async appendInit(): Promise<void> {
		const codecs = this.variants[this.current].codecs;
		this.sb!.changeType?.(`video/mp4; codecs="${codecs}"`);
		await this.append(await this.bytes(this.playlist.initUri));
		this.initFor = this.current;
	}
```

রেন্ডিশন বদলানো মানে তিনটা কাজ। নতুন রেন্ডিশনের media playlist আনা, তাতে একই সময়ের সেগমেন্ট খুঁজে বের করা, আর পরের সেগমেন্টের আগে **নতুন init segment append করা**। init segment ছাড়া নতুন রেন্ডিশনের সেগমেন্ট ডিকোডার বুঝবে না, কারণ রেজোলিউশন আর কোডেকের কনফিগারেশন ওখানেই থাকে।

`changeType` ধাপ ০-এর সেই লেভেলের পার্থক্যের জন্য। একই `SourceBuffer`-এ আলাদা কোডেক স্ট্রিংয়ের ডেটা দেওয়ার আগে ব্রাউজারকে জানানো হলো সঠিক পথ। Chrome-এ শুধু লেভেলের পার্থক্য সাধারণত চুপচাপ চলে যায়, কিন্তু সব ব্রাউজারের উপর ভরসা করা যায় না, আর কোডেকই বদলালে (যেমন H.264 থেকে HEVC) `changeType` ছাড়া চলবেই না।

## ধাপ ৭: seek

```typescript
	private onSeeking = () => { this.seekTo = this.video.currentTime; };

	private async handleSeek(t: number): Promise<void> {
		this.seekTo = null;
		const inside = this.isBuffered(t);
		// inside the buffer: continue from its end; outside: drop it and fetch from t
		const from = inside ? t + this.bufferAhead() : t;
		const seg = this.playlist.segments.find((s) => from >= s.start && from < s.start + s.duration);
		if (!seg) return;
		this.nextSeq = seg.seq;
		if (!inside) await this.remove(0, Infinity);
	}
```

seek দুই রকম। **বাফারের ভেতরে** (ইউজার দশ সেকেন্ড পিছিয়ে গেল, যেটা এখনো মেমরিতে আছে): কিছু ডাউনলোড করতে হয় না, শুধু বাফারের শেষ থেকে আনা চালিয়ে যেতে হয়। **বাফারের বাইরে**: পুরনো বাফার মুছে নতুন জায়গা থেকে শুরু। পুরনোটা না মুছলে প্লেয়ার নতুন জায়গার পরে পুরনো জায়গার পরের সেগমেন্ট আনতে থাকতে পারে, আর বাফার টুকরো টুকরো হয়ে যায়।

ইভেন্ট হ্যান্ডলার শুধু একটা পতাকা তোলে; আসল কাজ লুপ করে। এতে seek আর চলমান append কখনো একসাথে `SourceBuffer` ধরে না।

## ধাপ ৮: নেটওয়ার্ক এরর আর পরিষ্কার করা

```typescript
	private async fetchRetry(url: string, tries = 3): Promise<Response> {
		for (let i = 1; ; i++) {
			let res: Response;
			try {
				res = await fetch(url, { signal: this.ctrl.signal });
			} catch (e) {
				if (this.ctrl.signal.aborted || i >= tries) throw e; // network error: retry
				await sleep(500 * 2 ** i);
				continue;
			}
			if (res.ok) return res;
			// 5xx and 429 may pass; any other 4xx will not fix itself
			const retryable = res.status >= 500 || res.status === 429;
			if (!retryable || i >= tries) throw new Error(`HTTP ${res.status} for ${url}`);
			await sleep(500 * 2 ** i);
		}
	}

	private async text(url: string) { return (await this.fetchRetry(url)).text(); }
	private async bytes(url: string) { return (await this.fetchRetry(url)).arrayBuffer(); }

	private fail(e: unknown): void {
		if (this.stopped) return;
		console.error('[mini-player]', e);
		this.video.dispatchEvent(new CustomEvent('playerror', { detail: e }));
	}

	destroy(): void {
		this.stopped = true;
		this.ctrl.abort();
		this.video.removeEventListener('seeking', this.onSeeking);
		if (this.ms.readyState === 'open' && !this.sb?.updating) this.ms.endOfStream();
		this.video.removeAttribute('src');
		this.video.load();
	}
}
```

রিট্রাইয়ের নিয়ম গল্পের খোয়ারিজমির মতো। নেটওয়ার্ক এরর, 5xx আর 429 (রেট লিমিট) সাময়িক হতে পারে, তাই একটু অপেক্ষা বাড়িয়ে বাড়িয়ে (১, ২ সেকেন্ড) আবার চেষ্টা। 403 (টোকেনের মেয়াদ শেষ) বা 404 নিজে থেকে ঠিক হবে না, তাই সাথে সাথে থামা; রিট্রাই শুধু সময় নষ্ট করে আর origin-এ চাপ বাড়ায়।

`destroy()` বিশেষ করে single-page অ্যাপে জরুরি। চলমান ডাউনলোড `AbortController` দিয়ে বাতিল হয়, লুপ থামে, আর `src` সরিয়ে `load()` ডাকলে ব্রাউজার মিডিয়ার মেমরি ছেড়ে দেয়। এটা না করলে প্রতিটা পেজ বদলে আগের প্লেয়ারের বাফার মেমরিতে থেকে যায়।

<Mermaid
title="মূল লুপের সিদ্ধান্ত"
code={`graph TD
  A["loop"] --> B{"seek pending?"}
  B -->|"yes"| C["find segment, drop buffer if outside"] --> A
  B -->|"no"| D{"buffer ahead >= goal?"}
  D -->|"yes"| E["sleep 500 ms"] --> A
  D -->|"no"| F{"next segment in playlist?"}
  F -->|"no, VOD"| G["endOfStream"] --> A
  F -->|"no, live"| H["wait half target duration, refresh playlist"] --> A
  F -->|"yes"| I{"ABR wants another rendition?"}
  I -->|"yes"| J["load its playlist, map position"] --> A
  I -->|"no"| K["init if needed, fetch, measure, append"] --> A`}
/>

## চালিয়ে দেখা

পুরো কোড একটা ফাইলে (`player.ts`) রাখুন। পার্সার আর ABR-এর জন্য তিনটা ছোট টেস্ট, ধাপ ০-এর আসল প্লেলিস্টের উপর:

```typescript
import { assertEquals } from 'jsr:@std/assert@1';
import { parseMaster, parseMedia, pickVariant } from './player.ts';

const base = 'https://cdn.cordoba.example/v/42/master.m3u8';

Deno.test('master: variants sorted, URIs resolved, codecs kept', () => {
	const v = parseMaster(Deno.readTextFileSync('master.m3u8'), base);
	assertEquals(v.map((x) => x.uri), [
		'https://cdn.cordoba.example/v/42/v0/index.m3u8',
		'https://cdn.cordoba.example/v/42/v1/index.m3u8'
	]);
	assertEquals(v[1].codecs, 'avc1.4d401f,mp4a.40.2');
});

Deno.test('media: init, timeline and seq numbers', () => {
	const pl = parseMedia(Deno.readTextFileSync('v0/index.m3u8'), 'https://x.example/v0/index.m3u8');
	assertEquals(pl.initUri, 'https://x.example/v0/init_0.mp4');
	assertEquals(pl.segments.length, 8);
	assertEquals(pl.segments[3].start, 12);
	assertEquals(pl.endList, true);
});

Deno.test('abr: needs headroom, and climbs only with a buffer cushion', () => {
	const v = parseMaster(Deno.readTextFileSync('master.m3u8'), base);
	assertEquals(pickVariant(v, 3_000_000, 15, 0), 0); // 2.7 Mbps rung needs 3.9 Mbps
	assertEquals(pickVariant(v, 5_000_000, 4, 0), 0); // enough bandwidth, thin buffer
	assertEquals(pickVariant(v, 5_000_000, 12, 0), 1);
	assertEquals(pickVariant(v, 500_000, 2, 1), 0); // drops immediately
});
```

ব্রাউজারের জন্য একটা ছোট পেজ:

```html
<!doctype html>
<video id="v" muted controls width="640"></video>
<script type="module">
	import { MiniPlayer } from './player.js';
	const video = document.getElementById('v');
	const player = new MiniPlayer(video, new URL('master.m3u8', location.href).href);
	video.addEventListener('playerror', (e) => console.log('playerror', e.detail));
	await player.load();
	await video.play();
</script>
```

তারপর টাইপ চেক, টেস্ট, ব্রাউজারের জন্য JavaScript বানানো, আর একটা সাধারণ স্ট্যাটিক সার্ভার। `deno.json`-এ `"compilerOptions": { "lib": ["dom", "esnext", "deno.ns"] }` দিন, যাতে `HTMLVideoElement` আর `MediaSource` টাইপ চেনে।

```bash
deno check player.ts
deno test --allow-read player_test.ts
deno bundle --platform=browser -o player.js player.ts
python3 -m http.server 8765 --bind 127.0.0.1
```

```text
master: variants sorted, URIs resolved, codecs kept ... ok (4ms)
media: init, timeline and seq numbers ... ok (914µs)
abr: needs headroom, and climbs only with a buffer cushion ... ok (218µs)

ok | 3 passed | 0 failed (9ms)
```

`http://127.0.0.1:8765/index.html` খুলুন। ফাইল সরাসরি `file://` দিয়ে খুললে চলবে না, কারণ `fetch` আর মডিউল স্ক্রিপ্ট দুটোই HTTP চায়।

এই চ্যাপ্টারের প্রতিটা আচরণ Playwright দিয়ে হেডলেস Google Chrome-এ চালিয়ে পরীক্ষা করা হয়েছে (প্লেয়ারের অবস্থা `video.buffered`, `getVideoPlaybackQuality()` আর প্লেয়ারের ভেতরের ফিল্ড থেকে পড়া)। Playwright-এর নিজস্ব Chromium-এ H.264 আর AAC ডিকোডার না-ও থাকতে পারে, তাই আসল Chrome (`channel: 'chrome'`) ব্যবহার করা হয়েছে। আসল ফলাফল:

```text
VOD, unthrottled localhost
after 3s       t=2.63   buffered [0, 23.96]   height 360   frames 82   dropped 0
seek to 25     t=27.92  buffered [0, 30.07]   height 720
end            t=30.07  ended=true            frames 354  dropped 0

VOD, 2 Mbps, seek far outside the buffer
before         t=0.90   buffered [0, 3.97]
seek to 22     t=23.08  buffered [19.97, 23.96]     old range dropped, refetched from segment 5

VOD, network throttled to 2 Mbps, then 20 Mbps
2 Mbps   t=3.9   rendition 0  measured 1.95 Mbps  ahead 8.1 s   height 360
2 Mbps   t=6.9   rendition 0  measured 1.95 Mbps  ahead 9.1 s   height 360
20 Mbps  t=9.9   rendition 1  measured 12 Mbps    ahead 20.1 s  height 360
20 Mbps  t=15.9  rendition 1  measured 12 Mbps    ahead 14.2 s  height 360

live (ffmpeg -re, 2 s segments, 6-segment window)
after 3s       t=8.77   buffered [5.97, 13.97]  frames 82
after 10s      t=17.87  buffered [5.97, 17.96]  frames 203
```

থ্রটল করা পরীক্ষাটা একটা জিনিস দেখায় যা ড্যাশবোর্ডে প্রায়ই বিভ্রান্তি তৈরি করে। ২০ Mbps-এ প্লেয়ার সাথে সাথে রেন্ডিশন ১ বেছে নিয়েছে, কিন্তু ছয় সেকেন্ড পরেও স্ক্রিনে 360p। কারণ বাফারে ইতিমধ্যে ২০ সেকেন্ডের 360p জমা ছিল, আর সেটা শেষ না হওয়া পর্যন্ত 720p স্ক্রিনে আসবে না। **ABR-এর সিদ্ধান্ত আর স্ক্রিনের ছবির মধ্যে ব্যবধান প্রায় বাফারের সমান।** এজন্যই আগের চ্যাপ্টারে স্ক্রিনের রেন্ডিশন মাপা হয়েছে, ডাউনলোডের নয়। প্রোডাকশন প্লেয়ার এই ব্যবধান কমাতে কখনো কখনো সামনের নিচু কোয়ালিটির বাফার মুছে উঁচুটা আবার আনে।

রিট্রাইয়ের পথ (5xx, নেটওয়ার্ক বিচ্ছিন্ন হওয়া) এই পরীক্ষায় চালানো হয়নি। নিজে দেখতে চাইলে সার্ভার মাঝপথে বন্ধ করে আবার চালু করুন, বা DevTools-এর Network প্যানেলে একটা সেগমেন্ট URL ব্লক করুন।

## hls.js যা করে আর এটা করে না

| ক্ষেত্র | এই প্লেয়ার | প্রোডাকশন প্লেয়ার |
| --- | --- | --- |
| থ্রুপুট মাপা | পুরো সেগমেন্টের গড় | ডাউনলোড চলাকালীন মাপা, ধীর ডাউনলোড মাঝপথে বাতিল |
| ABR | থ্রুপুট, একটা নিরাপত্তা গুণক | থ্রুপুট আর বাফার মিলিয়ে, ডিভাইসের সক্ষমতা আর স্ক্রিনের আকার ধরে |
| বাফার পরিষ্কার | শুধু QuotaExceeded হলে | নিয়মিত, পেছনের অংশ |
| স্টল সামলানো | কিছু নেই | বাফারে ছোট ফাঁক দেখলে প্লেহেড লাফিয়ে পার করা |
| লাইভ | প্লেলিস্ট রিফ্রেশ, এজ থেকে তিন সেগমেন্ট পেছনে | লাইভ এজ ধরে রাখতে প্লেব্যাক রেট বদলানো, LL-HLS |
| কন্টেইনার | fMP4 | MPEG-TS transmux, আলাদা অডিও ট্র্যাক |
| এরর | রিট্রাই আর একটা ইভেন্ট | প্রতিটা এররের ধরন আর কারণ, মিডিয়া এরর থেকে পুনরুদ্ধার |

এই তালিকাটাই বুঝিয়ে দেয় প্রোডাকশনে কেন নিজের প্লেয়ার না লিখে একটা পরীক্ষিত লাইব্রেরি নেওয়া ঠিক। কিন্তু এই ২৫০ লাইন একবার নিজে লেখার পর লাইব্রেরির লগ আর এরর পড়া অনেক সহজ হয়ে যায়, কারণ প্রতিটা লাইনের পেছনের কাজটা আপনি চেনেন। পরের চ্যাপ্টারের ডিবাগিং ঠিক এই চেনার উপর দাঁড়িয়ে।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | কীভাবে নিশ্চিত হবেন | সমাধান |
| --- | --- | --- |
| লাইভে স্পিনার ঘোরে, এরর নেই | কনসোলে `v.currentTime` আর `v.buffered.start(0)` তুলনা করুন | প্রথম append-এর পর প্লেহেড বাফারের শুরুতে আনুন |
| `InvalidStateError: This SourceBuffer is still processing` | স্ট্যাক ট্রেস দেখুন কোন কোড `updating` অবস্থায় append করল | সব `appendBuffer`/`remove` একটা কিউ বা `op()` মোড়কের ভেতর দিয়ে নিন |
| `no playable variant` | কনসোলে `MediaSource.isTypeSupported('video/mp4; codecs="avc1.4d401e,mp4a.40.2"')` | এনকোডারের প্রোফাইল বা কোডেক বদলান; master-এ `CODECS` আছে কিনা দেখুন |
| `playlist has no EXT-X-MAP` | media playlist খুলে দেখুন সেগমেন্ট `.ts` কিনা | ffmpeg-এ `-hls_segment_type fmp4` দিন, বা transmux যোগ করুন |
| `file://` থেকে খুললে কিছুই হয় না | কনসোলে CORS বা মডিউল লোডের এরর | লোকাল HTTP সার্ভার দিয়ে খুলুন |
| রেন্ডিশন বদলের পর ছবি ভাঙা বা ডিকোড এরর | `chrome://media-internals`-এ এররের ঠিক আগের ইভেন্ট | নতুন init segment append হচ্ছে কিনা আর `changeType` ডাকা হচ্ছে কিনা দেখুন |
| উঁচু রেন্ডিশন বেছে নিয়েছে কিন্তু স্ক্রিনে আসছে না | `player.current` বনাম `v.videoHeight`, আর বাফারের দৈর্ঘ্য | স্বাভাবিক: বাফার ফুরালে আসবে। দ্রুত চাইলে সামনের বাফার মুছে আবার আনুন |
| VOD-এ seek বার শুধু বাফার পর্যন্ত যায়, দৈর্ঘ্য দেখায় না | কনসোলে `v.duration` (`Infinity`?) আর `v.seekable` | প্লেলিস্টের মোট দৈর্ঘ্য `mediaSource.duration`-এ সেট করুন |
| লম্বা সেশনে কিছুক্ষণ পর append ব্যর্থ | এররের `name` দেখুন: `QuotaExceededError` | পেছনের বাফার নিয়মিত মুছুন |
| SPA-তে পেজ বদলালে মেমরি বাড়তেই থাকে | DevTools Memory-তে আগের `MediaSource` অবজেক্ট বেঁচে আছে কিনা | রাউট বদলে `destroy()` ডাকুন |

## মূল শিক্ষা

1. **একটা প্লেয়ার আসলে একটা লুপ:** seek, বাফার গোল, পরের সেগমেন্ট, ABR, ডাউনলোড-append; এই ক্রমে।
2. **URI সবসময় প্লেলিস্টের URL-এর সাপেক্ষে**, আর attribute-এর মানের ভেতরে কমা থাকতে পারে।
3. **`SourceBuffer` একবারে একটা কাজ করে**; প্রতিটা অপারেশন `updateend` পর্যন্ত অপেক্ষা করবে।
4. **রেন্ডিশন বদলাতে নতুন init segment লাগে**, আর কোডেক স্ট্রিং বদলালে `changeType`।
5. **লাইভের মিডিয়া টাইম ০ থেকে শুরু হয় না**; প্লেহেড বাফারে না আনলে ছবি আসে না। আর VOD-এ `duration` নিজে সেট না করলে seek বার অসম্পূর্ণ।
6. **5xx আর নেটওয়ার্ক এররে রিট্রাই, 4xx-এ নয়।**
7. **ABR-এর সিদ্ধান্ত স্ক্রিনে আসে বাফারের সমান দেরিতে।**
8. **`destroy()` ছাড়া SPA-তে প্লেয়ার মেমরি লিক।**
9. **প্রোডাকশনে পরীক্ষিত লাইব্রেরি নিন**; নিজে একবার লেখার লাভ হলো তার আচরণ বোঝা।
