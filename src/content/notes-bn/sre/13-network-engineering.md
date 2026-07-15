---
title: 'Network Engineering for SREs'
subtitle: "BGP, anycast, ECMP, CDN internals, packet capture, আর scale-এ TCP। যে networking layer-এ 'random' production অদ্ভুততা আসলে বাস করে।"
chapter: 13
level: 'mastery'
readingTime: '30 মিনিট'
topics: ['networking', 'BGP', 'anycast', 'CDN', 'TCP', 'tcpdump', 'XDP', 'load balancing']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জগতের উদাহরণ**

একটা building-এর plumbing — কাজ করলে অদৃশ্য, না করলে সর্বনাশা, আর diagnose করতে একজন specialist লাগে।

</Callout>

## গল্পে বুঝি

মারিয়াম আল-আসতুরলাবি একটা দেশের ডাক-নেটওয়ার্কের ইঞ্জিনিয়ার — তার কাজ পুরো দেশের sorting hub-গুলোর মধ্যে চিঠি দ্রুত চলাচল করানো। একদিন কর্ডোবার লোকেরা অভিযোগ করল, তাদের চিঠি পৌঁছাতে আগের চেয়ে অনেক দেরি হচ্ছে, আর মাঝেমধ্যে কিছু চিঠি একেবারে হারিয়েও যাচ্ছে। মারিয়াম প্রথমে প্রতিটা hub-থেকে-hub চিঠি পৌঁছাতে কত সময় লাগছে তা মাপল, আর দেখল দেরিটা কোনো একটা নির্দিষ্ট hub-এর কাছে গিয়ে জমছে — বাকি hub-গুলো ঠিকঠাক। তারপর সে একটা hub-এ পাঠানো ১০০টা চিঠির মধ্যে কতগুলো ওপারে পৌঁছাচ্ছে সেটা গুনল, আর ধরা পড়ল সেই সন্দেহভাজন hub চুপচাপ প্রতি শতে তিন-চারটা চিঠি ফেলে দিচ্ছে।

খুঁজতে খুঁজতে মারিয়াম দুটো জিনিস পেল। এক, বুখারার একটা hub-এ কেউ ভুল করে একটা forwarding rule বসিয়ে রেখেছিল, যার ফলে সমরকন্দের চিঠি সোজা পথ ছেড়ে ঘুরপথে অনেক দূর দিয়ে যাচ্ছিল — তাই দেরি। দুই, প্রতিটা town-এর নাম যে কোড-এ বদলায় (যেমন "কর্ডোবা" → hub-৭), সেই কেন্দ্রীয় address DIRECTORY-তে একটা এন্ট্রি পুরোনো হয়ে গিয়েছিল, তাই কিছু চিঠি ভুল hub-এ চলে যাচ্ছিল। প্রতিটা চিঠির গায়ে tracking sticker লাগিয়ে সে পুরো পথটা ধাপে ধাপে দেখল, আর তখন গোটা সিস্টেমকে দোষ না দিয়ে ঠিক সেই একটা সমস্যাগ্রস্ত hub-কে আঙুল দিয়ে দেখাতে পারল।

এটাই এই chapter-এর পুরো ছবি। hub-থেকে-hub চিঠি পৌঁছানোর সময় হলো network **latency**; যে hub চুপচাপ চিঠি ফেলে দেয় সেটা **packet loss**; ভুল forwarding rule-এ চিঠি ঘুরপথে যাওয়া হলো একটা **routing** problem; town-নাম-থেকে-hub-কোড directory হলো **DNS**; আর চিঠির পথ ধরে ধরে খারাপ hub খুঁজে বের করা হলো packet-level tracing — বাস্তবে `traceroute`/`mtr` আর `tcpdump`। আসল কাজেও ঠিক এভাবেই একজন SRE ঢালাওভাবে "সিস্টেম slow" না বলে, hop-by-hop মেপে ঠিক কোন transit ISP বা কোন hop-এ delay বা loss হচ্ছে সেটা বের করে — তখন সমাধানটাও পুরো সিস্টেম না ঘেঁটে সেই নির্দিষ্ট জায়গাতেই হয়।

## SRE-দের কেন আসল networking লাগে

