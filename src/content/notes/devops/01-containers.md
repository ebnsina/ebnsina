---
title: 'Containers ও Docker'
subtitle: 'Container আসলে কী — namespaces, cgroups, layers — আর Docker কীভাবে আপনার অ্যাপকে প্যাকেজ করে যাতে সেটা যেকোনো জায়গায় চলে।'
chapter: 1
level: 'beginner'
readingTime: '14 মিনিট'
topics: ['Docker', 'containers', 'images', 'Dockerfile']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

বন্দরের ধারে সিনার একটা ছোট ব্যবসা — জাহাজে করে মাল পাঠানো। আগে জিনিসটা ছিল ভয়ানক ঝামেলার। কারও বস্তা, কারও কাঠের বাক্স, কারও আলগা লোহার রড — প্রতিটা জাহাজের জন্য শ্রমিকরা আলাদাভাবে মাল বাঁধত, ফাঁক ভরাট করত, দড়ি দিয়ে টানত। এক জাহাজে যেভাবে সাজানো হতো, পরের জাহাজে আবার পুরোটা খুলে নতুন করে সাজাতে হতো। এক বন্দরে ঠিকঠাক ওঠা মাল আরেক বন্দরের ক্রেনে গিয়ে ফেঁসে যেত, ভেঙে যেত, নাহয় ধরনটাই মিলত না।

তারপর এল standardized স্টিলের container। সিনা এখন মালটা তার সাথে দরকারি সব কিছু — প্যাকিং, কুশন, বাঁধুনি — একসাথে একটা সিল করা বাক্সে ভরে দেয়। বাক্সের ভেতরে কী আছে সেটা জাহাজ, ক্রেন বা ট্রাকের জানার দরকার নেই; সবাই ঠিক একই মাপের একই বাক্সকে একইভাবে ধরে, তোলে, রাখে। ফাতিমার বন্দর হোক বা খোয়ারিজমির — বাক্সটা কোথাও না খুলে, নতুন করে না বেঁধে, হুবহু একইরকম চলে যায়।

এই সিল করা container-টাই আসলে একটা **Docker container/image** — অ্যাপ আর তার সব **dependency** একসাথে এক বাক্সে বাঁধা। "সব বন্দরে একইভাবে হ্যান্ডল হয়" মানে অ্যাপটা যেকোনো মেশিনে হুবহু একই রকম চলে — আর কোনো "আমার মেশিনে তো চলছিল" নেই, কারণ প্রতি জাহাজে নতুন করে প্যাক করার দরকারই নেই। আর গোটা একটা গুদাম জাহাজে তোলার বদলে শুধু দরকারি বাক্সটা পাঠানো যেমন হালকা, তেমনি container একটা full **VM**-এর চেয়ে অনেক হালকা — নিজের আলাদা OS বয়ে বেড়াতে হয় না। বাস্তবে **Docker** ঠিক এই কাজটাই করে।

## Container কী?

Container হলো এমন একটা process (বা process-এর গ্রুপ) যেটা সিস্টেমের বাকি অংশ থেকে আলাদা হয়ে (isolation-এ) চলে। এর নিজের filesystem, network আর process tree থাকে — কিন্তু এটা host-এর kernel শেয়ার করে। VM-এর মতো নয়, container-এর আলাদা কোনো OS লাগে না, তাই এটা মিলিসেকেন্ডেই চালু হয় আর খুব সামান্য overhead নেয়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

বন্দরের একটা shipping container-এর কথা ভাবুন — ভেতরে কী আছে (ইলেকট্রনিকস, খাবার, কাপড়) তাতে কিছু যায়-আসে না, container-টা standardized। যেকোনো জাহাজ সেটা বহন করতে পারে, যেকোনো crane সেটা তুলতে পারে। Docker container ঠিক একইভাবে কাজ করে — আপনার অ্যাপ সব জায়গায় একইরকম চলে।

</Callout>

ভেতরের দিকে দেখলে, container দুটো Linux kernel feature ব্যবহার করে:

- **Namespaces**: একটা process কী দেখতে পাবে সেটা isolate করে (PIDs, network, filesystems, users)
- **Cgroups**: একটা process কতটুকু ব্যবহার করতে পারবে সেটা limit করে (CPU, memory, I/O)

```typescript
// Conceptual model — a container is just a confined process
interface Container {
	namespaces: {
		pid: number; // process sees its own PID tree
		net: string; // its own network stack
		mnt: string; // its own filesystem
		user: string; // its own user IDs
	};
	cgroups: {
		cpuLimit: number; // e.g., 0.5 = half a core
		memoryLimit: string; // e.g., "512m"
		ioWeight: number;
	};
	rootfs: string; // the container's filesystem (image layers)
	entrypoint: string[]; // what to run
}
```

## Docker Images

Image হলো একটা read-only filesystem snapshot। Image তৈরি হয় **layer**-এ — Dockerfile-এর প্রতিটা instruction আগের layer-এর ওপর একটা নতুন layer তৈরি করে।

```dockerfile
# Each line creates a layer
FROM node:20-alpine          # Base layer: Alpine Linux + Node.js
WORKDIR /app                 # Metadata only (no new layer)
COPY package*.json ./        # Layer: package files
RUN npm ci --production      # Layer: node_modules
COPY . .                     # Layer: application code
RUN npm run build            # Layer: build output
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```typescript
// Why layers matter:
// 1. Caching — unchanged layers are reused (fast rebuilds)
// 2. Sharing — 10 containers from the same image share base layers
// 3. Size — only changed layers are pushed/pulled

// Layer order matters for cache efficiency:
// ✗ COPY . . then RUN npm install  → any code change invalidates npm install
// ✓ COPY package.json then RUN npm install then COPY . .  → code changes only rebuild last layer
```

<Callout type="tip">

**Multi-stage build** image ছোট রাখে। একটা stage ব্যবহার করুন build করার জন্য (dev dependency সহ), আরেকটা run করার জন্য (শুধু production file)। একটা Node.js অ্যাপ image 1GB থেকে 100MB-তে নেমে আসতে পারে।

</Callout>

## Multi-Stage Builds

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production (only what's needed to run)
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

## Docker Compose

একাধিক service নিয়ে local development-এর জন্য:

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgres://postgres:secret@db:5432/myapp
      REDIS_URL: redis://cache:6379
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: myapp
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready']
      interval: 5s
      timeout: 3s

  cache:
    image: redis:7-alpine

volumes:
  pgdata:
```

<Callout type="info">

**Containers vs VMs**: Container host-এর kernel শেয়ার করে (হালকা, দ্রুত চালু হয়, isolation কম)। VM-এর নিজের kernel থাকে (ভারী, চালু হতে ধীর, isolation শক্তিশালী)। Microservice-এর জন্য container ব্যবহার করুন; পুরো OS isolation বা আলাদা kernel দরকার হলে VM ব্যবহার করুন।

</Callout>

## মূল বিষয়গুলো

1. **Container হলো isolated process**, হালকা VM নয় — এরা host-এর kernel শেয়ার করে
2. **Image হলো layered filesystem** — সর্বোচ্চ cache hit পেতে Dockerfile-এর ক্রম ঠিক করুন
3. **Multi-stage build** image-এর সাইজ নাটকীয়ভাবে কমায়
4. **Docker Compose** একাধিক container-এর development environment orchestrate করে
