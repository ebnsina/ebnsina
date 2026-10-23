---
title: 'DNS সিকিউরিটি ও আক্রমণ'
subtitle: 'Cache poisoning, amplification DDoS, subdomain takeover, ডোমেইন হাইজ্যাকিং, rebinding ও tunneling — প্রতিটা আক্রমণ কীভাবে কাজ করে, কীভাবে ধরবেন, কীভাবে আটকাবেন।'
chapter: 13
level: 'advanced'
readingTime: '২২ মিনিট'
topics: ['dns security', 'cache poisoning', 'amplification', 'subdomain takeover', 'dns rebinding', 'dns tunneling', 'rpz']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

কমলাপুর স্টেশনের বাইরে সন্ধ্যার ভিড়। গ্রাম থেকে প্রথমবার ঢাকায় আসা খোয়ারিজমি হাতে একটা চিরকুট নিয়ে দাঁড়িয়ে আছে, তাতে লেখা "মামার বাসা, বাড়ি ১২, রোড ৪, মোহাম্মদপুর"। কিন্তু রাস্তা চেনে না, তাই স্টেশনের তথ্যকেন্দ্রে গিয়ে জিজ্ঞেস করবে ভেবেছে। তথ্যকেন্দ্রের লোকটা ফোন তুলে মোহাম্মদপুর থানায় জিজ্ঞেস করছে, ঠিক সেই সময় পাশ থেকে একটা লোক এসে গলা চড়িয়ে বলে, "মোহাম্মদপুর রোড ৪? ওটা তো এখন বসিলায় সরে গেছে, আমার রিকশায় ওঠেন।" তথ্যকেন্দ্রের লোকটা ব্যস্ত, থানার উত্তর আসার আগেই এই লোকের কথা শুনে খাতায় লিখে ফেলে "রোড ৪ = বসিলা"। এরপর সারা সন্ধ্যা যে-ই মোহাম্মদপুর রোড ৪ জিজ্ঞেস করে, তথ্যকেন্দ্র খাতা দেখে বলে দেয় বসিলা। একজন মিথ্যুক একবার আগে বলতে পেরেছে, কিন্তু ক্ষতি করল শত মানুষের।

সিনা স্টেশন ম্যানেজার, ব্যাপারটা ধরে ফেলে নিয়ম বদলায়। এখন থেকে তথ্যকেন্দ্র প্রতিটা ফোনে একটা গোপন টোকেন নম্বর বলে, আর থানা উত্তর দেওয়ার সময় সেই নম্বর ফেরত বলতে হয়; নম্বর না মিললে উত্তর বাতিল। প্রথমে নম্বর ছিল মাত্র দুই অঙ্কের, চালাক দালালরা একশোটা আন্দাজ একসাথে চেঁচিয়ে মিলিয়ে দিত। তাই সিনা নম্বর লম্বা করে, প্রতিবার আলাদা জানালা দিয়ে ফোন করায়, আর শেষে থানাকে একটা সিলমোহর দেয় যেটা নকল করা যায় না। সেই সাথে ফাতিমা খেয়াল করে আরেক কৌশল: দালালরা মানুষকে নিয়ে যায় এমন বাড়িতে যার মালিক অনেক আগে চলে গেছে, কিন্তু স্টেশনের পুরনো বোর্ডে এখনো ঠিকানাটা লেখা। কেউ সেই খালি বাড়ি ভাড়া নিয়ে বোর্ডের ঠিকানাকে নিজের ব্যবসা বানিয়ে ফেলেছে।

মিলিয়ে নিই: তথ্যকেন্দ্র হলো **recursive resolver**, তার খাতা **cache**, থানা **authoritative server**। আগে চেঁচিয়ে মিথ্যা ঠিকানা ঢুকিয়ে দেওয়া হলো **cache poisoning**, আর টোকেন নম্বর হলো DNS-এর **transaction ID**। নম্বর লম্বা করা আর আলাদা জানালা ব্যবহার করা হলো **source port randomization**, সিলমোহর হলো **DNSSEC**। পুরনো বোর্ডে লেখা খালি বাড়ি হলো **dangling CNAME**, আর সেটা দখল করা **subdomain takeover**। বাস্তবে প্রতিটা বড় resolver (ISP-এর, 8.8.8.8, 1.1.1.1) এই সবগুলো প্রতিরক্ষা একসাথে চালায়, আর আপনার zone-এর দায়িত্ব হলো খালি বাড়ির ঠিকানা বোর্ডে না রাখা।

## কেন DNS এত সহজ টার্গেট

DNS ডিজাইন হয়েছিল ১৯৮০-র দশকে, যখন ইন্টারনেট ছিল কয়েকটা বিশ্ববিদ্যালয়ের বিশ্বস্ত নেটওয়ার্ক। মূল প্রোটোকলে তিনটা দুর্বলতা জন্ম থেকেই:

1. **UDP, কানেকশন নেই।** কোনো handshake ছাড়াই একটা প্যাকেট পাঠানো যায়, আর source IP সহজেই জাল করা যায়।
2. **কোনো authentication নেই।** resolver শুধু মেলায় প্রশ্ন আর ID মিলছে কিনা; উত্তরটা আসলেই authoritative সার্ভার থেকে এসেছে কিনা প্রমাণ করার উপায় নেই (DNSSEC ছাড়া)।
3. **সবকিছু ক্যাশ হয়।** একটা মিথ্যা উত্তর একবার ঢুকলে TTL শেষ না হওয়া পর্যন্ত হাজারো ইউজারকে সার্ভ হয়।

এর সাথে যোগ হয় মালিকানার দুর্বলতা: রেজিস্ট্রার অ্যাকাউন্ট, পুরনো রেকর্ড, ভুলে যাওয়া ক্লাউড রিসোর্স। এই চ্যাপ্টারে প্রতিটা আক্রমণ চারটা প্রশ্নে দেখব: কীভাবে কাজ করে, কেন কাজ করে, কীভাবে ধরবেন, কীভাবে আটকাবেন।

