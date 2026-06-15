---
title: "Service Discovery"
subtitle: "How services find each other — DNS-based discovery, Consul, client-side vs server-side load balancing, and health-integrated routing."
chapter: 3
level: "intermediate"
readingTime: "10 min"
topics: ["service discovery", "Consul", "DNS", "health checks", "service mesh", "Envoy"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A company directory vs a receptionist: the directory lists everyone's extension — you look it up and call directly (client-side discovery). The receptionist knows who's in today, routes your call to someone available, and handles transfers when someone's out (server-side discovery). The receptionist adds a step but shields you from needing to know who's at their desk.

</Callout>

## The Problem

In a monolith, calling a function is just a pointer dereference. In microservices, calling a service requires:
1. Knowing its current IP and port
2. Knowing which instances are healthy
3. Deciding which instance to call (load balancing)

These can't be hardcoded — containers restart with new IPs, instances scale in and out, deployments replace instances.

## DNS-Based Discovery

The simplest approach: each service has a stable DNS name that resolves to one or more IPs.

**In Kubernetes:** every Service gets a stable DNS name automatically.
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

Within the cluster:
```
order-service.production.svc.cluster.local:50051
# Or just:
order-service:50051  (within same namespace)
```

Kubernetes DNS resolves this to the ClusterIP, which routes to any healthy pod. No service registry needed — Kubernetes is the registry.

**Outside Kubernetes:** use Route 53 or any DNS server with health checks.
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

**TTL matters:** short TTL (30s) means clients discover failures quickly. Long TTL (5min) means stale DNS after a deploy. Keep internal DNS TTL at 10-30s.

## Consul

Consul is a purpose-built service registry with health checks, KV store, and service mesh capabilities.

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

**Querying Consul:**
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
    passing: true,   // only healthy instances
  });

  if (services.length === 0) throw new Error(`No healthy instances of ${name}`);

  // Simple round-robin
  const instance = services[Math.floor(Math.random() * services.length)];
  const { Address, Port } = instance.Service;
  return `${Address}:${Port}`;
}

const orderServiceAddr = await discoverService('order-service');
const client = createClient(OrderService, createGrpcTransport({
  baseUrl: `https://${orderServiceAddr}`,
}));
```

## Client-Side vs Server-Side Load Balancing

**Server-side (traditional):**
```
Client → Load Balancer → [picks instance] → Service instance
```

The LB has all the knowledge. Clients just call a single stable address.

**Client-side:**
```
Client → Consul (get all instances) → Client picks one → Service instance
```

The client does its own load balancing. More complex, but no LB bottleneck, and smarter routing (client can retry on a different instance automatically).

gRPC with a service registry naturally uses client-side load balancing — the gRPC runtime resolves the name to multiple addresses and balances across them:

```typescript
// gRPC client-side LB with multiple addresses
const transport = createGrpcTransport({
  baseUrl: 'https://order-service:50051',
  // The resolver queries Consul and returns all instance addresses
  // gRPC runtime round-robins across them
});
```

## Service Mesh with Envoy/Istio

A service mesh moves all service discovery, load balancing, retries, circuit breaking, and mTLS into a sidecar proxy (Envoy). Application code just calls `localhost:50051` — the sidecar intercepts and handles everything.

```yaml
# Kubernetes: Istio injects Envoy automatically
apiVersion: v1
kind: Pod
metadata:
  name: order-service
  annotations:
    sidecar.istio.io/inject: "true"
spec:
  containers:
    - name: order-service
      image: myorg/order-service:1.2.0
      ports:
        - containerPort: 50051
    # Istio injects envoy sidecar here automatically
```

**Traffic policy with Istio:**
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
          weight: 10     # canary: 10% to v2
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
        h2UpgradePolicy: UPGRADE   # HTTP/2 for gRPC
    outlierDetection:
      consecutiveErrors: 5
      interval: 30s
      baseEjectionTime: 30s        # circuit breaker: eject failing instances
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

The application knows nothing about canary routing or circuit breaking — Envoy handles it.

## Health Check Conventions

Services must expose health checks that discovery systems can query:

**gRPC Health Check Protocol:**
```typescript
import { HealthImplementation } from 'grpc-health-check';

const healthImpl = new HealthImplementation({
  '': ServingStatus.SERVING,
  'order.v1.OrderService': ServingStatus.SERVING,
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

**HTTP health check (for non-gRPC services):**
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

`/health/live` — is the process running? Used by Kubernetes to restart crashed pods.
`/health/ready` — can the service take traffic? Used by service discovery to route requests.

## Zero-Downtime Deploys

The moment between "old instance stops" and "new instance is ready" is when discovery goes wrong.

```yaml
# Kubernetes deployment with readiness gate
spec:
  strategy:
    rollingUpdate:
      maxSurge: 1         # spin up 1 new pod before killing old
      maxUnavailable: 0   # never kill before replacement is ready
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
                command: ["sleep", "5"]   # wait for LB to deregister before SIGTERM
```

The `preStop` sleep ensures Kubernetes has time to remove the pod from service endpoints before the process receives SIGTERM. Without it: a brief window where the LB still routes to a pod that's stopping.

