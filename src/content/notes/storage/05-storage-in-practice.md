---
title: "Storage in Practice"
subtitle: "Cost optimization, access control, signed URLs for private content, backup strategy, and operational patterns."
chapter: 5
level: "intermediate"
readingTime: "8 min"
topics: ["storage cost", "access control", "signed URLs", "backup", "disaster recovery", "storage operations"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A storage unit facility: some units are unlocked and open to the public (public bucket), some require a key (private with signed URL), the facility manager controls who gets keys and for how long. The facility charges by space used and by how often you access the units — so you organize things you rarely need into cheaper long-term storage.

</Callout>

## Access Patterns

Three access patterns cover most use cases:

```
1. Public assets (profile avatars, product images, public documents)
   → Public bucket policy, serve via CDN, immutable URLs
   → No auth overhead, maximum cache effectiveness

2. Private user files (invoices, contracts, medical records)
   → Private bucket, presigned URLs with short TTL
   → URL expires so sharing a link doesn't give permanent access

3. Internal service-to-service (backups, exports, ML training data)
   → IAM credentials with least-privilege bucket/prefix access
   → No presigned URLs needed — services authenticate directly
```

## Presigned Download URLs

Private files are not publicly accessible. Generate a time-limited URL when a user needs to download:

```typescript
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function getDownloadUrl(
  key: string,
  userId: string,
  ttlSeconds = 3600
): Promise<string> {
  // Verify the file belongs to this user before signing
  const file = await db.query(
    'SELECT storage_key FROM user_files WHERE storage_key = $1 AND user_id = $2',
    [key, userId]
  );

  if (file.rows.length === 0) throw new Error('File not found');

  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: 'user-uploads',
    Key: key,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(key.split('/').pop()!)}"`,
  }), { expiresIn: ttlSeconds });
}

// Route: generate download link
app.get('/files/:key/download', async (req, res) => {
  const url = await getDownloadUrl(req.params.key, req.user.id);
  res.redirect(302, url);  // 302 because URL expires — don't cache
});
```

**TTL guidance:**
- Document downloads: 1 hour
- Streaming video: 4–8 hours (must outlast the session)
- Presigned PUT for upload: 5–15 minutes
- API access tokens tied to presigned URL: match token TTL

## Bucket Organization

```
user-uploads/
  avatars/{userId}/{hash}.webp          ← public bucket
  documents/{userId}/{uuid}.pdf         ← private bucket
  temp/{userId}/{uuid}                  ← private, lifecycle deletes after 24h

app-assets/
  static/{hash}/{filename}              ← public bucket, CDN origin

backups/
  postgres/{date}/{snapshot}.tar.gz     ← private, lifecycle to Glacier after 30d
  exports/{jobId}/{filename}.csv        ← private, lifecycle deletes after 7d
```

Use prefixes to apply lifecycle policies and IAM policies independently without managing multiple buckets.

## Bucket Policies and IAM

MinIO service account with prefix-scoped access:

```bash
# Create service account limited to one prefix
mc admin user svcacct add myminio app-user \
  --access-key app-access-key \
  --secret-key app-secret-key \
  --policy '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::user-uploads/documents/*"]
    }, {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::user-uploads"],
      "Condition": {
        "StringLike": { "s3:prefix": ["documents/*"] }
      }
    }]
  }'
```

```typescript
// Per-tenant isolation: each tenant gets a dedicated prefix
// The app service account can only access its tenant prefix
const tenantKey = (tenantId: string, filename: string) =>
  `tenants/${tenantId}/${filename}`;

// For stronger isolation: per-tenant service accounts with mc admin user svcacct
// Tenant A's key cannot access tenant B's prefix
```

## Cost Optimization

Object storage cost has two components: **storage** ($/GB/month) and **requests** ($/1000 requests).

```
S3 Standard:          $0.023/GB    + $0.005/1000 PUT  + $0.0004/1000 GET
S3 Standard-IA:       $0.0125/GB   + $0.01/1000 PUT   + $0.001/1000 GET
S3 Glacier Instant:   $0.004/GB    + $0.02/1000 PUT   + $0.01/1000 GET
S3 Glacier Deep:      $0.00099/GB  + retrieval: hours

