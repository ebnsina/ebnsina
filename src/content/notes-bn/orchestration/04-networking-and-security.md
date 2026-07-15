---
title: 'Kubernetes Networking & Security'
subtitle: 'NetworkPolicies, RBAC, Pod Security Standards, Secrets management, এবং যে default-deny posture ক্লাস্টারকে hardened রাখে।'
chapter: 4
level: 'intermediate'
readingTime: '10 মিনিট'
topics: ['NetworkPolicy', 'RBAC', 'Pod Security', 'Secrets', 'mTLS', 'Kubernetes security']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ফাতিমা আল-ফিহরি একটা বিশাল দেয়ালঘেরা ক্যাম্পাসের ব্যবস্থাপক। ভেতরে অনেকগুলো বিল্ডিং — গবেষণাগার, লাইব্রেরি, হিসাবরক্ষণ। এক বিভাগ যখন অন্য বিভাগের কারো কাছে পৌঁছাতে চায়, তখন কে কোন ঘরে বসে সেটা মুখস্থ করতে হয় না — একটা অভ্যন্তরীণ ফোন ডিরেক্টরি আছে, শুধু বিভাগের নাম বললেই কল কানেক্ট হয়ে যায়। লোকজন ডেস্ক বদলালেও, নতুন কেউ যোগ দিলেও, নামটা এক থাকে বলে যোগাযোগ কখনো ভাঙে না। আর বাইরে থেকে যে অতিথিরা আসে, তারা সবাই ঢোকে একটাই মূল ফটক দিয়ে — সেখানে বসা রিসেপশনিস্ট আল-খোয়ারিজমি প্রত্যেক অতিথিকে জিজ্ঞেস করেন কোন বিল্ডিং খুঁজছেন, নাম শুনে তবেই সঠিক দিকে পাঠান।

কিন্তু ভেতরে ঢুকলেই সব দরজা খোলা নয়। দেয়ালে সাঁটা নিয়ম বলে দেয় কোন বিল্ডিং কোন বিল্ডিংয়ে লোক পাঠাতে পারবে — হিসাবরক্ষণ থেকে লাইব্রেরিতে যাওয়া যায়, কিন্তু গবেষণাগারে ঢোকা বারণ। আর প্রত্যেকের গলায় ঝোলানো একটা রঙিন ব্যাজ, যা ঠিক করে দেয় সে কোন কোন ঘরে ঢুকতে পারবে আর সেখানে কী করতে পারবে — ইবনে সিনার নীল ব্যাজে শুধু আর্কাইভ পড়ার অনুমতি, ফাইল বদলানোর নয়।

এই গল্পটাই আসলে Kubernetes-এর নেটওয়ার্কিং আর সিকিউরিটি। অভ্যন্তরীণ ফোন ডিরেক্টরি — যেখানে নাম দিয়ে ডাকলেই পৌঁছে যায়, ডেস্ক বদলালেও নয় — হলো **Service** আর তার স্থায়ী internal **DNS** নাম। মূল ফটকের রিসেপশনিস্ট যিনি অতিথির চাওয়া নাম শুনে সঠিক বিল্ডিংয়ে পাঠান, তিনি **Ingress** (host/path দেখে বাইরের traffic কে ভেতরের Service-এ রুট করা)। দেয়ালে সাঁটা "কে কার কাছে যেতে পারবে" নিয়ম হলো **NetworkPolicy** (pod-to-pod traffic নিয়ন্ত্রণ), আর রঙিন ব্যাজ যা প্রতিটা ভূমিকাকে শুধু নির্দিষ্ট ঘর ও কাজের অনুমতি দেয় সেটা **RBAC** (কে কোন resource-এ কী করতে পারবে)। বাস্তবে ঠিক এভাবেই একটা hardened ক্লাস্টার চলে — Service নাম দিয়ে খুঁজে পাওয়া যায়, Ingress বাইরের request রুট করে, NetworkPolicy default-deny posture বজায় রাখে, আর RBAC least-privilege নিশ্চিত করে।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা সিকিউর অফিস বিল্ডিং: প্রতিটা কর্মীর একটা ব্যাজ আছে (RBAC — কে কী করতে পারবে সেটা নিয়ন্ত্রণ করে), ফ্লোরগুলোর access zone আছে (NetworkPolicies — কোন pod কোন pod-এর সাথে কথা বলতে পারবে সেটা নিয়ন্ত্রণ করে), সংবেদনশীল ফাইল নির্দিষ্ট ক্যাবিনেটে তালাবদ্ধ (Secrets management), এবং বিল্ডিংয়ে এমন সিকিউরিটি পলিসি আছে যা সবার জন্য প্রযোজ্য (Pod Security Standards — কেউ মেটাল ডিটেক্টর এড়িয়ে যেতে পারে না)।

