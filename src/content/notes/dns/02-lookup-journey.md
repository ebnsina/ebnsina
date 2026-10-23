---
title: 'একটা লুকআপের পুরো যাত্রা'
subtitle: 'stub resolver থেকে recursive resolver, তারপর root, TLD আর authoritative সার্ভার: প্রতিটা হপে কে কী জিজ্ঞেস করে, কী উত্তর পায়, আর dig +trace দিয়ে সেটা নিজের চোখে কীভাবে দেখবেন।'
chapter: 2
level: 'beginner'
readingTime: '১৮ মিনিট'
topics: ['resolution', 'recursive resolver', 'referral', 'glue', 'dig trace', 'qname minimisation']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

হাইসাম পুরান ঢাকায় প্রথমবার এসেছে, তাকে যেতে হবে "রুশদ আতর হাউস"-এ। সে নিজে রাস্তা খুঁজতে চায় না, তাই তার হোটেলের ম্যানেজার ফারাবিকে বলে, "আমাকে শুধু দোকানের ঠিকানাটা এনে দিন।" ফারাবি হলো সেই লোক যে খুঁজে বের করার পুরো দায়িত্ব নেয়; হাইসাম শুধু একবার জিজ্ঞেস করে আর একবার উত্তর পায়।

ফারাবি প্রথমে যায় চকবাজারের মোড়ের বুড়ো চা-ওয়ালার কাছে, যে পুরান ঢাকার সব বাজারের নাম জানে কিন্তু কোনো দোকান চেনে না। চা-ওয়ালা বলে, "আতরের দোকান? ওটা আমি জানি না, তবে আতরের সব দোকান তো চকবাজার আতরপট্টিতে। ওখানে সমিতির অফিসে কিন্দি সাহেব বসেন, তাঁকে জিজ্ঞেস করুন। অফিসটা মসজিদের ঠিক পেছনে।" ফারাবি আতরপট্টির সমিতি অফিসে যায়। কিন্দি সাহেবও দোকানের ভেতরের খবর রাখেন না, কিন্তু তাঁর খাতায় আছে কোন দোকানের মালিক কে: "রুশদ আতর হাউস? ওটা রুশদের দোকান, তিন নম্বর গলিতে। রুশদ নিজেই বলতে পারবে ঠিক কোথায়।" ফারাবি তিন নম্বর গলিতে গিয়ে রুশদকে পায়, আর রুশদ দোকানের নম্বর বলে দেয়: "১৭ নম্বর।"

ফারাবি হোটেলে ফিরে হাইসামকে বলে, "১৭ নম্বর, তিন নম্বর গলি।" আর নিজের নোটবুকে টুকে রাখে: আতরপট্টি মানে মসজিদের পেছনের সমিতি অফিস, রুশদের দোকান তিন নম্বর গলি। পরদিন আরেক অতিথি যখন আতরপট্টির অন্য একটা দোকান খোঁজে, ফারাবি আর চা-ওয়ালার কাছে যায় না, সরাসরি সমিতি অফিসে চলে যায়।

মিলিয়ে নিই: হাইসাম হলো আপনার কম্পিউটারের **stub resolver**, যে শুধু একবার জিজ্ঞেস করে আর পুরো উত্তর আশা করে, এটাই **recursive query**। ফারাবি হলো **recursive resolver** (যেমন আপনার ISP-এর DNS বা `1.1.1.1`), যে নিজে ঘুরে ঘুরে উত্তর জোগাড় করে। চা-ওয়ালা হলো **root server**, সমিতি অফিস হলো **TLD server** (`.org`), আর রুশদ হলো **authoritative server**, যে আসলেই উত্তর জানে। "ওখানে যান, অফিসটা মসজিদের পেছনে" এই কথাটা হলো **referral**, আর ঠিকানাসহ বলে দেওয়া "মসজিদের পেছনে" অংশটা হলো **glue record**। ফারাবির নোটবুক হলো resolver-এর **cache**, যার কারণে পরের লুকআপে root-এ যাওয়াই লাগে না। বাস্তবে প্রতিটা ব্রাউজার, অ্যাপ আর সার্ভার প্রতিদিন হাজারবার ঠিক এই যাত্রা করে, আর বেশিরভাগ সময় ক্যাশের কারণে পুরো যাত্রাটা কয়েক মিলিসেকেন্ডেই শেষ হয়।

## চারটা চরিত্র

