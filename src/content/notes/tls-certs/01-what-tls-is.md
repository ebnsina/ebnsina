---
title: 'TLS আসলে কী'
subtitle: 'TLS দুইটা কাজ করে: এটা আপনার traffic encrypt করে, আর প্রমাণ করে সার্ভার সেই যা বলে দাবি করছে। দুইটা অর্ধেক একসাথে কাজ করে — একা কোনোটাই যথেষ্ট নয়।'
chapter: 1
level: 'beginner'
readingTime: '9 মিনিট'
topics: ['tls', 'ssl', 'encryption', 'identity', 'https']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা tamper-evident খাম যেটা আবার প্রমাণও করে কে এটা সিল করেছে — private, authentic, এবং পথে খোলা হলে ধরা পড়ে।

</Callout>

## গল্পে বুঝি

সিনা বুখারা থেকে কর্ডোবায় ফাতিমার কাছে একটা গোপন চিঠি পাঠাবেন। মাঝখানের পুরো পথটা যায় এক অচেনা কুরিয়ারের হাত দিয়ে — যাকে বিশ্বাস করার কোনো কারণ নেই। এই কুরিয়ার চাইলে চিঠিটা খুলে পড়তে পারে, নিজেকে ফাতিমা সাজিয়ে চিঠিটা হাতিয়ে নিতে পারে, এমনকি ভেতরের লেখা বদলে দিয়ে আবার সিল করে দিতে পারে। তিনটা বিপদ, একসাথে।

তাই সিনা তিনটা ব্যবস্থা নিলেন। প্রথমত, চিঠিটা এমন একটা বাক্সে তালাবন্ধ করলেন যেটা কেবল ফাতিমার কাছে থাকা চাবিতেই খোলে — কুরিয়ার বাক্স বহন করলেও ভেতরের লেখার একবিন্দুও পড়তে পারবে না। দ্বিতীয়ত, বাক্স নেওয়ার আগে তিনি ফাতিমার দোকানের সরকারি ছাপ-দেওয়া অফিসিয়াল সিলটা মিলিয়ে দেখলেন — যাতে নিশ্চিত হন এটা আসলেই ফাতিমা, কোনো ছদ্মবেশী নয়। তৃতীয়ত, বাক্সের মুখে এমন গালা-মোম লাগালেন যে পথে কেউ একবার খুললেই মোম ভেঙে দাগ পড়ে যাবে — গন্তব্যে পৌঁছে ফাটল দেখলেই বোঝা যাবে কেউ হাত দিয়েছে।

এই গল্পটাই আসলে **TLS**। তালাবন্ধ বাক্স হলো _encryption_ — কুরিয়ার (আপনার ISP বা কফি-শপের wifi) বহন করলেও পড়তে পারে না। যাচাই-করা অফিসিয়াল সিল হলো _authentication_ — certificate দিয়ে TLS প্রমাণ করে ওপাশে সত্যিই আসল সার্ভার, কোনো man-in-the-middle নয়। আর তামের-এভিডেন্ট মোম হলো _integrity_ — পথে data বদলানো হলে সাথে সাথে ধরা পড়ে। বাস্তবে যখন browser-এ HTTPS-এর padlock আইকনটা দেখেন, তখন এই তিনটা নিশ্চয়তাই একসাথে কাজ করছে।

## দুইটা কাজ

আপনি যখন `https://example.com` লোড করেন, তখন দুইটা জিনিস সত্য হতে হবে:

1. **আপনি আর example.com একে অপরকে যা বলেন তা অন্য কেউ পড়তে পারবে না।** আপনার ISP নয়, কফি-শপের wifi নয়, পৃথিবীর অর্ধেক দূরের কোনো router নয়।
2. **আপনি আসলেই example.com-এর সাথে কথা বলছেন।** এমন কোনো attacker-এর সাথে নয় যে মাঝখানে বসে আপনার পাঠানো সবকিছু পড়ছে।

এগুলো হলো _encryption_ আর _authentication_, আর TLS হলো সেই প্রোটোকল যা একই প্যাকেজে দুইটাই দেয়। যেকোনো একটা অর্ধেক বাদ দিলে অন্যটা অকেজো হয়ে যায়: একজন attacker-এর সাথে encrypted channel আসল সার্ভারে plaintext-এর চেয়ে ভালো কিছু নয়।

## HTTP একা কেন যথেষ্ট নয়

HTTP plaintext। প্রতিটা request আর response-এর প্রতিটা byte খোলামেলা যায়। ইউজারের মতো একই নেটওয়ার্কে থাকলে যে কেউ password, session cookie, page content পড়তে পারে — আর আরও খারাপ, চলার পথে সেগুলো পরিবর্তন করতে পারে।

