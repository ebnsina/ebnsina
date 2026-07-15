---
title: 'Case Study: স্কেলে Notification System'
subtitle: 'multi-channel delivery, fan-out, priority queue, rate limiting, এবং user preferences সহ একটি production notification system ডিজাইন ও তৈরি করা।'
chapter: 19
level: 'advanced'
readingTime: '30 মিনিট'
topics:
  ['notification system', 'fan-out', 'priority queue', 'multi-channel delivery', 'user preferences']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

গ্রামের একটা ঘোষণা অফিস — আগামীকাল কমিউনিটির বার্ষিক অনুষ্ঠান, আর এই একটা খবর গ্রামের সবার কাছে পৌঁছাতে হবে। কিন্তু সবাই একইভাবে খবর পেতে চায় না। ইবনে সিনা চাচা বলে রেখেছেন তাকে মসজিদের মাইকে ডাক দিলেই হবে, আল-খোয়ারিজমি ভাই চান তার মোবাইলে একটা SMS আসুক, আর ফাতিমা আল-ফিহরি খালা বধির বলে তার দরজায় গিয়ে কেউ কড়া নাড়ুক। তাই অফিস একটাই খবর, কিন্তু প্রতিজনের পছন্দমতো আলাদা আলাদা মাধ্যমে পাঠায় — কাউকে মাইকে, কাউকে SMS-এ, কারো দরজায় কড়া নেড়ে।

অফিসের একটা খাতাও আছে। সেখানে লেখা কে কোন মাধ্যমে খবর চায়, আর কার বাড়িতে "বিরক্ত কোরো না" লেখা — যেমন হালিমা খালা সদ্য অসুস্থ, তাকে এবার বাদ দিতে হবে। অফিসের ছেলেরা খাতা মিলিয়ে কাজ করে, তাই একই লোককে দুবার খবর দিয়ে বসে না। আর আল-খোয়ারিজমি ভাইয়ের ফোন যখন বন্ধ পাওয়া গেল, অফিস হাল ছাড়ে না — একটু পরে আবার চেষ্টা করে, ফোন খোলা পেলে তবেই SMS পৌঁছায়।

এই ঘোষণা অফিসটাই আসলে একটা **notification system**। একটা খবর সবার কাছে ভিন্ন ভিন্ন মাধ্যমে ছড়িয়ে দেওয়াটাই multi-channel fan-out, আর মাইক-SMS-দরজায় কড়া নাড়াগুলো হলো push, SMS, email-এর মতো আলাদা **channel**। "বিরক্ত কোরো না" খাতাটাই user **preferences** আর opt-out, একই লোককে দুবার খবর না দেওয়াটা **dedup**, আর ফোন বন্ধ পেলে পরে আবার চেষ্টা করাটাই **retry**। বাস্তবে Facebook, Uber-এর মতো সিস্টেম ঠিক এভাবেই কোটি কোটি মানুষকে যার যার পছন্দের channel-এ খবর পৌঁছায়।

## স্কেলে একটা Notification System দেখতে কেমন?

প্রতিটি আধুনিক অ্যাপ্লিকেশনে user engagement-এর মূল ভিত্তি হলো notification system। আপনার Uber ড্রাইভার পৌঁছালে আপনি একটা push notification পান। কেউ আপনার Facebook পোস্টে কমেন্ট করলে আপনি একটা in-app alert দেখেন। আপনার ক্রেডিট কার্ডে চার্জ হলে আপনি একটা email আর SMS পান। এই আপাত-সরল মেসেজগুলোর পেছনে থাকে এমন একটা system যাকে সামলাতে হয় **একাধিক delivery channel** (push, email, SMS, in-app), **user preferences** (কী পাঠাতে হবে আর কখন), **priority routing** (marketing-এর আগে fraud alert), **rate limiting** (notification fatigue যেন না হয়), এবং **delivery tracking** (আসলেই কি পৌঁছালো?)।

