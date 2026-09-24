---
title: 'What Are Containers'
subtitle: 'Namespaces, cgroups, এবং union filesystem — docker run-এর নিচে আসলে কী ঘটছে।'
chapter: 1
level: 'beginner'
readingTime: '9 মিনিট'
topics: ['containers', 'namespaces', 'cgroups', 'union filesystem', 'OCI']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা শিপিং কন্টেইনার: containers-এর আগে কার্গো আলগাভাবে লোড করা হতো — প্রতিটা জাহাজ আর পোর্টের আলাদা যন্ত্রপাতি লাগত, ট্রানজিটে জিনিসপত্র নষ্ট হতো, আর লোড করতে কয়েকদিন লাগত। স্ট্যান্ডার্ড কন্টেইনার সবকিছুকে interoperable করে দিল। আপনি আপনার অ্যাপ্লিকেশন আর তার dependency-গুলো একটা স্ট্যান্ডার্ড ইউনিটে প্যাক করেন যা সব জায়গায় একইভাবে চলে — আপনার ল্যাপটপে, CI-তে, প্রোডাকশনে।

</Callout>

## গল্পে বুঝি

সিনা বুখারায় একটা বড় বিল্ডিং বানিয়েছেন — সার্ভিসড অ্যাপার্টমেন্ট। প্রতিটা ফ্ল্যাট আলাদা আর স্বয়ংসম্পূর্ণ: খোয়ারিজমি নিজের ফ্ল্যাটে থাকেন, তার নিজের রান্নাঘর, নিজের দরজা, নিজের চাবি — পাশের ফ্ল্যাটের ফাতিমা কী করছেন তা তিনি দেখেনও না, তার জিনিসে হাতও দিতে পারেন না। কিন্তু বিল্ডিংয়ের নিচে একটাই পানির লাইন, একটাই বিদ্যুতের মেইন লাইন, আর একটাই ভিত — সব ফ্ল্যাট মিলেমিশে সেগুলোই শেয়ার করে। তাই নতুন কোনো ভাড়াটে এলে সিনাকে আবার পাইপ বসাতে বা নতুন ভিত ঢালতে হয় না — খালি ফ্ল্যাটের চাবি ধরিয়ে দিলেই কয়েক মিনিটে সে থাকতে শুরু করে দিতে পারে।

এর উল্টো দিকটা ভাবুন — প্রতিটা ভাড়াটের জন্য যদি আলাদা আলাদা পুরো একটা বাড়ি বানাতে হতো, প্রতিটার নিজের ভিত, নিজের পানির সংযোগ, নিজের বিদ্যুতের লাইন? তাহলে একজনকে জায়গা দিতেই কয়েক মাস আর অনেক খরচ চলে যেত, আর জমিতে হাতেগোনা কয়েকটা বাড়িই আঁটত।

এই ফ্ল্যাটগুলোই হলো **container** — প্রতিটা container নিজের অ্যাপকে isolated রাখে (নিজের filesystem, নিজের network, নিজের PID), কিন্তু নিচের শেয়ার করা পানি-বিদ্যুৎ-ভিতের মতো সবাই একটাই **host OS kernel** শেয়ার করে, তাই একটা container চালু করা সস্তা আর মুহূর্তেই হয়ে যায় — lightweight ও দ্রুত। আর নিজের ভিত নিয়ে আলাদা পুরো বাড়িটা হলো **VM** — সেটা নিজের পুরো OS বয়ে বেড়ায়, তাই ভারী আর চালু হতে ধীর। বাস্তবে তাই এক সার্ভারে ডজন ডজন container চালানো যায় যেখানে VM আঁটে হাতেগোনা কয়েকটা — Docker, Kubernetes দিয়ে প্রোডাকশনে ঠিক এভাবেই একটা মেশিনে অনেকগুলো অ্যাপ ঘন করে চালানো হয়।

## এটা VM নয়

Containers ভার্চুয়াল মেশিন নয়। একটা VM পুরো একটা কম্পিউটার এমুলেট করে — CPU, memory, disk, network — যার ভেতরে একটা পূর্ণ OS kernel চলে। এই isolation শক্তিশালী কিন্তু ব্যয়বহুল: VM চালু হতে কয়েক সেকেন্ড লাগে আর শুধু OS-এর overhead-এই কয়েকশো MB খরচ হয়।

