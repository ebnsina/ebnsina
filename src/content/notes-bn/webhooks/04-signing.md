---
title: 'Payload signing'
subtitle: 'একটা unsigned webhook হলো একটা public POST endpoint। URL আন্দাজ করা যে কেউ event জাল করতে পারে। একটা timestamp সহ canonical string-এর ওপর HMAC-ই হলো সরল, সঠিক সমাধান।'
chapter: 4
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['webhooks', 'hmac', 'signatures', 'security', 'replay']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

একটা webhook URL, প্রয়োজনের খাতিরেই, খোলা internet-এ থাকে। receiver-কে প্রতি request-এ handshake ছাড়াই আপনার IP থেকে POST accept করতে হয়। signing ছাড়া, URL জানা যে কেউ — logfile থেকে ফাঁস, একটা stack trace, একটা bug bounty disclosure — এমন জাল event পাঠাতে পারে যা আসল দেখায়।

সমাধান হলো **HMAC**: একটা shared secret, প্লাস একটা hash, প্লাস একটা timestamp। এই অধ্যায়টা হলো spec; অধ্যায় ৫ হলো receiver-এর কোড।

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা HMAC signature অনেকটা একটা খামের ওপর মোমের সিলের মতো — এটা প্রমাণ করে চিঠিটা আপনার কাছ থেকে এসেছে আর পথে খোলা হয়নি।

</Callout>

## Threat model

Signing তিনটে আক্রমণের বিরুদ্ধে রক্ষা করে:

1. **Forgery।** attacker producer সেজে আপনার URL-এ POST করে।
2. **Tampering।** producer-এর POST intercept করে পথে body পরিবর্তন করা হয়।
3. **Replay।** attacker একটা আসল signed POST capture করে পরে আবার পাঠায়, সম্ভবত বহুবার।

HMAC প্লাস একটা timestamped canonical string তিনটেকেই হারায়। সাধারণ webhook traffic-এর জন্য আর কিছু লাগে না।

Signing যা **করে না**:

- আপনার shared secret আছে এমন attacker-কে রক্ষা করে না। (সেটা একটা compromise; secret rotate করুন।)
- receiver-এর verification কোডের bug ঠেকায় না। (অধ্যায় ৫।)
- যেসব receiver `type` বা `data` নির্বিশেষে প্রতিটা signed payload accept করে তাদের রক্ষা করে না। (receiver-দের এখনও semantic-ভাবে validate করতে হবে।)

## গড়ন — Stripe-এর pattern

Stripe-এর signature header দেখতে এমন:

```
Stripe-Signature: t=1714831200,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

তিনটে অংশ:

- `t=1714831200` — producer কখন sign করল তার Unix timestamp (second)।
- `v1=...` — version 1 signature, hex-encoded HMAC-SHA256।
- (rotation-এর সময় legacy version-এর জন্য optional `v0=...`।)

signature গণনা করা হয় একটা **canonical string**-এর ওপর:

```
canonical_string = timestamp + "." + raw_body
signature = hex(hmac_sha256(secret, canonical_string))
```

receiver header-এর timestamp আর raw body byte concatenate করে, একই HMAC গণনা করে, আর `v1=` value-এর সাথে মেলায়। মিলল → authentic।

## timestamp আগে জুড়ে দেওয়া কেন

canonical string-এ timestamp না থাকলে, একটা signed POST capture করা attacker সেটা চিরকাল আবার পাঠাতে পারে — একই body, একই signature, সবসময় valid।

signed string-এর ভেতরে timestamp রাখলে প্রতিটা signature সময়ের একটা মুহূর্তের সাথে unique হয়ে যায়। receiver check করে: "এই timestamp কি যথেষ্ট সাম্প্রতিক?" (সাধারণত ৫ মিনিট)। খুব পুরনো হলে, reject — signature নিজে গণিতগতভাবে valid হলেও।

```
timestamp ছাড়া:  POST body: {"id":"evt_a"} signature: abc123
                    কাল একই body আর signature দিয়ে replay — server-এর বলার উপায় নেই।

