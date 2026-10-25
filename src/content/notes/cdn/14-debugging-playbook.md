---
title: 'CDN ডিবাগিং প্লেবুক'
subtitle: 'আন্দাজে কনফিগ না বদলে লেয়ার ধরে ধরে পরীক্ষা: আট ধাপের পদ্ধতি, প্রতিটা লক্ষণের সম্ভাব্য কারণ, নিশ্চিত করার কমান্ড আর সমাধান, সাথে একটা কপি-পেস্ট CDN-চেক স্ক্রিপ্ট।'
chapter: 14
level: 'mastery'
readingTime: '৩২ মিনিট'
topics: ['cdn debugging', 'troubleshooting', 'curl', 'cache miss', 'stale content', '5xx', 'cors', 'waf']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

মহাখালী বাস ডিপোর ওয়ার্কশপে দুইজন মেকানিক কাজ করেন। সকালে একটা বাস এসে থামল, ড্রাইভার বিরুনি বললেন, "রাস্তায় হঠাৎ হঠাৎ ইঞ্জিন বন্ধ হয়ে যাচ্ছে।" প্রথম মেকানিক কিন্দি কোনো প্রশ্ন না করেই ব্যাটারি খুলে নতুন একটা বসালেন, কারণ গত সপ্তাহে আরেকটা বাসে ব্যাটারিই সমস্যা ছিল। বাস বের হলো, দুপুরে আবার ফিরে এল। কিন্দি এবার ফুয়েল ফিল্টার বদলালেন, তারপর একটা সেন্সর। সন্ধ্যায় তিনটা পার্টস বদলানো শেষ, বাস এখনো থামছে, আর কেউ জানে না কোন বদলটা কাজে লেগেছিল বা লাগেনি।

দ্বিতীয় মেকানিক হাইসাম অন্যভাবে কাজ করেন। প্রথমে জিজ্ঞেস করেন: কখন বন্ধ হয়, গরম ইঞ্জিনে না ঠান্ডায়, চড়াইয়ে না সমতলে, বন্ধ হওয়ার আগে ড্যাশবোর্ডে কোনো বাতি জ্বলে কিনা। তারপর অংশ ধরে ধরে যান, আর প্রতিটা অংশ আলাদা করে পরীক্ষা করেন। ফুয়েল ট্যাংক থেকে পাম্পে তেল আসছে কিনা, পাইপ খুলে দেখেন। পাম্প থেকে ইঞ্জিনে চাপ ঠিক আছে কিনা, মিটার লাগিয়ে মাপেন। ব্যাটারির ভোল্টেজ, অল্টারনেটরের চার্জিং আলাদা আলাদা দেখেন। যে জায়গায় গিয়ে "এখান পর্যন্ত ঠিক, এর পরে ঠিক নেই" পাওয়া যায়, সমস্যা ঠিক সেই দুই অংশের মাঝখানে। হাইসাম একবারে একটাই জিনিস বদলান, আর বদলের পর আবার মাপেন।

আধা ঘণ্টায় হাইসাম পেলেন, ট্যাংক থেকে পাম্প পর্যন্ত তেল আসছে, কিন্তু পাম্পের পরের পাইপে একটা ফাটল, গরম হলে বাতাস ঢোকে। ব্যাটারি, ফিল্টার, সেন্সর সবই ঠিক ছিল।

মিলিয়ে নিই: কিন্দির "গতবার ব্যাটারি ছিল, এবারও ব্যাটারি" হলো **আন্দাজে ডিবাগিং**, যেমন সমস্যা দেখলেই "পুরো ক্যাশ পার্জ করে দাও"। তিনটা পার্টস একসাথে বদলানো হলো **একসাথে কয়েকটা কনফিগ বদলানো**, যার পর কোনটায় কাজ হলো কেউ জানে না। হাইসামের প্রশ্নগুলো হলো **লক্ষণ সংগ্রহ** (কোন URL, কোন অঞ্চল, কোন ব্রাউজার, কখন থেকে)। ট্যাংক থেকে ইঞ্জিন পর্যন্ত অংশ ধরে ধরে মাপা হলো **লেয়ার ধরে পরীক্ষা**: DNS → edge → ক্যাশ → ক্যাশ কী → origin → TLS → সিকিউরিটি লেয়ার। চাপের মিটার হলো **`curl -I` আর রেসপন্স হেডার**, আর "এখান পর্যন্ত ঠিক, এর পরে নয়" খোঁজা হলো **CDN দিয়ে আর CDN ছাড়া একই রিকোয়েস্ট পাঠিয়ে তুলনা করা**। এই চ্যাপ্টার সেই পদ্ধতিটাই লিখে রাখে।

## প্রথম নিয়ম: প্রমাণ, আন্দাজ নয়

CDN সমস্যায় তিনটা বাক্য সবচেয়ে বেশি সময় নষ্ট করে:

- **"পুরো ক্যাশ পার্জ করে দাও।"** এতে সমস্যা হয়তো চলে যায়, কিন্তু কেন হয়েছিল তার প্রমাণও মুছে যায়, আর origin-এ হঠাৎ সব ট্রাফিক এসে পড়ে। আগে প্রমাণ নিন (হেডার, `Age`, কোন edge), তারপর শুধু যা দরকার তা পার্জ করুন।
- **"আমার ব্রাউজারে তো ঠিক আছে।"** আপনার ব্রাউজারের নিজের ক্যাশ আছে, আপনার DNS resolver আপনাকে একটা নির্দিষ্ট PoP-এ পাঠায়, আপনি হয়তো লগইন করা। ইউজার এর প্রতিটায় আলাদা হতে পারে।
- **"CDN-এর সমস্যা।"** অনেক সময় না। CDN প্রায়ই শুধু origin-এর ভুলটা হাজার গুণ বড় করে দেখায়: origin একবার ভুল হেডার পাঠাল, CDN সেটা সবাইকে দিল।

<Callout type="tip">

**ব্রাউজারকে প্রমাণ হিসেবে ব্যবহার করবেন না, `curl` করুন।** ব্রাউজারের নিজের ক্যাশ, service worker, এক্সটেনশন, HSTS আর কুকি প্রতিটা রেসপন্সকে বদলে দিতে পারে। DevTools-এর Network ট্যাবে "Disable cache" চালু করে দেখা চলে, কিন্তু চূড়ান্ত প্রমাণ `curl`-এর আউটপুট।

</Callout>

### লক্ষণ সংগ্রহের চেকলিস্ট

কমান্ড চালানোর আগে এই উত্তরগুলো লিখে নিন:

1. **ঠিক কোন URL?** পুরো URL, query string সহ। `/app.css` আর `/app.css?v=2` CDN-এর কাছে দুইটা আলাদা জিনিস হতে পারে।
2. **কী ভুল?** পুরনো কন্টেন্ট, ভুল কন্টেন্ট, এরর কোড (ঠিক কোনটা), ধীর, নাকি ব্রাউজার কনসোলে CORS বা mixed content এরর?
3. **কে দেখছে?** সবাই, নাকি একটা দেশ, একটা ISP, শুধু লগইন করা ইউজার, শুধু মোবাইল?
4. **কখন থেকে?** কোনো ডিপ্লয়, CDN কনফিগ বদল, সার্টিফিকেট রিনিউ, বা DNS বদলের পর থেকে?
5. **সবসময়, নাকি মাঝে মাঝে?** মাঝে মাঝে হলে প্রায়ই সমস্যা একটা নির্দিষ্ট PoP-এ, বা কয়েকটা origin সার্ভারের একটায়।

## আট ধাপের পদ্ধতি

<Mermaid
title="CDN debugging decision path"
code={`graph TD
  S["Symptom reported"] --> Q1{"1. Is it the CDN at all?<br/>same request straight to origin"}
  Q1 -->|"origin also broken"| ORIG["Fix the origin first"]
  Q1 -->|"origin fine, CDN broken"| Q2{"2. DNS: does the name<br/>point at the CDN?"}
  Q2 -->|"no / old IP"| FIXD["Fix DNS / proxy toggle,<br/>wait for TTL"]
  Q2 -->|"yes"| Q3{"3. Which edge answers?<br/>one PoP or all?"}
  Q3 -->|"one PoP only"| FIXP["PoP-specific: purge missed,<br/>regional origin, report to CDN"]
  Q3 -->|"everywhere"| Q4{"4. Cache state headers:<br/>HIT / MISS / Age?"}
  Q4 -->|"wrong content on HIT"| Q5{"5. Cache key and Vary:<br/>what made two requests equal?"}
  Q4 -->|"always MISS"| Q6{"6. Origin response headers:<br/>Cache-Control, Set-Cookie, Vary"}
  Q4 -->|"error status"| Q7{"7. TLS and protocol:<br/>edge to origin handshake"}
  Q7 -->|"TLS fine"| Q8{"8. Security layer:<br/>WAF, rate limit, bot rules"}
  Q5 --> FIXK["Fix key / Vary / bypass"]
  Q6 --> FIXH["Fix origin headers"]
  Q8 --> FIXW["Adjust rule, allowlist"]`}
/>

পদ্ধতির মূল কথা: **একই রিকোয়েস্ট দুই জায়গায় পাঠান, আর দেখুন কোথায় উত্তর বদলায়।** CDN দিয়ে, CDN ছাড়া; এই PoP, ওই PoP; কুকি সহ, কুকি ছাড়া; `Accept-Encoding` সহ, ছাড়া। যেখানে উত্তর বদলায়, সমস্যা সেখানেই।

### ধাপ ১: সমস্যা কি আদৌ CDN-এ?

origin-এ সরাসরি একই রিকোয়েস্ট পাঠান, কিন্তু আসল hostname রেখে, যাতে Host হেডার, SNI আর সার্টিফিকেট যাচাই সব একই থাকে। `curl`-এর দুটো অপশন এটা করে:

```bash
# Pretend DNS returned the origin IP for this host
curl -sI --resolve baytalhikma.org:443:198.51.100.10 https://baytalhikma.org/pricing

# Same idea, but redirect the connection only (works with any port/host pair)
curl -sI --connect-to baytalhikma.org:443:198.51.100.10:443 https://baytalhikma.org/pricing
```

origin-ও একই ভুল দিলে CDN নির্দোষ; origin ঠিক করুন। origin ঠিক দিলে কিন্তু CDN দিয়ে ভুল, তাহলে সমস্যা CDN লেয়ারে, পরের ধাপে যান। origin সরাসরি রিকোয়েস্ট না নিলে (ভালো, কারণ origin শুধু CDN-এর IP থেকে নেওয়া উচিত), একটা অনুমোদিত মেশিন থেকে চালান, বা origin-এর ভেতর থেকে `curl -H 'Host: baytalhikma.org' http://127.0.0.1:8080/pricing`।

### ধাপ ২: DNS — আপনি কি আদৌ CDN-এ পৌঁছাচ্ছেন?

```bash
dig +short baytalhikma.org
dig +short www.baytalhikma.org CNAME
```

উত্তর origin-এর IP হলে ট্রাফিক CDN-কে পাশ কাটাচ্ছে: হয় DNS রেকর্ড CDN-এ পয়েন্ট করা হয়নি, হয় প্রক্সি টগল বন্ধ, নয়তো পুরনো রেকর্ড এখনো ক্যাশে। CNAME CDN-এর হোস্টনেমে গেলে বা IP CDN-এর রেঞ্জে হলে ঠিক আছে। DNS-এর পুরো ডিবাগিং আছে [DNS ডিবাগিং প্লেবুক](/notes/dns/14-debugging-playbook)-এ।

### ধাপ ৩: কোন edge উত্তর দিচ্ছে?

প্রায় সব CDN কোনো না কোনো হেডারে PoP-এর পরিচয় দেয়। নিচের আউটপুট দুইটা আসল পাবলিক সাইট থেকে ঢাকা থেকে নেওয়া (২০২৬ সালের অক্টোবর; লম্বা লাইন ছোট করা):

```text
# Cloudflare: last three letters of cf-ray are the PoP (IATA airport code)
cf-ray: a4fe7587c8cd5853-DAC

# Fastly: every cache layer that touched the response, plus HIT/MISS per layer
x-served-by: cache-sin-wsss1830021-SIN, cache-sin-wsss1830021-SIN, cache-sin-wsss1830058-SIN, cache-ccu830031-...
x-cache: MISS, HIT, HIT
```

দ্বিতীয় উদাহরণটা খুব শিক্ষণীয়: রিকোয়েস্ট কয়েকটা ক্যাশ সার্ভার পেরিয়েছে (নামের `sin` আর `ccu` হলো সিঙ্গাপুর আর কলকাতার এয়ারপোর্ট কোড), আর `x-cache`-এ লেয়ার ধরে ধরে HIT/MISS আছে। এটাই tiered caching বা shield (চ্যাপ্টার ৭)। ভেন্ডরভেদে হেডারের নাম আর ক্রম আলাদা; নিজের CDN-এর ডকস দেখে নিন।

সমস্যা শুধু একটা অঞ্চলে হলে নির্দিষ্ট PoP-এ রিকোয়েস্ট পাঠিয়ে তুলনা করুন: সেই অঞ্চলের একটা VPS থেকে `curl` চালান, অথবা সেই PoP-এর IP জানা থাকলে `--resolve` দিয়ে।

### ধাপ ৪: ক্যাশ স্টেট হেডার

একই URL দুইবার চান, এক সেকেন্ড ব্যবধানে:

```bash
for i in 1 2; do curl -sI https://baytalhikma.org/app.3f9a.css | grep -iE 'cache-status|x-cache|^age'; sleep 1; done
```

| দেখছেন                              | অর্থ                                                     |
| ----------------------------------- | -------------------------------------------------------- |
| MISS তারপর HIT, `Age` বাড়ছে          | স্বাভাবিক                                               |
| সবসময় MISS, `Age` নেই বা 0          | CDN স্টোর করছে না; ধাপ ৬                                 |
| HIT, কিন্তু কন্টেন্ট ভুল/পুরনো         | ভুল জিনিস স্টোর হয়েছে, বা দুইটা আলাদা জিনিস এক key-তে; ধাপ ৫ |
| `Age` TTL-এর চেয়ে বড়                 | stale সার্ভ হচ্ছে (origin সমস্যায়, বা `stale-while-revalidate`) |
| `DYNAMIC`, `BYPASS`, `PASS`          | CDN নিয়ম অনুযায়ী ক্যাশই করছে না                         |

স্ট্যান্ডার্ড হেডার `Cache-Status` (RFC 9211) সব CDN দেয় না; অনেকে নিজের হেডার দেয় (`cf-cache-status`, `x-cache`)। মানগুলোর পুরো ব্যাখ্যা চ্যাপ্টার ৫-এ।

### ধাপ ৫: ক্যাশ কী আর `Vary`

HIT কিন্তু ভুল কন্টেন্ট মানে প্রায় সবসময়: দুইটা রিকোয়েস্ট যেগুলোর আলাদা উত্তর পাওয়া উচিত, CDN সেগুলোকে একই key ধরেছে। খুঁজুন origin রেসপন্সে কোন হেডারের ওপর নির্ভর করে (Cookie, Accept-Language, Accept-Encoding, Origin, ডিভাইস টাইপ), আর সেটা ক্যাশ কী বা `Vary`-তে আছে কিনা।

```bash
curl -s https://baytalhikma.org/ -H 'Accept-Language: bn' | grep -o '<html lang="[a-z]*"'
curl -s https://baytalhikma.org/ -H 'Accept-Language: en' | grep -o '<html lang="[a-z]*"'
```

দুইটাই একই ভাষা দিলে, আর origin সরাসরি আলাদা দেয়, তাহলে ক্যাশ কী ভাষা আলাদা করছে না। চ্যাপ্টার ৪-এ পুরো আলোচনা।

### ধাপ ৬: origin-এর রেসপন্স হেডার

CDN প্রায় সবসময় origin যা বলে তাই মানে। origin-এর আসল হেডার দেখুন (ধাপ ১-এর কমান্ড দিয়ে) আর এগুলো খুঁজুন:

```text
cache-control: private            -> shared caches must not store it
cache-control: no-store           -> nobody stores it
cache-control: max-age=0          -> stored but stale immediately; revalidated every time
set-cookie: ...                   -> many CDNs refuse to cache (or strip it)
vary: *                           -> effectively uncacheable
vary: User-Agent                  -> thousands of variants, near-zero hit ratio
```

### ধাপ ৭: TLS আর প্রোটোকল

edge থেকে origin-এ TLS আলাদা একটা হ্যান্ডশেক। ইউজার আর edge-এর মাঝে সব ঠিক থাকলেও এখানে ভাঙতে পারে: origin-এর সার্টিফিকেট এক্সপায়ার, intermediate মিসিং, SNI না মেলা।

```bash
openssl s_client -connect 198.51.100.10:443 -servername baytalhikma.org -brief </dev/null
```

`Verification: OK` আর সঠিক `Peer certificate` দেখতে চান। ভেরিফিকেশন এরর মানে CDN-এর "strict" TLS মোডে origin ফেল করবে।

### ধাপ ৮: সিকিউরিটি লেয়ার

403, 429, বা একটা চ্যালেঞ্জ পেজ, যেটা origin কখনো পাঠায় না, মানে CDN-এর WAF, রেট লিমিট বা বট নিয়ম রিকোয়েস্ট আটকেছে। রেসপন্সের বডিতে প্রায়ই CDN-এর ব্র্যান্ডিং আর একটা রে/রিকোয়েস্ট ID থাকে; সেই ID দিয়ে CDN-এর ড্যাশবোর্ডের সিকিউরিটি লগে খুঁজলে ঠিক কোন নিয়ম ধরেছে দেখা যায়।

## কপি-পেস্ট CDN-চেক স্ক্রিপ্ট

শুধু `dig` আর `curl` লাগে, কিছু বদলায় না। একটা URL দিন, চাইলে origin-এর IP-ও:

```bash
#!/usr/bin/env bash
# cdn-check.sh URL [ORIGIN_IP]
# Read-only: DNS target, edge cache state across two requests, cache headers,
# optional origin comparison, and a timing breakdown. Needs only dig and curl.
set -uo pipefail
url="${1:?usage: cdn-check.sh URL [ORIGIN_IP]}"
origin_ip="${2:-}"
host=$(printf '%s' "$url" | sed -E 's#^[a-z]+://##; s#[/:?].*$##')
hdrs='^(age|cache-control|cdn-cache-control|surrogate-control|cache-status|x-cache|x-cache-status|cf-cache-status|x-served-by|server|via|vary|etag|last-modified|expires|set-cookie|content-encoding|location|cf-ray|x-amz-cf-pop):'

echo "== DNS: $host"
dig +noall +answer "$host" A | cut -c1-110 | sed 's/^/   /'
dig +noall +answer "$host" AAAA | cut -c1-110 | sed 's/^/   /'

for n in 1 2; do
  echo "== Edge request $n"
  curl -s -o /dev/null -D - -H 'Accept-Encoding: br, gzip' "$url" \
    | tr -d '\r' | grep -iE "^HTTP/|$hdrs" | cut -c1-110 | sed 's/^/   /'
  sleep 1
done

if [[ -n "$origin_ip" ]]; then
  echo "== Origin direct ($origin_ip), bypassing the CDN"
  out=$(curl -sk -m 10 -o /dev/null -D - --connect-to "$host:443:$origin_ip:443" "$url" | tr -d '\r')
  if [[ -z "$out" ]]; then
    echo "   no response: origin refused, timed out, or blocks non-CDN IPs"
  else
    printf '%s\n' "$out" | grep -iE "^HTTP/|$hdrs" | cut -c1-110 | sed 's/^/   /'
  fi
fi

echo "== Timing (seconds)"
curl -s -o /dev/null -H 'Accept-Encoding: br, gzip' -w \
'   dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}
   remote_ip=%{remote_ip} http=%{http_version} status=%{http_code} size=%{size_download}\n' "$url"
```

একটা পাবলিক সাইটে চালানোর আসল আউটপুট (ঢাকা থেকে, ২০২৬ সালের অক্টোবর; কুকির মান ছোট করা):

