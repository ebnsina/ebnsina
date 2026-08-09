---
title: 'SSL Termination'
subtitle: 'Load balancer-এ TLS, certificate management, LB আর backend-এর মাঝে HTTPS, আর offload করা vs end-to-end encryption-এর trade-off।'
chapter: 4
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['SSL', 'TLS', 'HTTPS', 'certificates', 'nginx', 'HAProxy', 'termination']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বাগদাদের এক বিশাল বাণিজ্য-প্রতিষ্ঠানের সদর ফটকে একটা front mailroom আছে, যেখানে ফাতিমা আল-ফিহরির নেতৃত্বে একটা বিশেষজ্ঞ দল বসে। বাইরে থেকে আসা প্রতিটা গোপন চিঠি মোমের সিল দিয়ে বন্ধ করা, তালাবদ্ধ — সিল না ভেঙে ভেতরের একটা কথাও পড়া যায় না। ফাতিমার দলের কাছেই আছে সব সিল-চাবি আর সিল ভাঙার যন্ত্রপাতি। তারা সদর ফটকেই প্রতিটা চিঠির সিল ভাঙে, ভেতরের লেখা পড়ার উপযোগী সাধারণ কপি বানায়, তারপর সেই খোলা কপি ভেতরের সঠিক দপ্তরে পাঠিয়ে দেয়।

ভেতরের দপ্তরগুলো — হিসাব বিভাগ, চিঠিপত্র বিভাগ, আল-খোয়ারিজমির গণিত বিভাগ — কেউই আর নিজের ঘরে সিল ভাঙার দামি যন্ত্র বা প্রশিক্ষিত লোক রাখে না। তারা শুধু সামনের ঘর থেকে আসা পরিষ্কার কপি হাতে পায় আর নিজের কাজে মন দেয়। নতুন সিল-নকশা এলে বা পুরনো চাবি বদলাতে হলে সেটাও শুধু ওই একটা front mailroom-এই সামলানো হয় — গোটা ভবনে ছড়িয়ে-ছিটিয়ে নয়।

এই front mailroom-ই হলো **SSL termination**। সিল করা তালাবদ্ধ চিঠি হলো incoming HTTPS traffic, আর সদর ফটকে ফাতিমার দলের সিল ভাঙা মানে load balancer edge-এ TLS terminate করা। খোলা কপি ভেতরে পাঠানো মানে backend-এ plain HTTP forward করা — তাই প্রতিটা backend আর নিজে decrypt করার CPU খরচ বহন করে না, ঠিক যেমন ভেতরের দপ্তরগুলো সিল ভাঙার যন্ত্র রাখে না। আর সব সিল-চাবি এক ঘরে থাকা মানে certificate একটাই জায়গায় centrally manage করা। বাস্তবে nginx বা HAProxy দিয়ে ঠিক এভাবেই HTTPS edge-এ terminate করে backend-কে হালকা রাখা হয় — আর PCI-DSS/HIPAA-র মতো নিয়ন্ত্রিত ক্ষেত্রে দরকার হলে ভেতরের করিডোরেও আবার encrypt (re-encryption) করে end-to-end TLS রাখা যায়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা অফিস ভবনের নিরাপদ mail room: আসা encrypted চিঠি front desk-এ (load balancer) decrypt করা হয়, তারপর অভ্যন্তরীণ করিডোর দিয়ে সঠিক department-এ (backend server) plaintext-এ পৌঁছে দেওয়া হয়। বাইরের হুমকি edge-এ সামলানো হয়; ভেতরে, আপনি নিজের network-কে বিশ্বাস করেন। অভ্যন্তরীণ করিডোরগুলো আবার encrypt করবেন কিনা সেটা আপনার threat model-এর ভিত্তিতে একটা policy সিদ্ধান্ত।

</Callout>

## LB-তে কেন Terminate করবেন

TLS গণনাগতভাবে ব্যয়বহুল — handshake, cipher negotiation, record processing। load balancer-এ terminate করার কয়েকটা সুবিধা আছে:

1. **একটাই cert location** — renew করার একটা জায়গা, OCSP stapling-এর একটা জায়গা
2. **Backend সহজ থাকে** — প্রতিটা server-এ কোনো TLS code বা cert নেই
3. **LB request inspect করতে পারে** — plaintext HTTP না দেখে path routing করা যায় না
4. **CPU offload** — dedicated hardware বা optimized LB instance TLS সামলায়

Trade-off: LB আর backend-এর মাঝের traffic unencrypted থাকে (বা আলাদা internal TLS দরকার হয়)। নিয়ন্ত্রিত industry-র জন্য (PCI-DSS, HIPAA), end-to-end encryption দরকার হতে পারে।

