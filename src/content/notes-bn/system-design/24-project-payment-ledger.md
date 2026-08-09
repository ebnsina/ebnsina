---
title: 'প্রজেক্ট: পেমেন্ট লেজার'
subtitle: 'এমন একটা সিস্টেম ডিজাইন করা যেখানে availability-র চেয়ে correctness বড় — double-entry, exactly-once money movement, reconciliation আর provider ডাউন হলে কী হয়।'
chapter: 24
level: 'mastery'
readingTime: '৩৫ মিনিট'
topics: ['payment ledger', 'double-entry', 'idempotency', 'reconciliation', 'saga', 'immutability']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

বাগদাদের বাজারের এক কোণে ইবনে সিনার একটা সররাফের কাউন্টার — টাকা ভাঙানো, হুন্ডি পাঠানো, আমানত রাখা। কাউন্টারের পেছনে দেয়ালজোড়া তাক, আর তাকের মাঝখানে একটা মোটা চামড়ায় বাঁধানো খাতা। এই খাতাটার নিয়ম একটাই, আর সেটা ইবনে সিনার বাবা তাকে শিখিয়েছিলেন: **কোনো লাইন কখনো একা বসে না**। এক ঘরে যদি পাঁচশো দিরহাম কমে, তবে ঠিক সেই মুহূর্তে অন্য কোনো ঘরে পাঁচশো দিরহাম বাড়তেই হবে। টাকা জন্মায় না, টাকা মরে না — টাকা শুধু এক ঘর থেকে আরেক ঘরে সরে। দিনের শেষে ইবনে সিনা খাতার সব বাঁ দিকের সংখ্যা যোগ করে, সব ডান দিকের সংখ্যা যোগ করে, আর দুটো মেলে কিনা দেখে। না মিললে সে বাড়ি যায় না। এক পয়সার গরমিলও না — কারণ এক পয়সার গরমিল মানে কোথাও একটা লাইন হারিয়ে গেছে বা দুইবার বসেছে, আর সেই ভুল কালকে দশ পয়সা, পরশু একশো দিরহাম হয়ে দাঁড়াবে।

খাতার আরেকটা নিয়ম আছে যেটা বাইরের লোকের কাছে অদ্ভুত লাগে: **ইবনে সিনা কখনো কিছু কাটে না**। ভুল হলে সে ভুল লাইনটা মুছে দেয় না, ঘষে না, নতুন করে লেখে না। ভুল লাইনটা যেমন আছে তেমনই থাকে, আর তার নিচে সে একটা নতুন লাইন বসায় যেটা ঠিক উল্টো দিকে সমান অঙ্কের — আগের ভুলটাকে বাতিল করে দেয় — তারপর তৃতীয় একটা লাইনে সঠিক হিসাবটা লেখে। ফলে খাতা দেখে যে কেউ বলতে পারে কী ভুল হয়েছিল, কখন ধরা পড়েছিল, আর কে শুধরেছিল। কাজি সাহেব যদি তিন বছর পর এসে জিজ্ঞেস করেন "১২ রজব তারিখে আল-বিরুনির ঘরে ঠিক কত ছিল?" — ইবনে সিনা শুরু থেকে ওই তারিখ পর্যন্ত সব লাইন যোগ করে হুবহু সংখ্যাটা বার করে দিতে পারে। খাতা তার কাছে হিসাবের ফলাফল নয়, হিসাবের ইতিহাস।

তৃতীয় নিয়মটা ভিড়ের দিনের জন্য। প্রতিটা লেনদেনের রসিদে একটা করে ছাপানো সিরিয়াল নম্বর থাকে, আর ইবনে সিনার সামনে একটা ছোট তালিকা — আজকে কোন কোন সিরিয়াল সে পাস করেছে। আল-খোয়ারিজমি যদি ভিড়ের ঠেলায়, বা "ভাই আমার টাকাটা গেল কিনা বুঝলাম না" বলে, একই রসিদ দ্বিতীয়বার কাউন্টারে বাড়িয়ে দেয় — ইবনে সিনা তালিকা দেখে বলে দেয় "এটা তো সকালেই হয়ে গেছে", আর তাকে আগের সেই এন্ট্রির ফলাফলটাই দেখিয়ে দেয়। নতুন কোনো লাইন বসে না, টাকা দ্বিতীয়বার নড়ে না। আল-খোয়ারিজমি একই রসিদ দশবার আনলেও ফল একই থাকে।

আর চতুর্থ নিয়ম হলো বাইরের দুনিয়ার জন্য। ইবনে সিনার নিজের ভল্টের বাইরেও টাকা যায় — সে দামেস্কের এক হুন্ডিওয়ালার মাধ্যমে টাকা পাঠায়। সেই হুন্ডিওয়ালার নিজের খাতা আছে, আর ইবনে সিনা সেটা দেখতে পায় না। তাই সে দুটো কাজ করে। এক, টাকা পাঠানোর _আগেই_ সে নিজের খাতায় টাকাটা একটা "পথে আছে" ঘরে সরিয়ে রাখে — গ্রাহকের ঘর থেকে কমে, কিন্তু এখনো গন্তব্যে পৌঁছায়নি, মাঝখানের একটা ঘরে ঝুলে থাকে। দুই, প্রতি সপ্তাহে দামেস্ক থেকে আসা কাগজের সাথে সে নিজের খাতা লাইন-বাই-লাইন মেলায়: কোনটা দুই খাতাতেই আছে, কোনটা তার খাতায় আছে কিন্তু দামেস্কে নেই, কোনটা দামেস্কে আছে কিন্তু তার খাতায় নেই। যা মেলে না, সেটাই তদন্তের বিষয়। হুন্ডিওয়ালার দোকান কোনো দিন বন্ধ থাকলে ইবনে সিনা গ্রাহককে "হয়েছে" বলে না — বলে "গ্রহণ করেছি, পথে আছে", আর টাকাটা মাঝখানের ঘরেই বসে থাকে যতক্ষণ না নিশ্চিত খবর আসে।

মিলিয়ে নিই। ইবনে সিনার প্রতিটা লেনদেনে দুই ঘরে সমান-উল্টো লাইন বসানো হলো **double-entry ledger**, আর দিনশেষে বাঁ-ডান যোগ মেলানো হলো **balance invariant** — সব entry-র যোগফল সবসময় শূন্য। কিছু না কাটা, ভুল শোধরাতে উল্টো লাইন বসানো হলো **immutable append-only ledger** আর সেই উল্টো লাইনটাই **reversal entry**; শুরু থেকে যোগ করে যেকোনো তারিখের ব্যালেন্স বার করা হলো **event sourcing** ও **point-in-time balance**। রসিদের সিরিয়াল নম্বর হলো **idempotency key**, আর একই রসিদ দশবার এলেও একবারই টাকা নড়া হলো **exactly-once money movement**। মাঝখানের "পথে আছে" ঘরটা হলো **suspense / in-flight account**, দুই খাতা লাইন-বাই-লাইন মেলানো হলো **reconciliation**, আর "হয়েছে" না বলে "গ্রহণ করেছি, পথে আছে" বলাটাই হলো **correctness over availability** — নিশ্চিত না হয়ে কখনো নিশ্চয়তা না দেওয়া। এই চ্যাপ্টারে আমরা ঠিক এই কাউন্টারটাই কোডে বানাব।

## এই সিস্টেমটা আগেরগুলোর চেয়ে আলাদা কেন

এতদিন আমরা যা ডিজাইন করেছি — URL shortener, social feed, ride-hailing — সবগুলোতেই একটা সাধারণ সুর ছিল: availability আগে, correctness পরে। একটা feed item কয়েক সেকেন্ড দেরিতে দেখালে কেউ মরে না। একটা ride ETA দুই মিনিট ভুল হলে গ্রাহক বিরক্ত হয়, ব্যস।

লেজার সম্পূর্ণ উল্টো দিকে দাঁড়ানো। এখানে **ভুল উত্তর দেওয়ার চেয়ে কোনো উত্তর না দেওয়া ভালো**। CAP-এর ভাষায় আমরা সচেতনভাবে CP বেছে নিচ্ছি — partition হলে আমরা unavailable হব, কিন্তু ভুল ব্যালেন্স দেখাব না। চ্যাপ্টার ১৩-তে consistency নিয়ে যে আলোচনা হয়েছিল, এই চ্যাপ্টার তার সবচেয়ে কড়া প্রয়োগ।

এর ব্যবহারিক ফল কয়েকটা:

- একটা write যদি নিশ্চিতভাবে commit হয়েছে বলতে না পারি, আমরা ক্লায়েন্টকে success ফেরত দিই না।
- eventual consistency ব্যালেন্সের জন্য অগ্রহণযোগ্য। ব্যালেন্স পড়া মানে primary থেকে পড়া, replica থেকে নয় — অথবা replica থেকে পড়লে স্পষ্টভাবে "as of" timestamp সহ পড়া।
- retry কখনোই ঐচ্ছিক নয়, আবার retry কখনোই নিরাপদও নয় — যতক্ষণ না প্রতিটা operation idempotent।
- যেকোনো cache যেটা ব্যালেন্স ধরে রাখে সেটা একটা bug, যতক্ষণ না সেটার invalidation প্রমাণযোগ্য।

<Callout type="warning">

লেজারে কখনো write-behind cache, fire-and-forget queue, বা "best effort" delivery ব্যবহার করবেন না। চ্যাপ্টার ২-এ write-behind নিয়ে যে সতর্কবার্তা ছিল, এটা তার চূড়ান্ত উদাহরণ — কয়েক সেকেন্ডের write হারানো এখানে সরাসরি টাকা হারানো।

</Callout>

## Requirements

**Functional**

- অ্যাকাউন্টের মধ্যে টাকা সরানো (transfer), বাইরে থেকে টাকা আনা (deposit), বাইরে পাঠানো (payout)
- যেকোনো মুহূর্তে, এবং যেকোনো অতীত মুহূর্তে, যেকোনো অ্যাকাউন্টের সঠিক ব্যালেন্স
- একই idempotency key দিয়ে যতবার খুশি retry — ফল একবারই
- external payment provider-এর সাথে saga: authorize → capture → settle, এবং যেকোনো ধাপে compensating action
- provider statement-এর সাথে দৈনিক ও চলমান reconciliation
- সম্পূর্ণ audit trail — কে, কখন, কী, কোন কারণে

**Non-functional**

- শূন্য টাকা হারানো, শূন্য duplicate movement — এটা negotiable নয়
- ব্যালেন্স invariant সবসময় সত্য: প্রতিটা transaction-এর entry-গুলোর যোগফল ঠিক শূন্য
- লেজার append-only — কোনো UPDATE নেই, কোনো DELETE নেই
- write path p99 ৩০০ms, তবে correctness-এর জন্য latency ছেড়ে দিতে রাজি
- ৯৯.৯% availability যথেষ্ট (৯৯.৯৯% নয়) — কারণ আমরা সন্দেহ হলেই থেমে যাই
- ৭ বছরের retention, regulator-এর জন্য reproducible

<Callout type="info">

