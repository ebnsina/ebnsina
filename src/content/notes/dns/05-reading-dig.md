---
title: 'dig দিয়ে DNS পড়া'
subtitle: 'dig-এর আউটপুটের প্রতিটা লাইন, প্রতিটা ফ্ল্যাগ, প্রতিটা status code। কাকে জিজ্ঞেস করছেন সেটা ঠিক করা, আর nslookup, kdig, resolvectl, Resolve-DnsName ও DoH দিয়ে একই প্রশ্ন করা।'
chapter: 5
level: 'intermediate'
readingTime: '২২ মিনিট'
topics: ['dns', 'dig', 'debugging', 'rcode', 'flags', 'edns', 'tools']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ধানমন্ডির একটা ফার্মেসিতে রুশদ কাউন্টারে বসে। মরিয়ম এসে একটা ল্যাব রিপোর্ট আর প্রেসক্রিপশন এগিয়ে দিল। নতুন কর্মচারী রাজি পাশে দাঁড়িয়ে শিখছে। রাজি রিপোর্টের মাঝখানের বড় সংখ্যাটা দেখেই বলে ফেলল, "হিমোগ্লোবিন ১১, ঠিক আছে।" রুশদ থামিয়ে দিল: "উপরে দেখো আগে।" রিপোর্টের মাথায় লেখা ল্যাবের নাম, রিপোর্টের নম্বর, স্যাম্পল কবে নেওয়া, আর একটা ছোট সিল: "Verified by pathologist"। আর এক কোণায় লেখা "Sample hemolysed, result may be unreliable"। এগুলো না পড়ে মাঝের সংখ্যা বিশ্বাস করা মানে অর্ধেক পড়া।

রুশদ লাইন ধরে ধরে পড়ায়। প্রথমে দেখো রিপোর্টটা কার: মরিয়মের নাম আর যে টেস্ট চাওয়া হয়েছিল সেটাই কিনা। তারপর ফলাফলের অংশ। তারপর নিচে রেফারেন্স রেঞ্জ আর কোন ডাক্তার রেফার করেছেন। শেষে পাদটীকা: কোন মেশিনে টেস্ট, কত সময় লেগেছে। "রিপোর্ট আসেনি" আর "রিপোর্ট এসেছে, টেস্টটাই করা যায়নি" আর "রিপোর্ট এসেছে, রোগ পাওয়া যায়নি" — তিনটা সম্পূর্ণ আলাদা খবর, অথচ নতুন কর্মচারী তিনটাকেই বলে "কিছু নেই"।

আরেকটা শিক্ষা: পাড়ার এক দোকান থেকে কপি করা রিপোর্ট আর ল্যাবের নিজের ছাপা রিপোর্ট এক জিনিস না। সন্দেহ হলে রুশদ সরাসরি ল্যাবে ফোন করে, "রিপোর্ট নম্বর অমুক, আপনাদের কাছে কী লেখা?" ল্যাব যা বলে সেটাই চূড়ান্ত।

মিলিয়ে নিই: পুরো ল্যাব রিপোর্টটা হলো **`dig`-এর আউটপুট**। মাথার রিপোর্ট নম্বর আর সিল হলো **HEADER** (`id`, `status`, আর `aa`/`ad`-এর মতো **flags**); "Sample hemolysed" নোট হলো **Extended DNS Error**। রোগীর নাম আর চাওয়া টেস্ট হলো **QUESTION**, ফলাফল হলো **ANSWER**, রেফার করা ডাক্তার হলো **AUTHORITY**, আর বাড়তি তথ্য হলো **ADDITIONAL**। নিচের মেশিন আর সময়ের পাদটীকা হলো **Query time আর SERVER** লাইন। তিন রকম "কিছু নেই" হলো **timeout**, **SERVFAIL**, আর **NXDOMAIN/NODATA**। আর সরাসরি ল্যাবে ফোন করা হলো **`dig @authoritative`**। বাস্তবে প্রতিটা DNS ডিবাগিং শুরু হয় এই রিপোর্টটা পুরোটা পড়া দিয়ে।

## প্রথম dig, পুরোটা

