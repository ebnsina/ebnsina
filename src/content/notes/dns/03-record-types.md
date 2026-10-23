---
title: 'রেকর্ড টাইপ'
subtitle: 'A, AAAA, CNAME, MX, TXT, NS, SOA, PTR, SRV, CAA, HTTPS: প্রতিটা রেকর্ড কী বলে, কোন নিয়ম ভাঙলে কী ভাঙে, apex-এ CNAME কেন চলে না, আর wildcard কখন মেলে আর কখন মেলে না।'
chapter: 3
level: 'beginner'
readingTime: '২২ মিনিট'
topics: ['records', 'cname', 'mx', 'txt', 'soa', 'ptr', 'srv', 'caa', 'https', 'svcb', 'wildcard']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

মতিঝিলের একটা অফিস বিল্ডিংয়ের রিসেপশনে বসেন মরিয়ম। তাঁর ডেস্কে একটা বাঁধানো ডিরেক্টরি, যার প্রতিটা লাইনের পাশে ছোট একটা লেবেল লেখা। "বিরুনি, অ্যাকাউন্টস — রুম ৪০২" লাইনের পাশে লেখা "রুম"। কেউ বিরুনিকে খুঁজলে মরিয়ম সরাসরি রুম নম্বর বলে দেন। নতুন উইং চালু হওয়ার পর কিছু লোক নতুন রুমেও বসেন, তাই কারো কারো দুটো লাইন: পুরনো উইংয়ের রুম আর নতুন উইংয়ের রুম।

কিছু লাইন আবার অন্যরকম। "হিসাব বিভাগ — দেখুন: বিরুনি"। মরিয়ম তখন দ্বিতীয়বার খোঁজেন, বিরুনির লাইনে গিয়ে রুম নম্বর বের করেন। এই "দেখুন" লাইনের পাশে আর কিছু লেখার নিয়ম নেই; হিসাব বিভাগের নিজস্ব কোনো রুম থাকলে কোনটা সত্যি সেটা নিয়ে গোলমাল হতো। আরেক ধরনের লাইন: "চিঠিপত্র — প্রথমে মেইলরুম, বন্ধ থাকলে পেছনের গেটের দারোয়ান"। কুরিয়ার এলে মরিয়ম অগ্রাধিকার অনুযায়ী পাঠান। আর ডিরেক্টরির শেষ পাতায় কিছু নোট: "এই বিল্ডিংয়ের চাবি শুধু রাজি সিকিউরিটি এজেন্সি বানাতে পারবে", "ব্যাংকের লোক যাচাই করতে চাইলে বলবেন কোড ৭৭২১"। আর একদম ওপরে একটা লাইন: "এই ডিরেক্টরির দায়িত্বে: ফারাবি, সংস্করণ ২০২৬-১০-২৩"।

মিলিয়ে নিই: পুরো ডিরেক্টরিটা হলো একটা **zone**, আর প্রতিটা লাইন একটা **resource record**, যার লেবেল হলো **record type**। "রুম" লাইন হলো **A** (পুরনো উইং, IPv4) আর **AAAA** (নতুন উইং, IPv6)। "দেখুন: বিরুনি" হলো **CNAME**, যার পাশে আর কিছু থাকতে পারে না। অগ্রাধিকারসহ চিঠিপত্রের লাইন হলো **MX**। "চাবি শুধু রাজি এজেন্সি" হলো **CAA**, আর "যাচাইয়ের কোড" হলো **TXT**। ওপরের দায়িত্ব আর সংস্করণের লাইন হলো **SOA**। বাস্তবে প্রতিটা ডোমেইন ঠিক এভাবেই কাজ করে: ব্রাউজার A/AAAA চায়, মেইল সার্ভার MX চায়, Let's Encrypt CAA দেখে, Google Search Console TXT দেখে, আর প্রতিটা প্রশ্নের সাথে টাইপটা বলে দিতে হয়।

## একটা রেকর্ডের গঠন

প্রতিটা DNS রেকর্ড (resource record বা RR) পাঁচটা অংশে তৈরি:

```text
www.baytalhikma.org.   300   IN   A   192.0.2.10
│                      │     │    │   └── RDATA: the record's data
│                      │     │    └────── TYPE
│                      │     └─────────── CLASS (always IN = Internet in practice)
│                      └───────────────── TTL in seconds
└──────────────────────────────────────── NAME (owner)
```

একই নাম আর একই টাইপের সব রেকর্ড মিলে একটা **RRset**। `www`-এর তিনটা A রেকর্ড থাকলে তারা একটা RRset, আর DNS সবসময় পুরো RRset একসাথে ফেরত দেয়। একটা RRset-এর সব রেকর্ডের TTL একই হওয়ার কথা (RFC 2181)।

## A ও AAAA: নাম থেকে IP

```text
baytalhikma.org.       300  IN  A     192.0.2.10
baytalhikma.org.       300  IN  A     192.0.2.11
baytalhikma.org.       300  IN  AAAA  2001:db8::10
```

- **A** একটা IPv4 অ্যাড্রেস দেয় (৩২ বিট), **AAAA** একটা IPv6 অ্যাড্রেস (১২৮ বিট, চারগুণ বড় তাই চারটা A)।
- একাধিক A রেকর্ড মানে সার্ভার একাধিক। ক্লায়েন্ট সাধারণত একটা বেছে নেয়, ব্যর্থ হলে পরেরটা চেষ্টা করে। দশ নম্বর চ্যাপ্টারে round robin-এর সীমা দেখবেন।
- AAAA দিলে নিশ্চিত হোন সেই IPv6-এ সার্ভিস সত্যিই চলছে। IPv6 সাপোর্ট করা ইউজার আগে AAAA চেষ্টা করে; ভাঙা AAAA মানে তাদের জন্য সাইট স্লো বা ডাউন, বাকি সবার জন্য ঠিক।

```bash
dig +short baytalhikma.org A
dig +short baytalhikma.org AAAA
```

## CNAME: অন্য নামের alias

```text
www.baytalhikma.org.   3600  IN  CNAME  baytalhikma.pages.example.net.
```

CNAME (canonical name) বলে: "এই নামটা আসলে ওই নামের আরেকটা নাম, ওখানে গিয়ে যা চাও খোঁজো।" Resolver তখন টার্গেটের জন্য আবার লুকআপ করে, আর দুটো উত্তরই ফেরত দেয়:

```text
$ dig www.baytalhikma.org A

;; ANSWER SECTION:
www.baytalhikma.org.            3600  IN  CNAME  baytalhikma.pages.example.net.
baytalhikma.pages.example.net.  60    IN  A      198.51.100.7
```

CNAME-এর সুবিধা: CDN বা হোস্টিং প্রোভাইডার তাদের IP বদলালে আপনাকে কিছু করতে হয় না। কিন্তু এর তিনটা কঠিন নিয়ম আছে, আর এগুলো ভাঙা DNS-এর সবচেয়ে কমন ভুলগুলোর একটা।

**নিয়ম ১: CNAME-এর পাশে আর কিছু থাকতে পারে না।** যে নামে CNAME আছে, সেখানে অন্য কোনো টাইপের রেকর্ড (MX, TXT, A) রাখা যাবে না (RFC 1034, ব্যতিক্রম শুধু DNSSEC রেকর্ড)। কারণ CNAME মানে "এই নামের সব প্রশ্নের উত্তর ওখানে", তাহলে এখানে TXT থাকলে কোনটা সত্যি?

```text
; INVALID: CNAME and TXT at the same name
docs.baytalhikma.org.  IN  CNAME  docs.hosting.example.
docs.baytalhikma.org.  IN  TXT    "verification=abc123"
```

**নিয়ম ২: apex-এ CNAME চলে না।** Apex (zone-এর গোড়া, যেমন `baytalhikma.org` নিজে) সবসময় SOA আর NS রেকর্ড রাখে। নিয়ম ১ অনুযায়ী সেখানে CNAME রাখা অসম্ভব। এটাই কারণ যে "আমার রুট ডোমেইন CDN-এ পয়েন্ট করতে পারছি না" এত কমন একটা প্রশ্ন।

