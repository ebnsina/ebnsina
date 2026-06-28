---
title: 'What TLS Actually Is'
subtitle: 'TLS does two jobs: it encrypts your traffic, and it proves the server is who it says it is. The two halves work together — neither alone is enough.'
chapter: 1
level: 'beginner'
readingTime: '9 min'
topics: ['tls', 'ssl', 'encryption', 'identity', 'https']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A tamper-evident envelope that also proves who sealed it — private, authentic, and detectable if opened in transit.

</Callout>

## The two jobs

When you load `https://example.com`, two things must be true:

1. **No one else can read what you and example.com say to each other.** Not your ISP, not the coffee-shop wifi, not a router halfway around the world.
2. **You are actually talking to example.com.** Not to an attacker who has placed themselves in the middle and is reading everything you send.

These are _encryption_ and _authentication_, and TLS is the protocol that delivers both in the same package. Drop either half and the other becomes useless: an encrypted channel to an attacker is no better than plaintext to the real server.

## Why HTTP alone is not enough

HTTP is plaintext. Every byte of every request and response travels in the clear. On the same network as the user, anyone can read passwords, session cookies, page contents — and worse, modify them in flight.

```bash
# What an HTTP request looks like on the wire:
$ tcpdump -A -i any port 80 host example.com
GET / HTTP/1.1
Host: example.com
Cookie: session=abc123secret
```

That cookie just leaked to anyone packet-sniffing the network. With HTTPS, a sniffer sees this:

```text
0x0000:  4500 005c 1234 4000 4006 b1c4 c0a8 0102
0x0010:  5db8 d822 a3e4 01bb 1234 5678 9abc def0
0x0020:  8018 0810 a1b2 0000 0101 0a0a a3e4 1234
...
```

Random-looking ciphertext. The sniffer can see _that_ you connected to a particular IP, but not what you said.

## Symmetric vs asymmetric encryption — both are needed

TLS uses two kinds of cryptography simultaneously, because each is good at something the other is bad at.

**Symmetric encryption** uses a single shared key. Both sides have the same key, both sides encrypt and decrypt with it. AES is the most common modern symmetric cipher. It is _extremely fast_ — a modern CPU encrypts 1GB/s per core with hardware-accelerated AES-GCM.

The catch: how do you exchange the shared key in the first place? Send it over the network, and an eavesdropper has it.

**Asymmetric encryption** uses a _pair_ of keys: a public key (safe to share) and a private key (secret). Anything encrypted with the public key can only be decrypted with the private key. This solves the key-exchange problem — the server publishes its public key, the client uses it to send a secret only the server can read.

The catch: asymmetric crypto is _slow_. RSA at 2048 bits is around 100x slower than AES per byte. Using it for every packet would crush performance.

The TLS solution: use _both_. Asymmetric crypto to negotiate a shared symmetric key, then symmetric crypto for the rest of the session.

```text
client   ──── (encrypted with server's public key) ───►  server
         "Here is a fresh symmetric key, call it K"

[then both sides encrypt/decrypt subsequent traffic with K]
```

Modern TLS does not literally encrypt the symmetric key with the server's public key — it uses **Diffie-Hellman key exchange**, where both sides combine their own ephemeral randomness with the other side's contribution to derive the same K, without ever sending K itself. But the principle is the same: asymmetric for setup, symmetric for the bulk traffic.

## Identity — the certificate

Encryption alone is not enough. Imagine you connect to `example.com`. Your traffic is encrypted... but to whom? Without identity, an attacker on your network can intercept the connection, present _their own_ public key, and you happily encrypt your password to them. They decrypt, log it, then forward to the real server. Classic man-in-the-middle.

Identity comes from a **certificate**: a small file that says "this public key belongs to example.com" — and is signed by a third party your computer already trusts (a Certificate Authority).

A certificate looks like this (when decoded):

```text
Subject: CN = example.com
Issuer: CN = Let's Encrypt Authority X3
Public Key: <the server's public key>
Valid: 2026-04-01 to 2026-06-30
Signature: <Let's Encrypt's signature over all of the above>
```

