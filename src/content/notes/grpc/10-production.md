---
title: "Production self-host"
subtitle: "Load balancing that respects HTTP/2, observability you actually use, health checks the framework supports, and the full systemd + nginx deploy on a VPS."
chapter: 10
level: "advanced"
readingTime: "15 min"
topics: ["grpc", "load balancing", "observability", "nginx", "deployment"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

By chapter 9 you have a working, mTLS-secured gRPC service with interceptors for auth and logging. This chapter takes it to production. Self-hosted, on a VPS, behind nginx, with metrics on a dashboard and alerts that page someone if it dies.

The shape mirrors the GraphQL track's chapter 10 — same operational discipline, different protocol. If you already deployed the GraphQL service from that track, much of this will feel familiar.

<Callout type="info">

**Real-World Analogy**

Running gRPC in production is like a car's dashboard — the engine runs fine, but you need gauges to know when something is about to go wrong.

</Callout>

## Load balancing — the right way for gRPC

Chapter 3 covered why naïve L4 load balancers ruin gRPC: they balance connections, but multiplexing means one connection takes all the traffic. Here are the three correct shapes, each appropriate in different settings.

### Client-side load balancing

The gRPC client opens connections to all backends and round-robins streams across them. Built into the Go client.

```go
import _ "google.golang.org/grpc/balancer/roundrobin"

const serviceConfig = `{
  "loadBalancingConfig": [{"round_robin": {}}]
}`

conn, err := grpc.NewClient(
    "dns:///user-service.internal:9000",
    grpc.WithTransportCredentials(creds),
    grpc.WithDefaultServiceConfig(serviceConfig),
)
```

The `dns:///` prefix tells the gRPC name resolver to use DNS (returning multiple A records). The client opens a connection to each, round-robins streams. New backends get picked up on DNS refresh.

Best for service-to-service inside your trust boundary. The client knows about every backend; no proxy in the path.

### L7 (HTTP/2-aware) proxy

When the caller is outside your trust boundary or you want central control of routing, put a proxy in front. Three popular options:

**Envoy** — most powerful. Used widely. Heavyweight to operate but the canonical choice for sophisticated routing.

**Linkerd** — service mesh, polished UX, built around mTLS by default. Great if you're going all-in on mesh.

**nginx 1.13+** — has gRPC support (`grpc_pass`). Not as feature-rich as Envoy but you may already run it.

```nginx
upstream user_service {
    server 10.0.1.10:9000;
    server 10.0.1.11:9000;
    server 10.0.1.12:9000;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    include /etc/nginx/snippets/tls-strong.conf;

    location / {
        grpc_pass grpc://user_service;
        grpc_set_header X-Real-IP $remote_addr;
        grpc_read_timeout 300s;
        grpc_send_timeout 300s;
    }
}
```

`grpc_pass grpc://...` tells nginx to forward as gRPC (HTTP/2 to the upstream). `grpcs://...` if upstream is TLS. nginx does proper per-stream load balancing — different streams from one client connection can land on different backends.

For the **TLS & Certificates** chapter's snippets (`tls-strong.conf`), reuse them here.

<Callout type="info">

**Mesh vs no mesh.** A service mesh (Linkerd, Istio, Cilium) gives you mTLS, retries, observability, and traffic policy in one package. Worth it once you have many services. For five services on three boxes, plain nginx + per-service mTLS is simpler and not meaningfully worse. Don't deploy a mesh because the docs are pretty.

</Callout>

### DNS round-robin (last resort)

Multiple A records, clients pick. Good only when clients are HTTP/2-aware and reconnect periodically. The gRPC client's DNS resolver does this for you when you use `dns:///`.

## Health checks

The gRPC ecosystem has a standard health protocol — `grpc.health.v1.Health` — that load balancers, orchestrators, and probes can call.

Server side, register the service:

```go
import (
    "google.golang.org/grpc/health"
    healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

healthSvc := health.NewServer()
healthpb.RegisterHealthServer(s, healthSvc)

healthSvc.SetServingStatus("user.v1.UserService", healthpb.HealthCheckResponse_SERVING)
```

Now anyone can probe:

```bash
grpcurl -plaintext localhost:9000 grpc.health.v1.Health/Check
# {"status":"SERVING"}
```

For shutdown, set status to `NOT_SERVING` first, wait a few seconds, then exit. Load balancers see the change and stop sending new traffic; in-flight calls complete.

### Liveness vs readiness

Two different signals:

- **Liveness** — am I alive? If no, restart me. Should always be `SERVING` unless the process is wedged. Don't fail liveness on transient external dependencies (DB unreachable for 30s) — a restart won't help.
- **Readiness** — should I get traffic? If no, take me out of the LB. Fail readiness when DB is down, when caches are cold, during graceful shutdown.

The `Health` service can serve both — give them different service names (`livez`, `readyz`) and probe each separately.

## Graceful shutdown

`grpc.Server.GracefulStop()` is the right move on `SIGTERM`. It refuses new RPCs but lets in-flight calls finish.

```go
sigs := make(chan os.Signal, 1)
signal.Notify(sigs, syscall.SIGTERM, syscall.SIGINT)

go func() {
    <-sigs
    log.Println("shutdown signal received")
    healthSvc.SetServingStatus("user.v1.UserService", healthpb.HealthCheckResponse_NOT_SERVING)
    time.Sleep(2 * time.Second) // let LBs notice
    s.GracefulStop()
}()

if err := s.Serve(lis); err != nil {
    log.Fatalf("serve: %v", err)
}
```

The two-second sleep is to let the LB observe the readiness flip before draining. Without it, you race the LB and some clients see "connection refused."

## Observability

Three pillars: logs, metrics, traces. Each from chapter 7's logging interceptor and chapter 8's tracing interceptor. In production:

**Logs** — structured JSON to stdout. Captured by `journalctl` (systemd), forwarded to **Loki** (free, self-hosted), queried in Grafana. One log line per RPC plus errors.

**Metrics** — Prometheus on `/metrics`. Scraped by a Prometheus server. Visualised in Grafana.

```go
import "github.com/prometheus/client_golang/prometheus/promhttp"

go func() {
    http.Handle("/metrics", promhttp.Handler())
    log.Fatal(http.ListenAndServe(":9090", nil))
}()
```

The four golden signals (RPS, error rate, latency, saturation) come for free from the `promprovider` interceptor (chapter 8). Add custom business metrics as needed (`users_created_total`, `posts_published_total`).

**Traces** — OpenTelemetry SDK + `otelgrpc` interceptors. Export to **Tempo** (or Jaeger). End-to-end traces across services let you see exactly where a slow call spent time.

The full Loki + Prometheus + Tempo stack runs in three containers. For a small VPS deployment that is fine; for a cluster, dedicate a host. The path's **Observability** chapter has the full setup.

## Resource limits

A gRPC server with no limits is a denial-of-service waiting to happen.

**Max message size** (default 4 MiB):

```go
s := grpc.NewServer(
    grpc.MaxRecvMsgSize(8<<20),  // 8 MiB
    grpc.MaxSendMsgSize(8<<20),
)
```

**Max concurrent streams per connection** (default unlimited; tune for protection):

```go
s := grpc.NewServer(
    grpc.MaxConcurrentStreams(1000),
)
```

**Connection timeouts** (chapter 3's keepalive):

```go
s := grpc.NewServer(
    grpc.KeepaliveParams(keepalive.ServerParameters{
        MaxConnectionIdle:     5 * time.Minute,
        MaxConnectionAge:      30 * time.Minute,
        MaxConnectionAgeGrace: 30 * time.Second,
        Time:                  20 * time.Second,
        Timeout:               5 * time.Second,
    }),
    grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
        MinTime:             10 * time.Second,
        PermitWithoutStream: true,
    }),
)
```

**Per-RPC rate limiting** — interceptor with `golang.org/x/time/rate` keyed on caller identity (CN from mTLS, or from auth context). Per-method limits for expensive RPCs.

## Reflection — off in production (or gated)

`reflection.Register(s)` from chapter 4 is helpful in dev. In production, gate it:

```go
if os.Getenv("ENABLE_REFLECTION") == "1" {
    reflection.Register(s)
}
```

For internal services where the proto is the published contract, leaving it on is fine. For public-facing services where you want to limit information leakage, off.

## Behind nginx — the operational shape

For most self-hosted deployments, this is the layout:

```
Internet
    ↓ (TLS, public cert)
  nginx :443
    ↓ (TLS, private mesh CA — or plaintext over a Unix socket)
  user-service :9000
    ↓
  Postgres :5432 (private network)
```

nginx terminates the public TLS, forwards as gRPC (TLS or plaintext) to the local service. The service does mTLS to other internal services. Postgres is on the private network only.

Pros: one place to manage public certs, central logging access, can host gRPC and REST on the same domain (different paths).

Cons: another hop, another moving piece. If you only have one service, skipping nginx and exposing the service directly with TLS is fine.

### Unix socket variant

For nginx → local gRPC, a Unix socket is faster than TCP loopback:

```go
lis, err := net.Listen("unix", "/run/grpc/user.sock")
```

```nginx
upstream user_service {
    server unix:/run/grpc/user.sock;
}
```

Skips TCP handshakes entirely, no port conflicts, file permissions become the access control. Production Go services on a single box often use this.

## systemd unit

Same shape as the GraphQL chapter:

```ini
# /etc/systemd/system/user-service.service
[Unit]
Description=user-service gRPC
After=network.target postgresql.service

[Service]
Type=simple
User=app
WorkingDirectory=/opt/user-service
EnvironmentFile=/etc/user-service/env
ExecStart=/opt/user-service/bin/server
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/run/grpc
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now user-service
journalctl -u user-service -f
```

The hardening directives are worth keeping — they limit damage if the process is exploited. `ProtectSystem=strict` makes the filesystem read-only except for `/run/grpc` (where the socket lives).

## Connecting REST and gRPC — the gateway

If you need browsers or external HTTP clients to call your gRPC service, you have three options:

**1. grpc-gateway** — generates a REST proxy from your `.proto` (`google.api.http` annotations). One binary serves both gRPC and REST.

```proto
import "google/api/annotations.proto";

service UserService {
  rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = { get: "/v1/users/{id}" };
  }
}
```

The generated gateway translates `GET /v1/users/42` → `GetUser{Id: 42}`. JSON in, JSON out. Best when you want both protocols cleanly mapped.

**2. Connect** — by Buf. A unified protocol that supports gRPC, gRPC-Web, and a Connect protocol that's HTTP/1.1 + JSON-friendly. One server, multiple wire formats. Increasingly popular.

**3. Twirp** — a simpler RPC system on HTTP/1.1 + JSON or protobuf, no streaming. Different family but worth knowing as an alternative when streaming is not needed.

For most self-hosted services, **Connect** is the modern choice — supports browser clients (gRPC-Web), supports curl-friendly JSON, and supports native gRPC, all from one binary.

## Pre-launch checklist

Before pointing a domain at it:

- [ ] mTLS configured for service-to-service; public TLS at the edge.
- [ ] Reflection off (or auth-gated).
- [ ] All deadlines flow from inbound to outbound calls.
- [ ] Recovery interceptor outermost.
- [ ] Logging, metrics, tracing interceptors registered.
- [ ] Health service registered with separate `livez`/`readyz`.
- [ ] Graceful shutdown on SIGTERM with readiness drain.
- [ ] Max message size, max concurrent streams, keepalive policy set.
- [ ] Rate limiting on expensive RPCs.
- [ ] systemd unit with `Restart=on-failure`, hardening directives.
- [ ] nginx reverse-proxy or direct TLS, with HTTP/2 enabled.
- [ ] Backups, migration runner, and Postgres on a private network.
- [ ] Prometheus scraping `/metrics`; alerts for error rate, p99 latency, saturation.
- [ ] One log line per RPC reaching Loki or your log aggregator.
- [ ] Trace pipeline ending in Tempo / Jaeger / Honeycomb.

If half the boxes are unchecked, do not point a domain. The internet is patient about giving you traffic and impatient about everything else.

## When to reach for a service mesh

Signals you should:

- More than ~10 services.
- mTLS rotation is becoming a chore.
- You want canary deployments, circuit breaking, or traffic mirroring centrally.
- Multiple teams each own a service.

Signals you should not:

- Two services and a static client.
- One operator (you).
- A budget that doesn't tolerate the operational complexity.

A mesh is a useful tool that you only need when you actually need it. Linkerd is the easiest to start with; Istio the most powerful and most complex; Cilium the most performant if you have eBPF-friendly hosts.

## Recap

- gRPC needs HTTP/2-aware load balancing. Client-side LB inside trust, L7 proxy at the edge.
- Health service is standard — register it, serve `livez` and `readyz` separately.
- Graceful shutdown: flip readiness, sleep for LB drain, `GracefulStop`.
- Observability: structured logs (Loki), Prometheus metrics, OpenTelemetry traces.
- Set message size, concurrent stream, keepalive, and rate limits. Defaults are not safe.
- nginx in front terminates public TLS; service handles internal mTLS. Unix socket for fastest local hop.
- systemd unit with hardening directives. `Restart=on-failure`. journalctl for logs.
- For browsers: grpc-gateway, Connect, or gRPC-Web. Connect is the modern default.
- Pre-launch checklist or it bites. Service mesh only when you have the scale to need it.

That is the full Backend Engineering Path's gRPC track. Next topic in the path: [WebSockets and realtime](/notes/websockets) — when neither REST nor RPC is the right shape and bidirectional streaming over plain HTTP is what you need.