একটা DNS লুকআপে চার ধরনের সফটওয়্যার জড়িত:

| চরিত্র | কোথায় থাকে | কাজ |
| --- | --- | --- |
| **Stub resolver** | আপনার OS-এর ভেতরে (glibc, systemd-resolved, macOS mDNSResponder) | অ্যাপের প্রশ্ন নিয়ে একটা recursive resolver-কে পাঠায়, উত্তর ফেরত দেয়। নিজে খোঁজে না। |
| **Recursive resolver** | ISP, অফিস, রাউটার, বা পাবলিক (`1.1.1.1`, `8.8.8.8`, `9.9.9.9`) | পুরো খোঁজার কাজটা করে, ফলাফল ক্যাশ করে। একে "recursor" বা "full-service resolver"-ও বলে। |
| **Root server** | `a` থেকে `m.root-servers.net` | শুধু জানে কোন TLD কোন সার্ভারে। |
| **Authoritative server** | TLD-এর জন্য registry-র সার্ভার, আপনার ডোমেইনের জন্য আপনার DNS প্রোভাইডার | নিজের zone-এর আসল উত্তর দেয়। |

একটা জিনিস আলাদা করে মনে রাখুন: **recursive resolver আর authoritative server দুটো সম্পূর্ণ আলাদা ভূমিকা।** একটা প্রশ্ন করে, অন্যটা উত্তর দেয়। একই সফটওয়্যার (যেমন BIND) দুটো কাজই করতে পারে, কিন্তু প্রোডাকশনে এগুলো আলাদা রাখাই নিয়ম। "DNS server" বললে কোনটা বোঝাচ্ছেন সেটা পরিষ্কার না করলে ডিবাগিংয়ে অর্ধেক কথা ভুল বোঝাবুঝিতে যায়।

<Callout type="info">

আপনার বাসার রাউটার সাধারণত একটা **forwarder**: সে নিজে খোঁজে না, প্রশ্নটা ISP-এর resolver-এ পাঠিয়ে দেয় আর উত্তর ক্যাশ করে। তাই আপনার ল্যাপটপের `/etc/resolv.conf`-এ প্রায়ই `192.168.0.1` দেখা যায়। আসল recursion হয় আরও এক ধাপ পরে।

</Callout>

## Recursive বনাম Iterative query

দুই ধরনের প্রশ্ন আছে, আর একটা লুকআপে দুটোই থাকে:

- **Recursive query:** "আমাকে চূড়ান্ত উত্তর দাও, যা করার তুমি করো।" Stub → recursive resolver এই প্রশ্ন করে। প্যাকেটে **RD (Recursion Desired)** ফ্ল্যাগ সেট থাকে।
- **Iterative query:** "তুমি যা জানো বলো, না জানলে কার কাছে যেতে হবে বলো।" Recursive resolver → root/TLD/authoritative এই প্রশ্ন করে। উত্তর হয় চূড়ান্ত উত্তর, নয়তো একটা referral।

Authoritative সার্ভার কখনো আপনার হয়ে খুঁজে দেয় না। আপনি `ns1.example.net`-কে `google.com` জিজ্ঞেস করলে সে উত্তর দেবে না (সাধারণত `REFUSED`), কারণ ওটা তার zone না।

## পুরো যাত্রা, ধাপে ধাপে

ধরুন cache সম্পূর্ণ খালি, আর আপনার ব্রাউজার `www.baytalhikma.org` খুঁজছে।

<Mermaid
title="Cold-cache resolution of www.baytalhikma.org"
code={`sequenceDiagram
  participant B as "Browser + OS stub"
  participant R as "Recursive resolver"
  participant Root as "Root server"
  participant T as "org TLD server"
  participant A as "ns1.baytalhikma.org"
  B->>R: "A www.baytalhikma.org? (RD=1)"
  R->>Root: "A www.baytalhikma.org?"
  Root-->>R: "Referral: org is at a0.org.afilias-nst.info ... (+glue)"
  R->>T: "A www.baytalhikma.org?"
  T-->>R: "Referral: baytalhikma.org is at ns1/ns2.baytalhikma.org (+glue)"
  R->>A: "A www.baytalhikma.org?"
  A-->>R: "Answer: 192.0.2.10, TTL 300 (AA=1)"
  R-->>B: "192.0.2.10"`}
/>

