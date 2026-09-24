---
title: 'certbot দিয়ে আপনার প্রথম Cert ইস্যু করা'
subtitle: 'খালি DNS A record থেকে কাজ করা HTTPS পর্যন্ত দশ মিনিটে। কংক্রিট command, প্রতিটা flag ব্যাখ্যা করা, প্রতিটা প্রচলিত failure-এর সমাধান।'
chapter: 5
level: 'beginner'
readingTime: '11 মিনিট'
topics: ['certbot', 'letsencrypt', 'nginx', 'http-01', 'tls']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা driver's license-এর জন্য আবেদন করা — আপনি একবার identity প্রমাণ করেন, একটা credential পান, আর expire হওয়ার আগে renew করেন।

</Callout>

## গল্পে বুঝি

ফাতিমা বাজারে একটা নতুন দোকান খুলেছেন। নিয়ম হলো, সামনের দরজায় সরকারি নোটারির সিলমারা একটা সার্টিফিকেট টাঙানো থাকতে হবে — নইলে খদ্দেররা ভাববে দোকানটা আসল কিনা। কিন্তু নোটারির অফিসে যাওয়া, লাইনে দাঁড়ানো, তারা যে প্রমাণ-চিহ্নটা চায় সেটা নির্দিষ্ট জায়গায় রেখে আসা, সিলমারা কাগজ ফেরত আনা, তারপর সেটা দরজায় ঠিকঠাক লাগানো — এতগুলো ধাপ ফাতিমার হাতে সময় নেই। তাই তিনি একজন নির্ভরযোগ্য আদমি রাখলেন, নাম খোয়ারিজমি, যিনি এই পুরো কাজটা একাই সামলান।

ফাতিমা শুধু একবার বললেন, "আমার দোকানের সার্টিফিকেটটা এনে দাও।" খোয়ারিজমি বিনা পয়সার নোটারি অফিসে গেলেন, তারা যে প্রমাণ-চিহ্নটা চাইল সেটা ঠিক জায়গায় রেখে ফাতিমার মালিকানা প্রমাণ করলেন, সিলমারা সার্টিফিকেট নিয়ে এলেন, নিজ হাতে দোকানের সামনের দরজায় মজবুত করে লাগিয়ে দিলেন। শুধু তাই নয়, তিনি একটা স্থায়ী ব্যবস্থাও করে রাখলেন — পুরনো সার্টিফিকেটের মেয়াদ শেষ হওয়ার আগেই যেন নিজে থেকে গিয়ে টাটকাটা এনে বদলে দেন, ফাতিমাকে আর মনে করিয়ে দিতে না হয়।

গল্পের খোয়ারিজমি হলো **certbot**। এক ইনস্ট্রাকশনে সে পুরো কাজটা করে: নোটারিতে গিয়ে প্রমাণ-চিহ্ন রাখা মানে **ACME request আর challenge** স্বয়ংক্রিয়ভাবে সারা, সিলমারা কাগজ দরজায় লাগানো মানে **certificate টা web server-এ install করা**, আর মেয়াদ শেষের আগে টাটকা এনে বদলানোর স্থায়ী ব্যবস্থা মানে **auto-renewal** সেট করা। বাস্তবে ঠিক এভাবেই `sudo certbot --nginx -d example.com` একটা কমান্ডে Let's Encrypt থেকে cert নেয়, nginx-এ বসিয়ে দেয়, আর একটা systemd timer দিয়ে দিনে দুইবার নিজে থেকে renew করে — আপনাকে হাতে একটা ধাপও করতে হয় না।

## প্রিরেকুইজিট

certbot চালানোর আগে, তিনটা জিনিস সত্য হতে হবে:

1. **আপনার একটা domain আছে** — যেকোনো registrar থেকে কেনা। `.com`, `.dev`, `.io`, যেকোনো কিছু। ~$10/বছর।
2. **DNS A record আপনার VPS-এর public IPv4-তে পয়েন্ট করে।** (আর IPv6 চাইলে AAAA।)
3. **Port 80 আর 443 public internet থেকে reachable।** আপনার VPS firewall আর যেকোনো cloud firewall দুইটাকেই এগুলো allow করতে হবে।

প্রতিটা verify করুন:

