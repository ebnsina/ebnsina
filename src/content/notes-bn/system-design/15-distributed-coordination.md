---
title: 'Distributed Coordination'
subtitle: 'Leader election, lease ও fencing token, distributed lock-এর ফাঁদ, Raft consensus, আর ঘড়ির উপর ভরসা না করে ঘটনার ক্রম ঠিক রাখা।'
chapter: 15
level: 'advanced'
readingTime: '২৬ মিনিট'
topics:
  [
    'coordination',
    'leader election',
    'lease',
    'fencing token',
    'raft',
    'consensus',
    'logical clocks'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা কারওয়ানসরাইয়ের গুদামে একটাই লোহার চাবি। কে সেই চাবি ধরবে, কতক্ষণ ধরবে, আর চাবি হারিয়ে গেলে কী হবে — এই তিনটা প্রশ্নের উত্তরই distributed coordination-এর পুরো বিষয়বস্তু।

</Callout>

## গল্পে বুঝি

সমরকন্দের বাইরে রেশমপথের ধারে একটা কারওয়ানসরাই। সেখানে একটা পাথরের গুদাম আছে যেখানে কাফেলাগুলো তাদের মালামাল রাখে। গুদামের দরজায় একটাই তালা, আর সেই তালার একটাই লোহার চাবি — সরাইয়ের কেয়ারটেকার ইবনে সিনার কাছে থাকে। নিয়ম সোজা: একসাথে একটা কাফেলাই ভেতরে ঢুকে মাল ওঠানো-নামানো করতে পারবে, কারণ দুটো কাফেলা একসাথে ঢুকলে বস্তা মিশে যায়, হিসাব গোলমাল হয়, আর কার মাল কোনটা সেটা আর বোঝা যায় না। এই "একসাথে একজন" নিয়মটাই **mutual exclusion**, আর চাবিটাই **distributed lock**।

প্রথম কয়েক বছর ব্যাপারটা সহজ ছিল। আল-খোয়ারিজমির কাফেলা এলো, ইবনে সিনা চাবি দিল, কাজ শেষে চাবি ফেরত এলো, পরের কাফেলা ঢুকল। সমস্যা শুরু হলো যেদিন আল-বিরুনির কাফেলা চাবি নিয়ে ভেতরে ঢুকে গেল, আর তারপর তাদের একজন উটচালক অসুস্থ হয়ে পড়ায় পুরো দল দুই দিন গুদামের ভেতরেই আটকে রইল। বাইরে ছয়টা কাফেলা দাঁড়িয়ে, রোদে মাল পচছে, কিন্তু চাবি ফেরত আসছে না। ইবনে সিনা তখন একটা নিয়ম বানাল: চাবি আর "যতক্ষণ ইচ্ছা" দেওয়া হবে না, চাবির সাথে একটা সময়ের কাগজ দেওয়া হবে — "এই চাবি সূর্য দুই আঙুল ওঠা পর্যন্ত বৈধ"। সময় শেষ হয়ে গেলে চাবি আপনা-আপনি বাতিল, ইবনে সিনা পরের কাফেলাকে দিয়ে দেবে। কাজ শেষ না হলে কাফেলাপ্রধান দৌড়ে এসে কাগজটা নবায়ন করিয়ে নেবে। এই সময়সীমা-বাঁধা চাবিই হলো **lease** — মালিকানা চিরস্থায়ী নয়, ভাড়া করা এবং নবায়নযোগ্য।

কিন্তু এতে নতুন এক বিপদ এলো, আর সেটাই আসল শিক্ষা। একদিন আল-কিন্দির কাফেলা চাবি নিয়ে ঢুকল, ভেতরে কাজ করতে করতে সময় ফুরিয়ে গেল, অথচ তারা টেরই পেল না — তাদের নিজেদের ছোট বালুঘড়িটা ধুলো জমে ধীরে চলছিল। বাইরে ইবনে সিনা সময় শেষ ধরে নিয়ে দ্বিতীয় চাবি বানিয়ে আল-রাজির কাফেলাকে দিয়ে দিল। এখন গুদামে দুটো দল, দুজনেই আন্তরিকভাবে বিশ্বাস করছে চাবি তার হাতে। এটাই distributed lock-এর সবচেয়ে ভয়ংকর ফেইলিওর মোড — কেউ মিথ্যা বলছে না, কেউ হ্যাক করেনি, শুধু দুটো ঘড়ি এক নয়। ইবনে সিনার সমাধান ছিল অসাধারণ সরল: প্রতিটা নতুন চাবিতে সে একটা করে বড় সংখ্যা খোদাই করতে লাগল — ৪১, ৪২, ৪৩। আর গুদামের ভেতরের হিসাবরক্ষক মরিয়ম আল-আস্তুরলাবিকে বলে দিল, "তুমি খাতায় শেষ যে চাবির নম্বর লিখেছ, তার চেয়ে ছোট নম্বরের চাবি নিয়ে কেউ এলে তাকে ফিরিয়ে দেবে।" এবার আল-কিন্দি ৪১ নম্বর চাবি নিয়ে বস্তা নামাতে গেলে মরিয়ম বলে, "খাতায় তো ৪২ লেখা আছে, তোমার চাবি বাতিল।" এই খোদাই করা বাড়তে-থাকা সংখ্যাটাই **fencing token** — এটা lock-কে নিরাপদ করে না, বরং lock ভুল করলেও **রিসোর্সটাকে** নিরাপদ রাখে।

শেষ অংশটা আরও গভীর। সরাইয়ের বড় খাতা — কোন কাফেলা কত ভাড়া দিল, কার কত বাকি — সেটা এতই গুরুত্বপূর্ণ যে ইবনে সিনা একা লিখলে সে মারা গেলে বা কাগজ পুড়ে গেলে সব শেষ। তাই পাঁচজন প্রবীণ ঠিক করা হলো, সবার কাছে খাতার নকল। নিয়ম হলো: একজনকে "লেখক" বেছে নেওয়া হবে, সে-ই কেবল নতুন লাইন লিখবে, আর কোনো লাইন তখনই পাকা বলে গণ্য হবে যখন পাঁচজনের অন্তত তিনজন সেটা নিজের নকলে তুলে নিয়েছে বলে জানাবে। লেখক অসুস্থ হয়ে পড়লে বাকিরা কিছুক্ষণ তার ডাক না শুনে নিজেরাই ভোট ডাকে; যে সবার আগে তিনজনের ভোট পায়, সে নতুন লেখক। আর প্রতিবার নতুন লেখক বসলে খাতার পাতায় "আমল ৭", "আমল ৮" এভাবে একটা করে যুগসংখ্যা বাড়ে, যাতে পুরনো লেখক ফিরে এসে পুরনো যুগের কথা বললে সবাই বুঝে যায় সে বাসি। এটাই **leader election** এবং **consensus** — এবং ঠিক এই নিয়মেই **Raft** চলে।

মিলিয়ে নিই: একটাই চাবি হলো **distributed lock**; সময়সীমা-বাঁধা চাবি হলো **lease**; চাবিতে খোদাই করা বাড়তি সংখ্যা হলো **fencing token**; ভুল চলা বালুঘড়ি হলো **clock skew**; একজন লেখক বেছে নেওয়া হলো **leader election**; পাঁচজনের তিনজনের সম্মতি হলো **quorum**; আর "আমল ৭, আমল ৮" হলো Raft-এর **term**। বাস্তবে etcd, ZooKeeper, Consul বা Kubernetes-এর controller ঠিক এই কাঠামোতেই চলে — আর যেসব সিস্টেম fencing token বাদ দেয়, তারা বছরে দুয়েকবার এমন ডেটা করাপশন দেখে যার কারণ কেউ ব্যাখ্যা করতে পারে না।

## Coordination কেন এত ব্যয়বহুল

আগের চ্যাপ্টারগুলোতে আপনি stateless সার্ভিস scale করেছেন, ডেটাবেস shard করেছেন, queue দিয়ে কাজ পিছিয়ে দিয়েছেন। ওই সব কৌশলের একটা সাধারণ বৈশিষ্ট্য আছে — কোনো নোডকে অন্য নোডের সিদ্ধান্তের জন্য অপেক্ষা করতে হয় না। Coordination ঠিক উল্টো: এখানে একাধিক নোডকে **একটা সিদ্ধান্তে একমত** হতে হয়, আর একমত হওয়ার একমাত্র উপায় হলো বার্তা বিনিময় ও অপেক্ষা।

এর দাম তিন জায়গায় ধরা পড়ে।

**Latency floor।** যেকোনো coordinated সিদ্ধান্তে অন্তত একটা round trip লাগে — সাধারণত quorum-এর কাছে। একই ডেটাসেন্টারে সেটা ১–২ ms, ভিন্ন অঞ্চলে ৭০–২০০ ms। মানে আপনার সিস্টেমে যে অপারেশনগুলো coordinate করতে হয়, তারা কখনোই নিচের এই মেঝের চেয়ে দ্রুত হতে পারবে না, যত hardware-ই দিন।

**Throughput ceiling।** Consensus-ভিত্তিক ব্যবস্থায় সব write একজন leader-এর মধ্য দিয়ে যায়। Leader হলো একটাই মেশিন, তাই সিস্টেমের write throughput একটা মেশিনের সীমায় বাঁধা। নোড বাড়ালে availability বাড়ে, write throughput বাড়ে না — বরং সামান্য কমে, কারণ leader-কে বেশি follower-এর সাথে কথা বলতে হয়।

**Availability coupling।** Quorum না থাকলে সিস্টেম লিখতে পারে না। ৫ নোডের cluster-এ ৩ নোড না থাকলে পুরো ব্যবস্থা write-এর জন্য বন্ধ। অর্থাৎ coordination আপনার availability-কে সবচেয়ে দুর্বল অংশের সাথে বেঁধে ফেলে।

<Callout type="warning">

Coordination হলো এমন এক উপাদান যা আপনি যত কম ব্যবহার করবেন, সিস্টেম তত ভালো চলবে। ডিজাইন করার সময় প্রথম প্রশ্ন "কীভাবে lock নেব" নয় — প্রথম প্রশ্ন হলো "lock ছাড়া এই কাজটা করা যায় কি?" Idempotent write, partition করা key-space, বা CRDT-জাতীয় merge-যোগ্য ডেটা স্ট্রাকচার দিয়ে বেশিরভাগ coordination সরিয়ে ফেলা যায়।

</Callout>

## Leader election

Leader election হলো এমন এক ব্যবস্থা যেখানে একগুচ্ছ সমান নোড থেকে যেকোনো একটাকে বিশেষ দায়িত্ব দেওয়া হয় — cron চালানো, shard rebalance করা, queue থেকে কাজ বণ্টন করা, বা সব write গ্রহণ করা।

সবচেয়ে সাধারণ প্রয়োজনটা মজার রকম সাদামাটা: আপনার সার্ভিসের ১২টা replica চলছে, আর আপনি চান প্রতি মিনিটে একটা cleanup job ঠিক **একবার** চলুক, ১২ বার নয়।

<Mermaid
title="Leader Election with Lease Renewal"
code={`graph TD
  N1["Node samarkand-1<br/>candidate"] -->|acquire lease| S["Coordination Store<br/>etcd / Redis / DB row"]
  N2["Node samarkand-2<br/>follower"] -->|acquire fails| S
  N3["Node samarkand-3<br/>follower"] -->|acquire fails| S
  S -->|lease granted, token 42| N1
  N1 -->|renew every 3s| S
  S -->|lease expired| N2
  N2 -->|acquires, token 43| S`}
/>

লক্ষ করুন ডায়াগ্রামের শেষ ধাপটা: নতুন leader token ৪২ নয়, ৪৩ পায়। এই বাড়তে-থাকা সংখ্যাটা বাদ দিলে পুরো ব্যবস্থাটা অনিরাপদ হয়ে যায়, এবং কেন সেটা পরের অংশে।

## Lease এবং fencing token

একটা lock যদি "যতক্ষণ ইচ্ছা ধরে রাখো" হয়, তাহলে holder ক্র্যাশ করলে সেটা চিরকালের জন্য আটকে থাকে। তাই বাস্তবে সব distributed lock আসলে **lease** — নির্দিষ্ট TTL সহ, নবায়নযোগ্য।

কিন্তু TTL নিজেই একটা বিপজ্জনক অনুমান তৈরি করে: "TTL শেষ হয়ে গেছে মানে পুরনো holder আর কাজ করছে না।" এই অনুমানটা মিথ্যা, কারণ একটা প্রসেস নিচের যেকোনো কারণে ইচ্ছেমতো সময় থেমে থাকতে পারে এবং তারপর যেন কিছুই হয়নি এমনভাবে চলতে শুরু করতে পারে:

- long GC pause (JVM-এ কয়েক সেকেন্ড অস্বাভাবিক নয়)
- VM live migration বা hypervisor-এর কারণে stop-the-world
- ডিস্ক I/O-তে আটকে থাকা, swap thrash
- নেটওয়ার্ক partition যেখানে প্যাকেট বিলম্বিত হয়, হারায় না

এই সবগুলোর ফল একই: প্রসেস মনে করে সে এখনও lock-এর মালিক, অথচ lock অন্য কারও হাতে চলে গেছে। সমাধান lock-এর দিকে নয়, **রিসোর্সের** দিকে।

<Mermaid
title="Why Fencing Tokens Are Required"
code={`sequenceDiagram
  participant A as Client al-kindi
  participant L as Lease Store
  participant B as Client al-razi
  participant R as Storage
  A->>L: acquire(warehouse) -> token 41
  Note over A: long GC pause
  L-->>L: lease 41 expires
  B->>L: acquire(warehouse) -> token 42
  B->>R: write(data, token 42)
  R-->>R: lastToken = 42, accepted
  Note over A: resumes, thinks it holds lock
  A->>R: write(data, token 41)
  R-->>A: rejected, 41 is older than 42`}
/>

নিয়মটা এক লাইনে: **রিসোর্স নিজে টোকেন যাচাই করবে।** Lock সার্ভিস যত ভালোই হোক, শেষ রক্ষা করে ওই যাচাইটাই। S3-তে conditional write, ডেটাবেসে `WHERE lease_token >= ?`, বা ফাইল সিস্টেমে একটা marker — যেকোনো একটা লাগবে।

## Lease manager, fencing সহ

নিচের কোডটা একটা সম্পূর্ণ lease manager — acquire, renew, release, এবং fencing token যাচাই করা একটা protected resource সহ। এটা ইচ্ছাকৃতভাবে single-process, যাতে যুক্তিটা পরিষ্কার থাকে; প্রোডাকশনে store-টা etcd বা Postgres-এর একটা row হবে, কিন্তু নিয়মগুলো হুবহু এক।

<CodeTabs tsFile="lease-manager.ts" goFile="lease_manager.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
// --- Types ---
export interface Lease {
	resource: string;
	holder: string;
	token: number; // monotonically increasing fencing token
	expiresAt: number; // epoch millis
}

export class LeaseError extends Error {
	constructor(
		message: string,
		readonly code: 'HELD_BY_OTHER' | 'NOT_HOLDER' | 'EXPIRED' | 'STALE_TOKEN'
	) {
		super(message);
		this.name = 'LeaseError';
	}
}

// --- Monotonic clock helper ---
// Never use Date.now() for measuring elapsed time: it can jump backwards
// when NTP corrects the wall clock. Use it only for absolute deadlines
// that must be comparable across processes.
function nowMs(): number {
	return Date.now();
}

// --- Lease store ---
export class LeaseManager {
	private leases = new Map<string, Lease>();
	private nextToken = 1;

	/**
	 * Acquire a lease. Returns the lease with its fencing token.
	 * Throws HELD_BY_OTHER if another holder has an unexpired lease.
	 * Re-acquiring your own lease is allowed and behaves like a renewal,
	 * but it still issues a NEW token, because the caller may have been
	 * paused long enough that another holder came and went.
	 */
	acquire(resource: string, holder: string, ttlMs: number): Lease {
		const existing = this.leases.get(resource);
		const now = nowMs();

		if (existing && existing.expiresAt > now && existing.holder !== holder) {
			throw new LeaseError(
				`lease on ${resource} held by ${existing.holder} for another ${existing.expiresAt - now}ms`,
				'HELD_BY_OTHER'
			);
		}

		const lease: Lease = {
			resource,
			holder,
			token: this.nextToken++,
			expiresAt: now + ttlMs
		};
		this.leases.set(resource, lease);
		return lease;
	}

	/**
	 * Extend an existing lease. The token is preserved: a renewal means
	 * "I never lost it", so downstream resources keep accepting the same token.
	 * If the lease already expired we refuse — the caller must re-acquire
	 * and get a fresh token, because someone else may have held it meanwhile.
	 */
	renew(resource: string, holder: string, token: number, ttlMs: number): Lease {
		const existing = this.leases.get(resource);
		const now = nowMs();

		if (!existing || existing.holder !== holder || existing.token !== token) {
			throw new LeaseError(`${holder} does not hold ${resource}`, 'NOT_HOLDER');
		}
		if (existing.expiresAt <= now) {
			throw new LeaseError(`lease on ${resource} already expired`, 'EXPIRED');
		}

		existing.expiresAt = now + ttlMs;
		return { ...existing };
	}

	/** Voluntary release. Safe to call after expiry; it is a no-op then. */
	release(resource: string, holder: string, token: number): void {
		const existing = this.leases.get(resource);
		if (existing && existing.holder === holder && existing.token === token) {
			this.leases.delete(resource);
		}
	}

	inspect(resource: string): Lease | null {
		const existing = this.leases.get(resource);
		if (!existing) return null;
		if (existing.expiresAt <= nowMs()) return null;
		return { ...existing };
	}
}

// --- The resource that actually enforces safety ---
// This is the part people skip, and it is the only part that makes
// the whole scheme correct.
export class FencedStore {
	private data = new Map<string, string>();
	private highestToken = new Map<string, number>();

	write(key: string, value: string, token: number): void {
		const seen = this.highestToken.get(key) ?? 0;
		if (token < seen) {
			throw new LeaseError(
				`stale fencing token ${token} for ${key}; already saw ${seen}`,
				'STALE_TOKEN'
			);
		}
		this.highestToken.set(key, token);
		this.data.set(key, value);
	}

	read(key: string): string | undefined {
		return this.data.get(key);
	}
}

// --- A leader that keeps its lease alive in the background ---
export class LeaderWorker {
	private lease: Lease | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private running = false;

	constructor(
		private readonly manager: LeaseManager,
		private readonly resource: string,
		private readonly nodeId: string,
		private readonly ttlMs = 9_000,
		private readonly renewEveryMs = 3_000
	) {}

	/**
	 * Renewal interval must be well below the TTL. A common rule is
	 * renewEvery <= ttl / 3, so two consecutive renewal failures still
	 * leave time for a third attempt before the lease is lost.
	 */
	start(onBecomeLeader: (token: number) => void, onLoseLeadership: () => void): void {
		this.running = true;

		const tick = () => {
			if (!this.running) return;
			try {
				if (this.lease) {
					this.lease = this.manager.renew(this.resource, this.nodeId, this.lease.token, this.ttlMs);
				} else {
					this.lease = this.manager.acquire(this.resource, this.nodeId, this.ttlMs);
					onBecomeLeader(this.lease.token);
				}
			} catch (err) {
				if (this.lease) {
					this.lease = null;
					onLoseLeadership();
				}
				const code = err instanceof LeaseError ? err.code : 'UNKNOWN';
				console.log(`[lease] ${this.nodeId} not leader for ${this.resource} (${code})`);
			}
		};

		tick();
		this.timer = setInterval(tick, this.renewEveryMs);
	}

	get token(): number | null {
		return this.lease?.token ?? null;
	}

	stop(): void {
		this.running = false;
		if (this.timer) clearInterval(this.timer);
		if (this.lease) {
			this.manager.release(this.resource, this.nodeId, this.lease.token);
			this.lease = null;
		}
	}
}

// --- Demonstration of the failure mode fencing protects against ---
function demo(): void {
	const manager = new LeaseManager();
	const store = new FencedStore();

	const first = manager.acquire('warehouse-samarkand', 'al-kindi', 5_000);
	console.log(`al-kindi holds token ${first.token}`);

	// al-kindi stalls (GC pause, VM migration, network partition).
	// We simulate expiry by rewinding the deadline.
	const stalled = manager.inspect('warehouse-samarkand');
	if (stalled) stalled.expiresAt = nowMs() - 1;

	const second = manager.acquire('warehouse-samarkand', 'al-razi', 5_000);
	console.log(`al-razi holds token ${second.token}`);

	store.write('manifest', 'written-by-al-razi', second.token);

	try {
		// al-kindi wakes up and still believes it is the leader
		store.write('manifest', 'written-by-al-kindi', first.token);
	} catch (err) {
		console.log(`rejected: ${(err as Error).message}`);
	}

	console.log(`final value: ${store.read('manifest')}`);
}

demo();
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// --- Types ---

type Lease struct {
	Resource  string
	Holder    string
	Token     uint64 // monotonically increasing fencing token
	ExpiresAt time.Time
}

type LeaseErrorCode string

const (
	CodeHeldByOther LeaseErrorCode = "HELD_BY_OTHER"
	CodeNotHolder   LeaseErrorCode = "NOT_HOLDER"
	CodeExpired     LeaseErrorCode = "EXPIRED"
	CodeStaleToken  LeaseErrorCode = "STALE_TOKEN"
)

type LeaseError struct {
	Code LeaseErrorCode
	Msg  string
}

func (e *LeaseError) Error() string { return string(e.Code) + ": " + e.Msg }

// --- Lease store ---

type LeaseManager struct {
	mu        sync.Mutex
	leases    map[string]*Lease
	nextToken uint64
}

func NewLeaseManager() *LeaseManager {
	return &LeaseManager{leases: make(map[string]*Lease), nextToken: 1}
}

// Acquire grants a lease and always issues a fresh fencing token.
func (lm *LeaseManager) Acquire(resource, holder string, ttl time.Duration) (Lease, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	now := time.Now()
	if existing, ok := lm.leases[resource]; ok {
		if existing.ExpiresAt.After(now) && existing.Holder != holder {
			return Lease{}, &LeaseError{
				Code: CodeHeldByOther,
				Msg:  fmt.Sprintf("%s held by %s", resource, existing.Holder),
			}
		}
	}

	lease := &Lease{
		Resource:  resource,
		Holder:    holder,
		Token:     lm.nextToken,
		ExpiresAt: now.Add(ttl),
	}
	lm.nextToken++
	lm.leases[resource] = lease
	return *lease, nil
}

// Renew extends the deadline and keeps the same token.
func (lm *LeaseManager) Renew(resource, holder string, token uint64, ttl time.Duration) (Lease, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	existing, ok := lm.leases[resource]
	if !ok || existing.Holder != holder || existing.Token != token {
		return Lease{}, &LeaseError{Code: CodeNotHolder, Msg: holder + " does not hold " + resource}
	}
	if !existing.ExpiresAt.After(time.Now()) {
		return Lease{}, &LeaseError{Code: CodeExpired, Msg: resource + " already expired"}
	}

	existing.ExpiresAt = time.Now().Add(ttl)
	return *existing, nil
}

func (lm *LeaseManager) Release(resource, holder string, token uint64) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	if existing, ok := lm.leases[resource]; ok {
		if existing.Holder == holder && existing.Token == token {
			delete(lm.leases, resource)
		}
	}
}

