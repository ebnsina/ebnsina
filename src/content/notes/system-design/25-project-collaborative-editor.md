---
title: 'প্রজেক্ট: রিয়েল-টাইম কোলাবোরেটিভ এডিটর'
subtitle: 'একসাথে অনেকে একই ডকুমেন্ট লিখলে কী হয় — OT বনাম CRDT, presence, snapshot, offline reconnect, আর room-গুলো সার্ভারের মধ্যে ভাগ করা।'
chapter: 25
level: 'mastery'
readingTime: '৩৫ মিনিট'
topics:
  [
    'collaborative editing',
    'CRDT',
    'operational transform',
    'presence',
    'websockets',
    'snapshotting'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

বুখারার একটা মাদ্রাসার নকলখানায় চারজন লিপিকার বসে আছেন — সিনা, বিরুনি, ফাতিমা আর ইবনুল হাইসাম। তাদের সামনে একই বইয়ের চারটে কপি, আর কাজ হলো সবগুলো কপি হুবহু এক রাখা। কেউ যদি নিজের কপির তিন নম্বর পাতায় একটা শব্দ যোগ করে, বাকিদের কপিতেও ঠিক সেই শব্দ, ঠিক সেই জায়গায় বসতে হবে। সমস্যা হলো তারা চারজন চারটে আলাদা ঘরে বসে, আর একজনের কাজের খবর অন্যজনের কাছে পৌঁছাতে একটু সময় লাগে — বার্তাবাহক ছেলে দৌড়ে গিয়ে খবর দেয়।

প্রথমে তারা যে পদ্ধতি ব্যবহার করত সেটা ছিল **অবস্থান বলে দেওয়ার** পদ্ধতি। সিনা চিরকুট পাঠাত: "সাত নম্বর অক্ষরের পরে 'নূর' শব্দটা বসাও।" ভালোই চলছিল, যতক্ষণ না একদিন গোলমাল হলো। সিনা লিখল "সাত নম্বরের পরে 'নূর' বসাও", ঠিক একই মুহূর্তে বিরুনি লিখল "তিন নম্বরের পরে 'আল' বসাও"। দুটো চিরকুট পথে পার হয়ে গেল একে অন্যকে। ফাতিমা প্রথমে বিরুনির চিরকুট পেল, তিন নম্বরের পরে দুই অক্ষর ঢোকাল — এখন তার কপিতে সব অক্ষর দুই ঘর করে সরে গেছে। তারপর সিনার চিরকুট এসে বলল "সাত নম্বরের পরে" — কিন্তু ফাতিমার কপির সাত নম্বর এখন আর সেই সাত নম্বর নয়! শব্দটা ভুল জায়গায় বসল। ইবনুল হাইসাম আবার চিরকুট দুটো উল্টো ক্রমে পেয়েছিল, তাই তার কপি হলো আরেক রকম। চারটে কপি চার রকম — যা ঠিক যে জিনিসটা আটকাতে চাইছিলেন, সেটাই হলো।

মাদ্রাসার প্রধান একটা সমাধান দিলেন: একজন প্রধান লিপিকার — বলা যাক ইবনুল হাইসাম — সবার চিরকুট আগে দেখবেন, আর ক্রম ঠিক করে দেবেন। কেউ যদি এমন চিরকুট পাঠায় যেটা পুরোনো অবস্থার উপর ভিত্তি করে লেখা, প্রধান লিপিকার নিজে হিসাব করে সংখ্যাটা **শুধরে দেন**: "সিনা সাত বলেছে, কিন্তু এর মধ্যে তিন নম্বরে দুই অক্ষর ঢুকেছে, তাই এটা আসলে নয় নম্বর।" শুধরানো চিরকুটই সবার কাছে যায়। কাজ করে, চমৎকার কাজ করে — কিন্তু গোটা ব্যবস্থাটা প্রধান লিপিকার ছাড়া অচল। তিনি অসুস্থ হলে নকলখানা বন্ধ।

কয়েক বছর পর আরেকজন উস্তাদ সম্পূর্ণ ভিন্ন পদ্ধতি আনলেন, আর সেটার মূল কথা ছিল: **সংখ্যা দিয়ে জায়গা বলা বন্ধ করো**। প্রতিটা অক্ষরকে জন্মের সময়ই একটা স্থায়ী নাম দাও — "সিনার লেখা ১৭ নম্বর অক্ষর" — আর নতুন অক্ষর ঢোকানোর সময় বলো "এই নামের অক্ষরটার ঠিক পরে বসাও"। অক্ষরের নাম কখনো বদলায় না, তাই আশেপাশে যত কিছুই ঘটুক, নির্দেশটা কখনো ভুল জায়গা নির্দেশ করে না। দুজন যদি একই অক্ষরের পরে একসাথে কিছু বসায়, তখন কার লেখাটা আগে যাবে সেটা ঠিক করার জন্য একটা স্থির নিয়ম আছে — লিপিকারের নামের ক্রম। নিয়মটা সবাই জানে, তাই চারজনই একই সিদ্ধান্তে পৌঁছায়, কেউ কাউকে জিজ্ঞেস না করেই। এবার আর প্রধান লিপিকার লাগে না; চিরকুট যে ক্রমেই পৌঁছাক, যতবার খুশি পৌঁছাক, শেষ পর্যন্ত চারটে কপি এক হবেই।

মিলিয়ে নিই। চারজন লিপিকার আর তাদের নিজস্ব কপি হলো **local replica**, বার্তাবাহকের দেরি হলো **network latency**, আর চিরকুট পথে পার হয়ে যাওয়া হলো **concurrent operation**। "সাত নম্বরের পরে বসাও" — index দিয়ে জায়গা বলা — এই পুরো পদ্ধতিটাই **operational transformation (OT)**, আর প্রধান লিপিকারের সংখ্যা শুধরে দেওয়াই হলো **transform function**, যেটা একটা **central server**-এর উপর নির্ভরশীল। অক্ষরকে স্থায়ী নাম দেওয়া হলো **unique identifier**, "এই নামের পরে বসাও" হলো **CRDT-র position-independent insert**, আর নামের ক্রম দিয়ে টাই ভাঙা হলো **deterministic tie-break** — যার ফলে **strong eventual consistency**: সব replica একই operation পেলে, ক্রম যেমনই হোক, একই ফলাফলে পৌঁছাবে। কোন ঘরে কে বসে আছে আর কোন পাতায় তার আঙুল, সেটা হলো **presence ও awareness**; আর মাঝে মাঝে গোটা বইটা এক কপি সেলাই করে বেঁধে রাখা, যাতে নতুন লিপিকারকে শুরু থেকে সব চিরকুট পড়াতে না হয় — সেটাই **snapshot**।

## সমস্যাটা ঠিক কী

দুজন একই সেকেন্ডে একই লাইনে লিখলে কী হওয়া উচিত? এই প্রশ্নের কোনো "সঠিক" উত্তর নেই — কিন্তু একটা **শর্ত** আছে যেটা ভাঙা যাবে না: সবাই শেষ পর্যন্ত একই জিনিস দেখবে। এটাকে বলে **convergence**।

সাথে আরও দুটো শর্ত চাই:

- **Intention preservation** — বিরুনি যদি "নূর" শব্দটা বাক্যের মাঝখানে বসাতে চেয়ে থাকেন, শব্দটা যেন বাক্যের মাঝখানেই থাকে, অক্ষরগুলো ছিটকে না যায়।
- **Causality** — সিনা যদি আগে একটা প্যারাগ্রাফ লিখে তারপর সেটা মুছে দেন, কোনো replica যেন "মোছা" অপারেশনটা "লেখা"র আগে প্রয়োগ না করে।

তৃতীয়টা চ্যাপ্টার ১৫-এর causal ordering-এর সরাসরি প্রয়োগ — আর এখানেও সমাধান একই: প্রতিটা operation-এর সাথে সে কী কী দেখেছে তার একটা সাক্ষ্য (version vector বা sequence) পাঠানো।

<Callout type="warning">

"শেষ যে লিখেছে সে জিতবে" (last-write-wins) — টেক্সট এডিটিং-এ এই কৌশলটা কাজ করে না। LWW একটা পুরো প্যারাগ্রাফ হারিয়ে দেয়, কারণ দুজনের সম্পাদনা পরস্পরের বিকল্প নয়, দুটোই রাখতে হবে। LWW একটা key-value field-এ ঠিক আছে (যেমন ডকুমেন্টের title), টেক্সট sequence-এ নয়।

</Callout>

## OT নাকি CRDT — কীভাবে বাছবেন

দুটোই convergence দেয়, কিন্তু সম্পূর্ণ আলাদা দাম দিয়ে।

| দিক                     | OT                                                 | CRDT                                           |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------- |
| জায়গা বোঝায়           | index (`position 7`)                               | immutable identifier                           |
| Central server          | দরকার (প্রায় সব বাস্তব বাস্তবায়নে)               | দরকার নেই, peer-to-peer সম্ভব                  |
| Metadata খরচ            | কম — operation ছোট                                 | বেশি — প্রতি অক্ষরে id, tombstone              |
| Correctness প্রমাণ      | কঠিন — transform function-এর সব জোড়া মিলতে হয়    | তুলনামূলক সহজ — commutativity প্রমাণ করলেই হলো |
| Offline সহনশীলতা        | সীমিত — অনেকক্ষণ পিছিয়ে থাকলে transform ব্যয়বহুল | চমৎকার — যত দেরিতেই merge হোক                  |
| Rich text (bold, table) | পরিণত, প্রমাণিত                                    | পরিণত হচ্ছে, তবে জটিল                          |
| বাস্তব উদাহরণ           | Google Docs, Etherpad                              | Figma, Yjs/Automerge-নির্ভর সব কিছু            |

সিদ্ধান্তের সহজ নিয়ম:

- **আপনার যদি একটা কেন্দ্রীয় সার্ভার এমনিতেই থাকে, ডকুমেন্ট প্লেইন-টেক্সট বা হালকা rich text, আর offline সমর্থন কয়েক মিনিটের বেশি নয়** — OT যথেষ্ট, আর মেমরি খরচ কম হবে।
- **আপনার যদি সত্যিকারের offline-first দরকার, বা peer-to-peer, বা ডকুমেন্ট একটা টেক্সট নয় বরং একটা জটিল গাছ (Figma-র canvas, একটা database of blocks)** — CRDT নিন।
- **নিজে OT লিখবেন না।** OT-র transform function-এর জোড়াগুলো (insert/insert, insert/delete, delete/delete, আর undo-র সাথে সব) কুখ্যাতভাবে ভুল হয়। প্রকাশিত OT অ্যালগরিদমের একাধিক পেপারে পরে bug ধরা পড়েছে। হয় একটা পরিণত লাইব্রেরি নিন, নয় CRDT-তে যান।

এই চ্যাপ্টারে আমরা CRDT দিয়ে বানাব — কারণ সেটা নিজে বাস্তবায়ন করা নিরাপদ, আর reasoning-টা শেখার মতো।

<Callout type="info">

Figma-র ইঞ্জিনিয়াররা লিখেছিলেন তারা "CRDT-অনুপ্রাণিত" একটা সিস্টেম বানিয়েছেন, পুরোদস্তুর CRDT নয় — কারণ তাদের সার্ভার এমনিতেই আছে, তাই peer-to-peer-এর জন্য দেওয়া দামটা দিতে হয় না। এটা ভালো ইঞ্জিনিয়ারিং: অ্যালগরিদমের নামের প্রতি আনুগত্য নয়, নিজের constraint-এর প্রতি।

</Callout>

## আর্কিটেকচার

<Mermaid
title="Collaborative Editor Architecture"
code={`graph TD
  C1["Client Baghdad<br/>local CRDT replica"] --> WS["Realtime Gateway<br/>websocket per room"]
  C2["Client Cordoba<br/>local CRDT replica"] --> WS
  WS --> RM["Room Manager<br/>one owner per document"]
  RM --> OPS["Op Log<br/>append only per doc"]
  RM --> AW["Awareness Store<br/>ephemeral TTL"]
  OPS --> SNAP["Snapshotter<br/>periodic compaction"]
  SNAP --> OBJ["Object Storage<br/>snapshot blobs"]
  RM --> PUB["Pub Sub Bus<br/>cross node fan out"]
  PUB --> WS`}
/>

চারটে জিনিস আলাদা করে চিনুন, কারণ এদের durability-র চাহিদা সম্পূর্ণ আলাদা:

1. **Op log** — durable, append-only, ডকুমেন্টের আসল সত্য। এটা হারালে ডকুমেন্ট হারাল।
2. **Snapshot** — derived, object storage-এ। হারালে op log থেকে আবার বানানো যায়।
3. **Awareness (presence, cursor)** — সম্পূর্ণ ephemeral, in-memory, TTL সহ। হারালে কয়েক সেকেন্ডে আবার তৈরি হয়। **এটা কখনো ডেটাবেসে লিখবেন না।**
4. **Connection state** — ephemeral, কিন্তু routing-এর জন্য দরকার।

এই আলাদা করাটাই বেশিরভাগ কোলাবোরেটিভ সিস্টেমের প্রথম বড় সিদ্ধান্ত। cursor position ডেটাবেসে লিখতে গিয়ে ডেটাবেস উড়িয়ে দেওয়া একটা ক্লাসিক ভুল — একজন ইউজার টাইপ করলে সেকেন্ডে ২০-৩০টা awareness update হয়, আর ১০ হাজার ইউজারে সেটা সেকেন্ডে লক্ষ write।

## CRDT-র কোর: একটা sequence যেখানে index নেই

মূল ধারণাটা এক লাইনে: **প্রতিটা অক্ষর একটা স্থায়ী id পায়, আর insert বলে "কোন id-র পরে", index দিয়ে নয়।**

id কী দিয়ে বানাব? দুটো জিনিস: কে লিখেছে (`siteId`) আর সে নিজের কততম operation (`counter`)। এই জোড়াটা globally unique, আর কোনো coordination ছাড়াই বানানো যায় — এটাই CRDT-র পুরো জাদু।

```
Character id: (siteId, counter)
  ("ibn-sina", 17)
  ("al-biruni", 4)

Insert operation: "place character X after id P"
  { id: ("ibn-sina", 18), after: ("al-biruni", 4), value: "n" }

Delete operation: "mark id P as removed"
  { target: ("al-biruni", 4) }
```

Delete কেন "mark", সত্যিকারের মুছে ফেলা নয়? কারণ অন্য কোনো replica-র একটা insert হয়তো ওই অক্ষরটাকে anchor হিসেবে ব্যবহার করছে ("ওর পরে বসাও")। অক্ষরটা মুছে ফেললে anchor হারিয়ে যাবে আর operation-টা প্রয়োগ করা যাবে না। তাই আমরা অক্ষরটা রাখি, শুধু `deleted: true` বসাই — একে বলে **tombstone**।

আর tie-break? দুজন যদি একই anchor-এর পরে একসাথে insert করে, দুই replica-তে দুই ক্রমে পৌঁছাবে। সমাধান: একটা **স্থির, deterministic নিয়ম** — যেমন siteId-র lexicographic ক্রম। নিয়মটা সবার কাছে একই, তাই কেউ কাউকে জিজ্ঞেস না করেই একই সিদ্ধান্তে আসে।

<CodeTabs tsFile="rga-crdt.ts" goFile="rga_crdt.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
/**
 * RGA (Replicated Growable Array) — a sequence CRDT for collaborative text.
 *
 * Every character carries an immutable id. Inserts reference the id of the
 * character they follow, never an index, so concurrent edits elsewhere in the
 * document can never make an operation land in the wrong place.
 */

export interface OpId {
	site: string;
	counter: number;
}

export type Op =
	| { type: 'insert'; id: OpId; after: OpId | null; value: string }
	| { type: 'delete'; id: OpId; target: OpId };

interface Node {
	id: OpId;
	value: string;
	deleted: boolean;
	/** The id this node was inserted after, kept for replay and debugging. */
	after: OpId | null;
	next: Node | null;
}

export function idKey(id: OpId): string {
	return `${id.site}:${id.counter}`;
}

function idEquals(a: OpId | null, b: OpId | null): boolean {
	if (a === null || b === null) return a === b;
	return a.site === b.site && a.counter === b.counter;
}

/**
 * Deterministic total order used to break ties between concurrent inserts at
 * the same anchor. Higher counter wins; ties fall back to site id. Every
 * replica applies the identical rule, so no coordination is needed.
 */
function idGreater(a: OpId, b: OpId): boolean {
	if (a.counter !== b.counter) return a.counter > b.counter;
	return a.site > b.site;
}

export class RGA {
	/** Sentinel head so "insert at the very beginning" needs no special case. */
	private readonly head: Node = {
		id: { site: '', counter: 0 },
		value: '',
		deleted: true,
		after: null,
		next: null
	};

	private readonly index = new Map<string, Node>();
	private counter = 0;
	/** Highest counter seen from each site — the version vector. */
	private readonly seen = new Map<string, number>();
	/** Ops that arrived before their anchor did, keyed by the missing anchor. */
	private readonly pending = new Map<string, Op[]>();

	constructor(public readonly site: string) {
		this.index.set(idKey(this.head.id), this.head);
	}

	// --- Local editing API (produces ops to broadcast) ---

	/** Insert `text` at visible offset `offset`. Returns ops to broadcast. */
	localInsert(offset: number, text: string): Op[] {
		let anchor = this.nodeAtVisibleOffset(offset);
		const ops: Op[] = [];
		for (const ch of text) {
			const id: OpId = { site: this.site, counter: ++this.counter };
			const op: Op = {
				type: 'insert',
				id,
				after: anchor === this.head ? null : anchor.id,
				value: ch
			};
			this.applyInsert(op);
			ops.push(op);
			anchor = this.index.get(idKey(id))!;
		}
		return ops;
	}

	/** Delete `length` visible characters starting at `offset`. */
	localDelete(offset: number, length: number): Op[] {
		const ops: Op[] = [];
		let node = this.nodeAtVisibleOffset(offset)?.next ?? null;
		let removed = 0;
		while (node && removed < length) {
			if (!node.deleted) {
				const op: Op = {
					type: 'delete',
					id: { site: this.site, counter: ++this.counter },
					target: node.id
				};
				this.applyDelete(op);
				ops.push(op);
				removed++;
			}
			node = node.next;
		}
		return ops;
	}

	// --- Remote application ---

	/**
	 * Apply a remote op. Idempotent (a replayed op is a no-op) and tolerant of
	 * out-of-order arrival (an op whose anchor is missing is buffered).
	 */
	applyRemote(op: Op): void {
		if (this.alreadySeen(op)) return;

		if (op.type === 'insert') {
			const anchorKey = op.after ? idKey(op.after) : idKey(this.head.id);
			if (!this.index.has(anchorKey)) {
				this.buffer(anchorKey, op);
				return;
			}
			this.applyInsert(op);
		} else {
			if (!this.index.has(idKey(op.target))) {
				this.buffer(idKey(op.target), op);
				return;
			}
			this.applyDelete(op);
		}

		this.markSeen(op);
		this.drainPending(idKey(op.type === 'insert' ? op.id : op.target));
	}

	private applyInsert(op: Extract<Op, { type: 'insert' }>): void {
		const anchorKey = op.after ? idKey(op.after) : idKey(this.head.id);
		let prev = this.index.get(anchorKey);
		if (!prev) throw new Error(`missing anchor ${anchorKey}`);

		// Skip over concurrent inserts at the same anchor that sort higher than
		// ours. Everyone applies the same comparison, so everyone converges.
		while (prev.next && idEquals(prev.next.after, op.after) && idGreater(prev.next.id, op.id)) {
			prev = prev.next;
		}

		const node: Node = {
			id: op.id,
			value: op.value,
			deleted: false,
			after: op.after,
			next: prev.next
		};
		prev.next = node;
		this.index.set(idKey(op.id), node);

		if (op.id.site === this.site) {
			this.counter = Math.max(this.counter, op.id.counter);
		}
		this.markSeen(op);
	}

	private applyDelete(op: Extract<Op, { type: 'delete' }>): void {
		const node = this.index.get(idKey(op.target));
		if (!node) throw new Error(`missing delete target ${idKey(op.target)}`);
		// Tombstone, never unlink: other replicas may still anchor to this node.
		node.deleted = true;
		this.markSeen(op);
	}

	// --- Causality bookkeeping ---

	private alreadySeen(op: Op): boolean {
		const id = op.id;
		return (this.seen.get(id.site) ?? 0) >= id.counter;
	}

	private markSeen(op: Op): void {
		const id = op.id;
		const current = this.seen.get(id.site) ?? 0;
		if (id.counter > current) this.seen.set(id.site, id.counter);
	}

	private buffer(missingKey: string, op: Op): void {
		const list = this.pending.get(missingKey) ?? [];
		list.push(op);
		this.pending.set(missingKey, list);
	}

	private drainPending(nowAvailableKey: string): void {
		const waiting = this.pending.get(nowAvailableKey);
		if (!waiting) return;
		this.pending.delete(nowAvailableKey);
		for (const op of waiting) this.applyRemote(op);
	}

	/** Version vector: what this replica has already seen, per site. */
	versionVector(): Record<string, number> {
		return Object.fromEntries(this.seen);
	}

	// --- Reading ---

	toString(): string {
		let out = '';
		let node = this.head.next;
		while (node) {
			if (!node.deleted) out += node.value;
			node = node.next;
		}
		return out;
	}

	private nodeAtVisibleOffset(offset: number): Node {
		let node: Node = this.head;
		let seen = 0;
		while (node.next && seen < offset) {
			node = node.next;
			if (!node.deleted) seen++;
		}
		return node;
	}

	// --- Snapshotting ---

	/**
	 * A snapshot keeps every node, including tombstones, because anchors must
	 * survive. Compaction (dropping tombstones nobody can reference any more)
	 * is only safe once every site has acknowledged past them.
	 */
	snapshot(): { site: string; counter: number; nodes: Array<Omit<Node, 'next'>> } {
		const nodes: Array<Omit<Node, 'next'>> = [];
		let node = this.head.next;
		while (node) {
			nodes.push({ id: node.id, value: node.value, deleted: node.deleted, after: node.after });
			node = node.next;
		}
		return { site: this.site, counter: this.counter, nodes };
	}

	static fromSnapshot(
		site: string,
		snap: { counter: number; nodes: Array<Omit<Node, 'next'>> }
	): RGA {
		const rga = new RGA(site);
		let prev = rga.head;
		for (const n of snap.nodes) {
			const node: Node = { ...n, next: null };
			prev.next = node;
			rga.index.set(idKey(n.id), node);
			const current = rga.seen.get(n.id.site) ?? 0;
			if (n.id.counter > current) rga.seen.set(n.id.site, n.id.counter);
			prev = node;
		}
		rga.counter = snap.counter;
		return rga;
	}
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package crdt

import (
	"fmt"
)

// RGA (Replicated Growable Array) is a sequence CRDT for collaborative text.
//
// Every character carries an immutable id. Inserts reference the id of the
// character they follow, never an index, so concurrent edits elsewhere in the
// document can never make an operation land in the wrong place.

type OpID struct {
	Site    string `json:"site"`
	Counter int64  `json:"counter"`
}

func (id OpID) Key() string {
	return fmt.Sprintf("%s:%d", id.Site, id.Counter)
}

// Greater is the deterministic total order used to break ties between
// concurrent inserts at the same anchor. Every replica applies the identical
// rule, so no coordination is needed.
func (id OpID) Greater(other OpID) bool {
	if id.Counter != other.Counter {
		return id.Counter > other.Counter
	}
	return id.Site > other.Site
}

type OpType string

const (
	OpInsert OpType = "insert"
	OpDelete OpType = "delete"
)

type Op struct {
	Type   OpType `json:"type"`
	ID     OpID   `json:"id"`
	After  *OpID  `json:"after,omitempty"`  // insert only
	Value  string `json:"value,omitempty"`  // insert only
	Target *OpID  `json:"target,omitempty"` // delete only
}

type node struct {
	id      OpID
	value   string
	deleted bool
	after   *OpID
	next    *node
}

type RGA struct {
	site    string
	head    *node
	index   map[string]*node
	counter int64
	// seen is the version vector: the highest counter observed per site.
	seen map[string]int64
	// pending holds ops that arrived before their anchor, keyed by anchor.
	pending map[string][]Op
}

func New(site string) *RGA {
	head := &node{id: OpID{Site: "", Counter: 0}, deleted: true}
	r := &RGA{
		site:    site,
		head:    head,
		index:   map[string]*node{head.id.Key(): head},
		seen:    map[string]int64{},
		pending: map[string][]Op{},
	}
	return r
}

// --- Local editing API (produces ops to broadcast) ---

// LocalInsert inserts text at the given visible offset and returns the ops to
// broadcast to other replicas.
func (r *RGA) LocalInsert(offset int, text string) []Op {
	anchor := r.nodeAtVisibleOffset(offset)
	ops := make([]Op, 0, len(text))
	for _, ch := range text {
		r.counter++
		id := OpID{Site: r.site, Counter: r.counter}
		var after *OpID
		if anchor != r.head {
			a := anchor.id
			after = &a
		}
		op := Op{Type: OpInsert, ID: id, After: after, Value: string(ch)}
		r.applyInsert(op)
		ops = append(ops, op)
		anchor = r.index[id.Key()]
	}
	return ops
}

// LocalDelete removes length visible characters starting at offset.
func (r *RGA) LocalDelete(offset, length int) []Op {
	var ops []Op
	start := r.nodeAtVisibleOffset(offset)
	cur := start.next
	removed := 0
	for cur != nil && removed < length {
		if !cur.deleted {
			r.counter++
			target := cur.id
			op := Op{
				Type:   OpDelete,
				ID:     OpID{Site: r.site, Counter: r.counter},
				Target: &target,
			}
			r.applyDelete(op)
			ops = append(ops, op)
			removed++
		}
		cur = cur.next
	}
	return ops
}

// --- Remote application ---

// ApplyRemote applies an op from another replica. It is idempotent (a replayed
// op is a no-op) and tolerant of out-of-order arrival (an op whose anchor is
// missing is buffered until the anchor shows up).
func (r *RGA) ApplyRemote(op Op) error {
	if r.alreadySeen(op) {
		return nil
	}

	switch op.Type {
	case OpInsert:
		anchorKey := r.head.id.Key()
		if op.After != nil {
			anchorKey = op.After.Key()
		}
		if _, ok := r.index[anchorKey]; !ok {
			r.buffer(anchorKey, op)
			return nil
		}
		r.applyInsert(op)
		r.drainPending(op.ID.Key())
	case OpDelete:
		if op.Target == nil {
			return fmt.Errorf("delete op %s has no target", op.ID.Key())
		}
		if _, ok := r.index[op.Target.Key()]; !ok {
			r.buffer(op.Target.Key(), op)
			return nil
		}
		r.applyDelete(op)
	default:
		return fmt.Errorf("unknown op type %q", op.Type)
	}
	return nil
}

func (r *RGA) applyInsert(op Op) {
	anchorKey := r.head.id.Key()
	if op.After != nil {
		anchorKey = op.After.Key()
	}
	prev, ok := r.index[anchorKey]
	if !ok {
		panic("missing anchor " + anchorKey)
	}

	// Skip over concurrent inserts at the same anchor that sort higher than
	// ours. Everyone applies the same comparison, so everyone converges.
	for prev.next != nil && sameAnchor(prev.next.after, op.After) && prev.next.id.Greater(op.ID) {
		prev = prev.next
	}

	n := &node{id: op.ID, value: op.Value, after: op.After, next: prev.next}
	prev.next = n
	r.index[op.ID.Key()] = n

	if op.ID.Site == r.site && op.ID.Counter > r.counter {
		r.counter = op.ID.Counter
	}
	r.markSeen(op.ID)
}

func (r *RGA) applyDelete(op Op) {
	n := r.index[op.Target.Key()]
	// Tombstone, never unlink: other replicas may still anchor to this node.
	n.deleted = true
	r.markSeen(op.ID)
}

func sameAnchor(a, b *OpID) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return a.Site == b.Site && a.Counter == b.Counter
}

// --- Causality bookkeeping ---

func (r *RGA) alreadySeen(op Op) bool {
	return r.seen[op.ID.Site] >= op.ID.Counter
}

func (r *RGA) markSeen(id OpID) {
	if id.Counter > r.seen[id.Site] {
		r.seen[id.Site] = id.Counter
	}
}

func (r *RGA) buffer(missingKey string, op Op) {
	r.pending[missingKey] = append(r.pending[missingKey], op)
}

func (r *RGA) drainPending(nowAvailableKey string) {
	waiting, ok := r.pending[nowAvailableKey]
	if !ok {
		return
	}
	delete(r.pending, nowAvailableKey)
	for _, op := range waiting {
		_ = r.ApplyRemote(op)
	}
}

// VersionVector reports what this replica has already seen, per site.
func (r *RGA) VersionVector() map[string]int64 {
	out := make(map[string]int64, len(r.seen))
	for k, v := range r.seen {
		out[k] = v
	}
	return out
}

// --- Reading ---

func (r *RGA) String() string {
	var buf []byte
	for n := r.head.next; n != nil; n = n.next {
		if !n.deleted {
			buf = append(buf, n.value...)
		}
	}
	return string(buf)
}

func (r *RGA) nodeAtVisibleOffset(offset int) *node {
	cur := r.head
	seen := 0
	for cur.next != nil && seen < offset {
		cur = cur.next
		if !cur.deleted {
			seen++
		}
	}
	return cur
}

// --- Snapshotting ---

type SnapshotNode struct {
	ID      OpID   `json:"id"`
	Value   string `json:"value"`
	Deleted bool   `json:"deleted"`
	After   *OpID  `json:"after,omitempty"`
}

type Snapshot struct {
	Site    string         `json:"site"`
	Counter int64          `json:"counter"`
	Nodes   []SnapshotNode `json:"nodes"`
}

// Snapshot keeps every node, including tombstones, because anchors must
// survive. Compaction (dropping tombstones nobody can reference any more) is
// only safe once every site has acknowledged past them.
func (r *RGA) Snapshot() Snapshot {
	snap := Snapshot{Site: r.site, Counter: r.counter}
	for n := r.head.next; n != nil; n = n.next {
		snap.Nodes = append(snap.Nodes, SnapshotNode{
			ID: n.id, Value: n.value, Deleted: n.deleted, After: n.after,
		})
	}
	return snap
}

func FromSnapshot(site string, snap Snapshot) *RGA {
	r := New(site)
	prev := r.head
	for _, sn := range snap.Nodes {
		n := &node{id: sn.ID, value: sn.Value, deleted: sn.Deleted, after: sn.After}
		prev.next = n
		r.index[sn.ID.Key()] = n
		if sn.ID.Counter > r.seen[sn.ID.Site] {
			r.seen[sn.ID.Site] = sn.ID.Counter
		}
		prev = n
	}
	r.counter = snap.Counter
	return r
}
```

</div>
</CodeTabs>

### এই বাস্তবায়নে যা লক্ষ করার

**Sentinel head।** ডকুমেন্টের একেবারে শুরুতে insert করা আর মাঝখানে insert করা — দুটোর কোড এক রাখতে একটা খালি sentinel node। এটা ছাড়া `after: null` কেসটা আলাদা করে হ্যান্ডল করতে হতো, আর সেখানেই বেশিরভাগ CRDT bug লুকিয়ে থাকে।

**Tie-break একটা total order।** `idGreater` কখনো "সমান" ফেরত দেয় না, কারণ (site, counter) জোড়া unique। partial order হলে দুই replica ভিন্ন সিদ্ধান্ত নিতে পারত।

**Out-of-order op buffer করা হয়।** anchor এখনো আসেনি এমন op ফেলে দেওয়া যায় না — সেটা করলে convergence ভাঙে। বরং anchor-এর key দিয়ে সেগুলো জমিয়ে রাখা, আর anchor এলে drain করা। এটাই causal delivery, application লেভেলে।

**Idempotency version vector দিয়ে।** একই op দুবার এলে `alreadySeen` ধরে ফেলে। reconnect-এর সময় ক্লায়েন্ট নিজের version vector পাঠাবে আর সার্ভার শুধু বাকিটা পাঠাবে — নিচে সেটাই।

<Callout type="warning">

Tombstone কখনো নিঃশর্তে মুছবেন না। একটা tombstone মুছে ফেলা নিরাপদ কেবল তখনই যখন নিশ্চিতভাবে জানা যায় কোনো replica-র কাছে এমন কোনো unsent op নেই যেটা ওই node-কে anchor হিসেবে ব্যবহার করছে। বাস্তবে এর মানে: সব active site-এর acknowledged version vector দেখে, আর একটা grace period রেখে, তবেই compaction।

</Callout>

## Op log, snapshot আর persistence

ডকুমেন্টের সত্য হলো op-গুলোর ক্রম — ঠিক যেমন চ্যাপ্টার ২৪-এর লেজারে সত্য ছিল entry-র ক্রম। এটাও একটা append-only log।

```sql
CREATE TABLE doc_ops (
    doc_id      UUID        NOT NULL,
    seq         BIGINT      NOT NULL,      -- server-assigned, monotonic per doc
    site_id     TEXT        NOT NULL,
    site_counter BIGINT     NOT NULL,
    payload     JSONB       NOT NULL,      -- the op itself
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (doc_id, seq)
);

-- Deduplicate replayed ops from a reconnecting client.
CREATE UNIQUE INDEX idx_doc_ops_origin ON doc_ops (doc_id, site_id, site_counter);

CREATE TABLE doc_snapshots (
    doc_id      UUID        NOT NULL,
    up_to_seq   BIGINT      NOT NULL,
    storage_key TEXT        NOT NULL,      -- object storage path
    byte_size   BIGINT      NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (doc_id, up_to_seq)
);
```

কেন snapshot লাগে? কারণ একটা তিন বছরের পুরোনো ডকুমেন্টে কয়েক লক্ষ op থাকতে পারে, আর নতুন কেউ join করলে সবগুলো replay করা মানে কয়েক সেকেন্ডের লোডিং। snapshot মানে: "seq ৪৮২০০ পর্যন্ত সব কিছুর ফলাফল এই blob-টা" — নতুন ক্লায়েন্ট blob নেবে, তারপর শুধু ৪৮২০০-র পরের op-গুলো।

**Snapshot কৌশল:**

- প্রতি N ops (যেমন ৫০০০) বা প্রতি M মিনিটের idle-এর পরে — যেটা আগে আসে
- Snapshot লেখা asynchronous, কখনো user-facing path-এ নয়
- পুরোনো snapshot অন্তত দুটো রাখুন (সর্বশেষটা corrupt হলে আগেরটা + op replay)
- Op log কখনো truncate করবেন না যদি না snapshot নিশ্চিতভাবে durable — আর তখনও একটা বড় retention রাখুন (ইতিহাস, version history feature, দুর্ঘটনা)

<Callout type="tip">

Snapshot হলো derived data। যেকোনো সময় op log থেকে আবার বানানো যায় — এটা পরীক্ষা করে দেখুন, একটা "rebuild snapshot from scratch" job লিখে রাখুন আর মাঝে মাঝে চালান। যদি না বানানো যায়, তার মানে কোথাও state আছে যা log-এ নেই, আর সেটাই আপনার ভবিষ্যতের data-loss incident।

</Callout>

## Presence আর awareness

Presence হলো "কে এখন এই ডকুমেন্টে আছে", আর awareness তার চেয়ে বেশি — কার cursor কোথায়, কে কোন অংশ select করে রেখেছে, কে টাইপ করছে।

তিনটে নিয়ম:

**এক: awareness কখনো persist করবেন না।** এটা সম্পূর্ণ ephemeral। ইউজার disconnect হলে ৩০ সেকেন্ডের মধ্যে মুছে যাবে — TTL-ই যথেষ্ট, কোনো explicit cleanup দরকার নেই।

**দুই: coalesce করুন।** সিনা টাইপ করলে সেকেন্ডে ৩০ বার cursor সরে। প্রতিবার broadcast করলে ৫০ জনের room-এ সেকেন্ডে ১৫০০ মেসেজ। বদলে ৫০-১০০ms-এর window-এ শেষ অবস্থাটাই পাঠান — cursor-এর মধ্যবর্তী অবস্থানগুলো কারও দরকার নেই। এটাই চ্যাপ্টার ৯-এ দেখা batching-এর সরাসরি প্রয়োগ।

**তিন: awareness আর op আলাদা চ্যানেলে রাখুন, আর awareness drop করা নিরাপদ।** সার্ভার চাপে পড়লে awareness update ফেলে দেওয়া যায়; op ফেলে দেওয়া যায় না। back-pressure-এর সময় এই পার্থক্যটাই সিস্টেম বাঁচায়।

## Connection layer আর room scaling

একটা ডকুমেন্ট = একটা room। প্রশ্ন হলো: একই room-এর ইউজাররা যদি ভিন্ন সার্ভারে connect করে, op-গুলো কীভাবে সবার কাছে পৌঁছাবে?

দুটো মডেল:

| মডেল                  | কীভাবে                                                                                | সুবিধা                                              | অসুবিধা                                                        |
| --------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| Sticky room ownership | consistent hashing দিয়ে ঠিক করা হয় কোন node একটা doc-এর মালিক; সব op ওই node-এ যায় | সহজ ordering, একটামাত্র in-memory replica, কম মেমরি | node হারালে room migrate করতে হয়                              |
| Pub/sub fan-out       | যেকোনো node op নেয়, সবাইকে bus-এ broadcast করে                                       | কোনো ownership নেই, failover সহজ                    | প্রতি node-এ প্রতি doc-এর copy, ordering আলাদা করে সামলাতে হয় |

CRDT ব্যবহার করলে দ্বিতীয়টা সম্ভব, কারণ ordering নিয়ে চিন্তা নেই — যেকোনো ক্রমে op এলেও converge করবে। OT ব্যবহার করলে প্রথমটা বাধ্যতামূলক, কারণ transform-এর জন্য একটা authoritative ক্রম লাগে।

বাস্তবে বেশিরভাগ সিস্টেম sticky ownership বেছে নেয় CRDT-তেও — কারণ তখন সার্ভারে ডকুমেন্টের একটা কপি রাখলেই চলে (snapshot বানাতে, নতুন joiner-কে দিতে, permission enforce করতে)।

<Mermaid
title="Room Ownership and Reconnect"
code={`graph TD
  CL["Client<br/>version vector"] --> GW["Gateway Node<br/>terminates websocket"]
  GW --> HR["Hash Ring<br/>doc id to owner"]
  HR --> OW["Owner Node<br/>authoritative replica"]
  OW --> LOG["Op Log<br/>durable append"]
  OW --> BC["Broadcast<br/>to all room members"]
  OW --> MIG["Migration<br/>drain on owner loss"]
  MIG --> OW2["New Owner<br/>load snapshot plus tail"]`}
/>

## Offline আর reconnect

এটাই সেই জায়গা যেখানে CRDT সত্যিই দাম উসুল করে দেয়।

সিনা প্লেনে বসে ২০ মিনিট ধরে লিখেছেন, নেটওয়ার্ক নেই। তার ব্রাউজারে ৩০০টা op জমেছে, সবগুলো তার local replica-তে প্রয়োগ হয়ে গেছে — সে যা দেখছে সেটা তার কাছে সম্পূর্ণ বৈধ ডকুমেন্ট। এদিকে বিরুনি একই সময়ে ৫০০টা op করেছেন।

Reconnect হলে protocol-টা এরকম:

```
client -> server:  HELLO { docId, siteId, versionVector }
server:            diff = ops in log where (site, counter) not covered
                          by client's versionVector
server -> client:  SYNC  { snapshotUrl?, ops[], serverVersionVector }
client -> server:  PUSH  { ops[] }   // everything the server has not seen
server:            dedupe by (docId, siteId, siteCounter) unique index
server -> room:    BROADCAST { ops[] }
```

তিনটে জিনিস এখানে গুরুত্বপূর্ণ:

**Version vector দুই দিকেই যায়।** ক্লায়েন্ট বলে "আমার কাছে এই এই আছে", সার্ভার বলে "আমার কাছে এই এই আছে" — দুজনেই শুধু ঘাটতিটা পাঠায়। এটা `lastSeq` পাঠানোর চেয়ে ভালো কারণ ক্লায়েন্ট বিভিন্ন site-এর op বিভিন্ন গতিতে পেয়ে থাকতে পারে।

**Dedupe DB-তে, কোডে নয়।** `(doc_id, site_id, site_counter)`-এ unique index থাকলে ক্লায়েন্ট একই op দশবার push করলেও দশবার লেখা হবে না। কোডে "আগে দেখেছি কিনা" চেক করা race-প্রবণ; unique constraint নয়।

**ব্যবধান বড় হলে snapshot পাঠান, op নয়।** ক্লায়েন্ট যদি ৫০ হাজার op পিছিয়ে থাকে, তাকে ৫০ হাজার op পাঠানোর চেয়ে "এই snapshot নাও, তারপর শেষ ২০০টা op" অনেক সস্তা। একটা threshold রাখুন।

**Reconnect storm সামলান।** একটা gateway node restart করলে তার সব ক্লায়েন্ট একসাথে reconnect করবে। jitter সহ exponential backoff বাধ্যতামূলক — চ্যাপ্টার ১৯-এ যা দেখেছেন, এখানে সেটা না করলে restart-ই একটা self-inflicted DDoS।

### সার্ভার সাইডে পুরো protocol-টা

নিচে room server-এর বাস্তবায়ন — sync, push, broadcast, awareness coalescing, snapshot trigger আর room migration সহ।

<CodeTabs tsFile="room-server.ts" goFile="room_server.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import type { Op, OpId } from './rga-crdt';
import { RGA, idKey } from './rga-crdt';

// --- Wire protocol ---

export type ClientMessage =
	| { t: 'hello'; docId: string; siteId: string; vv: Record<string, number> }
	| { t: 'push'; ops: Op[] }
	| { t: 'awareness'; state: AwarenessState }
	| { t: 'ping' };

export type ServerMessage =
	| { t: 'sync'; snapshotUrl?: string; ops: Op[]; vv: Record<string, number> }
	| { t: 'ops'; ops: Op[] }
	| { t: 'awareness'; peers: Array<AwarenessState & { siteId: string }> }
	| { t: 'error'; code: string; message: string }
	| { t: 'pong' };

export interface AwarenessState {
	displayName: string;
	cursor: { anchor: OpId | null; head: OpId | null } | null;
	colour: string;
}

export interface Connection {
	siteId: string;
	userId: string;
	send(msg: ServerMessage): void;
	close(code: string): void;
}

export interface OpLog {
	/** Appends ops, deduplicating on (docId, siteId, siteCounter). Returns the accepted subset. */
	append(docId: string, ops: Op[]): Promise<Op[]>;
	/** Every op the caller has not seen, according to their version vector. */
	since(docId: string, vv: Record<string, number>): Promise<Op[]>;
	count(docId: string): Promise<number>;
	latestSnapshot(docId: string): Promise<{ url: string; vv: Record<string, number> } | null>;
	putSnapshot(docId: string, blob: string, vv: Record<string, number>): Promise<string>;
}

export interface Authorizer {
	canRead(userId: string, docId: string): Promise<boolean>;
	canWrite(userId: string, docId: string): Promise<boolean>;
}

const AWARENESS_FLUSH_MS = 80;
const AWARENESS_TTL_MS = 30_000;
const SNAPSHOT_EVERY_OPS = 5_000;
/** Beyond this backlog we ship a snapshot instead of a wall of ops. */
const SNAPSHOT_INSTEAD_OF_OPS = 2_000;

interface Peer {
	conn: Connection;
	awareness: AwarenessState | null;
	awarenessAt: number;
}

/**
 * One Room owns one document on one node. The hash ring decides which node
 * that is; everything below assumes ownership has already been established.
 */
export class Room {
	private readonly peers = new Map<string, Peer>();
	private awarenessDirty = false;
	private awarenessTimer: ReturnType<typeof setTimeout> | null = null;
	private opsSinceSnapshot = 0;
	private draining = false;

	private constructor(
		readonly docId: string,
		private readonly doc: RGA,
		private readonly log: OpLog,
		private readonly auth: Authorizer
	) {}

	/** Load from the newest snapshot plus the tail of the op log. */
	static async open(docId: string, log: OpLog, auth: Authorizer): Promise<Room> {
		const snap = await log.latestSnapshot(docId);
		let doc: RGA;
		if (snap) {
			const blob = await fetch(snap.url).then((r) => r.json());
			doc = RGA.fromSnapshot(`server:${docId}`, blob);
			for (const op of await log.since(docId, snap.vv)) doc.applyRemote(op);
		} else {
			doc = new RGA(`server:${docId}`);
			for (const op of await log.since(docId, {})) doc.applyRemote(op);
		}
		return new Room(docId, doc, log, auth);
	}

	async handle(conn: Connection, msg: ClientMessage): Promise<void> {
		if (this.draining) {
			conn.send({ t: 'error', code: 'MIGRATING', message: 'reconnect, this room is moving' });
			conn.close('migrating');
			return;
		}

		switch (msg.t) {
			case 'hello':
				return this.onHello(conn, msg);
			case 'push':
				return this.onPush(conn, msg.ops);
			case 'awareness':
				return this.onAwareness(conn, msg.state);
			case 'ping':
				conn.send({ t: 'pong' });
				return;
		}
	}

	private async onHello(
		conn: Connection,
		msg: Extract<ClientMessage, { t: 'hello' }>
	): Promise<void> {
		if (!(await this.auth.canRead(conn.userId, this.docId))) {
			conn.send({ t: 'error', code: 'FORBIDDEN', message: 'no read access' });
			conn.close('forbidden');
			return;
		}

		this.peers.set(conn.siteId, { conn, awareness: null, awarenessAt: Date.now() });

		const missing = await this.log.since(this.docId, msg.vv);

		// A client that is far behind gets a snapshot, not a wall of ops.
		if (missing.length > SNAPSHOT_INSTEAD_OF_OPS) {
			const snap = await this.log.latestSnapshot(this.docId);
			if (snap) {
				const tail = await this.log.since(this.docId, snap.vv);
				conn.send({ t: 'sync', snapshotUrl: snap.url, ops: tail, vv: this.doc.versionVector() });
				this.broadcastAwarenessSoon();
				return;
			}
		}

		conn.send({ t: 'sync', ops: missing, vv: this.doc.versionVector() });
		this.broadcastAwarenessSoon();
	}

	private async onPush(conn: Connection, ops: Op[]): Promise<void> {
		if (!(await this.auth.canWrite(conn.userId, this.docId))) {
			// The client applied these optimistically; tell it to roll back.
			conn.send({ t: 'error', code: 'READ_ONLY', message: 'rollback: no write access' });
			return;
		}
		// Reject ops forged under someone else's site id.
		for (const op of ops) {
			if (op.id.site !== conn.siteId) {
				conn.send({ t: 'error', code: 'BAD_SITE', message: `op ${idKey(op.id)} is not yours` });
				return;
			}
		}

		// The unique index on (doc_id, site_id, site_counter) is what actually
		// guarantees dedupe. A replayed push writes nothing twice.
		const accepted = await this.log.append(this.docId, ops);
		if (accepted.length === 0) return;

		for (const op of accepted) this.doc.applyRemote(op);
		this.opsSinceSnapshot += accepted.length;

		for (const [siteId, peer] of this.peers) {
			if (siteId === conn.siteId) continue; // the sender already applied them
			peer.conn.send({ t: 'ops', ops: accepted });
		}

		if (this.opsSinceSnapshot >= SNAPSHOT_EVERY_OPS) {
			this.opsSinceSnapshot = 0;
			// Fire and forget: snapshotting must never sit in the write path.
			void this.snapshot();
		}
	}

	private onAwareness(conn: Connection, state: AwarenessState): void {
		const peer = this.peers.get(conn.siteId);
		if (!peer) return;
		peer.awareness = state;
		peer.awarenessAt = Date.now();
		this.broadcastAwarenessSoon();
	}

	/**
	 * Awareness is coalesced: at most one broadcast per window, carrying only
	 * the latest state. Intermediate cursor positions are worthless.
	 */
	private broadcastAwarenessSoon(): void {
		this.awarenessDirty = true;
		if (this.awarenessTimer) return;
		this.awarenessTimer = setTimeout(() => {
			this.awarenessTimer = null;
			if (!this.awarenessDirty) return;
			this.awarenessDirty = false;
			this.flushAwareness();
		}, AWARENESS_FLUSH_MS);
	}

	private flushAwareness(): void {
		const now = Date.now();
		const peers: Array<AwarenessState & { siteId: string }> = [];
		for (const [siteId, peer] of this.peers) {
			if (!peer.awareness) continue;
			if (now - peer.awarenessAt > AWARENESS_TTL_MS) continue; // expired, not persisted
			peers.push({ siteId, ...peer.awareness });
		}
		for (const peer of this.peers.values()) {
			peer.conn.send({ t: 'awareness', peers });
		}
	}

	disconnect(siteId: string): void {
		this.peers.delete(siteId);
		this.broadcastAwarenessSoon();
	}

	private async snapshot(): Promise<void> {
		const blob = JSON.stringify(this.doc.snapshot());
		await this.log.putSnapshot(this.docId, blob, this.doc.versionVector());
	}

	/**
	 * Migration: stop accepting work, flush a snapshot so the new owner starts
	 * cheap, then push every client to reconnect. Clients keep their local
	 * replica and unsent ops, so nothing is lost.
	 */
	async drain(): Promise<void> {
		this.draining = true;
		if (this.awarenessTimer) clearTimeout(this.awarenessTimer);
		await this.snapshot();
		for (const peer of this.peers.values()) {
			peer.conn.send({ t: 'error', code: 'MIGRATING', message: 'reconnect' });
			peer.conn.close('migrating');
		}
		this.peers.clear();
	}

	get memberCount(): number {
		return this.peers.size;
	}

	text(): string {
		return this.doc.toString();
	}
}
```

</div>
<div class="ct-panel" data-lang="go">

```go
package room

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"example.com/crdt"
)

// --- Wire protocol ---

type ClientMessage struct {
	T     string           `json:"t"` // hello | push | awareness | ping
	DocID string           `json:"docId,omitempty"`
	Site  string           `json:"siteId,omitempty"`
	VV    map[string]int64 `json:"vv,omitempty"`
	Ops   []crdt.Op        `json:"ops,omitempty"`
	State *AwarenessState  `json:"state,omitempty"`
}

type ServerMessage struct {
	T           string            `json:"t"` // sync | ops | awareness | error | pong
	SnapshotURL string            `json:"snapshotUrl,omitempty"`
	Ops         []crdt.Op         `json:"ops,omitempty"`
	VV          map[string]int64  `json:"vv,omitempty"`
	Peers       []AwarenessPeer   `json:"peers,omitempty"`
	Code        string            `json:"code,omitempty"`
	Message     string            `json:"message,omitempty"`
}

type Cursor struct {
	Anchor *crdt.OpID `json:"anchor"`
	Head   *crdt.OpID `json:"head"`
}

type AwarenessState struct {
	DisplayName string  `json:"displayName"`
	Cursor      *Cursor `json:"cursor"`
	Colour      string  `json:"colour"`
}

type AwarenessPeer struct {
	SiteID string `json:"siteId"`
	AwarenessState
}

type Connection interface {
	SiteID() string
	UserID() string
	Send(ServerMessage)
	Close(reason string)
}

// OpLog is the durable source of truth for a document.
type OpLog interface {
	// Append deduplicates on (docID, siteID, siteCounter) and returns the
	// accepted subset.
	Append(ctx context.Context, docID string, ops []crdt.Op) ([]crdt.Op, error)
	// Since returns every op the caller has not seen, per their version vector.
	Since(ctx context.Context, docID string, vv map[string]int64) ([]crdt.Op, error)
	LatestSnapshot(ctx context.Context, docID string) (url string, vv map[string]int64, err error)
	PutSnapshot(ctx context.Context, docID string, blob []byte, vv map[string]int64) (string, error)
	FetchSnapshot(ctx context.Context, url string) ([]byte, error)
}

type Authorizer interface {
	CanRead(ctx context.Context, userID, docID string) (bool, error)
	CanWrite(ctx context.Context, userID, docID string) (bool, error)
}

const (
	awarenessFlush        = 80 * time.Millisecond
	awarenessTTL          = 30 * time.Second
	snapshotEveryOps      = 5000
	snapshotInsteadOfOps  = 2000
)

type peer struct {
	conn        Connection
	awareness   *AwarenessState
	awarenessAt time.Time
}

// Room owns one document on one node. The hash ring decides which node that
// is; everything below assumes ownership has already been established.
type Room struct {
	DocID string

	mu               sync.Mutex
	doc              *crdt.RGA
	log              OpLog
	auth             Authorizer
	peers            map[string]*peer
	awarenessDirty   bool
	awarenessTimer   *time.Timer
	opsSinceSnapshot int
	draining         bool
}

// Open loads a room from the newest snapshot plus the tail of the op log.
func Open(ctx context.Context, docID string, log OpLog, auth Authorizer) (*Room, error) {
	site := "server:" + docID

	url, vv, err := log.LatestSnapshot(ctx, docID)
	if err != nil {
		return nil, err
	}

	var doc *crdt.RGA
	if url != "" {
		blob, err := log.FetchSnapshot(ctx, url)
		if err != nil {
			return nil, err
		}
		var snap crdt.Snapshot
		if err := json.Unmarshal(blob, &snap); err != nil {
			return nil, err
		}
		doc = crdt.FromSnapshot(site, snap)
	} else {
		doc = crdt.New(site)
		vv = map[string]int64{}
	}

	tail, err := log.Since(ctx, docID, vv)
	if err != nil {
		return nil, err
	}
	for _, op := range tail {
		_ = doc.ApplyRemote(op)
	}

	return &Room{
		DocID: docID, doc: doc, log: log, auth: auth,
		peers: map[string]*peer{},
	}, nil
}

func (r *Room) Handle(ctx context.Context, conn Connection, msg ClientMessage) error {
	r.mu.Lock()
	draining := r.draining
	r.mu.Unlock()
	if draining {
		conn.Send(ServerMessage{T: "error", Code: "MIGRATING", Message: "reconnect, this room is moving"})
		conn.Close("migrating")
		return nil
	}

	switch msg.T {
	case "hello":
		return r.onHello(ctx, conn, msg)
	case "push":
		return r.onPush(ctx, conn, msg.Ops)
	case "awareness":
		if msg.State != nil {
			r.onAwareness(conn, *msg.State)
		}
		return nil
	case "ping":
		conn.Send(ServerMessage{T: "pong"})
		return nil
	default:
		return fmt.Errorf("unknown message type %q", msg.T)
	}
}

func (r *Room) onHello(ctx context.Context, conn Connection, msg ClientMessage) error {
	ok, err := r.auth.CanRead(ctx, conn.UserID(), r.DocID)
	if err != nil {
		return err
	}
	if !ok {
		conn.Send(ServerMessage{T: "error", Code: "FORBIDDEN", Message: "no read access"})
		conn.Close("forbidden")
		return nil
	}

	r.mu.Lock()
	r.peers[conn.SiteID()] = &peer{conn: conn, awarenessAt: time.Now()}
	r.mu.Unlock()

	missing, err := r.log.Since(ctx, r.DocID, msg.VV)
	if err != nil {
		return err
	}

	// A client that is far behind gets a snapshot, not a wall of ops.
	if len(missing) > snapshotInsteadOfOps {
		url, vv, err := r.log.LatestSnapshot(ctx, r.DocID)
		if err == nil && url != "" {
			tail, err := r.log.Since(ctx, r.DocID, vv)
			if err != nil {
				return err
			}
			conn.Send(ServerMessage{T: "sync", SnapshotURL: url, Ops: tail, VV: r.versionVector()})
			r.broadcastAwarenessSoon()
			return nil
		}
	}

	conn.Send(ServerMessage{T: "sync", Ops: missing, VV: r.versionVector()})
	r.broadcastAwarenessSoon()
	return nil
}

func (r *Room) onPush(ctx context.Context, conn Connection, ops []crdt.Op) error {
	ok, err := r.auth.CanWrite(ctx, conn.UserID(), r.DocID)
	if err != nil {
		return err
	}
	if !ok {
		// The client applied these optimistically; tell it to roll back.
		conn.Send(ServerMessage{T: "error", Code: "READ_ONLY", Message: "rollback: no write access"})
		return nil
	}
	// Reject ops forged under someone else's site id.
	for _, op := range ops {
		if op.ID.Site != conn.SiteID() {
			conn.Send(ServerMessage{
				T: "error", Code: "BAD_SITE",
				Message: "op " + op.ID.Key() + " is not yours",
			})
			return nil
		}
	}

	// The unique index on (doc_id, site_id, site_counter) is what actually
	// guarantees dedupe. A replayed push writes nothing twice.
	accepted, err := r.log.Append(ctx, r.DocID, ops)
	if err != nil {
		return err
	}
	if len(accepted) == 0 {
		return nil
	}

	r.mu.Lock()
	for _, op := range accepted {
		_ = r.doc.ApplyRemote(op)
	}
	r.opsSinceSnapshot += len(accepted)
	needSnapshot := r.opsSinceSnapshot >= snapshotEveryOps
	if needSnapshot {
		r.opsSinceSnapshot = 0
	}
	targets := make([]Connection, 0, len(r.peers))
	for siteID, p := range r.peers {
		if siteID == conn.SiteID() {
			continue // the sender already applied them
		}
		targets = append(targets, p.conn)
	}
	r.mu.Unlock()

	for _, c := range targets {
		c.Send(ServerMessage{T: "ops", Ops: accepted})
	}

	if needSnapshot {
		// Snapshotting must never sit in the write path.
		go func() {
			if err := r.Snapshot(context.Background()); err != nil {
				fmt.Printf("snapshot failed for %s: %v\n", r.DocID, err)
			}
		}()
	}
	return nil
}

func (r *Room) onAwareness(conn Connection, state AwarenessState) {
	r.mu.Lock()
	if p, ok := r.peers[conn.SiteID()]; ok {
		p.awareness = &state
		p.awarenessAt = time.Now()
	}
	r.mu.Unlock()
	r.broadcastAwarenessSoon()
}

// broadcastAwarenessSoon coalesces: at most one broadcast per window, carrying
// only the latest state. Intermediate cursor positions are worthless.
func (r *Room) broadcastAwarenessSoon() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.awarenessDirty = true
	if r.awarenessTimer != nil {
		return
	}
	r.awarenessTimer = time.AfterFunc(awarenessFlush, func() {
		r.mu.Lock()
		r.awarenessTimer = nil
		dirty := r.awarenessDirty
		r.awarenessDirty = false
		r.mu.Unlock()
		if dirty {
			r.flushAwareness()
		}
	})
}

func (r *Room) flushAwareness() {
	r.mu.Lock()
	now := time.Now()
	peers := make([]AwarenessPeer, 0, len(r.peers))
	for siteID, p := range r.peers {
		if p.awareness == nil || now.Sub(p.awarenessAt) > awarenessTTL {
			continue // expired, and never persisted anywhere
		}
		peers = append(peers, AwarenessPeer{SiteID: siteID, AwarenessState: *p.awareness})
	}
	targets := make([]Connection, 0, len(r.peers))
	for _, p := range r.peers {
		targets = append(targets, p.conn)
	}
	r.mu.Unlock()

	for _, c := range targets {
		c.Send(ServerMessage{T: "awareness", Peers: peers})
	}
}

func (r *Room) Disconnect(siteID string) {
	r.mu.Lock()
	delete(r.peers, siteID)
	r.mu.Unlock()
	r.broadcastAwarenessSoon()
}

func (r *Room) Snapshot(ctx context.Context) error {
	r.mu.Lock()
	blob, err := json.Marshal(r.doc.Snapshot())
	vv := r.doc.VersionVector()
	r.mu.Unlock()
	if err != nil {
		return err
	}
	_, err = r.log.PutSnapshot(ctx, r.DocID, blob, vv)
	return err
}

// Drain migrates the room: stop accepting work, flush a snapshot so the new
// owner starts cheap, then push every client to reconnect. Clients keep their
// local replica and unsent ops, so nothing is lost.
func (r *Room) Drain(ctx context.Context) error {
	r.mu.Lock()
	r.draining = true
	if r.awarenessTimer != nil {
		r.awarenessTimer.Stop()
		r.awarenessTimer = nil
	}
	targets := make([]Connection, 0, len(r.peers))
	for _, p := range r.peers {
		targets = append(targets, p.conn)
	}
	r.peers = map[string]*peer{}
	r.mu.Unlock()

	if err := r.Snapshot(ctx); err != nil {
		return err
	}
	for _, c := range targets {
		c.Send(ServerMessage{T: "error", Code: "MIGRATING", Message: "reconnect"})
		c.Close("migrating")
	}
	return nil
}

func (r *Room) versionVector() map[string]int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.doc.VersionVector()
}

func (r *Room) MemberCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.peers)
}

func (r *Room) Text() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.doc.String()
}
```

</div>
</CodeTabs>

তিনটে জিনিস এখানে ইচ্ছে করে করা হয়েছে। **Push-এ site id যাচাই** — ক্লায়েন্ট অন্যের siteId দিয়ে op বানাতে পারবে না, নইলে একজন ইউজার আরেকজনের নামে লিখতে পারত। **Snapshot লেখা write path-এর বাইরে** — একটা ৫ MB snapshot serialize করতে যে সময় লাগে, সেটা কোনো ইউজারের কি-স্ট্রোকের latency-তে যোগ হওয়া উচিত নয়। আর **drain-এর আগে snapshot** — নতুন owner যাতে সস্তায় শুরু করতে পারে, কারণ migration-এর সময়টাই সবচেয়ে খারাপ সময় ৫০ হাজার op replay করার।

<Callout type="warning">

Offline ক্লায়েন্টের op-গুলো লোকালি persist করতে হবে (IndexedDB), মেমরিতে নয়। ব্রাউজার ট্যাব বন্ধ হলে বা crash করলে ২০ মিনিটের কাজ হারিয়ে যাওয়া — এটা ব্যবহারকারীর কাছে "collaborative editor" নয়, "বিশ্বাসঘাতক editor"।

</Callout>

## Permission, undo আর অন্যান্য কঠিন প্রান্ত

**Permission কোথায় enforce হবে?** CRDT-র মূল ধারণা হলো যেকোনো op যেকোনো ক্রমে গ্রহণযোগ্য — কিন্তু "গ্রহণযোগ্য" মানে "অনুমোদিত" নয়। authorization চেক হবে সার্ভারে, op log-এ লেখার ঠিক আগে। read-only ইউজারের op সার্ভার প্রত্যাখ্যান করবে, আর ক্লায়েন্টকে বলবে তার local state rollback করতে। এটা optimistic UI-এর চেনা দাম।

**Undo সহজ নয়।** "আমার শেষ কাজটা undo করো" মানে "আমার ওই op-গুলোর প্রভাব বাতিল করো" — কিন্তু এর মধ্যে অন্যরা ওই অংশে আরও লিখে ফেলেছে। সঠিক সমাধান: undo হলো নতুন op (delete-কে বাতিল করতে re-insert, insert-কে বাতিল করতে delete), এবং সেটা **selective undo** — শুধু নিজের op, অন্যের নয়। এটা চ্যাপ্টার ২৪-এর reversal entry-র সাথে একই দর্শন: অতীত মুছি না, অতীতকে বাতিল করে নতুন কিছু যোগ করি।

**Rich text আরও এক ধাপ কঠিন।** "এই অংশটা bold" — কিন্তু "এই অংশ"-এর সীমানা concurrent edit-এ সরে যায়। সমাধান হলো formatting-কেও anchor-ভিত্তিক করা: "id A থেকে id B পর্যন্ত bold", index দিয়ে নয়। এখানেই বেশিরভাগ ঘরে-বানানো CRDT ভেঙে পড়ে, আর এখানেই Yjs/Automerge-এর মতো পরিণত লাইব্রেরি নেওয়া বুদ্ধিমানের কাজ।

**মেমরি খরচ বাস্তব সমস্যা।** প্রতি অক্ষরে একটা id মানে একটা ১০০ KB ডকুমেন্ট মেমরিতে কয়েক MB হতে পারে। পরিণত লাইব্রেরিগুলো এটা সামলায় **run-length encoding** দিয়ে — পরপর একই site-এর ধারাবাহিক counter-এর অক্ষরগুলো একটা block হিসেবে রাখে। আমাদের উপরের বাস্তবায়ন শেখার জন্য পরিষ্কার, কিন্তু প্রোডাকশনে এই optimization ছাড়া চলবে না।

## ট্রেড-অফ যা আমরা সচেতনভাবে নিয়েছি

| সিদ্ধান্ত                        | যা পেলাম                                                           | যা দিলাম                                     |
| -------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| CRDT, OT নয়                     | offline-first, সহজ correctness reasoning, server-independent merge | বেশি মেমরি, tombstone, বড় op payload        |
| Sticky room ownership            | সার্ভারে একটামাত্র replica, সহজ snapshot ও permission              | owner হারালে migration লাগে                  |
| Awareness ephemeral              | ডেটাবেসে write storm নেই                                           | reconnect-এর পর presence কয়েক সেকেন্ড ফাঁকা |
| Op log durable, snapshot derived | পূর্ণ ইতিহাস, version history সম্ভব                                | storage খরচ, compaction-এর জটিলতা            |
| Optimistic local apply           | শূন্য-latency টাইপিং অভিজ্ঞতা                                      | permission reject হলে rollback UX            |

শেষ সারিটা মনে রাখার মতো। কোলাবোরেটিভ এডিটরে ইউজার তার নিজের কি-স্ট্রোক সাথে সাথেই দেখতে চায় — সার্ভারের অনুমতির জন্য অপেক্ষা করা অসম্ভব। তাই local apply আগে, confirmation পরে। এটা চ্যাপ্টার ২৪-এর লেজারের ঠিক বিপরীত দর্শন, আর সেটাই স্বাভাবিক: একটা অক্ষর ভুল জায়গায় বসলে ঠিক করে নেওয়া যায়, একটা টাকা ভুল জায়গায় গেলে যায় না।

<div class="takeaways">

### মূল শেখা

- কোলাবোরেটিভ এডিটিং-এর একমাত্র অলঙ্ঘনীয় শর্ত হলো convergence — সবাই শেষ পর্যন্ত একই জিনিস দেখবে; "কে ঠিক" সেটা গৌণ
- OT index দিয়ে জায়গা বোঝায় তাই একটা central authority লাগে; CRDT immutable id দিয়ে বোঝায় তাই লাগে না — এই একটা পার্থক্য থেকেই বাকি সব ট্রেড-অফ জন্মায়
- নিজে OT লিখবেন না; transform function-এর জোড়াগুলো কুখ্যাতভাবে ভুল হয়। CRDT নিজে লেখা তুলনামূলক নিরাপদ, তবে rich text-এর জন্য পরিণত লাইব্রেরি নিন
- Delete মানে unlink নয়, tombstone — কারণ অন্য replica-র op ওই node-কে anchor হিসেবে ধরে থাকতে পারে
- Op log durable আর snapshot derived; snapshot যেকোনো সময় log থেকে rebuild করা যেতে হবে, আর সেই rebuild job-টা নিয়মিত পরীক্ষা করতে হবে
- Awareness (cursor, presence) কখনো persist করবেন না, coalesce করুন, আর চাপে পড়লে drop করুন — op-এর সাথে একে কখনো এক পাল্লায় মাপবেন না
- Reconnect-এ version vector দুই দিকে বিনিময় করুন আর dedupe করুন unique index দিয়ে, কোডের চেকে নয়

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Google Docs** OT ব্যবহার করে একটা central transform server সহ — বিশ্বের সবচেয়ে বড় প্রমাণ যে OT স্কেলে কাজ করে, তবে কেন্দ্রীয় সার্ভার ছাড়া নয়
- **Figma** একটা CRDT-অনুপ্রাণিত মডেল চালায় যেখানে সার্ভার থাকায় তারা পূর্ণ peer-to-peer CRDT-র মেমরি খরচ এড়িয়েছে
- **Yjs** run-length-encoded CRDT দিয়ে প্রোডাকশন-গ্রেড rich text ও awareness protocol দেয়, আর এটাই আজকের বেশিরভাগ নতুন কোলাবোরেটিভ অ্যাপের ভিত্তি
- **Automerge** JSON-এর মতো ডেটা স্ট্রাকচারের জন্য CRDT দেয়, offline-first ও local-first অ্যাপের জন্য বানানো
- **Linear / Notion** local-first sync engine চালায় যেখানে ক্লায়েন্ট optimistic apply করে আর সার্ভার authorization ও durable ordering সামলায়

</div>
