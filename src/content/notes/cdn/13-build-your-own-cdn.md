---
title: 'নিজের CDN বানানো'
subtitle: 'কয়েকটা VPS, nginx proxy_cache, GeoDNS আর একটা পার্জ স্ক্রিপ্ট দিয়ে নিজের ছোট CDN — কখন এটা বুদ্ধিমানের কাজ, কখন নয়, আর প্রতিটা অংশ কীভাবে জোড়া লাগে।'
chapter: 13
level: 'advanced'
readingTime: '২৪ মিনিট'
topics: ['self-hosted cdn', 'nginx', 'proxy_cache', 'varnish', 'geodns', 'anycast', 'purge']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

ফারাবির পরিবারের একটা বইয়ের প্রকাশনী আছে ঢাকার বাংলাবাজারে। ছাপাখানা আর মূল গুদাম সেখানেই। কয়েক বছর আগে পর্যন্ত চট্টগ্রাম, রাজশাহী বা সিলেটের কোনো পাঠক বই চাইলে অর্ডারটা ঢাকায় আসত, ঢাকা থেকে কুরিয়ারে বই যেত, আর পাঠক তিন-চার দিন বসে থাকত। জনপ্রিয় বইয়ের জন্য প্রতিদিন একই রাস্তায় একই বই শত শত বার যেত।

ফারাবির মেয়ে মরিয়ম একদিন ঠিক করল, তিন শহরে তিনটা ছোট বুকস্টল খোলা হবে, পরিবারের লোকেরাই চালাবে। প্রতিটা স্টলে একটা তাক, যেখানে শুধু সেই এলাকায় যে বইগুলো বেশি চলে সেগুলো রাখা হয়। রাজশাহীর পাঠক স্টলে এসে বই চাইলে, তাকে থাকলে তখনই হাতে পায়। না থাকলে স্টলের রুশদ ঢাকায় ফোন করে, এক কপি আনায়, পাঠককে দেয়, আর আরও দুই কপি তাকে রেখে দেয়। প্রতিটা স্টল নিজের তাকের ছোট একটা খাতা রাখে: কোন বই কবে এসেছে, আর কতদিন পর্যন্ত এই সংস্করণ ঠিক আছে।

ঝামেলা শুরু হলো যখন একটা বইয়ের নতুন সংস্করণ বের হলো, পুরনোটায় একটা ভুল ছিল। মরিয়ম তিন স্টলে আলাদা আলাদা ফোন করে বলল, "পুরনো কপি তাক থেকে সরাও।" সিলেটের স্টল ফোন ধরেনি, তাই সেখানে আরও দুই দিন পুরনো ভুল বই বিক্রি হলো। এরপর মরিয়ম নিয়ম করল: একটা গ্রুপ মেসেজ যায় সব স্টলে একসাথে, আর প্রতিটা স্টল "সরিয়েছি" জবাব না দেওয়া পর্যন্ত কাজটা শেষ ধরা হয় না। আরেকটা নিয়মও হলো: বই কোন স্টল থেকে নেবেন, পাঠক নিজে ঠিক করেন না। প্রকাশনীর হেল্পলাইনে ফোন করলে অপারেটর পাঠকের এলাকা শুনে কাছের স্টলের ঠিকানা দেয়। আর কোনো স্টল কোনোদিন বন্ধ থাকলে অপারেটর সেই ঠিকানা আর দেয় না, পরের কাছের স্টলে পাঠায়।

মিলিয়ে নিই: বাংলাবাজারের ছাপাখানা আর গুদাম হলো **origin**, তিন শহরের স্টল হলো **edge সার্ভার** (একেকটা VPS), স্টলের তাক হলো **proxy_cache**, আর তাকে না পেলে ঢাকায় ফোন করে আনানো হলো **cache MISS ও origin fetch**। "কতদিন পর্যন্ত এই সংস্করণ ঠিক" হলো **TTL**, আর তাকের খাতা হলো **cache key আর metadata**। সব স্টলে একসাথে গ্রুপ মেসেজ আর "সরিয়েছি" জবাবের অপেক্ষা হলো **purge fan-out**। হেল্পলাইনের অপারেটর যে এলাকা শুনে কাছের স্টল বলে দেয়, সেটা **GeoDNS**, আর বন্ধ স্টলের ঠিকানা না দেওয়া হলো **health check দিয়ে DNS থেকে মরা edge সরানো**। বাস্তবে ছোট SaaS, মিডিয়া সাইট বা ডকুমেন্টেশন প্ল্যাটফর্ম ঠিক এভাবে কয়েকটা সস্তা VPS দিয়ে নিজেদের CDN চালায়।

## আগে প্রশ্ন: আসলেই কি নিজের CDN দরকার?

