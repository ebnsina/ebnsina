---
title: 'k3s on Your Own VPS'
subtitle: 'bare metal-এর উপর একটা production-grade Kubernetes ক্লাস্টার — k3s সেটআপ, node joining, persistent storage, এবং cost-conscious টিমের জন্য managed Kubernetes-এর চেয়ে k3s কেন এগিয়ে।'
chapter: 2
level: 'intermediate'
readingTime: '11 মিনিট'
topics: ['k3s', 'VPS', 'bare metal', 'Hetzner', 'cluster setup', 'Longhorn', 'Traefik']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

## গল্পে বুঝি

ইবনে সিনার একটা বিশাল ভ্রাম্যমাণ সার্কাস দল। পুরো শো নামাতে লাগে বিশাল ক্রু, ডজনখানেক তাঁবু, ভারী রিগিং, হাতি-ঘোড়ার খাঁচা আর মালপত্র টানার লম্বা ট্রাকের বহর। বড় শহরের খোলা মাঠে এটা দিব্যি জমে। কিন্তু একদিন পাশের ছোট গ্রাম থেকে দাওয়াত এলো — সেখানকার মেলার মাঠটুকু এত ছোট যে গোটা বহর ঢোকানোই অসম্ভব, আর এত ক্রু-র থাকা-খাওয়ার খরচও মেলা কমিটির সাধ্যের বাইরে।

তখন আল-খোয়ারিজমি বুদ্ধি বের করলেন — গোটা শো-টাই এক তাঁবুর ছোট সংস্করণে নামিয়ে আনলেন। জাগলিং, ট্র্যাপিজ, জোকার, ম্যাজিক — দর্শক যা দেখতে আসে, মূল খেলাগুলো সব একই থাকল; শুধু ভারী ডেকরেশন আর বাড়তি লোকলস্কর বাদ। ফাতিমা আল-ফিহরি মাত্র কয়েকজন পারফরমার আর একটা তাঁবু নিয়েই গ্রামের ছোট মাঠে হুবহু একই মেজাজের শো নামিয়ে দিলেন — দর্শক টেরই পেল না যে এটা "ছোট" সংস্করণ।

এই এক-তাঁবুর সার্কাসটাই আসলে **k3s**। গোটা গ্র্যান্ড সার্কাস মানে full **Kubernetes** — যার ভারী control plane চালাতে অনেক রিসোর্স আর ওভারহেড লাগে। এক-তাঁবুর একই শো মানে k3s — একই core Kubernetes, শুধু কাটছাঁট করে **lightweight** বানানো, তাই সব `kubectl` কমান্ড আর manifest হুবহু একইভাবে কাজ করে। আর গ্রামের ছোট মেলার মাঠটাই হলো একটা ছোট single **VPS** বা **edge** হার্ডওয়্যার — যেখানে full Kubernetes আঁটে না, সেখানেও k3s দিব্যি চলে। বাস্তবে Raspberry Pi-র ছোট cluster থেকে শুরু করে দূরের IoT/edge সাইট বা €4.5/month-এর একটা Hetzner VPS — এই সব জায়গাতেই টিমরা এই একই কারণে full k8s-এর বদলে k3s বেছে নেয়।

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

ভাড়া নেওয়া বনাম মালিকানা: EKS-এর শুধু control plane-এর জন্যই খরচ $0.10/hour (~$72/month), একটা node যোগ হওয়ার আগেই। একটা Hetzner CX21 (2 vCPU, 4GB RAM) খরচ €4.5/month। এর তিনটা মেশিনে k3s চালালে আপনি EKS-এর শুধু control plane ফি-র চেয়েও কম খরচে একটা production Kubernetes ক্লাস্টার পান। হার্ডওয়্যারের বিলটা আপনার; বিনিময়ে operation-ও আপনার ঘাড়ে।

</Callout>

## Why k3s

k3s হলো Rancher-এর তৈরি একটা lightweight Kubernetes distribution। পুরো control plane একটা single binary হিসেবে চলে (~70MB)। এটা alpha feature বাদ দেয়, default-এ etcd-র বদলে SQLite ব্যবহার করে (production-এ PostgreSQL), এবং ingress controller হিসেবে Traefik বান্ডল করে দেয়।

full Kubernetes-এর তুলনায়:

- একই API surface — সব `kubectl` কমান্ড কাজ করে
- একই YAML manifest — কোনো পরিবর্তন লাগে না
- Embedded etcd বা external PostgreSQL — আলাদা কোনো etcd ক্লাস্টার চালাতে হয় না
- server node-এর জন্য 512MB RAM (full k8s-এ যেখানে 2GB+)

## Cluster Architecture

```
                    ┌─────────────────────────────────┐
Internet ──── LB ──→│  server-1 (control plane + worker)│
                    │  server-2 (control plane + worker)│
                    │  server-3 (control plane + worker)│
                    └─────────────────────────────────┘
                    (or: 1 control-plane + N worker nodes)
```

ছোট ক্লাস্টারের জন্য (&lt; 20 nodes), control plane-কে worker node-এর উপরই চালান — কম মেশিন, ৩টা node দিয়েই একই HA। বড় ক্লাস্টারের জন্য control plane node আলাদা করে দিন।

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

৩টা server node থাকলে আপনার একটা HA control plane হয়ে গেল। Embedded etcd একটা node ফেইল সহ্য করতে পারে।

## Joining Worker Nodes

```bash
# On worker nodes (agent only — no control plane)
export K3S_TOKEN="your-shared-secret"
export K3S_URL="https://10.0.0.1:6443"

curl -sfL https://get.k3s.io | K3S_URL=$K3S_URL K3S_TOKEN=$K3S_TOKEN sh -
```

Worker-রা workload চালায় কিন্তু etcd বা API serving-এ অংশ নেয় না।

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

k3s Traefik বান্ডল করে। এর বদলে nginx চাইলে (আরও পরিচিত config):

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

আপনার external load balancer (বা VPS-এর HAProxy)-কে সব node-এর 30080/30443 port-এর দিকে point করান।

## Persistent Storage with Longhorn

k3s-এ persistent storage থাকে না। Longhorn replicated block storage দেয়:

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

Longhorn প্রতিটা volume ২টা node-এ replicate করে। একটা node ফেইল করলে replica-টা promote হয় এবং আরেকটা node-এ নতুন একটা বানানো হয়।

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

সার্টিফিকেট অটোমেটিক provision আর renew হয়। Ingress resource-এ `cert-manager.io/cluster-issuer: letsencrypt-prod` annotation যোগ করুন।

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

k3s-এর embedded etcd-ই হলো source of truth। এটা ব্যাকআপ করুন:

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

একটা cron job দিয়ে অটোমেট করুন:

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

বিনিময়ে: control plane-টা আপনাকে চালাতে হয়। k3s দিয়ে সেটা হলো: node join করতে একটা কমান্ড, backup-এর জন্য একটা snapshot কমান্ড, k3s আপগ্রেড করতে `apt upgrade` + `curl | sh`। একটা ৩-node ক্লাস্টারের জন্য: মাসে ৩০ মিনিটের maintenance।