```text
$ ./cdn-check.sh https://www.cloudflare.com/favicon.ico
== DNS: www.cloudflare.com
   www.cloudflare.com.	294	IN	A	104.16.123.96
   www.cloudflare.com.	294	IN	A	104.16.124.96
   www.cloudflare.com.	185	IN	AAAA	2606:4700::6810:7c60
== Edge request 1
   HTTP/2 200
   cf-cache-status: HIT
   cache-control: public, max-age=0, must-revalidate
   vary: accept-encoding
   set-cookie: __cf_bm=RbAJqv67...; HttpOnly; SameSite=None; Secure; Path=/; Domain=www.cloudflare.com
   etag: W/"d8b839e4b38223847e40cfad151520d4"
   content-encoding: br
   server: cloudflare
   cf-ray: a4fe7587c8cd5853-DAC
== Edge request 2
   HTTP/2 200
   cf-cache-status: HIT
   ...
   cf-ray: a4fe758e98098dfd-DAC
== Timing (seconds)
   dns=0.003820 connect=0.012495 tls=0.189466 ttfb=0.216433 total=0.216976
   remote_ip=104.16.124.96 http=2 status=200 size=912
```

কী পড়তে হবে:

- **DNS** CDN-এর রেঞ্জের IP দিচ্ছে, তাই ট্রাফিক CDN-এ যাচ্ছে।
- **HIT দুইবারই, `DAC` PoP** (ঢাকা)। লক্ষ করুন, `set-cookie` থাকার পরও HIT: এই কুকি CDN-এর বট-সুরক্ষা লেয়ার edge-এ যোগ করছে, origin-এর রেসপন্সের অংশ নয়। তাই "রেসপন্সে Set-Cookie আছে মানে ক্যাশ হচ্ছে না" সবসময় সত্য নয়; কে কুকিটা বসাচ্ছে সেটা দেখতে হয়।
- **`max-age=0, must-revalidate`** সত্ত্বেও HIT: CDN-এর নিজের edge TTL নিয়ম (বা `CDN-Cache-Control`) ব্রাউজারের জন্য পাঠানো `Cache-Control` থেকে আলাদা হতে পারে।
- **টাইমিং:** `connect` ১২ ms (PoP কাছেই), কিন্তু `tls` ১৯০ ms পর্যন্ত গেছে। TLS হ্যান্ডশেক পুরো সময়ের বেশিরভাগ; বারবার নতুন কানেকশন হলে এটাই সময় খায়।

টাইমিং লাইনের প্রতিটা সংখ্যা **শুরু থেকে মোট সময়**, আলাদা ধাপের নয়। তাই TLS-এর আসল সময় = `tls − connect`, আর server-এর চিন্তার সময় মোটামুটি `ttfb − tls`। MISS-এ `ttfb` বড় আর HIT-এ ছোট হলে origin ধীর; HIT-এও বড় হলে সমস্যা নেটওয়ার্ক বা edge-এ।

## লক্ষণ থেকে সমাধান: পূর্ণ ক্যাটালগ

### ১. ডিপ্লয়ের পর পুরনো কন্টেন্ট আসছে

**সম্ভাব্য কারণ:** ফাইলের নাম একই (`app.css`), আর CDN আর ব্রাউজার দুজনেই TTL পর্যন্ত পুরনো কপি রাখছে। HTML ক্যাশ হয়ে আছে, যেটা পুরনো ফাইলের নামগুলো দেখায়।

**নিশ্চিত করুন:**

```bash
curl -sI https://baytalhikma.org/ | grep -iE 'age|cache-control|cache-status|last-modified|etag'
```

`Age` বড় আর `last-modified` ডিপ্লয়ের আগের হলে CDN পুরনো কপি দিচ্ছে। `curl`-এ নতুন কিন্তু ব্রাউজারে পুরনো হলে ব্রাউজারের ক্যাশ।

**সমাধান:** স্ট্যাটিক ফাইলে হ্যাশসহ নাম (`app.3f9a.css`) আর `max-age=31536000, immutable`; HTML-এ ছোট TTL বা `no-cache` (মানে প্রতিবার revalidate, না যে স্টোরই হবে না)। ডিপ্লয় পাইপলাইনে HTML-এর পার্জ যোগ করুন। চ্যাপ্টার ৬ দেখুন।

### ২. সবসময় MISS

**সম্ভাব্য কারণ:** origin `Set-Cookie`, `private`, `no-store`, বা `Vary: *` পাঠাচ্ছে; প্রতিটা রিকোয়েস্টে আলাদা query string (ট্র্যাকিং প্যারামিটার, `?_=timestamp`); CDN-এর নিয়মে এই path ক্যাশযোগ্যই নয় (অনেক CDN ডিফল্টে শুধু কিছু এক্সটেনশন ক্যাশ করে, HTML নয়); ট্রাফিক এত কম যে প্রতিটা PoP-এ প্রথমবারই আসছে।

**নিশ্চিত করুন:** ধাপ ৪-এর লুপ চালান, তারপর origin-এর হেডার দেখুন:

```bash
curl -sI --connect-to baytalhikma.org:443:198.51.100.10:443 https://baytalhikma.org/blog/ \
  | grep -iE 'cache-control|set-cookie|vary|expires'
```

**সমাধান:** origin থেকে সঠিক `Cache-Control` পাঠান; স্ট্যাটিক path-এ কুকি বন্ধ করুন; ক্যাশ কী থেকে অপ্রয়োজনীয় query প্যারামিটার বাদ দিন (`utm_*`, `fbclid`); CDN-এ ওই path-এর জন্য ক্যাশ নিয়ম যোগ করুন। কম ট্রাফিকের সাইটে origin shield চালু করলে প্রতিটা PoP-এর MISS অন্তত shield থেকে মেটে।

### ৩. HIT, কিন্তু ভুল কন্টেন্ট

**সম্ভাব্য কারণ:** ক্যাশ কী এমন কোনো তথ্য বাদ দিচ্ছে যার ওপর রেসপন্স নির্ভর করে: ভাষা, দেশ, ডিভাইস, `Accept-Encoding`, `Host` (একাধিক ডোমেইন একই key-তে)। origin একবার একটা এরর পেজ 200 দিয়ে পাঠিয়েছিল, সেটা ক্যাশ হয়ে গেছে।

**নিশ্চিত করুন:** ধাপ ৫-এর মতো একটা হেডার বদলে দুইবার চান, আর origin-এর সাথে তুলনা করুন। বডির hash তুলনা করা সবচেয়ে নির্ভরযোগ্য:

```bash
curl -s https://baytalhikma.org/ | sha256sum
curl -s --connect-to baytalhikma.org:443:198.51.100.10:443 https://baytalhikma.org/ | sha256sum
```