নিজের CDN বানানো শেখার জন্য দারুণ, কিন্তু প্রোডাকশনে এটা একটা দায়িত্ব। একটা কমার্শিয়াল CDN-এর কাছে আছে শত শত PoP, terabit-স্কেল DDoS শোষণ করার ক্ষমতা, আর এমন ইঞ্জিনিয়ার যারা রাত তিনটায় জেগে থাকে। আপনার কাছে থাকবে তিন-চারটা VPS আর আপনি নিজে।

| পরিস্থিতি                                                      | নিজের CDN       | কমার্শিয়াল CDN |
| -------------------------------------------------------------- | --------------- | ---------------- |
| ইউজার কয়েকটা নির্দিষ্ট অঞ্চলে, আর সেগুলো আপনি জানেন           | ভালো ফিট        | এটাও চলে         |
| ভারী egress (ভিডিও, ডাউনলোড), আর VPS-এ ব্যান্ডউইথ সস্তা         | খরচে সুবিধা     | খরচ বেশি হতে পারে |
| কাস্টম লজিক দরকার, ভেন্ডর লক-ইন চান না                        | পূর্ণ নিয়ন্ত্রণ | সীমিত            |
| গ্লোবাল ইউজার, সবখানে কম লেটেন্সি চাই                          | কঠিন            | ভালো ফিট         |
| বড় DDoS-এর ঝুঁকি আছে                                          | একা সামলানো যায় না | ভালো ফিট     |
| টিমে কেউ নেই যে edge অপারেট করবে                              | করবেন না        | ভালো ফিট         |

<Callout type="warning">

**DDoS-ই নিজের CDN-এর সবচেয়ে বড় দুর্বলতা।** একটা VPS-এর নেটওয়ার্ক পোর্ট যতটুকু, আক্রমণ তার বেশি হলেই সেই edge বসে যায়, আর আপনার প্রোভাইডার হয়তো পুরো IP-টাকেই কিছুক্ষণের জন্য null-route করে দেবে। আক্রমণের ঝুঁকি থাকলে হাইব্রিড ভাবুন: স্ট্যাটিক আর ভারী কন্টেন্ট নিজের edge-এ, কিন্তু সামনে একটা DDoS-সুরক্ষিত লেয়ার।

</Callout>

এই চ্যাপ্টারে আমরা একটা পূর্ণ, কাজ করা সেটআপ বানাব। OpenResty আর Lua দিয়ে এজে প্রোগ্রামিং, বা একটা কমার্শিয়াল CDN-এর সাথে জুড়ে দেওয়ার বিস্তারিত কাজ আছে আলাদা লেখায়: [CDN with OpenResty & Gcore](/blog/cdn-openresty-gcore)। এখানে ফোকাস হলো সাধারণ nginx দিয়ে মূল কাঠামো।

## আর্কিটেকচার

```text
                         ┌──────────────────────┐
   users ── GeoDNS ──┬──▶│ edge-sin  (Singapore) │──┐
                     ├──▶│ edge-fra  (Frankfurt) │──┤
                     ├──▶│ edge-nyc  (New York)  │──┼──▶ shield (one VPS near origin) ──▶ origin
                     └──▶│ edge-dac  (Dhaka)     │──┘
                         └──────────────────────┘
```

চারটা অংশ:

- **Origin** — আপনার আসল অ্যাপ বা অবজেক্ট স্টোরেজ। এটা কখনো সরাসরি ইন্টারনেটে খোলা থাকবে না; শুধু shield-এর IP থেকে রিকোয়েস্ট নেবে।
- **Shield** — origin-এর কাছাকাছি একটা ক্যাশ লেয়ার। চারটা edge-এ একই ফাইলের MISS হলে origin-এ চারটা রিকোয়েস্ট যেত; shield থাকলে যায় একটা। চ্যাপ্টার ৭-এ এটা বিস্তারিত দেখেছি।
- **Edge** — ইউজারের কাছাকাছি VPS, প্রতিটায় nginx আর একটা লোকাল ডিস্ক ক্যাশ।
- **Steering** — কোন ইউজার কোন edge-এ যাবে, সেটা ঠিক করার ব্যবস্থা: GeoDNS অথবা anycast।

