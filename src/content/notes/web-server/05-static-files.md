---
title: 'Static Files & MIME'
subtitle: 'একটা server কীভাবে একটা file path-কে তারে (wire-এ) bytes-এ পরিণত করে — content type, ETags, conditional request, আর যে cache header প্রতিটি browser-কে দ্রুত রাখে।'
chapter: 5
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['static files', 'mime', 'etag', 'cache control', 'http']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বাগদাদের এক গুদামঘরের সামনের কাউন্টারে বসে আল-খোয়ারিজমি। এখানে কিছু বানানো হয় না — সব জিনিস আগে থেকেই তাক-এ সাজানো, প্যাকেট করা, রেডি। কেউ একটা ছবির প্যাকেট চাইলে সে তাক থেকে ঠিক সেই প্যাকেটটা তুলে হাতে দিয়ে দেয়, কেউ একটা দলিলের বাক্স চাইলে সেটাই তুলে দেয় — কোনো হিসাব কষা লাগে না, শুধু তাক থেকে নামিয়ে সোজা হাতে তুলে দেওয়া। এত দ্রুত যে সামনে লাইনই জমে না।

কিন্তু আল-খোয়ারিজমির একটা নিয়ম আছে: প্রতিটা প্যাকেট হাতে তুলে দেওয়ার আগে সে গায়ে একটা স্পষ্ট লেবেল সেঁটে দেয় — "এটা একটা ছবি", "এটা একটা দলিল", "এটা দেয়ালের নকশা"। কারণ যে নিচ্ছে সে যদি না জানে ভেতরে কী, তাহলে ছবিকে সে ভুল করে চিঠি ভেবে পড়তে বসবে, নকশাকে ছবি ভেবে দেয়ালে টাঙাবে। লেবেল দেখেই লোকটা বুঝে যায় জিনিসটা নিয়ে কী করতে হবে। আর কেউ যদি একটা চিরকুট বাড়িয়ে বলে "সামনের তাক ছাড়িয়ে ভেতরের ঘরের সিন্দুক থেকে ওই কাগজটা এনে দাও" — আল-খোয়ারিজমি সাফ মানা করে দেয়। সামনের খোলা তাকের বাইরের কোনো ঘরে হাত দেওয়া বারণ।

এই গল্পটাই আসলে static file serving। তাক থেকে সরাসরি রেডি জিনিস তুলে দেওয়া হলো disk-এ পড়ে থাকা static file যেমন আছে তেমন serve করা — কোনো কোড রান করে বানানো লাগে না। গায়ের ওই লেবেলটাই হলো **Content-Type** (MIME type) header — এটা দেখেই browser বোঝে জিনিসটা HTML, image, নাকি stylesheet, আর সেই অনুযায়ী render করে, নাকি download করায়। ভুল লেবেল মানে browser ভুল ব্যবহার করবে। আর ভেতরের ঘরের সিন্দুকে হাত দিতে মানা করাটাই **path traversal** protection — `../../etc/passwd`-এর মতো path দিয়ে document root-এর বাইরে বেরোনোর চেষ্টা ঠেকানো। বাস্তবে nginx বা Go-র `http.FileServer` ঠিক এই তিনটে কাজই করে: তাক থেকে bytes তুলে দেয়, সঠিক Content-Type লেবেল সাঁটে, আর কেউ root-এর বাইরে path দিয়ে পালাতে চাইলে আটকে দেয়।

## "static" মানে কী

একটা static file হলো এমন file যা disk-এ থাকে আর যেমন আছে তেমনই serve করা হয়। এটা তৈরি করতে কোনো কোড রান হয় না। `index.html`, `style.css`, `app.js`, `logo.png` — এদের সবই request আসার আগে থেকেই file হিসেবে ছিল, আর server-এর একমাত্র কাজ হলো একটা সেনসিবল `Content-Type` সহ file-এর bytes ফেরত পাঠানো।

এর উল্টোটা হলো **dynamic** content: request-এর সময় একটা template থেকে render করা HTML, একটা API যা database query থেকে হিসাব করা JSON ফেরত দেয়, এমন যেকোনো কিছু যেখানে body প্রতি request-এ তৈরি হয়।

মজার ব্যাপারটা: **যা dynamic দেখায় তার বেশিরভাগই আসলে static**। একটা JavaScript bundle, একটা CSS file, একটা image — একবার আপনার build step এদের তৈরি করে ফেললে, প্রতিটি user একই bytes পায়। একটা static file server থেকে এদের serve করা আপনার application-এর মধ্য দিয়ে যাওয়ার চেয়ে অনেক গুণ দ্রুত।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Static file serve করা একটা vending machine-এর মতো — কোনো রাঁধুনির দরকার নেই, জিনিসটা আগে থেকেই প্যাকেট করা আর অপেক্ষারত; server শুধু সেটা তুলে নিয়ে হাতে দিয়ে দেয়।

