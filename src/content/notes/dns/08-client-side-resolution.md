---
title: 'ক্লায়েন্টের দিক: অ্যাপ থেকে resolver পর্যন্ত'
subtitle: 'dig যা বলে আর আপনার অ্যাপ যা পায়, দুটো কেন আলাদা হয়: /etc/hosts, nsswitch, resolv.conf, systemd-resolved, macOS আর Windows-এর ক্যাশ, ব্রাউজার, রানটাইম, Docker আর Kubernetes।'
chapter: 8
level: 'intermediate'
readingTime: '২২ মিনিট'
topics: ['getaddrinfo', 'resolv.conf', 'nsswitch', 'systemd-resolved', 'ndots', 'kubernetes dns', 'docker dns', 'dns cache']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
	import Mermaid from '$lib/components/content/Mermaid.svelte';
</script>

## গল্পে বুঝি

বিরুনির বাসায় নিয়ম আছে, কারো ফোন নম্বর লাগলে আগে ফ্রিজের দরজায় সাঁটা কাগজটা দেখতে হবে। ওখানে মা হাতে লিখে রেখেছেন দরকারি কয়েকটা নম্বর: গ্যাসের মিস্ত্রি, ডাক্তার চাচা, আর "ইলেকট্রিশিয়ান: ০১৭..."। কাগজে থাকলে আর কাউকে জিজ্ঞেস করার দরকার নেই, কাগজই চূড়ান্ত, এমনকি মিস্ত্রি নম্বর বদলে ফেললেও কাগজ পুরনোটাই দেখাবে যতদিন না কেউ কেটে দেয়। কাগজে না পেলে বিরুনি মাকে জিজ্ঞেস করে। মা গত কয়েকদিনে যে নম্বরগুলো কাজে লাগিয়েছেন সেগুলো তার মনে থাকে। মায়েরও মনে না থাকলে মা ফোন দেন মোড়ের দোকানদার কিন্দিকে, যিনি পুরো পাড়ার খবর রাখেন আর না জানলে নিজেই খুঁজে বের করেন।

একদিন বিরুনির ছোট ভাই শুধু বলল "ফারুক ভাইয়ের নম্বরটা দাও"। মায়ের অভ্যাস হলো ছোট নাম শুনলে আগে আত্মীয়দের তালিকায় খোঁজা: "নানুবাড়ির ফারুক?", "দাদাবাড়ির ফারুক?", "স্কুলের ফারুক?", প্রতিটার জন্য আলাদা করে কিন্দিকে ফোন, সবকটায় "না" শুনে তারপর শেষে আসল "ফারুক ভাই"। উত্তর ঠিকই এল, কিন্তু চারটা ফোনের পর। অথচ ভাই যদি পুরো পরিচয় দিত, "রাজশাহীর ফারুক ভাই, ব্যস", মা সরাসরি এক ফোনেই পেয়ে যেতেন। আরেকদিন বিরুনি নিজের মোবাইলে সরাসরি কিন্দিকে ফোন করে একটা নম্বর জেনে নিল, আর অবাক হয়ে দেখল ফ্রিজের কাগজে সেই নামের পাশে লেখা নম্বরটা আলাদা। কাগজটা কিন্দি দেখেন না, শুধু বাসার লোকেরা দেখে।

মিলিয়ে নিই: ফ্রিজের কাগজ হলো **`/etc/hosts`**, যা সবার আগে দেখা হয় আর DNS-কে ওভাররাইড করে। "আগে কাগজ, তারপর মা" এই নিয়মটা লেখা থাকে **`/etc/nsswitch.conf`**-এ। মায়ের মনে রাখা নম্বরগুলো হলো **OS-এর লোকাল DNS ক্যাশ** (systemd-resolved, mDNSResponder, Windows DNS Client), আর মোড়ের দোকানদার কিন্দি হলো **recursive resolver**, যার ঠিকানা লেখা **`/etc/resolv.conf`**-এ। ছোট নাম শুনে আত্মীয়দের তালিকা ধরে একে একে খোঁজা হলো **search domain**, আর কখন সেই তালিকা আগে ঘাঁটতে হবে সেটা ঠিক করে **`ndots`**। পুরো পরিচয় দেওয়া মানে নামের শেষে **ডট দিয়ে FQDN** লেখা। আর নিজের মোবাইলে সরাসরি কিন্দিকে ফোন করা হলো **`dig`**: সে সরাসরি resolver-কে জিজ্ঞেস করে, `/etc/hosts` বা OS-এর নিয়ম দেখে না। এজন্যই "dig তো ঠিক বলছে, অ্যাপ কেন ভুল পাচ্ছে" প্রশ্নের উত্তর প্রায় সবসময় এই চ্যাপ্টারের কোথাও লুকিয়ে থাকে।

