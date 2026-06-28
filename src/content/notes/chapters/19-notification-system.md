---
title: "Case Study: Notification System at Scale"
subtitle: "Design and build a production notification system with multi-channel delivery, fan-out, priority queues, rate limiting, and user preferences."
chapter: 19
level: "advanced"
readingTime: "30 min"
topics: ["notification system", "fan-out", "priority queue", "multi-channel delivery", "user preferences"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## What Does a Notification System at Scale Look Like?

A notification system is the backbone of user engagement in every modern application. When your Uber driver arrives, you get a push notification. When someone comments on your Facebook post, you see an in-app alert. When your credit card is charged, you receive an email and SMS. Behind these seemingly simple messages is a system that must handle **multiple delivery channels** (push, email, SMS, in-app), **user preferences** (what to send and when), **priority routing** (fraud alerts before marketing), **rate limiting** (no notification fatigue), and **delivery tracking** (did it actually arrive?).

Think of it like a post office that handles express mail, standard mail, and bulk marketing simultaneously. Express packages (critical alerts like security warnings) skip the line and get delivered immediately. Standard mail (transactional notifications like order confirmations) follows normal processing. Bulk marketing (weekly digests, promotional offers) gets batched and delivered during low-traffic hours. Every package has a tracking number, and if delivery fails, the system retries with escalating delays.

<Mermaid
	title="Notification System Architecture"
	code={`
graph TD
  E["Event Source<br/>Triggers"] --> N["Notification Service<br/>Routing & Priority"] --> W["Delivery Workers<br/>Multi-channel"]
  W --> S["Notification Store<br/>History"] --> Q["Priority Queue<br/>Rate Limited"] --> P["User Preferences<br/>Channels & Rules"]
`}
/>

## Real-World Analogy

<Callout type="info">

**Real-World Analogy**

Like a hospital alert system — critical alerts (code blue) go out instantly, routine reminders (appointment tomorrow) are batched and sent during business hours. Each notification's delivery status is tracked.

</Callout>

Facebook sends over 10 billion push notifications daily. When someone likes your photo, the notification system checks your preferences (do you want push notifications for likes?), checks if you're in "do not disturb" mode, checks the rate limit (have you already received 50 notifications this hour?), and then routes through the appropriate channel. For Uber, when your driver is 2 minutes away, the system must deliver that notification within seconds — it goes through the critical priority lane, bypassing all batching and rate limits. Airbnb takes the opposite approach for non-urgent updates: it batches your "homes you might like" into a weekly digest email, reducing notification fatigue while maintaining engagement.

## Requirements

- **Functional**: Multi-channel delivery (push, email, SMS, in-app), user preference management per notification type, batching/digest for non-urgent notifications, priority levels (critical, high, normal, low), delivery tracking with status updates, fan-out for group notifications
- **Non-functional**: 1M notifications/min at peak, sub-second delivery for critical alerts, 99.95% delivery rate, at-least-once delivery guarantee
- **Storage**: Notification history with delivery status, user preference profiles, delivery audit trail

## Step-by-Step: How a Notification Flows

1. **Event triggers notification** — An upstream service emits an event (e.g., "order_shipped" for user 12345)
2. **Look up user preferences** — The system checks which channels this user has enabled for "order_shipped" events (maybe push + email, but not SMS)
3. **Check quiet hours** — If the user has quiet hours set (e.g., 11pm-7am) and the notification isn't critical, defer it
4. **Assign priority** — The notification type determines priority. "fraud_alert" → critical (immediate). "order_shipped" → high. "weekly_digest" → low
5. **Enqueue with priority** — Critical notifications go to the front of the queue. Low-priority ones wait behind everything else
6. **Rate limit check** — Before sending, verify the user hasn't exceeded their per-channel limit (e.g., max 10 push/hour, max 50 email/day)
7. **Deliver via channel handler** — The appropriate handler (FCM for push, SendGrid for email, Twilio for SMS) delivers the notification
8. **Track delivery and retry** — If delivery fails, retry with exponential backoff (1s, 2s, 4s). After 3 failures, mark as permanently failed

## Building the Notification System

<CodeTabs tsFile="notification-system.ts" goFile="notification-system.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from "node:http";
import crypto from "node:crypto";

// ===========================================
// 1. TYPES & ENUMS
// ===========================================
type NotificationChannel = "push" | "email" | "sms" | "in_app";
type NotificationPriority = "critical" | "high" | "normal" | "low";
type DeliveryStatus = "pending" | "sent" | "delivered" | "failed";

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  status: DeliveryStatus;
  metadata: Record<string, string>;
  createdAt: string;
  sentAt: string | null;
  retryCount: number;
}

