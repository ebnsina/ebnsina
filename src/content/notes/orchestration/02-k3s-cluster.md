---
title: 'k3s on Your Own VPS'
subtitle: 'A production-grade Kubernetes cluster on bare metal — k3s setup, node joining, persistent storage, and why k3s beats managed Kubernetes for cost-conscious teams.'
chapter: 2
level: 'intermediate'
readingTime: '11 min'
topics: ['k3s', 'VPS', 'bare metal', 'Hetzner', 'cluster setup', 'Longhorn', 'Traefik']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

Renting vs owning: EKS costs $0.10/hour just for the control plane (~$72/month) before a single node. A Hetzner CX21 (2 vCPU, 4GB RAM) costs €4.5/month. Three of them with k3s gives you a production Kubernetes cluster for less than the EKS control plane fee alone. You own the hardware bill; the trade-off is that you own the operations too.

</Callout>

## Why k3s

k3s is a lightweight Kubernetes distribution by Rancher. The entire control plane runs as a single binary (~70MB). It removes alpha features, uses SQLite instead of etcd by default (PostgreSQL for production), and bundles Traefik as an ingress controller.

Compared to full Kubernetes:

- Same API surface — all `kubectl` commands work
- Same YAML manifests — no changes needed
- Embedded etcd or external PostgreSQL — no separate etcd cluster to operate
- 512MB RAM for the server node (vs 2GB+ for full k8s)

## Cluster Architecture

```
                    ┌─────────────────────────────────┐
Internet ──── LB ──→│  server-1 (control plane + worker)│
                    │  server-2 (control plane + worker)│
                    │  server-3 (control plane + worker)│
                    └─────────────────────────────────┘
                    (or: 1 control-plane + N worker nodes)
```

For small clusters (&lt; 20 nodes), run the control plane on worker nodes — fewer machines, same HA with 3 nodes. For larger clusters, dedicate control plane nodes.

## Server Preparation

```bash
# On each node (Ubuntu 22.04)
# Disable swap (Kubernetes requirement)
swapoff -a
sed -i '/swap/d' /etc/fstab

# Enable IP forwarding
cat >> /etc/sysctl.d/k3s.conf <<EOF
net.ipv4.ip_forward=1
net.bridge.bridge-nf-call-iptables=1
net.bridge.bridge-nf-call-ip6tables=1
EOF
sysctl --system

# Firewall: open required ports
ufw allow 6443/tcp    # Kubernetes API
ufw allow 2379/tcp    # etcd client (embedded)
ufw allow 2380/tcp    # etcd peer
ufw allow 10250/tcp   # kubelet
ufw allow 51820/udp   # Flannel VXLAN (or WireGuard)
```

## Installing the First Server Node

```bash
# On server-1
export K3S_TOKEN="your-shared-secret"   # same on all nodes

curl -sfL https://get.k3s.io | sh -s - server \
  --cluster-init \                        # start embedded etcd cluster
  --tls-san "lb.example.com" \            # add LB hostname to TLS cert
  --tls-san "10.0.0.1" \                  # and LB IP
  --disable traefik \                     # we'll install ingress-nginx instead
  --disable servicelb \                   # disable built-in LB (using MetalLB or cloud LB)
  --flannel-backend=wireguard-native \    # encrypted pod network
  --write-kubeconfig-mode 644

# Get the node token for joining
cat /var/lib/rancher/k3s/server/node-token
```

## Joining Additional Server Nodes

```bash
# On server-2 and server-3
export K3S_TOKEN="your-shared-secret"
export K3S_URL="https://10.0.0.1:6443"   # server-1's private IP

curl -sfL https://get.k3s.io | sh -s - server \
  --server $K3S_URL \
  --tls-san "lb.example.com" \
  --disable traefik \
  --disable servicelb \
  --flannel-backend=wireguard-native
```

With 3 server nodes, you have an HA control plane. The embedded etcd tolerates 1 node failure.

## Joining Worker Nodes

```bash
# On worker nodes (agent only — no control plane)
export K3S_TOKEN="your-shared-secret"
export K3S_URL="https://10.0.0.1:6443"

curl -sfL https://get.k3s.io | K3S_URL=$K3S_URL K3S_TOKEN=$K3S_TOKEN sh -
```

