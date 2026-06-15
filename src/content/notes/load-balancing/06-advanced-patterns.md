---
title: "Advanced Load Balancing Patterns"
subtitle: "Blue-green deployments, circuit breakers, global load balancing, and anycast — patterns for deployments that can't go wrong."
chapter: 6
level: "intermediate"
readingTime: "10 min"
topics: ["blue-green", "canary", "circuit breaker", "global load balancing", "anycast", "GeoDNS"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A railway track switchover: you don't stop the train to switch tracks — you build a parallel track, test it, then flip the switch instantly. Blue-green deployment does the same: the new version is running and ready before a single user request hits it. The switch is instantaneous; rollback is just flipping it back.

</Callout>

## Blue-Green Deployments

Blue is live. Green is the new version. Traffic switches atomically.

**HAProxy blue-green with runtime API:**
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

Config with both backends:
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

The condition `nbsrv(api_blue) eq 0` means "use green if blue has no active servers" — a natural fallback to green when all blue servers are drained.

## Circuit Breaking at the LB

HAProxy can detect repeated failures and temporarily remove a backend:

```
backend api_servers
    option httpchk GET /health
    
    # After 3 failed checks, server marked down
    server s1 10.0.0.10:3000 check fall 3 rise 2 inter 5s
    server s2 10.0.0.11:3000 check fall 3 rise 2 inter 5s
    
    # If all servers are down, return a custom error instead of 502
    errorfile 503 /etc/haproxy/errors/maintenance.http
```

For application-level circuit breaking (e.g., downstream service errors), implement in the application layer (Opossum, Resilience4j) — HAProxy only sees the upstream HTTP response.

## Slow Backend Detection

Use HAProxy's `timeout` tuning and server weights to deprioritize slow servers:

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

Routing users to the nearest or healthiest datacenter:

**GeoDNS:** DNS responds with different IPs based on client geography.
- AWS Route 53 Geolocation routing
- Cloudflare Load Balancing
- Return EU IP for EU clients, US IP for US clients

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

**Latency-based routing:** Route to whichever datacenter responds fastest:
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

One IP address advertised from multiple locations simultaneously. BGP routing sends each client to the topographically closest server announcing that IP. Cloudflare uses this for their entire network.

You need BGP peering capability (colocation or BGP-capable cloud) to implement anycast yourself. For most teams: use Cloudflare or AWS Global Accelerator instead.

**AWS Global Accelerator** is effectively anycast-as-a-service:
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

Traffic enters AWS's network at the nearest edge PoP, then travels AWS's private backbone to the region — faster and more reliable than the public internet.

## Health Check Aggregation for Global LB

When a datacenter is degraded (not completely down), you want to shift traffic away — not all-or-nothing:

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

At 0 healthy servers, weight drops to 0 — Route 53 stops routing to this datacenter automatically.

## Request Hedging

Send the same request to two backends simultaneously, return whichever responds first. Reduces tail latency at the cost of doubled backend load:

```nginx
# nginx Plus: proxy_next_upstream with timeout
location / {
    proxy_pass http://notes;
    proxy_next_upstream error timeout http_503;
    proxy_next_upstream_timeout 100ms;   # try next server if first takes > 100ms
    proxy_next_upstream_tries 2;
}
```

This isn't true hedging (parallel requests) — it's sequential fallback with a timeout. True hedging requires application-level implementation.

## Observability

Always measure these at the LB layer:

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

Push to Prometheus via `haproxy_exporter`:
```yaml
# docker-compose.yml
haproxy-exporter:
  image: prom/haproxy-exporter
  command: '--haproxy.scrape-uri=http://admin:pass@haproxy:8404/stats;csv'
  ports:
    - "9101:9101"
```

Key metrics:
- `haproxy_backend_requests_total` — request rate per backend
- `haproxy_backend_response_errors_total` — 5xx rate
- `haproxy_backend_queue_average_time_seconds` — queuing latency
- `haproxy_server_status` — 1=UP, 0=DOWN

