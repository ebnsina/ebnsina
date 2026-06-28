---
title: 'File Uploads'
subtitle: 'Multipart parsing, validation, virus scanning, direct-to-storage upload, and processing pipelines.'
chapter: 3
level: 'beginner'
readingTime: '9 min'
topics:
  [
    'file uploads',
    'multipart',
    'presigned URLs',
    'validation',
    'image processing',
    'virus scanning'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A package receiving dock: the courier (browser) delivers the package to reception (your server), reception checks it (validates type/size), logs it (generates a key), then sends it to the warehouse (object storage). Or, with a dock-to-warehouse conveyor (presigned URL), the courier drives directly to the warehouse door and drops it off — reception just hands them the dock number in advance.

</Callout>

## Two Upload Patterns

```
Pattern 1: Server-proxied upload
  Browser → POST /upload → Server → S3/MinIO
  Pro: full control, can scan/transform in-flight
  Con: server bandwidth and memory for every upload

Pattern 2: Direct-to-storage (presigned URL)
  Browser → GET /upload-url → Server (returns signed URL)
  Browser → PUT signed-url → S3/MinIO directly
  Pro: zero server bandwidth cost
  Con: validation must happen after the fact (or via object metadata)
```

Choose based on file size and whether you need in-flight processing. Images → direct upload. Documents that need scanning → proxied.

## Proxied Upload (Server Side)

```typescript
import Busboy from 'busboy';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';

const s3 = new S3Client({
	endpoint: process.env.MINIO_ENDPOINT,
	region: 'us-east-1',
	credentials: {
		accessKeyId: process.env.MINIO_ACCESS_KEY!,
		secretAccessKey: process.env.MINIO_SECRET_KEY!
	},
	forcePathStyle: true
});

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export async function handleUpload(req: IncomingMessage, res: ServerResponse, userId: string) {
	return new Promise<{ key: string; url: string }>((resolve, reject) => {
		const bb = Busboy({
			headers: req.headers,
			limits: { fileSize: MAX_BYTES, files: 1 }
		});

		bb.on('file', (fieldname, stream, info) => {
			const { filename, mimeType } = info;

			if (!ALLOWED_TYPES.has(mimeType)) {
				stream.resume(); // drain the stream
				return reject(new Error(`File type not allowed: ${mimeType}`));
			}

			const ext = filename.split('.').pop()?.toLowerCase() ?? 'bin';
			const key = `uploads/${userId}/${randomUUID()}.${ext}`;

			// Stream directly to S3 — no temp file on disk
			const chunks: Buffer[] = [];
			let totalBytes = 0;

			stream.on('data', (chunk: Buffer) => {
				totalBytes += chunk.length;
				chunks.push(chunk);
			});

			stream.on('limit', () => {
				reject(new Error('File too large'));
			});

			stream.on('end', async () => {
				const body = Buffer.concat(chunks);

				await s3.send(
					new PutObjectCommand({
						Bucket: 'user-uploads',
						Key: key,
						Body: body,
						ContentType: mimeType,
						Metadata: {
							'uploaded-by': userId,
							'original-name': encodeURIComponent(filename)
						}
					})
				);

				resolve({
					key,
					url: `${process.env.MINIO_PUBLIC_URL}/user-uploads/${key}`
				});
			});
		});

		bb.on('error', reject);
		req.pipe(bb);
	});
}
```

Busboy streams the multipart body — no buffering the entire file in memory before hitting S3.

## Express / Fastify Integration

```typescript
// Express
import express from 'express';

const app = express();

app.post('/upload', async (req, res) => {
	try {
		const result = await handleUpload(req, res, req.user.id);
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(400).json({ error: (err as Error).message });
	}
});

// Fastify
import Fastify from 'fastify';
import multipart from '@fastify/multipart';

const fastify = Fastify();
fastify.register(multipart, {
	limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

fastify.post('/upload', async (req, reply) => {
	const data = await req.file();
	if (!data) return reply.code(400).send({ error: 'No file' });

	const key = `uploads/${req.user.id}/${randomUUID()}`;

	await s3.send(
		new PutObjectCommand({
			Bucket: 'user-uploads',
			Key: key,
			Body: await data.toBuffer(),
			ContentType: data.mimetype
		})
	);

	return { key };
});
```

## Direct Upload (Presigned URL)

```typescript
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Step 1: client requests an upload URL
app.post('/upload-url', async (req, res) => {
	const { filename, contentType, size } = req.body;

	if (!ALLOWED_TYPES.has(contentType)) {
		return res.status(400).json({ error: 'File type not allowed' });
	}

	if (size > MAX_BYTES) {
		return res.status(400).json({ error: 'File too large' });
	}

	const ext = filename.split('.').pop()?.toLowerCase() ?? 'bin';
	const key = `uploads/${req.user.id}/${randomUUID()}.${ext}`;

	const uploadUrl = await getSignedUrl(
		s3,
		new PutObjectCommand({
			Bucket: 'user-uploads',
			Key: key,
			ContentType: contentType,
			ContentLength: size // enforce exact size — client can't upload more
		}),
		{ expiresIn: 300 }
	); // 5 minutes

	res.json({ uploadUrl, key });
});

// Step 2: after upload, client notifies server to record the file
app.post('/upload-confirm', async (req, res) => {
	const { key } = req.body;

	// Verify the object actually exists in storage
	try {
		await s3.send(new HeadObjectCommand({ Bucket: 'user-uploads', Key: key }));
	} catch {
		return res.status(400).json({ error: 'File not found in storage' });
	}

	// Validate key belongs to this user (check prefix)
	if (!key.startsWith(`uploads/${req.user.id}/`)) {
		return res.status(403).json({ error: 'Forbidden' });
	}

	await db.query(
		'INSERT INTO user_files (user_id, storage_key, created_at) VALUES ($1, $2, NOW())',
		[req.user.id, key]
	);

	res.json({ success: true });
});
```

```typescript
// Client side (browser)
async function uploadFile(file: File) {
	// 1. Request upload URL
	const { uploadUrl, key } = await fetch('/upload-url', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			filename: file.name,
			contentType: file.type,
			size: file.size
		})
	}).then((r) => r.json());

	// 2. Upload directly to storage
	const uploadRes = await fetch(uploadUrl, {
		method: 'PUT',
		body: file,
		headers: { 'Content-Type': file.type }
	});

	if (!uploadRes.ok) throw new Error('Upload failed');

	// 3. Confirm with server
	await fetch('/upload-confirm', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ key })
	});

	return key;
}
```

## File Validation

Never trust the Content-Type header — it comes from the client. Check the actual bytes:

```typescript
import { fileTypeFromBuffer } from 'file-type';

async function validateFileType(buffer: Buffer, claimedType: string): Promise<string> {
	const detected = await fileTypeFromBuffer(buffer);

	if (!detected) throw new Error('Cannot determine file type');

	// Check magic bytes match the claimed type
	if (detected.mime !== claimedType) {
		throw new Error(`File type mismatch: claimed ${claimedType}, detected ${detected.mime}`);
	}

	if (!ALLOWED_TYPES.has(detected.mime)) {
		throw new Error(`File type not allowed: ${detected.mime}`);
	}

	return detected.mime;
}
```

```bash
# Install
npm install file-type
```

For images, also validate dimensions:

```typescript
import sharp from 'sharp';

async function validateImage(buffer: Buffer): Promise<{ width: number; height: number }> {
	const metadata = await sharp(buffer).metadata();

	const MAX_DIMENSION = 8000;
	if ((metadata.width ?? 0) > MAX_DIMENSION || (metadata.height ?? 0) > MAX_DIMENSION) {
		throw new Error('Image dimensions too large');
	}

	return { width: metadata.width!, height: metadata.height! };
}
```

## Image Processing Pipeline

Transform images before storing — resize, convert format, strip metadata:

```typescript
import sharp from 'sharp';

interface ImageVariant {
	suffix: string;
	width: number;
	height?: number;
	format: 'webp' | 'jpeg';
	quality: number;
}

const VARIANTS: ImageVariant[] = [
	{ suffix: 'thumb', width: 150, height: 150, format: 'webp', quality: 80 },
	{ suffix: 'medium', width: 800, format: 'webp', quality: 85 },
	{ suffix: 'large', width: 1920, format: 'webp', quality: 90 }
];

async function processAndStoreImage(buffer: Buffer, userId: string) {
	const id = randomUUID();
	const uploads: Promise<void>[] = [];

	for (const variant of VARIANTS) {
		const processed = await sharp(buffer)
			.rotate() // auto-rotate from EXIF
			.resize(variant.width, variant.height, { fit: 'cover' })
			[variant.format]({ quality: variant.quality })
			.withMetadata({ orientation: undefined }) // strip EXIF GPS, keep color profile
			.toBuffer();

		const key = `images/${userId}/${id}/${variant.suffix}.${variant.format}`;

		uploads.push(
			s3
				.send(
					new PutObjectCommand({
						Bucket: 'user-uploads',
						Key: key,
						Body: processed,
						ContentType: `image/${variant.format}`,
						CacheControl: 'public, max-age=31536000, immutable' // 1 year — content-addressed
					})
				)
				.then(() => undefined)
		);
	}

	await Promise.all(uploads);

	return {
		id,
		urls: VARIANTS.reduce<Record<string, string>>((acc, v) => {
			acc[v.suffix] = `${process.env.CDN_URL}/images/${userId}/${id}/${v.suffix}.${v.format}`;
			return acc;
		}, {})
	};
}
```

## Virus Scanning

For user-uploaded documents and executables — scan before making accessible:

```typescript
import NodeClam from 'clamscan';

const clamscan = await new NodeClam().init({
	clamdscan: {
		socket: '/var/run/clamav/clamd.ctl',
		timeout: 60000
	}
});

async function scanBuffer(buffer: Buffer): Promise<void> {
	const { isInfected, viruses } = await clamscan.scanBuffer(buffer);
	if (isInfected) {
		throw new Error(`Malware detected: ${viruses.join(', ')}`);
	}
}
```

```yaml
# docker-compose.yml — add ClamAV sidecar
services:
  clamav:
    image: clamav/clamav:latest
    volumes:
      - clamav_data:/var/lib/clamav
      - /var/run/clamav:/var/run/clamav
```

For high-throughput, scan asynchronously: store to a quarantine bucket, scan via queue, move to the public bucket on pass or delete on fail.

## Upload Progress Tracking

```typescript
// Client: track progress via XHR (fetch doesn't expose upload progress)
function uploadWithProgress(
	file: File,
	uploadUrl: string,
	onProgress: (percent: number) => void
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();

		xhr.upload.addEventListener('progress', (e) => {
			if (e.lengthComputable) {
				onProgress(Math.round((e.loaded / e.total) * 100));
			}
		});

		xhr.addEventListener('load', () => {
			xhr.status < 400 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
		});

		xhr.addEventListener('error', () => reject(new Error('Network error')));

		xhr.open('PUT', uploadUrl);
		xhr.setRequestHeader('Content-Type', file.type);
		xhr.send(file);
	});
}
```

## Multipart Upload for Large Files

For files > 100MB, use S3 multipart upload — splits into chunks, uploads in parallel, more resilient to network failures:

```typescript
import {
	CreateMultipartUploadCommand,
	UploadPartCommand,
	CompleteMultipartUploadCommand,
	AbortMultipartUploadCommand
} from '@aws-sdk/client-s3';

const PART_SIZE = 10 * 1024 * 1024; // 10MB per part

async function multipartUpload(key: string, buffer: Buffer, contentType: string) {
	const { UploadId } = await s3.send(
		new CreateMultipartUploadCommand({
			Bucket: 'user-uploads',
			Key: key,
			ContentType: contentType
		})
	);

	const parts: { ETag: string; PartNumber: number }[] = [];

	try {
		for (let i = 0; i < Math.ceil(buffer.length / PART_SIZE); i++) {
			const start = i * PART_SIZE;
			const end = Math.min(start + PART_SIZE, buffer.length);
			const partNumber = i + 1;

			const { ETag } = await s3.send(
				new UploadPartCommand({
					Bucket: 'user-uploads',
					Key: key,
					UploadId,
					PartNumber: partNumber,
					Body: buffer.subarray(start, end)
				})
			);

			parts.push({ ETag: ETag!, PartNumber: partNumber });
		}

		await s3.send(
			new CompleteMultipartUploadCommand({
				Bucket: 'user-uploads',
				Key: key,
				UploadId,
				MultipartUpload: { Parts: parts }
			})
		);
	} catch (err) {
		// Clean up incomplete upload (avoid storage costs)
		await s3.send(
			new AbortMultipartUploadCommand({
				Bucket: 'user-uploads',
				Key: key,
				UploadId
			})
		);
		throw err;
	}
}
```

Set a lifecycle rule to abort incomplete multipart uploads automatically:

```typescript
await s3.send(
	new PutBucketLifecycleConfigurationCommand({
		Bucket: 'user-uploads',
		LifecycleConfiguration: {
			Rules: [
				{
					ID: 'abort-incomplete-multipart',
					Status: 'Enabled',
					Filter: {},
					AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 }
				}
			]
		}
	})
);
```
