---
title: 'TLS Handshake'
subtitle: 'ClientHello, ServerHello, key exchange, finished। পাঁচ-মেসেজের কথোপকথন যা একটা TCP connection-কে একটা secure session-এ পরিণত করে — এবং TLS 1.3 কীভাবে সেটা অর্ধেক করে ফেলল।'
chapter: 2
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['tls', 'handshake', 'tls 1.3', 'ecdhe', 'alpn']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

দুইজন অপরিচিত মানুষ প্রকাশ্যে কথা বলার আগে একটা গোপন code-এ একমত হচ্ছে — সবকিছু খোলামেলা নেগোশিয়েট করা, কিন্তু ফলাফল private।

</Callout>

## গল্পে বুঝি

দামেস্কের এক পুরনো কারওয়ানসরাইয়ে দুই দূত — খোয়ারিজমি আর সিনা — প্রথমবার মুখোমুখি বসলেন। কারও কাছেই দামি খবর আছে, কিন্তু চারপাশে অচেনা কান। তাই কোনো গোপন কথা মুখ থেকে বের করার আগে তাঁরা একটা সাবধানী সূচনা-রীতি পালন করলেন। প্রথমে তাঁরা ঠিক করলেন কোন গুপ্ত ভাষায় কথা হবে — কয়েকটা সংকেত-পদ্ধতি দুজনেই জানেন, তার মধ্যে যেটা দুজনের কাছেই চেনা সেটাই বেছে নিলেন, প্রকাশ্যেই। তারপর খোয়ারিজমি কোমর থেকে বের করলেন খলিফার সিলমোহর-করা একটা পরিচয়পত্র, যেটা দেখে সিনা নিশ্চিত হলেন — এই লোক সত্যিই যে দাবি করছে সে-ই, কোনো ছদ্মবেশী নয়।

এবার সবচেয়ে সূক্ষ্ম ধাপ। দুজন মিলে, একে অপরের চোখের ইশারা আর হাতের কিছু গোপন সংকেত মিশিয়ে, এমন একটা পাসফ্রেজ তৈরি করলেন যেটা শুধু তাঁরা দুজনই জানেন — বাইরের কেউ পুরোটা শোনেনি, তবু দুজনের মাথায় এখন এক অভিন্ন গোপন শব্দ বসে গেছে। এতক্ষণে সব প্রস্তুতি শেষ। এবার আর স্বাভাবিক ভাষায় নয় — সেই গুপ্ত ভাষায়, সেই পাসফ্রেজে কোড করে, তাঁরা আসল গোপন আলাপ শুরু করলেন।

এই পুরো সূচনা-রীতিটাই আসলে **TLS handshake**। কোন গুপ্ত ভাষায় কথা হবে ঠিক করা মানে protocol আর cipher নেগোশিয়েট করা; সিলমোহর-করা পরিচয়পত্র দেখানো মানে server তার certificate দিয়ে identity প্রমাণ করা; আর মিলে গোপন পাসফ্রেজ বানানো মানে key exchange — যেখান থেকে দুই পক্ষ একটাই shared session key derive করে। তারপর কোড করে আলাপ শুরু মানে encrypted data flow শুরু। বাস্তবে আপনার browser যখন কোনো `https://` সাইটে যায়, প্রথম কোনো byte আসল ডেটা যাওয়ার আগে ঠিক এই ধাপগুলোই মিলিসেকেন্ডে ঘটে যায় — তাই আপনি নিশ্চিত থাকেন যে ওপারের সার্ভার আসল, আর মাঝপথে কেউ কিছু পড়তে পারছে না।

## Handshake কীসের জন্য

কোনো encrypted traffic বইতে শুরু করার আগে, client আর server-কে এসবে একমত হতে হবে:

1. **TLS-এর কোন ভার্সন** বলবে (TLS 1.2 নাকি 1.3)।
2. **কোন cipher suite** ব্যবহার করবে — কী symmetric cipher, কী hash, কী mode।
3. **একটা shared symmetric key** — কখনো খোলামেলা না পাঠিয়েই derive করা।
4. **একে অপরের identity** — সার্ভার প্রমাণ করে যে সে certificate-এর private key-এর মালিক। (এবং ঐচ্ছিকভাবে, client mTLS দিয়ে একই কাজ করে।)

Handshake হলো সেই মেসেজগুলো যা এসব অর্জন করে। TLS 1.3-তে এটা এক round trip নেয়; TLS 1.2-তে দুই। Handshake-এর পর, application data একটা symmetrically-encrypted tunnel-এর ওপর দিয়ে বইতে থাকে।

## TLS 1.3 — আধুনিক handshake

আমরা TLS 1.3 দিয়ে শুরু করছি কারণ এটা সহজতর আর এটাই আপনার চালানো উচিত। (পুরোনো 1.2 handshake পরে আসে।)

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

