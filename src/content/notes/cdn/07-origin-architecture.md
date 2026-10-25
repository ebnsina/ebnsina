---
title: 'Origin আর্কিটেকচার'
subtitle: 'Origin shield, request collapsing, origin-কে লুকিয়ে রাখা, ফেইলওভার আর আসল ক্লায়েন্ট IP — CDN-এর পেছনের সার্ভারটা কীভাবে সাজালে MISS-এর ঝড়েও সে দাঁড়িয়ে থাকে।'
chapter: 7
level: 'intermediate'
readingTime: '২০ মিনিট'
topics: ['origin', 'origin shield', 'tiered caching', 'request collapsing', 'origin protection', 'failover', 'real ip', 'object storage']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

চট্টগ্রামের চাক্তাই খালের পাড়ে খোয়ারিজমির চালের আড়ত। জাহাজ থেকে নামা চাল সব এখানেই জমা হয়, আর সারা দেশের দোকানদাররা এখান থেকেই চাল নেয়। শুরুতে নিয়ম ছিল সোজা: কুমিল্লা, ফেনী, নোয়াখালী, সিলেটের যেকোনো দোকানদার চাল ফুরালে নিজের ট্রাক পাঠিয়ে সরাসরি আড়ত থেকে নিয়ে যেত। ঈদের আগের সপ্তাহে দেখা গেল চল্লিশটা ট্রাক একসাথে আড়তের গেটে দাঁড়িয়ে আছে, সবাই একই মিনিকেট চাল চায়। খোয়ারিজমির চারজন কুলি চল্লিশটা ট্রাক সামলাতে পারে না, গেটে জট, আর আড়তের ভেতরের হিসাবও গুলিয়ে যায়।

খোয়ারিজমির ভাতিজা বিরুনি তখন তিনটা বদল আনল। প্রথমত, কুমিল্লায় একটা বড় জেলা ডিপো খোলা হলো। এখন ফেনী, নোয়াখালী, চাঁদপুরের দোকানদাররা আর চট্টগ্রামে আসে না, কুমিল্লা ডিপো থেকে নেয়। ডিপোতে চাল না থাকলে শুধু ডিপোই আড়তে ট্রাক পাঠায়, একবার। চল্লিশটা ট্রাকের জায়গায় এখন আড়তের গেটে আসে তিনটা ডিপোর তিনটা ট্রাক। দ্বিতীয়ত, ডিপোর ম্যানেজার হাইসামকে বলা হলো: একই চালের জন্য পাঁচজন দোকানদার একসাথে এলে পাঁচটা আলাদা অর্ডার আড়তে পাঠাবে না। একটা অর্ডার পাঠাও, বাকি চারজনকে বসিয়ে রাখো, ট্রাক এলে সবাইকে একসাথে দাও।

তৃতীয় বদলটা গেটে। আগে যেকোনো ট্রাক গেটে এসে "আমি কুমিল্লার দোকানদার" বললেই ঢুকে যেত। একবার এক ঠগ এসে নিজেকে দোকানদার বলে বাকিতে দশ বস্তা নিয়ে উধাও। এখন গেটে দারোয়ান রুশদ বসে, তার হাতে একটা তালিকা: শুধু তিনটা ডিপোর ট্রাকের নাম্বার। ডিপোর ড্রাইভাররা সাথে একটা সিল দেওয়া চিঠিও আনে, যেটা শুধু ডিপো আর আড়তই চেনে। তালিকায় নেই বা চিঠি নেই, এমন ট্রাক গেট থেকেই ফেরত। কোনো দোকানদার আর আড়তের ঠিকানা জানেও না, জানার দরকারও নেই। আর আড়ত বন্ধ থাকলে? খালের ওপারে খোয়ারিজমির ছোট একটা দ্বিতীয় গুদাম আছে; ডিপো আগে একটা লোক পাঠিয়ে দেখে নেয় মূল আড়ত খোলা কিনা, বন্ধ থাকলে সোজা দ্বিতীয় গুদামে যায়।

মিলিয়ে নিই: খোয়ারিজমির আড়ত হলো **origin**, দোকানদাররা হলো **এজ PoP**, আর কুমিল্লার জেলা ডিপো হলো **origin shield** বা **tiered cache** — সব এজের MISS এক জায়গায় জমা হয়, origin-এ যায় শুধু ডিপোর MISS। হাইসামের "একটা অর্ডার, বাকিরা অপেক্ষা করুক" হলো **request collapsing**। রুশদের ট্রাক-নাম্বারের তালিকা হলো **CDN IP allowlist**, সিল দেওয়া চিঠি হলো **authenticated origin pull** (mTLS বা গোপন হেডার), আর আড়তের ঠিকানা গোপন থাকা হলো **origin লুকিয়ে রাখা**। দ্বিতীয় গুদাম হলো **failover origin**, আর আগে লোক পাঠিয়ে দেখে নেওয়া হলো **health check**। বাস্তবে প্রতিটা বড় সাইট ঠিক এই চারটা জিনিস দিয়েই origin-কে ট্রাফিকের ঝড় আর সরাসরি আক্রমণ দুটো থেকেই বাঁচায়।

## Origin আসলে কী

Origin হলো সেই সার্ভার (বা সার্ভারের গ্রুপ) যার কাছে কন্টেন্টের আসল কপি থাকে। CDN-এর এজ যখন কোনো রিকোয়েস্টের উত্তর নিজের ক্যাশে পায় না (MISS), বা ক্যাশের কপি পুরনো হয়ে গেছে (EXPIRED), তখন সে origin-এর কাছে যায়। Origin হতে পারে:

