---
title: 'DNS ডিবাগিং প্লেবুক'
subtitle: 'আন্দাজ না করে লেয়ার ধরে ধরে পরীক্ষা — সাত ধাপের পদ্ধতি, প্রতিটা লক্ষণের সম্ভাব্য কারণ, নিশ্চিত করার কমান্ড আর সমাধান, সাথে একটা কপি-পেস্ট হেলথ-চেক স্ক্রিপ্ট।'
chapter: 14
level: 'mastery'
readingTime: '৩০ মিনিট'
topics: ['dns debugging', 'troubleshooting', 'dig', 'servfail', 'nxdomain', 'kubernetes dns', 'dnssec', 'lets encrypt']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

গ্রামের বাজারে দুইজন চিকিৎসক বসেন। একজন কবিরাজ কিন্দি, আরেকজন সদ্য পাস করা ডাক্তার রাজি। রুশদ এসে বলে, "পেটে ব্যথা, তিন দিন ধরে।" কিন্দি নাড়ি ধরে এক সেকেন্ড ভাবেন, তারপর বলেন, "গ্যাস, এই হজমি খান।" আগেরবার একজনের পেট ব্যথা গ্যাস ছিল, তাই এবারও গ্যাস। ব্যথা কমে না, রুশদ আরেকটা হজমি নেয়, তারপর আরেকটা। তিন বোতল হজমি শেষে দেখা যায় সমস্যা ছিল অ্যাপেন্ডিক্স।

রাজি অন্যভাবে কাজ করেন। প্রথমে জিজ্ঞেস করেন ব্যথা ঠিক কোথায়, কখন বাড়ে, জ্বর আছে কিনা, কী খেয়েছিলেন। তারপর একটা একটা জিনিস বাদ দেন: জ্বর নেই, তাই সংক্রমণ কম সম্ভাব্য; ব্যথা নাভির ডান দিকে নিচে, চাপ দিলে বাড়ে, তাই অ্যাপেন্ডিক্স সন্দেহ; রক্ত পরীক্ষায় নিশ্চিত হন। প্রতিটা পরীক্ষা একটা প্রশ্নের উত্তর দেয়, আর প্রতিটা উত্তর সন্দেহের তালিকা ছোট করে। রাজি কখনো একসাথে তিনটা ওষুধ দেন না, কারণ তাহলে কোনটায় কাজ হলো বোঝা যায় না। আর তিনি নিজের অনুমানের চেয়ে পরীক্ষার রিপোর্টকে বেশি বিশ্বাস করেন।

মিলিয়ে নিই: কিন্দির "আগেরবার গ্যাস ছিল তাই এবারও গ্যাস" হলো **আন্দাজে ডিবাগিং**, যেমন "DNS propagation, অপেক্ষা করো" বলে দেওয়া। হজমির পর হজমি হলো **ক্যাশ ফ্লাশের পর ক্যাশ ফ্লাশ**। রাজির প্রশ্নগুলো হলো **লক্ষণ সংগ্রহ** (কে, কোথা থেকে, কোন নাম, কখন থেকে), একটা একটা জিনিস বাদ দেওয়া হলো **লেয়ার ধরে ধরে পরীক্ষা** (client → recursive → authoritative → parent), রক্ত পরীক্ষা হলো **`dig`-এর আসল আউটপুট**, আর একসাথে একটাই ওষুধ হলো **একবারে একটাই পরিবর্তন**। বাস্তবে ভালো SRE-রা ঠিক এভাবেই DNS ইনসিডেন্ট সামলান, আর এই চ্যাপ্টার সেই পদ্ধতিটা লিখে রাখে।

## প্রথম নিয়ম: আন্দাজ নয়, প্রমাণ

DNS সমস্যার সবচেয়ে বড় শত্রু তিনটা বাক্য:

- **"DNS propagation, ২৪-৪৮ ঘণ্টা অপেক্ষা করুন।"** DNS-এ কোনো propagation নেই, আছে শুধু cache expiry (চ্যাপ্টার ৪)। কোন ক্যাশ কতক্ষণ ধরে রাখবে, সেটা TTL দেখে মিনিট পর্যন্ত হিসাব করা যায়।
- **"আমার এখানে তো চলছে।"** আপনার মেশিন একটা নির্দিষ্ট resolver, ক্যাশ আর `/etc/hosts` দিয়ে দেখছে। অন্যের মেশিনে এর প্রতিটা আলাদা হতে পারে।
- **"ক্যাশ ফ্লাশ করে দেখো।"** কোন ক্যাশ? ব্রাউজার, OS, লোকাল stub, ISP resolver, নাকি negative cache? না জেনে ফ্লাশ করা হজমির পর হজমি।

পদ্ধতি হলো: **লক্ষণ লিখে নিন, তারপর প্রশ্নের পথ ধরে প্রতিটা হপে আলাদাভাবে জিজ্ঞেস করুন, যতক্ষণ না দুইটা পাশাপাশি হপের উত্তর না মেলে।** যেখানে উত্তর বদলায়, সমস্যা সেখানেই।

### লক্ষণ সংগ্রহের চেকলিস্ট

কোনো কমান্ড চালানোর আগে এই প্রশ্নগুলোর উত্তর লিখুন:

1. **ঠিক কোন নাম?** `baytalhikma.org` নাকি `www.baytalhikma.org`? টাইপো? শেষে ডট?
2. **কোন রেকর্ড টাইপ?** ব্রাউজার A আর AAAA দুটোই চায়; ইমেইল MX; Let's Encrypt TXT বা CAA।
3. **কে দেখছে সমস্যা?** সবাই, নাকি কিছু ইউজার? একটা দেশ? একটা ISP? একটা অফিস? মোবাইল ডেটা বনাম Wi-Fi?
4. **ঠিক কী এরর?** `NXDOMAIN`, `SERVFAIL`, টাইমআউট, ভুল IP, নাকি আসলে DNS ঠিক আছে কিন্তু কানেকশন হচ্ছে না?
5. **কখন থেকে?** সম্প্রতি কোনো পরিবর্তন: রেকর্ড এডিট, nameserver বদল, DNSSEC চালু, রেজিস্ট্রার ট্রান্সফার, ডোমেইন রিনিউয়ের তারিখ?
6. **স্থায়ী নাকি মাঝে মাঝে?** মাঝে মাঝে হলে প্রায় সবসময়ই কোনো একটা সার্ভার বাকিদের থেকে আলাদা উত্তর দিচ্ছে।

## সাত ধাপের পদ্ধতি

<Mermaid
title="DNS debugging decision path"
code={`graph TD
  S["Symptom reported"] --> Q1{"1. Is it DNS?<br/>does the name resolve<br/>to the expected IP?"}
  Q1 -->|"yes, right IP"| NOTDNS["Not DNS: check TCP, TLS,<br/>firewall, app"]
  Q1 -->|"no / error"| Q2{"2. What resolver does<br/>the client really use?<br/>hosts file, stub, DoH"}
  Q2 -->|"local override found"| FIXL["Fix hosts / VPN / browser DoH"]
  Q2 -->|"normal path"| Q3{"3. Recursive answer<br/>matches public resolvers?"}
  Q3 -->|"differs"| FIXR["Resolver cache, filtering,<br/>split-horizon"]
  Q3 -->|"same problem everywhere"| Q4{"4. Every authoritative NS<br/>gives the right answer?"}
  Q4 -->|"one NS differs"| FIXA["Stale secondary,<br/>serial, provider sync"]
  Q4 -->|"all wrong"| FIXZ["Fix the record in the zone"]
  Q4 -->|"all right"| Q5{"5. Parent delegates to<br/>those same NS?"}
  Q5 -->|"no"| FIXD["Fix NS at registrar,<br/>glue records"]
  Q5 -->|"yes"| Q6{"6. SERVFAIL only when<br/>validating? +cd works?"}
  Q6 -->|"yes"| FIXS["DNSSEC: DS vs DNSKEY,<br/>expired RRSIG"]
  Q6 -->|"no"| Q7{"7. Transport: TCP, size,<br/>firewall, MTU"}
  Q7 --> FIXT["Allow TCP 53, EDNS 1232,<br/>fix truncation"]`}
/>

