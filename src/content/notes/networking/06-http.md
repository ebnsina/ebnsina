---
title: 'HTTP/1.1, HTTP/2, এবং HTTP/3'
subtitle: 'ওয়েবের প্রোটোকলের বিবর্তন — টেক্সট-ভিত্তিক request/response থেকে QUIC-এর উপর multiplexed stream পর্যন্ত।'
chapter: 6
level: 'intermediate'
readingTime: '17 মিনিট'
topics: ['HTTP', 'HTTP/2', 'HTTP/3', 'QUIC', 'multiplexing']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

আল-খোয়ারিজমির একটা পার্সেল ডেলিভারি সার্ভিস। শুরুতে নিয়মটা ছিল সহজ — একজন ডেলিভারি বয়, ইবনে সিনা, একটাই সরু গলি দিয়ে একবারে একটা করে পার্সেল হাতে নিয়ে যায়। প্রথম পার্সেলটা পৌঁছে দিয়ে ফিরে না আসা পর্যন্ত পরের পার্সেল ধরাই হয় না। একদিন একটা পার্সেলের ঠিকানা খুঁজে পেতে ইবনে সিনার আধা ঘণ্টা লেগে গেল, আর পেছনে পাঁচটা তৈরি পার্সেল শুধু অপেক্ষা করতে থাকল — যদিও সেগুলো এক মিনিটেই পৌঁছে দেওয়া যেত।

আল-খোয়ারিজমি বুঝল, এভাবে চলবে না। প্রথমে সে ব্যবস্থা বদলাল — ইবনে সিনা এখন একই ট্রিপে অনেকগুলো পার্সেল সাজিয়ে একসাথে নিয়ে যায়, একটার জন্য আরেকটা আটকে থাকে না। কিন্তু সমস্যা হলো, ওই একটাই সরু গলি — গলির মুখে একটা রিকশা উল্টে পড়লে পুরো ট্রিপটাই আটকে যায়, সব পার্সেল একসাথে থেমে থাকে। শেষমেশ আল-খোয়ারিজমি ইবনে সিনাকে একটা চটপটে মোটরসাইকেল কিনে দিল, যেটা এক রাস্তা বন্ধ দেখলেই সঙ্গে সঙ্গে অন্য গলি দিয়ে ঘুরে যায় — একটা পার্সেল আটকালেও বাকিগুলো চলতেই থাকে।

এই গল্পটাই আসলে HTTP-এর বিবর্তন। শুরুর "একবারে এক পার্সেল, আগেরটা শেষ না হলে পরেরটা নয়" — এটাই **HTTP/1.1**-এর **head-of-line blocking**: এক connection-এ একটা ধীর request পুরো লাইন আটকে দেয়। "একই ট্রিপে অনেক পার্সেল একসাথে" — এটাই **HTTP/2**-এর **multiplexing**: একটাই connection-এ অনেক request পাশাপাশি চলে। কিন্তু ওই সরু গলিই হলো TCP — একটা packet হারালে সব stream থেমে যায়। আর চটপটে মোটরসাইকেল, যেটা এক রাস্তা বন্ধ দেখলেই ঘুরে যায়, সেটাই **HTTP/3**, যা **QUIC** (UDP-এর উপর) দিয়ে চলে — একটা stream-এ packet হারালেও বাকি stream স্বাধীনভাবে বয়ে চলে। বাস্তবে এই কারণেই আজ CloudFlare, YouTube, বড় CDN গুলো HTTP/3 চালু করছে — বিশেষ করে মোবাইলে, যেখানে packet হারানো আর নেটওয়ার্ক বদল খুব সাধারণ ব্যাপার।

## HTTP/1.1 — ভিত্তি

HTTP/1.1 টেক্সট-ভিত্তিক এবং সহজ। একটি TCP connection-এর উপর এক request, এক response।

<Callout type="info">

**বাস্তব জীবনের উপমা**

সরকারি অফিসে ফর্ম পূরণ করার মতো — আপনি নির্দিষ্ট ফিল্ড (headers) সহ একটি ফর্ম (request) জমা দেন, প্রসেসিংয়ের জন্য অপেক্ষা করেন, এবং একটি status সহ response পান: "Approved" (200), "Wrong form" (400), "Come back later" (503)।

</Callout>

```typescript
// HTTP/1.1 request (what your browser actually sends)
const request = `GET /api/users HTTP/1.1\r
Host: api.example.com\r
Accept: application/json\r
Connection: keep-alive\r
\r\n`;

// HTTP/1.1 response
const response = `HTTP/1.1 200 OK\r
Content-Type: application/json\r
Content-Length: 27\r
\r
{"users": [{"id": 1}]}`;
```

### সমস্যা: Head-of-Line Blocking

HTTP/1.1 প্রতিটি connection-এ request গুলো **sequentially** প্রসেস করে। যদি request #1 ধীর হয়, তাহলে request #2 এবং #3 তার পেছনে অপেক্ষা করে — এমনকি server সেগুলোর উত্তর সঙ্গে সঙ্গে দিতে পারলেও।

Workaround গুলো (সবগুলোরই নেতিবাচক দিক আছে):

- **Multiple connections** — browser প্রতি domain-এ 6টি parallel connection খোলে (রিসোর্স নষ্ট করে)
- **Domain sharding** — `img1.example.com`, `img2.example.com` থেকে asset সার্ভ করা (DNS overhead)
- **Bundling** — অনেক ফাইল একসাথে জোড়া দেওয়া (আলাদাভাবে cache করা যায় না)

## HTTP/2 — Multiplexing

HTTP/2 একটি **single TCP connection**-এর উপর stream ব্যবহার করে অনেক request multiplex করে head-of-line blocking সমাধান করে।

