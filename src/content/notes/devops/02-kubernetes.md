---
title: 'Kubernetes-এর প্রয়োজনীয় বিষয়'
subtitle: 'Pods, Deployments, Services — বড় স্কেলে container orchestration-এর মূল বিল্ডিং ব্লক।'
chapter: 2
level: 'beginner'
readingTime: '16 মিনিট'
topics: ['Kubernetes', 'pods', 'deployments', 'services']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

চট্টগ্রাম বন্দরের কন্ট্রোল টাওয়ারে বসে আছেন খোয়ারিজমি। তার নিচে সারি সারি ইয়ার্ড, জেটিতে ভেড়া অসংখ্য জাহাজ, আর হাজার হাজার একই মাপের স্ট্যান্ডার্ড container। প্রতিটা container কোথায় নামবে, কোন ইয়ার্ডে জায়গা খালি আছে, কোন ইয়ার্ডে ক্রেন ফ্রি — সব হিসাব করে তিনিই ঠিক করেন কোন container কোন ইয়ার্ডে যাবে। একটা ইয়ার্ড হঠাৎ ভরে গেলে বাকিগুলো আরেক ইয়ার্ডে পাঠিয়ে দেন, যাতে কোথাও জট না লাগে।

দুপুরের দিকে হঠাৎ পাঁচটা বড় জাহাজ একসাথে এসে পড়ল, container-এর ঢল নামল। খোয়ারিজমি সাথে সাথে ফাতিমাকে বলে বাড়তি হ্যান্ডলার আর ক্রেন-অপারেটর ডেকে আনলেন; কাজের চাপ কমতেই তাদের আবার ছুটিতে পাঠিয়ে দিলেন। এর মধ্যে একটা container ক্রেন থেকে পিছলে পড়ে ফেটে গেল — টাওয়ার তা টের পাওয়ামাত্র সিনাকে দিয়ে ঠিক ওই জায়গায় হুবহু আরেকটা container বসিয়ে দিলেন। টাওয়ারের হাতে দিনের একটা "পরিকল্পিত লেআউট" আছে — কোন ইয়ার্ডে কয়টা container থাকার কথা — আর সে সারাক্ষণ বাস্তব অবস্থাকে ওই পরিকল্পনার সাথে মিলিয়ে চলতে থাকে।

এই কন্ট্রোল টাওয়ারই আসলে **Kubernetes**-এর control plane, প্রতিটা container হলো একটা container বা pod, আর ইয়ার্ড-জাহাজগুলো হলো worker **node**। কোন container কোন node-এ বসবে সেটা ঠিক করা হলো **scheduling**, চাপ বুঝে হ্যান্ডলার বাড়ানো-কমানো হলো **scaling** (auto-scaling), ফেটে যাওয়া container-এর জায়গায় সাথে সাথে নতুনটা বসানো হলো **self-healing**, আর "পরিকল্পিত লেআউট" ধরে রাখার নিরন্তর চেষ্টাটাই হলো **desired state** reconciliation। বাস্তবে Kubernetes ঠিক এভাবেই একগুচ্ছ মেশিনের cluster জুড়ে হাজারো container সামলায় — Google, Spotify থেকে শুরু করে অসংখ্য বড় প্রতিষ্ঠান production-এ এভাবেই চালায়।

## Kubernetes কেন?

Docker একটা মেশিনে container চালায়। Kubernetes একগুচ্ছ মেশিনের cluster জুড়ে container চালায়, আর এগুলো সামলায়:

- **Scheduling**: এই container-টা কোন node-এ চলবে?
- **Scaling**: traffic হঠাৎ বেড়ে গেলে ১০টা কপি চালানো, কমে গেলে scale down করা
- **Self-healing**: কোনো container মারা গেলে সেটা আপনা-আপনি restart করা
- **Service discovery**: container-রা একে অপরকে নাম দিয়ে খুঁজে পায়, IP দিয়ে নয়
- **Rolling updates**: zero downtime-এ নতুন version deploy করা

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা warehouse-এর floor manager-এর মতো — তারা ঠিক করে কোন worker (pod) কোন কাজ সামলাবে, যারা অসুস্থ বলে ছুটি নেয় তাদের বদলি আনে (failed pod restart করে), আর ব্যস্ত মৌসুমে temp কর্মী নিয়োগ দেয় (auto-scaling)।

</Callout>

## মূল ধারণাগুলো

```typescript
// Mental model of Kubernetes objects
interface Pod {
	// Smallest deployable unit — one or more containers
	// that share network and storage
	name: string;
	containers: Container[];
	// Pods are ephemeral — they can be killed and recreated
}

interface Deployment {
	// Manages a set of identical Pods
	name: string;
	replicas: number; // desired pod count
	template: Pod; // pod spec to replicate
	strategy: 'RollingUpdate' | 'Recreate';
}

interface Service {
	// Stable network endpoint for a set of Pods
	name: string; // "api-service"
	type: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
	selector: Record<string, string>; // which pods to route to
	port: number;
}
```

## একটা সম্পূর্ণ উদাহরণ

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: myregistry/api:v1.2.3
          ports:
            - containerPort: 3000
          resources:
            requests:
              cpu: '100m' # 0.1 cores minimum
              memory: '128Mi'
            limits:
              cpu: '500m' # 0.5 cores maximum
              memory: '256Mi'
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
---
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
```

## Traffic কীভাবে প্রবাহিত হয়

```typescript
// 1. External request hits an Ingress or LoadBalancer
// 2. Routes to a Service by hostname/path
// 3. Service load-balances across healthy Pods
// 4. Pod processes the request

// Internal service discovery:
// Any pod can reach the API service at: http://api.default.svc.cluster.local
// Or just: http://api (within the same namespace)
```

<Callout type="tip">

**সবসময় resource request আর limit — দুটোই সেট করুন।** এগুলো ছাড়া একটা মাত্র pod একটা node-এর সব resource খেয়ে ফেলে বাকি pod-গুলোকে না খাইয়ে রাখতে পারে। Request একটা minimum নিশ্চিত করে; limit সর্বোচ্চ সীমা বেঁধে দেয়।

</Callout>

## Rolling Updates

```yaml
# Deployment strategy
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1 # create 1 extra pod during update
      maxUnavailable: 0 # never reduce below desired replicas


# What happens when you update the image:
# 1. New pod created with v1.2.4
# 2. Wait for readiness probe to pass
# 3. Old v1.2.3 pod starts draining
# 4. Repeat until all pods are v1.2.4
# 5. If new pod fails readiness → rollback automatically
```

<Callout type="info">

**আপনার সবসময় Kubernetes লাগবে না।** একটা মাত্র service বা ছোট টিমের জন্য, একটা managed platform (Railway, Fly.io, Cloud Run) কিংবা Docker Compose সহ একটা মাত্র server-ই বেশি সহজ। Kubernetes তার আসল জৌলুস দেখায় যখন ১০+ service থাকে জটিল networking, scaling আর deployment-এর দরকার নিয়ে।

</Callout>

## মূল বিষয়গুলো

1. **Pod হলো ephemeral** — আপনার অ্যাপ এমনভাবে ডিজাইন করুন যাতে restart সামলাতে পারে (stateless থাকুন, state বাইরে রাখুন)
2. **Deployment replica সামলায়** আর zero downtime-এ rolling update চালায়
3. **Service স্থিতিশীল endpoint দেয়** — pod আসে-যায়, কিন্তু service-এর নাম একই থাকে
4. প্রতিটা container-এ **resource request/limit সেট করুন** যাতে resource starvation না হয়