```bash
dig baytalhikma.org A
```

```text
; illustrative output
; <<>> DiG 9.18.28 <<>> baytalhikma.org A
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 50417
;; flags: qr rd ra ad; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 1232
;; QUESTION SECTION:
;baytalhikma.org.		IN	A

;; ANSWER SECTION:
baytalhikma.org.	287	IN	A	203.0.113.10

;; Query time: 14 msec
;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)
;; WHEN: Fri Oct 23 11:20:04 +06 2026
;; MSG SIZE  rcvd: 60
```

উপর থেকে নিচে পড়ুন। প্রতিটা অংশ আলাদা প্রশ্নের উত্তর দেয়।

## HEADER: উত্তরটা কী ধরনের

```text
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 50417
```

- **opcode** — কী ধরনের অনুরোধ। প্রায় সবসময় `QUERY`। `NOTIFY` আর `UPDATE` দেখবেন zone ট্রান্সফার আর ডায়নামিক আপডেটে (চ্যাপ্টার ৭)।
- **id** — ১৬-বিটের একটা র‍্যান্ডম নম্বর। ক্লায়েন্ট প্রশ্নে বসায়, সার্ভার উত্তরে ফেরত দেয়, যাতে কোন উত্তর কোন প্রশ্নের তা মেলানো যায়। এটা অনুমান করতে পারাই cache poisoning-এর গোড়া (চ্যাপ্টার ১৩)।
- **status** — RCODE, সবচেয়ে জরুরি শব্দ। নিচে পূর্ণ টেবিল।

## Status code: ছয়টা শব্দ, ছয়টা আলাদা খবর

| status   | মানে                                              | সাধারণত কেন                                                        |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| NOERROR  | প্রশ্ন বোঝা গেছে, কোনো ভুল নেই                    | ANSWER থাকলে সফল; খালি থাকলে NODATA (নিচে)                          |
| NXDOMAIN | এই নামটাই zone-এ নেই                              | বানান ভুল, রেকর্ড বানানো হয়নি, ভুল zone-এ বানানো                   |
| SERVFAIL | resolver উত্তর জোগাড় করতে পারেনি                  | authoritative ডাউন বা lame, DNSSEC ভ্যালিডেশন ফেল, লুপ               |
| REFUSED  | সার্ভার তোমার প্রশ্নের উত্তর দিতে রাজি না         | resolver শুধু নিজের নেটওয়ার্কের জন্য; authoritative-কে অন্যের zone জিজ্ঞেস |
| FORMERR  | প্রশ্নের ফরম্যাট সার্ভার বোঝেনি                   | পুরনো সার্ভার EDNS বোঝে না, ভাঙা middlebox                         |
| NOTIMP   | এই opcode বা ফিচার সার্ভারে নেই                   | পুরনো বা সীমিত সার্ভার                                              |

আর দুটো "status" যেগুলো আসলে status code না:

- **NODATA** — `status: NOERROR` কিন্তু `ANSWER: 0`। নাম আছে, এই টাইপ নেই। যেমন `AAAA` চাইলেন, শুধু `A` আছে। NXDOMAIN-এর সাথে গুলিয়ে ফেললে ভুল দিকে ডিবাগ করবেন: NXDOMAIN মানে নামটাই বানাতে হবে, NODATA মানে নাম আছে, শুধু রেকর্ড টাইপটা যোগ করতে হবে।
- **timeout** — `;; communications error ... timed out` বা `;; no servers could be reached`। কোনো উত্তরই আসেনি। এটা DNS-এর সমস্যা না-ও হতে পারে: ফায়ারওয়াল, রাউটিং, সার্ভার বন্ধ।

<Callout type="warning">

**SERVFAIL কখনো আসল কারণ না, শুধু লক্ষণ।** resolver শুধু বলছে "আমি পারিনি"। কেন পারেনি জানতে হলে নিচের EDE লাইন দেখুন, `+cd` দিয়ে DNSSEC বাদ দিয়ে আবার চেষ্টা করুন, আর authoritative-কে সরাসরি জিজ্ঞেস করুন। এই তিনটা ধাপ চ্যাপ্টার ১৪-এর প্লেবুকের কেন্দ্র।

