---
title: 'TLS-এর জন্য nginx কনফিগার করা'
subtitle: 'একটা সম্পূর্ণ TLS server block — protocol, cipher, OCSP stapling, HSTS, আধুনিক key type, perfect forward secrecy। সেই config যা কপি-পেস্ট আবর্জনা ছাড়াই A+ স্কোর করে।'
chapter: 7
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['nginx', 'tls', 'ssl', 'hsts', 'ocsp']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা তালা লাগানো — certificate হলো চাবি, nginx config হলো কীভাবে আপনি তালাটা দরজায় লাগান।

</Callout>

## "ভালো TLS config" মানে কী

TLS বিবর্তনের 30 বছর পর, "ভালো" একটা ছোট সেট পছন্দে স্থির হয়েছে:

- **কেবল TLS 1.2 আর 1.3।** এর চেয়ে পুরোনো সবকিছুর পরিচিত attack আছে।
- **আধুনিক AEAD cipher।** AES-GCM আর ChaCha20-Poly1305। কোনো CBC নয়, RC4 নয়, DES নয়।
- **Forward secrecy।** key exchange-এর জন্য ECDHE। কোনো static RSA নয়।
- **OCSP stapling।** client-এর CA-তে একটা round-trip বাঁচায়।
- **HSTS।** browser-দের বলে "সবসময় HTTPS ব্যবহার করো।"
- **HTTP/2।** প্রায়ই HTTP/3-ও।
- **শক্ত key type।** ECDSA P-256 বা RSA 2048+ — আধুনিক certbot ডিফল্ট ঠিক আছে।

