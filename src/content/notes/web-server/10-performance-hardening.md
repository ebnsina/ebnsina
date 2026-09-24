---
title: 'Performance & Hardening'
subtitle: 'Workers, sendfile, gzip আর brotli, security headers, rate limiting, connection limits, body size caps। যে dial-গুলো একটি কর্মক্ষম nginx-কে দ্রুত ও প্রতিরোধযোগ্য বানায়।'
chapter: 10
level: 'advanced'
readingTime: '14 মিনিট'
topics: ['nginx', 'performance', 'hardening', 'rate limiting', 'security headers', 'tls']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা বাগদাদের একটা শিপিং ডিপো চালান। প্রতিদিন হাজার হাজার পার্সেল ঢোকে, বেরোয়। শুরুতে ডিপোটা কাজ করত, কিন্তু ধীর আর অরক্ষিত। ফাতিমা প্রথমে পার্সেলগুলো vacuum দিয়ে ছোট করে প্যাক করা শুরু করলেন — একই জিনিস কম জায়গায়, তাই কুরিয়ারের ভ্যানে বেশি ধরে আর দ্রুত রওনা হয়। এরপর তিনি খেয়াল করলেন, প্রতিটা পার্সেলের জন্য আলাদা ভ্যান ভাড়া করলে সময় নষ্ট হয়; তাই একটা ভ্যান কিছুক্ষণ দাঁড় করিয়ে রাখেন, পরের কয়েকটা পার্সেলও সেই একই ভ্যানেই তুলে দেন।

কিন্তু ডিপোতে বিশৃঙ্খলাও ছিল। একজন প্রেরক একাই শত শত পার্সেল ঢেলে বাকিদের আটকে দিত, আর কোনো একটা কাজ ঘণ্টার পর ঘণ্টা একটা bay দখল করে বসে থাকত। ফাতিমা নিয়ম করলেন — এক প্রেরক নির্দিষ্ট সংখ্যার বেশি পার্সেল দিতে পারবে না, আর কোনো কাজ নির্দিষ্ট সময়ের বেশি bay ধরে রাখতে পারবে না। পাশাপাশি প্রতিটা চালান tamper-proof সিল করা বাক্সে বন্ধ করলেন, যাতে পথে কেউ খুলতে না পারে। আর শেষে বাক্সের গায়ে ছাপানো ডিপোর ব্র্যান্ড আর ভেতরের ম্যাপ মুছে দিলেন — চোর বাইরে থেকে দেখে যেন কিছুই আঁচ করতে না পারে।

এই গল্পটাই এই chapter-এর pattern। vacuum-প্যাক করে পার্সেল ছোট করা হলো **gzip/compression** (byte কমিয়ে দ্রুত পাঠানো)। একটা ভ্যান দাঁড় করিয়ে রেখে পরের পার্সেলও তাতে তোলা হলো **keep-alive** (একই connection পুনরায় ব্যবহার)। এক প্রেরকের পার্সেল-সীমা আর bay-এর সময়সীমা হলো **rate limit**, **connection limit** আর **timeout**। tamper-proof সিল করা বাক্স হলো **TLS**। আর বাক্সের গায়ের ব্র্যান্ড-ম্যাপ মুছে দেওয়া হলো **server version হাইড করা** (`server_tokens off`) আর **security header** সেট করা — বাইরে থেকে attacker যেন কম তথ্য পায়। বাস্তবে nginx-এ ঠিক এই dial-গুলো ঘুরিয়েই একটা কাজ-চলা server-কে দ্রুত আর হার্ডেনড production server বানানো হয়।

## চারটি lever

একটি টিউনড nginx ডিফল্ট থেকে চারটি জিনিস সমন্বয় করে:

1. **Workers আর connection limit** — box-এর core আর FD budget-এর সাথে মেলান।
2. **I/O efficiency** — sendfile, tcp_nopush, tcp_nodelay, keepalive।
3. **Compression** — gzip আর brotli, আদর্শভাবে build time-এ precompressed।
4. **Defensive limit** — request size, rate limit, slow-client timeout, security header।

