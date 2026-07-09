---
title: 'Service Discovery'
subtitle: 'Service-রা কীভাবে একে অপরকে খুঁজে পায় — DNS-based discovery, Consul, client-side vs server-side load balancing, আর health-integrated routing।'
chapter: 3
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['service discovery', 'Consul', 'DNS', 'health checks', 'service mesh', 'Envoy']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা company directory বনাম একজন receptionist: directory-তে সবার extension লেখা থাকে — আপনি খুঁজে বের করে সরাসরি call করেন (client-side discovery)। Receptionist জানেন আজ কে আছেন, আপনার call-টা কোনো available জনের কাছে route করেন, আর কেউ না থাকলে transfer সামলান (server-side discovery)। Receptionist একটা ধাপ যোগ করেন কিন্তু কে নিজের ডেস্কে আছেন সেটা জানার প্রয়োজন থেকে আপনাকে বাঁচান।

</Callout>

## সমস্যাটা

একটা monolith-এ একটা function call করা মানে শুধু একটা pointer dereference। microservices-এ একটা service call করতে দরকার:

1. এর বর্তমান IP আর port জানা
2. কোন instance গুলো healthy জানা
3. কোন instance call করবেন সিদ্ধান্ত নেওয়া (load balancing)

এগুলো hardcode করা যায় না — container নতুন IP নিয়ে restart হয়, instance scale in ও out হয়, deployment instance replace করে।

## DNS-Based Discovery

সবচেয়ে সহজ পদ্ধতি: প্রতিটা service-এর একটা stable DNS name থাকে যা এক বা একাধিক IP-তে resolve হয়।

**Kubernetes-এ:** প্রতিটা Service স্বয়ংক্রিয়ভাবে একটা stable DNS name পায়।

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  selector:
    app: order-service
  ports:
    - port: 50051
      targetPort: 50051
```

Cluster-এর ভেতরে:

```
order-service.production.svc.cluster.local:50051
# Or just:
order-service:50051  (within same namespace)
```

Kubernetes DNS এটাকে ClusterIP-তে resolve করে, যা যেকোনো healthy pod-এ route করে। কোনো service registry দরকার নেই — Kubernetes-ই registry।

**Kubernetes-এর বাইরে:** health check সহ Route 53 বা যেকোনো DNS server ব্যবহার করুন।

```bash
# Route 53 with health check
aws route53 create-health-check \
  --caller-reference $(date +%s) \
  --health-check-config '{
    "IPAddress": "10.0.0.10",
    "Port": 50051,
    "Type": "TCP",
    "RequestInterval": 10,
    "FailureThreshold": 3
  }'

# A record with health check — Route 53 removes failing instances
aws route53 change-resource-record-sets \
  --hosted-zone-id ZXXX \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "order-service.internal",
        "Type": "A",
        "TTL": 30,
        "HealthCheckId": "abc-123",
        "ResourceRecords": [{"Value": "10.0.0.10"}]
      }
    }]
  }'
```

**TTL গুরুত্বপূর্ণ:** ছোট TTL (30s) মানে client দ্রুত failure discover করে। বড় TTL (5min) মানে deploy-এর পর stale DNS। internal DNS TTL 10-30s-এ রাখুন।

## Consul

Consul একটা purpose-built service registry, যাতে health check, KV store, আর service mesh সক্ষমতা আছে।

```bash
# Start Consul agent (dev mode)
consul agent -dev

# Production: 3-node cluster
consul agent \
  -server \
  -bootstrap-expect=3 \
  -datacenter=us-east-1 \
  -data-dir=/var/lib/consul \
  -bind=10.0.0.10 \
  -retry-join=10.0.0.11 \
  -retry-join=10.0.0.12
```

**Service registration:**

```json
// /etc/consul.d/order-service.json
{
	"service": {
		"name": "order-service",
		"id": "order-service-1",
		"port": 50051,
		"tags": ["grpc", "v1"],
		"check": {
			"grpc": "localhost:50051",
			"interval": "10s",
			"deregister_critical_service_after": "1m"
		}
	}
}
```

```bash
consul reload
# Service is now registered and health-checked
```

**Consul-এ query করা:**

```bash
# DNS interface (built-in)
dig @127.0.0.1 -p 8600 order-service.service.consul SRV
# Returns: IP + port of all healthy instances

# HTTP API
curl http://localhost:8500/v1/health/service/order-service?passing=true
```

**Application integration:**

```typescript
import Consul from 'consul';

const consul = new Consul();

async function discoverService(name: string): Promise<string> {
	const services = await consul.health.service({
		service: name,
		passing: true // only healthy instances
	});

	if (services.length === 0) throw new Error(`No healthy instances of ${name}`);

	// Simple round-robin
	const instance = services[Math.floor(Math.random() * services.length)];
	const { Address, Port } = instance.Service;
	return `${Address}:${Port}`;
}