timestamp সহ:     POST body: {"id":"evt_a"} timestamp: 1714831200  signature: abc123
                    কাল replay — receiver পুরনো timestamp দেখে, reject করে।
```

timestamp-কে **দুই জায়গায়ই** থাকতে হবে — header-এ (যাতে receiver পড়ে) আর canonical string-এ (যাতে বদলালে signature invalid হয়)। signed string-এ না রাখলে, attacker কেবল header-টা আবার লিখে দেয়।

## Canonical string — একদম ঠিকঠাক করুন

সবচেয়ে কঠিন signing bug হলো **producer কী sign করল আর receiver কী verify করল, তা নিয়ে অমিল**। দেখতে একই এমন দুটো implementation "canonical string"-এর জন্য ভিন্ন byte তৈরি করতে পারে।

format-টা লক করুন:

```
canonical_string = <timestamp_seconds> + "." + <raw_request_body_bytes>
```

যেখানে:

- `timestamp_seconds` হলো একটা decimal integer string (leading zero নেই, fractional অংশ নেই)।
- `.` একটা literal period।
- `raw_request_body_bytes` হলো POST body-র **হুবহু byte** — কোনো JSON re-encoding নেই, কোনো whitespace normalization নেই।

"no re-encoding" নিয়মটা critical। আপনার producer `{"a":1,"b":2}` (যে byte আপনি POST করেন) sign করলে, receiver-কে ঠিক ওই byte-এর বিপরীতে verify করতে হবে। receiver একটা JSON object-এ parse করে re-encode করলে (যা `{"b":2,"a":1}` তৈরি করতে পারে বা whitespace-এ ভিন্ন হতে পারে), re-encoded version-এর HMAC মিলবে না। **raw body byte sign আর verify করুন।**

বেশিরভাগ web framework আপনার handler দেখার আগেই body parse করে ফেলে। আপনাকে opt out করতে হবে — raw body পড়ুন, তারপর process করার জন্য আলাদা করে parse করুন।

## Producer কোড

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

অধ্যায় ৩-এর sender-এ, header set করুন:

```go
sigHeader := sign(body, []byte(subscription.Secret), time.Now())
req.Header.Set("X-Webhook-Signature", sigHeader)
```

producer-এর দিকের পুরো পরিবর্তন এটুকুই। ~১০ লাইন।

## Shared secret

প্রতিটা subscription-এর নিজস্ব secret আছে। subscription তৈরির সময় এটা generate করুন, producer-এর database-এ store করুন (rest-এ encrypted), customer-কে **একবার** দেখান:

```
Your webhook signing secret is:
whsec_AbC123dEf456...