<Mermaid
title="Request path through a self-hosted CDN"
code={`sequenceDiagram
  participant U as "User in Dhaka"
  participant D as "GeoDNS"
  participant E as "edge-dac"
  participant S as "shield"
  participant O as "origin"
  U->>D: "A? static.baytalhikma.org"
  D-->>U: "203.0.113.40 (edge-dac)"
  U->>E: "GET /css/app.3f9a.css"
  E->>E: "cache lookup: MISS"
  E->>S: "GET /css/app.3f9a.css"
  S->>S: "cache lookup: MISS"
  S->>O: "GET /css/app.3f9a.css"
  O-->>S: "200, Cache-Control: max-age=31536000, immutable"
  S-->>E: "200 (stored at shield)"
  E-->>U: "200, X-Cache-Status: MISS (stored at edge)"
  U->>E: "next user: same file"
  E-->>U: "200, X-Cache-Status: HIT"`}
/>

## Edge-এর nginx কনফিগ, লাইন ধরে ধরে

নিচের কনফিগ একটা edge-এর জন্য পুরোটা। প্রতিটা directive নিচে ব্যাখ্যা করা আছে। nginx-এর ডকুমেন্টেশনের সাথে মিলিয়ে লেখা (২০২৬ সালের অক্টোবর অনুযায়ী); নিজের ভার্সনে `nginx -V` আর ডকস দেখে নিন।

```nginx
# /etc/nginx/conf.d/edge.conf

proxy_cache_path /var/cache/nginx/edge
    levels=1:2
    keys_zone=edge:100m
    max_size=40g
    inactive=7d
    use_temp_path=off;

upstream shield {
    server shield.internal.baytalhikma.org:443;
    keepalive 32;
}

log_format edge '$remote_addr [$time_local] "$request" $status $body_bytes_sent '
                'cache=$upstream_cache_status rt=$request_time '
                'urt=$upstream_response_time host=$host';

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name static.baytalhikma.org;

    ssl_certificate     /etc/letsencrypt/live/baytalhikma.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/baytalhikma.org/privkey.pem;

    access_log /var/log/nginx/edge.log edge;

    location / {
        proxy_pass https://shield;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host static.baytalhikma.org;
        proxy_ssl_server_name on;
        proxy_ssl_name shield.internal.baytalhikma.org;

        proxy_cache edge;
        proxy_cache_key $scheme$host$request_uri;
        proxy_cache_valid 200 301 10m;
        proxy_cache_valid 404 1m;

        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_background_update on;
        proxy_cache_lock on;
        proxy_cache_lock_timeout 5s;
        proxy_cache_revalidate on;

        proxy_ignore_headers Set-Cookie;
        proxy_hide_header Set-Cookie;

        add_header X-Cache-Status $upstream_cache_status always;
        add_header X-Edge edge-dac always;
    }

    location = /healthz {
        access_log off;
        return 200 "ok\n";
    }
}
```

### `proxy_cache_path` — ক্যাশ কোথায় আর কতটা

- **`levels=1:2`** — ক্যাশ ফাইলগুলো সাব-ডিরেক্টরিতে ছড়িয়ে রাখে (cache key-এর MD5 হ্যাশের শেষ অক্ষর দিয়ে)। এক ডিরেক্টরিতে লাখ লাখ ফাইল থাকলে ফাইল সিস্টেম ধীর হয়ে যায়।
- **`keys_zone=edge:100m`** — শেয়ার্ড মেমরিতে key আর metadata রাখার জায়গা। nginx-এর ডকস অনুযায়ী ১ MB-তে মোটামুটি ৮,০০০ key ধরে, তাই 100m মানে আনুমানিক ৮ লাখ অবজেক্ট। জায়গা শেষ হলে নতুন অবজেক্ট ঢোকাতে nginx পুরনো key সরায়, ডিস্কে জায়গা থাকলেও।
- **`max_size=40g`** — ডিস্ক ক্যাশের সর্বোচ্চ আকার। পেরোলে cache manager সবচেয়ে কম ব্যবহৃত (LRU) ফাইল মুছে দেয়। ডিস্কের পুরোটা দেবেন না; লগ আর OS-এর জন্য জায়গা রাখুন।
- **`inactive=7d`** — এতদিন কেউ না চাইলে অবজেক্ট মুছে যায়, fresh হোক বা না হোক। ডিফল্ট ১০ মিনিট, যেটা একটা CDN-এর জন্য খুবই কম: রাতে কম চলা একটা ফাইল সকালে আবার origin থেকে আনতে হবে।
- **`use_temp_path=off`** — origin থেকে আসা ফাইল সরাসরি ক্যাশ ডিরেক্টরিতে লেখে, আলাদা temp ডিরেক্টরি থেকে কপি করে না। দুটো আলাদা ডিস্কে থাকলে এটা অপ্রয়োজনীয় I/O বাঁচায়।

### `proxy_cache_key` — কোন রিকোয়েস্টকে "একই" ধরা হবে