Workers run workloads but don't participate in etcd or API serving.

## Configuring kubectl

```bash
# On your local machine
scp root@server-1:/etc/rancher/k3s/k3s.yaml ~/.kube/k3s.yaml

# Update the server address to your LB
sed -i 's/127.0.0.1/lb.example.com/g' ~/.kube/k3s.yaml

export KUBECONFIG=~/.kube/k3s.yaml
kubectl get nodes
# NAME       STATUS   ROLES                       AGE
# server-1   Ready    control-plane,etcd,master   5m
# server-2   Ready    control-plane,etcd,master   3m
# server-3   Ready    control-plane,etcd,master   2m
```

## Installing ingress-nginx

k3s bundles Traefik. If you want nginx instead (more familiar config):

```bash
# Disable Traefik in k3s (done during install with --disable traefik)
# Install ingress-nginx via Helm
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080 \
  --set controller.service.nodePorts.https=30443 \
  --set controller.replicaCount=2
```

Point your external load balancer (or HAProxy on the VPS) to port 30080/30443 on all nodes.

## Persistent Storage with Longhorn

k3s doesn't include persistent storage. Longhorn provides replicated block storage:

```bash
# Prerequisites
apt install open-iscsi nfs-common -y
systemctl enable --now iscsid

# Install Longhorn
helm repo add longhorn https://charts.longhorn.io
helm repo update

helm install longhorn longhorn/longhorn \
  --namespace longhorn-system \
  --create-namespace \
  --set defaultSettings.defaultReplicaCount=2   # 2 replicas per volume
```

```yaml
# StorageClass — use Longhorn for persistent volumes
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: longhorn
  annotations:
    storageclass.kubernetes.io/is-default-class: 'true'
provisioner: driver.longhorn.io
parameters:
  numberOfReplicas: '2'
  staleReplicaTimeout: '2880'
reclaimPolicy: Retain # don't delete data when PVC is deleted
```

```yaml
# PersistentVolumeClaim
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
  namespace: production
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: longhorn
  resources:
    requests:
      storage: 20Gi
```

Longhorn replicates each volume across 2 nodes. If a node fails, the replica is promoted and a new one built on another node.

## cert-manager for TLS

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true
```

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

Certificates are provisioned and renewed automatically. Add `cert-manager.io/cluster-issuer: letsencrypt-prod` annotation to Ingress resources.

## Node Maintenance

```bash
# Drain a node before maintenance (reschedule pods)
kubectl drain server-2 --ignore-daemonsets --delete-emptydir-data

# Do maintenance on server-2...

# Bring back into rotation
kubectl uncordon server-2

# Upgrade k3s on a node
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION="v1.29.0+k3s1" sh -
# Drain first, upgrade, uncordon
```

## Backup

k3s's embedded etcd is the source of truth. Back it up:

```bash
# Manual snapshot
k3s etcd-snapshot save --name pre-upgrade-snapshot

# List snapshots
k3s etcd-snapshot ls

# Restore (stops k3s, restores, restarts)
k3s etcd-snapshot restore \
  --name pre-upgrade-snapshot \
  --cluster-reset \
  --cluster-reset-restore-path /var/lib/rancher/k3s/server/db/snapshots/pre-upgrade-snapshot
```

Automate with a cron job:

```bash
# /etc/cron.d/k3s-backup
0 2 * * * root k3s etcd-snapshot save && \
  aws s3 cp /var/lib/rancher/k3s/server/db/snapshots/ s3://my-k3s-backups/ --recursive
```

## Cost Comparison

```
EKS (1 control plane + 3 t3.medium nodes):
  Control plane:    $72/mo
  3× t3.medium:    $96/mo
  Total:           ~$168/mo

k3s on Hetzner (3× CX31: 2 vCPU, 8GB RAM):
  3× CX31:         €29/mo
  Load balancer:   €6/mo
  Total:           ~$38/mo

Savings: ~$130/mo ($1,560/yr) for equivalent capacity
```

The trade-off: you operate the control plane. With k3s that's: one command to join nodes, one snapshot command for backup, `apt upgrade` + `curl | sh` to upgrade k3s. For a 3-node cluster: 30 minutes/month of maintenance.
