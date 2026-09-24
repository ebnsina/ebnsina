---
title: 'Writing Dockerfiles'
subtitle: 'Layer caching, multi-stage build, non-root user, এবং প্রোডাকশন image-এর জন্য যেসব instruction আসলে গুরুত্বপূর্ণ।'
chapter: 2
level: 'beginner'
readingTime: '11 মিনিট'
topics: ['Dockerfile', 'multi-stage builds', 'layer cache', 'non-root', 'image size']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

prep step সহ একটা রেসিপি: রান্না প্লেটে সাজানোর পর আপনি রসুন ছাড়ান না। Dockerfile-এ order-টা গুরুত্বপূর্ণ — যে step-গুলো সবচেয়ে কম বদলায় সেগুলো আগে রাখুন যাতে Docker সেগুলো cache করতে পারে। সব dependency আবার install না করেই আপনার অ্যাপ কোড বদলান।

</Callout>

## গল্পে বুঝি

কর্ডোবার এক নামকরা রাঁধুনি সিনার একটা সিগনেচার পদ আছে, আর সেটা বানানোর নিয়মটা তিনি একটা রেসিপি কার্ডে ধাপে ধাপে লিখে রেখেছেন। কার্ডের একদম উপরে লেখা — শুরু হবে আগে থেকে বানানো একটা মজবুত স্টক দিয়ে, শূন্য থেকে হাঁড়ি চাপাতে হবে না। তারপর নিচে সাজানো নির্দিষ্ট ক্রমে ধাপগুলো: মশলা বাটা, ঘণ্টাখানেক ধরে জ্বাল দেওয়া, শেষে উপরে গার্নিশ ছড়িয়ে দেওয়া। প্রতিটা ধাপের পর রান্নাটা এক ধাপ এগিয়ে একটা নতুন অবস্থায় পৌঁছায়।

সিনা চালাক লোক। তিনি খেয়াল করলেন, স্টক আর মশলা-জ্বালের ধাপগুলো ধীর কিন্তু প্রায় কখনো বদলায় না, অথচ শেষের গার্নিশটা অতিথিভেদে রোজ বদলায় — কখনো ধনেপাতা, কখনো বাদাম। তাই তিনি ধীর, কম-বদলানো ধাপগুলো কার্ডের উপরে আর ঘনঘন-বদলানো গার্নিশটা একদম নিচে রাখলেন। এখন শুধু গার্নিশ বদলালে তাঁকে আবার স্টক ফোটাতে বা মশলা জ্বাল দিতে হয় না — আগের প্রস্তুত ধাপগুলো যেমন ছিল তেমনই পুনর্ব্যবহার করেন, শুধু শেষ ধাপটা নতুন করে করেন। রান্নার সময় ঘণ্টা থেকে নেমে আসে মিনিটে।

এই রেসিপি কার্ডটাই আসলে একটা **Dockerfile** — উপর থেকে নিচে সাজানো ধাপে ধাপে instruction-এর একটা রেসিপি। "আগে থেকে বানানো স্টক দিয়ে শুরু" হলো **FROM base image**, যার উপরে আপনি নিজের অ্যাপ গড়ে তোলেন। কার্ডের প্রতিটা ক্রমিক ধাপ একটা করে instruction, আর প্রতিটা instruction একটা করে **layer** তৈরি করে। শুধু শেষ ধাপ বদলালে আগের প্রস্তুত ধাপগুলো পুনর্ব্যবহার করাটাই **Docker layer caching** — তাই ধীর, স্থিতিশীল ধাপ (base image, dependency install) আগে রাখুন, ঘনঘন বদলানো ধাপ (আপনার source code copy) শেষে। বাস্তবে এই order-ই ঠিক করে দেয় `git push`-এর পর CI-তে আপনার image ৫ সেকেন্ডে build হবে নাকি ২ মিনিট ধরে সব dependency আবার install হবে।

## Layer Caching: Order গুরুত্বপূর্ণ

প্রতিটা RUN, COPY, আর ADD instruction একটা নতুন layer তৈরি করে। Docker layer cache করে আর যদি সেগুলোর উপরের কিছু না বদলায় তবে পুনর্ব্যবহার করে। ধীর, স্থিতিশীল step-গুলো আগে রাখুন; দ্রুত, ঘনঘন বদলানো step-গুলো পরে।

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

সঠিক order-এ, `server.ts` বদলালে শুধু `COPY . .` layer থেকে rebuild হয়। `package.json` layer না বদলানোয় `npm ci` বাদ পড়ে। Build time ২ মিনিট থেকে ৫ সেকেন্ডে নেমে আসে।

## যেসব Instruction গুরুত্বপূর্ণ

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

এক stage-এ build করুন, শুধু আউটপুটটুকু একটা minimal final image-এ copy করুন। এতে build tool, source code, আর test artifact প্রোডাকশন image-এর বাইরে থাকে।

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

**Go multi-stage (একটা ~10MB image তৈরি করে):**

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

## Security: Non-Root হিসেবে চালান

ডিফল্টভাবে containers root হিসেবে চলে। container-এর namespace থেকে বেরিয়ে যাওয়া একটা process হোস্টে root হিসেবে চলে — অত্যন্ত বিপজ্জনক।

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

যেসব file build context-এ যাওয়া উচিত নয় সেগুলো বাদ দিন — এতে build দ্রুত হয় আর secret image-এ leak হওয়া ঠেকায়:

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

`.dockerignore` ছাড়া, `COPY . .` প্রতিটা build-এ `node_modules` (শত শত MB) Docker daemon-এ পাঠায়, যদিও সেগুলো `npm ci` দিয়ে overwrite হয়ে যাবে।

## Image ছোট রাখা

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

**Size কমানো:**

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

Health check Docker (আর orchestrator)-কে একটা চলছে-কিন্তু-নষ্ট container শনাক্ত করতে দেয়। এগুলো ছাড়া, চালু হয়ে ভেতরে ক্র্যাশ করা একটা container দেখতে healthy মনে হয়।

## একটা সাধারণ Node.js API-র জন্য Dockerfile

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

এই প্যাটার্ন: `base` → `deps` (prod deps) + `builder` (full build) → `production` (পরিষ্কার final image)। আধুনিক Node.js প্রজেক্টে খুবই প্রচলিত।