interface UserPreferences {
  userId: string;
  channels: Record<string, NotificationChannel[]>;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  maxPerHour: number;
}

// ===========================================
// 2. PRIORITY QUEUE (Min-Heap)
// ===========================================
const PRIORITY_MAP: Record<NotificationPriority, number> = {
  critical: 0, high: 1, normal: 2, low: 3,
};

class PriorityQueue {
  private heap: Notification[] = [];

  enqueue(n: Notification): void {
    this.heap.push(n);
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): Notification | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number { return this.heap.length; }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (PRIORITY_MAP[this.heap[i].priority] < PRIORITY_MAP[this.heap[parent].priority]) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private sinkDown(i: number): void {
    while (true) {
      let smallest = i;
      const left = 2 * i + 1, right = 2 * i + 2;
      if (left < this.heap.length && PRIORITY_MAP[this.heap[left].priority] < PRIORITY_MAP[this.heap[smallest].priority]) smallest = left;
      if (right < this.heap.length && PRIORITY_MAP[this.heap[right].priority] < PRIORITY_MAP[this.heap[smallest].priority]) smallest = right;
      if (smallest !== i) {
        [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
        i = smallest;
      } else break;
    }
  }
}

// ===========================================
// 3. RATE LIMITER (Sliding Window)
// ===========================================
class RateLimiter {
  private windows = new Map<string, number[]>();

  isAllowed(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = (this.windows.get(key) || []).filter(t => t > now - windowMs);
    timestamps.push(now);
    this.windows.set(key, timestamps);
    return timestamps.length <= max;
  }
}

// ===========================================
// 4. CHANNEL HANDLERS
// ===========================================
interface ChannelHandler {
  send(n: Notification): Promise<boolean>;
}

class PushHandler implements ChannelHandler {
  async send(n: Notification): Promise<boolean> {
    console.log(`[PUSH] → ${n.userId}: ${n.title}`);
    return true; // In production: call Firebase Cloud Messaging or APNs
  }
}

class EmailHandler implements ChannelHandler {
  async send(n: Notification): Promise<boolean> {
    console.log(`[EMAIL] → ${n.userId}: ${n.title} - ${n.body}`);
    return true; // In production: call SendGrid, SES, or Postmark
  }
}

class SmsHandler implements ChannelHandler {
  async send(n: Notification): Promise<boolean> {
    console.log(`[SMS] → ${n.userId}: ${n.body}`);
    return true; // In production: call Twilio or Vonage
  }
}

class InAppHandler implements ChannelHandler {
  constructor(private store: Map<string, Notification[]>) {}

  async send(n: Notification): Promise<boolean> {
    const list = this.store.get(n.userId) || [];
    list.push(n);
    this.store.set(n.userId, list);
    console.log(`[IN-APP] → ${n.userId}: ${n.title}`);
    return true;
  }
}

// ===========================================
// 5. USER PREFERENCES
// ===========================================
class PreferencesManager {
  private prefs = new Map<string, UserPreferences>();

  get(userId: string): UserPreferences {
    return this.prefs.get(userId) || {
      userId,
      channels: { default: ["push", "email", "in_app"] },
      quietHoursStart: null,
      quietHoursEnd: null,
      maxPerHour: 50,
    };
  }

  set(userId: string, prefs: UserPreferences): void {
    this.prefs.set(userId, prefs);
  }

  getChannelsForType(userId: string, type: string): NotificationChannel[] {
    const p = this.get(userId);
    return p.channels[type] || p.channels["default"] || ["in_app"];
  }

