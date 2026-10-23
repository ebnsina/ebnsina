---
title: 'Zone ও authoritative সার্ভার'
subtitle: 'Zone ফাইলের প্রতিটা লাইন, SOA-র সাতটা ফিল্ড, primary থেকে secondary-তে কপি কীভাবে যায়, আর নিজের authoritative সার্ভার চালানোর সময় কোথায় কোথায় পা পিছলায়।'
chapter: 7
level: 'intermediate'
readingTime: '২০ মিনিট'
topics: ['zone file', 'SOA', 'AXFR', 'IXFR', 'NOTIFY', 'TSIG', 'authoritative', 'knot', 'nsd', 'bind']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

ফাতিমা একটা মাদ্রাসা চালান, যার হেড অফিস ঢাকায় আর তিনটা শাখা ক্যাম্পাস: চট্টগ্রাম, সিলেট আর রাজশাহী। ভর্তি, ক্লাসের সময়সূচি, কোন শিক্ষক কোন রুমে বসেন, সব লেখা থাকে হেড অফিসের একটা মোটা রেজিস্টার খাতায়। এই খাতায় লেখার অধিকার শুধু হেড অফিসের কেরানি খোয়ারিজমির। অভিভাবকেরা কিন্তু হেড অফিসে আসেন না; তারা যান কাছের শাখায়, আর শাখার অফিসে রাখা থাকে খাতাটার একটা হুবহু কপি। প্রতিটা কপির প্রথম পাতার কোণে লেখা থাকে একটা সংস্করণ নম্বর, যেমন "২০২৬১০২৩-০২", মানে তেইশে অক্টোবরের দ্বিতীয় সংশোধন। শাখার কেরানি রাজি প্রতি কয়েক ঘণ্টা পর হেড অফিসে ফোন করে জিজ্ঞেস করেন, "আপনাদের খাতা এখন কোন সংস্করণে?" নম্বরটা তার কপির চেয়ে বড় হলে তিনি নতুন কপি আনিয়ে নেন, নইলে কিছুই করেন না।

খোয়ারিজমি অবশ্য রাজির ফোনের জন্য সবসময় বসে থাকেন না। খাতায় কিছু বদলালেই তিনি তিন শাখায় একটা চিরকুট পাঠান, "নতুন সংস্করণ এসেছে, নিয়ে যান।" চিরকুট পেয়ে রাজি সাথে সাথে খোঁজ নেন। ছোট পরিবর্তন হলে পুরো খাতা না এনে শুধু বদলানো পাতাগুলো আনিয়ে নেন; প্রথমবার বা বড় গোলমাল হলে আনান পুরো খাতা। কেউ যেন শাখার নাম ভাঁড়িয়ে খাতার কপি নিয়ে না যায়, সেজন্য প্রতিটা অনুরোধে থাকে হেড অফিস আর শাখার মধ্যে আগে থেকে ঠিক করা একটা গোপন সিল। আর হেড অফিস যদি টানা কয়েক সপ্তাহ ফোন না ধরে, শাখা একসময় নিজের কপিকে আর ভরসা করে না, অভিভাবকদের বলে দেয় "আমরা নিশ্চিত না, হেড অফিসে খোঁজ নিন।" মজার ব্যাপার, ফাতিমা চাইলে হেড অফিসের ঠিকানা বাইরে কাউকে না-ও জানাতে পারেন; অভিভাবকেরা শুধু শাখাগুলোর কথাই জানেন, হেড অফিস নিরাপদে আড়ালে থাকে।

