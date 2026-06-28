---
title: "Case Study: Live Streaming Platform"
subtitle: "Design and build a production live streaming system with RTMP ingest, real-time transcoding, HLS delivery, chat integration, and viewer scaling."
chapter: 25
level: "advanced"
readingTime: "36 min"
topics: ["live streaming", "RTMP", "real-time transcoding", "HLS", "viewer scaling", "low latency"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## What Makes Live Streaming Hard?

Live streaming combines the hardest problems in distributed systems: **real-time processing** (no do-overs — if you drop a frame, it's gone), **massive concurrent viewers** (Twitch peaks at 30M+ simultaneous viewers), **low latency** (2-10 seconds from camera to screen), **adaptive quality** (viewers on 5G and 3G watch the same stream), and **chat synchronization** (chat messages should align with what's happening on screen).

<Callout type="info">

**Real-World Analogy**

Like a live TV broadcast of a sports match — cameras capture the action, the production truck mixes feeds, and the signal goes to millions of viewers simultaneously with minimal delay.

</Callout>

Think of it like broadcasting live TV, but every viewer can choose their own quality level, and the broadcast infrastructure must scale from 0 to millions of viewers in seconds when a popular streamer goes live. Unlike VOD where you process the entire video before anyone watches, live streaming must transcode, package, and distribute each second of video as it's created.

<Mermaid
	title="Live Streaming Architecture"
	code={`
graph TD
  B["Broadcaster<br/>RTMP Ingest"] --> E["Edge Ingest<br/>Nearest PoP"] --> T["Transcoder<br/>Multi-Quality"]
  T --> O["Origin Server<br/>HLS Segments"] --> C["CDN Edge<br/>Global Delivery"] --> V["Viewers<br/>HLS Player"]
`}
/>

## Requirements

- **Functional**: RTMP ingest from OBS/Streamlabs, real-time transcoding to multiple qualities, HLS delivery, stream key authentication, live chat, viewer count, stream recording (DVR), go-live/end-stream lifecycle
- **Non-functional**: Glass-to-glass latency under 5 seconds, support 100K+ concurrent viewers per stream, 99.95% uptime, auto-scaling CDN
- **Scale**: 10K concurrent streams, 50M concurrent viewers total

## The Live Streaming Pipeline

### Ingest

Broadcasters send video from OBS, Streamlabs, or mobile apps using **RTMP (Real-Time Messaging Protocol)**. RTMP is used for ingest (not delivery) because it provides low-latency, reliable, bidirectional communication with wide encoder support. The stream connects to the nearest **Point of Presence (PoP)** to minimize upload latency. The stream key serves as authentication — it's a secret token the broadcaster gets from the platform.

### Real-Time Transcoding

As RTMP data arrives, it's transcoded into multiple quality levels in real-time. Unlike VOD (where you can split and parallelize), live transcoding is sequential — you must process segment N before segment N+1. Each output quality must have **keyframe-aligned segments** so players can switch between qualities at any segment boundary without visual artifacts.

### HLS Packaging

Transcoded segments are packaged as HLS — `.ts` video segments (typically 2-4 seconds each) with `.m3u8` playlists. The playlist uses a **sliding window** that keeps only the last N segments (e.g., last 30 seconds). New segments are appended, old ones are removed. The `EXT-X-MEDIA-SEQUENCE` tag tells players which segment number comes next.

### CDN Distribution

Segments are pushed to CDN origin servers, which propagate to edge nodes worldwide. When 100K viewers request the same segment, only one request reaches the origin — the CDN serves cached copies from edge nodes. This is why HLS (HTTP-based) won over RTMP for delivery: HTTP content is trivially cacheable by existing CDN infrastructure.

## Low Latency vs Ultra-Low Latency

| Approach | Latency | How It Works | Use Case |
|----------|---------|-------------|----------|
| **Standard HLS** | 10-30s | 3 segments × 6s + buffer | VOD-like live (sports replays) |
| **Low-Latency HLS (LL-HLS)** | 2-5s | Partial segments + blocking playlist | Interactive streams (Twitch) |
| **WebRTC** | under 1s | Peer-to-peer, no segments | Video calls, auctions |

Standard HLS has high latency because the player buffers 3 segments before playing (to handle network jitter). **LL-HLS** solves this with partial segments — instead of waiting for a full 6-second segment, the player can start playing after receiving just 200ms of data. The playlist uses **blocking reload** — the player's request blocks at the CDN until the next partial segment is ready, eliminating polling delay.

## Live Chat at Scale

Chat is deceptively complex at live-streaming scale. A popular stream with 100K viewers generates thousands of chat messages per second. The chat system must: **fan out messages** to all viewers in the room (100K WebSocket connections), **rate limit** senders (slow mode: 1 message every 3 seconds), **synchronize with video** (chat timestamps align with stream time), and handle **moderation** (ban, timeout, delete messages).

## Building the Live Streaming Platform

<CodeTabs tsFile="live-streaming.ts" goFile="live-streaming.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from "node:http";
import crypto from "node:crypto";

// ===========================================
// 1. TYPES
// ===========================================
type StreamStatus = "idle" | "live" | "ended";

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
      streamKey: `live_${crypto.randomBytes(16).toString("hex")}`,
      status: "idle",
      startedAt: null, endedAt: null,
      broadcasterId,
      quality: ["1080p", "720p", "480p", "360p"],
      viewerCount: 0,
      chatEnabled: true, recordingEnabled: true,
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
    if (!stream) throw new Error("Stream not found");
    if (stream.status === "live") throw new Error("Already live");
    stream.status = "live";
    stream.startedAt = new Date().toISOString();
    console.log(`[STREAM] ${stream.id} is LIVE — ${stream.title}`);
    return stream;
  }

  endStream(streamId: string): Stream {
    const stream = this.streams.get(streamId);
    if (!stream) throw new Error("Stream not found");
    if (stream.status !== "live") throw new Error("Not live");
    stream.status = "ended";
    stream.endedAt = new Date().toISOString();
    console.log(`[STREAM] ${stream.id} ended`);
    return stream;
  }

  get(id: string): Stream | null {
    return this.streams.get(id) || null;
  }

  getLive(): Stream[] {
    return [...this.streams.values()].filter(s => s.status === "live");
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
      streamId, quality, sequenceNum: seqNum,
      duration, createdAt: Date.now(),
      data: `segment_${seqNum}_${quality}.ts`,
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
    if (segments.length === 0) return "";

    const firstSeq = segments[0].sequenceNum;
    let playlist = "#EXTM3U\n#EXT-X-VERSION:3\n";
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
      "1080p": 5000000, "720p": 2500000, "480p": 1000000, "360p": 500000,
    };
    const resolutions: Record<string, string> = {
      "1080p": "1920x1080", "720p": "1280x720", "480p": "854x480", "360p": "640x360",
    };

    let manifest = "#EXTM3U\n#EXT-X-VERSION:3\n\n";
    for (const q of qualities) {
      manifest += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidths[q] || 1000000},RESOLUTION=${resolutions[q] || "640x360"}\n`;
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
      userId, streamId, quality, connectedAt: Date.now(), lastHeartbeat: Date.now(),
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

  send(streamId: string, userId: string, username: string, content: string, streamStartTime: number): ChatMessage {
    const key = `${userId}:${streamId}`;
    const lastMsg = this.rateLimiter.get(key) || 0;
    if (Date.now() - lastMsg < this.slowModeMs) {
      throw new Error("Slow mode: wait before sending another message");
    }

    const msg: ChatMessage = {
      id: crypto.randomUUID().slice(0, 8),
      streamId, userId, username, content,
      timestamp: Date.now(),
      streamTime: streamStartTime > 0 ? (Date.now() - streamStartTime) / 1000 : 0,
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
  private metrics = new Map<string, { bitrate: number; fps: number; droppedFrames: number; lastUpdate: number }>();

  update(streamId: string, bitrate: number, fps: number, droppedFrames: number): void {
    this.metrics.set(streamId, { bitrate, fps, droppedFrames, lastUpdate: Date.now() });

    if (bitrate < 500000) console.log(`[HEALTH] ⚠ Stream ${streamId}: low bitrate ${(bitrate/1000).toFixed(0)}kbps`);
    if (fps < 20) console.log(`[HEALTH] ⚠ Stream ${streamId}: low FPS ${fps}`);
    if (droppedFrames > 100) console.log(`[HEALTH] ⚠ Stream ${streamId}: ${droppedFrames} dropped frames`);
  }

  get(streamId: string) { return this.metrics.get(streamId); }
}

// ===========================================
// 7. TRANSCODER SIMULATOR
// ===========================================
class LiveTranscoder {
  private segmentBuffer: SegmentBuffer;
  private intervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(buffer: SegmentBuffer) { this.segmentBuffer = buffer; }

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
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error("Invalid JSON")); }
    });
  });
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const method = req.method || "GET";

  try {
    // POST /api/streams — Create stream
    if (url.pathname === "/api/streams" && method === "POST") {
      const body = await parseBody(req) as any;
      const stream = streams.create(body.broadcasterId || "anon", body.title || "Untitled");
      json(res, 201, stream); return;
    }

    // POST /api/streams/:id/start — Go live
    const startMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/start$/);
    if (startMatch && method === "POST") {
      const body = await parseBody(req) as any;
      const stream = streams.authenticate(body.streamKey);
      if (!stream || stream.id !== startMatch[1]) {
        json(res, 401, { error: "Invalid stream key" }); return;
      }
      const live = streams.goLive(stream.id);
      transcoder.startTranscoding(stream.id, live.quality);
      json(res, 200, live); return;
    }

    // POST /api/streams/:id/end — End stream
    const endMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/end$/);
    if (endMatch && method === "POST") {
      transcoder.stopTranscoding(endMatch[1]);
      const stream = streams.endStream(endMatch[1]);
      json(res, 200, stream); return;
    }

    // GET /api/streams/:id/master.m3u8 — HLS master playlist
    const masterMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/master\.m3u8$/);
    if (masterMatch && method === "GET") {
      const stream = streams.get(masterMatch[1]);
      if (!stream || stream.status !== "live") { json(res, 404, { error: "Stream not live" }); return; }
      const manifest = segmentBuffer.generateMasterPlaylist(stream.id, stream.quality);
      res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
      res.end(manifest); return;
    }

    // GET /api/streams/:id/:quality/playlist.m3u8 — Variant playlist
    const variantMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/(\w+)\/playlist\.m3u8$/);
    if (variantMatch && method === "GET") {
      const playlist = segmentBuffer.generatePlaylist(variantMatch[1], variantMatch[2]);
      res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
      res.end(playlist); return;
    }

    // GET /api/streams/:id/viewers
    const viewerMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/viewers$/);
    if (viewerMatch && method === "GET") {
      json(res, 200, { count: viewers.getCount(viewerMatch[1]) }); return;
    }

    // POST /api/streams/:id/chat — Send chat message
    const chatMatch = url.pathname.match(/^\/api\/streams\/([^/]+)\/chat$/);
    if (chatMatch && method === "POST") {
      const body = await parseBody(req) as any;
      const stream = streams.get(chatMatch[1]);
      const startTime = stream?.startedAt ? new Date(stream.startedAt).getTime() : 0;
      const msg = chat.send(chatMatch[1], body.userId || "anon", body.username || "Anonymous", body.content, startTime);
      json(res, 201, msg); return;
    }

    // GET /api/streams/:id/chat
    if (chatMatch && method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      json(res, 200, { messages: chat.getRecent(chatMatch[1], limit) }); return;
    }

    // GET /api/streams/live — List live streams
    if (url.pathname === "/api/streams/live" && method === "GET") {
      const live = streams.getLive().map(s => ({
        ...s, viewerCount: viewers.getCount(s.id), streamKey: undefined,
      }));
      json(res, 200, { streams: live }); return;
    }

    // GET /api/streams/:id
    const streamMatch = url.pathname.match(/^\/api\/streams\/([^/]+)$/);
    if (streamMatch && method === "GET") {
      const stream = streams.get(streamMatch[1]);
      if (!stream) { json(res, 404, { error: "Stream not found" }); return; }
      json(res, 200, { ...stream, viewerCount: viewers.getCount(stream.id), streamKey: undefined }); return;
    }

    if (url.pathname === "/health") { json(res, 200, { status: "ok" }); return; }
    json(res, 404, { error: "Not found" });
  } catch (err: any) {
    json(res, 400, { error: err.message || "Internal server error" });
  }
});

const PORT = parseInt(process.env.PORT || "3000");
server.listen(PORT, () => console.log(`Live Streaming on http://localhost:${PORT}`));
process.on("SIGTERM", () => server.close());
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

