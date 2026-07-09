---
title: 'Reconnaissance'
subtitle: 'OSINT, passive recon, Google dorks, Shodan, theHarvester, Maltego — টার্গেট না ছুঁয়েই ইন্টেলিজেন্স সংগ্রহ।'
chapter: 3
level: 'beginner'
readingTime: '12 মিনিট'
topics:
  [
    'OSINT',
    'reconnaissance',
    'Google dorks',
    'Shodan',
    'theHarvester',
    'passive recon',
    'active recon'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একজন গোয়েন্দা কেস ফাইল না পড়ে দরজা ভেঙে ঢোকে না। Recon হলো কেস ফাইল পড়া — এমন কোনো পদক্ষেপ নেওয়ার আগে সব পাবলিকলি available তথ্য খুঁজে বের করা যা log হতে পারে।

</Callout>

## Passive vs Active Recon

```
Passive recon — you never touch the target's systems
  → Public records, Google, Shodan, WHOIS, social media
  → Target cannot detect you
  → Always do this first

Active recon — you send packets to the target
  → DNS queries, port scans, web crawling
  → Target may detect and log your activity
  → Do after you've exhausted passive sources
```

## WHOIS এবং Domain Intelligence

```bash
# Domain registration info
whois example.com

# Look for:
# Registrant email      → direct contact point
# Name servers          → hosting provider
# Creation date         → how old is this domain?
# Registrar             → where to report abuse

# Historical WHOIS (privacy guard may hide current data)
# whoisfreaks.com, domaintools.com

# Find all domains registered by same email
# reversewhois.io
```

## DNS Enumeration

```bash
# Basic DNS records
dig example.com A       # IPv4 address
dig example.com AAAA    # IPv6 address
dig example.com MX      # mail servers
dig example.com NS      # name servers
dig example.com TXT     # SPF, DKIM, verification records
dig example.com CNAME   # aliases

# TXT records often reveal:
# - Email providers (Google Workspace, Office 365)
# - Third-party services (Stripe, Salesforce)
# - Verification tokens (sometimes expose internal project names)

# Zone transfer (dumps all DNS records — misconfigured servers only)
dig axfr @ns1.example.com example.com

# Subdomain brute force
gobuster dns -d example.com -w /usr/share/wordlists/subdomains-top1million-5000.txt -t 50
# or
ffuf -w /usr/share/wordlists/subdomains-top1million-5000.txt -u http://FUZZ.example.com -H "Host: FUZZ.example.com"

# Certificate transparency — subdomains listed in SSL certs
# crt.sh: search for %.example.com
curl -s "https://crt.sh/?q=%.example.com&output=json" | jq '.[].name_value' | sort -u
```

## Google Dorks

Google-এর search operator-কে recon অস্ত্র হিসেবে ব্যবহার:

```
site:example.com                         → all indexed pages
site:example.com filetype:pdf            → PDF documents
site:example.com inurl:admin             → admin panels
site:example.com inurl:login             → login pages
site:example.com "index of"              → directory listings
site:example.com ext:sql OR ext:db       → exposed databases
"example.com" ext:env OR ext:config      → config files indexed
intitle:"index of" site:example.com      → open directories
"DB_PASSWORD" site:github.com            → secrets in GitHub
"PRIVATE KEY" site:github.com            → private keys leaked to GitHub
inurl:/wp-content/uploads filetype:txt   → WordPress upload dirs
```

**GoogleDorker বা DorkSearch দিয়ে অটোমেট করুন:**

```bash
# Manual — just use Google, don't hammer it with automation
# Use site:example.com with different operators, build a picture

# High-value dorks for any target:
site:pastebin.com "example.com"           # pastes mentioning target
site:github.com "example.com" password    # leaked creds in repos
```

## Shodan — ইন্টারনেট-সংযুক্ত ডিভাইস সার্চ ইঞ্জিন

Shodan ইন্টারনেট-উন্মুক্ত service-এর banner index করে। আপনি একটি প্যাকেটও না পাঠিয়ে এটি জানে আপনার টার্গেটের server-এ কোন সফটওয়্যার ভার্সন চলছে।

```bash
# Install CLI
pip install shodan
shodan init YOUR_API_KEY

# Search for target
shodan search hostname:example.com

# Lookup specific IP
shodan host 93.184.216.34

# Look for:
# - Software versions (match against known CVEs)
# - Open ports that shouldn't be public (Redis, Elasticsearch, MongoDB)
# - SSL certificate info
# - Server banners with version numbers

# Useful Shodan filters:
# hostname:example.com
# org:"Example Company"
# ssl.cert.subject.cn:example.com
# http.title:"Example App"
# product:Redis
# product:elasticsearch
```

**সাধারণ Shodan finding:**

- `port:6379` — auth ছাড়া Redis
- `port:9200` — auth ছাড়া Elasticsearch
- `port:27017` — auth ছাড়া MongoDB
- `port:5432 postgresql` — উন্মুক্ত PostgreSQL

## theHarvester — Email ও Subdomain Intel

```bash
# Gather emails, subdomains, IPs from public sources
theHarvester -d example.com -b google,bing,linkedin,shodan -l 500 -f output.html

# Sources: google, bing, linkedin, twitter, hunter, shodan, crtsh
# -l 500: limit to 500 results per source

# Output includes:
# - Email addresses (for phishing simulations or credential stuffing)
# - Subdomains
# - Hosts and IP addresses
```

## LinkedIn / Social Media OSINT

LinkedIn যা প্রকাশ করে:

- কর্মচারীদের নাম → username list বানান (a.al-khwarizmi, ahmad.al-khwarizmi, aalkhwarizmi)
- জব টাইটেল → tech stack বোঝা ("Senior Kubernetes Engineer" = prod-এ K8s)
- সাম্প্রতিক জব পোস্টিং → "AWS Lambda experience required" = তারা Lambda ব্যবহার করে
- প্রোফাইল থেকে tech stack → Python, Go, React, Terraform

```python
# Generate username variations from names
first = "Ahmad"
last  = "al-Khwarizmi"
domain = "example.com"

variants = [
  f"{first.lower()}.{last.lower()}@{domain}",
  f"{first[0].lower()}{last.lower()}@{domain}",
  f"{first.lower()}{last[0].lower()}@{domain}",
  f"{first.lower()}_{last.lower()}@{domain}",
]
```

**টুল:** LinkedInt, linkedin2username, osintgram (Instagram)

## Wayback Machine ও ঐতিহাসিক ডেটা

```bash
# Archive.org API — what did the site look like before?
curl "http://archive.org/wayback/available?url=example.com/admin"

# Useful for:
# - Finding removed pages that exposed data
# - Old login panels with known vulnerabilities
# - API keys committed to public JS then removed

# waybackurls — extract all URLs from Wayback Machine
go install github.com/tomnomnom/waybackurls@latest
echo "example.com" | waybackurls
```

## GitHub / GitLab Recon

সোর্স কোড রিপোজিটরি হলো সবচেয়ে সমৃদ্ধ recon টার্গেট:

```bash
# Search GitHub for target
# github.com/search?q=example.com&type=code

# Look for:
# API keys, AWS credentials, database passwords in:
# - .env files accidentally committed
# - config files
# - commit history (key added and then removed is still in git history)

# Tools:
pip install trufflehog
trufflehog github --repo https://github.com/example/repo

# GitLeaks — scan for secrets
docker run -v /path/to/repo:/path zricethezav/gitleaks:latest detect --source /path

# GitHub dorks (search in github.com):
# org:example-org "password"
# org:example-org "api_key"
# org:example-org "BEGIN RSA PRIVATE KEY"
# org:example-org ".env"
# org:example-org "DB_PASSWORD"
```

## Email Verification

```bash
# hunter.io — find emails for a domain (freemium)
curl "https://api.hunter.io/v2/domain-search?domain=example.com&api_key=YOUR_KEY"

# Verify if email exists (SMTP verification without sending)
# tools: email-verify, verify-email
pip install verify-email
python -c "from verify_email import verify_email; print(verify_email('user@example.com'))"
```

## Recon Report তৈরি

Passive recon-এর পর, ডকুমেন্ট করুন:

```markdown
## Target: example.com

### Infrastructure

- IP ranges: 93.184.216.0/24, 198.51.100.0/24
- Hosting: AWS us-east-1 (from TXT records + Shodan)
- CDN: Cloudflare (IP resolves to CF range)
- Name servers: ns1.cloudflare.com, ns2.cloudflare.com

### Subdomains Found (47 total)

- api.example.com → 93.184.216.10
- staging.example.com → 93.184.216.11 ← interesting
- dev.example.com → 10.0.1.5 ← private IP leaked!
- mail.example.com → 198.51.100.5
- vpn.example.com → 198.51.100.6 ← VPN exposed

### Technology Stack

- Web: nginx/1.18.0 (from Shodan banner)
- App: Node.js (from X-Powered-By header)
- DB: likely PostgreSQL (job postings mention it)
- Email: Google Workspace (MX: aspmx.l.google.com)

### Employees

- 47 LinkedIn profiles
- 23 unique email addresses (format: firstname.lastname@example.com)
- CTO: ahmad.al-khwarizmi@example.com (from conference speaker bio)

### Exposed Services (Shodan)

- staging.example.com:8080 — Apache Tomcat 8.5.23 (CVE-2020-1938 — check)
- 93.184.216.15:6379 — Redis, no auth detected

### GitHub Findings

- 3 repos mention "example.com"
- AWS key in commit abc123 (now deleted, still in history)
  Key: AKIAIOSFODNN7EXAMPLE
```

এই ডকুমেন্টটি আপনার scanning ধাপের input হয়ে যায়।
