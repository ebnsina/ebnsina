---
title: 'Scanning & Enumeration'
subtitle: 'Nmap mastery, service fingerprinting, banner grabbing, and enumerating SMB, FTP, SNMP, and web directories.'
chapter: 4
level: 'beginner'
readingTime: '14 min'
topics: ['nmap', 'scanning', 'enumeration', 'SMB', 'FTP', 'SNMP', 'banner grabbing', 'gobuster']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Before breaking into a building, you walk the perimeter: which doors exist, which are locked, what kind of locks, are there cameras, is there a guard schedule. Scanning is the digital equivalent — methodical perimeter assessment before you attempt entry.

</Callout>

## Nmap — The Scanning Standard

Nmap is the most important tool in a pentester's kit. Learn it deeply.

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

### Speed and Timing

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

NSE is what separates Nmap from a basic port scanner. Scripts automate specific checks per service.

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

### Full Pentest Scan Workflow

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

If anonymous login is allowed and you can write, upload a web shell if the FTP root is the web root.

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

SMB is the richest Windows enumeration target.

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

SNMP v1 and v2c use community strings ("public" is default) as the only auth mechanism. Once you have the community string, you can read the entire MIB — network interfaces, running processes, installed software, ARP table.

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

Banners reveal software and version. Version → CVE search.

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

## Organizing Findings

After scanning, organize by risk:

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
