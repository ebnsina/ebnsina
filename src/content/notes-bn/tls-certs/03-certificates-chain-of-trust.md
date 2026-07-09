---
title: 'Certificates ও Chain of Trust'
subtitle: 'একটা .pem ফাইলের ভেতরে কী থাকে, CSR কী, intermediate certificate কেন থাকে, এবং একটা browser কীভাবে chain ধরে হেঁটে আগে থেকে trust করা একটা root-এ পৌঁছায়।'
chapter: 3
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['certificates', 'x509', 'csr', 'ca', 'chain of trust']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা passport — trusted কারণ একটা সরকার (CA) এর জামিন হয়, ধরে থাকা অপরিচিত ব্যক্তিকে আপনি trust করেন বলে নয়।

</Callout>

## Certificate একটা signed দাবি

একটা TLS certificate হলো একটা ছোট ফাইল যা মূলত বলে:

> "আমি, [Certificate Authority], দাবি করছি যে এই ফাইলের ভেতরের public key [example.com]-এর, এবং [তারিখ] থেকে [তারিখ] পর্যন্ত valid।"

এটা CA-র private key দিয়ে signed। CA-র public key আছে এমন যে কেউ signature verify করতে পারে। আপনি CA-কে trust করলে, transitively দাবিটাও trust করেন।

ফরম্যাটটা হলো **X.509**, 1980-এর দশকের একটা standard যা **ASN.1**-এর ওপর তৈরি (সেই একই যুগের একটা binary encoding)। আপনি TLS ছোঁয়ার প্রতিবার X.509-এর মুখোমুখি হবেন, SSH (কখনো কখনো), code signing, S/MIME — পুরো PKI জগত।

## একটা certificate-এ কী থাকে

একটা decode করুন:

```bash
openssl x509 -in /etc/letsencrypt/live/example.com/cert.pem -text -noout
```

আপনি দেখবেন:

```text
Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number: 03:e1:0a:...
        Signature Algorithm: sha256WithRSAEncryption
        Issuer: C = US, O = Let's Encrypt, CN = R3
        Validity
            Not Before: Apr  1 00:00:00 2026 GMT
            Not After : Jun 30 23:59:59 2026 GMT
        Subject: CN = example.com
        Subject Public Key Info:
            Public Key Algorithm: rsaEncryption
                Public-Key: (2048 bit)
                Modulus:
                    00:c4:a3:...
                Exponent: 65537 (0x10001)
        X509v3 extensions:
            X509v3 Subject Alternative Name:
                DNS:example.com, DNS:www.example.com
            X509v3 Key Usage: critical
                Digital Signature, Key Encipherment
            X509v3 Extended Key Usage:
                TLS Web Server Authentication, TLS Web Client Authentication
            X509v3 Basic Constraints: critical
                CA:FALSE
            ...
    Signature Algorithm: sha256WithRSAEncryption
        9f:8e:7d:...
```

এভাবে পড়ুন:

- **Subject** — এই certificate কার _জন্য_। `CN=example.com` হলো legacy ফিল্ড; আধুনিক validation **Subject Alternative Name (SAN)** ব্যবহার করে, যা অনেক domain তালিকাভুক্ত করতে পারে।
- **Issuer** — যে CA এই certificate sign করেছে। এখানে `Let's Encrypt R3`।
- **Validity** — শুরু আর শেষের তারিখ। এই window-এর বাইরে, certificate invalid।
- **Subject Public Key Info** — আসল public key। এখানে RSA 2048; আধুনিক cert ক্রমশ ECDSA P-256 ব্যবহার করছে।
- **Extensions** — certificate কীসের জন্য ব্যবহার করা যাবে তার flag। browser-এর জন্য `Key Usage` আর `Extended Key Usage` গুরুত্বপূর্ণ; `Basic Constraints: CA:FALSE` বলে এটা একটা end-entity certificate, নিজে একটা CA নয়।
- **Signature** — উপরের সবকিছুর ওপর CA-র signature।

## Chain of trust

Browser সরাসরি Let's Encrypt-এর R3 trust করে না। তারা operating system বা browser-এ আগে থেকে ইনস্টল করা একটা ছোট সেট _root_ CA trust করে। অন্য প্রতিটা certificate-কে সেই root-গুলোর একটায় chain করে ফিরতে হবে।

```text
Root CA (ISRG Root X1, in browser's trust store)
   │ signs ▾
Intermediate CA (Let's Encrypt R3)
   │ signs ▾
Server certificate (example.com)
```

তিনটা certificate, প্রতিটা পরের ওপরেরটা দিয়ে signed। সার্ভার handshake-এর সময় নিচের দুইটা উপস্থাপন করে; browser-এর কাছে আগে থেকেই উপরেরটা আছে।

