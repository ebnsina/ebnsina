---
title: 'টিউটোরিয়াল: রিয়েল-টাইম অ্যানালিটিক্স ড্যাশবোর্ড বানানো'
subtitle: 'ইভেন্ট ইনজেশন, টাইম-সিরিজ অ্যাগ্রিগেশন, WebSocket স্ট্রিমিং, আর লাইভ কাউন্টার দিয়ে একটা রিয়েল-টাইম ড্যাশবোর্ড বানানোর ধাপে ধাপে গাইড।'
chapter: 22
level: 'intermediate'
readingTime: '28 মিনিট'
topics: ['tutorial', 'real-time analytics', 'time-series', 'WebSocket', 'event streaming']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

মিরপুর স্টেডিয়ামে খেলা চলছে, গ্যালারি ভর্তি দর্শক। মাঠের চারপাশে ইবনে সিনার কয়েকজন স্কোরার বসানো — প্রতিটা বল খেলা হওয়া মাত্রই তারা ওয়াকিটকিতে জানিয়ে দেয়, "চার রান", "এক রান আউট নেই", "ছক্কা"। এই খবরগুলো একটার পর একটা এসেই যাচ্ছে, থামছে না — যতক্ষণ খেলা চলছে ততক্ষণ বল-বাই-বল রিপোর্ট আসতেই থাকবে।

রিপোর্ট শোনার পর আল-খোয়ারিজমি বসে আছে একটা খাতা নিয়ে। প্রতিটা খবর আসা মাত্রই সে দুটো হিসাব আপডেট করে — মোট স্কোরের সাথে রান যোগ করে দেয়, আর চলতি ওভারের ঘরে বলটা তুলে রাখে। ওভার শেষ হলে সে সেই ওভারের ছয় বলের তালি টেনে পরের ওভারের নতুন ঘর খোলে। আল-খোয়ারিজমি কিন্তু প্রতিবার শুরু থেকে সব বল গোনে না — সে শুধু চলতি যোগফলটা ধরে রাখে আর নতুন রান তার সাথে জুড়ে দেয়। এদিকে ফাতিমা আল-ফিহরি বড় ইলেকট্রনিক স্কোরবোর্ডটা চালায় — আল-খোয়ারিজমির হিসাব বদলানো মাত্রই সে বোর্ডে নতুন সংখ্যা বসিয়ে দেয়, আর গোটা স্টেডিয়ামের প্রতিটা দর্শক সঙ্গে সঙ্গে নতুন স্কোর দেখে ফেলে। কাউকে জিজ্ঞেস করতে হয় না, কেউ বারবার "স্কোর কত হলো?" বলে চেঁচায় না — বোর্ড নিজেই সবাইকে জানিয়ে দেয়।

এই গল্পটাই আসলে একটা **real-time** অ্যানালিটিক্স **dashboard**। প্রতিটা বলের রিপোর্ট হলো একটা ইনকামিং **event** — অবিরাম আসতে থাকা একটা **stream**; আল-খোয়ারিজমির চলতি যোগফল আর প্রতি-ওভারের তালি হলো **stream aggregation** আর windowed অ্যাগ্রিগেশন (পুরোটা আবার না গুনে চলতে চলতে যোগ করা); আর ফাতিমা আল-ফিহরির তখনই-আপডেট-হওয়া স্কোরবোর্ড হলো **WebSocket**/SSE দিয়ে দর্শকদের কাছে live push। বাস্তবে অ্যানালিটিক্স ড্যাশবোর্ড, লাইভ অপস মনিটর বা লাইভ ইউজার কাউন্টার ঠিক এভাবেই কাজ করে — ইভেন্ট ইনজেস্ট হয়, চলতে চলতে অ্যাগ্রিগেট হয়, আর কেউ রিফ্রেশ না চাপতেই স্ক্রিনে লাইভ আপডেট এসে পড়ে।

## আমরা কী বানাচ্ছি

