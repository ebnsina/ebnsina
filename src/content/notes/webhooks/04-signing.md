---
title: 'Signing payloads'
subtitle: 'An unsigned webhook is a public POST endpoint. Anyone who guesses the URL can forge events. HMAC over a canonical string with a timestamp is the simple, correct fix.'
chapter: 4
level: 'beginner'
readingTime: '12 min'
topics: ['webhooks', 'hmac', 'signatures', 'security', 'replay']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

A webhook URL is, by necessity, on the open internet. The receiver must accept POSTs from your IPs without a per-request handshake. Without signing, anyone who knows the URL — leaked from a logfile, a stack trace, a bug bounty disclosure — can send fake events that look real.

The fix is **HMAC**: a shared secret, plus a hash, plus a timestamp. This chapter is the spec; chapter 5 is the receiver code.

<Callout type="info">

**Real-World Analogy**

An HMAC signature is like a wax seal on an envelope — it proves the letter came from you and wasn't opened in transit.

</Callout>

## The threat model

Three attacks signing defends against:

1. **Forgery.** Attacker POSTs to your URL pretending to be the producer.
2. **Tampering.** Producer's POST is intercepted and the body modified in transit.
3. **Replay.** Attacker captures a real signed POST and resends it later, possibly many times.

HMAC plus a timestamped canonical string defeats all three. Nothing else needed for typical webhook traffic.

What signing does **not** defend against:

- An attacker who has your shared secret. (That is a compromise; rotate the secret.)
- Bugs in the receiver's verification code. (Chapter 5.)
- Receivers that accept every signed payload regardless of `type` or `data`. (Receivers must still validate semantically.)

## The shape — Stripe's pattern

Stripe's signature header looks like:

```
Stripe-Signature: t=1714831200,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

Three parts:

- `t=1714831200` — Unix timestamp (seconds) when the producer signed.
- `v1=...` — version 1 signature, hex-encoded HMAC-SHA256.
- (Optional `v0=...` for legacy versions during rotation.)

The signature is computed over a **canonical string**:

```
canonical_string = timestamp + "." + raw_body
signature = hex(hmac_sha256(secret, canonical_string))
```

The receiver concatenates the timestamp from the header with the raw body bytes, computes the same HMAC, and compares to the `v1=` value. Match → authentic.

## Why prepend the timestamp

Without the timestamp in the canonical string, an attacker who captures a signed POST can resend it forever — same body, same signature, always valid.

Putting the timestamp inside the signed string makes each signature unique to a moment in time. The receiver checks: "Is this timestamp recent enough?" (5 minutes typically). If too old, reject — even if the signature itself is mathematically valid.

```
Without timestamp:  POST body: {"id":"evt_a"} signature: abc123
                    Replay tomorrow with same body and signature — server has no way to tell.

With timestamp:     POST body: {"id":"evt_a"} timestamp: 1714831200  signature: abc123
                    Replay tomorrow — receiver sees old timestamp, rejects.
```

The timestamp must be in **both** the header (so the receiver reads it) and the canonical string (so altering it invalidates the signature). Without putting it in the signed string, the attacker just rewrites the header.

## The canonical string — get it exactly right

The hardest signing bug is **disagreement on what the producer signed and the receiver verifies**. Two implementations that look identical can produce different bytes for "the canonical string."

Lock the format down:

```
canonical_string = <timestamp_seconds> + "." + <raw_request_body_bytes>
```

Where:

- `timestamp_seconds` is a decimal integer string (no leading zeros, no fractional part).
- `.` is a literal period.
- `raw_request_body_bytes` is the **exact bytes** of the POST body — no JSON re-encoding, no whitespace normalization.

The "no re-encoding" rule is critical. If your producer signs `{"a":1,"b":2}` (the bytes you POST), the receiver must verify against those exact bytes. If the receiver parses to a JSON object and re-encodes (which may produce `{"b":2,"a":1}` or differ in whitespace), the HMAC of the re-encoded version will not match. **Sign and verify the raw body bytes.**

Most web frameworks parse the body before your handler sees it. You have to opt out — read the raw body, then parse separately for processing.

## Producer code

```go
package webhooks

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "time"
)

