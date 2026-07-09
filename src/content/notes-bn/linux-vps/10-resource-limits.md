---
title: 'Resource Limits'
subtitle: 'ulimit, cgroups, আর OOM killer — resource control-এর তিনটা স্তর যা ঠিক করে আপনার সার্ভিসগুলো বক্সটা ভদ্রভাবে ভাগ করে নেবে নাকি মরণপণ লড়াই করবে।'
chapter: 10
level: 'advanced'
readingTime: '13 মিনিট'
topics: ['cgroups', 'ulimit', 'oom', 'limits', 'linux']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

Resource limit অনেকটা সার্কিট ব্রেকারের মতো — এটা একটা ওভারলোডেড যন্ত্রকে বেশি কারেন্ট টেনে পুরো বাড়ি ফেলে দেওয়া থেকে ঠেকায়।

</Callout>

## limit কেন থাকে

একটা Linux বক্সের resource সীমিত: CPU cycle, RAM, file descriptor, প্রসেস, disk I/O ব্যান্ডউইথ। চলমান প্রতিটা সার্ভিস এই resource-গুলোর জন্য প্রতিযোগিতা করে। limit ছাড়া, একটামাত্র bug — একটা memory leak, একটা runaway loop, একটা প্রসেস টাইট লুপে child প্রসেস spawn করা — বক্সের বাকি সব সার্ভিসকে (ssh আর journald সহ) অনাহারে ফেলে দিতে পারে, আপনাকে লক আউট করে দিয়ে আর মেশিনটাকে কার্যত মৃত বানিয়ে।

জানার মতো limit-এর তিনটা স্তর আছে:

1. **Per-process limit (ulimit / rlimits)** — প্রসেস শুরু হওয়ার সময় সেট হয়, কার্নেল enforce করে।
2. **Cgroups** — একগুচ্ছ প্রসেসের ওপর group-লেভেল limit (আপনার পুরো সার্ভিস বা কন্টেইনার)।
3. **OOM killer** — memory ফুরিয়ে গেলে কার্নেলের শেষ ভরসা।

systemd তার সুপারভাইজ করা সার্ভিসগুলোর জন্য এই তিনটাকেই একসাথে বেঁধে দেয়।

## Per-process limit — `ulimit`

কার্নেল যখন একটা প্রসেস fork করে, সেটা **rlimits** নামে একগুচ্ছ resource limit উত্তরাধিকারসূত্রে পায়। shell সেগুলোকে `ulimit` হিসেবে প্রকাশ করে:

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

বাস্তবে সবচেয়ে গুরুত্বপূর্ণগুলো:

| Limit              | Flag | cap-এ পৌঁছালে যা হয়                                                            |
| ------------------ | ---- | ------------------------------------------------------------------------------- |
| Open files (FDs)   | `-n` | `accept()` আর `open()` `EMFILE` ফেরত দিতে শুরু করে। নেটওয়ার্ক সার্ভিস ফেল করে। |
| Max user processes | `-u` | `fork()` `EAGAIN` ফেরত দেয়। worker spawn করা যায় না।                          |
| Stack size         | `-s` | গভীর recursion প্রসেস ক্র্যাশ করে।                                              |
| Max RAM (virtual)  | `-v` | `malloc()` ফেল করে। অ্যাপ সামলায় বা ক্র্যাশ করে।                               |
| CPU time           | `-t` | এত সেকেন্ড CPU time-এর পরে প্রসেস kill হয়ে যায়।                               |

`ulimit` ডিফল্টভাবে **soft** limit দেখায়, যে মানের অধীনে প্রসেসটা এখন আছে। `ulimit -aH` দেখায় **hard** limit, যে cap পর্যন্ত একটা প্রসেস root না হয়ে তার soft limit বাড়াতে পারে।

## 1024 file descriptor সমস্যা

বেশিরভাগ distro-তে `ulimit -n`-এর ডিফল্ট **1024**। এটা একটা প্রসেসের খোলা রাখতে পারা ফাইলের সংখ্যা (socket সহ)। যেকোনো সত্যিকারের নেটওয়ার্ক সার্ভিসের জন্য এটা _খুব কম_।

একটা দ্রুত টেস্ট চালান:

```bash
# In one terminal:
$ python3 -c "import socket; ss=[socket.socket() for _ in range(2000)]; input()"
Traceback (most recent call last):
  ...
OSError: [Errno 24] Too many open files
```

সমাধান: এটা বাড়ান। systemd আপনাকে unit ফাইলে per-service এটা সেট করতে দেয়:

```ini
[Service]
LimitNOFILE=65536
```

বা non-systemd প্রসেসের জন্য গ্লোবালভাবে, `/etc/security/limits.conf` এডিট করুন:

```text
*               soft    nofile          65536
*               hard    nofile          1048576
deploy          soft    nproc           16384
deploy          hard    nproc           32768
```

