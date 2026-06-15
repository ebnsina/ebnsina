---
title: "Network Engineering for SREs"
subtitle: "BGP, anycast, ECMP, CDN internals, packet capture, and TCP at scale. The networking layer where 'random' production weirdness actually lives."
chapter: 13
level: "mastery"
readingTime: "30 min"
topics: ["networking", "BGP", "anycast", "CDN", "TCP", "tcpdump", "XDP", "load balancing"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

The plumbing in a building — invisible when working, catastrophic when not, and requires a specialist to diagnose.

</Callout>

## Why SREs need real networking

A frontend engineer can ship a feature without knowing what BGP is. A senior SRE cannot debug a regional latency spike, a DNS-related outage, or a CDN-edge failover without it. Networks fail in ways that look like application bugs — connection resets, partial 502s, "the API is slow but only from one office." This chapter is the layer that explains those.

## Layer model — what actually carries your packets

Forget the OSI seven-layer chart from textbooks. The model SREs use:

```
L7  Application      HTTP, gRPC, TLS handshake (treated as L7)
L4  Transport        TCP, UDP, QUIC. Sockets, ports, congestion control.
L3  Network          IP. Routing, BGP, anycast, ECMP.
L2  Data link        Ethernet, MAC, ARP, VLANs.
L1  Physical         Fiber, SFP, optics. (You will rarely touch this.)
```

Every production outage maps to one of these. A useful heuristic: name the layer in the first 60 seconds of a network page. "TLS won't handshake" = L7. "Connect succeeds, packets dropped" = L4 or L3.

## BGP — how the internet actually finds your servers

Border Gateway Protocol is the routing protocol of the public internet. Every ISP, every cloud provider, every CDN speaks BGP. As an SRE, you don't usually configure BGP routers, but you do see its consequences daily.

```
Your ASN (AS64500) advertises 198.51.100.0/24 to peers.
  ↓
Peer ISPs propagate that prefix to their neighbors.
  ↓
Eventually every router on Earth learns "for 198.51.100.0/24, send to AS64500."

When a peer mistakenly advertises your prefix as theirs (BGP hijack)
or stops advertising it (BGP withdrawal), traffic vanishes.
```

### Real-world BGP failures you should recognize

- **2021-10-04 Facebook outage.** A config push withdrew Facebook's BGP advertisements globally. Without routes, DNS for `facebook.com` couldn't resolve, and the engineers who could fix it couldn't badge into the building. ~6 hours dark.
- **2008 Pakistan/YouTube hijack.** Pakistan Telecom advertised `208.65.153.0/24` (YouTube) to block access locally; their upstream propagated it globally. YouTube was unreachable for 2 hours.
- **2024 routing leak via a small ISP.** A Tier-3 ISP leaked a major SaaS company's prefixes with a shorter AS-PATH; a chunk of global traffic went through one congested fiber for 40 minutes.

### What you actually do

You won't run BGP unless you're at a CDN, a cloud, or a hyperscaler. You will:

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

If you are at a company with its own IP space, learning BGP enough to read MRT dumps and run a route monitor (e.g. `bgpmon.net`, `BGPalerter`) is worth a week.

## Anycast — one IP, many cities

Anycast means multiple locations announce the same IP prefix. Routers naturally send each user to the *topologically nearest* announcement (in BGP terms, fewest AS hops). This is how CDNs and DNS roots scale globally without DNS-level geo routing.

```
Cloudflare 1.1.1.1 — anycast across ~300 cities.
A user in Tokyo connects to 1.1.1.1 and lands in the Tokyo PoP.
A user in Frankfurt connects to 1.1.1.1 and lands in Frankfurt.
Same IP. Different physical machine. ~1 ms RTT for both.
```

### The catch: TCP and anycast don't always mix

BGP can re-converge mid-connection. If a user's packets suddenly route to a different PoP, the new PoP has no socket state and resets the connection. Modern CDNs solve this by:

- Stable hashing on `(src IP, dst IP, src port, dst port)` so most TCP flows stick to one PoP.
- Connection draining when a PoP withdraws — let existing flows finish before withdrawing the route.
- Short-lived connections (HTTP/2 multiplexing) that can recover via retry transparently.

## ECMP — load balancing at L3

Equal-Cost Multi-Path is how routers split traffic across multiple equal-cost links. Inside a data center, every top-of-rack switch has 4–8 uplinks; ECMP hashes packets across them.

```
flow_hash = hash(src_ip, dst_ip, src_port, dst_port, protocol)
output_link = links[flow_hash % len(links)]
```

The hash is per-flow, not per-packet — otherwise TCP reorders and tanks. The implication: a single elephant flow (one giant TCP connection) cannot use more than one link. If you have a 100 Gb/s ECMP bundle and one client opens one connection, that client is capped at 25 Gb/s.

Practical fix: use HTTP/2 with many streams, or open N parallel connections so ECMP spreads them.

## Layer-4 vs Layer-7 load balancing

The single most common architecture decision. Both have failure modes you need to know.

| | L4 (e.g. NLB, IPVS, Maglev) | L7 (e.g. Envoy, ALB, Nginx) |
|---|---|---|
| Sees | TCP/IP packets | Full HTTP requests |
| Routing keys | 5-tuple hash | URL, header, cookie, gRPC method |
| Latency overhead | µs (kernel-bypass possible) | 1–5 ms |
| TLS termination | No (passthrough) | Yes |
| Per-request retries | No (per-connection) | Yes |
| Failure visibility | "TCP connect failed" | "503 with response headers" |
| Cost | Cheap to scale | More CPU per RPS |

The pattern at scale: **L4 in front, L7 behind.** L4 spreads connections across L7 proxies; L7 does the smart routing. Google's GFE, Facebook's Katran (XDP-based L4), and Cloudflare's Unimog all follow this shape.

### Connection-affinity gotcha

L4 hashing means if a client reconnects, it might land on a different backend than last time. For stateful protocols (websockets, long-poll, gRPC streaming) this surfaces as "session lost mid-conversation." Mitigations:

- Use stable client IDs and sticky sessions at the L7 layer.
- For websockets, design the protocol to tolerate reconnection (re-subscribe on connect).
- Drain connections when removing a backend; don't yank it.

## Maglev hashing — the right algorithm for L4 LB

Round-robin breaks on backend changes (every flow re-shuffles). Consistent hashing is better but unevenly distributed. **Maglev hashing** (Google's L4 LB) gives both balance and minimal disruption.

```
Concept:
  Each backend gets entries in a lookup table proportional to its weight.
  When a backend is added or removed, only ~1/N entries change.
  Existing flows keep their backend; only flows hashing to the changed
  entries get reassigned.

Implementation in production:
  Katran (Facebook), GLB (GitHub), all use Maglev or a variant.
```

When evaluating an L4 LB, "what hashing algorithm" is the question. "Round-robin" is a yellow flag at scale.

## XDP and kernel-bypass — when iptables isn't enough

XDP (eXpress Data Path) runs an eBPF program on the NIC's receive path *before* the packet enters the kernel networking stack. It can drop, redirect, or modify packets at line rate.

```
Traditional path:  NIC → driver → kernel netfilter → conntrack → app
XDP path:          NIC → driver → eBPF program → (drop | redirect | xmit)

Throughput:  > 10 Mpps per core, vs ~2 Mpps for iptables-based filtering.
```

Production uses:

- **DDoS mitigation.** Cloudflare drops 100M+ pps of attack traffic in XDP.
- **L4 load balancing.** Katran is XDP. Drops bad packets, hashes good ones, redirects to the right backend, all in the NIC.
- **Per-pod policy enforcement.** Cilium uses eBPF/XDP instead of iptables for NetworkPolicy at scale (iptables falls over past ~10k rules).

You probably won't write XDP yourself, but you should know:

```bash
# Check if your NIC supports XDP-native (zero-copy) mode
ethtool -i eth0 | grep driver
# Compare against https://docs.cilium.io/en/stable/concepts/datapath/

# XDP programs loaded
bpftool net show

# Replace iptables with eBPF/Cilium past ~5k NetworkPolicies in K8s
```

## CDN internals — why your origin gets hit anyway

Engineers think "we have a CDN, the origin is safe." Then a deploy invalidates cache, the origin gets 100x traffic, and the database melts.

### The cache layers

```
Browser cache         (Cache-Control: max-age, etag)
   ↓ miss
Edge PoP cache        (CDN's nearest server to the user)
   ↓ miss
Mid-tier / shield     (single PoP per region, shields the origin)
   ↓ miss
Origin                (your servers)
```

The two failure patterns at this layer:

1. **Cache stampede on invalidation.** A purge clears cached objects globally; the next request from each PoP misses, and N PoPs hit the origin simultaneously. Mitigations: stale-while-revalidate, request coalescing at the edge (Varnish's `req.hash_always_miss` + grace), origin shield.

2. **Cache poisoning.** A request with an unusual header (e.g., `Vary: User-Agent`) creates an entry that another user receives. CDNs' `Vary` handling is subtle; test it.

### Cache headers that matter

```
Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400
                       browser=5min  CDN=1h          serve stale up to 24h
                                                     while refetching async

ETag: "v1-deadbeef"               # for conditional requests
Vary: Accept-Encoding             # NEVER add user-specific headers here
Surrogate-Key: product-123        # purge granularly (Fastly, others)
```

`stale-while-revalidate` alone has saved more origins than any caching tutorial.

## DNS — your other single point of failure

Half of "internet outages" are DNS. The patterns:

- **TTL too high.** You can't fail over within the TTL. Use 60 s for prod DNS records pointing at LBs that might move.
- **TTL too low.** You hammer the recursor; if your authoritative goes down, *all* queries break instantly.
- **Authoritative outage.** If your DNS provider is the single source for `your.com`, a provider outage takes you off the internet (Dyn 2016).

The architecture senior teams use:

```
1. Use two unrelated DNS providers (NS1 + Route53, Cloudflare + Google).
2. Keep zones in sync via OctoDNS or dnscontrol (declarative DNS as code).
3. Set sensible TTLs: 60 s for failover-critical, 1 h for stable, 24 h for static.
4. Monitor authoritative health from multiple regions.
5. Pre-test failover quarterly. (Many DNS failovers don't work the first time.)
```

DNS-as-code in OctoDNS:

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

Apply via `octodns-sync --doit`. Diff in CI; a typo never reaches prod.

## TCP at scale — the one-page reference

The TCP fields and tunings that matter for production traffic.

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

For long-haul replication (e.g. cross-region DB sync), BBR can be 2–5x faster than CUBIC. Test on your actual paths.

### TIME-WAIT and connection reuse

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

## Packet capture in production

When metrics aren't enough, capture packets. Two rules:

1. **Filter aggressively.** Capturing every packet on a 10 Gb/s NIC fills disk in minutes.
2. **Capture on the right host.** Capture on both ends if it's a "weird" interaction; you'll often see the packets are different.

```bash
# Minimal-overhead capture, ring-buffered, last 100 MB
tcpdump -i eth0 -nn -s 0 -w /tmp/cap.pcap -W 1 -C 100 \
  'host 10.0.5.6 and port 443 and (tcp[tcpflags] & (tcp-syn|tcp-rst|tcp-fin) != 0)'
# Captures only handshake/teardown packets — tiny but covers most issues.

# Read remotely
tshark -r /tmp/cap.pcap -Y 'tcp.flags.reset == 1'   # find all RSTs
```

For TLS issues, you'll need the SSLKEYLOGFILE trick:

```bash
# Tell client (curl/Chrome) to dump TLS keys
export SSLKEYLOGFILE=/tmp/keys.log
curl https://api.example.com/

# Then in Wireshark: Preferences → TLS → (Pre)-Master-Secret log filename
# Now you can decrypt the captured TLS stream and see the application bytes.
```

## A real network outage — walking through the layers

Symptom: 0.3% of API requests from one specific city return `ECONNRESET`. Other cities fine. Started 2 hours ago. No deploys.

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

The lesson: a 0.3% application error rate had a network root cause and zero fix at the application layer. A senior SRE who can read mtr + tcpdump + BGP path attributes finds this in 20 minutes. Without those, the team spends three days adding application retries that don't help.

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

## Stay current

- [Cloudflare blog](https://blog.cloudflare.com/) — best public source for TCP/QUIC/edge networking
- [Linux networking docs](https://www.kernel.org/doc/html/latest/networking/index.html) — sysctl + stack reference
- [High Performance Browser Networking (Ilya Grigorik)](https://hpbn.co/) — free book, still authoritative
- [QUIC working group docs](https://quicwg.org/) — HTTP/3 evolution

## Key Takeaways

1. **Name the OSI layer in the first 60 seconds of a network page** — it bisects the search space.
2. **Anycast + ECMP are why CDNs scale** — and the source of bizarre "session lost" bugs.
3. **L4 in front, L7 behind** is the pattern at scale; learn Maglev hashing.
4. **DNS, BGP, and TLS are the three "internet-level" failure modes** — every senior SRE has seen each at least once.
5. **Capture packets on both ends** when behavior diverges from expectation.
6. **TCP tuning matters mostly on long-distance links** — BBR + bigger buffers; otherwise let the kernel tune itself.

