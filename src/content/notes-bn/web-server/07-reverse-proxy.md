---
title: 'Reverse Proxy'
subtitle: 'আপনার application server-এর সামনে nginx। যে header-গুলো গুরুত্বপূর্ণ, যে timeout আপনাকে বাঁচায়, আর যে upstream pool failure সামলায়।'
chapter: 7
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['reverse proxy', 'nginx', 'proxy_pass', 'upstream', 'headers']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## reverse proxy কী

একটি reverse proxy হলো এমন একটি server যা একটি client-এর request গ্রহণ করে, সেটাকে একাধিক backend server-এর একটিতে forward করে, এবং backend-এর response client-কে ফেরত দেয়। client কখনো জানে না যে backend-এর অস্তিত্ব আছে — তার দৃষ্টিকোণ থেকে, nginx-ই _হলো_ server।

```text
   client  ──► nginx (:443) ──► your-app (:8080)
                  ▲
                  │
              TLS, caching, compression,
              rate limiting, routing, logging
```

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটি reverse proxy অনেকটা একজন রিসেপশনিস্টের মতো যে সমস্ত incoming call নেয় আর সেগুলোকে সঠিক ডিপার্টমেন্টে পাঠায় — কলকারীরা কখনো সরাসরি ইঞ্জিনিয়ারদের ডায়াল করে না।

</Callout>

আপনি প্রায় সবসময়ই একটা চান। কারণগুলো:

- **TLS termination** — nginx HTTPS সামলায়; আপনার app সাধারণ HTTP বলে। আপনার app-এর certificate সম্পর্কে জানার দরকার নেই।
- **HTTP/2 আর HTTP/3** — nginx client-এর কাছে আধুনিক protocol উন্মুক্ত করে আর backend-এর জন্য HTTP/1.1-এ নামিয়ে দেয়।
- **Static asset offload** — nginx backend-কে বিরক্ত না করেই সরাসরি image, JS, CSS serve করে।
- **Caching** — nginx backend response cache করতে পারে (chapter 9) আর RAM থেকে serve করতে পারে।
- **Rate limiting আর connection limit** — backend-কে অপব্যবহার থেকে রক্ষা করা।
- **একাধিক backend** — একাধিক app server-এর মধ্যে load-balance করা, একটা fail করলে rotation থেকে সরিয়ে নেওয়া।
- **অনেক service-এর জন্য একটি hostname** — `/api/*` এক backend-এ, `/admin/*` আরেকটায়, static file nginx নিজেই serve করে।

এই অধ্যায় সবচেয়ে সরল কেসটা কভার করে: একই মেশিনে একটা Go (বা Node, বা যা-ই হোক) backend-এর সামনে একটা nginx।

## সবচেয়ে সরল reverse proxy

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
    }
}
```

এটাই পুরো proxy। nginx-এ আসা প্রতিটি request `http://127.0.0.1:8080`-এ forward হয়। backend-এর response client-এর কাছে ফিরে যায়।

টেস্ট:

```bash
# Start your app on :8080
go run main.go &

# Hit nginx
curl -i http://example.com/
# Should see your app's response
```

এটা কাজ করে, কিন্তু এতে চারটি গুরুত্বপূর্ণ header আর timeout নেই। আসল config আরও প্রায় দশ লাইন যোগ করে।

## আপনার backend-এর আসলে যে header দরকার

nginx যখন একটা request forward করে, backend nginx-কে client হিসেবে দেখে — source address হিসেবে `127.0.0.1`, ইউজার কোন hostname টাইপ করেছিল তার ধারণা নেই, মূলটা HTTP নাকি HTTPS ছিল তারও ধারণা নেই। সেই তথ্য সংরক্ষণ করতে, header-গুলো স্পষ্টভাবে সেট করুন:

```nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host  $host;
proxy_set_header X-Forwarded-Port  $server_port;
```

প্রতিটা যা করে:

- **Host** — মূল `Host` header, যাতে backend জানে ইউজার কোন domain request করেছিল। multi-tenant app-এর জন্য অত্যন্ত গুরুত্বপূর্ণ।
- **X-Real-IP** — client-এর আসল IP, যাতে backend সেটা log করতে, তার ওপর rate-limit করতে, geolocate করতে পারে।
- **X-Forwarded-For** — request যত proxy পার হয়েছে তার একটা chain। আগে যা ছিল তার সাথে nginx যোগ করে।
- **X-Forwarded-Proto** — `http` বা `https`। nginx থেকে connection HTTP হলেও backend-কে মূল scheme জানায়।
- **X-Forwarded-Host / Port** — মূল hostname আর port যদি `Host` থেকে ভিন্ন হয় (বিরল)।

বেশিরভাগ app framework-এর একটা "trust the proxy" mode আছে যা এই header পড়ে — Express-এ `app.set('trust proxy', 1)`, Flask-এ `ProxyFix`, Go-তে `httputil.ReverseProxy`।

<Callout type="warn">

**এই header-গুলো কেবল আপনার নিজের proxy থেকে বিশ্বাস করুন।**

সরাসরি ইন্টারনেট থেকে আসা একটা request যদি জাল করা `X-Real-IP: 1.2.3.4` নিয়ে আসে, তাহলে attacker সেই address হওয়ার ভান করতে পারবে। হয় নিশ্চিত করুন যে backend সরাসরি পৌঁছানো যায় না (firewall দিন; localhost-এ bind করুন), নয়তো backend-কে কনফিগার করুন যাতে সে কেবল পরিচিত proxy IP থেকে আসা forwarded header বিশ্বাস করে।

</Callout>

## একটি সম্পূর্ণ proxy server block

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    keepalive 64;
}

server {
    listen 80;
    server_name example.com;

    # Static assets — serve directly, do not bother the backend
    location /assets/ {
        root /var/www/example.com;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://app_backend;

        # Preserve client info
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Use HTTP/1.1 to enable keepalive to the backend
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;

        # Buffering
        proxy_buffering on;
        proxy_buffer_size 16k;
        proxy_buffers 8 16k;
        proxy_busy_buffers_size 32k;
    }
}
```

একটা production-ready single-backend proxy-র জন্য যা যা দরকার সবই এটুকু।

## upstream — backend-এর pool

```nginx
upstream app_backend {
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;
    server 127.0.0.1:8082;

    keepalive 64;
}
```

একই box-এ তিনটি worker, সবগুলোই আপনার app চালাচ্ছে। nginx এগুলোর মধ্যে round-robin করে। `keepalive 64` backend-এর সাথে 64টি পর্যন্ত idle connection পুনরায় ব্যবহারের জন্য প্রস্তুত রাখে, প্রতি request-এ নতুন TCP connection-এর খরচ এড়িয়ে।

অন্যান্য distribution method:

```nginx
upstream app_backend {
    least_conn;        # send to the worker with fewest active connections
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;
}

