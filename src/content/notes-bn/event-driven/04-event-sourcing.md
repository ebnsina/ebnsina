---
title: 'Event Sourcing'
subtitle: 'Current state-এর বদলে events-কে প্রধান রেকর্ড হিসেবে store করুন — event log আবার replay করে যেকোনো অতীত state ফিরে গড়ুন।'
chapter: 4
level: 'advanced'
readingTime: '12 মিনিট'
topics: ['event sourcing', 'event store', 'aggregates', 'projections', 'snapshots']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা bank account statement: আপনার ব্যাংক আপনার current balance store করে ইতিহাস মুছে ফেলে না। এটা প্রতিটি transaction store করে — deposit, withdrawal, fee — আর আপনার current balance এদের যোগফল থেকে বের করা হয়। প্রতিটি অতীত state পুনরুদ্ধারযোগ্য। কোনো বিরোধ হলে, ঠিক কী ঘটেছিল আর কখন ঘটেছিল তা আপনি হুবহু replay করতে পারেন।

</Callout>

## গল্পে বুঝি

স্টেডিয়ামের এক কোণে বসে আছেন স্কোরার ফাতিমা আল-ফিহরি। তার হাতে একটা মোটা স্কোরবুক। ম্যাচ শুরু হতেই তিনি শুধু "স্কোর ১২০" লিখে রাখেন না — তিনি প্রতিটা বল যেভাবে হয়েছে হুবহু সেভাবে লিখে যান: "১ম বল — ৪ রান; ২য় বল — উইকেট; ৩য় বল — ১ রান; ৪র্থ বল — ওয়াইড, ১ রান..."। কোনো বলই বাদ যায় না, আর একবার লেখা কোনো লাইন তিনি কখনো মোছেন না বা বদলান না — নতুন বল হলে শুধু নিচে নতুন লাইন যোগ হয়।

এখন কেউ যদি জিজ্ঞেস করে "এই মুহূর্তে স্কোর কত?" বা "ইবনে সিনার ব্যক্তিগত রান কত?" বা "রান-রেট কত?" — ফাতিমা আলাদা করে এসব কোথাও লিখে রাখেননি। তিনি শুরু থেকে বলগুলো একটার পর একটা যোগ করে বের করে ফেলেন। আম্পায়ার যদি হঠাৎ প্রশ্ন তোলেন "১৫তম ওভার শেষে ঠিক কী অবস্থা ছিল?" — ফাতিমা প্রথম বল থেকে ওই বল পর্যন্ত আবার পড়ে গিয়ে সেই মুহূর্তের হুবহু অবস্থা ফিরে গড়তে পারেন। প্রতিটা রান কোথা থেকে এলো, তার পুরো হিসাব মেলানো যায়।

এই স্কোরবুকটাই আসলে **event sourcing**। প্রতিটা বল আলাদা করে ক্রমে লিখে রাখা, আর কখনো না মোছা — এটাই **append-only log**, আর সেটাই একমাত্র সত্য উৎস (source of truth)। শুধু সর্বশেষ স্কোরটা না লিখে প্রতিটা ডেলিভারি লেখা মানে current state কখনো সরাসরি store করা হয় না — বরং শুরু থেকে বল **replay** করে current state বের করা হয়। আর যেকোনো অতীত মুহূর্ত হুবহু ফিরে গড়তে পারা, প্রতিটা রানের হিসাব মেলাতে পারা — এটাই time-travel আর পূর্ণ **audit** trail। বাস্তবে financial ledger, order-processing বা ব্যাংকিং সিস্টেমে ঠিক এভাবেই প্রতিটা event জমিয়ে রাখা হয়, যাতে পরে যেকোনো বিরোধে ঠিক কী কখন ঘটেছিল তা replay করে দেখা যায়।

## মূল ধারণা

প্রথাগত persistence current state store করে — database-এ একটা row যেখানে সর্বশেষ value থাকে। আপনি যখন row-টা update করেন, আগের state হারিয়ে যায়।

Event sourcing সেই events-এর ক্রম store করে যা current state-এ পৌঁছে দিয়েছিল। Current state events আবার replay করে বের করা হয়।

```typescript
// Traditional: store current state
// orders table: { id, status, totalAmount, updatedAt }
// UPDATE orders SET status = 'shipped' WHERE id = 123;
// ← previous 'pending' status is gone

// Event sourcing: store events
// order_events: append-only log
[
  { type: 'OrderPlaced',   orderId: 123, items: [...], totalAmount: 9999, at: T1 },
  { type: 'PaymentTaken',  orderId: 123, amount: 9999,                    at: T2 },
  { type: 'OrderShipped',  orderId: 123, trackingId: 'UPS-456',           at: T3 },
]
// Current state is derived by replaying these three events
```

