---
title: 'nginx Fundamentals'
subtitle: 'ইনস্টল করুন, config-এর গঠন সাজান, server block লিখুন, location আর include বুঝুন। যে nginx মেন্টাল মডেল প্রতিটি advanced feature-এর জন্য টিকে থাকে।'
chapter: 6
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['nginx', 'configuration', 'server blocks', 'locations']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা একটা বিশাল অফিস কমপ্লেক্সের ফ্রন্ট-ডেস্ক ম্যানেজার। তার একটাই কাজ — দিনে হাজার হাজার লোক এসে বলে "আমি লাইব্রেরি করিডোরে যাব", "আমি অফিস করিডোরে যাব" — আর তাকে চোখের পলকে সবাইকে ঠিক জায়গায় পাঠিয়ে দিতে হয়। মজার ব্যাপার হলো, ফাতিমা কখনো নিজের মাথা খাটিয়ে সিদ্ধান্ত নেয় না, কখনো "মনে হচ্ছে আপনি ওখানে যাবেন" বলে আন্দাজ করে না। তার সামনে একটা মোটা লিখিত রুলবুক খোলা থাকে, আর সে অক্ষরে অক্ষরে সেটাই মেনে চলে — দ্রুত, নির্ভুল, একটুও এদিক-ওদিক না করে।

রুলবুকটা সুন্দরভাবে সাজানো। প্রতিটা বিল্ডিং-এর জন্য আলাদা একটা সেকশন — সিনা টাওয়ার, খোয়ারিজমি হল — প্রতিটার নিজস্ব ঠিকানা আর পোর্ট লেখা। আর প্রতিটা সেকশনের ভেতরে করিডোর-ভিত্তিক নিয়ম: "যার গন্তব্য /library, তাকে এই সিঁড়িতে পাঠাও", "যার গন্তব্য /office, তাকে ওই লিফটে পাঠাও"। কেউ /library চাইলে ফাতিমা রুলবুকের ঠিক ওই লাইনটা খুঁজে বের করে, আর সেখানে লেখা প্রতিটা নির্দেশ — কোন তলা, কোন চাবি, কার অনুমতি লাগবে — হুবহু পালন করে। নতুন বিল্ডিং যোগ হলে সে শুধু রুলবুকে একটা নতুন সেকশন লিখে দেয়, ব্যস।

এই গল্পটাই আসলে **nginx**। ফাতিমা হলো nginx — একটা **event-driven** ম্যানেজার যে অল্প শক্তিতে বিপুল ভিড় সামলায়। পুরো রুলবুকটা হলো nginx **config**, যেটা **declarative** — কী করতে হবে সেটা লেখা থাকে, কীভাবে করবে সেটা nginx নিজে বুঝে নেয়, কোনো improvisation নেই। প্রতিটা বিল্ডিং-এর সেকশন হলো একটা **server block** (একটা ডোমেইন/পোর্টের জন্য নিয়মের সেট), করিডোর-ভিত্তিক "/library এখানে, /office ওখানে" নিয়মগুলো হলো **location block** যা URL path দেখে ম্যাচ করে, আর ভেতরের প্রতিটা নির্দেশ-লাইন হলো একটা **directive**। বাস্তবে ঠিক এভাবেই একটা `nginx.conf` ফাইলে server block আর location block সাজিয়ে হাজার হাজার request রাউট করা হয় — GitHub, Netflix থেকে শুরু করে ছোট VPS পর্যন্ত সবাই এই লিখিত রুলবুক মডেলেই চলে।

## nginx কেন

nginx দ্রুত, স্থিতিশীল, একটি VPS থেকে শুরু করে global CDN পর্যন্ত প্রতিটি স্কেলে deploy করা হয়েছে, খুবই অল্প CPU-তে চলে, আর এর একটা config language আছে যা এই অধ্যায় পড়া হয়ে গেলে বোধগম্য হয়ে ওঠে। "আমার static file কে serve করবে আর আমার app কে proxy করবে" — এর স্ট্যান্ডার্ড উত্তর এটাই। এই অধ্যায় গঠনটা শেখায়; পরের অধ্যায়গুলো reverse proxying, caching, performance tuning যোগ করে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

nginx অনেকটা একটি চৌরাস্তার ট্রাফিক পুলিশের মতো — এটা ভেতরের মালামালে হাত না দিয়েই প্রতিটি request-কে সঠিক লেনে পাঠিয়ে দেয়।

</Callout>

## Debian/Ubuntu-তে ইনস্টল করা

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

যাচাই করুন:

```bash
curl -i http://localhost/
# HTTP/1.1 200 OK
# Server: nginx/1.24.0
# ...
# Welcome to nginx!
```

