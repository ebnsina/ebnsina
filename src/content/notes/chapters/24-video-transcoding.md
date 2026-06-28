---
title: "Case Study: Video Transcoding Service"
subtitle: "Design and build a production video transcoding pipeline with VOD processing, adaptive bitrate encoding, job scheduling, and distributed workers."
chapter: 24
level: "advanced"
readingTime: "34 min"
topics: ["video transcoding", "VOD", "adaptive bitrate", "job queue", "distributed processing"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## Why Video Transcoding Is a Distributed Systems Problem

Every video uploaded to YouTube, Netflix, or TikTok must be transcoded before a single viewer can watch it. A raw upload is useless on its own — it needs to be converted into **multiple resolutions** (1080p, 720p, 480p, 360p), encoded with **multiple codecs** (H.264, H.265/HEVC, VP9, AV1), and packaged for **adaptive bitrate streaming** (HLS/DASH). A single 4K video upload can easily generate **20+ output files**: four resolutions times three codecs, plus thumbnail sprites, preview clips, and manifest files.

This work is extraordinarily CPU-intensive. Transcoding a single minute of 4K video to H.265 can take 5-15 minutes on a modern CPU core. A 2-hour movie would take days on a single machine. The only practical solution is to **split the video into segments** and distribute the work across a pool of workers that process segments in parallel. This is a classic distributed systems problem: job scheduling, work distribution, failure detection, progress aggregation, and result assembly.

<Callout type="info">

**Real-World Analogy**

Like a factory assembly line — raw footage enters, gets processed through multiple stages (resize, compress, format), and comes out as multiple versions (HD, SD, mobile) simultaneously.

</Callout>

Think of it like a printing press that takes one manuscript and simultaneously produces a paperback edition, a hardcover edition, an audiobook, and an e-book — each optimized for its medium. The manuscript must be split into chapters, each chapter sent to a different production line, and the finished chapters reassembled into complete books. If one production line breaks down, its chapters must be reassigned to another line without losing progress or producing duplicates. The printing press must also handle a queue of manuscripts fairly, so one author's 1000-page novel does not block everyone else's short stories.

<Mermaid
	title="Video Transcoding Architecture"
	code={`
graph TD
  U["Upload API<br/>Ingest Video"] --> J["Job Scheduler<br/>Split & Queue"] --> W["Worker Pool<br/>Transcode"]
  W --> O["Object Store<br/>Source & Output"] --> P["Progress Tracker<br/>Job Status"] --> CDN["CDN<br/>HLS / DASH Delivery"]
`}
/>

## Requirements

- **Functional**: Upload video files, transcode to multiple resolutions and codecs, generate HLS/DASH manifests, extract thumbnails at configurable intervals, track per-segment progress with ETA, send webhook notifications on job completion or failure
- **Non-functional**: Process 1000+ videos per hour, support source files up to 10GB, achieve 99.9% job completion rate, autoscale workers based on queue depth, graceful shutdown without losing in-progress work
- **Output**: Adaptive bitrate streaming via HLS with `.m3u8` master and variant playlists, `.ts` video segments at multiple quality levels (1080p at 5Mbps, 720p at 2.8Mbps, 480p at 1.4Mbps, 360p at 800Kbps)

## VOD vs Live: Two Different Worlds

Video transcoding splits into two fundamentally different pipelines depending on whether the source material is **complete** or **arriving in real-time**. The architecture, latency requirements, and failure handling differ dramatically between the two.

**VOD (Video on Demand)** processing starts after the entire file has been uploaded. Because the full video is available, the system can analyze the content first — probe the video for metadata (resolution, codec, duration, bitrate), plan an optimal encoding strategy, and split the file into segments that can be transcoded independently and in parallel. A 2-hour movie split into 2-second segments produces 3600 segments. With a pool of 100 workers, the entire movie can be transcoded in roughly the time it takes to process 36 segments sequentially. Latency is measured in minutes to hours depending on queue depth and video length. YouTube, Netflix, and Vimeo all use VOD pipelines.

**Live Streaming** is a completely different beast. Video arrives as a continuous stream of chunks from an encoder (OBS, hardware encoder, mobile app). Each chunk must be transcoded and packaged into streaming segments **as it arrives**, because viewers are watching in near-real-time. There is no opportunity to analyze the full content upfront or retry failed segments without introducing visible gaps. The latency target is 2-10 seconds from camera to screen (glass-to-glass latency). Twitch, YouTube Live, and Facebook Live operate live pipelines. Live transcoding typically uses fewer quality levels (3-4 vs 6-8 for VOD) to keep processing time under the segment duration.

The key architectural difference: VOD pipelines optimize for **throughput and quality** (process as many videos as possible with the best possible encoding), while live pipelines optimize for **latency and reliability** (never let the stream buffer, never drop a segment). This chapter focuses on the VOD pipeline, which is the more complex system design problem due to its job scheduling, parallelism, and assembly requirements.

## Adaptive Bitrate Streaming Explained

Adaptive bitrate streaming (ABR) is the technique that makes video playback smooth across varying network conditions. Instead of serving a single video file at a fixed quality, the server provides the **same video at multiple quality levels**, and the player dynamically switches between them based on available bandwidth.

**Why ABR matters**: A user on a fast Wi-Fi connection should see crisp 1080p video. The same user switching to a cellular connection in a tunnel should seamlessly drop to 360p rather than stalling with a buffering spinner. ABR makes this automatic and invisible to the viewer.

**HLS (HTTP Live Streaming)** is the dominant ABR format, supported by every major browser and device. The structure is hierarchical:

1. **Master playlist** (`.m3u8`): A text file listing all available quality variants with their bandwidth and resolution. The player reads this first to discover what quality levels exist.
2. **Variant playlists** (`.m3u8`): One per quality level. Each lists the individual video segment files in playback order with their durations.
3. **Segments** (`.ts`): The actual video data, typically 2-10 seconds each. These are standard MPEG-TS files that can be served by any HTTP server or CDN.

The player starts by downloading the master playlist, estimates the current bandwidth, picks the highest quality variant that fits within the available bandwidth, and starts downloading segments from that variant playlist. Every few segments, it re-estimates bandwidth and can switch to a higher or lower quality variant. The switch happens at segment boundaries, so it is seamless.

**Segment duration trade-offs**: Shorter segments (2 seconds) enable faster quality switching and lower startup latency, but create more HTTP requests and slightly worse compression efficiency. Longer segments (10 seconds) compress better and reduce request overhead, but make quality switching sluggish and increase the minimum startup buffer. The industry standard is **6 seconds** as a balanced default, with 2-4 seconds preferred for live streaming where latency matters more.

## Step-by-Step: How a Video Gets Transcoded

Here is the complete lifecycle of a video from upload to playback, showing every stage of the pipeline:

1. **Upload**: The client uploads a raw video file (MP4, MOV, MKV, AVI) to the Upload API via multipart upload or resumable upload for large files. The file is written directly to object storage (S3, GCS, MinIO).

2. **Probe**: The system runs a metadata probe (equivalent to `ffprobe`) on the uploaded file to extract: resolution, codec, frame rate, bitrate, duration, audio channels, and container format. This metadata determines which transcoding profiles to apply.

3. **Create Transcoding Profile**: Based on the source video properties, the system selects output profiles. A 1080p source gets 1080p, 720p, 480p, and 360p outputs. A 720p source skips the 1080p output (upscaling wastes bandwidth and looks worse). Each profile specifies target resolution, bitrate, codec, and encoding preset.

4. **Split into Segments**: The source video is logically split into N-second chunks (default 6 seconds). For a 10-minute video at 6-second segments, this produces 100 segments. Each segment is an independent unit of work.

5. **Distribute to Workers**: For each segment and each quality level, a transcoding task is created and added to the job queue. 100 segments times 4 quality levels equals 400 individual transcoding tasks. The job scheduler assigns tasks to available workers from the pool, respecting priority and fair scheduling.

6. **Transcode Each Segment**: Each worker picks up a task, downloads the relevant portion of the source video from object storage, transcodes it to the target resolution and bitrate, and uploads the output segment back to object storage. The worker reports progress and completion back to the progress tracker.

7. **Merge and Package**: Once all segments for a given quality level are complete, the system verifies segment integrity (correct duration, no gaps) and generates the variant playlist for that quality level.

8. **Generate HLS Manifest**: When all quality levels are complete, the system generates the master `.m3u8` playlist referencing all variant playlists. The video is now ready for playback.

9. **Notify Completion**: The system fires a webhook to the configured callback URL with the job status, output URLs, and manifest location. The client application can now make the video available to viewers.

## Building the Transcoding Service

Here is the complete transcoding service with job scheduling, worker pool, progress tracking, HLS manifest generation, and an HTTP API. Both implementations include priority queues with fair scheduling, worker heartbeats, segment-level progress, and graceful shutdown.

<CodeTabs tsFile="video-transcoding.ts" goFile="video-transcoding.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from "node:http";
import crypto from "node:crypto";

// ===========================================
// 1. TYPES & CONSTANTS
// ===========================================

type JobStatus = "pending" | "probing" | "splitting" | "transcoding" | "merging" | "completed" | "failed" | "cancelled";
type SegmentStatus = "pending" | "assigned" | "processing" | "completed" | "failed";
type WorkerStatus = "idle" | "busy" | "draining" | "offline";

interface TranscodeProfile {
  name: string;
  width: number;
  height: number;
  bitrate: number;       // kbps
  codec: string;
  preset: string;
}

interface VideoSegment {
  id: string;
  jobId: string;
  index: number;
  startTime: number;     // seconds
  duration: number;      // seconds
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
  priority: number;      // lower = higher priority
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
  duration: number;      // seconds
  codec: string;
  bitrate: number;       // kbps
  frameRate: number;
  fileSize: number;      // bytes
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
  { name: "1080p", width: 1920, height: 1080, bitrate: 5000, codec: "h264", preset: "medium" },
  { name: "720p",  width: 1280, height: 720,  bitrate: 2800, codec: "h264", preset: "medium" },
  { name: "480p",  width: 854,  height: 480,  bitrate: 1400, codec: "h264", preset: "fast" },
  { name: "360p",  width: 640,  height: 360,  bitrate: 800,  codec: "h264", preset: "fast" },
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

  updateSegmentStatus(jobId: string, segmentId: string, status: SegmentStatus, outputPath?: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const segment = job.segments.find((s) => s.id === segmentId);
    if (!segment) return;

    segment.status = status;
    if (status === "completed") {
      segment.completedAt = Date.now();
      if (outputPath) segment.outputPath = outputPath;
    }
  }

  getJobProgress(jobId: string): { total: number; completed: number; failed: number; percent: number; eta: number } {
    const job = this.jobs.get(jobId);
    if (!job) return { total: 0, completed: 0, failed: 0, percent: 0, eta: 0 };

    const total = job.segments.length;
    const completed = job.segments.filter((s) => s.status === "completed").length;
    const failed = job.segments.filter((s) => s.status === "failed").length;
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
    return job.segments.every((s) => s.status === "completed" || s.status === "failed");
  }

  hasFailures(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    return job.segments.some((s) => s.status === "failed" && s.retryCount >= MAX_RETRIES);
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
      status: "idle",
      currentTask: null,
      lastHeartbeat: Date.now(),
      tasksCompleted: 0,
      tasksFailed: 0,
      registeredAt: Date.now(),
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
    if (!worker || worker.status !== "idle") return false;
    worker.status = "busy";
    worker.currentTask = taskId;
    return true;
  }

  completeTask(workerId: string, success: boolean): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;
    worker.status = "idle";
    worker.currentTask = null;
    if (success) worker.tasksCompleted++;
    else worker.tasksFailed++;
  }

  getIdleWorkers(): WorkerInfo[] {
    return Array.from(this.workers.values()).filter((w) => w.status === "idle");
  }

  getStaleWorkers(): WorkerInfo[] {
    const now = Date.now();
    return Array.from(this.workers.values()).filter(
      (w) => w.status === "busy" && now - w.lastHeartbeat > HEARTBEAT_TIMEOUT
    );
  }

  drainWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.status = "draining";
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
      idle: workers.filter((w) => w.status === "idle").length,
      busy: workers.filter((w) => w.status === "busy").length,
      draining: workers.filter((w) => w.status === "draining").length,
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
        id: `${job.id}-${profile.name}-seg${i.toString().padStart(4, "0")}`,
        jobId: job.id,
        index: i,
        startTime,
        duration: segDuration,
        profileName: profile.name,
        status: "pending",
        assignedWorker: null,
        assignedAt: 0,
        completedAt: 0,
        outputPath: "",
        retryCount: 0,
      });
    }
  }

  return segments;
}

