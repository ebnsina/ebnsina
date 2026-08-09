---
title: 'Testing Strategy — রোডম্যাপ'
subtitle: 'Unit, integration, contract, e2e। k6 আর wrk দিয়ে load test। Property-based testing।'
chapter: 0
level: 'beginner'
readingTime: '5 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

তিনটি ভূমিকার একটি QA বিভাগ: ইন্সপেক্টররা assembly line-এ প্রতিটি আলাদা পার্টস টেস্ট করে (unit tests), ইঞ্জিনিয়াররা assemble করা subsystem গুলো একসাথে টেস্ট করে (integration tests), আর mystery shopper-রা একজন সত্যিকারের কাস্টমারের মতো পুরো প্রোডাক্টটা অনুভব করে (e2e tests)। প্রতিটি ভূমিকা আলাদা আলাদা ত্রুটি ধরে ফেলে। একটা ভালো testing strategy তিনটাকেই সঠিক অনুপাতে ব্যবহার করে — সবটাই mystery shopper নয়, আবার সবটাই assembly-line ইন্সপেক্টরও নয়।

</Callout>

## যা শিখবেন

Testing হলো সেই শৃঙ্খলা যা আপনাকে ভয় ছাড়াই কোড বদলাতে দেয়। এই track শুরু হয় strategy দিয়ে — testing pyramid, প্রতিটি layer আপনাকে কী দেয়, আর দল কোথায় ভুল করে। তারপর প্রতিটি layer-এ গভীরে যাওয়া: Vitest দিয়ে unit tests (isolation-এ pure logic), সত্যিকারের database আর HTTP server-এর বিপরীতে integration tests (যেখানে গুরুত্বপূর্ণ সেখানে কোনো mock নয়), contract tests যা microservice-গুলোকে একসাথে deploy না করেই সৎ রাখে, critical user journey-র জন্য Playwright দিয়ে e2e tests, আর fast-check দিয়ে property-based testing যা এমন edge case খুঁজে বের করে যেগুলো আপনি নিজে লিখতেও ভাবতেন না।

## এই track-এর chapter গুলো

1. **Testing Strategy** — testing pyramid, প্রতিটি layer কী টেস্ট করে, mock trap, CI configuration
2. **Unit Testing** — Vitest setup, assertion pattern, spy আর mock, parameterized tests, async
3. **Integration Testing** — transaction rollback সহ real database tests, Testcontainers, supertest দিয়ে HTTP testing, external API-র জন্য msw
4. **Contract Testing** — Pact দিয়ে consumer-driven contract, provider verification, Pact Broker, can-i-deploy
5. **End-to-End Testing** — Playwright setup, selector, auth state reuse, Page Object Model, flakiness প্রতিরোধ, CI
6. **Property-Based Testing** — fast-check arbitraries, invariant properties, round-trip testing, stateful model testing
