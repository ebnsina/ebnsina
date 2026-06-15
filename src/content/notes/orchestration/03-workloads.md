---
title: "Kubernetes Workloads"
subtitle: "StatefulSets, DaemonSets, Jobs, CronJobs — the right object for each class of workload and when Deployments aren't enough."
chapter: 3
level: "intermediate"
readingTime: "10 min"
topics: ["StatefulSet", "DaemonSet", "Job", "CronJob", "Kubernetes", "workloads"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A business's staffing model: a Deployment is like a pool of identical customer service reps — any one can handle any call. A StatefulSet is like the accounting department — each person has a specific desk, their own files, and can't be arbitrarily replaced. A DaemonSet is like building security — exactly one guard per floor. A Job is like a contractor hired for one specific task, then let go.

</Callout>

## Deployment (Stateless)

The standard workload for stateless services. Any pod can replace any other pod — no identity, no persistent storage required.

```yaml
# Use for: web servers, API services, workers that process from a queue
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  replicas: 3
  # ...
```

Pods in a Deployment get random names: `order-service-7d4b5-abc`, `order-service-7d4b5-xyz`. Names change on restart.

## StatefulSet (Stateful Workloads)

StatefulSets give pods stable identity — predictable names, stable network IDs, and dedicated persistent storage per pod.

```
postgres-0   → /data/postgres-0  (its own PVC, always)
postgres-1   → /data/postgres-1
postgres-2   → /data/postgres-2
```

If `postgres-1` is deleted, Kubernetes recreates it as `postgres-1` with the same PVC attached. The pod's identity is stable.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: production
spec:
  serviceName: postgres              # headless service — required for stable DNS
  replicas: 3
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16
          env:
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secrets
                  key: password
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
          ports:
            - containerPort: 5432
  volumeClaimTemplates:              # creates one PVC per pod
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: longhorn
        resources:
          requests:
            storage: 50Gi
```

Headless Service for stable DNS per pod:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: production
spec:
  clusterIP: None      # headless — no VIP, returns individual pod IPs
  selector:
    app: postgres
  ports:
    - port: 5432
```

With this, pods are reachable by DNS:
```
postgres-0.postgres.production.svc.cluster.local
postgres-1.postgres.production.svc.cluster.local
postgres-2.postgres.production.svc.cluster.local
```

Use StatefulSets for: databases, Kafka brokers, ZooKeeper, Redis Cluster, Elasticsearch nodes.

## DaemonSet

Ensures exactly one pod runs on every node (or every node matching a selector). Used for node-level services.

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: promtail
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: promtail
  template:
    metadata:
      labels:
        app: promtail
    spec:
      tolerations:
        - key: node-role.kubernetes.io/control-plane   # also run on control-plane nodes
          effect: NoSchedule
          operator: Exists
      containers:
        - name: promtail
          image: grafana/promtail:latest
          args: ["-config.file=/etc/promtail/config.yml"]
          volumeMounts:
            - name: varlog
              mountPath: /var/log
              readOnly: true
            - name: config
              mountPath: /etc/promtail
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: config
          configMap:
            name: promtail-config
```

Use DaemonSets for: log shippers (Promtail, Fluentd), monitoring agents (node-exporter), network plugins, storage daemons (Longhorn engine).

## Job

Runs a task to completion. Unlike a Deployment, when the pod finishes successfully, it stays done — it doesn't restart.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  namespace: production
spec:
  backoffLimit: 3          # retry up to 3 times on failure
  activeDeadlineSeconds: 300   # fail if not done in 5 minutes
  template:
    spec:
      restartPolicy: OnFailure   # Never or OnFailure (not Always)
      containers:
        - name: migrate
          image: myorg/order-service:1.2.0
          command: ["node", "dist/migrate.js"]
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: order-service-secrets
                  key: database_url
```

```bash
# Run a job
kubectl apply -f migration-job.yml

# Watch progress
kubectl get job db-migration -n production -w

# View logs
kubectl logs -l job-name=db-migration -n production

# Clean up after success
kubectl delete job db-migration -n production
```

**Parallel Jobs** — process a workload in parallel:
```yaml
spec:
  completions: 100       # run 100 total completions
  parallelism: 10        # run 10 at a time
```

Use Jobs for: database migrations, batch processing, one-time data imports, backups.

## CronJob

Runs a Job on a schedule:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: daily-report
  namespace: production
spec:
  schedule: "0 6 * * *"        # 6am every day (UTC)
  timeZone: "America/New_York"  # Kubernetes 1.27+
  concurrencyPolicy: Forbid     # don't run if previous run is still going
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: report
              image: myorg/reporting:latest
              command: ["node", "dist/generate-report.js"]
              env:
                - name: REPORT_DATE
                  value: "yesterday"
```

`concurrencyPolicy`:
- `Allow` — start a new run even if previous is still running
- `Forbid` — skip the new run if previous is still running
- `Replace` — stop the previous run and start a new one

Use CronJobs for: daily reports, scheduled cleanup, periodic health checks, nightly backups.

## Init Containers

Run before the main container starts. Useful for: waiting for dependencies, running migrations before the app starts, copying config files.

```yaml
spec:
  initContainers:
    - name: wait-for-db
      image: busybox
      command: ['sh', '-c', 'until nc -z postgres 5432; do echo waiting; sleep 2; done']

    - name: run-migrations
      image: myorg/order-service:1.2.0
      command: ["node", "dist/migrate.js"]
      env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: order-service-secrets
              key: database_url

  containers:
    - name: order-service
      image: myorg/order-service:1.2.0
      # starts only after both init containers succeed
```

Init containers run in order. If one fails, Kubernetes retries (subject to the pod's `restartPolicy`). The main container doesn't start until all init containers complete successfully.

## Horizontal Pod Autoscaler

Scale Deployments automatically based on metrics:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70   # scale when avg CPU > 70%
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

HPA requires `requests` set on containers — it can't calculate utilization without knowing the baseline.

## Pod Disruption Budget

Ensures a minimum number of pods stay available during voluntary disruptions (node drains, cluster upgrades):

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: order-service-pdb
  namespace: production
spec:
  minAvailable: 2       # at least 2 pods must be available
  # OR:
  # maxUnavailable: 1   # at most 1 pod can be down
  selector:
    matchLabels:
      app: order-service
```

With PDB: `kubectl drain` will not evict pods if doing so would violate the budget. It waits until replacements are ready.