**সমাধান:** যে হেডারের ওপর রেসপন্স নির্ভর করে, সেটা `Vary`-তে বা CDN-এর ক্যাশ কী-তে যোগ করুন; অথবা ভিন্নতাটা URL-এ আনুন (`/bn/`, `/en/`)। এরর পেজ সবসময় সঠিক স্ট্যাটাস কোড দিয়ে পাঠান।

### ৪. এক ইউজারের প্রাইভেট পেজ আরেকজন দেখছে

**এটা ইনসিডেন্ট, বাগ নয়।** সাথে সাথে সেই path-এ ক্যাশিং বন্ধ করুন আর পার্জ করুন, তারপর তদন্ত।

**সম্ভাব্য কারণ:** লগইন করা পেজ `public` বা `s-maxage` দিয়ে পাঠানো হচ্ছে; CDN-এ "সব ক্যাশ করো" ধরনের নিয়ম (cache everything) HTML-এও লেগেছে; origin কুকি দেখে আলাদা কন্টেন্ট দেয় কিন্তু কুকি ক্যাশ কী-তে নেই; কেউ `proxy_ignore_headers Set-Cookie`-এর মতো নিয়ম ডায়নামিক ডোমেইনে বসিয়েছে।

**নিশ্চিত করুন:** লগইন করা কুকি দিয়ে চেয়ে দেখুন HIT আসে কিনা:

```bash
curl -sI https://baytalhikma.org/account -H 'Cookie: session=REDACTED' | grep -iE 'cache-status|x-cache|age|cache-control'
```

ব্যক্তিগত কন্টেন্টে HIT বা শূন্যের বেশি `Age` মানেই সমস্যা নিশ্চিত।

**সমাধান:** প্রতিটা ব্যক্তিগত রেসপন্সে `Cache-Control: private, no-store`; CDN-এ লগইন কুকি থাকলে বাইপাস নিয়ম; "cache everything" নিয়ম শুধু নির্দিষ্ট স্ট্যাটিক path-এ। এটা ঘটলে কোন ডেটা কতক্ষণ, কার কাছে গেছে তা লগ থেকে বের করুন; আইনি দিকও থাকতে পারে। চ্যাপ্টার ৯ আর ১২ দেখুন।

### ৫. 502, 503, 504

**সম্ভাব্য কারণ:**

| কোড | সাধারণত মানে                                                                 |
| --- | ---------------------------------------------------------------------------- |
| 502 | edge origin থেকে অবৈধ বা কোনো উত্তরই পায়নি (crash, কানেকশন রিসেট, TLS ভাঙা)    |
| 503 | origin বা CDN বলছে "এখন পারছি না" (ওভারলোড, মেইনটেন্যান্স, কোনো সুস্থ origin নেই) |
| 504 | edge origin-এ কানেকশন পেয়েছে, কিন্তু সময়ের মধ্যে উত্তর আসেনি                   |

**নিশ্চিত করুন:** এরর CDN দিচ্ছে না origin? বডি আর `server` হেডার দেখুন; CDN-এর এরর পেজে সাধারণত CDN-এর ব্র্যান্ডিং আর একটা রিকোয়েস্ট ID থাকে। তারপর ধাপ ১: origin সরাসরি কী দেয়, আর কত সময়ে:

```bash
curl -s -o /dev/null -w 'status=%{http_code} ttfb=%{time_starttransfer}\n' \
  --connect-to baytalhikma.org:443:198.51.100.10:443 https://baytalhikma.org/report
```

**সমাধান:** origin সরাসরিও ধীর বা ভাঙা হলে origin ঠিক করুন। ধীর এন্ডপয়েন্ট (রিপোর্ট, এক্সপোর্ট) CDN-এর টাইমআউটের চেয়ে বেশি সময় নিলে সেটাকে ব্যাকগ্রাউন্ড জবে নিন। origin-এর ফায়ারওয়াল CDN-এর IP আটকাচ্ছে কিনা দেখুন। `stale-if-error` বা `proxy_cache_use_stale` দিয়ে origin সমস্যার সময় পুরনো কপি দেওয়া যায়।

### ৬. ভেন্ডরের নিজস্ব 52x কোড (Cloudflare উদাহরণ)

কিছু CDN সাধারণ 502-কে আরও ভেঙে বলে। Cloudflare-এর ডকস অনুযায়ী (২০২৬ সালের অক্টোবর, নিজে [ডকসে](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/) মিলিয়ে নিন):

| কোড | Cloudflare-এর বর্ণনা               | প্রথমে কী দেখবেন                                                         |
| --- | ---------------------------------- | ------------------------------------------------------------------------- |
| 520 | origin খালি, অজানা বা অপ্রত্যাশিত উত্তর দিয়েছে | origin crash, Cloudflare IP আটকানো, অনেক বড় হেডার (প্রায়ই অতিরিক্ত কুকি)   |
| 521 | web server ডাউন                    | origin কানেকশন রিফিউজ করছে: সার্ভিস বন্ধ, বা ফায়ারওয়াল                     |
| 522 | কানেকশন টাইমআউট                    | TCP হ্যান্ডশেকই হয়নি: ফায়ারওয়াল বা রেট লিমিট Cloudflare IP ফেলে দিচ্ছে, origin ওভারলোড, DNS-এ ভুল origin IP |
| 523 | origin পৌঁছানো যাচ্ছে না           | রাউটিং বা DNS: origin-এর IP ভুল বা পৌঁছানো যায় না                           |
| 524 | টাইমআউট হয়েছে                     | কানেকশন হয়েছে, কিন্তু origin ডিফল্ট ১২৫ সেকেন্ডের মধ্যে HTTP উত্তর দেয়নি   |
| 525 | SSL হ্যান্ডশেক ব্যর্থ              | origin-এ 443-এ TLS নেই, বা cipher/SNI মেলেনি                                |
| 526 | অবৈধ SSL সার্টিফিকেট               | "Full (strict)" মোডে origin-এর সার্টিফিকেট যাচাই হয়নি: এক্সপায়ার, self-signed, hostname মেলে না, chain অসম্পূর্ণ |

অন্য CDN-গুলো প্রায়ই সাধারণ 502/503/504 দেয়, আর আসল কারণ লগে বা একটা ডিবাগ হেডারে থাকে।

### ৭. রিডাইরেক্ট লুপ (`ERR_TOO_MANY_REDIRECTS`)

**সম্ভাব্য কারণ:** সবচেয়ে প্রচলিত কারণটা: CDN origin-এর সাথে HTTP-তে কথা বলে ("flexible" ধরনের TLS মোড), আর origin সব HTTP রিকোয়েস্টকে HTTPS-এ রিডাইরেক্ট করে। ইউজার HTTPS-এ আসে, CDN HTTP-তে origin-এ যায়, origin বলে "HTTPS-এ যাও", CDN সেটা ইউজারকে দেয়, আর চক্র চলতে থাকে। আরেক কারণ: CDN আর origin দুজনেই `www` আর non-`www`-এর মধ্যে উল্টো দিকে রিডাইরেক্ট করে।

