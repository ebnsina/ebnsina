---
title: 'TCP/IP — নির্ভরযোগ্য ডেলিভারি'
subtitle: 'Three-way handshake, flow control, congestion avoidance — কীভাবে TCP প্রতিটি byte সঠিক ক্রমে পৌঁছানোর গ্যারান্টি দেয়।'
chapter: 3
level: 'beginner'
readingTime: '16 মিনিট'
topics: ['TCP', 'IP', 'handshake', 'flow control', 'congestion']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

সিনাকে একটা জরুরি দলিল — ধরুন ৫০ পাতার — ডাকযোগে ফাতিমার কাছে পাঠাতে হবে, একটা পাতাও হারানো চলবে না, আর ফাতিমাকে ঠিক ১ থেকে ৫০ ক্রমেই পড়তে হবে। সিনা প্রতিটা পাতায় নম্বর বসায় আর প্রত্যেকটা আলাদা রেজিস্টার্ড চিঠি হিসেবে পাঠায়, যেগুলোর প্রতিটার জন্য ফাতিমাকে সই করা একটা "পেয়েছি" রসিদ ফেরত পাঠাতে হয়। শুরু করার আগে সিনা একটা ছোট চিঠি দেয় "তুমি কি নেওয়ার জন্য রেডি?", ফাতিমা জবাব দেয় "রেডি, তুমিও কনফার্ম করো", সিনা শেষ কনফার্মেশন পাঠায় — তারপরই আসল পাতাগুলো যাওয়া শুরু হয়।

সিনা প্রতিটা পাঠানো পাতার একটা কপি নিজের কাছে রেখে দেয়। কোনো একটা পাতার সই করা রসিদ যদি নির্দিষ্ট সময়ের মধ্যে ফেরত না আসে, সিনা ধরে নেয় ওটা পথে হারিয়েছে আর কপি থেকে ওই একই নম্বরের পাতা আবার পাঠায়। ওদিকে ডাক ব্যবস্থার এলোমেলো পথের কারণে পাতাগুলো ফাতিমার কাছে উল্টাপাল্টা ক্রমে পৌঁছাতে পারে — ৩ নম্বর হয়তো ৫ নম্বরের পরে আসে। ফাতিমা তাড়াহুড়ো করে না; নম্বর দেখে পাতাগুলো সাজিয়ে রাখে আর ঠিক ক্রম অনুযায়ীই দলিলটা জোড়া দেয়।

এই পুরো ব্যাপারটাই আসলে **TCP**। শুরুর সেই তিন-চিঠির কনফার্মেশন হলো **handshake**, প্রতিটা নম্বরওয়ালা পাতা হলো একটা **segment**, সই করা রসিদ হলো **acknowledgement (ACK)**, রসিদ না এলে কপি থেকে আবার পাঠানো হলো **retransmission**, আর নম্বর ধরে ঠিক ক্রমে জোড়া দেওয়া হলো **ordered delivery** — সব মিলিয়ে TCP-র নির্ভরযোগ্য, ক্রমানুসারী ডেলিভারির গ্যারান্টি। বাস্তবে ওয়েব পেজ লোড হওয়া (HTTP) কিংবা একটা বড় ফাইল ডাউনলোড — যেখানে একটা byte-ও হারালে বা এলোমেলো হলে চলবে না — সেখানে TCP ঠিক এভাবেই কাজ করে।

## TCP vs UDP

Transport layer-এ দুটি প্রধান protocol আছে:

|             | TCP                                 | UDP                             |
| ----------- | ----------------------------------- | ------------------------------- |
| Reliability | গ্যারান্টিড ডেলিভারি, ক্রম অনুযায়ী | Best effort, packet হারাতে পারে |
| Connection  | Connection-oriented (handshake)     | Connectionless                  |
| Speed       | ধীর (overhead বেশি)                 | দ্রুত (overhead সামান্য)        |
| Use cases   | HTTP, email, file transfer          | Video streaming, gaming, DNS    |

TCP reliability-র জন্য speed ছেড়ে দেয়। UDP speed-এর জন্য reliability ছেড়ে দেয়। আপনার application-এর জন্য কোনটা বেশি গুরুত্বপূর্ণ, তার ভিত্তিতে বেছে নিন।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

অনেকটা tracked shipping-এ package পাঠানোর মতো — তারা আপনাকে একটা tracking number (sequence number) দেয়, delivery নিশ্চিত করে (ACK), আর কোনো package হারিয়ে গেলে সেটা আবার পাঠায়। নির্ভরযোগ্য, ক্রম অনুযায়ী delivery-র গ্যারান্টি।

</Callout>

## The Three-Way Handshake

কোনো data পাঠানোর আগে TCP তিনটি packet দিয়ে একটি connection তৈরি করে:

```typescript
// The TCP three-way handshake
// 1. Client → Server: SYN (seq=100)
//    "I want to connect, starting at sequence 100"

// 2. Server → Client: SYN-ACK (seq=300, ack=101)
//    "OK, I'm starting at 300, I've noted your sequence"

// 3. Client → Server: ACK (seq=101, ack=301)
//    "Got it, connection established"

interface TCPSegment {
	sourcePort: number;
	destPort: number;
	sequenceNumber: number;
	ackNumber: number;
	flags: {
		SYN: boolean;
		ACK: boolean;
		FIN: boolean;
		RST: boolean;
	};
	windowSize: number; // flow control
	payload: Uint8Array;
}

// Simplified TCP connection state machine
type TCPState =
	| 'CLOSED'
	| 'SYN_SENT'
	| 'SYN_RECEIVED'
	| 'ESTABLISHED'
	| 'FIN_WAIT'
	| 'CLOSE_WAIT'
	| 'TIME_WAIT';
```

