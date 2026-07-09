---
title: 'GitOps & Deployments'
subtitle: 'ArgoCD, Helm, Argo Rollouts দিয়ে progressive delivery — cluster state as code, automated sync, এবং এমন deployment যা নীরবে ভুল হয়ে যেতে পারে না।'
chapter: 5
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['GitOps', 'ArgoCD', 'Helm', 'Argo Rollouts', 'canary', 'blue-green', 'CD']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা version-controlled বিল্ডিং ব্লুপ্রিন্ট: ভল্টে রাখা ব্লুপ্রিন্ট (git)-ই সবসময় source of truth। কোনো contractor যখনই বিল্ডিংয়ে অননুমোদিত পরিবর্তন আনে (cluster drift), সিস্টেম সেটা ধরে ফেলে এবং ব্লুপ্রিন্টে ফিরিয়ে নেয়। বৈধ কোনো পরিবর্তন করতে হলে আপনি ব্লুপ্রিন্ট আপডেট করেন — সরাসরি বিল্ডিং নয়। ArgoCD হলো সেই সিস্টেম যা এটা enforce করে।

</Callout>

## GitOps Principles

1. **Declarative** — desired state ফাইলে বর্ণিত (YAML manifest, Helm chart)
2. **Versioned** — সব state git-এ সংরক্ষিত; প্রতিটা পরিবর্তন একটা commit
3. **Pulled** — ক্লাস্টারের ভেতরের একটা controller git থেকে pull করে (CI থেকে push করার বদলে)
4. **Reconciled** — controller ক্রমাগত নিশ্চিত করে যে cluster state git-এর সাথে মেলে

সুবিধা:

- Cluster state সবসময় git-এ — বিনামূল্যে audit log
- একটা deployment রোলব্যাক করা = `git revert`
- Drift অটোমেটিক ধরা পড়ে এবং ঠিক হয়
- CI/CD pipeline থেকে kubectl access লাগে না (attack surface কমে)

## Helm

Helm হলো Kubernetes-এর একটা package manager — template + values ফাইল = rendered manifest।

```
my-chart/
  Chart.yaml           # chart metadata
  values.yaml          # default values
  values-production.yml # environment overrides
  templates/
    deployment.yaml
    service.yaml
    ingress.yaml
    _helpers.tpl       # reusable template snippets
```

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: { { include "order-service.fullname" . } }
  labels: { { - include "order-service.labels" . | nindent 4 } }
spec:
  replicas: { { .Values.replicaCount } }
  template:
    spec:
      containers:
        - name: { { .Chart.Name } }
          image: '{{ .Values.image.repository }}:{{ .Values.image.tag }}'
          resources: { { - toYaml .Values.resources | nindent 12 } }
```

```yaml
# values.yaml
replicaCount: 2
image:
  repository: myorg/order-service
  tag: latest

resources:
  requests:
    memory: 256Mi
    cpu: 250m
  limits:
    memory: 512Mi
    cpu: 1000m
```

```yaml
# values-production.yaml — override for production
replicaCount: 5
image:
  tag: '1.2.0' # pin exact version in production

resources:
  requests:
    memory: 512Mi
    cpu: 500m
```

```bash
# Install
helm install order-service ./my-chart \
  -f values.yaml \
  -f values-production.yaml \
  -n production

# Upgrade
helm upgrade order-service ./my-chart \
  -f values.yaml \
  -f values-production.yaml \
  -n production

# Rollback
helm rollback order-service 2 -n production  # rollback to revision 2

# List releases
helm list -n production
```

## ArgoCD

ArgoCD একটা git repo watch করে এবং নিশ্চিত করে যে ক্লাস্টার তার সাথে মেলে। যেকোনো git commit একটা sync ট্রিগার করে।

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Get initial admin password
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d

# Access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

**Application definition:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: order-service
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/myorg/k8s-config
    targetRevision: main
    path: apps/order-service
    helm:
      valueFiles:
        - values.yaml
        - values-production.yaml

  destination:
    server: https://kubernetes.default.svc
    namespace: production

  syncPolicy:
    automated:
      prune: true # delete resources removed from git
      selfHeal: true # revert manual changes to cluster
    syncOptions:
      - CreateNamespace=true
```

