---
title: 'CTF Strategy'
subtitle: 'Capture the Flag প্রতিযোগিতায় কীভাবে এগোবেন, ক্যাটাগরি ভাঙা, প্ল্যাটফর্ম এবং প্রতিটি চ্যালেঞ্জ টাইপের জন্য একটি methodology।'
chapter: 14
level: 'intermediate'
readingTime: '12 মিনিট'
topics:
  [
    'CTF',
    'Capture the Flag',
    'HackTheBox',
    'TryHackMe',
    'forensics',
    'reverse engineering',
    'crypto CTF',
    'pwn'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

CTF হলো স্প্যারিং — কাঠামোবদ্ধ, নিরাপদ, জানা সীমানার মধ্যে। আপনি একটি নিয়ন্ত্রিত পরিবেশে reflex, tooling-এর muscle memory এবং সমস্যা-সমাধানের প্যাটার্ন গড়ে তোলেন, যাতে আসল engagement পরিচিত মনে হয়।

</Callout>

## গল্পে বুঝি

মেলার মাঠে একটা গোছানো ট্রেজার-হান্ট প্রতিযোগিতা বসেছে। একটা বড় বোর্ডে সারি সারি ধাঁধা টাঙানো — প্রতিটা ধাঁধার পেছনে লুকানো একটা টোকেন, আর যে টিম যত বেশি টোকেন জোগাড় করবে সে-ই জিতবে। ফাতিমা আল-ফিহরির টিম শুরুতেই হুড়মুড় করে ঝাঁপিয়ে পড়ল না। ফাতিমা আগে পুরো বোর্ডটা একবার চোখ বুলিয়ে নিল — কোন ধাঁধা সহজ অথচ পয়েন্ট বেশি, কোনটা দেখতেই মনে হচ্ছে সময় খেয়ে ফেলবে।

তারপর সে কাজ ভাগ করে দিল। ইবনে সিনা সংখ্যা আর সংকেত ভালো বোঝে, তাই গণিতের ধাঁধাগুলো তার; আল-খোয়ারিজমি ছবি-ধাঁধায় পাকা, ওগুলো তার। সহজ অথচ বেশি-পয়েন্টের টোকেনগুলো তারা আগে তুলে নিল, আর মাঝের যে একটা ধাঁধা কেউ-ই কূল পাচ্ছিল না, ফাতিমা সেটা ছেড়ে দিয়ে বলল "এতে আটকে থেকে সময় নষ্ট করা যাবে না, শেষে সময় থাকলে দেখব।" সব কিছুই মেলার নিয়মের ভেতরে — এটা বুদ্ধি শানানোর খেলা, কারও গুদামে সিঁধ কাটা নয়।

এই গল্পটাই আসলে **CTF (Capture The Flag)**। ধাঁধার বোর্ড হলো একটা CTF, প্রতিটা টোকেন-লুকানো ধাঁধা হলো একেকটা **challenge**, আর লুকানো টোকেন হলো **flag**। পুরো বোর্ড আগে স্ক্যান করা, সহজ-বেশি-পয়েন্ট আগে তোলা, সময় খেয়ে ফেলা ধাঁধা বাদ দেওয়া, আর যে যেটায় সেরা তাকে সেটা দেওয়া — এই পুরোটাই **CTF strategy**: triage, time management আর team specialisation। আর মেলার নিয়মের ভেতরে থাকাটাই মূল কথা — CTF হলো নিরাপদ, বৈধ practice, বাস্তবে কারও সিস্টেমে আক্রমণ নয়। বাস্তবে picoCTF বা HackTheBox-এর মতো প্ল্যাটফর্মে ঠিক এভাবেই লোকে দক্ষতা গড়ে, যাতে আসল অনুমতি-নেওয়া pentest engagement পরিচিত মনে হয়।

## CTF Categories

```
Web          → SQLi, XSS, SSRF, authentication bypass, IDOR
Pwn / Binary → buffer overflow, format strings, heap exploitation
Reverse Eng  → decompile binaries, understand obfuscated code, crack keygens
Crypto       → break weak ciphers, decode custom encryption, attack protocols
Forensics    → extract data from images, pcaps, memory dumps, steganography
OSINT        → find information about a person/organization from public sources
Misc         → encoding challenges, trivia, anything that doesn't fit
```

## সাধারণ CTF Methodology

```
1. Read the description carefully — it usually contains a hint
2. Identify the category
3. Collect all provided files and note their types:
   file challenge.bin
   strings challenge.bin | head -50
   xxd challenge.bin | head -20
4. Apply category-specific methodology
5. If stuck 30 min: look for hints, check if you misunderstood the category
6. If stuck 1 hour: take a break, come back fresh
7. After solving: write up your approach immediately while it's fresh
```

## Web CTF Methodology

```bash
# 1. Open Burp Suite, proxy all traffic
# 2. Browse the app, build site map
# 3. Check for hidden endpoints
gobuster dir -u http://challenge.ctf -w /usr/share/wordlists/common.txt
# 4. Read all JavaScript files (look for commented endpoints, API keys)
curl http://challenge.ctf/app.js | grep -E "(api|key|secret|password|endpoint)"
# 5. Check cookies and tokens (JWT? base64? predictable?)
# 6. Try basic payloads in every input field
# 7. Check robots.txt, sitemap.xml, /.git/, /.env
# 8. Try URL manipulation: /../../etc/passwd, /admin?debug=true
```

## Pwn (Binary Exploitation) Methodology

```bash
# 1. File info
file challenge
strings challenge | head -100
checksec challenge   # what protections are enabled?

# checksec output:
# RELRO:    Full      (prevents GOT overwrite)
# Stack:    Canary    (prevents basic buffer overflow)
# NX:       Enabled   (no execute on stack)
# PIE:      Enabled   (ASLR — randomized base address)

# 2. Run the binary, understand behavior
./challenge
nc challenge.ctf 1337   # often remote service

# 3. Open in decompiler / disassembler
ghidra   # free, excellent for beginners
ida      # industry standard, expensive
radare2  # open source, CLI

# 4. Find the vulnerability
# Common types:
# - Buffer overflow (gets, strcpy, scanf with no bounds)
# - Format string (%n, %x, %s in printf with user input)
# - Integer overflow (arithmetic on user-controlled values)
# - Use-after-free (heap exploitation)

# 5. Write exploit with pwntools
from pwn import *

io = remote('challenge.ctf', 1337)
elf = ELF('./challenge')

# Basic buffer overflow template:
offset = 40   # found with cyclic pattern
ret = p64(elf.symbols['win'])   # or ROP gadget

payload = b'A' * offset + ret
io.sendline(payload)
io.interactive()
```

## Reverse Engineering Methodology

```bash
# 1. Static analysis
file challenge
strings challenge | grep -E "(flag|CTF|password|key)"
objdump -d challenge | head -100    # disassembly

# 2. Open in Ghidra or IDA
# Look for: main(), win(), check(), validate() functions
# Follow the logic — what input produces what output?
# Find comparison: if (strcmp(input, key) == 0) → what is key?

# 3. Dynamic analysis
ltrace ./challenge input   # library calls (strcmp, strlen)
strace ./challenge input   # system calls
gdb ./challenge
# gdb: b main → run → disassemble → examine values at comparisons

# 4. Common patterns:
# XOR encoding: reverse the XOR key
# Base64 encoding: decode with base64 -d
# Custom alphabet: map characters, brute force alphabet
# VM/Bytecode: reverse the interpreter and bytecode

# 5. Tools
ghidra                    # decompiler
radare2 / cutter          # disassembler + decompiler
gdb + pwndbg              # debugger
python3 -c "import dis; import marshal"  # Python bytecode
java -jar cfr.jar Class.class  # Java decompiler
```

## Cryptography CTF Methodology

```bash
# 1. Identify the cipher/encoding
# Base64: A-Z, a-z, 0-9, +, /, = padding
# Hex: 0-9, a-f
# ROT13: shift cipher, letter frequency analysis
# Caesar: shift cipher with unknown shift

# 2. Try automated tools first
# CyberChef (online): drag-and-drop decode operations
# dcode.fr: identifies and solves classical ciphers

# 3. Classic ciphers
python3 -c "print(''.join(chr((ord(c)-65-13)%26+65) if c.isalpha() else c for c in 'ROT13TEXT'))"
# OR: echo "ROT13TEXT" | tr 'A-Za-z' 'N-ZA-Mn-za-m'

# Caesar brute force:
python3 -c "
ct='ENCRYPTED'
for shift in range(26):
    print(shift, ''.join(chr((ord(c)-65-shift)%26+65) if c.isupper() else c for c in ct))
"

# 4. RSA attacks (common in CTF)
# Small e (e=3): if m^3 < n, cube root gives m
# Common modulus: same n, different e → extended Euclidean gives message
# Wiener's attack: small private key d
# Factor small n: factordb.com

from Crypto.PublicKey import RSA
from Crypto.Util.number import long_to_bytes
import gmpy2

# Small e attack (e=3, no padding):
c = int("ciphertext_hex", 16)
m, exact = gmpy2.iroot(c, 3)
if exact:
    print(long_to_bytes(m))

# 5. Modern crypto attacks
# AES-ECB: same plaintext blocks = same ciphertext blocks → detect by block patterns
# AES-CBC with IV=0: predictable IV
# RSA with weak padding: Bleichenbacher oracle attack
```

## Forensics Methodology

```bash
# 1. File type identification
file mystery
binwalk mystery   # embedded files? multiple formats?
xxd mystery | head -5   # magic bytes

# 2. String extraction
strings mystery | grep -iE "(flag|ctf|password)"
strings -n 6 mystery   # minimum 6 chars (catch longer strings)

# 3. Steganography (data hidden in images/audio)
# PNG/JPEG:
steghide extract -sf image.jpg   # requires password — try empty
zsteg image.png    # LSB steganography analysis
stegseek image.jpg /usr/share/wordlists/rockyou.txt  # crack steg password
exiftool image.jpg  # metadata

# Audio:
# Open in Audacity → analyze spectrogram (Analyze → Plot Spectrum)
# Hidden text often visible in spectrogram

# 4. Network captures (.pcap)
wireshark capture.pcap
# Filter: http, dns, tcp follows
# Look for: credentials in cleartext, DNS exfiltration, unusual protocols

tshark -r capture.pcap -Y "http.request.method == POST" -T fields -e http.file_data
strings capture.pcap | grep -i flag

# 5. Memory forensics
volatility -f memory.dmp imageinfo    # OS detection
volatility -f memory.dmp --profile=Win7SP1x64 pslist   # processes
volatility -f memory.dmp --profile=Win7SP1x64 cmdline  # command history
volatility -f memory.dmp --profile=Win7SP1x64 dumpfiles -Q 0x... -D .  # dump file
strings memory.dmp | grep -i "flag{"
```

## OSINT CTF Methodology

```bash
# 1. Read challenge carefully — what info is given?
# Username? Real name? Email? Profile picture? Location?

# 2. Username → find on all platforms
sherlock username   # searches 400+ platforms
# OR: namechk.com

# 3. Image OSINT
# Reverse image search: Google Lens, TinEye, Yandex Images
# Extract EXIF: exiftool image.jpg   # GPS coordinates, camera, date
# Location clues: read signs, landmarks, shadows for direction/time

# 4. Location → map
# Google Maps Street View for visual confirmation
# What3Words if coordinates look like 3-word phrase

# 5. Deep social media
# Twitter: site:twitter.com "username"
# Instagram: search hashtags visible in photos
# Wayback Machine for deleted posts
```

## শীর্ষ CTF Platform

```
TryHackMe    (tryhackme.com)    → guided, beginner-friendly rooms
HackTheBox   (hackthebox.com)   → realistic machines, competitive leaderboard
PicoCTF      (picoctf.org)      → annual, beginner-friendly, great problems
CTFtime      (ctftime.org)      → aggregates all upcoming CTF competitions
PentesterLab (pentesterlab.com) → web-focused, excellent for web hacking
OverTheWire  (overthewire.org)  → wargames for Linux, networking, binary
pwn.college  (pwn.college)      → binary exploitation, academic quality
```

## একটি CTF শুরু করা: প্রথম 30 মিনিট

```bash
# 1. Download all challenge files
# 2. Create working directory per challenge
mkdir web-challenge pwn-challenge forensics-challenge
cd web-challenge

# 3. Document as you go
cat > notes.md << 'EOF'
# Challenge: Web Login Bypass
## Given
- URL: http://challenge.ctf
- Hint: "sometimes things are not what they seem"

## Observations
- Login form with username/password
- Redirects to /dashboard after login
- Cookie: session=eyJ... (looks like JWT)

## Attempts
- admin/admin: Invalid credentials
- admin/password: Invalid credentials
- ' OR '1'='1: SQL error! Vulnerable to SQLi

## Solution
- Boolean-based SQLi in username field
- Payload: admin' --
- Flag: CTF{sql_injection_is_classic}
EOF

# 4. Flag format varies — common patterns:
# CTF{flag_here}
# flag{flag_here}
# HackTheBox flag: 32-char hex
# VulnHub: /root/proof.txt or /home/user/local.txt
```

## আপনার CTF Toolkit গড়া

```bash
# Create a VM snapshot with all tools installed
# Essential toolkit:
sudo apt install -y \
  gobuster ffuf feroxbuster \
  binwalk foremost \
  exiftool steghide stegseek zsteg \
  radare2 gdb \
  wireshark tshark \
  john hashcat \
  sqlmap \
  python3-pwntools

pip install pwntools cryptography sympy

# Online tools bookmarks:
# CyberChef: gchq.github.io/CyberChef
# dcode.fr
# CrackStation: crackstation.net
# factordb.com (RSA factor database)
# Decompilers: dogbolt.org, godbolt.org
```