এক round trip। client-এর `Finished`-এর পর, দুই পক্ষেরই exchange থেকে derive করা key আছে আর তারা application data পাঠাচ্ছে।

## প্রতিটা মেসেজ পড়া

**ClientHello.** client hello বলে আর যা করতে পারে সব offer করে। গুরুত্বপূর্ণ ফিল্ড:

- **`supported_versions`** — TLS 1.3 (আর fallback ইঙ্গিত হিসেবে 1.2)।
- **`key_share`** — supported elliptic curve-গুলোর একটার জন্য client-এর _ephemeral_ public key (সাধারণত X25519)। মিলিয়ে থাকা private key কখনো client ছাড়ে না।
- **`supported_groups`** — key exchange-এর জন্য client কোন curve সাপোর্ট করে (X25519, P-256, P-384)।
- **`signature_algorithms`** — জিনিস sign করতে সার্ভার কোন algorithm ব্যবহার করতে পারে (Ed25519, ECDSA-P-256, RSA-PSS, ইত্যাদি)।
- **`server_name`** — SNI (Server Name Indication)। সার্ভারকে বলে client কোন hostname সম্পর্কে জিজ্ঞাসা করছে, যাতে অনেক সাইট হোস্ট করা একটা সার্ভার সঠিক certificate বাছতে পারে।
- **`alpn`** — Application-Layer Protocol Negotiation। client `h2` আর `http/1.1` তালিকাভুক্ত করে; সার্ভার একটা বাছে। এভাবেই HTTP/2 TLS-এর ওপর নেগোশিয়েট করে।

**ServerHello.** সার্ভারের plaintext-এ উত্তর:

- **`key_share`** — সার্ভারের মিলিয়ে থাকা ephemeral public key।
- **`supported_versions`** — TLS 1.3 নিশ্চিত করে।
- **বাছাই করা cipher suite** — সাধারণত `TLS_AES_128_GCM_SHA256` বা `TLS_CHACHA20_POLY1305_SHA256`।

এই পর্যায়ে, দুই পক্ষই elliptic-curve Diffie-Hellman করে ফেলেছে: প্রত্যেকে তাদের নিজের private key অন্যের public key-এর সাথে মিলিয়ে একই secret derive করেছে। সেই secret থেকে, দুই পক্ষই _handshake key_ derive করে — যা বাকি handshake encrypt করতে ব্যবহৃত হয়।

ServerHello-এর পরের সবকিছু এই handshake key-এর অধীনে encrypted।

**EncryptedExtensions.** ঐচ্ছিক extension-এর একটা মিশ্রণ (যেমন, নেগোশিয়েট করা ALPN protocol)।

**Certificate.** সার্ভারের certificate chain। client এটা verify করে (চ্যাপ্টার 3 কীভাবে তা কভার করে)।

**CertificateVerify.** সার্ভার তার certificate-এর private key দিয়ে এতক্ষণ পর্যন্ত handshake-এর একটা hash sign করে। client certificate থেকে public key ব্যবহার করে signature verify করে। এটা প্রমাণ করে সার্ভার আসলেই private key-টার মালিক, শুধু certificate-এর একটা কপি নয়।

**Finished.** এতক্ষণ পর্যন্ত handshake-এর একটা MAC, exchange থেকে derive করা একটা key দিয়ে গণনা করা। দুই পক্ষই এটা করে। MAC মিললে, handshake-এ কোনো কারচুপি হয়নি।

`Finished`-এর পর, দুই পক্ষই _application key_ derive করে (handshake key থেকে আলাদা) আর সেটা encrypted application data-র জন্য ব্যবহার করে। এই পয়েন্ট থেকে, HTTP-এর প্রতিটা byte সেই key-এর অধীনে encrypted।

## কেন ephemeral key — forward secrecy

ClientHello আর ServerHello-এর `key_share` **ephemeral** key ব্যবহার করে — এই একটা মাত্র connection-এর জন্য তৈরি আর পরে বাতিল। certificate-এর long-term private key কেবল handshake _sign_ করতে ব্যবহৃত হয় (CertificateVerify-তে), কখনো session key encrypt করতে নয়।

এটা দেয় **forward secrecy**: একজন attacker পুরো handshake রেকর্ড করলেও এবং পরে সার্ভারের private key চুরি করলেও, তারা রেকর্ড করা traffic decrypt করতে পারবে না। session key derive হয়েছিল ephemeral material থেকে যা আর বিদ্যমান নেই।

Forward secrecy হলো "কাল যদি আমার সার্ভার compromise হয়, আমার সব ঐতিহাসিক traffic decrypt হয়ে যাবে" আর "কাল আমার সার্ভার compromise হলেও, গতকালের traffic এখনও নিরাপদ"-এর মধ্যে পার্থক্য।

