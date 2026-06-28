---
title: 'What an Operating System Does'
subtitle: 'The kernel sits between your programs and the hardware — protecting, sharing, and arbitrating every resource.'
chapter: 1
level: 'beginner'
readingTime: '12 min'
topics: ['kernel', 'syscall', 'user mode']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## The Job of an OS

Bare hardware is hostile. It has one set of CPUs, one block of physical RAM, one disk controller, one network card. If every program touched those directly, the first buggy process would corrupt the second, and two programs reading the disk at once would scramble each other's data.

The operating system exists to solve this. It is the software that:

- **Abstracts** the hardware into clean interfaces — files instead of disk sectors, sockets instead of network registers.
- **Isolates** programs so one cannot read or destroy another's memory.
- **Arbitrates** shared resources — CPU time, memory, disk bandwidth — fairly and safely.

Everything else the OS does is in service of those three goals.

## The Kernel

The **kernel** is the core of the OS — the part that is always resident in memory and runs with full privileges over the hardware. On Linux it is a single large program (a "monolithic" kernel) that includes the scheduler, memory manager, file systems, and device drivers.

Most of what you think of as "the OS" is _not_ the kernel. Your shell, the window manager, `systemd`, `ls`, and your web browser are ordinary programs. They live in **user space** and ask the kernel to do privileged work on their behalf.

```text
+-----------------------------------------------+
|  User space:  shell, browser, your app, libc  |
+-----------------------------------------------+
            |  system calls (the boundary)
+-----------------------------------------------+
|  Kernel:  scheduler, memory, FS, drivers      |
+-----------------------------------------------+
            |  hardware access
+-----------------------------------------------+
|  CPU, RAM, disk, network card                 |
+-----------------------------------------------+
```

## User Mode and Kernel Mode

The protection that keeps programs apart is enforced by the CPU itself. Modern processors run code in one of two privilege levels:

- **Kernel mode** (also "supervisor" or ring 0): code can execute any instruction and touch any memory or device.
- **User mode** (ring 3): code is restricted. Privileged instructions — talking to a device, changing the page tables, halting the CPU — are forbidden and trap into the kernel if attempted.

Your program runs in user mode. When it needs something only the kernel can do, the CPU switches to kernel mode through a controlled doorway, runs trusted kernel code, then switches back. A user program can never _jump_ into arbitrary kernel code; it can only request services at well-defined entry points.

<Callout type="info">

**Note:** This hardware enforcement is why a segfault crashes one process instead of the whole machine. The CPU detects the illegal access and notifies the kernel, which kills the offending process — and only that process.

</Callout>

## System Calls

A **system call** is the request a user program makes to cross into the kernel. It is the only way to do privileged work. Reading a file, allocating memory, creating a process, sending a network packet — all are system calls.

Common Linux system calls:

| Syscall              | What it does                            |
| -------------------- | --------------------------------------- |
| `read` / `write`     | Move bytes to or from a file descriptor |
| `open` / `close`     | Get or release a file descriptor        |
| `fork` / `execve`    | Create a process / replace its program  |
| `mmap` / `brk`       | Map or grow memory                      |
| `socket` / `connect` | Set up network communication            |

You rarely invoke these directly. The C library (`glibc`) wraps each one in a function. When you call `printf`, it eventually calls the `write` syscall:

```c
#include <unistd.h>

int main(void) {
    const char *msg = "hello\n";
    write(1, msg, 6);   // fd 1 is stdout; this is a real syscall
    return 0;
}
```

Mechanically, a syscall puts a number identifying the requested service into a register, puts the arguments in others, and executes a special instruction (`syscall` on x86-64). The CPU switches to kernel mode and jumps to the kernel's syscall handler, which dispatches to the right function. When it returns, control comes back to user mode with the result.

You can watch this happen with `strace`:

```bash
strace -e trace=write ./hello
# write(1, "hello\n", 6) = 6
```

## The OS as Resource Manager

Step back and the kernel's job is resource management across four big resources:

- **CPU** — the scheduler decides which thread runs on each core and for how long (Chapter 4).
- **Memory** — the memory manager gives each process a private virtual address space backed by shared physical RAM (Chapter 5).
- **Storage** — file systems turn flat disk blocks into named, hierarchical files (Chapter 7).
- **Devices** — drivers and the I/O subsystem multiplex the network card, disk, and terminals among many programs (Chapter 8).

Every resource is finite and shared, and the kernel is the trusted referee. Keep that framing in mind: almost every OS concept in this track is an answer to _"how do we share this one piece of hardware among many programs safely and fairly?"_