</Callout>

## Flags: দুই অক্ষরের সিল

```text
;; flags: qr rd ra ad; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1
```

| flag | পুরো নাম             | থাকলে মানে                                                                  |
| ---- | -------------------- | --------------------------------------------------------------------------- |
| qr   | query response       | এটা উত্তর (প্রশ্নে থাকে না)                                                 |
| aa   | authoritative answer | উত্তরদাতা নিজেই এই zone-এর মালিক, ক্যাশ থেকে বলছে না                         |
| tc   | truncated            | উত্তর UDP-তে আঁটেনি, কাটা পড়েছে; TCP-তে আবার জিজ্ঞেস করতে হবে               |
| rd   | recursion desired    | ক্লায়েন্ট চেয়েছে "পুরো খোঁজটা তুমি করো" (dig ডিফল্টে পাঠায়)              |
| ra   | recursion available  | সার্ভার recursive resolver হিসেবে কাজ করতে রাজি                             |
| ad   | authentic data       | resolver DNSSEC দিয়ে উত্তর যাচাই করেছে (চ্যাপ্টার ১২)                       |
| cd   | checking disabled    | ক্লায়েন্ট বলেছে "DNSSEC যাচাই কোরো না"                                     |

তিনটা জোড়া মনে রাখলেই প্রায় সব কেস পড়া যায়:

- **`aa` আছে, `ra` নেই** → আপনি সরাসরি authoritative-এর সাথে কথা বলছেন। ঠিক এটাই চাই যখন উৎস যাচাই করছেন।
- **`ra` আছে, `aa` নেই** → recursive resolver, সম্ভবত ক্যাশ থেকে।
- **`@ns1...` দিয়ে authoritative-কে জিজ্ঞেস করলেন, অথচ `ra` এল আর `aa` নেই** → মাঝপথে কেউ আপনার পোর্ট 53 ট্রাফিক ধরে নিজের resolver-এ পাঠাচ্ছে (ISP, অফিস ফায়ারওয়াল, হোটেল Wi-Fi)। এই অবস্থায় আপনার কোনো "সরাসরি" টেস্ট বিশ্বাসযোগ্য না; অন্য নেটওয়ার্ক, VPN বা DoH দিয়ে টেস্ট করুন।

শেষের সংখ্যাগুলো (`QUERY: 1, ANSWER: 1, ...`) প্রতিটা সেকশনে কয়টা রেকর্ড আছে তা বলে। `ANSWER: 0` চোখে পড়লেই NODATA বা referral ভাবুন।

## OPT pseudosection: EDNS আর Extended DNS Errors

```text
;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 1232
```

মূল DNS ১৯৮৭ সালের, তখন UDP উত্তর ৫১২ বাইটে সীমিত ছিল। EDNS(0) একটা নকল রেকর্ড (OPT) দিয়ে নতুন ক্ষমতা যোগ করে। `udp: 1232` মানে "আমি ১২৩২ বাইট পর্যন্ত UDP উত্তর নিতে পারি"; DNS Flag Day 2020-এর সুপারিশ করা মান এটাই, যাতে IP fragmentation না হয় (চ্যাপ্টার ১১)। `flags: do` দেখলে বুঝবেন DNSSEC রেকর্ড চাওয়া হয়েছে।

এখানেই আসে **Extended DNS Error (EDE, RFC 8914)**, ল্যাব রিপোর্টের সেই পাদটীকা। নতুন resolver-গুলো SERVFAIL-এর সাথে কারণটাও লিখে দেয়:

```bash
dig @1.1.1.1 dnssec-failed.org A
```

```text
; illustrative output
;; ->>HEADER<<- opcode: QUERY, status: SERVFAIL, id: 7731
;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 1232
; EDE: 9 (DNSKEY Missing): (no SEP matching the DS found for dnssec-failed.org.)
```

কিছু EDE কোড যা প্রায়ই দেখবেন:

