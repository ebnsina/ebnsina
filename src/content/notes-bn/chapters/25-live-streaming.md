---
title: 'Case Study: Live Streaming Platform'
subtitle: 'RTMP ingest, real-time transcoding, HLS delivery, chat integration আর viewer scaling সহ একটি প্রোডাকশন লাইভ স্ট্রিমিং সিস্টেম ডিজাইন ও তৈরি করা।'
chapter: 25
level: 'advanced'
readingTime: '36 মিনিট'
topics: ['live streaming', 'RTMP', 'real-time transcoding', 'HLS', 'viewer scaling', 'low latency']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

বিশ্বকাপ ফাইনালের দিন। মাঠে ধারাভাষ্যকার ইবনে সিনা মাইক হাতে বসে আছেন — প্রতিটা বল, প্রতিটা চার-ছক্কা তিনি তখনই বলে যাচ্ছেন। কিন্তু ইবনে সিনার গলা তো সরাসরি সবার রেডিওতে পৌঁছায় না। তাঁর কথা প্রথমে স্টেশনে গিয়ে ছোট ছোট টুকরোয় সাজানো হয়, তারপর সেই সিগন্যাল একটা টাওয়ার থেকে আরেকটা বুস্টার টাওয়ারে, সেখান থেকে আরও দূরের টাওয়ারে — এভাবে রিলে হতে হতে সারা দেশের লক্ষ লক্ষ রেডিওতে একসাথে বাজে। একজন ইবনে সিনা, কিন্তু শ্রোতা কোটি।

আল-খোয়ারিজমি গ্রামে বসে রেডিও শুনছেন। খেয়াল করলে বোঝা যায়, মাঠে বল হওয়ার ঠিক সেকেন্ড-দুয়েক পরে তিনি ধারাভাষ্য শোনেন — এই সামান্য দেরিটা টাওয়ারের চেইন পার হতে গিয়েই হয়, এড়ানো যায় না। আবার আল-খোয়ারিজমির এলাকায় সিগন্যাল দুর্বল হলে স্টেশন চালাক — তারা পুরো ঝকঝকে অডিওর বদলে একটু কম মানের, হালকা অডিওতে নেমে আসে, যাতে খেলা একদম কেটে না যায়, চললেও চলুক। পাশের শহরে ফাতিমা আল-ফিহরির সিগন্যাল ভালো, তাই তিনি টান-টান পরিষ্কার শব্দে শোনেন। একই সম্প্রচার, কিন্তু যার লাইন যেমন, সে তেমন মানে পায়।

এই গল্পটাই আসলে **live streaming**। মাঠের ইবনে সিনা হলেন live source আর encoder — ঘটনা ঘটছে এখনই, আবার করার সুযোগ নেই। কথাকে ছোট টুকরোয় ভাগ করা হলো segment বানানো, আর টাওয়ার-থেকে-টাওয়ার রিলে চেইনটাই হলো **CDN**-এর edge fan-out — এক উৎস থেকে কোটি শ্রোতার কাছে পৌঁছানো। বল আর শোনার মাঝের সেকেন্ড-দুয়েকের ফাঁকই streaming **latency**, আর দুর্বল সিগন্যালে অডিওর মান নামিয়ে আনাই **adaptive bitrate** — বেশি viewer আর কম latency-র মাঝের এই tradeoff-টাই YouTube Live বা Twitch-এ লক্ষ দর্শককে একসাথে সামলানোর মূল কৌশল।

## লাইভ স্ট্রিমিং কেন কঠিন?

লাইভ স্ট্রিমিং ডিস্ট্রিবিউটেড সিস্টেমের সবচেয়ে কঠিন সমস্যাগুলোকে একসাথে করে: **real-time processing** (আবার করার সুযোগ নেই — একটা frame drop হলে সেটা চলে গেছে), **massive concurrent viewers** (Twitch একসাথে 30M+ viewer-এ peak করে), **low latency** (ক্যামেরা থেকে স্ক্রিন পর্যন্ত 2-10 সেকেন্ড), **adaptive quality** (5G আর 3G-তে থাকা viewer-রা একই স্ট্রিম দেখে), আর **chat synchronization** (chat message স্ক্রিনে যা ঘটছে তার সাথে align হওয়া উচিত)।

<Callout type="info">

**Real-World Analogy**

একটা স্পোর্টস ম্যাচের লাইভ টিভি সম্প্রচারের মতো — ক্যামেরা অ্যাকশন ধরে, প্রোডাকশন ট্রাক feed গুলো mix করে, আর সিগন্যাল একই সাথে minimal delay-এ লক্ষ লক্ষ viewer-এর কাছে যায়।

</Callout>

এটাকে লাইভ টিভি সম্প্রচারের মতো ভাবুন, কিন্তু এখানে প্রতিটি viewer নিজের quality level বেছে নিতে পারে, আর একটা জনপ্রিয় streamer লাইভে গেলে broadcast infrastructure-কে সেকেন্ডের মধ্যে 0 থেকে লক্ষ লক্ষ viewer পর্যন্ত scale করতে হয়। VOD-তে যেখানে কেউ দেখা শুরু করার আগেই আপনি পুরো ভিডিও process করেন, লাইভ স্ট্রিমিং-এ তার বদলে ভিডিওর প্রতিটি সেকেন্ড তৈরি হওয়ার সাথে সাথেই transcode, package আর distribute করতে হয়।