## Design Decisions Explained

### Why RTMP for Ingest?

RTMP provides low-latency, reliable, bidirectional streaming with wide encoder support (OBS, Streamlabs, FFmpeg). While newer protocols like SRT offer better error correction, RTMP's ubiquity makes it the pragmatic choice. Every streaming software supports it out of the box.

### Why HLS for Delivery Instead of RTMP to Viewers?

RTMP requires persistent TCP connections and doesn't work with CDNs (which cache HTTP responses). HLS uses standard HTTP requests for small segment files, making it trivially cacheable. When 100K viewers request the same segment, the CDN serves 99,999 of them from cache. RTMP would require 100K individual connections to your servers.

### Why a Sliding Window Manifest?

A live HLS playlist can't grow forever — a 24-hour stream at 2-second segments would have 43,200 entries. The sliding window keeps only the last N segments (e.g., 15 segments = 30 seconds). New viewers start from the live edge, and the `EXT-X-MEDIA-SEQUENCE` tag ensures players know the correct segment ordering even as old segments are removed.

### Why Keyframe-Aligned Segments?

Video codecs use keyframes (I-frames) as reference points — you can only start decoding from a keyframe. If segments across quality levels don't align at keyframe boundaries, switching from 720p to 480p mid-segment would produce visual artifacts. Keyframe alignment ensures clean quality switching at every segment boundary.

