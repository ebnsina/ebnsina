---
title: 'Containers — Roadmap'
subtitle: 'Docker fundamentals, image layers, multi-stage builds, Compose for local dev, and production security hardening.'
chapter: 0
level: 'beginner'
readingTime: '3 min'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A shipping container system: one standard format that works everywhere — your laptop, CI, staging, production. The runtime details (port numbers, volume mounts, environment variables) change per environment, but the unit itself is identical. That's the promise containers keep when you get the fundamentals right.

</Callout>

## What you will learn

Containers have become the standard unit of deployment, but most engineers use them without understanding what's actually happening. This track goes from first principles — the kernel primitives containers are built on — through writing efficient Dockerfiles, running multi-service environments with Compose, understanding the registry and layer model, and hardening containers for production.

## Chapters in this track

1. **What Are Containers** — namespaces, cgroups, union filesystem, OCI standard, image vs container
2. **Writing Dockerfiles** — layer cache ordering, multi-stage builds, non-root user, .dockerignore, size
3. **Docker Compose** — multi-service environments, networking, depends_on with health checks, profiles
4. **Image Layers & Registries** — layer sharing, tagging strategy, GHCR/ECR, self-hosted, multi-platform
5. **Container Security** — non-root, read-only filesystem, capabilities, seccomp, supply chain, secrets
