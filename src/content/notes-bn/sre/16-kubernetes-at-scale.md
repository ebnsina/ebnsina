---
title: 'স্কেলে Kubernetes'
subtitle: "1,000+ node cluster, multi-tenancy, RBAC, NetworkPolicy, OPA/Kyverno, GitOps, etcd tuning। যখন 'just run kubectl apply' আর কোনো strategy নয়, তখনকার operating model।"
chapter: 16
level: 'mastery'
readingTime: '30 মিনিট'
topics: ['kubernetes', 'etcd', 'RBAC', 'OPA', 'Kyverno', 'GitOps', 'multi-tenancy', 'scale']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা logistics company যা package স্বয়ংক্রিয়ভাবে route করে — আপনি ঘোষণা করেন জিনিস কোথায় যেতে হবে, system truck-এর হিসাব বের করে।

</Callout>

## গল্পে বুঝি

চট্টগ্রামের এক বিশাল মেগা-পোর্টের অপারেশনস HQ-তে placement chief ইবনে সিনা। দিনে হাজার হাজার শিপিং কন্টেইনার নামে, আর তার কাজ প্রতিটা কন্টেইনারকে এমন একটা yard-এ বসানো যেখানে সত্যিই জায়গা খালি আছে — একটা 40-ফুট কন্টেইনার যদি প্রায় ভরা yard-এ ঠেলে ঢোকানো হয়, বাকি কন্টেইনারগুলোর নামানোই আটকে যায়। তাই সে প্রতিটা কন্টেইনারের মাপ দেখে খালি slot-এ টানটান করে সাজায়, একটুও ফাঁকা নষ্ট না করে। কিন্তু এই স্কেলে একটা ছোট ভুল packing নিয়ম — যেমন প্রতিটা লোডকে দরকারের দ্বিগুণ জায়গা বরাদ্দ দেওয়া — গোটা yard নষ্ট করে দেয়।

ইবনে সিনা তাই প্রতিটা কন্টেইনারের জন্য একটা কড়া space ration ঠিক করে দেয়: তুমি এতটুকু জায়গার বেশি নিতে পারবে না, নাহলে এক অতিকায় লোড তার yard-mate-দের চেপে বের করে দেবে। জাহাজের ভিড় বাড়লে ম্যানেজার আল-খোয়ারিজমি পাশের খালি yard খুলে দেয় আর অতিরিক্ত crane ভাড়া করে আনে; ভিড় কমলে সেগুলো ছেড়ে দেয় যাতে খরচ না বাড়ে। আর পুরো বন্দরটা আসলে একটা নয় — কয়েকটা আলাদা port complex, প্রতিটার নিজের yard আর crane; supervisor ফাতিমা আল-ফিহরি সবগুলোকে একটাই অপারেশন হিসেবে চালান, যাতে এক জায়গায় জট লাগলে জাহাজ অন্য complex-এ পাঠানো যায়।

এই পুরো ছবিটাই স্কেলে Kubernetes চালানো। প্রতিটা কন্টেইনারকে খালি জায়গাওয়ালা yard-এ টানটান করে বসানো হলো **scheduler**-এর pod-কে node-এ **bin-packing** করা। প্রতি কন্টেইনারের কড়া space ration হলো **resource requests আর limits** — যা এক লোভী pod-কে **noisy neighbour** হয়ে বাকি pod-দের CPU/memory চেপে ধরা থেকে ঠেকায়। ভিড় বুঝে yard আর crane যোগ করা-ছাড়া হলো **autoscaling** (node autoscaler ডিমান্ড অনুযায়ী node আনে-ছাড়ে)। আর কয়েকটা port complex-কে এক অপারেশন হিসেবে চালানো হলো **multi-cluster** অপারেশন। বাস্তবে ঠিক এভাবেই hyperscaler-রা কাজ করে — এক oversized request বা ভুল packing নিয়ম হাজার pod-এর fleet-এ শত শত core idle ফেলে রাখে, তাই স্কেলে scheduler আর resource ration-এর ছোট নিয়মটাই সবচেয়ে দামি।

## এই chapter যেখান থেকে শুরু হয়

