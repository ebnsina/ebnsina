---
title: 'Events vs Commands vs Queries'
subtitle: 'ভিন্ন semantics-সহ তিন ধরনের আলাদা message — এই পার্থক্য বোঝাটাই ঠিক করে দেয় আপনি প্রতিটি integration কীভাবে design করবেন।'
chapter: 1
level: 'beginner'
readingTime: '8 মিনিট'
topics: ['events', 'commands', 'queries', 'CQRS', 'message semantics']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন সহকর্মীকে কিছু জানানোর তিনটা আলাদা উপায়: "রিপোর্টটা পাঠিয়ে দিন" হলো একটা command — নির্দিষ্ট কারও দিকে লক্ষ্য করা, কাজের প্রত্যাশা রাখে। "রিপোর্টটা পাঠানো হয়েছে" হলো একটা event — একটা ঘটে যাওয়া তথ্য, যাকে যার দরকার তার কাছে broadcast করা। "আপনি কি রিপোর্টটা পাঠিয়েছেন?" হলো একটা query — তথ্যসহ একটা উত্তর প্রত্যাশা করে। কোডে এগুলো গুলিয়ে ফেললে ঠিক ততটাই বিভ্রান্তি তৈরি হয় যতটা কথোপকথনে হতো।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরির রেস্টুরেন্টের ফ্লোরে দুপুরের ভিড়। ওয়েটার ইবনে সিনা একটা অর্ডার টিকিট রান্নাঘরে ধরিয়ে দিলেন — "একটা বিরিয়ানি বানাও।" এটা নির্দিষ্ট একজনের কাজ; রাঁধুনি আল-খোয়ারিজমি এটা রান্না করবেন। চাল ফুরিয়ে গেলে তিনি টিকিটটা ফেরতও পাঠাতে পারেন — "আজ আর বিরিয়ানি হবে না।" মানে এই নির্দেশটা প্রত্যাখ্যানও হতে পারে।

কিছুক্ষণ পর কেউ একজন হাঁক দিলেন — "টেবিল ৫ খাওয়া শেষ করেছে!" এটা কাউকে নির্দিষ্ট করে বলা হয়নি, শুধু একটা ঘটে যাওয়া তথ্য ঘোষণা করা হলো। আর একই হাঁক শুনে কয়েকজন নিজের মতো করে সাড়া দিলেন — ইবনে সিনা গিয়ে টেবিল পরিষ্কার করলেন, ক্যাশিয়ার বিল তৈরি করলেন, আর হোস্ট পরের অতিথিকে বসতে দিলেন। এদিকে ম্যানেজার শুধু জানতে চাইলেন — "আর কয়টা বিরিয়ানি বাকি আছে?" এই প্রশ্নে কিছুই বদলায় না, শুধু একটা তথ্য জানা হয়।

এখানেই তিনটা জিনিস আলাদা হয়ে যায়। অর্ডার টিকিট "বিরিয়ানি বানাও" হলো একটা **command** — নির্দিষ্ট একজন handler-এর দিকে লক্ষ্য করা একটা নির্দেশ, যা প্রয়োজনে প্রত্যাখ্যানও হতে পারে। "টেবিল ৫ খাওয়া শেষ করেছে!" হলো একটা **event** — অতীতে ঘটে যাওয়া একটা fact, যাতে অনেকজন স্বাধীনভাবে সাড়া দেয়, আর ঘোষণাকারী জানেও না কে কীভাবে react করবে। আর "আর কয়টা বাকি?" হলো একটা **query** — কেবল পড়া, কোনো কিছু পাল্টায় না। বাস্তবে event-driven সিস্টেমে ঠিক এই তিনটা message-এর semantics আলাদা রাখাটাই ঠিক করে দেয় আপনার service-গুলো কতটা coupled থাকবে আর failure-এ কী হবে।

## তিন ধরনের Message

**Commands:** কোনো service-কে কিছু করতে বলে। নির্দিষ্ট একজন প্রাপকের দিকে লক্ষ্য করা। প্রেরক জানতে চায় এটা সফল হলো কিনা।