- আপনার নিজের VPS-এ চলা nginx বা অ্যাপ সার্ভার
- একটা load balancer, যার পেছনে কয়েকটা অ্যাপ সার্ভার
- একটা object storage bucket (S3-compatible), স্ট্যাটিক ফাইলের জন্য
- আরেকটা CDN বা রিভার্স প্রক্সি (চেইন করা সেটআপে)

CDN চালু করার পর origin-এর কাজ কমে, কিন্তু তার গুরুত্ব কমে না। প্রতিটা MISS, প্রতিটা ডায়নামিক রিকোয়েস্ট, প্রতিটা পার্জের পরের প্রথম রিকোয়েস্ট origin-এ যায়। আর CDN যত বড় হয় (যত বেশি PoP), MISS তত ছড়িয়ে পড়ে, যদি না আপনি মাঝখানে একটা স্তর রাখেন।

## সমস্যা: PoP যত বেশি, MISS তত বেশি

ধরুন একটা CDN-এর ৩০০টা PoP আছে, আর আপনার একটা নতুন ফাইল `app.4f2a.js` ডিপ্লয় হলো। প্রতিটা PoP-এর ক্যাশ আলাদা। প্রথম ইউজার যে PoP-এ আসবে, সেখানে MISS। ফলে একটা ফাইলের জন্য origin-এ সবচেয়ে খারাপ ক্ষেত্রে ৩০০টা আলাদা রিকোয়েস্ট আসতে পারে, প্রতিটা PoP থেকে একটা। প্রতিটা PoP-এর ভেতরেও আবার অনেকগুলো আলাদা ক্যাশ সার্ভার থাকতে পারে।

এজন্য একটা জনপ্রিয় সাইটেও প্রতি PoP-এর hit ratio ভালো হলেও origin-এর কাছে আসা ট্রাফিক আশ্চর্যরকম বেশি থাকে। লং-টেইল কন্টেন্টে (অনেক ফাইল, প্রতিটা কম দেখা হয়) সমস্যা আরও বড়: কোনো একটা PoP-এ একটা ফাইল এত কম চাওয়া হয় যে ক্যাশে টিকে থাকার আগেই সরিয়ে দেওয়া হয় (eviction)।

## Tiered caching ও origin shield

সমাধান হলো এজ আর origin-এর মাঝে আরেকটা ক্যাশ স্তর। নাম ভেন্ডরভেদে আলাদা (origin shield, tiered cache, mid-tier, parent cache), কিন্তু ধারণা একই: এজ PoP-এ MISS হলে সে origin-এ না গিয়ে একটা নির্দিষ্ট **shield PoP**-কে জিজ্ঞেস করে। Shield-এ HIT হলে origin জানতেও পারে না। Shield-এ MISS হলে শুধু shield origin-এ যায়।

<Mermaid
title="Origin shield ছাড়া ও সহ"
code={`graph LR
  subgraph "Shield ছাড়া"
    E1["Edge Dhaka"] --> O1["Origin"]
    E2["Edge Singapore"] --> O1
    E3["Edge Frankfurt"] --> O1
    E4["Edge Mumbai"] --> O1
  end
  subgraph "Shield সহ"
    F1["Edge Dhaka"] --> S["Shield PoP"]
    F2["Edge Singapore"] --> S
    F3["Edge Frankfurt"] --> S
    F4["Edge Mumbai"] --> S
    S --> O2["Origin"]
  end`}
/>

### হিসাবটা কেন গুণ হয়

একটা সহজ মডেল ধরুন (সংখ্যাগুলো উদাহরণ মাত্র)। প্রতিটা এজ PoP-এর hit ratio ৯০%, অর্থাৎ ১০% রিকোয়েস্ট MISS। Shield না থাকলে এই ১০% সরাসরি origin-এ যায়।

Shield থাকলে ওই ১০% MISS shield-এ যায়। Shield অনেক PoP-এর MISS একসাথে দেখে, তাই একই ফাইল তার কাছে অনেক বেশিবার চাওয়া হয়, ফলে তার hit ratio বেশি, ধরুন ৮০%। তাহলে origin-এ যায় ১০% এর ২০%, মানে মোট ট্রাফিকের মাত্র ২%। Origin-এর লোড পাঁচ ভাগের এক ভাগে নেমে এলো, এজের কনফিগ একটুও না বদলে।

```text
illustrative numbers
total requests            : 1,000,000
edge hit ratio            : 90%   -> 100,000 misses go upstream
without shield, origin    : 100,000 requests
shield hit ratio          : 80%   -> 20,000 misses go to origin
with shield, origin       : 20,000 requests   (5x less)
```

### খরচ কী

- **একটা বাড়তি হপ।** এজে MISS হলে এখন দুইটা হপ: এজ থেকে shield, shield থেকে origin। Shield যদি origin থেকে অনেক দূরে হয় বা এজ থেকে অনেক দূরে হয়, MISS-এর latency বাড়ে। তাই shield সাধারণত origin-এর সবচেয়ে কাছের PoP-এ রাখা হয়।
- **Shield নিজেই একটা হটস্পট।** সব MISS এক জায়গায় আসে। বড় CDN-গুলো shield-কে একাধিক সার্ভারে ছড়িয়ে রাখে, কিন্তু আপনি নিজে বানালে (চ্যাপ্টার ১৩) এটা মাথায় রাখতে হবে।
- **খরচ।** কিছু ভেন্ডর shield-এর জন্য আলাদা চার্জ নেয়, কিছু ফ্রি দেয়। ভেন্ডরের প্রাইসিং পেজে নিজে দেখে নিন; এটা বদলায়।

<Callout type="tip">

Origin যদি একাধিক অঞ্চলে থাকে (ঢাকা আর সিঙ্গাপুর), প্রতিটা origin-এর জন্য তার কাছের shield বেছে নিন। একটা shield দিয়ে দুই মহাদেশের origin সার্ভ করলে অর্ধেক MISS অকারণে সমুদ্র পার হয়।