upstream app_backend {
    ip_hash;           # hash client IP — same client → same worker
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;
}
```

variable-duration request-এর জন্য `least_conn` সাধারণত সঠিক। `ip_hash` sticky session-এর জন্য (বিরল আর সাধারণত একটা smell — বরং আপনার app-কে stateless বানান)।

## Health check আর failover

```nginx
upstream app_backend {
    server 127.0.0.1:8080 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8081 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8082 backup;
}
```

- **`max_fails=3`** — একটা backend-এ পরপর 3টা request fail করলে, সেটাকে down হিসেবে চিহ্নিত করো।
- **`fail_timeout=30s`** — 30 সেকেন্ড down রাখো, তারপর আবার চেষ্টা করো।
- **`backup`** — কেবল তখনই ব্যবহৃত হয় যখন সব primary down।

লক্ষ করুন: open-source nginx _passive_ health check ব্যবহার করে — এটা একটা backend down কিনা জানে কেবল সেটা ব্যবহার করার চেষ্টা করে ব্যর্থ হয়ে। Active health check (পর্যায়ক্রমে `/health` প্রোব করা) nginx Plus-এর একটা feature, নয়তো আপনি একটা আলাদা process দিয়ে সেটা জুড়ে দেন। বেশিরভাগ টিম passive check মেনে নেয়।

## Timeouts — slow আর dead-এর মধ্যে পার্থক্য

Timeout একটা proxy config-এর সবচেয়ে কম-ব্যবহৃত টুল। ডিফল্ট value খুব উদার। সেগুলোকে আপনার application-এর আসল SLO-র সাথে মেলান।

```nginx
proxy_connect_timeout 5s;    # max time to establish TCP connection to backend
proxy_send_timeout    60s;   # max time between bytes sent to backend
proxy_read_timeout    60s;   # max time between bytes received from backend
```

সাধারণ API-এর জন্য:

- `proxy_connect_timeout` — 1–5 সেকেন্ড। 5s-এ backend-এ পৌঁছাতে না পারলে, সেটা down।
- `proxy_read_timeout` — আপনার প্রত্যাশিত সবচেয়ে ধীর response-এর সাথে মেলান। API: 30–60s। দীর্ঘ upload: আরও বেশি।

একটা timeout শেষ হলে, nginx client-কে `504 Gateway Timeout` ফেরত দেয়। backend-এর request, এখনো চলমান থাকলে, চলতেই থাকে — backend জানে না nginx হাল ছেড়ে দিয়েছে। যে দীর্ঘ backend কাজ client-এর চেয়ে বেশি বাঁচা দরকার, সেটা in-band না সামলে একটা job হিসেবে trigger করা উচিত।

Send-timeout বড় upload-এর জন্য গুরুত্বপূর্ণ। একটা client যদি ধীরে upload করে, `proxy_send_timeout` নিয়ন্ত্রণ করে nginx _client_-এর কাছ থেকে পরের byte-এর জন্য কতক্ষণ অপেক্ষা করবে। খুব ছোট হলে ধীর upload fail করে; খুব বড় হলে Slowloris attack worker আটকে রাখে।

## Buffering — nginx response নিয়ে যা করে

```nginx
proxy_buffering on;
proxy_buffer_size 16k;
proxy_buffers 8 16k;
```

ডিফল্টভাবে, nginx backend-এর পুরো response memory-তে (বা বড় হলে disk-এ) buffer করে, তারপর client-এর গতিতে client-কে পাঠায়। এটা backend-কে ধীর client থেকে রক্ষা করে — একটা 3G মোবাইল reader-এর জন্য আপনার Go server-এ কোনো goroutine অপেক্ষা করে না।

streaming endpoint-এর জন্য buffering বন্ধ করুন:

```nginx
location /events {
    proxy_pass http://app_backend;
    proxy_buffering off;            # forward bytes immediately
    proxy_cache off;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_read_timeout 24h;         # SSE may stay open for a long time
}
```

Server-Sent Events, WebSocket, বা gRPC streaming-এর জন্য buffering streaming আচরণ নষ্ট করে দেয় — সেটা বন্ধ করুন।

## WebSocket proxying

```nginx
location /ws {
    proxy_pass http://app_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;          # long-lived connection
    proxy_buffering off;
}
```

`Upgrade: websocket` আর `Connection: upgrade` header অত্যাবশ্যক — এগুলো ছাড়া, nginx response-কে সাধারণ HTTP হিসেবে সামলানোর চেষ্টা করে। 24-ঘণ্টার read timeout idle WebSocket connection-কে drop না করেই সামলায়।

## Path rewriting

দুটি সাধারণ প্যাটার্ন:

**forward করার আগে একটা prefix সরিয়ে ফেলা:**

```nginx
location /api/ {
    proxy_pass http://app_backend/;   # note the trailing slash
}
```

`/api/users`-এ একটা request `/users`-এ forward হয়। `proxy_pass`-এর trailing slash বলে "match হওয়া location prefix-কে এতে rewrite করো।" trailing slash ছাড়া, পুরো মূল path রাখা হয়।

**path রাখো, কিন্তু একটা sub-path-এ proxy করো:**

```nginx
location /api/ {
    proxy_pass http://app_backend;    # no trailing slash
}
```

Request `/api/users` হয়ে যায় `http://notes/api/users`। backend পুরো path দেখে।