**নিয়ম ৩: চেইন ছোট রাখুন।** CNAME → CNAME → CNAME চলে, কিন্তু প্রতিটা হপ একটা বাড়তি লুকআপ, আর resolver-রা একটা সীমার পর হাল ছেড়ে দেয়। লুপ (`a → b → a`) হলে `SERVFAIL`।

### ALIAS, ANAME, CNAME flattening

Apex সমস্যার জন্য অনেক DNS প্রোভাইডার নিজস্ব একটা ফিচার দেয়, নাম আলাদা: ALIAS, ANAME, CNAME flattening। কাজ একই: **প্রোভাইডার নিজে টার্গেটটা রিজলভ করে, আর ক্লায়েন্টকে সরাসরি A/AAAA দেয়।**

```text
; what you configure in the provider's dashboard
baytalhikma.org.   ALIAS   baytalhikma.pages.example.net.

; what the world actually sees
baytalhikma.org.   60  IN  A  198.51.100.7
```

<Callout type="warning">

ALIAS কোনো স্ট্যান্ডার্ড রেকর্ড টাইপ না, এটা প্রোভাইডারের ফিচার। তাই এটা zone ট্রান্সফারে যায় না, অন্য প্রোভাইডারে একইভাবে মাইগ্রেট হয় না, আর এর আচরণ প্রোভাইডার ভেদে আলাদা। একটা সূক্ষ্ম সমস্যা: প্রোভাইডার টার্গেট রিজলভ করে তার নিজের অবস্থান থেকে, তাই geo-aware CDN ভুল (দূরের) IP দিতে পারে। স্ট্যান্ডার্ড সমাধান হলো HTTPS রেকর্ড (নিচে), তবে ব্রাউজার ছাড়া বাকি ক্লায়েন্টে এর সাপোর্ট সীমিত।

</Callout>

## MX: এই ডোমেইনের মেইল কোথায় যাবে

```text
baytalhikma.org.   3600  IN  MX  10  mx1.mailhost.example.
baytalhikma.org.   3600  IN  MX  20  mx2.mailhost.example.
```

- সংখ্যাটা **preference**: ছোট সংখ্যা আগে। `10` ব্যর্থ হলে `20` চেষ্টা হয়। সমান সংখ্যা হলে এলোমেলোভাবে ভাগ হয়।
- টার্গেট অবশ্যই একটা hostname যার A/AAAA আছে। **IP সরাসরি দেওয়া যায় না, আর টার্গেট CNAME হওয়া উচিত না** (RFC 2181 / 5321)।
- MX না থাকলে মেইল সার্ভার A/AAAA-তে পাঠানোর চেষ্টা করে ("implicit MX")। কোনো ডোমেইন মেইল একদমই না নিলে **null MX** দিন (RFC 7505): `baytalhikma.org. IN MX 0 .`

পুরো ইমেইলের DNS (SPF, DKIM, DMARC) নয় নম্বর চ্যাপ্টারে।

## TXT: যেকোনো লেখা

```text
baytalhikma.org.         IN  TXT  "v=spf1 include:_spf.mailhost.example -all"
baytalhikma.org.         IN  TXT  "google-site-verification=Xy12abc..."
_dmarc.baytalhikma.org.  IN  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@baytalhikma.org"
```

TXT শুরুতে মানুষের পড়ার নোটের জন্য ছিল, আজ এটা DNS-এর সবচেয়ে বহুমুখী রেকর্ড: SPF, DKIM, DMARC, ডোমেইন মালিকানা যাচাই (Google, Microsoft, ACME DNS-01 চ্যালেঞ্জ), আরও অনেক কিছু।

একটা টেকনিক্যাল খুঁটিনাটি যেটা অনেককে বিপদে ফেলে: **একটা TXT রেকর্ডের ভেতরে প্রতিটা string সর্বোচ্চ ২৫৫ বাইট।** লম্বা ডেটা (যেমন ২০৪৮-বিট DKIM key) একাধিক string-এ ভাগ করতে হয়, আর ব্যবহারকারী সেগুলো জোড়া লাগায়:

```text
sel1._domainkey.baytalhikma.org. IN TXT ( "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEF..."
                                          "...AAOCAQ8AMIIBCgKCAQEAx3Fq...IDAQAB" )
```

