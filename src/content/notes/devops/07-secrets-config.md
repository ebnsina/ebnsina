---
title: "Secrets & Configuration"
subtitle: "Environment variables, secret managers, config as code — how to handle sensitive data without leaking it."
chapter: 7
level: "intermediate"
readingTime: "12 min"
topics: ["secrets", "env vars", "config", "security"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Configuration Spectrum

From least sensitive to most:

<Callout type="info">

**Real-World Analogy**

Like keeping your bank PIN vs. your display name — your PIN (secret) is stored securely and never shown, while your display name (config) can be shared openly. Mixing them up is like writing your PIN on a sticky note on your monitor.

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
  port: parseInt(process.env.PORT || "3000"),
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  logLevel: process.env.LOG_LEVEL || "info",
  nodeEnv: process.env.NODE_ENV || "development",
};

// Validate at startup — fail fast if config is missing
function validateConfig(config: Record<string, unknown>): void {
  const required = ["databaseUrl"];

  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required config: ${key}`);
    }
  }
}

validateConfig(config);
```

<Callout type="warning">

**Never commit `.env` files to git.** Add `.env` to `.gitignore` immediately. Committed secrets stay in git history forever — even if you delete the file, anyone can find it with `git log`.

</Callout>

## Secret Managers

```typescript
// AWS Secrets Manager / GCP Secret Manager / HashiCorp Vault
// Store secrets centrally, rotate them automatically, audit access

import { SecretsManager } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManager({ region: "us-east-1" });

async function getSecret(name: string): Promise<string> {
  const response = await client.getSecretValue({ SecretId: name });
  return response.SecretString!;
}

// Load secrets at startup
const dbPassword = await getSecret("prod/database/password");
const stripeKey = await getSecret("prod/stripe/api-key");

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
  username: cG9zdGdyZXM=     # base64 encoded (NOT encrypted!)
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

**Kubernetes Secrets are base64-encoded, not encrypted.** Anyone with cluster access can read them. For real secret management, use an external secret manager (Vault, AWS Secrets Manager) with a Kubernetes operator like External Secrets.

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
  await secretManager.updateSecret("prod/db/password", newPassword);

  // 3. App picks up new password on next connection pool refresh
  // (or trigger a rolling restart)
}
```

## Key Takeaways

1. **Never commit secrets to git** — use `.env` for local dev, secret managers for production
2. **Validate config at startup** — fail fast if required values are missing
3. **Use a secret manager** for production — env vars don't provide rotation, auditing, or encryption
4. **Rotate secrets regularly** — automate it so it's painless

