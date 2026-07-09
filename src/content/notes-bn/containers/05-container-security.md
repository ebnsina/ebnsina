---
title: 'Container Security'
subtitle: 'Attack surface, capabilities, seccomp, read-only filesystem, এবং প্রোডাকশন hardening-এর জন্য যা আসলে গুরুত্বপূর্ণ।'
chapter: 5
level: 'advanced'
readingTime: '10 মিনিট'
topics: ['container security', 'capabilities', 'seccomp', 'read-only', 'rootless', 'supply chain']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা জাদুঘরের জন্য defense in depth: সামনের দরজায় guard, প্রতিটা wing-এ alarm, display case তালাবদ্ধ, আর সবচেয়ে মূল্যবান জিনিসগুলো একটা vault-এ। কোনো একটা ব্যবস্থাই যথেষ্ট নয় — আপনি সেগুলো স্তরে স্তরে সাজান যাতে একটা স্তর ভাঙলেও সবকিছুতে access না পাওয়া যায়। Container security-ও একই: non-root + read-only + capability drop + seccomp, একসাথে।

</Callout>

## Threat Model

একটা containerized এনভায়রনমেন্টে আপনি যার বিরুদ্ধে রক্ষা করছেন:

1. **Compromised application code** — একজন attacker আপনার অ্যাপের একটা bug exploit করে container-এর ভেতরে RCE পায়
2. **Compromised base image** — একটা ক্ষতিকর বা vulnerable upstream image
3. **Container escape** — একটা kernel বা runtime vulnerability exploit করে container থেকে বেরিয়ে হোস্টে পৌঁছানো
4. **Privilege escalation** — container-এর ভেতরের একটা process এমন capability পায় যা তার থাকার কথা নয়
5. **Supply chain attack** — build করার পর একটা dependency বা base image compromise হয়

Defense in depth: এগুলোর প্রতিটাকে কঠিন করুন, মেনে নিন যে কোনোটাকেই অসম্ভব করা যায় না।

## ডিফল্টভাবে Non-Root

একটা container-এর ভেতরে root হিসেবে চালানো সবচেয়ে প্রচলিত ভুল। আপনার অ্যাপ compromise হয়ে root হিসেবে চললে, attacker root পেয়ে যায় — যা container escape আর lateral movement অনেক সহজ করে।

```dockerfile
# Most official images have a non-root user — use it
FROM node:20-alpine
# 'node' user (UID 1000) already exists

WORKDIR /app
COPY --chown=node:node . .
RUN npm ci --omit=dev

USER node   # switch before CMD
CMD ["node", "server.js"]
```

```bash
# Verify
docker run --rm myapp id
# uid=1000(node) gid=1000(node) groups=1000(node)

# If a user doesn't exist in the base image, create one
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup
USER appuser
```

**Kubernetes-এ non-root বাধ্যতামূলক করুন:**

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
  containers:
    - name: api
      securityContext:
        allowPrivilegeEscalation: false
```

## Read-Only Root Filesystem

একটা read-only filesystem একজন attacker-কে backdoor লেখা, binary পরিবর্তন করা, বা টুল install করা থেকে ঠেকায়:

```bash
# Run with read-only root filesystem
docker run --read-only myapp

# If your app needs to write (temp files, logs):
docker run --read-only \
  --tmpfs /tmp:rw,size=100m,noexec \    # RAM-backed writable /tmp
  --tmpfs /app/logs:rw,size=50m \       # writable log dir
  myapp
```

**Kubernetes-এ:**

```yaml
containers:
  - name: api
    securityContext:
      readOnlyRootFilesystem: true
    volumeMounts:
      - name: tmp
        mountPath: /tmp
volumes:
  - name: tmp
    emptyDir:
      medium: Memory # RAM-backed
      sizeLimit: 100Mi
```

বেশিরভাগ অ্যাপকে কোথাও না কোথাও লিখতে হয়। আপনার অ্যাপ কী লেখে তা audit করে সেটা স্পষ্ট করুন — `readOnlyRootFilesystem` পুরো filesystem উপলব্ধ রাখার বদলে আপনাকে writable path-গুলো একে একে গুনে বের করতে বাধ্য করে।

## Linux Capabilities

root user-এর প্রায় ৪০টা আলাদা capability আছে (port &lt;1024-এ bind করার ক্ষমতা, যেকোনো process kill করা, kernel module load করা, ইত্যাদি)। root হিসেবে চালালে এগুলোর সবই পাওয়া যায়। আপনি root হিসেবে চালাতে পারেন কিন্তু সব অপ্রয়োজনীয় capability drop করে দিতে পারেন:

```bash
# Drop all capabilities, add back only what's needed
docker run \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \    # allow binding port <1024
  myapp

