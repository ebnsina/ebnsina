---
title: 'Event Sourcing ও CQRS'
subtitle: 'একটি e-commerce order সিস্টেমের জন্য projections, command handlers এবং event replay সহ একটি event store বানান।'
chapter: 10
level: 'advanced'
readingTime: '25 মিনিট'
topics: ['event sourcing', 'CQRS', 'projections', 'event store', 'domain events']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনার একটা মুদির দোকান। খদ্দের ফাতিমা আল-ফিহরি প্রতি মাসে বাকিতে জিনিস নেয়, মাঝেমধ্যে টাকা শোধ করে। ইবনে সিনা কোনোদিন খাতায় শুধু "ফাতিমা আল-ফিহরির বাকি ৫০০ টাকা" লিখে রাখে না — বদলে সে খাতার পাতায় লাইন ধরে সব লিখে যায়: "১ তারিখ চাল নিল ৩০০", "৫ তারিখ শোধ দিল ২০০", "১০ তারিখ তেল নিল ৪০০"। প্রতিটা লেনদেন একটা আলাদা লাইন, আর ইবনে সিনা পুরনো লাইন কখনো কাটে না বা বদলায় না — নতুন কিছু হলে শুধু নিচে নতুন লাইন যোগ করে। আজকের বাকি কত জানতে হলে সে উপর থেকে নিচ পর্যন্ত সব লাইন যোগ-বিয়োগ করে বের করে নেয়।

এতে মজাটা হলো — কোনোদিন ফাতিমা আল-ফিহরি যদি বলে "গত মাসের ১৫ তারিখে আমার বাকি কত ছিল?", ইবনে সিনা শুধু সেই তারিখ পর্যন্ত লাইনগুলো আবার যোগ করে হুবহু বলে দিতে পারে। ঝগড়া বাধলে খাতাই সাক্ষী, প্রতিটা লাইন ধরে দেখানো যায় কবে কী হয়েছিল। তবে প্রতিবার পুরো খাতা যোগ করা ঝামেলা, তাই ইবনে সিনা দোকানের সামনে একটা ছোট বোর্ডে শুধু "ফাতিমা আল-ফিহরির বর্তমান বাকি: ৫০০" লিখে ঝুলিয়ে রাখে — খাতা না খুলেই এক নজরে দেখা যায়। নতুন লেনদেন হলে বোর্ডের সংখ্যাটা সে আপডেট করে দেয়, কিন্তু আসল সত্য থাকে খাতাতেই।

ইবনে সিনার খাতার প্রতিটা লাইনই হলো একটা **event**, আর কেবল যোগ করা যায় কাটা যায় না বলে এটা immutable log — ঠিক **event sourcing**-এর মূল কথা। সব লাইন যোগ করে আজকের বাকি বের করাটাই **replay** করে state আবার গড়ে তোলা, আর সামনের বোর্ডটা হলো **read model** যা দ্রুত পড়ার জন্য আলাদা রাখা — এটাই **CQRS**, যেখানে লেখা (খাতায় নতুন লাইন যোগ) আর পড়া (বোর্ড দেখা) আলাদা। বাস্তবে banking সিস্টেম আর audit log ঠিক এভাবেই কাজ করে — প্রতিটা transaction চিরস্থায়ীভাবে জমা থাকে, যেকোনো সময়ের অবস্থা replay করে বের করা যায়, আর নিয়ন্ত্রকদের কাছে সম্পূর্ণ হিসাব দেওয়া যায়।

## Event Sourcing কী?

কোনো entity-র (যেমন একটি order) বর্তমান state store করার বদলে, আপনি সেই state-এ পৌঁছানোর জন্য যে event-গুলোর ক্রম ঘটেছে সেগুলো store করেন। একটি order কেবল "status: shipped" নয় — এটি একটি history: `OrderPlaced -> PaymentReceived -> OrderShipped`।

এটি আপনাকে দেয় একটি সম্পূর্ণ audit trail, event replay করে state পুনরায় গড়ে তোলার ক্ষমতা, এবং আপনার data সম্পর্কে এমন প্রশ্নের উত্তর দেওয়ার ক্ষমতা যা schema ডিজাইন করার সময় আপনি ভাবেনওনি।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটি ট্রেন স্টেশনের announcement সিস্টেমের মতো — একটি ট্রেন এলে (event), একাধিক listener react করে: যাত্রীরা ওঠে, দোকানিরা প্রস্তুতি নেয়, ক্লিনাররা কাজ শুরু করে।

