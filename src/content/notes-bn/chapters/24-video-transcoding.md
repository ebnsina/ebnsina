---
title: 'কেস স্টাডি: ভিডিও ট্রান্সকোডিং সার্ভিস'
subtitle: 'VOD প্রসেসিং, adaptive bitrate encoding, job scheduling এবং distributed workers সহ একটি প্রোডাকশন ভিডিও ট্রান্সকোডিং পাইপলাইন ডিজাইন ও তৈরি করুন।'
chapter: 24
level: 'advanced'
readingTime: '34 মিনিট'
topics: ['video transcoding', 'VOD', 'adaptive bitrate', 'job queue', 'distributed processing']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## ভিডিও ট্রান্সকোডিং কেন একটি Distributed Systems সমস্যা

YouTube, Netflix বা TikTok-এ আপলোড হওয়া প্রতিটি ভিডিও একজন দর্শকের দেখার আগেই ট্রান্সকোড করতে হয়। একটি raw আপলোড নিজে থেকে অকেজো — এটিকে **একাধিক resolution**-এ (1080p, 720p, 480p, 360p) কনভার্ট করতে হয়, **একাধিক codec**-এ (H.264, H.265/HEVC, VP9, AV1) encode করতে হয়, এবং **adaptive bitrate streaming**-এর (HLS/DASH) জন্য package করতে হয়। একটি মাত্র 4K ভিডিও আপলোড সহজেই **20+ output ফাইল** তৈরি করতে পারে: চারটি resolution গুণ তিনটি codec, সেই সাথে thumbnail sprite, preview clip এবং manifest ফাইল।

এই কাজটি অসাধারণ রকমের CPU-intensive। এক মিনিট 4K ভিডিওকে H.265-এ ট্রান্সকোড করতে একটি আধুনিক CPU core-এ 5-15 মিনিট লাগতে পারে। একটি 2-ঘণ্টার সিনেমা একটি মেশিনে করতে গেলে কয়েক দিন লেগে যাবে। একমাত্র বাস্তবসম্মত সমাধান হলো **ভিডিওকে segment-এ ভাগ করা** এবং কাজটিকে একটি worker pool-এর মধ্যে ছড়িয়ে দেওয়া যারা segment গুলো parallel-এ process করে। এটি একটি ক্লাসিক distributed systems সমস্যা: job scheduling, work distribution, failure detection, progress aggregation এবং result assembly।

<Callout type="info">

**বাস্তব জগতের উপমা**

একটি factory assembly line-এর মতো — raw footage ঢোকে, একাধিক ধাপের মধ্য দিয়ে process হয় (resize, compress, format), এবং একসাথে একাধিক ভার্সন হিসেবে বেরিয়ে আসে (HD, SD, mobile)।

</Callout>

এটিকে একটি printing press-এর মতো ভাবুন যা একটি manuscript নিয়ে একইসাথে একটি paperback সংস্করণ, একটি hardcover সংস্করণ, একটি audiobook এবং একটি e-book তৈরি করে — প্রতিটি তার নিজ medium-এর জন্য optimized। manuscript-কে chapter-এ ভাগ করতে হবে, প্রতিটি chapter আলাদা production line-এ পাঠাতে হবে, এবং শেষ হওয়া chapter গুলো আবার সম্পূর্ণ বইতে জোড়া লাগাতে হবে। যদি একটি production line নষ্ট হয়ে যায়, progress না হারিয়ে বা duplicate তৈরি না করে তার chapter গুলো আরেকটি line-এ reassign করতে হবে। printing press-কে একটি manuscript-এর queue-ও ন্যায্যভাবে সামলাতে হবে, যাতে এক লেখকের 1000-পৃষ্ঠার novel বাকি সবার short story-কে ব্লক না করে।

<Mermaid
title="Video Transcoding Architecture"
code={`graph TD
  U["Upload API<br/>Ingest Video"] --> J["Job Scheduler<br/>Split & Queue"] --> W["Worker Pool<br/>Transcode"]
  W --> O["Object Store<br/>Source & Output"] --> P["Progress Tracker<br/>Job Status"] --> CDN["CDN<br/>HLS / DASH Delivery"]`}
/>

## Requirements

- **Functional**: ভিডিও ফাইল আপলোড করা, একাধিক resolution ও codec-এ ট্রান্সকোড করা, HLS/DASH manifest তৈরি করা, configurable interval-এ thumbnail বের করা, ETA সহ per-segment progress ট্র্যাক করা, job সম্পন্ন বা ব্যর্থ হলে webhook notification পাঠানো
- **Non-functional**: প্রতি ঘণ্টায় 1000+ ভিডিও process করা, 10GB পর্যন্ত source ফাইল সাপোর্ট করা, 99.9% job completion rate অর্জন করা, queue depth-এর ভিত্তিতে worker autoscale করা, in-progress কাজ না হারিয়ে graceful shutdown
- **Output**: HLS-এর মাধ্যমে adaptive bitrate streaming — `.m3u8` master ও variant playlist, একাধিক quality level-এ `.ts` ভিডিও segment (1080p at 5Mbps, 720p at 2.8Mbps, 480p at 1.4Mbps, 360p at 800Kbps)

## VOD বনাম Live: দুটি ভিন্ন জগৎ

source material **সম্পূর্ণ** নাকি **real-time-এ আসছে** তার উপর নির্ভর করে ভিডিও ট্রান্সকোডিং দুটি মৌলিকভাবে ভিন্ন পাইপলাইনে ভাগ হয়ে যায়। দুটির মধ্যে architecture, latency requirement এবং failure handling নাটকীয়ভাবে আলাদা।

**VOD (Video on Demand)** প্রসেসিং শুরু হয় পুরো ফাইল আপলোড হয়ে যাওয়ার পর। যেহেতু পুরো ভিডিও পাওয়া যায়, সিস্টেম আগে content বিশ্লেষণ করতে পারে — metadata (resolution, codec, duration, bitrate)-এর জন্য ভিডিও probe করে, একটি optimal encoding strategy পরিকল্পনা করে, এবং ফাইলকে এমন segment-এ ভাগ করে যেগুলো স্বাধীনভাবে ও parallel-এ ট্রান্সকোড করা যায়। একটি 2-ঘণ্টার সিনেমাকে 2-সেকেন্ডের segment-এ ভাগ করলে 3600টি segment তৈরি হয়। 100টি worker-এর একটি pool দিয়ে, পুরো সিনেমাটি প্রায় ততটুকু সময়েই ট্রান্সকোড করা যায় যতটুকু 36টি segment ক্রমানুসারে process করতে লাগে। Latency মিনিট থেকে ঘণ্টায় মাপা হয়, queue depth ও ভিডিওর দৈর্ঘ্যের উপর নির্ভর করে। YouTube, Netflix এবং Vimeo সবাই VOD পাইপলাইন ব্যবহার করে।

**Live Streaming** সম্পূর্ণ ভিন্ন জিনিস। ভিডিও একটি encoder (OBS, hardware encoder, mobile app) থেকে chunk-এর একটি continuous stream হিসেবে আসে। প্রতিটি chunk **আসার সাথে সাথে** ট্রান্সকোড করে streaming segment-এ package করতে হয়, কারণ দর্শকরা প্রায় real-time-এ দেখছে। পুরো content আগে থেকে বিশ্লেষণ করার বা দৃশ্যমান gap তৈরি না করে ব্যর্থ segment retry করার সুযোগ নেই। Latency target হলো camera থেকে screen পর্যন্ত 2-10 সেকেন্ড (glass-to-glass latency)। Twitch, YouTube Live এবং Facebook Live live পাইপলাইন চালায়। Live ট্রান্সকোডিং সাধারণত কম quality level ব্যবহার করে (3-4টি, VOD-এর 6-8টির বিপরীতে) যাতে processing time segment duration-এর নিচে থাকে।

মূল architecture-গত পার্থক্য: VOD পাইপলাইন **throughput এবং quality**-এর জন্য optimize করে (সম্ভাব্য সেরা encoding দিয়ে যত বেশি সম্ভব ভিডিও process করা), আর live পাইপলাইন **latency এবং reliability**-এর জন্য optimize করে (stream-কে কখনো buffer করতে না দেওয়া, কখনো একটি segment drop না করা)। এই chapter-টি VOD পাইপলাইনের উপর ফোকাস করে, যা এর job scheduling, parallelism এবং assembly requirement-এর কারণে বেশি জটিল system design সমস্যা।

## Adaptive Bitrate Streaming ব্যাখ্যা

Adaptive bitrate streaming (ABR) হলো সেই কৌশল যা ভিন্ন ভিন্ন network condition জুড়ে ভিডিও playback মসৃণ করে তোলে। একটি নির্দিষ্ট quality-তে একটি মাত্র ভিডিও ফাইল serve করার বদলে, server **একই ভিডিও একাধিক quality level-এ** সরবরাহ করে, এবং player available bandwidth-এর ভিত্তিতে ডায়নামিকভাবে সেগুলোর মধ্যে সুইচ করে।

**ABR কেন গুরুত্বপূর্ণ**: দ্রুত Wi-Fi connection-এ থাকা একজন user-এর ঝকঝকে 1080p ভিডিও দেখা উচিত। সেই একই user টানেলের ভেতর cellular connection-এ সুইচ করলে buffering spinner নিয়ে আটকে না গিয়ে নির্বিঘ্নে 360p-তে নেমে আসা উচিত। ABR এটিকে automatic এবং দর্শকের কাছে অদৃশ্য করে তোলে।

**HLS (HTTP Live Streaming)** হলো প্রভাবশালী ABR format, যা প্রতিটি বড় browser ও device সাপোর্ট করে। গঠনটি hierarchical:

1. **Master playlist** (`.m3u8`): একটি text ফাইল যা সব available quality variant-কে তাদের bandwidth ও resolution সহ তালিকাভুক্ত করে। কোন কোন quality level আছে তা জানতে player প্রথমে এটি পড়ে।
2. **Variant playlists** (`.m3u8`): প্রতিটি quality level-এর জন্য একটি করে। প্রতিটি playback order-এ পৃথক ভিডিও segment ফাইলগুলো তাদের duration সহ তালিকাভুক্ত করে।
3. **Segments** (`.ts`): আসল ভিডিও data, সাধারণত প্রতিটি 2-10 সেকেন্ডের। এগুলো standard MPEG-TS ফাইল যা যেকোনো HTTP server বা CDN serve করতে পারে।

Player শুরু করে master playlist ডাউনলোড করে, বর্তমান bandwidth অনুমান করে, available bandwidth-এর মধ্যে যায় এমন সর্বোচ্চ quality variant বেছে নেয়, এবং সেই variant playlist থেকে segment ডাউনলোড করা শুরু করে। প্রতি কয়েকটি segment পর, এটি আবার bandwidth অনুমান করে এবং উচ্চতর বা নিম্নতর quality variant-এ সুইচ করতে পারে। সুইচটি segment boundary-তে ঘটে, তাই এটি নির্বিঘ্ন।

**Segment duration trade-offs**: ছোট segment (2 সেকেন্ড) দ্রুত quality switching ও কম startup latency সম্ভব করে, কিন্তু বেশি HTTP request তৈরি করে এবং সামান্য খারাপ compression efficiency দেয়। বড় segment (10 সেকেন্ড) ভালো compress হয় এবং request overhead কমায়, কিন্তু quality switching-কে ধীর করে দেয় এবং minimum startup buffer বাড়ায়। ইন্ডাস্ট্রি স্ট্যান্ডার্ড হলো একটি ভারসাম্যপূর্ণ default হিসেবে **6 সেকেন্ড**, live streaming-এর জন্য 2-4 সেকেন্ড বেশি পছন্দনীয় যেখানে latency বেশি গুরুত্বপূর্ণ।

## ধাপে ধাপে: একটি ভিডিও কীভাবে ট্রান্সকোড হয়

আপলোড থেকে playback পর্যন্ত একটি ভিডিওর সম্পূর্ণ lifecycle এখানে দেওয়া হলো, পাইপলাইনের প্রতিটি ধাপ দেখিয়ে:

1. **Upload**: ক্লায়েন্ট একটি raw ভিডিও ফাইল (MP4, MOV, MKV, AVI) Upload API-তে multipart upload অথবা বড় ফাইলের জন্য resumable upload-এর মাধ্যমে আপলোড করে। ফাইলটি সরাসরি object storage-এ (S3, GCS, MinIO) লেখা হয়।

2. **Probe**: সিস্টেম আপলোড করা ফাইলে একটি metadata probe (`ffprobe`-এর সমতুল্য) চালায় বের করার জন্য: resolution, codec, frame rate, bitrate, duration, audio channel এবং container format। এই metadata নির্ধারণ করে কোন কোন transcoding profile প্রয়োগ করতে হবে।

3. **Create Transcoding Profile**: source ভিডিওর property-র ভিত্তিতে, সিস্টেম output profile বেছে নেয়। একটি 1080p source পায় 1080p, 720p, 480p এবং 360p output। একটি 720p source 1080p output বাদ দেয় (upscaling bandwidth নষ্ট করে এবং খারাপ দেখায়)। প্রতিটি profile target resolution, bitrate, codec এবং encoding preset নির্দিষ্ট করে।

4. **Split into Segments**: source ভিডিওকে যৌক্তিকভাবে N-সেকেন্ডের chunk-এ ভাগ করা হয় (default 6 সেকেন্ড)। 6-সেকেন্ড segment-এ একটি 10-মিনিটের ভিডিওর জন্য এটি 100টি segment তৈরি করে। প্রতিটি segment একটি স্বাধীন কাজের একক।

5. **Distribute to Workers**: প্রতিটি segment ও প্রতিটি quality level-এর জন্য, একটি transcoding task তৈরি করে job queue-তে যোগ করা হয়। 100টি segment গুণ 4টি quality level সমান 400টি পৃথক transcoding task। job scheduler priority ও fair scheduling মেনে pool থেকে available worker-দের task assign করে।

6. **Transcode Each Segment**: প্রতিটি worker একটি task নেয়, object storage থেকে source ভিডিওর প্রাসঙ্গিক অংশ ডাউনলোড করে, target resolution ও bitrate-এ ট্রান্সকোড করে, এবং output segment আবার object storage-এ আপলোড করে। worker progress tracker-এর কাছে progress ও completion রিপোর্ট করে।

7. **Merge and Package**: একটি নির্দিষ্ট quality level-এর সব segment সম্পন্ন হলে, সিস্টেম segment integrity যাচাই করে (সঠিক duration, কোনো gap নেই) এবং সেই quality level-এর জন্য variant playlist তৈরি করে।

8. **Generate HLS Manifest**: সব quality level সম্পন্ন হলে, সিস্টেম সব variant playlist-কে reference করে master `.m3u8` playlist তৈরি করে। ভিডিওটি এখন playback-এর জন্য প্রস্তুত।

9. **Notify Completion**: সিস্টেম configured callback URL-এ job status, output URL এবং manifest location সহ একটি webhook fire করে। ক্লায়েন্ট অ্যাপ্লিকেশন এখন ভিডিওটি দর্শকদের জন্য উপলব্ধ করতে পারে।

## Transcoding Service তৈরি করা

এখানে job scheduling, worker pool, progress tracking, HLS manifest generation এবং একটি HTTP API সহ সম্পূর্ণ transcoding service দেওয়া হলো। দুটি implementation-ই fair scheduling সহ priority queue, worker heartbeat, segment-level progress এবং graceful shutdown অন্তর্ভুক্ত করে।

<CodeTabs tsFile="video-transcoding.ts" goFile="video-transcoding.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

// ===========================================
// 1. TYPES & CONSTANTS
// ===========================================

type JobStatus =
	| 'pending'
	| 'probing'
	| 'splitting'
	| 'transcoding'
	| 'merging'
	| 'completed'
	| 'failed'
	| 'cancelled';
type SegmentStatus = 'pending' | 'assigned' | 'processing' | 'completed' | 'failed';
type WorkerStatus = 'idle' | 'busy' | 'draining' | 'offline';

interface TranscodeProfile {
	name: string;
	width: number;
	height: number;
	bitrate: number; // kbps
	codec: string;
	preset: string;
}

interface VideoSegment {
	id: string;
	jobId: string;
	index: number;
	startTime: number; // seconds
	duration: number; // seconds
	profileName: string;
	status: SegmentStatus;
	assignedWorker: string | null;
	assignedAt: number;
	completedAt: number;
	outputPath: string;
	retryCount: number;
}

interface TranscodeJob {
	id: string;
	userId: string;
	sourceUrl: string;
	status: JobStatus;
	priority: number; // lower = higher priority
	createdAt: number;
	startedAt: number;
	completedAt: number;
	sourceMeta: VideoMetadata | null;
	profiles: TranscodeProfile[];
	segments: VideoSegment[];
	webhookUrl: string;
	outputBaseUrl: string;
	error: string;
}

interface VideoMetadata {
	width: number;
	height: number;
	duration: number; // seconds
	codec: string;
	bitrate: number; // kbps
	frameRate: number;
	fileSize: number; // bytes
}

interface WorkerInfo {
	id: string;
	status: WorkerStatus;
	currentTask: string | null;
	lastHeartbeat: number;
	tasksCompleted: number;
	tasksFailed: number;
	registeredAt: number;
}

// ===========================================
// 2. TRANSCODING PROFILES
// ===========================================

const DEFAULT_PROFILES: TranscodeProfile[] = [
	{ name: '1080p', width: 1920, height: 1080, bitrate: 5000, codec: 'h264', preset: 'medium' },
	{ name: '720p', width: 1280, height: 720, bitrate: 2800, codec: 'h264', preset: 'medium' },
	{ name: '480p', width: 854, height: 480, bitrate: 1400, codec: 'h264', preset: 'fast' },
	{ name: '360p', width: 640, height: 360, bitrate: 800, codec: 'h264', preset: 'fast' }
];

const SEGMENT_DURATION = 6; // seconds
const HEARTBEAT_TIMEOUT = 30_000; // 30 seconds
const MAX_RETRIES = 3;

// ===========================================
// 3. PRIORITY QUEUE WITH FAIR SCHEDULING
// ===========================================

class FairPriorityQueue {
	private queues: Map<string, TranscodeJob[]> = new Map();
	private roundRobinIndex: number = 0;

	enqueue(job: TranscodeJob): void {
		const userQueue = this.queues.get(job.userId) || [];
		// Insert by priority within user queue
		let inserted = false;
		for (let i = 0; i < userQueue.length; i++) {
			if (job.priority < userQueue[i].priority) {
				userQueue.splice(i, 0, job);
				inserted = true;
				break;
			}
		}
		if (!inserted) userQueue.push(job);
		this.queues.set(job.userId, userQueue);
	}

	dequeue(): TranscodeJob | null {
		const userIds = Array.from(this.queues.keys()).filter(
			(uid) => (this.queues.get(uid)?.length ?? 0) > 0
		);
		if (userIds.length === 0) return null;

		// Round-robin across users for fairness
		this.roundRobinIndex = this.roundRobinIndex % userIds.length;
		const userId = userIds[this.roundRobinIndex];
		this.roundRobinIndex++;

		const queue = this.queues.get(userId)!;
		const job = queue.shift()!;
		if (queue.length === 0) this.queues.delete(userId);
		return job;
	}

	remove(jobId: string): boolean {
		for (const [userId, queue] of this.queues) {
			const idx = queue.findIndex((j) => j.id === jobId);
			if (idx !== -1) {
				queue.splice(idx, 1);
				if (queue.length === 0) this.queues.delete(userId);
				return true;
			}
		}
		return false;
	}

	size(): number {
		let total = 0;
		for (const queue of this.queues.values()) total += queue.length;
		return total;
	}
}

// ===========================================
// 4. PROGRESS TRACKER
// ===========================================

class ProgressTracker {
	private jobs: Map<string, TranscodeJob> = new Map();

