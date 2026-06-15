---
title: "Contract Testing"
subtitle: "Verify that services agree on the API contract without deploying them together — Pact for consumer-driven contracts."
chapter: 4
level: "intermediate"
readingTime: "9 min"
topics: ["contract testing", "Pact", "consumer-driven contracts", "API contracts", "microservices testing"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Two companies signing a supply agreement before either starts production: the buyer specifies exactly what they need (package dimensions, delivery schedule, labeling), and the supplier verifies they can meet those specs without the buyer having to stand in the warehouse watching every shipment. Contract testing does the same between services — the consumer defines what it expects, the provider verifies it can deliver, all without requiring both to be running simultaneously.

</Callout>

## The Problem Contract Tests Solve

In a microservices architecture, services depend on each other's APIs. Without contract tests:

```
Integration test approach (fragile):
  - Spin up service A and service B together
  - Slow: requires both services running
  - Brittle: environment differences, data setup
  - Unclear: when it breaks, is it A's fault or B's?

Contract test approach:
  - Consumer defines what it expects in a contract file
  - Provider verifies it can fulfill the contract independently
  - Fast: each runs separately
  - Clear: breaks tell you exactly which field/endpoint changed
```

The canonical tool is **Pact** — a library for consumer-driven contract testing.

## Consumer Side

The consumer (the service making requests) defines what it expects the provider to return:

```bash
npm install -D @pact-foundation/pact
```

```typescript
// order-service/src/user-client.test.ts
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { UserClient } from './user-client';
import path from 'path';

const { like, string, integer } = MatchersV3;

const provider = new PactV3({
  consumer: 'OrderService',
  provider: 'UserService',
  dir: path.resolve(process.cwd(), 'pacts'),  // pact files written here
});

describe('UserClient', () => {
  it('gets a user by ID', async () => {
    await provider.addInteraction({
      states: [{ description: 'user 123 exists' }],
      uponReceiving: 'a request for user 123',
      withRequest: {
        method: 'GET',
        path: '/users/123',
        headers: { Accept: 'application/json' },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: string('123'),        // must be a string, value is example only
          email: string('alice@example.com'),
          name: string('Alice'),
          role: string('premium'),
        },
      },
    });

    await provider.executeTest(async (mockProvider) => {
      const client = new UserClient(mockProvider.url);
      const user = await client.getUser('123');

      expect(user.id).toBe('123');
      expect(user.email).toBeDefined();
    });
  });

  it('returns 404 for missing user', async () => {
    await provider.addInteraction({
      states: [{ description: 'user 999 does not exist' }],
      uponReceiving: 'a request for a missing user',
      withRequest: {
        method: 'GET',
        path: '/users/999',
        headers: { Accept: 'application/json' },
      },
      willRespondWith: {
        status: 404,
        body: {
          error: string('User not found'),
        },
      },
    });

    await provider.executeTest(async (mockProvider) => {
      const client = new UserClient(mockProvider.url);
      await expect(client.getUser('999')).rejects.toThrow('User not found');
    });
  });
});
```

Running these tests generates a `pacts/OrderService-UserService.json` file — the contract.

## The UserClient Implementation

```typescript
// order-service/src/user-client.ts
export class UserClient {
  constructor(private baseUrl: string) {}

  async getUser(userId: string): Promise<User> {
    const res = await fetch(`${this.baseUrl}/users/${userId}`, {
      headers: { Accept: 'application/json' },
    });

    if (res.status === 404) throw new Error('User not found');
    if (!res.ok) throw new Error(`UserService error: ${res.status}`);

    return res.json();
  }
}
```

## Provider Verification

The provider (UserService) verifies it can fulfill the contract without needing OrderService running:

```typescript
// user-service/src/contract.test.ts
import { PactV3 } from '@pact-foundation/pact';
import { app } from './app';
import path from 'path';
import { testDb } from './test/setup';

describe('Pact provider verification', () => {
  it('fulfills OrderService contract', async () => {
    const server = app.listen(0);  // random port
    const port = (server.address() as AddressInfo).port;

    const verifier = new PactV3({
      provider: 'UserService',
      providerBaseUrl: `http://localhost:${port}`,
      pactUrls: [
        path.resolve(__dirname, '../../order-service/pacts/OrderService-UserService.json')
      ],
    });

    await verifier.verifyProvider({
      stateHandlers: {
        'user 123 exists': async () => {
          // Seed the state required by this interaction
          await testDb.query(
            `INSERT INTO users (id, email, name, role)
             VALUES ('123', 'alice@example.com', 'Alice', 'premium')
             ON CONFLICT (id) DO NOTHING`
          );
        },
        'user 999 does not exist': async () => {
          // Ensure user 999 doesn't exist
          await testDb.query('DELETE FROM users WHERE id = $1', ['999']);
        },
      },
    });

    await new Promise(resolve => server.close(resolve));
  });
});
```

When the provider test runs, Pact replays each contract interaction against the real server and verifies the response matches what the consumer expected.

## Pact Broker

For teams with many services, a Pact Broker stores and shares contracts:

```yaml
# docker-compose.yml
services:
  pact-broker:
    image: pactfoundation/pact-broker
    ports:
      - "9292:9292"
    environment:
      PACT_BROKER_DATABASE_URL: postgres://pact:pact@postgres/pact
      PACT_BROKER_BASIC_AUTH_USERNAME: admin
      PACT_BROKER_BASIC_AUTH_PASSWORD: password

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: pact
      POSTGRES_USER: pact
      POSTGRES_PASSWORD: pact