লক্ষ করুন availability target ইচ্ছে করেই কম রাখা হয়েছে। এটা দুর্বলতা নয়, ডিজাইন সিদ্ধান্ত। চ্যাপ্টার ১৮-এর SLO আলোচনার ভাষায়: আমাদের error budget-টা downtime-এ খরচ করা যায়, কিন্তু ভুল ব্যালেন্সে খরচ করা যায় না।

</Callout>

## হাই-লেভেল আর্কিটেকচার

<Mermaid
title="Payment Ledger Architecture"
code={`graph TD
  API["Ledger API<br/>Idempotency Guard"] --> TX["Transaction Service<br/>Balanced Entry Builder"]
  TX --> LG["Ledger Store<br/>Append Only"]
  TX --> BAL["Balance Projection<br/>Materialised"]
  API --> SG["Saga Coordinator<br/>Authorize Capture Settle"]
  SG --> PRV["Provider Adapter<br/>External PSP"]
  PRV --> RC["Reconciliation Engine<br/>Three Way Match"]
  LG --> RC
  RC --> AL["Audit Log<br/>Hash Chained"]`}
/>

চারটে অংশ আলাদা করে চেনা দরকার:

1. **Ledger store** — সত্যের একমাত্র উৎস। শুধু append হয়, কখনো বদলায় না।
2. **Balance projection** — লেজার থেকে derive করা, দ্রুত পড়ার জন্য। হারিয়ে গেলে লেজার থেকে আবার বানানো যায়। এটাই চ্যাপ্টার ১৬-এর CQRS-এর read model।
3. **Saga coordinator** — বাইরের জগতের সাথে multi-step লেনদেন চালায়, যেখানে distributed transaction সম্ভব নয়।
4. **Reconciliation engine** — আমাদের সত্য আর বাইরের সত্য মেলায়।

## ডেটা মডেল

লেজারের ডেটা মডেল আশ্চর্যরকম ছোট। জটিলতা টেবিলের সংখ্যায় নয়, নিয়মে।

```sql
-- Accounts. Type decides the sign convention and who owns the money.
CREATE TABLE accounts (
    id              BIGSERIAL PRIMARY KEY,
    account_ref     TEXT        NOT NULL UNIQUE,   -- 'user:ibn-sina:wallet'
    owner_id        TEXT        NOT NULL,
    account_type    TEXT        NOT NULL,          -- asset | liability | revenue | expense | suspense
    currency        CHAR(3)     NOT NULL,
    allow_negative  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A transaction is a group of entries that must sum to zero.
CREATE TABLE ledger_transactions (
    id              BIGSERIAL PRIMARY KEY,
    transaction_ref UUID        NOT NULL UNIQUE,
    idempotency_key TEXT        NOT NULL UNIQUE,
    kind            TEXT        NOT NULL,          -- transfer | deposit | payout | reversal
    reverses_ref    UUID        NULL REFERENCES ledger_transactions(transaction_ref),
    description     TEXT        NOT NULL,
    metadata        JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The immutable core. No UPDATE, no DELETE, ever.
CREATE TABLE ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    transaction_id  BIGINT      NOT NULL REFERENCES ledger_transactions(id),
    account_id      BIGINT      NOT NULL REFERENCES accounts(id),
    -- Signed minor units. Debit is positive, credit is negative.
    -- The sum of all amounts within one transaction is exactly zero.
    amount          BIGINT      NOT NULL,
    currency        CHAR(3)     NOT NULL,
    sequence_no     BIGINT      NOT NULL,          -- global monotonic ordering
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entries_account_seq ON ledger_entries (account_id, sequence_no);
CREATE UNIQUE INDEX idx_entries_global_seq ON ledger_entries (sequence_no);

-- Materialised balance. A projection, not the truth.
CREATE TABLE account_balances (
    account_id      BIGINT      PRIMARY KEY REFERENCES accounts(id),
    balance         BIGINT      NOT NULL DEFAULT 0,
    last_sequence   BIGINT      NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency records: the request fingerprint and the stored response.
CREATE TABLE idempotency_records (
    key             TEXT        PRIMARY KEY,
    request_hash    TEXT        NOT NULL,
    status          TEXT        NOT NULL,          -- in_progress | completed | failed
    response_body   JSONB       NULL,
    transaction_ref UUID        NULL,
    locked_until    TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

দুটো জিনিস খেয়াল করুন।

**Amount signed, আলাদা debit/credit কলাম নয়।** একটা `debit_amount` আর একটা `credit_amount` কলাম রাখলে প্রতিটা query-তে দুটো যোগ করতে হয় আর invariant চেক করা ঝামেলার। signed integer-এ invariant হয়ে যায় "যোগফল শূন্য" — একটা লাইনের SQL।

**Minor unit-এ integer, কখনো float নয়।** ১০.১০ টাকা মানে `1010` পয়সা। floating point-এ টাকা রাখা মানে ০.১ + ০.২ ≠ ০.৩ — আর সেই ০.০০০০০০০০০০০০০০০০০৪ দিনশেষে reconciliation ভাঙবে।

<Callout type="warning">

কারেন্সি মেশাবেন না। একটা transaction-এর সব entry একই currency-র হতে হবে; মুদ্রা বদলানো মানে দুটো আলাদা transaction আর মাঝখানে একটা FX account, যেখানে rate spread স্পষ্ট entry হিসেবে বসে। একই transaction-এ দুই currency মিশিয়ে ফেললে "যোগফল শূন্য" invariant অর্থহীন হয়ে যায়।

</Callout>

## অ্যাকাউন্ট টাইপ আর sign convention

| টাইপ      | উদাহরণ                     | debit (+) মানে         | credit (−) মানে |
| --------- | -------------------------- | ---------------------- | --------------- |
| asset     | `bank:settlement:baghdad`  | আমাদের হাতে টাকা বাড়ল | কমল             |
| liability | `user:ibn-sina:wallet`     | ইউজারের পাওনা কমল      | পাওনা বাড়ল     |
| revenue   | `revenue:fees`             | ফি ফেরত গেল            | ফি আয় হলো      |
| expense   | `expense:provider-fees`    | খরচ হলো                | খরচ ফেরত এলো    |
| suspense  | `suspense:payout-inflight` | পথ থেকে ফিরল           | পথে গেল         |

ইউজারের wallet একটা **liability** — টাকাটা আমাদের নয়, আমরা ইউজারের হয়ে ধরে রেখেছি। এই একটা ব্যাপার নতুনরা প্রায়ই উল্টো ভাবে, আর ফলে সব sign উল্টে যায়।

আল-খোয়ারিজমি ইবনে সিনাকে ৫০০ পাঠালে entry-গুলো এরকম:

```
transaction: transfer, idempotency_key=txn-al-khwarizmi-0417
  entry 1: user:al-khwarizmi:wallet   +500   (liability debit  -> owe him less)
  entry 2: user:ibn-sina:wallet       -500   (liability credit -> owe him more)
  sum = 0
```

ফি নিলে তিন লাইন:

```
transaction: transfer with fee
  entry 1: user:al-khwarizmi:wallet   +510
  entry 2: user:ibn-sina:wallet       -500
  entry 3: revenue:fees                -10
  sum = 0
