---
title: "File & Object Storage — Roadmap"
subtitle: "Local disk, NFS, then self-host MinIO. Build a CDN with nginx and Varnish."
chapter: 0
level: "beginner"
readingTime: "5 min"
topics: ["roadmap"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Three kinds of storage infrastructure: a hard drive you own (block), a shared filing cabinet on the network (file), and a warehouse with numbered bins you access over HTTP (object). This track covers all three — when to use each, how to self-host object storage with MinIO, how to cache files at the edge, and the operational patterns that keep storage cheap and reliable.

</Callout>

## What you will learn

Storage is deceptively simple until you scale. A local disk works fine on one server; it breaks the moment you add a second. This track starts with the three storage primitives — block, file, and object — then goes deep on self-hosted object storage with MinIO, handling file uploads correctly (validation, image processing, direct browser upload), building an edge cache with nginx and Varnish, and the operational discipline that keeps costs down and data safe.

## Chapters in this track

1. **Storage Primitives** — block, file, and object storage; NFS setup; S3 semantics; storage tiers
2. **Self-Hosted Object Storage with MinIO** — single-node and distributed mode; S3-compatible API; presigned URLs; lifecycle policies
3. **File Uploads** — multipart parsing; content-type validation; direct-to-storage upload; image processing; virus scanning; multipart upload for large files
4. **CDN with nginx and Varnish** — HTTP caching headers; nginx proxy_cache; VCL configuration; cache invalidation by URL and tag; monitoring hit rate
5. **Storage in Practice** — access control; presigned download URLs; bucket organization; cost optimization; backup strategy; orphan file cleanup

