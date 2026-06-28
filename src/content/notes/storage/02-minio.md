---
title: 'Self-Hosted Object Storage with MinIO'
subtitle: 'Running MinIO on your own hardware, S3-compatible API, distributed mode, lifecycle policies, and using it from application code.'
chapter: 2
level: 'beginner'
readingTime: '10 min'
topics: ['MinIO', 'S3', 'object storage', 'self-hosted', 'distributed', 'buckets']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Building a post office branch instead of routing everything through Amazon: same service (package delivery), same rules (addresses, tracking), your own infrastructure. MinIO speaks the S3 API so any code written for Amazon S3 works unchanged — you just point it at your server instead of Amazon's.

</Callout>

## Why MinIO

MinIO is an S3-compatible object storage server written in Go. The entire thing is a single binary. Use it when:

- You can't send data to AWS (air-gapped, regulation, cost)
- You want S3-compatible storage on Hetzner or your own hardware
- Local S3-compatible development environment
- Egress costs from AWS are prohibitive

The S3 API compatibility means existing code — SDKs, libraries, tools — works unchanged.

## Single-Node Setup

```bash
# Docker
docker run -d \
  --name minio \
  -p 9000:9000 \     # API
  -p 9001:9001 \     # Console UI
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=supersecretpassword \
  -v /data/minio:/data \
  minio/minio server /data --console-address ":9001"
```

```yaml
# docker-compose.yml
services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - '9000:9000'
      - '9001:9001'
    environment:
      MINIO_ROOT_USER: admin
      MINIO_ROOT_PASSWORD: supersecretpassword
    volumes:
      - minio_data:/data
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 30s
```

Access the console at `http://localhost:9001`. Create buckets, manage users, set policies.

## Distributed Mode (Production)

Single-node MinIO has no redundancy. For production, run 4+ nodes with erasure coding:

```bash
# On each of 4 nodes (16 drives total — 4 per node)
docker run -d \
  --name minio \
  --network host \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=supersecretpassword \
  -e MINIO_VOLUMES="http://minio-{1...4}/data{1...4}" \
  -v /data1:/data1 -v /data2:/data2 -v /data3:/data3 -v /data4:/data4 \
  minio/minio server

# MINIO_VOLUMES uses expansion syntax:
# minio-{1...4} → minio-1, minio-2, minio-3, minio-4
# /data{1...4}  → /data1, /data2, /data3, /data4
```

MinIO uses Reed-Solomon erasure coding — with 16 drives, it can tolerate losing any 8 and still serve data. With 4 drives (minimum), tolerates 2 failures.

Place a load balancer (nginx or HAProxy) in front of all nodes:

```nginx
upstream minio {
    server minio-1:9000;
    server minio-2:9000;
    server minio-3:9000;
    server minio-4:9000;
}

server {
    listen 9000;
    location / {
        proxy_pass http://minio;
        proxy_set_header Host $host;
        client_max_body_size 1g;
    }
}
```

## Application Code (AWS SDK)

MinIO speaks S3 — use the official AWS SDK, just point the endpoint at MinIO:

```typescript
import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
	endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
	region: 'us-east-1', // required by SDK but ignored by MinIO
	credentials: {
		accessKeyId: process.env.MINIO_ACCESS_KEY!,
		secretAccessKey: process.env.MINIO_SECRET_KEY!
	},
	forcePathStyle: true // required for MinIO (vs virtual-hosted style)
});

const BUCKET = 'user-uploads';

// Upload
async function uploadFile(key: string, body: Buffer, contentType: string) {
	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: body,
			ContentType: contentType,
			Metadata: {
				'uploaded-by': 'order-service'
			}
		})
	);
	return `${process.env.MINIO_PUBLIC_URL}/${BUCKET}/${key}`;
}

// Download
async function downloadFile(key: string): Promise<Buffer> {
	const response = await s3.send(
		new GetObjectCommand({
			Bucket: BUCKET,
			Key: key
		})
	);
	const chunks: Uint8Array[] = [];
	for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}

// Delete
async function deleteFile(key: string) {
	await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// List objects with prefix
async function listFiles(prefix: string) {
	const response = await s3.send(
		new ListObjectsV2Command({
			Bucket: BUCKET,
			Prefix: prefix,
			MaxKeys: 1000
		})
	);
	return response.Contents ?? [];
}
```

