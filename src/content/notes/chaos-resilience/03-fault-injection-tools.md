---
title: "Fault Injection Tools"
subtitle: "Pumba for containers, tc for network, kill -9 for processes, AWS FIS for cloud — the practical toolkit for running chaos experiments."
chapter: 3
level: "intermediate"
readingTime: "11 min"
topics: ["Pumba", "tc", "AWS FIS", "fault injection", "network partition", "latency injection"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A flight simulator: instead of crashing real planes to train pilots, you inject engine failures, instrument malfunctions, and severe weather in a controlled environment. The simulation is realistic enough that what pilots learn transfers to real emergencies. Fault injection tools are your flight simulator.

</Callout>

## Process Failures: kill -9

The simplest fault injection. Terminate a process and see what happens:

```bash
# Kill a specific process
kill -9 $(pgrep -f "node server.js")

# Kill a random instance (useful in a fleet)
kill -9 $(pgrep -f "node server.js" | shuf -n 1)

# Simulate OOM kill (the kernel sends SIGKILL on OOM)
# stress-ng to consume memory until OOM killer fires
stress-ng --vm 1 --vm-bytes 90% --timeout 60s

# Verify recovery:
# - Load balancer should detect unhealthy instance within 30s
# - Traffic should shift to remaining instances
# - Application should restart via process manager (PM2, systemd)
```

**Simulate crash recovery in Node.js:**
```bash
# PM2: should restart crashed process
pm2 start server.js --name api
kill -9 $(pgrep -f "server.js")
pm2 status # watch it restart

# systemd: same behavior
systemctl status myapp
kill -9 $(pgrep -f myapp)
systemctl status myapp # should show restart
```

## Network Faults: tc (Traffic Control)

Linux `tc` command injects network faults at the OS level. Works for any process on the host.

```bash
# Add 200ms latency to all outbound traffic on eth0
tc qdisc add dev eth0 root netem delay 200ms

# Add latency with variance (100ms ± 50ms, normally distributed)
tc qdisc add dev eth0 root netem delay 100ms 50ms distribution normal

# Add packet loss (5%)
tc qdisc add dev eth0 root netem loss 5%

# Corrupt packets (1%)
tc qdisc add dev eth0 root netem corrupt 1%

# Duplicate packets (2%)
tc qdisc add dev eth0 root netem duplicate 2%

# Combine: 100ms delay + 1% packet loss
tc qdisc add dev eth0 root netem delay 100ms loss 1%

# Remove all tc rules (restore normal network)
tc qdisc del dev eth0 root
```

**Target specific destination (not all traffic):**
```bash
# Only delay traffic to a specific IP
tc qdisc add dev eth0 root handle 1: prio
tc filter add dev eth0 protocol ip parent 1:0 prio 1 u32 \
  match ip dst 10.0.1.50/32 flowid 1:1
tc qdisc add dev eth0 parent 1:1 handle 10: netem delay 500ms
```

## Container Faults: Pumba

[Pumba](https://github.com/alexei-led/pumba) injects faults into Docker containers without modifying application code:

```bash
# Install
docker pull gaiaadm/pumba

# Kill a container (simulates container crash)
pumba kill --signal SIGKILL myapp

# Kill a random container matching a pattern
pumba kill --signal SIGKILL re2:myapp-.*

# Network latency: 300ms on all traffic from container
pumba netem --duration 5m delay --time 300 myapp

# Network latency with jitter: 300ms ± 100ms
pumba netem --duration 5m delay --time 300 --jitter 100 myapp

# Packet loss: 20% packet loss for 2 minutes
pumba netem --duration 2m loss --percent 20 myapp

# Packet corruption
pumba netem --duration 2m corrupt --percent 5 myapp

# Rate limiting: cap bandwidth to 100kbit
pumba netem --duration 3m rate --rate 100kbit myapp

# Pause container (simulates frozen process)
pumba pause --duration 30s myapp
```

**In Docker Compose for a chaos experiment:**
```yaml
# docker-compose.chaos.yml
services:
  pumba:
    image: gaiaadm/pumba
    command: >
      netem --duration 10m
      --tc-image ghcr.io/alexei-led/pumba/alpine-tc:latest
      delay --time 200
      payment-service
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - payment-service
```

## Kubernetes: Chaos Mesh and Litmus

For Kubernetes environments, dedicated chaos operators give you declarative fault injection:

**Chaos Mesh:**
```yaml
# Pod failure: kill a pod in the payment namespace
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: payment-pod-failure
spec:
  action: pod-failure    # or: pod-kill, container-kill
  mode: one              # one random pod
  duration: '30s'
  selector:
    namespaces: [payment]
    labelSelectors:
      app: payment-service
```

```yaml
# Network chaos: add latency between services
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: payment-latency
spec:
  action: delay
  mode: all
  selector:
    namespaces: [payment]
  delay:
    latency: '500ms'
    correlation: '25'    # correlation between consecutive packets
    jitter: '100ms'
  direction: to          # latency on ingress to payment service
  duration: '5m'
```

```yaml
# Stress chaos: CPU or memory pressure
apiVersion: chaos-mesh.org/v1alpha1
kind: StressChaos
metadata:
  name: payment-memory-stress
spec:
  mode: one
  selector:
    namespaces: [payment]
  stressors:
    memory:
      workers: 2
      size: '512MB'   # consume 512MB per worker
  duration: '3m'
```

## AWS Fault Injection Simulator (FIS)

For AWS-native infrastructure, FIS injects faults at the cloud level:

```json
{
  "description": "Kill 30% of EC2 instances in production ASG",
  "targets": {
    "prod-instances": {
      "resourceType": "aws:ec2:instance",
      "resourceArns": [],
      "filters": [{
        "path": "State.Name",
        "values": ["running"]
      }],
      "selectionMode": "PERCENT(30)"
    }
  },
  "actions": {
    "terminate-instances": {
      "actionId": "aws:ec2:terminate-instances",
      "targets": { "Instances": "prod-instances" }
    }
  },
  "stopConditions": [{
    "source": "aws:cloudwatch:alarm",
    "value": "arn:aws:cloudwatch:us-east-1:123:alarm/ErrorRateTooHigh"
  }],
  "roleArn": "arn:aws:iam::123:role/FISRole"
}
```

**FIS stop conditions** are critical — automatically abort the experiment if a CloudWatch alarm fires. This is your safety net:

```bash
# Create experiment with stop condition
aws fis create-experiment-template \
  --cli-input-json file://fis-template.json

# Run experiment
aws fis start-experiment \
  --experiment-template-id EXT123

# Monitor
aws fis get-experiment --id EXP456
```

## Application-Level Fault Injection

Inject faults inside your code for development and testing:

```typescript
// Middleware that randomly injects faults based on env vars
function chaosMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (process.env.CHAOS_ENABLED !== 'true') return next();

  const rand = Math.random();

  // 5% chance of random delay
  const latencyRate = parseFloat(process.env.CHAOS_LATENCY_RATE ?? '0.05');
  if (rand < latencyRate) {
    const delay = parseInt(process.env.CHAOS_LATENCY_MS ?? '1000');
    setTimeout(next, delay);
    return;
  }

  // 1% chance of random error
  const errorRate = parseFloat(process.env.CHAOS_ERROR_RATE ?? '0.01');
  if (rand < latencyRate + errorRate) {
    res.status(503).json({ error: 'Chaos-injected error' });
    return;
  }

  next();
}

app.use(chaosMiddleware);
```

This lets you test how your frontend handles backend errors without needing infrastructure tools.

## Safety Practices

**Always have a kill switch:**
```bash
# Single command to stop all chaos experiments
kubectl delete podchaos,networkchaos,stresschaos --all -n chaos-testing

# Or via a script that's always ready
./scripts/chaos-stop-all.sh
```

**Start with synthetic traffic, not real user traffic:**
```bash
# Direct chaos only at test traffic using labels/headers
# All chaos experiments tag requests with X-Chaos-Test: true
# Production traffic skips chaos middleware
```

**Automate blast radius limits:**
```yaml
# Chaos Mesh: never kill more than 1 pod at a time
spec:
  mode: fixed        # exactly 1 pod
  value: '1'         # not a percentage — absolute limit
```

**Document and schedule experiments:**
Keep a chaos runbook: what experiment was run, when, by whom, what the hypothesis was, what was observed, and what was fixed. This builds institutional knowledge and helps you not repeat the same experiments without learning.