## dig আর আপনার অ্যাপ এক রাস্তায় হাঁটে না

এই চ্যাপ্টারের সবচেয়ে গুরুত্বপূর্ণ কথা দিয়ে শুরু করি: **`dig`, `nslookup` আর `host` সরাসরি DNS প্রোটোকলে resolver-কে প্রশ্ন করে। ব্রাউজার, curl, আপনার Go বা Node অ্যাপ সাধারণত করে না।** ওরা OS-এর "নাম থেকে অ্যাড্রেস" ফাংশন ডাকে (C লাইব্রেরিতে `getaddrinfo`), আর সেই ফাংশন অনেকগুলো উৎস ঘুরে আসে।

<Mermaid
title="একটা অ্যাপের নাম resolve করার পথ (Linux, সাধারণ সেটআপ)"
code={`graph TD
  A["App calls getaddrinfo"] --> B["Runtime cache (JVM, browser)"]
  B --> N["nsswitch.conf order"]
  N --> H["/etc/hosts"]
  N --> R["resolver library reads resolv.conf"]
  R --> S["systemd-resolved stub 127.0.0.53 (cache)"]
  S --> U["Upstream recursive resolver"]
  U --> W["root, TLD, authoritative"]
  D["dig"] -.->|"skips hosts, nsswitch"| S`}
/>

তাই অ্যাপ আর `dig` আলাদা উত্তর দিলে সন্দেহের তালিকা: `/etc/hosts`, nsswitch-এর ক্রম, search domain, OS বা রানটাইমের ক্যাশ, VPN-এর split DNS। OS-এর আসল রাস্তা দিয়ে কী আসে দেখতে Linux-এ `getent` ব্যবহার করুন, এটা অ্যাপের মতোই `getaddrinfo` ডাকে:

```bash
getent ahosts api.baytalhikma.org
```

```text
203.0.113.20    STREAM api.baytalhikma.org
203.0.113.20    DGRAM
203.0.113.20    RAW
```

`dig +short api.baytalhikma.org` আর `getent ahosts api.baytalhikma.org` আলাদা কিছু দিলে সমস্যা DNS-এ নয়, আপনার মেশিনের লোকাল কনফিগে।

## `/etc/hosts`: সবার আগে, সবার উপরে

```text
127.0.0.1   localhost
::1         localhost
203.0.113.99  api.baytalhikma.org   # added during migration test, never removed
```

এই ফাইলের এন্ট্রি DNS-এর চেয়ে আগে দেখা হয় (ডিফল্ট nsswitch অনুযায়ী) আর কোনো TTL নেই। মাইগ্রেশনের সময় টেস্ট করতে কেউ একটা লাইন বসিয়ে ভুলে গেছে, আর ছয় মাস পর পুরনো সার্ভার বন্ধ হতেই শুধু ওই মেশিনের অ্যাপ ভেঙে গেছে: এটা খুবই কমন গল্প। macOS-এ ফাইলটা `/etc/hosts`, Windows-এ `C:\Windows\System32\drivers\etc\hosts`।

## `/etc/nsswitch.conf`: কোন উৎস কোন ক্রমে

```text
hosts: files mdns4_minimal [NOTFOUND=return] resolve [!UNAVAIL=return] dns myhostname
```

বাঁ থেকে ডানে: `files` মানে `/etc/hosts`, `mdns4_minimal` মানে `.local` নামের জন্য mDNS, `resolve` মানে systemd-resolved, `dns` মানে `resolv.conf` পড়ে সরাসরি DNS। বন্ধনীর অংশগুলো বলে কোন ফলাফলে থেমে যেতে হবে। এখানে `[NOTFOUND=return]` এর মানে `.local` নাম mDNS-এ না পেলে আর DNS-এ যাওয়া হবে না। আপনার কোম্পানির ভেতরের ডোমেইন যদি `.local`-এ শেষ হয় (যা অনেক পুরনো Active Directory সেটআপে ছিল), এই লাইনটাই সেই রহস্যের উত্তর।

## `/etc/resolv.conf`: resolver কে, আর কীভাবে জিজ্ঞেস করব

```text
nameserver 192.0.2.53
nameserver 198.51.100.53
search corp.baytalhikma.org baytalhikma.org
options ndots:1 timeout:2 attempts:2 rotate edns0
```