## Presigned URLs

Let clients upload directly to MinIO — no proxying through your server:

```typescript
// Generate upload URL (client uploads directly to MinIO)
async function getUploadUrl(key: string, contentType: string): Promise<string> {
	const command = new PutObjectCommand({
		Bucket: BUCKET,
		Key: key,
		ContentType: contentType
	});
	return getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes
}

// Generate download URL (time-limited access to private files)
async function getDownloadUrl(key: string): Promise<string> {
	const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
	return getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
}
```

```typescript
// API endpoint: client requests upload URL, then uploads directly
app.post('/files/upload-url', async (req, res) => {
	const { filename, contentType } = req.body;
	const key = `uploads/${req.userId}/${Date.now()}-${filename}`;
	const uploadUrl = await getUploadUrl(key, contentType);
	res.json({ uploadUrl, key });
});

// Client code (browser)
const { uploadUrl, key } = await fetch('/files/upload-url', {
	method: 'POST',
	body: JSON.stringify({ filename: file.name, contentType: file.type })
}).then((r) => r.json());

await fetch(uploadUrl, {
	method: 'PUT',
	body: file,
	headers: { 'Content-Type': file.type }
});
```

Direct upload bypasses your server entirely — reduces your bandwidth costs and server load.

## Bucket Policies

Control public access per bucket:

```typescript
import { PutBucketPolicyCommand } from '@aws-sdk/client-s3';

// Make a bucket publicly readable (for serving static assets)
const publicReadPolicy = {
	Version: '2012-10-17',
	Statement: [
		{
			Effect: 'Allow',
			Principal: { AWS: ['*'] },
			Action: ['s3:GetObject'],
			Resource: ['arn:aws:s3:::public-assets/*']
		}
	]
};

await s3.send(
	new PutBucketPolicyCommand({
		Bucket: 'public-assets',
		Policy: JSON.stringify(publicReadPolicy)
	})
);
```

```bash
# Or via MinIO CLI (mc)
mc alias set myminio http://localhost:9000 admin supersecretpassword
mc mb myminio/public-assets
mc anonymous set public myminio/public-assets
```

## Lifecycle Policies

Auto-delete or transition objects:

```typescript
import { PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';

await s3.send(
	new PutBucketLifecycleConfigurationCommand({
		Bucket: 'user-uploads',
		LifecycleConfiguration: {
			Rules: [
				{
					ID: 'delete-temp-files',
					Status: 'Enabled',
					Filter: { Prefix: 'temp/' },
					Expiration: { Days: 1 } // delete temp files after 1 day
				},
				{
					ID: 'delete-old-logs',
					Status: 'Enabled',
					Filter: { Prefix: 'logs/' },
					Expiration: { Days: 90 } // delete logs after 90 days
				}
			]
		}
	})
);
```

## MinIO as Local S3 in Development

```yaml
# docker-compose.dev.yml — use MinIO locally to mirror production S3 behavior
services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - '9000:9000'
      - '9001:9001'
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_dev:/data

  # Create buckets on startup
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        mc alias set local http://minio:9000 minioadmin minioadmin;
        mc mb local/user-uploads;
        mc mb local/public-assets;
        mc anonymous set public local/public-assets;
        exit 0;
      "
```

```bash
# .env.development
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_PUBLIC_URL=http://localhost:9000
```

Switch to S3 in production by changing environment variables — no code changes.

## Monitoring

```bash
# MinIO exposes Prometheus metrics
curl http://localhost:9000/minio/v2/metrics/cluster

# Key metrics:
# minio_bucket_usage_object_total — object count per bucket
# minio_bucket_usage_total_bytes  — storage used per bucket
# minio_s3_requests_total         — request rate by type
# minio_s3_requests_errors_total  — error rate
```

```yaml
# prometheus.yml
scrape_configs:
  - job_name: minio
    metrics_path: /minio/v2/metrics/cluster
    scheme: http
    static_configs:
      - targets: ['minio:9000']
    bearer_token: <minio-prometheus-token>
```

Generate the Prometheus token:

```bash
mc admin prometheus generate myminio cluster
# Returns a bearer token to use in the scrape config
```