ব্যাপারটাকে এমন একটা ডাকঘরের মতো ভাবুন যা একসাথে express mail, standard mail, আর bulk marketing সামলায়। Express প্যাকেজ (security warning-এর মতো critical alert) লাইন এড়িয়ে সাথে সাথে ডেলিভার হয়। Standard mail (order confirmation-এর মতো transactional notification) স্বাভাবিক প্রসেসিং অনুসরণ করে। Bulk marketing (weekly digest, promotional offer) batch করা হয় এবং কম-ট্রাফিকের সময়ে ডেলিভার হয়। প্রতিটি প্যাকেজের একটা tracking number আছে, আর ডেলিভারি ব্যর্থ হলে system ধাপে ধাপে বাড়তে থাকা delay দিয়ে retry করে।

<Mermaid
title="Notification System Architecture"
code={`graph TD
  E["Event Source<br/>Triggers"] --> N["Notification Service<br/>Routing & Priority"] --> W["Delivery Workers<br/>Multi-channel"]
  W --> S["Notification Store<br/>History"] --> Q["Priority Queue<br/>Rate Limited"] --> P["User Preferences<br/>Channels & Rules"]`}
/>

## বাস্তব জীবনের উপমা

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা হাসপাতালের alert system-এর মতো — critical alert (code blue) সাথে সাথে চলে যায়, routine reminder (আগামীকাল appointment) batch করা হয় আর অফিস চলাকালীন সময়ে পাঠানো হয়। প্রতিটি notification-এর delivery status ট্র্যাক করা হয়।

</Callout>

Facebook প্রতিদিন 10 বিলিয়নেরও বেশি push notification পাঠায়। কেউ আপনার ছবিতে লাইক দিলে notification system আপনার preferences চেক করে (আপনি কি লাইকের জন্য push notification চান?), আপনি "do not disturb" মোডে আছেন কিনা চেক করে, rate limit চেক করে (আপনি কি এই ঘণ্টায় ইতিমধ্যে 50টা notification পেয়ে গেছেন?), এবং তারপর উপযুক্ত channel দিয়ে route করে। Uber-এর ক্ষেত্রে, আপনার ড্রাইভার যখন 2 মিনিট দূরে, system-কে সেই notification সেকেন্ডের মধ্যে ডেলিভার করতেই হবে — এটা critical priority lane দিয়ে যায়, সব batching আর rate limit বাইপাস করে। Airbnb non-urgent update-এর জন্য উল্টো পথ নেয়: এটা আপনার "homes you might like" একটা weekly digest email-এ batch করে, engagement বজায় রেখে notification fatigue কমায়।

## প্রয়োজনীয়তা

- **Functional**: Multi-channel delivery (push, email, SMS, in-app), প্রতি notification type-এ user preference ম্যানেজমেন্ট, non-urgent notification-এর জন্য batching/digest, priority level (critical, high, normal, low), status update সহ delivery tracking, group notification-এর জন্য fan-out
- **Non-functional**: পিকে 1M notification/min, critical alert-এর জন্য sub-second delivery, 99.95% delivery rate, at-least-once delivery guarantee
- **Storage**: delivery status সহ notification history, user preference profile, delivery audit trail

## ধাপে ধাপে: একটা Notification কীভাবে প্রবাহিত হয়