মিলিয়ে নিই: রেজিস্টার খাতাটা হলো **zone**, আর খাতার ভেতরের প্রতিটা এন্ট্রি একেকটা **resource record**। একমাত্র যে জায়গায় খাতা বদলানো যায়, সেই হেড অফিস হলো **primary**, শাখাগুলো **secondary**। প্রথম পাতার সংস্করণ নম্বর হলো **SOA serial**, কয়েক ঘণ্টা পরপর ফোন করা হলো **refresh**, ফোন না লাগলে আবার চেষ্টার বিরতি **retry**, আর কয়েক সপ্তাহ পর কপিকে অবিশ্বাস করা **expire**। খোয়ারিজমির চিরকুট হলো **NOTIFY**, পুরো খাতা আনানো **AXFR**, শুধু বদলানো পাতা আনানো **IXFR**, আর গোপন সিলটা **TSIG**। আড়ালে থাকা হেড অফিসের সেটআপটার নাম **hidden primary**। বাস্তবে প্রায় সব সিরিয়াস DNS সেটআপ এভাবেই চলে: একটা জায়গায় বদলানো হয়, আর পৃথিবীর নানা প্রান্তের কয়েকটা সার্ভার সেই কপি থেকে উত্তর দেয়।

## Zone আসলে কী

আগের চ্যাপ্টারগুলোতে দেখেছি নামের গাছটা কয়েক টুকরো হয়ে নানা মালিকের হাতে থাকে। সেই এক-একটা টুকরোই **zone**: গাছের একটা অংশ, যার রেকর্ডের জন্য একটা নির্দিষ্ট সেট authoritative সার্ভার দায়ী। `baytalhikma.org` একটা zone। এর নিচে `api.baytalhikma.org` বা `mail.baytalhikma.org` সাধারণত একই zone-এর ভেতরের নাম। কিন্তু আপনি যদি `lab.baytalhikma.org`-কে আলাদা NS রেকর্ড দিয়ে অন্য কারো সার্ভারে **delegate** করেন, তাহলে `lab.baytalhikma.org` একটা আলাদা zone হয়ে যায়, আর তার রেকর্ড আর আপনার zone ফাইলে থাকে না।

<Callout type="info">

**ডোমেইন আর zone এক জিনিস নয়।** ডোমেইন হলো নামের গাছের একটা শাখা আর তার নিচের সব কিছু। Zone হলো সেই শাখার যে অংশটুকু একজন প্রশাসকের হাতে, delegation-এর কাটা জায়গাগুলো বাদ দিয়ে। `.org` ডোমেইনের নিচে লক্ষ লক্ষ নাম, কিন্তু `.org` zone-এ থাকে শুধু সেইসব নামের NS রেকর্ড, আসল A রেকর্ড নয়।

</Callout>

একটা zone-এর authoritative সার্ভার যখন উত্তর দেয়, রেসপন্সে **AA (Authoritative Answer)** ফ্ল্যাগ বসায়। এটাই resolver-কে জানায় "এটা ক্যাশ থেকে শোনা কথা নয়, আমি নিজেই এই zone-এর মালিক।"

## Zone ফাইল: লাইন ধরে ধরে

Zone ফাইলের ফরম্যাট RFC 1035-এ সংজ্ঞায়িত, আর প্রায় সব authoritative সার্ভার (BIND, NSD, Knot, PowerDNS-এর BIND backend) এটা পড়তে পারে। একটা পূর্ণ উদাহরণ:

```text
$ORIGIN baytalhikma.org.
$TTL 3600

@       IN  SOA   ns1.baytalhikma.org. hostmaster.baytalhikma.org. (
                  2026102302 ; serial
                  7200       ; refresh (2h)
                  1800       ; retry (30m)
                  1209600    ; expire (14d)
                  300 )      ; minimum / negative TTL (5m)

@       IN  NS    ns1.baytalhikma.org.
@       IN  NS    ns2.baytalhikma.org.

ns1     IN  A     192.0.2.53
ns2     IN  A     198.51.100.53

@       IN  A     203.0.113.10
@       IN  AAAA  2001:db8:10::10
www     IN  CNAME baytalhikma.org.
api     300 IN A  203.0.113.20

@       IN  MX    10 mail.baytalhikma.org.
mail    IN  A     203.0.113.25

lab     IN  NS    ns.lab-partner.example.
```

প্রতিটা অংশের মানে:

| অংশ | মানে |
| --- | --- |
| `$ORIGIN` | ফাইলের যেসব নাম শেষে ডট ছাড়া লেখা, সেগুলোর পেছনে এটা জুড়ে যায়। `www` হয়ে যায় `www.baytalhikma.org.` |
| `$TTL` | যে রেকর্ডে আলাদা করে TTL লেখা নেই, তার ডিফল্ট TTL (সেকেন্ডে) |
| `@` | বর্তমান `$ORIGIN` নিজেই, মানে zone-এর apex |
| `IN` | ক্লাস: Internet। বাস্তবে আর কিছু দেখবেন না (CH শুধু সার্ভারের ভার্সন জিজ্ঞেস করার মতো কিছু ডায়াগনস্টিকে) |
| `api 300 IN A` | এই রেকর্ডের নিজস্ব TTL ৩০০, ডিফল্টকে ওভাররাইড করছে |
| ফাঁকা নাম | লাইনের শুরুতে স্পেস থাকলে আগের লাইনের নামটাই ধরা হয় |
| `;` | কমেন্ট |
| `( ... )` | একটা রেকর্ডকে কয়েক লাইনে ভাঙার জন্য বন্ধনী |

### শেষের ডট: সবচেয়ে কমন zone ফাইল বাগ

Zone ফাইলে কোনো নামের শেষে ডট থাকলে সেটা **absolute** (পুরো নাম, কিছু জুড়বে না)। ডট না থাকলে **relative**, পেছনে `$ORIGIN` জুড়ে যাবে। এখন এই লাইনটা দেখুন:

```text
@   IN  MX  10 mail.baytalhikma.org
```

শেষে ডট নেই। সার্ভার এটা পড়বে `mail.baytalhikma.org.baytalhikma.org.` হিসেবে। সার্ভার কোনো এরর দেবে না, কারণ নামটা বৈধ। শুধু আপনার ইমেইল আর আসবে না, আর আপনি খুঁজে পাবেন না কেন। একই ভুল CNAME, NS, SRV-এর টার্গেটে ঘটে।

```bash
dig +short MX baytalhikma.org
```

```text
10 mail.baytalhikma.org.baytalhikma.org.
```

এমন দ্বিগুণ নাম দেখলেই বুঝবেন কোথাও একটা ডট বাদ পড়েছে।

<Callout type="warning">

ওয়েব প্যানেলের DNS এডিটরগুলো (রেজিস্ট্রার বা DNS হোস্টের) প্রায়ই নিজে থেকে ডট সামলায়, আর একেক প্যানেল একেকভাবে। কোনোটায় টার্গেটে `mail.baytalhikma.org` লিখলে ঠিক থাকে, কোনোটায় ডট দিলে সেটা আবার শাব্দিক অক্ষর হিসেবে ঢুকে যায়। প্যানেলে রেকর্ড বসানোর পর সবসময় `dig` দিয়ে আসল উত্তরটা দেখে নিন।

</Callout>

## SOA: zone-এর জন্ম সনদ

প্রতিটা zone-এ ঠিক একটা **SOA (Start of Authority)** রেকর্ড থাকে, apex-এ। এটা ছাড়া zone লোডই হয় না। সাতটা ফিল্ড:

| ফিল্ড | উদাহরণ | কী কাজে লাগে |
| --- | --- | --- |
| MNAME | `ns1.baytalhikma.org.` | primary সার্ভারের নাম। DNS UPDATE কোথায় পাঠাতে হবে, আর NOTIFY কাকে বাদ দিতে হবে তা এখান থেকে আসে |
| RNAME | `hostmaster.baytalhikma.org.` | দায়িত্বপ্রাপ্ত মানুষের ইমেইল, প্রথম ডটটা `@` হিসেবে পড়তে হয়: `hostmaster@baytalhikma.org`। ইউজারনেমে ডট থাকলে সেটা `\.` দিয়ে লিখতে হয় |
| SERIAL | `2026102302` | zone-এর ভার্সন। secondary এটা তুলনা করেই ঠিক করে নতুন কপি লাগবে কিনা |
| REFRESH | `7200` | secondary কত সেকেন্ড পরপর primary-কে serial জিজ্ঞেস করবে |
| RETRY | `1800` | refresh ব্যর্থ হলে কত পর আবার চেষ্টা |
| EXPIRE | `1209600` | primary-র সাথে এতক্ষণ যোগাযোগ না হলে secondary zone-টা সার্ভ করা বন্ধ করে দেয় |
| MINIMUM | `300` | নামে এখন এর মানে **negative caching TTL**: NXDOMAIN বা NODATA উত্তর কতক্ষণ ক্যাশ হবে (RFC 2308)। আসলে ব্যবহৃত হয় এটা আর SOA রেকর্ডের নিজের TTL, দুটোর মধ্যে যেটা ছোট |