```bash
# Domain DNS resolves to your IP
dig +short example.com
# 49.13.123.45

# Port 80 reachable
curl -I http://example.com/
# HTTP/1.1 200 OK (or whatever nginx serves)

# Port 443 should fail (nothing there yet)
curl -I https://example.com/
# Connection refused — fine for now
```

`dig` কিছু না ফেরালে, আপনার DNS সেট আপ করা নেই। `curl http://` timeout হলে, আপনার firewall port 80 block করছে (Linux & VPS-এর চ্যাপ্টার 7 পুনরায় দেখুন)।

<Callout type="info">

**DNS propagation.** নতুন A record propagate হতে এক ঘণ্টা পর্যন্ত লাগতে পারে, যদিও সাধারণ সময় 1–5 মিনিট। record তৈরির ঠিক পরে `dig +short` কিছু না ফেরালে, অপেক্ষা করুন। certbot খুব তাড়াতাড়ি চেষ্টা করলে `DNS problem: NXDOMAIN` দিয়ে ফেল করবে।

</Callout>

## certbot ইনস্টল করা

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

`python3-certbot-nginx` plugin TLS setting যোগ করতে nginx config auto-edit করে। আপনি certbot-কে "certonly" mode-এও (চ্যাপ্টার 7) চালাতে আর nginx হাতে edit করতে পারেন, যা predictability-র জন্য serious sysadmin-রা পছন্দ করে।

## শুরু করার জন্য একটা পরিষ্কার nginx server block

`/etc/nginx/sites-available/example.com` তৈরি বা edit করুন:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    root /var/www/example.com;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

এটা enable করুন:

```bash
sudo mkdir -p /var/www/example.com
echo '<h1>hello</h1>' | sudo tee /var/www/example.com/index.html

sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

কাজ করে কিনা নিশ্চিত করুন:

```bash
curl -I http://example.com/
# HTTP/1.1 200 OK
```

এখন আপনার একটা HTTP-only সাইট আছে, certbot-এর জন্য প্রস্তুত।

## certbot চালান

```bash
sudo certbot --nginx -d example.com -d www.example.com
```

prompt-গুলো ধরে হাঁটুন:

1. **Email address।** renewal failure notification আর security advisory-র জন্য ব্যবহৃত। একটা আসল inbox-এ সেট করা মূল্যবান।

2. **Terms of Service।** `Y` টাইপ করুন। (আপনি পড়েছেন। অবশ্যই।)

3. **EFF newsletter।** আপনার ইচ্ছা।

4. **redirect বাছুন।**
   - `1: No redirect` — HTTP কাজ করতে দিন।
   - `2: Redirect` — HTTP→HTTPS 301। প্রায় সবকিছুর জন্য এটা বাছুন।

certbot কাজটা করে। Output দেখতে এমন:

```text
Account registered.
Requesting a certificate for example.com and www.example.com

Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/example.com/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/example.com/privkey.pem
This certificate expires on 2026-07-30.

Deploying certificate
Successfully deployed certificate for example.com to /etc/nginx/sites-enabled/example.com
Successfully deployed certificate for www.example.com to /etc/nginx/sites-enabled/example.com
Congratulations! You have successfully enabled HTTPS on https://example.com and https://www.example.com
```

Verify করুন:

```bash
curl -I https://example.com/
# HTTP/2 200
# server: nginx/1.24.0
```

কাজ করে। browser warning ছাড়াই এটা trust করবে।

## certbot আসলে কী বদলেছে

modified nginx config পরিদর্শন করুন:

```bash
sudo cat /etc/nginx/sites-enabled/example.com
```

certbot এই line-গুলো যোগ করেছে:

```nginx
server {
    server_name example.com www.example.com;

    root /var/www/example.com;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}