এখানে দুটো string, মাঝে স্পেস ছাড়াই জোড়া লাগে। একটা আলাদা ব্যাপার হলো একই নামে **একাধিক TXT রেকর্ড** থাকা, যেটা পুরোপুরি বৈধ (ওপরে apex-এ SPF আর Google verification)। কিন্তু **SPF রেকর্ড একটার বেশি থাকলে SPF ভেঙে যায়**, নয় নম্বর চ্যাপ্টারে দেখবেন।

## NS: কে এই zone-এর দায়িত্বে

```text
baytalhikma.org.   86400  IN  NS  ns1.dnsprovider.example.
baytalhikma.org.   86400  IN  NS  ns2.dnsprovider.example.
```

NS রেকর্ড দুই জায়গায় থাকে: parent zone-এ (delegation, রেজিস্ট্রারের মাধ্যমে সেট হয়) আর আপনার নিজের zone-এর apex-এ। দুটো মিলতে হবে, আগের চ্যাপ্টারে দেখেছেন কেন। NS-এর টার্গেটও CNAME হতে পারে না, আর IP দেওয়া যায় না।

অন্তত দুটো nameserver রাখুন, আলাদা নেটওয়ার্কে (RFC 2182)। বেশিরভাগ রেজিস্ট্রার দুটোর কম মানেই না।

## SOA: zone-এর পরিচয়পত্র

প্রতিটা zone-এর apex-এ ঠিক একটা SOA (Start of Authority) রেকর্ড থাকে:

```text
$ dig +multiline baytalhikma.org SOA

baytalhikma.org.   3600 IN SOA ns1.dnsprovider.example. hostmaster.baytalhikma.org. (
                        2026102301 ; serial
                        7200       ; refresh (2 hours)
                        900        ; retry (15 minutes)
                        1209600    ; expire (2 weeks)
                        300        ; minimum (5 minutes)
                        )
```

| ফিল্ড | মানে |
| --- | --- |
| **MNAME** (`ns1.dnsprovider.example.`) | primary nameserver |
| **RNAME** (`hostmaster.baytalhikma.org.`) | দায়িত্বশীলের ইমেইল, প্রথম ডট মানে `@`: `hostmaster@baytalhikma.org` |
| **serial** | zone-এর সংস্করণ নম্বর। প্রতিটা পরিবর্তনে বাড়তে হবে। প্রচলিত ফরম্যাট `YYYYMMDDnn`। |
| **refresh** | secondary সার্ভার কতক্ষণ পরপর primary-কে জিজ্ঞেস করবে "নতুন কিছু?" |
| **retry** | refresh ব্যর্থ হলে কতক্ষণ পর আবার চেষ্টা |
| **expire** | primary-র সাথে এতক্ষণ যোগাযোগ না হলে secondary উত্তর দেওয়া বন্ধ করবে |
| **minimum** | আজকের অর্থে: **negative caching TTL** (RFC 2308), মানে "এই নাম নেই" উত্তর কতক্ষণ ক্যাশ হবে |

refresh/retry/expire আর serial সাত নম্বর চ্যাপ্টারে zone ট্রান্সফারের সাথে কাজে লাগবে। শেষ ফিল্ডটা চার নম্বর চ্যাপ্টারে খুব গুরুত্বপূর্ণ হবে: আপনি একটা নতুন সাবডোমেইন বানানোর আগে কেউ সেটা খুঁজে থাকলে, "নেই" উত্তরটা এতক্ষণ ক্যাশে থেকে যায়।

## PTR: IP থেকে নাম (reverse DNS)

উল্টো দিকের প্রশ্ন: "`192.0.2.10` কার?" এর জন্য একটা বিশেষ zone আছে, `in-addr.arpa`, যেখানে IP-টা **উল্টো করে** লেখা হয়:

```text
10.2.0.192.in-addr.arpa.   3600  IN  PTR  www.baytalhikma.org.
```

উল্টো কেন? কারণ DNS ডান থেকে বামে সাধারণ থেকে নির্দিষ্ট, আর IP বাম থেকে ডানে। উল্টো করলে `192.0.2.x` ব্লকটা একটা zone হয়ে যায় যেটা IP-র মালিককে delegate করা যায়।

