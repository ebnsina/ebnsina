---
title: 'Auth & Security — Roadmap'
subtitle: 'Sessions, password hashing, OAuth flows, JWT internals, API keys, common vulnerabilities, and production hardening.'
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

A security audit: you don't just check whether the front door is locked — you check every window, the back door, the loading dock, and whether the guard is actually watching the cameras. Auth security is layered. One strong mechanism doesn't make up for a weak one elsewhere.

</Callout>

## What you will learn

Authentication and authorization are different problems that need different solutions. This track covers both — from the fundamentals of who can prove their identity, to the production details of rate limiting login endpoints and responding to incidents.

You'll implement real code: password hashing with argon2, JWT verification with JWKS rotation, OAuth 2.0 with PKCE, API key generation with scoped permissions, CSRF protection, and the full password reset flow with single-use tokens.

## Chapters in this track

1. **Authentication vs Authorization** — two different questions, two different systems, common mistakes mixing them
2. **Password Hashing** — why bcrypt and argon2 exist, how to tune work factors, upgrading legacy hashes
3. **JWT Deep Dive** — structure, signing algorithms (HS256 vs RS256 vs ES256), JWKS, the common attacks
4. **OAuth 2.0 & OpenID Connect** — delegation vs federation, authorization code flow, PKCE for public clients
5. **API Key Management** — generation, storage, scoping, rotation, revocation, abuse detection
6. **Common Vulnerabilities** — CSRF, session fixation, timing attacks, IDOR, mass assignment, security headers
7. **Auth in Production** — rate limiting auth endpoints, what to log, password reset flow, incident response
