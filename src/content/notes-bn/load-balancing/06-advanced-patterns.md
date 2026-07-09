---
title: 'Advanced Load Balancing Pattern'
subtitle: 'Blue-green deployment, circuit breaker, global load balancing, আর anycast — যেসব deployment ভুল হওয়া চলে না তার pattern।'
chapter: 6
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['blue-green', 'canary', 'circuit breaker', 'global load balancing', 'anycast', 'GeoDNS']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা রেল ট্র্যাক switchover: আপনি track বদলাতে ট্রেন থামান না — আপনি একটা সমান্তরাল track বানান, সেটা test করেন, তারপর সঙ্গে সঙ্গে switch flip করেন। Blue-green deployment ঠিক এই কাজটাই করে: একটা user request hit করার আগেই নতুন version চলছে আর প্রস্তুত। switch তাৎক্ষণিক; rollback মানে শুধু এটা আবার ফিরিয়ে দেওয়া।

</Callout>

## Blue-Green Deployment

Blue live। Green নতুন version। Traffic atomically switch হয়।

**Runtime API দিয়ে HAProxy blue-green:**

```bash
#!/bin/bash
# deploy-green.sh
HAPROXY_SOCK="/run/haproxy/admin.sock"

# 1. Deploy new version to green servers (separate process)
# 2. Add green servers to a "staging" backend, verify health
# 3. When verified, flip traffic:

haproxy_cmd() {
    echo "$1" | socat stdio $HAPROXY_SOCK
}

# Drain blue servers
haproxy_cmd "set server api_blue/s1 state drain"
haproxy_cmd "set server api_blue/s2 state drain"

# Activate green servers
haproxy_cmd "set server api_green/s1 state ready"
haproxy_cmd "set server api_green/s2 state ready"

echo "Traffic shifted to green"
```

দুটো backend নিয়ে config:

```
backend api_blue
    server s1 10.0.0.10:3000 check
    server s2 10.0.0.11:3000 check

backend api_green
    server s1 10.0.0.20:3000 check
    server s2 10.0.0.21:3000 check

frontend https_in
    # Default to blue; switch by changing state via runtime API
    use_backend api_green if { nbsrv(api_green) ge 1 } { nbsrv(api_blue) eq 0 }
    default_backend api_blue
```

`nbsrv(api_blue) eq 0` condition-এর মানে "blue-তে কোনো active server না থাকলে green ব্যবহার করো" — সব blue server drain হলে স্বাভাবিকভাবে green-এ fallback।

## LB-তে Circuit Breaking

HAProxy বারবার failure শনাক্ত করে সাময়িকভাবে একটা backend সরাতে পারে:

```
backend api_servers
    option httpchk GET /health

    # After 3 failed checks, server marked down
    server s1 10.0.0.10:3000 check fall 3 rise 2 inter 5s
    server s2 10.0.0.11:3000 check fall 3 rise 2 inter 5s

    # If all servers are down, return a custom error instead of 502
    errorfile 503 /etc/haproxy/errors/maintenance.http
```

application-level circuit breaking-এর জন্য (যেমন downstream service error), application layer-এ implement করুন (Opossum, Resilience4j) — HAProxy শুধু upstream HTTP response দেখে।

## Slow Backend Detection

ধীর server-দের deprioritize করতে HAProxy-র `timeout` tuning আর server weight ব্যবহার করুন:

```bash
# Script to watch response times and lower weight for slow servers
#!/bin/bash
SOCK="/run/haproxy/admin.sock"

check_response_time() {
    local server=$1
    local host=$2
    local time_ms
    time_ms=$(curl -o /dev/null -s -w "%{time_total}" "http://$host/health" | awk '{print $1 * 1000}')
    echo $time_ms
}

for server in s1 s2; do
    host=$(echo "show servers state api_servers" | socat stdio $SOCK | grep $server | awk '{print $4}')
    time_ms=$(check_response_time $server $host)

    if (( $(echo "$time_ms > 500" | bc -l) )); then
        echo "set server api_servers/$server weight 10" | socat stdio $SOCK
        echo "$server slow ($time_ms ms) — weight lowered"
    fi
done
```

## Global Load Balancing

user-দের নিকটতম বা সবচেয়ে সুস্থ datacenter-এ route করা:

**GeoDNS:** DNS client-এর ভৌগোলিক অবস্থানের ভিত্তিতে ভিন্ন IP দিয়ে সাড়া দেয়।

- AWS Route 53 Geolocation routing
- Cloudflare Load Balancing
- EU client-এর জন্য EU IP, US client-এর জন্য US IP ফেরত দেয়

```
# Route 53 Geolocation example (via AWS CLI)
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch '{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "api.example.com",
      "Type": "A",
      "GeoLocation": {"ContinentCode": "EU"},
      "TTL": 60,
      "ResourceRecords": [{"Value": "18.185.0.1"}]
    }
  }, {
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "api.example.com",
      "Type": "A",
      "GeoLocation": {"CountryCode": "*"},
      "TTL": 60,
      "ResourceRecords": [{"Value": "52.204.0.1"}]
    }
  }]
}'
```