server {
    if ($host = www.example.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    if ($host = example.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 404; # managed by Certbot
}
```

প্রথম server block এখন Let's Encrypt cert দিয়ে HTTPS সার্ভ করে। দ্বিতীয় server block port 80-এ listen করে আর প্রতিটা request-কে HTTPS-এ 301-redirect করে।

`include /etc/letsencrypt/options-ssl-nginx.conf` safe default (TLS 1.2/1.3, আধুনিক cipher, OCSP stapling) টেনে আনে। আপনি চ্যাপ্টার 7-এ এগুলো override বা replace করতে পারেন।

## certificate পরিদর্শন করা

```bash
$ sudo openssl x509 -in /etc/letsencrypt/live/example.com/cert.pem -text -noout | head -20
Certificate:
    Data:
        Version: 3 (0x2)
        Serial Number: 03:e1:0a:...
        Signature Algorithm: ecdsa-with-SHA384
        Issuer: C = US, O = Let's Encrypt, CN = R3
        Validity
            Not Before: Apr  1 12:00:00 2026 GMT
            Not After : Jun 30 12:00:00 2026 GMT
        Subject: CN = example.com
        Subject Public Key Info:
            Public Key Algorithm: id-ecPublicKey
                Public-Key: (256 bit)
                ...
        X509v3 Subject Alternative Name:
            DNS:example.com, DNS:www.example.com
```

SAN-এ দুইটা domain, ECDSA P-256 key, 90 দিনের জন্য valid। ঠিক যা আমরা চেয়েছি।

## renewal টেস্ট করা — আসলে renew না করেই

```bash
sudo certbot renew --dry-run
```

Output:

```text
Processing /etc/letsencrypt/renewal/example.com.conf
Account registered.
Simulating renewal of an existing certificate for example.com and www.example.com

Successfully renewed certificate for example.com
Congratulations, all simulated renewals succeeded:
  /etc/letsencrypt/live/example.com/fullchain.pem (success)
```

`--dry-run` staging server ব্যবহার করে, তাই এটা rate limit খরচ করে না বা আপনার cert replace করে না। এই command সফল হলে, আসল renewal-ও হবে।

## renewal timer

certbot package আগে থেকেই ইনস্টল করে:

```bash
$ systemctl list-timers certbot
NEXT                         LEFT          LAST                         PASSED   UNIT
Mon 2026-05-04 12:42:11 UTC  10h left      Sun 2026-05-03 22:42:11 UTC  1h ago   certbot.timer
```

দিনে দুইবার, timer `certbot renew` চালায়। Renewal expiration-এর 30 দিন আগে ঘটে। hook স্বয়ংক্রিয়ভাবে nginx reload করে।

আপনি timer পরিদর্শন করতে পারেন:

```bash
sudo systemctl cat certbot.timer
```

```ini
[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=43200
Persistent=true
```

দিনে দুইবার, 12 ঘণ্টা পর্যন্ত jitter সহ, reboot জুড়ে persistent। একদম মজবুত।

## প্রচলিত failure আর সমাধান

**`Detail: Fetching http://example.com/.well-known/acme-challenge/abc... Connection refused`**

আপনার VPS বাইরে থেকে port 80-এ reachable নয়। চেক করুন:

```bash
sudo nft list ruleset | grep 'tcp dport 80'
sudo ss -tlnp | grep ':80'
```

port খুলুন (Linux & VPS-এর চ্যাপ্টার 7), নিশ্চিত করুন nginx এতে listen করছে।

**`Detail: ... 404 Not Found`**

certbot challenge ফাইল রেখেছে কিন্তু nginx এটা সার্ভ করছে না। সাধারণত একটা ভুল document root বা একটা `location /`-এর কারণে যা well-known prefix ম্যাচ হওয়ার আগেই সবকিছু ধরে ফেলে।

যেকোনো অন্য `location /` block-এর _উপরে_ এই snippet যোগ করুন:

```nginx
location /.well-known/acme-challenge/ {
    root /var/www/letsencrypt;
    default_type "text/plain";
}
```

নিশ্চিত করুন `/var/www/letsencrypt` আছে আর nginx-এর কাছে readable।

**`DNS problem: NXDOMAIN looking up A for example.com`**

আপনার A record অনুপস্থিত বা unpropagated। চেক করুন:

```bash
dig +short example.com @1.1.1.1
dig +short example.com @8.8.8.8
```

দুইটাই কিছু না ফেরালে, record প্রকাশিত হয়নি। একটা IP ফেরায় আর আরেকটা না ফেরালে, propagation চলছে — অপেক্ষা করুন।

**`Too many failed authorizations recently`**

আপনি ঘণ্টায় 5-failure rate limit-এ লেগেছেন। staging-এ সুইচ করুন, আপনার config ঠিক করুন, তারপর ফিরে আসুন:

```bash
sudo certbot certonly --staging --nginx -d example.com
```

staging-এ সবকিছু কাজ করার পর, production command চালান। staging cert পরিষ্কারভাবে replace হবে।

**`There were too many requests of a given type`**

আপনি একটা duplicate cert বা new-order rate limit-এ লেগেছেন। কয়েক ঘণ্টা অপেক্ষা করে retry করুন, বা একসাথে যে নামগুলো request করছেন তার সংখ্যা কমান।

## বিদ্যমান cert-এ আরও domain যোগ করা

আপনার cert-কে একটা নতুন subdomain (`api.example.com`) দিয়ে বাড়াতে:

```bash
sudo certbot --nginx -d example.com -d www.example.com -d api.example.com
```

একই command, নতুন নাম যোগ করা। certbot বিদ্যমান cert replace করে। নতুন cert তিনটা নামই কভার করে।

পরে নাম সরাতে, `/etc/letsencrypt/renewal/example.com.conf` (renewal-time domain তালিকা) edit করুন — কিন্তু আরও নির্ভরযোগ্যভাবে, delete করে reissue করুন:

```bash
sudo certbot delete --cert-name example.com
sudo certbot --nginx -d example.com -d www.example.com
```

## domain প্রতি আলাদা cert সংরক্ষণ

ডিফল্টভাবে, certbot একাধিক SAN entry সহ একটা cert তৈরি করে। আপনি domain প্রতি একটা cert পছন্দ করলে (ভিন্ন lifecycle, ভিন্ন server), ব্যবহার করুন:

```bash
sudo certbot --nginx -d example.com         # cert "example.com"
sudo certbot --nginx -d api.example.com     # separate cert "api.example.com"
```

প্রতিটা cert `/etc/letsencrypt/live/`-এর অধীনে নিজের directory-তে থাকে। দুইটাই একই timer-এ renew হয়।

## certbot-এর nginx-managed config সরানো

আপনি পরে সিদ্ধান্ত নিলে যে nginx হাতে ম্যানেজ করতে চান:

```bash
sudo certbot certonly --nginx -d example.com
```

`certonly` cert ইস্যু করে কিন্তু nginx **modify করে না**। তারপর আপনি নিজে nginx edit করেন, `/etc/letsencrypt/live/example.com/{fullchain,privkey}.pem`-এ পয়েন্ট করে (চ্যাপ্টার 7 প্রস্তাবিত config কভার করে)।

মিশ্র সেটআপের জন্য (কিছু সাইট certbot দ্বারা ম্যানেজড, অন্যগুলো হাতে), এটা ঠিক আছে।

## বাইরে থেকে sanity check

একটা SSL Labs scan চালান:

```text
https://www.ssllabs.com/ssltest/analyze.html?d=example.com
```

একটা fresh certbot install-এর A বা A+ স্কোর করা উচিত। কম দেখলে, পরের চ্যাপ্টারগুলো tune করার dial কভার করে।

## রিক্যাপ

- ইনস্টল: `apt install certbot python3-certbot-nginx`। চালান: `sudo certbot --nginx -d <domain>`।
- প্রিরেকুইজিট: VPS-এ পয়েন্ট করা domain, port 80/443 খোলা, বেসিক nginx server block সাজানো।
- certbot `fullchain.pem` আর `privkey.pem` `/etc/letsencrypt/live/<domain>/`-এ লেখে আর স্বয়ংক্রিয়ভাবে nginx edit করে।
- একটা systemd timer দিনে দুইবার renew করে, expiration-এর 30 দিন আগে, একটা reload hook সহ।
- `certbot renew --dry-run` হলো rate limit না পুড়িয়ে renewal টেস্ট করার নিরাপদ উপায়।
- Failure সাধারণত ফিরে যায়: port 80 unreachable, location matching, বা DNS propagation-এ।
- আরও নিয়ন্ত্রণের জন্য, `certonly` ব্যবহার করুন আর nginx হাতে edit করুন।

পরের চ্যাপ্টার: যখন HTTP-01 যথেষ্ট নয় — wildcard আর DNS-01 challenge।
