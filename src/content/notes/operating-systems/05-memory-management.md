---
title: "Memory Management & Virtual Memory"
subtitle: "Every process thinks it owns a vast, private memory. The kernel and MMU maintain that illusion over scarce physical RAM."
chapter: 5
level: "advanced"
readingTime: "15 min"
topics: ["virtual memory", "paging", "tlb"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Virtual vs Physical Memory

When your program reads address `0x7fff_1234`, that is a **virtual address**. It is not the location in the physical RAM chips. Every process has its own virtual address space, and the kernel maps each process's virtual addresses to **physical addresses** in RAM.

This indirection buys three crucial things:

- **Isolation** — process A's address `0x1000` and process B's `0x1000` map to different physical memory. They cannot see each other.
- **The illusion of abundance** — each process can be handed a huge, contiguous-looking address space even though physical RAM is smaller and fragmented.
- **Flexibility** — memory can be moved, shared, swapped to disk, or lazily allocated, all transparently to the program.

The translation is done in hardware by the **MMU** (Memory Management Unit) on every single memory access, using tables the kernel sets up.

## Paging

Memory is managed in fixed-size chunks called **pages** — almost always **4 KB** on x86. Physical RAM is divided into equal-size **page frames**. The MMU maps virtual pages to physical frames.

A virtual address splits into two parts:

```text
 virtual address (simplified)
+---------------------+-------------+
|    page number      |   offset    |
+---------------------+-------------+
    used to look up        added to
    the frame              the frame base
```

The high bits select a page; the MMU translates that to a frame; the low **offset** bits index within the page and pass through unchanged. Because pages are fixed-size, any virtual page can go in any physical frame — no need for contiguous physical memory. This eliminates the external fragmentation that plagued older segment-based schemes.

## Page Tables

The mapping from virtual page to physical frame lives in a **page table**, one per process. A flat table would be enormous (a 48-bit address space has trillions of pages), so real systems use **multi-level page tables** — a tree. On x86-64, address translation walks four levels:

```text
virtual addr -> [L4] -> [L3] -> [L2] -> [L1] -> frame + offset
```

Only the branches that are actually used consume memory, so a sparse address space costs little. Each entry also carries permission bits — readable, writable, executable, user-accessible — which is how the text segment is enforced read-only and how a write to read-only memory is caught.

The CPU register `CR3` points to the top of the current process's page table. A context switch between processes reloads `CR3`, instantly swapping in the new process's view of memory.

## The TLB

Walking a four-level page table on *every* memory access would be ruinously slow — four extra memory reads per access. The fix is a cache inside the CPU called the **TLB** (Translation Lookaside Buffer). It caches recent virtual-to-physical translations.

- **TLB hit** — the translation is cached; the address resolves in essentially zero extra time.
- **TLB miss** — the MMU walks the page table, then caches the result for next time.

The TLB is small (hundreds to a few thousand entries), so good locality matters enormously. This is also why context switches are costly: switching `CR3` invalidates much of the TLB, and the new process suffers a burst of misses as it warms up again.

<Callout type="info">

**Note:** **Huge pages** (2 MB or 1 GB instead of 4 KB) let one TLB entry cover far more memory, cutting TLB misses for memory-hungry workloads like databases. The trade-off is coarser granularity and potential waste.

</Callout>

## Page Faults

When a process accesses a virtual page that has no valid mapping in the page table, the MMU raises a **page fault** — a trap into the kernel. The kernel inspects why:

- **Minor fault** — the page is legitimate but not yet mapped (e.g., it's already in RAM, just needs a table entry, or it's a copy-on-write page being written). The kernel fixes the mapping and resumes the program. Fast.
- **Major fault** — the page's contents must be brought in from disk (from the executable, a memory-mapped file, or the swap area). The process blocks while I/O happens. Slow.
- **Invalid fault** — the access is genuinely illegal (a null-pointer dereference, writing read-only memory). The kernel sends `SIGSEGV` and the program crashes. This is a segmentation fault.

<Callout type="tip">

**Tip:** `ps` shows minor and major fault counts. A high *major* fault rate means the working set doesn't fit in RAM and the system is hitting disk constantly — the symptom of thrashing.

</Callout>

## Demand Paging and Swapping

The kernel is lazy on purpose. **Demand paging** means a page is only loaded into physical RAM when it's actually touched. When you `exec` a 100 MB binary, the kernel doesn't read 100 MB up front — it sets up the mappings and lets page faults pull in only the pages the program actually runs. This makes startup fast and avoids loading code that's never executed.

When physical RAM fills up, the kernel must evict pages to make room. It picks victim pages (approximating *least-recently-used*) and:

- If the page is clean and backed by a file (like program code), it's simply dropped — it can be re-read from the file later.
- If the page is dirty (modified anonymous memory), it must be written out to the **swap** area on disk first.

Bringing that page back later causes a major page fault. If the active working set is larger than RAM, the system spends all its time swapping pages in and out — **thrashing** — and throughput collapses while the disk stays pegged.

This is the fundamental tension of memory management: virtual memory lets you allocate more than you have, but performance falls off a cliff once your *active* footprint exceeds physical RAM. The next chapter turns to coordinating access to this shared memory safely: synchronization.