```

## কোর: balanced transaction writer

এবার আসল কোড। এই সার্ভিসটার তিনটে দায়িত্ব: idempotency নিশ্চিত করা, entry-গুলো balance হয় কিনা যাচাই করা, আর একটা atomic transaction-এ লেজার ও projection দুটোই লেখা।

<CodeTabs tsFile="ledger-service.ts" goFile="ledger-service.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

// --- Domain types ---

export interface EntryInput {
	accountRef: string;
	/** Signed minor units. Debit positive, credit negative. */
	amount: bigint;
}

export interface PostRequest {
	idempotencyKey: string;
	kind: 'transfer' | 'deposit' | 'payout' | 'reversal';
	currency: string;
	description: string;
	entries: EntryInput[];
	metadata?: Record<string, unknown>;
	reversesRef?: string;
}

export interface PostResult {
	transactionRef: string;
	sequenceNo: string;
	replayed: boolean;
	balances: Record<string, string>;
}

export class LedgerError extends Error {
	constructor(
		public readonly code: string,
		message: string
	) {
		super(message);
		this.name = 'LedgerError';
	}
}

// --- Helpers ---

function canonicalHash(req: PostRequest): string {
	// Stable fingerprint of the *meaningful* request fields. Two calls with the
	// same idempotency key but different bodies must be rejected, not replayed.
	const canonical = JSON.stringify({
		kind: req.kind,
		currency: req.currency,
		reversesRef: req.reversesRef ?? null,
		entries: [...req.entries]
			.map((e) => ({ a: e.accountRef, v: e.amount.toString() }))
			.sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.v.localeCompare(y.v)))
	});
	return crypto.createHash('sha256').update(canonical).digest('hex');
}

function assertBalanced(entries: EntryInput[]): void {
	if (entries.length < 2) {
		throw new LedgerError('UNBALANCED', 'a transaction needs at least two entries');
	}
	let sum = 0n;
	for (const e of entries) {
		if (e.amount === 0n) {
			throw new LedgerError('ZERO_ENTRY', `zero amount entry for ${e.accountRef}`);
		}
		sum += e.amount;
	}
	if (sum !== 0n) {
		throw new LedgerError('UNBALANCED', `entries sum to ${sum}, expected 0`);
	}
}

// --- Service ---

export class LedgerService {
	constructor(private readonly pool: Pool) {}

	async post(req: PostRequest): Promise<PostResult> {
		assertBalanced(req.entries);
		const fingerprint = canonicalHash(req);

		// Phase 1: claim the idempotency key in its own short transaction so a
		// concurrent duplicate blocks here rather than deep inside the ledger write.
		const claim = await this.claimIdempotencyKey(req.idempotencyKey, fingerprint);
		if (claim.kind === 'replay') {
			return { ...(claim.response as PostResult), replayed: true };
		}

		// Phase 2: the real work.
		const client = await this.pool.connect();
		try {
			await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
			const result = await this.writeTransaction(client, req);
			await client.query(
				`UPDATE idempotency_records
				    SET status = 'completed', response_body = $2, transaction_ref = $3, locked_until = NULL
				  WHERE key = $1`,
				[req.idempotencyKey, JSON.stringify(result), result.transactionRef]
			);
			await client.query('COMMIT');
			return result;
		} catch (err) {
			await client.query('ROLLBACK');
			// Release the claim so a retry can make progress. If this fails the
			// lease expiry is the backstop.
			await this.pool
				.query(
					`UPDATE idempotency_records SET status = 'failed', locked_until = NULL WHERE key = $1`,
					[req.idempotencyKey]
				)
				.catch(() => undefined);
			throw err;
		} finally {
			client.release();
		}
	}

	private async claimIdempotencyKey(
		key: string,
		fingerprint: string
	): Promise<{ kind: 'claimed' } | { kind: 'replay'; response: unknown }> {
		const { rows } = await this.pool.query(
			`INSERT INTO idempotency_records (key, request_hash, status, locked_until)
			 VALUES ($1, $2, 'in_progress', now() + interval '60 seconds')
			 ON CONFLICT (key) DO UPDATE
			    SET status = 'in_progress',
			        locked_until = now() + interval '60 seconds'
			  WHERE idempotency_records.status = 'failed'
			     OR (idempotency_records.status = 'in_progress'
			         AND idempotency_records.locked_until < now())
			 RETURNING status, request_hash, response_body`,
			[key, fingerprint]
		);

		if (rows.length > 0) {
			if (rows[0].request_hash !== fingerprint) {
				throw new LedgerError(
					'IDEMPOTENCY_MISMATCH',
					'idempotency key reused with a different request body'
				);
			}
			return { kind: 'claimed' };
		}

		// No row returned: an existing record blocked the upsert.
		const existing = await this.pool.query(
			`SELECT status, request_hash, response_body FROM idempotency_records WHERE key = $1`,
			[key]
		);
		const rec = existing.rows[0];
		if (!rec) throw new LedgerError('RETRY', 'idempotency race, retry the request');
		if (rec.request_hash !== fingerprint) {
			throw new LedgerError(
				'IDEMPOTENCY_MISMATCH',
				'idempotency key reused with a different request body'
			);
		}
		if (rec.status === 'completed') {
			return { kind: 'replay', response: rec.response_body };
		}
		// Still in progress and the lease is live: tell the caller to come back.
		throw new LedgerError('IN_PROGRESS', 'an identical request is currently being processed');
	}

	private async writeTransaction(client: PoolClient, req: PostRequest): Promise<PostResult> {
		// Resolve accounts and lock the balance rows in a deterministic order to
		// avoid deadlocks between concurrent transfers touching the same pair.
		const refs = [...new Set(req.entries.map((e) => e.accountRef))].sort();
		const accounts = await client.query(
			`SELECT a.id, a.account_ref, a.currency, a.allow_negative, b.balance
			   FROM accounts a
			   JOIN account_balances b ON b.account_id = a.id
			  WHERE a.account_ref = ANY($1)
			  ORDER BY a.account_ref
			    FOR UPDATE OF b`,
			[refs]
		);
		if (accounts.rowCount !== refs.length) {
			const found = new Set(accounts.rows.map((r) => r.account_ref));
			const missing = refs.filter((r) => !found.has(r));
			throw new LedgerError('ACCOUNT_NOT_FOUND', `unknown accounts: ${missing.join(', ')}`);
		}

		const byRef = new Map(accounts.rows.map((r) => [r.account_ref as string, r]));
		for (const row of accounts.rows) {
			if (row.currency !== req.currency) {
				throw new LedgerError(
					'CURRENCY_MISMATCH',
					`account ${row.account_ref} is ${row.currency}, transaction is ${req.currency}`
				);
			}
		}

		const txRef = crypto.randomUUID();
		const txInsert = await client.query(
			`INSERT INTO ledger_transactions
			   (transaction_ref, idempotency_key, kind, reverses_ref, description, metadata)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id`,
			[
				txRef,
				req.idempotencyKey,
				req.kind,
				req.reversesRef ?? null,
				req.description,
				JSON.stringify(req.metadata ?? {})
			]
		);
		const txId = txInsert.rows[0].id as string;

		// One global sequence keeps the ledger totally ordered, which makes
		// point-in-time balances and reconciliation cursors trivial.
		const seqRow = await client.query(`SELECT nextval('ledger_sequence') AS seq`);
		const sequenceNo = BigInt(seqRow.rows[0].seq);

		const balances: Record<string, string> = {};
		// Aggregate per account first: a transaction may touch one account twice.
		const deltas = new Map<string, bigint>();
		for (const e of req.entries) {
			deltas.set(e.accountRef, (deltas.get(e.accountRef) ?? 0n) + e.amount);
		}

		for (const e of req.entries) {
			const acc = byRef.get(e.accountRef);
			await client.query(
				`INSERT INTO ledger_entries
				   (transaction_id, account_id, amount, currency, sequence_no)
				 VALUES ($1, $2, $3, $4, $5)`,
				[txId, acc.id, e.amount.toString(), req.currency, sequenceNo.toString()]
			);
		}

		for (const ref of refs) {
			const acc = byRef.get(ref);
			const delta = deltas.get(ref) ?? 0n;
			const next = BigInt(acc.balance) + delta;
			// For a liability account the customer's spendable money is -balance,
			// so an overdraft check compares against the signed balance directly.
			if (!acc.allow_negative && next > 0n && acc.account_type === 'liability') {
				throw new LedgerError('INSUFFICIENT_FUNDS', `account ${ref} would go negative`);
			}
			if (!acc.allow_negative && next < 0n && acc.account_type === 'asset') {
				throw new LedgerError('INSUFFICIENT_FUNDS', `account ${ref} would go negative`);
			}
			await client.query(
				`UPDATE account_balances
				    SET balance = $2, last_sequence = $3, updated_at = now()
				  WHERE account_id = $1`,
				[acc.id, next.toString(), sequenceNo.toString()]
			);
			balances[ref] = next.toString();
		}

		// Belt and braces: prove the invariant inside the same transaction.
		const check = await client.query(
			`SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries WHERE transaction_id = $1`,
			[txId]
		);
		if (BigInt(check.rows[0].total) !== 0n) {
			throw new LedgerError('UNBALANCED', 'post-write invariant check failed');
		}

		return { transactionRef: txRef, sequenceNo: sequenceNo.toString(), replayed: false, balances };
	}

	/**
	 * Reverse a transaction by appending the mirror image. Nothing is ever
	 * updated or deleted; the original stays visible forever.
	 */
	async reverse(originalRef: string, reason: string, idempotencyKey: string): Promise<PostResult> {
		const { rows } = await this.pool.query(
			`SELECT t.transaction_ref, t.kind, e.amount, e.currency, a.account_ref
			   FROM ledger_transactions t
			   JOIN ledger_entries e ON e.transaction_id = t.id
			   JOIN accounts a ON a.id = e.account_id
			  WHERE t.transaction_ref = $1`,
			[originalRef]
		);
		if (rows.length === 0) {
			throw new LedgerError('NOT_FOUND', `transaction ${originalRef} not found`);
		}

		const already = await this.pool.query(
			`SELECT 1 FROM ledger_transactions WHERE reverses_ref = $1`,
			[originalRef]
		);
		if (already.rowCount > 0) {
			throw new LedgerError('ALREADY_REVERSED', `transaction ${originalRef} is already reversed`);
		}

		return this.post({
			idempotencyKey,
			kind: 'reversal',
			currency: rows[0].currency,
			description: `reversal of ${originalRef}: ${reason}`,
			reversesRef: originalRef,
			entries: rows.map((r) => ({ accountRef: r.account_ref, amount: -BigInt(r.amount) })),
			metadata: { reason, reverses: originalRef }
		});
	}

	/** Balance derived from the ledger itself, ignoring the projection. */
	async authoritativeBalance(accountRef: string, asOfSequence?: bigint): Promise<bigint> {
		const { rows } = await this.pool.query(
			`SELECT COALESCE(SUM(e.amount), 0) AS total
			   FROM ledger_entries e
			   JOIN accounts a ON a.id = e.account_id
			  WHERE a.account_ref = $1
			    AND ($2::bigint IS NULL OR e.sequence_no <= $2::bigint)`,
			[accountRef, asOfSequence?.toString() ?? null]
		);
		return BigInt(rows[0].total);
	}
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package ledger

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
)

// --- Domain types ---

type EntryInput struct {
	AccountRef string `json:"accountRef"`
	// Signed minor units. Debit positive, credit negative.
	Amount int64 `json:"amount"`
}

type PostRequest struct {
	IdempotencyKey string                 `json:"idempotencyKey"`
	Kind           string                 `json:"kind"`
	Currency       string                 `json:"currency"`
	Description    string                 `json:"description"`
	Entries        []EntryInput           `json:"entries"`
	Metadata       map[string]interface{} `json:"metadata"`
	ReversesRef    *string                `json:"reversesRef,omitempty"`
}

type PostResult struct {
	TransactionRef string            `json:"transactionRef"`
	SequenceNo     int64             `json:"sequenceNo"`
	Replayed       bool              `json:"replayed"`
	Balances       map[string]int64  `json:"balances"`
}

type LedgerError struct {
	Code    string
	Message string
}

func (e *LedgerError) Error() string { return e.Code + ": " + e.Message }

func newErr(code, format string, args ...interface{}) error {
	return &LedgerError{Code: code, Message: fmt.Sprintf(format, args...)}
}

// --- Helpers ---

func canonicalHash(req PostRequest) string {
	type ce struct {
		A string `json:"a"`
		V int64  `json:"v"`
	}
	entries := make([]ce, 0, len(req.Entries))
	for _, e := range req.Entries {
		entries = append(entries, ce{A: e.AccountRef, V: e.Amount})
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].A != entries[j].A {
			return entries[i].A < entries[j].A
		}
		return entries[i].V < entries[j].V
	})
	rev := ""
	if req.ReversesRef != nil {
		rev = *req.ReversesRef
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"kind":        req.Kind,
		"currency":    req.Currency,
		"reversesRef": rev,
		"entries":     entries,
	})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func assertBalanced(entries []EntryInput) error {
	if len(entries) < 2 {
		return newErr("UNBALANCED", "a transaction needs at least two entries")
	}
	var sum int64
	for _, e := range entries {
		if e.Amount == 0 {
			return newErr("ZERO_ENTRY", "zero amount entry for %s", e.AccountRef)
		}
		sum += e.Amount
	}
	if sum != 0 {
		return newErr("UNBALANCED", "entries sum to %d, expected 0", sum)
	}
	return nil
}

// --- Service ---

type Service struct {
	db *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{db: db} }

func (s *Service) Post(ctx context.Context, req PostRequest) (*PostResult, error) {
	if err := assertBalanced(req.Entries); err != nil {
		return nil, err
	}
	fingerprint := canonicalHash(req)

	replayed, stored, err := s.claimIdempotencyKey(ctx, req.IdempotencyKey, fingerprint)
	if err != nil {
		return nil, err
	}
	if replayed {
		stored.Replayed = true
		return stored, nil
	}

	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	result, err := s.writeTransaction(ctx, tx, req)
	if err != nil {
		_, _ = s.db.ExecContext(ctx,
			`UPDATE idempotency_records SET status = 'failed', locked_until = NULL WHERE key = $1`,
			req.IdempotencyKey)
		return nil, err
	}

	body, _ := json.Marshal(result)
	if _, err := tx.ExecContext(ctx,
		`UPDATE idempotency_records
		    SET status = 'completed', response_body = $2, transaction_ref = $3, locked_until = NULL
		  WHERE key = $1`,
		req.IdempotencyKey, body, result.TransactionRef); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) claimIdempotencyKey(ctx context.Context, key, fingerprint string) (bool, *PostResult, error) {
	row := s.db.QueryRowContext(ctx,
		`INSERT INTO idempotency_records (key, request_hash, status, locked_until)
		 VALUES ($1, $2, 'in_progress', now() + interval '60 seconds')
		 ON CONFLICT (key) DO UPDATE
		    SET status = 'in_progress',
		        locked_until = now() + interval '60 seconds'
		  WHERE idempotency_records.status = 'failed'
		     OR (idempotency_records.status = 'in_progress'
		         AND idempotency_records.locked_until < now())
		 RETURNING request_hash`, key, fingerprint)

	var gotHash string
	switch err := row.Scan(&gotHash); err {
	case nil:
		if gotHash != fingerprint {
			return false, nil, newErr("IDEMPOTENCY_MISMATCH", "idempotency key reused with a different request body")
		}
		return false, nil, nil
	case sql.ErrNoRows:
		// An existing record blocked the upsert; inspect it.
	default:
		return false, nil, err
	}

	var status, storedHash string
	var body []byte
	err := s.db.QueryRowContext(ctx,
		`SELECT status, request_hash, COALESCE(response_body, '{}'::jsonb)
		   FROM idempotency_records WHERE key = $1`, key).Scan(&status, &storedHash, &body)
	if err == sql.ErrNoRows {
		return false, nil, newErr("RETRY", "idempotency race, retry the request")
	}
	if err != nil {
		return false, nil, err
	}
	if storedHash != fingerprint {
		return false, nil, newErr("IDEMPOTENCY_MISMATCH", "idempotency key reused with a different request body")
	}
	if status == "completed" {
		var stored PostResult
		if err := json.Unmarshal(body, &stored); err != nil {
			return false, nil, err
		}
		return true, &stored, nil
	}
	return false, nil, newErr("IN_PROGRESS", "an identical request is currently being processed")
}

type accountRow struct {
	ID            int64
	Ref           string
	Currency      string
	AccountType   string
	AllowNegative bool
	Balance       int64
}

func (s *Service) writeTransaction(ctx context.Context, tx *sql.Tx, req PostRequest) (*PostResult, error) {
	seen := map[string]struct{}{}
	refs := make([]string, 0, len(req.Entries))
	for _, e := range req.Entries {
		if _, ok := seen[e.AccountRef]; !ok {
			seen[e.AccountRef] = struct{}{}
			refs = append(refs, e.AccountRef)
		}
	}
	// Deterministic lock order prevents deadlocks between concurrent transfers.
	sort.Strings(refs)

	rows, err := tx.QueryContext(ctx,
		`SELECT a.id, a.account_ref, a.currency, a.account_type, a.allow_negative, b.balance
		   FROM accounts a
		   JOIN account_balances b ON b.account_id = a.id
		  WHERE a.account_ref = ANY($1)
		  ORDER BY a.account_ref
		    FOR UPDATE OF b`, pgTextArray(refs))
	if err != nil {
		return nil, err
	}
	byRef := map[string]*accountRow{}
	for rows.Next() {
		var a accountRow
		if err := rows.Scan(&a.ID, &a.Ref, &a.Currency, &a.AccountType, &a.AllowNegative, &a.Balance); err != nil {
			rows.Close()
			return nil, err
		}
		byRef[a.Ref] = &a
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(byRef) != len(refs) {
		missing := []string{}
		for _, r := range refs {
			if _, ok := byRef[r]; !ok {
				missing = append(missing, r)
			}
		}
		return nil, newErr("ACCOUNT_NOT_FOUND", "unknown accounts: %s", strings.Join(missing, ", "))
	}
	for _, a := range byRef {
		if a.Currency != req.Currency {
			return nil, newErr("CURRENCY_MISMATCH", "account %s is %s, transaction is %s", a.Ref, a.Currency, req.Currency)
		}
	}

	txRef := uuid.NewString()
	meta, _ := json.Marshal(req.Metadata)
	if meta == nil {
		meta = []byte("{}")
	}

	var txID int64
	if err := tx.QueryRowContext(ctx,
		`INSERT INTO ledger_transactions
		   (transaction_ref, idempotency_key, kind, reverses_ref, description, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		txRef, req.IdempotencyKey, req.Kind, req.ReversesRef, req.Description, meta,
	).Scan(&txID); err != nil {
		return nil, err
	}

	var sequenceNo int64
	if err := tx.QueryRowContext(ctx, `SELECT nextval('ledger_sequence')`).Scan(&sequenceNo); err != nil {
		return nil, err
	}

	deltas := map[string]int64{}
	for _, e := range req.Entries {
		deltas[e.AccountRef] += e.Amount
		acc := byRef[e.AccountRef]
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO ledger_entries (transaction_id, account_id, amount, currency, sequence_no)
			 VALUES ($1, $2, $3, $4, $5)`,
			txID, acc.ID, e.Amount, req.Currency, sequenceNo); err != nil {
			return nil, err
		}
	}

	balances := map[string]int64{}
	for _, ref := range refs {
		acc := byRef[ref]
		next := acc.Balance + deltas[ref]
		if !acc.AllowNegative {
			if acc.AccountType == "liability" && next > 0 {
				return nil, newErr("INSUFFICIENT_FUNDS", "account %s would go negative", ref)
			}
			if acc.AccountType == "asset" && next < 0 {
				return nil, newErr("INSUFFICIENT_FUNDS", "account %s would go negative", ref)
			}
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE account_balances
			    SET balance = $2, last_sequence = $3, updated_at = now()
			  WHERE account_id = $1`, acc.ID, next, sequenceNo); err != nil {
			return nil, err
		}
		balances[ref] = next
	}

	var total int64
	if err := tx.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(amount), 0) FROM ledger_entries WHERE transaction_id = $1`,
		txID).Scan(&total); err != nil {
		return nil, err
	}
	if total != 0 {
		return nil, newErr("UNBALANCED", "post-write invariant check failed")
	}

	return &PostResult{
		TransactionRef: txRef,
		SequenceNo:     sequenceNo,
		Replayed:       false,
		Balances:       balances,
	}, nil
}

// Reverse appends the mirror image of a transaction. Nothing is ever updated
// or deleted; the original stays visible forever.
func (s *Service) Reverse(ctx context.Context, originalRef, reason, idempotencyKey string) (*PostResult, error) {
	var alreadyReversed int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM ledger_transactions WHERE reverses_ref = $1`, originalRef,
	).Scan(&alreadyReversed); err != nil {
		return nil, err
	}
	if alreadyReversed > 0 {
		return nil, newErr("ALREADY_REVERSED", "transaction %s is already reversed", originalRef)
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT a.account_ref, e.amount, e.currency
		   FROM ledger_transactions t
		   JOIN ledger_entries e ON e.transaction_id = t.id
		   JOIN accounts a ON a.id = e.account_id
		  WHERE t.transaction_ref = $1`, originalRef)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []EntryInput
	currency := ""
	for rows.Next() {
		var ref, cur string
		var amount int64
		if err := rows.Scan(&ref, &amount, &cur); err != nil {
			return nil, err
		}
		currency = cur
		entries = append(entries, EntryInput{AccountRef: ref, Amount: -amount})
	}
	if len(entries) == 0 {
		return nil, newErr("NOT_FOUND", "transaction %s not found", originalRef)
	}

	return s.Post(ctx, PostRequest{
		IdempotencyKey: idempotencyKey,
		Kind:           "reversal",
		Currency:       currency,
		Description:    fmt.Sprintf("reversal of %s: %s", originalRef, reason),
		ReversesRef:    &originalRef,
		Entries:        entries,
		Metadata:       map[string]interface{}{"reason": reason, "reverses": originalRef},
	})
}

// AuthoritativeBalance derives the balance from the ledger itself, ignoring
// the materialised projection. Pass asOfSequence for a point-in-time answer.
func (s *Service) AuthoritativeBalance(ctx context.Context, accountRef string, asOfSequence *int64) (int64, error) {
	var total int64
	err := s.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(e.amount), 0)
		   FROM ledger_entries e
		   JOIN accounts a ON a.id = e.account_id
		  WHERE a.account_ref = $1
		    AND ($2::bigint IS NULL OR e.sequence_no <= $2::bigint)`,
		accountRef, asOfSequence).Scan(&total)
	return total, err
}