| লাইন | মানে |
| --- | --- |
| `nameserver` | কোন recursive resolver-কে জিজ্ঞেস করবে। glibc সর্বোচ্চ তিনটা পড়ে, ক্রম ধরে চেষ্টা করে |
| `search` | ছোট নামের পেছনে একে একে জুড়ে চেষ্টা করার ডোমেইনের তালিকা |
| `ndots:n` | নামে n-এর কম ডট থাকলে আগে search তালিকা ধরে চেষ্টা, তারপর নামটা যেমন আছে তেমন। ডিফল্ট ১ |
| `timeout:n` | প্রতিটা সার্ভারের জন্য কত সেকেন্ড অপেক্ষা |
| `attempts:n` | পুরো তালিকা কতবার ঘুরবে |
| `rotate` | প্রতিবার প্রথম সার্ভার থেকে শুরু না করে ঘুরিয়ে ঘুরিয়ে |
| `edns0` | EDNS চালু (চ্যাপ্টার ১১) |

<Callout type="warning">

**প্রথম nameserver মরে গেলে প্রতিটা লুকআপে টাইমআউট যোগ হয়।** glibc প্রতিটা কোয়েরিতে আবার প্রথম সার্ভার দিয়ে শুরু করে (`rotate` না থাকলে), `timeout` পর্যন্ত অপেক্ষা করে, তারপর দ্বিতীয়টায় যায়। ফলে কিছুই "ডাউন" দেখায় না, শুধু সবকিছু প্রতি কলে দুই-পাঁচ সেকেন্ড ধীর। প্রথম nameserver-কে সরাসরি `dig @192.0.2.53` দিয়ে টেস্ট করুন।

</Callout>

আধুনিক ডিস্ট্রোতে এই ফাইল প্রায়ই হাতে লেখা নয়, NetworkManager, systemd-resolved, DHCP ক্লায়েন্ট বা cloud-init তৈরি করে। হাতে বদলালে রিবুট বা নেটওয়ার্ক রিকানেক্টে মুছে যাবে। কে লিখছে দেখুন:

```bash
ls -l /etc/resolv.conf
```

```text
lrwxrwxrwx 1 root root 39 Oct 23 09:12 /etc/resolv.conf -> ../run/systemd/resolve/stub-resolv.conf
```

## systemd-resolved

অনেক আধুনিক Linux ডিস্ট্রোতে (Ubuntu, Fedora ইত্যাদি) `/etc/resolv.conf` শুধু একটা লাইন রাখে: `nameserver 127.0.0.53`। ওই ঠিকানায় শোনে systemd-resolved, একটা লোকাল stub resolver আর ক্যাশ। আসল upstream resolver কারা, সেটা দেখতে `resolv.conf` পড়ে লাভ নেই, দেখতে হবে:

```bash
resolvectl status
```

```text
Global
       Protocols: +LLMNR +mDNS -DNSOverTLS DNSSEC=no/unsupported
resolv.conf mode: stub

Link 2 (eth0)
    Current Scopes: DNS
         Protocols: +DefaultRoute
Current DNS Server: 192.0.2.53
       DNS Servers: 192.0.2.53 198.51.100.53

Link 5 (wg0)
    Current Scopes: DNS
         Protocols: -DefaultRoute
       DNS Servers: 10.8.0.1
        DNS Domain: ~corp.baytalhikma.org
```

শেষ ব্লকটা **split DNS**: `corp.baytalhikma.org`-এর নিচের নাম যাবে VPN-এর ভেতরের `10.8.0.1`-এ, বাকি সব eth0-এর সার্ভারে। `~` চিহ্ন মানে এটা শুধু রাউটিং ডোমেইন, search ডোমেইন নয়।

কাজের কমান্ডগুলো:

```bash
resolvectl query api.baytalhikma.org     # resolved-এর ভেতর দিয়ে লুকআপ, কোন link দিয়ে গেল তা-ও দেখায়
resolvectl statistics                    # ক্যাশ hit/miss
resolvectl flush-caches                  # ক্যাশ খালি
resolvectl log-level debug               # প্রতিটা কোয়েরির বিস্তারিত journalctl-এ
journalctl -u systemd-resolved -f
```

```text
api.baytalhikma.org: 203.0.113.20                 -- link: eth0

-- Information acquired via protocol DNS in 1.2ms.
-- Data is authenticated: no; Data was acquired via local or encrypted transport: no
-- Data from: cache
```

`Data from: cache` লাইনটা বলে দেয় উত্তরটা এইমাত্র নেটওয়ার্ক থেকে এল নাকি পুরনো ক্যাশ থেকে।

## macOS