</Callout>

## সর্বনিম্ন static server

```go
package main

import (
    "log"
    "net/http"
)

func main() {
    fs := http.FileServer(http.Dir("./public"))
    http.Handle("/", fs)
    log.Println("listening on :8080")
    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

পাঁচ লাইন। এখন `./public/index.html` আছে `http://localhost:8080/index.html`-এ। standard library করে:

- path-টা নিরাপদে resolve করে (`../../etc/passwd`-এর মাধ্যমে কোনো directory traversal নেই)।
- file extension-এর ভিত্তিতে `Content-Type` সেট করে।
- `If-Modified-Since` আর `If-None-Match` মেনে চলে (client-এর কাছে fresh copy থাকলে 304 ফেরত দেয়)।
- byte range serve করে (`Range: bytes=0-1023`)।
- সঠিক `Content-Length` আর `Last-Modified` লেখে।

এটা সত্যিকারের একটা real static server, পাঁচ লাইনে, আপনার যা যা লাগে সব সহ। nginx দ্রুততর আর বেশি configurable, কিন্তু এটাও কাজ করে।

## MIME types — `Content-Type`-ই সবকিছু

যখন একটা browser একটা response পায়, এটা `Content-Type`-এর ভিত্তিতে ঠিক করে কী করবে:

- `text/html` — parse করে render করে।
- `text/css` — stylesheet হিসেবে প্রয়োগ করে।
- `application/javascript` — execute করে।
- `image/png` — দেখায়।
- `application/octet-stream` — download-এর প্রস্তাব দেয়।

type ভুল করলে, browser file-টা interpret করতে অস্বীকার করে অথবা, আরও খারাপ, বিপজ্জনকভাবে interpret করে।

type-এর তালিকা লম্বা কিন্তু অনুমেয়:

| Extension       | MIME type                               |
| --------------- | --------------------------------------- |
| `.html`, `.htm` | `text/html; charset=utf-8`              |
| `.css`          | `text/css; charset=utf-8`               |
| `.js`, `.mjs`   | `application/javascript; charset=utf-8` |
| `.json`         | `application/json; charset=utf-8`       |
| `.png`          | `image/png`                             |
| `.jpg`, `.jpeg` | `image/jpeg`                            |
| `.svg`          | `image/svg+xml`                         |
| `.webp`         | `image/webp`                            |
| `.woff2`        | `font/woff2`                            |
| `.pdf`          | `application/pdf`                       |
| `.txt`          | `text/plain; charset=utf-8`             |
| `.wasm`         | `application/wasm`                      |

text format-এর জন্য সবসময় `charset=utf-8` রাখুন। এটা ছাড়া, browser তার locale অনুমানে fall back করে, যা আগে non-ASCII content-এর জন্য ভেঙে যেত।

standard library-র `mime.TypeByExtension` হলো Go-তে canonical lookup; nginx `/etc/nginx/mime.types` সরবরাহ করে; প্রতিটি framework-এর নিজস্ব ভ্যারিয়েন্ট আছে।

## Range requests — আংশিক download

```text
GET /movie.mp4 HTTP/1.1
Range: bytes=1024000-2048000
```

```text
HTTP/1.1 206 Partial Content
Content-Range: bytes 1024000-2048000/52428800
Content-Length: 1024001
Content-Type: video/mp4
```

client একটা byte range চায়; server শুধু সেই bytes ফেরত দেয় status `206` সহ। video seeking, resumable download, আর দুর্বল network-এ বড় file fetch করার জন্য ব্যবহৃত হয়। `http.FileServer` আর nginx দুটোই এটা সঠিকভাবে implement করে — byte-range logic আপনার নিজের কখনো লেখার দরকার হওয়া উচিত নয়।

## ETags আর Last-Modified — conditional requests

একই file-এর জন্য দ্বিতীয় request-এ আবার bytes transfer করা উচিত নয়। HTTP-তে "তুমি কি বদলেছ?" জিজ্ঞেস করার দুটো ব্যবস্থা আছে:

**1. Last-Modified.** server একটা timestamp পাঠায়। browser সেই timestamp সহ file cache করে। পরের request-এ, browser পাঠায়:

```text
If-Modified-Since: Mon, 04 May 2026 10:42:00 GMT
```

file-এর mtime না বদলালে, server জবাব দেয়:

```text
HTTP/1.1 304 Not Modified
```

খালি body। কোনো byte নষ্ট নয়।

