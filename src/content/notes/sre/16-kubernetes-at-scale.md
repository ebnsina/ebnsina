---
title: 'Kubernetes at Scale'
subtitle: "1,000+ node clusters, multi-tenancy, RBAC, NetworkPolicy, OPA/Kyverno, GitOps, etcd tuning. The operating model when 'just run kubectl apply' is no longer a strategy."
chapter: 16
level: 'mastery'
readingTime: '30 min'
topics: ['kubernetes', 'etcd', 'RBAC', 'OPA', 'Kyverno', 'GitOps', 'multi-tenancy', 'scale']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A logistics company that routes packages automatically — you declare where things need to go, the system figures out the trucks.

</Callout>

## Where this chapter starts

You've run `kubectl apply -f`. You've set requests and limits. You've used Helm. This chapter starts where that ends: when one cluster has 50+ teams, 5,000 namespaces, 80,000 pods, and one config-push can take down all of it. The skills here are what platform/infra SREs at hyperscalers, fintechs, and big SaaS companies actually do.

## The control plane — what's actually running

When you "use Kubernetes," you depend on five processes plus etcd. Knowing what each does turns "the cluster is slow" from a guess into a diagnosis.

```
kube-apiserver         — REST entrypoint. Validates, persists to etcd, serves watches.
kube-controller-manager— Reconciles built-in controllers (Deployment, ReplicaSet, ...)
kube-scheduler         — Assigns pending pods to nodes.
kube-proxy             — Per-node iptables/IPVS rules for Service IPs.
kubelet                — Per-node agent. Pulls pod specs, runs containers, reports status.
etcd                   — The state store. Strongly consistent KV.
```

Two more you'll add at scale:

```
CoreDNS                — Cluster DNS. Surprisingly often the bottleneck.
CNI plugin             — Pod networking (Calico, Cilium, AWS VPC CNI, ...)
```

### Where it breaks at scale

| Component  | Symptom of stress                                              | First-line tuning                                    |
| ---------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| etcd       | 5xx from apiserver, watch lag, "etcdserver: request timed out" | Faster disk (NVMe), defrag, raise quota              |
| apiserver  | High p99 on `kubectl get`, watch close storms                  | More replicas, EncryptionConfig caching              |
| scheduler  | Pending pods piling up                                         | Tune `kube-scheduler` parallelism, reduce predicates |
| kube-proxy | Service latency spikes                                         | Switch iptables → IPVS or eBPF                       |
| CoreDNS    | Random app DNS errors                                          | NodeLocal DNSCache, raise replicas, autopath         |
| CNI        | Slow pod startup, intermittent connectivity                    | Pre-warm IP pools, raise CNI worker count            |

## etcd — the heartbeat of the cluster

Everything in Kubernetes lives in etcd. If etcd is unhappy, the cluster is unhappy. Three numbers matter:

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

### The 8 GB quota wall

A real production failure pattern: a CRD controller writes one object per pod per minute. Six months later, etcd's backend is 6 GB. Suddenly all writes return `etcdserver: mvcc: database space exceeded`. The cluster can read but cannot accept any new manifest.

Mitigations:

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

## Apiserver scaling — the watch problem

Every Kubernetes client (controller, kubelet, operator) opens a _watch_ on the apiserver. At 5,000 watches × 200 events/sec, the apiserver does serious work just streaming. The patterns:

```
- Use field/label selectors on every watch — never list everything.
- Use shared informers in your controllers (one watch, many consumers).
- Cap apiserver inflight requests:
    --max-requests-inflight=2000 --max-mutating-requests-inflight=500
- Enable APF (API Priority and Fairness) so a misbehaving client
  can't starve the rest.
```

Bad pattern that causes a Sev-1: an operator that does `client.List(everyResource)` every reconcile. With 100k objects, that's a 100 MB response. Every reconcile. Until the apiserver melts.

## RBAC at scale — the principle of least privilege

Default cluster RBAC is permissive enough that "intern's debug pod" can read all secrets cluster-wide. At scale, you build RBAC around _teams_ (not users) and _namespaces_ (not the cluster).

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

The two RBAC rules that always bite:

```
- ClusterRoleBindings to "system:authenticated" (every authenticated user
  gets that permission). Audit cluster-wide; the result should be small.
- Wildcard verbs ("*") in any production role. Prefer enumerating verbs
  even if it's verbose.
```

### Service accounts done right

Every pod runs as a ServiceAccount. The default SA has no permissions, but plenty of teams give pods `cluster-admin` "to make things work."

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

If a pod doesn't talk to the K8s API, set `automountServiceAccountToken: false`. This stops the pod from being a leverage point if compromised.

## NetworkPolicy — namespace isolation that actually works

Default Kubernetes networking: every pod can talk to every other pod across all namespaces. At scale this is unacceptable. NetworkPolicy is your firewall.

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

iptables-based CNIs (Calico, AWS VPC CNI) handle this fine up to maybe 5k policies. Past that, switch to **Cilium / eBPF** — same `NetworkPolicy` API but enforced via eBPF maps, scaling to ~50k+ policies.

## Policy engines — OPA Gatekeeper and Kyverno

RBAC says _who_ can do _what_. Policy engines say _what is allowed_ — admission-time validation across the cluster.

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

The two policies that block 80% of production incidents:

1. **Required resource requests + limits** (prevents node OOM cascades).
2. **No `latest` tag, no `imagePullPolicy: Always` for prod images** (prevents silent rollouts).

Add these on day one in any new cluster.

### OPA Gatekeeper vs Kyverno

```
Gatekeeper — Rego DSL. More powerful, harder to learn. Better for
             complex cross-resource rules.
Kyverno    — YAML-native. Easier for K8s-shaped policies. Has mutation
             (auto-add labels, auto-inject sidecars), generation
             (auto-create NetworkPolicy on namespace create).
```

