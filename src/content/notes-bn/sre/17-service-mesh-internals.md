---
title: 'Service Mesh Internals'
subtitle: 'Envoy, Istio, Linkerd, sidecar vs ambient, mTLS, xDS, retries, circuit breakers, traffic shifting। একটা mesh আসলে কী করে আর কখন এর জটিলতা পুষিয়ে দেয়।'
chapter: 17
level: 'mastery'
readingTime: '28 মিনিট'
topics: ['service mesh', 'Envoy', 'Istio', 'Linkerd', 'ambient', 'mTLS', 'xDS', 'Cilium']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা service mesh একটা building-এর electrical wiring-এর মতো — প্রতিটা room বিদ্যুৎ, circuit breaker আর grounding পায় প্রতিটা room নিজে wiring না করেই। আপনি infrastructure-এর দাম একবার দেন; প্রতিটা tenant স্বয়ংক্রিয়ভাবে উপকৃত হয়।

</Callout>

## এক প্যারায় service mesh কী

একটা service mesh cross-cutting networking concern — mTLS, retries, timeouts, traffic shifting, telemetry, circuit breakers, load balancing — প্রতিটা service থেকে বের করে এমন একটা dedicated proxy-তে নিয়ে যায় যা প্রতিটা service-এর পাশে (sidecar) বা নিচে (ambient/eBPF) বসে। proxy-গুলো হলো **data plane**। একটা আলাদা **control plane** সেগুলো configure করে আর তাদের updated routing ও policy পাঠায়।

আপনি পান: consistent zero-trust networking, language-agnostic resilience, deep telemetry, traffic-shifted deploy।

আপনি দেন: প্রতি call-এ একটা extra hop, operate করার মতো একটা নতুন control plane, একটা learning curve, আর একটা নতুন failure mode (mesh নিজেই)।

## কখন একটা mesh সত্যিই এর মূল্য দেয়

| পরিস্থিতি                               | Mesh worth it?                                  |
| --------------------------------------- | ----------------------------------------------- |
| 1 monolith + 3 service, single language | না। HTTP keepalive + একটা library ব্যবহার করুন। |
| 50 service, 5 language, mTLS required   | হ্যাঁ। library-র খরচ প্রধান হয়ে ওঠে।           |
| Zero-trust mandate, policy-as-code      | হ্যাঁ। Mesh স্বাভাবিক enforcement point।        |
| Pure event-driven (Kafka/SQS) service   | না। Mesh RPC path-এ বসে, queue-তে নয়।          |
| Third-party SaaS-এ heavy egress         | আংশিক। Egress gateway কাজের; full mesh নয়।     |

সৎ পরীক্ষা: **যে cross-cutting concern-গুলো আপনি নাহলে N-টা library-তে বানাতেন সেগুলোর তালিকা করুন।** তালিকা ছোট হলে, mesh skip করুন।

## Envoy — industry যে data plane-এ standardize করেছে

Istio Envoy ব্যবহার করে। Linkerd-এর নিজেরটা আছে (Rust-ভিত্তিক linkerd2-proxy)। Cilium-এর নিজেরটা আছে (L7-র জন্য eBPF + Envoy)। বেশিরভাগ "service mesh" article আসলে Envoy article।

Envoy একটা high-performance L4/L7 proxy, কয়েকটা সংজ্ঞায়ক ধারণা নিয়ে:

```
- Configuration is dynamic. xDS APIs (LDS/RDS/CDS/EDS) push updates
  without restart.
- Filter chains. Each connection runs through a stack of filters
  (TLS termination → HTTP parsing → routing → load balancing →
   rate limit → upstream connection pool).
- Listeners (downstream) and Clusters (upstream). Listeners terminate
  client connections; Clusters represent groups of upstream endpoints.
- First-class observability. Stats and access logs are part of the data
  model, not bolted on.
```

### xDS — Envoy config protocol

