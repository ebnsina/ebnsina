---
title: 'How the Internet Works'
subtitle: 'Packets, routers, and the physical infrastructure that connects billions of devices — the big picture before diving into protocols.'
chapter: 1
level: 'beginner'
readingTime: '12 min'
topics: ['internet', 'packets', 'routers', 'ISP']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Internet is a Network of Networks

The internet isn't one thing — it's thousands of independent networks (ISPs, universities, companies, data centers) that agree to pass traffic between each other. When you load a webpage, your request might cross 10-20 different networks before reaching the server.

<Callout type="info">

**Real-World Analogy**

Like the postal system — your letter (packet) goes from your local post office (ISP) through regional sorting centers (routers) to the destination. Each sorting center only knows the next stop, not the full route.

</Callout>

## Packets: The Fundamental Unit

Data on the internet travels as **packets** — small chunks (typically 1,500 bytes max) with a header containing source/destination addresses and a payload containing your actual data.

Why packets instead of a continuous stream? Because sharing is efficient. A single wire can carry packets from millions of conversations simultaneously — each packet finds its own way to the destination.

```typescript
// Conceptual model of a packet
interface Packet {
	header: {
		sourceIP: string; // "192.168.1.5"
		destinationIP: string; // "93.184.216.34"
		protocol: 'TCP' | 'UDP';
		sequenceNumber: number; // for reassembly
		ttl: number; // time to live (hop limit)
	};
	payload: Uint8Array; // up to ~1460 bytes of actual data
}
```

## How a Request Travels

When you type `example.com` in your browser, here's what happens at the network level:

1. **DNS resolution** — your browser asks "what IP address is example.com?" (covered in Chapter 2)
2. **TCP handshake** — your machine and the server exchange 3 packets to establish a connection (Chapter 3)
3. **TLS handshake** — if HTTPS, another few packets to negotiate encryption (Chapter 5)
4. **HTTP request** — your browser sends the actual request
5. **Routing** — each packet hops through routers, each one deciding the next hop
6. **Response** — the server sends back data, potentially as many packets

## Routers and Routing

Each router has a **routing table** — a lookup table that maps destination IP ranges to the next router to forward to. Routers don't know the full path, they just know the best next hop.

```typescript
// Simplified routing table
const routingTable: Record<string, string> = {
	'10.0.0.0/8': 'eth0', // local network
	'172.16.0.0/12': '192.168.1.1', // forward to gateway
	'0.0.0.0/0': '203.0.113.1' // default route (ISP)
};

function route(destinationIP: string): string {
	// Find the most specific matching prefix
	// In reality, this uses a trie (prefix tree) for efficiency
	for (const [prefix, nextHop] of Object.entries(routingTable)) {
		if (matchesCIDR(destinationIP, prefix)) {
			return nextHop;
		}
	}
	return routingTable['0.0.0.0/0']; // default route
}
```

<Callout type="info">

**Traceroute** shows you the actual path packets take. Run `traceroute google.com` in your terminal to see every router hop between you and Google's servers.

</Callout>

## IP Addresses

Every device on the internet needs an address. IPv4 addresses are 32-bit numbers written as four octets: `192.168.1.1`. There are only ~4.3 billion possible IPv4 addresses — not enough for every device on earth.

Solutions:

- **NAT (Network Address Translation)** — many devices share one public IP, using port numbers to distinguish them
- **IPv6** — 128-bit addresses (`2001:0db8:85a3::8a2e:0370:7334`), enough for trillions of devices

```typescript
// IPv4 is just a 32-bit number
function ipToNumber(ip: string): number {
	return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

// "192.168.1.1" → 3232235777
console.log(ipToNumber('192.168.1.1'));
```

## The OSI Model (Simplified)

Networking is built in layers. Each layer handles one concern:

| Layer | Name        | What it does         | Example            |
| ----- | ----------- | -------------------- | ------------------ |
| 7     | Application | Your app's protocol  | HTTP, WebSocket    |
| 4     | Transport   | Reliable delivery    | TCP, UDP           |
| 3     | Network     | Addressing & routing | IP                 |
| 2     | Data Link   | Local network frames | Ethernet, WiFi     |
| 1     | Physical    | Bits on a wire       | Fiber optic, radio |

Each layer wraps the layer above it. An HTTP message goes inside a TCP segment, inside an IP packet, inside an Ethernet frame, onto a wire.

## Key Takeaways

1. **The internet is a network of networks** — packets hop through routers across independent networks
2. **Packets are small, independent units** — they can take different paths and arrive out of order
3. **Routers only know the next hop** — no single device knows the full path
4. **Layers separate concerns** — each protocol handles one job and builds on the layer below