</Callout>

## Request collapsing: একটা MISS, অনেক অপেক্ষমাণ

এবার একটা PoP-এর ভেতরের সমস্যা। একটা জনপ্রিয় ফাইলের TTL ঠিক এই মুহূর্তে শেষ হলো। পরের ১০০ মিলিসেকেন্ডে ৫০০টা রিকোয়েস্ট এলো একই URL-এর জন্য। সবার জন্য MISS। কোনো ব্যবস্থা না থাকলে PoP ৫০০টা আলাদা রিকোয়েস্ট origin-এ পাঠাবে। এটাই **thundering herd** বা **cache stampede** (ক্যাশিং ট্র্যাকের stampede চ্যাপ্টারে অ্যাপ্লিকেশনের দিক থেকে এটা দেখানো আছে)।

**Request collapsing** (বা coalescing) মানে: একটা কী-এর জন্য প্রথম MISS origin-এ যায়, বাকি সব রিকোয়েস্ট সেই একটা রেসপন্সের জন্য অপেক্ষা করে। রেসপন্স এলে সবাই একই কপি পায়, আর সেটা ক্যাশে বসে যায়।

বেশিরভাগ বড় CDN এটা ডিফল্টভাবে করে। নিজের nginx এজে করতে হলে:

```nginx
proxy_cache_path /var/cache/nginx keys_zone=edge:100m max_size=20g inactive=7d;

server {
    location / {
        proxy_cache edge;
        proxy_pass https://origin_pool;

        # Only one request per cache key goes upstream; the rest wait for it.
        proxy_cache_lock on;
        proxy_cache_lock_timeout 5s;

        # While one request refreshes an expired entry, everyone else gets the stale copy.
        proxy_cache_use_stale updating error timeout http_500 http_502 http_503 http_504;
        proxy_cache_background_update on;
    }
}
```

এখানে তিনটা আলাদা জিনিস কাজ করছে:

| ডিরেক্টিভ | কী সমস্যা সারায় |
| --- | --- |
| `proxy_cache_lock on` | নতুন কী-এর প্রথম MISS-এ বাকিরা অপেক্ষা করে, origin-এ একটাই রিকোয়েস্ট যায় |
| `proxy_cache_use_stale updating` | কী এক্সপায়ার হলে একজন রিফ্রেশ করে, বাকিরা পুরনো কপি পায়, কেউ অপেক্ষা করে না |
| `proxy_cache_use_stale error timeout http_5xx` | Origin ডাউন বা ধীর হলে পুরনো কপি দিয়ে চালিয়ে যাওয়া |
| `proxy_cache_background_update on` | রিফ্রেশটা ব্যাকগ্রাউন্ডে হয়, প্রথম ইউজারও স্টেল কপি পেয়ে দ্রুত উত্তর পায় |

<Callout type="warning">

`proxy_cache_lock_timeout` শেষ হলে অপেক্ষমাণ রিকোয়েস্টগুলোও origin-এ চলে যায় (আর সেই রেসপন্স ক্যাশ হয় না)। Origin যদি একটা ভারী পেজ বানাতে ১০ সেকেন্ড নেয় আর টাইমআউট ৫ সেকেন্ড, তাহলে collapsing ঠিক যখন সবচেয়ে বেশি দরকার তখনই ভেঙে পড়ে। টাইমআউটটা origin-এর আসল p99 রেসপন্স টাইমের চেয়ে বেশি রাখুন।

</Callout>

### Collapsing কখন বিপদ

Collapsing শুধু তখনই নিরাপদ যখন রেসপন্সটা সবার জন্য একই। লগইন করা ইউজারের পেজ, `Set-Cookie` সহ রেসপন্স, বা `Cache-Control: private` রেসপন্স collapse করা মানে একজনের উত্তর আরেকজনকে দেওয়া। ভালো CDN এগুলো collapse করে না, আর নিজের এজে আপনাকে নিশ্চিত করতে হবে এগুলো ক্যাশ কী-তেই আসে না (চ্যাপ্টার ৯)।

## Origin সুরক্ষা: CDN-কে পাশ কাটানো বন্ধ করা

CDN-এর সব সুবিধা (DDoS শোষণ, WAF, রেট লিমিট, ক্যাশ) শুধু তখনই কাজ করে যখন ট্রাফিক CDN-এর ভেতর দিয়ে আসে। কেউ যদি আপনার origin-এর IP জেনে যায়, সে সরাসরি origin-এ রিকোয়েস্ট পাঠাতে পারে, আর CDN-এর সব সুরক্ষা অর্থহীন।

Origin-এর IP ফাঁস হয় এমন সাধারণ পথ:

- CDN চালুর আগের পুরনো DNS রেকর্ড, যা পাবলিক DNS হিস্ট্রি সার্ভিসে জমা আছে
- একই সার্ভারে চলা অন্য সাবডোমেইন (`mail.`, `ftp.`, `dev.`) যা CDN-এর পেছনে নেই
- MX রেকর্ড একই IP-তে, বা আউটগোয়িং ইমেইলের হেডারে সার্ভারের IP
- Certificate Transparency লগে origin-এর সার্টিফিকেট, আর ইন্টারনেট-স্ক্যানার যারা সব IP-তে TLS হ্যান্ডশেক করে দেখে কোন সার্টিফিকেট কোথায়
- অ্যাপের কোনো ফিচার যা origin থেকে বাইরে HTTP কল করে (webhook, URL preview)

তাই "IP গোপন রাখা" একা যথেষ্ট না। ধরে নিন IP একদিন ফাঁস হবেই, আর origin-কে এমনভাবে সাজান যাতে ফাঁস হলেও কিছু না হয়। চারটা স্তর আছে, শক্তি অনুযায়ী সাজানো।