<Mermaid
title="Live Streaming Architecture"
code={`graph TD
  B["Broadcaster<br/>RTMP Ingest"] --> E["Edge Ingest<br/>Nearest PoP"] --> T["Transcoder<br/>Multi-Quality"]
  T --> O["Origin Server<br/>HLS Segments"] --> C["CDN Edge<br/>Global Delivery"] --> V["Viewers<br/>HLS Player"]`}
/>

## Requirements

- **Functional**: OBS/Streamlabs থেকে RTMP ingest, একাধিক quality-তে real-time transcoding, HLS delivery, stream key authentication, live chat, viewer count, stream recording (DVR), go-live/end-stream lifecycle
- **Non-functional**: glass-to-glass latency 5 সেকেন্ডের নিচে, প্রতি স্ট্রিমে 100K+ concurrent viewer support, 99.95% uptime, auto-scaling CDN
- **Scale**: 10K concurrent stream, মোট 50M concurrent viewer

## লাইভ স্ট্রিমিং পাইপলাইন

### Ingest

Broadcaster-রা OBS, Streamlabs, বা মোবাইল অ্যাপ থেকে **RTMP (Real-Time Messaging Protocol)** ব্যবহার করে ভিডিও পাঠায়। RTMP ingest-এর জন্য ব্যবহৃত হয় (delivery-র জন্য নয়) কারণ এটা low-latency, reliable, bidirectional communication দেয় আর বহু encoder-এ support পায়। স্ট্রিমটি upload latency কমাতে সবচেয়ে কাছের **Point of Presence (PoP)**-এ connect করে। stream key authentication হিসেবে কাজ করে — এটা একটা secret token যা broadcaster প্ল্যাটফর্ম থেকে পায়।

### Real-Time Transcoding

RTMP ডেটা আসার সাথে সাথে সেটা real-time-এ একাধিক quality level-এ transcode করা হয়। VOD-র মতো নয় (যেখানে আপনি split আর parallelize করতে পারেন), live transcoding sequential — segment N+1-এর আগে আপনাকে segment N process করতেই হবে। প্রতিটি output quality-তে **keyframe-aligned segment** থাকতে হবে যাতে player-রা কোনো visual artifact ছাড়াই যেকোনো segment boundary-তে quality-র মধ্যে switch করতে পারে।

### HLS Packaging

Transcode হওয়া segment গুলো HLS হিসেবে package করা হয় — `.ts` ভিডিও segment (সাধারণত প্রতিটি 2-4 সেকেন্ড) সাথে `.m3u8` playlist। playlist একটা **sliding window** ব্যবহার করে যেটা শুধু শেষ N segment রাখে (যেমন, শেষ 30 সেকেন্ড)। নতুন segment যোগ হয়, পুরনোগুলো সরানো হয়। `EXT-X-MEDIA-SEQUENCE` tag player-দের বলে দেয় পরের segment number কোনটা।

### CDN Distribution

Segment গুলো CDN origin server-এ push করা হয়, যেগুলো বিশ্বজুড়ে edge node-এ propagate হয়। যখন 100K viewer একই segment request করে, তখন origin-এ মাত্র একটা request পৌঁছায় — CDN edge node থেকে cached copy serve করে। এই কারণেই HLS (HTTP-ভিত্তিক) delivery-র জন্য RTMP-কে হারিয়েছে: HTTP content বিদ্যমান CDN infrastructure দিয়ে সহজেই cacheable।

## Low Latency vs Ultra-Low Latency

| Approach                     | Latency  | কীভাবে কাজ করে                      | Use Case                       |
| ---------------------------- | -------- | ----------------------------------- | ------------------------------ |
| **Standard HLS**             | 10-30s   | 3 segment × 6s + buffer             | VOD-র মতো live (sports replay) |
| **Low-Latency HLS (LL-HLS)** | 2-5s     | Partial segment + blocking playlist | Interactive stream (Twitch)    |
| **WebRTC**                   | under 1s | Peer-to-peer, segment নেই           | ভিডিও কল, auction              |

Standard HLS-এ high latency থাকে কারণ player play করার আগে 3 segment buffer করে (network jitter সামলানোর জন্য)। **LL-HLS** এটা partial segment দিয়ে সমাধান করে — পুরো 6-সেকেন্ডের segment-এর জন্য অপেক্ষা না করে player মাত্র 200ms ডেটা পাওয়ার পরই play শুরু করতে পারে। playlist **blocking reload** ব্যবহার করে — player-এর request পরের partial segment তৈরি না হওয়া পর্যন্ত CDN-এ block হয়ে থাকে, ফলে polling delay বাদ যায়।

## Live Chat at Scale

Chat লাইভ-স্ট্রিমিং স্কেলে দেখতে যতটা সহজ ততটা নয়। 100K viewer-ওয়ালা একটা জনপ্রিয় স্ট্রিম প্রতি সেকেন্ডে হাজার হাজার chat message তৈরি করে। chat সিস্টেমকে করতে হবে: room-এর সব viewer-এর কাছে **message fan out** করা (100K WebSocket connection), sender-দের **rate limit** করা (slow mode: প্রতি 3 সেকেন্ডে 1 message), **video-র সাথে synchronize** করা (chat timestamp stream time-এর সাথে align হয়), আর **moderation** সামলানো (ban, timeout, message delete)।

## লাইভ স্ট্রিমিং প্ল্যাটফর্ম তৈরি করা

<CodeTabs tsFile="live-streaming.ts" goFile="live-streaming.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