**নিশ্চিত করুন:**

```bash
curl -sIL --max-redirs 5 https://baytalhikma.org/ | grep -iE '^HTTP/|^location'
```

একই `location` বারবার ফিরে এলে লুপ নিশ্চিত।

**সমাধান:** origin-এ সঠিক সার্টিফিকেট বসিয়ে CDN-কে origin-এর সাথে HTTPS-এ কথা বলতে দিন ("full strict" ধরনের মোড)। অথবা origin-কে `X-Forwarded-Proto` দেখে রিডাইরেক্টের সিদ্ধান্ত নিতে বলুন। রিডাইরেক্ট নিয়ম এক জায়গায় রাখুন, দুই জায়গায় নয়। চ্যাপ্টার ৮ দেখুন।

### ৮. CORS এরর শুধু CDN দিয়ে, origin সরাসরি ঠিক

**সম্ভাব্য কারণ:** origin `Access-Control-Allow-Origin` হেডার রিকোয়েস্টের `Origin` অনুযায়ী আলাদা দেয়, কিন্তু `Vary: Origin` পাঠায় না। প্রথম রিকোয়েস্ট এসেছিল `cordoba.example` থেকে, সেই উত্তর ক্যাশ হলো, এখন `baytalhikma.org` থেকে আসা রিকোয়েস্ট পাচ্ছে `Access-Control-Allow-Origin: https://cordoba.example`। অথবা প্রথম রিকোয়েস্টে `Origin` ছিলই না, আর CORS হেডার ছাড়া উত্তর ক্যাশ হয়েছে।

**নিশ্চিত করুন:**

```bash
curl -sI https://cdn.baytalhikma.org/api/config.json -H 'Origin: https://baytalhikma.org' | grep -iE 'access-control|vary|cache-status|age'
curl -sI https://cdn.baytalhikma.org/api/config.json -H 'Origin: https://cordoba.example' | grep -iE 'access-control|vary|cache-status|age'
```

দুইটায় একই `access-control-allow-origin` আর HIT হলে ক্যাশ CORS মিশিয়ে ফেলেছে।

**সমাধান:** origin থেকে `Vary: Origin` পাঠান (এবং নিশ্চিত হন CDN সেটা মানে), অথবা পাবলিক রিসোর্সে সব origin-এর জন্য একই উত্তর দিন (`Access-Control-Allow-Origin: *`, কুকি ছাড়া)। পার্জ করে নতুন নিয়ম কার্যকর করুন।

### ৯. ফন্ট আটকে যাচ্ছে

**সম্ভাব্য কারণ:** ব্রাউজার আলাদা ডোমেইন থেকে ফন্ট লোড করতে CORS চায়। CDN ডোমেইন (`cdn.baytalhikma.org`) থেকে ফন্ট আসছে কিন্তু `Access-Control-Allow-Origin` নেই, অথবা আগের সমস্যার মতো CORS হেডার ছাড়া কপি ক্যাশ হয়েছে।

**নিশ্চিত করুন:** ব্রাউজার কনসোলে "has been blocked by CORS policy" আর ফন্টের URL। তারপর উপরের মতো `curl -sI … -H 'Origin: …'`।

**সমাধান:** ফন্টে `Access-Control-Allow-Origin` (নিজের ডোমেইন বা `*`) আর প্রয়োজনে `Vary: Origin`; অথবা ফন্ট পেজের নিজের ডোমেইন থেকে দিন।

### ১০. Mixed content

**সম্ভাব্য কারণ:** HTTPS পেজ HTTP URL থেকে কিছু লোড করছে। প্রায়ই origin HTTP-তে কথা বলে (CDN-এর পেছনে), তাই অ্যাপ নিজেকে HTTP ভাবে আর `http://` দিয়ে absolute URL বানায়।

**নিশ্চিত করুন:**

```bash
curl -s https://baytalhikma.org/ | grep -o 'http://[^"'"'"' ]*' | sort -u | head
```

**সমাধান:** অ্যাপকে `X-Forwarded-Proto` বিশ্বাস করতে বলুন (শুধু CDN-এর IP থেকে আসা রিকোয়েস্টে), অথবা relative / `https://` URL ব্যবহার করুন। CDN-এর "automatic HTTPS rewrite" ধরনের ফিচার সাময়িক সমাধান, স্থায়ী নয়।

### ১১. শুধু একটা অঞ্চলে ধীর

**সম্ভাব্য কারণ:** ইউজাররা দূরের PoP-এ যাচ্ছে (তাদের DNS resolver অন্য দেশে, বা ISP-এর রাউটিং অদ্ভুত); সেই PoP-এ hit ratio কম, তাই বারবার দূরের origin-এ যাচ্ছে; origin একটা অঞ্চলেই, আর shield নেই।

**নিশ্চিত করুন:** সেই অঞ্চলের একটা মেশিন থেকে স্ক্রিপ্ট চালান আর PoP কোড দেখুন। ঢাকার ইউজার যদি ইউরোপের PoP-এ যায়, সেটা স্টিয়ারিংয়ের সমস্যা। HIT-এ দ্রুত কিন্তু MISS-এ খুব ধীর হলে origin-এর দূরত্ব।

```bash
# run from a VPS in the affected region
for i in 1 2 3; do curl -s -o /dev/null -w '%{time_connect} %{time_starttransfer}\n' https://baytalhikma.org/; done
curl -sI https://baytalhikma.org/ | grep -iE 'cf-ray|x-served-by|x-amz-cf-pop|cache-status|x-cache'
```

**সমাধান:** CDN সাপোর্টের কাছে PoP আর রাউটিং প্রমাণসহ রিপোর্ট করুন; tiered caching/shield চালু করুন; TTL বাড়িয়ে hit ratio বাড়ান। আসল ইউজারের মাপ (RUM) দিয়ে অঞ্চলভিত্তিক TTFB দেখুন (চ্যাপ্টার ১০)।

### ১২. পার্জ করেছি, কিন্তু "কাজ করছে না"

**সম্ভাব্য কারণ:** CDN ঠিকই পার্জ করেছে, কিন্তু ব্রাউজারের নিজের ক্যাশ পুরনো কপি দিচ্ছে (`max-age` লম্বা ছিল); ভুল URL পার্জ করা হয়েছে (query string, `www`, ট্রেইলিং স্ল্যাশ, `http` বনাম `https`, compressed ভ্যারিয়েন্ট); সামনে বা পেছনে আরেকটা ক্যাশ লেয়ার আছে (shield, নিজের nginx ক্যাশ, দ্বিতীয় CDN, service worker); পার্জ সব PoP-এ পৌঁছাতে কয়েক সেকেন্ড লাগে।

