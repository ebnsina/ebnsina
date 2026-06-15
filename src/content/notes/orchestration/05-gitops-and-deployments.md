---
title: "GitOps & Deployments"
subtitle: "ArgoCD, Helm, progressive delivery with Argo Rollouts — cluster state as code, automated sync, and deployments that can't silently go wrong."
chapter: 5
level: "intermediate"
readingTime: "10 min"
topics: ["GitOps", "ArgoCD", "Helm", "Argo Rollouts", "canary", "blue-green", "CD"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A version-controlled building blueprint: the blueprint in the vault (git) is always the source of truth. Any time a contractor makes an unauthorized change to the building (cluster drift), the system detects it and reverts to the blueprint. To make a legitimate change, you update the blueprint — not the building directly. ArgoCD is the system that enforces this.

</Callout>

## GitOps Principles

1. **Declarative** — desired state described in files (YAML manifests, Helm charts)
2. **Versioned** — all state stored in git; every change is a commit
3. **Pulled** — a controller in the cluster pulls from git (vs pushing from CI)
4. **Reconciled** — the controller continuously ensures cluster state matches git

Benefits:
- Cluster state is always in git — audit log for free
- Roll back a deployment = `git revert`
- Drift is detected and corrected automatically
- No kubectl access needed from CI/CD pipelines (reduced attack surface)

## Helm

Helm is a package manager for Kubernetes — templates + values files = rendered manifests.

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
  name: {{ include "order-service.fullname" . }}
  labels:
    {{- include "order-service.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
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
  tag: "1.2.0"    # pin exact version in production

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

ArgoCD watches a git repo and ensures the cluster matches. Any git commit triggers a sync.

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
      prune: true       # delete resources removed from git
      selfHeal: true    # revert manual changes to cluster
    syncOptions:
      - CreateNamespace=true
```

With `automated.selfHeal: true`, any manual `kubectl apply` or `kubectl edit` is immediately reverted to match git. Cluster state is fully controlled by git.

**ArgoCD ApplicationSet** — deploy the same app to multiple clusters/environments:
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
      name: "order-service-{{cluster}}"
    spec:
      source:
        repoURL: https://github.com/myorg/k8s-config
        path: apps/order-service
        helm:
          valueFiles:
            - values.yaml
            - "{{values_file}}"
      destination:
        server: "{{url}}"
        namespace: production
```

## Progressive Delivery with Argo Rollouts

Standard Kubernetes rolling updates are binary — you're either on old or new. Argo Rollouts adds:
- **Canary** — send X% of traffic to new version, watch metrics, gradually increase
- **Blue-green** — run both versions simultaneously, switch traffic atomically

```bash
kubectl apply -n argo-rollouts \
  -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
```

**Canary with analysis:**
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
        - setWeight: 10     # send 10% to new version
        - pause: {duration: 10m}   # wait 10 minutes
        - analysis:
            templates:
              - templateName: success-rate
        - setWeight: 30
        - pause: {duration: 10m}
        - setWeight: 60
        - pause: {duration: 10m}
        - setWeight: 100   # fully roll out

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
      successCondition: result[0] >= 0.99   # 99%+ success rate
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

If the analysis fails: Argo Rollouts automatically rolls back. No human intervention.

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

The CI pipeline never touches `kubectl` or the cluster directly. It only updates git. ArgoCD handles the rest. This means:
- CI doesn't need cluster credentials
- Every deploy is a git commit (full audit log)
- Rollback = `git revert` + ArgoCD syncs