### স্তর ১: ফায়ারওয়ালে শুধু CDN-এর IP রেঞ্জ

Origin-এর পোর্ট 80/443-এ শুধু CDN-এর IP রেঞ্জ থেকে আসা কানেকশন ঢুকতে দিন। প্রতিটা বড় CDN তাদের রেঞ্জ পাবলিশ করে। উদাহরণ হিসেবে, ২০২৬ সালের অক্টোবর অনুযায়ী Cloudflare তাদের তালিকা `https://www.cloudflare.com/ips/` পেজে রাখে, আর তাদের ডকুমেন্টেশন বলে রেঞ্জ কদাচিৎ বদলায় এবং নতুন রেঞ্জ প্রোডাকশনে যাওয়ার আগে তালিকায় যোগ হয়। আপনার ভেন্ডরের ডকে নিজে দেখে নিন।

মূল কথা: **রেঞ্জ বদলায়, তাই হাতে কপি করে ফায়ারওয়ালে বসাবেন না।** একটা স্ক্রিপ্ট দিয়ে নিয়মিত ফেচ করুন:

```bash
#!/usr/bin/env bash
# Refresh an nftables set with the CDN's published ranges. Run from a systemd timer.
set -euo pipefail

v4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
v6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)

# Refuse to apply an empty or suspiciously short list; that would lock the CDN out.
[ "$(echo "$v4" | wc -l)" -ge 5 ] || { echo "v4 list too short, aborting" >&2; exit 1; }

nft flush set inet filter cdn_v4
nft flush set inet filter cdn_v6
echo "$v4" | xargs -I% nft add element inet filter cdn_v4 '{ % }'
echo "$v6" | xargs -I% nft add element inet filter cdn_v6 '{ % }'
```

<Callout type="danger">

স্ক্রিপ্টের সেই "তালিকা খুব ছোট হলে থামো" লাইনটা বাদ দেবেন না। ভেন্ডরের পেজ একদিন একটা এরর পেজ ফেরত দিলে, আর আপনার স্ক্রিপ্ট খালি তালিকা বসিয়ে দিলে, ফায়ারওয়াল CDN-কেই আটকে দেবে আর পুরো সাইট ডাউন হবে, অথচ origin পুরোপুরি সুস্থ দেখাবে।

</Callout>

**সীমাবদ্ধতা:** IP allowlist বলে "এই অনুরোধ CDN-এর কোনো সার্ভার থেকে এসেছে", কিন্তু বলে না "আমার CDN অ্যাকাউন্ট থেকে এসেছে"। একই CDN-এর অন্য গ্রাহকও তাদের নিজের কনফিগে আপনার origin IP বসিয়ে CDN-এর ভেতর দিয়ে আপনার origin-এ রিকোয়েস্ট পাঠাতে পারে। তাই এটা প্রথম স্তর, শেষ স্তর না।

### স্তর ২: গোপন হেডার

CDN-কে বলুন origin-এ যাওয়ার সময় একটা গোপন হেডার যোগ করতে, আর origin-এ সেই হেডার ছাড়া সব রিকোয়েস্ট ফেরত দিন:

```nginx
# origin nginx
map $http_x_origin_auth $origin_auth_ok {
    default 0;
    "k3J9vQ2mT7xR4pL8"  1;   # rotate this; keep it out of git
}

server {
    listen 443 ssl;
    server_name baytalhikma.org;

    if ($origin_auth_ok = 0) {
        return 403;
    }
    # ...
}
```

সহজ, প্রায় সব CDN সাপোর্ট করে। দুর্বলতা: সিক্রেটটা একটা স্ট্যাটিক স্ট্রিং, লগে বা ভুল কনফিগে ফাঁস হতে পারে, আর রোটেট করতে দুই জায়গায় একসাথে বদলাতে হয় (রোটেশনের সময় কিছুক্ষণ দুটো মানই গ্রহণ করুন)।

### স্তর ৩: Authenticated origin pull (mTLS)

সবচেয়ে শক্ত পদ্ধতি। CDN origin-এ TLS কানেকশন খোলার সময় নিজের একটা **ক্লায়েন্ট সার্টিফিকেট** দেখায়, আর origin সেটা যাচাই করে। সার্টিফিকেট না থাকলে TLS হ্যান্ডশেকই শেষ হয় না, HTTP পর্যন্ত পৌঁছায়ই না।

```nginx
server {
    listen 443 ssl;
    server_name baytalhikma.org;

    ssl_certificate     /etc/ssl/origin/fullchain.pem;
    ssl_certificate_key /etc/ssl/origin/privkey.pem;

    # The CA that signs the CDN's client certificates (downloaded from the CDN's docs).
    ssl_client_certificate /etc/ssl/origin/cdn-origin-pull-ca.pem;
    ssl_verify_client on;
}
```

একটা জরুরি সূক্ষ্মতা: অনেক CDN সব গ্রাহকের জন্য **একই** ক্লায়েন্ট সার্টিফিকেট ব্যবহারের অপশন দেয়। সেটা স্তর ১-এর মতোই দুর্বল (অন্য গ্রাহকের ট্রাফিকও পাস করবে)। পারলে **আপনার জোনের জন্য আলাদা** (per-zone বা per-hostname) সার্টিফিকেট আপলোড করুন। আপনার ভেন্ডর কোনটা দেয়, তাদের ডকে দেখে নিন।

### স্তর ৪: টানেল, origin-এর কোনো পাবলিক পোর্টই নেই

