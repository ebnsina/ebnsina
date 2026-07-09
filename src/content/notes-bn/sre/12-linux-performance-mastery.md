---
title: 'Linux Performance Mastery'
subtitle: '`top` থেকে `perf`, `bpftrace`, আর flame graph পর্যন্ত। production-এ কিছু restart না করে kernel level-এ latency, CPU, memory, আর I/O diagnose করার senior-SRE toolkit।'
chapter: 12
level: 'mastery'
readingTime: '32 মিনিট'
topics: ['linux', 'perf', 'eBPF', 'bpftrace', 'flame graphs', 'USE', 'kernel', 'performance']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## এই chapter কেন আছে

8-সপ্তাহের roadmap "slow endpoint খুঁজতে Grafana ব্যবহার করো"-তে থেমে যায়। বাস্তব production failure সেই রেখার নিচে বাস করে: একটা service slow কিন্তু CPU idle, p99 latency দ্বিগুণ হয়েছে কিন্তু request rate flat, রাত 8টায় throughput ধসে যায় কোনো deploy ছাড়াই। Application metric এগুলোর উত্তর দিতে পারে না — আপনার kernel-level visibility লাগবে।

এই chapter সেই toolchain শেখায় যেটা Brendan Gregg, Netflix performance engineer, আর Facebook-এর senior SRE-রা আসলে ব্যবহার করে: `perf`, eBPF, `bpftrace`, BCC, flame graph, আর একটা Linux box-এর প্রতিটা resource-এ প্রয়োগ করা USE method।

<Callout type="info">

**বাস্তব জগতের উদাহরণ**

Application metric একটা গাড়ির dashboard-এর মতো। এটা আপনাকে বলে আপনি ধীরে যাচ্ছেন। Kernel-level tool হলো OBD-II port প্লাস engine block-এ একটা stethoscope — এটা বলে _কোন cylinder-টা misfire করছে_। আপনি এগুলো ছাড়া চালাতে পারবেন। কিন্তু গাড়ি ঠিক করতে পারবেন না।

</Callout>

## 60-সেকেন্ডের performance triage

Brendan Gregg-এর checklist। যেকোনো "box-টা slow লাগছে" page-এর প্রথম মিনিটের মধ্যে এটা চালান। প্রতিটা command stack-এর একটা ভিন্ন layer-এ, যাতে উত্তরটা দ্রুত বেরিয়ে আসে।

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

প্রতিটা আপনাকে কী বলে, অগ্রাধিকার অনুসারে:

