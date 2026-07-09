---
title: 'Orchestration — রোডম্যাপ'
subtitle: 'নিজের VPS ফ্লিটজুড়ে একটা k3s ক্লাস্টার চালান। EKS নয়, GKE নয় — আপনার নিজের হার্ডওয়্যার।'
chapter: 0
level: 'beginner'
readingTime: '3 মিনিট'
topics: ['roadmap']
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**বাস্তব জীবনের উদাহরণ**

একটা সেল্‌ফ-কারেক্টিং ফ্যাক্টরি ফ্লোর: আপনি ম্যানেজারকে বলে দেন কতগুলো মেশিন চালু থাকা দরকার, বাকিটা ম্যানেজার সামলায় — ফেইল হওয়া মেশিন রিস্টার্ট করা, ফ্লোরজুড়ে কাজ ভাগ করে দেওয়া, ডিমান্ড বাড়লে স্কেল আপ করা। Kubernetes হলো সেই ম্যানেজার। k3s একই ম্যানেজার, তবে সেই টিমগুলোর জন্য প্যাকেজ করা যারা অন্যের জায়গা ভাড়া না নিয়ে নিজেদের ফ্যাক্টরি ফ্লোরের মালিক।

</Callout>

## যা যা শিখবেন

Container orchestration workload কোথায় চলবে আর ফেইল করলে কী করতে হবে — এই ম্যানুয়াল সিদ্ধান্তের বোঝা সরিয়ে দেয়। এই ট্র্যাকে Kubernetes-কে একদম গোড়া থেকে কভার করা হয়েছে — control loop, core workload object, তারপর নিজের VPS ফ্লিটে k3s চালানোর নির্দিষ্ট খুঁটিনাটি (EKS-এর চেয়ে সস্তা, পুরোপুরি আপনার নিয়ন্ত্রণে)। এরপর: workload type (StatefulSets, DaemonSets, Jobs), network policy আর RBAC, এবং ArgoCD দিয়ে GitOps ও Argo Rollouts দিয়ে progressive delivery।

## এই ট্র্যাকের চ্যাপ্টারগুলো

1. **Kubernetes Fundamentals** — pods, deployments, services, labels, control loop
2. **k3s on Your Own VPS** — ক্লাস্টার সেটআপ, node joining, Longhorn storage, cert-manager
3. **Workloads** — StatefulSets, DaemonSets, Jobs, CronJobs, HPA, init containers
4. **Networking & Security** — NetworkPolicies, RBAC, Pod Security Standards, Secrets, mTLS
5. **GitOps & Deployments** — ArgoCD, Helm, Argo Rollouts, Prometheus analysis দিয়ে canary