1. **Event notification ট্রিগার করে** — একটা upstream service একটা event emit করে (যেমন, user 12345-এর জন্য "order_shipped")
2. **User preferences দেখা হয়** — system চেক করে "order_shipped" event-এর জন্য এই user কোন channel-গুলো enable করেছে (হয়তো push + email, কিন্তু SMS নয়)
3. **Quiet hours চেক করা হয়** — user-এর যদি quiet hours সেট থাকে (যেমন, রাত 11টা-সকাল 7টা) এবং notification-টা critical না হয়, তাহলে সেটা পিছিয়ে দেওয়া হয়
4. **Priority বসানো হয়** — notification type priority নির্ধারণ করে। "fraud_alert" → critical (সাথে সাথে)। "order_shipped" → high। "weekly_digest" → low
5. **Priority সহ enqueue করা হয়** — critical notification queue-এর সামনে চলে যায়। Low-priority-গুলো বাকি সবার পেছনে অপেক্ষা করে
6. **Rate limit চেক** — পাঠানোর আগে যাচাই করা হয় user তার per-channel limit ছাড়িয়ে যায়নি (যেমন, সর্বোচ্চ 10 push/hour, সর্বোচ্চ 50 email/day)
7. **Channel handler দিয়ে deliver করা হয়** — উপযুক্ত handler (push-এর জন্য FCM, email-এর জন্য SendGrid, SMS-এর জন্য Twilio) notification-টা deliver করে
8. **Delivery ট্র্যাক ও retry করা হয়** — delivery ব্যর্থ হলে exponential backoff দিয়ে retry করা হয় (1s, 2s, 4s)। 3 বার ব্যর্থ হলে permanently failed হিসেবে চিহ্নিত করা হয়

## Notification System তৈরি করা

<CodeTabs tsFile="notification-system.ts" goFile="notification-system.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