<Callout type="warning">

এই চ্যাপ্টারের উদ্দেশ্য প্রতিরক্ষা। প্রতিটা চেক নিজের ডোমেইন আর নিজের সার্ভারে চালান। অন্যের সিস্টেমে স্ক্যান বা টেস্ট করার আগে লিখিত অনুমতি নিন।

</Callout>

## Cache poisoning

### মেকানিজম

resolver যখন authoritative সার্ভারকে প্রশ্ন করে, তখন সে একটা UDP প্যাকেট পাঠায় যাতে থাকে:

- একটা **16-bit transaction ID** (0 থেকে 65,535)
- একটা **source port**
- প্রশ্নটা (নাম + টাইপ)

উত্তর গ্রহণ করার শর্ত: উত্তরটা সঠিক IP:port থেকে আসতে হবে (জাল করা যায়), destination port মিলতে হবে, ID মিলতে হবে, প্রশ্ন মিলতে হবে। যে উত্তর প্রথমে আসে আর সব মেলে, সেটাই জেতে। আসল উত্তর পরে এলে বাতিল।

তাহলে আক্রমণকারীর কাজ: resolver যখন প্রশ্ন করছে, তখন আসল সার্ভারের আগে জাল উত্তর পৌঁছানো, সঠিক ID আন্দাজ করে।

### কেন 16-bit যথেষ্ট না

65,536টা সম্ভাব্য ID। পুরনো resolver-গুলো একটাই ফিক্সড source port থেকে প্রশ্ন করত (যেমন সবসময় 53)। তখন আক্রমণকারীকে শুধু ID আন্দাজ করতে হতো। এক রাউন্ডে কয়েকশো জাল প্যাকেট পাঠালে জেতার সম্ভাবনা ছোট, কিন্তু শূন্য না।

সমস্যা ছিল: একবার হারলে আসল উত্তর ক্যাশে বসে যায়, TTL শেষ না হওয়া পর্যন্ত আর চেষ্টা করা যায় না। এটাই আক্রমণকে ধীর রাখত।

### Kaminsky আক্রমণ (২০০৮)

২০০৮ সালে Dan Kaminsky দেখালেন TTL-এর এই বাধা পুরোপুরি এড়ানো যায়। কৌশলটা ধারণাগতভাবে:

1. সরাসরি `www.baytalhikma.org` না চেয়ে প্রতিবার একটা নতুন, অস্তিত্বহীন নাম চাওয়ানো হয়: `a1.baytalhikma.org`, `a2.baytalhikma.org`... এগুলো ক্যাশে নেই, তাই resolver প্রতিবার নতুন করে authoritative-কে প্রশ্ন করে। প্রতিটা নতুন নাম একটা নতুন সুযোগ।
2. জাল উত্তরে আসল উত্তর না দিয়ে দেওয়া হয় একটা **referral**: "এই zone-এর nameserver হলো `ns.attacker.example`, আর তার IP এটা।" অর্থাৎ পুরো zone-এর delegation বদলে দেওয়া।
3. একবার জিতলে resolver পুরো `baytalhikma.org` zone-এর জন্য আক্রমণকারীর nameserver-কে বিশ্বাস করে।

ফলে আক্রমণ ঘণ্টার বদলে সেকেন্ডে নেমে আসে। এর জবাবে সারা বিশ্বের DNS সফটওয়্যার একসাথে প্যাচ করা হয়েছিল, যা ইন্টারনেটের ইতিহাসে বিরল সমন্বিত প্যাচ।

<Mermaid
title="Cache poisoning race (conceptual)"
code={`sequenceDiagram
  participant C as "Client"
  participant R as "Recursive resolver"
  participant A as "Real authoritative"
  participant X as "Attacker"
  C->>R: "a7.baytalhikma.org?"
  R->>A: "query id=? port=?"
  X-->>R: "forged reply, guess id"
  X-->>R: "forged reply, guess id"
  A-->>R: "real reply (arrives late)"
  Note over R: "first matching reply wins"`}
/>

### প্রতিরক্ষার স্তর

| প্রতিরক্ষা                         | কী করে                                                                 | আন্দাজের স্পেস      |
| --------------------------------- | ---------------------------------------------------------------------- | ------------------- |
| Transaction ID random             | ID প্রেডিক্ট করা যায় না                                                 | ~2^16               |
| **Source port randomization**     | প্রতি প্রশ্নে আলাদা random source port                                   | ~2^16 × ~2^16 পর্যন্ত |
| **0x20 encoding**                 | প্রশ্নের নামের অক্ষরের case random করা (`bAyTaLhIkMa.oRg`), উত্তরে মিলতে হবে | প্রতি অক্ষরে ১ bit   |
| Bailiwick checking                | অন্য zone-এর রেকর্ড উত্তরে এলে ক্যাশ না করা                              | —                   |
| **DNSSEC validation**             | উত্তর ক্রিপ্টোগ্রাফিকভাবে সাইন করা, জাল করা অসম্ভব                       | কার্যত অসীম          |

প্রথম চারটা আন্দাজ কঠিন করে, শেষটা আন্দাজকে অর্থহীন করে। আসল সমাধান DNSSEC (চ্যাপ্টার ১২), বাকিগুলো সেই সময় পর্যন্ত বাঁধ।

আপনার resolver source port randomize করছে কিনা যাচাই করার একটা পুরনো কিন্তু কাজের উপায় হলো DNS-OARC-এর porttest সার্ভিস (সার্ভিসটা এখনো চালু আছে কিনা নিজে যাচাই করুন):

```bash
dig +short porttest.dns-oarc.net TXT
```