একটা container হোস্ট kernel শেয়ার করে। এটা হোস্টের উপর একটা isolated process (বা process-এর গ্রুপ) — যার নিজস্ব filesystem view, network stack, আর resource limit আছে — কিন্তু আলাদা কোনো kernel নেই। এতে containers হয়:

- **দ্রুত চালু:** মিলিসেকেন্ডে, সেকেন্ডে নয়
- **হালকা:** কয়েক দশ MB overhead, শত শত নয়
- **ঘন:** এক হোস্টে ডজন ডজন container, যেখানে VM হাতেগোনা কয়েকটা

ট্রেড-অফ: containers kernel শেয়ার করে, তাই একটা container-এ kernel exploit হলে সেটা অন্যগুলোকেও প্রভাবিত করতে পারে। VM শক্তিশালী security isolation দেয়। অবিশ্বস্ত কোড চালানো multi-tenant এনভায়রনমেন্টের জন্য VM (বা gVisor/Kata Containers) এখনও উপযুক্ত।

## তিনটা Kernel Primitive

Containers তিনটা Linux kernel ফিচারের উপর তৈরি:

### Namespaces (Isolation)

Namespaces একটা process-কে নির্দিষ্ট কিছু resource-এর নিজস্ব view দিয়ে ভাবায় যে সে সিস্টেমে একা:

| Namespace | যা isolate করে                                          |
| --------- | ------------------------------------------------------- |
| `pid`     | Process ID — container তার process-কে PID 1 হিসেবে দেখে |
| `net`     | Network interface, routing table, port                  |
| `mnt`     | Filesystem mount point                                  |
| `uts`     | Hostname আর domain name                                 |
| `ipc`     | Message queue, semaphore, shared memory                 |
| `user`    | User আর group ID                                        |
| `cgroup`  | Cgroup hierarchy-র view                                 |

```bash
# See namespaces of a running container
docker inspect --format '{{.State.Pid}}' mycontainer
ls -la /proc/<pid>/ns/
# lrwxrwxrwx 1 root root 0 Jan 1 12:00 net -> net:[4026532008]
# lrwxrwxrwx 1 root root 0 Jan 1 12:00 pid -> pid:[4026532009]
# Different numbers = different namespaces = isolation
```

### cgroups (Resource Limits)

Control Groups নিয়ন্ত্রণ করে একটা container কতটুকু CPU, memory, disk I/O, আর network bandwidth ব্যবহার করতে পারবে:

```bash
# Docker uses cgroups under the hood
docker run --memory=512m --cpus=1.5 myapp

# What Docker actually creates:
cat /sys/fs/cgroup/memory/docker/<container-id>/memory.limit_in_bytes
# 536870912 (512 * 1024 * 1024)

cat /sys/fs/cgroup/cpu/docker/<container-id>/cpu.cfs_quota_us
# 150000 (1.5 cores * 100000)
```

cgroup limit ছাড়া, একটা container পুরো হোস্টের memory খেয়ে ফেলে অন্যগুলোকে অভুক্ত রাখতে পারে — আপনি `--memory` সেট না করলে এটাই ডিফল্ট।

### Union Filesystem (Layered Images)

Container image হলো read-only layer-এর স্তূপ। Dockerfile-এর প্রতিটা instruction একটা layer যোগ করে:

```
Layer 4: [RW]  Container filesystem (writable, ephemeral)
Layer 3: [RO]  COPY . /app  (your application code)
Layer 2: [RO]  RUN npm install  (node_modules)
Layer 1: [RO]  FROM node:20    (base OS + Node.js)
```

একটা container যখন কোনো file পড়ে, union filesystem layer-গুলো বেয়ে উপরে উঠতে থাকে যতক্ষণ না সেটা খুঁজে পায়। যখন container একটা file লেখে, লেখাটা Layer 4-এ যায় (copy-on-write)। একই image ব্যবহার করা সব container-এর মধ্যে read-only layer-গুলো শেয়ার হয় — `node:20` একবার pull করলে সেটার উপর ভিত্তি করা সব container-এর কাজ চলে।

```bash
# See the layers in an image
docker history node:20
# IMAGE         CREATED       CREATED BY                    SIZE
# <hash>        2 weeks ago   /bin/sh -c #(nop) CMD ["node…  0B
# <hash>        2 weeks ago   /bin/sh -c #(nop) ENTRYPOINT…  0B
# ...

docker inspect --format='{{json .RootFS.Layers}}' node:20 | jq
# ["sha256:abc...", "sha256:def...", ...]
```