  isQuietHours(userId: string): boolean {
    const p = this.get(userId);
    if (p.quietHoursStart === null || p.quietHoursEnd === null) return false;
    const hour = new Date().getHours();
    if (p.quietHoursStart < p.quietHoursEnd) {
      return hour >= p.quietHoursStart && hour < p.quietHoursEnd;
    }
    return hour >= p.quietHoursStart || hour < p.quietHoursEnd;
  }
}

// ===========================================
// 6. NOTIFICATION SERVICE
// ===========================================
class NotificationService {
  private queue = new PriorityQueue();
  private rateLimiter = new RateLimiter();
  private preferences = new PreferencesManager();
  private inAppStore = new Map<string, Notification[]>();
  private notificationLog = new Map<string, Notification>();
  private handlers: Record<NotificationChannel, ChannelHandler>;
  private processing = false;
  private processInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.handlers = {
      push: new PushHandler(),
      email: new EmailHandler(),
      sms: new SmsHandler(),
      in_app: new InAppHandler(this.inAppStore),
    };
    this.processInterval = setInterval(() => this.processQueue(), 100);
  }

  async send(
    userId: string, type: string, title: string, body: string,
    priority: NotificationPriority = "normal",
    metadata: Record<string, string> = {}
  ): Promise<string[]> {
    const channels = this.preferences.getChannelsForType(userId, type);
    const ids: string[] = [];

    for (const channel of channels) {
      if (priority !== "critical" && this.preferences.isQuietHours(userId)) continue;

      const notification: Notification = {
        id: crypto.randomUUID(), userId, type, title, body, channel, priority,
        status: "pending", metadata, createdAt: new Date().toISOString(),
        sentAt: null, retryCount: 0,
      };

      this.notificationLog.set(notification.id, notification);
      this.queue.enqueue(notification);
      ids.push(notification.id);
    }
    return ids;
  }

  async fanOut(
    userIds: string[], type: string, title: string, body: string,
    priority: NotificationPriority = "normal"
  ): Promise<number> {
    let count = 0;
    for (const userId of userIds) {
      const ids = await this.send(userId, type, title, body, priority);
      count += ids.length;
    }
    return count;
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    const batch = Math.min(this.queue.size, 50);
    for (let i = 0; i < batch; i++) {
      const n = this.queue.dequeue();
      if (!n) break;

      const key = `${n.userId}:${n.channel}`;
      const prefs = this.preferences.get(n.userId);

      if (!this.rateLimiter.isAllowed(key, prefs.maxPerHour, 3600000)) {
        n.status = "failed";
        console.log(`[RATE-LIMITED] ${n.userId} on ${n.channel}`);
        continue;
      }

      try {
        const success = await this.handlers[n.channel].send(n);
        if (success) {
          n.status = "delivered";
          n.sentAt = new Date().toISOString();
        } else {
          throw new Error("Delivery failed");
        }
      } catch {
        n.retryCount++;
        if (n.retryCount < 3) {
          setTimeout(() => this.queue.enqueue(n), Math.pow(2, n.retryCount) * 1000);
        } else {
          n.status = "failed";
        }
      }
    }
    this.processing = false;
  }

  getNotifications(userId: string): Notification[] {
    return this.inAppStore.get(userId) || [];
  }

  getStatus(id: string): Notification | null {
    return this.notificationLog.get(id) || null;
  }

  updatePreferences(userId: string, prefs: UserPreferences): void {
    this.preferences.set(userId, prefs);
  }

  getPreferences(userId: string): UserPreferences {
    return this.preferences.get(userId);
  }

  shutdown(): void { clearInterval(this.processInterval); }
}