**ধাপ ১: অ্যাপ → OS।** ব্রাউজার `getaddrinfo()`-এর মতো একটা OS ফাংশন ডাকে। OS আগে দেখে `/etc/hosts`, তারপর নিজের ক্যাশ, তারপর resolver-কে জিজ্ঞেস করে। (ব্রাউজারের নিজস্ব ক্যাশও আছে, আট নম্বর চ্যাপ্টারে।)

**ধাপ ২: Stub → Recursive।** একটা UDP প্যাকেট পোর্ট ৫৩-তে যায়: "`www.baytalhikma.org`, টাইপ A, RD=1।"

**ধাপ ৩: Recursive → Root।** Resolver-এর কাছে root server-গুলোর ঠিকানা আগে থেকেই আছে, একটা ফাইলে যাকে বলে **root hints** (BIND-এ `named.root`)। এখানে ডিম আগে না মুরগি আগে সমস্যা নেই: root-এর ঠিকানা সফটওয়্যারের সাথেই আসে। Root উত্তর দেয় না, বলে: "`.org`-এর সার্ভার এরা, আর তাদের IP এই।"

**ধাপ ৪: Recursive → TLD।** `.org`-এর সার্ভার বলে: "`baytalhikma.org`-এর nameserver `ns1.baytalhikma.org` আর `ns2.baytalhikma.org`, আর তাদের IP এই।"

**ধাপ ৫: Recursive → Authoritative।** `ns1.baytalhikma.org` চূড়ান্ত উত্তর দেয়: `192.0.2.10`, TTL ৩০০ সেকেন্ড, আর **AA (Authoritative Answer)** ফ্ল্যাগ সেট করে।

**ধাপ ৬: ফেরত।** Resolver উত্তরটা ক্যাশ করে, পথের সব referral-ও ক্যাশ করে, তারপর stub-কে উত্তর দেয়। Stub (অনেক সময়) নিজেও ক্যাশ করে।

## Referral আর Glue

ধাপ ৪-এ একটা মজার সমস্যা আছে। `.org` বলল `baytalhikma.org`-এর nameserver হলো `ns1.baytalhikma.org`। কিন্তু `ns1.baytalhikma.org`-এর IP জানতে হলে তো `baytalhikma.org`-কেই জিজ্ঞেস করতে হবে, যার nameserver হলো... `ns1.baytalhikma.org`। একটা অসীম লুপ।

সমাধান হলো **glue record**: parent zone (`.org`) referral-এর সাথে nameserver-এর IP-ও দিয়ে দেয়, উত্তরের **ADDITIONAL section**-এ। এই IP-গুলো রেজিস্ট্রারে "child nameserver" বা "host record" হিসেবে রেজিস্টার করা হয় (ছয় নম্বর চ্যাপ্টার)।

```text
;; AUTHORITY SECTION:
baytalhikma.org.     3600  IN  NS  ns1.baytalhikma.org.
baytalhikma.org.     3600  IN  NS  ns2.baytalhikma.org.

;; ADDITIONAL SECTION:
ns1.baytalhikma.org. 3600  IN  A   198.51.100.53     <- glue
ns2.baytalhikma.org. 3600  IN  A   203.0.113.53      <- glue
```

Glue শুধু তখনই দরকার যখন nameserver-এর নাম নিজের zone-এর ভেতরে ("in-bailiwick")। যদি আপনার nameserver হয় `ns1.dnsprovider.example`, তাহলে glue লাগে না: resolver আলাদা করে `dnsprovider.example` রিজলভ করে নেয়। এই কারণেই বেশিরভাগ ম্যানেজড DNS প্রোভাইডার নিজেদের ডোমেইনের nameserver দেয়।

<Callout type="warning">

Referral-এ যে NS রেকর্ড parent থেকে আসে, আর authoritative সার্ভারের নিজের zone-এ যে NS রেকর্ড থাকে, এ দুটো আলাদা কপি এবং **মিল না থাকতে পারে**। Resolver-রা সাধারণত child-এর নিজেরটাকে বেশি বিশ্বাস করে। প্রোভাইডার বদলানোর সময় একটা আপডেট করে অন্যটা ভুলে যাওয়া খুব কমন, আর তখন "কিছু ইউজারের জন্য কাজ করে, কিছুর জন্য করে না" ধরনের সমস্যা হয়।

</Callout>

## dig +trace: যাত্রাটা নিজের চোখে দেখুন

