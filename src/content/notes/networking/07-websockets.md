---
title: 'WebSockets & Real-Time'
subtitle: 'Full-duplex communication over a single connection — chat, live updates, collaborative editing, and when not to use them.'
chapter: 7
level: 'intermediate'
readingTime: '14 min'
topics: ['WebSocket', 'real-time', 'SSE', 'long polling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Problem with HTTP for Real-Time

HTTP is request-response: the client asks, the server answers. But what if the server needs to push data to the client — a new chat message, a stock price update, a collaborative edit?

**Polling** (asking repeatedly) wastes bandwidth. **Long polling** (holding requests open) is hacky. WebSockets solve this with a persistent, bidirectional connection.

<Callout type="info">

**Real-World Analogy**

Like a walkie-talkie vs. sending letters — once the channel is open, both sides can talk anytime without re-establishing connection. HTTP is like mailing a letter and waiting for a reply each time.

</Callout>

## How WebSockets Work

A WebSocket starts as an HTTP request, then **upgrades** to a persistent TCP connection:

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

If you only need **server → client** push (no bidirectional), SSE is simpler:

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

**Choose SSE over WebSockets** when data only flows server→client. SSE is simpler, auto-reconnects, works through HTTP/2 multiplexing, and doesn't need a separate protocol. Use WebSockets only when you need true bidirectional communication.

</Callout>

## Comparison

|                   | Polling         | Long Polling  | SSE           | WebSocket     |
| ----------------- | --------------- | ------------- | ------------- | ------------- |
| Direction         | Client→Server   | Client→Server | Server→Client | Bidirectional |
| Latency           | High (interval) | Medium        | Low           | Low           |
| Overhead          | High            | Medium        | Low           | Low           |
| Complexity        | Simple          | Medium        | Simple        | Complex       |
| Auto-reconnect    | Manual          | Manual        | Built-in      | Manual        |
| HTTP/2 compatible | Yes             | Yes           | Yes           | No (uses TCP) |

## Key Takeaways

1. **WebSockets provide bidirectional, persistent connections** — ideal for chat, gaming, collaboration
2. **SSE is simpler for server-to-client push** — auto-reconnects and works with HTTP/2
3. **Always implement reconnection with backoff** — connections will drop
4. **Don't default to WebSockets** — most "real-time" features only need server→client (SSE)