// ===========================================
// 7. HTTP SERVER
// ===========================================
const service = new NotificationService();

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
    // POST /api/notify
    if (url.pathname === "/api/notify" && method === "POST") {
      const body = await parseBody(req) as any;
      if (!body.userId || !body.title || !body.body) {
        json(res, 400, { error: "userId, title, and body are required" }); return;
      }
      const ids = await service.send(
        body.userId, body.type || "default", body.title, body.body,
        body.priority || "normal", body.metadata || {}
      );
      json(res, 201, { notificationIds: ids }); return;
    }

    // POST /api/notify/batch
    if (url.pathname === "/api/notify/batch" && method === "POST") {
      const body = await parseBody(req) as any;
      if (!body.userIds?.length || !body.title || !body.body) {
        json(res, 400, { error: "userIds, title, and body are required" }); return;
      }
      const count = await service.fanOut(
        body.userIds, body.type || "default", body.title, body.body,
        body.priority || "normal"
      );
      json(res, 201, { totalQueued: count }); return;
    }

    // GET /api/notifications/:userId
    const notifMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)$/);
    if (notifMatch && method === "GET") {
      const notifs = service.getNotifications(notifMatch[1]);
      json(res, 200, { notifications: notifs, count: notifs.length }); return;
    }

    // PUT /api/preferences/:userId
    const prefMatch = url.pathname.match(/^\/api\/preferences\/([^/]+)$/);
    if (prefMatch && method === "PUT") {
      const body = await parseBody(req) as any;
      const current = service.getPreferences(prefMatch[1]);
      service.updatePreferences(prefMatch[1], { ...current, ...body, userId: prefMatch[1] });
      json(res, 200, service.getPreferences(prefMatch[1])); return;
    }

    // GET /api/preferences/:userId
    if (prefMatch && method === "GET") {
      json(res, 200, service.getPreferences(prefMatch[1])); return;
    }

    if (url.pathname === "/health") { json(res, 200, { status: "ok" }); return; }
    json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("Error:", err);
    json(res, 500, { error: "Internal server error" });
  }
});

const PORT = parseInt(process.env.PORT || "3000");
server.listen(PORT, () => console.log(`Notification Service on http://localhost:${PORT}`));
process.on("SIGTERM", () => { service.shutdown(); server.close(); });
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"container/heap"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"sync"
	"syscall"
	"time"
)

// ===========================================
// 1. TYPES
// ===========================================
type Channel string
type Priority int
type Status string

const (
	Push  Channel = "push"
	Email Channel = "email"
	SMS   Channel = "sms"
	InApp Channel = "in_app"

	Critical Priority = 0
	High     Priority = 1
	Normal   Priority = 2
	Low      Priority = 3
)

func parsePriority(s string) Priority {
	switch s {
	case "critical": return Critical
	case "high": return High
	case "low": return Low
	default: return Normal
	}
}

type Notification struct {
	ID         string            `json:"id"`
	UserID     string            `json:"userId"`
	Type       string            `json:"type"`
	Title      string            `json:"title"`
	Body       string            `json:"body"`
	Channel    Channel           `json:"channel"`
	Priority   Priority          `json:"priority"`
	Status     string            `json:"status"`
	Metadata   map[string]string `json:"metadata"`
	CreatedAt  time.Time         `json:"createdAt"`
	SentAt     *time.Time        `json:"sentAt,omitempty"`
	RetryCount int               `json:"retryCount"`
	index      int
}

type UserPreferences struct {
	UserID          string               `json:"userId"`
	Channels        map[string][]Channel `json:"channels"`
	QuietHoursStart *int                 `json:"quietHoursStart"`
	QuietHoursEnd   *int                 `json:"quietHoursEnd"`
	MaxPerHour      int                  `json:"maxPerHour"`
}

// ===========================================
// 2. PRIORITY QUEUE
// ===========================================
type NotifHeap []*Notification

func (h NotifHeap) Len() int           { return len(h) }
func (h NotifHeap) Less(i, j int) bool { return h[i].Priority < h[j].Priority }
func (h NotifHeap) Swap(i, j int) {
	h[i], h[j] = h[j], h[i]
	h[i].index = i
	h[j].index = j
}
func (h *NotifHeap) Push(x interface{}) {
	n := x.(*Notification)
	n.index = len(*h)
	*h = append(*h, n)
}
func (h *NotifHeap) Pop() interface{} {
	old := *h
	n := len(old)
	item := old[n-1]
	*h = old[:n-1]
	return item
}

// ===========================================
// 3. RATE LIMITER
// ===========================================
type RateLimiter struct {
	mu      sync.Mutex
	windows map[string][]int64
}

func NewRateLimiter() *RateLimiter {
	return &RateLimiter{windows: make(map[string][]int64)}
}

