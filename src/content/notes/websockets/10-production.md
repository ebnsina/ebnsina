---
title: "Production self-host"
subtitle: "Behind nginx with TLS, systemd-managed, observable, scaled across processes via Redis. Same operational shape as the GraphQL and gRPC tracks — different protocol on the wire."
chapter: 10
level: "advanced"
readingTime: "14 min"
topics: ["websockets", "nginx", "systemd", "observability", "scaling"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

By chapter 9 you have a working multi-process WebSocket service with auth, presence, backpressure, and reconnection. This chapter walks the deploy. Self-hosted, on a VPS, with nginx terminating TLS and Redis fanning out events. By the end, an A+ on SSL Labs, metrics on Grafana, and a systemd unit you can `systemctl restart`.

This mirrors the production chapters of the GraphQL and gRPC tracks. If you've shipped one of those, much of this is review — adapted for HTTP/1.1 Upgrade traffic.

<Callout type="info">

**Real-World Analogy**

Going to production is like the difference between a walkie-talkie prototype and a commercial radio network — same underlying idea, but completely different operational standards for reliability, coverage, and uptime.

</Callout>

## The deploy shape

```
Internet
    ↓ wss://example.com  (TLS)
  nginx :443
    ↓ ws://127.0.0.1:8080..N  (loopback HTTP/1.1, multiple processes)
  ws-server (×4)
    ↓
  Redis :6379  (pub/sub, presence)
    ↓
  Postgres :5432  (durable state, history)
```

nginx terminates TLS and reverse-proxies as plain `ws://` to one of N local Go processes. Each process holds connections, talks to Redis for fanout, and to Postgres for persistent state.

## Linux limits

A WebSocket process holding tens of thousands of connections needs the OS to allow it.

**File descriptors.** Default ulimit is 1024 — far too low. systemd unit:

```ini
LimitNOFILE=1048576
```

This raises both the soft and hard limits to ~1M. Sysctl-wide cap is `fs.file-max`, also bump if needed:

```ini
# /etc/sysctl.d/99-ws.conf
fs.file-max = 2000000
net.ipv4.tcp_max_syn_backlog = 8192
net.core.somaxconn = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
```

Apply with `sysctl --system`. Reboot or `sysctl -p` and the limits stick.

**Process memory.** For ~10K idle WebSocket connections, expect ~500 MB–1 GB resident memory. Real traffic adds buffer overhead. A 4 GB VPS comfortably hosts a process with 50K connections; an 8 GB instance gives headroom for OS and Redis.

## systemd unit

```ini
# /etc/systemd/system/ws-server@.service
[Unit]
Description=ws-server (instance %i)
After=network.target redis-server.service

[Service]
Type=simple
User=app
WorkingDirectory=/opt/ws-server
EnvironmentFile=/etc/ws-server/env
Environment=PORT=80%i
ExecStart=/opt/ws-server/bin/server
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# limits
LimitNOFILE=1048576

# hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
LimitCORE=0

[Install]
WantedBy=multi-user.target
```

The `@` makes it a template. Start four instances:

```bash
sudo systemctl enable --now ws-server@80 ws-server@81 ws-server@82 ws-server@83
```

`%i` becomes `80`, `81`, etc.; `Environment=PORT=80%i` makes them listen on `8080`, `8081`, `8082`, `8083`.

`Restart=on-failure` brings the process back if it crashes. `RestartSec=5` gives the OS a moment between restarts so you don't crash-loop on a permanent error.

## nginx config

```nginx
# /etc/nginx/conf.d/ws.conf

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

upstream ws_backend {
    server 127.0.0.1:8080;
    server 127.0.0.1:8081;
    server 127.0.0.1:8082;
    server 127.0.0.1:8083;

    keepalive 64;
    ip_hash;  # optional: stick a client to one process if you have local-only state
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    include /etc/nginx/snippets/tls-strong.conf;

    # WebSocket endpoint
    location /ws {
        proxy_pass http://ws_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    # SSE endpoint, if you have one
    location /events {
        proxy_pass http://ws_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 24h;
        add_header X-Accel-Buffering no;
    }

    # static / health
    location / { return 404; }
}
```

Read the critical lines.

**`map $http_upgrade $connection_upgrade`** — maps the inbound `Upgrade` header to a `Connection` value. Required for upgrades to flow through nginx.

**`proxy_set_header Upgrade $http_upgrade`** + **`proxy_set_header Connection $connection_upgrade`** — without these, nginx treats the request as a normal HTTP and the upgrade fails.

**`proxy_read_timeout 1h`** — default is 60 seconds, which kills connections that ping less often than that. Raise to whatever your idle interval allows.

**`ip_hash`** is optional. If you use it, the same IP hits the same backend on reconnect. Useful for any local-only state; for chapter 6's design (state in Redis), unnecessary.

The TLS snippet (`tls-strong.conf`) is from the **TLS & Certificates** track — TLS 1.3 only, modern ciphers, OCSP stapling, HSTS.

## Reload-without-disconnect — the limit

WebSocket connections are long-lived. A `nginx -s reload` restarts worker processes; existing connections continue on the old workers. New connections land on new workers. Eventually the old workers exit when the last connection closes.

This is fine for nginx changes. **Backend rolling restarts** are different: restarting `ws-server@80` drops every connection on that worker.

The pattern is "drain and replace":

1. Set the worker's health to "draining" (a flag the LB sees).
2. Send `{"type":"reconnect"}` and close all connections with `1001 GoingAway`.
3. Wait briefly; clients reconnect to a different worker.
4. Restart the worker.

A simple version: take one worker out of nginx upstream, restart it, put it back. Repeat for each. Clients on the restarted worker reconnect immediately and land on a still-running worker.

Tools like `nginx-plus` or `consul-template` automate this. For a small deployment, scripting it with `systemctl` and `nginx -s reload` is fine.

## Health endpoints

Two endpoints for the orchestrator:

```go
http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
    w.WriteHeader(200)
})

http.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
    if !readyToServe() {
        http.Error(w, "draining", 503)
        return
    }
    w.WriteHeader(200)
})
```

`readyToServe()` returns false during shutdown drain, when Redis is unreachable, etc. Tie nginx upstream health checks to `/readyz` (with the `nginx_http_healthcheck_module` or by polling externally).

## Observability — the same stack

**Logs:** structured JSON to stdout. Captured by `journalctl`, forwarded to Loki, queried in Grafana.

```go
logger.LogAttrs(ctx, slog.LevelInfo, "ws-connect",
    slog.String("user_id", userID),
    slog.String("ip", clientIP),
    slog.String("conn_id", connID),
)
```

One line per connect, one per disconnect, one per significant event. Avoid logging per message — too noisy.

**Metrics:** Prometheus scraping `/metrics`. Custom counters and gauges for the pieces nobody else can give you:

```go
var (
    activeConns = prometheus.NewGauge(prometheus.GaugeOpts{
        Name: "ws_active_connections",
        Help: "Currently open WebSocket connections.",
    })

    msgsIn = prometheus.NewCounter(prometheus.CounterOpts{
        Name: "ws_messages_in_total",
        Help: "Total inbound WebSocket messages.",
    })

    msgsOut = prometheus.NewCounter(prometheus.CounterOpts{
        Name: "ws_messages_out_total",
        Help: "Total outbound WebSocket messages.",
    })

    msgLatency = prometheus.NewHistogram(prometheus.HistogramOpts{
        Name:    "ws_publish_to_deliver_seconds",
        Help:    "Latency from publish to last subscriber delivery.",
        Buckets: prometheus.ExponentialBuckets(0.001, 2, 12),
    })

    drops = prometheus.NewCounter(prometheus.CounterOpts{
        Name: "ws_message_drops_total",
        Help: "Messages dropped due to slow consumers.",
    })
)
```

Combined with Prometheus's built-in process metrics, you get RPS, error rate, latency, saturation — all the things SRE chapter on golden signals taught you to care about.

**Traces:** OpenTelemetry spans on the publish→deliver path. A message published in process A and delivered to a client in process B should be one trace with both spans. Carry the trace context through Redis pub/sub messages (most clients let you stamp it as a Redis attribute or in the message envelope).

## Scaling out

When one box runs out of room, more boxes:

1. **Move Redis to a dedicated host.** Co-locating Redis with workers is fine until disk/CPU contends.
2. **Use Redis cluster or sharded pub/sub.** Pure pub/sub does not benefit from sharding; if you outgrow one Redis, shard channels (e.g. `room:1*` on shard A, `room:2*` on shard B, hash by room name).
3. **Switch to NATS** if Redis pub/sub is the actual bottleneck (chapter 6).
4. **Add more boxes behind nginx.** Each runs its own worker fleet; nginx upstream lists them all.

Scale plateau on a single box is typically:

- ~50K idle connections per process; ~250K per 4-process box.
- Multiple boxes for HA and capacity beyond that.

For real services with messaging at modest rates, one box with four processes handles tens of thousands of users comfortably.

## CDNs and edge

Cloudflare, Fastly, and other CDNs support WebSockets — at a price. They will proxy `wss://` and provide DDoS scrubbing, but they limit max connection duration (a few hours typically). Plan for forced reconnects.

For self-hosted with no CDN, you skip those limits but lose the DDoS shield. A reasonable middle ground: a CDN for static + REST API, your own nginx for WebSockets directly. Two domains (`api.example.com` for REST behind CDN, `ws.example.com` for WebSocket direct) keep both clean.

## Rate limits at the edge

Production rate limiting layers:

1. **nginx `limit_req`** (chapter 8) — first defence against abuse at upgrade time.
2. **Application-level per-connection limits** — message rate per connection.
3. **Application-level per-user limits** — Redis-backed counters.
4. **Global circuit breakers** — if Redis dies, refuse new connections rather than failing every message.

Each layer catches a different attack. Multiple layers are not paranoia; they are how you survive the actual internet.

## Pre-launch checklist

Before pointing a real domain:

- [ ] TLS via Let's Encrypt, A+ on SSL Labs.
- [ ] Origin verification on the upgrade. Allow-list real frontends only.
- [ ] Auth at handshake (cookie, ticket, or token).
- [ ] Rate limits at every layer (nginx, per-connection, per-user).
- [ ] Connection caps per IP and global.
- [ ] `ReadHeaderTimeout` set on the HTTP server.
- [ ] `LimitNOFILE` raised in systemd.
- [ ] sysctl tuning (`somaxconn`, `tcp_max_syn_backlog`).
- [ ] Heartbeats: protocol-level via library, application-level for latency.
- [ ] Backpressure: bounded buffer, drop-on-full, disconnect-on-sustained.
- [ ] Write deadlines on every `conn.Write`.
- [ ] Read deadlines exceeding heartbeat interval.
- [ ] Multi-process via systemd templates.
- [ ] nginx with `Upgrade` and `Connection` headers, long `proxy_read_timeout`, optional `ip_hash`.
- [ ] Redis pub/sub for fan-out across processes.
- [ ] Presence with TTL-backed expiry.
- [ ] Graceful shutdown: drain hint, then close 1001.
- [ ] Logs to journal/Loki; metrics on `/metrics` to Prometheus; traces to Tempo.
- [ ] Health endpoints (`/healthz`, `/readyz`).
- [ ] Reconnect logic in client with backoff and jitter.
- [ ] Resumption pattern documented (sequence IDs or last-event-ID).

If half are unchecked: not yet. Spend the day. The good news: it is the last day.

## Cost reality

Self-hosted WebSocket service for a real app:

- $10–20/month VPS (Hetzner, OVH) handles tens of thousands of users for a chat-style service.
- $5/month Postgres and Redis on the same box, or split when needed.
- Free TLS via Let's Encrypt.
- Free observability via Loki + Prometheus + Grafana (also self-hosted).

Total cost of ownership beats every managed service for the small-to-medium scale. The skill of running it pays for itself many times over.

## Recap

- nginx with `Upgrade`/`Connection` headers, long timeouts, optional `ip_hash`, TLS at the edge.
- systemd template units run multiple worker processes; `LimitNOFILE` raised.
- Linux sysctl: `somaxconn`, `tcp_max_syn_backlog`, big port range.
- Redis (chapter 6) for fan-out across workers; presence (chapter 7) with TTL.
- Health endpoints `/healthz` and `/readyz`; nginx upstream health-checks `/readyz`.
- Drain and replace for zero-downtime restarts.
- Observability: structured logs, Prometheus metrics (gauges, counters, histograms), OpenTelemetry traces.
- Multiple defence layers for rate limiting and connection caps.
- Scale plateau: ~50K connections/process; multiple processes per box; multiple boxes when you need them.
- Pre-launch checklist or it bites.

That is the full Backend Engineering Path's WebSockets track. Next topic in the path: [Webhooks](/notes/webhooks) — when push goes the other direction, between *services*, and "deliver-or-die" semantics matter.

