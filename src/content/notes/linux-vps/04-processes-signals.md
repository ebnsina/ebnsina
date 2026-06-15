---
title: "Processes & Signals"
subtitle: "What a Linux process actually is, how fork and exec build the entire universe, and the signals that decide whether your app shuts down cleanly or dies screaming."
chapter: 4
level: "beginner"
readingTime: "12 min"
topics: ["processes", "signals", "fork", "exec", "linux"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Processes and signals are like employees in an office — you can see who's working, send a message telling someone to stop, and escalate with a harder signal if they ignore you.

</Callout>

## A process is not your app

A process is a **kernel data structure** describing a running program: its memory, its file descriptors, its credentials, the address of the next instruction to execute. Your Go binary, your Node server, your Postgres — they are all processes. The kernel manages a few hundred or few thousand of them simultaneously, scheduling them onto your CPU cores microsecond by microsecond.

Look at one:

```bash
$ ps -ef | head
UID          PID    PPID  C STIME TTY      TIME CMD
root           1       0  0 09:12 ?    00:00:01 /sbin/init
root           2       0  0 09:12 ?    00:00:00 [kthreadd]
deploy      1234    1233  0 10:42 pts/0 00:00:00 -bash
deploy      1567    1234  0 10:43 pts/0 00:00:00 ps -ef
```

Five columns matter:

- **PID** — process ID, a number unique while the process is alive.
- **PPID** — parent PID. Every process except `init` (PID 1) has a parent.
- **TTY** — the terminal it is attached to, or `?` if none.
- **TIME** — total CPU time the process has consumed.
- **CMD** — the command line.

## How processes are born — fork and exec

Linux has only one way to create a process: `fork()`. The kernel takes an existing process, makes an *exact copy* of it (same memory, same file descriptors, same everything), and gives the copy a new PID. Both copies return from the `fork()` call — the parent gets the child's PID, the child gets `0`. From there they diverge.

To run a *different* program, the child immediately calls `exec()`, which replaces its own program text and memory with the new binary. So when you type:

```bash
ls /etc
```

What actually happens:

1. Your shell (`bash`) calls `fork()`. Now there are two bashes.
2. The child bash calls `exec("/usr/bin/ls", ["ls", "/etc"])`. Its memory is replaced with `ls`.
3. The parent bash calls `wait()` and pauses until the child exits.
4. `ls` runs, prints, exits.
5. The parent bash resumes and shows you a prompt.

This is **all of Unix**. Every command, every daemon, every `systemctl start nginx` — fork and exec.

<Callout type="info">

**Why fork+exec instead of one call?**

Because between the fork and the exec, the child has a chance to set things up — close inherited file descriptors, redirect stdin/stdout, change user, set environment variables. Pipes, redirects, and `sudo` all work because of this gap.

</Callout>

## The init process — PID 1

PID 1 is special. The kernel starts it as the very first userspace process. On modern Linux that is `systemd`. PID 1's job:

- Be the ancestor of every other process.
- Adopt orphaned processes (when a parent dies, the children's PPID becomes 1).
- Reap zombie processes (more on this below).
- Run the boot sequence — bring up disks, network, services.

If PID 1 dies, the kernel panics. That is why systemd is so cautious about its own crashes.

## Process states

```bash
$ ps -axo pid,state,comm | head
  PID S COMMAND
    1 S systemd
    2 S kthreadd
   12 I rcu_sched
 1234 S bash
 1567 R ps
```

The single-letter state:

| State | Meaning |
|---|---|
| `R` | Running or runnable — actively using a CPU or waiting for one. |
| `S` | Sleeping interruptibly — waiting for I/O, a signal, or a network event. |
| `D` | Sleeping uninterruptibly — usually waiting on disk. **Cannot be killed.** |
| `Z` | Zombie — exited, but parent has not collected its exit code yet. |
| `T` | Stopped — paused with `Ctrl+Z` or by a signal. |
| `I` | Idle kernel thread. |

A `D`-state process stuck for minutes usually means the disk is dying or the network filesystem is unreachable. You cannot `kill -9` it; the kernel has it. The only fix is fixing the underlying I/O or rebooting.

## Tools to see processes

```bash
ps -ef                  # POSIX-ish, every process
ps auxf                 # BSD-style, with a tree
ps -axo pid,user,%cpu,%mem,comm  # custom columns

top                     # live, sortable
htop                    # nicer top, with colors and tree view
                        # apt install htop

pgrep nginx             # PIDs matching a name
pidof nginx             # similar, single-line output
pstree                  # the whole family tree
```

`htop` is what you reach for nine times out of ten:

```bash
sudo apt install htop
htop
```

Press `t` for tree view, `F5` to refresh, `F9` to send a signal, `q` to quit.

## Signals — how processes talk to the kernel and each other

A **signal** is a one-byte message sent to a process. The kernel delivers it; the process either runs a handler, ignores it, or dies. There are about thirty of them:

```bash
$ kill -l | head -3
 1) SIGHUP    2) SIGINT    3) SIGQUIT    4) SIGILL    5) SIGTRAP
 6) SIGABRT   7) SIGBUS    8) SIGFPE     9) SIGKILL  10) SIGUSR1
11) SIGSEGV  12) SIGUSR2  13) SIGPIPE   14) SIGALRM  15) SIGTERM
```

The ones you actually use:

| Signal | Number | What it asks |
|---|---|---|
| `SIGTERM` | 15 | "Please shut down cleanly." Default for `kill`. |
| `SIGINT` | 2 | "User pressed Ctrl+C." |
| `SIGHUP` | 1 | "Reload your config." (Originally: terminal hung up.) |
| `SIGUSR1` / `SIGUSR2` | 10 / 12 | Application-defined. |
| `SIGKILL` | 9 | "Die now." Cannot be caught or ignored. |
| `SIGSTOP` | 19 | "Pause." Cannot be caught. |
| `SIGCONT` | 18 | "Resume after a stop." |
| `SIGCHLD` | 17 | Sent to a parent when a child exits. |

Send a signal:

```bash
kill 1234              # SIGTERM by default
kill -TERM 1234        # explicit
kill -HUP 1234         # ask nginx to reload its config
kill -9 1234           # SIGKILL — only when the app is wedged
killall -HUP nginx     # by name, all matching processes
pkill -f 'node server' # by command-line pattern
```

## SIGTERM vs SIGKILL — the most important distinction

`SIGTERM` is **catchable**. A well-written app installs a handler that:

1. Stops accepting new requests.
2. Finishes in-flight requests.
3. Closes database connections, flushes buffers, unlinks PID files.
4. Exits with code 0.

`SIGKILL` is **not catchable**. The kernel kills the process *immediately*, with no chance to clean up. In-flight transactions die. Open files may end up corrupt. Locks held in memory are gone but locks held in databases or files persist.

Always send `SIGTERM` first. Wait a few seconds. Only escalate to `SIGKILL` if the process is truly stuck.

```bash
# Graceful shutdown attempt:
kill 1234
sleep 5
kill -0 1234 2>/dev/null && kill -9 1234
```

`systemd` does exactly this. By default it sends `SIGTERM`, waits `TimeoutStopSec` seconds (90 default), then sends `SIGKILL`.

## Catching signals in your app

Every language can install signal handlers. Here is Go:

```go
package main

import (
    "context"
    "log"
    "os"
    "os/signal"
    "syscall"
    "time"
)

func main() {
    ctx, stop := signal.NotifyContext(context.Background(),
        syscall.SIGTERM, syscall.SIGINT)
    defer stop()

    log.Println("started, pid", os.Getpid())

    <-ctx.Done()

    log.Println("shutdown signal received, draining...")

    // Pretend we have in-flight work to finish.
    time.Sleep(2 * time.Second)

    log.Println("clean exit")
}
```

When `systemctl stop myservice` runs, this binary gets `SIGTERM`, drains, and exits cleanly. With no handler, the process dies the instant the signal arrives.

## Zombies and orphans

When a process exits, its PID and exit code linger in the kernel until the parent calls `wait()` to collect them. If the parent is sloppy and never calls `wait()`, the child stays around as a **zombie** — visible in `ps` with state `Z`. Zombies do not consume CPU or memory beyond the kernel struct, but they consume PIDs. A leak of a million zombies will exhaust the PID table and the box will refuse to fork.

If the parent dies before the child, the child is **orphaned** and re-parented to PID 1. systemd reaps these correctly, so orphans are usually fine. Zombies are a parent-process bug.

## Foreground, background, jobs

In an interactive shell:

```bash
sleep 100               # foreground — your prompt is gone until it finishes
^Z                      # SIGSTOP — pauses it, prompt comes back
jobs                    # [1]+  Stopped    sleep 100
bg                      # resume in background
fg                      # bring back to foreground
disown                  # detach from the shell so it survives logout
```

For real long-running daemons, do not rely on `nohup` and `disown`. Use systemd (next chapter).

## Recap

- A process is a kernel object: memory, file descriptors, credentials, a PID.
- New processes come from `fork` (copy) plus `exec` (replace). PID 1 is the ancestor of all.
- Process states matter — `D` is the scary one, `Z` is a parent-process bug.
- `SIGTERM` asks politely. `SIGKILL` is non-negotiable. Always try `SIGTERM` first.
- Catch signals in your app to drain cleanly. Untrapped signals = unclean shutdown.

Next: systemd — the supervisor that turns "I have a binary" into "this thing is up forever."

