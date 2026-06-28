---
title: 'Image Layers & Registries'
subtitle: 'How layer sharing works in practice, pushing and pulling efficiently, and running your own registry.'
chapter: 4
level: 'intermediate'
readingTime: '9 min'
topics: ['image layers', 'registry', 'Docker Hub', 'GHCR', 'self-hosted registry', 'image tagging']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A Git repository for your filesystem: each commit is a layer, you only transfer the diff when you push or pull, and multiple branches can share common history without duplicating it. Image registries work the same way — layers already on the server are skipped during push.

</Callout>

## How Layer Sharing Works

When you push an image, Docker sends only layers that don't already exist in the registry. When you pull, only missing layers are downloaded. This is why base images matter: if 100 services all use `node:20-alpine`, that layer is stored once and shared.

```bash
# Push an image — watch which layers are skipped
docker push myregistry.io/myapp:v1.2.0
# Pushing manifests for platform linux/amd64
# Layer sha256:abc... already exists   ← node:20-alpine layers
# Layer sha256:def... already exists   ← npm install layer (unchanged)
# Pushed sha256:xyz...                 ← only the changed app layer
# v1.2.0: digest: sha256:... size: 1234
```

```bash
# Inspect layers of an image
docker manifest inspect myapp:latest
# Shows each layer digest and size

# See which layers are shared between images
docker images --digests
```

## Tagging Strategy

Tags are mutable pointers to image digests. A digest is immutable. Good tagging strategy gives you both:

```bash
# Semantic versioning + git SHA
docker build -t myapp:v2.1.3 -t myapp:v2.1 -t myapp:v2 -t myapp:latest .

# In CI: use git commit SHA for traceability
docker build \
  -t myregistry.io/myapp:${GIT_SHA} \
  -t myregistry.io/myapp:latest \
  .
docker push myregistry.io/myapp:${GIT_SHA}
docker push myregistry.io/myapp:latest
```

**Reference images by digest in production — not tags:**

```yaml
# docker-compose.prod.yml
services:
  api:
    # Tag can be changed by anyone — digest is immutable
    image: myregistry.io/myapp@sha256:abc123def456...
```

Referencing by digest guarantees you're running exactly what you tested, not whatever `latest` points to after the next push.

## Public Registries

**Docker Hub:**

```bash
docker login
docker push username/myapp:v1.0.0

# Pull (public images don't need login)
docker pull username/myapp:v1.0.0

# Rate limits: 100 pulls/6hr (anonymous), 200/6hr (free account)
# Authenticated pulls from CI: use a service account token
```

**GitHub Container Registry (GHCR):**

```bash
# Authenticate with GitHub token
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

docker push ghcr.io/username/myapp:v1.0.0

# In GitHub Actions — automatic authentication
- name: Login to GHCR
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

**AWS ECR:**

```bash
# Login (credentials from AWS CLI)
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin \
    123456789.dkr.ecr.us-east-1.amazonaws.com

# Push
docker tag myapp:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:latest

# ECR advantages: no pull limits, same-region pulls are free/fast,
# integrated with IAM for authentication
```

## Running a Self-Hosted Registry

For air-gapped environments, caching, or cost control:

**Docker Registry (official, minimal):**

```yaml
# docker-compose.yml for a private registry
services:
  registry:
    image: registry:2
    ports:
      - '5000:5000'
    environment:
      REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY: /data
    volumes:
      - ./registry-data:/data

  # Optional: web UI
  registry-ui:
    image: joxit/docker-registry-ui:latest
    ports:
      - '8080:80'
    environment:
      REGISTRY_TITLE: 'My Registry'
      REGISTRY_URL: http://registry:5000
    depends_on:
      - registry
```

```bash
# Use it
docker push localhost:5000/myapp:v1.0.0
docker pull localhost:5000/myapp:v1.0.0
```

**For production self-hosted: use Harbor or Gitea Container Registry** — they add authentication, RBAC, vulnerability scanning, and a proper web UI.

**Harbor (enterprise-grade):**

```bash
# Install via Helm
helm repo add harbor https://helm.goharbor.io
helm install harbor harbor/harbor \
  --set expose.type=ingress \
  --set expose.ingress.hosts.core=registry.yourapp.com \
  --set externalURL=https://registry.yourapp.com \
  --set harborAdminPassword=secret
```

## Image Scanning

Scan images for known vulnerabilities before deploying:

```bash
# Trivy (open source, fast)
trivy image myapp:latest
# 2024-01-15T10:00:00Z INFO Vulnerability scanning is enabled
# myapp:latest (alpine 3.19.0)
# Total: 3 (HIGH: 1, MEDIUM: 2)

# In CI: fail the build on HIGH+ vulnerabilities
trivy image --exit-code 1 --severity HIGH,CRITICAL myapp:latest

# Grype (alternative)
grype myapp:latest
```

**In GitHub Actions:**

```yaml
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ghcr.io/${{ github.repository }}:${{ github.sha }}
    format: table
    exit-code: '1'
    severity: HIGH,CRITICAL
```

## Multi-Platform Images

Build images that work on both x86_64 (AMD64) and ARM (Apple Silicon, Graviton):

```bash
# Enable buildx (multi-platform builder)
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

# Build and push for both platforms simultaneously
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag myregistry.io/myapp:v1.0.0 \
  --push \          # push directly (can't load multi-platform locally)
  .
```

```yaml
# GitHub Actions: multi-platform build
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    platforms: linux/amd64,linux/arm64
    push: true
    tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
```

Multi-platform images are stored as a manifest list — one tag points to multiple platform-specific digests. Docker automatically pulls the right one for the host architecture.

## Layer Optimization for CI Speed

CI build time is mostly layer cache misses. Strategies:

**Export and import the cache:**

```yaml
# GitHub Actions: cache Docker layers between runs
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build with cache
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: myapp:latest
    cache-from: type=gha # read from GitHub Actions cache
    cache-to: type=gha,mode=max # write back (max = all layers, not just final)
```

**Use a registry cache:**

```bash
# Use the registry itself as a cache store
docker buildx build \
  --cache-from type=registry,ref=myregistry.io/myapp:cache \
  --cache-to type=registry,ref=myregistry.io/myapp:cache,mode=max \
  --push \
  --tag myregistry.io/myapp:latest \
  .
```

This pulls the previous build's layers from the registry and uses them as cache for the current build — even on a fresh CI runner with no local cache.