Save this securely. We will not show it again.
```

Customer-রা secret-টা তাদের receiver কোডে paste করে। হারালে, তারা regenerate করে (যা পুরনো secret invalid করে)।

Format convention:

- 32+ random byte (256+ bit entropy)।
- base64 বা hex হিসেবে encoded; একটা `whsec_` prefix log-এ role স্পষ্ট করে।
- প্রতি subscription-এ একটা secret। receiver জুড়ে secret কখনও share করবেন না।

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

## Key rotation — v0/v1 pattern

একসময় আপনার একটা customer-এর secret rotate করতে হবে। naive উপায় (secret বদলে দিয়ে তাদের update করতে বাধ্য করা) চলমান receiver-দের মাঝপথে ভাঙে। ভালো: rotation-এর সময় **দুটো valid secret** সমর্থন করুন।

producer নতুন secret দিয়ে sign করে, header-এ **দুটো** signature version emit করে:

```
X-Webhook-Signature: t=1714831200,v1=<sig with new secret>,v0=<sig with old secret>
```

receiver প্রতিটা version চেষ্টা করে; কোনো একটা মিললে, accept করে। সব customer নতুন secret-এ update করার পরে, `v0` retire করুন। এটা হুবহু Stripe-এর pattern; version number-গুলো শুধু "primary" আর "rolling-out"-এর label।

algorithm rotation-এর জন্য (SHA-256 → SHA-512), একই কাজ করুন: `v1=...` (legacy) আর `v2=...` (new) দুটোই emit করুন, receiver-দের সবচেয়ে শক্তটা prefer করতে দিন, migration-এর পরে পুরনোটা retire করুন।

## Algorithm পছন্দ — HMAC-SHA256

SHA-256-এর ওপর HMAC হলো সঠিক default। কিছু নোট:

- **plain SHA-256 of `secret + body` ব্যবহার করবেন না।** সেটা length-extension attack-এর কাছে vulnerable। HMAC এটা এড়াতেই ডিজাইন করা; HMAC ব্যবহার করুন।
- **SHA-1 ব্যবহার করবেন না।** Cryptographically দুর্বল। SHA-256 বা তার চেয়ে শক্ত।
- **MD5 ব্যবহার করবেন না।** ভাঙা।
- **Asymmetric signature (Ed25519, ECDSA)** high-security ক্ষেত্রের জন্য একটা option — receiver একটা public key দিয়ে verify করে, কোনো shared secret নেই। গণনায় ধীর, বেশি জটিল; HMAC-SHA256 ৯৯% প্রয়োজন কভার করে।

Go-র `crypto/hmac` package `hmac.Equal`-এর জন্য constant-time comparison ব্যবহার করে — _receiver_-এর দিকে (অধ্যায় ৫) timing attack এড়াতে গুরুত্বপূর্ণ। producer শুধু গণনা করে; কেবল receiver compare করে।

<Callout type="info">

**TLS client certificate কেন নয়?** Client cert (mTLS) HMAC-এর চেয়ে শক্তিশালী: per-call cryptographic identity, কোনো shared secret নেই। কিছু webhook সিস্টেম সেগুলো option হিসেবে দেয়। খারাপ দিক: customer-দের TLS infrastructure সেট আপ করতে হয়, cert manage করতে হয়, তাদের reverse proxy configure করতে হয়। বেশিরভাগ webhook-এর জন্য, HMAC-এর per-customer জটিলতা অনেক কম। যেসব high-security B2B integration-এ customer সামলাতে পারে সেখানে mTLS ব্যবহার করুন।

</Callout>

## কী sign করবেন

**raw body** sign করুন। ঐচ্ছিকভাবে canonical string-এ নির্বাচিত header অন্তর্ভুক্ত করুন, কিন্তু কেবল যদি জোরালো কারণ থাকে — আপনি যত header sign করেন, প্রতিটা receiver-কে হুবহু reproduce করতে হয়।

যা আপনি অতিরিক্ত sign করতে পারেন:

- **destination URL path**, যদি একই domain-এ subscription-এর মধ্যে endpoint অদলবদল করা attacker নিয়ে চিন্তিত থাকেন। বিরল।
- একটা header-এ signed একটা **subscription ID**, যাতে receiver সঠিক secret বাছতে পারে। কিন্তু URL নিজেই সাধারণত subscription চিহ্নিত করে, তাই এটা অপ্রয়োজনীয়।

canonical string-এ field যোগ করা একটা breaking change। এটা একটা নতুন signature version (`v2`) দিয়ে করুন, `v1` পরিবর্তন করে নয়।

## Replay protection — timestamp window

receiver যেকোনো event reject করে যার `t=` timestamp "এখন" থেকে ~৫ মিনিটের বেশি আলাদা। এটা attacker capture আর replay-এর মধ্যে কতক্ষণ অপেক্ষা করতে পারে তা cap করে।

```go
const replayWindow = 5 * time.Minute