| EDE | নাম                    | ইঙ্গিত                                                     |
| --- | ---------------------- | ---------------------------------------------------------- |
| 3   | Stale Answer           | serve-stale: মেয়াদ-পেরোনো উত্তর দেওয়া হয়েছে              |
| 6   | DNSSEC Bogus           | সিগনেচার যাচাই ফেল                                         |
| 7   | Signature Expired      | RRSIG-এর মেয়াদ শেষ; zone রি-সাইন হচ্ছে না                   |
| 9   | DNSKEY Missing         | parent-এর DS-এর সাথে মেলে এমন key নেই                       |
| 15  | Blocked                | resolver পলিসি দিয়ে ব্লক করেছে                             |
| 18  | Prohibited             | এই ক্লায়েন্টকে উত্তর দেওয়া নিষেধ                          |
| 22  | No Reachable Authority | কোনো authoritative সাড়া দেয়নি                              |
| 23  | Network Error          | authoritative-এ পৌঁছাতে নেটওয়ার্ক সমস্যা                   |

পুরো তালিকা IANA-র "Extended DNS Error Codes" রেজিস্ট্রিতে। সব resolver EDE পাঠায় না, আর পুরনো `dig` এটা দেখায় না (যেমন macOS-এর সাথে আসা পুরনো BIND 9.10)। EDE না দেখলে `dig -v` দিয়ে ভার্সন দেখুন আর Homebrew বা প্যাকেজ ম্যানেজার থেকে নতুন `bind` নিন, অথবা `kdig` ব্যবহার করুন।

## চারটা সেকশন

**QUESTION** — যা জিজ্ঞেস করেছেন তার প্রতিধ্বনি। সামনে `;` থাকে কারণ এটা রেকর্ড না। নাম আর টাইপ মিলিয়ে নিন; typo প্রায়ই এখানেই ধরা পড়ে।

**ANSWER** — আসল রেকর্ড। প্রতিটা লাইনের পাঁচ কলাম:

```text
baytalhikma.org.	287	IN	A	203.0.113.10
;  name            TTL  class type  data
```

`IN` হলো ক্লাস (ইন্টারনেট), প্রায় সবসময় তাই। CNAME থাকলে ANSWER-এ শিকল দেখবেন, প্রতিটা ধাপ আলাদা লাইনে:

```text
; illustrative output
www.baytalhikma.org.	300	IN	CNAME	baytalhikma.cdn.example.
baytalhikma.cdn.example. 60	IN	A	198.51.100.7
```

**AUTHORITY** — "এই উত্তরের দায়িত্ব কার"। তিন সময়ে ভরা থাকে: referral-এ (parent বলছে "আমি জানি না, ওদের জিজ্ঞেস করো" আর NS দেয়), NXDOMAIN আর NODATA-তে (SOA দেয়, negative TTL-এর জন্য), আর কিছু authoritative সফল উত্তরেও NS জুড়ে দেয়।

**ADDITIONAL** — সাহায্যকারী তথ্য। referral-এ nameserver-দের IP (glue, চ্যাপ্টার ৬), আর OPT রেকর্ড এখানেই থাকে বলে `ADDITIONAL: 1` প্রায়ই দেখবেন যদিও কিছু ছাপা হয়নি।

**পাদটীকা:**

- `Query time` — 0 থেকে কয়েক msec মানে প্রায় নিশ্চিত ক্যাশ। কয়েকশো msec মানে ঠান্ডা লুকআপ বা দূরের সার্ভার।
- `SERVER` — **কাকে আসলে জিজ্ঞেস করা হয়েছে।** `127.0.0.53` মানে systemd-resolved-এর stub, যে আবার অন্য কাউকে জিজ্ঞেস করে। এই লাইন না দেখে কোনো সিদ্ধান্তে যাবেন না।
- `MSG SIZE rcvd` — উত্তরের বাইট। ১২৩২-এর কাছাকাছি গেলে truncation আর TCP fallback-এর কথা ভাবুন।

## কাকে জিজ্ঞেস করছেন: সবচেয়ে বড় সিদ্ধান্ত

একই প্রশ্ন তিনজনকে করলে তিনটা আলাদা সত্য পাবেন:

```bash
dig baytalhikma.org A                       # your system's configured resolver
dig @1.1.1.1 baytalhikma.org A              # a specific public resolver
dig @ns1.baytalhikma.org baytalhikma.org A  # the source of truth
```

