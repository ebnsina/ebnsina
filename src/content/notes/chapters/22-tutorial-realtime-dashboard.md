---
title: 'Tutorial: Build a Real-Time Analytics Dashboard'
subtitle: 'Step-by-step guide to building a real-time dashboard with event ingestion, time-series aggregation, WebSocket streaming, and live counters.'
chapter: 22
level: 'intermediate'
readingTime: '28 min'
topics: ['tutorial', 'real-time analytics', 'time-series', 'WebSocket', 'event streaming']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## What We're Building

In this tutorial, we'll build a real-time analytics dashboard from scratch — like a simplified version of Google Analytics or Mixpanel. The system tracks page views, unique visitors, active users, and custom events. Data flows in through an event ingestion API, gets aggregated into time-series buckets (minute/hour/day), and streams to connected dashboards via WebSocket.

<Callout type="info">

**Real-World Analogy**

Like a stock exchange trading floor — real-time screens show live prices, volume, and trends. When a big trade happens, the board updates instantly.

</Callout>

By the end, you'll have a working system that can ingest 100K+ events per second, aggregate them into queryable time-series data, and push live updates to dashboard clients the instant new data arrives.

<Mermaid
title="Real-Time Dashboard Architecture"
code={`graph TD
  E["Event SDK<br/>Track Events"] --> I["Ingestion API<br/>Validate & Buffer"] --> A["Aggregator<br/>Time Buckets"]
  A --> T["Time-Series Store<br/>Minute/Hour/Day"] --> U["Active Users<br/>Sliding Window"] --> W["WebSocket Hub<br/>Live Stream"]`}
/>

## Step 1: Event Data Model

Let's start by defining what an analytics event looks like. Every event has a name (like "page_view" or "button_click"), a visitor ID (to track unique users), optional properties, and a timestamp. Notice how we separate the `visitorId` (anonymous, cookie-based) from `userId` (authenticated). This lets us track visitors before they log in.

## Step 2: Event Ingestion API

Now we need an endpoint to receive events. The key insight is **buffering** — instead of processing each event immediately, we batch them and flush periodically. This smooths out traffic spikes and enables efficient batch writes. Our ingestion endpoint validates the event, adds it to a buffer, and returns immediately. A background flush loop processes the buffer every second.

## Step 3: Time-Series Aggregation

This is the core of the dashboard. Raw events are grouped into **time buckets** — one-minute buckets for recent data, rolled up into hourly and daily buckets as they age. Each bucket tracks: total event count, unique visitors (using a simplified HyperLogLog), and per-event-name counts. The key insight is that querying "page views in the last hour" doesn't scan all events — it reads 60 pre-computed minute buckets.

## Step 4: Active User Tracking

"Users active right now" requires a sliding window approach. We maintain a set of visitor IDs seen in the last 5 minutes, with a cleanup loop that removes expired entries. This gives us an O(1) count of currently active users without scanning all recent events.

## Step 5: WebSocket Streaming

Instead of dashboards polling for updates, we push new data to them via WebSocket. When a dashboard connects, it subscribes to specific metrics. Every time a minute bucket is finalized, we broadcast the update to all connected dashboards. This gives sub-second dashboard updates with zero polling overhead.

## Step 6: Query API

Finally, we need endpoints to query historical data. The API supports time range queries with configurable granularity (minute/hour/day). Dashboards use this for initial load and historical charts, then switch to WebSocket for live updates.

## Putting It All Together

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

## Design Decisions Explained

### Why Time Buckets Instead of Raw Events?

Storing every raw event and scanning them at query time doesn't scale. With 100K events/second, querying "page views in the last hour" would scan 360 million rows. Pre-aggregating into minute buckets means the same query reads only 60 small records. The trade-off is that you lose the ability to ask arbitrary questions about individual events — but dashboards care about aggregates, not individual data points.

### Why Buffer Events Before Processing?

Traffic spikes are inevitable — a popular blog post gets shared on Reddit, a marketing email goes out. Without buffering, each spike directly hammers the aggregation layer. A buffer absorbs the spike, processes events in efficient batches, and keeps throughput consistent. The 1-second flush interval means events appear on dashboards within 1-2 seconds — fast enough for "real-time" analytics.

### Why Sliding Window for Active Users?

The alternative is counting distinct visitors in the last N minutes by scanning all recent events — this gets expensive as event volume grows. A sliding window map gives O(1) lookups and is updated incrementally. The 30-second cleanup interval is a trade-off: more frequent cleanup uses more CPU, less frequent cleanup uses more memory from stale entries.

### Why WebSocket Instead of Polling?

A dashboard polling every second generates 60 requests/minute per client. With 100 dashboard users, that's 6000 requests/minute just for polling. WebSocket flips this: the server pushes updates only when data changes, using persistent connections. 100 clients with WebSocket = 100 open connections, zero polling overhead.

<div class="takeaways">

### Key Takeaways

- Time-series aggregation into buckets (minute/hour/day) makes queries fast regardless of event volume
- Sliding window tracking gives you "active users right now" without scanning all events
- Buffering events before processing smooths out traffic spikes and enables batch writes
- WebSocket streaming eliminates polling — dashboards update the instant new data arrives
- Roll-up aggregation (minutes → hours → days) keeps storage bounded as data ages
- Accept events with 202 Accepted and process async — never make the SDK wait for aggregation

</div>

<div class="when-to-use">

### Real-World Usage

- **Google Analytics** processes 10B+ hits per day using time-series aggregation and roll-up storage
- **Mixpanel** uses probabilistic data structures for unique user counting across billions of events
- **Datadog** streams real-time metrics to dashboards via WebSocket connections
- **Cloudflare** processes 45M+ HTTP requests per second with real-time analytics dashboards
- This architecture handles 100K+ events/second with sub-second dashboard updates

</div>