প্রতিটা ধাপের কমান্ড নিচে। উদাহরণের সব আউটপুট উদাহরণস্বরূপ (illustrative), আপনার নাম আর IP বসিয়ে চালান।

### ধাপ ১: এটা কি আসলেই DNS?

অনেক "DNS সমস্যা" আসলে DNS না। নাম ঠিক IP-তে resolve হচ্ছে কিনা আগে দেখুন:

```bash
dig +short www.baytalhikma.org A
dig +short www.baytalhikma.org AAAA
```

```text
203.0.113.20
2001:db8:10::20
```

IP ঠিক থাকলে DNS-এর কাজ শেষ। এখন সংযোগ পরীক্ষা করুন, DNS-কে পুরো বাদ দিয়ে:

```bash
# Connect to the IP directly but send the right Host/SNI
curl -v --resolve www.baytalhikma.org:443:203.0.113.20 https://www.baytalhikma.org/
```

এটা কাজ করলে আর নাম দিয়ে না করলে, সমস্যা ক্লায়েন্টের resolve করার পথে (ধাপ ২)। এটাও কাজ না করলে সমস্যা নেটওয়ার্ক, firewall, TLS বা অ্যাপে, DNS-এ না। একটা কমন ফাঁদ: A ঠিক আছে কিন্তু AAAA পুরনো সার্ভারে ইশারা করছে, আর ক্লায়েন্ট IPv6 পছন্দ করে বলে ওটাতেই যাচ্ছে। তাই সবসময় **দুটোই** দেখুন।

### ধাপ ২: ক্লায়েন্ট আসলে কোন resolver আর কোন পথ ব্যবহার করছে?

`dig` OS-এর resolver লাইব্রেরি ব্যবহার করে না, সরাসরি `/etc/resolv.conf`-এর সার্ভারকে জিজ্ঞেস করে। কিন্তু ব্রাউজার আর বেশিরভাগ অ্যাপ OS-এর পথ ধরে, যেটা `/etc/hosts`, mDNS, VPN-এর split DNS, এমনকি নিজস্ব DoH ব্যবহার করতে পারে (চ্যাপ্টার ৮)। তাই অ্যাপ যা দেখে, সেটাই দেখুন:

```bash
# Linux: what the system resolver (NSS) returns, including /etc/hosts
getent ahosts www.baytalhikma.org

# Linux with systemd-resolved: which link/server answered
resolvectl query www.baytalhikma.org
resolvectl status

# macOS: the system resolver path, including /etc/hosts and per-domain resolvers
dscacheutil -q host -a name www.baytalhikma.org
scutil --dns | less

# Windows (PowerShell)
Resolve-DnsName www.baytalhikma.org
Get-DnsClientNrptPolicy
```

```text
; illustrative: getent shows a hosts-file override
10.0.0.5        STREAM www.baytalhikma.org
```

`getent` বা `dscacheutil`-এর উত্তর আর `dig`-এর উত্তর আলাদা হলে, মাঝখানে কিছু একটা আছে:

- `/etc/hosts` (Windows-এ `C:\Windows\System32\drivers\etc\hosts`)-এ পুরনো এন্ট্রি
- VPN একটা ডোমেইনের জন্য আলাদা resolver সেট করেছে (macOS `scutil --dns`-এ `resolver #N` ব্লক, Windows NRPT)
- ব্রাউজারের নিজস্ব DoH (Chrome/Firefox-এর সিকিউর DNS সেটিং), যেটা OS-কে পুরো এড়িয়ে যায়
- কন্টেইনারের ভেতরে আলাদা `/etc/resolv.conf`

ব্রাউজারের নিজের ক্যাশ আর রেজোলিউশন দেখতে Chromium-এ `chrome://net-internals/#dns` (সেখানে ক্যাশ ক্লিয়ারের বোতামও আছে); Firefox-এ `about:networking#dns`।

### ধাপ ৩: recursive resolver কী বলছে, আর অন্যরা কী বলছে?

এবার নিজের resolver আর কয়েকটা পাবলিক resolver পাশাপাশি:

```bash
for r in "" @1.1.1.1 @8.8.8.8 @9.9.9.9; do
  printf '%-10s ' "${r:-default}"
  dig $r +noall +answer +comments www.baytalhikma.org A | awk '/status:/{printf "%s ", $6} /IN[[:space:]]+A/{printf "%s ttl=%s ", $5, $2} END{print ""}'
done
```

```text
; illustrative
default    NOERROR, 198.51.100.7 ttl=2841
@1.1.1.1   NOERROR, 203.0.113.20 ttl=300
@8.8.8.8   NOERROR, 203.0.113.20 ttl=287
@9.9.9.9   NOERROR, 203.0.113.20 ttl=300
```

এখানে গল্পটা পরিষ্কার: ডিফল্ট resolver পুরনো IP ধরে আছে, আর তার TTL ২৮৪১ সেকেন্ড বাকি, মানে আগের রেকর্ডের TTL ছিল বড় (ধরুন ৩৬০০)। প্রায় ৪৭ মিনিট পর নিজেই ঠিক হবে, অথবা resolver-এর অ্যাডমিন ক্যাশ ফ্লাশ করতে পারেন। **TTL কলামটাই বলে দেয় কতক্ষণ অপেক্ষা।**

সব resolver একই ভুল উত্তর দিলে সমস্যা উপরে: authoritative-এ।

### ধাপ ৪: প্রতিটা authoritative nameserver কী বলছে?

ক্যাশ পুরো বাদ দিয়ে উৎসকে জিজ্ঞেস করুন, আর **প্রতিটা** nameserver আলাদা করে, কারণ resolver এদের যেকোনো একটাকে বেছে নেয়:

```bash
for ns in $(dig +short NS baytalhikma.org); do
  printf '%-26s ' "$ns"
  dig +norecurse +short www.baytalhikma.org A @"$ns" | tr '\n' ' '
  printf ' serial=%s\n' "$(dig +norecurse +short SOA baytalhikma.org @"$ns" | awk '{print $3}')"
done
```

```text
; illustrative: one secondary is stale
ns1.baytalhikma.org.       203.0.113.20  serial=2026102302
ns2.baytalhikma.org.       203.0.113.20  serial=2026102302
ns3.cordoba.example.       198.51.100.7  serial=2026101501
```

`+norecurse` জরুরি: এটা নিশ্চিত করে আপনি সার্ভারের নিজের zone ডেটা দেখছেন। উত্তরে `aa` ফ্ল্যাগ (authoritative answer) থাকতে হবে; না থাকলে ওই সার্ভার এই zone-এর জন্য authoritative না (lame delegation, নিচে দেখুন)।

এখানে `ns3`-এর serial পিছিয়ে আছে: secondary zone transfer পায়নি। তিনটার একটা ভুল উত্তর দিচ্ছে মানে মোটামুটি এক-তৃতীয়াংশ প্রশ্নে ভুল আসবে, আর সেটাই "মাঝে মাঝে কাজ করে" লক্ষণ।

### ধাপ ৫: parent কি এই nameserver-গুলোতেই delegate করছে?

zone নিজে যে NS তালিকা দেয় আর parent (TLD) যে NS তালিকা দেয়, দুটো আলাদা জিনিস। resolver মানে **parent-এরটা** (চ্যাপ্টার ৬)। রেজিস্ট্রারে nameserver বদলানো ভুলে গেলে zone-এ যতই এডিট করুন, কেউ দেখবে না।

```bash
# Find the TLD's servers, then ask one of them directly without recursion
dig +short NS org.
dig +norecurse NS baytalhikma.org @a0.org.afilias-nst.info
```

```text
; illustrative
;; flags: qr; QUERY: 1, ANSWER: 0, AUTHORITY: 2, ADDITIONAL: 3

;; AUTHORITY SECTION:
baytalhikma.org.   3600  IN  NS  ns1.oldhost.example.
baytalhikma.org.   3600  IN  NS  ns2.oldhost.example.
```

ANSWER খালি আর AUTHORITY-তে NS: এটা referral, স্বাভাবিক। কিন্তু এখানে delegation এখনো পুরনো হোস্টে! মানে মাইগ্রেশনে রেজিস্ট্রারে NS বদলানো হয়নি। পুরো পথটা এক কমান্ডে দেখতে `dig +trace www.baytalhikma.org` (চ্যাপ্টার ৫)।

