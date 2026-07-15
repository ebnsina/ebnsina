---
title: 'Scanning & Enumeration'
subtitle: 'Nmap দক্ষতা, service fingerprinting, banner grabbing, এবং SMB, FTP, SNMP ও web directory enumerate করা।'
chapter: 4
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['nmap', 'scanning', 'enumeration', 'SMB', 'FTP', 'SNMP', 'banner grabbing', 'gobuster']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

কোনো বিল্ডিংয়ে ঢোকার আগে আপনি চারপাশ ঘুরে দেখেন: কোন দরজাগুলো আছে, কোনগুলো তালাবদ্ধ, কী ধরনের তালা, ক্যামেরা আছে কিনা, গার্ডের শিডিউল কেমন। Scanning হলো এর ডিজিটাল সমতুল্য — প্রবেশের চেষ্টা করার আগে পদ্ধতিগত পেরিমিটার মূল্যায়ন।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরি একটা বড় পুরনো ভবনের অনুমোদিত বিল্ডিং ইনস্পেক্টর। মালিক তাকে ডেকেছেন — ভবনটা কতটা খোলামেলা, কোথা দিয়ে কেউ ঢুকে পড়তে পারে, সেটা বের করতে। ফাতিমা প্রথমে পুরো পেরিমিটার ঘুরে হাঁটেন, একটা কাগজে প্রতিটা দরজা আর জানালার ম্যাপ আঁকেন, আর প্রতিটার পাশে টুকে রাখেন — এটা খোলা, ওটা বন্ধ, পেছনের এই জানালাটা আলগা। শুধু কোনটা খোলা আর কোনটা বন্ধ, এইটুকুই তার প্রথম কাজ।

তারপর প্রতিটা খোলা দরজা-জানালার সামনে দাঁড়িয়ে ইবনে সিনা, তার সহকারী, খুঁটিয়ে দেখেন — এই দরজায় কী ধরনের তালা, পুরনো নাকি নতুন মডেল, ভেতরে কী ঘর, কে ব্যবহার করে, ছাদের চাবি কার কাছে। সব মিলিয়ে তারা একটা পূর্ণ ইনভেন্টরি বানান — কোন কোন ফাঁক খোলা আছে আর প্রতিটার পেছনে ঠিক কী আছে। এই তালিকা হাতে পেয়ে মালিক এবার সিদ্ধান্ত নিতে পারেন কোন দরজাগুলো আসলে খোলা থাকার দরকার নেই, কোনগুলো বন্ধ করে দেবেন।

