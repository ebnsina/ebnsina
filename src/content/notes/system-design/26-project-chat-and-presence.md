---
title: 'প্রজেক্ট: চ্যাট ও প্রেজেন্স সিস্টেম'
subtitle: 'WebSocket gateway, per-conversation sequence number, fan-out, read cursor, presence heartbeat আর reconnection protocol মিলিয়ে ৫০ কোটি মেসেজ/দিন সামলানো একটা চ্যাট সিস্টেম শূন্য থেকে ডিজাইন করা।'
chapter: 26
level: 'mastery'
readingTime: '৩৫ মিনিট'
topics: ['chat system', 'presence', 'fan-out', 'websockets', 'read receipts', 'push notifications']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import CodeTabs from '$lib/components/content/CodeTabs.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

বাগদাদের একটা বড় ডাকঘর — প্রতিটা মহল্লার জন্য আলাদা রানার, প্রতিটা চিঠির গায়ে ক্রমিক নম্বর, হাতে-হাতে দেওয়ার সময় একটা রসিদ আর খাম খোলার পর আরেকটা রসিদ। চ্যাট সিস্টেম আসলে এই ডাকঘরটাই, শুধু চিঠির বদলে প্যাকেট আর রানারের বদলে WebSocket।

</Callout>

## গল্পে বুঝি

বাগদাদের কেন্দ্রে একটা বিশাল ডাকঘর — শহরের সব চিঠি এখান দিয়েই যায়। ভেতরে সারি সারি ডেস্ক, আর প্রতিটা ডেস্কে একজন করে রানার বসা। শহরটা মহল্লায় ভাগ করা: কারখ মহল্লার সব চিঠি সামলায় রানার নম্বর তিন, রুসাফার সব চিঠি সামলায় রানার নম্বর সাত। ইবনে সিনা যদি কারখে থাকেন, তাহলে তাঁর জন্য আসা প্রতিটা চিঠি রানার তিনের ডেস্কেই যাবে — অন্য কোথাও নয়। কারণ রানার তিনই একমাত্র লোক যে এই মুহূর্তে জানে ইবনে সিনা ঠিক কোন গলির কোন দরজায় আছেন। ডাকঘরের সামনের ঘরে তাই একটা বড় খাতা ঝোলানো থাকে — কে কোন রানারের অধীনে, সেই তালিকা। রানার নিজে অদল-বদল হতে পারে, অসুস্থ হয়ে বাড়ি চলে যেতে পারে, তার জায়গায় নতুন কেউ বসতে পারে; কিন্তু সামনের ঘরের ওই খাতাটা কখনো হারানো চলবে না। খাতা হারালে চিঠি কোথায় যাবে কেউ জানে না।

চিঠিগুলোর একটা বিশেষ নিয়ম আছে। আল-খোয়ারিজমি যখন ইবনে সিনাকে চিঠি লেখেন, ডাকঘরের কেরানি খামের কোণায় একটা নম্বর বসিয়ে দেয় — এই দুজনের মধ্যকার সপ্তম চিঠি, তাই ৭। পরেরটা ৮, তার পরেরটা ৯। ইবনে সিনার হাতে যদি ৭ আর ৯ পৌঁছায় কিন্তু ৮ না পৌঁছায়, তিনি এক নজরেই বুঝে যান মাঝখানে একটা চিঠি হারিয়েছে, আর ডাকঘরে গিয়ে বলতে পারেন — "আমার আট নম্বরটা দিন।" খেয়াল করুন, চিঠির গায়ে লেখা সময় দিয়ে এই কাজটা হতো না; দুই কেরানির দেয়ালঘড়ি কখনোই হুবহু এক থাকে না, একজনের ঘড়ি দুই মিনিট এগিয়ে থাকলে পরে লেখা চিঠি আগে লেখা হিসেবে সাজানো হয়ে যেত। ক্রমিক নম্বরের কোনো ঘড়ি লাগে না, শুধু একটা খাতা লাগে যেখানে গোনা হয়।

হাতবদলের হিসাবটাও দুই ধাপের। রানার যখন ইবনে সিনার দরজায় চিঠি পৌঁছে দেয়, ইবনে সিনার চাকর একটা ছোট রসিদে সই করে দেয় — চিঠি বাড়িতে ঢুকেছে। কিন্তু ইবনে সিনা তখন হয়তো ঘুমাচ্ছেন, খামটা টেবিলে পড়ে আছে। পরে যখন তিনি খামটা ছিঁড়ে পড়েন, দ্বিতীয় একটা রসিদ ডাকঘরে ফেরত যায় — চিঠি পড়া হয়েছে। আল-খোয়ারিজমি এই দুটো রসিদকে আলাদাভাবে দেখেন, কারণ "পৌঁছেছে" আর "পড়েছে" এক জিনিস নয়। আর ডাকঘর এই রসিদ দুটো একবারের বেশি এলে ঘাবড়ায় না — রানার যদি রাস্তায় দ্বিধায় পড়ে একই রসিদ দুবার জমা দেয়, খাতায় শুধু একবারই লেখা থাকে। ইবনে সিনা কতটা পড়েছেন সেটা ডাকঘর প্রতিটা চিঠির পাশে টিক দিয়ে রাখে না; বরং শুধু লিখে রাখে — "ইবনে সিনা ১২ নম্বর পর্যন্ত পড়েছেন।" এক লাইনেই সব চিঠির হিসাব হয়ে যায়।

ডাকঘরের প্রবেশমুখে আরেকটা বোর্ড আছে, যেখানে ঝুলছে কোন বণিক এই মুহূর্তে বাজারে আছেন তার তালিকা। এই বোর্ড কেউ ঘণ্টায় ঘণ্টায় জরিপ করে ভরে না — বরং প্রতিটা বণিকের একটা ছেলে প্রতি আধা ঘণ্টায় এসে বোর্ডের কেরানিকে বলে যায়, "আমার মালিক এখনো বাজারেই আছেন।" কেরানি নামের পাশে সময় লিখে রাখে, আর কারও নামের পাশের সময় যদি এক ঘণ্টার পুরনো হয়ে যায়, নামটা বোর্ড থেকে মুছে দেয় — ধরে নেয় লোকটা বাড়ি চলে গেছে। বোর্ডটা কখনোই নিখুঁত নয়; আল-বিরুনি হয়তো দশ মিনিট আগে বেরিয়ে গেছেন কিন্তু নাম এখনো ঝুলছে। কেউ এতে অভিযোগ করে না, কারণ নিখুঁত করতে গেলে প্রতিটা বণিকের পেছনে একজন করে গোয়েন্দা লাগাতে হতো। আর ডাকঘরের পেছনের ঘরে থরে থরে বাঁধাই করা পুরনো চিঠির খণ্ড — ফাতিমা আল-ফিহরি চাইলে গত মাসের চিঠিগুলো এক এক পাতা করে পেছনে উল্টে দেখতে পারেন, বিশটা বিশটা করে; পুরো তিন বছরের খণ্ড একসাথে টেবিলে নামানোর দরকার পড়ে না। আর যে বণিক বাজার ছেড়ে বাড়ি চলে গেছেন, তাঁর জরুরি চিঠি এলে ডাকঘর একটা ছেলেকে পাঠায় তাঁর বাড়ির দরজায় কড়া নাড়তে — কিন্তু শুধু তখনই, যখন লোকটা সত্যিই বাজারে নেই।

মিলিয়ে নিই। মহল্লা অনুযায়ী রানার ভাগ করাই হলো **connection routing**, আর সামনের ঘরের সেই খাতা যেখানে লেখা কে কোন রানারের অধীনে, সেটাই **connection registry** — রানার (gateway node) বদলে গেলেও registry-টা টিকে থাকতে হয়। খামের কোণার ক্রমিক নম্বর হলো **per-conversation sequence number**, আর "আমার আট নম্বরটা কই" হলো **client-side gap detection**; দেয়ালঘড়ি মিলছে না বলে সময় দিয়ে সাজানো বাদ দেওয়াই **wall-clock ordering**-এর সমস্যা। দরজায় সই করা প্রথম রসিদ হলো **delivery receipt**, খাম খোলার পরের দ্বিতীয় রসিদ হলো **read receipt**, একই রসিদ দুবার এলেও একবার লেখা হলো **idempotency**, আর "১২ নম্বর পর্যন্ত পড়েছেন" এই এক লাইনটাই হলো **read cursor**। প্রবেশমুখের বোর্ড আর প্রতি আধা ঘণ্টায় ছেলের এসে বলে যাওয়া হলো **presence heartbeat + TTL**, বোর্ডের সামান্য ভুল মেনে নেওয়াই **eventual accuracy**। পেছনের ঘরের বাঁধাই খণ্ড হলো **history pagination**, আর বাড়ির দরজায় কড়া নাড়ার ছেলেটা হলো **push notification**। WhatsApp, Slack বা Signal — সবাই ঠিক এই ডাকঘরটাই চালায়, শুধু ইট-কাঠের বদলে সার্ভারে।

## চ্যাট সিস্টেম কেন আলাদা রকম কঠিন

আগের চ্যাপ্টারগুলোতে যেসব সিস্টেম ডিজাইন করেছেন — পেমেন্ট ledger, search index, event-driven pipeline — প্রায় সবই request/response। ক্লায়েন্ট চাইলে সার্ভার দেয়, না চাইলে সার্ভার চুপ। চ্যাট সিস্টেমে ব্যাপারটা উল্টো: সার্ভারকে নিজে থেকে ক্লায়েন্টের কাছে পৌঁছাতে হয়, আর সেটাও এমন একটা ক্লায়েন্টের কাছে যে মোবাইল নেটওয়ার্কে আছে, লিফটে ঢুকলে হারিয়ে যায়, ব্যাটারি বাঁচাতে OS নিজে থেকে সকেট বন্ধ করে দেয়।

এতে তিনটা নতুন সমস্যা তৈরি হয় যেগুলো stateless HTTP সার্ভিসে ছিল না। প্রথমত, **connection নিজেই একটা state** — কোন ইউজার কোন সার্ভারে বসে আছে সেটা জানা ছাড়া মেসেজ পাঠানোই যায় না। দ্বিতীয়ত, **ordering ক্লায়েন্টের দায়িত্বেও পড়ে** — সার্ভার যত ভালো ক্রমেই পাঠাক, নেটওয়ার্ক reorder করবে, retry করবে, আর ক্লায়েন্টকে বুঝতে হবে কী মিস হলো। তৃতীয়ত, **presence একটা write-heavy broadcast সমস্যা** — এক লাখ ইউজার অনলাইন হলে সেটা এক লাখ event নয়, লাখ-লাখ subscriber-কে পাঠানো কোটি-কোটি notification।

চ্যাপ্টার ২৫-এর collaborative editor-এর connection layer-এর সাথে এর অনেক মিল — দুটোই long-lived WebSocket, দুটোতেই routing দরকার। তফাত হলো, editor-এ ordering সমস্যাটা CRDT/OT দিয়ে সমাধান হয় কারণ সেখানে concurrent edit merge করতে হয়; চ্যাটে মেসেজ immutable, তাই merge লাগে না — শুধু একটা মিথ্যা না বলা total order লাগে প্রতি conversation-এ।

## Requirements

**Functional**

- এক-এক (direct) এবং group conversation — group-এ ২ থেকে ১ লাখ member পর্যন্ত
- মেসেজ পাঠানো, ডেলিভার করা, এবং সব ডিভাইসে sync হওয়া (multi-device, প্রতি ইউজারে গড়ে ২.৫টা ডিভাইস)
- তিন-ধাপের delivery state: sent → delivered → read
- Typing indicator এবং online/offline presence
- History pagination — যেকোনো conversation-এর যেকোনো পুরনো পয়েন্ট থেকে স্ক্রল
- Offline ইউজারের জন্য push notification, সাথে সঠিক unread badge count
- Reconnect করলে যা মিস হয়েছে সব backfill

**Non-functional (স্কেল নম্বরসহ)**

| মেট্রিক                                                | লক্ষ্য                                             |
| ------------------------------------------------------ | -------------------------------------------------- |
| DAU                                                    | ৫ কোটি                                             |
| একসাথে খোলা connection                                 | ৫০ লাখ peak, গড়ে ৩০ লাখ                           |
| মেসেজ send rate                                        | ১ লাখ/সেকেন্ড peak                                 |
| fan-out rate (delivery)                                | ১০ লাখ/সেকেন্ড peak                                |
| p99 delivery latency (sender ack থেকে receiver socket) | ২০০ ms-এর নিচে                                     |
| p99 send ack latency                                   | ১০০ ms-এর নিচে                                     |
| History read p99                                       | ১৫০ ms-এর নিচে                                     |
| Durability                                             | মেসেজ ack করার পর কখনো হারানো যাবে না              |
| Availability                                           | ৯৯.৯৯% (চ্যাপ্টার ১৭-এর SLO ফ্রেমওয়ার্ক অনুযায়ী) |
| Presence accuracy                                      | ৩০ সেকেন্ড পর্যন্ত পুরনো হওয়া গ্রহণযোগ্য          |

<Callout type="warning">

Durability আর presence accuracy-র লক্ষ্য ইচ্ছে করেই আলাদা রাখা হয়েছে। মেসেজ হারানো মানে ইউজারের কাছে সিস্টেমটা ভাঙা; presence তিরিশ সেকেন্ড পুরনো হওয়া মানে শুধু একটা সবুজ ডট একটু বেশি সময় জ্বলে ছিল। এই দুটোকে একই consistency লেভেলে টানার চেষ্টাই বেশিরভাগ চ্যাট সিস্টেমকে দশগুণ দামি করে ফেলে।

</Callout>

## হাই-লেভেল আর্কিটেকচার

<Mermaid
title="Chat System Architecture"
code={`graph TD
  CL["Mobile / Web Clients<br/>5M concurrent sockets"] --> LB["L4 Load Balancer<br/>sticky by conn, not by user"]
  LB --> GW["WebSocket Gateway Fleet<br/>~500 nodes, 10k conns each"]
  GW --> REG["Connection Registry<br/>Redis Cluster, user -> node"]
  GW --> MSG["Message Service<br/>seq allocation + persist"]
  MSG --> DB["Message Store<br/>Cassandra, partitioned by conv"]
  MSG --> BUS["Fan-out Bus<br/>Kafka, partitioned by conv id"]
  BUS --> FAN["Fan-out Workers<br/>routes to owning gateway"]
  FAN --> GW
  FAN --> PUSH["Push Service<br/>APNs / FCM, offline only"]
  GW --> PRES["Presence Service<br/>heartbeat TTL + coalesced broadcast"]
  PRES --> REG`}
