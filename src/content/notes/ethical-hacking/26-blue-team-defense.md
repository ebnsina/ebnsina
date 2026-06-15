---
title: "Blue Team & Defense"
subtitle: "SIEM, IDS/IPS, SOC operations, detection engineering, threat hunting, hardening guides, and the defender's toolkit."
chapter: 26
level: "intermediate"
readingTime: "14 min"
topics: ["blue team", "SIEM", "IDS", "IPS", "SOC", "detection engineering", "hardening", "threat hunting", "Splunk", "Elastic", "Snort"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Offense wins games, defense wins championships. Red team finds the holes; blue team patches them, detects future attacks, and contains breaches before they become catastrophic. The best defenders have thought like attackers.

</Callout>

## The SOC (Security Operations Center)

```
Tier 1 — Alert Triage
  → Monitor SIEM for alerts
  → Initial investigation: false positive or real?
  → Escalate confirmed incidents

Tier 2 — Incident Response
  → Deep-dive investigation
  → Forensic analysis
  → Contain and remediate

Tier 3 — Threat Hunting / Detection Engineering
  → Proactively hunt for attackers who evaded detection
  → Write new detection rules from threat intelligence
  → Build automation to reduce Tier 1 burden
```

## SIEM (Security Information and Event Management)

SIEM aggregates logs from across infrastructure and correlates them for detection.

### Splunk

```
# Splunk Search Processing Language (SPL)

# Find failed SSH logins
index=linux_logs sourcetype=syslog "Failed password"
| stats count by src_ip, user
| sort -count
| where count > 50   ← likely brute force

# Detect successful login after many failures (brute force success)
index=linux_logs sourcetype=syslog ("Failed password" OR "Accepted password")
| rex field=_raw "(?:Failed|Accepted) password for (?<user>\w+) from (?<src_ip>\S+)"
| eval status = if(searchmatch("Accepted"), "success", "failure")
| sort _time
| streamstats count(eval(status="failure")) as failures, 
              count(eval(status="success")) as successes by src_ip
| where successes > 0 AND failures > 5

# Detect PowerShell encoded commands (attacker tradecraft)
index=windows_logs EventCode=4688
| search CommandLine="*-enc*" OR CommandLine="*EncodedCommand*"
| table _time, ComputerName, Account_Name, CommandLine

# Rare parent-child process combinations
index=windows_logs EventCode=4688
| stats count by ParentProcessName, ProcessName
| sort count
| where count < 3   ← uncommon combinations may be suspicious
```

### Elastic / OpenSearch (ELK Stack)

```json
// Elasticsearch query — find lateral movement
GET /security-*/_search
{
  "query": {
    "bool": {
      "must": [
        {"term": {"event.code": "4648"}},
        {"range": {"@timestamp": {"gte": "now-24h"}}}
      ],
      "filter": [
        {"not": {"term": {"winlog.event_data.TargetServerName": "localhost"}}}
      ]
    }
  },
  "aggs": {
    "by_source": {
      "terms": {"field": "source.ip"},
      "aggs": {
        "by_target": {"terms": {"field": "destination.ip"}}
      }
    }
  }
}
```

## IDS/IPS

### Snort — Network IDS

```bash
# Install Snort
sudo apt install snort

# Snort rules syntax
# alert tcp any any -> any 4444 (msg:"Reverse Shell Detected"; sid:1000001; rev:1;)
# action protocol src_ip src_port direction dst_ip dst_port (options)

# Sample rules file /etc/snort/rules/local.rules:

# Detect Metasploit Meterpreter HTTPS beacon (pattern in SSL certificate)
alert tcp any any -> any 443 (msg:"Meterpreter HTTPS C2"; \
  content:"|00 15 00 00 01 00|"; depth:6; sid:1000010;)

# Detect Nmap SYN scan (many SYNs, few responses)
# (better handled by threshold rules)

# Detect credential harvesting (many failed logins)
alert tcp any any -> $HOME_NET 22 (msg:"SSH Brute Force"; \
  flow:to_server; content:"SSH"; detection_filter:track by_src, count 5, seconds 60; \
  sid:1000020;)

# Run Snort
sudo snort -A console -i eth0 -c /etc/snort/snort.conf
```

### Suricata — Modern IDS/IPS

```yaml
# /etc/suricata/rules/local.rules

# Detect PowerShell download cradle
alert http any any -> any any (msg:"PowerShell Download Cradle"; \
  content:"DownloadString"; http.uri; nocase; \
  content:"powershell"; http.user_agent; nocase; \
  sid:9000001; rev:1;)

# Detect DNS tunneling (long query labels)
alert dns any any -> any any (msg:"Possible DNS Tunneling"; \
  dns.query; pcre:"/^.{50}/"; sid:9000002;)

# Detect Cobalt Strike HTTP profile
alert http any any -> any any (msg:"Cobalt Strike Default Profile"; \
  content:"/dpixel"; http.uri; sid:9000003;)
```

## Hardening Guides

### Linux Server Hardening

```bash
# SSH hardening (/etc/ssh/sshd_config)
PermitRootLogin no
PasswordAuthentication no     # key-only auth
AllowUsers deployer admin     # whitelist users
MaxAuthTries 3
Protocol 2                    # no SSHv1
X11Forwarding no
AllowTcpForwarding no         # unless needed
ClientAliveInterval 300
ClientAliveCountMax 2

# Reload
sudo systemctl reload sshd

# Firewall (ufw)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Fail2ban — automatic IP banning after failed auth
sudo apt install fail2ban
# /etc/fail2ban/jail.local:
[sshd]
enabled = true
maxretry = 5
bantime = 3600   # ban 1 hour
findtime = 600   # 5 failures in 10 minutes

# Kernel hardening (/etc/sysctl.conf)
kernel.randomize_va_space = 2        # enable ASLR
net.ipv4.conf.all.rp_filter = 1    # IP spoofing protection
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.log_martians = 1  # log suspicious packets
kernel.dmesg_restrict = 1           # restrict dmesg to root

# Apply
sudo sysctl -p

# CIS Benchmark compliance check
# Download CIS-CAT or use Lynis (free)
sudo apt install lynis
sudo lynis audit system

# AppArmor — mandatory access control
sudo aa-status
sudo aa-enforce /etc/apparmor.d/*    # enforce all profiles
```

### Windows Server Hardening

```powershell
# Disable unnecessary services
Get-Service | Where-Object {$_.StartType -eq 'Automatic'} | Format-Table
Stop-Service -Name Telnet -Force
Set-Service -Name Telnet -StartupType Disabled

# Windows Defender Firewall
netsh advfirewall firewall add rule name="Block RDP" protocol=TCP dir=in localport=3389 action=block

# Enable audit policies
auditpol /set /subcategory:"Logon" /success:enable /failure:enable
auditpol /set /subcategory:"Process Creation" /success:enable
auditpol /set /subcategory:"Account Lockout" /failure:enable

# Enable PowerShell Script Block Logging
# HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging" \
  -Name "EnableScriptBlockLogging" -Value 1

# LAPS — Local Administrator Password Solution
# Randomizes local admin passwords per machine
Import-Module AdmPwd.PS
Set-AdmPwdComputerSelfPermission -OrgUnit "Workstations"
```

## Detection Engineering

Writing detection rules from threat intelligence:

```python
# Detection rule development process:
# 1. Understand the attack technique (MITRE ATT&CK)
# 2. Identify what data sources log it (Event logs, network logs, EDR)
# 3. Write a query that detects it
# 4. Tune to reduce false positives
# 5. Test against known good and known bad data

# Example: Detecting Kerberoasting (T1558.003)
# What it does: request TGS tickets for SPNs
# What logs it: Event ID 4769 (Kerberos Service Ticket Request)
# Suspicious indicators:
#   - Encryption type 0x17 (RC4) — modern SPN auth uses AES
#   - Many requests from same source in short time

# Splunk query:
# index=windows EventCode=4769 Ticket_Encryption_Type=0x17
# NOT Account_Name="*$"   ← exclude machine accounts
# | stats count by Account_Name, Client_Address
# | where count > 10    ← threshold to reduce noise
```

## Threat Intelligence

```bash
# IOC (Indicator of Compromise) types:
# - IP addresses (C2 servers)
# - Domain names (phishing, C2)
# - File hashes (malware samples)
# - Email addresses (phishing senders)
# - URL patterns (phishing pages)
# - Registry keys (persistence indicators)
# - Mutex names (malware family identifier)

# IOC sources:
# - AlienVault OTX (otx.alienvault.com) — free
# - MISP (misp-project.org) — open source platform
# - VirusTotal Intelligence (paid)
# - Threatfox.abuse.ch — malware IOCs
# - URLhaus.abuse.ch — malicious URLs

# Integrate with firewall/proxy
# Import IP blocklist into pfSense/Palo Alto
# Import domain blocklist into DNS resolver (Pi-hole, bind)

# Automated IOC enrichment
pip install pymisp
from pymisp import PyMISP
misp = PyMISP(misp_url, misp_key)
results = misp.search('attributes', value='malicious-domain.com')
```

## Security Baselines and Compliance

```bash
# CIS Benchmarks — security configuration standards
# cisecurity.org/cis-benchmarks/
# Download the relevant benchmark (Linux, Windows, Docker, K8s)

# Automated compliance checking:
# Lynis — Linux
sudo lynis audit system --quick

# OpenSCAP — SCAP protocol compliance
sudo apt install openscap-scanner scap-security-guide
oscap xccdf eval --profile xccdf_org.ssgproject.content_profile_cis \
  --report report.html /usr/share/xml/scap/ssg/content/ssg-ubuntu2004-ds.xml

# Inspec — HashiCorp compliance automation
chef gem install inspec
inspec exec https://github.com/dev-sec/linux-baseline

# Trivy — container compliance
trivy image --compliance docker-cis nginx:1.21
```

## Threat Modeling

```
STRIDE framework for threat modeling:
  S → Spoofing identity
  T → Tampering with data
  R → Repudiation (denying actions)
  I → Information disclosure
  D → Denial of service
  E → Elevation of privilege

Process:
  1. Create data flow diagram (DFD)
  2. Identify trust boundaries
  3. Apply STRIDE to each component
  4. Score threats (DREAD: Damage, Reproducibility, Exploitability, Affected users, Discoverability)
  5. Mitigate high-priority threats
  6. Update with each feature change

Tools: OWASP Threat Dragon, Microsoft Threat Modeling Tool
```

