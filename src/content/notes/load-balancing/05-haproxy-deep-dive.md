---
title: 'HAProxy in Depth'
subtitle: 'Frontend/backend config, ACLs, the stats page, runtime API, and the patterns that make HAProxy the go-to proxy for demanding deployments.'
chapter: 5
level: 'intermediate'
readingTime: '11 min'
topics: ['HAProxy', 'ACLs', 'stats', 'runtime API', 'rate limiting', 'canary']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

An air traffic control tower: it doesn't fly the planes, it directs them. It knows which runway is clear (backend capacity), which planes have priority (ACLs, weights), enforces rules (rate limits, ACLs), and keeps a live display of everything in the air (stats page). HAProxy is the ATC for your HTTP traffic.

</Callout>

## The Core Config Structure

HAProxy config has four sections:

```
global      — process-level settings (user, logging, max connections)
defaults    — defaults applied to frontends/backends that don't override them
frontend    — listens on a port, classifies and routes incoming connections
backend     — group of servers that handle requests
```

A minimal but production-ready starting point:

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

## ACLs (Access Control Lists)

ACLs match conditions against the request and allow branching logic:

```
acl <name> <criterion> <value>
```

Common criteria:

```
path_beg /api/          — URL begins with
path_end .jpg           — URL ends with
hdr(host) -i api.example.com   — Host header (case insensitive)
src 192.168.0.0/24     — source IP in CIDR
method POST            — HTTP method
status 503             — response status (for backend conditions)
```

**Routing by host:**

```
frontend https_in
    bind *:443 ssl crt /etc/haproxy/ssl/

    acl is_api   hdr(host) -i api.example.com
    acl is_admin hdr(host) -i admin.example.com

    use_backend api_servers   if is_api
    use_backend admin_servers if is_admin
    default_backend web_servers
```

**Routing by path:**

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

**Block by IP (maintenance/security):**

```
frontend https_in
    acl blocked_ip src 1.2.3.4 5.6.7.8
    http-request deny if blocked_ip

    acl internal src 10.0.0.0/8
    acl is_admin path_beg /admin/
    http-request deny if is_admin !internal
```

## Rate Limiting

HAProxy has built-in rate limiting via stick tables:

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

This is in-memory, per-HAProxy-instance. For distributed rate limiting across multiple HAProxy instances, use a dedicated store (Redis) or HAProxy Enterprise's peer tables.

## Canary Deployments

Route a percentage of traffic to a new backend:

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

Or route specific users (by cookie or header) for deterministic testing:

```
frontend https_in
    acl is_canary req.cook(canary) -m found
    acl is_beta_user hdr(X-Beta-User) -m found

    use_backend api_v2 if is_canary OR is_beta_user
    default_backend api_v1
```

Gradually increase `rand(10)` to `rand(5)` (20%), `rand(2)` (50%), then fully cut over by removing the condition.

## The Stats Page

HAProxy's built-in dashboard shows real-time state of all frontends, backends, and servers:

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

Visit `http://haproxy:8404/stats` — shows per-server request rates, error rates, queue depth, session counts, health check status.

**CSV export for monitoring:**

```bash
curl -s http://admin:supersecret@haproxy:8404/stats;csv | \
  awk -F, 'NR>1 {print $1, $2, $18, $19}' | \
  column -t
# Output: svname, backend, status, active_sessions
```

## Runtime API

The stats socket allows live config changes without reloading:

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

This is how deployment scripts handle server rotation without config reloads.

## Zero-Downtime Reloads

HAProxy reloads gracefully — new process picks up new config, old process finishes existing connections:

```bash
# Reload without dropping connections
haproxy -f /etc/haproxy/haproxy.cfg -p /var/run/haproxy.pid -sf $(cat /var/run/haproxy.pid)
# Or via systemd:
systemctl reload haproxy
```

The `-sf` flag (soft-stop-and-finish) tells the old process to finish its connections, then exit. No dropped connections.

## Logging

Enable detailed request logging:

```
global
    log 127.0.0.1:514 local0

defaults
    option httplog
    log-format "%ci:%cp [%t] %ft %b/%s %Tq/%Tw/%Tc/%Tr/%Tt %ST %B %tsc %ac/%fc/%bc/%sc/%rc %{+Q}r"
```

Key fields:

- `%ci` — client IP
- `%Tq/%Tw/%Tc/%Tr/%Tt` — time: queue/wait/connect/response/total (ms)
- `%ST` — HTTP status code
- `%B` — bytes sent
- `%{+Q}r` — full HTTP request line

Send to stdout in containers (for log aggregators):

```
global
    log stdout format raw local0
```

## Timeouts

The three critical timeouts and what they control:

```
timeout connect 5s    # How long HAProxy waits to connect to a backend
timeout client  30s   # How long an idle client connection is kept open
timeout server  30s   # How long HAProxy waits for a backend response
```

For long-running requests (file uploads, streaming):

```
backend api_servers
    timeout server 5m    # override default for this backend
```

For WebSockets:

```
backend ws_servers
    timeout tunnel 1h    # keeps tunnel alive for websocket connections
```

WebSocket connections don't follow the `client`/`server` timeout after upgrade — they use `tunnel`.
