---
title: "Kubernetes Networking & Security"
subtitle: "NetworkPolicies, RBAC, Pod Security Standards, Secrets management, and the default-deny posture that keeps clusters hardened."
chapter: 4
level: "intermediate"
readingTime: "10 min"
topics: ["NetworkPolicy", "RBAC", "Pod Security", "Secrets", "mTLS", "Kubernetes security"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A secure office building: every employee has a badge (RBAC — controls who can do what), floors have access zones (NetworkPolicies — controls which pods can talk to which), sensitive files are locked in specific cabinets (Secrets management), and the building has security policies that apply to everyone (Pod Security Standards — no one bypasses the metal detector).

</Callout>

## NetworkPolicies

By default, all pods can communicate with all other pods in the cluster. NetworkPolicies restrict this.

**Default-deny for a namespace:**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}          # applies to all pods
  policyTypes:
    - Ingress
    - Egress
```

Now no pod in `production` can receive or send any traffic. Add policies to allow what's needed.

**Allow specific ingress:**
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
              app: api-gateway    # only from the gateway
        - namespaceSelector:
            matchLabels:
              name: monitoring    # and from the monitoring namespace (Prometheus scrape)
      ports:
        - protocol: TCP
          port: 3000
```

**Allow egress to specific services:**
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
    - to:                   # allow DNS
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
```

NetworkPolicies are enforced by the CNI plugin (Flannel alone doesn't support them — use Calico or Cilium).

```bash
# Install Cilium as CNI (supports NetworkPolicies and more)
helm repo add cilium https://helm.cilium.io/
helm install cilium cilium/cilium \
  --namespace kube-system \
  --set kubeProxyReplacement=strict
```

## RBAC

Kubernetes RBAC controls who can do what to which resources.

**Three objects:**
- **Role/ClusterRole** — defines permissions (what verbs on what resources)
- **ServiceAccount** — identity for a pod
- **RoleBinding/ClusterRoleBinding** — binds a Role to a ServiceAccount (or user)

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
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get"]            # can only read secrets, not list/create/delete
    resourceNames: ["order-service-secrets"]   # only this specific secret
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch"]
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

**Principle of least privilege:** each service account only has the permissions it actually needs.

**For humans (kubectl access):**
```yaml
# Grant a developer read-only access to production
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: developer-readonly
subjects:
  - kind: User
    name: "jane@example.com"
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: view              # built-in: read-only for most resources
  apiGroup: rbac.authorization.k8s.io
```

```bash
# Check what a service account can do
kubectl auth can-i get secrets --as=system:serviceaccount:production:order-service -n production

# Check your own permissions
kubectl auth can-i --list -n production
```

## Pod Security Standards

Kubernetes has three built-in security profiles:

- **Privileged** — unrestricted (don't use for workloads)
- **Baseline** — prevents known privilege escalations
- **Restricted** — hardened, follows security best practices

Apply at the namespace level:
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

With `restricted`, pods must:
- Run as non-root
- Use `securityContext.runAsNonRoot: true`
- Set `allowPrivilegeEscalation: false`
- Drop `ALL` capabilities
- Use `seccompProfile.type: RuntimeDefault` or `Localhost`

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
          drop: ["ALL"]
        seccompProfile:
          type: RuntimeDefault
      volumeMounts:
        - name: tmp
          mountPath: /tmp         # writable tmp since root is read-only
  volumes:
    - name: tmp
      emptyDir: {}
```

## Secrets Management

Kubernetes Secrets are base64-encoded, not encrypted. Anyone with RBAC access to Secrets can read them. Harden with:

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

Syncs secrets from AWS Secrets Manager, HashiCorp Vault, or GCP Secret Manager into Kubernetes Secrets.

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
    name: order-service-secrets    # creates/updates this K8s Secret
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

The secret lives in AWS Secrets Manager; Kubernetes has a copy that's kept in sync. Rotation in AWS propagates to pods automatically.

**Sealed Secrets (git-safe):**

Encrypt secrets with a cluster-specific key so they can be committed to git:

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

The controller decrypts on the cluster; the encrypted form is useless outside the cluster.

## mTLS with Cilium or Istio

For zero-trust networking — every service-to-service call is mutually authenticated and encrypted:

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
            - port: "3000"
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
    mode: STRICT    # all traffic must use mTLS
```

With mTLS in STRICT mode, no unencrypted or unauthenticated traffic is accepted. Services prove their identity via certificates managed by Istio's CA. No application code changes needed — the Envoy sidecar handles it.