প্রতিটাই কয়েক লাইন। একসাথে এরা একটি ডিফল্ট install-কে (যা এমনিতেই হাজার হাজার req/s সামলায়) এমন কিছুতে পরিণত করে যা কয়েক দশ হাজার সামলায় আর স্পষ্ট abuse প্রত্যাখ্যান করে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Performance hardening অনেকটা একটা race car টিউন করার মতো — engine এমনিতেই কাজ করে, কিন্তু প্রতিটি সুচিন্তিত সমন্বয় যা আছে তা থেকেই আরও গতি আর নির্ভরযোগ্যতা বের করে আনে।

</Callout>

## Workers — প্রতি CPU core-এ একটি

```nginx
worker_processes auto;
worker_rlimit_nofile 65536;
```

`auto` `worker_processes`-কে CPU core-এর সংখ্যার সমান করে। একটি 4-core VPS-এ আপনি 4টি worker পান, প্রতিটি নিজের event loop চালায়, প্রতিটি (কার্যত) একটি করে আলাদা core-এ pinned।

`worker_rlimit_nofile` per-worker file descriptor limit-কে system-এর ডিফল্ট 1024-এর ওপরে তোলে। এটাকে প্রতিটি active connection, খোলা backend connection, আর খোলা file handle-এর জায়গা দিতে হবে। বেশিরভাগ setup-এর জন্য 65536 একটি নিরাপদ upper bound।

```nginx
events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}
```

- **`worker_connections`** — প্রতি worker-এ সর্বোচ্চ simultaneous connection। `worker_processes` দিয়ে গুণ করলে সেটাই আপনার মোট cap। 4096 × 4 = প্রতি box-এ 16384 simultaneous connection।
- **`multi_accept on`** — একটি wakeup-এ সব available connection accept করো, শুধু একটা নয়। সামান্য কিন্তু বিনামূল্যে।
- **`use epoll`** — Linux-এ explicit। nginx auto-detect করে, কিন্তু এটা বলা intent নথিভুক্ত করে।

## sendfile, tcp_nopush, tcp_nodelay

```nginx
http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;
    types_hash_max_size 2048;
    server_tokens off;
}
```

- **`sendfile on`** — file byte সরাসরি page cache থেকে socket-এ পাঠাতে `sendfile()` syscall ব্যবহার করে, userspace এড়িয়ে। static content-এর জন্য অত্যন্ত জরুরি; CPU বাঁচায়।
- **`tcp_nopush on`** — sendfile-এর সাথে মিলিয়ে, পাঠানোর আগে response data-কে পূর্ণ packet-এ প্যাক করে। packet সংখ্যা কমায়।
- **`tcp_nodelay on`** — keepalive connection-এ Nagle-র algorithm বন্ধ করে যাতে ছোট response দেরি না হয়। `tcp_nopush`-এর সাথে সাংঘর্ষিক শোনায়, কিন্তু nginx এই interaction সঠিকভাবে সামলায়: বাল্ক পাঠানোর জন্য `tcp_nopush`, চূড়ান্ত flush-এর জন্য `tcp_nodelay`।
- **`keepalive_timeout 65`** — idle connection 65 সেকেন্ড খোলা রাখো। যথেষ্ট লম্বা যাতে পরের page navigation connection পুনরায় ব্যবহার করে; যথেষ্ট ছোট যাতে idle scanner FD আটকে না রাখে।
- **`keepalive_requests 1000`** — 1000 request-এর পর একটি connection বন্ধ করো। খুব দীর্ঘমেয়াদে per-connection memory স্ফীতি আটকায়।
- **`server_tokens off`** — `Server:` header আর error page থেকে nginx-এর version বাদ দাও। সামান্য security কিন্তু বিনামূল্যে।

## gzip আর brotli

```nginx
http {
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        application/json
        application/javascript
        text/xml
        application/xml
        application/xml+rss
        text/javascript
        image/svg+xml;
}
```

- **`gzip_comp_level 5`** — sweet spot। Level 9 আরও কয়েক শতাংশ বাঁচায় কিন্তু প্রতি request-এ উল্লেখযোগ্য বেশি CPU খরচ করে।
- **`gzip_min_length 1024`** — খুব ছোট response compress করবেন না; overhead-এর মূল্য নেই।
- **`gzip_types`** — কী compress করবে। ইতিমধ্যে compressed format compress **করবেন না**: jpg, png, mp4, woff2 — এরা বড় হয়ে যায়।
- **`gzip_vary on`** — `Vary: Accept-Encoding` যোগ করে যাতে cache compressed আর uncompressed client আলাদাভাবে সামলায়।

