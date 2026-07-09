---
title: 'TLS ও HTTPS'
subtitle: 'সার্টিফিকেট, হ্যান্ডশেক আর এনক্রিপশন — TLS কীভাবে আপনার ডেটা প্রাইভেট রাখে আর নিশ্চিত করে যে আপনি সঠিক সার্ভারের সাথেই কথা বলছেন।'
chapter: 5
level: 'intermediate'
readingTime: '15 মিনিট'
topics: ['TLS', 'HTTPS', 'certificates', 'encryption', 'handshake']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## TLS আসলে কী করে

TLS (Transport Layer Security) তিনটি জিনিস নিশ্চিত করে:

1. **Confidentiality** — ডেটা এনক্রিপ্টেড; আড়ি পাতা লোকজন শুধু আবোলতাবোল দেখে
2. **Integrity** — ট্রানজিটে ডেটা বদলানো হলে সেটা ধরা পড়বেই
3. **Authentication** — আপনি আসল সার্ভারের সাথেই কথা বলছেন, কোনো ছদ্মবেশীর সাথে নয়

HTTPS আসলে TLS-এর উপর দিয়ে চলা HTTP ছাড়া কিছুই না। `S` মানে হলো কোনো HTTP ডেটা পাঠানোর আগেই আপনার ব্রাউজার একটা TLS কানেকশন তৈরি করেছে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ব্যাংকের সিলড খামের সিস্টেমের মতো — সংবেদনশীল ডকুমেন্ট পাঠানোর আগে দুই পক্ষই পরিচয় যাচাই করে (certificates), একটা গোপন কোডে সম্মত হয় (key exchange), এরপর সব মেসেজ সিল করা খামে যাতায়াত করে (encryption)।

</Callout>

## TLS 1.3 হ্যান্ডশেক

TLS 1.3 হ্যান্ডশেককে 2 round-trip (TLS 1.2) থেকে কমিয়ে মাত্র 1-এ নিয়ে এসেছে:

```typescript
// TLS 1.3 Handshake (simplified)

// 1. Client Hello
//    Client → Server:
//    - Supported cipher suites
//    - Client's key share (Diffie-Hellman public key)
//    - SNI (Server Name Indication — which domain)

// 2. Server Hello + Encrypted Extensions
//    Server → Client:
//    - Chosen cipher suite
//    - Server's key share
//    - Certificate + signature
//    - Finished (verification)

// 3. Client Finished
//    Client → Server:
//    - Finished (verification)
//    - Application data can now flow!

interface TLSClientHello {
	supportedVersions: ['TLS 1.3'];
	cipherSuites: string[];
	keyShare: {
		group: 'x25519' | 'secp256r1';
		publicKey: Uint8Array;
	};
	sni: string; // "api.example.com"
}
```

## সার্টিফিকেট আর ট্রাস্ট

আপনার ব্রাউজার কীভাবে জানে যে সে আসলেই `google.com`-এর সাথে কথা বলছে?

**Certificate chain:**

1. Google-এর সার্ভার একটা **certificate** দেখায় যেটা কোনো Certificate Authority (CA) সাইন করেছে
2. সেই CA-এর certificate আবার একটা **root CA** সাইন করে
3. Root CA certificate গুলো আগে থেকেই আপনার ব্রাউজার/OS-এ ইনস্টল করা থাকে (এটাই **trust store**)

```typescript
interface X509Certificate {
	subject: string; // "*.google.com"
	issuer: string; // "Google Trust Services"
	validFrom: Date;
	validTo: Date;
	publicKey: Uint8Array;
	signature: Uint8Array; // signed by issuer's private key
	extensions: {
		subjectAltNames: string[]; // domains this cert covers
		keyUsage: string[];
	};
}

function verifyCertChain(certs: X509Certificate[]): boolean {
	for (let i = 0; i < certs.length - 1; i++) {
		const cert = certs[i];
		const issuer = certs[i + 1];

		// Verify signature
		if (!verifySignature(cert, issuer.publicKey)) return false;

		// Check expiration
		if (cert.validTo < new Date()) return false;

		// Check issuer matches
		if (cert.issuer !== issuer.subject) return false;
	}

	// Last cert must be in trust store
	return trustStore.has(certs[certs.length - 1]);
}
```

## Key Exchange: Diffie-Hellman

TLS একটা shared secret বানাতে Diffie-Hellman ব্যবহার করে, অথচ সেটা কখনো তারের ওপর দিয়ে পাঠায় না। কেউ যদি পুরো ট্রাফিক রেকর্ডও করে ফেলে, তবুও সে key বের করতে পারবে না।

```typescript
// Simplified Diffie-Hellman concept
// Both sides generate a key pair, exchange public keys,
// and independently derive the same shared secret

// Client: privateA, publicA = generate()
// Server: privateB, publicB = generate()

// Client sends publicA → Server
// Server sends publicB → Client

// Client computes: sharedSecret = combine(privateA, publicB)
// Server computes: sharedSecret = combine(privateB, publicA)
// Both get the same sharedSecret!

// An eavesdropper sees publicA and publicB
// but can't derive sharedSecret without a private key
```

<Callout type="tip">

**Perfect Forward Secrecy (PFS)**: TLS 1.3 প্রতিটা কানেকশনের জন্য নতুন key pair জেনারেট করে। কেউ যদি সার্ভারের long-term private key চুরিও করে ফেলে, তবুও সে আগের কথোপকথন ডিক্রিপ্ট করতে পারবে না — কারণ প্রতিটা session একটা ইউনিক ephemeral key ব্যবহার করেছিল।

</Callout>

## সাধারণ TLS সমস্যা

```typescript
// Certificate pinning — extra security for mobile apps
const PINNED_HASHES = ['sha256/YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg='];

function verifyPin(cert: X509Certificate): boolean {
	const hash = sha256(cert.publicKey);
	return PINNED_HASHES.includes(`sha256/${base64(hash)}`);
}

// Mixed content — loading HTTP resources on HTTPS page
// Browser blocks this to prevent downgrade attacks
// Always use HTTPS for everything

// HSTS — tell browsers to always use HTTPS
// Strict-Transport-Security: max-age=31536000; includeSubDomains
```

<Callout type="warning">

প্রোডাকশন কোডে **কখনো certificate verification বন্ধ করবেন না** (Node.js-এ `rejectUnauthorized: false`)। এতে TLS-এর পুরো উদ্দেশ্যটাই ভেস্তে যায় — একজন অ্যাটাকার যেকোনো certificate দেখাতে পারবে আর আপনি সেটা মেনে নেবেন।

</Callout>

## মূল কথাগুলো

1. **TLS এনক্রিপশন, integrity আর authentication দেয়** — তিনটাই গুরুত্বপূর্ণ
2. **TLS 1.3 হলো 1 round-trip** — TLS 1.2-এর চেয়ে অনেক বেশি দ্রুত
3. **Certificate গুলো একটা chain of trust তৈরি করে** যা আগে থেকে ইনস্টল করা root CA পর্যন্ত পৌঁছায়
4. **Diffie-Hellman key exchange** shared secret বানায় সেটা তারের ওপর দিয়ে না পাঠিয়েই
5. **Perfect Forward Secrecy** মানে আজকের key ফাঁস হলেও গতকালের ট্রাফিক ফাঁস হয় না