IPv6-এর জন্য `ip6.arpa`, প্রতিটা hex নিবল (৪ বিট) উল্টো করে:

```text
2001:db8::10
-> 0.1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa.
```

হাতে লিখতে হবে না, `dig -x` নিজেই উল্টে দেয়:

```bash
dig -x 192.0.2.10 +short
dig -x 2001:db8::10 +short
```

<Callout type="info">

**PTR কে সেট করে?** আপনি না, IP-র মালিক। আপনার VPS-এর IP-র reverse zone চালায় হোস্টিং কোম্পানি, তাই PTR সাধারণত তাদের প্যানেলে ("Reverse DNS" বা "rDNS") সেট করতে হয়। নিজের ডোমেইনের zone-এ PTR লিখলে কিছুই হবে না। মেইল সার্ভারের জন্য এটা জরুরি: Google-এর সেন্ডার নিয়ম অনুযায়ী (২০২৪ সালের ফেব্রুয়ারি থেকে) সব সেন্ডারের সেন্ডিং IP-র বৈধ PTR থাকতে হবে, আর সেই PTR-এর নামটা আবার একই IP-তে রিজলভ হতে হবে। নিয়মগুলো বদলায়, Google-এর sender guidelines পেজে সর্বশেষটা দেখে নিন।

</Callout>

## SRV: সার্ভিস কোথায়, কোন পোর্টে

A রেকর্ড পোর্ট জানে না। SRV জানে:

```text
_xmpp-client._tcp.baytalhikma.org. 3600 IN SRV 10 60 5222 chat1.baytalhikma.org.
_xmpp-client._tcp.baytalhikma.org. 3600 IN SRV 10 40 5222 chat2.baytalhikma.org.
_xmpp-client._tcp.baytalhikma.org. 3600 IN SRV 20 0  5222 backup.baytalhikma.org.
```

ফরম্যাট: `_service._proto.name  TTL  IN  SRV  priority  weight  port  target`

- **priority:** MX-এর মতো, ছোট আগে।
- **weight:** একই priority-র মধ্যে লোড ভাগ। ওপরে `chat1` পায় মোটামুটি ৬০%, `chat2` ৪০%।
- **port:** সার্ভিস কোন পোর্টে।
- **target:** hostname (CNAME না)। `.` মানে "এই সার্ভিস এখানে নেই"।

SRV ব্যবহার করে XMPP, SIP, LDAP/Active Directory, Minecraft, Kubernetes headless service, Consul, আর মেইল ক্লায়েন্টের অটো-কনফিগারেশন। ব্রাউজার HTTP-র জন্য SRV ব্যবহার করে না।

## CAA: কোন CA আমার সার্টিফিকেট দিতে পারবে

```text
baytalhikma.org.  IN  CAA  0 issue "letsencrypt.org"
baytalhikma.org.  IN  CAA  0 issuewild ";"
baytalhikma.org.  IN  CAA  0 iodef "mailto:security@baytalhikma.org"
```

CAA (Certification Authority Authorization, RFC 8659) বলে দেয় কোন CA এই ডোমেইনের সার্টিফিকেট ইস্যু করতে পারবে। সার্টিফিকেট দেওয়ার আগে CA-দের CAA চেক করা বাধ্যতামূলক।

| ট্যাগ | মানে |
| --- | --- |
| `issue` | কোন CA সাধারণ সার্টিফিকেট দিতে পারবে |
| `issuewild` | কোন CA wildcard (`*.baytalhikma.org`) দিতে পারবে। `";"` মানে কেউ না |
| `iodef` | নিয়ম ভাঙার চেষ্টা হলে কোথায় রিপোর্ট পাঠাবে |

গুরুত্বপূর্ণ আচরণ: CA নামটা থেকে **গাছ বেয়ে ওপরে ওঠে** যতক্ষণ না একটা CAA পায়। `api.baytalhikma.org`-এ CAA না থাকলে `baytalhikma.org`-এরটা প্রযোজ্য। কোথাও CAA না থাকলে যেকোনো CA দিতে পারে। আর CAA আছে কিন্তু আপনার CA-র নাম নেই, তাহলে ইস্যু ব্যর্থ হবে। `tls-certs` ট্র্যাকে Let's Encrypt-এর সাথে এটা আবার আসবে।