**নিশ্চিত করুন:** `curl` দিয়ে দেখুন `Age` রিসেট হয়েছে কিনা। `curl`-এ নতুন কিন্তু ব্রাউজারে পুরনো হলে ব্রাউজার। `Age` রিসেট হয়নি হলে লেয়ার গুনুন: `via` আর `x-served-by` হেডারে কতগুলো ক্যাশ দেখা যাচ্ছে।

**সমাধান:** ঠিক যে URL ভ্যারিয়েন্ট ক্যাশ হয়েছে সেটা পার্জ করুন, বা ট্যাগ/প্রিফিক্স পার্জ ব্যবহার করুন। ভেতরের লেয়ার থেকে বাইরের দিকে পার্জ করুন (origin ক্যাশ → shield → edge)। ব্রাউজার ক্যাশ দূর থেকে পার্জ করা যায় না, তাই লম্বা `max-age` শুধু ভার্সনড URL-এ।

### ১৩. ভিডিও seek বা ডাউনলোড resume ভাঙা

**সম্ভাব্য কারণ:** CDN `Range` রিকোয়েস্টে 206 না দিয়ে পুরো ফাইল (200) দিচ্ছে; origin `Accept-Ranges` দেয় না; প্রথম রিকোয়েস্ট একটা range ছিল আর CDN ভুলভাবে আংশিক কন্টেন্টকে পুরো ফাইল হিসেবে স্টোর করেছে; বড় ফাইল CDN-এর সর্বোচ্চ ক্যাশযোগ্য আকারের চেয়ে বড়।

**নিশ্চিত করুন:**

```bash
curl -s -o /dev/null -D - -H 'Range: bytes=1000-1999' https://cdn.baytalhikma.org/lectures/01.mp4 \
  | grep -iE '^HTTP/|content-range|content-length|accept-ranges'
```

`HTTP/2 206`, `content-range: bytes 1000-1999/…` আর `content-length: 1000` দেখতে চান।

**সমাধান:** origin-এ range সাপোর্ট চালু করুন; CDN-এ বড় ফাইলের জন্য "slice" বা chunked caching চালু করুন (nginx-এ `slice` মডিউল)। ভিডিও HLS/DASH সেগমেন্টে ভাগ করলে সমস্যার বড় অংশ চলে যায়।

### ১৪. WAF থেকে 403

**সম্ভাব্য কারণ:** রিকোয়েস্টের বডি বা query-তে এমন কিছু যা আক্রমণের মতো দেখায় (SQL শব্দ, HTML ট্যাগ, লম্বা base64), নির্দিষ্ট দেশ বা ASN ব্লক, বট নিয়ম, আপনার নিজের API ক্লায়েন্টকে "বট" ধরা।

**নিশ্চিত করুন:** রেসপন্সের বডিতে CDN-এর ব্লক পেজ আর রিকোয়েস্ট/রে ID; তারপর CDN-এর সিকিউরিটি ইভেন্ট লগে সেই ID। একই রিকোয়েস্ট origin সরাসরি নিলে নিশ্চিতভাবে WAF।

**সমাধান:** ঠিক যে নিয়ম ধরেছে সেটা ওই path-এর জন্য "log" মোডে নিন বা ব্যতিক্রম যোগ করুন; পুরো WAF বন্ধ করবেন না। নিজের সার্ভার-টু-সার্ভার ক্লায়েন্টদের জন্য আলাদা হোস্টনেম বা টোকেন-ভিত্তিক ব্যতিক্রম রাখুন।

### ১৫. 429 Too Many Requests

**সম্ভাব্য কারণ:** CDN-এর রেট লিমিট নিয়ম; অনেক ইউজার একটা IP-এর পেছনে (অফিস, মোবাইল অপারেটরের CGNAT, যেটা বাংলাদেশের মোবাইল নেটওয়ার্কে খুবই সাধারণ), তাই সবাই মিলে একজন ইউজারের সীমা পার করছে।

**নিশ্চিত করুন:** `retry-after` হেডার আর CDN লগে কোন নিয়ম, কোন key (IP, হেডার, কুকি)।

**সমাধান:** রেট লিমিটের key শুধু IP না রেখে লগইন করা ইউজারের টোকেন বা সেশন যোগ করুন; সীমা আসল ট্রাফিকের মাপ দেখে ঠিক করুন; ক্লায়েন্টে `retry-after` মানা আর exponential backoff।

### ১৬. edge-এ সার্টিফিকেট এরর

**সম্ভাব্য কারণ:** কাস্টম সার্টিফিকেট এক্সপায়ার; নতুন সাবডোমেইন যোগ হয়েছে কিন্তু সার্টিফিকেটে নেই; CDN-এর ম্যানেজড সার্টিফিকেট ইস্যু হয়নি কারণ DNS বা CAA রেকর্ড বাধা দিচ্ছে; পুরনো ক্লায়েন্ট আধুনিক chain চেনে না।

**নিশ্চিত করুন:**

```bash
openssl s_client -connect baytalhikma.org:443 -servername app.baytalhikma.org -brief </dev/null 2>&1 | head
echo | openssl s_client -connect baytalhikma.org:443 -servername app.baytalhikma.org 2>/dev/null \
  | openssl x509 -noout -subject -ext subjectAltName -enddate
dig +short CAA baytalhikma.org
```

**সমাধান:** SAN-এ নতুন হোস্টনেম যোগ করুন; CAA-তে CDN যে CA ব্যবহার করে সেটা অনুমতি দিন; এক্সপায়ারি মনিটর করুন (চ্যাপ্টার ১৫)।

### ১৭. purge-all-এর পর origin বসে গেল

**সম্ভাব্য কারণ:** সব PoP একসাথে খালি, প্রথম মিনিটে সব রিকোয়েস্ট origin-এ। এটাকে বলে thundering herd বা cache stampede। origin সাধারণত মোট ট্রাফিকের ছোট একটা অংশ সামলানোর জন্য সাইজ করা।

**নিশ্চিত করুন:** origin-এর রিকোয়েস্ট রেট গ্রাফে পার্জের সময়ে খাড়া লাফ; CDN-এ hit ratio শূন্যের কাছে।

**সমাধান:** "purge everything" জরুরি অবস্থার জন্য রাখুন; প্রতিদিনের কাজে URL বা ট্যাগ পার্জ। origin shield আর request collapsing চালু রাখুন, যাতে একই অবজেক্টের হাজার MISS origin-এ একটা রিকোয়েস্ট হয়। soft purge (stale হিসেবে চিহ্নিত করা, মুছে না ফেলা) সাপোর্ট করলে সেটা ব্যবহার করুন।

### ১৮. কমপ্রেশন সমস্যা