এই handshake কোনো data প্রবাহিত হওয়ার আগেই এক round-trip পরিমাণ latency যোগ করে। স্বল্পস্থায়ী connection-এর ক্ষেত্রে (যেমন HTTP/1.1 request), এই overhead উল্লেখযোগ্য — এ কারণেই connection reuse (keep-alive) আর HTTP/2-এর অস্তিত্ব আছে।

## Sequence Numbers and Acknowledgments

TCP প্রতিটি byte-কে sequence number দিয়ে track করে। Receiver receipt নিশ্চিত করতে ACK পাঠায়:

```typescript
// Sender sends 3 segments
// Segment 1: seq=1, data="Hello" (5 bytes)
// Segment 2: seq=6, data="World" (5 bytes)
// Segment 3: seq=11, data="!" (1 byte)

// Receiver responds:
// ACK=6   → "Got bytes 1-5, send byte 6 next"
// ACK=12  → "Got everything up to byte 11"

// If segment 2 is lost:
// Receiver sends: ACK=6, ACK=6, ACK=6 (duplicate ACKs)
// Sender detects loss → retransmits segment 2
```

<Callout type="info">

**Fast retransmit**: Sender যখন ৩টি duplicate ACK পায়, তখন সে timeout-এর অপেক্ষা না করেই সাথে সাথে missing segment retransmit করে। এতে TCP packet loss থেকে অনেক দ্রুত recover করতে পারে।

</Callout>

## Flow Control

Receiver **window size** ব্যবহার করে sender-কে জানায় সে কতটুকু data সামলাতে পারবে। এটি একটি fast sender-কে slow receiver-এর ওপর চাপ সৃষ্টি করা থেকে আটকায়।

```typescript
// Sliding window flow control
class TCPReceiver {
	private buffer: Uint8Array;
	private bufferSize: number;
	private bytesUsed = 0;

	constructor(bufferSize: number) {
		this.bufferSize = bufferSize;
		this.buffer = new Uint8Array(bufferSize);
	}

	// Available space = what we advertise as window size
	get windowSize(): number {
		return this.bufferSize - this.bytesUsed;
	}

	receive(data: Uint8Array): void {
		if (data.length > this.windowSize) {
			throw new Error('Sender exceeded window size');
		}
		// Copy data to buffer
		this.buffer.set(data, this.bytesUsed);
		this.bytesUsed += data.length;
	}

	// Application reads data, freeing buffer space
	read(n: number): Uint8Array {
		const data = this.buffer.slice(0, n);
		this.buffer.copyWithin(0, n);
		this.bytesUsed -= n;
		return data;
	}
}
```

## Congestion Control

Flow control _receiver_-এর ওপর অতিরিক্ত চাপ আটকায়। Congestion control _network_-এর ওপর অতিরিক্ত চাপ আটকায়। TCP ধীরে শুরু করে এবং ধীরে ধীরে গতি বাড়ায়:

1. **Slow start** — ছোট window দিয়ে শুরু করে (সাধারণত 10 segments), প্রতি round-trip-এ দ্বিগুণ করে
2. **Congestion avoidance** — একটা threshold পেরোলে, linear-ভাবে বাড়ায় (প্রতি RTT-তে 1 segment)
3. **Packet loss হলে** — window অর্ধেক কমিয়ে দেয় এবং congestion avoidance-এ প্রবেশ করে

```typescript
class CongestionControl {
	cwnd = 10; // congestion window (segments)
	ssthresh = 64; // slow start threshold
	state: 'slow_start' | 'congestion_avoidance' = 'slow_start';

	onAck(): void {
		if (this.state === 'slow_start') {
			this.cwnd *= 2; // exponential growth
			if (this.cwnd >= this.ssthresh) {
				this.state = 'congestion_avoidance';
			}
		} else {
			this.cwnd += 1; // linear growth
		}
	}

	onLoss(): void {
		this.ssthresh = Math.floor(this.cwnd / 2);
		this.cwnd = this.ssthresh;
		this.state = 'congestion_avoidance';
	}
}
```

<Callout type="tip">

**নতুন TCP connection ধীর কেন**: Slow start-এর কারণে, একটা নতুন TCP connection প্রথম round-trip-এ মাত্র 10 segments (~14KB) পাঠাতে পারে। এ কারণেই একটি single connection-এর ওপর HTTP/2 multiplexing, HTTP/1.1-এর multiple connection-এর চেয়ে দ্রুত।

</Callout>

## Connection Termination

একটি TCP connection বন্ধ করতে four-way handshake লাগে (FIN → ACK → FIN → ACK)। `TIME_WAIT` state যেকোনো delayed packet সামলানোর জন্য maximum segment lifetime-এর 2× সময় ধরে connection-টিকে টিকিয়ে রাখে।

## Key Takeaways

1. **TCP নির্ভরযোগ্য, ক্রম অনুযায়ী delivery-র গ্যারান্টি দেয়** — latency-র বিনিময়ে (handshake + retransmission)
2. **Sequence number + ACK** প্রতিটি byte track করে এবং loss শনাক্ত করে
3. **Flow control** (window size) receiver-এর ওপর অতিরিক্ত চাপ আটকায়
4. **Congestion control** (slow start → congestion avoidance) network-এর ওপর অতিরিক্ত চাপ আটকায়
5. **Connection setup latency যোগ করে** — সম্ভব হলে connection reuse করুন