ডিফল্ট হলো `$scheme$proxy_host$request_uri`। এখানে `$proxy_host` মানে upstream-এর নাম (`shield`), ইউজারের পাঠানো Host নয়। এক edge যদি একাধিক ডোমেইন সার্ভ করে, ডিফল্ট key-তে দুই ডোমেইনের `/logo.png` একই ক্যাশ এন্ট্রিতে পড়ে যাবে। তাই `$host` বসানো হয়েছে। চ্যাপ্টার ৪-এ ক্যাশ কী নিয়ে যা দেখেছি, সেটাই এখানে হাতে-কলমে।

### `proxy_cache_valid` — origin কিছু না বললে কতক্ষণ

শুধু সময় দিলে (`proxy_cache_valid 10m;`) nginx শুধু 200, 301 আর 302 ক্যাশ করে। 404 আলাদা করে ছোট সময়ের জন্য দেওয়া হয়েছে, যাতে একটা ভুল URL-এর ঝড় origin-এ না যায়, আবার নতুন আপলোড করা ফাইলও এক মিনিটের মধ্যে দেখা যায়।

<Callout type="info">

**origin-এর হেডার জেতে।** origin যদি `Cache-Control: max-age=…`, `Expires` বা `X-Accel-Expires` পাঠায়, nginx সেটাই মানে, `proxy_cache_valid` তখন শুধু ফলব্যাক। আর nginx-এর ডকস অনুযায়ী রেসপন্সে `Set-Cookie` থাকলে, বা `Vary: *` থাকলে, সেটা ক্যাশই হয় না। এজন্যই কনফিগে `proxy_ignore_headers Set-Cookie` আর `proxy_hide_header Set-Cookie` আছে: স্ট্যাটিক ডোমেইনে কোনো ফ্রেমওয়ার্ক ভুল করে কুকি পাঠালে সেটা ইউজারের কাছে যাবে না, আর ক্যাশও ভাঙবে না। ডায়নামিক ডোমেইনে এই দুই লাইন **কখনো** বসাবেন না; এক ইউজারের সেশন কুকি আরেকজনের কাছে চলে যাবে।

</Callout>

### Stale, lock আর background update — origin-কে বাঁচানোর তিন অস্ত্র

- **`proxy_cache_use_stale error timeout updating http_5xx…`** — shield বা origin ডাউন হলে, বা 5xx দিলে, পুরনো (stale) কপি সার্ভ করো। `updating` মানে কেউ একজন অবজেক্টটা রিফ্রেশ করছে, এই ফাঁকে বাকিদের পুরনো কপি দাও। origin পুরো ডাউন থাকলেও ইউজার সাইট দেখতে পায়।
- **`proxy_cache_background_update on`** — অবজেক্ট এক্সপায়ার হলে প্রথম ইউজারকেও অপেক্ষা করায় না; তাকে stale কপি দিয়ে পেছনে একটা সাবরিকোয়েস্ট পাঠিয়ে রিফ্রেশ করে। এটা কাজ করার জন্য `use_stale`-এ `updating` থাকতেই হবে।
- **`proxy_cache_lock on`** — একটা নতুন অবজেক্টের জন্য একসাথে ১,০০০ রিকোয়েস্ট এলে origin-এ যায় একটা, বাকিরা অপেক্ষা করে। এটাই request collapsing (চ্যাপ্টার ৭)। `proxy_cache_lock_timeout` (ডিফল্ট ৫ সেকেন্ড) পেরোলে অপেক্ষারত রিকোয়েস্ট নিজেই origin-এ যায়, কিন্তু সেই রেসপন্স ক্যাশ হয় না।
- **`proxy_cache_revalidate on`** — এক্সপায়ার হওয়া অবজেক্টের জন্য পুরো ফাইল না এনে `If-None-Match` / `If-Modified-Since` দিয়ে জিজ্ঞেস করে; origin 304 দিলে শুধু মেয়াদ বাড়ায়। বড় ফাইলে ব্যান্ডউইথ বাঁচে।

### `$upstream_cache_status` — প্রতিটা রেসপন্সের ক্যাশ-রিপোর্ট

`add_header X-Cache-Status $upstream_cache_status always;` প্রতিটা রেসপন্সে বলে দেয় ক্যাশে কী ঘটেছে। সম্ভাব্য মান:

| মান           | অর্থ                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| `HIT`         | ক্যাশ থেকে, fresh                                                            |
| `MISS`        | ক্যাশে ছিল না, upstream থেকে আনা হয়েছে                                       |
| `EXPIRED`     | ছিল, মেয়াদ শেষ, upstream থেকে নতুন আনা হয়েছে                                 |
| `STALE`       | মেয়াদ শেষ, কিন্তু upstream সমস্যায় থাকায় পুরনোটাই দেওয়া হয়েছে              |
| `UPDATING`    | মেয়াদ শেষ, অন্য কেউ রিফ্রেশ করছে, তাই পুরনোটা দেওয়া হয়েছে                   |
| `REVALIDATED` | মেয়াদ শেষ, conditional রিকোয়েস্টে upstream 304 দিয়েছে                      |
| `BYPASS`      | `proxy_cache_bypass` শর্ত মেলায় ক্যাশ এড়ানো হয়েছে                          |