/>

এখানে দুটো জিনিস ইচ্ছে করে আলাদা রাখা হয়েছে, আর সেটাই পুরো ডিজাইনের মেরুদণ্ড।

এক, **gateway আর message service আলাদা**। Gateway শুধু socket ধরে রাখে, frame parse করে, আর byte ঠেলে দেয়। মেসেজ কোথায় লিখতে হবে, seq কত হবে, কাকে কাকে পাঠাতে হবে — এসব gateway জানেই না। ফলে gateway fleet-কে connection সংখ্যা দিয়ে scale করা যায় আর message service-কে write rate দিয়ে; দুটো সম্পূর্ণ ভিন্ন হারে বাড়ে।

দুই, **fan-out gateway-র ভেতরে হয় না, আলাদা worker-এ হয়**। একটা মেসেজ persist হওয়ার পর সেটা Kafka-তে যায় (চ্যাপ্টার ১১-এর event bus), আর fan-out worker সেখান থেকে তুলে নিয়ে প্রাপকদের gateway-তে রুট করে। এতে sender-এর ack fan-out শেষ হওয়ার জন্য অপেক্ষা করে না — sender ৫০ ms-এ ack পায়, আর হাজার সদস্যের group-এ delivery ব্যাকগ্রাউন্ডে ছড়ায়।

## Connection layer

### কে কোন node-এর মালিক

৫০ লাখ socket মানে প্রায় ৫০০টা gateway node, প্রতিটায় ১০ হাজার connection। ইবনে সিনা যখন connect করেন, load balancer তাঁকে যেকোনো একটা node-এ ফেলে দেয় — কোনটা, সেটা কেউ আগে থেকে ঠিক করে না। ফলে "ইবনে সিনাকে মেসেজ পাঠাও" মানে প্রথমে জানতে হবে তিনি কোন node-এ আছেন।

এই তথ্যটা রাখে **connection registry** — Redis Cluster-এ একটা key, `conn:user:ibn-sina` থেকে `gw-baghdad-042` মানচিত্র, TTL সহ। Gateway node connect হওয়ার সময় লেখে, প্রতি heartbeat-এ TTL বাড়ায়, disconnect-এ মুছে দেয়।

এখানে একটা সূক্ষ্ম কিন্তু গুরুত্বপূর্ণ কথা: **gateway node নিজে stateless-এর কাছাকাছি, কিন্তু registry কখনোই নয়**। Gateway-তে যা আছে — খোলা socket, শেষ heartbeat-এর সময়, বাফারে জমা কয়েকটা frame — সবই ক্ষণস্থায়ী। Node মরে গেলে ক্লায়েন্ট reconnect করবে, অন্য node-এ বসবে, আর কিছুই স্থায়ীভাবে হারাবে না। কিন্তু registry হারালে পুরো fleet অন্ধ হয়ে যায় — কেউ জানে না কাকে কোথায় পাঠাতে হবে। তাই registry replicated, persistent, আর তার availability পুরো সিস্টেমের availability-র ceiling।

<Callout type="tip">

Registry-কে source of truth না বানিয়ে **hint** বানান। Fan-out worker registry থেকে node খুঁজে নিয়ে সেখানে পাঠায়; সেই node যদি বলে "এই ইউজার আমার এখানে নেই", worker সেটাকে normal মেনে নেয় এবং offline path (push) ধরে। Registry স্টেল হওয়া একটা প্রত্যাশিত ঘটনা, exception নয়।

</Callout>

### Sticky routing কেন consistent hashing দিয়ে করা হয় না

চ্যাপ্টার ৭-এ consistent hashing শিখেছেন, আর প্রথম প্রবৃত্তি হয় ইউজার-আইডি hash করে node বেছে নেওয়া — তাহলে তো registry-ই লাগে না, সবাই হিসাব করে বের করে নিতে পারে। বাস্তবে এটা কাজ করে না, কারণ ক্লায়েন্ট কোন node-এ পড়বে সেটা TCP/TLS হ্যান্ডশেকের সময়েই ঠিক হয়ে যায়, তখনো সার্ভার জানে না ইউজার কে (auth হয় হ্যান্ডশেকের পরে)। ইউজারকে জোর করে নির্দিষ্ট node-এ পাঠাতে গেলে হয় redirect করতে হবে (একটা extra round trip, মোবাইলে ব্যয়বহুল), নয়তো proxy করতে হবে (দ্বিগুণ hop)।

তাই বাস্তব সিস্টেমে connection যেখানে পড়ে সেখানেই থাকে, আর registry সেটা রেকর্ড করে। Consistent hashing-টা বরং ব্যবহার হয় অন্য জায়গায় — কোন fan-out worker কোন conversation-এর দায়িত্ব নেবে, সেটা ঠিক করতে।

### Heartbeat

মোবাইল নেটওয়ার্কে TCP connection "মরা" হতে পারে অথচ দুই পাশের কেউই জানে না — NAT টাইমআউট, ট্রেন টানেলে ঢোকা, ইত্যাদি। তাই application-level ping দরকার: ক্লায়েন্ট প্রতি ৩০ সেকেন্ডে ping পাঠায়, সার্ভার pong দেয়। সার্ভার ৯০ সেকেন্ড ping না পেলে socket বন্ধ করে registry থেকে entry মুছে দেয়। এই একই heartbeat আবার presence-এর ভিত্তি — আলাদা করে presence ping পাঠানোর দরকার নেই, যা মোবাইল ব্যাটারির জন্য বড় সাশ্রয়।

### Gateway ও connection registry — বাস্তবায়ন

<CodeTabs tsFile="chat-gateway.ts" goFile="chat-gateway.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { createClient, RedisClientType } from 'redis';
import crypto from 'node:crypto';

// ===========================================
// 1. CONFIG & TYPES
// ===========================================
const NODE_ID = process.env.NODE_ID || `gw-baghdad-${process.pid}`;
const PORT = parseInt(process.env.PORT || '8080', 10);
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;
const REGISTRY_TTL_SECONDS = 120;
const MAX_OUTBOUND_QUEUE = 512;

type Frame =
	| { t: 'hello'; userId: string; deviceId: string; token: string }
	| { t: 'ping'; ts: number }
	| { t: 'send'; convId: string; clientMsgId: string; body: string }
	| { t: 'ack'; convId: string; seq: number; kind: 'delivered' | 'read' }
	| { t: 'resume'; convId: string; fromSeq: number }
	| { t: 'sub_presence'; userIds: string[] };

interface Conn {
	id: string;
	userId: string;
	deviceId: string;
	socket: WebSocket;
	lastSeenAt: number;
	// Outbound frames buffered while the socket drains. Bounded — see back-pressure.
	pending: string[];
	closed: boolean;
}

// ===========================================
// 2. CONNECTION REGISTRY (Redis-backed)
// ===========================================
// Maps userId -> set of "nodeId:deviceId". A user may hold several devices
// on several nodes at once, so the value is a hash, not a scalar.
class ConnectionRegistry {
	constructor(private redis: RedisClientType) {}

	private key(userId: string): string {
		return `conn:user:${userId}`;
	}

	async register(userId: string, deviceId: string, nodeId: string): Promise<void> {
		const k = this.key(userId);
		await this.redis
			.multi()
			.hSet(k, deviceId, `${nodeId}:${Date.now()}`)
			.expire(k, REGISTRY_TTL_SECONDS)
			.exec();
	}

	// Called on every heartbeat. Refreshes the TTL so a crashed node's entries
	// expire on their own without any cleanup job.
	async refresh(userId: string, deviceId: string, nodeId: string): Promise<void> {
		await this.register(userId, deviceId, nodeId);
	}

	async unregister(userId: string, deviceId: string): Promise<void> {
		const k = this.key(userId);
		await this.redis.hDel(k, deviceId);
	}

	// Returns the node that owns each of the user's live devices.
	async lookup(userId: string): Promise<Array<{ deviceId: string; nodeId: string }>> {
		const entries = await this.redis.hGetAll(this.key(userId));
		return Object.entries(entries).map(([deviceId, value]) => ({
			deviceId,
			nodeId: value.split(':')[0]
		}));
	}
}

// ===========================================
// 3. GATEWAY
// ===========================================
class Gateway {
	private conns = new Map<string, Conn>();
	// userId -> connection ids (multi-device)
	private byUser = new Map<string, Set<string>>();
	private sweeper: ReturnType<typeof setInterval>;

	constructor(
		private registry: ConnectionRegistry,
		private bus: NodeBus,
		private msgClient: MessageServiceClient,
		private presence: PresenceClient
	) {
		this.sweeper = setInterval(() => this.sweepDeadConnections(), HEARTBEAT_INTERVAL_MS);
		// Frames routed to this node by fan-out workers arrive here.
		this.bus.onInbound(NODE_ID, (userId, payload) => this.deliverLocal(userId, payload));
	}

	async onConnection(socket: WebSocket): Promise<void> {
		// The socket is anonymous until the hello frame authenticates it.
		const authTimer = setTimeout(() => socket.close(4401, 'auth timeout'), 10_000);
		let conn: Conn | null = null;

		socket.on('message', async (raw) => {
			let frame: Frame;
			try {
				frame = JSON.parse(raw.toString()) as Frame;
			} catch {
				socket.close(4400, 'malformed frame');
				return;
			}

			if (!conn) {
				if (frame.t !== 'hello') {
					socket.close(4401, 'hello expected');
					return;
				}
				const userId = await verifyToken(frame.token, frame.userId);
				if (!userId) {
					socket.close(4403, 'bad token');
					return;
				}
				clearTimeout(authTimer);
				conn = this.attach(userId, frame.deviceId, socket);
				await this.registry.register(userId, frame.deviceId, NODE_ID);
				await this.presence.heartbeat(userId);
				this.send(conn, { t: 'hello_ok', nodeId: NODE_ID, serverTime: Date.now() });
				return;
			}

			conn.lastSeenAt = Date.now();
			await this.handleFrame(conn, frame);
		});

		socket.on('close', async () => {
			clearTimeout(authTimer);
			if (conn) await this.detach(conn);
		});

		socket.on('error', () => {
			if (conn) void this.detach(conn);
		});
	}

	private attach(userId: string, deviceId: string, socket: WebSocket): Conn {
		const conn: Conn = {
			id: crypto.randomUUID(),
			userId,
			deviceId,
			socket,
			lastSeenAt: Date.now(),
			pending: [],
			closed: false
		};
		this.conns.set(conn.id, conn);
		let set = this.byUser.get(userId);
		if (!set) {
			set = new Set();
			this.byUser.set(userId, set);
		}
		set.add(conn.id);
		return conn;
	}

	private async detach(conn: Conn): Promise<void> {
		if (conn.closed) return;
		conn.closed = true;
		this.conns.delete(conn.id);
		const set = this.byUser.get(conn.userId);
		if (set) {
			set.delete(conn.id);
			if (set.size === 0) this.byUser.delete(conn.userId);
		}
		await this.registry.unregister(conn.userId, conn.deviceId);
		// Do NOT mark offline here. The TTL in the presence service decides that,
		// so a two-second network blip does not flap the green dot.
	}

	private async handleFrame(conn: Conn, frame: Frame): Promise<void> {
		switch (frame.t) {
			case 'ping': {
				await this.registry.refresh(conn.userId, conn.deviceId, NODE_ID);
				await this.presence.heartbeat(conn.userId);
				this.send(conn, { t: 'pong', ts: frame.ts, serverTime: Date.now() });
				return;
			}
			case 'send': {
				const result = await this.msgClient.send({
					convId: frame.convId,
					senderId: conn.userId,
					clientMsgId: frame.clientMsgId,
					body: frame.body
				});
				// Ack carries the assigned seq so the sender can order its own view.
				this.send(conn, {
					t: 'send_ok',
					clientMsgId: frame.clientMsgId,
					convId: frame.convId,
					seq: result.seq,
					messageId: result.messageId
				});
				return;
			}
			case 'ack': {
				await this.msgClient.recordReceipt({
					convId: frame.convId,
					userId: conn.userId,
					seq: frame.seq,
					kind: frame.kind
				});
				return;
			}
			case 'resume': {
				const batch = await this.msgClient.backfill(frame.convId, conn.userId, frame.fromSeq, 200);
				for (const m of batch.messages) {
					this.send(conn, { t: 'msg', ...m });
				}
				this.send(conn, {
					t: 'resume_done',
					convId: frame.convId,
					upToSeq: batch.upToSeq,
					hasMore: batch.hasMore
				});
				return;
			}
			case 'sub_presence': {
				// Scope guard: a client may not subscribe to unbounded user sets.
				const scoped = frame.userIds.slice(0, 500);
				await this.presence.subscribe(conn.userId, NODE_ID, scoped);
				const snapshot = await this.presence.snapshot(scoped);
				this.send(conn, { t: 'presence_snapshot', states: snapshot });
				return;
			}
		}
	}

	// Called by the fan-out worker via the node bus.
	private deliverLocal(userId: string, payload: unknown): void {
		const ids = this.byUser.get(userId);
		if (!ids) return; // user moved or disconnected; worker falls back to push
		for (const id of ids) {
			const conn = this.conns.get(id);
			if (conn) this.send(conn, payload);
		}
	}

	// Bounded write with back-pressure: a client that cannot keep up is
	// disconnected rather than allowed to consume the node's heap.
	private send(conn: Conn, payload: unknown): void {
		if (conn.closed) return;
		if (conn.socket.bufferedAmount > 1_000_000 || conn.pending.length > MAX_OUTBOUND_QUEUE) {
			console.warn(`[BACKPRESSURE] dropping slow consumer user=${conn.userId}`);
			conn.socket.close(4408, 'too slow');
			void this.detach(conn);
			return;
		}
		conn.socket.send(JSON.stringify(payload));
	}

	private sweepDeadConnections(): void {
		const cutoff = Date.now() - HEARTBEAT_TIMEOUT_MS;
		for (const conn of this.conns.values()) {
			if (conn.lastSeenAt < cutoff) {
				console.log(`[SWEEP] stale conn user=${conn.userId} device=${conn.deviceId}`);
				conn.socket.close(4409, 'heartbeat timeout');
				void this.detach(conn);
			}
		}
	}