// ===========================================
// 1. TYPES
// ===========================================
type StreamStatus = 'idle' | 'live' | 'ended';

interface Stream {
	id: string;
	title: string;
	streamKey: string;
	status: StreamStatus;
	startedAt: string | null;
	endedAt: string | null;
	broadcasterId: string;
	quality: string[];
	viewerCount: number;
	chatEnabled: boolean;
	recordingEnabled: boolean;
}

interface Segment {
	streamId: string;
	quality: string;
	sequenceNum: number;
	duration: number; // seconds
	createdAt: number;
	data: string; // placeholder for actual .ts data
}

interface ChatMessage {
	id: string;
	streamId: string;
	userId: string;
	username: string;
	content: string;
	timestamp: number;
	streamTime: number; // seconds since stream start
}

interface ViewerSession {
	userId: string;
	streamId: string;
	quality: string;
	connectedAt: number;
	lastHeartbeat: number;
}

// ===========================================
// 2. STREAM MANAGER
// ===========================================
class StreamManager {
	private streams = new Map<string, Stream>();
	private streamsByKey = new Map<string, string>(); // streamKey -> streamId

	create(broadcasterId: string, title: string): Stream {
		const stream: Stream = {
			id: crypto.randomUUID().slice(0, 8),
			title,
			streamKey: `live_${crypto.randomBytes(16).toString('hex')}`,
			status: 'idle',
			startedAt: null,
			endedAt: null,
			broadcasterId,
			quality: ['1080p', '720p', '480p', '360p'],
			viewerCount: 0,
			chatEnabled: true,
			recordingEnabled: true
		};
		this.streams.set(stream.id, stream);
		this.streamsByKey.set(stream.streamKey, stream.id);
		return stream;
	}

	authenticate(streamKey: string): Stream | null {
		const streamId = this.streamsByKey.get(streamKey);
		if (!streamId) return null;
		return this.streams.get(streamId) || null;
	}

	goLive(streamId: string): Stream {
		const stream = this.streams.get(streamId);
		if (!stream) throw new Error('Stream not found');
		if (stream.status === 'live') throw new Error('Already live');
		stream.status = 'live';
		stream.startedAt = new Date().toISOString();
		console.log(`[STREAM] ${stream.id} is LIVE — ${stream.title}`);
		return stream;
	}

	endStream(streamId: string): Stream {
		const stream = this.streams.get(streamId);
		if (!stream) throw new Error('Stream not found');
		if (stream.status !== 'live') throw new Error('Not live');
		stream.status = 'ended';
		stream.endedAt = new Date().toISOString();
		console.log(`[STREAM] ${stream.id} ended`);
		return stream;
	}

	get(id: string): Stream | null {
		return this.streams.get(id) || null;
	}

	getLive(): Stream[] {
		return [...this.streams.values()].filter((s) => s.status === 'live');
	}
}

// ===========================================
// 3. SEGMENT BUFFER (Sliding Window HLS)
// ===========================================
class SegmentBuffer {
	private segments = new Map<string, Segment[]>(); // "streamId:quality" -> segments
	private readonly windowSize = 15; // keep last 15 segments (~30-60 seconds)
	private sequenceCounters = new Map<string, number>();

	addSegment(streamId: string, quality: string, duration: number): Segment {
		const key = `${streamId}:${quality}`;
		const seqNum = (this.sequenceCounters.get(key) || 0) + 1;
		this.sequenceCounters.set(key, seqNum);

		const segment: Segment = {
			streamId,
			quality,
			sequenceNum: seqNum,
			duration,
			createdAt: Date.now(),
			data: `segment_${seqNum}_${quality}.ts`
		};

		const list = this.segments.get(key) || [];
		list.push(segment);

		// Sliding window: remove old segments
		while (list.length > this.windowSize) list.shift();
		this.segments.set(key, list);

		return segment;
	}

	getSegments(streamId: string, quality: string): Segment[] {
		return this.segments.get(`${streamId}:${quality}`) || [];
	}

	generatePlaylist(streamId: string, quality: string): string {
		const segments = this.getSegments(streamId, quality);
		if (segments.length === 0) return '';

		const firstSeq = segments[0].sequenceNum;
		let playlist = '#EXTM3U\n#EXT-X-VERSION:3\n';
		playlist += `#EXT-X-TARGETDURATION:4\n`;
		playlist += `#EXT-X-MEDIA-SEQUENCE:${firstSeq}\n\n`;

		for (const seg of segments) {
			playlist += `#EXTINF:${seg.duration.toFixed(3)},\n`;
			playlist += `${seg.data}\n`;
		}
		return playlist;
	}