প্রথমটা বলে আপনার মেশিন কী দেখছে। দ্বিতীয়টা বলে বাইরের দুনিয়ার একটা বড় অংশ কী দেখছে। তৃতীয়টা বলে আপনি আসলে কী কনফিগার করেছেন। তিনটা মিললে DNS ঠিক আছে, সমস্যা অন্য কোথাও। না মিললে কোন জায়গায় ফাঁক, সেটাই আপনার বাগ।

zone-এর authoritative কারা, তা জানতে:

```bash
dig +short baytalhikma.org NS
```

<Callout type="tip">

`+norecurse` (বা `+nord`) দিয়ে resolver-কে জিজ্ঞেস করলে সে নতুন করে খুঁজবে না, শুধু ক্যাশে যা আছে তা বলবে। "এই resolver কি এখনো পুরনো IP ধরে আছে?" এই প্রশ্নের নিখুঁত উত্তর, আর ক্যাশ ভরিয়ে দিয়ে নিজের টেস্ট নষ্ট করার ঝুঁকিও নেই।

</Callout>

## কাজের ফ্ল্যাগগুলো

```bash
dig +short baytalhikma.org A            # only the data, one per line
dig +noall +answer baytalhikma.org A    # only the ANSWER section, with TTLs
dig +noall +answer +authority name A    # answer plus authority
dig +trace baytalhikma.org A            # walk root -> TLD -> authoritative yourself
dig +tcp baytalhikma.org A              # force TCP (does TCP/53 work?)
dig +dnssec baytalhikma.org A           # ask for RRSIGs (sets the DO bit)
dig +cd baytalhikma.org A               # skip DNSSEC validation at the resolver
dig -x 203.0.113.10                     # reverse lookup (PTR)
dig +nsid @1.1.1.1 baytalhikma.org A    # which anycast instance answered
dig -4 baytalhikma.org A                # query over IPv4 only (-6 for IPv6)
dig +subnet=203.0.113.0/24 @8.8.8.8 baytalhikma.org A   # pretend to be a client there (ECS)
dig baytalhikma.org A AAAA MX           # several questions in one run
```

কয়েকটা নিয়ে আরেকটু:

- **`+trace`** — dig নিজেই iterative resolver হয়ে যায়: root-কে জিজ্ঞেস করে, referral মেনে TLD-তে, তারপর authoritative-এ। আপনার resolver-এর ক্যাশ পুরোপুরি এড়িয়ে যায়, তাই "আসল delegation কী" দেখার সেরা উপায়। নেটওয়ার্ক পোর্ট 53 interception করলে `+trace`-ও বিভ্রান্ত হবে।
- **`+cd`** — SERVFAIL এল? `+cd` দিয়ে আবার চালান। এবার উত্তর এলে সমস্যা প্রায় নিশ্চিত DNSSEC (চ্যাপ্টার ১২)।
- **`+nsid`** — anycast resolver বা authoritative-এর কোন সার্ভারটা উত্তর দিল তার আইডি। প্রোভাইডারের সাপোর্টে রিপোর্ট করতে খুব কাজের।
- **`+subnet`** — GeoDNS বা CDN আলাদা দেশে কী উত্তর দেয় দেখতে (EDNS Client Subnet, চ্যাপ্টার ১০)। সব resolver এটা ফরোয়ার্ড করে না।

`~/.digrc` ফাইলে `+noall +answer` লিখে রাখলে প্রতিবার টাইপ করতে হয় না; কিন্তু তখন HEADER দেখবেন না, তাই ডিবাগিংয়ের সময় `+all` দিয়ে ফিরিয়ে আনুন।

## অন্য টুল, একই প্রশ্ন

`dig` সবখানে থাকে না। একই কাজ অন্য টুলে:

```bash
# nslookup — everywhere, including Windows. Second argument is the server.
nslookup -type=MX baytalhikma.org 1.1.1.1

# host — terse, good for scripts
host -t TXT baytalhikma.org

# kdig (Knot) — dig-compatible, plus DoT/DoH built in
kdig +tls @1.1.1.1 baytalhikma.org A
kdig +https @1.1.1.1 baytalhikma.org A

# drill (ldns) — handy for DNSSEC chains
drill -TD baytalhikma.org

# systemd-resolved — asks the SAME path your apps use, not raw DNS
resolvectl query baytalhikma.org
resolvectl status            # which upstream servers, per interface
```

Windows PowerShell-এ:

```powershell
Resolve-DnsName baytalhikma.org -Type A
Resolve-DnsName baytalhikma.org -Type A -Server 1.1.1.1
Resolve-DnsName baytalhikma.org -DnsOnly   # skip hosts file and NetBIOS
```

DoH দিয়ে, যেখানে পোর্ট 53 বন্ধ বা interception হচ্ছে (JSON API, ২০২৬ সালের অক্টোবর অনুযায়ী Cloudflare আর Google দুজনেই দেয়):

```bash
curl -s -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=baytalhikma.org&type=A'

curl -s 'https://dns.google/resolve?name=baytalhikma.org&type=A'
```

<Callout type="warning">

**`dig` আর আপনার অ্যাপ এক রাস্তা দিয়ে যায় না।** `dig` সরাসরি DNS সার্ভারকে প্যাকেট পাঠায়; `/etc/hosts`, nsswitch, ব্রাউজারের ক্যাশ, VPN-এর split DNS, কিছুই দেখে না। অ্যাপ যায় OS-এর resolver লাইব্রেরি দিয়ে। তাই "dig ঠিক উত্তর দিচ্ছে কিন্তু অ্যাপ ভুল IP-তে যাচ্ছে" খুব সাধারণ। অ্যাপ যা দেখে তা দেখতে Linux-এ `getent hosts name` বা `resolvectl query name`, macOS-এ `dscacheutil -q host -a name name`। বিস্তারিত চ্যাপ্টার ৮-এ।

</Callout>

## একটা আসল ডিবাগ, শুরু থেকে শেষ

ইউজার বলছে `shop.cordoba.example` খোলে না। ধাপে ধাপে:

```bash
dig shop.cordoba.example A
```

```text
; illustrative output
;; ->>HEADER<<- opcode: QUERY, status: SERVFAIL, id: 2210
;; flags: qr rd ra; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 1
; EDE: 22 (No Reachable Authority): (at delegation cordoba.example.)
```

SERVFAIL, EDE বলছে কোনো authoritative-এ পৌঁছানো যায়নি। কারা authoritative?

```bash
dig +trace shop.cordoba.example A | tail -n 8
```

```text
; illustrative output
cordoba.example.	172800	IN	NS	ns1.oldhost.example.
cordoba.example.	172800	IN	NS	ns2.oldhost.example.
;; Received 112 bytes from 192.0.2.53#53(tld-server) in 40 ms

;; communications error to 198.51.100.53#53: timed out
;; communications error to 198.51.100.54#53: timed out
```

parent এখনো পুরনো হোস্টের nameserver দেখাচ্ছে, আর সেগুলো টাইমআউট। কেউ হোস্ট বদলেছে কিন্তু রেজিস্ট্রারে nameserver বদলায়নি, আর পুরনো হোস্ট অ্যাকাউন্ট বন্ধ করে দিয়েছে। সমাধান রেজিস্ট্রারের প্যানেলে, DNS প্রোভাইডারের প্যানেলে না (চ্যাপ্টার ৬)। পুরো ডিবাগটা চারটা লাইন পড়েই হয়ে গেল: status, EDE, trace-এর শেষ referral, আর timeout।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

**"dig বলছে ঠিক আছে, কিন্তু ব্রাউজার বা অ্যাপ খুলছে না।"**
নিশ্চিত হন: `SERVER` লাইন দেখুন, তারপর `getent hosts name` (Linux) বা `dscacheutil -q host -a name name` (macOS) দিয়ে অ্যাপের দেখা উত্তর তুলনা করুন। আলাদা হলে `/etc/hosts`, VPN-এর DNS, বা ব্রাউজারের নিজস্ব DoH দায়ী। সমাধান: চ্যাপ্টার ৮-এর ক্লায়েন্ট-সাইড চেকলিস্ট।