ডিফল্ট config `/usr/share/nginx/html/index.html` serve করে (অথবা Debian-এ `/var/www/html/index.nginx-debian.html`)। এটা আপনি বদলে দেবেন।

## ফাইল লেআউট

```text
/etc/nginx/
├── nginx.conf              # main config — usually minimal
├── conf.d/                 # custom global configs
├── sites-available/        # virtual host files (you write these)
├── sites-enabled/          # symlinks to sites-available (active hosts)
├── modules-enabled/        # dynamic modules
├── snippets/               # reusable config snippets
├── mime.types              # extension → MIME type map
└── fastcgi_params, uwsgi_params, scgi_params

/var/log/nginx/
├── access.log
└── error.log

/var/cache/nginx/           # default cache directory
/var/www/html/              # default document root
```

Debian-এর `sites-available` + `sites-enabled` (symlink) কনভেনশন virtual host enable/disable করার একটা পরিপাটি উপায়:

```bash
# Disable a site without deleting it:
sudo rm /etc/nginx/sites-enabled/example.com
sudo systemctl reload nginx
```

## config গ্রামার

nginx-এর config হলো _directive_ আর _block_-এর একটা tree। তিনটি নিয়ম:

1. **Directive `;` দিয়ে শেষ হয়।**
2. **Block `{` দিয়ে খোলে আর `}` দিয়ে বন্ধ হয়।**
3. **Directive কেবল সঠিক context-এর ভেতরে কাজ করে।** একটা `server` directive শুধু একটা `http` block-এর ভেতরে অর্থবহ। ভুল জায়গায় দিলে nginx আপনাকে বলে দেয়।

```nginx
# Top level — this is the "main" context
worker_processes auto;
error_log /var/log/nginx/error.log warn;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    sendfile on;
    keepalive_timeout 65;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

তিনটি context যা আপনি সাথে সাথেই দেখবেন:

- **main** — worker count, error log, PID file।
- **events** — connection-handling tuning।
- **http** — HTTP-সম্পর্কিত সবকিছু: server block, MIME type, sendfile, gzip, caching।

`http`-এর ভেতরে:

- **server** — একটি virtual host। প্রতি domain-এ একটা, বা প্রতি port-এ একটা, বা দুটোই।
- **upstream** — backend server-এর একটি নামযুক্ত pool (proxying-এর জন্য)।
- **map** — variable transformation।

`server`-এর ভেতরে:

- **location** — এই host-এর ভেতরে routing-এর জন্য একটি path-prefix বা regex match।

## আপনার প্রথম server block

`example.com`-এ একটি static site:

```nginx
# /etc/nginx/sites-available/example.com
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    root /var/www/example.com;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

এটা enable করুন:

```bash
sudo ln -s /etc/nginx/sites-available/example.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t` config প্রয়োগ না করেই সেটা টেস্ট করে — reload করার আগে সবসময় এটা চালান। একটা খারাপ config আপনার সব site নামিয়ে দিতে পারে।

## server block পড়া, লাইন ধরে ধরে

```nginx
listen 80;
listen [::]:80;
```

IPv4 আর IPv6-এর ওপর TCP port 80-এ listen করুন। `[::]` হলো IPv6-এর `0.0.0.0`। explicit IPv6 ছাড়া আপনি শুধু IPv4-এ listen করবেন।

```nginx
server_name example.com www.example.com;
```

`Host` header-এ এই ঠিক hostname-গুলো match করুন। nginx-এর virtual hosting পুরোপুরি `Host`-এর ওপর কাজ করে। `other.com`-এ একটা request এই block দিয়ে serve হবে না; এটা _default_ server-এ fall back করে (অথবা কোনোটা match না করলে 404 ফেরত দেয়)।

```nginx
root /var/www/example.com;
index index.html;
```

`root` হলো document root। `/about/team.html`-এর জন্য একটা request `/var/www/example.com/about/team.html` খোঁজে। `index index.html` বলে যে request যখন `/some/dir/`, তখন এর ভেতরে `index.html` চেষ্টা করো।

```nginx
location / {
    try_files $uri $uri/ =404;
}
```

যেকোনো path-এর জন্য, `$uri`-তে file চেষ্টা করো, তারপর `$uri/`-তে directory, নয়তো 404। এটা স্ট্যান্ডার্ড SPA-fallback-free প্যাটার্ন; একটা single-page app-এর জন্য আপনি `try_files $uri /index.html;` লিখতেন যাতে SPA shell-এ fall back করে।

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

`~*` হলো একটা case-insensitive regex match। এই extension-গুলো যার আছে সে 30-দিনের cache lifetime পায়।

