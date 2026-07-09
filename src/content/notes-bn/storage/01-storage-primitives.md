---
title: 'Storage Primitives'
subtitle: 'Block, file, আর object storage — প্রতিটা অ্যাবস্ট্রাকশন কী দেয়, কোথায় ভেঙে পড়ে, আর কীভাবে বেছে নেবেন।'
chapter: 1
level: 'beginner'
readingTime: '8 মিনিট'
topics: ['block storage', 'file storage', 'object storage', 'NFS', 'S3', 'storage architecture']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

কাগজের ডকুমেন্ট রাখার তিনটা উপায়: block storage হলো ফাঁকা নোটবুক — কাঁচা পৃষ্ঠা, যেভাবে খুশি সাজান। file storage হলো একটা ফাইলিং ক্যাবিনেট — আগে থেকেই ফোল্ডার আর ড্রয়ারে সাজানো, একসাথে অনেকে খুলতে পারে। object storage হলো নম্বর দেওয়া বিনসহ একটা সমতল ওয়্যারহাউস — প্রতিটা বিনে একটা লেবেল, পুরো বিনটা একবারে তুলে আনেন, কোনো ফাইলিং সিস্টেম নেই, অসীম ওয়্যারহাউস।

</Callout>

## Block Storage

কাঁচা, অ্যাড্রেসযোগ্য স্টোরেজ যা একটা ডিস্ক হিসেবে দেখা যায়। এর উপর ফাইলসিস্টেমটা অপারেটিং সিস্টেম সামলায়।

```
Application
    ↓
Filesystem (ext4, XFS, APFS)
    ↓
Block device (/dev/sda, /dev/nvme0n1)
    ↓
Physical disk or network-attached block (EBS, Longhorn, Ceph)
```

**বৈশিষ্ট্য:**

- লো-লেভেল — ডেটা কীভাবে সাজানো হবে তা OS ঠিক করে
- র‍্যান্ডম অ্যাক্সেস — যেকোনো বাইট পজিশনে seek করা যায়
- সিঙ্গেল-অ্যাটাচ — একসময়ে একটা সার্ভারই একটা block device মাউন্ট করে (ব্যতিক্রম আছে)
- সবচেয়ে দ্রুত — ডেটাবেস, VM, OS ভলিউম
- মূলগতভাবে শেয়ারযোগ্য নয় — একই EBS ভলিউম দুটো EC2 ইনস্ট্যান্সে একসাথে মাউন্ট করা যায় না

**যেখানে ব্যবহার করবেন:** ডেটাবেস (Postgres, MySQL, MongoDB-এর data directory), VM ইমেজ, OS ভলিউম।

## File Storage (Network Filesystem)

একটা ফাইলসিস্টেম যা নেটওয়ার্কে শেয়ার করা — একাধিক সার্ভার একই ডিরেক্টরি মাউন্ট করে একই ফাইল দেখে।

```
Server A              Server B
    \                 /
     NFS / SMB / CIFS
         |
    Fileserver (Synology, EFS, Azure Files)
```

**বৈশিষ্ট্য:**

- পরিচিত ফাইলসিস্টেম API (`open`, `read`, `write`, `ls`)
- মাল্টি-মাউন্ট — একসাথে অনেক সার্ভার read/write করে
- ডিস্ট্রিবিউটেড লকিং (তবে সতর্কতা আছে — NFS-এর উপর file locking অনির্ভরযোগ্য)
- লোকাল block-এর চেয়ে ধীর (প্রতিটা অপারেশনে network RTT)
- ডেটাবেসের জন্য নয় — POSIX compliance-এ ফাঁক থাকায় corruption হয়

**যেখানে ব্যবহার করবেন:** শেয়ার্ড কনফিগারেশন ফাইল, লিগ্যাসি অ্যাপ্লিকেশন ডেটা যা একটা ফাইলসিস্টেম আশা করে, একটা rendering cluster দিয়ে অ্যাক্সেস করা মিডিয়া ফাইল, একাধিক অ্যাপ সার্ভারে শেয়ার করা WordPress uploads।

**NFS দ্রুত সেটআপ:**

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

ফাইল জমা থাকে সমতল object হিসেবে (key → বাইনারি blob)। কোনো hierarchy নেই, র‍্যান্ডম write নেই — পুরো object get আর put করেন।

```
PUT /bucket/user-avatars/user-123.jpg    (store)
GET /bucket/user-avatars/user-123.jpg    (retrieve)
DELETE /bucket/user-avatars/user-123.jpg (delete)
```

**বৈশিষ্ট্য:**

- অসীম স্কেল — কোনো capacity planning নেই, "disk full" নেই
- HTTP API — presigned URL, সরাসরি ব্রাউজার থেকে আপলোড
- eventual consistency (এখন AWS S3-তে strongly consistent)
- ডিফল্টে immutable — একটা object-এ append করা যায় না, রিপ্লেস করতে হয়
- সস্তা — S3-তে $0.023/GB/month বনাম EBS-এ $0.10/GB/month
- এটা ফাইলসিস্টেম নয় — স্কেল করে এমন `ls` নেই, র‍্যান্ডম write নেই, POSIX নেই

