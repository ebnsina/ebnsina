---
title: "What Are Containers"
subtitle: "Namespaces, cgroups, and the union filesystem — what's actually happening under docker run."
chapter: 1
level: "beginner"
readingTime: "9 min"
topics: ["containers", "namespaces", "cgroups", "union filesystem", "OCI"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A shipping container: before containers, cargo was loaded loose — every ship and port needed different equipment, things got damaged in transit, and loading took days. The standard container made everything interoperable. You pack your application and its dependencies into a standard unit that runs the same everywhere — on your laptop, in CI, in production.

</Callout>

## Not a VM

Containers are not virtual machines. A VM emulates an entire computer — CPU, memory, disk, network — with a full OS kernel running inside. This isolation is strong but expensive: VMs take seconds to start and consume hundreds of MB just for the OS overhead.

A container shares the host kernel. It's an isolated process (or group of processes) on the host — with its own filesystem view, network stack, and resource limits — but no separate kernel. This makes containers:

- **Fast to start:** milliseconds, not seconds
- **Lightweight:** tens of MB overhead, not hundreds
- **Denser:** dozens of containers per host vs a handful of VMs

The trade-off: containers share the kernel, so a kernel exploit in one container can potentially affect others. VMs provide stronger security isolation. For multi-tenant environments with untrusted code, VMs (or gVisor/Kata Containers) are still appropriate.

## The Three Kernel Primitives

Containers are built on three Linux kernel features:

### Namespaces (Isolation)

Namespaces make a process think it's alone on the system by giving it its own view of specific resources:

| Namespace | Isolates |
|-----------|---------|
| `pid` | Process IDs — container sees its process as PID 1 |
| `net` | Network interfaces, routing tables, ports |
| `mnt` | Filesystem mount points |
| `uts` | Hostname and domain name |
| `ipc` | Message queues, semaphores, shared memory |
| `user` | User and group IDs |
| `cgroup` | Cgroup hierarchy view |

```bash
# See namespaces of a running container
docker inspect --format '{{.State.Pid}}' mycontainer
ls -la /proc/<pid>/ns/
# lrwxrwxrwx 1 root root 0 Jan 1 12:00 net -> net:[4026532008]
# lrwxrwxrwx 1 root root 0 Jan 1 12:00 pid -> pid:[4026532009]
# Different numbers = different namespaces = isolation
```

### cgroups (Resource Limits)

Control Groups limit how much CPU, memory, disk I/O, and network bandwidth a container can use:

```bash
# Docker uses cgroups under the hood
docker run --memory=512m --cpus=1.5 myapp

# What Docker actually creates:
cat /sys/fs/cgroup/memory/docker/<container-id>/memory.limit_in_bytes
# 536870912 (512 * 1024 * 1024)

cat /sys/fs/cgroup/cpu/docker/<container-id>/cpu.cfs_quota_us
# 150000 (1.5 cores * 100000)
```

Without cgroup limits, one container can consume all host memory and starve others — this is the default if you don't set `--memory`.

### Union Filesystem (Layered Images)

Container images are stacks of read-only layers. Each instruction in a Dockerfile adds a layer:

```
Layer 4: [RW]  Container filesystem (writable, ephemeral)
Layer 3: [RO]  COPY . /app  (your application code)
Layer 2: [RO]  RUN npm install  (node_modules)
Layer 1: [RO]  FROM node:20    (base OS + Node.js)
```

When a container reads a file, the union filesystem walks up the layers until it finds it. When a container writes a file, the write goes to Layer 4 (copy-on-write). The read-only layers are shared across all containers using the same image — pulling `node:20` once serves all containers based on it.

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

## The OCI Standard

The Open Container Initiative (OCI) defines the image format and runtime specification. Any OCI-compliant runtime can run any OCI image:

- **Runtimes:** `runc` (default), `containerd`, `crun`, `gVisor`, `Kata Containers`
- **Image registries:** Docker Hub, GitHub Container Registry, AWS ECR, self-hosted

Docker is the most common tool for building OCI images, but it's not required. `podman`, `buildah`, `kaniko` all produce OCI images that work anywhere.

## What Happens at docker run

```bash
docker run -p 3000:3000 myapp:latest
```

1. Docker daemon checks local image cache — pulls from registry if missing
2. Creates a new writable layer (Layer 4) for this container instance
3. Creates a new network namespace — assigns container IP
4. Creates a new PID namespace — container's main process gets PID 1
5. Sets up cgroup limits (CPU/memory from `--memory`/`--cpus` flags)
6. Mounts the layered filesystem (union mount)
7. Starts the container's entrypoint process
8. Port 3000 in the container → port 3000 on host (NAT via iptables)

```bash
# Watch it happen
strace -e trace=clone,unshare docker run --rm alpine echo hi 2>&1 | head -20
# unshare(CLONE_NEWUSER|CLONE_NEWPID|CLONE_NEWNET|CLONE_NEWUTS|CLONE_NEWIPC|CLONE_NEWNS)
```

## Container vs Image

An **image** is a static, read-only template. An **container** is a running instance of an image.

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

**Containers are ephemeral by design.** Any data written inside a container is lost when it's removed. For persistent data, use volumes.

## Data Persistence with Volumes

```bash
# Named volume: managed by Docker, survives container removal
docker volume create pgdata
docker run -v pgdata:/var/lib/postgresql/data postgres:15

# Bind mount: host directory mounted into container
docker run -v $(pwd)/data:/app/data myapp

# tmpfs: in-memory, never written to disk
docker run --tmpfs /tmp myapp
```

Volumes are the correct approach for database data, user uploads, and anything that must outlive a container restart. The container filesystem is for application code and runtime — not for data.

