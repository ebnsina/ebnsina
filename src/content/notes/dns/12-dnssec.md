---
title: 'DNSSEC'
subtitle: 'উত্তরটা আসলেই zone-এর মালিকের কিনা, সেটা প্রমাণ করার ক্রিপ্টোগ্রাফিক chain of trust: RRSIG, DNSKEY, DS, NSEC, কী রোলওভার, আর DNSSEC কীভাবে একটা পুরো ডোমেইন ডাউন করে দেয়।'
chapter: 12
level: 'advanced'
readingTime: '২৮ মিনিট'
topics:
  [
    'dnssec',
    'rrsig',
    'dnskey',
    'ds',
    'nsec',
    'nsec3',
    'ksk',
    'zsk',
    'key rollover',
    'trust anchor',
    'cds',
    'delv',
    'dnsviz'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

মরিয়ম বিদেশে পড়তে যাবেন, দূতাবাস তাঁর জন্মসনদ চায়। সনদটা দিয়েছে তাঁর গ্রামের ইউনিয়ন পরিষদ, চেয়ারম্যান সিনা। দূতাবাসের কর্মকর্তা বিরুনি কখনো ওই ইউনিয়নে যাননি, সিনাকে চেনেন না। তাহলে তিনি কীভাবে বুঝবেন কাগজটা আসল, কোনো দালালের কম্পিউটারে ছাপা নয়?

বিরুনি একটা শিকল ধরে ওপরে ওঠেন। সনদে চেয়ারম্যানের সিল আর সই আছে। কিন্তু সিলটা আসল কিনা? জেলা প্রশাসকের অফিসে প্রতিটা ইউনিয়নের সিলের একটা নমুনা জমা থাকে, আর সেই নমুনার পাতায় জেলা প্রশাসক রাজির সিল। রাজির সিলটা আসল কিনা? মন্ত্রণালয়ে প্রতিটা জেলার সিলের নমুনা জমা, তাতে মন্ত্রণালয়ের সিল। আর মন্ত্রণালয়ের সিলটা? সেটার নমুনা বিরুনির দেয়ালে বাঁধাই করে টানানো, অনেক আগে নিজে গিয়ে নিয়ে এসেছিলেন। এই একটা সিলকেই তিনি কোনো প্রমাণ ছাড়া বিশ্বাস করেন, আর বাকি সবকিছু সেটা থেকে একে একে মিলিয়ে নেন। মাঝের কোনো এক ধাপে সিল না মিললে পুরো সনদ বাতিল, যতই সুন্দর ছাপা হোক।

ইউনিয়ন পরিষদের ভেতরের ব্যবস্থাটাও দেখার মতো। সচিব ফারাবি প্রতিদিন শত শত সনদে একটা সাধারণ রাবার স্ট্যাম্প মারেন। চেয়ারম্যানের ভারী আসল সিলটা আলমারিতে তালাবন্ধ থাকে, বছরে একবার বের হয়: শুধু একটা পাতায় সিল মারার জন্য, যে পাতায় লেখা "এই বছর আমাদের অফিসের রাবার স্ট্যাম্প এগুলো"। জেলা অফিসে জমা থাকে শুধু এই ভারী সিলের নমুনা। রাবার স্ট্যাম্প হারালে বা ক্ষয়ে গেলে ইউনিয়ন নিজেই নতুন একটা বানায়, ভারী সিল দিয়ে নতুন তালিকায় সই করে, জেলাকে কিছু জানাতে হয় না। আর প্রতিটা স্ট্যাম্পের ছাপে একটা মেয়াদ লেখা: "এই তারিখ থেকে ওই তারিখ পর্যন্ত বৈধ"। মেয়াদ পেরোনো ছাপ বিরুনি গ্রহণ করেন না।

একবার কেউ জিজ্ঞেস করল, "এই ইউনিয়নে কি 'হোল্ডিং নম্বর ৩১' নামে কোনো বাড়ি আছে?" ফারাবি শুধু "নেই" বললে চলবে না, কারণ মুখের কথা যে কেউ বানাতে পারে। তাই তিনি সিল মারা একটা রেজিস্টারের পাতা দেখান: "হোল্ডিং ৩০-এর পরের বাড়ি ৩২"। মাঝে কিছু নেই, আর পাতাটা সিল করা। তবে এই পাতাগুলো একে একে উল্টে কেউ চাইলে পুরো ইউনিয়নের বাড়ির তালিকা বানিয়ে ফেলতে পারে।

শেষে আসল বিপদের গল্প। নতুন চেয়ারম্যান এসে পুরনো ভারী সিল বদলে নতুন সিল বানালেন, কিন্তু জেলা অফিসে নতুন নমুনা জমা দিতে ভুলে গেলেন। পরদিন থেকে ইউনিয়নের প্রতিটা সনদ, একেবারে আসলগুলোও, দূতাবাসে বাতিল। যারা সিল যাচাই করে না, তাদের কাছে সব চলছে; যারা নিয়ম মেনে যাচাই করে, তাদের কাছে পুরো ইউনিয়নটাই যেন উধাও।

মিলিয়ে নিই: সনদের ওপর সিলের ছাপ হলো **RRSIG**, প্রতিটা রেকর্ড সেটের ওপর সই। ইউনিয়নের সিলের নমুনা, যেটা দিয়ে ছাপ মেলানো হয়, হলো **DNSKEY**। জেলা অফিসে জমা ইউনিয়নের ভারী সিলের নমুনা হলো parent zone-এ রাখা **DS রেকর্ড**। দেয়ালে টানানো মন্ত্রণালয়ের সিল হলো **root trust anchor**, আর জেলা থেকে মন্ত্রণালয় পর্যন্ত শিকলটা **chain of trust** (root → TLD → আপনার zone)। ফারাবির রাবার স্ট্যাম্প হলো **ZSK** (Zone Signing Key), আলমারির ভারী সিল **KSK** (Key Signing Key), আর বছরে একবার স্ট্যাম্পের তালিকায় সই করা হলো **DNSKEY RRset-এর ওপর KSK-এর সই**। ছাপের মেয়াদ হলো RRSIG-এর **inception ও expiration**। "৩০-এর পরে ৩২" লেখা সিল করা পাতা হলো **NSEC** (authenticated denial of existence), আর পাতা উল্টে তালিকা বানানো হলো **zone walking**। বিরুনি হলো **validating resolver**, আর যারা সিল দেখে না তারা non-validating resolver। নতুন সিল বানিয়ে জেলায় না জানানো হলো DNSSEC আউটেজের এক নম্বর কারণ: **DNSKEY বদলেছে কিন্তু parent-এ পুরনো DS রয়ে গেছে**, যার ফল validating resolver-এ **SERVFAIL**।

## DNSSEC কোন সমস্যার সমাধান করে

সাধারণ DNS-এ উত্তরের সাথে কোনো প্রমাণ থাকে না। resolver শুধু দেখে উত্তরটা ঠিক ID আর পোর্টে এসেছে কিনা। যে আক্রমণকারী আগে উত্তর ঢুকিয়ে দিতে পারে (cache poisoning, চ্যাপ্টার ১৩), বা পথের কোনো রাউটার যে উত্তর বদলে দেয়, তাকে resolver আলাদা করতে পারে না।

DNSSEC প্রতিটা রেকর্ড সেটে একটা ডিজিটাল সই যোগ করে। validating resolver সেই সই যাচাই করে, আর মিলে গেলে নিশ্চিত হয়:

- **উত্তরটা zone-এর মালিকের দেওয়া** (origin authenticity)
- **পথে কেউ বদলায়নি** (integrity)
- **"নেই" উত্তরটাও প্রমাণসহ** (authenticated denial of existence)

<Callout type="warning">

**DNSSEC প্রাইভেসি দেয় না।** সব রেকর্ড আর সই খোলা অবস্থায় যায়, যে কেউ পড়তে পারে আপনি কী খুঁজছেন। প্রাইভেসি চাইলে DoT/DoH (চ্যাপ্টার ১১)। দুটো আলাদা সমস্যার আলাদা সমাধান: DNSSEC বলে "উত্তরটা আসল", DoH বলে "পথে কেউ দেখেনি"।

</Callout>

আরেকটা কথা: DNSSEC যাচাই হয় resolver-এ, ব্রাউজারে না। আপনার ল্যাপটপ resolver-কে বিশ্বাস করে, আর resolver থেকে ল্যাপটপ পর্যন্ত পথটা DNSSEC সুরক্ষা দেয় না।

## নতুন রেকর্ড টাইপগুলো

| রেকর্ড     | কোথায় থাকে  | কী করে                                                                    |
| ---------- | ------------ | ------------------------------------------------------------------------- |
| DNSKEY     | আপনার zone   | zone-এর পাবলিক কী; flags 256 = ZSK, 257 = KSK (SEP বিট)                   |
| RRSIG      | আপনার zone   | একটা RRset (একই নাম আর টাইপের সব রেকর্ড) এর সই, মেয়াদসহ                 |
| DS         | parent zone  | child-এর KSK-এর hash; parent-এর সই করা, তাই parent এটার জামিনদার          |
| NSEC       | আপনার zone   | "এই নামের পরের নাম ওইটা, আর এই নামে এই টাইপগুলো আছে" — না থাকার প্রমাণ    |
| NSEC3      | আপনার zone   | NSEC-এর মতো, কিন্তু নামগুলোর hash দিয়ে, zone walking কঠিন করতে          |
| NSEC3PARAM | আপনার zone   | NSEC3-এর hash প্যারামিটার (salt, iteration)                               |
| CDS/CDNSKEY| আপনার zone   | "parent-এ এই DS বসাও" — child থেকে parent-কে সংকেত (RFC 7344, 8078)       |

### সই কীসের ওপর হয়: RRset

DNSSEC আলাদা আলাদা রেকর্ডে সই করে না, পুরো **RRset**-এ। `example.com`-এর দুটো A রেকর্ড মিলে একটা RRset, আর তার জন্য একটা RRSIG:

```text
$ dig +dnssec +noall +answer example.com A @1.1.1.1
example.com.  179  IN  A      172.66.147.243
example.com.  179  IN  A      104.20.23.154
example.com.  179  IN  RRSIG  A 13 2 300 20261024061045 20261022041045 34505 example.com. wef8vdXl...
```

(২০২৬ সালের অক্টোবরে নেওয়া আসল আউটপুট, সই ছোট করা।) RRSIG-এর ঘরগুলো:

```text
A                type covered: this signature is for the A RRset
13               algorithm: ECDSAP256SHA256
2                labels in the owner name (example, com)
300              original TTL (the TTL the signer saw; caches must not exceed it)
20261024061045   expiration  (UTC, YYYYMMDDHHMMSS)
20261022041045   inception
34505            key tag: which DNSKEY made this signature
example.com.     signer name: the zone that signed
wef8vdXl...      the signature itself (base64)
```

লক্ষ্য করুন সইয়ের মেয়াদ মাত্র দুই দিনের। Cloudflare-এর মতো প্রোভাইডার উত্তর দেওয়ার সময়েই সই বানায় (online signing), তাই ছোট মেয়াদ রাখতে পারে। নিজের zone-এ offline সই করলে সাধারণত সপ্তাহ খানেকের মেয়াদ, আর নিয়মিত আবার সই করতে হয়।

### DNSKEY: কোনটা ZSK, কোনটা KSK

```text
$ dig +noall +answer +multi example.com DNSKEY @1.1.1.1
example.com.  3517 IN DNSKEY 256 3 13 ( ... ) ; ZSK; alg = ECDSAP256SHA256 ; key id = 36315
example.com.  3517 IN DNSKEY 256 3 13 ( ... ) ; ZSK; alg = ECDSAP256SHA256 ; key id = 9776
example.com.  3517 IN DNSKEY 256 3 13 ( ... ) ; ZSK; alg = ECDSAP256SHA256 ; key id = 34505
example.com.  3517 IN DNSKEY 257 3 13 ( ... ) ; KSK; alg = ECDSAP256SHA256 ; key id = 2371
```

(আসল আউটপুট, কী বাদ দেওয়া।) চারটা কী: তিনটা ZSK (256) আর একটা KSK (257)। একাধিক ZSK সাধারণত মানে রোলওভার চলছে বা আগামী রোলওভারের জন্য কী আগে থেকে প্রকাশ করা আছে। উপরের A রেকর্ডের RRSIG-এ key tag 34505, মানে এই মুহূর্তে সই করছে সেই ZSK। `+multi` দিলে `dig` key id আর ভূমিকা মন্তব্যে লিখে দেয়, এটা সবসময় ব্যবহার করুন।

### DS: parent-এর জামিন

```text
$ dig +noall +answer example.com DS @1.1.1.1
example.com.  3521  IN  DS  2371 13 2 C988EC423E3880EB8DD8A46FE06CA230EE23F35B578D64E78B29C3E1C83D245A
```

DS-এর ঘর: key tag (2371, উপরের KSK-এর সাথে মেলে), algorithm (13), digest type (2 = SHA-256), আর KSK-এর hash। এই রেকর্ডটা থাকে `.com` zone-এ, `.com`-এর কী দিয়ে সই করা। আপনি এটা সরাসরি বসাতে পারেন না, বসান রেজিস্ট্রারের মাধ্যমে (চ্যাপ্টার ৬)।

## Chain of trust

একটা validating resolver `example.com`-এর A রেকর্ড যাচাই করে এভাবে:

<Mermaid
title="DNSSEC chain of trust for example.com"
code={`graph TD
  TA["Trust anchor in resolver<br/>root KSK, key tag 38696"] -->|"verifies"| RK["Root DNSKEY RRset<br/>signed by root KSK"]
  RK -->|"root ZSK signs"| DSC["DS for com. in root zone"]
  DSC -->|"hash matches"| CK["com. KSK 19718"]
  CK -->|"signs"| CD["com. DNSKEY RRset"]
  CD -->|"com. ZSK signs"| DSE["DS for example.com in com zone"]
  DSE -->|"hash matches"| EK["example.com KSK 2371"]
  EK -->|"signs"| ED["example.com DNSKEY RRset"]
  ED -->|"ZSK 34505 signs"| A["example.com A RRset + RRSIG"]`}
/>

ধাপে ধাপে:

1. resolver-এর কাছে আগে থেকে root-এর KSK আছে (trust anchor)। এটা দিয়ে root-এর DNSKEY RRset-এর সই যাচাই করে, ফলে root-এর ZSK-ও বিশ্বাসযোগ্য হয়।
2. root ZSK দিয়ে সই করা `com.` এর DS রেকর্ড যাচাই করে।
3. `com.` এর DNSKEY আনে, দেখে KSK-এর hash DS-এর সাথে মেলে কিনা, তারপর সেই KSK দিয়ে `com.` এর DNSKEY RRset যাচাই করে।
4. একইভাবে `com.` থেকে `example.com`-এর DS, তারপর `example.com`-এর DNSKEY।
5. শেষে `example.com`-এর ZSK দিয়ে A RRset-এর RRSIG যাচাই।

কোনো একটা ধাপ ভাঙলে (সই মেলে না, মেয়াদ শেষ, DS-এর hash কোনো DNSKEY-এর সাথে মেলে না), উত্তরটা **bogus**, আর resolver ক্লায়েন্টকে **SERVFAIL** দেয়। ভুল উত্তর দেওয়ার চেয়ে কোনো উত্তর না দেওয়া, এটাই DNSSEC-এর নীতি।

resolver প্রতিটা উত্তরকে চারটার একটা অবস্থায় রাখে:

| অবস্থা        | মানে                                                              | ক্লায়েন্ট কী পায়       |
| ------------- | ----------------------------------------------------------------- | ---------------------- |
| secure        | পুরো শিকল trust anchor পর্যন্ত মিলেছে                              | উত্তর + AD ফ্ল্যাগ     |
| insecure      | parent প্রমাণসহ বলেছে "এই child-এর কোনো DS নেই" (সাইন করা না)     | উত্তর, AD ছাড়া         |
| bogus         | সই থাকার কথা ছিল কিন্তু যাচাই ফেইল                                  | SERVFAIL               |
| indeterminate | যাচাই করার মতো তথ্য পাওয়া যায়নি                                    | সাধারণত SERVFAIL       |

"insecure" মানে ভুল না। বেশিরভাগ ডোমেইন এখনো সাইন করা না, আর সেগুলো আগের মতোই resolve হয়। শুধু DS থাকলেই resolver সই আশা করে।

### Root trust anchor আর ২০২৬-এর রোলওভার

root KSK পৃথিবীর প্রতিটা validating resolver-এ বসানো থাকে, তাই এটা বদলানো বিরাট ঘটনা। প্রথম রোলওভার হয়েছিল ২০১৮ সালে (KSK-2010 থেকে KSK-2017, key tag 20326)। দ্বিতীয়টা: KSK-2024 (key tag **38696**) ২০২৫ সালের জানুয়ারিতে root zone-এ প্রকাশ করা হয়, আর ICANN-এর ঘোষিত সময়সূচি অনুযায়ী ১১ অক্টোবর ২০২৬ থেকে root-এর DNSKEY RRset শুধু KSK-2024 দিয়ে সই হওয়ার কথা।

এটা নিজে যাচাই করা যায়। ২০২৬ সালের ২৩ অক্টোবর নেওয়া আউটপুট:

```text
$ dig +dnssec +multi . DNSKEY @1.1.1.1 | grep -E 'key id|RRSIG' -A1
.  IN DNSKEY 257 3 8 ( ... ) ; KSK; alg = RSASHA256 ; key id = 20326
.  IN DNSKEY 257 3 8 ( ... ) ; KSK; alg = RSASHA256 ; key id = 38696
.  IN DNSKEY 256 3 8 ( ... ) ; ZSK; alg = RSASHA256 ; key id = 8763
.  IN RRSIG DNSKEY 8 0 172800 ( 20261111000000 20261021000000 38696 . ... )
```

দুটো KSK এখনো প্রকাশিত (পুরনোটা কিছুদিন পর প্রত্যাহার করা হয়), কিন্তু DNSKEY-এর RRSIG-এ key tag 38696: সই এখন নতুন কী দিয়েই হচ্ছে। যে resolver-এর trust anchor ফাইলে শুধু 20326 আছে আর RFC 5011 অনুযায়ী নিজে থেকে আপডেট নেয়নি, সে এখন root-কেই যাচাই করতে পারবে না, আর সব DNSSEC-সাইন করা নামে SERVFAIL দেবে।

<Callout type="danger">

নিজে resolver চালালে (Unbound, BIND, Knot Resolver, PowerDNS Recursor) trust anchor ফাইলে 38696 আছে কিনা দেখুন। Unbound-এ সাধারণত `root.key`, BIND-এ `bind.keys` বা `managed-keys`, Knot Resolver-এ `root.keys`। পুরনো Docker ইমেজ বা বহু বছর আপডেট না হওয়া appliance সবচেয়ে ঝুঁকিতে। সময়সূচি আর বর্তমান অবস্থা ICANN-এর root KSK রোলওভার পেজে মিলিয়ে নিন।

</Callout>

## KSK, ZSK আর CSK: কেন দুটো কী

এক কী দিয়েই সব করা যায়, তবু সাধারণত দুটো রাখা হয়:

- **ZSK** zone-এর সব RRset সই করে। এটা প্রায়ই ব্যবহার হয়, তাই ঘনঘন বদলানো সুবিধাজনক, আর বদলালে parent-কে জানাতে হয় না।
- **KSK** শুধু DNSKEY RRset সই করে। parent-এর DS এর দিকেই নির্দেশ করে। এটা বদলানো মানে রেজিস্ট্রার আর parent zone জড়িত, তাই কম বদলানো হয়।

ঐতিহাসিকভাবে RSA-র যুগে এই ভাগ যুক্তিসঙ্গত ছিল: ছোট ZSK দিয়ে রেসপন্স ছোট রাখা, বড় KSK দিয়ে নিরাপত্তা। ECDSA বা Ed25519-এ কী এমনিতেই ছোট আর শক্ত, তাই অনেকে একটাই কী ব্যবহার করেন যেটা দুই কাজই করে: **CSK** (Combined Signing Key)। ঝামেলা কম, কিন্তু প্রতিটা রোলওভারে DS বদলাতে হয়। CDS/CDNSKEY অটোমেশন থাকলে সেটা আর সমস্যা না।

## অ্যালগরিদম

DNSSEC অ্যালগরিদমের ব্যবহার-নির্দেশনা এখন RFC 9904 অনুযায়ী IANA-র রেজিস্ট্রিতে থাকে। ২০২৬ সালের অক্টোবর অনুযায়ী (রেজিস্ট্রির শেষ আপডেট ২০২৬-০৮-১০):

| নম্বর | নাম              | সাইন করার জন্য     | মন্তব্য                                         |
| ----- | ---------------- | ------------------ | ----------------------------------------------- |
| 5, 7  | RSASHA1          | MUST NOT           | SHA-1 ভাঙা; নতুন সাইনিংয়ে ব্যবহার নিষেধ          |
| 8     | RSASHA256        | RECOMMENDED        | root আর অনেক TLD এখনো এটা ব্যবহার করে          |
| 10    | RSASHA512        | NOT RECOMMENDED    |                                                 |
| 13    | ECDSAP256SHA256  | RECOMMENDED        | সবচেয়ে প্রচলিত আধুনিক পছন্দ; ছোট সই            |
| 14    | ECDSAP384SHA384  | MAY                |                                                 |
| 15    | ED25519          | RECOMMENDED        | ছোট আর দ্রুত; পুরনো validator-এ সাপোর্ট কম হতে পারে |
| 16    | ED448            | MAY                |                                                 |

নতুন zone-এর জন্য বাস্তব পছন্দ **13** (ECDSAP256SHA256)। উপরের `example.com` আর `.com` দুটোই এটা ব্যবহার করে। নির্দেশনা বদলায়, তাই নতুন zone সাইন করার আগে IANA-র "DNS Security Algorithm Numbers" রেজিস্ট্রি একবার দেখে নিন।

## "নেই"-এর প্রমাণ: NSEC আর NSEC3

`doesnotexist.baytalhikma.org` চাইলে সার্ভার কোন RRset সই করবে? রেকর্ডই তো নেই। সমাধান: zone-এর নামগুলো সাজানো ক্রমে রেখে প্রতিটা নামের জন্য একটা NSEC রেকর্ড, যেটা বলে "আমার পরের নাম এটা"। কোনো নাম যদি দুইটা পরপর নামের মাঝে পড়ে, সেই NSEC (সইসহ) প্রমাণ করে নামটা নেই।

```text
; zone, sorted canonically
alpha.baytalhikma.org.  NSEC  library.baytalhikma.org.  A AAAA RRSIG NSEC
library.baytalhikma.org. NSEC  www.baytalhikma.org.     CNAME RRSIG NSEC

; query: doesnotexist.baytalhikma.org A
; answer: NXDOMAIN + the first NSEC above (alpha < doesnotexist < library) + RRSIG
```

একই NSEC "নাম আছে কিন্তু এই টাইপ নেই" প্রমাণ করে (NODATA): `alpha` এর NSEC-এ টাইপ তালিকায় MX নেই, তাই `alpha`-র MX চাইলে সেটা প্রমাণ।

**zone walking:** NSEC-এর শিকল ধরে হাঁটলে zone-এর সব নাম বের হয়ে যায় (`ldns-walk`, `dnsrecon` এই কাজ করে)। গোপন সাবডোমেইন থাকলে এটা সমস্যা।

**NSEC3** (RFC 5155) নামের বদলে নামের hash সাজায়। hash থেকে নাম সরাসরি বের হয় না, তবে সাধারণ নামের ডিকশনারি দিয়ে offline অনুমান করা যায়, তাই এটা লুকায় কিন্তু পুরোপুরি না। বাড়তি iteration আর salt সত্যিকার নিরাপত্তা খুব একটা বাড়ায় না অথচ validator-এর CPU খায়; RFC 9276 তাই iteration 0 আর salt খালি রাখার সুপারিশ করে।

**Compact denial (RFC 9824, ২০২৫):** online signing করা প্রোভাইডাররা আরেকটা কৌশল নেয়: না-থাকা নামের জন্য NXDOMAIN না দিয়ে NOERROR দেয়, আর ঠিক সেই নামের জন্য তাৎক্ষণিক একটা ছোট NSEC বানায় যেটা বলে "এই নামে শুধু RRSIG আর NSEC আছে"। এতে zone walking অসম্ভব, রেসপন্স ছোট। আসল আউটপুট:

```text
$ dig +dnssec nonexistent-xyz123.example.com A @1.1.1.1 +noall +authority
example.com.                    1800 IN SOA   elliott.ns.cloudflare.com. dns.cloudflare.com. ...
nonexistent-xyz123.example.com. 1800 IN NSEC  \000.nonexistent-xyz123.example.com. RRSIG NSEC TYPE128
```

`TYPE128` হলো NXNAME নামের একটা ছদ্ম-টাইপ, যেটা বোঝায় "নামটা আসলে নেই"। পুরনো `dig` নামটা চেনে না বলে নম্বর দেখায়। মজার পরিণতি: এমন zone-এ status `NOERROR` দেখে ভাববেন না নামটা আছে; ANSWER খালি কিনা দেখুন।

## AD আর CD বিট

- **AD** (Authentic Data): resolver উত্তরে এটা সেট করে যদি নিজে যাচাই করে "secure" পেয়ে থাকে। `dig`-এ `flags: qr rd ra ad`।
- **CD** (Checking Disabled): ক্লায়েন্ট query-তে এটা সেট করলে resolver যাচাই না করেই উত্তর দেয়, bogus হলেও।
- **DO** (DNSSEC OK, EDNS-এর ভেতরে): "উত্তরের সাথে RRSIG/NSEC দাও"। `dig +dnssec` এটা সেট করে।

এই তিনটা মিলিয়েই DNSSEC সমস্যার সবচেয়ে গুরুত্বপূর্ণ টেস্ট:

```text
$ dig baytalhikma.org A @1.1.1.1
;; ->>HEADER<<- opcode: QUERY, status: SERVFAIL, id: 4120
; EDE: 9 (DNSKEY Missing): (no SEP matching the DS found for baytalhikma.org.)

$ dig +cd baytalhikma.org A @1.1.1.1
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 29011
;; flags: qr rd ra cd; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1
baytalhikma.org.  300  IN  A  192.0.2.80
```

(আউটপুট উদাহরণস্বরূপ।) সাধারণভাবে SERVFAIL, কিন্তু `+cd` দিলে উত্তর আসে, মানে রেকর্ড ঠিক আছে, সার্ভারও চলছে, ভাঙা শুধু DNSSEC শিকল। আর নতুন `dig`-এর `EDE` লাইন সরাসরি বলে দেয় কোন ধাপে।

<Callout type="tip">

**আপনার resolver কি আদৌ যাচাই করে?** দুটো টেস্ট: একটা সাইন করা ডোমেইনে `dig +dnssec` দিলে `ad` আসা উচিত, আর ইচ্ছা করে ভাঙা রাখা টেস্ট ডোমেইনে SERVFAIL আসা উচিত। যদি `ad` না আসে আর ভাঙা ডোমেইনও resolve হয়, আপনার resolver যাচাই করে না, অথবা পথের কোনো DNS proxy ফ্ল্যাগ মুছে দিচ্ছে (চ্যাপ্টার ১১-এর ইন্টারসেপশন টেস্ট দেখুন)।

</Callout>

## যাচাইয়ের টুল

**`dig +dnssec +multi`**: কাঁচা রেকর্ড দেখতে। `+multi` key id আর ভূমিকা দেখায়।

**`delv`** (BIND-এর সাথে আসে): `dig`-এর মতো, কিন্তু নিজে পুরো যাচাই করে আর ফলাফল বলে:

```text
$ delv example.com A
; fully validated
example.com.  300  IN  A  104.20.23.154
example.com.  300  IN  RRSIG  A 13 2 300 ...

$ delv baytalhikma.org A
;; resolution failed: SERVFAIL
;; validating baytalhikma.org/DNSKEY: no valid signature found (DS)
```

(আউটপুট উদাহরণস্বরূপ।) `delv +rtrace` দিলে প্রতিটা ধাপের লুকআপ দেখায়, `+vtrace` দিলে যাচাইয়ের প্রতিটা সিদ্ধান্ত। `delv`-এর নিজের trust anchor লাগে; কিছু প্ল্যাটফর্মে (যেমন macOS-এর বিল্ট-ইন পুরনো ভার্সন) এটা crypto সাপোর্ট বা কী ছাড়া আসে আর `No trusted keys were loaded` বলে। তখন Homebrew বা প্যাকেজ ম্যানেজার থেকে আধুনিক BIND টুলস নিন।

**DNSViz** (dnsviz.net, আর ইন্সটলযোগ্য CLI): পুরো শিকলটা ছবি আকারে আঁকে, root থেকে আপনার রেকর্ড পর্যন্ত, আর প্রতিটা ভাঙা তীর লাল করে দেয়। DNSSEC ডিবাগিংয়ে এটাই সবচেয়ে দ্রুত রাস্তা।

**Verisign DNSSEC Analyzer, Zonemaster**: একই ধরনের অনলাইন চেকার, দ্বিতীয় মতামতের জন্য ভালো।

## কী রোলওভার

কী বদলানোর সময় মূল সমস্যা হলো **ক্যাশ**: পুরনো DNSKEY বা DS কোথাও না কোথাও TTL পর্যন্ত বেঁচে থাকে। নতুন সইয়ের সাথে পুরনো কী, বা পুরনো সইয়ের সাথে নতুন কী মিললে যাচাই ফেইল। তাই রোলওভারের পদ্ধতিগুলো আসলে "কখন কী প্রকাশ করব যাতে কোনো ক্যাশে বেমানান জোড়া না থাকে" এর নিয়ম (RFC 6781, 7583)।

**ZSK: pre-publish**

```text
1. Publish new ZSK in DNSKEY RRset (still signing with old)
2. Wait >= DNSKEY TTL  (every cache now knows both keys)
3. Start signing with new ZSK
4. Wait >= max TTL of any signed RRset + propagation  (old signatures expire from caches)
5. Remove old ZSK
```

**KSK: double-DS বা double-KSK**

```text
double-KSK:
1. Add new KSK to DNSKEY RRset, sign DNSKEY with both KSKs
2. Wait >= DNSKEY TTL
3. Submit new DS to parent (registrar / CDS)
4. Wait until parent publishes it, then >= DS TTL (set by the TLD; check it with dig)
5. Remove old DS from parent
6. Wait >= DS TTL
7. Remove old KSK
```

প্রতিটা "অপেক্ষা" বাদ দেওয়া মানে কোনো না কোনো resolver-এ কিছু সময়ের জন্য SERVFAIL। ম্যানুয়ালি এটা করা ঝুঁকিপূর্ণ; BIND-এর `dnssec-policy`, Knot DNS-এর অটোমেটিক সাইনিং, বা PowerDNS-এর মতো সফটওয়্যার সময়গুলো নিজেই হিসাব করে।

### CDS/CDNSKEY: parent-কে নিজে থেকে জানানো

KSK রোলওভারের দুর্বলতম ধাপ হলো মানুষের হাতে রেজিস্ট্রারের প্যানেলে নতুন DS বসানো। CDS আর CDNSKEY রেকর্ড (RFC 7344, 8078) child zone-এ প্রকাশ করা হয়, বলে "parent-এ আমার DS এটা হওয়া উচিত"। যে parent বা রেজিস্ট্রার এটা সাপোর্ট করে, সে নিয়মিত child-এর CDS দেখে (বর্তমান DNSSEC কী দিয়ে সই করা হলে তবেই বিশ্বাস করে) আর নিজেই DS আপডেট করে। CDS-এ একটা বিশেষ মান (`0 0 0 00`) দিলে মানে "DS মুছে দাও", অর্থাৎ নিরাপদে DNSSEC বন্ধ করা। কোন TLD আর রেজিস্ট্রার এটা সাপোর্ট করে তা ভিন্ন, নিজের রেজিস্ট্রারে মিলিয়ে নিন।

## DNSSEC কীভাবে একটা ডোমেইন ডাউন করে

DNSSEC-এর ফেইলিওর মোড অদ্ভুত: সমস্যা হলে ইউজারদের একটা অংশের কাছে ডোমেইন পুরোপুরি উধাও, বাকিদের কাছে সব ঠিক। কারণ শুধু validating resolver (Google, Cloudflare, Quad9, অনেক ISP) SERVFAIL দেয়, non-validating resolver আগের মতোই উত্তর দেয়। "আমার এখানে চলে, ক্লায়েন্টের ওখানে চলে না" অভিযোগের পেছনে প্রায়ই এটাই।

প্রধান কারণগুলো, যত প্রচলিত তত আগে:

1. **DNS প্রোভাইডার বদলানো কিন্তু পুরনো DS রেখে দেওয়া।** পুরনো প্রোভাইডার নিজের কী দিয়ে সই করত, parent-এ তার DS। নতুন প্রোভাইডারে nameserver সরালেন, নতুন প্রোভাইডার হয় সাইন করে না, নয় নিজের আলাদা কী দিয়ে করে। parent-এর DS এখন এমন কী-এর দিকে নির্দেশ করে যেটা আর নেই। ফল: bogus, SERVFAIL। **নিয়ম:** প্রোভাইডার বদলের আগে DS সরান, TTL পার হতে দিন, তারপর nameserver বদলান, তারপর নতুন প্রোভাইডারে DNSSEC চালু করে নতুন DS দিন। অথবা দুই প্রোভাইডারের কী একে অপরের zone-এ রেখে (multi-signer, RFC 8901) বিরতিহীন সরানো।
2. **সইয়ের মেয়াদ শেষ।** offline সাইনিংয়ে re-sign করার cron বন্ধ হয়ে গেছে, বা সার্ভারের ঘড়ি ভুল। RRSIG-এর expiration পেরিয়ে গেলে পুরো zone bogus। এটা ধীরে আসে, কয়েক দিন সব ঠিক থাকে, তারপর একসাথে সব ভাঙে।
3. **KSK রোলওভারে ধাপ বাদ।** নতুন KSK চালু করে পুরনো সরিয়ে দিয়েছেন, কিন্তু parent-এ DS এখনো পুরনোটা।
4. **ভুল DS বসানো।** রেজিস্ট্রারের প্যানেলে ভুল key tag, ভুল algorithm নম্বর, বা ZSK-এর DS দিয়েছেন।
5. **অ্যালগরিদম বদল ঠিকমতো না করা।** যেমন 8 থেকে 13-এ যাওয়ার সময় নতুন অ্যালগরিদমের সই সব RRset-এ যোগ করার আগে DS বদলানো।
6. **resolver-এর trust anchor পুরনো।** এটা আপনার zone-এর দোষ না, resolver-এর। ২০২৬-এর root রোলওভারের পরে পুরনো appliance-এ সব সাইন করা নামেই SERVFAIL।
7. **বড় রেসপন্স আর বন্ধ TCP।** DNSKEY RRset বড়, প্রায়ই ১২৩২ byte পেরোয়। TCP/53 বন্ধ থাকলে শুধু DNSSEC-এর অংশটা ফেইল করে (চ্যাপ্টার ১১)।

<Callout type="warning">

আউটেজের সময় দ্রুত সমাধান হিসেবে DS মুছে ফেলা কাজ করে, কিন্তু তাৎক্ষণিক না। parent zone-এ DS-এর TTL (TLD ভেদে এক ঘণ্টা থেকে এক দিন; TLD-র সার্ভারে `dig DS` করে আসল মান দেখুন) পার না হওয়া পর্যন্ত resolver পুরনো DS ক্যাশ থেকে মনে রাখবে। বড় পাবলিক resolver-এর ক্যাশ ফ্লাশ পেজ (Google, Cloudflare দুজনেরই আছে) দিয়ে কিছুটা দ্রুত করা যায়। আর কিছু resolver অপারেটর বড় আউটেজে নির্দিষ্ট ডোমেইনের জন্য সাময়িকভাবে যাচাই বন্ধ রাখে (negative trust anchor, RFC 7646)।

</Callout>

## DNSSEC চালু করবেন কি?

সৎ হিসাব: DNSSEC নিরাপত্তা বাড়ায়, কিন্তু ভুল কনফিগারেশন যে আউটেজ ঘটায় তা সাধারণ DNS ভুলের চেয়ে ধরা কঠিন। ম্যানেজড DNS প্রোভাইডারে এক ক্লিকে চালু করা আর রেজিস্ট্রারে DS বসানো এখন অনেক সহজ, আর অনেক রেজিস্ট্রার-প্রোভাইডার জোড়া নিজেই DS বসিয়ে দেয়। চালু করলে:

- একটা মনিটর রাখুন যেটা প্রতিদিন `delv` বা DNSViz দিয়ে যাচাই করে, আর RRSIG মেয়াদ শেষের কয়েক দিন আগে সতর্ক করে।
- প্রোভাইডার বদলের রানবুকে DS সরানোর ধাপটা সবার আগে লিখুন।
- DANE (TLSA রেকর্ড, যেমন ইমেইল সার্ভারের সার্টিফিকেট DNS-এ প্রকাশ করা) বা SSHFP ব্যবহার করতে চাইলে DNSSEC বাধ্যতামূলক, কারণ ওগুলোর পুরো নিরাপত্তা DNSSEC-এর ওপর দাঁড়িয়ে।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

**লক্ষণ: ডোমেইন কিছু ইউজারের কাছে কাজ করে না, Google/Cloudflare DNS-এ SERVFAIL, কিন্তু অন্য কিছু নেটওয়ার্কে ঠিক।**
যাচাই:

```text
$ dig baytalhikma.org @8.8.8.8          # SERVFAIL?
$ dig +cd baytalhikma.org @8.8.8.8      # NOERROR with an answer? -> DNSSEC
$ dig +noall +answer baytalhikma.org DS @a.gtld-servers.net     # what parent has (use your TLD's server)
$ dig +noall +answer +multi baytalhikma.org DNSKEY @ns1.your-provider.example
```

DS-এর key tag আর algorithm কোনো KSK (257)-এর সাথে মেলে কিনা দেখুন। না মিললে রেজিস্ট্রারে সঠিক DS দিন, বা প্রোভাইডার বদলের পরে হলে DS সরান। শেষে DNSViz দিয়ে পুরো শিকল নিশ্চিত করুন।

**লক্ষণ: হঠাৎ পুরো zone SERVFAIL, কিছু বদলাননি।**
যাচাই: `dig +dnssec SOA baytalhikma.org @ns1...`-এ RRSIG-এর expiration তারিখ দেখুন। আজকের তারিখ পেরিয়ে গেলে re-signing বন্ধ। সাইনিং প্রসেস/cron, আর সার্ভারের ঘড়ি (`timedatectl`) দেখুন। আবার সই করুন আর এই মেয়াদের ওপর অ্যালার্ট বসান।

**লক্ষণ: নিজের চালানো resolver-এ সব সাইন করা ডোমেইন SERVFAIL, অথচ পাবলিক resolver-এ ঠিক।**
যাচাই: trust anchor ফাইলে 38696 আছে কিনা, আর resolver-এর লগে "trust anchor" বা "no valid signature for ." জাতীয় লাইন। সমাধান: সফটওয়্যার আপডেট বা trust anchor ফাইল নতুন করে নেওয়া (Unbound-এ `unbound-anchor`)।

**লক্ষণ: ছোট রেকর্ড চলে, কিন্তু DNSKEY query টাইমআউট, আর validating resolver-এ মাঝে মাঝে SERVFAIL।**
যাচাই: `dig +dnssec DNSKEY baytalhikma.org @ns1...` আর `+tcp` দিয়ে একই। UDP-তে টাইমআউট আর TCP-তে ফেইল মানে fragmentation আর বন্ধ TCP/53। EDNS বাফার ১২৩২ আর TCP খুলুন।

**লক্ষণ: subdomain-এর NXDOMAIN আশা করছেন কিন্তু NOERROR আসছে, খালি answer সহ।**
এটা compact denial (RFC 9824), ভুল না। AUTHORITY-তে NSEC-এর টাইপ তালিকায় `NXNAME` বা `TYPE128` আছে কিনা দেখুন। মনিটরিং স্ক্রিপ্ট শুধু status দেখলে সেটা বদলাতে হবে: ANSWER খালি কিনা দেখুন।

**লক্ষণ: আপনার resolver `ad` ফ্ল্যাগ কখনো দেখায় না।**
যাচাই: `dig +dnssec example.com @1.1.1.1` আর `@9.9.9.9`। দুটোতেই `ad` না এলে পথে কোনো DNS proxy (রাউটার, ISP ইন্টারসেপশন) উত্তর নতুন করে বানাচ্ছে। চ্যাপ্টার ১১-এর `whoami` টেস্ট আর `dig +tls` দিয়ে তুলনা করুন।

## মূল শিক্ষা

1. **DNSSEC প্রমাণ করে উত্তরটা আসল আর অপরিবর্তিত; প্রাইভেসি দেয় না।**
2. **সই হয় RRset-এ (RRSIG), কী থাকে DNSKEY-তে, আর parent-এর DS child-এর KSK-এর জামিন।** শিকলটা root trust anchor থেকে আপনার রেকর্ড পর্যন্ত যায়।
3. **২০২৬ সালে root KSK বদলেছে (20326 থেকে 38696)।** নিজের resolver চালালে trust anchor হালনাগাদ কিনা দেখুন।
4. **নতুন zone-এ অ্যালগরিদম 13; RSASHA1 দিয়ে সাইন করা নিষেধ।**
5. **NSEC/NSEC3 "নেই" প্রমাণ করে**; NSEC-এ zone walking সম্ভব, compact denial এটা পুরোপুরি বন্ধ করে।
6. **SERVFAIL পেলে প্রথম টেস্ট `+cd`।** `+cd` দিলে উত্তর এলে সমস্যা DNSSEC শিকলে, আর EDE লাইন বলে দেয় কোথায়।
7. **এক নম্বর আউটেজ: প্রোভাইডার বদলানো অথচ পুরনো DS রেখে দেওয়া।** দুই নম্বর: সইয়ের মেয়াদ শেষ।
8. **রোলওভার মানে ক্যাশের সাথে সময় মেলানো**; অটোমেশন (dnssec-policy, CDS/CDNSKEY) ব্যবহার করুন, হাতে করবেন না।