```
LDS — Listener Discovery Service.    Where Envoy listens.
RDS — Route Discovery Service.       HTTP routing rules.
CDS — Cluster Discovery Service.     Upstream service definitions.
EDS — Endpoint Discovery Service.    Endpoints inside each cluster.
SDS — Secret Discovery Service.      Certificates for mTLS.
```

Istiod, Cilium-এর mesh agent, Consul Connect — সবাই Envoy-র সাথে xDS-এ কথা বলে। আপনি xDS taxonomy বুঝলে, _যেকোনো_ Envoy-ভিত্তিক mesh debug করতে পারবেন।

```bash
# Dump live Envoy config from an Istio sidecar
istioctl proxy-config listener payments-api-7c5d8 -n team-payments
istioctl proxy-config cluster  payments-api-7c5d8 -n team-payments -o json
istioctl proxy-config route    payments-api-7c5d8 -n team-payments
istioctl proxy-config endpoint payments-api-7c5d8 -n team-payments
```

প্রথমবার যখন একটা route কাজ করবে না, RDS dump করুন। প্রথমবার যখন mTLS fail করবে, SDS dump করুন। proxy-কে inspectable হিসেবে treat করুন, magical নয়।

## Sidecar vs ambient — architectural লড়াই

এক দশক ধরে, "service mesh" মানে ছিল "sidecar mesh": প্রতিটা pod তার পাশে চলা একটা Envoy container পায়, আর `iptables` rule pod traffic সেই Envoy-র মধ্য দিয়ে redirect করে।

```
Sidecar pros:
  - Per-pod isolation (proxy share fate with app).
  - Mature, well-understood model.
Sidecar cons:
  - +50–200 MiB RAM per pod and CPU per request.
  - 2 extra hops on every call (in + out).
  - Lifecycle pain (pod must wait for sidecar before serving;
    sidecar must drain before pod terminates).
```

Ambient mesh (Istio-র নতুন mode) আর Cilium service mesh একটা ভিন্ন আকার নেয়:

```
Ambient / eBPF mesh:
  - L4 layer ("ztunnel") runs once per node. Handles mTLS for every pod.
  - L7 layer (Envoy in a "waypoint" deployment) only for namespaces that need it.
  - Pods get mTLS without any sidecar.
  - Big drop in resource overhead at scale.

Tradeoffs:
  - Less mature (Istio ambient went GA in 2024).
  - L7 features still need a proxy somewhere — just deployed differently.
  - Per-tenant blast radius slightly larger (shared ztunnel per node).
```

আপনি যদি 2026-এ নতুন করে শুরু করেন, sidecar-এর আগে ambient/eBPF evaluate করুন। 10,000 pod-এ resource-এর হিসাব নাটকীয়।

## mTLS — যে feature mesh-এর দাম মিটিয়ে দেয়

Mutual TLS: cluster-এর ভেতরে প্রতিটা connection TLS-encrypted, আর দুই প্রান্তই certificate পেশ করে যা অন্যটা validate করে। Mesh:

1. **per-workload cert provision করে** স্বয়ংক্রিয়ভাবে (SPIFFE/SPIRE identity বা Istio-র CA)।
2. **সেগুলো rotate করে** নিয়মিত (Istio-তে default 24 h)।
3. **mTLS enforce করে** policy দিয়ে (`PeerAuthentication: STRICT`)।

```yaml
# Istio: require mTLS in production namespaces
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: team-payments
spec:
  mtls:
    mode: STRICT
```

দুটো operational gotcha:

1. **PERMISSIVE → STRICT migration staged হতে হবে।** PERMISSIVE দিয়ে শুরু করুন (plain + mTLS দুটোই নিন), নিশ্চিত করুন সব client-এর sidecar আছে, তারপর STRICT-এ switch করুন।
2. **Cert rotation control plane-এর উপর নির্ভর করে।** একটা long rotation cycle-এর সময় Istiod outage pod-কে expired cert নিয়ে ফেলে রাখতে পারে। cert age monitor করুন।