	async shutdown(): Promise<void> {
		clearInterval(this.sweeper);
		// Staggered close so 10k clients do not reconnect in the same millisecond.
		const all = [...this.conns.values()];
		for (let i = 0; i < all.length; i++) {
			const delay = Math.floor((i / all.length) * 15_000);
			setTimeout(() => all[i].socket.close(1001, 'server restart'), delay);
		}
	}
}

// ===========================================
// 4. WIRING
// ===========================================
async function main(): Promise<void> {
	const redis = createClient({ url: process.env.REDIS_URL }) as RedisClientType;
	await redis.connect();

	const registry = new ConnectionRegistry(redis);
	const gateway = new Gateway(
		registry,
		new NodeBus(redis),
		new MessageServiceClient(process.env.MESSAGE_SERVICE_URL!),
		new PresenceClient(redis)
	);

	const wss = new WebSocketServer({ port: PORT, maxPayload: 64 * 1024 });
	wss.on('connection', (socket) => void gateway.onConnection(socket));
	console.log(`gateway ${NODE_ID} listening on :${PORT}`);

	process.on('SIGTERM', async () => {
		await gateway.shutdown();
		wss.close();
		await redis.quit();
	});
}

void main();
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

// ===========================================
// 1. CONFIG & TYPES
// ===========================================
const (
	heartbeatInterval = 30 * time.Second
	heartbeatTimeout  = 90 * time.Second
	registryTTL       = 120 * time.Second
	maxOutboundQueue  = 512
)

var nodeID = envOr("NODE_ID", fmt.Sprintf("gw-baghdad-%d", os.Getpid()))

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

type Frame struct {
	T           string   `json:"t"`
	UserID      string   `json:"userId,omitempty"`
	DeviceID    string   `json:"deviceId,omitempty"`
	Token       string   `json:"token,omitempty"`
	ConvID      string   `json:"convId,omitempty"`
	ClientMsgID string   `json:"clientMsgId,omitempty"`
	Body        string   `json:"body,omitempty"`
	Seq         int64    `json:"seq,omitempty"`
	FromSeq     int64    `json:"fromSeq,omitempty"`
	Kind        string   `json:"kind,omitempty"`
	UserIDs     []string `json:"userIds,omitempty"`
	TS          int64    `json:"ts,omitempty"`
}

type Conn struct {
	ID       string
	UserID   string
	DeviceID string
	ws       *websocket.Conn
	out      chan []byte
	lastSeen time.Time
	mu       sync.Mutex
	closed   bool
}

// ===========================================
// 2. CONNECTION REGISTRY
// ===========================================
type ConnectionRegistry struct {
	rdb *redis.Client
}

func (r *ConnectionRegistry) key(userID string) string {
	return "conn:user:" + userID
}

func (r *ConnectionRegistry) Register(ctx context.Context, userID, deviceID, node string) error {
	k := r.key(userID)
	pipe := r.rdb.TxPipeline()
	pipe.HSet(ctx, k, deviceID, fmt.Sprintf("%s:%d", node, time.Now().UnixMilli()))
	pipe.Expire(ctx, k, registryTTL)
	_, err := pipe.Exec(ctx)
	return err
}

func (r *ConnectionRegistry) Unregister(ctx context.Context, userID, deviceID string) error {
	return r.rdb.HDel(ctx, r.key(userID), deviceID).Err()
}

type Location struct {
	DeviceID string
	NodeID   string
}

func (r *ConnectionRegistry) Lookup(ctx context.Context, userID string) ([]Location, error) {
	m, err := r.rdb.HGetAll(ctx, r.key(userID)).Result()
	if err != nil {
		return nil, err
	}
	out := make([]Location, 0, len(m))
	for dev, val := range m {
		node := val
		for i := 0; i < len(val); i++ {
			if val[i] == ':' {
				node = val[:i]
				break
			}
		}
		out = append(out, Location{DeviceID: dev, NodeID: node})
	}
	return out, nil
}

// ===========================================
// 3. GATEWAY
// ===========================================
type Gateway struct {
	mu       sync.RWMutex
	conns    map[string]*Conn
	byUser   map[string]map[string]*Conn
	registry *ConnectionRegistry
	msg      *MessageServiceClient
	presence *PresenceClient
	bus      *NodeBus
}

func NewGateway(reg *ConnectionRegistry, msg *MessageServiceClient, pres *PresenceClient, bus *NodeBus) *Gateway {
	g := &Gateway{
		conns:    make(map[string]*Conn),
		byUser:   make(map[string]map[string]*Conn),
		registry: reg, msg: msg, presence: pres, bus: bus,
	}
	go g.sweepLoop()
	bus.OnInbound(nodeID, g.deliverLocal)
	return g
}

var upgrader = websocket.Upgrader{ReadBufferSize: 4096, WriteBufferSize: 4096}

func (g *Gateway) HandleWS(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	ws.SetReadLimit(64 * 1024)
	ctx := r.Context()

	// Await the hello frame before doing anything else.
	_ = ws.SetReadDeadline(time.Now().Add(10 * time.Second))
	var hello Frame
	if err := ws.ReadJSON(&hello); err != nil || hello.T != "hello" {
		ws.Close()
		return
	}
	userID, ok := verifyToken(hello.Token, hello.UserID)
	if !ok {
		ws.Close()
		return
	}

	conn := g.attach(userID, hello.DeviceID, ws)
	_ = g.registry.Register(ctx, userID, hello.DeviceID, nodeID)
	_ = g.presence.Heartbeat(ctx, userID)
	conn.Send(map[string]any{"t": "hello_ok", "nodeId": nodeID, "serverTime": time.Now().UnixMilli()})

	go conn.writeLoop()
	g.readLoop(ctx, conn)
}

func (g *Gateway) attach(userID, deviceID string, ws *websocket.Conn) *Conn {
	c := &Conn{
		ID:       fmt.Sprintf("%s-%d", deviceID, time.Now().UnixNano()),
		UserID:   userID,
		DeviceID: deviceID,
		ws:       ws,
		out:      make(chan []byte, maxOutboundQueue),
		lastSeen: time.Now(),
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	g.conns[c.ID] = c
	if g.byUser[userID] == nil {
		g.byUser[userID] = make(map[string]*Conn)
	}
	g.byUser[userID][c.ID] = c
	return c
}

func (g *Gateway) detach(ctx context.Context, c *Conn) {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	c.closed = true
	close(c.out)
	c.mu.Unlock()

	g.mu.Lock()
	delete(g.conns, c.ID)
	if set, ok := g.byUser[c.UserID]; ok {
		delete(set, c.ID)
		if len(set) == 0 {
			delete(g.byUser, c.UserID)
		}
	}
	g.mu.Unlock()

	_ = g.registry.Unregister(ctx, c.UserID, c.DeviceID)
	_ = c.ws.Close()
	// Presence offline is decided by TTL expiry, not by this close.
}

func (g *Gateway) readLoop(ctx context.Context, c *Conn) {
	defer g.detach(ctx, c)
	for {
		_ = c.ws.SetReadDeadline(time.Now().Add(heartbeatTimeout))
		var f Frame
		if err := c.ws.ReadJSON(&f); err != nil {
			return
		}
		c.mu.Lock()
		c.lastSeen = time.Now()
		c.mu.Unlock()

		switch f.T {
		case "ping":
			_ = g.registry.Register(ctx, c.UserID, c.DeviceID, nodeID)
			_ = g.presence.Heartbeat(ctx, c.UserID)
			c.Send(map[string]any{"t": "pong", "ts": f.TS, "serverTime": time.Now().UnixMilli()})

		case "send":
			res, err := g.msg.Send(ctx, SendRequest{
				ConvID: f.ConvID, SenderID: c.UserID,
				ClientMsgID: f.ClientMsgID, Body: f.Body,
			})
			if err != nil {
				c.Send(map[string]any{"t": "send_err", "clientMsgId": f.ClientMsgID, "error": err.Error()})
				continue
			}
			c.Send(map[string]any{
				"t": "send_ok", "clientMsgId": f.ClientMsgID,
				"convId": f.ConvID, "seq": res.Seq, "messageId": res.MessageID,
			})

		case "ack":
			_ = g.msg.RecordReceipt(ctx, ReceiptRequest{
				ConvID: f.ConvID, UserID: c.UserID, Seq: f.Seq, Kind: f.Kind,
			})

		case "resume":
			batch, err := g.msg.Backfill(ctx, f.ConvID, c.UserID, f.FromSeq, 200)
			if err != nil {
				continue
			}
			for _, m := range batch.Messages {
				c.Send(m)
			}
			c.Send(map[string]any{
				"t": "resume_done", "convId": f.ConvID,
				"upToSeq": batch.UpToSeq, "hasMore": batch.HasMore,
			})

		case "sub_presence":
			scoped := f.UserIDs
			if len(scoped) > 500 {
				scoped = scoped[:500]
			}
			_ = g.presence.Subscribe(ctx, c.UserID, nodeID, scoped)
			snap, _ := g.presence.Snapshot(ctx, scoped)
			c.Send(map[string]any{"t": "presence_snapshot", "states": snap})
		}
	}
}

func (g *Gateway) deliverLocal(userID string, payload []byte) {
	g.mu.RLock()
	set := g.byUser[userID]
	targets := make([]*Conn, 0, len(set))
	for _, c := range set {
		targets = append(targets, c)
	}
	g.mu.RUnlock()
	for _, c := range targets {
		c.SendRaw(payload)
	}
}

// Send serialises and enqueues. A full queue means a slow consumer:
// close it rather than let one client bloat the node.
func (c *Conn) Send(payload any) {
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	c.SendRaw(b)
}

func (c *Conn) SendRaw(b []byte) {
	c.mu.Lock()
	closed := c.closed
	c.mu.Unlock()
	if closed {
		return
	}
	select {
	case c.out <- b:
	default:
		log.Printf("[BACKPRESSURE] dropping slow consumer user=%s", c.UserID)
		_ = c.ws.Close()
	}
}

func (c *Conn) writeLoop() {
	for b := range c.out {
		_ = c.ws.SetWriteDeadline(time.Now().Add(10 * time.Second))
		if err := c.ws.WriteMessage(websocket.TextMessage, b); err != nil {
			_ = c.ws.Close()
			return
		}
	}
}

func (g *Gateway) sweepLoop() {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-heartbeatTimeout)
		g.mu.RLock()
		var stale []*Conn
		for _, c := range g.conns {
			c.mu.Lock()
			if c.lastSeen.Before(cutoff) {
				stale = append(stale, c)
			}
			c.mu.Unlock()
		}
		g.mu.RUnlock()
		for _, c := range stale {
			log.Printf("[SWEEP] stale conn user=%s device=%s", c.UserID, c.DeviceID)
			g.detach(context.Background(), c)
		}
	}
}

// Staggered shutdown avoids a synchronised reconnect storm.
func (g *Gateway) Shutdown() {
	g.mu.RLock()
	all := make([]*Conn, 0, len(g.conns))
	for _, c := range g.conns {
		all = append(all, c)
	}
	g.mu.RUnlock()

	for i, c := range all {
		delay := time.Duration(float64(i)/float64(len(all)+1)*15000) * time.Millisecond
		conn := c
		time.AfterFunc(delay, func() { g.detach(context.Background(), conn) })
	}
}