একজন frontend engineer BGP কী তা না জেনেই একটা feature ship করতে পারে। একজন senior SRE একটা regional latency spike, একটা DNS-সম্পর্কিত outage, বা একটা CDN-edge failover এটা ছাড়া debug করতে পারে না। Network এমনভাবে fail করে যা application bug-এর মতো দেখায় — connection reset, আংশিক 502, "API slow কিন্তু শুধু একটা office থেকে"। এই chapter সেই layer যা এগুলো ব্যাখ্যা করে।

## Layer model — আসলে কী আপনার packet বহন করে

textbook-এর OSI seven-layer chart ভুলে যান। SRE-রা যে model ব্যবহার করে:

```
L7  Application      HTTP, gRPC, TLS handshake (treated as L7)
L4  Transport        TCP, UDP, QUIC. Sockets, ports, congestion control.
L3  Network          IP. Routing, BGP, anycast, ECMP.
L2  Data link        Ethernet, MAC, ARP, VLANs.
L1  Physical         Fiber, SFP, optics. (You will rarely touch this.)
```

প্রতিটা production outage এগুলোর একটাতে map করে। একটা কাজের heuristic: একটা network page-এর প্রথম 60 সেকেন্ডে layer-টার নাম বলুন। "TLS handshake করবে না" = L7। "Connect সফল, packet dropped" = L4 বা L3।

## BGP — internet কীভাবে আসলে আপনার server খুঁজে পায়

Border Gateway Protocol হলো public internet-এর routing protocol। প্রতিটা ISP, প্রতিটা cloud provider, প্রতিটা CDN BGP বলে। একজন SRE হিসেবে, আপনি সাধারণত BGP router configure করেন না, কিন্তু এর পরিণতি আপনি প্রতিদিন দেখেন।

```
Your ASN (AS64500) advertises 198.51.100.0/24 to peers.
  ↓
Peer ISPs propagate that prefix to their neighbors.
  ↓
Eventually every router on Earth learns "for 198.51.100.0/24, send to AS64500."

When a peer mistakenly advertises your prefix as theirs (BGP hijack)
or stops advertising it (BGP withdrawal), traffic vanishes.
```

### যে বাস্তব-জগতের BGP failure আপনার চেনা উচিত

- **2021-10-04 Facebook outage.** একটা config push বিশ্বব্যাপী Facebook-এর BGP advertisement withdraw করে দিয়েছিল। route ছাড়া, `facebook.com`-এর DNS resolve করতে পারছিল না, আর যে engineer-রা এটা ঠিক করতে পারত তারা building-এ badge দিয়ে ঢুকতে পারছিল না। ~6 ঘণ্টা অন্ধকার।
- **2008 Pakistan/YouTube hijack.** Pakistan Telecom স্থানীয়ভাবে access block করতে `208.65.153.0/24` (YouTube) advertise করেছিল; তাদের upstream সেটা বিশ্বব্যাপী propagate করে দিল। YouTube 2 ঘণ্টা unreachable ছিল।
- **2024 একটা ছোট ISP দিয়ে routing leak।** একটা Tier-3 ISP একটা বড় SaaS কোম্পানির prefix একটা ছোট AS-PATH দিয়ে leak করেছিল; global traffic-এর একটা অংশ 40 মিনিট ধরে একটা congested fiber দিয়ে গিয়েছিল।

### আপনি আসলে কী করেন

আপনি BGP চালাবেন না যদি না আপনি একটা CDN, একটা cloud, বা একটা hyperscaler-এ থাকেন। আপনি করবেন:

```bash
# Validate route propagation with a looking glass
# (free public looking glasses: lg.he.net, lg.ring.nlnog.net)
# Type your prefix; see what AS-PATH the world receives.

# Verify your prefix is RPKI-signed (prevents hijacks)
# https://rpki-validator.ripe.net/   ← search your ASN

# Check anycast convergence after a config change
for region in iad sfo lhr nrt; do
  ssh probe-$region "dig +short api.example.com; mtr -c 5 -r api.example.com"
done
```

যদি আপনি নিজের IP space-সহ একটা কোম্পানিতে থাকেন, MRT dump পড়ার আর একটা route monitor (যেমন `bgpmon.net`, `BGPalerter`) চালানোর মতো যথেষ্ট BGP শেখা এক সপ্তাহের মূল্য রাখে।

## Anycast — একটা IP, অনেক শহর

