---
title: "Orchestration — Roadmap"
subtitle: "Run a k3s cluster across your own VPS fleet. Not EKS, not GKE — your hardware."
chapter: 0
level: "beginner"
readingTime: "3 min"
topics: ["roadmap"]
---

<script>
	import Callout from '$lib/components/content/Callout.svelte';
</script>

<Callout type="info">

**Real-World Analogy**

A self-correcting factory floor: you tell the manager how many machines you need running, and the manager handles the rest — restarting failed machines, distributing work across the floor, scaling up when demand rises. Kubernetes is that manager. k3s is the same manager, packaged for teams who own their own factory floor instead of renting space in someone else's.

</Callout>

## What you will learn

Container orchestration removes the burden of manually deciding where workloads run and what to do when they fail. This track covers Kubernetes from first principles — the control loop, the core workload objects, and then the specifics of running k3s on your own VPS fleet (cheaper than EKS, fully under your control). Then: workload types (StatefulSets, DaemonSets, Jobs), network policies and RBAC, and GitOps with ArgoCD and progressive delivery with Argo Rollouts.

## Chapters in this track

1. **Kubernetes Fundamentals** — pods, deployments, services, labels, the control loop
2. **k3s on Your Own VPS** — cluster setup, node joining, Longhorn storage, cert-manager
3. **Workloads** — StatefulSets, DaemonSets, Jobs, CronJobs, HPA, init containers
4. **Networking & Security** — NetworkPolicies, RBAC, Pod Security Standards, Secrets, mTLS
5. **GitOps & Deployments** — ArgoCD, Helm, Argo Rollouts, canary with Prometheus analysis