TLS 1.2-তে, forward secrecy ঐচ্ছিক ছিল — কেবল `ECDHE_*` আর `DHE_*` cipher suite-এ পাওয়া যেত। TLS 1.3 এটা বাধ্যতামূলক করে; 1.3-তে কোনো non-FS cipher নেই।

## TLS 1.2 — পুরোনো handshake

এখনও ব্যাপকভাবে deployed। দুই round trip:

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

জানার মতো পার্থক্য:

- **দুই round trip।** দুইটা `Finished` মেসেজ বিনিময় না হওয়া পর্যন্ত client কোনো application data পাঠাতে পারে না।
- **`ServerKeyExchange`** 1.2-তে একটা আলাদা মেসেজ — সার্ভারের ECDHE public key।
- **`ChangeCipherSpec`** একটা অবশিষ্ট মেসেজ যা plaintext থেকে encrypted communication-এ সুইচ করে। TLS 1.3 এটা সরিয়ে দিয়েছে (পরিবর্তনটা implicitly ঘটে)।
- **Cipher suite-এর নাম দীর্ঘ:** `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256` — key exchange (ECDHE), authentication (RSA), bulk cipher (AES-128-GCM), MAC (SHA-256)। TLS 1.3 এটাকে শুধু `TLS_AES_128_GCM_SHA256`-এ সরল করেছে।

পুরোনো সিস্টেমের client-দের জন্য আপনার এখনও TLS 1.2 সাপোর্ট করা উচিত, কিন্তু যেকোনো আধুনিক client-এর জন্য TLS 1.3 ডিফল্ট হওয়া উচিত।

## SNI — TLS-এর ওপর virtual hosting

একটা মাত্র IP address শত শত website সার্ভ করতে পারে। SNI ছাড়া, TLS জানত না _কোন_ certificate উপস্থাপন করতে হবে — কোনো HTTP header পড়ার আগেই (যা এটাকে hostname বলে দিত) একটা বাছতে হতো।

SNI ClientHello-তে hostname অন্তর্ভুক্ত করে এটা ঠিক করে, plaintext-এ:

```text
ClientHello
  ...
  server_name: example.com
```

সার্ভার এটা পড়ে, তার config থেকে মিলিয়ে থাকা certificate বাছে, আর handshake চালিয়ে যায়। nginx-এর `server_name` directive এই ঠিক ফিল্ডের বিরুদ্ধে ম্যাচ করে।

খারাপ দিক: SNI প্রকাশ করে আপনি কোন hostname-এ কানেক্ট করছেন, কানেকশনের বাকিটা encrypted হলেও। ECH (Encrypted Client Hello) — একটা TLS 1.3 extension যা রোলআউট হচ্ছে — SNI-ও encrypt করে, এই ফাঁস দূর করে।

## ALPN — protocol negotiation

ALPN হলো কীভাবে HTTP/2 সবকিছু না ভেঙে TLS-এর ওপর deploy করা হয়েছিল। client তার সাপোর্ট করা protocol তালিকাভুক্ত করে:

```text
alpn: h2, http/1.1
```

সার্ভার EncryptedExtensions-এ একটা বাছে:

```text
alpn: h2
```

দুই পক্ষই এখন জানে এই TLS session-এর ওপর HTTP/2 বলতে হবে। ALPN ছাড়া, আপনাকে একটা port-এ commit করতে হতো (443 = HTTP/1.1, 8443 = HTTP/2 — জঘন্য) বা একটা ধীর protocol-upgrade নাচ ব্যবহার করতে হতো।

nginx-এ, HTTP/2 enable করলে ALPN response স্বয়ংক্রিয়ভাবে সেট আপ হয়:

```nginx
listen 443 ssl;
http2 on;
```

## 0-RTT — বিপজ্জনক শর্টকাট

TLS 1.3 চালু করেছে **0-RTT** (zero round-trip time) resumption: একটা client আগে এই সার্ভারে কানেক্ট করে থাকলে আর তার একটা _resumption ticket_ থাকলে, সে ClientHello-র পাশাপাশি **একেবারে প্রথম packet-এ** application data পাঠাতে পারে।

```text
client                                              server

ClientHello + key_share
+ pre_shared_key
+ early_data: GET / HTTP/1.1...    ──────────────►  [accepts or rejects 0-RTT]
                                                     ServerHello
                                                     ...
                                                     [response]
```

বিশাল latency জয় (request-এর জন্য কার্যত zero round trip)। খারাপ দিক: 0-RTT data-র **কোনো replay protection নেই** — একজন attacker যে ClientHello ক্যাপচার করে সে পরে সার্ভারে সেটা replay করতে পারে আর একই response পেতে পারে। idempotent GET-এর জন্য এটা ঠিক আছে। state-changing request-এর (POST) জন্য এটা বিপজ্জনক।