**যেখানে ব্যবহার করবেন:** ইউজার আপলোড (ছবি, ডকুমেন্ট), মিডিয়া ফাইল, ব্যাকআপ, static asset, লগ, বড় ডেটাসেট, ডেটাবেস ডাম্প।

## তুলনা

|                    | Block                  | File (NFS)                  | Object (S3)                  |
| ------------------ | ---------------------- | --------------------------- | ---------------------------- |
| **Abstraction**    | কাঁচা ডিস্ক            | ফাইলসিস্টেম                 | Key-value                    |
| **Access pattern** | র‍্যান্ডম read/write   | Sequential + random         | পুরো-object GET/PUT          |
| **Multi-mount**    | না (বেশিরভাগ ক্ষেত্রে) | হ্যাঁ                       | হ্যাঁ (HTTP)                 |
| **Scale**          | সীমিত (volume size)    | সীমিত (NAS capacity)        | কার্যত অসীম                  |
| **Speed**          | সবচেয়ে দ্রুত          | মাঝারি                      | মাঝারি (HTTP overhead)       |
| **Cost**           | সবচেয়ে বেশি           | মাঝারি                      | সবচেয়ে সস্তা                |
| **Use case**       | ডেটাবেস, VM            | লিগ্যাসি অ্যাপ, শেয়ার্ড FS | ইউজার ফাইল, মিডিয়া, ব্যাকআপ |

## বাস্তবে বেছে নেওয়া

**ইউজার avatar আপলোড:** object storage। সস্তা, লক্ষ লক্ষে স্কেল করে, CDN দিয়ে সার্ভ করুন, ব্রাউজার থেকে সরাসরি আপলোডের জন্য presigned URL।

**ডেটাবেসের data directory:** block storage। অবশ্যই একটা সত্যিকারের ফাইলসিস্টেম হতে হবে, random I/O সাপোর্ট করতে হবে।

**অ্যাপ সার্ভারগুলোতে শেয়ার্ড config:** NFS বা object storage। startup-এ পড়া ছোট ফাইলের জন্য: object storage। অ্যাপ যেসব ফাইলে write করে আর ফাইলসিস্টেম সেম্যান্টিক্স আশা করে: NFS।

**লগ:** object storage। sequential-ভাবে write করুন, কদাচিৎ পড়ুন, মাসের পর মাস রাখুন, সস্তা।

**ভিডিও ফাইল:** object storage। বড়, immutable, range request সহ CDN দিয়ে সার্ভ করুন।

**একটা job-এর temp ফাইল:** লোকাল ডিস্ক বা ephemeral block storage। সস্তা, দ্রুত, কাজ শেষে ফেলে দিন।

## ডিস্ট্রিবিউটেড সিস্টেমে লোকাল ডিস্কের সমস্যা

```
Server 1: user uploads avatar.jpg → stored at /data/uploads/avatar.jpg
Server 2: user requests avatar.jpg → 404 (the file is on server 1)
```

প্রতিটা stateless সার্ভার ইনস্ট্যান্সকে একই স্টোরেজে পৌঁছাতে হবে। লোকাল ডিস্ক horizontal scaling ভেঙে দেয়। object storage এটা সমাধান করে — সব সার্ভার একই endpoint-এ HTTP কল করে।

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
	await s3.send(
		new PutObjectCommand({
			Bucket: 'my-uploads',
			Key: `avatars/${userId}.jpg`,
			Body: buffer,
			ContentType: 'image/jpeg'
		})
	);
}
```

## POSIX বনাম S3 সেম্যান্টিক্স

ফাইলসিস্টেমে করা যায় এমন কিছু file operation যা S3-তে কাজ করে না:

```bash
# POSIX — works on local disk and NFS
flock -x /data/file.lock     # file locking
tail -f /data/app.log        # append and follow
find /data -name "*.log"     # recursive directory listing
sed -i 's/old/new/' /data/config  # in-place edit

# S3 — none of these work
# Must download the entire object, modify, re-upload
```

আপনার অ্যাপ্লিকেশন যদি এগুলোর কোনোটা করে, তাহলে সেটা সরাসরি S3 ব্যবহার করতে পারবে না। ওই নির্দিষ্ট workload-এর জন্য একটা লোকাল ডিস্ক বা NFS ব্যবহার করুন।

## Storage Tiers

ক্লাউড object storage বিভিন্ন price/access ট্রেড-অফে একাধিক tier অফার করে:

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
	"Rules": [
		{
			"Status": "Enabled",
			"Transitions": [
				{ "Days": 30, "StorageClass": "STANDARD_IA" },
				{ "Days": 90, "StorageClass": "GLACIER" }
			],
			"Expiration": { "Days": 365 }
		}
	]
}
```