func (lm *LeaseManager) Inspect(resource string) (Lease, bool) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	existing, ok := lm.leases[resource]
	if !ok || !existing.ExpiresAt.After(time.Now()) {
		return Lease{}, false
	}
	return *existing, true
}

// expireNow is a test hook used to simulate a stalled holder.
func (lm *LeaseManager) expireNow(resource string) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	if existing, ok := lm.leases[resource]; ok {
		existing.ExpiresAt = time.Now().Add(-time.Second)
	}
}

// --- The resource that enforces safety ---

type FencedStore struct {
	mu      sync.Mutex
	data    map[string]string
	highest map[string]uint64
}

func NewFencedStore() *FencedStore {
	return &FencedStore{data: make(map[string]string), highest: make(map[string]uint64)}
}

func (fs *FencedStore) Write(key, value string, token uint64) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()

	if seen, ok := fs.highest[key]; ok && token < seen {
		return &LeaseError{
			Code: CodeStaleToken,
			Msg:  fmt.Sprintf("token %d for %s, already saw %d", token, key, seen),
		}
	}
	fs.highest[key] = token
	fs.data[key] = value
	return nil
}

func (fs *FencedStore) Read(key string) (string, bool) {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	v, ok := fs.data[key]
	return v, ok
}

// --- Leader worker with background renewal ---