হেডার না দেখা গেলে (খালি) মানে ওই রিকোয়েস্টে ক্যাশই ব্যবহার হয়নি, যেমন `/healthz`। `always` না দিলে nginx শুধু 2xx/3xx রেসপন্সে হেডার যোগ করে, আর 502 ডিবাগ করার সময়েই হেডারটা থাকবে না।

### হাতে-কলমে যাচাই

```bash
curl -sI https://static.baytalhikma.org/css/app.3f9a.css | grep -iE 'x-cache|x-edge|age|cache-control'
curl -sI https://static.baytalhikma.org/css/app.3f9a.css | grep -iE 'x-cache|x-edge'
```

```text
# illustrative output
cache-control: public, max-age=31536000, immutable
x-cache-status: MISS
x-edge: edge-dac

x-cache-status: HIT
x-edge: edge-dac
```

প্রথমবার MISS, দ্বিতীয়বার HIT। দ্বিতীয়বারও MISS এলে origin-এর হেডার দেখুন (`Set-Cookie`, `Cache-Control: private` বা `no-store`, `Vary: *`)।

## Shield-এর কনফিগ

Shield আসলে আরেকটা edge, তিনটা পার্থক্য সহ: এর upstream হলো origin, এর ক্যাশ বড় (সব edge-এর মিলিত চাহিদা এখানে আসে), আর এটা শুধু edge-দের IP থেকে রিকোয়েস্ট নেয়।

```nginx
proxy_cache_path /var/cache/nginx/shield levels=1:2 keys_zone=shield:200m
                 max_size=200g inactive=30d use_temp_path=off;

geo $is_edge {
    default        0;
    203.0.113.40   1;  # edge-dac
    198.51.100.21  1;  # edge-sin
    198.51.100.77  1;  # edge-fra
    192.0.2.15     1;  # edge-nyc
}

server {
    listen 443 ssl;
    server_name shield.internal.baytalhikma.org;
    # ssl_certificate ... (same wildcard cert)

    if ($is_edge = 0) { return 403; }

    location / {
        proxy_pass http://origin.internal:8080;
        proxy_set_header Host $host;
        proxy_cache shield;
        proxy_cache_key $scheme$host$request_uri;
        proxy_cache_lock on;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_background_update on;
        add_header X-Shield-Cache $upstream_cache_status always;
    }
}
```

Origin-এর ফায়ারওয়ালে শুধু shield-এর IP খোলা রাখুন। তাহলে কেউ origin-এর IP খুঁজে পেলেও (পুরনো DNS রেকর্ড, ইমেইল হেডার, সার্টিফিকেট লগ থেকে) সরাসরি আঘাত করতে পারবে না।

## Varnish: বিকল্প

nginx-এর বদলে অনেকে edge-এ Varnish চালায়। এর ক্যাশ লজিক লেখা হয় VCL নামের একটা ছোট ভাষায়, আর পার্জ আর ban এর প্রথম শ্রেণির ফিচার। Varnish নিজে TLS টার্মিনেট করে না, তাই সামনে nginx, HAProxy বা Hitch লাগে।

```vcl
vcl 4.1;

backend shield {
    .host = "shield.internal.baytalhikma.org";
    .port = "8080";
}

acl purgers {
    "127.0.0.1";
    "192.0.2.10";   # deploy server
}

sub vcl_recv {
    if (req.method == "PURGE") {
        if (client.ip !~ purgers) {
            return (synth(405, "Not allowed"));
        }
        return (purge);
    }
    if (req.method == "BAN") {
        if (client.ip !~ purgers) {
            return (synth(405, "Not allowed"));
        }
        ban("obj.http.x-url ~ " + req.http.x-ban-pattern);
        return (synth(200, "Banned"));
    }
}

sub vcl_backend_response {
    set beresp.http.x-url = bereq.url;
}

sub vcl_deliver {
    unset resp.http.x-url;
}
```

