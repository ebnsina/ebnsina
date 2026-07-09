---
title: 'Auth ও Security — রোডম্যাপ'
subtitle: 'Sessions, password hashing, OAuth flows, JWT internals, API keys, common vulnerabilities, এবং production hardening।'
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

একটা security audit: আপনি শুধু সামনের দরজা লক আছে কিনা তা দেখেন না — প্রতিটা জানালা, পেছনের দরজা, লোডিং ডক, আর গার্ড আসলে ক্যামেরা দেখছে কিনা সবই যাচাই করেন। Auth security হলো layered। একটা শক্ত mechanism অন্য জায়গার একটা দুর্বল mechanism-এর ঘাটতি পূরণ করে না।

</Callout>

## আপনি যা শিখবেন

Authentication আর authorization আলাদা সমস্যা যাদের আলাদা সমাধান দরকার। এই track দুটোই কভার করে — কে নিজের identity প্রমাণ করতে পারে তার fundamentals থেকে শুরু করে login endpoint-এ rate limiting আর incident-এ response করার production ডিটেইল পর্যন্ত।

আপনি আসল code লিখবেন: argon2 দিয়ে password hashing, JWKS rotation সহ JWT verification, PKCE সহ OAuth 2.0, scoped permission সহ API key generation, CSRF protection, এবং single-use token সহ পুরো password reset flow।

## এই track-এর chapter-গুলো

1. **Authentication vs Authorization** — দুটো আলাদা প্রশ্ন, দুটো আলাদা system, এদের মিশিয়ে ফেলার সাধারণ ভুল
2. **Password Hashing** — bcrypt আর argon2 কেন আছে, work factor কীভাবে tune করবেন, legacy hash upgrade করা
3. **JWT Deep Dive** — structure, signing algorithm (HS256 vs RS256 vs ES256), JWKS, সাধারণ attack-গুলো
4. **OAuth 2.0 ও OpenID Connect** — delegation vs federation, authorization code flow, public client-এর জন্য PKCE
5. **API Key Management** — generation, storage, scoping, rotation, revocation, abuse detection
6. **Common Vulnerabilities** — CSRF, session fixation, timing attack, IDOR, mass assignment, security header
7. **Auth in Production** — auth endpoint-এ rate limiting, কী log করবেন, password reset flow, incident response