// ===========================================
// 4. WIRING
// ===========================================
func main() {
	rdb := redis.NewClient(&redis.Options{Addr: envOr("REDIS_ADDR", "localhost:6379")})
	reg := &ConnectionRegistry{rdb: rdb}
	g := NewGateway(reg, NewMessageServiceClient(envOr("MESSAGE_SERVICE_URL", "")),
		NewPresenceClient(rdb), NewNodeBus(rdb))

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", g.HandleWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	srv := &http.Server{Addr: ":" + envOr("PORT", "8080"), Handler: mux}
	go func() {
		log.Printf("gateway %s listening", nodeID)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	g.Shutdown()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
```

</div>
</CodeTabs>

## Ordering — sequence number কেন, timestamp কেন নয়

### Wall clock কেন মিথ্যা বলে

আল-খোয়ারিজমি আর ইবনে সিনা একই conversation-এ দ্রুত টাইপ করছেন। দুজনের মেসেজ দুটো ভিন্ন API সার্ভারে পৌঁছাল, আর সেই দুই সার্ভারের ঘড়ি NTP দিয়ে sync করা হলেও বাস্তবে ৫ থেকে ৫০ মিলিসেকেন্ড পর্যন্ত আলাদা থাকতে পারে। ফলে যে মেসেজটা আসলে পরে লেখা হয়েছে, তার timestamp আগের হয়ে যেতে পারে। ক্লায়েন্ট timestamp দিয়ে sort করলে কথোপকথনের যুক্তিই উল্টে যায় — উত্তরটা প্রশ্নের আগে দেখা যায়।

আর client-এর ঘড়ি তো আরও খারাপ — ইউজার নিজেই ফোনের সময় বদলাতে পারেন।

সমাধান হলো প্রতি conversation-এ একটা **monotonic sequence number**। Conversation-ই ordering-এর একক, গোটা সিস্টেম নয়। এতে global ordering-এর খরচ (একটা কেন্দ্রীয় counter, সবার bottleneck) এড়ানো যায়, অথচ ইউজার যা দেখে সেই একটা কথোপকথনের ভেতরে ক্রম নিখুঁত থাকে।

### seq কে বরাদ্দ করে

Sequence allocation-এর তিনটা চেনা উপায় আছে।

| উপায়                      | কীভাবে                                                                | সুবিধা                    | অসুবিধা                                                            |
| -------------------------- | --------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| DB row lock                | conversation row-এ `UPDATE ... SET next_seq = next_seq + 1 RETURNING` | সহজ, durable, সবসময় সঠিক | প্রতি মেসেজে একটা write transaction; hot conversation-এ contention |
| Redis INCR                 | conversation-প্রতি একটা counter key                                   | খুব দ্রুত, ১ ms-এর নিচে   | Redis হারালে counter হারায়; DB থেকে recover করতে হয়              |
| Partition-leader in-memory | Kafka partition-এর leader worker মেমরিতে গোনে                         | দ্রুত, contention নেই     | Leader বদলালে seq পুনরুদ্ধার করতে হয়                              |

বাস্তবে সবচেয়ে টেকসই মিশ্রণটা হলো: **Redis INCR হলো fast path, DB হলো authority।** Redis counter cold হলে (miss) সেটা `SELECT MAX(seq)` দিয়ে ওই conversation-এর DB থেকে seed করা হয়, তারপর মেমরিতে চলে। মেসেজ লেখার সময় `(conv_id, seq)` unique constraint-এ লেখা হয় — কোনো কারণে দুটো worker একই seq বরাদ্দ করলে দ্বিতীয় write ব্যর্থ হয় এবং retry নতুন seq নেয়। এটাই safety net; Redis-এর গতির উপর correctness নির্ভর করে না।

### Client-side gap detection

ক্লায়েন্ট প্রতি conversation-এ মনে রাখে সে সর্বোচ্চ কোন seq পর্যন্ত পেয়েছে (বলি `highestContiguous`)। নতুন frame-এ seq এলে তিনটা অবস্থা হতে পারে: seq ঠিক পরেরটা হলে গ্রহণ করে আর cursor এগিয়ে দেয়; seq আগের কোনোটা হলে ডুপ্লিকেট, ফেলে দেয়; seq সামনের দিকে লাফ দিলে মাঝের অংশটা একটা buffer-এ রেখে backfill চায়। এই তিন লাইনের যুক্তিই মোবাইল চ্যাটের ৯০% ordering bug ঠেকিয়ে দেয়।

<Callout type="tip">

Gap দেখা মাত্রই backfill রিকোয়েস্ট পাঠাবেন না — ২০০-৩০০ ms অপেক্ষা করুন। বেশিরভাগ gap আসলে reorder, হারানো নয়, আর অল্প অপেক্ষাতেই মাঝের frame এসে পড়ে। সাথে সাথে backfill চাইলে ব্যস্ত conversation-এ ক্লায়েন্ট নিজেই নিজের উপর request storm তৈরি করে।

</Callout>

### Data model

```sql
-- Conversations. next_seq is the authoritative allocator of last resort.
CREATE TABLE conversations (
  conv_id       UUID PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('direct', 'group', 'channel')),
  member_count  INT  NOT NULL DEFAULT 0,
  next_seq      BIGINT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membership. fanout_mode is derived from member_count, cached here so the
-- fan-out worker does not need a second lookup on the hot path.
CREATE TABLE conversation_members (
  conv_id     UUID NOT NULL,
  user_id     UUID NOT NULL,
  joined_seq  BIGINT NOT NULL,     -- history before this seq is not visible
  muted       BOOLEAN NOT NULL DEFAULT false,
  role        TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (conv_id, user_id)
);
CREATE INDEX idx_members_by_user ON conversation_members (user_id, conv_id);

-- Messages, clustered so that "the last 50 in this conversation" is one
-- contiguous read. seq DESC keeps the hot tail at the head of the partition.
CREATE TABLE messages (
  conv_id       UUID   NOT NULL,
  seq           BIGINT NOT NULL,
  message_id    UUID   NOT NULL,
  sender_id     UUID   NOT NULL,
  body          TEXT   NOT NULL,
  client_msg_id TEXT   NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at     TIMESTAMPTZ,
  deleted       BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (conv_id, seq)
);

-- Sender-side idempotency: a retried send never creates a second message.
CREATE UNIQUE INDEX idx_msg_client_dedupe
  ON messages (conv_id, sender_id, client_msg_id);

-- One row per (conversation, user) — NOT one row per message per user.
CREATE TABLE read_cursors (
  conv_id          UUID NOT NULL,
  user_id          UUID NOT NULL,
  delivered_up_to  BIGINT NOT NULL DEFAULT 0,
  read_up_to       BIGINT NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conv_id, user_id)
);

-- Inbox rows exist only for fan-out-on-write conversations (small groups).
CREATE TABLE inbox (
  user_id     UUID   NOT NULL,
  conv_id     UUID   NOT NULL,
  seq         BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conv_id, seq)
);
```

## Fan-out — write-path বনাম read-path

<Mermaid
title="Message Fan-out Path"
code={`graph TD
  S["Sender socket<br/>send frame"] --> MS["Message Service<br/>dedupe by client_msg_id"]
  MS --> SEQ["Seq Allocator<br/>Redis INCR, DB as authority"]
  SEQ --> W["Persist message<br/>unique on conv_id + seq"]
  W --> ACK["Ack to sender<br/>p99 under 100ms"]
  W --> K["Kafka topic chat.messages<br/>partitioned by conv_id"]
  K --> FW["Fan-out Worker<br/>reads membership"]
  FW --> SMALL["Small conversation<br/>push to every member"]
  FW --> LARGE["Large channel<br/>write tail pointer only"]
  SMALL --> RT["Registry lookup<br/>user to gateway node"]
  RT --> ON["Online: node bus frame"]
  RT --> OFF["Offline: push queue"]
  LARGE --> PULL["Client pulls on open<br/>read path fan-out"]`}
/>

### দুটো কৌশল

**Fan-out on write (push)** — মেসেজ লেখার সময়ই প্রতিটা প্রাপকের জন্য কাজ করা: registry দেখে তার gateway-তে frame পাঠানো, offline হলে push queue-তে ফেলা, আর তার inbox row লেখা। প্রাপকের কাছে মেসেজ পৌঁছায় সাথে সাথে; পড়ার সময় কোনো খরচ নেই। কিন্তু খরচটা সদস্যসংখ্যার সমানুপাতিক — ৫০ হাজার সদস্যের channel-এ একটা মেসেজ মানে ৫০ হাজার unit কাজ।

**Fan-out on read (pull)** — মেসেজ শুধু conversation-এর নিজের partition-এ একবার লেখা হয়। প্রাপক যখন conversation খোলে, সে নিজের read cursor-এর পর থেকে যা আছে তা টেনে নেয়। লেখার খরচ ধ্রুবক, কিন্তু latency বাড়ে এবং "নতুন মেসেজ আছে" জানানোর জন্য আলাদা একটা হালকা signal লাগে।

চ্যাপ্টার ১১-এর CQRS-এর ভাষায়: fan-out on write মানে write-এর সময় read model তৈরি করা, fan-out on read মানে read-এর সময় project করা। চ্যাটে দুটোরই দরকার, কারণ একই সিস্টেমে দুই রকম conversation থাকে।

### হাইব্রিড থ্রেশহোল্ড

| conversation ধরন | সদস্য       | কৌশল                                             | কারণ                                       |
| ---------------- | ----------- | ------------------------------------------------ | ------------------------------------------ |
| Direct           | ২           | fan-out on write                                 | সবচেয়ে সাধারণ, latency সবচেয়ে বেশি জরুরি |
| ছোট group        | ৩ – ২০০     | fan-out on write                                 | write খরচ এখনো সস্তা, inbox row লেখা যায়  |
| মাঝারি group     | ২০০ – ২,০০০ | হাইব্রিড: online সদস্যদের push, offline-দের pull | online সদস্য সাধারণত মোট সদস্যের ১০-২০%    |
| বড় channel      | ২,০০০+      | fan-out on read                                  | write খরচ ধ্রুবক রাখা ছাড়া উপায় নেই      |

মাঝারি স্তরটাই আসল কৌশল: fan-out worker registry-তে দেখে নেয় কারা এখন online, এবং **শুধু তাদেরই** push করে। যারা offline, তাদের জন্য কিছুই লেখা হয় না — তারা ফিরে এসে নিজের cursor থেকে pull করবে। একটা ২,০০০ সদস্যের group-এ যদি ১৫০ জন online থাকে, write খরচ ২,০০০ থেকে নেমে ১৫০-এ আসে।

<Callout type="warning">

Threshold-টা কনফিগারযোগ্য রাখুন এবং conversation-প্রতি সংরক্ষণ করুন, কোডে হার্ডকোড করবেন না। একটা group ধীরে ধীরে বড় হয়ে threshold পেরোতে পারে, আর মাঝপথে কৌশল বদলানোর সময় দুই মোডেই কিছুক্ষণ চলা (double-write) দরকার হয় — নাহলে switch-এর মুহূর্তের মেসেজগুলো কোনো পথেই পৌঁছায় না।

</Callout>

## Delivery ও read receipt

### তিনটা state

একটা মেসেজের জীবনচক্র প্রাপকের দৃষ্টিকোণ থেকে: **sent** (সার্ভার persist করেছে ও sender-কে ack দিয়েছে), **delivered** (প্রাপকের অন্তত একটা ডিভাইস frame-টা পেয়েছে ও স্বীকার করেছে), **read** (প্রাপক conversation-টা খুলেছে এবং ওই seq পর্যন্ত দেখেছে)।

খেয়াল করুন state-টা মেসেজের নয়, **(মেসেজ, প্রাপক)** জোড়ার। ১০০ সদস্যের group-এ একটা মেসেজের ১০০টা আলাদা delivery state আছে।

### প্রতি-মেসেজ row নয়, cursor

সরল বাস্তবায়ন হলো প্রতি (message, user) জোড়ায় একটা row লেখা। ৫০ কোটি মেসেজ/দিন আর গড়ে ৮ জন প্রাপক মানে দিনে ৪০০ কোটি row — শুধু টিক মার্কের জন্য। এটা মূল মেসেজ টেবিলের চেয়েও বড় হয়ে যায়।

**Read cursor** এই পুরো টেবিলটাকে এক লাইনে নামিয়ে আনে: প্রতি (conversation, user)-এ শুধু দুটো সংখ্যা — `delivered_up_to` আর `read_up_to`। ইবনে সিনা ১২ নম্বর পর্যন্ত পড়েছেন মানে ১ থেকে ১২ সব পড়া। কোনো মেসেজ পড়া কিনা জানতে হলে শুধু তুলনা: তার seq কি cursor-এর সমান বা কম?

এটা কাজ করে কারণ **পড়া একটা prefix property** — মানুষ কথোপকথন ক্রমে পড়ে, এলোমেলোভাবে নয়। এই ছোট্ট পর্যবেক্ষণটাই storage খরচ হাজার গুণ কমিয়ে দেয়।

### Cursor কখনো পিছোয় না

Receipt idempotent হতেই হবে, কারণ ক্লায়েন্ট reconnect করে পুরনো ack আবার পাঠাবে, নেটওয়ার্ক frame ডুপ্লিকেট করবে, আর ব্যবহারকারী দুটো ডিভাইসে একই conversation খুলবে। নিয়মটা তাই সবচেয়ে সরল রূপেই লেখা: cursor শুধু **বাড়তে** পারে।

```sql
-- Monotonic upsert. A stale or duplicate ack is a no-op, not a corruption.
INSERT INTO read_cursors (conv_id, user_id, read_up_to, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (conv_id, user_id) DO UPDATE
  SET read_up_to = GREATEST(read_cursors.read_up_to, EXCLUDED.read_up_to),
      updated_at = now()
  WHERE EXCLUDED.read_up_to > read_cursors.read_up_to;
```

`GREATEST` আর `WHERE` শর্ত মিলিয়ে এই একটা statement-ই idempotency দেয় — কোনো distributed lock লাগে না, কোনো dedupe table লাগে না। চ্যাপ্টার ২০-এর idempotency key-র তুলনায় এটা আরও সস্তা, কারণ operation-টা নিজেই commutative ও idempotent (max একটা CRDT-বান্ধব অপারেশন)।

### Unread count

Cursor থাকলে unread count আর গোনা লাগে না — এটা একটা বিয়োগ:

```sql
-- Unread per conversation for one user, without scanning any messages.
SELECT c.conv_id,
       (c.next_seq - 1) - GREATEST(rc.read_up_to, m.joined_seq - 1) AS unread
FROM conversation_members m
JOIN conversations c  ON c.conv_id = m.conv_id
LEFT JOIN read_cursors rc
       ON rc.conv_id = m.conv_id AND rc.user_id = m.user_id
WHERE m.user_id = $1 AND m.muted = false;
```

### Message service — বাস্তবায়ন

<CodeTabs tsFile="message-service.ts" goFile="message-service.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import { Pool } from 'pg';
import { RedisClientType } from 'redis';
import { Kafka, Producer } from 'kafkajs';
import crypto from 'node:crypto';

// ===========================================
// 1. TYPES
// ===========================================
type FanoutMode = 'write' | 'hybrid' | 'read';

const SMALL_GROUP_MAX = 200;
const HYBRID_GROUP_MAX = 2000;

interface SendRequest {
	convId: string;
	senderId: string;
	clientMsgId: string;
	body: string;
}

interface SendResult {
	messageId: string;
	seq: number;
	deduped: boolean;
}

interface StoredMessage {
	convId: string;
	seq: number;
	messageId: string;
	senderId: string;
	body: string;
	createdAt: string;
}

// ===========================================
// 2. SEQUENCE ALLOCATOR
// ===========================================
// Redis is the fast path; the database is the authority. If the Redis counter
// is cold or was lost, it is re-seeded from the persisted maximum. A unique
// index on (conv_id, seq) is the final guard against a duplicate allocation.
class SeqAllocator {
	constructor(
		private redis: RedisClientType,
		private db: Pool
	) {}

	async next(convId: string): Promise<number> {
		const key = `seq:conv:${convId}`;
		const exists = await this.redis.exists(key);

		if (!exists) {
			const { rows } = await this.db.query<{ max_seq: string | null }>(
				'SELECT MAX(seq)::text AS max_seq FROM messages WHERE conv_id = $1',
				[convId]
			);
			const seed = rows[0]?.max_seq ? parseInt(rows[0].max_seq, 10) : 0;
			// NX so a concurrent seeder does not clobber a counter already in use.
			await this.redis.set(key, String(seed), { NX: true });
		}

		const next = await this.redis.incr(key);
		await this.redis.expire(key, 86_400); // idle conversations release memory
		return next;
	}

	// Called when a write loses the (conv_id, seq) uniqueness race.
	async repair(convId: string): Promise<void> {
		const { rows } = await this.db.query<{ max_seq: string | null }>(
			'SELECT MAX(seq)::text AS max_seq FROM messages WHERE conv_id = $1',
			[convId]
		);
		const seed = rows[0]?.max_seq ? parseInt(rows[0].max_seq, 10) : 0;
		await this.redis.set(`seq:conv:${convId}`, String(seed));
	}
}

// ===========================================
// 3. MESSAGE SERVICE
// ===========================================
class MessageService {
	constructor(
		private db: Pool,
		private redis: RedisClientType,
		private seq: SeqAllocator,
		private producer: Producer
	) {}

	async send(req: SendRequest): Promise<SendResult> {
		// --- Sender idempotency: the same clientMsgId never creates a second row.
		const existing = await this.db.query<{ message_id: string; seq: string }>(
			`SELECT message_id, seq::text AS seq FROM messages
       WHERE conv_id = $1 AND sender_id = $2 AND client_msg_id = $3`,
			[req.convId, req.senderId, req.clientMsgId]
		);
		if (existing.rowCount) {
			return {
				messageId: existing.rows[0].message_id,
				seq: parseInt(existing.rows[0].seq, 10),
				deduped: true
			};
		}

		const messageId = crypto.randomUUID();

		// --- Allocate and persist, retrying once if two writers collided.
		let seq = 0;
		for (let attempt = 0; attempt < 3; attempt++) {
			seq = await this.seq.next(req.convId);
			try {
				await this.db.query(
					`INSERT INTO messages (conv_id, seq, message_id, sender_id, body, client_msg_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
					[req.convId, seq, messageId, req.senderId, req.body, req.clientMsgId]
				);
				break;
			} catch (err: unknown) {
				const code = (err as { code?: string }).code;
				if (code === '23505' && attempt < 2) {
					// Unique violation: either a seq collision (repair and retry)
					// or a concurrent duplicate send (return the winner).
					await this.seq.repair(req.convId);
					continue;
				}
				throw err;
			}
		}

		await this.db.query(
			'UPDATE conversations SET next_seq = GREATEST(next_seq, $2 + 1) WHERE conv_id = $1',
			[req.convId, seq]
		);

		// --- Sender is acked here. Fan-out happens asynchronously downstream.
		await this.producer.send({
			topic: 'chat.messages',
			messages: [
				{
					key: req.convId, // partition by conversation: preserves per-conv order
					value: JSON.stringify({
						convId: req.convId,
						seq,
						messageId,
						senderId: req.senderId,
						body: req.body,
						createdAt: new Date().toISOString()
					})
				}
			]
		});

		return { messageId, seq, deduped: false };
	}

	// --- Receipts. Monotonic, therefore idempotent by construction.
	async recordReceipt(input: {
		convId: string;
		userId: string;
		seq: number;
		kind: 'delivered' | 'read';
	}): Promise<{ applied: boolean; cursor: number }> {
		const column = input.kind === 'read' ? 'read_up_to' : 'delivered_up_to';

		const { rows } = await this.db.query<{ cursor: string; applied: boolean }>(
			`INSERT INTO read_cursors (conv_id, user_id, ${column}, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (conv_id, user_id) DO UPDATE
         SET ${column} = GREATEST(read_cursors.${column}, EXCLUDED.${column}),
             updated_at = now()
       RETURNING ${column}::text AS cursor,
                 (read_cursors.${column} = EXCLUDED.${column}) AS applied`,
			[input.convId, input.userId, input.seq]
		);

		const cursor = parseInt(rows[0].cursor, 10);

		// Only broadcast when the cursor actually moved — a repeated ack is silent.
		if (rows[0].applied) {
			await this.producer.send({
				topic: 'chat.receipts',
				messages: [
					{
						key: input.convId,
						value: JSON.stringify({ ...input, cursor })
					}
				]
			});
		}

		return { applied: rows[0].applied, cursor };
	}

	// --- Cursor pagination on (conv_id, seq). No OFFSET anywhere.
	async history(
		convId: string,
		userId: string,
		beforeSeq: number | null,
		limit = 50
	): Promise<{ messages: StoredMessage[]; nextCursor: number | null }> {
		const member = await this.db.query<{ joined_seq: string }>(
			'SELECT joined_seq::text AS joined_seq FROM conversation_members WHERE conv_id = $1 AND user_id = $2',
			[convId, userId]
		);
		if (!member.rowCount) throw new Error('not a member');
		const floor = parseInt(member.rows[0].joined_seq, 10);

		const cap = Math.min(limit, 200);
		const { rows } = await this.db.query(
			`SELECT conv_id, seq::text AS seq, message_id, sender_id, body, created_at
       FROM messages
       WHERE conv_id = $1
         AND seq >= $2
         AND ($3::bigint IS NULL OR seq < $3)
         AND deleted = false
       ORDER BY seq DESC
       LIMIT $4`,
			[convId, floor, beforeSeq, cap]
		);

		const messages: StoredMessage[] = rows.map((r) => ({
			convId: r.conv_id,
			seq: parseInt(r.seq, 10),
			messageId: r.message_id,
			senderId: r.sender_id,
			body: r.body,
			createdAt: r.created_at.toISOString()
		}));

		const nextCursor = messages.length === cap ? messages[messages.length - 1].seq : null;
		return { messages, nextCursor };
	}

	// --- Resume: everything the client missed, oldest first, capped.
	async backfill(
		convId: string,
		userId: string,
		fromSeq: number,
		limit = 200
	): Promise<{ messages: StoredMessage[]; upToSeq: number; hasMore: boolean }> {
		const cap = Math.min(limit, 500);
		const { rows } = await this.db.query(
			`SELECT conv_id, seq::text AS seq, message_id, sender_id, body, created_at
       FROM messages
       WHERE conv_id = $1 AND seq > $2 AND deleted = false
       ORDER BY seq ASC
       LIMIT $3`,
			[convId, fromSeq, cap + 1]
		);

		const hasMore = rows.length > cap;
		const page = hasMore ? rows.slice(0, cap) : rows;
		const messages: StoredMessage[] = page.map((r) => ({
			convId: r.conv_id,
			seq: parseInt(r.seq, 10),
			messageId: r.message_id,
			senderId: r.sender_id,
			body: r.body,
			createdAt: r.created_at.toISOString()
		}));

		return {
			messages,
			upToSeq: messages.length ? messages[messages.length - 1].seq : fromSeq,
			hasMore
		};
	}
}