func pgTextArray(values []string) string {
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = `"` + strings.ReplaceAll(v, `"`, `\"`) + `"`
	}
	return "{" + strings.Join(quoted, ",") + "}"
}
```

</div>
</CodeTabs>

### এই কোডে যে সিদ্ধান্তগুলো গুরুত্বপূর্ণ

**Idempotency key দুই ধাপে claim করা হয়েছে।** প্রথম ধাপে আলাদা transaction-এ key দখল, তারপর আসল কাজ। এক ধাপে করলে দুটো সমস্যা: (ক) দুই concurrent duplicate গভীরে গিয়ে deadlock করে, (খ) rollback হলে key-টাও rollback হয়ে যায়, ফলে duplicate detection মুছে যায়।

**Request fingerprint মিলিয়ে দেখা হয়।** একই key দিয়ে ভিন্ন body এলে সেটা replay নয়, সেটা bug — এবং আমরা 422 দিয়ে চিৎকার করি। Stripe-ও ঠিক এটাই করে। এই চেকটা না থাকলে ক্লায়েন্টের একটা key-generation bug চুপচাপ টাকা গিলে ফেলবে।

**`in_progress` state আর lease।** দুটো duplicate একসাথে এলে দ্বিতীয়টা `IN_PROGRESS` পায় — ক্লায়েন্ট 409 পেয়ে retry করবে। lease (`locked_until`) থাকার কারণ: process মাঝপথে মরে গেলে key চিরকালের জন্য আটকে থাকবে না।

**Account lock deterministic order-এ।** `ORDER BY account_ref ... FOR UPDATE` — আল-খোয়ারিজমি → ইবনে সিনা আর ইবনে সিনা → আল-খোয়ারিজমি দুটো transfer একসাথে এলে classic deadlock হতো। sorted order সেটা অসম্ভব করে।

**Invariant write-এর পরে আবার যাচাই।** ইনপুটে যোগফল শূন্য চেক করেছি, তারপর DB-তে লিখে আবার চেক করেছি। অতিরিক্ত মনে হতে পারে, কিন্তু এটা type-level ভুল নয়, storage-level ভুল ধরে — ভুল কলামে লেখা, overflow, trigger-এর পার্শ্বপ্রতিক্রিয়া।

<Callout type="tip">

`SERIALIZABLE` isolation ব্যবহার করা হয়েছে কারণ লেজারে write throughput-এর চেয়ে correctness বড়। serialization failure হলে ক্লায়েন্ট retry করবে — আর যেহেতু সব কিছু idempotent, retry নিরাপদ। এটাই "correctness over availability" বাক্যটার কংক্রিট চেহারা।

</Callout>

## Exactly-once আসলে কী মানে

"Exactly-once delivery" নেটওয়ার্কে অসম্ভব — এটা চ্যাপ্টার ১১-তে দেখেছি। কিন্তু **exactly-once effect** সম্ভব, আর টাকার জগতে ওটাই দরকার।

পার্থক্যটা এভাবে ভাবুন: আল-খোয়ারিজমির ফোন আমাদের API-তে ৫০০ পাঠানোর রিকোয়েস্ট করল, নেটওয়ার্ক টাইমআউট হলো। আমরা জানি না রিকোয়েস্টটা পৌঁছেছিল কিনা। ফোন আবার পাঠাল। এখন তিনটে সম্ভাবনা:

| পরিস্থিতি              | প্রথম রিকোয়েস্টের ভাগ্য | দ্বিতীয়টার ফল                          |
| ---------------------- | ------------------------ | --------------------------------------- |
| কখনো পৌঁছায়নি         | কিছুই হয়নি              | নতুন transaction, টাকা একবার সরল        |
| পৌঁছেছে, commit হয়েছে | entry বসে গেছে           | stored response replay, টাকা সরল না     |
| পৌঁছেছে, চলছে          | in_progress              | `IN_PROGRESS`, ক্লায়েন্ট পরে আবার আসবে |

তিন ক্ষেত্রেই মোট এক বার টাকা সরল। delivery একাধিকবার হয়েছে, effect একবার। এটাই আমরা চাই।

<Callout type="warning">

Idempotency key ক্লায়েন্ট বানাবে, সার্ভার নয় — আর সেটা রিকোয়েস্টের _উদ্দেশ্যের_ সাথে বাঁধা থাকবে, retry-র সাথে নয়। ক্লায়েন্ট যদি প্রতি retry-তে নতুন UUID বানায়, idempotency-র কোনো মানে নেই। মোবাইল ক্লায়েন্টে key-টা local storage-এ persist করতে হবে, মেমরিতে নয় — অ্যাপ crash করে restart হলেও একই key থাকতে হবে।

</Callout>

## Provider saga: টাকা যখন আমাদের ঘরের বাইরে যায়

এতক্ষণ সব কিছু আমাদের নিজের ডেটাবেসে ছিল, তাই একটা ACID transaction যথেষ্ট ছিল। কিন্তু payout মানে বাইরের PSP-র সাথে কথা বলা, আর বাইরের সিস্টেম আমাদের transaction-এ অংশ নেবে না। এখানেই saga — চ্যাপ্টার ১৬-তে যেটা শিখেছি।

<Mermaid
title="Payout Saga with Compensation"
code={`graph TD
  S1["Reserve<br/>wallet to suspense"] --> S2["Authorize<br/>call provider"]
  S2 --> S3["Capture<br/>confirm with provider"]
  S3 --> S4["Settle<br/>suspense to bank"]
  S2 -->|failure| C1["Compensate<br/>release suspense"]
  S3 -->|failure| C2["Compensate<br/>void and release"]
  S3 -->|unknown| Q["Query provider<br/>never assume"]
  Q --> S3
  Q --> C2`}
/>

মূল ধারণাটা: **টাকা কখনো বাতাসে ঝোলে না**। প্রতিটা ধাপে টাকাটা কোনো না কোনো অ্যাকাউন্টে বসে থাকে। ইউজারের wallet থেকে বেরিয়ে সরাসরি ব্যাংকে যায় না — মাঝখানে `suspense:payout-inflight` অ্যাকাউন্টে বসে। ফলে যেকোনো মুহূর্তে "কত টাকা পথে আছে" প্রশ্নের উত্তর একটা SQL query।

সবচেয়ে গুরুত্বপূর্ণ ব্যাপারটা হলো **unknown outcome**। provider-কে কল করলাম, টাইমআউট হলো। টাকা গেছে, নাকি যায়নি? আমরা জানি না। এখানে দুটো ভুল করা যায়:

- ধরে নেওয়া যায়নি → compensate করে দিলাম → পরে দেখা গেল গিয়েছিল → ডাবল payout, টাকা হারালাম।
- ধরে নেওয়া গেছে → capture মার্ক করলাম → পরে দেখা গেল যায়নি → ইউজার টাকা পেল না, ব্যালেন্স মিথ্যা বলল।

সঠিক উত্তর: **কিছুই ধরে নেব না**। saga-টা `UNKNOWN` state-এ যাবে, আর একটা reconciler বারবার provider-কে জিজ্ঞেস করবে "আমার এই reference-এর কী হলো?" — যতক্ষণ না নিশ্চিত উত্তর আসে। এই জন্যই প্রতিটা provider call-এ আমাদের নিজের generate করা reference পাঠাতে হয়, যাতে পরে জিজ্ঞেস করা যায়।

<CodeTabs tsFile="payout-saga.ts" goFile="payout-saga.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import type { LedgerService, PostResult } from './ledger-service';

// --- Provider contract ---

export type ProviderOutcome =
	| { status: 'succeeded'; providerRef: string }
	| { status: 'failed'; providerRef: string; reason: string }
	| { status: 'unknown'; providerRef: string };

export interface PaymentProvider {
	/** Must be idempotent on our reference. */
	authorize(ourRef: string, amount: bigint, destination: string): Promise<ProviderOutcome>;
	capture(ourRef: string): Promise<ProviderOutcome>;
	void(ourRef: string): Promise<ProviderOutcome>;
	/** The escape hatch for unknown outcomes. */
	lookup(ourRef: string): Promise<ProviderOutcome | null>;
}

export type SagaState =
	| 'reserved'
	| 'authorized'
	| 'captured'
	| 'settled'
	| 'compensating'
	| 'compensated'
	| 'unknown'
	| 'stuck';

export interface SagaRecord {
	id: string;
	ourRef: string;
	userAccount: string;
	amount: bigint;
	currency: string;
	destination: string;
	state: SagaState;
	attempts: number;
	providerRef: string | null;
	lastError: string | null;
}

export interface SagaStore {
	create(record: Omit<SagaRecord, 'attempts' | 'providerRef' | 'lastError'>): Promise<SagaRecord>;
	load(ourRef: string): Promise<SagaRecord | null>;
	transition(
		ourRef: string,
		from: SagaState[],
		to: SagaState,
		patch?: Partial<SagaRecord>
	): Promise<boolean>;
	claimPending(limit: number, olderThanMs: number): Promise<SagaRecord[]>;
}

const SUSPENSE = 'suspense:payout-inflight';
const BANK = 'bank:settlement:baghdad';
const PROVIDER_FEE = 'expense:provider-fees';

export class PayoutSaga {
	constructor(
		private readonly ledger: LedgerService,
		private readonly provider: PaymentProvider,
		private readonly store: SagaStore,
		private readonly log: (event: string, fields: Record<string, unknown>) => void
	) {}

	/**
	 * Step 1: move the money out of the user's wallet and into suspense inside a
	 * single ledger transaction, *before* touching the provider. If we crash
	 * after this, the money is still fully accounted for.
	 */
	async start(input: {
		ourRef: string;
		userAccount: string;
		amount: bigint;
		currency: string;
		destination: string;
	}): Promise<SagaRecord> {
		const existing = await this.store.load(input.ourRef);
		if (existing) return existing;

		await this.ledger.post({
			idempotencyKey: `payout-reserve:${input.ourRef}`,
			kind: 'payout',
			currency: input.currency,
			description: `reserve payout ${input.ourRef}`,
			entries: [
				{ accountRef: input.userAccount, amount: input.amount }, // liability debit
				{ accountRef: SUSPENSE, amount: -input.amount }
			],
			metadata: { ourRef: input.ourRef, stage: 'reserve' }
		});

		const record = await this.store.create({
			id: input.ourRef,
			ourRef: input.ourRef,
			userAccount: input.userAccount,
			amount: input.amount,
			currency: input.currency,
			destination: input.destination,
			state: 'reserved'
		});
		this.log('payout.reserved', { ourRef: input.ourRef, amount: input.amount.toString() });
		return record;
	}

	/** Drives one saga forward by exactly one step. Safe to call repeatedly. */
	async advance(ourRef: string): Promise<SagaState> {
		const saga = await this.store.load(ourRef);
		if (!saga) throw new Error(`unknown saga ${ourRef}`);

		switch (saga.state) {
			case 'reserved':
				return this.doAuthorize(saga);
			case 'authorized':
				return this.doCapture(saga);
			case 'captured':
				return this.doSettle(saga);
			case 'unknown':
				return this.resolveUnknown(saga);
			case 'compensating':
				return this.doCompensate(saga);
			default:
				return saga.state;
		}
	}

	private async doAuthorize(saga: SagaRecord): Promise<SagaState> {
		let outcome: ProviderOutcome;
		try {
			outcome = await this.provider.authorize(saga.ourRef, saga.amount, saga.destination);
		} catch (err) {
			// A thrown error is indistinguishable from a timeout. Never assume.
			this.log('payout.authorize.unknown', { ourRef: saga.ourRef, error: String(err) });
			await this.store.transition(saga.ourRef, ['reserved'], 'unknown', {
				lastError: String(err)
			});
			return 'unknown';
		}

		if (outcome.status === 'succeeded') {
			await this.store.transition(saga.ourRef, ['reserved'], 'authorized', {
				providerRef: outcome.providerRef
			});
			return 'authorized';
		}
		if (outcome.status === 'failed') {
			await this.store.transition(saga.ourRef, ['reserved'], 'compensating', {
				lastError: outcome.reason
			});
			return this.doCompensate({ ...saga, state: 'compensating' });
		}
		await this.store.transition(saga.ourRef, ['reserved'], 'unknown', {
			providerRef: outcome.providerRef
		});
		return 'unknown';
	}

	private async doCapture(saga: SagaRecord): Promise<SagaState> {
		let outcome: ProviderOutcome;
		try {
			outcome = await this.provider.capture(saga.ourRef);
		} catch (err) {
			await this.store.transition(saga.ourRef, ['authorized'], 'unknown', {
				lastError: String(err)
			});
			return 'unknown';
		}

		if (outcome.status === 'succeeded') {
			await this.store.transition(saga.ourRef, ['authorized'], 'captured', {
				providerRef: outcome.providerRef
			});
			return 'captured';
		}
		if (outcome.status === 'failed') {
			await this.store.transition(saga.ourRef, ['authorized'], 'compensating', {
				lastError: outcome.reason
			});
			return this.doCompensate({ ...saga, state: 'compensating' });
		}
		await this.store.transition(saga.ourRef, ['authorized'], 'unknown');
		return 'unknown';
	}

	/**
	 * Step 4: money leaves suspense and lands against the bank account. Only
	 * now is the payout truly done from the ledger's point of view.
	 */
	private async doSettle(saga: SagaRecord): Promise<SagaState> {
		const fee = this.providerFee(saga.amount);
		await this.ledger.post({
			idempotencyKey: `payout-settle:${saga.ourRef}`,
			kind: 'payout',
			currency: saga.currency,
			description: `settle payout ${saga.ourRef}`,
			entries: [
				{ accountRef: SUSPENSE, amount: saga.amount },
				{ accountRef: BANK, amount: -(saga.amount - fee) },
				{ accountRef: PROVIDER_FEE, amount: -fee }
			],
			metadata: { ourRef: saga.ourRef, providerRef: saga.providerRef, stage: 'settle' }
		});
		await this.store.transition(saga.ourRef, ['captured'], 'settled');
		this.log('payout.settled', { ourRef: saga.ourRef });
		return 'settled';
	}

	/**
	 * Compensation is not a rollback. It is a new, forward-only ledger
	 * transaction that returns the money to the user's wallet.
	 */
	private async doCompensate(saga: SagaRecord): Promise<SagaState> {
		try {
			await this.provider.void(saga.ourRef);
		} catch (err) {
			// Voiding is best-effort; the reconciler will catch a stuck void.
			this.log('payout.void.failed', { ourRef: saga.ourRef, error: String(err) });
		}

		await this.ledger.post({
			idempotencyKey: `payout-release:${saga.ourRef}`,
			kind: 'reversal',
			currency: saga.currency,
			description: `release payout ${saga.ourRef}`,
			entries: [
				{ accountRef: SUSPENSE, amount: saga.amount },
				{ accountRef: saga.userAccount, amount: -saga.amount }
			],
			metadata: { ourRef: saga.ourRef, stage: 'compensate', reason: saga.lastError }
		});
		await this.store.transition(saga.ourRef, ['compensating', 'unknown'], 'compensated');
		this.log('payout.compensated', { ourRef: saga.ourRef });
		return 'compensated';
	}

	/**
	 * The only correct response to an unknown outcome is to ask the provider
	 * what actually happened, using our own reference. We never guess, and we
	 * never time out into a guess.
	 */
	private async resolveUnknown(saga: SagaRecord): Promise<SagaState> {
		const outcome = await this.provider.lookup(saga.ourRef);

		if (outcome === null) {
			// The provider has never heard of this reference: nothing happened.
			await this.store.transition(saga.ourRef, ['unknown'], 'compensating');
			return this.doCompensate({ ...saga, state: 'compensating' });
		}
		if (outcome.status === 'succeeded') {
			await this.store.transition(saga.ourRef, ['unknown'], 'captured', {
				providerRef: outcome.providerRef
			});
			return 'captured';
		}
		if (outcome.status === 'failed') {
			await this.store.transition(saga.ourRef, ['unknown'], 'compensating', {
				lastError: outcome.reason
			});
			return this.doCompensate({ ...saga, state: 'compensating' });
		}

		// Still unknown after N attempts: escalate to a human. Silence is worse
		// than a page.
		if (saga.attempts >= 12) {
			await this.store.transition(saga.ourRef, ['unknown'], 'stuck');
			this.log('payout.stuck', { ourRef: saga.ourRef, attempts: saga.attempts });
			return 'stuck';
		}
		return 'unknown';
	}

	/** Background driver: pushes every non-terminal saga forward. */
	async runSweep(batchSize = 100): Promise<void> {
		const pending = await this.store.claimPending(batchSize, 30_000);
		for (const saga of pending) {
			try {
				await this.advance(saga.ourRef);
			} catch (err) {
				this.log('payout.sweep.error', { ourRef: saga.ourRef, error: String(err) });
			}
		}
	}

	private providerFee(amount: bigint): bigint {
		// 0.9% plus 200 minor units, rounded up, never larger than the amount.
		const pct = (amount * 9n + 999n) / 1000n;
		const fee = pct + 200n;
		return fee > amount ? amount : fee;
	}
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package payout

import (
	"context"
	"errors"
	"fmt"
	"time"

	"example.com/ledger"
)

const (
	suspenseAccount = "suspense:payout-inflight"
	bankAccount     = "bank:settlement:baghdad"
	providerFeeAcct = "expense:provider-fees"
	maxUnknownTries = 12
)

// --- Provider contract ---

type OutcomeStatus string

const (
	OutcomeSucceeded OutcomeStatus = "succeeded"
	OutcomeFailed    OutcomeStatus = "failed"
	OutcomeUnknown   OutcomeStatus = "unknown"
)

type ProviderOutcome struct {
	Status      OutcomeStatus
	ProviderRef string
	Reason      string
}

type Provider interface {
	// Authorize must be idempotent on ourRef.
	Authorize(ctx context.Context, ourRef string, amount int64, destination string) (ProviderOutcome, error)
	Capture(ctx context.Context, ourRef string) (ProviderOutcome, error)
	Void(ctx context.Context, ourRef string) (ProviderOutcome, error)
	// Lookup is the escape hatch for unknown outcomes. A nil result means the
	// provider has never seen this reference.
	Lookup(ctx context.Context, ourRef string) (*ProviderOutcome, error)
}

// --- Saga state ---

type State string

const (
	StateReserved     State = "reserved"
	StateAuthorized   State = "authorized"
	StateCaptured     State = "captured"
	StateSettled      State = "settled"
	StateCompensating State = "compensating"
	StateCompensated  State = "compensated"
	StateUnknown      State = "unknown"
	StateStuck        State = "stuck"
)

type Record struct {
	OurRef      string
	UserAccount string
	Amount      int64
	Currency    string
	Destination string
	State       State
	Attempts    int
	ProviderRef string
	LastError   string
}

type Store interface {
	Create(ctx context.Context, r Record) (*Record, error)
	Load(ctx context.Context, ourRef string) (*Record, error)
	Transition(ctx context.Context, ourRef string, from []State, to State, patch map[string]interface{}) (bool, error)
	ClaimPending(ctx context.Context, limit int, olderThan time.Duration) ([]Record, error)
}

type Logger func(event string, fields map[string]interface{})

// --- Saga ---

type Saga struct {
	ledger   *ledger.Service
	provider Provider
	store    Store
	log      Logger
}

func New(l *ledger.Service, p Provider, s Store, log Logger) *Saga {
	return &Saga{ledger: l, provider: p, store: s, log: log}
}

// Start moves money out of the user's wallet into suspense inside a single
// ledger transaction, before the provider is touched at all. If we crash after
// this point the money is still fully accounted for.
func (s *Saga) Start(ctx context.Context, r Record) (*Record, error) {
	if existing, err := s.store.Load(ctx, r.OurRef); err == nil && existing != nil {
		return existing, nil
	}

	_, err := s.ledger.Post(ctx, ledger.PostRequest{
		IdempotencyKey: "payout-reserve:" + r.OurRef,
		Kind:           "payout",
		Currency:       r.Currency,
		Description:    "reserve payout " + r.OurRef,
		Entries: []ledger.EntryInput{
			{AccountRef: r.UserAccount, Amount: r.Amount},
			{AccountRef: suspenseAccount, Amount: -r.Amount},
		},
		Metadata: map[string]interface{}{"ourRef": r.OurRef, "stage": "reserve"},
	})
	if err != nil {
		return nil, err
	}

	r.State = StateReserved
	rec, err := s.store.Create(ctx, r)
	if err != nil {
		return nil, err
	}
	s.log("payout.reserved", map[string]interface{}{"ourRef": r.OurRef, "amount": r.Amount})
	return rec, nil
}

// Advance drives one saga forward by exactly one step. Safe to call repeatedly.
func (s *Saga) Advance(ctx context.Context, ourRef string) (State, error) {
	saga, err := s.store.Load(ctx, ourRef)
	if err != nil {
		return "", err
	}
	if saga == nil {
		return "", fmt.Errorf("unknown saga %s", ourRef)
	}

	switch saga.State {
	case StateReserved:
		return s.doAuthorize(ctx, saga)
	case StateAuthorized:
		return s.doCapture(ctx, saga)
	case StateCaptured:
		return s.doSettle(ctx, saga)
	case StateUnknown:
		return s.resolveUnknown(ctx, saga)
	case StateCompensating:
		return s.doCompensate(ctx, saga)
	default:
		return saga.State, nil
	}
}

func (s *Saga) doAuthorize(ctx context.Context, saga *Record) (State, error) {
	outcome, err := s.provider.Authorize(ctx, saga.OurRef, saga.Amount, saga.Destination)
	if err != nil {
		// An error is indistinguishable from a timeout. Never assume.
		s.log("payout.authorize.unknown", map[string]interface{}{"ourRef": saga.OurRef, "error": err.Error()})
		_, _ = s.store.Transition(ctx, saga.OurRef, []State{StateReserved}, StateUnknown,
			map[string]interface{}{"last_error": err.Error()})
		return StateUnknown, nil
	}

	switch outcome.Status {
	case OutcomeSucceeded:
		_, err = s.store.Transition(ctx, saga.OurRef, []State{StateReserved}, StateAuthorized,
			map[string]interface{}{"provider_ref": outcome.ProviderRef})
		return StateAuthorized, err
	case OutcomeFailed:
		if _, err := s.store.Transition(ctx, saga.OurRef, []State{StateReserved}, StateCompensating,
			map[string]interface{}{"last_error": outcome.Reason}); err != nil {
			return "", err
		}
		saga.State = StateCompensating
		saga.LastError = outcome.Reason
		return s.doCompensate(ctx, saga)
	default:
		_, err = s.store.Transition(ctx, saga.OurRef, []State{StateReserved}, StateUnknown,
			map[string]interface{}{"provider_ref": outcome.ProviderRef})
		return StateUnknown, err
	}
}

func (s *Saga) doCapture(ctx context.Context, saga *Record) (State, error) {
	outcome, err := s.provider.Capture(ctx, saga.OurRef)
	if err != nil {
		_, _ = s.store.Transition(ctx, saga.OurRef, []State{StateAuthorized}, StateUnknown,
			map[string]interface{}{"last_error": err.Error()})
		return StateUnknown, nil
	}

	switch outcome.Status {
	case OutcomeSucceeded:
		_, err = s.store.Transition(ctx, saga.OurRef, []State{StateAuthorized}, StateCaptured,
			map[string]interface{}{"provider_ref": outcome.ProviderRef})
		return StateCaptured, err
	case OutcomeFailed:
		if _, err := s.store.Transition(ctx, saga.OurRef, []State{StateAuthorized}, StateCompensating,
			map[string]interface{}{"last_error": outcome.Reason}); err != nil {
			return "", err
		}
		saga.State = StateCompensating
		saga.LastError = outcome.Reason
		return s.doCompensate(ctx, saga)
	default:
		_, err = s.store.Transition(ctx, saga.OurRef, []State{StateAuthorized}, StateUnknown, nil)
		return StateUnknown, err
	}
}

// doSettle moves money out of suspense and against the bank account. Only now
// is the payout truly done from the ledger's point of view.
func (s *Saga) doSettle(ctx context.Context, saga *Record) (State, error) {
	fee := providerFee(saga.Amount)
	_, err := s.ledger.Post(ctx, ledger.PostRequest{
		IdempotencyKey: "payout-settle:" + saga.OurRef,
		Kind:           "payout",
		Currency:       saga.Currency,
		Description:    "settle payout " + saga.OurRef,
		Entries: []ledger.EntryInput{
			{AccountRef: suspenseAccount, Amount: saga.Amount},
			{AccountRef: bankAccount, Amount: -(saga.Amount - fee)},
			{AccountRef: providerFeeAcct, Amount: -fee},
		},
		Metadata: map[string]interface{}{
			"ourRef": saga.OurRef, "providerRef": saga.ProviderRef, "stage": "settle",
		},
	})
	if err != nil {
		return "", err
	}
	if _, err := s.store.Transition(ctx, saga.OurRef, []State{StateCaptured}, StateSettled, nil); err != nil {
		return "", err
	}
	s.log("payout.settled", map[string]interface{}{"ourRef": saga.OurRef})
	return StateSettled, nil
}

// doCompensate is not a rollback. It is a new, forward-only ledger transaction
// that returns the money to the user's wallet.
func (s *Saga) doCompensate(ctx context.Context, saga *Record) (State, error) {
	if _, err := s.provider.Void(ctx, saga.OurRef); err != nil {
		// Voiding is best effort; the reconciler catches a stuck void.
		s.log("payout.void.failed", map[string]interface{}{"ourRef": saga.OurRef, "error": err.Error()})
	}

	_, err := s.ledger.Post(ctx, ledger.PostRequest{
		IdempotencyKey: "payout-release:" + saga.OurRef,
		Kind:           "reversal",
		Currency:       saga.Currency,
		Description:    "release payout " + saga.OurRef,
		Entries: []ledger.EntryInput{
			{AccountRef: suspenseAccount, Amount: saga.Amount},
			{AccountRef: saga.UserAccount, Amount: -saga.Amount},
		},
		Metadata: map[string]interface{}{
			"ourRef": saga.OurRef, "stage": "compensate", "reason": saga.LastError,
		},
	})
	if err != nil {
		return "", err
	}
	if _, err := s.store.Transition(ctx, saga.OurRef,
		[]State{StateCompensating, StateUnknown}, StateCompensated, nil); err != nil {
		return "", err
	}
	s.log("payout.compensated", map[string]interface{}{"ourRef": saga.OurRef})
	return StateCompensated, nil
}

// resolveUnknown asks the provider what actually happened, using our own
// reference. We never guess, and we never time out into a guess.
func (s *Saga) resolveUnknown(ctx context.Context, saga *Record) (State, error) {
	outcome, err := s.provider.Lookup(ctx, saga.OurRef)
	if err != nil {
		return StateUnknown, nil // try again on the next sweep
	}

	if outcome == nil {
		// The provider has never heard of this reference: nothing happened.
		if _, err := s.store.Transition(ctx, saga.OurRef,
			[]State{StateUnknown}, StateCompensating, nil); err != nil {
			return "", err
		}
		saga.State = StateCompensating
		return s.doCompensate(ctx, saga)
	}

	switch outcome.Status {
	case OutcomeSucceeded:
		_, err = s.store.Transition(ctx, saga.OurRef, []State{StateUnknown}, StateCaptured,
			map[string]interface{}{"provider_ref": outcome.ProviderRef})
		return StateCaptured, err
	case OutcomeFailed:
		if _, err := s.store.Transition(ctx, saga.OurRef, []State{StateUnknown}, StateCompensating,
			map[string]interface{}{"last_error": outcome.Reason}); err != nil {
			return "", err
		}
		saga.State = StateCompensating
		saga.LastError = outcome.Reason
		return s.doCompensate(ctx, saga)
	}

	// Still unknown after N attempts: escalate to a human. Silence is worse
	// than a page.
	if saga.Attempts >= maxUnknownTries {
		_, _ = s.store.Transition(ctx, saga.OurRef, []State{StateUnknown}, StateStuck, nil)
		s.log("payout.stuck", map[string]interface{}{"ourRef": saga.OurRef, "attempts": saga.Attempts})
		return StateStuck, nil
	}
	return StateUnknown, nil
}

// RunSweep pushes every non-terminal saga forward. Run it on a short interval.
func (s *Saga) RunSweep(ctx context.Context, batchSize int) error {
	pending, err := s.store.ClaimPending(ctx, batchSize, 30*time.Second)
	if err != nil {
		return err
	}
	var errs []error
	for i := range pending {
		if _, err := s.Advance(ctx, pending[i].OurRef); err != nil {
			s.log("payout.sweep.error", map[string]interface{}{
				"ourRef": pending[i].OurRef, "error": err.Error(),
			})
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// providerFee is 0.9% plus 200 minor units, rounded up, capped at the amount.
func providerFee(amount int64) int64 {
	pct := (amount*9 + 999) / 1000
	fee := pct + 200
	if fee > amount {
		return amount
	}
	return fee
}
```

