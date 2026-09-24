---
title: 'Production self-host'
subtitle: 'TLS সহ nginx-এর পেছনে, systemd-managed, observable, Redis-এর মাধ্যমে process জুড়ে scaled। GraphQL আর gRPC ট্র্যাকের মতোই একই operational shape — wire-এ আলাদা protocol।'
chapter: 10
level: 'advanced'
readingTime: '14 মিনিট'
topics: ['websockets', 'nginx', 'systemd', 'observability', 'scaling']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

চ্যাপ্টার 9-এ আপনার কাছে auth, presence, backpressure আর reconnection সহ একটা কাজ করা multi-process WebSocket service আছে। এই চ্যাপ্টার deploy-এর মধ্যে দিয়ে হাঁটে। Self-hosted, একটা VPS-এ, nginx TLS terminate করছে আর Redis event fan out করছে। শেষে, SSL Labs-এ একটা A+, Grafana-তে metric, আর একটা systemd unit যা আপনি `systemctl restart` করতে পারেন।

এটা GraphQL আর gRPC ট্র্যাকের production চ্যাপ্টারকে প্রতিফলিত করে। আপনি সেগুলোর একটা ship করে থাকলে, এর অনেকটাই review — HTTP/1.1 Upgrade traffic-এর জন্য adapted।

<Callout type="info">

**বাস্তব উদাহরণ**

Production-এ যাওয়া হলো একটা walkie-talkie prototype আর একটা commercial radio network-এর মধ্যে পার্থক্যের মতো — একই অন্তর্নিহিত ধারণা, কিন্তু reliability, coverage আর uptime-এর জন্য সম্পূর্ণ ভিন্ন operational standard।

</Callout>

## গল্পে বুঝি

ফাতিমা একটা কাস্টমার-সাপোর্ট কোম্পানি চালান, যার শাখা কর্ডোভা থেকে সমরকন্দ পর্যন্ত ছড়ানো। এখানে প্রতিটা কাস্টমারের সাথে একটা করে খোলা ফোন লাইন সবসময় জোড়া থাকে — দুই দিক থেকেই যখন খুশি কথা বলা যায়, লাইন কাটে না। সমস্যা হলো, একজন কাস্টমার আজ যে এজেন্টের সাথে তার ঝামেলা নিয়ে কথা বলছিল, কাল আবার ফোন করলে সেই একই এজেন্টের কাছেই যাওয়া দরকার — কারণ ওই এজেন্টই তার পুরো ইতিহাস জানে। তাই ফাতিমা সুইচবোর্ডকে নিয়ম বেঁধে দিলেন: এই কাস্টমারের লাইন সবসময় সেই একই এজেন্টের ডেস্কেই ফেরত পাঠাও, নতুন কাউকে নয়।

তারপর তিনি দেখলেন সামনের ফটকেই আসল প্যাঁচ। সাধারণ ফোন তো শুধু "হ্যালো, বলুন, রাখলাম" — কিন্তু এই "লাইনটা খোলা রাখো, কাটবে না" ধরনের বিশেষ অনুরোধ ফটকের অপারেটর যদি না বোঝে, সে লাইন কেটে দেয়। তাই ফাতিমা এমন অপারেটর বসালেন যে এই "লাইন খোলা রাখো" অনুরোধ চিনে ভেতরে যেতে দেয়। একই সাথে প্রতিটা শাখাকে বললেন — এক ডেস্ক একসাথে হাজারখানেকের বেশি খোলা লাইন ধরবে না, তাহলে এজেন্ট হাঁপিয়ে ওঠে। আর বন্ধের সময় এলে সিনার শাখা কখনো ঝপ করে সব লাইন কাটে না; এজেন্টরা চলতি কথাগুলো শেষ করেন, কাস্টমারদের পাশের ডেস্কে সরিয়ে দেন, তারপর ধীরে ধীরে ডেস্ক গোটানো হয়।

এই পুরো ব্যবস্থাটাই একটা production WebSocket deployment। কাস্টমারকে একই এজেন্টে ফেরত পাঠানোই **sticky session** (connection affinity) — load balancer একই client-কে বারবার একই backend process-এ বাঁধে। "লাইন খোলা রাখো" অনুরোধ চেনা অপারেটরটাই **Upgrade-aware reverse proxy** (nginx-এ `Upgrade`/`Connection` header pass করা), যা ছাড়া long-lived connection হয় না। এক ডেস্কের হাজারখানেক লাইনের সীমাই **connection limit** — প্রতি process-এর `LimitNOFILE` আর memory ceiling। আর বন্ধের সময় চলতি কথা শেষ করে ধীরে গোটানোই **graceful shutdown** — worker restart-এর আগে connection drain করে `1001 GoingAway` পাঠানো, সবাইকে একসাথে না কাটা। বাস্তবে Slack বা WhatsApp Web-এর মতো সার্ভিস ঠিক এভাবেই লক্ষ লক্ষ খোলা socket সামলায়।

