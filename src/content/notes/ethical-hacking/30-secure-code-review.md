---
title: 'Secure Code Review'
subtitle: 'SAST tools, manual code auditing, threat modeling, বাস্তব codebase-এ vulnerability খুঁজে বের করা, এবং SDLC-তে security যুক্ত করা।'
chapter: 30
level: 'intermediate'
readingTime: '12 মিনিট'
topics:
  [
    'secure code review',
    'SAST',
    'code audit',
    'SDLC',
    'threat modeling',
    'Semgrep',
    'CodeQL',
    'security review',
    'AppSec'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

production-এর চেয়ে code review-তে একটা vulnerability ঠিক করা 100 গুণ সস্তা। Code review হলো factory পণ্য পাঠানোর আগের quality control station — ত্রুটি ধরার সঠিক জায়গা হলো ক্রেতা সেটা দেখার আগেই।

</Callout>

## গল্পে বুঝি

ফাতিমা একজন blueprint inspector — শহরের নতুন বড় বাড়িগুলোর নকশা ইট গাঁথা শুরুর আগে লাইন ধরে ধরে পড়া তার কাজ। একদিন একটা টাওয়ারের নকশা টেবিলে খুলে বসলেন। বাইরে থেকে সব ঠিকঠাক দেখাচ্ছে, কিন্তু ফাতিমা প্রতিটা দাগ ধরে এগোন — "এই দরজাটা কি এভাবেই খোলা উচিত? এই দেয়ালটা কি এখানেই থাকার কথা?" খুঁটিয়ে দেখতে দেখতে তিনটে বিপজ্জনক ভুল বেরিয়ে এল। ফায়ার এক্সিটটা ভেতরের দিকে খোলে — আগুন লাগলে ভিড়ের চাপে ওটা কোনোদিন খুলবে না। একটা load-bearing দেয়ালে দরজা কাটা হয়েছে, অথচ ওখানে কোনো ফাঁক থাকার কথাই নয়, যে কেউ চাইলে দুর্বল জায়গা দিয়ে ঢুকে পড়বে। আর সবচেয়ে বাজে — নকশার গায়েই লেখা, master-key কোথায় লুকিয়ে রাখা হবে, সবার চোখের সামনে।

ফাতিমা পেন্সিল দিয়ে তিনটে জায়গা দাগিয়ে ঠিক করিয়ে দিলেন — কাগজে। খরচ? একটা ইরেজার আর কয়েক মিনিট। তিনি জানেন, এই একই ভুল যদি বাড়ি তৈরি হয়ে, মানুষজন উঠে যাওয়ার পর ধরা পড়ত, তাহলে দেয়াল ভাঙা, দরজা সরানো, তালা বদলানো — বা আরও খারাপ, একটা দুর্ঘটনা। কাগজে ভুল ধরা যত সস্তা, ইট-পাথরে ধরা তত ভয়ংকর ব্যয়বহুল।

এই গল্পটাই আসলে **secure code review**। নকশা লাইন ধরে পড়ে construction শুরুর আগেই ভুল বের করা মানে হলো source code ship করার আগেই সেটা পড়ে security flaw খুঁজে বের করা। ভেতরে খোলা ফায়ার এক্সিট হলো missing **authorization** (দরজা খুলে দিলে যে কেউ ঢুকে যায়), load-bearing দেয়ালে কাটা দরজা হলো unvalidated user input যেখানে থাকার কথা নয় (**input validation** নেই), আর নকশায় লেখা master-key হলো **hardcoded secret**। আর কাগজে পেন্সিলে ঠিক করা বনাম বাড়ি ভরে যাওয়ার পর ঠিক করা — এটাই হলো **vulnerability** production-এ যাওয়ার আগে ধরা কতটা সস্তা, আর breach-এর পরে ধরা কতটা ব্যয়বহুল। বাস্তবে ঠিক এই কারণেই টিমগুলো merge-এর আগে PR review করে আর Semgrep/CodeQL দিয়ে scan চালায় — একটা flaw কোডে থাকা অবস্থায় ঠিক করা 100 গুণ সস্তা, breach হয়ে গেলে সেটা সংবাদপত্রের শিরোনাম।

## The Security Code Review Mindset

"এটা কি ঠিক আছে?" জিজ্ঞেস করবেন না। জিজ্ঞেস করুন "একজন attacker এটাকে কীভাবে অপব্যবহার করতে পারে?"

```
Key questions per function:
  1. What inputs does this code trust? Should it?
  2. What assumptions does the code make? Can they be violated?
  3. Where does user data flow? Does it ever reach a dangerous sink unchecked?
  4. What happens at the boundaries (empty input, huge input, null, wrong type)?
  5. Are there race conditions? (TOCTOU — Time of Check to Time of Use)
  6. Are errors handled? What happens when they're not?
  7. Is sensitive data logged? Stored? Transmitted securely?
```

## SAST Tools — Automated Code Review

### Semgrep

```bash
# Install
pip install semgrep

# Run on a project
cd /path/to/project
semgrep --config=auto .         # auto-select rules based on language
semgrep --config=p/security-audit .
semgrep --config=p/owasp-top-ten .
semgrep --config=p/nodejs-security .
semgrep --config=p/python-security .
semgrep --config=p/java .

# Write custom rules
cat > custom.yaml << 'EOF'
rules:
  - id: hardcoded-secret
    patterns:
      - pattern-either:
          - pattern: $VAR = "..." where:
              - metavariable-regex:
                  metavariable: $VAR
                  regex: (?i)(secret|api_key|password|token|credential)
    message: "Potential hardcoded secret in $VAR"
    severity: WARNING
    languages: [python, javascript, typescript]

  - id: sql-injection-node
    patterns:
      - pattern: |
          $DB.query($SQL + $INPUT)
      - pattern: |
          $DB.query(`...${$INPUT}...`)
    message: "SQL injection risk — use parameterized queries"
    severity: ERROR
    languages: [javascript, typescript]
EOF

semgrep --config=custom.yaml .
```

### CodeQL

```bash
# Install CodeQL CLI
# Download from github.com/github/codeql-action

# Create CodeQL database from source
codeql database create /tmp/mydb --language=javascript --source-root .

# Run security queries
codeql database analyze /tmp/mydb \
  codeql/javascript-queries:Security/ \
  --format=sarif-latest \
  --output=results.sarif

# View results
cat results.sarif | jq '.runs[0].results[] | {rule: .ruleId, message: .message.text, file: .locations[0].physicalLocation.artifactLocation.uri}'

# Custom query example
# Find SQL concatenation in JavaScript:
import javascript
import DataFlow

from MethodCallExpr call, string method
where
  (method = "query" or method = "execute") and
  call.getMethodName() = method and
  call.getArgument(0).toString().matches("%+%")
select call, "Possible SQL injection via string concatenation"
```

### Bandit (Python)

```bash
pip install bandit

# Scan Python project
bandit -r /path/to/project/

# Specific checks
bandit -r project/ -t B102,B103,B107  # specific test IDs
bandit -r project/ -l   # low confidence too (more findings)

# High severity only
bandit -r project/ --severity-level high

# Common Bandit findings:
# B101 — assert used for security check
# B102 — use of exec
# B103 — setting permissions
# B104 — binding to all interfaces
# B105,B106,B107 — hardcoded passwords
# B108 — probable insecure temp file
# B201 — Flask debug=True
# B301 — pickle use
# B302 — yaml.load (use yaml.safe_load)
# B303,B304,B305 — MD5/SHA1 use for password hashing
# B310 — urllib URL validation bypass
# B501 — SSL verify=False
# B506 — yaml.load
# B601,B602 — subprocess shell=True
# B703 — Django SQL injection
```

## Language-Specific Vulnerability Patterns

### JavaScript / TypeScript / Node.js

```javascript
// INSECURE: Template literal in query
app.get('/users', async (req, res) => {
	const name = req.query.name;
	const users = await db.query(`SELECT * FROM users WHERE name = '${name}'`); // SQLi!
});

// SECURE: Parameterized query
app.get('/users', async (req, res) => {
	const name = req.query.name;
	const users = await db.query('SELECT * FROM users WHERE name = ?', [name]);
});

// INSECURE: eval with user input
app.post('/calc', (req, res) => {
	const result = eval(req.body.expression); // RCE!
});

// INSECURE: path traversal
app.get('/file', (req, res) => {
	const file = req.query.name;
	res.sendFile('/var/files/' + file); // traversal: ../../etc/passwd
});
// SECURE:
const path = require('path');
app.get('/file', (req, res) => {
	const file = req.query.name;
	const safePath = path.resolve('/var/files/', file);
	if (!safePath.startsWith('/var/files/')) {
		return res.status(403).send('Access denied');
	}
	res.sendFile(safePath);
});

// INSECURE: SSRF in webhook handler
app.post('/webhook-test', async (req, res) => {
	const { url } = req.body;
	const result = await fetch(url); // SSRF!
});
```

### Python

```python
# INSECURE: SQL string formatting
def get_user(username):
    query = "SELECT * FROM users WHERE username = '%s'" % username  # SQLi!
    cursor.execute(query)

# SECURE: Parameterized
def get_user(username):
    cursor.execute("SELECT * FROM users WHERE username = %s", (username,))

# INSECURE: Shell injection
def ping_host(host):
    os.system(f"ping -c 1 {host}")  # command injection if host = "8.8.8.8; cat /etc/passwd"

# SECURE: subprocess without shell
import subprocess
def ping_host(host):
    subprocess.run(["ping", "-c", "1", host], capture_output=True, timeout=5)

# INSECURE: Unsafe deserialization
import pickle
def load_data(data):
    return pickle.loads(data)  # arbitrary code execution!

# INSECURE: yaml.load with arbitrary loader
import yaml
config = yaml.load(user_input)  # code execution!

# SECURE:
config = yaml.safe_load(user_input)

# INSECURE: Hardcoded secret
SECRET_KEY = "hardcoded-secret-abc123"  # committed to git!

# SECURE: Environment variable
import os
SECRET_KEY = os.environ['SECRET_KEY']

# INSECURE: MD5 for passwords
import hashlib
hashed = hashlib.md5(password.encode()).hexdigest()

# SECURE: bcrypt
import bcrypt
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12))
```

### PHP

```php
// INSECURE: Direct SQL concatenation
$query = "SELECT * FROM users WHERE id = " . $_GET['id'];  // SQLi
$result = mysqli_query($conn, $query);

// SECURE: PDO with parameterized query
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
$stmt->execute([$_GET['id']]);

// INSECURE: File inclusion from user input
include($_GET['page'] . '.php');  // LFI!

// SECURE:
$allowed = ['home', 'about', 'contact'];
$page = $_GET['page'];
if (!in_array($page, $allowed)) { $page = 'home'; }
include($page . '.php');

// INSECURE: Weak token generation
$token = md5(time());  // predictable!

// SECURE:
$token = bin2hex(random_bytes(32));

// INSECURE: extract() with user input
extract($_POST);  // creates variables from all POST keys!

// INSECURE: eval
eval(base64_decode($_POST['cmd']));  // webshell pattern — RCE
```

## Security Review Checklist

```markdown
## Authentication

- [ ] Passwords hashed with bcrypt/scrypt/Argon2 (not MD5/SHA1)
- [ ] Rate limiting on login, password reset, signup
- [ ] Account lockout after N failed attempts
- [ ] Session tokens: cryptographically random, sufficient length
- [ ] Session invalidated on logout (server-side)
- [ ] MFA implementation (if applicable)

## Authorization

- [ ] Every endpoint checks authentication before processing
- [ ] Object access checks ownership (not just auth state)
- [ ] Admin functions verify admin role, not just user role
- [ ] Mass assignment protection (whitelist writable fields)

## Input Validation

- [ ] All user input treated as untrusted
- [ ] SQL queries parameterized (no string formatting)
- [ ] Shell commands use arrays, not strings (no shell=True)
- [ ] File paths sanitized (no traversal possible)
- [ ] File uploads validated (type, size, content)

## Output Encoding

- [ ] HTML output escaped (no raw innerHTML with user data)
- [ ] JSON serialization doesn't include sensitive fields
- [ ] Error messages don't expose stack traces or internals

## Cryptography

- [ ] Secrets stored in environment variables, not code
- [ ] No hardcoded API keys, tokens, passwords
- [ ] TLS used for all communications
- [ ] No MD5/SHA1 for security purposes
- [ ] Random values from crypto-safe RNG

## Dependencies

- [ ] No CVEs in current dependency versions
- [ ] Dependencies pinned with checksums (lock file)
- [ ] Supply chain integrity verified (SRI hashes for CDN)
```

## Integrating into CI/CD

```yaml
# GitHub Actions — security scanning on every PR
name: Security Scan

on: [pull_request]

jobs:
  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run Semgrep
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/owasp-top-ten
          publishToken: ${{ secrets.SEMGREP_APP_TOKEN }}

      - name: Run Bandit (Python)
        run: |
          pip install bandit
          bandit -r . --severity-level medium --exit-zero

      - name: Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'MyProject'
          path: '.'
          format: 'HTML'

      - name: Upload SARIF to GitHub
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: results.sarif
```

## Real Project: Audit a Public Codebase

```bash
# Pick an open source project (ideally one in active use)
# Goal: find a real security vulnerability

# Step 1: Install locally and understand the app
git clone https://github.com/example/web-app
cd web-app && docker-compose up

# Step 2: Run automated tools
semgrep --config=auto .
bandit -r . 2>&1 | tee bandit-report.txt

# Step 3: Manual audit — focus on:
# - Authentication endpoints
# - File upload handlers
# - API endpoints that return sensitive data
# - Password reset flow
# - Any code that calls subprocess, eval, exec

# Step 4: Look at recent commits (new code = new bugs)
git log --oneline -20
git show <commit> --stat

# Step 5: If you find something:
# - Write a proof of concept
# - Report to maintainers via their security policy
# - HackerOne if they have a program
# - Or their security@ email
# - CVE request if no coordinated disclosure process
```