macOS-এ `/etc/resolv.conf` থাকে, কিন্তু সিস্টেম সেটা ব্যবহার করে না; সেটা শুধু পুরনো টুলের জন্য। আসল কনফিগ দেখুন:

```bash
scutil --dns
```

```text
resolver #1
  nameserver[0] : 192.0.2.53
  if_index : 6 (en0)
  flags    : Request A records, Request AAAA records
  reach    : 0x00020002 (Reachable,Directly Reachable Address)

resolver #8
  domain   : corp.baytalhikma.org
  nameserver[0] : 10.8.0.1
  flags    : Supplemental, Request A records
```

ডোমেইন ধরে আলাদা resolver চাইলে `/etc/resolver/` ফোল্ডারে ডোমেইনের নামে একটা ফাইল রাখলেই হয়, যেমন `/etc/resolver/corp.baytalhikma.org` ফাইলে `nameserver 10.8.0.1`। অনেক VPN ক্লায়েন্ট আর লোকাল ডেভ টুল এটাই করে।

OS-এর রাস্তায় লুকআপ দেখতে আর ক্যাশ খালি করতে:

```bash
dscacheutil -q host -a name api.baytalhikma.org
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

<Callout type="info">

ফ্লাশ কমান্ডটা Apple নিজে পরিষ্কারভাবে ডকুমেন্ট করে না, আর macOS-এর ভার্সন ভেদে বদলেছে। ২০২৬ সালের অক্টোবর অনুযায়ী সাম্প্রতিক ভার্সনগুলোর জন্য প্রচলিত কমান্ড ওপরেরটা; নতুন ভার্সনে কাজ না করলে আপনার ভার্সনের জন্য খুঁজে দেখুন।

</Callout>

## Windows

```powershell
ipconfig /all              # প্রতিটা অ্যাডাপ্টারের DNS সার্ভার
ipconfig /displaydns       # DNS Client সার্ভিসের ক্যাশ
ipconfig /flushdns
Resolve-DnsName api.baytalhikma.org          # OS-এর রাস্তা দিয়ে লুকআপ
Resolve-DnsName api.baytalhikma.org -Server 192.0.2.53 -DnsOnly
Get-DnsClientNrptPolicy    # ডোমেইন ধরে কোন সার্ভারে যাবে (split DNS)
```

Windows-এ split DNS-এর নিয়ম থাকে **NRPT (Name Resolution Policy Table)**-এ, যা সাধারণত VPN বা গ্রুপ পলিসি বসায়। একাধিক অ্যাডাপ্টারে আলাদা DNS সার্ভার থাকলে Windows কোনটাকে আগে জিজ্ঞেস করবে তা অ্যাডাপ্টারের ক্রম আর মেট্রিকের উপর নির্ভর করে, যা "VPN চালু করলে ইন্টারনেটের কিছু সাইট খোলে না" ধরনের সমস্যার মূল।

## ব্রাউজার: নিজের ক্যাশ, কখনো নিজের resolver

ব্রাউজার OS-এর উপরে আরেকটা ক্যাশ রাখে। Chrome-এ (আর Chromium-ভিত্তিক ব্রাউজারে) দেখতে আর খালি করতে: `chrome://net-internals/#dns`, সেখানে "Clear host cache"। খোলা কানেকশন আগের IP-তেই থাকে, তাই `chrome://net-internals/#sockets`-এ গিয়ে socket pool ফ্লাশ করাও দরকার হতে পারে।

তার চেয়েও বড় ব্যাপার, ব্রাউজার নিজেই **DNS over HTTPS (DoH)** চালু করে OS-কে পুরো এড়িয়ে যেতে পারে। তখন `/etc/hosts` বা অফিসের ভেতরের DNS সার্ভার ব্রাউজারের জন্য অদৃশ্য হয়ে যেতে পারে, যদিও ব্রাউজারগুলো সাধারণত এন্টারপ্রাইজ পলিসি বা লোকাল কনফিগ দেখলে পিছিয়ে আসে। Chrome-এ এটা Settings → Privacy and security → Security → "Use secure DNS", Firefox-এ Settings → Privacy & Security → DNS over HTTPS। ব্রাউজারে একরকম আর curl-এ আরেকরকম উত্তর এলে এই সেটিংটা আগে দেখুন। ঠিক কখন কোন ব্রাউজার ডিফল্টে DoH চালায় তা সময়ের সাথে বদলায়, নিজের ব্রাউজারের বর্তমান সেটিং দেখে নিন।

## IPv4, IPv6 আর Happy Eyeballs