nameserver যদি নিজের ডোমেইনের ভেতরে থাকে (`ns1.baytalhikma.org`), parent-এর ADDITIONAL সেকশনে **glue** (তার IP) থাকতে হবে, আর সেটা সঠিক হতে হবে। nameserver-এর IP বদলালে রেজিস্ট্রারে glue আপডেট করতে হয়, নইলে পুরো ডোমেইন অদৃশ্য।

### ধাপ ৬: DNSSEC কি উত্তর আটকে দিচ্ছে?

`SERVFAIL`-এর সবচেয়ে কমন কারণ ভাঙা DNSSEC। পরীক্ষাটা সহজ: validation বন্ধ করে (`+cd`, checking disabled) একই প্রশ্ন।

```bash
dig www.baytalhikma.org A @1.1.1.1 | grep status
dig +cd www.baytalhikma.org A @1.1.1.1 | grep status
```

```text
;; ->>HEADER<<- opcode: QUERY, status: SERVFAIL, id: 5512
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 23017
```

validation সহ `SERVFAIL`, validation ছাড়া `NOERROR` মানে নিশ্চিতভাবে DNSSEC। এরপর কারণ খুঁজুন:

```bash
# DS at the parent: key tags it expects
dig +short DS baytalhikma.org
# DNSKEYs in the zone: key tags it actually has
dig +multi DNSKEY baytalhikma.org | grep 'key id'
# signature expiry dates
dig +dnssec +multi www.baytalhikma.org A @ns1.baytalhikma.org | grep -A1 RRSIG
```

```text
; illustrative: DS points at a key that no longer exists
31406 13 2 6F2C...E1A9
; KSK; alg = ECDSAP256SHA256 ; key id = 48871
; ZSK; alg = ECDSAP256SHA256 ; key id = 10293
```

DS-এর key tag ৩১৪০৬, কিন্তু zone-এ KSK হলো ৪৮৮৭১: কেউ কী রোলওভার করেছে (বা DNS প্রোভাইডার বদলেছে) কিন্তু রেজিস্ট্রারে DS আপডেট করেনি। Extended DNS Errors (RFC 8914) সাপোর্ট করা resolver-রা কারণটা সরাসরি বলে দেয়, `dig`-এর আউটপুটে `EDE:` লাইনে দেখবেন (যেমন `EDE: 9 (DNSKEY Missing)` বা `EDE: 7 (Signature Expired)`)। পুরো chain-এর ছবি দেখতে DNSViz (dnsviz.net) সবচেয়ে ভালো টুল।

### ধাপ ৭: ট্রান্সপোর্ট — UDP, TCP, সাইজ

ছোট উত্তর আসে কিন্তু বড়গুলো (অনেক TXT, DNSSEC, অনেক A রেকর্ড) টাইমআউট হলে সন্দেহ করুন ট্রান্সপোর্ট:

```bash
dig baytalhikma.org TXT @ns1.baytalhikma.org              # UDP
dig +tcp baytalhikma.org TXT @ns1.baytalhikma.org         # TCP
dig +bufsize=1232 +dnssec baytalhikma.org TXT @ns1.baytalhikma.org
```

```text
; illustrative: UDP truncated, TCP blocked
;; Truncated, retrying in TCP mode.
;; communications error to 192.0.2.53#53: timed out
```

UDP উত্তর বড় হলে সার্ভার `TC` (truncated) ফ্ল্যাগ দেয়, ক্লায়েন্ট TCP-তে আবার চেষ্টা করে। firewall যদি TCP 53 ব্লক করে, ঠিক এই বড় উত্তরগুলোই মরে যায়। DNS Flag Day 2020 থেকে নিয়ম পরিষ্কার: DNS-কে TCP-তে কাজ করতেই হবে, আর UDP-তে EDNS বাফার ১২৩২ byte (ফ্র্যাগমেন্টেশন এড়াতে)। ফ্র্যাগমেন্টেড বড় UDP প্যাকেট পথের কোনো firewall ফেলে দিলেও একই রকম টাইমআউট দেখায়।

## লক্ষণ থেকে সমাধান: পূর্ণ ক্যাটালগ

প্রতিটা এন্ট্রি একই ছাঁচে: **লক্ষণ → সম্ভাব্য কারণ → নিশ্চিত করার কমান্ড → সমাধান।** নিজের সমস্যা খুঁজতে লক্ষণের শিরোনাম দেখুন।

### dig-এর status code পড়া

আগে ভাষাটা পরিষ্কার করে নিই, কারণ ক্যাটালগের অর্ধেক এগুলোর উপর দাঁড়িয়ে:

| Status / অবস্থা | অর্থ                                                                 | কোথায় খুঁজবেন                                  |
| --------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| `NOERROR` + উত্তর | সব ঠিক                                                              | —                                               |
| `NOERROR`, ANSWER: 0 (**NODATA**) | নামটা আছে, কিন্তু এই টাইপের রেকর্ড নেই                  | রেকর্ড টাইপ, CNAME, AAAA না থাকা                 |
| `NXDOMAIN`      | নামটাই নেই (এর কোনো টাইপের রেকর্ডই নেই)                                | টাইপো, ভুল zone, delegation, ফিল্টারিং           |
| `SERVFAIL`      | resolver উত্তর বের করতে পারেনি                                         | DNSSEC, সব NS অপ্রাপ্য, lame delegation           |
| `REFUSED`       | সার্ভার এই প্রশ্নের উত্তর দিতে রাজি না                                  | ভুল সার্ভার, ACL, zone লোড হয়নি                   |
| টাইমআউট         | কোনো উত্তরই আসেনি                                                     | নেটওয়ার্ক, firewall, সার্ভার ডাউন, TCP/সাইজ       |

### NXDOMAIN, অথচ নামটা আছে

**কারণ:** (ক) টাইপো বা ভুল সাবডোমেইন; (খ) রেকর্ডটা ভুল zone-এ বানানো হয়েছে (যেমন `api.baytalhikma.org` zone-এর ভেতরে `api` না লিখে `api.baytalhikma.org` লেখা, ফলে তৈরি হয়েছে `api.baytalhikma.org.baytalhikma.org`); (গ) delegation ভুল প্রোভাইডারে, যেখানে zone-টা আছে কিন্তু রেকর্ড নেই; (ঘ) **negative cache**: রেকর্ড বানানোর আগে কেউ নামটা খুঁজেছিল, resolver NXDOMAIN ক্যাশ করেছে; (ঙ) resolver-এর ফিল্টারিং/RPZ।

**নিশ্চিত করুন:**

```bash
dig +norecurse api.baytalhikma.org A @ns1.baytalhikma.org     # authoritative truth
dig api.baytalhikma.org A | grep -A2 'AUTHORITY SECTION'      # negative answer's SOA
dig api.baytalhikma.org.baytalhikma.org A @ns1.baytalhikma.org # the double-name mistake
```

```text
;; AUTHORITY SECTION:
baytalhikma.org.  1800  IN  SOA  ns1.baytalhikma.org. hostmaster.baytalhikma.org. 2026102301 7200 900 1209600 3600
```

negative উত্তরের সাথে আসা SOA-র TTL (এখানে ১৮০০) বলে দেয় NXDOMAIN কতক্ষণ ক্যাশে থাকবে: SOA-র TTL আর তার শেষ ফিল্ড (minimum, এখানে ৩৬০০), এই দুটোর ছোটটা (RFC 2308)।

**সমাধান:** authoritative ঠিক উত্তর দিলে negative cache শেষ হওয়ার অপেক্ষা, বা resolver ফ্লাশ। নতুন নাম লাইভ করার আগে কাউকে সেটা খুঁজতে দেবেন না (মনিটরিং টুল প্রায়ই আগেভাগে খুঁজে NXDOMAIN ক্যাশ করিয়ে দেয়)। আর zone-এর negative TTL ছোট রাখুন (৩০০ থেকে ৩৬০০)।

### NODATA: নাম আছে, কিন্তু উত্তর খালি

