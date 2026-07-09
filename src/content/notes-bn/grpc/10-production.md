---
title: 'Production self-host'
subtitle: 'এমন load balancing যা HTTP/2-কে সম্মান করে, এমন observability যা আপনি আসলেই কাজে লাগান, framework-সমর্থিত health check, এবং একটা VPS-এ পূর্ণ systemd + nginx deploy।'
chapter: 10
level: 'advanced'
readingTime: '15 মিনিট'
topics: ['grpc', 'load balancing', 'observability', 'nginx', 'deployment']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

চ্যাপ্টার ৯ নাগাদ আপনার হাতে auth ও logging-এর interceptor সহ একটা কার্যকর, mTLS-secured gRPC service আছে। এই চ্যাপ্টার সেটাকে production-এ নিয়ে যায়। self-hosted, একটা VPS-এ, nginx-এর পেছনে, একটা dashboard-এ metrics সহ এবং এমন alert সহ যা service মরে গেলে কাউকে page করে।

আকৃতিটা GraphQL track-এর চ্যাপ্টার ১০-এর প্রতিফলন — একই operational discipline, ভিন্ন protocol। সেই track থেকে GraphQL service ইতিমধ্যে deploy করে থাকলে, এর অনেকটাই পরিচিত লাগবে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

production-এ gRPC চালানো হলো একটা গাড়ির dashboard-এর মতো — engine ঠিকঠাক চলে, কিন্তু কখন কিছু একটা ভুল হতে যাচ্ছে তা জানতে আপনার gauge দরকার।

</Callout>

## Load balancing — gRPC-র জন্য সঠিক পথ

চ্যাপ্টার ৩ কভার করেছে কেন naïve L4 load balancer gRPC-কে নষ্ট করে দেয়: এরা connection balance করে, কিন্তু multiplexing মানে একটা connection-ই পুরো traffic নিয়ে নেয়। এখানে তিনটা সঠিক আকৃতি, প্রতিটাই ভিন্ন ভিন্ন পরিস্থিতিতে উপযুক্ত।

### Client-side load balancing

gRPC client সব backend-এর সাথে connection খোলে এবং এদের জুড়ে stream-গুলোকে round-robin করে। Go client-এ বিল্ট-ইন।

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

`dns:///` prefix gRPC name resolver-কে বলে DNS ব্যবহার করতে (একাধিক A record ফেরত দেয়)। client প্রতিটার সাথে একটা connection খোলে, stream round-robin করে। DNS refresh-এ নতুন backend তুলে নেওয়া হয়।

আপনার trust boundary-র ভেতরে service-to-service-এর জন্য সেরা। client প্রতিটা backend সম্পর্কে জানে; path-এ কোনো proxy নেই।

### L7 (HTTP/2-aware) proxy

যখন caller আপনার trust boundary-র বাইরে অথবা আপনি routing-এর কেন্দ্রীয় নিয়ন্ত্রণ চান, তখন সামনে একটা proxy বসান। তিনটা জনপ্রিয় অপশন:

**Envoy** — সবচেয়ে শক্তিশালী। ব্যাপকভাবে ব্যবহৃত। চালানো heavyweight কিন্তু sophisticated routing-এর জন্য canonical পছন্দ।

**Linkerd** — service mesh, পরিশীলিত UX, ডিফল্টে mTLS-এর চারপাশে তৈরি। mesh-এ পুরোপুরি ঝাঁপ দিলে দারুণ।

**nginx 1.13+** — gRPC support আছে (`grpc_pass`)। Envoy-র মতো feature-rich নয় কিন্তু আপনি হয়তো এটা আগে থেকেই চালান।

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

`grpc_pass grpc://...` nginx-কে বলে gRPC হিসেবে forward করতে (upstream-এ HTTP/2)। upstream TLS হলে `grpcs://...`। nginx যথাযথ per-stream load balancing করে — একটা client connection থেকে আসা ভিন্ন ভিন্ন stream ভিন্ন ভিন্ন backend-এ যেতে পারে।

**TLS & Certificates** চ্যাপ্টারের snippet-গুলোর (`tls-strong.conf`) জন্য, সেগুলো এখানেও পুনরায় ব্যবহার করুন।

<Callout type="info">

**Mesh বনাম no mesh।** একটা service mesh (Linkerd, Istio, Cilium) আপনাকে এক প্যাকেজে mTLS, retry, observability, এবং traffic policy দেয়। অনেক service থাকলে এটা মূল্যবান। তিনটা box-এ পাঁচটা service-এর জন্য, সাদামাটা nginx + per-service mTLS সহজতর এবং অর্থপূর্ণভাবে খারাপ নয়। docs সুন্দর বলেই একটা mesh deploy করবেন না।