একটা নামের A আর AAAA দুটোই থাকলে `getaddrinfo` দুটোই দেয়, আর একটা ক্রমে সাজায় (RFC 6724-এর নিয়মে, Linux-এ `/etc/gai.conf` দিয়ে বদলানো যায়)। ভালো ক্লায়েন্টরা **Happy Eyeballs** (RFC 8305) চালায়: IPv6 আর IPv4 প্রায় একসাথে চেষ্টা করে, যেটা আগে কানেক্ট হয় সেটা নেয়। খারাপ ক্লায়েন্ট আগে IPv6 চেষ্টা করে, তারপর পুরো TCP টাইমআউট শেষে IPv4-এ যায়।

ফলাফল: আপনার সার্ভারে AAAA রেকর্ড আছে কিন্তু IPv6-এ আসলে কিছু শোনে না (বা ফায়ারওয়াল আটকায়), তাহলে কিছু ক্লায়েন্টের জন্য সাইট প্রতি রিকোয়েস্টে কয়েক সেকেন্ড ধীর বা পুরো ভাঙা। টেস্ট:

```bash
curl -4 -sS -o /dev/null -w '%{time_connect}\n' https://baytalhikma.org
curl -6 -sS -o /dev/null -w '%{time_connect}\n' https://baytalhikma.org
```

দ্বিতীয়টা ফেইল বা টাইমআউট করলে হয় IPv6 ঠিক করুন, নয়তো AAAA রেকর্ডটা সরান। ভুল AAAA রাখার চেয়ে AAAA না রাখা ভালো।

## রানটাইমের ভেতরের ক্যাশ আর resolver

কিছু ল্যাঙ্গুয়েজ রানটাইম OS-এর উপরে নিজের নিয়ম চাপায়, আর DNS বদলের পর "সব জায়গায় নতুন IP, শুধু আমার সার্ভিস পুরনোতে কানেক্ট করছে" এর কারণ প্রায়ই এখানে।

**JVM (Java, Kotlin, Scala).** `InetAddress` নিজে লুকআপের ফল ক্যাশ করে, রেকর্ডের TTL দেখে না। নিয়ন্ত্রণ করে security property `networkaddress.cache.ttl` (সফল লুকআপ) আর `networkaddress.cache.negative.ttl` (ব্যর্থ লুকআপ, ডিফল্ট ১০ সেকেন্ড)। সিকিউরিটি ম্যানেজার ছাড়া JDK-র বাস্তব ডিফল্ট ৩০ সেকেন্ড, কিন্তু ডকুমেন্টেশন এটাকে "implementation specific" বলে। এগুলো system property নয়, `java.security` ফাইলের property, অথবা কোডে `Security.setProperty` দিয়ে বসাতে হয়। আপনার JDK ভার্সনে কী আছে নিশ্চিত হতে ওই ভার্সনের ডক দেখুন।

```java
java.security.Security.setProperty("networkaddress.cache.ttl", "30");
```

**Node.js.** দুই রকম API, আর পার্থক্যটা গুরুত্বপূর্ণ (Node-এর বর্তমান ডকুমেন্টেশন অনুযায়ী):

- `dns.lookup()` (আর তাই `http.get`, `fetch`, প্রায় সব লাইব্রেরি): OS-এর `getaddrinfo` ডাকে, `/etc/hosts` আর nsswitch মানে, কিন্তু চলে libuv-এর threadpool-এ। সেই pool ছোট (ডিফল্ট ৪টা থ্রেড, `UV_THREADPOOL_SIZE` দিয়ে বাড়ানো যায়) আর ফাইল সিস্টেম, crypto-র সাথে শেয়ার করা। ধীর DNS মানে pool আটকে থাকা, আর তখন অসম্পর্কিত `fs.readFile`-ও ধীর।
- `dns.resolve*()`: সরাসরি নেটওয়ার্কে DNS কোয়েরি, threadpool ব্যবহার করে না, কিন্তু `/etc/hosts` দেখে না।
- Node 17 থেকে `dns.lookup()` ঠিকানাগুলো OS যে ক্রমে দেয় সে ক্রমেই ফেরত দেয় (`verbatim`), আগের মতো IPv4 আগে সাজায় না। ফলে Node 17-এর পরে অনেকে `localhost`-এ কানেক্ট করতে গিয়ে `::1`-এ যান আর সার্ভিস শুধু `127.0.0.1`-এ শুনছে বলে `ECONNREFUSED` পান। সমাধান: সার্ভিসকে দুই ঠিকানাতেই শোনান, অথবা `127.0.0.1` সরাসরি লিখুন, অথবা `dns.setDefaultResultOrder('ipv4first')`।