**কারণ:** ভুল টাইপ খুঁজছেন (A চেয়েছেন, আছে শুধু AAAA, বা উল্টো); MX খুঁজছেন এমন নামে যেখানে শুধু A; অথবা একটা wildcard আছে অন্য টাইপের।

**নিশ্চিত করুন:**

```bash
dig +norecurse baytalhikma.org ANY @ns1.baytalhikma.org   # many servers answer minimally (RFC 8482)
for t in A AAAA CNAME MX TXT; do echo "$t: $(dig +short baytalhikma.org $t)"; done
```

**সমাধান:** যে টাইপ দরকার সেটা যোগ করুন। `ANY`-র উপর ভরসা করবেন না: RFC 8482 থেকে অনেক সার্ভার `ANY`-তে ইচ্ছাকৃতভাবে শুধু একটা রেকর্ড বা HINFO দেয়।

### SERVFAIL

**কারণ, সম্ভাবনার ক্রমে:** (ক) DNSSEC ভাঙা (DS আর DNSKEY মেলে না, RRSIG মেয়াদোত্তীর্ণ); (খ) **lame delegation**: parent যে NS-এ পাঠায়, তারা zone-এর জন্য authoritative না (zone মুছে ফেলা হয়েছে, বা প্রোভাইডার বদলের পর পুরনো NS রয়ে গেছে); (গ) সব authoritative সার্ভার অপ্রাপ্য (ডাউন, IP বদলেছে কিন্তু glue পুরনো, DDoS); (ঘ) resolver নিজে অসুস্থ।

**নিশ্চিত করুন:**

```bash
dig +cd name A @1.1.1.1 | grep status            # NOERROR here => DNSSEC (step 6)
for ns in $(dig +short NS baytalhikma.org @1.1.1.1 +cd); do
  echo "== $ns"; dig +norecurse SOA baytalhikma.org @"$ns" +time=2 +tries=1 | grep -E 'status|flags'
done
```

```text
; illustrative: a lame nameserver
== ns2.oldhost.example.
;; ->>HEADER<<- opcode: QUERY, status: REFUSED, id: 1201
;; flags: qr; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 1
```

`REFUSED` বা `aa` ছাড়া উত্তর মানে ওই NS lame। একটা lame NS বাকিগুলো ঠিক থাকলে শুধু ধীরতা আনে, সবগুলো lame হলে SERVFAIL।

**সমাধান:** DNSSEC হলে রেজিস্ট্রারে সঠিক DS বসান (বা জরুরি অবস্থায় DS সরান, মনে রেখে যে DS নিজেও parent-এর TTL অনুযায়ী ক্যাশ হয়)। lame হলে রেজিস্ট্রারে NS তালিকা ঠিক করুন। অপ্রাপ্য হলে glue আর সার্ভারের অবস্থা দেখুন।

### REFUSED

**কারণ:** এমন সার্ভারকে জিজ্ঞেস করছেন যেটা এই zone হোস্ট করে না আর recursion দেয় না; zone ফাইলে সিনট্যাক্স এরর তাই সার্ভার zone লোড করেনি; ACL আপনার IP-কে আটকাচ্ছে।

**নিশ্চিত করুন:** সার্ভারের লগ (`journalctl -u named`, `journalctl -u knot`, `pdns_server` লগ) আর zone চেকার:

```bash
named-checkzone baytalhikma.org /etc/bind/zones/db.baytalhikma.org
kzonecheck -o baytalhikma.org /var/lib/knot/baytalhikma.org.zone
```

```text
; illustrative
zone baytalhikma.org/IN: loading from master file db.baytalhikma.org failed: unknown RR type
zone baytalhikma.org/IN: not loaded due to errors.
```

**সমাধান:** zone ফাইলের এরর ঠিক করুন, প্রতিবার রিলোডের আগে চেকার চালান (CI-তে রাখুন)।

### টাইমআউট

**কারণ:** resolver-এ পৌঁছানো যাচ্ছে না (ভুল IP, firewall, VPN), authoritative ডাউন, UDP 53 বা TCP 53 ব্লক, বড় উত্তর ফ্র্যাগমেন্টেশনে হারাচ্ছে।

**নিশ্চিত করুন:**

```bash
dig +tries=1 +time=2 example.com @1.1.1.1         # can we reach any resolver at all?
dig +tcp +tries=1 +time=2 example.com @1.1.1.1    # TCP path
nc -vzu 1.1.1.1 53; nc -vz 1.1.1.1 53             # raw reachability
sudo tcpdump -ni any port 53                      # are queries leaving? replies arriving?
```

**সমাধান:** `tcpdump`-এ প্রশ্ন বের হচ্ছে কিন্তু উত্তর আসছে না মানে পথ বা সার্ভার; প্রশ্নই বের হচ্ছে না মানে লোকাল কনফিগ। firewall-এ UDP আর TCP দুটোতেই 53 খুলুন।

### "আমার মেশিনে চলে, ওর মেশিনে চলে না"

**কারণ:** আলাদা resolver (একজন অফিসের, একজন বাসার), আলাদা ক্যাশ অবস্থা, একজনের `/etc/hosts`-এ এন্ট্রি, একজনের VPN, একজনের ব্রাউজারে DoH, অথবা GeoDNS আলাদা অঞ্চলে আলাদা উত্তর দিচ্ছে।

**নিশ্চিত করুন:** দুই মেশিনেই ধাপ ২ আর ৩ চালান আর আউটপুট পাশাপাশি রাখুন: কোন resolver, কী উত্তর, কত TTL। GeoDNS সন্দেহ হলে:

```bash
# Ask Google's resolver to pretend the client is in a given subnet (ECS)
dig +subnet=203.0.113.0/24 www.baytalhikma.org A @8.8.8.8 +short
dig +subnet=198.51.100.0/24 www.baytalhikma.org A @8.8.8.8 +short
```

বাইরের অনেক জায়গা থেকে একসাথে দেখতে RIPE Atlas প্রোব বা বিভিন্ন "global DNS checker" সার্ভিস ব্যবহার করুন; তবে মনে রাখুন ওরা শুধু ওদের resolver দেখায়, আপনার ইউজারেরটা না।

**সমাধান:** যে হপে পার্থক্য, সেখানে। প্রায়ই উত্তর হলো "পুরনো TTL শেষ হওয়ার অপেক্ষা" বা "hosts ফাইল থেকে এন্ট্রি মোছা"।

### 8.8.8.8-এ চলে, ISP-এর resolver-এ চলে না

**কারণ:** ISP resolver-এর ক্যাশে পুরনো উত্তর (কিছু resolver কম TTL উপেক্ষা করে নিজের ন্যূনতম TTL বসায়), ISP-এর ফিল্টারিং বা ব্লকিং, ISP resolver DNSSEC validation করে আর আপনার zone ভাঙা (বা উল্টো, ISP validation করে না তাই সেখানে চলে আর 8.8.8.8-এ চলে না!), অথবা ISP resolver NXDOMAIN-কে নিজের বিজ্ঞাপন পেজে রিডাইরেক্ট করে।

**নিশ্চিত করুন:** ধাপ ৩-এর তুলনা, সাথে `+cd` দিয়ে DNSSEC আলাদা করুন, আর ISP resolver-এর উত্তরে TTL কত।

**সমাধান:** আপনার zone ঠিক থাকলে (ধাপ ৪ ও ৬ পরিষ্কার), এটা ISP-এর বিষয়: তাদের সাপোর্টে প্রমাণসহ জানান, আর ততক্ষণ ইউজারকে অন্য resolver ব্যবহারের পরামর্শ দিন।

### ব্রাউজারে চলে, `curl` বা অ্যাপে চলে না (বা উল্টো)

**কারণ:** ব্রাউজার DoH ব্যবহার করছে (OS resolver-কে এড়িয়ে), তাই দুজন আলাদা resolver দেখছে; অথবা ব্রাউজারের নিজের ক্যাশে পুরনো উত্তর; অথবা `curl` IPv6 আগে চেষ্টা করছে আর AAAA ভাঙা।

**নিশ্চিত করুন:**

```bash
curl -v https://www.baytalhikma.org/ 2>&1 | grep -E 'Trying|Connected'
curl -4 -v https://www.baytalhikma.org/ 2>&1 | grep -E 'Trying|Connected'
curl -6 -v https://www.baytalhikma.org/ 2>&1 | grep -E 'Trying|Connected'
```

