---
title: 'Image Layers & Registries'
subtitle: 'বাস্তবে layer sharing কীভাবে কাজ করে, দক্ষভাবে push ও pull করা, এবং নিজের registry চালানো।'
chapter: 4
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['image layers', 'registry', 'Docker Hub', 'GHCR', 'self-hosted registry', 'image tagging']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

আপনার filesystem-এর জন্য একটা Git repository: প্রতিটা commit একটা layer, push বা pull করার সময় আপনি শুধু diff-টা ট্রান্সফার করেন, আর একাধিক branch ডুপ্লিকেট না করে common history শেয়ার করতে পারে। Image registry একইভাবে কাজ করে — server-এ ইতিমধ্যে থাকা layer push-এর সময় বাদ পড়ে যায়।

</Callout>

## Layer Sharing কীভাবে কাজ করে

আপনি যখন একটা image push করেন, Docker শুধু সেই layer-গুলো পাঠায় যেগুলো registry-তে আগে থেকে নেই। আপনি যখন pull করেন, শুধু অনুপস্থিত layer-গুলো download হয়। এই কারণেই base image গুরুত্বপূর্ণ: ১০০টা সার্ভিস যদি সবাই `node:20-alpine` ব্যবহার করে, সেই layer একবার store হয়ে শেয়ার হয়।

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

Tag হলো image digest-এর দিকে mutable pointer। একটা digest immutable। ভালো tagging strategy আপনাকে দুটোই দেয়:

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

**প্রোডাকশনে image-কে digest দিয়ে রেফারেন্স করুন — tag দিয়ে নয়:**

```yaml
# docker-compose.prod.yml
services:
  api:
    # Tag can be changed by anyone — digest is immutable
    image: myregistry.io/myapp@sha256:abc123def456...
```

Digest দিয়ে রেফারেন্স করলে নিশ্চিত হয় যে আপনি ঠিক যা টেস্ট করেছেন সেটাই চালাচ্ছেন, পরের push-এর পর `latest` যেদিকে নির্দেশ করে সেটা নয়।

## Public Registry

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

## একটা Self-Hosted Registry চালানো

air-gapped এনভায়রনমেন্ট, caching, বা খরচ নিয়ন্ত্রণের জন্য:

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

**প্রোডাকশন self-hosted-এর জন্য: Harbor বা Gitea Container Registry ব্যবহার করুন** — এগুলো authentication, RBAC, vulnerability scanning, আর একটা যথাযথ web UI যোগ করে।

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

ডিপ্লয় করার আগে পরিচিত vulnerability-র জন্য image scan করুন:

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

**GitHub Actions-এ:**

```yaml
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ghcr.io/${{ github.repository }}:${{ github.sha }}
    format: table
    exit-code: '1'
    severity: HIGH,CRITICAL
```

## Multi-Platform Image

এমন image build করুন যা x86_64 (AMD64) আর ARM (Apple Silicon, Graviton) দুটোতেই চলে:

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

Multi-platform image একটা manifest list হিসেবে store হয় — একটা tag একাধিক platform-specific digest-এর দিকে নির্দেশ করে। Docker হোস্ট আর্কিটেকচারের জন্য স্বয়ংক্রিয়ভাবে সঠিকটা pull করে।

## CI Speed-এর জন্য Layer Optimization

CI build time মূলত layer cache miss। কৌশল:

**Cache export ও import করুন:**

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

**একটা registry cache ব্যবহার করুন:**

```bash
# Use the registry itself as a cache store
docker buildx build \
  --cache-from type=registry,ref=myregistry.io/myapp:cache \
  --cache-to type=registry,ref=myregistry.io/myapp:cache,mode=max \
  --push \
  --tag myregistry.io/myapp:latest \
  .
```

এটা registry থেকে আগের build-এর layer-গুলো pull করে আর সেগুলোকে বর্তমান build-এর cache হিসেবে ব্যবহার করে — এমনকি লোকাল cache ছাড়া একটা ফ্রেশ CI runner-এও।