type LeaderWorker struct {
	manager    *LeaseManager
	resource   string
	nodeID     string
	ttl        time.Duration
	renewEvery time.Duration

	mu    sync.Mutex
	lease *Lease
	stop  chan struct{}
}

func NewLeaderWorker(m *LeaseManager, resource, nodeID string) *LeaderWorker {
	return &LeaderWorker{
		manager:    m,
		resource:   resource,
		nodeID:     nodeID,
		ttl:        9 * time.Second,
		renewEvery: 3 * time.Second,
		stop:       make(chan struct{}),
	}
}

func (w *LeaderWorker) Start(onLead func(uint64), onLose func()) {
	tick := func() {
		w.mu.Lock()
		defer w.mu.Unlock()

		if w.lease != nil {
			renewed, err := w.manager.Renew(w.resource, w.nodeID, w.lease.Token, w.ttl)
			if err != nil {
				w.lease = nil
				onLose()
				return
			}
			w.lease = &renewed
			return
		}

		acquired, err := w.manager.Acquire(w.resource, w.nodeID, w.ttl)
		if err != nil {
			var le *LeaseError
			if errors.As(err, &le) {
				fmt.Printf("[lease] %s not leader (%s)\n", w.nodeID, le.Code)
			}
			return
		}
		w.lease = &acquired
		onLead(acquired.Token)
	}

	go func() {
		tick()
		ticker := time.NewTicker(w.renewEvery)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				tick()
			case <-w.stop:
				return
			}
		}
	}()
}

