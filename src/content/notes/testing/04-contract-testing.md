---
title: 'Contract Testing'
subtitle: 'Service-গুলোকে একসাথে deploy না করেই যাচাই করা যে তারা API contract-এ একমত — consumer-driven contract-এর জন্য Pact।'
chapter: 4
level: 'intermediate'
readingTime: '9 মিনিট'
topics:
  [
    'contract testing',
    'Pact',
    'consumer-driven contracts',
    'API contracts',
    'microservices testing'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

দুটো কোম্পানি production শুরু করার আগেই একটা supply agreement সই করছে: ক্রেতা ঠিক কী দরকার তা নির্দিষ্ট করে (package-এর মাপ, delivery schedule, labeling), আর সরবরাহকারী যাচাই করে যে তারা সেই spec পূরণ করতে পারবে — ক্রেতাকে warehouse-এ দাঁড়িয়ে প্রতিটা shipment দেখতে হয় না। Contract testing service-গুলোর মধ্যে ঠিক এটাই করে — consumer সংজ্ঞায়িত করে সে কী আশা করে, provider যাচাই করে সে সেটা দিতে পারবে, দুটোকে একসাথে চালু রাখার দরকার ছাড়াই।

</Callout>

## গল্পে বুঝি

ফাতিমা আল-ফিহরির একটা কাপড়ের দোকান, আর তার সব থান কাপড় আসে ইবনে সিনার সাপ্লাই গুদাম থেকে। শুরুর দিকে ঝামেলা লেগেই থাকত — ফাতিমা কখনো ফোনে অর্ডার দিত, কখনো চিরকুটে, আর কোন ঘরটায় কী লেখা থাকবে তার কোনো ঠিক ছিল না। ইবনে সিনার লোকজনও কখনো বস্তার গায়ে দাম লিখত, কখনো ভেতরে কাগজে। ফলে মাঝেমধ্যেই ভুল মাপের কাপড় আসত, নয়তো দাম নিয়ে গণ্ডগোল হতো। তাই দুজন বসে একটা স্ট্যান্ডার্ড অর্ডার-ফর্ম বানিয়ে নিল — অর্ডারে ঠিক কোন কোন ঘর থাকবে (কাপড়ের ধরন, মাপ, সংখ্যা), আর ইবনে সিনার জবাবি রসিদে ঠিক কী কী থাকবে (দাম, ডেলিভারির তারিখ, লট নম্বর)। এই ফর্মটাই হলো তাদের মধ্যে চুক্তি।

মজার ব্যাপারটা হলো, এই ফর্ম চালু হওয়ার পর দুজনকে আর প্রতিবার সরাসরি একটা আস্ত লাইভ অর্ডার চালিয়ে মিলিয়ে দেখতে হয় না। ফাতিমা তার লেখা অর্ডারগুলো নিজের দোকানে বসেই ওই ফর্মের নমুনার সাথে মিলিয়ে নেয় — সব ঘর ঠিকঠাক ভরা আছে তো? ওদিকে ইবনে সিনাও তার রসিদগুলো নিজের গুদামে বসে একই ফর্মের সাথে আলাদাভাবে মিলিয়ে নেয়। এখন যদি ইবনে সিনা হঠাৎ কাউকে না জানিয়ে রসিদ থেকে "লট নম্বর" ঘরটা তুলে দেয়, তার নিজের চেকেই সেটা ফর্মের সাথে না মেলার কারণে ধরা পড়ে যায় — কোনো কাপড় ভুল ঠিকানায় পাঠানোর আগেই।

এই গল্পটাই আসলে **contract testing**। দুজনের একমত হওয়া অর্ডার-ফর্মের নমুনা হলো **contract** — request আর response-এর নির্দিষ্ট shape। ফাতিমার দোকান হলো **consumer**, ইবনে সিনার গুদাম হলো **provider**, আর যে যার জায়গায় বসে শুধু ফর্মের সাথে মিলিয়ে দেখাটাই হলো প্রতিটা side-কে shared contract-এর বিপরীতে আলাদাভাবে test করা। কেউ চুপিসারে ফর্ম বদলালে চেক ফেল করাটাই হলো দুই service একসাথে লাইভ না চালিয়েই breaking API change ধরে ফেলা। বাস্তবে **Pact**-এর মতো tool দিয়ে ঠিক এভাবেই microservices-এর মধ্যে consumer-driven contract যাচাই করা হয়।

## Contract Test যে সমস্যাটি সমাধান করে

একটা microservices architecture-এ, service-গুলো একে অপরের API-র ওপর নির্ভর করে। Contract test ছাড়া:

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

আদর্শ tool হলো **Pact** — consumer-driven contract testing-এর জন্য একটা library।

## Consumer Side

consumer (যে service request করে) সংজ্ঞায়িত করে provider কী return করবে বলে সে আশা করে:

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
	dir: path.resolve(process.cwd(), 'pacts') // pact files written here
});