// ===========================================
// 7. HLS MANIFEST GENERATOR
// ===========================================

function generateMasterPlaylist(job: TranscodeJob): string {
  let manifest = "#EXTM3U\n#EXT-X-VERSION:3\n\n";

  for (const profile of job.profiles) {
    const bandwidth = profile.bitrate * 1000; // convert kbps to bps
    manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${profile.width}x${profile.height},CODECS="avc1.640028"\n`;
    manifest += `${profile.name}/playlist.m3u8\n\n`;
  }

  return manifest;
}

function generateVariantPlaylist(job: TranscodeJob, profileName: string): string {
  const profileSegments = job.segments
    .filter((s) => s.profileName === profileName && s.status === "completed")
    .sort((a, b) => a.index - b.index);

  let manifest = "#EXTM3U\n#EXT-X-VERSION:3\n";
  manifest += `#EXT-X-TARGETDURATION:${SEGMENT_DURATION}\n`;
  manifest += "#EXT-X-MEDIA-SEQUENCE:0\n\n";

  for (const segment of profileSegments) {
    manifest += `#EXTINF:${segment.duration.toFixed(3)},\n`;
    manifest += `segment${segment.index.toString().padStart(4, "0")}.ts\n`;
  }

  manifest += "#EXT-X-ENDLIST\n";
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
        console.log(`[WEBHOOK] Delivered to ${entry.url}: ${JSON.stringify(entry.payload).slice(0, 120)}...`);
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

  submitJob(userId: string, sourceUrl: string, webhookUrl: string = "", priority: number = 5): TranscodeJob {
    const job: TranscodeJob = {
      id: crypto.randomUUID(),
      userId,
      sourceUrl,
      status: "pending",
      priority,
      createdAt: Date.now(),
      startedAt: 0,
      completedAt: 0,
      sourceMeta: null,
      profiles: [],
      segments: [],
      webhookUrl,
      outputBaseUrl: "",
      error: "",
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
      job.status = "probing";
      console.log(`[JOB] Probing ${job.id}...`);
      job.sourceMeta = this.probeVideo(job.sourceUrl);

      // Step 2: Select profiles based on source resolution
      job.status = "splitting";
      job.profiles = this.selectProfiles(job.sourceMeta);
      console.log(`[JOB] Selected ${job.profiles.length} profiles for ${job.id}`);

      // Step 3: Create segments
      job.segments = createSegments(job);
      console.log(`[JOB] Created ${job.segments.length} segments for ${job.id}`);

      // Step 4: Transcode segments via worker pool
      job.status = "transcoding";
      await this.transcodeSegments(job);

      // Step 5: Check for failures
      if (this.tracker.hasFailures(job.id)) {
        job.status = "failed";
        job.error = "Some segments failed after max retries";
        console.log(`[JOB] Job ${job.id} FAILED`);
      } else {
        // Step 6: Generate manifests
        job.status = "merging";
        job.outputBaseUrl = `/output/${job.id}`;
        console.log(`[JOB] Generating manifests for ${job.id}`);

        const masterPlaylist = generateMasterPlaylist(job);
        console.log(`[MANIFEST] Master playlist:\n${masterPlaylist}`);

        for (const profile of job.profiles) {
          const variantPlaylist = generateVariantPlaylist(job, profile.name);
          console.log(`[MANIFEST] Variant ${profile.name}:\n${variantPlaylist}`);
        }

        job.status = "completed";
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
        completedAt: job.completedAt,
      });
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "Unknown error";
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
      codec: "h264",
      bitrate: 8000,
      frameRate: 30,
      fileSize: 120_000_000,
    };
  }

  private selectProfiles(meta: VideoMetadata): TranscodeProfile[] {
    // Only include profiles at or below the source resolution
    return DEFAULT_PROFILES.filter((p) => p.height <= meta.height);
  }

  private async transcodeSegments(job: TranscodeJob): Promise<void> {
    const pendingSegments = () => job.segments.filter((s) => s.status === "pending");
    const activeSegments = () => job.segments.filter((s) => s.status === "assigned" || s.status === "processing");

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
          segment.status = "assigned";
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
    segment.status = "processing";

    // Simulate transcoding time (50-200ms in simulation, minutes in reality)
    const transcodeTime = 50 + Math.random() * 150;

    setTimeout(() => {
      // Simulate 5% failure rate
      const success = Math.random() > 0.05;

      if (success) {
        const outputPath = `/output/${jobId}/${segment.profileName}/segment${segment.index.toString().padStart(4, "0")}.ts`;
        this.tracker.updateSegmentStatus(jobId, segment.id, "completed", outputPath);
        this.pool.completeTask(workerId, true);
        this.pool.heartbeat(workerId);
      } else {
        segment.retryCount++;
        if (segment.retryCount < MAX_RETRIES) {
          segment.status = "pending"; // Re-queue for retry
          segment.assignedWorker = null;
          console.log(`[RETRY] Segment ${segment.id} retry ${segment.retryCount}/${MAX_RETRIES}`);
        } else {
          this.tracker.updateSegmentStatus(jobId, segment.id, "failed");
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
        (s) => s.assignedWorker === worker.id && (s.status === "assigned" || s.status === "processing")
      );
      if (segment) {
        segment.status = "pending";
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

    if (job.status === "pending") {
      this.queue.remove(jobId);
    }

    job.status = "cancelled";
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
      workers: this.pool.getAllWorkers(),
    };
  }

  async gracefulShutdown(): Promise<void> {
    console.log("[SHUTDOWN] Initiating graceful shutdown...");
    this.shutdownRequested = true;

    // Drain all workers — let them finish current tasks
    for (const worker of this.pool.getAllWorkers()) {
      if (worker.status === "busy") {
        this.pool.drainWorker(worker.id);
      }
    }

    // Wait for active tasks to complete (with timeout)
    const deadline = Date.now() + 30_000;
    while (this.processing && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("[SHUTDOWN] Graceful shutdown complete");
  }
}

// ===========================================
// 10. HTTP SERVER
// ===========================================

const service = new TranscodingService(4);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const method = req.method || "GET";

  // Parse JSON body for POST requests
  const readBody = (): Promise<any> =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });

  const json = (status: number, body: object) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body, null, 2));
  };

  // POST /api/transcode — Submit a new transcoding job
  if (method === "POST" && url.pathname === "/api/transcode") {
    const body = await readBody();
    if (!body.sourceUrl || !body.userId) {
      return json(400, { error: "sourceUrl and userId are required" });
    }
    const job = service.submitJob(body.userId, body.sourceUrl, body.webhookUrl || "", body.priority || 5);
    // Start processing asynchronously
    service.processNextJob();
    return json(201, { jobId: job.id, status: job.status });
  }

  // GET /api/jobs/:id — Get job status and progress
  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (method === "GET" && jobMatch) {
    const job = service.getJob(jobMatch[1]);
    if (!job) return json(404, { error: "Job not found" });
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
      error: job.error || undefined,
    });
  }

  // GET /api/jobs/:id/manifest — Get HLS master playlist
  const manifestMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/manifest$/);
  if (method === "GET" && manifestMatch) {
    const job = service.getJob(manifestMatch[1]);
    if (!job) return json(404, { error: "Job not found" });
    if (job.status !== "completed") {
      return json(409, { error: "Job not yet completed", status: job.status });
    }
    const manifest = generateMasterPlaylist(job);
    res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
    return res.end(manifest);
  }

  // DELETE /api/jobs/:id — Cancel a job
  const cancelMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (method === "DELETE" && cancelMatch) {
    const success = service.cancelJob(cancelMatch[1]);
    if (!success) return json(404, { error: "Job not found" });
    return json(200, { status: "cancelled" });
  }

  // GET /api/workers — Worker pool status
  if (method === "GET" && url.pathname === "/api/workers") {
    return json(200, service.getWorkerStatus());
  }

  json(404, { error: "Not found" });
});