**Latency-based routing:** যে datacenter দ্রুততম সাড়া দেয় তাতে route করুন:

```bash
aws route53 change-resource-record-sets --hosted-zone-id Z123 --change-batch '{
  "Changes": [{
    "Action": "CREATE",
    "ResourceRecordSet": {
      "Name": "api.example.com",
      "Type": "A",
      "Region": "us-east-1",
      "SetIdentifier": "us-east-1",
      "TTL": 60,
      "ResourceRecords": [{"Value": "52.204.0.1"}]
    }
  }]
}'
```

## Anycast

একটা IP address একসাথে একাধিক location থেকে বিজ্ঞাপিত হয়। BGP routing প্রতিটা client-কে সেই IP announce করা topographically নিকটতম server-এ পাঠায়। Cloudflare তাদের পুরো network-এর জন্য এটা ব্যবহার করে।

নিজে anycast implement করতে আপনার BGP peering সক্ষমতা লাগে (colocation বা BGP-capable cloud)। বেশিরভাগ team-এর জন্য: এর বদলে Cloudflare বা AWS Global Accelerator ব্যবহার করুন।

**AWS Global Accelerator** কার্যত anycast-as-a-service:

```bash
aws globalaccelerator create-accelerator \
  --name my-api \
  --ip-address-type IPV4 \
  --enabled

aws globalaccelerator create-listener \
  --accelerator-arn arn:aws:globalaccelerator::123:accelerator/abc \
  --protocol TCP \
  --port-ranges "[{\"FromPort\":443,\"ToPort\":443}]"
```

Traffic নিকটতম edge PoP-এ AWS-এর network-এ ঢোকে, তারপর AWS-এর private backbone দিয়ে region-এ যায় — public internet-এর চেয়ে দ্রুত আর বেশি নির্ভরযোগ্য।

## Global LB-র জন্য Health Check Aggregation

একটা datacenter degraded হলে (পুরোপুরি down নয়), আপনি traffic সরাতে চান — সব-অথবা-কিছুই-না নয়:

```bash
#!/bin/bash
# health-reporter.sh — runs on each datacenter, updates Route 53
REGION="us-east-1"
HOSTED_ZONE="Z123"
WEIGHT=100

# Check local LB health
HEALTHY_SERVERS=$(echo "show servers state api_servers" | \
  socat stdio /run/haproxy/admin.sock | \
  awk '$6 == "2" {count++} END {print count}')

TOTAL_SERVERS=4

# Reduce weight proportionally to healthy servers
WEIGHT=$((HEALTHY_SERVERS * 100 / TOTAL_SERVERS))

# Update Route 53 weighted record
aws route53 change-resource-record-sets \
  --hosted-zone-id $HOSTED_ZONE \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"api.example.com\",
        \"Type\": \"A\",
        \"SetIdentifier\": \"$REGION\",
        \"Weight\": $WEIGHT,
        \"TTL\": 30,
        \"ResourceRecords\": [{\"Value\": \"$MY_IP\"}]
      }
    }]
  }"
```

0 healthy server-এ, weight 0-তে নেমে যায় — Route 53 স্বয়ংক্রিয়ভাবে এই datacenter-এ routing বন্ধ করে দেয়।

## Request Hedging

একই request একসাথে দুটো backend-এ পাঠান, যেটা আগে সাড়া দেয় সেটা ফেরত দিন। দ্বিগুণ backend load-এর বিনিময়ে tail latency কমায়:

```nginx
# nginx Plus: proxy_next_upstream with timeout
location / {
    proxy_pass http://notes;
    proxy_next_upstream error timeout http_503;
    proxy_next_upstream_timeout 100ms;   # try next server if first takes > 100ms
    proxy_next_upstream_tries 2;
}
```

এটা সত্যিকারের hedging নয় (parallel request) — এটা একটা timeout সহ sequential fallback। সত্যিকারের hedging-এর জন্য application-level implementation লাগে।

## Observability

সবসময় LB layer-এ এগুলো measure করুন:

```bash
# HAProxy stats via CSV — good for dashboards
curl -s 'http://admin:pass@localhost:8404/stats;csv' | \
  python3 -c "
import csv, sys
reader = csv.DictReader(sys.stdin)
for row in reader:
    if row['svname'] not in ('FRONTEND', 'BACKEND'):
        print(f\"{row['pxname']}/{row['svname']}: {row['req_tot']} req, {row['hrsp_5xx']} 5xx, {row['qtime']}ms queue\")
"
```

`haproxy_exporter` দিয়ে Prometheus-এ push করুন:

```yaml
# docker-compose.yml
haproxy-exporter:
  image: prom/haproxy-exporter
  command: '--haproxy.scrape-uri=http://admin:pass@haproxy:8404/stats;csv'
  ports:
    - '9101:9101'
```

গুরুত্বপূর্ণ metric:

- `haproxy_backend_requests_total` — per backend request rate
- `haproxy_backend_response_errors_total` — 5xx rate
- `haproxy_backend_queue_average_time_seconds` — queuing latency
- `haproxy_server_status` — 1=UP, 0=DOWN