## Authorization — network-এর উপর workload-level RBAC

একবার identity পেলে (mTLS প্রতিটা workload-কে একটা verifiable নাম দেয়), আপনি এমন network policy লিখতে পারেন যা API authorization-এর মতো দেখায়:

```yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: payments-api-allow
  namespace: team-payments
spec:
  selector:
    matchLabels: { app: payments-api }
  action: ALLOW
  rules:
    - from:
        - source:
            principals:
              - cluster.local/ns/team-checkout/sa/checkout-api
              - cluster.local/ns/team-admin/sa/admin-tools
      to:
        - operation:
            methods: [POST, PUT]
            paths: [/v1/charges/*]
```

NetworkPolicy-র সাথে তুলনা করুন: NP বলে "এই pod label এই pod label-এর সাথে কথা বলতে পারে।" AuthorizationPolicy বলে "এই _identity_ _এই RPC_ করতে পারে।" এটাই network ACL থেকে service-level RBAC-এ লাফ।

## Traffic management — দ্বিতীয় feature যা আপনি আসলে ব্যবহার করবেন

Canary deploy, blue-green, testing-এর জন্য mirror traffic, fault injection — সব declarative হয়ে যায়।

```yaml
# Send 5% to v2, 95% to v1
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: payments-api
spec:
  hosts: [payments-api]
  http:
    - route:
        - destination: { host: payments-api, subset: v1 }
          weight: 95
        - destination: { host: payments-api, subset: v2 }
          weight: 5
```

```yaml
# Inject 100ms delay for 0.1% of requests, to test client timeouts
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: payments-api-fault
spec:
  hosts: [payments-api]
  http:
    - fault:
        delay:
          percentage: { value: 0.1 }
          fixedDelay: 100ms
      route:
        - destination: { host: payments-api }
```

Argo Rollouts + একটা mesh progressive delivery (auto-canary, SLO breach-এ auto-rollback)-কে একটা 50-লাইনের config বানায়।

## Resilience feature — আর double retry-র ফাঁদ

Mesh-level retry, timeout আর circuit breaker শক্তিশালী আর বিপজ্জনক।

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: payments-api
spec:
  hosts: [payments-api]
  http:
    - route: [{ destination: { host: payments-api } }]
      timeout: 2s
      retries:
        attempts: 3
        perTryTimeout: 500ms
        retryOn: 5xx,connect-failure,reset
```

ফাঁদ: যদি application আর mesh দুটোই retry করে, আপনি **retry amplification** পান (3 client retry × 3 mesh retry × 3 backend retry = প্রতি failed request-এ 27 call)। স্কেলে এটা একটা ছোট upstream blip-কে একটা stampede-এ পরিণত করে যা upstream-কে নামিয়ে দেয়।

Senior-team নিয়ম: **retry কোথায় থাকবে ঠিক করুন, আর বাকি সব জায়গায় disable করুন।** Mesh-level retry বেশিরভাগ সময় সঠিক উত্তর কারণ তারা service জুড়ে একটা budget share করে। Application-level retry হওয়া উচিত ব্যতিক্রম — আর "no further retry" লেবেল করা যাতে mesh এর উপরে retry না করে।

## Circuit breaker — Envoy-র outlier detection

```yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: payments-api
spec:
  host: payments-api
  trafficPolicy:
    connectionPool:
      tcp: { maxConnections: 100 }
      http: { http2MaxRequests: 1000, maxRequestsPerConnection: 10 }
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
```

এটা বলে: একটা backend pod যদি 5টা টানা 5xx ফেরত দেয়, তাকে 30 s-এর জন্য eject করো। একসাথে 50% পর্যন্ত pod eject হতে পারে। `maxEjectionPercent` cap-টা critical — এটা ছাড়া, একটা খারাপ deploy প্রতিটা replica eject করে আপনাকে zero capacity নিয়ে ফেলে রাখতে পারে।

## যে observability free-তে আসে

প্রতিটা mesh ship করে:

- **Per-RPC metric** (request rate, error rate, duration percentile) — স্বয়ংক্রিয়ভাবে RED।
- **Distributed trace** mesh-injected B3/W3C trace header সহ (app span-এর জন্য এখনও একটা tracer লাগে, কিন্তু network span free-তে দেখায়)।
- প্রতিটা request-এর জন্য **Access log**, JSON-এ বা আপনার পছন্দের যেকোনো format-এ।

অনেক team-এর জন্য এটাই value pitch: traffic shifting বা mTLS ব্যবহার করার আগেই, mesh প্রতিটা language-এর প্রতিটা service জুড়ে uniform telemetry দেয়।

## যে failure mode mesh যোগ করে

প্রতিটা layer একটা layer যা fail করতে পারে। mesh-specific failure pattern:

```
1. Sidecar crash loops cause pod failure even when the app is fine.
   → Set sidecar resource requests; monitor sidecar restart count.