brotli-র জন্য (gzip-এর চেয়ে ভালো compression, সামান্য বেশি CPU) nginx-এর `ngx_brotli` module দরকার, যা Debian আর Ubuntu এখন `libnginx-mod-http-brotli-filter` হিসেবে ship করে:

```bash
sudo apt install -y libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static
```

তারপর:

```nginx
brotli on;
brotli_comp_level 5;
brotli_static on;
brotli_types text/plain text/css application/json application/javascript application/xml image/svg+xml;
```

`brotli_static on` আর `gzip_static on` মূল file-এর পাশে pre-compressed `.br` আর `.gz` file খোঁজে (যেমন `app.js`-এর পাশে `app.js.br`) আর client encoding সাপোর্ট করলে সেগুলো serve করে। আপনার build step এগুলো তৈরি করলে nginx কখনো compress করতে CPU ব্যয় করে না — বিশুদ্ধ সাশ্রয়।

## TLS — modern, fast, safe

`/etc/letsencrypt/live/example.com/`-এ Let's Encrypt cert আছে ধরে নিয়ে:

```nginx
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;

    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305';

    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout 5s;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
}
```

মূল পয়েন্ট:

- **`http2 on;`** — আধুনিক syntax। পুরনো config-এ থাকে `listen 443 ssl http2;` — একই ধারণা।
- **শুধু TLS 1.2 + 1.3।** TLS 1.0 আর 1.1 প্রতিটি browser deprecate করেছে।
- **আধুনিক cipher তালিকা।** লেখার সময় এই তালিকা Mozilla-র "intermediate" সুপারিশ — সব current browser কভার করে, কোনো দুর্বল cipher নেই।
- **OCSP stapling.** cert-এর সাথে certificate-এর revocation status serve করে, client-এর একটা round-trip বাঁচায়।
- **HSTS.** browser-কে বলে "পরের 2 বছর এই domain-এর জন্য সবসময় HTTPS ব্যবহার করো"। সাবধান — একবার browser HSTS দেখলে, মনে রাখে; পরে HTTP-তে ফিরতে চাইলে পারবেন না।

সবসময় একটি HTTP→HTTPS redirect রাখুন:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

## Body size limit

```nginx
http {
    client_max_body_size 10m;
    client_body_buffer_size 128k;
    client_body_timeout 60s;
    client_header_timeout 10s;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 8k;
}
```

- **`client_max_body_size 10m`** — request body 10MB-এ সীমাবদ্ধ। upload endpoint-এর জন্য per location বাড়ান; অন্য সব জায়গায় কমান। 1MB-এর ডিফল্ট অনেক API-তে বিনা সতর্কবার্তায় ব্যর্থ হয়।
- **`client_body_timeout 60s`** — client থেকে body byte-এর মধ্যে সর্বোচ্চ সময়। এর বাইরের slow upload drop হয়। আপনার workload-এর জন্য tune করুন।
- **`client_header_timeout 10s`** — request header পড়ার সর্বোচ্চ সময়। Slowloris-এর বিরুদ্ধে রক্ষা করে।

## Rate limiting