```bash
dig +noall +answer SOA baytalhikma.org
```

```text
baytalhikma.org.  3600  IN  SOA  ns1.baytalhikma.org. hostmaster.baytalhikma.org. 2026102302 7200 1800 1209600 300
```

### Serial নম্বরের নিয়ম

Serial একটা ৩২-বিট আনসাইন্ড সংখ্যা, আর এর একটাই কাজ: **প্রতিবার zone বদলালে বাড়তে হবে**। প্রচলিত ফরম্যাট `YYYYMMDDnn`: তারিখ, তারপর সেদিনের দুই অঙ্কের সংশোধন নম্বর। ফলে `2026102302` দেখেই বোঝা যায় কবে বদলেছে। দিনে ১০০-বারের বেশি বদলালে এই ফরম্যাট আটকে যায়; তখন অনেকে Unix timestamp ব্যবহার করেন। Knot আর PowerDNS-এর মতো সার্ভার চাইলে নিজেই serial বাড়িয়ে দিতে পারে।

Serial বাড়াতে ভুলে গেলে কী হয়? Primary নতুন ডেটা দেখায়, কিন্তু secondary-রা serial মিলিয়ে দেখে "একই আছে", তাই কপি করে না। ফলে কিছু resolver নতুন উত্তর পায়, কিছু পায় পুরনো, নির্ভর করে কোন NS-কে জিজ্ঞেস করেছে তার উপর। এটা দেখতে "মাঝে মাঝে কাজ করে" টাইপের ভৌতিক বাগের মতো।

Serial কখনো ভুলে কমিয়ে ফেললে (বা ভবিষ্যতের কোনো বিশাল সংখ্যা বসিয়ে ফেললে) secondary আর আপডেট নেবে না, কারণ ওর চোখে নতুনটা "পুরনো"। সমাধান হলো RFC 1982-এর serial arithmetic মেনে দুই ধাপে wrap করানো, অথবা সহজ রাস্তা: প্রতিটা secondary-তে zone-টা মুছে নতুন করে পুরো ট্রান্সফার করানো।

## Primary, secondary আর কপির পথ

একটা zone-এর জন্য রেজিস্ট্রি কমপক্ষে দুটো nameserver চায়, আর সেগুলো আলাদা নেটওয়ার্কে থাকা উচিত। দুটো সার্ভারে আলাদা করে হাতে রেকর্ড বসানো ঝুঁকির, তাই DNS নিজেই কপি করার একটা প্রোটোকল দেয়:

<Mermaid
title="Primary থেকে secondary-তে zone কপি"
code={`sequenceDiagram
  participant O as "Operator"
  participant P as "Primary"
  participant S as "Secondary"
  O->>P: "edit zone, serial 2026102302"
  P->>S: "NOTIFY baytalhikma.org"
  S->>P: "SOA query"
  P-->>S: "serial 2026102302"
  Note over S: "mine is 2026102301, so fetch"
  S->>P: "IXFR from 2026102301 (TSIG signed)"
  P-->>S: "only the changed records"
  Note over S: "serves 2026102302"`}
/>