`dig +trace` আপনার resolver-এর ক্যাশ এড়িয়ে root থেকে শুরু করে নিজেই প্রতিটা ধাপ করে, আর প্রতিটা referral দেখায়। নিচের আউটপুট উদাহরণের জন্য (নাম ও IP বানানো, আকৃতি আসল):

```text
$ dig +trace +nodnssec www.baytalhikma.org A

; <<>> DiG 9.18.28 <<>> +trace +nodnssec www.baytalhikma.org A
;; global options: +cmd
.                    518400  IN  NS  a.root-servers.net.
.                    518400  IN  NS  b.root-servers.net.
;; ... (13 lines total, a to m)
;; Received 239 bytes from 192.168.0.1#53(192.168.0.1) in 4 ms

org.                 172800  IN  NS  a0.org.afilias-nst.info.
org.                 172800  IN  NS  a2.org.afilias-nst.info.
org.                 172800  IN  NS  b0.org.afilias-nst.org.
;; ... more NS lines
;; Received 812 bytes from 199.7.83.42#53(l.root-servers.net) in 22 ms

baytalhikma.org.     3600    IN  NS  ns1.baytalhikma.org.
baytalhikma.org.     3600    IN  NS  ns2.baytalhikma.org.
;; Received 128 bytes from 199.19.56.1#53(a0.org.afilias-nst.info) in 31 ms

www.baytalhikma.org. 300     IN  A   192.0.2.10
;; Received 64 bytes from 198.51.100.53#53(ns1.baytalhikma.org) in 18 ms
```

লাইন ধরে পড়ুন:

1. **প্রথম ব্লক:** `dig` আপনার লোকাল resolver (`192.168.0.1`) থেকে root-এর NS লিস্ট নেয়। এটাই একমাত্র ধাপ যেখানে লোকাল resolver ব্যবহার হয়।
2. **দ্বিতীয় ব্লক:** একটা root server (`l.root-servers.net`) উত্তর দিল `.org`-এর NS দিয়ে। এটা referral। `Received ... from` লাইন বলে কোন সার্ভার উত্তর দিয়েছে আর কত সময় লেগেছে।
3. **তৃতীয় ব্লক:** `.org`-এর একটা সার্ভার `baytalhikma.org`-এর NS দিল। আরেকটা referral।
4. **শেষ ব্লক:** `ns1.baytalhikma.org` আসল A রেকর্ড দিল। যাত্রা শেষ।

TTL কলাম খেয়াল করুন: root থেকে আসা `.org` NS-এর TTL `172800` (দুই দিন), তাই resolver দুই দিনে একবারের বেশি root-এ `.org`-এর জন্য যায় না।

<Callout type="tip">

ডিবাগিংয়ে `+trace`-এর সবচেয়ে বড় কাজ: **কোন ধাপে যাত্রা ভাঙছে সেটা দেখা।** যদি TLD-এর referral-এ পুরনো nameserver আসে, রেজিস্ট্রারে NS আপডেট হয়নি। যদি শেষ ধাপে timeout হয়, আপনার authoritative সার্ভার ডাউন বা ফায়ারওয়াল পোর্ট ৫৩ আটকাচ্ছে। যদি শেষ ধাপে পুরনো IP আসে, সমস্যা আপনার zone-এ, ক্যাশে না।

</Callout>

**একটা অদ্ভুত কিন্তু শিক্ষণীয় ঘটনা:** কিছু নেটওয়ার্কে (হোটেল, কিছু ISP, কিছু অফিস) `dig +trace` চালালে দেখবেন root server নিজেই চূড়ান্ত উত্তর দিয়ে দিচ্ছে, যেমন `www.wikipedia.org`-এর CNAME আর A রেকর্ড, `j.root-servers.net` থেকে। Root কখনো এমন উত্তর দেয় না। এর মানে আপনার নেটওয়ার্ক পোর্ট ৫৩-এর সব ট্রাফিক মাঝপথে ধরে নিজের resolver দিয়ে উত্তর দিচ্ছে (**transparent DNS interception**)। এমন নেটওয়ার্কে `dig @8.8.8.8` দিয়ে "পাবলিক resolver থেকে দেখছি" ভাবলে ভুল হবে; উত্তর আসলে আসছে নেটওয়ার্কের resolver থেকে। এগারো নম্বর চ্যাপ্টারে DoH/DoT এর সমাধান দেখবেন।

## Resolver-এর শর্টকাট