দুটি layer: per-second rate (মসৃণ প্রবাহ) আর per-burst (ছোট spike অনুমোদন)।

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api_rl:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login_rl:10m rate=5r/m;

    limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
}
```

- **`limit_req_zone`** — per key request rate ট্র্যাক করার জন্য একটি memory zone ডিফাইন করে। `$binary_remote_addr` client IP-তে key করে (IPv4-এর জন্য 4 byte, IPv6-এর জন্য 16 — `$remote_addr`-এর চেয়ে বেশি entry ধরে)।
- **`zone=api_rl:10m rate=10r/s`** — নাম `api_rl`, 10MB shared zone, target rate সেকেন্ডে 10 request।
- **`limit_conn_zone`** — per key concurrent connection-এর জন্য একই ধারণা।

একটি location-এ প্রয়োগ করুন:

```nginx
server {
    location /api/ {
        limit_req zone=api_rl burst=20 nodelay;
        limit_conn conn_per_ip 10;

        proxy_pass http://app_backend;
    }

    location /login {
        limit_req zone=login_rl burst=3 nodelay;
        proxy_pass http://app_backend;
    }
}
```

- **`burst=20`** — 20টি পর্যন্ত request-এর একটি burst অনুমোদন করো। এর পর request queue হয় বা প্রত্যাখ্যাত হয়।
- **`nodelay`** — burst অনুমোদিত হলে দেরি করো না; শুধু burst পূর্ণ হলেই প্রত্যাখ্যান করো।
- **`limit_conn conn_per_ip 10`** — একটি client থেকে সর্বোচ্চ 10টি concurrent connection।

rate ছাড়িয়ে যাওয়া request `503 Service Unavailable` পায় (429-তে কনফিগারযোগ্য):

```nginx
limit_req_status 429;
limit_conn_status 429;
```

`429 Too Many Requests` হলো rate-limited response-এর জন্য spec-অনুযায়ী সঠিক status।

<Callout type="info">

**proxy-তে rate limiting হলো সবচেয়ে সস্তা প্রতিরক্ষা।**

প্রতিটি প্রত্যাখ্যাত request nginx-এর একটি memory-zone lookup খরচ করে (microsecond)। একই request আপনার backend-এ hit করলে খরচ করত একটি database query, একটি auth check, আর একটি render — millisecond। nginx যখন প্রত্যাখ্যানগুলো শুষে নেয় তখন abuse হওয়া একটা box রক্ষা করা কয়েক অর্ডার অফ ম্যাগনিটিউড সস্তা হয়ে যায়।

</Callout>

## Security header

```nginx
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'" always;
```

প্রতিটি যা আটকায়:

- **HSTS** — downgrade-to-HTTP আক্রমণ।
- **X-Frame-Options: DENY** — framing-এর মাধ্যমে clickjacking।
- **X-Content-Type-Options: nosniff** — browser MIME-sniffing text-কে HTML বানিয়ে ফেলা।
- **Referrer-Policy** — তৃতীয় পক্ষের কাছে পুরো referer URL ফাঁস হওয়া।
- **Permissions-Policy** — স্পষ্টভাবে সক্ষম না করা পর্যন্ত geolocation, mic, camera ইত্যাদি block করে।
- **Content-Security-Policy** — সবচেয়ে শক্তিশালী আর সেটআপ করতে সবচেয়ে কষ্টকর। script/style/image কোথা থেকে আসতে পারে তা সীমাবদ্ধ করে। উপরের লাইনটা একটা শুরুর বিন্দু; আপনার app-এর জন্য আরও আঁটসাঁট করুন।

`always` parameter অপরিহার্য — এটা ছাড়া error response-এ header বাদ পড়ে।

## ngx_http_realip_module — client IP পুনরুদ্ধার

যখন nginx একটি CDN বা অন্য load balancer-এর পেছনে থাকে, `$remote_addr` হলো _upstream proxy_, client নয়। nginx-কে `X-Forwarded-For` বিশ্বাস করতে কনফিগার করুন:

```nginx
set_real_ip_from 10.0.0.0/8;
set_real_ip_from 172.16.0.0/12;
set_real_ip_from 192.168.0.0/16;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
```

`set_real_ip_from` বিশ্বস্ত proxy network-গুলোর তালিকা করে। শুধু যখন কোনো request এদের একটা থেকে আসে তখনই `X-Forwarded-For` chain বিশ্বাস করা হয়। `real_ip_recursive on` chain-টা পেছন দিকে হাঁটে যতক্ষণ না একটি non-trusted IP পাওয়া যায় — সেটাই আসল client।

এখন `$remote_addr` আসল client দেখায়; rate limiting সঠিক key-তে সঠিকভাবে কাজ করে; log নির্ভুল।

## high traffic-এর জন্য connection tuning

```nginx
http {
    open_file_cache max=10000 inactive=60s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;
}
```

static file-এর জন্য `stat()` আর `open()`-এর ফলাফল memory-তে cache করে, যাতে ঘন ঘন request দুবার syscall-এর খরচ না দেয়। একটি static-ভারী server-এর জন্য এটাই কয়েক শতাংশের জয়।

## সব একসাথে জোড়া লাগানো — production base config

একটি ন্যূনতম production-grade `nginx.conf`-এর রূপরেখা:

```nginx
worker_processes auto;
worker_rlimit_nofile 65536;
pid /run/nginx.pid;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server_tokens off;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    keepalive_requests 1000;

    client_max_body_size 10m;
    client_body_timeout 60s;
    client_header_timeout 10s;

    open_file_cache max=10000 inactive=60s;
    open_file_cache_valid 60s;
    open_file_cache_min_uses 2;
    open_file_cache_errors on;

    gzip on;
    gzip_vary on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss image/svg+xml;

    log_format main_ext escape=json
        '{"time":"$time_iso8601","remote_addr":"$remote_addr",'
        '"request":"$request","status":$status,'
        '"body_bytes_sent":$body_bytes_sent,'
        '"request_time":$request_time,'
        '"upstream_response_time":"$upstream_response_time",'
        '"request_id":"$request_id"}';
    access_log /var/log/nginx/access.log main_ext;
    error_log  /var/log/nginx/error.log warn;

    limit_req_zone $binary_remote_addr zone=api_rl:10m rate=20r/s;
    limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
    limit_req_status  429;
    limit_conn_status 429;

    set_real_ip_from 10.0.0.0/8;
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;

    proxy_cache_path /var/cache/nginx/main
        levels=1:2 keys_zone=main:100m max_size=2g
        inactive=24h use_temp_path=off;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