	registerJob(job: TranscodeJob): void {
		this.jobs.set(job.id, job);
	}

	getJob(jobId: string): TranscodeJob | null {
		return this.jobs.get(jobId) || null;
	}

	getAllJobs(): TranscodeJob[] {
		return Array.from(this.jobs.values());
	}

	updateSegmentStatus(
		jobId: string,
		segmentId: string,
		status: SegmentStatus,
		outputPath?: string
	): void {
		const job = this.jobs.get(jobId);
		if (!job) return;
		const segment = job.segments.find((s) => s.id === segmentId);
		if (!segment) return;

		segment.status = status;
		if (status === 'completed') {
			segment.completedAt = Date.now();
			if (outputPath) segment.outputPath = outputPath;
		}
	}

	getJobProgress(jobId: string): {
		total: number;
		completed: number;
		failed: number;
		percent: number;
		eta: number;
	} {
		const job = this.jobs.get(jobId);
		if (!job) return { total: 0, completed: 0, failed: 0, percent: 0, eta: 0 };

		const total = job.segments.length;
		const completed = job.segments.filter((s) => s.status === 'completed').length;
		const failed = job.segments.filter((s) => s.status === 'failed').length;
		const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

		// ETA calculation based on throughput
		let eta = 0;
		if (completed > 0 && job.startedAt > 0) {
			const elapsed = Date.now() - job.startedAt;
			const avgPerSegment = elapsed / completed;
			const remaining = total - completed - failed;
			eta = Math.round(avgPerSegment * remaining);
		}

		return { total, completed, failed, percent, eta };
	}

	isJobComplete(jobId: string): boolean {
		const job = this.jobs.get(jobId);
		if (!job) return false;
		return job.segments.every((s) => s.status === 'completed' || s.status === 'failed');
	}

	hasFailures(jobId: string): boolean {
		const job = this.jobs.get(jobId);
		if (!job) return false;
		return job.segments.some((s) => s.status === 'failed' && s.retryCount >= MAX_RETRIES);
	}
}

// ===========================================
// 5. WORKER POOL
// ===========================================

class WorkerPool {
	private workers: Map<string, WorkerInfo> = new Map();
	private maxConcurrency: number;

	constructor(maxConcurrency: number = 10) {
		this.maxConcurrency = maxConcurrency;
	}

	registerWorker(workerId: string): WorkerInfo {
		const worker: WorkerInfo = {
			id: workerId,
			status: 'idle',
			currentTask: null,
			lastHeartbeat: Date.now(),
			tasksCompleted: 0,
			tasksFailed: 0,
			registeredAt: Date.now()
		};
		this.workers.set(workerId, worker);
		console.log(`[WORKER] Registered worker ${workerId}`);
		return worker;
	}

	heartbeat(workerId: string): boolean {
		const worker = this.workers.get(workerId);
		if (!worker) return false;
		worker.lastHeartbeat = Date.now();
		return true;
	}

	assignTask(workerId: string, taskId: string): boolean {
		const worker = this.workers.get(workerId);
		if (!worker || worker.status !== 'idle') return false;
		worker.status = 'busy';
		worker.currentTask = taskId;
		return true;
	}

	completeTask(workerId: string, success: boolean): void {
		const worker = this.workers.get(workerId);
		if (!worker) return;
		worker.status = 'idle';
		worker.currentTask = null;
		if (success) worker.tasksCompleted++;
		else worker.tasksFailed++;
	}

	getIdleWorkers(): WorkerInfo[] {
		return Array.from(this.workers.values()).filter((w) => w.status === 'idle');
	}

	getStaleWorkers(): WorkerInfo[] {
		const now = Date.now();
		return Array.from(this.workers.values()).filter(
			(w) => w.status === 'busy' && now - w.lastHeartbeat > HEARTBEAT_TIMEOUT
		);
	}

	drainWorker(workerId: string): void {
		const worker = this.workers.get(workerId);
		if (worker) {
			worker.status = 'draining';
			console.log(`[WORKER] Draining worker ${workerId}`);
		}
	}

	removeWorker(workerId: string): void {
		this.workers.delete(workerId);
		console.log(`[WORKER] Removed worker ${workerId}`);
	}

	getStatus(): { total: number; idle: number; busy: number; draining: number } {
		const workers = Array.from(this.workers.values());
		return {
			total: workers.length,
			idle: workers.filter((w) => w.status === 'idle').length,
			busy: workers.filter((w) => w.status === 'busy').length,
			draining: workers.filter((w) => w.status === 'draining').length
		};
	}

	getAllWorkers(): WorkerInfo[] {
		return Array.from(this.workers.values());
	}
}

// ===========================================
// 6. SEGMENT SPLITTER
// ===========================================

function createSegments(job: TranscodeJob): VideoSegment[] {
	if (!job.sourceMeta) return [];

	const duration = job.sourceMeta.duration;
	const segmentCount = Math.ceil(duration / SEGMENT_DURATION);
	const segments: VideoSegment[] = [];

	for (const profile of job.profiles) {
		for (let i = 0; i < segmentCount; i++) {
			const startTime = i * SEGMENT_DURATION;
			const segDuration = Math.min(SEGMENT_DURATION, duration - startTime);

			segments.push({
				id: `${job.id}-${profile.name}-seg${i.toString().padStart(4, '0')}`,
				jobId: job.id,
				index: i,
				startTime,
				duration: segDuration,
				profileName: profile.name,
				status: 'pending',
				assignedWorker: null,
				assignedAt: 0,
				completedAt: 0,
				outputPath: '',
				retryCount: 0
			});
		}
	}

	return segments;
}

// ===========================================
// 7. HLS MANIFEST GENERATOR
// ===========================================