- **NOTIFY** (RFC 1996): primary বদলের সাথে সাথে secondary-কে খোঁচা দেয়। এটা না থাকলেও চলে, তখন secondary refresh টাইমার অনুযায়ী নিজেই জানতে পারে, শুধু দেরি হয়।
- **AXFR**: পুরো zone ট্রান্সফার। সবসময় TCP-তে।
- **IXFR** (RFC 1995): শুধু দুই serial-এর মধ্যের পার্থক্য। Primary-র কাছে সেই ইতিহাস না থাকলে AXFR-এ ফেরত যায়।
- **TSIG** (RFC 8945): একটা শেয়ার্ড সিক্রেট দিয়ে প্রতিটা মেসেজে HMAC সিগনেচার। এতে primary নিশ্চিত হয় অনুরোধটা আসল secondary থেকেই আসছে, শুধু IP দেখে নয়।

### AXFR খোলা রাখা মানে পুরো zone বিলিয়ে দেওয়া

AXFR যদি যে কারো জন্য খোলা থাকে, যে কেউ আপনার zone-এর প্রতিটা নাম এক কমান্ডে নিয়ে যেতে পারে: অভ্যন্তরীণ হোস্টনেম, স্টেজিং সার্ভার, ভুলে যাওয়া পুরনো সার্ভিস। এটা আক্রমণকারীর জন্য রেকি-র উপহার। নিজের সার্ভার টেস্ট করুন:

```bash
dig AXFR baytalhikma.org @ns1.baytalhikma.org
```

ঠিকঠাক বন্ধ থাকলে উত্তর এমন হবে:

```text
; <<>> DiG 9.18.28 <<>> AXFR baytalhikma.org @ns1.baytalhikma.org
;; global options: +cmd
; Transfer failed.
```

পুরো রেকর্ডের তালিকা চলে এলে সেটা একটা সিকিউরিটি ফাইন্ডিং। অনুমতি থাকা উচিত শুধু নির্দিষ্ট secondary-র IP **এবং** TSIG কী দুটো মিললে। TSIG দিয়ে আপনার secondary হিসেবে টেস্ট করতে:

```bash
dig AXFR baytalhikma.org @ns1.baytalhikma.org -y hmac-sha256:xfr_key:BASE64SECRET
```

## Hidden primary

একটা খুব প্রচলিত আর ভালো প্যাটার্ন: আসল primary সার্ভারটা NS রেকর্ডে থাকেই না। পাবলিক NS রেকর্ডে থাকে শুধু secondary-রা (প্রায়ই কোনো managed anycast DNS প্রোভাইডার), আর primary একটা প্রাইভেট নেটওয়ার্কে বসে শুধু ওদের কাছে NOTIFY আর ট্রান্সফার দেয়।

লাভ: যে মেশিনে zone এডিট হয় সেটা ইন্টারনেটের কোয়েরি লোড বা DDoS-এর সামনে পড়ে না। একাধিক প্রোভাইডারকে secondary বানিয়ে একসাথে চালানো যায় (চ্যাপ্টার ১৫-এ বিস্তারিত)। খেয়াল রাখার বিষয়: SOA-র MNAME-এ এই লুকানো primary-র নামই থাকে, আর সেটা resolve না হলেও সমস্যা নেই, কারণ resolver MNAME দিয়ে কিছু করে না।

## নিজের authoritative সার্ভার: কোনটা বাছবেন

| সফটওয়্যার | ধরন | কখন মানায় |
| --- | --- | --- |
| **NSD** | শুধু authoritative, ছোট আর দ্রুত | স্ট্যাটিক zone ফাইল, secondary হিসেবে, কম ঝামেলা চাইলে |
| **Knot DNS** | শুধু authoritative, আধুনিক | স্বয়ংক্রিয় DNSSEC সাইনিং, স্বয়ংক্রিয় serial, YAML কনফিগ |
| **PowerDNS Authoritative** | ডেটাবেস backend (PostgreSQL ইত্যাদি) আর HTTP API | রেকর্ড যখন কোড থেকে বা প্যানেল থেকে বদলাবে |
| **BIND 9** | authoritative আর recursive দুটোই | সবচেয়ে পুরনো আর সবচেয়ে বেশি ডকুমেন্টেড; ফিচার সবচেয়ে বেশি |

<Callout type="tip">