আপনি `kubectl apply -f` চালিয়েছেন। আপনি request আর limit সেট করেছেন। আপনি Helm ব্যবহার করেছেন। এই chapter সেখান থেকে শুরু হয় যেখানে ওটা শেষ হয়: যখন এক cluster-এ 50+ team, 5,000 namespace, 80,000 pod, আর একটা config-push সেই সবকিছু ধসিয়ে দিতে পারে। এখানকার skill-ই hyperscaler, fintech আর বড় SaaS company-র platform/infra SRE-রা আসলে করে।

## Control plane — আসলে কী চলছে

আপনি যখন "Kubernetes ব্যবহার" করেন, তখন আপনি পাঁচটা process plus etcd-র উপর নির্ভর করেন। প্রতিটা কী করে জানলে "cluster ধীর" একটা অনুমান থেকে একটা diagnosis হয়ে যায়।

```
kube-apiserver         — REST entrypoint. Validates, persists to etcd, serves watches.
kube-controller-manager— Reconciles built-in controllers (Deployment, ReplicaSet, ...)
kube-scheduler         — Assigns pending pods to nodes.
kube-proxy             — Per-node iptables/IPVS rules for Service IPs.
kubelet                — Per-node agent. Pulls pod specs, runs containers, reports status.
etcd                   — The state store. Strongly consistent KV.
```

স্কেলে আরও দুটো যোগ করবেন:

```
CoreDNS                — Cluster DNS. Surprisingly often the bottleneck.
CNI plugin             — Pod networking (Calico, Cilium, AWS VPC CNI, ...)
```

### স্কেলে কোথায় ভাঙে

| Component  | Stress-এর লক্ষণ                                                | First-line tuning                                 |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------- |
| etcd       | apiserver থেকে 5xx, watch lag, "etcdserver: request timed out" | Faster disk (NVMe), defrag, quota বাড়ান          |
| apiserver  | `kubectl get`-এ High p99, watch close storm                    | More replicas, EncryptionConfig caching           |
| scheduler  | Pending pod জমে যাওয়া                                         | `kube-scheduler` parallelism tune, predicate কমান |
| kube-proxy | Service latency spike                                          | iptables → IPVS বা eBPF-এ switch                  |
| CoreDNS    | Random app DNS error                                           | NodeLocal DNSCache, replica বাড়ান, autopath      |
| CNI        | Slow pod startup, মাঝেমধ্যে connectivity                       | IP pool pre-warm, CNI worker count বাড়ান         |

## etcd — cluster-এর heartbeat

Kubernetes-এর সবকিছু etcd-তে থাকে। etcd অসুখী হলে cluster অসুখী। তিনটা সংখ্যা গুরুত্বপূর্ণ:

```
1. fsync latency (P99)   — must be < 25 ms. NVMe required at scale.
2. backend size          — quota default 2 GB. Past that, writes fail.
3. leader changes        — should be near zero. Frequent = network/disk issue.
```

### Operational essentials

```bash
# Health
ETCDCTL_API=3 etcdctl --endpoints=$ENDPOINTS endpoint health

# Status (every member)
etcdctl --endpoints=$ENDPOINTS endpoint status -w table

# Compaction + defrag (run during off-peak)
etcdctl compact $(etcdctl endpoint status -w json | jq '.[0].Status.header.revision')
etcdctl defrag --cluster

# Backup
etcdctl snapshot save /backup/etcd-$(date +%F).db
etcdctl snapshot status /backup/etcd-2026-05-03.db -w table
```

### 8 GB quota-র দেয়াল

একটা বাস্তব production failure pattern: একটা CRD controller প্রতি pod-এ প্রতি মিনিটে একটা object লেখে। ছয় মাস পর, etcd-র backend 6 GB। হঠাৎ সব write `etcdserver: mvcc: database space exceeded` ফেরত দেয়। cluster read করতে পারে কিন্তু কোনো নতুন manifest নিতে পারে না।

Mitigation:

```bash
# Raise quota (--quota-backend-bytes), but you're treating the symptom.
# The fix is auto-compaction:
--auto-compaction-mode=periodic --auto-compaction-retention=1h
# Plus regular defrag (etcd doesn't reclaim disk on compaction alone).
```

### Sizing

```
Cluster size   | etcd size       | Notes
---------------|-----------------|----------------
< 100 nodes    | 3 nodes, 4 GB   | Default works fine
100-500 nodes  | 3 nodes, 16 GB  | NVMe required, watch fsync
500-2000 nodes | 5 nodes, 32 GB  | Dedicated host, separate disks for WAL+data
> 2000 nodes   | Multi-cluster!  | Don't push past this; federate instead.
```

