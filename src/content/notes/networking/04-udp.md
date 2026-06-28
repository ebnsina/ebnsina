---
title: 'UDP — Speed Over Reliability'
subtitle: 'When losing a few packets is better than waiting — video calls, gaming, DNS lookups, and building your own reliability.'
chapter: 4
level: 'beginner'
readingTime: '10 min'
topics: ['UDP', 'datagram', 'real-time', 'gaming']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why UDP?

UDP (User Datagram Protocol) is TCP's simpler sibling. No handshake, no guaranteed delivery, no ordering. Just "fire and forget" packets. This sounds terrible — why would anyone use it?

Because sometimes **speed matters more than completeness**:

- **Video calls** — a dropped frame is invisible, but a 200ms delay is unbearable
- **Online gaming** — showing a player's position from 50ms ago is better than freezing to wait for the correct position
- **DNS queries** — a simple question/answer doesn't need a full TCP connection
- **Live streaming** — viewers don't rewind, so retransmitting old data is wasteful

<Callout type="info">

**Real-World Analogy**

Like a stadium announcer broadcasting over loudspeakers — the message goes out once to everyone. No confirmation if people heard it, no retransmission. Fast but unreliable — perfect for live sports commentary.

</Callout>

## UDP is Simple

A UDP datagram has an 8-byte header. That's it:

```typescript
interface UDPDatagram {
	sourcePort: number; // 2 bytes
	destinationPort: number; // 2 bytes
	length: number; // 2 bytes
	checksum: number; // 2 bytes
	payload: Uint8Array; // your data
}

// Compare to TCP's 20+ byte header with sequence numbers,
// window sizes, flags, and options
```

No connection setup, no teardown, no state. Send a packet and move on.

## Building a UDP Server

```typescript
import dgram from 'node:dgram';

const server = dgram.createSocket('udp4');

server.on('message', (msg, rinfo) => {
	console.log(`Received: ${msg} from ${rinfo.address}:${rinfo.port}`);

	// Echo it back
	server.send(`ACK: ${msg}`, rinfo.port, rinfo.address);
});

server.bind(3000, () => {
	console.log('UDP server listening on port 3000');
});

// Client
const client = dgram.createSocket('udp4');
client.send('Hello UDP!', 3000, 'localhost');
```

## When You Need Some Reliability

Many real-time protocols use UDP as the transport but add their own lightweight reliability on top — only for the data that matters.

```typescript
// Game server: reliable for critical events, unreliable for positions
interface GamePacket {
	sequence: number;
	timestamp: number;
	reliable: boolean; // should we retry if lost?
	type: 'position' | 'chat' | 'damage' | 'inventory';
	data: unknown;
}

class ReliableUDP {
	private pending = new Map<number, { packet: GamePacket; sentAt: number }>();
	private sequence = 0;

	send(packet: GamePacket): void {
		packet.sequence = this.sequence++;

		this.transmit(packet);

		if (packet.reliable) {
			this.pending.set(packet.sequence, {
				packet,
				sentAt: Date.now()
			});
		}
	}

	onAck(sequence: number): void {
		this.pending.delete(sequence);
	}

	// Retransmit unacked reliable packets
	tick(): void {
		const now = Date.now();
		for (const [seq, entry] of this.pending) {
			if (now - entry.sentAt > 100) {
				// 100ms timeout
				this.transmit(entry.packet);
				entry.sentAt = now;
			}
		}
	}

	private transmit(packet: GamePacket): void {
		// Serialize and send via UDP socket
	}
}
```

<Callout type="info">

**QUIC** (used by HTTP/3) is built on UDP but adds its own reliability, encryption, and multiplexing. It gets the flexibility of UDP with the guarantees apps need — without TCP's head-of-line blocking problem.

</Callout>

## TCP vs UDP Decision Guide

| Question                                     | TCP      | UDP                 |
| -------------------------------------------- | -------- | ------------------- |
| Must every byte arrive?                      | Yes      | No                  |
| Is ordering critical?                        | Yes      | No                  |
| Is latency more important than completeness? | No       | Yes                 |
| Is the data small (fits in one packet)?      | Overhead | Perfect             |
| Do you need custom reliability?              | Overkill | Build what you need |

## Key Takeaways

1. **UDP trades reliability for speed** — no handshake, no retransmission, no ordering
2. **Use UDP when freshness beats completeness** — real-time audio/video, gaming, DNS
3. **You can build selective reliability on top of UDP** — only retransmit what matters
4. **QUIC (HTTP/3) proves UDP's flexibility** — modern protocols choose UDP as a foundation and build up from there