```text
; illustrative output
z.y.x.w.v.u.t.s.r.q.p.o.n.m.l.k.j.i.h.g.f.e.d.c.b.a.pt.dns-oarc.net.
"203.0.113.53 is GREAT: 26 queries in 2.1 seconds from 26 ports with std dev 17834"
```

`GREAT` মানে port ছড়ানো। `POOR` এলে resolver বা তার সামনের NAT/firewall port randomization নষ্ট করছে, যা আসলে একটা কমন সমস্যা: কিছু NAT ডিভাইস random port-কে আবার সিকোয়েন্সিয়াল port-এ রিরাইট করে দেয়।

### SAD DNS (২০২০)

২০২০ সালে গবেষকরা (SAD DNS, ACM CCS-এ প্রকাশিত) দেখালেন port randomization-কেও পাশ কাটানো যায়: Linux কার্নেলের ICMP rate limit-এর একটা side channel ব্যবহার করে বোঝা যেত কোন UDP port খোলা আছে। তাহলে আবার শুধু ID আন্দাজ করলেই চলে। প্রতিকার এসেছিল কার্নেল প্যাচে (ICMP rate limit random করা) আর resolver-গুলোতে। শিক্ষাটা হলো: আন্দাজ কঠিন করার যেকোনো প্রতিরক্ষা কোনো একদিন side channel-এ ফুটো হতে পারে; শুধু ক্রিপ্টোগ্রাফিক সমাধান (DNSSEC) স্থায়ী।

## Amplification ও reflection DDoS

### মেকানিজম

DNS-এর দুইটা বৈশিষ্ট্য মিলে একটা অস্ত্র তৈরি হয়:

- **UDP-তে source IP জাল করা যায়।** আক্রমণকারী প্রশ্ন পাঠায়, কিন্তু source হিসেবে লেখে ভিকটিমের IP। উত্তর যায় ভিকটিমের কাছে। এটা **reflection**।
- **প্রশ্ন ছোট, উত্তর বড়।** ৬০ byte-এর একটা প্রশ্নে কয়েক হাজার byte-এর উত্তর আসতে পারে (বড় TXT, DNSSEC সাইনসহ রেকর্ড)। এটা **amplification**।

হাজারটা খোলা resolver আর ৫০ গুণ amplification মিলে আক্রমণকারীর ছোট ব্যান্ডউইথ ভিকটিমের কাছে বিশাল বন্যা হয়ে পৌঁছায়। ভিকটিম দেখে হাজারো বৈধ DNS সার্ভার থেকে ট্রাফিক আসছে, কাউকে ব্লক করা কঠিন।

<Mermaid
title="Reflection and amplification"
code={`graph LR
  X["Attacker<br/>small uplink"] -->|"60 B query<br/>spoofed src = victim"| R1["Open resolver 1"]
  X -->|"spoofed"| R2["Open resolver 2"]
  X -->|"spoofed"| R3["Open resolver N"]
  R1 -->|"3000 B answer"| V["Victim"]
  R2 -->|"3000 B answer"| V
  R3 -->|"3000 B answer"| V`}
/>

### আপনি কি একটা open resolver চালাচ্ছেন?

**Open resolver** মানে এমন একটা recursive resolver যেটা ইন্টারনেটের যে কাউকে উত্তর দেয়। Public resolver (1.1.1.1, 8.8.8.8) ইচ্ছাকৃতভাবে খোলা আর শক্ত সুরক্ষিত; কিন্তু একটা VPS-এ ভুল কনফিগার করা Unbound বা BIND, কিংবা একটা পুরনো রাউটার, অজান্তেই DDoS-এর অংশ হয়ে যায়।

নিজের সার্ভার বাইরে থেকে চেক করুন (অন্য একটা নেটওয়ার্ক থেকে, যেমন ফোনের হটস্পট):

```bash
# From OUTSIDE your network, ask your server about a name it does not host
dig @198.51.100.10 baytalhikma.org A +norecurse +tries=1 +time=2
dig @198.51.100.10 example.com A +tries=1 +time=2
```

```text
; illustrative output: GOOD (refuses outsiders)
;; ->>HEADER<<- opcode: QUERY, status: REFUSED, id: 40211
;; flags: qr rd; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 1
;; WARNING: recursion requested but not available
```

`REFUSED` বা টাইমআউট ভালো। যদি `status: NOERROR` আর `flags`-এ `ra` সহ `example.com`-এর উত্তর আসে, তাহলে আপনার সার্ভার open resolver। ঠিক করুন:

```text
# unbound.conf: answer only your own networks
server:
    interface: 0.0.0.0
    access-control: 0.0.0.0/0 refuse
    access-control: 127.0.0.0/8 allow
    access-control: 10.0.0.0/8 allow
```

```text
# named.conf (BIND): recursion only for trusted clients
acl trusted { 127.0.0.1; 10.0.0.0/8; };
options {
    recursion yes;
    allow-recursion { trusted; };
    allow-query-cache { trusted; };
};
```

আর authoritative-only সার্ভারে recursion পুরোপুরি বন্ধ (`recursion no;`)। এক সার্ভারে authoritative আর recursive মিশিয়ে চালানো এড়িয়ে চলুন।

### Authoritative সার্ভারের প্রতিরক্ষা: RRL

Authoritative সার্ভার তো সবাইকে উত্তর দিতেই হবে, তাই সে "বন্ধ" হতে পারে না। তার প্রতিরক্ষা **Response Rate Limiting (RRL)**: একই উত্তর একই নেটওয়ার্ক ব্লকে সেকেন্ডে নির্দিষ্ট সংখ্যার বেশি গেলে বাকিগুলো ফেলে দেওয়া বা truncated (TC=1) উত্তর পাঠানো। Truncated উত্তর পেলে আসল ক্লায়েন্ট TCP-তে আবার চেষ্টা করে (TCP-তে source জাল করা যায় না), আর জাল ট্রাফিক শুকিয়ে যায়। BIND, Knot, NSD, PowerDNS সবগুলোতেই RRL আছে।

