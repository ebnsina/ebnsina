---
title: 'কেস স্টাডি: পেমেন্ট সিস্টেম'
subtitle: 'idempotency, double-entry ledger, reconciliation, এবং webhook delivery সহ একটি প্রোডাকশন পেমেন্ট প্রসেসিং সিস্টেম ডিজাইন ও তৈরি করা।'
chapter: 20
level: 'advanced'
readingTime: '35 মিনিট'
topics: ['payment system', 'idempotency', 'double-entry ledger', 'reconciliation', 'webhooks']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## সিস্টেম ডিজাইনে পেমেন্ট কেন সবচেয়ে কঠিন সমস্যা

টাকা কখনো হারানো যাবে না, ডুপ্লিকেট হওয়া যাবে না, বা ভুল জায়গায় যাওয়া যাবে না। একটা চ্যাট অ্যাপে একটা মেসেজ ড্রপ হলে সেটা বিরক্তিকর; কিন্তু একটা পেমেন্ট ড্রপ হওয়া মানে সত্যিকারের আর্থিক ক্ষতি। পেমেন্ট সিস্টেমকে গ্যারান্টি দিতে হয় **exactly-once processing** (কাস্টমারকে একবার চার্জ করবে, কখনো দুইবার নয়), একটা **perfect audit trail** রাখতে হয় (প্রতিটা পয়সার হিসাব থাকতে হবে), **partial failures** সুন্দরভাবে হ্যান্ডেল করতে হয় (transaction-এর মাঝপথে যদি network মরে যায় তখন কী?), এবং **webhook notifications** ডেলিভার করতে হয় যাতে merchant-রা জানতে পারে কী হয়েছে।

এটাকে একটা ব্যাংকের ভল্ট রুমের মতো ভাবুন যেখানে double-entry bookkeeping চলে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

double-entry bookkeeping-এর মতো — প্রতিবার টাকা নড়াচড়া করলে দুটো এন্ট্রি রেকর্ড হয়: একটা অ্যাকাউন্ট থেকে debit আর আরেকটা অ্যাকাউন্টে credit। খাতা সবসময় ব্যালেন্স থাকতেই হবে।

</Callout>

প্রতিবার টাকা নড়াচড়া করলে দুটো এন্ট্রি রেকর্ড হয়: একটা অ্যাকাউন্ট থেকে debit আর আরেকটা অ্যাকাউন্টে credit। খাতা সবসময় ব্যালেন্স থাকতেই হবে। accountant যদি এন্ট্রির মাঝপথে বাধা পায়, তবে অসম্পূর্ণ transaction-টা roll back করা হয়। আর প্রতিটা এন্ট্রির একটা ইউনিক রেফারেন্স নম্বর থাকে — কেউ যদি ভুল করে একই deposit slip দুইবার সাবমিট করে, দ্বিতীয়টাকে ডুপ্লিকেট হিসেবে চিনে নিয়ে ইগনোর করা হয়।

<Mermaid
title="Payment System Architecture"
code={`graph TD
  M["Merchant API<br/>Initiate Payment"] --> G["Payment Gateway<br/>Idempotency Check"] --> P["Payment Processor<br/>State Machine"]
  P --> L["Ledger<br/>Double Entry"] --> W["Webhook Queue<br/>Event Delivery"] --> R["Reconciliation<br/>Balance Check"]`}
/>

## Requirements

- **Functional**: পেমেন্ট প্রসেস করা (charge, authorize, capture), refund ইস্যু করা, idempotency key দিয়ে idempotent operation, double-entry ledger, merchant-দের কাছে webhook notification, reconciliation engine
- **Non-functional**: শূন্য টাকা loss, exactly-once processing semantics, sub-500ms API response time, 99.99% availability
- **Compliance**: সম্পূর্ণ audit trail, immutable transaction log, সব state transition রেকর্ড করা

## ধাপে ধাপে: একটা পেমেন্ট কীভাবে প্রবাহিত হয়

