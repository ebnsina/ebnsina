---
title: 'HAProxy in Depth'
subtitle: 'Frontend/backend config, ACL, stats page, runtime API, আর যেসব pattern HAProxy-কে চাহিদাসম্পন্ন deployment-এর জন্য প্রথম পছন্দের proxy বানায়।'
chapter: 5
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['HAProxy', 'ACLs', 'stats', 'runtime API', 'rate limiting', 'canary']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা air traffic control tower: এটা plane চালায় না, দিকনির্দেশ দেয়। এটা জানে কোন runway খালি (backend capacity), কোন plane-এর অগ্রাধিকার আছে (ACL, weight), নিয়ম প্রয়োগ করে (rate limit, ACL), আর আকাশে যা কিছু আছে তার একটা live display রাখে (stats page)। HAProxy আপনার HTTP traffic-এর জন্য সেই ATC।

</Callout>

## মূল Config Structure

HAProxy config-এর চারটা section আছে:

```
global      — process-level settings (user, logging, max connections)
defaults    — defaults applied to frontends/backends that don't override them
frontend    — listens on a port, classifies and routes incoming connections
backend     — group of servers that handle requests
```

একটা ন্যূনতম কিন্তু production-ready শুরুর বিন্দু:

```
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon
    maxconn 50000

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    option  forwardfor
    option  http-server-close
    timeout connect 5s
    timeout client  30s
    timeout server  30s
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 503 /etc/haproxy/errors/503.http

frontend http_in
    bind *:80
    redirect scheme https code 301 if !{ ssl_fc }

frontend https_in
    bind *:443 ssl crt /etc/haproxy/ssl/
    default_backend api_servers

backend api_servers
    balance leastconn
    option httpchk GET /health
    server s1 10.0.0.10:3000 check inter 10s fall 3 rise 2
    server s2 10.0.0.11:3000 check inter 10s fall 3 rise 2
```

## ACL (Access Control List)

ACL request-এর বিপরীতে condition match করে আর branching logic-এর অনুমতি দেয়:

```
acl <name> <criterion> <value>
```

সাধারণ criteria:

```
path_beg /api/          — URL begins with
path_end .jpg           — URL ends with
hdr(host) -i api.example.com   — Host header (case insensitive)
src 192.168.0.0/24     — source IP in CIDR
method POST            — HTTP method
status 503             — response status (for backend conditions)
```

**Host দিয়ে routing:**

```
frontend https_in
    bind *:443 ssl crt /etc/haproxy/ssl/

    acl is_api   hdr(host) -i api.example.com
    acl is_admin hdr(host) -i admin.example.com

    use_backend api_servers   if is_api
    use_backend admin_servers if is_admin
    default_backend web_servers
```

**Path দিয়ে routing:**

```
frontend https_in
    acl is_api    path_beg /api/
    acl is_static path_beg /static/
    acl is_ws     hdr(Upgrade) -i websocket

    use_backend api_servers    if is_api
    use_backend static_servers if is_static
    use_backend ws_servers     if is_ws
    default_backend web_servers
```

**IP দিয়ে block (maintenance/security):**

```
frontend https_in
    acl blocked_ip src 1.2.3.4 5.6.7.8
    http-request deny if blocked_ip

    acl internal src 10.0.0.0/8
    acl is_admin path_beg /admin/
    http-request deny if is_admin !internal
```

## Rate Limiting

HAProxy-তে stick table-এর মাধ্যমে built-in rate limiting আছে:

```
backend rate_limit_table
    stick-table type ip size 100k expire 60s store http_req_rate(10s),conn_cur

frontend https_in
    # Track requests per IP in the stick table
    http-request track-sc0 src table rate_limit_table

    # Deny if more than 100 requests in the last 10 seconds
    http-request deny deny_status 429 if { sc_http_req_rate(0) gt 100 }

    default_backend api_servers
```

এটা in-memory, per-HAProxy-instance। একাধিক HAProxy instance জুড়ে distributed rate limiting-এর জন্য, একটা dedicated store (Redis) বা HAProxy Enterprise-এর peer table ব্যবহার করুন।

## Canary Deployment

একটা নতুন backend-এ traffic-এর একটা শতাংশ route করুন:

```
backend api_v1
    server s1 10.0.0.10:3000 check

backend api_v2
    server s2 10.0.0.20:3000 check

frontend https_in
    # Route 10% to v2 using random selection
    use_backend api_v2 if { rand(10) eq 0 }
    default_backend api_v1
```