**2. ETag.** server একটা fingerprint তৈরি করে (hash, version, mtime+size — এমন যেকোনো কিছু যা content বদলালে বদলায়) আর পাঠায়:

```text
ETag: "abc123-1234"
```

browser সেই ETag সহ file cache করে। পরের request:

```text
If-None-Match: "abc123-1234"
```

server তুলনা করে; ETag এখনো মিললে, `304 Not Modified` ফেরত দেয়।

ETag Last-Modified-এর চেয়ে শক্তিশালী কারণ এরা clock skew-এর প্রতি সংবেদনশীল নয় আর mtime নির্বিশেষে content-এর পরিবর্তন ধরে ফেলে। static file-এর জন্য nginx-এর ডিফল্ট ETag হলো `<hex-mtime>-<hex-size>`, যা ঠিক আছে। Application-এ তৈরি content-এর content hash করা উচিত।

## Cache-Control — browser-কে কতটা আক্রমণাত্মকভাবে cache করতে বলা

`Last-Modified` আর `ETag` 304 response দিয়ে byte বাঁচায়, কিন্তু browser তবু check করতে একটা network round-trip করে। **`Cache-Control`** browser-কে round-trip পুরোপুরি এড়িয়ে যেতে দেয়।

```text
Cache-Control: public, max-age=31536000, immutable
```

এটা বলে: "এটা এক বছরের জন্য cache করো। আমাকে জিজ্ঞেসও কোরো না — শুধু cache করা copy-ই ব্যবহার করো।"

**প্যাটার্নটা**: fingerprinted asset (যেসব URL-এ একটা content hash থাকে) দীর্ঘ max-age সহ serve করুন, আর সেগুলোকে reference করা HTML-টা `no-cache` সহ।

```text
GET /assets/app.7f3a2b9.js
Cache-Control: public, max-age=31536000, immutable
```

```text
GET /index.html
Cache-Control: no-cache
```

যখন আপনি `app.js`-এর একটা নতুন version deploy করেন, সেটা একটা নতুন hash পায় (`/assets/app.9c1e4d2.js`), HTML বদলে নতুন URL reference করে, আর browser সেটা নতুন করে fetch করে। পুরনো `app.7f3a2b9.js` চিরকাল cache-এ থাকতে পারে — সেটা আর কখনো request হবে না।

**জানার মতো Cache-Control directive:**

| Directive                  | মানে                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- |
| `public`                   | যেকোনো cache (browser, CDN, proxy) cache করতে পারে।                          |
| `private`                  | শুধু user-এর browser cache করতে পারে (কোনো shared cache নয়)।                |
| `no-cache`                 | cache করো, কিন্তু ব্যবহারের আগে প্রতি request-এ revalidate করো।              |
| `no-store`                 | কোথাও cache কোরো না।                                                         |
| `max-age=N`                | cache করা copy N সেকেন্ডের জন্য fresh।                                       |
| `immutable`                | `max-age`-এর আয়ুষ্কালে বদলাবে না। browser conditional request এড়িয়ে যায়। |
| `s-maxage=N`               | `max-age`-এর মতো কিন্তু শুধু _shared_ cache (CDN)-এ প্রযোজ্য।                |
| `stale-while-revalidate=N` | একটা fresh copy fetch করার সময় N সেকেন্ড পর্যন্ত stale serve করো।           |

## Compression — gzip আর brotli

text content নাটকীয়ভাবে compress হয়। একটা 100KB JavaScript bundle gzip-এ ~30KB হয়, brotli-তে ~25KB। প্রতিটি page load-এ 70% বাঁচানো বিশাল ব্যাপার।

client বলে সে কী গ্রহণ করে:

```text
Accept-Encoding: gzip, br, deflate
```

server একটা বেছে নিয়ে জবাব দেয়:

```text
Content-Encoding: br
```

সেরা চর্চা: build time-এ static asset precompress করুন, আর client সাপোর্ট করলে `.gz` বা `.br` file serve করতে server কনফিগার করুন। nginx-এর `gzip_static on` আর `brotli_static on` ঠিক এটাই করে — কোনো per-request CPU খরচ নেই।

কিছু content compress হয় না (আগে থেকেই compressed image, video, PDF)। এদের ওপর `Content-Encoding` সেট করা মানে নষ্ট CPU। এগুলো বাদ দিন।

## Path traversal — যে একটা জিনিস আপনাকে ঠিক করতেই হবে

```text
GET /../../etc/passwd HTTP/1.1
```

একটা সরল static server হয়তো request path-টা document root-এর সাথে জুড়ে দিয়ে process যে file পড়তে পারে সেটাই serve করবে। আপনার binary `nginx` বা `myapp` হিসেবে চললে, তাতে অনেক file অন্তর্ভুক্ত।

