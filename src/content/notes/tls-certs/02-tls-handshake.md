---
title: 'The TLS Handshake'
subtitle: 'ClientHello, ServerHello, key exchange, finished. The five-message conversation that turns a TCP connection into a secure session — and how TLS 1.3 cut it in half.'
chapter: 2
level: 'beginner'
readingTime: '12 min'
topics: ['tls', 'handshake', 'tls 1.3', 'ecdhe', 'alpn']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Two strangers agreeing on a secret code before talking in public — all negotiated in the open, but the result is private.

</Callout>

## What the handshake is for

Before any encrypted traffic flows, the client and server need to agree on:

1. **Which version of TLS** to speak (TLS 1.2 or 1.3).
2. **Which cipher suite** to use — what symmetric cipher, what hash, what mode.
3. **A shared symmetric key** — derived without ever sending it in the clear.
4. **Each other's identity** — the server proves it owns the certificate's private key. (And optionally, the client does the same with mTLS.)

The handshake is the messages that achieve all of this. In TLS 1.3 it takes one round trip; in TLS 1.2 it takes two. After the handshake, application data flows over a symmetrically-encrypted tunnel.

## TLS 1.3 — the modern handshake

We start with TLS 1.3 because it is simpler and what you should be running. (The older 1.2 handshake comes after.)

```text
client                                                  server

ClientHello
+ key_share
+ supported_versions
+ supported_groups
+ signature_algorithms
+ server_name (SNI)
+ alpn                ────────────────────────────────►
                                                         ServerHello
                                                         + key_share
                                                         + supported_versions
                                                         {EncryptedExtensions}
                                                         {Certificate}
                                                         {CertificateVerify}
                                                         {Finished}
                                                         [Application Data*]
                      ◄────────────────────────────────

{Finished}
[Application Data]    ────────────────────────────────►  [Application Data]

Legend:
  + key/value sent in plaintext
  {} encrypted with handshake key
  [] encrypted with application key
```

One round trip. After the client's `Finished`, both sides have keys derived from the exchange and are sending application data.

## Reading each message

**ClientHello.** The client says hello and offers everything it can do. Critical fields:

- **`supported_versions`** — TLS 1.3 (and 1.2 as a fallback indicator).
- **`key_share`** — the client's _ephemeral_ public key for one of the supported elliptic curves (typically X25519). The matching private key never leaves the client.
- **`supported_groups`** — what curves the client supports for key exchange (X25519, P-256, P-384).
- **`signature_algorithms`** — what algorithms the server can use to sign things (Ed25519, ECDSA-P-256, RSA-PSS, etc.).
- **`server_name`** — the SNI (Server Name Indication). Tells the server which hostname the client is asking about, so a server hosting many sites can pick the right certificate.
- **`alpn`** — Application-Layer Protocol Negotiation. The client lists `h2` and `http/1.1`; the server picks one. This is how HTTP/2 negotiates over TLS.

**ServerHello.** The server's response in plaintext:

- **`key_share`** — the server's matching ephemeral public key.
- **`supported_versions`** — confirms TLS 1.3.
- **Cipher suite picked** — typically `TLS_AES_128_GCM_SHA256` or `TLS_CHACHA20_POLY1305_SHA256`.

At this point, both sides have done the elliptic-curve Diffie-Hellman: each combined their own private key with the other's public key to derive the same secret. From that secret, both derive the _handshake key_ — used to encrypt the rest of the handshake.

Everything after the ServerHello is encrypted under this handshake key.

**EncryptedExtensions.** A grab-bag of optional extensions (e.g., the negotiated ALPN protocol).

**Certificate.** The server's certificate chain. The client verifies it (chapter 3 covers how).

**CertificateVerify.** The server signs a hash of the handshake-so-far with its certificate's private key. The client verifies the signature using the public key from the certificate. This proves the server actually possesses the private key, not just a copy of the certificate.

**Finished.** A MAC of the handshake-so-far, computed using a key derived from the exchange. Both sides do this. If the MACs match, the handshake was not tampered with.

After the `Finished`, both sides derive the _application key_ (different from the handshake key) and use it for encrypted application data. From this point on, every byte of HTTP is encrypted under that key.

## Why ephemeral keys — forward secrecy

The `key_share` in ClientHello and ServerHello use **ephemeral** keys — generated for this single connection and discarded after. The certificate's long-term private key is only used to _sign_ the handshake (in CertificateVerify), never to encrypt the session key.

This gives **forward secrecy**: even if an attacker records the entire handshake and later steals the server's private key, they cannot decrypt the recorded traffic. The session key was derived from ephemeral material that no longer exists.

Forward secrecy is the difference between "if my server is compromised tomorrow, all my historical traffic is decrypted" and "even if my server is compromised tomorrow, yesterday's traffic is still safe."

In TLS 1.2, forward secrecy was optional — only available with `ECDHE_*` and `DHE_*` cipher suites. TLS 1.3 makes it mandatory; there are no non-FS ciphers in 1.3.

## TLS 1.2 — the older handshake

Still widely deployed. Two round trips:

```text
client                                                  server

ClientHello                  ────────────────────────►
                                                         ServerHello
                                                         Certificate
                                                         ServerKeyExchange (for ECDHE)
                                                         ServerHelloDone
                             ◄────────────────────────

ClientKeyExchange
ChangeCipherSpec
Finished                     ────────────────────────►
                                                         ChangeCipherSpec
                                                         Finished
                             ◄────────────────────────

[Application Data]           ◄─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─►  [Application Data]
```

Differences worth knowing:

- **Two round trips.** The client cannot send any application data until both `Finished` messages are exchanged.
- **`ServerKeyExchange`** is a separate message in 1.2 — the server's ECDHE public key.
- **`ChangeCipherSpec`** is a vestigial message that switches from plaintext to encrypted communication. TLS 1.3 removed it (the change happens implicitly).
- **Cipher suite naming is verbose:** `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256` — key exchange (ECDHE), authentication (RSA), bulk cipher (AES-128-GCM), MAC (SHA-256). TLS 1.3 simplified to just `TLS_AES_128_GCM_SHA256`.

You should still support TLS 1.2 for clients on older systems, but TLS 1.3 should be the default for any modern client.

## SNI — virtual hosting over TLS

A single IP address can serve hundreds of websites. Without SNI, TLS would not know _which_ certificate to present — it would have to pick one before reading any HTTP headers (which would tell it the hostname).

SNI fixes this by including the hostname in the ClientHello, in plaintext:

```text
ClientHello
  ...
  server_name: example.com
```

The server reads this, picks the matching certificate from its config, and continues the handshake. nginx's `server_name` directive matches against this exact field.

The downside: SNI exposes which hostname you are connecting to, even though the rest of the connection is encrypted. ECH (Encrypted Client Hello) — a TLS 1.3 extension that is rolling out — encrypts SNI as well, eliminating this leak.

## ALPN — protocol negotiation

ALPN is how HTTP/2 was deployed over TLS without breaking everything. The client lists protocols it supports:

```text
alpn: h2, http/1.1
```

The server picks one in EncryptedExtensions:

```text
alpn: h2
```

Both sides now know to speak HTTP/2 over this TLS session. Without ALPN, you would have to commit to a port (443 = HTTP/1.1, 8443 = HTTP/2 — gross) or use a slower protocol-upgrade dance.

In nginx, enabling HTTP/2 sets up the ALPN response automatically:

```nginx
listen 443 ssl;
http2 on;
```

## 0-RTT — the dangerous shortcut

TLS 1.3 introduced **0-RTT** (zero round-trip time) resumption: if a client has connected to this server before and has a _resumption ticket_, it can send application data **in the very first packet**, alongside the ClientHello.

```text
client                                              server

ClientHello + key_share
+ pre_shared_key
+ early_data: GET / HTTP/1.1...    ──────────────►  [accepts or rejects 0-RTT]
                                                     ServerHello
                                                     ...
                                                     [response]
```

Massive latency win (effectively zero round trips for the request). The downside: 0-RTT data has **no replay protection** — an attacker who captures the ClientHello can replay it to the server later and get the same response. For idempotent GETs, this is fine. For state-changing requests (POST), it is dangerous.

Most servers either disable 0-RTT, or enable it only for safe methods. nginx requires explicit `ssl_early_data on;` opt-in, defaulting to off.

## Watching a handshake

```bash
openssl s_client -connect example.com:443 -tls1_3 -servername example.com
```

You will see the negotiated version, cipher, and the certificate chain. With `-msg`, you can see the handshake messages.

For a more readable view:

```bash
nmap --script ssl-enum-ciphers -p 443 example.com
```

This probes the server with various ClientHellos and reports which ciphers and versions it accepts. Use this to verify your server is not exposing TLS 1.0/1.1 or weak ciphers.

For browser-side details, open Chrome's DevTools → Security tab. It shows the negotiated TLS version, cipher, and certificate chain for the page you are looking at.

## Watching with Wireshark

Capture traffic to a server you control:

```bash
sudo tcpdump -i any -w /tmp/tls.pcap port 443
```

Open in Wireshark, filter on `tls.handshake.type`. You will see ClientHello, ServerHello, Certificate, etc. The application data is encrypted, but the handshake records (until ChangeCipherSpec or the equivalent in 1.3) are visible. This is how you debug "why is the handshake failing?" — the error in ServerHello often tells you exactly which extension or cipher mismatched.

## What can go wrong in a handshake

- **No common cipher suite.** Old client + modern server with only TLS 1.3 ciphers. Server returns `TLS Alert: handshake_failure`.
- **Certificate expired.** Browser refuses with `NET::ERR_CERT_DATE_INVALID`.
- **Hostname mismatch.** Browser refuses with `NET::ERR_CERT_COMMON_NAME_INVALID`. The certificate is for `www.example.com`, the user typed `example.com`.
- **Untrusted CA.** Self-signed cert, or a CA the browser does not have. `NET::ERR_CERT_AUTHORITY_INVALID`.
- **Wrong protocol version.** Server requires TLS 1.2+, client speaks only 1.0. `protocol_version` alert.
- **OCSP stapling failure.** Server's OCSP response is stale or missing. Browser may warn or block.

When debugging, the server's error log usually has the answer. nginx logs TLS errors with `error_log` at the `info` or `debug` level.

## Recap

- The TLS handshake is the conversation that turns TCP into a secure session — version negotiation, key exchange, identity proof, MAC verification.
- TLS 1.3 takes 1 round trip; TLS 1.2 takes 2. Both should be supported in modern config.
- Ephemeral key exchange (ECDHE/X25519) gives forward secrecy — even leaked private keys cannot decrypt past sessions.
- SNI puts the hostname in the ClientHello so virtual hosting works. ECH encrypts it.
- ALPN negotiates the application-layer protocol (HTTP/2 vs HTTP/1.1) during the handshake.
- 0-RTT is a 1.3 latency win but unsafe for non-idempotent requests.
- `openssl s_client` and Wireshark are the diagnostic tools when something is off.

Next chapter: certificates — what they actually contain, the chain of trust, and how validation works.