অথবা deterministic testing-এর জন্য নির্দিষ্ট user (cookie বা header দিয়ে) route করুন:

```
frontend https_in
    acl is_canary req.cook(canary) -m found
    acl is_beta_user hdr(X-Beta-User) -m found

    use_backend api_v2 if is_canary OR is_beta_user
    default_backend api_v1
```

ধীরে ধীরে `rand(10)` বাড়িয়ে `rand(5)` (20%), `rand(2)` (50%) করুন, তারপর condition-টা সরিয়ে পুরোপুরি cut over করুন।

## Stats Page

HAProxy-র built-in dashboard সব frontend, backend আর server-এর real-time state দেখায়:

```
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 5s
    stats auth admin:supersecret
    stats show-legends
    stats show-node
    # Optionally restrict to internal only:
    acl internal src 10.0.0.0/8
    http-request deny if !internal
```

`http://haproxy:8404/stats`-এ যান — per-server request rate, error rate, queue depth, session count, health check status দেখায়।

**Monitoring-এর জন্য CSV export:**

```bash
curl -s http://admin:supersecret@haproxy:8404/stats;csv | \
  awk -F, 'NR>1 {print $1, $2, $18, $19}' | \
  column -t
# Output: svname, backend, status, active_sessions
```

## Runtime API

stats socket reload ছাড়াই live config পরিবর্তনের অনুমতি দেয়:

```bash
# Show all backends and their status
echo "show servers state" | socat stdio /run/haproxy/admin.sock

# Take a server out of rotation (maintenance)
echo "set server api_servers/s1 state maint" | socat stdio /run/haproxy/admin.sock

# Put it back in ready
echo "set server api_servers/s1 state ready" | socat stdio /run/haproxy/admin.sock

# Drain: stop new connections, finish existing
echo "set server api_servers/s1 state drain" | socat stdio /run/haproxy/admin.sock

# Change weight without reload
echo "set server api_servers/s1 weight 50" | socat stdio /run/haproxy/admin.sock

# Add a new server at runtime
echo "add server api_servers/s3 10.0.0.30:3000" | socat stdio /run/haproxy/admin.sock
echo "set server api_servers/s3 state ready" | socat stdio /run/haproxy/admin.sock
```

এভাবেই deployment script config reload ছাড়াই server rotation সামলায়।

## Zero-Downtime Reload

HAProxy সুন্দরভাবে reload হয় — নতুন process নতুন config নেয়, পুরনো process বিদ্যমান connection শেষ করে:

```bash
# Reload without dropping connections
haproxy -f /etc/haproxy/haproxy.cfg -p /var/run/haproxy.pid -sf $(cat /var/run/haproxy.pid)
# Or via systemd:
systemctl reload haproxy
```

`-sf` flag (soft-stop-and-finish) পুরনো process-কে তার connection শেষ করে, তারপর বেরিয়ে যেতে বলে। কোনো connection drop হয় না।

## Logging

বিস্তারিত request logging enable করুন:

```
global
    log 127.0.0.1:514 local0

defaults
    option httplog
    log-format "%ci:%cp [%t] %ft %b/%s %Tq/%Tw/%Tc/%Tr/%Tt %ST %B %tsc %ac/%fc/%bc/%sc/%rc %{+Q}r"
```

গুরুত্বপূর্ণ field:

- `%ci` — client IP
- `%Tq/%Tw/%Tc/%Tr/%Tt` — time: queue/wait/connect/response/total (ms)
- `%ST` — HTTP status code
- `%B` — bytes sent
- `%{+Q}r` — full HTTP request line

container-এ stdout-এ পাঠান (log aggregator-এর জন্য):

```
global
    log stdout format raw local0
```

## Timeout

তিনটা গুরুত্বপূর্ণ timeout আর তারা কী নিয়ন্ত্রণ করে:

```
timeout connect 5s    # How long HAProxy waits to connect to a backend
timeout client  30s   # How long an idle client connection is kept open
timeout server  30s   # How long HAProxy waits for a backend response
```

দীর্ঘ চলা request-এর জন্য (file upload, streaming):

```
backend api_servers
    timeout server 5m    # override default for this backend
```

WebSocket-এর জন্য:

```
backend ws_servers
    timeout tunnel 1h    # keeps tunnel alive for websocket connections
```

WebSocket connection upgrade-এর পর `client`/`server` timeout মানে না — তারা `tunnel` ব্যবহার করে।