## Aggregate ও Event Application

একটা **aggregate** হলো সেই domain object যে event stream-টার মালিক। এর current state প্রতিটি event ক্রমে apply করে আবার গড়া হয়।

```typescript
interface OrderEvent {
	type: string;
	orderId: string;
	at: string;
}

interface OrderPlaced extends OrderEvent {
	type: 'OrderPlaced';
	userId: string;
	items: OrderItem[];
	totalAmount: number;
}

interface OrderShipped extends OrderEvent {
	type: 'OrderShipped';
	trackingId: string;
	carrier: string;
}

interface OrderCancelled extends OrderEvent {
	type: 'OrderCancelled';
	reason: string;
}

// The aggregate: rebuilt from events
class Order {
	id!: string;
	userId!: string;
	status!: 'placed' | 'paid' | 'shipped' | 'cancelled';
	totalAmount!: number;
	trackingId?: string;

	// Rebuild state by applying events in order
	static fromEvents(events: OrderEvent[]): Order {
		const order = new Order();
		for (const event of events) {
			order.apply(event);
		}
		return order;
	}

	private apply(event: OrderEvent): void {
		switch (event.type) {
			case 'OrderPlaced': {
				const e = event as OrderPlaced;
				this.id = e.orderId;
				this.userId = e.userId;
				this.status = 'placed';
				this.totalAmount = e.totalAmount;
				break;
			}
			case 'OrderShipped': {
				const e = event as OrderShipped;
				this.status = 'shipped';
				this.trackingId = e.trackingId;
				break;
			}
			case 'OrderCancelled': {
				this.status = 'cancelled';
				break;
			}
		}
	}
}
```

## Event Store

Events-এর জন্য একটা append-only store। প্রতিটি aggregate-এর নিজস্ব stream আছে যা aggregate type + ID দিয়ে চিহ্নিত।

```typescript
interface StoredEvent {
	id: string;
	streamId: string; // e.g. 'Order-123'
	type: string;
	version: number; // position within the stream (1, 2, 3...)
	data: Record<string, unknown>;
	metadata: Record<string, unknown>;
	createdAt: Date;
}

class EventStore {
	// Append events to a stream
	async append(
		streamId: string,
		events: Omit<StoredEvent, 'id' | 'streamId' | 'version' | 'createdAt'>[],
		expectedVersion: number // optimistic concurrency control
	): Promise<void> {
		await db.transaction(async (tx) => {
			// Check for concurrent writes (optimistic lock)
			const currentVersion = await tx.events.maxVersion(streamId);
			if (currentVersion !== expectedVersion) {
				throw new ConcurrencyError(
					`Stream ${streamId} at version ${currentVersion}, expected ${expectedVersion}`
				);
			}

			const stored = events.map((e, i) => ({
				...e,
				id: crypto.randomUUID(),
				streamId,
				version: expectedVersion + i + 1,
				createdAt: new Date()
			}));

			await tx.events.insertMany(stored);
		});
	}

	// Load all events for a stream
	async load(streamId: string, fromVersion = 0): Promise<StoredEvent[]> {
		return db.events.findAll({
			where: { streamId, version: { gte: fromVersion } },
			orderBy: { version: 'asc' }
		});
	}
}
```

**PostgreSQL event store table:**

```sql
CREATE TABLE events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id   TEXT NOT NULL,                          -- 'Order-123'
  type        TEXT NOT NULL,                          -- 'OrderPlaced'
  version     INT NOT NULL,                           -- sequence within stream
  data        JSONB NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (stream_id, version)                         -- optimistic concurrency
);

CREATE INDEX ON events (stream_id, version);
CREATE INDEX ON events (created_at);                  -- for projections catching up
```

## Optimistic Concurrency

দুটো request একই aggregate একসাথে পাল্টানোর চেষ্টা করে। Optimistic concurrency দ্বিতীয় write-কে প্রথমটাকে overwrite করা থেকে আটকায়:

```typescript
class OrderService {
	async shipOrder(orderId: string, trackingId: string): Promise<void> {
		// Load current events
		const events = await eventStore.load(`Order-${orderId}`);
		const order = Order.fromEvents(events);
		const expectedVersion = events.length; // version after last event

		if (order.status !== 'paid') {
			throw new Error('Cannot ship unpaid order');
		}

		const newEvent = {
			type: 'OrderShipped',
			data: { orderId, trackingId, at: new Date().toISOString() },
			metadata: {}
		};

		// If another request appended an event between our load and this append,
		// the version check fails and we retry
		await eventStore.append(`Order-${orderId}`, [newEvent], expectedVersion);
	}
}
```