// ===========================================
// 4. FAN-OUT WORKER
// ===========================================
class FanoutWorker {
	constructor(
		private db: Pool,
		private redis: RedisClientType,
		private nodeBus: NodeBus,
		private push: PushClient
	) {}

	private modeFor(memberCount: number): FanoutMode {
		if (memberCount <= SMALL_GROUP_MAX) return 'write';
		if (memberCount <= HYBRID_GROUP_MAX) return 'hybrid';
		return 'read';
	}

	async handle(msg: StoredMessage): Promise<void> {
		const conv = await this.db.query<{ member_count: number }>(
			'SELECT member_count FROM conversations WHERE conv_id = $1',
			[msg.convId]
		);
		const mode = this.modeFor(conv.rows[0]?.member_count ?? 2);

		if (mode === 'read') {
			// Large channel: publish a lightweight tail pointer only. Readers pull.
			await this.redis.set(`tail:conv:${msg.convId}`, String(msg.seq));
			await this.nodeBus.broadcastConversationTail(msg.convId, msg.seq);
			return;
		}

		const members = await this.db.query<{ user_id: string; muted: boolean }>(
			'SELECT user_id, muted FROM conversation_members WHERE conv_id = $1',
			[msg.convId]
		);

		for (const member of members.rows) {
			if (member.user_id === msg.senderId) continue;

			const locations = await this.lookupRegistry(member.user_id);

			if (locations.length > 0) {
				for (const loc of locations) {
					await this.nodeBus.route(loc.nodeId, member.user_id, { t: 'msg', ...msg });
				}
				if (mode === 'write') {
					await this.db.query(
						'INSERT INTO inbox (user_id, conv_id, seq) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
						[member.user_id, msg.convId, msg.seq]
					);
				}
				continue;
			}

			// Offline. In hybrid mode we write nothing — the client pulls on open.
			if (mode === 'write') {
				await this.db.query(
					'INSERT INTO inbox (user_id, conv_id, seq) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
					[member.user_id, msg.convId, msg.seq]
				);
			}
			if (!member.muted) {
				await this.push.enqueue(member.user_id, msg);
			}
		}
	}

	private async lookupRegistry(userId: string): Promise<Array<{ nodeId: string }>> {
		const entries = await this.redis.hGetAll(`conn:user:${userId}`);
		return Object.values(entries).map((v) => ({ nodeId: v.split(':')[0] }));
	}
}

export { MessageService, SeqAllocator, FanoutWorker };
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
)

// ===========================================
// 1. TYPES
// ===========================================
const (
	smallGroupMax  = 200
	hybridGroupMax = 2000
)

type FanoutMode string

const (
	FanoutWrite  FanoutMode = "write"
	FanoutHybrid FanoutMode = "hybrid"
	FanoutRead   FanoutMode = "read"
)

type SendRequest struct {
	ConvID      string
	SenderID    string
	ClientMsgID string
	Body        string
}

type SendResult struct {
	MessageID string `json:"messageId"`
	Seq       int64  `json:"seq"`
	Deduped   bool   `json:"deduped"`
}

type StoredMessage struct {
	ConvID    string    `json:"convId"`
	Seq       int64     `json:"seq"`
	MessageID string    `json:"messageId"`
	SenderID  string    `json:"senderId"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
}

// ===========================================
// 2. SEQUENCE ALLOCATOR
// ===========================================
type SeqAllocator struct {
	rdb *redis.Client
	db  *sql.DB
}

// Next hands out a monotonic per-conversation sequence. Redis is the fast
// path; the unique index on (conv_id, seq) is the correctness backstop.
func (a *SeqAllocator) Next(ctx context.Context, convID string) (int64, error) {
	key := "seq:conv:" + convID

	n, err := a.rdb.Exists(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	if n == 0 {
		seed, err := a.maxSeq(ctx, convID)
		if err != nil {
			return 0, err
		}
		// SetNX so a concurrent seeder cannot rewind a live counter.
		a.rdb.SetNX(ctx, key, seed, 24*time.Hour)
	}

	next, err := a.rdb.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	a.rdb.Expire(ctx, key, 24*time.Hour)
	return next, nil
}

func (a *SeqAllocator) Repair(ctx context.Context, convID string) error {
	seed, err := a.maxSeq(ctx, convID)
	if err != nil {
		return err
	}
	return a.rdb.Set(ctx, "seq:conv:"+convID, seed, 24*time.Hour).Err()
}

func (a *SeqAllocator) maxSeq(ctx context.Context, convID string) (int64, error) {
	var max sql.NullInt64
	err := a.db.QueryRowContext(ctx,
		`SELECT MAX(seq) FROM messages WHERE conv_id = $1`, convID).Scan(&max)
	if err != nil {
		return 0, err
	}
	if !max.Valid {
		return 0, nil
	}
	return max.Int64, nil
}

// ===========================================
// 3. MESSAGE SERVICE
// ===========================================
type MessageService struct {
	db     *sql.DB
	rdb    *redis.Client
	seq    *SeqAllocator
	writer *kafka.Writer
}

func (s *MessageService) Send(ctx context.Context, req SendRequest) (*SendResult, error) {
	// Sender idempotency.
	var existingID string
	var existingSeq int64
	err := s.db.QueryRowContext(ctx,
		`SELECT message_id, seq FROM messages
		 WHERE conv_id = $1 AND sender_id = $2 AND client_msg_id = $3`,
		req.ConvID, req.SenderID, req.ClientMsgID).Scan(&existingID, &existingSeq)
	if err == nil {
		return &SendResult{MessageID: existingID, Seq: existingSeq, Deduped: true}, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	messageID := uuid.NewString()
	var seq int64

	for attempt := 0; attempt < 3; attempt++ {
		seq, err = s.seq.Next(ctx, req.ConvID)
		if err != nil {
			return nil, err
		}
		_, err = s.db.ExecContext(ctx,
			`INSERT INTO messages (conv_id, seq, message_id, sender_id, body, client_msg_id)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			req.ConvID, seq, messageID, req.SenderID, req.Body, req.ClientMsgID)
		if err == nil {
			break
		}
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && pqErr.Code == "23505" && attempt < 2 {
			_ = s.seq.Repair(ctx, req.ConvID)
			continue
		}
		return nil, err
	}

	_, _ = s.db.ExecContext(ctx,
		`UPDATE conversations SET next_seq = GREATEST(next_seq, $2 + 1) WHERE conv_id = $1`,
		req.ConvID, seq)

	payload, _ := json.Marshal(StoredMessage{
		ConvID: req.ConvID, Seq: seq, MessageID: messageID,
		SenderID: req.SenderID, Body: req.Body, CreatedAt: time.Now().UTC(),
	})

	// Keyed by conversation so one partition preserves per-conversation order.
	if err := s.writer.WriteMessages(ctx, kafka.Message{
		Topic: "chat.messages", Key: []byte(req.ConvID), Value: payload,
	}); err != nil {
		return nil, err
	}

	return &SendResult{MessageID: messageID, Seq: seq}, nil
}

type ReceiptRequest struct {
	ConvID string
	UserID string
	Seq    int64
	Kind   string // "delivered" | "read"
}

// RecordReceipt is idempotent because the cursor is monotonic: a replayed
// or out-of-order ack can only be a no-op.
func (s *MessageService) RecordReceipt(ctx context.Context, req ReceiptRequest) error {
	column := "delivered_up_to"
	if req.Kind == "read" {
		column = "read_up_to"
	}

	query := fmt.Sprintf(`
		INSERT INTO read_cursors (conv_id, user_id, %[1]s, updated_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (conv_id, user_id) DO UPDATE
		  SET %[1]s = GREATEST(read_cursors.%[1]s, EXCLUDED.%[1]s),
		      updated_at = now()
		RETURNING %[1]s, (read_cursors.%[1]s = EXCLUDED.%[1]s) AS applied`, column)

	var cursor int64
	var applied bool
	if err := s.db.QueryRowContext(ctx, query, req.ConvID, req.UserID, req.Seq).
		Scan(&cursor, &applied); err != nil {
		return err
	}

	if !applied {
		return nil // duplicate or stale ack: stay silent
	}

	payload, _ := json.Marshal(map[string]any{
		"convId": req.ConvID, "userId": req.UserID,
		"kind": req.Kind, "cursor": cursor,
	})
	return s.writer.WriteMessages(ctx, kafka.Message{
		Topic: "chat.receipts", Key: []byte(req.ConvID), Value: payload,
	})
}

type Page struct {
	Messages   []StoredMessage `json:"messages"`
	NextCursor *int64          `json:"nextCursor"`
}

