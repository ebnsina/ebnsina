---
title: 'Edge Caching with nginx'
subtitle: 'proxy_cache, microcaching, stale-while-revalidate, আর সেই cache key নিয়ম যা nginx-কে আপনার নিয়ন্ত্রণে থাকা একটি CDN বানিয়ে দেয়।'
chapter: 9
level: 'intermediate'
readingTime: '12 মিনিট'
topics: ['nginx', 'caching', 'proxy_cache', 'microcaching', 'cdn']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা একটা পুরনো লাইব্রেরির ফ্রন্ট-ডেস্কে বসেন। লোকজন এসে নানা সার্টিফিকেটের নকল চায়, আর মূল কাগজগুলো রাখা থাকে পেছনের এক বিশাল, ধীর আর্কাইভে — সেখান থেকে একটা কাগজ খুঁজে বের করতে অনেক সময় লাগে। একদিন সিনা এসে একটা খুব জনপ্রিয় সার্টিফিকেট চাইলেন। ফাতিমা প্রথমবার হেঁটে পেছনের আর্কাইভে গেলেন, কাগজটা খুঁজে বের করলেন, কিন্তু সেটা হাতে দেওয়ার আগে একটা ফটোকপি করে ডেস্কের ড্রয়ারেই রেখে দিলেন।

এর পর যখনই কেউ — খোয়ারিজমি হোক বা আর কেউ — ঠিক সেই একই সার্টিফিকেট চায়, ফাতিমা আর পেছনে হাঁটেন না; ড্রয়ার থেকে ফটোকপিটা সেকেন্ডেই বাড়িয়ে দেন। আর্কাইভ একদম অক্ষত থাকে, লাইনও এগোয় দ্রুত। তবে ফাতিমা জানেন ফটোকপি চিরকাল রাখা যায় না — তাই প্রতিটা কপিতে একটা মেয়াদ লিখে রাখেন, সময় পেরোলে বা মূল কাগজ বদলে গেলে পুরনো কপিটা ছিঁড়ে ফেলে দেন, যেন কেউ ভুল বা বাসি তথ্য না পায়।

এই গল্পটাই আসলে nginx-এর **edge caching**। ফাতিমার ডেস্কের ফটোকপি হলো nginx-এর নিজের কাছে জমা রাখা cached response, আর পেছনের ধীর আর্কাইভ হলো **backend** server — প্রথম request-টা backend পর্যন্ত যায়, পরের সব একই request ফটোকপি থেকে মেটে, তাই backend-এর উপর চাপ নাটকীয়ভাবে কমে (backend offload)। "ঠিক সেই একই সার্টিফিকেট" চেনার নিয়মটাই **cache key** — nginx URL, method ইত্যাদি দিয়ে ঠিক করে কোন request একই জিনিস চাইছে। আর মেয়াদ লিখে পুরনো কপি ছিঁড়ে ফেলাটাই **TTL** আর **invalidation** — `proxy_cache_valid`-এর সময় পেরোলে বা মূল বদলালে nginx বাসি entry বাদ দিয়ে backend থেকে টাটকা নিয়ে আসে। বাস্তবে একটা news homepage বা public API-এর সামনে nginx বসিয়ে ছোট TTL দিলে হাজার request-per-second-ও backend-এ পৌঁছায় সেকেন্ডে একটা করে।

## মূল অন্তর্দৃষ্টি

আপনার বেশিরভাগ traffic হলো একই জিনিস বারবার চাওয়া। home page, public product page, "আজকের top items"-এর API listing। যদি আপনার backend home page render করতে 300ms নেয় আর মিনিটে হাজার user সেটা request করে, তাহলে আপনি **wall clock-এর প্রতি মিনিটে 5 মিনিট CPU** ব্যয় করেছেন। nginx সেই request-গুলোর 999টার উত্তর RAM থেকে এক millisecond-এরও কমে দিতে পারে, আর backend-কে response আবার তৈরি করতে দেয় শুধু তখনই যখন সেটা বদলায়।