const orderServiceAddr = await discoverService('order-service');
const client = createClient(
	OrderService,
	createGrpcTransport({
		baseUrl: `https://${orderServiceAddr}`
	})
);
```

## Client-Side vs Server-Side Load Balancing

**Server-side (traditional):**

```
Client → Load Balancer → [picks instance] → Service instance
```

LB-এর কাছে সব জ্ঞান থাকে। Client শুধু একটা single stable address-এ call করে।

**Client-side:**

```
Client → Consul (get all instances) → Client picks one → Service instance
```

Client নিজেই নিজের load balancing করে। বেশি জটিল, কিন্তু কোনো LB bottleneck নেই, আর smarter routing (client স্বয়ংক্রিয়ভাবে অন্য instance-এ retry করতে পারে)।

একটা service registry সহ gRPC স্বাভাবিকভাবেই client-side load balancing ব্যবহার করে — gRPC runtime name-টাকে একাধিক address-এ resolve করে আর সেগুলোর মধ্যে balance করে:

```typescript
// gRPC client-side LB with multiple addresses
const transport = createGrpcTransport({
	baseUrl: 'https://order-service:50051'
	// The resolver queries Consul and returns all instance addresses
	// gRPC runtime round-robins across them
});
```

## Envoy/Istio দিয়ে Service Mesh

একটা service mesh সব service discovery, load balancing, retry, circuit breaking, আর mTLS-কে একটা sidecar proxy-তে (Envoy) সরিয়ে নেয়। Application code শুধু `localhost:50051`-এ call করে — sidecar intercept করে সব সামলায়।

```yaml
# Kubernetes: Istio injects Envoy automatically
apiVersion: v1
kind: Pod
metadata:
  name: order-service
  annotations:
    sidecar.istio.io/inject: 'true'
spec:
  containers:
    - name: order-service
      image: myorg/order-service:1.2.0
      ports:
        - containerPort: 50051
    # Istio injects envoy sidecar here automatically
```

**Istio দিয়ে traffic policy:**

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: order-service
spec:
  hosts:
    - order-service
  http:
    - route:
        - destination:
            host: order-service
            subset: v1
          weight: 90
        - destination:
            host: order-service
            subset: v2
          weight: 10 # canary: 10% to v2
```

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: order-service
spec:
  host: order-service
  trafficPolicy:
    connectionPool:
      http:
        h2UpgradePolicy: UPGRADE # HTTP/2 for gRPC
    outlierDetection:
      consecutiveErrors: 5
      interval: 30s
      baseEjectionTime: 30s # circuit breaker: eject failing instances
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

Application canary routing বা circuit breaking সম্পর্কে কিছুই জানে না — Envoy এটা সামলায়।

## Health Check Convention

Service-দের এমন health check expose করতে হবে যা discovery system query করতে পারে:

**gRPC Health Check Protocol:**

```typescript
import { HealthImplementation } from 'grpc-health-check';

const healthImpl = new HealthImplementation({
	'': ServingStatus.SERVING,
	'order.v1.OrderService': ServingStatus.SERVING
});

// Update when service degrades
async function checkDatabaseHealth() {
	try {
		await db.query('SELECT 1');
		healthImpl.setStatus('order.v1.OrderService', ServingStatus.SERVING);
	} catch {
		healthImpl.setStatus('order.v1.OrderService', ServingStatus.NOT_SERVING);
	}
}

setInterval(checkDatabaseHealth, 10_000);
```

**HTTP health check (non-gRPC service-এর জন্য):**

```typescript
app.get('/health/ready', async (req, res) => {
	try {
		await Promise.all([db.query('SELECT 1'), redis.ping()]);
		res.json({ status: 'ready' });
	} catch (err) {
		res.status(503).json({ status: 'not ready', error: err.message });
	}
});

app.get('/health/live', (req, res) => {
	res.json({ status: 'alive' });
});
```

`/health/live` — process কি চলছে? Crash হওয়া pod restart করতে Kubernetes এটা ব্যবহার করে।
`/health/ready` — service কি traffic নিতে পারবে? request route করতে service discovery এটা ব্যবহার করে।

## Zero-Downtime Deploy

"পুরনো instance বন্ধ হয়" আর "নতুন instance ready হয়" — এর মাঝের মুহূর্তটাই যখন discovery ভুল হয়ে যায়।

```yaml
# Kubernetes deployment with readiness gate
spec:
  strategy:
    rollingUpdate:
      maxSurge: 1 # spin up 1 new pod before killing old
      maxUnavailable: 0 # never kill before replacement is ready
  template:
    spec:
      containers:
        - readinessProbe:
            grpc:
              port: 50051
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
          lifecycle:
            preStop:
              exec:
                command: ['sleep', '5'] # wait for LB to deregister before SIGTERM
```

`preStop` sleep নিশ্চিত করে যে process SIGTERM পাওয়ার আগে Kubernetes-এর হাতে service endpoint থেকে pod সরানোর সময় থাকে। এটা ছাড়া: একটা সংক্ষিপ্ত window থাকে যখন LB এখনো একটা বন্ধ হতে থাকা pod-এ route করে।