## HTTPS ও SVCB: আধুনিক সার্ভিস রেকর্ড

RFC 9460 (২০২৩) দুটো নতুন রেকর্ড আনে: **SVCB** (সাধারণ) আর **HTTPS** (ওয়েবের জন্য বিশেষ রূপ)। এরা একটা লুকআপেই ক্লায়েন্টকে বলে দেয় কীভাবে সংযোগ করবে:

```text
baytalhikma.org.  300  IN  HTTPS  1 . alpn="h3,h2" ipv4hint=192.0.2.10 ipv6hint=2001:db8::10
```

- **priority `1` এবং বেশি:** "ServiceMode"। এখানে `alpn="h3,h2"` বলে সার্ভার HTTP/3 সাপোর্ট করে, তাই ব্রাউজার প্রথমবারেই QUIC চেষ্টা করতে পারে। `.` মানে টার্গেট এই নামই।
- **priority `0`:** "AliasMode", apex-এর জন্য একটা স্ট্যান্ডার্ড CNAME-এর মতো আচরণ: `baytalhikma.org. IN HTTPS 0 cdn.example.net.`
- অন্য প্যারামিটার: `port`, `ech` (Encrypted Client Hello-র কনফিগ), `ipv4hint`/`ipv6hint`।
- HTTPS রেকর্ড থাকা মানে ক্লায়েন্ট এই নামের জন্য plain HTTP ব্যবহার করবে না।

ব্রাউজারগুলো (Chrome, Firefox, Safari) HTTPS রেকর্ড চায়, তাই আপনার লগে টাইপ ৬৫-এর অনেক প্রশ্ন দেখবেন। কোন ব্রাউজার কোন প্যারামিটার কতটা মানে তা নিয়মিত বদলায়; ব্যবহারের আগে বর্তমান অবস্থা যাচাই করে নিন। অনেক CDN এই রেকর্ড নিজেই তৈরি করে দেয়।

## DS ও DNSKEY: এক নজরে

DNSSEC-এর রেকর্ডগুলো (DNSKEY, RRSIG, DS, NSEC/NSEC3) উত্তরে সই করার জন্য। আপাতত এটুকু জানুন: **DS** রেকর্ড থাকে parent zone-এ (রেজিস্ট্রারের মাধ্যমে), আর আপনার zone-এর key-এর একটা hash। এটা ভুল হলে পুরো ডোমেইন `SERVFAIL` হয়ে যায়। পুরো গল্প বারো নম্বর চ্যাপ্টারে।

## Wildcard: `*` কখন মেলে

```text
*.baytalhikma.org.     300  IN  A  192.0.2.50
www.baytalhikma.org.   300  IN  A  192.0.2.10
```

`*.baytalhikma.org` এমন সব নামের উত্তর দেয় যেগুলো zone-এ নেই। `blog.baytalhikma.org` → `192.0.2.50`। কিন্তু wildcard-এর নিয়ম (RFC 4592) অনেকের ধারণার চেয়ে কড়া:

1. **যে নাম আছে সেখানে wildcard মেলে না।** `www`-এর A আছে, তাই `www`-এর জন্য wildcard বাদ। শুধু তাই না: `www`-এর জন্য AAAA চাইলেও wildcard-এর AAAA আসবে না; উত্তর হবে "নাম আছে, এই টাইপের ডেটা নেই" (NODATA)।
2. **শুধু বাম দিকের পুরো label হিসেবে `*` চলে।** `*.baytalhikma.org` বৈধ। `api-*.baytalhikma.org` বা `www.*.baytalhikma.org` wildcard না, শুধু একটা অদ্ভুত নাম।
3. **Empty non-terminal ব্লক করে।** `a.b.baytalhikma.org` থাকলে `b.baytalhikma.org` "আছে" ধরা হয় (ডেটা না থাকলেও), তাই `b`-এর জন্য wildcard মেলে না, আর `x.b.baytalhikma.org`-এর জন্য `*.baytalhikma.org` মেলে না।
4. **একাধিক স্তর মেলে।** `a.b.c.baytalhikma.org` (যদি `b.c` বা `c` না থাকে) `*.baytalhikma.org`-এ মেলে। এটা wildcard TLS সার্টিফিকেটের উল্টো, যেটা শুধু এক স্তর মেলে।

