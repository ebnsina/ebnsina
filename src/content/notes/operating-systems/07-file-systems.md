---
title: "File Systems"
subtitle: "Turning flat disk blocks into named, hierarchical, durable files — with a cache in the middle that changes everything."
chapter: 7
level: "advanced"
readingTime: "14 min"
topics: ["inode", "page cache", "journaling"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Files and Directories

A disk presents itself as a flat array of fixed-size **blocks**, numbered from zero. A **file system** is the data structure layered on top that turns those blocks into named files arranged in a hierarchy.

A **file** is a named sequence of bytes plus metadata (size, owner, permissions, timestamps). A **directory** is itself just a special file whose contents are a list of names mapped to the on-disk objects they refer to. The familiar tree — `/home/user/notes.txt` — is built by directories pointing to other directories and files.

On Unix the abstraction goes further: *almost everything is a file*. Devices (`/dev/sda`), pipes, and sockets all present the same `read`/`write` interface, so the same code can talk to a disk file, a terminal, or a network connection.

## Inodes

A name is not the file. The actual file — its metadata and the pointers to its data blocks — is an **inode** (index node). A directory entry maps a *name* to an *inode number*; the inode holds everything else:

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

Crucial consequences of this split:

- **Hard links** — two directory entries can point to the *same* inode. The file has multiple names; the inode's *link count* tracks how many. The data is freed only when the count hits zero.
- **The name isn't in the inode.** Renaming a file just edits directory entries; the inode and data don't move.
- Large files use **indirect blocks** — the inode points to a block that points to more data blocks — so file size isn't limited by the handful of direct pointers an inode holds.

<Callout type="info">

**Note:** Running out of **inodes** is a real failure mode, separate from running out of space. Millions of tiny files can exhaust the inode table while leaving disk bytes free. Check both with `df` and `df -i`.

</Callout>

## The Page Cache

Disks are orders of magnitude slower than RAM, so the kernel keeps recently used file data in memory in the **page cache**. This is one of the most consequential things the OS does for performance.

- On `read`, the kernel first checks the page cache. A hit returns data at memory speed with no disk access at all.
- On `write`, data normally goes *into the page cache first* and is marked **dirty**. The syscall returns immediately, before anything touches the disk. The kernel flushes dirty pages to disk later (write-back).

This is why the *second* read of a file is far faster than the first, and why "free" RAM on a busy Linux box is mostly page cache — memory the kernel will instantly reclaim if a program needs it. Idle RAM is wasted RAM, so the kernel fills it with cached file data.

## Buffered vs Direct I/O

Because writes land in the page cache and return, ordinary I/O is **buffered**:

- **Buffered I/O** (the default) — goes through the page cache. Fast, benefits from caching and read-ahead, but the data is not yet on disk when `write` returns.
- **Direct I/O** (`O_DIRECT`) — bypasses the page cache and transfers straight to/from the device. Used by databases that manage their own cache and don't want the kernel double-caching the same data. It's faster only when you have a smarter caching layer of your own; for general use, buffered I/O wins.

<Callout type="warning">

**Warning:** A successful `write()` does **not** mean the data is on disk. It means the data is in the page cache. If the machine loses power before the kernel flushes, that write is gone. Durability requires an explicit flush — see below.

</Callout>

## Journaling

If the machine crashes mid-update, a file-system operation that touches several blocks (allocate a block, update the inode, update the free-space map) can be left half-finished — a corrupt file system. Historically, recovery meant a slow full scan (`fsck`).

**Journaling** solves this. Before applying changes in place, the file system writes a description of them to a **journal** (a log) and marks it committed. Only then are the real blocks updated. After a crash, recovery just replays the journal:

- If a transaction is fully in the journal, replay it to completion.
- If it's incomplete, discard it.

Either way the file system returns to a consistent state quickly, without scanning the whole disk. Linux's `ext4` journals metadata by default (`data=ordered`): it guarantees metadata consistency and ensures data blocks are written before the metadata that references them, so you never see a file pointing at stale garbage. Journaling protects **consistency**, not your most recent un-flushed writes.

## fsync and Durability

To *guarantee* data has reached stable storage, a program must explicitly flush:

```c
int fd = open("data.txt", O_WRONLY | O_CREAT, 0644);
write(fd, buf, len);   // now in the page cache, not durable
fsync(fd);             // force this file's data to the device
close(fd);
```

`fsync(fd)` blocks until the file's dirty pages **and** its metadata are durably written. This is why databases call `fsync` (or `fdatasync`) at commit points — it's the line between "the OS says it wrote it" and "the disk really has it." It is also expensive: it waits for a real physical write, which is why commit-heavy workloads are bottlenecked on `fsync` latency and why fast, power-loss-protected storage matters so much for databases.

Two subtleties worth knowing:

- **`fdatasync`** flushes the data but skips metadata-only updates (like timestamps), so it's slightly cheaper when you only care about file contents.
- A directory change (creating or renaming a file) isn't durable until you `fsync` the **directory** itself, not just the file.

File systems give programs durable, named storage. The final chapter looks at the I/O machinery underneath — how reads and writes actually flow, and how servers wait on thousands of connections at once.