// History pages backwards on (conv_id, seq). No OFFSET: the cursor is the seq.
func (s *MessageService) History(ctx context.Context, convID, userID string, beforeSeq *int64, limit int) (*Page, error) {
	var joinedSeq int64
	if err := s.db.QueryRowContext(ctx,
		`SELECT joined_seq FROM conversation_members WHERE conv_id = $1 AND user_id = $2`,
		convID, userID).Scan(&joinedSeq); err != nil {
		return nil, errors.New("not a member")
	}

	if limit <= 0 || limit > 200 {
		limit = 50
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT conv_id, seq, message_id, sender_id, body, created_at
		 FROM messages
		 WHERE conv_id = $1 AND seq >= $2
		   AND ($3::bigint IS NULL OR seq < $3)
		   AND deleted = false
		 ORDER BY seq DESC
		 LIMIT $4`, convID, joinedSeq, beforeSeq, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	page := &Page{Messages: make([]StoredMessage, 0, limit)}
	for rows.Next() {
		var m StoredMessage
		if err := rows.Scan(&m.ConvID, &m.Seq, &m.MessageID, &m.SenderID, &m.Body, &m.CreatedAt); err != nil {
			return nil, err
		}
		page.Messages = append(page.Messages, m)
	}
	if len(page.Messages) == limit {
		last := page.Messages[len(page.Messages)-1].Seq
		page.NextCursor = &last
	}
	return page, nil
}

type BackfillResult struct {
	Messages []StoredMessage `json:"messages"`
	UpToSeq  int64           `json:"upToSeq"`
	HasMore  bool            `json:"hasMore"`
}

func (s *MessageService) Backfill(ctx context.Context, convID, userID string, fromSeq int64, limit int) (*BackfillResult, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT conv_id, seq, message_id, sender_id, body, created_at
		 FROM messages
		 WHERE conv_id = $1 AND seq > $2 AND deleted = false
		 ORDER BY seq ASC
		 LIMIT $3`, convID, fromSeq, limit+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := &BackfillResult{UpToSeq: fromSeq}
	for rows.Next() {
		var m StoredMessage
		if err := rows.Scan(&m.ConvID, &m.Seq, &m.MessageID, &m.SenderID, &m.Body, &m.CreatedAt); err != nil {
			return nil, err
		}
		out.Messages = append(out.Messages, m)
	}
	if len(out.Messages) > limit {
		out.HasMore = true
		out.Messages = out.Messages[:limit]
	}
	if n := len(out.Messages); n > 0 {
		out.UpToSeq = out.Messages[n-1].Seq
	}
	return out, nil
}

// ===========================================
// 4. FAN-OUT WORKER
// ===========================================
type FanoutWorker struct {
	db   *sql.DB
	rdb  *redis.Client
	bus  *NodeBus
	push *PushClient
}

func modeFor(memberCount int) FanoutMode {
	switch {
	case memberCount <= smallGroupMax:
		return FanoutWrite
	case memberCount <= hybridGroupMax:
		return FanoutHybrid
	default:
		return FanoutRead
	}
}

func (w *FanoutWorker) Handle(ctx context.Context, msg StoredMessage) error {
	var memberCount int
	if err := w.db.QueryRowContext(ctx,
		`SELECT member_count FROM conversations WHERE conv_id = $1`,
		msg.ConvID).Scan(&memberCount); err != nil {
		return err
	}
	mode := modeFor(memberCount)

	// Large channel: publish a tail pointer, let readers pull.
	if mode == FanoutRead {
		w.rdb.Set(ctx, "tail:conv:"+msg.ConvID, msg.Seq, 24*time.Hour)
		return w.bus.BroadcastConversationTail(ctx, msg.ConvID, msg.Seq)
	}

	rows, err := w.db.QueryContext(ctx,
		`SELECT user_id, muted FROM conversation_members WHERE conv_id = $1`, msg.ConvID)
	if err != nil {
		return err
	}
	defer rows.Close()

	frame, _ := json.Marshal(map[string]any{"t": "msg", "message": msg})

	for rows.Next() {
		var userID string
		var muted bool
		if err := rows.Scan(&userID, &muted); err != nil {
			return err
		}
		if userID == msg.SenderID {
			continue
		}

		locations, _ := w.rdb.HGetAll(ctx, "conn:user:"+userID).Result()

		if len(locations) > 0 {
			for _, val := range locations {
				node := val
				for i := 0; i < len(val); i++ {
					if val[i] == ':' {
						node = val[:i]
						break
					}
				}
				_ = w.bus.Route(ctx, node, userID, frame)
			}
			if mode == FanoutWrite {
				_, _ = w.db.ExecContext(ctx,
					`INSERT INTO inbox (user_id, conv_id, seq) VALUES ($1, $2, $3)
					 ON CONFLICT DO NOTHING`, userID, msg.ConvID, msg.Seq)
			}
			continue
		}

		// Offline path.
		if mode == FanoutWrite {
			_, _ = w.db.ExecContext(ctx,
				`INSERT INTO inbox (user_id, conv_id, seq) VALUES ($1, $2, $3)
				 ON CONFLICT DO NOTHING`, userID, msg.ConvID, msg.Seq)
		}
		if !muted {
			_ = w.push.Enqueue(ctx, userID, msg)
		}
	}
	return rows.Err()
}
```

</div>
</CodeTabs>

## Presence — সবচেয়ে দামি সস্তা ফিচার

### সমস্যাটা fan-out, state নয়

"কে অনলাইন" এই তথ্যটা রাখা তুচ্ছ — একটা Redis key, TTL সহ, ব্যস। খরচটা তথ্যে নয়, **তথ্য বিতরণে**।

ধরুন ইবনে সিনার contact list-এ ২০০ জন আছে, আর সেই ২০০ জনের প্রত্যেকের list-এও ইবনে সিনা আছেন। ইবনে সিনা online হলে ২০০টা notification যায়। এখন ৩০ লাখ ইউজার একসাথে online — সকাল ৯টায় শহর জেগে ওঠার সময় ঠিক এটাই ঘটে। ৩০ লাখ গুণ ২০০ = ৬০ কোটি notification, কয়েক মিনিটের মধ্যে। মেসেজের চেয়ে এটা কয়েকশো গুণ বেশি ট্রাফিক, অথচ ফিচারটা একটা সবুজ ডট।

এই বিস্ফোরণটাকে বলা হয় presence-এর quadratic fan-out — সম্পর্কের সংখ্যা ইউজারসংখ্যার বর্গের সাথে বাড়ে, আর প্রতিটা status পরিবর্তন সেই সম্পর্কগুলো ধরে ছড়ায়।

### তিনটা কৌশল

**Subscription scoping** — সবচেয়ে বড় জয়টা এখানেই। ক্লায়েন্ট তার পুরো contact list-এর presence subscribe করে না, শুধু **যা এই মুহূর্তে স্ক্রিনে দেখা যাচ্ছে** তার। চ্যাট লিস্টে ২০টা conversation দৃশ্যমান মানে ২০টা subscription, ২০০ নয়। স্ক্রল করলে subscription বদলায়। এতে fan-out এক লাফে ১০ গুণ কমে।

**Coalescing/debounce** — status পরিবর্তন সাথে সাথে পাঠানো হয় না। Presence service প্রতি ৫ সেকেন্ডে একবার জমা হওয়া সব পরিবর্তন একসাথে ব্যাচ করে পাঠায়। ইবনে সিনা যদি টানেলে ঢুকে ১০ সেকেন্ডে তিনবার offline-online করেন, subscriber-রা তিনটার বদলে একটা আপডেট পান। ব্যস্ত সময়ে এটা ৭০% পর্যন্ত event কমায়।

**Grace period** — socket বন্ধ হওয়া মানেই offline নয়। TTL ৪৫ সেকেন্ড রাখা হয়, তাই ছোট নেটওয়ার্ক ব্যাঘাতে সবুজ ডট নিভে-জ্বলে ঝিলিক দেয় না। এই বিলম্বটা bug নয়, ফিচার।

<Callout type="info">

Presence-এর জন্য কড়া consistency দাবি করবেন না। "ইবনে সিনা online" তথ্যটা ৩০ সেকেন্ড পুরনো হলে ব্যবহারকারীর কিছুই যায় আসে না — কিন্তু সেটা রিয়েল-টাইম করতে গেলে ট্রাফিক দশগুণ বাড়ে এবং একটা সম্পূর্ণ নতুন ব্যর্থতার উৎস তৈরি হয়। এটাই চ্যাপ্টার ১০-এর eventual consistency-র সবচেয়ে খাঁটি ব্যবহার।

</Callout>

### Typing indicator

Typing indicator হলো presence-এরই ছোট ভাই, তবে আরও কঠোর নিয়মে: এটা কখনোই persist করা হয় না, কোনো queue-তে যায় না, retry হয় না। সরাসরি gateway থেকে gateway-তে, best-effort। হারালে হারাক — তিন সেকেন্ড পরে এমনিতেই মেয়াদ শেষ। Typing indicator-কে durable করার চেষ্টা করা মানে একটা ক্ষণস্থায়ী সংকেতের পেছনে স্থায়ী storage খরচ করা।

### Presence service ও resume backfill — বাস্তবায়ন

<CodeTabs tsFile="presence-service.ts" goFile="presence-service.go">
<div class="ct-panel ct-active" data-lang="ts">

```typescript
import { RedisClientType } from 'redis';

// ===========================================
// 1. CONFIG
// ===========================================
const PRESENCE_TTL_SECONDS = 45; // grace period: outlives one missed heartbeat
const COALESCE_WINDOW_MS = 5_000;
const MAX_SUBSCRIPTIONS_PER_USER = 500;

type PresenceState = 'online' | 'offline';

interface PresenceChange {
	userId: string;
	state: PresenceState;
	lastSeenAt: number;
}

// ===========================================
// 2. PRESENCE SERVICE
// ===========================================
// Storage is trivial: one TTL key per user. The expensive part is deciding
// who hears about a change, and how often.
class PresenceService {
	// Pending changes waiting for the next coalesce flush.
	private pending = new Map<string, PresenceChange>();
	private flusher: ReturnType<typeof setInterval>;

	constructor(
		private redis: RedisClientType,
		private nodeBus: NodeBus
	) {
		this.flusher = setInterval(() => void this.flush(), COALESCE_WINDOW_MS);
	}

	private stateKey(userId: string): string {
		return `presence:${userId}`;
	}

	// Subscribers of a user, stored as a set of "nodeId|watcherId".
	private watchersKey(userId: string): string {
		return `presence:watchers:${userId}`;
	}

	// --- Called on every gateway heartbeat. Cheap: one SETEX.
	async heartbeat(userId: string): Promise<void> {
		const key = this.stateKey(userId);
		const wasOnline = await this.redis.exists(key);
		await this.redis.setEx(key, PRESENCE_TTL_SECONDS, String(Date.now()));

		// Only an actual transition is worth broadcasting.
		if (!wasOnline) {
			this.enqueueChange({ userId, state: 'online', lastSeenAt: Date.now() });
		}
	}

	// --- Explicit offline (app backgrounded, user logged out).
	async markOffline(userId: string): Promise<void> {
		const removed = await this.redis.del(this.stateKey(userId));
		if (removed) {
			this.enqueueChange({ userId, state: 'offline', lastSeenAt: Date.now() });
		}
	}

	// --- A watcher subscribes only to what is on screen right now.
	async subscribe(watcherId: string, nodeId: string, targetIds: string[]): Promise<void> {
		const scoped = targetIds.slice(0, MAX_SUBSCRIPTIONS_PER_USER);
		const member = `${nodeId}|${watcherId}`;

		const multi = this.redis.multi();
		// Replace, do not append: scrolling changes the visible window.
		multi.del(`presence:subs:${watcherId}`);
		for (const target of scoped) {
			multi.sAdd(this.watchersKey(target), member);
			multi.expire(this.watchersKey(target), 3600);
			multi.sAdd(`presence:subs:${watcherId}`, target);
		}
		multi.expire(`presence:subs:${watcherId}`, 3600);
		await multi.exec();
	}

	async unsubscribeAll(watcherId: string, nodeId: string): Promise<void> {
		const targets = await this.redis.sMembers(`presence:subs:${watcherId}`);
		const member = `${nodeId}|${watcherId}`;
		const multi = this.redis.multi();
		for (const target of targets) {
			multi.sRem(this.watchersKey(target), member);
		}
		multi.del(`presence:subs:${watcherId}`);
		await multi.exec();
	}

	// --- Point-in-time read, used when a client first opens a list.
	async snapshot(userIds: string[]): Promise<Record<string, PresenceState>> {
		if (userIds.length === 0) return {};
		const keys = userIds.map((id) => this.stateKey(id));
		const values = await this.redis.mGet(keys);
		const out: Record<string, PresenceState> = {};
		userIds.forEach((id, i) => {
			out[id] = values[i] ? 'online' : 'offline';
		});
		return out;
	}

	// --- Coalescing. Repeated flaps inside one window collapse to one update.
	private enqueueChange(change: PresenceChange): void {
		this.pending.set(change.userId, change);
	}

	private async flush(): Promise<void> {
		if (this.pending.size === 0) return;
		const batch = [...this.pending.values()];
		this.pending.clear();

		// Group deliveries by gateway node so each node receives one frame
		// carrying many changes, instead of many frames carrying one each.
		const perNode = new Map<string, Map<string, PresenceChange[]>>();

		for (const change of batch) {
			const watchers = await this.redis.sMembers(this.watchersKey(change.userId));
			for (const w of watchers) {
				const [nodeId, watcherId] = w.split('|');
				let nodeMap = perNode.get(nodeId);
				if (!nodeMap) {
					nodeMap = new Map();
					perNode.set(nodeId, nodeMap);
				}
				const list = nodeMap.get(watcherId) ?? [];
				list.push(change);
				nodeMap.set(watcherId, list);
			}
		}

		for (const [nodeId, watcherMap] of perNode) {
			for (const [watcherId, changes] of watcherMap) {
				await this.nodeBus.route(nodeId, watcherId, {
					t: 'presence_update',
					changes
				});
			}
		}

		console.log(`[PRESENCE] flushed ${batch.length} changes to ${perNode.size} nodes`);
	}

	// --- Typing: best effort, never persisted, never retried.
	async typing(convId: string, userId: string, memberNodes: string[]): Promise<void> {
		for (const nodeId of memberNodes) {
			void this.nodeBus.broadcast(nodeId, {
				t: 'typing',
				convId,
				userId,
				expiresInMs: 3000
			});
		}
	}

	stop(): void {
		clearInterval(this.flusher);
	}
}

// ===========================================
// 3. RESUME COORDINATOR
// ===========================================
// After a reconnect the client says, per conversation, "I have up to seq N".
// The coordinator returns the gap, capped, oldest first, plus a flag telling
// the client to fall back to a full history load if it drifted too far.
interface ResumeCursor {
	convId: string;
	haveUpToSeq: number;
}

const MAX_BACKFILL_PER_CONV = 200;
const RESYNC_THRESHOLD = 1000;

class ResumeCoordinator {
	constructor(
		private messages: MessageService,
		private redis: RedisClientType
	) {}

	async resume(
		userId: string,
		cursors: ResumeCursor[]
	): Promise<{
		conversations: Array<{
			convId: string;
			messages: unknown[];
			upToSeq: number;
			needsFullResync: boolean;
		}>;
	}> {
		const results = [];

		for (const cursor of cursors.slice(0, 200)) {
			// The conversation tail is cached, so a conversation with no gap
			// costs a single Redis read instead of a database query.
			const tailRaw = await this.redis.get(`tail:conv:${cursor.convId}`);
			const tail = tailRaw ? parseInt(tailRaw, 10) : cursor.haveUpToSeq;

			if (tail <= cursor.haveUpToSeq) {
				results.push({
					convId: cursor.convId,
					messages: [],
					upToSeq: cursor.haveUpToSeq,
					needsFullResync: false
				});
				continue;
			}

			// Drifted too far: replaying thousands of messages over a mobile
			// link is worse than telling the client to reload the tail.
			if (tail - cursor.haveUpToSeq > RESYNC_THRESHOLD) {
				results.push({
					convId: cursor.convId,
					messages: [],
					upToSeq: cursor.haveUpToSeq,
					needsFullResync: true
				});
				continue;
			}

			const batch = await this.messages.backfill(
				cursor.convId,
				userId,
				cursor.haveUpToSeq,
				MAX_BACKFILL_PER_CONV
			);
			results.push({
				convId: cursor.convId,
				messages: batch.messages,
				upToSeq: batch.upToSeq,
				needsFullResync: false
			});
		}

		return { conversations: results };
	}
}

export { PresenceService, ResumeCoordinator };
```

</div>
<div class="ct-panel" data-lang="go">

```go
package main

import (
	"context"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// ===========================================
// 1. CONFIG
// ===========================================
const (
	presenceTTL          = 45 * time.Second
	coalesceWindow       = 5 * time.Second
	maxSubsPerUser       = 500
	maxBackfillPerConv   = 200
	resyncThreshold      = 1000
)

type PresenceState string

const (
	StateOnline  PresenceState = "online"
	StateOffline PresenceState = "offline"
)

type PresenceChange struct {
	UserID     string        `json:"userId"`
	State      PresenceState `json:"state"`
	LastSeenAt int64         `json:"lastSeenAt"`
}

// ===========================================
// 2. PRESENCE SERVICE
// ===========================================
type PresenceService struct {
	rdb *redis.Client
	bus *NodeBus

	mu      sync.Mutex
	pending map[string]PresenceChange
	stop    chan struct{}
}

func NewPresenceService(rdb *redis.Client, bus *NodeBus) *PresenceService {
	p := &PresenceService{
		rdb: rdb, bus: bus,
		pending: make(map[string]PresenceChange),
		stop:    make(chan struct{}),
	}
	go p.flushLoop()
	return p
}

func stateKey(userID string) string    { return "presence:" + userID }
func watchersKey(userID string) string { return "presence:watchers:" + userID }
func subsKey(watcherID string) string  { return "presence:subs:" + watcherID }

// Heartbeat is called on every gateway ping. Only a real transition is queued
// for broadcast; a steady stream of pings produces no traffic at all.
func (p *PresenceService) Heartbeat(ctx context.Context, userID string) error {
	key := stateKey(userID)
	existed, err := p.rdb.Exists(ctx, key).Result()
	if err != nil {
		return err
	}
	if err := p.rdb.Set(ctx, key, time.Now().UnixMilli(), presenceTTL).Err(); err != nil {
		return err
	}
	if existed == 0 {
		p.enqueue(PresenceChange{UserID: userID, State: StateOnline, LastSeenAt: time.Now().UnixMilli()})
	}
	return nil
}

func (p *PresenceService) MarkOffline(ctx context.Context, userID string) error {
	removed, err := p.rdb.Del(ctx, stateKey(userID)).Result()
	if err != nil {
		return err
	}
	if removed > 0 {
		p.enqueue(PresenceChange{UserID: userID, State: StateOffline, LastSeenAt: time.Now().UnixMilli()})
	}
	return nil
}

// Subscribe replaces the watcher's window. Scrolling a chat list changes what
// is visible, and only what is visible should generate presence traffic.
func (p *PresenceService) Subscribe(ctx context.Context, watcherID, nodeID string, targets []string) error {
	if len(targets) > maxSubsPerUser {
		targets = targets[:maxSubsPerUser]
	}
	member := nodeID + "|" + watcherID

	pipe := p.rdb.TxPipeline()
	pipe.Del(ctx, subsKey(watcherID))
	for _, t := range targets {
		pipe.SAdd(ctx, watchersKey(t), member)
		pipe.Expire(ctx, watchersKey(t), time.Hour)
		pipe.SAdd(ctx, subsKey(watcherID), t)
	}
	pipe.Expire(ctx, subsKey(watcherID), time.Hour)
	_, err := pipe.Exec(ctx)
	return err
}

func (p *PresenceService) UnsubscribeAll(ctx context.Context, watcherID, nodeID string) error {
	targets, err := p.rdb.SMembers(ctx, subsKey(watcherID)).Result()
	if err != nil {
		return err
	}
	member := nodeID + "|" + watcherID
	pipe := p.rdb.TxPipeline()
	for _, t := range targets {
		pipe.SRem(ctx, watchersKey(t), member)
	}
	pipe.Del(ctx, subsKey(watcherID))
	_, err = pipe.Exec(ctx)
	return err
}

func (p *PresenceService) Snapshot(ctx context.Context, userIDs []string) (map[string]PresenceState, error) {
	out := make(map[string]PresenceState, len(userIDs))
	if len(userIDs) == 0 {
		return out, nil
	}
	keys := make([]string, len(userIDs))
	for i, id := range userIDs {
		keys[i] = stateKey(id)
	}
	vals, err := p.rdb.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}
	for i, id := range userIDs {
		if vals[i] != nil {
			out[id] = StateOnline
		} else {
			out[id] = StateOffline
		}
	}
	return out, nil
}

func (p *PresenceService) enqueue(c PresenceChange) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.pending[c.UserID] = c // last write wins inside the window
}

