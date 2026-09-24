---
title: 'Foundations'
subtitle: 'নেটওয়ার্ক কীভাবে কাজ করে, TCP/IP, OSI মডেল, এবং দুর্বলতা খুঁজে বের করার জন্য অ্যাটাকারের মানসিক মডেল।'
chapter: 1
level: 'beginner'
readingTime: '12 মিনিট'
topics: ['TCP/IP', 'OSI model', 'networking', 'ports', 'protocols', 'attacker mindset']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন চোর কীভাবে ঢুকবে সিদ্ধান্ত নেওয়ার আগে বাড়ি কীভাবে বানানো হয়েছে তা খতিয়ে দেখে — দরজার তালা, জানালার ছিটকিনি, অ্যালার্ম সিস্টেম। নেটওয়ার্ক অ্যাটাকাররা একই কারণে protocol নিয়ে পড়াশোনা করে: প্রতিটি protocol-এর কিছু অনুমান (assumption) থাকে, আর সেই অনুমানগুলোর edge case থাকে যা vulnerability-তে পরিণত হয়।

</Callout>

## গল্পে বুঝি

ফাতিমার একটা কাপড়ের দোকান আছে, বছরের পর বছর ধরে জমানো পুঁজি সব এখানেই। রাতে দোকান বন্ধ করে বাসায় ফেরার পর তার একটাই দুশ্চিন্তা — কোথাও কোনো দুর্বল তালা বা আলগা জানালা রয়ে গেল না তো, যেটা দিয়ে চোর সহজে ঢুকে পড়বে? নিজে তো আর তালার কারিগর নন। তাই তিনি শহরের নামকরা লকস্মিথ সিনাকে ডাকলেন, এবং একটা লিখিত চুক্তি করলেন — "তুমি আমার এই দোকানটাতে, বাইরে থেকে একজন চোরের মতো করে ঢোকার চেষ্টা করো, কোন কোন তালা-জানালা দুর্বল খুঁজে বের করো, তারপর আমাকে পুরো একটা লিখিত রিপোর্ট দাও।"

সিনা কাজে নামলেন — কিন্তু শুধু ফাতিমার নিজের দোকানেই, চুক্তিতে যতটুকু লেখা ঠিক ততটুকুর ভেতরেই। পাশের দোকানে হাত দিলেন না, ভেতরের কোনো মালও সরালেন না। কাজ শেষে তিনি একটা তালিকা ধরিয়ে দিলেন: পেছনের দরজার তালাটা এক ধাক্কাতেই খুলে যায়, দোতলার জানালার ছিটকিনি ভাঙা, আর গুদামের চাবি বাইরে থেকে দেখা যায়। ফাতিমা এখন সত্যিকারের চোর আসার আগেই এগুলো ঠিক করিয়ে ফেলতে পারবেন।

এই গল্পটাই আসলে **ethical hacking**। ফাতিমার লিখিত অনুমতি আর "শুধু এই দোকান" বলে দেওয়া সীমানা হলো ঠিক সেই **authorization** আর **scope**, যা ছাড়া কোনো ethical hacker কাজ শুরুই করে না — মালিকের অনুমতি নিয়ে মালিকের নিজের system টেস্ট করা। দুর্বল তালার লিখিত তালিকা হলো **vulnerability**-এর দায়িত্বশীল **disclosure**/রিপোর্ট — অপরাধীর হাতে পড়ার আগেই দুর্বলতা খুঁজে বের করে জানিয়ে দেওয়া। আর ঠিক এই একই কাজটা — একই দরজা দিয়ে ঢোকা — যদি কোনো চোর অনুমতি ছাড়া করত, সেটা হতো নিছক অপরাধ। মানে ধরনটা নয়, বরং **consent** আর ethics-ই হলো ethical hacking আর crime-এর মাঝের একমাত্র রেখা। বাস্তবেও একজন pentester ক্লায়েন্টের সাথে লিখিত চুক্তি (rules of engagement) আর নির্দিষ্ট scope ছাড়া একটা প্যাকেটও পাঠান না — সেই কাগজটুকুই একটা authorized security assessment-কে unauthorized access থেকে আলাদা করে।

## OSI মডেল (অ্যাটাকারের দৃষ্টিভঙ্গি)

অ্যাটাক প্রতিটি লেয়ারেই ঘটে। কোন লেয়ারকে একটি অ্যাটাক টার্গেট করছে তা জানলে বুঝতে পারবেন কোন ডিফেন্স প্রযোজ্য।