**"authoritative-কে সরাসরি জিজ্ঞেস করছি, তবু পুরনো উত্তর আসছে।"**
নিশ্চিত হন: উত্তরে `aa` আছে কিনা আর `ra` নেই কিনা দেখুন। `aa` নেই আর `ra` আছে মানে interception। সমাধান: `kdig +https` বা `curl` দিয়ে DoH-এ টেস্ট করুন, অথবা অন্য নেটওয়ার্ক বা একটা VPS থেকে।

**"NXDOMAIN পাচ্ছি অথচ রেকর্ড বানিয়েছি।"**
নিশ্চিত হন: `dig +short name NS` আর `dig +trace name` দিয়ে দেখুন delegation কোন প্রোভাইডারে যাচ্ছে, তারপর `dig @thatprovider name`। অনেক সময় রেকর্ড বানানো হয়েছে অন্য প্রোভাইডারের প্যানেলে, অথবা নামের শেষে zone নাম দুবার বসে গেছে (`api.baytalhikma.org.baytalhikma.org`)। সমাধান: সঠিক প্রোভাইডারে, শুধু লেবেলটা (`api`) দিয়ে রেকর্ড বানান।

**"NOERROR কিন্তু কোনো IP আসছে না।"**
নিশ্চিত হন: `ANSWER: 0`, AUTHORITY-তে SOA। এটা NODATA। `dig name ANY` না করে আলাদাভাবে `A`, `AAAA`, `CNAME` জিজ্ঞেস করুন (অনেক সার্ভার `ANY`-তে আর পূর্ণ উত্তর দেয় না, RFC 8482)। সমাধান: অনুপস্থিত টাইপের রেকর্ড যোগ করুন; IPv6-only ক্লায়েন্টের জন্য প্রায়ই `AAAA` বাদ পড়ে।

**"REFUSED আসছে।"**
নিশ্চিত হন: কাকে জিজ্ঞেস করছেন? অফিসের বা অন্য কোম্পানির resolver বাইরে থেকে recursion দেয় না, আর authoritative অন্যের zone-এর উত্তর দেয় না। সমাধান: সঠিক সার্ভারকে জিজ্ঞেস করুন; নিজের authoritative থেকে নিজের zone-এ REFUSED এলে zone লোড হয়নি বা ভুল নামে লোড হয়েছে।

**"মাঝে মাঝে timeout, মাঝে মাঝে চলে।"**
নিশ্চিত হন: `dig +tcp` আর `dig +bufsize=512` দিয়ে চালান; `MSG SIZE` বড় হলে truncation বা fragmentation সমস্যা। সব authoritative আলাদা করে টেস্ট করুন, একটা মরা থাকলেও এমন হয়। সমাধান: TCP/53 খুলুন, বড় TXT রেকর্ড ছোট করুন, মরা nameserver সরান (চ্যাপ্টার ১১)।

## মূল শিক্ষা

1. **পুরো রিপোর্ট পড়ুন, শুধু ANSWER না।** status, flags, EDE, SERVER — এই চারটায় প্রায় সব উত্তর থাকে।
2. **NXDOMAIN, NODATA, SERVFAIL, REFUSED, timeout — পাঁচটা আলাদা সমস্যা।** একটাকে আরেকটা ভাবলে ভুল জায়গায় ঠিক করবেন।
3. **`aa` মানে উৎস, `ra` মানে resolver।** authoritative-কে জিজ্ঞেস করে `ra` এলে মাঝপথে কেউ আছে।
4. **একই প্রশ্ন তিনজনকে করুন** — নিজের resolver, পাবলিক resolver, authoritative। যেখানে না মেলে সেখানেই বাগ।
5. **SERVFAIL-এর পরে তিন কাজ:** EDE পড়ুন, `+cd` দিয়ে চালান, `+trace` দিয়ে delegation দেখুন।
6. **`dig` অ্যাপের রাস্তা না।** অ্যাপ যা দেখে তা দেখতে `getent`, `resolvectl query`, `Resolve-DnsName` ব্যবহার করুন।