```text
# BIND: rate-limit identical responses
options {
    rate-limit {
        responses-per-second 10;
        window 5;
    };
};
```

আর পুরো ইন্টারনেটের স্তরে আসল প্রতিকার হলো **BCP 38** (ingress filtering): ISP-রা যদি নিজের নেটওয়ার্ক থেকে জাল source IP-ওয়ালা প্যাকেট বের হতে না দেয়, reflection সম্ভবই না।

## Random-subdomain (water torture) আক্রমণ

এটা উল্টো দিক থেকে আসে: টার্গেট আপনার **authoritative** সার্ভার। আক্রমণকারী (প্রায়ই botnet) লক্ষ লক্ষ random, অস্তিত্বহীন নাম চাওয়ায়: `x8f2k.baytalhikma.org`, `qq19z.baytalhikma.org`... প্রতিটা নাম নতুন, তাই কোনো resolver-এর ক্যাশে নেই; সবগুলো প্রশ্ন resolver ভেদ করে সরাসরি আপনার সার্ভারে আছড়ে পড়ে। ২০১৬ সালের Dyn আক্রমণে এই ধরনের ট্রাফিকের সাথে resolver-দের retry মিলে ক্ষতি বহুগুণ হয়েছিল (চ্যাপ্টার ১৫)।

**কীভাবে ধরবেন:** authoritative সার্ভারের লগে হঠাৎ `NXDOMAIN` রেটের বিস্ফোরণ, আর প্রশ্নের নামগুলো দেখতে random স্ট্রিং।

**আটকানোর উপায়:**

- **Aggressive NSEC caching** (RFC 8198): DNSSEC-সাইন করা zone-এ resolver NSEC রেকর্ড দেখে নিজেই বুঝে নেয় "এই রেঞ্জে কোনো নাম নেই", authoritative-কে আর জিজ্ঞেস না করে। আপনার zone সাইন করা থাকলে বড় resolver-গুলো এই ট্রাফিক নিজেরাই শুষে নেয়।
- **Anycast ও ওভারপ্রভিশনিং:** অনেক লোকেশনে ছড়ানো authoritative নেটওয়ার্ক (চ্যাপ্টার ১০)।
- **মাল্টি-প্রোভাইডার** authoritative (চ্যাপ্টার ১৫), যাতে এক প্রোভাইডার ডুবলেও অন্যটা চলে।

## Subdomain takeover (dangling CNAME)

এটা বাস্তবে সবচেয়ে কমন DNS নিরাপত্তা সমস্যা, আর সম্পূর্ণ আপনার নিজের zone-এর দোষ।

### মেকানিজম

1. আপনার টিম একটা মার্কেটিং সাইট বানায় ক্লাউড সার্ভিসে: `promo.baytalhikma.org CNAME baytalhikma-promo.s3-website.example-cloud.com`।
2. ক্যাম্পেইন শেষ, কেউ ক্লাউডের bucket বা app ডিলিট করে দেয়।
3. কিন্তু DNS রেকর্ডটা কেউ মোছে না। এটা এখন **dangling**: এমন জিনিসের দিকে ইশারা করছে যেটা আর নেই।
4. ক্লাউড সার্ভিসে নামগুলো প্রায়ই প্রথমে-এলে-প্রথমে-পাবে ভিত্তিতে দেওয়া হয়। যে কেউ সেই একই নামে নতুন bucket/app বানিয়ে ফেলতে পারে।
5. এখন `promo.baytalhikma.org` আক্রমণকারীর কন্টেন্ট সার্ভ করছে, আপনার ডোমেইনের নামে। ফিশিং পেজ, কুকি চুরি (যদি কুকি `.baytalhikma.org`-এ সেট করা থাকে), এমনকি আক্রমণকারী সেই নামে বৈধ TLS সার্টিফিকেটও ইস্যু করে নিতে পারে, কারণ HTTP-01 validation সে-ই পাস করবে।

ঝুঁকিপূর্ণ প্যাটার্ন: object storage-এর website endpoint, PaaS app hostname, static hosting (GitHub Pages জাতীয়), CDN distribution, হেল্পডেস্ক/ল্যান্ডিং পেজ SaaS। কোন সার্ভিস কতটা ঝুঁকিপূর্ণ, তার কমিউনিটি তালিকা রাখে `can-i-take-over-xyz` প্রজেক্ট (GitHub-এ); তালিকা বদলায়, তাই সেখানেই দেখুন।

শুধু CNAME না: একটা `A` রেকর্ড যেটা ছেড়ে দেওয়া ক্লাউড IP-তে ইশারা করছে (যে IP এখন অন্য কোনো কাস্টমার পেয়েছে), বা একটা `NS` delegation যেটা ডিলিট করা hosted zone-এ ইশারা করছে, একই সমস্যা।

### নিজের zone অডিট করা

প্রথমে zone-এর সব CNAME বের করুন (আপনার DNS প্রোভাইডারের export, বা নিজের zone ফাইল)। তারপর প্রতিটার টার্গেট resolve হয় কিনা দেখুন:

```bash
#!/usr/bin/env bash
# audit-cnames.sh: flag CNAMEs whose target no longer resolves.
# Input: a zone file (BIND format) exported from your provider.
zone="$1"
awk '$0 !~ /^;/ && toupper($0) ~ /[[:space:]]CNAME[[:space:]]/ {print $1, $NF}' "$zone" |
while read -r name target; do
  status=$(dig +noall +comments "$target" A | awk '/status:/ {gsub(",","",$6); print $6}')
  if [ "$status" != "NOERROR" ]; then
    echo "DANGLING? $name -> $target ($status)"
  fi
done
```