```

```typescript
// Publish pacts to broker (run after consumer tests)
const publisher = new PactV3({
  consumer: 'OrderService',
  provider: 'UserService',
  pactBrokerUrl: 'http://localhost:9292',
  pactBrokerUsername: 'admin',
  pactBrokerPassword: 'password',
  publishVerificationResults: true,
  providerVersion: process.env.GIT_SHA ?? '1.0.0',
});

// Provider pulls from broker
const verifier = new PactV3({
  provider: 'UserService',
  providerBaseUrl: `http://localhost:${port}`,
  pactBrokerUrl: 'http://localhost:9292',
  pactBrokerUsername: 'admin',
  pactBrokerPassword: 'password',
  consumerVersionSelectors: [
    { mainBranch: true },   // contracts from main branch of consumers
    { deployedOrReleased: true },  // contracts from deployed consumers
  ],
  publishVerificationResults: true,
  providerVersion: process.env.GIT_SHA,
});
```

## CI Integration

```yaml
# consumer CI job — runs on every PR
- name: Run consumer tests (generates pacts)
  run: npm test src/user-client.test.ts

- name: Publish pacts to broker
  run: npx pact-broker publish ./pacts --broker-base-url $PACT_BROKER_URL

# provider CI job — runs when contracts change
- name: Verify provider against broker pacts
  run: npm test src/contract.test.ts
  env:
    PACT_BROKER_URL: ${{ secrets.PACT_BROKER_URL }}
    GIT_SHA: ${{ github.sha }}

# Can I deploy? Check if contracts are verified before deploying
- name: Can I deploy?
  run: |
    npx pact-broker can-i-deploy \
      --pacticipant OrderService \
      --version ${{ github.sha }} \
      --to-environment production
```

`can-i-deploy` checks the broker: "have all the contracts for this version been verified by all providers?" If not, deployment is blocked.

## What Makes a Good Contract

**Include:**
- Fields your consumer actually uses (not every field the provider returns)
- Response status codes for success and known error states
- Required headers (Content-Type, auth)

**Don't include:**
- Optional fields your consumer ignores — adding them to the contract breaks you when the provider removes them
- Exact values where only the type matters — use `like()` matchers
- Provider implementation details — test the interface, not the internals

```typescript
// BAD: over-specified
body: {
  id: '123',                     // exact value — breaks on different IDs
  email: 'alice@example.com',    // exact value
  internalServiceId: integer(),  // field consumer doesn't use
  createdAt: string(),           // format not specified — fragile
},

// GOOD: precise about what consumer needs, flexible on what it doesn't
body: {
  id: string(),                  // must be a string
  email: email(),                // must be valid email format
  name: string(),                // must be present
  // don't include internalServiceId — consumer doesn't use it
},
```

## Alternatives to Pact

For smaller teams or REST-only APIs, simpler alternatives work:

```typescript
// OpenAPI-based contract testing: verify provider matches its own spec
import { createOpenApiSpec } from 'openapi-backend';

it('GET /users/:id matches OpenAPI spec', async () => {
  const res = await request.get('/users/123');
  const valid = spec.validateResponse(res, 'GET', '/users/{id}');
  expect(valid.errors).toHaveLength(0);
});

// Or: generate types from OpenAPI and use them in both consumer and provider
// No runtime verification but TypeScript will catch contract drift at build time
```

Contract tests pay off proportional to the number of service boundaries. One service → don't bother. Ten services with shared APIs → essential.