## deploy shape

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

nginx TLS terminate করে আর N-টা local Go process-এর একটায় plain `ws://` হিসেবে reverse-proxy করে। প্রতিটা process connection ধরে রাখে, fanout-এর জন্য Redis-এর সাথে কথা বলে, আর persistent state-এর জন্য Postgres-এর সাথে।

## Linux limit

হাজার হাজার connection ধরে থাকা একটা WebSocket process-এর OS-কে সেটা অনুমতি দিতে হয়।

**File descriptor.** Default ulimit 1024 — অনেক কম। systemd unit:

```ini
LimitNOFILE=1048576
```

এটা soft আর hard দুটো limit-ই ~1M-এ তোলে। Sysctl-wide cap হলো `fs.file-max`, দরকার হলে সেটাও বাড়ান:

```ini
# /etc/sysctl.d/99-ws.conf
fs.file-max = 2000000
net.ipv4.tcp_max_syn_backlog = 8192
net.core.somaxconn = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
```

`sysctl --system` দিয়ে apply করুন। Reboot বা `sysctl -p` করলে limit টিকে থাকে।

**Process memory.** ~10K idle WebSocket connection-এর জন্য, ~500 MB–1 GB resident memory আশা করুন। বাস্তব traffic buffer overhead যোগ করে। একটা 4 GB VPS আরামসে 50K connection সহ একটা process host করে; একটা 8 GB instance OS আর Redis-এর জন্য headroom দেয়।

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

`@` এটাকে একটা template বানায়। চারটা instance শুরু করুন:

```bash
sudo systemctl enable --now ws-server@80 ws-server@81 ws-server@82 ws-server@83
```

`%i` `80`, `81` ইত্যাদি হয়ে যায়; `Environment=PORT=80%i` তাদের `8080`, `8081`, `8082`, `8083`-এ listen করায়।

`Restart=on-failure` process crash করলে ফিরিয়ে আনে। `RestartSec=5` restart-এর মধ্যে OS-কে একটা মুহূর্ত দেয় যাতে একটা permanent error-এ crash-loop না করেন।

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

গুরুত্বপূর্ণ line-গুলো পড়ুন।

**`map $http_upgrade $connection_upgrade`** — inbound `Upgrade` header-কে একটা `Connection` value-তে map করে। upgrade nginx-এর ভেতর দিয়ে বইতে দরকার।

**`proxy_set_header Upgrade $http_upgrade`** + **`proxy_set_header Connection $connection_upgrade`** — এগুলো ছাড়া, nginx request-কে একটা সাধারণ HTTP হিসেবে দেখে আর upgrade fail করে।

**`proxy_read_timeout 1h`** — default 60 সেকেন্ড, যা সেই connection kill করে যা এর চেয়ে কম ঘন ping করে। আপনার idle interval যা অনুমতি দেয় তাতে বাড়ান।

**`ip_hash`** optional। ব্যবহার করলে, একই IP reconnect-এ একই backend-এ যায়। যেকোনো local-only state-এর জন্য কাজে লাগে; চ্যাপ্টার 6-এর ডিজাইনের জন্য (Redis-এ state), অপ্রয়োজনীয়।

TLS snippet (`tls-strong.conf`) হলো **TLS & Certificates** ট্র্যাক থেকে — শুধু TLS 1.3, modern cipher, OCSP stapling, HSTS।

## Reload-without-disconnect — সীমা

WebSocket connection long-lived। একটা `nginx -s reload` worker process restart করে; existing connection পুরোনো worker-এ চলতে থাকে। নতুন connection নতুন worker-এ ল্যান্ড করে। শেষ connection বন্ধ হলে পুরোনো worker শেষমেশ exit করে।

এটা nginx পরিবর্তনের জন্য ঠিক আছে। **Backend rolling restart** ভিন্ন: `ws-server@80` restart করলে সেই worker-এর প্রতিটা connection ড্রপ হয়।

প্যাটার্ন হলো "drain and replace":

1. worker-এর health "draining"-এ set করুন (একটা flag যা LB দেখে)।
2. `{"type":"reconnect"}` পাঠান আর `1001 GoingAway` দিয়ে সব connection close করুন।
3. সংক্ষিপ্তভাবে অপেক্ষা করুন; client একটা আলাদা worker-এ reconnect করে।
4. worker restart করুন।