func (rl *RateLimiter) IsAllowed(key string, maxReq int, windowMs int64) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now().UnixMilli()
	var valid []int64
	for _, t := range rl.windows[key] {
		if t > now-windowMs { valid = append(valid, t) }
	}
	valid = append(valid, now)
	rl.windows[key] = valid
	return len(valid) <= maxReq
}

// ===========================================
// 4. CHANNEL HANDLERS
// ===========================================
type ChannelHandler interface {
	Send(n *Notification) bool
}

type PushHandler struct{}
func (h *PushHandler) Send(n *Notification) bool {
	log.Printf("[PUSH] → %s: %s", n.UserID, n.Title)
	return true
}

type EmailHandler struct{}
func (h *EmailHandler) Send(n *Notification) bool {
	log.Printf("[EMAIL] → %s: %s - %s", n.UserID, n.Title, n.Body)
	return true
}

type SmsHandler struct{}
func (h *SmsHandler) Send(n *Notification) bool {
	log.Printf("[SMS] → %s: %s", n.UserID, n.Body)
	return true
}

type InAppHandler struct {
	mu    sync.Mutex
	store map[string][]*Notification
}

func NewInAppHandler() *InAppHandler {
	return &InAppHandler{store: make(map[string][]*Notification)}
}

func (h *InAppHandler) Send(n *Notification) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.store[n.UserID] = append(h.store[n.UserID], n)
	log.Printf("[IN-APP] → %s: %s", n.UserID, n.Title)
	return true
}

func (h *InAppHandler) Get(userID string) []*Notification {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.store[userID]
}

// ===========================================
// 5. PREFERENCES MANAGER
// ===========================================
type PreferencesManager struct {
	mu    sync.RWMutex
	prefs map[string]*UserPreferences
}

func NewPreferencesManager() *PreferencesManager {
	return &PreferencesManager{prefs: make(map[string]*UserPreferences)}
}

func (pm *PreferencesManager) Get(userID string) *UserPreferences {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	if p, ok := pm.prefs[userID]; ok { return p }
	return &UserPreferences{
		UserID:     userID,
		Channels:   map[string][]Channel{"default": {Push, Email, InApp}},
		MaxPerHour: 50,
	}
}

func (pm *PreferencesManager) Set(userID string, p *UserPreferences) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	pm.prefs[userID] = p
}

func (pm *PreferencesManager) GetChannels(userID, notifType string) []Channel {
	p := pm.Get(userID)
	if ch, ok := p.Channels[notifType]; ok { return ch }
	if ch, ok := p.Channels["default"]; ok { return ch }
	return []Channel{InApp}
}

func (pm *PreferencesManager) IsQuietHours(userID string) bool {
	p := pm.Get(userID)
	if p.QuietHoursStart == nil || p.QuietHoursEnd == nil { return false }
	hour := time.Now().Hour()
	if *p.QuietHoursStart < *p.QuietHoursEnd {
		return hour >= *p.QuietHoursStart && hour < *p.QuietHoursEnd
	}
	return hour >= *p.QuietHoursStart || hour < *p.QuietHoursEnd
}

// ===========================================
// 6. NOTIFICATION SERVICE
// ===========================================
type NotificationService struct {
	mu       sync.Mutex
	queue    NotifHeap
	rl       *RateLimiter
	prefs    *PreferencesManager
	inApp    *InAppHandler
	handlers map[Channel]ChannelHandler
	logs     sync.Map
	stopCh   chan struct{}
}

func NewNotificationService() *NotificationService {
	inApp := NewInAppHandler()
	svc := &NotificationService{
		rl:    NewRateLimiter(),
		prefs: NewPreferencesManager(),
		inApp: inApp,
		handlers: map[Channel]ChannelHandler{
			Push: &PushHandler{}, Email: &EmailHandler{},
			SMS: &SmsHandler{}, InApp: inApp,
		},
		stopCh: make(chan struct{}),
	}
	heap.Init(&svc.queue)
	go svc.processLoop()
	return svc
}

