---
title: 'ডিজাইন রিভিউ প্লেবুক'
subtitle: 'সাদা পাতা থেকে শুরু করে একটা ডিজাইন দাঁড় করানো, requirement বার করে আনা, ট্রেড-অফ আগে সামনে আনা, পড়ার মতো design doc লেখা, রিভিউ চালানো — আর একই পদ্ধতি ইন্টারভিউতে চালানো।'
chapter: 27
level: 'mastery'
readingTime: '৩০ মিনিট'
topics:
  [
    'design review',
    'design doc',
    'requirements',
    'trade-offs',
    'system design interview',
    'architecture process'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

কর্ডোবার এক নামকরা স্থপতি ছিলেন — মারিয়াম আল-আসতুরলাবি। তাঁর কাছে একদিন এক বণিক এলেন এবং বললেন, "আমার একটা বাড়ি বানিয়ে দিন।" মারিয়াম কাগজ-কলম বার করলেন না। তিনি বসতে বললেন, আর প্রশ্ন করতে শুরু করলেন। "বাড়িতে কারা থাকবে?" — বণিক, তাঁর স্ত্রী, চার সন্তান, আর তিনজন কর্মচারী। "কতদিন থাকবেন?" — সারাজীবন, ছেলেরা বড় হয়ে আলাদা ঘর চাইবে। "মাল রাখার দরকার আছে?" — এইখানে বণিক থমকে গেলেন, তারপর বললেন, "আসলে হ্যাঁ, নিচতলায় একটা গুদাম লাগবে, আর গাড়ি ঢোকার মতো চওড়া দরজা।" আধা ঘণ্টার প্রশ্নোত্তরে "একটা বাড়ি" থেকে বেরিয়ে এলো একটা ভিন্ন জিনিস: নিচে বাণিজ্যিক গুদাম, উপরে আবাসিক, আর ভবিষ্যতে দুটো ঘর বাড়ানোর জায়গা। বণিক নিজেও জানতেন না তিনি এটাই চাইছিলেন।

তারপর মারিয়াম যেটা করলেন সেটা তাঁর ছাত্রদের কাছে সবচেয়ে অদ্ভুত লাগত। তিনি সুন্দর করে সামনের নকশা আঁকা শুরু করলেন না। তিনি প্রথমে মাটির নমুনা আনালেন, আর গলির প্রস্থ মেপে এলেন। কারণ তিনি জানতেন — মাটি যদি নরম হয়, তিনতলা তোলা যাবে না, আর গলি যদি সরু হয়, বড় পাথর ঢুকবে না। এই দুটো উত্তরের উপর গোটা নকশা দাঁড়িয়ে। খারাপ খবরটা যদি ছয় মাস পরে আসে, ততদিনে দেয়াল উঠে গেছে। **যে সিদ্ধান্ত সবচেয়ে বেশি জিনিস আটকে দেয়, সেটা সবার আগে**।

নকশা যখন দাঁড়াল, মারিয়াম সেটা নিয়ে গেলেন গিল্ডের তিনজন প্রবীণের কাছে। কিন্তু তিনি নকশাটা টেবিলে রেখে "কেমন লাগল?" বলে বসে থাকলেন না। তিনি এক পাতার একটা কাগজ দিলেন যাতে লেখা: বাড়িটা কার জন্য, কী কী সীমাবদ্ধতা আছে, তিনি কোন তিনটে পথ বিবেচনা করেছেন, কোনটা বেছেছেন আর কেন, আর কোন দুটো জায়গায় তিনি নিজেই অনিশ্চিত। শেষ লাইনটাই ছিল আসল — তিনি নিজের দুর্বল জায়গাগুলো নিজেই দেখিয়ে দিলেন। প্রবীণরা তাই সময় নষ্ট করলেন না জানালার মাপ নিয়ে; তাঁরা সোজা গিয়ে ধরলেন গুদামের ছাদের ভার নিয়ে, যেটা মারিয়াম নিজেও সন্দেহ করছিলেন। একজন বললেন, "চল্লিশ বছর আগে এই গলিতেই একটা গুদামের ছাদ ভেঙেছিল, বর্ষায় মাল ভিজে ওজন বেড়ে গিয়েছিল।" এই এক বাক্যে নকশা বদলাল, আর একটা ভবিষ্যৎ দুর্ঘটনা মুছে গেল।

সবশেষে মারিয়াম একটা কাজ করতেন যেটা বাকি স্থপতিরা করতেন না। প্রতিটা নকশার সাথে তিনি একটা আলাদা পাতা রাখতেন যেখানে লেখা থাকত: "যা আমি _করিনি_ এবং কেন।" চারতলা করিনি, কারণ মাটি। মার্বেলের সিঁড়ি করিনি, কারণ বাজেট। উঠোনে ফোয়ারা করিনি, কারণ পানির লাইন এখনো আসেনি — তবে পাইপের জায়গা ছেড়ে রেখেছি। বছর পাঁচেক পরে যখন নতুন কেউ এসে জিজ্ঞেস করত "এখানে ফোয়ারা কেন নেই?", উত্তরটা কাগজে লেখা থাকত। প্রশ্নটা আবার নতুন করে তর্ক হতো না।

মিলিয়ে নিই। কাগজ বার করার আগে প্রশ্ন করাটাই হলো **requirement elicitation** — গ্রাহক যা বলে সেটা নয়, তার আসল সমস্যাটা বার করে আনা, আর "গুদাম লাগবে" হলো সেই **hidden requirement** যেটা প্রশ্ন না করলে কখনো বেরোত না। মাটি আর গলির প্রস্থ আগে মাপা হলো **constraint discovery**, আর সবচেয়ে বেশি জিনিস আটকে দেওয়া সিদ্ধান্ত আগে নেওয়া হলো **sequencing by irreversibility** — যে ট্রেড-অফ ফেরানো সবচেয়ে কঠিন, সেটাই সবার আগে সামনে আনা। এক পাতার কাগজটা হলো **design doc**, নিজের অনিশ্চয়তা নিজেই দেখিয়ে দেওয়া হলো **explicit open questions**, আর প্রবীণের চল্লিশ বছরের স্মৃতি হলো **design review**-এর আসল মূল্য: এমন failure mode যা আপনি কখনো দেখেননি। আর শেষ পাতাটা — "যা করিনি এবং কেন" — হলো **rejected alternatives** ও **decision record**, যেটা ভবিষ্যতে একই তর্ক তিনবার হওয়া বন্ধ করে। এই চ্যাপ্টারটা আসলে মারিয়ামের কর্মপদ্ধতি, সফটওয়্যারের ভাষায়।

## এই চ্যাপ্টারটা কেন আছে

আগের ২৬টা চ্যাপ্টারে আপনি **উপাদান** শিখেছেন — cache, queue, shard, consensus, CRDT, ledger। কিন্তু একটা সাদা পাতার সামনে বসে একজন ইঞ্জিনিয়ারের যে জিনিসটা লাগে, সেটা উপাদানের তালিকা নয়। সেটা হলো একটা **পদ্ধতি**: কোথা থেকে শুরু করব, কোন প্রশ্ন কখন করব, কী আগে ঠিক করব, আর কখন বুঝব যে ডিজাইনটা যথেষ্ট হয়েছে।

সবচেয়ে সাধারণ ব্যর্থতা কোনো ভুল প্রযুক্তি বাছাই নয়। সবচেয়ে সাধারণ ব্যর্থতা হলো **ভুল সমস্যার নিখুঁত সমাধান**। এই চ্যাপ্টার সেটা ঠেকানোর জন্য।

<Callout type="info">

একটা ভালো ডিজাইন প্রক্রিয়ার সহজ পরীক্ষা: ডিজাইন শেষ হওয়ার পর যদি আপনি বলতে পারেন "এই তিনটে জিনিস আমি ইচ্ছে করে খারাপ করেছি, কারণ..." — তাহলে আপনি ডিজাইন করেছেন। যদি সব কিছু ভালো শোনায়, তাহলে আপনি ডিজাইন করেননি, আপনি একটা ইচ্ছেতালিকা লিখেছেন।

</Callout>

## সাদা পাতার পদ্ধতি: ছয়টা ধাপ

<Mermaid
title="The Blank Page Procedure"
code={`graph TD
  R["1 Requirements<br/>what and for whom"] --> S["2 Scale<br/>numbers before nouns"]
  S --> I["3 Interfaces<br/>the contract first"]
  I --> D["4 Data<br/>model and access paths"]
  D --> A["5 Architecture<br/>components and flow"]
  A --> F["6 Failure and Cost<br/>what breaks what it bills"]
  F --> R2["Revisit<br/>the loop is not a line"]
  R2 --> R`}
/>

ক্রমটা এলোমেলো নয়। প্রতিটা ধাপ পরেরটার ইনপুট, আর ক্রম ভাঙলে আপনি এমন সিদ্ধান্ত নেবেন যার ভিত্তি নেই।

### ধাপ ১: Requirements — কী, কার জন্য, আর কখন "যথেষ্ট"

তিন ধরনের প্রশ্ন করুন, এই ক্রমে:

**কে ব্যবহার করবে আর কেন?** "একটা notification সিস্টেম" — কার জন্য? end user-এর জন্য নাকি internal ops-এর জন্য? উত্তরটা latency budget থেকে শুরু করে retention পর্যন্ত সব বদলে দেয়।

**সাফল্য কীভাবে মাপা হবে?** এটা সবচেয়ে কম জিজ্ঞেস করা এবং সবচেয়ে দামি প্রশ্ন। "মেসেজ পৌঁছাতে হবে" — ৯৯% পৌঁছালে চলবে? ৯৯.৯৯%? এক ঘণ্টা দেরিতে পৌঁছালে চলবে? এই উত্তরগুলোই আপনার SLO, আর SLO ছাড়া আর্কিটেকচার একটা মতামত মাত্র।

**কী _নয়_?** স্কোপের বাইরের জিনিস স্পষ্ট করে লিখে ফেলুন। "এই সিস্টেম SMS পাঠাবে না", "এটা multi-region হবে না, phase 2-তে দেখা যাবে"। non-goal না লিখলে রিভিউতে অর্ধেক সময় এমন জিনিস নিয়ে তর্ক হবে যা আপনি বানাচ্ছেনই না।

<Callout type="tip">

Stakeholder যখন একটা সমাধান বলে (`"আমাদের একটা Kafka লাগবে"`), সেটা requirement নয়, সেটা একটা অনুমান। "Kafka দিয়ে কী সমস্যাটা সমাধান হবে বলে ভাবছেন?" — এই একটা প্রশ্ন প্রায় প্রতিবার আসল requirement বার করে আনে, আর প্রায়ই দেখা যায় সমস্যাটা Kafka দিয়ে সমাধান হয় না।

</Callout>

Requirement বার করে আনার পাঁচটা কার্যকর প্রশ্ন, যেকোনো ডোমেইনে:

1. আজকে এই কাজটা কীভাবে হয়? (সবসময় একটা বর্তমান পদ্ধতি আছে, এমনকি সেটা যদি একটা স্প্রেডশিট হয়)
2. এটা ভাঙলে কে সবচেয়ে আগে টের পাবে, আর কতক্ষণে?
3. সবচেয়ে খারাপ কী হতে পারে — ডেটা হারালে, দুইবার হলে, দেরিতে হলে? (এই তিনটে আলাদা প্রশ্ন)
4. আগামী দুই বছরে কোন সংখ্যাটা সবচেয়ে বেশি বাড়বে?
5. আপনি কি চান এটা কখনো ভুল উত্তর দিক, নাকি কখনো কখনো উত্তর না দিক? (চ্যাপ্টার ২৪-এর correctness-vs-availability প্রশ্নটা এখানেই ওঠে)

### ধাপ ২: Scale — বিশেষ্যের আগে সংখ্যা

আর্কিটেকচার নিয়ে কথা বলার আগে অন্তত এই সংখ্যাগুলো বার করুন — আনুমানিক হলেও চলবে, কিন্তু লেখা থাকতে হবে:

- Daily active user, peak concurrent user
- প্রতি ইউজারে প্রতি দিন কতগুলো core action → QPS (average আর peak, ratio সহ)
- Read:write অনুপাত
- প্রতি রেকর্ডের আকার × রেকর্ড সংখ্যা → স্টোরেজ, ১ বছর ও ৩ বছরে
- Latency budget — p50, p99, আর কোন কোন hop-এ ভাগ হবে

সংখ্যাগুলো কেন আগে? কারণ **সংখ্যাই সিদ্ধান্ত নেয়**। ১০০ QPS আর ১,০০,০০০ QPS দুটো সম্পূর্ণ আলাদা সিস্টেম। যে ডিজাইন দুটোতেই কাজ করে, সেটা সাধারণত দুটোর কোনোটাতেই ভালো নয় — ছোটটায় অতিরিক্ত জটিল, বড়টায় অপর্যাপ্ত।

```typescript
/**
 * Back-of-the-envelope capacity estimator.
 *
 * The point is not precision. The point is to turn "it should scale" into a
 * number you can argue about, and to surface which single input the whole
 * design is most sensitive to.
 */

export interface Workload {
	name: string;
	dailyActiveUsers: number;
	/** Core actions per active user per day, by action name. */
	actionsPerUserPerDay: Record<string, number>;
	/** Reads triggered per single write, by action name. */
	readAmplification: Record<string, number>;
	/** Stored bytes per write, by action name. */
	bytesPerWrite: Record<string, number>;
	/** Peak QPS divided by average QPS. 3 to 10 is typical for consumer apps. */
	peakToAverageRatio: number;
	/** How long records are kept, in days. */
	retentionDays: number;
	/** Replication factor plus index and overhead multiplier. */
	storageOverheadFactor: number;
}

export interface Estimate {
	writeQpsAverage: number;
	writeQpsPeak: number;
	readQpsAverage: number;
	readQpsPeak: number;
	dailyWriteBytes: number;
	steadyStateBytes: number;
	rawStorageBytes: number;
	/** Which single input, if wrong by 2x, moves peak read QPS the most. */
	mostSensitiveInput: string;
}

const SECONDS_PER_DAY = 86_400;

export function estimate(w: Workload): Estimate {
	let writesPerDay = 0;
	let readsPerDay = 0;
	let bytesPerDay = 0;

	for (const [action, perUser] of Object.entries(w.actionsPerUserPerDay)) {
		const writes = w.dailyActiveUsers * perUser;
		const reads = writes * (w.readAmplification[action] ?? 1);
		const bytes = writes * (w.bytesPerWrite[action] ?? 0);

		writesPerDay += writes;
		readsPerDay += reads;
		bytesPerDay += bytes;
	}

	const writeQpsAverage = writesPerDay / SECONDS_PER_DAY;
	const readQpsAverage = readsPerDay / SECONDS_PER_DAY;
	const steadyStateBytes = bytesPerDay * w.retentionDays;

	return {
		writeQpsAverage,
		writeQpsPeak: writeQpsAverage * w.peakToAverageRatio,
		readQpsAverage,
		readQpsPeak: readQpsAverage * w.peakToAverageRatio,
		dailyWriteBytes: bytesPerDay,
		steadyStateBytes,
		rawStorageBytes: steadyStateBytes * w.storageOverheadFactor,
		mostSensitiveInput: findMostSensitiveInput(w)
	};
}

/**
 * Sensitivity analysis: double each input in turn and see which one moves the
 * answer most. This tells you which assumption to go and verify with real data
 * before the design meeting, instead of arguing about all of them.
 */
function findMostSensitiveInput(w: Workload): string {
	const baseline = rawPeakReadQps(w);
	const candidates: Array<[string, Workload]> = [
		['dailyActiveUsers', { ...w, dailyActiveUsers: w.dailyActiveUsers * 2 }],
		['peakToAverageRatio', { ...w, peakToAverageRatio: w.peakToAverageRatio * 2 }],
		...Object.keys(w.actionsPerUserPerDay).map((action): [string, Workload] => [
			`actionsPerUserPerDay.${action}`,
			{
				...w,
				actionsPerUserPerDay: {
					...w.actionsPerUserPerDay,
					[action]: w.actionsPerUserPerDay[action] * 2
				}
			}
		]),
		...Object.keys(w.readAmplification).map((action): [string, Workload] => [
			`readAmplification.${action}`,
			{
				...w,
				readAmplification: {
					...w.readAmplification,
					[action]: (w.readAmplification[action] ?? 1) * 2
				}
			}
		])
	];

	let worstName = 'none';
	let worstDelta = 0;
	for (const [name, variant] of candidates) {
		const delta = rawPeakReadQps(variant) - baseline;
		if (delta > worstDelta) {
			worstDelta = delta;
			worstName = name;
		}
	}
	return worstName;
}

function rawPeakReadQps(w: Workload): number {
	let readsPerDay = 0;
	for (const [action, perUser] of Object.entries(w.actionsPerUserPerDay)) {
		readsPerDay += w.dailyActiveUsers * perUser * (w.readAmplification[action] ?? 1);
	}
	return (readsPerDay / SECONDS_PER_DAY) * w.peakToAverageRatio;
}

export function humanBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}

export function report(w: Workload): string {
	const e = estimate(w);
	return [
		`workload: ${w.name}`,
		`  write qps   avg ${e.writeQpsAverage.toFixed(0)}   peak ${e.writeQpsPeak.toFixed(0)}`,
		`  read  qps   avg ${e.readQpsAverage.toFixed(0)}   peak ${e.readQpsPeak.toFixed(0)}`,
		`  daily write ${humanBytes(e.dailyWriteBytes)}`,
		`  steady data ${humanBytes(e.steadyStateBytes)} over ${w.retentionDays} days`,
		`  provisioned ${humanBytes(e.rawStorageBytes)} at ${w.storageOverheadFactor}x overhead`,
		`  verify first: ${e.mostSensitiveInput}`
	].join('\n');
}

// --- Example: the notification service for the Baghdad marketplace ---

export const baghdadNotifications: Workload = {
	name: 'baghdad-marketplace-notifications',
	dailyActiveUsers: 4_000_000,
	actionsPerUserPerDay: { order_update: 1.4, chat_message: 22, price_alert: 0.6 },
	readAmplification: { order_update: 1, chat_message: 4, price_alert: 1 },
	bytesPerWrite: { order_update: 900, chat_message: 400, price_alert: 300 },
	peakToAverageRatio: 6,
	retentionDays: 90,
	storageOverheadFactor: 3.5
};
```

সবচেয়ে দরকারি অংশটা হলো **sensitivity analysis**। "কোন অনুমানটা ভুল হলে সবচেয়ে বেশি ক্ষতি" — এই প্রশ্নের উত্তর জানা মানে আপনি জানেন মিটিং-এর আগে কোন একটা সংখ্যা যাচাই করতে হবে। বাকি দশটা অনুমান নিয়ে তর্ক করার দরকার নেই।

### ধাপ ৩: Interface — চুক্তি আগে, বাস্তবায়ন পরে

Component আঁকার আগে API লিখুন। কারণ API-ই ঠিক করে দেয় কোন তথ্য কার কাছে থাকতে হবে, আর সেটাই আসল আর্কিটেকচার।

চ্যাপ্টার ১২-এর API contract-এর শিক্ষাগুলো এখানে সরাসরি প্রয়োগ হয়। একটা endpoint লেখার সময় নিজেকে চারটে প্রশ্ন করুন:

- এটা কি idempotent? না হলে ক্লায়েন্ট retry করলে কী হবে?
- এটা কি synchronous হতে হবে, নাকি একটা job id ফেরত দিয়ে async হতে পারে?
- ব্যর্থতার সময় ক্লায়েন্ট কী করবে — এই error message দিয়ে সে কি সিদ্ধান্ত নিতে পারবে?
- এটা কি ভবিষ্যতে ভাঙা ছাড়া বাড়ানো যাবে?

### ধাপ ৪: Data — মডেল আর access path

এখানে দুটো জিনিস, আর দ্বিতীয়টা বেশি গুরুত্বপূর্ণ।

**মডেল** — entity, relation, invariant। কোন invariant-টা ভাঙলে সিস্টেম অর্থহীন? (লেজারে সেটা ছিল "যোগফল শূন্য"।)

**Access path** — প্রতিটা query কীভাবে চলবে। এটাই সেই জায়গা যেখানে বেশিরভাগ ডিজাইন চুপচাপ মরে যায়। "ইউজারের সব order দেখাব" — কোন index দিয়ে? "গত ৩০ দিনের aggregate" — প্রতিবার হিসাব করব, নাকি precompute? চ্যাপ্টার ১৬-র CQRS আর চ্যাপ্টার ১৭-র search এখানেই ঢোকে।

লিখে ফেলুন, টেবিল আকারে:

| Query                    | কত ঘন ঘন        | কোন index / view             | কত ডেটা স্ক্যান | latency budget |
| ------------------------ | --------------- | ---------------------------- | --------------- | -------------- |
| ইউজারের সাম্প্রতিক order | প্রতি সেশনে ১   | `(user_id, created_at DESC)` | ২০ row          | ২০ms           |
| merchant-এর দৈনিক sales  | প্রতি ঘণ্টায় ১ | precomputed rollup           | ১ row           | ৫০ms           |
| order search by text     | বিরল            | search index                 | সীমিত           | ৩০০ms          |

যে query-র জন্য এই সারিটা লেখা যায় না, সেটা প্রোডাকশনে আপনার প্রথম incident।

### ধাপ ৫: Architecture — এখন, এতক্ষণ পরে, বাক্স আঁকুন

এতগুলো ধাপ পরে বাক্স আঁকা তুলনামূলক সহজ, কারণ বেশিরভাগ সিদ্ধান্ত ইতিমধ্যেই নেওয়া হয়ে গেছে। একটা ভালো diagram-এর নিয়ম:

- প্রতিটা তীরে লিখুন **কী যাচ্ছে** আর **synchronous না async**
- প্রতিটা storage box-এ লিখুন **কী ধরনের ডেটা** আর **কতটা**
- একটা diagram-এ ৭-৯টার বেশি বাক্স রাখবেন না; বেশি হলে দুটো স্তরে ভাগ করুন

### ধাপ ৬: Failure আর cost — ডিজাইনের সত্যিকারের পরীক্ষা

প্রতিটা component-এর জন্য জিজ্ঞেস করুন: **এটা মরে গেলে কী হয়?** উত্তরটা তিন ভাগের একটা হতে হবে:

- সিস্টেম কাজ করে যাবে, degraded mode-এ (কী degrade হবে লিখুন)
- সিস্টেম থেমে যাবে, কিন্তু ডেটা নিরাপদ (কতক্ষণে ফিরবে লিখুন)
- ডেটা হারাবে (এটা কি গ্রহণযোগ্য? না হলে ডিজাইন বদলান)

আর চ্যাপ্টার ২৩-এর ভাষায়: এই আর্কিটেকচারের মাসিক বিল কত, আর প্রতি request-এ কত? যদি না জানেন, তাহলে আপনি একটা গুরুত্বপূর্ণ constraint উপেক্ষা করছেন।

## ট্রেড-অফ কীভাবে আগে বার করে আনবেন

ডিজাইন রিভিউর সবচেয়ে বাজে পরিণতি হলো: দুই ঘণ্টা আলোচনার পর কেউ বলল "কিন্তু এটা তো multi-region-এ কাজ করবে না" — আর গোটা ডিজাইন ভেঙে পড়ল। এটা এড়ানোর উপায় হলো ট্রেড-অফগুলোকে **irreversibility অনুযায়ী সাজানো**।

<Mermaid
title="Sequencing Decisions by Reversibility"
code={`graph TD
  Q["Every design decision"] --> A{"How hard to undo<br/>in six months"}
  A -->|"Very hard"| H["Decide first<br/>data model, partition key,<br/>consistency model, API shape"]
  A -->|"Moderate"| M["Decide next<br/>storage engine, queue choice,<br/>deployment topology"]
  A -->|"Easy"| E["Defer<br/>library choice, cache TTL,<br/>instance size, log format"]
  H --> R["Bring to review<br/>with alternatives"]
  M --> R
  E --> D["Do not spend review time"]`}
/>

কোন সিদ্ধান্তগুলো ফেরানো কঠিন? অভিজ্ঞতা বলে এই চারটে:

**Partition key / sharding key।** একবার ডেটা ছড়িয়ে গেলে key বদলানো মানে পুরো migration। চ্যাপ্টার ১০-এ দেখেছেন কেন।

**Consistency model।** eventual দিয়ে শুরু করে পরে strong-এ যাওয়া মানে প্রায় সব read path আবার লেখা। উল্টোটা তুলনামূলক সহজ।

**Public API-র আকার।** একবার ক্লায়েন্ট বেরিয়ে গেলে, বিশেষত মোবাইল অ্যাপে, ভাঙা যায় না — পুরোনো ভার্সন বছরের পর বছর বাঁচে।

**ডেটার মালিকানার সীমানা।** কোন সার্ভিস কোন ডেটার মালিক — এটা বদলানো মানে সার্ভিস ভাঙা বা জোড়া লাগানো।

আর কোনগুলো নিয়ে রিভিউতে সময় নষ্ট করবেন না: লাইব্রেরি বাছাই, cache TTL-এর মান, instance size, log format। এগুলো এক সপ্তাহে বদলানো যায়।

<Callout type="warning">

"আমরা পরে decide করব" একটা বৈধ সিদ্ধান্ত — কিন্তু শুধু তখনই যখন আপনি লিখে রাখেন _কখন_ এবং _কোন তথ্য পেলে_ decide করবেন। "পরে দেখা যাবে" আর "যখন DAU ৫ লাখ ছাড়াবে তখন আবার মাপব" — দুটো সম্পূর্ণ আলাদা জিনিস। দ্বিতীয়টা ইঞ্জিনিয়ারিং।

</Callout>

## Design doc: যেটা আসলে পড়া হয়

বেশিরভাগ design doc পড়া হয় না কারণ সেগুলো লেখকের চিন্তার ক্রমে লেখা, পাঠকের প্রয়োজনের ক্রমে নয়। পাঠক তিন রকমের, আর তিনজনই আলাদা জিনিস চান:

| পাঠক                       | কী চান                                           | কতটা পড়বেন                  |
| -------------------------- | ------------------------------------------------ | ---------------------------- |
| ম্যানেজার / স্টেকহোল্ডার   | কী সমস্যা, কত সময়, কী ঝুঁকি                     | প্রথম পাতা                   |
| রিভিউয়ার / সিনিয়র পিয়ার | কোন ট্রেড-অফ, কী বিবেচনা করা হয়েছে, কোথায় ফাঁক | ট্রেড-অফ ও open question অংশ |
| যে বানাবে                  | interface, data model, ধাপ                       | পুরোটা                       |

তাই কাঠামোটা এরকম হওয়া উচিত:

```
1. Context and problem            (half a page, no jargon)
2. Goals / Non-goals              (bulleted, brutally explicit)
3. Requirements and scale numbers (a table, not prose)
4. Proposed design                (diagram + the flow in words)
5. Alternatives considered        (at least two, with why not)
6. Trade-offs accepted            (what we made worse, on purpose)
7. Failure modes and blast radius
8. Cost estimate
9. Migration / rollout plan
10. Open questions                (the section reviewers read first)
11. Appendix: interfaces, schemas
```

তিনটে অংশ যেগুলো প্রায় সবাই বাদ দেয় এবং যেগুলোই আসলে doc-টাকে দামি করে:

**Alternatives considered।** কমপক্ষে দুটো, আর প্রতিটার জন্য একটা সৎ কারণ কেন নেওয়া হয়নি। "খারাপ" যথেষ্ট নয়; "আমাদের team-এর কারও এটা অপারেট করার অভিজ্ঞতা নেই আর on-call ভার নেওয়ার মতো লোক নেই" — এটা একটা সৎ কারণ।

**Trade-offs accepted।** কী কী ইচ্ছে করে খারাপ করা হয়েছে। চ্যাপ্টার ২৪ ও ২৫-এর শেষে যে টেবিলগুলো ছিল, ঠিক সেই আকারে।

**Open questions।** নিজের অনিশ্চয়তা নিজে দেখান। এটা দুর্বলতা নয় — এটা রিভিউয়ারদের সবচেয়ে দামি জায়গায় নিয়ে যাওয়ার সবচেয়ে কার্যকর উপায়। যে doc-এ কোনো open question নেই, রিভিউয়াররা ধরে নেন লেখক যথেষ্ট গভীরে যাননি।

<Callout type="tip">

Doc পাঠানোর সময় একটা লাইন যোগ করুন: "আমি বিশেষভাবে যে তিনটে জায়গায় মতামত চাই: (১)... (২)... (৩)..."। রিভিউয়ারের মনোযোগ একটা সীমিত সম্পদ; সেটা কোথায় খরচ হবে তা আপনি ঠিক করে দিতে পারেন।

</Callout>

## রিভিউ চালানো আর রিভিউ নেওয়া

### রিভিউ চালানো (আপনি লেখক)

**Doc আগে পাঠান, অন্তত ৪৮ ঘণ্টা।** মিটিং-এ doc পড়ানো মানে মিটিং নষ্ট।

**মিটিং শুরু করুন প্রেক্ষাপট দিয়ে, ডিজাইন দিয়ে নয়।** পাঁচ মিনিট: সমস্যা কী, constraint কী, non-goal কী। এই পাঁচ মিনিট বাদ দিলে বাকি ৫৫ মিনিট ভুল জায়গায় খরচ হবে।

**তর্ক করবেন না, তথ্য খুঁজুন।** কেউ আপত্তি করলে প্রথম কাজ হলো বোঝা: "আপনি কোন পরিস্থিতিতে এটা ভাঙবে বলে ভাবছেন?" প্রায়ই দেখা যায় আপত্তিটা একটা এমন requirement-এর কথা বলছে যেটা আপনি জানতেন না।

**প্রতিটা আপত্তির পরিণতি লিখে রাখুন — গ্রহণ, প্রত্যাখ্যান, বা পরে দেখা হবে।** কোনো আপত্তি যেন উত্তরহীন না থাকে। উত্তরহীন আপত্তি ছয় মাস পরে "আমি তো বলেছিলাম" হয়ে ফিরে আসে।

**"না" বলা শিখুন, কারণসহ।** সব পরামর্শ গ্রহণ করা মানে ডিজাইনটা আর আপনার থাকে না, আর কমিটির ডিজাইন সাধারণত খারাপ ডিজাইন।

### রিভিউ দেওয়া (আপনি রিভিউয়ার)

**প্রথমে বুঝুন, তারপর মন্তব্য করুন।** প্রথম মন্তব্যটা যদি প্রশ্ন না হয়ে সমাধান হয়, আপনি সম্ভবত ভুল সমস্যার সমাধান দিচ্ছেন।

**সবচেয়ে দামি প্রশ্নগুলো হলো এইরকম:**

- "এই সংখ্যাটা কোথা থেকে এলো?"
- "এটা যখন ৫ গুণ বাড়বে, প্রথমে কোনটা ভাঙবে?"
- "এই component-টা মরে গেলে ইউজার কী দেখবে?"
- "এটা যদি ভুল ডিজাইন হয়, ছয় মাস পরে কতটা খরচ পড়বে বদলাতে?"
- "আপনি কী কী বিবেচনা করে বাদ দিয়েছেন?"

**Style নিয়ে মন্তব্য করবেন না।** design review-তে naming convention বা লাইব্রেরি পছন্দ নিয়ে কথা বলা মানে সময় চুরি করা।

**যা ভালো সেটাও বলুন, নির্দিষ্ট করে।** "suspense account-এর বয়স মনিটর করার ধারণাটা চমৎকার" — এটা লেখককে জানায় কোন অংশটা রাখতে হবে যখন সে বাকিটা বদলাবে।

<Callout type="warning">

সবচেয়ে বিপজ্জনক রিভিউ হলো নীরব রিভিউ — যেখানে সবাই মাথা নাড়ে আর কেউ প্রশ্ন করে না। এর মানে সাধারণত এই নয় যে ডিজাইন নিখুঁত; এর মানে হয় কেউ doc পড়েনি, নয়তো লোকে ভাবছে প্রশ্ন করলে বোকা লাগবে। লেখক হিসেবে এই নীরবতা ভাঙার দায়িত্ব আপনার: সরাসরি জিজ্ঞেস করুন "এই তিনটে জায়গায় আমি সবচেয়ে কম নিশ্চিত — কেউ কি এখানে ঝুঁকি দেখছেন?"

</Callout>

## একটা রিভিউ চেকলিস্ট, কোড হিসেবে

চেকলিস্ট মুখস্থ রাখার জিনিস নয়। নিচের কোডটা একটা design doc-কে কাঠামোগতভাবে যাচাই করে — কোন অংশ নেই, কোন ঝুঁকি ধরা হয়নি, আর কোন প্রশ্নগুলো এখনো অনুত্তর।

```typescript
/**
 * A structured design review. The value is not the score; the value is that
 * every dimension gets asked about out loud, including the ones nobody enjoys
 * discussing.
 */

export type Verdict = 'addressed' | 'partial' | 'missing' | 'not_applicable';

export interface Dimension {
	id: string;
	area: 'requirements' | 'data' | 'scale' | 'failure' | 'security' | 'cost' | 'operations';
	question: string;
	/** Blocking dimensions must not be 'missing' for the design to proceed. */
	blocking: boolean;
}

export interface Finding {
	dimensionId: string;
	verdict: Verdict;
	note: string;
	/** Who owns the follow-up, if any. */
	owner?: string;
}

export const DIMENSIONS: Dimension[] = [
	{
		id: 'req.non_goals',
		area: 'requirements',
		question: 'Are non-goals written down explicitly?',
		blocking: true
	},
	{
		id: 'req.success_metric',
		area: 'requirements',
		question: 'Is there a measurable definition of success (an SLO, not an adjective)?',
		blocking: true
	},
	{
		id: 'scale.numbers',
		area: 'scale',
		question: 'Are peak QPS, storage growth and read:write ratio stated with their sources?',
		blocking: true
	},
	{
		id: 'scale.sensitivity',
		area: 'scale',
		question: 'Which single assumption, if wrong by 2x, breaks the design?',
		blocking: false
	},
	{
		id: 'data.partition_key',
		area: 'data',
		question: 'Is the partition key chosen, and is it hard to change later?',
		blocking: true
	},
	{
		id: 'data.access_paths',
		area: 'data',
		question: 'Does every query have a named index or precomputed view?',
		blocking: true
	},
	{
		id: 'data.consistency',
		area: 'data',
		question: 'Is the consistency model stated per operation, not per system?',
		blocking: true
	},
	{
		id: 'failure.component_loss',
		area: 'failure',
		question: 'For each component: what does the user see when it is gone?',
		blocking: true
	},
	{
		id: 'failure.retry_safety',
		area: 'failure',
		question: 'Is every externally visible write idempotent?',
		blocking: true
	},
	{
		id: 'failure.backpressure',
		area: 'failure',
		question: 'What happens when the queue is full and the consumer is slow?',
		blocking: false
	},
	{
		id: 'security.tenancy',
		area: 'security',
		question: 'Where is the tenant boundary enforced, and what is the blast radius of a bug?',
		blocking: true
	},
	{
		id: 'security.audit',
		area: 'security',
		question: 'Can we reconstruct who did what, six months from now?',
		blocking: false
	},
	{
		id: 'cost.unit_economics',
		area: 'cost',
		question: 'What does one request and one tenant cost per month?',
		blocking: false
	},
	{
		id: 'ops.rollout',
		area: 'operations',
		question: 'Is there a rollout plan with a reversible first step?',
		blocking: true
	},
	{
		id: 'ops.observability',
		area: 'operations',
		question: 'Which three signals would tell us this is broken, before a user does?',
		blocking: true
	},
	{
		id: 'ops.migration',
		area: 'operations',
		question: 'How does existing data and traffic move onto this design?',
		blocking: false
	}
];

export interface ReviewResult {
	proceed: boolean;
	blockers: Array<{ dimension: Dimension; finding: Finding | null }>;
	followUps: Finding[];
	coverageByArea: Record<string, { asked: number; total: number }>;
	summary: string;
}

export function runReview(findings: Finding[], dimensions = DIMENSIONS): ReviewResult {
	const byId = new Map(findings.map((f) => [f.dimensionId, f]));

	const blockers: ReviewResult['blockers'] = [];
	const followUps: Finding[] = [];
	const coverageByArea: Record<string, { asked: number; total: number }> = {};

	for (const dim of dimensions) {
		const bucket = (coverageByArea[dim.area] ??= { asked: 0, total: 0 });
		bucket.total++;

		const finding = byId.get(dim.id) ?? null;
		if (finding && finding.verdict !== 'missing') bucket.asked++;

		const unresolved = !finding || finding.verdict === 'missing';
		if (dim.blocking && unresolved) {
			blockers.push({ dimension: dim, finding });
		}
		if (finding && (finding.verdict === 'partial' || finding.verdict === 'missing')) {
			followUps.push(finding);
		}
	}

	const proceed = blockers.length === 0;
	const summary = proceed
		? `no blockers; ${followUps.length} follow-up item(s) to track`
		: `${blockers.length} blocking dimension(s) unanswered: ` +
			blockers.map((b) => b.dimension.id).join(', ');

	return { proceed, blockers, followUps, coverageByArea, summary };
}

export function formatReview(result: ReviewResult): string {
	const lines: string[] = [];
	lines.push(result.proceed ? 'VERDICT: proceed' : 'VERDICT: not ready');
	lines.push(result.summary);
	lines.push('');
	lines.push('coverage:');
	for (const [area, c] of Object.entries(result.coverageByArea)) {
		lines.push(`  ${area.padEnd(14)} ${c.asked}/${c.total}`);
	}
	if (result.blockers.length > 0) {
		lines.push('');
		lines.push('blockers:');
		for (const b of result.blockers) {
			lines.push(`  [${b.dimension.id}] ${b.dimension.question}`);
		}
	}
	if (result.followUps.length > 0) {
		lines.push('');
		lines.push('follow-ups:');
		for (const f of result.followUps) {
			lines.push(`  [${f.dimensionId}] ${f.note}${f.owner ? ` (owner: ${f.owner})` : ''}`);
		}
	}
	return lines.join('\n');
}

// --- Example: reviewing the Baghdad marketplace notification design ---

export const exampleFindings: Finding[] = [
	{
		dimensionId: 'req.non_goals',
		verdict: 'addressed',
		note: 'SMS and multi-region are explicitly out of scope for phase 1'
	},
	{
		dimensionId: 'req.success_metric',
		verdict: 'addressed',
		note: '99.9 percent of order updates delivered within 5 seconds'
	},
	{
		dimensionId: 'scale.numbers',
		verdict: 'partial',
		note: 'peak QPS taken from a single festival day, no seasonal baseline',
		owner: 'al-biruni'
	},
	{
		dimensionId: 'data.partition_key',
		verdict: 'addressed',
		note: 'partition by recipient user id; fan-out writes are batched'
	},
	{
		dimensionId: 'data.access_paths',
		verdict: 'addressed',
		note: 'every listed query maps to a named index'
	},
	{
		dimensionId: 'data.consistency',
		verdict: 'addressed',
		note: 'read-your-writes for the recipient, eventual for counters'
	},
	{
		dimensionId: 'failure.component_loss',
		verdict: 'partial',
		note: 'push provider outage path is undefined',
		owner: 'fatima-al-fihri'
	},
	{
		dimensionId: 'failure.retry_safety',
		verdict: 'addressed',
		note: 'delivery keyed by notification id, dedupe at the sink'
	},
	{
		dimensionId: 'security.tenancy',
		verdict: 'addressed',
		note: 'merchant scoping enforced in the query layer, verified by tests'
	},
	{ dimensionId: 'ops.rollout', verdict: 'missing', note: 'no rollout plan yet' },
	{
		dimensionId: 'ops.observability',
		verdict: 'addressed',
		note: 'delivery lag p99, queue depth, provider error rate'
	}
];
```

উপরের উদাহরণে রিভিউর রায় হবে "not ready" — `ops.rollout` অনুত্তর, আর সেটা blocking। এটাই চেকলিস্টের কাজ: একটা ভালো ডিজাইনকে একটা অসম্পূর্ণ পরিকল্পনার সাথে গুলিয়ে ফেলতে না দেওয়া।

<Callout type="info">

চেকলিস্টটাকে দল হিসেবে নিজের করে নিন। প্রতিটা incident-এর পরে একটা প্রশ্ন যোগ করুন: "এই incident-টা যদি design review-তে ধরা পড়ত, কোন প্রশ্নটা সেটা ধরত?" কয়েক বছরে চেকলিস্টটা আপনার দলের সম্মিলিত স্মৃতি হয়ে ওঠে — ঠিক যেমন কর্ডোবার গিল্ডের প্রবীণের চল্লিশ বছরের স্মৃতি।

</Callout>

## একই পদ্ধতি, system design ইন্টারভিউতে

ইন্টারভিউ একটা সংকুচিত design review — ৪৫ মিনিটে, একজন রিভিউয়ার সহ, আর রিভিউয়ার একই সাথে stakeholder। পদ্ধতি একই, শুধু সময়ের বণ্টন আলাদা।

| ধাপ                      | সময়     | ইন্টারভিউতে যা আলাদা                                                 |
| ------------------------ | -------- | -------------------------------------------------------------------- |
| Requirements ও non-goals | ৫ মিনিট  | ইন্টারভিউয়ারই stakeholder — তাকে প্রশ্ন করুন, অনুমান করবেন না       |
| Scale numbers            | ৫ মিনিট  | জোরে হিসাব করুন; সংখ্যাটার চেয়ে পদ্ধতিটা দেখা হচ্ছে                 |
| API ও data model         | ১০ মিনিট | দুটো-তিনটে endpoint যথেষ্ট, সবগুলো নয়                               |
| Architecture             | ১০ মিনিট | তীরের উপর লিখুন কী যাচ্ছে, sync না async                             |
| Deep dive                | ১০ মিনিট | ইন্টারভিউয়ারকে বেছে নিতে দিন, বা নিজের সবচেয়ে ঝুঁকিপূর্ণ অংশ বাছুন |
| Failure ও trade-off      | ৫ মিনিট  | এই অংশটাই সবচেয়ে বেশি পার্থক্য গড়ে দেয়, আর সবচেয়ে বেশি বাদ পড়ে  |

পাঁচটা জিনিস যা ইন্টারভিউতে সবচেয়ে বেশি নম্বর কাটে:

**সরাসরি সমাধানে ঝাঁপিয়ে পড়া।** "একটা URL shortener? ঠিক আছে, Redis আর একটা hash function..." — requirement জিজ্ঞেস না করলে বাকি ৪০ মিনিট আপনি একটা কল্পিত সমস্যার সমাধান করছেন।

**সংখ্যা ছাড়া স্কেলের দাবি।** "এটা scale করবে" — কত? কোন component প্রথমে ভাঙবে?

**সব কিছু ভালো বলা।** যে প্রার্থী নিজের ডিজাইনের দুর্বলতা নিজে বলতে পারে না, সে হয় বোঝেনি, নয় লুকোচ্ছে। "এই ডিজাইনে hot partition-এর ঝুঁকি আছে, কারণ..." — এই একটা বাক্য অনেকগুলো buzzword-এর চেয়ে বেশি মূল্যবান।

**অপ্রয়োজনীয় জটিলতা।** ১০০ QPS-এর সমস্যায় Kafka, Kubernetes আর তিনটে মাইক্রোসার্ভিস আনা মানে আপনি ট্রেড-অফ বোঝেন না। বরং বলুন: "এই স্কেলে একটা Postgres যথেষ্ট; আমি বরং X হলে কী বদলাবে সেটা বলি।"

**নীরবে ভাবা।** ইন্টারভিউয়ার আপনার চিন্তা দেখতে পান না। জোরে ভাবুন — এমনকি "আমি এখন দুটো বিকল্পের মধ্যে দোদুল্যমান, কারণ..." বলাটাও একটা সংকেত যে আপনি ট্রেড-অফ দেখছেন।

<Callout type="tip">

ইন্টারভিউতে সবচেয়ে শক্তিশালী বাক্যগুলো হলো: "এই সিদ্ধান্তটা আমি নিচ্ছি কারণ...", "এর বিনিময়ে আমি হারাচ্ছি...", এবং "যদি [এই শর্তটা] বদলে যেত, আমি বদলে [এই ডিজাইনটা] করতাম"। তিনটেই ট্রেড-অফের ভাষা — আর system design ইন্টারভিউতে ঠিক ওটাই মাপা হয়।

</Callout>

## পুরো ট্র্যাকটা কীভাবে জোড়া লাগে

শেষ করার আগে, ২৭টা চ্যাপ্টার এক জায়গায়। এই তালিকাটা আসলে একটা checklist-ও — যেকোনো নতুন ডিজাইনে এই প্রশ্নগুলো ক্রমে করে গেলে কোনো বড় জিনিস বাদ পড়বে না।

| যে প্রশ্নটা আসে                                   | কোন চ্যাপ্টারে উত্তর            |
| ------------------------------------------------- | ------------------------------- |
| একটা রিকোয়েস্ট আসলে কী কী পেরিয়ে যায়           | ০০–০৭, fundamentals             |
| পড়ার চাপ কমাব কীভাবে                             | ০৮, caching                     |
| ট্রাফিক ভাগ করব কীভাবে                            | ০৯, load balancing              |
| ডেটা এক মেশিনে ধরছে না                            | ১০, database scaling ও sharding |
| ভারী কাজ রিকোয়েস্টের বাইরে নেব কীভাবে            | ১১, async work ও queue          |
| ক্লায়েন্টের সাথে চুক্তি কেমন হবে                 | ১২, API contract                |
| কতটা সঠিক হতে হবে                                 | ১৩, consistency                 |
| একাধিক নোড কীভাবে একমত হবে                        | ১৫, coordination ও consensus    |
| ঘটনা ছড়াব কীভাবে, read আর write আলাদা করব কীভাবে | ১৬, event-driven ও CQRS         |
| খুঁজব কীভাবে                                      | ১৭, search                      |
| ভাঙছে কিনা বুঝব কীভাবে                            | ১৮, observability ও SLO         |
| ভাঙলে কী হবে                                      | ১৯, failure design              |
| একাধিক অঞ্চলে চালাব কীভাবে                        | ২১, multi-region                |
| অনেক গ্রাহক এক সিস্টেমে কীভাবে                    | ২২, security ও multi-tenancy    |
| এর দাম কত                                         | ২৩, cost engineering            |
| ভুল হওয়া চলবে না এমন সিস্টেম                     | ২৪, payment ledger              |
| একসাথে অনেকে একই জিনিস বদলালে                     | ২৫, collaborative editor        |
| রিয়েল-টাইম ছড়ানো আর presence                    | ২৬, chat ও presence             |
| এই সব একসাথে কীভাবে চালাব                         | ২৭, এই চ্যাপ্টার                |

আর একটা কথা, যেটা ২৭টা চ্যাপ্টারের সবচেয়ে সংক্ষিপ্ত সারাংশ: **সিস্টেম ডিজাইন মানে সঠিক উত্তর খুঁজে বার করা নয়। সিস্টেম ডিজাইন মানে কোন প্রশ্নগুলো আগে করতে হবে সেটা জানা, আর প্রতিটা উত্তরের দাম জেনেবুঝে দেওয়া।** যন্ত্রপাতি বদলাবে — আজকের Kafka কালকে অন্য কিছু হবে। প্রশ্নগুলো বদলাবে না।

<div class="takeaways">

### মূল শেখা

- সাদা পাতায় প্রথম কাজ প্রশ্ন করা, আঁকা নয় — requirement, সাফল্যের মাপকাঠি আর non-goal আগে; সবচেয়ে সাধারণ ব্যর্থতা হলো ভুল সমস্যার নিখুঁত সমাধান
- বিশেষ্যের আগে সংখ্যা: peak QPS, read:write, storage growth আর latency budget ছাড়া আর্কিটেকচার একটা মতামত মাত্র
- ট্রেড-অফ সাজান irreversibility অনুযায়ী — partition key, consistency model, public API আর ডেটার মালিকানা আগে; লাইব্রেরি ও TTL নিয়ে রিভিউতে সময় নষ্ট করবেন না
- Design doc-এর সবচেয়ে দামি তিনটে অংশ হলো alternatives considered, trade-offs accepted আর open questions — আর এই তিনটেই সবচেয়ে বেশি বাদ পড়ে
- নিজের অনিশ্চয়তা নিজে দেখানো দুর্বলতা নয়; এটাই রিভিউয়ারদের সবচেয়ে দামি জায়গায় নিয়ে যাওয়ার একমাত্র নির্ভরযোগ্য উপায়
- রিভিউয়ার হিসেবে প্রথম মন্তব্য একটা প্রশ্ন হোক, সমাধান নয় — আর নীরব রিভিউকে সম্মতি ভাববেন না
- ইন্টারভিউ একই পদ্ধতির সংকুচিত রূপ; সেখানে আপনার উত্তর নয়, আপনার ট্রেড-অফের ভাষাটাই মাপা হয়

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **Google** design doc আর formal design review-কে প্রকৌশল সংস্কৃতির কেন্দ্রে রাখে; "alternatives considered" অংশটা সেখানে ঐচ্ছিক নয়
- **Amazon**-এর six-pager আর working-backwards পদ্ধতি ঠিক এই ক্রমেই চলে — গ্রাহকের সমস্যা আর সাফল্যের সংজ্ঞা আগে, প্রযুক্তি পরে
- **Architecture Decision Record (ADR)** প্র্যাকটিস — সিদ্ধান্ত, প্রেক্ষাপট আর প্রত্যাখ্যাত বিকল্প লিখে রাখা — যাতে একই তর্ক প্রতি বছর নতুন করে না হয়
- **RFC প্রক্রিয়া** (Rust, Python, Kubernetes) দেখায় কীভাবে open question আর সৎ trade-off তালিকা একটা প্রস্তাবকে সমালোচনার জন্য উন্মুক্ত করে, প্রতিরক্ষামূলক নয়
- বড় প্রতিষ্ঠানের **production readiness review** এই চ্যাপ্টারের চেকলিস্টটার বাস্তব রূপ — rollout plan, observability signal আর failure mode ছাড়া কোনো সিস্টেম প্রোডাকশনে যায় না

</div>