function generateMasterPlaylist(job: TranscodeJob): string {
	let manifest = '#EXTM3U\n#EXT-X-VERSION:3\n\n';

	for (const profile of job.profiles) {
		const bandwidth = profile.bitrate * 1000; // convert kbps to bps
		manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${profile.width}x${profile.height},CODECS="avc1.640028"\n`;
		manifest += `${profile.name}/playlist.m3u8\n\n`;
	}

	return manifest;
}

function generateVariantPlaylist(job: TranscodeJob, profileName: string): string {
	const profileSegments = job.segments
		.filter((s) => s.profileName === profileName && s.status === 'completed')
		.sort((a, b) => a.index - b.index);

	let manifest = '#EXTM3U\n#EXT-X-VERSION:3\n';
	manifest += `#EXT-X-TARGETDURATION:${SEGMENT_DURATION}\n`;
	manifest += '#EXT-X-MEDIA-SEQUENCE:0\n\n';

	for (const segment of profileSegments) {
		manifest += `#EXTINF:${segment.duration.toFixed(3)},\n`;
		manifest += `segment${segment.index.toString().padStart(4, '0')}.ts\n`;
	}

	manifest += '#EXT-X-ENDLIST\n';
	return manifest;
}

// ===========================================
// 8. WEBHOOK NOTIFIER
// ===========================================

class WebhookNotifier {
	private pending: Array<{ url: string; payload: object; retries: number }> = [];

	async notify(url: string, payload: object): Promise<void> {
		if (!url) return;

		console.log(`[WEBHOOK] Sending notification to ${url}`);
		// In production, this would be an HTTP POST request.
		// Simulating the webhook delivery with retry logic.
		this.pending.push({ url, payload, retries: 0 });
		await this.deliver();
	}

	private async deliver(): Promise<void> {
		const batch = [...this.pending];
		this.pending = [];

		for (const entry of batch) {
			try {
				// Simulated delivery — in production: fetch(entry.url, { method: "POST", body: JSON.stringify(entry.payload) })
				console.log(
					`[WEBHOOK] Delivered to ${entry.url}: ${JSON.stringify(entry.payload).slice(0, 120)}...`
				);
			} catch (err) {
				if (entry.retries < 3) {
					entry.retries++;
					this.pending.push(entry);
					console.log(`[WEBHOOK] Retry ${entry.retries} for ${entry.url}`);
				} else {
					console.log(`[WEBHOOK] Failed permanently for ${entry.url}`);
				}
			}
		}
	}
}

// ===========================================
// 9. TRANSCODING SERVICE (ORCHESTRATOR)
// ===========================================

class TranscodingService {
	private queue: FairPriorityQueue;
	private tracker: ProgressTracker;
	private pool: WorkerPool;
	private notifier: WebhookNotifier;
	private processing: boolean = false;
	private shutdownRequested: boolean = false;

	constructor(workerCount: number = 4) {
		this.queue = new FairPriorityQueue();
		this.tracker = new ProgressTracker();
		this.pool = new WorkerPool(workerCount);
		this.notifier = new WebhookNotifier();

		// Register simulated workers
		for (let i = 0; i < workerCount; i++) {
			this.pool.registerWorker(`worker-${i}`);
		}
	}

	submitJob(
		userId: string,
		sourceUrl: string,
		webhookUrl: string = '',
		priority: number = 5
	): TranscodeJob {
		const job: TranscodeJob = {
			id: crypto.randomUUID(),
			userId,
			sourceUrl,
			status: 'pending',
			priority,
			createdAt: Date.now(),
			startedAt: 0,
			completedAt: 0,
			sourceMeta: null,
			profiles: [],
			segments: [],
			webhookUrl,
			outputBaseUrl: '',
			error: ''
		};

		this.tracker.registerJob(job);
		this.queue.enqueue(job);
		console.log(`[JOB] Submitted job ${job.id} for user ${userId} (priority ${priority})`);
		return job;
	}

	async processNextJob(): Promise<void> {
		if (this.shutdownRequested) return;

		const job = this.queue.dequeue();
		if (!job) return;

		this.processing = true;
		job.startedAt = Date.now();

		try {
			// Step 1: Probe video
			job.status = 'probing';
			console.log(`[JOB] Probing ${job.id}...`);
			job.sourceMeta = this.probeVideo(job.sourceUrl);

			// Step 2: Select profiles based on source resolution
			job.status = 'splitting';
			job.profiles = this.selectProfiles(job.sourceMeta);
			console.log(`[JOB] Selected ${job.profiles.length} profiles for ${job.id}`);

			// Step 3: Create segments
			job.segments = createSegments(job);
			console.log(`[JOB] Created ${job.segments.length} segments for ${job.id}`);

			// Step 4: Transcode segments via worker pool
			job.status = 'transcoding';
			await this.transcodeSegments(job);

			// Step 5: Check for failures
			if (this.tracker.hasFailures(job.id)) {
				job.status = 'failed';
				job.error = 'Some segments failed after max retries';
				console.log(`[JOB] Job ${job.id} FAILED`);
			} else {
				// Step 6: Generate manifests
				job.status = 'merging';
				job.outputBaseUrl = `/output/${job.id}`;
				console.log(`[JOB] Generating manifests for ${job.id}`);

				const masterPlaylist = generateMasterPlaylist(job);
				console.log(`[MANIFEST] Master playlist:\n${masterPlaylist}`);

				for (const profile of job.profiles) {
					const variantPlaylist = generateVariantPlaylist(job, profile.name);
					console.log(`[MANIFEST] Variant ${profile.name}:\n${variantPlaylist}`);
				}

				job.status = 'completed';
				job.completedAt = Date.now();
				const elapsed = ((job.completedAt - job.startedAt) / 1000).toFixed(1);
				console.log(`[JOB] Job ${job.id} COMPLETED in ${elapsed}s`);
			}

			// Step 7: Webhook notification
			await this.notifier.notify(job.webhookUrl, {
				jobId: job.id,
				status: job.status,
				outputBaseUrl: job.outputBaseUrl,
				manifestUrl: `${job.outputBaseUrl}/master.m3u8`,
				completedAt: job.completedAt
			});
		} catch (err) {
			job.status = 'failed';
			job.error = err instanceof Error ? err.message : 'Unknown error';
			console.log(`[JOB] Job ${job.id} FAILED: ${job.error}`);
		}

		this.processing = false;
	}

	private probeVideo(sourceUrl: string): VideoMetadata {
		// Simulates ffprobe — in production this runs ffprobe on the source file
		return {
			width: 1920,
			height: 1080,
			duration: 120, // 2 minutes
			codec: 'h264',
			bitrate: 8000,
			frameRate: 30,
			fileSize: 120_000_000
		};
	}

	private selectProfiles(meta: VideoMetadata): TranscodeProfile[] {
		// Only include profiles at or below the source resolution
		return DEFAULT_PROFILES.filter((p) => p.height <= meta.height);
	}

	private async transcodeSegments(job: TranscodeJob): Promise<void> {
		const pendingSegments = () => job.segments.filter((s) => s.status === 'pending');
		const activeSegments = () =>
			job.segments.filter((s) => s.status === 'assigned' || s.status === 'processing');

		while (pendingSegments().length > 0 || activeSegments().length > 0) {
			if (this.shutdownRequested) {
				console.log(`[JOB] Shutdown requested, draining active tasks for ${job.id}`);
				break;
			}

			// Check for stale workers and reassign their segments
			this.handleStaleWorkers(job);

			// Assign pending segments to idle workers
			const idle = this.pool.getIdleWorkers();
			const pending = pendingSegments();

			for (const worker of idle) {
				if (pending.length === 0) break;
				const segment = pending.shift()!;

				if (this.pool.assignTask(worker.id, segment.id)) {
					segment.status = 'assigned';
					segment.assignedWorker = worker.id;
					segment.assignedAt = Date.now();

					// Simulate async transcoding
					this.simulateTranscode(job.id, segment, worker.id);
				}
			}

			// Wait before checking again
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	private simulateTranscode(jobId: string, segment: VideoSegment, workerId: string): void {
		segment.status = 'processing';

		// Simulate transcoding time (50-200ms in simulation, minutes in reality)
		const transcodeTime = 50 + Math.random() * 150;

		setTimeout(() => {
			// Simulate 5% failure rate
			const success = Math.random() > 0.05;

			if (success) {
				const outputPath = `/output/${jobId}/${segment.profileName}/segment${segment.index.toString().padStart(4, '0')}.ts`;
				this.tracker.updateSegmentStatus(jobId, segment.id, 'completed', outputPath);
				this.pool.completeTask(workerId, true);
				this.pool.heartbeat(workerId);
			} else {
				segment.retryCount++;
				if (segment.retryCount < MAX_RETRIES) {
					segment.status = 'pending'; // Re-queue for retry
					segment.assignedWorker = null;
					console.log(`[RETRY] Segment ${segment.id} retry ${segment.retryCount}/${MAX_RETRIES}`);
				} else {
					this.tracker.updateSegmentStatus(jobId, segment.id, 'failed');
					console.log(`[FAIL] Segment ${segment.id} permanently failed`);
				}
				this.pool.completeTask(workerId, false);
			}
		}, transcodeTime);
	}

	private handleStaleWorkers(job: TranscodeJob): void {
		const stale = this.pool.getStaleWorkers();
		for (const worker of stale) {
			console.log(`[HEARTBEAT] Worker ${worker.id} stale, reassigning task`);
			const segment = job.segments.find(
				(s) =>
					s.assignedWorker === worker.id && (s.status === 'assigned' || s.status === 'processing')
			);
			if (segment) {
				segment.status = 'pending';
				segment.assignedWorker = null;
				segment.retryCount++;
			}
			this.pool.removeWorker(worker.id);
			// Re-register as a fresh worker (simulates replacement)
			this.pool.registerWorker(worker.id);
		}
	}

	cancelJob(jobId: string): boolean {
		const job = this.tracker.getJob(jobId);
		if (!job) return false;

		if (job.status === 'pending') {
			this.queue.remove(jobId);
		}

		job.status = 'cancelled';
		console.log(`[JOB] Cancelled job ${jobId}`);
		return true;
	}

	getJob(jobId: string): TranscodeJob | null {
		return this.tracker.getJob(jobId);
	}

	getJobProgress(jobId: string) {
		return this.tracker.getJobProgress(jobId);
	}

	getWorkerStatus() {
		return {
			pool: this.pool.getStatus(),
			workers: this.pool.getAllWorkers()
		};
	}

	async gracefulShutdown(): Promise<void> {
		console.log('[SHUTDOWN] Initiating graceful shutdown...');
		this.shutdownRequested = true;

		// Drain all workers — let them finish current tasks
		for (const worker of this.pool.getAllWorkers()) {
			if (worker.status === 'busy') {
				this.pool.drainWorker(worker.id);
			}
		}

		// Wait for active tasks to complete (with timeout)
		const deadline = Date.now() + 30_000;
		while (this.processing && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		console.log('[SHUTDOWN] Graceful shutdown complete');
	}
}

// ===========================================
// 10. HTTP SERVER
// ===========================================

const service = new TranscodingService(4);

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url || '/', `http://${req.headers.host}`);
	const method = req.method || 'GET';

	// Parse JSON body for POST requests
	const readBody = (): Promise<any> =>
		new Promise((resolve) => {
			let data = '';
			req.on('data', (chunk) => (data += chunk));
			req.on('end', () => {
				try {
					resolve(JSON.parse(data));
				} catch {
					resolve({});
				}
			});
		});

	const json = (status: number, body: object) => {
		res.writeHead(status, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(body, null, 2));
	};

	// POST /api/transcode — Submit a new transcoding job
	if (method === 'POST' && url.pathname === '/api/transcode') {
		const body = await readBody();
		if (!body.sourceUrl || !body.userId) {
			return json(400, { error: 'sourceUrl and userId are required' });
		}
		const job = service.submitJob(
			body.userId,
			body.sourceUrl,
			body.webhookUrl || '',
			body.priority || 5
		);
		// Start processing asynchronously
		service.processNextJob();
		return json(201, { jobId: job.id, status: job.status });
	}

	// GET /api/jobs/:id — Get job status and progress
	const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
	if (method === 'GET' && jobMatch) {
		const job = service.getJob(jobMatch[1]);
		if (!job) return json(404, { error: 'Job not found' });
		const progress = service.getJobProgress(job.id);
		return json(200, {
			id: job.id,
			userId: job.userId,
			status: job.status,
			progress,
			sourceMeta: job.sourceMeta,
			profiles: job.profiles.map((p) => p.name),
			createdAt: job.createdAt,
			startedAt: job.startedAt,
			completedAt: job.completedAt,
			error: job.error || undefined
		});
	}

	// GET /api/jobs/:id/manifest — Get HLS master playlist
	const manifestMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/manifest$/);
	if (method === 'GET' && manifestMatch) {
		const job = service.getJob(manifestMatch[1]);
		if (!job) return json(404, { error: 'Job not found' });
		if (job.status !== 'completed') {
			return json(409, { error: 'Job not yet completed', status: job.status });
		}
		const manifest = generateMasterPlaylist(job);
		res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
		return res.end(manifest);
	}

	// DELETE /api/jobs/:id — Cancel a job
	const cancelMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
	if (method === 'DELETE' && cancelMatch) {
		const success = service.cancelJob(cancelMatch[1]);
		if (!success) return json(404, { error: 'Job not found' });
		return json(200, { status: 'cancelled' });
	}

	// GET /api/workers — Worker pool status
	if (method === 'GET' && url.pathname === '/api/workers') {
		return json(200, service.getWorkerStatus());
	}

	json(404, { error: 'Not found' });
});

// Graceful shutdown handlers
process.on('SIGINT', async () => {
	await service.gracefulShutdown();
	server.close();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	await service.gracefulShutdown();
	server.close();
	process.exit(0);
});