</Callout>

### DNS round-robin (শেষ উপায়)

একাধিক A record, client বেছে নেয়। শুধু তখনই ভালো যখন client HTTP/2-aware এবং পর্যায়ক্রমে reconnect করে। `dns:///` ব্যবহার করলে gRPC client-এর DNS resolver এটা আপনার জন্য করে দেয়।

## Health check

gRPC ecosystem-এ একটা standard health protocol আছে — `grpc.health.v1.Health` — যা load balancer, orchestrator, এবং probe কল করতে পারে।

server-এর দিকে, service register করুন:

```go
import (
    "google.golang.org/grpc/health"
    healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

healthSvc := health.NewServer()
healthpb.RegisterHealthServer(s, healthSvc)

healthSvc.SetServingStatus("user.v1.UserService", healthpb.HealthCheckResponse_SERVING)
```

এখন যে কেউ probe করতে পারে:

```bash
grpcurl -plaintext localhost:9000 grpc.health.v1.Health/Check
# {"status":"SERVING"}
```

shutdown-এর জন্য, আগে status `NOT_SERVING` সেট করুন, কয়েক সেকেন্ড অপেক্ষা করুন, তারপর exit করুন। load balancer পরিবর্তনটা দেখে এবং নতুন traffic পাঠানো বন্ধ করে; চলমান call-গুলো সম্পন্ন হয়।

### Liveness বনাম readiness

দুটো ভিন্ন signal:

- **Liveness** — আমি কি জীবিত? না হলে, আমাকে restart করো। process আটকে না গেলে সবসময় `SERVING` থাকা উচিত। ক্ষণস্থায়ী external dependency-তে liveness fail করবেন না (DB ৩০s ধরে unreachable) — restart কাজে দেবে না।
- **Readiness** — আমার কি traffic পাওয়া উচিত? না হলে, আমাকে LB থেকে সরিয়ে নাও। DB down থাকলে, cache ঠান্ডা থাকলে, graceful shutdown-এর সময় readiness fail করুন।

`Health` service দুটোই serve করতে পারে — এদের ভিন্ন service name দিন (`livez`, `readyz`) এবং প্রতিটা আলাদাভাবে probe করুন।

## Graceful shutdown

`SIGTERM`-এ `grpc.Server.GracefulStop()`-ই সঠিক পদক্ষেপ। এটা নতুন RPC প্রত্যাখ্যান করে কিন্তু চলমান call-গুলোকে শেষ হতে দেয়।

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

দুই-সেকেন্ডের sleep-টা drain করার আগে LB-কে readiness flip দেখতে দেওয়ার জন্য। এটা ছাড়া, আপনি LB-র সাথে race করেন এবং কিছু client "connection refused" দেখে।

## Observability

তিনটা স্তম্ভ: log, metrics, trace। প্রতিটাই চ্যাপ্টার ৭-এর logging interceptor আর চ্যাপ্টার ৮-এর tracing interceptor থেকে। production-এ:

**Log** — stdout-এ structured JSON। `journalctl` (systemd) দিয়ে captured, **Loki** (free, self-hosted)-তে forwarded, Grafana-তে queried। প্রতি RPC-তে একটা log line প্লাস error।

**Metrics** — `/metrics`-এ Prometheus। একটা Prometheus server দিয়ে scraped। Grafana-তে visualise করা।

```go
import "github.com/prometheus/client_golang/prometheus/promhttp"

go func() {
    http.Handle("/metrics", promhttp.Handler())
    log.Fatal(http.ListenAndServe(":9090", nil))
}()
```

চারটা golden signal (RPS, error rate, latency, saturation) `promprovider` interceptor (চ্যাপ্টার ৮) থেকে free পাওয়া যায়। প্রয়োজনমতো custom business metrics যোগ করুন (`users_created_total`, `posts_published_total`)।

**Trace** — OpenTelemetry SDK + `otelgrpc` interceptor। **Tempo** (বা Jaeger)-তে export করুন। service-জুড়ে end-to-end trace আপনাকে ঠিক কোথায় একটা slow call সময় কাটিয়েছে তা দেখতে দেয়।

পূর্ণ Loki + Prometheus + Tempo stack তিনটা container-এ চলে। একটা ছোট VPS deployment-এর জন্য এটা ঠিক আছে; একটা cluster-এর জন্য, একটা host আলাদা করে দিন। path-এর **Observability** চ্যাপ্টারে পূর্ণ setup আছে।