এটাই **edge caching**। ঠিকভাবে করলে এটি backend CPU-কে এক অর্ডার অফ ম্যাগনিটিউড কমিয়ে দেয় আর p99 latency নাটকীয়ভাবে উন্নত করে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Edge caching অনেকটা একটা warehouse-এ গাড়ি চালিয়ে যাওয়ার বদলে আপনার পাড়ার একটা convenience store-এর মতো — একই পণ্য, কিন্তু অনেক কাছে, তাই যাত্রাটা মিনিটের বদলে সেকেন্ডে হয়।

</Callout>

## caching কখন প্রযোজ্য

**response** cache করুন, শুধু file নয়। cache key যা আপনি ঠিক করেন তা-ই — সাধারণত URL আর request method, ঐচ্ছিকভাবে যা response-কে প্রভাবিত করে না তা বাদ দিয়ে (cookie, tracking-এর query param, ইত্যাদি)।

ভালো প্রার্থী:

- **Public, non-personalized HTML** — marketing page, blog post, public profile, product page।
- **ধীরে বদলায় এমন public API response** — listing, leaderboard, "latest N items"।
- **বড় static-ish response** — generated image, CSV export, computed report।

খারাপ প্রার্থী:

- **Per-user content** — dashboard, account page, `Cookie` বা `Authorization` অনুযায়ী যা বদলায় এমন যেকোনো কিছু।
- **ঘন ঘন কম-ভলিউমের পরিবর্তন সহ response** — cache invalidation সাশ্রয়ের চেয়ে বেশি ভারী হয়ে যায়।
- **Mutating endpoint** — POST/PUT/PATCH/DELETE। ডিফল্টভাবে কখনো cache হয় না।

## একটি cache zone সেটআপ করা

`nginx.conf`-এ (`http` context-এ) একটি cache zone ডিফাইন করুন:

```nginx
proxy_cache_path /var/cache/nginx/main
                 levels=1:2
                 keys_zone=main:10m
                 max_size=1g
                 inactive=24h
                 use_temp_path=off;
```

প্রতিটি parameter-এর মানে:

- **path** — `/var/cache/nginx/main`। cache করা response disk-এ কোথায় জমা হবে।
- **levels** — directory hierarchy। `1:2` মানে একটি দুই-স্তরের directory tree (`a/bc/`), যাতে এক folder-এ লক্ষ লক্ষ file না জমে।
- **keys_zone** — cache _key_ (আর metadata) ধরে রাখা shared-memory zone-এর নাম আর size। 1MB ~ 8000 key; 10m ~ 80000।
- **max_size** — cache করা content-এর জন্য সর্বোচ্চ disk ব্যবহার। জায়গা করতে পুরনো entry evict হয়।
- **inactive** — এত সময় ধরে অ্যাক্সেস না হওয়া entry `max_size` যা-ই হোক মুছে যায়।
- **use_temp_path=off** — temp dir ব্যবহার না করে সরাসরি cache directory-তে লেখা। একই filesystem-এ দ্রুততর।

এবার এটি একটি location-এ ব্যবহার করুন:

```nginx
server {
    location / {
        proxy_cache main;
        proxy_cache_valid 200 302 10m;
        proxy_cache_valid 404 1m;

        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_lock on;
        proxy_cache_revalidate on;

        add_header X-Cache-Status $upstream_cache_status;

        proxy_pass http://app_backend;
    }
}
```

এটাই পুরো cache configuration। nginx এখন সফল আর 302 response 10 মিনিটের জন্য, 404 এক মিনিটের জন্য cache করে। নিচে আমরা প্রতিটি লাইন খুলে দেখব।

## proxy_cache_valid — status অনুযায়ী কতক্ষণ cache করবে

```nginx
proxy_cache_valid 200 302 10m;
proxy_cache_valid 404 1m;
proxy_cache_valid any 30s;
```

প্রথম মিলে যাওয়া নিয়ম জেতে। আপনি per-status বা `any` উল্লেখ করতে পারেন। `404`-এর জন্য ছোট cache (resource তৈরি হওয়ার ক্ষেত্রে) আর `5xx`-এর জন্য (failure বেশিক্ষণ cache করবেন না, কিন্তু কয়েক সেকেন্ড thundering herd আটকায়) সাধারণ pattern।

