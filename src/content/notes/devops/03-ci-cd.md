---
title: 'CI/CD Pipelines'
subtitle: 'Automate building, testing, and deploying your code — GitHub Actions, pipeline design, and deployment strategies.'
chapter: 3
level: 'beginner'
readingTime: '15 min'
topics: ['CI/CD', 'GitHub Actions', 'pipelines', 'deployment']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## CI vs CD

**Continuous Integration (CI)**: automatically build and test every code change. Catch bugs before they reach main.

**Continuous Delivery (CD)**: automatically deploy every change that passes CI. Every merge to main is production-ready.

<Callout type="info">

**Real-World Analogy**

Like a car assembly line — welding (build), painting (test), quality inspection (QA), and shipping (deploy). If inspection finds a defect, the car goes back. The line never stops, and each step is automated.

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

## GitHub Actions Example

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

## Pipeline Design Principles

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

**Tag Docker images with the git SHA**, not `latest`. This guarantees you know exactly what code is running in production, and you can roll back to any previous version instantly.

</Callout>

## Deployment Strategies

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

**Never deploy on Friday.** More importantly, never deploy without automated rollback. If your error rate spikes after deployment, the system should roll back automatically — don't rely on someone watching a dashboard.

</Callout>

## Key Takeaways

1. **CI catches bugs early** — lint, typecheck, and test on every push
2. **Fail fast** — run cheap checks first, parallelize independent steps, cache aggressively
3. **One artifact, many environments** — build once, deploy the same image everywhere
4. **Automate rollbacks** — monitor error rates and revert automatically on failure