আরেকটা পদ্ধতি হলো origin-এ কোনো ইনবাউন্ড পোর্টই খোলা না রাখা। Origin-এ একটা ছোট এজেন্ট চলে যা নিজে থেকে CDN-এর দিকে একটা আউটবাউন্ড কানেকশন খোলে, আর CDN সেই টানেলের ভেতর দিয়ে রিকোয়েস্ট পাঠায়। ফায়ারওয়াল সব ইনবাউন্ড ব্লক করে দিতে পারে; IP ফাঁস হলেও স্ক্যান করার মতো কিছু নেই। ট্রেডঅফ: একটা বাড়তি প্রসেস চালাতে হয়, আর আপনি ভেন্ডরের নির্দিষ্ট এজেন্টের ওপর নির্ভরশীল হয়ে যান।

| স্তর | কী প্রমাণ করে | দুর্বলতা |
| --- | --- | --- |
| IP allowlist | CDN-এর কোনো সার্ভার থেকে এসেছে | একই CDN-এর অন্য গ্রাহক, রেঞ্জ আপডেট |
| গোপন হেডার | যে পাঠিয়েছে সে সিক্রেট জানে | স্ট্যাটিক সিক্রেট, ফাঁস হতে পারে |
| mTLS (per-zone cert) | আপনার CDN জোন থেকে এসেছে | সার্টিফিকেট রিনিউ, কনফিগ জটিলতা |
| টানেল | পাবলিক পোর্টই নেই | ভেন্ডর লক-ইন, বাড়তি এজেন্ট |

বাস্তবে সাধারণ কম্বিনেশন: IP allowlist + mTLS, বা IP allowlist + গোপন হেডার।

## আসল ক্লায়েন্ট IP

CDN চালুর পর origin-এর প্রতিটা কানেকশন আসে CDN-এর সার্ভার থেকে। আপনার access log-এ সব রিকোয়েস্টের IP হয়ে যায় CDN-এর IP, রেট লিমিট সবাইকে একজন ধরে, আর জিও-লজিক ভুল দেশ দেখায়।

CDN আসল ক্লায়েন্ট IP একটা হেডারে পাঠায়: স্ট্যান্ডার্ড `X-Forwarded-For` (কমা দিয়ে আলাদা চেইন), নতুন স্ট্যান্ডার্ড `Forwarded` (RFC 7239), বা ভেন্ডরের নিজস্ব হেডার (যেমন Cloudflare-এর `CF-Connecting-IP`)। nginx-এর realip মডিউল দিয়ে এটা `$remote_addr`-এ বসানো যায়:

```nginx
# Trust the header ONLY when the TCP peer is one of the CDN's ranges.
set_real_ip_from 173.245.48.0/20;     # example range; generate this list from the vendor's feed
set_real_ip_from 2400:cb00::/32;
real_ip_header X-Forwarded-For;
real_ip_recursive on;
```

<Callout type="danger">

**`set_real_ip_from 0.0.0.0/0` কখনো লিখবেন না।** তাহলে যে কেউ সরাসরি origin-এ এসে `X-Forwarded-For: 1.2.3.4` হেডার দিয়ে যেকোনো IP সেজে যেতে পারে: রেট লিমিট এড়াবে, IP ব্লক এড়াবে, অ্যাডমিন IP allowlist পার হয়ে যাবে। হেডারটা শুধু তখনই বিশ্বাস করুন যখন TCP কানেকশনটা নিজেই একটা বিশ্বস্ত প্রক্সি থেকে আসছে।

</Callout>

`real_ip_recursive on` কেন? `X-Forwarded-For` একটা চেইন: `client, proxy1, proxy2`। ক্লায়েন্ট নিজেই চেইনের শুরুতে মিথ্যা IP বসাতে পারে। `recursive on` দিয়ে nginx ডান দিক থেকে হাঁটে, বিশ্বস্ত IP গুলো বাদ দেয়, আর প্রথম অবিশ্বস্ত IP-কে ক্লায়েন্ট ধরে। এতে চেইনের বাঁদিকে ক্লায়েন্টের বানানো মান উপেক্ষিত হয়।

```text
illustrative: what the origin sees
TCP peer          : 172.68.10.5          (CDN edge, trusted)
X-Forwarded-For   : 10.0.0.1, 203.0.113.50
                     ^ client-forged      ^ added by the CDN edge: the real client

real_ip_recursive on  -> $remote_addr = 203.0.113.50   (correct)
real_ip_recursive off -> $remote_addr = 203.0.113.50   (last value; same here)
naive "first value"   -> 10.0.0.1                       (forged!)
```

অ্যাপ কোডেও একই নিয়ম: `X-Forwarded-For`-এর **প্রথম** মান পড়বেন না, ওটা ক্লায়েন্ট-নিয়ন্ত্রিত।

## Host হেডার ও SNI: origin-এর কাছে কী নাম যায়

এজ যখন origin-এ যায়, তাকে দুইটা নাম ঠিক করতে হয়:

1. **TLS SNI** — TLS হ্যান্ডশেকে কোন হোস্টনেম বলবে, যাতে origin সঠিক সার্টিফিকেট দেখায়
2. **HTTP `Host` হেডার** — origin-এর কোন ভার্চুয়াল হোস্ট রিকোয়েস্টটা সামলাবে

ভুল হলে খুব বিভ্রান্তিকর এরর আসে: origin ডিফল্ট সার্ভার ব্লকের পেজ দেখায়, ভুল সার্টিফিকেট দিয়ে TLS ভেরিফিকেশন ফেল করে, বা object storage "NoSuchBucket" বলে।

নিজের nginx এজে:

```nginx
location / {
    proxy_pass https://origin.baytalhikma.org;

    # Host the origin's virtual host expects.
    proxy_set_header Host baytalhikma.org;

    # Send SNI and verify the origin's certificate against that name.
    proxy_ssl_server_name on;
    proxy_ssl_name baytalhikma.org;
    proxy_ssl_verify on;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
}
```