<Callout type="danger">

Wildcard রেকর্ড টাইপো লুকিয়ে ফেলে: `ap.baytalhikma.org` (টাইপো) ভুল জায়গায় রিজলভ হয়ে যায়, `NXDOMAIN` হয় না, আর বাগটা DNS-এ ধরা পড়ে না। আর `*` থাকলে মেইল সার্ভার, SPF, CAA সব wildcard-এর আওতায় চলে আসতে পারে। দরকার না থাকলে wildcard রাখবেন না।

</Callout>

## চিট শিট

| টাইপ | কী দেয় | একটা কঠিন নিয়ম |
| --- | --- | --- |
| **A** | IPv4 | একাধিক রাখা যায় |
| **AAAA** | IPv6 | IPv6-এ সার্ভিস চালু না থাকলে দেবেন না |
| **CNAME** | অন্য নামের alias | পাশে আর কোনো রেকর্ড না, apex-এ না |
| **MX** | মেইল সার্ভার + preference | টার্গেট hostname, IP না, CNAME না |
| **TXT** | যেকোনো লেখা | প্রতিটা string সর্বোচ্চ ২৫৫ বাইট |
| **NS** | zone-এর nameserver | parent আর child-এর মিল থাকতে হবে |
| **SOA** | zone-এর মেটাডেটা | প্রতি zone-এ ঠিক একটা, serial বাড়াতে হবে |
| **PTR** | IP থেকে নাম | IP-র মালিক সেট করে |
| **SRV** | সার্ভিস, পোর্ট, ওজন | নাম `_service._proto` ফরম্যাটে |
| **CAA** | অনুমোদিত CA | গাছ বেয়ে ওপরে খোঁজা হয় |
| **HTTPS/SVCB** | সংযোগের প্যারামিটার, apex alias | priority 0 = alias |
| **DS/DNSKEY** | DNSSEC | DS ভুল = পুরো ডোমেইন SERVFAIL |

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

**লক্ষণ: প্রোভাইডার "CNAME conflicts with existing record" বলছে।**
নিশ্চিত হোন:

```bash
dig docs.baytalhikma.org ANY @ns1.dnsprovider.example   # many servers answer ANY minimally
dig docs.baytalhikma.org TXT  @ns1.dnsprovider.example
dig docs.baytalhikma.org A    @ns1.dnsprovider.example
```

কারণ: ওই নামে আগে থেকেই অন্য রেকর্ড আছে। ঠিক করুন: অন্য রেকর্ডগুলো সরান, বা CNAME-এর বদলে টার্গেটের A/AAAA সরাসরি দিন। `ANY` প্রশ্নে পুরো তালিকা আশা করবেন না; RFC 8482-এর পর অনেক সার্ভার ইচ্ছা করে সংক্ষিপ্ত উত্তর দেয়, তাই টাইপ ধরে ধরে জিজ্ঞেস করুন।

**লক্ষণ: রুট ডোমেইন CDN বা PaaS-এ পয়েন্ট করতে পারছি না।**
কারণ: apex-এ CNAME নিষেধ। ঠিক করুন: প্রোভাইডারের ALIAS/flattening ফিচার, অথবা CDN-এর দেওয়া স্থির anycast IP দিয়ে A/AAAA, অথবা apex থেকে `www`-এ HTTP redirect আর `www`-এ CNAME।

**লক্ষণ: TXT যাচাই (Google, ACME, DKIM) ব্যর্থ হচ্ছে।**
নিশ্চিত হোন:

```bash
dig +short TXT _acme-challenge.baytalhikma.org @ns1.dnsprovider.example
dig +short TXT sel1._domainkey.baytalhikma.org
```