</div>
</CodeTabs>

### Saga-র নিয়মগুলো

**প্রতিটা ধাপ idempotent, আর idempotency key ধাপের নাম বহন করে।** `payout-reserve:ourRef`, `payout-settle:ourRef` — একই saga-র দুটো ধাপ কখনো একই key শেয়ার করে না, আবার একই ধাপ দুইবার চললে দ্বিতীয়বার কিছুই হয় না।

**State transition conditional।** `transition(ref, from, to)` শুধু তখনই সফল হয় যখন বর্তমান state `from`-এর মধ্যে আছে — এটা একটা compare-and-swap। দুটো sweeper একই saga ধরলেও একজনই এগোতে পারবে।

**Compensation মানে rollback নয়।** আমরা reserve entry-টা মুছি না; আমরা একটা নতুন release entry বসাই। লেজারে অতীত বদলায় না, অতীতের উপর নতুন সত্য যোগ হয়।

**`stuck` state আছে, আর সেটা একজন মানুষকে ডাকে।** যেসব সিস্টেম "সব automate করব" ভেবে stuck state রাখে না, সেগুলো শেষ পর্যন্ত চুপচাপ ভুল সিদ্ধান্ত নেয়। টাকার সিস্টেমে একটা অমীমাংসিত কেসের সঠিক পরিণতি হলো একটা alert, একটা ticket, আর একজন operator।

