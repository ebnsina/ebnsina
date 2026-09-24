---
title: 'Fault Injection Tools'
subtitle: 'Container-এর জন্য Pumba, network-এর জন্য tc, process-এর জন্য kill -9, cloud-এর জন্য AWS FIS — chaos experiment চালানোর ব্যবহারিক টুলকিট।'
chapter: 3
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['Pumba', 'tc', 'AWS FIS', 'fault injection', 'network partition', 'latency injection']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা flight simulator: পাইলট ট্রেন করতে আসল প্লেন ক্র্যাশ করার বদলে, আপনি নিয়ন্ত্রিত এনভায়রনমেন্টে engine failure, instrument malfunction, আর প্রচণ্ড আবহাওয়া ইনজেক্ট করেন। সিমুলেশন যথেষ্ট বাস্তবসম্মত যাতে পাইলটরা যা শেখে তা আসল emergency-তে কাজে লাগে। Fault injection tools হলো আপনার flight simulator।

</Callout>

## গল্পে বুঝি

ফাতিমার একটা বড় কারখানা — লম্বা অ্যাসেম্বলি লাইন, সারি সারি মেশিন, কনভেয়র বেল্ট আর করিডোর দিয়ে এক ঘর থেকে আরেক ঘরে পার্টস যায়। লাইন বন্ধ হলে লোকসান, তাই তিনি জানতে চান কোথায় দুর্বলতা লুকিয়ে আছে — কিন্তু আসল বিপর্যয় ঘটার জন্য বসে থাকতে চান না। তাই তিনি সিনাকে ভাড়া করলেন, একজন অনুমোদিত "স্ট্রেস-টেস্টার", যার হাতে একটা সুনির্দিষ্ট টুলকিট আছে। সিনা যা খুশি ভাঙচুর করেন না — শুধু কমান্ড দিলে, নিরাপদে, একটা করে মেপে-মেপে গোলযোগ ঘটান।

ফাতিমা বলেন, "দেখি তো, একটা মেশিন হঠাৎ বন্ধ হলে ব্যাকআপটা চালু হয় কিনা।" সিনা একটা নির্দিষ্ট মেশিনের প্লাগ টেনে খুলে দেন — সাথে সাথে দেখা যায় পাশের স্ট্যান্ডবাই মেশিন কাজ তুলে নেয় কিনা। এরপর তিনি একটা কনভেয়র বেল্টের গতি ইচ্ছে করে হামাগুড়ির মতো ধীর করে দেন, দেখতে যে ধীর লাইনে বাকি ধাপগুলো জট পাকিয়ে যায় নাকি সামলে নেয়। শেষে একটা করিডোর সাময়িকভাবে আটকে দেন, যাতে পার্টস এক ঘর থেকে আরেক ঘরে পৌঁছাতেই না পারে — আর তিনি হাতে kill switch রাখেন, যেকোনো মুহূর্তে সব স্বাভাবিক করে দিতে।

এই গল্পটাই আসলে **fault injection tools**। সিনার নিয়ন্ত্রিত টুলকিট হলো fault injection tool — নিখুঁত, ছোট, ফিরিয়ে-আনার-যোগ্য গোলযোগ। মেশিনের প্লাগ খুলে ফেলা মানে একটা **instance kill** করা (`kill -9`, `pumba kill`, বা AWS FIS দিয়ে EC2 terminate)। কনভেয়র ধীর করে দেওয়া মানে **latency inject** করা (`tc netem delay`, Chaos Mesh NetworkChaos)। করিডোর আটকে দেওয়া মানে **network fault** ঘটানো — packet drop বা partition। বাস্তবে Chaos Mesh (Kubernetes), Gremlin (SaaS), আর Toxiproxy (proxy-লেভেল latency/fault) ঠিক এই কাজটাই করে: অনুমোদিত, targeted, নিয়ন্ত্রণযোগ্য পদ্ধতিতে system-এ fault ঢুকিয়ে resilience যাচাই করে — লাইন সত্যিই ভেঙে যাওয়ার আগেই।

## Process Failures: kill -9

সবচেয়ে সহজ fault injection। একটা process terminate করুন আর দেখুন কী হয়:

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