	generateMasterPlaylist(streamId: string, qualities: string[]): string {
		const bandwidths: Record<string, number> = {
			'1080p': 5000000,
			'720p': 2500000,
			'480p': 1000000,
			'360p': 500000
		};
		const resolutions: Record<string, string> = {
			'1080p': '1920x1080',
			'720p': '1280x720',
			'480p': '854x480',
			'360p': '640x360'
		};

		let manifest = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
		for (const q of qualities) {
			manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidths[q] || 1000000},RESOLUTION=${resolutions[q] || '640x360'}\n`;
			manifest += `${q}/playlist.m3u8\n\n`;
		}
		return manifest;
	}
}

// ===========================================
// 4. VIEWER MANAGER
// ===========================================
class ViewerManager {
	private viewers = new Map<string, ViewerSession>(); // viewerId -> session
	private readonly timeout = 30000; // 30s heartbeat timeout

	join(userId: string, streamId: string, quality: string): void {
		this.viewers.set(`${userId}:${streamId}`, {
			userId,
			streamId,
			quality,
			connectedAt: Date.now(),
			lastHeartbeat: Date.now()
		});
	}

	leave(userId: string, streamId: string): void {
		this.viewers.delete(`${userId}:${streamId}`);
	}

	heartbeat(userId: string, streamId: string): void {
		const key = `${userId}:${streamId}`;
		const session = this.viewers.get(key);
		if (session) session.lastHeartbeat = Date.now();
	}

	getCount(streamId: string): number {
		const now = Date.now();
		let count = 0;
		for (const [, session] of this.viewers) {
			if (session.streamId === streamId && now - session.lastHeartbeat < this.timeout) count++;
		}
		return count;
	}
}

// ===========================================
// 5. LIVE CHAT
// ===========================================
class LiveChat {
	private messages = new Map<string, ChatMessage[]>(); // streamId -> messages
	private rateLimiter = new Map<string, number>(); // "userId:streamId" -> lastMessage timestamp
	private readonly slowModeMs = 3000; // 1 message per 3 seconds
	private readonly maxHistory = 200;

	send(
		streamId: string,
		userId: string,
		username: string,
		content: string,
		streamStartTime: number
	): ChatMessage {
		const key = `${userId}:${streamId}`;
		const lastMsg = this.rateLimiter.get(key) || 0;
		if (Date.now() - lastMsg < this.slowModeMs) {
			throw new Error('Slow mode: wait before sending another message');
		}

		const msg: ChatMessage = {
			id: crypto.randomUUID().slice(0, 8),
			streamId,
			userId,
			username,
			content,
			timestamp: Date.now(),
			streamTime: streamStartTime > 0 ? (Date.now() - streamStartTime) / 1000 : 0
		};

		const list = this.messages.get(streamId) || [];
		list.push(msg);
		if (list.length > this.maxHistory) list.shift();
		this.messages.set(streamId, list);
		this.rateLimiter.set(key, Date.now());

		return msg;
	}

	getRecent(streamId: string, limit = 50): ChatMessage[] {
		const list = this.messages.get(streamId) || [];
		return list.slice(-limit);
	}
}

// ===========================================
// 6. STREAM HEALTH MONITOR
// ===========================================
class HealthMonitor {
	private metrics = new Map<
		string,
		{ bitrate: number; fps: number; droppedFrames: number; lastUpdate: number }
	>();

	update(streamId: string, bitrate: number, fps: number, droppedFrames: number): void {
		this.metrics.set(streamId, { bitrate, fps, droppedFrames, lastUpdate: Date.now() });

		if (bitrate < 500000)
			console.log(`[HEALTH] ⚠ Stream ${streamId}: low bitrate ${(bitrate / 1000).toFixed(0)}kbps`);
		if (fps < 20) console.log(`[HEALTH] ⚠ Stream ${streamId}: low FPS ${fps}`);
		if (droppedFrames > 100)
			console.log(`[HEALTH] ⚠ Stream ${streamId}: ${droppedFrames} dropped frames`);
	}

	get(streamId: string) {
		return this.metrics.get(streamId);
	}
}

// ===========================================
// 7. TRANSCODER SIMULATOR
// ===========================================
class LiveTranscoder {
	private segmentBuffer: SegmentBuffer;
	private intervals = new Map<string, ReturnType<typeof setInterval>>();

	constructor(buffer: SegmentBuffer) {
		this.segmentBuffer = buffer;
	}

	startTranscoding(streamId: string, qualities: string[]): void {
		// Simulate generating segments every 2 seconds
		const interval = setInterval(() => {
			for (const quality of qualities) {
				this.segmentBuffer.addSegment(streamId, quality, 2.0);
			}
		}, 2000);
		this.intervals.set(streamId, interval);
		console.log(`[TRANSCODE] Started for stream ${streamId} — ${qualities.length} qualities`);
	}

	stopTranscoding(streamId: string): void {
		const interval = this.intervals.get(streamId);
		if (interval) clearInterval(interval);
		this.intervals.delete(streamId);
	}
}

// ===========================================
// 8. HTTP SERVER
// ===========================================
const streams = new StreamManager();
const segmentBuffer = new SegmentBuffer();
const viewers = new ViewerManager();
const chat = new LiveChat();
const health = new HealthMonitor();
const transcoder = new LiveTranscoder(segmentBuffer);

function parseBody(req: http.IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString()));
			} catch {
				reject(new Error('Invalid JSON'));
			}
		});
	});
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const method = req.method || 'GET';

	try {
		// POST /api/streams — Create stream
		if (url.pathname === '/api/streams' && method === 'POST') {
			const body = (await parseBody(req)) as any;
			const stream = streams.create(body.broadcasterId || 'anon', body.title || 'Untitled');
			json(res, 201, stream);
			return;
		}

		// POST /api/streams/:id/start — Go live
		const startMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/start$/);
		if (startMatch && method === 'POST') {
			const body = (await parseBody(req)) as any;
			const stream = streams.authenticate(body.streamKey);
			if (!stream || stream.id !== startMatch[1]) {
				json(res, 401, { error: 'Invalid stream key' });
				return;
			}
			const live = streams.goLive(stream.id);
			transcoder.startTranscoding(stream.id, live.quality);
			json(res, 200, live);
			return;
		}

		// POST /api/streams/:id/end — End stream
		const endMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/end$/);
		if (endMatch && method === 'POST') {
			transcoder.stopTranscoding(endMatch[1]);
			const stream = streams.endStream(endMatch[1]);
			json(res, 200, stream);
			return;
		}

		// GET /api/streams/:id/master.m3u8 — HLS master playlist
		const masterMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/master\.m3u8$/);
		if (masterMatch && method === 'GET') {
			const stream = streams.get(masterMatch[1]);
			if (!stream || stream.status !== 'live') {
				json(res, 404, { error: 'Stream not live' });
				return;
			}
			const manifest = segmentBuffer.generateMasterPlaylist(stream.id, stream.quality);
			res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
			res.end(manifest);
			return;
		}

		// GET /api/streams/:id/:quality/playlist.m3u8 — Variant playlist
		const variantMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/(\w+)\/playlist\.m3u8$/);
		if (variantMatch && method === 'GET') {
			const playlist = segmentBuffer.generatePlaylist(variantMatch[1], variantMatch[2]);
			res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
			res.end(playlist);
			return;
		}

		// GET /api/streams/:id/viewers
		const viewerMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/viewers$/);
		if (viewerMatch && method === 'GET') {
			json(res, 200, { count: viewers.getCount(viewerMatch[1]) });
			return;
		}

		// POST /api/streams/:id/chat — Send chat message
		const chatMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/chat$/);
		if (chatMatch && method === 'POST') {
			const body = (await parseBody(req)) as any;
			const stream = streams.get(chatMatch[1]);
			const startTime = stream?.startedAt ? new Date(stream.startedAt).getTime() : 0;
			const msg = chat.send(
				chatMatch[1],
				body.userId || 'anon',
				body.username || 'Anonymous',
				body.content,
				startTime
			);
			json(res, 201, msg);
			return;
		}

		// GET /api/streams/:id/chat
		if (chatMatch && method === 'GET') {
			const limit = parseInt(url.searchParams.get('limit') || '50');
			json(res, 200, { messages: chat.getRecent(chatMatch[1], limit) });
			return;
		}

		// GET /api/streams/live — List live streams
		if (url.pathname === '/api/streams/live' && method === 'GET') {
			const live = streams.getLive().map((s) => ({
				...s,
				viewerCount: viewers.getCount(s.id),
				streamKey: undefined
			}));
			json(res, 200, { streams: live });
			return;
		}

		// GET /api/streams/:id
		const streamMatch = url.pathname.match(/^\/api\/streams\/([^/]+)$/);
		if (streamMatch && method === 'GET') {
			const stream = streams.get(streamMatch[1]);
			if (!stream) {
				json(res, 404, { error: 'Stream not found' });
				return;
			}
			json(res, 200, { ...stream, viewerCount: viewers.getCount(stream.id), streamKey: undefined });
			return;
		}

		if (url.pathname === '/health') {
			json(res, 200, { status: 'ok' });
			return;
		}
		json(res, 404, { error: 'Not found' });
	} catch (err: any) {
		json(res, 400, { error: err.message || 'Internal server error' });
	}
});

const PORT = parseInt(process.env.PORT || '3000');
server.listen(PORT, () => console.log(`Live Streaming on http://localhost:${PORT}`));
process.on('SIGTERM', () => server.close());
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ===========================================
// 1. TYPES
// ===========================================
type Stream struct {
	ID           string   `json:"id"`
	Title        string   `json:"title"`
	StreamKey    string   `json:"streamKey,omitempty"`
	Status       string   `json:"status"`
	StartedAt    *string  `json:"startedAt,omitempty"`
	EndedAt      *string  `json:"endedAt,omitempty"`
	BroadcasterID string  `json:"broadcasterId"`
	Quality      []string `json:"quality"`
	ViewerCount  int      `json:"viewerCount"`
	ChatEnabled  bool     `json:"chatEnabled"`
}

type Segment struct {
	StreamID    string  `json:"streamId"`
	Quality     string  `json:"quality"`
	SequenceNum int     `json:"sequenceNum"`
	Duration    float64 `json:"duration"`
	Data        string  `json:"data"`
}

type ChatMessage struct {
	ID         string `json:"id"`
	StreamID   string `json:"streamId"`
	UserID     string `json:"userId"`
	Username   string `json:"username"`
	Content    string `json:"content"`
	Timestamp  int64  `json:"timestamp"`
	StreamTime float64 `json:"streamTime"`
}

// ===========================================
// 2. STREAM MANAGER
// ===========================================
type StreamManager struct {
	mu           sync.RWMutex
	streams      map[string]*Stream
	streamsByKey map[string]string
	counter      int
}

func NewStreamManager() *StreamManager {
	return &StreamManager{streams: make(map[string]*Stream), streamsByKey: make(map[string]string)}
}

func (sm *StreamManager) Create(broadcasterID, title string) *Stream {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.counter++
	keyBytes := make([]byte, 16)
	rand.Read(keyBytes)
	s := &Stream{
		ID: fmt.Sprintf("stream_%d", sm.counter), Title: title,
		StreamKey: "live_" + hex.EncodeToString(keyBytes), Status: "idle",
		BroadcasterID: broadcasterID, Quality: []string{"1080p", "720p", "480p", "360p"},
		ChatEnabled: true,
	}
	sm.streams[s.ID] = s
	sm.streamsByKey[s.StreamKey] = s.ID
	return s
}

func (sm *StreamManager) Auth(key string) *Stream {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	if id, ok := sm.streamsByKey[key]; ok { return sm.streams[id] }
	return nil
}

func (sm *StreamManager) GoLive(id string) (*Stream, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	s := sm.streams[id]
	if s == nil { return nil, fmt.Errorf("not found") }
	if s.Status == "live" { return nil, fmt.Errorf("already live") }
	s.Status = "live"
	now := time.Now().UTC().Format(time.RFC3339)
	s.StartedAt = &now
	log.Printf("[STREAM] %s is LIVE — %s", s.ID, s.Title)
	return s, nil
}

func (sm *StreamManager) EndStream(id string) (*Stream, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	s := sm.streams[id]
	if s == nil { return nil, fmt.Errorf("not found") }
	s.Status = "ended"
	now := time.Now().UTC().Format(time.RFC3339)
	s.EndedAt = &now
	return s, nil
}

func (sm *StreamManager) Get(id string) *Stream {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.streams[id]
}

func (sm *StreamManager) GetLive() []*Stream {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	var result []*Stream
	for _, s := range sm.streams {
		if s.Status == "live" { result = append(result, s) }
	}
	return result
}

// ===========================================
// 3. SEGMENT BUFFER
// ===========================================
type SegmentBuffer struct {
	mu       sync.RWMutex
	segments map[string][]Segment // "streamId:quality" -> segments
	seqNums  map[string]int
}

func NewSegmentBuffer() *SegmentBuffer {
	return &SegmentBuffer{segments: make(map[string][]Segment), seqNums: make(map[string]int)}
}

func (sb *SegmentBuffer) Add(streamID, quality string, duration float64) {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	key := streamID + ":" + quality
	sb.seqNums[key]++
	seg := Segment{StreamID: streamID, Quality: quality, SequenceNum: sb.seqNums[key],
		Duration: duration, Data: fmt.Sprintf("segment_%d_%s.ts", sb.seqNums[key], quality)}
	list := sb.segments[key]
	list = append(list, seg)
	if len(list) > 15 { list = list[len(list)-15:] }
	sb.segments[key] = list
}

func (sb *SegmentBuffer) GetPlaylist(streamID, quality string) string {
	sb.mu.RLock()
	defer sb.mu.RUnlock()
	segs := sb.segments[streamID+":"+quality]
	if len(segs) == 0 { return "" }
	var b strings.Builder
	fmt.Fprintf(&b, "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:%d\n\n", segs[0].SequenceNum)
	for _, s := range segs {
		fmt.Fprintf(&b, "#EXTINF:%.3f,\n%s\n", s.Duration, s.Data)
	}
	return b.String()
}

func (sb *SegmentBuffer) GetMasterPlaylist(streamID string, qualities []string) string {
	bw := map[string]int{"1080p": 5000000, "720p": 2500000, "480p": 1000000, "360p": 500000}
	res := map[string]string{"1080p": "1920x1080", "720p": "1280x720", "480p": "854x480", "360p": "640x360"}
	var b strings.Builder
	b.WriteString("#EXTM3U\n#EXT-X-VERSION:3\n\n")
	for _, q := range qualities {
		fmt.Fprintf(&b, "#EXT-X-STREAM-INF:BANDWIDTH=%d,RESOLUTION=%s\n%s/playlist.m3u8\n\n", bw[q], res[q], q)
	}
	return b.String()
}

// ===========================================
// 4. LIVE CHAT
// ===========================================
type LiveChat struct {
	mu       sync.Mutex
	messages map[string][]ChatMessage
	rateLimit map[string]int64
	counter   int
}

func NewLiveChat() *LiveChat {
	return &LiveChat{messages: make(map[string][]ChatMessage), rateLimit: make(map[string]int64)}
}

func (lc *LiveChat) Send(streamID, userID, username, content string, startTime int64) (*ChatMessage, error) {
	lc.mu.Lock()
	defer lc.mu.Unlock()
	key := userID + ":" + streamID
	if last, ok := lc.rateLimit[key]; ok && time.Now().UnixMilli()-last < 3000 {
		return nil, fmt.Errorf("slow mode active")
	}
	lc.counter++
	msg := ChatMessage{
		ID: fmt.Sprintf("msg_%d", lc.counter), StreamID: streamID,
		UserID: userID, Username: username, Content: content,
		Timestamp: time.Now().UnixMilli(),
	}
	if startTime > 0 { msg.StreamTime = float64(time.Now().UnixMilli()-startTime) / 1000 }
	list := lc.messages[streamID]
	list = append(list, msg)
	if len(list) > 200 { list = list[len(list)-200:] }
	lc.messages[streamID] = list
	lc.rateLimit[key] = time.Now().UnixMilli()
	return &msg, nil
}

func (lc *LiveChat) GetRecent(streamID string, limit int) []ChatMessage {
	lc.mu.Lock()
	defer lc.mu.Unlock()
	msgs := lc.messages[streamID]
	start := len(msgs) - limit
	if start < 0 { start = 0 }
	return msgs[start:]
}

// ===========================================
// 5. TRANSCODER + VIEWER MANAGER
// ===========================================
type LiveTranscoder struct {
	mu      sync.Mutex
	buffer  *SegmentBuffer
	timers  map[string]*time.Ticker
}

func NewTranscoder(buf *SegmentBuffer) *LiveTranscoder {
	return &LiveTranscoder{buffer: buf, timers: make(map[string]*time.Ticker)}
}

func (t *LiveTranscoder) Start(streamID string, qualities []string) {
	ticker := time.NewTicker(2 * time.Second)
	t.mu.Lock()
	t.timers[streamID] = ticker
	t.mu.Unlock()
	go func() {
		for range ticker.C {
			for _, q := range qualities { t.buffer.Add(streamID, q, 2.0) }
		}
	}()
}

func (t *LiveTranscoder) Stop(streamID string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if ticker, ok := t.timers[streamID]; ok { ticker.Stop(); delete(t.timers, streamID) }
}

type ViewerManager struct {
	mu      sync.Mutex
	viewers map[string]int64 // "userId:streamId" -> lastHeartbeat
}

func NewViewerManager() *ViewerManager {
	return &ViewerManager{viewers: make(map[string]int64)}
}

func (vm *ViewerManager) Join(userID, streamID string) {
	vm.mu.Lock(); defer vm.mu.Unlock()
	vm.viewers[userID+":"+streamID] = time.Now().UnixMilli()
}

func (vm *ViewerManager) Count(streamID string) int {
	vm.mu.Lock(); defer vm.mu.Unlock()
	count := 0; cutoff := time.Now().UnixMilli() - 30000
	for k, ts := range vm.viewers {
		if strings.HasSuffix(k, ":"+streamID) && ts > cutoff { count++ }
	}
	return count
}

// ===========================================
// 6. HTTP SERVER
// ===========================================
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json"); w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func main() {
	sm := NewStreamManager()
	buf := NewSegmentBuffer()
	chat := NewLiveChat()
	tc := NewTranscoder(buf)
	vm := NewViewerManager()

	startP := regexp.MustCompile(`^/api/streams/([^/]+)/start$`)
	endP := regexp.MustCompile(`^/api/streams/([^/]+)/end$`)
	masterP := regexp.MustCompile(`^/api/streams/([^/]+)/master\.m3u8$`)
	variantP := regexp.MustCompile(`^/api/streams/([^/]+)/(\w+)/playlist\.m3u8$`)
	viewerP := regexp.MustCompile(`^/api/streams/([^/]+)/viewers$`)
	chatP := regexp.MustCompile(`^/api/streams/([^/]+)/chat$`)
	streamP := regexp.MustCompile(`^/api/streams/([^/]+)$`)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/streams", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost { writeJSON(w, 405, map[string]string{"error": "Method not allowed"}); return }
		var body struct{ BroadcasterID, Title string }
		json.NewDecoder(r.Body).Decode(&body)
		s := sm.Create(body.BroadcasterID, body.Title)
		writeJSON(w, 201, s)
	})

	mux.HandleFunc("/api/streams/live", func(w http.ResponseWriter, _ *http.Request) {
		live := sm.GetLive()
		writeJSON(w, 200, map[string]interface{}{"streams": live})
	})

	mux.HandleFunc("/api/streams/", func(w http.ResponseWriter, r *http.Request) {
		if m := startP.FindStringSubmatch(r.URL.Path); m != nil && r.Method == http.MethodPost {
			var body struct{ StreamKey string `json:"streamKey"` }
			json.NewDecoder(r.Body).Decode(&body)
			s := sm.Auth(body.StreamKey)
			if s == nil || s.ID != m[1] { writeJSON(w, 401, map[string]string{"error": "Invalid key"}); return }
			live, err := sm.GoLive(s.ID)
			if err != nil { writeJSON(w, 400, map[string]string{"error": err.Error()}); return }
			tc.Start(s.ID, live.Quality)
			writeJSON(w, 200, live); return
		}
		if m := endP.FindStringSubmatch(r.URL.Path); m != nil && r.Method == http.MethodPost {
			tc.Stop(m[1])
			s, err := sm.EndStream(m[1])
			if err != nil { writeJSON(w, 400, map[string]string{"error": err.Error()}); return }
			writeJSON(w, 200, s); return
		}
		if m := masterP.FindStringSubmatch(r.URL.Path); m != nil {
			s := sm.Get(m[1])
			if s == nil || s.Status != "live" { writeJSON(w, 404, map[string]string{"error": "Not live"}); return }
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			w.Write([]byte(buf.GetMasterPlaylist(s.ID, s.Quality))); return
		}
		if m := variantP.FindStringSubmatch(r.URL.Path); m != nil {
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			w.Write([]byte(buf.GetPlaylist(m[1], m[2]))); return
		}
		if m := viewerP.FindStringSubmatch(r.URL.Path); m != nil {
			writeJSON(w, 200, map[string]int{"count": vm.Count(m[1])}); return
		}
		if m := chatP.FindStringSubmatch(r.URL.Path); m != nil {
			if r.Method == http.MethodPost {
				var body struct{ UserID, Username, Content string }
				json.NewDecoder(r.Body).Decode(&body)
				s := sm.Get(m[1])
				var startMs int64
				if s != nil && s.StartedAt != nil {
					if t, err := time.Parse(time.RFC3339, *s.StartedAt); err == nil { startMs = t.UnixMilli() }
				}
				msg, err := chat.Send(m[1], body.UserID, body.Username, body.Content, startMs)
				if err != nil { writeJSON(w, 429, map[string]string{"error": err.Error()}); return }
				writeJSON(w, 201, msg); return
			}
			limit := 50
			if l := r.URL.Query().Get("limit"); l != "" { limit, _ = strconv.Atoi(l) }
			writeJSON(w, 200, map[string]interface{}{"messages": chat.GetRecent(m[1], limit)}); return
		}
		if m := streamP.FindStringSubmatch(r.URL.Path); m != nil {
			s := sm.Get(m[1])
			if s == nil { writeJSON(w, 404, map[string]string{"error": "Not found"}); return }
			s.ViewerCount = vm.Count(s.ID)
			writeJSON(w, 200, s); return
		}
		writeJSON(w, 404, map[string]string{"error": "Not found"})
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	port := os.Getenv("PORT"); if port == "" { port = "3000" }
	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second}
	go func() {
		log.Printf("Live Streaming on http://localhost:%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed { log.Fatal(err) }
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	srv.Close()
}
```

</div>
</CodeTabs>

## ডিজাইন সিদ্ধান্তের ব্যাখ্যা

### Ingest-এর জন্য RTMP কেন?

RTMP low-latency, reliable, bidirectional streaming দেয় আর বহু encoder-এ support পায় (OBS, Streamlabs, FFmpeg)। SRT-র মতো নতুন protocol গুলো ভালো error correction দিলেও, RTMP-র সর্বব্যাপীতা এটাকে বাস্তবসম্মত পছন্দ করে তোলে। প্রতিটি streaming software এটা out of the box support করে।

### Viewer-দের কাছে RTMP-র বদলে delivery-র জন্য HLS কেন?

RTMP-র persistent TCP connection দরকার আর এটা CDN-র সাথে কাজ করে না (যেগুলো HTTP response cache করে)। HLS ছোট segment file-এর জন্য standard HTTP request ব্যবহার করে, ফলে সেগুলো সহজেই cacheable। যখন 100K viewer একই segment request করে, CDN তাদের মধ্যে 99,999 জনকে cache থেকে serve করে। RTMP-তে আপনার server-এ 100K individual connection দরকার হতো।

### Sliding Window Manifest কেন?

একটা live HLS playlist চিরকাল বাড়তে পারে না — 2-সেকেন্ড segment-এ 24-ঘণ্টার একটা স্ট্রিমে 43,200 entry থাকত। sliding window শুধু শেষ N segment রাখে (যেমন, 15 segment = 30 সেকেন্ড)। নতুন viewer-রা live edge থেকে শুরু করে, আর `EXT-X-MEDIA-SEQUENCE` tag নিশ্চিত করে যে পুরনো segment সরে গেলেও player সঠিক segment ordering জানে।

### Keyframe-Aligned Segment কেন?

ভিডিও codec keyframe (I-frame)-কে reference point হিসেবে ব্যবহার করে — আপনি শুধু একটা keyframe থেকেই decode শুরু করতে পারেন। quality level জুড়ে segment গুলো keyframe boundary-তে align না হলে, segment-এর মাঝখানে 720p থেকে 480p-তে switch করলে visual artifact তৈরি হবে। keyframe alignment প্রতিটি segment boundary-তে পরিষ্কার quality switching নিশ্চিত করে।

### Video থেকে Chat আলাদা কেন?

Chat আর video-র latency profile আলাদা। video-র 3-5 সেকেন্ড delivery latency থাকে (segment buffering)। chat প্রায় সাথে সাথেই হতে পারে (WebSocket)। এদের একসাথে করলে হয় chat delay হবে (interaction-এর জন্য খারাপ) নয়তো জটিল synchronization দরকার হবে। এদের আলাদা রেখে chat message-এ stream timestamp যোগ করলে client-রা চাইলে সেগুলো sync করতে পারে।

<div class="takeaways">

### মূল শিক্ষা

- Ingest-এর জন্য RTMP + delivery-র জন্য HLS হলো industry-standard বিভাজন — RTMP upload-এর জন্য low-latency, HLS distribution-এর জন্য CDN-friendly
- quality level জুড়ে keyframe-aligned segment স্ট্রিমের মাঝখানে seamless quality switching সম্ভব করে
- sliding window HLS manifest playlist-কে সীমিত রাখে — viewer-রা live edge-এ যোগ দেয়, DVR user-রা একটা লম্বা window পায়
- live chat rate-limited আর video delivery থেকে decoupled হতে হবে — একটা chat storm-এর video quality-তে প্রভাব ফেলা উচিত নয়
- stream health monitoring viewer লক্ষ্য করার আগেই encoding সমস্যা ধরে ফেলে — dropped frame, bitrate drop, audio desync
- CDN edge caching অত্যন্ত জরুরি — এটা ছাড়া একই segment request করা 100K viewer origin server-কে overwhelm করে দিত

</div>

<div class="when-to-use">

### বাস্তব জগতে ব্যবহার

- **Twitch** একটা global CDN-এর মধ্য দিয়ে RTMP ingest → real-time transcoding → HLS delivery ব্যবহার করে 30M+ concurrent viewer সামলায়
- **YouTube Live** automatic quality transcoding সহ RTMP/SRT ingest আর sub-3-সেকেন্ড latency-র জন্য LL-HLS ব্যবহার করে
- **Netflix Live** (2024-এ চালু) তাদের বিদ্যমান CDN infrastructure ব্যবহার করে 200M+ subscriber-কে লাইভ ইভেন্ট serve করে
- **Discord** screen sharing-এর জন্য WebRTC ব্যবহার করে (sub-1-সেকেন্ড latency) কিন্তু বড় audience-এর কাছে Go Live stream-এর জন্য HLS
- এই architecture প্রতিটিতে 100K+ viewer সহ 10K concurrent stream support করে, sub-5-সেকেন্ড glass-to-glass latency-তে

</div>
```