<Callout type="warning">

Provider ডাউন থাকলে **API-কে fail-fast করতে দিন, কিন্তু ইউজারের টাকা suspense-এ ধরে রাখুন**। "provider ডাউন, তাই ধরে নিচ্ছি হয়ে গেছে" — এই একটা লাইন থেকেই বেশিরভাগ ডাবল-পেআউট incident জন্ম নেয়। চ্যাপ্টার ১৯-এর failure design-এর ভাষায়: এখানে graceful degradation মানে ধীর হওয়া, ভুল হওয়া নয়।

</Callout>

## Reconciliation: তিন দিকের মিলকরণ

Reconciliation-কে অনেকে "মাসের শেষের accounting কাজ" ভাবে। আসলে এটা লেজারের সবচেয়ে গুরুত্বপূর্ণ **monitoring**। unit test যেসব bug ধরে না, reconciliation সেগুলো ধরে — কারণ সে বাস্তবতার সাথে মেলায়, কোডের সাথে নয়।

তিনটে জিনিস মেলাতে হয়:

<Mermaid
title="Three Way Reconciliation"
code={`graph TD
  L["Internal Ledger<br/>entries by sequence"] --> M["Matcher<br/>by our reference"]
  P["Provider Statement<br/>daily file or API"] --> M
  B["Bank Statement<br/>settlement account"] --> M
  M --> OK["Matched<br/>no action"]
  M --> MO["Missing at Provider<br/>we think it moved"]
  M --> MI["Missing in Ledger<br/>provider moved money we never booked"]
  M --> AM["Amount Mismatch<br/>fees or FX drift"]
  MO --> BR["Break Queue<br/>human investigation"]
  MI --> BR
  AM --> BR`}
