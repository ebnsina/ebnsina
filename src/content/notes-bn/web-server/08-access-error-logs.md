---
title: 'Access & Error Logs'
subtitle: 'nginx log format কাস্টমাইজ করুন, প্রতিটি field-এর মানে বুঝুন, status বা duration দিয়ে request খুঁজুন, আর সঠিকভাবে access log আর error log-এর পার্থক্য করুন।'
chapter: 8
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['nginx', 'logs', 'access log', 'error log', 'log format']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## দুটি log, দুটি উদ্দেশ্য

nginx দুটি stream লেখে:

- **access log** — প্রতি HTTP request-এ একটি লাইন। কে, কী, কখন, status, size, duration। ডিফল্ট: `/var/log/nginx/access.log`।
- **error log** — অস্বাভাবিকতা। ব্যর্থ config reload, upstream connection failure, timeout, malformed request, denied request। ডিফল্ট: `/var/log/nginx/error.log`।

"সাইট কি কাজ করছে?" — এর বেশিরভাগ উত্তর আসে access log থেকে। "এটা ভাঙল কেন?" — এর বেশিরভাগ উত্তর আসে error log থেকে। কোথায় দেখতে হবে তা জানলে সময় বাঁচে।

<Callout type="info">

**বাস্তব জীবনের উপমা**

Access আর error log অনেকটা প্রতিটি ভিজিটরকে রেকর্ড করা security camera-র মতো — আপনি হয়তো লাইভ দেখেন না, কিন্তু যখন কিছু ভুল হয় আর ঘটনাগুলো পুনর্গঠন করতে হয় তখন এটা অমূল্য হয়ে ওঠে।

</Callout>

## ডিফল্ট access log format

```text
192.0.2.4 - - [04/May/2026:10:42:11 +0000] "GET /api/users HTTP/1.1" 200 1234 "https://example.com/" "Mozilla/5.0 ..."
```

Field-গুলো, space দিয়ে আলাদা (quoting সহ):

| Field                          | Variable           | মানে                                      |
| ------------------------------ | ------------------ | ----------------------------------------- |
| `192.0.2.4`                    | `$remote_addr`     | Client IP (বা সামনে proxy থাকলে proxy IP) |
| `-`                            | `$remote_user`     | Auth user (বিরল)                          |
| `[04/May/2026:10:42:11 +0000]` | `$time_local`      | Local timestamp                           |
| `"GET /api/users HTTP/1.1"`    | `$request`         | Request line                              |
| `200`                          | `$status`          | Response status                           |
| `1234`                         | `$body_bytes_sent` | Response body-র size bytes-এ              |
| `"https://example.com/"`       | `$http_referer`    | Referer header                            |
| `"Mozilla/5.0 ..."`            | `$http_user_agent` | User-Agent header                         |

এটি **combined** format — Apache-র সময় থেকে কার্যত স্ট্যান্ডার্ড। প্রতিটি log analyzer, GoAccess, AWStats, ELK, ইন্টারনেটের প্রতিটি grep pattern এর কাছাকাছি কিছু আশা করে।

## ডিফল্ট কেন যথেষ্ট নয়

combined format-এ আপনার যা লাগবে এমন কিছু জিনিস নেই:

- **Request duration** (`$request_time`) — এই request-টা মোট কতক্ষণ নিল?
- **Upstream response time** (`$upstream_response_time`) — backend কতক্ষণ নিল?
- **Backend pool member** (`$upstream_addr`) — কোন backend এটা সামলাল?
- **Upstream status** (`$upstream_status`) — backend কী ফেরত দিল (nginx যা ফেরত দিল তার বিপরীতে)?
- **Request ID** (`$request_id`) — nginx আর আপনার app-এর মধ্যে log correlate করার জন্য।
- proxy-র মধ্য দিয়ে **Real IP** — `$http_x_forwarded_for`।

একটি সমৃদ্ধ format ডিফাইন করুন:

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

এখন প্রতিটি লাইনে duration, backend status, আর request ID থাকে:

```text
192.0.2.4 - - [2026-05-04T10:42:11+00:00] "GET /api/users HTTP/1.1" 200 1234 "https://example.com/" "Mozilla/5.0" "10.0.0.5" rt=0.123 urt=0.115 us=200 ua=127.0.0.1:8080 rid=4f5d6e7a8b9c
```

`$time_local`-এর বদলে `$time_iso8601` parser আর grep window-র জন্য অনেক বেশি সুবিধাজনক।

## `$request_time` বনাম `$upstream_response_time` বোঝা

দুটি timing field, প্রায়ই গুলিয়ে ফেলা হয়:

- **`$request_time`** — এই request-এ nginx মোট যে সময় ব্যয় করেছে: request-এর প্রথম byte পাওয়া থেকে response-এর শেষ byte লেখা পর্যন্ত।
- **`$upstream_response_time`** — backend-এর সাথে কথা বলতে nginx যে সময় ব্যয় করেছে: backend-এ connect করা থেকে তার পূর্ণ response পাওয়া পর্যন্ত।

যদি `$request_time`, `$upstream_response_time`-এর চেয়ে অনেক বড় হয়, তাহলে সময়টা ব্যয় হয়েছে একটি slow client থেকে request পড়তে অথবা একটিকে response লিখতে। যদি এরা কাছাকাছি হয়, তাহলে backend ধীর ছিল।

## JSON log format — আধুনিক পছন্দ

log aggregator-এ পাঠানোর জন্য JSON parse করা সহজ:

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

`escape=json` অত্যন্ত জরুরি — এটি field value-র মধ্যে থাকা quote আর special character সঠিকভাবে escape করে যাতে ফলাফল JSON valid হয়।

Output:

```json
{"time":"2026-05-04T10:42:11+00:00","remote_addr":"192.0.2.4",...,"status":200,"request_time":0.123,...}
```

`jq` query তুচ্ছ হয়ে যায়:

```bash
# All slow requests
sudo tail -f /var/log/nginx/access.log | jq 'select(.request_time > 1)'

# Status 5xx in the last hour
sudo cat /var/log/nginx/access.log | jq 'select(.status >= 500)'

# Per-endpoint p99 (rough)
jq -s 'group_by(.request_uri) | map({uri: .[0].request_uri, p99: (sort_by(.request_time)[(length*0.99|floor)].request_time)})' /var/log/nginx/access.log
```

## Conditional logging — noise বাদ দেওয়া

Health check, asset request, আর authenticated keep-alive ping signal-কে ডুবিয়ে দিতে পারে:

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

`if=` হলো `access_log`-এর একটি feature। যখন variable-টা `0` বা খালি, লাইনটা বাদ পড়ে।

অথবা status অনুযায়ী বাদ দিন:

```nginx
map $status $log_4xx {
    ~^[45]   1;          # log 4xx and 5xx
    default  0;
}

access_log /var/log/nginx/errors.log main_ext if=$log_4xx;
access_log /var/log/nginx/access.log main_ext;
```

দুটি log file: একটায় সবকিছু, একটায় শুধু error। error file-টা ছোট আর grep-বান্ধব।

## logrotate দিয়ে rotate করা

বাক্সের বাইরেই, `/etc/logrotate.d/nginx`:

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

প্রতিদিন rotation, 14 দিন রাখা, gzipped। `postrotate` hook nginx-কে বলে তার log file আবার খুলতে (যাতে সেটা renamed file-এ লিখতে না থাকে) `nginx rotate` init script-এর মাধ্যমে (যা master-কে `USR1` পাঠায়)।

অপেক্ষা না করেই একটা rotation টেস্ট করুন:

```bash
sudo logrotate -fv /etc/logrotate.d/nginx
ls -la /var/log/nginx/
```

## error log

ভিন্ন file, ভিন্ন format, কিছু ভাঙলে অনেক বেশি জরুরি:

```text
2026/05/04 10:42:11 [error] 1234#1234: *5678 connect() failed (111: Connection refused) while connecting to upstream, client: 192.0.2.4, server: example.com, request: "GET /api/users HTTP/1.1", upstream: "http://127.0.0.1:8080/api/users", host: "example.com"
```

এভাবে পড়ুন:

- **Timestamp.**
- **Severity** — `[debug]`, `[info]`, `[notice]`, `[warn]`, `[error]`, `[crit]`, `[alert]`, `[emerg]`।
- **PID আর TID.**
- **Internal request ID** — `*5678`।
- **error message.**
- **Context** — client, server, request, upstream, host।

`nginx.conf`-এ severity কনফিগার করুন:

```nginx
error_log /var/log/nginx/error.log warn;
```

প্রতি server-এর জন্য আপনি একটি আলাদা error log রাখতে পারেন:

```nginx
server {
    server_name api.example.com;
    error_log /var/log/nginx/api.error.log warn;
    # ...
}
```

## সাধারণ error log entry — এদের মানে কী