```text
; illustrative output
DANGLING? promo -> baytalhikma-promo.s3-website.example-cloud.com. (NXDOMAIN)
DANGLING? old-docs -> baytalhikma.pages.example.net. (NXDOMAIN)
```

`NXDOMAIN` টার্গেট হলো সবচেয়ে বিপজ্জনক লক্ষণ। কিন্তু `NOERROR` মানেই নিরাপদ না: অনেক PaaS প্ল্যাটফর্ম যেকোনো নামের জন্য উত্তর দেয় আর একটা "no such app" পেজ দেখায়। তাই টার্গেটে HTTP রিকোয়েস্ট করে দেখুন সেখানে আসলে আপনার কন্টেন্ট আছে কিনা।

**প্রতিরোধ:**

- **অর্ডার উল্টান:** রিসোর্স ডিলিট করার আগে DNS রেকর্ড মুছুন। বানানোর সময় আগে রিসোর্স, তারপর রেকর্ড।
- DNS-কে কোড হিসেবে রাখুন (চ্যাপ্টার ১৫), যাতে রিসোর্স আর রেকর্ড একই PR-এ বাঁচে-মরে।
- প্রোভাইডারের **domain verification** ফিচার থাকলে চালু করুন (অনেক PaaS একটা TXT রেকর্ড দিয়ে প্রমাণ চায় যে আপনি মালিক; তখন অন্য কেউ নামটা দাবি করতে পারে না)।
- নিয়মিত (সাপ্তাহিক) উপরের অডিট চালান।

## ডোমেইন হাইজ্যাকিং

DNS প্রোটোকল যতই নিরাপদ হোক, যে রেজিস্ট্রার অ্যাকাউন্টে আপনার nameserver সেট করা থাকে সেটা দখল হলে সব শেষ। আক্রমণকারী nameserver বদলে দেয় (নিজের সার্ভারে), এখন পুরো ডোমেইন, ইমেইলসহ, তার নিয়ন্ত্রণে। ইমেইল নিয়ন্ত্রণ মানে অন্য সব সার্ভিসে "পাসওয়ার্ড রিসেট" লিংকও তার কাছে যায়।

কীভাবে ঘটে:

- রেজিস্ট্রার অ্যাকাউন্টের দুর্বল পাসওয়ার্ড, 2FA নেই, ফিশিং
- রেজিস্ট্রারের সাপোর্টকে social engineering
- রেজিস্ট্রার অ্যাকাউন্টের রিকভারি ইমেইল এমন ডোমেইনে, যেটার মেয়াদ শেষ হয়ে গেছে (কেউ সেই ডোমেইন কিনে রিকভারি ইমেইল নিজের করে নেয়)
- ডোমেইনের মেয়াদ শেষ, রিনিউ করতে ভুলে যাওয়া (তখন হাইজ্যাক লাগে না, কেউ সোজা কিনে ফেলে)

**প্রতিরক্ষার তালিকা:**

| স্তর                     | কী করবেন                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| রেজিস্ট্রার অ্যাকাউন্ট     | শক্ত পাসওয়ার্ড, hardware key বা TOTP 2FA (SMS না), আলাদা অ্যাকাউন্ট ব্যক্তির নামে না, টিমের shared vault-এ               |
| Registrar lock          | `clientTransferProhibited` ইত্যাদি status চালু (চ্যাপ্টার ৬)                                                       |
| **Registry lock**       | বড় রেজিস্ট্রি (যেমন .com) একটা আলাদা লক দেয়, যেটা খুলতে রেজিস্ট্রি পর্যায়ে ম্যানুয়াল যাচাই লাগে। দামি, কিন্তু প্রধান ডোমেইনের জন্য মূল্যবান |
| Auto-renew              | চালু, আর পেমেন্ট মেথড বৈধ কিনা ক্যালেন্ডারে রিমাইন্ডার                                                              |
| রিকভারি ইমেইল            | এমন ডোমেইনে যেটা আপনি নিয়ন্ত্রণ করেন আর যেটা নিজে এই ডোমেইনের উপর নির্ভর করে না                                    |
| মনিটরিং                  | NS রেকর্ড আর WHOIS/RDAP status বদলালে অ্যালার্ট (চ্যাপ্টার ১৫)                                                       |
| DNSSEC                  | আক্রমণকারী NS বদলালে DS-ও বদলাতে হবে; আপনার সাইনিং কী তার কাছে নেই, তাই তাড়াহুড়ায় ভুল করলে ধরা পড়ে                   |

একটা সহজ মনিটর:

```bash
# Run from cron; alert if the delegated nameservers change
expected="ns1.baytalhikma.org. ns2.baytalhikma.org."
actual=$(dig +short NS baytalhikma.org @a.gtld-servers.net +norecurse | sort | tr '\n' ' ' | sed 's/ $//')
[ "$actual" = "$expected" ] || echo "NS CHANGED: $actual"
```

`@a.gtld-servers.net`-কে সরাসরি জিজ্ঞেস করছি কারণ delegation-এর সত্য থাকে parent-এ (এখানে `.com`/`.org` রেজিস্ট্রি; আপনার TLD-র nameserver বসান), resolver-এর ক্যাশে না। `.org` হলে `dig NS org.` দিয়ে তার সার্ভার নাম বের করে নিন।

## DNS rebinding

### মেকানিজম

ব্রাউজারের **same-origin policy** বলে: `http://evil.example` পেজের JavaScript শুধু `evil.example`-এর সাথেই কথা বলতে পারবে। কিন্তু "origin" নির্ধারণ হয় **নাম** দিয়ে, IP দিয়ে না। DNS rebinding এই ফাঁকটা ব্যবহার করে:

1. ভিকটিম `evil.example` খোলে। DNS উত্তর দেয় আক্রমণকারীর সার্ভারের IP, খুব ছোট TTL (যেমন 1 সেকেন্ড)।
2. পেজের JavaScript লোড হয়।
3. TTL শেষ। JavaScript আবার `evil.example`-এ রিকোয়েস্ট করে। এবার DNS উত্তর দেয় `192.168.1.1` (ভিকটিমের রাউটার) বা `127.0.0.1`।
4. ব্রাউজারের চোখে এখনো একই origin `evil.example`, তাই JavaScript এখন ভিকটিমের লোকাল নেটওয়ার্কের ডিভাইসের সাথে কথা বলছে এবং উত্তর পড়তে পারছে।

টার্গেট হলো লোকাল নেটওয়ার্কের সেই সব সার্ভিস যেগুলো ভাবে "আমি তো শুধু ভেতরের নেটওয়ার্কে, তাই authentication লাগবে না": রাউটারের অ্যাডমিন প্যানেল, IoT ডিভাইস, ডেভেলপারের মেশিনে চলা লোকাল ডেভ সার্ভার, ডেটাবেস অ্যাডমিন UI, ক্লাউড মেটাডেটা এন্ডপয়েন্ট।

### প্রতিরক্ষা

**লোকাল সার্ভিস হিসেবে (সবচেয়ে জরুরি):**

- **`Host` হেডার যাচাই করুন।** rebinding-এর রিকোয়েস্টে `Host: evil.example` থাকে। আপনার লোকাল সার্ভিস যদি শুধু `localhost`, `127.0.0.1` বা নিজের নামের `Host` গ্রহণ করে, আক্রমণ ব্যর্থ। আধুনিক ডেভ সার্ভারগুলো (যেমন Vite) ডিফল্টভাবে এটা করে, কারণ ঠিক এই আক্রমণের রিপোর্ট এসেছিল।
- লোকাল সার্ভিসেও authentication রাখুন। "ভেতরের নেটওয়ার্ক" নিরাপত্তার সীমানা না।
- শুধু `127.0.0.1`-এ bind করুন, `0.0.0.0`-তে না, যদি বাইরে থেকে লাগার দরকার না থাকে।

**নেটওয়ার্ক হিসেবে:**

- Resolver-এ **private address filtering**: পাবলিক নামের উত্তরে প্রাইভেট IP এলে বাদ দেওয়া। Unbound-এ:

```text
server:
    private-address: 10.0.0.0/8
    private-address: 172.16.0.0/12
    private-address: 192.168.0.0/16
    private-address: 169.254.0.0/16
    private-address: fd00::/8
    private-address: fe80::/10
    # allow your own internal zone to keep returning private IPs
    private-domain: "internal.baytalhikma.org"
```

**ব্রাউজার হিসেবে:** Chromium-ভিত্তিক ব্রাউজারগুলো পাবলিক পেজ থেকে প্রাইভেট নেটওয়ার্কে রিকোয়েস্টে বাড়তি বিধিনিষেধ যোগ করছে (Private Network Access / Local Network Access নামে); এই ফিচারের নাম আর আচরণ ২০২৬ সালেও বদলাচ্ছে, তাই বর্তমান অবস্থা Chrome-এর নিজের ডকুমেন্টেশনে দেখুন। এর উপর ভরসা করে লোকাল সার্ভিসের `Host` চেক বাদ দেবেন না।

## DNS tunneling ও exfiltration

### মেকানিজম

প্রায় প্রতিটা নেটওয়ার্ক DNS বাইরে যেতে দেয়, এমনকি কড়া firewall-ওয়ালা নেটওয়ার্কও। আর DNS প্রশ্নের নামের ভেতরে ডেটা লুকানো যায়: একটা কম্প্রোমাইজড মেশিন `bWFsd2FyZS1kYXRh.c2.attacker.example`-এর মতো প্রশ্ন করে, যার প্রথম অংশ এনকোড করা চুরি করা ডেটা। প্রশ্নটা resolver হয়ে `attacker.example`-এর authoritative সার্ভারে পৌঁছায়, যেটা আক্রমণকারী চালায়। উত্তরের TXT রেকর্ডে ফেরত আসে কমান্ড। ধীর, কিন্তু প্রায় সব firewall পার হয়ে যায়।

### কীভাবে ধরবেন

আপনার resolver-এর query log-এ এই লক্ষণগুলো খুঁজুন:

| লক্ষণ                                         | কেন সন্দেহজনক                                       |
| -------------------------------------------- | -------------------------------------------------- |
| খুব লম্বা label (৫০+ অক্ষর), উচ্চ entropy       | মানুষের দেওয়া নাম এমন হয় না; এটা এনকোড করা ডেটা       |
| একটা ডোমেইনের অধীনে হাজার হাজার ইউনিক সাবডোমেইন  | প্রতিটা প্রশ্ন নতুন ডেটা বহন করছে                     |
| একটা হোস্ট থেকে অস্বাভাবিক বেশি TXT/NULL প্রশ্ন   | কমান্ড আনার চ্যানেল                                 |
| প্রায় সব উত্তর NXDOMAIN, একটা ডোমেইনে           | ডেটা পাঠানো হচ্ছে, উত্তর লাগছে না                     |
| সম্প্রতি রেজিস্টার করা ডোমেইন                     | এক্সফিল্ট্রেশনের জন্য নতুন কেনা                       |

একটা দ্রুত বিশ্লেষণ (Unbound-এর `log-queries: yes` লগের `info: CLIENT NAME TYPE CLASS` লাইন থেকে, অথবা আপনার resolver-এর লগ ফরম্যাট অনুযায়ী `awk` বদলে নিন):

```bash
# Top registrable-ish domains by count of unique subdomains queried
awk '/info: / {print tolower($(NF-2))}' /var/log/unbound.log |
  awk -F. 'NF>=3 {print $(NF-2)"."$(NF-1), $0}' |
  sort -u | awk '{print $1}' | sort | uniq -c | sort -rn | head -20
```

