---
title: 'Container Security'
subtitle: 'Attack surface, capabilities, seccomp, read-only filesystems, and what actually matters for production hardening.'
chapter: 5
level: 'advanced'
readingTime: '10 min'
topics: ['container security', 'capabilities', 'seccomp', 'read-only', 'rootless', 'supply chain']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Defense in depth for a museum: the front door has guards, each wing has alarms, display cases are locked, and the most valuable items are in a vault. No single measure is sufficient — you layer them so that breaching one layer doesn't give access to everything. Container security is the same: non-root + read-only + capability drop + seccomp, together.

</Callout>

## The Threat Model

What you're defending against in a containerized environment:

1. **Compromised application code** — an attacker exploits a bug in your app and gets RCE inside the container
2. **Compromised base image** — a malicious or vulnerable upstream image
3. **Container escape** — exploiting a kernel or runtime vulnerability to escape the container and reach the host
4. **Privilege escalation** — a process inside the container gains capabilities it shouldn't have
5. **Supply chain attack** — a dependency or base image is compromised after you build

Defense in depth: make each of these harder, accept you can't make any of them impossible.

## Non-Root by Default

Running as root inside a container is the most common mistake. If your app is compromised and running as root, the attacker has root — which makes container escapes and lateral movement much easier.

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

**Enforce non-root in Kubernetes:**

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

A read-only filesystem prevents an attacker from writing backdoors, modifying binaries, or installing tools:

```bash
# Run with read-only root filesystem
docker run --read-only myapp

# If your app needs to write (temp files, logs):
docker run --read-only \
  --tmpfs /tmp:rw,size=100m,noexec \    # RAM-backed writable /tmp
  --tmpfs /app/logs:rw,size=50m \       # writable log dir
  myapp
```

**In Kubernetes:**

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

Most apps need to write somewhere. Audit what your app writes and make it explicit — `readOnlyRootFilesystem` forces you to enumerate writable paths rather than having the entire filesystem available.

## Linux Capabilities

The root user has ~40 distinct capabilities (ability to bind port &lt;1024, kill any process, load kernel modules, etc.). Running as root gives all of them. You can run as root but drop all non-essential capabilities:

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

**The right default:** `--cap-drop=ALL` and add back only what testing proves is needed. Use port 3000+ to avoid needing `NET_BIND_SERVICE`.

**In Kubernetes:**

```yaml
securityContext:
  capabilities:
    drop: [ALL]
    add: [] # empty — your app should run without any special capabilities
```

## seccomp Profiles

seccomp (Secure Computing Mode) filters which syscalls a container can make. The default Docker seccomp profile blocks ~44 dangerous syscalls including `ptrace`, `kexec_load`, and `mount`.

```bash
# Default seccomp profile is already applied
docker run --security-opt seccomp=/etc/docker/seccomp.json myapp

# Disable seccomp (don't do this in production)
docker run --security-opt seccomp=unconfined myapp

# Custom profile: only allow syscalls your app actually uses
# Use strace to identify what your app calls, then write a minimal profile
strace -e trace=all -f node server.js 2>&1 | awk -F'(' '{print $1}' | sort -u
```

For most applications, the default Docker seccomp profile is sufficient. Creating a custom minimal profile for high-security workloads requires significant testing but dramatically reduces attack surface.

## Image Supply Chain Security

**Use specific digests, not tags:**

```dockerfile
# WRONG — 'latest' can change to anything
FROM node:20-alpine

# BETTER — specific tag (can still be overwritten)
FROM node:20.11.1-alpine3.19

# BEST — digest is immutable
FROM node:20.11.1-alpine3.19@sha256:bf77dc26e48ea95fca9d1aceb5acfa69d2e546b765ec2abfb502975f1a2d4def
```

**Scan dependencies before build:**

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

**Sign your images:**

```bash
# Sign with cosign (keyless, using OIDC)
cosign sign ghcr.io/org/myapp:v1.0.0

# Verify before deploying
cosign verify ghcr.io/org/myapp:v1.0.0
```

## Secrets Management

Never bake secrets into images:

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

**At runtime:** inject secrets via environment variables from a secrets manager, not from `.env` files in the container:

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