systemd-পরিচালিত সার্ভিসের জন্য `limits.conf` প্রযোজ্য নয় — unit ফাইলের `LimitNOFILE`-ই যা গুরুত্বপূর্ণ।

## cgroups — আধুনিক resource খাঁচা

**cgroups** (control groups) হলো একটা কার্নেল ফিচার যা একগুচ্ছ প্রসেস নিয়ে তাদের ওপর _সম্মিলিত_ limit প্রয়োগ করে: মোট memory, মোট CPU share, মোট I/O ব্যান্ডউইথ। systemd তার চালানো প্রতিটা সার্ভিস পরিচালনা করতে cgroups ব্যবহার করে।

আপনি এটা দেখতে পারেন:

```bash
$ systemctl status nginx
● nginx.service - The nginx HTTP and reverse proxy server
     ...
     CGroup: /system.slice/nginx.service
             ├─1234 nginx: master process /usr/sbin/nginx
             ├─1235 nginx: worker process
             └─1236 nginx: worker process
```

`CGroup: /system.slice/nginx.service` লাইনটা বলে nginx আর তার সব child একটা cgroup-এ থাকে। ওই cgroup-এ প্রয়োগ করা limit তাদের সবার ওপর একসাথে প্রযোজ্য।

সবচেয়ে বেশি ব্যবহার করবেন এমন তিনটা cgroup controller:

| Controller | যা limit করে                                |
| ---------- | ------------------------------------------- |
| `memory`   | cgroup-টা সামগ্রিকভাবে যত RAM খরচ করে।      |
| `cpu`      | CPU share বা hard quota।                    |
| `io`       | Block-device read/write ব্যান্ডউইথ আর IOPS। |

## systemd-এর মাধ্যমে cgroup limit সেট করা

আপনি প্রায় সবসময়ই সরাসরি cgroups ঘাঁটা এড়াতে পারেন। systemd unit ফাইলে first-class property আছে:

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

এডিট করার পরে, `daemon-reload` করুন আর সার্ভিসটা restart করুন।

কী কার্যকর আছে তা চেক করতে:

```bash
systemctl show myapp --property=MemoryMax,MemoryCurrent,CPUQuota
```

## cgroup ব্যবহার লাইভ দেখা

```bash
systemd-cgtop
```

দেখতে `top`-এর মতো, কিন্তু row-গুলো cgroup (সার্ভিস), column-গুলো CPU/memory/I/O ব্যবহার:

```text
Control Group                            Tasks   %CPU   Memory  Input/s Output/s
/                                          189   12.3   2.1G        -        -
system.slice                                85    8.4   1.6G        -        -
system.slice/postgresql.service              7    4.1   648M        -        -
system.slice/nginx.service                   3    1.2    24M        -        -
system.slice/myapp.service                   2    0.8   128M        -        -
```

`top`-এর ভেতর স্ক্রল না করেই "কোন সার্ভিস আমার CPU খাচ্ছে?" প্রশ্নের উত্তর হলো `cgtop`।

## OOM killer

সিস্টেম যখন সত্যিই memory ফুরিয়ে ফেলে আর কিছুই reclaim করতে পারে না, কার্নেল **out-of-memory killer** ডাকে: এটা প্রতিটা প্রসেসকে স্কোর দেয় আর যেটাকে সবচেয়ে খারাপ দেখায় সেটাকে kill করে (সাম্প্রতিক বেশি memory ব্যবহার, কম গুরুত্ব, কোনো বিশেষ সুরক্ষা নেই)।

এটা ঘটলে আপনি দেখবেন:

```bash
$ dmesg | grep -i "killed process"
[12345.678901] Out of memory: Killed process 1234 (myapp) total-vm:1234567kB, anon-rss:987654kB
```

অথবা journalctl-এর মাধ্যমে:

```bash
journalctl -k --grep="killed process"
```

OOM killer হলো কার্নেলের হার মেনে নেওয়া। এটা একটা _উপসর্গ_, এমন কোনো ফিচার নয় যার ওপর আপনার নির্ভর করা উচিত। আপনার সার্ভিসগুলো যদি OOM-kill হতে থাকে, তাহলে হয়:

- RAM কম দিয়েছেন (আরও কিনুন, বা জিনিস এই বক্স থেকে সরান)।
- একটা memory leak আছে (ঠিক করুন)।
- cgroup limit ভুল কনফিগার করা (বক্সে যা আছে তার চেয়ে বেশি বাড়িয়ে দিয়েছেন)।

## OOM scoring আর সুরক্ষা

প্রতিটা প্রসেসের একটা OOM score আছে। দুটো adjustment গুরুত্বপূর্ণ:

```bash
$ cat /proc/1234/oom_score
523
$ cat /proc/1234/oom_score_adj
0
```

