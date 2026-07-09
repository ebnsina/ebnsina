---
title: 'File Systems'
subtitle: 'flat disk block-কে নামওয়ালা, hierarchical, durable file-এ পরিণত করা — মাঝখানে একটা cache যা সবকিছু বদলে দেয়।'
chapter: 7
level: 'advanced'
readingTime: '14 মিনিট'
topics: ['inode', 'page cache', 'journaling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## File আর Directory

একটা disk নিজেকে উপস্থাপন করে নির্দিষ্ট-আকারের **block**-এর একটা flat array হিসেবে, শূন্য থেকে সংখ্যায়িত। একটা **file system** হলো তার উপরে স্তরিত সেই data structure যা সেই block-গুলোকে একটা hierarchy-তে সাজানো নামওয়ালা file-এ পরিণত করে।

একটা **file** হলো byte-এর একটা নামওয়ালা sequence প্লাস metadata (size, owner, permission, timestamp)। একটা **directory** নিজেই কেবল একটা বিশেষ file যার content হলো নামের একটা list যা তারা যে on-disk object-কে বোঝায় সেগুলোতে map করা। পরিচিত tree — `/home/user/notes.txt` — অন্য directory আর file-কে point করা directory দিয়ে তৈরি।

Unix-এ abstraction আরও এগিয়ে যায়: _প্রায় সবকিছুই একটা file_। Device (`/dev/sda`), pipe, আর socket সবাই একই `read`/`write` interface উপস্থাপন করে, তাই একই কোড একটা disk file, একটা terminal, বা একটা network connection-এর সাথে কথা বলতে পারে।

## Inode

একটা নাম file নয়। আসল file — তার metadata আর তার data block-এর pointer — হলো একটা **inode** (index node)। একটা directory entry একটা _নাম_-কে একটা _inode number_-এ map করে; inode বাকি সব ধরে রাখে:

```text
directory entry            inode (#8123)
+----------+-------+       +-----------------------+
| "notes"  | 8123  | ----> | mode, owner, perms    |
+----------+-------+       | size, timestamps      |
                           | link count            |
                           | -> data block 4501    |
                           | -> data block 4502    |
                           | -> indirect block ... |
                           +-----------------------+
```

এই বিভক্তির গুরুত্বপূর্ণ পরিণতি:

- **Hard link** — দুটো directory entry _একই_ inode-এ point করতে পারে। File-এর একাধিক নাম থাকে; inode-এর _link count_ track করে কতগুলো। Count শূন্যে পৌঁছালেই কেবল data মুক্ত হয়।
- **নাম inode-এ নেই।** একটা file rename করা কেবল directory entry edit করে; inode আর data নড়ে না।
- বড় file **indirect block** ব্যবহার করে — inode এমন একটা block-এ point করে যা আরও data block-এ point করে — তাই file size একটা inode যে মুষ্টিমেয় direct pointer ধরে রাখে তা দিয়ে সীমিত নয়।

<Callout type="info">

**নোট:** **inode** ফুরিয়ে যাওয়া একটা বাস্তব failure mode, space ফুরিয়ে যাওয়া থেকে আলাদা। লক্ষ লক্ষ ছোট file inode table নিঃশেষ করতে পারে যখন disk byte খালি থাকে। `df` আর `df -i` দিয়ে দুটোই check করুন।

</Callout>

## Page Cache

Disk RAM-এর চেয়ে magnitude-এর ক্রমে ধীর, তাই কার্নেল সম্প্রতি ব্যবহৃত file data memory-তে **page cache**-এ রাখে। এটা performance-এর জন্য OS যা করে তার মধ্যে সবচেয়ে গুরুত্বপূর্ণ একটা।

- `read`-এ, কার্নেল প্রথমে page cache check করে। একটা hit কোনো disk access ছাড়াই memory speed-এ data ফেরায়।
- `write`-এ, data সাধারণত _প্রথমে page cache-এ যায়_ আর **dirty** হিসেবে চিহ্নিত হয়। Syscall তাৎক্ষণিকভাবে return করে, disk-এ কিছু ছোঁয়ার আগেই। কার্নেল পরে dirty page disk-এ flush করে (write-back)।

এ কারণেই একটা file-এর _দ্বিতীয়_ read প্রথমটার চেয়ে অনেক দ্রুত, আর এ কারণেই একটা ব্যস্ত Linux box-এ "free" RAM বেশিরভাগ page cache — এমন memory যা একটা program-এর দরকার হলে কার্নেল তাৎক্ষণিকভাবে reclaim করবে। Idle RAM হলো নষ্ট RAM, তাই কার্নেল সেটা cached file data দিয়ে ভরে দেয়।

## Buffered vs Direct I/O

যেহেতু write page cache-এ পড়ে আর return করে, সাধারণ I/O হলো **buffered**:

- **Buffered I/O** (default) — page cache-এর মধ্য দিয়ে যায়। দ্রুত, caching আর read-ahead থেকে উপকৃত হয়, কিন্তু `write` return করার সময় data এখনো disk-এ নেই।
- **Direct I/O** (`O_DIRECT`) — page cache bypass করে আর সরাসরি device-এ/থেকে transfer করে। যেসব database নিজেদের cache পরিচালনা করে আর কার্নেলকে একই data double-cache করতে দিতে চায় না তারা এটা ব্যবহার করে। এটা কেবল তখনই দ্রুত যখন আপনার নিজের একটা smarter caching layer থাকে; সাধারণ ব্যবহারে buffered I/O জেতে।

<Callout type="warning">

**সতর্কতা:** একটা সফল `write()`-এর মানে **নয়** যে data disk-এ আছে। এর মানে data page cache-এ আছে। কার্নেল flush করার আগে মেশিন power হারালে, সেই write চলে গেছে। Durability-র জন্য একটা explicit flush দরকার — নিচে দেখুন।

</Callout>

## Journaling

মেশিন যদি update-এর মাঝপথে crash করে, একটা file-system operation যা কয়েকটা block ছোঁয় (একটা block allocate, inode update, free-space map update) সেটা অর্ধেক-শেষ থেকে যেতে পারে — একটা corrupt file system। ঐতিহাসিকভাবে, recovery মানে ছিল একটা ধীর full scan (`fsck`)।

**Journaling** এটা সমাধান করে। জায়গামতো পরিবর্তন apply করার আগে, file system তাদের একটা বিবরণ একটা **journal**-এ (একটা log) write করে আর সেটাকে committed হিসেবে চিহ্নিত করে। কেবল তখনই আসল block update হয়। একটা crash-এর পর, recovery কেবল journal replay করে:

- একটা transaction যদি পুরোপুরি journal-এ থাকে, সেটাকে সম্পূর্ণ করতে replay করো।
- এটা যদি অসম্পূর্ণ হয়, ফেলে দাও।

যেভাবেই হোক file system পুরো disk scan না করে দ্রুত একটা consistent state-এ ফেরে। Linux-এর `ext4` default-এ metadata journal করে (`data=ordered`): এটা metadata consistency নিশ্চিত করে আর নিশ্চিত করে যে data block সেই metadata-র আগে write হয় যা সেগুলোকে reference করে, তাই আপনি কখনো একটা file-কে বাসি garbage-এ point করতে দেখবেন না। Journaling **consistency** protect করে, আপনার সবচেয়ে সাম্প্রতিক un-flushed write নয়।

## fsync আর Durability

Data যে stable storage-এ পৌঁছেছে তা _নিশ্চিত_ করতে, একটা program-কে explicitly flush করতে হয়:

```c
int fd = open("data.txt", O_WRONLY | O_CREAT, 0644);
write(fd, buf, len);   // now in the page cache, not durable
fsync(fd);             // force this file's data to the device
close(fd);
```

`fsync(fd)` block করে যতক্ষণ না file-এর dirty page **আর** তার metadata durably write হয়। এ কারণেই database commit point-এ `fsync` (বা `fdatasync`) call করে — এটাই "OS বলছে এটা write করেছে" আর "disk-এ সত্যিই আছে"-র মধ্যেকার সীমারেখা। এটা ব্যয়বহুলও: এটা একটা আসল physical write-এর অপেক্ষা করে, এ কারণেই commit-ভারী workload `fsync` latency-তে bottleneck হয় আর এ কারণেই দ্রুত, power-loss-protected storage database-এর জন্য এত গুরুত্বপূর্ণ।

জানার মতো দুটো সূক্ষ্মতা:

- **`fdatasync`** data flush করে কিন্তু metadata-only update (যেমন timestamp) এড়িয়ে যায়, তাই আপনি যখন শুধু file content নিয়ে চিন্তিত তখন এটা কিছুটা সস্তা।
- একটা directory change (একটা file তৈরি বা rename) durable নয় যতক্ষণ না আপনি **directory** নিজেই `fsync` করেন, শুধু file নয়।

File system program-দের durable, নামওয়ালা storage দেয়। শেষ অধ্যায় নিচের I/O যন্ত্রপাতির দিকে তাকায় — read আর write আসলে কীভাবে প্রবাহিত হয়, আর server কীভাবে একসাথে হাজার হাজার connection-এর অপেক্ষা করে।
