---
title: 'Storage in Practice'
subtitle: 'খরচ অপটিমাইজেশন, access control, প্রাইভেট কনটেন্টের জন্য signed URL, backup strategy, আর অপারেশনাল প্যাটার্ন।'
chapter: 5
level: 'intermediate'
readingTime: '8 মিনিট'
topics:
  [
    'storage cost',
    'access control',
    'signed URLs',
    'backup',
    'disaster recovery',
    'storage operations'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা স্টোরেজ ইউনিট ফ্যাসিলিটি: কিছু ইউনিট খোলা আর পাবলিকের জন্য উন্মুক্ত (public bucket), কিছু চাবি লাগে (signed URL সহ private), ফ্যাসিলিটি ম্যানেজার নিয়ন্ত্রণ করেন কে চাবি পাবে আর কতক্ষণের জন্য। ফ্যাসিলিটি চার্জ করে ব্যবহৃত জায়গা আর আপনি কত ঘন ঘন ইউনিটগুলো অ্যাক্সেস করেন তার ভিত্তিতে — তাই যেসব জিনিস কদাচিৎ দরকার সেগুলো সস্তা দীর্ঘমেয়াদী স্টোরেজে সাজিয়ে রাখেন।

</Callout>

## গল্পে বুঝি

ইবনে সিনার পরিবার নতুন বাসায় উঠেছে, আর ফাতিমা আল-ফিহরি ঠিক করলেন ঘরের জিনিসপত্র বুদ্ধি খাটিয়ে গুছিয়ে রাখবেন। প্রতিদিনের রান্নার জিনিস — চাল, ডাল, তেল, মশলা — এগুলো তিনি রান্নাঘরের সামনের তাকেই হাতের নাগালে রাখলেন। এই জায়গাটা ছোট আর দামি, কিন্তু হাত বাড়ালেই পাওয়া যায়, তাই যা রোজ লাগে সেটাই এখানে থাকে। অন্যদিকে বছরে একবার লাগা শীতের লেপ-কম্বল, পুরনো কাগজপত্র, বাচ্চাদের ছোটবেলার জিনিস — এসব তিনি তুলে দিলেন বাড়ির চিলেকোঠায় (attic)। ওখানে জায়গা প্রচুর আর সস্তা, কিন্তু নামাতে হলে মই বেয়ে ধুলোর মধ্যে উঠতে হয়, ঝামেলা।

ফাতিমা আরেকটা নিয়ম করলেন — তাকের কোনো জিনিসে যদি এক বছর হাত না পড়ে, সেটা এমনিতেই চিলেকোঠায় উঠে যাবে, তাকে জায়গা খালি হবে দরকারি জিনিসের জন্য। আর যেসব কাগজ সত্যিই অপূরণীয় — জন্মসনদ, দলিল — সেগুলোর একটা করে কপি তিনি শহরের ওপারে আল-খোয়ারিজমির বাসায় রেখে এলেন, যাতে এ বাড়িতে কিছু হলেও মূল কপি বেঁচে থাকে।

এই গল্পটাই storage in practice। সামনের **রান্নাঘরের তাক** হলো **hot storage** — দ্রুত, কিন্তু দামি, তাই শুধু ঘনঘন লাগা ডেটা এখানে রাখেন। **চিলেকোঠা** হলো **cold/archive tier** — সস্তা কিন্তু ধীর, কদাচিৎ লাগা ডেটার জন্য। এক বছর না ছোঁয়া জিনিস তাক থেকে চিলেকোঠায় আপনাআপনি সরে যাওয়াটাই **lifecycle/tiering policy** (hot → cold)। আর ওপারের বাসায় রাখা কপিগুলোই **offsite backup**। বাস্তবে AWS S3 ঠিক এভাবেই কাজ করে — সক্রিয় ফাইল থাকে S3 Standard-এ, পুরনো ফাইল lifecycle rule দিয়ে অটোমেটিক নেমে যায় Standard-IA হয়ে Glacier-এ (সস্তা archive, নামাতে সময় লাগে), আর আরেক region-এ mirror করাই আপনার offsite backup।

## Access Patterns

তিনটা access pattern বেশিরভাগ use case কভার করে:

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

প্রাইভেট ফাইল পাবলিকভাবে অ্যাক্সেসযোগ্য নয়। ইউজারের যখন ডাউনলোড করার দরকার হয় তখন একটা time-limited URL জেনারেট করুন:

```typescript
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function getDownloadUrl(key: string, userId: string, ttlSeconds = 3600): Promise<string> {
	// Verify the file belongs to this user before signing
	const file = await db.query(
		'SELECT storage_key FROM user_files WHERE storage_key = $1 AND user_id = $2',
		[key, userId]
	);

	if (file.rows.length === 0) throw new Error('File not found');

	return getSignedUrl(
		s3,
		new GetObjectCommand({
			Bucket: 'user-uploads',
			Key: key,
			ResponseContentDisposition: `attachment; filename="${encodeURIComponent(key.split('/').pop()!)}"`
		}),
		{ expiresIn: ttlSeconds }
	);
}

// Route: generate download link
app.get('/files/:key/download', async (req, res) => {
	const url = await getDownloadUrl(req.params.key, req.user.id);
	res.redirect(302, url); // 302 because URL expires — don't cache
});
```

**TTL গাইডলাইন:**

- ডকুমেন্ট ডাউনলোড: 1 ঘণ্টা
- স্ট্রিমিং ভিডিও: 4–8 ঘণ্টা (session-এর চেয়ে বেশি টিকতে হবে)
- আপলোডের জন্য presigned PUT: 5–15 মিনিট
- presigned URL-এর সাথে যুক্ত API access token: token TTL-এর সাথে মেলান

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

একাধিক bucket ম্যানেজ না করে, prefix ব্যবহার করে স্বাধীনভাবে lifecycle policy আর IAM policy প্রয়োগ করুন।

## Bucket Policies আর IAM

prefix-scoped access সহ MinIO service account:

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
const tenantKey = (tenantId: string, filename: string) => `tenants/${tenantId}/${filename}`;

// For stronger isolation: per-tenant service accounts with mc admin user svcacct
// Tenant A's key cannot access tenant B's prefix
```

## Cost Optimization

object storage-এর খরচের দুটো অংশ: **storage** ($/GB/month) আর **requests** ($/1000 requests)।

```
S3 Standard:          $0.023/GB    + $0.005/1000 PUT  + $0.0004/1000 GET
S3 Standard-IA:       $0.0125/GB   + $0.01/1000 PUT   + $0.001/1000 GET
S3 Glacier Instant:   $0.004/GB    + $0.02/1000 PUT   + $0.01/1000 GET
S3 Glacier Deep:      $0.00099/GB  + retrieval: hours

MinIO (self-hosted):  ~$0.005/GB (hardware cost) + $0 per request
```

lifecycle policy খরচ অপটিমাইজেশন অটোমেট করে:

```typescript
import { PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';

await s3.send(
	new PutBucketLifecycleConfigurationCommand({
		Bucket: 'user-uploads',
		LifecycleConfiguration: {
			Rules: [
				{
					ID: 'temp-cleanup',
					Status: 'Enabled',
					Filter: { Prefix: 'temp/' },
					Expiration: { Days: 1 }
				},
				{
					ID: 'old-documents-to-ia',
					Status: 'Enabled',
					Filter: { Prefix: 'documents/' },
					Transitions: [
						{ Days: 90, StorageClass: 'STANDARD_IA' },
						{ Days: 365, StorageClass: 'GLACIER' }
					]
				},
				{
					ID: 'abort-multipart',
					Status: 'Enabled',
					Filter: {},
					AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 }
				}
			]
		}
	})
);
```

**Deduplication:** একাধিক ইউজার একই ফাইল আপলোড করলে, একবারই জমা করুন:

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
		await s3.send(
			new PutObjectCommand({
				Bucket: 'user-uploads',
				Key: key,
				Body: buffer,
				ContentType: contentType
			})
		);
		return key;
	}
}

// user_files table references the deduped key
// Multiple users can point to the same key
```

## Backup Strategy

**3-2-1 নিয়ম:** 3টা কপি, 2টা ভিন্ন media, 1টা offsite।

MinIO-র জন্য:

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
  schedule: '0 2 * * *' # 2am daily
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

**ব্যাকআপ কাজ করে কিনা যাচাই করুন** — প্রতি ত্রৈমাসিকে restore টেস্ট করুন:

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

DB record ডিলিট হলেও storage object থেকে গেলে ফাইল orphan হয়ে যায়:

```typescript
async function cleanupOrphanedFiles() {
	// Get all storage keys the DB knows about
	const dbKeys = new Set(
		(await db.query('SELECT storage_key FROM user_files')).rows.map((r) => r.storage_key)
	);

	// List all objects in storage
	const orphans: string[] = [];
	let continuationToken: string | undefined;

	do {
		const response = await s3.send(
			new ListObjectsV2Command({
				Bucket: 'user-uploads',
				Prefix: 'documents/',
				ContinuationToken: continuationToken
			})
		);

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
		await s3.send(
			new DeleteObjectsCommand({
				Bucket: 'user-uploads',
				Delete: { Objects: batch.map((Key) => ({ Key })) }
			})
		);
	}
}
```

সাপ্তাহিকভাবে একটা CronJob দিয়ে বা এককালীন ম্যানুয়াল trigger দিয়ে চালান।

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

## Storage মনিটরিং

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
          summary: 'Storage error rate > 1%'

      - alert: StorageCapacityWarning
        expr: minio_node_disk_used_bytes / minio_node_disk_total_bytes > 0.8
        for: 10m
        annotations:
          summary: 'Storage disk {{ $labels.disk }} > 80% full'
```