প্রতিরক্ষা:

- **path resolve করুন** (Go-তে `filepath.Clean`, Node-এ `path.normalize`)।
- resolve করার পর **যাচাই করুন এটা এখনো document root-এর নিচেই আছে**।
- `..`, null byte, বা non-ASCII control character থাকা **path প্রত্যাখ্যান করুন**।
- **standard library-র file server ব্যবহার করুন**, যা ইতিমধ্যেই উপরের কাজগুলো করে।

vulnerable কোড হলো এই ধরনের:

```go
http.HandleFunc("/files/", func(w http.ResponseWriter, r *http.Request) {
    filename := r.URL.Path[len("/files/"):]
    http.ServeFile(w, r, "/var/www/files/"+filename) // BAD
})
```

`filename` হতে পারে `../../etc/passwd`। সমাধান: `filepath.Join` আর যাচাই:

```go
root := "/var/www/files"
clean := filepath.Clean(filepath.Join(root, filename))
if !strings.HasPrefix(clean, root) {
    http.Error(w, "forbidden", http.StatusForbidden)
    return
}
http.ServeFile(w, r, clean)
```

অথবা `http.FileServer(http.Dir(...))` ব্যবহার করুন, যা এটা সঠিকভাবে সামলায়।

## static file-এর জন্য nginx কেন অপরাজেয়

nginx `sendfile()` ব্যবহার করে — একটা Linux syscall যা userspace-এর মধ্য দিয়ে কপি না করে file-এর bytes সরাসরি page cache থেকে socket-এ পাঠায়। `tcp_nopush` আর `tcp_nodelay`-র সাথে মিলিয়ে, server প্রায় শূন্য CPU-তে শত শত MB/s static content ঠেলে দিতে পারে।

```nginx
location / {
    root /var/www/site;
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    expires 1d;
}
```

`gzip_static on;` আর `brotli_static on;` যোগ করুন আর client সাপোর্ট করলে pre-built `.gz` / `.br` version স্বয়ংক্রিয়ভাবে serve হয়। `etag on;` আর `if_modified_since exact;` যোগ করুন আর 304 response এমনিতেই কাজ করে।

static workload-এর জন্য, আর কিছুই কাছাকাছি আসে না। Go আর Node পারে, কিন্তু এরা 10x CPU ব্যবহার করবে।

## একটা ব্যবহারিক static-asset কৌশল

আপনার build step একটা `dist/` directory তৈরি করে:

```text
dist/
├── index.html
├── assets/
│   ├── app.7f3a2b9.js
│   ├── app.7f3a2b9.css
│   ├── logo.png
│   └── hero.webp
├── favicon.ico
└── robots.txt
```

nginx দিয়ে serve করুন (chapter 6 config বিস্তারিতভাবে কভার করে), এই নিয়মগুলো সহ:

- **`/assets/*`** — `Cache-Control: public, max-age=31536000, immutable`। filename-এ hashed, কখনো পুনরায় ব্যবহৃত হয় না।
- **`*.html`** — `Cache-Control: no-cache`। সবসময় revalidate; HTML হয়তো নতুন asset URL-এ point করে।
- **সব static file** — `gzip_static on`, `brotli_static on`, `etag on`।

browser শেষমেশ প্রতি navigation-এ একটা HTML request করে (যা প্রায়ই 304 ফেরত দেয়) আর প্রথম visit-এর পর শূন্যটা asset request করে। page load তাৎক্ষণিক মনে হয়।

## রিক্যাপ

- একটা static file server: file পড়া → `Content-Type` সেট করা → bytes পাঠানো। পাঁচ লাইনই যথেষ্ট।
- MIME type browser-এর আচরণ চালায়। সবসময় সেট করুন; text-এর জন্য `charset=utf-8` রাখুন।
- ETag আর Last-Modified 304 Not Modified সম্ভব করে; Cache-Control request পুরোপুরি এড়িয়ে যাওয়া সম্ভব করে।
- asset URL fingerprint করুন আর `immutable, max-age=1y` সহ serve করুন। HTML `no-cache` সহ serve করুন।
- build time-এ gzip/brotli দিয়ে precompress করুন। `gzip_static`-এর মাধ্যমে compressed serve করুন।
- Path traversal হলো static-file vulnerability। standard library ব্যবহার করুন; হাতে path জোড়া দেবেন না।
- `sendfile` সহ nginx static workload-এর জন্য gold standard।

পরের অধ্যায়: nginx fundamentals — যে config file এই সবকিছুকে একসাথে বেঁধে দেয়।