</Callout>

## CQRS কী?

**Command Query Responsibility Segregation** read আর write আলাদা করে দেয়। Command (write) event store দিয়ে যায়। Query (read) materialized **projection** দিয়ে যায় — নির্দিষ্ট read pattern-এর জন্য optimized, আগে থেকে হিসাব করা view।

<Mermaid
title="Event Sourcing + CQRS Architecture"
code={`graph TD
  C["Client"] --> CH["Command Handler<br/>Validate & Emit Events"] --> ES["Event Store<br/>Append-only log"]
  ES --> EB["Event Bus"]
  EB --> P1["Orders Projection"]
  EB --> P2["Analytics Projection"]
  P1 --> Q["Query API<br/>Read Model"]
  P2 --> Q`}
/>

## সম্পূর্ণ Event Sourcing সিস্টেম

<CodeTabs tsFile="eventsourcing.ts" goFile="eventsourcing.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// --- Domain Events ---
interface BaseEvent {
	id: string;
	aggregateId: string;
	type: string;
	data: unknown;
	metadata: {
		userId: string;
		timestamp: string;
		version: number;
		correlationId: string;
	};
}

interface OrderPlaced extends BaseEvent {
	type: 'OrderPlaced';
	data: { customerId: string; items: OrderItem[]; totalAmount: number };
}

interface PaymentReceived extends BaseEvent {
	type: 'PaymentReceived';
	data: { paymentId: string; amount: number; method: string };
}

interface OrderShipped extends BaseEvent {
	type: 'OrderShipped';
	data: { trackingNumber: string; carrier: string; estimatedDelivery: string };
}

interface OrderCancelled extends BaseEvent {
	type: 'OrderCancelled';
	data: { reason: string; refundAmount: number };
}

type OrderEvent = OrderPlaced | PaymentReceived | OrderShipped | OrderCancelled;

interface OrderItem {
	productId: string;
	name: string;
	quantity: number;
	price: number;
}

// --- Event Store (append-only) ---
class EventStore {
	private events: BaseEvent[] = [];
	private subscribers: ((event: BaseEvent) => void)[] = [];

	async append(event: BaseEvent): Promise<void> {
		// In production: INSERT INTO events with optimistic concurrency control
		// Check that the expected version matches
		const existing = this.events.filter((e) => e.aggregateId === event.aggregateId);

		if (event.metadata.version !== existing.length + 1) {
			throw new Error(
				`Concurrency conflict: expected version ${existing.length + 1}, got ${event.metadata.version}`
			);
		}

		this.events.push(event);

		// Notify subscribers (projections)
		for (const sub of this.subscribers) {
			sub(event);
		}
	}

	async getEvents(aggregateId: string): Promise<BaseEvent[]> {
		return this.events
			.filter((e) => e.aggregateId === aggregateId)
			.sort((a, b) => a.metadata.version - b.metadata.version);
	}

	async getAllEvents(fromVersion?: number): Promise<BaseEvent[]> {
		if (fromVersion) {
			return this.events.slice(fromVersion);
		}
		return [...this.events];
	}

	subscribe(handler: (event: BaseEvent) => void): void {
		this.subscribers.push(handler);
	}
}

// --- Order Aggregate ---
interface OrderState {
	id: string;
	status: 'pending' | 'paid' | 'shipped' | 'cancelled';
	customerId: string;
	items: OrderItem[];
	totalAmount: number;
	paymentId?: string;
	trackingNumber?: string;
	version: number;
}

class OrderAggregate {
	private state: OrderState;

	constructor(id: string) {
		this.state = {
			id,
			status: 'pending',
			customerId: '',
			items: [],
			totalAmount: 0,
			version: 0
		};
	}

	// Rebuild state from events
	static fromEvents(events: BaseEvent[]): OrderAggregate {
		if (events.length === 0) throw new Error('No events found');
		const order = new OrderAggregate(events[0].aggregateId);
		for (const event of events) {
			order.apply(event as OrderEvent);
		}
		return order;
	}

