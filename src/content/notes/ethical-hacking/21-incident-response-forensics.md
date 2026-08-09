---
title: 'ইনসিডেন্ট রেসপন্স ও ডিজিটাল ফরেনসিক্স'
subtitle: 'Volatility দিয়ে মেমরি ফরেনসিক্স, ডিস্ক ইমেজিং, টাইমলাইন অ্যানালাইসিস, লগ অ্যানালাইসিস, এবং ডিটেকশন থেকে রেমিডিয়েশন পর্যন্ত IR লাইফসাইকেল।'
chapter: 21
level: 'advanced'
readingTime: '14 মিনিট'
topics:
  [
    'ইনসিডেন্ট রেসপন্স',
    'ডিজিটাল ফরেনসিক্স',
    'Volatility',
    'মেমরি ফরেনসিক্স',
    'ডিস্ক ফরেনসিক্স',
    'DFIR',
    'টাইমলাইন অ্যানালাইসিস',
    'লগ অ্যানালাইসিস'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

শহরের বাজারে ফাতিমা আল-ফিহরির গয়নার দোকানে সকালে ঢুকে দেখা গেল — সিন্দুক খোলা, হিসাবের খাতা উধাও। মালিক চেঁচামেচি শুরুর আগেই ডাকা হলো ঝানু গোয়েন্দা আল-খোয়ারিজমিকে। সে এসেই প্রথমে কাউকে ভেতরে ঢুকতে দিল না — দরজায় দড়ি টানিয়ে পুরো দোকান সিল করে দিল, যাতে কেউ হাঁটাচলা করে মেঝের কাদা-পায়ের ছাপ বা সিন্দুকের আঁচড় নষ্ট না করে ফেলে। আগে দৃশ্যটা যেমন আছে ঠিক তেমনই রক্ষা করা, তারপর তদন্ত।

এবার সে ধীরে ধীরে ক্লু জোড়া লাগাতে লাগল। পেছনের জানালার ছিটকিনি ভাঙা, বাইরের কাদায় রাত দুটোর দিকের তাজা পায়ের ছাপ — মানে ঢোকার পথ ওটাই। কাদামাখা ছাপ সোজা গেছে সিন্দুক পর্যন্ত, আর হিসাবের খাতাটাই শুধু নেই — মানে চোর ঠিক কী নিয়েছে সেটাও পরিষ্কার। প্রতিটা প্রমাণ — ভাঙা ছিটকিনি, ছাপের ছবি, সিন্দুকের আঁচড় — সে আলাদা থলিতে ভরে, তারিখ-সময় লিখে সিলগালা করল, যাতে আদালতে দাঁড়ালে কেউ বলতে না পারে "এটা তো পরে বসানো"। শেষে দোকানি জানালায় শক্ত গ্রিল লাগিয়ে সেই ফাঁকটাই বন্ধ করল, যেটা দিয়ে চোর ঢুকেছিল।

এই গল্পটাই আসলে **incident response** ও **forensics**। breach-এর পর গোয়েন্দার দোকান সিল করা মানে **containment** — বাড়তি ক্ষতি থামানো — আর দৃশ্য অবিকৃত রাখা মানে **evidence** preserve করা (রিবুট বা তাড়াহুড়ো করলে ভোলাটাইল প্রমাণ মুছে যায়)। ক্লু থেকে "রাত দুটোয় জানালা দিয়ে ঢুকে খাতা নিয়েছে" সাজানোটাই **timeline** analysis — entry point আর attacker কী কী করেছে সেটা পুনর্গঠন। সিলগালা করা থলি আর তারিখ লেখা হলো **chain of custody** — প্রমাণ কার হাতে কখন ছিল তার নিরবচ্ছিন্ন হিসাব, যাতে তা বিশ্বাসযোগ্য থাকে। আর জানালায় গ্রিল লাগানো মানে recover করা ও ওই গ্যাপ বন্ধ করে recurrence ঠেকানো। বাস্তবে ঠিক এভাবেই DFIR টিম কাজ করে — আগে contain, তারপর disk image আর memory dump নিয়ে অবিকৃত প্রমাণ থেকে হামলার timeline বানায়, chain of custody মেনে; শুধু তারপরই সিস্টেম clean করে ঢোকার পথ বন্ধ করে।

<Callout type="info">

**Real-World Analogy**

একজন ক্রাইম সিন ইনভেস্টিগেটর ছবি তোলার আগে জায়গা পরিষ্কার করে না — তারা প্রথমে সবকিছু যেমন আছে তেমনভাবে ডকুমেন্ট করে। ডিজিটাল ফরেনসিক্সও একইভাবে কাজ করে: কোনো অ্যাকশন নেওয়ার আগে এভিডেন্স প্রিজার্ভ করতে হয়, কারণ কম্প্রোমাইজড মেশিন রিবুট করলে ভোলাটাইল ডেটা নষ্ট হয়ে যায়।

</Callout>

## IR লাইফসাইকেল

```
1. Preparation    → SIEM, logging, runbooks, IR plan before incidents happen
2. Detection      → alert fires, anomaly detected, user reports something
3. Containment    → stop the bleeding without destroying evidence
4. Eradication    → remove malware, close the attack vector
5. Recovery       → restore systems, verify clean state
6. Lessons Learned → postmortem, detection improvements
```

## এভিডেন্স প্রিজার্ভেশন (Order of Volatility)

সবচেয়ে ভোলাটাইল এভিডেন্স আগে কালেক্ট করো — মেশিন পাওয়ার অফ বা রিবুট হলে এগুলো হারিয়ে যায়:

```
1. CPU registers, CPU cache         (disappears in microseconds)
2. Memory (RAM)                     (disappears on reboot)
3. Network connections, ARP cache   (changes constantly)
4. Running processes                (changes constantly)
5. Filesystem metadata (mtimes)     (changes on access)
6. Disk image                       (stable, but do it early)
7. Remote logs                      (stable, but may be rotated)
8. Backups, archived data           (stable)
```

**ইমেজিং করার আগে এগুলো কখনো করবে না:**

- মেশিন রিবুট করা
- অ্যান্টিভাইরাস চালানো (টাইমস্ট্যাম্প মডিফাই করে, এভিডেন্স ডিলিট করে দিতে পারে)
- লাইভ সিস্টেমে টুল ইনস্টল করা (ফাইলসিস্টেম মডিফাই করে)

## মেমরি অ্যাকুইজিশন

```bash
# Linux — dump RAM
sudo apt install lime-forensics-dkms  # LiME (Linux Memory Extractor)
sudo insmod lime.ko "path=/mnt/usb/memory.lime format=lime"

# Or: /dev/mem (not always accessible)
sudo dd if=/dev/mem of=/mnt/usb/memory.raw bs=1M

# Windows
# WinPmem (open source)
winpmem.exe -o memory.raw

# DumpIt (GUI, commercial)
# RAM Map by Sysinternals
```

## Volatility — মেমরি অ্যানালাইসিস

মেমরি ডাম্প অ্যানালাইজ করার জন্য Volatility হলো স্ট্যান্ডার্ড টুল।

```bash
# Install Volatility 3
pip install volatility3

# Identify OS profile (Volatility 2) / auto-detect (Volatility 3)
vol.py -f memory.dmp imageinfo   # v2
python3 vol.py -f memory.dmp windows.info  # v3

# Process listing
python3 vol.py -f memory.dmp windows.pslist
python3 vol.py -f memory.dmp windows.pstree   # tree view (shows parent-child)
python3 vol.py -f memory.dmp windows.cmdline  # command line arguments

# Find suspicious processes:
# - svchost.exe without parent services.exe
# - cmd.exe or powershell.exe with unusual parent
# - Process with random-looking name (malware disguise)
# - Multiple instances of single-instance processes (explorer.exe, lsass.exe)

# Network connections
python3 vol.py -f memory.dmp windows.netstat
# Look for: unknown processes with outbound connections, unusual ports

# Injected code detection
python3 vol.py -f memory.dmp windows.malfind
# Finds memory regions: readable+writable+executable (RWX) → typical injection
# or private memory with PE headers (process injection)

# Dump a suspicious process
python3 vol.py -f memory.dmp windows.dumpfiles --pid 1234

# Registry hives
python3 vol.py -f memory.dmp windows.registry.hivelist
python3 vol.py -f memory.dmp windows.registry.printkey --key "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"

# Dump LSASS → extract credentials offline
python3 vol.py -f memory.dmp windows.dumpfiles --pid <lsass_pid>
pypykatz lsa minidump lsass.dmp   # extract credentials from dump
```

```bash
# Linux memory analysis
python3 vol.py -f memory.lime linux.pslist
python3 vol.py -f memory.lime linux.bash     # bash history in memory
python3 vol.py -f memory.lime linux.netstat
python3 vol.py -f memory.lime linux.malfind
python3 vol.py -f memory.lime linux.check_syscall  # detect syscall table hooks (rootkits)
```

## ডিস্ক ফরেনসিক্স

```bash
# Create forensic image (never work on original)
sudo dd if=/dev/sda of=/mnt/evidence/disk.img bs=4M status=progress
# Or: dc3dd, dcfldd (with hashing + progress)
sudo dc3dd if=/dev/sda of=/mnt/evidence/disk.img hash=sha256 hof=/mnt/evidence/disk.sha256

# Mount image read-only
sudo mount -o ro,noatime,loop disk.img /mnt/analysis/

# FTK Imager (Windows GUI) — creates E01 format with hash verification

# Autopsy — cross-platform forensic GUI
# Open source, import disk image
# Analyzes: deleted files, browser history, USB history, recent files, registry
```

## টাইমলাইন অ্যানালাইসিস

```bash
# Create filesystem timeline (MACtime — Modified, Accessed, Created)
# mactime from Sleuth Kit
fls -r -m / disk.img > timeline.body   # bodyfile format
mactime -b timeline.body -d 2024-01-01 > timeline.txt

# Filter for interesting timeframe (attack window)
grep "2024-01-15" timeline.txt | grep -iE "(bash_history|\.sh|\.py|authorized_keys)"

# Plaso (log2timeline) — comprehensive timeline from multiple sources
pip install plaso
log2timeline.py dump.plaso disk.img              # extract all artifacts
psort.py dump.plaso "date > '2024-01-15'"        # filter
pinfo.py dump.plaso                               # info about extracted data
```

## লগ অ্যানালাইসিস

### Linux সিস্টেম লগ

```bash
# Authentication events
/var/log/auth.log    # Ubuntu/Debian
/var/log/secure      # CentOS/RHEL

# SSH brute force detection
grep "Failed password" /var/log/auth.log | awk '{print $11}' | sort | uniq -c | sort -rn | head -20

# Successful logins
grep "Accepted password\|Accepted publickey" /var/log/auth.log

# Sudo usage
grep "sudo:" /var/log/auth.log

# Cron execution
/var/log/cron

# Kernel messages (useful for detecting rootkits, driver loads)
dmesg | tail -50

# Web access logs
/var/log/nginx/access.log
/var/log/apache2/access.log

# Find scanning activity in web logs
grep " 404 " /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn

# Find suspicious User-Agents
grep -iE "(sqlmap|nikto|nmap|masscan|dirbuster|gobuster)" /var/log/nginx/access.log
```

### Windows ইভেন্ট লগ

```powershell
# Key Windows Event IDs:
# 4624 → Successful logon
# 4625 → Failed logon
# 4648 → Logon with explicit credentials (Pass-the-Hash indicator)
# 4672 → Special privileges assigned (admin logon)
# 4688 → Process creation (requires Audit Process Tracking enabled)
# 4698 → Scheduled task created
# 4720 → User account created
# 4732 → User added to local admin group
# 7045 → New service installed

# View events (PowerShell)
Get-WinEvent -LogName Security -FilterHashtable @{Id=4625} |
  Select-Object TimeCreated, Message |
  Where-Object {$_.TimeCreated -gt (Get-Date).AddDays(-1)}

# Find lateral movement (network logons from unusual IPs)
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} |
  Where-Object { $_.Message -match 'Logon Type:\s+3' }

# Process creation log (requires enabling)
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688} |
  ForEach-Object { $_.Message } | Select-String "powershell|cmd|wscript|cscript"
```

## থ্রেট হান্টিং

যেসব অ্যাটাকার ডিটেকশন এড়িয়ে গেছে তাদের প্রোঅ্যাকটিভলি খোঁজা:

```bash
# Hunt for unusual scheduled tasks
schtasks /query /fo LIST /v | grep -E "(Task Name|Run As User|Task To Run)"

# Hunt for unusual services
sc query type= all | grep -v "RUNNING\|STOPPED"
Get-Service | Where-Object {$_.StartType -eq 'Automatic' -and $_.Status -ne 'Running'}

# Hunt for unusual network connections
ss -tulnp | grep -v -E "(22|80|443|8080)"    # ports besides common ones
netstat -ano | findstr ESTABLISHED             # Windows

# Hunt for processes with unusual parent
# powershell.exe spawned by Word.exe → phishing/macro execution
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688} |
  Where-Object {$_.Message -match "powershell" -and $_.Message -match "winword"}

# Hunt for base64 PowerShell (common in attacks)
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688} |
  Where-Object {$_.Message -match "-enc\s|EncodedCommand|-e\s[A-Za-z0-9+/=]{20}"}

# Hunt for credential dumping tools
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4688} |
  Where-Object {$_.Message -match "mimikatz|procdump|wce|fgdump|hashdump"}
```

## SIEM ও ডিটেকশন রুল

```yaml
# Sigma rule — vendor-neutral detection rule format
# Sigma → converts to Splunk SPL, Elastic Query, etc.

title: Suspicious PowerShell Encoded Command
status: stable
description: Detects PowerShell execution with encoded commands
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    EventID: 4688
    CommandLine|contains:
      - '-EncodedCommand'
      - '-enc '
      - '-e '
    Image|endswith:
      - '\powershell.exe'
      - '\pwsh.exe'
  condition: selection
falsepositives:
  - Some administrative scripts use encoded commands
level: medium
tags:
  - attack.execution
  - attack.t1059.001
```

## রিয়েল প্রজেক্ট: IR সিনারিও

```bash
# Scenario: Web server was compromised. Respond.

# 1. Take memory dump FIRST (volatile evidence)
sudo insmod lime.ko "path=/evidence/memory.lime format=lime"

# 2. Collect volatile state
ss -tulnp > /evidence/netstat.txt
ps aux > /evidence/processes.txt
who > /evidence/logged-in-users.txt
last > /evidence/login-history.txt
crontab -l > /evidence/root-crontab.txt
cat /var/spool/cron/crontabs/* > /evidence/all-crontabs.txt 2>/dev/null

# 3. Disk image (if offline acceptable, else live forensics)
sudo dc3dd if=/dev/sda of=/evidence/disk.img

# 4. Analyze memory
python3 vol.py -f /evidence/memory.lime linux.pslist | grep -v normal_processes

# 5. Timeline analysis
fls -r -m / /evidence/disk.img > /evidence/timeline.body
mactime -b /evidence/timeline.body -d "2024-01-15" | sort > /evidence/timeline.txt
# Look for: new files created, modified configs, new cron entries

# 6. Log analysis
grep "Jan 15" /var/log/auth.log | grep -E "(Accepted|Failed|sudo)"
grep "Jan 15" /var/log/nginx/access.log | grep -v "200\|304"

# 7. Find the webshell
find /var/www -name "*.php" -newer /var/www/html/index.php -mtime -7
strings suspicious.php | grep -iE "(system|exec|shell_exec|passthru|base64_decode)"

# 8. Contain: take system offline or block attacker IP
iptables -A INPUT -s ATTACKER_IP -j DROP

# 9. Eradicate: remove webshell, close vuln, patch
# 10. Recover: verify clean state, bring system back
# 11. Lessons learned: how did they get in? How do we detect it next time?
```