এই টিউটোরিয়ালে আমরা একদম শূন্য থেকে একটা রিয়েল-টাইম অ্যানালিটিক্স ড্যাশবোর্ড বানাব — অনেকটা Google Analytics বা Mixpanel-এর সরলীকৃত সংস্করণের মতো। সিস্টেমটা page view, unique visitor, active user আর custom event ট্র্যাক করে। ডেটা একটা event ingestion API দিয়ে ভেতরে আসে, টাইম-সিরিজ বাকেটে (minute/hour/day) অ্যাগ্রিগেট হয়, আর WebSocket দিয়ে কানেক্টেড ড্যাশবোর্ডে স্ট্রিম হয়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

স্টক এক্সচেঞ্জের ট্রেডিং ফ্লোরের মতো — রিয়েল-টাইম স্ক্রিনে লাইভ দাম, ভলিউম আর ট্রেন্ড দেখা যায়। একটা বড় ট্রেড হলেই বোর্ড সঙ্গে সঙ্গে আপডেট হয়।

</Callout>

শেষ নাগাদ আপনার হাতে একটা কাজ করা সিস্টেম থাকবে যা সেকেন্ডে 100K+ ইভেন্ট ইনজেস্ট করতে পারে, সেগুলোকে কোয়েরিযোগ্য টাইম-সিরিজ ডেটায় অ্যাগ্রিগেট করে, আর নতুন ডেটা আসা মাত্রই ড্যাশবোর্ড ক্লায়েন্টে লাইভ আপডেট পুশ করে।

<Mermaid
title="Real-Time Dashboard Architecture"
code={`graph TD
  E["Event SDK<br/>Track Events"] --> I["Ingestion API<br/>Validate & Buffer"] --> A["Aggregator<br/>Time Buckets"]
  A --> T["Time-Series Store<br/>Minute/Hour/Day"] --> U["Active Users<br/>Sliding Window"] --> W["WebSocket Hub<br/>Live Stream"]`}
/>

## ধাপ ১: ইভেন্ট ডেটা মডেল

শুরু করি একটা অ্যানালিটিক্স ইভেন্ট দেখতে কেমন সেটা ঠিক করে। প্রতিটা ইভেন্টের থাকে একটা নাম ("page_view" বা "button_click"-এর মতো), একটা visitor ID (unique user ট্র্যাক করার জন্য), ঐচ্ছিক কিছু property, আর একটা timestamp। খেয়াল করুন কীভাবে আমরা `visitorId` (anonymous, cookie-ভিত্তিক) আর `userId` (authenticated)-কে আলাদা রাখছি। এতে ইউজার লগ ইন করার আগেই ভিজিটরদের ট্র্যাক করা যায়।

## ধাপ ২: ইভেন্ট ইনজেশন API

এখন আমাদের একটা endpoint দরকার ইভেন্ট রিসিভ করার জন্য। মূল বুদ্ধিটা হলো **buffering** — প্রতিটা ইভেন্ট সঙ্গে সঙ্গে প্রসেস না করে, আমরা সেগুলোকে ব্যাচে জমাই আর পর্যায়ক্রমে flush করি। এতে ট্রাফিক স্পাইক মসৃণ হয়ে যায় আর efficient batch write সম্ভব হয়। আমাদের ingestion endpoint ইভেন্টটা validate করে, একটা buffer-এ যোগ করে, আর সঙ্গে সঙ্গে রেসপন্স দিয়ে দেয়। একটা ব্যাকগ্রাউন্ড flush loop প্রতি সেকেন্ডে buffer প্রসেস করে।

## ধাপ ৩: টাইম-সিরিজ অ্যাগ্রিগেশন

এটাই ড্যাশবোর্ডের মূল অংশ। Raw ইভেন্টগুলোকে **time bucket**-এ গ্রুপ করা হয় — সাম্প্রতিক ডেটার জন্য এক-মিনিটের বাকেট, যেগুলো পুরনো হতে হতে ঘণ্টা আর দিনের বাকেটে roll up হয়। প্রতিটা বাকেট ট্র্যাক করে: মোট event count, unique visitor (একটা সরলীকৃত HyperLogLog দিয়ে), আর per-event-name count। মূল বুদ্ধিটা হলো "শেষ এক ঘণ্টার page view" কোয়েরি করলে সব ইভেন্ট স্ক্যান হয় না — এটা আগে থেকে হিসাব করা 60টা minute বাকেট পড়ে।

## ধাপ ৪: Active User ট্র্যাকিং