	// Apply an event to update state (no side effects)
	private apply(event: OrderEvent): void {
		switch (event.type) {
			case 'OrderPlaced':
				this.state.customerId = event.data.customerId;
				this.state.items = event.data.items;
				this.state.totalAmount = event.data.totalAmount;
				this.state.status = 'pending';
				break;
			case 'PaymentReceived':
				this.state.paymentId = event.data.paymentId;
				this.state.status = 'paid';
				break;
			case 'OrderShipped':
				this.state.trackingNumber = event.data.trackingNumber;
				this.state.status = 'shipped';
				break;
			case 'OrderCancelled':
				this.state.status = 'cancelled';
				break;
		}
		this.state.version = event.metadata.version;
	}

	getState(): OrderState {
		return { ...this.state };
	}
}

// --- Command Handlers ---
class OrderCommandHandler {
	constructor(private eventStore: EventStore) {}

	async placeOrder(command: {
		orderId: string;
		customerId: string;
		items: OrderItem[];
		userId: string;
		correlationId: string;
	}): Promise<void> {
		const totalAmount = command.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

		// Validate
		if (command.items.length === 0) {
			throw new Error('Order must have at least one item');
		}
		if (totalAmount <= 0) {
			throw new Error('Order total must be positive');
		}

		const event: OrderPlaced = {
			id: crypto.randomUUID(),
			aggregateId: command.orderId,
			type: 'OrderPlaced',
			data: {
				customerId: command.customerId,
				items: command.items,
				totalAmount
			},
			metadata: {
				userId: command.userId,
				timestamp: new Date().toISOString(),
				version: 1,
				correlationId: command.correlationId
			}
		};

		await this.eventStore.append(event);
	}

	async receivePayment(command: {
		orderId: string;
		paymentId: string;
		amount: number;
		method: string;
		userId: string;
		correlationId: string;
	}): Promise<void> {
		// Load current state from events
		const events = await this.eventStore.getEvents(command.orderId);
		const order = OrderAggregate.fromEvents(events);
		const state = order.getState();

		// Business rules
		if (state.status !== 'pending') {
			throw new Error(`Cannot pay for order in status: ${state.status}`);
		}
		if (command.amount !== state.totalAmount) {
			throw new Error(
				`Payment amount ${command.amount} doesn't match order total ${state.totalAmount}`
			);
		}

		const event: PaymentReceived = {
			id: crypto.randomUUID(),
			aggregateId: command.orderId,
			type: 'PaymentReceived',
			data: {
				paymentId: command.paymentId,
				amount: command.amount,
				method: command.method
			},
			metadata: {
				userId: command.userId,
				timestamp: new Date().toISOString(),
				version: state.version + 1,
				correlationId: command.correlationId
			}
		};

		await this.eventStore.append(event);
	}

	async shipOrder(command: {
		orderId: string;
		trackingNumber: string;
		carrier: string;
		estimatedDelivery: string;
		userId: string;
		correlationId: string;
	}): Promise<void> {
		const events = await this.eventStore.getEvents(command.orderId);
		const order = OrderAggregate.fromEvents(events);
		const state = order.getState();

		if (state.status !== 'paid') {
			throw new Error(`Cannot ship order in status: ${state.status}`);
		}

		const event: OrderShipped = {
			id: crypto.randomUUID(),
			aggregateId: command.orderId,
			type: 'OrderShipped',
			data: {
				trackingNumber: command.trackingNumber,
				carrier: command.carrier,
				estimatedDelivery: command.estimatedDelivery
			},
			metadata: {
				userId: command.userId,
				timestamp: new Date().toISOString(),
				version: state.version + 1,
				correlationId: command.correlationId
			}
		};

		await this.eventStore.append(event);
	}
}

// --- Read Model Projection ---
interface OrderView {
	id: string;
	customerId: string;
	status: string;
	totalAmount: number;
	itemCount: number;
	trackingNumber?: string;
	lastUpdated: string;
}

class OrderProjection {
	private orders = new Map<string, OrderView>();

	constructor(eventStore: EventStore) {
		// Subscribe to real-time events
		eventStore.subscribe((event) => this.handleEvent(event as OrderEvent));
	}