## Apiserver scaling — watch সমস্যা

প্রতিটা Kubernetes client (controller, kubelet, operator) apiserver-এ একটা _watch_ খোলে। 5,000 watch × 200 events/sec-এ apiserver শুধু stream করতেই গুরুতর কাজ করে। pattern-গুলো:

```
- Use field/label selectors on every watch — never list everything.
- Use shared informers in your controllers (one watch, many consumers).
- Cap apiserver inflight requests:
    --max-requests-inflight=2000 --max-mutating-requests-inflight=500
- Enable APF (API Priority and Fairness) so a misbehaving client
  can't starve the rest.
```

Sev-1 ঘটায় এমন খারাপ pattern: একটা operator যা প্রতি reconcile-এ `client.List(everyResource)` করে। 100k object-এ, সেটা একটা 100 MB response। প্রতি reconcile-এ। যতক্ষণ না apiserver গলে যায়।

## স্কেলে RBAC — least privilege-এর নীতি

Default cluster RBAC যথেষ্ট permissive যে "intern-এর debug pod" cluster-wide সব secret পড়তে পারে। স্কেলে, আপনি RBAC গড়েন _team_ (user নয়) আর _namespace_ (cluster নয়)-এর চারপাশে।

```yaml
# Pattern: per-team Role + RoleBinding scoped to their namespaces.
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: team-payments
  name: payments-developer
rules:
  - apiGroups: ['', 'apps']
    resources: ['pods', 'deployments', 'services', 'configmaps']
    verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete']
  - apiGroups: ['']
    resources: ['secrets']
    verbs: ['get', 'list'] # NOT create/update — secrets via SealedSecrets/SOPS
  - apiGroups: ['']
    resources: ['pods/exec']
    verbs: [] # exec into pods explicitly denied
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: team-payments
  name: payments-developers
subjects:
  - kind: Group
    name: gh:org:payments-team # OIDC group from GitHub or your IdP
roleRef:
  kind: Role
  name: payments-developer
  apiGroup: rbac.authorization.k8s.io
```

যে দুটো RBAC নিয়ম সবসময় কামড়ায়:

```
- ClusterRoleBindings to "system:authenticated" (every authenticated user
  gets that permission). Audit cluster-wide; the result should be small.
- Wildcard verbs ("*") in any production role. Prefer enumerating verbs
  even if it's verbose.
```

### Service account সঠিকভাবে করা

প্রতিটা pod একটা ServiceAccount হিসেবে চলে। Default SA-র কোনো permission নেই, কিন্তু অনেক team pod-কে `cluster-admin` দেয় "জিনিস কাজ করানোর জন্য।"

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: payments-api
  namespace: team-payments
automountServiceAccountToken: true # only if the pod needs the API
---
# Bind narrow Role to this SA:
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: payments-api-sa
  namespace: team-payments
subjects: [{ kind: ServiceAccount, name: payments-api }]
roleRef: { kind: Role, name: payments-api-role, apiGroup: rbac.authorization.k8s.io }
```

একটা pod যদি K8s API-র সাথে কথা না বলে, `automountServiceAccountToken: false` সেট করুন। এটা compromise হলে pod-কে একটা leverage point হওয়া থেকে ঠেকায়।

## NetworkPolicy — namespace isolation যা আসলে কাজ করে

Default Kubernetes networking: প্রতিটা pod সব namespace জুড়ে প্রতিটা অন্য pod-এর সাথে কথা বলতে পারে। স্কেলে এটা অগ্রহণযোগ্য। NetworkPolicy হলো আপনার firewall।

```yaml
# Default-deny in a namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: team-payments
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
# Allow only same-namespace + DNS + telemetry
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-internal
  namespace: team-payments
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
  ingress:
    - from: [{ podSelector: {} }]
  egress:
    - to: [{ podSelector: {} }]
    - to:
        - namespaceSelector: { matchLabels: { name: kube-system } }
          podSelector: { matchLabels: { k8s-app: kube-dns } }
      ports: [{ port: 53, protocol: UDP }]
    - to:
        - namespaceSelector: { matchLabels: { name: telemetry } }
      ports: [{ port: 4317, protocol: TCP }]