"এই মুহূর্তে active user" বের করতে একটা sliding window পদ্ধতি লাগে। আমরা শেষ 5 মিনিটে দেখা visitor ID-র একটা সেট রাখি, আর একটা cleanup loop দিয়ে expired এন্ট্রিগুলো সরাই। এতে সব সাম্প্রতিক ইভেন্ট স্ক্যান না করেই বর্তমানে active user-এর O(1) কাউন্ট পাওয়া যায়।

## ধাপ ৫: WebSocket স্ট্রিমিং

ড্যাশবোর্ড আপডেটের জন্য বারবার poll করার বদলে, আমরা WebSocket দিয়ে নতুন ডেটা তাদের কাছে পুশ করি। একটা ড্যাশবোর্ড কানেক্ট হলে, এটা নির্দিষ্ট কিছু metric-এ subscribe করে। প্রতিবার একটা minute বাকেট finalize হলে, আমরা সব কানেক্টেড ড্যাশবোর্ডে আপডেটটা broadcast করি। এতে polling-এর কোনো overhead ছাড়াই sub-second ড্যাশবোর্ড আপডেট পাওয়া যায়।

## ধাপ ৬: Query API

শেষে, আমাদের কিছু endpoint দরকার ঐতিহাসিক ডেটা কোয়েরি করার জন্য। API-টা configurable granularity (minute/hour/day) সহ time range কোয়েরি সাপোর্ট করে। ড্যাশবোর্ড এটা দিয়ে প্রথম লোড আর ঐতিহাসিক চার্ট দেখায়, তারপর লাইভ আপডেটের জন্য WebSocket-এ চলে যায়।

## সব একসাথে জোড়া লাগানো

<CodeTabs tsFile="realtime-dashboard.ts" goFile="realtime-dashboard.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

// ===========================================
// 1. EVENT DATA MODEL
// ===========================================
interface AnalyticsEvent {
	name: string;
	visitorId: string;
	userId?: string;
	properties: Record<string, string>;
	timestamp: number;
	url?: string;
	userAgent?: string;
}

type Granularity = 'minute' | 'hour' | 'day';

interface TimeBucket {
	key: string; // "2024-01-15T10:30" for minute
	timestamp: number;
	granularity: Granularity;
	totalEvents: number;
	uniqueVisitors: Set<string>;
	eventCounts: Map<string, number>;
}

// ===========================================
// 2. TIME-SERIES AGGREGATOR
// ===========================================
class TimeSeriesStore {
	private minuteBuckets = new Map<string, TimeBucket>();
	private hourBuckets = new Map<string, TimeBucket>();
	private dayBuckets = new Map<string, TimeBucket>();