```typescript
// HTTP/2 sends binary frames, not text
interface HTTP2Frame {
	length: number;
	type: 'HEADERS' | 'DATA' | 'SETTINGS' | 'PUSH_PROMISE' | 'GOAWAY';
	flags: number;
	streamId: number; // which request this frame belongs to
	payload: Uint8Array;
}

// Multiple requests fly simultaneously on one connection:
// Stream 1: GET /api/users     → response body chunk 1
// Stream 3: GET /api/posts     → response body chunk 1
// Stream 1: (continued)        → response body chunk 2
// Stream 5: GET /style.css     → complete response
// Stream 3: (continued)        → response body chunk 2

// No waiting! Responses interleave freely.
```

### HTTP/2-এর মূল ফিচার

```typescript
// 1. Header compression (HPACK)
// Headers like Host, Accept, Cookie repeat on every request
// HPACK compresses them using a shared dictionary
// Reduces header overhead from ~800 bytes to ~20 bytes for repeat requests

// 2. Server Push (mostly deprecated)
// Server can proactively send resources before client asks
// Rarely used in practice — hard to get right

// 3. Stream prioritization
// Client can hint which responses matter most
// Browser: "HTML first, then CSS, then images"
```

<Callout type="info">

**HTTP/2-তেও একটা সমস্যা আছে**: এটি TCP-এর উপর চলে, আর TCP সব stream-কে একটাই byte stream হিসেবে দেখে। যদি একটি TCP packet হারিয়ে যায়, তাহলে সেটি retransmit না হওয়া পর্যন্ত সব stream আটকে থাকে — TCP-level head-of-line blocking।

</Callout>

## HTTP/3 — QUIC

HTTP/3, TCP-কে **QUIC** (UDP-এর উপর তৈরি) দিয়ে প্রতিস্থাপন করে। প্রতিটি stream transport layer-এ স্বাধীন — stream 1-এ একটি হারানো packet, stream 3-কে আটকায় না।

```typescript
// QUIC advantages over TCP:

// 1. Independent streams — no head-of-line blocking
// Lost packet in stream A? Stream B keeps flowing.

// 2. Faster connection setup
// TCP: 1 RTT handshake + 1 RTT TLS = 2 RTT before data
// QUIC: 1 RTT for connection + TLS combined
// QUIC 0-RTT: reconnecting to known server = 0 RTT!

// 3. Connection migration
// TCP connections are tied to (srcIP, srcPort, dstIP, dstPort)
// Switch from WiFi to cellular? TCP connection dies.
// QUIC uses connection IDs — survives network changes.

interface QUICConnection {
	connectionId: Uint8Array; // survives IP changes
	streams: Map<number, QUICStream>;
	tlsState: TLSState; // encryption is built-in, not layered on
}

interface QUICStream {
	id: number;
	state: 'open' | 'half-closed' | 'closed';
	sendBuffer: Uint8Array[];
	recvBuffer: Uint8Array[];
	// Each stream has independent flow control
	// and independent loss recovery
}
```

## প্রোটোকল তুলনা

| ফিচার                | HTTP/1.1          | HTTP/2          | HTTP/3                      |
| -------------------- | ----------------- | --------------- | --------------------------- |
| Transport            | TCP               | TCP             | QUIC (UDP)                  |
| Multiplexing         | নেই (1 req/conn)  | হ্যাঁ (streams) | হ্যাঁ (independent streams) |
| Header format        | Text              | Binary (HPACK)  | Binary (QPACK)              |
| HOL blocking         | Application + TCP | শুধু TCP        | নেই                         |
| Connection setup     | 2-3 RTT           | 2-3 RTT         | 1 RTT (0-RTT reconnect)     |
| Connection migration | নেই               | নেই             | হ্যাঁ                       |

## কী ব্যবহার করবেন

```typescript
// In practice, you don't choose — the browser negotiates.
// Your job is to enable HTTP/2 and HTTP/3 on your server.

// Nginx HTTP/2 config
// listen 443 ssl http2;

// Caddy enables HTTP/2 and HTTP/3 by default
// example.com {
//   reverse_proxy localhost:3000
// }

// Node.js HTTP/2
import http2 from 'node:http2';

const server = http2.createSecureServer({
	key: readFileSync('server.key'),
	cert: readFileSync('server.crt')
});

server.on('stream', (stream, headers) => {
	stream.respond({ ':status': 200, 'content-type': 'text/plain' });
	stream.end('Hello HTTP/2!');
});

server.listen(443);
```

<Callout type="tip">

**বেশিরভাগ ডেভেলপারের জন্য**: আপনার reverse proxy (Nginx, Caddy, CloudFlare)-তে HTTP/2 enable করুন, ব্যস হয়ে গেল। HTTP/3-এর adoption দ্রুত বাড়ছে — CloudFlare এবং বড় CDN গুলো ইতিমধ্যেই এটি সাপোর্ট করে।

</Callout>

## মূল শিক্ষণীয় বিষয়

1. **HTTP/1.1-এর sequential model** bundling এবং domain sharding-এর মতো workaround-এ বাধ্য করেছিল
2. **HTTP/2 stream গুলোকে multiplex করে** একটি TCP connection-এর উপর, কিন্তু এখনও TCP-level HOL blocking আছে
3. **HTTP/3 (QUIC) HOL blocking সম্পূর্ণ দূর করে** UDP-এর উপর independent stream দিয়ে
4. **Connection migration** (QUIC) মোবাইলের জন্য অত্যন্ত গুরুত্বপূর্ণ — WiFi/cellular সুইচিং নির্বিঘ্ন
5. **আপনার reverse proxy-তে HTTP/2+ enable করুন** — application code-এ এটি নিয়ে চিন্তা করবেন না