বেশিরভাগ সার্ভার হয় 0-RTT disable করে, নয় কেবল safe method-এর জন্য enable করে। nginx-এর স্পষ্ট `ssl_early_data on;` opt-in লাগে, ডিফল্ট off।

## একটা handshake দেখা

```bash
openssl s_client -connect example.com:443 -tls1_3 -servername example.com
```

আপনি নেগোশিয়েট করা ভার্সন, cipher, আর certificate chain দেখবেন। `-msg` দিয়ে আপনি handshake মেসেজ দেখতে পারেন।

আরও পাঠযোগ্য একটা view-এর জন্য:

```bash
nmap --script ssl-enum-ciphers -p 443 example.com
```

এটা বিভিন্ন ClientHello দিয়ে সার্ভার probe করে আর কোন cipher ও ভার্সন গ্রহণ করে তা রিপোর্ট করে। আপনার সার্ভার TLS 1.0/1.1 বা দুর্বল cipher এক্সপোজ করছে না তা verify করতে এটা ব্যবহার করুন।

Browser-side details-এর জন্য, Chrome-এর DevTools → Security tab খুলুন। আপনি যে page দেখছেন তার নেগোশিয়েট করা TLS ভার্সন, cipher, আর certificate chain এটা দেখায়।

## Wireshark দিয়ে দেখা

আপনার নিয়ন্ত্রণে থাকা একটা সার্ভারে traffic ক্যাপচার করুন:

```bash
sudo tcpdump -i any -w /tmp/tls.pcap port 443
```

Wireshark-এ খুলুন, `tls.handshake.type`-এ filter করুন। আপনি ClientHello, ServerHello, Certificate, ইত্যাদি দেখবেন। application data encrypted, কিন্তু handshake record (ChangeCipherSpec বা 1.3-তে এর সমতুল্য পর্যন্ত) দৃশ্যমান। এভাবেই আপনি "handshake ফেল করছে কেন?" ডিবাগ করেন — ServerHello-তে error প্রায়ই আপনাকে ঠিক বলে দেয় কোন extension বা cipher মেলেনি।

## Handshake-এ কী ভুল হতে পারে

- **কোনো common cipher suite নেই।** পুরোনো client + কেবল TLS 1.3 cipher-এর আধুনিক সার্ভার। সার্ভার `TLS Alert: handshake_failure` ফেরত দেয়।
- **Certificate expired।** browser `NET::ERR_CERT_DATE_INVALID` দিয়ে প্রত্যাখ্যান করে।
- **Hostname mismatch।** browser `NET::ERR_CERT_COMMON_NAME_INVALID` দিয়ে প্রত্যাখ্যান করে। certificate `www.example.com`-এর জন্য, ইউজার টাইপ করেছে `example.com`।
- **Untrusted CA।** Self-signed cert, বা browser-এর কাছে নেই এমন একটা CA। `NET::ERR_CERT_AUTHORITY_INVALID`।
- **ভুল protocol version।** সার্ভারের TLS 1.2+ লাগে, client কেবল 1.0 বলে। `protocol_version` alert।
- **OCSP stapling failure।** সার্ভারের OCSP response বাসি বা অনুপস্থিত। browser warn বা block করতে পারে।

ডিবাগ করার সময়, সার্ভারের error log-এ সাধারণত উত্তর থাকে। nginx `error_log`-এ `info` বা `debug` level-এ TLS error লগ করে।

## রিক্যাপ

- TLS handshake হলো সেই কথোপকথন যা TCP-কে একটা secure session-এ পরিণত করে — version negotiation, key exchange, identity proof, MAC verification।
- TLS 1.3 এক round trip নেয়; TLS 1.2 দুই। আধুনিক config-এ দুইটাই সাপোর্ট করা উচিত।
- Ephemeral key exchange (ECDHE/X25519) forward secrecy দেয় — ফাঁস হওয়া private key-ও অতীতের session decrypt করতে পারে না।
- SNI ClientHello-তে hostname রাখে যাতে virtual hosting কাজ করে। ECH এটা encrypt করে।
- ALPN handshake-এর সময় application-layer protocol (HTTP/2 বনাম HTTP/1.1) নেগোশিয়েট করে।
- 0-RTT একটা 1.3 latency জয় কিন্তু non-idempotent request-এর জন্য অনিরাপদ।
- কিছু গড়বড় হলে `openssl s_client` আর Wireshark হলো diagnostic tool।

পরের চ্যাপ্টার: certificate — এগুলোতে আসলে কী থাকে, chain of trust, আর validation কীভাবে কাজ করে।