### Why Chat Separate from Video?

Chat and video have different latency profiles. Video has 3-5 second delivery latency (segment buffering). Chat can be near-instant (WebSocket). Coupling them would either delay chat (bad for interaction) or require complex synchronization. Keeping them separate and adding stream timestamps to chat messages lets clients optionally sync them.

<div class="takeaways">

### Key Takeaways

- RTMP for ingest + HLS for delivery is the industry standard split — RTMP is low-latency for upload, HLS is CDN-friendly for distribution
- Keyframe-aligned segments across quality levels enable seamless quality switching mid-stream
- Sliding window HLS manifests keep the playlist bounded — viewers join at the live edge, DVR users get a longer window
- Live chat must be rate-limited and decoupled from video delivery — a chat storm shouldn't affect video quality
- Stream health monitoring detects encoding issues before viewers notice — dropped frames, bitrate drops, audio desync
- CDN edge caching is critical — without it, 100K viewers requesting the same segment would overwhelm the origin server

</div>

<div class="when-to-use">

### Real-World Usage

- **Twitch** handles 30M+ concurrent viewers using RTMP ingest → real-time transcoding → HLS delivery through a global CDN
- **YouTube Live** uses RTMP/SRT ingest with automatic quality transcoding and LL-HLS for sub-3-second latency
- **Netflix Live** (launched 2024) serves live events to 200M+ subscribers using their existing CDN infrastructure
- **Discord** uses WebRTC for screen sharing (sub-1-second latency) but HLS for Go Live streams to larger audiences
- This architecture supports 10K concurrent streams with 100K+ viewers each, with sub-5-second glass-to-glass latency

</div>

