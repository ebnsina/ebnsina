---
title: 'Bug Bounty'
subtitle: 'Methodology, platform নির্বাচন, recon automation, high-value target বাছাই, triaging, এবং HackerOne ও Bugcrowd-এ নিয়মিত আয় করা।'
chapter: 28
level: 'intermediate'
readingTime: '12 মিনিট'
topics:
  [
    'bug bounty',
    'HackerOne',
    'Bugcrowd',
    'vulnerability disclosure',
    'recon automation',
    'Nuclei',
    'bug bounty methodology'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

Bug bounty হলো variable fee-তে করা consulting — আপনি শুধু result-এর জন্য টাকা পান, কিন্তু ক্লায়েন্ট হলো একসাথে প্রোগ্রাম আছে এমন প্রতিটা কোম্পানি। যেসব hunter নিয়মিত আয় করে তারা ভাগ্যবান নয়; তারা systematic এবং বাকি সবার চেয়ে দ্রুত।

</Callout>

## গল্পে বুঝি

আল-খোয়ারিজমির বাজারের মাঝখানে একটা বড় দোকান — কাপড়, মশলা, দামি জিনিসপত্র সব রাখা। একদিন সে দোকানের সামনে একটা নোটিশ ঝুলিয়ে দিল: "যদি কেউ আমার দোকানে ঢোকার কোনো ফাঁক খুঁজে পাও, চুরি না করে আমাকে চুপিচুপি বলে দাও — আমি ভালো পুরস্কার দেব। ডাকাতি কোরো না, রিপোর্ট করো।" নোটিশে আরও লেখা ছিল কিছু স্পষ্ট নিয়ম: শুধু এই একটা দোকানই পরীক্ষা করা যাবে, ফাঁকটা একান্তে মালিককে জানাতে হবে, আর আসলে কিছু নেওয়া বা ভাঙা যাবে না।

কয়েকদিন পরেই ইবনে সিনা নামের এক চালাক ছেলে খেয়াল করল, দোকানের পেছনের একটা জানালার ছিটকিনি নড়বড়ে — একটু চাপ দিলেই খুলে যায়। আগে হলে হয়তো লোভে পড়ে রাতে ঢুকে যেত। কিন্তু এবার সে সোজা মালিকের কাছে গিয়ে জানালাটার কথা বলল। আল-খোয়ারিজমি খুশি হয়ে তাকে ন্যায্য পুরস্কার দিল, বাজারে সবার সামনে ধন্যবাদ জানাল, আর সেই রাতেই জানালাটা মেরামত করিয়ে ফেলল — আসল কোনো চোর টের পাওয়ার আগেই। এমনকি ফাতিমা আল-ফিহরিও পরে আরেকটা দুর্বল তালা খুঁজে একইভাবে রিপোর্ট করে পুরস্কার নিল।

এই গল্পটাই আসলে **bug bounty**। দোকানের সামনের সেই "ফাঁক খুঁজে জানাও, পুরস্কার নাও" নোটিশটাই হলো একটা bug bounty program — কোম্পানি নিজেই researcher-দের আমন্ত্রণ জানায় দুর্বলতা খুঁজতে। নড়বড়ে জানালা চুরি না করে একান্তে মালিককে জানিয়ে পুরস্কার নেওয়াটাই **responsible disclosure** আর তার **reward**। নোটিশের স্পষ্ট নিয়মগুলোই হলো **rules of engagement** আর **scope** — কোনটা পরীক্ষা করা যাবে, কীভাবে রিপোর্ট করতে হবে। এভাবেই যে লোভে পড়ে চোর হতে পারত, তাকে বরং টাকার বিনিময়ে defender বানিয়ে ফেলা হয়, আর আসল অপরাধী খুঁজে পাওয়ার আগেই ফাঁকটা fix হয়ে যায়। বাস্তবে HackerOne-এর মতো প্ল্যাটফর্ম ঠিক এই কাজটাই করে — হাজার হাজার কোম্পানি সেখানে নোটিশ ঝুলিয়ে রাখে, আর দুনিয়াজুড়ে researcher-রা দুর্বলতা খুঁজে responsibly রিপোর্ট করে পুরস্কার পায়।

## Bug Bounty Platforms

```
HackerOne (hackerone.com)
  - Largest platform by program count and payout
  - Private invitations for top performers
  - Mediation service for disputes
  - H1 CTF events for free skill building

Bugcrowd (bugcrowd.com)
  - Strong enterprise focus
  - VRT (Vulnerability Rating Taxonomy) standardizes severity
  - Good for beginners (more programs, more structured)

Intigriti (intigriti.com)
  - European focus
  - Less competition than H1/Bugcrowd on EU programs

Synack
  - Vetted, invitation-only
  - Higher payouts, higher bar

Self-hosted programs
  - Google VRP: bughunters.google.com
  - Microsoft MSRC: msrc.microsoft.com
  - Apple Security: security.apple.com
  - Meta: m.me/whitehat
```

## Choosing Programs

```
Beginner strategy:
  - Start with public programs (not private)
  - Choose programs with wide scope (*.example.com vs just example.com)
  - Look for younger programs (less picked over)
  - Programs with "average time to triage" < 5 days (responsive = paid faster)
  - Check Hall of Fame — programs that recognize researchers pay better

Intermediate strategy:
  - Get invited to private programs (requires reputation score)
  - Target newly launched programs (rush window before other hunters arrive)
  - Follow program scope changes (new scope = new attack surface)
  - Focus on specific bug classes you've mastered

Reading a program:
  - Scope: what's in, what's out
  - Out of scope: don't waste time here (no bounty)
  - Safe harbor: legal protection for good-faith testing
  - Reward ranges: what bugs are worth how much
  - Response SLAs: how fast will they respond?
  - Known issues: bugs they already know about (don't report)
```

## Recon Automation

Bug bounty-তে গতিই হলো competitive advantage। যা কিছু বারবার করতে হয় তার সবকিছু automate করুন।

```bash
# Subfinder — passive subdomain enumeration
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
subfinder -d target.com -all -silent

# HTTPX — filter live hosts
go install -v github.com/projectdiscovery/httpx/cmd/httpx@latest
subfinder -d target.com | httpx -silent

# Nuclei — fast template-based scanner
go install -v github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest
subfinder -d target.com | httpx | nuclei -t nuclei-templates/

# Katana — web crawler
go install github.com/projectdiscovery/katana/cmd/katana@latest
katana -u https://target.com -d 3 -silent

# GAU — fetch known URLs from Wayback Machine
go install github.com/lc/gau/v2/cmd/gau@latest
echo target.com | gau --subs

# Paramspider — find parameters for injection testing
git clone https://github.com/devanshbatham/ParamSpider
python3 ParamSpider/paramspider.py -d target.com

# Full pipeline
#!/bin/bash
TARGET=$1

# 1. Subdomain discovery
subfinder -d $TARGET -all -o /tmp/subs.txt
amass enum -passive -d $TARGET >> /tmp/subs.txt
sort -u /tmp/subs.txt -o /tmp/subs.txt

# 2. Find live hosts
cat /tmp/subs.txt | httpx -silent -o /tmp/live.txt

# 3. Screenshot for manual review
cat /tmp/live.txt | gowitness file -f -

# 4. Find endpoints
cat /tmp/live.txt | katana -silent -jc | tee /tmp/urls.txt
cat /tmp/live.txt | waybackurls >> /tmp/urls.txt

# 5. Find parameters
cat /tmp/urls.txt | grep "=" | sort -u > /tmp/params.txt

# 6. Run Nuclei
cat /tmp/live.txt | nuclei -t nuclei-templates/ -o /tmp/nuclei-results.txt
```

## High-Value Bug Classes

```
Critical ($$$$):
  IDOR on sensitive objects (account takeover)
  Authentication bypass (no credentials needed)
  SSRF → cloud metadata → account takeover
  RCE via any vector
  SQLi → auth bypass or data dump
  JWT attacks → account takeover
  Business logic (transfer money to yourself, etc.)

High ($$$):
  Stored XSS affecting all users
  SSRF (without cloud credential exposure)
  XXE with file read
  IDOR on less sensitive objects
  CSRF on state-changing actions

Medium ($$):
  Reflected XSS
  Open redirect (chained with other bugs)
  Rate limiting on auth endpoints
  Broken access control (read-only access to others' data)
  Information disclosure (non-critical)

Low ($):
  Self-XSS (only affects yourself)
  Missing security headers
  CSRF on low-impact actions
  Version disclosure
```

## Bug Chains — Turning Low into Critical

low-severity bug-গুলো একসাথে জুড়ে high-severity impact তৈরি করা:

```
Example 1: Open Redirect + OAuth
  1. Find open redirect: /redirect?url=https://evil.com
  2. Find OAuth flow uses redirect_uri validation but allows subdomains
  3. Chain: OAuth auth URL → redirect to evil.com with authorization code
  4. Attacker steals OAuth token → account takeover
  Severity: Critical (account takeover)

Example 2: Self-XSS + CSRF
  1. Self-XSS in profile bio field (only shows to you)
  2. CSRF on profile update endpoint (no CSRF token)
  3. Send victim a link that triggers CSRF → sets XSS payload in their bio
  4. When victim views their own bio → XSS triggers → steals session
  Severity: High (stored XSS via CSRF)

Example 3: SSRF → Internal Service
  1. SSRF in webhook URL parameter
  2. SSRF can reach internal Kubernetes API (10.0.0.1:6443)
  3. Kubernetes API has no auth (misconfigured)
  4. Create privileged pod → node compromise
  Severity: Critical (internal network compromise)
```

## Nuclei Custom Templates

```yaml
# Write custom Nuclei templates for program-specific bugs

id: target-api-key-exposure
info:
  name: API Key Exposed in Response
  severity: high
  tags: exposure,api

requests:
  - method: GET
    path:
      - '{{BaseURL}}/api/v1/config'
      - '{{BaseURL}}/api/settings'
      - '{{BaseURL}}/.env'
    matchers-condition: and
    matchers:
      - type: word
        words:
          - 'api_key'
          - 'API_KEY'
          - 'secret'
      - type: status
        status:
          - 200
    extractors:
      - type: regex
        name: api_key
        regex:
          - '"api_key"\s*:\s*"([^"]{20,})"'
```

## Writing Good Reports

```markdown
## Title: Account Takeover via IDOR in Password Reset Token

**Severity:** Critical
**Bounty estimate:** $1,500 – $3,000
**CVSS:** 8.8 (AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N)

## Summary

The password reset endpoint uses sequential, predictable token IDs rather than
cryptographically random tokens. An attacker can enumerate recent token IDs to
reset any user's password.

## Steps to Reproduce

1. Request a password reset for your own email: POST /api/auth/reset
   - Note your token in the reset email: `reset?token=8472`
   - Notice the token is numeric and sequential

2. Request a reset for victim@target.com

3. Try token IDs near yours:
```

GET /reset?token=8471
GET /reset?token=8473

```

4. One token resolves to victim's reset — enter a new password

5. Log in as victim with new password

## Impact
An attacker who can request a password reset and observe the token structure
can take over any account that recently requested a password reset. This
constitutes complete account takeover affecting all users.

## Proof of Concept
[Screenshot 1: My reset token = 8472]
[Screenshot 2: Reset URL with token=8471 shows "Choose new password" for victim]
[Screenshot 3: Logged in as victim after setting new password]

## Remediation
Use cryptographically random 32+ byte tokens (e.g., crypto.randomBytes(32).toString('hex')).
Tokens should be single-use and expire in 15 minutes.

## References
- CWE-640: Weak Password Recovery Mechanism for Forgotten Password
- OWASP Authentication Cheat Sheet
```

## Staying Ethical and Legal

```
Always:
- Stay within the defined scope
- Don't access or exfiltrate real user data
- Stop at proof of concept — don't fully exploit
- Don't use vulnerabilities against the company's competitors or users
- Report promptly — don't sit on critical findings

Never:
- Test out-of-scope domains/IPs
- DoS/DDoS the target
- Social engineer employees
- Access production data beyond what's needed for proof
- Automate in a way that impacts performance (rate limit yourself)

Dispute resolution:
- If a valid bug is closed as "informational" unfairly:
  → Provide more impact evidence
  → Request mediation (HackerOne has a process)
  → Escalate professionally, not aggressively
- Understand that "won't fix" ≠ "not a bug"
  → Still valid for your portfolio/experience
```
