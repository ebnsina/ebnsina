---
title: "Testing Strategy — Roadmap"
subtitle: "Unit, integration, contract, e2e. Load test with k6 and wrk. Property-based testing."
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

A QA department with three roles: inspectors who test individual parts on the assembly line (unit tests), engineers who test assembled subsystems together (integration tests), and mystery shoppers who experience the full product as a real customer would (e2e tests). Each role catches different defects. A good testing strategy uses all three in the right proportions — not all mystery shoppers, not all assembly-line inspectors.

</Callout>

## What you will learn

Testing is the discipline that lets you change code without fear. This track starts with strategy — the testing pyramid, what each layer buys you, and where teams go wrong. Then goes deep on each layer: unit tests with Vitest (pure logic in isolation), integration tests against real databases and HTTP servers (no mocks where they matter), contract tests that keep microservices honest without deploying them together, e2e tests with Playwright for critical user journeys, and property-based testing with fast-check to find edge cases you'd never think to write.

## Chapters in this track

1. **Testing Strategy** — the testing pyramid, what each layer tests, mock trap, CI configuration
2. **Unit Testing** — Vitest setup, assertion patterns, spies and mocks, parameterized tests, async
3. **Integration Testing** — real database tests with transaction rollback, Testcontainers, HTTP testing with supertest, msw for external APIs
4. **Contract Testing** — consumer-driven contracts with Pact, provider verification, Pact Broker, can-i-deploy
5. **End-to-End Testing** — Playwright setup, selectors, auth state reuse, Page Object Model, flakiness prevention, CI
6. **Property-Based Testing** — fast-check arbitraries, invariant properties, round-trip testing, stateful model testing

