---
title: "Writing Dockerfiles"
subtitle: "Layer caching, multi-stage builds, non-root users, and the instructions that actually matter for production images."
chapter: 2
level: "beginner"
readingTime: "11 min"
topics: ["Dockerfile", "multi-stage builds", "layer cache", "non-root", "image size"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A recipe with prep steps: you don't peel garlic after the dish is plated. In a Dockerfile, order matters — put the steps that change least often first so Docker can cache them. Change your app code without reinstalling all dependencies.

</Callout>

## Layer Caching: Order Matters

Every RUN, COPY, and ADD instruction creates a new layer. Docker caches layers and reuses them if nothing above them changed. Put slow, stable steps early; fast, frequently-changing steps late.

```dockerfile
# WRONG — cache busted on every code change
FROM node:20-alpine
WORKDIR /app
COPY . .                    # copies everything — including source code
RUN npm install             # reinstalls ALL dependencies every time source changes

# RIGHT — dependencies cached separately from source
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./   # only copy dependency specs first
RUN npm ci                               # install — cached until package.json changes
COPY . .                                 # copy source code last
```

With the correct order, changing `server.ts` only rebuilds from the `COPY . .` layer. `npm ci` is skipped because the `package.json` layer didn't change. Build time drops from 2 minutes to 5 seconds.

## Instructions That Matter

```dockerfile
FROM node:20-alpine          # always pin a specific version — 'latest' breaks builds
                             # alpine = minimal OS (~5MB vs ~100MB for debian)

WORKDIR /app                 # sets working directory for subsequent instructions
                             # creates directory if it doesn't exist

COPY package*.json ./        # glob copies both package.json and package-lock.json
RUN npm ci --omit=dev        # ci = reproducible installs from lockfile
                             # --omit=dev = skip devDependencies

COPY --chown=node:node . .   # copy with correct ownership (avoid root-owned files)

ENV NODE_ENV=production      # environment variable baked into image
                             # accessible at runtime

EXPOSE 3000                  # documentation only — doesn't actually open ports
                             # actual port mapping happens at docker run -p

USER node                    # run as non-root (see security section)

CMD ["node", "server.js"]    # default command — can be overridden at runtime
# vs
ENTRYPOINT ["node"]          # fixed executable — CMD provides default args
CMD ["server.js"]
```

**CMD vs ENTRYPOINT:**
```bash
# CMD: fully overridable
docker run myapp node other-script.js  # replaces CMD entirely

# ENTRYPOINT + CMD: entrypoint fixed, CMD is default args
docker run myapp other-script.js  # runs: node other-script.js

# Use ENTRYPOINT for the executable, CMD for default arguments
```

## Multi-Stage Builds

Build in one stage, copy only the output to a minimal final image. Keeps build tools, source code, and test artifacts out of the production image.

```dockerfile
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci                         # includes devDependencies for build
COPY . .
RUN npm run build                  # compile TypeScript → dist/
RUN npm run test                   # run tests in build stage

# Stage 2: production
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev              # production deps only
COPY --from=builder /app/dist ./dist  # only the compiled output

USER node
CMD ["node", "dist/server.js"]

# Result: production image has no TypeScript, no devDependencies, no source maps
# Builder: ~800MB    Production: ~150MB
```

**Go multi-stage (produces a ~10MB image):**
```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-w -s" -o server ./cmd/server

# Scratch: literally empty — no OS, just the binary
FROM scratch
COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
ENTRYPOINT ["/server"]

# Final image: ~10MB (the binary + TLS certs)
```

## Security: Run as Non-Root

By default, containers run as root. A process that escapes the container's namespaces runs as root on the host — extremely dangerous.

```dockerfile
FROM node:20-alpine

# node:20-alpine already has a 'node' user (UID 1000)
# Just switch to it before CMD

WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .

# Switch to non-root user
USER node

CMD ["node", "server.js"]
```

```bash
# Verify non-root
docker run --rm myapp whoami
# node

# If your app needs to bind to port <1024 (requires root on Linux):
# Option 1: bind to port 3000+, use host networking or reverse proxy
# Option 2: use CAP_NET_BIND_SERVICE capability (least privilege)
docker run --cap-add=NET_BIND_SERVICE myapp
```

## .dockerignore

Exclude files that shouldn't go into the build context — speeds up builds and prevents secrets leaking into images:

```
# .dockerignore
node_modules/        # don't copy — they'll be reinstalled inside
dist/                # don't copy — they'll be rebuilt
.git/                # large, unnecessary
*.log                # logs don't belong in images
.env                 # NEVER copy .env files — secrets go in at runtime
.env.*
coverage/
.nyc_output/
__tests__/
*.test.ts
README.md
docker-compose*.yml  # build context, not needed in image
```

Without `.dockerignore`, `COPY . .` sends `node_modules` (hundreds of MB) to the Docker daemon on every build, even though they'll be overwritten by `npm ci`.

## Keeping Images Small

```bash
# Check layer sizes
docker history myapp:latest
# IMAGE         CREATED BY                          SIZE
# <hash>        CMD ["node" "server.js"]            0B
# <hash>        USER node                           0B
# <hash>        COPY . .                            2.1MB
# <hash>        RUN npm ci --omit=dev               45MB   ← usually the big one
# <hash>        COPY package*.json ./               8.5kB
# <hash>        WORKDIR /app                        0B
# <hash>        /bin/sh -c #(nop) FROM node:20-…   0B

# Full image size
docker images myapp
# REPOSITORY   TAG      SIZE
# myapp        latest   98MB   ← target: under 200MB for Node apps
```

**Reducing size:**

```dockerfile
# Use alpine base
FROM node:20-alpine    # ~170MB
# vs
FROM node:20           # ~1.1GB

# Clean up in the same RUN layer (separate RUN creates a layer that can't be removed)
RUN apk add --no-cache python3 make g++ \
    && npm ci \
    && apk del python3 make g++    # remove build deps in same layer

# Use --omit=dev
RUN npm ci --omit=dev

# Avoid copying unnecessary files (.dockerignore)
```

## Health Checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Or with curl
HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1
```

Health checks let Docker (and orchestrators) detect a running-but-broken container. Without them, a container that started but crashed internally looks healthy.

## Dockerfile for a Typical Node.js API

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --chown=node:node package.json ./

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/server.js"]
```

This pattern: `base` → `deps` (prod deps) + `builder` (full build) → `production` (clean final image). Common in modern Node.js projects.

