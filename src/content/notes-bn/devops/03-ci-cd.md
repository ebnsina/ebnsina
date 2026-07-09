---
title: 'CI/CD পাইপলাইন'
subtitle: 'আপনার কোড বিল্ড, টেস্ট আর ডিপ্লয় অটোমেট করুন — GitHub Actions, পাইপলাইন ডিজাইন, আর ডিপ্লয়মেন্ট স্ট্র্যাটেজি।'
chapter: 3
level: 'beginner'
readingTime: '15 মিনিট'
topics: ['CI/CD', 'GitHub Actions', 'pipelines', 'deployment']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## CI বনাম CD

**Continuous Integration (CI)**: প্রতিটি কোড চেঞ্জ অটোমেটিক্যালি বিল্ড আর টেস্ট করা। main-এ পৌঁছানোর আগেই বাগ ধরে ফেলা।

**Continuous Delivery (CD)**: CI পাস করা প্রতিটি চেঞ্জ অটোমেটিক্যালি ডিপ্লয় করা। main-এ প্রতিটি merge প্রোডাকশন-রেডি।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

গাড়ির অ্যাসেম্বলি লাইনের মতো — ওয়েল্ডিং (build), পেইন্টিং (test), কোয়ালিটি ইনস্পেকশন (QA), আর শিপিং (deploy)। ইনস্পেকশনে যদি কোনো ত্রুটি ধরা পড়ে, গাড়িটা ফেরত যায়। লাইন কখনো থামে না, আর প্রতিটা ধাপ অটোমেটেড।

</Callout>

```typescript
// The CI/CD pipeline:
// Push code → Build → Lint → Test → Security scan → Build image → Deploy

// CI catches:
// - Compilation errors
// - Failed tests
// - Linting violations
// - Security vulnerabilities
// - Type errors

// CD handles:
// - Building Docker images
// - Pushing to registry
// - Deploying to staging/production
// - Running smoke tests
// - Rolling back on failure
```

## GitHub Actions উদাহরণ

```yaml
# .github/workflows/ci.yml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/testdb

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and push Docker image
        run: |
          docker build -t myregistry/api:${{ github.sha }} .
          docker push myregistry/api:${{ github.sha }}

      - name: Deploy to production
        run: |
          kubectl set image deployment/api \
            api=myregistry/api:${{ github.sha }}
          kubectl rollout status deployment/api --timeout=300s
```

## পাইপলাইন ডিজাইন প্রিন্সিপল

```typescript
// 1. Fail fast — run cheap checks first
const pipeline = [
	'lint', // 10 seconds
	'typecheck', // 20 seconds
	'unit-tests', // 1 minute
	'integration', // 3 minutes
	'e2e', // 5 minutes
	'build-image', // 2 minutes
	'deploy' // 1 minute
];
// If lint fails, don't wait for e2e tests

// 2. Parallelize independent steps
// lint + typecheck + unit-tests can run simultaneously

// 3. Cache aggressively
// node_modules, Docker layers, build artifacts
// Cuts pipeline time by 50-80%

// 4. Use the same artifact everywhere
// Build once → test → deploy that exact artifact
// Never rebuild between staging and production
```

<Callout type="tip">

**Docker image-গুলো git SHA দিয়ে ট্যাগ করুন**, `latest` দিয়ে নয়। এতে নিশ্চিত থাকবেন যে প্রোডাকশনে ঠিক কোন কোডটা চলছে, আর যেকোনো আগের ভার্সনে সঙ্গে সঙ্গে roll back করতে পারবেন।

</Callout>

## ডিপ্লয়মেন্ট স্ট্র্যাটেজি

```typescript
// Rolling update: gradually replace old pods with new ones
// + Zero downtime
// + Easy rollback
// - Both versions run simultaneously (handle API compatibility)

// Blue-green: run new version alongside old, switch traffic at once
// + Instant rollback (switch back to old)
// + No mixed versions
// - Requires 2x resources during deployment

// Canary: route a small % of traffic to new version, monitor, then expand
// + Catches issues with minimal user impact
// + Data-driven rollout decisions
// - More complex routing setup

interface DeploymentStrategy {
	type: 'rolling' | 'blue-green' | 'canary';
	config: {
		canaryPercent?: number; // 5% initially
		monitorDuration?: string; // "10m" before increasing
		rollbackThreshold?: number; // error rate > 1% → rollback
	};
}
```

<Callout type="warning">

**কখনো শুক্রবারে ডিপ্লয় করবেন না।** এর চেয়েও জরুরি — অটোমেটেড rollback ছাড়া কখনো ডিপ্লয় করবেন না। ডিপ্লয়মেন্টের পর যদি error rate হঠাৎ বেড়ে যায়, সিস্টেমের নিজে থেকেই roll back করা উচিত — কারও ড্যাশবোর্ডের দিকে তাকিয়ে থাকার উপর ভরসা করবেন না।

</Callout>

## মূল কথা

1. **CI বাগ আগেভাগে ধরে** — প্রতিটি push-এ lint, typecheck আর test চালান
2. **Fail fast** — সস্তা চেকগুলো আগে চালান, স্বাধীন ধাপগুলো parallelize করুন, aggressive-ভাবে cache করুন
3. **এক artifact, অনেক environment** — একবার build করুন, সব জায়গায় সেই একই image ডিপ্লয় করুন
4. **Rollback অটোমেট করুন** — error rate মনিটর করুন আর ব্যর্থ হলে অটোমেটিক্যালি revert করুন
