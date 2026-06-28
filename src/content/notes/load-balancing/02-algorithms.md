---
title: 'Load Balancing Algorithms'
subtitle: "Round-robin, least connections, IP hash, weighted routing — when each algorithm fits and what happens when backends aren't equal."
chapter: 2
level: 'beginner'
readingTime: '9 min'
topics: ['load balancing', 'round-robin', 'least connections', 'consistent hashing', 'weighted']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A host seating guests at restaurant tables: round-robin seats at the next available table in rotation. Least connections seats at the table with fewest people. IP hash always sends the same guest to the same section. Weighted routing sends more guests to the bigger tables. Same problem, different rules — the right one depends on whether your tables are equal, and whether seating the same guest together matters.

</Callout>

## Round Robin

Send each request to the next server in rotation. Simple, no state required.

```
Request 1 → server1
Request 2 → server2
Request 3 → server3
Request 4 → server1  (wraps)
```

**nginx:**

```nginx
upstream backend {
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
    server 10.0.0.12:3000;
}
```

Round robin is the nginx default — no directive needed.

**HAProxy:**

```
backend api_servers
    balance roundrobin
    server s1 10.0.0.10:3000 check
    server s2 10.0.0.11:3000 check
    server s3 10.0.0.12:3000 check
```

**When it works:** homogeneous servers with similar request cost. **When it fails:** if requests have wildly different processing times, a slow request blocks a server while others sit idle.

## Least Connections

Send to the server with the fewest active connections.

```
server1: 10 connections
server2: 4 connections   ← next request goes here
server3: 7 connections
```

**nginx:**

```nginx
upstream backend {
    least_conn;
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
    server 10.0.0.12:3000;
}
```

**HAProxy:**

```
backend api_servers
    balance leastconn
    server s1 10.0.0.10:3000 check
    server s2 10.0.0.11:3000 check
```

**When it works:** workloads with variable request duration — long-running requests (uploads, streaming, websockets). Naturally routes away from overloaded servers. **When round-robin is better:** short, uniform requests where connection tracking overhead isn't worth it.

## IP Hash (Source Affinity)

Hash the client IP to always route the same client to the same server.

```
client 1.2.3.4 → hash → always server2
client 5.6.7.8 → hash → always server1
```

**nginx:**

```nginx
upstream backend {
    ip_hash;
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
}
```

**HAProxy:** use `balance source`:

```
backend api_servers
    balance source
    server s1 10.0.0.10:3000 check
    server s2 10.0.0.11:3000 check
```

**When it works:** stateful applications where in-memory state is tied to a specific server (session data, WebSocket connections that can't be migrated). **The problem:** it's a crutch. If a server goes down, all clients that hashed to it lose their state. The right fix is to extract state to Redis and use any stateless algorithm.

Also: clients behind NAT appear as one IP, overloading one server.

## Weighted Round Robin

Some servers are more powerful. Send them proportionally more traffic.

**nginx:**

```nginx
upstream backend {
    server 10.0.0.10:3000 weight=5;   # handles 5x the traffic
    server 10.0.0.11:3000 weight=1;   # handles 1x
}
```

With these weights: 5 out of 6 requests go to `s1`, 1 out of 6 to `s2`.

**HAProxy:**

```
backend api_servers
    balance roundrobin
    server s1 10.0.0.10:3000 check weight 50
    server s2 10.0.0.11:3000 check weight 10
```

**Use cases:**

- Mixed instance types (c5.4xlarge + c5.xlarge together)
- Gradual traffic shifts (canary deployments — new server starts at weight=1, increases)
- Warming up a new server after cold start

## Random with Two Choices (Power of Two)

Pick 2 servers at random, send to the one with fewer connections. Better than pure random, nearly as good as global least-connections without the coordination overhead.

HAProxy supports this in newer versions:

```
backend api_servers
    balance random 2
```

For large, distributed load balancer fleets (like Nginx Plus or Envoy in service mesh), this is preferred over global least-connections because it doesn't require shared state between LB instances.

## Consistent Hashing

Hash the request on a stable key (URL, user ID) and route to the same backend consistently. Unlike IP hash, handles server additions/removals gracefully — only `1/n` requests reroute when a server is added.

**nginx Plus** (commercial):

```nginx
upstream backend {
    hash $request_uri consistent;
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
}
```

**Use case:** cache servers where you want the same URL to hit the same backend (maximizes cache hit rate). If backend 1 caches `/api/users/123`, consistent hashing ensures that URL always goes to backend 1.

## Algorithm Selection Guide

```
Is request duration uniform?
  Yes → Round robin (simple, effective)
  No  → Least connections

Do servers have different capacity?
  Yes → Weighted round robin or weighted least connections

Does the client need to reach the same server?
  No  → Use Redis/external state, round robin
  Yes (legacy app) → IP hash or cookie-based affinity

Is this a cache cluster?
  Yes → Consistent hashing

Is this a distributed LB fleet (many LB instances)?
  Yes → Power of two random choices
```

## Slow Start

New servers or servers recovering from failure shouldn't immediately receive full traffic — they may still be warming up (cold JVM, cache warming, connection pool filling).

**nginx Plus:**

```nginx
server 10.0.0.10:3000 slow_start=30s;
```

**HAProxy:** use `weight` manipulation:

```bash
# Start the server at weight 10, gradually increase via runtime API
echo "set server backend/s1 weight 10" | socat stdio /var/run/haproxy/admin.sock
# After 30s:
echo "set server backend/s1 weight 100" | socat stdio /var/run/haproxy/admin.sock
```

This prevents a "thundering herd" problem where a newly added server immediately gets 33% of traffic and falls over under the sudden load.
