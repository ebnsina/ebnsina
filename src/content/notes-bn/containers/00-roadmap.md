---
title: 'Containers — রোডম্যাপ'
subtitle: 'Docker-এর মূল ধারণা, image layer, multi-stage build, লোকাল ডেভের জন্য Compose, এবং প্রোডাকশন security hardening।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা শিপিং কন্টেইনার সিস্টেম: একটাই স্ট্যান্ডার্ড ফরম্যাট যা সব জায়গায় কাজ করে — আপনার ল্যাপটপ, CI, staging, production। রানটাইমের ডিটেইল (port নম্বর, volume mount, environment variable) প্রতিটা এনভায়রনমেন্টে বদলায়, কিন্তু ইউনিটটা নিজে হুবহু একই থাকে। মূল ধারণাগুলো ঠিকমতো ধরতে পারলে containers এই প্রতিশ্রুতিটাই রাখে।

</Callout>

## আপনি যা শিখবেন

Containers এখন ডিপ্লয়মেন্টের স্ট্যান্ডার্ড ইউনিট হয়ে গেছে, কিন্তু বেশিরভাগ ইঞ্জিনিয়ার আসলে কী ঘটছে সেটা না বুঝেই এগুলো ব্যবহার করেন। এই ট্র্যাকটা প্রথম নীতি থেকে শুরু করে — যে kernel primitive-এর উপর containers তৈরি হয় — দক্ষ Dockerfile লেখা, Compose দিয়ে multi-service এনভায়রনমেন্ট চালানো, registry ও layer মডেল বোঝা, এবং প্রোডাকশনের জন্য containers hardening পর্যন্ত যাবে।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **What Are Containers** — namespaces, cgroups, union filesystem, OCI standard, image vs container
2. **Writing Dockerfiles** — layer cache ordering, multi-stage builds, non-root user, .dockerignore, size
3. **Docker Compose** — multi-service environments, networking, health check সহ depends_on, profiles
4. **Image Layers & Registries** — layer sharing, tagging strategy, GHCR/ECR, self-hosted, multi-platform
5. **Container Security** — non-root, read-only filesystem, capabilities, seccomp, supply chain, secrets