// ===========================================
// 1. TYPES & ENUMS
// ===========================================
type NotificationChannel = 'push' | 'email' | 'sms' | 'in_app';
type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';
type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed';

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
	critical: 0,
	high: 1,
	normal: 2,
	low: 3
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

	get size(): number {
		return this.heap.length;
	}

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
			const left = 2 * i + 1,
				right = 2 * i + 2;
			if (
				left < this.heap.length &&
				PRIORITY_MAP[this.heap[left].priority] < PRIORITY_MAP[this.heap[smallest].priority]
			)
				smallest = left;
			if (
				right < this.heap.length &&
				PRIORITY_MAP[this.heap[right].priority] < PRIORITY_MAP[this.heap[smallest].priority]
			)
				smallest = right;
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
		const timestamps = (this.windows.get(key) || []).filter((t) => t > now - windowMs);
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
		return (
			this.prefs.get(userId) || {
				userId,
				channels: { default: ['push', 'email', 'in_app'] },
				quietHoursStart: null,
				quietHoursEnd: null,
				maxPerHour: 50
			}
		);
	}

	set(userId: string, prefs: UserPreferences): void {
		this.prefs.set(userId, prefs);
	}

	getChannelsForType(userId: string, type: string): NotificationChannel[] {
		const p = this.get(userId);
		return p.channels[type] || p.channels['default'] || ['in_app'];
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
			in_app: new InAppHandler(this.inAppStore)
		};
		this.processInterval = setInterval(() => this.processQueue(), 100);
	}

	async send(
		userId: string,
		type: string,
		title: string,
		body: string,
		priority: NotificationPriority = 'normal',
		metadata: Record<string, string> = {}
	): Promise<string[]> {
		const channels = this.preferences.getChannelsForType(userId, type);
		const ids: string[] = [];

		for (const channel of channels) {
			if (priority !== 'critical' && this.preferences.isQuietHours(userId)) continue;

			const notification: Notification = {
				id: crypto.randomUUID(),
				userId,
				type,
				title,
				body,
				channel,
				priority,
				status: 'pending',
				metadata,
				createdAt: new Date().toISOString(),
				sentAt: null,
				retryCount: 0
			};

			this.notificationLog.set(notification.id, notification);
			this.queue.enqueue(notification);
			ids.push(notification.id);
		}
		return ids;
	}

	async fanOut(
		userIds: string[],
		type: string,
		title: string,
		body: string,
		priority: NotificationPriority = 'normal'
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
				n.status = 'failed';
				console.log(`[RATE-LIMITED] ${n.userId} on ${n.channel}`);
				continue;
			}

			try {
				const success = await this.handlers[n.channel].send(n);
				if (success) {
					n.status = 'delivered';
					n.sentAt = new Date().toISOString();
				} else {
					throw new Error('Delivery failed');
				}
			} catch {
				n.retryCount++;
				if (n.retryCount < 3) {
					setTimeout(() => this.queue.enqueue(n), Math.pow(2, n.retryCount) * 1000);
				} else {
					n.status = 'failed';
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

	shutdown(): void {
		clearInterval(this.processInterval);
	}
}

// ===========================================
// 7. HTTP SERVER
// ===========================================
const service = new NotificationService();

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
		// POST /api/notify
		if (url.pathname === '/api/notify' && method === 'POST') {
			const body = (await parseBody(req)) as any;
			if (!body.userId || !body.title || !body.body) {
				json(res, 400, { error: 'userId, title, and body are required' });
				return;
			}
			const ids = await service.send(
				body.userId,
				body.type || 'default',
				body.title,
				body.body,
				body.priority || 'normal',
				body.metadata || {}
			);
			json(res, 201, { notificationIds: ids });
			return;
		}

		// POST /api/notify/batch
		if (url.pathname === '/api/notify/batch' && method === 'POST') {
			const body = (await parseBody(req)) as any;
			if (!body.userIds?.length || !body.title || !body.body) {
				json(res, 400, { error: 'userIds, title, and body are required' });
				return;
			}
			const count = await service.fanOut(
				body.userIds,
				body.type || 'default',
				body.title,
				body.body,
				body.priority || 'normal'
			);
			json(res, 201, { totalQueued: count });
			return;
		}

		// GET /api/notifications/:userId
		const notifMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)$/);
		if (notifMatch && method === 'GET') {
			const notifs = service.getNotifications(notifMatch[1]);
			json(res, 200, { notifications: notifs, count: notifs.length });
			return;
		}

		// PUT /api/preferences/:userId
		const prefMatch = url.pathname.match(/^\/api\/preferences\/([^/]+)$/);
		if (prefMatch && method === 'PUT') {
			const body = (await parseBody(req)) as any;
			const current = service.getPreferences(prefMatch[1]);
			service.updatePreferences(prefMatch[1], { ...current, ...body, userId: prefMatch[1] });
			json(res, 200, service.getPreferences(prefMatch[1]));
			return;
		}

		// GET /api/preferences/:userId
		if (prefMatch && method === 'GET') {
			json(res, 200, service.getPreferences(prefMatch[1]));
			return;
		}

		if (url.pathname === '/health') {
			json(res, 200, { status: 'ok' });
			return;
		}
		json(res, 404, { error: 'Not found' });
	} catch (err) {
		console.error('Error:', err);
		json(res, 500, { error: 'Internal server error' });
	}
});

const PORT = parseInt(process.env.PORT || '3000');
server.listen(PORT, () => console.log(`Notification Service on http://localhost:${PORT}`));
process.on('SIGTERM', () => {
	service.shutdown();
	server.close();
});
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

## ডিজাইন সিদ্ধান্তগুলোর ব্যাখ্যা

### কেন Priority Queue?

সব notification সমান নয়। একটা fraud alert সেকেন্ডের মধ্যে পৌঁছাতেই হবে; একটা weekly digest ঘণ্টার পর ঘণ্টা অপেক্ষা করতে পারে। Priority queue নিশ্চিত করে যে critical notification (account security, payment failure, ride arriving) সবসময় marketing email-এর আগে প্রসেস হয়। Prioritization ছাড়া 100K promotional notification-এর একটা burst একটা security alert-কে মিনিট ধরে দেরি করাতে পারে — কারো account যখন compromise হচ্ছে তখন এটা মেনে নেওয়া যায় না।

### কেন Fan-Out on Write বনাম Fan-Out on Read?