# Common capabilities and when you need them:
# NET_BIND_SERVICE: bind ports < 1024 (prefer using port 3000+ instead)
# CHOWN: change file ownership (needed if app chowns files at startup)
# DAC_OVERRIDE: bypass file permission checks (rarely legitimate)
# SYS_PTRACE: debug other processes (debugging only, never in prod)
```

**সঠিক ডিফল্ট:** `--cap-drop=ALL` আর শুধু যা টেস্টে প্রমাণিতভাবে দরকার সেটুকু ফিরিয়ে আনুন। `NET_BIND_SERVICE`-এর প্রয়োজন এড়াতে port 3000+ ব্যবহার করুন।

**Kubernetes-এ:**

```yaml
securityContext:
  capabilities:
    drop: [ALL]
    add: [] # empty — your app should run without any special capabilities
```

## seccomp Profile

seccomp (Secure Computing Mode) filter করে একটা container কোন কোন syscall করতে পারবে। ডিফল্ট Docker seccomp profile প্রায় ৪৪টা বিপজ্জনক syscall block করে, যার মধ্যে আছে `ptrace`, `kexec_load`, আর `mount`।

```bash
# Default seccomp profile is already applied
docker run --security-opt seccomp=/etc/docker/seccomp.json myapp

# Disable seccomp (don't do this in production)
docker run --security-opt seccomp=unconfined myapp

# Custom profile: only allow syscalls your app actually uses
# Use strace to identify what your app calls, then write a minimal profile
strace -e trace=all -f node server.js 2>&1 | awk -F'(' '{print $1}' | sort -u
```

বেশিরভাগ অ্যাপ্লিকেশনের জন্য ডিফল্ট Docker seccomp profile-ই যথেষ্ট। high-security workload-এর জন্য একটা custom minimal profile বানাতে যথেষ্ট টেস্টিং লাগে কিন্তু এটা attack surface নাটকীয়ভাবে কমায়।

## Image Supply Chain Security

**Tag নয়, নির্দিষ্ট digest ব্যবহার করুন:**

```dockerfile
# WRONG — 'latest' can change to anything
FROM node:20-alpine

# BETTER — specific tag (can still be overwritten)
FROM node:20.11.1-alpine3.19

# BEST — digest is immutable
FROM node:20.11.1-alpine3.19@sha256:bf77dc26e48ea95fca9d1aceb5acfa69d2e546b765ec2abfb502975f1a2d4def
```

**Build-এর আগে dependency scan করুন:**

```bash
# Scan npm dependencies
npm audit --audit-level=high

# Scan Python
pip-audit

# Scan Go
govulncheck ./...

# In CI: fail on high severity
npm audit --audit-level=high --exit-code 1
```

**SBOM (Software Bill of Materials):**

```bash
# Generate SBOM for your image
syft myapp:latest -o spdx-json > sbom.json

# Verify image signature (if using cosign)
cosign verify ghcr.io/org/myapp:v1.0.0 --certificate-identity=...
```

**আপনার image sign করুন:**

```bash
# Sign with cosign (keyless, using OIDC)
cosign sign ghcr.io/org/myapp:v1.0.0

# Verify before deploying
cosign verify ghcr.io/org/myapp:v1.0.0
```

## Secrets Management

কখনো image-এ secret বেক করবেন না:

```dockerfile
# WRONG — secret in image layer forever
RUN curl -H "Authorization: Bearer $API_KEY" https://api.service/setup

# WRONG — build arg visible in image history
ARG API_KEY
RUN curl -H "Authorization: Bearer ${API_KEY}" ...
```

```bash
# RIGHT — BuildKit secret mounts (never stored in image)
# --secret id=mykey,src=./secret.txt
RUN --mount=type=secret,id=mykey \
    API_KEY=$(cat /run/secrets/mykey) \
    curl -H "Authorization: Bearer $API_KEY" ...
```

**রানটাইমে:** container-এর `.env` file থেকে নয়, একটা secrets manager থেকে environment variable-এর মাধ্যমে secret inject করুন:

```yaml
# Kubernetes: secret from Vault or AWS Secrets Manager
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-credentials
        key: password
```

## Security Checklist

```
□ Run as non-root user (USER instruction + runAsNonRoot: true)
□ Read-only root filesystem + explicit writable tmpfs mounts
□ Drop all Linux capabilities (cap-drop: ALL)
□ Default seccomp profile enabled (Docker default, or custom)
□ No privileged mode (privileged: false)
□ No host network or host PID namespace sharing
□ Images pinned to digest in production
□ Vulnerability scanning in CI (Trivy, Grype)
□ npm audit / equivalent for dependency scanning
□ No secrets in Dockerfile, image layers, or build args
□ Secrets injected at runtime from a secrets manager
□ Network policies limit container-to-container traffic
```