2. Control plane outage stalls config rollouts.
   → Mesh data plane keeps working with last known config. Long outages
     stall cert rotation though — alert on cert TTL.

3. Misconfigured VirtualService routes 100% of traffic to a non-existent subset.
   → Always canary route changes through staging first.

4. Egress gateway dies → all external traffic dies.
   → Egress gateway is a SPOF unless replicated. Multi-AZ + PDB.

5. mTLS cert expiry across the cluster (control plane was down for 36h).
   → Alert on cert age, not just cluster status.
```

এর প্রতিটাই কোথাও না কোথাও কোনো team-এ একটা Sev-1 ঘটিয়েছে। mesh capability দেয়; এটা আরেকটা component যোগ করে যা আপনাকে operate করতে হবে।

## Mesh comparison — 2026-এ কী বাছবেন

|                   | Istio (sidecar)      | Istio Ambient            | Linkerd                  | Cilium Service Mesh      |
| ----------------- | -------------------- | ------------------------ | ------------------------ | ------------------------ |
| Data plane        | Envoy sidecar        | Ztunnel + Envoy waypoint | linkerd2-proxy (Rust)    | Envoy + eBPF             |
| Resource overhead | High                 | Low                      | Lowest of sidecar meshes | Lowest at scale          |
| Maturity          | Very mature          | GA 2024                  | Mature                   | Mature (CNCF graduated)  |
| L7 features       | Full Envoy           | Via waypoint             | Less than Envoy          | Full Envoy (when needed) |
| Best for          | Existing Istio shops | Greenfield K8s           | Simplicity-focused       | Already Cilium for CNI   |
| mTLS              | Yes (Istio CA)       | Yes                      | Yes                      | Yes (SPIFFE)             |
| Multi-cluster     | Yes (complex)        | Yes                      | Yes                      | Yes                      |

বাস্তব পছন্দ:

- **ইতিমধ্যে CNI-র জন্য Cilium?** Cilium service mesh সবচেয়ে কম-ঘর্ষণের পথ।
- **Greenfield K8s, সবচেয়ে সহজ mesh চান?** Linkerd। Boring is good।
- **ইতিমধ্যে Istio-তে?** আপনার use case-এর জন্য stable হলে ambient-এ migrate করুন।
- **ইতিমধ্যে Envoy-তে heavy (যেমন front proxy fleet)?** Istio consistency দেয়।

## একটা বাস্তব mesh debugging walkthrough

লক্ষণ: একটা downstream service মাঝেমধ্যে `upstream connect error or disconnect/reset before headers` সহ 503 দেখে। পাঁচ-মিনিটের spike, তারপর চুপ, তারপর আবার। কোনো app log নেই।

```
Step 1: Check the mesh access log on the SOURCE side.
   istioctl pc log payments-api-xxx --level access:debug
   Look for response_flags:
     UH = no healthy upstream → endpoint discovery problem
     UF = upstream connection failure → backend died
     UO = overflow (circuit breaker tripped) → check outlierDetection
     URX = upstream max retries reached
     LR = local reset (sidecar killed connection itself)