func (w *LeaderWorker) Token() (uint64, bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.lease == nil {
		return 0, false
	}
	return w.lease.Token, true
}

func (w *LeaderWorker) Stop() {
	close(w.stop)
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.lease != nil {
		w.manager.Release(w.resource, w.nodeID, w.lease.Token)
		w.lease = nil
	}
}

// --- Demonstration ---

func main() {
	manager := NewLeaseManager()
	store := NewFencedStore()

	first, _ := manager.Acquire("warehouse-samarkand", "al-kindi", 5*time.Second)
	fmt.Printf("al-kindi holds token %d\n", first.Token)

	// al-kindi stalls long enough that the lease expires
	manager.expireNow("warehouse-samarkand")

	second, _ := manager.Acquire("warehouse-samarkand", "al-razi", 5*time.Second)
	fmt.Printf("al-razi holds token %d\n", second.Token)

	if err := store.Write("manifest", "written-by-al-razi", second.Token); err != nil {
		fmt.Println("unexpected:", err)
	}

	// al-kindi wakes up believing it is still the leader
	if err := store.Write("manifest", "written-by-al-kindi", first.Token); err != nil {
		fmt.Println("rejected:", err)
	}

	if v, ok := store.Read("manifest"); ok {
		fmt.Println("final value:", v)
	}
}
```

</div>
</CodeTabs>

<Callout type="warning">

Redis-এর একক ইনস্ট্যান্সে `SET key value NX PX 30000` দিয়ে বানানো lock খুবই জনপ্রিয়, এবং এটা fencing token দেয় না। Redlock অ্যালগরিদমও দেয় না। এগুলো "efficiency lock" হিসেবে ঠিক আছে — অর্থাৎ যেখানে দুবার কাজ হলে শুধু অপচয় হয়, ক্ষতি হয় না। কিন্তু "correctness lock" হিসেবে, অর্থাৎ যেখানে দুবার লিখলে ডেটা নষ্ট হবে, সেখানে টোকেন ছাড়া কোনো lock ব্যবহার করবেন না।

</Callout>

## Consensus এবং Raft

Lease আপনাকে একজন leader দেয়, কিন্তু lease যে store-এ থাকে সেটাই যদি একটা মেশিন হয়, তাহলে আপনি সমস্যাটাকে শুধু এক ধাপ সরিয়েছেন। Consensus অ্যালগরিদম এই শেষ গিঁটটা খোলে: একগুচ্ছ মেশিন নিজেরাই, বাইরের কোনো নির্ভরতা ছাড়া, একটা replicated log-এর ব্যাপারে একমত হয়।

Raft-কে তিনটা অংশে ভাগ করলে পুরোটা মাথায় ধরে যায়।

**Term।** সময়কে যুগে ভাগ করা হয়, প্রতি যুগে সর্বোচ্চ একজন leader। Term একটা কেবল-বাড়তে-থাকা সংখ্যা, অর্থাৎ এটাই Raft-এর নিজস্ব fencing token। কোনো বার্তায় নিজের চেয়ে বড় term দেখলে নোড সাথে সাথে follower হয়ে যায় এবং নিজের term আপডেট করে।

**Election।** Follower নির্দিষ্ট সময়ের মধ্যে leader-এর heartbeat না পেলে নিজের term এক বাড়িয়ে candidate হয় এবং সবার কাছে ভোট চায়। একটা নোড এক term-এ একবারই ভোট দেয়। Majority ভোট পেলে সে leader। Election timeout **randomized** রাখা হয় (যেমন ১৫০–৩০০ ms থেকে র‍্যান্ডম), যাতে সবাই একসাথে candidate হয়ে বারবার ভোট ভাগাভাগি না করে।

**Log replication।** Leader ক্লায়েন্টের কমান্ড নিজের log-এ append করে, follower-দের পাঠায়, আর majority সেটা লিখে ফেলার পর entry-টাকে **committed** ঘোষণা করে ও state machine-এ প্রয়োগ করে। Follower নিজের log-এর শেষ entry-র index ও term মিলিয়ে দেখে; না মিললে leader পিছিয়ে গিয়ে মিল খুঁজে বের করে এবং পরের entry-গুলো ওভাররাইট করে দেয়।

<Mermaid
title="Raft Node State Transitions"
code={`stateDiagram-v2
  [*] --> Follower
  Follower --> Candidate: election timeout, no heartbeat
  Candidate --> Leader: majority of votes in this term
  Candidate --> Follower: saw higher term, or another leader
  Candidate --> Candidate: split vote, timeout again
  Leader --> Follower: saw higher term`}
/>

<Callout type="tip">

Raft-এর নিরাপত্তার আসল ভিত্তি হলো **election restriction**: একটা নোড তখনই ভোট পাবে যখন তার log ভোটদাতার log-এর মতো বা তার চেয়ে নতুন (শেষ entry-র term বড়, বা term সমান হলে index বড়)। এই একটা নিয়মই নিশ্চিত করে যে ইতিমধ্যে committed কোনো entry নতুন leader-এর কাছে অবশ্যই থাকবে — তাই committed ডেটা কখনো হারায় না।

</Callout>

## Raft leader election, চালু অবস্থায়

নিচের কোডটা Raft-এর election অংশটা পুরোপুরি বাস্তবায়ন করে — term, randomized timeout, RequestVote, heartbeat, এবং election restriction সহ। Log replication বাদ দেওয়া হয়েছে যাতে election-এর যুক্তিটা পড়া যায়, তবে log-এর index/term যাচাই করে ভোট দেওয়ার অংশটা রাখা হয়েছে, কারণ ওটা ছাড়া election ভুল।

<CodeTabs tsFile="raft-election.ts" goFile="raft_election.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
type NodeState = 'follower' | 'candidate' | 'leader';

interface LogEntry {
	term: number;
	command: string;
}

interface RequestVoteArgs {
	term: number;
	candidateId: string;
	lastLogIndex: number;
	lastLogTerm: number;
}

interface RequestVoteReply {
	term: number;
	voteGranted: boolean;
}

interface AppendEntriesArgs {
	term: number;
	leaderId: string;
	entries: LogEntry[];
}

interface AppendEntriesReply {
	term: number;
	success: boolean;
}

/** In-memory transport so the whole cluster runs in one process. */
class Cluster {
	private nodes = new Map<string, RaftNode>();
	/** Simulated network: set of node ids that cannot be reached. */
	partitioned = new Set<string>();

	register(node: RaftNode): void {
		this.nodes.set(node.id, node);
	}

	ids(): string[] {
		return [...this.nodes.keys()];
	}

	async requestVote(
		from: string,
		to: string,
		args: RequestVoteArgs
	): Promise<RequestVoteReply | null> {
		if (this.partitioned.has(from) || this.partitioned.has(to)) return null;
		const target = this.nodes.get(to);
		if (!target) return null;
		await this.delay();
		return target.handleRequestVote(args);
	}

	async appendEntries(
		from: string,
		to: string,
		args: AppendEntriesArgs
	): Promise<AppendEntriesReply | null> {
		if (this.partitioned.has(from) || this.partitioned.has(to)) return null;
		const target = this.nodes.get(to);
		if (!target) return null;
		await this.delay();
		return target.handleAppendEntries(args);
	}

	private delay(): Promise<void> {
		const ms = 2 + Math.random() * 8;
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

class RaftNode {
	// --- Persistent state (must survive restart in a real system) ---
	private currentTerm = 0;
	private votedFor: string | null = null;
	private log: LogEntry[] = [];

	// --- Volatile state ---
	private state: NodeState = 'follower';
	private leaderId: string | null = null;
	private lastHeartbeatAt = Date.now();

	private electionTimer: ReturnType<typeof setInterval> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private electionTimeoutMs = 0;

	constructor(
		readonly id: string,
		private readonly cluster: Cluster
	) {
		cluster.register(this);
		this.resetElectionTimeout();
	}

	/**
	 * Randomised timeout is not a detail: with a fixed timeout every follower
	 * becomes candidate at the same instant, votes split, and the cluster can
	 * loop through terms without ever electing anyone.
	 */
	private resetElectionTimeout(): void {
		this.electionTimeoutMs = 300 + Math.floor(Math.random() * 300);
	}

	start(): void {
		this.electionTimer = setInterval(() => this.tick(), 50);
	}

	stop(): void {
		if (this.electionTimer) clearInterval(this.electionTimer);
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
	}

	private tick(): void {
		if (this.state === 'leader') return;
		if (Date.now() - this.lastHeartbeatAt >= this.electionTimeoutMs) {
			void this.startElection();
		}
	}

	// --- Term rule: any message carrying a newer term demotes us ---
	private observeTerm(term: number): void {
		if (term > this.currentTerm) {
			this.currentTerm = term;
			this.votedFor = null;
			this.becomeFollower(null);
		}
	}

	private becomeFollower(leaderId: string | null): void {
		if (this.state === 'leader' && this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		this.state = 'follower';
		this.leaderId = leaderId;
		this.lastHeartbeatAt = Date.now();
		this.resetElectionTimeout();
	}

	private lastLogIndex(): number {
		return this.log.length - 1;
	}

	private lastLogTerm(): number {
		return this.log.length === 0 ? 0 : this.log[this.log.length - 1].term;
	}

	private async startElection(): Promise<void> {
		this.state = 'candidate';
		this.currentTerm += 1;
		this.votedFor = this.id;
		this.lastHeartbeatAt = Date.now();
		this.resetElectionTimeout();

		const termAtStart = this.currentTerm;
		const peers = this.cluster.ids().filter((id) => id !== this.id);
		const majority = Math.floor((peers.length + 1) / 2) + 1;
		let votes = 1; // vote for self

		console.log(`[raft] ${this.id} starts election for term ${termAtStart}`);

		const args: RequestVoteArgs = {
			term: termAtStart,
			candidateId: this.id,
			lastLogIndex: this.lastLogIndex(),
			lastLogTerm: this.lastLogTerm()
		};

		await Promise.all(
			peers.map(async (peer) => {
				const reply = await this.cluster.requestVote(this.id, peer, args);
				if (!reply) return; // unreachable peer, treat as no vote
				if (reply.term > this.currentTerm) {
					this.observeTerm(reply.term);
					return;
				}
				// Ignore late replies from an election we already left
				if (this.state !== 'candidate' || this.currentTerm !== termAtStart) return;
				if (reply.voteGranted) {
					votes += 1;
					if (votes >= majority) this.becomeLeader();
				}
			})
		);
	}

	private becomeLeader(): void {
		if (this.state !== 'candidate') return;
		this.state = 'leader';
		this.leaderId = this.id;
		console.log(`[raft] ${this.id} is leader for term ${this.currentTerm}`);

		const sendHeartbeats = async () => {
			if (this.state !== 'leader') return;
			const peers = this.cluster.ids().filter((id) => id !== this.id);
			const args: AppendEntriesArgs = {
				term: this.currentTerm,
				leaderId: this.id,
				entries: []
			};
			let reachable = 1;
			await Promise.all(
				peers.map(async (peer) => {
					const reply = await this.cluster.appendEntries(this.id, peer, args);
					if (!reply) return;
					reachable += 1;
					if (reply.term > this.currentTerm) this.observeTerm(reply.term);
				})
			);
			// A leader that cannot reach a majority must step down, otherwise
			// it keeps serving reads from a minority partition.
			const majority = Math.floor((peers.length + 1) / 2) + 1;
			if (reachable < majority) {
				console.log(`[raft] ${this.id} lost quorum, stepping down`);
				this.becomeFollower(null);
			}
		};

		void sendHeartbeats();
		this.heartbeatTimer = setInterval(() => void sendHeartbeats(), 120);
	}

	// --- RPC handlers ---

	handleRequestVote(args: RequestVoteArgs): RequestVoteReply {
		this.observeTerm(args.term);

		if (args.term < this.currentTerm) {
			return { term: this.currentTerm, voteGranted: false };
		}
		if (this.votedFor !== null && this.votedFor !== args.candidateId) {
			return { term: this.currentTerm, voteGranted: false };
		}

		// Election restriction: only vote for a candidate whose log is at
		// least as up to date as ours. This is what keeps committed entries safe.
		const upToDate =
			args.lastLogTerm > this.lastLogTerm() ||
			(args.lastLogTerm === this.lastLogTerm() && args.lastLogIndex >= this.lastLogIndex());

		if (!upToDate) {
			return { term: this.currentTerm, voteGranted: false };
		}

		this.votedFor = args.candidateId;
		this.lastHeartbeatAt = Date.now();
		return { term: this.currentTerm, voteGranted: true };
	}

	handleAppendEntries(args: AppendEntriesArgs): AppendEntriesReply {
		this.observeTerm(args.term);

		if (args.term < this.currentTerm) {
			return { term: this.currentTerm, success: false };
		}

		this.becomeFollower(args.leaderId);
		this.log.push(...args.entries);
		return { term: this.currentTerm, success: true };
	}

	snapshot(): string {
		return `${this.id} state=${this.state} term=${this.currentTerm} leader=${this.leaderId ?? 'none'}`;
	}
}

// --- Run a five node cluster and kill the leader ---
async function main(): Promise<void> {
	const cluster = new Cluster();
	const names = ['baghdad', 'cordoba', 'damascus', 'samarkand', 'bukhara'];
	const nodes = names.map((n) => new RaftNode(n, cluster));
	nodes.forEach((n) => n.start());

	await new Promise((r) => setTimeout(r, 1500));
	nodes.forEach((n) => console.log(n.snapshot()));

	// Partition the current leader away from the cluster
	const leader = nodes.find((n) => n.snapshot().includes('state=leader'));
	if (leader) {
		console.log(`--- partitioning ${leader.id} ---`);
		cluster.partitioned.add(leader.id);
	}

	await new Promise((r) => setTimeout(r, 2000));
	nodes.forEach((n) => console.log(n.snapshot()));
	nodes.forEach((n) => n.stop());
}

void main();
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

type NodeState string

const (
	Follower  NodeState = "follower"
	Candidate NodeState = "candidate"
	Leader    NodeState = "leader"
)

type LogEntry struct {
	Term    int
	Command string
}

type RequestVoteArgs struct {
	Term         int
	CandidateID  string
	LastLogIndex int
	LastLogTerm  int
}

type RequestVoteReply struct {
	Term        int
	VoteGranted bool
}

type AppendEntriesArgs struct {
	Term     int
	LeaderID string
	Entries  []LogEntry
}

type AppendEntriesReply struct {
	Term    int
	Success bool
}

// --- In-memory transport ---

type Cluster struct {
	mu          sync.RWMutex
	nodes       map[string]*RaftNode
	partitioned map[string]bool
}

func NewCluster() *Cluster {
	return &Cluster{nodes: make(map[string]*RaftNode), partitioned: make(map[string]bool)}
}

func (c *Cluster) Register(n *RaftNode) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.nodes[n.id] = n
}

func (c *Cluster) IDs() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]string, 0, len(c.nodes))
	for id := range c.nodes {
		out = append(out, id)
	}
	return out
}

func (c *Cluster) Partition(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.partitioned[id] = true
}

func (c *Cluster) reachable(from, to string) (*RaftNode, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.partitioned[from] || c.partitioned[to] {
		return nil, false
	}
	n, ok := c.nodes[to]
	return n, ok
}

func (c *Cluster) RequestVote(from, to string, args RequestVoteArgs) (RequestVoteReply, bool) {
	target, ok := c.reachable(from, to)
	if !ok {
		return RequestVoteReply{}, false
	}
	time.Sleep(time.Duration(2+rand.Intn(8)) * time.Millisecond)
	return target.HandleRequestVote(args), true
}

func (c *Cluster) AppendEntries(from, to string, args AppendEntriesArgs) (AppendEntriesReply, bool) {
	target, ok := c.reachable(from, to)
	if !ok {
		return AppendEntriesReply{}, false
	}
	time.Sleep(time.Duration(2+rand.Intn(8)) * time.Millisecond)
	return target.HandleAppendEntries(args), true
}

// --- Raft node ---

type RaftNode struct {
	id      string
	cluster *Cluster

	mu sync.Mutex
	// persistent state
	currentTerm int
	votedFor    string
	log         []LogEntry
	// volatile state
	state           NodeState
	leaderID        string
	lastHeartbeat   time.Time
	electionTimeout time.Duration

	stopCh chan struct{}
}

func NewRaftNode(id string, c *Cluster) *RaftNode {
	n := &RaftNode{
		id:            id,
		cluster:       c,
		state:         Follower,
		lastHeartbeat: time.Now(),
		stopCh:        make(chan struct{}),
	}
	n.resetElectionTimeout()
	c.Register(n)
	return n
}

// Randomised timeout prevents perpetual split votes.
func (n *RaftNode) resetElectionTimeout() {
	n.electionTimeout = time.Duration(300+rand.Intn(300)) * time.Millisecond
}

func (n *RaftNode) Start() {
	go func() {
		ticker := time.NewTicker(50 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				n.tick()
			case <-n.stopCh:
				return
			}
		}
	}()
}

func (n *RaftNode) Stop() { close(n.stopCh) }

func (n *RaftNode) tick() {
	n.mu.Lock()
	if n.state == Leader || time.Since(n.lastHeartbeat) < n.electionTimeout {
		n.mu.Unlock()
		return
	}
	n.mu.Unlock()
	n.startElection()
}

// caller must hold n.mu
func (n *RaftNode) observeTermLocked(term int) {
	if term > n.currentTerm {
		n.currentTerm = term
		n.votedFor = ""
		n.state = Follower
		n.leaderID = ""
		n.lastHeartbeat = time.Now()
		n.resetElectionTimeout()
	}
}

func (n *RaftNode) lastLogIndexLocked() int { return len(n.log) - 1 }

func (n *RaftNode) lastLogTermLocked() int {
	if len(n.log) == 0 {
		return 0
	}
	return n.log[len(n.log)-1].Term
}

func (n *RaftNode) startElection() {
	n.mu.Lock()
	n.state = Candidate
	n.currentTerm++
	n.votedFor = n.id
	n.lastHeartbeat = time.Now()
	n.resetElectionTimeout()
	termAtStart := n.currentTerm
	args := RequestVoteArgs{
		Term:         termAtStart,
		CandidateID:  n.id,
		LastLogIndex: n.lastLogIndexLocked(),
		LastLogTerm:  n.lastLogTermLocked(),
	}
	n.mu.Unlock()

	fmt.Printf("[raft] %s starts election for term %d\n", n.id, termAtStart)

	peers := []string{}
	for _, id := range n.cluster.IDs() {
		if id != n.id {
			peers = append(peers, id)
		}
	}
	majority := (len(peers)+1)/2 + 1

	var wg sync.WaitGroup
	var voteMu sync.Mutex
	votes := 1

	for _, peer := range peers {
		wg.Add(1)
		go func(p string) {
			defer wg.Done()
			reply, ok := n.cluster.RequestVote(n.id, p, args)
			if !ok {
				return
			}

			n.mu.Lock()
			if reply.Term > n.currentTerm {
				n.observeTermLocked(reply.Term)
				n.mu.Unlock()
				return
			}
			stale := n.state != Candidate || n.currentTerm != termAtStart
			n.mu.Unlock()
			if stale || !reply.VoteGranted {
				return
			}

			voteMu.Lock()
			votes++
			won := votes == majority
			voteMu.Unlock()
			if won {
				n.becomeLeader(termAtStart)
			}
		}(peer)
	}
	wg.Wait()
}

func (n *RaftNode) becomeLeader(term int) {
	n.mu.Lock()
	if n.state != Candidate || n.currentTerm != term {
		n.mu.Unlock()
		return
	}
	n.state = Leader
	n.leaderID = n.id
	n.mu.Unlock()

	fmt.Printf("[raft] %s is leader for term %d\n", n.id, term)

	go func() {
		ticker := time.NewTicker(120 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if !n.sendHeartbeats() {
					return
				}
			case <-n.stopCh:
				return
			}
		}
	}()
}

// sendHeartbeats returns false once this node is no longer leader.
func (n *RaftNode) sendHeartbeats() bool {
	n.mu.Lock()
	if n.state != Leader {
		n.mu.Unlock()
		return false
	}
	args := AppendEntriesArgs{Term: n.currentTerm, LeaderID: n.id}
	n.mu.Unlock()

	peers := []string{}
	for _, id := range n.cluster.IDs() {
		if id != n.id {
			peers = append(peers, id)
		}
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	reachable := 1

	for _, peer := range peers {
		wg.Add(1)
		go func(p string) {
			defer wg.Done()
			reply, ok := n.cluster.AppendEntries(n.id, p, args)
			if !ok {
				return
			}
			mu.Lock()
			reachable++
			mu.Unlock()
			n.mu.Lock()
			n.observeTermLocked(reply.Term)
			n.mu.Unlock()
		}(peer)
	}
	wg.Wait()

	majority := (len(peers)+1)/2 + 1
	if reachable < majority {
		fmt.Printf("[raft] %s lost quorum, stepping down\n", n.id)
		n.mu.Lock()
		n.state = Follower
		n.leaderID = ""
		n.lastHeartbeat = time.Now()
		n.resetElectionTimeout()
		n.mu.Unlock()
		return false
	}
	return true
}

// --- RPC handlers ---

func (n *RaftNode) HandleRequestVote(args RequestVoteArgs) RequestVoteReply {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.observeTermLocked(args.Term)

	if args.Term < n.currentTerm {
		return RequestVoteReply{Term: n.currentTerm, VoteGranted: false}
	}
	if n.votedFor != "" && n.votedFor != args.CandidateID {
		return RequestVoteReply{Term: n.currentTerm, VoteGranted: false}
	}

	// Election restriction keeps committed entries safe.
	upToDate := args.LastLogTerm > n.lastLogTermLocked() ||
		(args.LastLogTerm == n.lastLogTermLocked() && args.LastLogIndex >= n.lastLogIndexLocked())
	if !upToDate {
		return RequestVoteReply{Term: n.currentTerm, VoteGranted: false}
	}

	n.votedFor = args.CandidateID
	n.lastHeartbeat = time.Now()
	return RequestVoteReply{Term: n.currentTerm, VoteGranted: true}
}

func (n *RaftNode) HandleAppendEntries(args AppendEntriesArgs) AppendEntriesReply {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.observeTermLocked(args.Term)

	if args.Term < n.currentTerm {
		return AppendEntriesReply{Term: n.currentTerm, Success: false}
	}

	n.state = Follower
	n.leaderID = args.LeaderID
	n.lastHeartbeat = time.Now()
	n.resetElectionTimeout()
	n.log = append(n.log, args.Entries...)
	return AppendEntriesReply{Term: n.currentTerm, Success: true}
}

func (n *RaftNode) Snapshot() string {
	n.mu.Lock()
	defer n.mu.Unlock()
	leader := n.leaderID
	if leader == "" {
		leader = "none"
	}
	return fmt.Sprintf("%s state=%s term=%d leader=%s", n.id, n.state, n.currentTerm, leader)
}

func (n *RaftNode) IsLeader() bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.state == Leader
}

func main() {
	cluster := NewCluster()
	names := []string{"baghdad", "cordoba", "damascus", "samarkand", "bukhara"}
	nodes := make([]*RaftNode, 0, len(names))
	for _, name := range names {
		nodes = append(nodes, NewRaftNode(name, cluster))
	}
	for _, n := range nodes {
		n.Start()
	}

	time.Sleep(1500 * time.Millisecond)
	for _, n := range nodes {
		fmt.Println(n.Snapshot())
	}

	for _, n := range nodes {
		if n.IsLeader() {
			fmt.Printf("--- partitioning %s ---\n", n.id)
			cluster.Partition(n.id)
			break
		}
	}

	time.Sleep(2 * time.Second)
	for _, n := range nodes {
		fmt.Println(n.Snapshot())
	}
	for _, n := range nodes {
		n.Stop()
	}
}
```

