---
title: 'Self-Hosted Object Storage with MinIO'
subtitle: 'নিজের হার্ডওয়্যারে MinIO চালানো, S3-compatible API, distributed mode, lifecycle policy, আর অ্যাপ্লিকেশন কোড থেকে এটা ব্যবহার করা।'
chapter: 2
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['MinIO', 'S3', 'object storage', 'self-hosted', 'distributed', 'buckets']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

সবকিছু Amazon-এর মধ্য দিয়ে রাউট করার বদলে নিজের একটা পোস্ট অফিস শাখা বানানো: একই সার্ভিস (প্যাকেজ ডেলিভারি), একই নিয়ম (ঠিকানা, ট্র্যাকিং), কিন্তু আপনার নিজের ইনফ্রাস্ট্রাকচার। MinIO S3 API-তে কথা বলে, তাই Amazon S3-এর জন্য লেখা যেকোনো কোড কোনো পরিবর্তন ছাড়াই চলে — আপনি শুধু Amazon-এর বদলে নিজের সার্ভারের দিকে পয়েন্ট করেন।

</Callout>

## গল্পে বুঝি

শহরের সবচেয়ে বড় রেলস্টেশনে একটা বিখ্যাত জাতীয় ক্লোকরুম চেইন আছে — যাত্রীরা ব্যাগ জমা রেখে একটা claim-ticket পায়, পরে সেই টিকিট দেখিয়ে ব্যাগ ফেরত নেয়। এই চেইনের টিকিটের ফরম্যাট, কাউন্টারের নিয়ম, পোর্টারদের কাজের ধরন — সবকিছু এতটাই প্রমিত যে গোটা দেশের যেকোনো শাখায় একই টিকিট, একই ফরম, একই যন্ত্রপাতি খাটে। সিনার ছোট্ট শহর নিজের একটা ক্লোকরুম গুদাম বানাতে চাইল, কিন্তু চেইনের ফ্র্যাঞ্চাইজি ফি দিতে রাজি না, আর ডেটা-নিয়ন্ত্রণও নিজের হাতে রাখতে চায়।

তাই সিনা চালাক কাজটা করল — নিজের গুদাম বানাল ঠিকই, কিন্তু জাতীয় চেইনের হুবহু একই claim-ticket সিস্টেম আর কাউন্টার প্রসিডিউর হুবহু নকল করে বসাল। ফলে চেইনের জন্য বানানো প্রতিটা ফরম, প্রতিটা টিকিট-স্ক্যানার, প্রশিক্ষিত প্রতিটা পোর্টার — কোনো পরিবর্তন ছাড়াই তার লোকাল গুদামে খাটে। ফাতিমা যেই পোর্টার আগে জাতীয় চেইনে কাজ করত, সে প্রথম দিনেই নতুন গুদামে কাজ শুরু করতে পারল, কারণ প্রসিডিউর তো এক।

এই গল্পটাই আসলে **MinIO**। সিনার নিজের ক্লোকরুম গুদাম হলো **self-hosted object storage** — নিজের হার্ডওয়্যার, নিজের নিয়ন্ত্রণ, কোনো ফ্র্যাঞ্চাইজি ফি নেই মানে **no vendor lock-in**। জাতীয় চেইনের হুবহু একই টিকিট সিস্টেম নকল করাটাই **S3-compatible API** — Amazon S3-এর জন্য লেখা প্রতিটা SDK, টুল আর কোড কোনো বদল ছাড়াই MinIO-র বিরুদ্ধে খাটে। বাস্তবে ঠিক এ কারণেই MinIO জনপ্রিয়: আপনি AWS S3-এর জন্য লেখা `@aws-sdk/client-s3` কোড লিখে রাখেন, শুধু endpoint-টা নিজের সার্ভারের দিকে পয়েন্ট করে দেন — Amazon-কে egress বিল না দিয়েও পুরো S3 ইকোসিস্টেম হাতে থেকে যায়।

## MinIO কেন

MinIO হলো Go-তে লেখা একটা S3-compatible object storage সার্ভার। পুরো জিনিসটা একটা single binary। এটা ব্যবহার করুন যখন:

- আপনি AWS-এ ডেটা পাঠাতে পারবেন না (air-gapped, রেগুলেশন, খরচ)
- আপনি Hetzner বা নিজের হার্ডওয়্যারে S3-compatible স্টোরেজ চান
- লোকাল S3-compatible ডেভেলপমেন্ট এনভায়রনমেন্ট
- AWS থেকে egress খরচ অসহনীয়

S3 API compatibility মানে বিদ্যমান কোড — SDK, লাইব্রেরি, টুল — কোনো পরিবর্তন ছাড়াই চলে।

## Single-Node সেটআপ

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

`http://localhost:9001`-এ console অ্যাক্সেস করুন। bucket তৈরি করুন, ইউজার ম্যানেজ করুন, policy সেট করুন।

## Distributed Mode (Production)

single-node MinIO-তে কোনো redundancy নেই। প্রোডাকশনের জন্য erasure coding সহ 4+ node চালান:

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

MinIO Reed-Solomon erasure coding ব্যবহার করে — 16টা drive থাকলে, এটা যেকোনো 8টা হারানো সহ্য করতে পারে এবং তবুও ডেটা সার্ভ করে। 4টা drive (ন্যূনতম) হলে, 2টা failure সহ্য করে।

সব node-এর সামনে একটা load balancer (nginx বা HAProxy) বসান:

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

## অ্যাপ্লিকেশন কোড (AWS SDK)

MinIO S3-তে কথা বলে — অফিসিয়াল AWS SDK ব্যবহার করুন, শুধু endpoint-টা MinIO-র দিকে পয়েন্ট করুন:

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

ক্লায়েন্টকে সরাসরি MinIO-তে আপলোড করতে দিন — আপনার সার্ভারের মধ্য দিয়ে proxy করা লাগবে না:

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

সরাসরি আপলোড আপনার সার্ভারকে পুরোপুরি বাইপাস করে — আপনার bandwidth খরচ আর সার্ভার লোড কমায়।

## Bucket Policies

প্রতিটা bucket-এ public access নিয়ন্ত্রণ করুন:

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

object অটো-ডিলিট বা transition করুন:

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

## ডেভেলপমেন্টে লোকাল S3 হিসেবে MinIO

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

প্রোডাকশনে শুধু environment variable বদলে S3-তে সুইচ করুন — কোনো কোড পরিবর্তন লাগে না।

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

Prometheus token জেনারেট করুন:

```bash
mc admin prometheus generate myminio cluster
# Returns a bearer token to use in the scrape config
```
