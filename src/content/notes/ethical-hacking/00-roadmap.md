---
title: "Ethical Hacking — Roadmap"
subtitle: "Zero to professional penetration tester. Recon, exploitation, post-exploitation, reporting — with real labs."
chapter: 0
level: "beginner"
readingTime: "5 min"
topics: ["roadmap", "ethical hacking", "penetration testing", "cybersecurity"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A locksmith who tests locks for a living: they know every picking technique, bypass, and flaw — not to rob houses, but because you can't build a lock that resists attacks you don't understand. Ethical hacking is the same trade applied to software systems.

</Callout>

## What you will learn

Security is not a product you install — it's a discipline you practice. This track teaches you to think like an attacker so you can defend like one. You'll go from zero Linux knowledge to running complete penetration tests: reconnaissance, scanning, exploitation, privilege escalation, post-exploitation, and professional reporting.

Every chapter has real commands, real tools, and real lab exercises. No theory without practice.

## Prerequisites

- Basic comfort with a terminal (cd, ls, cat)
- Some programming exposure (Python helps, not required)
- A machine that can run VMs (8GB RAM minimum)

## Lab Setup

Before starting, get your lab running:

```bash
# Install VirtualBox (free)
# Download Kali Linux ISO from kali.org — the standard attacker OS
# Download VulnHub VMs or use TryHackMe/HackTheBox for targets

# Kali on WSL2 (Windows alternative)
wsl --install -d kali-linux
```

You need an **isolated lab network** — never attack systems you don't own or have written permission to test.

## Chapters in this track

1. **Foundations** — How networks work, TCP/IP, the attacker's mental model
2. **Linux for Hackers** — Terminal mastery, file permissions, bash scripting for recon
3. **Reconnaissance** — OSINT, passive recon, Google dorks, Shodan, theHarvester
4. **Scanning & Enumeration** — Nmap, service fingerprinting, banner grabbing, SMB/FTP enum
5. **Vulnerability Analysis** — CVE database, CVSS scoring, automated scanners, manual analysis
6. **Exploitation Basics** — Metasploit framework, manual exploit development, payload generation
7. **Web Application Hacking** — OWASP Top 10, Burp Suite, SQLi, XSS, SSRF, IDOR
8. **Network Attacks** — ARP spoofing, MITM, packet capture, credential sniffing
9. **Privilege Escalation** — Linux and Windows privesc techniques, SUID, token impersonation
10. **Post-Exploitation** — Lateral movement, persistence, data exfiltration, covering tracks
11. **Cryptography Attacks** — Hash cracking, weak cipher exploitation, PKI weaknesses
12. **Wireless Security** — WPA2 handshake capture, WPS attacks, evil twin APs
13. **Social Engineering** — Phishing campaigns, pretexting, defense strategies
14. **CTF Strategy** — How to approach Capture the Flag challenges, platforms, write-ups
15. **Pentest Reporting** — Professional report structure, CVSS scoring, remediation advice

## The Hacker Methodology

Every engagement follows this cycle. Internalize it before you touch a tool:

```
Reconnaissance  →  Scanning  →  Exploitation  →  Post-Exploitation  →  Reporting
      ↑                                                                      ↓
      └────────────────────── Iterate per finding ──────────────────────────┘
```

**Recon first, always.** Most beginners jump straight to scanning. Professionals spend 40% of their time just on recon — the more you know before you touch the target, the less noise you make.

## Legal Framework

Before every engagement:

- Written **scope document** defining IP ranges, domains, and methods allowed
- Signed **rules of engagement** with emergency contacts
- **Emergency stop** procedure if live systems are affected

Hacking without written permission is a crime regardless of intent. In the US: Computer Fraud and Abuse Act (CFAA). In the UK: Computer Misuse Act. In the EU: Directive 2013/40/EU.

Use these platforms for legal practice:
- **TryHackMe** — guided rooms, beginner-friendly
- **HackTheBox** — realistic machines, intermediate+
- **VulnHub** — downloadable VMs, offline practice
- **DVWA** — intentionally vulnerable web app, local install
- **PentesterLab** — web-focused exercises with solutions