| Signal                      | Tool     | What it rules out         |
| --------------------------- | -------- | ------------------------- |
| `load avg` >> CPU count     | `uptime` | "the box is idle"         |
| `wa` column high in vmstat  | `vmstat` | CPU bottleneck (it's I/O) |
| One CPU at 100% in `mpstat` | `mpstat` | "we need more cores"      |
| `await` >> 10ms in `iostat` | `iostat` | "the disk is fine"        |
| TCP retransmits > 0.1%      | `sar`    | "the network is fine"     |

## USE method — প্রতিটা resource, তিনটা প্রশ্ন

প্রতিটা resource-এর জন্য (CPU, memory, disk, NIC, controller queue, file descriptor), জিজ্ঞেস করুন:

```
Utilization  — % time the resource was busy
Saturation   — degree of queued work the resource cannot service yet
Errors       — count of error events
```

বেশিরভাগ team শুধু utilization monitor করে। Saturation-ই যেখানে production মরে — 70% utilization কিন্তু run-queue depth 12-ওয়ালা একটা CPU, 95% কিন্তু run-queue depth 1-ওয়ালা একটার চেয়ে অনেক খারাপ।

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

pattern-টা: প্রতি box-এ একটা tool। প্রতি resource-এ তিনটা column সহ একটা dashboard বানান আর "box কোথায় ব্যথা পাচ্ছে?" এর উত্তর একটা glance হয়ে যায়।

## CPU performance — `top`-এর বাইরে

`top` আপনাকে দেখায় _কে_ চলছে। এটা দেখায় না _তারা kernel-এর ভেতরে কী করছে_। `perf` দেখায়।

### perf stat — সস্তা counter dump

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

**মূল signal: instructions per cycle (IPC)।** আধুনিক x86 core প্রতি cycle-এ 4টি instruction retire করতে পারে। আপনি যদি 0.5 IPC মাপেন, CPU stall করছে — সাধারণত memory-তে। IPC যদি 2.5+ হয়, workload CPU-bound আর আপনার হয় আরও core, নয়তো একটা স্মার্ট algorithm লাগবে।

### perf record + flame graph — code-এর ঠিক line

এটা performance work-এর সবচেয়ে বেশি leverage-দেওয়া tool। একটা command একটা interactive SVG তৈরি করে যেটা ঠিক দেখায় কোন function CPU খেয়েছে।

```bash
# Sample on-CPU stacks at 99 Hz for 30 seconds
perf record -F 99 -p $(pgrep -f my-svc) -g -- sleep 30

# Convert to a flame graph
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg

# Read it: x-axis is sample count (NOT time), y-axis is stack depth.
# The wide plateaus near the top = where CPU actually goes.
```

Go service-এর জন্য, তার বদলে `pprof` ব্যবহার করুন — runtime-টা goroutine-aware:

```go
import _ "net/http/pprof"
// curl http://localhost:6060/debug/pprof/profile?seconds=30 > cpu.pprof
// go tool pprof -http=:8080 cpu.pprof
```

Java/JVM-এর জন্য, `async-profiler` ব্যবহার করুন — এটা safepoint bias ছাড়াই sample করে।

<Callout type="tip">

**Flame graph উত্তরের জন্য সবসময় top-down পড়ুন।** _উপরের_ সবচেয়ে চওড়া box হলো সেই leaf function যেটা CPU খাচ্ছে। তার column-এর নিচের অংশটা হলো call chain। bottom-up পড়বেন না; framework code-এ 10 মিনিট নষ্ট করবেন।

</Callout>

## eBPF আর bpftrace — restart ছাড়া observability

eBPF হলো `strace`-এর পর Linux observability-তে একক সবচেয়ে বড় পরিবর্তন। আপনি নিরাপদ, JIT-compiled program kernel hook-এ (kprobe, uprobe, tracepoint, USDT) attach করেন আর telemetry stream করে বের করেন — কোনো kernel patch নেই, কোনো service restart নেই, প্রায়-শূন্য overhead।

`bpftrace` হলো eBPF-এর উপর awk-এর মতো CLI। one-liner পুরো traditional tool প্রতিস্থাপন করে।

### যে bpftrace one-liner-গুলো তাদের মূল্য দেয়

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

### BCC tools — সাধারণ ক্ষেত্রের জন্য pre-built BPF program

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

শেষেরটা — **off-CPU flame graph** — এভাবেই আপনি lock contention, sleep storm, আর "আমার service slow কিন্তু CPU idle" রহস্য খুঁজে পান। On-CPU flame আপনাকে দেখায় কী চলছে; off-CPU flame দেখায় কী _blocked_। একসাথে তারা পুরো গল্প কভার করে।

## Memory — আসল consumer খুঁজে বের করা

`free -m` মিথ্যা বলে। এটা kernel page cache-কে "used" হিসেবে দেখায় কারণ Linux caching-এর জন্য free RAM-এর প্রতিটা byte ব্যবহার করে। এভাবে পড়ুন:

```
total = used + buffers + cached + free
"available" = what processes can actually allocate without paging
```

আসল প্রশ্নগুলো:

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

### ক্লাসিক memory bug: leaking sidecar

বাস্তব production-এ দেখা একটা pattern: একটা sidecar (log shipper, mesh proxy) প্রতি request-এ 1 KB leak করে। তিন সপ্তাহ পরে, node রাত 3 AM-এ OOM করে। application-কে `top`-এ নিরীহ দেখায় কারণ sidecar একটা ভিন্ন cgroup-এ।

```bash
# Per-cgroup memory accounting (cgroup v2)
cat /sys/fs/cgroup/system.slice/my-svc.service/memory.current
cat /sys/fs/cgroup/system.slice/my-svc.service/memory.peak
cat /sys/fs/cgroup/system.slice/my-svc.service/memory.events  # oom_kill counter

# In Kubernetes, every pod has its own cgroup
ls /sys/fs/cgroup/kubepods.slice/
```

`memory.high` (soft limit) `memory.max` (OOM-kill limit)-এর নিচে সেট করুন। service মারা যাওয়ার বদলে চাপের নিচে slow হয় — আপনাকে scale বা roll back করার সময় দেয়।

## Disk আর filesystem — `iostat` শুধু শুরু

`iostat -xz 1` থেকে চারটা সংখ্যা:

```
%util    — busy time. > 80% sustained = device near saturation.
await    — average request latency in ms (queue + service).
avgqu-sz — average queue depth. > 1 sustained = backlog forming.
r/s w/s  — IOPS. Compare to device's spec sheet.
```

কিন্তু `%util` SSD আর NVMe-তে বিভ্রান্তিকর — তারা pipeline করে, তাই 100% util-এও আরও IOPS serve করতে পারে। তার বদলে `await` আর per-vendor IOPS spec-এ ভরসা করুন।

### গভীর প্রশ্নগুলো

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

ক্লাসিক "রাতের batch Postgres মেরে ফেলল" outage: একটা backup job একটা 4 GB log-এ `fsync()` call করেছিল, DB-এর WAL writer-কে 8 সেকেন্ড ধরে block করে রেখেছিল। `ext4slower-bpfcc` প্রথম রাতেই এটা flag করত।

### Filesystem-এর choice scale-এ গুরুত্বপূর্ণ

```
ext4   — the safe default. Predictable. Slower on >1M files per dir.
xfs    — better for very large files and high concurrent writes.
btrfs  — snapshots are great. CoW write amplification is real.
zfs    — best snapshots, ARC cache wins for read-heavy. Memory hungry.
```

production database-এর জন্য, mount option-গুলো FS-এর মতোই গুরুত্বপূর্ণ:

```bash
# Postgres on ext4, the boring-but-correct way
mount -o noatime,data=ordered,barrier=1 /dev/nvme0n1 /var/lib/postgresql
```

শুধু `noatime` read-heavy filesystem-এ metadata write load থেকে 20–30% কমিয়ে দেয়।

## Network — `ping`-এর বাইরে

box-এর SRE-র জন্য layer-by-layer toolset:

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

যে দুটো TCP field আপনার মুখস্থ জানা উচিত:

- **cwnd** (congestion window) — ACK-এর জন্য অপেক্ষা করার আগে sender কতগুলো segment in flight রাখবে। একটা long-lived connection-এর পরে `ss -ti`-তে একটা ছোট cwnd মানে path-টা loss দেখেছে আর ধীর হয়ে গেছে।
- **rtt** (round-trip time) — আপনার data center latency budget-এর সাথে মেলা উচিত। যদি `ss -ti` internal connection-এ baseline-এর 5x rtt দেখায়, NIC, switch, বা kernel queue ব্যথা পাচ্ছে।

### একটা বাস্তব উদাহরণ: listen backlog drop

Symptom: 1% নতুন connection মাঝেমধ্যে বিনা কারণে reset হয়। App ঠিক দেখায়, কোনো error log হয় না।

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

kernel counter ছাড়া, এটাকে একটা flaky network-এর মতো দেখায়। এটা দিয়ে, এটা একটা one-line fix।

## যে TCP tuning সত্যিই কাজে লাগে

internet-এ বেশিরভাগ `sysctl` পরামর্শ cargo-cult। একটা আধুনিক (5.x+) kernel-এ যে কয়েকটা গুরুত্বপূর্ণ:

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

একই load দিয়ে আগে আর পরে test করুন। আপনার latency histogram-এ যা দেখা যায় না তা noise।

## সব একসাথে — একটা production debugging walkthrough

একটা বাস্তব incident pattern: `/api/checkout`-এর জন্য p99 latency কোনো code change ছাড়াই 80 ms থেকে 600 ms-এ লাফ দিল।

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

কোনো restart নেই, কোনো অনুমান নেই, কোনো "চলো deploy roll back করি" নেই। পাঁচটা tool, পাঁচ মিনিট।

## যে সাধারণ ফাঁদ senior SRE-রা এড়ায়

1. **Average দেখা, tail miss করা।** p50 ঠিক আছে; p99 সত্য বলে। সবসময় histogram করুন।
2. **ধরে নেওয়া bottleneck হলো সবচেয়ে বেশি লোডেড resource।** একটা 95%-utilized NIC ঠিক আছে যদি queue depth 0 হয়; queue depth 8-ওয়ালা 60% disk-টাই bottleneck।
3. **`top`-এর CPU%-এ ভরসা করা।** kernel scheduler সময় গণনা করে, কাজ নয়। `perf stat` (IPC) বলে সেই cycle-গুলো আদৌ কিছু করেছে কিনা।
4. **observe করার আগে restart করা।** প্রতিটা restart সেই state ধ্বংস করে যা আপনার debug করতে লাগবে। আগে snapshot নিন (`perf record`, `bpftrace`), তারপর mitigate করুন।
5. **benchmark ছাড়া একটা একটা করে sysctl tune করা।** আপনি একটা "magic" setting খুঁজে পাবেন যেটা তিন মাস পরে নীরবে একটা ভিন্ন workload-এর ক্ষতি করে।

## একটা SRE box-এর জন্য tooling tier list

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

## আপডেটেড থাকুন

- [Brendan Gregg's site](https://www.brendangregg.com/) — perf tool, methodology, kernel deep-dive
- [Linux kernel performance docs](https://www.kernel.org/doc/html/latest/admin-guide/perf/index.html) — authoritative
- [bpftrace reference](https://github.com/bpftrace/bpftrace/blob/master/man/adoc/bpftrace.adoc) — আধুনিক eBPF tracing
- [Julia Evans — debugging zines](https://wizardzines.com/) — Linux internals visualized

## মূল কথাগুলো

1. **60-সেকেন্ডের triage host-level page-এর 80% কভার করে** — এটা muscle memory রাখুন।
2. **প্রতি resource-এ USE method হলো senior baseline** — শুধু utilization একটা মিথ্যা।
3. **Flame graph (on-CPU + off-CPU) ঘণ্টার পর ঘণ্টা অনুমান প্রতিস্থাপন করে** একটা SVG দিয়ে।
4. **eBPF / bpftrace "এটা debug করতে একটা restart লাগত" অজুহাত সরিয়ে দেয়** — live observe করুন।
5. **Tail latency kernel layer-এ বাস করে** — application trace দেখায় _কী_ slow; kernel tool দেখায় _কেন_।
6. **আগে আর পরে measurement ছাড়া কিছু tune করবেন না।** internet anti-tuning পরামর্শে ভরা।
