---
title: 'Kubernetes Fundamentals'
subtitle: 'Pods, deployments, services, আর control loop — Kubernetes আসলে কী করে এবং যে primitive-গুলোর উপর বাকি সবকিছু দাঁড়িয়ে।'
chapter: 1
level: 'beginner'
readingTime: '10 মিনিট'
topics: ['Kubernetes', 'pods', 'deployments', 'services', 'control loop', 'kubectl']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা সেল্‌ফ-কারেক্টিং ফ্যাক্টরি ফ্লোর: আপনি ফ্যাক্টরি ম্যানেজারকে বলেন "সবসময় ৩টা welding robot চালু থাকা চাই।" কোন রোবটগুলো বা ভাঙলে কীভাবে রিস্টার্ট করতে হবে সেটা আপনি বলে দেন না — ম্যানেজার সেটা সামলায়। কোনো রোবট ফেইল করলে সেটা অটোমেটিক রিপ্লেস হয়ে যায়। ৫টা লাগলে আপনি সংখ্যাটা আপডেট করেন, বাকিটা ম্যানেজার বুঝে নেয়। container-এর জন্য Kubernetes হলো সেই ফ্যাক্টরি ম্যানেজার।

</Callout>

## The Control Loop

Kubernetes-এর সবকিছু একই প্যাটার্ন অনুসরণ করে:

```
Desired state (what you declared) → Controller watches → Actual state
                    ↑                                          |
                    └── Controller reconciles ←────────────────┘
```

আপনি যা চান সেটা declare করেন (order-service-এর ৩টা replica)। Controller-রা ক্রমাগত desired state আর actual state তুলনা করে এবং ফাঁকটা মিটিয়ে দিতে পরিবর্তন আনে। একটা pod ক্র্যাশ করলো → actual state নেমে ২ হলো → controller নতুন একটা pod তৈরি করলো → actual state আবার ৩-এ ফিরে এলো।

এটাই declarative: আপনি ফলাফল বর্ণনা করেন, ধাপগুলো নয়।

## Core Objects

**Pod:** সবচেয়ে ছোট deployable unit। এক বা একাধিক container যারা network আর storage শেয়ার করে। একটা pod-এর ভেতরের container-রা `localhost` দিয়ে যোগাযোগ করে।

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

**Deployment:** একটা ReplicaSet ম্যানেজ করে যা আবার Pod-গুলো ম্যানেজ করে। rolling update আর rollback সামলায়।

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

**Service:** একদল pod-এর জন্য একটা স্থিতিশীল network endpoint। Pod আসে-যায় নতুন IP নিয়ে; কিন্তু Service IP অপরিবর্তিত থাকে।

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

Service type-গুলো:

- `ClusterIP` — শুধু cluster-এর ভেতরের IP (default)
- `NodePort` — প্রতিটা node-এ একটা static port-এ expose করে
- `LoadBalancer` — cloud load balancer provision করে (AWS ALB, GCP LB)

## Namespaces

Namespace ক্লাস্টারকে ভার্চুয়াল সাব-ক্লাস্টারে ভাগ করে। ভিন্ন namespace-এর resource-গুলো একে অপর থেকে isolated (আলাদা RBAC, resource quota, network policy)।

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

pod-এ reference করা:

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

**Secret কখনো git-এ commit করবেন না।** এগুলো ম্যানেজ করতে Sealed Secrets, External Secrets Operator, বা Vault ব্যবহার করুন। Base64 কোনো encryption নয়।

## Resource Requests and Limits

`requests` — pod-কে যা guaranteed দেওয়া হয়। Scheduler এটা দিয়ে যথেষ্ট capacity আছে এমন একটা node খুঁজে নেয়।
`limits` — একটা pod সর্বোচ্চ যতটা ব্যবহার করতে পারবে। memory limit ছাড়িয়ে গেলে container OOMKilled হয়।

```yaml
resources:
  requests:
    memory: '256Mi'
    cpu: '250m' # 250 millicores = 0.25 CPU cores
  limits:
    memory: '512Mi'
    cpu: '1000m' # 1 full core
```

**Memory:** সবসময় limit সেট করুন। OOM-killed pod রিস্টার্ট হয়; কিন্তু OOM node সবকিছু evict করে দেয়।

**CPU:** limit ছাড়িয়ে গেলে container throttle হয় (kill হয় না)। CPU limit বেশি নিচে রাখলে latency বাড়ে। অনেক টিম CPU request সেট করে কিন্তু limit করে না — এতে pod সঠিকভাবে schedule হওয়ার পরও burst করতে পারে।

## Ingress

external traffic-কে service-এর দিকে route করে:

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

ক্লাস্টারে একটা ingress controller (nginx-ingress) ইনস্টল থাকা লাগে। cert-manager অটোমেটিক Let's Encrypt সার্টিফিকেট provision আর renew করে।

## Labels and Selectors

Label হলো যেকোনো resource-এর উপর key-value pair। Selector label দিয়ে resource ফিল্টার করে। Kubernetes-এর পুরো scheduling আর routing মডেল label-এর উপর নির্ভরশীল।

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