## Resource limit

কোনো limit ছাড়া একটা gRPC server হলো ঘটতে যাওয়া একটা denial-of-service।

**Max message size** (ডিফল্ট 4 MiB):

```go
s := grpc.NewServer(
    grpc.MaxRecvMsgSize(8<<20),  // 8 MiB
    grpc.MaxSendMsgSize(8<<20),
)
```

**প্রতি connection-এ max concurrent stream** (ডিফল্ট unlimited; সুরক্ষার জন্য tune করুন):

```go
s := grpc.NewServer(
    grpc.MaxConcurrentStreams(1000),
)
```

**Connection timeout** (চ্যাপ্টার ৩-এর keepalive):

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

**Per-RPC rate limiting** — caller identity (mTLS থেকে CN, বা auth context থেকে)-এর উপর keyed `golang.org/x/time/rate` সহ একটা interceptor। ব্যয়বহুল RPC-র জন্য per-method limit।

## Reflection — production-এ বন্ধ (বা gated)

চ্যাপ্টার ৪-এর `reflection.Register(s)` dev-এ সহায়ক। production-এ, এটা gate করুন:

```go
if os.Getenv("ENABLE_REFLECTION") == "1" {
    reflection.Register(s)
}
```

যেসব internal service-এ proto-ই published contract, সেখানে এটা চালু রাখা ঠিক আছে। যেসব public-facing service-এ আপনি information leakage সীমিত রাখতে চান, সেখানে বন্ধ।

## nginx-এর পেছনে — operational আকৃতি

বেশিরভাগ self-hosted deployment-এর জন্য, এটাই layout:

```
Internet
    ↓ (TLS, public cert)
  nginx :443
    ↓ (TLS, private mesh CA — or plaintext over a Unix socket)
  user-service :9000
    ↓
  Postgres :5432 (private network)
```

nginx public TLS terminate করে, local service-এ gRPC (TLS বা plaintext) হিসেবে forward করে। service অন্য internal service-গুলোতে mTLS করে। Postgres শুধু private network-এ।

সুবিধা: public cert manage করার একটা জায়গা, কেন্দ্রীয় logging access, একই domain-এ (ভিন্ন path-এ) gRPC এবং REST host করা যায়।

অসুবিধা: আরেকটা hop, আরেকটা moving piece। শুধু একটা service থাকলে, nginx এড়িয়ে TLS দিয়ে service সরাসরি expose করা ঠিক আছে।

### Unix socket variant

nginx → local gRPC-র জন্য, একটা Unix socket TCP loopback-এর চেয়ে দ্রুত:

```go
lis, err := net.Listen("unix", "/run/grpc/user.sock")
```

```nginx
upstream user_service {
    server unix:/run/grpc/user.sock;
}
```

TCP handshake পুরোপুরি এড়িয়ে যায়, কোনো port conflict নেই, file permission-ই access control হয়ে যায়। একটা single box-এ production Go service প্রায়ই এটা ব্যবহার করে।

## systemd unit

GraphQL চ্যাপ্টারের মতোই আকৃতি:

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

hardening directive-গুলো রাখার মতো — process exploit হলে এগুলো ক্ষতি সীমিত করে। `ProtectSystem=strict` filesystem-কে read-only করে দেয়, শুধু `/run/grpc` (যেখানে socket থাকে) ছাড়া।

## REST আর gRPC জোড়া লাগানো — gateway

আপনার gRPC service কল করতে browser বা external HTTP client-এর দরকার হলে, আপনার তিনটা অপশন আছে:

**1. grpc-gateway** — আপনার `.proto` থেকে একটা REST proxy generate করে (`google.api.http` annotation)। একটা binary gRPC আর REST দুটোই serve করে।

```proto
import "google/api/annotations.proto";

service UserService {
  rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = { get: "/v1/users/{id}" };
  }
}
```

generated gateway `GET /v1/users/42` → `GetUser{Id: 42}` অনুবাদ করে। JSON in, JSON out। যখন আপনি দুটো protocol-ই পরিষ্কারভাবে map করতে চান তখন সেরা।

**2. Connect** — Buf-এর। একটা unified protocol যা gRPC, gRPC-Web, এবং একটা Connect protocol সমর্থন করে যা HTTP/1.1 + JSON-friendly। একটা server, একাধিক wire format। ক্রমশ জনপ্রিয়।