</div>
</CodeTabs>

## Clock skew এবং logical clock

Distributed সিস্টেমে সবচেয়ে বেশি যে ভুলটা হয়, সেটা হলো wall clock দিয়ে ঘটনার ক্রম ঠিক করা। "যার timestamp বড়, সেটা পরে ঘটেছে" — এই নিয়মটা একটা মেশিনে ঠিক, একাধিক মেশিনে ভুল।

কারণগুলো বাস্তব ও নিয়মিত:

- NTP correction ঘড়িকে **পিছিয়ে** দিতে পারে, ফলে একই মেশিনে পরের ঘটনার timestamp আগের ঘটনার চেয়ে ছোট হতে পারে
- ভিন্ন মেশিনের ঘড়িতে সাধারণত কয়েক মিলিসেকেন্ড, খারাপ অবস্থায় কয়েকশ মিলিসেকেন্ড পার্থক্য থাকে
- leap second বা VM migration ঘড়িতে হঠাৎ লাফ তৈরি করে

তাই "last write wins" নিয়মটা যদি wall clock timestamp-এর উপর দাঁড়ানো হয়, আপনি নীরবে write হারাবেন — এবং কোনো error log-এ সেটা দেখা যাবে না।

**Lamport clock** এই সমস্যার সবচেয়ে সরল উত্তর। প্রতিটা নোড একটা counter রাখে। নিজের কোনো ঘটনায় counter এক বাড়ে; বার্তা পাঠানোর সময় counter সঙ্গে যায়; বার্তা পেলে নোড নিজের counter-কে `max(নিজের, প্রাপ্ত) + 1` করে। এতে যা পাওয়া যায় তা হলো: যদি ঘটনা A ঘটনা B-কে প্রভাবিত করে থাকে, তাহলে A-এর counter অবশ্যই B-এর চেয়ে ছোট। উল্টোটা নিশ্চিত নয় — ছোট counter মানেই আগে ঘটেছে তা নয়।