```bash
# What an HTTP request looks like on the wire:
$ tcpdump -A -i any port 80 host example.com
GET / HTTP/1.1
Host: example.com
Cookie: session=abc123secret
```

সেই cookie এইমাত্র নেটওয়ার্কে packet-sniffing করা যে কারও কাছে ফাঁস হয়ে গেল। HTTPS-এর সাথে একজন sniffer এটা দেখে:

```text
0x0000:  4500 005c 1234 4000 4006 b1c4 c0a8 0102
0x0010:  5db8 d822 a3e4 01bb 1234 5678 9abc def0
0x0020:  8018 0810 a1b2 0000 0101 0a0a a3e4 1234
...
```

দেখতে র‍্যান্ডম ciphertext। sniffer দেখতে পায় _যে_ আপনি একটা নির্দিষ্ট IP-তে কানেক্ট করেছেন, কিন্তু আপনি কী বলেছেন তা নয়।

## Symmetric বনাম asymmetric encryption — দুইটাই দরকার

TLS একই সাথে দুই ধরনের cryptography ব্যবহার করে, কারণ প্রতিটা এমন কিছুতে ভালো যেটায় অন্যটা খারাপ।

**Symmetric encryption** একটা মাত্র shared key ব্যবহার করে। দুই পক্ষেরই একই key থাকে, দুই পক্ষই সেটা দিয়ে encrypt আর decrypt করে। AES হলো সবচেয়ে প্রচলিত আধুনিক symmetric cipher। এটা _অত্যন্ত দ্রুত_ — hardware-accelerated AES-GCM দিয়ে একটা আধুনিক CPU per core প্রতি সেকেন্ডে 1GB encrypt করে।

সমস্যাটা: প্রথমেই shared key-টা আপনি বিনিময় করবেন কীভাবে? নেটওয়ার্কে পাঠান, আর একজন eavesdropper সেটা পেয়ে যায়।

**Asymmetric encryption** একটা key-এর _জোড়া_ ব্যবহার করে: একটা public key (শেয়ার করা নিরাপদ) আর একটা private key (গোপন)। public key দিয়ে encrypt করা যেকোনো কিছু কেবল private key দিয়েই decrypt করা যায়। এটা key-exchange সমস্যার সমাধান করে — সার্ভার তার public key প্রকাশ করে, client সেটা ব্যবহার করে এমন একটা secret পাঠায় যা কেবল সার্ভার পড়তে পারে।

সমস্যাটা: asymmetric crypto _ধীর_। 2048 bit-এ RSA per byte AES-এর চেয়ে প্রায় 100x ধীর। প্রতিটা packet-এর জন্য এটা ব্যবহার করলে performance-এর দফারফা হয়ে যাবে।

TLS-এর সমাধান: _দুইটাই_ ব্যবহার করা। একটা shared symmetric key নেগোশিয়েট করতে asymmetric crypto, তারপর বাকি session-এর জন্য symmetric crypto।

```text
client   ──── (encrypted with server's public key) ───►  server
         "Here is a fresh symmetric key, call it K"

[then both sides encrypt/decrypt subsequent traffic with K]
```

আধুনিক TLS আক্ষরিক অর্থে সার্ভারের public key দিয়ে symmetric key encrypt করে না — এটা **Diffie-Hellman key exchange** ব্যবহার করে, যেখানে দুই পক্ষই তাদের নিজেদের ephemeral randomness অন্য পক্ষের অবদানের সাথে মিলিয়ে একই K বের করে, K নিজে কখনো না পাঠিয়েই। কিন্তু নীতিটা একই: setup-এর জন্য asymmetric, bulk traffic-এর জন্য symmetric।

## Identity — certificate

Encryption একাই যথেষ্ট নয়। ধরুন আপনি `example.com`-এ কানেক্ট করলেন। আপনার traffic encrypted... কিন্তু কার কাছে? Identity ছাড়া আপনার নেটওয়ার্কের একজন attacker কানেকশন intercept করতে পারে, _তার নিজের_ public key উপস্থাপন করতে পারে, আর আপনি খুশিমনে আপনার password তাকে encrypt করে পাঠান। সে decrypt করে, লগ করে, তারপর আসল সার্ভারে forward করে। ক্লাসিক man-in-the-middle।

Identity আসে একটা **certificate** থেকে: একটা ছোট ফাইল যা বলে "এই public key example.com-এর" — আর এটা এমন একটা third party দ্বারা signed যাকে আপনার কম্পিউটার আগে থেকেই trust করে (একটা Certificate Authority)।

একটা certificate দেখতে এমন (decode করলে):