- `oom_score` — কার্নেল-হিসাবকৃত। বেশি = kill হওয়ার সম্ভাবনা বেশি।
- `oom_score_adj` — আপনার override, রেঞ্জ -1000 (immune) থেকে +1000 (আগে kill)।

একটা সার্ভিসকে OOM killer দিয়ে অ-killable বানান (কম ব্যবহার করুন — কার্নেল আর journald ভালো candidate, আপনার buggy অ্যাপ নয়):

```ini
[Service]
OOMScoreAdjust=-500
```

বেশিরভাগ সার্ভিসের জন্য, তার বদলে `MemoryMax` দিয়ে per-cgroup memory limit সেট করুন। একটা সার্ভিস যখন তার নিজের cgroup limit ছোঁয়, তখন শুধু _সেই সার্ভিসটাই_ kill হয়, বক্সের অন্য এলোমেলো সার্ভিস নয়।

## CPU pinning আর weight

একাধিক সার্ভিস সহ একটা multi-core VPS-এ, আপনি একটাকে আরেকটার চেয়ে অগ্রাধিকার দিতে পারেন:

```ini
[Service]
CPUWeight=200            # 2x default share
```

অথবা একটা সার্ভিসকে নির্দিষ্ট core-এ pin করুন:

```ini
[Service]
CPUAffinity=0 1
```

ছোট VPS-এ এটা কদাচিৎ দরকার হয়, কিন্তু যখন আপনার, ধরুন, একটা CPU-bound batch job আছে যেটার কখনও nginx-কে অনাহারে ফেলা উচিত নয়, তখন এটাই সঠিক হাতিয়ার।

## Disk I/O limit

একটা backup স্ক্রিপ্ট যা পুরো disk I/O saturate করে দেয় সেটা আপনার database-কে অসাড় করে দিতে পারে। backup-এর ওপর একটা I/O cap সেট করুন:

```ini
[Service]
IOWeight=10
```

`IOWeight` আপেক্ষিক — backup একটা default-weight সার্ভিস যে share পায় তার 10% পায়। প্রতিযোগিতায় database জেতে।

Hard cap:

```ini
IOReadBandwidthMax=/dev/sda 50M
IOWriteBandwidthMax=/dev/sda 50M
```

এগুলো একটা নির্দিষ্ট device-এ _cgroup-এর_ মোট throughput cap করে। disk আর কেউ ব্যবহার না করলে সার্ভিসটা এখনও তার ওপরে burst করতে পারে।

## প্র্যাক্টিক্যাল: একটা hardened সার্ভিস টেমপ্লেট

সবকিছু একটা মজবুত সার্ভিস টেমপ্লেটে মিলিয়ে ফেলুন:

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

`OOMPolicy=stop` মানে: এই সার্ভিসটা OOM-kill হলে, সেটাকে লুপে restart করো না। সেটা ছাড়া, একটা leak করা সার্ভিস restart হবে, leak করবে, kill হবে, restart হবে, leak করবে — একটা টাইট লুপ যা শুধু আপনার CPU গরম করে।

## নির্ণয়: "সব RAM কে খাচ্ছে?"

```bash
free -h                     # totals
ps -axo pid,user,rss,comm --sort=-rss | head      # top RSS processes
systemd-cgtop                                     # by cgroup/service
slabtop                                           # kernel-side memory caches
cat /proc/meminfo                                 # the full picture
```

`/proc/meminfo`-তে `MemAvailable` হলো সবচেয়ে সৎ সংখ্যা — এটা আন্দাজ করে একটা নতুন allocation-এর জন্য কতটুকু RAM reclaim করা যাবে, cache হিসাব করে।

## রিক্যাপ

- Per-process rlimit হলো আদি সিস্টেম। ডিফল্ট `nofile=1024` নেটওয়ার্ক সার্ভিসের জন্য খুব কম — `LimitNOFILE` দিয়ে বাড়ান।
- cgroups একটা সার্ভিসে সম্মিলিত limit প্রয়োগ করে। systemd-এর `MemoryMax`, `CPUQuota`, `TasksMax` হলো দৈনন্দিন লিভার।
- `systemd-cgtop` লাইভ per-service ব্যবহার দেখায়। বক্স ধীর মনে হলে প্রথমে এখানে দেখুন।
- OOM killer হলো কার্নেলের "কোথাও আর memory নেই" বলা। ক্ষতি স্থানীয় করতে per-service `MemoryMax` ব্যবহার করুন।
- একটা মজবুত সার্ভিস টেমপ্লেট rlimit, cgroup cap, OOM policy আর sandbox ডিরেক্টিভ মিলিয়ে দেয়।

পরের অধ্যায়: scheduling — ঘড়ি ধরে চলা কাজের জন্য cron আর systemd timer।