func (p *PresenceService) flushLoop() {
	ticker := time.NewTicker(coalesceWindow)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			p.flush(context.Background())
		case <-p.stop:
			return
		}
	}
}

// flush groups changes by gateway node, so each node gets one frame with many
// changes rather than many frames with one change each.
func (p *PresenceService) flush(ctx context.Context) {
	p.mu.Lock()
	if len(p.pending) == 0 {
		p.mu.Unlock()
		return
	}
	batch := make([]PresenceChange, 0, len(p.pending))
	for _, c := range p.pending {
		batch = append(batch, c)
	}
	p.pending = make(map[string]PresenceChange)
	p.mu.Unlock()

	type target struct{ node, watcher string }
	grouped := make(map[target][]PresenceChange)

	for _, change := range batch {
		watchers, err := p.rdb.SMembers(ctx, watchersKey(change.UserID)).Result()
		if err != nil {
			continue
		}
		for _, w := range watchers {
			parts := strings.SplitN(w, "|", 2)
			if len(parts) != 2 {
				continue
			}
			k := target{node: parts[0], watcher: parts[1]}
			grouped[k] = append(grouped[k], change)
		}
	}

	for k, changes := range grouped {
		_ = p.bus.RouteJSON(ctx, k.node, k.watcher, map[string]any{
			"t": "presence_update", "changes": changes,
		})
	}
	log.Printf("[PRESENCE] flushed %d changes to %d watchers", len(batch), len(grouped))
}

// Typing is fire-and-forget: never stored, never retried, expires by itself.
func (p *PresenceService) Typing(ctx context.Context, convID, userID string, nodes []string) {
	for _, node := range nodes {
		_ = p.bus.Broadcast(ctx, node, map[string]any{
			"t": "typing", "convId": convID, "userId": userID, "expiresInMs": 3000,
		})
	}
}

func (p *PresenceService) Stop() { close(p.stop) }

// ===========================================
// 3. RESUME COORDINATOR
// ===========================================
type ResumeCursor struct {
	ConvID      string `json:"convId"`
	HaveUpToSeq int64  `json:"haveUpToSeq"`
}

type ResumedConversation struct {
	ConvID          string          `json:"convId"`
	Messages        []StoredMessage `json:"messages"`
	UpToSeq         int64           `json:"upToSeq"`
	NeedsFullResync bool            `json:"needsFullResync"`
}

type ResumeCoordinator struct {
	msg *MessageService
	rdb *redis.Client
}

func (rc *ResumeCoordinator) Resume(ctx context.Context, userID string, cursors []ResumeCursor) ([]ResumedConversation, error) {
	if len(cursors) > 200 {
		cursors = cursors[:200]
	}
	out := make([]ResumedConversation, 0, len(cursors))

	for _, cur := range cursors {
		// A conversation with no gap costs one Redis read, not a DB query.
		tail := cur.HaveUpToSeq
		if raw, err := rc.rdb.Get(ctx, "tail:conv:"+cur.ConvID).Result(); err == nil {
			if v, convErr := strconv.ParseInt(raw, 10, 64); convErr == nil {
				tail = v
			}
		}

		if tail <= cur.HaveUpToSeq {
			out = append(out, ResumedConversation{ConvID: cur.ConvID, UpToSeq: cur.HaveUpToSeq})
			continue
		}

		// Too far behind: a full reload beats replaying thousands of frames.
		if tail-cur.HaveUpToSeq > resyncThreshold {
			out = append(out, ResumedConversation{
				ConvID: cur.ConvID, UpToSeq: cur.HaveUpToSeq, NeedsFullResync: true,
			})
			continue
		}

		batch, err := rc.msg.Backfill(ctx, cur.ConvID, userID, cur.HaveUpToSeq, maxBackfillPerConv)
		if err != nil {
			return nil, err
		}
		out = append(out, ResumedConversation{
			ConvID: cur.ConvID, Messages: batch.Messages, UpToSeq: batch.UpToSeq,
		})
	}
	return out, nil
}
```

</div>
</CodeTabs>

## History ও pagination

### Cursor pagination, OFFSET নয়

চ্যাট history স্ক্রল করা মানে সবসময় "এই পয়েন্টের আগের ৫০টা"। `OFFSET` দিয়ে করলে গভীরে গেলে ডেটাবেসকে বাতিল করা row-গুলোও পড়তে হয় — ৫০ হাজার মেসেজের conversation-এ শুরুর দিকে পৌঁছাতে গেলে scan-ই কয়েক লক্ষ row। তার উপর নতুন মেসেজ এলে offset সরে যায় এবং ব্যবহারকারী একই মেসেজ দুবার দেখেন।

`(conv_id, seq)` primary key থাকায় cursor pagination প্রায় বিনামূল্যে — conversation ঠিক করে, cursor seq-এর চেয়ে ছোট row-গুলো থেকে seq অনুযায়ী উল্টো ক্রমে ৫০টা নাও:

```sql
-- Backward page. The cursor IS the seq, so there is no OFFSET to scan past.
SELECT conv_id, seq, message_id, sender_id, body, created_at
FROM messages
WHERE conv_id = $1 AND seq < $2 AND deleted = false
ORDER BY seq DESC
LIMIT 50;
```

Index-এ একটা seek, তারপর ৫০টা sequential row। Conversation যত বড়ই হোক, খরচ এক।

### Hot tail বনাম cold archive

মেসেজ অ্যাক্সেস প্যাটার্ন চরমভাবে অসম: প্রায় সব পড়া হয় সর্বশেষ কয়েকশো মেসেজে, আর তিন মাসের পুরনো মেসেজে বছরে দু-একবার হাত পড়ে। তাই storage-ও দুই স্তরে ভাগ করা যুক্তিসঙ্গত।

| স্তর         | কী থাকে                           | কোথায়                              | Latency লক্ষ্য            |
| ------------ | --------------------------------- | ----------------------------------- | ------------------------- |
| Hot tail     | শেষ ~৫০০ মেসেজ প্রতি conversation | Redis / in-memory cache             | ৫ ms                      |
| Warm         | শেষ ৯০ দিন                        | প্রধান cluster, SSD                 | ৩০ ms                     |
| Cold archive | তার চেয়ে পুরনো                   | object storage, চাপা-দেওয়া segment | ৫০০ ms পর্যন্ত গ্রহণযোগ্য |

Cold স্তরে যাওয়া রিকোয়েস্ট মোট রিকোয়েস্টের ০.১%-এরও কম, তাই সেখানে ধীর হওয়া SLO ভাঙে না — কিন্তু খরচ দশ গুণ কমায় (চ্যাপ্টার ২৩-এর cost engineering)।

### Partitioning

```sql
-- Partition by conversation hash. Every read for one conversation touches
-- exactly one partition, so history queries never fan out across the cluster.
CREATE TABLE messages (
  conv_id     UUID   NOT NULL,
  seq         BIGINT NOT NULL,
  message_id  UUID   NOT NULL,
  sender_id   UUID   NOT NULL,
  body        TEXT   NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conv_id, seq)
) PARTITION BY HASH (conv_id);

CREATE TABLE messages_p00 PARTITION OF messages FOR VALUES WITH (MODULUS 64, REMAINDER 0);
CREATE TABLE messages_p01 PARTITION OF messages FOR VALUES WITH (MODULUS 64, REMAINDER 1);
-- ... 64 partitions total

-- Cold-archive candidates: everything below the tail window, per conversation.
CREATE VIEW archivable_messages AS
SELECT m.conv_id, m.seq
FROM messages m
JOIN conversations c ON c.conv_id = m.conv_id
WHERE m.seq < c.next_seq - 500
  AND m.created_at < now() - INTERVAL '90 days';
