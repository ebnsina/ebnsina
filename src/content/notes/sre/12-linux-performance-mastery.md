---
title: 'Linux Performance Mastery'
subtitle: 'From `top` to `perf`, `bpftrace`, and flame graphs. The senior-SRE toolkit for diagnosing latency, CPU, memory, and I/O at the kernel level — without restarting anything in production.'
chapter: 12
level: 'mastery'
readingTime: '32 min'
topics: ['linux', 'perf', 'eBPF', 'bpftrace', 'flame graphs', 'USE', 'kernel', 'performance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why this chapter exists

The 8-week roadmap stops at "use Grafana to find slow endpoints." Real production failures live below that line: a service is slow but CPU is idle, p99 latency doubled but request rate is flat, throughput collapses at 8 PM with no deploy. Application metrics cannot answer those — you need kernel-level visibility.

This chapter teaches the toolchain Brendan Gregg, Netflix performance engineers, and senior SREs at Facebook actually use: `perf`, eBPF, `bpftrace`, BCC, flame graphs, and the USE method applied to every resource on a Linux box.

<Callout type="info">

**Real-World Analogy**

Application metrics are like the dashboard on a car. They tell you you're going slow. Kernel-level tools are the OBD-II port plus a stethoscope on the engine block — they tell you _which cylinder is misfiring_. You can drive without them. You cannot fix the car.

</Callout>

## The 60-second performance triage

Brendan Gregg's checklist. Run this within the first minute of any "the box feels slow" page. Each command is on a different layer of the stack so the answer falls out fast.

```bash
uptime                # load avg over 1, 5, 15 min — saturation trend
dmesg | tail          # OOM kills, TCP drops, hardware errors
vmstat 1              # run queue, swap, CPU breakdown (us / sy / wa / id)
mpstat -P ALL 1       # per-CPU breakdown — is one core pinned?
pidstat 1             # per-process CPU consumers
iostat -xz 1          # disk I/O — %util, await, r/s, w/s
free -m               # memory + buffers/cache
sar -n DEV 1          # NIC throughput + packets/sec
sar -n TCP,ETCP 1     # TCP retransmits, listen drops
top                   # the catch-all — sort by %CPU, then by RES
```

What each tells you, in priority:

| Signal                      | Tool     | What it rules out         |
| --------------------------- | -------- | ------------------------- |
| `load avg` >> CPU count     | `uptime` | "the box is idle"         |
| `wa` column high in vmstat  | `vmstat` | CPU bottleneck (it's I/O) |
| One CPU at 100% in `mpstat` | `mpstat` | "we need more cores"      |
| `await` >> 10ms in `iostat` | `iostat` | "the disk is fine"        |
| TCP retransmits > 0.1%      | `sar`    | "the network is fine"     |

## The USE method — every resource, three questions

For every resource (CPU, memory, disk, NIC, controller queues, file descriptors), ask:

```
Utilization  — % time the resource was busy
Saturation   — degree of queued work the resource cannot service yet
Errors       — count of error events
```

Most teams monitor utilization only. Saturation is where production dies — a CPU at 70% utilization but with run-queue depth 12 is far worse than one at 95% with run-queue depth 1.

```bash
# CPU
mpstat 1               # utilization
vmstat 1               # saturation (column `r` = run queue)
perf stat -a sleep 5   # errors (cache-misses, branch-misses)

# Memory
free -m                # utilization
sar -B 1               # saturation (pgscan/s = scanning, swap activity)
dmesg | grep -i oom    # errors (OOM kills)

# Disk
iostat -xz 1           # utilization (%util), saturation (avgqu-sz, await)
dmesg | grep -i ata    # errors

# Network
sar -n DEV 1           # utilization (rx/tx bytes vs link speed)
sar -n EDEV 1          # errors (rxerr/s, txdrop/s)
ss -s                  # saturation (tcp listen backlog)
```

The pattern: one tool per box. Build a dashboard with all three columns per resource and the answer to "where is the box hurting?" becomes a glance.

## CPU performance — beyond `top`

`top` shows you _who_ is running. It doesn't show you _what they're doing inside the kernel_. `perf` does.

### perf stat — the cheap counter dump

```bash
# Counters for one process for 10 seconds
perf stat -p $(pgrep -f my-svc) -- sleep 10

# Output (annotated):
#         12,345.67 msec task-clock           # 1.234 CPUs utilized
#               842      context-switches     # high = lock contention or epoll storms
#                12      cpu-migrations       # high = scheduler thrashing
#             8,193      page-faults          # high = memory churn or first-touch
#    23,456,789,012      cycles               # raw cycle count
#    18,234,567,890      instructions         # 0.78 IPC — IPC < 1 = stalled
#       145,678,901      branches
#         2,345,678      branch-misses        # 1.61% — predictor losing
#         4,567,890      cache-misses         # check vs cache-references
```

**The key signal: instructions per cycle (IPC).** Modern x86 cores can retire 4 instructions per cycle. If you measure 0.5 IPC, the CPU is stalled — usually on memory. If IPC is 2.5+, the workload is CPU-bound and you need either more cores or a smarter algorithm.

### perf record + flame graphs — the exact line of code

This is the highest-leverage tool in performance work. One command produces an interactive SVG showing exactly which functions consumed CPU.

```bash
# Sample on-CPU stacks at 99 Hz for 30 seconds
perf record -F 99 -p $(pgrep -f my-svc) -g -- sleep 30

# Convert to a flame graph
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg

# Read it: x-axis is sample count (NOT time), y-axis is stack depth.
# The wide plateaus near the top = where CPU actually goes.
```

For Go services, use `pprof` instead — the runtime is goroutine-aware:

```go
import _ "net/http/pprof"
// curl http://localhost:6060/debug/pprof/profile?seconds=30 > cpu.pprof
// go tool pprof -http=:8080 cpu.pprof
```

For Java/JVM, use `async-profiler` — it samples without safepoint bias.

<Callout type="tip">

**Flame graphs always read top-down for the answer.** The widest box at the _top_ is the leaf function eating CPU. The bottom of its column is the call chain. Don't read bottom-up; you'll waste 10 minutes on framework code.

</Callout>

## eBPF and bpftrace — observability without restarts

eBPF is the single biggest shift in Linux observability since `strace`. You attach safe, JIT-compiled programs to kernel hooks (kprobes, uprobes, tracepoints, USDT) and stream telemetry out — no kernel patches, no service restarts, near-zero overhead.

`bpftrace` is the awk-like CLI on top of eBPF. One-liners replace whole traditional tools.

### bpftrace one-liners that earn their keep

```bash
# Latency histogram of every read() syscall, system-wide
bpftrace -e 'kprobe:vfs_read { @start[tid] = nsecs; }
             kretprobe:vfs_read /@start[tid]/ {
               @us = hist((nsecs - @start[tid]) / 1000);
               delete(@start[tid]);
             }'

# Files opened by every process — better than strace
bpftrace -e 'tracepoint:syscalls:sys_enter_openat {
               printf("%-6d %-16s %s\n", pid, comm, str(args->filename));
             }'

# Track TCP retransmits with the IP and port
bpftrace -e 'tracepoint:tcp:tcp_retransmit_skb {
               printf("RT %s:%d -> %s:%d\n",
                      ntop(args->saddr), args->sport,
                      ntop(args->daddr), args->dport);
             }'

# What's calling fsync(), and how often
bpftrace -e 'kprobe:vfs_fsync_range { @[comm] = count(); }
             interval:s:5 { print(@); clear(@); }'
```

### BCC tools — pre-built BPF programs for the common cases

```bash
# Install once (Ubuntu/Debian)
apt install bpfcc-tools linux-headers-$(uname -r)

# Disk I/O latency histogram
biolatency-bpfcc -D 5 1

# Slow TCP connect()s
tcpconnlat-bpfcc 10           # > 10ms

# Process-level memory leak detection
memleak-bpfcc -p $(pgrep my-svc)

# Slow file I/O (per-file)
filetop-bpfcc 1

# What's blocking on locks
offcputime-bpfcc -p $(pgrep my-svc) -f 30 > out.stacks
flamegraph.pl --color=io < out.stacks > offcpu.svg
```

The last one — **off-CPU flame graphs** — is how you find lock contention, sleep storms, and "my service is slow but CPU is idle" mysteries. On-CPU flames show you what's running; off-CPU flames show you what's _blocked_. Together they cover the whole story.

## Memory — finding the real consumer

`free -m` lies. It shows kernel page cache as "used" because Linux uses every byte of free RAM for caching. Read it like:

```
total = used + buffers + cached + free
"available" = what processes can actually allocate without paging
```

The real questions:

```bash
# Per-process resident set, sorted
ps -eo pid,rss,comm --sort=-rss | head -20

# What's in the page cache (vmtouch is great)
vmtouch /var/lib/postgresql/data        # how much of PG is in cache?

# Track minor + major page faults per process
pidstat -r 1

# OOM killer scoring — who would die first?
for pid in $(pgrep -f my-svc); do
  echo "$pid $(cat /proc/$pid/oom_score)"
done

# Slab allocator — kernel memory consumers
slabtop -o | head -20
```

### The classic memory bug: the leaking sidecar

A pattern seen in real production: a sidecar (log shipper, mesh proxy) leaks 1 KB per request. Three weeks later, the node OOMs at 3 AM. The application looks innocent in `top` because the sidecar is in a different cgroup.

```bash
# Per-cgroup memory accounting (cgroup v2)
cat /sys/fs/cgroup/system.slice/my-svc.service/memory.current
cat /sys/fs/cgroup/system.slice/my-svc.service/memory.peak
cat /sys/fs/cgroup/system.slice/my-svc.service/memory.events  # oom_kill counter

# In Kubernetes, every pod has its own cgroup
ls /sys/fs/cgroup/kubepods.slice/
```

Set `memory.high` (soft limit) below `memory.max` (OOM-kill limit). The service slows under pressure instead of dying — buying you time to scale or roll back.

## Disk and filesystem — `iostat` is just the start

The four numbers from `iostat -xz 1`:

```
%util    — busy time. > 80% sustained = device near saturation.
await    — average request latency in ms (queue + service).
avgqu-sz — average queue depth. > 1 sustained = backlog forming.
r/s w/s  — IOPS. Compare to device's spec sheet.
```

But `%util` is misleading on SSDs and NVMe — they pipeline, so 100% util can still serve more IOPS. Trust `await` and the per-vendor IOPS spec instead.

### The deeper questions

```bash
# Which file is hot? (BCC)
filetop-bpfcc 1

# Slow individual I/Os, with stack
biosnoop-bpfcc

# fsync latency — the killer for any DB
ext4slower-bpfcc 5            # > 5ms ext4 ops
xfsslower-bpfcc 5             # > 5ms xfs ops

# What's in the dirty page queue
cat /proc/meminfo | grep -i dirty
```

The classic "nightly batch killed Postgres" outage: a backup job called `fsync()` on a 4 GB log, blocking the DB's WAL writer for 8 seconds. `ext4slower-bpfcc` would have flagged it the first night.

### Filesystem choice matters at scale

```
ext4   — the safe default. Predictable. Slower on >1M files per dir.
xfs    — better for very large files and high concurrent writes.
btrfs  — snapshots are great. CoW write amplification is real.
zfs    — best snapshots, ARC cache wins for read-heavy. Memory hungry.
```

For production databases, the mount options matter as much as the FS:

```bash
# Postgres on ext4, the boring-but-correct way
mount -o noatime,data=ordered,barrier=1 /dev/nvme0n1 /var/lib/postgresql
```

`noatime` alone shaves 20–30% off metadata write load on read-heavy filesystems.

## Network — beyond `ping`

Layer-by-layer toolset for the SRE on the box:

```bash
# Link layer
ip -s link                    # rx/tx errors, drops, collisions
ethtool eth0                  # speed, duplex, autoneg
ethtool -S eth0               # NIC-specific counters (rx_no_buffer_count!)

# IP / routing
ip route get 10.0.5.6         # which interface, next hop, src IP
ip rule                       # policy routing tables (look here for surprises)

# TCP — the layer that breaks
ss -tinp                      # sockets + cwnd, rtt, retrans (the killer fields)
ss -s                         # summary (TIME-WAIT, CLOSE-WAIT counts)
sar -n TCP,ETCP 1             # active/passive opens, retransmits

# Packet capture
tcpdump -i eth0 -nn -s0 -w /tmp/cap.pcap port 443 and host 10.0.5.6
# then open in Wireshark (read remotely with `tshark -r cap.pcap`)

# eBPF: TCP-level visibility without tcpdump
tcptop-bpfcc 1
tcplife-bpfcc                 # connection lifetimes + bytes
tcpretrans-bpfcc              # every retransmit with stack
```

The two TCP fields you should know cold:

- **cwnd** (congestion window) — how many segments the sender will put in flight before waiting for ACKs. A small cwnd in `ss -ti` after a long-lived connection means the path saw loss and slowed down.
- **rtt** (round-trip time) — should match your data center latency budget. If `ss -ti` shows rtt 5x baseline on internal connections, the NIC, switch, or kernel queue is hurting.

### A real example: the listen backlog drop

Symptom: 1% of new connections occasionally get reset for no reason. App looks fine, no errors logged.

```bash
# The smoking gun
nstat -s | grep -i listen
# ListenOverflows  142  <- new connections dropped
# ListenDrops      142

# Cause: SYN queue or accept queue full
ss -lnt
# Recv-Q  Send-Q
#   129   128       <- Recv-Q > Send-Q means the queue is full

# Fix
sysctl -w net.core.somaxconn=4096
sysctl -w net.ipv4.tcp_max_syn_backlog=8192
# AND raise the listen() backlog in the application
```

Without the kernel counter, this looks like a flaky network. With it, it's a one-line fix.

## TCP tuning that actually moves the needle

Most `sysctl` advice on the internet is cargo-cult. The few that matter on a modern (5.x+) kernel:

```bash
# Allow more concurrent connections
net.core.somaxconn=4096
net.core.netdev_max_backlog=10000

# More ephemeral ports for clients (proxies)
net.ipv4.ip_local_port_range="10240 65535"

# Don't waste a SYN+ACK on slow-start every reconnection
net.ipv4.tcp_slow_start_after_idle=0

# BBR congestion control — much better than CUBIC over lossy links
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr

# Faster reuse of TIME-WAIT for client-side proxies (NOT servers)
net.ipv4.tcp_tw_reuse=1
```

Test before and after with the same load. Anything that doesn't show up in your latency histogram is noise.

## Putting it together — a production debugging walkthrough

A real incident pattern: p99 latency for `/api/checkout` jumped from 80 ms to 600 ms with no code change.

```bash
# Step 1: which layer? Application metrics show p50 normal, p99 wild.
#         Suggests tail latency, not throughput.

# Step 2: USE method on the host.
mpstat -P ALL 1   # CPU is fine, < 40% all cores
iostat -xz 1      # NVMe await jumps to 25 ms occasionally
sar -n EDEV 1     # network errors flat
free -m           # memory fine

# Step 3: drill into disk. biosnoop shows individual slow I/Os.
biosnoop-bpfcc | head -50
# 14:03:02.123  postgres  5012  W 1234   8192  47.2

# Step 4: who's doing the writes?
ext4slower-bpfcc 20
# 14:03:02.123 postgres 5012 W 8192 47.21 wal/000000010000...

# Step 5: PG WAL writes. Why slow now? Check fsync queue.
cat /proc/meminfo | grep Dirty
# Dirty:  1843200 kB   <- 1.8 GB dirty pages. Backed up.

# Step 6: someone enabled a backup job that does sync() across the FS
#         every 5 minutes, flushing dirty pages all at once.

# Step 7: fix — separate the backup volume, or use rsync --bwlimit,
#         or schedule outside business hours.
```

No restart, no guess, no "let's roll back the deploy." Five tools, five minutes.

## Common pitfalls senior SREs avoid

1. **Looking at averages, missing tails.** p50 is fine; p99 tells the truth. Always histogram.
2. **Assuming the bottleneck is the most-loaded resource.** A 95%-utilized NIC is fine if the queue depth is 0; the 60% disk with queue depth 8 is the bottleneck.
3. **Trusting `top`'s CPU%.** The kernel scheduler counts time, not work. `perf stat` (IPC) tells you whether those cycles did anything.
4. **Restarting before observing.** Every restart destroys the state you need to debug. Snapshot first (`perf record`, `bpftrace`), then mitigate.
5. **Tuning sysctls one-at-a-time without a benchmark.** You'll find a "magic" setting that quietly harms a different workload three months later.

## Tooling tier list for an SRE box

```
Tier S (always installed)
  perf, bpftrace, sysstat, htop, ss, iotop, dstat, tcpdump

Tier A (one apt-get away)
  bcc-tools, async-profiler (for JVM), pprof (for Go)
  flamegraph scripts (Brendan Gregg's GitHub)

Tier B (specific situations)
  Wireshark/tshark, perf-tools (Brendan Gregg's older shell wrappers),
  blktrace, ftrace, strace (only when bpftrace can't reach it)

Tier F (avoid)
  Random sysctl scripts copied from blogs
  GUI-only tools you can't run over ssh
  "Performance optimizers" sold as products — they're wrappers around the above
```

## Stay current

- [Brendan Gregg's site](https://www.brendangregg.com/) — perf tools, methodology, kernel deep-dives
- [Linux kernel performance docs](https://www.kernel.org/doc/html/latest/admin-guide/perf/index.html) — authoritative
- [bpftrace reference](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc) — modern eBPF tracing
- [Julia Evans — debugging zines](https://wizardzines.com/) — Linux internals visualized

## Key Takeaways

1. **The 60-second triage covers 80% of host-level pages** — keep it muscle memory.
2. **USE method per resource is the senior baseline** — utilization alone is a lie.
3. **Flame graphs (on-CPU + off-CPU) replace hours of guessing** with one SVG.
4. **eBPF / bpftrace removes the "I'd need a restart to debug this" excuse** — observe live.
5. **Tail latency lives at the kernel layer** — application traces show _what_ is slow; kernel tools show _why_.
6. **Tune nothing without a measurement before and after.** The internet is full of anti-tuning advice.
