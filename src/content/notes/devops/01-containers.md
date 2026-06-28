---
title: 'Containers & Docker'
subtitle: 'What containers actually are — namespaces, cgroups, layers — and how Docker packages your app to run anywhere.'
chapter: 1
level: 'beginner'
readingTime: '14 min'
topics: ['Docker', 'containers', 'images', 'Dockerfile']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What is a Container?

A container is a process (or group of processes) that runs in isolation from the rest of the system. It has its own filesystem, network, and process tree — but shares the host's kernel. Unlike VMs, containers don't need a separate OS, so they start in milliseconds and use minimal overhead.

<Callout type="info">

**Real-World Analogy**

Like a shipping container at a port — it doesn't matter what's inside (electronics, food, clothes), the container is standardized. Any ship can carry it, any crane can lift it. Docker containers work the same way — your app runs the same everywhere.

</Callout>

Under the hood, containers use two Linux kernel features:

- **Namespaces**: isolate what a process can see (PIDs, network, filesystems, users)
- **Cgroups**: limit what a process can use (CPU, memory, I/O)

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

An image is a read-only filesystem snapshot. Images are built in **layers** — each instruction in a Dockerfile creates a new layer on top of the previous one.

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

**Multi-stage builds** keep images small. Use one stage to build (with dev dependencies), another to run (only production files). A Node.js app image can go from 1GB to 100MB.

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

For local development with multiple services:

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

**Containers vs VMs**: Containers share the host kernel (lightweight, fast start, less isolation). VMs have their own kernel (heavier, slower start, stronger isolation). Use containers for microservices; use VMs when you need full OS isolation or different kernels.

</Callout>

## Key Takeaways

1. **Containers are isolated processes**, not lightweight VMs — they share the host kernel
2. **Images are layered filesystems** — order your Dockerfile for maximum cache hits
3. **Multi-stage builds** dramatically reduce image size
4. **Docker Compose** orchestrates multi-container development environments