`automated.selfHeal: true` থাকলে, যেকোনো ম্যানুয়াল `kubectl apply` বা `kubectl edit` সঙ্গে সঙ্গে git-এর সাথে মেলাতে revert হয়ে যায়। Cluster state পুরোপুরি git দিয়ে নিয়ন্ত্রিত।

**ArgoCD ApplicationSet** — একই app একাধিক cluster/environment-এ deploy করুন:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: order-service
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - cluster: staging
            url: https://staging.k8s.example.com
            values_file: values-staging.yaml
          - cluster: production
            url: https://production.k8s.example.com
            values_file: values-production.yaml
  template:
    metadata:
      name: 'order-service-{{cluster}}'
    spec:
      source:
        repoURL: https://github.com/myorg/k8s-config
        path: apps/order-service
        helm:
          valueFiles:
            - values.yaml
            - '{{values_file}}'
      destination:
        server: '{{url}}'
        namespace: production
```

## Progressive Delivery with Argo Rollouts

স্ট্যান্ডার্ড Kubernetes rolling update বাইনারি — আপনি হয় পুরনো নয় নতুনে। Argo Rollouts এর সাথে যোগ করে:

- **Canary** — নতুন version-এ X% traffic পাঠান, metric দেখুন, ধীরে ধীরে বাড়ান
- **Blue-green** — দুই version একসাথে চালান, atomic-ভাবে traffic switch করুন

```bash
kubectl apply -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
```

**analysis সহ Canary:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: order-service
  namespace: production
spec:
  replicas: 5
  strategy:
    canary:
      steps:
        - setWeight: 10 # send 10% to new version
        - pause: { duration: 10m } # wait 10 minutes
        - analysis:
            templates:
              - templateName: success-rate
        - setWeight: 30
        - pause: { duration: 10m }
        - setWeight: 60
        - pause: { duration: 10m }
        - setWeight: 100 # fully roll out

      canaryService: order-service-canary
      stableService: order-service-stable

  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
        - name: order-service
          image: myorg/order-service:1.2.0
```

```yaml
# AnalysisTemplate — query Prometheus, abort if error rate too high
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
  namespace: production
spec:
  metrics:
    - name: success-rate
      interval: 1m
      successCondition: result[0] >= 0.99 # 99%+ success rate
      failureLimit: 3
      provider:
        prometheus:
          address: http://prometheus:9090
          query: |
            sum(rate(http_requests_total{
              job="order-service",
              status!~"5.."
            }[5m])) /
            sum(rate(http_requests_total{
              job="order-service"
            }[5m]))
```

analysis ফেইল করলে: Argo Rollouts অটোমেটিক রোলব্যাক করে। কোনো মানুষের হস্তক্ষেপ লাগে না।

```bash
# Watch rollout progress
kubectl argo rollouts get rollout order-service -n production --watch

# Manually abort
kubectl argo rollouts abort order-service -n production

# Manually promote (skip pause)
kubectl argo rollouts promote order-service -n production
```

## CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and push image
        run: |
          docker build -t myorg/order-service:${{ github.sha }} .
          docker push myorg/order-service:${{ github.sha }}

      # Update the image tag in the GitOps repo
      - name: Update image tag
        run: |
          git clone https://x-token:${{ secrets.GITOPS_TOKEN }}@github.com/myorg/k8s-config
          cd k8s-config

          # Update the tag in values file
          sed -i "s/tag: .*/tag: \"${{ github.sha }}\"/" apps/order-service/values-production.yaml

          git config user.email "ci@myorg.com"
          git config user.name "CI"
          git commit -am "deploy order-service ${{ github.sha }}"
          git push

      # ArgoCD detects the git change and syncs automatically
```

CI pipeline কখনো সরাসরি `kubectl` বা ক্লাস্টার স্পর্শ করে না। এটা শুধু git আপডেট করে। বাকিটা ArgoCD সামলায়। এর মানে:

- CI-এর cluster credential লাগে না
- প্রতিটা deploy একটা git commit (পূর্ণ audit log)
- Rollback = `git revert` + ArgoCD sync করে