**Go.** Unix-এ Go-র দুটো resolver আছে: pure Go resolver, যা নিজে `/etc/resolv.conf` আর `/etc/hosts` পড়ে সরাসরি কোয়েরি পাঠায়, আর cgo resolver, যা C লাইব্রেরির `getaddrinfo` ডাকে। ডিফল্টে pure Go বেছে নেয়, কিন্তু কিছু পরিস্থিতিতে (যেমন এমন কনফিগ যা pure Go বোঝে না) cgo-তে চলে যায়। কোনটা বেছে নিল আর কেন, দেখতে আর জোর করে বদলাতে:

```bash
GODEBUG=netdns=1 ./server      # কোন resolver বেছে নিল তা লগ করে
GODEBUG=netdns=go ./server     # pure Go বাধ্যতামূলক
GODEBUG=netdns=cgo ./server    # C লাইব্রেরি বাধ্যতামূলক
```

এটা গুরুত্বপূর্ণ কারণ দুই resolver nsswitch-এর জটিল নিয়ম বা `.local` নাম একইভাবে সামলায় না। Go নিজে কোনো DNS ক্যাশ রাখে না।

## Docker

ডিফল্ট `bridge` নেটওয়ার্কে কন্টেইনার হোস্টের `resolv.conf`-এর কপি পায় (হোস্টের `127.0.0.53` থাকলে সেটা কন্টেইনারের ভেতর থেকে পৌঁছানো যায় না, তাই Docker সেটা বাদ দিয়ে ব্যাকআপ পাবলিক resolver বসায়)। ইউজার-ডিফাইনড নেটওয়ার্কে (Compose এটাই বানায়) কন্টেইনারের ভেতরে থাকে Docker-এর embedded DNS সার্ভার:

```bash
docker compose exec api cat /etc/resolv.conf
```

```text
nameserver 127.0.0.11
options ndots:0
```

`127.0.0.11` সার্ভিসের নাম (`db`, `redis`) কন্টেইনারের IP-তে resolve করে, বাকি সব হোস্টের resolver-এ পাঠায়। কন্টেইনারে বাইরের নাম resolve না হলে আগে দেখুন হোস্টে নিজে হচ্ছে কিনা, তারপর `docker run --rm busybox nslookup baytalhikma.org` দিয়ে কন্টেইনারের ভেতর থেকে।

## Kubernetes আর ndots:5 ফাঁদ

Kubernetes ডকুমেন্টেশন অনুযায়ী একটা পডের `/etc/resolv.conf` দেখতে এমন:

```text
nameserver 10.96.0.10
search payments.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

`nameserver` হলো CoreDNS-এর ClusterIP। `search` তালিকা আছে বলেই পডের ভেতর থেকে শুধু `ledger` লিখলে সেটা `ledger.payments.svc.cluster.local` হয়ে যায়। সমস্যা `ndots:5`-এ: **পাঁচটার কম ডট আছে এমন যেকোনো নাম আগে search তালিকার প্রতিটা ডোমেইন জুড়ে চেষ্টা হয়।** `api.stripe.com`-এ ডট দুটো, তাই পড আসলে এই ক্রমে জিজ্ঞেস করে:

```text
api.stripe.com.payments.svc.cluster.local.   A, AAAA  -> NXDOMAIN
api.stripe.com.svc.cluster.local.            A, AAAA  -> NXDOMAIN
api.stripe.com.cluster.local.                A, AAAA  -> NXDOMAIN
api.stripe.com.                              A, AAAA  -> answer
```

একটা বাইরের API কলের জন্য আটটা কোয়েরি, যার ছয়টা নিশ্চিত ব্যর্থ। লোড বেশি হলে CoreDNS চাপে পড়ে, লেটেন্সি বাড়ে, আর conntrack টেবিল ভরে UDP প্যাকেট ড্রপ হয় (ফলে মাঝে মাঝে পাঁচ সেকেন্ডের টাইমআউট)। CoreDNS-এর লগ বা মেট্রিকে NXDOMAIN-এর অনুপাত বিশাল দেখলে এটাই কারণ।

তিনটা সমাধান, সহজ থেকে কঠিন:

1. **কোডে বাইরের নামের শেষে ডট দিন**: `api.stripe.com.`। শেষে ডট থাকলে নামটা পুরো (FQDN), search তালিকা ছোঁয়াই হয় না। কিছু HTTP লাইব্রেরি বা TLS SNI-তে শেষের ডট অদ্ভুত আচরণ করতে পারে, টেস্ট করে নিন।
2. **পডে `ndots` কমান** `dnsConfig` দিয়ে:

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"
```