```text
Subject: CN = example.com
Issuer: CN = Let's Encrypt Authority X3
Public Key: <the server's public key>
Valid: 2026-04-01 to 2026-06-30
Signature: <Let's Encrypt's signature over all of the above>
```

আপনার browser-এ আগে থেকেই একটা root CA-র তালিকা ইনস্টল করা থাকে (Let's Encrypt, DigiCert, GlobalSign, Sectigo, এবং আরও কয়েক ডজন)। সার্ভার যখন তার certificate উপস্থাপন করে, আপনার browser:

1. চেক করে certificate-এর domain (`CN` বা `SAN`) আপনার টাইপ করা domain-এর সাথে মেলে কিনা।
2. Let's Encrypt-এর public key দিয়ে signature verify করে।
3. verify করে যে Let's Encrypt-এর certificate-টাও, ঘুরেফিরে, আপনার OS trust করে এমন একটা root CA দ্বারা signed।
4. validity date আর revocation status চেক করে।

এসব যদি পাস করে, তাহলে certificate-এর public key-কে আসল example.com-এর বলে trust করা হয়। man-in-the-middle attack ভেঙে পড়ে কারণ attacker একটা আসল CA দ্বারা signed example.com-এর জন্য একটা valid certificate তৈরি করতে পারে না — তার জন্য CA-কেই compromise করতে হতো, আর এটাই CA-দের ইন্টারনেটের সবচেয়ে security-critical প্রতিষ্ঠান করে তোলে।

## TLS বনাম SSL — বেশিরভাগ ক্ষেত্রেই একই জিনিস

আপনি "SSL"-কে TLS-এর সমার্থক হিসেবে ব্যবহৃত হতে শুনবেন। ঐতিহাসিকভাবে:

- **SSL 1.0** — Netscape, 1994। কখনো রিলিজ হয়নি; লঞ্চের আগেই ভাঙা।
- **SSL 2.0** — 1995। ভাঙা; deprecated।
- **SSL 3.0** — 1996। ভাঙা; 2014-তে POODLE attack। সবজায়গায় disabled।
- **TLS 1.0** — 1999। SSL থেকে নাম বদলানো। পুরোনো; browser-রা deprecate করেছে।
- **TLS 1.1** — 2006। প্রান্তিক; deprecated।
- **TLS 1.2** — 2008। এখনও ব্যাপকভাবে ব্যবহৃত। আধুনিক config-এ নিরাপদ।
- **TLS 1.3** — 2018। বর্তমান। দ্রুততর handshake, সহজতর প্রোটোকল, কোনো legacy আবর্জনা নেই।

আধুনিক সিস্টেমের কেবল TLS 1.2 আর 1.3 সাপোর্ট করা উচিত। এর চেয়ে পুরোনো সবকিছু অনিরাপদ বা পরিচিত attack-এর প্রতি vulnerable।

মুখে মুখে বলা "SSL certificate" আসলে একটা TLS certificate। মানুষ SSL বলে কারণ তারা সেই নামটা নিয়ে বড় হয়েছে; প্রযুক্তিটা হলো TLS।

## TLS যা _করে না_

কয়েকটা প্রচলিত ভুল ধারণা পরিষ্কার করা দরকার:

- **আপনি কোন সাইটে গেছেন তা TLS লুকায় না।** গন্তব্যের IP এখনও খোলা থাকে। **SNI** (Server Name Indication) দিয়ে handshake-এর সময় hostname-ও খোলা থাকে — যদিও TLS 1.3 + Encrypted Client Hello সেটা লুকাতে পারে।
- **সার্ভারকে আপনার ডেটা লগ করা থেকে TLS আটকায় না।** সার্ভার একবার request decrypt করলে, এটা যা খুশি করতে পারে। Encryption চলার পথের byte রক্ষা করে, বিশ্রামরত অবস্থায় নয়।
- **ডিফল্টভাবে TLS আপনাকে সার্ভারের কাছে authenticate করে না।** certificate সার্ভারের identity _আপনার_ কাছে প্রমাণ করে। Mutual TLS (mTLS) — যেখানে client-এরও একটা certificate থাকে — হলো ঐচ্ছিক উল্টোটা, যা service-to-service authentication-এ ব্যবহৃত হয়।
- **আপনার application-এর bug-এর বিরুদ্ধে TLS রক্ষা করে না।** TLS আছে কিন্তু SQL injection vulnerability আছে এমন একটা সাইট সম্পূর্ণ খোলা। TLS channel রক্ষা করে; application আপনি রক্ষা করেন।
- **Traffic analysis-এর বিরুদ্ধে TLS রক্ষা করে না।** encrypted traffic দেখা একজন attacker এখনও দেখতে পারে _কতটুকু_ আর _কখন_ — byte-এর burst-এর আকার ফাঁস করে দিতে পারে আপনি কোন page লোড করেছেন, byte-গুলো নিজে অপাঠ্য হলেও।

## Performance খরচ — আপনি যা ভাবেন তার চেয়ে অনেক কম

"সবসময়-HTTPS"-এর বিরুদ্ধে ঐতিহাসিক আপত্তি ছিল performance। 2010-তে এটা সত্য ছিল। 2026-তে নয়।

- **CPU খরচ** — আধুনিক CPU-তে AES-NI hardware acceleration আছে। per core প্রতি সেকেন্ডে gigabit-এ AES-GCM। ChaCha20-Poly1305 (AES-NI ছাড়া ডিভাইসে ব্যবহৃত) একইভাবে দ্রুত।
- **Latency খরচ** — handshake 1–2 round trip যোগ করে। TLS 1.3 এটাকে 1 RTT-তে নামিয়েছে (session resumption দিয়ে কখনো 0)। দ্রুত নেটওয়ার্কে, session প্রতি একবার 50–100 ms।
- **Memory খরচ** — cipher state-এর জন্য active connection প্রতি কয়েক KB। অন্যান্য per-connection overhead-এর তুলনায় নগণ্য।

  99.9% সার্ভিসের জন্য "আমার কি HTTPS ব্যবহার করা উচিত"-এর উত্তর হলো: হ্যাঁ, সবসময়, কোনো ব্যতিক্রম নেই। খরচ অদৃশ্য। লাভ হলো আপনার ইউজারদের traffic private।

<Callout type="info">

**আধুনিক web platform-এ TLS বাধ্যতামূলক।**

Browser-এ HTTP/2 আর HTTP/3-এর জন্য TLS দরকার। Service worker-এর জন্য TLS দরকার। Geolocation API, microphone, camera, push notification — সবের জন্য TLS দরকার। আপনি privacy নিয়ে চিন্তা না করলেও, platform নিজেই কার্যত 2017-এর দিক থেকে TLS বাধ্যতামূলক করেছে।

</Callout>

## আপনাকে আসলে যা করতে হবে

একটা প্লেইন-HTTP সাইটকে HTTPS-এ পরিণত করতে আপনার লাগবে:

1. **আপনার নিয়ন্ত্রণে থাকা একটা domain** — `example.com`, যার DNS আপনার সার্ভারে পয়েন্ট করা।
2. **একটা certificate** যা সেই domain-এর জন্য একটা CA ইস্যু করেছে — সাধারণত Let's Encrypt, free আর automated।
3. **certificate ব্যবহার করতে কনফিগার করা একটা web server** — nginx, path-গুলো `/etc/letsencrypt/live/example.com/`-এ।
4. **একটা renewal process** — Let's Encrypt cert 90 দিনের জন্য valid; certbot স্বয়ংক্রিয়ভাবে renew করে।

পরের চ্যাপ্টারগুলো প্রতিটা একে একে কভার করে। চ্যাপ্টার 2 একটা TLS handshake-এর সময় আসলে কী ঘটে তা দেখায়। চ্যাপ্টার 3 certificate আর chain of trust ব্যাখ্যা করে। চ্যাপ্টার 4–6 একটা আসল certificate ইস্যু করে। চ্যাপ্টার 7–8 nginx কনফিগার করে আর সবকিছু চালু রাখে।

## রিক্যাপ

- TLS দুইটা কাজ করে: channel encrypt করে আর সার্ভারের identity প্রমাণ করে। দুইটা অর্ধেকই দরকার।
- Symmetric encryption (AES) দ্রুত কিন্তু একটা shared key দরকার। Asymmetric (RSA, ECC) key exchange সমাধান করে কিন্তু ধীর। TLS দুইটাই ব্যবহার করে।
- Certificate একটা public key-কে একটা domain-এর সাথে বাঁধে। একটা trusted CA সেগুলো sign করে। Browser আগে থেকে ইনস্টল করা root CA পর্যন্ত signature verify করে।
- TLS 1.2 আর 1.3 হলো আধুনিক ভার্সন। এর চেয়ে পুরোনো সবকিছু deprecated।
- TLS চলার পথের byte রক্ষা করে, application bug নয়, বিশ্রামরত ডেটা নয়। এটা গন্তব্যের IP লুকায় না।
- আধুনিক hardware-এ performance খরচ নগণ্য। HTTPS ব্যবহার না করার আসলে কোনো কারণ নেই।

পরের চ্যাপ্টার: handshake, byte বাই byte।