Mozilla একটা [SSL Configuration Generator](https://ssl-config.mozilla.org/) রক্ষণাবেক্ষণ করে যা nginx, Apache, HAProxy, আর অন্যদের জন্য তিনটা level-এ config তৈরি করে: modern (কেবল TLS 1.3, iOS 13/Chrome 70-এর আগের সবকিছু ভাঙে), intermediate (TLS 1.2+1.3, বেশিরভাগের যা ব্যবহার করা উচিত), আর old (Windows XP পর্যন্ত পেছনে — এড়িয়ে চলুন)।

এই চ্যাপ্টার হলো সেই config যা random gist কপি না করেই SSL Labs-এ A+-এ পৌঁছায়।

## সম্পূর্ণ server block

```nginx
# /etc/nginx/sites-available/example.com
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;

    server_name example.com www.example.com;
    root /var/www/example.com;

    # Cert
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;

    # Protocol versions
    ssl_protocols TLSv1.2 TLSv1.3;

    # Cipher suites — Mozilla intermediate
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';

    # TLS 1.3 cipher selection is fixed; no need to configure
    ssl_prefer_server_ciphers off;

    # Session cache
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout 5s;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

    # Other security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        try_files $uri $uri/ =404;
    }
}

# Redirect HTTP -> HTTPS
server {
    listen 80;
    listen [::]:80;
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

এটাই template। প্রতিটা line আসল কাজ করছে। নিচে আমরা প্রতিটা block ধরে হাঁটি।

## Listen আর HTTP/2

```nginx
listen 443 ssl;
listen [::]:443 ssl;
http2 on;
```

- `listen 443 ssl` — IPv4-এর ওপর TCP port 443, TLS সহ।
- `listen [::]:443 ssl` — IPv6-তে একই।
- `http2 on` — HTTP/2 enable করার আধুনিক syntax। পুরোনো config বলে `listen 443 ssl http2;` — একই জিনিস।

HTTP/3-এর (QUIC) জন্য — এখনও উদীয়মান, ঐচ্ছিক:

```nginx
listen 443 quic reuseport;
listen [::]:443 quic reuseport;

add_header Alt-Svc 'h3=":443"; ma=86400';
```

`Alt-Svc` header browser-কে বলে "তুমি আমাকে port 443-এ HTTP/3-তেও পেতে পারো" — পরবর্তী request upgrade হয়। QUIC সাপোর্ট compile করা nginx 1.25+ লাগে।

## Cert ফাইল

```nginx
ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
```

- **`fullchain.pem`** — leaf + intermediate। **সবসময় এই ফাইল**, কখনো শুধু `cert.pem` নয়, নয়তো কিছু client "untrusted cert" error দেখে।
- **`privkey.pem`** — private key। `chmod 600` আর root-owned রাখুন (চ্যাপ্টার 3)।
- **`chain.pem`** — কেবল intermediate, `ssl_stapling_verify`-তে ব্যবহৃত।

## Protocol আর cipher

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:...';
ssl_prefer_server_ciphers off;
```

- **`ssl_protocols TLSv1.2 TLSv1.3`** — কেবল আধুনিক TLS। TLS 1.0 আর 1.1 deprecated আর প্রতিটা আধুনিক browser-এ disabled।
- **`ssl_ciphers`** — কেবল TLS 1.2-এর জন্য গুরুত্বপূর্ণ। TLS 1.3-এর spec দ্বারা বাছাই করা একটা fixed, ছোট সেট cipher আছে; কোনো per-server config নেই।
- **`ssl_prefer_server_ciphers off`** — client-কে বাছতে দিন। আধুনিক client-দের সাথে সব option সমানভাবে নিরাপদ; client জানে তার hardware কোন cipher সবচেয়ে ভালো accelerate করে।

উপরের cipher তালিকা হলো Mozilla-র "intermediate" সুপারিশ। প্রতিটা cipher:

- `ECDHE` বা `DHE` দিয়ে শুরু হয় — ephemeral key exchange, forward secrecy দেয়।
- AES-GCM বা ChaCha20-Poly1305 ব্যবহার করে — authenticated encryption (AEAD)।

আপনি কেবল আধুনিক browser (গত 5 বছরের যেকোনো কিছু) সার্ভ করলে, ECDHE-only-র জন্য `DHE` line বাদ দিতে পারেন। আপনার IE 11 বা খুব পুরোনো Android সাপোর্ট করা লাগলে, আপনি Mozilla-র "old" profile-এ নামতেন — নামবেন না, যদি না আপনার একটা নির্দিষ্ট compatibility প্রয়োজন থাকে।

## Session cache

```nginx
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;
```

একটা ফিরে আসা client একটা আগের TLS session resume করতে পারে, full handshake এড়িয়ে। nginx shared memory-তে session key cache করে।

- `shared:SSL:10m` — নাম `SSL`, 10MB shared memory। ~40,000 session।
- `ssl_session_timeout 1d` — session 24 ঘণ্টার জন্য valid।
- `ssl_session_tickets off` — একটা বিকল্প session-resumption mechanism disable করে যার ঐতিহাসিক security সমস্যা আছে যদি ঘন ঘন rotate না করা হয়। disable করে কেবল cache ব্যবহার করা নিরাপদ।

## OCSP stapling

```nginx
ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;
```

OCSP (Online Certificate Status Protocol) একটা browser-কে CA-কে জিজ্ঞাসা করতে দেয় "এই cert কি revoke হয়েছে?" stapling ছাড়া, browser cert দেখার প্রতিবার সেই request করে — ধীর, ফাঁসযুক্ত (CA শেখে কে আপনার সাইট visit করছে), আর একটা single point of failure।

**stapling** দিয়ে, _আপনার nginx_ পর্যায়ক্রমে OCSP request করে, response cache করে, আর TLS handshake-এ অন্তর্ভুক্ত করে। browser একটা আলাদা request না করেই একটা fresh CA-signed "এখনও valid" response দেখে।

- `ssl_stapling on` — OCSP response fetch আর cache করে।
- `ssl_stapling_verify on` — সার্ভ করার আগে `ssl_trusted_certificate` দিয়ে OCSP response verify করে।
- `resolver` — OCSP responder URL lookup করতে nginx যে DNS server ব্যবহার করে। Public DNS (1.1.1.1, 8.8.8.8) ঠিক আছে।

stapling কাজ করে কিনা verify করুন:

```bash
echo | openssl s_client -connect example.com:443 -status 2>/dev/null \
  | grep -A 2 "OCSP response"
```

আপনি `OCSP Response Status: successful (0x0)` দেখলে, stapling কাজ করছে।

## HSTS

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
```

HTTP Strict Transport Security: browser `max-age` সেকেন্ডের জন্য মনে রাখে "এই domain-কে HTTPS ব্যবহার করতে হবে।" এর পরে ইউজার `http://example.com` টাইপ করলেও, browser কখনো একটা unencrypted request না পাঠিয়েই নীরবে HTTPS-এ upgrade করে।

- `max-age=63072000` — 2 বছর। Standard সুপারিশ।
- `includeSubDomains` — প্রতিটা subdomain-এও প্রয়োগ করুন। এটা যোগ করার আগে নিশ্চিত হন আপনার সব subdomain HTTPS-only।
- `preload` — Chrome/Firefox-কে আপনার domain browser-এর preload তালিকায় পাঠাতে বলুন। মানে একটা fresh install থেকে একেবারে প্রথম request HTTPS-এ upgrade হয়। [hstspreload.org](https://hstspreload.org/)-এ apply করুন — কিন্তু **কেবল** যখন আপনি একেবারে প্রতিশ্রুতিবদ্ধ; removal ধীর।

<Callout type="warn">

**HSTS আঠালো।**

একটা browser একবার একটা দীর্ঘ `max-age` দেখলে, এটা মনে রাখে — আপনি header সরালেও। সেই domain-এর জন্য HTTP-তে ফিরতে, প্রতিটা visiting browser-কে পুনরায় visit করে `max-age=0` দেখতে হবে (বা মূল max-age শেষ হওয়ার অপেক্ষা করতে হবে)। সেভাবেই পরিকল্পনা করুন। staging বা testing domain-এর জন্য, আত্মবিশ্বাসী না হওয়া পর্যন্ত একটা খুব ছোট max-age ব্যবহার করুন।

</Callout>

## কেন কোনো Diffie-Hellman parameter নেই

পুরোনো nginx config-এ থাকে:

```nginx
ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
```

এটা `DHE_*` cipher suite-এর জন্য দরকার ছিল। আধুনিক Mozilla intermediate config-এ, DHE cipher তালিকার নিচে থাকে আর কদাচিৎ বাছাই হয়। Mozilla "modern" config-এ (কেবল TLS 1.3), কোনো DHE-ই নেই।

আপনি cipher তালিকায় DHE রাখলে, সঠিক DH param তৈরি করা একটা এককালীন:

```bash
sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
```

certbot একটা ডিফল্ট ইনস্টল করে। আপনি IE 11 নিয়ে চিন্তিত না হলে, DHE পুরোপুরি বাদ দিতে পারেন।

## অনেক সাইট জুড়ে TLS config শেয়ার করা

প্রতিটা সাইটে সেই পুরো TLS block পুনরাবৃত্তি করা ক্লান্তিকর। এটা একটা snippet-এ টানুন:

```bash
sudo nano /etc/nginx/snippets/ssl-modern.conf
```

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
ssl_prefer_server_ciphers off;

ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
ssl_session_tickets off;

ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
resolver_timeout 5s;

add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

তারপর প্রতিটা সাইটে:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
    include snippets/ssl-modern.conf;

    # ... rest of the server block
}
```

একটা ফাইল, standard বিবর্তিত হলে update করার একটা জায়গা।

## একটা বিদ্যমান app-এর সামনে HTTPS যোগ করা

আপনার আগে থেকেই `127.0.0.1:8080`-এ একটা backend থাকলে আর TLS সহ সামনে nginx চাইলে:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
    include snippets/ssl-modern.conf;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

এটা হলো canonical "edge-এ TLS termination, backend-এ plain HTTP" সেটআপ। আপনার app অপরিবর্তিত চলে; nginx সব TLS সামলায়।

## tool দিয়ে verify করা

**SSL Labs:** https://www.ssllabs.com/ssltest/analyze.html?d=example.com

A বা A+ স্কোর হলো লক্ষ্য। বিস্তারিত report আপনাকে ঠিক বলে দেয় কোন cipher আর protocol গৃহীত আর যেকোনো দুর্বলতা।

**testssl.sh** — local tool, কোনো external scan নেই:

```bash
docker run --rm -ti drwetter/testssl.sh https://example.com
```

Comprehensive output, একটা JSON বা HTML report সেভ করে।

**curl** sanity check-এর জন্য:

```bash
curl -I https://example.com/
# Look for:
#   HTTP/2 200
#   Strict-Transport-Security: max-age=...
#   server: nginx
```

`curl --tlsv1.0` কানেক্ট হলে, আপনার TLS 1.0 enabled — ঠিক করুন। Production-এর প্রত্যাখ্যান করা উচিত:

```bash
curl --tlsv1.0 --tls-max 1.0 https://example.com
# curl: (35) error:0A0000BF:SSL routines::no protocols available
```

## রিক্যাপ

- Mozilla "intermediate" config + TLS 1.2/1.3 + আধুনিক cipher + ECDHE = SSL Labs-এ A+।
- `ssl_certificate`-এর জন্য সবসময় `fullchain.pem` ব্যবহার করুন। `privkey.pem` mode 600-এ রাখুন।
- OCSP stapling একটা round-trip বাঁচায় আর ইউজার privacy রক্ষা করে। এটা enable করুন।
- HSTS browser-দের বলে "সবসময় HTTPS।" দুই বছর হলো standard। `preload` নিয়ে সতর্ক থাকুন।
- TLS config একটা `snippets/` ফাইলে টানুন আর প্রতিটা সাইট থেকে include করুন।
- SSL Labs আর `testssl.sh` দিয়ে verify করুন। TLS 1.0/1.1 প্রত্যাখ্যাত তা নিশ্চিত করুন।

পরের আর শেষ চ্যাপ্টার: cert চালু রাখা — renewal monitoring, hook, rotation, আর কিছু ফেল করলে কী করতে হবে।