**Vector clock** সেই ফাঁকটা পূরণ করে। প্রতিটা নোড সব নোডের counter-এর একটা তালিকা রাখে। দুটো vector তুলনা করে তিনটা উত্তরের একটা পাওয়া যায়: A আগে, B আগে, অথবা **concurrent** — অর্থাৎ এরা একে অপরকে দেখেনি, তাই কে আগে সেটা প্রশ্নটাই অর্থহীন। এই "concurrent" উত্তরটাই আসল মূল্য, কারণ তখন সিস্টেম জানে যে এখানে সত্যিকারের conflict আছে এবং সেটা merge বা resolve করতে হবে।

```typescript
// --- Lamport clock ---
class LamportClock {
	private counter = 0;

	/** Local event: something happened on this node only. */
	tick(): number {
		this.counter += 1;
		return this.counter;
	}

	/** Attach to an outgoing message. */
	send(): number {
		return this.tick();
	}

	/** Merge a received timestamp. */
	receive(remote: number): number {
		this.counter = Math.max(this.counter, remote) + 1;
		return this.counter;
	}
}

// --- Vector clock ---
type Vector = Record<string, number>;

class VectorClock {
	private vector: Vector = {};

	constructor(private readonly nodeId: string) {
		this.vector[nodeId] = 0;
	}

	tick(): Vector {
		this.vector[this.nodeId] = (this.vector[this.nodeId] ?? 0) + 1;
		return { ...this.vector };
	}

	receive(remote: Vector): Vector {
		for (const [node, value] of Object.entries(remote)) {
			this.vector[node] = Math.max(this.vector[node] ?? 0, value);
		}
		return this.tick();
	}

	static compare(a: Vector, b: Vector): 'before' | 'after' | 'concurrent' | 'equal' {
		const nodes = new Set([...Object.keys(a), ...Object.keys(b)]);
		let aLess = false;
		let bLess = false;

		for (const node of nodes) {
			const av = a[node] ?? 0;
			const bv = b[node] ?? 0;
			if (av < bv) aLess = true;
			if (bv < av) bLess = true;
		}

		if (aLess && bLess) return 'concurrent';
		if (aLess) return 'before';
		if (bLess) return 'after';
		return 'equal';
	}
}

// Two writes to the same profile from different regions
const cordoba = new VectorClock('cordoba');
const bukhara = new VectorClock('bukhara');

const writeFromCordoba = cordoba.tick(); // cordoba: 1
const writeFromBukhara = bukhara.tick(); // bukhara: 1

console.log(VectorClock.compare(writeFromCordoba, writeFromBukhara)); // concurrent
```

