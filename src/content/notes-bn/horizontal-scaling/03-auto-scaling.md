---
title: 'Auto-Scaling'
subtitle: 'চাহিদা অনুযায়ী scale out — target tracking, scheduled scaling, scale-in protection, এবং যে metric আসলে ভালো সিদ্ধান্ত চালায়।'
chapter: 3
level: 'intermediate'
readingTime: '9 মিনিট'
topics: ['auto-scaling', 'ASG', 'HPA', 'target tracking', 'scale-in', 'KEDA']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা কল সেন্টার যা peak hour-এ আরও ফোন লাইন খোলে: তারা দুপুরে ১০০ এজেন্ট দরকার বলে ভোর ৩টায় ১০০ এজেন্ট বসিয়ে রাখে না। Auto-scaling ঠিক এটাই করে — load যখন চায় তখন capacity জোগায়, load কমলে ছেড়ে দেয়, এবং কখন করবে তা মানুষ ঠিক না করেই স্বয়ংক্রিয়ভাবে এটা করে।

</Callout>

## Auto-Scaling যা দেয়

Manual scaling-এর দুইটা failure mode আছে: বেশি capacity (খরচ বেশি) এবং কম capacity (ব্যবহারকারীরা ভোগে)। Auto-scaling manual সিদ্ধান্তের loop-টাকে একটা control loop দিয়ে বদলে দেয়:

```
Measure metric → Compare to target → Adjust capacity → Repeat
```

ফলাফল: আপনি যা ব্যবহার করেন তার জন্য টাকা দেন, এবং আপনার সবসময় যথেষ্ট capacity থাকে (scaling limit এবং cooldown period-এর মধ্যে)।

## AWS Auto Scaling Groups

একটা ASG EC2 instance-এর একটা fleet পরিচালনা করে। Scaling policy নির্ধারণ করে কখন এবং কীভাবে fleet বাড়বে বা কমবে।

**Target Tracking — সুপারিশকৃত default:**

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

AWS আপনার হয়ে PID control করে: CPU যদি 70%-এর উপরে থাকে, instance যোগ করে; নিচে থাকলে সরিয়ে দেয়। আপনি শুধু target সেট করেন।

**Step Scaling — সূক্ষ্ম নিয়ন্ত্রণের জন্য:**

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

**Scheduled Scaling — অনুমানযোগ্য traffic pattern-এর জন্য:**

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

Scheduled + target tracking একসাথে ব্যবহার করুন: scheduled জানা peak-এর জন্য floor সেট করে, target tracking তার উপরের অপ্রত্যাশিত spike সামলায়।

## সঠিক Scaling Metric

CPU সবচেয়ে সাধারণ metric কিন্তু সবসময় সঠিক নয়:

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

**Custom metric scaling (ALB-এর মাধ্যমে request count):**

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

Kubernetes HPA metric-এর ভিত্তিতে Deployment replica scale করে:

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

**Custom metric HPA (Prometheus থেকে RPS-এর উপর scale):**

```yaml
metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: '100' # 100 RPS per pod
```

Prometheus metric-কে Kubernetes metrics API-তে সংযুক্ত করার জন্য `prometheus-adapter` বা KEDA দরকার।

## KEDA: Event-Driven Autoscaling

KEDA (Kubernetes Event-Driven Autoscaling) queue depth, Kafka lag, বা যেকোনো external metric-এর ভিত্তিতে scale করে — worker fleet-এর জন্য একদম উপযুক্ত:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: worker-scaler
spec:
  scaleTargetRef:
    name: worker-deployment
  minReplicaCount: 0 # scale to zero when queue is empty
  maxReplicaCount: 50
  triggers:
    - type: redis
      metadata:
        address: redis:6379
        listName: jobs:default
        listLength: '10' # 1 replica per 10 jobs in queue

    - type: kafka
      metadata:
        bootstrapServers: kafka:9092
        consumerGroup: my-workers
        topic: work-items
        lagThreshold: '100' # scale when lag > 100 per partition
```

Queue খালি হলে worker-রা zero-তে scale হয় — idle অবস্থায় শূন্য খরচ। Queue depth-এর সাথে তারা রৈখিকভাবে scale out করে। Batch workload-এর জন্য এটাই সবচেয়ে পরিচ্ছন্ন model।

## Scale-In Protection

Scale in করা (instance সরানো) বিপজ্জনক যদি request-এর মাঝখানে করা হয়। রক্ষার উপায়:

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

**Worker process-এর জন্য:** scale-in নোটিশ যাচাই করুন এবং চলমান কাজ শেষ করুন:

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

## Cooldown Period

Auto-scaling তাৎক্ষণিকভাবে প্রতিক্রিয়া দেখায় না — cooldown দোলাচল আটকায় (scale out, scale in, আবার দ্রুত পরপর scale out)।

```bash
# ASG default cooldown: 300 seconds after any scaling activity
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name myapp-asg \
  --default-cooldown 120   # 2 minutes (reduce for faster-responding apps)
```

**Warm-up period:** নতুন instance তাৎক্ষণিকভাবে পূর্ণ capacity-তে থাকে না — তাদের start করতে, load balancer-এর সাথে register করতে, এবং cache prime করতে সময় লাগে। আপনার target-এ এটার হিসাব রাখুন:

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