```

iptables-ভিত্তিক CNI (Calico, AWS VPC CNI) এটা হয়তো 5k policy পর্যন্ত ভালোভাবে সামলায়। এর পরে, **Cilium / eBPF**-এ switch করুন — একই `NetworkPolicy` API কিন্তু eBPF map দিয়ে enforce, ~50k+ policy পর্যন্ত scale করে।

## Policy engine — OPA Gatekeeper আর Kyverno

RBAC বলে _কে_ _কী_ করতে পারে। Policy engine বলে _কী allowed_ — cluster জুড়ে admission-time validation।

```yaml
# Kyverno example: every pod must have CPU + memory requests.
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resources
spec:
  validationFailureAction: Enforce
  rules:
    - name: require-cpu-memory
      match:
        any:
          - resources: { kinds: [Pod] }
      validate:
        message: 'CPU and memory requests are required.'
        pattern:
          spec:
            containers:
              - resources:
                  requests:
                    cpu: '?*'
                    memory: '?*'
```

যে দুটো policy 80% production incident block করে:

1. **Required resource request + limit** (node OOM cascade ঠেকায়)।
2. **prod image-এর জন্য কোনো `latest` tag নয়, কোনো `imagePullPolicy: Always` নয়** (নীরব rollout ঠেকায়)।

যেকোনো নতুন cluster-এ প্রথম দিনেই এগুলো যোগ করুন।

### OPA Gatekeeper vs Kyverno

```
Gatekeeper — Rego DSL. More powerful, harder to learn. Better for
             complex cross-resource rules.
Kyverno    — YAML-native. Easier for K8s-shaped policies. Has mutation
             (auto-add labels, auto-inject sidecars), generation
             (auto-create NetworkPolicy on namespace create).
```

বেশিরভাগ team প্রথমে Kyverno বাছে। আপনার security team ইতিমধ্যে Rego ব্যবহার করলে Gatekeeper।

## Multi-tenancy — soft, hard, আর অসম্ভব

Kubernetes default-এ একটা _soft multi-tenant_ platform। পরস্পর-অবিশ্বাসী tenant-দের মধ্যে সত্যিকার isolation-এর জন্য namespace-এর চেয়ে বেশি লাগে।

```
Soft multi-tenancy:
  Cooperating teams (same org). Namespace + RBAC + NetworkPolicy + quota.
  Trust each tenant's image and code.
  This is what 95% of "multi-tenant K8s" means.

Hard multi-tenancy:
  Mutually distrusting tenants (e.g. SaaS customers).
  Need: kernel isolation (gVisor, Kata Containers, Firecracker),
  per-tenant nodes (taints + tolerations), per-tenant control plane
  (vCluster, multi-cluster).
  Even then, etcd is shared — a malicious tenant can DOS the apiserver.
```

আপনি যদি এমন একটা SaaS ship করেন যেখানে tenant-রা নিজেদের code চালায়, cluster-per-tenant-এ default করুন বা একটা sandboxed runtime ব্যবহার করুন। এর বাইরে যা কিছু একটা CVE-র অপেক্ষায়।

## Resource management — আসল লড়াই

### Requests vs limits, অবশেষে ব্যাখ্যা

```
requests: what the scheduler reserves. Always honored.
          → drives bin-packing.
limits:   the cap. CPU limit = throttling. Memory limit = OOM kill.
```

Senior-team নিয়ম:

- **সবসময় request সেট করুন।** এগুলো ছাড়া Kubelet bin-pack করতে পারে না আর noisy neighbor জেতে।
- **memory limit = memory request সেট করুন।** memory-র জন্য "Burstable" QoS class এড়ান; swap thrash-এর চেয়ে OOM kill ভালো।
- **CPU limit সেট করবেন না** (বিতর্কিত)। CPU throttling Go আর Java runtime-এ অদ্ভুত tail-latency stall ঘটায়। সামান্য overcommit করে kernel scheduler-কে share করতে দেওয়া ভালো।

### Pod Disruption Budgets (PDB)

voluntary disruption (drain, upgrade)-কে আপনার service-কে একটা floor-এর নিচে নামানো থেকে ঠেকান:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: payments-api-pdb
  namespace: team-payments
spec:
  minAvailable: 80%
  selector:
    matchLabels: { app: payments-api }
```