nginx-এ `proxy_ssl_server_name` আর `proxy_ssl_verify` দুটোই ডিফল্টে **বন্ধ**। মানে কিছু না লিখলে nginx origin-এ SNI পাঠায় না আর origin-এর সার্টিফিকেট যাচাইও করে না। পরের চ্যাপ্টারে TLS-এর দুই অংশ নিয়ে বিস্তারিত।

Object storage origin-এ `Host` বিশেষ গুরুত্বপূর্ণ: bucket-টা প্রায়ই হোস্টনেম দিয়েই চেনা হয় (`media-bucket.s3.example-region.example.com`)। এজ যদি ইউজারের `Host` (`cdn.baytalhikma.org`) পাঠায়, storage বলবে এমন bucket নেই। ফলে `Host`-কে storage-এর হোস্টনেমে রিরাইট করতে হয়।

## Object storage যখন origin

স্ট্যাটিক ফাইল, ইমেজ, ভিডিও সেগমেন্ট, ডাউনলোডের জন্য origin হিসেবে অ্যাপ সার্ভারের চেয়ে S3-compatible object storage প্রায়ই ভালো: অসীম প্রায় জায়গা, ফাইল সার্ভ করার জন্য কোনো অ্যাপ প্রসেস লাগে না। সেলফ-হোস্টেড বিকল্পও আছে (MinIO, Garage, SeaweedFS), যা নিজের VPS-এ চালানো যায়।

খেয়াল রাখার বিষয়:

- **Bucket পাবলিক রাখবেন না।** CDN-কে signed রিকোয়েস্ট (S3 SigV4) দিয়ে পড়ার অনুমতি দিন, বা storage-এর পলিসিতে শুধু CDN-এর পরিচয় থেকে পড়া অনুমোদন করুন। নইলে কেউ সরাসরি bucket URL দিয়ে CDN পাশ কাটিয়ে আপনার egress বিল বাড়াতে পারে।
- **`Cache-Control` আপলোডের সময়ই বসান।** Storage রেসপন্সে সেই হেডার ফেরত দেয় যা অবজেক্টের মেটাডেটায় আছে। মেটাডেটা না থাকলে CDN নিজের ডিফল্ট TTL ব্যবহার করবে, যা আপনি চান না।
- **404 ক্যাশিং।** Storage-এ ফাইল না থাকলে 404 (বা অনেক সময় 403) আসে। CDN সেটা ক্যাশ করলে ফাইল আপলোডের পরও কিছুক্ষণ 404 দেখাবে। Negative TTL ছোট রাখুন।
- **Range রিকোয়েস্ট।** ভিডিও আর বড় ফাইলের জন্য storage-কে `Range` সাপোর্ট করতে হবে (প্রায় সবাই করে), আর CDN-কে range ঠিকভাবে ক্যাশ করতে হবে (চ্যাপ্টার ১০)।

```bash
# Upload with cache metadata (works with any S3-compatible endpoint)
aws s3 cp ./dist/app.4f2a.js s3://bth-static/app.4f2a.js \
  --endpoint-url https://storage.baytalhikma.org \
  --cache-control "public, max-age=31536000, immutable" \
  --content-type "application/javascript"
```

## Origin ফেইলওভার ও health check

একটা origin ডাউন হলে কী হবে? তিনটা উত্তর আছে, একসাথে ব্যবহার করা যায়:

1. **স্টেল কন্টেন্ট দিয়ে চালিয়ে যাওয়া** (`stale-if-error`, বা nginx-এর `proxy_cache_use_stale error`)। ক্যাশে যা আছে সেটা দিয়ে চলে; নতুন বা ডায়নামিক কিছু আসবে না।
2. **দ্বিতীয় origin-এ চলে যাওয়া।** CDN-কে প্রাইমারি আর ব্যাকআপ origin দিন। প্রাইমারি এরর বা টাইমআউট দিলে ব্যাকআপে যায়।
3. **Origin পুলের ভেতরে load balancing**, যেখানে health check করে অসুস্থ সার্ভার বাদ দেওয়া হয়।

```nginx
upstream origin_pool {
    server 198.51.100.10:443 max_fails=3 fail_timeout=15s;
    server 198.51.100.11:443 max_fails=3 fail_timeout=15s;
    server 203.0.113.20:443 backup;      # used only when both primaries are down
    keepalive 64;
}

location / {
    proxy_pass https://origin_pool;
    proxy_next_upstream error timeout http_502 http_503 http_504;
    proxy_next_upstream_tries 2;
    proxy_connect_timeout 3s;
    proxy_read_timeout 30s;
}
```

Open-source nginx-এর health check **প্যাসিভ**: আসল রিকোয়েস্ট ফেল হলে সার্ভারকে কিছুক্ষণের জন্য বাদ দেয়। অ্যাকটিভ health check (নিয়মিত একটা `/healthz` URL চেক করা) বেশিরভাগ ম্যানেজড CDN আর load balancer-এ থাকে।

<Callout type="warning">

`proxy_next_upstream`-এ `non_idempotent` যোগ করবেন না যদি না নিশ্চিত হন। ডিফল্টে nginx POST-এর মতো non-idempotent রিকোয়েস্ট অন্য সার্ভারে আবার পাঠায় না, কারণ প্রথম সার্ভার হয়তো পেমেন্টটা ইতিমধ্যে প্রসেস করে ফেলেছে, শুধু উত্তর দিতে দেরি করেছে। আবার পাঠালে ডাবল চার্জ।

</Callout>

### Health check endpoint কেমন হবে