ব্রাউজারে `chrome://net-internals/#dns` দিয়ে ক্যাশের উত্তর দেখুন, আর সিকিউর DNS সেটিং কী।

**সমাধান:** ব্রাউজারের সিকিউর DNS সাময়িক বন্ধ করে বা OS-এর resolver-এ সেট করে তুলনা; সমস্যা AAAA-তে হলে ঠিক করুন বা সরান।

### `/etc/hosts` গোপনে উত্তর বদলাচ্ছে

**কারণ:** ডেভেলপমেন্টের সময় দেওয়া পুরনো এন্ট্রি, অ্যাড-ব্লকার বা কোনো টুলের লেখা এন্ট্রি।

**নিশ্চিত করুন:** `getent hosts NAME` (Linux) বা `dscacheutil -q host -a name NAME` (macOS) এর উত্তর `dig`-এর থেকে আলাদা, আর:

```bash
grep -n baytalhikma /etc/hosts
```

**সমাধান:** এন্ট্রি মুছুন। macOS-এ এরপর `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`, Windows-এ `ipconfig /flushdns`, systemd-resolved-এ `resolvectl flush-caches`।

### মাঝে মাঝে কাজ করে, মাঝে মাঝে না

**কারণ:** প্রায় সবসময়ই একাধিক উৎসের একটা বাকিদের থেকে আলাদা: N-টা authoritative NS-এর একটা stale বা lame; anycast নেটওয়ার্কের একটা নোড পুরনো ডেটা দিচ্ছে; ক্লায়েন্টের কনফিগে দুইটা resolver যাদের একটা ভাঙা (অনেক ক্লায়েন্ট দুটোকেই ঘুরিয়ে ব্যবহার করে); DNSSEC-এ শুধু কিছু রেকর্ড টাইপ ভাঙা।

**নিশ্চিত করুন:** ধাপ ৪-এর লুপ (প্রতিটা NS আলাদা), আর ক্লায়েন্টের প্রতিটা resolver আলাদা করে:

```bash
grep nameserver /etc/resolv.conf
for r in $(awk '/^nameserver/{print $2}' /etc/resolv.conf); do echo "$r: $(dig +short @$r www.baytalhikma.org)"; done
```

anycast-এ কোন নোড উত্তর দিচ্ছে বুঝতে NSID:

```bash
dig +nsid +norecurse www.baytalhikma.org A @ns1.baytalhikma.org | grep NSID
```

**সমাধান:** stale সার্ভার ঠিক করুন বা তালিকা থেকে বাদ দিন। নিচের হেলথ-চেক স্ক্রিপ্ট ঠিক এই সমস্যাই ধরে।

### মাইগ্রেশনের পরও পুরনো IP আসছে

**কারণ:** (ক) পুরনো রেকর্ডের বড় TTL এখনো শেষ হয়নি; (খ) রেজিস্ট্রারে NS বদলানো হয়নি, তাই পুরনো প্রোভাইডারের zone-ই আসল; (গ) NS বদলানো হয়েছে, কিন্তু parent-এর NS TTL (প্রায়ই ১-২ দিন) শেষ না হওয়া পর্যন্ত resolver-রা পুরনো প্রোভাইডারকে জিজ্ঞেস করছে, আর সেখানে পুরনো রেকর্ড রয়ে গেছে; (ঘ) কোনো CNAME chain-এর মাঝের লিংক এখনো পুরনো।

**নিশ্চিত করুন:**

```bash
dig +trace www.baytalhikma.org A | tail -20       # which servers are really answering
dig www.baytalhikma.org A | grep -A5 'ANSWER SECTION'   # remaining TTL, CNAME chain
```

**সমাধান:** প্রোভাইডার বদলের সময় নতুন আর পুরনো দুই প্রোভাইডারেই একই রেকর্ড কয়েক দিন রাখুন, যতক্ষণ না parent-এর NS TTL নিশ্চিতভাবে পার হয়। আর পরের বার: মাইগ্রেশনের অন্তত এক পুরনো-TTL আগে TTL কমিয়ে রাখুন (চ্যাপ্টার ৪)।

### শুধু IPv6-এ ভাঙা

**কারণ:** AAAA রেকর্ড আছে কিন্তু সার্ভার IPv6-এ শুনছে না, বা firewall-এ IPv6 নিয়ম নেই; নতুন সার্ভারে মাইগ্রেশনে A বদলানো হয়েছে, AAAA পুরনোতেই রয়ে গেছে; nameserver-এর IPv6 glue ভুল।

**নিশ্চিত করুন:**

```bash
dig +short www.baytalhikma.org AAAA
curl -6 -sv https://www.baytalhikma.org/ -o /dev/null
dig -6 +norecurse SOA baytalhikma.org @ns1.baytalhikma.org     # NS reachable over v6?
```

**সমাধান:** AAAA ঠিক করুন বা সাময়িক মুছে ফেলুন। ভাঙা AAAA থাকার চেয়ে AAAA না থাকা ভালো: Happy Eyeballs-ওয়ালা ব্রাউজার দ্রুত IPv4-এ ফিরে যায়, কিন্তু অনেক টুল আর লাইব্রেরি তা করে না।

### বড় TXT উত্তর কাটা পড়ছে বা টাইমআউট

**কারণ:** অনেক TXT রেকর্ড (ভেরিফিকেশন টোকেন জমতে জমতে, লম্বা SPF, DKIM কী) মিলে উত্তর ১২৩২ byte পার করে, UDP-তে truncated হয়, আর TCP 53 কোথাও ব্লক।

**নিশ্চিত করুন:** ধাপ ৭-এর কমান্ড, আর উত্তরের সাইজ: `dig baytalhikma.org TXT | grep 'MSG SIZE'`।

**সমাধান:** TCP 53 খুলুন। আর অব্যবহৃত ভেরিফিকেশন TXT পরিষ্কার করুন: যে সার্ভিস একবার ডোমেইন ভেরিফাই করেছে, তার রেকর্ড প্রায়ই চিরকাল লাগে না (সার্ভিসের ডকুমেন্টেশন দেখে মুছুন)। DKIM কী `selector._domainkey` সাবডোমেইনে থাকে, অ্যাপেক্সে না, তাই ওটা এই সমস্যায় পড়ে না।

### Kubernetes-এ লুকআপ ধীর, বা বাইরের নামে অদ্ভুত NXDOMAIN ঝড়

**কারণ:** পডের `/etc/resolv.conf`-এ ডিফল্ট `ndots:5` আর লম্বা `search` তালিকা। `api.baytalhikma.org`-এ ডট মাত্র দুইটা (পাঁচের কম), তাই resolver আগে প্রতিটা search domain জুড়ে চেষ্টা করে: `api.baytalhikma.org.default.svc.cluster.local`, `...svc.cluster.local`, `...cluster.local`, তারপর আসলটা। A আর AAAA দুটোর জন্যই। একটা লুকআপ হয়ে যায় আটটা প্রশ্ন, বেশিরভাগ NXDOMAIN, আর CoreDNS-এ চাপ।

**নিশ্চিত করুন:**

```bash
kubectl exec -it deploy/web -- cat /etc/resolv.conf
```

```text
search default.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

CoreDNS-এর `log` প্লাগইন সাময়িক চালু করে দেখুন একই নামের search-suffix-যুক্ত সংস্করণগুলো NXDOMAIN পাচ্ছে কিনা।

**সমাধান:** বাইরের নাম কোডে শেষে ডট দিয়ে লিখুন (`api.baytalhikma.org.`, যদি লাইব্রেরি মেনে নেয়), অথবা পডে `ndots` কমান:

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"
```

সাথে NodeLocal DNSCache বিবেচনা করুন, আর conntrack-জনিত UDP ড্রপে (A আর AAAA একই সাথে একই সকেট থেকে গেলে) `single-request-reopen` অপশনের কথা Kubernetes ডকুমেন্টেশনে দেখুন।

### Docker কন্টেইনার কিছুই resolve করতে পারে না