**Purge** একটা নির্দিষ্ট অবজেক্ট সাথে সাথে মুছে দেয়। **Ban** একটা প্যাটার্ন রেজিস্টার করে ("`/css/` দিয়ে শুরু যেকোনো URL"); ম্যাচ করা অবজেক্ট পরের রিকোয়েস্টে বা ব্যাকগ্রাউন্ডের "ban lurker" প্রসেসে বাতিল হয়। `obj.http.x-url`-এর মতো অবজেক্টের হেডারে ban লিখলে lurker নিজেই পরিষ্কার করতে পারে; `req.url`-এ লিখলে পারে না, আর ban-এর তালিকা জমতে থাকে। VCL-এর বিস্তারিত নিজের Varnish ভার্সনের ডকসে মিলিয়ে নিন।

<Callout type="tip">

ওপেন সোর্স nginx-এ পার্জের directive (`proxy_cache_purge`) নেই; ডকস অনুযায়ী এটা শুধু কমার্শিয়াল সাবস্ক্রিপশনে। ওপেন সোর্সে তিনটা পথ: থার্ড-পার্টি `ngx_cache_purge` মডিউল, ক্যাশ ফাইল নিজে মোছা, অথবা সবচেয়ে সহজ, **ভার্সনড URL** (`app.3f9a.css`) ব্যবহার করে পার্জের দরকারই না রাখা (চ্যাপ্টার ৬)।

</Callout>

## ইউজারকে সঠিক edge-এ পাঠানো

### GeoDNS

সবচেয়ে সহজ পথ। একটা DNS প্রোভাইডার (বা নিজের PowerDNS-এর GeoIP ব্যাকএন্ড) resolver-এর IP দেখে অঞ্চল অনুযায়ী আলাদা A রেকর্ড দেয়। পুরো মেকানিজম আর এর দুর্বলতা (resolver-এর অবস্থান ইউজারের অবস্থান নয়, EDNS Client Subnet) দেখেছি [DNS দিয়ে ট্রাফিক চালানো](/notes/dns/10-traffic-steering) চ্যাপ্টারে।

```text
# illustrative: same name, different answers by region
$ dig +short static.baytalhikma.org        # from Dhaka
203.0.113.40
$ dig +short static.baytalhikma.org        # from Frankfurt
198.51.100.77
```

GeoDNS-এর TTL ছোট রাখুন (৬০ সেকেন্ডের আশেপাশে), কারণ একটা edge মরে গেলে আপনার ফেইলওভার যতটা দ্রুত, TTL তার নিচের সীমা।

### Anycast

বড় CDN-গুলো anycast চালায়: একই IP অ্যাড্রেস সব PoP থেকে BGP দিয়ে ঘোষণা করা হয়, আর ইন্টারনেটের রাউটিং নিজেই প্যাকেটকে নেটওয়ার্কের হিসাবে সবচেয়ে কাছের PoP-এ পাঠায়। DNS ক্যাশের ঝামেলা নেই, ফেইলওভার হয় BGP-র গতিতে।

কিন্তু নিজে করতে চাইলে লাগবে: নিজের **ASN** (একটা Regional Internet Registry থেকে, যেমন এশিয়া-প্যাসিফিকের জন্য APNIC), নিজের একটা **IP prefix** (IPv4-এ সাধারণত অন্তত একটা /24, কারণ এর চেয়ে ছোট prefix অনেক নেটওয়ার্ক গ্রহণ করে না), আর এমন **VPS প্রোভাইডার** যে আপনার সাথে BGP session চালাতে দেয়। কয়েকটা প্রোভাইডার এটা দেয়, বেশিরভাগ দেয় না; শর্ত আর খরচ প্রোভাইডারের সাথে মিলিয়ে নিন। শেখার জন্য দারুণ প্রজেক্ট, কিন্তু চার-পাঁচটা edge-এর ছোট CDN-এ GeoDNS-ই প্রায় সবসময় যথেষ্ট।

## প্রতিটা edge-এ TLS

ইউজার সরাসরি edge-এ TLS হ্যান্ডশেক করে, তাই প্রতিটা edge-এর কাছে একই ডোমেইনের সার্টিফিকেট থাকতে হবে। এখানে HTTP-01 challenge ঝামেলা করে: Let's Encrypt-এর validation রিকোয়েস্ট GeoDNS অনুযায়ী যেকোনো edge-এ পৌঁছাতে পারে, আর সেই edge-এ হয়তো challenge ফাইলটাই নেই।

সমাধান **DNS-01**: একটা জায়গা থেকে (যেমন deploy সার্ভার) DNS-এ TXT রেকর্ড বসিয়ে wildcard সার্টিফিকেট নিন, তারপর সব edge-এ কপি করে nginx reload করুন। ধাপে ধাপে দেখানো আছে [Wildcard ও DNS-01](/notes/tls-certs/06-wildcard-dns01) চ্যাপ্টারে।