## location matching — নিয়মগুলো ক্রম অনুযায়ী

`location` block প্রতিটি request-এর জন্য প্রতিযোগিতা করে। nginx একটা এবং কেবল একটা বেছে নেয় serve করতে। নিয়মগুলো:

1. **Exact match (`=`)** — match করলে সাথে সাথে জিতে যায়।

   ```nginx
   location = / { ... }       # only the literal `/`
   location = /favicon.ico { ... }
   ```

2. **Prefix match (কোনো modifier নেই)** — সবচেয়ে দীর্ঘ prefix match জেতে।

   ```nginx
   location /api/ { ... }     # everything starting with /api/
   location / { ... }         # catch-all
   ```

3. **Preferential prefix (`^~`)** — prefix-এর মতোই, কিন্তু regex-এর ওপর জেতে।

   ```nginx
   location ^~ /static/ { ... }  # do not even try regexes
   ```

4. **Regex match (`~` case-sensitive, `~*` case-insensitive)** — প্রথম match জেতে।
   ```nginx
   location ~ \.php$ { ... }
   location ~* \.(jpg|png)$ { ... }
   ```

আসল matching অ্যালগরিদম:

1. সবচেয়ে দীর্ঘ `=` match খোঁজো। পেলে, সেটা ব্যবহার করো। শেষ।
2. সবচেয়ে দীর্ঘ prefix match খোঁজো (`^~` সহ)। সেটা মনে রাখো।
3. সবচেয়ে দীর্ঘ prefix যদি `^~` হয়, সেটা ব্যবহার করো। শেষ।
4. নয়তো, regex block-গুলো ক্রম অনুযায়ী হাঁটো। প্রথম match জেতে।
5. কোনো regex match না করলে, step 2-এর prefix ব্যবহার করো।

এটা nginx-এর গুটিকয়েক খুঁতের একটা — একবার অ্যালগরিদমটা জানলে এটা predictable; সেটা ছাড়া, "কেন _এই_ block-টা match করছে?" রহস্যময় থেকে যায়।

## Variables — ভাষার নিচের ভাষা

nginx-এর একটা ছোট built-in DSL আছে variable সহ। সাধারণ কয়েকটা:

| Variable          | মানে                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `$uri`            | বর্তমান URI (`rewrite` ব্যবহার করলে rewrite করা)।                    |
| `$request_uri`    | client যেভাবে পাঠিয়েছিল সেই মূল URI।                                |
| `$args`           | query string।                                                        |
| `$host`           | Host header (lowercased)।                                            |
| `$server_name`    | match হওয়া server_name।                                             |
| `$remote_addr`    | client-এর IP (বা proxy-র, দেখুন `set_real_ip_from`)।                 |
| `$scheme`         | `http` বা `https`।                                                   |
| `$request_method` | `GET`, `POST`, ইত্যাদি।                                              |
| `$http_<header>`  | যেকোনো request header — `$http_user_agent`, `$http_x_forwarded_for`। |
| `$cookie_<name>`  | একটি নির্দিষ্ট cookie value।                                         |
| `$arg_<name>`     | একটি নির্দিষ্ট query-string argument।                                |

এগুলো directive-এ ব্যবহার করুন:

```nginx
add_header X-Request-ID $request_id;
log_format main '$remote_addr "$request" $status $bytes_sent';
return 301 https://$host$request_uri;
```

## Includes — config পড়ার যোগ্য রাখুন

পুনরাবৃত্ত প্যাটার্নগুলো `snippets/` বা `conf.d/`-তে রাখা উচিত। উদাহরণ: security header-এর জন্য একটা snippet:

```nginx
# /etc/nginx/snippets/security-headers.conf
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-XSS-Protection "0" always;
```

server block-এ:

```nginx
server {
    listen 80;
    server_name example.com;
    include snippets/security-headers.conf;
    # ...
}
```

এখন একই header আপনার serve করা প্রতিটি site থেকে যাবে, copy/paste ছাড়াই।

`add_header`-এ `always` মানে "এটা error response-এও (4xx, 5xx) অন্তর্ভুক্ত করো।" এটা ছাড়া, আপনার backend থেকে একটা 500 response header-টা এড়িয়ে যায় — অনাকাঙ্ক্ষিত।

## default server — যা unmatched request ধরে