```bash
$ openssl s_client -connect example.com:443 -showcerts < /dev/null

---
Server certificate
subject=CN = example.com
issuer=CN = R3, O = Let's Encrypt, C = US

-----BEGIN CERTIFICATE-----
MIIFa...
-----END CERTIFICATE-----

---
Certificate chain
 0 s:CN = example.com
   i:CN = R3, O = Let's Encrypt, C = US
 1 s:CN = R3, O = Let's Encrypt, C = US
   i:CN = ISRG Root X1, O = Internet Security Research Group, C = US
```

সার্ভারের `fullchain.pem` হলো এগুলোর সংযুক্তি — leaf cert, তারপর intermediate(গুলো), তারপর ঐচ্ছিকভাবে root। leaf-কে প্রথমে আসতে হবে; nginx (আর অন্য প্রতিটা সার্ভার) client-এ chain ঠিক সেই ক্রমে পাঠায়।

## Intermediate certificate কেন থাকে

আপনি ভাবতে পারেন: root CA-কে দিয়ে সরাসরি প্রতিটা certificate sign করানো হয় না কেন? দুইটা কারণ:

1. **Security।** root CA-র private key পুরো PKI-এর সবচেয়ে মূল্যবান secret। এটা ফাঁস হলে, এটা দিয়ে কখনো sign করা প্রতিটা certificate অকেজো হয়ে যায়। root-গুলো _offline_ রাখা হয় — physically air-gapped, কেবল intermediate ইস্যু করার ceremony-র জন্য অ্যাক্সেস করা হয়। intermediate CA-গুলো online আর দৈনন্দিন signing করে। একটা intermediate-এর key compromise হলে, কেবল এটা দিয়ে sign করা cert revoke করতে হয়, root নয়।

2. **Operational separation।** একটা CA-র বিভিন্ন উদ্দেশ্যে অনেক intermediate থাকতে পারে (TLS server cert, code signing, S/MIME)। একটার compromise অন্যগুলোকে compromise করে না।

এজন্যই আপনি `Let's Encrypt R3` (intermediate)-কে আপনার cert ইস্যু করতে দেখেন, আর `ISRG Root X1` (root)-কে R3 sign করতে দেখেন।

## Validation — browser আসলে কী চেক করে

সার্ভার যখন handshake-এ তার chain উপস্থাপন করে, client validate করে:

1. **Domain match।** cert-এর `Subject Alternative Name` (বা, fallback, `CN`) কানেক্ট হওয়া hostname-এর সাথে মিলতে হবে। `example.com` মেলে `example.com`-এর সাথে; `*.example.com`-এর একটা cert `foo.example.com`-এর সাথে মেলে কিন্তু `example.com` নিজে বা `foo.bar.example.com`-এর সাথে _নয়_।

2. **Validity dates।** আজকের তারিখ `Not Before` আর `Not After`-এর মধ্যে হতে হবে।

3. **Signature।** Server cert-এর signature intermediate-এর public key দিয়ে verify হতে হবে। Intermediate root-এর public key দিয়ে verify হতে হবে। কোনোটা ফেল করলে, chain ভাঙা।

4. **Trust anchor।** chain-এর উপরের অংশ (root) client-এর trust store-এ থাকতে হবে।

5. **Key usage।** cert-কে `serverAuth`-এর (Extended Key Usage) জন্য authorized হতে হবে। CA ভুল-উদ্দেশ্যের cert ইস্যু করলে কিছু ভাঙন এখানে ঘটে।

6. **Revocation status।** ইস্যুর পর থেকে এই cert কি revoke হয়েছে? চেক করার দুই উপায়:
   - **CRL** (Certificate Revocation List) — CA revoke করা cert-এর একটা তালিকা প্রকাশ করে। বড় আর ধীর।
   - **OCSP** — client CA-র OCSP responder-কে জিজ্ঞাসা করে "এই cert কি এখনও valid?" response signed আর সংক্ষিপ্ত। **OCSP stapling**-এ _সার্ভার_ OCSP response fetch করে আর handshake-এ অন্তর্ভুক্ত করে, যাতে client-কে একটা অতিরিক্ত request করতে না হয়।

সব পাস করলে, connection সম্পূর্ণ trust নিয়ে স্থাপিত হয়। কিছু ফেল করলে, browser সেই বড় লাল warning দেখায়।

## Public key ফরম্যাট — alphabet soup

certificate সংক্রান্ত ফাইল অনেক encoding-এ আসে:

| Extension      | ফরম্যাট                                | কনটেন্ট                                                                     |
| -------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `.pem`         | `-----BEGIN/END-----` marker সহ Base64 | যেকোনো কিছু — cert, key, chain। সবচেয়ে প্রচলিত।                            |
| `.crt`, `.cer` | `.pem`-এর মতোই (বা DER)                | একটা certificate (প্রায়ই)।                                                 |
| `.key`         | PEM                                    | একটা private key।                                                           |
| `.csr`         | PEM                                    | একটা certificate signing request।                                           |
| `.der`         | Binary                                 | একই X.509 data, Base64 নয়।                                                 |
| `.pfx`, `.p12` | PKCS#12, binary                        | Cert + chain + private key একটা password-protected blob-এ। Microsoft-ঘেঁষা। |

Linux + nginx + Let's Encrypt-এর জন্য, আপনি পুরোপুরি `.pem`-এ থাকেন। PEM হলো শুধু header/footer marker সহ Base64-encoded DER।

```text
-----BEGIN CERTIFICATE-----
MIIFazCCBFOgAwIBAgISA9UD...
...
-----END CERTIFICATE-----
```

`fullchain.pem` হলো এর একাধিক সংযুক্ত — leaf, তারপর intermediate।

## Private key

key ফাইলটাই পুরো সিস্টেমটাকে কাজ করায়। অন্য কারও কাছে আপনার private key থাকলে, তারাই _আপনি_, cert expire বা revoke না হওয়া পর্যন্ত।

```text
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw...
...
-----END PRIVATE KEY-----
```

Private key সাধারণত:

- **RSA 2048** — পুরোনো আর ব্যাপকভাবে compatible। sign করতে ধীর, verify করতে ধীর।
- **RSA 4096** — আরও ধীর, প্রান্তিক অতিরিক্ত security। এড়িয়ে চলুন।
- **ECDSA P-256** — RSA-এর চেয়ে অনেক দ্রুত। আধুনিক ডিফল্ট। ছোট signature।
- **Ed25519** — সবচেয়ে নতুন। আরও দ্রুত। পুরোনো client-দের দ্বারা কম সর্বজনীনভাবে সাপোর্টেড কিন্তু আধুনিক web-এর জন্য ঠিক আছে।

Permission:

```bash
$ ls -la /etc/letsencrypt/live/example.com/privkey.pem
-rw------- 1 root root 1704 Apr  1 10:42 privkey.pem
```

`600`, root-owned। এই ফাইল পড়তে পারে এমন যে কেউ আপনার domain impersonate করতে পারে। `www-data` হিসেবে চলা nginx এটা `letsencrypt` group-এর মাধ্যমে পড়ে, নয়তো master-কে root হিসেবে চালায় আর worker-এর জন্য `www-data`-তে নেমে আসে।

## CSR (Certificate Signing Request)

একটা CA আপনাকে একটা certificate ইস্যু করার আগে, আপনি একটা **CSR** তৈরি করেন। এতে আপনার key pair-এর public অর্ধেক আর আপনি certificate-এ যে subject info চান তা থাকে। আপনি CA-কে CSR পাঠান; তারা verify করে আপনি domain নিয়ন্ত্রণ করেন; তারা একটা certificate sign করে ফেরত দেয়।

```bash
# Generate a private key
openssl genrsa -out example.com.key 2048

# Generate a CSR
openssl req -new -key example.com.key -out example.com.csr \
  -subj "/CN=example.com" \
  -addext "subjectAltName=DNS:example.com,DNS:www.example.com"
```

CA কখনো আপনার private key দেখে না। তাদের কেবল CSR (যাতে public key আছে) আর আপনি domain নিয়ন্ত্রণ করার প্রমাণ লাগে।

Let's Encrypt-এর জন্য, certbot এসব আপনার জন্য করে। আপনি production-এ কার্যত কখনো হাতে `openssl req` চালাবেন না — কিন্তু একটা CSR কী তা বোঝা পুরো সিস্টেম কীভাবে কাজ করে তা ব্যাখ্যা করতে সাহায্য করে।

## Domain Validation বনাম Organization Validation

তিন ধরনের certificate আছে:

- **DV (Domain Validated)** — CA চেক করেছে আপনি domain নিয়ন্ত্রণ করেন। ব্যস। Let's Encrypt থেকে free। browser-এ padlock, কোনো অতিরিক্ত label নেই। 99% সাইট এটাই ব্যবহার করে।
- **OV (Organization Validated)** — CA legal entity-ও verify করেছে। টাকা লাগে। কিছু legacy browser-এ padlock প্লাস organization-এর নাম।
- **EV (Extended Validation)** — CA পুরোদস্তুর background check করেছে। বেশি টাকা লাগে। browser-এ কোম্পানির নাম সহ একটা সবুজ address bar দেখাত; বেশিরভাগ browser আর দৃশ্যগতভাবে পার্থক্য করে না যেহেতু EV পরিমাপযোগ্যভাবে security উন্নত করেনি।