MinIO (self-hosted):  ~$0.005/GB (hardware cost) + $0 per request
```

Lifecycle policies automate cost optimization:

```typescript
import { PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';

await s3.send(new PutBucketLifecycleConfigurationCommand({
  Bucket: 'user-uploads',
  LifecycleConfiguration: {
    Rules: [
      {
        ID: 'temp-cleanup',
        Status: 'Enabled',
        Filter: { Prefix: 'temp/' },
        Expiration: { Days: 1 },
      },
      {
        ID: 'old-documents-to-ia',
        Status: 'Enabled',
        Filter: { Prefix: 'documents/' },
        Transitions: [
          { Days: 90, StorageClass: 'STANDARD_IA' },
          { Days: 365, StorageClass: 'GLACIER' },
        ],
      },
      {
        ID: 'abort-multipart',
        Status: 'Enabled',
        Filter: {},
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
      },
    ],
  },
}));
```

**Deduplication:** if multiple users upload the same file, store once:

```typescript
import { createHash } from 'crypto';
import { HeadObjectCommand } from '@aws-sdk/client-s3';

async function deduplicatedUpload(buffer: Buffer, contentType: string) {
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const key = `deduped/${sha256}`;

  // Check if already stored
  try {
    await s3.send(new HeadObjectCommand({ Bucket: 'user-uploads', Key: key }));
    return key; // already exists
  } catch {
    // Upload
    await s3.send(new PutObjectCommand({
      Bucket: 'user-uploads',
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    return key;
  }
}

// user_files table references the deduped key
// Multiple users can point to the same key
```

## Backup Strategy

**3-2-1 rule:** 3 copies, 2 different media, 1 offsite.

For MinIO:

```bash
# Mirror MinIO to S3 (offsite backup)
mc mirror --watch --remove \
  myminio/user-uploads \
  s3/mycompany-backup/user-uploads

# Snapshot PostgreSQL + mirror to MinIO
#!/bin/bash
DATE=$(date +%Y-%m-%d-%H%M)
DUMP_FILE="postgres-${DATE}.sql.gz"

pg_dump $DATABASE_URL | gzip > /tmp/$DUMP_FILE

mc cp /tmp/$DUMP_FILE myminio/backups/postgres/$DUMP_FILE

rm /tmp/$DUMP_FILE
```

```yaml
# CronJob in Kubernetes
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
spec:
  schedule: "0 2 * * *"   # 2am daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:16
            command:
            - /bin/sh
            - -c
            - |
              DATE=$(date +%Y-%m-%d)
              pg_dump $DATABASE_URL | gzip | \
                mc pipe myminio/backups/postgres/${DATE}.sql.gz
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
```

**Verify backups work** — test restore quarterly:

```bash
#!/bin/bash
# Download and restore to a test database
LATEST=$(mc ls myminio/backups/postgres/ | sort | tail -1 | awk '{print $NF}')
mc cp myminio/backups/postgres/$LATEST /tmp/restore.sql.gz
gunzip /tmp/restore.sql.gz
psql $TEST_DATABASE_URL < /tmp/restore.sql
echo "Restore completed. Row counts:"
psql $TEST_DATABASE_URL -c "SELECT count(*) FROM users;"
```

## Orphaned File Cleanup

Files get orphaned when DB records are deleted but storage objects remain:

```typescript
async function cleanupOrphanedFiles() {
  // Get all storage keys the DB knows about
  const dbKeys = new Set(
    (await db.query('SELECT storage_key FROM user_files')).rows.map(r => r.storage_key)
  );

  // List all objects in storage
  const orphans: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(new ListObjectsV2Command({
      Bucket: 'user-uploads',
      Prefix: 'documents/',
      ContinuationToken: continuationToken,
    }));

    for (const obj of response.Contents ?? []) {
      if (obj.Key && !dbKeys.has(obj.Key)) {
        // Skip recent files — give uploads time to complete DB write
        const age = Date.now() - (obj.LastModified?.getTime() ?? 0);
        if (age > 24 * 60 * 60 * 1000) {
          orphans.push(obj.Key);
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  console.log(`Found ${orphans.length} orphaned files`);

  // Delete in batches of 1000 (S3 limit)
  for (let i = 0; i < orphans.length; i += 1000) {
    const batch = orphans.slice(i, i + 1000);
    await s3.send(new DeleteObjectsCommand({
      Bucket: 'user-uploads',
      Delete: { Objects: batch.map(Key => ({ Key })) },
    }));
  }
}
```

Run weekly via a CronJob or a one-off manual trigger.

## Operational Checklist

```
□ Versioning enabled on buckets with irreplaceable user data
□ Lifecycle policies set: temp cleanup, old file tiering, multipart abort
□ Backup schedule: daily snapshot + offsite mirror
□ Restore tested: quarterly restore drill to test database
□ Access: least-privilege service accounts, no root credentials in app code
□ Monitoring: bucket usage, request rate, 5xx errors from storage
□ Orphan cleanup: weekly job removes files with no DB reference
□ CDN: static assets served via cache, not direct from origin
□ Content-Type set correctly on upload (browsers rely on it)
□ Signed URL TTL matches use case (short for uploads, longer for streaming)
```

## Monitoring Storage

```typescript
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

// For MinIO: expose Prometheus metrics
// curl http://localhost:9000/minio/v2/metrics/cluster

// Key metrics to alert on:
// minio_bucket_usage_total_bytes > threshold → storage filling up
// minio_s3_requests_errors_total rate > 1%   → error rate spike
// minio_s3_ttfb_seconds_distribution p99 > 1s → latency degradation
```

```yaml
# prometheus alert rules
groups:
  - name: storage
    rules:
      - alert: StorageHighErrorRate
        expr: rate(minio_s3_requests_errors_total[5m]) / rate(minio_s3_requests_total[5m]) > 0.01
        for: 2m
        annotations:
          summary: "Storage error rate > 1%"

      - alert: StorageCapacityWarning
        expr: minio_node_disk_used_bytes / minio_node_disk_total_bytes > 0.8
        for: 10m
        annotations:
          summary: "Storage disk {{ $labels.disk }} > 80% full"
```

