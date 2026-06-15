---
title: "Storage Primitives"
subtitle: "Block, file, and object storage — what each abstraction provides, where each breaks down, and how to choose."
chapter: 1
level: "beginner"
readingTime: "8 min"
topics: ["block storage", "file storage", "object storage", "NFS", "S3", "storage architecture"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Three ways to store physical documents: block storage is blank notebooks — raw pages, you organize them however you want. File storage is a filing cabinet — pre-organized into folders and drawers, multiple people can open it at once. Object storage is a flat warehouse with numbered bins — each bin has a label, you fetch the whole bin at once, no filing system, infinite warehouse.

</Callout>

## Block Storage

Raw, addressable storage presented as a disk. The operating system handles the filesystem on top.

```
Application
    ↓
Filesystem (ext4, XFS, APFS)
    ↓
Block device (/dev/sda, /dev/nvme0n1)
    ↓
Physical disk or network-attached block (EBS, Longhorn, Ceph)
```

**Characteristics:**
- Low-level — the OS decides how to organize data
- Random access — seek to any byte position
- Single-attach — one server mounts a block device at a time (with exceptions)
- Fastest — databases, VMs, OS volumes
- Not inherently sharable — can't mount the same EBS volume on two EC2 instances simultaneously

**Use for:** databases (Postgres, MySQL, MongoDB data directories), VM images, OS volumes.

## File Storage (Network Filesystem)

A filesystem shared over a network — multiple servers mount the same directory and see the same files.

```
Server A              Server B
    \                 /
     NFS / SMB / CIFS
         |
    Fileserver (Synology, EFS, Azure Files)
```

**Characteristics:**
- Familiar filesystem API (`open`, `read`, `write`, `ls`)
- Multi-mount — many servers read/write simultaneously
- Distributed locking (with caveats — file locking over NFS is unreliable)
- Slower than local block (network RTT on every operation)
- Not for databases — POSIX compliance gaps cause corruption

**Use for:** shared configuration files, legacy application data that expects a filesystem, media files accessed by a rendering cluster, WordPress uploads shared across app servers.

**NFS quick setup:**
```bash
# Server
apt install nfs-kernel-server
mkdir /exports/shared
echo "/exports/shared 10.0.0.0/24(rw,sync,no_subtree_check)" >> /etc/exports
exportfs -a

# Client
apt install nfs-common
mount -t nfs 10.0.0.10:/exports/shared /mnt/shared

# Add to /etc/fstab for persistence
10.0.0.10:/exports/shared /mnt/shared nfs defaults,_netdev 0 0
```

## Object Storage

Files stored as flat objects (key → binary blob). No hierarchy, no random writes — get and put entire objects.

```
PUT /bucket/user-avatars/user-123.jpg    (store)
GET /bucket/user-avatars/user-123.jpg    (retrieve)
DELETE /bucket/user-avatars/user-123.jpg (delete)
```

**Characteristics:**
- Infinite scale — no capacity planning, no "disk full"
- HTTP API — presigned URLs, direct browser upload
- Eventual consistency (now strongly consistent on AWS S3)
- Immutable by default — can't append to an object, must replace it
- Cheap — $0.023/GB/month on S3 vs $0.10/GB/month for EBS
- Not a filesystem — no `ls` that scales, no random writes, no POSIX

**Use for:** user uploads (images, documents), media files, backups, static assets, logs, large datasets, database dumps.

## Comparison

| | Block | File (NFS) | Object (S3) |
|---|---|---|---|
| **Abstraction** | Raw disk | Filesystem | Key-value |
| **Access pattern** | Random read/write | Sequential + random | Full-object GET/PUT |
| **Multi-mount** | No (mostly) | Yes | Yes (HTTP) |
| **Scale** | Finite (volume size) | Finite (NAS capacity) | Effectively infinite |
| **Speed** | Fastest | Medium | Medium (HTTP overhead) |
| **Cost** | Highest | Medium | Cheapest |
| **Use case** | Databases, VMs | Legacy apps, shared FS | User files, media, backups |

## Choosing in Practice

**User avatar uploads:** object storage. Cheap, scales to millions, serve via CDN, presigned URLs for direct upload from browser.

**Database data directory:** block storage. Must be a real filesystem, must support random I/O.

**Shared config across app servers:** NFS or object storage. For small files read at startup: object storage. For files the app writes to and expects filesystem semantics: NFS.

**Logs:** object storage. Write sequentially, read rarely, keep for months, cheap.

**Video files:** object storage. Large, immutable, serve via CDN with range requests.

**Temp files for a job:** local disk or ephemeral block storage. Cheap, fast, throw away when done.

## The Problem with Local Disk in Distributed Systems

```
Server 1: user uploads avatar.jpg → stored at /data/uploads/avatar.jpg
Server 2: user requests avatar.jpg → 404 (the file is on server 1)
```

Every stateless server instance must reach the same storage. Local disk breaks horizontal scaling. Object storage solves this — all servers make HTTP calls to the same endpoint.

```typescript
// BAD — local disk, breaks with multiple servers
import fs from 'fs/promises';

async function saveAvatar(userId: string, buffer: Buffer) {
  await fs.writeFile(`/data/uploads/${userId}.jpg`, buffer);
}

// GOOD — object storage, works across any number of servers
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });

async function saveAvatar(userId: string, buffer: Buffer) {
  await s3.send(new PutObjectCommand({
    Bucket: 'my-uploads',
    Key: `avatars/${userId}.jpg`,
    Body: buffer,
    ContentType: 'image/jpeg',
  }));
}
```

## POSIX vs S3 Semantics

File operations you can do on a filesystem that don't work on S3:

```bash
# POSIX — works on local disk and NFS
flock -x /data/file.lock     # file locking
tail -f /data/app.log        # append and follow
find /data -name "*.log"     # recursive directory listing
sed -i 's/old/new/' /data/config  # in-place edit

# S3 — none of these work
# Must download the entire object, modify, re-upload
```

If your application does any of these, it can't use S3 directly. Use a local disk or NFS for that specific workload.

## Storage Tiers

Cloud object storage offers multiple tiers at different price/access trade-offs:

```
S3 Standard       $0.023/GB   — frequently accessed data
S3 Standard-IA    $0.0125/GB  — infrequent access, retrieval fee
S3 Glacier        $0.004/GB   — archive, hours to retrieve
S3 Glacier Deep   $0.00099/GB — rare access, up to 12h retrieval

Use lifecycle policies to move data automatically:
  Logs → Standard (1 day) → IA (30 days) → Glacier (90 days) → delete (1 year)
```

```json
{
  "Rules": [{
    "Status": "Enabled",
    "Transitions": [
      { "Days": 30, "StorageClass": "STANDARD_IA" },
      { "Days": 90, "StorageClass": "GLACIER" }
    ],
    "Expiration": { "Days": 365 }
  }]
}
```