// --- Demo ---
async function demo() {
	console.log('=== Video Transcoding Service Demo ===\n');

	// Submit jobs from different users
	const job1 = service.submitJob(
		'user-alice',
		'/uploads/alice-vacation.mp4',
		'https://example.com/webhook',
		3
	);
	const job2 = service.submitJob('user-bob', '/uploads/bob-tutorial.mp4', '', 5);
	const job3 = service.submitJob(
		'user-alice',
		'/uploads/alice-concert.mp4',
		'https://example.com/webhook',
		7
	);

	console.log(`\nQueue: 3 jobs submitted\n`);

	// Process first job
	console.log('--- Processing Job 1 ---');
	await service.processNextJob();

	// Wait for transcoding to finish
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Check progress
	const progress = service.getJobProgress(job1.id);
	console.log(
		`\nJob 1 progress: ${progress.percent}% (${progress.completed}/${progress.total} segments)`
	);

	const finalJob = service.getJob(job1.id);
	console.log(`Job 1 status: ${finalJob?.status}`);

	if (finalJob?.status === 'completed') {
		console.log('\n--- HLS Master Playlist ---');
		console.log(generateMasterPlaylist(finalJob));
	}

	// Worker pool status
	console.log('--- Worker Pool ---');
	console.log(JSON.stringify(service.getWorkerStatus().pool, null, 2));

	// Process remaining jobs
	console.log('\n--- Processing Job 2 ---');
	await service.processNextJob();
	await new Promise((resolve) => setTimeout(resolve, 3000));

	console.log('\n--- Processing Job 3 ---');
	await service.processNextJob();
	await new Promise((resolve) => setTimeout(resolve, 3000));

	console.log('\n=== All jobs processed ===');

	// Start HTTP server
	const PORT = 3900;
	server.listen(PORT, () => {
		console.log(`\nHTTP server listening on http://localhost:${PORT}`);
		console.log('Endpoints:');
		console.log('  POST /api/transcode        — Submit job');
		console.log('  GET  /api/jobs/:id          — Job status');
		console.log('  GET  /api/jobs/:id/manifest — HLS manifest');
		console.log('  DELETE /api/jobs/:id        — Cancel job');
		console.log('  GET  /api/workers           — Worker pool status');
	});
}

demo().catch(console.error);
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ===========================================
// 1. TYPES & CONSTANTS
// ===========================================

type JobStatus string
type SegmentStatus string
type WorkerStatusType string

const (
	JobPending     JobStatus = "pending"
	JobProbing     JobStatus = "probing"
	JobSplitting   JobStatus = "splitting"
	JobTranscoding JobStatus = "transcoding"
	JobMerging     JobStatus = "merging"
	JobCompleted   JobStatus = "completed"
	JobFailed      JobStatus = "failed"
	JobCancelled   JobStatus = "cancelled"

	SegPending    SegmentStatus = "pending"
	SegAssigned   SegmentStatus = "assigned"
	SegProcessing SegmentStatus = "processing"
	SegCompleted  SegmentStatus = "completed"
	SegFailed     SegmentStatus = "failed"

	WorkerIdle     WorkerStatusType = "idle"
	WorkerBusy     WorkerStatusType = "busy"
	WorkerDraining WorkerStatusType = "draining"

	SegmentDuration  = 6
	HeartbeatTimeout = 30 * time.Second
	MaxRetries       = 3
)