Anycast মানে একাধিক location একই IP prefix announce করে। Router স্বাভাবিকভাবেই প্রতিটা user-কে _topologically নিকটতম_ announcement-এ পাঠায় (BGP-এর ভাষায়, সবচেয়ে কম AS hop)। এভাবেই CDN আর DNS root DNS-level geo routing ছাড়াই বিশ্বব্যাপী scale করে।

```
Cloudflare 1.1.1.1 — anycast across ~300 cities.
A user in Tokyo connects to 1.1.1.1 and lands in the Tokyo PoP.
A user in Frankfurt connects to 1.1.1.1 and lands in Frankfurt.
Same IP. Different physical machine. ~1 ms RTT for both.
```

### গোলমাল: TCP আর anycast সবসময় মেলে না

BGP connection-এর মাঝখানে re-converge করতে পারে। যদি একজন user-এর packet হঠাৎ একটা ভিন্ন PoP-এ route হয়, নতুন PoP-এর কোনো socket state নেই আর connection reset করে দেয়। আধুনিক CDN এটা সমাধান করে:

- `(src IP, dst IP, src port, dst port)`-এ stable hashing দিয়ে যাতে বেশিরভাগ TCP flow একটা PoP-এ আটকে থাকে।
- একটা PoP withdraw করলে connection draining — route withdraw করার আগে existing flow শেষ হতে দেওয়া।
- Short-lived connection (HTTP/2 multiplexing) যা retry-এর মাধ্যমে স্বচ্ছভাবে recover করতে পারে।

## ECMP — L3-তে load balancing

Equal-Cost Multi-Path হলো router কীভাবে একাধিক equal-cost link জুড়ে traffic split করে। একটা data center-এর ভেতরে, প্রতিটা top-of-rack switch-এর 4–8টি uplink থাকে; ECMP তাদের জুড়ে packet hash করে।

```
flow_hash = hash(src_ip, dst_ip, src_port, dst_port, protocol)
output_link = links[flow_hash % len(links)]
```

hash-টা per-flow, per-packet নয় — নয়তো TCP reorder করে আর ধসে যায়। এর মানে: একটা single elephant flow (একটা বিশাল TCP connection) একের বেশি link ব্যবহার করতে পারে না। যদি আপনার একটা 100 Gb/s ECMP bundle থাকে আর একটা client একটা connection খোলে, সেই client 25 Gb/s-এ সীমিত।

ব্যবহারিক fix: অনেক stream সহ HTTP/2 ব্যবহার করুন, বা N টি সমান্তরাল connection খুলুন যাতে ECMP সেগুলো ছড়িয়ে দেয়।

## Layer-4 vs Layer-7 load balancing

সবচেয়ে সাধারণ architecture সিদ্ধান্ত। দুটোরই failure mode আছে যা আপনার জানা দরকার।

|                     | L4 (e.g. NLB, IPVS, Maglev) | L7 (e.g. Envoy, ALB, Nginx)      |
| ------------------- | --------------------------- | -------------------------------- |
| Sees                | TCP/IP packets              | Full HTTP requests               |
| Routing keys        | 5-tuple hash                | URL, header, cookie, gRPC method |
| Latency overhead    | µs (kernel-bypass possible) | 1–5 ms                           |
| TLS termination     | No (passthrough)            | Yes                              |
| Per-request retries | No (per-connection)         | Yes                              |
| Failure visibility  | "TCP connect failed"        | "503 with response headers"      |
| Cost                | Cheap to scale              | More CPU per RPS                 |

scale-এ pattern: **সামনে L4, পেছনে L7।** L4 L7 proxy জুড়ে connection ছড়িয়ে দেয়; L7 স্মার্ট routing করে। Google-এর GFE, Facebook-এর Katran (XDP-based L4), আর Cloudflare-এর Unimog সবাই এই shape মেনে চলে।

### Connection-affinity গোলমাল

L4 hashing মানে যদি একটা client reconnect করে, এটা গতবারের চেয়ে একটা ভিন্ন backend-এ পড়তে পারে। stateful protocol-এর জন্য (websocket, long-poll, gRPC streaming) এটা "কথোপকথনের মাঝখানে session হারিয়ে গেল" হিসেবে দেখা দেয়। প্রশমন:

- L7 layer-এ stable client ID আর sticky session ব্যবহার করুন।
- websocket-এর জন্য, reconnection সহ্য করার মতো protocol ডিজাইন করুন (connect-এ re-subscribe)।
- একটা backend সরানোর সময় connection drain করুন; সেটাকে টান দিয়ে খুলে ফেলবেন না।

