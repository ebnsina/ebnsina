---
title: 'Secrets ও Configuration'
subtitle: 'Environment variables, secret managers, config as code — sensitive data লিক না করে কীভাবে হ্যান্ডল করবেন।'
chapter: 7
level: 'intermediate'
topics: ['secrets', 'env vars', 'config', 'security']
readingTime: '12 মিনিট'
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Configuration-এর স্পেকট্রাম

সবচেয়ে কম sensitive থেকে সবচেয়ে বেশি:

<Callout type="info">

**বাস্তব জীবনের উপমা**

আপনার ব্যাংকের PIN বনাম আপনার display name রাখার মতো — আপনার PIN (secret) নিরাপদে জমা থাকে এবং কখনো দেখানো হয় না, আর আপনার display name (config) খোলাখুলি শেয়ার করা যায়। এই দুটো গুলিয়ে ফেলা মানে হলো আপনার মনিটরে একটা sticky note-এ PIN লিখে রাখা।

</Callout>

```typescript
// 1. Build-time config (baked into image)
//    Feature flags, API URLs, log levels
//    Stored in: config files, committed to git

// 2. Runtime config (environment-specific)
//    Database host, cache TTL, rate limits
//    Stored in: environment variables, config maps

// 3. Secrets (never in code or logs)
//    API keys, database passwords, TLS certs
//    Stored in: secret manager (AWS Secrets Manager, Vault, etc.)
```

## Environment Variables

```typescript
// The twelve-factor app way: configure via environment
const config = {
	port: parseInt(process.env.PORT || '3000'),
	databaseUrl: process.env.DATABASE_URL!,
	redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
	logLevel: process.env.LOG_LEVEL || 'info',
	nodeEnv: process.env.NODE_ENV || 'development'
};

// Validate at startup — fail fast if config is missing
function validateConfig(config: Record<string, unknown>): void {
	const required = ['databaseUrl'];

	for (const key of required) {
		if (!config[key]) {
			throw new Error(`Missing required config: ${key}`);
		}
	}
}

validateConfig(config);
```

<Callout type="warning">

**কখনোই `.env` ফাইল git-এ commit করবেন না।** এখনই `.env`-কে `.gitignore`-এ যোগ করুন। Commit করা secrets git history-তে চিরকাল থেকে যায় — এমনকি আপনি ফাইলটা মুছে ফেললেও যে কেউ `git log` দিয়ে সেটা খুঁজে বের করতে পারে।

</Callout>

## Secret Managers

```typescript
// AWS Secrets Manager / GCP Secret Manager / HashiCorp Vault
// Store secrets centrally, rotate them automatically, audit access

import { SecretsManager } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManager({ region: 'us-east-1' });

async function getSecret(name: string): Promise<string> {
	const response = await client.getSecretValue({ SecretId: name });
	return response.SecretString!;
}

// Load secrets at startup
const dbPassword = await getSecret('prod/database/password');
const stripeKey = await getSecret('prod/stripe/api-key');

// Benefits over env vars:
// - Automatic rotation (e.g., rotate DB password every 30 days)
// - Audit log (who accessed which secret, when)
// - Fine-grained access control (IAM policies)
// - Encryption at rest
```

## Kubernetes Secrets

```yaml
# Create a secret
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
data:
  username: cG9zdGdyZXM= # base64 encoded (NOT encrypted!)
  password: c3VwZXJzZWNyZXQ=

---
# Use in a pod
spec:
  containers:
    - name: api
      env:
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
```

<Callout type="info">

**Kubernetes Secrets base64-encoded, encrypted নয়।** cluster access আছে এমন যে কেউ সেগুলো পড়তে পারে। আসল secret management-এর জন্য External Secrets-এর মতো একটা Kubernetes operator সহ একটা external secret manager (Vault, AWS Secrets Manager) ব্যবহার করুন।

</Callout>

## Secret Rotation

```typescript
// Secrets should be rotated regularly
// The rotation pattern:
// 1. Generate new secret
// 2. Update the application to accept both old and new
// 3. Switch to new secret
// 4. Revoke old secret

// Database password rotation (dual-password approach):
async function rotateDbPassword(): Promise<void> {
	const newPassword = generateSecurePassword();

	// 1. Set new password (old still works)
	await db.execute(`ALTER USER app_user SET PASSWORD = '${newPassword}'`);

	// 2. Update secret manager
	await secretManager.updateSecret('prod/db/password', newPassword);

	// 3. App picks up new password on next connection pool refresh
	// (or trigger a rolling restart)
}
```

## মূল কথা

1. **কখনো secrets git-এ commit করবেন না** — local dev-এর জন্য `.env`, আর production-এর জন্য secret managers ব্যবহার করুন
2. **Startup-এ config validate করুন** — required value না থাকলে fail fast করুন
3. **Production-এর জন্য একটা secret manager ব্যবহার করুন** — env vars rotation, auditing, বা encryption দেয় না
4. **নিয়মিত secrets rotate করুন** — এটা automate করুন যাতে ঝামেলাহীন হয়