আমরা fan-out on write ব্যবহার করি — একটা event ট্রিগার হলে আমরা সাথে সাথে সব target user-এর জন্য notification record তৈরি করি আর enqueue করি। বিকল্প (fan-out on read) হলে user অ্যাপ খোলার সময় pending notification চেক করা হতো। Fan-out on write দেয় predictable delivery timing, এমন channel-এর জন্য কাজ করে যেখানে user সক্রিয়ভাবে "চেক" করে না (push, email, SMS), এবং আমাদের প্রতি user-এ delivery status ট্র্যাক করতে দেয়। খরচটা হলো বেশি queue entry, কিন্তু notification volume rate limit দিয়ে সীমাবদ্ধ।

### কেন Per User Per Channel Rate Limit?

Rate limiting ছাড়া একটা buggy upstream service মিনিটের মধ্যে একজন user-কে হাজার হাজার notification পাঠাতে পারে। Per-user limit notification fatigue ঠেকায়। Per-channel limit খুবই গুরুত্বপূর্ণ কারণ সহনশীলতা ভিন্ন: user ~50 email/day মেনে নেয় কিন্তু মাত্র ~10 push notification/hour আর ~5 SMS/day। Channel-নির্দিষ্ট limit আমাদের প্রতিটি medium-এর প্রত্যাশার সাথে মিল রাখতে দেয়।

### কেন Retry-এর জন্য Exponential Backoff?

একটা channel provider (FCM, SendGrid, Twilio) যখন error দেয়, এটা transient হতে পারে (network blip) বা persistent হতে পারে (invalid device token)। Exponential backoff (1s, 2s, 4s) provider-কে বেশি চাপ না দিয়ে transient সমস্যাগুলোকে ঠিক হওয়ার সময় দেয়। 3 বার ব্যর্থ হওয়ার পর আমরা permanently failed হিসেবে চিহ্নিত করি — provider যদি মিনিটের জন্য down থাকে, একে বারবার আঘাত করলে সবার জন্য recovery ধীর হয়।

<div class="takeaways">

### মূল বিষয়গুলো

- Priority queue নিশ্চিত করে critical alert (security, payment) সবসময় marketing-এর আগে প্রসেস হয় — একটা fraud alert-এ 10 সেকেন্ডের দেরিও মেনে নেওয়া যায় না
- Multi-channel delivery মানে একটা event push + email + SMS ট্রিগার করতে পারে — প্রতি notification type-এ কোন channel সক্রিয় তা user preferences নিয়ন্ত্রণ করে
- Per user per channel rate limiting notification fatigue ঠেকায় — email-এর সহনশীলতা push আর SMS থেকে ব্যাপকভাবে ভিন্ন
- Fan-out on write দেয় predictable delivery timing এবং এমন channel-এর জন্য কাজ করে যেখানে user সক্রিয়ভাবে "চেক" করে না (push, SMS)
- Retry-এ exponential backoff outage-এর সময় channel provider-দের অতিরিক্ত চাপে ফেলা ঠেকায়
- Quiet hours user preferences মান্য করে — critical notification quiet hours বাইপাস করে, বাকি সব অপেক্ষা করে

</div>

<div class="when-to-use">

### বাস্তব জীবনে ব্যবহার

- **Facebook** per-user rate limiting সহ priority-based fan-out ব্যবহার করে প্রতিদিন 10B+ push notification পাঠায়
- **Uber** ride update-এর জন্য real-time notification ব্যবহার করে, "driver arriving"-এর মতো critical event-এ sub-second delivery SLA সহ
- **Airbnb** notification fatigue কমাতে non-urgent notification-গুলোকে weekly digest email-এ batch করে
- **Slack** per-channel rate limiting এবং "do not disturb" window ব্যবহার করে যা calendar availability-এর সাথে integrate হয়
- **Stripe** exponential backoff retry সহ webhook notification deliver করে, 99.99% delivery rate অর্জন করে
- এই architecture sub-second critical delivery সহ 1M+ notification/minute সামলায়

</div>