## OCI Standard

Open Container Initiative (OCI) image ফরম্যাট আর runtime স্পেসিফিকেশন সংজ্ঞায়িত করে। যেকোনো OCI-compliant runtime যেকোনো OCI image চালাতে পারে:

- **Runtime:** `runc` (default), `containerd`, `crun`, `gVisor`, `Kata Containers`
- **Image registry:** Docker Hub, GitHub Container Registry, AWS ECR, self-hosted

OCI image বানানোর জন্য Docker সবচেয়ে প্রচলিত টুল, কিন্তু এটা বাধ্যতামূলক নয়। `podman`, `buildah`, `kaniko` সবাই OCI image বানায় যা সব জায়গায় কাজ করে।

## docker run-এ কী ঘটে

```bash
docker run -p 3000:3000 myapp:latest
```

1. Docker daemon লোকাল image cache চেক করে — না থাকলে registry থেকে pull করে
2. এই container instance-এর জন্য একটা নতুন writable layer (Layer 4) তৈরি করে
3. একটা নতুন network namespace তৈরি করে — container-কে IP অ্যাসাইন করে
4. একটা নতুন PID namespace তৈরি করে — container-এর main process PID 1 পায়
5. cgroup limit সেট করে (`--memory`/`--cpus` flag থেকে CPU/memory)
6. layered filesystem mount করে (union mount)
7. container-এর entrypoint process চালু করে
8. container-এর port 3000 → হোস্টের port 3000 (iptables দিয়ে NAT)

```bash
# Watch it happen
strace -e trace=clone,unshare docker run --rm alpine echo hi 2>&1 | head -20
# unshare(CLONE_NEWUSER|CLONE_NEWPID|CLONE_NEWNET|CLONE_NEWUTS|CLONE_NEWIPC|CLONE_NEWNS)
```

## Container vs Image

একটা **image** হলো একটা স্ট্যাটিক, read-only টেমপ্লেট। একটা **container** হলো একটা image-এর চলমান instance।

```bash
# Image: blueprint
docker images
# REPOSITORY   TAG      IMAGE ID       SIZE
# myapp        latest   abc123         245MB

# Container: running instance from that blueprint
docker ps
# CONTAINER ID   IMAGE    COMMAND         STATUS    PORTS
# def456         myapp    "node server"   Up 3m     0.0.0.0:3000->3000/tcp

# Multiple containers from the same image — they share the read-only layers
docker run -d -p 3001:3000 myapp:latest
docker run -d -p 3002:3000 myapp:latest
docker run -d -p 3003:3000 myapp:latest
# Three containers, one image — shared layer storage
```

## Container Lifecycle

```
Created → Running → Paused → Running → Stopped → Removed
             ↓
           Exit (process ends)
             ↓
          Stopped (filesystem preserved, not running)
             ↓
          Removed (filesystem gone)
```

```bash
# Full lifecycle
docker create --name myapp myapp:latest    # create without starting
docker start myapp                          # start
docker pause myapp                          # freeze (SIGSTOP to cgroup)
docker unpause myapp                        # resume
docker stop myapp                           # SIGTERM, then SIGKILL after 10s
docker rm myapp                             # remove filesystem

# Shortcut: run and remove on exit
docker run --rm myapp:latest node script.js
```

**Containers স্বভাবগতভাবেই ephemeral।** একটা container-এর ভেতরে লেখা যেকোনো data সেটা remove হলে হারিয়ে যায়। স্থায়ী data-র জন্য volume ব্যবহার করুন।

## Volume দিয়ে Data Persistence

```bash
# Named volume: managed by Docker, survives container removal
docker volume create pgdata
docker run -v pgdata:/var/lib/postgresql/data postgres:15

# Bind mount: host directory mounted into container
docker run -v $(pwd)/data:/app/data myapp

# tmpfs: in-memory, never written to disk
docker run --tmpfs /tmp myapp
```

database data, user upload, আর যা কিছু container restart-এর পরেও টিকে থাকতে হবে — তার জন্য volume-ই সঠিক পন্থা। Container filesystem হলো অ্যাপ্লিকেশন কোড আর রানটাইমের জন্য — data-র জন্য নয়।