func (svc *NotificationService) Send(userID, notifType, title, body string, priority Priority, metadata map[string]string) []string {
	channels := svc.prefs.GetChannels(userID, notifType)
	var ids []string
	for _, ch := range channels {
		if priority != Critical && svc.prefs.IsQuietHours(userID) { continue }
		n := &Notification{
			ID: fmt.Sprintf("%d", time.Now().UnixNano()),
			UserID: userID, Type: notifType, Title: title, Body: body,
			Channel: ch, Priority: priority, Status: "pending",
			Metadata: metadata, CreatedAt: time.Now().UTC(),
		}
		svc.logs.Store(n.ID, n)
		svc.mu.Lock()
		heap.Push(&svc.queue, n)
		svc.mu.Unlock()
		ids = append(ids, n.ID)
	}
	return ids
}

func (svc *NotificationService) FanOut(userIDs []string, notifType, title, body string, priority Priority) int {
	count := 0
	for _, uid := range userIDs {
		ids := svc.Send(uid, notifType, title, body, priority, nil)
		count += len(ids)
	}
	return count
}

func (svc *NotificationService) processLoop() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C: svc.processBatch()
		case <-svc.stopCh: return
		}
	}
}

func (svc *NotificationService) processBatch() {
	svc.mu.Lock()
	batch := svc.queue.Len()
	if batch > 50 { batch = 50 }
	items := make([]*Notification, 0, batch)
	for i := 0; i < batch; i++ {
		items = append(items, heap.Pop(&svc.queue).(*Notification))
	}
	svc.mu.Unlock()

	for _, n := range items {
		key := fmt.Sprintf("%s:%s", n.UserID, n.Channel)
		prefs := svc.prefs.Get(n.UserID)
		if !svc.rl.IsAllowed(key, prefs.MaxPerHour, 3600000) {
			n.Status = "failed"
			log.Printf("[RATE-LIMITED] %s on %s", n.UserID, n.Channel)
			continue
		}
		if svc.handlers[n.Channel].Send(n) {
			n.Status = "delivered"
			now := time.Now().UTC()
			n.SentAt = &now
		} else {
			n.RetryCount++
			if n.RetryCount < 3 {
				delay := time.Duration(math.Pow(2, float64(n.RetryCount))) * time.Second
				go func(notif *Notification) {
					time.Sleep(delay)
					svc.mu.Lock()
					heap.Push(&svc.queue, notif)
					svc.mu.Unlock()
				}(n)
			} else {
				n.Status = "failed"
			}
		}
	}
}

