---
title: 'Foundations'
subtitle: "How networks work, TCP/IP, the OSI model, and the attacker's mental model for finding weaknesses."
chapter: 1
level: 'beginner'
readingTime: '12 min'
topics: ['TCP/IP', 'OSI model', 'networking', 'ports', 'protocols', 'attacker mindset']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A burglar studies how houses are built — door locks, window latches, alarm systems — before deciding how to get in. Network attackers study protocols for the same reason: every protocol has assumptions, and assumptions have edge cases that become vulnerabilities.

</Callout>

## The OSI Model (Attacker's View)

Attacks happen at every layer. Knowing which layer an attack targets tells you what defenses apply.

```
Layer 7 — Application   → HTTP, DNS, SMTP    → SQLi, XSS, RCE
Layer 6 — Presentation  → TLS, encoding       → SSL stripping, encoding bypasses
Layer 5 — Session       → NetBIOS, RPC        → Session hijacking
Layer 4 — Transport     → TCP, UDP            → Port scanning, SYN floods
Layer 3 — Network       → IP, ICMP            → Routing attacks, IP spoofing
Layer 2 — Data Link     → Ethernet, ARP       → ARP poisoning, MAC spoofing
Layer 1 — Physical      → Cables, WiFi        → Rogue APs, cable tapping
```

**Most web exploits are Layer 7.** Most internal network attacks are Layers 2-4.

## TCP/IP Deep Dive

### The TCP Handshake

```
Client                    Server
  │                          │
  │──── SYN ─────────────────▶│   "I want to connect"
  │◀─── SYN-ACK ─────────────│   "OK, I'm listening"
  │──── ACK ─────────────────▶│   "Great, let's talk"
  │                          │
  │ ← established connection →│
```

**Port scanning exploits this.** A SYN scan sends SYN, waits for SYN-ACK (port open) or RST (port closed), then never sends the final ACK — the connection never fully establishes, making it harder to log.

### TCP Flags

| Flag | Meaning               | Attacker Use                         |
| ---- | --------------------- | ------------------------------------ |
| SYN  | Initiate connection   | Port scanning, SYN flood DoS         |
| ACK  | Acknowledge           | ACK scanning (bypass some firewalls) |
| FIN  | Close connection      | FIN scan (evade simple filters)      |
| RST  | Reset connection      | Forged RSTs to kill connections      |
| PSH  | Push data immediately | —                                    |
| URG  | Urgent data           | —                                    |

### IP Addressing Essentials

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

## Key Protocols Every Attacker Knows

### DNS — The Phone Book

```
Browser → DNS Resolver → Root NS → .com NS → example.com NS → 93.184.216.34
```

**Attack surface:**

- DNS zone transfers expose all hostnames (misconfigured servers leak internal structure)
- DNS cache poisoning redirects users to attacker-controlled IPs
- Subdomain enumeration discovers forgotten/exposed assets

```bash
# Zone transfer attempt (often fails on hardened servers, still worth trying)
dig axfr @ns1.example.com example.com

# Subdomain brute-force
gobuster dns -d example.com -w /usr/share/wordlists/subdomains-top1million.txt
```

### HTTP — The Attacker's Playground

```
GET /api/users/1 HTTP/1.1
Host: example.com
Authorization: Bearer eyJhbGc...
Cookie: session=abc123
```

HTTP is stateless but applications maintain state via cookies and tokens. Every header is input — and input can be manipulated.

**Headers attackers pay attention to:**

- `Authorization` — can it be forged, replayed, or brute-forced?
- `Cookie` — is the session token predictable? HttpOnly? Secure?
- `X-Forwarded-For` — do apps trust this? Can you spoof your IP?
- `Content-Type` — does the server process XML when you send it? (XXE)
- `Referer` — does CSRF protection rely only on this header?

### SMB — Windows File Sharing

SMB (Server Message Block) is the most historically exploited protocol in Windows environments. EternalBlue (MS17-010) used it to spread WannaCry across millions of machines.

```bash
# Enumerate SMB shares
smbclient -L //192.168.1.100 -N        # null session
enum4linux -a 192.168.1.100             # full enumeration
nmap --script smb-enum-shares 192.168.1.100
```

## The Attacker's Mental Model

### Trust Boundaries

Every system has components that trust each other more than they trust the outside world. Attackers look for ways to cross those boundaries:

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

The attack surface is everything that can receive input:

- Every HTTP endpoint
- Every CLI argument
- Every file that gets parsed
- Every environment variable
- Every network port that's open
- Every third-party library

**Reducing attack surface is the single most effective defensive measure.** You can't exploit what isn't there.

### The CIA Triad

Every security control protects one or more of:

```
Confidentiality — data is only readable by authorized parties
                  Attack: data exfiltration, credential theft
Integrity       — data is only modifiable by authorized parties
                  Attack: tampering, SQL injection
Availability    — system is accessible when needed
                  Attack: DoS/DDoS, ransomware
```

Frame every finding in your reports around which CIA properties it violates.

## Practical: Build Your Network Map

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

## Common Port Reference

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

Seeing port 6379 open on a public IP is almost always a critical finding — Redis has no authentication by default and can be used to write arbitrary files (SSH keys, cron jobs) on the server.