<Callout type="info">

Google Spanner এই সমস্যাটা অন্যভাবে সমাধান করে: atomic clock ও GPS দিয়ে ঘড়ির অনিশ্চয়তাকে একটা পরিমাপযোগ্য ব্যবধানে বেঁধে ফেলে (TrueTime), তারপর commit করার আগে সেই ব্যবধান পার হওয়া পর্যন্ত ইচ্ছাকৃতভাবে অপেক্ষা করে। অর্থাৎ তারা ঘড়ির ভুলকে অস্বীকার করে না — ভুলের পরিমাণ জেনে তার জন্য অপেক্ষা করে। বিশেষ hardware ছাড়া এটা করা যায় না, তাই বাকিদের জন্য logical clock-ই বাস্তব উত্তর।

</Callout>

## কখন coordination এড়াবেন

Coordination-এর সবচেয়ে ভালো ব্যবহার হলো কম ব্যবহার। কয়েকটা বাস্তব বিকল্প:

**Partition করে দিন।** প্রতিটা shard-এর একজন করে মালিক থাকলে একই key-তে দুজন লিখবেই না, তাই lock লাগে না। Kafka-র consumer group ঠিক এই কাজটা করে — partition assign হয়ে গেলে ভেতরে আর coordination নেই।

**Idempotent করে দিন।** কাজটা দুবার হলে যদি একবারের মতোই ফল হয়, তাহলে "ঠিক একবার" নিশ্চিত করার দরকার নেই। একটা request id আর একটা unique constraint প্রায়ই একটা পুরো lock সার্ভিসের বিকল্প।