যদি কোনো request-এর `Host` কোনো `server_name`-এর সাথে match না করে, nginx **default** server ব্যবহার করে। ডিফল্টভাবে, সেটা হলো _প্রথম_ সংজ্ঞায়িত server block। এটা স্পষ্ট করতে:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;            # close connection without a response
}
```

এটা scanner traffic ধরে যা সরাসরি আপনার IP-তে হিট করে (কোনো real domain ছাড়া) আর চুপচাপ সেটা drop করে দেয়। ওদের আপনার default site serve করার চেয়ে পরিচ্ছন্ন।

## Reload, test, আর roll back

ডেভেলপমেন্ট সাইকেল:

```bash
sudo nano /etc/nginx/sites-available/example.com
sudo nginx -t                              # verify config
sudo systemctl reload nginx                # apply without downtime
```

`reload` nginx-কে `SIGHUP` পাঠায় — master নতুন config দিয়ে নতুন worker fork করে আর পুরনোগুলোকে সুন্দরভাবে অবসরে পাঠায়। active connection পুরনো worker-এ শেষ হয়। Zero-downtime config পরিবর্তন।

reload ব্যর্থ হলে:

```text
nginx: [emerg] "server" directive is not allowed here in /etc/nginx/sites-available/example.com:5
nginx: configuration file /etc/nginx/nginx.conf test failed
```

reload বাতিল হলো; আগের config এখনো চলছে। file ঠিক করুন, আবার `nginx -t` চালান, reload আবার চেষ্টা করুন।

## যে log-গুলো দেখবেন

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u nginx -f
```

Access log প্রতিটি request রেকর্ড করে; error log রেকর্ড করে failure, timeout, malformed request, upstream error। কিছু ভুল হলে, `error.log` প্রায় সবসময়ই প্রথমে দেখার জায়গা।

## সাধারণ ভুল

- **reload-এর আগে `nginx -t` ভুলে যাওয়া।** এক সময় আপনি একটা typo ship করবেন আর reload ব্যর্থ হবে। `nginx -t`-কে মাসল মেমরি বানান।
- **`sites-enabled`-এ এডিট করা।** সেই directory-তে শুধু symlink থাকা উচিত। `sites-available`-এ এডিট করুন, symlink সেটা তুলে নেবে।
- **একই `listen`-এ একাধিক `default_server` ঘোষণা।** nginx চালু হতে অস্বীকার করে।
- **`add_header`-এ `always` ভুলে যাওয়া।** error page-এ header উধাও হয়ে যায়।
- **`worker_connections` খুব বেশি সেট করা।** `worker_processes` দিয়ে গুণ করলে এটা মোট simultaneous connection-এর সীমা বেঁধে দেয়; কিন্তু প্রতিটি connection একটা file descriptor খায়, তাই মিলিয়ে `worker_rlimit_nofile` বাড়ান।

## একটি পরিপাটি production লেআউট

```text
/etc/nginx/
├── nginx.conf
├── conf.d/
│   ├── gzip.conf
│   ├── log_format.conf
│   └── proxy_defaults.conf
├── snippets/
│   ├── security-headers.conf
│   ├── ssl-modern.conf
│   └── letsencrypt.conf
├── sites-available/
│   ├── example.com
│   ├── api.example.com
│   └── _default
└── sites-enabled/
    ├── example.com -> ../sites-available/example.com
    ├── api.example.com -> ../sites-available/api.example.com
    └── _default -> ../sites-available/_default
```

প্রতি site-এ একটা file। শেয়ার্ড config `conf.d/`-তে (স্বয়ংক্রিয়ভাবে লোড হয়) আর `snippets/`-এ (হাতে include করা)। একটা `_default` server যা scanner traffic ধরে। এটা পড়ার জন্য বিরূপ না হয়েই কয়েক ডজন site পর্যন্ত স্কেল করে।

## রিক্যাপ

- nginx config হলো directive আর block-এর একটা tree, context (main, events, http, server, location) দিয়ে সংগঠিত।
- একটা `server` block হলো একটা virtual host যা `server_name` দিয়ে match হয়। একটা `location` block একটা host-এর ভেতরে route করে।
- `location` matching-এর একটা সংজ্ঞায়িত ক্রম আছে — exact, prefix, `^~`, regex, সবচেয়ে দীর্ঘ prefix fallback।
- Variable (`$uri`, `$host`, ইত্যাদি) আর `add_header always` প্রতিদিনের বেশিরভাগ কাজ কভার করে।
- Zero-downtime config পরিবর্তনের জন্য `nginx -t` তারপর `systemctl reload nginx`।
- config পড়ার যোগ্য রাখতে `sites-available`/`sites-enabled` আর `snippets/` ব্যবহার করুন।

পরের অধ্যায়: একটি application server-এর সামনে nginx বসানো — সেই reverse proxy প্যাটার্ন যা সবকিছুকে একসাথে বাঁধে।
