---
title: 'Kubernetes Workloads'
subtitle: 'StatefulSets, DaemonSets, Jobs, CronJobs — প্রতি শ্রেণির workload-এর জন্য সঠিক object এবং কখন Deployment যথেষ্ট নয়।'
chapter: 3
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'Kubernetes', 'workloads']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা ব্যবসার staffing মডেল: একটা Deployment হলো অনেকটা এক পুল identical customer service rep-এর মতো — যেকেউ যেকোনো কল সামলাতে পারে। একটা StatefulSet হলো accounting ডিপার্টমেন্টের মতো — প্রত্যেকের একটা নির্দিষ্ট ডেস্ক, নিজের ফাইল আছে, এবং যাকে-তাকে দিয়ে বদলানো যায় না। একটা DaemonSet হলো বিল্ডিং সিকিউরিটির মতো — প্রতি ফ্লোরে ঠিক একজন গার্ড। একটা Job হলো একটা নির্দিষ্ট কাজের জন্য ভাড়া করা contractor-এর মতো, কাজ শেষে বিদায়।

</Callout>

## গল্পে বুঝি

সমরকন্দের এক বিশাল হোটেল চালান ফাতিমা। ঘর পরিষ্কারের জন্য তাঁর একটা দল আছে — সবাই একই রকম প্রশিক্ষিত, যেকেউ যেকোনো ঘর সাফ করতে পারে। ফাতিমা কারও নাম মনে রাখেন না, শুধু নিয়ম একটাই — "প্রতি শিফটে দশজন হাজির থাকবে।" কেউ ছুটি নিলে আরেকজন এসে জায়গা নেয়, কোনো তফাত পড়ে না। কিন্তু লবিতে কনসিয়ার্জ ডেস্কগুলো আলাদা ব্যাপার — ডেস্ক-১, ডেস্ক-২, ডেস্ক-৩, প্রত্যেকের নির্দিষ্ট নাম, নির্দিষ্ট ক্রম, আর প্রত্যেকের নিজের একটা অতিথি-খাতা। ডেস্ক-২-এর কর্মী ছুটিতে গেলে নতুন যে আসে সে-ও "ডেস্ক-২" নামেই বসে আর ঠিক সেই একই অতিথি-খাতা হাতে নেয় — ক্রম আর পরিচয় বদলায় না।

এদিকে নিরাপত্তার জন্য প্রতি তলায় ঠিক একজন করে ফ্লোর-গার্ড — যত তলা, তত গার্ড, একটাও কম নয় বেশি নয়। আবার খোয়ারিজমির মেয়ের বিয়ের অনুষ্ঠানে ফাতিমা একজন ক্যাটারার ভাড়া করলেন শুধু সেই একটা দিনের জন্য — খাবার পরিবেশন শেষ, কাজ শেষ, বিদায়, আর ফিরে আসার দরকার নেই। আর হোটেলের করিডোর ঝকঝকে রাখতে প্রতি রাত দুটোয় নিয়ম করে আসেন এক রাত-পরিষ্কারক — প্রতিদিন একই সময়ে, ঘড়ি ধরে।

এই হোটেলই আসলে Kubernetes-এর workload-এর গল্প। বদলে-ফেলা-যায় এমন ঘর-পরিষ্কারের দল হলো **Deployment** — নাম-পরিচয়হীন একগাদা replica, শুধু "কতজন চাই" সেটাই আসল। নাম-ক্রম-নিজের খাতাওয়ালা কনসিয়ার্জ ডেস্কগুলো হলো **StatefulSet** — স্থিতিশীল identity আর প্রতি pod-এর নিজস্ব storage (যেমন database, Kafka)। প্রতি তলায় একজন গার্ড হলো **DaemonSet** — প্রতি node-এ ঠিক একটা pod (যেমন log shipper, monitoring agent)। একবারের ক্যাটারার হলো **Job** — কাজ শেষ হলেই থেমে যায়, রিস্টার্ট হয় না (যেমন database migration)। আর প্রতি রাত দুটোর রাত-পরিষ্কারক হলো **CronJob** — schedule মেনে বারবার চলা Job (যেমন nightly backup)।

## Deployment (Stateless)

stateless service-এর জন্য স্ট্যান্ডার্ড workload। যেকোনো pod অন্য যেকোনো pod-কে রিপ্লেস করতে পারে — কোনো identity লাগে না, persistent storage লাগে না।

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

Deployment-এর pod-গুলো এলোমেলো নাম পায়: `order-service-7d4b5-abc`, `order-service-7d4b5-xyz`। রিস্টার্ট হলে নাম বদলে যায়।

## StatefulSet (Stateful Workloads)

StatefulSet pod-গুলোকে স্থিতিশীল identity দেয় — অনুমেয় নাম, স্থিতিশীল network ID, এবং প্রতি pod-এর জন্য ডেডিকেটেড persistent storage।

```
postgres-0   → /data/postgres-0  (its own PVC, always)
postgres-1   → /data/postgres-1
postgres-2   → /data/postgres-2
```