1. **Merchant পেমেন্ট রিকোয়েস্ট পাঠায়** — API কলে একটা `Idempotency-Key` header থাকে (যেমন, `order_12345_payment`)। এই key নিশ্চিত করে যে একই রিকোয়েস্ট নিরাপদে retry করা যাবে।
2. **Idempotency check** — gateway key-টা খুঁজে দেখে। আগে যদি এটা দেখা হয়ে থাকে, সাথে সাথে cache করা response ফিরিয়ে দেয় — কোনো ডুপ্লিকেট charge নেই।
3. **পেমেন্ট state machine-এ ঢোকে** — পেমেন্ট `pending` state-এ শুরু হয় এবং `processing` → `completed` বা `failed`-এর মধ্য দিয়ে transition করে। প্রতিটা transition রেকর্ড হয়।
4. **Double-entry ledger transaction রেকর্ড করে** — দুটো এন্ট্রি atomically তৈরি হয়: কাস্টমারের অ্যাকাউন্ট থেকে debit, merchant-এর অ্যাকাউন্টে credit। ledger সবসময় ব্যালেন্স থাকে।
5. **Webhook fire করে** — merchant-এর webhook URL পেমেন্ট status সহ একটা signed notification (HMAC-SHA256) পায়। delivery ফেইল করলে আমরা exponential backoff দিয়ে retry করি।
6. **Reconciliation ব্যালেন্স যাচাই করে** — একটা background process সব debit আর credit যোগ করে। এগুলো যদি শূন্যে ব্যালেন্স না হয়, তবে কিছু একটা ভুল হয়েছে — সাথে সাথে alert করো।

## পেমেন্ট সিস্টেম তৈরি করা

<CodeTabs tsFile="payment-system.ts" goFile="payment-system.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from 'node:http';
import crypto from 'node:crypto';

// ===========================================
// 1. TYPES & STATE MACHINE
// ===========================================
type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
	pending: ['processing', 'failed'],
	processing: ['completed', 'failed'],
	completed: ['refunded'],
	failed: [],
	refunded: []
};

interface Payment {
	id: string;
	merchantId: string;
	amount: number;
	currency: string;
	status: PaymentStatus;
	idempotencyKey: string;
	description: string;
	createdAt: string;
	updatedAt: string;
	metadata: Record<string, string>;
}

interface LedgerEntry {
	id: string;
	paymentId: string;
	accountId: string;
	amount: number; // positive = credit, negative = debit
	type: 'debit' | 'credit';
	createdAt: string;
}

interface WebhookEvent {
	id: string;
	paymentId: string;
	type: string;
	data: unknown;
	webhookUrl: string;
	secret: string;
	attempts: number;
	lastAttempt: string | null;
	delivered: boolean;
}

// ===========================================
// 2. IDEMPOTENCY MANAGER
// ===========================================
class IdempotencyManager {
	private keys = new Map<string, { response: unknown; createdAt: number }>();

	check(key: string): unknown | null {
		const entry = this.keys.get(key);
		if (!entry) return null;
		// Expire after 24 hours
		if (Date.now() - entry.createdAt > 86400000) {
			this.keys.delete(key);
			return null;
		}
		return entry.response;
	}

	store(key: string, response: unknown): void {
		this.keys.set(key, { response, createdAt: Date.now() });
	}
}

// ===========================================
// 3. DOUBLE-ENTRY LEDGER
// ===========================================
class Ledger {
	private entries: LedgerEntry[] = [];

	record(paymentId: string, fromAccount: string, toAccount: string, amount: number): void {
		const timestamp = new Date().toISOString();

		// Debit entry (money leaves source account)
		this.entries.push({
			id: crypto.randomUUID(),
			paymentId,
			accountId: fromAccount,
			amount: -amount,
			type: 'debit',
			createdAt: timestamp
		});

		// Credit entry (money enters destination account)
		this.entries.push({
			id: crypto.randomUUID(),
			paymentId,
			accountId: toAccount,
			amount: amount,
			type: 'credit',
			createdAt: timestamp
		});
	}

	getBalance(accountId: string): number {
		return this.entries
			.filter((e) => e.accountId === accountId)
			.reduce((sum, e) => sum + e.amount, 0);
	}