## Maglev hashing — L4 LB-এর জন্য সঠিক algorithm

Round-robin backend পরিবর্তনে ভেঙে যায় (প্রতিটা flow re-shuffle হয়)। Consistent hashing ভালো কিন্তু অসমভাবে বণ্টিত। **Maglev hashing** (Google-এর L4 LB) দুটোই দেয় — balance আর ন্যূনতম disruption।

```
Concept:
  Each backend gets entries in a lookup table proportional to its weight.
  When a backend is added or removed, only ~1/N entries change.
  Existing flows keep their backend; only flows hashing to the changed
  entries get reassigned.

Implementation in production:
  Katran (Facebook), GLB (GitHub), all use Maglev or a variant.
```

একটা L4 LB মূল্যায়ন করার সময়, "কোন hashing algorithm" হলো প্রশ্ন। "Round-robin" scale-এ একটা yellow flag।

## XDP আর kernel-bypass — যখন iptables যথেষ্ট নয়

XDP (eXpress Data Path) packet kernel networking stack-এ ঢোকার _আগে_ NIC-এর receive path-এ একটা eBPF program চালায়। এটা line rate-এ packet drop, redirect, বা modify করতে পারে।

```
Traditional path:  NIC → driver → kernel netfilter → conntrack → app
XDP path:          NIC → driver → eBPF program → (drop | redirect | xmit)

Throughput:  > 10 Mpps per core, vs ~2 Mpps for iptables-based filtering.
```

Production use:

- **DDoS mitigation.** Cloudflare XDP-তে 100M+ pps attack traffic drop করে।
- **L4 load balancing.** Katran XDP। খারাপ packet drop করে, ভালোগুলো hash করে, সঠিক backend-এ redirect করে, সব NIC-এ।
- **Per-pod policy enforcement.** Cilium scale-এ NetworkPolicy-র জন্য iptables-এর বদলে eBPF/XDP ব্যবহার করে (iptables ~10k rule পার হলে ভেঙে পড়ে)।

আপনি সম্ভবত নিজে XDP লিখবেন না, কিন্তু আপনার জানা উচিত:

```bash
# Check if your NIC supports XDP-native (zero-copy) mode
ethtool -i eth0 | grep driver
# Compare against https://docs.cilium.io/en/stable/concepts/datapath/

# XDP programs loaded
bpftool net show

# Replace iptables with eBPF/Cilium past ~5k NetworkPolicies in K8s
```

## CDN internals — কেন আপনার origin তবু hit হয়

Engineer-রা ভাবে "আমাদের একটা CDN আছে, origin নিরাপদ।" তারপর একটা deploy cache invalidate করে, origin 100x traffic পায়, আর database গলে যায়।

### cache layer-গুলো

```
Browser cache         (Cache-Control: max-age, etag)
   ↓ miss
Edge PoP cache        (CDN's nearest server to the user)
   ↓ miss
Mid-tier / shield     (single PoP per region, shields the origin)
   ↓ miss
Origin                (your servers)
```

এই layer-এর দুটো failure pattern:

1. **invalidation-এ cache stampede।** একটা purge বিশ্বব্যাপী cached object clear করে; প্রতিটা PoP থেকে পরের request miss করে, আর N টি PoP একসাথে origin hit করে। প্রশমন: stale-while-revalidate, edge-এ request coalescing (Varnish-এর `req.hash_always_miss` + grace), origin shield।

2. **Cache poisoning।** একটা অস্বাভাবিক header সহ একটা request (যেমন `Vary: User-Agent`) একটা entry তৈরি করে যা আরেকজন user পায়। CDN-এর `Vary` handling সূক্ষ্ম; test করুন।

### যে cache header-গুলো গুরুত্বপূর্ণ

```
Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400
                       browser=5min  CDN=1h          serve stale up to 24h
                                                     while refetching async

ETag: "v1-deadbeef"               # for conditional requests
Vary: Accept-Encoding             # NEVER add user-specific headers here
Surrogate-Key: product-123        # purge granularly (Fastly, others)
```

শুধু `stale-while-revalidate` যেকোনো caching tutorial-এর চেয়ে বেশি origin বাঁচিয়েছে।

## DNS — আপনার আরেকটা single point of failure

"internet outage"-এর অর্ধেক DNS। pattern-গুলো:

- **TTL খুব বেশি।** আপনি TTL-এর মধ্যে fail over করতে পারবেন না। এমন LB-এর দিকে point করা prod DNS record-এর জন্য 60 s ব্যবহার করুন যা সরে যেতে পারে।
- **TTL খুব কম।** আপনি recursor-কে hammer করেন; যদি আপনার authoritative down হয়, _সব_ query সাথে সাথে ভাঙে।
- **Authoritative outage।** যদি আপনার DNS provider `your.com`-এর একমাত্র source হয়, একটা provider outage আপনাকে internet থেকে সরিয়ে দেয় (Dyn 2016)।

senior team যে architecture ব্যবহার করে:

```
1. Use two unrelated DNS providers (NS1 + Route53, Cloudflare + Google).
2. Keep zones in sync via OctoDNS or dnscontrol (declarative DNS as code).
3. Set sensible TTLs: 60 s for failover-critical, 1 h for stable, 24 h for static.
4. Monitor authoritative health from multiple regions.
5. Pre-test failover quarterly. (Many DNS failovers don't work the first time.)
```

OctoDNS-এ DNS-as-code:

```yaml
# zones/example.com.yaml
api:
  type: A
  ttl: 60
  values: [198.51.100.10, 198.51.100.11]
www:
  type: CNAME
  ttl: 3600
  value: app.cloudfront.net.
```

`octodns-sync --doit` দিয়ে apply করুন। CI-তে diff করুন; একটা typo কখনো prod-এ পৌঁছায় না।

## scale-এ TCP — এক-পৃষ্ঠার reference

Production traffic-এর জন্য যে TCP field আর tuning গুরুত্বপূর্ণ।

### Buffer sizing

```bash
# Auto-tuning bounds (kernel adjusts within these)
net.ipv4.tcp_rmem = "4096 87380 16777216"   # min default max
net.ipv4.tcp_wmem = "4096 65536 16777216"

# Bandwidth-Delay Product rule of thumb:
# buffer_size = bandwidth_in_bps * RTT_in_seconds / 8
# 10 Gbps * 80 ms = 100 MB. Default 16 MB chokes long-distance links.
```

### Congestion control

```bash
# CUBIC (default) — assumes loss = congestion. Fine on LAN, bad on lossy WAN.
# BBR (Google) — model-based. Wins on internet paths with random loss.
# Kernel 6.0+ uses BBRv2/v3 automatically when you set bbr — no extra config.
sysctl -w net.core.default_qdisc=fq
sysctl -w net.ipv4.tcp_congestion_control=bbr
```

long-haul replication-এর জন্য (যেমন cross-region DB sync), BBR CUBIC-এর চেয়ে 2–5x দ্রুত হতে পারে। আপনার আসল path-এ test করুন।

### TIME-WAIT আর connection reuse

```bash
# Server side: rely on TIME-WAIT, don't tune it. tcp_tw_reuse on the SERVER
# is dangerous (NAT collisions).
# Client side (e.g. proxy fanning out to backends): tcp_tw_reuse is fine.
sysctl -w net.ipv4.tcp_tw_reuse=1   # client-side proxy only

# Reuse keepalive connections at the application layer instead.
# Go: http.Transport with MaxIdleConnsPerHost > 0, IdleConnTimeout 90s.
```

### Keepalive

```bash
# Default keepalive: 2 hours after idle, then probes. Way too slow for prod.
sysctl -w net.ipv4.tcp_keepalive_time=60
sysctl -w net.ipv4.tcp_keepalive_intvl=10
sysctl -w net.ipv4.tcp_keepalive_probes=6
```

## production-এ packet capture

যখন metric যথেষ্ট নয়, packet capture করুন। দুটো নিয়ম:

1. **আক্রমণাত্মকভাবে filter করুন।** একটা 10 Gb/s NIC-এ প্রতিটা packet capture করলে কয়েক মিনিটে disk ভরে যায়।
2. **সঠিক host-এ capture করুন।** যদি এটা একটা "অদ্ভুত" interaction হয় তবে দুই প্রান্তেই capture করুন; আপনি প্রায়ই দেখবেন packet আলাদা।