**কারণ:** হোস্ট systemd-resolved-এর stub (`127.0.0.53`) ব্যবহার করে; ডিফল্ট bridge নেটওয়ার্কে কন্টেইনার হোস্টের `/etc/resolv.conf`-এর কপি পায়, কিন্তু কন্টেইনারের নিজের নেটওয়ার্ক namespace থেকে হোস্টের loopback পৌঁছানো যায় না। Docker সাধারণত এটা ধরে ফেলে অন্য সার্ভার বসায়, কিন্তু সেটা কোম্পানির firewall-এ ব্লক থাকতে পারে বা ভেতরের নাম জানে না। user-defined নেটওয়ার্কে কন্টেইনার Docker-এর embedded DNS (`127.0.0.11`) পায়, যেটা হোস্টের কনফিগার করা সার্ভারে ফরোয়ার্ড করে।

**নিশ্চিত করুন:**

```bash
docker run --rm busybox cat /etc/resolv.conf
docker run --rm busybox nslookup baytalhikma.org
resolvectl status | grep 'DNS Servers'      # the real upstreams on the host
```

**সমাধান:** user-defined নেটওয়ার্ক ব্যবহার করুন, অথবা Docker daemon-এ (`/etc/docker/daemon.json`-এ `"dns"`) বা কন্টেইনারে `--dns` দিয়ে হোস্টের আসল upstream resolver বসান।

### VPN চালু করলে ভেতরের বা বাইরের নাম ভাঙে

**কারণ:** **split DNS**: VPN শুধু `corp.baytalhikma.org`-এর জন্য ভেতরের resolver সেট করার কথা, কিন্তু (ক) সব প্রশ্ন ভেতরের resolver-এ পাঠাচ্ছে যে বাইরের নাম জানে না বা ফিল্টার করে; (খ) উল্টো, ভেতরের নাম বাইরের resolver-এ যাচ্ছে; (গ) VPN বন্ধ করার পরও তার DNS সেটিং রয়ে গেছে।

**নিশ্চিত করুন:** macOS `scutil --dns` (প্রতিটা `resolver #N` আর তার `domain`), Linux `resolvectl status` (প্রতিটা লিংকের `DNS Domain`), Windows `Get-DnsClientNrptPolicy`।

**সমাধান:** VPN কনফিগে শুধু নির্দিষ্ট ডোমেইন ভেতরে রাউট করুন (systemd-resolved-এ `~corp.baytalhikma.org` ধরনের routing domain)।

### Let's Encrypt সার্টিফিকেট ইস্যু হচ্ছে না

**কারণ ১: CAA।** zone-এ CAA রেকর্ড আছে যেটা শুধু অন্য CA-কে অনুমতি দেয়। CA ইস্যুর আগে নাম থেকে উপরের দিকে (`www.baytalhikma.org`, তারপর `baytalhikma.org`) প্রথম যে CAA সেট পায় সেটা মানে।

```bash
dig +short www.baytalhikma.org CAA
dig +short baytalhikma.org CAA
```

```text
0 issue "sectigo.com"
```

**সমাধান:** `0 issue "letsencrypt.org"` যোগ করুন (wildcard-এর জন্য `issuewild`)। CAA লুকআপ নিজে SERVFAIL দিলে (ভাঙা DNSSEC, বা CAA প্রশ্নে টাইমআউট) CA ইস্যু করতে অস্বীকার করে, তাই এখানে "CAA নেই" আর "CAA-র প্রশ্ন ব্যর্থ" এক জিনিস না।

**কারণ ২: DNS-01-এর TXT CA দেখতে পাচ্ছে না।** আপনি TXT বানিয়েছেন কিন্তু (ক) ভুল zone-এ বা দ্বিগুণ নামে (`_acme-challenge.baytalhikma.org.baytalhikma.org`); (খ) সব authoritative NS-এ এখনো পৌঁছায়নি (secondary-র serial পিছিয়ে, বা প্রোভাইডারের API ধীরে সিঙ্ক করে), আর CA কোনো একটা stale NS-কে জিজ্ঞেস করেছে; (গ) আগের ব্যর্থ চেষ্টার পুরনো TXT রয়ে গেছে।

```bash
for ns in $(dig +short NS baytalhikma.org); do
  echo "$ns: $(dig +norecurse +short TXT _acme-challenge.baytalhikma.org @$ns)"
done
```

**সমাধান:** প্রতিটা NS-এ টোকেন দেখা না যাওয়া পর্যন্ত ACME ক্লায়েন্টকে অপেক্ষা করান (অনেক ক্লায়েন্টে propagation-wait অপশন আছে)। পুরনো TXT মুছুন।

**কারণ ৩: `_acme-challenge` CNAME delegation ভাঙা।** নিরাপত্তার জন্য অনেকে `_acme-challenge.baytalhikma.org`-কে একটা আলাদা ছোট zone-এ CNAME করেন (যাতে ACME ক্লায়েন্টের API key পুরো zone এডিট করতে না পারে)। CA CNAME অনুসরণ করে। CNAME-এর টার্গেট zone-এর delegation ভুল হলে বা ক্লায়েন্ট টার্গেটে না লিখে আসল নামে লিখলে ব্যর্থ।

```bash
dig _acme-challenge.baytalhikma.org TXT +noall +answer
```

```text
_acme-challenge.baytalhikma.org. 300 IN CNAME _acme-challenge.acme.cordoba.example.
_acme-challenge.acme.cordoba.example. 60 IN TXT "kQ3...token..."
```

দুই লাইনই এলে ঠিক। শুধু CNAME এলে TXT টার্গেটে লেখা হয়নি।

### ইমেইল স্প্যামে যাচ্ছে বা রিজেক্ট হচ্ছে

**কারণ:** SPF-এ পাঠানো সার্ভার নেই বা SPF ১০-লুকআপ সীমা পার; DKIM সিগনেচার ভেরিফাই হয় না (ভুল selector, কী কাটা পড়েছে); DMARC alignment ব্যর্থ (From ডোমেইন আর SPF/DKIM ডোমেইন আলাদা); সার্ভারের IP-র PTR নেই বা forward-confirm হয় না। Google ২০২৪ সালের ফেব্রুয়ারি থেকে সব প্রেরকের জন্য SPF বা DKIM আর বৈধ PTR চায়, আর দিনে ৫,০০০-এর বেশি পাঠালে SPF, DKIM দুটোই আর DMARC (২০২৬ সালের অক্টোবর অনুযায়ী; Google-এর sender guidelines পেজে বর্তমান নিয়ম দেখুন)।

**নিশ্চিত করুন:** প্রাপকের দিকে মেইলের হেডারে `Authentication-Results` লাইনই সবচেয়ে বড় প্রমাণ:

```text
Authentication-Results: mx.example.com;
       dkim=pass header.d=baytalhikma.org header.s=s1;
       spf=fail smtp.mailfrom=bounce.mailer.example;
       dmarc=pass (p=QUARANTINE) header.from=baytalhikma.org
```

তারপর DNS:

```bash
dig +short baytalhikma.org TXT | grep spf1
dig +short s1._domainkey.baytalhikma.org TXT
dig +short _dmarc.baytalhikma.org TXT
dig +short -x 192.0.2.25            # PTR of the sending IP
dig +short "$(dig +short -x 192.0.2.25)" A   # must point back to 192.0.2.25
```

**সমাধান:** চ্যাপ্টার ৯-এর চেকলিস্ট। ছোট কথায়: প্রতিটা পাঠানো সার্ভিস SPF-এ বা DKIM-এ aligned থাকতে হবে, আর PTR আর A একে অপরকে নিশ্চিত করবে।

### Wildcard-এর বিস্ময়

**কারণ:** `*.baytalhikma.org` থাকলে টাইপো করা সব নামও উত্তর পায়, তাই NXDOMAIN আর আসে না আর ভুলগুলো চোখে পড়ে না। উল্টো দিকে, wildcard শুধু **অস্তিত্বহীন** নামের জন্য কাজ করে: `api.baytalhikma.org`-এ যদি একটা TXT রেকর্ডও থাকে, তাহলে নামটা "আছে", wildcard তার A দেবে না, ফল NODATA। আর wildcard এক লেভেল না, সব লেভেলের অস্তিত্বহীন নামে মেলে (`a.b.baytalhikma.org`-ও), কিন্তু `*.api.baytalhikma.org` আলাদা জিনিস।

