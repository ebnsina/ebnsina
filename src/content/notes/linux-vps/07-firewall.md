---
title: 'Firewall Fundamentals'
subtitle: 'প্যাকেট আসলে কীভাবে কার্নেলের ভেতর দিয়ে যায়, আর কীভাবে nftables রুল লিখতে হয় যেন ঠিক যা চান তা-ই allow হয় আর বাকি সব reject হয়।'
chapter: 7
level: 'intermediate'
readingTime: '13 মিনিট'
topics: ['firewall', 'nftables', 'iptables', 'ufw', 'netfilter', 'linux']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ফায়ারওয়াল অনেকটা বিল্ডিংয়ের গেটে থাকা সিকিউরিটি গার্ডের মতো, যে দরজা খোলার আগে একটা লিস্ট দেখে নেয় কাকে ভেতরে ঢুকতে দেওয়া হবে — বাকি সবাইকে লবিতে পৌঁছানোর আগেই ফিরিয়ে দেওয়া হয়।

</Callout>

## গল্পে বুঝি

সিনার কম্পাউন্ডের একমাত্র ফটকে বসে থাকে কড়া মেজাজের এক গেট গার্ড — খোয়ারিজমি। তার নীতি একেবারে সোজা: কে এসেছে, কার কাছে যাবে, সেসব যাচাই করার আগে ধরে নাও কাউকেই ঢুকতে দেওয়া হবে না। কেউ ফটকে টোকা দিলেই প্রথম উত্তর "না"। তারপর সে হাতের ছোট্ট একটা তালিকা দেখে — কেবল সেই তালিকায় নাম থাকা লোকজন, আর কেবল নির্দিষ্ট যে দরজার জন্য তারা ছাড়পত্র পেয়েছে, সেই দরজা দিয়েই ভেতরে যেতে পারে।

তালিকাটা ছোট আর নির্দিষ্ট। কেয়ারটেকারের গেট ২২ দিয়ে ঢোকে রক্ষণাবেক্ষণের লোক, সামনের অফিসের গেট ৮০ দিয়ে সাধারণ দর্শনার্থী, আর সিকিউর-অফিসের গেট ৪৪৩ দিয়ে যায় গোপন কাজের লোক — এই তিনটাই খোলা। এর বাইরে কেউ যদি অন্য কোনো দরজায় গিয়ে টোকা দেয়, খোয়ারিজমি দ্বিতীয়বার না ভেবেই তাকে ফিরিয়ে দেয়। ফাতিমা একবার পাশের একটা বন্ধ দরজায় ঢুকতে চেষ্টা করেছিলেন — তালিকায় সেটা ছিল না বলে গার্ড সরাসরি "না" বলে দেয়, কোনো আলোচনা নেই।

এই গল্পটাই আসলে একটা **firewall**। গেট গার্ড হলো firewall নিজে; "আগে সবাইকে ফিরিয়ে দাও" মানে **default deny** — সব **inbound** ট্র্যাফিক ডিফল্টে বন্ধ। ছাড়পত্র পাওয়া নির্দিষ্ট দরজার তালিকাটা হলো শুধু দরকারি **port**-গুলো (২২/৮০/৪৪৩) **allow** করা, আর বাকি প্রতিটা দরজায় "না" বলাটাই বাকি সব port block করে দেওয়া। বাস্তবে ঠিক এই কাজটাই আপনি করেন `ufw` (`ufw default deny incoming`, তারপর `ufw allow 22`) দিয়ে, নয়তো নিচু স্তরে `iptables`/nftables রুল লিখে — default-deny একটা বেস, তার ওপর হাতে গোনা কয়েকটা allow রুল।

## Linux-এ ফায়ারওয়াল আসলে কী

Linux-এ আলাদা কোনো "firewall" ডেমন নেই। কার্নেল নিজেই, **netfilter** ফ্রেমওয়ার্কের মাধ্যমে, প্রতিটা প্যাকেটকে কতগুলো ডিসিশন পয়েন্টের ভেতর দিয়ে চালায়, যাদের বলে _hooks_ — `prerouting`, `input`, `forward`, `output`, `postrouting`। প্রতিটা hook-এ কার্নেল একগুচ্ছ রুল দেখে নেয়: accept, drop, mangle, redirect। রুল যা বলে, প্যাকেট তা-ই করে।

এই রুলগুলো আপনি তিনটার যেকোনো একটা টুল দিয়ে কনফিগার করেন:

- **`nftables`** — আধুনিক, যেটা আপনার ব্যবহার করা উচিত। একটাই কমান্ড (`nft`), একটাই কনফিগ ফাইল।
- **`iptables`** — ক্লাসিক, পুরনো প্রায় সব টিউটোরিয়াল এটাই ব্যবহার করে। এখনও কাজ করে, তবে বেশিরভাগ distro-তে এটা এখন nftables-এর উপরে একটা কম্প্যাটিবিলিটি র‍্যাপার মাত্র।
- **`ufw`** — বন্ধুত্বপূর্ণ ফ্রন্ট-এন্ড। iptables/nftables-কে `ufw allow 22`-এর মতো কমান্ডে মুড়ে দেয়। ডেস্কটপ আর দ্রুত সেটআপের জন্য ঠিক আছে; কাস্টম কিছু দরকার হলে ভঙ্গুর।

আমরা সরাসরি **nftables** ব্যবহার করব। একবার ছোট একটা `nft` ruleset পড়তে আর লিখতে পারলে, আপনার আর কখনও ufw লাগবে না।

<Callout type="info">

**একটা বেছে নিয়ে তাতেই থাকবেন কেন?**

একই হোস্টে iptables আর nftables মিশিয়ে ফেললে এমন পরস্পরবিরোধী রুল চেইন তৈরি হতে পারে যা প্রায় অসম্ভব ডিবাগ করা। nftables বেছে নিন। iptables-persistent disable করুন। এগিয়ে যান।

</Callout>

## default-deny দর্শন

সঠিক ফায়ারওয়াল হলো **default-deny**: স্পষ্টভাবে allow না করা যেকোনো প্যাকেট drop হয়ে যায়। উল্টোটা (default-allow) মানে প্রতিটা নতুন সার্ভিস নিজেকে expose করে ফেলে, যতক্ষণ না আপনি সেটাকে block করার কথা মনে রাখেন — আর আপনি মনে রাখবেন না।

সবচেয়ে ন্যূনতম কাজের পলিসি:

1. সব **established** আর **related** কানেকশন allow করুন (যেন outbound রিকোয়েস্টের রিপ্লাই ফিরে আসতে পারে)।
2. সব loopback ট্র্যাফিক allow করুন (`lo` ইন্টারফেস)।
3. নির্দিষ্ট কিছু **inbound** পোর্ট allow করুন: SSH, HTTP, HTTPS।
4. বাকি সব drop করুন।

ব্যস, এটুকুই। পাঁচটা রুল আর আপনার একটা সত্যিকারের ফায়ারওয়াল হয়ে গেল।

## nftables ইনস্টল ও enable করা

Debian/Ubuntu-তে:

```bash
sudo apt update
sudo apt install -y nftables
sudo systemctl enable --now nftables
```

ডিফল্ট কনফিগ থাকে `/etc/nftables.conf`-এ। এটাকে একটা যুক্তিসঙ্গত বেস দিয়ে বদলে ফেলুন।

## আপনার প্রথম ruleset

```nft
#!/usr/sbin/nft -f

flush ruleset

table inet filter {

    chain input {
        type filter hook input priority filter; policy drop;

        # Allow loopback
        iif "lo" accept

        # Allow established and related connections
        ct state { established, related } accept

        # Drop invalid packets
        ct state invalid drop

        # Allow ICMP (ping, MTU discovery)
        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept

        # SSH
        tcp dport 2222 accept

        # HTTP and HTTPS
        tcp dport { 80, 443 } accept

        # Optional rate-limit incoming SSH
        # tcp dport 2222 ct state new limit rate 10/minute accept
    }

    chain forward {
        type filter hook forward priority filter; policy drop;
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }
}
```

`/etc/nftables.conf`-এ সেভ করুন, তারপর:

```bash
sudo nft -f /etc/nftables.conf
sudo nft list ruleset
```

লগ আউট করার **আগে** আপনার ল্যাপটপ থেকে টেস্ট করুন যে SSH এখনও কাজ করছে:

```bash
ssh -p 2222 deploy@web-01
```

যদি ফেল করে, আপনার চলমান সেশনটাই আপনার সেফটি নেট — রুল ঠিক করুন।

## ruleset পড়া, লাইন ধরে ধরে

```nft
table inet filter {
```

`inet` মানে "IPv4 আর IPv6 দুটোই।" `filter` একটা নাম যা আপনি বেছে নেন; মূল প্যাকেট-ডিসিশন টেবিলের জন্য প্রথাগতভাবে `filter` ব্যবহার হয়।