এরপর `api.stripe.com` (দুই ডট) সরাসরি যায়, আর `ledger` বা `ledger.payments` এখনো search তালিকা দিয়ে কাজ করে।

3. **NodeLocal DNSCache** চালান: প্রতিটা নোডে একটা লোকাল DNS ক্যাশ, একটা link-local ঠিকানায় (Kubernetes ডক `169.254.0.0/16` রেঞ্জ সুপারিশ করে)। পড CoreDNS-এর ClusterIP-তে না গিয়ে নোডের ক্যাশে যায়, ফলে DNAT আর conntrack এড়ানো যায়, আর ক্যাশ upstream-এ TCP ব্যবহার করতে পারে। conntrack race-এর কারণে মাঝে মাঝে আসা টাইমআউট এতে অনেকটা কমে।

পডের ভেতর থেকে ডিবাগ করতে একটা ডিবাগ পড চালান:

```bash
kubectl run dnsdebug --rm -it --image=busybox:1.36 --restart=Never -- sh
# inside the pod
cat /etc/resolv.conf
nslookup ledger.payments.svc.cluster.local
nslookup api.stripe.com.
```

আর CoreDNS নিজে ঠিক আছে কিনা:

```bash
kubectl -n kube-system get pods -l k8s-app=kube-dns
kubectl -n kube-system logs -l k8s-app=kube-dns --tail=50
```

## VPN আর split DNS

কর্পোরেট VPN সাধারণত দুইভাবে DNS বসায়। **Full tunnel** হলে সব কোয়েরি VPN-এর ভেতরের resolver-এ যায়; তখন অফিসের নাম কাজ করে, কিন্তু VPN-এর resolver ধীর হলে সব ধীর। **Split DNS** হলে শুধু নির্দিষ্ট ডোমেইন (যেমন `corp.baytalhikma.org`) ভেতরে যায়, বাকি সব আপনার সাধারণ resolver-এ। ভাঙে যখন: VPN কেটে যাওয়ার পরও OS পুরনো রাউটিং ডোমেইন ধরে রাখে, অথবা VPN ক্লায়েন্ট ভুল ডোমেইন তালিকা পাঠায়। দেখার জায়গা: Linux-এ `resolvectl status`, macOS-এ `scutil --dns`, Windows-এ `Get-DnsClientNrptPolicy`।

## ডিবাগিং: এই চ্যাপ্টারের সমস্যাগুলো