	getEntries(accountId: string): LedgerEntry[] {
		return this.entries.filter((e) => e.accountId === accountId);
	}

	// Reconciliation: all entries must sum to zero
	reconcile(): {
		balanced: boolean;
		totalDebits: number;
		totalCredits: number;
		difference: number;
	} {
		let totalDebits = 0;
		let totalCredits = 0;

		for (const entry of this.entries) {
			if (entry.amount < 0) totalDebits += Math.abs(entry.amount);
			else totalCredits += entry.amount;
		}

		const difference = Math.abs(totalCredits - totalDebits);
		return {
			balanced: difference < 0.01, // floating point tolerance
			totalDebits,
			totalCredits,
			difference
		};
	}
}

// ===========================================
// 4. WEBHOOK DELIVERY
// ===========================================
class WebhookDelivery {
	private queue: WebhookEvent[] = [];
	private interval: ReturnType<typeof setInterval>;

	constructor() {
		this.interval = setInterval(() => this.processQueue(), 5000);
	}

	enqueue(
		paymentId: string,
		type: string,
		data: unknown,
		webhookUrl: string,
		secret: string
	): void {
		this.queue.push({
			id: crypto.randomUUID(),
			paymentId,
			type,
			data,
			webhookUrl,
			secret,
			attempts: 0,
			lastAttempt: null,
			delivered: false
		});
	}

	private async processQueue(): Promise<void> {
		const pending = this.queue.filter((e) => !e.delivered && e.attempts < 5);
		for (const event of pending) {
			event.attempts++;
			event.lastAttempt = new Date().toISOString();

			// Create HMAC signature
			const payload = JSON.stringify({ id: event.id, type: event.type, data: event.data });
			const signature = crypto.createHmac('sha256', event.secret).update(payload).digest('hex');

			try {
				// In production: actual HTTP POST to webhookUrl
				console.log(
					`[WEBHOOK] → ${event.webhookUrl} | ${event.type} | sig:${signature.slice(0, 8)}...`
				);
				event.delivered = true;
			} catch {
				const delay = Math.pow(2, event.attempts) * 1000;
				console.log(`[WEBHOOK RETRY] attempt ${event.attempts}/5, next in ${delay}ms`);
			}
		}
	}

	stop(): void {
		clearInterval(this.interval);
	}
}

// ===========================================
// 5. PAYMENT PROCESSOR
// ===========================================
class PaymentProcessor {
	private payments = new Map<string, Payment>();
	private idempotency = new IdempotencyManager();
	private ledger = new Ledger();
	private webhooks = new WebhookDelivery();
	private merchantWebhooks = new Map<string, { url: string; secret: string }>();

	constructor() {
		// Register test merchant webhook
		this.merchantWebhooks.set('merchant_1', {
			url: 'https://merchant.example.com/webhooks',
			secret: 'whsec_test_secret_key'
		});
	}