**3. Twirp** — HTTP/1.1 + JSON বা protobuf-এর উপর একটা সহজতর RPC system, কোনো streaming নেই। ভিন্ন পরিবার কিন্তু streaming দরকার না হলে একটা বিকল্প হিসেবে জানার মতো।

বেশিরভাগ self-hosted service-এর জন্য, **Connect** হলো আধুনিক পছন্দ — browser client (gRPC-Web) সমর্থন করে, curl-friendly JSON সমর্থন করে, এবং native gRPC সমর্থন করে, সবই একটা binary থেকে।

## Pre-launch checklist

এতে একটা domain point করার আগে:

- [ ] service-to-service-এর জন্য mTLS configured; edge-এ public TLS।
- [ ] Reflection বন্ধ (বা auth-gated)।
- [ ] সব deadline inbound থেকে outbound call-এ প্রবাহিত হয়।
- [ ] Recovery interceptor সবচেয়ে বাইরে।
- [ ] Logging, metrics, tracing interceptor registered।
- [ ] আলাদা `livez`/`readyz` সহ Health service registered।
- [ ] readiness drain সহ SIGTERM-এ graceful shutdown।
- [ ] Max message size, max concurrent stream, keepalive policy সেট।
- [ ] ব্যয়বহুল RPC-তে rate limiting।
- [ ] `Restart=on-failure`, hardening directive সহ systemd unit।
- [ ] HTTP/2 enabled সহ nginx reverse-proxy বা direct TLS।
- [ ] Backup, migration runner, এবং একটা private network-এ Postgres।
- [ ] `/metrics` scrape করছে Prometheus; error rate, p99 latency, saturation-এর জন্য alert।
- [ ] প্রতি RPC-তে একটা log line Loki বা আপনার log aggregator-এ পৌঁছাচ্ছে।
- [ ] Tempo / Jaeger / Honeycomb-এ শেষ হওয়া একটা trace pipeline।

অর্ধেক box unchecked থাকলে, কোনো domain point করবেন না। internet আপনাকে traffic দেওয়ার ব্যাপারে ধৈর্যশীল আর বাকি সবকিছুর ব্যাপারে অধৈর্য।

## কখন একটা service mesh-এর দিকে হাত বাড়াবেন

যেসব signal-এ আপনার উচিত:

- ~10-এর বেশি service।
- mTLS rotation একটা ঝক্কি হয়ে উঠছে।
- আপনি কেন্দ্রীয়ভাবে canary deployment, circuit breaking, বা traffic mirroring চান।
- একাধিক team প্রতিটা একটা করে service মালিকানা করে।

যেসব signal-এ আপনার উচিত নয়:

- দুটো service আর একটা static client।
- একজন operator (আপনি)।
- এমন একটা budget যা operational জটিলতা সহ্য করে না।

একটা mesh একটা কাজের tool যা আপনার শুধু তখনই দরকার যখন আসলেই দরকার। Linkerd দিয়ে শুরু করা সবচেয়ে সহজ; Istio সবচেয়ে শক্তিশালী ও সবচেয়ে জটিল; eBPF-friendly host থাকলে Cilium সবচেয়ে performant।

## Recap

- gRPC-র HTTP/2-aware load balancing দরকার। trust-এর ভেতরে client-side LB, edge-এ L7 proxy।
- Health service standard — এটা register করুন, `livez` আর `readyz` আলাদাভাবে serve করুন।
- Graceful shutdown: readiness flip করুন, LB drain-এর জন্য sleep করুন, `GracefulStop`।
- Observability: structured log (Loki), Prometheus metrics, OpenTelemetry trace।
- message size, concurrent stream, keepalive, এবং rate limit সেট করুন। ডিফল্ট নিরাপদ নয়।
- সামনে nginx public TLS terminate করে; service internal mTLS সামলায়। দ্রুততম local hop-এর জন্য Unix socket।
- hardening directive সহ systemd unit। `Restart=on-failure`। log-এর জন্য journalctl।
- browser-এর জন্য: grpc-gateway, Connect, বা gRPC-Web। Connect হলো আধুনিক ডিফল্ট।
- Pre-launch checklist নয়তো এটা কামড় বসাবে। প্রয়োজনীয় স্কেল থাকলে তবেই service mesh।

এই হলো পূর্ণ Backend Engineering Path-এর gRPC track। path-এর পরবর্তী topic: [WebSockets and realtime](/notes/websockets) — যখন REST বা RPC কোনোটাই সঠিক আকৃতি নয় এবং সাদামাটা HTTP-র উপর bidirectional streaming-ই আপনার দরকার।