## backend থেকে Cache-Control header

যদি backend response-এ `Cache-Control: max-age=N` থাকে, nginx সেটা মেনে চলে আর `proxy_cache_valid`-কে override করে:

```text
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: public, max-age=300
```

সাধারণত এভাবেই আপনার caching চালানো উচিত: application সিদ্ধান্ত নেয় কোন response cache করা নিরাপদ আর কতক্ষণ, আর `Cache-Control` সেট করে। nginx আর downstream cache সবাই per-route nginx config ছাড়াই সঠিকভাবে আচরণ করে।

backend header **উপেক্ষা** করে nginx-এর নিজস্ব নিয়ম জোর করে চালাতে:

```nginx
proxy_ignore_headers Cache-Control Expires Set-Cookie;
```

## Cache key — সবচেয়ে গুরুত্বপূর্ণ config

ডিফল্টভাবে key হলো `$scheme$proxy_host$request_uri`। এটা ঠিক থাকে যতক্ষণ না ঠিক থাকে না।

এটা কাস্টমাইজ করুন:

```nginx
proxy_cache_key "$scheme$host$request_uri$is_args$args";
```

এখন key-তে query string অন্তর্ভুক্ত। `$args` ছাড়া `?page=1` আর `?page=2` দুটোই একই cache entry-তে hit করত — বিপর্যয়।

per-language সাইটের জন্য:

```nginx
proxy_cache_key "$scheme$host$request_uri:$http_accept_language";
```

logged-in বনাম anonymous পার্থক্যের জন্য, যেখানে logged-in response একদমই cache করা উচিত নয়:

```nginx
proxy_no_cache $http_authorization $cookie_session;
proxy_cache_bypass $http_authorization $cookie_session;
```

`proxy_no_cache` — response জমা করো না।
`proxy_cache_bypass` — কোনো cache করা entry উপেক্ষা করে fresh নিয়ে আসো।

যদি এদের যেকোনো variable non-empty হয়, request cache bypass করে। তাই `Authorization:` বা `session=` cookie সহ যেকোনো request সরাসরি backend-এ যায়।

## proxy_cache_use_stale — চমৎকার feature

```nginx
proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
```

যদি backend ব্যর্থ হয় (timeout, 5xx, refused), error-এর বদলে একটি **stale** cache করা entry serve করো। এই একটি directive-ই একটি backend incident-এর সময় "সাইট চালু আছে" আর "সাইটে একটা 502 page আছে"-র মধ্যে পার্থক্য।

`updating` বিশেষ: যখন একটি request cache entry আবার তৈরি করছে, _অন্য_ concurrent request-গুলোকে stale entry serve করা হয়। এটা ছাড়া প্রতিটি concurrent request একই regeneration-এর জন্য queue-তে অপেক্ষা করত — _thundering herd_।

## proxy_cache_lock — একক regeneration

```nginx
proxy_cache_lock on;
proxy_cache_lock_timeout 5s;
```

যখন একটি cache miss ঘটে, শুধু একটি request-ই backend-এর সাথে কথা বলার সুযোগ পায়। একই key-এর জন্য concurrent request অপেক্ষা করে। প্রথম response এসে cache হওয়ার পর, অপেক্ষমাণ request-গুলোকে cache থেকে serve করা হয়।

lock ছাড়া home page-এর জন্য হাজার concurrent miss একসাথে backend-এ hit করত। lock সহ একটি করে, আর 999টা সংক্ষিপ্তভাবে অপেক্ষা করে।

`use_stale ... updating`-এর সাথে মিলিয়ে, lock তখনই প্রযোজ্য হয় যখন serve করার মতো কোনো stale entry নেই। pattern-টা হলো:

- Stale entry আছে → সেটা serve করো, background-এ regenerate করো।
- কোনো stale entry নেই → প্রথম request নিয়ে আসে; অন্যরা lock-এর মাধ্যমে অপেক্ষা করে।

## proxy_cache_revalidate — ETag আর Last-Modified ব্যবহার

