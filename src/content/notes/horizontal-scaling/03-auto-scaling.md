---
title: "Auto-Scaling"
subtitle: "Scaling out on demand — target tracking, scheduled scaling, scale-in protection, and the metrics that actually drive good decisions."
chapter: 3
level: "intermediate"
readingTime: "9 min"
topics: ["auto-scaling", "ASG", "HPA", "target tracking", "scale-in", "KEDA"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A call center that opens more phone lines during peak hours: they don't staff 100 agents at 3am just because they need them at noon. Auto-scaling does the same — provisions capacity when load demands it, releases it when load drops, and does this automatically without a human deciding when.

</Callout>

## What Auto-Scaling Provides

Manual scaling has two failure modes: too much capacity (expensive) and too little (users affected). Auto-scaling replaces the manual decision loop with a control loop:

```
Measure metric → Compare to target → Adjust capacity → Repeat
```

The result: you pay for what you use, and you always have enough capacity (within scaling limits and cooldown periods).

## AWS Auto Scaling Groups

An ASG manages a fleet of EC2 instances. Scaling policies define when and how the fleet grows or shrinks.

**Target Tracking — the recommended default:**
```bash
# Scale to maintain CPU at 70%
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name myapp-asg \
  --policy-name cpu-target-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ASGAverageCPUUtilization"
    },
    "TargetValue": 70.0,
    "DisableScaleIn": false
  }'
```

AWS does the PID control for you: if CPU is above 70%, add instances; if below, remove them. You only set the target.

**Step Scaling — for fine-grained control:**
```bash
aws autoscaling put-scaling-policy \
  --policy-name scale-out-on-high-cpu \
  --policy-type StepScaling \
  --adjustment-type ChangeInCapacity \
  --step-adjustments '[
    {"MetricIntervalLowerBound": 0, "MetricIntervalUpperBound": 10, "ScalingAdjustment": 1},
    {"MetricIntervalLowerBound": 10, "MetricIntervalUpperBound": 20, "ScalingAdjustment": 2},
    {"MetricIntervalLowerBound": 20, "ScalingAdjustment": 4}
  ]'
# CPU 70-80%: add 1 instance
# CPU 80-90%: add 2 instances
# CPU 90%+:   add 4 instances
```

**Scheduled Scaling — for predictable traffic patterns:**
```bash
# Scale up before peak hours (weekdays 9am)
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name myapp-asg \
  --scheduled-action-name scale-up-morning \
  --recurrence "0 8 * * MON-FRI" \
  --min-size 4 --desired-capacity 6 --max-size 20

# Scale down overnight
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name myapp-asg \
  --scheduled-action-name scale-down-night \
  --recurrence "0 20 * * MON-FRI" \
  --min-size 1 --desired-capacity 2 --max-size 20
```

Combine scheduled + target tracking: scheduled sets the floor for known peaks, target tracking handles unexpected spikes above that.

## The Right Scaling Metric

CPU is the most common metric but not always the right one:

```
CPU-based scaling works for:
  CPU-bound workloads (computation, serialization)

CPU-based scaling fails for:
  I/O-bound workloads (waiting on DB, external APIs)
  → CPU is low even when instances are saturated with waiting requests

Better metrics for I/O-bound workloads:
  Request count per second (RPS)
  Active connection count
  Queue depth (for worker fleets)
  Custom metric: in-flight requests per instance
```

**Custom metric scaling (request count via ALB):**
```bash
# Scale on ALB RequestCountPerTarget
aws autoscaling put-scaling-policy \
  --policy-name alb-request-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "CustomizedMetricSpecification": {
      "MetricName": "RequestCountPerTarget",
      "Namespace": "AWS/ApplicationELB",
      "Dimensions": [
        {"Name": "TargetGroup", "Value": "targetgroup/myapp/abc123"}
      ],
      "Statistic": "Sum"
    },
    "TargetValue": 1000.0
  }'
# Keep ~1000 requests/minute per instance
```

## Kubernetes Horizontal Pod Autoscaler (HPA)

Kubernetes HPA scales Deployment replicas based on metrics:

```yaml
# Basic: scale on CPU
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70

    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

**Custom metrics HPA (scale on RPS from Prometheus):**
```yaml
metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"  # 100 RPS per pod
```

Requires `prometheus-adapter` or KEDA to bridge Prometheus metrics to the Kubernetes metrics API.

## KEDA: Event-Driven Autoscaling

KEDA (Kubernetes Event-Driven Autoscaling) scales based on queue depth, Kafka lag, or any external metric — perfect for worker fleets:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: worker-scaler
spec:
  scaleTargetRef:
    name: worker-deployment
  minReplicaCount: 0     # scale to zero when queue is empty
  maxReplicaCount: 50
  triggers:
    - type: redis
      metadata:
        address: redis:6379
        listName: jobs:default
        listLength: "10"   # 1 replica per 10 jobs in queue

    - type: kafka
      metadata:
        bootstrapServers: kafka:9092
        consumerGroup: my-workers
        topic: work-items
        lagThreshold: "100"  # scale when lag > 100 per partition
```

Workers scale to zero when the queue is empty — zero cost at idle. They scale out linearly with queue depth. This is the cleanest model for batch workloads.

## Scale-In Protection

Scaling in (removing instances) is dangerous if done mid-request. Protection mechanisms:

**Instance scale-in protection (AWS ASG):**
```bash
# Protect specific instances from scale-in while processing critical work
aws autoscaling set-instance-protection \
  --auto-scaling-group-name myapp-asg \
  --instance-ids i-xxx \
  --protected-from-scale-in

# Remove protection when done
aws autoscaling set-instance-protection \
  --auto-scaling-group-name myapp-asg \
  --instance-ids i-xxx \
  --no-protected-from-scale-in
```

**For worker processes:** check scale-in notice and finish current job:
```typescript
// AWS: poll for termination notice
setInterval(async () => {
  const res = await fetch(
    'http://169.254.169.254/latest/meta-data/autoscaling/target-lifecycle-state',
    { signal: AbortSignal.timeout(100) }
  );
  if (res.ok && (await res.text()) === 'Terminating') {
    logger.info('Scale-in detected, draining worker');
    await worker.pause(); // stop taking new jobs
    // Complete current job, then exit
  }
}, 5_000);
```

## Cooldown Periods

Auto-scaling doesn't react instantly — cooldown prevents oscillation (scale out, scale in, scale out again in rapid succession).

```bash
# ASG default cooldown: 300 seconds after any scaling activity
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name myapp-asg \
  --default-cooldown 120   # 2 minutes (reduce for faster-responding apps)
```

**Warm-up period:** New instances aren't instantly at full capacity — they need time to start, register with the load balancer, and prime their caches. Account for this in your target:

```bash
# Target tracking: instance warm-up of 120s
--target-tracking-configuration '{
  "TargetValue": 70.0,
  "EstimatedInstanceWarmup": 120
}'
# New instances' metrics excluded from scaling decisions for 120s after launch
```

## Scaling Checklist

```
□ Stateless application (sessions in Redis, files in S3)
□ Fast startup time (< 30s to ready) — slow starts limit scaling responsiveness
□ Health check returns ready only when instance can serve traffic
□ Graceful shutdown handles SIGTERM within drain timeout
□ Min instances = your baseline SLA (never scale to zero for user-facing)
□ Max instances = budget limit (prevent runaway cost)
□ Scale metric chosen for actual bottleneck (not always CPU)
□ Cooldown / warm-up tuned for your app's startup characteristics
□ Load tested at 2x expected peak — know max RPS before it happens in prod
□ Spot/preemptible for non-critical workloads (workers, batch) — 60-80% cheaper
```

