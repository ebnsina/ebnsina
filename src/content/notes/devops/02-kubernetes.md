---
title: 'Kubernetes Essentials'
subtitle: 'Pods, Deployments, Services — the core building blocks of container orchestration at scale.'
chapter: 2
level: 'beginner'
readingTime: '16 min'
topics: ['Kubernetes', 'pods', 'deployments', 'services']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## Why Kubernetes?

Docker runs containers on one machine. Kubernetes runs containers across a cluster of machines, handling:

- **Scheduling**: which node should this container run on?
- **Scaling**: run 10 copies when traffic spikes, scale down when it drops
- **Self-healing**: if a container dies, restart it automatically
- **Service discovery**: containers find each other by name, not IP
- **Rolling updates**: deploy new versions with zero downtime

<Callout type="info">

**Real-World Analogy**

Like a warehouse floor manager — they decide which worker (pod) handles which task, replace workers who call in sick (restarts failed pods), and hire temps during busy season (auto-scaling).

</Callout>

## Core Concepts

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

## A Complete Example

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

## How Traffic Flows

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

**Always set resource requests AND limits.** Without them, a single pod can consume all resources on a node and starve other pods. Requests guarantee a minimum; limits set the ceiling.

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

**You don't always need Kubernetes.** For a single service or small team, a managed platform (Railway, Fly.io, Cloud Run) or even a single server with Docker Compose is simpler. Kubernetes shines at 10+ services with complex networking, scaling, and deployment requirements.

</Callout>

## Key Takeaways

1. **Pods are ephemeral** — design your app to handle restarts (stateless, externalize state)
2. **Deployments manage replicas** and handle rolling updates with zero downtime
3. **Services provide stable endpoints** — pods come and go, the service name stays the same
4. **Set resource requests/limits** on every container to prevent resource starvation