	private handleEvent(event: OrderEvent): void {
		switch (event.type) {
			case 'OrderPlaced':
				this.orders.set(event.aggregateId, {
					id: event.aggregateId,
					customerId: event.data.customerId,
					status: 'pending',
					totalAmount: event.data.totalAmount,
					itemCount: event.data.items.length,
					lastUpdated: event.metadata.timestamp
				});
				break;
			case 'PaymentReceived': {
				const order = this.orders.get(event.aggregateId);
				if (order) {
					order.status = 'paid';
					order.lastUpdated = event.metadata.timestamp;
				}
				break;
			}
			case 'OrderShipped': {
				const order = this.orders.get(event.aggregateId);
				if (order) {
					order.status = 'shipped';
					order.trackingNumber = event.data.trackingNumber;
					order.lastUpdated = event.metadata.timestamp;
				}
				break;
			}
			case 'OrderCancelled': {
				const order = this.orders.get(event.aggregateId);
				if (order) {
					order.status = 'cancelled';
					order.lastUpdated = event.metadata.timestamp;
				}
				break;
			}
		}
	}

	// Rebuild projection from all events (for recovery or new projections)
	async rebuild(eventStore: EventStore): Promise<void> {
		this.orders.clear();
		const allEvents = await eventStore.getAllEvents();
		for (const event of allEvents) {
			this.handleEvent(event as OrderEvent);
		}
	}

	// Query methods
	getOrder(id: string): OrderView | undefined {
		return this.orders.get(id);
	}

	getOrdersByCustomer(customerId: string): OrderView[] {
		return Array.from(this.orders.values()).filter((o) => o.customerId === customerId);
	}

	getOrdersByStatus(status: string): OrderView[] {
		return Array.from(this.orders.values()).filter((o) => o.status === status);
	}
}

// --- Demo ---
async function main() {
	const store = new EventStore();
	const commands = new OrderCommandHandler(store);
	const projection = new OrderProjection(store);

	const orderId = 'order-001';
	const corrId = crypto.randomUUID();

	// Place order
	await commands.placeOrder({
		orderId,
		customerId: 'cust-1',
		items: [
			{ productId: 'p1', name: 'Widget', quantity: 2, price: 29.99 },
			{ productId: 'p2', name: 'Gadget', quantity: 1, price: 49.99 }
		],
		userId: 'admin',
		correlationId: corrId
	});

	// Receive payment
	await commands.receivePayment({
		orderId,
		paymentId: 'pay-001',
		amount: 109.97,
		method: 'credit_card',
		userId: 'admin',
		correlationId: corrId
	});

	// Ship order
	await commands.shipOrder({
		orderId,
		trackingNumber: '1Z999AA10123456784',
		carrier: 'UPS',
		estimatedDelivery: '2025-01-15',
		userId: 'admin',
		correlationId: corrId
	});

	// Query projection
	console.log('Order view:', projection.getOrder(orderId));

	// View full event history
	const events = await store.getEvents(orderId);
	console.log(
		'Event history:',
		events.map((e) => e.type)
	);
}

main().catch(console.error);
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
)

// --- Domain Events ---
type Event struct {
	ID          string      `json:"id"`
	AggregateID string      `json:"aggregateId"`
	Type        string      `json:"type"`
	Data        interface{} `json:"data"`
	Metadata    Metadata    `json:"metadata"`
}

type Metadata struct {
	UserID        string `json:"userId"`
	Timestamp     string `json:"timestamp"`
	Version       int    `json:"version"`
	CorrelationID string `json:"correlationId"`
}

type OrderPlacedData struct {
	CustomerID  string      `json:"customerId"`
	Items       []OrderItem `json:"items"`
	TotalAmount float64     `json:"totalAmount"`
}

type PaymentReceivedData struct {
	PaymentID string  `json:"paymentId"`
	Amount    float64 `json:"amount"`
	Method    string  `json:"method"`
}

type OrderShippedData struct {
	TrackingNumber    string `json:"trackingNumber"`
	Carrier           string `json:"carrier"`
	EstimatedDelivery string `json:"estimatedDelivery"`
}

type OrderItem struct {
	ProductID string  `json:"productId"`
	Name      string  `json:"name"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price"`
}

// --- Event Store ---
type EventStore struct {
	mu          sync.RWMutex
	events      []Event
	subscribers []func(Event)
}

