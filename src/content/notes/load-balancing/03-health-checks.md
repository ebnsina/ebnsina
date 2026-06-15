---
title: "Health Checks"
subtitle: "Active vs passive detection, failure thresholds, graceful draining — keeping dead backends out of rotation."
chapter: 3
level: "beginner"
readingTime: "8 min"
topics: ["health checks", "HAProxy", "nginx", "active", "passive", "connection draining"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A hospital triage system: a nurse periodically checks each room to see if the patient is stable (active checks). But the nurse also notices immediately if a patient codes while being treated (passive detection). You need both — scheduled checks catch slow degradation, real-time observation catches sudden failures.

</Callout>

## Passive Health Checks

Passive checks detect failure by watching live request outcomes. If a backend returns errors or times out, the LB marks it down.

**nginx:**
```nginx
upstream backend {
    server 10.0.0.10:3000 max_fails=3 fail_timeout=30s;
    server 10.0.0.11:3000 max_fails=3 fail_timeout=30s;
}
```

- `max_fails=3` — mark server down after 3 failures within `fail_timeout`
- `fail_timeout=30s` — window for counting failures AND how long the server stays down before retry

**The limitation:** passive checks require real traffic to detect failure. A server that goes down between requests isn't detected until a user hits it and gets an error. The user's request fails.

## Active Health Checks

The LB sends synthetic requests to each backend on a schedule, independent of real traffic. Failed backends are removed before real requests reach them.

**nginx Plus** (commercial) active health check:
```nginx
upstream backend {
    zone backend 64k;
    server 10.0.0.10:3000;
    server 10.0.0.11:3000;
}

server {
    location / {
        proxy_pass http://notes;
        health_check interval=10s fails=3 passes=2 uri=/health;
    }
}
```

**HAProxy** (active checks built into open source):
```
backend api_servers
    option httpchk GET /health HTTP/1.1\r\nHost:\ api.internal

    server s1 10.0.0.10:3000 check inter 10s fall 3 rise 2
    server s2 10.0.0.11:3000 check inter 10s fall 3 rise 2
```

Parameters:
- `inter 10s` — check every 10 seconds
- `fall 3` — mark down after 3 consecutive failures
- `rise 2` — mark up after 2 consecutive successes (prevents flapping)

## The Health Endpoint

The backend must expose a `/health` endpoint the LB can call:

```typescript
// Express
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
```

A basic `/health` that always returns 200 only catches process crashes. A useful health check verifies the dependencies the server needs:

```typescript
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await redis.ping();
    res.status(200).json({ status: 'ok', db: 'ok', cache: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});
```

503 signals the LB to remove this server from rotation. The LB doesn't parse the JSON — it just looks at the HTTP status code.

**Be careful:** if the database goes down and all servers return 503, the LB removes all backends. That's usually correct (the app is broken) but plan for it — some teams split health into `liveness` (is the process alive?) and `readiness` (can it serve traffic?) and configure the LB to use readiness.

```typescript
// /health/live — always 200 while process is up
app.get('/health/live', (req, res) => res.sendStatus(200));

// /health/ready — checks dependencies
app.get('/health/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.sendStatus(200);
  } catch {
    res.sendStatus(503);
  }
});
```

Configure LB to use `/health/ready`.

## TCP Health Checks

For non-HTTP backends (databases, Redis, custom TCP):

**HAProxy TCP check:**
```
backend postgres
    mode tcp
    option tcp-check
    server db1 10.0.0.10:5432 check
    server db2 10.0.0.11:5432 check
```

HAProxy opens a TCP connection, checks it succeeds, and closes it. Doesn't send any data — just verifies the port is open.

For Redis, use a more specific check:
```
backend redis
    option tcp-check
    tcp-check connect
    tcp-check send PING\r\n
    tcp-check expect string +PONG
    server redis1 10.0.0.10:6379 check
```

## Connection Draining

When a backend needs to come down (deploy, scale-in), don't kill connections instantly. Drain them:

1. Mark the server as "draining" — stop routing new requests to it
2. Let existing connections finish
3. After a timeout, shut down

**HAProxy runtime API:**
```bash
# Mark server for drain (no new connections, finish existing)
echo "set server api_servers/s1 state drain" | \
  socat stdio /var/run/haproxy/admin.sock

# Wait for connections to finish (watch until 0)
watch -n1 "echo 'show servers conn api_servers' | socat stdio /var/run/haproxy/admin.sock"

# When 0: take fully down
echo "set server api_servers/s1 state maint" | \
  socat stdio /var/run/haproxy/admin.sock
```

**nginx graceful shutdown:**
```bash
# Reload nginx config (zero-downtime, existing connections finish)
nginx -s reload

# Or full graceful quit (waits for connections)
nginx -s quit
```

**Application-side draining with SIGTERM:**
```typescript
process.on('SIGTERM', async () => {
  server.close(async () => {    // stop accepting new connections
    await db.end();             // close DB pool after in-flight requests complete
    process.exit(0);
  });
  
  // Force exit after 30s if connections don't drain
  setTimeout(() => process.exit(1), 30_000);
});
```

Pair this with Kubernetes `terminationGracePeriodSeconds: 30` and a `preStop` sleep to give the LB time to stop routing before SIGTERM arrives:

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sleep", "5"]   # give LB time to deregister
terminationGracePeriodSeconds: 35
```

## Flapping Prevention

A server that oscillates between up and down (network hiccup, intermittent error) causes the LB to constantly change routing. The `rise` parameter prevents this:

```
server s1 10.0.0.10:3000 check fall 3 rise 2
```

- Down after **3 consecutive failures**
- Back up only after **2 consecutive successes**

This means a single successful check after failure won't immediately restore the server — it needs to prove stability.

## Health Check Overhead

Each active health check is a real HTTP request. With 10 backends, every-5s checks, and 3 LB instances: 10 × 12/min × 3 = 360 requests/min to `/health`. Usually negligible, but protect the endpoint from heavy checks:

```typescript
app.get('/health', async (req, res) => {
  // Don't run expensive checks on every health probe
  // Cache the result for a few seconds
  const cached = healthCache.get('status');
  if (cached) return res.status(cached.code).json(cached.body);
  
  // ... actual checks ...
});
```

Or use HAProxy's `fastinter` for the first failure and normal `inter` otherwise:
```
server s1 10.0.0.10:3000 check inter 30s fastinter 5s downinter 10s
```

- `inter 30s` — healthy: check every 30s
- `fastinter 5s` — recovery: check every 5s once server comes back up (confirm stability quickly)
- `downinter 10s` — down: check every 10s (detect when it recovers)

