---
title: "Sockets, Ports, and What's Listening"
subtitle: "Every network service is a socket. Every open port is a socket someone bound. The four tools that tell you exactly what your VPS is exposing."
chapter: 6
level: "intermediate"
readingTime: "11 min"
topics: ["sockets", "ports", "ss", "lsof", "netstat", "tcp"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Sockets and ports are like a post office with numbered windows — each service listens at its own window number, and the OS routes incoming mail to the right one.

</Callout>

## A socket is a file descriptor that talks to the network

When a process wants to send or receive data over a network, it asks the kernel for a **socket** — and the kernel hands back a file descriptor, just like opening a file. From there, the process can `read()` and `write()` to it like any other file. The kernel handles TCP, UDP, retransmits, congestion control, all of that.

Every network service on Earth boils down to:

1. Process calls `socket(AF_INET, SOCK_STREAM, 0)` — "give me a TCP/IP socket."
2. Process calls `bind(fd, "0.0.0.0:8080")` — "I want this socket to own port 8080."
3. Process calls `listen(fd, backlog)` — "I am ready to accept connections."
4. Loop: `accept(fd)` — block until someone connects, then return a *new* socket for that connection.

A "port" is a number from 1 to 65535. Ports below 1024 are **privileged** — only root or a process with `CAP_NET_BIND_SERVICE` can bind them. That is why nginx as root can listen on port 80, but your unprivileged Go binary cannot — unless you give it the capability or run it on port 8080 and put nginx in front.

## What is on my box right now?

The single most important command in this chapter:

```bash
ss -tlnp
```

Memorize it. It means:

- `t` — TCP only (use `-u` for UDP).
- `l` — listening sockets only (sockets accepting incoming connections).
- `n` — show numeric addresses and ports, do not try to resolve DNS or service names.
- `p` — show which process owns each socket (requires root for everything).

Output:

```text
$ sudo ss -tlnp
State    Recv-Q   Send-Q       Local Address:Port      Peer Address:Port  Process
LISTEN   0        511                0.0.0.0:80              0.0.0.0:*      users:(("nginx",pid=1234,fd=6))
LISTEN   0        511                0.0.0.0:443             0.0.0.0:*      users:(("nginx",pid=1234,fd=7))
LISTEN   0        128              127.0.0.1:5432            0.0.0.0:*      users:(("postgres",pid=987,fd=5))
LISTEN   0        4096                   *:22                   *:*         users:(("sshd",pid=750,fd=3))
LISTEN   0        511                0.0.0.0:8080            0.0.0.0:*      users:(("myapp",pid=1567,fd=4))
```

Read it like:

- nginx is listening on `0.0.0.0:80` and `0.0.0.0:443` — the public internet can reach those.
- postgres is on `127.0.0.1:5432` — only this machine can connect. Good. **Never** expose Postgres to the internet.
- sshd is on `*:22` (both IPv4 and IPv6) — your front door.
- myapp is on `0.0.0.0:8080` — public.

## 0.0.0.0 vs 127.0.0.1 vs ::

The address a socket binds to determines who can reach it.

| Bind address | Who can connect |
|---|---|
| `127.0.0.1` (or `localhost`) | Only this machine. Nothing on the network can reach it. |
| `0.0.0.0` | Any IPv4 address on any interface — including the public internet. |
| `::1` | Only this machine, over IPv6. |
| `::` | Any IPv6 address on any interface. |
| `192.168.1.10` (a specific IP) | Only connections that arrive on that exact interface/IP. |

A common mistake: a database "exposed to the internet" because it bound `0.0.0.0:5432` instead of `127.0.0.1:5432`. Even with strong passwords, you do not want random scanners running thousands of authentication attempts. Bind to localhost unless something across the network truly needs to reach it.

## Established connections

Drop the `-l` to see who is connected right now:

```bash
ss -tnp
```

Or count them:

```bash
ss -tn state established | wc -l
```

Filter by port:

```bash
ss -tn '( dport = :443 or sport = :443 )'
```

By peer address:

```bash
ss -tn dst 1.2.3.4
```

Everything `ss` does, you used to do with `netstat`. `netstat` still works (`netstat -tlnp`) but is deprecated and slower on busy hosts.

## lsof — when ss is not enough

`lsof` lists open files, and since sockets are files, it lists sockets too. It is verbose but flexible:

```bash
sudo lsof -i :8080                  # who has port 8080 open?
sudo lsof -i TCP                    # all TCP sockets
sudo lsof -i 4 -P                   # IPv4 only, no name resolution
sudo lsof -p 1234                   # all open files for PID 1234, including sockets
sudo lsof -u postgres               # everything postgres user has open
```

Use `lsof` when you are debugging "who is holding this file/port" and `ss` when you want a quick listening map.

## netstat (legacy but still useful)

```bash
netstat -tlnp                       # same idea as ss -tlnp
netstat -s                          # cumulative protocol stats
netstat -i                          # per-interface byte counters
netstat -rn                         # routing table
```

`netstat -s` is genuinely useful for diagnosing weird network problems — retransmits, accept queue overflows, dropped connections at the kernel level — that `ss` does not summarize as nicely.

## TCP states — what they mean

```bash
ss -tn
```

The `State` column tells you where each connection is in TCP's state machine. The ones that matter:

| State | Meaning |
|---|---|
| `LISTEN` | Server side, waiting for connections. |
| `SYN-SENT` | Client side, sent SYN, awaiting SYN-ACK. |
| `SYN-RECV` | Server, received SYN, sent SYN-ACK, awaiting ACK. |
| `ESTABLISHED` | Connection is open in both directions. Most of your sockets. |
| `FIN-WAIT-1` / `FIN-WAIT-2` | Local side is closing. |
| `CLOSE-WAIT` | Remote side closed; *your* app has not closed yet. **Bug indicator.** |
| `TIME-WAIT` | Connection closed; kernel holds the socket briefly to handle delayed packets. |

A few hundred `TIME-WAIT` is normal on a busy server. A million `CLOSE-WAIT` is your app failing to close sockets after the peer disconnects — a slow file descriptor leak.

## Listen backlog and accept queue overflow

Notice the `Send-Q` column in `ss -tln`:

```text
LISTEN   0        511        0.0.0.0:80
```

That `511` is the **listen backlog** — the maximum number of connections that have done the TCP handshake but your app has not yet `accept()`-ed. If your app is too slow to accept, the queue fills up and the kernel starts dropping new connections. You will see this with:

```bash
netstat -s | grep -i listen
# 1234 SYNs to LISTEN sockets dropped
```

If that number grows during load, your app cannot keep up with `accept()` — usually because event-loop concurrency is blocked or the worker pool is saturated.

## A practical audit — what is exposed?

Run this on a fresh-feeling VPS:

```bash
sudo ss -tlnp | awk '$4 !~ /^127\.|^\[::1\]/ {print}'
```

Translation: list listening TCP sockets whose local address is **not** localhost. That is your **public attack surface**. Read every line. If you do not recognize what is listening, find out before going to bed.

## Don't forget UDP

UDP services hide because they have no `LISTEN` state — there are no connections in UDP. List them with:

```bash
sudo ss -ulnp
```

Things you might see:

- `*:53` — DNS resolver (systemd-resolved or unbound).
- `*:67` / `*:68` — DHCP client.
- `*:123` — NTP.
- `*:5353` — mDNS (Avahi).

## Unix domain sockets

Not all sockets cross the network. **Unix domain sockets** are file-system paths used for local IPC — fast, no TCP overhead. nginx talking to PHP-FPM, your app talking to a sidecar, postgres on a local socket:

```bash
ss -xln
```

Output looks like:

```text
u_str LISTEN  0  4096  /run/postgresql/.s.PGSQL.5432  ...
u_str LISTEN  0  128   /run/dbus/system_bus_socket    ...
```

These are files in the filesystem; permissions on the socket file control who can connect. Postgres' default config trusts local socket connections from the OS user matching the database user. That is why `psql` works without a password from the `postgres` shell user but a TCP connection requires authentication.

## Putting it together — a 30-second port audit

Drop these three commands into your muscle memory:

```bash
sudo ss -tlnp                 # what TCP services are listening?
sudo ss -ulnp                 # what UDP services are listening?
sudo ss -tn state established # who is currently connected?
```

If you can run these three on any unfamiliar Linux box and explain every line, you understand its network surface.

## Recap

- A socket is a file descriptor. A listening socket is one bound to a port and waiting.
- Bind to `127.0.0.1` for local-only services. Never expose databases publicly.
- `ss -tlnp` lists listening TCP sockets and their owning processes. Memorize this.
- TCP states tell you the lifecycle. `CLOSE-WAIT` piling up means *your* app is leaking.
- The accept queue is finite — saturated apps drop SYNs, which `netstat -s` reveals.
- Unix domain sockets exist and are faster for local IPC. Permissions on the socket file gate access.

Next chapter: now that you know what is exposed, the firewall to lock it down.

