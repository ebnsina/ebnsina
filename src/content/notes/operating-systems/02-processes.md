---
title: 'Processes'
subtitle: 'A running program is a process — its own address space, its own resources, tracked by the kernel from birth to death.'
chapter: 2
level: 'beginner'
readingTime: '14 min'
topics: ['process', 'fork', 'exec']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## What a Process Is

A **process** is a program in execution. The program on disk is just bytes — an executable file. When you run it, the kernel creates a process: a live instance with memory, open files, a slice of CPU time, and an identity.

The key property of a process is **isolation**. Each one believes it has the machine to itself. It cannot see another process's memory, and it cannot accidentally corrupt it. That illusion is built from two things: a private virtual address space (Chapter 5) and a kernel that mediates every shared resource.

Each process has a unique **PID** (process ID) and a parent. The first process, `init` or `systemd` (PID 1), is the ancestor of everything else.

## The Address Space

Every process gets a private virtual address space. Conceptually it is laid out in regions:

```text
high addresses
+------------------+
|      stack       |  grows down; locals, call frames
|        |         |
|        v         |
|                  |
|        ^         |
|        |         |
|       heap       |  grows up; malloc / new
+------------------+
|   bss / data     |  globals (zeroed / initialized)
+------------------+
|       text       |  the program code (read-only)
+------------------+
low addresses
```

- **text** — the machine instructions, marked read-only and executable.
- **data / bss** — global and static variables.
- **heap** — dynamic memory from `malloc`, growing toward higher addresses.
- **stack** — function call frames and locals, growing toward lower addresses.

These addresses are _virtual_. Two processes can both use address `0x400000` and the kernel maps each to different physical RAM.

## The Process Control Block

The kernel needs to track each process. It stores everything it knows in a per-process structure — the **Process Control Block (PCB)**. On Linux this is `struct task_struct`. It holds:

- The PID and parent PID.
- Process state (running, sleeping, etc.).
- Saved CPU registers, so the process can be paused and resumed.
- A pointer to its address space (page tables).
- The file descriptor table (open files, sockets).
- Scheduling info, priority, and accounting (CPU time used).

When the kernel switches from one process to another, it saves the current registers into the PCB and loads the next process's registers — a **context switch**.

## Process States

A process moves through a small state machine:

| State       | Meaning                                             |
| ----------- | --------------------------------------------------- |
| **Running** | Currently executing on a CPU                        |
| **Ready**   | Runnable, waiting for a CPU to be free              |
| **Blocked** | Waiting for an event (disk read, network, lock)     |
| **Zombie**  | Finished, but its exit status hasn't been collected |

A typical life: a process is **ready**, the scheduler runs it (**running**), it asks to read a file and goes **blocked** until the disk responds, then becomes **ready** again. Most processes spend most of their life blocked, not running.

<Callout type="tip">

**Tip:** In `ps` output the `STAT` column shows these. `R` is running/ready, `S` is sleeping (interruptible block), `D` is uninterruptible sleep (usually disk I/O), and `Z` is a zombie.

</Callout>

## Creating Processes: fork and exec

Unix creates processes with a deliberately split design: `fork` makes a copy, `exec` replaces the program.

`fork` creates a near-identical child process. It returns **twice** — once in the parent (returning the child's PID) and once in the child (returning 0):

```c
#include <unistd.h>
#include <stdio.h>

int main(void) {
    pid_t pid = fork();
    if (pid == 0) {
        printf("child\n");      // child path
    } else {
        printf("parent of %d\n", pid);  // parent path
    }
    return 0;
}
```

The child gets a copy of the parent's address space. The kernel doesn't physically copy all the memory — it uses **copy-on-write**: parent and child share the same physical pages until one writes, at which point that page is duplicated. Forking is cheap.

`exec` (the `execve` syscall) replaces the current process image with a new program. The PID stays the same, but the text, data, heap, and stack are thrown away and rebuilt from the new executable:

```c
execlp("ls", "ls", "-l", NULL);
// if this returns, it failed; otherwise we are now 'ls'
```

The standard pattern is **fork then exec**: the parent forks, the child execs the new program, and the parent keeps running. This is exactly what your shell does for every command you type.

## wait, Zombies, and Orphans

When a child finishes, it doesn't vanish entirely. The kernel keeps its exit status around so the parent can read it. The parent collects it with `wait` (or `waitpid`):

```c
int status;
pid_t child = fork();
if (child == 0) {
    return 42;          // child exits with code 42
}
waitpid(child, &status, 0);   // parent reaps it
```

Two failure modes:

- A **zombie** is a finished child whose parent hasn't called `wait`. It holds only a slot in the process table, but a program that forks endlessly without reaping leaks those slots. The fix is to always `wait` for children.
- An **orphan** is a child whose parent exits first. The kernel **reparents** it to PID 1, which periodically reaps its children. Orphans are harmless; zombies are the leak to watch for.

<Callout type="info">

**Note:** A zombie can't be killed with `kill` — it's already dead. The cure is to make the _parent_ call `wait`, or to terminate the parent so the zombie is reparented to PID 1 and reaped.

</Callout>

With processes understood as isolated units, the next chapter looks at running multiple flows of execution _inside_ one process: threads.