</Callout>

## NetworkPolicies

default-এ, ক্লাস্টারের সব pod অন্য সব pod-এর সাথে যোগাযোগ করতে পারে। NetworkPolicy এটা সীমিত করে।

**একটা namespace-এর জন্য default-deny:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {} # applies to all pods
  policyTypes:
    - Ingress
    - Egress
```

এখন `production`-এর কোনো pod কোনো traffic গ্রহণ বা পাঠাতে পারবে না। যা দরকার তা allow করতে policy যোগ করুন।

**নির্দিষ্ট ingress allow করা:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-order-service-ingress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: order-service
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway # only from the gateway
        - namespaceSelector:
            matchLabels:
              name: monitoring # and from the monitoring namespace (Prometheus scrape)
      ports:
        - protocol: TCP
          port: 3000
```

**নির্দিষ্ট service-এ egress allow করা:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: order-service-egress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: order-service
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
    - to: # allow DNS
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
```

NetworkPolicy CNI plugin দিয়ে enforce হয় (একা Flannel এগুলো সাপোর্ট করে না — Calico বা Cilium ব্যবহার করুন)।

```bash
# Install Cilium as CNI (supports NetworkPolicies and more)
helm repo add cilium https://helm.cilium.io/
helm install cilium cilium/cilium \
  --namespace kube-system \
  --set kubeProxyReplacement=strict
```

## RBAC

Kubernetes RBAC নিয়ন্ত্রণ করে কে কোন resource-এ কী করতে পারবে।

**তিনটা object:**

- **Role/ClusterRole** — permission সংজ্ঞায়িত করে (কোন resource-এ কোন verb)
- **ServiceAccount** — একটা pod-এর identity
- **RoleBinding/ClusterRoleBinding** — একটা Role-কে একটা ServiceAccount-এর (বা user-এর) সাথে bind করে

```yaml
# ServiceAccount for order-service
apiVersion: v1
kind: ServiceAccount
metadata:
  name: order-service
  namespace: production
```

```yaml
# Role: what order-service is allowed to do
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: order-service-role
  namespace: production
rules:
  - apiGroups: ['']
    resources: ['secrets']
    verbs: ['get'] # can only read secrets, not list/create/delete
    resourceNames: ['order-service-secrets'] # only this specific secret
  - apiGroups: ['']
    resources: ['configmaps']
    verbs: ['get', 'list', 'watch']
```

```yaml
# Bind the role to the service account
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: order-service-rolebinding
  namespace: production
subjects:
  - kind: ServiceAccount
    name: order-service
    namespace: production
roleRef:
  kind: Role
  name: order-service-role
  apiGroup: rbac.authorization.k8s.io
```

```yaml
# Tell the Deployment to use this ServiceAccount
spec:
  template:
    spec:
      serviceAccountName: order-service
```

**Principle of least privilege:** প্রতিটা service account শুধু সেই permission পায় যা তার আসলেই দরকার।

**মানুষের জন্য (kubectl access):**

```yaml
# Grant a developer read-only access to production
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: developer-readonly
subjects:
  - kind: User
    name: 'layla@example.com'
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: view # built-in: read-only for most resources
  apiGroup: rbac.authorization.k8s.io
```

```bash
# Check what a service account can do
kubectl auth can-i get secrets --as=system:serviceaccount:production:order-service -n production