দৈনন্দিন TLS-এর জন্য, DV ঠিক আছে। কিছু industry-তে (bank, সরকার) compliance কারণে EV/OV থাকে। cryptographic সুরক্ষা অভিন্ন।

## Revocation — যখন একটা cert-কে আগে মরতে হয়

Cert-এর একটা expiration তারিখ থাকে, কিন্তু কখনো কখনো একটা cert-কে expiration-এর _আগে_ invalidate করতে হয়:

- private key compromise হয়েছে (হারানো laptop, একটা CI system থেকে ফাঁস, server breach)।
- domain ownership বদলেছে।
- CA ভুল করে একটা ভুল cert ইস্যু করেছে।

Distributed system-এ revocation কঠিন — client-দের শিখতে হয় cert আর valid নয়। CRL (একটা তালিকা download করা) আর OCSP (online জিজ্ঞাসা করা) হলো দুইটা mechanism; দুইটারই পরিচিত reliability আর privacy সমস্যা আছে।

বাস্তবে, আধুনিক উত্তর হলো **automatic renewal সহ short-lived cert**। Let's Encrypt-এর 90-দিনের expiration প্লাস auto-renewal নিজেই revocation সমস্যার একটা আংশিক সমাধান — revocation পুরোপুরি ছড়িয়ে না পড়লেও, একটা compromise করা cert 90 দিনের মধ্যে মৃত।

## Self-signed certificate — কেবল development-এর জন্য

আপনি CA ছাড়াই নিজের certificate বানাতে পারেন। browser এটা trust করবে না (root-এ কোনো chain নেই), কিন্তু local development-এর জন্য ঠিক আছে:

```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
  -days 365 -nodes \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

এটা এক command-এ একটা key আর একটা self-signed cert তৈরি করে। `https://localhost:8443` টেস্টিংয়ের জন্য এটা ব্যবহার করুন। browser জোরে warn করবে; কেবল development-এর জন্য warning পার হয়ে যান। production-এ **কখনো** একটা self-signed cert deploy করবেন না — প্রতিটা visitor একটা ভীতিকর warning দেখে আর বেশিরভাগই কেবল চলে যায়।

একটা ভালো dev পথ: **mkcert**, একটা tool যা আপনার OS trust করে এমন একটা local CA তৈরি করে, তারপর এটা থেকে cert ইস্যু করে। dev-এর সময় আর কোনো browser warning নেই।

```bash
brew install mkcert
mkcert -install                         # adds local CA to system trust store
mkcert localhost 127.0.0.1 ::1          # creates ./localhost.pem and ./localhost-key.pem
```

## আপনি আসলে যে ফাইল ছোঁবেন

একটা domain-এর জন্য certbot চালানোর পর, আপনি পান:

```text
/etc/letsencrypt/live/example.com/
├── cert.pem        # leaf cert only
├── chain.pem       # intermediates only (no leaf)
├── fullchain.pem   # leaf + intermediates
├── privkey.pem     # private key
└── README
```

nginx-এ:

```nginx
ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
```

সবসময় `fullchain.pem` ব্যবহার করুন, `cert.pem` নয় — intermediate ছাড়া, browser chain তৈরি করতে পারে না, আর আপনি কিছু client-এ "untrusted" error দেখবেন।

## রিক্যাপ

- একটা certificate হলো একটা public key প্লাস identity দাবি, একটা CA দ্বারা signed।
- X.509 হলো ফরম্যাট। PEM (base64) হলো সাধারণ on-disk encoding।
- chain যায় leaf → intermediate(গুলো) → root। browser root trust করে; leaf পর্যন্ত signature verify করে।
- Validation চেক করে domain, তারিখ, signature, trust anchor, key usage, আর revocation।
- আধুনিক key হলো ECDSA P-256 বা Ed25519। RSA 2048 ঠিক আছে কিন্তু ধীর।
- nginx-এ সবসময় `fullchain.pem` সার্ভ করুন, কখনো শুধু `cert.pem` নয়।
- Self-signed cert কেবল development-এর জন্য। বন্ধুত্বপূর্ণ local TLS সেটআপের জন্য mkcert ব্যবহার করুন।

পরের চ্যাপ্টার: Let's Encrypt আসলে কীভাবে একটা cert ইস্যু করে — ACME protocol, end to end।