এই গল্পটাই আসলে **scanning** আর **enumeration**। কোন দরজা-জানালা খোলা সেটা ম্যাপ করা মানে টার্গেটের কোন **port**/**service** খোলা তা বের করা — এটাই scanning। এরপর প্রতিটা খোলা জায়গার তালার ধরন, ভেতরে কী, কে ব্যবহার করে — এসব বিস্তারিত টুকে রাখা মানে প্রতিটা service-এর version, ব্যবহারকারী, share ইত্যাদি **enumerate** করা। আর পুরো খোলা ফাঁকের ইনভেন্টরিটাই হলো **attack surface**-এর ম্যাপ। বাস্তবে ঠিক এভাবেই একজন authorised pentester Nmap দিয়ে খোলা port খুঁজে বের করেন, তারপর service fingerprint করে বিস্তারিত জোগাড় করেন — যেন প্রতিষ্ঠান জানতে পারে ঠিক কোন কোন জায়গা বন্ধ করে attack surface ছোট করা দরকার।

## Nmap — Scanning স্ট্যান্ডার্ড

Nmap একজন pentester-এর টুলকিটে সবচেয়ে গুরুত্বপূর্ণ টুল। এটি গভীরভাবে শিখুন।

### Scan Types

```bash
# SYN scan (default, requires root, fast, less visible)
sudo nmap -sS 192.168.1.100

# TCP connect scan (no root needed, more visible, logged)
nmap -sT 192.168.1.100

# UDP scan (slow, important — many services run UDP-only)
sudo nmap -sU -p 53,67,68,69,123,161,500 192.168.1.100

# Version detection — identify service + version
sudo nmap -sV 192.168.1.100

# OS detection
sudo nmap -O 192.168.1.100

# Aggressive scan (OS + version + scripts + traceroute)
sudo nmap -A 192.168.1.100
```

### Port Ranges

```bash
# Top 100 ports (fast, good first pass)
nmap -F 192.168.1.100

# All 65535 ports (slow but thorough)
nmap -p- 192.168.1.100

# Specific ports
nmap -p 22,80,443,445,3306 192.168.1.100

# Port range
nmap -p 1-1024 192.168.1.100
```

### Speed ও Timing

```bash
# Timing templates: -T0 (paranoid) to -T5 (insane)
# T3 = default, T4 = fast (use in labs), T5 = fastest (noisy)
nmap -T4 192.168.1.100

# Reduce speed for IDS evasion
nmap -T1 --max-retries 1 192.168.1.100

# Scan a subnet
nmap -sn 192.168.1.0/24           # ping sweep only
nmap 192.168.1.0/24               # scan all live hosts
nmap -iL targets.txt              # scan list of hosts
```

### Nmap Scripting Engine (NSE)

NSE-ই Nmap-কে একটি সাধারণ port scanner থেকে আলাদা করে। Script গুলো প্রতিটি service-এর জন্য নির্দিষ্ট check অটোমেট করে।

```bash
# Default scripts
nmap -sC 192.168.1.100

# Specific script
nmap --script smb-vuln-ms17-010 192.168.1.100

# Script category
nmap --script vuln 192.168.1.100        # all vulnerability scripts
nmap --script auth 192.168.1.100        # check for default credentials
nmap --script brute 192.168.1.100       # brute-force services
nmap --script discovery 192.168.1.100   # network discovery

# Find scripts for a service
ls /usr/share/nmap/scripts/ | grep smb
ls /usr/share/nmap/scripts/ | grep http
```

### সম্পূর্ণ Pentest Scan Workflow

```bash
# Phase 1: Quick discovery
sudo nmap -sn 192.168.1.0/24 -oG ping-sweep.txt
grep "Up" ping-sweep.txt | awk '{print $2}' > live-hosts.txt

# Phase 2: Fast port scan on all live hosts
sudo nmap -T4 -F -iL live-hosts.txt -oG fast-scan.txt

# Phase 3: Full port scan on interesting hosts
sudo nmap -p- -T4 192.168.1.100 -oN full-scan.txt

# Phase 4: Version + scripts on open ports
open_ports=$(grep "open" full-scan.txt | awk -F/ '{print $1}' | paste -sd,)
sudo nmap -sV -sC -p$open_ports 192.168.1.100 -oN detailed-scan.txt

# Output formats: -oN (normal), -oG (grepable), -oX (XML), -oA (all three)
```

## Service Enumeration

### FTP (Port 21)

```bash
# Check for anonymous login
nmap --script ftp-anon 192.168.1.100 -p 21

# Manual anonymous login
ftp 192.168.1.100
# Username: anonymous
# Password: anything@email.com

# Commands once logged in
ftp> ls -la       # list files
ftp> get file.txt # download file
ftp> put shell.php # upload file (if write permission)
ftp> binary       # binary mode for non-text files
ftp> mget *       # download all files
```

যদি anonymous login অনুমোদিত হয় এবং আপনি লিখতে পারেন, তাহলে FTP root-ই web root হলে একটি web shell আপলোড করুন।

### SSH (Port 22)

```bash
# Banner grab — reveals server version
nc 192.168.1.100 22
# SSH-2.0-OpenSSH_7.4 ← version, check CVEs

# Check for weak algorithms (old configs)
nmap --script ssh2-enum-algos 192.168.1.100 -p 22

# Try default credentials
hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://192.168.1.100

# Check for SSH keys left in home dirs (post-compromise)
find / -name "id_rsa" 2>/dev/null
find / -name "authorized_keys" 2>/dev/null
```

### SMB (Ports 139, 445)

SMB হলো সবচেয়ে সমৃদ্ধ Windows enumeration টার্গেট।

```bash
# List shares (null session)
smbclient -L //192.168.1.100 -N
smbclient -L //192.168.1.100 -U "username%password"

# Full enumeration
enum4linux -a 192.168.1.100
# Returns: users, shares, groups, OS info, password policy

# Nmap SMB scripts
nmap --script smb-enum-shares,smb-enum-users,smb-os-discovery 192.168.1.100 -p 445

# Check for EternalBlue (MS17-010)
nmap --script smb-vuln-ms17-010 192.168.1.100 -p 445

# Connect to a share
smbclient //192.168.1.100/SHARE -U "username%password"
smb: \> ls
smb: \> get secret.txt

# Mount share locally
sudo mount -t cifs //192.168.1.100/SHARE /mnt/smb -o user=username,pass=password
```

### SNMP (Port 161 UDP)

SNMP v1 এবং v2c একমাত্র auth mechanism হিসেবে community string ("public" হলো ডিফল্ট) ব্যবহার করে। একবার community string পেলে আপনি পুরো MIB পড়তে পারবেন — network interface, running process, ইনস্টল করা software, ARP table।

```bash
# Enumerate with community string "public"
snmpwalk -c public -v1 192.168.1.100
snmpwalk -c public -v2c 192.168.1.100

# Specific OIDs
snmpwalk -c public -v2c 192.168.1.100 1.3.6.1.2.1.1        # system info
snmpwalk -c public -v2c 192.168.1.100 1.3.6.1.2.1.25.4.2   # running processes
snmpwalk -c public -v2c 192.168.1.100 1.3.6.1.2.1.6.13.1.3 # TCP connections

# Brute-force community string
onesixtyone -c /usr/share/seclists/Discovery/SNMP/common-snmp-community-strings.txt 192.168.1.100

# Full snmp scan with nmap
nmap -sU -p 161 --script snmp-info,snmp-sysdescr,snmp-processes 192.168.1.100
```

### MySQL / PostgreSQL (Ports 3306 / 5432)

```bash
# Connect (if exposed)
mysql -h 192.168.1.100 -u root -p
mysql -h 192.168.1.100 -u root   # try without password

# Once in:
mysql> show databases;
mysql> use information_schema;
mysql> select table_name from tables where table_schema = 'targetdb';
mysql> select * from users;

# Nmap scripts
nmap --script mysql-info,mysql-databases,mysql-empty-password 192.168.1.100 -p 3306

# PostgreSQL
psql -h 192.168.1.100 -U postgres
```

### Web Directory Brute Force

```bash
# Gobuster — fast Go-based directory brute forcer
gobuster dir -u http://192.168.1.100 -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -t 50

# Add file extensions
gobuster dir -u http://192.168.1.100 \
  -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt \
  -x php,html,txt,bak,old,conf,config,xml,json \
  -t 50

# Feroxbuster — recursive, faster
feroxbuster -u http://192.168.1.100 -w /usr/share/wordlists/raft-medium-directories.txt -x php,html,txt

# FFuf — ultra flexible fuzzer
ffuf -u http://192.168.1.100/FUZZ -w /usr/share/wordlists/common.txt
ffuf -u http://192.168.1.100/FUZZ.php -w /usr/share/wordlists/common.txt

# Interesting paths to check for:
# /admin, /administrator, /wp-admin, /phpmyadmin
# /api, /api/v1, /api/v2
# /.git, /.env, /config.php, /web.config
# /backup, /backup.zip, /db.sql
# /server-status (Apache), /nginx_status
```

## Banner Grabbing

Banner সফটওয়্যার ও ভার্সন প্রকাশ করে। ভার্সন → CVE সার্চ।

```bash
# Netcat banner grab
nc 192.168.1.100 21   # FTP
nc 192.168.1.100 22   # SSH
nc 192.168.1.100 25   # SMTP
nc 192.168.1.100 80   # HTTP (send a request first)

# HTTP
curl -I http://192.168.1.100           # response headers
curl -I http://192.168.1.100 -A "Mozilla/5.0"  # with user-agent

# Look for:
# Server: Apache/2.4.29 (Ubuntu)
# X-Powered-By: PHP/7.2.1
# X-Generator: Drupal 8

# Automated banner grab
nmap -sV --version-intensity 9 192.168.1.100

# Whatweb — web tech fingerprinting
whatweb http://192.168.1.100
```

## Vulnerability Scanner: Nikto

```bash
# Nikto — web server vulnerability scanner
nikto -h http://192.168.1.100
nikto -h https://example.com -ssl
nikto -h http://192.168.1.100 -output nikto-report.txt

# Finds:
# - Default files and configs
# - Outdated software versions
# - Common misconfigurations
# - Interesting headers missing (no HSTS, no X-Frame-Options)
```

## Finding গোছানো

Scanning-এর পর, ঝুঁকি অনুযায়ী গুছিয়ে নিন:

```markdown
## Scan Results: 192.168.1.100

### Open Ports

| Port | Service | Version       | Notes                                |
| ---- | ------- | ------------- | ------------------------------------ |
| 21   | FTP     | vsftpd 2.3.4  | **Anonymous login enabled**          |
| 22   | SSH     | OpenSSH 7.4   | Check CVE-2018-15473 user enum       |
| 80   | HTTP    | Apache 2.4.29 | /admin accessible, /backup.zip found |
| 445  | SMB     | Samba 4.6.3   | Null session allowed                 |
| 3306 | MySQL   | 5.7.30        | Exposed to internet                  |

### Critical Findings

1. FTP anonymous login → browse and download files
2. /backup.zip → may contain source code/credentials
3. MySQL exposed → try root with no password
4. vsftpd 2.3.4 → known backdoor (CVE-2011-2523) — test Metasploit module

### Next Steps

- [ ] Download backup.zip, inspect contents
- [ ] Run `exploit/unix/ftp/vsftpd_234_backdoor` in Metasploit
- [ ] Test MySQL: `mysql -h 192.168.1.100 -u root`
- [ ] Run smb enum: `enum4linux -a 192.168.1.100`
```