বাস্তবে cold cache প্রায় কখনো হয় না। একটা ব্যস্ত resolver-এ:

- **Root-এর উত্তর প্রায় সবসময় ক্যাশে থাকে।** TLD-এর NS রেকর্ডের TTL দুই দিন, আর জনপ্রিয় TLD প্রতি সেকেন্ডে কেউ না কেউ খুঁজছে।
- **অনেক resolver root zone-এর একটা লোকাল কপিই রাখে** (RFC 8806, "root on loopback" বা "local root")। তখন root-এ কোনো প্রশ্নই যায় না।
- **TLD-এর referral-ও ক্যাশে থাকে।** তাই `www.baytalhikma.org` খোঁজার পর `api.baytalhikma.org` খুঁজলে resolver সরাসরি `ns1.baytalhikma.org`-এ যায়।

ফলে একটা সাধারণ লুকআপ হয় একটা ক্যাশ হিট (১ মিলিসেকেন্ডেরও কম), অথবা একটা মাত্র authoritative প্রশ্ন।

```bash
# Run the same query twice and compare "Query time"
dig www.wikipedia.org | grep "Query time"
dig www.wikipedia.org | grep "Query time"
# second one is usually 0-1 msec: served from the resolver cache
```

## QNAME minimisation: কম বলো, কম ফাঁস করো

ওপরের ডায়াগ্রামে resolver root-কে পুরো নাম `www.baytalhikma.org` বলেছে, যদিও root-এর জানার দরকার শুধু `.org`। এটা প্রাইভেসি লিক: root আর TLD অপারেটর জেনে যায় আপনি ঠিক কোন হোস্ট খুঁজছেন।

**QNAME minimisation** (RFC 9156) এটা ঠিক করে: resolver প্রতিটা সার্ভারকে শুধু ততটুকু বলে যতটুকু দরকার।

```text
to root:      "NS org?"
to .org:      "NS baytalhikma.org?"
to ns1:       "A www.baytalhikma.org?"
```

আধুনিক resolver-গুলো (Unbound, BIND 9.14+, Knot Resolver, PowerDNS Recursor) ডিফল্টে এটা চালু রাখে। একটা পার্শ্বপ্রতিক্রিয়া আছে: কিছু পুরনো বা ভাঙা authoritative সার্ভার মাঝের নামের (যেমন `_tcp.baytalhikma.org`) জন্য ভুল উত্তর দেয়, আর তখন resolver "relaxed" মোডে পুরো নাম দিয়ে আবার চেষ্টা করে।

## "এক লুকআপ" আসলে কয়টা লুকআপ

একটা পেজ খোলা মানে প্রায় কখনো একটা লুকআপ না:

- **A আর AAAA দুটোই।** আধুনিক OS আর ব্রাউজার IPv4 আর IPv6 একসাথে খোঁজে ("Happy Eyeballs")।
- **HTTPS রেকর্ড।** নতুন ব্রাউজারগুলো তৃতীয় একটা প্রশ্ন করে (তিন নম্বর চ্যাপ্টার)।
- **CNAME চেইন।** `www.wikipedia.org` → `dyna.wikimedia.org` → IP। প্রতিটা CNAME-এর টার্গেট আলাদা zone-এ হলে আলাদা যাত্রা।
- **Nameserver-এর নিজের নাম।** NS যদি অন্য ডোমেইনে থাকে, সেটাও রিজলভ করতে হয়।
- **পেজের ভেতরের প্রতিটা ডোমেইন।** CDN, ফন্ট, অ্যানালিটিক্স, API।

তাই একটা সাধারণ ওয়েবপেজ কয়েক ডজন DNS প্রশ্ন তৈরি করতে পারে। অধিকাংশ ক্যাশ থেকে আসে, কিন্তু প্রথম ভিজিটে DNS latency সত্যিই পেজ লোডের একটা অংশ।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

**লক্ষণ: নাম রিজলভ হচ্ছে না, কিন্তু জানি না কোন ধাপে ভাঙছে।**
নিশ্চিত হোন:

```bash
dig +trace +nodnssec www.baytalhikma.org
```

যে ব্লকে থেমে যায় বা ভুল তথ্য আসে, সমস্যা সেখানে। TLD পর্যন্ত ঠিক কিন্তু শেষ ধাপে timeout মানে authoritative সার্ভার পৌঁছানো যাচ্ছে না।