এটাই base। `sites-available`-এর অধীনে per-site `server { ... }` block যোগ করুন আর `sites-enabled`-এ symlink করুন।

## performance টেস্ট করা

```bash
# Simple synthetic load
sudo apt install -y wrk
wrk -t4 -c200 -d30s https://example.com/

# Specific endpoint with custom headers
wrk -t8 -c1000 -d60s -H 'Host: example.com' https://192.0.2.5/api/items

# Loadtest with k6 (chapter 24 of testing track)
k6 run --vus 100 --duration 30s loadtest.js
```

টেস্টের সময় nginx লক্ষ্য করুন:

```bash
sudo tail -f /var/log/nginx/access.log | jq 'select(.request_time > 0.5)'
sudo tail -f /var/log/nginx/error.log
htop                # check CPU per worker
ss -s              # connection counts
```

Bottleneck সাধারণত অনুমানযোগ্য জায়গায় দেখা দেয়: backend exhaustion (upstream_status-এ 5xx), worker_connections limit (nginx error log-এ error), অথবা `worker_rlimit_nofile` (`accept() failed (24: Too many open files)`)।

## রিক্যাপ

- প্রতি core-এ একটি worker। `worker_rlimit_nofile` আর `worker_connections` বাড়ান।
- `sendfile`, `tcp_nopush`, `tcp_nodelay`, সেনসিবল keepalive সক্রিয় করুন।
- gzip + brotli, `gzip_static` / `brotli_static` দিয়ে precompressed asset সহ।
- TLS 1.2/1.3, আধুনিক cipher, OCSP stapling, HSTS, HTTP→HTTPS force-redirect।
- request body size আর slow-client timeout সীমিত করুন। per IP `limit_req` আর `limit_conn`।
- `X-Frame-Options`, `X-Content-Type-Options`, CSP, Permissions-Policy সেট করুন। সবসময় `always` সহ।
- `set_real_ip_from` যাতে log আর rate-limiting একটি CDN-এর পেছনে আসল client দেখে।
- load-test করতে `wrk`, bottleneck খুঁজতে `htop` আর access log।

এটাই Web Server Fundamentals ট্র্যাকের শেষ। raw socket থেকে HTTP-র শুরু, একদম একটি হার্ডেনড production nginx পর্যন্ত — আপনার এখন একটি কর্মক্ষম mental model আছে, আর আপনি নিজের config পড়তে, পরিবর্তন করতে, আর বিশ্বাস করতে পারেন।