```

<Callout type="warning">

Partition key হিসেবে `user_id` বেছে নেওয়ার লোভ সামলান। মনে হয় এতে "আমার সব মেসেজ" এক জায়গায় আসবে, কিন্তু বাস্তবে প্রতিটা group conversation তখন সব সদস্যের partition জুড়ে ছড়িয়ে পড়ে, আর একটা conversation পড়তে গিয়ে গোটা cluster-এ scatter-gather করতে হয়। ব্যবহারকারী conversation ধরে পড়ে, ইউজার ধরে নয় — partition key সেটাই অনুসরণ করা উচিত।

</Callout>

## Push notification — offline পথ

### কখন push, কখন নয়

নিয়মটা সরল কিন্তু এর প্রয়োগে সবচেয়ে বেশি bug হয়: **socket যদি মেসেজটা ডেলিভার করতে পারে, push পাঠাবেন না।** Fan-out worker registry-তে দেখে; entry থাকলে socket path, না থাকলে push path।

সমস্যা হলো এই দুটো পথ race করে। ইবনে সিনা মেসেজ পাওয়ার ঠিক ২০ মিলিসেকেন্ড আগে ফোন লক করলেন — registry বলল online, frame পাঠানো হলো, কিন্তু socket ততক্ষণে মরে গেছে। মেসেজ কোথাও পৌঁছাল না, push-ও গেল না।

তাই push সিদ্ধান্তটা fan-out-এর মুহূর্তে চূড়ান্ত না করে **বিলম্বিত** করা হয়: worker push job-টা একটা delayed queue-তে ফেলে, ৫ সেকেন্ড পরে চালু হওয়ার শর্তে। ৫ সেকেন্ড পরে job জেগে উঠে দেখে ওই ইউজারের `delivered_up_to` cursor ওই seq পেরিয়ে গেছে কিনা। পেরিয়ে গেলে push বাতিল; না পেরোলে push যায়। এতে দুই পথের race একটা সস্তা চেকে মিটে যায়।

### Dedupe এবং badge

Push payload-এ conversation id আর seq থাকে, তাই ক্লায়েন্ট notification আর socket frame দুটোই পেলে seq দেখে বুঝে নেয় এটা একই মেসেজ এবং একটাই দেখায়। Badge count আলাদা করে গোনা হয় না — cursor থেকে বিয়োগ করে বের করা মোট unread সংখ্যাটা push payload-এই পাঠানো হয়, তাই ডিভাইসের badge কখনো drift করে না, এমনকি কয়েকটা notification হারালেও।

```sql
-- Push eligibility check, run when the delayed job fires.
-- Returns rows only for messages the socket path failed to deliver.
SELECT m.conv_id, m.seq, m.sender_id
FROM messages m
JOIN conversation_members cm
  ON cm.conv_id = m.conv_id AND cm.user_id = $1
LEFT JOIN read_cursors rc
  ON rc.conv_id = m.conv_id AND rc.user_id = $1
WHERE m.conv_id = $2
  AND m.seq = $3
  AND cm.muted = false
  AND COALESCE(rc.delivered_up_to, 0) < m.seq;
```

<Callout type="tip">

Push notification-কে delivery receipt হিসেবে ধরবেন না। APNs বা FCM "accepted" বলার মানে হলো তাদের সিস্টেম payload-টা নিয়েছে — ডিভাইসে দেখানো হয়েছে এমন নয়, ব্যবহারকারী দেখেছেন তো নয়ই। `delivered` state কেবল তখনই লেখা হবে যখন ডিভাইস নিজে ack পাঠায়।

</Callout>

## Mobile reconnection

<Mermaid
title="Reconnect and Resume Flow"
code={`graph TD
  D["Socket dies<br/>tunnel, app background, node restart"] --> B["Backoff timer<br/>base 1s, cap 60s, full jitter"]
  B --> C["Reconnect<br/>new gateway node"]
  C --> H["hello frame<br/>token + deviceId"]
  H --> R["resume frame<br/>per conversation haveUpToSeq"]
  R --> T["Tail check<br/>cached tail seq per conversation"]
  T --> NG["No gap<br/>nothing to send"]
  T --> SG["Small gap<br/>backfill up to 200 msgs"]
  T --> LG["Large gap<br/>needsFullResync flag"]
  SG --> AP["Client applies in seq order<br/>dedupes by messageId"]
  LG --> RL["Client drops local tail<br/>reloads newest page"]
  AP --> ACK["Client acks delivered_up_to"]
  RL --> ACK`}
/>

### Resume protocol

Reconnect-এ ক্লায়েন্ট একটা তালিকা পাঠায় — প্রতিটা সক্রিয় conversation-এর জন্য "আমার কাছে এই seq পর্যন্ত আছে"। সার্ভার প্রতিটার জন্য তিনটার একটা সিদ্ধান্ত নেয়: কোনো ফাঁক নেই (কিছু পাঠানোর দরকার নেই), ছোট ফাঁক (backfill), বা বিশাল ফাঁক (full resync-এর নির্দেশ)।

শেষ ক্ষেত্রটা গুরুত্বপূর্ণ। কেউ দুই সপ্তাহ পর অ্যাপ খুললে তার ৫০টা conversation-এ মোট হয়তো ৩০ হাজার মেসেজ জমেছে। সেগুলো frame করে মোবাইল লিংকে পাঠানো মানে কয়েক মেগাবাইট এবং কয়েক মিনিটের কাজ, অথচ ব্যবহারকারী শুধু সর্বশেষ স্ক্রিনটাই দেখতে চান। এক হাজারের বেশি ফাঁক হলে সার্ভার তাই backfill না করে বলে দেয় — "local tail ফেলে দাও, নতুন করে শেষ পাতাটা লোড করো।"

### Backoff, এবং thundering herd

একটা gateway node restart করলে তার ১০ হাজার ক্লায়েন্ট একই মুহূর্তে disconnect হয়। যদি সবাই ঠিক ১ সেকেন্ড পরে reconnect করে, তাহলে বাকি fleet একসাথে ১০ হাজার TLS handshake, ১০ হাজার auth কল আর ১০ হাজার resume রিকোয়েস্ট খায়। ৫০০ node-এর একটা rolling deploy-এ এই ধাক্কা পুরো fleet-কে ধসিয়ে দিতে পারে — একটা node-এর restart পাশের node-কে ওভারলোড করে, সেটা মরে, তার ক্লায়েন্টরা আবার ছড়ায়। এটাই retry storm-এর সবচেয়ে ক্লাসিক রূপ।

দুটো প্রতিকার একসাথে লাগে।

**Full jitter backoff** — অপেক্ষার সময়টা `random(0, min(cap, base * 2^attempt))`. খেয়াল করুন এটা "exponential-এর সাথে একটু jitter যোগ" নয়; পুরো ব্যবধানটাই random। এতে reconnect-গুলো সময়ের উপর সমানভাবে ছড়িয়ে পড়ে, শিখর তৈরি করে না।

**Staggered shutdown** — সার্ভার নিজে থেকে ১০ হাজার socket একসাথে বন্ধ না করে ১৫ সেকেন্ড ধরে ছড়িয়ে বন্ধ করে (উপরের gateway কোডে যা করা হয়েছে)। ক্লায়েন্টের jitter-এর আগেই সার্ভার-সাইড ছড়ানো শুরু হয়ে যায়।

```typescript
// Full jitter, not "exponential plus a little noise".
function nextBackoffMs(attempt: number): number {
	const base = 1000;
	const cap = 60_000;
	const window = Math.min(cap, base * Math.pow(2, attempt));
	return Math.floor(Math.random() * window);
}

// Reconnect budget: give up on the socket and fall back to polling
// only after the network has clearly been gone for a long time.
const MAX_RECONNECT_ATTEMPTS = 12;
```

সাথে **connection-level rate limit** রাখুন gateway-তে: প্রতি node প্রতি সেকেন্ডে সর্বোচ্চ কতগুলো নতুন handshake গ্রহণ করবে তার একটা ছাদ। ছাদ ছুঁলে node `503` দিয়ে ফিরিয়ে দেয়, ক্লায়েন্ট আবার backoff করে। চ্যাপ্টার ১৮-এর back-pressure-এর নীতি এখানে হুবহু প্রযোজ্য — লোড ফেরানোর চেয়ে ধরে রেখে মরে যাওয়া অনেক খারাপ।

## Failure mode এবং trade-off

### কী ভাঙে, আর কী হয়

| ব্যর্থতা                             | তাৎক্ষণিক প্রভাব                          | প্রশমন                                                                       |
| ------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------- |
| একটা gateway node মরে                | ১০ হাজার ক্লায়েন্ট disconnect            | Jittered reconnect, registry TTL নিজে থেকেই entry মোছে                       |
| Connection registry (Redis) অনুপলব্ধ | Fan-out কাউকে খুঁজে পায় না               | সবাইকে offline ধরে push path; মেসেজ persist হতেই থাকে, শুধু real-time হারায় |
| Kafka lag বাড়ে                      | Send ack স্বাভাবিক, delivery পিছিয়ে যায় | Sender ack fan-out-এর আগে দেওয়া হয় বলেই এটা degradation, outage নয়        |
| Seq allocator (Redis counter) হারায় | নতুন মেসেজে seq সংঘর্ষ                    | DB-র unique index write আটকায়, allocator re-seed হয়, retry সফল হয়         |
| Message store partition ধীর          | ওই conversation-গুলোর history ধীর         | Hot tail cache বেশিরভাগ পড়াকে বাঁচিয়ে দেয়                                 |
| Presence service মরে                 | সবুজ ডট জমে যায় বা মিলিয়ে যায়          | কোনো মেসেজ প্রভাবিত হয় না — presence ইচ্ছে করেই মূল পথের বাইরে              |
| Push provider (APNs) ডাউন            | Offline ইউজার notification পান না         | Delayed queue-তে retry; মেসেজ persist আছে, খোলার সময় দেখা যাবে              |
| Rolling deploy                       | Reconnect storm                           | Staggered close + full jitter + per-node handshake rate limit                |

### যে সিদ্ধান্তগুলো ইচ্ছে করে নেওয়া হয়েছে

**Sender-কে fan-out-এর আগে ack দেওয়া** — এতে send latency fan-out-এর আকার থেকে স্বাধীন হয়, কিন্তু sender "sent" দেখার পরেও প্রাপকের কাছে পৌঁছাতে কয়েকশো মিলিসেকেন্ড লাগতে পারে। এটা গ্রহণযোগ্য কারণ UI-তে "sent" আর "delivered" আলাদা টিক — ব্যবহারকারীকে আমরা মিথ্যা বলছি না।

**Presence-কে eventual রাখা** — ৩০ সেকেন্ডের ভুল মেনে নিয়ে আমরা ট্রাফিক দশ গুণ কমিয়েছি। কড়া presence চাইলে fan-out বাজেটই পুরো সিস্টেমের বাজেট খেয়ে ফেলত।

**Per-conversation ordering, global নয়** — ফলে দুটো ভিন্ন conversation-এর মেসেজের মধ্যে কোনো নিশ্চিত ক্রম নেই। ব্যবহারকারী কখনো এটা লক্ষ্যই করেন না, অথচ এই ছাড়টাই ordering-কে scale করতে দেয়।

**Read cursor, per-message receipt নয়** — বিনিময়ে "কে ঠিক কোন মেসেজটা পড়েছে" এমন এলোমেলো প্রশ্নের উত্তর হারিয়ে যায়। বাস্তবে কেউ সেটা জিজ্ঞেস করে না, আর তার বদলে হাজার গুণ storage বাঁচে।

**হাইব্রিড fan-out** — দুটো code path রক্ষণাবেক্ষণ করতে হয়, আর threshold পেরোনোর মুহূর্তে migration যত্ন চায়। বিকল্প ছিল একটাই path বেছে নেওয়া, যা হয় ছোট group-এ ধীর হতো, নয়তো বড় channel-এ দেউলিয়া করত।

<div class="takeaways">

### মূল শেখা

- Gateway node ক্ষণস্থায়ী, connection registry নয় — registry-র availability পুরো সিস্টেমের availability-র ছাদ ঠিক করে দেয়, আর সেটাকে source of truth নয়, hint হিসেবে ব্যবহার করাই নিরাপদ
- Ordering-এর একক conversation, গোটা সিস্টেম নয়; wall clock কখনোই বিশ্বাসযোগ্য নয়, তাই monotonic per-conversation seq আর client-side gap detection মিলেই সঠিক ক্রম দেয়
- Fan-out কোনো একটা কৌশল নয়, একটা থ্রেশহোল্ড — ছোট conversation-এ write-path, বড় channel-এ read-path, মাঝখানে শুধু online সদস্যদের push করাই সবচেয়ে বড় সাশ্রয়
- Read cursor per-message receipt টেবিলকে প্রতি (conversation, user)-এ এক লাইনে নামিয়ে আনে, আর cursor monotonic হওয়ায় receipt নিজে থেকেই idempotent — কোনো dedupe table লাগে না
- Presence-এর খরচ state-এ নয়, বিতরণে; subscription scoping, coalescing আর grace period — এই তিনটাই presence-কে সাশ্রয়ী করে, আর eventual accuracy মেনে নেওয়াটাই সবচেয়ে বড় সিদ্ধান্ত
- Sender-এর ack fan-out-এর আগে দিন — এতে send latency conversation-এর আকার থেকে স্বাধীন থাকে, আর "sent" বনাম "delivered" টিক দিয়ে ব্যবহারকারীকে সত্যিটাই দেখানো হয়
- Reconnect-এর ডিজাইনই মোবাইল চ্যাটের আসল ডিজাইন: resume-from-seq, বড় ফাঁকে full resync, full jitter backoff আর staggered shutdown ছাড়া প্রতিটা deploy একটা mini-outage

</div>

<div class="when-to-use">

### বাস্তবে যেভাবে ব্যবহার হয়

- **WhatsApp** long-lived socket আর server-side queue দিয়ে অল্প সার্ভারে কোটি কোটি connection চালায়; মেসেজ ডেলিভার হয়ে গেলে সার্ভার থেকে মুছে ফেলা হয়, তাই storage-ই বাড়ে না
- **Slack** channel-এর আকার অনুযায়ী কৌশল বদলায় — ছোট channel-এ push fan-out, বিশাল channel-এ ক্লায়েন্ট খোলার সময় pull; unread হিসাব করা হয় per-channel cursor দিয়ে
- **Discord** বিশাল guild-এর জন্য প্রায় পুরোপুরি read-path fan-out ব্যবহার করে এবং presence-কে আলাদা সার্ভিসে সরিয়ে coalesced ব্যাচে ছড়ায় — না হলে এক লাখ সদস্যের সার্ভারে presence-ই সব ব্যান্ডউইথ খেয়ে নিত
- **Signal** end-to-end encryption-এর কারণে সার্ভারে fan-out করে ciphertext, আর ordering ক্লায়েন্ট-সাইড sequence দিয়ে যাচাই হয় — সার্ভার মেসেজের ভেতরটা দেখেই না
- **Telegram** conversation-প্রতি sequence number আর cursor-ভিত্তিক history pagination ব্যবহার করে বহু-ডিভাইস sync করে, তাই নতুন ডিভাইসে লগইন করলে সব ক্রমে ফিরে আসে

</div>