আপনি PDB সেট না করলে, একটা node drain আপনার সব replica একসাথে নামিয়ে দিতে পারে। এটাই সবচেয়ে common "cluster আমার service খেয়ে ফেলল" outage।

### Topology spread

zone, rack বা node জুড়ে pod ছড়ান যাতে একটার failure বেঁচে থাকা যায়:

```yaml
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector: { matchLabels: { app: payments-api } }
```

spread ছাড়া, scheduler আনন্দে সব 6টা replica এক zone-এ রাখবে। zone নামলে, আপনার service-ও নামে।

## স্কেলে GitOps — Argo CD আর Flux

`kubectl apply` এক team-এর বাইরে scale করে না। GitOps source of truth-কে git-এ সরায়, আর একটা controller (Argo CD বা Flux) cluster state-কে match করতে reconcile করে।

```
Developer pushes manifest changes to git.
   ↓
PR review + CI (kubeconform, conftest, kyverno test).
   ↓
Merge to main.
   ↓
Argo CD detects change, syncs to cluster (with health checks + rollback).
```

### Operational patterns

- **environment-প্রতি একটা git repo, বা team-প্রতি, একটা root "app of apps" সহ।**
- dependency-র জন্য **Sync wave**: CRD আগে install হয় (wave 0), operator (wave 1), app (wave 2)।
- production-এ **Auto-sync with manual prune**। (Auto-prune একবার একটা বাস্তব customer-এর namespace মুছে দিয়েছিল। একবার।)
- webhook ছাড়া "deploy on new image"-এর জন্য **Image automation** (Argo CD Image Updater, Flux Image Reflector)।

### দশ-বিশটা cluster-এর জন্য app-of-apps

```yaml
# root-app.yaml in argo-cd namespace
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: payments-services
spec:
  generators:
    - matrix:
        generators:
          - clusters:
              selector: { matchLabels: { env: production } }
          - git:
              repoURL: https://github.com/org/k8s-manifests
              directories: [{ path: services/* }]
  template:
    metadata: { name: '{{path.basename}}-{{name}}' }
    spec:
      project: payments
      source:
        repoURL: https://github.com/org/k8s-manifests
        path: '{{path}}'
      destination:
        server: '{{server}}'
        namespace: '{{path.basename}}'
      syncPolicy:
        automated: { prune: false, selfHeal: true }
```

একটা ApplicationSet প্রতিটা service প্রতিটা prod cluster-এ ship করে। cluster fleet একটা table-এর row হয়ে যায়, snowflake নয়।

## cluster নিজের জন্য observability

App-এর dashboard থাকে। platform team-এর cluster dashboard লাগে।

```
Always-on Grafana dashboards:
  - apiserver QPS, latency P99, watch counts, inflight requests
  - etcd fsync latency, backend size, leader changes
  - scheduler scheduling latency, pending pod count
  - kubelet PLEG (pod lifecycle event generator) latency per node
  - CNI: per-node IP allocation, NetworkPolicy program time
  - CoreDNS: latency P99, NXDOMAIN rate

Always-on alerts:
  - apiserver P99 > 1s for 5 min
  - etcd fsync P99 > 25ms for 5 min
  - any Node NotReady > 5 min
  - Pending pods > 50 for 10 min (scheduler stuck)
  - CrashLoopBackOff per namespace count
```

Kube-prometheus-stack এর ~80% out of the box ship করে। এর বাইরে যেকোনো custom alert-কে একটা ইচ্ছাকৃত সংযোজন হিসেবে treat করুন, অস্পষ্ট "আমরা কি এটা যোগ করব?" হিসেবে নয়।

## Cluster lifecycle — নাটক ছাড়া upgrade

প্রতি quarter-এর দুটো প্রশ্ন:

```
- "Are we still on a supported K8s version?"
- "Have we tested the upgrade path on staging this month?"
```

যে pattern কাজ করে:

- **major upgrade-এর জন্য Blue-green cluster।** নতুন version-এ একটা নতুন cluster গড়ুন, Argo CD reconfig + DNS switch দিয়ে workload drain করুন, পুরনোটা retire করুন।
- node-এর জন্য **Surge upgrade** (পুরনোটা drain হওয়ার আগে একটা নতুন node spin up — zero capacity dip)।
- upgrade window-এ **PDB + topology-spread + 1.5x replicas**। হিসাব: একটা single zone drain হওয়া আপনাকে SLO-র নিচে নামাতে পারবে না।