- **হালকা।** প্রতি কয়েক সেকেন্ডে অনেক PoP থেকে আসে; একটা ভারী DB কুয়েরি চালালে health check নিজেই লোড তৈরি করবে।
- **সৎ।** শুধু "প্রসেস চলছে" না, অ্যাপ আসলে রিকোয়েস্ট সামলাতে পারে কিনা। কিন্তু একটা ঐচ্ছিক ডিপেন্ডেন্সি (ধরুন সার্চ সার্ভিস) ডাউন হলে পুরো origin-কে অসুস্থ ঘোষণা করবেন না; তাহলে সব origin একসাথে "অসুস্থ" হয়ে যাবে।
- **ক্যাশ হবে না।** `Cache-Control: no-store` দিন, নইলে CDN ক্যাশ থেকে health check-এর উত্তর দিয়ে যাবে।

## টাইমআউট আর keepalive

এজ থেকে origin-এ প্রতিটা নতুন TCP + TLS কানেকশন খুলতে কয়েকটা round trip লাগে। এজ আর origin দূরে হলে সেটা প্রতিটা MISS-এ শত মিলিসেকেন্ড যোগ করে। সমাধান: **কানেকশন রিইউজ**।

```nginx
upstream origin_pool {
    server 198.51.100.10:443;
    keepalive 64;              # idle connections kept open per worker
    keepalive_timeout 60s;
}

location / {
    proxy_pass https://origin_pool;
    proxy_http_version 1.1;    # default before nginx 1.29.7 was 1.0, which closes after each request
    proxy_set_header Connection "";
}
```

পুরনো nginx-এ শেষ দুই লাইন ছাড়া `keepalive` কাজ করে না: 1.29.7-এর আগে upstream ডিফল্ট ছিল HTTP/1.0, যা প্রতি রিকোয়েস্টে কানেকশন বন্ধ করে। নতুন ভার্সনে ডিফল্ট 1.1 (২০২৬ সালের অক্টোবরে nginx.org-এর ডকস অনুযায়ী), তবু লাইন দুটো রেখে দেওয়াই নিরাপদ, কারণ সার্ভারে কোন ভার্সন চলছে সেটা সবসময় নিশ্চিত থাকে না।

আরেকটা সূক্ষ্ম ফাঁদ হলো **origin-এর keepalive timeout এজের চেয়ে ছোট হওয়া**। Origin ধরুন ৫ সেকেন্ড পর idle কানেকশন বন্ধ করে, আর এজ সেটা ৬০ সেকেন্ড রাখে বলে ভাবে। এজ ঠিক যে মুহূর্তে একটা "বন্ধ" কানেকশনে রিকোয়েস্ট পাঠায়, origin সেটা রিসেট করে, আর ইউজার একটা বিক্ষিপ্ত 502 পায়। নিয়ম: **origin-এর idle timeout এজের idle timeout-এর চেয়ে বড় রাখুন।**

টাইমআউটের সাধারণ সেট:

| টাইমআউট | কী মাপে | সাধারণ শুরু (উদাহরণ) |
| --- | --- | --- |
| connect | TCP কানেকশন খুলতে কতক্ষণ | কয়েক সেকেন্ড |
| TLS handshake | হ্যান্ডশেক শেষ হতে | কয়েক সেকেন্ড |
| first byte / read | রেসপন্সের প্রথম বাইট আসতে | পেজ অনুযায়ী, ১০ থেকে ৬০ সেকেন্ড |
| idle | দুই রিকোয়েস্টের মাঝে কানেকশন খোলা রাখা | origin-এ এজের চেয়ে বেশি |

ম্যানেজড CDN-এর টাইমআউট প্রায়ই ঠিক করা থাকে বা প্ল্যান অনুযায়ী বদলায়। আপনার ভেন্ডরের "origin timeout" কত, ডকে দেখে নিন; একটা রিপোর্ট বানাতে যদি origin-এর তার চেয়ে বেশি সময় লাগে, ইউজার কখনো রিপোর্টটা দেখবে না, শুধু একটা 524 বা 504 দেখবে।

## পুরো ছবিটা

<Mermaid
title="একটা ভালোভাবে সাজানো origin"
code={`graph LR
  U["User"] --> E["Edge PoP"]
  E -->|"MISS"| S["Shield PoP"]
  S -->|"MISS, mTLS + allowlisted IP"| FW["Origin firewall"]
  FW --> LB["Origin pool"]
  LB --> A1["App 1"]
  LB --> A2["App 2"]
  LB -.->|"both down"| B["Backup origin"]
  S -.->|"origin error"| ST["Serve stale"]`}
/>

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

**লক্ষণ: CDN চালু, কিন্তু origin-এর লোড প্রায় কমেনি।**
নিশ্চিত করুন: origin-এর access log-এ কোন URL সবচেয়ে বেশি আসছে, আর কোন CDN IP থেকে।

```bash
awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20
awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20
```

একই URL শত শত আলাদা CDN IP থেকে আসলে shield নেই বা কাজ করছে না: shield/tiered cache চালু করুন। একই URL বারবার, কিন্তু অল্প কয়েকটা IP থেকে আসলে রেসপন্স ক্যাশই হচ্ছে না: হেডার দেখুন (চ্যাপ্টার ৩ ও ৫)।

**লক্ষণ: ডিপ্লয় বা পার্জের ঠিক পরে origin-এর CPU আকাশছোঁয়া, তারপর নিজে থেকেই ঠিক।**
নিশ্চিত করুন: পার্জের সময়ের লগে একই URL-এর জন্য একই সেকেন্ডে অনেক রিকোয়েস্ট।

```bash
grep '25/Oct/2026:10:15' /var/log/nginx/access.log | awk '{print $7}' | sort | uniq -c | sort -rn | head
```