এটা nginx-এর সবচেয়ে সাধারণ footgun। `proxy_pass`-এ trailing-slash নিয়ম আচরণ বদলে দেয়। সন্দেহ হলে, একটা ছোট test লিখুন।

## upstream-সম্পর্কিত variable সেট করা

প্রায়ই কাজে লাগে এমন একটা প্যাটার্ন: backend-কে বলুন সে কোন request ID সামলাচ্ছে, যাতে nginx আর app-এর log একে অপরের সাথে মেলানো যায়।

```nginx
http {
    map $http_x_request_id $req_id {
        default $request_id;          # nginx-generated UUID
        ~.      $http_x_request_id;   # use the one from the client if present
    }

    log_format main '$remote_addr "$request" $status [$req_id] $upstream_response_time';

    server {
        # ...
        location / {
            proxy_pass http://app_backend;
            proxy_set_header X-Request-ID $req_id;
            add_header X-Request-ID $req_id always;
        }
    }
}
```

এখন প্রতিটি log line-এ, nginx access log আর আপনার app-এর log দুটোতেই, একটা শেয়ার্ড `$req_id` আছে যার ওপর আপনি grep করতে পারেন।

## পুরো জিনিসটা টেস্ট করা

```bash
# 1. Start backend
go run main.go &

# 2. Reload nginx
sudo nginx -t && sudo systemctl reload nginx

# 3. Hit it
curl -i -H 'Host: example.com' http://localhost/

# 4. Watch both logs
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log

# 5. Kill the backend, re-curl
kill %1
curl -i -H 'Host: example.com' http://localhost/
# Should get 502 Bad Gateway from nginx
```

backend down থাকলে যদি আপনি পরিষ্কারভাবে 502 পান, তাহলে আপনার timeout আর upstream ঠিক আছে।

## সাধারণ ভুল

- **`proxy_set_header Host $host` বাদ পড়া।** Backend ভুল virtual host serve করে (বা default)।
- **দীর্ঘ চলা API-তে ডিফল্ট 60s-এর `proxy_read_timeout`।** "পেজটা শুধু ঝুলে থাকে তারপর error দেয়" — এমন রিপোর্ট এখানেই এসে ঠেকে।
- **streaming endpoint-এ buffering চালু।** SSE client response শেষ না হওয়া পর্যন্ত কোনো event দেখে না।
- **`proxy_pass`-এ trailing-slash-এর গোলমাল।** অদ্ভুত path নিয়ে backend থেকে 404 হিসেবে প্রকাশ পায়।
- **backend সরাসরি ইন্টারনেট থেকে পৌঁছানো যায়।** সবসময় firewall দিন (বা `127.0.0.1`-এ bind করুন) যাতে header জাল করা না যায়।

## রিক্যাপ

- একটি reverse proxy আপনার application server-এর সামনে TLS, HTTP/2, caching, আর routing নিয়ে বসে।
- সবসময় `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` সেট করুন। backend লক করুন যাতে এগুলো বিশ্বাস করা যায়।
- একটা backend-এর জন্যও `upstream` block ব্যবহার করুন — বিনামূল্যে keepalive আর health check দেয়।
- explicit timeout সেট করুন (`connect`, `read`, `send`)। ডিফল্ট খুব উদার।
- streaming আর WebSocket endpoint-এর জন্য buffering বন্ধ করুন। WebSocket-এর জন্য `Upgrade` আর `Connection` header যোগ করুন।
- `proxy_pass`-এ trailing slash আচরণ বদলায় — deploy করার আগে test করুন।

পরের অধ্যায়: nginx আর আপনার app দুটোই যে log তৈরি করে তার অর্থ বোঝা — format, field, আর যে query আপনি হাজার বার চালাবেন।