```nginx
proxy_cache_revalidate on;
```

যখন একটি cache করা entry expire হয়, পূর্ণ response নিয়ে আসার বদলে nginx backend-এ একটি conditional `If-Modified-Since` / `If-None-Match` পাঠায়। যদি backend `304 Not Modified` ফেরত দেয়, nginx cache entry-র freshness রিফ্রেশ করে আর সেটা serve করে। যেসব entry আসলে বদলায়নি তাতে bandwidth আর backend CPU বাঁচায়।

এটা কাজে লাগতে হলে আপনার backend-কে `If-Modified-Since` / `If-None-Match` মানতে হবে আর প্রযোজ্য ক্ষেত্রে `304` ফেরত দিতে হবে। বেশিরভাগ framework static content-এর জন্য এটা স্বয়ংক্রিয়ভাবে করে; dynamic content-এর জন্য আপনাকে opt in করতে হবে।

## X-Cache-Status — debugging visibility

```nginx
add_header X-Cache-Status $upstream_cache_status;
```

এখন response-এ থাকে:

```text
X-Cache-Status: HIT
```

সম্ভাব্য value:

- **MISS** — cache-এ নেই; backend থেকে আনা হয়েছে।
- **HIT** — cache থেকে serve করা।
- **EXPIRED** — cache-এ ছিল কিন্তু expire হয়েছে; fresh আনা হয়েছে।
- **UPDATING** — cache regenerate হচ্ছে; stale serve করা হয়েছে।
- **STALE** — backend ব্যর্থ; stale serve করা হয়েছে।
- **REVALIDATED** — backend 304 ফেরত দিয়েছে; cache থেকে serve করা।
- **BYPASS** — `proxy_cache_bypass` মিলে গেছে।

tuning-এর সময় এই header যোগ করুন। caching কাজ করছে কিনা দেখতে `HIT` আর `MISS`-এর অনুপাত লক্ষ্য করুন। public-এ প্রকাশের আগে এটা সরিয়ে ফেলুন (বা debug-only condition-এ সরান) — এটা implementation detail ফাঁস করে।

## Microcaching — গোপন অস্ত্র

যে dynamic content-এ 1-2 সেকেন্ডের staleness-ও গ্রহণযোগ্য, তার জন্য:

```nginx
proxy_cache main;
proxy_cache_valid 200 1s;
proxy_cache_lock on;
```

এক-সেকেন্ডের cache হাজার request-per-second-কে backend-এ hit করা এক request-per-second-এ পরিণত করে। user-দৃশ্যমান staleness সর্বোচ্চ 1s, যা বাস্তবে অদৃশ্য। বেশিরভাগ "dynamic কিন্তু personalized নয়" content-এর জন্য (news homepage, listing page, public API), এই একটি কৌশল backend load 99% কমিয়ে দেয়।

Production-এ _edge caching_ শব্দটা আসলে এটাই বোঝায়।

## Vary — ভিন্ন client-এর জন্য ভিন্ন response cache করা

কিছু backend `Accept-Encoding` (gzip বনাম identity), `Accept-Language`, বা অন্য request header-এর উপর ভিত্তি করে ভিন্ন body ফেরত দেয়। response-এ থাকে:

```text
Vary: Accept-Encoding, Accept-Language
```

nginx `Vary` মানে আর প্রতিটি combination-এর জন্য আলাদা cache entry জমা রাখে। `Vary` ছাড়া nginx হয়তো এমন client-কে gzip করা response serve করত যে `Accept-Encoding: gzip` পাঠায়নি, response ভেঙে ফেলত।

সাবধান: `Vary: User-Agent` একটা footgun — প্রতিটি browser version নিজের একটা cache entry হয়ে যায়, আর cache কার্যত অকেজো। শুধু কয়েকটি সুনির্দিষ্ট header-এ Vary করুন।

## cache purge করা

Free nginx (open-source)-এ built-in purge নেই। তিনটি workaround:

**1. Cache-busting URL.** সবচেয়ে সহজ, প্রতিটি CDN ব্যবহার করে। URL-এ একটি content hash যোগ করুন (`/assets/app.7f3a2b9.js`); content বদলালে URL বদলায়; পুরনো URL চিরকাল cache-এ থাকে কিন্তু কখনো request হয় না।

**2. Manual file deletion.** cache একটি directory tree; file-গুলোর নাম cache key-র hash অনুযায়ী। `nginx-cache-purge` script ব্যবহার করুন বা key hash হাতে compute করুন:

```bash
# Compute the cache file path for a key
KEY="httpsexample.com/api/users"
HASH=$(echo -n "$KEY" | md5sum | awk '{print $1}')
# levels=1:2 → /<last>/<2 before>/<full hash>
echo "/var/cache/nginx/main/${HASH: -1}/${HASH: -3:2}/$HASH"
```

সেই file মুছে ফেলুন, আর nginx পরের request-এ miss করে আবার fetch করে।

**3. ngx_cache_purge module** (third-party):

```nginx
location ~ /purge(/.*) {
    allow 127.0.0.1;
    deny all;
    proxy_cache_purge main "$scheme$host$1";
}
```

তারপর `curl http://localhost/purge/api/users` সেই entry সরিয়ে দেয়।

ছোট সাইটের জন্য cache-busting URL 90% প্রয়োজন মেটায়। বড় system-এর জন্য manual purge-এর চেয়ে ছোট TTL পছন্দ করুন।

## cache পরিদর্শন করা

```bash
# How big is the cache?
sudo du -sh /var/cache/nginx/main

# How many entries?
sudo find /var/cache/nginx/main -type f | wc -l

# Recent cache writes
sudo find /var/cache/nginx/main -type f -mmin -10 -ls
```

প্রতিটি cache করা file হলো response, যার আগে metadata (status, header, original key) থাকে। কী জমা করল দেখতে একটাতে `head -50` করতে পারেন।

## proxy*cache *কখন\_ ব্যবহার করবেন না

- **Cookie response বদলায়।** cache user A-র response user B-কে serve করবে। হয় `Cookie:`-তে bypass করুন, নয়তো cache করার আগে cookie ছেঁটে ফেলুন, নয়তো cache করবেন না।
- **response body-তে CSRF token বা per-request unique field।** একই সমস্যা।
- **Backend দ্রুত আর CPU-সাশ্রয়ী।** cache একটা layer যোগ করে; যদি পাওয়ার কিছু না থাকে, জটিলতা যোগ করবেন না।
- **আপনার এমন cache invalidation দরকার যা TTL-এর চেয়ে কঠিন।** এটা একটা queue আর আপনার backend দিয়ে স্পষ্টভাবে তৈরি করুন, nginx-এর workaround দিয়ে নয়।

## রিক্যাপ

- `proxy_cache_path` একটি cache zone ডিফাইন করে। `proxy_cache` সেটা একটি location-এ সক্রিয় করে।
- Cache key ডিফল্টে পুরো URL। query string, header, cookie অন্তর্ভুক্ত বা বাদ দিতে `proxy_cache_key` দিয়ে কাস্টমাইজ করুন।
- `proxy_cache_valid` per-status TTL সেট করে। backend-এর `Cache-Control` header override করে।
- `proxy_cache_use_stale` backend ব্যর্থ হলে সাইট চালু রাখে। `proxy_cache_lock` thundering-herd regeneration আটকায়।
- `proxy_cache_revalidate` 304 response-কে cache refresh-এ উন্নীত করে — bandwidth বাঁচায়।
- Microcaching (1s-এর TTL) dynamic-page load কয়েক অর্ডার অফ ম্যাগনিটিউড কমায়।
- tuning-এর সময় `X-Cache-Status` header যোগ করুন। production-এর জন্য সরিয়ে ফেলুন।
- invalidation-এর জন্য manual purge-এর চেয়ে cache-busting URL আর ছোট TTL পছন্দ করুন।

পরের এবং শেষ অধ্যায়: workers, sendfile, gzip/brotli, security headers, rate limiting — একটি কর্মক্ষম nginx-কে একটি টিউনড আর হার্ডেনড nginx-এ পরিণত করা।