```text
; illustrative output
  48211 attacker.example.
    312 baytalhikma.org.
    201 example-cdn.net.
```

একটা অপরিচিত ডোমেইনের অধীনে ৪৮ হাজার ইউনিক নাম মানে তদন্ত শুরু।

**আটকানো:** ভেতরের মেশিনগুলোকে শুধু আপনার নিজের resolver ব্যবহার করতে দিন, firewall-এ বাইরের port 53 (আর পরিচিত DoH/DoT এন্ডপয়েন্ট) সরাসরি ব্লক করুন, যাতে সব প্রশ্ন আপনার লগের মধ্য দিয়ে যায়। তারপর resolver-এ সন্দেহজনক ডোমেইন ব্লক করুন (নিচে RPZ)।

## Typosquatting ও lookalike ডোমেইন

কেউ `baytalhikrna.org` (`m` এর বদলে `rn`) বা `baytalhikma-login.com` রেজিস্টার করে ফিশিং পেজ বানায়। এটা প্রোটোকলের দুর্বলতা না, মানুষের চোখের। Unicode ডোমেইনে (IDN) আরও সূক্ষ্ম: সিরিলিক `а` দেখতে ল্যাটিন `a`-এর মতোই। ব্রাউজার সন্দেহজনক মিশ্র-লিপির ডোমেইনকে `xn--` দিয়ে শুরু **punycode** হিসেবে দেখায়।

**প্রতিরক্ষা:** প্রধান ভুল বানানগুলো নিজে রেজিস্টার করে রিডাইরেক্ট করুন; **Certificate Transparency** লগ মনিটর করুন (আপনার ব্র্যান্ড নামসহ নতুন সার্টিফিকেট ইস্যু হলে অ্যালার্ট); নিজের ডোমেইনে DMARC `p=reject` (চ্যাপ্টার ৯) যাতে অন্তত আপনার আসল ডোমেইনের নামে ইমেইল জাল না হয়।

## Resolver-স্তরের ফিল্টারিং: RPZ

**Response Policy Zone (RPZ)** হলো একটা বিশেষ zone, যেটা আপনার resolver-কে বলে "এই নামগুলোর জন্য আসল উত্তর না দিয়ে অন্য কিছু দাও"। এটা DNS firewall। BIND, Unbound, PowerDNS Recursor, Knot Resolver সবাই সাপোর্ট করে (সিনট্যাক্স আলাদা)।

```text
; rpz.baytalhikma.zone: a policy zone loaded by the resolver
$TTL 300
@        SOA  localhost. admin.baytalhikma.org. 1 3600 600 86400 300
         NS   localhost.

; return NXDOMAIN for this domain and everything under it
attacker.example         CNAME .
*.attacker.example       CNAME .

; return NODATA (name exists, no records)
tracker.example          CNAME *.

; redirect to a warning page
baytalhikrna.org         A     10.0.0.80
```

`CNAME .` মানে NXDOMAIN, `CNAME *.` মানে NODATA। অনেক থ্রেট-ইন্টেলিজেন্স ফিড RPZ ফরম্যাটে পাওয়া যায় এবং zone transfer দিয়ে আপনার resolver-এ নিয়মিত আপডেট হয়।

<Callout type="tip">

RPZ যোগ করলে "এই সাইট আমার অফিসে খোলে না" ধরনের টিকেট আসবে। ডিবাগ করার সময় মনে রাখুন: resolver-এর ফিল্টারিং NXDOMAIN দেয়, যেটা দেখতে হুবহু "ডোমেইন নেই"-এর মতো। তাই অন্য একটা resolver (`@1.1.1.1`) দিয়ে তুলনা করাই প্রথম চেক।

</Callout>

## Privacy: আপনার প্রশ্ন কে দেখে

DNS প্রশ্ন আপনার ব্রাউজিংয়ের প্রায় পূর্ণ তালিকা। ঐতিহ্যগত (port 53, এনক্রিপশন ছাড়া) DNS-এ এটা দেখতে পারে:

| কে                          | কী দেখে                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| লোকাল Wi-Fi-র যে কেউ         | প্লেইনটেক্সট প্রশ্ন আর উত্তর                                         |
| আপনার ISP                   | সব প্রশ্ন (তাদের resolver ব্যবহার না করলেও, port 53 ট্রাফিক দেখে)     |
| আপনার recursive resolver     | সব প্রশ্ন, আপনার IP সহ                                             |
| Authoritative সার্ভার        | প্রশ্নের নাম আর resolver-এর IP (ECS চালু থাকলে আপনার subnet-ও)       |

প্রতিকার, স্তরে স্তরে:

- **DoT / DoH / DoQ** (চ্যাপ্টার ১১): আপনার আর resolver-এর মাঝের পথ এনক্রিপ্ট করে। Wi-Fi আর ISP আর প্রশ্ন দেখতে পায় না; কিন্তু resolver এখনো সব দেখে। তাই কোন resolver-কে বিশ্বাস করবেন, সেটা privacy policy পড়ে বেছে নিন।
- **QNAME minimisation** (RFC 9156): resolver root-কে পুরো `mail.baytalhikma.org` না পাঠিয়ে শুধু `org`-এর কথা জিজ্ঞেস করে, TLD-কে শুধু `baytalhikma.org`। প্রতিটা সার্ভার শুধু যতটুকু দরকার ততটুকু জানে। আধুনিক Unbound, BIND, Knot Resolver ডিফল্টভাবে চালু রাখে।
- **ECS (EDNS Client Subnet)**: CDN-কে ভালো রাউটিং দিতে resolver আপনার subnet authoritative-কে জানায়। এটা privacy-র খরচে পারফরম্যান্স; কিছু resolver (যেমন 1.1.1.1) ECS পাঠায় না।

নিজের নেটওয়ার্কে কী এনক্রিপ্টেড আর কী না, পরীক্ষা:

```bash
# Watch for plaintext DNS leaving this machine (Ctrl-C to stop)
sudo tcpdump -ni any 'udp port 53 or tcp port 53'
```

ব্রাউজারে DoH চালু থাকলেও যদি এখানে প্রশ্ন দেখেন, সেগুলো ব্রাউজারের বাইরের অ্যাপ (OS, অন্য প্রোগ্রাম) থেকে আসছে।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

**লক্ষণ: VPS-এর প্রোভাইডার অ্যাবিউজ রিপোর্ট পাঠিয়েছে "DNS amplification-এ অংশ নিচ্ছে"।**
নিশ্চিত করুন: বাইরের নেটওয়ার্ক থেকে `dig @YOUR_IP example.com` চালান; উত্তর এলে আপনি open resolver। `ss -ulpn | grep :53` দিয়ে দেখুন কোন প্রসেস port 53-এ শুনছে (প্রায়ই ভুলে যাওয়া `dnsmasq` বা Docker কন্টেইনার)।
ঠিক করুন: `access-control`/`allow-recursion` সীমিত করুন, বা লাগলে শুধু `127.0.0.1`-এ bind করুন, firewall-এ port 53 বাইরের জন্য বন্ধ।

**লক্ষণ: কেউ জানাল `promo.baytalhikma.org`-এ অপরিচিত কন্টেন্ট দেখাচ্ছে।**
নিশ্চিত করুন: `dig promo.baytalhikma.org CNAME +short` দিয়ে টার্গেট দেখুন, তারপর ক্লাউড কনসোলে সেই রিসোর্স আপনার অ্যাকাউন্টে আছে কিনা।
ঠিক করুন: সাথে সাথে DNS রেকর্ড মুছুন (রিসোর্স ফেরত পাওয়ার চেষ্টার চেয়ে দ্রুত)। ওই সাবডোমেইনে কুকি সেট হয় এমন সেশন invalidate করুন, CT লগে ওই নামে নতুন সার্টিফিকেট খুঁজুন, তারপর পুরো zone অডিট করুন।

**লক্ষণ: হঠাৎ ডোমেইনের NS অপরিচিত সার্ভারে।**
নিশ্চিত করুন: `dig NS baytalhikma.org @TLD_SERVER +norecurse` আর RDAP/WHOIS-এ nameserver ও status দেখুন।
ঠিক করুন: এটা ইনসিডেন্ট। রেজিস্ট্রারের abuse/security টিমে সাথে সাথে যোগাযোগ, অ্যাকাউন্ট রিকভারি, সব ক্রেডেনশিয়াল রোটেট; ডোমেইনের ইমেইল আক্রমণকারীর হাতে ছিল ধরে নিয়ে অন্য সার্ভিসের পাসওয়ার্ড রিসেট-লগ চেক করুন।

**লক্ষণ: authoritative সার্ভারে CPU 100%, লগে random সাবডোমেইনে NXDOMAIN।**
নিশ্চিত করুন: লগ থেকে প্রশ্নের নামের নমুনা নিন; random স্ট্রিং আর একই zone মানে water torture।
ঠিক করুন: RRL চালু, zone DNSSEC সাইন (aggressive NSEC caching কাজে লাগাতে), anycast প্রোভাইডার বা দ্বিতীয় প্রোভাইডার যোগ।

**লক্ষণ: অফিসে একটা ডোমেইন খোলে না, বাড়িতে খোলে।**
নিশ্চিত করুন: `dig name` বনাম `dig @1.1.1.1 name`। অফিসের resolver NXDOMAIN দিলে আর পাবলিক দিলে উত্তর, সম্ভবত RPZ বা ফিল্টারিং।
ঠিক করুন: resolver অ্যাডমিন RPZ লগে দেখবেন কোন পলিসি মিলেছে; ভুল ব্লক হলে allowlist-এ যোগ।

**লক্ষণ: porttest `POOR` দেখাচ্ছে।**
নিশ্চিত করুন: resolver সরাসরি (NAT ছাড়া) চালিয়ে দেখুন; ভালো হলে দোষ NAT/firewall-এর port রিরাইটের।
ঠিক করুন: resolver-কে NAT-এর বাইরে রাখুন বা NAT-এ port randomization চালু, আর DNSSEC validation চালু করুন।

## মূল শিক্ষা

1. **DNS-এর মূল প্রোটোকলে authentication নেই** — transaction ID, source port, 0x20 শুধু আন্দাজ কঠিন করে; DNSSEC-ই একমাত্র ক্রিপ্টোগ্রাফিক সমাধান।
2. **Open resolver চালাবেন না** — বাইরে থেকে `dig @your-ip example.com` দিয়ে প্রতিটা সার্ভার চেক করুন; authoritative-এ RRL চালু রাখুন।
3. **সবচেয়ে কমন আক্রমণ আপনার নিজের zone-এর আবর্জনা** — dangling CNAME/A/NS নিয়মিত অডিট করুন, আর রিসোর্স মোছার আগে রেকর্ড মুছুন।
4. **রেজিস্ট্রার অ্যাকাউন্টই ডোমেইনের চাবি** — hardware-key 2FA, registrar/registry lock, auto-renew, আর NS পরিবর্তনের মনিটর।
5. **লোকাল সার্ভিস `Host` হেডার যাচাই করবে** — DNS rebinding "ভেতরের নেটওয়ার্ক = নিরাপদ" ধারণাকে ভেঙে দেয়।
6. **DNS লগ একটা সিকিউরিটি সেন্সর** — লম্বা high-entropy label আর এক ডোমেইনে হাজারো ইউনিক নাম tunneling-এর চিহ্ন।
7. **Privacy-র জন্য এনক্রিপশন যথেষ্ট না** — DoH/DoT পথ ঢাকে, কিন্তু resolver তবুও সব দেখে; resolver বেছে নিন সচেতনভাবে।
