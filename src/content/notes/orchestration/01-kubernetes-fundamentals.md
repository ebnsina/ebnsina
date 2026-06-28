---
title: 'Kubernetes Fundamentals'
subtitle: 'Pods, deployments, services, and the control loop — what Kubernetes actually does and the primitives that everything else is built on.'
chapter: 1
level: 'beginner'
readingTime: '10 min'
topics: ['Kubernetes', 'pods', 'deployments', 'services', 'control loop', 'kubectl']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A self-correcting factory floor: you tell the factory manager "I need 3 welding robots running at all times." You don't specify which robots or how to restart them when they break — the manager handles that. If a robot fails, it's replaced automatically. If you need 5, you update the number and the manager figures out the rest. Kubernetes is that factory manager for containers.

</Callout>

## The Control Loop

Everything in Kubernetes follows the same pattern:

```
Desired state (what you declared) → Controller watches → Actual state
                    ↑                                          |
                    └── Controller reconciles ←────────────────┘
```

You declare what you want (3 replicas of order-service). Controllers continuously compare desired state to actual state and make changes to close the gap. A pod crashes → actual state drops to 2 → controller creates a new pod → actual state returns to 3.

This is declarative: you describe the outcome, not the steps.

## Core Objects

**Pod:** the smallest deployable unit. One or more containers sharing network and storage. Containers in a pod communicate via `localhost`.

```yaml
# Pods are rarely created directly — use Deployments
apiVersion: v1
kind: Pod
metadata:
  name: order-service
  labels:
    app: order-service
spec:
  containers:
    - name: order-service
      image: myorg/order-service:1.2.0
      ports:
        - containerPort: 3000
      env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: order-service-secrets
              key: database_url
      resources:
        requests:
          memory: '128Mi'
          cpu: '100m'
        limits:
          memory: '256Mi'
          cpu: '500m'
```

**Deployment:** manages a ReplicaSet which manages Pods. Handles rolling updates and rollbacks.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1 # create 1 extra pod before killing old
      maxUnavailable: 0 # never go below desired replicas during update
  template:
    metadata:
      labels:
        app: order-service
        version: '1.2.0'
    spec:
      containers:
        - name: order-service
          image: myorg/order-service:1.2.0
          ports:
            - containerPort: 3000
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          resources:
            requests:
              memory: '256Mi'
              cpu: '250m'
            limits:
              memory: '512Mi'
              cpu: '1000m'
          lifecycle:
            preStop:
              exec:
                command: ['sleep', '5']
      terminationGracePeriodSeconds: 35
```

**Service:** stable network endpoint for a set of pods. Pods come and go with new IPs; the Service IP stays constant.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  selector:
    app: order-service # routes to pods with this label
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP # internal only
```

Service types:

- `ClusterIP` — internal cluster IP only (default)
- `NodePort` — exposes on a static port on every node
- `LoadBalancer` — provisions cloud load balancer (AWS ALB, GCP LB)

## Namespaces

Namespaces partition the cluster into virtual sub-clusters. Resources in different namespaces are isolated (different RBAC, resource quotas, network policies).

```bash
kubectl create namespace production
kubectl create namespace staging

# Deploy to a specific namespace
kubectl apply -f deployment.yml -n production
```

## Essential kubectl

```bash
# Context and cluster
kubectl config get-contexts
kubectl config use-context k3s-production

# Get resources
kubectl get pods -n production
kubectl get deployments -n production
kubectl get services -n production
kubectl get all -n production   # everything

# Inspect
kubectl describe pod order-service-7d4b5-xyz -n production
kubectl logs order-service-7d4b5-xyz -n production --tail=100 -f
kubectl exec -it order-service-7d4b5-xyz -n production -- sh

# Apply and delete
kubectl apply -f deployment.yml
kubectl delete -f deployment.yml

# Rollouts
kubectl rollout status deployment/order-service -n production
kubectl rollout history deployment/order-service -n production
kubectl rollout undo deployment/order-service -n production        # rollback
kubectl rollout undo deployment/order-service --to-revision=3 -n production

# Scale
kubectl scale deployment order-service --replicas=5 -n production

# Port-forward for debugging
kubectl port-forward pod/order-service-7d4b5-xyz 3000:3000 -n production
```

## ConfigMaps and Secrets

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service-config
  namespace: production
data:
  LOG_LEVEL: 'info'
  QUEUE_CONCURRENCY: '10'
  FEATURE_NEW_CHECKOUT: 'true'
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: order-service-secrets
  namespace: production
type: Opaque
data:
  # base64-encoded values (echo -n "value" | base64)
  database_url: cG9zdGdyZXM6Ly8...
  jwt_secret: c2VjcmV0...
```

Reference in pods:

```yaml
spec:
  containers:
    - name: order-service
      envFrom:
        - configMapRef:
            name: order-service-config
      env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: order-service-secrets
              key: database_url
```

**Don't commit Secrets to git.** Use Sealed Secrets, External Secrets Operator, or Vault to manage them. Base64 is not encryption.

## Resource Requests and Limits

`requests` — what the pod is guaranteed. Scheduler uses this to find a node with enough capacity.
`limits` — the maximum a pod can use. Container is OOMKilled if it exceeds memory limit.

```yaml
resources:
  requests:
    memory: '256Mi'
    cpu: '250m' # 250 millicores = 0.25 CPU cores
  limits:
    memory: '512Mi'
    cpu: '1000m' # 1 full core
```

**Memory:** always set limits. An OOM-killed pod restarts; an OOM node evicts everything.

**CPU:** limits throttle the container if it exceeds the limit (it doesn't get killed). Setting CPU limits too low causes latency. Many teams set CPU requests but not limits — lets the pod burst while still scheduling correctly.

## Ingress

Routes external traffic to services:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: production
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: '10m'
    cert-manager.io/cluster-issuer: 'letsencrypt-prod'
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls-cert
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /api/orders
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 80
          - path: /api/products
            pathType: Prefix
            backend:
              service:
                name: product-service
                port:
                  number: 80
```

Requires an ingress controller (nginx-ingress) installed on the cluster. cert-manager automatically provisions and renews Let's Encrypt certificates.

## Labels and Selectors

Labels are key-value pairs on any resource. Selectors filter resources by labels. The entire Kubernetes scheduling and routing model depends on labels.

```bash
# Find pods by label
kubectl get pods -l app=order-service -n production
kubectl get pods -l app=order-service,version=1.2.0 -n production

# Add a label to a running pod (for debugging)
kubectl label pod order-service-7d4b5-xyz debug=true -n production

# Remove a pod from a Service (stop routing to it without killing)
kubectl label pod order-service-7d4b5-xyz app=order-service-debug --overwrite -n production
# Service selector no longer matches — this pod gets no traffic
# Use this to debug a single instance under real conditions
```