একই প্রসেসে authoritative আর recursive দুটো একসাথে চালাবেন না। আপনার পাবলিক authoritative সার্ভার যদি বাইরের যে কারো জন্য recursion-ও করে, সেটা একটা open resolver হয়ে যায়, যা amplification আক্রমণের হাতিয়ার (চ্যাপ্টার ১৩)। NSD আর Knot এই ভুলটা করতেই দেয় না, কারণ ওরা recursion জানেই না।

</Callout>

### একটা কাজ করা Knot সেটআপ: primary আর secondary

নিচের কনফিগ Knot DNS-এর অফিশিয়াল ডকুমেন্টেশনের উদাহরণের গঠন মেনে লেখা (২০২৬ সালের অক্টোবর অনুযায়ী `knot-dns.cz/docs/latest`; ভার্সন ভেদে অপশন বদলাতে পারে, নিজের ভার্সনের ডক মিলিয়ে নিন)। প্রথমে TSIG কী বানান:

```bash
keymgr -t xfr_key hmac-sha256
```

এটা একটা `key:` ব্লক প্রিন্ট করে, যেটা দুই সার্ভারের কনফিগেই হুবহু বসবে। Primary-র `/etc/knot/knot.conf`:

```yaml
server:
    listen: [0.0.0.0@53, ::@53]

key:
  - id: xfr_key
    algorithm: hmac-sha256
    secret: REPLACE_WITH_GENERATED_SECRET=

remote:
  - id: secondary
    address: 198.51.100.53
    key: xfr_key

acl:
  - id: allow_secondary_xfr
    address: 198.51.100.53
    key: xfr_key
    action: transfer

template:
  - id: default
    storage: /var/lib/knot/zones
    semantic-checks: on

zone:
  - domain: baytalhikma.org
    file: baytalhikma.org.zone
    notify: secondary
    acl: allow_secondary_xfr
```

Secondary-র কনফিগ:

```yaml
server:
    listen: [0.0.0.0@53, ::@53]

key:
  - id: xfr_key
    algorithm: hmac-sha256
    secret: REPLACE_WITH_GENERATED_SECRET=

remote:
  - id: primary
    address: 192.0.2.53
    key: xfr_key

acl:
  - id: notify_from_primary
    address: 192.0.2.53
    key: xfr_key
    action: notify

zone:
  - domain: baytalhikma.org
    master: primary
    acl: notify_from_primary
```

চালু করে যাচাই:

```bash
knotc conf-check
knotc reload
knotc zone-status baytalhikma.org
dig +short SOA baytalhikma.org @192.0.2.53
dig +short SOA baytalhikma.org @198.51.100.53
```

শেষ দুটো লাইনে একই serial এলে কপি ঠিকঠাক চলছে।

### লোড করার আগে zone ফাইল চেক করা

Zone ফাইলে একটা টাইপো মানে সার্ভার zone-টা লোডই করবে না, আর তখন সেটা SERVFAIL দেবে। তাই রিলোডের আগে সবসময় চেক:

```bash
# BIND-এর টুল, যেকোনো সার্ভারের ফাইলের জন্য কাজে লাগে
named-checkzone baytalhikma.org /var/lib/knot/zones/baytalhikma.org.zone

# Knot-এর নিজস্ব চেকার
kzonecheck -o baytalhikma.org /var/lib/knot/zones/baytalhikma.org.zone
```

```text
zone baytalhikma.org/IN: loaded serial 2026102302
OK
```

`named-checkzone` CNAME-এর পাশে অন্য রেকর্ড, MX বা NS-এর টার্গেটে CNAME, আর zone-এর ভেতরে থাকা NS টার্গেটের A রেকর্ড না থাকার মতো ভুলগুলো ধরে ফেলে।

## Delegation-এর সঙ্গতি: parent আর child একই কথা বলছে তো?

আপনার zone-এর NS রেকর্ড আসলে দুই জায়গায় থাকে:

1. **Parent-এ** (`.org` zone-এ), রেজিস্ট্রারের মাধ্যমে বসানো। Resolver প্রথমে এটাই দেখে।
2. **Child-এ** (আপনার নিজের zone ফাইলে)। Resolver authoritative উত্তর পাওয়ার পর এটাকে বেশি ভরসা করে।

দুটো আলাদা হলে অদ্ভুত আচরণ হয়: কোনো resolver এক সেট সার্ভারে যায়, কোনোটা আরেক সেটে। পুরনো DNS প্রোভাইডার ছেড়ে আসার পর রেজিস্ট্রারে NS বদলেছেন, কিন্তু নতুন zone-এ পুরনো NS রয়ে গেছে, এটা খুব কমন।

```bash
# parent কী বলছে: .org-এর একটা সার্ভারকে সরাসরি জিজ্ঞেস
dig +norecurse NS baytalhikma.org @a0.org.afilias-nst.info

# child কী বলছে
dig +norecurse NS baytalhikma.org @ns1.baytalhikma.org
```

প্রথমটার উত্তর আসবে AUTHORITY সেকশনে (কারণ parent শুধু রেফার করছে, AA ফ্ল্যাগ ছাড়া), দ্বিতীয়টা ANSWER সেকশনে AA ফ্ল্যাগসহ। দুটো তালিকা মিলতে হবে।

<Callout type="info">

`.org`-এর nameserver-এর নাম নিজে বের করে নিন `dig +short NS org.` দিয়ে; ওপরের নামটা উদাহরণ, সময়ের সাথে বদলাতে পারে।

</Callout>

### Lame delegation

**Lame delegation** মানে parent বলছে "এই সার্ভারকে জিজ্ঞেস করো", কিন্তু সেই সার্ভার zone-টার জন্য authoritative নয়: হয় সার্ভারটা বন্ধ, হয় zone-টা ওখানে লোড হয়নি, হয় সার্ভারটা অন্য কারো। Resolver সেখানে গিয়ে REFUSED, SERVFAIL, বা AA ফ্ল্যাগ ছাড়া উত্তর পায়, আর অন্য NS-এ চেষ্টা করে। সব NS lame হলে ডোমেইন ডাউন। কিছু lame হলে লুকআপ মাঝে মাঝে ধীর হয়, কারণ resolver আগে ভুল সার্ভারে টাইমআউট খেয়ে তারপর ঠিকটায় যায়।

```bash
for ns in $(dig +short NS baytalhikma.org); do
  echo "== $ns"
  dig +norecurse +noall +comments SOA baytalhikma.org @"$ns" | grep -E 'status|flags'
done
```

```text
== ns1.baytalhikma.org.
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 4127
;; flags: qr aa; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1
== ns2.baytalhikma.org.
;; ->>HEADER<<- opcode: QUERY, status: REFUSED, id: 9902
;; flags: qr; QUERY: 1, ANSWER: 0, AUTHORITY: 0, ADDITIONAL: 1
```