একটা সহজ সংস্করণ: nginx upstream থেকে একটা worker বের করুন, এটা restart করুন, ফিরিয়ে দিন। প্রতিটার জন্য পুনরাবৃত্তি করুন। restarted worker-এর client সাথে সাথে reconnect করে আর একটা এখনো-চলা worker-এ ল্যান্ড করে।

`nginx-plus` বা `consul-template`-এর মতো tool এটা automate করে। একটা ছোট deployment-এর জন্য, `systemctl` আর `nginx -s reload` দিয়ে scripting করা ঠিক আছে।

## Health endpoint

orchestrator-এর জন্য দুটো endpoint:

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

`readyToServe()` shutdown drain-এর সময়, Redis unreachable হলে ইত্যাদি false return করে। nginx upstream health check-কে `/readyz`-এর সাথে বাঁধুন (`nginx_http_healthcheck_module` দিয়ে বা externally poll করে)।

## Observability — একই stack

**Log:** stdout-এ structured JSON। `journalctl` দিয়ে captured, Loki-তে forwarded, Grafana-তে queried।

```go
logger.LogAttrs(ctx, slog.LevelInfo, "ws-connect",
    slog.String("user_id", userID),
    slog.String("ip", clientIP),
    slog.String("conn_id", connID),
)
```

প্রতি connect-এ এক line, প্রতি disconnect-এ এক, প্রতি significant event-এ এক। প্রতি message log করা এড়িয়ে চলুন — অনেক noisy।

**Metric:** Prometheus `/metrics` scrape করছে। অন্য কেউ যা দিতে পারে না সেই অংশগুলোর জন্য custom counter আর gauge:

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

Prometheus-এর built-in process metric-এর সাথে মিলিত, আপনি RPS, error rate, latency, saturation পান — SRE চ্যাপ্টারের golden signal-এ যত্ন নিতে শেখানো সব জিনিস।

**Trace:** publish→deliver path-এ OpenTelemetry span। process A-তে publish করা আর process B-তে একটা client-এ deliver করা একটা message দুটো span সহ একটা trace হওয়া উচিত। Redis pub/sub message-এর মধ্য দিয়ে trace context বহন করুন (বেশিরভাগ client আপনাকে এটা একটা Redis attribute হিসেবে বা message envelope-এ stamp করতে দেয়)।

## Scaling out

একটা box-এর জায়গা ফুরিয়ে গেলে, আরও box:

1. **Redis-কে একটা dedicated host-এ সরান।** Redis worker-এর সাথে co-locate করা ঠিক আছে যতক্ষণ না disk/CPU-তে contend করে।
2. **Redis cluster বা sharded pub/sub ব্যবহার করুন।** Pure pub/sub sharding থেকে উপকৃত হয় না; একটা Redis ছাড়িয়ে গেলে, channel shard করুন (যেমন shard A-তে `room:1*`, shard B-তে `room:2*`, room name দিয়ে hash করুন)।
3. Redis pub/sub আসল bottleneck হলে **NATS-এ switch করুন** (চ্যাপ্টার 6)।
4. **nginx-এর পেছনে আরও box যোগ করুন।** প্রতিটা নিজের worker fleet চালায়; nginx upstream সবগুলো তালিকাভুক্ত করে।

একটা single box-এ scale plateau সাধারণত:

- প্রতি process-এ ~50K idle connection; প্রতি 4-process box-এ ~250K।
- এর বাইরে HA আর capacity-র জন্য একাধিক box।

modest rate-এ messaging সহ বাস্তব service-এর জন্য, চারটা process সহ একটা box আরামসে হাজার হাজার user সামলায়।

## CDN আর edge

Cloudflare, Fastly, আর অন্য CDN WebSockets support করে — একটা দামে। তারা `wss://` proxy করবে আর DDoS scrubbing দেবে, কিন্তু max connection duration limit করে (সাধারণত কয়েক ঘণ্টা)। forced reconnect-এর জন্য পরিকল্পনা করুন।

কোনো CDN ছাড়া self-hosted-এর জন্য, আপনি ওই limit এড়ান কিন্তু DDoS shield হারান। একটা যুক্তিসঙ্গত মধ্যপন্থা: static + REST API-র জন্য একটা CDN, WebSocket-এর জন্য সরাসরি আপনার নিজের nginx। দুটো domain (`api.example.com` CDN-এর পেছনে REST-এর জন্য, `ws.example.com` সরাসরি WebSocket-এর জন্য) দুটোই পরিষ্কার রাখে।