**Merge-যোগ্য ডেটা ব্যবহার করুন।** কাউন্টার, সেট, বা last-writer-wins রেজিস্টারের CRDT সংস্করণ ব্যবহার করলে দুই দিকের write পরে নিরাপদে মিলিয়ে নেওয়া যায়, coordination ছাড়াই।

**Coordination-কে ছোট রাখুন।** যদি coordination লাগেই, তাহলে শুধু metadata coordinate করুন, ডেটা নয়। "কোন নোড কোন shard-এর মালিক" — এটা ছোট, ধীরে বদলায়, এবং consensus-এ রাখা সস্তা। আসল ডেটা coordination-এর বাইরে থাকুক।

<div class="takeaways">

### মূল শেখা

- Coordination-এর দাম তিন জায়গায়: latency floor, single-leader throughput ceiling, আর quorum-নির্ভর availability — তাই যত কম coordinate করবেন সিস্টেম তত ভালো
- সব distributed lock আসলে lease হওয়া উচিত; TTL ছাড়া lock holder ক্র্যাশ করলে চিরকাল আটকে থাকে
- Lease একা নিরাপদ নয় — GC pause বা VM migration-এর কারণে পুরনো holder জেগে উঠে লিখতে পারে; **fencing token রিসোর্সের দিকে যাচাই করাই একমাত্র আসল সুরক্ষা**
- Raft-এর তিনটা স্তম্ভ: term (নিজস্ব fencing token), randomized election timeout (split vote ঠেকায়), আর election restriction (committed entry রক্ষা করে)
- Leader যদি majority-র সাথে যোগাযোগ হারায়, তাকে নিজে থেকে step down করতে হবে — নইলে minority partition থেকে বাসি ডেটা সার্ভ করবে
- Wall clock দিয়ে distributed ঘটনার ক্রম ঠিক করবেন না; causality-র জন্য Lamport clock, আর সত্যিকারের conflict শনাক্ত করার জন্য vector clock
- Partition, idempotency আর merge-যোগ্য ডেটা স্ট্রাকচার দিয়ে বেশিরভাগ coordination পুরোপুরি সরিয়ে ফেলা যায়

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **etcd** Raft-এর উপর চলে এবং Kubernetes-এর পুরো cluster state ধরে রাখে; Kubernetes-এর controller-গুলো etcd-র lease API দিয়েই leader election করে
- **ZooKeeper** ephemeral znode আর zxid ব্যবহার করে — zxid কার্যত একটা fencing token, আর HBase বা Kafka-র পুরনো সংস্করণ এর উপরেই দাঁড়িয়ে ছিল
- **HDFS NameNode** fencing ছাড়া split-brain-এ ডেটা নষ্ট হতো, তাই এখন epoch number দিয়ে পুরনো NameNode-এর write আটকানো হয়
- **Amazon DynamoDB** vector clock-জাতীয় versioning দিয়ে concurrent write শনাক্ত করে এবং application-কে merge করতে দেয়
- **Google Spanner** TrueTime দিয়ে clock uncertainty পরিমাপ করে এবং commit-এ ইচ্ছাকৃত wait যোগ করে external consistency পায়
- Redis-ভিত্তিক lock (Redlock সহ) ব্যবহার করুন কেবল সেখানে যেখানে দুবার কাজ হওয়া অপচয়, ক্ষতি নয় — correctness lock-এর জন্য টোকেন-সমর্থিত ব্যবস্থা লাগবে

</div>
