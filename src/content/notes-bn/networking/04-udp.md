---
title: 'UDP — নির্ভরযোগ্যতার বদলে গতি'
subtitle: 'যখন কয়েকটা প্যাকেট হারানো অপেক্ষা করার চেয়ে ভালো — ভিডিও কল, গেমিং, DNS lookup, আর নিজের reliability বানানো।'
chapter: 4
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['UDP', 'datagram', 'real-time', 'gaming']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

গ্রামের বাৎসরিক মেলা বসেছে। মাঠের এক কোণে চড়ায় বসে করিম মাইক হাতে লাউডস্পিকারে একের পর এক ঘোষণা দিয়ে যাচ্ছে — "নীল টি-শার্ট পরা রহিমের ছেলেকে খুঁজছেন তার মা, তিন নম্বর গেটে চলে আসো", তারপরই "নাগরদোলার টিকিট এখন হাফ দামে", তারপর "লটারির শেষ ডাক, নম্বর সাতাশ"। করিম একবারও থামে না, কেউ শুনল কি না জিজ্ঞেস করে না, কারও "হ্যাঁ শুনেছি" পাওয়ার অপেক্ষা করে না। মাইকে বলেই সে পরের ঘোষণায় চলে যায়।

ভিড়ের হইচইয়ে ফাতেমা হয়তো লটারির নম্বরটা ঠিকমতো শুনতে পেল না। কিন্তু করিম তো জানেই না কে শুনল আর কে মিস করল — সে ওই লাইনটা আর দ্বিতীয়বার বলবে না, পরের ঘোষণা এসে গেছে। মিস মানে মিস, ওটা হারিয়ে গেল। বিনিময়ে পুরো মাঠের সবাই মেলার একদম টাটকা খবরটা প্রায় সঙ্গে সঙ্গেই পেয়ে যাচ্ছে। এর উল্টো দিকে ভাবো রেজিস্ট্রি ডাকের কথা — সেখানে পিয়ন প্রতিটা চিঠির জন্য প্রাপকের সই নেয়, সই না পেলে চিঠি আবার ফেরত-পাঠানো হয়; নিশ্চিত, কিন্তু ধীর। মেলার ঘোষণায় করিম সেই সইয়ের ঝামেলায় যায় না বলেই এত দ্রুত।

এই করিমের মাইকই আসলে **UDP**। কোনো handshake করে connection বসানো নেই (connectionless), কেউ শুনল কি না তার acknowledgement নেই, মিস হলে আবার পাঠানোও নেই (no retransmission) — তাই কিছু packet হারাতেই পারে (possible loss)। বদলে পাওয়া যায় সবচেয়ে কম latency, সবাই up-to-the-second খবর পায়। ঠিক এ কারণেই লাইভ ভিডিও, VoIP কল, অনলাইন গেম আর DNS lookup — যেখানে টাটকা থাকাটা কয়েকটা packet হারানোর চেয়ে জরুরি — সেখানে TCP-র সই-নেওয়া রেজিস্ট্রি ডাকের বদলে UDP-ই বেছে নেওয়া হয়।

## UDP কেন?

UDP (User Datagram Protocol) হলো TCP-এর সহজ-সরল ভাইটি। কোনো handshake নেই, delivery-র কোনো গ্যারান্টি নেই, ordering নেই। শুধু "fire and forget" প্যাকেট। শুনতে খারাপ লাগে — তাহলে কেউ এটা ব্যবহার করবে কেন?

কারণ কখনো কখনো **সম্পূর্ণতার চেয়ে গতি বেশি জরুরি**:

- **ভিডিও কল** — একটা frame drop হলে চোখে পড়ে না, কিন্তু 200ms দেরি অসহনীয়
- **অনলাইন গেমিং** — 50ms আগের player position দেখানো, সঠিক position-এর জন্য অপেক্ষা করে freeze হয়ে যাওয়ার চেয়ে ভালো
- **DNS query** — সাধারণ একটা প্রশ্ন/উত্তরের জন্য পুরো TCP connection দরকার নেই
- **লাইভ স্ট্রিমিং** — দর্শকরা rewind করে না, তাই পুরনো data আবার পাঠানো অপচয়

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

স্টেডিয়ামের একজন announcer যেমন লাউডস্পিকারে ঘোষণা দেন — বার্তাটা একবারই সবার কাছে চলে যায়। কেউ শুনলো কিনা তার কোনো confirmation নেই, আবার পাঠানোও নেই। দ্রুত কিন্তু অনির্ভরযোগ্য — লাইভ খেলার ধারাভাষ্যের জন্য একদম উপযুক্ত।

</Callout>

## UDP সরল

একটা UDP datagram-এর header মাত্র 8 বাইটের। এটুকুই:

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

কোনো connection setup নেই, teardown নেই, state নেই। একটা প্যাকেট পাঠাও, আর এগিয়ে যাও।

## একটা UDP Server বানানো

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

## যখন কিছুটা Reliability দরকার

অনেক real-time protocol transport হিসেবে UDP ব্যবহার করে, কিন্তু তার উপরে নিজের হালকা-পাতলা reliability যোগ করে — শুধু যে data-টা গুরুত্বপূর্ণ সেটার জন্য।

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

**QUIC** (HTTP/3-এ ব্যবহৃত) UDP-র উপরে তৈরি, কিন্তু নিজের reliability, encryption আর multiplexing যোগ করে। এটা UDP-র flexibility পায়, আবার app-গুলোর যে গ্যারান্টি দরকার সেটাও দেয় — TCP-র head-of-line blocking সমস্যা ছাড়াই।

</Callout>

## TCP vs UDP সিদ্ধান্ত গাইড

| প্রশ্ন                                   | TCP      | UDP             |
| ---------------------------------------- | -------- | --------------- |
| প্রতিটা বাইট কি পৌঁছাতেই হবে?            | হ্যাঁ    | না              |
| Ordering কি খুব জরুরি?                   | হ্যাঁ    | না              |
| সম্পূর্ণতার চেয়ে latency কি বেশি জরুরি? | না       | হ্যাঁ           |
| Data কি ছোট (এক প্যাকেটে ধরে যায়)?      | Overhead | Perfect         |
| তোমার কি custom reliability দরকার?       | Overkill | নিজের মতো বানাও |

## মূল যা মনে রাখবে

1. **UDP reliability-র বদলে গতি নেয়** — কোনো handshake নেই, retransmission নেই, ordering নেই
2. **যখন সম্পূর্ণতার চেয়ে freshness জরুরি তখন UDP ব্যবহার করো** — real-time audio/video, গেমিং, DNS
3. **UDP-র উপরে selective reliability বানাতে পারো** — শুধু যেটা গুরুত্বপূর্ণ সেটাই আবার পাঠাও
4. **QUIC (HTTP/3) UDP-র flexibility প্রমাণ করে** — আধুনিক protocol-গুলো UDP-কে ভিত্তি হিসেবে বেছে নিয়ে সেখান থেকে গড়ে তোলে