```
Layer 7 — Application   → HTTP, DNS, SMTP    → SQLi, XSS, RCE
Layer 6 — Presentation  → TLS, encoding       → SSL stripping, encoding bypasses
Layer 5 — Session       → NetBIOS, RPC        → Session hijacking
Layer 4 — Transport     → TCP, UDP            → Port scanning, SYN floods
Layer 3 — Network       → IP, ICMP            → Routing attacks, IP spoofing
Layer 2 — Data Link     → Ethernet, ARP       → ARP poisoning, MAC spoofing
Layer 1 — Physical      → Cables, WiFi        → Rogue APs, cable tapping
```

**বেশিরভাগ web exploit হয় Layer 7-এ।** বেশিরভাগ internal network অ্যাটাক হয় Layer 2-4-এ।

## TCP/IP গভীরে

### TCP Handshake

```
Client                    Server
  │                          │
  │──── SYN ─────────────────▶│   "I want to connect"
  │◀─── SYN-ACK ─────────────│   "OK, I'm listening"
  │──── ACK ─────────────────▶│   "Great, let's talk"
  │                          │
  │ ← established connection →│
```

**Port scanning এটিকেই কাজে লাগায়।** একটি SYN scan SYN পাঠায়, SYN-ACK-এর জন্য অপেক্ষা করে (port open) অথবা RST (port closed), তারপর কখনোই চূড়ান্ত ACK পাঠায় না — কানেকশন কখনো পুরোপুরি প্রতিষ্ঠিত হয় না, ফলে এটি log করা কঠিন হয়ে যায়।

### TCP Flags

| Flag | অর্থ                   | অ্যাটাকারের ব্যবহার                 |
| ---- | ---------------------- | ----------------------------------- |
| SYN  | কানেকশন শুরু করা       | Port scanning, SYN flood DoS        |
| ACK  | Acknowledge            | ACK scanning (কিছু firewall বাইপাস) |
| FIN  | কানেকশন বন্ধ করা       | FIN scan (সাধারণ filter এড়ানো)     |
| RST  | কানেকশন reset করা      | কানেকশন কেটে দিতে Forged RST        |
| PSH  | তৎক্ষণাৎ data push করা | —                                   |
| URG  | Urgent data            | —                                   |

### IP Addressing-এর মূল বিষয়

```bash
# CIDR notation — know this cold
192.168.1.0/24   → 256 addresses (192.168.1.0 – 192.168.1.255)
10.0.0.0/8       → 16M addresses (entire 10.x.x.x range)
172.16.0.0/12    → 1M addresses

# Private ranges (RFC 1918) — internal networks use these
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16

# Calculate subnet info
ipcalc 192.168.1.0/24
```

## প্রতিটি অ্যাটাকার যে key protocol জানে

### DNS — ফোন বুক

```
Browser → DNS Resolver → Root NS → .com NS → example.com NS → 93.184.216.34
```

**অ্যাটাক সারফেস:**

- DNS zone transfer সব hostname উন্মুক্ত করে দেয় (misconfigured server internal structure ফাঁস করে)
- DNS cache poisoning ইউজারদের অ্যাটাকার-নিয়ন্ত্রিত IP-তে রিডাইরেক্ট করে
- Subdomain enumeration ভুলে যাওয়া/উন্মুক্ত asset খুঁজে বের করে

```bash
# Zone transfer attempt (often fails on hardened servers, still worth trying)
dig axfr @ns1.example.com example.com

# Subdomain brute-force
gobuster dns -d example.com -w /usr/share/wordlists/subdomains-top1million.txt
```

### HTTP — অ্যাটাকারের খেলার মাঠ

```
GET /api/users/1 HTTP/1.1
Host: example.com
Authorization: Bearer eyJhbGc...
Cookie: session=abc123
```

HTTP stateless, কিন্তু অ্যাপ্লিকেশন cookie ও token-এর মাধ্যমে state ধরে রাখে। প্রতিটি header হলো input — আর input manipulate করা যায়।

**অ্যাটাকাররা যেসব header-এ নজর দেয়:**