| লক্ষণ | নিশ্চিত হবেন যেভাবে | সমাধান |
| --- | --- | --- |
| `dig` সঠিক IP দেয়, অ্যাপ বা ব্রাউজার পুরনো IP-তে যায় | Linux: `getent ahosts নাম`; macOS: `dscacheutil -q host -a name নাম`; Windows: `Resolve-DnsName নাম` | `/etc/hosts` দেখুন; OS ক্যাশ ফ্লাশ; ব্রাউজারের host cache আর socket pool ফ্লাশ |
| শুধু একটা মেশিনে একটা নাম ভুল জায়গায় যায় | `grep নাম /etc/hosts` | ভুলে যাওয়া hosts এন্ট্রি মুছুন |
| প্রতিটা লুকআপ দুই-পাঁচ সেকেন্ড ধীর, কিন্তু কাজ করে | `dig @প্রথম-nameserver` টাইমআউট দেয়; `time getent hosts নাম` | মৃত nameserver সরান; যে টুল `resolv.conf` লেখে সেখানে বদলান, ফাইলে হাতে নয় |
| `resolv.conf` বদলালাম, রিবুটের পর আগের অবস্থায় ফিরে গেছে | `ls -l /etc/resolv.conf` (symlink?) | NetworkManager, netplan, systemd-resolved বা DHCP-র কনফিগে বদলান |
| VPN-এ অফিসের নাম resolve হয় না, বা VPN-এর পর ইন্টারনেটের নাম হয় না | `resolvectl status` / `scutil --dns` / `Get-DnsClientNrptPolicy` | split DNS ডোমেইন তালিকা ঠিক করুন; VPN ক্লায়েন্ট রিস্টার্ট; OS ক্যাশ ফ্লাশ |
| ব্রাউজারে সাইট এক IP-তে যায়, curl আরেক IP-তে | ব্রাউজারের "secure DNS" সেটিং চালু কিনা | ভেতরের নামের জন্য ব্রাউজারের DoH বন্ধ বা এন্টারপ্রাইজ পলিসি দিয়ে নিয়ন্ত্রণ |
| কিছু ইউজারের জন্য সাইট খুব ধীর, অন্যদের জন্য ঠিক | `curl -6` ফেইল করে, `curl -4` ঠিক | সার্ভারে IPv6 ঠিক করুন, নয়তো AAAA রেকর্ড সরান |
| Java সার্ভিস DNS বদলের অনেক পরেও পুরনো IP-তে কানেক্ট করছে | JVM-এর `networkaddress.cache.ttl` মান; কানেকশন পুল পুরনো কানেকশন রাখছে কিনা | TTL property বসান; কানেকশন পুলের সর্বোচ্চ লাইফটাইম বসান |
| Node অ্যাপে DNS ধীর হলে ফাইল অপারেশনও ধীর | লোডে `dns.lookup` কল বেশি; threadpool আটকে | `UV_THREADPOOL_SIZE` বাড়ান, বা নিজে ক্যাশ করুন, বা বাল্ক কাজে `dns.resolve*` |
| Node 17+-এ `localhost`-এ `ECONNREFUSED ::1` | সার্ভিস শুধু `127.0.0.1`-এ শুনছে | সার্ভিসকে `::1`-এও শোনান, অথবা `127.0.0.1` লিখুন |
| Go বাইনারি একেক মেশিনে একেকভাবে resolve করে | `GODEBUG=netdns=1` চালিয়ে কোন resolver বেছে নিচ্ছে দেখুন | `netdns=go` বা `netdns=cgo` দিয়ে নির্দিষ্ট করুন |
| কন্টেইনারের ভেতর থেকে বাইরের নাম resolve হয় না | হোস্টে `dig` চলে, কন্টেইনারে `nslookup` চলে না; কন্টেইনারের `resolv.conf` | Docker daemon-এ `dns` সেটিং দিন, বা হোস্টের resolver-কে কন্টেইনার নেটওয়ার্ক থেকে পৌঁছানোর মতো করুন |
| Kubernetes-এ বাইরের API কল মাঝে মাঝে পাঁচ সেকেন্ড আটকে থাকে, CoreDNS-এ NXDOMAIN-এর ঢল | CoreDNS লগে `.svc.cluster.local` জোড়া বাইরের নাম | নামের শেষে ডট, `ndots` কমানো, NodeLocal DNSCache |
| পডের ভেতর থেকে সার্ভিসের নাম resolve হয় না | ডিবাগ পডে `nslookup সার্ভিস.namespace.svc.cluster.local`; CoreDNS পড চলছে কিনা | সার্ভিস আর namespace-এর নাম মেলান; CoreDNS-এর লগ ও ConfigMap দেখুন; NetworkPolicy পোর্ট ৫৩ আটকাচ্ছে কিনা দেখুন |

## মূল শিক্ষা

1. **`dig` সরাসরি resolver-কে জিজ্ঞেস করে; অ্যাপ OS-এর `getaddrinfo` দিয়ে যায়।** দুটো আলাদা উত্তর দিলে সমস্যা লোকাল কনফিগে, আর Linux-এ `getent ahosts` অ্যাপের রাস্তাটা দেখায়।
2. **`/etc/hosts` সবার আগে দেখা হয় আর TTL মানে না।** ভুলে যাওয়া hosts এন্ট্রি এক-মেশিনের রহস্যের সবচেয়ে কমন কারণ।
3. **`nsswitch.conf` ক্রম ঠিক করে, `resolv.conf` resolver আর search নিয়ম ঠিক করে**, আর আধুনিক সিস্টেমে `resolv.conf` প্রায়ই অন্য কেউ লেখে।
4. **systemd-resolved, mDNSResponder আর Windows DNS Client নিজেরা ক্যাশ রাখে** এবং split DNS চালায়; প্রতিটার নিজস্ব দেখার আর ফ্লাশের কমান্ড আছে।
5. **ব্রাউজার আরেকটা ক্যাশ রাখে আর DoH চালু থাকলে OS-কে পুরো এড়িয়ে যেতে পারে।**
6. **ভুল AAAA রেকর্ড কিছু ক্লায়েন্টের জন্য সাইট ধীর বা ভাঙা করে দেয়।** IPv6 চালু না থাকলে AAAA রাখবেন না।
7. **রানটাইমের নিজের নিয়ম আছে**: JVM-এর নিজস্ব ক্যাশ TTL, Node-এর `dns.lookup` threadpool, Go-র দুই resolver। DNS বদল "সব জায়গায় হলো, শুধু এখানে না" হলে এখানে খুঁজুন।
8. **Kubernetes-এর `ndots:5` প্রতিটা বাইরের নামকে কয়েক গুণ কোয়েরিতে পরিণত করে।** শেষে ডট, কম `ndots`, বা NodeLocal DNSCache দিয়ে ঠিক করুন।