Most teams pick Kyverno first. Gatekeeper if your security team already uses Rego.

## Multi-tenancy — soft, hard, and impossible

Kubernetes is a _soft multi-tenant_ platform by default. True isolation between mutually distrusting tenants requires more than namespaces.

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

If you're shipping a SaaS where tenants run their own code, default to a cluster-per-tenant or use a sandboxed runtime. Anything else is a CVE waiting to happen.

## Resource management — the real fights

### Requests vs limits, finally explained

```
requests: what the scheduler reserves. Always honored.
          → drives bin-packing.
limits:   the cap. CPU limit = throttling. Memory limit = OOM kill.
```

The senior-team rules:

- **Always set requests.** Without them, Kubelet can't bin-pack and noisy neighbors win.
- **Set memory limit = memory request.** Avoid the "Burstable" QoS class for memory; OOM kill is better than swap thrash.
- **Don't set CPU limits** (controversial). CPU throttling causes weird tail-latency stalls in Go and Java runtimes. Better to overcommit slightly and let the kernel scheduler share.

### Pod Disruption Budgets (PDB)

Prevent voluntary disruptions (drains, upgrades) from taking your service below a floor:

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

If you don't set a PDB, a node drain can take ALL your replicas down at once. This is the most common "the cluster ate my service" outage.

### Topology spread

Spread pods across zones, racks, or nodes to survive failure of one:

```yaml
spec:
  topologySpreadConstraints:
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule
      labelSelector: { matchLabels: { app: payments-api } }
```

Without spread, the scheduler will happily put all 6 replicas in one zone. When the zone goes down, so does your service.

## GitOps at scale — Argo CD and Flux

`kubectl apply` doesn't scale beyond one team. GitOps moves the source of truth to git, and a controller (Argo CD or Flux) reconciles cluster state to match.

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

- **One git repo per environment, or per team, with a root "app of apps."**
- **Sync waves** for dependencies: CRDs install first (wave 0), operators (wave 1), apps (wave 2).
- **Auto-sync with manual prune** in production. (Auto-prune deleted a real customer's namespace once. Once.)
- **Image automation** (Argo CD Image Updater, Flux Image Reflector) for "deploy on new image" without webhooks.

### App-of-apps for tens of clusters

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

One ApplicationSet ships every service to every prod cluster. The cluster fleet becomes a row in a table, not a snowflake.

## Observability for the cluster itself

Apps have dashboards. The platform team needs cluster dashboards.

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

Kube-prometheus-stack ships ~80% of these out of the box. Treat any custom alert beyond it as a deliberate addition, not a vague "should we add this?".

## Cluster lifecycle — upgrades without drama

The two questions every quarter:

```
- "Are we still on a supported K8s version?"
- "Have we tested the upgrade path on staging this month?"
```

Patterns that work:

- **Blue-green clusters for major upgrades.** Build a new cluster on the new version, drain workloads via Argo CD reconfig + DNS switch, retire the old one.
- **Surge upgrades** for nodes (one new node spun up before the old is drained — zero capacity dip).
- **PDB + topology-spread + 1.5x replicas** during upgrade windows. The math: a single zone draining mustn't drop you below SLO.

Skip-version upgrades (1.27 → 1.30) are not supported. Pay the upgrade tax every minor version or build automation that does.

## Cost at scale — the K8s-specific part

(Covered more in chapter 18 — FinOps. The K8s-specific levers:)

```
- Karpenter (AWS) or Cluster Autoscaler — right-size nodes to actual demand.
- Spot instances behind PDB + node-affinity for stateless workloads.
- Vertical Pod Autoscaler for "rightsize requests automatically."
- ResourceQuota per namespace — bills back to teams.
- Bin-packing-aware scheduler plugins (descheduler) — defrag periodically.
```

The biggest waste at scale is **idle requested capacity**. A team that requests 2 CPU but uses 0.3 wastes 1.7. At 1,000 pods, that's 1,700 cores of idle reservation. VPA + a "show your CPU usage in the PR" CI check together claw most of that back.

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

## Common mistakes that cause Sev-1s

1. **No PDB.** A drain takes all replicas. p99 → infinity.
2. **Resource limits with no requests.** Scheduler can't reason about capacity.
3. **`cluster-admin` Service Accounts.** One compromised pod owns the cluster.
4. **etcd on EBS gp2 (slow disk).** Fsync latency tanks; cluster freezes.
5. **No NetworkPolicy.** A compromised dev pod can lateral-move to prod secrets.
6. **CRD upgrades without testing.** Schema changes that break old controllers brick reconcile loops.
7. **`kubectl edit` in production.** GitOps exists for a reason; drift will bite.

## Stay current

- [Kubernetes docs](https://kubernetes.io/docs/) — version-tracked source of truth
- [Kubernetes Enhancement Proposals (KEPs)](https://github.com/kubernetes/enhancements) — what's coming
- [sig-scalability](https://github.com/kubernetes/community/tree/master/sig-scalability) — limits, perf testing, graduations
- [Learnk8s](https://learnk8s.io/) — practical at-scale patterns

## Key Takeaways

1. **etcd is the heartbeat — fsync, size, leader changes are the SLO.**
2. **APF + bounded list/watch usage** keeps the apiserver alive at scale.
3. **RBAC + NetworkPolicy + Kyverno is the security stack** — RBAC alone is necessary but not sufficient.
4. **Soft multi-tenancy is what "multi-tenant K8s" usually means.** Hard multi-tenancy needs sandboxes or per-tenant clusters.
5. **PDB + topology spread + GitOps reconciliation** is how you sleep through cluster upgrades.
6. **Cluster observability is its own discipline** — kube-prometheus-stack is the floor, not the ceiling.