```bash
# Minimal-overhead capture, ring-buffered, last 100 MB
tcpdump -i eth0 -nn -s 0 -w /tmp/cap.pcap -W 1 -C 100 \
  'host 10.0.5.6 and port 443 and (tcp[tcpflags] & (tcp-syn|tcp-rst|tcp-fin) != 0)'
# Captures only handshake/teardown packets — tiny but covers most issues.

# Read remotely
tshark -r /tmp/cap.pcap -Y 'tcp.flags.reset == 1'   # find all RSTs
```

TLS issue-র জন্য, আপনার SSLKEYLOGFILE trick লাগবে:

```bash
# Tell client (curl/Chrome) to dump TLS keys
export SSLKEYLOGFILE=/tmp/keys.log
curl https://api.example.com/

# Then in Wireshark: Preferences → TLS → (Pre)-Master-Secret log filename
# Now you can decrypt the captured TLS stream and see the application bytes.
```

## একটা বাস্তব network outage — layer-গুলোর মধ্য দিয়ে হাঁটা

Symptom: একটা নির্দিষ্ট শহর থেকে 0.3% API request `ECONNRESET` ফেরত দেয়। অন্য শহরগুলো ঠিক আছে। 2 ঘণ্টা আগে শুরু হয়েছে। কোনো deploy নেই।

```
L7? — App returns 200 for the responses it sends. So app didn't choose to RST.
       Logs show no errors. Skip L7.

L4? — Capture on a backend. Most flows complete normally. The failing ones
       see the SYN-ACK leave the host but never get the final ACK.
       Then the app sends data, client RST.

L3? — Run mtr from the affected city to the LB IP.
       Hop 7 (a transit ISP) shows 30% packet loss bidirectionally.
       Other cities go via a different transit and don't hit hop 7.

L2? — Not the issue here. The transit's link is the problem.

Resolution:
       Withdraw the BGP announcement to that transit (or shift weights)
       so traffic from the affected region routes via a healthy peer.
       Open a ticket with the transit ISP (they confirm a flapping
       link card and replace it 6 hours later).
```

শিক্ষা: একটা 0.3% application error rate-এর একটা network root cause ছিল আর application layer-এ কোনো fix ছিল না। একজন senior SRE যে mtr + tcpdump + BGP path attribute পড়তে পারে সে এটা 20 মিনিটে খুঁজে পায়। এগুলো ছাড়া, team তিন দিন ব্যয় করে application retry যোগ করে যা কোনো কাজে আসে না।

## Tools tier list

```
Tier S (always know cold)
  ss, tcpdump, dig, mtr, curl -v, traceroute,
  ip route / ip rule, ethtool

Tier A (worth a weekend learning)
  Wireshark/tshark, bpftrace tcp* tools,
  Cilium/Hubble (if K8s), looking glasses

Tier B (specialist, but learn one)
  iperf3 (capacity), wrk/k6 (load), nuttcp (long-haul)
  AS-PATH analysis (BGPalerter, RPKI dashboards)

Tier F
  GUI-only network tools that don't run on a headless box.
  Random sysctl tuning blog posts from 2012.
```

## আপডেটেড থাকুন

- [Cloudflare blog](https://blog.cloudflare.com/) — TCP/QUIC/edge networking-এর সেরা public source
- [Linux networking docs](https://www.kernel.org/doc/html/latest/networking/index.html) — sysctl + stack reference
- [High Performance Browser Networking (Ilya Grigorik)](https://hpbn.co/) — free বই, এখনও authoritative
- [QUIC working group docs](https://quicwg.org/) — HTTP/3 evolution

## মূল কথাগুলো

1. **একটা network page-এর প্রথম 60 সেকেন্ডে OSI layer-টার নাম বলুন** — এটা search space অর্ধেক করে।
2. **Anycast + ECMP-ই কারণ CDN scale করে** — আর অদ্ভুত "session lost" bug-এর উৎস।
3. **সামনে L4, পেছনে L7** হলো scale-এ pattern; Maglev hashing শিখুন।
4. **DNS, BGP, আর TLS হলো তিনটা "internet-level" failure mode** — প্রতিটা senior SRE প্রতিটা অন্তত একবার দেখেছে।
5. **behaviour প্রত্যাশা থেকে বিচ্যুত হলে দুই প্রান্তেই packet capture করুন।**
6. **TCP tuning বেশিরভাগ long-distance link-এ গুরুত্বপূর্ণ** — BBR + বড় buffer; নয়তো kernel-কে নিজেকে tune করতে দিন।