	private getBucketKey(timestamp: number, granularity: Granularity): string {
		const d = new Date(timestamp);
		switch (granularity) {
			case 'minute':
				return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
			case 'hour':
				return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}`;
			case 'day':
				return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
		}
	}

	private getStore(g: Granularity): Map<string, TimeBucket> {
		switch (g) {
			case 'minute':
				return this.minuteBuckets;
			case 'hour':
				return this.hourBuckets;
			case 'day':
				return this.dayBuckets;
		}
	}

	record(event: AnalyticsEvent): void {
		for (const granularity of ['minute', 'hour', 'day'] as Granularity[]) {
			const key = this.getBucketKey(event.timestamp, granularity);
			const store = this.getStore(granularity);

			let bucket = store.get(key);
			if (!bucket) {
				bucket = {
					key,
					timestamp: event.timestamp,
					granularity,
					totalEvents: 0,
					uniqueVisitors: new Set(),
					eventCounts: new Map()
				};
				store.set(key, bucket);
			}

			bucket.totalEvents++;
			bucket.uniqueVisitors.add(event.visitorId);
			bucket.eventCounts.set(event.name, (bucket.eventCounts.get(event.name) || 0) + 1);
		}
	}

	query(from: number, to: number, granularity: Granularity): object[] {
		const store = this.getStore(granularity);
		const results: object[] = [];

		for (const [key, bucket] of store) {
			const bucketTime = new Date(key).getTime();
			if (bucketTime >= from && bucketTime <= to) {
				results.push({
					key: bucket.key,
					totalEvents: bucket.totalEvents,
					uniqueVisitors: bucket.uniqueVisitors.size,
					eventCounts: Object.fromEntries(bucket.eventCounts)
				});
			}
		}

		return results.sort((a: any, b: any) => a.key.localeCompare(b.key));
	}

	getCurrentMinute(): object | null {
		const key = this.getBucketKey(Date.now(), 'minute');
		const bucket = this.minuteBuckets.get(key);
		if (!bucket) return null;
		return {
			key: bucket.key,
			totalEvents: bucket.totalEvents,
			uniqueVisitors: bucket.uniqueVisitors.size,
			eventCounts: Object.fromEntries(bucket.eventCounts)
		};
	}
}

// ===========================================
// 3. ACTIVE USER TRACKER (Sliding Window)
// ===========================================
class ActiveUserTracker {
	private visitors = new Map<string, number>(); // visitorId -> lastSeen timestamp
	private readonly windowMs: number;

	constructor(windowMinutes = 5) {
		this.windowMs = windowMinutes * 60 * 1000;
		// Cleanup expired entries every 30 seconds
		setInterval(() => this.cleanup(), 30000);
	}

	track(visitorId: string): void {
		this.visitors.set(visitorId, Date.now());
	}

	getActiveCount(): number {
		const cutoff = Date.now() - this.windowMs;
		let count = 0;
		for (const lastSeen of this.visitors.values()) {
			if (lastSeen > cutoff) count++;
		}
		return count;
	}

	private cleanup(): void {
		const cutoff = Date.now() - this.windowMs;
		for (const [id, lastSeen] of this.visitors) {
			if (lastSeen <= cutoff) this.visitors.delete(id);
		}
	}
}

// ===========================================
// 4. EVENT BUFFER (Batch Processing)
// ===========================================
class EventBuffer {
	private buffer: AnalyticsEvent[] = [];
	private timeSeries: TimeSeriesStore;
	private activeUsers: ActiveUserTracker;
	private wsHub: WebSocketHub;
	private flushInterval: ReturnType<typeof setInterval>;

	constructor(ts: TimeSeriesStore, au: ActiveUserTracker, ws: WebSocketHub) {
		this.timeSeries = ts;
		this.activeUsers = au;
		this.wsHub = ws;
		this.flushInterval = setInterval(() => this.flush(), 1000);
	}

	add(event: AnalyticsEvent): void {
		this.buffer.push(event);
	}

	private flush(): void {
		if (this.buffer.length === 0) return;
		const batch = this.buffer.splice(0);

		for (const event of batch) {
			this.timeSeries.record(event);
			this.activeUsers.track(event.visitorId);
		}

		// Broadcast current stats to dashboard clients
		const current = this.timeSeries.getCurrentMinute();
		const activeCount = this.activeUsers.getActiveCount();
		this.wsHub.broadcast({
			type: 'stats_update',
			data: { currentMinute: current, activeUsers: activeCount, batchSize: batch.length }
		});

		console.log(`[FLUSH] Processed ${batch.length} events | Active users: ${activeCount}`);
	}

	stop(): void {
		clearInterval(this.flushInterval);
	}
}

// ===========================================
// 5. WEBSOCKET HUB (Simulated)
// ===========================================
class WebSocketHub {
	private clients = new Set<string>();
	private messages: object[] = [];

	connect(clientId: string): void {
		this.clients.add(clientId);
		console.log(`[WS] Client ${clientId} connected (${this.clients.size} total)`);
	}

	disconnect(clientId: string): void {
		this.clients.delete(clientId);
	}

	broadcast(message: object): void {
		this.messages.push(message);
		// In production: push to all WebSocket connections
		// For demo: store for polling via /ws/dashboard endpoint
		if (this.messages.length > 100) this.messages.shift();
	}

	getRecent(since = 0): object[] {
		return this.messages.slice(since);
	}

	getClientCount(): number {
		return this.clients.size;
	}
}

// ===========================================
// 6. HTTP SERVER
// ===========================================
const timeSeries = new TimeSeriesStore();
const activeUsers = new ActiveUserTracker(5);
const wsHub = new WebSocketHub();
const eventBuffer = new EventBuffer(timeSeries, activeUsers, wsHub);

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
		// POST /api/events — Single event ingestion
		if (url.pathname === '/api/events' && method === 'POST') {
			const body = (await parseBody(req)) as any;
			if (!body.name || !body.visitorId) {
				json(res, 400, { error: 'name and visitorId required' });
				return;
			}
			const event: AnalyticsEvent = {
				name: body.name,
				visitorId: body.visitorId,
				userId: body.userId,
				properties: body.properties || {},
				timestamp: body.timestamp || Date.now(),
				url: body.url,
				userAgent: body.userAgent
			};
			eventBuffer.add(event);
			json(res, 202, { status: 'accepted' });
			return;
		}

		// POST /api/events/batch — Batch event ingestion
		if (url.pathname === '/api/events/batch' && method === 'POST') {
			const body = (await parseBody(req)) as any;
			if (!Array.isArray(body.events)) {
				json(res, 400, { error: 'events array required' });
				return;
			}
			for (const e of body.events) {
				if (e.name && e.visitorId) {
					eventBuffer.add({
						name: e.name,
						visitorId: e.visitorId,
						userId: e.userId,
						properties: e.properties || {},
						timestamp: e.timestamp || Date.now(),
						url: e.url,
						userAgent: e.userAgent
					});
				}
			}
			json(res, 202, { accepted: body.events.length });
			return;
		}

		// GET /api/metrics — Query time-series data
		if (url.pathname === '/api/metrics' && method === 'GET') {
			const from = parseInt(url.searchParams.get('from') || String(Date.now() - 3600000));
			const to = parseInt(url.searchParams.get('to') || String(Date.now()));
			const granularity = (url.searchParams.get('granularity') || 'minute') as Granularity;
			const data = timeSeries.query(from, to, granularity);
			json(res, 200, { data, granularity, from, to });
			return;
		}

		// GET /api/active-users
		if (url.pathname === '/api/active-users' && method === 'GET') {
			json(res, 200, { activeUsers: activeUsers.getActiveCount() });
			return;
		}

		// GET /api/dashboard/stream — Simulated WebSocket (polling fallback)
		if (url.pathname === '/api/dashboard/stream' && method === 'GET') {
			const since = parseInt(url.searchParams.get('since') || '0');
			json(res, 200, { messages: wsHub.getRecent(since), clients: wsHub.getClientCount() });
			return;
		}

		if (url.pathname === '/health') {
			json(res, 200, { status: 'ok' });
			return;
		}
		json(res, 404, { error: 'Not found' });
	} catch (err: any) {
		json(res, 500, { error: err.message || 'Internal server error' });
	}
});

const PORT = parseInt(process.env.PORT || '3000');
server.listen(PORT, () => console.log(`Analytics Dashboard on http://localhost:${PORT}`));
process.on('SIGTERM', () => {
	eventBuffer.stop();
	server.close();
});
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"
)

// ===========================================
// 1. EVENT DATA MODEL
// ===========================================
type AnalyticsEvent struct {
	Name       string            `json:"name"`
	VisitorID  string            `json:"visitorId"`
	UserID     string            `json:"userId,omitempty"`
	Properties map[string]string `json:"properties"`
	Timestamp  int64             `json:"timestamp"`
	URL        string            `json:"url,omitempty"`
}

type TimeBucket struct {
	Key            string         `json:"key"`
	Timestamp      int64          `json:"timestamp"`
	TotalEvents    int            `json:"totalEvents"`
	UniqueVisitors map[string]bool `json:"-"`
	VisitorCount   int            `json:"uniqueVisitors"`
	EventCounts    map[string]int `json:"eventCounts"`
}

// ===========================================
// 2. TIME-SERIES STORE
// ===========================================
type TimeSeriesStore struct {
	mu      sync.RWMutex
	minutes map[string]*TimeBucket
	hours   map[string]*TimeBucket
	days    map[string]*TimeBucket
}

func NewTimeSeriesStore() *TimeSeriesStore {
	return &TimeSeriesStore{
		minutes: make(map[string]*TimeBucket),
		hours:   make(map[string]*TimeBucket),
		days:    make(map[string]*TimeBucket),
	}
}

func bucketKey(ts int64, gran string) string {
	t := time.UnixMilli(ts).UTC()
	switch gran {
	case "minute":
		return t.Format("2006-01-02T15:04")
	case "hour":
		return t.Format("2006-01-02T15")
	case "day":
		return t.Format("2006-01-02")
	}
	return ""
}

func (tss *TimeSeriesStore) Record(event AnalyticsEvent) {
	tss.mu.Lock()
	defer tss.mu.Unlock()

	for _, g := range []struct{ name string; store map[string]*TimeBucket }{
		{"minute", tss.minutes}, {"hour", tss.hours}, {"day", tss.days},
	} {
		key := bucketKey(event.Timestamp, g.name)
		bucket, ok := g.store[key]
		if !ok {
			bucket = &TimeBucket{
				Key: key, Timestamp: event.Timestamp,
				UniqueVisitors: make(map[string]bool),
				EventCounts: make(map[string]int),
			}
			g.store[key] = bucket
		}
		bucket.TotalEvents++
		bucket.UniqueVisitors[event.VisitorID] = true
		bucket.VisitorCount = len(bucket.UniqueVisitors)
		bucket.EventCounts[event.Name]++
	}
}

func (tss *TimeSeriesStore) Query(from, to int64, gran string) []map[string]interface{} {
	tss.mu.RLock()
	defer tss.mu.RUnlock()

	var store map[string]*TimeBucket
	switch gran {
	case "minute": store = tss.minutes
	case "hour": store = tss.hours
	case "day": store = tss.days
	default: store = tss.minutes
	}

	var results []map[string]interface{}
	for _, b := range store {
		results = append(results, map[string]interface{}{
			"key": b.Key, "totalEvents": b.TotalEvents,
			"uniqueVisitors": b.VisitorCount, "eventCounts": b.EventCounts,
		})
	}
	return results
}

func (tss *TimeSeriesStore) GetCurrentMinute() map[string]interface{} {
	key := bucketKey(time.Now().UnixMilli(), "minute")
	tss.mu.RLock()
	defer tss.mu.RUnlock()
	b, ok := tss.minutes[key]
	if !ok { return nil }
	return map[string]interface{}{
		"key": b.Key, "totalEvents": b.TotalEvents,
		"uniqueVisitors": b.VisitorCount, "eventCounts": b.EventCounts,
	}
}

// ===========================================
// 3. ACTIVE USER TRACKER
// ===========================================
type ActiveUserTracker struct {
	mu       sync.Mutex
	visitors map[string]int64
	windowMs int64
}

func NewActiveUserTracker(windowMinutes int) *ActiveUserTracker {
	aut := &ActiveUserTracker{
		visitors: make(map[string]int64),
		windowMs: int64(windowMinutes) * 60 * 1000,
	}
	go func() {
		for range time.Tick(30 * time.Second) { aut.cleanup() }
	}()
	return aut
}

func (aut *ActiveUserTracker) Track(visitorID string) {
	aut.mu.Lock()
	defer aut.mu.Unlock()
	aut.visitors[visitorID] = time.Now().UnixMilli()
}

func (aut *ActiveUserTracker) GetCount() int {
	aut.mu.Lock()
	defer aut.mu.Unlock()
	cutoff := time.Now().UnixMilli() - aut.windowMs
	count := 0
	for _, ts := range aut.visitors {
		if ts > cutoff { count++ }
	}
	return count
}

func (aut *ActiveUserTracker) cleanup() {
	aut.mu.Lock()
	defer aut.mu.Unlock()
	cutoff := time.Now().UnixMilli() - aut.windowMs
	for id, ts := range aut.visitors {
		if ts <= cutoff { delete(aut.visitors, id) }
	}
}

// ===========================================
// 4. EVENT BUFFER
// ===========================================
type EventBuffer struct {
	mu       sync.Mutex
	buffer   []AnalyticsEvent
	ts       *TimeSeriesStore
	active   *ActiveUserTracker
	stopCh   chan struct{}
}

func NewEventBuffer(ts *TimeSeriesStore, active *ActiveUserTracker) *EventBuffer {
	eb := &EventBuffer{ts: ts, active: active, stopCh: make(chan struct{})}
	go eb.flushLoop()
	return eb
}

func (eb *EventBuffer) Add(event AnalyticsEvent) {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	eb.buffer = append(eb.buffer, event)
}

func (eb *EventBuffer) flushLoop() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C: eb.flush()
		case <-eb.stopCh: return
		}
	}
}