`postgres-1` ডিলিট হলে Kubernetes সেটাকে আবার `postgres-1` হিসেবেই তৈরি করে, একই PVC অ্যাটাচ করে। pod-এর identity স্থিতিশীল থাকে।

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: production
spec:
  serviceName: postgres # headless service — required for stable DNS
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
  volumeClaimTemplates: # creates one PVC per pod
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: longhorn
        resources:
          requests:
            storage: 50Gi
```

প্রতি pod-এ স্থিতিশীল DNS-এর জন্য Headless Service:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: production
spec:
  clusterIP: None # headless — no VIP, returns individual pod IPs
  selector:
    app: postgres
  ports:
    - port: 5432
```

এর সাথে, pod-গুলো DNS দিয়ে reachable হয়:

```
postgres-0.postgres.production.svc.cluster.local
postgres-1.postgres.production.svc.cluster.local
postgres-2.postgres.production.svc.cluster.local
```

StatefulSet ব্যবহার করুন এসবের জন্য: database, Kafka broker, ZooKeeper, Redis Cluster, Elasticsearch node।

## DaemonSet

নিশ্চিত করে যে প্রতিটা node-এ (বা selector-এর সাথে মেলে এমন প্রতিটা node-এ) ঠিক একটা pod চলছে। node-level service-এর জন্য ব্যবহৃত হয়।

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
        - key: node-role.kubernetes.io/control-plane # also run on control-plane nodes
          effect: NoSchedule
          operator: Exists
      containers:
        - name: promtail
          image: grafana/promtail:latest
          args: ['-config.file=/etc/promtail/config.yml']
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

DaemonSet ব্যবহার করুন এসবের জন্য: log shipper (Promtail, Fluentd), monitoring agent (node-exporter), network plugin, storage daemon (Longhorn engine)।

## Job

একটা task সম্পূর্ণ হওয়া পর্যন্ত চালায়। Deployment-এর বিপরীতে, pod সফলভাবে শেষ হলে সেটা শেষ হয়েই থাকে — রিস্টার্ট হয় না।

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
  namespace: production
spec:
  backoffLimit: 3 # retry up to 3 times on failure
  activeDeadlineSeconds: 300 # fail if not done in 5 minutes
  template:
    spec:
      restartPolicy: OnFailure # Never or OnFailure (not Always)
      containers:
        - name: migrate
          image: myorg/order-service:1.2.0
          command: ['node', 'dist/migrate.js']
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

**Parallel Jobs** — একটা workload parallel-ভাবে প্রসেস করুন:

```yaml
spec:
  completions: 100 # run 100 total completions
  parallelism: 10 # run 10 at a time
```

Job ব্যবহার করুন এসবের জন্য: database migration, batch processing, একবারের data import, backup।

## CronJob

একটা schedule অনুযায়ী একটা Job চালায়:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: daily-report
  namespace: production
spec:
  schedule: '0 6 * * *' # 6am every day (UTC)
  timeZone: 'America/New_York' # Kubernetes 1.27+
  concurrencyPolicy: Forbid # don't run if previous run is still going
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
              command: ['node', 'dist/generate-report.js']
              env:
                - name: REPORT_DATE
                  value: 'yesterday'
```

`concurrencyPolicy`:

- `Allow` — আগেরটা এখনো চললেও নতুন একটা রান শুরু করে
- `Forbid` — আগেরটা এখনো চললে নতুন রান স্কিপ করে
- `Replace` — আগের রান থামিয়ে নতুন একটা শুরু করে

CronJob ব্যবহার করুন এসবের জন্য: daily report, scheduled cleanup, periodic health check, nightly backup।

## Init Containers

main container শুরু হওয়ার আগে চলে। উপযোগী এসবের জন্য: dependency-র জন্য অপেক্ষা করা, app শুরুর আগে migration চালানো, config ফাইল কপি করা।

```yaml
spec:
  initContainers:
    - name: wait-for-db
      image: busybox
      command: ['sh', '-c', 'until nc -z postgres 5432; do echo waiting; sleep 2; done']

    - name: run-migrations
      image: myorg/order-service:1.2.0
      command: ['node', 'dist/migrate.js']
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

Init container-গুলো ক্রম অনুযায়ী চলে। একটা ফেইল করলে Kubernetes আবার চেষ্টা করে (pod-এর `restartPolicy` অনুযায়ী)। সব init container সফলভাবে শেষ না হওয়া পর্যন্ত main container শুরু হয় না।

## Horizontal Pod Autoscaler

metric-এর উপর ভিত্তি করে Deployment অটোমেটিক স্কেল করুন:

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
          averageUtilization: 70 # scale when avg CPU > 70%
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

HPA-র জন্য container-এ `requests` সেট থাকা লাগে — baseline না জানলে সে utilization হিসাব করতে পারে না।

## Pod Disruption Budget

voluntary disruption-এর সময় (node drain, cluster upgrade) একটা ন্যূনতম সংখ্যক pod available রাখা নিশ্চিত করে:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: order-service-pdb
  namespace: production
spec:
  minAvailable: 2 # at least 2 pods must be available
  # OR:
  # maxUnavailable: 1   # at most 1 pod can be down
  selector:
    matchLabels:
      app: order-service
```

PDB থাকলে: `kubectl drain` এমন pod evict করবে না যদি তাতে budget লঙ্ঘিত হয়। replacement তৈরি না হওয়া পর্যন্ত সে অপেক্ষা করে।