Skip-version upgrade (1.27 → 1.30) supported নয়। প্রতিটা minor version-এ upgrade tax দিন বা এমন automation গড়ুন যা তা করে।

## স্কেলে cost — K8s-specific অংশ

(chapter 18 — FinOps-এ আরও বিস্তারিত। K8s-specific lever-গুলো:)

```
- Karpenter (AWS) or Cluster Autoscaler — right-size nodes to actual demand.
- Spot instances behind PDB + node-affinity for stateless workloads.
- Vertical Pod Autoscaler for "rightsize requests automatically."
- ResourceQuota per namespace — bills back to teams.
- Bin-packing-aware scheduler plugins (descheduler) — defrag periodically.
```

স্কেলে সবচেয়ে বড় অপচয় হলো **idle requested capacity**। যে team 2 CPU request করে কিন্তু 0.3 ব্যবহার করে সেটা 1.7 নষ্ট করে। 1,000 pod-এ, সেটা 1,700 core idle reservation। VPA + একটা "PR-এ আপনার CPU usage দেখান" CI check মিলে এর বেশিরভাগ ফিরিয়ে আনে।

## Tools tier list

```
Tier S (run them, know them)
  kubectl, k9s, helm or kustomize, Argo CD or Flux,
  kube-prometheus-stack, cert-manager, external-dns

Tier A (you'll use most of these in a year)
  Karpenter / Cluster Autoscaler, Cilium, Kyverno or OPA Gatekeeper,
  external-secrets-operator, kubectl-trace, kubectl-debug, stern

Tier B (specialist or per-org)
  vCluster (multi-tenant control planes), Capsule (per-tenant policies),
  Crossplane (provision cloud infra via K8s objects),
  cert-manager + Trust Manager for per-namespace CAs

Tier F
  Cluster-admin to "developers." Default-deny networkpolicy never enforced.
  No PDB. ConfigMap-as-secret-because-it's-easier.
```

## Sev-1 ঘটায় এমন common ভুল

1. **কোনো PDB নেই।** একটা drain সব replica নেয়। p99 → অসীম।
2. **request ছাড়া resource limit।** Scheduler capacity নিয়ে reason করতে পারে না।
3. **`cluster-admin` Service Account।** একটা compromised pod পুরো cluster-এর মালিক।
4. **EBS gp2 (slow disk)-এ etcd।** Fsync latency ধসে যায়; cluster জমে যায়।
5. **কোনো NetworkPolicy নেই।** একটা compromised dev pod prod secret-এ lateral-move করতে পারে।
6. **testing ছাড়া CRD upgrade।** যে schema change পুরনো controller ভাঙে সেটা reconcile loop brick করে দেয়।
7. **production-এ `kubectl edit`।** GitOps একটা কারণে আছে; drift কামড়াবে।

## আপডেটেড থাকুন

- [Kubernetes docs](https://kubernetes.io/docs/) — version-tracked source of truth
- [Kubernetes Enhancement Proposals (KEPs)](https://github.com/kubernetes/enhancements) — কী আসছে
- [sig-scalability](https://github.com/kubernetes/community/tree/master/sig-scalability) — limit, perf testing, graduation
- [Learnk8s](https://learnk8s.io/) — বাস্তব at-scale pattern

## মূল শিক্ষা

1. **etcd হলো heartbeat — fsync, size, leader change-ই SLO।**
2. **APF + bounded list/watch usage** স্কেলে apiserver-কে জীবিত রাখে।
3. **RBAC + NetworkPolicy + Kyverno হলো security stack** — RBAC একা প্রয়োজনীয় কিন্তু যথেষ্ট নয়।
4. **Soft multi-tenancy-ই "multi-tenant K8s" সাধারণত যা বোঝায়।** Hard multi-tenancy-র জন্য sandbox বা per-tenant cluster লাগে।
5. **PDB + topology spread + GitOps reconciliation** হলো cluster upgrade জুড়ে ঘুমানোর উপায়।
6. **Cluster observability নিজেই একটা discipline** — kube-prometheus-stack হলো floor, ceiling নয়।
