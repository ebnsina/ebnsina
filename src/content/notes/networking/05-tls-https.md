---
title: "TLS & HTTPS"
subtitle: "Certificates, handshakes, and encryption — how TLS keeps your data private and verifies you're talking to the right server."
chapter: 5
level: "intermediate"
readingTime: "15 min"
topics: ["TLS", "HTTPS", "certificates", "encryption", "handshake"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What TLS Does

TLS (Transport Layer Security) provides three guarantees:

1. **Confidentiality** — data is encrypted; eavesdroppers see gibberish
2. **Integrity** — data can't be modified in transit without detection
3. **Authentication** — you're talking to the real server, not an impersonator

HTTPS is just HTTP over TLS. The `S` means your browser established a TLS connection before sending any HTTP data.

<Callout type="info">

**Real-World Analogy**

Like the sealed envelope system at a bank — before sending sensitive documents, both parties verify identity (certificates), agree on a secret code (key exchange), and then all messages travel in sealed envelopes (encryption).

</Callout>

## The TLS 1.3 Handshake

TLS 1.3 reduced the handshake from 2 round-trips (TLS 1.2) to just 1:

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
  supportedVersions: ["TLS 1.3"];
  cipherSuites: string[];
  keyShare: {
    group: "x25519" | "secp256r1";
    publicKey: Uint8Array;
  };
  sni: string; // "api.example.com"
}
```

## Certificates and Trust

How does your browser know it's really talking to `google.com`?

**Certificate chain:**
1. Google's server presents a **certificate** signed by a Certificate Authority (CA)
2. The CA's certificate is signed by a **root CA**
3. Root CA certificates are pre-installed in your browser/OS (the **trust store**)

```typescript
interface X509Certificate {
  subject: string;          // "*.google.com"
  issuer: string;           // "Google Trust Services"
  validFrom: Date;
  validTo: Date;
  publicKey: Uint8Array;
  signature: Uint8Array;    // signed by issuer's private key
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

TLS uses Diffie-Hellman to create a shared secret without ever sending it over the wire. Even if someone records all the traffic, they can't derive the key.

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

**Perfect Forward Secrecy (PFS)**: TLS 1.3 generates new key pairs for every connection. Even if someone steals the server's long-term private key, they can't decrypt past conversations — because each session used a unique ephemeral key.

</Callout>

## Common TLS Issues

```typescript
// Certificate pinning — extra security for mobile apps
const PINNED_HASHES = [
  "sha256/YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=",
];

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

**Never disable certificate verification** in production code (`rejectUnauthorized: false` in Node.js). It defeats the entire purpose of TLS — an attacker can present any certificate and you'll accept it.

</Callout>

## Key Takeaways

1. **TLS provides encryption, integrity, and authentication** — all three matter
2. **TLS 1.3 is 1 round-trip** — significantly faster than TLS 1.2
3. **Certificates form a chain of trust** back to pre-installed root CAs
4. **Diffie-Hellman key exchange** creates shared secrets without sending them over the wire
5. **Perfect Forward Secrecy** means compromising today's key doesn't reveal yesterday's traffic