```typescript
// Command: imperative verb, directed, expects handling
interface SendPasswordResetEmail {
	type: 'SendPasswordResetEmail';
	userId: string;
	email: string;
	resetToken: string;
}

interface ProcessPayment {
	type: 'ProcessPayment';
	orderId: string;
	amount: number;
	customerId: string;
}
```

**Events:** কিছু একটা ঘটেছে তা রেকর্ড করে। আগ্রহী যেকোনো পক্ষের কাছে broadcast করা হয়। প্রেরক জানে না বা পরোয়াও করে না কে এটা handle করবে।

```typescript
// Event: past tense, records a fact, no specific recipient
interface UserRegistered {
	type: 'UserRegistered';
	userId: string;
	email: string;
	plan: string;
	registeredAt: string; // ISO 8601
}

interface OrderPlaced {
	type: 'OrderPlaced';
	orderId: string;
	userId: string;
	totalAmount: number;
	items: OrderItem[];
	placedAt: string;
}
```

**Queries:** তথ্য চায়। একটা response প্রত্যাশা করে। সাধারণত synchronous (request/response)।

```typescript
// Query: asks a question, expects an answer
interface GetUserById {
	type: 'GetUserById';
	userId: string;
}

interface GetOrderHistory {
	type: 'GetOrderHistory';
	userId: string;
	fromDate: string;
	limit: number;
}
```

## পার্থক্যটা কেন গুরুত্বপূর্ণ

পার্থক্যটা শুধু naming convention নয় — এটা আপনার সিস্টেমের coupling, failure mode আর semantics পাল্টে দেয়।

**Commands coupling তৈরি করে:**

```
Service A → sends command → Service B
```

Service A, Service B সম্পর্কে জানে। B যদি down থাকে, command fail করবে। B-এর interface পাল্টালে A ভেঙে যাবে।

**Events decouple করে:**

```
Service A → emits event → Event Bus
                               ↓
                         Service B (subscribes)
                         Service C (subscribes)
                         Service D (subscribes)
```

Service A, B, C বা D সম্পর্কে কিছুই জানে না। A-কে না ছুঁয়েই নতুন subscriber যোগ করা যায়। B যদি down থাকে, event টা queue-তে অপেক্ষা করে; B ফিরে এলে সেটা process করে।

**অপারেশনাল ফলাফল:**

|             | Command                             | Event                                |
| ----------- | ----------------------------------- | ------------------------------------ |
| Coupling    | টাইট — প্রেরক প্রাপককে জানে         | লুজ — প্রেরক শুধু event-টাকে জানে    |
| Failure     | Synchronous — দুজনই একসাথে fail করে | Asynchronous — প্রেরক অপ্রভাবিত থাকে |
| Recipients  | একজন                                | অনেকজন                               |
| Expectation | সফল হতেই হবে                        | Fire and forget                      |
| Naming      | Imperative verb                     | Past tense                           |

## Event Naming Convention

Events হলো তথ্য — সেভাবেই এদের নাম দিন:

```typescript
// WRONG — sounds like a command, ambiguous
'ProcessOrder';
'UserUpdate';
'PaymentDone';

// RIGHT — past tense, specific, unambiguous
'OrderPlaced';
'UserEmailChanged';
'PaymentSucceeded';
'PaymentFailed';
'SubscriptionRenewed';
'InventoryDepleted';
```

একটা সহজ নিয়ম: যদি past tense ব্যবহার করতে না পারেন, তাহলে এটা সম্ভবত একটা command, event নয়।

## Event Envelope

প্রতিটি event-কে metadata-সহ একটা standard envelope-এ মুড়ে দিন:

```typescript
interface EventEnvelope<T = unknown> {
	// Routing and identification
	id: string; // unique event ID (for deduplication)
	type: string; // event type name
	version: number; // schema version (for evolution)

	// Context
	correlationId: string; // request that triggered this event (for tracing)
	causationId: string; // event that caused this event (for event chains)
	source: string; // service that emitted this event

	// Timing
	timestamp: string; // ISO 8601 UTC

	// Payload
	data: T;
}

// Example
const event: EventEnvelope<UserRegistered> = {
	id: crypto.randomUUID(),
	type: 'UserRegistered',
	version: 1,
	correlationId: 'req_abc123', // from the HTTP request that created the user
	causationId: '', // no parent event — triggered by user action
	source: 'user-service',
	timestamp: new Date().toISOString(),
	data: {
		type: 'UserRegistered',
		userId: 'u_xyz',
		email: 'user@example.com',
		plan: 'starter',
		registeredAt: new Date().toISOString()
	}
};
```

Envelope-টা যেকোনো consumer-কে বুঝতে দেয় একটা event কোথা থেকে এলো, কখন ঘটল, আর অন্য event-দের সাথে সম্পর্ক কী — payload parse না করেই।

## CQRS: Read আর Write আলাদা করা

Command Query Responsibility Segregation ডেটা লেখার model (command side) আর ডেটা পড়ার model (query side) আলাদা করে। Events দুটোর মধ্যে সেতু হয়।

```typescript
// Command side: handles writes, emits events
class OrderService {
	async placeOrder(command: PlaceOrderCommand): Promise<void> {
		// Validate and persist
		const order = await this.db.orders.create({
			userId: command.userId,
			items: command.items,
			status: 'placed'
		});

		// Emit event — read side will update its own model
		await this.eventBus.publish({
			type: 'OrderPlaced',
			data: {
				orderId: order.id,
				userId: order.userId,
				items: order.items,
				totalAmount: order.totalAmount,
				placedAt: order.createdAt
			}
		});
	}
}

// Query side: handles reads from a denormalized read model
class OrderQueryService {
	// Read model is updated by consuming 'OrderPlaced' events
	// Optimized for query patterns — might be in a different database
	async getOrderHistory(userId: string): Promise<OrderSummary[]> {
		return this.readDb.orderSummaries.findAll({ userId });
	}
}

// Event handler: keeps read model in sync
class OrderReadModelUpdater {
	async handleOrderPlaced(event: EventEnvelope<OrderPlaced>): Promise<void> {
		await this.readDb.orderSummaries.upsert({
			id: event.data.orderId,
			userId: event.data.userId,
			itemCount: event.data.items.length,
			totalAmount: event.data.totalAmount,
			status: 'placed',
			placedAt: event.data.placedAt
		});
	}
}
```

CQRS সবসময় দরকার হয় না — সাধারণ একটা CRUD app-এ এটা যোগ করবেন না। এটা তখনই কাজে দেয় যখন read আর write প্যাটার্ন সত্যিই আলাদা হয় (জটিল filtering-সহ বিশাল read volume, অথবা এমন write প্যাটার্ন যা অনেক downstream effect ট্রিগার করে)।

## কখন কোনটা ব্যবহার করবেন

**Commands ব্যবহার করুন যখন:**

- এগিয়ে যাওয়ার আগে জানতে হবে অপারেশনটা সফল হলো কিনা
- অপারেশনটা নির্দিষ্ট একটা service-এর দিকে লক্ষ্য করা
- প্রেরককে failure handle করতে হবে (retry, compensate)

**Events ব্যবহার করুন যখন:**

- কী ঘটল তা নিয়ে একাধিক service আগ্রহী
- প্রেরকের ফলাফল জানার দরকার নেই
- আপনি চান service-গুলো decouple থাকুক যাতে তারা স্বাধীনভাবে evolve করতে পারে
- কী ঘটল তার একটা audit trail দরকার

**Queries ব্যবহার করুন যখন:**

- আপনার current state দরকার
- response synchronously দরকার
- অপারেশনটা read-only (কোনো side effect নেই)

এগুলো ইচ্ছাকৃতভাবে মিশিয়ে ফেলা ঠিক আছে — একটা HTTP request (query) যা একটা command ট্রিগার করে যা একটা event emit করে, এটা একটা প্রচলিত ও সঠিক প্যাটার্ন। শুধু naming আর semantics পরিষ্কার হওয়া দরকার।