func (s *EventStore) Append(event Event) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Optimistic concurrency check
	var count int
	for _, e := range s.events {
		if e.AggregateID == event.AggregateID {
			count++
		}
	}
	if event.Metadata.Version != count+1 {
		return fmt.Errorf("concurrency conflict: expected version %d, got %d",
			count+1, event.Metadata.Version)
	}

	s.events = append(s.events, event)

	for _, sub := range s.subscribers {
		sub(event)
	}
	return nil
}

func (s *EventStore) GetEvents(aggregateID string) []Event {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []Event
	for _, e := range s.events {
		if e.AggregateID == aggregateID {
			result = append(result, e)
		}
	}
	return result
}

func (s *EventStore) Subscribe(handler func(Event)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.subscribers = append(s.subscribers, handler)
}

// --- Order Aggregate ---
type OrderState struct {
	ID             string
	Status         string
	CustomerID     string
	Items          []OrderItem
	TotalAmount    float64
	PaymentID      string
	TrackingNumber string
	Version        int
}

func RebuildOrder(events []Event) (*OrderState, error) {
	if len(events) == 0 {
		return nil, fmt.Errorf("no events found")
	}

	state := &OrderState{ID: events[0].AggregateID}
	for _, event := range events {
		switch event.Type {
		case "OrderPlaced":
			data := event.Data.(OrderPlacedData)
			state.CustomerID = data.CustomerID
			state.Items = data.Items
			state.TotalAmount = data.TotalAmount
			state.Status = "pending"
		case "PaymentReceived":
			data := event.Data.(PaymentReceivedData)
			state.PaymentID = data.PaymentID
			state.Status = "paid"
		case "OrderShipped":
			data := event.Data.(OrderShippedData)
			state.TrackingNumber = data.TrackingNumber
			state.Status = "shipped"
		case "OrderCancelled":
			state.Status = "cancelled"
		}
		state.Version = event.Metadata.Version
	}
	return state, nil
}

// --- Command Handler ---
type OrderCommands struct {
	store *EventStore
}

func (c *OrderCommands) PlaceOrder(orderID, customerID, userID, corrID string, items []OrderItem) error {
	if len(items) == 0 {
		return fmt.Errorf("order must have at least one item")
	}

	var total float64
	for _, item := range items {
		total += item.Price * float64(item.Quantity)
	}

	return c.store.Append(Event{
		ID: uuid.New().String(), AggregateID: orderID,
		Type: "OrderPlaced",
		Data: OrderPlacedData{CustomerID: customerID, Items: items, TotalAmount: total},
		Metadata: Metadata{UserID: userID, Timestamp: time.Now().Format(time.RFC3339),
			Version: 1, CorrelationID: corrID},
	})
}

func (c *OrderCommands) ReceivePayment(orderID, paymentID, userID, corrID string, amount float64, method string) error {
	events := c.store.GetEvents(orderID)
	state, err := RebuildOrder(events)
	if err != nil {
		return err
	}

	if state.Status != "pending" {
		return fmt.Errorf("cannot pay for order in status: %s", state.Status)
	}
	if amount != state.TotalAmount {
		return fmt.Errorf("payment %f doesn't match total %f", amount, state.TotalAmount)
	}

	return c.store.Append(Event{
		ID: uuid.New().String(), AggregateID: orderID,
		Type: "PaymentReceived",
		Data: PaymentReceivedData{PaymentID: paymentID, Amount: amount, Method: method},
		Metadata: Metadata{UserID: userID, Timestamp: time.Now().Format(time.RFC3339),
			Version: state.Version + 1, CorrelationID: corrID},
	})
}

func (c *OrderCommands) ShipOrder(orderID, tracking, carrier, delivery, userID, corrID string) error {
	events := c.store.GetEvents(orderID)
	state, err := RebuildOrder(events)
	if err != nil {
		return err
	}

	if state.Status != "paid" {
		return fmt.Errorf("cannot ship order in status: %s", state.Status)
	}

	return c.store.Append(Event{
		ID: uuid.New().String(), AggregateID: orderID,
		Type: "OrderShipped",
		Data: OrderShippedData{TrackingNumber: tracking, Carrier: carrier, EstimatedDelivery: delivery},
		Metadata: Metadata{UserID: userID, Timestamp: time.Now().Format(time.RFC3339),
			Version: state.Version + 1, CorrelationID: corrID},
	})
}

