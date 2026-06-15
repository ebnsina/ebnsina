---
title: "Access & Error Logs"
subtitle: "Customize nginx log formats, understand what each field means, find requests by status or duration, and tell access logs apart from error logs the right way."
chapter: 8
level: "intermediate"
readingTime: "11 min"
topics: ["nginx", "logs", "access log", "error log", "log format"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Two logs, two purposes

nginx writes two streams:

- **access log** — one line per HTTP request. Who, what, when, status, size, duration. Default: `/var/log/nginx/access.log`.
- **error log** — anomalies. Failed config reloads, upstream connection failures, timeouts, malformed requests, denied requests. Default: `/var/log/nginx/error.log`.

Most "is the site working?" answers come from access logs. Most "why did this break?" answers come from error logs. Knowing where to look saves time.

<Callout type="info">

**Real-World Analogy**

Access and error logs are like a security camera recording every visitor — you may not watch it live, but it becomes invaluable when something goes wrong and you need to reconstruct events.

</Callout>

## The default access log format

```text
192.0.2.4 - - [04/May/2026:10:42:11 +0000] "GET /api/users HTTP/1.1" 200 1234 "https://example.com/" "Mozilla/5.0 ..."
```

Fields, separated by spaces (with quoting):

| Field | Variable | Meaning |
|---|---|---|
| `192.0.2.4` | `$remote_addr` | Client IP (or proxy IP if there is one in front) |
| `-` | `$remote_user` | Auth user (rare) |
| `[04/May/2026:10:42:11 +0000]` | `$time_local` | Local timestamp |
| `"GET /api/users HTTP/1.1"` | `$request` | Request line |
| `200` | `$status` | Response status |
| `1234` | `$body_bytes_sent` | Response body size in bytes |
| `"https://example.com/"` | `$http_referer` | Referer header |
| `"Mozilla/5.0 ..."` | `$http_user_agent` | User-Agent header |

This is the **combined** format — the de-facto standard since Apache. Every log analyzer, GoAccess, AWStats, ELK, every grep pattern on the internet expects something close to it.

## Why the default is not enough

The combined format is missing things you will want:

- **Request duration** (`$request_time`) — how long did this request take total?
- **Upstream response time** (`$upstream_response_time`) — how long did the backend take?
- **Backend pool member** (`$upstream_addr`) — which backend handled this?
- **Upstream status** (`$upstream_status`) — what did the backend return (vs what nginx returned)?
- **Request ID** (`$request_id`) — for correlating logs across nginx and your app.
- **Real IP** through proxies — `$http_x_forwarded_for`.

Define a richer format:

```nginx
http {
    log_format main_ext
        '$remote_addr - $remote_user [$time_iso8601] '
        '"$request" $status $body_bytes_sent '
        '"$http_referer" "$http_user_agent" '
        '"$http_x_forwarded_for" '
        'rt=$request_time urt=$upstream_response_time '
        'us=$upstream_status ua=$upstream_addr '
        'rid=$request_id';

    access_log /var/log/nginx/access.log main_ext;
}
```

Now every line has duration, backend status, and the request ID:

```text
192.0.2.4 - - [2026-05-04T10:42:11+00:00] "GET /api/users HTTP/1.1" 200 1234 "https://example.com/" "Mozilla/5.0" "10.0.0.5" rt=0.123 urt=0.115 us=200 ua=127.0.0.1:8080 rid=4f5d6e7a8b9c
```

`$time_iso8601` instead of `$time_local` is much friendlier for parsers and grep windows.

## Understanding `$request_time` vs `$upstream_response_time`

Two timing fields, often confused:

- **`$request_time`** — total time nginx spent on this request: from receiving the first byte of the request to writing the last byte of the response.
- **`$upstream_response_time`** — time nginx spent talking to the backend: from connecting to the backend to receiving its full response.

If `$request_time` is much larger than `$upstream_response_time`, the time was spent reading the request from a slow client or writing the response to one. If they are close, the backend was slow.

## JSON log format — the modern choice

For shipping to log aggregators, JSON is easier to parse:

```nginx
log_format json_main escape=json
    '{'
    '"time":"$time_iso8601",'
    '"remote_addr":"$remote_addr",'
    '"x_forwarded_for":"$http_x_forwarded_for",'
    '"request_method":"$request_method",'
    '"request_uri":"$request_uri",'
    '"status":$status,'
    '"body_bytes_sent":$body_bytes_sent,'
    '"request_time":$request_time,'
    '"upstream_response_time":"$upstream_response_time",'
    '"upstream_addr":"$upstream_addr",'
    '"upstream_status":"$upstream_status",'
    '"http_user_agent":"$http_user_agent",'
    '"http_referer":"$http_referer",'
    '"request_id":"$request_id"'
    '}';

access_log /var/log/nginx/access.log json_main;
```

`escape=json` is critical — it correctly escapes quotes and special characters in field values so the resulting JSON is valid.

Output:

```json
{"time":"2026-05-04T10:42:11+00:00","remote_addr":"192.0.2.4",...,"status":200,"request_time":0.123,...}
```

`jq` queries become trivial:

```bash
# All slow requests
sudo tail -f /var/log/nginx/access.log | jq 'select(.request_time > 1)'

# Status 5xx in the last hour
sudo cat /var/log/nginx/access.log | jq 'select(.status >= 500)'

# Per-endpoint p99 (rough)
jq -s 'group_by(.request_uri) | map({uri: .[0].request_uri, p99: (sort_by(.request_time)[(length*0.99|floor)].request_time)})' /var/log/nginx/access.log
```

## Conditional logging — skip noise

Health checks, asset requests, and authenticated keep-alive pings can drown the signal:

```nginx
map $request_uri $loggable {
    ~^/health$        0;
    ~^/metrics$       0;
    ~^/favicon.ico$   0;
    default           1;
}

server {
    access_log /var/log/nginx/access.log main_ext if=$loggable;
}
```

`if=` is a feature of `access_log`. When the variable is `0` or empty, the line is skipped.

Or skip per-status:

```nginx
map $status $log_4xx {
    ~^[45]   1;          # log 4xx and 5xx
    default  0;
}

access_log /var/log/nginx/errors.log main_ext if=$log_4xx;
access_log /var/log/nginx/access.log main_ext;
```

Two log files: one with everything, one with only errors. The errors file is short and grep-friendly.

## Rotating with logrotate

Out of the box, `/etc/logrotate.d/nginx`:

```text
/var/log/nginx/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 nginx adm
    sharedscripts
    prerotate
        if [ -d /etc/logrotate.d/httpd-prerotate ]; then
            run-parts /etc/logrotate.d/httpd-prerotate;
        fi
    endscript
    postrotate
        invoke-rc.d nginx rotate >/dev/null 2>&1
    endscript
}
```

Daily rotation, 14 days kept, gzipped. The `postrotate` hook tells nginx to reopen its log files (so it does not keep writing to the renamed file) via the `nginx rotate` init script (which sends `USR1` to the master).

Test a rotation without waiting:

```bash
sudo logrotate -fv /etc/logrotate.d/nginx
ls -la /var/log/nginx/
```

## The error log

Different file, different format, far more critical when something is broken:

```text
2026/05/04 10:42:11 [error] 1234#1234: *5678 connect() failed (111: Connection refused) while connecting to upstream, client: 192.0.2.4, server: example.com, request: "GET /api/users HTTP/1.1", upstream: "http://127.0.0.1:8080/api/users", host: "example.com"
```

Read it as:

- **Timestamp.**
- **Severity** — `[debug]`, `[info]`, `[notice]`, `[warn]`, `[error]`, `[crit]`, `[alert]`, `[emerg]`.
- **PID and TID.**
- **Internal request ID** — `*5678`.
- **The error message.**
- **Context** — client, server, request, upstream, host.

Configure severity in `nginx.conf`:

```nginx
error_log /var/log/nginx/error.log warn;
```

Per server, you can have a separate error log:

```nginx
server {
    server_name api.example.com;
    error_log /var/log/nginx/api.error.log warn;
    # ...
}
```

## Common error log entries — what they mean

- **`upstream timed out (110: Connection timed out)`** — backend did not respond in time. Check `proxy_read_timeout`.
- **`connect() failed (111: Connection refused)`** — backend is not listening. Check that your app is up.
- **`upstream prematurely closed connection`** — backend crashed or returned partial response. Check the backend's logs.
- **`client intended to send too large body`** — request body exceeded `client_max_body_size`. Default is 1MB.
- **`request rate exceeded`** — your `limit_req` zone fired.
- **`SSL_do_handshake() failed`** — TLS negotiation failed. Old client or wrong cert chain.
- **`worker_connections are not enough`** — you hit the per-worker connection limit. Raise `worker_connections` and `worker_rlimit_nofile`.

## Querying access logs without a tool

Just `grep`, `awk`, and `cut`:

```bash
# Top 10 IPs by request count today
sudo grep "$(date +%d/%b/%Y)" /var/log/nginx/access.log \
  | awk '{print $1}' | sort | uniq -c | sort -rn | head

# Top 10 requested paths
sudo awk '{print $7}' /var/log/nginx/access.log \
  | sort | uniq -c | sort -rn | head

# All 5xx responses today
sudo awk '$9 ~ /^5/' /var/log/nginx/access.log

# Slow requests (rt > 1 second) — assuming the rt= format above
sudo grep -oE 'rt=[0-9]+\.[0-9]+' /var/log/nginx/access.log \
  | awk -F= '$2 > 1 {print}'

# Average response time per endpoint
sudo awk '{print $7, $11}' /var/log/nginx/access.log | sort \
  | awk '{a[$1] += $2; c[$1]++} END { for (u in a) printf "%s %.3f\n", u, a[u]/c[u] }' \
  | sort -k2 -rn | head
```

These one-liners answer 80% of "what is happening" questions before you reach for a log aggregator.

## GoAccess — a real-time terminal dashboard

```bash
sudo apt install -y goaccess
sudo goaccess /var/log/nginx/access.log -c
```

Pick the log format (CCBS = Combined). It builds a live dashboard: top URLs, top IPs, status codes, response sizes, OS/browser breakdown. No setup, no JS, no infrastructure — runs in your SSH session.

For a public HTML report:

```bash
sudo goaccess /var/log/nginx/access.log \
  --log-format=COMBINED \
  -o /var/www/example.com/stats.html
```

## Shipping logs off-host

A single VPS holds its own logs. They die with the box. For real systems:

- **Vector / Fluent Bit / Promtail** — small forwarders that read log files (or journald) and ship to a central destination (Loki, Elasticsearch, S3, ClickHouse).
- **rsyslog** with TCP/TLS forwarding — older but rock-solid.
- **`journalctl -o json -f` piped through a forwarder** — when nginx is configured to log to journald (via stdout) instead of files.

For this chapter, the rule is: *be able to query the local logs cold*. Once you can, exporting them is a five-line config.

## Application logs — what to log from your app

nginx logs the request envelope. Your application logs the *content* — what business decision was made, which user did what, why a 500 happened. Pair them:

- Both nginx and the app log the same `$request_id`.
- App logs JSON (or another structured format).
- App logs go to stdout; journald collects them; you query with `journalctl -u myapp`.

A typical correlated debug session:

```bash
# Find a slow request in nginx
sudo cat /var/log/nginx/access.log | jq 'select(.request_time > 5)'
# Note the request_id

# Pull app logs for that request
journalctl -u myapp --since "10 min ago" | grep "<request_id>"
```

## Recap

- Access logs record every request; error logs record anomalies. Both default to `/var/log/nginx/`.
- Default format is "combined." Add `$request_time`, `$upstream_response_time`, `$upstream_addr`, `$request_id`.
- JSON format with `escape=json` is the cleanest path to log aggregation.
- Skip noisy endpoints with `if=` on `access_log`. Split errors to a second file for easy grepping.
- Rotate via logrotate; tell nginx to reopen file descriptors after rotation.
- Read error log entries by severity, message, and context. Most "site is broken" problems show up here first.
- Pair nginx logs and app logs via shared `$request_id` for cross-system debugging.

Next chapter: caching at the edge — how nginx can answer 80% of your requests from RAM without ever touching the backend.