```bash
#!/usr/bin/env bash
# deploy-cert.sh: run after certbot renews on the deploy host
set -euo pipefail
EDGES="edge-dac edge-sin edge-fra edge-nyc shield"
for h in $EDGES; do
  rsync -aL /etc/letsencrypt/live/baytalhikma.org/ "$h:/etc/letsencrypt/live/baytalhikma.org/"
  ssh "$h" 'nginx -t && systemctl reload nginx'
  echo "ok $h"
done
```

`rsync -L` দরকার, কারণ `live/` ডিরেক্টরির ফাইলগুলো আসলে `archive/`-এর symlink।

## Purge fan-out: সব edge-এ একসাথে

গল্পের সিলেটের স্টলের মতো, একটা edge পার্জ মিস করলে সেই অঞ্চলের ইউজার পুরনো কন্টেন্ট পায়, আর আপনি ঢাকা থেকে টেস্ট করে কিছুই দেখতে পান না। তাই পার্জ স্ক্রিপ্ট প্রতিটা edge-এর জবাব চেক করে, আর একটাও ব্যর্থ হলে পুরো কাজকে ব্যর্থ ধরে।

```bash
#!/usr/bin/env bash
# purge.sh <path>  e.g. purge.sh /index.html
# Assumes each edge exposes PURGE (Varnish, or nginx with ngx_cache_purge) on an internal port.
set -uo pipefail
path="$1"
fail=0
for h in edge-dac edge-sin edge-fra edge-nyc shield; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 -X PURGE \
    -H 'Host: static.baytalhikma.org' "http://$h.internal:8081$path")
  if [[ "$code" == "200" || "$code" == "404" ]]; then
    echo "ok   $h $code"
  else
    echo "FAIL $h $code"; fail=1
  fi
done
exit $fail
```

404 মানে "ওই edge-এ ক্যাশেই ছিল না", সেটাও সফল। মনে রাখবেন shield-কেও পার্জ করতে হবে, নইলে edge পার্জ হয়ে আবার shield থেকে পুরনো কপিটাই নিয়ে আসবে। আর ক্রম: আগে shield, তারপর edge।

## লগ আর মেট্রিক্স

উপরের `log_format edge`-এ প্রতিটা লাইনে `cache=` আছে। সেটা থেকেই প্রতিটা edge-এর hit ratio বের হয়:

```bash
awk '{for(i=1;i<=NF;i++) if($i ~ /^cache=/){split($i,a,"="); c[a[2]]++; n++}}
     END {for(k in c) printf "%-12s %6d  %5.1f%%\n", k, c[k], 100*c[k]/n}' /var/log/nginx/edge.log
```

```text
# illustrative output from edge-dac
HIT           91234   88.4%
MISS           8102    7.9%
EXPIRED        2210    2.1%
UPDATING       1105    1.1%
-               560    0.5%
```

প্রোডাকশনে এগুলো একটা জায়গায় পাঠান (Vector বা Promtail দিয়ে লগ, nginx-prometheus-exporter বা লগ থেকে বানানো মেট্রিক দিয়ে Prometheus)। প্রতি edge আলাদা করে দেখুন: hit ratio, 5xx-এর হার, `urt` (upstream response time) p95, আর ডিস্ক ক্যাশ কতটা ভরা।

## Health check: মরা edge DNS থেকে সরানো

একটা edge ডাউন হলে GeoDNS যদি তার IP দিতেই থাকে, সেই অঞ্চলের সব ইউজার টাইমআউট পাবে। তাই বাইরে থেকে (edge-গুলোর বাইরের একটা মেশিন থেকে, অন্তত দুইটা জায়গা থেকে) প্রতিটা edge-এর `/healthz` চেক করুন, আর ব্যর্থ হলে DNS থেকে সেই রেকর্ড সরান। অনেক DNS প্রোভাইডারের নিজস্ব health-checked রেকর্ড আছে; না থাকলে API দিয়ে নিজে করুন।

```bash
#!/usr/bin/env bash
# healthcheck.sh: run every 30s from two independent monitors
for ip in 203.0.113.40 198.51.100.21 198.51.100.77 192.0.2.15; do
  if curl -sf -m 3 --resolve "static.baytalhikma.org:443:$ip" \
       https://static.baytalhikma.org/healthz >/dev/null; then
    echo "up   $ip"
  else
    echo "down $ip"   # here: call your DNS provider API to disable this record
  fi
done
```