- **`upstream timed out (110: Connection timed out)`** — backend সময়মতো সাড়া দেয়নি। `proxy_read_timeout` চেক করুন।
- **`connect() failed (111: Connection refused)`** — backend listen করছে না। আপনার app চালু আছে কিনা চেক করুন।
- **`upstream prematurely closed connection`** — backend ক্র্যাশ করেছে বা partial response দিয়েছে। backend-এর log চেক করুন।
- **`client intended to send too large body`** — request body `client_max_body_size` ছাড়িয়ে গেছে। ডিফল্ট 1MB।
- **`request rate exceeded`** — আপনার `limit_req` zone fire করেছে।
- **`SSL_do_handshake() failed`** — TLS negotiation ব্যর্থ হয়েছে। পুরনো client বা ভুল cert chain।
- **`worker_connections are not enough`** — আপনি per-worker connection limit-এ পৌঁছে গেছেন। `worker_connections` আর `worker_rlimit_nofile` বাড়ান।

## কোনো tool ছাড়াই access log query করা

শুধু `grep`, `awk`, আর `cut`:

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

log aggregator-এর কাছে যাওয়ার আগেই এই one-liner-গুলো "কী ঘটছে" ধরনের 80% প্রশ্নের উত্তর দেয়।

## GoAccess — একটি real-time terminal dashboard

```bash
sudo apt install -y goaccess
sudo goaccess /var/log/nginx/access.log -c
```

log format বেছে নিন (CCBS = Combined)। এটি একটি live dashboard তৈরি করে: top URL, top IP, status code, response size, OS/browser breakdown। কোনো setup নেই, কোনো JS নেই, কোনো infrastructure নেই — আপনার SSH session-এই চলে।

একটি public HTML report-এর জন্য:

```bash
sudo goaccess /var/log/nginx/access.log \
  --log-format=COMBINED \
  -o /var/www/example.com/stats.html
```

## host-এর বাইরে log পাঠানো

একটি single VPS তার নিজের log ধরে রাখে। box-এর সাথেই সেগুলো মরে যায়। real system-এর জন্য:

- **Vector / Fluent Bit / Promtail** — ছোট forwarder যা log file (বা journald) পড়ে আর একটি central destination-এ পাঠায় (Loki, Elasticsearch, S3, ClickHouse)।
- **rsyslog** TCP/TLS forwarding সহ — পুরনো কিন্তু rock-solid।
- **`journalctl -o json -f` একটি forwarder-এর মধ্য দিয়ে pipe করা** — যখন nginx file-এর বদলে journald-এ (stdout-এর মাধ্যমে) log করতে কনফিগার করা থাকে।

এই অধ্যায়ের জন্য নিয়ম হলো: _local log-কে ঠান্ডা মাথায় query করতে পারা_। একবার পারলে, সেগুলো export করা পাঁচ-লাইনের config।

## Application log — আপনার app থেকে কী log করবেন

nginx request-এর envelope log করে। আপনার application _content_ log করে — কোন business সিদ্ধান্ত নেওয়া হলো, কোন user কী করল, একটা 500 কেন হলো। এদের জোড়া লাগান:

- nginx আর app দুটোই একই `$request_id` log করে।
- App JSON (বা অন্য structured format) log করে।
- App log stdout-এ যায়; journald সেগুলো সংগ্রহ করে; আপনি `journalctl -u myapp` দিয়ে query করেন।

একটি সাধারণ correlated debug session:

```bash
# Find a slow request in nginx
sudo cat /var/log/nginx/access.log | jq 'select(.request_time > 5)'
# Note the request_id

# Pull app logs for that request
journalctl -u myapp --since "10 min ago" | grep "<request_id>"
```

## রিক্যাপ

- Access log প্রতিটি request রেকর্ড করে; error log অস্বাভাবিকতা রেকর্ড করে। দুটোরই ডিফল্ট `/var/log/nginx/`।
- ডিফল্ট format হলো "combined"। `$request_time`, `$upstream_response_time`, `$upstream_addr`, `$request_id` যোগ করুন।
- `escape=json` সহ JSON format হলো log aggregation-এর সবচেয়ে পরিষ্কার পথ।
- `access_log`-এ `if=` দিয়ে noisy endpoint বাদ দিন। সহজ grep-এর জন্য error আলাদা file-এ split করুন।
- logrotate দিয়ে rotate করুন; rotation-এর পর nginx-কে file descriptor আবার খুলতে বলুন।
- error log entry পড়ুন severity, message, আর context দিয়ে। বেশিরভাগ "সাইট ভেঙে গেছে" সমস্যা প্রথমে এখানেই দেখা যায়।
- cross-system debugging-এর জন্য shared `$request_id` দিয়ে nginx log আর app log জোড়া লাগান।

পরের অধ্যায়: edge-এ caching — কীভাবে nginx backend-কে ছুঁয়েও না দেখে RAM থেকে আপনার 80% request-এর উত্তর দিতে পারে।