	async createPayment(
		merchantId: string,
		amount: number,
		currency: string,
		description: string,
		idempotencyKey: string,
		metadata: Record<string, string> = {}
	): Promise<Payment> {
		// Idempotency check
		const cached = this.idempotency.check(idempotencyKey);
		if (cached) return cached as Payment;

		const payment: Payment = {
			id: `pay_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
			merchantId,
			amount,
			currency,
			status: 'pending',
			idempotencyKey,
			description,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			metadata
		};

		this.payments.set(payment.id, payment);

		// Process payment
		this.transition(payment, 'processing');

		// Simulate processing (in production: call payment provider)
		const success = amount < 10000; // Fail payments over $100 for demo
		if (success) {
			this.transition(payment, 'completed');

			// Record in ledger: debit customer, credit merchant
			this.ledger.record(payment.id, `customer:${payment.id}`, `merchant:${merchantId}`, amount);

			// Fire webhook
			const hook = this.merchantWebhooks.get(merchantId);
			if (hook) {
				this.webhooks.enqueue(payment.id, 'payment.completed', payment, hook.url, hook.secret);
			}
		} else {
			this.transition(payment, 'failed');
		}

		this.idempotency.store(idempotencyKey, payment);
		return payment;
	}

	async refund(paymentId: string): Promise<Payment> {
		const payment = this.payments.get(paymentId);
		if (!payment) throw new Error('Payment not found');

		this.transition(payment, 'refunded');

		// Reverse ledger entry
		this.ledger.record(
			payment.id + '_refund',
			`merchant:${payment.merchantId}`,
			`customer:${paymentId}`,
			payment.amount
		);

		const hook = this.merchantWebhooks.get(payment.merchantId);
		if (hook) {
			this.webhooks.enqueue(payment.id, 'payment.refunded', payment, hook.url, hook.secret);
		}

		return payment;
	}

	private transition(payment: Payment, newStatus: PaymentStatus): void {
		const allowed = VALID_TRANSITIONS[payment.status];
		if (!allowed.includes(newStatus)) {
			throw new Error(`Invalid transition: ${payment.status} → ${newStatus}`);
		}
		payment.status = newStatus;
		payment.updatedAt = new Date().toISOString();
	}

	getPayment(id: string): Payment | null {
		return this.payments.get(id) || null;
	}

	getLedger(accountId: string) {
		return {
			balance: this.ledger.getBalance(accountId),
			entries: this.ledger.getEntries(accountId)
		};
	}

	reconcile() {
		return this.ledger.reconcile();
	}

	shutdown(): void {
		this.webhooks.stop();
	}
}

// ===========================================
// 6. HTTP SERVER
// ===========================================
const processor = new PaymentProcessor();

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
		// POST /api/payments — Create payment
		if (url.pathname === '/api/payments' && method === 'POST') {
			const idempotencyKey = req.headers['idempotency-key'] as string;
			if (!idempotencyKey) {
				json(res, 400, { error: 'Idempotency-Key header is required' });
				return;
			}
			const body = (await parseBody(req)) as any;
			if (!body.merchantId || !body.amount || !body.currency) {
				json(res, 400, { error: 'merchantId, amount, and currency are required' });
				return;
			}
			const payment = await processor.createPayment(
				body.merchantId,
				body.amount,
				body.currency,
				body.description || '',
				idempotencyKey,
				body.metadata || {}
			);
			json(res, 201, payment);
			return;
		}

		// POST /api/payments/:id/refund
		const refundMatch = url.pathname.match(/^\/api\/payments\/([^/]+)\/refund$/);
		if (refundMatch && method === 'POST') {
			const payment = await processor.refund(refundMatch[1]);
			json(res, 200, payment);
			return;
		}

		// GET /api/payments/:id
		const paymentMatch = url.pathname.match(/^\/api\/payments\/([^/]+)$/);
		if (paymentMatch && method === 'GET') {
			const payment = processor.getPayment(paymentMatch[1]);
			if (!payment) {
				json(res, 404, { error: 'Payment not found' });
				return;
			}
			json(res, 200, payment);
			return;
		}

		// GET /api/ledger/:accountId
		const ledgerMatch = url.pathname.match(/^\/api\/ledger\/([^/]+)$/);
		if (ledgerMatch && method === 'GET') {
			json(res, 200, processor.getLedger(ledgerMatch[1]));
			return;
		}

		// POST /api/reconcile
		if (url.pathname === '/api/reconcile' && method === 'POST') {
			json(res, 200, processor.reconcile());
			return;
		}

		if (url.pathname === '/health') {
			json(res, 200, { status: 'ok' });
			return;
		}
		json(res, 404, { error: 'Not found' });
	} catch (err: any) {
		console.error('Error:', err);
		json(res, 400, { error: err.message || 'Internal server error' });
	}
});

const PORT = parseInt(process.env.PORT || '3000');
server.listen(PORT, () => console.log(`Payment Service on http://localhost:${PORT}`));
process.on('SIGTERM', () => {
	processor.shutdown();
	server.close();
});
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
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
// 1. TYPES & STATE MACHINE
// ===========================================
type PaymentStatus string

const (
	StatusPending    PaymentStatus = "pending"
	StatusProcessing PaymentStatus = "processing"
	StatusCompleted  PaymentStatus = "completed"
	StatusFailed     PaymentStatus = "failed"
	StatusRefunded   PaymentStatus = "refunded"
)

var validTransitions = map[PaymentStatus][]PaymentStatus{
	StatusPending:    {StatusProcessing, StatusFailed},
	StatusProcessing: {StatusCompleted, StatusFailed},
	StatusCompleted:  {StatusRefunded},
	StatusFailed:     {},
	StatusRefunded:   {},
}

type Payment struct {
	ID             string            `json:"id"`
	MerchantID     string            `json:"merchantId"`
	Amount         float64           `json:"amount"`
	Currency       string            `json:"currency"`
	Status         PaymentStatus     `json:"status"`
	IdempotencyKey string            `json:"idempotencyKey"`
	Description    string            `json:"description"`
	CreatedAt      time.Time         `json:"createdAt"`
	UpdatedAt      time.Time         `json:"updatedAt"`
	Metadata       map[string]string `json:"metadata"`
}

type LedgerEntry struct {
	ID        string    `json:"id"`
	PaymentID string    `json:"paymentId"`
	AccountID string    `json:"accountId"`
	Amount    float64   `json:"amount"`
	Type      string    `json:"type"`
	CreatedAt time.Time `json:"createdAt"`
}

type WebhookEvent struct {
	ID          string
	PaymentID   string
	Type        string
	Data        interface{}
	WebhookURL  string
	Secret      string
	Attempts    int
	Delivered   bool
}

// ===========================================
// 2. IDEMPOTENCY MANAGER
// ===========================================
type IdempotencyManager struct {
	mu   sync.Mutex
	keys map[string]*Payment
}

func (im *IdempotencyManager) Check(key string) *Payment {
	im.mu.Lock()
	defer im.mu.Unlock()
	return im.keys[key]
}

func (im *IdempotencyManager) Store(key string, p *Payment) {
	im.mu.Lock()
	defer im.mu.Unlock()
	im.keys[key] = p
}

// ===========================================
// 3. DOUBLE-ENTRY LEDGER
// ===========================================
type Ledger struct {
	mu      sync.Mutex
	entries []LedgerEntry
}

func (l *Ledger) Record(paymentID, from, to string, amount float64) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now().UTC()
	l.entries = append(l.entries,
		LedgerEntry{ID: fmt.Sprintf("%d-d", time.Now().UnixNano()), PaymentID: paymentID, AccountID: from, Amount: -amount, Type: "debit", CreatedAt: now},
		LedgerEntry{ID: fmt.Sprintf("%d-c", time.Now().UnixNano()), PaymentID: paymentID, AccountID: to, Amount: amount, Type: "credit", CreatedAt: now},
	)
}

func (l *Ledger) GetBalance(accountID string) float64 {
	l.mu.Lock()
	defer l.mu.Unlock()
	var sum float64
	for _, e := range l.entries {
		if e.AccountID == accountID { sum += e.Amount }
	}
	return sum
}

func (l *Ledger) GetEntries(accountID string) []LedgerEntry {
	l.mu.Lock()
	defer l.mu.Unlock()
	var result []LedgerEntry
	for _, e := range l.entries {
		if e.AccountID == accountID { result = append(result, e) }
	}
	return result
}

func (l *Ledger) Reconcile() map[string]interface{} {
	l.mu.Lock()
	defer l.mu.Unlock()
	var debits, credits float64
	for _, e := range l.entries {
		if e.Amount < 0 { debits += math.Abs(e.Amount) } else { credits += e.Amount }
	}
	diff := math.Abs(credits - debits)
	return map[string]interface{}{
		"balanced": diff < 0.01, "totalDebits": debits,
		"totalCredits": credits, "difference": diff,
	}
}

// ===========================================
// 4. WEBHOOK DELIVERY
// ===========================================
type WebhookDelivery struct {
	mu    sync.Mutex
	queue []WebhookEvent
	stop  chan struct{}
}

func NewWebhookDelivery() *WebhookDelivery {
	wd := &WebhookDelivery{stop: make(chan struct{})}
	go wd.processLoop()
	return wd
}

func (wd *WebhookDelivery) Enqueue(paymentID, eventType string, data interface{}, url, secret string) {
	wd.mu.Lock()
	defer wd.mu.Unlock()
	wd.queue = append(wd.queue, WebhookEvent{
		ID: fmt.Sprintf("evt_%d", time.Now().UnixNano()),
		PaymentID: paymentID, Type: eventType, Data: data,
		WebhookURL: url, Secret: secret,
	})
}

func (wd *WebhookDelivery) processLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			wd.mu.Lock()
			for i := range wd.queue {
				e := &wd.queue[i]
				if e.Delivered || e.Attempts >= 5 { continue }
				e.Attempts++
				payload, _ := json.Marshal(map[string]interface{}{"id": e.ID, "type": e.Type, "data": e.Data})
				mac := hmac.New(sha256.New, []byte(e.Secret))
				mac.Write(payload)
				sig := hex.EncodeToString(mac.Sum(nil))
				log.Printf("[WEBHOOK] → %s | %s | sig:%s...", e.WebhookURL, e.Type, sig[:8])
				e.Delivered = true
			}
			wd.mu.Unlock()
		case <-wd.stop: return
		}
	}
}