func sign(body []byte, secret []byte, ts time.Time) string {
    timestamp := fmt.Sprintf("%d", ts.Unix())

    h := hmac.New(sha256.New, secret)
    h.Write([]byte(timestamp))
    h.Write([]byte("."))
    h.Write(body)
    sig := hex.EncodeToString(h.Sum(nil))

    return fmt.Sprintf("t=%s,v1=%s", timestamp, sig)
}
```

In the sender from chapter 3, set the header:

```go
sigHeader := sign(body, []byte(subscription.Secret), time.Now())
req.Header.Set("X-Webhook-Signature", sigHeader)
```

That is the entire producer-side change. ~10 lines.

## The shared secret

Each subscription has its own secret. Generate it on subscription creation, store it in the producer's database (encrypted at rest), display it to the customer **once**:

```
Your webhook signing secret is:
whsec_AbC123dEf456...

Save this securely. We will not show it again.
```

Customers paste the secret into their receiver code. If they lose it, they regenerate (which invalidates the old secret).

Format conventions:

- 32+ random bytes (256+ bits of entropy).
- Encoded as base64 or hex; a `whsec_` prefix makes the role obvious in logs.
- One secret per subscription. Never share secrets across receivers.

```go
import "crypto/rand"

func generateSecret() (string, error) {
    b := make([]byte, 32)
    if _, err := rand.Read(b); err != nil {
        return "", err
    }
    return "whsec_" + base64.RawURLEncoding.EncodeToString(b), nil
}
```

## Key rotation — the v0/v1 pattern

Eventually you need to rotate a customer's secret. The naive approach (replace the secret, force them to update) breaks active receivers in flight. Better: support **two valid secrets** during rotation.

The producer signs with the new secret while emitting **two** signature versions in the header:

```
X-Webhook-Signature: t=1714831200,v1=<sig with new secret>,v0=<sig with old secret>
```

The receiver tries each version; if any matches, accepts. After all customers have updated to the new secret, retire `v0`. This is exactly Stripe's pattern; the version numbers are just labels for "primary" and "rolling-out."

For algorithm rotation (SHA-256 → SHA-512), do the same: emit both `v1=...` (legacy) and `v2=...` (new), let receivers prefer the strongest, retire the old after migration.

## Algorithm choice — HMAC-SHA256

HMAC over SHA-256 is the right default. Notes:

- **Don't use plain SHA-256 of `secret + body`.** That's vulnerable to length-extension attacks. HMAC was designed to avoid this; use HMAC.
- **Don't use SHA-1.** Cryptographically weakened. SHA-256 or stronger.
- **Don't use MD5.** Broken.
- **Asymmetric signatures (Ed25519, ECDSA)** are an option for high-security cases — the receiver verifies with a public key, no shared secret. Slower to compute, more complex; HMAC-SHA256 covers 99% of needs.

The `crypto/hmac` package in Go uses constant-time comparison for `hmac.Equal` — important on the _receiver_ side (chapter 5) to avoid timing attacks. The producer just computes; only the receiver compares.

<Callout type="info">

**Why not TLS client certificates?** Client certs (mTLS) are stronger than HMAC: per-call cryptographic identity, no shared secret. Some webhook systems offer them as an option. The downside: customers must set up TLS infrastructure, manage certs, configure their reverse proxy. For most webhooks, HMAC's complexity-per-customer is much lower. Use mTLS for high-security B2B integrations where customers can handle it.

</Callout>

## What to sign

Sign **the raw body**. Optionally include selected headers in the canonical string, but only if you have a strong reason — every header you sign becomes a thing the receiver must reproduce exactly.

Things you might also sign:

- The **destination URL path**, if you're worried about an attacker swapping endpoints between subscriptions on the same domain. Rare.
- A **subscription ID** in a header, signed, so the receiver can pick the right secret. But the URL itself usually identifies the subscription, so this is redundant.

Adding fields to the canonical string is a breaking change. Do it via a new signature version (`v2`), not by mutating `v1`.

## Replay protection — timestamp window

Receivers reject any event whose `t=` timestamp differs from "now" by more than ~5 minutes. This caps how long an attacker can wait between capturing and replaying a signed payload.

```go
const replayWindow = 5 * time.Minute

