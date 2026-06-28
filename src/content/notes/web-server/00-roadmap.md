---
title: 'Web Server Fundamentals — Roadmap'
subtitle: 'Ten chapters that build a working understanding of web servers — from raw TCP sockets to a tuned, hardened nginx in front of a real backend.'
chapter: 0
level: 'beginner'
readingTime: '5 min'
topics: ['roadmap', 'http', 'nginx', 'web server', 'sockets']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What you will be able to do at the end

You will know exactly what happens between "user types a URL" and "your code runs." You will have written a minimal HTTP/1.1 server from raw sockets in code you fully understand, and you will have configured nginx as a reverse proxy in front of a real backend with TLS, caching, logging, and sane defaults.

<Callout type="info">

**Prereqs:** finish the **Linux & VPS basics** track first (or be comfortable on a VPS already). This track assumes you can SSH in, run `systemctl`, edit a config, and read a journal.

</Callout>

## The 10 chapters, in order

**Foundations**

1. **What is a web server** — anatomy of a request, the four stages
2. **HTTP from a raw socket** — speak HTTP with `nc`, then write the server
3. **Building a real HTTP/1.1 parser** — method, headers, body, chunked
4. **Concurrency models** — process-per-request, threads, event loops
5. **Static files & MIME** — serving disk, ETags, cache-control

**Production with nginx**

6. **nginx fundamentals** — install, server blocks, locations, includes
7. **Reverse proxy** — nginx in front of your app, headers, timeouts
8. **Access & error logs** — log formats, what to keep, what to grep

**Going deeper**

9. **Edge caching with nginx** — `proxy_cache`, microcaching, stale-while-revalidate
10. **Performance & hardening** — workers, sendfile, gzip/brotli, security headers, rate limiting

## How to use this track

Read in order. Run every command. The first half builds intuition by writing code you understand. The second half is the production tooling you will actually deploy.

Total reading time: ~2 hours. Hands-on time, the first time: about a weekend.