- `Authorization` — এটি কি forge, replay, বা brute-force করা যায়?
- `Cookie` — session token কি অনুমানযোগ্য? HttpOnly? Secure?
- `X-Forwarded-For` — অ্যাপ কি এটিকে বিশ্বাস করে? আপনি কি আপনার IP spoof করতে পারবেন?
- `Content-Type` — আপনি XML পাঠালে server কি সেটি process করে? (XXE)
- `Referer` — CSRF protection কি শুধু এই header-এর ওপর নির্ভর করে?

### SMB — Windows ফাইল শেয়ারিং

SMB (Server Message Block) হলো Windows পরিবেশে ঐতিহাসিকভাবে সবচেয়ে বেশি exploit হওয়া protocol। EternalBlue (MS17-010) এটি ব্যবহার করে লক্ষ লক্ষ মেশিনে WannaCry ছড়িয়ে দিয়েছিল।

```bash
# Enumerate SMB shares
smbclient -L //192.168.1.100 -N        # null session
enum4linux -a 192.168.1.100             # full enumeration
nmap --script smb-enum-shares 192.168.1.100
```

## অ্যাটাকারের মানসিক মডেল

### Trust Boundaries

প্রতিটি সিস্টেমে এমন কম্পোনেন্ট থাকে যারা বাইরের দুনিয়ার চেয়ে একে অন্যকে বেশি বিশ্বাস করে। অ্যাটাকাররা সেই boundary পার হওয়ার উপায় খোঁজে:

```
Internet
    │
    ▼
[Load Balancer]  ─── trusts nothing
    │
    ▼
[Web App]  ─── trusts LB requests
    │
    ▼
[Database]  ─── trusts web app completely  ← SQLi crosses this boundary
    │
    ▼
[Internal APIs]  ─── trusts database host  ← SSRF crosses this boundary
```

### Attack Surface

Attack surface হলো এমন সবকিছু যা input গ্রহণ করতে পারে:

- প্রতিটি HTTP endpoint
- প্রতিটি CLI argument
- প্রতিটি ফাইল যা parse হয়
- প্রতিটি environment variable
- প্রতিটি খোলা network port
- প্রতিটি third-party library

**Attack surface কমানো সবচেয়ে কার্যকর একক ডিফেন্সিভ পদক্ষেপ।** যা নেই তা আপনি exploit করতে পারবেন না।

### CIA Triad

প্রতিটি security control এদের এক বা একাধিককে রক্ষা করে:

```
Confidentiality — data is only readable by authorized parties
                  Attack: data exfiltration, credential theft
Integrity       — data is only modifiable by authorized parties
                  Attack: tampering, SQL injection
Availability    — system is accessible when needed
                  Attack: DoS/DDoS, ransomware
```

আপনার রিপোর্টে প্রতিটি finding-কে এভাবে ফ্রেম করুন যে এটি কোন CIA প্রোপার্টি লঙ্ঘন করছে।

## প্র্যাকটিক্যাল: আপনার Network Map বানান

```bash
# Find your own subnet
ip addr show  # Linux
ipconfig      # Windows

# Discover live hosts on your lab network
nmap -sn 192.168.1.0/24

# Quick port scan of a host
nmap -F 192.168.1.100   # fast: top 100 ports

# Full port scan
nmap -p- 192.168.1.100  # all 65535 ports (slow)

# Trace the route to a target
traceroute google.com   # Linux
tracert google.com      # Windows
```

## সাধারণ Port রেফারেন্স

```
21   FTP      — file transfer, often misconfigured with anonymous login
22   SSH      — secure shell, brute-force target if weak passwords
23   Telnet   — cleartext, should never be exposed
25   SMTP     — email, open relay misconfiguration
53   DNS      — zone transfer, DNS tunneling
80   HTTP     — web, redirect to HTTPS
443  HTTPS    — web (TLS), still check for misconfigs
445  SMB      — file sharing, historically dangerous
3306 MySQL    — database, should never be internet-exposed
3389 RDP      — Windows remote desktop, brute-force target
5432 PostgreSQL — database, should never be internet-exposed
6379 Redis    — cache, unauthenticated access common misconfiguration
8080 HTTP-alt — dev servers, often exposed accidentally
9200 Elasticsearch — often unauthenticated, data exposure risk
```

কোনো public IP-তে port 6379 খোলা দেখা প্রায় সবসময়ই একটি critical finding — Redis-এ ডিফল্টভাবে কোনো authentication নেই এবং এটি ব্যবহার করে server-এ যেকোনো ফাইল (SSH key, cron job) লেখা যায়।