type TranscodeProfile struct {
	Name    string `json:"name"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
	Bitrate int    `json:"bitrate"` // kbps
	Codec   string `json:"codec"`
	Preset  string `json:"preset"`
}

type VideoSegment struct {
	ID             string        `json:"id"`
	JobID          string        `json:"jobId"`
	Index          int           `json:"index"`
	StartTime      float64       `json:"startTime"`
	Duration       float64       `json:"duration"`
	ProfileName    string        `json:"profileName"`
	Status         SegmentStatus `json:"status"`
	AssignedWorker string        `json:"assignedWorker,omitempty"`
	AssignedAt     int64         `json:"assignedAt"`
	CompletedAt    int64         `json:"completedAt"`
	OutputPath     string        `json:"outputPath,omitempty"`
	RetryCount     int           `json:"retryCount"`
}

type VideoMetadata struct {
	Width     int     `json:"width"`
	Height    int     `json:"height"`
	Duration  float64 `json:"duration"`
	Codec     string  `json:"codec"`
	Bitrate   int     `json:"bitrate"`
	FrameRate float64 `json:"frameRate"`
	FileSize  int64   `json:"fileSize"`
}

type TranscodeJob struct {
	ID            string             `json:"id"`
	UserID        string             `json:"userId"`
	SourceURL     string             `json:"sourceUrl"`
	Status        JobStatus          `json:"status"`
	Priority      int                `json:"priority"`
	CreatedAt     int64              `json:"createdAt"`
	StartedAt     int64              `json:"startedAt"`
	CompletedAt   int64              `json:"completedAt"`
	SourceMeta    *VideoMetadata     `json:"sourceMeta,omitempty"`
	Profiles      []TranscodeProfile `json:"profiles"`
	Segments      []*VideoSegment    `json:"segments"`
	WebhookURL    string             `json:"webhookUrl,omitempty"`
	OutputBaseURL string             `json:"outputBaseUrl,omitempty"`
	Error         string             `json:"error,omitempty"`
}

type WorkerInfo struct {
	ID             string           `json:"id"`
	Status         WorkerStatusType `json:"status"`
	CurrentTask    string           `json:"currentTask,omitempty"`
	LastHeartbeat  time.Time        `json:"lastHeartbeat"`
	TasksCompleted int              `json:"tasksCompleted"`
	TasksFailed    int              `json:"tasksFailed"`
	RegisteredAt   time.Time        `json:"registeredAt"`
}

// ===========================================
// 2. DEFAULT PROFILES
// ===========================================

var defaultProfiles = []TranscodeProfile{
	{Name: "1080p", Width: 1920, Height: 1080, Bitrate: 5000, Codec: "h264", Preset: "medium"},
	{Name: "720p", Width: 1280, Height: 720, Bitrate: 2800, Codec: "h264", Preset: "medium"},
	{Name: "480p", Width: 854, Height: 480, Bitrate: 1400, Codec: "h264", Preset: "fast"},
	{Name: "360p", Width: 640, Height: 360, Bitrate: 800, Codec: "h264", Preset: "fast"},
}

// ===========================================
// 3. FAIR PRIORITY QUEUE
// ===========================================

type FairPriorityQueue struct {
	mu              sync.Mutex
	queues          map[string][]*TranscodeJob
	roundRobinIndex int
}

func NewFairPriorityQueue() *FairPriorityQueue {
	return &FairPriorityQueue{queues: make(map[string][]*TranscodeJob)}
}

func (q *FairPriorityQueue) Enqueue(job *TranscodeJob) {
	q.mu.Lock()
	defer q.mu.Unlock()

	userQueue := q.queues[job.UserID]
	inserted := false
	for i, existing := range userQueue {
		if job.Priority < existing.Priority {
			userQueue = append(userQueue[:i], append([]*TranscodeJob{job}, userQueue[i:]...)...)
			inserted = true
			break
		}
	}
	if !inserted {
		userQueue = append(userQueue, job)
	}
	q.queues[job.UserID] = userQueue
}

func (q *FairPriorityQueue) Dequeue() *TranscodeJob {
	q.mu.Lock()
	defer q.mu.Unlock()

	var userIDs []string
	for uid, queue := range q.queues {
		if len(queue) > 0 {
			userIDs = append(userIDs, uid)
		}
	}
	if len(userIDs) == 0 {
		return nil
	}

	q.roundRobinIndex = q.roundRobinIndex % len(userIDs)
	uid := userIDs[q.roundRobinIndex]
	q.roundRobinIndex++

	queue := q.queues[uid]
	job := queue[0]
	q.queues[uid] = queue[1:]
	if len(q.queues[uid]) == 0 {
		delete(q.queues, uid)
	}
	return job
}

func (q *FairPriorityQueue) Remove(jobID string) bool {
	q.mu.Lock()
	defer q.mu.Unlock()

	for uid, queue := range q.queues {
		for i, j := range queue {
			if j.ID == jobID {
				q.queues[uid] = append(queue[:i], queue[i+1:]...)
				if len(q.queues[uid]) == 0 {
					delete(q.queues, uid)
				}
				return true
			}
		}
	}
	return false
}

func (q *FairPriorityQueue) Size() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	total := 0
	for _, queue := range q.queues {
		total += len(queue)
	}
	return total
}

// ===========================================
// 4. PROGRESS TRACKER
// ===========================================

type JobProgress struct {
	Total     int     `json:"total"`
	Completed int     `json:"completed"`
	Failed    int     `json:"failed"`
	Percent   float64 `json:"percent"`
	EtaMs     int64   `json:"eta"`
}

type ProgressTracker struct {
	mu   sync.RWMutex
	jobs map[string]*TranscodeJob
}

func NewProgressTracker() *ProgressTracker {
	return &ProgressTracker{jobs: make(map[string]*TranscodeJob)}
}

func (pt *ProgressTracker) RegisterJob(job *TranscodeJob) {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	pt.jobs[job.ID] = job
}

func (pt *ProgressTracker) GetJob(jobID string) *TranscodeJob {
	pt.mu.RLock()
	defer pt.mu.RUnlock()
	return pt.jobs[jobID]
}

func (pt *ProgressTracker) GetAllJobs() []*TranscodeJob {
	pt.mu.RLock()
	defer pt.mu.RUnlock()
	result := make([]*TranscodeJob, 0, len(pt.jobs))
	for _, j := range pt.jobs {
		result = append(result, j)
	}
	return result
}

func (pt *ProgressTracker) UpdateSegment(jobID, segmentID string, status SegmentStatus, outputPath string) {
	pt.mu.Lock()
	defer pt.mu.Unlock()
	job := pt.jobs[jobID]
	if job == nil {
		return
	}
	for _, seg := range job.Segments {
		if seg.ID == segmentID {
			seg.Status = status
			if status == SegCompleted {
				seg.CompletedAt = time.Now().UnixMilli()
				seg.OutputPath = outputPath
			}
			return
		}
	}
}

func (pt *ProgressTracker) GetProgress(jobID string) JobProgress {
	pt.mu.RLock()
	defer pt.mu.RUnlock()

	job := pt.jobs[jobID]
	if job == nil {
		return JobProgress{}
	}

	total := len(job.Segments)
	completed := 0
	failed := 0
	for _, s := range job.Segments {
		if s.Status == SegCompleted {
			completed++
		} else if s.Status == SegFailed {
			failed++
		}
	}

	percent := 0.0
	if total > 0 {
		percent = math.Round(float64(completed) / float64(total) * 100)
	}

	var eta int64
	if completed > 0 && job.StartedAt > 0 {
		elapsed := time.Now().UnixMilli() - job.StartedAt
		avgPerSeg := float64(elapsed) / float64(completed)
		remaining := total - completed - failed
		eta = int64(avgPerSeg * float64(remaining))
	}

	return JobProgress{Total: total, Completed: completed, Failed: failed, Percent: percent, EtaMs: eta}
}

func (pt *ProgressTracker) IsComplete(jobID string) bool {
	pt.mu.RLock()
	defer pt.mu.RUnlock()
	job := pt.jobs[jobID]
	if job == nil {
		return false
	}
	for _, s := range job.Segments {
		if s.Status != SegCompleted && s.Status != SegFailed {
			return false
		}
	}
	return true
}

func (pt *ProgressTracker) HasFailures(jobID string) bool {
	pt.mu.RLock()
	defer pt.mu.RUnlock()
	job := pt.jobs[jobID]
	if job == nil {
		return false
	}
	for _, s := range job.Segments {
		if s.Status == SegFailed && s.RetryCount >= MaxRetries {
			return true
		}
	}
	return false
}

// ===========================================
// 5. WORKER POOL
// ===========================================

type WorkerPool struct {
	mu      sync.Mutex
	workers map[string]*WorkerInfo
}

func NewWorkerPool() *WorkerPool {
	return &WorkerPool{workers: make(map[string]*WorkerInfo)}
}

func (wp *WorkerPool) Register(workerID string) *WorkerInfo {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	w := &WorkerInfo{
		ID:            workerID,
		Status:        WorkerIdle,
		LastHeartbeat: time.Now(),
		RegisteredAt:  time.Now(),
	}
	wp.workers[workerID] = w
	fmt.Printf("[WORKER] Registered worker %s\n", workerID)
	return w
}

func (wp *WorkerPool) Heartbeat(workerID string) bool {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	w := wp.workers[workerID]
	if w == nil {
		return false
	}
	w.LastHeartbeat = time.Now()
	return true
}

func (wp *WorkerPool) AssignTask(workerID, taskID string) bool {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	w := wp.workers[workerID]
	if w == nil || w.Status != WorkerIdle {
		return false
	}
	w.Status = WorkerBusy
	w.CurrentTask = taskID
	return true
}

func (wp *WorkerPool) CompleteTask(workerID string, success bool) {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	w := wp.workers[workerID]
	if w == nil {
		return
	}
	w.Status = WorkerIdle
	w.CurrentTask = ""
	if success {
		w.TasksCompleted++
	} else {
		w.TasksFailed++
	}
}

func (wp *WorkerPool) GetIdleWorkers() []*WorkerInfo {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	var idle []*WorkerInfo
	for _, w := range wp.workers {
		if w.Status == WorkerIdle {
			idle = append(idle, w)
		}
	}
	return idle
}

func (wp *WorkerPool) GetStaleWorkers() []*WorkerInfo {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	var stale []*WorkerInfo
	for _, w := range wp.workers {
		if w.Status == WorkerBusy && time.Since(w.LastHeartbeat) > HeartbeatTimeout {
			stale = append(stale, w)
		}
	}
	return stale
}

func (wp *WorkerPool) Drain(workerID string) {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	if w := wp.workers[workerID]; w != nil {
		w.Status = WorkerDraining
		fmt.Printf("[WORKER] Draining worker %s\n", workerID)
	}
}

func (wp *WorkerPool) Remove(workerID string) {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	delete(wp.workers, workerID)
	fmt.Printf("[WORKER] Removed worker %s\n", workerID)
}

type PoolStatus struct {
	Total    int `json:"total"`
	Idle     int `json:"idle"`
	Busy     int `json:"busy"`
	Draining int `json:"draining"`
}

func (wp *WorkerPool) GetStatus() PoolStatus {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	s := PoolStatus{Total: len(wp.workers)}
	for _, w := range wp.workers {
		switch w.Status {
		case WorkerIdle:
			s.Idle++
		case WorkerBusy:
			s.Busy++
		case WorkerDraining:
			s.Draining++
		}
	}
	return s
}

func (wp *WorkerPool) GetAll() []*WorkerInfo {
	wp.mu.Lock()
	defer wp.mu.Unlock()
	result := make([]*WorkerInfo, 0, len(wp.workers))
	for _, w := range wp.workers {
		result = append(result, w)
	}
	return result
}

// ===========================================
// 6. SEGMENT SPLITTER
// ===========================================

func createSegments(job *TranscodeJob) []*VideoSegment {
	if job.SourceMeta == nil {
		return nil
	}

	duration := job.SourceMeta.Duration
	segCount := int(math.Ceil(duration / SegmentDuration))
	var segments []*VideoSegment

	for _, profile := range job.Profiles {
		for i := 0; i < segCount; i++ {
			startTime := float64(i) * SegmentDuration
			segDur := math.Min(SegmentDuration, duration-startTime)

			segments = append(segments, &VideoSegment{
				ID:          fmt.Sprintf("%s-%s-seg%04d", job.ID, profile.Name, i),
				JobID:       job.ID,
				Index:       i,
				StartTime:   startTime,
				Duration:    segDur,
				ProfileName: profile.Name,
				Status:      SegPending,
			})
		}
	}
	return segments
}

// ===========================================
// 7. HLS MANIFEST GENERATOR
// ===========================================

func generateMasterPlaylist(job *TranscodeJob) string {
	var b strings.Builder
	b.WriteString("#EXTM3U\n#EXT-X-VERSION:3\n\n")

	for _, profile := range job.Profiles {
		bw := profile.Bitrate * 1000
		fmt.Fprintf(&b, "#EXT-X-STREAM-INF:BANDWIDTH=%d,RESOLUTION=%dx%d,CODECS=\"avc1.640028\"\n",
			bw, profile.Width, profile.Height)
		fmt.Fprintf(&b, "%s/playlist.m3u8\n\n", profile.Name)
	}
	return b.String()
}

func generateVariantPlaylist(job *TranscodeJob, profileName string) string {
	var profileSegs []*VideoSegment
	for _, s := range job.Segments {
		if s.ProfileName == profileName && s.Status == SegCompleted {
			profileSegs = append(profileSegs, s)
		}
	}

	// Sort by index (already ordered, but be safe)
	for i := 1; i < len(profileSegs); i++ {
		for j := i; j > 0 && profileSegs[j].Index < profileSegs[j-1].Index; j-- {
			profileSegs[j], profileSegs[j-1] = profileSegs[j-1], profileSegs[j]
		}
	}

	var b strings.Builder
	b.WriteString("#EXTM3U\n#EXT-X-VERSION:3\n")
	fmt.Fprintf(&b, "#EXT-X-TARGETDURATION:%d\n", SegmentDuration)
	b.WriteString("#EXT-X-MEDIA-SEQUENCE:0\n\n")

	for _, seg := range profileSegs {
		fmt.Fprintf(&b, "#EXTINF:%.3f,\n", seg.Duration)
		fmt.Fprintf(&b, "segment%04d.ts\n", seg.Index)
	}

	b.WriteString("#EXT-X-ENDLIST\n")
	return b.String()
}

// ===========================================
// 8. WEBHOOK NOTIFIER
// ===========================================

type WebhookNotifier struct {
	mu      sync.Mutex
	pending []webhookEntry
}

type webhookEntry struct {
	URL     string
	Payload interface{}
	Retries int
}

func NewWebhookNotifier() *WebhookNotifier {
	return &WebhookNotifier{}
}

func (wn *WebhookNotifier) Notify(url string, payload interface{}) {
	if url == "" {
		return
	}
	wn.mu.Lock()
	defer wn.mu.Unlock()

	data, _ := json.Marshal(payload)
	preview := string(data)
	if len(preview) > 120 {
		preview = preview[:120] + "..."
	}
	fmt.Printf("[WEBHOOK] Delivered to %s: %s\n", url, preview)
}

// ===========================================
// 9. TRANSCODING SERVICE
// ===========================================

type TranscodingService struct {
	queue             *FairPriorityQueue
	tracker           *ProgressTracker
	pool              *WorkerPool
	notifier          *WebhookNotifier
	mu                sync.Mutex
	processing        bool
	shutdownRequested bool
	nextID            int
}

func NewTranscodingService(workerCount int) *TranscodingService {
	svc := &TranscodingService{
		queue:    NewFairPriorityQueue(),
		tracker:  NewProgressTracker(),
		pool:     NewWorkerPool(),
		notifier: NewWebhookNotifier(),
	}
	for i := 0; i < workerCount; i++ {
		svc.pool.Register(fmt.Sprintf("worker-%d", i))
	}
	return svc
}

func (svc *TranscodingService) genID() string {
	svc.mu.Lock()
	defer svc.mu.Unlock()
	svc.nextID++
	return fmt.Sprintf("job-%06d", svc.nextID)
}

func (svc *TranscodingService) SubmitJob(userID, sourceURL, webhookURL string, priority int) *TranscodeJob {
	job := &TranscodeJob{
		ID:         svc.genID(),
		UserID:     userID,
		SourceURL:  sourceURL,
		Status:     JobPending,
		Priority:   priority,
		CreatedAt:  time.Now().UnixMilli(),
		WebhookURL: webhookURL,
	}
	svc.tracker.RegisterJob(job)
	svc.queue.Enqueue(job)
	fmt.Printf("[JOB] Submitted %s for user %s (priority %d)\n", job.ID, userID, priority)
	return job
}

func (svc *TranscodingService) ProcessNextJob() {
	if svc.shutdownRequested {
		return
	}

	job := svc.queue.Dequeue()
	if job == nil {
		return
	}

	svc.mu.Lock()
	svc.processing = true
	svc.mu.Unlock()

	defer func() {
		svc.mu.Lock()
		svc.processing = false
		svc.mu.Unlock()
	}()

	job.StartedAt = time.Now().UnixMilli()

	// Step 1: Probe
	job.Status = JobProbing
	fmt.Printf("[JOB] Probing %s...\n", job.ID)
	job.SourceMeta = probeVideo(job.SourceURL)

	// Step 2: Select profiles
	job.Status = JobSplitting
	job.Profiles = selectProfiles(job.SourceMeta)
	fmt.Printf("[JOB] Selected %d profiles for %s\n", len(job.Profiles), job.ID)

	// Step 3: Create segments
	job.Segments = createSegments(job)
	fmt.Printf("[JOB] Created %d segments for %s\n", len(job.Segments), job.ID)

	// Step 4: Transcode
	job.Status = JobTranscoding
	svc.transcodeSegments(job)

	// Step 5: Check result
	if svc.tracker.HasFailures(job.ID) {
		job.Status = JobFailed
		job.Error = "Some segments failed after max retries"
		fmt.Printf("[JOB] Job %s FAILED\n", job.ID)
	} else {
		job.Status = JobMerging
		job.OutputBaseURL = fmt.Sprintf("/output/%s", job.ID)
		fmt.Printf("[JOB] Generating manifests for %s\n", job.ID)

		master := generateMasterPlaylist(job)
		fmt.Printf("[MANIFEST] Master playlist:\n%s", master)

		for _, profile := range job.Profiles {
			variant := generateVariantPlaylist(job, profile.Name)
			fmt.Printf("[MANIFEST] Variant %s:\n%s", profile.Name, variant)
		}

		job.Status = JobCompleted
		job.CompletedAt = time.Now().UnixMilli()
		elapsed := float64(job.CompletedAt-job.StartedAt) / 1000.0
		fmt.Printf("[JOB] Job %s COMPLETED in %.1fs\n", job.ID, elapsed)
	}

	// Step 6: Webhook
	svc.notifier.Notify(job.WebhookURL, map[string]interface{}{
		"jobId":         job.ID,
		"status":        job.Status,
		"outputBaseUrl": job.OutputBaseURL,
		"manifestUrl":   job.OutputBaseURL + "/master.m3u8",
		"completedAt":   job.CompletedAt,
	})
}

func probeVideo(sourceURL string) *VideoMetadata {
	return &VideoMetadata{
		Width:     1920,
		Height:    1080,
		Duration:  120,
		Codec:     "h264",
		Bitrate:   8000,
		FrameRate: 30,
		FileSize:  120_000_000,
	}
}

func selectProfiles(meta *VideoMetadata) []TranscodeProfile {
	var profiles []TranscodeProfile
	for _, p := range defaultProfiles {
		if p.Height <= meta.Height {
			profiles = append(profiles, p)
		}
	}
	return profiles
}

func (svc *TranscodingService) transcodeSegments(job *TranscodeJob) {
	var wg sync.WaitGroup

	for {
		if svc.shutdownRequested {
			fmt.Printf("[JOB] Shutdown requested, draining for %s\n", job.ID)
			break
		}

		svc.handleStaleWorkers(job)

		pendingCount := 0
		activeCount := 0
		for _, s := range job.Segments {
			if s.Status == SegPending {
				pendingCount++
			} else if s.Status == SegAssigned || s.Status == SegProcessing {
				activeCount++
			}
		}

		if pendingCount == 0 && activeCount == 0 {
			break
		}

		idle := svc.pool.GetIdleWorkers()
		for _, worker := range idle {
			var seg *VideoSegment
			for _, s := range job.Segments {
				if s.Status == SegPending {
					seg = s
					break
				}
			}
			if seg == nil {
				break
			}

			if svc.pool.AssignTask(worker.ID, seg.ID) {
				seg.Status = SegAssigned
				seg.AssignedWorker = worker.ID
				seg.AssignedAt = time.Now().UnixMilli()

				wg.Add(1)
				go func(s *VideoSegment, wID string) {
					defer wg.Done()
					svc.simulateTranscode(job.ID, s, wID)
				}(seg, worker.ID)
			}
		}

		time.Sleep(10 * time.Millisecond)
	}

	wg.Wait()
}

func (svc *TranscodingService) simulateTranscode(jobID string, seg *VideoSegment, workerID string) {
	seg.Status = SegProcessing

	// Simulate transcoding time
	delay := time.Duration(50+rand.Intn(150)) * time.Millisecond
	time.Sleep(delay)

	success := rand.Float64() > 0.05 // 5% failure rate

	if success {
		outputPath := fmt.Sprintf("/output/%s/%s/segment%04d.ts", jobID, seg.ProfileName, seg.Index)
		svc.tracker.UpdateSegment(jobID, seg.ID, SegCompleted, outputPath)
		svc.pool.CompleteTask(workerID, true)
		svc.pool.Heartbeat(workerID)
	} else {
		seg.RetryCount++
		if seg.RetryCount < MaxRetries {
			seg.Status = SegPending
			seg.AssignedWorker = ""
			fmt.Printf("[RETRY] Segment %s retry %d/%d\n", seg.ID, seg.RetryCount, MaxRetries)
		} else {
			svc.tracker.UpdateSegment(jobID, seg.ID, SegFailed, "")
			fmt.Printf("[FAIL] Segment %s permanently failed\n", seg.ID)
		}
		svc.pool.CompleteTask(workerID, false)
	}
}

func (svc *TranscodingService) handleStaleWorkers(job *TranscodeJob) {
	stale := svc.pool.GetStaleWorkers()
	for _, w := range stale {
		fmt.Printf("[HEARTBEAT] Worker %s stale, reassigning\n", w.ID)
		for _, seg := range job.Segments {
			if seg.AssignedWorker == w.ID && (seg.Status == SegAssigned || seg.Status == SegProcessing) {
				seg.Status = SegPending
				seg.AssignedWorker = ""
				seg.RetryCount++
			}
		}
		svc.pool.Remove(w.ID)
		svc.pool.Register(w.ID)
	}
}

func (svc *TranscodingService) CancelJob(jobID string) bool {
	job := svc.tracker.GetJob(jobID)
	if job == nil {
		return false
	}
	if job.Status == JobPending {
		svc.queue.Remove(jobID)
	}
	job.Status = JobCancelled
	fmt.Printf("[JOB] Cancelled %s\n", jobID)
	return true
}

func (svc *TranscodingService) GracefulShutdown() {
	fmt.Println("[SHUTDOWN] Initiating graceful shutdown...")
	svc.shutdownRequested = true

	for _, w := range svc.pool.GetAll() {
		if w.Status == WorkerBusy {
			svc.pool.Drain(w.ID)
		}
	}

	deadline := time.Now().Add(30 * time.Second)
	for {
		svc.mu.Lock()
		active := svc.processing
		svc.mu.Unlock()
		if !active || time.Now().After(deadline) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	fmt.Println("[SHUTDOWN] Graceful shutdown complete")
}

// ===========================================
// 10. HTTP SERVER & MAIN
// ===========================================

func main() {
	svc := NewTranscodingService(4)

	// --- HTTP Handlers ---
	http.HandleFunc("/api/transcode", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			UserID     string `json:"userId"`
			SourceURL  string `json:"sourceUrl"`
			WebhookURL string `json:"webhookUrl"`
			Priority   int    `json:"priority"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
			return
		}
		if body.SourceURL == "" || body.UserID == "" {
			http.Error(w, `{"error":"sourceUrl and userId required"}`, http.StatusBadRequest)
			return
		}
		if body.Priority == 0 {
			body.Priority = 5
		}
		job := svc.SubmitJob(body.UserID, body.SourceURL, body.WebhookURL, body.Priority)
		go svc.ProcessNextJob()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"jobId": job.ID, "status": job.Status,
		})
	})

	http.HandleFunc("/api/jobs/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		path := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
		parts := strings.Split(path, "/")
		jobID := parts[0]

		if jobID == "" {
			http.Error(w, `{"error":"job ID required"}`, http.StatusBadRequest)
			return
		}

		// DELETE /api/jobs/:id
		if r.Method == http.MethodDelete {
			if svc.CancelJob(jobID) {
				json.NewEncoder(w).Encode(map[string]string{"status": "cancelled"})
			} else {
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{"error": "Job not found"})
			}
			return
		}

		// GET /api/jobs/:id/manifest
		if len(parts) > 1 && parts[1] == "manifest" {
			job := svc.tracker.GetJob(jobID)
			if job == nil {
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(map[string]string{"error": "Job not found"})
				return
			}
			if job.Status != JobCompleted {
				w.WriteHeader(http.StatusConflict)
				json.NewEncoder(w).Encode(map[string]string{"error": "Job not yet completed", "status": string(job.Status)})
				return
			}
			w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
			fmt.Fprint(w, generateMasterPlaylist(job))
			return
		}

		// GET /api/jobs/:id
		job := svc.tracker.GetJob(jobID)
		if job == nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Job not found"})
			return
		}
		progress := svc.tracker.GetProgress(jobID)
		profileNames := make([]string, len(job.Profiles))
		for i, p := range job.Profiles {
			profileNames[i] = p.Name
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":          job.ID,
			"userId":      job.UserID,
			"status":      job.Status,
			"progress":    progress,
			"sourceMeta":  job.SourceMeta,
			"profiles":    profileNames,
			"createdAt":   job.CreatedAt,
			"startedAt":   job.StartedAt,
			"completedAt": job.CompletedAt,
			"error":       job.Error,
		})
	})

	http.HandleFunc("/api/workers", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"pool":    svc.pool.GetStatus(),
			"workers": svc.pool.GetAll(),
		})
	})

	// --- Demo ---
	fmt.Println("=== Video Transcoding Service Demo ===\n")

	job1 := svc.SubmitJob("user-alice", "/uploads/alice-vacation.mp4", "https://example.com/webhook", 3)
	job2 := svc.SubmitJob("user-bob", "/uploads/bob-tutorial.mp4", "", 5)
	_ = svc.SubmitJob("user-alice", "/uploads/alice-concert.mp4", "https://example.com/webhook", 7)

	fmt.Println("\nQueue: 3 jobs submitted\n")

	fmt.Println("--- Processing Job 1 ---")
	svc.ProcessNextJob()

	progress := svc.tracker.GetProgress(job1.ID)
	fmt.Printf("\nJob 1 progress: %.0f%% (%d/%d segments)\n", progress.Percent, progress.Completed, progress.Total)
	fmt.Printf("Job 1 status: %s\n", job1.Status)

	if job1.Status == JobCompleted {
		fmt.Println("\n--- HLS Master Playlist ---")
		fmt.Print(generateMasterPlaylist(job1))
	}

	fmt.Println("--- Worker Pool ---")
	poolJSON, _ := json.MarshalIndent(svc.pool.GetStatus(), "", "  ")
	fmt.Println(string(poolJSON))

	fmt.Println("\n--- Processing Job 2 ---")
	svc.ProcessNextJob()

	fmt.Printf("\nJob 2 status: %s\n", job2.Status)

	fmt.Println("\n--- Processing Job 3 ---")
	svc.ProcessNextJob()

	fmt.Println("\n=== All jobs processed ===")

	// Start HTTP server with graceful shutdown
	srv := &http.Server{Addr: ":3900"}
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		svc.GracefulShutdown()
		srv.Close()
	}()

	fmt.Println("\nHTTP server listening on http://localhost:3900")
	fmt.Println("Endpoints:")
	fmt.Println("  POST   /api/transcode        — Submit job")
	fmt.Println("  GET    /api/jobs/:id          — Job status")
	fmt.Println("  GET    /api/jobs/:id/manifest — HLS manifest")
	fmt.Println("  DELETE /api/jobs/:id          — Cancel job")
	fmt.Println("  GET    /api/workers           — Worker pool status")

	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		fmt.Printf("Server error: %v\n", err)
	}
}
```

</div>
</CodeTabs>

## Design Decisions ব্যাখ্যা

### ভিডিওকে Segment-এ কেন ভাগ করা হয়?

Segment-based ট্রান্সকোডিং হলো ভিডিও প্রসেসিংকে parallel করার মূল চাবিকাঠি। একটি monolithic পদ্ধতি — একটি 2-ঘণ্টার ফাইল একটি মাত্র FFmpeg প্রসেসে দেওয়া — মানে একটি CPU core ঘণ্টার পর ঘণ্টা কাজ করে আর বাকি শত শত core অলস বসে থাকে। ভিডিওকে 6-সেকেন্ডের segment-এ ভাগ করে, একটি 2-ঘণ্টার সিনেমা 1200টি স্বাধীন transcoding task তৈরি করে। 100টি worker দিয়ে, মোট wall-clock time ঘণ্টা থেকে মিনিটে নেমে আসে।

Segment স্বাভাবিক failure boundary-ও দেয়। যদি একটি worker segment 847 ট্রান্সকোড করার সময় ক্র্যাশ করে, শুধু সেই একটি segment retry করতে হয় — পুরো ভিডিও নয়। সম্পন্ন হওয়া segment গুলো valid থাকে এবং পুনরায় process করার দরকার নেই। এই বৈশিষ্ট্যটি scale-এ 99.9% job completion rate অর্জনের জন্য অপরিহার্য।

সবশেষে, segment গুলো সরাসরি HLS streaming format-এ ম্যাপ করে। একটি HLS stream-এর প্রতিটি `.ts` ফাইল ঠিক একটি segment, তাই transcoding output player-দের কাছে serve করতে কোনো post-processing দরকার হয় না। splitting-এর সময় তৈরি হওয়া segment boundary গুলো চূড়ান্ত stream-এ seek point হয়ে যায়।

### Fair Scheduling সহ Priority Queue কেন?

একটি naive FIFO queue একটি starvation সমস্যা তৈরি করে। যদি একজন user 50টি ভিডিও আপলোড করে, সেই 50টি job ঘণ্টার পর ঘণ্টা queue দখল করে রাখে আর অন্য user-রা অপেক্ষা করে। Fair scheduling **user জুড়ে round-robin**-এর সাথে **প্রতিটি user-এর queue-এর ভেতরে priority ordering** একত্রিত করে ব্যবহার করে। এর মানে submission order নির্বিশেষে, কোনো user তার দ্বিতীয় job process হওয়ার আগেই প্রতিটি user তার পরবর্তী job process পায়।

একটি user-এর queue-এর ভেতরে priority সিস্টেমকে জরুরি ও background কাজের মধ্যে পার্থক্য করতে দেয়। একটি live event recording যা 30 মিনিটের মধ্যে উপলব্ধ হওয়া দরকার সেটি priority 1 পায়, আর একটি পুরনো archive-এর batch re-encode priority 9 পায়। দুটোই অন্য user-দের তুলনায় fair access পায়, কিন্তু প্রতিটি user-এর job-এর ভেতরে priority সম্মান করা হয়।

### DASH-এর বদলে HLS কেন?

HLS (HTTP Live Streaming) এবং DASH (Dynamic Adaptive Streaming over HTTP) প্রায় অভিন্ন architecture দিয়ে একই সমস্যা সমাধান করে। HLS `.m3u8` text playlist ও `.ts` segment ব্যবহার করে; DASH XML manifest (`.mpd`) ও fragmented MP4 (`.m4s`) segment ব্যবহার করে। দুটোই adaptive bitrate switching সাপোর্ট করে।

তিনটি কারণে বাস্তবে HLS জেতে। প্রথমত, এটি **iOS ও Safari দ্বারা natively সাপোর্টেড একমাত্র format** — Apple device গুলো ভিডিও দর্শকদের একটি উল্লেখযোগ্য অংশ। DASH-এর জন্য Apple device-এ একটি JavaScript player library দরকার। দ্বিতীয়ত, HLS manifest হলো সরল text ফাইল যা তৈরি, parse, debug ও cache করা খুবই সহজ। তৃতীয়ত, HLS-এর জন্য CDN সাপোর্ট সর্বজনীন, আর DASH সাপোর্ট ভিন্ন ভিন্ন। বেশিরভাগ production সিস্টেম প্রাথমিক format হিসেবে HLS তৈরি করে এবং নির্দিষ্ট client-এর জন্য ঐচ্ছিকভাবে DASH যোগ করে।

### Worker Heartbeat কেন?

একটি distributed worker pool-এ, নীরবতা অস্পষ্ট। একটি worker যা রিপোর্ট করা বন্ধ করে দিয়েছে সেটি হতে পারে: (a) একটি বিশেষভাবে বড় segment process করছে, (b) একটি network partition-এ পড়েছে, (c) ক্র্যাশ করেছে, অথবা (d) একটি infinite loop-এ আটকে গেছে। heartbeat ছাড়া, সিস্টেম এই ক্ষেত্রগুলোর মধ্যে পার্থক্য করতে পারে না এবং অনির্দিষ্টকাল অপেক্ষা করতে হয়।

Heartbeat এটি সমাধান করে প্রতিটি worker-কে process করার সময় একটি periodic signal পাঠাতে বাধ্য করে (প্রতি 10 সেকেন্ডে)। যদি orchestrator 30 সেকেন্ড ধরে কোনো heartbeat না পায়, এটি ধরে নেয় worker টি মৃত এবং তার segment গুলো সুস্থ worker-দের reassign করে। timeout টি network jitter সহ্য করার মতো যথেষ্ট বড় হতে হবে কিন্তু overall job completion time-এ প্রভাব ফেলার আগে failure সনাক্ত করার মতো যথেষ্ট ছোট হতে হবে। একটি stale segment যা assigned অথচ unprocessed অবস্থায় মিনিটের পর মিনিট বসে থাকে সেটি সরাসরি user-এর অপেক্ষার সময়ে প্রভাব ফেলে।

<div class="takeaways">

### মূল টেকঅ্যাওয়ে

- Segment-based ট্রান্সকোডিং বিশাল parallelism সম্ভব করে — একটি 2-ঘণ্টার সিনেমা 720টি two-second segment-এ ভাগ করলে 720টি worker একসাথে সেটি ট্রান্সকোড করতে পারে
- Adaptive bitrate streaming player-দের network condition-এর ভিত্তিতে নির্বিঘ্নে quality সুইচ করতে দেয় — buffer-free ভিডিওর মূল চাবিকাঠি
- HLS manifest নেহাত text ফাইল যা ভিডিও segment-এর দিকে ইঙ্গিত করে — তৈরি, cache এবং CDN-এর মাধ্যমে serve করা সহজ
- Worker heartbeat আটকে যাওয়া job সনাক্ত করে — একটি worker 30 সেকেন্ড নীরব থাকলে, তার segment গুলো reassign হয়ে যায়
- Fair scheduling একজন user-এর 4K সিনেমাকে বাকি সবার আপলোড ব্লক করা থেকে আটকায়
- ETA সহ progress tracking user-দের আশ্বস্ত করে যে তাদের আপলোড process হচ্ছে, হারিয়ে যায়নি

</div>

<div class="when-to-use">

### বাস্তব জগতে ব্যবহার

- **YouTube** প্রতি মিনিটে আপলোড হওয়া 500+ ঘণ্টার ভিডিও VP9 ও AV1 codec দিয়ে 8+ quality level-এ ট্রান্সকোড করে
- **Netflix** per-title encoding profile আগে থেকে গণনা করে — অন্ধকার দৃশ্য কম bit পায়, action দৃশ্য বেশি পায়
- **Twitch** live stream real-time-এ 3-4টি quality level-এ sub-3-second glass-to-glass latency সহ ট্রান্সকোড করে
- **TikTok** প্রতিদিন লক্ষ লক্ষ ছোট ভিডিও process করতে hardware-accelerated ট্রান্সকোডিং (NVENC) ব্যবহার করে
- এই architecture segment-level parallelism ও fair scheduling সহ 1000+ concurrent transcoding job সামলায়

</div>