describe('UserClient', () => {
	it('gets a user by ID', async () => {
		await provider.addInteraction({
			states: [{ description: 'user 123 exists' }],
			uponReceiving: 'a request for user 123',
			withRequest: {
				method: 'GET',
				path: '/users/123',
				headers: { Accept: 'application/json' }
			},
			willRespondWith: {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
				body: {
					id: string('123'), // must be a string, value is example only
					email: string('fatima@example.com'),
					name: string('Fatima'),
					role: string('premium')
				}
			}
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
				headers: { Accept: 'application/json' }
			},
			willRespondWith: {
				status: 404,
				body: {
					error: string('User not found')
				}
			}
		});

		await provider.executeTest(async (mockProvider) => {
			const client = new UserClient(mockProvider.url);
			await expect(client.getUser('999')).rejects.toThrow('User not found');
		});
	});
});
```

এই test-গুলো চালালে একটা `pacts/OrderService-UserService.json` file তৈরি হয় — এটাই contract।

## UserClient Implementation

```typescript
// order-service/src/user-client.ts
export class UserClient {
	constructor(private baseUrl: string) {}

	async getUser(userId: string): Promise<User> {
		const res = await fetch(`${this.baseUrl}/users/${userId}`, {
			headers: { Accept: 'application/json' }
		});

		if (res.status === 404) throw new Error('User not found');
		if (!res.ok) throw new Error(`UserService error: ${res.status}`);

		return res.json();
	}
}
```

## Provider Verification

provider (UserService) OrderService চালু না রেখেই যাচাই করে যে সে contract পূরণ করতে পারে:

```typescript
// user-service/src/contract.test.ts
import { PactV3 } from '@pact-foundation/pact';
import { app } from './app';
import path from 'path';
import { testDb } from './test/setup';

describe('Pact provider verification', () => {
	it('fulfills OrderService contract', async () => {
		const server = app.listen(0); // random port
		const port = (server.address() as AddressInfo).port;

		const verifier = new PactV3({
			provider: 'UserService',
			providerBaseUrl: `http://localhost:${port}`,
			pactUrls: [path.resolve(__dirname, '../../order-service/pacts/OrderService-UserService.json')]
		});

		await verifier.verifyProvider({
			stateHandlers: {
				'user 123 exists': async () => {
					// Seed the state required by this interaction
					await testDb.query(
						`INSERT INTO users (id, email, name, role)
             VALUES ('123', 'fatima@example.com', 'Fatima', 'premium')
             ON CONFLICT (id) DO NOTHING`
					);
				},
				'user 999 does not exist': async () => {
					// Ensure user 999 doesn't exist
					await testDb.query('DELETE FROM users WHERE id = $1', ['999']);
				}
			}
		});

		await new Promise((resolve) => server.close(resolve));
	});
});
```

Provider test চললে, Pact প্রতিটি contract interaction real server-এর বিপরীতে replay করে আর যাচাই করে যে response টা consumer যা আশা করেছিল তার সাথে মেলে।

## Pact Broker

অনেক service আছে এমন দলের জন্য, একটা Pact Broker contract-গুলো store ও share করে:

```yaml
# docker-compose.yml
services:
  pact-broker:
    image: pactfoundation/pact-broker
    ports:
      - '9292:9292'
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
	providerVersion: process.env.GIT_SHA ?? '1.0.0'
});

// Provider pulls from broker
const verifier = new PactV3({
	provider: 'UserService',
	providerBaseUrl: `http://localhost:${port}`,
	pactBrokerUrl: 'http://localhost:9292',
	pactBrokerUsername: 'admin',
	pactBrokerPassword: 'password',
	consumerVersionSelectors: [
		{ mainBranch: true }, // contracts from main branch of consumers
		{ deployedOrReleased: true } // contracts from deployed consumers
	],
	publishVerificationResults: true,
	providerVersion: process.env.GIT_SHA
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

`can-i-deploy` broker-কে চেক করে: "এই version-এর সব contract কি সব provider যাচাই করেছে?" যদি না করে থাকে, deployment আটকে দেওয়া হয়।

## একটা ভালো Contract কী দিয়ে তৈরি

**যা রাখবেন:**

- যেসব field আপনার consumer আসলেই ব্যবহার করে (provider যত field return করে সব নয়)
- সফলতা আর পরিচিত error state-এর জন্য response status code
- প্রয়োজনীয় header (Content-Type, auth)

**যা রাখবেন না:**

- আপনার consumer উপেক্ষা করে এমন optional field — contract-এ এগুলো যোগ করলে provider যখন সেগুলো সরায় তখন আপনি ভেঙে পড়েন
- শুধু type-টাই গুরুত্বপূর্ণ এমন exact value — `like()` matcher ব্যবহার করুন
- Provider implementation detail — interface টেস্ট করুন, internal নয়

```typescript
// BAD: over-specified
body: {
  id: '123',                     // exact value — breaks on different IDs
  email: 'fatima@example.com',    // exact value
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

## Pact-এর বিকল্প

ছোট দল বা REST-only API-র জন্য, সহজতর বিকল্প কাজ করে:

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

Contract test service boundary-র সংখ্যার সমানুপাতে ফল দেয়। একটা service → দরকার নেই। shared API সহ দশটা service → অপরিহার্য।
