---
title: 'WebSockets ও রিয়েল-টাইম'
subtitle: 'একটি single connection-এর উপর full-duplex communication — chat, live update, collaborative editing, আর কখন এগুলো ব্যবহার করা উচিত নয়।'
chapter: 7
level: 'intermediate'
readingTime: '14 মিনিট'
topics: ['WebSocket', 'real-time', 'SSE', 'long polling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনার গার্মেন্টস ফ্যাক্টরির দোতলায় কাটিং ফ্লোর, তিনতলায় সেলাই ফ্লোর। আগে যখন কাটিং ফ্লোরের খোয়ারিজমির কিছু জানানোর দরকার হতো, সে একটা চিরকুটে লিখে এক ছেলেকে তিনতলায় পাঠাত, তারপর জবাবের চিঠি নিয়ে ছেলেটা ফিরে না আসা পর্যন্ত দাঁড়িয়ে থাকত। আবার সেলাই ফ্লোরের ফাতিমা নতুন কোনো খবর আছে কিনা জানতে প্রতি মিনিটে ছেলেটাকে নিচে পাঠিয়ে জিজ্ঞেস করাত — "নতুন কিছু আছে?" — বেশিরভাগ সময়ই জবাব আসত "না, কিছু নাই", শুধু দৌড়াদৌড়িই সার।

শেষে সিনা দুই ফ্লোরের মাঝে একটা intercom লাইন বসিয়ে দিল, যেটা সারাক্ষণ খোলা থাকে। এখন আর চিঠি-দৌড়ের অপেক্ষা নেই, প্রতি মিনিটে "নতুন কিছু আছে?" জিজ্ঞেস করারও দরকার নেই। কাটিং শেষ হওয়ামাত্র খোয়ারিজমি লাইনে বলে দেয়, আবার সুতা ফুরিয়ে গেলে ফাতিমাও সঙ্গে সঙ্গে নিচে জানিয়ে দেয় — যে যখন যা বলার, তখনই বলে, দুই দিক থেকেই, একই খোলা লাইনে।

এই খোলা intercom লাইনটাই আসলে **WebSocket** — একবার connection খুলে গেলে সেটা persistent থাকে আর দুই পক্ষই যেকোনো সময় full-duplex-ভাবে কথা বলতে পারে। চিঠি পাঠিয়ে প্রতিবার জবাবের অপেক্ষা করাটা হলো HTTP-এর request-response, আর "নতুন কিছু আছে?" বারবার জিজ্ঞেস করাটা হলো **polling** — দুটোতেই দেরি আর অপচয়। বাস্তবে chat অ্যাপে মেসেজ সঙ্গে সঙ্গে আসা কিংবা live notification পাওয়া — এসব ঠিক এই খোলা লাইনের জোরেই কাজ করে।

## রিয়েল-টাইমের জন্য HTTP-এর সমস্যা

HTTP হলো request-response: client জিজ্ঞেস করে, server উত্তর দেয়। কিন্তু server-কে যদি client-এর কাছে ডেটা push করতে হয় — একটা নতুন chat message, একটা stock price update, কিংবা একটা collaborative edit — তখন কী হবে?

**Polling** (বারবার জিজ্ঞেস করা) bandwidth নষ্ট করে। **Long polling** (request খোলা ধরে রাখা) একটা hacky উপায়। WebSockets এই সমস্যাটা সমাধান করে একটা persistent, bidirectional connection দিয়ে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

এটা অনেকটা walkie-talkie বনাম চিঠি পাঠানোর মতো — একবার channel খুলে গেলে দুই পক্ষই connection নতুন করে বসানো ছাড়াই যেকোনো সময় কথা বলতে পারে। HTTP হলো চিঠি পাঠিয়ে প্রতিবার উত্তরের জন্য অপেক্ষা করার মতো।

</Callout>

## WebSockets কীভাবে কাজ করে

একটা WebSocket শুরু হয় একটা HTTP request হিসেবে, তারপর সেটা একটা persistent TCP connection-এ **upgrade** হয়:

```typescript
// 1. Client sends HTTP upgrade request
// GET /chat HTTP/1.1
// Host: server.example.com
// Upgrade: websocket
// Connection: Upgrade
// Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
// Sec-WebSocket-Version: 13

// 2. Server responds with 101 Switching Protocols
// HTTP/1.1 101 Switching Protocols
// Upgrade: websocket
// Connection: Upgrade
// Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

// 3. Now both sides can send messages freely — no more HTTP
```

### WebSocket Server (Node.js)

```typescript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
	clients.add(ws);
	console.log(`Client connected (${clients.size} total)`);

	ws.on('message', (data) => {
		const message = JSON.parse(data.toString());

		// Broadcast to all other clients
		for (const client of clients) {
			if (client !== ws && client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify(message));
			}
		}
	});

	ws.on('close', () => {
		clients.delete(ws);
	});
});
```

### WebSocket Client (Browser)

```typescript
const ws = new WebSocket('wss://server.example.com/chat');

ws.onopen = () => {
	ws.send(JSON.stringify({ type: 'join', room: 'general' }));
};

ws.onmessage = (event) => {
	const message = JSON.parse(event.data);
	renderMessage(message);
};

ws.onclose = (event) => {
	console.log(`Disconnected: ${event.code} ${event.reason}`);
	// Reconnect with exponential backoff
	setTimeout(connect, Math.min(1000 * 2 ** retries, 30000));
};
```

## Server-Sent Events (SSE)

যদি তোমার শুধু **server → client** push দরকার হয় (bidirectional নয়), তাহলে SSE বেশি সহজ:

```typescript
// Server (Node.js / Express)
app.get('/events', (req, res) => {
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');

	const send = (data: unknown) => {
		res.write(`data: ${JSON.stringify(data)}\n\n`);
	};

	// Send updates
	const interval = setInterval(() => {
		send({ price: Math.random() * 100, timestamp: Date.now() });
	}, 1000);

	req.on('close', () => clearInterval(interval));
});

// Client (Browser) — built-in API, auto-reconnects!
const events = new EventSource('/events');
events.onmessage = (e) => {
	const data = JSON.parse(e.data);
	updatePrice(data.price);
};
```

<Callout type="tip">

**WebSockets-এর বদলে SSE বেছে নাও** যখন ডেটা শুধু server→client দিকে যায়। SSE বেশি সহজ, নিজে থেকেই auto-reconnect করে, HTTP/2 multiplexing-এর মধ্য দিয়ে কাজ করে, আর আলাদা কোনো protocol লাগে না। WebSockets শুধু তখনই ব্যবহার করো যখন তোমার সত্যিকারের bidirectional communication দরকার।

</Callout>

## তুলনা

|                   | Polling         | Long Polling  | SSE           | WebSocket     |
| ----------------- | --------------- | ------------- | ------------- | ------------- |
| Direction         | Client→Server   | Client→Server | Server→Client | Bidirectional |
| Latency           | High (interval) | Medium        | Low           | Low           |
| Overhead          | High            | Medium        | Low           | Low           |
| Complexity        | Simple          | Medium        | Simple        | Complex       |
| Auto-reconnect    | Manual          | Manual        | Built-in      | Manual        |
| HTTP/2 compatible | Yes             | Yes           | Yes           | No (uses TCP) |

## মূল শেখার বিষয়

1. **WebSockets bidirectional, persistent connection দেয়** — chat, gaming, collaboration-এর জন্য আদর্শ
2. **Server-to-client push-এর জন্য SSE বেশি সহজ** — auto-reconnect করে আর HTTP/2-এর সাথে কাজ করে
3. **সবসময় backoff দিয়ে reconnection বসাও** — connection drop হবেই
4. **ডিফল্টভাবে WebSockets ধরে নিও না** — বেশিরভাগ "real-time" feature-এর শুধু server→client দরকার হয় (SSE)