সমাধান: নিজের এজে `proxy_cache_lock on` আর `proxy_cache_use_stale updating`; ম্যানেজড CDN-এ সব কিছু একবারে পার্জ না করে ট্যাগ বা প্রিফিক্স ধরে পার্জ করুন (চ্যাপ্টার ৬), আর shield চালু রাখুন।

**লক্ষণ: কেউ CDN পাশ কাটিয়ে সরাসরি origin-এ আসছে।**
নিশ্চিত করুন: বাইরের একটা মেশিন থেকে origin IP-তে সরাসরি রিকোয়েস্ট পাঠান।

```bash
curl -sk -o /dev/null -w '%{http_code}\n' --resolve baytalhikma.org:443:198.51.100.10 https://baytalhikma.org/
```

`200` এলে origin খোলা। আশা করা উত্তর হলো কানেকশন টাইমআউট (ফায়ারওয়াল), TLS হ্যান্ডশেক ফেল (mTLS), বা `403` (গোপন হেডার)। সমাধান: উপরের স্তরগুলো বসান, আর origin-এর IP বদলান যদি সেটা আগে থেকেই ফাঁস হয়ে থাকে।

**লক্ষণ: হঠাৎ সাইট পুরো ডাউন, origin সুস্থ, CDN 52x বা 502 দেখাচ্ছে।**
নিশ্চিত করুন: ফায়ারওয়ালের allowlist set খালি বা পুরনো কিনা।

```bash
sudo nft list set inet filter cdn_v4 | head
journalctl -u cdn-ranges-refresh --since "2 days ago"
```

সমাধান: রিফ্রেশ স্ক্রিপ্টে খালি-তালিকা গার্ড; ভেন্ডরের তালিকার সাথে মিলিয়ে set আবার লোড করুন।

**লক্ষণ: লগে সব রিকোয়েস্টের IP একই কয়েকটা CDN IP; বা উল্টো, লগে যেকোনো অদ্ভুত IP দেখা যাচ্ছে।**
নিশ্চিত করুন: `X-Forwarded-For` হেডার দিয়ে সরাসরি origin-এ রিকোয়েস্ট পাঠিয়ে দেখুন লগে কোন IP বসে।

```bash
curl -sk --resolve baytalhikma.org:443:198.51.100.10 -H 'X-Forwarded-For: 192.0.2.99' https://baytalhikma.org/ -o /dev/null
tail -1 /var/log/nginx/access.log
```

লগে `192.0.2.99` এলে realip সবাইকে বিশ্বাস করছে (বিপজ্জনক): `set_real_ip_from` শুধু CDN রেঞ্জে সীমাবদ্ধ করুন। লগে সবসময় CDN IP থাকলে realip কনফিগই নেই বা ভুল হেডারের নাম।

**লক্ষণ: বিক্ষিপ্ত, অল্প সংখ্যক 502, কোনো প্যাটার্ন নেই।**
নিশ্চিত করুন: এজ বা প্রক্সির error log-এ "upstream prematurely closed connection" বা "connection reset by peer" খুঁজুন।

```bash
grep -E 'prematurely closed|reset by peer' /var/log/nginx/error.log | tail
```

সমাধান: origin-এর keepalive/idle timeout এজের চেয়ে বড় করুন।

**লক্ষণ: object storage origin "NoSuchBucket", "SignatureDoesNotMatch" বা 403 দিচ্ছে।**
নিশ্চিত করুন: storage-এর হোস্টনেমে সরাসরি একই পাথ চেয়ে দেখুন, তারপর CDN কোন `Host` পাঠাচ্ছে তা দেখুন।

```bash
curl -sI https://bth-static.storage.baytalhikma.org/app.4f2a.js | head -5
```

সরাসরি কাজ করলে সমস্যা CDN-এর origin কনফিগে: `Host` হেডার storage-এর হোস্টনেমে রিরাইট করুন, আর private bucket হলে CDN-এর signing ক্রেডেনশিয়াল ঠিক আছে কিনা দেখুন।

## মূল শিক্ষা

1. **PoP যত বেশি, MISS তত ছড়ানো।** Origin shield সব এজের MISS এক জায়গায় জমা করে, আর দুই স্তরের hit ratio গুণ হয়ে origin-এর লোড অনেক কমিয়ে দেয়।
2. **Request collapsing ছাড়া প্রতিটা এক্সপায়ারি একটা ছোট stampede।** `proxy_cache_lock` আর `use_stale updating` একসাথে ব্যবহার করুন, আর লক টাইমআউট origin-এর আসল রেসপন্স টাইমের চেয়ে বড় রাখুন।
3. **ধরে নিন origin-এর IP ফাঁস হবে।** IP allowlist প্রথম স্তর; mTLS (নিজের জোনের সার্টিফিকেট) বা গোপন হেডার দ্বিতীয় স্তর।
4. **CDN-এর IP রেঞ্জ বদলায়।** স্ক্রিপ্ট দিয়ে ফেচ করুন, আর খালি তালিকা কখনো প্রয়োগ করবেন না।
5. **`X-Forwarded-For` শুধু বিশ্বস্ত প্রক্সি থেকে বিশ্বাস করুন।** প্রথম মানটা ক্লায়েন্টের হাতে বানানো হতে পারে।
6. **Host আর SNI আলাদা জিনিস।** nginx ডিফল্টে origin-এ SNI পাঠায় না আর সার্টিফিকেট যাচাই করে না; দুটোই নিজে চালু করুন।
7. **Origin-এর idle timeout এজের চেয়ে বড় রাখুন**, নইলে বিক্ষিপ্ত 502 আসবে যা খুঁজে পাওয়া কঠিন।
8. **Health check হালকা, সৎ আর ক্যাশ-বিহীন।** POST কখনো স্বয়ংক্রিয়ভাবে অন্য origin-এ রিট্রাই করবেন না।