/>

চারটে ফলাফল সম্ভব, আর প্রতিটার মানে আলাদা:

| ফলাফল               | মানে                            | সাধারণ কারণ                                   | ব্যবস্থা                          |
| ------------------- | ------------------------------- | --------------------------------------------- | --------------------------------- |
| Matched             | দুই দিকেই আছে, অঙ্ক মেলে        | স্বাভাবিক                                     | কিছু না                           |
| Missing at provider | আমরা লিখেছি, তারা জানে না       | timeout-এ ভুল সিদ্ধান্ত, বা এখনো settle হয়নি | saga-কে `unknown`-এ ফেরত, lookup  |
| Missing in ledger   | তারা টাকা সরিয়েছে, আমরা লিখিনি | webhook হারিয়েছে, বা manual intervention     | ledger-এ catch-up entry, তদন্ত    |
| Amount mismatch     | দুই দিকেই আছে, অঙ্ক আলাদা       | fee হিসাব ভুল, FX rate, rounding              | fee/FX account-এ adjustment entry |

**গুরুত্বপূর্ণ:** reconciliation নিজে কখনো নিজে থেকে টাকা "ঠিক" করে না, নির্দিষ্ট কয়েকটা known-safe ক্ষেত্র ছাড়া। সে **break** তৈরি করে — একটা রেকর্ড যেটা বলে "এখানে গরমিল, কেউ দেখো"। auto-fix করা লোভনীয়, কিন্তু একটা ভুল auto-fix rule কয়েক ঘণ্টায় হাজার হাজার ভুল entry বসিয়ে দিতে পারে।

দুটো invariant প্রতি চক্রে যাচাই করা উচিত:

```
Invariant 1 (per transaction):
  SUM(amount) over all entries in a transaction = 0

Invariant 2 (global, per currency):
  SUM(amount) over all entries where currency = 'BDT' = 0

Invariant 3 (projection consistency):
  for each account:
    account_balances.balance = SUM(ledger_entries.amount) for that account

Invariant 4 (suspense drain):
  no entry may sit in suspense:* for longer than the settlement SLA
  (breach = a saga is stuck and nobody noticed)
```

Invariant 4-টা সবচেয়ে বেশি কাজে দেয় বাস্তবে। suspense অ্যাকাউন্টে বসে থাকা টাকা মানে একটা অসমাপ্ত saga; suspense-এর বয়স মনিটর করা মানে সব stuck saga একসাথে মনিটর করা। চ্যাপ্টার ১৮-এর ভাষায়, এটা আপনার সবচেয়ে ভালো business-level SLI।

<Callout type="tip">

Reconciliation-কে দিনে একবার নয়, প্রতি ৫-১৫ মিনিটে চালান — অন্তত invariant ১, ৩, ৪। ২৪ ঘণ্টা পরে একটা break ধরা মানে ২৪ ঘণ্টার ভুল ডেটা ইতিমধ্যেই ডাউনস্ট্রিমে ছড়িয়েছে।

</Callout>

## Immutability আর audit trail

লেজারে `UPDATE` বা `DELETE` **কখনো** চলে না। এটা শৃঙ্খলার প্রশ্ন নয়, প্রয়োগের প্রশ্ন — ডেটাবেস লেভেলে জোর করে বন্ধ করে দিন:

```sql
-- Application role can only append.
REVOKE UPDATE, DELETE ON ledger_entries FROM app_role;
REVOKE UPDATE, DELETE ON ledger_transactions FROM app_role;

-- Defence in depth: a trigger that refuses regardless of grants.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ledger_entries is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_immutable
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
```

Audit trail লেজারের চেয়ে আলাদা জিনিস। লেজার বলে **টাকা কোথায় গেল**; audit log বলে **কে সিদ্ধান্ত নিল, কেন, কোন অনুমোদনে**। একটা reversal entry দেখে বোঝা যায় ৫০০ ফেরত গেছে; audit log বলে সেটা আল-বিরুনি approve করেছিলেন dispute case #4417-এর ভিত্তিতে, সকাল ৯টা ১২ মিনিটে, এই IP থেকে।

Audit log-কে tamper-evident করতে hash chain ব্যবহার করুন — প্রতিটা রেকর্ডে আগেরটার hash:

```
record_n.hash = SHA256(record_n.payload || record_{n-1}.hash)
```

