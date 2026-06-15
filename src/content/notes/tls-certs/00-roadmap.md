---
title: "TLS & Certificates — Roadmap"
subtitle: "Eight chapters that take TLS from mystery to muscle memory — what it actually does, why every part exists, and how to issue, renew, and serve real certificates without a managed service."
chapter: 0
level: "beginner"
readingTime: "5 min"
topics: ["roadmap", "tls", "ssl", "certificates", "letsencrypt"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What you will be able to do at the end

You will understand exactly what happens during a TLS handshake, what each file in `/etc/letsencrypt/live/` is, how to issue a real certificate from Let's Encrypt by hand and on autopilot, and how to configure nginx for TLS that scores A+ on SSL Labs without copy-pasting some random gist.

<Callout type="info">

**Prereqs:** finish the **Linux & VPS basics** track (you need ssh, systemd, nftables) and at least chapters 6–7 of **Web Server Fundamentals** (nginx basics and reverse proxy). This track assumes you can reload nginx and read its logs.

</Callout>

## The 8 chapters, in order

**Foundations**

1. **What TLS actually is** — encryption + identity, the two halves
2. **The TLS handshake** — what every byte does, ECDHE, AEAD, ALPN
3. **Certificates and the chain of trust** — keys, CSRs, CAs, how validation works

**Issuing real certificates**

4. **Let's Encrypt & ACME** — how the protocol works end-to-end
5. **Issuing your first cert with certbot** — HTTP-01 challenge, walkthrough
6. **Wildcard and DNS-01** — when HTTP challenges are not enough

**Production**

7. **Configuring nginx for TLS** — strong defaults, OCSP stapling, HSTS
8. **Renewal, monitoring, and rotation** — staying alive past 90 days

## How to use this track

Read in order. The first three chapters explain what TLS is doing; the next three issue real certificates step by step; the last two are production hygiene. Total: ~90 minutes reading, half a day hands-on with a real domain and VPS.

You need a domain you control (any registrar — buying a `.com` for $10 is fine for learning) pointed at your VPS's IP via an A record. Without that, Let's Encrypt's validation will not pass.