**Node.js-এ crash recovery simulate করুন:**

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

Linux `tc` command OS লেভেলে network fault ইনজেক্ট করে। Host-এর যেকোনো process-এর জন্য কাজ করে।

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

**নির্দিষ্ট destination টার্গেট করুন (সব traffic নয়):**

```bash
# Only delay traffic to a specific IP
tc qdisc add dev eth0 root handle 1: prio
tc filter add dev eth0 protocol ip parent 1:0 prio 1 u32 \
  match ip dst 10.0.1.50/32 flowid 1:1
tc qdisc add dev eth0 parent 1:1 handle 10: netem delay 500ms
```

## Container Faults: Pumba

[Pumba](https://github.com/alexei-led/pumba) application code পরিবর্তন না করেই Docker container-এ fault ইনজেক্ট করে:

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

**একটা chaos experiment-এর জন্য Docker Compose-এ:**

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

## Kubernetes: Chaos Mesh এবং Litmus

Kubernetes এনভায়রনমেন্টের জন্য, ডেডিকেটেড chaos operator আপনাকে declarative fault injection দেয়:

**Chaos Mesh:**

```yaml
# Pod failure: kill a pod in the payment namespace
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: payment-pod-failure
spec:
  action: pod-failure # or: pod-kill, container-kill
  mode: one # one random pod
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
    correlation: '25' # correlation between consecutive packets
    jitter: '100ms'
  direction: to # latency on ingress to payment service
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
      size: '512MB' # consume 512MB per worker
  duration: '3m'
```

## AWS Fault Injection Simulator (FIS)

AWS-নেটিভ infrastructure-এর জন্য, FIS cloud লেভেলে fault ইনজেক্ট করে:

```json
{
	"description": "Kill 30% of EC2 instances in production ASG",
	"targets": {
		"prod-instances": {
			"resourceType": "aws:ec2:instance",
			"resourceArns": [],
			"filters": [
				{
					"path": "State.Name",
					"values": ["running"]
				}
			],
			"selectionMode": "PERCENT(30)"
		}
	},
	"actions": {
		"terminate-instances": {
			"actionId": "aws:ec2:terminate-instances",
			"targets": { "Instances": "prod-instances" }
		}
	},
	"stopConditions": [
		{
			"source": "aws:cloudwatch:alarm",
			"value": "arn:aws:cloudwatch:us-east-1:123:alarm/ErrorRateTooHigh"
		}
	],
	"roleArn": "arn:aws:iam::123:role/FISRole"
}
```

**FIS stop conditions** খুবই গুরুত্বপূর্ণ — একটা CloudWatch alarm fire করলে স্বয়ংক্রিয়ভাবে experiment abort করুন। এটাই আপনার safety net:

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

Development এবং testing-এর জন্য আপনার code-এর ভেতরে fault ইনজেক্ট করুন:

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

এটা আপনাকে infrastructure tool ছাড়াই টেস্ট করতে দেয় আপনার frontend কীভাবে backend error সামলায়।

## Safety Practices

**সবসময় একটা kill switch রাখুন:**

```bash
# Single command to stop all chaos experiments
kubectl delete podchaos,networkchaos,stresschaos --all -n chaos-testing

# Or via a script that's always ready
./scripts/chaos-stop-all.sh
```

**Synthetic traffic দিয়ে শুরু করুন, আসল user traffic দিয়ে নয়:**

```bash
# Direct chaos only at test traffic using labels/headers
# All chaos experiments tag requests with X-Chaos-Test: true
# Production traffic skips chaos middleware
```

**Blast radius limit স্বয়ংক্রিয় করুন:**

```yaml
# Chaos Mesh: never kill more than 1 pod at a time
spec:
  mode: fixed # exactly 1 pod
  value: '1' # not a percentage — absolute limit
```

**Experiment ডকুমেন্ট আর schedule করুন:**
একটা chaos runbook রাখুন: কী experiment চালানো হয়েছিল, কখন, কে করেছিল, hypothesis কী ছিল, কী observe করা হলো, আর কী fix করা হলো। এটা প্রাতিষ্ঠানিক জ্ঞান গড়ে তোলে আর আপনাকে না শিখে একই experiment বারবার না চালাতে সাহায্য করে।