## edge-এ rate limit

Production rate limiting layer:

1. **nginx `limit_req`** (চ্যাপ্টার 8) — upgrade time-এ অপব্যবহারের বিরুদ্ধে প্রথম প্রতিরক্ষা।
2. **Application-level per-connection limit** — প্রতি connection-এ message rate।
3. **Application-level per-user limit** — Redis-backed counter।
4. **Global circuit breaker** — Redis মারা গেলে, প্রতিটা message fail করার বদলে নতুন connection refuse করুন।

প্রতিটা layer একটা আলাদা আক্রমণ ধরে। একাধিক layer paranoia নয়; এগুলোই আসল internet-এ কীভাবে টিকে থাকবেন।

## Pre-launch checklist

একটা real domain point করার আগে:

- [ ] Let's Encrypt-এর মাধ্যমে TLS, SSL Labs-এ A+।
- [ ] upgrade-এ origin verification। শুধু real frontend allow-list।
- [ ] handshake-এ auth (cookie, ticket, বা token)।
- [ ] প্রতিটা layer-এ rate limit (nginx, per-connection, per-user)।
- [ ] প্রতি IP আর global connection cap।
- [ ] HTTP server-এ `ReadHeaderTimeout` set।
- [ ] systemd-এ `LimitNOFILE` বাড়ানো।
- [ ] sysctl tuning (`somaxconn`, `tcp_max_syn_backlog`)।
- [ ] Heartbeat: library-র মাধ্যমে protocol-level, latency-র জন্য application-level।
- [ ] Backpressure: bounded buffer, drop-on-full, disconnect-on-sustained।
- [ ] প্রতিটা `conn.Write`-এ write deadline।
- [ ] heartbeat interval-এর বেশি read deadline।
- [ ] systemd template-এর মাধ্যমে multi-process।
- [ ] `Upgrade` আর `Connection` header, long `proxy_read_timeout`, optional `ip_hash` সহ nginx।
- [ ] process জুড়ে fan-out-এর জন্য Redis pub/sub।
- [ ] TTL-backed expiry সহ presence।
- [ ] Graceful shutdown: drain hint, তারপর close 1001।
- [ ] journal/Loki-তে log; `/metrics`-এ metric Prometheus-এ; Tempo-তে trace।
- [ ] Health endpoint (`/healthz`, `/readyz`)।
- [ ] backoff আর jitter সহ client-এ reconnect logic।
- [ ] Resumption প্যাটার্ন documented (sequence ID বা last-event-ID)।

অর্ধেক unchecked হলে: এখনো নয়। দিনটা ব্যয় করুন। সুখবর: এটাই শেষ দিন।

## Cost reality

একটা real app-এর জন্য self-hosted WebSocket service:

- $10–20/month VPS (Hetzner, OVH) একটা chat-style service-এর জন্য হাজার হাজার user সামলায়।
- একই box-এ $5/month Postgres আর Redis, বা দরকার হলে split।
- Let's Encrypt-এর মাধ্যমে free TLS।
- Loki + Prometheus + Grafana-র মাধ্যমে free observability (এটাও self-hosted)।

Total cost of ownership small-to-medium scale-এ প্রতিটা managed service-কে হারায়। এটা চালানোর দক্ষতা নিজের খরচ বহুবার পুষিয়ে দেয়।

## Recap

- `Upgrade`/`Connection` header, long timeout, optional `ip_hash`, edge-এ TLS সহ nginx।
- systemd template unit একাধিক worker process চালায়; `LimitNOFILE` বাড়ানো।
- Linux sysctl: `somaxconn`, `tcp_max_syn_backlog`, বড় port range।
- worker জুড়ে fan-out-এর জন্য Redis (চ্যাপ্টার 6); TTL সহ presence (চ্যাপ্টার 7)।
- Health endpoint `/healthz` আর `/readyz`; nginx upstream `/readyz` health-check করে।
- zero-downtime restart-এর জন্য drain and replace।
- Observability: structured log, Prometheus metric (gauge, counter, histogram), OpenTelemetry trace।
- rate limiting আর connection cap-এর জন্য একাধিক defence layer।
- Scale plateau: ~50K connection/process; প্রতি box-এ একাধিক process; দরকার হলে একাধিক box।
- Pre-launch checklist নাহলে এটা কামড়ায়।

এটাই full Backend Engineering Path-এর WebSockets ট্র্যাক। path-এর পরের বিষয়: [Webhooks](/notes/webhooks) — যখন push অন্য দিকে যায়, _service_-এর মধ্যে, আর "deliver-or-die" semantics গুরুত্বপূর্ণ।