Step 2: If UH, check EDS — does the source see the destination's endpoints?
   istioctl pc endpoint payments-api-xxx --cluster '*payments-backend*'

Step 3: If endpoints look right, check the destination side.
   istioctl pc log payments-backend-xxx
   Look for sidecar startup time, mTLS cert mismatches.

Step 4: Common root causes for this exact pattern:
   - Backend pods restarting faster than EDS propagates → set
     terminationGracePeriodSeconds on pods, drain via preStop hook.
   - Outlier detection ejecting healthy pods → tune consecutiveErrors
     thresholds.
   - Sidecar OOMKilled because backend bursts traffic to it →
     bump sidecar memory request.
```

mesh-এর data model না জেনে এই ধরনের triage অসম্ভব। এই কারণেই এই chapter আছে।

## Common ভুল

1. **trendy বলে একটা mesh adopt করা।** এটা একটা tax। নিশ্চিত হন আপনি আদায় করছেন।
2. **resource request ছাড়া sidecar।** Sidecar OOM অদ্ভুত app error ঘটায়।
3. **app আর mesh দুটোই retry।** একটা layer বাছুন; অন্যটায় disable করুন।
4. **চিরকাল PERMISSIVE।** STRICT mTLS-ই লক্ষ্য; PERMISSIVE থাকা মানে আপনি জানেন না কী encrypted।
5. **control-plane HA উপেক্ষা করা।** Istiod cert rotation-এর জন্য একটা SPOF। zone জুড়ে একাধিক replica চালান।
6. **VirtualService-কে immutable হিসেবে treat করা।** Route change-এর যেকোনো deploy-এর মতো canary + monitoring লাগে।

## Tools tier list

```
Tier S (cold)
  istioctl / linkerd CLI / cilium CLI, kubectl + access to sidecar logs

Tier A (worth a week)
  Argo Rollouts + mesh integration (auto-canary)
  Kiali (Istio service graph), Linkerd dashboard
  GoldPinger (mesh-level synthetic checks)

Tier B
  Custom EnvoyFilter (you're going off-paved-road)
  WASM filters in Envoy (powerful, niche)
  SPIRE / SPIFFE for cross-cluster identity

Tier F
  Mesh in front of Kafka/queues. Wrong layer.
  iptables hand-tuned to "fix" sidecar redirection. You'll regret it.
```

## আপডেটেড থাকুন

- [Istio docs](https://istio.io/latest/docs/) — sidecar + ambient mode reference
- [Linkerd docs](https://linkerd.io/2/overview/) — Rust-ভিত্তিক, সহজ বিকল্প
- [Cilium service mesh](https://docs.cilium.io/en/stable/network/servicemesh/) — eBPF-native mesh
- [Envoy docs](https://www.envoyproxy.io/docs/envoy/latest/) — বেশিরভাগ mesh-এর নিচের data plane

## মূল শিক্ষা

1. **একটা mesh হলো payback সহ একটা tax** — cross-cutting library খরচ প্রধান হলে adopt করুন।
2. **Envoy + xDS হলো Istio, Cilium, Consul Connect-এর underlying data model।** একবার শিখুন।
3. **Ambient / eBPF mesh স্কেলে ভবিষ্যৎ** — 10k pod-এর পর sidecar overhead নিষ্ঠুর হয়ে যায়।
4. **mTLS + workload identity-ভিত্তিক authz** হলো যা একটা mesh-কে কৌশলগতভাবে মূল্যবান করে।
5. **Retry budget, multiplicative retry নয়** — retry করার জন্য একটা layer বাছুন।
6. **Mesh failure mode যোগ করে** — control plane HA, cert TTL, sidecar OOM এখন আপনার সমস্যা।