// Graceful shutdown handlers
process.on("SIGINT", async () => {
  await service.gracefulShutdown();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await service.gracefulShutdown();
  server.close();
  process.exit(0);
});

// --- Demo ---
async function demo() {
  console.log("=== Video Transcoding Service Demo ===\n");

  // Submit jobs from different users
  const job1 = service.submitJob("user-alice", "/uploads/alice-vacation.mp4", "https://example.com/webhook", 3);
  const job2 = service.submitJob("user-bob", "/uploads/bob-tutorial.mp4", "", 5);
  const job3 = service.submitJob("user-alice", "/uploads/alice-concert.mp4", "https://example.com/webhook", 7);

  console.log(`\nQueue: 3 jobs submitted\n`);

  // Process first job
  console.log("--- Processing Job 1 ---");
  await service.processNextJob();

  // Wait for transcoding to finish
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Check progress
  const progress = service.getJobProgress(job1.id);
  console.log(`\nJob 1 progress: ${progress.percent}% (${progress.completed}/${progress.total} segments)`);

  const finalJob = service.getJob(job1.id);
  console.log(`Job 1 status: ${finalJob?.status}`);

  if (finalJob?.status === "completed") {
    console.log("\n--- HLS Master Playlist ---");
    console.log(generateMasterPlaylist(finalJob));
  }

  // Worker pool status
  console.log("--- Worker Pool ---");
  console.log(JSON.stringify(service.getWorkerStatus().pool, null, 2));

  // Process remaining jobs
  console.log("\n--- Processing Job 2 ---");
  await service.processNextJob();
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("\n--- Processing Job 3 ---");
  await service.processNextJob();
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("\n=== All jobs processed ===");

  // Start HTTP server
  const PORT = 3900;
  server.listen(PORT, () => {
    console.log(`\nHTTP server listening on http://localhost:${PORT}`);
    console.log("Endpoints:");
    console.log("  POST /api/transcode        — Submit job");
    console.log("  GET  /api/jobs/:id          — Job status");
    console.log("  GET  /api/jobs/:id/manifest — HLS manifest");
    console.log("  DELETE /api/jobs/:id        — Cancel job");
    console.log("  GET  /api/workers           — Worker pool status");
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

## Design Decisions Explained

### Why Split Videos Into Segments?

Segment-based transcoding is the key to making video processing parallel. A monolithic approach — feeding a 2-hour file into a single FFmpeg process — means one CPU core works for hours while hundreds of other cores sit idle. By splitting the video into 6-second segments, a 2-hour movie produces 1200 independent transcoding tasks. With 100 workers, the total wall-clock time drops from hours to minutes.

Segments also provide natural failure boundaries. If a worker crashes while transcoding segment 847, only that one segment needs to be retried — not the entire video. The completed segments remain valid and do not need to be reprocessed. This property is essential for achieving 99.9% job completion rates at scale.

Finally, segments map directly to the HLS streaming format. Each `.ts` file in an HLS stream is exactly one segment, so the transcoding output requires no post-processing to be served to players. The segment boundaries created during splitting become the seek points in the final stream.

### Why Priority Queues with Fair Scheduling?

A naive FIFO queue creates a starvation problem. If one user uploads 50 videos, those 50 jobs occupy the queue for hours while other users wait. Fair scheduling uses **round-robin across users** combined with **priority ordering within each user's queue**. This means every user gets their next job processed before any user gets their second job processed, regardless of submission order.

Priority within a user's queue allows the system to distinguish between urgent and background work. A live event recording that needs to be available in 30 minutes gets priority 1, while a batch re-encode of an old archive gets priority 9. Both get fair access relative to other users, but within each user's jobs the priorities are respected.

### Why HLS Over DASH?

HLS (HTTP Live Streaming) and DASH (Dynamic Adaptive Streaming over HTTP) solve the same problem with nearly identical architectures. HLS uses `.m3u8` text playlists and `.ts` segments; DASH uses XML manifests (`.mpd`) and fragmented MP4 (`.m4s`) segments. Both support adaptive bitrate switching.

HLS wins in practice for three reasons. First, it is the **only format supported natively by iOS and Safari** — Apple devices represent a significant portion of video viewers. DASH requires a JavaScript player library on Apple devices. Second, HLS manifests are simple text files that are trivial to generate, parse, debug, and cache. Third, CDN support for HLS is universal, while DASH support varies. Most production systems generate HLS as the primary format and optionally add DASH for specific clients.

### Why Worker Heartbeats?

In a distributed worker pool, silence is ambiguous. A worker that stops reporting could be: (a) processing a particularly large segment, (b) experiencing a network partition, (c) crashed, or (d) stuck in an infinite loop. Without heartbeats, the system cannot distinguish between these cases and must wait indefinitely.

Heartbeats solve this by requiring each worker to send a periodic signal (every 10 seconds) while processing. If the orchestrator receives no heartbeat for 30 seconds, it assumes the worker is dead and reassigns its segments to healthy workers. The timeout must be long enough to tolerate network jitter but short enough to detect failures before they impact overall job completion time. A stale segment that sits assigned but unprocessed for minutes directly impacts the user's wait time.

<div class="takeaways">

### Key Takeaways

- Segment-based transcoding enables massive parallelism — a 2-hour movie split into 720 two-second segments can be transcoded by 720 workers simultaneously
- Adaptive bitrate streaming lets players switch quality seamlessly based on network conditions — the key to buffer-free video
- HLS manifests are just text files pointing to video segments — simple to generate, cache, and serve through CDNs
- Worker heartbeats detect stalled jobs — if a worker goes silent for 30 seconds, its segments get reassigned
- Fair scheduling prevents one user's 4K movie from blocking everyone else's uploads
- Progress tracking with ETA gives users confidence their upload is being processed, not lost

</div>

<div class="when-to-use">

### Real-World Usage

- **YouTube** transcodes 500+ hours of video uploaded every minute into 8+ quality levels with VP9 and AV1 codecs
- **Netflix** pre-computes per-title encoding profiles — dark scenes get fewer bits, action scenes get more
- **Twitch** transcodes live streams in real-time to 3-4 quality levels with sub-3-second glass-to-glass latency
- **TikTok** uses hardware-accelerated transcoding (NVENC) to process millions of short videos per day
- This architecture handles 1000+ concurrent transcoding jobs with segment-level parallelism and fair scheduling

</div>