func tooOld(t time.Time) bool {
    return time.Since(t) > replayWindow
}
```

The window is a tradeoff:

- **Tight (1 minute):** strong replay protection; tolerates very small clock skew.
- **Loose (1 hour):** weak protection but tolerates terrible clocks. Avoid.

5 minutes is the standard. Tighten to 1–2 minutes if your producer and all receivers use NTP. Loosen only if you have evidence of clock issues.

## Producer clock matters

If the producer's clock drifts by 6 minutes, every receiver rejects every event. Run NTP on the producer; alert if the clock is more than a few seconds off.

For receivers, the clock matters even more — they decide acceptance based on how recent the timestamp is. A receiver running 10 minutes ahead rejects current events; a receiver 10 minutes behind accepts replays.

## Anti-pattern: signing with the URL secret

Don't make the signing secret part of the URL itself (`POST /webhooks/secret-here`). The URL ends up in:

- Producer logs.
- HTTPS access logs at intermediaries (CDN, WAF).
- Browser history if anyone tested the URL by hand.
- HTTP referer headers if the receiver redirects.

Secrets must travel in the body or headers, never the path. The URL is for identifying _which_ subscription; the secret is for proving authenticity.

## Anti-pattern: sending the secret in the request

Some early webhook systems put the secret in a header (`X-Auth-Token: secret-here`). The receiver compares to the expected secret. This is what HMAC was designed to replace — sending the secret on every request means a single intercepted request leaks it.

HMAC sends a _signature_ derived from the secret, not the secret itself. The secret never crosses the wire after subscription creation.

## Sample full POST

The chapter-3 sender, signed:

```
POST /webhooks HTTP/1.1
Host: customer.example.com
Content-Type: application/json
User-Agent: myapp-webhooks/1.0
X-Webhook-ID: evt_01HF5J7XK4TG6N2VRT9P0M3DZ4
X-Webhook-Type: payment.succeeded
X-Webhook-Timestamp: 1714831200
X-Webhook-Signature: t=1714831200,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
Content-Length: 234

{"id":"evt_01HF5J7XK4TG6N2VRT9P0M3DZ4","type":"payment.succeeded","created":"2026-05-04T12:00:00.123Z","api_version":"2026-05-01","data":{"object":{"id":"py_...","amount":4200,"currency":"usd","customer":"cus_42"}}}
```

The body bytes are the input to HMAC alongside the timestamp. Any byte changes during transit — JSON whitespace, character escapes — invalidate the signature.

## Recap

- Signing defends against forgery, tampering, and replay. Three attacks, one mechanism.
- HMAC-SHA256 over `<timestamp>.<raw_body>`. Hex-encode. Header is `t=<ts>,v1=<sig>`.
- The timestamp **must** be inside the canonical string, not just in the header.
- Sign the **raw bytes** of the body. No re-encoding.
- One secret per subscription. 32 random bytes, base64url, `whsec_` prefix.
- Rotate by emitting both `v0` and `v1` signatures, retiring `v0` after migration.
- HMAC, not plain hash. SHA-256, not SHA-1.
- Replay window 5 minutes. NTP on every host.
- Never put the secret in the URL or send it as a header.

Next: [Verifying signatures](/notes/webhooks/05-verifying) — the receiver side, with timing-safe compare and the framework body-parsing trap.