## nginx SSL Termination

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate     /etc/ssl/api.example.com.crt;
    ssl_certificate_key /etc/ssl/api.example.com.key;

    # Modern TLS settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Session resumption (avoids full handshake for returning clients)
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # OCSP Stapling — include cert status in TLS handshake (no client roundtrip)
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/ssl/chain.pem;
    resolver 8.8.8.8 8.8.4.4 valid=300s;

    # HSTS — tell browsers to always use HTTPS
    add_header Strict-Transport-Security "max-age=63072000" always;

    location / {
        proxy_pass http://notes;   # plain HTTP to backends
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$host$request_uri;
}
```

## HAProxy SSL Termination

```
frontend https_in
    bind *:443 ssl crt /etc/ssl/api.example.com.pem
    mode http
    option forwardfor
    http-request set-header X-Forwarded-Proto https

    # Modern TLS
    bind *:443 ssl crt /etc/ssl/api.example.com.pem \
        alpn h2,http/1.1 \
        no-sslv3 no-tlsv10 no-tlsv11 \
        ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256

    default_backend api_servers

frontend http_in
    bind *:80
    mode http
    redirect scheme https code 301

backend api_servers
    mode http
    server s1 10.0.0.10:3000 check
    server s2 10.0.0.11:3000 check
```

HAProxy আশা করে cert আর key একটা `.pem` file-এ যুক্ত করা থাকবে:

```bash
cat api.example.com.crt api.example.com.key > /etc/ssl/api.example.com.pem
```

## Let's Encrypt দিয়ে Certificate Automation

হাতে cert renew করা একটা রক্ষণাবেক্ষণের বোঝা। Automate করতে `certbot` ব্যবহার করুন:

```bash
# Install certbot
apt install certbot python3-certbot-nginx

# Issue and install certificate
certbot --nginx -d api.example.com

# Test auto-renewal
certbot renew --dry-run

# Certbot installs a cron job:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

HAProxy-র জন্য, concatenate করে reload করতে post-renewal hook:

```bash
# /etc/letsencrypt/renewal-hooks/post/haproxy.sh
#!/bin/bash
DOMAIN="api.example.com"
cat /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    > /etc/haproxy/ssl/$DOMAIN.pem
systemctl reload haproxy
```

## একাধিক Domain (SNI)

Server Name Indication (SNI) একটা IP-কে একাধিক domain সামলাতে দেয় — client TLS handshake-এ hostname পাঠায়, আর LB সঠিক cert বেছে নেয়।

**nginx — একাধিক cert:**

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;
    ssl_certificate /etc/ssl/api.example.com.crt;
    ssl_certificate_key /etc/ssl/api.example.com.key;
    # ...
}

server {
    listen 443 ssl;
    server_name app.example.com;
    ssl_certificate /etc/ssl/app.example.com.crt;
    ssl_certificate_key /etc/ssl/app.example.com.key;
    # ...
}
```

**HAProxy — wildcard cert directory:**

```
bind *:443 ssl crt /etc/haproxy/ssl/
```

HAProxy directory-তে `.pem` file খোঁজে আর SNI-র ভিত্তিতে সঠিকটা serve করে। directory-তে একটা file ফেলে reload করে একটা cert যোগ করুন।

## Backend Traffic আবার Encrypt করা

যদি আপনার end-to-end TLS দরকার হয় (LB → backend-ও encrypted):

**nginx:**

```nginx
location / {
    proxy_pass https://notes;   # HTTPS to backend
    proxy_ssl_certificate     /etc/ssl/client.crt;
    proxy_ssl_certificate_key /etc/ssl/client.key;
    proxy_ssl_verify          on;
    proxy_ssl_trusted_certificate /etc/ssl/notes-ca.crt;
}
```

**HAProxy:**

```
backend api_servers
    mode http
    server s1 10.0.0.10:3443 check ssl verify required ca-file /etc/ssl/ca.crt
```

mutual TLS (mTLS)-এর জন্য — backend LB-র client cert verify করে:

```
backend api_servers
    server s1 10.0.0.10:3443 check ssl \
        verify required ca-file /etc/ssl/ca.crt \
        crt /etc/haproxy/client.pem
```

## TLS 1.3 Performance

TLS 1.3 handshake-কে 1 round-trip-এ কমায় (1.2-এর জন্য 2-এর বিপরীতে) আর returning client-এর জন্য 0-RTT resumption support করে:

```nginx
ssl_protocols TLSv1.3;    # TLS 1.3 only
```

nginx-এ 0-RTT (experimental — non-idempotent request-এর জন্য replay attack-এর ঝুঁকি আছে):

```nginx
ssl_early_data on;
proxy_set_header Early-Data $ssl_early_data;
```

Production-এ: 1.2 আর 1.3 দুটোই support করুন। Browser সর্বোচ্চ supported version negotiate করে। 1.0 আর 1.1 disable করুন:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
```

## আসল Protocol Forward করা

Backend application-এর জানা দরকার মূল protocol HTTPS ছিল (redirect, cookie, HSTS-এর জন্য):

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

Application এটা পড়ে:

```typescript
// Express
app.set('trust proxy', 1); // trust X-Forwarded-* headers from first proxy

app.get('/redirect', (req, res) => {
	// req.protocol is 'https' even though connection to Express is plain HTTP
	res.redirect(`${req.protocol}://${req.hostname}/dashboard`);
});
```

এটা ছাড়া, আপনার app HTTPS client-দের জন্য `http://` redirect URL তৈরি করবে, যা redirect loop ঘটায়।