// --- Projection ---
type OrderView struct {
	ID             string  `json:"id"`
	CustomerID     string  `json:"customerId"`
	Status         string  `json:"status"`
	TotalAmount    float64 `json:"totalAmount"`
	ItemCount      int     `json:"itemCount"`
	TrackingNumber string  `json:"trackingNumber,omitempty"`
	LastUpdated    string  `json:"lastUpdated"`
}

type OrderProjection struct {
	mu     sync.RWMutex
	orders map[string]*OrderView
}

func NewOrderProjection(store *EventStore) *OrderProjection {
	p := &OrderProjection{orders: make(map[string]*OrderView)}
	store.Subscribe(p.handleEvent)
	return p
}

func (p *OrderProjection) handleEvent(event Event) {
	p.mu.Lock()
	defer p.mu.Unlock()

	switch event.Type {
	case "OrderPlaced":
		data := event.Data.(OrderPlacedData)
		p.orders[event.AggregateID] = &OrderView{
			ID: event.AggregateID, CustomerID: data.CustomerID,
			Status: "pending", TotalAmount: data.TotalAmount,
			ItemCount: len(data.Items), LastUpdated: event.Metadata.Timestamp,
		}
	case "PaymentReceived":
		if o := p.orders[event.AggregateID]; o != nil {
			o.Status = "paid"
			o.LastUpdated = event.Metadata.Timestamp
		}
	case "OrderShipped":
		data := event.Data.(OrderShippedData)
		if o := p.orders[event.AggregateID]; o != nil {
			o.Status = "shipped"
			o.TrackingNumber = data.TrackingNumber
			o.LastUpdated = event.Metadata.Timestamp
		}
	}
}

func (p *OrderProjection) GetOrder(id string) *OrderView {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.orders[id]
}

func main() {
	store := &EventStore{}
	commands := &OrderCommands{store: store}
	projection := NewOrderProjection(store)

	orderID := "order-001"
	corrID := uuid.New().String()

	commands.PlaceOrder(orderID, "cust-1", "admin", corrID, []OrderItem{
		{ProductID: "p1", Name: "Widget", Quantity: 2, Price: 29.99},
		{ProductID: "p2", Name: "Gadget", Quantity: 1, Price: 49.99},
	})

	commands.ReceivePayment(orderID, "pay-001", "admin", corrID, 109.97, "credit_card")
	commands.ShipOrder(orderID, "1Z999AA10123456784", "UPS", "2025-01-15", "admin", corrID)

	view := projection.GetOrder(orderID)
	log.Printf("Order: %+v", view)

	events := store.GetEvents(orderID)
	for _, e := range events {
		log.Printf("Event: %s (v%d)", e.Type, e.Metadata.Version)
	}
}
```

</div>
</CodeTabs>

<div class="takeaways">

### মূল কথা

- Event হলো immutable fact — এগুলো কখনো update বা delete করবেন না, শুধু নতুন event append করবেন
- Event store হলো single source of truth; projection derived এবং এগুলো আবার rebuild করা যায়
- **Optimistic concurrency control** (version check) conflicting write আটকায়
- Projection মুছে ফেলে event থেকে আবার গড়ে তোলা যায় — এতে পুরনো data-তে নতুন read model যোগ করা সম্ভব হয়
- Correlation ID debugging আর tracing-এর জন্য aggregate-জুড়ে সম্পর্কিত event-গুলো সংযুক্ত করে

</div>

<div class="when-to-use">

### বাস্তব ব্যবহার

- **Banking সিস্টেম** event sourcing ব্যবহার করে কারণ regulator-রা প্রতিটি transaction-এর সম্পূর্ণ audit trail দাবি করে
- **Walmart** তাদের inventory management-এ event sourcing ব্যবহার করে প্রতিটি stock movement track করতে
- **LinkedIn** তাদের activity feed-এ event sourcing ব্যবহার করে — প্রতিটি action একটি event যা বিভিন্ন view-তে project করা হয়
- Event sourcing ব্যবহার করুন যখন আপনার audit trail দরকার, temporal query দরকার ("বিকেল ৩টায় state কী ছিল?"), অথবা বিদ্যমান data-তে নতুন read model যোগ করার ক্ষমতা দরকার

</div>
