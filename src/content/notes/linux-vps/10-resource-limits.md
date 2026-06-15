---
title: "Resource Limits"
subtitle: "ulimit, cgroups, and the OOM killer — three layers of resource control that decide whether your services share the box politely or fight to the death."
chapter: 10
level: "advanced"
readingTime: "13 min"
topics: ["cgroups", "ulimit", "oom", "limits", "linux"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Resource limits are like a circuit breaker — they prevent one overloaded appliance from drawing too much current and taking down the whole house.

</Callout>

## Why limits exist

A Linux box has finite resources: CPU cycles, RAM, file descriptors, processes, disk I/O bandwidth. Every running service competes for those resources. Without limits, a single bug — a memory leak, a runaway loop, a process spawning child processes in a tight loop — can starve every other service on the box, including ssh and journald, leaving you locked out and the machine effectively dead.

There are three layers of limits to know:

1. **Per-process limits (ulimit / rlimits)** — set when a process starts, enforced by the kernel.
2. **Cgroups** — group-level limits across a set of processes (your whole service or container).
3. **The OOM killer** — kernel's last resort when memory is exhausted.

systemd ties all three together for services it supervises.

## Per-process limits — `ulimit`

When the kernel forks a process, it inherits a set of resource limits called **rlimits**. The shell exposes them as `ulimit`:

```bash
$ ulimit -a
core file size          (blocks, -c) 0
data seg size           (kbytes, -d) unlimited
scheduling priority             (-e) 0
file size               (blocks, -f) unlimited
pending signals                 (-i) 15393
max locked memory       (kbytes, -l) 8192
max memory size         (kbytes, -m) unlimited
open files                      (-n) 1024
pipe size            (512 bytes, -p) 8
POSIX message queues     (bytes, -q) 819200
real-time priority              (-r) 0
stack size              (kbytes, -s) 8192
cpu time               (seconds, -t) unlimited
max user processes              (-u) 15393
virtual memory          (kbytes, -v) unlimited
file locks                      (-x) unlimited
```

The most important ones in practice:

| Limit | Flag | What happens at the cap |
|---|---|---|
| Open files (FDs) | `-n` | `accept()` and `open()` start returning `EMFILE`. Network services fail. |
| Max user processes | `-u` | `fork()` returns `EAGAIN`. Cannot spawn workers. |
| Stack size | `-s` | Deep recursion crashes the process. |
| Max RAM (virtual) | `-v` | `malloc()` fails. App handles or crashes. |
| CPU time | `-t` | Process is killed after this many seconds of CPU time. |

`ulimit` shows **soft** limits by default, the value the process is currently subject to. `ulimit -aH` shows **hard** limits, the cap a process can raise its soft limit to without being root.

## The 1024 file descriptor problem

The default for `ulimit -n` on most distros is **1024**. That is the number of open files (including sockets) a single process can have. For any real network service, this is *too low*.

Run a quick test:

```bash
# In one terminal:
$ python3 -c "import socket; ss=[socket.socket() for _ in range(2000)]; input()"
Traceback (most recent call last):
  ...
OSError: [Errno 24] Too many open files
```

Solution: raise it. systemd lets you set this per service in the unit file:

```ini
[Service]
LimitNOFILE=65536
```

Or globally for non-systemd processes, edit `/etc/security/limits.conf`:

```text
*               soft    nofile          65536
*               hard    nofile          1048576
deploy          soft    nproc           16384
deploy          hard    nproc           32768
```

For systemd-managed services, `limits.conf` does not apply — the unit file's `LimitNOFILE` is what matters.

## cgroups — the modern resource cage

**cgroups** (control groups) are a kernel feature that takes a set of processes and applies *collective* limits to them: total memory, total CPU share, total I/O bandwidth. systemd uses cgroups to manage every service it runs.

You can see this:

```bash
$ systemctl status nginx
● nginx.service - The nginx HTTP and reverse proxy server
     ...
     CGroup: /system.slice/nginx.service
             ├─1234 nginx: master process /usr/sbin/nginx
             ├─1235 nginx: worker process
             └─1236 nginx: worker process
```

The `CGroup: /system.slice/nginx.service` line tells you nginx and all its children live in one cgroup. Limits applied to that cgroup apply to all of them combined.

The three cgroup controllers you will use most:

| Controller | What it limits |
|---|---|
| `memory` | RAM consumed by the cgroup as a whole. |
| `cpu` | CPU share or hard quota. |
| `io` | Block-device read/write bandwidth and IOPS. |

## Setting cgroup limits via systemd

You can almost always avoid touching cgroups directly. systemd unit files have first-class properties:

```ini
[Service]
# Memory
MemoryMax=512M               # hard cap. Process is killed (or refused) past this.
MemoryHigh=384M              # soft pressure: kernel throttles allocations.
MemoryMin=128M               # protected from reclaim under global pressure.

# CPU
CPUQuota=50%                 # use up to 50% of one core
CPUWeight=100                # default is 100. Higher = more share under contention.
TasksMax=500                 # max number of processes/threads in this cgroup

# I/O
IOWeight=100                 # 1–10000, relative
IOReadBandwidthMax=/var/lib/myapp 100M   # per-device read cap
```

After editing, `daemon-reload` and restart the service.

To check what is in effect:

```bash
systemctl show myapp --property=MemoryMax,MemoryCurrent,CPUQuota
```

## Watching cgroup usage live

```bash
systemd-cgtop
```

Looks like `top`, but rows are cgroups (services), columns are CPU/memory/I/O usage:

```text
Control Group                            Tasks   %CPU   Memory  Input/s Output/s
/                                          189   12.3   2.1G        -        -
system.slice                                85    8.4   1.6G        -        -
system.slice/postgresql.service              7    4.1   648M        -        -
system.slice/nginx.service                   3    1.2    24M        -        -
system.slice/myapp.service                   2    0.8   128M        -        -
```

`cgtop` is the answer to "which service is using my CPU?" without scrolling through `top`.

## The OOM killer

When the system genuinely runs out of memory and cannot reclaim any, the kernel invokes the **out-of-memory killer**: it scores every process and kills the one that looks worst (high recent memory usage, low importance, no special protection).

When this happens you will see:

```bash
$ dmesg | grep -i "killed process"
[12345.678901] Out of memory: Killed process 1234 (myapp) total-vm:1234567kB, anon-rss:987654kB
```

Or via journalctl:

```bash
journalctl -k --grep="killed process"
```

The OOM killer is the kernel admitting defeat. It is a *symptom*, not a feature you should rely on. If your services are getting OOM-killed, you have either:

- Underprovisioned RAM (buy more, or move things off this box).
- A memory leak (fix it).
- Misconfigured cgroup limits (raised above what the box has).

## OOM scoring and protection

Each process has an OOM score. Two adjustments matter:

```bash
$ cat /proc/1234/oom_score
523
$ cat /proc/1234/oom_score_adj
0
```

- `oom_score` — kernel-computed. Higher = more likely to be killed.
- `oom_score_adj` — your override, range -1000 (immune) to +1000 (kill first).

Make a service unkillable by the OOM killer (use sparingly — kernel and journald are good candidates, your buggy app is not):

```ini
[Service]
OOMScoreAdjust=-500
```

For most services, set per-cgroup memory limits with `MemoryMax` instead. When a service hits its own cgroup limit, only *that service* is killed, not random other services on the box.

## CPU pinning and weights

On a multi-core VPS with multiple services, you can give one priority over another:

```ini
[Service]
CPUWeight=200            # 2x default share
```

Or pin a service to specific cores:

```ini
[Service]
CPUAffinity=0 1
```

This is rarely needed on small VPS but is the right tool when you have, say, a CPU-bound batch job that should never starve nginx.

## Disk I/O limits

A backup script that fully saturates disk I/O can make your database unresponsive. Set an I/O cap on the backup:

```ini
[Service]
IOWeight=10
```

`IOWeight` is relative — the backup gets 10% of the share that a default-weight service gets. Under contention, the database wins.

Hard caps:

```ini
IOReadBandwidthMax=/dev/sda 50M
IOWriteBandwidthMax=/dev/sda 50M
```

These cap the *cgroup's* total throughput on a specific device. The service can still burst above when no one else is using the disk.

## Practical: a hardened service template

Combine everything into one solid service template:

```ini
[Unit]
Description=My example service
After=network-online.target

[Service]
Type=simple
User=myapp
Group=myapp
ExecStart=/opt/myapp/bin/server
Restart=on-failure
RestartSec=5

# Files
LimitNOFILE=65536
LimitNPROC=4096

# Memory
MemoryMax=512M
MemoryHigh=384M

# CPU
CPUQuota=80%

# I/O
IOWeight=100

# OOM behavior
OOMPolicy=stop          # if killed by OOM, do not restart endlessly
OOMScoreAdjust=100      # this app is more killable than nginx

# Sandbox
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/myapp /var/log/myapp

[Install]
WantedBy=multi-user.target
```

`OOMPolicy=stop` means: if this service is OOM-killed, do not restart it in a loop. Without that, a leaking service will be restarted, leak, get killed, restart, leak — a tight loop that just heats your CPU.

## Diagnosing "what is using all the RAM?"

```bash
free -h                     # totals
ps -axo pid,user,rss,comm --sort=-rss | head      # top RSS processes
systemd-cgtop                                     # by cgroup/service
slabtop                                           # kernel-side memory caches
cat /proc/meminfo                                 # the full picture
```

`MemAvailable` in `/proc/meminfo` is the most honest number — it estimates how much RAM is reclaimable for a new allocation, accounting for caches.

## Recap

- Per-process rlimits are the original system. Default `nofile=1024` is too low for network services — raise it via `LimitNOFILE`.
- cgroups apply collective limits to a service. systemd's `MemoryMax`, `CPUQuota`, `TasksMax` are the everyday levers.
- `systemd-cgtop` shows live per-service usage. The first place to look when the box feels slow.
- The OOM killer is the kernel saying "no more memory anywhere." Use per-service `MemoryMax` to localize the damage.
- A solid service template combines rlimits, cgroup caps, OOM policy, and sandbox directives.

Next chapter: scheduling — cron and systemd timers for the work that runs on a clock.

