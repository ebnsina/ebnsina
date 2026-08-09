---
title: "Let's Encrypt ও ACME"
subtitle: 'যে protocol একটা free CA-কে বছরে 35 কোটি certificate ইস্যু করতে দেয়। Account, order, challenge, finalize, download — প্রতিটা certbot run পর্দার আড়ালে যা করে।'
chapter: 4
level: 'beginner'
readingTime: '11 মিনিট'
topics: ['letsencrypt', 'acme', 'certificates', 'automation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা automated notary সার্ভিস যা deed-এ স্ট্যাম্প মারার আগে প্রমাণ করে আপনি সম্পত্তির মালিক।

</Callout>

## গল্পে বুঝি

ইবনে সিনা বাজারে একটা নতুন মশলার দোকান খুলেছেন, আর দরজায় একটা সরকারি সিলমোহর-মারা মালিকানার সার্টিফিকেট টাঙাতে চান — যাতে ক্রেতারা বিশ্বাস করে দোকানটা সত্যিই তাঁর। শুনলেন, শহরে একটা নতুন notary অফিস খুলেছে যা এই স্ট্যাম্প একদম free-তে দেয়, আর সেখানে কোনো কেরানি বসে থাকে না — পুরোটাই যন্ত্রের মতো নিজে নিজে চলে। কিন্তু স্ট্যাম্প মারার আগে অফিসকে নিশ্চিত হতে হবে যে দোকানটা আসলেই ইবনে সিনার, যে কেউ এসে দাবি করলেই হবে না।

তাই অফিস একটা শর্ত দেয়: "এই যে নির্দিষ্ট নম্বর লেখা সাইনটা নিন, হুবহু এটাই আপনার দোকানের জানালায় ঝুলিয়ে দিন।" ইবনে সিনা সাইনটা জানালায় টাঙিয়ে দেন। কিছুক্ষণ পর অফিসের লোক দোকানের সামনে দিয়ে হেঁটে যায়, জানালায় ঠিক সেই নম্বরের সাইন ঝুলছে কি না দেখে নেয়। সাইনটা মিলে গেলেই প্রমাণ হয় — এই জানালার নিয়ন্ত্রণ যার হাতে, দোকানটা তারই। সঙ্গে সঙ্গে অফিস স্ট্যাম্প-মারা সার্টিফিকেট ইস্যু করে দেয়, শুরু থেকে শেষ পুরোটাই মানুষের হাত ছাড়াই।

এই গল্পটাই আসলে **Let's Encrypt**। free আর কেরানি-ছাড়া automated notary অফিসটাই হলো Let's Encrypt, যে ACME protocol দিয়ে পুরো কাজটা যন্ত্রের মতো চালায়। "এই নম্বরের সাইনটা জানালায় ঝুলিয়ে দিন, আমি হেঁটে গিয়ে দেখব" — এটাই ACME-র challenge (HTTP-01, যেখানে একটা নির্দিষ্ট token একটা URL-এ রাখতে হয়)। সাইন মিলে যাওয়া মানে আপনি যে domain-টা সত্যিই নিয়ন্ত্রণ করেন তার প্রমাণ, আর স্ট্যাম্প-মারা সার্টিফিকেটটাই হলো ইস্যু হওয়া TLS certificate। বাস্তবে `certbot` চালালে ঠিক এভাবেই কয়েক সেকেন্ডে কোনো টাকা বা মানুষের হস্তক্ষেপ ছাড়াই আপনার সাইট একটা trusted certificate পেয়ে যায়।

## Let's Encrypt কী

Let's Encrypt একটা Certificate Authority — যে entity আপনার certificate sign করে, ঠিক সেই কাজ যা DigiCert, GlobalSign, আর Sectigo করে। এটা 2016-তে তিনটা পরিবর্তন নিয়ে চালু হয়েছিল যা web-কে নতুন আকার দিয়েছে:

1. **Free।** cert প্রতি কোনো চার্জ নেই, কোনো upsell নেই, কোনো quota নেই।
2. **Automated।** Cert issuance একটা এক-command অপারেশন, কোনো কাগজপত্রের প্রক্রিয়া নয়।
3. **Short-lived।** 90-দিনের certificate, auto-renew হওয়ার জন্য ডিজাইন করা।

এই সংমিশ্রণই পাঁচ বছরে HTTPS adoption-কে web traffic-এর ~30% থেকে ~95%-এ নিয়ে গেছে। Let's Encrypt-এর আগে, প্রতিটা TLS-protected সাইটের টাকা লাগত আর মানুষের পরিশ্রম লাগত। পরে, এতে কিছুই লাগে না আর 30 সেকেন্ড লাগে।

যে protocol automation-টাকে কাজ করায় সেটা হলো **ACME** (Automatic Certificate Management Environment)। এটা একটা প্রকাশিত standard (RFC 8555), যার মানে যে কেউ একটা Let's Encrypt-compatible CA বানাতে পারে — আর কয়েকজন বানিয়েছে। কিছু commercial CA আর DNS provider এখন ACME API এক্সপোজ করে।

## আপনি আসলে যা চালান

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

এটাই পুরো issuance flow। certbot করে:

1. Let's Encrypt-এর সাথে একটা account তৈরি করে (প্রথম run হলে)।
2. `example.com` আর `www.example.com`-এর জন্য একটা CSR তৈরি করে।
3. Let's Encrypt-কে cert ইস্যু করতে বলে।
4. validation challenge সমাধান করে (প্রমাণ করে আপনি domain নিয়ন্ত্রণ করেন)।
5. signed cert `/etc/letsencrypt/live/example.com/`-এ download করে।
6. নতুন cert ব্যবহার করতে nginx কনফিগার করে।
7. একটা systemd timer সেট আপ করে যা expiration-এর আগে cert renew করে।

চ্যাপ্টার 5 এই command বিস্তারিত ঘুরে দেখে। এই চ্যাপ্টার ব্যাখ্যা করে _নিচে কী ঘটছে_ যাতে কিছু ফেল করলে, আপনি জানেন কী দেখতে হবে।

## ACME protocol — পাঁচটা ধাপ

Issuance হলো ACME server-এর সাথে পাঁচটা HTTP exchange।

### 1. Account creation

প্রথমবার, certbot locally একটা account key pair (RSA বা ECDSA) তৈরি করে। এটা public key ACME server-এ (`/acme/new-account`) POST করে, যা সেটা রেকর্ড করে। এখন থেকে, account key প্রতিটা পরবর্তী request sign করে — ACME server সেই signature দিয়ে আপনাকে চেনে।

```text
POST https://acme-v02.api.letsencrypt.org/acme/new-account
{
  "termsOfServiceAgreed": true,
  "contact": ["mailto:admin@example.com"]
}

Response 201
{ "id": 12345, "status": "valid" }
```

আপনার account key কখনো আপনার machine ছাড়ে না। CA কেবল public key দেখে।

### 2. Order

এখন CA-কে একটা cert ইস্যু করতে বলুন। identifier-এর (domain নাম) একটা তালিকা `/acme/new-order`-এ POST করুন:

```text
POST /acme/new-order
{
  "identifiers": [
    {"type": "dns", "value": "example.com"},
    {"type": "dns", "value": "www.example.com"}
  ]
}

Response 201
{
  "status": "pending",
  "expires": "2026-04-01T20:00:00Z",
  "identifiers": [...],
  "authorizations": [
    "https://.../authz-v3/123",
    "https://.../authz-v3/124"
  ],
  "finalize": "https://.../finalize/12345/678"
}
```

CA domain প্রতি একটা করে authorization URL ফেরত দেয়। cert ইস্যু করার আগে প্রতিটা authorization একটা challenge দিয়ে সমাধান করতে হবে।

### 3. Challenge — প্রমাণ করা আপনি domain নিয়ন্ত্রণ করেন

প্রতিটা authorization-এর জন্য, CA challenge-এর একটা তালিকা offer করে:

```text
GET https://.../authz-v3/123

{
  "identifier": {"type": "dns", "value": "example.com"},
  "status": "pending",
  "challenges": [
    {
      "type": "http-01",
      "url": "https://.../chall/abc",
      "token": "uH4w...",
      "status": "pending"
    },
    {
      "type": "dns-01",
      "url": "https://.../chall/def",
      "token": "uH4w...",
      "status": "pending"
    },
    {
      "type": "tls-alpn-01",
      "url": "https://.../chall/ghi",
      "token": "uH4w...",
      "status": "pending"
    }
  ]
}
```

তিন ধরনের challenge — একটা বাছুন আর জবাব দিন।

**HTTP-01** — সবচেয়ে সহজ। `http://example.com/.well-known/acme-challenge/<token>`-এ নির্দিষ্ট content সহ একটা ফাইল রাখুন। CA এটা fetch করে; content মিললে, আপনি domain নিয়ন্ত্রণের প্রমাণ দিলেন। port 80 খোলা আর public internet থেকে reachable হওয়া লাগে।

**DNS-01** — wildcard certificate-এর জন্য দরকার। একটা নির্দিষ্ট value সহ একটা TXT record `_acme-challenge.example.com` যোগ করুন। CA TXT record টা lookup করে। কোনো web server ছাড়াই কাজ করে, DNS automation লাগে।

**TLS-ALPN-01** — একটা বিশেষ ALPN protocol সহ port 443-এ TLS-এর মাধ্যমে token উপস্থাপন করুন। কিছু load balancer এটা ব্যবহার করে যাদের port 80 বা HTTP এক্সপোজ না করেই validate করতে হয়। কম প্রচলিত; certbot সাপোর্ট করে কিন্তু বেশিরভাগ ইউজারের দরকার হয় না।

আপনি একবার challenge response রাখলে, CA-কে "আমি প্রস্তুত" বলতে challenge URL-এ POST করুন:

```text
POST https://.../chall/abc
{}
```

CA validate করে (ফাইল fetch করে, TXT record চেক করে, ইত্যাদি)। valid হলে, authorization `valid` status-এ যায়।

### 4. Finalize

সব authorization valid হলে, order-এর `finalize` URL-এ আপনার CSR POST করুন:

```text
POST https://.../finalize/12345/678
{
  "csr": "<base64url-encoded CSR>"
}
```

CSR well-formed হলে আর authorized identifier-এর সাথে মিললে, CA cert-টা issuance-এর জন্য queue করে। order URL polling করলে শেষমেশ status `valid` আর একটা `certificate` URL দেখায়।

### 5. Download

```text
GET https://.../cert/abc...
```

ইস্যু করা certificate PEM ফরম্যাটে, full chain সহ ফেরত দেয়। certbot এটা `/etc/letsencrypt/live/example.com/`-এ লেখে।

পুরো flow-টা 5–30 সেকেন্ড নেয়।

## HTTP-01 challenge বাস্তবে

HTTP-01 ধরে হাঁটছি কারণ এটাই 90% ইউজার মুখোমুখি হয়:

1. certbot একটা random token তৈরি করে (challenge object-এ CA দ্বারা প্রদত্ত)।
2. certbot একটা _key authorization_ গণনা করে — `<token>.<account-key-thumbprint>`-এর SHA256 hash। এটাই CA well-known URL-এ পেতে চায়।
3. certbot key authorization একটা ফাইলে `/var/www/letsencrypt/.well-known/acme-challenge/<token>`-এ লেখে।
4. nginx-কে সেই directory থেকে `/.well-known/acme-challenge/` সার্ভ করতে কনফিগার করা লাগবে:

   ```nginx
   server {
       listen 80;
       server_name example.com www.example.com;

       location /.well-known/acme-challenge/ {
           root /var/www/letsencrypt;
           default_type "text/plain";
       }

       location / {
           return 301 https://$host$request_uri;
       }
   }
   ```

5. certbot CA-কে বলে সে প্রস্তুত।
6. CA-র validation server `http://example.com/.well-known/acme-challenge/<token>`-এ একটা GET request করে। (নোট: HTTP, port 80। একটা TLS-only সাইটেও, ACME validation-এর জন্য আপনাকে port 80 খোলা রাখতে হবে, নয়তো DNS-01 ব্যবহার করুন।)
7. response body প্রত্যাশিত key authorization-এর সাথে মিললে, challenge valid।
8. CA cert ইস্যু করে।

মূল কথা: কেবল `example.com`-এর বৈধ মালিকই example.com-এর DNS যে আসল web server-এ পয়েন্ট করে সেখানে সেই URL-এ একটা ফাইল রাখতে পারত। response verify করে, CA প্রমাণ করে আপনি domain নিয়ন্ত্রণ করেন।

<Callout type="warn">

**HTTP-01 কাজ করার জন্য port 80 খোলা আর reachable হতে হবে**। আপনি port 80 পুরোপুরি firewall করে থাকলে, DNS-01-এ (পরের চ্যাপ্টার) সুইচ করুন, বা renewal-এর জন্য যথেষ্ট সময় port 80 খুলুন।

</Callout>

## DNS-01 challenge

Wildcard cert-এর (`*.example.com`) জন্য বা যেসব পরিবেশে port 80 reachable নয়, DNS-01 হলো বিকল্প।

1. CA আপনাকে একটা token দেয়।
2. আপনি `_acme-challenge.example.com`-এ key authorization ধারণকারী একটা TXT record যোগ করেন (HTTP-01-এর মতোই একই hash)।
3. CA public DNS-এর ওপর TXT record query করে।
4. মিললে, challenge valid।

সমস্যাটা: DNS-01-এর জন্য আপনার DNS provider-এর API-এর বিরুদ্ধে automation লাগে। certbot-এর Route53, Cloudflare, DigitalOcean, Linode, আর অন্যদের জন্য plugin আছে। অস্পষ্ট provider-এর জন্য আপনি একটা "manual" hook script লেখেন যা TXT record যোগ করে ও সরায়।

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d "*.example.com" \
  -d example.com
```

credentials ফাইলে দরকারি ন্যূনতম permission সহ একটা Cloudflare API token থাকে (নির্দিষ্ট zone-এ Zone:Edit)।

## Rate limit — জানা গুরুত্বপূর্ণ

অপব্যবহার ঠেকাতে Let's Encrypt-এর rate limit আছে। প্রধানগুলো:

- **registered domain প্রতি সপ্তাহে 50 cert।**
- **সপ্তাহে 5 duplicate cert** (হুবহু একই সেট নাম)।
- **account প্রতি, hostname প্রতি, ঘণ্টায় 5 ব্যর্থ validation।**
- **account প্রতি 3 ঘণ্টায় 300 নতুন order।**

"ঘণ্টায় 5 ব্যর্থ validation"-টাই বেশিরভাগ মানুষ কনফিগারেশনের সময় মুখোমুখি হয়। আপনার nginx আসলে challenge সঠিকভাবে সার্ভ না করলে, throttle হওয়ার আগে আপনি পাঁচবার চেষ্টা পান।

একটা **staging environment** আছে যা production-কে mirror করে কিন্তু অনেক বেশি rate limit সহ fake (non-trusted) cert ইস্যু করে — টেস্টিংয়ের সময় এটা ব্যবহার করুন:

```bash
sudo certbot certonly --staging -d example.com
```

staging থেকে cert-গুলো browser trust করবে না। আপনার config কাজ করলে, production-এ সুইচ করুন:

```bash
sudo certbot certonly -d example.com
```

## Renewal — ডিজাইনের কারণেই automated

Cert 90 দিনের জন্য valid। certbot একটা systemd timer ইনস্টল করে যা দিনে দুইবার চলে:

```bash
$ systemctl list-timers --all | grep certbot
NEXT                         LEFT       LAST                         PASSED       UNIT
Mon 2026-05-04 10:42:11 UTC  10h left   Sun 2026-05-03 22:42:11 UTC  1h ago       certbot.timer
```

timer `certbot renew` ট্রিগার করে, যা `/etc/letsencrypt/renewal/`-এর প্রতিটা cert চেক করে আর expiration-এর 30 দিনের মধ্যে থাকা যেকোনোটা renew করে। কিছু due না থাকলে, এটা নীরবে বেরিয়ে যায়। একটা renewal সফল হলে, এটা একটা hook (সাধারণত `systemctl reload nginx`) ট্রিগার করে যাতে নতুন cert কার্যকর হয়।

আপনার কখনো renewal নিয়ে ভাবতে হবে না। প্রথমবার আপনি "আমার cert expire হয়েছে" মুখোমুখি হন সাধারণত একটা misconfigured renewal hook বা সদ্য-বদলানো nginx-এর কারণে যা নীরবে HTTP-01 challenge ভাঙে।

## কী ভুল হতে পারে

- **DNS propagate হয়নি।** আপনি 30 সেকেন্ড আগে একটা A record যোগ করেছেন; CA-র resolver-এ এখনও বাসি data। 5–60 মিনিট অপেক্ষা করুন, retry করুন।
- **Port 80 blocked।** Cloud firewall, server firewall, বা upstream NAT। অন্য একটা machine থেকে `curl -I http://example.com` দিয়ে টেস্ট করুন।
- **`location /.well-known/acme-challenge/` কনফিগার করা নেই।** আপনার ডিফল্ট catch-all-এ (যা সম্ভবত 404 দেয়) লাগে। Validation ফেল করে।
- **একটা load balancer-এর পেছনে একাধিক server, কেবল একটায় challenge ফাইল।** CA-র request ফাইল ছাড়া একটা server-এ লাগে। DNS-01 বা shared filesystem ব্যবহার করুন।
- **HTTP-01 দিয়ে wildcard cert।** অনুমোদিত নয়। Wildcard-এর জন্য DNS-01 লাগে।
- **rate limit-এ লেগেছেন।** error message-এ `ratelimit` চেক করুন; আরও টেস্টিংয়ের জন্য `--staging`-এ সুইচ করুন।

certbot-এর error message সাধারণত পরিষ্কার। শুধু summary line নয়, পুরো output পড়ুন।

## অন্য ACME client

certbot সবচেয়ে জনপ্রিয় কিন্তু একমাত্র ACME client নয়:

- **acme.sh** — pure shell, zero dependency। ছোট, যেকোনো পরিবেশে embed করা যায়।
- **lego** — Go, single binary। Traefik internally ব্যবহার করে।
- **Caddy-র built-in ACME** — Caddy বাইরের tool ছাড়াই নিজের cert ইস্যু ও renew করে।
- **Win-ACME (wacs)** — Windows।
- **acmez** (Go library), **acme-client** (OpenBSD), আর আরও অনেক।

আপনার পরিবেশে যেটা মানায় সেটা বাছুন। একটা Debian + nginx VPS-এর জন্য, certbot ডিফল্ট। containerized পরিবেশের জন্য, lego বা acme.sh embed করা সহজ।

## রিক্যাপ

- Let's Encrypt একটা free, automated CA যা ACME protocol-এর মাধ্যমে 90-দিনের DV certificate ইস্যু করে।
- ACME-এর পাঁচটা ধাপ আছে: account, order, challenge, finalize, download। সব HTTPS-এর ওপর, সব আপনার account key দিয়ে signed।
- HTTP-01 সবচেয়ে প্রচলিত challenge — একটা well-known URL-এ একটা ফাইল রাখুন, CA এটা fetch করে। port 80 reachable হওয়া লাগে।
- DNS-01 wildcard-এর জন্য দরকার আর HTTP ছাড়াই কাজ করে — একটা TXT record যোগ করুন। DNS automation লাগে।
- Rate limit বাস্তব; টেস্টিংয়ের জন্য `--staging`, আসল cert-এর জন্য production ব্যবহার করুন।
- Renewal systemd timer-এর মাধ্যমে automated। কখনো মানুষের হস্তক্ষেপ না লাগার জন্য ডিজাইন করা।
- certbot হলো ডিফল্ট tool। niche পরিবেশের জন্য অন্য client আছে।

পরের চ্যাপ্টার: একটা আসল VPS-এ ধাপে ধাপে `certbot --nginx` ধরে হাঁটা।