`--resolve` দিয়ে প্রতিটা edge-কে আলাদা করে চেক করা হচ্ছে, সাথে আসল hostname, যাতে TLS সার্টিফিকেটও যাচাই হয়। একবার ব্যর্থ হলেই সরাবেন না; পরপর দুই-তিনবার ব্যর্থ হলে সরান, নইলে একটা নেটওয়ার্ক ঝাঁকুনিতেই edge আসা-যাওয়া করবে। আর একটা নিরাপত্তা নিয়ম রাখুন: সব edge একসাথে "down" দেখালে কিছুই সরাবেন না, কারণ তখন সমস্যা সম্ভবত মনিটরের নিজের।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত করুন | সমাধান |
| --- | --- | --- |
| সবসময় `MISS`, কখনো `HIT` না | `curl -sI URL` দুইবার; origin-এর হেডারে `Set-Cookie`, `private`, `no-store`, `Vary: *` খুঁজুন | origin ঠিক করুন, স্ট্যাটিক ডোমেইনে `proxy_ignore_headers Set-Cookie` |
| `X-Cache-Status` হেডার নেই | রেসপন্স 4xx/5xx কিনা দেখুন | `add_header … always` |
| এক অঞ্চলে পুরনো কন্টেন্ট, বাকিদের নতুন | `curl --resolve host:443:EDGE_IP` দিয়ে প্রতি edge আলাদা চেক | purge স্ক্রিপ্টের আউটপুটে `FAIL` খুঁজুন; shield-ও পার্জ হয়েছে কিনা |
| পার্জের পরও পুরনো কন্টেন্ট | `X-Shield-Cache` দেখুন | আগে shield, তারপর edge পার্জ |
| দুই ডোমেইনের একই path-এ ভুল ফাইল | ক্যাশ কী-তে `$host` আছে কিনা | `proxy_cache_key $scheme$host$request_uri` |
| ডিস্ক ভরা, কিন্তু hit ratio কম | `du -sh` ক্যাশ ডিরেক্টরি; `keys_zone` ভরে গেছে কিনা (error log-এ "could not allocate node") | `keys_zone` বাড়ান, `max_size` ডিস্কের চেয়ে কম রাখুন |
| রাতের পর সকালে সব MISS | `inactive` কত | `inactive=7d` বা বেশি |
| origin ডাউন হলে সাইটও ডাউন | `X-Cache-Status`-এ কখনো `STALE` আসে কিনা | `proxy_cache_use_stale error timeout updating http_5xx` |
| ডিপ্লয়ের পর ট্রাফিক স্পাইকে origin বসে যায় | origin-এর লগে একই URL-এর অনেক রিকোয়েস্ট | `proxy_cache_lock on`, shield ব্যবহার |
| একটা edge-এ TLS এরর, বাকিগুলো ঠিক | `curl -v --resolve host:443:EDGE_IP https://host/` | `deploy-cert.sh`; ওই edge-এ রিনিউ করা সার্টিফিকেট পৌঁছায়নি |
| edge মরে গেছে, কিন্তু ইউজার এখনো সেখানে যাচ্ছে | `dig +short host @provider-ns` | health check ঠিকমতো DNS আপডেট করছে কিনা; TTL ছোট কিনা |
| কেউ সরাসরি origin-এ আঘাত করছে | origin-এর লগে shield ছাড়া অন্য IP | ফায়ারওয়ালে শুধু shield-এর IP খোলা রাখুন |

## মূল শিক্ষা

1. **নিজের CDN একটা অপারেশনাল দায়িত্ব।** নির্দিষ্ট অঞ্চলের ইউজার আর ভারী egress-এ এটা টাকা বাঁচায়; গ্লোবাল লেটেন্সি আর বড় DDoS-এ কমার্শিয়াল CDN-এর সাথে পারবে না।
2. **কাঠামো চার অংশের:** origin (লুকানো), shield (origin বাঁচায়), edge (ইউজারের কাছে), steering (GeoDNS বা anycast)।
3. **nginx-এ `proxy_cache_path`-এর ডিফল্ট `inactive=10m` একটা CDN-এর জন্য খুব কম**; key-তে `$host` রাখুন, `X-Cache-Status` হেডার `always` দিয়ে বসান।
4. **Stale, lock আর background update** — এই তিনটা origin ডাউন বা ধীর হলেও ইউজারকে সাইট দেখায়, আর ট্রাফিক স্পাইকে origin-কে বাঁচায়।
5. **পার্জ মানে সব edge আর shield-এ পার্জ, প্রতিটার জবাব যাচাই সহ।** সবচেয়ে ভালো পার্জ হলো যেটা করতেই হয় না: ভার্সনড URL।
6. **প্রতিটা edge-এ TLS লাগে, তাই DNS-01 wildcard আর একটা কপি স্ক্রিপ্ট।**
7. **মরা edge DNS থেকে স্বয়ংক্রিয়ভাবে সরাতে হবে**, একাধিক মনিটর থেকে, আর সব একসাথে মরে গেলে কিছুই না সরানোর নিয়ম সহ।
