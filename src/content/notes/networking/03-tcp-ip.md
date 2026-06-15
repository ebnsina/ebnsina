---
title: "TCP/IP — Reliable Delivery"
subtitle: "The three-way handshake, flow control, congestion avoidance — how TCP guarantees every byte arrives in order."
chapter: 3
level: "beginner"
readingTime: "16 min"
topics: ["TCP", "IP", "handshake", "flow control", "congestion"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## TCP vs UDP

The transport layer has two main protocols:

| | TCP | UDP |
|--|-----|-----|
| Reliability | Guaranteed delivery, in order | Best effort, may lose packets |
| Connection | Connection-oriented (handshake) | Connectionless |
| Speed | Slower (overhead) | Faster (minimal overhead) |
| Use cases | HTTP, email, file transfer | Video streaming, gaming, DNS |

TCP sacrifices speed for reliability. UDP sacrifices reliability for speed. Choose based on what matters more for your application.

<Callout type="info">

**Real-World Analogy**

Like sending a package via tracked shipping — they give you a tracking number (sequence number), confirm delivery (ACK), and if a package is lost, they resend it. Reliable, ordered delivery guaranteed.

</Callout>

## The Three-Way Handshake

Before sending any data, TCP establishes a connection with three packets:

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
  | "CLOSED"
  | "SYN_SENT"
  | "SYN_RECEIVED"
  | "ESTABLISHED"
  | "FIN_WAIT"
  | "CLOSE_WAIT"
  | "TIME_WAIT";
```

This handshake adds one round-trip of latency before any data flows. For short-lived connections (like HTTP/1.1 requests), this overhead is significant — which is why connection reuse (keep-alive) and HTTP/2 exist.

## Sequence Numbers and Acknowledgments

TCP tracks every byte with sequence numbers. The receiver sends ACKs to confirm receipt:

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

**Fast retransmit**: When the sender receives 3 duplicate ACKs, it retransmits the missing segment immediately — without waiting for a timeout. This makes TCP recover from packet loss much faster.

</Callout>

## Flow Control

The receiver tells the sender how much data it can handle using the **window size**. This prevents a fast sender from overwhelming a slow receiver.

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
      throw new Error("Sender exceeded window size");
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

Flow control prevents overwhelming the *receiver*. Congestion control prevents overwhelming the *network*. TCP starts slow and ramps up:

1. **Slow start** — begin with a small window (typically 10 segments), double each round-trip
2. **Congestion avoidance** — once past a threshold, increase linearly (1 segment per RTT)
3. **On packet loss** — cut the window in half and enter congestion avoidance

```typescript
class CongestionControl {
  cwnd = 10;          // congestion window (segments)
  ssthresh = 64;      // slow start threshold
  state: "slow_start" | "congestion_avoidance" = "slow_start";

  onAck(): void {
    if (this.state === "slow_start") {
      this.cwnd *= 2; // exponential growth
      if (this.cwnd >= this.ssthresh) {
        this.state = "congestion_avoidance";
      }
    } else {
      this.cwnd += 1; // linear growth
    }
  }

  onLoss(): void {
    this.ssthresh = Math.floor(this.cwnd / 2);
    this.cwnd = this.ssthresh;
    this.state = "congestion_avoidance";
  }
}
```

<Callout type="tip">

**Why new TCP connections are slow**: Because of slow start, a fresh TCP connection can only send 10 segments (~14KB) in the first round-trip. This is why HTTP/2 multiplexing over a single connection is faster than HTTP/1.1's multiple connections.

</Callout>

## Connection Termination

Closing a TCP connection requires a four-way handshake (FIN → ACK → FIN → ACK). The `TIME_WAIT` state keeps the connection around for 2× the maximum segment lifetime to handle any delayed packets.

## Key Takeaways

1. **TCP guarantees reliable, ordered delivery** at the cost of latency (handshake + retransmission)
2. **Sequence numbers + ACKs** track every byte and detect loss
3. **Flow control** (window size) prevents overwhelming the receiver
4. **Congestion control** (slow start → congestion avoidance) prevents overwhelming the network
5. **Connection setup adds latency** — reuse connections when possible