```nft
chain input {
    type filter hook input priority filter; policy drop;
```

`input` hook-এর সাথে বাঁধা একটা chain — এই হোস্টের উদ্দেশ্যে আসা প্যাকেট। `priority filter` হলো স্ট্যান্ডার্ড অর্ডারিং। `policy drop` হলো default-deny।

```nft
iif "lo" accept
```

loopback ইন্টারফেসে আসা যেকোনো কিছু — accept। এটা ছাড়া, আপনার নিজের সার্ভিসগুলো `127.0.0.1`-এর উপর একে অপরের সাথে কথা বলতে পারবে না।

```nft
ct state { established, related } accept
```

Connection tracking। কোনো প্যাকেট যদি ইতিমধ্যে accept হওয়া কোনো কানেকশনের অংশ হয়, তাহলে তার রিপ্লাইও accept করো। এটাই outbound HTTP-কে কাজ করায় — SYN বেরিয়ে যায়, SYN-ACK ফিরে আসে, conntrack মনে রাখে।

```nft
tcp dport 2222 accept
tcp dport { 80, 443 } accept
```

নির্দিষ্ট destination পোর্ট allow করে।

```nft
chain forward {
    type filter hook forward priority filter; policy drop;
}
```

`forward` হলো এই হোস্টের _মধ্য দিয়ে_ রাউট হওয়া প্যাকেটের জন্য (প্রাসঙ্গিক যদি আপনি এই বক্সটাকে রাউটার বানান বা bridge mode ছাড়া কন্টেইনার চালান)। default-deny।

```nft
chain output {
    type filter hook output priority filter; policy accept;
}
```

outbound ডিফল্টভাবে allow — বক্সটা ইন্টারনেটের সাথে কথা বলতে পারে। এটাকে কড়া করুন কেবল তখনই যখন আপনার নির্দিষ্ট কারণ আছে (compliance-এর জন্য egress filtering ইত্যাদি)।

## সাধারণ কিছু পরিবর্তন

**একটা পোর্ট যোগ করা:**

```nft
tcp dport 9100 ip saddr 10.0.0.0/8 accept   # Prometheus scrape, only from VPN
```

**একটা নির্দিষ্ট IP block করা:**

```nft
ip saddr 1.2.3.4 drop
```

**Rate-limit:**

```nft
tcp dport 80 ct state new limit rate 100/second burst 200 packets accept
```

**ping allow করা কিন্তু সীমিত রাখা:**

```nft
ip protocol icmp icmp type echo-request limit rate 5/second accept
```

**Geo-block (অন্যত্র একটা set তৈরি করার পরে):**

```nft
set blocked_countries {
    type ipv4_addr; flags interval;
    elements = { 1.2.3.0/24, 5.6.7.0/24 }
}

# In the chain:
ip saddr @blocked_countries drop
```

## drop হওয়া প্যাকেট লগ করা

ডিবাগ করার সময়:

```nft
chain input {
    type filter hook input priority filter; policy drop;
    # ... rules ...
    log prefix "FW-DROP: " level info limit rate 5/second
}
```

drop-গুলো `journalctl -k`-তে (কার্নেল লগ) দেখা যায়। কাজ শেষ হলে এটা বন্ধ করে দিন — একটা ব্যস্ত সার্ভার প্রতিটা drop হওয়া প্যাকেট লগ করতে গিয়ে নিজের journal ডুবিয়ে ফেলবে।

## reload ছাড়াই লাইভ এডিটিং

`nft` আপনাকে ruleset লাইভ এডিট করতে দেয়। টেস্টিংয়ের জন্য কাজের:

```bash
sudo nft list ruleset                                     # show everything
sudo nft list table inet filter                           # one table
sudo nft list chain inet filter input                     # one chain

sudo nft add rule inet filter input tcp dport 8443 accept
sudo nft delete rule inet filter input handle 12          # by handle
```

handle খুঁজে বের করতে:

```bash
sudo nft -a list ruleset
```

লাইভ এডিট persist হয় না — reboot-এ উবে যায়। একবার নিশ্চিত হলে যে একটা রুল কাজ করছে, সেটা `/etc/nftables.conf`-এ লিখে রাখুন।

## Network-namespace সতর্কতা (কন্টেইনার)