এখানে `ns2` lame: `aa` ফ্ল্যাগ নেই, status REFUSED। মানে ওই সার্ভারে zone-টা কনফিগার করা নেই।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত হবেন যেভাবে | সমাধান |
| --- | --- | --- |
| MX, CNAME বা NS-এর টার্গেট দ্বিগুণ নাম দেখাচ্ছে | `dig +short MX baytalhikma.org`-এ `...org.baytalhikma.org.` | zone ফাইলে টার্গেটের শেষে ডট দিন, serial বাড়ান, রিলোড করুন |
| রেকর্ড বদলেছি, কিছু মানুষ নতুনটা পায়, কিছু পুরনোটা | প্রতিটা NS-কে আলাদা করে `dig +short SOA ... @ns`; serial আলাদা | serial বাড়ান; secondary-র লগে ট্রান্সফার এরর দেখুন; NOTIFY আর ACL ঠিক আছে কিনা দেখুন |
| zone এডিটের পর পুরো ডোমেইন SERVFAIL | primary-তে `named-checkzone` বা `kzonecheck`; সার্ভারের লগ | সিনট্যাক্স ঠিক করে রিলোড; ভবিষ্যতে রিলোডের আগে চেক বাধ্যতামূলক করুন |
| secondary নতুন serial নিচ্ছে না | secondary-র লগে `refused` বা `TSIG` এরর; `dig AXFR ... -y` দিয়ে ম্যানুয়াল টেস্ট | দুই পাশে TSIG কী আর অ্যালগরিদম হুবহু মেলান; primary-র ACL-এ secondary-র IP দিন; দুই মেশিনের ঘড়ি মেলান (TSIG সময়ের পার্থক্যে ব্যর্থ হয়) |
| serial ভুলে কমে গেছে, secondary আটকে আছে | secondary-র serial primary-র চেয়ে বড় | secondary-তে zone মুছে আবার ট্রান্সফার, অথবা RFC 1982 মেনে serial wrap |
| যে কেউ zone ডাম্প করতে পারছে | বাইরের মেশিন থেকে `dig AXFR baytalhikma.org @ns1...` রেকর্ড দিচ্ছে | ট্রান্সফার শুধু secondary-র IP আর TSIG কী-তে সীমিত করুন |
| লুকআপ মাঝে মাঝে কয়েক সেকেন্ড আটকে থাকে | প্রতিটা NS-কে `+norecurse` দিয়ে SOA জিজ্ঞেস; কোনোটা টাইমআউট বা REFUSED | lame NS ঠিক করুন বা রেজিস্ট্রার থেকে সরিয়ে দিন |
| রেজিস্ট্রারে NS বদলেছি, তবু পুরনো প্রোভাইডারে যাচ্ছে কেউ কেউ | parent আর child-এর NS তালিকা তুলনা | নতুন zone-এর NS রেকর্ড parent-এর সাথে মেলান; পুরনো প্রোভাইডারে zone কয়েকদিন চালু রাখুন যতক্ষণ না পুরনো NS-এর TTL শেষ হয় |
| `NXDOMAIN` বা নেই-রেকর্ড ঠিক করার পরও অনেকক্ষণ ধরে আসছে | `dig SOA`-এর শেষ সংখ্যা আর SOA-র TTL | negative cache SOA minimum আর SOA TTL-এর ছোটটা পর্যন্ত থাকে; অপেক্ষা করুন, ভবিষ্যতের জন্য মানটা কমিয়ে রাখুন |

## মূল শিক্ষা

1. **Zone হলো নামের গাছের এক প্রশাসকের টুকরো**, delegation-এর কাটা অংশ বাদ দিয়ে। Authoritative উত্তরে AA ফ্ল্যাগ থাকে।
2. **Zone ফাইলে শেষে ডট মানে পুরো নাম।** ডট বাদ পড়লে নামের পেছনে origin জুড়ে যায়, কোনো এরর ছাড়াই।
3. **প্রতিবার zone বদলালে SOA serial বাড়াতে হবে**, নইলে secondary-রা পুরনো কপি দিতেই থাকবে।
4. **SOA-র MINIMUM এখন negative caching TTL**, NXDOMAIN কতক্ষণ ক্যাশ হবে তা এটা ঠিক করে।
5. **NOTIFY খোঁচা দেয়, IXFR বদলটুকু আনে, AXFR পুরোটা আনে, TSIG প্রমাণ করে কে চাইছে।** AXFR কখনো সবার জন্য খোলা রাখবেন না।
6. **Hidden primary** এডিটের জায়গাটাকে ইন্টারনেট থেকে আড়ালে রাখে আর মাল্টি-প্রোভাইডার সেটআপ সম্ভব করে।
7. **Parent আর child-এর NS তালিকা মিলতে হবে**, আর প্রতিটা NS-কে আসলেই authoritative হতে হবে। নইলে lame delegation, যা ধীর বা ব্যর্থ লুকআপের চুপচাপ কারণ।
8. **রিলোডের আগে zone ফাইল চেক করুন** (`named-checkzone` বা `kzonecheck`); একটা টাইপো পুরো ডোমেইন SERVFAIL করে দিতে পারে।