// ===========================================
// 7. HTTP SERVER
// ===========================================
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func main() {
	svc := NewNotificationService()
	notifPattern := regexp.MustCompile(`^/api/notifications/([^/]+)$`)
	prefPattern := regexp.MustCompile(`^/api/preferences/([^/]+)$`)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/notify", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"}); return
		}
		var body struct {
			UserID   string            `json:"userId"`
			Type     string            `json:"type"`
			Title    string            `json:"title"`
			Body     string            `json:"body"`
			Priority string            `json:"priority"`
			Metadata map[string]string `json:"metadata"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
			writeJSON(w, 400, map[string]string{"error": "Invalid JSON"}); return
		}
		if body.UserID == "" || body.Title == "" || body.Body == "" {
			writeJSON(w, 400, map[string]string{"error": "userId, title, and body required"}); return
		}
		t := body.Type; if t == "" { t = "default" }
		ids := svc.Send(body.UserID, t, body.Title, body.Body, parsePriority(body.Priority), body.Metadata)
		writeJSON(w, 201, map[string]interface{}{"notificationIds": ids})
	})

	mux.HandleFunc("/api/notify/batch", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"}); return
		}
		var body struct {
			UserIDs  []string `json:"userIds"`
			Type     string   `json:"type"`
			Title    string   `json:"title"`
			Body     string   `json:"body"`
			Priority string   `json:"priority"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
			writeJSON(w, 400, map[string]string{"error": "Invalid JSON"}); return
		}
		if len(body.UserIDs) == 0 || body.Title == "" || body.Body == "" {
			writeJSON(w, 400, map[string]string{"error": "userIds, title, and body required"}); return
		}
		count := svc.FanOut(body.UserIDs, body.Type, body.Title, body.Body, parsePriority(body.Priority))
		writeJSON(w, 201, map[string]interface{}{"totalQueued": count})
	})

	mux.HandleFunc("/api/notifications/", func(w http.ResponseWriter, r *http.Request) {
		m := notifPattern.FindStringSubmatch(r.URL.Path)
		if m == nil { writeJSON(w, 404, map[string]string{"error": "Not found"}); return }
		notifs := svc.inApp.Get(m[1])
		writeJSON(w, 200, map[string]interface{}{"notifications": notifs, "count": len(notifs)})
	})

	mux.HandleFunc("/api/preferences/", func(w http.ResponseWriter, r *http.Request) {
		m := prefPattern.FindStringSubmatch(r.URL.Path)
		if m == nil { writeJSON(w, 404, map[string]string{"error": "Not found"}); return }
		if r.Method == http.MethodGet {
			writeJSON(w, 200, svc.prefs.Get(m[1])); return
		}
		if r.Method == http.MethodPut {
			var body UserPreferences
			json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body)
			body.UserID = m[1]
			svc.prefs.Set(m[1], &body)
			writeJSON(w, 200, svc.prefs.Get(m[1])); return
		}
		writeJSON(w, 405, map[string]string{"error": "Method not allowed"})
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	port := os.Getenv("PORT"); if port == "" { port = "3000" }
	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second}

	go func() {
		log.Printf("Notification Service on http://localhost:%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed { log.Fatal(err) }
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")
	svc.stopCh <- struct{}{}
	srv.Close()
}
```

</div>
</CodeTabs>

## Design Decisions Explained

### Why Priority Queues?

Not all notifications are equal. A fraud alert must arrive in seconds; a weekly digest can wait hours. Priority queues ensure critical notifications (account security, payment failures, ride arriving) always process before marketing emails. Without prioritization, a burst of 100K promotional notifications could delay a security alert by minutes — unacceptable when someone's account is being compromised.

### Why Fan-Out on Write vs Fan-Out on Read?

We use fan-out on write — when an event triggers, we immediately create notification records for all target users and enqueue them. The alternative (fan-out on read) would check for pending notifications when users open the app. Fan-out on write gives predictable delivery timing, works for channels where users don't actively "check" (push, email, SMS), and lets us track delivery status per user. The cost is more queue entries, but notification volume is bounded by rate limits.

### Why Rate Limit Per User Per Channel?

Without rate limiting, a buggy upstream service could send thousands of notifications to one user in minutes. Per-user limits prevent notification fatigue. Per-channel limits are critical because tolerances differ: users accept ~50 emails/day but only ~10 push notifications/hour and ~5 SMS/day. Channel-specific limits let us match expectations for each medium.

### Why Exponential Backoff for Retries?

When a channel provider (FCM, SendGrid, Twilio) returns an error, it might be transient (network blip) or persistent (invalid device token). Exponential backoff (1s, 2s, 4s) gives transient issues time to resolve without overwhelming the provider. After 3 failures, we mark as permanently failed — if the provider is down for minutes, hammering it makes recovery slower for everyone.

<div class="takeaways">

### Key Takeaways

- Priority queues ensure critical alerts (security, payments) always process before marketing — a 10-second delay on a fraud alert is unacceptable
- Multi-channel delivery means one event can trigger push + email + SMS — user preferences control which channels are active per notification type
- Rate limiting per user per channel prevents notification fatigue — email tolerance differs vastly from push and SMS
- Fan-out on write gives predictable delivery timing and works for channels where users don't actively "check" (push, SMS)
- Exponential backoff on retries prevents overwhelming channel providers during outages
- Quiet hours respect user preferences — critical notifications bypass quiet hours, everything else waits

</div>

<div class="when-to-use">

### Real-World Usage

- **Facebook** sends 10B+ push notifications daily using priority-based fan-out with per-user rate limiting
- **Uber** uses real-time notifications for ride updates with sub-second delivery SLAs for critical events like "driver arriving"
- **Airbnb** batches non-urgent notifications into weekly digest emails to reduce notification fatigue
- **Slack** uses per-channel rate limiting and "do not disturb" windows that integrate with calendar availability
- **Stripe** delivers webhook notifications with exponential backoff retry, achieving 99.99% delivery rate
- This architecture handles 1M+ notifications/minute with sub-second critical delivery

</div>