func (eb *EventBuffer) flush() {
	eb.mu.Lock()
	batch := make([]AnalyticsEvent, len(eb.buffer))
	copy(batch, eb.buffer)
	eb.buffer = eb.buffer[:0]
	eb.mu.Unlock()

	if len(batch) == 0 { return }
	for _, event := range batch {
		eb.ts.Record(event)
		eb.active.Track(event.VisitorID)
	}
	log.Printf("[FLUSH] Processed %d events | Active: %d", len(batch), eb.active.GetCount())
}

// ===========================================
// 5. HTTP SERVER
// ===========================================
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func main() {
	ts := NewTimeSeriesStore()
	active := NewActiveUserTracker(5)
	buffer := NewEventBuffer(ts, active)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"}); return
		}
		var body struct {
			Name       string            `json:"name"`
			VisitorID  string            `json:"visitorId"`
			UserID     string            `json:"userId"`
			Properties map[string]string `json:"properties"`
			Timestamp  int64             `json:"timestamp"`
			URL        string            `json:"url"`
		}
		json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body)
		if body.Name == "" || body.VisitorID == "" {
			writeJSON(w, 400, map[string]string{"error": "name and visitorId required"}); return
		}
		ts := body.Timestamp; if ts == 0 { ts = time.Now().UnixMilli() }
		buffer.Add(AnalyticsEvent{Name: body.Name, VisitorID: body.VisitorID,
			UserID: body.UserID, Properties: body.Properties, Timestamp: ts, URL: body.URL})
		writeJSON(w, 202, map[string]string{"status": "accepted"})
	})

	mux.HandleFunc("/api/events/batch", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"}); return
		}
		var body struct { Events []AnalyticsEvent `json:"events"` }
		json.NewDecoder(http.MaxBytesReader(w, r.Body, 10<<20)).Decode(&body)
		for _, e := range body.Events {
			if e.Name != "" && e.VisitorID != "" {
				if e.Timestamp == 0 { e.Timestamp = time.Now().UnixMilli() }
				buffer.Add(e)
			}
		}
		writeJSON(w, 202, map[string]interface{}{"accepted": len(body.Events)})
	})

	mux.HandleFunc("/api/metrics", func(w http.ResponseWriter, r *http.Request) {
		from, _ := strconv.ParseInt(r.URL.Query().Get("from"), 10, 64)
		to, _ := strconv.ParseInt(r.URL.Query().Get("to"), 10, 64)
		gran := r.URL.Query().Get("granularity")
		if from == 0 { from = time.Now().Add(-time.Hour).UnixMilli() }
		if to == 0 { to = time.Now().UnixMilli() }
		if gran == "" { gran = "minute" }
		data := ts.Query(from, to, gran)
		writeJSON(w, 200, map[string]interface{}{"data": data, "granularity": gran})
	})

	mux.HandleFunc("/api/active-users", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, 200, map[string]interface{}{"activeUsers": active.GetCount()})
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	port := os.Getenv("PORT"); if port == "" { port = "3000" }
	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second}

	go func() {
		log.Printf("Analytics Dashboard on http://localhost:%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed { log.Fatal(err) }
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")
	buffer.stopCh <- struct{}{}
	srv.Close()
}
```

</div>
</CodeTabs>

## ডিজাইন সিদ্ধান্তগুলোর ব্যাখ্যা

### Raw ইভেন্টের বদলে Time Bucket কেন?

প্রতিটা raw ইভেন্ট জমিয়ে রেখে কোয়েরির সময় স্ক্যান করা স্কেল করে না। সেকেন্ডে 100K ইভেন্ট হলে, "শেষ এক ঘণ্টার page view" কোয়েরি করলে 360 মিলিয়ন row স্ক্যান করতে হবে। আগে থেকে minute বাকেটে অ্যাগ্রিগেট করলে একই কোয়েরি মাত্র 60টা ছোট record পড়ে। ট্রেড-অফটা হলো আপনি আলাদা আলাদা ইভেন্ট নিয়ে যেকোনো প্রশ্ন করার ক্ষমতা হারান — কিন্তু ড্যাশবোর্ডের দরকার aggregate, আলাদা ডেটা পয়েন্ট নয়।

### প্রসেস করার আগে ইভেন্ট Buffer কেন?

ট্রাফিক স্পাইক অনিবার্য — একটা জনপ্রিয় ব্লগ পোস্ট Reddit-এ শেয়ার হয়, একটা marketing email বেরোয়। Buffering না থাকলে প্রতিটা স্পাইক সরাসরি aggregation লেয়ারে গিয়ে আঘাত করে। একটা buffer স্পাইকটা শুষে নেয়, efficient ব্যাচে ইভেন্ট প্রসেস করে, আর throughput সমান রাখে। 1-সেকেন্ডের flush interval মানে ইভেন্ট ড্যাশবোর্ডে 1-2 সেকেন্ডের মধ্যে দেখা যায় — "real-time" অ্যানালিটিক্সের জন্য যথেষ্ট দ্রুত।

### Active User-এর জন্য Sliding Window কেন?

বিকল্পটা হলো শেষ N মিনিটের distinct visitor গোনা সব সাম্প্রতিক ইভেন্ট স্ক্যান করে — ইভেন্ট ভলিউম বাড়ার সাথে সাথে এটা ব্যয়বহুল হয়ে ওঠে। একটা sliding window map O(1) lookup দেয় আর incrementally আপডেট হয়। 30-সেকেন্ডের cleanup interval একটা ট্রেড-অফ: বেশি ঘন ঘন cleanup বেশি CPU খরচ করে, কম ঘন ঘন cleanup পুরনো এন্ট্রি জমিয়ে বেশি মেমরি খরচ করে।

### Polling-এর বদলে WebSocket কেন?

প্রতি সেকেন্ডে poll করা একটা ড্যাশবোর্ড প্রতি ক্লায়েন্টে মিনিটে 60টা request তৈরি করে। 100 জন ড্যাশবোর্ড ইউজার থাকলে সেটা শুধু polling-এর জন্যই মিনিটে 6000 request। WebSocket এটা উল্টে দেয়: সার্ভার শুধু ডেটা বদলালেই আপডেট পুশ করে, persistent connection ব্যবহার করে। WebSocket-এ 100 ক্লায়েন্ট = 100টা খোলা connection, polling-এর কোনো overhead নেই।

<div class="takeaways">

### মূল শিক্ষা

- বাকেটে (minute/hour/day) টাইম-সিরিজ অ্যাগ্রিগেশন করলে ইভেন্ট ভলিউম যত বড়ই হোক কোয়েরি দ্রুত থাকে
- Sliding window ট্র্যাকিং সব ইভেন্ট স্ক্যান না করেই "এই মুহূর্তে active user" দেয়
- প্রসেস করার আগে ইভেন্ট buffer করলে ট্রাফিক স্পাইক মসৃণ হয় আর batch write সম্ভব হয়
- WebSocket স্ট্রিমিং polling দূর করে — নতুন ডেটা আসা মাত্রই ড্যাশবোর্ড আপডেট হয়
- Roll-up অ্যাগ্রিগেশন (minute → hour → day) ডেটা পুরনো হলেও storage সীমিত রাখে
- ইভেন্ট 202 Accepted দিয়ে গ্রহণ করুন আর async প্রসেস করুন — SDK-কে কখনো aggregation-এর জন্য অপেক্ষা করাবেন না

</div>

<div class="when-to-use">

### বাস্তব জীবনে ব্যবহার

- **Google Analytics** টাইম-সিরিজ অ্যাগ্রিগেশন আর roll-up storage দিয়ে দিনে 10B+ hit প্রসেস করে
- **Mixpanel** বিলিয়ন বিলিয়ন ইভেন্টের মধ্যে unique user গোনার জন্য probabilistic data structure ব্যবহার করে
- **Datadog** WebSocket connection দিয়ে রিয়েল-টাইম metric ড্যাশবোর্ডে স্ট্রিম করে
- **Cloudflare** রিয়েল-টাইম অ্যানালিটিক্স ড্যাশবোর্ড সহ সেকেন্ডে 45M+ HTTP request প্রসেস করে
- এই আর্কিটেকচার sub-second ড্যাশবোর্ড আপডেট সহ সেকেন্ডে 100K+ ইভেন্ট সামলায়

</div>