# Check your own permissions
kubectl auth can-i --list -n production
```

## Pod Security Standards

Kubernetes-এ তিনটা built-in security profile আছে:

- **Privileged** — unrestricted (workload-এর জন্য ব্যবহার করবেন না)
- **Baseline** — পরিচিত privilege escalation ঠেকায়
- **Restricted** — hardened, security best practice অনুসরণ করে

namespace level-এ apply করুন:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/audit: restricted
```

`restricted`-এর ক্ষেত্রে, pod-কে অবশ্যই:

- non-root হিসেবে চলতে হবে
- `securityContext.runAsNonRoot: true` ব্যবহার করতে হবে
- `allowPrivilegeEscalation: false` সেট করতে হবে
- `ALL` capability drop করতে হবে
- `seccompProfile.type: RuntimeDefault` বা `Localhost` ব্যবহার করতে হবে

```yaml
spec:
  containers:
    - name: order-service
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ['ALL']
        seccompProfile:
          type: RuntimeDefault
      volumeMounts:
        - name: tmp
          mountPath: /tmp # writable tmp since root is read-only
  volumes:
    - name: tmp
      emptyDir: {}
```

## Secrets Management

Kubernetes Secret base64-encoded, encrypted নয়। Secret-এ RBAC access আছে এমন যে কেউ সেগুলো পড়তে পারে। এভাবে harden করুন:

**Encryption at rest:**

```yaml
# Enable in kube-apiserver config
--encryption-provider-config=/etc/kubernetes/encryption-config.yaml
```

```yaml
# encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <base64-encoded-32-byte-key>
      - identity: {}
```

**External Secrets Operator (preferred):**

AWS Secrets Manager, HashiCorp Vault, বা GCP Secret Manager থেকে secret sync করে Kubernetes Secret-এ নিয়ে আসে।

```yaml
# ExternalSecret — pulls from AWS Secrets Manager
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: order-service-secrets
  namespace: production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: order-service-secrets # creates/updates this K8s Secret
  data:
    - secretKey: database_url
      remoteRef:
        key: production/order-service
        property: database_url
    - secretKey: jwt_secret
      remoteRef:
        key: production/order-service
        property: jwt_secret
```

secret-টা থাকে AWS Secrets Manager-এ; Kubernetes-এ একটা কপি থাকে যা sync-এ রাখা হয়। AWS-এ rotation করলে সেটা অটোমেটিক pod পর্যন্ত propagate হয়।

**Sealed Secrets (git-safe):**

secret-কে cluster-specific key দিয়ে encrypt করুন যাতে সেগুলো git-এ commit করা যায়:

```bash
# Install Sealed Secrets controller
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Encrypt a secret
kubectl create secret generic order-service-secrets \
  --from-literal=database_url='postgres://...' \
  --dry-run=client -o yaml | \
  kubeseal --format yaml > sealed-secret.yaml

# Commit sealed-secret.yaml to git — safe to store
git add sealed-secret.yaml
git commit -m "add order-service sealed secrets"
```

controller ক্লাস্টারের উপর decrypt করে; encrypted রূপটা ক্লাস্টারের বাইরে কোনো কাজেরই নয়।

## mTLS with Cilium or Istio

zero-trust networking-এর জন্য — প্রতিটা service-to-service কল mutually authenticated আর encrypted:

**Cilium (simpler):**

```yaml
# Enable mTLS for the namespace
apiVersion: cilium.io/v2alpha1
kind: CiliumNetworkPolicy
metadata:
  name: mtls-policy
  namespace: production
spec:
  endpointSelector: {}
  ingress:
    - fromEndpoints:
        - matchLabels:
            io.cilium.k8s.policy.serviceaccount: order-service
      toPorts:
        - ports:
            - port: '3000'
          rules:
            l7proto: http
```

**Istio (comprehensive):**

```yaml
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT # all traffic must use mTLS
```

STRICT mode-এ mTLS থাকলে, কোনো unencrypted বা unauthenticated traffic গ্রহণ করা হয় না। Service-রা Istio-র CA দিয়ে ম্যানেজ করা সার্টিফিকেটের মাধ্যমে নিজেদের identity প্রমাণ করে। কোনো application code পরিবর্তন লাগে না — Envoy sidecar-ই সেটা সামলায়।