## Projections

একটা projection হলো একটা read model যা event stream consume করে তৈরি হয়। একই event ইতিহাস থেকে ভিন্ন projection ভিন্ন প্রশ্নের উত্তর দেয়।

```typescript
class OrderSummaryProjection {
	// Called for each event in order as they arrive
	async handle(event: StoredEvent): Promise<void> {
		switch (event.type) {
			case 'OrderPlaced':
				await db.orderSummaries.insert({
					id: event.data.orderId,
					userId: event.data.userId,
					status: 'placed',
					totalAmount: event.data.totalAmount,
					placedAt: event.data.at
				});
				break;

			case 'OrderShipped':
				await db.orderSummaries.update(event.data.orderId, {
					status: 'shipped',
					trackingId: event.data.trackingId,
					shippedAt: event.data.at
				});
				break;

			case 'OrderCancelled':
				await db.orderSummaries.update(event.data.orderId, {
					status: 'cancelled',
					cancelledAt: event.data.at
				});
				break;
		}
	}
}

// Rebuild projection from scratch (when you add new fields or fix a bug)
async function rebuildOrderSummaries(): Promise<void> {
	await db.orderSummaries.truncate();

	const allEvents = await db.events.findAll({
		where: { type: { in: ['OrderPlaced', 'OrderShipped', 'OrderCancelled'] } },
		orderBy: { createdAt: 'asc' }
	});

	const projection = new OrderSummaryProjection();
	for (const event of allEvents) {
		await projection.handle(event);
	}
}
```

**মূল সুবিধা:** আপনি ইতিহাস replay করে পিছিয়ে গিয়ে নতুন projection তৈরি করতে পারেন। নতুন একটা analytics দরকার হলো? বিদ্যমান events থেকে একটা নতুন projection গড়ুন — কোনো ডেটা হারায় না।

## Snapshots

একটা aggregate আবার গড়তে হাজার হাজার event load করা ধীর। Snapshot পর্যায়ক্রমে aggregate state-এর checkpoint নেয়:

```typescript
interface Snapshot {
	streamId: string;
	version: number; // event version this snapshot was taken at
	state: Record<string, unknown>;
	createdAt: Date;
}

class SnapshotStore {
	async save(streamId: string, version: number, state: unknown): Promise<void> {
		await db.snapshots.upsert({ streamId, version, state, createdAt: new Date() });
	}

	async load(streamId: string): Promise<Snapshot | null> {
		return db.snapshots.findLatest(streamId);
	}
}

// Load aggregate: snapshot + events since snapshot
async function loadOrder(orderId: string): Promise<Order> {
	const snapshot = await snapshotStore.load(`Order-${orderId}`);

	if (snapshot) {
		// Load only events after the snapshot
		const events = await eventStore.load(`Order-${orderId}`, snapshot.version + 1);
		const order = Order.fromSnapshot(snapshot.state);
		for (const event of events) order.apply(event);
		return order;
	}

	// No snapshot: load all events from beginning
	const events = await eventStore.load(`Order-${orderId}`);
	return Order.fromEvents(events);
}

// Take snapshot every 50 events
async function maybeSnapshot(orderId: string, currentVersion: number): Promise<void> {
	if (currentVersion % 50 === 0) {
		const order = await loadOrder(orderId);
		await snapshotStore.save(`Order-${orderId}`, currentVersion, order.toSnapshot());
	}
}
```

## কখন Event Sourcing ব্যবহার করবেন

Event sourcing সত্যিকারের জটিলতা যোগ করে। এটা ব্যবহার করুন যখন:

- **Audit log বাধ্যতামূলক** — financial সিস্টেম, healthcare, compliance
- **Business temporal query চায়** — "মঙ্গলবার এই order-এর state কী ছিল?"
- **একাধিক read model দরকার** — events একটা single source হিসেবে অনেক projection-কে খাওয়াচ্ছে
- **Production issue debug করা** — bug হুবহু reproduce করতে events replay করা

এটা ব্যবহার করবেন না:

- Audit-এর প্রয়োজন নেই এমন সাধারণ CRUD-এর জন্য
- প্যাটার্নটার অভিজ্ঞতা নেই এমন ছোট team-এর জন্য
- যেসব সিস্টেমে projection আবার গড়ার operational জটিলতা অনেক বেশি

Event sourcing স্বাভাবিকভাবেই CQRS আর pub/sub-এর সাথে জোড় বাঁধে: events event store-এ store করা হয়, একটা bus-এ publish করা হয়, আর projection builder-রা consume করে — সবই consistent, সবই একটা write থেকে।