Your browser comes preinstalled with a list of root CAs (Let's Encrypt, DigiCert, GlobalSign, Sectigo, and a few dozen others). When the server presents its certificate, your browser:

1. Checks that the certificate's domain (`CN` or `SAN`) matches the domain you typed.
2. Verifies the signature using Let's Encrypt's public key.
3. Verifies that Let's Encrypt's certificate was, in turn, signed by a root CA your OS trusts.
4. Checks the validity dates and the revocation status.

If all of that passes, the public key in the certificate is trusted to be the real example.com's. The man-in-the-middle attack falls apart because the attacker cannot produce a valid certificate for example.com signed by a real CA — they would have to compromise the CA itself, which is what makes CAs the most security-critical organizations on the internet.

## TLS vs SSL — same thing, mostly

You will hear "SSL" used as a synonym for TLS. Historically:

- **SSL 1.0** — Netscape, 1994. Never released; broken before launch.
- **SSL 2.0** — 1995. Broken; deprecated.
- **SSL 3.0** — 1996. Broken; POODLE attack in 2014. Disabled everywhere.
- **TLS 1.0** — 1999. Renamed from SSL. Old; deprecated by browsers.
- **TLS 1.1** — 2006. Marginal; deprecated.
- **TLS 1.2** — 2008. Still widely used. Safe with modern config.
- **TLS 1.3** — 2018. Current. Faster handshake, simpler protocol, no legacy cruft.

Modern systems should support TLS 1.2 and 1.3 only. Everything older is unsafe or vulnerable to known attacks.

The colloquial "SSL certificate" is a TLS certificate. People say SSL because they grew up with that name; the technology is TLS.

## What TLS does _not_ do

A few common misconceptions worth clearing:

- **TLS does not hide which site you visited.** The destination IP is still in the clear. With **SNI** (Server Name Indication), the hostname is also in the clear during the handshake — though TLS 1.3 + Encrypted Client Hello can hide it.
- **TLS does not prevent the server from logging your data.** Once the server decrypts the request, it can do whatever it wants. Encryption protects bytes in flight, not at rest.
- **TLS does not authenticate you to the server** by default. The certificate proves the server's identity to _you_. Mutual TLS (mTLS) — where the client also has a certificate — is the optional inverse, used in service-to-service authentication.
- **TLS does not protect against bugs in your application.** A site with TLS but a SQL injection vulnerability is wide open. TLS protects the channel; you protect the application.
- **TLS does not prevent traffic analysis.** An attacker watching encrypted traffic can still see _how much_ and _when_ — the size of bursts of bytes can leak which page you loaded, even if the bytes themselves are unreadable.

## Performance cost — much smaller than you think

The historical objection to "always-HTTPS" was performance. In 2010 it was real. In 2026 it is not.

- **CPU cost** — modern CPUs have AES-NI hardware acceleration. AES-GCM at gigabits per second per core. ChaCha20-Poly1305 (used on devices without AES-NI) is similarly fast.
- **Latency cost** — the handshake adds 1–2 round trips. TLS 1.3 brought this to 1 RTT (sometimes 0 with session resumption). On a fast network, 50–100 ms one time per session.
- **Memory cost** — a few KB per active connection for cipher state. Negligible compared to other per-connection overhead.

For 99.9% of services, the answer to "should I use HTTPS" is: yes, always, no exceptions. The cost is invisible. The benefit is that your users' traffic is private.

<Callout type="info">

**TLS is mandatory in modern web platforms.**

HTTP/2 and HTTP/3 require TLS in browsers. Service workers require TLS. The Geolocation API, microphone, camera, push notifications — all require TLS. Even if you do not care about privacy, the platform itself has effectively required TLS since around 2017.

</Callout>

## What you actually need to do

To turn a plain-HTTP site into HTTPS, you need:

1. **A domain you control** — `example.com`, with DNS pointing at your server.
2. **A certificate** issued for that domain by a CA — typically Let's Encrypt, free and automated.
3. **A web server configured** to use the certificate — nginx, with paths in `/etc/letsencrypt/live/example.com/`.
4. **A renewal process** — Let's Encrypt certs are valid for 90 days; certbot renews automatically.

The next chapters cover each in turn. Chapter 2 walks through what actually happens during a TLS handshake. Chapter 3 explains certificates and the chain of trust. Chapters 4–6 issue a real certificate. Chapters 7–8 configure nginx and keep things running.

## Recap

- TLS does two jobs: encrypts the channel and proves the server's identity. Both halves are required.
- Symmetric encryption (AES) is fast but needs a shared key. Asymmetric (RSA, ECC) solves key exchange but is slow. TLS uses both.
- Certificates bind a public key to a domain. A trusted CA signs them. Browsers verify signatures up to a preinstalled root CA.
- TLS 1.2 and 1.3 are the modern versions. Everything older is deprecated.
- TLS protects bytes in transit, not application bugs, not data at rest. It does not hide the destination IP.
- Performance cost is negligible on modern hardware. There is essentially no reason not to use HTTPS.

Next chapter: the handshake, byte by byte.