আপনি যদি Docker চালান, সেটা bridge network আর port forward সেটআপ করতে নিজে থেকেই iptables (বা nftables) ঘাঁটাঘাঁটি করে। আপনার হাতে-লেখা রুল আর Docker-এর অটো-জেনারেট করা রুল সংঘর্ষে জড়াতে পারে।

পরিপাটি সমাধান:

- আপনার রুলগুলো `inet filter`-এ রাখুন।
- Docker-কে তার নিজের টেবিল রাখতে দিন (`ip filter` আর `ip nat`, chain `DOCKER-USER` সহ)।
- দুটোর ওপরই কিছু enforce করা দরকার হলে `DOCKER-USER` chain ব্যবহার করুন — Docker এটাকে ছুঁয়ে দেখে না।

Docker ছাড়া কন্টেইনারের জন্য (খালি systemd-nspawn, rootless mode-এ podman), আপনার রুল সরাসরি প্রযোজ্য।

## ক্লাউড প্রোভাইডারের ফায়ারওয়াল পড়া ও বোঝা

অনেক প্রোভাইডার (Hetzner, AWS, DigitalOcean) একটা _cloud firewall_ অফার করে — প্যাকেট ফিল্টারিং যা আপনার VM-এর বাইরে হয়, প্যাকেটটা আপনার কার্নেলে পৌঁছানোর আগেই। এগুলো belt-and-suspenders হিসেবে কাজের, কিন্তু লোকাল রুলের বিকল্প নয়:

- ক্লাউড ফায়ারওয়াল আপনার IP-তে হানা দেওয়া স্ক্যানারের বিরুদ্ধে রক্ষা করে।
- লোকাল ফায়ারওয়াল আপনার অ্যাকাউন্টের অন্য কোনো VPS কম্প্রোমাইজড হলে lateral movement-এর বিরুদ্ধে রক্ষা করে।
- লোকাল ফায়ারওয়াল আপনার উদ্দেশ্যটাও একটা ফাইলে ডকুমেন্ট করে যা আপনি পড়তে, diff করতে আর version-control করতে পারেন।

দুটোই চালান। এমনভাবে কনফিগার করুন যেন তারা একে অপরের সাথে মিলে যায়।

## ufw আসলে কী করে

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp
sudo ufw allow 80,443/tcp
sudo ufw enable
```

এটা রুল তৈরি করে সেগুলো nftables-এ ঠেলে দেয়। দ্রুত সেটআপের জন্য ঠিক আছে। যখন আপনি এমন কিছু প্রকাশ করতে চান যা ufw নেটিভভাবে সাপোর্ট করে না, তখন হতাশাজনক — সেই মুহূর্তে আপনি শেষমেশ `/etc/ufw/before.rules` পড়তে আর হাতে এডিট করতে বসেন। শর্টকাটটা তখন আর নেই।

আপনি যদি যাই হোক raw রুল পড়তেই যাচ্ছেন, তাহলে সরাসরি nftables লিখুন।

## সাধারণ ভুল

- **SSH পোর্ট ভুলে যাওয়া।** SSH-এর জন্য একটা `accept` না দিয়ে `input`-এ `policy drop` যোগ করলে আপনি নিজেই লক আউট হয়ে যান। চলমান সেশন বন্ধ করার আগে সবসময় একটা _নতুন_ টার্মিনাল থেকে টেস্ট করুন।
- **`iif lo accept` ভুলে যাওয়া।** আপনার অর্ধেক সার্ভিস ভেঙে পড়ে কারণ তারা localhost-এর সাথে কথা বলতে পারে না।
- **`ct state established accept` ভুলে যাওয়া।** outbound কাজ করা বন্ধ করে দেয় — আপনার `apt update` ঝুলে থাকে।
- **iptables আর nftables মেশানো।** একটা বেছে নিন। iptables-persistent ইনস্টল করা থাকলে সেটা সরিয়ে ফেলুন।

## রিক্যাপ

- Linux-এ ফায়ারওয়াল হলো netfilter। nftables হলো আধুনিক ইন্টারফেস।
- input-এ default-deny। output-এ default-allow। রাউটিং না করলে forward drop।
- পাঁচটা রুল: loopback, established/related, ICMP, SSH, HTTP/HTTPS।
- লাইভ এডিট সাময়িক। `/etc/nftables.conf`-এর মাধ্যমে persist করুন।
- ক্লাউড ফায়ারওয়াল আর লোকাল ফায়ারওয়াল একে অপরের পরিপূরক; দুটোই চালান।

পরের অধ্যায়: users, groups, আর sudo সমস্যা।