**নিশ্চিত করুন:**

```bash
dig +short does-not-exist-7f3.baytalhikma.org A     # answers? a wildcard exists
dig +norecurse api.baytalhikma.org ANY @ns1.baytalhikma.org
```

**সমাধান:** নির্দিষ্ট নামে নির্দিষ্ট রেকর্ড দিন। wildcard শুধু সত্যিকারের দরকারে (মাল্টি-টেন্যান্ট সাবডোমেইন) রাখুন, আর DNSSEC চালুর আগে wildcard-ওয়ালা zone বিশেষভাবে টেস্ট করুন (চ্যাপ্টার ১৫-এ Slack-এর ঘটনা দেখুন)।

### অ্যাপেক্সে CNAME দিতে দিচ্ছে না

**কারণ:** নিয়মমতো একটা নামে CNAME থাকলে আর কোনো রেকর্ড থাকতে পারে না, আর zone অ্যাপেক্সে (`baytalhikma.org`) SOA আর NS থাকতেই হবে। তাই অ্যাপেক্সে CNAME নিষিদ্ধ।

**নিশ্চিত করুন:** প্রোভাইডারের এরর মেসেজ, বা `named-checkzone`-এর `CNAME and other data`।

**সমাধান:** প্রোভাইডারের `ALIAS`/`ANAME`/CNAME flattening ফিচার (প্রোভাইডার নিজে CNAME টার্গেট resolve করে A/AAAA হিসেবে দেয়; এটা স্ট্যান্ডার্ড না, প্রোভাইডার-ভেদে আলাদা), অথবা টার্গেট সার্ভিসের দেওয়া স্থির A/AAAA IP, অথবা অ্যাপেক্সকে `www`-তে HTTP রিডাইরেক্ট। HTTPS রেকর্ডের (RFC 9460) AliasMode-ও এই সমস্যার স্ট্যান্ডার্ড সমাধান, তবে সব ক্লায়েন্ট এখনো এটা মানে না।

### `@server` দিয়ে যাকেই জিজ্ঞেস করি, উত্তর একই রকম অদ্ভুত

**কারণ:** আপনার নেটওয়ার্ক (কিছু ISP, হোটেল Wi-Fi, কর্পোরেট firewall) **transparent DNS interception** করছে: port 53-এর সব ট্রাফিক, আপনি যে IP-ই লিখুন, নিজের resolver-এ ঘুরিয়ে দিচ্ছে। তখন `dig @ns1.baytalhikma.org` আসলে ns1-কে জিজ্ঞেস করে না, আর এই চ্যাপ্টারের ধাপ ৪-৫ মিথ্যা ছবি দেখায়।

**নিশ্চিত করুন:** authoritative সার্ভারের উত্তরে `aa` ফ্ল্যাগ থাকার কথা, আর TTL থাকার কথা পূর্ণ (zone-এ যা লেখা)। interception থাকলে দেখবেন `flags: qr ra` (recursion available, `aa` নেই) আর TTL কমতে থাকা ক্যাশের সংখ্যা:

```bash
dig +norecurse NS example.com @a.gtld-servers.net | grep -E 'flags|IN[[:space:]]+NS'
```

```text
; illustrative: intercepted. A real .com server answers with a referral
; (ANSWER: 0, NS in AUTHORITY) and TTL 172800, never with 'ra' and a cached TTL.
;; flags: qr ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1
example.com.    21578   IN  NS  elliott.ns.cloudflare.com.
```

**সমাধান:** এমন নেটওয়ার্কে authoritative-স্তরের ডিবাগিং করবেন না। একটা VPS থেকে চালান, অথবা DoH/DoT দিয়ে (port 53 ছাড়া) যাচাই করুন, অথবা RIPE Atlas প্রোব ব্যবহার করুন। নিচের হেলথ-চেক স্ক্রিপ্ট এমন নেটওয়ার্কে প্রতিটা সার্ভারকে `NOT-AUTHORITATIVE` দেখাবে, সেটাই এই লক্ষণ।

### রেকর্ড বদলালাম, কিন্তু secondary-রা পুরনোটাই দিচ্ছে

**কারণ:** SOA serial বাড়ানো হয়নি। secondary সার্ভার শুধু serial দেখে ঠিক করে নতুন zone টানবে কিনা; serial না বাড়লে NOTIFY পেলেও সে ভাবে "আমার কাছে এটাই আছে"। অথবা primary থেকে secondary-তে AXFR/IXFR ACL বা firewall-এ আটকে।

**নিশ্চিত করুন:** ধাপ ৪-এর লুপ (serial পাশাপাশি), আর secondary-র লগে `transfer` লাইন।

**সমাধান:** serial বাড়ান (`YYYYMMDDnn` ফরম্যাট সবচেয়ে নিরাপদ), রিলোড, NOTIFY যাচ্ছে কিনা দেখুন। যে টুলে zone এডিট করেন সেটা serial নিজে বাড়ায় কিনা নিশ্চিত হন (বেশিরভাগ ম্যানেজড প্রোভাইডার আর `dnssec-policy`-ওয়ালা BIND নিজে করে; হাতে লেখা zone ফাইলে আপনি নিজে)।

## কপি-পেস্ট DNS হেলথ-চেক স্ক্রিপ্ট

উপরের ধাপ ৪, ৫, ৬ আর ৭ এক জায়গায়। শুধু `dig` আর স্ট্যান্ডার্ড শেল টুল লাগে। এটা parent-এর delegation, zone-এর নিজের NS, প্রতিটা authoritative সার্ভারের উত্তর আর SOA serial, TCP, আর DS বনাম DNSKEY মিলিয়ে দেখে।

```bash
#!/usr/bin/env bash
# dns-health.sh ZONE [NAME] [TYPE]
# Example: ./dns-health.sh baytalhikma.org www.baytalhikma.org A
set -u
zone="${1:?usage: dns-health.sh ZONE [NAME] [TYPE]}"
name="${2:-$zone}"
type="${3:-A}"
q() { dig +time=2 +tries=1 "$@"; }
status_of() { awk '/status:/ {gsub(",", "", $6); print $6}'; }

parent="${zone#*.}"
parent_ns=$(q +short NS "$parent" | head -1)
delegated=$(q +norecurse +noall +authority +answer NS "$zone" @"$parent_ns" |
  awk '$4 == "NS" {print tolower($5)}' | sort -u)
in_zone=$(q +short NS "$zone" | tr 'A-Z' 'a-z' | sort -u)

echo "== delegation at parent ($parent_ns)"
echo "$delegated"
[ -n "$delegated" ] || { echo "!! parent returned no NS for $zone"; exit 1; }
[ "$delegated" = "$in_zone" ] || printf '!! zone NS set differs from parent:\n%s\n' "$in_zone"

echo "== per-nameserver: $name $type"
serials=""; answers=""
for ns in $delegated; do
  serial=$(q +short +norecurse SOA "$zone" @"$ns" | awk '{print $3}')
  answer=$(q +short +norecurse "$name" "$type" @"$ns" | sort | tr '\n' ' ')
  flags=$(q +norecurse "$name" "$type" @"$ns" | awk '/^;; flags:/ {print ($0 ~ / aa[ ;]/) ? "aa" : "NOT-AUTHORITATIVE"}')
  tcp=$(q +tcp +short +norecurse SOA "$zone" @"$ns")
  printf '%-28s serial=%-12s %-18s tcp=%s  %s\n' "$ns" "${serial:-NONE}" "${flags:-NO-REPLY}" \
    "$([ -n "$tcp" ] && echo ok || echo FAIL)" "${answer:-(empty)}"
  serials+="${serial}"$'\n'; answers+="${answer}"$'\n'
done
[ "$(printf '%s' "$serials" | sort -u | wc -l)" -le 1 ] || echo "!! SOA serials differ: a secondary is stale"
[ "$(printf '%s' "$answers" | sort -u | wc -l)" -le 1 ] || echo "!! nameservers disagree on $name $type"

echo "== DNSSEC"
ds_tags=$(q +short DS "$zone" | awk '{print $1}' | sort -u)
if [ -z "$ds_tags" ]; then
  echo "no DS at parent: zone is unsigned (fine if intended)"
else
  key_tags=$(q +multi DNSKEY "$zone" | awk -F'key id = ' '/key id/ {print $2 + 0}' | sort -u)
  for t in $ds_tags; do
    if echo "$key_tags" | grep -qx "$t"; then echo "DS $t matches a DNSKEY"
    else echo "!! DS $t has no matching DNSKEY: validating resolvers will SERVFAIL"; fi
  done
fi
st=$(q "$name" "$type" @1.1.1.1 | status_of)
st_cd=$(q +cd "$name" "$type" @1.1.1.1 | status_of)
echo "validating resolver: ${st:-NO-REPLY}, with checking disabled: ${st_cd:-NO-REPLY}"
[ "$st" = "SERVFAIL" ] && [ "$st_cd" = "NOERROR" ] && echo "!! DNSSEC validation is failing"
exit 0
```