কেউ মাঝখানের একটা রেকর্ড বদলালে তার পরের সব hash ভেঙে যাবে। প্রতিদিনের শেষ hash-টা কোনো append-only external store-এ (বা এমনকি একটা টাইমস্ট্যাম্প সার্ভিসে) রেখে দিলে ভেতরের কেউও চুপচাপ ইতিহাস বদলাতে পারবে না।

<Callout type="info">

Audit log আর application log এক জিনিস নয়। application log ephemeral, sampled, retention ৩০ দিন। audit log হলো record — ৭ বছর, ১০০% capture, আলাদা storage, আলাদা access control। একে observability pipeline-এ ফেলে দেবেন না।

</Callout>

## ব্যালেন্স পড়া: projection নাকি লেজার

`account_balances` টেবিলটা দ্রুত, কিন্তু সেটা সত্য নয় — সত্য হলো entry-গুলোর যোগফল। তাহলে কোনটা পড়ব?

| ব্যবহারের ক্ষেত্র                | উৎস                                                  | কারণ                                     |
| -------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| UI-তে ব্যালেন্স দেখানো           | projection                                           | দ্রুত, আর সামান্য পুরোনো হলেও সমস্যা নেই |
| transfer-এর সময় sufficiency চেক | projection, তবে `FOR UPDATE` লক সহ একই transaction-এ | লক-ই consistency দেয়                    |
| মাসিক statement                  | লেজার, `sequence_no` range দিয়ে                     | reproducible হতে হবে                     |
| Regulator query / dispute        | লেজার, point-in-time                                 | projection অতীত মনে রাখে না              |
| Reconciliation                   | দুটোই, তারপর মিলিয়ে দেখা                            | মিল না হলেই সেটা একটা break              |

Projection ভেঙে গেলে কী? লেজার থেকে rebuild করা যায়:

```sql
-- Rebuild the entire projection from the immutable source of truth.
BEGIN;
TRUNCATE account_balances;
INSERT INTO account_balances (account_id, balance, last_sequence, updated_at)
SELECT a.id,
       COALESCE(SUM(e.amount), 0),
       COALESCE(MAX(e.sequence_no), 0),
       now()
  FROM accounts a
  LEFT JOIN ledger_entries e ON e.account_id = a.id
 GROUP BY a.id;
COMMIT;
```

এই query-টা লিখতে পারা মানে আপনার আর্কিটেকচার সঠিক। যদি projection rebuild করা না যায়, তার মানে কোথাও state আছে যা লেজারে নেই — আর সেটাই আপনার সবচেয়ে বড় ঝুঁকি।

## স্কেল করা, correctness না ছেড়ে

একটা লেজার scale করা কঠিন কারণ global invariant আর horizontal partitioning একে অন্যের শত্রু। কয়েকটা কাজের কৌশল:

**Currency দিয়ে partition করুন, ইউজার দিয়ে নয়।** invariant "প্রতি currency-তে যোগফল শূন্য" — তাই BDT আর USD সম্পূর্ণ আলাদা shard-এ থাকতে পারে, কোনো cross-shard transaction ছাড়াই। মুদ্রা বদলানোর সময় দুটো আলাদা transaction আর একটা FX bridge account।

**Hot account আলাদা করুন।** `revenue:fees` অ্যাকাউন্টে প্রতিটা transaction লেখে — সেটা একটা lock hotspot। সমাধান: fee entry-গুলো N-টা sub-account-এ ছড়িয়ে দিন (`revenue:fees:00` থেকে `revenue:fees:15`), আর মোট ব্যালেন্স চাইলে যোগ করে নিন। এটা চ্যাপ্টার ১০-এ দেখা counter sharding-এর ঠিক একই কৌশল।

**Read replica ব্যবহার করুন শুধু historical query-র জন্য।** গত মাসের statement replica থেকে পড়া নিরাপদ, কারণ ওই sequence range আর বদলাবে না। কিন্তু "এখন ব্যালেন্স কত" replica থেকে পড়া বিপজ্জনক।

**Cold entry archive করুন, কিন্তু মুছবেন না।** ২ বছরের পুরোনো entry object storage-এ Parquet হিসেবে সরিয়ে দিন (চ্যাপ্টার ২৩-এর storage tier আলোচনা মনে করুন), কিন্তু account-প্রতি একটা "opening balance as of sequence X" checkpoint রেখে দিন যাতে rebuild-এ পুরো ইতিহাস স্ক্যান করতে না হয়।

<Callout type="warning">

Sharding করার আগে জিজ্ঞেস করুন সত্যিই দরকার কিনা। একটা ভালো টিউন করা single-primary Postgres দিনে কয়েক কোটি ledger entry সামলায় — যা বেশিরভাগ ফিনটেকের কয়েক বছরের জন্য যথেষ্ট। লেজার sharding-এর জটিলতা প্রায় সবসময়ই আপনার আসল স্কেলের চেয়ে বেশি খরচ ডেকে আনে।

</Callout>

## যেসব জিনিস প্রোডাকশনে ভাঙে

**Retry storm-এ idempotency key শেষ হয়ে যাওয়া।** ক্লায়েন্ট লাইব্রেরি যদি key persist না করে, প্রতিটা retry নতুন transaction বানাবে। ক্লায়েন্ট SDK-তে key generation নিজে নিয়ন্ত্রণ করুন, আর সার্ভারে duplicate-এর একটা metric রাখুন — হঠাৎ শূন্য হয়ে গেলে সেটা ভালো খবর নয়, সেটা লক্ষণ যে key ভাঙছে।

**Fee rounding-এর জমে ওঠা।** ০.৯% ফি প্রতি transaction-এ ০.৪ পয়সা করে হারালে দিনে লক্ষ transaction-এ হাজার টাকা গায়েব। সমাধান: rounding সবসময় একটা নির্দিষ্ট দিকে, আর rounding difference-টা একটা স্পষ্ট `revenue:rounding` অ্যাকাউন্টে entry হিসেবে বসান। অদৃশ্য টাকা বলে কিছু থাকবে না।

**Webhook দুইবার আসা বা উল্টো ক্রমে আসা।** provider webhook-এ `payment.captured` আসার আগেই `payment.settled` আসতে পারে। webhook handler-কে event `id` দিয়ে idempotent করুন, আর event timestamp/version দেখে পুরোনো event ফেলে দিন — একেবারে চ্যাপ্টার ১৬-এর event ordering সমস্যা।

**Timezone আর business day।** "১৫ তারিখের reconciliation" মানে কোন timezone-এর ১৫ তারিখ? provider-এর cut-off UTC ২৩:০০, আপনার ব্যাংকের ঢাকা সময় ১৭:০০। সব internal timestamp UTC-তে রাখুন, আর business day-কে স্পষ্ট cut-off সহ একটা আলাদা concept হিসেবে মডেল করুন।

**Test ডেটা প্রোডাকশন লেজারে ঢুকে যাওয়া।** একটা load test যদি real ledger-এ লেখে, সেটা মুছে ফেলা যাবে না (append-only!)। আলাদা ledger instance, আর account_ref-এ environment prefix — `prod:user:ibn-sina:wallet`।

## ট্রেড-অফ যা আমরা সচেতনভাবে নিয়েছি

| সিদ্ধান্ত                    | যা পেলাম                         | যা দিলাম                                       |
| ---------------------------- | -------------------------------- | ---------------------------------------------- |
| SERIALIZABLE isolation       | কোনো lost update, কোনো phantom   | কম throughput, বেশি retry                      |
| Append-only, কোনো UPDATE নেই | পূর্ণ ইতিহাস, reproducible audit | বেশি storage, বেশি জটিল query                  |
| Balance projection আলাদা     | দ্রুত read                       | projection drift-এর ঝুঁকি, reconciliation লাগে |
| Suspense account সব saga-তে  | কোনো টাকা "হারায়" না            | বেশি entry, বেশি অ্যাকাউন্ট                    |
| Unknown হলে থেমে যাওয়া      | ডাবল payout নেই                  | ইউজার অপেক্ষা করে, operator লাগে               |
| Single-primary write path    | সহজ invariant                    | write scale সীমিত, failover-এ downtime         |

শেষ সারিটা সবচেয়ে দামি। চ্যাপ্টার ২১-এ multi-region active-active নিয়ে যা পড়েছেন, তার প্রায় কিছুই লেজারের write path-এ প্রয়োগ করা যায় না — কারণ দুই region-এ একই সাথে টাকা সরানোর কোনো conflict-free সমাধান নেই যেটা global invariant রক্ষা করে। বাস্তব সিস্টেমগুলো তাই লেজারকে single-writer রাখে (হয়তো currency বা tenant দিয়ে partitioned), আর অন্য region-এ শুধু read replica রাখে। এটা multi-region-এর সীমা মেনে নেওয়া, আর মেনে নেওয়াটাই এখানে ভালো ইঞ্জিনিয়ারিং।

<div class="takeaways">

### মূল শেখা

- লেজারে সত্য হলো entry-র তালিকা, ব্যালেন্স নয় — ব্যালেন্স সবসময় derived, আর যেকোনো সময় rebuild করা যেতে হবে
- প্রতিটা transaction-এর entry-গুলোর যোগফল ঠিক শূন্য; এই একটা invariant DB-তে জোর করে প্রয়োগ করলে অসংখ্য bug-শ্রেণি জন্মাতেই পারে না
- Exactly-once delivery অসম্ভব, কিন্তু exactly-once effect সম্ভব — client-generated idempotency key, request fingerprint যাচাই, আর stored response দিয়ে
- Append-only মানে ভুল শোধরানো হয় reversal entry দিয়ে, UPDATE দিয়ে নয় — ইতিহাস কখনো বদলায় না
- Provider outcome unknown হলে কখনো অনুমান করবেন না; নিজের reference দিয়ে lookup করুন, আর শেষে না পারলে একজন মানুষকে ডাকুন
- Suspense account-এ টাকার বয়স মনিটর করা মানে সব stuck saga একসাথে মনিটর করা — এটাই সেরা business-level SLI
- Reconciliation একটা accounting কাজ নয়, এটাই লেজারের আসল monitoring — চালান ঘন ঘন, আর auto-fix নয়, break তৈরি করুন

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Stripe** client-generated idempotency key আর double-entry ledger দিয়ে duplicate charge ঠেকায়, আর প্রতিটা balance transaction reproducible রাখে
- **TigerBeetle** পুরো ডেটাবেসটাই double-entry ledger-এর জন্য বানানো — signed integer amount, forced balance invariant, কোনো UPDATE নেই
- **Square** event-sourced ledger ব্যবহার করে যেখানে প্রতিটা state change একটা immutable event, আর ব্যালেন্স সবসময় replay করে বার করা যায়
- **Wise** multi-currency ledger চালায় currency-প্রতি আলাদা invariant আর স্পষ্ট FX bridge account দিয়ে, ঠিক এই চ্যাপ্টারের partitioning কৌশলে
- **bKash / Nagad**-এর মতো MFS প্ল্যাটফর্ম suspense account আর দৈনিক তিন-দিকের reconciliation দিয়ে ব্যাংক ও operator statement মেলায়

</div>