**সম্ভাব্য কারণ:** origin gzip করে পাঠায়, CDN আবার কমপ্রেস করে (ডাবল gzip, ব্রাউজারে আবর্জনা দেখায়); `Vary: Accept-Encoding` নেই, তাই কমপ্রেস করা কপি এমন ক্লায়েন্টকে যায় যে সেটা চায়নি; ইমেজ বা ভিডিওর মতো আগে থেকেই কমপ্রেস করা ফাইল আবার কমপ্রেস করে CPU নষ্ট।

**নিশ্চিত করুন:**

```bash
curl -s -o /dev/null -D - -H 'Accept-Encoding: gzip' https://baytalhikma.org/app.3f9a.js | grep -iE 'content-encoding|vary'
curl -s -o /dev/null -D - -H 'Accept-Encoding: identity' https://baytalhikma.org/app.3f9a.js | grep -iE 'content-encoding|vary'
curl -s -H 'Accept-Encoding: gzip' https://baytalhikma.org/app.3f9a.js | gunzip | head -c 200
```

দ্বিতীয় কমান্ডে `content-encoding: gzip` এলে ক্লায়েন্ট না চাইলেও কমপ্রেস করা কপি যাচ্ছে। তৃতীয়টায় `gunzip`-এর পরও বাইনারি আবর্জনা দেখলে ডাবল কমপ্রেশন।

**সমাধান:** কমপ্রেশন এক জায়গায় করুন (সাধারণত CDN-এ, অথবা origin-এ আগে থেকে বানানো `.br`/`.gz`), আর `Vary: Accept-Encoding` নিশ্চিত করুন। চ্যাপ্টার ১০ দেখুন।

### ১৯. HEAD আর GET-এর উত্তর আলাদা

**সম্ভাব্য কারণ:** `curl -I` HEAD পাঠায়। কিছু CDN HEAD ক্যাশ থেকে না দিয়ে origin-এ পাঠায়, বা HEAD-এর জন্য আলাদা ক্যাশ স্টেট দেখায়; কিছু অ্যাপ HEAD ভুলভাবে হ্যান্ডল করে (405 বা ভিন্ন হেডার)। তাই `curl -I` "MISS" বলছে মানেই আসল GET MISS নয়।

**নিশ্চিত করুন:** GET পাঠিয়ে বডি ফেলে দিয়ে শুধু হেডার দেখুন, যেটা এই চ্যাপ্টারের স্ক্রিপ্ট করে:

```bash
curl -s -o /dev/null -D - https://baytalhikma.org/app.3f9a.css | grep -iE 'cache-status|x-cache|age'
```

**সমাধান:** ডিবাগিংয়ে `-o /dev/null -D -` ব্যবহারের অভ্যাস করুন; অ্যাপে HEAD-কে GET-এর মতো হেডার দিয়ে উত্তর দিন।

### ২০. Incognito-তে ঠিক, সাধারণ উইন্ডোতে ভাঙা

**সম্ভাব্য কারণ:** ব্রাউজারের ক্যাশে পুরনো কপি; একটা পুরনো service worker নিজের ক্যাশ থেকে পুরনো ফাইল দিচ্ছে; কুকির কারণে CDN আলাদা আচরণ করছে (লগইন বাইপাস, A/B টেস্ট); এক্সটেনশন রিকোয়েস্ট বদলাচ্ছে; HSTS বা পুরনো রিডাইরেক্ট ব্রাউজারে ক্যাশ হয়ে আছে।

**নিশ্চিত করুন:** DevTools → Application → Service Workers আর Cache Storage; Network ট্যাবে রেসপন্সের পাশে "(from disk cache)" বা "(ServiceWorker)"। সাধারণ উইন্ডোর কুকি কপি করে `curl`-এ পাঠিয়ে দেখুন উত্তর বদলায় কিনা।

**সমাধান:** service worker-এর আপডেট লজিক ঠিক করুন (নতুন ভার্সনে পুরনো ক্যাশ মুছে ফেলা); কুকি-নির্ভর CDN নিয়ম পর্যালোচনা করুন। ইউজারকে "ক্যাশ ক্লিয়ার করুন" বলা শেষ উপায়, সমাধান নয়।

## ইনসিডেন্টের সময় অভ্যাস

- **কিছু বদলানোর আগে প্রমাণ নিন।** স্ক্রিপ্টের আউটপুট, রে/রিকোয়েস্ট ID, PoP কোড, সময় (UTC-তে) একটা নোটে রাখুন। পার্জের পর এগুলো আর পাওয়া যাবে না।
- **একবারে একটা পরিবর্তন**, আর প্রতিটার পর আবার মাপুন।
- **CDN-এর স্ট্যাটাস পেজ দেখুন**, কিন্তু অন্ধভাবে বিশ্বাস করবেন না; বড় ইনসিডেন্টের প্রথম কয়েক মিনিটে প্রায়ই সবুজ থাকে।
- **CDN সাপোর্টে রিপোর্টে দিন:** পুরো URL, রে/রিকোয়েস্ট ID, PoP, সময়, আপনার `curl -v` আউটপুট, আর origin সরাসরি কী দেয়। এতে উত্তর ঘণ্টা থেকে মিনিটে নামে।
- **জরুরি বাইপাস প্ল্যান** আগে থেকে তৈরি রাখুন (চ্যাপ্টার ১৫): CDN পুরো ডাউন হলে DNS কীভাবে সরাসরি origin-এ নেবেন, আর origin সেই ট্রাফিক সামলাতে পারবে কিনা।

## মূল শিক্ষা

1. **একই রিকোয়েস্ট দুই জায়গায় পাঠান, আর দেখুন কোথায় উত্তর বদলায়।** CDN বনাম origin, এই PoP বনাম ওই PoP, কুকি সহ বনাম ছাড়া।
2. **`--resolve` আর `--connect-to`** দিয়ে আসল hostname রেখে CDN পাশ কাটানো যায়; এটাই প্রথম ধাপ।
3. **আট ধাপ:** CDN কিনা → DNS → কোন edge → ক্যাশ স্টেট → ক্যাশ কী ও `Vary` → origin হেডার → TLS → সিকিউরিটি লেয়ার।
4. **HIT কিন্তু ভুল কন্টেন্ট মানে ক্যাশ কী সমস্যা; সবসময় MISS মানে origin-এর হেডার সমস্যা।** দুইটার সমাধান সম্পূর্ণ আলাদা।
5. **এক ইউজারের ডেটা আরেকজনের কাছে যাওয়া ইনসিডেন্ট:** আগে ক্যাশিং বন্ধ আর পার্জ, তারপর তদন্ত।
6. **ব্রাউজার প্রমাণ নয়।** `curl -s -o /dev/null -D -` দিয়ে GET পাঠিয়ে হেডার পড়ুন; HEAD আলাদা আচরণ করতে পারে।
7. **purge-all শেষ উপায়।** এটা প্রমাণ মুছে দেয় আর origin-কে ঝুঁকিতে ফেলে।