// ===========================================
// 5. PAYMENT PROCESSOR
// ===========================================
type PaymentProcessor struct {
	mu              sync.Mutex
	payments        map[string]*Payment
	idempotency     IdempotencyManager
	ledger          Ledger
	webhooks        *WebhookDelivery
	merchantHooks   map[string]struct{ URL, Secret string }
}

func NewPaymentProcessor() *PaymentProcessor {
	return &PaymentProcessor{
		payments:    make(map[string]*Payment),
		idempotency: IdempotencyManager{keys: make(map[string]*Payment)},
		webhooks:    NewWebhookDelivery(),
		merchantHooks: map[string]struct{ URL, Secret string }{
			"merchant_1": {URL: "https://merchant.example.com/webhooks", Secret: "whsec_test_secret"},
		},
	}
}

func (pp *PaymentProcessor) transition(p *Payment, newStatus PaymentStatus) error {
	valid := validTransitions[p.Status]
	for _, s := range valid {
		if s == newStatus {
			p.Status = newStatus
			p.UpdatedAt = time.Now().UTC()
			return nil
		}
	}
	return fmt.Errorf("invalid transition: %s → %s", p.Status, newStatus)
}

func (pp *PaymentProcessor) CreatePayment(merchantID string, amount float64, currency, desc, idempKey string, meta map[string]string) (*Payment, error) {
	if cached := pp.idempotency.Check(idempKey); cached != nil {
		return cached, nil
	}

	p := &Payment{
		ID: fmt.Sprintf("pay_%d", time.Now().UnixNano()),
		MerchantID: merchantID, Amount: amount, Currency: currency,
		Status: StatusPending, IdempotencyKey: idempKey, Description: desc,
		CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(), Metadata: meta,
	}

	pp.mu.Lock()
	pp.payments[p.ID] = p
	pp.mu.Unlock()

	pp.transition(p, StatusProcessing)

	if amount < 10000 {
		pp.transition(p, StatusCompleted)
		pp.ledger.Record(p.ID, fmt.Sprintf("customer:%s", p.ID), fmt.Sprintf("merchant:%s", merchantID), amount)
		if hook, ok := pp.merchantHooks[merchantID]; ok {
			pp.webhooks.Enqueue(p.ID, "payment.completed", p, hook.URL, hook.Secret)
		}
	} else {
		pp.transition(p, StatusFailed)
	}

	pp.idempotency.Store(idempKey, p)
	return p, nil
}