**লক্ষণ: authoritative সার্ভার ঠিক উত্তর দেয়, কিন্তু আমার resolver দেয় না।**
নিশ্চিত হোন, দুটো সরাসরি তুলনা করুন:

```bash
dig +short www.baytalhikma.org @ns1.baytalhikma.org   # the source of truth
dig +short www.baytalhikma.org @1.1.1.1               # a public resolver
dig +short www.baytalhikma.org                        # your configured resolver
```

প্রথমটা ঠিক কিন্তু বাকিগুলো পুরনো মানে ক্যাশ (চার নম্বর চ্যাপ্টার)। প্রথমটাই ভুল মানে zone-এ সমস্যা।

**লক্ষণ: নতুন প্রোভাইডারে গেলাম, কিছু ইউজার পুরনো রেকর্ড দেখছে দিনের পর দিন।**
নিশ্চিত হোন, parent আর child-এর NS তুলনা করুন:

```bash
dig +short NS baytalhikma.org @a0.org.afilias-nst.info   # what .org delegates to
dig +short NS baytalhikma.org @ns1.newprovider.example   # what the zone itself says
dig +short NS baytalhikma.org @ns1.oldprovider.example   # is the old zone still alive?
```

কারণ: পুরনো প্রোভাইডারের zone এখনো চালু আর পুরনো ডেটা দেয়, আর কিছু resolver ক্যাশে পুরনো NS ধরে রেখেছে। ঠিক করুন: রেজিস্ট্রারে NS আপডেট নিশ্চিত করুন, আর পুরনো zone অন্তত পুরনো NS TTL পার হওয়া পর্যন্ত নতুনের সাথে মিলিয়ে রাখুন, তারপর মুছুন।

**লক্ষণ: নিজের nameserver (`ns1.baytalhikma.org`) সেট করলাম, ডোমেইন রিজলভ হয় না।**
নিশ্চিত হোন, glue আছে কিনা:

```bash
dig NS baytalhikma.org @a0.org.afilias-nst.info +norecurse
# look for an ADDITIONAL section with A/AAAA for ns1/ns2
```

কারণ: in-bailiwick nameserver-এর glue রেজিস্ট্রারে রেজিস্টার করা হয়নি। ঠিক করুন: রেজিস্ট্রারের "child nameserver / host record" সেকশনে IP যোগ করুন।

**লক্ষণ: `dig +trace`-এ root নিজেই চূড়ান্ত উত্তর দিচ্ছে।**
কারণ: নেটওয়ার্ক DNS ইন্টারসেপ্ট করছে। ঠিক করুন: অন্য নেটওয়ার্ক থেকে টেস্ট করুন, বা DoH দিয়ে (`curl` দিয়ে কীভাবে, এগারো নম্বর চ্যাপ্টারে)।

**লক্ষণ: authoritative সার্ভারকে অন্য ডোমেইন জিজ্ঞেস করলে `REFUSED`।**
এটা সমস্যা না, এটাই ঠিক আচরণ। Authoritative সার্ভার শুধু নিজের zone-এর উত্তর দেয়। যদি নিজের zone-এর জন্যই `REFUSED` আসে, তাহলে zone-টা সেই সার্ভারে লোড হয়নি (সাত নম্বর চ্যাপ্টার)।

## মূল শিক্ষা

1. **চার চরিত্র:** stub (জিজ্ঞেস করে), recursive resolver (খুঁজে আনে), root ও TLD (পথ দেখায়), authoritative (উত্তর জানে)।
2. **Stub → resolver হলো recursive query, resolver → বাকিরা হলো iterative।**
3. **Referral মানে "ওখানে যাও"।** Glue হলো referral-এর সাথে দেওয়া nameserver-এর IP, যা লুপ ভাঙে।
4. **`dig +trace` দেখায় কোন ধাপে ভাঙছে।** ডিবাগিংয়ের প্রথম হাতিয়ার।
5. **Authoritative-এর সাথে সরাসরি (`@ns1...`) তুলনা করুন** ক্যাশ আর zone-এর সমস্যা আলাদা করতে।
6. **বাস্তবে বেশিরভাগ লুকআপ ক্যাশ হিট।** Root আর TLD-এ যাওয়া বিরল।
7. **QNAME minimisation** প্রতিটা সার্ভারকে শুধু দরকারি অংশ বলে, প্রাইভেসি বাড়ায়।