কারণ খুঁজুন: (ক) নামের শেষে zone জুড়ে গেছে (`_acme-challenge.baytalhikma.org.baytalhikma.org`), কারণ ফর্মে পুরো নাম দিয়েছেন অথচ প্রোভাইডার শুধু সাবডোমেইন অংশ চায়। (খ) মানের চারপাশে বাড়তি কোট বা স্পেস। (গ) লম্বা DKIM key ভুলভাবে ভাগ হয়েছে, মাঝে স্পেস ঢুকে গেছে। (ঘ) পুরনো মান ক্যাশে, authoritative-এ সরাসরি দেখুন।

**লক্ষণ: মেইল সার্ভার "rDNS mismatch" বা PTR না থাকায় মেইল ফেরত দিচ্ছে।**
নিশ্চিত হোন:

```bash
dig -x 203.0.113.25 +short          # should print mail.baytalhikma.org.
dig +short mail.baytalhikma.org A   # should print 203.0.113.25 again
```

ঠিক করুন: হোস্টিং প্রোভাইডারের প্যানেলে rDNS সেট করুন, আর নিশ্চিত করুন forward আর reverse মেলে।

**লক্ষণ: Let's Encrypt বলছে "CAA record prevents issuance"।**
নিশ্চিত হোন, নাম থেকে ওপরের দিকে প্রতিটা স্তরে:

```bash
dig +short CAA api.baytalhikma.org
dig +short CAA baytalhikma.org
```

কারণ: কোনো স্তরে CAA আছে কিন্তু `letsencrypt.org` নেই, অথবা wildcard চাইছেন কিন্তু `issuewild` অন্য CA বলছে। ঠিক করুন: সঠিক `issue`/`issuewild` লাইন যোগ করুন।

**লক্ষণ: টাইপো সাবডোমেইনও কাজ করছে, বা যে সাবডোমেইন মুছেছি সেটা এখনো রিজলভ হয়।**
নিশ্চিত হোন:

```bash
dig +short this-does-not-exist-12345.baytalhikma.org
```

উত্তর এলে zone-এ wildcard আছে। ঠিক করুন: wildcard দরকার কিনা ভাবুন, না হলে মুছে ফেলুন।

**লক্ষণ: zone ফাইল এডিট করলাম, secondary সার্ভার পুরনো ডেটা দিচ্ছে।**
নিশ্চিত হোন:

```bash
dig +short SOA baytalhikma.org @ns1.baytalhikma.org
dig +short SOA baytalhikma.org @ns2.baytalhikma.org
```

serial দুটো আলাদা হলে secondary আপডেট পায়নি। কারণ: সম্ভবত SOA serial বাড়ানো হয়নি। সাত নম্বর চ্যাপ্টারে বিস্তারিত।

## মূল শিক্ষা

1. **প্রতিটা রেকর্ড = নাম, TTL, ক্লাস, টাইপ, ডেটা।** একই নাম আর টাইপের রেকর্ডগুলো মিলে RRset।
2. **A/AAAA দেয় IP।** ভাঙা AAAA শুধু IPv6 ইউজারদের ক্ষতি করে, তাই চোখে পড়ে দেরিতে।
3. **CNAME-এর পাশে আর কিছু না, apex-এ CNAME না।** ALIAS/flattening হলো প্রোভাইডারের বিকল্প, স্ট্যান্ডার্ড না।
4. **MX আর NS-এর টার্গেট hostname, IP না, CNAME না।**
5. **TXT-এর প্রতিটা string ২৫৫ বাইট পর্যন্ত।** লম্বা key ভাগ হয়, আর ভাগ ভুল হলে যাচাই ব্যর্থ।
6. **SOA-র শেষ ফিল্ড negative caching TTL।** serial প্রতিটা পরিবর্তনে বাড়ান।
7. **PTR সেট করে IP-র মালিক**, আপনার zone না।
8. **CAA গাছ বেয়ে ওপরে খোঁজা হয়।** HTTPS রেকর্ড আধুনিক ব্রাউজারকে সংযোগের পথ বলে দেয়।
9. **Wildcard শুধু অস্তিত্বহীন নামে মেলে**, আর টাইপো লুকিয়ে ফেলে।