func tooOld(t time.Time) bool {
    return time.Since(t) > replayWindow
}
```

window একটা tradeoff:

- **টাইট (১ মিনিট):** শক্ত replay protection; খুব ছোট clock skew সহ্য করে।
- **ঢিলে (১ ঘণ্টা):** দুর্বল protection কিন্তু ভয়ানক clock সহ্য করে। এড়িয়ে চলুন।

৫ মিনিট হলো standard। আপনার producer আর সব receiver NTP ব্যবহার করলে ১–২ মিনিটে টাইট করুন। কেবল clock সমস্যার প্রমাণ থাকলে ঢিলে করুন।

## Producer-এর clock গুরুত্বপূর্ণ

producer-এর clock ৬ মিনিট drift করলে, প্রতিটা receiver প্রতিটা event reject করে। producer-এ NTP চালান; clock কয়েক সেকেন্ডের বেশি off হলে alert দিন।

receiver-দের জন্য clock আরও বেশি গুরুত্বপূর্ণ — timestamp কতটা সাম্প্রতিক তার ভিত্তিতে তারা acceptance ঠিক করে। ১০ মিনিট এগিয়ে থাকা receiver current event reject করে; ১০ মিনিট পিছিয়ে থাকা receiver replay accept করে।

## Anti-pattern: URL-এ secret দিয়ে signing

signing secret-কে URL-এর অংশ করবেন না (`POST /webhooks/secret-here`)। URL শেষমেশ এখানে চলে যায়:

- Producer log।
- Intermediary-তে (CDN, WAF) HTTPS access log।
- কেউ হাত দিয়ে URL টেস্ট করলে browser history।
- receiver redirect করলে HTTP referer header।

Secret অবশ্যই body বা header-এ যাবে, কখনও path-এ নয়। URL হলো _কোন_ subscription চিহ্নিত করার জন্য; secret হলো authenticity প্রমাণের জন্য।

## Anti-pattern: request-এ secret পাঠানো

কিছু আদি webhook সিস্টেম secret-টা একটা header-এ রাখত (`X-Auth-Token: secret-here`)। receiver সেটাকে প্রত্যাশিত secret-এর সাথে মেলায়। HMAC ঠিক এটাকে প্রতিস্থাপন করতেই ডিজাইন করা হয়েছিল — প্রতিটা request-এ secret পাঠানো মানে একটা intercept করা request-ই সেটা ফাঁস করে দেয়।

HMAC secret থেকে derive করা একটা _signature_ পাঠায়, secret নিজে নয়। subscription তৈরির পরে secret আর কখনও তারের ওপর দিয়ে যায় না।

## নমুনা পূর্ণ POST

অধ্যায় ৩-এর sender, signed:

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

timestamp-এর পাশাপাশি body byte-ই HMAC-এর input। পথে যেকোনো byte পরিবর্তন — JSON whitespace, character escape — signature invalid করে।

## রিক্যাপ

- Signing forgery, tampering, আর replay-এর বিরুদ্ধে রক্ষা করে। তিন আক্রমণ, এক mechanism।
- `<timestamp>.<raw_body>`-এর ওপর HMAC-SHA256। Hex-encode। header হলো `t=<ts>,v1=<sig>`।
- timestamp canonical string-এর ভেতরে থাকতে **হবে**, শুধু header-এ নয়।
- body-র **raw byte** sign করুন। কোনো re-encoding নেই।
- প্রতি subscription-এ একটা secret। 32 random byte, base64url, `whsec_` prefix।
- `v0` আর `v1` দুটো signature emit করে rotate করুন, migration-এর পরে `v0` retire করুন।
- HMAC, plain hash নয়। SHA-256, SHA-1 নয়।
- Replay window ৫ মিনিট। প্রতিটা host-এ NTP।
- URL-এ কখনও secret রাখবেন না বা header হিসেবে পাঠাবেন না।

পরবর্তী: [Signature verify করা](/notes/webhooks/05-verifying) — receiver-এর দিক, timing-safe compare আর framework body-parsing ফাঁদ সহ।
