---
title: 'Ethical Hacking — রোডম্যাপ'
subtitle: 'শূন্য থেকে প্রফেশনাল পেনিট্রেশন টেস্টার। রিকন, এক্সপ্লয়টেশন, পোস্ট-এক্সপ্লয়টেশন, রিপোর্টিং — রিয়েল ল্যাব সহ।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap', 'ethical hacking', 'penetration testing', 'cybersecurity']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন লকস্মিথ যিনি জীবিকার জন্য তালা টেস্ট করেন: তিনি প্রতিটি পিকিং টেকনিক, বাইপাস আর ফ্লো জানেন — বাড়ি ডাকাতি করার জন্য নয়, বরং যে অ্যাটাক আপনি বোঝেন না তার বিরুদ্ধে টিকে থাকতে পারে এমন তালা আপনি বানাতে পারবেন না বলে। Ethical hacking একই পেশা, শুধু সফটওয়্যার সিস্টেমে প্রয়োগ করা।

</Callout>

## যা শিখবেন

সিকিউরিটি এমন কোনো প্রোডাক্ট নয় যা আপনি ইনস্টল করেন — এটি এমন একটি ডিসিপ্লিন যা আপনি চর্চা করেন। এই ট্র্যাক আপনাকে একজন অ্যাটাকারের মতো ভাবতে শেখায়, যাতে আপনি একজন অ্যাটাকারের মতোই ডিফেন্ড করতে পারেন। আপনি শূন্য Linux জ্ঞান থেকে শুরু করে সম্পূর্ণ পেনিট্রেশন টেস্ট চালানো পর্যন্ত যাবেন: reconnaissance, scanning, exploitation, privilege escalation, post-exploitation, এবং প্রফেশনাল রিপোর্টিং।

প্রতিটি চ্যাপ্টারে আছে রিয়েল কমান্ড, রিয়েল টুল, আর রিয়েল ল্যাব এক্সারসাইজ। প্র্যাকটিস ছাড়া কোনো থিওরি নেই।

## প্রি-রিকুইজিট

- টার্মিনালে মোটামুটি স্বাচ্ছন্দ্য (cd, ls, cat)
- কিছুটা প্রোগ্রামিং পরিচয় (Python সাহায্য করে, তবে বাধ্যতামূলক নয়)
- এমন একটি মেশিন যা VM চালাতে পারে (কমপক্ষে 8GB RAM)

## ল্যাব সেটআপ

শুরু করার আগে আপনার ল্যাব চালু করুন:

```bash
# Install VirtualBox (free)
# Download Kali Linux ISO from kali.org — the standard attacker OS
# Download VulnHub VMs or use TryHackMe/HackTheBox for targets

# Kali on WSL2 (Windows alternative)
wsl --install -d kali-linux
```

আপনার একটি **isolated lab network** দরকার — কখনো এমন সিস্টেমে অ্যাটাক করবেন না যা আপনার নয় বা যেটি টেস্ট করার লিখিত অনুমতি আপনার নেই।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **Foundations** — নেটওয়ার্ক কীভাবে কাজ করে, TCP/IP, অ্যাটাকারের মানসিক মডেল
2. **Linux for Hackers** — টার্মিনাল দক্ষতা, ফাইল পারমিশন, রিকনের জন্য bash স্ক্রিপ্টিং
3. **Reconnaissance** — OSINT, passive recon, Google dorks, Shodan, theHarvester
4. **Scanning & Enumeration** — Nmap, service fingerprinting, banner grabbing, SMB/FTP enum
5. **Vulnerability Analysis** — CVE database, CVSS scoring, automated scanners, ম্যানুয়াল অ্যানালাইসিস
6. **Exploitation Basics** — Metasploit framework, ম্যানুয়াল exploit development, payload generation
7. **Web Application Hacking** — OWASP Top 10, Burp Suite, SQLi, XSS, SSRF, IDOR
8. **Network Attacks** — ARP spoofing, MITM, packet capture, credential sniffing
9. **Privilege Escalation** — Linux ও Windows privesc টেকনিক, SUID, token impersonation
10. **Post-Exploitation** — lateral movement, persistence, data exfiltration, ট্র্যাক মুছে ফেলা
11. **Cryptography Attacks** — hash cracking, weak cipher exploitation, PKI দুর্বলতা
12. **Wireless Security** — WPA2 handshake capture, WPS attacks, evil twin AP
13. **Social Engineering** — phishing campaign, pretexting, ডিফেন্স স্ট্র্যাটেজি
14. **CTF Strategy** — Capture the Flag চ্যালেঞ্জে কীভাবে এগোবেন, প্ল্যাটফর্ম, write-up
15. **Pentest Reporting** — প্রফেশনাল রিপোর্ট স্ট্রাকচার, CVSS scoring, remediation পরামর্শ

## হ্যাকার মেথডোলজি

প্রতিটি engagement এই সাইকেল অনুসরণ করে। কোনো টুল ছোঁয়ার আগেই এটি আত্মস্থ করুন:

```
Reconnaissance  →  Scanning  →  Exploitation  →  Post-Exploitation  →  Reporting
      ↑                                                                      ↓
      └────────────────────── Iterate per finding ──────────────────────────┘
```

**সবসময় আগে recon।** বেশিরভাগ বিগিনার সরাসরি scanning-এ চলে যায়। প্রফেশনালরা তাদের সময়ের 40% শুধু recon-এই ব্যয় করে — টার্গেট ছোঁয়ার আগে যত বেশি জানবেন, তত কম শব্দ (noise) তৈরি করবেন।

## আইনি কাঠামো

প্রতিটি engagement-এর আগে:

- লিখিত **scope document** যেখানে অনুমোদিত IP range, domain, ও method সংজ্ঞায়িত থাকবে
- স্বাক্ষরিত **rules of engagement**, ইমার্জেন্সি কন্টাক্ট সহ
- লাইভ সিস্টেম আক্রান্ত হলে **emergency stop** পদ্ধতি

উদ্দেশ্য যাই হোক না কেন, লিখিত অনুমতি ছাড়া হ্যাকিং একটি অপরাধ। US-এ: Computer Fraud and Abuse Act (CFAA)। UK-তে: Computer Misuse Act। EU-তে: Directive 2013/40/EU।

আইনি প্র্যাকটিসের জন্য এই প্ল্যাটফর্মগুলো ব্যবহার করুন:

- **TryHackMe** — গাইডেড রুম, বিগিনার-ফ্রেন্ডলি
- **HackTheBox** — বাস্তবসম্মত মেশিন, intermediate+
- **VulnHub** — ডাউনলোডযোগ্য VM, অফলাইন প্র্যাকটিস
- **DVWA** — ইচ্ছাকৃতভাবে vulnerable ওয়েব অ্যাপ, লোকাল ইনস্টল
- **PentesterLab** — সমাধান সহ web-focused এক্সারসাইজ