```text
; illustrative output for a zone with one stale secondary and a broken DS
== delegation at parent (a0.org.afilias-nst.info.)
ns1.baytalhikma.org.
ns2.baytalhikma.org.
ns3.cordoba.example.
== per-nameserver: www.baytalhikma.org A
ns1.baytalhikma.org.         serial=2026102302   aa                 tcp=ok  203.0.113.20
ns2.baytalhikma.org.         serial=2026102302   aa                 tcp=ok  203.0.113.20
ns3.cordoba.example.         serial=2026101501   aa                 tcp=FAIL  198.51.100.7
!! SOA serials differ: a secondary is stale
!! nameservers disagree on www.baytalhikma.org A
== DNSSEC
!! DS 31406 has no matching DNSKEY: validating resolvers will SERVFAIL
validating resolver: SERVFAIL, with checking disabled: NOERROR
!! DNSSEC validation is failing
```

প্রতিটা `!!` লাইন উপরের ক্যাটালগের একটা এন্ট্রিতে নিয়ে যায়। স্ক্রিপ্টের সীমাবদ্ধতা জেনে রাখুন: parent ধরে নেয় zone-এর ঠিক উপরের লেবেল (`co.uk`-এর মতো দুই-লেভেলের TLD-তে প্রথম আর্গুমেন্ট হিসেবে ঠিক zone দিন, parent হিসাব তবুও কাজ করবে), বাইরের দৃষ্টিভঙ্গি হিসেবে শুধু 1.1.1.1 ব্যবহার করে, আর যে নেটওয়ার্ক port 53 intercept করে সেখানে প্রতিটা লাইনে `NOT-AUTHORITATIVE` দেখাবে (উপরের এন্ট্রি দেখুন), তাই একটা VPS থেকে চালানোই নিরাপদ। cron-এ চালিয়ে `!!` লাইন এলে অ্যালার্ট দিলে এটা একটা ছোট মনিটরিংও (চ্যাপ্টার ১৫)।

## ক্যাশ ফ্লাশ: কোনটা, কীভাবে

ফ্লাশ শেষ ধাপ, প্রথম না। আর শুধু সেই ক্যাশ ফ্লাশ করুন যেটায় আপনি প্রমাণ পেয়েছেন পুরনো উত্তর আছে।

| ক্যাশ                    | দেখা                                         | ফ্লাশ                                                          |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Chromium ব্রাউজার        | `chrome://net-internals/#dns`               | একই পেজে "Clear host cache"                                     |
| Firefox                 | `about:networking#dns`                      | একই পেজে "Clear DNS Cache"                                      |
| macOS                   | `dscacheutil -q host -a name NAME`          | `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder` |
| Linux systemd-resolved  | `resolvectl statistics`                     | `resolvectl flush-caches`                                       |
| Windows                 | `Get-DnsClientCache`                        | `ipconfig /flushdns`                                            |
| নিজের Unbound           | `unbound-control dump_cache`                | `unbound-control flush NAME` (negative-সহ: `flush_negative`)    |
| নিজের BIND              | `rndc dumpdb -cache`                        | `rndc flushname NAME`                                           |
| Google Public DNS       | —                                           | Google-এর "Flush Cache" ওয়েব টুল                                |
| Cloudflare 1.1.1.1      | —                                           | Cloudflare-এর "Purge Cache" ওয়েব টুল                             |
| ISP-এর resolver          | —                                           | আপনার হাতে নেই; TTL-ই ভরসা                                        |

(কমান্ডগুলো OS আর ভার্সন ভেদে বদলায়; ২০২৬ সালের অক্টোবর অনুযায়ী লেখা, নিজের OS-এর ডকুমেন্টেশনে মিলিয়ে নিন। পাবলিক resolver-এর ফ্লাশ টুলের লিংক তাদের নিজের সাইটে খুঁজুন।)

<Callout type="warning">

ISP resolver আর লাখো ইউজারের মেশিনের ক্যাশ আপনি ফ্লাশ করতে পারবেন না। তাই ইনসিডেন্টে প্রশ্নটা "কীভাবে ফ্লাশ করব" না, "ভুল উত্তরের TTL কত ছিল, আর সেটা কখন শেষ হবে"। এজন্যই পরিবর্তনের আগে TTL কমানো, পরে না।

</Callout>

## ইনসিডেন্টের সময় অভ্যাস

- **প্রতিটা কমান্ড আর আউটপুট টাইমস্ট্যাম্পসহ লিখে রাখুন।** TTL প্রতি সেকেন্ডে কমে; দশ মিনিট পর একই কমান্ড অন্য ছবি দেখাবে।
- **একবারে একটা পরিবর্তন।** DS সরানো, NS বদলানো আর রেকর্ড এডিট একসাথে করলে কোনটায় কাজ হলো বা কোনটা নতুন সমস্যা আনল, বোঝা যাবে না। আর প্রতিটা পরিবর্তনের নিজের TTL আছে।
- **পরিবর্তনের আগে বর্তমান অবস্থা সেভ করুন:** `dig +norecurse AXFR` অনুমতি থাকলে, বা প্রোভাইডারের zone export। রোলব্যাক করতে জানা দরকার কোথায় ফিরবেন।
- **রোলব্যাকেরও TTL আছে।** Slack-এর DNSSEC ঘটনা (চ্যাপ্টার ১৫) এর সবচেয়ে ভালো উদাহরণ: DS সরানোর পরও resolver-রা DS ক্যাশ ধরে ছিল।
- **"নিজে থেকে ঠিক হয়ে গেছে" মানে কারণ অজানা।** TTL শেষে ঠিক হলে লিখে রাখুন কোন রেকর্ডের কোন TTL ছিল।

## মূল শিক্ষা

1. **আন্দাজ না, প্রমাণ** — "propagation" বলে অপেক্ষা না করে TTL পড়ুন; সেটাই বলে কতক্ষণ।
2. **প্রশ্নের পথ ধরে হপে হপে জিজ্ঞেস করুন** — client (getent/resolvectl) → recursive (`@resolver`) → প্রতিটা authoritative (`+norecurse @ns`) → parent (`@tld +norecurse`)। যেখানে উত্তর বদলায়, সমস্যা সেখানে।
3. **`dig` অ্যাপ যা দেখে তা দেখায় না** — hosts ফাইল, VPN, ব্রাউজারের DoH, কন্টেইনারের resolv.conf আলাদা করে দেখুন।
4. **"মাঝে মাঝে" মানে একটা উৎস বাকিদের থেকে আলাদা** — প্রতিটা NS আর প্রতিটা resolver আলাদা করে জিজ্ঞেস করুন।
5. **SERVFAIL পেলে প্রথম কমান্ড `+cd`** — validation বন্ধে কাজ করলে DNSSEC, তারপর DS বনাম DNSKEY।
6. **A আর AAAA দুটোই, UDP আর TCP দুটোই** — অর্ধেক ভাঙা জিনিস সবচেয়ে বিভ্রান্তিকর।
7. **ফ্লাশ শেষ ধাপ, আর লাখো ক্যাশ আপনার হাতে নেই** — তাই পরিবর্তনের আগে TTL কমান, আর হেলথ-চেক স্ক্রিপ্ট নিয়মিত চালান।
