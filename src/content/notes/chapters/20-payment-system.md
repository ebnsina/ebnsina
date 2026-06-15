---
title: "Case Study: Payment System"
subtitle: "Design and build a production payment processing system with idempotency, double-entry ledger, reconciliation, and webhook delivery."
chapter: 20
level: "advanced"
readingTime: "35 min"
topics: ["payment system", "idempotency", "double-entry ledger", "reconciliation", "webhooks"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Diagram from '$lib/components/content/Diagram.svelte';
</script>

## Why Payments Are the Hardest Problem in System Design

Money cannot be lost, duplicated, or misrouted. A dropped message in a chat app is annoying; a dropped payment means real financial harm. Payment systems must guarantee **exactly-once processing** (charge the customer once, never twice), maintain a **perfect audit trail** (every cent must be accounted for), handle **partial failures gracefully** (what if the network dies mid-transaction?), and deliver **webhook notifications** so merchants know what happened.

Think of it like a bank's vault room with double-entry bookkeeping.

<Callout type="info">

**Real-World Analogy**

Like double-entry bookkeeping — every time money moves, two entries are recorded: a debit from one account and a credit to another. The books must always balance.

</Callout>

Every time money moves, two entries are recorded: a debit from one account and a credit to another. The books must always balance. If the accountant is interrupted mid-entry, the incomplete transaction is rolled back. And every entry has a unique reference number — if someone accidentally submits the same deposit slip twice, the second one is recognized as a duplicate and ignored.

<Diagram title="Payment System Architecture">
  <div class="diagram-row">
    <div class="box box-client">Merchant API<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Initiate Payment</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-lb">Payment Gateway<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Idempotency Check</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-server">Payment Processor<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">State Machine</span></div>
  </div>
  <div class="diagram-row" style="justify-content:center;">
    <div class="arrow-down">v</div>
  </div>
  <div class="diagram-row">
    <div class="box box-db">Ledger<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Double Entry</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-queue">Webhook Queue<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Event Delivery</span></div>
    <div class="arrow">---&gt;</div>
    <div class="box box-cache">Reconciliation<br/><span style="font-size:0.7rem;font-weight:400;color:var(--color-text-muted)">Balance Check</span></div>
  </div>
</Diagram>

## Requirements

- **Functional**: Process payments (charge, authorize, capture), issue refunds, idempotent operations via idempotency keys, double-entry ledger, webhook notifications to merchants, reconciliation engine
- **Non-functional**: Zero money loss, exactly-once processing semantics, sub-500ms API response time, 99.99% availability
- **Compliance**: Complete audit trail, immutable transaction log, all state transitions recorded

## Step-by-Step: How a Payment Flows

1. **Merchant sends payment request** — The API call includes an `Idempotency-Key` header (e.g., `order_12345_payment`). This key ensures the same request can be safely retried.
2. **Idempotency check** — The gateway looks up the key. If it's been seen before, return the cached response immediately — no duplicate charge.
3. **Payment enters state machine** — The payment starts in `pending` state and transitions through `processing` → `completed` or `failed`. Each transition is recorded.
4. **Double-entry ledger records the transaction** — Two entries are created atomically: debit from the customer's account, credit to the merchant's account. The ledger always balances.
5. **Webhook fires** — The merchant's webhook URL receives a signed notification (HMAC-SHA256) with the payment status. If delivery fails, we retry with exponential backoff.
6. **Reconciliation verifies balances** — A background process sums all debits and credits. If they don't balance to zero, something went wrong — alert immediately.

## Building the Payment System

<CodeTabs tsFile="payment-system.ts" goFile="payment-system.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import http from "node:http";
import crypto from "node:crypto";

// ===========================================
// 1. TYPES & STATE MACHINE
// ===========================================
type PaymentStatus = "pending" | "processing" | "completed" | "failed" | "refunded";

const VALID_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: ["processing", "failed"],
  processing: ["completed", "failed"],
  completed: ["refunded"],
  failed: [],
  refunded: [],
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
  type: "debit" | "credit";
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
      type: "debit",
      createdAt: timestamp,
    });

    // Credit entry (money enters destination account)
    this.entries.push({
      id: crypto.randomUUID(),
      paymentId,
      accountId: toAccount,
      amount: amount,
      type: "credit",
      createdAt: timestamp,
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
  reconcile(): { balanced: boolean; totalDebits: number; totalCredits: number; difference: number } {
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
      difference,
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

  enqueue(paymentId: string, type: string, data: unknown, webhookUrl: string, secret: string): void {
    this.queue.push({
      id: crypto.randomUUID(),
      paymentId, type, data, webhookUrl, secret,
      attempts: 0, lastAttempt: null, delivered: false,
    });
  }

  private async processQueue(): Promise<void> {
    const pending = this.queue.filter((e) => !e.delivered && e.attempts < 5);
    for (const event of pending) {
      event.attempts++;
      event.lastAttempt = new Date().toISOString();

      // Create HMAC signature
      const payload = JSON.stringify({ id: event.id, type: event.type, data: event.data });
      const signature = crypto.createHmac("sha256", event.secret).update(payload).digest("hex");

      try {
        // In production: actual HTTP POST to webhookUrl
        console.log(`[WEBHOOK] → ${event.webhookUrl} | ${event.type} | sig:${signature.slice(0, 8)}...`);
        event.delivered = true;
      } catch {
        const delay = Math.pow(2, event.attempts) * 1000;
        console.log(`[WEBHOOK RETRY] attempt ${event.attempts}/5, next in ${delay}ms`);
      }
    }
  }

  stop(): void { clearInterval(this.interval); }
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
    this.merchantWebhooks.set("merchant_1", {
      url: "https://merchant.example.com/webhooks",
      secret: "whsec_test_secret_key",
    });
  }

  async createPayment(
    merchantId: string, amount: number, currency: string,
    description: string, idempotencyKey: string,
    metadata: Record<string, string> = {}
  ): Promise<Payment> {
    // Idempotency check
    const cached = this.idempotency.check(idempotencyKey);
    if (cached) return cached as Payment;

    const payment: Payment = {
      id: `pay_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      merchantId, amount, currency, status: "pending",
      idempotencyKey, description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata,
    };

    this.payments.set(payment.id, payment);

    // Process payment
    this.transition(payment, "processing");

    // Simulate processing (in production: call payment provider)
    const success = amount < 10000; // Fail payments over $100 for demo
    if (success) {
      this.transition(payment, "completed");

      // Record in ledger: debit customer, credit merchant
      this.ledger.record(payment.id, `customer:${payment.id}`, `merchant:${merchantId}`, amount);

      // Fire webhook
      const hook = this.merchantWebhooks.get(merchantId);
      if (hook) {
        this.webhooks.enqueue(payment.id, "payment.completed", payment, hook.url, hook.secret);
      }
    } else {
      this.transition(payment, "failed");
    }

    this.idempotency.store(idempotencyKey, payment);
    return payment;
  }

  async refund(paymentId: string): Promise<Payment> {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error("Payment not found");

    this.transition(payment, "refunded");

    // Reverse ledger entry
    this.ledger.record(payment.id + "_refund", `merchant:${payment.merchantId}`, `customer:${paymentId}`, payment.amount);

    const hook = this.merchantWebhooks.get(payment.merchantId);
    if (hook) {
      this.webhooks.enqueue(payment.id, "payment.refunded", payment, hook.url, hook.secret);
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
    return { balance: this.ledger.getBalance(accountId), entries: this.ledger.getEntries(accountId) };
  }

  reconcile() {
    return this.ledger.reconcile();
  }

  shutdown(): void { this.webhooks.stop(); }
}

// ===========================================
// 6. HTTP SERVER
// ===========================================
const processor = new PaymentProcessor();

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
    // POST /api/payments — Create payment
    if (url.pathname === "/api/payments" && method === "POST") {
      const idempotencyKey = req.headers["idempotency-key"] as string;
      if (!idempotencyKey) {
        json(res, 400, { error: "Idempotency-Key header is required" }); return;
      }
      const body = await parseBody(req) as any;
      if (!body.merchantId || !body.amount || !body.currency) {
        json(res, 400, { error: "merchantId, amount, and currency are required" }); return;
      }
      const payment = await processor.createPayment(
        body.merchantId, body.amount, body.currency,
        body.description || "", idempotencyKey, body.metadata || {}
      );
      json(res, 201, payment); return;
    }

    // POST /api/payments/:id/refund
    const refundMatch = url.pathname.match(/^\/api\/payments\/([^/]+)\/refund$/);
    if (refundMatch && method === "POST") {
      const payment = await processor.refund(refundMatch[1]);
      json(res, 200, payment); return;
    }

    // GET /api/payments/:id
    const paymentMatch = url.pathname.match(/^\/api\/payments\/([^/]+)$/);
    if (paymentMatch && method === "GET") {
      const payment = processor.getPayment(paymentMatch[1]);
      if (!payment) { json(res, 404, { error: "Payment not found" }); return; }
      json(res, 200, payment); return;
    }

    // GET /api/ledger/:accountId
    const ledgerMatch = url.pathname.match(/^\/api\/ledger\/([^/]+)$/);
    if (ledgerMatch && method === "GET") {
      json(res, 200, processor.getLedger(ledgerMatch[1])); return;
    }

    // POST /api/reconcile
    if (url.pathname === "/api/reconcile" && method === "POST") {
      json(res, 200, processor.reconcile()); return;
    }

    if (url.pathname === "/health") { json(res, 200, { status: "ok" }); return; }
    json(res, 404, { error: "Not found" });
  } catch (err: any) {
    console.error("Error:", err);
    json(res, 400, { error: err.message || "Internal server error" });
  }
});

const PORT = parseInt(process.env.PORT || "3000");
server.listen(PORT, () => console.log(`Payment Service on http://localhost:${PORT}`));
process.on("SIGTERM", () => { processor.shutdown(); server.close(); });
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

## Design Decisions Explained

### Why Idempotency Keys?

Networks fail. When a merchant sends a payment request and their connection drops before receiving the response, they don't know if the payment went through. Without idempotency, retrying would charge the customer twice. The idempotency key (usually tied to the order ID) ensures that even if the same request is sent 10 times, the customer is charged exactly once. This is the single most important safety mechanism in any payment system.

### Why Double-Entry Ledger?

Every financial transaction creates two entries: a debit and a credit. The sum of all entries must always be zero. This isn't just an accounting tradition — it's a mathematical invariant that catches bugs. If a payment is processed but only one side is recorded, the reconciliation check will immediately flag it. Single-entry systems (just tracking balances) can silently lose money when race conditions or bugs cause inconsistent updates.

### Why a State Machine?

Payment states must follow strict rules: you can't refund a pending payment, you can't complete an already-failed payment. A state machine makes invalid transitions impossible at the code level, not just the business logic level. This prevents an entire class of bugs where concurrent requests or retry logic could put a payment into an inconsistent state.

### Why HMAC-Signed Webhooks?

Merchants receive webhooks at their server endpoints. Without signatures, anyone could POST fake "payment completed" events to the merchant's webhook URL and get free products. HMAC-SHA256 signing with a shared secret ensures the merchant can verify that the webhook genuinely came from your payment system and hasn't been tampered with in transit.

<div class="takeaways">

### Key Takeaways

- Idempotency keys prevent duplicate charges — the single most important safety mechanism in payments
- Double-entry ledger ensures every debit has a matching credit — your books always balance to zero
- Payment state machines make it impossible to reach invalid states (you can't refund a pending payment)
- Webhook delivery needs retry with exponential backoff — merchants' servers go down
- Reconciliation catches bugs that unit tests miss — run it continuously, not just at end of day
- Immutable audit trails are not optional — regulators will ask for them

</div>

<div class="when-to-use">

### Real-World Usage

- **Stripe** processes 1000+ payments per second using idempotency keys and double-entry accounting
- **Square** uses event-sourced ledgers where every state change is an immutable event
- **PayPal** reconciles billions of transactions daily across multiple currencies and payment methods
- **Shopify** uses webhook delivery with HMAC signatures for payment event notifications
- This architecture handles real-money transactions with zero-loss guarantees through idempotency and double-entry bookkeeping

</div>