func (pp *PaymentProcessor) Refund(paymentID string) (*Payment, error) {
	pp.mu.Lock()
	p, ok := pp.payments[paymentID]
	pp.mu.Unlock()
	if !ok { return nil, fmt.Errorf("payment not found") }

	if err := pp.transition(p, StatusRefunded); err != nil { return nil, err }
	pp.ledger.Record(p.ID+"_refund", fmt.Sprintf("merchant:%s", p.MerchantID), fmt.Sprintf("customer:%s", paymentID), p.Amount)

	if hook, ok := pp.merchantHooks[p.MerchantID]; ok {
		pp.webhooks.Enqueue(p.ID, "payment.refunded", p, hook.URL, hook.Secret)
	}
	return p, nil
}

func (pp *PaymentProcessor) GetPayment(id string) *Payment {
	pp.mu.Lock()
	defer pp.mu.Unlock()
	return pp.payments[id]
}

// ===========================================
// 6. HTTP SERVER
// ===========================================
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func main() {
	pp := NewPaymentProcessor()
	paymentPattern := regexp.MustCompile(`^/api/payments/([^/]+)$`)
	refundPattern := regexp.MustCompile(`^/api/payments/([^/]+)/refund$`)
	ledgerPattern := regexp.MustCompile(`^/api/ledger/([^/]+)$`)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/payments", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "Method not allowed"}); return
		}
		idempKey := r.Header.Get("Idempotency-Key")
		if idempKey == "" {
			writeJSON(w, 400, map[string]string{"error": "Idempotency-Key header required"}); return
		}
		var body struct {
			MerchantID  string            `json:"merchantId"`
			Amount      float64           `json:"amount"`
			Currency    string            `json:"currency"`
			Description string            `json:"description"`
			Metadata    map[string]string `json:"metadata"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
			writeJSON(w, 400, map[string]string{"error": "Invalid JSON"}); return
		}
		if body.MerchantID == "" || body.Amount == 0 || body.Currency == "" {
			writeJSON(w, 400, map[string]string{"error": "merchantId, amount, currency required"}); return
		}
		p, err := pp.CreatePayment(body.MerchantID, body.Amount, body.Currency, body.Description, idempKey, body.Metadata)
		if err != nil { writeJSON(w, 400, map[string]string{"error": err.Error()}); return }
		writeJSON(w, 201, p)
	})

	mux.HandleFunc("/api/payments/", func(w http.ResponseWriter, r *http.Request) {
		if m := refundPattern.FindStringSubmatch(r.URL.Path); m != nil && r.Method == http.MethodPost {
			p, err := pp.Refund(m[1])
			if err != nil { writeJSON(w, 400, map[string]string{"error": err.Error()}); return }
			writeJSON(w, 200, p); return
		}
		if m := paymentPattern.FindStringSubmatch(r.URL.Path); m != nil && r.Method == http.MethodGet {
			p := pp.GetPayment(m[1])
			if p == nil { writeJSON(w, 404, map[string]string{"error": "Not found"}); return }
			writeJSON(w, 200, p); return
		}
		writeJSON(w, 404, map[string]string{"error": "Not found"})
	})

	mux.HandleFunc("/api/ledger/", func(w http.ResponseWriter, r *http.Request) {
		m := ledgerPattern.FindStringSubmatch(r.URL.Path)
		if m == nil { writeJSON(w, 404, map[string]string{"error": "Not found"}); return }
		writeJSON(w, 200, map[string]interface{}{
			"balance": pp.ledger.GetBalance(m[1]),
			"entries": pp.ledger.GetEntries(m[1]),
		})
	})

	mux.HandleFunc("/api/reconcile", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, pp.ledger.Reconcile())
	})

	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	port := os.Getenv("PORT"); if port == "" { port = "3000" }
	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadTimeout: 5 * time.Second, WriteTimeout: 10 * time.Second}

	go func() {
		log.Printf("Payment Service on http://localhost:%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed { log.Fatal(err) }
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")
	pp.webhooks.stop <- struct{}{}
	srv.Close()
}
```

</div>
</CodeTabs>

## ডিজাইন সিদ্ধান্তের ব্যাখ্যা

### Idempotency Key কেন?

Network ফেইল করে। যখন একটা merchant একটা পেমেন্ট রিকোয়েস্ট পাঠায় আর response পাওয়ার আগেই তার connection ড্রপ হয়ে যায়, তখন সে জানে না পেমেন্টটা হয়েছে কিনা। idempotency ছাড়া, retry করলে কাস্টমার দুইবার চার্জ হবে। idempotency key (সাধারণত order ID-এর সাথে বাঁধা) নিশ্চিত করে যে একই রিকোয়েস্ট ১০ বার পাঠানো হলেও কাস্টমার ঠিক একবারই চার্জ হবে। যেকোনো পেমেন্ট সিস্টেমে এটাই সবচেয়ে গুরুত্বপূর্ণ safety mechanism।

### Double-Entry Ledger কেন?

প্রতিটা financial transaction দুটো এন্ট্রি তৈরি করে: একটা debit আর একটা credit। সব এন্ট্রির যোগফল সবসময় শূন্য হতেই হবে। এটা শুধু একটা accounting ঐতিহ্য নয় — এটা একটা mathematical invariant যা bug ধরে। যদি একটা পেমেন্ট প্রসেস হয় কিন্তু কেবল একদিক রেকর্ড হয়, তবে reconciliation check সাথে সাথে সেটা flag করবে। single-entry system (শুধু balance track করা) race condition বা bug-এর কারণে inconsistent update হলে নীরবে টাকা হারাতে পারে।

### State Machine কেন?

পেমেন্ট state-গুলোকে কড়া নিয়ম মানতে হয়: তুমি একটা pending পেমেন্ট refund করতে পারো না, তুমি একটা ইতিমধ্যেই failed পেমেন্ট complete করতে পারো না। একটা state machine invalid transition-কে কোড লেভেলেই অসম্ভব করে দেয়, শুধু business logic লেভেলে নয়। এটা এমন একটা পুরো bug-শ্রেণি প্রতিরোধ করে যেখানে concurrent request বা retry logic একটা পেমেন্টকে inconsistent state-এ ফেলতে পারত।

### HMAC-Signed Webhook কেন?

Merchant-রা তাদের server endpoint-এ webhook পায়। signature ছাড়া, যেকেউ merchant-এর webhook URL-এ ভুয়া "payment completed" event POST করে ফ্রি প্রোডাক্ট পেতে পারত। একটা shared secret দিয়ে HMAC-SHA256 signing নিশ্চিত করে যে merchant যাচাই করতে পারবে webhook-টা সত্যিই তোমার পেমেন্ট সিস্টেম থেকে এসেছে এবং পথে কেউ টেম্পার করেনি।

<div class="takeaways">

### মূল শিক্ষা

- Idempotency key ডুপ্লিকেট charge প্রতিরোধ করে — পেমেন্টে সবচেয়ে গুরুত্বপূর্ণ safety mechanism
- Double-entry ledger নিশ্চিত করে প্রতিটা debit-এর একটা মিলে যাওয়া credit আছে — তোমার খাতা সবসময় শূন্যে ব্যালেন্স হয়
- Payment state machine invalid state-এ পৌঁছানো অসম্ভব করে দেয় (তুমি একটা pending পেমেন্ট refund করতে পারো না)
- Webhook delivery-র exponential backoff সহ retry দরকার — merchant-দের server ডাউন হয়ে যায়
- Reconciliation এমন bug ধরে যা unit test মিস করে — এটা একটানা চালাও, শুধু দিন শেষে নয়
- Immutable audit trail ঐচ্ছিক নয় — regulator-রা এগুলো চাইবে

</div>

<div class="when-to-use">

### বাস্তব জগতে ব্যবহার

- **Stripe** idempotency key আর double-entry accounting ব্যবহার করে সেকেন্ডে 1000+ পেমেন্ট প্রসেস করে
- **Square** event-sourced ledger ব্যবহার করে যেখানে প্রতিটা state change একটা immutable event
- **PayPal** প্রতিদিন একাধিক currency আর payment method জুড়ে বিলিয়ন বিলিয়ন transaction reconcile করে
- **Shopify** পেমেন্ট event notification-এর জন্য HMAC signature সহ webhook delivery ব্যবহার করে
- এই architecture idempotency আর double-entry bookkeeping-এর মাধ্যমে zero-loss গ্যারান্টি সহ সত্যিকারের-টাকার transaction হ্যান্ডেল করে

</div>
